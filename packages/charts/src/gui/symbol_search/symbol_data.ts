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

async function getJson(url: string, label: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${label} API error`);
    return response.json();
}

export const FETCHERS: SourceFetcher[] = [
    {
        name: 'Binance Spot',
        fetch: async () => {
            const data = await getJson('https://api.binance.com/api/v3/exchangeInfo', 'Binance Spot');
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
            const raw = await getJson(`${MARKET_API_URL()}/symbols`, 'Symbols');
            const data: Array<{ code: string; exchange: string; asset_class: string; display_name?: string }> =
                Array.isArray(raw) ? raw : (Array.isArray(raw?.results) ? raw.results : []);
            return data
                .filter(s => s && s.code && s.asset_class !== 'crypto')
                .map((s): SymbolInfo => {
                    const isCommodity = s.asset_class === 'metal' || s.asset_class === 'energy';
                    const description = BACKEND_DESCRIPTIONS[s.code] || s.display_name || s.code;
                    let category: SymbolType = 'forex';
                    if (isCommodity) category = isFuturesExchange(s.exchange) ? 'futures' : 'cfd';
                    const pair = s.code.length === 6 ? `${s.code.slice(0, 3)} / ${s.code.slice(3)}` : s.code;
                    return {
                        symbol: s.code,
                        full_name: isCommodity ? description : pair,
                        description,
                        exchange: s.exchange,
                        type: 'forex',
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
// Shared catalog (page-wide cache)
// ============================================================================

type Listener = (chunk: SymbolInfo[], done: boolean) => void;

class Catalog {
    private _loaded: SymbolInfo[] = [];
    private readonly _status = new Map<string, 'ok' | 'loading' | 'failed'>();
    private readonly _listeners = new Set<Listener>();

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
        for (const f of FETCHERS) {
            const st = this._status.get(f.name);
            if (st === 'ok' || st === 'loading') continue;
            this._status.set(f.name, 'loading');
            f.fetch().then(list => {
                this._status.set(f.name, 'ok');
                this._loaded = this._loaded.concat(list);
                this._emit(list);
            }).catch(err => {
                console.warn(`Failed to fetch ${f.name}:`, err);
                this._status.set(f.name, 'failed');
                this._emit([]);
            });
        }
    }

    private _emit(chunk: SymbolInfo[]): void {
        const done = !this.loading;
        this._listeners.forEach(l => l(chunk, done));
    }
}

export const symbolCatalog = new Catalog();
