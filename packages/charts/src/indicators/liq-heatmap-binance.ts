// Likidasyon haritasi icin tarayici tarafi Binance USDT-M veri kaynagi (liqremote.py portu).
// fapi REST CORS'a izin verir; 5m mum + 5m OI (openInterestHist, yalnizca son 30 gun) dogrudan cekilir,
// sembol basina bellek ici ham onbellekte tutulur (artimli kuyruk/bas cekimi, 30 gune kirpilir),
// hizalama sunucuyla ayni kurallarla yapilir ve model yerelde hesaplanir.
//
// Hatalar `status` (+ `detail`) alanli Error'dur (indikatorun beklentisi):
//   404 unsupported_symbol | period_unavailable | no_data;
//   503 rate_limited (Binance 429/418/403, IP-wide; NOT an auth error), 503 cooldown (symbol cooling down),
//   503 upstream_unavailable | incomplete; 499 aborted (caller cancelled).

import type { LiqHeatmapQuery, LiqHeatmapResponse } from './liq-heatmap-indicator';
import { BAR_MS, PERIODS, alignInputs, buildHeatmapPayload } from './liq-heatmap-model';

const BASE = 'https://fapi.binance.com';
const KLINE_LIMIT = 1500;
const OI_LIMIT = 500;
const STEP_MS = 5 * 60 * 1000;
const DAY_MS = 86_400_000;
const RAW_DAYS = 30;
// Sunucuda 10 dk; burada KASITLI olarak 30 dk'ya gevsetildi (tarayici saati guvenilmez: saat kaymasi
// 30 gunluk OI tabanini asarsa istek 400 alir). Sunucu paritesi bu deger icin bilincli olarak yok.
const RAW_MARGIN_MS = 30 * 60 * 1000;
/** 1m periyodu tam 30 gun: baslangic en fazla bu kadar ileri kaydirilir (payload "start" kaymis deger).
 *  Marj + 15 dk: canli 1m istegi (start = simdi-30g) yine sunulur, hafif kaymis. */
const START_SHIFT_TOL_MS = RAW_MARGIN_MS + 15 * 60 * 1000;
const GLOBAL_COOLDOWN_MS = 300_000;
const SYMBOL_COOLDOWN_MS = 60_000;
const RAW_CACHE_MAX = 8;
const OI_HEAD_MS = 3600 * 1000;
/** Canli: ham serinin kuyrugu bu kadar eskiyse tazelenir (indikatorun 60 sn poll'u her seferinde yeniler). */
const FRESH_MS = 20_000;
const REQUEST_TIMEOUT_MS = 10_000;
const EXCHANGE_INFO_TIMEOUT_MS = 15_000;
const EXCHANGE_INFO_TTL = 3600_000;
const EXCHANGE_INFO_FAIL_TTL = 60_000;
const OI_CONCURRENCY = 4;
const RETRY_SLEEP_MS = 500;
const NO_DATA_STATUSES = new Set([400, 404, 422]);
const SYMBOL_RE = /^[A-Z0-9]{2,20}$/;
const CONTRACT_TYPES = new Set(['PERPETUAL', 'TRADIFI_PERPETUAL']);

export class LiqBinanceError extends Error {
    status: number;
    detail?: string;
    constructor(status: number, detail?: string, msg?: string) {
        super(msg ?? `liq-heatmap ${status}${detail ? ' ' + detail : ''}`);
        this.name = 'LiqBinanceError';
        this.status = status;
        this.detail = detail;
    }
}

/** Test/izleme: Binance istek sayaci ve degistirilebilir fetch. */
export const liqBinanceStats = { requests: 0 };
let fetchImpl: typeof fetch | null = null;
export function setLiqBinanceFetch(f: typeof fetch | null): void { fetchImpl = f; }

// --- cooldown -------------------------------------------------------------------
// 429/418/403 IP-genelidir: tum semboller icin 300 sn. 5xx / ag / timeout: sembol basina 60 sn.
// Soguma sirasinda ag'a hic gidilmez (replay adimlari ban'a tirmandirmasin); kapsayan sicak onbellek yine hizmet verir.
let globalCooldownUntil = 0;
const symCooldownUntil = new Map<string, number>();
let nowFn: () => number = () => Date.now();
export function setLiqBinanceClock(f: (() => number) | null): void { nowFn = f ?? (() => Date.now()); }

