/**
 * Plot / event registry of the indicators that can be used in indicator alerts (Phase 3a), the mapping from a chart
 * indicator instance to the `IndicatorRef` stored with an alert, and the text helpers for operands.
 *
 * Param keys are the library option keys; the server (Python port) uses exactly the same keys.
 */
import { getCurrentLanguage, t } from '../helpers/translations';
import { PREMIUM_EVENT_DEFS } from './premium-events';
import { formatLegendParam } from '../indicators/legend-info';
import { TYPE_ID_TO_CATALOG_ID, getIndicatorAccess, isIndicatorAllowed } from '../gui/indicator_search/indicator_access';
import type { AlertCondition, AlertEventId, IndicatorRef, Operand } from './types';

export interface AlertPlotDef {
    id: string;
    /** Localised label ("Sinyal"). */
    readonly label: string;
}
export interface AlertEventDef {
    id: AlertEventId;
    /** Localised label ("Al sinyali", "Yukarı kırılım"). */
    readonly label: string;
    /** English label used in the server's default message ("Buy signal", "Breakout Up"). */
    readonly labelEn: string;
}
export interface AlertableIndicatorDef {
    /** Catalogue id ("rsi"). */
    type: string;
    /** Short name used in labels ("RSI"). */
    title: string;
    plots: AlertPlotDef[];
    events: AlertEventDef[];
    /** Option keys sent to the server (in this order). */
    paramKeys: string[];
    /** Defaults used when an option is missing on the instance. */
    defaults: Record<string, number | string | boolean>;
    /** Option keys (subset of paramKeys) shown in the label, in legend order; strings are upper-cased. */
    labelKeys: string[];
    /** Premium (backend-computed) indicator: events only (Phase 3b); params = the overlay's request params, no defaults. */
    premium?: boolean;
}

/** Where a plot's value lives in an indicator data point: `value`, or `values[idx]` (+ optional forward displacement). */
interface PlotSource { idx: number | null; displaced?: boolean }

const plot = (id: string, key: string): AlertPlotDef => ({ id, get label() { return t(key); } });
const ev = (id: AlertEventId): AlertEventDef => ({
    id,
    get label() { return id === 'buy' ? t('Buy signal') : t('Sell signal'); },
    labelEn: id === 'buy' ? 'Buy signal' : 'Sell signal',
});

const P_VALUE = () => [plot('value', 'Value')];
const P_LINE = () => [plot('line', 'Line')];
const EVENTS = () => [ev('buy'), ev('sell')];
const SRC = 'close';

