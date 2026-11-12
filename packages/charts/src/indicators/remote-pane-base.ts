// Shared plumbing of the backend-fed derivatives panes (Funding Rate, Open Interest, Long/Short Ratio).
// Same behaviour as the Liquidations indicator: the loaded bar range is requested once per
// symbol/exchange/interval (in chunks), older history is requested when more bars get loaded, and the latest
// window is re-requested on a timer. Answers of a previous context are dropped (generation counter), 4xx
// answers stop requests until the context changes, 401/403 show a legend notice, replay shows nothing.

import { PanelIndicator, IndicatorOptions } from './indicator';
import { BarData } from '../model/data';
import { toEpochMs } from '../helpers/time';
import { t } from '../helpers/translations';
import { RemoteContext } from './remote-compute';
import { IndicatorLegendInfo } from './legend-info';
import {
    SharedRequestCache, normalizeInterval, derivsRequestInterval, binanceFuturesSymbol, clampDerivsFrom,
    chunkWindows, mapDerivsPoints, DERIVS_CHUNK_BUCKETS,
} from './remote-pane-utils';

/** One planned request window (ms, bar open times). `tail` = periodic refresh window, otherwise history. */
interface Task { lo: number; hi: number; tail: boolean; fromMissing: boolean }

export type FetchOutcome = 'ok' | 'degraded' | 'stale';

/** Throws an Error carrying the HTTP status (what the providers/fetchers of these panes must do). */
export async function fetchJson<T>(url: string, label: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(url, { cache: 'no-store', signal });
    if (!response.ok) {
        const error = new Error(label + ' request failed: ' + response.status) as Error & { status?: number };
        error.status = response.status;
        throw error;
    }
    return (await response.json()) as T;
}

const ENSURE_DEBOUNCE_MS = 300;
/** The periodic refresh re-reads this many latest bars. */
const TAIL_BARS = 12;
/** Longest wait between attempts while the backend keeps failing / answering `degraded`. */
export const MAX_BACKOFF_MS = 600_000;
/** First retry after a failed / degraded pass; then pollMs, 2x, 4x ... up to MAX_BACKOFF_MS. */
export const FIRST_RETRY_MS = 15_000;
/** Minimum gap between two attempts when a retry is forced (tab visible again). */
export const MIN_FORCED_GAP_MS = 5_000;
/**
 * A context change (symbol / exchange / timeframe) must be quiet for this long, and bars must have been
 * calculated after it, before anything is requested: the chart pushes symbol and exchange separately, so
 * the first update can pair a new symbol with the previous exchange.
 */
export const CONTEXT_SETTLE_MS = 300;

/** Wait after the n-th consecutive non-clean pass: 15 s, 60 s, 120 s, 240 s ... capped at 10 min. */
export function retryDelayMs(streak: number, pollMs: number): number {
    if (streak <= 1) return FIRST_RETRY_MS;
    return Math.min(MAX_BACKOFF_MS, pollMs * Math.pow(2, streak - 2));
}

/**
 * Fetch state machine (shared by the derivs panes and the funding pane):
 *  - first load / newly loaded bars (`calculate` path): debounced with a maximum wait, only when shown and the
 *    tab is visible, and never inside a back-off window after a failed pass;
 *  - poll path (timer / tab becomes visible): the latest window (always fresh) plus at most ONE chunk that is
 *    still missing from an earlier failed or interrupted pass;
 *  - a pass stops at the first `degraded` answer (its data is kept and its range counts as loaded) or at the first
 *    failure (the failed chunk and the rest stay in `_missing`); consecutive non-clean passes back off
 *    15 s, pollMs, 2x, 4x ... up to MAX_BACKOFF_MS (a retry timer fires at the end of each wait), a clean pass
 *    resets it; a visible tab / new context retries at once (>= 5 s after the previous attempt);
 *  - nothing is requested until a changed context has settled and bars were calculated after the change;
 *  - 4xx answers block the context until it changes.
 */
