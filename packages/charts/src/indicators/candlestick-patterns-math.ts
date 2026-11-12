// Candlestick pattern detection (pure: no DOM, no chart imports).
// Marks classic candlestick shapes on CLOSED bars only (the still-forming last bar is never evaluated).
//
// Where the brief offered two wordings, the second one is implemented:
//  - Hammer / Hanging Man: upper shadow <= 10% of range (not 0.3 * body), body in the upper third.
//  - Morning / Evening Star: bar 2 body <= 0.5 * avgBody and bar 2's body extreme is on the correct side of
//    bar 1's body midpoint (no gap required, so 24h markets work).
//  - Tweezers: high/low tolerance = 10% of the average range of the last 14 bars (not 0.05% of price).
// Size guards (SIZE below) keep quiet markets from being flooded with labels: tiny shapes are ignored when
// they are small next to the recent average range / body.
// Reference window: avgBody / avgRange are means over the 14 bars BEFORE THE PATTERN'S FIRST BAR, so a
// big 3-bar pattern does not inflate its own yardstick. The trend filter looks at the bar before the first
// pattern bar, too. With the trend filter off Hammer and Hanging Man (same shape), and Inverted Hammer and
// Shooting Star, both match; the first listed (bullish) one is primary and the other goes in the list.

import { FingerprintBar, SeriesFingerprint } from './indicator-cache';

export interface CandleBar {
    open: number;
    high: number;
    low: number;
    close: number;
}

export type PatternBias = 'bullish' | 'bearish' | 'neutral';

export interface PatternDef {
    id: string;
    /** short on-chart code */
    code: string;
    name: string;
    bias: PatternBias;
    /** bars the pattern spans (1-3) */
    bars: 1 | 2 | 3;
    /** trend required before the pattern when the trend filter is on */
    trend: 'down' | 'up' | null;
}

export interface PatternHit {
    id: string;
    code: string;
    name: string;
    bias: PatternBias;
    bars: 1 | 2 | 3;
}

/** Reference lookback (bars) for avgBody / avgRange. */
export const AVG_LOOKBACK = 14;

/** Minimum-size guards, all in one place. Multiples of avgRange / avgBody (14 bars before the pattern). */
export const SIZE = {
    /** Doji: bar range >= x * avgRange */
    dojiRange: 0.5,
    /** Hammer / Hanging Man / Inverted Hammer / Shooting Star: bar range >= x * avgRange */
    shadowRange: 0.8,
    /** Tweezers: BOTH bars' range >= x * avgRange */
    tweezerRange: 0.5,
    /** Engulfing: the engulfing bar's body >= x * avgBody */
    engulfBody: 1.0,
    /** Engulfing: the engulfed (previous) bar's body >= x * avgBody, so a near-doji does not count */
    engulfedBody: 0.3,
} as const;

/**
 * Patterns that start switched off (single-bar shapes, harami, marubozu and tweezers are too frequent on real
 * data). Still selectable in the settings. Default ON: engulfing, piercing / dark cloud, morning / evening star,
 * three soldiers / crows.
 */
export const DEFAULT_OFF_PATTERNS: readonly string[] = [
    'doji', 'hammer', 'hangingMan', 'invertedHammer', 'shootingStar',
    'bullishHarami', 'bearishHarami', 'bullishMarubozu', 'bearishMarubozu',
    'tweezerTop', 'tweezerBottom',
];

interface Metrics {
    avgBody: number;
    avgRange: number;
    /** apply the SIZE guards (default true; false only to measure their effect in tests) */
    guards: boolean;
}

type Test = (b: readonly CandleBar[], i: number, m: Metrics) => boolean;

const body = (c: CandleBar) => Math.abs(c.close - c.open);
const rng = (c: CandleBar) => c.high - c.low;
const top = (c: CandleBar) => Math.max(c.open, c.close);
const bot = (c: CandleBar) => Math.min(c.open, c.close);
const upper = (c: CandleBar) => c.high - top(c);
const lower = (c: CandleBar) => bot(c) - c.low;
const isBull = (c: CandleBar) => c.close > c.open;
const isBear = (c: CandleBar) => c.close < c.open;
const mid = (c: CandleBar) => (c.open + c.close) / 2;

