import { PatternSourceBar, ZigZagPoint } from './types';
import { calculateHarmonicPivots } from './harmonic-pivots';

export interface GartleyPattern {
    points: [ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint];
    direction: 'bullish' | 'bearish';
}

export function detectGartleyPatterns(sourceData: PatternSourceBar[], period: number): GartleyPattern[] {
    const pivots = calculateHarmonicPivots(sourceData, period).slice().reverse();
    if (pivots.length < 5) {
        return [];
    }

    const patterns: GartleyPattern[] = [];
    for (let i = 0; i <= pivots.length - 5; i++) {
        const candidate = buildGartley(pivots[i], pivots[i + 1], pivots[i + 2], pivots[i + 3], pivots[i + 4]);
        if (candidate) {
            patterns.push(candidate);
        }
    }
    return dedupe(patterns);
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

function dedupe(patterns: GartleyPattern[]): GartleyPattern[] {
    const seen = new Set<string>();
    const result: GartleyPattern[] = [];
    for (const pattern of patterns) {
        const key = pattern.points.map((point) => point.index).join('-');
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(pattern);
    }
    return result;
}
