import { z } from 'zod';

/**
 * Evo Script tools (owner developer channel: the desktop agent authenticates with the bearer token, so there is no
 * user-script / example restriction here, unlike the in-chart AI assistant). Each tool forwards to a command of the
 * same name handled in demo-ts.html (handleCommand) -> window.EvoScriptPanel.owner (chart-panels/evoscript-panel.js).
 */

export const EVO_GUIDE =
    'EVO SCRIPT (Pine-like scripts run by the in-browser Evo engine on the ACTIVE chart tab).\n' +
    'DIALECT: Pine Script v5 and v6 (auto-detected; "//@version=5|6" optional, default v6) plus the native JS dialect ("//@evo indicator(...)" / ' +
    '"strategy(...)" / "library(...)"). Supported: indicator()/strategy(), input.*, ta.* (sma ema rma wma rsi macd atr bb stoch supertrend pivots cross ...), ' +
    'math./str./array. namespaces, plot/plotshape/plotchar/bgcolor/hline/fill, label./line./box./table./polyline. drawing objects, alert/alertcondition, ' +
    'request.security (HTF data), strategy.entry/order/exit/close/close_all with Pine strategy() semantics (orders fill on the next bar open unless ' +
    'process_orders_on_close; pyramiding, commission, slippage, margin, default_qty_type). Anything unsupported shows up as a compile error or warning with line/column: read it and fix the source; ' +
    'evo_read_script {example} shows working scripts.\n' +
    'TWO DIFFERENT BACKTEST ENGINES: (1) The Evo Strategy Tester (evo_add_script / evo_get_strategy_report / evo_open_strategy_tester) runs the strategy() script ' +
    'on the chart bars with the Evo engine and Pine strategy() semantics: it reports what TradingView-style strategy settings would give (all/long/short ' +
    'stats, trades, equity, drawdown). (2) Draft backtests (write_draft_backtest / load_draft_backtest) use the separate `bt` engine with its own fill/cost model. ' +
    'Results of the same idea CAN differ between the two (fills, sizing, costs, bar data source). Always state which engine produced the numbers you quote.\n' +
    'WORKFLOW: evo_compile (check errors/warnings, cheap, nothing is added) -> evo_add_script (adds to the chart, saves to the library, returns run status ' +
    'and errors; compile errors are returned WITHOUT adding) -> evo_get_output (indicators: plot values, shapes, labels, logs, alerts) or ' +
    'evo_get_strategy_report (strategies: settings, All/Long/Short summary, trades, equity/drawdown) -> iterate with evo_update_script (new source, inputs, ' +
    'strategyOverrides; it re-runs immediately, no confirmation) or evo_set_params (parameter sweeps), then evo_remove_script to clean up. ' +
    'evo_list_scripts shows the saved library (incl. example names with examples=true) and what is on the chart; evo_read_script reads any library entry, chart script or shipped example ' +
    '(good style references). evo_open_strategy_tester shows the user the bottom dock for a strategy. list_active_indicators marks Evo indicators with evo:true and omits their source.\n' +
    'Row format in evo_get_output: "barIndex,UTC time,value" (barIndex = position in the chart bar array, same as get_chart_context). ' +
    'strategyOverrides = partial strategy settings (camelCase): initialCapital, currency, defaultQtyType ("fixed"|"cash"|"percent_of_equity"), defaultQtyValue, pyramiding, ' +
    'commissionType ("percent"|"cash_per_contract"|"cash_per_order"), commissionValue, slippage (ticks), processOrdersOnClose, closeEntriesRule ("FIFO"|"ANY"), marginLong, marginShort, ' +
    'calcOnOrderFills, riskFreeRate. Invalid/out-of-range values silently keep the script\'s own setting: verify via settings in evo_get_strategy_report.';

