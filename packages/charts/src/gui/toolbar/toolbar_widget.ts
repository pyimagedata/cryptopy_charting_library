/**
 * Top Toolbar Widget - TradingView-style toolbar
 */

import { Delegate } from '../../helpers/delegate';
import { t, getCurrentLanguage } from '../../helpers/translations';
import { displaySymbol } from '../../helpers/display-aliases';

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
    dom: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="currentColor">
        <rect x="4" y="4" width="8" height="2" rx="0.5" opacity="0.3"/>
        <rect x="4" y="8" width="12" height="2" rx="0.5" opacity="0.5"/>
        <rect x="4" y="12" width="18" height="2" rx="0.5" opacity="0.8"/>
        <rect x="4" y="16" width="14" height="2" rx="0.5" opacity="0.6"/>
        <rect x="4" y="20" width="10" height="2" rx="0.5" opacity="0.4"/>
        <rect x="4" y="24" width="6" height="2" rx="0.5" opacity="0.2"/>
    </svg>`,
};

const HEIKEN_ASHI_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="currentColor"><path d="M9 8v12h3V8H9zm-1-.502C8 7.223 8.215 7 8.498 7h4.004c.275 0 .498.22.498.498v13.004a.493.493 0 0 1-.498.498H8.498A.496.496 0 0 1 8 20.502V7.498z"></path><path d="M10 4h1v3.5h-1z"></path><path d="M17 6v6h3V6h-3zm-1-.5c0-.276.215-.5.498-.5h4.004c.275 0 .498.23.498.5v7c0 .276-.215.5-.498.5h-4.004a.503.503 0 0 1-.498-.5v-7z"></path><path d="M18 2h1v3.5h-1z"></path></svg>`;
const CHEVRON_ICON = `<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const STAR_ICON = (filled: boolean) => `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" fill="${filled ? '#f7b500' : 'none'}" stroke="${filled ? '#f7b500' : 'currentColor'}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

// Zaman dilimi dropdown'u: favoriler arac cubugunda dugme olarak kalir,
// tum liste (gruplu) + ozel zaman dilimleri menude. Ikisi de sadece bu
// tarayicida saklanir.
const TF_FAVORITES_STORAGE = 'chart.toolbar.tfFavorites';
const TF_CUSTOM_STORAGE = 'chart.toolbar.tfCustom';
const DEFAULT_TF_FAVORITES = ['15m', '1h', '4h', 'D'];
const TF_GROUPS: { label: string; items: string[] }[] = [
    { label: 'Minutes', items: ['1m', '3m', '5m', '15m', '30m'] },
    { label: 'Hours', items: ['1h', '2h', '4h', '12h'] },
    { label: 'Days', items: ['D', 'W', 'M'] },
];
const CUSTOM_TF_RE = /^\d+[mhdw]$/;

function readStoredList(key: string): string[] | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : null;
    } catch {
        return null;
    }
}

function writeStoredList(key: string, list: string[]): void {
    try {
        localStorage.setItem(key, JSON.stringify(list));
    } catch {
        // Tercih kaydedilemese de bu oturumda calisir.
    }
}

export type ChartType = 'candles' | 'line' | 'area' | 'heiken-ashi';

export interface ToolbarOptions {
    symbol?: string;
    timeframe?: string;
    chartType?: ChartType;
    timeframes?: string[];
    locale?: string;
    priceScaleMode?: 'normal' | 'logarithmic';
    /** IANA zone for the time axis, e.g. 'America/New_York'. '' means browser local zone. */
    timezone?: string;
}

const defaultToolbarOptions: ToolbarOptions = {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    chartType: 'candles',
    timeframes: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '12h', 'D', 'W', 'M'],
    locale: 'en',
    priceScaleMode: 'normal',
    timezone: 'America/New_York',
};

/** Common IANA zones offered in the toolbar selector, most relevant to trading sessions first. */
const TIMEZONE_OPTIONS: { val: string; label: string }[] = [
    { val: '', label: '🌐 Local' },
    { val: 'Etc/UTC', label: '🌍 UTC' },
    { val: 'America/New_York', label: '🇺🇸 New York' },
    { val: 'America/Chicago', label: '🇺🇸 Chicago' },
    { val: 'Europe/London', label: '🇬🇧 London' },
    { val: 'Europe/Istanbul', label: '🇹🇷 Istanbul' },
    { val: 'Europe/Frankfurt', label: '🇩🇪 Frankfurt' },
    { val: 'Asia/Tokyo', label: '🇯🇵 Tokyo' },
    { val: 'Asia/Hong_Kong', label: '🇭🇰 Hong Kong' },
    { val: 'Asia/Singapore', label: '🇸🇬 Singapore' },
    { val: 'Australia/Sydney', label: '🇦🇺 Sydney' },
];

/**
 * TradingView-style top toolbar
 */
export class ToolbarWidget {
    private _element: HTMLElement | null = null;
    private _options: ToolbarOptions;
    private _activeTimeframe: string;
    private _activeChartType: ChartType;
    private _activePriceScaleMode: 'normal' | 'logarithmic';
    private _activeTimezone: string;