const DEFS: AlertableIndicatorDef[] = [
    { type: 'ema', title: 'EMA', plots: P_VALUE(), events: [], paramKeys: ['period', 'source'], defaults: { period: 20, source: SRC }, labelKeys: ['period'] },
    { type: 'sma', title: 'SMA', plots: P_VALUE(), events: [], paramKeys: ['period', 'source'], defaults: { period: 20, source: SRC }, labelKeys: ['period'] },
    { type: 'hma', title: 'HMA', plots: P_VALUE(), events: [], paramKeys: ['period', 'source'], defaults: { period: 9, source: SRC }, labelKeys: ['period'] },
    { type: 'rsi', title: 'RSI', plots: P_VALUE(), events: [], paramKeys: ['period'], defaults: { period: 14 }, labelKeys: ['period'] },
    {
        type: 'bb', title: 'BB', plots: [plot('basis', 'Middle'), plot('upper', 'Upper'), plot('lower', 'Lower')], events: [],
        paramKeys: ['period', 'stdDev', 'source'], defaults: { period: 20, stdDev: 2, source: SRC }, labelKeys: ['period', 'stdDev'],
    },
    {
        type: 'macd', title: 'MACD', plots: [plot('macd', 'MACD'), plot('signal', 'Signal'), plot('hist', 'Histogram')], events: [],
        paramKeys: ['fastPeriod', 'slowPeriod', 'signalPeriod', 'source'], defaults: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, source: SRC },
        labelKeys: ['fastPeriod', 'slowPeriod', 'signalPeriod'],
    },
    {
        type: 'stoch', title: 'Stoch', plots: [plot('k', '%K'), plot('d', '%D')], events: [],
        paramKeys: ['kPeriod', 'dPeriod', 'sPeriod'], defaults: { kPeriod: 14, dPeriod: 3, sPeriod: 3 }, labelKeys: ['kPeriod', 'sPeriod', 'dPeriod'],
    },
    {
        type: 'stochrsi', title: 'Stoch RSI', plots: [plot('k', '%K'), plot('d', '%D')], events: [],
        paramKeys: ['rsiPeriod', 'stochPeriod', 'kPeriod', 'dPeriod'], defaults: { rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3 },
        labelKeys: ['rsiPeriod', 'stochPeriod', 'kPeriod', 'dPeriod'],
    },
    {
        type: 'sar', title: 'SAR', plots: P_VALUE(), events: [], paramKeys: ['start', 'increment', 'maximum'],
        defaults: { start: 0.02, increment: 0.02, maximum: 0.2 }, labelKeys: ['start', 'increment', 'maximum'],
    },
    {
        type: 'supertrend', title: 'Supertrend', plots: P_LINE(), events: EVENTS(), paramKeys: ['period', 'multiplier', 'changeATR'],
        defaults: { period: 10, multiplier: 3, changeATR: true }, labelKeys: ['period', 'multiplier'],
    },
    {
        type: 'halftrend', title: 'HalfTrend', plots: P_LINE(), events: EVENTS(), paramKeys: ['amplitude', 'channelDeviation'],
        defaults: { amplitude: 2, channelDeviation: 2 }, labelKeys: ['amplitude', 'channelDeviation'],
    },
    {
        type: 'alphatrend', title: 'AlphaTrend', plots: P_LINE(), events: EVENTS(), paramKeys: ['multiplier', 'commonPeriod', 'noVolumeData'],
        defaults: { multiplier: 1, commonPeriod: 14, noVolumeData: false }, labelKeys: ['multiplier', 'commonPeriod'],
    },
    {
        type: 'ichimoku', title: 'Ichimoku',
        plots: [plot('conversion', 'Conversion'), plot('base', 'Base'), plot('lead_a', 'Leading A'), plot('lead_b', 'Leading B')], events: [],
        paramKeys: ['conversionPeriods', 'basePeriods', 'laggingSpan2Periods', 'displacement'],
        defaults: { conversionPeriods: 9, basePeriods: 26, laggingSpan2Periods: 52, displacement: 26 },
        labelKeys: ['conversionPeriods', 'basePeriods', 'laggingSpan2Periods', 'displacement'],
    },
    {
        type: 'volume', title: 'Volume', plots: [plot('volume', 'Volume'), plot('ma', 'MA')], events: [],
        paramKeys: ['maType', 'maPeriod'], defaults: { maType: 'sma', maPeriod: 20 }, labelKeys: ['maType', 'maPeriod'],
    },
];

/** Where each plot id is read from (client-side preview only; the server recomputes everything). */
const SOURCES: Record<string, Record<string, PlotSource>> = {
    ema: { value: { idx: null } },
    sma: { value: { idx: null } },
    hma: { value: { idx: null } },
    rsi: { value: { idx: null } },
    bb: { basis: { idx: 0 }, upper: { idx: 1 }, lower: { idx: 2 } },
    macd: { macd: { idx: 0 }, signal: { idx: 1 }, hist: { idx: null } },
    stoch: { k: { idx: 0 }, d: { idx: 1 } },
    stochrsi: { k: { idx: 0 }, d: { idx: 1 } },
    sar: { value: { idx: null } },
    supertrend: { line: { idx: null } },
    halftrend: { line: { idx: null } },
    alphatrend: { line: { idx: null } },
    // values = [conversion, base, lagging, leadA, leadB]; the lead lines are drawn `displacement - 1` bars forward
    ichimoku: { conversion: { idx: 0 }, base: { idx: 1 }, lead_a: { idx: 3, displaced: true }, lead_b: { idx: 4, displaced: true } },
    volume: { volume: { idx: null }, ma: { idx: 1 } },
};

export const ALERTABLE_INDICATORS: readonly AlertableIndicatorDef[] = DEFS;
/** Premium indicators with event alerts (mirror of the server's PREMIUM_EVENTS). */
export const PREMIUM_ALERT_INDICATORS: readonly AlertableIndicatorDef[] = PREMIUM_EVENT_DEFS.map((d) => ({
    type: d.type, title: d.title, plots: [], paramKeys: d.paramKeys.slice(), defaults: {}, labelKeys: [], premium: true,
    events: d.events.map((x) => ({
        id: x.id,
        get label() { return getCurrentLanguage() === 'tr' ? x.tr : x.en; },
        labelEn: x.en,
    })),
}));
const BY_TYPE = new Map<string, AlertableIndicatorDef>([...DEFS, ...PREMIUM_ALERT_INDICATORS].map((d) => [d.type, d]));

export function alertableIndicatorDef(type: string): AlertableIndicatorDef | null {
    return BY_TYPE.get(type) ?? null;
}

