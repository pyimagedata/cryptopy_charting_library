/**
 * Watchlist daily-candle data: a small in-memory cache (per symbol, ~1h TTL) with throttled loading, the 1-month
 * sparkline path and the "today" statistics used by the detail gauge. DOM-free helpers except where noted.
 */

export interface DailyBar {
    /** Bar open time, epoch ms (UTC midnight for crypto, the session open for forex / metals). */
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface DailyRequest {
    code: string;
    exchange: string;
    assetClass: string;
}

/** Host hook: ~30 most recent DAILY candles (oldest first, last one = today's bar). Return null/[] when unavailable. */
export type DailyProvider = (req: DailyRequest) => Promise<DailyBar[] | null | undefined>;

export const DAY_MS = 86400000;
const SPARK_BARS = 30;

interface Entry {
    bars: DailyBar[] | null;
    at: number;
    ok: boolean;
}

interface QueueItem {
    key: string;
    run: () => void;
}

export class DailyCache {
    private readonly _map = new Map<string, Entry>();
    private readonly _inflight = new Set<string>();
    private _queue: QueueItem[] = [];
    private _running = 0;
    private _dead = false;

    constructor(
        private readonly _maxConcurrent = 4,
        private readonly _ttlMs = 3600000,
        private readonly _failTtlMs = 300000,
        private readonly _timeoutMs = 15000,
    ) {}

    get(key: string): DailyBar[] | null {
        return this._map.get(key)?.bars ?? null;
    }

    /** Loads (or refreshes when older than `maxAgeMs`) the bars; `onLoaded` fires after a successful load only. */
    request(key: string, req: DailyRequest, provider: DailyProvider, onLoaded: (key: string) => void, maxAgeMs = this._ttlMs): void {
        if (this._dead || this._inflight.has(key)) return;
        const e = this._map.get(key);
        const age = e ? Date.now() - e.at : Infinity;
        if (e && age < (e.ok ? maxAgeMs : this._failTtlMs)) return;
        this._inflight.add(key);
        const run = (): void => {
            this._running += 1;
            let bars: DailyBar[] | null = null;
            let ok = false;
            let timer: ReturnType<typeof setTimeout> | undefined;
            // A hung request must not hold its slot forever.
            const timeout = new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('daily timeout')), this._timeoutMs);
            });
            Promise.race([Promise.resolve().then(() => provider(req)), timeout])
                .then((res) => {
                    const clean = Array.isArray(res) ? res.filter(isBar).slice(-SPARK_BARS - 5) : [];
                    if (clean.length) {
                        bars = clean;
                        ok = true;
                    }
                })
                .catch(() => undefined)
                .then(() => {
                    clearTimeout(timer);
                    this._running -= 1;
                    this._inflight.delete(key);
                    if (this._dead) return;
                    // A failed refresh keeps the previous bars.
                    this._map.set(key, { bars: ok ? bars : e?.bars ?? null, at: Date.now(), ok: ok || !!e?.ok });
                    try {
                        if (ok) onLoaded(key);
                    } catch (err) {
                        console.error('watchlist daily onLoaded failed', err);
                    } finally {
                        this._next();
                    }
                });
        };
        this._queue.push({ key, run });
        this._next();
    }

    /** Drops queued (not yet started) requests whose key is not in `keep`. */
    prune(keep: ReadonlySet<string>): void {
        if (!this._queue.length) return;
        const next: QueueItem[] = [];
        for (const q of this._queue) {
            if (keep.has(q.key)) next.push(q);
            else this._inflight.delete(q.key);
        }
        this._queue = next;
    }

    /** Stops everything: queued requests are dropped and late results are ignored. */
    destroy(): void {
        this._dead = true;
        this._queue = [];
        this._inflight.clear();
    }

    private _next(): void {
        while (!this._dead && this._running < this._maxConcurrent && this._queue.length) this._queue.shift()!.run();
    }
}