const isHammerShape: Test = (b, i, m) => {
    const c = b[i];
    if (m.guards && rng(c) < SIZE.shadowRange * m.avgRange) return false;
    return lower(c) >= 2 * body(c) && upper(c) <= 0.1 * rng(c) && bot(c) >= c.low + (2 / 3) * rng(c);
};
const isInvHammerShape: Test = (b, i, m) => {
    const c = b[i];
    if (m.guards && rng(c) < SIZE.shadowRange * m.avgRange) return false;
    return upper(c) >= 2 * body(c) && lower(c) <= 0.1 * rng(c) && top(c) <= c.low + (1 / 3) * rng(c);
};

interface Entry { def: PatternDef; test: Test }

const def = (id: string, code: string, name: string, bias: PatternBias, bars: 1 | 2 | 3, trend: 'down' | 'up' | null): PatternDef =>
    ({ id, code, name, bias, bars, trend });

/**
 * Definition order = priority inside the same bar count (3-bar > 2-bar > 1-bar overall).
 */
export const PATTERNS: readonly Entry[] = [
    // --- 3 bars ---
    { def: def('morningStar', 'MS', 'Morning Star', 'bullish', 3, 'down'), test: (b, i, m) => {
        const [a, c2, c3] = [b[i - 2], b[i - 1], b[i]];
        return isBear(a) && body(a) >= m.avgBody
            && body(c2) <= 0.5 * m.avgBody && top(c2) <= mid(a)
            && isBull(c3) && c3.close > mid(a);
    } },
    { def: def('eveningStar', 'ES', 'Evening Star', 'bearish', 3, 'up'), test: (b, i, m) => {
        const [a, c2, c3] = [b[i - 2], b[i - 1], b[i]];
        return isBull(a) && body(a) >= m.avgBody
            && body(c2) <= 0.5 * m.avgBody && bot(c2) >= mid(a)
            && isBear(c3) && c3.close < mid(a);
    } },
    { def: def('threeWhiteSoldiers', '3WS', 'Three White Soldiers', 'bullish', 3, null), test: (b, i, m) => {
        for (let k = i - 2; k <= i; k++) {
            const c = b[k];
            if (!isBull(c) || body(c) < 0.7 * m.avgBody || upper(c) > 0.3 * body(c)) return false;
            if (k > i - 2) {
                const p = b[k - 1];
                if (c.close <= p.close || c.open < p.open || c.open > p.close) return false;
            }
        }
        return true;
    } },
    { def: def('threeBlackCrows', '3BC', 'Three Black Crows', 'bearish', 3, null), test: (b, i, m) => {
        for (let k = i - 2; k <= i; k++) {
            const c = b[k];
            if (!isBear(c) || body(c) < 0.7 * m.avgBody || lower(c) > 0.3 * body(c)) return false;
            if (k > i - 2) {
                const p = b[k - 1];
                if (c.close >= p.close || c.open > p.open || c.open < p.close) return false;
            }
        }
        return true;
    } },
    // --- 2 bars ---
    { def: def('bullishEngulfing', 'En+', 'Bullish Engulfing', 'bullish', 2, 'down'), test: (b, i, m) => {
        const p = b[i - 1], c = b[i];
        if (m.guards && (body(c) < SIZE.engulfBody * m.avgBody || body(p) < SIZE.engulfedBody * m.avgBody)) return false;
        return isBear(p) && isBull(c) && c.open <= p.close && c.close >= p.open && (c.open < p.close || c.close > p.open);
    } },
    { def: def('bearishEngulfing', 'En-', 'Bearish Engulfing', 'bearish', 2, 'up'), test: (b, i, m) => {
        const p = b[i - 1], c = b[i];
        if (m.guards && (body(c) < SIZE.engulfBody * m.avgBody || body(p) < SIZE.engulfedBody * m.avgBody)) return false;
        return isBull(p) && isBear(c) && c.open >= p.close && c.close <= p.open && (c.open > p.close || c.close < p.open);
    } },
    { def: def('piercingLine', 'PL', 'Piercing Line', 'bullish', 2, 'down'), test: (b, i, m) => {
        const p = b[i - 1], c = b[i];
        return isBear(p) && body(p) >= m.avgBody && isBull(c) && c.open < p.close && c.close > mid(p) && c.close < p.open;
    } },
    { def: def('darkCloudCover', 'DCC', 'Dark Cloud Cover', 'bearish', 2, 'up'), test: (b, i, m) => {
        const p = b[i - 1], c = b[i];
        return isBull(p) && body(p) >= m.avgBody && isBear(c) && c.open > p.close && c.close < mid(p) && c.close > p.open;
    } },
    { def: def('bullishHarami', 'Ha+', 'Bullish Harami', 'bullish', 2, 'down'), test: (b, i, m) => {
        const p = b[i - 1], c = b[i];
        return isBear(p) && body(p) >= m.avgBody && isBull(c) && c.open > p.close && c.close < p.open;
    } },
    { def: def('bearishHarami', 'Ha-', 'Bearish Harami', 'bearish', 2, 'up'), test: (b, i, m) => {
        const p = b[i - 1], c = b[i];
        return isBull(p) && body(p) >= m.avgBody && isBear(c) && c.open < p.close && c.close > p.open;
    } },
    { def: def('tweezerTop', 'TT', 'Tweezer Top', 'bearish', 2, 'up'), test: (b, i, m) => {
        const p = b[i - 1], c = b[i];
        if (m.guards && (rng(p) < SIZE.tweezerRange * m.avgRange || rng(c) < SIZE.tweezerRange * m.avgRange)) return false;
        return isBull(p) && isBear(c) && Math.abs(p.high - c.high) <= 0.1 * m.avgRange;
    } },
    { def: def('tweezerBottom', 'TB', 'Tweezer Bottom', 'bullish', 2, 'down'), test: (b, i, m) => {
        const p = b[i - 1], c = b[i];
        if (m.guards && (rng(p) < SIZE.tweezerRange * m.avgRange || rng(c) < SIZE.tweezerRange * m.avgRange)) return false;
        return isBear(p) && isBull(c) && Math.abs(p.low - c.low) <= 0.1 * m.avgRange;
    } },
    // --- 1 bar ---
    { def: def('bullishMarubozu', 'Mz+', 'Bullish Marubozu', 'bullish', 1, null), test: (b, i, m) => {
        const c = b[i];
        return isBull(c) && body(c) >= 0.95 * rng(c) && body(c) >= m.avgBody;
    } },
    { def: def('bearishMarubozu', 'Mz-', 'Bearish Marubozu', 'bearish', 1, null), test: (b, i, m) => {
        const c = b[i];
        return isBear(c) && body(c) >= 0.95 * rng(c) && body(c) >= m.avgBody;
    } },
    { def: def('hammer', 'H', 'Hammer', 'bullish', 1, 'down'), test: isHammerShape },
    { def: def('hangingMan', 'HM', 'Hanging Man', 'bearish', 1, 'up'), test: isHammerShape },
    { def: def('invertedHammer', 'IH', 'Inverted Hammer', 'bullish', 1, 'down'), test: isInvHammerShape },
    { def: def('shootingStar', 'SS', 'Shooting Star', 'bearish', 1, 'up'), test: isInvHammerShape },
    { def: def('doji', 'Dj', 'Doji', 'neutral', 1, null), test: (b, i, m) =>
        body(b[i]) <= 0.1 * rng(b[i]) && !(m.guards && rng(b[i]) < SIZE.dojiRange * m.avgRange) },
];

