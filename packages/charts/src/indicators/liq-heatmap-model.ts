// Likidasyon haritasi modeli: EvoTrdading/backend/indicators/liqheatmap.py'nin birebir TypeScript portu.
// Saf fonksiyonlar, DOM yok. numpy anlamlari korunur: floor-bolme (npy_divmod), rint (yariya cift),
// searchsorted(side='right'), pairwise toplama (toplama sirasi), np.add.at (sirali ekleme).

import type { LiqHeatmapBin, LiqHeatmapResponse } from './liq-heatmap-indicator';

export const BAR_MS = 5 * 60 * 1000;

/** kaldirac -> yeni acilan notional payi (toplama 1'e normalize edilir); sira Python dict sirasi.
 *  Kalibre (liqcalib): ~3.5 ay gerceklesen Binance BTC/ETH likidasyonu (Tem-Kas 2026), 1h Spearman 0.72 -> 0.85
 *  (held-out). 3x/5x uzak katmanlar (%20) veriyle tanimlanamaz, uzak bant gorunurlugu icin tutuldu;
 *  mmr fitlenmis bir mesafe parametresi gibi davranir. Rapor: liqcalib/calib/report.md */
export const LEV_TIERS: ReadonlyArray<readonly [number, number]> = [
    [33, 0.456], [50, 0.112], [75, 0.168], [100, 0.064], [5, 0.163], [3, 0.037],
];
export const MMR = 0.0075;
export const LONG_SHARE = 0.5;
export const GRID_PAD = 0.25;
export const BIN_PCT = 0.00065;

/** periyot -> [sure sn, paket sn] */
export const PERIODS: Record<string, readonly [number, number]> = {
    '12h': [12 * 3600, 300],
    '24h': [24 * 3600, 300],
    '3d': [3 * 86400, 900],
    '1w': [7 * 86400, 1800],
    '2w': [14 * 86400, 3600],
    '1m': [30 * 86400, 7200],
    '3m': [90 * 86400, 21600],
};

export interface LiqModelResult {
    lo: number;
    binsz: number;
    nb: number;
    /** paket baslangiclari (ms) */
    bucketStarts: Float64Array;
    /** [paket x kutu] satir-oncelikli duz matris, USD */
    L: Float64Array;
    S: Float64Array;
    nbk: number;
}

export interface AlignedInputs {
    t: Float64Array;
    h: Float64Array;
    l: Float64Array;
    c: Float64Array;
    oi: Float64Array;
    oiLast: number;
    /** bar basina taker alis payi (0..1) ya da yok (esit bolme) */
    bs?: Float64Array;
}

/** Long/short ayrimi: 'equal' = 50/50 (varsayilan), 'taker' = bar taker alis payina gore. */
export type LiqSideSplit = 'taker' | 'equal';

/** pct*fiyat'a log-uzayda en yakin 1/2/5 x 10^k adimi. */
export function niceBinSize(medianPrice: number, pct: number = BIN_PCT): number {
    const raw = Math.max(medianPrice * pct, 1e-9);
    const e = Math.floor(Math.log10(raw));
    let best = 0, bestD = Infinity;
    for (let k = e - 1; k <= e + 1; k++) {
        const p = Number(`1e${k}`); // 10.0 ** k (tam, Math.pow degil)
        for (const m of [1, 2, 5]) {
            const c = m * p;
            const d = Math.abs(Math.log(c / raw));
            if (d < bestD) { bestD = d; best = c; }
        }
    }
    return best;
}

/** numpy float64 floor_divide (npy_divmod): a // b. */
function npyFloorDiv(a: number, b: number): number {
    let mod = a % b;
    let div = (a - mod) / b;
    if (mod !== 0) {
        if ((b < 0) !== (mod < 0)) { div -= 1.0; }
    }
    if (div !== 0) {
        let fd = Math.floor(div);
        if (div - fd > 0.5) fd += 1.0;
        return fd;
    }
    return 0;
}

