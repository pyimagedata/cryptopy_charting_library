/**
 * Symbol data sources: Binance / Bybit / OKX (spot + perpetual) and the
 * EvoTrading backend list (forex, metals, energy, COMEX futures).
 * Results are cached for the page so every SymbolSearch instance shares one fetch.
 */

import { SymbolInfo, SymbolType, isFuturesExchange } from './symbol_model';

/** Exchange logos (TradingView provider CDN); missing ones fall back to a placeholder. */
const LOGO_BASE = 'https://s3-symbol-logo.tradingview.com/provider/';
const EXCHANGE_LOGO_IDS: Record<string, string> = {
    'BINANCE': 'binance',
    'BINANCE-FUTURES': 'binance',
    'OKX': 'okx',
    'OKX-FUTURES': 'okx',
    'BYBIT': 'bybit',
    'BYBIT-FUTURES': 'bybit',
    'FXCM': 'fxcm',
    'FOREXCOM': 'forexcom',
    'OANDA': 'oanda',
    'COMEX': 'comex',
};

export function exchangeLogoUrl(exchange: string): string | null {
    const id = EXCHANGE_LOGO_IDS[(exchange || '').toUpperCase()];
    return id ? `${LOGO_BASE}${id}.svg` : null;
}

const COLORS = [
    '#F7931A', '#627EEA', '#14F195', '#F3BA2F', '#23292F',
    '#0033AD', '#E84142', '#E6007A', '#8247E5', '#2A5ADA',
    '#C2A633', '#345D9D', '#28A0F0', '#FF0420', '#00D395',
];

function colorFor(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    return COLORS[Math.abs(hash) % COLORS.length];
}

const MARKET_API_URL = (): string =>
    (typeof window !== 'undefined' && (window as any).MARKET_API_URL) || '/api/market';

const BACKEND_DESCRIPTIONS: Record<string, string> = {
    XAUUSD: 'Gold', XAGUSD: 'Silver', XPTUSD: 'Platinum', XPDUSD: 'Palladium',
    GC1: 'Gold Futures', SI1: 'Silver Futures',
    USOIL: 'WTI Crude Oil', UKOIL: 'Brent Crude Oil',
    DXY: 'U.S. Dollar Index',
    SPX500: 'S&P 500 (CFD)', NAS100: 'Nasdaq 100 (CFD)',
};

export interface SourceFetcher {
    name: string;
    fetch: () => Promise<SymbolInfo[]>;
}

function cryptoSpot(symbol: string, base: string, quote: string, exchange: string, provider: string): SymbolInfo {
    return {
        symbol,
        full_name: `${base} / ${quote}`,
        description: base,
        exchange,
        type: 'crypto',
        category: 'crypto',
        market: 'spot',
        logo_url: exchangeLogoUrl(exchange) ?? undefined,
        logo_color: colorFor(base),
        provider,
    };
}

function cryptoPerp(symbol: string, base: string, exchange: string, provider: string): SymbolInfo {
    return {
        symbol,
        full_name: `${base} Perpetual`,
        description: `${base} Perp`,
        exchange,
        type: 'crypto',
        category: 'crypto',
        market: 'swap',
        logo_url: exchangeLogoUrl(exchange) ?? undefined,
        logo_color: colorFor(base),
        provider,
    };
}

/** A slow or dead source is skipped after this long instead of holding the spinner. */
const FETCH_TIMEOUT_MS = 8000;

function timeoutSignal(ms: number): AbortSignal {
    if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function') {
        return (AbortSignal as any).timeout(ms);
    }
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
}

