import { ABCDPattern, PatternSourceBar, ZigZagPoint } from './types';
import { scanHarmonicPivots } from './harmonic-pivots';

export interface ABCDDetectionOptions {
    period: number;
}

export function detectABCDPattern(
    sourceData: PatternSourceBar[],
    options: ABCDDetectionOptions
): ABCDPattern | null {
    const patterns = detectABCDPatterns(sourceData, options);
    return patterns.length > 0 ? patterns[patterns.length - 1] : null;
}

export function detectABCDPatterns(
    sourceData: PatternSourceBar[],
    options: ABCDDetectionOptions
): ABCDPattern[] {
    const patterns: ABCDPattern[] = [];
    const seen = new Set<string>();
    const seenAbcKeys = new Set<string>();

    scanHarmonicPivots(sourceData, options.period, (pivotSnapshot) => {
        const zigZagPoints = pivotSnapshot.slice().reverse();
        if (zigZagPoints.length < 4) {
            return;
        }

        const start = zigZagPoints.length - 4;
        const candidate = _buildPattern(
            zigZagPoints[start],
            zigZagPoints[start + 1],
            zigZagPoints[start + 2],
            zigZagPoints[start + 3]
        );
        if (!candidate) {
            return;
        }

        const key = `${candidate.direction}:${candidate.points[0].index}-${candidate.points[1].index}-${candidate.points[2].index}`;
        if (seen.has(key)) {
            return;
        }

        const abcKey = `${candidate.points[0].index}-${candidate.points[1].index}-${candidate.points[2].index}`;
        if (seenAbcKeys.has(abcKey)) {
            return;
        }

        seen.add(key);
        seenAbcKeys.add(abcKey);
        patterns.push(candidate);
    });

    return patterns;
}

function _buildPattern(
    a: ZigZagPoint,
    b: ZigZagPoint,
    c: ZigZagPoint,
    d: ZigZagPoint
): ABCDPattern | null {
    const points = [a, b, c, d] as [typeof a, typeof b, typeof c, typeof d];

    const alternating = a.kind !== b.kind && b.kind !== c.kind && c.kind !== d.kind;
    if (!alternating) {
        return null;
    }

    const sellPattern =
        a.price < b.price &&
        a.price < d.price &&
        a.price < c.price &&
        c.price < b.price &&
        c.price < d.price;
    const buyPattern =
        a.price > b.price &&
        a.price > d.price &&
        a.price > c.price &&
        c.price > b.price &&
        c.price > d.price;
    if (!sellPattern && !buyPattern) {
        return null;
    }

    const ab = Math.abs(b.price - a.price);
    if (ab === 0) {
        return null;
    }

    const bcRatio = Math.abs(c.price - b.price) / ab;
    const cdRatio = Math.abs(d.price - c.price) / Math.max(Math.abs(c.price - b.price), 1e-8);
    const abCdRatio = Math.abs(d.price - c.price) / ab;
    const extensionOne = sellPattern
        ? c.price + ab
        : c.price - ab;
    const extension1272 = sellPattern
        ? c.price + ab * 1.272
        : c.price - ab * 1.272;
    const validExtensionZone = sellPattern
        ? d.price >= extensionOne && d.price <= extension1272
        : d.price <= extensionOne && d.price >= extension1272;

    if (!validExtensionZone) {
        return null;
    }

    return {
        points,
        direction: sellPattern ? 'bearish' : 'bullish',
        bcRatio,
        cdRatio,
        abCdRatio,
        extensionOne,
        extension1272,
    };
}
