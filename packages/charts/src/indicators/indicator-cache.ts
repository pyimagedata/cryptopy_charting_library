// Cache guards shared by the pivot / auto-fib / candlestick indicators (pure, no DOM).
// An incremental update is only valid when the bars it already processed are unchanged. A symbol switch,
// a candles -> Heikin-Ashi switch or prepended history can keep the same first time and length, so we
// compare a small fingerprint (time + OHLC of the first bar, a middle bar and the last "settled" bar).

export interface FingerprintBar {
    time: number;
    open?: number;
    high: number;
    low: number;
    close: number;
}

const sig = (b: FingerprintBar): string => `${b.time},${b.open},${b.high},${b.low},${b.close}`;

export class SeriesFingerprint {
    private _idx: number[] = [];
    private _sig: string[] = [];
    private _len = 0;

    /** Length of the series captured last (0 = nothing captured). */
    get length(): number {
        return this._len;
    }

    forget(): void {
        this._idx = [];
        this._sig = [];
        this._len = 0;
    }

    /** Remember the series. `settled` = how many leading bars are final (only they are fingerprinted). */
    capture(bars: readonly FingerprintBar[], settled: number): void {
        const s = Math.max(0, Math.min(settled, bars.length));
        const idx = s === 0 ? [] : Array.from(new Set([0, Math.floor(s / 2), s - 1]));
        this._idx = idx;
        this._sig = idx.map(i => sig(bars[i]));
        this._len = bars.length;
    }

    /** True when `bars` extends (or equals in length) the captured series and the fingerprinted bars are unchanged. */
    matches(bars: readonly FingerprintBar[]): boolean {
        if (this._len === 0 || bars.length < this._len) return false;
        for (let k = 0; k < this._idx.length; k++) {
            const b = bars[this._idx[k]];
            if (!b || sig(b) !== this._sig[k]) return false;
        }
        return true;
    }
}

/**
 * `_data` placeholder points (time only, value NaN) kept in sync with the bars. Reuses the previous array when
 * only the tail moved (tick / new bar); rebuilds when the fingerprint says the history differs.
 */
export function syncTimePoints(
    prev: Array<{ time: number; value: number }>,
    bars: readonly FingerprintBar[],
    fp: SeriesFingerprint,
): Array<{ time: number; value: number }> {
    const n = bars.length;
    let out: Array<{ time: number; value: number }>;
    if (prev.length > 0 && prev.length === fp.length && fp.matches(bars)) {
        out = prev;
        out.length = Math.min(out.length, n);
        for (let i = Math.max(0, out.length - 1); i < n; i++) {
            if (i < out.length) out[i].time = bars[i].time;
            else out.push({ time: bars[i].time, value: NaN });
        }
    } else {
        out = bars.map(b => ({ time: b.time, value: NaN }));
    }
    fp.capture(bars, n - 1);
    return out;
}
