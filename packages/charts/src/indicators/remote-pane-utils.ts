// Pure helpers shared by the backend-fed derivatives panes (Funding Rate, Open Interest, Long/Short Ratio).
// No DOM / chart imports so they can be unit-tested standalone (scripts/remote-pane.test.ts).

export const MONTH_STEP_SECONDS = 31 * 86400;
/** Sub-hour derivs data exists for about this many days only. */
export const DERIVS_INTRADAY_DAYS = 29;
/** Derivs requests are made in chunks of at most this many buckets (backend cap is 5000). */
export const DERIVS_CHUNK_BUCKETS = 4000;
/** Smallest period the derivs endpoint serves. */
export const DERIVS_MIN_STEP_SECONDS = 300;
/** Sub-hour server points can be 5/15/30 minutes apart: a point is carried over finer bars for at most this long. */
export const DERIVS_HOLD_SECONDS = 3600;

const SYMBOL_RE = /^[A-Z0-9]{2,24}$/;

export interface NormalizedInterval {
    /** Backend interval string: "5m", "4h", "1d", "1w", "1mo" */
    interval: string;
    /** Bucket length in seconds (month = 31 days) */
    seconds: number;
}

/**
 * Chart timeframe (raw toolbar string: "1m".."12h", "D", "W", "M", "1M", "1mo", custom "90m", bare "240" = minutes)
 * -> backend interval string and bucket length in seconds. Same reading rules as the liquidations indicator
 * ('M' / "mo" = month, 'm' = minute). null = unsupported (seconds, ticks, ranges, multi-month).
 */
export function normalizeInterval(tf: string | null | undefined): NormalizedInterval | null {
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
    if (raw === 'M' || low === 'mo' || low === 'mon' || low === 'month' || low === 'months') {
        return n === 1 ? { interval: '1mo', seconds: MONTH_STEP_SECONDS } : null;
    }
    if (low === 'm' || low === 'min' || low === 'minute' || low === 'minutes') return { interval: `${n}m`, seconds: n * 60 };
    if (low === 'h' || low === 'hour' || low === 'hours') return { interval: `${n}h`, seconds: n * 3600 };
    if (low === 'd' || low === 'day' || low === 'days') return { interval: `${n}d`, seconds: n * 86400 };
    if (low === 'w' || low === 'week' || low === 'weeks') return { interval: `${n}w`, seconds: n * 604800 };
    return null;
}

/** Interval to request from /derivs: chart intervals below 5 minutes are served as 5-minute points. */
export function derivsRequestInterval(norm: NormalizedInterval): NormalizedInterval {
    if (norm.seconds < DERIVS_MIN_STEP_SECONDS) return { interval: '5m', seconds: DERIVS_MIN_STEP_SECONDS };
    return norm;
}

/** Backend symbol for a chart symbol/exchange, or null when it cannot be a Binance USD-M perpetual. */
export function binanceFuturesSymbol(symbol: string, exchange?: string): string | null {
    const ex = (exchange ?? '').toUpperCase();
    if (ex !== 'BINANCE' && ex !== 'BINANCE-FUTURES') return null;
    const s = symbol.toUpperCase().replace(/\.P$/, '');
    return SYMBOL_RE.test(s) ? s : null;
}

/** Sub-hour derivs exist only for the last ~29 days: clamp `from` (unix s). Hourly and longer pass through. */
export function clampDerivsFrom(fromSec: number, chartStepSec: number, nowSec: number): number {
    if (chartStepSec >= 3600) return fromSec;
    return Math.max(fromSec, nowSec - DERIVS_INTRADAY_DAYS * 86400);
}

/**
 * Split [fromSec, toSec] into windows of at most `maxBuckets` buckets of `stepSec`, newest first.
 * Windows do not overlap. Empty when from > to.
 */
export function chunkWindows(fromSec: number, toSec: number, stepSec: number, maxBuckets: number): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    if (!(toSec >= fromSec) || !(stepSec > 0) || !(maxBuckets >= 1)) return out;
    const span = (maxBuckets - 1) * stepSec;
    let hi = toSec;
    while (hi >= fromSec) {
        const lo = Math.max(fromSec, hi - span);
        out.push([lo, hi]);
        hi = lo - stepSec;
    }
    return out;
}

/**
 * Step-hold mapping: for every chart bar the index of the latest server point whose time is <= the bar time and
 * younger than `maxAgeSec` (exclusive); -1 = no point (never looks forward, so bars before the first point stay empty).
 * Both arrays ascending.
 */