export const PATTERN_DEFS: readonly PatternDef[] = PATTERNS.map(e => e.def);

export interface DetectConfig {
    /** pattern id -> enabled (missing = enabled) */
    enabled?: Readonly<Record<string, boolean>>;
    useTrendFilter: boolean;
    trendPeriod: number;
    /** false disables the SIZE guards (tests / comparisons only) */
    sizeGuards?: boolean;
}

export const defaultDetectConfig: DetectConfig = { useTrendFilter: true, trendPeriod: 20 };

function meanBody(b: readonly CandleBar[], from: number, to: number): number {
    let s = 0;
    for (let k = from; k <= to; k++) s += body(b[k]);
    return s / (to - from + 1);
}
function meanRange(b: readonly CandleBar[], from: number, to: number): number {
    let s = 0;
    for (let k = from; k <= to; k++) s += rng(b[k]);
    return s / (to - from + 1);
}

/** 'down' / 'up' / null (not enough history, or exactly on the SMA) for the bar `j`. */
export function trendAt(b: readonly CandleBar[], j: number, period: number): 'down' | 'up' | null {
    const n = Math.max(1, Math.floor(period));
    if (j < n - 1) return null;
    let s = 0;
    for (let k = j - n + 1; k <= j; k++) s += b[k].close;
    const sma = s / n;
    if (b[j].close < sma) return 'down';
    if (b[j].close > sma) return 'up';
    return null;
}

