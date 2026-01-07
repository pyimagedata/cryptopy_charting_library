/**
 * Symbol Search Modal - TradingView-style symbol search with category tabs
 * 
 * Features:
 * - Category tabs (All, Stocks, Futures, Forex, Crypto, Indices, etc.)
 * - Dropdown filters (Country, Type, Sector)
 * - Real-time search
 * - Integration with data providers
 */

import { Delegate } from '../../helpers/delegate';

// ============================================================================
// Types
// ============================================================================

export type SymbolType = 'all' | 'stocks' | 'funds' | 'futures' | 'forex' | 'crypto' | 'indices' | 'bonds' | 'economy' | 'options';

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
}

export interface SymbolSearchConfig {
    categories?: SymbolType[];
    defaultCategory?: SymbolType;
}

const DEFAULT_CONFIG: Required<SymbolSearchConfig> = {
    categories: ['all', 'crypto', 'stocks'],
    defaultCategory: 'all'
};

// ============================================================================
// Mock Data (to be replaced with real data provider)
// ============================================================================

const MOCK_SYMBOLS: SymbolInfo[] = [
    // Crypto - Binance Spot
    { symbol: 'BTCUSDT', full_name: 'Bitcoin / TetherUS', description: 'Bitcoin', exchange: 'BINANCE', type: 'crypto', logo_color: '#F7931A', provider: 'binance' },
    { symbol: 'ETHUSDT', full_name: 'Ethereum / TetherUS', description: 'Ethereum', exchange: 'BINANCE', type: 'crypto', logo_color: '#627EEA', provider: 'binance' },
    { symbol: 'SOLUSDT', full_name: 'Solana / TetherUS', description: 'Solana', exchange: 'BINANCE', type: 'crypto', logo_color: '#14F195', provider: 'binance' },
    { symbol: 'BNBUSDT', full_name: 'BNB / TetherUS', description: 'BNB', exchange: 'BINANCE', type: 'crypto', logo_color: '#F3BA2F', provider: 'binance' },
    { symbol: 'XRPUSDT', full_name: 'XRP / TetherUS', description: 'XRP', exchange: 'BINANCE', type: 'crypto', logo_color: '#23292F', provider: 'binance' },
    { symbol: 'ADAUSDT', full_name: 'Cardano / TetherUS', description: 'Cardano', exchange: 'BINANCE', type: 'crypto', logo_color: '#0033AD', provider: 'binance' },
    { symbol: 'AVAXUSDT', full_name: 'Avalanche / TetherUS', description: 'Avalanche', exchange: 'BINANCE', type: 'crypto', logo_color: '#E84142', provider: 'binance' },
    { symbol: 'DOTUSDT', full_name: 'Polkadot / TetherUS', description: 'Polkadot', exchange: 'BINANCE', type: 'crypto', logo_color: '#E6007A', provider: 'binance' },
    { symbol: 'MATICUSDT', full_name: 'Polygon / TetherUS', description: 'Polygon', exchange: 'BINANCE', type: 'crypto', logo_color: '#8247E5', provider: 'binance' },
    { symbol: 'LINKUSDT', full_name: 'Chainlink / TetherUS', description: 'Chainlink', exchange: 'BINANCE', type: 'crypto', logo_color: '#2A5ADA', provider: 'binance' },
    { symbol: 'DOGEUSDT', full_name: 'Dogecoin / TetherUS', description: 'Dogecoin', exchange: 'BINANCE', type: 'crypto', logo_color: '#C2A633', provider: 'binance' },
    { symbol: 'LTCUSDT', full_name: 'Litecoin / TetherUS', description: 'Litecoin', exchange: 'BINANCE', type: 'crypto', logo_color: '#345D9D', provider: 'binance' },

    // Crypto - Binance Futures (Perpetual)
    { symbol: 'BTCUSDT', full_name: 'Bitcoin Perpetual', description: 'BTC Perp', exchange: 'BINANCE-FUTURES', type: 'crypto', logo_color: '#F7931A', provider: 'binance-futures' },
    { symbol: 'ETHUSDT', full_name: 'Ethereum Perpetual', description: 'ETH Perp', exchange: 'BINANCE-FUTURES', type: 'crypto', logo_color: '#627EEA', provider: 'binance-futures' },
    { symbol: 'SOLUSDT', full_name: 'Solana Perpetual', description: 'SOL Perp', exchange: 'BINANCE-FUTURES', type: 'crypto', logo_color: '#14F195', provider: 'binance-futures' },
    { symbol: 'BNBUSDT', full_name: 'BNB Perpetual', description: 'BNB Perp', exchange: 'BINANCE-FUTURES', type: 'crypto', logo_color: '#F3BA2F', provider: 'binance-futures' },
    { symbol: 'XRPUSDT', full_name: 'XRP Perpetual', description: 'XRP Perp', exchange: 'BINANCE-FUTURES', type: 'crypto', logo_color: '#23292F', provider: 'binance-futures' },
    { symbol: 'ADAUSDT', full_name: 'Cardano Perpetual', description: 'ADA Perp', exchange: 'BINANCE-FUTURES', type: 'crypto', logo_color: '#0033AD', provider: 'binance-futures' },
    { symbol: 'AVAXUSDT', full_name: 'Avalanche Perpetual', description: 'AVAX Perp', exchange: 'BINANCE-FUTURES', type: 'crypto', logo_color: '#E84142', provider: 'binance-futures' },
    { symbol: 'DOTUSDT', full_name: 'Polkadot Perpetual', description: 'DOT Perp', exchange: 'BINANCE-FUTURES', type: 'crypto', logo_color: '#E6007A', provider: 'binance-futures' },
    { symbol: 'LINKUSDT', full_name: 'Chainlink Perpetual', description: 'LINK Perp', exchange: 'BINANCE-FUTURES', type: 'crypto', logo_color: '#2A5ADA', provider: 'binance-futures' },
    { symbol: 'DOGEUSDT', full_name: 'Dogecoin Perpetual', description: 'DOGE Perp', exchange: 'BINANCE-FUTURES', type: 'crypto', logo_color: '#C2A633', provider: 'binance-futures' },
    { symbol: 'LTCUSDT', full_name: 'Litecoin Perpetual', description: 'LTC Perp', exchange: 'BINANCE-FUTURES', type: 'crypto', logo_color: '#345D9D', provider: 'binance-futures' },
    { symbol: 'ARBUSDT', full_name: 'Arbitrum Perpetual', description: 'ARB Perp', exchange: 'BINANCE-FUTURES', type: 'crypto', logo_color: '#28A0F0', provider: 'binance-futures' },
    { symbol: 'OPUSDT', full_name: 'Optimism Perpetual', description: 'OP Perp', exchange: 'BINANCE-FUTURES', type: 'crypto', logo_color: '#FF0420', provider: 'binance-futures' },

    // Stocks - NASDAQ
    { symbol: 'TSLA', full_name: 'Tesla, Inc.', description: 'Tesla', exchange: 'NASDAQ', type: 'stocks', logo_color: '#CC0000', country: 'US', sector: 'Automotive', provider: 'dxfeed' },
    { symbol: 'NVDA', full_name: 'NVIDIA Corporation', description: 'NVIDIA', exchange: 'NASDAQ', type: 'stocks', logo_color: '#76B900', country: 'US', sector: 'Technology', provider: 'dxfeed' },
    { symbol: 'AAPL', full_name: 'Apple Inc.', description: 'Apple', exchange: 'NASDAQ', type: 'stocks', logo_color: '#A2AAAD', country: 'US', sector: 'Technology', provider: 'dxfeed' },
    { symbol: 'AMZN', full_name: 'Amazon.com, Inc.', description: 'Amazon', exchange: 'NASDAQ', type: 'stocks', logo_color: '#FF9900', country: 'US', sector: 'E-Commerce', provider: 'dxfeed' },
    { symbol: 'AMD', full_name: 'Advanced Micro Devices, Inc.', description: 'AMD', exchange: 'NASDAQ', type: 'stocks', logo_color: '#ED1C24', country: 'US', sector: 'Technology', provider: 'dxfeed' },
    { symbol: 'META', full_name: 'Meta Platforms, Inc.', description: 'Meta', exchange: 'NASDAQ', type: 'stocks', logo_color: '#0866FF', country: 'US', sector: 'Technology', provider: 'dxfeed' },
    { symbol: 'MSFT', full_name: 'Microsoft Corporation', description: 'Microsoft', exchange: 'NASDAQ', type: 'stocks', logo_color: '#00A4EF', country: 'US', sector: 'Technology', provider: 'dxfeed' },
    { symbol: 'GOOGL', full_name: 'Alphabet Inc.', description: 'Google', exchange: 'NASDAQ', type: 'stocks', logo_color: '#4285F4', country: 'US', sector: 'Technology', provider: 'dxfeed' },

    // BIST Stocks
    { symbol: 'THYAO', full_name: 'Türk Hava Yolları A.O.', description: 'THY', exchange: 'BIST', type: 'stocks', logo_color: '#C8102E', country: 'TR', sector: 'Airlines', provider: 'dxfeed' },
    { symbol: 'GARAN', full_name: 'Türkiye Garanti Bankası A.Ş.', description: 'Garanti', exchange: 'BIST', type: 'stocks', logo_color: '#00965E', country: 'TR', sector: 'Banking', provider: 'dxfeed' },
    { symbol: 'ASELS', full_name: 'Aselsan Elektronik Sanayi ve Ticaret A.Ş.', description: 'Aselsan', exchange: 'BIST', type: 'stocks', logo_color: '#003087', country: 'TR', sector: 'Defense', provider: 'dxfeed' },
    { symbol: 'SISE', full_name: 'Türkiye Şişe ve Cam Fabrikaları A.Ş.', description: 'Şişecam', exchange: 'BIST', type: 'stocks', logo_color: '#00529B', country: 'TR', sector: 'Manufacturing', provider: 'dxfeed' },
];

