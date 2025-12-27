/**
 * Symbol Search Modal - TradingView-style symbol search
 */

import { Delegate } from '../helpers/delegate';

export interface SymbolInfo {
    symbol: string;
    full_name: string;
    description: string;
    exchange: string;
    type: string;
    logo_color?: string;
}

const MOCK_SYMBOLS: SymbolInfo[] = [
    { symbol: 'BTCUSDT', full_name: 'Bitcoin / TetherUS', description: 'Bitcoin', exchange: 'BINANCE', type: 'crypto', logo_color: '#F7931A' },
    { symbol: 'ETHUSDT', full_name: 'Ethereum / TetherUS', description: 'Ethereum', exchange: 'BINANCE', type: 'crypto', logo_color: '#627EEA' },
    { symbol: 'SOLUSDT', full_name: 'Solana / TetherUS', description: 'Solana', exchange: 'BINANCE', type: 'crypto', logo_color: '#14F195' },
    { symbol: 'BNBUSDT', full_name: 'BNB / TetherUS', description: 'BNB', exchange: 'BINANCE', type: 'crypto', logo_color: '#F3BA2F' },
    { symbol: 'XRPUSDT', full_name: 'XRP / TetherUS', description: 'XRP', exchange: 'BINANCE', type: 'crypto', logo_color: '#23292F' },
    { symbol: 'ADAUSDT', full_name: 'Cardano / TetherUS', description: 'Cardano', exchange: 'BINANCE', type: 'crypto', logo_color: '#0033AD' },
    { symbol: 'AVAXUSDT', full_name: 'Avalanche / TetherUS', description: 'Avalanche', exchange: 'BINANCE', type: 'crypto', logo_color: '#E84142' },
    { symbol: 'DOTUSDT', full_name: 'Polkadot / TetherUS', description: 'Polkadot', exchange: 'BINANCE', type: 'crypto', logo_color: '#E6007A' },
    { symbol: 'MATICUSDT', full_name: 'Polygon / TetherUS', description: 'Polygon', exchange: 'BINANCE', type: 'crypto', logo_color: '#8247E5' },
    { symbol: 'LINKUSDT', full_name: 'Chainlink / TetherUS', description: 'Chainlink', exchange: 'BINANCE', type: 'crypto', logo_color: '#2A5ADA' },
];

/**
 * TradingView-style Symbol Search Modal
 */
export class SymbolSearch {
    private _overlay: HTMLElement | null = null;
    private _dialog: HTMLElement | null = null;
    private _listContainer: HTMLElement | null = null;
    private _searchInput: HTMLInputElement | null = null;
    private _symbols: SymbolInfo[] = MOCK_SYMBOLS;

    // Events
    private readonly _symbolSelected = new Delegate<SymbolInfo>();

    constructor() {
        this._createUI();
    }

    get symbolSelected(): Delegate<SymbolInfo> {
        return this._symbolSelected;
    }

    show(): void {
        if (this._overlay) {
            this._overlay.style.display = 'flex';
            this._searchInput?.focus();
            this._renderList(this._symbols);
        }
    }

    hide(): void {
        if (this._overlay) {
            this._overlay.style.display = 'none';
            if (this._searchInput) this._searchInput.value = '';
        }
    }

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
            background: rgba(0, 0, 0, 0.5);
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif;
        `;

        // Dialog
        this._dialog = document.createElement('div');
        this._dialog.className = 'symbol-search-dialog';
        this._dialog.style.cssText = `
            width: 600px;
            height: 480px;
            background: #1e222d;
            border: 1px solid #363a45;
            border-radius: 6px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
            overflow: hidden;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 16px;
            border-bottom: 1px solid #363a45;
            display: flex;
            align-items: center;
            gap: 12px;
        `;

        const searchIcon = document.createElement('span');
        searchIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="#787b86"><path d="M14.386 12.972l4.857 4.856a1 1 0 01-1.414 1.415l-4.856-4.857a8 8 0 111.413-1.414zM8 14A6 6 0 108 2a6 6 0 000 12z"/></svg>`;
        header.appendChild(searchIcon);

