/**
 * Symbol Search dialog - TradingView Supercharts style.
 *
 * Modules: symbol_model (DOM-free data/filter/rank/recents), symbol_data (exchange
 * fetchers + shared catalog), symbol_row (rows/logos), sources_screen, symbol_style.
 */

import { Delegate } from '../../helpers/delegate';
import { t, getCurrentLanguage } from '../../helpers/translations';
import {
    Filters,
    IndexedSymbol,
    PrefsStore,
    RecentsStore,
    SearchPrefs,
    SourceInfo,
    SymbolInfo,
    SymbolMarket,
    SymbolType,
    availableCategories,
    availableMarkets,
    buildSources,
    explainEmpty,
    indexSymbol,
    indexSymbols,
    mergeRecents,
    parseQuery,
    runSearch,
    sourceLabel,
} from './symbol_model';
import { exchangeLogoUrl, symbolCatalog } from './symbol_data';
import { createIcon } from './symbol_icons';
import { createLogo, createRow } from './symbol_row';
import { SourcesScreen } from './sources_screen';
import { SearchTheme, applyThemeVars, ensureStyles } from './symbol_style';

export type { SymbolInfo, SymbolType, SymbolMarket } from './symbol_model';

export interface SymbolSearchConfig {
    categories?: SymbolType[];
    defaultCategory?: SymbolType;
    /** Returns the chart's current symbol (marked as active in the list) */
    getActiveSymbol?: () => { symbol: string; exchange?: string } | null;
    /** Returns the current UI theme (applied every time the dialog opens) */
    getTheme?: () => SearchTheme;
}

const PAGE_SIZE = 50;
const LOADING_DELAY_MS = 500;

interface MenuItem {
    label: string;
    selected: boolean;
    onClick: () => void;
}

function categoryLabel(c: SymbolType): string {
    switch (c) {
        case 'all': return t('All');
        case 'stocks': return t('Stocks');
        case 'funds': return t('Funds');
        case 'futures': return t('Futures');
        case 'forex': return t('Forex');
        case 'crypto': return t('Crypto');
        case 'cfd': return t('CFD');
        case 'indices': return t('Indices');
        case 'bonds': return t('Bonds');
        case 'economy': return t('Economy');
        case 'options': return t('Options');
    }
    return c;
}

function marketLabel(m: SymbolMarket): string {
    return m === 'spot' ? t('Spot') : m === 'swap' ? t('Swap') : t('Futures');
}

function getStorage(): Storage | null {
    try { return window.localStorage; } catch { return null; }
}

function isBlockedTypeTarget(el: Element | null): boolean {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if ((el as HTMLElement).isContentEditable) return true;
    return !!el.closest('[role="listbox"]');
}

/** True when some other dialog (settings, indicator search, ...) is visible. */
function otherDialogOpen(): boolean {
    const found = document.querySelectorAll('[role="dialog"], [aria-modal="true"]');
    for (let i = 0; i < found.length; i++) {
        if (found[i].getClientRects().length > 0) return true;
    }
    return false;
}

export class SymbolSearch {
    /** Single instance: the dialog that is currently open */
    private static _open: SymbolSearch | null = null;

    private readonly _config: SymbolSearchConfig;
    private readonly _symbolSelected = new Delegate<SymbolInfo>();
    private readonly _recents = new RecentsStore(getStorage());
    private readonly _prefsStore = new PrefsStore(getStorage());
    private _theme: SearchTheme = 'dark';

    // Data
    private _provided: SymbolInfo[] = [];
    private _replaceCatalog = false;
    private _index: IndexedSymbol[] = [];
    private _byId = new Map<string, IndexedSymbol>();
    private _sources: SourceInfo[] = [];

    // State
    private _filters: Filters;
    private _prefs: SearchPrefs;
    private _results: IndexedSymbol[] = [];
    private _query = '';
    private _rendered = 0;
    private _selected = -1;
    private _isLoading = false;

