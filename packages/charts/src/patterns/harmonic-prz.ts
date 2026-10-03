/**
 * Harmonik formasyonlar icin tahmini D alani (PRZ - Potential Reversal Zone).
 *
 * X/A/B/C (ABCD'de A/B/C) belli oldugunda D'nin gelmesi beklenen fiyat
 * araligini formasyonun kendi oranlariyla hesaplar. B/C kurallari tamamlanmis
 * formasyonlari bulan dedektorlerle (gartley.ts, bat.ts, cypher.ts, abcd.ts)
 * ayni tutulur; boylece burada "olusuyor" denen formasyon D gelince
 * tamamlanmis olarak da bulunur.
 *
 * Yon adlandirmasi dedektorlerle ayni: 'bullish' = D bir dip (D bacagi C'den
 * asagi iner), 'bearish' = D bir tepe.
 */

import { PatternSourceBar, ZigZagPoint } from './types';
import { calculateHarmonicPivots } from './harmonic-pivots';

export type HarmonicKind = 'abcd' | 'gartley' | 'bat' | 'cypher';

export interface HarmonicPrz {
    direction: 'bullish' | 'bearish';
    /** Alanin ust ve alt siniri. */
    top: number;
    bottom: number;
    /** Fiyat bunun otesine gecerse formasyon bozulmus sayilir. */
    invalidPrice: number;
}

export interface FormingHarmonic {
    kind: HarmonicKind;
    direction: 'bullish' | 'bearish';
    /** X, A, B, C (ABCD'de A, B, C). */
    points: ZigZagPoint[];
    /** D bacaginin su ana kadarki uc noktasi. */
    current: ZigZagPoint;
    prz: HarmonicPrz;
}

/** a'dan x'e dogru k orani kadar: k=0 -> a, k=1 -> x (dedektorlerdeki `a - (a - x) * k`). */
function retrace(a: number, x: number, k: number): number {
    return a - (a - x) * k;
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.min(Math.max(v, lo), hi);
}

/**
 * Ana seviye (P) ile BC uzantisi araliginin P'ye en yakin noktasi arasindaki
 * bolge; ikisi ust uste geliyorsa P etrafinda en az `minHeight` kalinlikta.
 * Sonuc D'nin gecerli araligina [limitLo, limitHi] kirpilir.
 */
function confluenceZone(
    primary: number,
    extA: number,
    extB: number,
    minHeight: number,
    limitLo: number,
    limitHi: number
): { top: number; bottom: number } | null {
    const secondary = clamp(primary, Math.min(extA, extB), Math.max(extA, extB));
    let top = Math.max(primary, secondary);
    let bottom = Math.min(primary, secondary);
    if (top - bottom < minHeight) {
        const mid = (top + bottom) / 2;
        top = mid + minHeight / 2;
        bottom = mid - minHeight / 2;
    }
    top = Math.min(top, limitHi);
    bottom = Math.max(bottom, limitLo);
    return top > bottom ? { top, bottom } : null;
}

function gartleyPrz(x: ZigZagPoint, a: ZigZagPoint, b: ZigZagPoint, c: ZigZagPoint): HarmonicPrz | null {
    const bullish = x.price < b.price && b.price < c.price && c.price < a.price;
    const bearish = x.price > b.price && b.price > c.price && c.price > a.price;
    if (!bullish && !bearish) return null;

    const xa618 = retrace(a.price, x.price, 0.618);
    const xa786 = retrace(a.price, x.price, 0.786);
    const ab618 = retrace(b.price, a.price, 0.618);
    const validB = bearish ? xa618 <= b.price && b.price < xa786 : xa618 >= b.price && b.price > xa786;
    const validC = bearish ? ab618 >= c.price : ab618 <= c.price;
    if (!validB || !validC) return null;

    const zone = confluenceZone(
        xa786,
        retrace(c.price, b.price, 1.272),
        retrace(c.price, b.price, 1.618),
        Math.abs(a.price - x.price) * 0.03,
        Math.min(x.price, b.price),
        Math.max(x.price, b.price)
    );
    return zone && { direction: bullish ? 'bullish' : 'bearish', ...zone, invalidPrice: x.price };
}

function batPrz(x: ZigZagPoint, a: ZigZagPoint, b: ZigZagPoint, c: ZigZagPoint): HarmonicPrz | null {
    const bullish = a.price > c.price && c.price > b.price && b.price > x.price;
    const bearish = a.price < c.price && c.price < b.price && b.price < x.price;
    if (!bullish && !bearish) return null;

    const xa382 = retrace(a.price, x.price, 0.382);
    const xa5 = retrace(a.price, x.price, 0.5);
    const xa618 = retrace(a.price, x.price, 0.618);
    const xa886 = retrace(a.price, x.price, 0.886);
    const validB = bearish ? xa382 <= b.price && b.price < xa5 : xa5 >= b.price && b.price > xa618;
    const validC = bearish
        ? true
        : retrace(b.price, a.price, 0.5) <= c.price && retrace(b.price, a.price, 0.786) > c.price;
    if (!validB || !validC) return null;

    const zone = confluenceZone(
        xa886,
        retrace(c.price, b.price, 1.618),
        retrace(c.price, b.price, 2.618),
        Math.abs(a.price - x.price) * 0.03,
        Math.min(x.price, b.price),
        Math.max(x.price, b.price)
    );
    return zone && { direction: bullish ? 'bullish' : 'bearish', ...zone, invalidPrice: x.price };
}

