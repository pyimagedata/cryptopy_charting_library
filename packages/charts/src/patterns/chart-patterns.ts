import { PatternPoint, PatternSourceBar, ZigZagPoint } from './types';
import { scanHarmonicPivots } from './harmonic-pivots';

export interface ChartPatternSegment {
    from: PatternPoint;
    to: PatternPoint;
    dashed?: boolean;
}

export interface ChartPatternMatch {
    kind: 'double-top' | 'double-bottom' | 'bull-pennant' | 'bear-pennant' | 'bull-flag' | 'bear-flag' | 'bull-wedge-cont' | 'bear-wedge-cont';
    direction: 'bullish' | 'bearish';
    points: ZigZagPoint[];
    detectionIndex: number;
    detectionTime: number;
    neckline: number;
    labelText?: string;
    labelAnchor?: PatternPoint;
    segments?: ChartPatternSegment[];
}

export interface ChartPatternDetectionOptions {
    period: number;
    showPrediction?: boolean;
    showHistory?: boolean;
    showDoubleTop?: boolean;
    showDoubleBottom?: boolean;
    showBullPennant?: boolean;
    showBearPennant?: boolean;
    showBullFlag?: boolean;
    showBearFlag?: boolean;
    showBullWedgeCont?: boolean;
    showBearWedgeCont?: boolean;
}

export function detectChartPatterns(
    sourceData: PatternSourceBar[],
    options: ChartPatternDetectionOptions
): ChartPatternMatch[] {
    const patterns: ChartPatternMatch[] = [];
    const seen = new Set<string>();
    const showPrediction = !!options.showPrediction;
    const showHistory = !!options.showHistory;
    const showDoubleTop = options.showDoubleTop !== false;
    const showDoubleBottom = options.showDoubleBottom !== false;
    const showBullPennant = options.showBullPennant !== false;
    const showBearPennant = options.showBearPennant !== false;
    const showBullFlag = options.showBullFlag !== false;
    const showBearFlag = options.showBearFlag !== false;
    const showBullWedgeCont = options.showBullWedgeCont !== false;
    const showBearWedgeCont = options.showBearWedgeCont !== false;
    const lastIndex = sourceData.length - 1;
    const scanOnlyLastBar = !showHistory;
    const maxPatterns = showHistory ? 48 : 12;

    const pushPattern = (key: string, pattern: ChartPatternMatch | null): void => {
        if (!pattern || seen.has(key)) {
            return;
        }
        seen.add(key);
        patterns.push(pattern);
        if (patterns.length > maxPatterns) {
            patterns.shift();
        }
    };

    scanHarmonicPivots(sourceData, options.period, (pivotSnapshot, currentIndex, direction) => {
        if (scanOnlyLastBar && currentIndex !== lastIndex) {
            return;
        }
        const requireHistoricalBreakout = showHistory && currentIndex !== lastIndex;

        const pivots = pivotSnapshot.slice().reverse();
        if (pivots.length < 4) {
            return;
        }

        if (showDoubleTop) {
            const topCandidate = buildDoubleTop(
                sourceData,
                pivots,
                direction,
                currentIndex,
                showPrediction,
                requireHistoricalBreakout
            );
            const key = topCandidate
                ? `double-top:${topCandidate.points[1].index}-${topCandidate.points[2].index}-${topCandidate.points[3].index}`
                : '';
            pushPattern(key, topCandidate);
        }

        if (showDoubleBottom) {
            const bottomCandidate = buildDoubleBottom(
                sourceData,
                pivots,
                direction,
                currentIndex,
                showPrediction,
                requireHistoricalBreakout
            );
            const key = bottomCandidate
                ? `double-bottom:${bottomCandidate.points[1].index}-${bottomCandidate.points[2].index}-${bottomCandidate.points[3].index}`
                : '';
            pushPattern(key, bottomCandidate);
        }

        if (showBullPennant && (showHistory || currentIndex === lastIndex)) {
            const bullPennant = buildBullPennant(
                sourceData,
                pivots,
                direction,
                currentIndex,
                showPrediction,
                requireHistoricalBreakout
            );
            const key = bullPennant
                ? `bull-pennant:${bullPennant.points[1].index}-${bullPennant.points[2].index}-${bullPennant.points[3].index}`
                : '';
            pushPattern(key, bullPennant);
        }

        if (showBearPennant && (showHistory || currentIndex === lastIndex)) {
            const bearPennant = buildBearPennant(
                sourceData,
                pivots,
                direction,
                currentIndex,
                showPrediction,
                requireHistoricalBreakout
            );
            const key = bearPennant
                ? `bear-pennant:${bearPennant.points[1].index}-${bearPennant.points[2].index}-${bearPennant.points[3].index}`
                : '';
            pushPattern(key, bearPennant);
        }

        if (showBullFlag && (showHistory || currentIndex === lastIndex)) {
            const bullFlag = buildBullFlag(
                sourceData,
                pivots,
                direction,
                currentIndex,
                showPrediction,
                requireHistoricalBreakout
            );
            const key = bullFlag
                ? `bull-flag:${bullFlag.points[1].index}-${bullFlag.points[2].index}-${bullFlag.points[3].index}`
                : '';
            pushPattern(key, bullFlag);
        }

        if (showBearFlag && (showHistory || currentIndex === lastIndex)) {
            const bearFlag = buildBearFlag(
                sourceData,
                pivots,
                direction,
                currentIndex,
                showPrediction,
                requireHistoricalBreakout
            );
            const key = bearFlag
                ? `bear-flag:${bearFlag.points[1].index}-${bearFlag.points[2].index}-${bearFlag.points[3].index}`
                : '';
            pushPattern(key, bearFlag);
        }

        if (showBullWedgeCont && (showHistory || currentIndex === lastIndex)) {
            const bullWedge = buildBullWedgeContinuation(
                sourceData,
                pivots,
                direction,
                currentIndex,
                showPrediction,
                requireHistoricalBreakout
            );
            const key = bullWedge
                ? `bull-wedge-cont:${bullWedge.points[1].index}-${bullWedge.points[2].index}-${bullWedge.points[3].index}`
                : '';
            pushPattern(key, bullWedge);
        }

        if (showBearWedgeCont && (showHistory || currentIndex === lastIndex)) {
            const bearWedge = buildBearWedgeContinuation(
                sourceData,
                pivots,
                direction,
                currentIndex,
                showPrediction,
                requireHistoricalBreakout
            );
            const key = bearWedge
                ? `bear-wedge-cont:${bearWedge.points[1].index}-${bearWedge.points[2].index}-${bearWedge.points[3].index}`
                : '';
            pushPattern(key, bearWedge);
        }
    });

    return patterns;
}

