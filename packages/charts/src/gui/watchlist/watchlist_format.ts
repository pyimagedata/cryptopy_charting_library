/**
 * Izleme listesi saf (DOM'suz) yardimcilari: sayi bicimleme, ondalik sabitleme, flas karari,
 * sutun gorunurlugu, siralama (bolum ici gorunum) ve logo/renk turetme. Node'da test edilebilir.
 */

import type { WatchlistItem } from './watchlist_model';

export type ColId = 'last' | 'chg' | 'chgPct' | 'vol';
export type SortCol = 'symbol' | ColId;
export type SortDir = 'asc' | 'desc';
export interface SortState {
    col: SortCol;
    dir: SortDir;
}
export interface ColumnVisibility {
    chg: boolean;
    chgPct: boolean;
    vol: boolean;
}

export const DEFAULT_COLUMNS: ColumnVisibility = { chg: true, chgPct: true, vol: false };

export interface RowLike {
    code: string;
    asset_class?: string;
    price: number;
    change: number | null;
    change_pct: number | null;
    volume: number;
}

// ---- Sutunlar ----

/** Sutun genislikleri (px); Sembol sutunu kalan alani alir. */
export const COL_WIDTH: Record<ColId, number> = { last: 76, chg: 62, chgPct: 62, vol: 58 };
/** Dar panelde gizleme sirasi: once Hacim, sonra Deg, en son Deg%. Son her zaman gorunur. */
const DROP_ORDER: (keyof ColumnVisibility)[] = ['vol', 'chg', 'chgPct'];
export const COL_ORDER: ColId[] = ['last', 'chg', 'chgPct', 'vol'];
const SYMBOL_MIN = 110;
const GAP = 6;
const SIDE_PADDING = 18 + 12;

/** Secili sutunlarin hepsini gostermek icin gereken panel genisligi. */
export function requiredWidth(vis: ColumnVisibility): number {
    let w = SYMBOL_MIN + SIDE_PADDING + COL_WIDTH.last + GAP;
    if (vis.chg) w += COL_WIDTH.chg + GAP;
    if (vis.chgPct) w += COL_WIDTH.chgPct + GAP;
    if (vis.vol) w += COL_WIDTH.vol + GAP;
    return w;
}

/** Kullanici secimi + panel genisligine gore gorunen sutunlar (siralamayi korur). */
export function effectiveColumns(vis: ColumnVisibility, width: number): ColId[] {
    const cur: ColumnVisibility = { ...vis };
    for (const c of DROP_ORDER) {
        if (requiredWidth(cur) <= width) break;
        cur[c] = false;
    }
    return COL_ORDER.filter((c) => c === 'last' || cur[c as keyof ColumnVisibility]);
}

export function gridTemplate(cols: ColId[]): string {
    return ['minmax(0,1fr)', ...cols.map((c) => `${COL_WIDTH[c]}px`)].join(' ');
}

// ---- Siralama ----

/** Tiklama dongusu: yok -> artan -> azalan -> yok (elle sira). */
export function nextSort(cur: SortState | null, col: SortCol): SortState | null {
    if (!cur || cur.col !== col) return { col, dir: 'asc' };
    if (cur.dir === 'asc') return { col, dir: 'desc' };
    return null;
}

function sortValue(r: RowLike, col: SortCol): number | string | null {
    switch (col) {
        case 'symbol':
            return r.code.toLowerCase();
        case 'last':
            return Number.isFinite(r.price) ? r.price : null;
        case 'chg': {
            const c = changeOf(r);
            return c === null ? null : c;
        }
        case 'chgPct':
            return r.change_pct === null || !Number.isFinite(r.change_pct) ? null : r.change_pct;
        case 'vol':
            return Number.isFinite(r.volume) && r.volume > 0 ? r.volume : null;
    }
}

/**
 * Siralamayi bolum ici gorunum olarak uygular: bolum basliklari yerinde kalir, iki baslik
 * arasindaki semboller sirlanir. Veri yok (null) degerler artan/azalan fark etmeksizin sonda.
 * Saklanan sira degismez (yeni dizi doner).
 */
export function applySort<T extends WatchlistItem>(items: readonly T[], rowOf: (key: string) => RowLike | undefined, sort: SortState | null): T[] {
    if (!sort) return items.slice();
    const out: T[] = [];
    let run: T[] = [];
    const flush = () => {
        const decorated = run.map((it, i) => ({ it, i, v: it.type === 'symbol' ? sortValueOf(rowOf(it.key), sort.col) : null }));
        decorated.sort((a, b) => {
            if (a.v === null && b.v === null) return a.i - b.i;
            if (a.v === null) return 1;
            if (b.v === null) return -1;
            let cmp = typeof a.v === 'string' ? a.v.localeCompare(b.v as string) : (a.v as number) - (b.v as number);
            if (sort.dir === 'desc') cmp = -cmp;
            return cmp || a.i - b.i;
        });
        for (const d of decorated) out.push(d.it);
        run = [];
    };
    for (const it of items) {
        if (it.type === 'section') {
            flush();
            out.push(it);
        } else run.push(it);
    }
    flush();
    return out;
}

