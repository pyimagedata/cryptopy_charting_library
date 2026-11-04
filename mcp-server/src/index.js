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
import {
    writeDraftBacktest,
    readDraftBacktest,
    deleteDraftBacktest,
    listDraftBacktests,
    compileDraftBacktest,
} from './draft-backtests.js';
import { buildBacktestSlice, listBacktestDatasets, MAX_BARS, TIMEFRAMES } from './backtest-data.js';

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
            '- 1 point: "horizontalLine", "verticalLine", "text", "priceLabel", "sticker", "arrowMarkedUp", "arrowMarkedDown", "arrowMarkedLeft", "arrowMarkedRight" — {barIndex, price} is ' +
            'the anchor (horizontalLine/verticalLine only use one of barIndex/price depending on axis, but pass both).\n' +
            '- 2 points: "trendLine", "rectangle", "ray", "horizontalRay", "extendedLine", "circle", "arrow", ' +
            '"longPosition", "shortPosition" (longPosition/shortPosition: both points at the entry price, spanning ' +
            'the entry time range — use profitPercent/stopPercent/quantity for the target/stop zone sizing).\n' +
            '- 3 points: "parallelChannel" (two points define the base line, third sets channel width), ' +
            '"fibExtension", "triangle", "ellipse", "pitchfork"/"schiffPitchfork"/"modifiedSchiffPitchfork"/"insidePitchfork" ' +
            '(P1 = handle/origin, P2 and P3 = the two swing points; median runs from P1 through the midpoint of P2-P3, parallel levels through P2/P3) and ' +
            '"pitchfan" (P1, P2, P3; fan lines from P1 through points on P2-P3) and ' +
            '"trendBasedFibTime" (P1, P2, P3; vertical lines at P3 + coeff * (P2 - P1) in bars).\n' +
            '- 2+ points: "fibRetracement" (swing high to swing low, or vice versa), "fibChannel".\n' +
            '- Fib time/fan tools (2 points): "fibTimeZone" (vertical lines at P1 + n * (P2 - P1) in bars, n = 0,1,2,3,5,8,13,21,34,55,89) and ' +
            '"fibSpeedResistanceFan" (P1 = origin, P2 = opposite corner of the box; fan rays from P1 through the 0/0.25/0.382/0.5/0.618/0.75/1 grid points).\n' +
            '- Fib circular tools (drawn in pixel space, so they stay round on screen and are NOT price/time scaled; radius comes from the on-screen P1-P2 distance): ' +
            '"fibSpeedResistanceArcs" (2 points: P1 = centre, P2; arcs of radius level * |P1P2| on the P2 side, half circles unless fullCircles), ' +
            '"fibCircles" (2 points: P1-P2 = diameter of the 1.0 circle; concentric circles, radius level * |P1P2| / 2), ' +
            '"fibSpiral" (2 points: P1 = centre, P2 = start radius/angle; golden logarithmic spiral, radius grows by phi per quarter turn) and ' +
            '"fibWedge" (3 points: P1 = apex, P2 and P3 = the two wedge edges; arcs of radius level * |P1P2| between the rays). Levels 0.236..4.618.\n' +
            '- Gann tools (2 points, pixel-space geometry): "gannBox" (P1/P2 = opposite corners; price and time levels 0,0.25,0.382,0.5,0.618,0.75,1 as lines + bands, optional angle fans, reverse flips the origin to P2), ' +
            '"gannFan" (P1 = origin, P2 defines the 1x1 line; 9 rays with price/time slopes 1/8,1/4,1/3,1/2,1/1,2/1,3/1,4/1,8/1 extending to the pane edge), ' +
            '"gannSquareFixed" (P1 = origin, P2 sets the size; a true on-screen square of 5x5 cells with grid 0..5, fan lines from the origin and quarter arcs at 1..5 cells) and ' +
            '"gannSquare" (same, but width/height follow P1->P2 freely; optional scaleLock/scaleRatio = price per bar; labels show price diff, bars, ratio). ' +
            'Settings via ext/settings: hlevels/vlevels (box), fanLevels, gridLevels, arcLevels, showLabels, fillBackground, reverse, fansVisible.\n' +
            '- Channel/projection tools (3 points, pixel-space geometry): "disjointChannel" (line A = P1->P2; line B starts at P3 with the mirrored slope (-slope A) and the same bar span; filled between the lines), ' +
            '"flatTopBottom" (line A = P1->P2; line B is horizontal at the price of P3 over the same time range; filled between) and ' +
            '"projection" (P1 = centre, P2 = start of the arc (radius |P1P2|), P3 sets the sweep angle: the sector between rays P1->P2 and P1->P3 (short angle); level arcs at coeff * |P1P2| (default coeff 1), ' +
            'sector rings filled alternately blue/purple; trend lines P1-P2 and P1-P3). Settings via ext/settings: extendLeft/extendRight, showPriceLabels, labelVisible/text (channels); levels, showCoeffs, fillBackground (projection).\n' +
            '- Forecast tools: "positionForecast" (2 points: P1 = source price/time, P2 = target; blue arrow + label with price change, %, ticks, bars and time span; the box turns green with a check mark when real bars reached P2.price (high/low crossing) at or before P2.time, red with a cross when P2.time passed without reaching it, blue while pending; settings: color, lineWidth, textColor, backgroundColor, successColor, failureColor), ' +
            '"barsPattern" (3 points: P1/P2 select a range of existing bars, P3 = where the copy is drawn: its time is the start and its price anchors the first copied bar close; settings: mode hlBars|openClose|line|ohlc, mirrored (flip vertically around the anchor), flipped (reverse time order), transparency, color) and ' +
            '"ghostFeed" (2+ points like a polyline, finish with double-click/Enter: synthetic candles between consecutive points, candlesPerSegment (default 20) per segment, variance 0-100 (default 50); deterministic, seeded by ext.seed (defaults to the drawing id); settings: upColor, downColor, borderUpColor, borderDownColor, wickColor, drawWick, drawBorder, transparency).\n' +
            '- Cycle tools (2 points, pixel-space geometry): "cyclicLines" (P1 and P2 define one period; vertical full-height lines at P1 + n*period for n >= 0 in the P1->P2 direction, nothing before P1; default #80CCDB, width 2), ' +
            '"timeCycles" (P1/P2 = one cycle; repeating half-ellipse arcs above P1.price, each one period wide; arc height = |P2.y - P1.y| in pixels, or half the period if P2 is at the same price; filled by default #6AA84F transparency 50; colour #159980) and ' +
            '"sineLine" (P1 = peak/trough, P2 = next opposite extreme = half period; sine through both, amplitude |dy|/2, period 2*|dx|, drawn across the whole pane; colour #159980). Settings: color, lineWidth, lineStyle, fillColor/fillEnabled/fillTransparency (timeCycles).\n' +
            '- "doubleCurve" (3 points: P1 and P3 = ends, P2 = a point on the curve at t=0.5; cubic bezier with derived S-shaped controls C1 = P1 + 4D/3 + n, C2 = P3 + 4D/3 - n where D = P2 - mid(P1,P3), n = chord normal * 0.25; purple #673AB7; settings: color, lineWidth, lineStyle, fill (off by default), extendLeft/extendRight along end tangents, leftEnd/rightEnd).\n' +
            '- Note/annotation tools: "note" (1 point: anchor dot + a note box up-right joined by a thin line; text via text; dark #1A1A1A box, text #DBDBDB, 14px; settings: color (text), markerColor, backgroundColor, backgroundTransparency, backgroundVisible, borderVisible, borderColor, fontSize, bold, italic), ' +
            '"priceNote" (2 points: P1 = price point, P2 = where the text sits; blue #2962FF line P1-P2, text at P2 (horzLabelsAlign left|center|right, vertLabelsAlign top|middle|bottom; default center/bottom), and a price chip for P1.price on the price axis in chipColor; settings: color (line), lineWidth, textColor, chipColor, fontSize), ' +
            '"pin" (1 point: map-pin icon at the anchor with optional text above; settings: color, text, textColor, fontSize), ' +
            '"signpost" (1 point: vertical post from the anchor to a rounded plate with text and optional emoji; settings: color (plate #2962FF), textColor, fontSize 12, showImage, emoji, placement above|below), ' +
            '"comment" (2 points: P1 = bubble tail tip, P2 = bubble centre; #2962FF at 30% transparency, white text 14px) and ' +
            '"table" (1 point: top-left corner; settings: rows/cols 1-10 (default 2x2), colWidth, rowHeight, hAlign via horzAlign, color (text), backgroundColor, borderColor, fontSize 12; cells are edited by double-click and serialized as ext.cells, a rows x cols array of strings). ' +
            'Note/priceNote/signpost/comment are removed if their text ends up empty.\n' +
            '- variable (2+): "polyline", "curve", "brush", "path" — use draw_polyline instead for plain polylines.\n' +
            '- pattern-specific point counts: "xabcd"/"xabcdPattern" (5 points: X,A,B,C,D), "cypher"/"cypherPattern" (5 points: X,A,B,C,D), "abcd" (4 ' +
            'points), "elliotImpulse" (6 points), "elliotCorrection" (4 points), "elliotTriangle" (6 points), "elliotDoubleCombo" (4 points), "elliotTripleCombo" (6 points), "threeDrives" (7 points), "headShoulders" ' +
            '(7 points), "trianglePattern" (3-4 points).\n' +
            '- volume-based (use the main series volume): "anchoredVwap" (1 point: the anchor bar; VWAP runs to the latest bar, optional std-dev bands), ' +
            '"anchoredVolumeProfile" (1 point: the anchor bar; profile runs to the latest bar), "fixedRangeVolumeProfile" (2 points: start bar and end bar).\n' +
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

