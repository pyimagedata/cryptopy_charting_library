/**
 * Evo Script core: state, runner registry and run scheduling shared by the overlay and the
 * panel flavours of the `evo-script` indicator. No rendering here (see evo-script-render.ts).
 *
 * The host registers a runner (`setEvoScriptRunner`) that executes script source against OHLCV
 * columns and returns a RunOutput; the core only schedules runs, drops stale results (sequence
 * id) and keeps the latest normalized output.
 */

import { BarData } from '../model/data';
import { Delegate } from '../helpers/delegate';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EvoBarColumns {
    time: Float64Array;
    open: Float64Array;
    high: Float64Array;
    low: Float64Array;
    close: Float64Array;
    volume: Float64Array;
}

export interface EvoRunRequest {
    source: string;
    lang: 'pine' | 'evo' | 'auto';
    /** { inputId: value } overrides */
    inputs: Record<string, unknown>;
    bars: EvoBarColumns;
    /** Environment of the widget that owns the indicator (not the active widget) */
    chart: { symbol: string; exchange: string; timeframe: string; tickerid: string } | null;
    /** Forming-bar state (contract 2, section 5). `varip` is opaque: copied from the previous output of the same run key. */
    realtime?: { forming: boolean; varip?: unknown };
    /** Phase 4: strategy() argument overrides (only the whitelisted keys of sanitizeStrategyOverrides); absent when none */
    strategyOverrides?: Record<string, unknown>;
}

export type EvoScriptRunner = (req: EvoRunRequest) => Promise<unknown> | unknown;

export interface EvoScriptError {
    message: string;
    line?: number;
    col?: number;
    kind?: string;
}

export interface EvoScriptSettings {
    source: string;
    lang: 'pine' | 'evo' | 'auto';
    inputs: Record<string, unknown>;
    /** User given legend title ('' = use the script's own title) */
    name: string;
    /** Where it is rendered (updated from the first run's meta.overlay) */
    overlay: boolean;
    /** Phase 4: user overrides of strategy() arguments (Strategy Tester "Properties"); persisted with the indicator */
    strategyOverrides?: Record<string, unknown>;
}

export type EvoScriptStatus = 'idle' | 'running' | 'ok' | 'error';

export interface EvoInputDef {
    id: string;
    title: string;
    type: string;
    default?: unknown;
    value?: unknown;
    min?: number;
    max?: number;
    step?: number;
    group?: string;
    tooltip?: string;
    /** Inputs with the same inline id share one row in the settings dialog */
    inline?: string;
    confirm?: boolean;
    /** "none" / "data_window" inputs are left out of the legend argument list */
    display?: string;
    options?: Array<string | { value: string; label?: string }>;
}

// Normalized output ---------------------------------------------------------

export interface EvoPlot {
    title: string;
    values: Float64Array;
    color: string;
    linewidth: number;
    style: string;
    display: string;
    histbase: number;
    /** Per-bar colour index into EvoOutput.colorTable (0xFFFF = na: do not draw the bar) */
    colors?: Uint16Array;
    /** Bars the values are shifted by (only with meta.contract >= 2, else 0) */
    offset: number;
    trackprice: boolean;
    precision?: number;
    format?: string;
    showLast?: number;
    join: boolean;
    /** Pine force_overlay: drawn on the main pane even when the script lives in its own pane */
    forceOverlay?: boolean;
}
export interface EvoHLine { price: number; title: string; color: string; linestyle: string; linewidth: number; display: string }
export interface EvoFillRef { kind: 'plot' | 'hline'; ref: string }
export interface EvoFill {
    a: EvoFillRef; b: EvoFillRef; title: string; color?: string;
    topValue?: number; bottomValue?: number; topColor?: string; bottomColor?: string;
    display: string;
}
export interface EvoShape {
    title: string; values: Float64Array; style: string; location: string; color: string;
    textcolor: string; text: string; size: string; char: string; display: string;
    colors?: Uint16Array;
    textColors?: Uint16Array;
    offset: number;
    showLast?: number;
    forceOverlay?: boolean;
}
export interface EvoBgBand { from: number; to: number; color: string; offset: number }
export interface EvoLabel {
    bar: number; price: number; text: string; style: string; color: string; textcolor: string; size: string;
    yloc: string; textalign: string; tooltip?: string; fontFamily?: string; textFormatting?: string; forceOverlay?: boolean;
}
export interface EvoBox {
    left: number; right: number; top: number; bottom: number; fill?: string; border?: string; text?: string;
    borderWidth: number; borderStyle: string; extend: string; textSize: string; textColor?: string;
    textHalign: string; textValign: string; textWrap: string; fontFamily?: string; textFormatting?: string; forceOverlay?: boolean;
}
export interface EvoLine {
    x1: number; y1: number; x2: number; y2: number; extend: string; color: string; style: string; width: number; forceOverlay?: boolean;
}
export interface EvoPolyPoint { x: number; y: number; time?: number }
export interface EvoPolyline {
    points: EvoPolyPoint[]; xloc: string; curved: boolean; closed: boolean;
    lineColor: string; fillColor?: string; lineStyle: string; lineWidth: number; forceOverlay: boolean;
}
/** line1 / line2 are indices into EvoOutput.lines (already remapped to the normalized array) */
export interface EvoLinefill { line1: number; line2: number; color: string; forceOverlay?: boolean }

export interface EvoTableCell {
    col: number; row: number; text: string;
    width?: number; height?: number;
    textColor?: string; textHalign?: string; textValign?: string; textSize?: string | number;
    bgcolor?: string; tooltip?: string; fontFamily?: string; textWrap?: string; textFormatting?: string;
    merge?: { toCol: number; toRow: number };
}
export interface EvoTable {
    position: string; columns: number; rows: number;
    bgcolor?: string; frameColor?: string; frameWidth: number; borderColor?: string; borderWidth: number;
    forceOverlay: boolean; cells: EvoTableCell[];
}
export interface EvoCandles {
    title: string; kind: 'candle' | 'bar';
    open: Float64Array; high: Float64Array; low: Float64Array; close: Float64Array;
    color?: string; colors?: Uint16Array; wickColor?: string; wickColors?: Uint16Array; borderColor?: string; borderColors?: Uint16Array;
    display: string; offset: number;
}
export interface EvoArrow {
    title: string; values: Float64Array; colorUp: string; colorDown: string; colorsUp?: Uint16Array; colorsDown?: Uint16Array;
    offset: number; minHeight: number; maxHeight: number; display: string;
}
export interface EvoLogEntry { bar: number; level: 'info' | 'warning' | 'error'; message: string }
export interface EvoAlertEvent { bar: number; message: string; freq: string }
/** Log / alert row as handed to the host (bar time in ms) */
export interface EvoLogRow { bar: number; time: number; level: string; message: string; freq?: string }

// Strategy (Phase 4, contract 5) --------------------------------------------