    // Events
    private readonly _symbolClicked = new Delegate<void>();
    private readonly _timeframeChanged = new Delegate<string>();
    private readonly _chartTypeChanged = new Delegate<ChartType>();
    private readonly _indicatorsClicked = new Delegate<void>();
    private readonly _domToggled = new Delegate<boolean>();
    private readonly _languageChanged = new Delegate<string>();
    private readonly _themeToggled = new Delegate<'dark' | 'light'>();
    private readonly _priceScaleModeChanged = new Delegate<'normal' | 'logarithmic'>();
    private readonly _timezoneChanged = new Delegate<string>();
    private _domEnabled: boolean = false;
    private _watchlistEnabled: boolean = false;
    private _watchlistBtn: HTMLButtonElement | null = null;
    private readonly _watchlistToggled = new Delegate<boolean>();
    private _spotActive = false;
    private _spotBtn: HTMLButtonElement | null = null;
    private readonly _spotToggled = new Delegate<boolean>();
    private _currentTheme: 'dark' | 'light' = 'dark';
    private _tfFavorites: string[] = readStoredList(TF_FAVORITES_STORAGE) ?? [...DEFAULT_TF_FAVORITES];
    private _customTimeframes: string[] = readStoredList(TF_CUSTOM_STORAGE) ?? [];
    private _tfContainer: HTMLElement | null = null;
    private _chartTypeTrigger: HTMLButtonElement | null = null;
    private _menu: HTMLElement | null = null;
    private _menuAnchor: HTMLElement | null = null;
    private _menuBuild: ((menu: HTMLElement) => void) | null = null;
    private _menuCleanup: (() => void) | null = null;

