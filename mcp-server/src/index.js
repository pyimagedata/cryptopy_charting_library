import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ChartBridge } from './chart-bridge.js';
import {
    writeDraftIndicator,
    readDraftIndicator,
    deleteDraftIndicator,
    listDraftIndicators,
    readIndicatorSource,
    listIndicatorSources,
    copyIndicatorToDraft,
    compileDraftIndicator,
} from './draft-indicators.js';

const MCP_PORT = Number(process.env.MCP_PORT || 8766);
const BEARER_TOKEN = process.env.MCP_BEARER_TOKEN;
if (!BEARER_TOKEN) {
    console.error('[ai-charts-mcp] MCP_BEARER_TOKEN is not set — refusing to start without auth.');
    process.exit(1);
}

// One ChartBridge shared across every MCP session (see bottom of file for
// construction, once the underlying http.Server exists) — chart-tab
// connections are tracked independently of how many AI hosts are attached.
let bridge;

// A fresh McpServer per Streamable HTTP session, per the SDK's own
// simpleStreamableHttp.js example. All tool handlers below close over the
// single shared `bridge`, not session state, so re-registering them per
// session is cheap and side-effect-free.
function getServer() {
    const server = new McpServer({
        name: 'ai-charts',
        version: '0.1.0',
    });

// All coordinates are symbolic: barIndex refers to a candle's position in the
// currently loaded, ascending-time array on the active chart (0 = oldest bar
// visible in that array). Price is the raw instrument price. The chart-side
// bridge converts barIndex -> timestamp before drawing.

server.registerTool(
    'draw_rectangle',
    {
        title: 'Draw rectangle zone',
        description:
            'Draw a rectangle on the chart spanning a bar-index range and a price range. ' +
            'Use this to mark a zone such as an order block, an important trading zone, or a fair value gap.',
        inputSchema: {
            startBarIndex: z.number().int().describe('Bar index of the left edge (0 = oldest loaded bar)'),
            endBarIndex: z.number().int().describe('Bar index of the right edge'),
            priceHigh: z.number().describe('Upper price boundary of the zone'),
            priceLow: z.number().describe('Lower price boundary of the zone'),
            label: z.string().optional().describe('Short label to render on the zone'),
            color: z.string().optional().describe('Border color, e.g. "#2962ff"'),
            fillColor: z.string().optional().describe('Fill color, e.g. "rgba(41,98,255,0.15)"'),
        },
    },
    async (args) => {
        const result = await bridge.call('draw_rectangle', args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'draw_trendline',
    {
        title: 'Draw trend line',
        description:
            'Draw a straight line between two (barIndex, price) points. ' +
            'Use this for trend lines, structure break levels, or connecting swing points.',
        inputSchema: {
            startBarIndex: z.number().int(),
            startPrice: z.number(),
            endBarIndex: z.number().int(),
            endPrice: z.number(),
            label: z.string().optional(),
            color: z.string().optional(),
            dashed: z.boolean().optional(),
        },
    },
    async (args) => {
        const result = await bridge.call('draw_trendline', args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'draw_polyline',
    {
        title: 'Draw polyline',
        description:
            'Draw a connected multi-point line/polygon across a list of (barIndex, price) points. ' +
            'Use this to outline irregular structures such as a multi-touch supply/demand zone.',
        inputSchema: {
            points: z
                .array(z.object({ barIndex: z.number().int(), price: z.number() }))
                .min(2)
                .describe('Ordered list of at least 2 points'),
            label: z.string().optional(),
            color: z.string().optional(),
            fillColor: z.string().optional(),
        },
    },
    async (args) => {
        const result = await bridge.call('draw_polyline', args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'draw_callout',
    {
        title: 'Draw callout / annotation',
        description:
            'Attach a text callout pointing at a specific (barIndex, price) location. ' +
            'Use this to explain the reasoning behind a marked structure directly on the chart.',
        inputSchema: {
            barIndex: z.number().int().describe('Bar index the callout points to'),
            price: z.number().describe('Price level the callout points to'),
            text: z.string().describe('Explanation text shown in the callout'),
            labelBarIndex: z.number().int().optional().describe('Bar index of the text box itself (defaults near the anchor)'),
            labelPrice: z.number().optional().describe('Price of the text box itself (defaults to the anchor price)'),
            color: z.string().optional(),
        },
    },
    async (args) => {
        const result = await bridge.call('draw_callout', args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'change_symbol',
    {
        title: 'Change chart symbol and/or timeframe',
        description:
            'Switch the active chart to a different symbol and/or timeframe, reloading candle data. ' +
            'Provide at least one of symbol or timeframe; the other stays unchanged. Call get_chart_context ' +
            'afterward to confirm the new data before drawing anything.',
        inputSchema: {
            symbol: z.string().optional().describe('New trading pair symbol, e.g. "ETHUSDT". Omit to keep the current symbol.'),
            timeframe: z.string().optional().describe('New timeframe/interval, e.g. "1m", "15m", "1h", "4h", "1d". Omit to keep the current timeframe.'),
            exchange: z.string().optional().describe('Optional exchange override, e.g. "BINANCE", "BYBIT", "OKX". Omit to keep the current exchange.'),
        },
    },
    async (args) => {
        const result = await bridge.call('change_symbol', args, 20000);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'list_available_drawing_types',
    {
        title: 'List available drawing types',
        description:
            'List every drawing type the chart engine supports (e.g. "fibRetracement", "horizontalLine", ' +
            '"longPosition", "parallelChannel"). Call this to discover valid `type` values for draw_shape.',
        inputSchema: {},
    },
    async () => {
        const result = await bridge.call('list_available_drawing_types', {});
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'draw_shape',
    {
        title: 'Draw any supported shape/annotation',
        description:
            'Draw any shape the chart engine supports by its type (see list_available_drawing_types), using a ' +
            'list of (barIndex, price) points. draw_rectangle/draw_trendline/draw_polyline/draw_callout cover the ' +
            'most common cases with clearer point semantics — prefer those when they fit. Use draw_shape for ' +
            'everything else: Fibonacci tools, channels, position markers, single-point annotations, etc.\n\n' +
            'Point count by type (most common):\n' +
            '- 1 point: "horizontalLine", "verticalLine", "text", "priceLabel", "sticker" — {barIndex, price} is ' +
            'the anchor (horizontalLine/verticalLine only use one of barIndex/price depending on axis, but pass both).\n' +
            '- 2 points: "trendLine", "rectangle", "ray", "horizontalRay", "extendedLine", "circle", "arrow", ' +
            '"longPosition", "shortPosition" (longPosition/shortPosition: both points at the entry price, spanning ' +
            'the entry time range — use profitPercent/stopPercent/quantity for the target/stop zone sizing).\n' +
            '- 3 points: "parallelChannel" (two points define the base line, third sets channel width), ' +
            '"fibExtension", "triangle", "ellipse".\n' +
            '- 2+ points: "fibRetracement" (swing high to swing low, or vice versa), "fibChannel".\n' +
            '- variable (2+): "polyline", "curve", "brush", "path" — use draw_polyline instead for plain polylines.\n' +
            '- pattern-specific point counts: "xabcd"/"xabcdPattern"/"cypher" (5 points: X,A,B,C,D), "abcd" (4 ' +
            'points), "elliotImpulse" (6 points), "elliotCorrection"/"threeDrives" (4 points), "headShoulders" ' +
            '(7 points), "trianglePattern" (3-4 points).\n' +
            'If unsure of a type\'s exact point semantics, start with 2-3 reasonable points and check the result ' +
            'with list_drawings; adjust and redraw (clear_drawing first) if it looks wrong in a screenshot.',
        inputSchema: {
            type: z.string().describe('Drawing type, e.g. "fibRetracement", "horizontalLine", "longPosition". See list_available_drawing_types.'),
            points: z
                .array(z.object({ barIndex: z.number().int(), price: z.number() }))
                .min(1)
                .describe('Ordered list of (barIndex, price) points; how many are needed depends on type (see tool description).'),
            text: z.string().optional().describe('Text content, for text/callout/label-style types.'),
            label: z.string().optional().describe('Short label to render on the shape.'),
            color: z.string().optional().describe('Line/border color, e.g. "#2962ff".'),
            fillColor: z.string().optional().describe('Fill color, e.g. "rgba(41,98,255,0.15)".'),
            dashed: z.boolean().optional().describe('Render the line dashed.'),
            extendLeft: z.boolean().optional().describe('For line types: extend the line to the left edge of the chart.'),
            extendRight: z.boolean().optional().describe('For line types: extend the line to the right edge of the chart.'),
            reversed: z.boolean().optional().describe('For pattern/fib types: reverse the direction of levels.'),
            profitPercent: z.number().optional().describe('For longPosition/shortPosition: profit target as a percent from entry.'),
            stopPercent: z.number().optional().describe('For longPosition/shortPosition: stop loss as a percent from entry.'),
            quantity: z.number().optional().describe('For longPosition/shortPosition: position size shown on the label.'),
        },
    },
    async (args) => {
        const result = await bridge.call('draw_shape', args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'get_chart_context',
    {
        title: 'Get chart context',
        description:
            'Read the active chart\'s current state: symbol, timeframe, total bar count, and OHLCV data (including volume) ' +
            'for the most recent bars with their bar indices. Call this BEFORE drawing anything, so bar indices and price ' +
            'levels passed to draw_* tools refer to real candles instead of guesses.',
        inputSchema: {
            lookback: z.number().int().min(1).optional().describe('How many of the most recent bars to return (default 100). Pass a large number, or the totalBars value from a previous call, to fetch the full history.'),
        },
    },
    async (args) => {
        const result = await bridge.call('get_chart_context', args, 30000);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'list_available_indicators',
    {
        title: 'List available indicator types',
        description:
            'List every indicator type the chart engine supports (e.g. "rsi", "macd", "zigzag", "volume", "smc"). ' +
            'Call this first to discover valid indicatorId values for add_indicator.',
        inputSchema: {},
    },
    async () => {
        const result = await bridge.call('list_available_indicators', {});
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'list_active_indicators',
    {
        title: 'List indicators currently on the chart',
        description:
            'List every indicator currently added to the active chart, with its id, name, current settings, ' +
            'and the settings schema (valid keys/ranges) accepted by update_indicator.',
        inputSchema: {},
    },
    async () => {
        const result = await bridge.call('list_active_indicators', {});
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'add_indicator',
    {
        title: 'Add an indicator to the chart',
        description:
            'Add any supported indicator to the active chart by its indicatorId (see list_available_indicators). ' +
            'Adds it with the engine\'s default settings, then optionally overrides specific settings (e.g. period). ' +
            'If you need a setting whose valid keys are unclear, add with defaults first and check list_active_indicators.',
        inputSchema: {
            indicatorId: z.string().describe('Indicator type id, e.g. "rsi", "ema", "macd", "zigzag", "volume", "smc". See list_available_indicators.'),
            settings: z.record(z.any()).optional().describe('Optional map of setting key -> value to override right after adding, e.g. {"period": 9}'),
        },
    },
    async (args) => {
        const result = await bridge.call('add_indicator', args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'update_indicator',
    {
        title: 'Update an active indicator\'s settings',
        description:
            'Update one or more settings (e.g. period) on an indicator already present on the chart. ' +
            'Use list_active_indicators to find its id and valid setting keys.',
        inputSchema: {
            id: z.string().describe('Indicator instance id, from list_active_indicators'),
            settings: z.record(z.any()).describe('Map of setting key -> new value, e.g. {"period": 21}'),
        },
    },
    async (args) => {
        const result = await bridge.call('update_indicator', args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'remove_indicator',
    {
        title: 'Remove an indicator from the chart',
        description: 'Remove an indicator from the active chart by its id (see list_active_indicators).',
        inputSchema: {
            id: z.string().describe('Indicator instance id, from list_active_indicators'),
        },
    },
    async (args) => {
        const result = await bridge.call('remove_indicator', args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'get_indicator_data',
    {
        title: 'Read an indicator\'s computed data points',
        description:
            'Read the computed output of an indicator on the active chart (e.g. ZigZag pivot points, RSI values, ' +
            'MACD lines). Returns each point as a (barIndex, value) pair ordered oldest to newest. Requires the ' +
            'indicator to already be on the chart (add_indicator first).',
        inputSchema: {
            id: z.string().optional().describe('Indicator instance id, from list_active_indicators'),
            name: z.string().optional().describe('Fallback lookup by indicator name/type (e.g. "ZigZag", "RSI") if id is not known'),
            count: z.number().int().min(1).optional().describe('Return only the most recent N points. Omit to return all available points.'),
        },
    },
    async (args) => {
        const result = await bridge.call('get_indicator_data', args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'capture_chart_screenshot',
    {
        title: 'Capture chart screenshot',
        description:
            'Take a screenshot of the active chart (candles, indicators, and drawings) as an image. ' +
            'Use this to visually inspect the chart for structures that are hard to define with fixed rules, ' +
            'such as an "important trading zone" that a rule-based detector would miss but is visible by eye. ' +
            'Combine with get_chart_context to know which bar index/price each part of the image corresponds to.',
        inputSchema: {},
    },
    async () => {
        const result = await bridge.call('capture_chart_screenshot', {}, 15000);
        return {
            content: [
                { type: 'image', data: result.base64, mimeType: result.mimeType },
                { type: 'text', text: `Screenshot captured (${result.width}x${result.height}px).` },
            ],
        };
    }
);

server.registerTool(
    'list_drawings',
    {
        title: 'List current drawings',
        description: 'List all drawings currently on the active chart, including ids needed for clear_drawing.',
        inputSchema: {},
    },
    async () => {
        const result = await bridge.call('list_drawings', {});
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'clear_drawing',
    {
        title: 'Remove a drawing',
        description: 'Remove a single drawing by id (see list_drawings).',
        inputSchema: {
            id: z.string(),
        },
    },
    async (args) => {
        const result = await bridge.call('clear_drawing', args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'clear_all_drawings',
    {
        title: 'Remove all drawings',
        description: 'Remove every drawing currently on the active chart.',
        inputSchema: {},
    },
    async () => {
        const result = await bridge.call('clear_all_drawings', {});
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'list_connected_charts',
    {
        title: 'List connected chart tabs',
        description:
            'List every browser tab currently connected to this bridge (e.g. the same account open in multiple ' +
            'browsers/devices), and which one tool calls currently target. Use this if drawing/reading tools seem ' +
            'to be hitting the wrong chart, or before set_active_chart.',
        inputSchema: {},
    },
    async () => {
        const result = bridge.listConnections();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'set_active_chart',
    {
        title: 'Target a specific connected chart tab',
        description:
            'Redirect subsequent draw_*/get_chart_context/indicator calls to a specific already-connected browser ' +
            'tab (see list_connected_charts for valid ids). Does not disconnect other tabs.',
        inputSchema: {
            tabId: z.string().describe('Tab id from list_connected_charts'),
        },
    },
    async (args) => {
        bridge.setActiveTab(args.tabId);
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, activeTabId: args.tabId }) }] };
    }
);

const DRAFT_INDICATOR_GUIDE =
    'Draft indicators are TypeScript classes extending the engine\'s OverlayIndicator or PanelIndicator base ' +
    'class (both available as globals on the chart page, no import needed). Required shape:\n\n' +
    'class MyIndicator extends OverlayIndicator { // or PanelIndicator for a separate pane\n' +
    '  constructor(options = {}) { super({ ...options, name: "MyIndicator" }); }\n' +
    '  calculate(sourceData) { /* sourceData: {time, open, high, low, close, volume}[], ascending time.\n' +
    '    Populate this._data as IndicatorDataPoint[]: {time, value, values?}[], one entry per input bar\n' +
    '    (use NaN for bars where the indicator has no value yet, e.g. before a warmup period). */ }\n' +
    '  getRange() { return { min: 0, max: 100 }; } // value range, mainly relevant for PanelIndicator\n' +
    '  getDescription(index) { return "MyIndicator: " + (this._data[index]?.value ?? "-"); } // legend text\n' +
    '}\n\n' +
    'Do not use import/export — the file is compiled standalone and executed as a script, referencing only ' +
    'globals already on the page (OverlayIndicator, PanelIndicator, and standard JS). End the file with the ' +
    'class assigned to a global the loader expects: `globalThis.__draftIndicatorClass = MyIndicator;`\n\n' +
    'Typical workflow: either (a) read_indicator_source on an existing indicator similar to what you want (e.g. ' +
    '"zigzag-indicator" or "smc-indicator") for a style/structure reference and write a new draft from scratch, or ' +
    '(b) copy_indicator_to_draft to clone an existing indicator directly into the drafts folder as your starting ' +
    'point when you\'re modifying/extending something that already mostly works. Either way, use write_draft_indicator ' +
    'to save/revise your draft as "<name>_dev", load_draft_indicator to compile and add it to the chart under the ' +
    '"Development" indicator group, then get_indicator_data / capture_chart_screenshot to check it against the ' +
    'examples the user marked. Iterate with write_draft_indicator + load_draft_indicator until it matches, then tell ' +
    'the user it\'s ready for them to review and promote into a real indicator file — drafts are never wired into ' +
    'production automatically. Once an experiment is abandoned or superseded, use delete_draft_indicator to remove ' +
    'its file so list_draft_indicators stays accurate.';

server.registerTool(
    'list_indicator_sources',
    {
        title: 'List production indicator source files',
        description: 'List the engine\'s existing indicator source files, for use with read_indicator_source as style/structure references.',
        inputSchema: {},
    },
    async () => {
        const result = await listIndicatorSources();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'read_indicator_source',
    {
        title: 'Read a production indicator\'s source code',
        description: 'Read the TypeScript source of an existing production indicator (see list_indicator_sources) as a reference for writing a draft.',
        inputSchema: {
            name: z.string().describe('File name without extension, e.g. "zigzag-indicator", "smc-indicator".'),
        },
    },
    async (args) => {
        const result = await readIndicatorSource(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'copy_indicator_to_draft',
    {
        title: 'Copy a production indicator into the drafts sandbox',
        description:
            'Copy an existing production indicator\'s source (see list_indicator_sources) into the drafts folder ' +
            'as a starting point, instead of writing a new indicator from scratch. import/export statements are ' +
            'stripped automatically since drafts run as standalone scripts referencing only OverlayIndicator/' +
            'PanelIndicator as globals. IMPORTANT: some indicators import helper functions from other internal ' +
            'modules (e.g. calculateZigZagPoints, createInputsTab) that are NOT available as globals — after ' +
            'copying, check the draft with read_draft_indicator for any identifiers that came from a now-removed ' +
            'import and either inline a simplified version of that logic yourself or remove the code path that ' +
            'needs it (e.g. a custom getSettingsConfig() using createInputsTab can usually just be deleted, since ' +
            'the base Indicator class auto-generates one). After copying, use write_draft_indicator to set the ' +
            'trailing `globalThis.__draftIndicatorClass = <ClassName>;` line and fix any such references before ' +
            'calling load_draft_indicator.',
        inputSchema: {
            sourceName: z.string().describe('Production indicator file name without extension, e.g. "zigzag-indicator". See list_indicator_sources.'),
            draftName: z.string().describe('New draft name ending in "_dev", e.g. "zigzag_modified_dev".'),
        },
    },
    async (args) => {
        const result = await copyIndicatorToDraft(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'write_draft_indicator',
    {
        title: 'Write a draft indicator (development only)',
        description:
            'Write a new or updated indicator draft to the sandboxed drafts folder — never touches production ' +
            'indicator files. The name must end in "_dev" (e.g. "fvg_dev"); the file is saved as "<name>.ts". ' +
            'See the class shape and full workflow in this description:\n\n' + DRAFT_INDICATOR_GUIDE,
        inputSchema: {
            name: z.string().describe('Draft name ending in "_dev", e.g. "fvg_dev".'),
            code: z.string().describe('Full TypeScript source of the draft indicator class.'),
        },
    },
    async (args) => {
        const result = await writeDraftIndicator(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'list_draft_indicators',
    {
        title: 'List saved indicator drafts',
        description: 'List all draft indicators currently saved in the sandboxed drafts folder.',
        inputSchema: {},
    },
    async () => {
        const result = await listDraftIndicators();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'read_draft_indicator',
    {
        title: 'Read a saved indicator draft',
        description: 'Read back the current source of a saved draft indicator, e.g. before revising it.',
        inputSchema: {
            name: z.string().describe('Draft name, e.g. "fvg_dev".'),
        },
    },
    async (args) => {
        const result = await readDraftIndicator(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'delete_draft_indicator',
    {
        title: 'Delete a saved indicator draft',
        description:
            'Permanently delete a draft indicator file from the sandboxed drafts folder. Only affects drafts ' +
            '(never touches production indicator files). Use this to clean up abandoned/failed experiments so ' +
            'list_draft_indicators stays accurate.',
        inputSchema: {
            name: z.string().describe('Draft name to delete, e.g. "fvg_dev".'),
        },
    },
    async (args) => {
        const result = await deleteDraftIndicator(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'load_draft_indicator',
    {
        title: 'Compile and load a draft indicator onto the chart',
        description:
            'Compile a saved draft indicator\'s TypeScript to JS and load it onto the active chart for live testing. ' +
            'It appears in list_active_indicators / on the chart under a "Development" grouping, separate from real ' +
            'indicators, and is never persisted as production code. Re-run this after write_draft_indicator to test ' +
            'each revision. This only works in the browser (chart must be open) — it does not touch chart-bridge ' +
            'drawing state.',
        inputSchema: {
            name: z.string().describe('Draft name, e.g. "fvg_dev".'),
            settings: z.record(z.any()).optional().describe('Optional constructor options to pass to the draft indicator.'),
        },
    },
    async (args) => {
        const { js } = await compileDraftIndicator({ name: args.name });
        const result = await bridge.call('load_draft_indicator', { name: args.name, js, settings: args.settings || {} }, 15000);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'analyze_chart',
    {
        title: 'Get chart analysis methodology',
        description:
            'Returns the step-by-step methodology for analyzing the active chart: which tools to call, in what ' +
            'order, and how to weigh rule-based structure (ZigZag, SMC indicator) against visual judgment ' +
            '(screenshot). Call this FIRST whenever the user asks for chart analysis, a trade idea, or to mark up ' +
            'structures — then execute the steps yourself using the other tools.',
        inputSchema: {
            focus: z
                .enum(['general', 'smc', 'trend', 'zones'])
                .optional()
                .describe(
                    'Optional analysis focus: "smc" for order blocks/BOS/MSB/FVG-style structure, "trend" for ' +
                    'directional bias only, "zones" for supply/demand & important-trading-zone marking, "general" ' +
                    '(default) for a full walkthrough.'
                ),
        },
    },
    async (args) => {
        const focus = args.focus || 'general';
        return { content: [{ type: 'text', text: buildAnalysisPlaybook(focus) }] };
    }
);

function buildAnalysisPlaybook(focus) {
    const steps = [
        `## Chart analysis methodology (focus: ${focus})`,
        '',
        '### 1. Orient yourself with real data first',
        '- If the user asked about a different symbol or timeframe than what\'s currently loaded, call ' +
            '`change_symbol` first (e.g. {timeframe: "4h"} to check higher-timeframe structure) — it reloads the ' +
            'chart\'s data before you read anything.',
        '- Call `get_chart_context` (use a large `lookback`, e.g. 300-500 bars, not the 100-bar default) to get ' +
            'symbol, timeframe, and real OHLCV with bar indices.',
        '- Never invent barIndex or price values for drawings — every draw_* call must reference numbers that ' +
            'came from a tool result (get_chart_context, get_indicator_data), not a guess from eyeballing the image.',
        '- Note the overall range (priceHigh/priceLow) and roughly where price is now relative to recent swings.',
        '',
        '### 2. Establish structure with rule-based tools (cheap, deterministic, do this before vision)',
        '- Call `list_active_indicators`. If no ZigZag is present, `add_indicator` with indicatorId "zigzag" ' +
            '(default period ~15 for higher timeframes, ~5-8 for lower timeframes / choppier price).',
        '- Call `get_indicator_data` on the ZigZag to get swing highs/lows as (barIndex, value) pivots. These are ' +
            'your candidate structure points for trend direction, higher-highs/higher-lows (or lower-lows) analysis, ' +
            'and break-of-structure (BOS) / market-structure-break (MSB) detection: a BOS is price closing beyond ' +
            'the most recent pivot in the direction of the trend; an MSB/CHoCH is price closing beyond a pivot ' +
            'against the prevailing trend.',
        '- If the engine\'s "smc" indicator is relevant to the user\'s question, add it too (`add_indicator` with ' +
            'indicatorId "smc") and read its output the same way — prefer its structural calls over your own ' +
            'freehand interpretation of the candles, since it is deterministic and already validated against the data.',
        '- Optionally add "volume" to sanity-check moves (e.g. a BOS on high volume is more credible than on low volume).',
        '',
        '### 3. Only now bring in vision — for what rules cannot express',
        '- Call `capture_chart_screenshot` after the indicators above are on the chart, so the image already shows ' +
            'ZigZag/SMC/volume overlays.',
        '- Use the screenshot specifically for judgment calls a fixed algorithm would miss: whether a zone "looks" ' +
            'respected by price (multiple wicks reacting to it), whether a level is visually "important" because of ' +
            'confluence (round number + prior swing + volume spike), or whether a pattern looks clean vs messy.',
        '- Always cross-reference what you see in the image against the numeric data from step 1-2 before acting on ' +
            'it — the image tells you WHERE to look, the OHLCV/indicator data tells you the exact barIndex/price to ' +
            'use when you draw or state a conclusion.',
        '- Treat vision output as a hypothesis to confirm with data, not a standalone verdict — if the screenshot ' +
            'suggests a zone but the underlying candles don\'t support it (e.g. no real reaction, no volume), say so ' +
            'instead of drawing it anyway.',
        '',
        '### 4. Mark up findings on the chart',
        '- `draw_rectangle` for zones (order blocks, FVGs, supply/demand, "important trading zones").',
        '- `draw_trendline` for trend lines and BOS/MSB break levels (connect the two pivots that define the break).',
        '- `draw_polyline` for irregular multi-touch zones.',
        '- `draw_callout` to explain WHY a structure matters, anchored at the relevant barIndex/price.',
        '- Check `list_drawings` before adding more so you don\'t stack duplicate markup on the same area.',
        '',
        '### 5. Report back',
        '- State your read on trend/bias, the key levels (with actual price numbers), and what would invalidate the idea.',
        '- Be explicit about which parts came from deterministic data (ZigZag/SMC/OHLCV) vs. visual judgment from the ' +
            'screenshot, so the user can weigh your confidence accordingly.',
    ];

    if (focus === 'smc') {
        steps.push(
            '',
            '### Focus note: SMC',
            '- Prioritize: swing structure (ZigZag) -> BOS/MSB/CHoCH labeling -> order blocks and FVGs as rectangles ' +
                '-> liquidity levels (equal highs/lows) as trend lines. Use the screenshot mainly to judge order-block ' +
                'quality (clean impulse away from it) rather than to find structure from scratch.'
        );
    } else if (focus === 'trend') {
        steps.push(
            '',
            '### Focus note: Trend',
            '- Skip zone-marking. Focus steps 2-3 on ZigZag pivot sequence (higher-highs/higher-lows vs lower-highs/' +
                'lower-lows) and state a single directional bias with the pivot(s) that would invalidate it.'
        );
    } else if (focus === 'zones') {
        steps.push(
            '',
            '### Focus note: Zones',
            '- Weight step 3 (vision) more heavily here — "important trading zone" is exactly the subjective ' +
                'structure rule-based detectors miss. Still anchor every rectangle to real bar indices from step 1, ' +
                'and prefer zones that also show a volume or ZigZag pivot confluence over purely visual ones.'
        );
    }

    return steps.join('\n');
}

    return server;
}

function requireBearerAuth(req, res, next) {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token !== BEARER_TOKEN) {
        res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null });
        return;
    }
    next();
}

// createMcpExpressApp()'in varsayılan DNS-rebinding koruması sadece
// Host: localhost/127.0.0.1/::1 kabul ediyor -- bir reverse proxy (Caddy)
// arkasında gerçek bir domainle çalışırken bu, MEŞRU trafiği 403 ile
// reddediyor. MCP_ALLOWED_HOSTS (virgülle ayrılmış) ile genişletilebilir.
const allowedHosts = ['localhost', '127.0.0.1', '::1'];
if (process.env.MCP_ALLOWED_HOSTS) {
    allowedHosts.push(...process.env.MCP_ALLOWED_HOSTS.split(',').map((h) => h.trim()).filter(Boolean));
}
const app = createMcpExpressApp({ allowedHosts });

// Map of MCP session id -> transport, mirroring the SDK's own
// simpleStreamableHttp.js example: initialize creates a session, subsequent
// requests reuse it via the Mcp-Session-Id header.
const transports = {};

app.post('/mcp', requireBearerAuth, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    try {
        let transport;
        if (sessionId && transports[sessionId]) {
            transport = transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                onsessioninitialized: (sid) => {
                    transports[sid] = transport;
                },
            });
            transport.onclose = () => {
                const sid = transport.sessionId;
                if (sid && transports[sid]) delete transports[sid];
            };
            const server = getServer();
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
            return;
        } else {
            res.status(400).json({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
                id: null,
            });
            return;
        }
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('[ai-charts-mcp] error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
        }
    }
});

app.get('/mcp', requireBearerAuth, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
    }
    await transports[sessionId].handleRequest(req, res);
});

app.delete('/mcp', requireBearerAuth, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
    }
    await transports[sessionId].handleRequest(req, res);
});

const httpServer = http.createServer(app);
bridge = new ChartBridge(httpServer, BEARER_TOKEN);

httpServer.listen(MCP_PORT, () => {
    console.error(`[ai-charts-mcp] MCP server (Streamable HTTP) listening on http://localhost:${MCP_PORT}/mcp`);
});

process.on('SIGINT', async () => {
    for (const sessionId of Object.keys(transports)) {
        try {
            await transports[sessionId].close();
        } catch {
            // ignore
        }
        delete transports[sessionId];
    }
    process.exit(0);
});