export interface EvoStrategySettings {
    initialCapital: number; currency: string; defaultQtyType: 'fixed' | 'cash' | 'percent_of_equity'; defaultQtyValue: number;
    pyramiding: number; commissionType: 'percent' | 'cash_per_contract' | 'cash_per_order'; commissionValue: number;
    slippage: number; processOrdersOnClose: boolean; closeEntriesRule: 'FIFO' | 'ANY';
    marginLong: number; marginShort: number; calcOnOrderFills: boolean; useBarMagnifier: boolean; fillOrders: string; riskFreeRate: number;
}
export interface EvoStrategyTrade {
    id: number; entryId: string; exitId: string; direction: 'long' | 'short'; qty: number;
    entryBar: number; entryTime: number; entryPrice: number; entryComment?: string;
    exitBar: number; exitTime: number; exitPrice: number; exitComment?: string;
    profit: number; profitPercent: number; commission: number; cumProfit: number;
    maxRunup: number; maxRunupPercent: number; maxDrawdown: number; maxDrawdownPercent: number;
}
export interface EvoStrategyOpenTrade {
    id: number; entryId: string; direction: 'long' | 'short'; qty: number;
    entryBar: number; entryTime: number; entryPrice: number; entryComment?: string;
    profit: number; profitPercent: number; commission: number;
}
export interface EvoStrategyFill {
    bar: number; time: number; price: number; qty: number; orderId: string; kind: 'entry' | 'exit' | 'close' | 'order'; comment?: string;
}
export const EVO_METRIC_KEYS = [
    'netProfit', 'netProfitPercent', 'grossProfit', 'grossProfitPercent', 'grossLoss', 'grossLossPercent', 'commissionPaid',
    'totalTrades', 'openTrades', 'winningTrades', 'losingTrades', 'evenTrades', 'percentProfitable', 'avgTrade', 'avgTradePercent',
    'avgWinningTrade', 'avgWinningTradePercent', 'avgLosingTrade', 'avgLosingTradePercent', 'ratioAvgWinLoss',
    'largestWinningTrade', 'largestWinningTradePercent', 'largestLosingTrade', 'largestLosingTradePercent',
    'avgBarsInTrade', 'avgBarsInWinningTrade', 'avgBarsInLosingTrade', 'maxContractsHeld',
] as const;
/** Every key is present; NaN = not available */
export type EvoStrategyMetrics = Record<typeof EVO_METRIC_KEYS[number], number>;
export interface EvoStrategySummary {
    all: EvoStrategyMetrics; long: EvoStrategyMetrics; short: EvoStrategyMetrics;
    maxDrawdown: number; maxDrawdownPercent: number; maxRunup: number; maxRunupPercent: number;
    buyHoldReturn: number; buyHoldReturnPercent: number; sharpe: number | null; sortino: number | null; profitFactor: number | null;
    marginCalls: number; openPL: number;
}
export interface EvoStrategy {
    settings: EvoStrategySettings;
    trades: EvoStrategyTrade[];
    openTrades: EvoStrategyOpenTrade[];
    fills: EvoStrategyFill[];
    equity: Float64Array; drawdown: Float64Array; buyHold: Float64Array; positionSize: Float64Array;
    summary: EvoStrategySummary;
    truncated: boolean;
}

export interface EvoOutput {
    meta: { title: string; shortTitle: string; overlay: boolean; precision?: number; format?: string; contract?: number; lastBarForming?: boolean; kind?: 'indicator' | 'strategy' };
    /** Phase 4: present for strategy() scripts (safe copy: prototype-less objects, capped lists and strings) */
    strategy?: EvoStrategy;
    /** Unique resolved colours referenced by the per-bar colour arrays */
    colorTable: string[];
    /** Opaque realtime state, handed back to the next run */
    varip?: unknown;
    inputs: EvoInputDef[];
    plots: EvoPlot[];
    hlines: EvoHLine[];
    fills: EvoFill[];
    shapes: EvoShape[];
    bgcolors: EvoBgBand[];
    labels: EvoLabel[];
    boxes: EvoBox[];
    lines: EvoLine[];
    polylines: EvoPolyline[];
    linefills: EvoLinefill[];
    tables: EvoTable[];
    /** Per-bar candle colour overrides (index into colorTable, 0xFFFF = none), applied to the main series */
    barColors?: Uint16Array;
    barColorOffset: number;
    candles: EvoCandles[];
    arrows: EvoArrow[];
    logs: EvoLogEntry[];
    alertEvents: EvoAlertEvent[];
    warnings: Array<{ message: string; line?: number; column?: number }>;
}

