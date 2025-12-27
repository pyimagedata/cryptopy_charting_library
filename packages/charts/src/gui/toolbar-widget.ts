/**
 * Top Toolbar Widget - TradingView-style toolbar
 */

import { Delegate } from '../helpers/delegate';

// SVG Icons for toolbar
const TOOLBAR_ICONS = {
    search: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
    </svg>`,
    candles: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="currentColor"><path d="M17 11v6h3v-6h-3zm-.5-1h4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5z"></path><path d="M18 7h1v3.5h-1zm0 10.5h1V21h-1z"></path><path d="M9 8v12h3V8H9zm-.5-1h4a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5z"></path><path d="M10 4h1v3.5h-1zm0 16.5h1V24h-1z"></path></svg>`,
    line: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18"><path fill="currentColor" d="m25.39 7.31-8.83 10.92-6.02-5.47-7.16 8.56-.76-.64 7.82-9.36 6 5.45L24.61 6.7l.78.62Z"></path></svg>`,
    area: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18"><path fill="currentColor" fill-rule="evenodd" d="m25.35 5.35-9.5 9.5-.35.36-.35-.36-4.65-4.64-8.15 8.14-.7-.7 8.5-8.5.35-.36.35.36 4.65 4.64 9.15-9.14.7.7ZM2 21h1v1H2v-1Zm2-1H3v1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v-1h1V9h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v1H9v1H8v1H7v1H6v1H5v1H4v1Zm1 0v1H4v-1h1Zm1 0H5v-1h1v1Zm1 0v1H6v-1h1Zm0-1H6v-1h1v1Zm1 0H7v1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v1H9v1H8v1H7v1h1v1Zm1 0v1H8v-1h1Zm0-1H8v-1h1v1Zm1 0H9v1h1v1h1v-1h1v1h1v-1h1v1h1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v1H9v1h1v1Zm1 0v1h-1v-1h1Zm0-1v-1h-1v1h1Zm0 0v1h1v1h1v-1h-1v-1h-1Zm6 2v-1h1v1h-1Zm2 0v1h-1v-1h1Zm0-1h-1v-1h1v1Zm1 0h-1v1h1v1h1v-1h1v1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v1h-1v1h-1v1h-1v1h1v1Zm1 0h-1v1h1v-1Zm0-1h1v1h-1v-1Zm0-1h1v-1h-1v1Zm0 0v1h-1v-1h1Zm-4 3v1h-1v-1h1Z"></path></svg>`,
    indicators: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="none"><path stroke="currentColor" d="M6 12l4.8-4.8a1 1 0 0 1 1.4 0l2.7 2.7a1 1 0 0 0 1.3.1L23 5"></path><path fill="currentColor" fill-rule="evenodd" d="M19 12a1 1 0 0 0-1 1v4h-3v-1a1 1 0 0 0-1-1h-3a1 1 0 0 0-1 1v2H7a1 1 0 0 0-1 1v4h17V13a1 1 0 0 0-1-1h-3zm0 10h3v-9h-3v9zm-1 0v-4h-3v4h3zm-4-4.5V22h-3v-6h3v1.5zM10 22v-3H7v3h3z"></path></svg>`,
    compare: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="6" cy="6" r="4"/>
        <circle cx="12" cy="12" r="4"/>
    </svg>`,
    alert: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M9 2v6M9 12v1" stroke-linecap="round"/>
        <circle cx="9" cy="9" r="7"/>
    </svg>`,
    dropdown: `<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
        <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
};

export type ChartType = 'candles' | 'line' | 'area' | 'heiken-ashi';

export interface ToolbarOptions {
    symbol?: string;
    timeframe?: string;
    chartType?: ChartType;
    timeframes?: string[];
}

const defaultToolbarOptions: ToolbarOptions = {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    chartType: 'candles',
    timeframes: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', 'D', 'W'],
};

/**
 * TradingView-style top toolbar
 */
export class ToolbarWidget {
    private _element: HTMLElement | null = null;
    private _options: ToolbarOptions;
    private _activeTimeframe: string;
    private _activeChartType: ChartType;

    // Events
    private readonly _symbolClicked = new Delegate<void>();
    private readonly _timeframeChanged = new Delegate<string>();
    private readonly _chartTypeChanged = new Delegate<ChartType>();
    private readonly _indicatorsClicked = new Delegate<void>();

    constructor(container: HTMLElement, options: Partial<ToolbarOptions> = {}) {
        this._options = { ...defaultToolbarOptions, ...options };
        this._activeTimeframe = this._options.timeframe!;
        this._activeChartType = this._options.chartType!;
        this._createElement(container);
    }

    // --- Public getters ---

    get element(): HTMLElement | null {
        return this._element;
    }

    get height(): number {
        return 38;
    }

    get symbolClicked(): Delegate<void> {
        return this._symbolClicked;
    }

    get timeframeChanged(): Delegate<string> {
        return this._timeframeChanged;
    }

    get chartTypeChanged(): Delegate<ChartType> {
        return this._chartTypeChanged;
    }

    get indicatorsClicked(): Delegate<void> {
        return this._indicatorsClicked;
    }

