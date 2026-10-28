/**
 * Indicator legend model (pure, no DOM).
 *
 * Every indicator can describe its on-chart legend row as: a short title, a list
 * of parameters (shown muted next to the title, TradingView style) and the current
 * value of each plot, each with the colour the plot is drawn in.
 */

export interface LegendPlot {
    /** Plot colour (the value text is painted with it) */
    color: string;
    /** Value at the legend bar; null/NaN renders as the "no value" glyph */
    value: number | null;
    /** Pre-formatted text, used instead of `value` when set (e.g. volume "1.2K") */
    text?: string;
}

export interface IndicatorLegendInfo {
    /** Short name without parameters, e.g. "RSI" */
    title: string;
    /** Parameters in display order, e.g. ["14", "close"] */
    params: string[];
    plots: LegendPlot[];
    /** Decimals for plot values; undefined picks an adaptive precision */
    precision?: number;
}

/** Glyph TradingView shows when a plot has no value on the bar */
export const LEGEND_NO_VALUE = '∅';

/** "EMA (20)" -> "EMA", "SuperTrend (10, 3): 1.23" -> "SuperTrend" */
export function legendTitleFromName(name: string): string {
    const cut = name.replace(/\s*[(:].*$/, '').trim();
    return cut || name.trim();
}

/** Parameters list: skips undefined/null/empty entries and stringifies the rest */
export function legendParams(...values: Array<string | number | boolean | null | undefined>): string[] {
    const out: string[] = [];
    for (const v of values) {
        if (v === undefined || v === null || v === '') continue;
        out.push(typeof v === 'number' ? formatLegendParam(v) : String(v));
    }
    return out;
}

/** Parameter number without float noise: 3 -> "3", 0.1 + 0.2 -> "0.3" */
export function formatLegendParam(v: number): string {
    if (!Number.isFinite(v)) return String(v);
    return String(Number(v.toPrecision(10)));
}

/** Bar index the legend should show: the given one when valid, else the last bar. */
export function legendBarIndex(dataLength: number, index: number | null | undefined): number {
    if (dataLength <= 0) return -1;
    if (index === null || index === undefined || !Number.isFinite(index)) return dataLength - 1;
    const i = Math.round(index);
    if (i < 0 || i >= dataLength) return dataLength - 1;
    return i;
}

/** Adaptive number of decimals so small prices keep their significant digits. */
export function adaptivePrecision(v: number): number {
    const abs = Math.abs(v);
    if (!Number.isFinite(abs) || abs >= 1 || abs === 0) return 2;
    return Math.min(8, Math.max(4, 3 - Math.floor(Math.log10(abs))));
}

/** Format a plot value with the indicator's precision (adaptive when undefined). */
export function formatLegendValue(v: number | null | undefined, precision?: number): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return LEGEND_NO_VALUE;
    return v.toFixed(precision ?? adaptivePrecision(v));
}

/** Compact volume: 1234 -> "1.23K" */
export function formatLegendVolume(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return LEGEND_NO_VALUE;
    const abs = Math.abs(v);
    if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (v / 1e3).toFixed(2) + 'K';
    return v.toFixed(2);
}

/** Text shown for one plot */
export function legendPlotText(plot: LegendPlot, precision?: number): string {
    return plot.text !== undefined ? plot.text : formatLegendValue(plot.value, precision);
}

/** Title line as one string (used for tooltips / tests): "RSI 14 close" */
export function legendTitleText(info: IndicatorLegendInfo): string {
    return [info.title, ...info.params].join(' ');
}