/** numpy pairwise toplama (add.reduce, contiguous float64). */
function pairwiseSum(a: Float64Array, off: number, n: number): number {
    if (n < 8) {
        let res = 0;
        for (let i = 0; i < n; i++) res += a[off + i];
        return res;
    }
    if (n <= 128) {
        let r0 = a[off], r1 = a[off + 1], r2 = a[off + 2], r3 = a[off + 3];
        let r4 = a[off + 4], r5 = a[off + 5], r6 = a[off + 6], r7 = a[off + 7];
        let i = 8;
        for (; i < n - (n % 8); i += 8) {
            r0 += a[off + i]; r1 += a[off + i + 1]; r2 += a[off + i + 2]; r3 += a[off + i + 3];
            r4 += a[off + i + 4]; r5 += a[off + i + 5]; r6 += a[off + i + 6]; r7 += a[off + i + 7];
        }
        let res = ((r0 + r1) + (r2 + r3)) + ((r4 + r5) + (r6 + r7));
        for (; i < n; i++) res += a[off + i];
        return res;
    }
    let n2 = Math.floor(n / 2);
    n2 -= n2 % 8;
    return pairwiseSum(a, off, n2) + pairwiseSum(a, off + n2, n - n2);
}

/** 5m barlardan paket-bazli likidasyon matrisleri (liq_model). Indeks 0 yalniz dOI/izgara icin. */
export function liqModel(
    t: Float64Array, h: Float64Array, l: Float64Array, c: Float64Array, oiUsd: Float64Array,
    bucketMs: number, binsz: number, buyShare?: Float64Array | null,
): LiqModelResult {
    const n = t.length;
    const pad = GRID_PAD, mmr = MMR, longShare = LONG_SHARE;
    const nl = LEV_TIERS.length;
    const levs = new Float64Array(nl);
    const w = new Float64Array(nl);
    let wsum = 0;
    for (let i = 0; i < nl; i++) { levs[i] = LEV_TIERS[i][0]; w[i] = LEV_TIERS[i][1]; wsum += w[i]; }
    for (let i = 0; i < nl; i++) w[i] = w[i] / wsum;

    let lmin = Infinity, hmax = -Infinity;
    for (let i = 0; i < n; i++) { if (l[i] < lmin) lmin = l[i]; if (h[i] > hmax) hmax = h[i]; }
    const lo = Math.floor(lmin * (1 - pad) / binsz) * binsz;
    const hi = hmax * (1 + pad);
    const nb = Math.ceil((hi - lo) / binsz) + 1;

    const pb = (p: number): number => npyFloorDiv(p - lo, binsz);

    const typ = new Float64Array(n);
    for (let i = 0; i < n; i++) typ[i] = (h[i] + l[i] + c[i]) / 3;
    const doi = new Float64Array(n);
    for (let i = 1; i < n; i++) doi[i] = oiUsd[i] - oiUsd[i - 1];

    const bid = new Float64Array(n);
    for (let i = 0; i < n; i++) bid[i] = Math.floor(t[i] / bucketMs);
    const b0 = bid[1], b1 = bid[n - 1];
    const nbk = b1 - b0 + 1;
    const L = new Float64Array(nbk * nb), S = new Float64Array(nbk * nb);
    const curL = new Float64Array(nb), curS = new Float64Array(nb);
    const starts = new Float64Array(nbk);
    for (let j = 0; j < nbk; j++) starts[j] = (b0 + j) * bucketMs;

    const lq = new Float64Array(nl), sq = new Float64Array(nl);
    const dBuf = new Float64Array(n), dtBuf = new Float64Array(n);
    // taker modu: bar payi [0,1]'e kirpilir (NaN -> 0.5); dsBuf = d*s, dnBuf = d*(1-s)
    const dsBuf = buyShare ? new Float64Array(n) : null, dnBuf = buyShare ? new Float64Array(n) : null;
    let gi = 1; // bar gostergesi (indeks 0 haric); bid artmayan siralidir
    for (let j = 0; j < nbk; j++) {
        const gs = gi;
        while (gi < n && bid[gi] - b0 === j) gi++;
        const ge = gi; // [gs, ge)
        if (ge > gs) {
            let gl = Infinity, gh = -Infinity;
            for (let i = gs; i < ge; i++) { if (l[i] < gl) gl = l[i]; if (h[i] > gh) gh = h[i]; }
            const bl = pb(gl), bh = pb(gh);
            // long seviye >= paket dibi: gecildi
            for (let k = Math.max(bl, 0); k < nb; k++) curL[k] = 0;
            // short seviye <= paket tepesi: gecildi
            const sEnd = Math.min(Math.max(bh + 1, 0), nb);
            for (let k = 0; k < sEnd; k++) curS[k] = 0;
            // include_partial = True: her paket eklenir
            const m = ge - gs;
            for (let i = 0; i < m; i++) {
                const d = Math.max(doi[gs + i], 0.0);
                dBuf[i] = d;
                dtBuf[i] = d * typ[gs + i];
                if (buyShare) {
                    let s = buyShare[gs + i];
                    s = Number.isNaN(s) ? 0.5 : s < 0 ? 0 : s > 1 ? 1 : s;
                    dsBuf![i] = d * s;
                    dnBuf![i] = d * (1.0 - s);
                }
            }
            const acca = pairwiseSum(dBuf, 0, m);
            if (acca > 0) {
                const e = pairwiseSum(dtBuf, 0, m) / acca;
                for (let i = 0; i < nl; i++) {
                    lq[i] = pb(e * (1 - 1 / levs[i] + mmr));
                    sq[i] = pb(e * (1 + 1 / levs[i] - mmr));
                }
                let accL: number, accS: number;
                if (buyShare) {
                    accL = pairwiseSum(dsBuf!, 0, m); accS = pairwiseSum(dnBuf!, 0, m);
                } else {
                    accL = acca * longShare; accS = acca * (1 - longShare);
                }
                for (let i = 0; i < nl; i++) {
                    const q = lq[i];
                    if (q >= 0 && q < nb) curL[q] += accL * w[i];
                }
                for (let i = 0; i < nl; i++) {
                    const q = sq[i];
                    if (q >= 0 && q < nb) curS[q] += accS * w[i];
                }
            }
        }
        L.set(curL, j * nb);
        S.set(curS, j * nb);
    }
    return { lo, binsz, nb, bucketStarts: starts, L, S, nbk };
}

