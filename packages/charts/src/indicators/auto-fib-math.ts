// Auto Fibonacci maths (pure: no DOM, no chart imports).
// Highest high / lowest low of the last N bars; levels are measured from the later extreme back
// towards the earlier one. Recomputed from the window on every call, so results move when a new
// extreme forms (intentional).

export interface FibBar {
    high: number;
    low: number;
}

export interface FibLevelDef {
    /** option-key suffix */
    id: string;
    ratio: number;
    extension: boolean;
}

export const FIB_LEVELS: readonly FibLevelDef[] = [
    { id: '0', ratio: 0, extension: false },
    { id: '236', ratio: 0.236, extension: false },
    { id: '382', ratio: 0.382, extension: false },
    { id: '500', ratio: 0.5, extension: false },
    { id: '618', ratio: 0.618, extension: false },
    { id: '786', ratio: 0.786, extension: false },
    { id: '1000', ratio: 1, extension: false },
    { id: '1272', ratio: 1.272, extension: true },
    { id: '1618', ratio: 1.618, extension: true },
];

export interface FibResult {
    /** bar indexes (into the bars array) of the window extremes */
    highIdx: number;
    lowIdx: number;
    high: number;
    low: number;
    /** true: the high came after the low (0% at the high, 100% at the low) */
    up: boolean;
    /** earlier / later anchor */
    startIdx: number;
    endIdx: number;
    startPrice: number;
    endPrice: number;
}

/** Window extremes and direction; null when there are no bars or the window is flat. */
export function computeFibRange(bars: readonly FibBar[], lookback: number): FibResult | null {
    const n = bars.length;
    if (n < 2) return null;
    const from = Math.max(0, n - Math.max(2, Math.floor(lookback)));
    let highIdx = from;
    let lowIdx = from;
    for (let i = from; i < n; i++) {
        // ties: the most recent bar wins
        if (bars[i].high >= bars[highIdx].high) highIdx = i;
        if (bars[i].low <= bars[lowIdx].low) lowIdx = i;
    }
    const high = bars[highIdx].high;
    const low = bars[lowIdx].low;
    if (!(high > low) || highIdx === lowIdx) return null;
    const up = highIdx > lowIdx;
    return {
        highIdx, lowIdx, high, low, up,
        startIdx: Math.min(highIdx, lowIdx),
        endIdx: Math.max(highIdx, lowIdx),
        startPrice: up ? low : high,
        endPrice: up ? high : low,
    };
}

/**
 * Price of a ratio. Up move: 0 = high, 1 = low (retracement measured down from the high), extensions
 * continue below the low. Down move mirrored: 0 = low, 1 = high, extensions continue above the high.
 */
export function fibPrice(r: Pick<FibResult, 'high' | 'low' | 'up'>, ratio: number): number {
    const range = r.high - r.low;
    return r.up ? r.high - ratio * range : r.low + ratio * range;
}

/** Ratio text for labels: 0.236 -> "0.236", 0 -> "0", 1 -> "1" */
export function formatRatio(ratio: number): string {
    return String(Number(ratio.toFixed(3)));
}
