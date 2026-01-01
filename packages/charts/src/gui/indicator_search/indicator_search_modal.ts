/**
 * Indicator Search Modal - Modern, clean TradingView-style design
 */

import { Delegate } from '../../helpers/delegate';

export interface IndicatorItem {
    id: string;
    name: string;
    shortName: string;
    description: string;
    category: 'trend' | 'momentum' | 'volatility' | 'volume';
    type: 'overlay' | 'panel';
}

const AVAILABLE_INDICATORS: IndicatorItem[] = [
    {
        id: 'ema',
        name: 'Exponential Moving Average',
        shortName: 'EMA',
        description: 'Trend-following indicator that gives more weight to recent prices',
        category: 'trend',
        type: 'overlay'
    },
    {
        id: 'rsi',
        name: 'Relative Strength Index',
        shortName: 'RSI',
        description: 'Momentum oscillator measuring speed and change of price movements',
        category: 'momentum',
        type: 'panel'
    },
    {
        id: 'sma',
        name: 'Simple Moving Average',
        shortName: 'SMA',
        description: 'Average price over a specified period',
        category: 'trend',
        type: 'overlay'
    },
    {
        id: 'bb',
        name: 'Bollinger Bands',
        shortName: 'BB',
        description: 'Volatility bands placed above and below a moving average',
        category: 'volatility',
        type: 'overlay'
    },
    {
        id: 'macd',
        name: 'MACD',
        shortName: 'MACD',
        description: 'Trend-following momentum indicator showing relationship between two EMAs',
        category: 'momentum',
        type: 'panel'
    },
    {
        id: 'stoch',
        name: 'Stochastic',
        shortName: 'STOCH',
        description: 'Momentum indicator comparing closing price to price range',
        category: 'momentum',
        type: 'panel'
    },
];

export class IndicatorSearchModal {
    private _element: HTMLElement | null = null;
    private _overlay: HTMLElement | null = null;
    private _searchInput: HTMLInputElement | null = null;
    private _resultsList: HTMLElement | null = null;
    private _activeCategory: string = 'all';

    private readonly _indicatorSelected = new Delegate<string>();
    private readonly _closed = new Delegate<void>();

    constructor(private _container: HTMLElement) {
        this._createElement();
    }

    get indicatorSelected(): Delegate<string> {
        return this._indicatorSelected;
    }

    get closed(): Delegate<void> {
        return this._closed;
    }

    show(): void {
        if (this._overlay && this._element) {
            this._overlay.style.display = 'flex';
            this._searchInput?.focus();
            this._filterIndicators();
        }
    }

    hide(): void {
        if (this._overlay) {
            this._overlay.style.display = 'none';
            this._closed.fire();
        }
    }

