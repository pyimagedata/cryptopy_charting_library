/**
 * Symbol search model (DOM-free, node-testable): symbol types, indexing,
 * query parsing ("EXCHANGE:SYM"), filtering, ranking, highlight ranges,
 * sources, recents and persisted preferences.
 */

import { displaySymbol, exchangeAlias } from '../../helpers/display-aliases';

// ============================================================================
// Types
// ============================================================================

export type SymbolType = 'all' | 'stocks' | 'funds' | 'futures' | 'forex' | 'crypto' | 'indices' | 'bonds' | 'economy' | 'options' | 'cfd';

/** Crypto market kind (per-tab "type" filter on the Crypto tab) */
export type SymbolMarket = 'spot' | 'swap' | 'futures';

export interface SymbolInfo {
    symbol: string;
    full_name: string;
    description: string;
    exchange: string;
    type: SymbolType;
    logo_url?: string;
    logo_color?: string;
    country?: string;
    sector?: string;
    provider?: string;  // 'binance', 'dxfeed', etc.
    /** Optional: category used by the search UI tabs (falls back to `type`) */
    category?: SymbolType;
    /** Optional: spot / swap (perpetual) / futures */
    market?: SymbolMarket;
}

/** Selectable categories in TradingView order (only those with data are shown) */
export const CATEGORY_ORDER: SymbolType[] = ['stocks', 'funds', 'futures', 'forex', 'crypto', 'cfd', 'indices', 'bonds', 'economy', 'options'];

export const RECENTS_MAX = 30;

/** Exchange priority (lower = more liquid / preferred) */
const EXCHANGE_PRIORITY: string[] = [
    'BINANCE', 'BINANCE-FUTURES', 'BYBIT', 'BYBIT-FUTURES', 'OKX', 'OKX-FUTURES',
    'FXCM', 'FOREXCOM', 'OANDA', 'COMEX',
];

/** Crypto majors, used to order the default (empty query) list */
const MAJOR_BASES: string[] = [
    'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'TRX', 'AVAX', 'LINK', 'TON', 'DOT', 'MATIC', 'LTC', 'BCH', 'SHIB', 'UNI', 'ATOM', 'NEAR', 'APT',
];

/** Display names for known sources (others use the display alias or the code) */
const SOURCE_NAMES: Record<string, string> = {
    BINANCE: 'Binance',
    BYBIT: 'Bybit',
    OKX: 'OKX',
    FXCM: 'FXCM',
    FOREXCOM: 'FOREX.com',
    OANDA: 'OANDA',
    COMEX: 'COMEX',
};

const SOURCE_DESCRIPTIONS: Record<string, string> = {
    BINANCE: 'Binance',
    BYBIT: 'Bybit',
    OKX: 'OKX',
    FXCM: 'FXCM',
    FOREXCOM: 'FOREX.com',
    OANDA: 'OANDA',
    COMEX: 'COMEX - Commodity Exchange',
};

const FUTURES_EXCHANGES = new Set(['COMEX', 'CME', 'NYMEX', 'CBOT', 'ICEUS', 'ICEEUR']);

// ============================================================================
// Classification
// ============================================================================

/** Base source of an exchange code: BINANCE-FUTURES -> BINANCE */
export function sourceOf(exchange: string): string {
    return (exchange || '').toUpperCase().replace(/-(FUTURES|SWAP|PERP)$/, '');
}

export function isFuturesExchange(exchange: string): boolean {
    return FUTURES_EXCHANGES.has((exchange || '').toUpperCase());
}

export function categoryOf(info: SymbolInfo): SymbolType {
    if (info.category && info.category !== 'all') return info.category;
    if (info.type && info.type !== 'all') return info.type;
    return 'forex';
}

export function marketOf(info: SymbolInfo, category: SymbolType): SymbolMarket | null {
    if (info.market) return info.market;
    if (category === 'crypto') {
        const ex = (info.exchange || '').toUpperCase();
        if (/-(FUTURES|SWAP|PERP)$/.test(ex) || /-SWAP$/i.test(info.symbol)) return 'swap';
        return 'spot';
    }
    if (category === 'futures') return 'futures';
    return null;
}

// ============================================================================
// Indexing
// ============================================================================

export interface IndexedSymbol {
    info: SymbolInfo;
    /** Unique key: EXCHANGE:SYMBOL */
    id: string;
    category: SymbolType;
    market: SymbolMarket | null;
    source: string;
    /** Displayed ticker (display alias applied) */
    ticker: string;
    /** Displayed description line */
    description: string;
    tickerLower: string;
    rawLower: string;
    tickerNorm: string;
    rawNorm: string;
    descLower: string;
    descNorm: string;
    exPrio: number;
    majorIdx: number;
}