/** np.rint: yariya en yakin cifte. */
function rint(x: number): number {
    const f = Math.floor(x);
    const d = x - f;
    if (d < 0.5) return f;
    if (d > 0.5) return f + 1;
    return f % 2 === 0 ? f : f + 1;
}

/** M: [paket x kutu] USD -> [[kutu_idx, [[t0,t1,q],...]], ...] kutu artan (q=0 atilir, esit q'lar birlesir). */
export function encodeRuns(
    M: Float64Array, nbk: number, nb: number, starts: Float64Array, bucketMs: number,
    startMs: number, endMs: number, scale: number,
): Array<[number, Array<[number, number, number]>]> {
    const Q = new Int16Array(nbk * nb);
    if (scale > 0) {
        for (let i = 0; i < Q.length; i++) {
            const v = M[i] > 0 ? M[i] : 0; // clip(M, 0, None)
            Q[i] = rint(255 * Math.sqrt(v / scale));
        }
    }
    const t0s = new Float64Array(nbk), t1s = new Float64Array(nbk);
    for (let j = 0; j < nbk; j++) {
        t0s[j] = Math.max(starts[j], startMs);
        t1s[j] = Math.min(starts[j] + bucketMs, endMs);
    }
    t1s[nbk - 1] = endMs;
    const out: Array<[number, Array<[number, number, number]>]> = [];
    for (let b = 0; b < nb; b++) {
        let any = false;
        for (let j = 0; j < nbk; j++) if (Q[j * nb + b] !== 0) { any = true; break; }
        if (!any) continue;
        const runs: Array<[number, number, number]> = [];
        let s = 0;
        while (s < nbk) {
            const q = Q[s * nb + b];
            let e = s + 1;
            while (e < nbk && Q[e * nb + b] === q) e++;
            if (q > 0) runs.push([t0s[s], t1s[e - 1], q]);
            s = e;
        }
        if (runs.length) out.push([b, runs]);
    }
    return out;
}