export abstract class RemotePaneIndicator extends PanelIndicator {
    protected _ctx: RemoteContext | null = null;
    protected _gen = 0;
    protected _abort: AbortController | null = null;
    protected _inFlight = false;
    protected _loadedKey = '';
    /** Open times (ms) of the first / last bar covered by completed requests for _loadedKey. */
    protected _loadedFrom = Infinity;
    protected _loadedTo = -Infinity;
    /** 401/403: the notice is shown in the legend; 4xx stops requests until the context changes. */
    protected _denied: 401 | 403 | null = null;
    protected _blocked = false;
    protected _barMs = 60_000;
    /** Chunks (newest first) of the loaded range that were not fetched yet. */
    private _missing: Array<[number, number]> = [];
    /** Consecutive non-clean passes and the earliest time (ms) the next attempt is welcome. */
    private _failStreak = 0;
    private _retryAt = 0;
    private _lastAttemptAt = 0;
    private _retryTimer: ReturnType<typeof setTimeout> | null = null;
    private _ctxChangedAt = 0;
    /** false from a symbol/exchange/timeframe change until the next calculate() */
    private _barsFresh = true;
    private readonly _pollMs: number;
    private _ensureTimer: ReturnType<typeof setTimeout> | null = null;
    private _pollTimer: ReturnType<typeof setInterval> | null = null;