function cypherPrz(
    sourceData: PatternSourceBar[],
    x: ZigZagPoint,
    a: ZigZagPoint,
    b: ZigZagPoint,
    c: ZigZagPoint
): HarmonicPrz | null {
    const bullish = a.price < c.price && c.price > b.price && b.price > x.price;
    const bearish = a.price > c.price && c.price < b.price && b.price < x.price;
    if (!bullish && !bearish) return null;

    const bClose = sourceData[b.index]?.close ?? b.price;
    const cClose = sourceData[c.index]?.close ?? c.price;
    const xa382 = retrace(a.price, x.price, 0.382);
    const xa618 = retrace(a.price, x.price, 0.618);
    const xaNeg005 = retrace(a.price, x.price, -0.05);
    const xaNeg414 = retrace(a.price, x.price, -0.414);
    const valid = bearish
        ? xa382 <= b.price && bClose < xa618 && c.price < xaNeg005 && cClose > xaNeg414
        : xa382 >= b.price && bClose > xa618 && c.price > xaNeg005 && cClose < xaNeg414;
    if (!valid) return null;

    // Cypher'da D, XC'nin %78,6 duzeltmesi; alan %78,6-%88,6 arasi.
    const cx786 = retrace(c.price, x.price, 0.786);
    const cx886 = retrace(c.price, x.price, 0.886);
    const lo = Math.min(x.price, b.price);
    const hi = Math.max(x.price, b.price);
    const top = Math.min(Math.max(cx786, cx886), hi);
    const bottom = Math.max(Math.min(cx786, cx886), lo);
    if (top <= bottom) return null;
    return { direction: bullish ? 'bullish' : 'bearish', top, bottom, invalidPrice: x.price };
}

function abcdPrz(a: ZigZagPoint, b: ZigZagPoint, c: ZigZagPoint): HarmonicPrz | null {
    const bullish = a.price > b.price && a.price > c.price && c.price > b.price;
    const bearish = a.price < b.price && a.price < c.price && c.price < b.price;
    if (!bullish && !bearish) return null;

    const ab = Math.abs(b.price - a.price);
    if (ab === 0) return null;
    // abcd.ts ile ayni: D, C'den AB'nin 1,0-1,272 kati kadar uzakta.
    const sign = bullish ? -1 : 1;
    const ext1 = c.price + sign * ab;
    const ext1272 = c.price + sign * ab * 1.272;
    return {
        direction: bullish ? 'bullish' : 'bearish',
        top: Math.max(ext1, ext1272),
        bottom: Math.min(ext1, ext1272),
        invalidPrice: c.price + sign * ab * 1.618,
    };
}

/** XABC (ABCD'de ABC) noktalarindan tahmini D alani; oranlar uymuyorsa null. */
export function harmonicPrz(kind: HarmonicKind, points: ZigZagPoint[], sourceData: PatternSourceBar[]): HarmonicPrz | null {
    if (kind === 'abcd') {
        return points.length >= 3 ? abcdPrz(points[0], points[1], points[2]) : null;
    }
    if (points.length < 4) return null;
    const [x, a, b, c] = points;
    if (kind === 'gartley') return gartleyPrz(x, a, b, c);
    if (kind === 'bat') return batPrz(x, a, b, c);
    return cypherPrz(sourceData, x, a, b, c);
}

function beyond(price: number, level: number, direction: 'bullish' | 'bearish'): boolean {
    return direction === 'bullish' ? price < level : price > level;
}

/**
 * Grafigin sonunda olusmakta olan formasyonlar: son ZigZag noktasi devam eden
 * D bacagi. D bacagi B seviyesini kirdiysa YA DA C'den alana giden yolun
 * `triggerPercent` kadarini gectiyse (kucuk formasyonlarda B alana cok yakin,
 * B'yi beklemek gec kaliyor) ve formasyon bozulmadiysa (X'in / ABCD'de 1,618
 * uzantisinin otesine gecmediyse) dondurulur.
 */
export function detectFormingHarmonics(
    sourceData: PatternSourceBar[],
    period: number,
    kinds: HarmonicKind[],
    triggerPercent = 50
): FormingHarmonic[] {
    const pivots = calculateHarmonicPivots(sourceData, period).slice().reverse();
    const result: FormingHarmonic[] = [];
    if (pivots.length < 4) return result;
    const current = pivots[pivots.length - 1];

    for (const kind of kinds) {
        const count = kind === 'abcd' ? 3 : 4;
        if (pivots.length < count + 1) continue;
        const points = pivots.slice(pivots.length - 1 - count, pivots.length - 1);
        const prz = harmonicPrz(kind, points, sourceData);
        if (!prz) continue;
        const b = points[count - 2];
        const c = points[count - 1];
        const brokeB = beyond(current.price, b.price, prz.direction);
        const nearEdge = prz.direction === 'bullish' ? prz.top : prz.bottom;
        const path = Math.abs(c.price - nearEdge);
        const travelled = (c.price - current.price) * (prz.direction === 'bullish' ? 1 : -1);
        const reachedTrigger = path > 0 && travelled / path >= Math.max(0, Math.min(100, triggerPercent)) / 100;
        const invalid = beyond(current.price, prz.invalidPrice, prz.direction);
        if (!(brokeB || reachedTrigger) || invalid) continue;
        result.push({ kind, direction: prz.direction, points, current, prz });
    }
    return result;
}