// ============================================================================
// Tab Labels
// ============================================================================

const TAB_LABELS: Record<SymbolType, string> = {
    'all': 'All',
    'stocks': 'Stocks',
    'funds': 'Funds',
    'futures': 'Futures',
    'forex': 'Forex',
    'crypto': 'Crypto',
    'indices': 'Indices',
    'bonds': 'Bonds',
    'economy': 'Economy',
    'options': 'Options'
};

// ============================================================================
// Symbol Search Modal
// ============================================================================

export class SymbolSearch {
    private _config: Required<SymbolSearchConfig>;
    private _overlay: HTMLElement | null = null;
    private _dialog: HTMLElement | null = null;
    private _tabsContainer: HTMLElement | null = null;
    private _listContainer: HTMLElement | null = null;
    private _searchInput: HTMLInputElement | null = null;
    private _symbols: SymbolInfo[] = [];
    private _activeCategory: SymbolType = 'all';
    private _cryptoExchange: string = 'all';  // 'all', 'BINANCE', 'BINANCE-FUTURES'
    private _exchangeDropdown: HTMLSelectElement | null = null;
    private _isLoading: boolean = false;
    private _symbolsFetched: boolean = false;  // Cache flag
    private readonly _symbolSelected = new Delegate<SymbolInfo>();