    protected constructor(options: Partial<IndicatorOptions>, pollMs: number) {
        super(options);
        this._pollMs = pollMs;
        this._pollTimer = setInterval(() => this._poll(), pollMs);
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVisibility);
    }

    private readonly _onVisibility = (): void => {
        if (typeof document !== 'undefined' && !document.hidden) void this._ensure(true, true);
    };

    // --- to implement ---

    /** Drop the fetched payload (context changed). */
    protected abstract _resetPayload(): void;
    /** Rebuild `_data` (one point per source bar) from the payload. */
    protected abstract _rebuild(): void;
    /** False when this symbol/timeframe can never have data (no requests are made, the pane stays empty). */
    protected abstract _supported(ctx: RemoteContext): boolean;
    /** Request windows (ms, bar open times) for [fromMs, toMs], newest first; empty = nothing to ask. */
    protected abstract _planChunks(ctx: RemoteContext, fromMs: number, toMs: number): Array<[number, number]>;
    /**
     * Fetch + ingest one window. Must return 'stale' (without ingesting) when `gen` no longer matches.
     * `fresh` (periodic refresh) must bypass old cached answers.
     */
    protected abstract _fetchChunk(ctx: RemoteContext, loMs: number, hiMs: number, gen: number, signal: AbortSignal, fresh: boolean): Promise<FetchOutcome>;
    /** Start of the periodic refresh window (ms). */
    protected _tailFromMs(lastMs: number): number {
        return lastMs - TAIL_BARS * this._barMs;
    }

    // --- lifecycle ---

    setContext(ctx: RemoteContext): void {
        const prev = this._ctx;
        this._ctx = ctx;
        const changed = !prev || prev.symbol !== ctx.symbol || prev.timeframe !== ctx.timeframe ||
            (prev.exchange ?? '') !== (ctx.exchange ?? '') || (prev.end === undefined) !== (ctx.end === undefined);
        if (changed) {
            const feedChanged = !prev || prev.symbol !== ctx.symbol || prev.timeframe !== ctx.timeframe || (prev.exchange ?? '') !== (ctx.exchange ?? '');
            this._resetData();
            this._rebuild();
            this._dataChanged.fire();
            if (feedChanged) {
                this._ctxChangedAt = Date.now();
                // the bars in hand belong to the previous symbol until calculate() runs again (first context: bars are current)
                if (prev) this._barsFresh = false;
            }
            this._scheduleEnsure(true);
        }
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._barsFresh = true;
        if (sourceData.length >= 2) {
            const step = toEpochMs(sourceData[sourceData.length - 1].time) - toEpochMs(sourceData[sourceData.length - 2].time);
            if (step > 0) this._barMs = step;
        }
        this._rebuild();
        this._scheduleEnsure();
    }

    protected _resetData(): void {
        this._gen++;
        if (this._abort) this._abort.abort();
        this._abort = null;
        this._inFlight = false;
        this._resetPayload();
        this._loadedKey = '';
        this._loadedFrom = Infinity;
        this._loadedTo = -Infinity;
        this._denied = null;
        this._blocked = false;
        this._missing = [];
        this._failStreak = 0;
        this._retryAt = 0;
        this._lastAttemptAt = 0;
        this._clearRetryTimer();
    }

    private _clearRetryTimer(): void {
        if (this._retryTimer !== null) clearTimeout(this._retryTimer);
        this._retryTimer = null;
    }

    /** Debounce with a maximum wait: a pending timer is never re-armed, so a steady stream of updates cannot starve the load. */
    protected _scheduleEnsure(rearm = false): void {
        if (this._ensureTimer !== null) {
            if (!rearm) return;
            clearTimeout(this._ensureTimer);
        }
        this._ensureTimer = setTimeout(() => {
            this._ensureTimer = null;
            void this._ensure();
        }, ENSURE_DEBOUNCE_MS);
    }

    protected _poll(): void {
        void this._ensure(true);
    }

    private _canRun(): boolean {
        return this.shown && !(typeof document !== 'undefined' && document.hidden);
    }

    protected async _ensure(poll = false, force = false): Promise<void> {
        const ctx = this._ctx;
        const bars = this._sourceData;
        if (!ctx || bars.length === 0 || this._blocked || this._inFlight) return;
        // Replay: no future data may leak, so the pane stays empty and nothing is requested.
        if (ctx.end !== undefined) return;
        if (!this._canRun()) return;
        if (!this._supported(ctx)) return;
        const startedAt = Date.now();
        if (!this._barsFresh || startedAt - this._ctxChangedAt < CONTEXT_SETTLE_MS - 20) return;
        if (force) {
            if (startedAt - this._lastAttemptAt < MIN_FORCED_GAP_MS) return;
        } else if (startedAt < this._retryAt - 20) {
            return; // back-off (the retry timer ends it)
        }

        const key = `${ctx.symbol}|${ctx.exchange ?? ''}|${ctx.timeframe}`;
        const firstMs = toEpochMs(bars[0].time);
        const lastMs = toEpochMs(bars[bars.length - 1].time);
        if (key !== this._loadedKey) {
            this._loadedKey = key;
            this._loadedFrom = Infinity;
            this._loadedTo = -Infinity;
            this._missing = [];
        }

        const tasks: Task[] = [];
        const hist = (a: number, b: number) => {
            for (const [lo, hi] of this._planChunks(ctx, a, b)) tasks.push({ lo, hi, tail: false, fromMissing: false });
        };
        const firstLoad = this._loadedFrom === Infinity;
        if (firstLoad) {
            hist(firstMs, lastMs);
        } else if (poll) {
            const m = this._missing[0];
            if (m) tasks.push({ lo: m[0], hi: m[1], tail: false, fromMissing: true });
            for (const [lo, hi] of this._planChunks(ctx, Math.max(firstMs, this._tailFromMs(lastMs)), lastMs)) {
                if (m && lo >= m[0] && hi <= m[1]) continue; // already covered by the missing chunk
                tasks.push({ lo, hi, tail: true, fromMissing: false });
            }
        } else {
            if (firstMs < this._loadedFrom) hist(firstMs, this._loadedFrom);
            if (lastMs > this._loadedTo) hist(Math.max(firstMs, this._loadedTo), lastMs);
        }
        if (tasks.length === 0) return;
        this._lastAttemptAt = startedAt;
        this._clearRetryTimer();

        const gen = this._gen;
        const abort = new AbortController();
        this._abort = abort;
        this._inFlight = true;
        let clean = true;
        let done = 0; // tasks completed (ok or degraded)
        try {
            for (const task of tasks) {
                const outcome = await this._fetchChunk(ctx, task.lo, task.hi, gen, abort.signal, poll && task.tail);
                if (outcome === 'stale' || gen !== this._gen) return;
                done++;
                if (task.fromMissing) this._missing.shift();
                this._rebuild();
                this._dataChanged.fire();
                if (outcome === 'degraded') {
                    // Keep what arrived, count the range as loaded, stop this pass; the rest is retried one chunk per poll.
                    clean = false;
                    break;
                }
            }
        } catch (error) {
            clean = false;
            if (gen !== this._gen) return;
            const status = (error as { status?: number } | null)?.status;
            if (status === 401 || status === 403) this._denied = status;
            // Any 4xx (denied, unknown symbol, bad interval) is final for this context; network/5xx waits for the next poll.
            if (status !== undefined && status >= 400 && status < 500) this._blocked = true;
            this._dataChanged.fire();
        } finally {
            if (gen === this._gen) {
                this._inFlight = false;
                // History chunks that were not fetched (after a degraded answer or a failure) wait in _missing.
                const rest = tasks.slice(done).filter((x) => !x.tail && !x.fromMissing);
                for (const x of rest) this._missing.push([x.lo, x.hi]);
                if (firstLoad) {
                    this._loadedFrom = firstMs;
                    this._loadedTo = lastMs;
                } else if (poll) {
                    if (clean) this._loadedTo = Math.max(this._loadedTo, lastMs);
                } else {
                    this._loadedFrom = Math.min(this._loadedFrom, firstMs);
                    this._loadedTo = Math.max(this._loadedTo, lastMs);
                }
                if (clean) {
                    this._failStreak = 0;
                    this._retryAt = 0;
                } else if (!this._blocked) {
                    this._failStreak++;
                    const delay = retryDelayMs(this._failStreak, this._pollMs);
                    this._retryAt = startedAt + delay;
                    this._retryTimer = setTimeout(() => {
                        this._retryTimer = null;
                        void this._ensure(true);
                    }, delay + 25);
                }
                // Bars that arrived (history scrolled in, new bar) while this request ran: ask again.
                if (clean && !this._blocked && this._sourceData.length > 0) {
                    const f = toEpochMs(this._sourceData[0].time);
                    const l = toEpochMs(this._sourceData[this._sourceData.length - 1].time);
                    if (f < this._loadedFrom || l > this._loadedTo) this._scheduleEnsure();
                }
            }
        }
    }

    // --- shared bits ---

    protected _applyDenied(info: IndicatorLegendInfo): IndicatorLegendInfo {
        if (this._denied !== null) {
            info.error = this._denied === 401 ? t('Sign in to use this indicator') : t('This indicator requires a PRO membership');
        }
        return info;
    }

    destroy(): void {
        if (this._ensureTimer !== null) clearTimeout(this._ensureTimer);
        if (this._pollTimer !== null) clearInterval(this._pollTimer);
        this._clearRetryTimer();
        this._ensureTimer = null;
        this._pollTimer = null;
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVisibility);
        this._gen++;
        if (this._abort) this._abort.abort();
        this._abort = null;
        super.destroy();
    }
}