function cooldownError(code: string | null): LiqBinanceError | null {
    const now = nowFn();
    if (now < globalCooldownUntil) return new LiqBinanceError(503, 'rate_limited', 'Binance rate limit cooldown');
    if (code) {
        const u = symCooldownUntil.get(code);
        if (u !== undefined) {
            if (now < u) return new LiqBinanceError(503, 'cooldown', `${code} cooldown`);
            symCooldownUntil.delete(code);
        }
    }
    return null;
}

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new LiqBinanceError(499, 'aborted', 'aborted');
}

export function rawFloorMs(nowMs: number): number {
    return nowMs - RAW_DAYS * DAY_MS + RAW_MARGIN_MS;
}

/** Baslangic (ms) ya da null (period_unavailable). */
export function effectiveStart(periodSecs: number, endMs: number, nowMs: number): number | null {
    const start = endMs - periodSecs * 1000;
    const floor = rawFloorMs(nowMs);
    if (start >= floor) return start;
    if (floor - start <= START_SHIFT_TOL_MS) return floor;
    return null;
}

// --- HTTP ---------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

async function httpGet(url: string, params: Record<string, string | number> | null, timeoutMs: number, retries: number, signal?: AbortSignal): Promise<any> {
    const qs = params ? '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : '';
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        throwIfAborted(signal);
        const cd = cooldownError(null);
        if (cd) throw cd;
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = setTimeout(() => ctl?.abort(), timeoutMs);
        const onAbort = (): void => ctl?.abort();
        signal?.addEventListener('abort', onAbort);
        try {
            liqBinanceStats.requests++;
            const resp = await (fetchImpl ?? fetch)(BASE + url + qs, ctl ? { signal: ctl.signal } : undefined);
            const st = resp.status;
            if (st === 429 || st === 418 || st === 403) {
                globalCooldownUntil = nowFn() + GLOBAL_COOLDOWN_MS;
                throw new LiqBinanceError(503, 'rate_limited', `HTTP ${st} ${url}`);
            }
            if (NO_DATA_STATUSES.has(st)) throw new LiqBinanceError(404, 'no_data', `HTTP ${st} ${url}`);
            if (st >= 500) { lastErr = new LiqBinanceError(503, 'upstream_unavailable', `HTTP ${st} ${url}`); }
            else if (!resp.ok) throw new LiqBinanceError(503, 'upstream_unavailable', `HTTP ${st} ${url}`);
            else return await resp.json();
        } catch (e) {
            if (signal?.aborted) throw new LiqBinanceError(499, 'aborted', 'aborted');
            if (e instanceof LiqBinanceError && (e.status !== 503 || e.detail === 'rate_limited')) throw e;
            lastErr = e instanceof LiqBinanceError ? e : new LiqBinanceError(503, 'upstream_unavailable', `network/timeout ${url}`);
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        }
        if (attempt < retries) await sleep(RETRY_SLEEP_MS);
    }
    throw lastErr instanceof LiqBinanceError ? lastErr : new LiqBinanceError(503, 'upstream_unavailable');
}

/** p'yi bekler; signal iptal olursa p'yi beklemeden 499 ile reddeder. */
function waitFor<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return p;
    if (signal.aborted) return Promise.reject(new LiqBinanceError(499, 'aborted', 'aborted'));
    return new Promise<T>((resolve, reject) => {
        const on = (): void => reject(new LiqBinanceError(499, 'aborted', 'aborted'));
        signal.addEventListener('abort', on, { once: true });
        p.then(v => { signal.removeEventListener('abort', on); resolve(v); },
               e => { signal.removeEventListener('abort', on); reject(e); });
    });
}

// --- sembol dogrulama -----------------------------------------------------------

let exSyms: Set<string> | null = null;
let exAt = 0;
let exFailAt = 0;
let exInflight: Promise<Set<string>> | null = null;