export interface EvoScriptState {
    id: string;
    name: string;
    source: string;
    lang: string;
    inputs: Record<string, unknown>;
    status: EvoScriptStatus;
    error: EvoScriptError | null;
    overlay: boolean;
    inputDefs: EvoInputDef[];
    warnings: EvoOutput['warnings'];
    meta: EvoOutput['meta'] | null;
    ms: number | null;
    runCount: number;
    lastBars: number;
    lastRunMs: number | null;
    /** log.* calls of the last run (bar time in ms) */
    logs: EvoLogRow[];
    /** alert() calls of the last run */
    alertEvents: EvoLogRow[];
    /** Chart time zone ('' = unknown) for date-time inputs and log times */
    timezone: string;
    /** Phase 4: 'strategy' when the last output has a strategy block */
    kind: 'indicator' | 'strategy';
    /** Strategy block of the last output (null for indicators / failed runs) */
    strategy: EvoStrategy | null;
    /** Persisted strategy() overrides */
    strategyOverrides: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Runner registry
// ---------------------------------------------------------------------------

let _runner: EvoScriptRunner | null = null;
const _cores = new Set<EvoScriptCore>();
/** Fires for any core state change (status / result / error); widgets filter by id */
export const evoScriptEvents = new Delegate<EvoScriptState>();

export function setEvoScriptRunner(fn: EvoScriptRunner | null): void {
    _runner = typeof fn === 'function' ? fn : null;
    if (_runner) for (const c of [..._cores]) c.runnerAvailable();
}

export function getEvoScriptRunner(): EvoScriptRunner | null {
    return _runner;
}

// ---------------------------------------------------------------------------
// Normalization (accepts the engine shape and the contract shape)
// ---------------------------------------------------------------------------

const asNumArray = (v: unknown): Float64Array => {
    if (v instanceof Float64Array) return v;
    const src = (v ?? []) as ArrayLike<unknown>;
    const out = new Float64Array(src.length);
    for (let i = 0; i < src.length; i++) {
        const x = src[i];
        out[i] = typeof x === 'number' ? x : (x === true ? 1 : NaN);
    }
    return out;
};
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const opt = (o: any, ...keys: string[]): unknown => {
    for (const k of keys) {
        if (o && o[k] !== undefined && o[k] !== null) return o[k];
        if (o?.opts && o.opts[k] !== undefined && o.opts[k] !== null) return o.opts[k];
    }
    return undefined;
};
const optStr = (o: any, d: string, ...keys: string[]): string => {
    const v = opt(o, ...keys);
    return typeof v === 'string' && v !== 'na' ? v : d;
};

const asColorIdx = (v: unknown): Uint16Array | undefined => {
    if (!v || typeof (v as any).length !== 'number') return undefined;
    if (v instanceof Uint16Array) return v;
    const src = v as ArrayLike<unknown>;
    const o = new Uint16Array(src.length);
    for (let i = 0; i < src.length; i++) {
        const x = src[i];
        o[i] = typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 0xFFFF ? x : 0xFFFF;
    }
    return o;
};
const optNum = (o: any, ...keys: string[]): number | undefined => {
    const v = opt(o, ...keys);
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

const DEFAULT_PLOT_COLORS = ['#2962ff', '#ff6d00', '#26a69a', '#e91e63', '#9c27b0', '#fdd835', '#00bcd4', '#8bc34a'];

function normFillRef(x: any, kind?: string): EvoFillRef {
    if (x && typeof x === 'object') return { kind: x.kind === 'hline' ? 'hline' : 'plot', ref: String(x.ref ?? x.title ?? '') };
    return { kind: kind === 'hline' ? 'hline' : 'plot', ref: String(x ?? '') };
}

/** Own-key-only copy of a keyed map into a prototype-less object (keys such as __proto__ / constructor stay plain data) */
function safeMap(m: unknown): Record<string, any> {
    const o: Record<string, any> = Object.create(null);
    if (m && typeof m === 'object' && !Array.isArray(m)) {
        for (const k of Object.keys(m as object)) {
            Object.defineProperty(o, k, { value: (m as any)[k], enumerable: true, writable: true, configurable: true });
        }
    }
    return o;
}
/** force_overlay flag of a raw object (plain key, snake_case or inside opts) */
const fo = (o: any): boolean | undefined => (opt(o, 'forceOverlay', 'force_overlay') === true ? true : undefined);
const fmtOf = (v: unknown): string | undefined => (typeof v === 'string' && /bold|italic/.test(v) ? v : undefined);

// ---------------------------------------------------------------------------
// Strategy block (Phase 4): safe copy. Objects are prototype-less, only known keys are read, strings and lists are capped.
// ---------------------------------------------------------------------------

const MAX_TRADES = 5000, MAX_FILLS = 5000, MAX_OPEN_TRADES = 200, MAX_BAR_SERIES = 2_000_000;
const MAX_ID = 100, MAX_COMMENT = 200;

const capStr = (v: unknown, max: number): string => (typeof v === 'string' ? (v.length > max ? v.slice(0, max) : v) : '');
const optCap = (v: unknown, max: number): string | undefined => { const s = capStr(v, max); return s === '' ? undefined : s; };
const fin = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const finOrNaN = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? v as T : d);
const nullNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const barSeries = (v: unknown): Float64Array => {
    const a = asNumArray(v);
    return a.length > MAX_BAR_SERIES ? a.subarray(0, MAX_BAR_SERIES) : a;
};

function normMetrics(m: any): EvoStrategyMetrics {
    const o = Object.create(null) as EvoStrategyMetrics;
    for (const k of EVO_METRIC_KEYS) o[k] = finOrNaN(m && typeof m === 'object' ? m[k] : undefined);
    return o;
}

function normStrategySettings(s: any): EvoStrategySettings {
    const o = Object.create(null) as EvoStrategySettings;
    o.initialCapital = fin(s?.initialCapital, 0);
    o.currency = capStr(s?.currency, 12) || 'USD';
    o.defaultQtyType = oneOf(s?.defaultQtyType, ['fixed', 'cash', 'percent_of_equity'] as const, 'fixed');
    o.defaultQtyValue = fin(s?.defaultQtyValue, 1);
    o.pyramiding = Math.max(0, Math.round(fin(s?.pyramiding, 1)));
    o.commissionType = oneOf(s?.commissionType, ['percent', 'cash_per_contract', 'cash_per_order'] as const, 'percent');
    o.commissionValue = fin(s?.commissionValue, 0);
    o.slippage = fin(s?.slippage, 0);
    o.processOrdersOnClose = s?.processOrdersOnClose === true;
    o.closeEntriesRule = s?.closeEntriesRule === 'ANY' ? 'ANY' : 'FIFO';
    o.marginLong = fin(s?.marginLong, 0);
    o.marginShort = fin(s?.marginShort, 0);
    o.calcOnOrderFills = s?.calcOnOrderFills === true;
    o.useBarMagnifier = s?.useBarMagnifier === true;
    o.fillOrders = capStr(s?.fillOrders, 20) || 'standard';
    o.riskFreeRate = fin(s?.riskFreeRate, 0);
    return o;
}

export function normalizeStrategy(raw: any): EvoStrategy | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const trades: EvoStrategyTrade[] = [];
    const rt = Array.isArray(raw.trades) ? raw.trades : [];
    for (let i = Math.max(0, rt.length - MAX_TRADES); i < rt.length; i++) {
        const t = rt[i];
        if (!t || typeof t !== 'object') continue;
        const o = Object.create(null) as EvoStrategyTrade;
        o.id = Math.round(fin(t.id, i + 1));
        o.entryId = capStr(t.entryId, MAX_ID); o.exitId = capStr(t.exitId, MAX_ID);
        o.direction = t.direction === 'short' ? 'short' : 'long';
        o.qty = fin(t.qty, 0);
        o.entryBar = Math.round(fin(t.entryBar, -1)); o.entryTime = fin(t.entryTime, NaN); o.entryPrice = fin(t.entryPrice, NaN);
        o.entryComment = optCap(t.entryComment, MAX_COMMENT);
        o.exitBar = Math.round(fin(t.exitBar, -1)); o.exitTime = fin(t.exitTime, NaN); o.exitPrice = fin(t.exitPrice, NaN);
        o.exitComment = optCap(t.exitComment, MAX_COMMENT);
        o.profit = fin(t.profit); o.profitPercent = fin(t.profitPercent); o.commission = fin(t.commission); o.cumProfit = fin(t.cumProfit);
        o.maxRunup = fin(t.maxRunup); o.maxRunupPercent = fin(t.maxRunupPercent);
        o.maxDrawdown = fin(t.maxDrawdown); o.maxDrawdownPercent = fin(t.maxDrawdownPercent);
        trades.push(o);
    }
    const openTrades: EvoStrategyOpenTrade[] = [];
    for (const t of (Array.isArray(raw.openTrades) ? raw.openTrades : []).slice(0, MAX_OPEN_TRADES)) {
        if (!t || typeof t !== 'object') continue;
        const o = Object.create(null) as EvoStrategyOpenTrade;
        o.id = Math.round(fin(t.id, openTrades.length + 1));
        o.entryId = capStr(t.entryId, MAX_ID);
        o.direction = t.direction === 'short' ? 'short' : 'long';
        o.qty = fin(t.qty, 0);
        o.entryBar = Math.round(fin(t.entryBar, -1)); o.entryTime = fin(t.entryTime, NaN); o.entryPrice = fin(t.entryPrice, NaN);
        o.entryComment = optCap(t.entryComment, MAX_COMMENT);
        o.profit = fin(t.profit); o.profitPercent = fin(t.profitPercent); o.commission = fin(t.commission);
        openTrades.push(o);
    }
    const fills: EvoStrategyFill[] = [];
    const rf = Array.isArray(raw.fills) ? raw.fills : [];
    let sorted = true;
    for (let i = Math.max(0, rf.length - MAX_FILLS); i < rf.length; i++) {
        const f = rf[i];
        if (!f || typeof f !== 'object') continue;
        const bar = Math.round(fin(f.bar, NaN)), price = fin(f.price, NaN), qty = fin(f.qty, NaN);
        if (!Number.isFinite(bar) || !Number.isFinite(price) || !Number.isFinite(qty) || qty === 0) continue;
        const o = Object.create(null) as EvoStrategyFill;
        o.bar = bar; o.time = fin(f.time, NaN); o.price = price; o.qty = qty;
        o.orderId = capStr(f.orderId, MAX_ID);
        o.kind = oneOf(f.kind, ['entry', 'exit', 'close', 'order'] as const, 'order');
        o.comment = optCap(f.comment, MAX_COMMENT);
        if (fills.length && fills[fills.length - 1].bar > bar) sorted = false;
        fills.push(o);
    }
    if (!sorted) fills.sort((a, b) => a.bar - b.bar); // stable: the renderer culls by binary search on bar
    const sm = raw.summary && typeof raw.summary === 'object' ? raw.summary : {};
    const summary = Object.create(null) as EvoStrategySummary;
    summary.all = normMetrics(sm.all); summary.long = normMetrics(sm.long); summary.short = normMetrics(sm.short);
    summary.maxDrawdown = finOrNaN(sm.maxDrawdown); summary.maxDrawdownPercent = finOrNaN(sm.maxDrawdownPercent);
    summary.maxRunup = finOrNaN(sm.maxRunup); summary.maxRunupPercent = finOrNaN(sm.maxRunupPercent);
    summary.buyHoldReturn = finOrNaN(sm.buyHoldReturn); summary.buyHoldReturnPercent = finOrNaN(sm.buyHoldReturnPercent);
    summary.sharpe = nullNum(sm.sharpe); summary.sortino = nullNum(sm.sortino); summary.profitFactor = nullNum(sm.profitFactor);
    summary.marginCalls = fin(sm.marginCalls, 0); summary.openPL = fin(sm.openPL, 0);
    const st = Object.create(null) as EvoStrategy;
    st.settings = normStrategySettings(raw.settings);
    st.trades = trades; st.openTrades = openTrades; st.fills = fills;
    st.equity = barSeries(raw.equity); st.drawdown = barSeries(raw.drawdown);
    st.buyHold = barSeries(raw.buyHold); st.positionSize = barSeries(raw.positionSize);
    st.summary = summary;
    st.truncated = raw.truncated === true;
    return st;
}

