import { PatternSourceBar, ZigZagPoint } from './types';
import { scanHarmonicPivots } from './harmonic-pivots';

export interface CypherPattern {
    points: [ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint, ZigZagPoint];
    direction: 'bullish' | 'bearish';
}

export function detectCypherPatterns(sourceData: PatternSourceBar[], period: number): CypherPattern[] {
    const patterns: CypherPattern[] = [];
    const seen = new Set<string>();
    const seenAbcKeys = new Set<string>();

    scanHarmonicPivots(sourceData, period, (pivotSnapshot, currentIndex, direction) => {
        const pivots = pivotSnapshot.slice().reverse();
        if (pivots.length < 5) {
            return;
        }

        const currentBar = sourceData[currentIndex];
        const previousBar = sourceData[Math.max(0, currentIndex - 1)];
        const haOpen = (previousBar.open + previousBar.close) / 2;
        const haClose = (haOpen + currentBar.high + currentBar.low + currentBar.close) / 4;
        const close4 = currentIndex >= 4 ? sourceData[currentIndex - 4].close : currentBar.close;

        const start = pivots.length - 5;
        const candidate = buildCypher(
            sourceData,
            pivots[start],
            pivots[start + 1],
            pivots[start + 2],
            pivots[start + 3],
            pivots[start + 4],
            direction,
            haOpen,
            haClose,
            close4,
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

function buildCypher(
    sourceData: PatternSourceBar[],
    x: ZigZagPoint,
    a: ZigZagPoint,
    b: ZigZagPoint,
    c: ZigZagPoint,
    d: ZigZagPoint,
    direction: number,
    haOpen: number,
    haClose: number,
    close4: number,
    currentClose: number
): CypherPattern | null {
    const bClose = sourceData[b.index]?.close ?? b.price;
    const cClose = sourceData[c.index]?.close ?? c.price;

    const xa382 = a.price - (a.price - x.price) * 0.382;
    const xa618 = a.price - (a.price - x.price) * 0.618;
    const xaNeg005 = a.price - (a.price - x.price) * -0.05;
    const xaNeg414 = a.price - (a.price - x.price) * -0.414;
    const cx786 = c.price - (c.price - x.price) * 0.786;

    const bearish =
        direction === 1 &&
        haClose < haOpen &&
        a.price > c.price &&
        c.price < b.price &&
        b.price < d.price &&
        d.price < x.price &&
        xa382 <= b.price &&
        bClose < xa618 &&
        c.price < xaNeg005 &&
        cClose > xaNeg414 &&
        d.price > cx786;

    const bullish =
        direction === -1 &&
        haClose > haOpen &&
        currentClose > close4 &&
        a.price < c.price &&
        c.price > b.price &&
        b.price > d.price &&
        d.price > x.price &&
        xa382 >= b.price &&
        bClose > xa618 &&
        c.price > xaNeg005 &&
        cClose < xaNeg414 &&
        d.price < cx786;

    if (!bearish && !bullish) {
        return null;
    }

    return {
        points: [x, a, b, c, d],
        direction: bearish ? 'bearish' : 'bullish',
    };
}