async function exchangeSymbols(signal?: AbortSignal): Promise<Set<string>> {
    const now = Date.now();
    if (exSyms && now - exAt < EXCHANGE_INFO_TTL) return exSyms;
    // TTL doldu ama yenileme basarisiz / sogumada: bayat kumeyi hizmet et
    if (exFailAt && now - exFailAt < EXCHANGE_INFO_FAIL_TTL) {
        if (exSyms) return exSyms;
        throw new LiqBinanceError(503, 'upstream_unavailable', 'exchangeInfo (negatif onbellek)');
    }
    const cd = cooldownError(null);
    if (cd) { if (exSyms) return exSyms; throw cd; }
    if (!exInflight) {
        exInflight = (async () => {
            try {
                const j = await httpGet('/fapi/v1/exchangeInfo', null, EXCHANGE_INFO_TIMEOUT_MS, 0);
                const s = new Set<string>();
                for (const x of j.symbols ?? []) {
                    if (x.status === 'TRADING' && x.quoteAsset === 'USDT' && CONTRACT_TYPES.has(x.contractType)) s.add(x.symbol);
                }
                exSyms = s; exAt = Date.now(); exFailAt = 0;
                return s;
            } catch (e) {
                exFailAt = Date.now(); // 60 sn negatif onbellek
                if (exSyms) return exSyms;
                throw e;
            } finally {
                exInflight = null;
            }
        })();
    }
    return waitFor(exInflight, signal);
}

export async function isBinancePerp(code: string, signal?: AbortSignal): Promise<boolean> {
    if (!SYMBOL_RE.test(code)) return false;
    return (await exchangeSymbols(signal)).has(code);
}

// --- ham seri -------------------------------------------------------------------

interface Raw {
    kt: Float64Array; kh: Float64Array; kl: Float64Array; kc: Float64Array;
    /** taker alis payi = kline[9]/kline[5] (hacim 0 -> 0.5) */
    ks: Float64Array;
    ot: Float64Array; ov: Float64Array;
    covStart: number; covEnd: number;
}

type KRow = [number, number, number, number, number];
type ORow = [number, number];

async function fetchKlines(code: string, startMs: number, endMs: number | null, signal?: AbortSignal): Promise<KRow[]> {
    const out: KRow[] = [];
    let cursor = startMs;
    const stop = endMs ?? Date.now();
    for (;;) {
        const params: Record<string, string | number> = { symbol: code, interval: '5m', limit: KLINE_LIMIT, startTime: cursor };
        if (endMs !== null) params.endTime = endMs;
        const rows: any[] = await httpGet('/fapi/v1/klines', params, REQUEST_TIMEOUT_MS, 1, signal);
        for (const r of rows) {
            // taker alis payi: kline[9] (taker buy base vol) / kline[5] (volume); hacim 0 -> 0.5 (sunucu liqremote ile ayni)
            const vol = parseFloat(r[5]);
            const tbv = parseFloat(r[9]);
            out.push([Number(r[0]), parseFloat(r[2]), parseFloat(r[3]), parseFloat(r[4]), vol > 0 ? tbv / vol : 0.5]);
        }
        if (rows.length < KLINE_LIMIT) break;
        cursor = Number(rows[rows.length - 1][0]) + BAR_MS;
        if (cursor > stop) break;
    }
    return out;
}

/** OI: REST "timestamp" bucket SONUNU etiketler; arsiv konvansiyonu icin -5 dk kaydirilir. Pencere <= 500*5dk. */
async function fetchOi(code: string, startMs: number, endMs: number, signal?: AbortSignal): Promise<ORow[]> {
    const span = OI_LIMIT * STEP_MS;
    const wins: Array<[number, number]> = [];
    const end = endMs + STEP_MS;
    for (let cursor = startMs + STEP_MS; cursor <= end;) {
        const winEnd = Math.min(end, cursor + span - 1);
        wins.push([cursor, winEnd]);
        cursor = winEnd + 1;
    }
    const results: ORow[][] = new Array(wins.length);
    let next = 0;
    const worker = async (): Promise<void> => {
        while (next < wins.length) {
            throwIfAborted(signal);
            const i = next++;
            const data: any[] = await httpGet('/futures/data/openInterestHist', {
                symbol: code, period: '5m', limit: OI_LIMIT, startTime: wins[i][0], endTime: wins[i][1],
            }, REQUEST_TIMEOUT_MS, 1, signal);
            results[i] = (data ?? []).map((d): ORow => [Number(d.timestamp) - STEP_MS, parseFloat(d.sumOpenInterestValue)]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(OI_CONCURRENCY, wins.length) }, worker));
    const m = new Map<number, number>();
    for (const r of results) for (const [t, v] of r) m.set(t, v);
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
}