    // DOM (exists only while open)
    private _overlay: HTMLElement | null = null;
    private _dialog: HTMLElement | null = null;
    private _titleEl: HTMLElement | null = null;
    private _backBtn: HTMLElement | null = null;
    private _searchScreen: HTMLElement | null = null;
    private _sourcesScreen: SourcesScreen | null = null;
    private _input: HTMLInputElement | null = null;
    private _clearBtn: HTMLElement | null = null;
    private _filterHost: HTMLElement | null = null;
    private _feed: HTMLElement | null = null;
    private _feedWrap: HTMLElement | null = null;
    private _spinner: HTMLElement | null = null;
    private _sentinel: HTMLElement | null = null;
    private _observer: IntersectionObserver | null = null;
    private _resizeObs: ResizeObserver | null = null;
    private _menu: HTMLElement | null = null;
    private _suppressClick = false;
    private _loadingTimer: ReturnType<typeof setTimeout> | null = null;
    private _unsubCatalog: (() => void) | null = null;
    private _tabEls: HTMLElement[] = [];
    private _moreBtn: HTMLElement | null = null;
    private _tabsHost: HTMLElement | null = null;

    constructor(config: SymbolSearchConfig = {}) {
        this._config = config;
        this._prefs = this._prefsStore.load();
        this._filters = {
            category: this._prefs.category,
            source: this._prefs.source,
            market: this._prefs.category !== 'all' ? (this._prefs.tabs[this._prefs.category]?.market ?? null) : null,
        };
        if (config.defaultCategory && !this._prefsStoredCategory()) this._filters.category = config.defaultCategory;
        this._syncIndex();
    }

    // ========================================================================
    // Public API
    // ========================================================================

    get symbolSelected(): Delegate<SymbolInfo> {
        return this._symbolSelected;
    }

    get isLoading(): boolean {
        return this._isLoading;
    }

    get isOpen(): boolean {
        return this._overlay !== null;
    }

    /** Replace the symbol list (disables the built-in exchange fetch) */
    setSymbols(symbols: SymbolInfo[]): void {
        this._provided = symbols;
        this._replaceCatalog = true;
        this._syncIndex();
        if (this.isOpen) this._refresh();
    }

    /** Add symbols to the list */
    addSymbols(symbols: SymbolInfo[]): void {
        this._provided = this._provided.concat(symbols);
        this._syncIndex();
        if (this.isOpen) this._refresh();
    }

    setTheme(theme: SearchTheme): void {
        this._theme = theme;
        if (this._overlay) applyThemeVars(this._overlay, theme);
    }

    /** Opens the dialog. `initialText` pre-fills the input (type-to-open). */
    show(initialText: string = ''): void {
        if (SymbolSearch._open && SymbolSearch._open !== this) return;
        if (this._overlay) {
            this._input?.focus();
            return;
        }
        SymbolSearch._open = this;
        const theme = this._config.getTheme?.();
        if (theme) this._theme = theme;
        ensureStyles();
        this._syncIndex();
        this._buildDom();
        document.body.appendChild(this._overlay!);

        document.addEventListener('keydown', this._onDocKeyDown, true);
        document.addEventListener('mousedown', this._onDocMouseDown, true);
        window.addEventListener('resize', this._onResize);

        if (!this._replaceCatalog) {
            this._unsubCatalog = symbolCatalog.subscribe(() => this._onCatalogChunk());
            symbolCatalog.ensureLoaded();
        }
        this._updateLoading();

        const input = this._input!;
        input.value = initialText;
        this._updateClear();
        this._renderFilterArea();
        this._refresh();
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        this._layoutTabsSoon();
    }

