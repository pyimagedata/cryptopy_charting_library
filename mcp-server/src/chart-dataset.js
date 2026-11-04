import { buildChartSlice, CHART_MAX_BARS } from './backtest-data.js';

const iso = (ms) => new Date(ms).toISOString();

/**
 * load_dataset_to_chart: slice a backtest dataset (display cap = CHART_MAX_BARS)
 * and ship it to the active chart tab as one binary frame (same transport as
 * load_draft_backtest's dataset path). Returns the summary shown to the LLM.
 * Exported separately from index.js so it is testable with a fake bridge.
 */
export async function loadDatasetToChart(bridge, args, { chartMaxBars = CHART_MAX_BARS } = {}) {
    const slice = await buildChartSlice({
        dataset: args.dataset, timeframe: args.timeframe, from: args.from, to: args.to, chartMaxBars,
    });
    await bridge.call(
        'load_dataset_to_chart',
        { dataMeta: slice.meta, truncated: slice.truncated },
        300000,
        slice.buffer
    );
    const out = {
        dataset: args.dataset,
        timeframe: slice.meta.timeframe,
        barsShown: slice.meta.count,
        firstBarUtc: iso(slice.meta.firstT),
        lastBarUtc: iso(slice.meta.lastT),
        truncated: slice.truncated,
    };
    if (slice.truncated) {
        out.note = `Range had ${slice.totalBars.toLocaleString('en-US')} bars; only the most recent ${slice.meta.count.toLocaleString('en-US')} ` +
            `are shown (cap ${chartMaxBars.toLocaleString('en-US')}). Pass from/to or a higher timeframe to see other parts.`;
    }
    return out;
}