/** Eski diziler + yeni satirlar (ayni t'de yeni kazanir), floor'dan eskisi kirpilir. */
function mergeCols(oldT: Float64Array, oldCols: Float64Array[], rows: number[][], floor: number): { t: Float64Array; cols: Float64Array[] } {
    const nc = oldCols.length;
    // Hizli yol: yeni satirlar kesin artan ve eski serinin ortasina/sonuna biniyor (kuyruk cekimi, soguk baslangic)
    let asc = true;
    for (let i = 1; i < rows.length; i++) if (!(rows[i][0] > rows[i - 1][0])) { asc = false; break; }
    if (asc && (oldT.length === 0 || (rows.length > 0 && rows[0][0] > oldT[0]))) {
        let lo = 0;
        while (lo < oldT.length && oldT[lo] < floor) lo++;
        let cut = oldT.length;
        if (rows.length) { cut = lo; while (cut < oldT.length && oldT[cut] < rows[0][0]) cut++; }
        let r0 = 0;
        while (r0 < rows.length && rows[r0][0] < floor) r0++;
        const nr = rows.length - r0, no = cut - lo;
        const t = new Float64Array(no + nr);
        t.set(oldT.subarray(lo, cut), 0);
        for (let i = 0; i < nr; i++) t[no + i] = rows[r0 + i][0];
        const cols = oldCols.map((oc, j) => {
            const a = new Float64Array(no + nr);
            a.set(oc.subarray(lo, cut), 0);
            for (let i = 0; i < nr; i++) a[no + i] = rows[r0 + i][1 + j];
            return a;
        });
        return { t, cols };
    }
    const map = new Map<number, number[]>();
    for (let i = 0; i < oldT.length; i++) {
        if (oldT[i] < floor) continue;
        map.set(oldT[i], oldCols.map(c => c[i]));
    }
    for (const r of rows) if (r[0] >= floor) map.set(r[0], r.slice(1));
    const ts = Array.from(map.keys()).sort((a, b) => a - b);
    const t = Float64Array.from(ts);
    const cols = Array.from({ length: nc }, (_, j) => {
        const a = new Float64Array(ts.length);
        for (let i = 0; i < ts.length; i++) a[i] = map.get(ts[i])![j];
        return a;
    });
    return { t, cols };
}

function applyRows(raw: Raw | null, knew: KRow[], onew: ORow[], floor: number, covStart: number, covEnd: number): Raw {
    const z = new Float64Array(0);
    const r = raw ?? { kt: z, kh: z, kl: z, kc: z, ks: z, ot: z, ov: z, covStart: 0, covEnd: 0 };
    const k = mergeCols(r.kt, [r.kh, r.kl, r.kc, r.ks], knew, floor);
    const o = mergeCols(r.ot, [r.ov], onew, floor);
    return {
        kt: k.t, kh: k.cols[0], kl: k.cols[1], kc: k.cols[2], ks: k.cols[3], ot: o.t, ov: o.cols[0],
        covStart: Math.max(covStart, floor), covEnd,
    };
}

// Sembol basina ham seri; LRU (en fazla RAW_CACHE_MAX sembol).
const rawCache = new Map<string, Raw>();
function getRaw(code: string): Raw | undefined {
    const r = rawCache.get(code);
    if (r) { rawCache.delete(code); rawCache.set(code, r); }
    return r;
}
function setRaw(code: string, raw: Raw): void {
    rawCache.delete(code);
    rawCache.set(code, raw);
    while (rawCache.size > RAW_CACHE_MAX) rawCache.delete(rawCache.keys().next().value as string);
}

