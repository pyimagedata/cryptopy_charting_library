// Funding Rate: settled funding rates of the Binance USD-M perpetual (bars, in percent) in a separate pane, plus a
// dashed line at the predicted rate of the next settlement with a countdown.
// Data comes from the EvoTrading backend (GET /api/market/funding). Each settlement is drawn at the chart bar that
// contains its funding time; several settlements in one bar (e.g. 8h funding on a 1D chart) are summed.
// Context read-out, not a signal.

import { IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import { TimeScale } from '../model/time-scale';
import { PriceScale } from '../model/price-scale';
import { toEpochMs } from '../helpers/time';
import { t } from '../helpers/translations';
import { canvasSans } from '../helpers/fonts';
import { RemoteContext } from './remote-compute';
import { IndicatorLegendInfo, legendBarIndex, LegendPlot } from './legend-info';
import { RemotePaneIndicator, FetchOutcome, fetchJson } from './remote-pane-base';
import {
    SharedRequestCache, aggregateFunding, binanceFuturesSymbol, formatCountdown, formatPercent,
    normalizeInterval, NO_VALUE,
} from './remote-pane-utils';
import {
    IndicatorSettingsConfig,
    createInputsTab,
    createStyleTab,
    createVisibilityTab,
    checkboxRow,
    colorRow,
} from '../gui/indicator_settings';

export interface FundingRateOptions extends IndicatorOptions {
    /** Positive funding (longs pay shorts) */
    upColor: string;
    /** Negative funding (shorts pay longs) */
    downColor: string;
    /** Dashed predicted-rate line + label */
    showPredicted: boolean;
    predictedColor: string;
    zeroLineColor: string;
}

const defaultFundingRateOptions: Partial<FundingRateOptions> = {
    name: 'Funding Rate',
    color: '#26a69a',
    lineWidth: 1,
    style: IndicatorStyle.Histogram,
    upColor: '#26a69a',
    downColor: '#ef5350',
    showPredicted: true,
    predictedColor: '#ff9800',
    zeroLineColor: '#787b86',
};

export interface FundingCurrent {
    /** predicted rate for the next settlement, as a fraction (0.0001 = 0.01%) */
    rate: number;
    /** unix seconds, 0/null when unknown */
    next_funding_time?: number | null;
    mark_price?: number | null;
    as_of?: number | null;
}

export interface FundingResponse {
    symbol?: string;
    /** [funding_time (unix s), rate (fraction)] ascending */
    rows: Array<[number, number]>;
    current: FundingCurrent | null;
    interval_hours?: number | null;
}

export interface FundingQuery {
    /** Chart symbol, ".P" suffix removed */
    symbol: string;
    exchange: string;
    /** unix seconds */
    from: number;
    to: number;
}

/** Host-supplied fetcher (optional). Throw an Error with `status` on HTTP errors; return null for "no data". */
export type FundingProvider = (query: FundingQuery, opts?: { signal?: AbortSignal }) => Promise<FundingResponse | null>;

const ENDPOINT = '/api/market/funding';
const POLL_MS = 60_000;
/** Backend row cap per request (the newest rows are kept when a window holds more). */
export const FUNDING_MAX_ROWS = 5000;
/** Requests per load: the whole window first, then older parts while the answer is truncated. */
export const FUNDING_MAX_REQUESTS = 4;
/** The periodic refresh looks back at least this far so a just-settled rate is picked up on any chart interval. */
const TAIL_MIN_MS = 24 * 3600_000;

const fundingRequestCache = new SharedRequestCache<FundingResponse | null>(POLL_MS);

async function defaultFetch(query: FundingQuery): Promise<FundingResponse | null> {
    const url = `${ENDPOINT}?symbol=${encodeURIComponent(query.symbol)}&exchange=${encodeURIComponent(query.exchange)}` +
        `&from=${Math.floor(query.from)}&to=${Math.floor(query.to)}`;
    return fetchJson<FundingResponse>(url, 'funding');
}

export class FundingRateIndicator extends RemotePaneIndicator {
    /** Optional: the host may replace the built-in same-origin fetch. */
    static defaultProvider: FundingProvider | null = null;

    private _fundingOptions: FundingRateOptions;
    /** funding_time (unix s) -> rate (fraction) */
    private _rows = new Map<number, number>();
    private _current: FundingCurrent | null = null;
    /** Summed funding per source bar, in percent (null = no settlement in the bar) */
    private _pct: Array<number | null> = [];
    private _secondTimer: ReturnType<typeof setInterval> | null = null;

    constructor(options: Partial<FundingRateOptions> = {}) {
        super({ ...defaultFundingRateOptions, ...options }, POLL_MS);
        this._fundingOptions = { ...defaultFundingRateOptions, ...this._options } as FundingRateOptions;
        this._paneHeight = 120;
        // Countdown: repaint once per second, no refetch.
        this._secondTimer = setInterval(() => {
            if (!this.shown || (typeof document !== 'undefined' && document.hidden)) return;
            if (!this._fundingOptions.showPredicted || !this._current || !this._current.next_funding_time) return;
            this._dataChanged.fire();
        }, 1000);
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._fundingOptions };
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    rows: [checkboxRow('showPredicted', t('Show predicted rate'), true)],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('upColor', t('Positive funding')),
                        colorRow('downColor', t('Negative funding')),
                        colorRow('predictedColor', t('Predicted rate')),
                        colorRow('zeroLineColor', t('Zero Line Color')),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this._options.visible;
        return (this._fundingOptions as any)[key];
    }

    setSettingValue(key: string, value: any): boolean {
        Object.assign(this._fundingOptions, { [key]: value });
        Object.assign(this._options, { [key]: value });
        this._dataChanged.fire();
        return false;
    }

    // --- data ---

    protected _resetPayload(): void {
        this._rows = new Map();
        this._current = null;
    }

    protected _rebuild(): void {
        const bars: BarData[] = this._sourceData;
        const times = new Array<number>(bars.length);
        for (let i = 0; i < bars.length; i++) {
            times[i] = toEpochMs(bars[i].time);
        }
        const norm = this._ctx ? normalizeInterval(this._ctx.timeframe) : null;
        const lastBarMs = norm ? norm.seconds * 1000 : this._barMs;
        const rows = Array.from(this._rows.entries()).sort((a, b) => a[0] - b[0]);
        const sums = aggregateFunding(times, lastBarMs, rows);
        this._pct = sums.map((v) => (v === null ? null : v * 100));
        this._data = new Array(bars.length);
        for (let i = 0; i < bars.length; i++) {
            const p = this._pct[i];
            this._data[i] = { time: bars[i].time, value: p === null ? NaN : p };
        }
    }

    protected _supported(ctx: RemoteContext): boolean {
        return binanceFuturesSymbol(ctx.symbol, ctx.exchange) !== null;
    }

    protected _tailFromMs(lastMs: number): number {
        return Math.min(super._tailFromMs(lastMs), lastMs - TAIL_MIN_MS);
    }

    protected _planChunks(_ctx: RemoteContext, fromMs: number, toMs: number): Array<[number, number]> {
        // One window up to the end of the last bar, so a settlement that falls into the forming bar is included.
        // Truncated answers are continued inside _fetchChunk.
        const toSec = Math.floor((toMs + this._barMs) / 1000);
        const fromSec = Math.floor(fromMs / 1000);
        return toSec >= fromSec ? [[fromSec * 1000, toSec * 1000]] : [];
    }

    protected async _fetchChunk(ctx: RemoteContext, loMs: number, hiMs: number, gen: number, signal: AbortSignal, fresh: boolean): Promise<FetchOutcome> {
        const symbol = binanceFuturesSymbol(ctx.symbol, ctx.exchange);
        if (!symbol) return 'stale';
        void signal; // shared requests are not aborted; stale answers are dropped by the generation check
        const provider = FundingRateIndicator.defaultProvider;
        const from = Math.floor(loMs / 1000);
        let to = Math.floor(hiMs / 1000);
        for (let n = 0; n < FUNDING_MAX_REQUESTS; n++) {
            const query: FundingQuery = { symbol, exchange: 'BINANCE', from, to };
            const key = `${query.symbol}|${query.exchange}|${query.from}|${query.to}`;
            const res = await fundingRequestCache.get(key, () => (provider ? provider(query) : defaultFetch(query)), { fresh: fresh && n === 0 });
            if (gen !== this._gen) return 'stale';
            const rows = res?.rows ?? [];
            let first = Infinity;
            for (const row of rows) {
                if (Array.isArray(row) && typeof row[0] === 'number' && typeof row[1] === 'number') {
                    this._rows.set(row[0], row[1]);
                    if (row[0] < first) first = row[0];
                }
            }
            if (res?.current && typeof res.current.rate === 'number' && Number.isFinite(res.current.rate)) this._current = res.current;
            // Exactly the cap = truncated (the server keeps the newest rows): continue with the older part.
            if (rows.length < FUNDING_MAX_ROWS || !Number.isFinite(first) || first - 1 < from) break;
            to = first - 1;
        }
        return 'ok';
    }

    // --- range / drawing / legend ---

    private _predictedPct(): number | null {
        return this._current ? this._current.rate * 100 : null;
    }

    getRange(visibleRange?: { from: number; to: number } | null): IndicatorRange {
        const vals = this._pct;
        const start = visibleRange ? Math.max(0, Math.floor(visibleRange.from)) : 0;
        const end = visibleRange ? Math.min(vals.length - 1, Math.ceil(visibleRange.to)) : vals.length - 1;
        let min = 0;
        let max = 0;
        for (let i = start; i <= end; i++) {
            const v = vals[i];
            if (v === null || v === undefined) continue;
            if (v < min) min = v;
            if (v > max) max = v;
        }
        const pred = this._fundingOptions.showPredicted ? this._predictedPct() : null;
        if (pred !== null) {
            if (pred < min) min = pred;
            if (pred > max) max = pred;
        }
        if (min === 0 && max === 0) return { min: -0.01, max: 0.01 };
        const pad = (max - min) * 0.1;
        // Keep room on an empty side so the zero line is not glued to the pane edge.
        const lo = min === 0 ? -(max + pad) * 0.05 : min - pad;
        const hi = max === 0 ? -(min - pad) * 0.05 : max + pad;
        return { min: lo, max: hi };
    }

    getScaleFormatter(): (v: number) => string {
        return (v: number) => formatPercent(v, 4);
    }

    getLastValueLabels(): Array<{ price: number; text: string; color: string }> {
        return [];
    }

    getAxisLabels(): Array<{ price: number; color: string; text: string }> {
        const pred = this._fundingOptions.showPredicted ? this._predictedPct() : null;
        return pred === null ? [] : [{ price: pred, color: this._fundingOptions.predictedColor, text: formatPercent(pred, 4) }];
    }

    drawPane(ctx: CanvasRenderingContext2D, timeScale: TimeScale, priceScale: PriceScale, width: number, _height: number): void {
        const range = timeScale.visibleRange();
        const vals = this._pct;
        if (!range || vals.length === 0) return;
        const o = this._fundingOptions;
        const start = Math.max(0, Math.floor(range.from as number));
        const end = Math.min(vals.length - 1, Math.ceil(range.to as number));
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
            const v = vals[i];
            if (v === null || v === undefined || v === 0) continue;
            const x = (timeScale.indexToCoordinate(i as any) as number) - barWidth / 2;
            const y = priceScale.priceToCoordinate(v) as number;
            ctx.fillStyle = v > 0 ? o.upColor : o.downColor;
            ctx.fillRect(x, Math.min(y, zeroY), barWidth, Math.max(1, Math.abs(zeroY - y)));
        }

        const pred = o.showPredicted ? this._predictedPct() : null;
        if (pred !== null) {
            const y = Math.round(priceScale.priceToCoordinate(pred) as number) + 0.5;
            ctx.strokeStyle = o.predictedColor;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            ctx.setLineDash([]);

            const countdown = formatCountdown(this._current?.next_funding_time, Date.now());
            const label = `${t('Predicted')} ${formatPercent(pred, 4)}` + (countdown ? ` · ${countdown}` : '');
            ctx.font = `11px ${canvasSans()}`;
            ctx.textAlign = 'right';
            ctx.textBaseline = y > 16 ? 'bottom' : 'top';
            ctx.fillStyle = o.predictedColor;
            ctx.fillText(label, width - 6, y > 16 ? y - 3 : y + 3);
        }
        ctx.restore();
    }

    getLegendInfo(index?: number | null): IndicatorLegendInfo {
        const o = this._fundingOptions;
        const i = legendBarIndex(this._pct.length, index);
        const v = i >= 0 ? this._pct[i] : null;
        const plots: LegendPlot[] = [{
            color: v === null || v === undefined ? o.upColor : v >= 0 ? o.upColor : o.downColor,
            value: v ?? null,
            text: v === null || v === undefined ? NO_VALUE : formatPercent(v, 4),
        }];
        const pred = o.showPredicted ? this._predictedPct() : null;
        if (pred !== null) plots.push({ color: o.predictedColor, value: pred, text: formatPercent(pred, 4) });
        return this._applyDenied({ title: t('Funding Rate'), params: [], plots });
    }

    getDescription(index?: number): string {
        const i = legendBarIndex(this._pct.length, index);
        const v = i >= 0 ? this._pct[i] : null;
        const pred = this._predictedPct();
        return `${t('Funding Rate')}: ${v === null || v === undefined ? '-' : formatPercent(v, 4)}` +
            (pred !== null ? ` (${t('Predicted')} ${formatPercent(pred, 4)})` : '');
    }

    destroy(): void {
        if (this._secondTimer !== null) clearInterval(this._secondTimer);
        this._secondTimer = null;
        super.destroy();
    }
}