async function getJson(url: string, label: string): Promise<any> {
    const response = await fetch(url, { signal: timeoutSignal(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`${label} API error`);
    return response.json();
}

export const FETCHERS: SourceFetcher[] = [
    {
        name: 'Binance Spot',
        fetch: async () => {
            const data = await getJson('https://api.binance.com/api/v3/exchangeInfo?symbolStatus=TRADING&showPermissionSets=false', 'Binance Spot');
            return data.symbols
                .filter((s: any) => s.status === 'TRADING' && s.quoteAsset === 'USDT' && s.isSpotTradingAllowed)
                .map((s: any) => cryptoSpot(s.symbol, s.baseAsset, s.quoteAsset, 'BINANCE', 'binance'));
        },
    },
    {
        name: 'Binance Futures',
        fetch: async () => {
            const data = await getJson('https://fapi.binance.com/fapi/v1/exchangeInfo', 'Binance Futures');
            return data.symbols
                .filter((s: any) => s.status === 'TRADING' && s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT')
                .map((s: any) => cryptoPerp(s.symbol, s.baseAsset, 'BINANCE-FUTURES', 'binance-futures'));
        },
    },
    {
        name: 'Bybit Spot',
        fetch: async () => {
            const data = await getJson('https://api.bybit.com/v5/market/instruments-info?category=spot', 'Bybit Spot');
            if (!data.result?.list) return [];
            return data.result.list
                .filter((s: any) => s.status === 'Trading' && s.quoteCoin === 'USDT')
                .map((s: any) => cryptoSpot(s.symbol, s.baseCoin, s.quoteCoin, 'BYBIT', 'bybit'));
        },
    },
    {
        name: 'Bybit Futures',
        fetch: async () => {
            const data = await getJson('https://api.bybit.com/v5/market/instruments-info?category=linear', 'Bybit Futures');
            if (!data.result?.list) return [];
            return data.result.list
                .filter((s: any) => s.status === 'Trading' && s.quoteCoin === 'USDT' && s.contractType === 'LinearPerpetual')
                .map((s: any) => cryptoPerp(s.symbol, s.baseCoin, 'BYBIT-FUTURES', 'bybit-futures'));
        },
    },
    {
        name: 'OKX Spot',
        fetch: async () => {
            const data = await getJson('https://www.okx.com/api/v5/public/instruments?instType=SPOT', 'OKX Spot');
            if (!data.data) return [];
            // instId keeps the original OKX format (BTC-USDT) - the host data fetcher relies on it
            return data.data
                .filter((s: any) => s.state === 'live' && s.quoteCcy === 'USDT')
                .map((s: any) => cryptoSpot(s.instId, s.baseCcy, s.quoteCcy, 'OKX', 'okx'));
        },
    },
    {
        name: 'OKX Futures',
        fetch: async () => {
            const data = await getJson('https://www.okx.com/api/v5/public/instruments?instType=SWAP', 'OKX Futures');
            if (!data.data) return [];
            // instId keeps the original OKX format (BTC-USDT-SWAP)
            return data.data
                .filter((s: any) => s.state === 'live' && s.settleCcy === 'USDT')
                .map((s: any) => cryptoPerp(s.instId, s.ctValCcy, 'OKX-FUTURES', 'okx-futures'));
        },
    },
    {
        // EvoTrading Django backend (/api/symbols/ via same-origin /api/market proxy)
        name: 'Backend',
        fetch: async () => {
            // The host page may share one /symbols request between itself and the search.
            const shared = typeof window !== 'undefined' ? (window as any).EVO_MARKET_SYMBOLS : undefined;
            const raw = typeof shared === 'function'
                ? await shared()
                : await getJson(`${MARKET_API_URL()}/symbols`, 'Symbols');
            const data: Array<{ code: string; exchange: string; asset_class: string; display_name?: string }> =
                Array.isArray(raw) ? raw : (Array.isArray(raw?.results) ? raw.results : []);
            return data
                .filter(s => s && s.code && s.asset_class !== 'crypto')
                .map((s): SymbolInfo => {
                    const isCommodity = s.asset_class === 'metal' || s.asset_class === 'energy';
                    const description = BACKEND_DESCRIPTIONS[s.code] || s.display_name || s.code;
                    const isIndex = s.asset_class === 'index';
                    let category: SymbolType = isIndex ? 'indices' : 'forex';
                    if (isCommodity) category = isFuturesExchange(s.exchange) ? 'futures' : 'cfd';
                    const pair = s.code.length === 6 ? `${s.code.slice(0, 3)} / ${s.code.slice(3)}` : s.code;
                    return {
                        symbol: s.code,
                        full_name: (isCommodity || isIndex) ? description : pair,
                        description,
                        exchange: s.exchange,
                        type: isIndex ? 'indices' : 'forex',
                        category,
                        market: category === 'futures' ? 'futures' : undefined,
                        logo_url: exchangeLogoUrl(s.exchange) ?? undefined,
                        logo_color: colorFor(s.code),
                        provider: (s.exchange || 'fxcm').toLowerCase(),
                    };
                });
        },
    },
];

// ============================================================================
// Persistent cache of the external (exchange) sources, stale-while-revalidate
// ============================================================================

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_DB = 'evo-symbol-catalog';
const CACHE_STORE = 'kv';
/** Bump when the SymbolInfo mapping of any cached source changes: entries of other schemas are ignored. */
const CATALOG_SCHEMA = 1;
const CACHE_KEY = `external-v${CATALOG_SCHEMA}`;
/** IndexedDB can stall (blocked / private mode): never let it hold up the network fetch. */
const CACHE_IO_TIMEOUT_MS = 1000;

/** The Backend source is per-user / cheap and always comes from the network. */
const CACHED_SOURCES = new Set(['Binance Spot', 'Binance Futures', 'Bybit Spot', 'Bybit Futures', 'OKX Spot', 'OKX Futures']);

type CacheRecord = Record<string, { t: number; list: SymbolInfo[] }>;

function openCacheDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(CACHE_DB, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(CACHE_STORE); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('indexedDB blocked'));
    });
}

function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
    return new Promise<T>((resolve) => {
        const timer = setTimeout(() => resolve(fallback), CACHE_IO_TIMEOUT_MS);
        p.then(v => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(fallback); });
    });
}