    hide(): void {
        if (!this._overlay) return;
        this._closeMenu();
        this._clearLoadingTimer();
        this._observer?.disconnect();
        this._observer = null;
        this._resizeObs?.disconnect();
        this._resizeObs = null;
        this._unsubCatalog?.();
        this._unsubCatalog = null;
        document.removeEventListener('keydown', this._onDocKeyDown, true);
        document.removeEventListener('mousedown', this._onDocMouseDown, true);
        window.removeEventListener('resize', this._onResize);
        this._overlay.remove();
        this._overlay = null;
        this._dialog = null;
        this._sourcesScreen = null;
        this._input = null;
        this._feed = null;
        this._filterHost = null;
        this._spinner = null;
        this._sentinel = null;
        this._results = [];
        this._selected = -1;
        if (SymbolSearch._open === this) SymbolSearch._open = null;
    }

    dispose(): void {
        this.hide();
        this._symbolSelected.destroy();
    }

    /**
     * Type-to-open: call from a keypress listener. Returns true when the dialog was opened.
     * Ignores modifier combos, control chars, digits (reserved), text inputs, listboxes and other dialogs.
     */
    handleTypeToOpen(e: KeyboardEvent): boolean {
        if (SymbolSearch._open || e.defaultPrevented) return false;
        if (e.ctrlKey || e.metaKey || e.altKey) return false;
        const code = e.which || e.keyCode || e.charCode || 0;
        if (code <= 32) return false;
        const ch = e.key && e.key.length === 1 ? e.key : String.fromCharCode(code);
        if (!ch || /[0-9]/.test(ch)) return false;
        const target = e.target instanceof Element ? e.target : null;
        if (isBlockedTypeTarget(target) || isBlockedTypeTarget(document.activeElement)) return false;
        if (otherDialogOpen()) return false;
        e.preventDefault();
        this.show(ch);
        return true;
    }

    // ========================================================================
    // Data
    // ========================================================================

    private _prefsStoredCategory(): boolean {
        const st = getStorage();
        try { return !!st && st.getItem('tv-symbol-search-prefs-v1') !== null; } catch { return false; }
    }

    private _syncIndex(): void {
        const catalogSymbols = this._replaceCatalog ? [] : symbolCatalog.symbols;
        const seen = new Set<string>();
        const merged: SymbolInfo[] = [];
        for (const list of [catalogSymbols, this._provided]) {
            for (const s of list) {
                const id = `${s.exchange}:${s.symbol}`;
                if (seen.has(id)) continue;
                seen.add(id);
                merged.push(s);
            }
        }
        this._index = indexSymbols(merged);
        this._byId = new Map(this._index.map(s => [s.id, s]));
        this._sources = buildSources(this._index);
        this._validateFilters();
    }

    /** Drop persisted filters that no longer exist in the data (once everything is loaded). */
    private _validateFilters(): void {
        if (!this._replaceCatalog && symbolCatalog.loading) return;
        if (this._index.length === 0) return;
        const f = this._filters;
        let changed = false;
        if (f.category !== 'all' && availableCategories(this._index).indexOf(f.category) < 0) {
            f.category = 'all';
            f.market = null;
            changed = true;
        }
        if (f.source !== null && !this._sources.some(s => s.id === f.source)) {
            f.source = null;
            changed = true;
        }
        if (f.market !== null && availableMarkets(this._index, f.category).indexOf(f.market) < 0) {
            f.market = null;
            changed = true;
        }
        if (changed) this._persist();
    }

    private _persist(): void {
        const f = this._filters;
        const tabs = { ...this._prefs.tabs };
        if (f.category !== 'all') tabs[f.category] = { market: f.market };
        this._prefs = { category: f.category, source: f.source, tabs };
        this._prefsStore.save(this._prefs);
    }

    private _onCatalogChunk(): void {
        this._syncIndex();
        this._updateLoading();
        if (this._sourcesScreen) return;
        this._renderFilterArea();
        this._refresh();
    }

    private _isActive(item: IndexedSymbol): boolean {
        const a = this._config.getActiveSymbol?.();
        if (!a) return false;
        return item.info.symbol === a.symbol && (!a.exchange || item.info.exchange === a.exchange);
    }

    // ========================================================================
    // DOM construction
    // ========================================================================

