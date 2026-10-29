/**
 * Time axis tick marks (TradingView style). DOM-free.
 *
 * Every bar gets a weight from the calendar boundary it crosses relative to the previous bar
 * (year > month > day > 12h > ... > 1m > 30s > 1s), resolved in the axis display zone. Marks are
 * then chosen greedily by descending weight (left to right on ties) while keeping a minimum pixel
 * spacing. Selection only depends on bar times and bar spacing - never on the first visible
 * index - so marks stay put while scrolling. It runs over a quantized window around the visible
 * range and is cached.
 */

export interface TimeMark {
    index: number;
    time: number;
    weight: number;
    label: string;
    bold: boolean;
}

export const TimeMarkWeight = {
    Year: 70,
    Month: 60,
    Day: 50,
    Hour12: 40,
    Hour6: 36,
    Hour4: 34,
    Hour3: 32,
    Hour2: 30,
    Hour1: 28,
    Minute30: 24,
    Minute15: 22,
    Minute5: 20,
    Minute1: 18,
    Second30: 14,
    Second1: 10,
} as const;

/** Calendar fields of an instant, resolved in some zone. Month is 0-based. */
export interface TimeParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
}

/** Sub-day boundaries, largest first: [length in ms, weight]. */
const SUB_DAY_LEVELS: ReadonlyArray<readonly [number, number]> = [
    [12 * 3600e3, TimeMarkWeight.Hour12],
    [6 * 3600e3, TimeMarkWeight.Hour6],
    [4 * 3600e3, TimeMarkWeight.Hour4],
    [3 * 3600e3, TimeMarkWeight.Hour3],
    [2 * 3600e3, TimeMarkWeight.Hour2],
    [3600e3, TimeMarkWeight.Hour1],
    [30 * 60e3, TimeMarkWeight.Minute30],
    [15 * 60e3, TimeMarkWeight.Minute15],
    [5 * 60e3, TimeMarkWeight.Minute5],
    [60e3, TimeMarkWeight.Minute1],
    [30e3, TimeMarkWeight.Second30],
    [1e3, TimeMarkWeight.Second1],
];

export type TextMeasure = (text: string, bold: boolean) => number;

const defaultMeasure: TextMeasure = (text, bold) => text.length * (bold ? 7 : 6.5);

const LABEL_PADDING = 10;
const MIN_MARK_SPACING = 50;

/** Resolves calendar fields of epoch-ms instants in an IANA zone ('' = browser local). */
export class ZonedClock {
    private _tz = '';
    private _fmt: Intl.DateTimeFormat | null = null;

    get timezone(): string {
        return this._tz;
    }

    setTimezone(tz: string): void {
        if (tz === this._tz) return;
        this._tz = tz;
        this._fmt = null;
    }

    parts(timestamp: number): TimeParts {
        const date = new Date(timestamp);
        if (!this._tz) {
            return {
                year: date.getFullYear(), month: date.getMonth(), day: date.getDate(),
                hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds(),
            };
        }
        if (!this._fmt) {
            try {
                this._fmt = new Intl.DateTimeFormat('en-GB', {
                    timeZone: this._tz, hour12: false,
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                });
            } catch (e) {
                // Unknown zone: fall back to local rather than throwing every frame
                this._tz = '';
                return this.parts(timestamp);
            }
        }
        const out: TimeParts = { year: 0, month: 0, day: 1, hour: 0, minute: 0, second: 0 };
        for (const p of this._fmt.formatToParts(date)) {
            switch (p.type) {
                case 'year': out.year = parseInt(p.value, 10); break;
                case 'month': out.month = parseInt(p.value, 10) - 1; break;
                case 'day': out.day = parseInt(p.value, 10); break;
                case 'hour': out.hour = parseInt(p.value, 10) % 24; break;
                case 'minute': out.minute = parseInt(p.value, 10); break;
                case 'second': out.second = parseInt(p.value, 10); break;
            }
        }
        return out;
    }
}

const monthNameCache = new Map<string, string[]>();

/** Localized short month names ('Oct' / 'Eki'), index 0 = January. */
export function monthShortNames(locale: string): string[] {
    let names = monthNameCache.get(locale);
    if (names) return names;
    names = [];
    try {
        const f = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
        for (let m = 0; m < 12; m++) names.push(f.format(new Date(Date.UTC(2021, m, 15))).replace(/\.$/, ''));
    } catch (e) {
        names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    }
    monthNameCache.set(locale, names);
    return names;
}

function wallMs(p: TimeParts): number {
    return Date.UTC(p.year, p.month, p.day, p.hour, p.minute, p.second);
}

/** Weight of bar `cur` given the previous bar (null = first bar of the data). */
export function markWeight(cur: TimeParts, prev: TimeParts | null): number {
    if (prev === null) {
        // First bar: the boundary it naturally sits on
        const midnight = cur.hour === 0 && cur.minute === 0 && cur.second === 0;
        if (midnight) {
            if (cur.day === 1) return cur.month === 0 ? TimeMarkWeight.Year : TimeMarkWeight.Month;
            return TimeMarkWeight.Day;
        }
        const w = wallMs(cur) % 86400e3;
        for (const [len, weight] of SUB_DAY_LEVELS) if (w % len === 0) return weight;
        return TimeMarkWeight.Second1;
    }
    if (cur.year !== prev.year) return TimeMarkWeight.Year;
    if (cur.month !== prev.month) return TimeMarkWeight.Month;
    if (cur.day !== prev.day) return TimeMarkWeight.Day;
    const a = wallMs(cur);
    const b = wallMs(prev);
    for (const [len, weight] of SUB_DAY_LEVELS) {
        if (Math.floor(a / len) !== Math.floor(b / len)) return weight;
    }
    return TimeMarkWeight.Second1;
}