async function readCacheRaw(): Promise<CacheRecord | null> {
    try {
        const db = await openCacheDb();
        try {
            return await new Promise<CacheRecord | null>((resolve) => {
                const req = db.transaction(CACHE_STORE, 'readonly').objectStore(CACHE_STORE).get(CACHE_KEY);
                req.onsuccess = () => {
                    const v = req.result;
                    resolve(v && typeof v === 'object' ? v as CacheRecord : null);
                };
                req.onerror = () => resolve(null);
            });
        } finally {
            db.close();
        }
    } catch {
        return null;
    }
}

function readCache(): Promise<CacheRecord | null> {
    return withTimeout(readCacheRaw(), null);
}

async function writeCacheRaw(rec: CacheRecord): Promise<void> {
    try {
        const db = await openCacheDb();
        try {
            await new Promise<void>((resolve) => {
                const tx = db.transaction(CACHE_STORE, 'readwrite');
                tx.objectStore(CACHE_STORE).put(rec, CACHE_KEY);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
                tx.onabort = () => resolve();
            });
        } finally {
            db.close();
        }
    } catch {
        // storage unavailable (private mode, quota): the catalog just isn't persisted
    }
}

function writeCache(rec: CacheRecord): Promise<void> {
    return withTimeout(writeCacheRaw(rec), undefined);
}

// ============================================================================
// Shared catalog (page-wide cache)
// ============================================================================

type Listener = (chunk: SymbolInfo[], done: boolean) => void;

class Catalog {
    private readonly _bySource = new Map<string, SymbolInfo[]>();
    private _loaded: SymbolInfo[] = [];
    private readonly _status = new Map<string, 'ok' | 'loading' | 'revalidating' | 'failed'>();
    private readonly _listeners = new Set<Listener>();
    private _cache: CacheRecord = {};
    private _cacheReady: Promise<void> | null = null;

    get symbols(): SymbolInfo[] {
        return this._loaded;
    }

    get loading(): boolean {
        for (const v of this._status.values()) if (v === 'loading') return true;
        return false;
    }

    /** True when every source has been fetched successfully. */
    get complete(): boolean {
        return FETCHERS.every(f => this._status.get(f.name) === 'ok');
    }

    subscribe(l: Listener): () => void {
        this._listeners.add(l);
        return () => { this._listeners.delete(l); };
    }

    /** Starts fetching the sources that are not loaded / not in flight (failed ones are retried). */
    ensureLoaded(): void {
        if (!this._cacheReady) {
            this._cacheReady = readCache().then(rec => { if (rec) this._cache = rec; });
        }
        for (const f of FETCHERS) {
            const st = this._status.get(f.name);
            if (st === 'ok' || st === 'loading' || st === 'revalidating') continue;
            this._status.set(f.name, 'loading');
            this._cacheReady.then(() => this._loadSource(f));
        }
    }

    private _loadSource(f: SourceFetcher): void {
        const cached = CACHED_SOURCES.has(f.name) ? this._cache[f.name] : undefined;
        if (cached && Array.isArray(cached.list)) {
            this._setSource(f.name, cached.list);
            if (Date.now() - cached.t < CACHE_TTL_MS) {
                this._status.set(f.name, 'ok');
                this._emit(cached.list);
                return;
            }
            // Stale: show it right away, refresh in the background.
            this._status.set(f.name, 'revalidating');
            this._emit(cached.list);
        }
        f.fetch().then(list => {
            this._status.set(f.name, 'ok');
            this._setSource(f.name, list);
            if (CACHED_SOURCES.has(f.name)) this._cache[f.name] = { t: Date.now(), list };
            this._emit(list);
            this._persistWhenSettled();
        }).catch(err => {
            console.warn(`Failed to fetch ${f.name}:`, err);
            this._status.set(f.name, 'failed');
            this._emit([]);
        });
    }

    private _setSource(name: string, list: SymbolInfo[]): void {
        this._bySource.set(name, list);
        const all: SymbolInfo[] = [];
        for (const l of this._bySource.values()) for (const s of l) all.push(s);
        this._loaded = all;
    }

    private _persistWhenSettled(): void {
        for (const v of this._status.values()) if (v === 'loading' || v === 'revalidating') return;
        void writeCache(this._cache);
    }

    private _emit(chunk: SymbolInfo[]): void {
        const done = !this.loading;
        this._listeners.forEach(l => l(chunk, done));
    }
}

export const symbolCatalog = new Catalog();

/**
 * Warms the catalog when the browser is idle so the first symbol search opens
 * with results already there. Safe to call more than once.
 */
export function prefetchSymbolCatalog(): void {
    const run = (): void => { symbolCatalog.ensureLoaded(); };
    const w: any = typeof window !== 'undefined' ? window : undefined;
    if (w && typeof w.requestIdleCallback === 'function') w.requestIdleCallback(run, { timeout: 5000 });
    else setTimeout(run, 2000);
}