/** Catalogue id of an indicator class id ("BollingerBands" -> "bb") when it can be used in alerts, else null. */
export function alertCatalogId(typeId: string): string | null {
    const id = TYPE_ID_TO_CATALOG_ID[typeId];
    return id && BY_TYPE.has(id) ? id : null;
}

/** The slice of an Indicator the alert code reads. */
export interface AlertIndicatorLike {
    readonly id: string;
    readonly options: Readonly<Record<string, any>>;
    readonly data: readonly { value: number; values?: number[] }[];
}

function coerceParam(def: AlertableIndicatorDef, key: string, raw: unknown): number | string | boolean {
    const dflt = def.defaults[key];
    if (typeof dflt === 'number') { const n = Number(raw); return Number.isFinite(n) ? n : dflt; }
    if (typeof dflt === 'boolean') return typeof raw === 'boolean' ? raw : dflt;
    return typeof raw === 'string' && raw ? raw : dflt;
}

/** Legend-like label: "RSI 14", "MACD 12 26 9", "Volume SMA 20" (no source / flags). */
export function indicatorLabel(def: AlertableIndicatorDef, params: Record<string, number | string | boolean>): string {
    const parts: string[] = [def.title];
    for (const k of def.labelKeys) {
        const v = params[k];
        parts.push(typeof v === 'number' ? formatLegendParam(v) : String(v).toUpperCase());
    }
    return parts.join(' ');
}

/**
 * Chart indicator -> IndicatorRef (catalogue id from the typeId, params = only the alert-relevant option keys, label like
 * the legend title). null when the type is not alertable.
 */
export function indicatorRefFor(instance: AlertIndicatorLike, typeId: string): IndicatorRef | null {
    const type = alertCatalogId(typeId);
    const def = type ? BY_TYPE.get(type) : null;
    if (!def) return null;
    const params: Record<string, number | string | boolean> = {};
    for (const k of def.paramKeys) {
        if (def.premium) {
            // exactly what the overlay sends: the option as is (the server cleans it); unset / non-primitive options are left out
            const raw = instance.options[k];
            if (typeof raw === 'boolean' || typeof raw === 'string' || (typeof raw === 'number' && Number.isFinite(raw))) params[k] = raw;
        } else {
            params[k] = coerceParam(def, k, instance.options[k]);
        }
    }
    return { type: def.type, params, label: indicatorLabel(def, params), instanceId: instance.id };
}

/** Value of a plot at bar `index` (default: the last bar); null while the plot has no value (warm-up) or the id is unknown. */
export function plotValueAt(instance: AlertIndicatorLike, plotId: string, index?: number, type?: string): number | null {
    const data = instance.data;
    if (!data || data.length === 0) return null;
    let i = index === undefined ? data.length - 1 : index;
    const kind = type ?? '';
    const srcMap = kind ? SOURCES[kind] : undefined;
    let src: PlotSource | undefined = srcMap?.[plotId];
    if (!src) {
        // type not given: search the maps for a unique match of the plot id
        for (const m of Object.values(SOURCES)) if (m[plotId]) { src = m[plotId]; break; }
    }
    if (!src) return null;
    if (src.displaced) i -= Math.max(1, Number(instance.options.displacement ?? 26)) - 1;
    if (i < 0 || i >= data.length) return null;
    const p = data[i];
    const v = src.idx === null ? p.value : p.values?.[src.idx];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** An alertable indicator on a chart, as offered by the dialog. */
export interface AlertIndicatorEntry {
    ref: IndicatorRef;
    /** Current value of a plot (null: no value yet). */
    value(plotId: string): number | null;
}

/** Entries for the alertable, unlocked indicators among `instances` (`typeIdOf` = IndicatorManager.typeIdOf). */
export function alertIndicatorEntries(instances: readonly AlertIndicatorLike[], typeIdOf: (i: any) => string): AlertIndicatorEntry[] {
    const out: AlertIndicatorEntry[] = [];
    for (const inst of instances) {
        const typeId = typeIdOf(inst);
        const type = alertCatalogId(typeId);
        if (!type || !isIndicatorAllowed(getIndicatorAccess(), type)) continue;
        const ref = indicatorRefFor(inst, typeId);
        if (ref) out.push({ ref, value: (plotId) => plotValueAt(inst, plotId, undefined, type) });
    }
    return out;
}

/** Plot definition of an indicator ref (null when unknown). */
export function plotDef(ref: IndicatorRef, plotId: string): AlertPlotDef | null {
    return BY_TYPE.get(ref.type)?.plots.find((p) => p.id === plotId) ?? null;
}

/** Order-independent identity of an indicator ref (type + params with sorted keys; the server may reorder JSON keys). */
export function indicatorRefKey(r: IndicatorRef): string {
    const keys = Object.keys(r.params || {}).sort();
    return `${r.type}|${keys.map((k) => `${k}=${JSON.stringify(r.params[k])}`).join(',')}`;
}

/** Same indicator (type + params) regardless of the chart instance. */
export function sameIndicatorRef(a: IndicatorRef, b: IndicatorRef): boolean {
    return indicatorRefKey(a) === indicatorRefKey(b);
}

/** Short name of one plot inside its indicator: the indicator title for single-plot indicators ("RSI"), else the plot label ("Signal"). */
export function plotShortLabel(ref: IndicatorRef, plotId: string): string {
    const def = BY_TYPE.get(ref.type);
    if (!def) return plotId;
    if (def.plots.length === 1) return def.title;
    return plotDef(ref, plotId)?.label ?? plotId;
}

/** Localised label of an event of an indicator type ("Al sinyali" / "Yukarı kırılım"); the id for unknown events. */
export function eventLabel(type: string, ev: AlertEventId): string {
    return BY_TYPE.get(type)?.events.find((x) => x.id === ev)?.label ?? ev;
}

/** English event label of the server's default message ("Buy signal" / "Breakout Up"). */
export function eventLabelEn(type: string, ev: AlertEventId): string {
    return BY_TYPE.get(type)?.events.find((x) => x.id === ev)?.labelEn ?? ev;
}

/** Number exactly like the server's value label (`fmt_price_pretty`): full precision, no exponent, trailing zeros trimmed, comma-grouped. */
function numText(n: number): string {
    if (!Number.isFinite(n)) return '';
    if (n === 0) return '0';
    let txt = String(Math.abs(n));
    if (/e/i.test(txt)) txt = Math.abs(n).toFixed(20).replace(/\.?0+$/, '');
    const [whole, frac] = txt.split('.');
    return (n < 0 ? '-' : '') + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? '.' + frac : '');
}