interface Inflight { promise: Promise<void>; ctl: AbortController; waiters: number }
const inflight = new Map<string, Inflight>();

/** stale=true: tazelik aranmaz (sogumada / dolum sonrasi); yalniz bas + son kapsami. */
function covers(raw: Raw | undefined, need: number, endMs: number, live: boolean, now: number, stale: boolean): raw is Raw {
    if (!raw || !(need >= raw.covStart) || !(raw.covEnd > 0)) return false;
    if (live) return stale || now - raw.covEnd <= FRESH_MS;
    return endMs <= raw.covEnd;
}

async function fillRaw(code: string, need: number, endMs: number, live: boolean, now: number, floor: number, signal: AbortSignal): Promise<void> {
    let raw = getRaw(code) ?? null;
    if (!raw || (!raw.kt.length && !raw.ot.length && !raw.covEnd)) {
        // soguk: [need, simdi] araligi (mum ve OI paralel)
        const [knew, onew] = await Promise.all([fetchKlines(code, need, null, signal), fetchOi(code, need, now, signal)]);
        throwIfAborted(signal);
        setRaw(code, applyRows(null, knew, onew, floor, need, now));
        return;
    }
    // kuyruk
    const ks = raw.kt.length ? raw.kt[raw.kt.length - 1] : Math.max(raw.covStart, raw.covEnd - 2 * BAR_MS);
    const os = raw.ot.length ? raw.ot[raw.ot.length - 1] : ks;
    const covEnd0 = raw.covEnd;
    const wantTail = live ? now - covEnd0 > FRESH_MS : endMs > covEnd0;
    const target = Math.max(need, floor);
    const wantHead = raw.covStart > target;
    const head0 = raw.covStart;
    const [kt, ot, kh, oh] = await Promise.all([
        wantTail ? fetchKlines(code, ks, null, signal) : Promise.resolve([] as KRow[]),
        wantTail ? fetchOi(code, os, now, signal) : Promise.resolve([] as ORow[]),
        wantHead ? fetchKlines(code, target, head0 - 1, signal) : Promise.resolve([] as KRow[]),
        wantHead ? fetchOi(code, target, head0, signal) : Promise.resolve([] as ORow[]),
    ]);
    throwIfAborted(signal);
    // sirasi arada baska yazan olmus olabilir: en guncel ham seri uzerine uygula
    const cur = getRaw(code) ?? raw;
    setRaw(code, applyRows(cur, [...kh, ...kt], [...oh, ...ot], floor, wantHead ? target : cur.covStart, wantTail ? Math.max(now, cur.covEnd) : cur.covEnd));
}

/**
 * Ham seriyi [need, end] icin hazir eder; esli yuklemeler sembol basina tekillestirilir. Her bekleyen
 * kendi `signal`'ini verir; yukleme yalnizca hic bekleyen kalmayinca iptal edilir.
 */
async function ensureRaw(code: string, need: number, endMs: number, live: boolean, floor: number, signal?: AbortSignal): Promise<Raw> {
    for (let iter = 0; iter < 3; iter++) {
        throwIfAborted(signal);
        const now = Date.now();
        const cur = getRaw(code);
        const cd = cooldownError(code);
        // sogumada: kapsayan (bayat olabilir) sicak onbellek hizmet verir, aksi halde ag'a gitmeden hata
        if (covers(cur, need, endMs, live, now, !!cd)) return cur;
        if (cd) throw cd;
        let e = inflight.get(code);
        if (e && e.ctl.signal.aborted) { inflight.delete(code); e = undefined; }
        if (!e) {
            const ctl = new AbortController();
            const entry: Inflight = { promise: null as unknown as Promise<void>, ctl, waiters: 0 };
            entry.promise = fillRaw(code, need, endMs, live, now, floor, ctl.signal).finally(() => {
                if (inflight.get(code) === entry) inflight.delete(code);
            });
            entry.promise.catch(() => { /* hata bekleyenlere iletilir */ });
            inflight.set(code, entry);
            e = entry;
        }
        const entry = e;
        entry.waiters++;
        try {
            await waitFor(entry.promise, signal);
        } finally {
            entry.waiters--;
            if (entry.waiters === 0 && signal?.aborted) entry.ctl.abort();
        }
        const after = getRaw(code);
        if (covers(after, need, endMs, live, Date.now(), true)) return after;
    }
    throw new LiqBinanceError(503, 'incomplete', 'ham seri istenen araligi kapsamiyor');
}

