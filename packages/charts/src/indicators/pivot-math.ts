// Pivot Points maths (pure: no DOM, no chart imports).
// Textbook definitions; levels for period T use only the completed period T-1.
// Period boundaries are UTC: calendar day, ISO week (Monday start), calendar month, calendar year.

import { SeriesFingerprint } from './indicator-cache';

export type PivotType = 'classic' | 'fibonacci' | 'camarilla' | 'woodie';
export type PivotPeriodSetting = 'auto' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type PivotPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type PivotKind = 'P' | 'R' | 'S';

export interface PivotLevel {
    /** "P", "R1".."R4", "S1".."S4" */
    name: string;
    kind: PivotKind;
    price: number;
}

export interface PivotBar {
    /** epoch seconds or milliseconds */
    time: number;
    open?: number;
    high: number;
    low: number;
    close: number;
}

/** Every level name that can exist (Camarilla is the only type with R4/S4). */
export const PIVOT_LEVEL_NAMES = ['R4', 'R3', 'R2', 'R1', 'P', 'S1', 'S2', 'S3', 'S4'] as const;

const MS_THRESHOLD = 1e10;
export function toMs(t: number): number {
    return t > MS_THRESHOLD ? t : t * 1000;
}

/** Levels of one type from the previous period's H/L/C. Ordered from the highest (R) to the lowest (S). */
export function computePivotLevels(type: PivotType, H: number, L: number, C: number): PivotLevel[] {
    const range = H - L;
    const out: PivotLevel[] = [];
    const add = (name: string, kind: PivotKind, price: number) => out.push({ name, kind, price });

    if (type === 'classic') {
        const P = (H + L + C) / 3;
        add('R3', 'R', H + 2 * (P - L));
        add('R2', 'R', P + range);
        add('R1', 'R', 2 * P - L);
        add('P', 'P', P);
        add('S1', 'S', 2 * P - H);
        add('S2', 'S', P - range);
        add('S3', 'S', L - 2 * (H - P));
    } else if (type === 'fibonacci') {
        const P = (H + L + C) / 3;
        add('R3', 'R', P + 1.0 * range);
        add('R2', 'R', P + 0.618 * range);
        add('R1', 'R', P + 0.382 * range);
        add('P', 'P', P);
        add('S1', 'S', P - 0.382 * range);
        add('S2', 'S', P - 0.618 * range);
        add('S3', 'S', P - 1.0 * range);
    } else if (type === 'camarilla') {
        const P = (H + L + C) / 3;
        add('R4', 'R', C + range * 1.1 / 2);
        add('R3', 'R', C + range * 1.1 / 4);
        add('R2', 'R', C + range * 1.1 / 6);
        add('R1', 'R', C + range * 1.1 / 12);
        add('P', 'P', P);
        add('S1', 'S', C - range * 1.1 / 12);
        add('S2', 'S', C - range * 1.1 / 6);
        add('S3', 'S', C - range * 1.1 / 4);
        add('S4', 'S', C - range * 1.1 / 2);
    } else {
        // woodie
        const P = (H + L + 2 * C) / 4;
        add('R2', 'R', P + range);
        add('R1', 'R', 2 * P - L);
        add('P', 'P', P);
        add('S1', 'S', 2 * P - H);
        add('S2', 'S', P - range);
    }
    return out;
}

/**
 * Chart timeframe -> seconds. Accepts the raw toolbar strings: "1m".."12h", "D", "W", "M", "1M", "1mo",
 * custom "90m", bare minutes "240". 'M' (upper case) / "mo" = month (31 days), 'm' = minute.
 * null = not understood (seconds, ticks, ranges...).
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
    if (raw === 'M' || low === 'mo' || low === 'mon' || low === 'month' || low === 'months') return n * 31 * 86400;
    if (low === 'm' || low === 'min' || low === 'minute' || low === 'minutes') return n * 60;
    if (low === 'h' || low === 'hour' || low === 'hours') return n * 3600;
    if (low === 'd' || low === 'day' || low === 'days') return n * 86400;
    if (low === 'w' || low === 'week' || low === 'weeks') return n * 604800;
    return null;
}

/**
 * Auto period: chart interval <= 15m -> daily; > 15m and < 1D -> weekly; 1D (and 2D..6D, which the
 * brief does not name) -> monthly; >= 1W -> yearly. Unknown timeframe -> daily.
 */
export function resolvePivotPeriod(setting: PivotPeriodSetting, timeframe: string | null | undefined): PivotPeriod {
    if (setting !== 'auto') return setting;
    const sec = timeframeSeconds(timeframe);
    if (sec === null || sec <= 15 * 60) return 'daily';
    if (sec < 86400) return 'weekly';
    if (sec < 604800) return 'monthly';
    return 'yearly';
}

const DAY_MS = 86400000;
// month / year boundaries: last computed [start, end) per period, so a bar costs two comparisons, not a Date
const boundaryCache: Record<'monthly' | 'yearly', { start: number; end: number }> = {
    monthly: { start: 1, end: 0 },
    yearly: { start: 1, end: 0 },
};