const STRATEGY_QTY_TYPES = ['fixed', 'cash', 'percent_of_equity'] as const;
const STRATEGY_COMM_TYPES = ['percent', 'cash_per_contract', 'cash_per_order'] as const;

/** Keeps only the known strategy() override keys with valid values (the runner receives exactly this) */
export function sanitizeStrategyOverrides(v: unknown): Record<string, unknown> {
    const o: Record<string, unknown> = Object.create(null);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return o;
    const src = v as Record<string, unknown>;
    const num0 = (k: string, min: number, max: number, int = false): void => {
        const x = src[k];
        if (typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max) o[k] = int ? Math.round(x) : x;
    };
    num0('initialCapital', 1e-9, 1e15);
    if (typeof src.defaultQtyType === 'string' && (STRATEGY_QTY_TYPES as readonly string[]).includes(src.defaultQtyType)) o.defaultQtyType = src.defaultQtyType;
    num0('defaultQtyValue', 0, 1e15);
    num0('pyramiding', 0, 1000, true);
    if (typeof src.commissionType === 'string' && (STRATEGY_COMM_TYPES as readonly string[]).includes(src.commissionType)) o.commissionType = src.commissionType;
    num0('commissionValue', 0, 1e12);
    num0('slippage', 0, 1e6, true);
    if (typeof src.processOrdersOnClose === 'boolean') o.processOrdersOnClose = src.processOrdersOnClose;
    return o;
}