    private _createElement(): void {
        // Overlay
        this._overlay = document.createElement('div');
        this._overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        // Modal
        this._element = document.createElement('div');
        this._element.style.cssText = `
            background: white;
            border-radius: 12px;
            width: 480px;
            max-width: 95vw;
            max-height: 600px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            overflow: hidden;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 20px 24px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid #e0e3eb;
        `;

        const title = document.createElement('div');
        title.textContent = 'Add Indicator';
        title.style.cssText = `
            font-size: 18px;
            font-weight: 600;
            color: #131722;
        `;
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#787b86" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        closeBtn.style.cssText = `
            background: none;
            border: none;
            cursor: pointer;
            padding: 6px;
            border-radius: 6px;
            display: flex;
            transition: background 0.15s;
        `;
        closeBtn.onmouseenter = () => closeBtn.style.background = '#f0f3fa';
        closeBtn.onmouseleave = () => closeBtn.style.background = 'none';
        closeBtn.onclick = () => this.hide();
        header.appendChild(closeBtn);

        this._element.appendChild(header);

        // Search
        const searchContainer = document.createElement('div');
        searchContainer.style.cssText = `
            padding: 12px 24px;
            position: relative;
        `;

        const searchIcon = document.createElement('span');
        searchIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#787b86" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`;
        searchIcon.style.cssText = `
            position: absolute;
            left: 36px;
            top: 50%;
            transform: translateY(-50%);
            display: flex;
            pointer-events: none;
        `;
        searchContainer.appendChild(searchIcon);

        this._searchInput = document.createElement('input');
        this._searchInput.type = 'text';
        this._searchInput.placeholder = 'Search indicators...';
        this._searchInput.style.cssText = `
            width: 100%;
            background: #f0f3fa;
            border: none;
            border-radius: 8px;
            padding: 12px 16px 12px 44px;
            font-size: 14px;
            color: #131722;
            outline: none;
            transition: all 0.15s;
        `;
        this._searchInput.onfocus = () => {
            this._searchInput!.style.background = '#e8ebf2';
        };
        this._searchInput.onblur = () => {
            this._searchInput!.style.background = '#f0f3fa';
        };
        this._searchInput.oninput = () => this._filterIndicators();
        searchContainer.appendChild(this._searchInput);

        this._element.appendChild(searchContainer);

        // Category tabs
        const tabsContainer = document.createElement('div');
        tabsContainer.style.cssText = `
            padding: 0 24px;
            display: flex;
            gap: 4px;
            border-bottom: 1px solid #e0e3eb;
        `;

        const categories = [
            { id: 'all', label: 'All' },
            { id: 'trend', label: 'Trend' },
            { id: 'momentum', label: 'Momentum' },
            { id: 'volatility', label: 'Volatility' },
        ];

        categories.forEach(cat => {
            const tab = document.createElement('button');
            tab.textContent = cat.label;
            tab.dataset.category = cat.id;
            tab.style.cssText = `
                background: none;
                border: none;
                padding: 12px 16px;
                font-size: 13px;
                font-weight: 500;
                color: ${cat.id === 'all' ? '#131722' : '#787b86'};
                cursor: pointer;
                position: relative;
                transition: color 0.15s;
            `;

            if (cat.id === 'all') {
                const underline = document.createElement('div');
                underline.className = 'tab-underline';
                underline.style.cssText = `
                    position: absolute;
                    bottom: -1px;
                    left: 0;
                    right: 0;
                    height: 2px;
                    background: #2962ff;
                `;
                tab.appendChild(underline);
            }

            tab.onmouseenter = () => {
                if (tab.dataset.category !== this._activeCategory) {
                    tab.style.color = '#131722';
                }
            };
            tab.onmouseleave = () => {
                if (tab.dataset.category !== this._activeCategory) {
                    tab.style.color = '#787b86';
                }
            };
            tab.onclick = () => {
                this._activeCategory = cat.id;
                // Update tab styles
                tabsContainer.querySelectorAll('button').forEach((btn: Element) => {
                    const b = btn as HTMLButtonElement;
                    const isActive = b.dataset.category === this._activeCategory;
                    b.style.color = isActive ? '#131722' : '#787b86';
                    const underline = b.querySelector('.tab-underline') as HTMLElement;
                    if (underline) underline.remove();
                    if (isActive) {
                        const ul = document.createElement('div');
                        ul.className = 'tab-underline';
                        ul.style.cssText = `
                            position: absolute;
                            bottom: -1px;
                            left: 0;
                            right: 0;
                            height: 2px;
                            background: #2962ff;
                        `;
                        b.appendChild(ul);
                    }
                });
                this._filterIndicators();
            };

            tabsContainer.appendChild(tab);
        });

        this._element.appendChild(tabsContainer);

        // Results list
        this._resultsList = document.createElement('div');
        this._resultsList.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 8px 0;
        `;

        this._element.appendChild(this._resultsList);
        this._overlay.appendChild(this._element);
        this._container.appendChild(this._overlay);

        // Close on overlay click
        this._overlay.onclick = (e) => {
            if (e.target === this._overlay) this.hide();
        };

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._overlay?.style.display === 'flex') {
                this.hide();
            }
        });
    }

    private _filterIndicators(): void {
        const query = this._searchInput?.value.toLowerCase() || '';
        let filtered = AVAILABLE_INDICATORS.filter(ind =>
            ind.name.toLowerCase().includes(query) ||
            ind.shortName.toLowerCase().includes(query) ||
            ind.description.toLowerCase().includes(query)
        );

        if (this._activeCategory !== 'all') {
            filtered = filtered.filter(ind => ind.category === this._activeCategory);
        }

        this._renderResults(filtered);
    }

    private _renderResults(indicators: IndicatorItem[]): void {
        if (!this._resultsList) return;

        this._resultsList.innerHTML = '';

        if (indicators.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'No indicators found';
            empty.style.cssText = `
                padding: 40px;
                text-align: center;
                color: #787b86;
                font-size: 14px;
            `;
            this._resultsList.appendChild(empty);
            return;
        }

        indicators.forEach(ind => {
            const row = document.createElement('div');
            row.style.cssText = `
                padding: 12px 24px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 12px;
                transition: background 0.1s;
            `;
            row.onmouseenter = () => row.style.background = '#f0f3fa';
            row.onmouseleave = () => row.style.background = 'transparent';

            // Icon based on type
            const icon = document.createElement('div');
            icon.innerHTML = ind.type === 'overlay'
                ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2962ff" stroke-width="2"><path d="M3 17l6-6 4 4 8-8"/></svg>`
                : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff6d00" stroke-width="2"><rect x="3" y="10" width="4" height="10"/><rect x="10" y="6" width="4" height="14"/><rect x="17" y="2" width="4" height="18"/></svg>`;
            icon.style.cssText = `
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: ${ind.type === 'overlay' ? 'rgba(41, 98, 255, 0.1)' : 'rgba(255, 109, 0, 0.1)'};
                border-radius: 8px;
                flex-shrink: 0;
            `;
            row.appendChild(icon);

            // Text content
            const textContainer = document.createElement('div');
            textContainer.style.cssText = `flex: 1; min-width: 0;`;

            const nameRow = document.createElement('div');
            nameRow.style.cssText = `display: flex; align-items: center; gap: 8px;`;

            const name = document.createElement('div');
            name.textContent = ind.name;
            name.style.cssText = `
                font-size: 14px;
                font-weight: 500;
                color: #131722;
            `;
            nameRow.appendChild(name);

            const badge = document.createElement('span');
            badge.textContent = ind.shortName;
            badge.style.cssText = `
                font-size: 11px;
                font-weight: 600;
                color: #787b86;
                background: #f0f3fa;
                padding: 2px 6px;
                border-radius: 4px;
            `;
            nameRow.appendChild(badge);

            textContainer.appendChild(nameRow);

            const desc = document.createElement('div');
            desc.textContent = ind.description;
            desc.style.cssText = `
                font-size: 12px;
                color: #787b86;
                margin-top: 2px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            `;
            textContainer.appendChild(desc);

            row.appendChild(textContainer);

            // Plus icon
            const addIcon = document.createElement('div');
            addIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#787b86" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
            addIcon.style.cssText = `
                opacity: 0;
                transition: opacity 0.15s;
            `;
            row.onmouseenter = () => {
                row.style.background = '#f0f3fa';
                addIcon.style.opacity = '1';
            };
            row.onmouseleave = () => {
                row.style.background = 'transparent';
                addIcon.style.opacity = '0';
            };
            row.appendChild(addIcon);

            row.onclick = () => {
                this._indicatorSelected.fire(ind.id);
                this.hide();
            };

            this._resultsList!.appendChild(row);
        });
    }

    dispose(): void {
        this._indicatorSelected.destroy();
        this._closed.destroy();
        if (this._overlay?.parentNode) {
            this._overlay.parentNode.removeChild(this._overlay);
        }
        this._overlay = null;
        this._element = null;
    }
}