/**
 * Bar dizilerini OI'ye hizalar: OI son bilinen degerle ileri doldurulur (searchsorted side='right' - 1),
 * ilk OI'den onceki barlar atilir. -> null yeterli veri yoksa.
 */
export function alignInputs(
    t: Float64Array, h: Float64Array, l: Float64Array, c: Float64Array, ot: Float64Array, ov: Float64Array,
    bs?: Float64Array | null,
): AlignedInputs | null {
    if (t.length < 3 || ot.length === 0) return null;
    const n = t.length;
    const ix = new Int32Array(n);
    let p = 0; // t artan: ot<=t sayisi
    let keep = 0;
    for (let i = 0; i < n; i++) {
        while (p < ot.length && ot[p] <= t[i]) p++;
        ix[i] = p - 1;
        if (p - 1 >= 0) keep++;
    }
    if (keep < 3) return null;
    const T = new Float64Array(keep), H = new Float64Array(keep), Lw = new Float64Array(keep);
    const C = new Float64Array(keep), OI = new Float64Array(keep);
    const BS = bs ? new Float64Array(keep) : null;
    let k = 0;
    for (let i = 0; i < n; i++) {
        if (ix[i] < 0) continue;
        T[k] = t[i]; H[k] = h[i]; Lw[k] = l[i]; C[k] = c[i]; OI[k] = ov[ix[i]];
        if (BS) BS[k] = bs![i];
        k++;
    }
    return { t: T, h: H, l: Lw, c: C, oi: OI, oiLast: ot[ot.length - 1], ...(BS ? { bs: BS } : {}) };
}

function median(a: Float64Array): number {
    const s = Float64Array.from(a).sort();
    const n = s.length;
    if (n % 2 === 1) return s[(n - 1) / 2];
    return (s[n / 2 - 1] + s[n / 2]) / 2;
}

/** Python round(x, 8) (yaklasik: toFixed tam ondalik acilimi yuvarlar). */
function round8(x: number): number {
    return Number(x.toFixed(8));
}

/** build_heatmap'in yuk olusturma kismi. `live` payload'i etkilemez (girdi secimi veri tarafinda yapilir). */
export function buildHeatmapPayload(
    inputs: AlignedInputs, period: string, startMs: number, endMs: number, _live: boolean, symbol = '',
    split: LiqSideSplit = 'equal',
): LiqHeatmapResponse {
    const [, bucketSec] = PERIODS[period];
    const bucketMs = bucketSec * 1000;
    const binsz = niceBinSize(median(inputs.c));
    const res = liqModel(inputs.t, inputs.h, inputs.l, inputs.c, inputs.oi, bucketMs, binsz, split === 'taker' ? inputs.bs : null);
    const { L, S, bucketStarts, lo, nb, nbk } = res;
    let scale = -Infinity;
    for (let i = 0; i < L.length; i++) { if (L[i] > scale) scale = L[i]; if (S[i] > scale) scale = S[i]; }
    const bins: LiqHeatmapBin[] = [];
    const sides: Array<['long' | 'short', Float64Array]> = [['long', L], ['short', S]];
    for (const [side, M] of sides) {
        for (const [b, runs] of encodeRuns(M, nbk, nb, bucketStarts, bucketMs, startMs, endMs, scale)) {
            bins.push({ p: round8(lo + b * binsz), side, runs });
        }
    }
    bins.sort((a, b) => (a.p - b.p) || (a.side < b.side ? -1 : a.side > b.side ? 1 : 0));
    let pmin = Infinity, pmax = -Infinity;
    for (const x of bins) { if (x.p < pmin) pmin = x.p; if (x.p > pmax) pmax = x.p; }
    return {
        symbol, period, bucket_sec: bucketSec, start: startMs, end: endMs,
        bin_size: binsz, scale,
        price_min: bins.length ? pmin : lo,
        price_max: bins.length ? pmax + binsz : lo + nb * binsz,
        bins, oi_last_time: inputs.oiLast,
    };
}
