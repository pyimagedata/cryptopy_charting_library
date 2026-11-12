/**
 * Pure period bucketing + profile summary for the session / visible-range volume profiles
 * (no DOM / chart imports). All calendar maths is UTC.
 */

import { VolumeProfileBar, VolumeProfileResult, computeVolumeProfile } from './volume-profile-math';

export type ProfilePeriod = 'day' | 'week' | 'month';

const DAY_MS = 86_400_000;
const MS_THRESHOLD = 1e10; // same rule as helpers/time.ts toEpochMs (kept local: this module has no imports from the chart)

function toMs(t: number): number {
    return t > MS_THRESHOLD ? t : t * 1000;
}

/** Start (epoch ms, UTC) of the period containing `ms`. Week = ISO week, Monday 00:00 UTC. */
export function periodStartMs(ms: number, period: ProfilePeriod): number {
    if (period === 'day') return Math.floor(ms / DAY_MS) * DAY_MS;
    if (period === 'week') {
        const days = Math.floor(ms / DAY_MS);
        const weekday = (((days + 3) % 7) + 7) % 7; // 1970-01-01 was a Thursday -> Monday = 0
        return (days - weekday) * DAY_MS;
    }
    const d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** Start of the period that follows the one starting at `startMs`. */
export function nextPeriodStartMs(startMs: number, period: ProfilePeriod): number {
    if (period === 'day') return startMs + DAY_MS;
    if (period === 'week') return startMs + 7 * DAY_MS;
    const d = new Date(startMs);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

export interface PeriodRange {
    startMs: number;
    endMs: number;
    /** First / last bar index inside the period (inclusive) */
    first: number;
    last: number;
}

/**
 * The last `count` periods that contain bars, oldest first. Bar times may be seconds or ms.
 * Walks back from the newest bar, so the cost is the size of the returned periods, not of the history.
 */
export function lastPeriods(bars: ArrayLike<{ time: number }>, period: ProfilePeriod, count: number): PeriodRange[] {
    const out: PeriodRange[] = [];
    const n = bars.length;
    let i = n - 1;
    while (i >= 0 && out.length < count) {
        const startMs = periodStartMs(toMs(bars[i].time), period);
        const last = i;
        while (i > 0 && toMs(bars[i - 1].time) >= startMs) i--;
        out.push({ startMs, endMs: nextPeriodStartMs(startMs, period), first: i, last });
        i--;
    }
    return out.reverse();
}

/** Every period, oldest first (used by tests and small inputs). */
export function allPeriods(bars: ArrayLike<{ time: number }>, period: ProfilePeriod): PeriodRange[] {
    return lastPeriods(bars, period, Number.MAX_SAFE_INTEGER);
}

/** Shortest possible length of a period in seconds (a month is 28..31 days). */
export function periodMinSeconds(period: ProfilePeriod): number {
    return period === 'day' ? 86_400 : period === 'week' ? 604_800 : 28 * 86_400;
}

/** The chart interval must be strictly shorter than the period for the profile to make sense. */
export function intervalFitsPeriod(intervalSeconds: number | null, period: ProfilePeriod): boolean {
    if (intervalSeconds === null || !(intervalSeconds > 0)) return true;
    return intervalSeconds < periodMinSeconds(period);
}

/**
 * Raw toolbar timeframe ("1m".."12h", "D", "W", "M", "1M", "1mo", "90m", bare "240" = minutes)
 * -> bar length in seconds (a month counts as 31 days). null = unknown (seconds, ticks, ranges...).
 * Same reading rules as liquidations-indicator.ts (an upper-case 'M' is a month, lower-case 'm' minutes).
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
    if (raw === 'M' || low === 'mo' || low === 'mon' || low === 'month' || low === 'months') return n * 31 * 86_400;
    if (low === 'm' || low === 'min' || low === 'minute' || low === 'minutes') return n * 60;
    if (low === 'h' || low === 'hour' || low === 'hours') return n * 3600;
    if (low === 'd' || low === 'day' || low === 'days') return n * 86_400;
    if (low === 'w' || low === 'week' || low === 'weeks') return n * 604_800;
    return null;
}

// --- profile summary ---

export interface RangeProfile {
    result: VolumeProfileResult;
    /** Row mid prices (same convention as the fixed-range profile indicator) */
    pocPrice: number;
    vahPrice: number;
    valPrice: number;
}

export type RangeProfileOutcome =
    | { kind: 'ok'; profile: RangeProfile }
    /** Total volume in the range is 0 (feed without volume): nothing may be drawn */
    | { kind: 'novolume' }
    /** Empty range or zero price range */
    | { kind: 'empty' };

/** Sum of bar volumes in [start, end] the way computeVolumeProfile counts them (negative / missing = 0). */
export function rangeVolume(bars: ReadonlyArray<VolumeProfileBar>, start: number, end: number): number {
    let total = 0;
    const a = Math.max(0, start);
    const b = Math.min(bars.length - 1, end);
    for (let i = a; i <= b; i++) total += Math.max(0, bars[i].volume || 0);
    return total;
}

/**
 * Volume profile of bars [start, end] using the shared method (volume-profile-math.ts:
 * each bar's volume is split evenly over the rows its low..high touches; POC = first (lowest) row
 * with the maximum volume; value area grows from the POC to the larger neighbour, upper row on ties).
 */
export function summarizeRange(
    bars: ReadonlyArray<VolumeProfileBar>,
    start: number,
    end: number,
    rows: number,
    valueAreaPercent: number
): RangeProfileOutcome {
    if (end < start || bars.length === 0) return { kind: 'empty' };
    if (!(rangeVolume(bars, start, end) > 0)) return { kind: 'novolume' };
    const result = computeVolumeProfile(bars, start, end, rows, valueAreaPercent / 100);
    if (!result || !(result.totalVolume > 0)) return { kind: 'empty' };
    const mid = (i: number) => (result.bins[i].low + result.bins[i].high) / 2;
    return {
        kind: 'ok',
        profile: { result, pocPrice: mid(result.pocIndex), vahPrice: mid(result.vahIndex), valPrice: mid(result.valIndex) },
    };
}

/** "#rrggbb" -> rgba string with alpha; other colour formats are returned unchanged. */
export function colorWithAlpha(color: string, alpha: number): string {
    const hex = color.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return color;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}