export function markLabel(weight: number, p: TimeParts, locale: string): string {
    if (weight >= TimeMarkWeight.Year) return String(p.year);
    if (weight >= TimeMarkWeight.Month) return monthShortNames(locale)[p.month];
    if (weight >= TimeMarkWeight.Day) return String(p.day);
    const hh = p.hour.toString().padStart(2, '0');
    const mm = p.minute.toString().padStart(2, '0');
    if (weight <= TimeMarkWeight.Second30) return `${hh}:${mm}:${p.second.toString().padStart(2, '0')}`;
    return `${hh}:${mm}`;
}

/**
 * Mark engine bound to one time series + one zone. Owned by the TimeScale so the time axis, the
 * main pane grid and the sub-pane grids all read the same marks.
 */
export class TimeMarks {
    readonly clock = new ZonedClock();
    private _timestamps: number[] = [];
    private _measure: TextMeasure = defaultMeasure;
    private _locale = 'en';
    private _epoch = 0;
    private _cache: { key: string; marks: TimeMark[] } | null = null;

    setTimestamps(timestamps: number[]): void {
        this._timestamps = timestamps;
        this._epoch++;
    }

    /** Call after the timestamps array was mutated in place. */
    invalidate(): void {
        this._epoch++;
    }

    setTimezone(tz: string): void {
        if (this.clock.timezone === tz) return;
        this.clock.setTimezone(tz);
        this._epoch++;
    }

    get timezone(): string {
        return this.clock.timezone;
    }

    setMeasure(measure: TextMeasure | null, fontKey: string = ''): void {
        this._measure = measure ?? defaultMeasure;
        this._measureKey = fontKey;
        this._epoch++;
    }
    private _measureKey = '';

    setLocale(locale: string): void {
        if (locale === this._locale) return;
        this._locale = locale;
        this._epoch++;
    }

    /**
     * Marks for the visible bar range [from, to] (inclusive), stable under scrolling.
     */
    select(from: number, to: number, barSpacing: number): TimeMark[] {
        const ts = this._timestamps;
        const n = ts.length;
        if (n === 0 || to < from || barSpacing <= 0) return [];

        const span = Math.max(1, to - from + 1);
        let chunk = 64;
        while (chunk < span) chunk *= 2;
        const qStart = Math.max(0, Math.floor((from - span) / chunk) * chunk);
        const qEnd = Math.min(n - 1, Math.ceil((to + span) / chunk) * chunk);

        const key = [qStart, qEnd, barSpacing, this.clock.timezone, this._locale, this._measureKey, n,
            ts[0], ts[n - 1], this._epoch].join('|');
        let marks: TimeMark[];
        if (this._cache && this._cache.key === key) {
            marks = this._cache.marks;
        } else {
            marks = this._compute(qStart, qEnd, barSpacing);
            this._cache = { key, marks };
        }
        const out: TimeMark[] = [];
        for (const m of marks) {
            if (m.index >= from && m.index <= to) out.push(m);
        }
        return out;
    }

    private _compute(qStart: number, qEnd: number, barSpacing: number): TimeMark[] {
        const ts = this._timestamps;
        const clock = this.clock;
        const count = qEnd - qStart + 1;
        const parts: TimeParts[] = new Array(count);
        const weights: number[] = new Array(count);

        let prev: TimeParts | null = qStart > 0 ? clock.parts(ts[qStart - 1]) : null;
        for (let k = 0; k < count; k++) {
            const cur = clock.parts(ts[qStart + k]);
            parts[k] = cur;
            weights[k] = markWeight(cur, prev);
            prev = cur;
        }

        const order: number[] = [];
        for (let k = 0; k < count; k++) order.push(k);
        order.sort((a, b) => weights[b] - weights[a] || a - b);

        const labels = new Map<number, { label: string; width: number }>();
        const info = (k: number) => {
            let v = labels.get(k);
            if (!v) {
                const label = markLabel(weights[k], parts[k], this._locale);
                v = { label, width: this._measure(label, weights[k] >= TimeMarkWeight.Day) };
                labels.set(k, v);
            }
            return v;
        };
        const gap = (a: number, b: number) =>
            Math.max(MIN_MARK_SPACING, (info(a).width + info(b).width) / 2 + LABEL_PADDING);

        const chosen: number[] = []; // sorted local indices
        for (const k of order) {
            // binary search insertion point
            let lo = 0, hi = chosen.length;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (chosen[mid] < k) lo = mid + 1; else hi = mid;
            }
            if (lo > 0 && (k - chosen[lo - 1]) * barSpacing < gap(k, chosen[lo - 1])) continue;
            if (lo < chosen.length && (chosen[lo] - k) * barSpacing < gap(k, chosen[lo])) continue;
            chosen.splice(lo, 0, k);
        }

        return chosen.map(k => ({
            index: qStart + k,
            time: ts[qStart + k],
            weight: weights[k],
            label: info(k).label,
            bold: weights[k] >= TimeMarkWeight.Day,
        }));
    }
}
