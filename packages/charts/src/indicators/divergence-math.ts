/**
 * Pure divergence maths (no DOM / chart imports).
 *
 * - Oscillators replicate the library's own RSI (Wilder RMA, rsi-indicator.ts) and MACD histogram
 *   (EMA seeded with the first price, macd-indicator.ts) value for value, but are incremental:
 *   `push(price)` returns the next value.
 * - Pivot: bar i is a pivot low when osc[i] is the minimum of the window [i-L, i+R]
 *   (<= the L bars before it, strictly < the R bars after it); pivot high mirrored.
 *   A pivot is therefore known R bars after it happens and never changes afterwards.
 * - Divergence: compared between a newly confirmed pivot (bar b) and the previous confirmed pivot
 *   of the same side (bar a) whose distance b-a is within [minBars, maxBars].
 */

export type OscillatorKind = 'rsi' | 'macd';
export type DivergenceKind = 'bull' | 'hbull' | 'bear' | 'hbear';

export interface DivergenceConfig {
    oscillator: OscillatorKind;
    rsiLength: number;
    macdFast: number;
    macdSlow: number;
    macdSignal: number;
    /** Bars to the left of a pivot that must not be lower (higher for pivot highs) */
    left: number;
    /** Bars to the right of a pivot that must be strictly higher (lower for pivot highs) */
    right: number;
    minBars: number;
    maxBars: number;
}

export const defaultDivergenceConfig: DivergenceConfig = {
    oscillator: 'rsi',
    rsiLength: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    left: 5,
    right: 5,
    minBars: 5,
    maxBars: 60,
};

export interface DivergenceBar {
    time: number;
    high: number;
    low: number;
    close: number;
}

export interface Divergence {
    kind: DivergenceKind;
    /** Previous pivot bar index */
    a: number;
    /** Newly confirmed pivot bar index */
    b: number;
    /** Price at a / b (low for bullish, high for bearish) */
    priceA: number;
    priceB: number;
    oscA: number;
    oscB: number;
    /** Bar index at which the divergence became known (b + right) */
    confirmedAt: number;
}

// --- oscillators (incremental) ---

/** Wilder RSI on closes. NaN until `period` price changes have been seen (first value at index = period). */
export class RsiState {
    private _prev = 0;
    private _started = false;
    private _count = 0;      // price changes seen
    private _avgGain = 0;
    private _avgLoss = 0;

    constructor(private readonly _period: number) {}

    push(price: number): number {
        const period = this._period;
        if (!this._started) {
            this._started = true;
            this._prev = price;
            return NaN;
        }
        const change = price - this._prev;
        this._prev = price;
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;
        this._count++;
        if (this._count < period) {
            this._avgGain += gain;
            this._avgLoss += loss;
            return NaN;
        }
        if (this._count === period) {
            this._avgGain = (this._avgGain + gain) / period;
            this._avgLoss = (this._avgLoss + loss) / period;
        } else {
            this._avgGain = ((this._avgGain * (period - 1)) + gain) / period;
            this._avgLoss = ((this._avgLoss * (period - 1)) + loss) / period;
        }
        const total = this._avgGain + this._avgLoss;
        return total === 0 ? 50 : (100 * this._avgGain) / total;
    }
}

/** MACD histogram (macd - signal), all EMAs seeded with the first price like the library's MACD. */
export class MacdHistState {
    private readonly _fastK: number;
    private readonly _slowK: number;
    private readonly _signalK: number;
    private _fast = 0;
    private _slow = 0;
    private _signal = 0;
    private _n = 0;

    constructor(fast: number, private readonly _slowPeriod: number, signal: number) {
        this._fastK = 2 / (fast + 1);
        this._slowK = 2 / (_slowPeriod + 1);
        this._signalK = 2 / (signal + 1);
    }

    /** NaN for the first slow-1 bars (EMAs not yet meaningful); identical to the library's histogram afterwards. */
    push(price: number): number {
        if (this._n === 0) {
            this._fast = price;
            this._slow = price;
        }
        this._fast = price * this._fastK + this._fast * (1 - this._fastK);
        this._slow = price * this._slowK + this._slow * (1 - this._slowK);
        const macd = this._fast - this._slow;
        if (this._n === 0) this._signal = macd;
        this._signal = macd * this._signalK + this._signal * (1 - this._signalK);
        const hist = macd - this._signal;
        this._n++;
        return this._n >= this._slowPeriod ? hist : NaN;
    }
}

export function computeRsi(closes: ArrayLike<number>, period: number): number[] {
    const st = new RsiState(period);
    const out: number[] = [];
    for (let i = 0; i < closes.length; i++) out.push(st.push(closes[i]));
    return out;
}

export function computeMacdHist(closes: ArrayLike<number>, fast: number, slow: number, signal: number): number[] {
    const st = new MacdHistState(fast, slow, signal);
    const out: number[] = [];
    for (let i = 0; i < closes.length; i++) out.push(st.push(closes[i]));
    return out;
}

// --- incremental engine ---

export class DivergenceEngine {
    private _cfg: DivergenceConfig;
    private _rsi: RsiState | null = null;
    private _macd: MacdHistState | null = null;
    private _osc: number[] = [];
    private _highs: number[] = [];
    private _lows: number[] = [];
    private _closes: number[] = [];
    private _pivLows: number[] = [];
    private _pivHighs: number[] = [];
    private _divs: Divergence[] = [];
    private _times: number[] = [];

    constructor(cfg: DivergenceConfig) {
        this._cfg = { ...cfg };
        this.reset();
    }