    private _buildDom(): void {
        const overlay = document.createElement('div');
        overlay.className = 'ss-overlay symbol-search-overlay';
        overlay.lang = getCurrentLanguage();
        applyThemeVars(overlay, this._theme);

        let downOnOverlay = false;
        overlay.addEventListener('mousedown', (e) => { downOnOverlay = e.target === overlay; });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && downOnOverlay) this.hide();
        });

        const dialog = document.createElement('div');
        dialog.className = 'ss-dialog symbol-search-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-label', t('Symbol search'));

        // Header
        const header = document.createElement('div');
        header.className = 'ss-header';
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'ss-btn-icon ss-back';
        back.setAttribute('aria-label', t('Back'));
        back.title = t('Back');
        back.appendChild(createIcon('back', 24));
        back.style.display = 'none';
        back.addEventListener('click', () => this._showSearchScreen());
        const title = document.createElement('h2');
        title.className = 'ss-title';
        title.textContent = t('Symbol search');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'ss-btn-icon';
        close.setAttribute('aria-label', t('Close menu'));
        close.title = t('Close menu');
        close.appendChild(createIcon('close', 24));
        close.addEventListener('click', () => this.hide());
        header.append(back, title, close);
        dialog.appendChild(header);

        // Search screen
        const screen = document.createElement('div');
        screen.className = 'ss-screen';

        const inputRow = document.createElement('div');
        inputRow.className = 'ss-input-row';
        const box = document.createElement('div');
        box.className = 'ss-input-box';
        box.appendChild(createIcon('search', 28));
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'ss-input';
        input.lang = 'en'; // sembol kodu: tr buyuk harf kurali uygulanmasin
        input.setAttribute('role', 'searchbox');
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.placeholder = t('Symbol or name');
        input.addEventListener('input', () => {
            this._updateClear();
            this._refresh();
        });
        input.addEventListener('keydown', (e) => this._onInputKeyDown(e));
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'ss-btn-icon';
        clear.setAttribute('aria-label', t('Clear'));
        clear.title = t('Clear');
        clear.appendChild(createIcon('close', 20));
        clear.style.display = 'none';
        clear.addEventListener('click', () => {
            input.value = '';
            this._updateClear();
            this._refresh();
            input.focus();
        });
        box.append(input, clear);
        inputRow.appendChild(box);
        screen.appendChild(inputRow);

        const filterHost = document.createElement('div');
        filterHost.style.flexShrink = '0';
        screen.appendChild(filterHost);

        const feedWrap = document.createElement('div');
        feedWrap.className = 'ss-feed-wrap';
        const feed = document.createElement('div');
        feed.className = 'ss-feed';
        feed.setAttribute('role', 'listbox');
        feed.addEventListener('click', (e) => this._onFeedClick(e));
        feedWrap.appendChild(feed);
        screen.appendChild(feedWrap);

        dialog.appendChild(screen);
        overlay.appendChild(dialog);

        this._overlay = overlay;
        this._dialog = dialog;
        this._titleEl = title;
        this._backBtn = back;
        this._searchScreen = screen;
        this._input = input;
        this._clearBtn = clear;
        this._filterHost = filterHost;
        this._feed = feed;
        this._feedWrap = feedWrap;

        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObs = new ResizeObserver(() => this._layoutTabs());
            this._resizeObs.observe(dialog);
        }
    }

    private _updateClear(): void {
        if (this._clearBtn && this._input) this._clearBtn.style.display = this._input.value ? 'inline-flex' : 'none';
    }

    // ========================================================================
    // Tabs / filter row
    // ========================================================================

    private _renderFilterArea(): void {
        const host = this._filterHost;
        if (!host) return;
        this._closeMenu();
        host.textContent = '';
        this._tabEls = [];
        this._moreBtn = null;
        this._tabsHost = null;
        host.appendChild(this._buildTabs());
        const filterRow = this._buildFilterRow();
        if (filterRow) host.appendChild(filterRow);
        this._layoutTabsSoon();
    }

    private _setCategory(cat: SymbolType): void {
        const f = this._filters;
        f.category = cat;
        if (cat === 'all') {
            f.market = null;
        } else {
            const saved = this._prefs.tabs[cat]?.market ?? null;
            f.market = saved && availableMarkets(this._index, cat).indexOf(saved) >= 0 ? saved : null;
        }
        this._persist();
        this._renderFilterArea();
        this._refresh();
    }

    private _buildTabs(): HTMLElement {
        const row = document.createElement('div');
        row.className = 'ss-tabs';
        row.setAttribute('role', 'tablist');
        const cats: SymbolType[] = ['all', ...availableCategories(this._index)];
        for (const c of cats) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ss-pill';
            b.setAttribute('role', 'tab');
            b.dataset.category = c;
            b.textContent = categoryLabel(c);
            if (c === this._filters.category) {
                b.classList.add('is-active');
                b.setAttribute('aria-selected', 'true');
            }
            b.addEventListener('click', () => this._setCategory(c));
            row.appendChild(b);
            this._tabEls.push(b);
        }
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'ss-pill';
        more.style.display = 'none';
        more.appendChild(document.createTextNode(t('More')));
        more.appendChild(createIcon('chevron', 18));
        more.addEventListener('click', () => {
            if (this._suppressClick) return;
            const hidden = this._tabEls.filter(el => el.style.display === 'none');
            this._openMenu(more, hidden.map(el => ({
                label: el.textContent || '',
                selected: el.classList.contains('is-active'),
                onClick: () => this._setCategory(el.dataset.category as SymbolType),
            })));
        });
        row.appendChild(more);
        this._moreBtn = more;
        this._tabsHost = row;
        return row;
    }

    private _layoutTabsSoon(): void {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => this._layoutTabs());
        else this._layoutTabs();
    }

    /** Overflowing tabs collapse into "More" (desktop) or scroll horizontally (touch). */
    private _layoutTabs(): void {
        const host = this._tabsHost;
        const more = this._moreBtn;
        if (!host || !more || !host.isConnected) return;
        const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
        for (const el of this._tabEls) el.style.display = '';
        more.style.display = 'none';
        if (coarse) {
            host.classList.add('ss-scroll-x');
            return;
        }
        host.classList.remove('ss-scroll-x');
        const cs = getComputedStyle(host);
        const avail = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const gap = 8;
        const widths = this._tabEls.map(el => el.offsetWidth);
        const total = widths.reduce((a, w) => a + w, 0) + gap * (widths.length - 1);
        if (total <= avail) return;
        more.style.display = '';
        const reserve = more.offsetWidth + gap;
        let used = 0;
        let fit = 0;
        for (let i = 0; i < widths.length; i++) {
            const next = used + widths[i] + (i > 0 ? gap : 0);
            if (next + reserve > avail) break;
            used = next;
            fit = i + 1;
        }
        for (let i = fit; i < this._tabEls.length; i++) this._tabEls[i].style.display = 'none';
    }

    private _buildFilterRow(): HTMLElement | null {
        const row = document.createElement('div');
        row.className = 'ss-filters';
        const f = this._filters;

        // Sources pill (switches to the Sources screen); shown when there is a choice or a filter is active
        const srcSet = new Set<string>();
        for (const s of this._index) if (f.category === 'all' || s.category === f.category) srcSet.add(s.source);
        if (f.source !== null || srcSet.size > 1) {
            const srcPill = document.createElement('button');
            srcPill.type = 'button';
            srcPill.className = 'ss-pill ss-sm';
            if (f.source) {
                srcPill.classList.add('is-active');
                srcPill.appendChild(createLogo(exchangeLogoUrl(f.source), sourceLabel(f.source), 18));
                srcPill.appendChild(document.createTextNode(sourceLabel(f.source)));
                srcPill.appendChild(this._pillClear(() => this._setSource(null, false)));
            } else {
                srcPill.appendChild(document.createTextNode(t('All sources')));
                srcPill.appendChild(createIcon('chevron', 16));
        }
        srcPill.title = t('Sources');
        srcPill.addEventListener('click', () => {
            if (this._suppressClick) return;
            this._showSourcesScreen();
        });
        row.appendChild(srcPill);
        }

        // Per-tab select pills (Crypto: Spot / Swap / Futures)
        const markets = f.category === 'all' ? [] : availableMarkets(this._index, f.category);
        if (markets.length > 1) {
            const typeSel = document.createElement('button');
            typeSel.type = 'button';
            typeSel.className = 'ss-pill ss-sm';
            if (f.market) {
                typeSel.classList.add('is-active');
                typeSel.appendChild(document.createTextNode(marketLabel(f.market)));
                typeSel.appendChild(this._pillClear(() => this._setMarket(null)));
            } else {
                typeSel.appendChild(document.createTextNode(t('All types')));
                typeSel.appendChild(createIcon('chevron', 16));
            }
            typeSel.addEventListener('click', () => {
                if (this._suppressClick) return;
                const items: MenuItem[] = [{ label: t('All types'), selected: f.market === null, onClick: () => this._setMarket(null) }];
                for (const m of markets) items.push({ label: marketLabel(m), selected: f.market === m, onClick: () => this._setMarket(m) });
                this._openMenu(typeSel, items);
            });
            row.appendChild(typeSel);
        }
        return row.childElementCount > 0 ? row : null;
    }

    private _pillClear(onClear: () => void): HTMLElement {
        const x = document.createElement('span');
        x.className = 'ss-pill-x';
        x.setAttribute('role', 'button');
        x.setAttribute('aria-label', t('Clear'));
        x.title = t('Clear');
        x.appendChild(createIcon('close', 14));
        x.addEventListener('click', (e) => {
            e.stopPropagation();
            onClear();
        });
        return x;
    }

    private _setMarket(m: SymbolMarket | null): void {
        this._filters.market = m;
        this._persist();
        this._renderFilterArea();
        this._refresh();
    }

    private _setSource(id: string | null, backToSearch: boolean): void {
        this._filters.source = id;
        this._persist();
        if (backToSearch) this._showSearchScreen();
        else {
            this._renderFilterArea();
            this._refresh();
        }
    }

    // ========================================================================
    // Menus
    // ========================================================================

    private _openMenu(anchor: HTMLElement, items: MenuItem[]): void {
        this._closeMenu();
        const dialog = this._dialog;
        if (!dialog || items.length === 0) return;
        const menu = document.createElement('div');
        menu.className = 'ss-menu';
        menu.setAttribute('role', 'menu');
        for (const it of items) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ss-menu-item';
            if (it.selected) b.classList.add('is-selected');
            const label = document.createElement('span');
            label.textContent = it.label;
            b.appendChild(label);
            if (it.selected) b.appendChild(createIcon('check', 18));
            b.addEventListener('click', () => {
                this._closeMenu();
                it.onClick();
            });
            menu.appendChild(b);
        }
        dialog.appendChild(menu);
        const a = anchor.getBoundingClientRect();
        const d = dialog.getBoundingClientRect();
        const left = Math.max(8, Math.min(a.left - d.left, d.width - menu.offsetWidth - 8));
        menu.style.left = `${left}px`;
        menu.style.top = `${a.bottom - d.top + 4}px`;
        this._menu = menu;
    }

    private _closeMenu(): void {
        this._menu?.remove();
        this._menu = null;
    }

    private readonly _onDocMouseDown = (e: MouseEvent): void => {
        if (!this._menu) return;
        const target = e.target as Node | null;
        if (target && this._menu.contains(target)) return;
        this._closeMenu();
        // The click that follows on a pill must not re-open its menu
        this._suppressClick = true;
        setTimeout(() => { this._suppressClick = false; }, 0);
    };

    // ========================================================================
    // Sources screen
    // ========================================================================

    private _showSourcesScreen(): void {
        if (!this._dialog || this._sourcesScreen) return;
        this._closeMenu();
        const screen = new SourcesScreen({
            sources: this._sources,
            selected: this._filters.source,
            onSelect: (id) => this._setSource(id, true),
        });
        this._sourcesScreen = screen;
        if (this._searchScreen) this._searchScreen.style.display = 'none';
        this._dialog.appendChild(screen.element);
        if (this._titleEl) this._titleEl.textContent = t('Sources');
        if (this._backBtn) this._backBtn.style.display = 'inline-flex';
        screen.focus();
    }

    private _showSearchScreen(): void {
        if (!this._sourcesScreen) return;
        this._sourcesScreen.element.remove();
        this._sourcesScreen = null;
        if (this._searchScreen) this._searchScreen.style.display = '';
        if (this._titleEl) this._titleEl.textContent = t('Symbol search');
        if (this._backBtn) this._backBtn.style.display = 'none';
        this._renderFilterArea();
        this._refresh();
        this._input?.focus();
    }

    // ========================================================================
    // Results
    // ========================================================================

    private _recentItems(): IndexedSymbol[] {
        return this._recents.list().map(info => this._byId.get(`${info.exchange}:${info.symbol}`) ?? indexSymbol(info));
    }

    /** Filter + rank once per input, then render the first page. */
    private _refresh(): void {
        const input = this._input;
        const feed = this._feed;
        if (!input || !feed) return;
        const raw = input.value;
        const parsed = parseQuery(raw, this._sources);
        let results = runSearch(this._index, parsed.text, this._filters, parsed.exchanges);
        if (raw.trim() === '') results = mergeRecents(results, this._recentItems(), this._filters);
        this._results = results;
        this._query = parsed.text;
        this._selected = -1;
        input.removeAttribute('aria-activedescendant');
        this._observer?.disconnect();
        this._observer = null;
        this._sentinel = null;
        feed.textContent = '';
        feed.scrollTop = 0;
        this._rendered = 0;

        if (results.length === 0) {
            if (!this._replaceCatalog && symbolCatalog.loading) return;
            this._renderEmpty(parsed.text, parsed.exchanges);
            return;
        }
        this._renderMore();
    }

    private _renderMore(): void {
        const feed = this._feed;
        if (!feed) return;
        this._sentinel?.remove();
        const end = Math.min(this._results.length, this._rendered + PAGE_SIZE);
        const frag = document.createDocumentFragment();
        const tab = this._filters.category;
        for (let i = this._rendered; i < end; i++) {
            const item = this._results[i];
            const row = createRow(item, { query: this._query, tab, active: this._isActive(item) });
            row.dataset.idx = String(i);
            row.id = `ss-row-${i}`;
            if (i === this._selected) row.dataset.selected = 'true';
            frag.appendChild(row);
        }
        feed.appendChild(frag);
        this._rendered = end;
        if (end < this._results.length) {
            const sentinel = document.createElement('div');
            sentinel.className = 'ss-sentinel';
            feed.appendChild(sentinel);
            this._sentinel = sentinel;
            if (typeof IntersectionObserver !== 'undefined') {
                this._observer?.disconnect();
                this._observer = new IntersectionObserver((entries) => {
                    if (entries.some(e => e.isIntersecting)) this._renderMore();
                }, { root: feed, rootMargin: '200px' });
                this._observer.observe(sentinel);
            } else {
                this._renderMore();
            }
        }
    }

    private _renderEmpty(text: string, restrict: string[] | null): void {
        const feed = this._feed;
        if (!feed) return;
        const f = this._filters;
        const why = explainEmpty(this._index, text, f, restrict);
        const box = document.createElement('div');
        box.className = 'ss-empty';
        const msg = document.createElement('div');
        let btn: { label: string; onClick: () => void } | null = null;
        if (why.kind === 'show-all') {
            msg.textContent = t('There are also {count} symbols in other markets').replace('{count}', String(why.count));
            btn = { label: t('Show me'), onClick: () => this._setCategory('all') };
        } else if (why.kind === 'reset') {
            const typeName = f.category !== 'all' ? categoryLabel(f.category) : (f.source ? sourceLabel(f.source) : categoryLabel('all'));
            msg.textContent = t('Symbols not found in {type} with such criteria').replace('{type}', typeName);
            btn = {
                label: t('Reset all filters'),
                onClick: () => {
                    f.source = null;
                    f.market = null;
                    this._persist();
                    this._renderFilterArea();
                    this._refresh();
                },
            };
        } else {
            msg.textContent = t('No symbols match your criteria');
        }
        box.appendChild(msg);
        if (btn) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ss-empty-btn';
            b.textContent = btn.label;
            b.addEventListener('click', btn.onClick);
            box.appendChild(b);
        }
        feed.appendChild(box);
    }

    // ========================================================================
    // Loading overlay (only if loading takes > 500 ms)
    // ========================================================================

    private _clearLoadingTimer(): void {
        if (this._loadingTimer !== null) clearTimeout(this._loadingTimer);
        this._loadingTimer = null;
    }

    private _updateLoading(): void {
        const loading = !this._replaceCatalog && symbolCatalog.loading;
        this._isLoading = loading;
        if (!loading) {
            this._clearLoadingTimer();
            this._spinner?.remove();
            this._spinner = null;
            return;
        }
        if (this._loadingTimer !== null || this._spinner || !this._feedWrap) return;
        this._loadingTimer = setTimeout(() => {
            this._loadingTimer = null;
            if (!symbolCatalog.loading || !this._feedWrap || this._spinner) return;
            const ov = document.createElement('div');
            ov.className = 'ss-loading';
            const sp = document.createElement('div');
            sp.className = 'ss-spinner';
            ov.appendChild(sp);
            this._feedWrap.appendChild(ov);
            this._spinner = ov;
        }, LOADING_DELAY_MS);
    }

    // ========================================================================
    // Keyboard / selection
    // ========================================================================

    private readonly _onResize = (): void => this._layoutTabs();

    private readonly _onDocKeyDown = (e: KeyboardEvent): void => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        if (this._menu) this._closeMenu();
        else if (this._sourcesScreen) this._showSearchScreen();
        else this.hide();
    };

    private _onInputKeyDown(e: KeyboardEvent): void {
        if (e.isComposing) return;
        const n = this._results.length;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (n > 0) this._setSelected(Math.min(this._selected + 1, n - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (this._selected > 0) this._setSelected(this._selected - 1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this._selected >= 0 && this._selected < n) this._choose(this._results[this._selected]);
            else if (this._input && this._input.value.trim() !== '' && n > 0) this._choose(this._results[0]);
        }
    }

    private _setSelected(i: number): void {
        const feed = this._feed;
        if (!feed) return;
        while (i >= this._rendered && this._rendered < this._results.length) this._renderMore();
        feed.querySelector('.ss-row[data-selected="true"]')?.removeAttribute('data-selected');
        this._selected = i;
        const row = document.getElementById(`ss-row-${i}`);
        if (!row) return;
        row.dataset.selected = 'true';
        this._input?.setAttribute('aria-activedescendant', row.id);
        row.scrollIntoView({ block: 'nearest' });
    }

    private _onFeedClick(e: MouseEvent): void {
        const target = e.target as Element | null;
        const row = target?.closest('.ss-row') as HTMLElement | null;
        if (!row || row.dataset.idx === undefined) return;
        const item = this._results[Number(row.dataset.idx)];
        if (item) this._choose(item);
    }

    private _choose(item: IndexedSymbol): void {
        this._recents.add(item.info);
        try {
            this._symbolSelected.fire(item.info);
        } finally {
            this.hide();
        }
    }
}
