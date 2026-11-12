/**
 * Pure date / time-zone / period helpers shared by the Sessions, Previous Levels and ADR indicators.
 * No DOM and no chart imports: unit-testable under plain node.
 *
 * Bar times may be epoch seconds or milliseconds (same rule as helpers/time.ts, duplicated here to keep
 * this module dependency free). All "local" values are wall-clock values of an IANA zone derived with
 * Intl.DateTimeFormat, so DST changes are handled by the platform tz database.
 */

export interface OhlcBar {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

const MS_THRESHOLD = 1e10;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const DAY_S = 86_400;

export function barTimeMs(t: number): number {
    return t > MS_THRESHOLD ? t : t * 1000;
}

// ---------------------------------------------------------------------------
// Timeframe
// ---------------------------------------------------------------------------

/** Shortest possible length of a month, so "interval >= month" never hides a month level too early. */
export const MONTH_MIN_SECONDS = 28 * DAY_S;
export const WEEK_SECONDS = 7 * DAY_S;

/**
 * Raw toolbar timeframe ("1m".."12h", "D", "W", "M", "1M", custom "90m", bare "240" = minutes) -> seconds.
 * Months return MONTH_MIN_SECONDS. null = unsupported (ticks, ranges, multi-month, garbage).
 */
export function timeframeSeconds(tf: string | null | undefined): number | null {
    if (!tf) return null;
    const str = String(tf).trim();
    const bare = /^(\d+)$/.exec(str);
    if (bare) {
        const n = parseInt(bare[1], 10);
        return n >= 1 ? n * 60 : null;
    }
    const m = /^(\d*)\s*([A-Za-z]+)$/.exec(str);
    if (!m) return null;
    const n = m[1] === '' ? 1 : parseInt(m[1], 10);
    if (!(n >= 1)) return null;
    const raw = m[2];
    const low = raw.toLowerCase();
    if (raw === 'M' || low === 'mo' || low === 'mon' || low === 'month' || low === 'months') {
        return n === 1 ? MONTH_MIN_SECONDS : null;
    }
    if (low === 's' || low === 'sec' || low === 'second' || low === 'seconds') return n;
    if (low === 'm' || low === 'min' || low === 'minute' || low === 'minutes') return n * 60;
    if (low === 'h' || low === 'hour' || low === 'hours') return n * 3600;
    if (low === 'd' || low === 'day' || low === 'days') return n * DAY_S;
    if (low === 'w' || low === 'week' || low === 'weeks') return n * WEEK_SECONDS;
    return null;
}

/** Bar interval in seconds estimated from the last bars (median of positive time steps); 0 when unknown. */
export function barIntervalSeconds(bars: ReadonlyArray<{ time: number }>): number {
    const n = bars.length;
    if (n < 2) return 0;
    const steps: number[] = [];
    for (let i = n - 1; i >= 1 && steps.length < 41; i--) {
        const d = barTimeMs(bars[i].time) - barTimeMs(bars[i - 1].time);
        if (d > 0) steps.push(d);
    }
    if (steps.length === 0) return 0;
    steps.sort((a, b) => a - b);
    return Math.round(steps[steps.length >> 1] / 1000);
}

// ---------------------------------------------------------------------------
// Zone clock
// ---------------------------------------------------------------------------

export interface LocalTime {
    /** Local calendar date as days since 1970-01-01 */
    day: number;
    /** Local minutes since local midnight (0..1439) */
    minute: number;
}

const MAX_OFFSET_CACHE = 60_000;

/**
 * Wall-clock conversion for one IANA zone. One Intl formatter per zone; the UTC offset is
 * resolved once per UTC hour and cached (every real-world DST switch happens on a whole UTC hour or
 * later granularity, so an hour bucket has a single offset). Per-bar cost is a Map lookup + arithmetic.
 */
export class ZoneClock {
    readonly zone: string;
    private readonly _fmt: Intl.DateTimeFormat;
    private readonly _offsets = new Map<number, number>();
    private _lastBucket = NaN;
    private _lastOffset = 0;