const BT_ENGINE_GUIDE =
    'BACKTEST ENGINE `bt` (v1.0.0) -- already in scope in every draft (do not import/declare it); write only strategy logic.\n' +
    'DATA: bt.data() -> {t,o,h,l,c,v,meta,length} (dataset mode); await bt.chartData() -> same shape from the chart (+barIndex[]). ' +
    'bt.slice(d, fromMs, toMs, warmupBars).\n' +
    'INDICATORS (Float64Array in/out, NaN warm-up, causal: value[i] uses bars <= i): sma ema rma(=wilder) wma stdev highest lowest (x,n); ' +
    'atr(d,n) tr(d) rsi(x,n) change(x,k) roc(x,k) shift(x,k) bollinger(x,n,m)->{mid,upper,lower} donchian(h,l,n)->{upper,lower,mid} ' +
    'macd(x,f,s,sig)->{macd,signal,hist} vwap(d,{reset:"1d"|"1d_ny"}) crossover/crossunder(a,b) (series or number -> Uint8Array). ' +
    'A channel that includes bar i is NOT "previous bars": for a breakout use bt.shift(bt.highest(h,20),1) and compare close[i] to it.\n' +
    'HTF: const H = bt.resample(d,"1d"); const x = H.align(bt.ema(H.c,20)) -> base-length series; value of an HTF bar appears only after that bar CLOSED (no look-ahead). Never index HTF arrays with base indices.\n' +
    'RUN: const res = bt.run({ data, params, init(ctx), onBar(ctx,i), capital=10000, contractSize (default 100 for XAU*, else 1; PnL = move*lots*contractSize), ' +
    'costs:{spread (price units), commissionPerLot (per side), slippage (price units, market+stop fills, not TP)}, priceBasis:"mid"|"bid" (default meta.priceBasis, XAU_1m = bid), periodsPerYear=252 (use 365 for 24/7 assets), ' +
    'sizing:{mode:"fixed",lots}|{mode:"riskPct",riskPct}(needs sl/slDist; riskIncludesCosts=true sizes so a stop-out at the stop loses riskPct incl. costs; gaps can exceed)|{mode:"notionalPct",pct}, maxLots=100, lotStep=0.01, maxLeverageWarn=30, allowShort=true, pyramiding=false, ' +
    'fill:"nextOpen"|"close", sameBar:"sl"|"tp", sessionFilter:(tMs)=>bool (entries only), startIndex, output:{maxTrades=300,monthly} }).\n' +
    'ctx: buy(o)/sell(o) o={sl,tp (prices) | slDist,tpDist (distance from fill price) | tpR (multiple of stop distance), lots, tag}; close(tag); cancel(); setStop(p)/setTarget(p); ' +
    'ctx.position (null or {side,lots,entry,sl,tp,barsHeld,openPnl}); ctx.equity, ctx.balance, ctx.i, ctx.time, ctx.params, ctx.state (scratch), ctx.data.\n' +
    'SEMANTICS: onBar(i) runs after bar i closed; use only data[0..i]. Orders fill at open[i+1] (last order in a bar wins; reversal = close then open). ' +
    'SL/TP are checked intrabar from the fill bar on (setStop/setTarget take effect next bar); gap through SL/TP fills at the open; if one bar hits both SL and TP, SL wins (sameBar:"tp" flips). ' +
    'COST MODEL: mid data: ask=px+spread/2, bid=px-spread/2 (SL/TP triggers padded by half spread); bid data: ask=px+spread. Longs enter at ask, exit at bid; shorts enter at bid, exit at ask; long SL/TP trigger on bid, short on ask. ' +
    'Exposure/barsHeld count a bar if the position was open at any time in it. Equity<=0 -> reason "wipeout", halt. Orders on the final bar are dropped. Position open at the end of data closes at the last close. Orders with a stop/target on the wrong side of the fill, or riskPct without a stop, are rejected (counted in warnings).\n' +
    'RESULT: {config, summary{netProfit,netPct,cagr,trades,winRate,profitFactor (999 = no losing trades),avgTrade,avgWin,avgLoss,expectancyR,maxDrawdown,maxDrawdownPct,maxDDDurationDays,sharpe,sortino(daily,sqrt252),exposurePct,avgBarsHeld,long,short,costsPaid,finalEquity}, ' +
    'byYear[] (net = mark-to-market equity change in the calendar year; trades/winRate by EXIT year), trades (first+last maxTrades), tradesTotal, equity (<=500 pts), warnings}. Set globalThis.__draftBacktestResult = res (or a trimmed copy: pass output:{maxTrades:30} to keep MCP output small). READ res.warnings.\n' +
    'OPTIMISE: await bt.sweep({fast:[10,20],slow:[50,100]}, p => bt.run({...cfg, params:p, onBar...}), {metric:"profitFactor", maxCombos:500, minTrades:10, top:20}) -> in-sample ranking (overfits!). ' +
    'await bt.walkForward({data, train:"3y", test:"1y", grid, metric, run:(p, slice)=>bt.run({data:slice, params:p, ...})}) -> out-of-sample folds + oos summary. Pass the slice as data (keeps warm-up/startIndex).\n' +
    'CHART: await bt.plotTrades(res,{max:200}) draws entry->exit lines on the chart (needs the chart on the same symbol/dates; others skipped).\n' +
    'ALWAYS model costs (XAUUSD 1h example: spread 0.3, commissionPerLot 3.5) and a stop; prefer 100+ trades; check byYear and warnings before trusting a result. ' +
    'Recommended: XAU_1m dataset on 1h or 4h over the full range (125k 1h bars, run in <1 s); 15m for intraday; 1m only on 1-2 year slices.\n' +
    'MINIMAL EXAMPLE (dataset mode, load_draft_backtest {dataset:"XAU_1m", timeframe:"1h"}):\n' +
    'const D = bt.data(); const atr = bt.atr(D,14); const up = bt.shift(bt.highest(D.h,20),1), dn = bt.shift(bt.lowest(D.l,10),1);\n' +
    'const res = bt.run({ data: D, costs:{spread:0.3, commissionPerLot:3.5}, sizing:{mode:"riskPct", riskPct:1}, output:{maxTrades:30},\n' +
    '  onBar(ctx,i){ if(!(atr[i]>0)||isNaN(up[i])) return; if(!ctx.position){ if(D.c[i]>up[i]) ctx.buy({slDist:2*atr[i]}); } else if(D.c[i]<dn[i]) ctx.close(); } });\n' +
    'globalThis.__draftBacktestResult = res;';