/** Operand text for the UI (panel rows): ticker / number / "RSI 14" / "MACD 12 26 9 Sinyal" / "Supertrend 10 3 Al sinyali". */
export function operandLabel(op: Operand | null | undefined, ticker: string): string {
    if (!op) return '';
    switch (op.kind) {
        case 'price': return ticker;
        case 'value': return numText(op.value);
        case 'plot': {
            const def = BY_TYPE.get(op.indicator.type);
            return def && def.plots.length === 1 ? op.indicator.label : `${op.indicator.label} ${plotDef(op.indicator, op.plot)?.label ?? op.plot}`;
        }
        case 'event': return `${op.indicator.label} ${eventLabel(op.indicator.type, op.event)}`;
    }
}

/** Operand text of the server's default message: ticker / number / "<indicator label> <plot id>" / "<indicator label> <Buy|Sell> signal". */
export function operandMessageLabel(op: Operand | null | undefined, ticker: string): string {
    if (!op) return '';
    switch (op.kind) {
        case 'price': return ticker;
        case 'value': return numText(op.value);
        case 'plot': return BY_TYPE.get(op.indicator.type)?.plots.length === 1 ? op.indicator.label : `${op.indicator.label} ${op.plot}`;
        case 'event': return `${op.indicator.label} ${eventLabelEn(op.indicator.type, op.event)}`;
    }
}

/**
 * Server default message of an indicator alert (binding addendum): left price "<TICKER> <Cond EN> <right>", left plot
 * "<TICKER> <left> <Cond EN> <right>", channel "... <Cond EN> <lower> - <upper>", signal "<TICKER> <indicator label> <Buy|Sell> signal" (Premium: "<indicator label> <event EN label>").
 * A plot label is the indicator label for single-plot indicators, else "<indicator label> <plot id>".
 */
export function indicatorAutoMessage(
    ticker: string, conditionEn: string, condition: AlertCondition,
    left: Operand | null | undefined, right: Operand | null | undefined, right2: Operand | null | undefined,
): string {
    if (!left) return `${ticker} ${conditionEn}`;
    if (condition === 'signal' || left.kind === 'event') return `${ticker} ${operandMessageLabel(left, ticker)}`;
    const lab = (o: Operand | null | undefined) => operandMessageLabel(o, ticker);
    const rhs = right2 && right ? `${lab(right2)} - ${lab(right)}` : lab(right2) || lab(right);
    return [ticker, left.kind === 'price' ? '' : lab(left), conditionEn, rhs].filter((x) => x !== '').join(' ');
}