// --- derivs (Open Interest + Long/Short Ratio share one endpoint) ---

/** One server point: [t (unix s), oi_value, ls_ratio, top_ls_ratio, top_ls_pos_ratio, taker_ratio]; any value may be null. */
export type DerivsRow = [number, number | null, number | null, number | null, number | null, number | null];

export interface DerivsResponse {
    symbol?: string;
    interval?: string;
    source?: 'stored' | 'live' | 'mixed';
    period?: string;
    degraded?: boolean;
    bars: DerivsRow[];
}

export interface DerivsQuery {
    /** Chart symbol, ".P" suffix removed */
    symbol: string;
    exchange: string;
    interval: string;
    /** unix seconds */
    from: number;
    to: number;
}

/** Host-supplied fetcher (optional). Throw an Error with `status` on HTTP errors; return null for "no data". */
export type DerivsProvider = (query: DerivsQuery, opts?: { signal?: AbortSignal }) => Promise<DerivsResponse | null>;

const DERIVS_ENDPOINT = '/api/market/derivs';
export const DERIVS_POLL_MS = 60_000;

async function defaultDerivsFetch(query: DerivsQuery): Promise<DerivsResponse | null> {
    const url = `${DERIVS_ENDPOINT}?symbol=${encodeURIComponent(query.symbol)}&exchange=${encodeURIComponent(query.exchange)}` +
        `&interval=${encodeURIComponent(query.interval)}&from=${Math.floor(query.from)}&to=${Math.floor(query.to)}`;
    return fetchJson<DerivsResponse>(url, 'derivs');
}

/**
 * Process-wide: Open Interest and Long/Short Ratio on the same chart (or any two charts showing the same
 * symbol/interval/window) share one request. Key = symbol|exchange|interval|from|to; answers are reused for one
 * poll period, concurrent identical requests share one promise.
 */
export const derivsRequestCache = new SharedRequestCache<DerivsResponse | null>(DERIVS_POLL_MS);