    constructor(container: HTMLElement, options: Partial<ToolbarOptions> = {}) {
        this._options = { ...defaultToolbarOptions, ...options };
        this._activeTimeframe = this._options.timeframe!;
        this._activeChartType = this._options.chartType!;
        this._activePriceScaleMode = this._options.priceScaleMode!;
        this._activeTimezone = this._options.timezone ?? defaultToolbarOptions.timezone!;
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

    get domToggled(): Delegate<boolean> {
        return this._domToggled;
    }

    /** Fiyat ekseninin spot karsiligina (or. GC1 -> XAUUSD) cevrilmesi. */
    get spotToggled(): Delegate<boolean> {
        return this._spotToggled;
    }

    get watchlistToggled(): Delegate<boolean> {
        return this._watchlistToggled;
    }

    get languageChanged(): Delegate<string> {
        return this._languageChanged;
    }

    get themeToggled(): Delegate<'dark' | 'light'> {
        return this._themeToggled;
    }

    get priceScaleModeChanged(): Delegate<'normal' | 'logarithmic'> {
        return this._priceScaleModeChanged;
    }

    get timezoneChanged(): Delegate<string> {
        return this._timezoneChanged;
    }

    get domEnabled(): boolean {
        return this._domEnabled;
    }

    // --- Public methods ---

    setSymbol(symbol: string): void {
        this._options.symbol = symbol;
        const symbolEl = this._element?.querySelector('.toolbar-symbol-name');
        if (symbolEl) {
            symbolEl.textContent = displaySymbol(symbol);
        }
    }

    setTimeframe(timeframe: string, emit: boolean = true): void {
        if (this._activeTimeframe === timeframe) return;
        this._activeTimeframe = timeframe;
        this._updateTimeframeButtons();
        if (emit) {
            this._timeframeChanged.fire(timeframe);
        }
    }

    setChartType(type: ChartType, emit: boolean = true): void {
        if (this._activeChartType === type) return;
        this._activeChartType = type;
        this._updateChartTypeButtons();
        if (emit) {
            this._chartTypeChanged.fire(type);
        }
    }

    setPriceScaleMode(mode: 'normal' | 'logarithmic', emit: boolean = true): void {
        if (this._activePriceScaleMode === mode) return;
        this._activePriceScaleMode = mode;
        this._updatePriceScaleButtons();
        if (emit) {
            this._priceScaleModeChanged.fire(mode);
        }
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
            overflow-x: auto;
            overflow-y: hidden;
            flex-wrap: nowrap;
            white-space: nowrap;
            touch-action: pan-x;
            -webkit-overflow-scrolling: touch;
        `;

        // Hide scrollbar style
        const style = document.createElement('style');
        style.textContent = `
            .chart-toolbar::-webkit-scrollbar {
                display: none;
            }
            .chart-toolbar {
                -ms-overflow-style: none;
                scrollbar-width: none;
            }
        `;
        document.head.appendChild(style);

        // Prevent touch events from bubbling to avoid triggering chart scroll
        this._element.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });
        this._element.addEventListener('touchmove', (e) => {
            e.stopPropagation();
        }, { passive: true });
        this._element.addEventListener('touchend', (e) => {
            e.stopPropagation();
        }, { passive: true });

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

        // Price scale mode buttons
        this._createPriceScaleButtons();

        // Separator
        this._createSeparator();

        // Indicators button
        this._createIndicatorsButton();

        // DOM (Orderbook) toggle button
        this._createDomButton();

        // Izleme listesi (watch list) toggle button
        this._createWatchlistButton();

        // Fiyat eksenini spot karsiligina ceviren dugme (sadece GC1/SI1'de gorunur)
        this._createSpotButton();

        // Timezone Selector
        this._createTimezoneSelector();

        // Language Selector
        this._createLanguageSelector();

        // Theme Toggle Button
        this._createThemeToggle();

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
            flex-shrink: 0;
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
        symbolName.textContent = displaySymbol(this._options.symbol!);
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
            const isDark = this._currentTheme === 'dark';
            symbolSection.style.background = isDark ? '#2a2e39' : '#e0e3eb';
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
            flex-shrink: 0;
        `;
        this._element!.appendChild(separator);
    }

    // --- Zaman dilimi: favori dugmeler + dropdown ---

    private _inactiveColor(): string {
        return this._currentTheme === 'dark' ? '#787b86' : '#5d606b';
    }

    private _allTimeframes(): string[] {
        const base = this._options.timeframes ?? [];
        return [...base, ...this._customTimeframes.filter((tf) => !base.includes(tf))];
    }

    private _tfShortLabel(tf: string): string {
        return this._customTimeframes.includes(tf) ? tf : t(tf);
    }

    /** Menude gosterilen uzun ad: "15 dakika", "1 saat", "1 ay"... */
    private _tfLongLabel(tf: string): string {
        const fixed: Record<string, [number, string]> = { D: [1, 'day'], W: [1, 'week'], M: [1, 'month'] };
        let n: number;
        let unit: string;
        if (fixed[tf]) {
            [n, unit] = fixed[tf];
        } else {
            const m = /^(\d+)([mhdw])$/.exec(tf);
            if (!m) return tf;
            n = Number(m[1]);
            unit = { m: 'minute', h: 'hour', d: 'day', w: 'week' }[m[2]]!;
        }
        return `${n} ${t(n === 1 ? unit : unit + 's')}`;
    }

    private _createTimeframeButtons(): void {
        const container = document.createElement('div');
        container.className = 'toolbar-timeframes';
        container.style.cssText = `
            display: flex;
            align-items: center;
            gap: 2px;
            flex-shrink: 0;
        `;
        this._tfContainer = container;
        this._element!.appendChild(container);
        this._renderTimeframeButtons();
    }

    private _renderTimeframeButtons(): void {
        const container = this._tfContainer;
        if (!container) return;
        container.replaceChildren();
        const all = this._allTimeframes();
        const favorites = this._tfFavorites.filter((tf) => all.includes(tf));

        for (const tf of favorites) {
            const isActive = tf === this._activeTimeframe;
            const btn = this._createButton(this._tfShortLabel(tf), isActive);
            if (!isActive) btn.style.color = this._inactiveColor();
            btn.dataset.timeframe = tf;
            btn.dataset.active = isActive.toString();
            btn.addEventListener('click', () => this.setTimeframe(tf));
            container.appendChild(btn);
        }

        // Aktif zaman dilimi favori degilse dropdown dugmesinde yazili ve vurgulu durur.
        const activeHidden = !favorites.includes(this._activeTimeframe);
        const trigger = this._createButton('', activeHidden);
        trigger.className = 'toolbar-tf-trigger';
        trigger.title = t('Intervals');
        trigger.setAttribute('aria-haspopup', 'menu');
        trigger.dataset.active = activeHidden.toString();
        trigger.style.display = 'flex';
        trigger.style.alignItems = 'center';
        trigger.style.gap = '4px';
        if (!activeHidden) trigger.style.color = this._inactiveColor();
        trigger.innerHTML = (activeHidden ? `<span>${this._tfShortLabel(this._activeTimeframe)}</span>` : '') + CHEVRON_ICON;
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleMenu(trigger, (menu) => this._buildTimeframeMenu(menu));
        });
        container.appendChild(trigger);
    }

    private _toggleFavorite(tf: string): void {
        this._tfFavorites = this._tfFavorites.includes(tf)
            ? this._tfFavorites.filter((f) => f !== tf)
            : [...this._tfFavorites, tf];
        // Favoriler arac cubugunda menudeki sirayla gorunsun.
        const order = this._allTimeframes();
        this._tfFavorites.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        writeStoredList(TF_FAVORITES_STORAGE, this._tfFavorites);
        this._renderTimeframeButtons();
    }

    private _buildTimeframeMenu(menu: HTMLElement): void {
        const base = this._options.timeframes ?? [];
        const grouped = new Set<string>();
        for (const group of TF_GROUPS) {
            const items = group.items.filter((tf) => base.includes(tf));
            if (!items.length) continue;
            items.forEach((tf) => grouped.add(tf));
            this._menuHeader(menu, t(group.label));
            items.forEach((tf) => this._timeframeMenuItem(menu, tf, false));
        }
        const others = this._allTimeframes().filter((tf) => !grouped.has(tf));
        if (others.length) {
            this._menuHeader(menu, t('Custom'));
            others.forEach((tf) => this._timeframeMenuItem(menu, tf, this._customTimeframes.includes(tf)));
        }
        this._menuSeparator(menu);
        this._customTimeframeRow(menu);
    }

    private _timeframeMenuItem(menu: HTMLElement, tf: string, removable: boolean): void {
        const isFav = this._tfFavorites.includes(tf);
        const star = document.createElement('span');
        star.innerHTML = STAR_ICON(isFav);
        star.title = isFav ? t('Remove from favorites') : t('Add to favorites');
        star.style.cssText = 'display:flex;padding:2px;border-radius:3px;cursor:pointer;';
        star.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleFavorite(tf);
            this._rebuildMenu();
        });
        const trailing = [star];
        if (removable) {
            const remove = document.createElement('span');
            remove.textContent = '×';
            remove.title = t('Remove');
            remove.style.cssText = 'padding:0 4px;font-size:15px;line-height:1;cursor:pointer;opacity:0.7;';
            remove.addEventListener('click', (e) => {
                e.stopPropagation();
                this._customTimeframes = this._customTimeframes.filter((c) => c !== tf);
                this._tfFavorites = this._tfFavorites.filter((f) => f !== tf);
                writeStoredList(TF_CUSTOM_STORAGE, this._customTimeframes);
                writeStoredList(TF_FAVORITES_STORAGE, this._tfFavorites);
                this._renderTimeframeButtons();
                this._rebuildMenu();
            });
            trailing.unshift(remove);
        }
        this._menuItem(menu, {
            html: `<span>${this._tfLongLabel(tf)}</span>`,
            active: tf === this._activeTimeframe,
            onSelect: () => {
                this._closeMenu();
                this.setTimeframe(tf);
            },
            trailing,
        });
    }

    /** "Ozel zaman dilimi ekle": tiklaninca satir yerinde bir giris alanina donusur. */
    private _customTimeframeRow(menu: HTMLElement): void {
        const row = this._menuItem(menu, {
            html: `<span style="font-size:15px;line-height:1;margin-right:6px;">+</span><span>${t('Add custom interval')}</span>`,
            active: false,
            onSelect: () => {
                const dark = this._currentTheme === 'dark';
                const form = document.createElement('div');
                form.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:6px 12px;';
                const line = document.createElement('div');
                line.style.cssText = 'display:flex;gap:6px;';
                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = '10m, 90m, 2h';
                input.style.cssText = `width:100px;padding:5px 8px;border-radius:4px;font-size:13px;outline:none;background:${dark ? '#131722' : '#fff'};color:inherit;border:1px solid ${dark ? '#363a45' : '#d1d4dc'};`;
                const add = document.createElement('button');
                add.type = 'button';
                add.textContent = t('Add');
                add.style.cssText = 'padding:5px 10px;border:none;border-radius:4px;background:#2962ff;color:#fff;font-size:12px;cursor:pointer;';
                const hint = document.createElement('div');
                hint.textContent = t('Invalid format');
                hint.style.cssText = 'display:none;color:#f23645;font-size:11px;';
                const submit = () => {
                    const value = input.value.trim().toLowerCase();
                    const known: Record<string, string> = { '1d': 'D', '1w': 'W' };
                    if (!CUSTOM_TF_RE.test(value)) {
                        hint.style.display = 'block';
                        input.style.borderColor = '#f23645';
                        return;
                    }
                    const tf = known[value] ?? value;
                    if (!this._allTimeframes().includes(tf)) {
                        this._customTimeframes = [...this._customTimeframes, tf];
                        writeStoredList(TF_CUSTOM_STORAGE, this._customTimeframes);
                    }
                    this._closeMenu();
                    this.setTimeframe(tf);
                    this._renderTimeframeButtons();
                };
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') submit();
                });
                input.addEventListener('input', () => {
                    hint.style.display = 'none';
                    input.style.borderColor = dark ? '#363a45' : '#d1d4dc';
                });
                add.addEventListener('click', submit);
                line.append(input, add);
                form.append(line, hint);
                row.replaceWith(form);
                input.focus();
            },
        });
    }

    // --- Grafik tipi dropdown ---

    private _chartTypes(): { type: ChartType; icon: string; title: string }[] {
        return [
            { type: 'candles', icon: TOOLBAR_ICONS.candles, title: t('Candlestick') },
            { type: 'line', icon: TOOLBAR_ICONS.line, title: t('Line') },
            { type: 'area', icon: TOOLBAR_ICONS.area, title: t('Area') },
            { type: 'heiken-ashi', icon: HEIKEN_ASHI_ICON, title: t('Heiken Ashi') },
        ];
    }

    private _createChartTypeButtons(): void {
        const container = document.createElement('div');
        container.className = 'toolbar-chart-types';
        container.style.cssText = `
            display: flex;
            align-items: center;
            gap: 2px;
            flex-shrink: 0;
        `;
        const trigger = this._createIconButton('', false, t('Chart type'));
        trigger.className = 'toolbar-chart-type-trigger';
        trigger.setAttribute('aria-haspopup', 'menu');
        trigger.style.width = 'auto';
        trigger.style.padding = '0 6px';
        trigger.style.gap = '2px';
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleMenu(trigger, (menu) => this._buildChartTypeMenu(menu));
        });
        this._chartTypeTrigger = trigger;
        this._updateChartTypeButtons();
        container.appendChild(trigger);
        this._element!.appendChild(container);
    }

    private _buildChartTypeMenu(menu: HTMLElement): void {
        for (const { type, icon, title } of this._chartTypes()) {
            this._menuItem(menu, {
                html: `<span style="display:flex;margin-right:8px;">${icon}</span><span>${title}</span>`,
                active: type === this._activeChartType,
                onSelect: () => {
                    this._closeMenu();
                    this.setChartType(type);
                },
            });
        }
    }

    // --- Ortak acilir menu ---
    // Menu document.body'ye eklenir: arac cubugu overflow-x:auto oldugu icin
    // icine konan mutlak konumlu bir menu kirpilirdi.

    private _toggleMenu(anchor: HTMLElement, build: (menu: HTMLElement) => void): void {
        const sameAnchor = this._menuAnchor === anchor;
        this._closeMenu();
        if (sameAnchor) return;

        const dark = this._currentTheme === 'dark';
        const menu = document.createElement('div');
        menu.className = 'toolbar-menu';
        menu.setAttribute('role', 'menu');
        // text-transform:uppercase dile gore: 'tr' ile "Dakika" -> "DAKİKA" (lang yoksa "DAKIKA").
        menu.lang = getCurrentLanguage();
        menu.style.cssText = `
            position: fixed; z-index: 1000; min-width: 190px; max-height: 70vh; overflow-y: auto;
            padding: 4px 0; border-radius: 6px; font-size: 13px;
            font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif;
            background: ${dark ? '#1e222d' : '#ffffff'}; color: ${dark ? '#d1d4dc' : '#131722'};
            border: 1px solid ${dark ? '#2a2e39' : '#e0e3eb'};
            box-shadow: 0 6px 20px rgba(0,0,0,${dark ? 0.45 : 0.15});
        `;
        this._menu = menu;
        this._menuAnchor = anchor;
        this._menuBuild = build;
        build(menu);
        document.body.appendChild(menu);

        const r = anchor.getBoundingClientRect();
        menu.style.top = `${r.bottom + 4}px`;
        menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;

        const onDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (!menu.contains(target) && !anchor.contains(target)) this._closeMenu();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this._closeMenu();
                anchor.focus();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const items = Array.from(menu.querySelectorAll<HTMLElement>('[data-menu-item]'));
                if (!items.length) return;
                const i = items.indexOf(document.activeElement as HTMLElement);
                const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
                items[next].focus();
                e.preventDefault();
            }
        };
        const onScroll = (e: Event) => {
            if (!menu.contains(e.target as Node)) this._closeMenu();
        };
        const onResize = () => this._closeMenu();
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onResize);
        this._menuCleanup = () => {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('keydown', onKey, true);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onResize);
        };
    }

    private _rebuildMenu(): void {
        if (!this._menu || !this._menuBuild) return;
        const scroll = this._menu.scrollTop;
        this._menu.replaceChildren();
        this._menuBuild(this._menu);
        this._menu.scrollTop = scroll;
    }

    private _closeMenu(): void {
        this._menuCleanup?.();
        this._menuCleanup = null;
        this._menu?.remove();
        this._menu = null;
        this._menuAnchor = null;
        this._menuBuild = null;
    }

    private _menuHeader(menu: HTMLElement, text: string): void {
        const el = document.createElement('div');
        el.textContent = text;
        el.style.cssText = `padding:8px 12px 4px;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:${this._inactiveColor()};`;
        menu.appendChild(el);
    }

    private _menuSeparator(menu: HTMLElement): void {
        const el = document.createElement('div');
        el.style.cssText = `height:1px;margin:4px 0;background:${this._currentTheme === 'dark' ? '#2a2e39' : '#e0e3eb'};`;
        menu.appendChild(el);
    }

    private _menuItem(
        menu: HTMLElement,
        opts: { html: string; active: boolean; onSelect: () => void; trailing?: HTMLElement[] },
    ): HTMLElement {
        const dark = this._currentTheme === 'dark';
        const hover = dark ? '#2a2e39' : '#f0f3fa';
        const activeBg = dark ? 'rgba(41,98,255,0.18)' : 'rgba(41,98,255,0.10)';
        const row = document.createElement('div');
        row.dataset.menuItem = '';
        row.setAttribute('role', 'menuitem');
        row.tabIndex = 0;
        row.style.cssText = `display:flex;align-items:center;gap:8px;padding:6px 8px 6px 12px;cursor:pointer;outline:none;background:${opts.active ? activeBg : 'transparent'};color:${opts.active ? '#2962ff' : 'inherit'};`;
        const label = document.createElement('div');
        label.style.cssText = 'display:flex;align-items:center;flex:1;white-space:nowrap;';
        label.innerHTML = opts.html;
        row.appendChild(label);
        opts.trailing?.forEach((el) => row.appendChild(el));
        const setBg = (on: boolean) => (row.style.background = on ? hover : opts.active ? activeBg : 'transparent');
        row.addEventListener('mouseenter', () => setBg(true));
        row.addEventListener('mouseleave', () => setBg(false));
        row.addEventListener('focus', () => setBg(true));
        row.addEventListener('blur', () => setBg(false));
        row.addEventListener('click', opts.onSelect);
        row.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                opts.onSelect();
            }
        });
        menu.appendChild(row);
        return row;
    }

    private _createPriceScaleButtons(): void {
        const container = document.createElement('div');
        container.className = 'toolbar-price-scale-modes';
        container.style.cssText = `
            display: flex;
            align-items: center;
            gap: 2px;
            flex-shrink: 0;
        `;

        const modes: { mode: 'normal' | 'logarithmic'; label: string; title: string }[] = [
            { mode: 'normal', label: 'LIN', title: t('Linear scale') },
            { mode: 'logarithmic', label: 'LOG', title: t('Logarithmic scale') },
        ];

        modes.forEach(({ mode, label, title }) => {
            const isActive = mode === this._activePriceScaleMode;
            const btn = this._createButton(label, isActive);
            btn.title = title;
            btn.dataset.scaleMode = mode;
            btn.dataset.active = isActive.toString();
            btn.addEventListener('click', () => {
                this.setPriceScaleMode(mode);
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
            flex-shrink: 0;
        `;

        const icon = document.createElement('span');
        icon.innerHTML = TOOLBAR_ICONS.indicators;
        icon.style.display = 'flex';
        btn.appendChild(icon);

        const label = document.createElement('span');
        label.textContent = t('Indicators');
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

    /** Panel disaridan (ör. onceki oturumdan) acildiginda/kapandiginda dugmeyi senkronlar. */
    setWatchlistActive(active: boolean): void {
        this._watchlistEnabled = active;
        this._styleWatchlistButton(false);
    }

    private _styleWatchlistButton(hover: boolean): void {
        const btn = this._watchlistBtn;
        if (!btn) return;
        btn.style.background = this._watchlistEnabled ? 'rgba(0, 212, 170, 0.15)' : hover ? '#2a2e39' : 'transparent';
        btn.style.color = this._watchlistEnabled ? '#00d4aa' : hover ? '#d1d4dc' : '#787b86';
    }

    private _createWatchlistButton(): void {
        const btn = document.createElement('button');
        btn.className = 'toolbar-watchlist';
        btn.title = 'İzleme listesi';
        btn.style.cssText = `
            display: flex; align-items: center; gap: 6px; padding: 6px 10px;
            border: none; border-radius: 4px; font-size: 13px; cursor: pointer;
            transition: background 0.15s, color 0.15s; flex-shrink: 0;
        `;
        const icon = document.createElement('span');
        icon.style.display = 'flex';
        icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M5 8h18M5 14h18M5 20h11"/><path d="m21 17 1.1 2.2 2.4.35-1.75 1.7.42 2.4L21 22.5l-2.17 1.15.42-2.4-1.75-1.7 2.4-.35L21 17Z" fill="currentColor" stroke="none"/></svg>`;
        btn.appendChild(icon);
        const label = document.createElement('span');
        label.textContent = 'Liste';
        btn.appendChild(label);
        this._watchlistBtn = btn;
        this._styleWatchlistButton(false);
        btn.addEventListener('mouseenter', () => this._styleWatchlistButton(true));
        btn.addEventListener('mouseleave', () => this._styleWatchlistButton(false));
        btn.addEventListener('click', () => {
            this._watchlistEnabled = !this._watchlistEnabled;
            this._styleWatchlistButton(true);
            this._watchlistToggled.fire(this._watchlistEnabled);
        });
        this._element!.appendChild(btn);
    }

    /**
     * Spot dugmesini gunceller: `label` null ise (sembolun spot karsiligi yok)
     * dugme gizlenir.
     */
    setSpotButton(label: string | null, active: boolean): void {
        const btn = this._spotBtn;
        if (!btn) return;
        btn.style.display = label ? 'flex' : 'none';
        if (label) {
            btn.title = active
                ? `Fiyat ekseni ${label} gösteriyor (vadeli fiyata dönmek için tıkla)`
                : `Fiyat eksenini ${label} karşılığına çevir`;
        }
        this._spotActive = active;
        this._styleSpotButton(false);
    }

    private _styleSpotButton(hover: boolean): void {
        const btn = this._spotBtn;
        if (!btn) return;
        btn.style.background = this._spotActive ? 'rgba(245, 166, 35, 0.16)' : hover ? '#2a2e39' : 'transparent';
        btn.style.color = this._spotActive ? '#f5a623' : hover ? '#d1d4dc' : '#787b86';
    }

    private _createSpotButton(): void {
        const btn = document.createElement('button');
        btn.className = 'toolbar-spot';
        // Sadece ikon: hangi fiyatin gosterildigi eksenin ustunde yazar, ayrinti tooltip'te.
        btn.style.cssText = `
            display: none; align-items: center; justify-content: center; padding: 6px 8px;
            border: none; border-radius: 4px; cursor: pointer;
            transition: background 0.15s, color 0.15s; flex-shrink: 0;
        `;
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10h15l-4-4M22 18H7l4 4"/></svg>`;
        this._spotBtn = btn;
        btn.addEventListener('mouseenter', () => this._styleSpotButton(true));
        btn.addEventListener('mouseleave', () => this._styleSpotButton(false));
        btn.addEventListener('click', () => {
            this._spotActive = !this._spotActive;
            this._styleSpotButton(true);
            this._spotToggled.fire(this._spotActive);
        });
        this._element!.appendChild(btn);
    }

    private _createDomButton(): void {
        const btn = document.createElement('button');
        btn.className = 'toolbar-dom';
        btn.title = t('Toggle Orderbook Depth (DOM)');
        btn.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: ${this._domEnabled ? 'rgba(0, 212, 170, 0.15)' : 'transparent'};
            border: none;
            border-radius: 4px;
            color: ${this._domEnabled ? '#00d4aa' : '#787b86'};
            font-size: 13px;
            cursor: pointer;
            transition: background 0.15s, color 0.15s;
            flex-shrink: 0;
        `;

        const icon = document.createElement('span');
        icon.innerHTML = TOOLBAR_ICONS.dom;
        icon.style.display = 'flex';
        btn.appendChild(icon);

        const label = document.createElement('span');
        label.textContent = 'DOM';
        btn.appendChild(label);

        btn.addEventListener('mouseenter', () => {
            if (!this._domEnabled) {
                btn.style.background = '#2a2e39';
                btn.style.color = '#d1d4dc';
            }
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = this._domEnabled ? 'rgba(0, 212, 170, 0.15)' : 'transparent';
            btn.style.color = this._domEnabled ? '#00d4aa' : '#787b86';
        });
        btn.addEventListener('click', () => {
            this._domEnabled = !this._domEnabled;
            btn.style.background = this._domEnabled ? 'rgba(0, 212, 170, 0.15)' : 'transparent';
            btn.style.color = this._domEnabled ? '#00d4aa' : '#787b86';
            this._domToggled.fire(this._domEnabled);
        });

        this._element!.appendChild(btn);
    }

    private _createTimezoneSelector(): void {
        const container = document.createElement('div');
        container.style.cssText = `
            margin-left: auto;
            display: flex;
            align-items: center;
            flex-shrink: 0;
        `;

        const isDark = this._currentTheme === 'dark';

        const select = document.createElement('select');
        select.className = 'toolbar-tz-select';
        select.title = t('Chart time zone');
        select.style.cssText = `
            background: ${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'};
            border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
            color: ${isDark ? '#d1d4dc' : '#131722'};
            border-radius: 4px;
            padding: 4px;
            font-size: 11px;
            outline: none;
            cursor: pointer;
            margin-right: 6px;
        `;

        TIMEZONE_OPTIONS.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.val;
            opt.textContent = o.label;
            select.appendChild(opt);
        });

        select.value = this._activeTimezone;

        select.addEventListener('change', () => {
            this._activeTimezone = select.value;
            this._timezoneChanged.fire(select.value);
        });

        container.appendChild(select);
        this._element!.appendChild(container);
    }

    private _createLanguageSelector(): void {
        const container = document.createElement('div');
        container.style.cssText = `
            display: flex;
            align-items: center;
            flex-shrink: 0;
        `;

        const isDark = this._currentTheme === 'dark';

        const select = document.createElement('select');
        select.className = 'toolbar-lang-select';
        select.style.cssText = `
            background: ${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'};
            border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
            color: ${isDark ? '#d1d4dc' : '#131722'};
            border-radius: 4px;
            padding: 4px;
            font-size: 11px;
            outline: none;
            cursor: pointer;
        `;

        const opts = [
            { val: 'en', label: '🇺🇸 EN' },
            { val: 'tr', label: '🇹🇷 TR' }
        ];

        opts.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.val;
            opt.textContent = o.label;
            select.appendChild(opt);
        });

        select.value = this._options.locale || 'en';

        select.addEventListener('change', () => {
            this._languageChanged.fire(select.value);
        });

        container.appendChild(select);
        this._element!.appendChild(container);
    }

    private _createThemeToggle(): void {
        const btn = document.createElement('button');
        btn.className = 'toolbar-theme-toggle';
        btn.title = 'Switch Theme';
        btn.style.cssText = `
            background: transparent;
            border: none;
            color: #d1d4dc;
            cursor: pointer;
            width: 32px;
            height: 32px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-left: 8px;
            transition: background 0.15s, color 0.15s;
            flex-shrink: 0;
        `;

        const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

        const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;

        // Initial icon (dark mode default)
        btn.innerHTML = this._currentTheme === 'dark' ? moonIcon : sunIcon;

        btn.addEventListener('mouseenter', () => {
            const isDark = this._currentTheme === 'dark';
            btn.style.background = isDark ? '#2a2e39' : '#e0e3eb';
            btn.style.color = isDark ? '#d1d4dc' : '#131722';
        });

        btn.addEventListener('mouseleave', () => {
            const isDark = this._currentTheme === 'dark';
            btn.style.background = 'transparent';
            btn.style.color = isDark ? '#d1d4dc' : '#131722';
        });

        btn.addEventListener('click', () => {
            this._currentTheme = this._currentTheme === 'dark' ? 'light' : 'dark';
            btn.innerHTML = this._currentTheme === 'dark' ? moonIcon : sunIcon;

            // Update colors immediately for hover state correctness
            const isDark = this._currentTheme === 'dark';
            btn.style.background = isDark ? '#2a2e39' : '#e0e3eb'; // Keep hover bg since mouse is still over
            btn.style.color = isDark ? '#d1d4dc' : '#131722';

            this._themeToggled.fire(this._currentTheme);
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
                btn.style.background = this._currentTheme === 'dark' ? '#2a2e39' : '#e0e3eb';
                btn.style.color = this._currentTheme === 'dark' ? '#d1d4dc' : '#131722';
            }
        });

        btn.addEventListener('mouseleave', () => {
            const isActive = btn.dataset.active === 'true' || btn.style.background === 'rgb(41, 98, 255)';
            if (!isActive) {
                btn.style.background = 'transparent';
                btn.style.color = this._inactiveColor();
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
                btn.style.background = this._currentTheme === 'dark' ? '#2a2e39' : '#e0e3eb';
                btn.style.color = this._currentTheme === 'dark' ? '#d1d4dc' : '#131722';
            }
        });

        btn.addEventListener('mouseleave', () => {
            const isActive = btn.dataset.active === 'true' || btn.style.background === 'rgb(41, 98, 255)';
            if (!isActive) {
                btn.style.background = 'transparent';
                btn.style.color = this._inactiveColor();
            } else {
                // Ensure active style is maintained
                btn.style.background = '#2962ff';
                btn.style.color = '#fff';
            }
        });

        return btn;
    }

    private _updateTimeframeButtons(): void {
        this._renderTimeframeButtons();
    }

    private _updateChartTypeButtons(): void {
        const trigger = this._chartTypeTrigger;
        if (!trigger) return;
        const current = this._chartTypes().find((c) => c.type === this._activeChartType) ?? this._chartTypes()[0];
        trigger.innerHTML = `<span style="display:flex">${current.icon}</span>${CHEVRON_ICON}`;
        trigger.title = `${t('Chart type')}: ${current.title}`;
    }

    private _updatePriceScaleButtons(): void {
        const buttons = this._element?.querySelectorAll('.toolbar-price-scale-modes button');
        buttons?.forEach(btn => {
            const htmlBtn = btn as HTMLButtonElement;
            const isActive = htmlBtn.dataset.scaleMode === this._activePriceScaleMode;
            htmlBtn.dataset.active = isActive.toString();
            htmlBtn.style.background = isActive ? '#2962ff' : 'transparent';
            htmlBtn.style.color = isActive ? '#fff' : '#787b86';
            htmlBtn.style.fontWeight = isActive ? '500' : '400';
        });
    }

    // --- Cleanup ---

    /**
     * Set toolbar theme
     */
    setTheme(theme: 'dark' | 'light'): void {
        this._currentTheme = theme;
        if (!this._element) return;

        const isDark = theme === 'dark';
        this._element.style.background = isDark ? '#131722' : '#f8f9fa';
        this._element.style.borderBottomColor = isDark ? '#2a2e39' : '#e0e3eb';

        // Update all buttons
        const buttons = this._element.querySelectorAll('button:not([data-active="true"])');
        buttons.forEach(btn => {
            (btn as HTMLElement).style.color = isDark ? '#d1d4dc' : '#131722';
        });

        this._closeMenu();
        this._renderTimeframeButtons();

        // Update symbol section
        const symbolSection = this._element.querySelector('.toolbar-symbol') as HTMLElement;
        if (symbolSection) {
            // Update symbol name color
            const symbolName = symbolSection.querySelector('.toolbar-symbol-name') as HTMLElement;
            if (symbolName) {
                symbolName.style.color = isDark ? '#d1d4dc' : '#131722';
            }

            // Update icons (search and dropdown)
            const spans = symbolSection.querySelectorAll('span');
            spans.forEach(span => {
                if (!span.classList.contains('toolbar-symbol-name')) {
                    span.style.color = isDark ? '#787b86' : '#5d606b';
                }
            });
        }

        // Update theme toggle button
        const themeBtn = this._element.querySelector('.toolbar-theme-toggle') as HTMLButtonElement;
        if (themeBtn) {
            const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
            const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;

            themeBtn.innerHTML = isDark ? moonIcon : sunIcon;
            themeBtn.style.color = isDark ? '#d1d4dc' : '#131722';
        }

        // Update language selector
        const langSelect = this._element.querySelector('.toolbar-lang-select') as HTMLSelectElement;
        if (langSelect) {
            langSelect.style.background = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
            langSelect.style.border = `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`;
            langSelect.style.color = isDark ? '#d1d4dc' : '#131722';
        }

        // Update timezone selector
        const tzSelect = this._element.querySelector('.toolbar-tz-select') as HTMLSelectElement;
        if (tzSelect) {
            tzSelect.style.background = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
            tzSelect.style.border = `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`;
            tzSelect.style.color = isDark ? '#d1d4dc' : '#131722';
        }
    }

    dispose(): void {
        this._closeMenu();
        this._symbolClicked.destroy();
        this._timeframeChanged.destroy();
        this._chartTypeChanged.destroy();
        this._indicatorsClicked.destroy();
        this._domToggled.destroy();
        this._watchlistToggled.destroy();
        this._languageChanged.destroy();
        this._themeToggled.destroy();
        this._priceScaleModeChanged.destroy();
        this._timezoneChanged.destroy();

        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
        this._element = null;
    }
}