    constructor(zone: string) {
        this.zone = zone;
        this._fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: zone, hourCycle: 'h23',
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric',
        });
    }

    /** UTC offset of the zone (ms, local = utc + offset) at the given instant. */
    offsetMs(ms: number): number {
        const bucket = Math.floor(ms / HOUR_MS);
        if (bucket === this._lastBucket) return this._lastOffset;
        let off = this._offsets.get(bucket);
        if (off === undefined) {
            off = this._resolve(bucket * HOUR_MS);
            if (this._offsets.size >= MAX_OFFSET_CACHE) this._offsets.clear();
            this._offsets.set(bucket, off);
        }
        this._lastBucket = bucket;
        this._lastOffset = off;
        return off;
    }

    private _resolve(bucketStartMs: number): number {
        let y = 1970, mo = 1, d = 1, h = 0, mi = 0, s = 0;
        for (const p of this._fmt.formatToParts(new Date(bucketStartMs))) {
            switch (p.type) {
                case 'year': y = parseInt(p.value, 10); break;
                case 'month': mo = parseInt(p.value, 10); break;
                case 'day': d = parseInt(p.value, 10); break;
                case 'hour': h = parseInt(p.value, 10) % 24; break;
                case 'minute': mi = parseInt(p.value, 10); break;
                case 'second': s = parseInt(p.value, 10); break;
            }
        }
        const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
        return asUtc - bucketStartMs;
    }

    /** Local wall-clock date and minute-of-day of a UTC instant (ms). */
    local(ms: number): LocalTime {
        const lm = ms + this.offsetMs(ms);
        const day = Math.floor(lm / DAY_MS);
        const minute = Math.floor((lm - day * DAY_MS) / 60_000);
        return { day, minute };
    }
}

const clocks = new Map<string, ZoneClock>();

/** Cached ZoneClock per zone name. */
export function getZoneClock(zone: string): ZoneClock {
    let c = clocks.get(zone);
    if (!c) {
        c = new ZoneClock(zone);
        clocks.set(zone, c);
    }
    return c;
}

// ---------------------------------------------------------------------------
// "HH:MM" and session windows
// ---------------------------------------------------------------------------

/** "08:30", "8:30", "0830" -> minutes since midnight; "24:00" -> 1440. null when invalid. */
export function parseHHMM(s: unknown): number | null {
    if (typeof s !== 'string') return null;
    const m = /^\s*(\d{1,2}):?(\d{2})\s*$/.exec(s);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const mi = parseInt(m[2], 10);
    if (mi > 59 || h > 24 || (h === 24 && mi !== 0)) return null;
    return h * 60 + mi;
}

