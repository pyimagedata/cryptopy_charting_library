import { PatternSourceBar, ZigZagPoint } from './types';
import { scanHarmonicPivots } from './harmonic-pivots';

export interface BatPattern {
    points: [ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint];
    direction: 'bullish' | 'bearish';
}

export function detectBatPatterns(sourceData: PatternSourceBar[], period: number): BatPattern[] {
    const patterns: BatPattern[] = [];
    const seen = new Set<string>();
    const seenAbcKeys = new Set<string>();

    scanHarmonicPivots(sourceData, period, (pivotSnapshot, currentIndex, direction) => {
        const pivots = pivotSnapshot.slice().reverse();
        if (pivots.length < 5) {
            return;
        }

        const currentBar = sourceData[currentIndex];
        const start = pivots.length - 5;
        const candidate = buildBat(
            pivots[start],
            pivots[start + 1],
            pivots[start + 2],
            pivots[start + 3],
            pivots[start + 4],
            direction,
            currentBar.open,
            currentBar.close
        );
        if (!candidate) {
            return;
        }

        const key = `${candidate.direction}:${candidate.points[0].index}-${candidate.points[1].index}-${candidate.points[2].index}-${candidate.points[3].index}`;
        if (seen.has(key)) {
            return;
        }

        const abcKey = `${candidate.points[1].index}-${candidate.points[2].index}-${candidate.points[3].index}`;
        if (seenAbcKeys.has(abcKey)) {
            return;
        }

        seen.add(key);
        seenAbcKeys.add(abcKey);
        patterns.push(candidate);
    });

    return patterns;
}

function buildBat(
    x: ZigZagPoint,
    a: ZigZagPoint,
    b: ZigZagPoint,
    c: ZigZagPoint,
    d: ZigZagPoint,
    direction: number,
    open: number,
    close: number
): BatPattern | null {
    const xa382 = a.price - (a.price - x.price) * 0.382;
    const xa5 = a.price - (a.price - x.price) * 0.5;
    const xa618 = a.price - (a.price - x.price) * 0.618;
    const xa886 = a.price - (a.price - x.price) * 0.886;
    const dUpperOrLower = xa886 - (xa886 - a.price) * -0.382;

    const bearish =
        direction === 1 &&
        close < open &&
        a.price < c.price &&
        c.price < b.price &&
        b.price < d.price &&
        d.price < x.price &&
        xa382 <= b.price &&
        b.price < xa5 &&
        xa886 <= d.price &&
        dUpperOrLower > d.price;

    const bullish =
        direction === -1 &&
        close > open &&
        a.price > c.price &&
        c.price > b.price &&
        b.price > d.price &&
        d.price > x.price &&
        xa5 >= b.price &&
        b.price > xa618 &&
        b.price - (b.price - a.price) * 0.5 <= c.price &&
        b.price - (b.price - a.price) * 0.786 > c.price &&
        xa886 >= d.price &&
        dUpperOrLower < d.price;

    if (!bearish && !bullish) {
        return null;
    }

    return {
        points: [x, a, b, c, d],
        direction: bearish ? 'bearish' : 'bullish',
    };
}