const SEP_RE = /[\s\-_/.:]+/g;

export function normalizeKey(s: string): string {
    return s.toLowerCase().replace(SEP_RE, '');
}

export function symbolId(info: { symbol: string; exchange: string }): string {
    return `${info.exchange}:${info.symbol}`;
}

export function exchangePriority(exchange: string): number {
    const i = EXCHANGE_PRIORITY.indexOf((exchange || '').toUpperCase());
    return i < 0 ? EXCHANGE_PRIORITY.length : i;
}

export function indexSymbol(info: SymbolInfo): IndexedSymbol {
    const category = categoryOf(info);
    const ticker = displaySymbol(info.symbol);
    const description = info.full_name || info.description || '';
    const descAll = `${info.description || ''} ${info.full_name || ''}`;
    const rawLower = info.symbol.toLowerCase();
    const base = (info.description || '').split(/[\s/]/)[0].toUpperCase();
    const majorIdx = category === 'crypto' ? MAJOR_BASES.indexOf(base) : -1;
    return {
        info,
        id: symbolId(info),
        category,
        market: marketOf(info, category),
        source: sourceOf(info.exchange),
        ticker,
        description,
        tickerLower: ticker.toLowerCase(),
        rawLower,
        tickerNorm: normalizeKey(ticker),
        rawNorm: normalizeKey(info.symbol),
        descLower: descAll.toLowerCase(),
        descNorm: normalizeKey(descAll),
        exPrio: exchangePriority(info.exchange),
        majorIdx: majorIdx < 0 ? 999 : majorIdx,
    };
}

export function indexSymbols(infos: SymbolInfo[]): IndexedSymbol[] {
    const out: IndexedSymbol[] = new Array(infos.length);
    for (let i = 0; i < infos.length; i++) out[i] = indexSymbol(infos[i]);
    return out;
}

/** Categories present in the data, in TradingView order */
export function availableCategories(index: IndexedSymbol[]): SymbolType[] {
    const present = new Set<SymbolType>();
    for (const s of index) present.add(s.category);
    return CATEGORY_ORDER.filter(c => present.has(c));
}

/** Crypto markets present in the data (Spot / Swap / Futures) */
export function availableMarkets(index: IndexedSymbol[], category: SymbolType): SymbolMarket[] {
    const present = new Set<SymbolMarket>();
    for (const s of index) {
        if (s.category === category && s.market) present.add(s.market);
    }
    return (['spot', 'swap', 'futures'] as SymbolMarket[]).filter(m => present.has(m));
}

// ============================================================================
// Sources
// ============================================================================

export type SourceGroup = 'crypto' | 'forex';

export interface SourceInfo {
    /** Base source code, e.g. BINANCE */
    id: string;
    /** Display name (alias applied) */
    label: string;
    /** Full exchange name */
    description: string;
    group: SourceGroup;
    /** Exchange codes belonging to this source (BINANCE, BINANCE-FUTURES) */
    exchanges: string[];
}

export function sourceLabel(id: string): string {
    return exchangeAlias(id) ?? SOURCE_NAMES[id] ?? id;
}

export function sourceDescription(id: string): string {
    return SOURCE_DESCRIPTIONS[id] ?? sourceLabel(id);
}

export function buildSources(index: IndexedSymbol[]): SourceInfo[] {
    const map = new Map<string, { exchanges: Set<string>; crypto: boolean }>();
    for (const s of index) {
        let e = map.get(s.source);
        if (!e) {
            e = { exchanges: new Set(), crypto: false };
            map.set(s.source, e);
        }
        e.exchanges.add(s.info.exchange);
        if (s.category === 'crypto') e.crypto = true;
    }
    const list: SourceInfo[] = [];
    map.forEach((e, id) => {
        const label = sourceLabel(id);
        list.push({
            id,
            label,
            description: sourceDescription(id),
            group: e.crypto ? 'crypto' : 'forex',
            exchanges: Array.from(e.exchanges).sort((a, b) => exchangePriority(a) - exchangePriority(b)),
        });
    });
    list.sort((a, b) => exchangePriority(a.id) - exchangePriority(b.id) || a.label.localeCompare(b.label));
    return list;
}

// ============================================================================
// Query parsing
// ============================================================================