function isBar(b: unknown): b is DailyBar {
    const x = b as DailyBar;
    return !!x && [x.time, x.open, x.high, x.low, x.close].every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** Closes of the last month (oldest first) or null when fewer than 2 points. */
export function sparkCloses(bars: DailyBar[] | null): number[] | null {
    if (!bars || bars.length < 2) return null;
    return bars.slice(-SPARK_BARS).map((b) => b.close);
}

/**
 * SVG polyline markup (stroke only) coloured through the CSS variable name passed in `stroke`. `w`/`h` are the
 * viewBox size; the SVG itself fills its column (width:100%) so it always fits, whatever the column width.
 */
export function sparkSvg(closes: number[], w: number, h: number, stroke: string): string {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of closes) {
        if (c < lo) lo = c;
        if (c > hi) hi = c;
    }
    const pad = 2;
    const span = hi - lo || 1;
    const pts = closes.map((c, i) => {
        const x = (i / (closes.length - 1)) * (w - 2) + 1;
        const y = hi === lo ? h / 2 : pad + (1 - (c - lo) / span) * (h - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block;overflow:visible"><polyline fill="none" stroke="${stroke}" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" points="${pts.join(' ')}"/></svg>`;
}

export interface DayStats {
    open: number | null;
    high: number | null;
    low: number | null;
    volume: number | null;
}

/**
 * The current daily candle: the latest bar opened within the last 24h (crypto opens at 00:00 UTC, forex /
 * metals at the New York 17:00 session open, so the day is not assumed to start at UTC midnight).
 */
export function todayBar(bars: DailyBar[] | null, nowMs: number): DailyBar | null {
    const bar = bars && bars.length ? bars[bars.length - 1] : null;
    return bar && bar.time <= nowMs && nowMs - bar.time < DAY_MS ? bar : null;
}

/** Start / end (epoch ms) of the current daily candle; falls back to the UTC calendar day without a fresh bar. */
export function dayWindow(bars: DailyBar[] | null, nowMs: number): { start: number; end: number } {
    const bar = todayBar(bars, nowMs);
    const start = bar ? bar.time : Math.floor(nowMs / DAY_MS) * DAY_MS;
    return { start, end: start + DAY_MS };
}

/** Today's open/high/low/volume: host row fields first, else today's daily bar, widened by the live price. */
export function dayStats(
    bars: DailyBar[] | null,
    row: { price: number; open?: number | null; high?: number | null; low?: number | null; volume?: number },
    nowMs: number,
): DayStats {
    const today = todayBar(bars, nowMs);
    const num = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const open = num(row.open) ?? (today ? today.open : null);
    let high = num(row.high) ?? (today ? today.high : null);
    let low = num(row.low) ?? (today ? today.low : null);
    if (Number.isFinite(row.price) && row.price > 0) {
        if (high !== null) high = Math.max(high, row.price);
        if (low !== null) low = Math.min(low, row.price);
    }
    const vol = row.volume && row.volume > 0 ? row.volume : today && today.volume > 0 ? today.volume : null;
    return { open, high, low, volume: vol };
}

// ---- Gauge ----

const START = 135;
const SWEEP = 270;

function pt(cx: number, cy: number, r: number, deg: number): [number, number] {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
    const [x0, y0] = pt(cx, cy, r, a0);
    const [x1, y1] = pt(cx, cy, r, a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export interface GaugeInput {
    size: number;
    /** 0..1 position of the open / last price inside today's low-high range (null = unknown). */
    openPos: number | null;
    lastPos: number | null;
    /** 0..1 elapsed fraction of the current daily candle. */
    elapsed: number;
    up: boolean;
}

/** Circular gauge markup. Colours come from --rp-* variables (set on the panel root). */
export function gaugeSvg(g: GaugeInput): string {
    const S = g.size;
    const cx = S / 2;
    const cy = S / 2;
    const small = S < 100;
    const rt = S / 2 - (small ? 7 : 11);
    const ro = S / 2 - (small ? 1.5 : 2);
    const tw = small ? 5 : 8;
    const ow = small ? 1.5 : 2;
    const r0 = small ? 2.4 : 3;
    const r1 = small ? 3.8 : 5.5;
    const col = g.up ? 'var(--rp-up)' : 'var(--rp-down)';
    const at = (p: number): number => START + SWEEP * Math.min(1, Math.max(0, p));
    const parts: string[] = [];
    parts.push(`<path d="${arc(cx, cy, rt, START, START + SWEEP)}" fill="none" stroke="var(--rp-border)" stroke-width="${tw}" stroke-linecap="round"/>`);
    parts.push(`<path d="${arc(cx, cy, ro, START, START + SWEEP)}" fill="none" stroke="var(--rp-border)" stroke-width="${ow}" stroke-linecap="round" opacity=".55"/>`);
    if (g.elapsed > 0.002) {
        parts.push(`<path class="wl-g-elapsed" d="${arc(cx, cy, ro, START, START + SWEEP * Math.min(1, g.elapsed))}" fill="none" stroke="var(--rp-accent)" stroke-width="${ow}" stroke-linecap="round"/>`);
    }
    if (g.openPos !== null && g.lastPos !== null) {
        const a0 = at(Math.min(g.openPos, g.lastPos));
        const a1 = at(Math.max(g.openPos, g.lastPos));
        if (a1 - a0 > 0.4) parts.push(`<path d="${arc(cx, cy, rt, a0, a1)}" fill="none" stroke="${col}" stroke-width="${tw}" stroke-linecap="round"/>`);
        const [ox, oy] = pt(cx, cy, rt, at(g.openPos));
        parts.push(`<circle cx="${ox.toFixed(2)}" cy="${oy.toFixed(2)}" r="${r0}" fill="var(--rp-bg)" stroke="var(--rp-text)" stroke-width="1.5"/>`);
        const [lx, ly] = pt(cx, cy, rt, at(g.lastPos));
        parts.push(`<circle cx="${lx.toFixed(2)}" cy="${ly.toFixed(2)}" r="${r1}" fill="${col}" stroke="var(--rp-bg)" stroke-width="${small ? 2 : 2.5}"/>`);
    }
    return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" style="display:block">${parts.join('')}</svg>`;
}

/** "15sa 24dk" / "15h 24m" (minutes resolution, rounded up so it never reads low; "<1dk" for the last minute). */
export function formatCountdown(ms: number, tr: boolean): string {
    const total = Math.max(0, Math.ceil(ms / 60000));
    const h = Math.floor(total / 60);
    const m = total % 60;
    const hu = tr ? 'sa' : 'h';
    const mu = tr ? 'dk' : 'm';
    if (total <= 1) return `<1${mu}`;
    return h > 0 ? `${h}${hu} ${m}${mu}` : `${m}${mu}`;
}

/** Turkish possessive suffix of a percent number read aloud: 56 -> "sı" ("%56'sı"). */
export function trPercentSuffix(n: number): string {
    const v = Math.abs(Math.round(n));
    if (v === 100) return 'ü';
    const digit = v % 10;
    if (v === 0) return 'ı';
    if (digit === 0) return ['', 'u', 'si', 'u', 'ı', 'si', 'ı', 'i', 'i', 'ı'][Math.floor(v / 10) % 10];
    return ['', 'i', 'si', 'ü', 'ü', 'i', 'sı', 'si', 'i', 'u'][digit];
}