    constructor(config: SymbolSearchConfig = {}) {
        this._config = { ...DEFAULT_CONFIG, ...config };
        this._activeCategory = this._config.defaultCategory;
        this._createUI();
    }

    get symbolSelected(): Delegate<SymbolInfo> {
        return this._symbolSelected;
    }

    get isLoading(): boolean {
        return this._isLoading;
    }

    /**
     * Set symbols to display (connect with data provider)
     */
    setSymbols(symbols: SymbolInfo[]): void {
        this._symbols = symbols;
        this._applyFilters();
    }

    /**
     * Add symbols to the list
     */
    addSymbols(symbols: SymbolInfo[]): void {
        this._symbols = [...this._symbols, ...symbols];
        this._applyFilters();
    }

    show(): void {
        if (this._overlay) {
            this._overlay.style.display = 'flex';
            this._searchInput?.focus();

            // Fetch symbols on first open
            if (!this._symbolsFetched) {
                this._fetchAllSymbols();
            } else {
                this._applyFilters();
            }
        }
    }

    // ========================================================================
    // Exchange Logos (TradingView CDN)
    // ========================================================================

    private static readonly EXCHANGE_LOGOS: Record<string, string> = {
        'BINANCE': 'https://s3-symbol-logo.tradingview.com/provider/binance.svg',
        'BINANCE-FUTURES': 'https://s3-symbol-logo.tradingview.com/provider/binance.svg',
        'OKX': 'https://s3-symbol-logo.tradingview.com/provider/okx.svg',
        'OKX-FUTURES': 'https://s3-symbol-logo.tradingview.com/provider/okx.svg',
        'BYBIT': 'https://s3-symbol-logo.tradingview.com/provider/bybit.svg',
        'BYBIT-FUTURES': 'https://s3-symbol-logo.tradingview.com/provider/bybit.svg',
    };

    // ========================================================================
    // Multi-Exchange API Integration
    // ========================================================================