const DRAFT_BACKTEST_GUIDE =
    'Backtest drafts are PLAIN TypeScript scripts (NOT Indicator subclasses — no calculate()/getRange()/ ' +
    'getDescription() contract) that run with full access to window.__agentBridge.handleCommand, the exact same ' +
    'function every other MCP tool call goes through on the browser side. This means a backtest script can fetch ' +
    'its own data and draw its own results DIRECTLY, with no MCP round-trip per candle or per trade — everything ' +
    'happens in one load_draft_backtest call:\n\n' +
    '// Fetch the chart\'s real OHLCV history (ascending time, with bar indices):\n' +
    'const ctx = await window.__agentBridge.handleCommand({ tool: "get_chart_context", args: { lookback: 5000 } });\n' +
    '// ctx.bars: { index, time, open, high, low, close, volume }[]\n\n' +
    '// Walk the bars yourself, decide entries/exits per your strategy, then for EACH simulated trade:\n' +
    'await window.__agentBridge.handleCommand({ tool: "draw_rectangle", args: {\n' +
    '  startBarIndex, endBarIndex, priceHigh, priceLow, label: "WIN +1.8R",\n' +
    '  color: won ? "#26a69a" : "#ef5350", fillColor: won ? "rgba(38,166,154,0.15)" : "rgba(239,83,80,0.15)",\n' +
    '} });\n' +
    '// draw_trendline / draw_callout are also available the same way (entry/stop/target lines, labels).\n\n' +
    'End the script by setting the result the loader reads back:\n' +
    'globalThis.__draftBacktestResult = { totalTrades, wins, losses, winRate, trades: [...] };\n\n' +
    'Do not use import/export — the file is compiled standalone and executed as a script. Typical workflow: ' +
    'write_draft_backtest to save your strategy script as "<name>_bt", load_draft_backtest to compile it, run it ' +
    'against the real loaded chart, and draw every trade — then look at the chart yourself (capture_chart_screenshot ' +
    'or ask the user) to verify each entry/stop/target was placed where the strategy rules actually say it should ' +
    'be, not just trust the summary numbers. Iterate with write_draft_backtest + load_draft_backtest — a previous ' +
    'run\'s drawings are NOT auto-cleared, so call clear_all_drawings first if re-running the same script would ' +
    'otherwise double up markers. Once done, delete_draft_backtest to keep list_draft_backtests accurate — ' +
    'these are throwaway experiments, never wired into anything else automatically.\n\n' +
    'LARGE HISTORICAL DATA (external datasets). Instead of the few thousand bars loaded on the chart, a script can ' +
    'run on a server-side CSV dataset (call list_backtest_datasets to see names, UTC ranges, bar counts, data ' +
    'quality). Pass dataset (+ timeframe, from, to) to load_draft_backtest and the script finds, BEFORE it runs:\n' +
    '  globalThis.__backtestData = { meta: { dataset, symbol, timeframe, from, to, count, tz: "UTC", firstT, lastT },\n' +
    '    t: Float64Array, o: Float64Array, h: Float64Array, l: Float64Array, c: Float64Array, v: Float64Array };\n' +
    'Access it as `const D = (globalThis as any).__backtestData;` and loop `for (let i = 0; i < D.meta.count; i++)`. ' +
    'Columnar arrays, ascending time, all of length meta.count. t is the bar OPEN time in UTC epoch MILLISECONDS ' +
    '(Date: new Date(D.t[i])). Volume v is tick volume for most FX/metals CSVs. It is deleted after the run, so copy ' +
    'what you need into your own variables and put results in globalThis.__draftBacktestResult. Bars are complete ' +
    'buckets; from is inclusive, to is exclusive (ISO string such as "2020-01-01" / "2020-01-01T08:00:00Z", or ' +
    'epoch ms; no zone = UTC). Timeframes: ' + TIMEFRAMES.join(', ') + ' (UTC-aligned buckets; "1d" = UTC day, ' +
    '"1d_ny" = trading day starting 17:00 New York, the usual FX/metals daily candle; data gaps/holidays simply ' +
    'produce no bars -- sparse early years have many missing minutes). A single load is capped at ' + MAX_BARS.toLocaleString('en-US') + ' bars ' +
    '(error otherwise): the cap is on the OUTPUT bar count. For ~24h-market data like XAU_1m (~350k 1m bars per ' +
    'year): 1m fits about 5 years, while 5m (1.45M bars), 15m, 30m, 1h, 4h and 1d fit the FULL 2004-2026 history. ' +
    'Recommended: develop on 1h/4h over the full range or a 1m slice of 1-2 years, then widen. Chart-context mode (get_chart_context + drawing) still works in the same script; with a ' +
    'dataset, bar indices of the dataset are NOT chart bar indices -- draw by converting times with the chart\'s ' +
    'own bars (get_chart_context time) only for trades that fall inside the loaded chart range, and prefer ' +
    'summarizing large runs (equity curve sampled, top/bottom trades) over drawing thousands of shapes. First use of ' +
    'a dataset triggers a one-time CSV ingest that can take a few seconds to minutes.\n\n' +
    BT_ENGINE_GUIDE;

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
    'write_draft_backtest',
    {
        title: 'Write a draft backtest script (development only)',
        description:
            'Write a new or updated backtest script to the sandboxed backtest-drafts folder — separate from ' +
            'indicator drafts, never touches production code. The name must end in "_bt" (e.g. "sp_bobin_test_bt"); ' +
            'the file is saved as "<name>.ts". See the required shape and full workflow in this description:\n\n' + DRAFT_BACKTEST_GUIDE,
        inputSchema: {
            name: z.string().describe('Draft name ending in "_bt", e.g. "sp_bobin_test_bt".'),
            code: z.string().describe('Full TypeScript source of the backtest script.'),
        },
    },
    async (args) => {
        const result = await writeDraftBacktest(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'list_draft_backtests',
    {
        title: 'List saved backtest drafts',
        description: 'List all backtest scripts currently saved in the sandboxed backtest-drafts folder.',
        inputSchema: {},
    },
    async () => {
        const result = await listDraftBacktests();
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'read_draft_backtest',
    {
        title: 'Read a saved backtest draft',
        description: 'Read back the current source of a saved backtest script, e.g. before revising it.',
        inputSchema: {
            name: z.string().describe('Draft name, e.g. "sp_bobin_test_bt".'),
        },
    },
    async (args) => {
        const result = await readDraftBacktest(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'delete_draft_backtest',
    {
        title: 'Delete a saved backtest draft',
        description:
            'Permanently delete a backtest script from the sandboxed backtest-drafts folder. Use this to clean up ' +
            'abandoned/finished experiments so list_draft_backtests stays accurate.',
        inputSchema: {
            name: z.string().describe('Draft name to delete, e.g. "sp_bobin_test_bt".'),
        },
    },
    async (args) => {
        const result = await deleteDraftBacktest(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'list_backtest_datasets',
    {
        title: 'List external historical datasets for draft backtests',
        description:
            'List the server-side historical OHLCV datasets a backtest script can run on (see load_draft_backtest\'s ' +
            'dataset/timeframe/from/to arguments): name, symbol, UTC range, bar count, original timezone, and a data ' +
            'quality summary (gaps, duplicates, OHLC violations). All times exposed to scripts are UTC epoch ms. ' +
            'Datasets that were never loaded are reported as "not_ingested" without range/quality unless ingest=true ' +
            '(ingest = parse the CSV into the binary cache once; large files can take up to a minute).',
        inputSchema: {
            ingest: z.boolean().optional().describe('Ingest not-yet-cached datasets now so range/quality are shown. Default false.'),
        },
    },
    async (args) => {
        const result = await listBacktestDatasets({ ingest: !!args.ingest });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
);

server.registerTool(
    'load_draft_backtest',
    {
        title: 'Compile and run a draft backtest script against the live chart',
        description:
            'Compile a saved backtest script\'s TypeScript to JS and run it in the browser against the active ' +
            'chart. The script drives window.__agentBridge.handleCommand itself (fetch real OHLCV via ' +
            'get_chart_context, draw every simulated trade via draw_rectangle/draw_trendline/draw_callout) so the ' +
            'whole run happens in ONE call, with the strategy\'s decisions ending up as real drawings on the chart ' +
            'for visual verification — not just a number. Returns whatever the script set as ' +
            'globalThis.__draftBacktestResult. This only works in the browser (chart must be open). A run can take ' +
            'a while if it processes many bars/trades — this is expected.\n\n' +
            'OPTIONAL external dataset: pass dataset (see list_backtest_datasets) with timeframe/from/to to run on ' +
            'large historical data instead of the chart\'s loaded bars. The script then reads ' +
            'globalThis.__backtestData = { meta, t, o, h, l, c, v } (Float64Arrays of length meta.count, t = bar open ' +
            'time in UTC epoch ms) — set before it runs, deleted after. Max ' + MAX_BARS.toLocaleString('en-US') + ' bars per load; if ' +
            'exceeded you get an error: use a larger timeframe or a narrower from/to. Omit dataset for the ' +
            'unchanged chart-context mode.',
        inputSchema: {
            name: z.string().describe('Draft name, e.g. "sp_bobin_test_bt".'),
            dataset: z.string().optional().describe('External dataset name from list_backtest_datasets, e.g. "XAU_1m".'),
            timeframe: z.enum(TIMEFRAMES).optional().describe('Bar timeframe for the dataset slice (UTC-aligned; "1d_ny" = 17:00 New York session day). Default "1h". Only used with dataset.'),
            from: z.union([z.string(), z.number()]).optional().describe('Range start, inclusive: ISO date/time (no zone = UTC) or epoch ms. Only used with dataset.'),
            to: z.union([z.string(), z.number()]).optional().describe('Range end, exclusive: ISO date/time (no zone = UTC) or epoch ms. Only used with dataset.'),
        },
    },
    async (args) => {
        const { js } = await compileDraftBacktest({ name: args.name });
        if (!args.dataset) {
            const result = await bridge.call('load_draft_backtest', { name: args.name, js }, 60000);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
        const t0 = Date.now();
        const slice = await buildBacktestSlice({
            dataset: args.dataset, timeframe: args.timeframe, from: args.from, to: args.to,
        });
        const sliceMs = Date.now() - t0;
        console.error(`[backtest-data] ${args.dataset} ${slice.meta.timeframe}: ${slice.meta.count} bars sliced in ${sliceMs} ms, ${(slice.buffer.byteLength / 1048576).toFixed(1)} MiB`);
        const result = await bridge.call(
            'load_draft_backtest',
            { name: args.name, js, dataMeta: slice.meta },
            300000,
            slice.buffer
        );
        return { content: [{ type: 'text', text: JSON.stringify({ ...result, dataset: slice.meta }) }] };
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