export interface ParsedQuery {
    /** Text part used for matching */
    text: string;
    /** Exchange codes the search is restricted to (from "EXCHANGE:" prefix), or null */
    exchanges: string[] | null;
}

/** "BINANCE:BTC" -> text "BTC" restricted to BINANCE. Unknown prefixes are left in the text. */
export function parseQuery(raw: string, sources: SourceInfo[]): ParsedQuery {
    const idx = raw.indexOf(':');
    if (idx > 0) {
        const token = raw.slice(0, idx).trim().toUpperCase();
        const rest = raw.slice(idx + 1).trim();
        for (const src of sources) {
            if (token === src.id || token === src.label.toUpperCase()) {
                return { text: rest, exchanges: src.exchanges.slice() };
            }
        }
        for (const src of sources) {
            const hit = src.exchanges.find(ex => ex.toUpperCase() === token);
            if (hit) return { text: rest, exchanges: [hit] };
        }
    }
    return { text: raw.trim(), exchanges: null };
}

// ============================================================================
// Filtering & ranking
// ============================================================================

export interface Filters {
    category: SymbolType;
    /** Source id (base), or null for all sources */
    source: string | null;
    /** Crypto per-tab type filter, or null for all types */
    market: SymbolMarket | null;
}

export function hasActiveFilters(f: Filters): boolean {
    return f.category !== 'all' || f.source !== null || f.market !== null;
}

function passes(s: IndexedSymbol, f: Filters, restrict: string[] | null): boolean {
    if (f.category !== 'all' && s.category !== f.category) return false;
    if (restrict) {
        if (restrict.indexOf(s.info.exchange) < 0) return false;
    } else if (f.source !== null && s.source !== f.source) return false;
    if (f.market !== null && s.market !== f.market) return false;
    return true;
}

/** 0 exact ticker, 1 ticker prefix, 2 ticker contains, 3 description contains, -1 no match */
export function matchGroup(s: IndexedSymbol, q: string, qn: string): number {
    if (s.tickerLower === q || s.rawLower === q || (qn !== '' && (s.tickerNorm === qn || s.rawNorm === qn))) return 0;
    if (s.tickerLower.startsWith(q) || s.rawLower.startsWith(q) || (qn !== '' && (s.tickerNorm.startsWith(qn) || s.rawNorm.startsWith(qn)))) return 1;
    if (s.tickerLower.includes(q) || s.rawLower.includes(q) || (qn !== '' && (s.tickerNorm.includes(qn) || s.rawNorm.includes(qn)))) return 2;
    if (s.descLower.includes(q) || (qn !== '' && s.descNorm.includes(qn))) return 3;
    return -1;
}

function compareDefault(a: IndexedSymbol, b: IndexedSymbol): number {
    return a.exPrio - b.exPrio
        || a.majorIdx - b.majorIdx
        || (a.market === b.market ? 0 : a.market === 'spot' ? -1 : b.market === 'spot' ? 1 : 0)
        || (a.tickerLower < b.tickerLower ? -1 : a.tickerLower > b.tickerLower ? 1 : 0);
}

/** Filter + rank once per input. Empty text returns the default order. */
export function runSearch(index: IndexedSymbol[], text: string, f: Filters, restrict: string[] | null = null): IndexedSymbol[] {
    const q = text.trim().toLowerCase();
    const qn = normalizeKey(q);
    const out: IndexedSymbol[] = [];

    if (q === '') {
        for (const s of index) if (passes(s, f, restrict)) out.push(s);
        out.sort(compareDefault);
        return out;
    }

    const tmp: Array<{ s: IndexedSymbol; g: number }> = [];
    for (const s of index) {
        if (!passes(s, f, restrict)) continue;
        const g = matchGroup(s, q, qn);
        if (g >= 0) tmp.push({ s, g });
    }
    tmp.sort((a, b) =>
        a.g - b.g
        || a.s.tickerNorm.length - b.s.tickerNorm.length
        || a.s.exPrio - b.s.exPrio
        || (a.s.market === b.s.market ? 0 : a.s.market === 'spot' ? -1 : b.s.market === 'spot' ? 1 : 0)
        || (a.s.tickerLower < b.s.tickerLower ? -1 : a.s.tickerLower > b.s.tickerLower ? 1 : 0));
    for (const e of tmp) out.push(e.s);
    return out;
}