    private async _fetchAllSymbols(): Promise<void> {
        this._isLoading = true;
        this._showLoading();

        try {
            // Fetch all exchanges in parallel
            const results = await Promise.allSettled([
                this._fetchBinanceSpotSymbols(),
                this._fetchBinanceFuturesSymbols(),
                this._fetchBybitSpotSymbols(),
                this._fetchBybitFuturesSymbols(),
                this._fetchOkxSpotSymbols(),
                this._fetchOkxFuturesSymbols(),
            ]);

            // Collect successful results
            const allSymbols: SymbolInfo[] = [];
            const stats: string[] = [];

            results.forEach((result, index) => {
                const names = ['Binance Spot', 'Binance Futures', 'Bybit Spot', 'Bybit Futures', 'OKX Spot', 'OKX Futures'];
                if (result.status === 'fulfilled') {
                    allSymbols.push(...result.value);
                    stats.push(`${names[index]}: ${result.value.length}`);
                } else {
                    console.warn(`Failed to fetch ${names[index]}:`, result.reason);
                    stats.push(`${names[index]}: ❌`);
                }
            });

            this._symbols = allSymbols;
            this._symbolsFetched = true;
            console.log(`📈 Total symbols loaded: ${this._symbols.length}`);
            console.log(`   ${stats.join(' | ')}`);
        } catch (error) {
            console.error('Failed to fetch symbols:', error);
            this._symbols = MOCK_SYMBOLS;
        } finally {
            this._isLoading = false;
            this._applyFilters();
        }
    }

    // ========================================================================
    // BINANCE
    // ========================================================================

    private async _fetchBinanceSpotSymbols(): Promise<SymbolInfo[]> {
        const response = await fetch('https://api.binance.com/api/v3/exchangeInfo');
        if (!response.ok) throw new Error('Binance Spot API error');
        const data = await response.json();

        return data.symbols
            .filter((s: any) => s.status === 'TRADING' && s.quoteAsset === 'USDT' && s.isSpotTradingAllowed)
            .map((s: any): SymbolInfo => ({
                symbol: s.symbol,
                full_name: `${s.baseAsset} / ${s.quoteAsset}`,
                description: s.baseAsset,
                exchange: 'BINANCE',
                type: 'crypto',
                logo_url: SymbolSearch.EXCHANGE_LOGOS['BINANCE'],
                logo_color: this._getRandomColor(s.baseAsset),
                provider: 'binance'
            }));
    }