    // --- Public methods ---

    setSymbol(symbol: string): void {
        this._options.symbol = symbol;
        const symbolEl = this._element?.querySelector('.toolbar-symbol-name');
        if (symbolEl) {
            symbolEl.textContent = symbol;
        }
    }

    setTimeframe(timeframe: string): void {
        if (this._activeTimeframe === timeframe) return;
        this._activeTimeframe = timeframe;
        this._updateTimeframeButtons();
        this._timeframeChanged.fire(timeframe);
    }

    setChartType(type: ChartType): void {
        if (this._activeChartType === type) return;
        this._activeChartType = type;
        this._updateChartTypeButtons();
        this._chartTypeChanged.fire(type);
    }

    // --- Private methods ---

    private _createElement(container: HTMLElement): void {
        this._element = document.createElement('div');
        this._element.className = 'chart-toolbar';
        this._element.style.cssText = `
            display: flex;
            align-items: center;
            height: 38px;
            background: #131722;
            border-bottom: 1px solid #2B2B43;
            padding: 0 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif;
            font-size: 13px;
            user-select: none;
            gap: 4px;
        `;

        // Symbol section
        this._createSymbolSection();

        // Separator
        this._createSeparator();

        // Timeframe buttons
        this._createTimeframeButtons();

        // Separator
        this._createSeparator();

        // Chart type buttons
        this._createChartTypeButtons();

        // Separator
        this._createSeparator();

        // Indicators button
        this._createIndicatorsButton();

        container.insertBefore(this._element, container.firstChild);
    }