/** Start (epoch ms, UTC) of the period containing `timeMs`. Day / ISO week use integer arithmetic. */
export function periodStartMs(timeMs: number, period: PivotPeriod): number {
    if (period === 'daily') return Math.floor(timeMs / DAY_MS) * DAY_MS;
    if (period === 'weekly') {
        const days = Math.floor(timeMs / DAY_MS);
        // 1970-01-01 was a Thursday: Monday-based weekday = (days + 3) mod 7
        const dow = (((days + 3) % 7) + 7) % 7;
        return (days - dow) * DAY_MS;
    }
    const c = boundaryCache[period];
    if (timeMs >= c.start && timeMs < c.end) return c.start;
    const d = new Date(timeMs);
    const y = d.getUTCFullYear();
    if (period === 'yearly') {
        c.start = Date.UTC(y, 0, 1);
        c.end = Date.UTC(y + 1, 0, 1);
    } else {
        const mo = d.getUTCMonth();
        c.start = Date.UTC(y, mo, 1);
        c.end = Date.UTC(y, mo + 1, 1);
    }
    return c.start;
}

export interface PivotPeriodResult {
    /** index of the first / last loaded bar of this period */
    firstIdx: number;
    lastIdx: number;
    /** period start (epoch ms, UTC) */
    startMs: number;
    /** the previous period's source data */
    sourceHigh: number;
    sourceLow: number;
    sourceClose: number;
    levels: PivotLevel[];
}

export interface PivotGroup { firstIdx: number; lastIdx: number; startMs: number; high: number; low: number; close: number }

/**
 * Bars grouped into periods. `update` is incremental: when the already-grouped history is unchanged
 * (fingerprint) only the newest group is rebuilt, so a tick costs O(bars in the current period).
 */
export class PivotGrouper {
    groups: PivotGroup[] = [];
    private _period: PivotPeriod | null = null;
    private readonly _fp = new SeriesFingerprint();

    reset(): void {
        this.groups = [];
        this._period = null;
        this._fp.forget();
    }

    update(bars: readonly PivotBar[], period: PivotPeriod): PivotGroup[] {
        let from = 0;
        if (this.groups.length > 0 && period === this._period && this._fp.matches(bars)) {
            const last = this.groups.pop()!;
            from = last.firstIdx;
        } else {
            this.groups = [];
        }
        const groups = this.groups;
        for (let i = from; i < bars.length; i++) {
            const b = bars[i];
            const start = periodStartMs(toMs(b.time), period);
            const g = groups.length ? groups[groups.length - 1] : null;
            if (g && g.startMs === start) {
                g.lastIdx = i;
                if (b.high > g.high) g.high = b.high;
                if (b.low < g.low) g.low = b.low;
                g.close = b.close;
            } else {
                groups.push({ firstIdx: i, lastIdx: i, startMs: start, high: b.high, low: b.low, close: b.close });
            }
        }
        this._period = period;
        // everything before the newest group is final
        this._fp.capture(bars, groups.length ? groups[groups.length - 1].firstIdx : 0);
        return groups;
    }
}

/** Levels for the newest `periodsBack + 1` groups (see computePivotPeriods). */
export function pivotPeriodsFromGroups(groups: readonly PivotGroup[], type: PivotType, periodsBack: number): PivotPeriodResult[] {
    const out: PivotPeriodResult[] = [];
    const lowest = Math.max(1, groups.length - 1 - Math.max(0, Math.floor(periodsBack)));
    for (let k = groups.length - 1; k >= lowest; k--) {
        if (k - 1 === 0) continue; // first loaded period: may be truncated, never a source
        const src = groups[k - 1];
        const cur = groups[k];
        out.unshift({
            firstIdx: cur.firstIdx,
            lastIdx: cur.lastIdx,
            startMs: cur.startMs,
            sourceHigh: src.high,
            sourceLow: src.low,
            sourceClose: src.close,
            levels: computePivotLevels(type, src.high, src.low, src.close),
        });
    }
    return out;
}

/**
 * Pivot levels per period, newest last. Period T gets levels from the loaded period T-1 only when T-1
 * is complete: the first loaded period may be truncated (history starts inside it), so it is never used
 * as a source. `periodsBack` = historical periods drawn besides the current one (current = last period).
 * "Previous" is the previous period that has loaded bars (markets with closed days chain over them).
 */
export function computePivotPeriods(
    bars: readonly PivotBar[],
    period: PivotPeriod,
    type: PivotType,
    periodsBack: number,
): PivotPeriodResult[] {
    if (bars.length === 0) return [];
    return pivotPeriodsFromGroups(new PivotGrouper().update(bars, period), type, periodsBack);
}

/** Price text: adaptive decimals (or fixed `precision`), trailing zeros trimmed: 67250.50 -> "67250.5". */
export function formatPrice(v: number, precision?: number): string {
    if (!Number.isFinite(v)) return '-';
    let p = precision;
    if (p === undefined) {
        const abs = Math.abs(v);
        p = abs >= 1 || abs === 0 ? 2 : Math.min(8, Math.max(4, 3 - Math.floor(Math.log10(abs))));
    }
    const s = v.toFixed(p);
    return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}
