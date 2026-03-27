import { PatternPoint, PatternSourceBar, ZigZagPoint } from './types';

export interface TrendlineBreakoutSegment {
    from: PatternPoint;
    to: PatternPoint;
}

export interface TrendlineBreakoutMatch {
    kind: 'bull-breakout' | 'bear-breakdown';
    direction: 'bullish' | 'bearish';
    period: number;
    anchors: [ZigZagPoint, ZigZagPoint];
    detectionIndex: number;
    detectionTime: number;
    breakoutLevel: number;
    labelText: string;
    labelAnchor: PatternPoint;
    segments: TrendlineBreakoutSegment[];
}

export interface TrendlineBreakoutDetectionOptions {
    period: number;
    useLength8?: boolean;
    useLength10?: boolean;
    useLength15?: boolean;
    useLength30?: boolean;
    volumeSpikeMultiplier?: number;
    showHistory?: boolean;
    showBullBreakout?: boolean;
    showBearBreakdown?: boolean;
}

interface PivotSeries {
    highs: ZigZagPoint[];
    lows: ZigZagPoint[];
    lastBullPivotIndex: number;
    lastBearPivotIndex: number;
}

export function detectTrendlineBreakouts(
    sourceData: PatternSourceBar[],
    options: TrendlineBreakoutDetectionOptions
): TrendlineBreakoutMatch[] {
    const periods = buildPeriods(options);
    const volumeStrength = computeVolumeStrength(sourceData, 21);
    const threshold = options.volumeSpikeMultiplier ?? 2;
    const matches: TrendlineBreakoutMatch[] = [];

    for (const period of periods) {
        const state: PivotSeries = {
            highs: [],
            lows: [],
            lastBullPivotIndex: -1,
            lastBearPivotIndex: -1,
        };

        for (let currentIndex = 0; currentIndex < sourceData.length; currentIndex++) {
            const pivotHigh = getConfirmedPivotHigh(sourceData, currentIndex, period, period);
            if (pivotHigh) {
                state.highs.push(pivotHigh);
            }

            const pivotLow = getConfirmedPivotLow(sourceData, currentIndex, period, period);
            if (pivotLow) {
                state.lows.push(pivotLow);
            }

            if (volumeStrength[currentIndex] <= threshold) {
                continue;
            }

            if (options.showBullBreakout !== false) {
                const bullBreakout = buildBullBreakout(sourceData, state, currentIndex, period);
                if (bullBreakout) {
                    state.lastBullPivotIndex = bullBreakout.anchors[1].index;
                    matches.push(bullBreakout);
                }
            }

            if (options.showBearBreakdown !== false) {
                const bearBreakdown = buildBearBreakdown(sourceData, state, currentIndex, period);
                if (bearBreakdown) {
                    state.lastBearPivotIndex = bearBreakdown.anchors[1].index;
                    matches.push(bearBreakdown);
                }
            }
        }
    }

    if (options.showHistory) {
        return matches;
    }

    const latestBull = options.showBullBreakout !== false
        ? findLatestMatch(matches, 'bullish')
        : null;
    const latestBear = options.showBearBreakdown !== false
        ? findLatestMatch(matches, 'bearish')
        : null;

    return [latestBull, latestBear]
        .filter((match): match is TrendlineBreakoutMatch => match !== null)
        .sort((a, b) => a.detectionIndex - b.detectionIndex);
}

function buildBullBreakout(
    sourceData: PatternSourceBar[],
    state: PivotSeries,
    currentIndex: number,
    period: number
): TrendlineBreakoutMatch | null {
    if (state.highs.length <= 2) {
        return null;
    }

    const latest = state.highs[state.highs.length - 1];
    const previous = state.highs[state.highs.length - 2];
    if (!latest || !previous || latest.index <= previous.index) {
        return null;
    }

    if (state.lastBullPivotIndex === latest.index) {
        return null;
    }

    const breakoutLevel = linePriceAt(previous, latest, currentIndex);
    const slope = (latest.price - previous.price) / (latest.index - previous.index);
    const currentClose = sourceData[currentIndex].close;
    const prevClose = currentIndex > 0 ? sourceData[currentIndex - 1].close : currentClose;
    const prev2Close = currentIndex > 1 ? sourceData[currentIndex - 2].close : prevClose;

    if (slope >= 0) {
        return null;
    }

    if (!(currentClose > breakoutLevel && (prevClose < breakoutLevel || prev2Close < breakoutLevel))) {
        return null;
    }

    return {
        kind: 'bull-breakout',
        direction: 'bullish',
        period,
        anchors: [previous, latest],
        detectionIndex: currentIndex,
        detectionTime: sourceData[currentIndex].time,
        breakoutLevel,
        labelText: 'BUY',
        labelAnchor: {
            index: currentIndex,
            time: sourceData[currentIndex].time,
            price: sourceData[currentIndex].low,
        },
        segments: [
            {
                from: previous,
                to: {
                    index: currentIndex,
                    time: sourceData[currentIndex].time,
                    price: breakoutLevel,
                },
            },
        ],
    };
}