function sortValueOf(r: RowLike | undefined, col: SortCol): number | string | null {
    return r ? sortValue(r, col) : null;
}

// ---- Sayilar ----

/** Fiyat buyuklugune (ve forex icin sinifa) gore ondalik sayisi. */
export function decimalsFor(price: number, assetClass?: string): number {
    const p = Math.abs(price);
    if (assetClass === 'forex') return p >= 20 ? 3 : 5;
    if (p >= 100) return 2;
    if (p >= 10) return 3;
    if (p >= 1) return 4;
    if (p >= 0.1) return 5;
    return 6;
}

/** Sembol basina ondalik sayisini ilk gecerli fiyattan sabitler (guncellemelerde oynamaz). */
export class DecimalsTracker {
    private readonly _map = new Map<string, number>();

    get(key: string, price: number, assetClass?: string): number {
        const known = this._map.get(key);
        if (known !== undefined) return known;
        const d = decimalsFor(price, assetClass);
        if (Number.isFinite(price) && price > 0) this._map.set(key, d);
        return d;
    }
}

export function formatNum(v: number, decimals: number): string {
    return v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatSigned(v: number, decimals: number): string {
    const s = formatNum(Math.abs(v), decimals);
    if (Number(Math.abs(v).toFixed(decimals)) === 0) return s;
    return `${v > 0 ? '+' : '-'}${s}`;
}

export function formatPct(v: number): string {
    const s = Math.abs(v).toFixed(2);
    if (Number(s) === 0) return `${s}%`;
    return `${v > 0 ? '+' : '-'}${s}%`;
}

export function formatVolume(v: number): string {
    if (!v || v <= 0) return '—';
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
    return v.toFixed(0);
}

/** Mutlak degisim: host verdiyse o, yoksa fiyat ve yuzdeden turetilir; ikisi de yoksa null. */
export function changeOf(r: RowLike): number | null {
    if (r.change !== null && Number.isFinite(r.change)) return r.change;
    if (r.change_pct !== null && Number.isFinite(r.change_pct) && Number.isFinite(r.price) && r.change_pct > -100) {
        return r.price - r.price / (1 + r.change_pct / 100);
    }
    return null;
}

export type Trend = 'up' | 'down' | 'flat' | 'none';

/** Gosterilen basamaga yuvarlanmis degere gore renk yonu (0.00 -> flat). */
export function trendOf(v: number | null, decimals: number): Trend {
    if (v === null || !Number.isFinite(v)) return 'none';
    const r = Number(v.toFixed(decimals));
    return r > 0 ? 'up' : r < 0 ? 'down' : 'flat';
}

/** Iki yoklama arasinda Son degisti mi? Gosterilen basamakta ayni ise flas yok. */
export function flashDirection(prev: number | undefined, next: number, decimals: number): 'up' | 'down' | null {
    if (prev === undefined || !Number.isFinite(prev) || !Number.isFinite(next)) return null;
    if (prev.toFixed(decimals) === next.toFixed(decimals)) return null;
    return next > prev ? 'up' : 'down';
}

// ---- Logo / renk ----

const QUOTES = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'USD', 'EUR', 'TRY', 'GBP', 'JPY', 'BTC', 'ETH', 'BNB'];

export function splitPair(code: string, assetClass?: string): { base: string; quote: string } {
    const raw = code.toUpperCase();
    const sep = raw.split(/[/\-_]/).filter(Boolean);
    if (sep.length === 2) return { base: sep[0], quote: sep[1] };
    if (assetClass === 'forex' && /^[A-Z]{6}$/.test(raw)) return { base: raw.slice(0, 3), quote: raw.slice(3) };
    for (const q of QUOTES) {
        if (raw.length > q.length + 1 && raw.endsWith(q)) return { base: raw.slice(0, -q.length), quote: q };
    }
    return { base: raw, quote: '' };
}

export function hashHue(text: string): number {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    return h % 360;
}

export interface LogoInfo {
    parts: { letter: string; color: string }[];
}

export function logoInfo(code: string, assetClass?: string): LogoInfo {
    const { base, quote } = splitPair(code, assetClass);
    const part = (s: string) => ({ letter: (s.match(/[A-Z0-9]/)?.[0] ?? '?'), color: `hsl(${hashHue(s)},52%,42%)` });
    if (assetClass === 'forex' && quote) return { parts: [part(base), part(quote)] };
    return { parts: [part(base)] };
}

// ---- Zaman ----

/** "x sn once" / "x dk once" / yerel saat; ayrisamazsa null. */
export function relativeTime(updatedAt: string | undefined, nowMs: number): string | null {
    if (!updatedAt) return null;
    const t = Date.parse(updatedAt);
    if (!Number.isFinite(t)) return null;
    const s = Math.max(0, Math.round((nowMs - t) / 1000));
    if (s < 60) return `${s} sn önce`;
    if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
    const d = new Date(t);
    return nowMs - t < 86400000 ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}
