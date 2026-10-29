import { BarData } from '../model/data';

/**
 * DOM-free helpers for bar replay: timeframe maths, the "reveal" rule and the
 * OHLCV aggregation used for the forming bar of intrabar stepping.
 *
 * Time unit: BarData.time may be epoch ms or epoch seconds. `unit` is the number of
 * milliseconds per time unit (1 = ms, 1000 = seconds); detect it with detectTimeUnit().
 */

export type TimeUnit = 1 | 1000;

export interface TfSpec {
    /** Fixed duration in ms (0 for calendar months). */
    ms: number;
    /** Calendar month multiplier (0 for fixed-duration timeframes). */
    months: number;
}

export function detectTimeUnit(bars: ReadonlyArray<{ time: number }>): TimeUnit {
    const t = bars.length > 0 ? bars[0].time : 0;
    return t > 1e12 || t === 0 ? 1 : 1000;
}

/** '1m' '15m' '1h' '4h' '1d'/'D' '1w'/'W' '1M'/'M'/'1mo' ('M' = month, 'm' = minute); bare number = minutes. */
export function parseTf(tf: string | null | undefined): TfSpec | null {
    if (!tf) return null;
    const str = String(tf).trim();
    const bare = str.match(/^(\d+)$/);
    if (bare) {
        const mins = parseInt(bare[1], 10);
        return mins >= 1 ? { ms: mins * 60_000, months: 0 } : null;
    }
    const m = str.match(/^(\d*)\s*([A-Za-z]+)$/);
    if (!m) return null;
    const n = m[1] === '' ? 1 : parseInt(m[1], 10);
    if (!(n >= 1)) return null;
    const raw = m[2];
    const low = raw.toLowerCase();
    if (raw === 'M' || low === 'mo' || low === 'mon' || low === 'month' || low === 'months') return { ms: 0, months: n };
    if (low === 's' || low === 'sec') return { ms: n * 1000, months: 0 };
    if (low === 'm' || low === 'min') return { ms: n * 60_000, months: 0 };
    if (low === 'h' || low === 'hour' || low === 'hours') return { ms: n * 3_600_000, months: 0 };
    if (low === 'd' || low === 'day' || low === 'days') return { ms: n * 86_400_000, months: 0 };
    if (low === 'w' || low === 'week' || low === 'weeks') return { ms: n * 604_800_000, months: 0 };
    return null;
}

/** Exclusive end time (same unit as `time`) of a bar opening at `time`. */
export function barEnd(time: number, spec: TfSpec, unit: TimeUnit): number {
    if (spec.months > 0) {
        const d = new Date(time * unit);
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + spec.months, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()) / unit;
    }
    return time + spec.ms / unit;
}

/** Approximate duration in ms used to compare timeframes (month ~ 28 days lower bound). */
export function approxMs(spec: TfSpec): number {
    return spec.months > 0 ? spec.months * 28 * 86_400_000 : spec.ms;
}

/**
 * Reveal rule: a bar is revealed iff `bar.time + tfDuration <= cursor`.
 * Returns the number of revealed bars (bars sorted by time ascending; end is monotonic).
 */
export function revealedCount(bars: ReadonlyArray<{ time: number }>, cursor: number, spec: TfSpec, unit: TimeUnit): number {
    let lo = 0;
    let hi = bars.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (barEnd(bars[mid].time, spec, unit) <= cursor) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

/** Index of the bar containing `time` (clamped to the first/last bar). -1 if there are no bars. */
export function barIndexContaining(bars: ReadonlyArray<{ time: number }>, time: number): number {
    if (bars.length === 0) return -1;
    let lo = 0;
    let hi = bars.length - 1;
    // last bar with bar.time <= time
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (bars[mid].time <= time) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

/**
 * Aggregate lower-timeframe bars with `from <= time < to` into one bar stamped `barTime`.
 * With `stepDur` > 0 only CLOSED lower bars are used (`time + stepDur <= to`), so nothing past `to` leaks.
 */
export function aggregateBars(lower: ReadonlyArray<BarData>, from: number, to: number, barTime: number, stepDur = 0): BarData | null {
    // lower is sorted ascending: binary search the first index with time >= from
    let lo = 0;
    let hi = lower.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (lower[mid].time < from) lo = mid + 1;
        else hi = mid;
    }
    let result: BarData | null = null;
    for (let i = lo; i < lower.length && (stepDur > 0 ? lower[i].time + stepDur <= to : lower[i].time < to); i++) {
        const b = lower[i];
        if (result === null) {
            result = { time: barTime, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0 };
        } else {
            if (b.high > result.high) result.high = b.high;
            if (b.low < result.low) result.low = b.low;
            result.close = b.close;
            result.volume = (result.volume ?? 0) + (b.volume ?? 0);
        }
    }
    return result;
}

/** Merge `incoming` (sorted) into the sorted `base` by time (incoming wins on equal time). */
export function mergeBarsByTime(base: BarData[], incoming: ReadonlyArray<BarData>): BarData[] {
    if (incoming.length === 0) return base;
    if (base.length === 0) return incoming.slice();
    // common case (cache extension): incoming strictly after base -> no map/sort needed
    if (incoming[0].time > base[base.length - 1].time) return base.concat(incoming);
    const map = new Map<number, BarData>();
    for (const b of base) map.set(b.time, b);
    for (const b of incoming) map.set(b.time, b);
    return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

/** Allowed replay speed multipliers (1x = one step per second). */
export const REPLAY_SPEEDS: readonly number[] = [0.1, 0.3, 0.5, 1, 3, 5, 7, 10];

export function snapSpeed(x: number): number {
    if (!(x > 0)) return 1;
    let best = REPLAY_SPEEDS[0];
    for (const s of REPLAY_SPEEDS) {
        if (Math.abs(s - x) < Math.abs(best - x)) best = s;
    }
    return best;
}