/** Ham seriden girdiler (load_inputs_remote): sadece onbellek okur. */
export function sliceInputs(raw: Raw, startMs: number, endMs: number, live: boolean) {
    const { kt, kh, kl, kc, ks, ot, ov } = raw;
    const kIdx: number[] = [];
    for (let i = 0; i < kt.length; i++) {
        if (kt[i] < startMs - BAR_MS || kt[i] >= endMs) continue;
        if (!live && !(kt[i] + BAR_MS <= endMs)) continue;
        kIdx.push(i);
    }
    const oIdx: number[] = [];
    for (let i = 0; i < ot.length; i++) {
        if (ot[i] >= startMs - BAR_MS - OI_HEAD_MS && ot[i] < endMs) oIdx.push(i);
    }
    const pick = (a: Float64Array, ix: number[]): Float64Array => {
        const o = new Float64Array(ix.length);
        for (let i = 0; i < ix.length; i++) o[i] = a[ix[i]];
        return o;
    };
    return alignInputs(pick(kt, kIdx), pick(kh, kIdx), pick(kl, kIdx), pick(kc, kIdx), pick(ot, oIdx), pick(ov, oIdx), pick(ks, kIdx));
}

/**
 * Yerel likidasyon haritasi: LiqHeatmapProvider ile ayni sozlesme. `query.end` = replay imleci (ms) ya da canli.
 * Hatalar: LiqBinanceError (status/detail).
 */
export async function computeLiqHeatmapLocal(query: LiqHeatmapQuery, opts?: { signal?: AbortSignal }): Promise<LiqHeatmapResponse> {
    const signal = opts?.signal;
    const code = query.symbol.trim().toUpperCase().replace(/\.P$/, '');
    if (!SYMBOL_RE.test(code) || !code.endsWith('USDT')) throw new LiqBinanceError(404, 'unsupported_symbol');
    const per = PERIODS[query.period];
    if (!per) throw new LiqBinanceError(400, 'bad_period');
    if (!(await isBinancePerp(code, signal))) throw new LiqBinanceError(404, 'unsupported_symbol');
    const live = query.end === undefined;
    const now = Date.now();
    const endMs = live ? now : Math.floor(query.end! / BAR_MS) * BAR_MS;
    const startMs = effectiveStart(per[0], endMs, now);
    if (startMs === null) throw new LiqBinanceError(404, 'period_unavailable');
    const floor = rawFloorMs(now);
    const need = Math.max(startMs - BAR_MS - OI_HEAD_MS, floor);
    let raw: Raw;
    try {
        raw = await ensureRaw(code, need, endMs, live, floor, signal);
    } catch (e) {
        if (e instanceof LiqBinanceError) {
            if (e.status === 404) rawCache.delete(code);
            // 5xx / ag / timeout: sembol basina 60 sn soguma (429/418/403 zaten global soguma koydu)
            else if (e.status === 503 && e.detail === 'upstream_unavailable') symCooldownUntil.set(code, nowFn() + SYMBOL_COOLDOWN_MS);
        }
        throw e;
    }
    const inputs = sliceInputs(raw, startMs, endMs, live);
    if (!inputs) throw new LiqBinanceError(404, 'no_data');
    return buildHeatmapPayload(inputs, query.period, startMs, endMs, live, code, query.split ?? 'equal');
}

/** Test: onbellekleri temizler. */
export function resetLiqBinanceCaches(): void {
    rawCache.clear(); inflight.clear(); exSyms = null; exAt = 0; exFailAt = 0; exInflight = null;
    globalCooldownUntil = 0; symCooldownUntil.clear();
}