function buildDoubleTop(
    sourceData: PatternSourceBar[],
    pivots: ZigZagPoint[],
    direction: number,
    currentIndex: number,
    showPrediction: boolean,
    requireHistoricalBreakout: boolean
): ChartPatternMatch | null {
    const working = pivots.slice();
    if (direction === -1 && working.length >= 5) {
        working.pop();
    }
    if (working.length < 4) {
        return null;
    }

    const [x, a, b, c] = working.slice(-4) as [ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint];
    const aBar = sourceData[a.index];
    const cBar = sourceData[c.index];
    const currentClose = sourceData[currentIndex].close;

    const isDoubleTop =
        x.price < b.price &&
        b.price < a.price &&
        b.price < c.price &&
        Math.max(cBar.close, cBar.open) < a.price &&
        Math.max(aBar.close, aBar.open) < c.price &&
        a.price - (a.price - b.price) * 0.2 <= c.price &&
        a.price - (a.price - b.price) * -0.2 >= c.price;

    if (!isDoubleTop) {
        return null;
    }

    const requiresBreakout = requireHistoricalBreakout || !showPrediction;
    if (requiresBreakout && currentClose >= b.price) {
        return null;
    }

    return {
        kind: 'double-top',
        direction: 'bearish',
        points: [x, a, b, c],
        detectionIndex: currentIndex,
        detectionTime: sourceData[currentIndex].time,
        neckline: b.price,
        labelText: 'Cifte Tepe',
        labelAnchor: a,
    };
}

function buildDoubleBottom(
    sourceData: PatternSourceBar[],
    pivots: ZigZagPoint[],
    direction: number,
    currentIndex: number,
    showPrediction: boolean,
    requireHistoricalBreakout: boolean
): ChartPatternMatch | null {
    const working = pivots.slice();
    if (direction === 1 && working.length >= 5) {
        working.pop();
    }
    if (working.length < 4) {
        return null;
    }

    const [x, a, b, c] = working.slice(-4) as [ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint];
    const aBar = sourceData[a.index];
    const cBar = sourceData[c.index];
    const currentClose = sourceData[currentIndex].close;

    const isDoubleBottom =
        x.price > b.price &&
        b.price > a.price &&
        b.price > c.price &&
        Math.min(cBar.close, cBar.open) > a.price &&
        Math.min(aBar.close, aBar.open) > c.price &&
        a.price - (a.price - b.price) * 0.15 >= c.price &&
        a.price - (a.price - b.price) * -0.15 <= c.price;

    if (!isDoubleBottom) {
        return null;
    }

    const requiresBreakout = requireHistoricalBreakout || !showPrediction;
    if (requiresBreakout && currentClose <= b.price) {
        return null;
    }

    return {
        kind: 'double-bottom',
        direction: 'bullish',
        points: [x, a, b, c],
        detectionIndex: currentIndex,
        detectionTime: sourceData[currentIndex].time,
        neckline: b.price,
        labelText: 'Cifte Dip',
        labelAnchor: a,
    };
}