function text(result) {
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

export function registerEvoTools(server, bridge) {
    server.registerTool(
        'evo_list_scripts',
        {
            title: 'List Evo scripts (library + on chart)',
            description:
                'List the saved Evo Script library (id, name, type indicator|strategy|library, modified) and the Evo scripts currently on the active chart ' +
                '(chartId, name, type, status). Optionally also the names of the shipped example scripts (readable via evo_read_script {example}).\n\n' + EVO_GUIDE,
            inputSchema: {
                examples: z.boolean().optional().describe('Also list the shipped example script names. Default false.'),
            },
        },
        async (args) => text(await bridge.call('evo_list_scripts', args, 15000))
    );

    server.registerTool(
        'evo_read_script',
        {
            title: 'Read an Evo script source',
            description:
                'Return the full source of a saved library script (id), a script on the chart (chartId) or a shipped example (example, e.g. "supertrend.evo.js" or "pine/aroon.pine"). ' +
                'Pass exactly one of id / chartId / example. See evo_list_scripts for valid values.',
            inputSchema: {
                id: z.string().optional().describe('Library script id from evo_list_scripts.library'),
                chartId: z.string().optional().describe('Chart script id from evo_list_scripts.onChart'),
                example: z.string().optional().describe('Example file name from evo_list_scripts {examples:true}'),
            },
        },
        async (args) => text(await bridge.call('evo_read_script', args, 20000))
    );

    server.registerTool(
        'evo_compile',
        {
            title: 'Compile an Evo script (check only)',
            description:
                'Compile Evo/Pine source without adding it to the chart. Returns {ok, errors:[{line,column,kind,message}], warnings, meta:{title,kind,overlay}}. ' +
                'Source limit 50 KB. Use before evo_add_script to fix syntax/semantic errors cheaply.',
            inputSchema: {
                source: z.string().describe('Full Pine v5/v6 or Evo script source.'),
            },
        },
        async (args) => text(await bridge.call('evo_compile', args, 20000))
    );

    server.registerTool(
        'evo_add_script',
        {
            title: 'Add an Evo script to the active chart',
            description:
                'Compile and add a script to the ACTIVE chart tab (a strategy also fills the Strategy Tester), wait for its first run and return ' +
                '{ok, chartId, libraryId, status ("ok"|"error"|"timeout"), kind, errors, warnings, ms, bars, inputs, summary(strategies)}. ' +
                'Compile errors are returned (ok:false, added:false) without touching the chart. By default the script is also saved to the library. ' +
                'Then use evo_get_output / evo_get_strategy_report with the returned chartId.\n\n' + EVO_GUIDE,
            inputSchema: {
                source: z.string().describe('Full Pine v5/v6 or Evo script source (<= 50 KB).'),
                name: z.string().optional().describe('Display name; defaults to the indicator()/strategy() title.'),
                inputs: z.record(z.any()).optional().describe('Optional input overrides by input id, e.g. {"len": 21}. Check the returned inputs list.'),
                saveToLibrary: z.boolean().optional().describe('Save to the user\'s script library. Default true.'),
            },
        },
        async (args) => text(await bridge.call('evo_add_script', args, 60000))
    );

    server.registerTool(
        'evo_update_script',
        {
            title: 'Update an Evo script on the chart and re-run',
            description:
                'Change the source, inputs, strategy overrides and/or name of a script already on the chart, then re-run and return the run status ' +
                '(+ strategy summary). Applied immediately, no confirmation. New source is compiled first; on a compile error nothing changes and the errors are returned. ' +
                'If the script is linked to a library entry, the library source is updated too.',
            inputSchema: {
                chartId: z.string().describe('Chart script id from evo_list_scripts.onChart / evo_add_script.'),
                source: z.string().optional().describe('New full source.'),
                inputs: z.record(z.any()).optional().describe('Input values by input id (validated against the script\'s inputs when source is not changed).'),
                strategyOverrides: z.record(z.any()).optional().describe('Strategy Tester settings overrides, merged into the existing ones (strategies only).'),
                name: z.string().optional().describe('New display name.'),
            },
        },
        async (args) => text(await bridge.call('evo_update_script', args, 60000))
    );

    server.registerTool(
        'evo_remove_script',
        {
            title: 'Remove an Evo script from the chart',
            description: 'Remove a script from the active chart (the saved library entry is kept).',
            inputSchema: {
                chartId: z.string().describe('Chart script id from evo_list_scripts.onChart.'),
            },
        },
        async (args) => text(await bridge.call('evo_remove_script', args, 15000))
    );

    server.registerTool(
        'evo_get_output',
        {
            title: 'Get an Evo script\'s output',
            description:
                'Read the last run output of a script on the chart: plots and shapes (last N values as "barIndex,UTC time,value" rows), labels/lines/boxes (count + last items), ' +
                'polylines/hlines/fills counts, tables summary, logs, alertEvents, warnings, inputs and meta. Compact and size-capped (rows shrink automatically). ' +
                'chartId may be omitted when exactly one Evo script is on the chart.',
            inputSchema: {
                chartId: z.string().optional().describe('Chart script id; optional if only one Evo script is on the chart.'),
                last: z.number().int().min(1).max(500).optional().describe('How many last values/items per series (default 50).'),
            },
        },
        async (args) => text(await bridge.call('evo_get_output', args, 20000))
    );

    server.registerTool(
        'evo_get_strategy_report',
        {
            title: 'Get an Evo strategy report (Strategy Tester)',
            description:
                'Strategy Tester results of a strategy on the chart (Evo engine, Pine strategy() semantics, NOT the draft-backtest `bt` engine): settings, overrides, ' +
                'summary {all,long,short, maxDrawdown, sharpe, profitFactor, ...}, the most recent trades and sampled equity/drawdown curves ([barIndex, value]). ' +
                'Without chartId the single strategy on the chart is used.',
            inputSchema: {
                chartId: z.string().optional().describe('Chart script id; optional if exactly one strategy is on the chart.'),
                trades: z.number().int().min(0).max(500).optional().describe('How many most recent closed trades to return (default 100).'),
                equityPoints: z.number().int().min(2).max(1000).optional().describe('Sample size of the equity and drawdown curves (default 200).'),
            },
        },
        async (args) => text(await bridge.call('evo_get_strategy_report', args, 20000))
    );

    server.registerTool(
        'evo_set_params',
        {
            title: 'Change Evo script inputs / strategy settings and re-run',
            description:
                'Set input values (by input id) and/or strategy overrides on a script on the chart, re-run it and return the run status plus, for strategies, a short summary ' +
                '(use evo_get_strategy_report for details, evo_get_output for an indicator\'s new values). Inputs are validated (type/min/max). Good for parameter sweeps.',
            inputSchema: {
                chartId: z.string().optional().describe('Chart script id; optional if exactly one Evo script is on the chart.'),
                inputs: z.record(z.any()).optional().describe('Input values by input id, e.g. {"len": 14}.'),
                strategyOverrides: z.record(z.any()).optional().describe('Strategy Tester settings overrides (strategies only).'),
            },
        },
        async (args) => {
            const result = await bridge.call('evo_set_params', args, 60000);
            // Indicators: attach the fresh output so the agent does not need a second round trip.
            if (result && result.isIndicator && result.chartId && result.status === 'ok') {
                try {
                    result.output = await bridge.call('evo_get_output', { chartId: result.chartId, last: 10 }, 20000);
                } catch (e) {
                    result.outputError = String(e && e.message || e);
                }
            }
            return text(result);
        }
    );

    server.registerTool(
        'evo_open_strategy_tester',
        {
            title: 'Open the Strategy Tester dock',
            description: 'Open the bottom Strategy Tester dock of the chart page focused on a strategy, so the user can see it. Without chartId the single strategy on the chart is used.',
            inputSchema: {
                chartId: z.string().optional().describe('Strategy chart script id; optional if exactly one strategy is on the chart.'),
            },
        },
        async (args) => text(await bridge.call('evo_open_strategy_tester', args, 15000))
    );
}