export function normalizeEvoOutput(raw0: any): EvoOutput {
    const raw: any = raw0 && typeof raw0 === 'object' ? { ...raw0 } : {};
    raw.plots = safeMap(raw.plots); raw.plotOpts = safeMap(raw.plotOpts); raw.plotColors = safeMap(raw.plotColors);
    raw.shapes = safeMap(raw.shapes); raw.shapeOpts = safeMap(raw.shapeOpts);
    raw.shapeColors = safeMap(raw.shapeColors); raw.shapeTextColors = safeMap(raw.shapeTextColors);
    raw.alerts = safeMap(raw.alerts); raw.alertMessages = safeMap(raw.alertMessages);
    const meta = raw?.meta ?? {};
    const out: EvoOutput = {
        meta: {
            title: str(meta.title, 'Evo Script'),
            shortTitle: str(meta.shortTitle ?? meta.shorttitle, ''),
            overlay: meta.overlay === true,
            precision: typeof meta.precision === 'number' ? meta.precision : undefined,
            format: typeof meta.format === 'string' ? meta.format : undefined,
            contract: typeof meta.contract === 'number' ? meta.contract : undefined,
            lastBarForming: meta.lastBarForming === true ? true : undefined,
            kind: meta.kind === 'strategy' ? 'strategy' : (meta.kind === 'indicator' ? 'indicator' : undefined),
        },
        colorTable: Array.isArray(raw?.colorTable) ? raw.colorTable.map((c: unknown) => String(c)) : [],
        varip: raw?.varip,
        inputs: Array.isArray(raw?.inputs) ? raw.inputs.map((d: any): EvoInputDef => ({
            id: String(d.id ?? d.title), title: String(d.title ?? d.id), type: String(d.type ?? 'float'),
            default: d.default, value: d.value !== undefined ? d.value : d.default,
            min: d.min, max: d.max, step: d.step, group: d.group, tooltip: d.tooltip,
            inline: typeof d.inline === 'string' && d.inline ? d.inline : undefined, confirm: d.confirm === true ? true : undefined,
            display: typeof (d.display ?? d.opts?.display) === 'string' ? (d.display ?? d.opts?.display) : undefined,
            options: Array.isArray(d.options) ? d.options : (Array.isArray(d.opts?.options) ? d.opts.options : undefined),
        })) : [],
        plots: [], hlines: [], fills: [], shapes: [], bgcolors: [], labels: [], boxes: [], lines: [], polylines: [], linefills: [],
        tables: [], barColors: undefined, barColorOffset: 0, candles: [], arrows: [], logs: [], alertEvents: [],
        warnings: Array.isArray(raw?.warnings) ? raw.warnings : [],
    };

    const v2 = (out.meta.contract ?? 0) >= 2; // offset is applied by the renderer only for contract >= 2
    const offOf = (o: any): number => (v2 ? Math.max(-500, Math.min(500, Math.round(optNum(o, 'offset') ?? 0))) : 0);
    let pi = 0;
    for (const [title, vals] of Object.entries<any>(raw?.plots ?? {})) {
        const po = raw?.plotOpts?.[title] ?? {};
        out.plots.push({
            title, values: asNumArray(vals),
            color: optStr(po, DEFAULT_PLOT_COLORS[pi % DEFAULT_PLOT_COLORS.length], 'color'),
            linewidth: num(opt(po, 'linewidth', 'lineWidth'), 2),
            style: optStr(po, 'line', 'style').replace(/^style_/, ''),
            display: optStr(po, 'all', 'display'),
            histbase: num(opt(po, 'histbase'), 0),
            colors: asColorIdx(raw?.plotColors?.[title]),
            offset: offOf(po),
            trackprice: opt(po, 'trackprice') === true,
            precision: optNum(po, 'precision'),
            format: optStr(po, '', 'format') || undefined,
            showLast: optNum(po, 'showLast', 'show_last'),
            join: opt(po, 'join') === true,
            forceOverlay: fo(po),
        });
        pi++;
    }
    for (const h of raw?.hlines ?? []) {
        out.hlines.push({
            price: num(h.price, NaN), title: str(h.title),
            color: optStr(h, '#787b86', 'color'), linestyle: optStr(h, 'dashed', 'linestyle').replace(/^style_/, ''),
            linewidth: num(opt(h, 'linewidth'), 1), display: optStr(h, 'all', 'display'),
        });
    }
    for (const f of raw?.fills ?? []) {
        const kinds: string[] = Array.isArray(f.kinds) ? f.kinds : [];
        out.fills.push({
            a: normFillRef(f.a, kinds[0]), b: normFillRef(f.b, kinds[1]), title: str(f.title),
            color: optStr(f, '', 'color') || undefined,
            topValue: typeof opt(f, 'topValue', 'top_value') === 'number' ? opt(f, 'topValue', 'top_value') as number : undefined,
            bottomValue: typeof opt(f, 'bottomValue', 'bottom_value') === 'number' ? opt(f, 'bottomValue', 'bottom_value') as number : undefined,
            topColor: optStr(f, '', 'topColor', 'top_color') || undefined,
            bottomColor: optStr(f, '', 'bottomColor', 'bottom_color') || undefined,
            display: optStr(f, 'all', 'display'),
        });
    }
    for (const [title, vals] of Object.entries<any>(raw?.shapes ?? {})) {
        const so = raw?.shapeOpts?.[title] ?? {};
        out.shapes.push({
            title, values: asNumArray(vals),
            style: optStr(so, 'xcross', 'style').replace(/^shape_/, ''),
            location: optStr(so, 'abovebar', 'location').replace(/^location\./, ''),
            color: optStr(so, '#2962ff', 'color'), textcolor: optStr(so, '', 'textcolor'),
            text: optStr(so, '', 'text'), size: optStr(so, 'small', 'size').replace(/^size\./, ''),
            char: optStr(so, '', 'char'), display: optStr(so, 'all', 'display'),
            colors: asColorIdx(raw?.shapeColors?.[title]),
            textColors: asColorIdx(raw?.shapeTextColors?.[title]),
            offset: offOf(so),
            showLast: optNum(so, 'showLast', 'show_last'),
            forceOverlay: fo(so),
        });
    }
    for (const b of raw?.bgcolors ?? []) {
        const boff = offOf(b);
        if (Array.isArray(b?.runs)) {
            for (const r of b.runs) if (typeof r?.color === 'string') out.bgcolors.push({ from: num(r.from, 0), to: num(r.to, 0), color: r.color, offset: boff });
        } else if (typeof b?.color === 'string') {
            out.bgcolors.push({ from: num(b.from, 0), to: num(b.to, num(b.from, 0)), color: b.color, offset: boff });
        }
    }
    for (const l of raw?.labels ?? []) {
        const price = num(l.price, NaN);
        out.labels.push({
            bar: num(l.bar, NaN), price, text: str(l.text),
            style: optStr(l, 'down', 'style').replace(/^style_/, '').replace(/^label_?/, '').replace(/_/g, '') || 'down',
            color: optStr(l, '#2962ff', 'color'), textcolor: optStr(l, '', 'textcolor'),
            size: optStr(l, 'normal', 'size').replace(/^size\./, ''),
            yloc: optStr(l, 'price', 'yloc'), textalign: optStr(l, 'center', 'textalign'),
            tooltip: optStr(l, '', 'tooltip') || undefined,
            fontFamily: optStr(l, '', 'fontFamily', 'font_family') || undefined,
            textFormatting: fmtOf(opt(l, 'textFormatting', 'text_formatting')),
            forceOverlay: fo(l),
        });
    }
    for (const b of raw?.boxes ?? []) {
        const border = optStr(b, '', 'borderColor', 'border_color', 'bordercolor', 'color');
        const fill = optStr(b, '', 'bgcolor', 'fillcolor', 'fill', 'background');
        out.boxes.push({
            left: num(b.left, NaN), right: num(b.right, NaN), top: num(b.top, NaN), bottom: num(b.bottom, NaN),
            fill: fill || undefined, border: border || undefined, text: optStr(b, '', 'text') || undefined,
            borderWidth: num(opt(b, 'borderWidth'), 1), borderStyle: optStr(b, 'solid', 'borderStyle'),
            extend: optStr(b, 'none', 'extend'), textSize: optStr(b, 'normal', 'textSize'),
            textColor: optStr(b, '', 'textColor') || undefined,
            textHalign: optStr(b, 'center', 'textHalign'), textValign: optStr(b, 'center', 'textValign'),
            textWrap: optStr(b, 'none', 'textWrap'), fontFamily: optStr(b, '', 'fontFamily', 'font_family') || undefined,
            textFormatting: fmtOf(opt(b, 'textFormatting', 'text_formatting')),
            forceOverlay: fo(b),
        });
    }
    const lineMap = new Map<number, number>(); // raw line index -> normalized index (linefills refer to raw ones)
    let rawLi = -1;
    for (const l of raw?.lines ?? []) {
        rawLi++;
        const x1 = num(l.x1, NaN), y1 = num(l.y1, NaN), x2 = num(l.x2, NaN), y2 = num(l.y2, NaN);
        if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
        lineMap.set(rawLi, out.lines.length);
        out.lines.push({
            x1, y1, x2, y2, extend: str(l.extend, 'none'), color: str(l.color, '#2962ff'),
            style: str(l.style, 'solid').replace(/^style_/, ''), width: Math.max(1, num(l.width, 1)),
            forceOverlay: fo(l),
        });
    }
    // --- Phase 3 (contract 4): polylines, linefills ---
    for (const pl of (Array.isArray(raw?.polylines) ? raw.polylines : []).slice(-100)) {
        const pts: EvoPolyPoint[] = [];
        for (const q of (Array.isArray(pl?.points) ? pl.points : []).slice(0, 10000)) {
            const x = typeof q?.x === 'number' ? q.x : NaN, y = typeof q?.y === 'number' ? q.y : NaN;
            const time = typeof q?.time === 'number' && Number.isFinite(q.time) ? q.time : undefined;
            if (!Number.isFinite(y) || (!Number.isFinite(x) && time === undefined)) continue;
            pts.push({ x, y, time });
        }
        if (pts.length === 0) continue;
        const fc = typeof pl?.fillColor === 'string' && pl.fillColor !== '' && pl.fillColor !== 'na' ? pl.fillColor : undefined;
        out.polylines.push({
            points: pts, xloc: str(pl?.xloc, 'bar_index'), curved: pl?.curved === true, closed: pl?.closed === true,
            lineColor: str(pl?.lineColor, '#2962ff'), fillColor: fc,
            lineStyle: str(pl?.lineStyle, 'solid').replace(/^style_/, ''), lineWidth: Math.max(1, num(pl?.lineWidth, 1)),
            forceOverlay: pl?.forceOverlay === true,
        });
    }
    for (const f of Array.isArray(raw?.linefills) ? raw.linefills : []) {
        const a = lineMap.get(Math.round(num(f?.line1, -1))), b = lineMap.get(Math.round(num(f?.line2, -1)));
        if (a === undefined || b === undefined) continue;
        out.linefills.push({ line1: a, line2: b, color: str(f?.color, 'rgba(41,98,255,0.2)'), forceOverlay: fo(f) });
    }
    // --- Phase 2 (contract 3) ---
    const optCol = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' && v !== 'na' ? v : undefined);
    const nz = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    for (const t of Array.isArray(raw?.tables) ? raw.tables : []) {
        const columns = Math.max(1, Math.min(100, Math.round(num(t?.columns, 1))));
        const rows = Math.max(1, Math.min(100, Math.round(num(t?.rows, 1))));
        const cells: EvoTableCell[] = [];
        for (const c of Array.isArray(t?.cells) ? t.cells : []) {
            const col = Math.round(num(c?.col, -1)), row = Math.round(num(c?.row, -1));
            if (col < 0 || row < 0 || col >= columns || row >= rows) continue;
            const m = c?.merge && typeof c.merge === 'object' ? c.merge : null;
            const toCol = m ? Math.min(columns - 1, Math.round(num(m.toCol, col))) : col;
            const toRow = m ? Math.min(rows - 1, Math.round(num(m.toRow, row))) : row;
            const ts = c?.textSize;
            cells.push({
                col, row, text: str(c?.text),
                width: nz(c?.width), height: nz(c?.height),
                textFormatting: fmtOf(c?.textFormatting), textColor: optCol(c?.textColor), textHalign: optCol(c?.textHalign), textValign: optCol(c?.textValign),
                textSize: typeof ts === 'number' && Number.isFinite(ts) ? ts : (typeof ts === 'string' ? ts : undefined),
                bgcolor: optCol(c?.bgcolor), tooltip: optCol(c?.tooltip), fontFamily: optCol(c?.fontFamily), textWrap: optCol(c?.textWrap),
                merge: m && (toCol > col || toRow > row) ? { toCol: Math.max(col, toCol), toRow: Math.max(row, toRow) } : undefined,
            });
        }
        out.tables.push({
            position: str(t?.position, 'top_right'), columns, rows,
            bgcolor: optCol(t?.bgcolor), frameColor: optCol(t?.frameColor), frameWidth: Math.max(0, num(t?.frameWidth, 0)),
            borderColor: optCol(t?.borderColor), borderWidth: Math.max(0, num(t?.borderWidth, 0)),
            forceOverlay: t?.forceOverlay === true, cells,
        });
    }
    if (raw?.barColors && typeof raw.barColors.length === 'number') {
        const bc = asColorIdx(raw.barColors);
        const bo = raw.barColorOpts;
        const disp = typeof bo?.display === 'string' ? bo.display : 'all';
        if (bc && disp !== 'none') {
            out.barColors = bc;
            out.barColorOffset = v2 ? Math.max(-500, Math.min(500, Math.round(num(bo?.offset, 0)))) : 0;
        }
    }
    for (const c of Array.isArray(raw?.candles) ? raw.candles : []) {
        out.candles.push({
            title: str(c?.title), kind: c?.kind === 'bar' ? 'bar' : 'candle',
            open: asNumArray(c?.open), high: asNumArray(c?.high), low: asNumArray(c?.low), close: asNumArray(c?.close),
            color: optCol(c?.color), colors: asColorIdx(c?.colors), wickColor: optCol(c?.wickColor), wickColors: asColorIdx(c?.wickColors),
            borderColor: optCol(c?.borderColor), borderColors: asColorIdx(c?.borderColors),
            display: optStr(c, 'all', 'display'), offset: offOf(c),
        });
    }
    for (const a of Array.isArray(raw?.arrows) ? raw.arrows : []) {
        const minH = Math.max(1, num(a?.minHeight, 5));
        out.arrows.push({
            title: str(a?.title), values: asNumArray(a?.values),
            colorUp: str(a?.colorUp, '#26a69a'), colorDown: str(a?.colorDown, '#ef5350'),
            colorsUp: asColorIdx(a?.colorsUp), colorsDown: asColorIdx(a?.colorsDown),
            offset: offOf(a), minHeight: minH, maxHeight: Math.max(minH, num(a?.maxHeight, 100)), display: optStr(a, 'all', 'display'),
        });
    }
    for (const l of Array.isArray(raw?.logs) ? raw.logs : []) {
        const lv = l?.level === 'error' || l?.level === 'warning' ? l.level : 'info';
        out.logs.push({ bar: Math.round(num(l?.bar, -1)), level: lv, message: str(l?.message) });
    }
    for (const a of Array.isArray(raw?.alertEvents) ? raw.alertEvents : []) {
        out.alertEvents.push({ bar: Math.round(num(a?.bar, -1)), message: str(a?.message), freq: str(a?.freq, 'all') });
    }
    const strat = normalizeStrategy(raw?.strategy);
    if (strat) {
        out.strategy = strat;
        if (out.meta.kind === undefined) out.meta.kind = 'strategy';
    }
    return out;
}