    get config(): Readonly<DivergenceConfig> { return this._cfg; }
    /** Oscillator values for the processed (closed) bars */
    get osc(): readonly number[] { return this._osc; }
    get divergences(): readonly Divergence[] { return this._divs; }
    /** Number of bars processed so far */
    get processed(): number { return this._osc.length; }
    get pivotLows(): readonly number[] { return this._pivLows; }
    get pivotHighs(): readonly number[] { return this._pivHighs; }

    setConfig(cfg: DivergenceConfig): void {
        this._cfg = { ...cfg };
        this.reset();
    }

    reset(): void {
        const c = this._cfg;
        this._rsi = c.oscillator === 'rsi' ? new RsiState(Math.max(1, Math.floor(c.rsiLength))) : null;
        this._macd = c.oscillator === 'macd'
            ? new MacdHistState(Math.max(1, Math.floor(c.macdFast)), Math.max(1, Math.floor(c.macdSlow)), Math.max(1, Math.floor(c.macdSignal)))
            : null;
        this._osc = [];
        this._highs = [];
        this._lows = [];
        this._closes = [];
        this._pivLows = [];
        this._pivHighs = [];
        this._divs = [];
        this._times = [];
    }

    /**
     * Bring the engine up to date with `bars[0 .. closedCount-1]` (closed bars only - the caller
     * leaves the forming bar out). Only bars not yet processed are evaluated; if earlier bars
     * changed (history prepended, replay stepped back, symbol switch) everything restarts.
     * Returns true when a restart happened.
     */
    sync(bars: ReadonlyArray<DivergenceBar>, closedCount: number): boolean {
        const n = Math.max(0, Math.min(bars.length, Math.floor(closedCount)));
        const done = this._osc.length;
        let restarted = false;
        if (done > 0) {
            // Fingerprint: time + price of the first bar, a middle bar and the bar before the incremental start.
            // Same timestamps with different prices (symbol switch, candles -> Heikin-Ashi) must restart too.
            const mid = (done - 1) >> 1;
            let stale = n < done;
            for (const k of [0, mid, done - 1]) {
                if (stale) break;
                const b = bars[k];
                stale = b.time !== this._times[k] || b.close !== this._closes[k] || b.high !== this._highs[k] || b.low !== this._lows[k];
            }
            if (stale) {
                this.reset();
                restarted = true;
            }
        }
        for (let i = this._osc.length; i < n; i++) this._push(bars[i]);
        return restarted;
    }

    private _push(bar: DivergenceBar): void {
        this.pushWithOsc(bar, this._rsi ? this._rsi.push(bar.close) : this._macd!.push(bar.close));
    }

    /**
     * Append one closed bar with an externally supplied oscillator value (used by `sync` with the built-in
     * oscillator; exposed so the pivot / divergence logic can be tested on hand-made oscillator series).
     */
    pushWithOsc(bar: DivergenceBar, v: number): void {
        const idx = this._osc.length;
        this._times.push(bar.time);
        this._osc.push(v);
        this._highs.push(bar.high);
        this._lows.push(bar.low);
        this._closes.push(bar.close);
        const cand = idx - this._cfg.right;
        if (cand >= this._cfg.left) this._evaluate(cand);
    }

    /** Pivot test for bar i; all of [i-L, i+R] are processed by now. */
    private _evaluate(i: number): void {
        const { left, right } = this._cfg;
        const osc = this._osc;
        const v = osc[i];
        if (!Number.isFinite(v)) return;
        let isLow = true;
        let isHigh = true;
        for (let j = i - left; j <= i + right; j++) {
            if (j === i) continue;
            const w = osc[j];
            if (!Number.isFinite(w)) return;
            if (j < i) {
                if (w < v) isLow = false;
                if (w > v) isHigh = false;
            } else {
                if (w <= v) isLow = false;
                if (w >= v) isHigh = false;
            }
            if (!isLow && !isHigh) return;
        }
        if (isLow) this._onPivot(i, false);
        else if (isHigh) this._onPivot(i, true);
    }

    private _onPivot(b: number, high: boolean): void {
        const { minBars, maxBars, right } = this._cfg;
        const list = high ? this._pivHighs : this._pivLows;
        const prices = high ? this._highs : this._lows;
        // Most recent earlier pivot of the same side whose distance fits [minBars, maxBars].
        for (let k = list.length - 1; k >= 0; k--) {
            const a = list[k];
            const d = b - a;
            if (d > maxBars) break;
            if (d < minBars) continue;
            const priceA = prices[a];
            const priceB = prices[b];
            const oscA = this._osc[a];
            const oscB = this._osc[b];
            let kind: DivergenceKind | null = null;
            if (!high) {
                if (priceB < priceA && oscB > oscA) kind = 'bull';
                else if (priceB > priceA && oscB < oscA) kind = 'hbull';
            } else {
                if (priceB > priceA && oscB < oscA) kind = 'bear';
                else if (priceB < priceA && oscB > oscA) kind = 'hbear';
            }
            if (kind) this._divs.push({ kind, a, b, priceA, priceB, oscA, oscB, confirmedAt: b + right });
            break;
        }
        list.push(b);
    }
}

/** Batch helper: all divergences for closed bars [0, closedCount). */
export function findDivergences(bars: ReadonlyArray<DivergenceBar>, cfg: DivergenceConfig, closedCount: number = bars.length): Divergence[] {
    const e = new DivergenceEngine(cfg);
    e.sync(bars, closedCount);
    return e.divergences.slice();
}