export function holdToBars(barTimesMs: ArrayLike<number>, pointTimesSec: ArrayLike<number>, maxAgeSec: number): number[] {
    const out: number[] = new Array(barTimesMs.length);
    let j = -1;
    const n = pointTimesSec.length;
    for (let i = 0; i < barTimesMs.length; i++) {
        const barSec = barTimesMs[i] / 1000;
        while (j + 1 < n && pointTimesSec[j + 1] <= barSec) j++;
        out[i] = j >= 0 && barSec - pointTimesSec[j] < maxAgeSec ? j : -1;
    }
    return out;
}

/** Hold window for a chart interval: finer-than-1h charts carry 5/15/30 min points; others need an aligned point. */
export function holdSecondsFor(chartStepSec: number): number {
    return chartStepSec < 3600 ? DERIVS_HOLD_SECONDS : chartStepSec;
}

export interface DerivsPointTime {
    /** Bucket open, unix seconds (server label) */
    t: number;
    /** Server period of the point in seconds (5m/15m/30m for sub-hour answers, the interval otherwise) */
    period: number;
}

/**
 * Maps server points (ascending by `t`) to chart bars: index into `points` per bar, -1 = none.
 *
 * Every derivs value is a period-END snapshot (open interest, the long/short ratios) or an aggregate over the
 * period (taker ratio), labelled with the period OPEN. So:
 *  - chart interval >= 1h (equal to the server interval): the point labelled `t` belongs to the bar that opens
 *    in [t, next bar open) and is shown on that bar, like a candle close; a bar without such a point stays
 *    empty (nothing is carried across bars, so a February point can never show on a March bar).
 *  - finer chart bars than the server period (e.g. 5m points on a 1m/3m chart, or 30m points on a 5m chart):
 *    the value only becomes known at `t + period`, so it appears on the first bar opening at or after that and
 *    is then held forward (never backward) for DERIVS_HOLD_SECONDS.
 *  - sub-hour chart equal to the period: visible from `t`, held the same way.
 */
export function mapDerivsPoints(barTimesMs: ArrayLike<number>, points: ReadonlyArray<DerivsPointTime>, chartSec: number): number[] {
    const n = barTimesMs.length;
    if (chartSec >= 3600) {
        const out: number[] = new Array(n).fill(-1);
        let j = 0;
        for (let i = 0; i < n; i++) {
            const lo = barTimesMs[i] / 1000;
            const hi = i + 1 < n ? barTimesMs[i + 1] / 1000 : lo + chartSec;
            while (j < points.length && points[j].t < lo) j++;
            for (let k = j; k < points.length && points[k].t < hi; k++) out[i] = k;
        }
        return out;
    }
    const vis = points.map((p, i) => ({ v: chartSec < p.period ? p.t + p.period : p.t, i }));
    vis.sort((a, b) => a.v - b.v || a.i - b.i);
    const held = holdToBars(barTimesMs, vis.map((x) => x.v), DERIVS_HOLD_SECONDS);
    return held.map((k) => (k < 0 ? -1 : vis[k].i));
}

/**
 * Funding aggregation: every settlement goes to the chart bar that contains its time; several settlements in one
 * bar are summed. Settlements before the first bar or after the end of the last bar are dropped.
 * Returns one entry per bar (null = no settlement in that bar). `lastBarMs` is the duration of the last bar.
 */
export function aggregateFunding(
    barTimesMs: ArrayLike<number>,
    lastBarMs: number,
    rows: ReadonlyArray<readonly [number, number]>
): Array<number | null> {
    const n = barTimesMs.length;
    const out: Array<number | null> = new Array(n).fill(null);
    if (n === 0) return out;
    let i = 0;
    for (const row of rows) {
        const tMs = row[0] * 1000;
        const rate = row[1];
        if (typeof rate !== 'number' || !Number.isFinite(rate)) continue;
        if (tMs < barTimesMs[0]) continue;
        if (i > 0 && tMs < barTimesMs[i]) i = 0; // rows are ascending; defensive restart
        while (i + 1 < n && barTimesMs[i + 1] <= tMs) i++;
        if (i === n - 1 && tMs >= barTimesMs[n - 1] + lastBarMs) continue;
        out[i] = (out[i] ?? 0) + rate;
    }
    return out;
}

/** Contiguous runs of valid values; a gap of more than `maxGap` missing bars splits the run (line is broken). */
export function lineRuns(values: ArrayLike<number | null>, from: number, to: number, maxGap: number): number[][] {
    const runs: number[][] = [];
    let cur: number[] = [];
    let last = -1;
    for (let i = Math.max(0, from); i <= to && i < values.length; i++) {
        const v = values[i];
        if (v === null || v === undefined || !Number.isFinite(v)) continue;
        if (cur.length > 0 && i - last - 1 > maxGap) {
            runs.push(cur);
            cur = [];
        }
        cur.push(i);
        last = i;
    }
    if (cur.length > 0) runs.push(cur);
    return runs;
}