function normalizeError(e: any): EvoScriptError {
    if (typeof e === 'string') return { message: e };
    if (e && typeof e === 'object') {
        return {
            message: String(e.message ?? e.error ?? 'Script error'),
            line: typeof e.line === 'number' ? e.line : undefined,
            col: typeof (e.col ?? e.column) === 'number' ? (e.col ?? e.column) : undefined,
            kind: typeof e.kind === 'string' ? e.kind : undefined,
        };
    }
    return { message: 'Script error' };
}

function toColumns(bars: readonly BarData[]): EvoBarColumns {
    const n = bars.length;
    const c: EvoBarColumns = {
        time: new Float64Array(n), open: new Float64Array(n), high: new Float64Array(n),
        low: new Float64Array(n), close: new Float64Array(n), volume: new Float64Array(n),
    };
    for (let i = 0; i < n; i++) {
        const b = bars[i];
        c.time[i] = b.time; c.open[i] = b.open; c.high[i] = b.high; c.low[i] = b.low; c.close[i] = b.close;
        c.volume[i] = b.volume ?? 0;
    }
    return c;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

const DATA_DEBOUNCE_MS = 150;
const BAR_DEBOUNCE_MS = 250;
const SETTINGS_DEBOUNCE_MS = 120;
/** Forming-bar tick re-runs: at most one per max(TICK_MIN_INTERVAL_MS, TICK_COST_FACTOR * lastRunMs); none when a run is slower than TICK_MAX_RUN_MS */
const TICK_MIN_INTERVAL_MS = 1000;
const TICK_COST_FACTOR = 3;
const TICK_MAX_RUN_MS = 1500;

const TF_UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/** Milliseconds of one bar from a timeframe label ("1m", "15", "4h", "1D", "1W"); null when unknown (months etc.) */
function timeframeMs(tf: string | undefined): number | null {
    if (!tf) return null;
    const m = /^(\d+)?\s*([smhdwSMHDW]?)$/.exec(tf.trim());
    if (!m) return null;
    const n = m[1] ? parseInt(m[1], 10) : 1;
    if (!m[2]) return n * 60_000; // bare number = minutes
    const unit = m[2] === 'M' ? 'M' : m[2].toLowerCase(); // uppercase M = month in TV notation
    if (unit === 'M') return null;
    return n * TF_UNIT_MS[unit];
}

export class EvoScriptCore {
    readonly id: string;
    settings: EvoScriptSettings;
    status: EvoScriptStatus = 'idle';
    error: EvoScriptError | null = null;
    output: EvoOutput | null = null;
    /** Last successful title, kept for the legend while a run fails */
    lastTitle = '';
    /** Bars the current output was computed for */
    runLen = 0;
    ms: number | null = null;
    runCount = 0;
    lastBars = 0;
    /** Wall time of the last finished run (ms) */
    lastRunMs: number | null = null;
    /** Set while the manager swaps the overlay/panel flavour: the old indicator must not dispose the core */
    keepOnDestroy = false;

    /** Called when output/status changed (host indicator rebuilds its data and redraws) */
    onChange: (() => void) | null = null;
    /** Called after a successful run whose meta.overlay differs from `settings.overlay` */
    onKindMismatch: ((overlay: boolean) => void) | null = null;
    /** Called when persisted settings changed (host indicator mirrors them into its options) */
    onSettings: (() => void) | null = null;
    /** Called after persisted settings changed through the API (the chart widget requests a layout save) */
    onPersist: (() => void) | null = null;
    /** Chart time zone provider (set by the chart widget) */
    timezoneProvider: (() => string) | null = null;

    private _runTimes: Float64Array = new Float64Array(0);
    private _seq = 0;
    private _timer: ReturnType<typeof setTimeout> | null = null;
    private _bars: readonly BarData[] = [];
    private _sig = '';
    private _ctxKey = '';
    private _pendingRunner = false;
    private _notReadyTries = 0;
    private _destroyed = false;
    private _firstTime = NaN;
    private _ctxChanged = false;
    private _ctx: { symbol: string; timeframe: string; exchange?: string } | null = null;
    // realtime (forming bar) bookkeeping
    private _inflight = false;
    private _queued = false;
    private _quiet = false;
    private _tickTimer: ReturnType<typeof setTimeout> | null = null;
    private _lastRunStart = 0;
    private _tickKey = '';
    /** Identity (script, inputs, symbol, timeframe) the current output was produced for; varip is only handed back for the same key */
    private _outKey = '';

    constructor(id: string, settings: Partial<EvoScriptSettings>) {
        this.id = id;
        this.settings = {
            source: settings.source ?? '',
            lang: settings.lang ?? 'auto',
            inputs: { ...(settings.inputs ?? {}) },
            name: settings.name ?? '',
            overlay: settings.overlay === true,
            strategyOverrides: sanitizeStrategyOverrides(settings.strategyOverrides),
        };
        _cores.add(this);
    }

    get firstTime(): number { return this._firstTime; }

    state(displayName: string): EvoScriptState {
        return {
            id: this.id, name: displayName, source: this.settings.source, lang: this.settings.lang,
            inputs: { ...this.settings.inputs }, status: this.status, error: this.error,
            overlay: this.settings.overlay, inputDefs: this.output?.inputs ?? [],
            warnings: this.output?.warnings ?? [], meta: this.output?.meta ?? null, ms: this.ms,
            runCount: this.runCount, lastBars: this.lastBars, lastRunMs: this.lastRunMs,
            logs: this.logRows(false), alertEvents: this.logRows(true), timezone: this.timezone(),
            kind: this.output?.strategy ? 'strategy' : 'indicator', strategy: this.output?.strategy ?? null,
            strategyOverrides: { ...(this.settings.strategyOverrides ?? {}) },
        };
    }

    timezone(): string {
        try { return this.timezoneProvider?.() ?? ''; } catch { return ''; }
    }

    /** log.* entries (or alert() events) with the bar time in ms */
    logRows(alerts: boolean): EvoLogRow[] {
        const out = this.output;
        if (!out) return [];
        const times = this._runTimes;
        const timeOf = (bar: number): number => {
            const t = bar >= 0 && bar < times.length ? times[bar] : NaN;
            return Number.isFinite(t) ? (t > 1e11 ? t : t * 1000) : NaN;
        };
        if (alerts) return out.alertEvents.map((a) => ({ bar: a.bar, time: timeOf(a.bar), level: 'alert', message: a.message, freq: a.freq }));
        return out.logs.map((l) => ({ bar: l.bar, time: timeOf(l.bar), level: l.level, message: l.message }));
    }

    /** True when the last bar of the run has alert() events */
    get lastBarAlerts(): string[] {
        const out = this.output;
        if (!out || out.alertEvents.length === 0 || this.runLen === 0) return [];
        return out.alertEvents.filter((a) => a.bar === this.runLen - 1).map((a) => a.message);
    }

    /** Effective value of an input (override, else definition value) */
    inputValue(def: EvoInputDef): unknown {
        if (def.id in this.settings.inputs) return this.settings.inputs[def.id];
        return def.value !== undefined ? def.value : def.default;
    }

    // --- data / context from the host indicator ---

    setContext(ctx: { symbol: string; timeframe: string; exchange?: string; end?: number }): void {
        this._ctx = ctx;
        // exchange is not part of the key: a late exchange label must not trigger a redundant run
        const key = `${ctx.symbol}|${ctx.timeframe}`;
        if (key === this._ctxKey) return;
        const first = this._ctxKey === '';
        this._ctxKey = key;
        if (first) return; // initial context: data push that follows triggers the first run
        // new symbol / timeframe: re-run for the next bars. The previous output stays drawn (busy state)
        // unless the new bars turn out to be incompatible (see onData).
        this._sig = '';
        this._ctxChanged = true;
    }

    /** Called from Indicator.calculate on every data push. */
    onData(bars: readonly BarData[]): void {
        this._bars = bars;
        const n = bars.length;
        if (n === 0) {
            if (this._sig !== '') { this._sig = ''; this._invalidateOutput(); }
            return;
        }
        const first = bars[0].time;
        const last = bars[n - 1].time;
        // last CLOSED bar's close is part of the signature: same time grid with other prices (new symbol) differs
        const closed = n >= 2 ? bars[n - 2].close : bars[0].close;
        const sig = `${first}|${n}|${last}|${closed}|${bars[0].close}`;
        if (sig === this._sig) { // forming-bar tick (same last time and length)
            this._onTick(bars);
            return;
        }
        const prevFirst = this._firstTime;
        const prevLen = this.runLen;
        this._sig = sig;
        this._firstTime = first;
        const ctxChanged = this._ctxChanged;
        this._ctxChanged = false;
        // symbol/timeframe change keeps the old render only when the time grid is the same (same first bar, similar length)
        const incompatible = first !== prevFirst || n < prevLen || (ctxChanged && Math.abs(n - prevLen) > 2);
        if (this.output && incompatible) {
            // history prepended / data replaced: indices of the old output do not match anymore
            this._invalidateOutput();
        }
        const appended = this.output !== null && !ctxChanged && first === prevFirst && n >= prevLen && n - prevLen <= 2;
        this.schedule(appended ? BAR_DEBOUNCE_MS : DATA_DEBOUNCE_MS);
    }

    private static _barKey(bars: readonly BarData[]): string {
        const b = bars[bars.length - 1];
        return `${b.close}|${b.high}|${b.low}|${b.volume ?? 0}`;
    }

    /** Duration of one bar in ms (timeframe label, else the smallest recent bar spacing) */
    private _barDurationMs(bars: readonly BarData[]): number | null {
        const fromTf = timeframeMs(this._ctx?.timeframe);
        const n = bars.length;
        let spacing: number | null = null;
        if (n >= 2) {
            const unit = bars[n - 1].time > 1e11 ? 1 : 1000;
            let d = Infinity;
            for (let i = Math.max(1, n - 6); i < n; i++) d = Math.min(d, bars[i].time - bars[i - 1].time);
            spacing = Number.isFinite(d) && d > 0 ? d * unit : null;
        }
        // a label that disagrees with the data (bars at least twice as far apart) must not make a live bar look closed
        if (fromTf) return spacing !== null && spacing >= fromTf * 2 ? spacing : fromTf;
        return spacing;
    }

    /** True when the last bar has not closed yet (lastBar.time + barDuration > now) */
    private _isForming(bars: readonly BarData[]): boolean {
        const n = bars.length;
        if (n === 0) return false;
        const dur = this._barDurationMs(bars);
        if (!dur) return false;
        const t = bars[n - 1].time;
        return (t > 1e11 ? t : t * 1000) + dur > Date.now();
    }

    /** Tick of the forming bar: throttled re-run (at most one per max(1000 ms, 3 x lastRunMs)); none when runs are slow */
    private _onTick(bars: readonly BarData[]): void {
        if (this._destroyed || this.output === null || !this.settings.source.trim()) return;
        if (this._timer !== null) return; // a regular run is already scheduled and will see the latest bars
        if (EvoScriptCore._barKey(bars) === this._tickKey) return; // nothing changed since the last run
        if (this.lastRunMs !== null && this.lastRunMs > TICK_MAX_RUN_MS) return; // slow script: new bars only
        if (!this._isForming(bars)) return;
        if (this._tickTimer !== null) return; // one pending tick run; it reads the latest bars when it fires
        const interval = Math.max(TICK_MIN_INTERVAL_MS, TICK_COST_FACTOR * (this.lastRunMs ?? 0));
        const wait = Math.max(0, this._lastRunStart + interval - Date.now());
        this._tickTimer = setTimeout(() => {
            this._tickTimer = null;
            this._quiet = true;
            void this._run();
        }, wait);
    }

    get busy(): boolean { return (this.status === 'running' && !this._quiet) || this._timer !== null; }

    private _invalidateOutput(): void {
        this._seq++; // drop in-flight result
        this.output = null;
        this.runLen = 0;
        if (this.status !== 'error') this.status = 'idle';
        this._emit();
    }

    // --- settings ---

    update(patch: Partial<EvoScriptSettings> & { replaceInputs?: boolean }, delayMs = 0): void {
        const s = this.settings;
        if (patch.source !== undefined) s.source = String(patch.source);
        if (patch.lang !== undefined) s.lang = patch.lang;
        if (patch.name !== undefined) s.name = String(patch.name);
        if (patch.inputs !== undefined) s.inputs = patch.replaceInputs ? { ...patch.inputs } : { ...s.inputs, ...patch.inputs };
        if (patch.overlay !== undefined) s.overlay = !!patch.overlay;
        if (patch.strategyOverrides !== undefined) s.strategyOverrides = sanitizeStrategyOverrides(patch.strategyOverrides);
        this.onSettings?.();
        this.onPersist?.();
        this.schedule(delayMs);
    }

    /** Replace the strategy() overrides (Strategy Tester "Properties") and re-run */
    setStrategyOverrides(v: Record<string, unknown>): void {
        const next = sanitizeStrategyOverrides(v);
        if (JSON.stringify(next) === JSON.stringify(this.settings.strategyOverrides ?? {})) return;
        this.settings.strategyOverrides = next;
        this.onSettings?.();
        this.onPersist?.();
        this.schedule(SETTINGS_DEBOUNCE_MS);
    }

    setInput(id: string, value: unknown): void {
        if (this.settings.inputs[id] === value) return;
        this.settings.inputs = { ...this.settings.inputs, [id]: value };
        this.onSettings?.();
        this.onPersist?.();
        this.schedule(SETTINGS_DEBOUNCE_MS);
    }

    setName(name: string): void {
        if (this.settings.name === name) return;
        this.settings.name = name;
        this.onSettings?.();
        this.onPersist?.();
        this._emit();
    }

    // --- running ---

    schedule(delayMs: number): void {
        if (this._destroyed) return;
        if (this._timer !== null) clearTimeout(this._timer);
        if (this._tickTimer !== null) { clearTimeout(this._tickTimer); this._tickTimer = null; }
        this._timer = setTimeout(() => { this._timer = null; this._quiet = false; void this._run(); }, delayMs);
    }

    rerun(): void {
        this.schedule(0);
    }

    runnerAvailable(): void {
        if (this._pendingRunner) { this._pendingRunner = false; this.schedule(0); }
    }

    private _runKey(): string {
        return JSON.stringify([this.settings.source, this.settings.lang, this.settings.inputs, this._ctxKey, this.settings.strategyOverrides ?? {}]);
    }

    /** One run at a time; a request that arrives while a run is in flight is kept (only the latest) and runs right after it */
    private async _run(): Promise<void> {
        if (this._destroyed) return;
        if (this._inflight) { this._queued = true; return; }
        this._inflight = true;
        try {
            await this._runOnce();
        } finally {
            this._inflight = false;
            this._quiet = false;
            if (this._queued && !this._destroyed) { this._queued = false; this.schedule(0); }
        }
    }

    private async _runOnce(): Promise<void> {
        const bars = this._bars;
        if (bars.length === 0 || !this.settings.source.trim()) return;
        if (!_runner) { this._pendingRunner = true; return; }
        const seq = ++this._seq;
        const barsLen = bars.length;
        const quiet = this._quiet;
        const key = this._runKey();
        const forming = this._isForming(bars);
        const varip = this.output !== null && this._outKey === key ? this.output.varip : undefined;
        this._tickKey = EvoScriptCore._barKey(bars);
        if (!quiet) {
            this.status = 'running';
            this._emit();
        }
        const t0 = Date.now();
        this._lastRunStart = t0;
        let res: any;
        const so = this.settings.strategyOverrides;
        try {
            res = await _runner({
                source: this.settings.source, lang: this.settings.lang,
                inputs: { ...this.settings.inputs }, bars: toColumns(bars),
                chart: this._ctx ? {
                    symbol: this._ctx.symbol, exchange: this._ctx.exchange ?? '', timeframe: this._ctx.timeframe,
                    tickerid: this._ctx.exchange ? `${this._ctx.exchange}:${this._ctx.symbol}` : this._ctx.symbol,
                } : null,
                realtime: varip !== undefined ? { forming, varip } : { forming },
                ...(so && Object.keys(so).length > 0 ? { strategyOverrides: { ...so } } : {}),
            });
        } catch (e) {
            res = { error: { message: e instanceof Error ? e.message : String(e) } };
        }
        this.lastRunMs = Date.now() - t0;
        if (this._destroyed || seq !== this._seq) return; // stale
        this.runCount++;
        this.lastBars = barsLen;
        this.ms = typeof res?.ms === 'number' ? res.ms : this.lastRunMs;
        // tolerate the raw worker response shape {ok, output|error}
        if (res && typeof res === 'object' && res.ok === true && res.output) res = res.output;
        else if (res && typeof res === 'object' && res.ok === false) res = { error: res.error };

        // engine / worker not up yet (page still loading after a reload): keep waiting instead of showing an error
        const notReady = res && typeof res === 'object' && res.error && /engine not (loaded|ready)/i.test(String(res.error.message ?? res.error));
        if (notReady && this._notReadyTries < 40) {
            this._notReadyTries++;
            this.status = 'idle';
            this._emit();
            setTimeout(() => { if (!this._destroyed) this.schedule(0); }, 500);
            return;
        }
        this._notReadyTries = 0;
        if (!res || typeof res !== 'object' || res.error) {
            this.status = 'error';
            this.error = normalizeError(res?.error ?? 'Runner returned no output');
            this.output = null;
            this.runLen = 0;
            this._emit();
            return;
        }
        try {
            this.output = normalizeEvoOutput(res);
        } catch (e) {
            this.status = 'error';
            this.error = { message: `Bad script output: ${e instanceof Error ? e.message : String(e)}` };
            this.output = null;
            this._emit();
            return;
        }
        this._outKey = key;
        this.status = 'ok';
        this.error = null;
        this.lastTitle = this.output.meta.shortTitle || this.output.meta.title;
        this.runLen = barsLen;
        this._runTimes = this.output.logs.length || this.output.alertEvents.length ? Float64Array.from(bars, (b) => b.time) : new Float64Array(0);
        this._emit();
        if (this.output.meta.overlay !== this.settings.overlay) {
            this.settings.overlay = this.output.meta.overlay;
            this.onSettings?.();
            this.onPersist?.();
            this.onKindMismatch?.(this.settings.overlay);
        }
    }

    private _emit(): void {
        this.onChange?.();
        try { evoScriptEvents.fire(this.state(this.settings.name || this.output?.meta.shortTitle || this.output?.meta.title || 'Evo Script')); }
        catch (e) { console.warn('evo-script listener failed', e); }
    }

    destroy(): void {
        if (this.keepOnDestroy) return;
        this._destroyed = true;
        this._seq++;
        if (this._timer !== null) clearTimeout(this._timer);
        this._timer = null;
        if (this._tickTimer !== null) clearTimeout(this._tickTimer);
        this._tickTimer = null;
        _cores.delete(this);
    }
}