/**
 * Patterns ending on bar `i`, highest priority first (3-bar > 2-bar > 1-bar, then definition order).
 * Needs i >= AVG_LOOKBACK + (bars - 1). Bars with range 0 anywhere inside the pattern are skipped.
 */
export function detectAt(b: readonly CandleBar[], i: number, cfg: DetectConfig = defaultDetectConfig): PatternHit[] {
    const hits: PatternHit[] = [];
    if (i < 0 || i >= b.length) return hits;
    const metricsCache = new Map<number, Metrics>();
    for (const { def: d, test } of PATTERNS) {
        if (cfg.enabled && cfg.enabled[d.id] === false) continue;
        const first = i - (d.bars - 1);
        if (first < AVG_LOOKBACK) continue;
        let flat = false;
        for (let k = first; k <= i; k++) if (!(rng(b[k]) > 0)) { flat = true; break; }
        if (flat) continue;
        if (cfg.useTrendFilter && d.trend !== null && trendAt(b, first - 1, cfg.trendPeriod) !== d.trend) continue;
        let m = metricsCache.get(first);
        if (!m) {
            m = { avgBody: meanBody(b, first - AVG_LOOKBACK, first - 1), avgRange: meanRange(b, first - AVG_LOOKBACK, first - 1), guards: cfg.sizeGuards !== false };
            metricsCache.set(first, m);
        }
        if (test(b, i, m)) hits.push({ id: d.id, code: d.code, name: d.name, bias: d.bias, bars: d.bars });
    }
    return hits; // PATTERNS is already ordered 3-bar, 2-bar, 1-bar
}

/**
 * Incremental detector. `update(bars)` evaluates CLOSED bars only (index < bars.length - 1; the last bar is
 * still forming). A full pass runs when the history differs from what was processed (fingerprint of the
 * first / a middle / the last settled bar changed, bars were removed, config changed) or after `reset()`;
 * otherwise only the last few closed bars are re-evaluated.
 */
export class PatternDetector {
    /** per bar: null = not evaluated (forming bar / too early), [] = no pattern */
    hits: Array<PatternHit[] | null> = [];
    private _len = 0;
    private _cfgKey = '';
    private readonly _fp = new SeriesFingerprint();
    /** bars re-evaluated behind the newest closed bar on every update */
    static readonly TAIL = 4;

    /** Forget everything (symbol / timeframe / chart type changed). */
    reset(): void {
        this.hits = [];
        this._len = 0;
        this._cfgKey = '';
        this._fp.forget();
    }

    update(bars: readonly (CandleBar & FingerprintBar)[], cfg: DetectConfig): void {
        const cfgKey = JSON.stringify([cfg.useTrendFilter, cfg.trendPeriod, cfg.enabled ?? null, cfg.sizeGuards]);
        const n = bars.length;
        const full = cfgKey !== this._cfgKey || n < this._len || this.hits.length === 0 || !this._fp.matches(bars);
        let start: number;
        if (full) {
            this.hits = new Array(n).fill(null);
            start = AVG_LOOKBACK;
        } else {
            this.hits.length = n;
            for (let k = this._len; k < n; k++) this.hits[k] = null;
            // the old forming bar (index _len-1) is closed now if n grew; always redo a short tail
            start = Math.max(AVG_LOOKBACK, Math.min(this._len, n) - 1 - PatternDetector.TAIL);
        }
        for (let i = start; i < n - 1; i++) this.hits[i] = detectAt(bars, i, cfg);
        if (n >= 1) this.hits[n - 1] = null;
        // fingerprint only bars that no later update may change: everything before the re-evaluated tail
        this._fp.capture(bars, Math.max(0, n - 2 - PatternDetector.TAIL));
        this._len = n;
        this._cfgKey = cfgKey;
    }
}