export function formatHHMM(minutes: number): string {
    const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Window membership of a local minute. start > end crosses midnight; start === end is an EMPTY window
 * (no session). Membership of a bar is decided by its OPEN time.
 */
export function inWindow(minute: number, startMin: number, endMin: number): boolean {
    const s = startMin % 1440;
    const e = endMin >= 1440 ? 0 : endMin; // "24:00" == midnight
    if (s === e) return false;
    return s < e ? minute >= s && minute < e : minute >= s || minute < e;
}

export interface SessionInstance {
    /** Local date the session STARTED on (days since epoch, in the session zone) */
    day: number;
    first: number;
    last: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

/**
 * Builds / extends session boxes. `instances` and `scannedLen` carry the state of the previous call
 * (pass [] and 0 for a full scan). Only the last, possibly still forming, instance is rebuilt on an
 * append-only update. Returns the new scannedLen. The caller must reset state when the window, the zone
 * or the first loaded bar changes.
 */
export function updateSessionInstances(
    bars: ReadonlyArray<OhlcBar>,
    clock: ZoneClock,
    startMin: number,
    endMin: number,
    instances: SessionInstance[],
    scannedLen: number,
): number {
    const n = bars.length;
    const s = startMin % 1440;
    const e = endMin >= 1440 ? 0 : endMin;
    let from = Math.max(0, Math.min(scannedLen, n) - 1);
    if (scannedLen === 0) from = 0;
    if (instances.length > 0 && instances[instances.length - 1].last >= from) {
        from = Math.min(from, instances[instances.length - 1].first);
        instances.pop();
    }
    if (s === e) return n;
    const crosses = s > e;
    for (let i = from; i < n; i++) {
        const b = bars[i];
        const { day, minute } = clock.local(barTimeMs(b.time));
        const inside = crosses ? (minute >= s || minute < e) : (minute >= s && minute < e);
        if (!inside) continue;
        const sday = crosses && minute < e ? day - 1 : day;
        const cur = instances.length > 0 ? instances[instances.length - 1] : null;
        if (cur && cur.day === sday) {
            cur.last = i;
            if (b.high > cur.high) cur.high = b.high;
            if (b.low < cur.low) cur.low = b.low;
            cur.close = b.close;
        } else {
            instances.push({ day: sday, first: i, last: i, open: b.open, high: b.high, low: b.low, close: b.close });
        }
    }
    return n;
}

// ---------------------------------------------------------------------------
// Day / week / month periods
// ---------------------------------------------------------------------------

/** 'utc' = day starts 00:00 UTC, weeks Monday; 'ny17' = day starts 17:00 New York (DST aware), weeks Sunday 17:00. */
export type DayStart = 'utc' | 'ny17';
export type PeriodKind = 'day' | 'week' | 'month';

export const NY_ZONE = 'America/New_York';
const NY_SHIFT_MS = 7 * HOUR_MS; // local 17:00 + 7h = next local midnight

/** Days since epoch -> civil year/month (1..12). Howard Hinnant's algorithm. */
function civilYearMonth(days: number): { y: number; m: number } {
    const z = days + 719468;
    const era = Math.floor(z / 146097);
    const doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153);
    const m = mp < 10 ? mp + 3 : mp - 9;
    const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
    return { y, m };
}

/** Day number of the trading day an instant belongs to (the day label of its period convention). */
export function tradingDay(ms: number, dayStart: DayStart): number {
    if (dayStart === 'utc') return Math.floor(ms / DAY_MS);
    const clock = getZoneClock(NY_ZONE);
    return Math.floor((ms + clock.offsetMs(ms) + NY_SHIFT_MS) / DAY_MS);
}

/** Period key (monotonic integer) of an instant. Weeks start Monday of the trading-day calendar. */
export function periodKey(ms: number, kind: PeriodKind, dayStart: DayStart): number {
    const day = tradingDay(ms, dayStart);
    if (kind === 'day') return day;
    if (kind === 'week') return Math.floor((day + 3) / 7); // 1970-01-01 was a Thursday
    const { y, m } = civilYearMonth(day);
    return y * 12 + (m - 1);
}

export function periodNominalSeconds(kind: PeriodKind): number {
    return kind === 'day' ? DAY_S : kind === 'week' ? WEEK_SECONDS : MONTH_MIN_SECONDS;
}

export interface Period {
    key: number;
    first: number;
    last: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

/**
 * Cheap price fingerprint of the first `count` bars: first bar open+close, a middle bar's close and the
 * open of bar count-1. None of these change on a live tick of the last bar (open is fixed once a bar
 * exists), but they differ when the symbol, exchange or chart type (candles vs Heikin-Ashi) changes
 * while times and length stay the same.
 */
export function barsFingerprint(bars: ReadonlyArray<OhlcBar>, count: number): number {
    const n = Math.min(count, bars.length);
    if (n <= 0) return 0;
    const mid = (n - 1) >> 1;
    return bars[0].open * 1.000003 + bars[0].close * 1.000007 + bars[mid].close * 1.000011 + bars[n - 1].open * 1.000013;
}

/**
 * Validity guard for incremental scans over a bar array. A cache built from `commit()`ted bars is only
 * reusable for an append-only continuation: same first bar, no shrink (replay step back), same anchor
 * bar time, same price fingerprint (symbol / chart type change) and same bar interval.
 */
export class ScanGuard {
    private _len = 0;
    private _first = NaN;
    private _anchor = NaN;
    private _fp = 0;
    private _interval = 0;

    reset(): void {
        this._len = 0; this._first = NaN; this._anchor = NaN; this._fp = 0; this._interval = 0;
    }

    isValid(bars: ReadonlyArray<OhlcBar>, intervalSec: number): boolean {
        const l = this._len;
        return l > 0 && bars.length >= l && bars[0].time === this._first && bars[l - 1].time === this._anchor &&
            barsFingerprint(bars, l) === this._fp && intervalSec === this._interval;
    }

    commit(bars: ReadonlyArray<OhlcBar>, intervalSec: number): void {
        const n = bars.length;
        if (n === 0) { this.reset(); return; }
        this._len = n; this._first = bars[0].time; this._anchor = bars[n - 1].time;
        this._fp = barsFingerprint(bars, n); this._interval = intervalSec;
    }
}

/**
 * "Auto" day start: 24/7 markets (any loaded bar on a Saturday UTC) use UTC 00:00; markets that are
 * closed on Saturdays (FX, gold, futures, which reopen Sunday evening) use New York 17:00.
 */
export function detectDayStart(bars: ReadonlyArray<{ time: number }>): DayStart {
    for (let i = 0; i < bars.length; i++) {
        const day = Math.floor(barTimeMs(bars[i].time) / DAY_MS);
        if ((((day + 4) % 7) + 7) % 7 === 6) return 'utc'; // 1970-01-01 (day 0) was a Thursday; Saturday = 6
    }
    return 'ny17';
}

/**
 * Incremental OHLC aggregation of bars into periods. Periods are assigned by bar OPEN time (on 4h/12h
 * bars in NY-17:00 mode the bar that opens before 17:00 and closes after it belongs to the old day). update() is cheap on a live tick: only the last
 * period is rebuilt. Any change of history (different first bar, shrink, mismatched anchor bar) resets it.
 */
export class PeriodSeries {
    periods: Period[] = [];
    private _kind: PeriodKind;
    private _dayStart: DayStart;
    private _scanned = 0;
    private _firstTime = NaN;
    private _anchorTime = NaN;
    private _fp = 0;
    private _eff: Period[] | null = null;

    constructor(kind: PeriodKind, dayStart: DayStart) {
        this._kind = kind;
        this._dayStart = dayStart;
    }

    get kind(): PeriodKind { return this._kind; }
    get dayStart(): DayStart { return this._dayStart; }

    configure(dayStart: DayStart): void {
        if (dayStart !== this._dayStart) {
            this._dayStart = dayStart;
            this.reset();
        }
    }

    reset(): void {
        this.periods = [];
        this._scanned = 0;
        this._firstTime = NaN;
        this._anchorTime = NaN;
        this._fp = 0;
        this._eff = null;
    }

    update(bars: ReadonlyArray<OhlcBar>): void {
        const n = bars.length;
        if (n === 0) { this.reset(); return; }
        if (this._scanned > 0 && (n < this._scanned || bars[0].time !== this._firstTime || bars[this._scanned - 1].time !== this._anchorTime ||
            barsFingerprint(bars, this._scanned) !== this._fp)) {
            this.reset();
        }
        let from = Math.max(0, this._scanned - 1);
        const ps = this.periods;
        if (ps.length > 0 && ps[ps.length - 1].last >= from) {
            from = Math.min(from, ps[ps.length - 1].first);
            ps.pop();
        }
        for (let i = from; i < n; i++) {
            const b = bars[i];
            const key = periodKey(barTimeMs(b.time), this._kind, this._dayStart);
            const cur = ps.length > 0 ? ps[ps.length - 1] : null;
            if (cur && cur.key === key) {
                cur.last = i;
                if (b.high > cur.high) cur.high = b.high;
                if (b.low < cur.low) cur.low = b.low;
                cur.close = b.close;
            } else {
                ps.push({ key, first: i, last: i, open: b.open, high: b.high, low: b.low, close: b.close });
            }
        }
        this._scanned = n;
        this._firstTime = bars[0].time;
        this._anchorTime = bars[n - 1].time;
        this._fp = barsFingerprint(bars, n);
        this._eff = null;
    }

    /**
     * Periods with stubs merged: a day with fewer than 25% of the median bar count of the loaded days
     * (e.g. the 2-hour "Sunday" of an FX market reopening Sunday 22:00 UTC) is merged into the NEXT day.
     * The forming last period is never a stub and is not used for the median. Week / month unchanged.
     */
    effectivePeriods(): Period[] {
        if (this._kind !== 'day') return this.periods;
        if (this._eff) return this._eff;
        const ps = this.periods;
        const done = ps.length - 1; // completed periods: 0..done-1
        if (done < 3) return (this._eff = ps);
        const counts: number[] = [];
        for (let i = 0; i < done; i++) counts.push(ps[i].last - ps[i].first + 1);
        counts.sort((a, b) => a - b);
        const limit = counts[counts.length >> 1] * 0.25;
        let hasStub = false;
        for (let i = 0; i < done; i++) if (ps[i].last - ps[i].first + 1 < limit) { hasStub = true; break; }
        if (!hasStub) return (this._eff = ps);
        const out: Period[] = [];
        let carry = null as Period | null;
        for (let i = 0; i < ps.length; i++) {
            const p = ps[i];
            const isStub = i < done && p.last - p.first + 1 < limit;
            if (isStub) {
                carry = carry ? { ...carry, last: p.last, high: Math.max(carry.high, p.high), low: Math.min(carry.low, p.low), close: p.close, key: p.key } : p;
                continue;
            }
            if (carry) {
                out.push({ key: p.key, first: carry.first, last: p.last, open: carry.open, high: Math.max(carry.high, p.high), low: Math.min(carry.low, p.low), close: p.close });
                carry = null;
            } else {
                out.push(p);
            }
        }
        return (this._eff = out);
    }

    /**
     * True when the first loaded period is known to be whole: the chart interval is at least the period
     * (a bar IS the period), or the slot just before the first bar already belongs to an earlier period.
     */
    firstPeriodComplete(bars: ReadonlyArray<OhlcBar>, intervalSec: number): boolean {
        if (this.periods.length === 0 || bars.length === 0 || !(intervalSec > 0)) return false;
        if (intervalSec >= periodNominalSeconds(this._kind)) return true;
        const prevKey = periodKey(barTimeMs(bars[0].time) - intervalSec * 1000, this._kind, this._dayStart);
        return prevKey !== this.periods[0].key;
    }
}

export interface PrevLevelSet {
    /** Index into series.periods of the period the lines belong to (their "current" period) */
    periodIndex: number;
    /** First / last bar index of that period */
    startIdx: number;
    endIdx: number;
    /** Open of that period (first bar open) */
    open: number;
    /** High / low / close of the period BEFORE it (complete, no look-ahead) */
    prevHigh: number;
    prevLow: number;
    prevClose: number;
    isCurrent: boolean;
}

/**
 * Previous-period levels for the current period and (count - 1) periods before it, newest first.
 * A set for period q uses only period q-1. q-1 being the first loaded period needs it to be complete,
 * otherwise the set is skipped (a wrong level is worse than none).
 */
export function previousLevelSets(
    series: PeriodSeries,
    bars: ReadonlyArray<OhlcBar>,
    intervalSec: number,
    count: number,
): PrevLevelSet[] {
    const ps = series.effectivePeriods();
    const out: PrevLevelSet[] = [];
    if (ps.length === 0) return out;
    const lastP = ps.length - 1;
    const firstOk = series.firstPeriodComplete(bars, intervalSec);
    const k = Math.max(1, Math.floor(count));
    for (let q = lastP; q >= 0 && q > lastP - k; q--) {
        const prev = q - 1;
        if (prev < 0) break;
        if (prev === 0 && !firstOk) break;
        const cur = ps[q];
        const pp = ps[prev];
        out.push({
            periodIndex: q, startIdx: cur.first, endIdx: cur.last, open: cur.open,
            prevHigh: pp.high, prevLow: pp.low, prevClose: pp.close, isCurrent: q === lastP,
        });
    }
    return out;
}

export interface AdrResult {
    adr: number;
    /** Number of completed days averaged */
    days: number;
}

/**
 * Average range of the last `length` COMPLETED days (the forming last period is excluded, as is a
 * truncated first one). When fewer than `length` are loaded, the available ones are used if there are
 * at least min(length, 5); otherwise null.
 */
export function computeAdr(series: PeriodSeries, firstComplete: boolean, length: number): AdrResult | null {
    const ps = series.effectivePeriods();
    const len = Math.max(1, Math.floor(length));
    const lo = firstComplete ? 0 : 1;
    const hi = ps.length - 2; // last completed day
    const avail = hi - lo + 1;
    if (avail < Math.min(len, 5)) return null;
    const use = Math.min(len, avail);
    let sum = 0;
    for (let i = hi - use + 1; i <= hi; i++) sum += ps[i].high - ps[i].low;
    const adr = sum / use;
    return Number.isFinite(adr) ? { adr, days: use } : null;
}

// ---------------------------------------------------------------------------
// Small shared formatting helpers
// ---------------------------------------------------------------------------

/** "#rgb" / "#rrggbb" / "#rrggbbaa" / "rgb(a)(...)" + extra alpha multiplier -> "rgba(r,g,b,a)". */
export function colorWithAlpha(color: string, alpha: number): string {
    const c = String(color).trim();
    let r = 128, g = 128, b = 128, a = 1;
    if (c.startsWith('#')) {
        let h = c.slice(1);
        if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('');
        if (h.length === 6 || h.length === 8) {
            r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
            if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
        }
    } else {
        const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(c);
        if (m) {
            r = Math.round(parseFloat(m[1])); g = Math.round(parseFloat(m[2])); b = Math.round(parseFloat(m[3]));
            if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        }
    }
    const A = Math.max(0, Math.min(1, a * alpha));
    return `rgba(${r}, ${g}, ${b}, ${Number(A.toFixed(3))})`;
}

/** Price text without trailing zeros: 67250.50 -> "67250.5". `precision` undefined = adaptive. */
export function formatLevelPrice(v: number, precision?: number): string {
    if (!Number.isFinite(v)) return '-';
    let p = precision;
    if (p === undefined) {
        const abs = Math.abs(v);
        p = abs >= 1 || abs === 0 ? 2 : Math.min(8, Math.max(4, 3 - Math.floor(Math.log10(abs))));
    }
    return String(Number(v.toFixed(p)));
}
