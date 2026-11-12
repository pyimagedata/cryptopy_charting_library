// Liquidations: per-bar liquidated USD (shorts and longs separately) in a separate pane.
// Data comes from the EvoTrading backend (GET /api/liquidations/, Binance USD-M forceOrder stream).
// Binance's stream reports at most one liquidation per symbol per second, so totals are a lower bound.
// This is a context read-out, not a signal.
//
// Fetching: the loaded bar range is requested once per symbol/exchange/interval (in chunks that fit the
// backend's per-request bucket cap), older history is requested when more bars get loaded, and the
// most recent window is re-requested every 30 s so the forming bar updates. Responses of a previous
// context are dropped. 4xx answers stop further requests until the context changes (no retry storms).

import { PanelIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import { TimeScale } from '../model/time-scale';
import { PriceScale } from '../model/price-scale';
import { toEpochMs } from '../helpers/time';
import { t } from '../helpers/translations';
import { RemoteContext } from './remote-compute';
import { IndicatorLegendInfo, legendBarIndex, LEGEND_NO_VALUE } from './legend-info';
import {
    IndicatorSettingsConfig,
    createInputsTab,
    createStyleTab,
    createVisibilityTab,
    checkboxRow,
    colorRow,
} from '../gui/indicator_settings';

export interface LiquidationsOptions extends IndicatorOptions {
    /** Short liquidations (forced buys): positive bars */
    shortColor: string;
    /** Long liquidations (forced sells): negative bars */
    longColor: string;
    /** Draw both as positive bars stacked on top of each other */
    stacked: boolean;
    zeroLineColor: string;
}

const defaultLiquidationsOptions: Partial<LiquidationsOptions> = {
    name: 'Liquidations',
    color: '#26a69a',
    lineWidth: 1,
    style: IndicatorStyle.Histogram,
    shortColor: '#26a69a',
    longColor: '#ef5350',
    stacked: false,
    zeroLineColor: '#787b86',
};

/** One bucket: [t (unix s), long_usd, short_usd, long_n, short_n] */
export type LiquidationsBar = [number, number, number, number, number];

export interface LiquidationsResponse {
    symbol?: string;
    interval?: string;
    bars: LiquidationsBar[];
}

export interface LiquidationsQuery {
    /** Chart symbol, ".P" suffix removed */
    symbol: string;
    exchange: string;
    interval: string;
    /** unix seconds */
    from: number;
    to: number;
}

/** Host-supplied fetcher (optional). Throw an Error with `status` on HTTP errors; return null for "no data". */
export type LiquidationsProvider = (query: LiquidationsQuery, opts?: { signal?: AbortSignal }) => Promise<LiquidationsResponse | null>;

const ENDPOINT = '/api/market/liquidations';
const POLL_MS = 30_000;
const ENSURE_DEBOUNCE_MS = 300;
/** Buckets per request (backend cap is 5000). */
const CHUNK_BUCKETS = 4000;
/** The periodic refresh re-reads this many latest bars. */
const TAIL_BARS = 12;
/** Month chunk step: the longest month, so a chunk of CHUNK_BUCKETS months stays under the backend cap. */
const MONTH_STEP_SECONDS = 31 * 86400;
const SYMBOL_RE = /^[A-Z0-9]{2,24}$/;
const UP_FALLBACK = '#26a69a';
const DOWN_FALLBACK = '#ef5350';

/**
 * Chart timeframe (raw toolbar string: "1m".."12h", "D", "W", "M", "1M", "1mo", custom "90m", bare "240" = minutes)
 * -> backend interval string and bucket length in seconds. Same reading rules as parseTimeframe
 * ('M' / "mo" = month, 'm' = minute) but without its lossy hour conversion. null = unsupported
 * (seconds, ticks, ranges, multi-month: the candle API has none of them either).
 */
function normalizeInterval(tf: string | null | undefined): { interval: string; seconds: number } | null {
    if (!tf) return null;
    const str = String(tf).trim();
    const bare = /^(\d+)$/.exec(str);
    if (bare) {
        const n = parseInt(bare[1], 10);
        return n >= 1 ? { interval: `${n}m`, seconds: n * 60 } : null;
    }
    const m = /^(\d*)\s*([A-Za-z]+)$/.exec(str);
    if (!m) return null;
    const n = m[1] === '' ? 1 : parseInt(m[1], 10);
    if (!(n >= 1)) return null;
    const raw = m[2];
    const low = raw.toLowerCase();
    // Month check first: 'M' must not be lowercased into minutes.
    if (raw === 'M' || low === 'mo' || low === 'mon' || low === 'month' || low === 'months') {
        return n === 1 ? { interval: '1mo', seconds: MONTH_STEP_SECONDS } : null;
    }
    if (low === 'm' || low === 'min' || low === 'minute' || low === 'minutes') return { interval: `${n}m`, seconds: n * 60 };
    if (low === 'h' || low === 'hour' || low === 'hours') return { interval: `${n}h`, seconds: n * 3600 };
    if (low === 'd' || low === 'day' || low === 'days') return { interval: `${n}d`, seconds: n * 86400 };
    if (low === 'w' || low === 'week' || low === 'weeks') return { interval: `${n}w`, seconds: n * 604800 };
    return null;
}

/** 1234567 -> "1.2M", 340000 -> "340K", 12 -> "12" */
export function formatLiquidationUsd(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return LEGEND_NO_VALUE;
    const abs = Math.abs(v);
    const trim = (x: number) => String(Number(x.toFixed(1)));
    if (abs >= 1e9) return trim(v / 1e9) + 'B';
    if (abs >= 1e6) return trim(v / 1e6) + 'M';
    if (abs >= 1e3) return trim(v / 1e3) + 'K';
    return String(Math.round(v));
}

/** Backend symbol for a chart symbol/exchange, or null when it cannot have Binance USD-M liquidations. */
function liquidationsSymbol(symbol: string, exchange?: string): string | null {
    const ex = (exchange ?? '').toUpperCase();
    if (ex !== 'BINANCE' && ex !== 'BINANCE-FUTURES') return null;
    const s = symbol.toUpperCase().replace(/\.P$/, '');
    return SYMBOL_RE.test(s) ? s : null;
}

async function defaultFetch(query: LiquidationsQuery, opts?: { signal?: AbortSignal }): Promise<LiquidationsResponse | null> {
    const url = `${ENDPOINT}?symbol=${encodeURIComponent(query.symbol)}&exchange=${encodeURIComponent(query.exchange)}` +
        `&interval=${encodeURIComponent(query.interval)}&from=${Math.floor(query.from)}&to=${Math.floor(query.to)}`;
    const response = await fetch(url, { cache: 'no-store', signal: opts?.signal });
    if (!response.ok) {
        const error = new Error('liquidations request failed: ' + response.status) as Error & { status?: number };
        error.status = response.status;
        throw error;
    }
    return (await response.json()) as LiquidationsResponse;
}

export class LiquidationsIndicator extends PanelIndicator {
    /** Optional: the host may replace the built-in same-origin fetch (like NewsIndicator.defaultProvider). */
    static defaultProvider: LiquidationsProvider | null = null;

    private _liqOptions: LiquidationsOptions;
    private _ctx: RemoteContext | null = null;
    /** bar open time (ms) -> [long_usd, short_usd, long_n, short_n] */
    private _buckets = new Map<number, [number, number, number, number]>();
    private _gen = 0;
    private _abort: AbortController | null = null;
    private _inFlight = false;
    private _loadedKey = '';
    /** Open times (ms) of the first / last bar covered by completed requests for _loadedKey. */
    private _loadedFrom = Infinity;
    private _loadedTo = -Infinity;
    /** 401/403: the notice is shown in the legend; 4xx stops requests until the context changes. */
    private _denied: 401 | 403 | null = null;
    private _blocked = false;
    /** After a failed pass the calculate path waits until this time (ms); only the poll retries earlier. */
    private _retryAt = 0;
    private _failStreak = 0;
    private _ensureTimer: ReturnType<typeof setTimeout> | null = null;
    private _pollTimer: ReturnType<typeof setInterval> | null = null;
    private _barMs = 60_000;

    constructor(options: Partial<LiquidationsOptions> = {}) {
        const mergedOptions = { ...defaultLiquidationsOptions, ...options };
        super(mergedOptions);
        this._liqOptions = { ...defaultLiquidationsOptions, ...this._options } as LiquidationsOptions;
        this._paneHeight = 120;
        this._pollTimer = setInterval(() => this._poll(), POLL_MS);
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVisibility);
    }

    private readonly _onVisibility = (): void => {
        if (typeof document !== 'undefined' && !document.hidden) this._poll();
    };

    protected _getAllOptions(): Record<string, any> {
        return { ...this._liqOptions };
    }

    setContext(ctx: RemoteContext): void {
        const prev = this._ctx;
        this._ctx = ctx;
        const changed = !prev || prev.symbol !== ctx.symbol || prev.timeframe !== ctx.timeframe ||
            (prev.exchange ?? '') !== (ctx.exchange ?? '') || (prev.end === undefined) !== (ctx.end === undefined);
        if (changed) {
            this._resetData();
            this._rebuild();
            this._dataChanged.fire();
            this._scheduleEnsure();
        }
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    rows: [checkboxRow('stacked', t('Show as stacked positive bars'), false)],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('shortColor', t('Short liquidations')),
                        colorRow('longColor', t('Long liquidations')),
                        colorRow('zeroLineColor', t('Zero Line Color')),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this._options.visible;
        return (this._liqOptions as any)[key];
    }

    setSettingValue(key: string, value: any): boolean {
        Object.assign(this._liqOptions, { [key]: value });
        Object.assign(this._options, { [key]: value });
        this._dataChanged.fire();
        return false;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        if (sourceData.length >= 2) {
            const step = toEpochMs(sourceData[sourceData.length - 1].time) - toEpochMs(sourceData[sourceData.length - 2].time);
            if (step > 0) this._barMs = step;
        }
        this._rebuild();
        this._scheduleEnsure();
    }

    // --- data ---

    private _rebuild(): void {
        this._data = [];
        for (const bar of this._sourceData) {
            const b = this._buckets.get(toEpochMs(bar.time));
            const longUsd = b ? b[0] : 0;
            const shortUsd = b ? b[1] : 0;
            this._data.push({ time: bar.time, value: shortUsd, values: [shortUsd, longUsd, b ? b[3] : 0, b ? b[2] : 0] });
        }
    }

    private _resetData(): void {
        this._gen++;
        if (this._abort) this._abort.abort();
        this._abort = null;
        this._inFlight = false;
        this._buckets = new Map();
        this._loadedKey = '';
        this._loadedFrom = Infinity;
        this._loadedTo = -Infinity;
        this._denied = null;
        this._blocked = false;
        this._retryAt = 0;
        this._failStreak = 0;
    }

    private _scheduleEnsure(): void {
        if (this._ensureTimer !== null) clearTimeout(this._ensureTimer);
        this._ensureTimer = setTimeout(() => {
            this._ensureTimer = null;
            void this._ensure();
        }, ENSURE_DEBOUNCE_MS);
    }

    private _poll(): void {
        if (!this.shown || (typeof document !== 'undefined' && document.hidden)) return;
        void this._ensure(true);
    }

    private _query(interval: string, fromMs: number, toMs: number): LiquidationsQuery | null {
        const ctx = this._ctx;
        if (!ctx) return null;
        const symbol = liquidationsSymbol(ctx.symbol, ctx.exchange);
        if (!symbol) return null;
        return { symbol, exchange: 'BINANCE', interval, from: Math.floor(fromMs / 1000), to: Math.floor(toMs / 1000) };
    }

    private async _ensure(tailOnly = false): Promise<void> {
        const ctx = this._ctx;
        const bars = this._sourceData;
        if (!ctx || bars.length === 0 || this._blocked || this._inFlight) return;
        // Replay: the backend has no cursor support; showing nothing avoids leaking future liquidations.
        if (ctx.end !== undefined) return;
        // Back-off after failures: 30 s, 60 s, 120 s ... up to 10 min. The poll tick may land half a period early.
        if (Date.now() < this._retryAt - (tailOnly ? POLL_MS / 2 : 0)) return;
        const norm = normalizeInterval(ctx.timeframe);
        if (norm === null || !liquidationsSymbol(ctx.symbol, ctx.exchange)) return;
        const stepSec = norm.seconds;

        const key = `${ctx.symbol}|${ctx.exchange ?? ''}|${ctx.timeframe}`;
        const firstMs = toEpochMs(bars[0].time);
        const lastMs = toEpochMs(bars[bars.length - 1].time);
        if (key !== this._loadedKey) {
            this._loadedKey = key;
            this._loadedFrom = Infinity;
            this._loadedTo = -Infinity;
        }

        // Windows [fromMs, toMs] (bar open times) to request.
        const windows: Array<[number, number]> = [];
        if (this._loadedFrom === Infinity) {
            windows.push([firstMs, lastMs]);
        } else if (tailOnly) {
            const tailFrom = Math.max(firstMs, lastMs - TAIL_BARS * this._barMs);
            windows.push([tailFrom, lastMs]);
        } else {
            if (firstMs < this._loadedFrom) windows.push([firstMs, this._loadedFrom]);
            if (lastMs > this._loadedTo) windows.push([Math.max(firstMs, this._loadedTo), lastMs]);
            if (windows.length === 0) return;
        }

        const chunkMs = CHUNK_BUCKETS * stepSec * 1000;
        const gen = this._gen;
        const abort = new AbortController();
        this._abort = abort;
        this._inFlight = true;
        let ok = true;
        try {
            for (const [wFrom, wTo] of windows) {
                // Newest chunk first so the visible end of the chart fills before old history.
                for (let hi = wTo; hi >= wFrom; hi -= chunkMs) {
                    const lo = Math.max(wFrom, hi - chunkMs + stepSec * 1000);
                    const query = this._query(norm.interval, lo, hi);
                    if (!query) return;
                    const provider = LiquidationsIndicator.defaultProvider ?? defaultFetch;
                    const res = await provider(query, { signal: abort.signal });
                    if (gen !== this._gen) return; // context changed: drop the stale answer
                    for (const row of res?.bars ?? []) {
                        if (!Array.isArray(row) || row.length < 5) continue;
                        this._buckets.set(row[0] * 1000, [row[1], row[2], row[3], row[4]]);
                    }
                    this._rebuild();
                    this._dataChanged.fire();
                }
            }
        } catch (error) {
            ok = false;
            this._failStreak++;
            this._retryAt = Date.now() + Math.min(600_000, POLL_MS * Math.pow(2, this._failStreak - 1));
            if (gen !== this._gen) return;
            const status = (error as { status?: number } | null)?.status;
            if (status === 401 || status === 403) this._denied = status;
            // Any 4xx (denied, unknown symbol, bad interval) is final for this context; network/5xx waits for the next poll.
            if (status !== undefined && status >= 400 && status < 500) this._blocked = true;
            this._dataChanged.fire();
        } finally {
            if (gen === this._gen) {
                this._inFlight = false;
                if (ok) { this._retryAt = 0; this._failStreak = 0; }
                if (ok && this._loadedFrom === Infinity) {
                    this._loadedFrom = firstMs;
                    this._loadedTo = lastMs;
                } else if (ok && tailOnly) {
                    // the tail refresh says nothing about older history
                    this._loadedTo = Math.max(this._loadedTo, lastMs);
                } else if (ok) {
                    this._loadedFrom = Math.min(this._loadedFrom, firstMs);
                    this._loadedTo = Math.max(this._loadedTo, lastMs);
                }
                // Bars that arrived (history scrolled in, new bar) while this request ran: ask again.
                if (ok && !this._blocked && this._sourceData.length > 0) {
                    const f = toEpochMs(this._sourceData[0].time);
                    const l = toEpochMs(this._sourceData[this._sourceData.length - 1].time);
                    if (f < this._loadedFrom || l > this._loadedTo) this._scheduleEnsure();
                }
            }
        }
    }

    // --- range / drawing / legend ---

    getRange(visibleRange?: { from: number; to: number } | null): IndicatorRange {
        const data = this._data;
        if (data.length === 0) return { min: -1, max: 1 };
        const start = visibleRange ? Math.max(0, Math.floor(visibleRange.from)) : 0;
        const end = visibleRange ? Math.min(data.length - 1, Math.ceil(visibleRange.to)) : data.length - 1;
        let maxShort = 0;
        let maxLong = 0;
        let maxStack = 0;
        for (let i = start; i <= end; i++) {
            const v = data[i]?.values;
            if (!v) continue;
            if (v[0] > maxShort) maxShort = v[0];
            if (v[1] > maxLong) maxLong = v[1];
            if (v[0] + v[1] > maxStack) maxStack = v[0] + v[1];
        }
        if (this._liqOptions.stacked) {
            const top = maxStack > 0 ? maxStack * 1.1 : 1;
            return { min: 0, max: top, fixedMin: 0, fixedMax: top };
        }
        if (maxShort === 0 && maxLong === 0) return { min: -1, max: 1, fixedMin: -1, fixedMax: 1 };
        const top = maxShort * 1.1;
        const bottom = -maxLong * 1.1;
        // Keep a little room on an empty side so the zero line is not glued to the pane edge.
        const min = bottom === 0 ? -top * 0.05 : bottom;
        const max = top === 0 ? -bottom * 0.05 : top;
        return { min, max, fixedMin: min, fixedMax: max };
    }

    /** Pane widget hook: replaces the default line drawing. ctx is already scaled to media pixels. */
    drawPane(ctx: CanvasRenderingContext2D, timeScale: TimeScale, priceScale: PriceScale, width: number, _height: number): void {
        const range = timeScale.visibleRange();
        const data = this._data;
        if (!range || data.length === 0) return;
        const o = this._liqOptions;
        const start = Math.max(0, Math.floor(range.from as number));
        const end = Math.min(data.length - 1, Math.ceil(range.to as number));
        const zeroY = priceScale.priceToCoordinate(0) as number;
        const barWidth = Math.max(1, 0.7 * timeScale.barSpacing);

        ctx.save();
        ctx.strokeStyle = o.zeroLineColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(zeroY) + 0.5);
        ctx.lineTo(width, Math.round(zeroY) + 0.5);
        ctx.stroke();

        for (let i = start; i <= end; i++) {
            const v = data[i]?.values;
            if (!v) continue;
            const shortUsd = v[0];
            const longUsd = v[1];
            const x = (timeScale.indexToCoordinate(i as any) as number) - barWidth / 2;
            if (o.stacked) {
                const yShort = priceScale.priceToCoordinate(shortUsd) as number;
                const yTop = priceScale.priceToCoordinate(shortUsd + longUsd) as number;
                if (shortUsd > 0) {
                    ctx.fillStyle = o.shortColor || UP_FALLBACK;
                    ctx.fillRect(x, yShort, barWidth, zeroY - yShort);
                }
                if (longUsd > 0) {
                    ctx.fillStyle = o.longColor || DOWN_FALLBACK;
                    ctx.fillRect(x, yTop, barWidth, yShort - yTop);
                }
            } else {
                if (shortUsd > 0) {
                    const y = priceScale.priceToCoordinate(shortUsd) as number;
                    ctx.fillStyle = o.shortColor || UP_FALLBACK;
                    ctx.fillRect(x, y, barWidth, zeroY - y);
                }
                if (longUsd > 0) {
                    const y = priceScale.priceToCoordinate(-longUsd) as number;
                    ctx.fillStyle = o.longColor || DOWN_FALLBACK;
                    ctx.fillRect(x, zeroY, barWidth, y - zeroY);
                }
            }
        }
        ctx.restore();
    }

    getLegendInfo(index?: number | null): IndicatorLegendInfo {
        const i = legendBarIndex(this._data.length, index);
        const v = i >= 0 ? this._data[i].values : undefined;
        const o = this._liqOptions;
        const info: IndicatorLegendInfo = {
            title: t('Liquidations'),
            params: [],
            plots: [
                { color: o.shortColor, value: v ? v[0] : null, text: v ? formatLiquidationUsd(v[0]) : LEGEND_NO_VALUE },
                { color: o.longColor, value: v ? v[1] : null, text: v ? formatLiquidationUsd(v[1]) : LEGEND_NO_VALUE },
            ],
        };
        if (this._denied !== null) {
            info.error = this._denied === 401 ? t('Sign in to use this indicator') : t('This indicator requires a PRO membership');
        }
        return info;
    }

    getDescription(index?: number): string {
        const i = legendBarIndex(this._data.length, index);
        const v = i >= 0 ? this._data[i].values : undefined;
        return `${t('Liquidations')}: ${t('Short')} ${v ? formatLiquidationUsd(v[0]) : '-'} ${t('Long')} ${v ? formatLiquidationUsd(v[1]) : '-'}`;
    }

    destroy(): void {
        if (this._ensureTimer !== null) clearTimeout(this._ensureTimer);
        if (this._pollTimer !== null) clearInterval(this._pollTimer);
        this._ensureTimer = null;
        this._pollTimer = null;
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVisibility);
        this._gen++;
        if (this._abort) this._abort.abort();
        this._abort = null;
        super.destroy();
    }
}