/** Base of the panes that read /api/market/derivs. Subclasses turn the mapped server points into `_data`. */
export abstract class DerivsPaneIndicator extends RemotePaneIndicator {
    /** Optional: the host may replace the built-in same-origin fetch (shared by both derivs panes). */
    static defaultProvider: DerivsProvider | null = null;

    /** Server points by time (unix s) with the period (s) of the answer that carried them. */
    private _points = new Map<number, { row: DerivsRow; period: number }>();
    private _sorted: DerivsRow[] = [];
    private _periods: number[] = [];
    private _sortedDirty = false;

    protected constructor(options: Partial<IndicatorOptions>) {
        super(options, DERIVS_POLL_MS);
    }

    /**
     * Called from _rebuild. `map[i]` = index into `rows` (ascending by time) of the server point shown on source bar
     * i, -1 = none (see mapDerivsPoints for when a point becomes visible). `rows[k - 1]` is the previous server point.
     */
    protected abstract _buildData(map: number[], rows: DerivsRow[]): void;

    protected _resetPayload(): void {
        this._points = new Map();
        this._sorted = [];
        this._periods = [];
        this._sortedDirty = false;
    }

    protected _rebuild(): void {
        if (this._sortedDirty) {
            const all = Array.from(this._points.values()).sort((a, b) => a.row[0] - b.row[0]);
            this._sorted = all.map((x) => x.row);
            this._periods = all.map((x) => x.period);
            this._sortedDirty = false;
        }
        const bars = this._sourceData;
        const times = new Array<number>(bars.length);
        for (let i = 0; i < bars.length; i++) times[i] = toEpochMs(bars[i].time);
        const norm = this._ctx ? normalizeInterval(this._ctx.timeframe) : null;
        const chartSec = norm ? norm.seconds : this._barMs / 1000;
        const pts = this._sorted.map((r, k) => ({ t: r[0], period: this._periods[k] }));
        this._buildData(mapDerivsPoints(times, pts, chartSec), this._sorted);
    }

    protected _supported(ctx: RemoteContext): boolean {
        return normalizeInterval(ctx.timeframe) !== null && binanceFuturesSymbol(ctx.symbol, ctx.exchange) !== null;
    }

    protected _planChunks(ctx: RemoteContext, fromMs: number, toMs: number): Array<[number, number]> {
        const norm = normalizeInterval(ctx.timeframe);
        if (!norm) return [];
        const req = derivsRequestInterval(norm);
        const nowSec = Math.floor(Date.now() / 1000);
        const from = clampDerivsFrom(Math.floor(fromMs / 1000), norm.seconds, nowSec);
        const to = Math.floor(toMs / 1000);
        return chunkWindows(from, to, req.seconds, DERIVS_CHUNK_BUCKETS).map(([a, b]) => [a * 1000, b * 1000] as [number, number]);
    }

    protected async _fetchChunk(ctx: RemoteContext, loMs: number, hiMs: number, gen: number, _signal: AbortSignal, fresh: boolean): Promise<FetchOutcome> {
        const norm = normalizeInterval(ctx.timeframe);
        const symbol = binanceFuturesSymbol(ctx.symbol, ctx.exchange);
        if (!norm || !symbol) return 'stale';
        const req = derivsRequestInterval(norm);
        const query: DerivsQuery = {
            symbol, exchange: 'BINANCE', interval: req.interval,
            from: Math.floor(loMs / 1000), to: Math.floor(hiMs / 1000),
        };
        const key = `${query.symbol}|${query.exchange}|${query.interval}|${query.from}|${query.to}`;
        const provider = DerivsPaneIndicator.defaultProvider;
        const res = await derivsRequestCache.get(key, () => (provider ? provider(query) : defaultDerivsFetch(query)), { fresh });
        if (gen !== this._gen) return 'stale';
        const periodNorm = res?.period ? normalizeInterval(res.period) : null;
        const period = periodNorm ? periodNorm.seconds : req.seconds;
        for (const row of res?.bars ?? []) {
            if (!Array.isArray(row) || row.length < 6 || typeof row[0] !== 'number') continue;
            this._points.set(row[0], { row, period });
            this._sortedDirty = true;
        }
        return res?.degraded ? 'degraded' : 'ok';
    }
}