function buildBullPennant(
    sourceData: PatternSourceBar[],
    pivots: ZigZagPoint[],
    direction: number,
    currentIndex: number,
    showPrediction: boolean,
    requireHistoricalBreakout: boolean
): ChartPatternMatch | null {
    const working = pivots.slice();
    if (direction === 1 && working.length >= 6) {
        working.pop();
    }
    if (working.length < 5) {
        return null;
    }

    const [x, a, b, c, d] = working.slice(-5) as [ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint];
    const isPennant =
        x.price < a.price &&
        c.price < a.price &&
        b.price < d.price &&
        b.price < a.price &&
        x.price < b.price;

    if (!isPennant) {
        return null;
    }

    const upper = lineAtCurrent(a, c, currentIndex);
    const lower = lineAtCurrent(b, d, currentIndex);
    const currentClose = sourceData[currentIndex].close;

    if (lower.price >= upper.price) {
        return null;
    }

    const requiresBreakout = requireHistoricalBreakout || !showPrediction;
    if (requiresBreakout && currentClose <= upper.price) {
        return null;
    }

    return {
        kind: 'bull-pennant',
        direction: 'bullish',
        points: [x, a, b, c, d],
        detectionIndex: currentIndex,
        detectionTime: sourceData[currentIndex].time,
        neckline: upper.price,
        labelText: 'Boga Flama',
        labelAnchor: a,
        segments: [
            { from: x, to: a },
            { from: a, to: upper.point },
            {
                from: { index: a.index, time: a.time, price: linePriceAt(b, d, a.index) },
                to: lower.point,
            },
        ],
    };
}

function buildBearPennant(
    sourceData: PatternSourceBar[],
    pivots: ZigZagPoint[],
    direction: number,
    currentIndex: number,
    showPrediction: boolean,
    requireHistoricalBreakout: boolean
): ChartPatternMatch | null {
    const working = pivots.slice();
    if (direction === -1 && working.length >= 6) {
        working.pop();
    }
    if (working.length < 5) {
        return null;
    }

    const [x, a, b, c, d] = working.slice(-5) as [ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint];
    const currentBar = sourceData[currentIndex];

    const isPennant =
        x.price > a.price &&
        c.price > a.price &&
        b.price > d.price &&
        b.price > a.price &&
        x.price > b.price &&
        a.price - (a.price - x.price) * 0.786 > b.price;

    if (!isPennant) {
        return null;
    }

    const lower = lineAtCurrent(a, c, currentIndex);
    const upper = lineAtCurrent(b, d, currentIndex);
    const currentClose = currentBar.close;

    if (lower.price >= upper.price) {
        return null;
    }

    const requiresBreakout = requireHistoricalBreakout || !showPrediction;
    if (requiresBreakout && currentClose >= lower.price) {
        return null;
    }

    return {
        kind: 'bear-pennant',
        direction: 'bearish',
        points: [x, a, b, c, d],
        detectionIndex: currentIndex,
        detectionTime: currentBar.time,
        neckline: lower.price,
        labelText: 'Ayi Flama',
        labelAnchor: a,
        segments: [
            { from: x, to: a },
            { from: a, to: lower.point },
            {
                from: { index: a.index, time: a.time, price: linePriceAt(b, d, a.index) },
                to: upper.point,
            },
        ],
    };
}