        this._searchInput = document.createElement('input');
        this._searchInput.type = 'text';
        this._searchInput.placeholder = 'Search';
        this._searchInput.style.cssText = `
            flex: 1;
            background: transparent;
            border: none;
            color: #d1d4dc;
            font-size: 16px;
            outline: none;
            font-family: inherit;
        `;
        this._searchInput.addEventListener('input', () => this._handleSearch());
        header.appendChild(this._searchInput);

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="#787b86"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
        closeBtn.style.cssText = `
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            color: #787b86;
        `;
        closeBtn.onclick = () => this.hide();
        header.appendChild(closeBtn);

        this._dialog.appendChild(header);

        // List Container
        this._listContainer = document.createElement('div');
        this._listContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 8px 0;
        `;
        this._dialog.appendChild(this._listContainer);

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

    private _handleSearch(): void {
        const query = this._searchInput?.value.toLowerCase() || '';
        const filtered = this._symbols.filter(s =>
            s.symbol.toLowerCase().includes(query) ||
            s.description.toLowerCase().includes(query) ||
            s.full_name.toLowerCase().includes(query)
        );
        this._renderList(filtered);
    }

    private _renderList(symbols: SymbolInfo[]): void {
        if (!this._listContainer) return;
        this._listContainer.innerHTML = '';

        if (symbols.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'No symbols found';
            empty.style.cssText = `
                padding: 32px;
                text-align: center;
                color: #787b86;
            `;
            this._listContainer.appendChild(empty);
            return;
        }

        symbols.forEach(symbol => {
            const row = document.createElement('div');
            row.style.cssText = `
                display: flex;
                align-items: center;
                padding: 10px 16px;
                cursor: pointer;
                transition: background 0.1s;
                gap: 12px;
            `;

            // Logo placeholder
            const logo = document.createElement('div');
            logo.style.cssText = `
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: ${symbol.logo_color || '#363a45'};
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 10px;
                font-weight: bold;
                flex-shrink: 0;
            `;
            logo.textContent = symbol.symbol.substring(0, 1);
            row.appendChild(logo);

            const info = document.createElement('div');
            info.style.cssText = `
                display: flex;
                flex-direction: column;
                flex: 1;
            `;

            const mainLine = document.createElement('div');
            mainLine.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
            `;

            const symbolName = document.createElement('span');
            symbolName.textContent = symbol.symbol;
            symbolName.style.cssText = `
                font-weight: 600;
                color: #d1d4dc;
                font-size: 14px;
            `;
            mainLine.appendChild(symbolName);

            const exchange = document.createElement('span');
            exchange.textContent = symbol.exchange;
            exchange.style.cssText = `
                font-size: 11px;
                color: #787b86;
                background: #2a2e39;
                padding: 2px 4px;
                border-radius: 2px;
            `;
            mainLine.appendChild(exchange);

            info.appendChild(mainLine);

            const description = document.createElement('span');
            description.textContent = symbol.full_name;
            description.style.cssText = `
                font-size: 12px;
                color: #787b86;
                margin-top: 2px;
            `;
            info.appendChild(description);

            row.appendChild(info);

            const type = document.createElement('span');
            type.textContent = symbol.type.toUpperCase();
            type.style.cssText = `
                font-size: 11px;
                color: #787b86;
            `;
            row.appendChild(type);

            row.addEventListener('mouseenter', () => {
                row.style.background = '#2a2e39';
            });
            row.addEventListener('mouseleave', () => {
                row.style.background = 'transparent';
            });
            row.addEventListener('click', () => {
                this._symbolSelected.fire(symbol);
                this.hide();
            });

            this._listContainer!.appendChild(row);
        });
    }

    dispose(): void {
        this._symbolSelected.destroy();
        if (this._overlay && this._overlay.parentNode) {
            this._overlay.parentNode.removeChild(this._overlay);
        }
        this._overlay = null;
    }
}