    private async _fetchBinanceFuturesSymbols(): Promise<SymbolInfo[]> {
        const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
        if (!response.ok) throw new Error('Binance Futures API error');
        const data = await response.json();

        return data.symbols
            .filter((s: any) => s.status === 'TRADING' && s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT')
            .map((s: any): SymbolInfo => ({
                symbol: s.symbol,
                full_name: `${s.baseAsset} Perpetual`,
                description: `${s.baseAsset} Perp`,
                exchange: 'BINANCE-FUTURES',
                type: 'crypto',
                logo_url: SymbolSearch.EXCHANGE_LOGOS['BINANCE-FUTURES'],
                logo_color: this._getRandomColor(s.baseAsset),
                provider: 'binance-futures'
            }));
    }

    // ========================================================================
    // OKX
    // ========================================================================

    private async _fetchOkxSpotSymbols(): Promise<SymbolInfo[]> {
        const response = await fetch('https://www.okx.com/api/v5/public/instruments?instType=SPOT');
        if (!response.ok) throw new Error('OKX Spot API error');
        const data = await response.json();

        if (!data.data) return [];

        return data.data
            .filter((s: any) => s.state === 'live' && s.quoteCcy === 'USDT')
            .map((s: any): SymbolInfo => ({
                symbol: s.instId,  // Keep original format: BTC-USDT
                full_name: `${s.baseCcy} / ${s.quoteCcy}`,
                description: s.baseCcy,
                exchange: 'OKX',
                type: 'crypto',
                logo_url: SymbolSearch.EXCHANGE_LOGOS['OKX'],
                logo_color: this._getRandomColor(s.baseCcy),
                provider: 'okx'
            }));
    }

    private async _fetchOkxFuturesSymbols(): Promise<SymbolInfo[]> {
        const response = await fetch('https://www.okx.com/api/v5/public/instruments?instType=SWAP');
        if (!response.ok) throw new Error('OKX Futures API error');
        const data = await response.json();

        if (!data.data) return [];

        return data.data
            .filter((s: any) => s.state === 'live' && s.settleCcy === 'USDT')
            .map((s: any): SymbolInfo => ({
                symbol: s.instId,  // Keep original format: BTC-USDT-SWAP
                full_name: `${s.ctValCcy} Perpetual`,
                description: `${s.ctValCcy} Perp`,
                exchange: 'OKX-FUTURES',
                type: 'crypto',
                logo_url: SymbolSearch.EXCHANGE_LOGOS['OKX-FUTURES'],
                logo_color: this._getRandomColor(s.ctValCcy),
                provider: 'okx-futures'
            }));
    }

    // ========================================================================
    // BYBIT
    // ========================================================================

    private async _fetchBybitSpotSymbols(): Promise<SymbolInfo[]> {
        const response = await fetch('https://api.bybit.com/v5/market/instruments-info?category=spot');
        if (!response.ok) throw new Error('Bybit Spot API error');
        const data = await response.json();

        if (!data.result?.list) return [];

        return data.result.list
            .filter((s: any) => s.status === 'Trading' && s.quoteCoin === 'USDT')
            .map((s: any): SymbolInfo => ({
                symbol: s.symbol,
                full_name: `${s.baseCoin} / ${s.quoteCoin}`,
                description: s.baseCoin,
                exchange: 'BYBIT',
                type: 'crypto',
                logo_url: SymbolSearch.EXCHANGE_LOGOS['BYBIT'],
                logo_color: this._getRandomColor(s.baseCoin),
                provider: 'bybit'
            }));
    }

    private async _fetchBybitFuturesSymbols(): Promise<SymbolInfo[]> {
        const response = await fetch('https://api.bybit.com/v5/market/instruments-info?category=linear');
        if (!response.ok) throw new Error('Bybit Futures API error');
        const data = await response.json();

        if (!data.result?.list) return [];

        return data.result.list
            .filter((s: any) => s.status === 'Trading' && s.quoteCoin === 'USDT' && s.contractType === 'LinearPerpetual')
            .map((s: any): SymbolInfo => ({
                symbol: s.symbol,
                full_name: `${s.baseCoin} Perpetual`,
                description: `${s.baseCoin} Perp`,
                exchange: 'BYBIT-FUTURES',
                type: 'crypto',
                logo_url: SymbolSearch.EXCHANGE_LOGOS['BYBIT-FUTURES'],
                logo_color: this._getRandomColor(s.baseCoin),
                provider: 'bybit-futures'
            }));
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private _getRandomColor(seed: string): string {
        const colors = [
            '#F7931A', '#627EEA', '#14F195', '#F3BA2F', '#23292F',
            '#0033AD', '#E84142', '#E6007A', '#8247E5', '#2A5ADA',
            '#C2A633', '#345D9D', '#28A0F0', '#FF0420', '#00D395'
        ];
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = seed.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    }

    private _showLoading(): void {
        if (!this._listContainer) return;
        this._listContainer.innerHTML = `
            <div style="padding: 48px; text-align: center; color: #787b86;">
                <div style="margin-bottom: 12px; font-size: 24px;">⏳ Loading...</div>
                <div style="font-size: 13px;">Fetching symbols from all exchanges</div>
                <div style="font-size: 11px; margin-top: 8px; color: #555;">Binance · OKX · Bybit</div>
            </div>
        `;
    }

    hide(): void {
        if (this._overlay) {
            this._overlay.style.display = 'none';
            if (this._searchInput) this._searchInput.value = '';
        }
    }

    // ========================================================================
    // UI Creation
    // ========================================================================

    private _createUI(): void {
        // Overlay
        this._overlay = document.createElement('div');
        this._overlay.className = 'symbol-search-overlay';
        this._overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif;
        `;

        // Dialog
        this._dialog = document.createElement('div');
        this._dialog.className = 'symbol-search-dialog';
        this._dialog.style.cssText = `
            width: 680px;
            max-height: 85vh;
            background: #1e222d;
            border: 1px solid #363a45;
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
            overflow: hidden;
        `;

        this._createHeader();
        this._createTabs();
        this._createExchangeFilter();
        this._createList();

        this._overlay.appendChild(this._dialog);
        document.body.appendChild(this._overlay);

        // Close on click outside
        this._overlay.addEventListener('click', (e) => {
            if (e.target === this._overlay) this.hide();
        });

        // Close on Escape
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hide();
        });
    }

    private _createHeader(): void {
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 16px 20px;
            border-bottom: 1px solid #363a45;
            display: flex;
            align-items: center;
            justify-content: space-between;
        `;

        const title = document.createElement('h2');
        title.textContent = 'Symbol Search';
        title.style.cssText = `
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #d1d4dc;
        `;
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 24px;
            color: #787b86;
            line-height: 1;
            padding: 0;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: all 0.15s;
        `;
        closeBtn.onmouseenter = () => { closeBtn.style.background = '#363a45'; closeBtn.style.color = '#d1d4dc'; };
        closeBtn.onmouseleave = () => { closeBtn.style.background = 'transparent'; closeBtn.style.color = '#787b86'; };
        closeBtn.onclick = () => this.hide();
        header.appendChild(closeBtn);

        this._dialog!.appendChild(header);

        // Search input row
        const searchRow = document.createElement('div');
        searchRow.style.cssText = `
            padding: 12px 20px;
            border-bottom: 1px solid #363a45;
            display: flex;
            align-items: center;
            gap: 12px;
        `;

        const searchIcon = document.createElement('span');
        searchIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" fill="#787b86"><path d="M14.386 12.972l4.857 4.856a1 1 0 01-1.414 1.415l-4.856-4.857a8 8 0 111.413-1.414zM8 14A6 6 0 108 2a6 6 0 000 12z"/></svg>`;
        searchRow.appendChild(searchIcon);

        this._searchInput = document.createElement('input');
        this._searchInput.type = 'text';
        this._searchInput.placeholder = 'Symbol, ISIN, or CUSIP';
        this._searchInput.style.cssText = `
            flex: 1;
            background: transparent;
            border: none;
            color: #d1d4dc;
            font-size: 15px;
            outline: none;
            font-family: inherit;
        `;
        this._searchInput.addEventListener('input', () => this._applyFilters());
        searchRow.appendChild(this._searchInput);

        this._dialog!.appendChild(searchRow);
    }

    private _createTabs(): void {
        this._tabsContainer = document.createElement('div');
        this._tabsContainer.style.cssText = `
            display: flex;
            gap: 4px;
            padding: 12px 20px;
            border-bottom: 1px solid #363a45;
            overflow-x: auto;
        `;

        this._config.categories.forEach(cat => {
            const tab = document.createElement('button');
            tab.textContent = TAB_LABELS[cat];
            tab.dataset.category = cat;
            tab.style.cssText = `
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                border: none;
                transition: all 0.15s;
                white-space: nowrap;
                font-family: inherit;
                ${cat === this._activeCategory
                    ? 'background: #2962ff; color: white;'
                    : 'background: #2a2e39; color: #787b86;'}
            `;

            tab.onmouseenter = () => {
                if (cat !== this._activeCategory) {
                    tab.style.background = '#363a45';
                    tab.style.color = '#d1d4dc';
                }
            };
            tab.onmouseleave = () => {
                if (cat !== this._activeCategory) {
                    tab.style.background = '#2a2e39';
                    tab.style.color = '#787b86';
                }
            };

            tab.onclick = () => this._selectCategory(cat);
            this._tabsContainer!.appendChild(tab);
        });

        this._dialog!.appendChild(this._tabsContainer);
    }

    private _createExchangeFilter(): void {
        const filterRow = document.createElement('div');
        filterRow.id = 'exchange-filter-row';
        filterRow.style.cssText = `
            display: ${this._activeCategory === 'crypto' || this._activeCategory === 'all' ? 'flex' : 'none'};
            gap: 8px;
            padding: 12px 20px;
            border-bottom: 1px solid #363a45;
            align-items: center;
            flex-wrap: wrap;
        `;

        const label = document.createElement('span');
        label.textContent = 'Exchange:';
        label.style.cssText = `
            font-size: 13px;
            color: #787b86;
        `;
        filterRow.appendChild(label);

        // Custom dropdown container
        const dropdownContainer = document.createElement('div');
        dropdownContainer.style.cssText = `position: relative;`;

        // Selected button
        const selectedBtn = document.createElement('button');
        selectedBtn.id = 'exchange-selected-btn';
        selectedBtn.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            background: #2a2e39;
            border: 1px solid #363a45;
            border-radius: 4px;
            color: #d1d4dc;
            padding: 6px 12px;
            font-size: 13px;
            cursor: pointer;
            font-family: inherit;
            min-width: 200px;
            justify-content: space-between;
        `;

        const updateSelectedBtn = (value: string, logoUrl: string | null, text: string) => {
            selectedBtn.innerHTML = '';
            const leftPart = document.createElement('span');
            leftPart.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            if (logoUrl) {
                const img = document.createElement('img');
                img.src = logoUrl;
                img.style.cssText = 'width: 16px; height: 16px; border-radius: 2px;';
                img.crossOrigin = 'anonymous';
                leftPart.appendChild(img);
            } else {
                // Globe icon for "All Exchanges"
                const globeIcon = document.createElement('span');
                globeIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="#2962ff"><circle cx="12" cy="12" r="10" stroke="#2962ff" stroke-width="2" fill="none"/><ellipse cx="12" cy="12" rx="4" ry="10" stroke="#2962ff" stroke-width="1.5" fill="none"/><line x1="2" y1="12" x2="22" y2="12" stroke="#2962ff" stroke-width="1.5"/></svg>`;
                leftPart.appendChild(globeIcon);
            }

            const textSpan = document.createElement('span');
            textSpan.textContent = text;
            leftPart.appendChild(textSpan);
            selectedBtn.appendChild(leftPart);

            const arrow = document.createElement('span');
            arrow.innerHTML = '▼';
            arrow.style.cssText = 'font-size: 10px; color: #787b86;';
            selectedBtn.appendChild(arrow);
        };

        updateSelectedBtn('all', null, 'All Exchanges');

        // Dropdown menu
        const dropdownMenu = document.createElement('div');
        dropdownMenu.style.cssText = `
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            background: #1e222d;
            border: 1px solid #363a45;
            border-radius: 4px;
            min-width: 220px;
            max-height: 300px;
            overflow-y: auto;
            z-index: 1000;
            margin-top: 4px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        `;

        const exchangeOptions = [
            { value: 'all', label: 'All Exchanges', logo: null },
            { value: 'BINANCE', label: 'Binance (Spot)', logo: SymbolSearch.EXCHANGE_LOGOS['BINANCE'] },
            { value: 'BINANCE-FUTURES', label: 'Binance Futures', logo: SymbolSearch.EXCHANGE_LOGOS['BINANCE-FUTURES'] },
            { value: 'BYBIT', label: 'Bybit (Spot)', logo: SymbolSearch.EXCHANGE_LOGOS['BYBIT'] },
            { value: 'BYBIT-FUTURES', label: 'Bybit Futures', logo: SymbolSearch.EXCHANGE_LOGOS['BYBIT-FUTURES'] },
            { value: 'OKX', label: 'OKX (Spot)', logo: SymbolSearch.EXCHANGE_LOGOS['OKX'] },
            { value: 'OKX-FUTURES', label: 'OKX Futures', logo: SymbolSearch.EXCHANGE_LOGOS['OKX-FUTURES'] },
        ];

        exchangeOptions.forEach(opt => {
            const item = document.createElement('div');
            item.style.cssText = `
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px 14px;
                cursor: pointer;
                transition: background 0.15s;
            `;

            if (opt.logo) {
                const img = document.createElement('img');
                img.src = opt.logo;
                img.style.cssText = 'width: 20px; height: 20px; border-radius: 3px;';
                img.crossOrigin = 'anonymous';
                item.appendChild(img);
            } else {
                const globeIcon = document.createElement('span');
                globeIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="#2962ff"><circle cx="12" cy="12" r="10" stroke="#2962ff" stroke-width="2" fill="none"/><ellipse cx="12" cy="12" rx="4" ry="10" stroke="#2962ff" stroke-width="1.5" fill="none"/><line x1="2" y1="12" x2="22" y2="12" stroke="#2962ff" stroke-width="1.5"/></svg>`;
                item.appendChild(globeIcon);
            }

            const text = document.createElement('span');
            text.textContent = opt.label;
            text.style.cssText = 'color: #d1d4dc; font-size: 13px;';
            item.appendChild(text);

            item.addEventListener('mouseenter', () => { item.style.background = '#2a2e39'; });
            item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });

            item.addEventListener('click', () => {
                this._cryptoExchange = opt.value;
                updateSelectedBtn(opt.value, opt.logo, opt.label);
                dropdownMenu.style.display = 'none';
                this._applyFilters();
            });

            dropdownMenu.appendChild(item);
        });

        // Toggle dropdown
        selectedBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.style.display = dropdownMenu.style.display === 'none' ? 'block' : 'none';
        });

        // Close on outside click
        document.addEventListener('click', () => {
            dropdownMenu.style.display = 'none';
        });

        dropdownContainer.appendChild(selectedBtn);
        dropdownContainer.appendChild(dropdownMenu);
        filterRow.appendChild(dropdownContainer);
        this._dialog!.appendChild(filterRow);
    }

    private _updateExchangeFilterVisibility(): void {
        const filterRow = this._dialog?.querySelector('#exchange-filter-row') as HTMLElement;
        if (filterRow) {
            // Show for crypto and all categories
            filterRow.style.display = (this._activeCategory === 'crypto' || this._activeCategory === 'all') ? 'flex' : 'none';
        }
    }

    private _createList(): void {
        this._listContainer = document.createElement('div');
        this._listContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            min-height: 300px;
            max-height: 400px;
        `;
        this._dialog!.appendChild(this._listContainer);
    }

    // ========================================================================
    // Category Selection
    // ========================================================================

    private _selectCategory(category: SymbolType): void {
        this._activeCategory = category;

        // Update tab styles
        const tabs = this._tabsContainer?.querySelectorAll('button');
        tabs?.forEach(tab => {
            const el = tab as HTMLButtonElement;
            const cat = el.dataset.category;
            if (cat === category) {
                el.style.background = '#2962ff';
                el.style.color = 'white';
            } else {
                el.style.background = '#2a2e39';
                el.style.color = '#787b86';
            }
        });

        // Show/hide exchange filter based on category
        this._updateExchangeFilterVisibility();

        this._applyFilters();
    }

    // ========================================================================
    // Filtering & Rendering
    // ========================================================================

    private _applyFilters(): void {
        const query = this._searchInput?.value.toLowerCase() || '';

        let filtered = this._symbols;

        // Category filter
        if (this._activeCategory !== 'all') {
            filtered = filtered.filter(s => s.type === this._activeCategory);
        }

        // Exchange filter (for crypto)
        if (this._cryptoExchange !== 'all') {
            filtered = filtered.filter(s => s.exchange === this._cryptoExchange);
        }

        // Search filter
        if (query) {
            filtered = filtered.filter(s =>
                s.symbol.toLowerCase().includes(query) ||
                s.description.toLowerCase().includes(query) ||
                s.full_name.toLowerCase().includes(query)
            );
        }

        this._renderList(filtered);
    }

    private _renderList(symbols: SymbolInfo[]): void {
        if (!this._listContainer) return;
        this._listContainer.innerHTML = '';

        if (symbols.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'No symbols found';
            empty.style.cssText = `
                padding: 48px;
                text-align: center;
                color: #787b86;
                font-size: 14px;
            `;
            this._listContainer.appendChild(empty);
            return;
        }

        symbols.forEach(symbol => {
            const row = this._createSymbolRow(symbol);
            this._listContainer!.appendChild(row);
        });
    }

    private _createSymbolRow(symbol: SymbolInfo): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            align-items: center;
            padding: 10px 20px;
            cursor: pointer;
            transition: background 0.1s;
            gap: 14px;
        `;

        // Logo
        const logo = document.createElement('div');
        logo.style.cssText = `
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: ${symbol.logo_color || '#363a45'};
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 11px;
            font-weight: bold;
            flex-shrink: 0;
        `;
        logo.textContent = symbol.symbol.substring(0, 2);
        row.appendChild(logo);

        // Info
        const info = document.createElement('div');
        info.style.cssText = `flex: 1; min-width: 0;`;

        const mainLine = document.createElement('div');
        mainLine.style.cssText = `display: flex; align-items: center; gap: 8px;`;

        const symbolName = document.createElement('span');
        symbolName.textContent = symbol.symbol;
        symbolName.style.cssText = `font-weight: 600; color: #d1d4dc; font-size: 14px;`;
        mainLine.appendChild(symbolName);

        const description = document.createElement('span');
        description.textContent = symbol.description;
        description.style.cssText = `color: #787b86; font-size: 13px;`;
        mainLine.appendChild(description);

        info.appendChild(mainLine);
        row.appendChild(info);

        // Type badge
        const type = document.createElement('span');
        type.textContent = symbol.type;
        type.style.cssText = `
            font-size: 11px;
            color: #787b86;
            text-transform: lowercase;
        `;
        row.appendChild(type);

        // Exchange badge
        const exchange = document.createElement('span');
        exchange.textContent = symbol.exchange;
        exchange.style.cssText = `
            font-size: 11px;
            color: #787b86;
            background: #2a2e39;
            padding: 2px 6px;
            border-radius: 3px;
        `;
        row.appendChild(exchange);

        // Exchange logo icon
        if (symbol.logo_url) {
            const logoImg = document.createElement('img');
            logoImg.src = symbol.logo_url;
            logoImg.alt = symbol.exchange;
            logoImg.title = symbol.provider || symbol.exchange;
            logoImg.style.cssText = `
                width: 18px;
                height: 18px;
                border-radius: 4px;
            `;
            logoImg.crossOrigin = 'anonymous';
            row.appendChild(logoImg);
        }

        // Hover effects
        row.addEventListener('mouseenter', () => {
            row.style.background = '#2a2e39';
        });
        row.addEventListener('mouseleave', () => {
            row.style.background = 'transparent';
        });

        // Click
        row.addEventListener('click', () => {
            this._symbolSelected.fire(symbol);
            this.hide();
        });

        return row;
    }

    // ========================================================================
    // Cleanup
    // ========================================================================

    dispose(): void {
        this._symbolSelected.destroy();
        if (this._overlay && this._overlay.parentNode) {
            this._overlay.parentNode.removeChild(this._overlay);
        }
        this._overlay = null;
    }
}