// --- formatting ---

export const NO_VALUE = '∅';

/** 1.234e9 -> "1.2B", 340e6 -> "340M", 12500 -> "12.5K", 12 -> "12" */
export function formatCompact(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return NO_VALUE;
    const abs = Math.abs(v);
    const trim = (x: number) => String(Number(x.toFixed(abs >= 1e9 ? 2 : 1)));
    if (abs >= 1e12) return trim(v / 1e12) + 'T';
    if (abs >= 1e9) return trim(v / 1e9) + 'B';
    if (abs >= 1e6) return trim(v / 1e6) + 'M';
    if (abs >= 1e3) return trim(v / 1e3) + 'K';
    return String(Math.round(v));
}

/** Percent value (already x100) with fixed decimals: 0.01 -> "0.0100%" */
export function formatPercent(pct: number | null | undefined, decimals = 4): string {
    if (pct === null || pct === undefined || !Number.isFinite(pct)) return NO_VALUE;
    return pct.toFixed(decimals) + '%';
}

/** Signed percent change: 1.234 -> "+1.23%" */
export function formatSignedPercent(pct: number | null | undefined, decimals = 2): string {
    if (pct === null || pct === undefined || !Number.isFinite(pct)) return NO_VALUE;
    return (pct > 0 ? '+' : '') + pct.toFixed(decimals) + '%';
}

export function formatRatio(v: number | null | undefined, decimals = 3): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return NO_VALUE;
    return v.toFixed(decimals);
}

/**
 * Countdown "HH:MM:SS" to a unix-seconds time; null when the time is 0/absent/invalid (hide the countdown).
 * Past times show "00:00:00".
 */
export function formatCountdown(nextSec: number | null | undefined, nowMs: number): string | null {
    if (nextSec === null || nextSec === undefined || !Number.isFinite(nextSec) || nextSec <= 0) return null;
    const left = Math.max(0, Math.floor(nextSec - nowMs / 1000));
    const h = Math.floor(left / 3600);
    const m = Math.floor((left % 3600) / 60);
    const s = left % 60;
    const p = (x: number) => (x < 10 ? '0' + x : String(x));
    return `${p(h)}:${p(m)}:${p(s)}`;
}

// --- request sharing ---

/** A completed answer this young is reused even by "fresh" requests (two panes polling within seconds share). */
export const FRESH_REUSE_MS = 5000;

/**
 * Tiny request cache shared by every indicator instance of one kind: concurrent identical requests share one
 * promise, a resolved answer is reused for `ttlMs`. Failures are never cached.
 * `fresh` requests (tail polls) skip completed answers older than `freshReuseMs` but still join an in-flight
 * request and store their result for others.
 * The fetcher gets no AbortSignal on purpose (another subscriber may still need the answer); callers drop stale
 * answers themselves.
 */
export class SharedRequestCache<T> {
    private readonly _inflight = new Map<string, Promise<T>>();
    private readonly _done = new Map<string, { at: number; value: T }>();

    constructor(
        private readonly _ttlMs: number,
        private readonly _now: () => number = () => Date.now(),
        private readonly _maxEntries = 24,
        private readonly _freshReuseMs = FRESH_REUSE_MS
    ) { }

    get(key: string, fetcher: () => Promise<T>, opts?: { fresh?: boolean }): Promise<T> {
        const now = this._now();
        const hit = this._done.get(key);
        if (hit) {
            const limit = opts?.fresh ? Math.min(this._ttlMs, this._freshReuseMs) : this._ttlMs;
            if (now - hit.at < limit) return Promise.resolve(hit.value);
            if (now - hit.at >= this._ttlMs) this._done.delete(key);
        }
        const running = this._inflight.get(key);
        if (running) return running;
        const p = fetcher().then(
            (value) => {
                this._inflight.delete(key);
                this._done.set(key, { at: this._now(), value });
                this._prune();
                return value;
            },
            (error) => {
                this._inflight.delete(key);
                throw error;
            }
        );
        this._inflight.set(key, p);
        return p;
    }

    clear(): void {
        this._done.clear();
    }

    get size(): number {
        return this._done.size + this._inflight.size;
    }

    private _prune(): void {
        const now = this._now();
        for (const [k, v] of this._done) if (now - v.at >= this._ttlMs) this._done.delete(k);
        while (this._done.size > this._maxEntries) {
            const first = this._done.keys().next().value;
            if (first === undefined) break;
            this._done.delete(first);
        }
    }
}
