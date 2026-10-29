/**
 * Time alignment math for "Time" / "Date range" sync between charts of a layout (DOM-free).
 * A series is described by `n` bars and `at(i)` = open time (ms) of bar i (ascending). Float bar indices are
 * bar-centre based like TimeScale (index i = centre of bar i); times between bars are interpolated linearly
 * and extrapolated past both ends with the first/last bar duration.
 */

export interface TimeSeriesLike {
    n: number;
    at: (i: number) => number;
}

function lastDuration(s: TimeSeriesLike): number {
    return s.n > 1 ? s.at(s.n - 1) - s.at(s.n - 2) : 0;
}

function firstDuration(s: TimeSeriesLike): number {
    return s.n > 1 ? s.at(1) - s.at(0) : 0;
}

/** Time (ms) at a float bar index; null when the series has no usable duration. */
export function timeAtFloatIndex(s: TimeSeriesLike, f: number): number | null {
    const n = s.n;
    if (n === 0) return null;
    if (f >= n - 1) {
        const d = lastDuration(s);
        return d > 0 ? s.at(n - 1) + (f - (n - 1)) * d : n === 1 && f === 0 ? s.at(0) : null;
    }
    if (f <= 0) {
        const d = firstDuration(s);
        return d > 0 ? s.at(0) + f * d : null;
    }
    const lo = Math.floor(f);
    const a = s.at(lo);
    const b = s.at(lo + 1);
    return a + (b - a) * (f - lo);
}

/** Float bar index at a time (ms); inverse of `timeAtFloatIndex`. null when not computable. */
export function floatIndexAtTime(s: TimeSeriesLike, t: number): number | null {
    const n = s.n;
    if (n === 0) return null;
    const first = s.at(0);
    const last = s.at(n - 1);
    if (t >= last) {
        const d = lastDuration(s);
        return d > 0 ? n - 1 + (t - last) / d : t === last ? n - 1 : null;
    }
    if (t <= first) {
        const d = firstDuration(s);
        return d > 0 ? (t - first) / d : null;
    }
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (s.at(mid) <= t) lo = mid;
        else hi = mid;
    }
    const a = s.at(lo);
    const b = s.at(hi);
    return b > a ? lo + (t - a) / (b - a) : lo;
}

/**
 * Scroll offset (TimeScale.scrollOffset semantics) that puts float index `f` at the right edge:
 * `base + rightOffset + 0.5 - f` where `base = pointsCount - 1` (same formula as setVisibleBarRange).
 */
export function scrollOffsetForRightEdge(pointsCount: number, rightOffset: number, f: number): number {
    return pointsCount - 1 + rightOffset + 0.5 - f;
}