function buildBullFlag(
    sourceData: PatternSourceBar[],
    pivots: ZigZagPoint[],
    direction: number,
    currentIndex: number,
    showPrediction: boolean,
    requireHistoricalBreakout: boolean
): ChartPatternMatch | null {
    const working = pivots.slice();
    if (direction === 1 && working.length >= 6) {
        working.pop();
    }
    if (working.length < 5) {
        return null;
    }

    const [x, a, b, c, d] = working.slice(-5) as [ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint];
    const isFlag =
        x.price < a.price &&
        c.price <= a.price &&
        b.price >= d.price &&
        b.price < a.price &&
        x.price < b.price &&
        d.price > x.price &&
        d.index - a.index < 150;

    if (!isFlag) {
        return null;
    }

    const upper = lineAtCurrent(a, c, currentIndex);
    const lower = lineAtCurrent(b, d, currentIndex);
    const upperSlope = lineSlope(a, c);
    const lowerSlope = lineSlope(b, d);
    const currentClose = sourceData[currentIndex].close;

    if (lower.price >= upper.price || upperSlope >= 0 || lowerSlope >= 0) {
        return null;
    }

    const ratio = slopeRatio(upperSlope, lowerSlope);
    if (ratio < 0.7 || ratio > 1.5) {
        return null;
    }

    const requiresBreakout = requireHistoricalBreakout || !showPrediction;
    if (requiresBreakout && currentClose <= upper.price) {
        return null;
    }

    return {
        kind: 'bull-flag',
        direction: 'bullish',
        points: [x, a, b, c, d],
        detectionIndex: currentIndex,
        detectionTime: sourceData[currentIndex].time,
        neckline: upper.price,
        labelText: 'Boga Bayrak',
        labelAnchor: a,
        segments: [
            { from: x, to: a },
            { from: a, to: upper.point },
            {
                from: { index: a.index, time: a.time, price: linePriceAt(b, d, a.index) },
                to: lower.point,
            },
        ],
    };
}

function buildBearFlag(
    sourceData: PatternSourceBar[],
    pivots: ZigZagPoint[],
    direction: number,
    currentIndex: number,
    showPrediction: boolean,
    requireHistoricalBreakout: boolean
): ChartPatternMatch | null {
    const working = pivots.slice();
    if (direction === -1 && working.length >= 6) {
        working.pop();
    }
    if (working.length < 5) {
        return null;
    }

    const [x, a, b, c, d] = working.slice(-5) as [ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint];
    const isFlag =
        x.price > a.price &&
        c.price > a.price &&
        b.price < d.price &&
        b.price > a.price &&
        x.price > b.price &&
        d.price < x.price &&
        d.index - a.index < 150;

    if (!isFlag) {
        return null;
    }

    const lower = lineAtCurrent(a, c, currentIndex);
    const upper = lineAtCurrent(b, d, currentIndex);
    const lowerSlope = lineSlope(a, c);
    const upperSlope = lineSlope(b, d);
    const currentClose = sourceData[currentIndex].close;

    if (lower.price >= upper.price || lowerSlope <= 0 || upperSlope <= 0) {
        return null;
    }

    const ratio = slopeRatio(upperSlope, lowerSlope);
    if (ratio < 0.7 || ratio > 1.5) {
        return null;
    }

    const requiresBreakout = requireHistoricalBreakout || !showPrediction;
    if (requiresBreakout && currentClose >= lower.price) {
        return null;
    }

    return {
        kind: 'bear-flag',
        direction: 'bearish',
        points: [x, a, b, c, d],
        detectionIndex: currentIndex,
        detectionTime: sourceData[currentIndex].time,
        neckline: lower.price,
        labelText: 'Ayi Bayrak',
        labelAnchor: a,
        segments: [
            { from: x, to: a },
            { from: a, to: lower.point },
            {
                from: { index: a.index, time: a.time, price: linePriceAt(b, d, a.index) },
                to: upper.point,
            },
        ],
    };
}

function buildBullWedgeContinuation(
    sourceData: PatternSourceBar[],
    pivots: ZigZagPoint[],
    direction: number,
    currentIndex: number,
    showPrediction: boolean,
    requireHistoricalBreakout: boolean
): ChartPatternMatch | null {
    const working = pivots.slice();
    if (direction === 1 && working.length >= 6) {
        working.pop();
    }
    if (working.length < 5) {
        return null;
    }

    const [x, a, b, c, d] = working.slice(-5) as [ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint];
    const currentClose = sourceData[currentIndex].close;
    const isWedge =
        x.price < a.price &&
        c.price <= a.price &&
        b.price >= d.price &&
        b.price < a.price &&
        x.price < b.price &&
        d.price > x.price &&
        currentClose < (a.price - x.price) * 0.382 + d.price;

    if (!isWedge) {
        return null;
    }

    const upper = lineAtCurrent(a, c, currentIndex);
    const lower = lineAtCurrent(b, d, currentIndex);
    const angle = wedgeAngle(a, c, b, d, a.price, d.price);

    if (upper.price <= lower.price || angle >= -0.099) {
        return null;
    }

    const requiresBreakout = requireHistoricalBreakout || !showPrediction;
    if (requiresBreakout && currentClose <= upper.price) {
        return null;
    }

    return {
        kind: 'bull-wedge-cont',
        direction: 'bullish',
        points: [x, a, b, c, d],
        detectionIndex: currentIndex,
        detectionTime: sourceData[currentIndex].time,
        neckline: upper.price,
        labelText: 'Boga Takoz Devam',
        labelAnchor: a,
        segments: [
            { from: x, to: a },
            { from: a, to: upper.point },
            {
                from: { index: a.index, time: a.time, price: linePriceAt(b, d, a.index) },
                to: lower.point,
            },
        ],
    };
}