/** Recents (that pass the filters) first, then the rest; de-duplicated by id. */
export function mergeRecents(results: IndexedSymbol[], recents: IndexedSymbol[], f: Filters, restrict: string[] | null = null): IndexedSymbol[] {
    const seen = new Set<string>();
    const out: IndexedSymbol[] = [];
    for (const r of recents) {
        if (!passes(r, f, restrict) || seen.has(r.id)) continue;
        seen.add(r.id);
        out.push(r);
    }
    for (const r of results) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push(r);
    }
    return out;
}

// ============================================================================
// Empty state
// ============================================================================

export type EmptyKind =
    | { kind: 'none' }
    | { kind: 'show-all'; count: number }
    | { kind: 'reset' };

/** Why there are no results, and what could help. */
export function explainEmpty(index: IndexedSymbol[], text: string, f: Filters, restrict: string[] | null = null): EmptyKind {
    if (!hasActiveFilters(f) && !restrict) return { kind: 'none' };
    if (f.category !== 'all') {
        const all = runSearch(index, text, { category: 'all', source: f.source, market: null }, restrict);
        if (all.length > 0) return { kind: 'show-all', count: all.length };
    }
    const none = runSearch(index, text, { category: 'all', source: null, market: null }, null);
    if (none.length === 0) return { kind: 'none' };
    return { kind: 'reset' };
}

// ============================================================================
// Highlight
// ============================================================================

function charMap(text: string, skipSeps: boolean): { key: string; map: number[] } {
    let key = '';
    const map: number[] = [];
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (skipSeps && /[\s\-_/.:]/.test(c)) continue;
        const lc = c.toLowerCase();
        for (let k = 0; k < lc.length; k++) {
            key += lc[k];
            map.push(i);
        }
    }
    return { key, map };
}

/** Matched ranges [start, end) of `query` inside `text` (case-insensitive; separators ignored as a fallback). */
export function highlightRanges(text: string, query: string): Array<[number, number]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const direct = charMap(text, false);
    let i = direct.key.indexOf(q);
    if (i >= 0) return [[direct.map[i], direct.map[i + q.length - 1] + 1]];
    const qn = normalizeKey(q);
    if (!qn) return [];
    const norm = charMap(text, true);
    i = norm.key.indexOf(qn);
    if (i >= 0) return [[norm.map[i], norm.map[i + qn.length - 1] + 1]];
    return [];
}

// ============================================================================
// Persistence
// ============================================================================

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

const RECENTS_KEY = 'tv-symbol-search-recents-v1';
const PREFS_KEY = 'tv-symbol-search-prefs-v1';

export class RecentsStore {
    constructor(private readonly _storage: StorageLike | null) {}

    list(): SymbolInfo[] {
        if (!this._storage) return [];
        try {
            const raw = this._storage.getItem(RECENTS_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return [];
            return arr
                .filter((x: any) => x && typeof x.symbol === 'string' && typeof x.exchange === 'string')
                .slice(0, RECENTS_MAX);
        } catch {
            return [];
        }
    }

    add(info: SymbolInfo): void {
        if (!this._storage) return;
        const id = symbolId(info);
        const next = [info, ...this.list().filter(x => symbolId(x) !== id)].slice(0, RECENTS_MAX);
        try {
            this._storage.setItem(RECENTS_KEY, JSON.stringify(next));
        } catch { /* quota / private mode */ }
    }
}

export interface SearchPrefs {
    category: SymbolType;
    source: string | null;
    /** Per-tab filters, e.g. { crypto: { market: 'spot' } } */
    tabs: Record<string, { market?: SymbolMarket | null }>;
}

export function defaultPrefs(): SearchPrefs {
    return { category: 'all', source: null, tabs: {} };
}

export class PrefsStore {
    constructor(private readonly _storage: StorageLike | null) {}

    load(): SearchPrefs {
        const prefs = defaultPrefs();
        if (!this._storage) return prefs;
        try {
            const raw = this._storage.getItem(PREFS_KEY);
            if (!raw) return prefs;
            const o = JSON.parse(raw);
            if (o && typeof o === 'object') {
                if (typeof o.category === 'string') prefs.category = o.category;
                if (typeof o.source === 'string') prefs.source = o.source;
                if (o.tabs && typeof o.tabs === 'object') prefs.tabs = o.tabs;
            }
        } catch { /* ignore */ }
        return prefs;
    }

    save(prefs: SearchPrefs): void {
        if (!this._storage) return;
        try {
            this._storage.setItem(PREFS_KEY, JSON.stringify(prefs));
        } catch { /* ignore */ }
    }
}
