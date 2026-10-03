import { PatternSourceBar, ZigZagPoint } from './types';
import { scanHarmonicPivots } from './harmonic-pivots';

export interface GartleyPattern {
    points: [ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint];
    direction: 'bullish' | 'bearish';
}

export function detectGartleyPatterns(sourceData: PatternSourceBar[], period: number): GartleyPattern[] {
    const patterns: GartleyPattern[] = [];
    const seen = new Set<string>();
    const seenAbcKeys = new Set<string>();

    scanHarmonicPivots(sourceData, period, (pivotSnapshot) => {
        const pivots = pivotSnapshot.slice().reverse();
        if (pivots.length < 5) {
            return;
        }

        const start = pivots.length - 5;
        const candidate = buildGartley(
            pivots[start],
            pivots[start + 1],
            pivots[start + 2],
            pivots[start + 3],
            pivots[start + 4]
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

function buildGartley(x: ZigZagPoint, a: ZigZagPoint, b: ZigZagPoint, c: ZigZagPoint, d: ZigZagPoint): GartleyPattern | null {
    const bearish =
        x.price > d.price &&
        d.price > b.price &&
        b.price > c.price &&
        c.price > a.price;

    const bullish =
        x.price < d.price &&
        d.price < b.price &&
        b.price < c.price &&
        c.price < a.price;

    if (!bearish && !bullish) {
        return null;
    }

    const xa618 = a.price - (a.price - x.price) * 0.618;
    const xa786 = a.price - (a.price - x.price) * 0.786;

    const validB = bearish
        ? xa618 <= b.price && b.price < xa786
        : xa618 >= b.price && b.price > xa786;

    const validD = bearish
        ? xa618 <= d.price && xa786 <= d.price
        : xa786 >= d.price;

    const ab618 = b.price - (b.price - a.price) * 0.618;
    const validC = bearish
        ? ab618 >= c.price
        : ab618 <= c.price;

    if (!validB || !validC || !validD) {
        return null;
    }

    return {
        points: [x, a, b, c, d],
        direction: bearish ? 'bearish' : 'bullish',
    };
}