function buildBearWedgeContinuation(
    sourceData: PatternSourceBar[],
    pivots: ZigZagPoint[],
    direction: number,
    currentIndex: number,
    showPrediction: boolean,
    requireHistoricalBreakout: boolean
): ChartPatternMatch | null {
    const working = pivots.slice();
    if (direction === -1 && working.length >= 6) {
        working.pop();
    }
    if (working.length < 5) {
        return null;
    }

    const [x, a, b, c, d] = working.slice(-5) as [ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint];
    const currentClose = sourceData[currentIndex].close;
    const isWedge =
        x.price > a.price &&
        c.price > a.price &&
        b.price < d.price &&
        b.price > a.price &&
        x.price > b.price &&
        d.price < x.price;

    if (!isWedge) {
        return null;
    }

    const lower = lineAtCurrent(a, c, currentIndex);
    const upper = lineAtCurrent(b, d, currentIndex);
    const angle = wedgeAngle(a, c, b, d, d.price, a.price);
    const dAboveLower = d.price > linePriceAt(a, c, d.index);

    if (lower.price >= upper.price || angle <= 0.05 || !dAboveLower) {
        return null;
    }

    const requiresBreakout = requireHistoricalBreakout || !showPrediction;
    if (requiresBreakout && currentClose >= lower.price) {
        return null;
    }

    return {
        kind: 'bear-wedge-cont',
        direction: 'bearish',
        points: [x, a, b, c, d],
        detectionIndex: currentIndex,
        detectionTime: sourceData[currentIndex].time,
        neckline: lower.price,
        labelText: 'Ayi Takoz Devam',
        labelAnchor: a,
        segments: [
            { from: x, to: a },
            { from: a, to: lower.point },
            {
                from: { index: a.index, time: a.time, price: linePriceAt(b, d, a.index) },
                to: upper.point,
            },
        ],
    };
}

function lineAtCurrent(start: ZigZagPoint, end: ZigZagPoint, currentIndex: number): { price: number; point: PatternPoint } {
    const price = linePriceAt(start, end, currentIndex);
    return {
        price,
        point: {
            index: currentIndex,
            time: end.time,
            price,
        },
    };
}

function linePriceAt(start: PatternPoint, end: PatternPoint, targetIndex: number): number {
    const deltaIndex = start.index - end.index;
    if (Math.abs(deltaIndex) < 1e-8) {
        return end.price;
    }
    const slope = (start.price - end.price) / deltaIndex;
    const intercept = start.price - slope * start.index;
    return slope * targetIndex + intercept;
}

function lineSlope(start: PatternPoint, end: PatternPoint): number {
    const deltaIndex = end.index - start.index;
    if (Math.abs(deltaIndex) < 1e-8) {
        return 0;
    }
    return (end.price - start.price) / deltaIndex;
}

function slopeRatio(a: number, b: number): number {
    if (Math.abs(a) < 1e-8 || Math.abs(b) < 1e-8) {
        return Infinity;
    }
    return a / b;
}

function wedgeAngle(
    topStart: PatternPoint,
    topEnd: PatternPoint,
    bottomStart: PatternPoint,
    bottomEnd: PatternPoint,
    max: number,
    min: number
): number {
    const range = (max - min) / 100;
    if (Math.abs(range) < 1e-8) {
        return 0;
    }
    const topStartNorm = (topStart.price - min) / range;
    const topEndNorm = (topEnd.price - min) / range;
    const bottomStartNorm = (bottomStart.price - min) / range;
    const bottomEndNorm = (bottomEnd.price - min) / range;
    const slope1 = (topStartNorm - topEndNorm) / (topStart.index - topEnd.index);
    const slope2 = (bottomStartNorm - bottomEndNorm) / (bottomStart.index - bottomEnd.index);
    const tanAlpha = (slope1 - slope2) / (1 + slope1 * slope2);
    return Math.atan(tanAlpha);
}