function buildBearBreakdown(
    sourceData: PatternSourceBar[],
    state: PivotSeries,
    currentIndex: number,
    period: number
): TrendlineBreakoutMatch | null {
    if (state.lows.length <= 2) {
        return null;
    }

    const latest = state.lows[state.lows.length - 1];
    const previous = state.lows[state.lows.length - 2];
    if (!latest || !previous || latest.index <= previous.index) {
        return null;
    }

    if (state.lastBearPivotIndex === latest.index) {
        return null;
    }

    const breakdownLevel = linePriceAt(previous, latest, currentIndex);
    const slope = (latest.price - previous.price) / (latest.index - previous.index);
    const currentClose = sourceData[currentIndex].close;
    const prevClose = currentIndex > 0 ? sourceData[currentIndex - 1].close : currentClose;
    const prev2Close = currentIndex > 1 ? sourceData[currentIndex - 2].close : prevClose;

    if (slope <= 0) {
        return null;
    }

    if (!(currentClose < breakdownLevel && (prevClose > breakdownLevel || prev2Close > breakdownLevel))) {
        return null;
    }

    return {
        kind: 'bear-breakdown',
        direction: 'bearish',
        period,
        anchors: [previous, latest],
        detectionIndex: currentIndex,
        detectionTime: sourceData[currentIndex].time,
        breakoutLevel: breakdownLevel,
        labelText: 'SELL',
        labelAnchor: {
            index: currentIndex,
            time: sourceData[currentIndex].time,
            price: sourceData[currentIndex].high,
        },
        segments: [
            {
                from: previous,
                to: {
                    index: currentIndex,
                    time: sourceData[currentIndex].time,
                    price: breakdownLevel,
                },
            },
        ],
    };
}

function buildPeriods(options: TrendlineBreakoutDetectionOptions): number[] {
    const periods = new Set<number>();
    periods.add(Math.max(2, Math.floor(options.period)));
    if (options.useLength8 !== false) periods.add(8);
    if (options.useLength10 !== false) periods.add(10);
    if (options.useLength15 !== false) periods.add(15);
    if (options.useLength30 !== false) periods.add(30);
    return [...periods].sort((a, b) => a - b);
}

function getConfirmedPivotHigh(
    sourceData: PatternSourceBar[],
    currentIndex: number,
    left: number,
    right: number
): ZigZagPoint | null {
    const pivotIndex = currentIndex - right;
    if (pivotIndex < left || pivotIndex < 0 || currentIndex >= sourceData.length) {
        return null;
    }

    const pivotHigh = sourceData[pivotIndex].high;
    for (let i = pivotIndex - left; i <= pivotIndex + right; i++) {
        if (i < 0 || i >= sourceData.length) {
            return null;
        }
        if (sourceData[i].high > pivotHigh) {
            return null;
        }
    }

    return {
        index: pivotIndex,
        time: sourceData[pivotIndex].time,
        price: pivotHigh,
        kind: 'high',
    };
}

function getConfirmedPivotLow(
    sourceData: PatternSourceBar[],
    currentIndex: number,
    left: number,
    right: number
): ZigZagPoint | null {
    const pivotIndex = currentIndex - right;
    if (pivotIndex < left || pivotIndex < 0 || currentIndex >= sourceData.length) {
        return null;
    }

    const pivotLow = sourceData[pivotIndex].low;
    for (let i = pivotIndex - left; i <= pivotIndex + right; i++) {
        if (i < 0 || i >= sourceData.length) {
            return null;
        }
        if (sourceData[i].low < pivotLow) {
            return null;
        }
    }

    return {
        index: pivotIndex,
        time: sourceData[pivotIndex].time,
        price: pivotLow,
        kind: 'low',
    };
}

function computeVolumeStrength(sourceData: PatternSourceBar[], period: number): number[] {
    const result = new Array<number>(sourceData.length).fill(0);
    let sum = 0;

    for (let i = 0; i < sourceData.length; i++) {
        const volume = sourceData[i].volume ?? 0;
        sum += volume;

        if (i >= period) {
            sum -= sourceData[i - period].volume ?? 0;
        }

        const length = Math.min(i + 1, period);
        const avg = length > 0 ? sum / length : 0;
        result[i] = avg > 0 ? volume / avg : 0;
    }

    return result;
}

function linePriceAt(from: PatternPoint, to: PatternPoint, targetIndex: number): number {
    if (from.index === to.index) {
        return to.price;
    }

    const slope = (to.price - from.price) / (to.index - from.index);
    return from.price + slope * (targetIndex - from.index);
}

function findLatestMatch(
    matches: TrendlineBreakoutMatch[],
    direction: 'bullish' | 'bearish'
): TrendlineBreakoutMatch | null {
    let latest: TrendlineBreakoutMatch | null = null;

    for (const match of matches) {
        if (match.direction !== direction) {
            continue;
        }

        if (!latest || match.detectionIndex > latest.detectionIndex) {
            latest = match;
        }
    }

    return latest;
}