    private _createSymbolSection(): void {
        const symbolSection = document.createElement('div');
        symbolSection.className = 'toolbar-symbol';
        symbolSection.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            border-radius: 4px;
            cursor: pointer;
            color: #d1d4dc;
            transition: background 0.15s;
        `;

        // Search icon
        const searchIcon = document.createElement('span');
        searchIcon.innerHTML = TOOLBAR_ICONS.search;
        searchIcon.style.cssText = `
            display: flex;
            align-items: center;
            color: #787b86;
        `;
        symbolSection.appendChild(searchIcon);

        // Symbol name
        const symbolName = document.createElement('span');
        symbolName.className = 'toolbar-symbol-name';
        symbolName.textContent = this._options.symbol!;
        symbolName.style.cssText = `
            font-weight: 600;
            color: #d1d4dc;
        `;
        symbolSection.appendChild(symbolName);

        // Dropdown icon
        const dropdownIcon = document.createElement('span');
        dropdownIcon.innerHTML = TOOLBAR_ICONS.dropdown;
        dropdownIcon.style.cssText = `
            display: flex;
            align-items: center;
            color: #787b86;
            margin-left: 2px;
        `;
        symbolSection.appendChild(dropdownIcon);

        // Hover effect
        symbolSection.addEventListener('mouseenter', () => {
            symbolSection.style.background = '#2a2e39';
        });
        symbolSection.addEventListener('mouseleave', () => {
            symbolSection.style.background = 'transparent';
        });
        symbolSection.addEventListener('click', () => {
            this._symbolClicked.fire();
        });

        this._element!.appendChild(symbolSection);
    }

    private _createSeparator(): void {
        const separator = document.createElement('div');
        separator.style.cssText = `
            width: 1px;
            height: 20px;
            background: #2B2B43;
            margin: 0 4px;
        `;
        this._element!.appendChild(separator);
    }

    private _createTimeframeButtons(): void {
        const container = document.createElement('div');
        container.className = 'toolbar-timeframes';
        container.style.cssText = `
            display: flex;
            align-items: center;
            gap: 2px;
        `;

        this._options.timeframes!.forEach(tf => {
            const isActive = tf === this._activeTimeframe;
            const btn = this._createButton(tf, isActive);
            btn.dataset.timeframe = tf;
            btn.dataset.active = isActive.toString();
            btn.addEventListener('click', () => {
                this.setTimeframe(tf);
            });
            container.appendChild(btn);
        });

        this._element!.appendChild(container);
    }

    private _createChartTypeButtons(): void {
        const container = document.createElement('div');
        container.className = 'toolbar-chart-types';
        container.style.cssText = `
            display: flex;
            align-items: center;
            gap: 2px;
        `;

        const types: { type: ChartType; icon: string; title: string }[] = [
            { type: 'candles', icon: TOOLBAR_ICONS.candles, title: 'Candlestick' },
            { type: 'line', icon: TOOLBAR_ICONS.line, title: 'Line' },
            { type: 'area', icon: TOOLBAR_ICONS.area, title: 'Area' },
            {
                type: 'heiken-ashi',
                icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="currentColor"><path d="M9 8v12h3V8H9zm-1-.502C8 7.223 8.215 7 8.498 7h4.004c.275 0 .498.22.498.498v13.004a.493.493 0 0 1-.498.498H8.498A.496.496 0 0 1 8 20.502V7.498z"></path><path d="M10 4h1v3.5h-1z"></path><path d="M17 6v6h3V6h-3zm-1-.5c0-.276.215-.5.498-.5h4.004c.275 0 .498.23.498.5v7c0 .276-.215.5-.498.5h-4.004a.503.503 0 0 1-.498-.5v-7z"></path><path d="M18 2h1v3.5h-1z"></path></svg>`,
                title: 'Heiken Ashi'
            },
        ];

        types.forEach(({ type, icon, title }) => {
            const isActive = type === this._activeChartType;
            const btn = this._createIconButton(icon, isActive, title);
            btn.dataset.chartType = type;
            btn.dataset.active = isActive.toString();
            btn.addEventListener('click', () => {
                this.setChartType(type);
            });
            container.appendChild(btn);
        });

        this._element!.appendChild(container);
    }

    private _createIndicatorsButton(): void {
        const btn = document.createElement('button');
        btn.className = 'toolbar-indicators';
        btn.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: transparent;
            border: none;
            border-radius: 4px;
            color: #787b86;
            font-size: 13px;
            cursor: pointer;
            transition: background 0.15s, color 0.15s;
        `;

        const icon = document.createElement('span');
        icon.innerHTML = TOOLBAR_ICONS.indicators;
        icon.style.display = 'flex';
        btn.appendChild(icon);

        const label = document.createElement('span');
        label.textContent = 'Indicators';
        btn.appendChild(label);

        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#2a2e39';
            btn.style.color = '#d1d4dc';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'transparent';
            btn.style.color = '#787b86';
        });
        btn.addEventListener('click', () => {
            this._indicatorsClicked.fire();
        });

        this._element!.appendChild(btn);
    }

    private _createButton(text: string, active: boolean = false): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = `
            padding: 4px 8px;
            background: ${active ? '#2962ff' : 'transparent'};
            border: none;
            border-radius: 4px;
            color: ${active ? '#fff' : '#787b86'};
            font-size: 13px;
            font-weight: ${active ? '500' : '400'};
            cursor: pointer;
            transition: background 0.15s, color 0.15s;
        `;

        btn.addEventListener('mouseenter', () => {
            const isActive = btn.dataset.active === 'true' || btn.style.background === 'rgb(41, 98, 255)';
            if (!isActive) {
                btn.style.background = '#2a2e39';
                btn.style.color = '#d1d4dc';
            }
        });

        btn.addEventListener('mouseleave', () => {
            const isActive = btn.dataset.active === 'true' || btn.style.background === 'rgb(41, 98, 255)';
            if (!isActive) {
                btn.style.background = 'transparent';
                btn.style.color = '#787b86';
            } else {
                // Ensure active style is maintained
                btn.style.background = '#2962ff';
                btn.style.color = '#fff';
            }
        });

        return btn;
    }

    private _createIconButton(icon: string, active: boolean = false, title: string = ''): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.innerHTML = icon;
        btn.title = title;
        btn.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 28px;
            background: ${active ? '#2962ff' : 'transparent'};
            border: none;
            border-radius: 4px;
            color: ${active ? '#fff' : '#787b86'};
            cursor: pointer;
            transition: background 0.15s, color 0.15s;
        `;

        btn.addEventListener('mouseenter', () => {
            const isActive = btn.dataset.active === 'true' || btn.style.background === 'rgb(41, 98, 255)';
            if (!isActive) {
                btn.style.background = '#2a2e39';
                btn.style.color = '#d1d4dc';
            }
        });

        btn.addEventListener('mouseleave', () => {
            const isActive = btn.dataset.active === 'true' || btn.style.background === 'rgb(41, 98, 255)';
            if (!isActive) {
                btn.style.background = 'transparent';
                btn.style.color = '#787b86';
            } else {
                // Ensure active style is maintained
                btn.style.background = '#2962ff';
                btn.style.color = '#fff';
            }
        });

        return btn;
    }

    private _updateTimeframeButtons(): void {
        const buttons = this._element?.querySelectorAll('.toolbar-timeframes button');
        buttons?.forEach(btn => {
            const htmlBtn = btn as HTMLButtonElement;
            const isActive = htmlBtn.dataset.timeframe === this._activeTimeframe;
            htmlBtn.dataset.active = isActive.toString();
            htmlBtn.style.background = isActive ? '#2962ff' : 'transparent';
            htmlBtn.style.color = isActive ? '#fff' : '#787b86';
            htmlBtn.style.fontWeight = isActive ? '500' : '400';
        });
    }

    private _updateChartTypeButtons(): void {
        const buttons = this._element?.querySelectorAll('.toolbar-chart-types button');
        buttons?.forEach(btn => {
            const htmlBtn = btn as HTMLButtonElement;
            const isActive = htmlBtn.dataset.chartType === this._activeChartType;
            htmlBtn.dataset.active = isActive.toString();
            htmlBtn.style.background = isActive ? '#2962ff' : 'transparent';
            htmlBtn.style.color = isActive ? '#fff' : '#787b86';
        });
    }

    // --- Cleanup ---

    dispose(): void {
        this._symbolClicked.destroy();
        this._timeframeChanged.destroy();
        this._chartTypeChanged.destroy();
        this._indicatorsClicked.destroy();

        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
        this._element = null;
    }
}
