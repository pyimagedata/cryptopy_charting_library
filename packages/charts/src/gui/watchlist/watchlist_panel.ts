/**
 * Izleme listesi (Watch list) paneli: grafigin sagina yerlesir, secili
 * sembollerin son fiyat / gunluk degisim % / hacmini periyodik gunceller;
 * satira tiklaninca grafik o sembole gecer.
 *
 * Veri host sayfadan gelir (SpecialForcesIndicator ile ayni desen): host
 * `WatchlistPanel.defaultProvider` degerini bir kez set eder. Kullanicinin
 * listeleri (watchlist_model.ts) ve panelin acik/kapali durumu sadece bu tarayicida (localStorage).
 */

import { Delegate } from '../../helpers/delegate';
import { displaySymbol, displayExchange } from '../../helpers/display-aliases';
import { t, getCurrentLanguage } from '../../helpers/translations';
import { ContextMenu, ContextMenuItem } from '../context_menu/context_menu';
import { WatchlistModel, WatchlistItem, itemId, FLAG_COLORS, flagHex, FLAGGED_PREFIX, DETAILS_MIN, DEFAULT_LIST_NAME } from './watchlist_model';
import { WL_COLORS, WlColors, WL_METRICS, WL_FLASH_MS } from './watchlist_theme';
import { applyRpTokens, ensureRpStyles, rpEmptyState, RP_MENU_SKIN, RP_FONT, RP_FONT_MONO } from '../right_panel/rp_tokens';
import { promptDialog, confirmDialog, rethemeOpenDialogs } from './watchlist_dialogs';
import { WatchlistSearch } from './watchlist_search';
import {
    DailyCache,
    DailyProvider,
    DAY_MS,
    dayStats,
    dayWindow,
    formatCountdown,
    gaugeSvg,
    sparkCloses,
    sparkSvg,
    trPercentSuffix,
} from './watchlist_spark';
import {
    COL_WIDTH,
    ColId,
    SortCol,
    DecimalsTracker,
    applySort,
    changeOf,
    effectiveColumns,
    flashDirection,
    formatNum,
    formatPct,
    formatSigned,
    formatVolume,
    compactAbbrev,
    gridTemplate,
    logoInfo,
    NARROW_BELOW,
    nextSort,
    requiredWidth,
    trendOf,
    Trend,
} from './watchlist_format';

export interface WatchlistRow {
    code: string;
    display_name: string;
    exchange: string;
    asset_class: string;
    price: number;
    change: number | null;
    change_pct: number | null;
    volume: number;
    updated_at: string;
    /** Optional host-provided daily stats; otherwise derived from today's daily candle (dailyProvider). */
    open?: number | null;
    high?: number | null;
    low?: number | null;
}

export type WatchlistProvider = () => Promise<WatchlistRow[]>;

export interface WatchlistSelection {
    code: string;
    exchange: string;
    assetClass: string;
    name: string;
}

const OPEN_STORAGE = 'chart.watchlist.open';
const WIDTH_STORAGE = 'chart.watchlist.width';
const MIN_WIDTH = 240;
const DEFAULT_WIDTH = 360;
const REFRESH_MS = 5000;
const SPARK_W = COL_WIDTH.spark;
const SPARK_H = 24;
const SEARCH_DEBOUNCE_MS = 120;
const STACK_BELOW = 380;
const COMPACT_BELOW = 400;
const TINY_BELOW = 320;
type Filter = 'all' | 'up' | 'down';
type Category = 'crypto' | 'forex' | 'index' | 'stock' | 'commodity' | 'other';
const CATEGORY_ORDER: Category[] = ['crypto', 'forex', 'index', 'stock', 'commodity', 'other'];

function categoryOf(row: { asset_class: string; exchange: string }): Category {
    const ac = (row.asset_class || '').toLowerCase();
    if (ac === 'crypto') return 'crypto';
    if (ac === 'forex' || ac === 'fx') return 'forex';
    if (ac === 'index' || ac === 'indices') return 'index';
    if (ac === 'stock' || ac === 'stocks' || ac === 'equity') return 'stock';
    if (ac === 'metal' || ac === 'energy' || ac === 'commodity' || ac === 'commodities' || row.exchange === 'COMEX') return 'commodity';
    return 'other';
}

function categoryLabel(c: Category): string {
    switch (c) {
        case 'crypto': return t('Crypto');
        case 'forex': return t('Forex');
        case 'index': return t('Indices');
        case 'stock': return t('Stocks');
        case 'commodity': return t('Commodities');
        default: return t('Other');
    }
}

const CAT_ICONS: Record<Category | 'section', string> = {
    crypto: '<path d="M6 3.5h3.2a2 2 0 0 1 0 4H6m0 0h3.6a2 2 0 0 1 0 4H6M6 3.5v8M7.5 2v1.5M7.5 11.5V13M9.5 2v1.5M9.5 11.5V13"/>',
    forex: '<path d="M2.5 5.5h9l-2-2M13.5 10.5h-9l2 2"/>',
    index: '<path d="M2.5 12l3.5-4 2.5 2 4.5-6"/><path d="M10.5 4h3v3"/>',
    stock: '<path d="M4 13V8M8 13V3.5M12 13V6"/>',
    commodity: '<path d="M8 2.5s4 4 4 7a4 4 0 0 1-8 0c0-3 4-7 4-7z"/>',
    other: '<circle cx="8" cy="8" r="5"/>',
    section: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7"/>',
};

function catIcon(c: Category | 'section'): string {
    return `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${CAT_ICONS[c]}</svg>`;
}
const SORTED_DRAG_HINT = 'Sıralama açıkken sürükleyerek yeniden sıralanamaz. Elle sıraya dönmek için sütun başlığına tekrar tıkla.';

function key(row: { code: string; exchange: string }): string {
    return `${row.code}|${row.exchange}`;
}

function readStorage(name: string): string | null {
    try {
        return localStorage.getItem(name);
    } catch {
        return null;
    }
}

function writeStorage(name: string, value: string): void {
    try {
        localStorage.setItem(name, value);
    } catch {
        // Tercih kaydedilemese de bu oturumda calisir.
    }
}

/** Kucuk DOM yardimcisi: metin her zaman textContent ile (host verisi HTML olarak yorumlanmaz). */
function h(tag: string, css: string, text?: string, cls?: string): HTMLElement {
    const el = document.createElement(tag);
    if (css) el.style.cssText = css;
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
}

function ensureStyles(): void {
    if (document.getElementById('wl-styles')) return;
    const st = document.createElement('style');
    st.id = 'wl-styles';
    st.textContent = `
        @keyframes wl-flash-fade { from { background: var(--wl-flash-bg); } to { background: transparent; } }
        .tv-watchlist .wl-flash-up { --wl-flash-bg: var(--wl-flash-up); animation: wl-flash-fade ${WL_FLASH_MS}ms ease-out; }
        .tv-watchlist .wl-flash-down { --wl-flash-bg: var(--wl-flash-down); animation: wl-flash-fade ${WL_FLASH_MS}ms ease-out; }
        @media (prefers-reduced-motion: reduce) {
            .tv-watchlist .wl-flash-up { animation: none; color: var(--wl-up) !important; }
            .tv-watchlist .wl-flash-down { animation: none; color: var(--wl-down) !important; }
        }
        .tv-watchlist .wl-colhead:hover { color: var(--rp-text) !important; }
        .tv-watchlist .wl-list-btn:hover, .tv-watchlist .wl-view-btn:hover { background: var(--rp-hover) !important; }
        .tv-watchlist .wl-seg-btn:hover:not([data-on="1"]) { color: var(--rp-text) !important; }
        .tv-watchlist .wl-row:hover .wl-remove, .tv-watchlist .wl-section:hover .wl-section-remove { display: flex !important; }
        .tv-watchlist .wl-remove:hover, .tv-watchlist .wl-section-remove:hover { color: var(--rp-down) !important; }
        .tv-watchlist .wl-group:hover { background: var(--rp-hover); }
        .tv-watchlist .wl-search-field input::placeholder { color: var(--rp-muted); opacity: .9; }
        .tv-watchlist .wl-search-field:focus-within { border-color: var(--rp-muted) !important; }
        .tv-watchlist .wl-details-divider:hover .wl-pill, .tv-watchlist .wl-details-divider[data-drag="1"] .wl-pill { background: var(--rp-muted) !important; }
        .tv-watchlist .wl-num { font-family: ${RP_FONT}; font-variant-numeric: tabular-nums; }
    `;
    document.head.appendChild(st);
}

const CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 7.5l3.5 3.5L12 3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEVRON_SVG = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 3.5l3 3 3-3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const SEARCH_SVG = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>';
const SLIDERS_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 5h6M12 5h1.5M2.5 11h1.5M7.5 11h6"/><circle cx="10" cy="5" r="1.7"/><circle cx="5.7" cy="11" r="1.7"/></svg>';
const EXPAND_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9"/></svg>';
const SHRINK_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 7h-4V3M9 7l4.5-4.5M3 9h4v4M7 9l-4.5 4.5"/></svg>';
const MINUS_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3.5 8h9"/></svg>';
const CHEV_UP_SVG = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2.5 7.5l3.5-3.5 3.5 3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LIST_SVG = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 5.5h12M4 10h12M4 14.5h7"/></svg>';
const PLUS_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 3.5v11M3.5 9h11"/></svg>';
const CLOSE_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/></svg>';
const ARROW_SVG = (dir: 'asc' | 'desc'): string =>
    `<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" style="display:block"><path d="${dir === 'asc' ? 'M4 1.5l3 5H1z' : 'M4 6.5l3-5H1z'}"/></svg>`;

function flagSvg(color: string, filled = true): string {
    return `<svg width="10" height="12" viewBox="0 0 10 12" fill="${filled ? color : 'none'}" stroke="${color}" stroke-width="1.2"><path d="M1.5 0.5v11M1.5 1.5h7l-2 2.5 2 2.5h-7" stroke-linejoin="round"/></svg>`;
}

interface RowRefs {
    last: HTMLElement;
    chg: HTMLElement | null;
    pct: HTMLElement | null;
    vol: HTMLElement | null;
    chgColor: string;
    pctColor: string;
}

interface DetailRefs {
    gauge: HTMLElement;
    gPct: HTMLElement;
    gSub: HTMLElement;
    last: HTMLElement;
    chg: HTMLElement;
    vals: HTMLElement[];
    legendBar: HTMLElement;
    countdown: HTMLElement;
}

function setText(el: HTMLElement, text: string): void {
    if (el.textContent !== text) el.textContent = text;
}

function setColor(el: HTMLElement, color: string): void {
    if (el.dataset.c !== color) {
        el.dataset.c = color;
        el.style.color = color;
    }
}

export class WatchlistPanel {
    static defaultProvider: WatchlistProvider | null = null;
    /**
     * Optional host hook feeding the 1-month sparkline and the detail gauge: ~30 daily candles per symbol
     * (oldest first, last = today). Missing / failing provider leaves those parts empty.
     */
    static dailyProvider: DailyProvider | null = null;

    readonly symbolSelected = new Delegate<WatchlistSelection>();
    readonly visibilityChanged = new Delegate<boolean>();
    readonly widthChanged = new Delegate<number>();
    private _width = DEFAULT_WIDTH;
    private readonly _parent: HTMLElement;

    private readonly _el: HTMLElement;
    private readonly _list: HTMLElement;
    private readonly _model: WatchlistModel;
    private _handle: HTMLElement | null = null;
    /** true once docked in the shared right panel container (it owns width, border and resize handle). */
    private _embedded = false;
    private _rows: WatchlistRow[] = [];
    private _visible = false;
    private _theme: 'dark' | 'light' = 'dark';
    private _activeCode = '';
    private _timer: ReturnType<typeof setInterval> | null = null;
    private _loadToken = 0;
    // Secim / klavye durumu (oge id'leri: itemId)
    private _selected = new Set<string>();
    private _anchor = '';
    private _cursor = '';
    private _shown: string[] = [];
    private _rowRows = new Map<string, WatchlistRow>();
    private _editing: { id: string; isNew: boolean } | null = null;
    private _dragIds: string[] = [];
    private _dragging = false;
    private _dropIndex = -1;
    private _dropLine: HTMLElement | null = null;
    private _ctx: ContextMenu | null = null;
    private _search: WatchlistSearch | null = null;
    private readonly _colHeader: HTMLElement;
    private readonly _detailsWrap: HTMLElement;
    private readonly _decimals = new DecimalsTracker();
    private readonly _prevLast = new Map<string, number>();
    private _pendingFlash = new Map<string, 'up' | 'down'>();
    private _tick: ReturnType<typeof setInterval> | null = null;
    private _query = '';
    private _filter: Filter = 'all';
    private readonly _daily = new DailyCache(4);
    private _searchInput: HTMLInputElement | null = null;
    private _prevWidth: number | null = null;
    private _layoutSigStr = '';
    private _footerCount: HTMLElement | null = null;
    private _footerLeft: HTMLElement | null = null;
    private _statusText = '';
    private _footerTotal = 0;
    private _lastCountdown = '';
    private _persistWidth = true;
    private _searchTimer: ReturnType<typeof setTimeout> | null = null;
    /** Signature of the last structurally rendered list; equal signature = data-only update, patched in place. */
    private _listSig = '';
    private _rowRefs = new Map<string, RowRefs>();
    private readonly _sparkMarkups = new WeakMap<HTMLElement, string>();
    private _detailsSig = '';
    private _dRefs: DetailRefs | null = null;
    private _gaugeMarkup = '';
    private _fitMeta: (() => void) | null = null;
    private _countdownEnd = 0;

    constructor(parent: HTMLElement, top: number, model?: WatchlistModel) {
        this._parent = parent;
        this._model = model ?? new WatchlistModel();
        const storedWidth = Number(readStorage(WIDTH_STORAGE));
        if (Number.isFinite(storedWidth) && storedWidth > 0) this._width = storedWidth;
        this._el = document.createElement('div');
        this._el.className = 'tv-watchlist rp-root';
        this._el.tabIndex = 0;
        this._el.style.cssText = `
            position: absolute; top: ${top}px; right: 0; bottom: 0;
            width: ${this._width}px; display: none; flex-direction: column;
            z-index: 30; font-size: 12px; font-family: ${RP_FONT}; box-sizing: border-box; user-select: none; outline: none;
        `;
        this._list = document.createElement('div');
        this._colHeader = document.createElement('div');
        this._detailsWrap = document.createElement('div');
        ensureStyles();
        ensureRpStyles();
        parent.appendChild(this._el);
        this._createResizeHandle();
        this._el.addEventListener('keydown', (e) => this._onKeyDown(e));
        this._render();
    }

    get visible(): boolean {
        return this._visible;
    }

    get width(): number {
        return this._width;
    }

    /** false while the last width change must not be persisted by the shared host (temporary expand). */
    get persistsWidth(): boolean {
        return this._persistWidth;
    }

    /** Test / host erisimi icin model. */
    get model(): WatchlistModel {
        return this._model;
    }

    /** Genislik, panelin yanindaki grafik en az ~320px kalacak sekilde sinirlanir. */
    private _clampWidth(w: number): number {
        const max = Math.max(MIN_WIDTH, (this._parent.clientWidth || 1200) - 320);
        return Math.round(Math.min(Math.max(w, MIN_WIDTH), Math.min(max, 640)));
    }

    /**
     * Docks the panel inside the shared right panel container: it fills the container, the container owns the
     * width / border / resize handle and visibility (the view is hidden by the container, the DOM stays alive).
     */
    embed(container: HTMLElement): void {
        this._embedded = true;
        this._handle?.remove();
        this._handle = null;
        this._el.style.cssText = `position:relative;flex:1;min-height:0;width:100%;display:flex;flex-direction:column;`
            + `font-size:12px;font-family:${RP_FONT};`
            + 'box-sizing:border-box;user-select:none;outline:none;';
        container.appendChild(this._el);
        this._render();
    }

    /** Embedded mode: the container's width changed; only the visible column set is recomputed. */
    setHostWidth(w: number): void {
        if (w === this._width) return;
        this._width = w;
        if (this._prevWidth !== null && w < this._clampWidth(Infinity) - 1) {
            this._prevWidth = null;
            this._persistWidth = true;
            this._render();
            return;
        }
        this._applyColumns();
    }

    setWidth(w: number, persist = true): void {
        const next = this._clampWidth(w);
        if (next === this._width) return;
        this._width = next;
        this._persistWidth = persist;
        if (!this._embedded) {
            this._el.style.width = `${next}px`;
            if (persist) writeStorage(WIDTH_STORAGE, String(next));
        }
        this._applyColumns();
        this.widthChanged.fire(next);
    }

    private _visibleCols(): ColId[] {
        return effectiveColumns(this._model.columns, this._width);
    }

    /** Genislik degisince gorunen sutun kumesi degistiyse baslik ve satirlari yeniler. */
    private _layoutSig(): string {
        return `${this._visibleCols().join()}|${this._width < NARROW_BELOW}|${this._width < STACK_BELOW}|${this._width < COMPACT_BELOW}|${this._width < TINY_BELOW}`;
    }

    private _applyColumns(): void {
        if (this._layoutSig() === this._layoutSigStr) return;
        this._render();
    }

    /** Onceki oturumda acik birakildiysa true. */
    static wasOpen(): boolean {
        return readStorage(OPEN_STORAGE) === '1';
    }

    setTop(top: number): void {
        this._el.style.top = `${top}px`;
    }

    setTheme(theme: 'dark' | 'light'): void {
        this._theme = theme;
        this._ctx?.setTheme(theme);
        this._search?.setTheme(theme);
        rethemeOpenDialogs(theme);
        this._render();
    }

    setActiveSymbol(code: string): void {
        if (code === this._activeCode) return;
        this._activeCode = code;
        this._renderList(true);
    }

    toggle(): void {
        this.setVisible(!this._visible);
    }

    setVisible(visible: boolean): void {
        if (visible === this._visible) return;
        this._visible = visible;
        writeStorage(OPEN_STORAGE, visible ? '1' : '0');
        if (!this._embedded) this._el.style.display = visible ? 'flex' : 'none';
        if (visible) {
            void this._refresh();
            this._tick = setInterval(() => this._tickUpdated(), 1000);
            this._lastCountdown = '';
            this._timer = setInterval(() => {
                if (typeof document === 'undefined' || !document.hidden) void this._refresh();
            }, REFRESH_MS);
        } else {
            if (this._timer) clearInterval(this._timer);
            this._timer = null;
            if (this._tick) clearInterval(this._tick);
            this._tick = null;
            this._prevLast.clear();
            this._pendingFlash.clear();
            this._ctx?.hide();
            this._search?.close();
        }
        this.visibilityChanged.fire(visible);
    }

    /** Sol kenardaki surukleme tutamaci: sola cekince panel genisler. */
    private _createResizeHandle(): void {
        const handle = document.createElement('div');
        handle.className = 'wl-resize-handle';
        handle.title = 'Genişliği ayarla';
        handle.style.cssText = 'position:absolute;left:-3px;top:0;bottom:0;width:7px;cursor:col-resize;z-index:45;touch-action:none;';
        let startX = 0;
        let startW = 0;
        let frame = 0;
        handle.addEventListener('pointerdown', (e) => {
            startX = e.clientX;
            startW = this._width;
            handle.setPointerCapture(e.pointerId);
            handle.style.background = 'rgba(41,98,255,0.35)';
            e.preventDefault();
        });
        handle.addEventListener('pointermove', (e) => {
            if (!handle.hasPointerCapture(e.pointerId)) return;
            const target = startW + (startX - e.clientX);
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => this.setWidth(target, false));
        });
        const end = (e: PointerEvent) => {
            if (!handle.hasPointerCapture(e.pointerId)) return;
            handle.releasePointerCapture(e.pointerId);
            handle.style.background = 'transparent';
            cancelAnimationFrame(frame);
            writeStorage(WIDTH_STORAGE, String(this._width));
        };
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
        handle.addEventListener('mouseenter', () => (handle.style.background = 'rgba(41,98,255,0.35)'));
        handle.addEventListener('mouseleave', () => {
            if (!handle.hasPointerCapture?.(1)) handle.style.background = 'transparent';
        });
        this._handle = handle;
        this._el.appendChild(handle);
    }

    private async _refresh(): Promise<void> {
        const provider = WatchlistPanel.defaultProvider;
        if (!provider) {
            this._setStatus('Veri kaynağı tanımlı değil');
            return;
        }
        const token = ++this._loadToken;
        try {
            const rows = await provider();
            if (token !== this._loadToken || !this._visible) return;
            const first = this._rows.length === 0;
            this._rows = rows;
            this._computeFlashes(rows);
            this._setStatus('');
            if (this._model.needsSeed) this._model.seed(rows.map(key));
            this._renderList();
            if (first) this._search?.refresh();
        } catch {
            if (token === this._loadToken) this._setStatus('Fiyatlar alınamadı, tekrar denenecek…');
        }
    }

    /** Onceki yoklamaya gore Son'u degisen satirlar; ilk yuklemede (onceki yok) flas olmaz. */
    private _computeFlashes(rows: WatchlistRow[]): void {
        const flashes = new Map<string, 'up' | 'down'>();
        for (const r of rows) {
            const k = key(r);
            const dir = flashDirection(this._prevLast.get(k), r.price, this._decimals.get(k, r.price, r.asset_class, r.code));
            if (dir) flashes.set(k, dir);
            this._prevLast.set(k, r.price);
        }
        this._pendingFlash = flashes;
    }

    private _setStatus(text: string): void {
        this._statusText = text;
        this._updateFooter();
    }

    private _updateFooter(): void {
        if (this._footerLeft) {
            this._footerLeft.textContent = this._statusText || t('Prices · Live');
            this._footerLeft.style.color = this._statusText ? WL_COLORS[this._theme].down : '';
        }
        if (this._footerCount) this._footerCount.textContent = t('{n} symbols').replace('{n}', String(this._footerTotal));
    }

    // ---- Menuler ----

    private _menu(items: ContextMenuItem[]): ContextMenu {
        if (!this._ctx) this._ctx = new ContextMenu({ items, container: this._parent, theme: this._theme, skin: RP_MENU_SKIN });
        else this._ctx.setItems(items);
        this._ctx.hide();
        return this._ctx;
    }

    private _openMenuAt(items: ContextMenuItem[], x: number, y: number): void {
        this._menu(items).show(x, y);
    }

    private _openMenuAnchored(items: ContextMenuItem[], anchor: HTMLElement): void {
        this._menu(items).showAnchored(anchor.getBoundingClientRect());
    }

    private _listActionItems(): ContextMenuItem[] {
        const ro = this._model.readOnly;
        return [
            { id: 'rename', label: 'Yeniden adlandır', disabled: ro, action: () => void this._renameList() },
            { id: 'copy', label: 'Kopya oluştur', disabled: ro, action: () => this._copyList() },
            { id: 'clear', label: 'Listeyi temizle', disabled: ro, action: () => void this._clearList() },
            { id: 'delete', label: 'Listeyi sil', disabled: ro, action: () => void this._deleteList() },
        ];
    }

    private _openListMenu(anchor: HTMLElement): void {
        const m = this._model;
        const items: ContextMenuItem[] = m.lists.map((l) => ({
            id: `list:${l.id}`,
            label: l.name,
            icon: l.id === m.activeId ? CHECK_SVG : '',
            action: () => this._switchList(l.id),
        }));
        items.push({ id: 's1', label: '', separator: true });
        items.push({ id: 'new', label: 'Yeni liste oluştur…', action: () => void this._createList() });
        items.push(...this._listActionItems());
        const flagged = FLAG_COLORS.filter((f) => m.flaggedCount(f.id) > 0);
        if (flagged.length) {
            items.push({ id: 's2', label: '', separator: true });
            items.push({ id: 'flagged-head', label: 'Bayraklı listeler', disabled: true });
            for (const f of flagged) {
                const id = FLAGGED_PREFIX + f.id;
                items.push({ id, label: `${f.label} (${m.flaggedCount(f.id)})`, icon: flagSvg(f.hex), action: () => this._switchList(id) });
            }
        }
        this._openMenuAnchored(items, anchor);
    }

    private _toggleColumn(id: 'spark' | 'chg' | 'chgPct' | 'vol'): void {
        const on = !this._model.columns[id];
        this._model.setColumn(id, on);
        // Acilan sutun sigmiyorsa panel gerektigi kadar genisler (sutun sessizce kaybolmasin).
        if (on && id !== 'chg' && this._width < requiredWidth(this._model.columns)) this.setWidth(requiredWidth(this._model.columns), this._prevWidth === null);
        this._render();
    }

    private _columnItems(): ContextMenuItem[] {
        const cols = this._model.columns;
        const item = (id: 'spark' | 'chg' | 'chgPct' | 'vol', label: string): ContextMenuItem => ({
            id: `col-${id}`, label, icon: cols[id] ? CHECK_SVG : '', action: () => this._toggleColumn(id),
        });
        return [
            item('spark', t('1M chart')),
            { id: 'col-last', label: t('Last'), icon: CHECK_SVG, disabled: true },
            item('chgPct', t('Day %')),
            item('vol', t('Volume')),
            item('chg', t('Change')),
        ];
    }

    private _sortItems(): ContextMenuItem[] {
        const sort = this._model.sort;
        const mk = (col: SortCol, label: string): ContextMenuItem => {
            const on = sort?.col === col;
            return {
                id: `sort-${col}`,
                label: on ? `${label} ${sort!.dir === 'asc' ? '↑' : '↓'}` : label,
                icon: on ? CHECK_SVG : '',
                action: () => this._onSortClick(col),
            };
        };
        return [
            { id: 'sort-none', label: t('Manual order'), icon: sort ? '' : CHECK_SVG, action: () => { this._model.setSort(null); this._render(); } },
            mk('symbol', t('Symbol')),
            mk('last', t('Last')),
            mk('chgPct', t('Day %')),
            mk('vol', t('Volume')),
            mk('chg', t('Change')),
        ];
    }

    private _openViewMenu(anchor: HTMLElement): void {
        const ro = this._model.readOnly;
        const items: ContextMenuItem[] = [
            { id: 'h-cols', label: t('Columns'), disabled: true },
            ...this._columnItems(),
            { id: 's1', label: '', separator: true },
            { id: 'h-sort', label: t('Sort'), disabled: true },
            ...this._sortItems(),
            { id: 's2', label: '', separator: true },
            { id: 'add-section', label: 'Bölüm ekle', disabled: ro, action: () => this._addSection() },
        ];
        this._openMenuAnchored(items, anchor);
    }

    private _openRowMenu(e: MouseEvent, id: string): void {
        e.preventDefault();
        e.stopPropagation();
        if (!this._selected.has(id)) {
            this._selected = new Set([id]);
            this._anchor = id;
            this._cursor = id;
            this._renderList(true);
        }
        const ids = this._selectedIdsInOrder();
        const m = this._model;
        const ro = m.readOnly;
        const keys = ids.filter((i) => i.startsWith('s:')).map((i) => i.slice(2));
        const single = ids.length === 1;
        const items: ContextMenuItem[] = [];
        if (ro) {
            items.push({ id: 'remove', label: 'Bayrağı kaldır', action: () => this._unflag(keys) });
        } else {
            items.push({ id: 'remove', label: ids.length > 1 ? `Listeden çıkar (${ids.length})` : 'Listeden çıkar', shortcut: 'Del', action: () => this._removeIds(ids) });
            items.push({ id: 'section-above', label: 'Üstüne bölüm ekle', disabled: !single, action: () => this._addSection(m.indexOfItem(ids[0])) });
            items.push({ id: 's1', label: '', separator: true });
            if (ids.some((i) => i.startsWith('c:')) && single) {
                items.push({ id: 'rename-section', label: 'Bölümü yeniden adlandır', action: () => this._startEdit(ids[0].slice(2), false) });
            }
            items.push({ id: 'top', label: 'En üste taşı', disabled: !!m.sort, action: () => this._moveIds(ids, 'top') });
            items.push({ id: 'bottom', label: 'En alta taşı', disabled: !!m.sort, action: () => this._moveIds(ids, 'bottom') });
        }
        if (keys.length) {
            items.push({ id: 's2', label: '', separator: true });
            items.push({
                id: 'flag',
                label: 'Bayrak',
                submenu: true,
                children: [
                    ...FLAG_COLORS.map((f) => ({ id: `flag-${f.id}`, label: f.label, icon: flagSvg(f.hex), action: () => this._setFlags(keys, f.id) })),
                    { id: 'unflag', label: 'Bayrağı kaldır', action: () => this._unflag(keys) },
                ],
            });
            items.push({ id: 'copy-symbol', label: 'Sembolü kopyala', action: () => this._copySymbol(keys[0]) });
        }
        this._openMenuAt(items, e.clientX, e.clientY);
    }

    // ---- Eylemler ----

    private _resetSelection(): void {
        this._selected.clear();
        this._anchor = '';
        this._cursor = '';
    }

    private _switchList(id: string): void {
        if (this._model.setActive(id)) {
            this._resetSelection();
            this._render();
        }
    }

    private async _createList(): Promise<void> {
        const name = await promptDialog(this._parent, this._theme, 'Yeni liste', '', 'Oluştur');
        if (name === null) return;
        this._model.createList(name);
        this._resetSelection();
        this._render();
    }

    private async _renameList(): Promise<void> {
        if (this._model.readOnly) return;
        const name = await promptDialog(this._parent, this._theme, 'Listeyi yeniden adlandır', this._model.activeName);
        if (name === null) return;
        this._model.renameList(this._model.activeId, name);
        this._render();
    }

    private _copyList(): void {
        if (this._model.readOnly) return;
        this._model.copyList(this._model.activeId);
        this._resetSelection();
        this._render();
    }

    private async _clearList(): Promise<void> {
        if (this._model.readOnly) return;
        const ok = await confirmDialog(this._parent, this._theme, 'Listeyi temizle', `"${this._model.activeName}" listesindeki tüm semboller çıkarılsın mı?`, 'Temizle');
        if (!ok) return;
        this._model.clearList(this._model.activeId);
        this._resetSelection();
        this._render();
    }

    private async _deleteList(): Promise<void> {
        if (this._model.readOnly) return;
        const ok = await confirmDialog(this._parent, this._theme, 'Listeyi sil', `"${this._model.activeName}" listesi silinsin mi?`, 'Sil');
        if (!ok) return;
        this._model.deleteList(this._model.activeId);
        this._resetSelection();
        this._render();
    }

    private _openSearch(): void {
        if (this._model.readOnly || this._search) return;
        this._search = new WatchlistSearch(this._parent, this._theme, {
            getRows: () => this._rows,
            isAdded: (r) => this._model.has(key(r)),
            onAdd: (r) => {
                this._model.addSymbol(key(r));
                this._renderList(true);
            },
            onClose: () => {
                this._search = null;
                this._el.focus({ preventScroll: true });
            },
        });
    }

    private _addSection(index?: number): void {
        if (this._model.readOnly) return;
        const id = this._model.addSection('Yeni bölüm', index);
        this._startEdit(id, true);
    }

    private _removeIds(ids: string[]): void {
        if (this._model.readOnly) return;
        this._model.removeItems(ids);
        for (const i of ids) this._selected.delete(i);
        this._cursor = '';
        this._renderList(true);
    }

    private _moveIds(ids: string[], where: 'top' | 'bottom'): void {
        if (where === 'top') this._model.moveToTop(ids);
        else this._model.moveToBottom(ids);
        this._renderList(true);
    }

    private _setFlags(keys: string[], color: string): void {
        this._model.setFlag(keys, color);
        this._renderList(true);
    }

    private _unflag(keys: string[]): void {
        this._model.setFlag(keys, null);
        this._renderList(true);
    }

    private _copySymbol(k: string): void {
        const [code, exchange] = k.split('|');
        const text = `${exchange}:${code}`;
        try {
            void navigator.clipboard?.writeText(text);
        } catch {
            // Panoya yazilamadi; sessizce gec.
        }
    }

    private _selectedIdsInOrder(): string[] {
        return this._model.items.map(itemId).filter((i) => this._selected.has(i));
    }

    // ---- Satir etkilesimi ----

    private _fireSelect(row: WatchlistRow): void {
        this.symbolSelected.fire({ code: row.code, exchange: row.exchange, assetClass: row.asset_class, name: row.display_name });
    }

    private _onRowClick(e: MouseEvent, id: string, row: WatchlistRow | null): void {
        this._el.focus({ preventScroll: true });
        if (e.shiftKey && this._anchor) {
            const a = this._shown.indexOf(this._anchor);
            const b = this._shown.indexOf(id);
            if (a >= 0 && b >= 0) {
                const [lo, hi] = a < b ? [a, b] : [b, a];
                this._selected = new Set(this._shown.slice(lo, hi + 1).filter((i) => i.startsWith('s:')));
            }
            this._cursor = id;
            this._renderList(true);
            return;
        }
        if (e.metaKey || e.ctrlKey) {
            if (this._selected.has(id)) this._selected.delete(id);
            else this._selected.add(id);
            this._anchor = id;
            this._cursor = id;
            this._renderList(true);
            return;
        }
        this._selected = new Set([id]);
        this._anchor = id;
        this._cursor = id;
        this._renderList(true);
        if (row) this._fireSelect(row);
    }

    private _onKeyDown(e: KeyboardEvent): void {
        if ((e.target as HTMLElement).closest('input,textarea')) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            const symbols = this._shown.filter((i) => i.startsWith('s:') && this._rowRows.has(i));
            if (symbols.length === 0) return;
            e.preventDefault();
            let cur = symbols.indexOf(this._cursor);
            if (cur < 0) {
                const activeId = symbols.find((i) => this._rowRows.get(i)?.code === this._activeCode);
                cur = activeId ? symbols.indexOf(activeId) : -1;
            }
            const next = Math.max(0, Math.min(symbols.length - 1, cur < 0 ? 0 : cur + (e.key === 'ArrowDown' ? 1 : -1)));
            const id = symbols[next];
            this._selected = new Set([id]);
            this._anchor = id;
            this._cursor = id;
            const row = this._rowRows.get(id)!;
            this._renderList(true);
            this._list.querySelector(`[data-wl-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
            this._fireSelect(row);
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            const ids = this._selectedIdsInOrder();
            if (ids.length === 0) return;
            e.preventDefault();
            if (this._model.readOnly) this._unflag(ids.filter((i) => i.startsWith('s:')).map((i) => i.slice(2)));
            else this._removeIds(ids);
        }
    }

    // ---- Bolum satirlari ----

    private _startEdit(id: string, isNew: boolean): void {
        this._editing = { id, isNew };
        this._renderList(true);
        const input = this._list.querySelector<HTMLInputElement>('.wl-section-input');
        input?.focus();
        input?.select();
        input?.scrollIntoView({ block: 'nearest' });
    }

    private _finishEdit(id: string, value: string | null): void {
        const ed = this._editing;
        if (!ed || ed.id !== id) return;
        this._editing = null;
        if (value === null) {
            if (ed.isNew) this._model.removeItems([`c:${id}`]);
        } else {
            this._model.renameSection(id, value);
        }
        this._renderList(true);
        this._el.focus({ preventScroll: true });
    }

    // ---- Cizim ----

    private _ensureSearchInput(): HTMLInputElement {
        if (!this._searchInput) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'wl-filter-input';
            input.autocomplete = 'off';
            input.spellcheck = false;
            input.value = this._query;
            input.style.cssText = 'flex:1;min-width:0;width:100%;height:100%;padding:0;border:0;outline:0;background:transparent;color:var(--rp-text);font:inherit;font-size:13px;user-select:text;';
            input.addEventListener('input', () => {
                if (this._searchTimer) clearTimeout(this._searchTimer);
                this._searchTimer = setTimeout(() => {
                    this._searchTimer = null;
                    this._query = input.value;
                    this._renderList(true);
                }, SEARCH_DEBOUNCE_MS);
            });
            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Escape' && input.value) {
                    if (this._searchTimer) clearTimeout(this._searchTimer);
                    this._searchTimer = null;
                    input.value = '';
                    this._query = '';
                    this._renderList(true);
                }
            });
            input.addEventListener('keyup', (e) => e.stopPropagation());
            this._searchInput = input;
        }
        this._searchInput.placeholder = t('Search symbol or name');
        return this._searchInput;
    }

    private _render(): void {
        const c = WL_COLORS[this._theme];
        applyRpTokens(this._el, this._theme);
        this._el.style.background = c.bg;
        this._el.style.borderLeft = this._embedded ? 'none' : `1px solid ${c.border}`;
        this._el.style.color = c.text;
        this._el.style.setProperty('--wl-flash-up', c.flashUp);
        this._el.style.setProperty('--wl-flash-down', c.flashDown);
        this._el.style.setProperty('--wl-up', c.up);
        this._el.style.setProperty('--wl-down', c.down);
        this._el.style.setProperty('--wl-text', c.text);
        this._el.style.setProperty('--wl-scroll', c.scrollThumb);
        const keepScroll = this._list.scrollTop;
        this._el.replaceChildren();
        this._listSig = '';
        this._detailsSig = '';
        this._layoutSigStr = this._layoutSig();
        const compact = this._width < COMPACT_BELOW;
        const expanded = this._prevWidth !== null;

        // Baslik: liste adi (acilir menu) + ekle / genislet / kapat
        const header = h('div', 'display:flex;align-items:center;justify-content:space-between;gap:8px;height:60px;padding:0 10px 0 16px;flex-shrink:0;box-sizing:border-box;', undefined, 'wl-head');
        const nameBtn = h('button', `display:flex;align-items:center;gap:6px;min-width:0;height:38px;padding:0 8px 0 6px;margin-left:-6px;border:0;background:transparent;color:${c.text};font:inherit;font-size:18px;font-weight:600;letter-spacing:-0.01em;border-radius:10px;cursor:pointer;transition:background .12s;`, undefined, 'wl-list-btn');
        nameBtn.title = t('Lists');
        const listName = this._model.activeName === DEFAULT_LIST_NAME ? t('Watchlist') : this._model.activeName;
        const nameText = h('span', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', listName, 'wl-list-name');
        const caret = h('span', `display:flex;flex-shrink:0;color:${c.muted};`);
        caret.innerHTML = CHEVRON_SVG;
        nameBtn.append(nameText, caret);
        nameBtn.addEventListener('click', () => this._openListMenu(nameBtn));

        const actions = h('div', '', undefined, 'rp-acts');
        const mkBtn = (svg: string, titleText: string, cls: string): HTMLButtonElement => {
            const b = document.createElement('button');
            b.className = `rp-ib ${cls}`;
            b.innerHTML = svg;
            b.title = titleText;
            b.setAttribute('aria-label', titleText);
            return b;
        };
        const addBtn = mkBtn(PLUS_SVG, t('Add symbol'), 'wl-add-btn');
        if (this._model.readOnly) addBtn.style.opacity = '0.4';
        addBtn.addEventListener('click', () => this._openSearch());
        const expandBtn = mkBtn(expanded ? SHRINK_SVG : EXPAND_SVG, expanded ? t('Restore panel width') : t('Expand panel'), 'wl-expand-btn');
        expandBtn.addEventListener('click', () => this._toggleExpand());
        const closeBtn = mkBtn(CLOSE_SVG, t('Close'), 'wl-close-btn');
        closeBtn.addEventListener('click', () => this.setVisible(false));
        actions.append(addBtn, expandBtn, closeBtn);
        header.append(nameBtn, actions);
        this._el.appendChild(header);

        // Filtre: Tumu / Yukselenler / Dusenler + Gorunum menusu
        const bar = h('div', 'display:flex;align-items:center;gap:8px;padding:0 16px 14px;flex-shrink:0;box-sizing:border-box;', undefined, 'wl-toolbar');
        const seg = h('div', `display:flex;flex:1;min-width:0;height:40px;padding:3px;gap:2px;box-sizing:border-box;border:1px solid ${c.border};border-radius:12px;`, undefined, 'wl-seg');
        const styleSeg = (btn: HTMLElement, on: boolean): void => {
            btn.style.background = on ? c.selected : 'transparent';
            btn.style.color = on ? c.text : c.muted;
            btn.dataset.on = on ? '1' : '0';
        };
        const segBtns: HTMLElement[] = [];
        (['all', 'up', 'down'] as Filter[]).forEach((f) => {
            const b = h('button', `flex:1;min-width:0;border:0;border-radius:9px;padding:0 4px;font:inherit;font-size:${this._width < TINY_BELOW ? 12 : 13.5}px;font-weight:500;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:background .12s,color .12s;`, f === 'all' ? t('All') : f === 'up' ? t('Gainers') : t('Losers'), 'wl-seg-btn');
            b.dataset.filter = f;
            styleSeg(b, this._filter === f);
            b.addEventListener('click', () => {
                this._filter = f;
                segBtns.forEach((x) => styleSeg(x, x.dataset.filter === f));
                this._renderList(true);
            });
            segBtns.push(b);
            seg.appendChild(b);
        });
        const viewBtn = h('button', `display:flex;align-items:center;justify-content:center;gap:7px;flex-shrink:0;height:40px;padding:0 ${compact ? 11 : 12}px;box-sizing:border-box;border:1px solid ${c.border};border-radius:12px;background:transparent;color:${c.text};font:inherit;font-size:13.5px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .12s;`, undefined, 'wl-view-btn');
        viewBtn.title = t('View');
        const sl = h('span', 'display:flex;');
        sl.innerHTML = SLIDERS_SVG;
        viewBtn.appendChild(sl);
        if (!compact) {
            viewBtn.appendChild(h('span', '', t('View')));
            const vc = h('span', `display:flex;color:${c.muted};`);
            vc.innerHTML = CHEVRON_SVG;
            viewBtn.appendChild(vc);
        }
        viewBtn.addEventListener('click', () => this._openViewMenu(viewBtn));
        bar.append(seg, viewBtn);
        this._el.appendChild(bar);

        // Sutun basliklari (arama + tiklayinca siralar)
        this._el.appendChild(this._colHeader);
        this._renderColHeader();

        // Satirlar
        this._list.style.minHeight = '60px';
        this._renderList(true);
        this._el.appendChild(this._list);
        this._list.scrollTop = keepScroll;

        // Alt bilgi
        const footer = h('div', `display:flex;align-items:center;justify-content:space-between;gap:8px;height:34px;padding:0 16px;flex-shrink:0;box-sizing:border-box;border-top:1px solid ${c.border};color:${c.muted};font-size:12.5px;`, undefined, 'wl-footer');
        this._footerLeft = h('span', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', undefined, 'wl-status');
        this._footerCount = h('span', 'white-space:nowrap;', undefined, 'wl-count');
        footer.append(this._footerLeft, this._footerCount);
        this._el.appendChild(footer);
        this._updateFooter();

        // Ayrintilar bolumu (ayirici + icerik)
        this._el.appendChild(this._detailsWrap);
        this._renderDetails();

        if (this._handle) this._el.appendChild(this._handle);
        this._bindListDrop();
    }

    /** Genislet / geri al: paylasilan panel mevcut genislik ile izin verilen en buyuk genislik arasinda gecer. */
    private _toggleExpand(): void {
        if (this._prevWidth !== null) {
            const w = this._prevWidth;
            this._prevWidth = null;
            this.setWidth(w, true);
            this._persistWidth = true;
        } else {
            const max = this._clampWidth(Infinity);
            if (max > this._width) {
                this._prevWidth = this._width;
                // The expanded width is temporary: not persisted, so a reload comes back at the normal width.
                this.setWidth(max, false);
            }
        }
        this._render();
    }

    // ---- Sutun basligi / siralama ----

    private _renderColHeader(): void {
        const c = WL_COLORS[this._theme];
        const cols = this._visibleCols();
        const sort = this._model.sort;
        const hd = this._colHeader;
        hd.replaceChildren();
        hd.style.cssText = `display:grid;grid-template-columns:${gridTemplate(cols, this._width)};gap:6px;align-items:center;height:${WL_METRICS.colHeaderH}px;padding:0 ${WL_METRICS.padRight}px 0 ${WL_METRICS.padLeft}px;border-top:1px solid ${c.border};border-bottom:1px solid ${c.border};color:${c.muted};font-size:13px;font-weight:400;flex-shrink:0;box-sizing:border-box;`;

        const field = h('label', `display:flex;align-items:center;gap:7px;min-width:0;height:30px;padding:0 9px;box-sizing:border-box;border:1px solid ${c.border};border-radius:8px;color:${c.muted};cursor:text;transition:border-color .12s;`, undefined, 'wl-search-field');
        const ic = h('span', 'display:flex;flex-shrink:0;');
        ic.innerHTML = SEARCH_SVG;
        field.append(ic, this._ensureSearchInput());
        hd.appendChild(field);

        const label = (col: ColId | 'chg'): string => {
            switch (col) {
                case 'spark': return getCurrentLanguage() === 'tr' ? '1A' : '1M';
                case 'last': return t('Last');
                case 'chgPct': return t('Day %');
                case 'vol': return t('Volume');
                default: return t('Change');
            }
        };
        const mk = (col: ColId): HTMLElement => {
            const sortable = col !== 'spark';
            const active = sortable && sort?.col === col;
            const cell = h('span', `display:flex;align-items:center;gap:4px;min-width:0;justify-content:flex-end;white-space:nowrap;${sortable ? 'cursor:pointer;' : ''}${active ? `color:${c.text};` : ''}`, undefined, sortable ? 'wl-colhead' : 'wl-colhead-static');
            if (sortable) {
                cell.dataset.sort = col;
                cell.title = t('Sort');
                cell.addEventListener('click', () => this._onSortClick(col as SortCol));
            }
            if (active) {
                const arrow = h('span', 'display:flex;');
                arrow.innerHTML = ARROW_SVG(sort!.dir);
                cell.appendChild(arrow);
                cell.dataset.dir = sort!.dir;
            }
            cell.appendChild(h('span', '', label(col)));
            return cell;
        };
        hd.append(...cols.map(mk));
        hd.oncontextmenu = (e) => {
            e.preventDefault();
            this._openMenuAt(this._columnItems(), e.clientX, e.clientY);
        };
    }

    private _onSortClick(col: SortCol): void {
        this._model.setSort(nextSort(this._model.sort, col));
        this._renderColHeader();
        this._renderList(true);
    }

    /** Liste alani uzerindeki suruklemeyi (satirlar ve bos alan) tek yerden yonetir. */
    private _bindListDrop(): void {
        if (this._list.dataset.wlBound) return;
        this._list.dataset.wlBound = '1';
        this._list.addEventListener('dragover', (e) => {
            if (!this._dragging) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            const rowEl = (e.target as HTMLElement).closest('[data-wl-id]') as HTMLElement | null;
            const groupEl = rowEl ? null : ((e.target as HTMLElement).closest('[data-cat]') as HTMLElement | null);
            const items = this._model.items;
            let top: number;
            if (groupEl) {
                // Otomatik grup basligi: oge, grubun ilk ogesinin onune (grup bossa / daraltilmissa listenin sonuna).
                const cat = groupEl.dataset.cat as Category;
                const byKey = new Map(this._rows.map((r) => [key(r), r]));
                const first = items.findIndex((it) => it.type === 'symbol' && !!byKey.get(it.key) && categoryOf(byKey.get(it.key)!) === cat);
                this._dropIndex = first >= 0 ? first : items.length;
                top = groupEl.offsetTop + groupEl.offsetHeight;
            } else if (!rowEl) {
                this._dropIndex = items.length;
                const all = this._list.querySelectorAll<HTMLElement>('[data-wl-id]');
                const last = all.length ? all[all.length - 1] : null;
                top = last ? last.offsetTop + last.offsetHeight : 0;
            } else {
                const rect = rowEl.getBoundingClientRect();
                const after = e.clientY > rect.top + rect.height / 2;
                let idx = this._model.indexOfItem(rowEl.dataset.wlId!);
                if (after) {
                    idx += 1;
                    // Daraltilmis bolumun gizli satirlarinin sonuna.
                    const it = items[idx - 1];
                    if (it && it.type === 'section' && it.collapsed) while (items[idx] && items[idx].type === 'symbol') idx += 1;
                }
                this._dropIndex = idx;
                top = after ? rowEl.offsetTop + rowEl.offsetHeight : rowEl.offsetTop;
            }
            this._showDropLine(top);
        });
        this._list.addEventListener('drop', (e) => {
            if (!this._dragging) return;
            e.preventDefault();
            const ids = this._dragIds;
            const at = this._dropIndex;
            this._endDrag();
            if (ids.length && at >= 0) this._model.moveItems(ids, at);
            this._renderList(true);
        });
        this._list.addEventListener('dragleave', (e) => {
            if (!this._list.contains(e.relatedTarget as Node | null)) this._hideDropLine();
        });
    }

    private _showDropLine(top: number): void {
        if (!this._dropLine) {
            const line = document.createElement('div');
            line.className = 'wl-drop-line';
            line.style.cssText = `position:absolute;left:0;right:0;height:2px;background:${WL_COLORS[this._theme].accent};pointer-events:none;z-index:5;`;
            this._dropLine = line;
        }
        if (this._dropLine.parentElement !== this._list) this._list.appendChild(this._dropLine);
        this._dropLine.style.top = `${Math.max(0, top - 1)}px`;
    }

    private _hideDropLine(): void {
        this._dropLine?.remove();
        this._dropIndex = -1;
    }

    private _endDrag(): void {
        this._dragging = false;
        this._dragIds = [];
        this._hideDropLine();
    }

    private _passes(row: WatchlistRow): boolean {
        if (this._filter === 'up' && !(row.change_pct !== null && row.change_pct > 0)) return false;
        if (this._filter === 'down' && !(row.change_pct !== null && row.change_pct < 0)) return false;
        const q = this._query.trim().toLowerCase();
        if (!q) return true;
        const hay = [row.code, displaySymbol(row.code), row.display_name, row.exchange].join(' ').toLowerCase();
        return hay.includes(q);
    }

    /**
     * Listeyi yeniler. Yapi (satir kumesi / sira / gruplama / filtre / arama / daraltma / sutunlar / secim) degismediyse
     * (periyodik fiyat guncellemesi) mevcut satir hucreleri yerinde guncellenir; DOM dugumleri, kaydirma ve hover
     * korunur. Aksi halde yeniden kurulur (kaydirma yine korunur). Periyodik guncelleme (force=false) bolum adi
     * duzenlenirken veya surukleme sirasinda atlanir.
     */
    private _renderList(force = false): void {
        if (!force && (this._editing || this._dragging)) return;
        const c = WL_COLORS[this._theme];
        const byKey = new Map(this._rows.map((r) => [key(r), r]));
        const filtering = this._filter !== 'all' || this._query.trim() !== '';
        const searching = this._query.trim() !== '';
        const all = this._model.items;
        const hasSections = all.some((it) => it.type === 'section');
        const sorted = applySort(all, (k) => byKey.get(k), this._model.sort);

        interface Block { section: Extract<WatchlistItem, { type: 'section' }> | null; cat: Category | null; rows: { id: string; row: WatchlistRow }[] }
        const blocks: Block[] = [];
        if (hasSections) {
            let cur: Block | null = null;
            for (const item of sorted) {
                if (item.type === 'section') {
                    cur = { section: item, cat: null, rows: [] };
                    blocks.push(cur);
                    continue;
                }
                const row = byKey.get(item.key);
                if (!row || !this._passes(row)) continue;
                if (!cur) {
                    cur = { section: null, cat: null, rows: [] };
                    blocks.push(cur);
                }
                cur.rows.push({ id: itemId(item), row });
            }
        } else {
            const byCat = new Map<Category, Block>();
            for (const item of sorted) {
                if (item.type !== 'symbol') continue;
                const row = byKey.get(item.key);
                if (!row || !this._passes(row)) continue;
                const cat = categoryOf(row);
                let b = byCat.get(cat);
                if (!b) {
                    b = { section: null, cat, rows: [] };
                    byCat.set(cat, b);
                }
                b.rows.push({ id: itemId(item), row });
            }
            for (const cat of CATEGORY_ORDER) if (byCat.has(cat)) blocks.push(byCat.get(cat)!);
        }

        // Plan: ne gosterilecek (DOM'dan bagimsiz).
        type Plan =
            | { kind: 'section'; item: Extract<WatchlistItem, { type: 'section' }>; count: number }
            | { kind: 'group'; cat: Category; count: number }
            | { kind: 'row'; id: string; row: WatchlistRow };
        const plan: Plan[] = [];
        const shown: string[] = [];
        const rowRows = new Map<string, WatchlistRow>();
        let total = 0;
        for (const b of blocks) {
            total += b.rows.length;
            if (b.section) {
                if (filtering && b.rows.length === 0) continue;
                shown.push(itemId(b.section));
                plan.push({ kind: 'section', item: b.section, count: b.rows.length });
            } else if (b.cat) {
                plan.push({ kind: 'group', cat: b.cat, count: b.rows.length });
            }
            const collapsed = !searching && (b.section ? b.section.collapsed : b.cat ? this._model.isGroupCollapsed(b.cat) : false);
            if (collapsed) continue;
            for (const { id, row } of b.rows) {
                shown.push(id);
                rowRows.set(id, row);
                plan.push({ kind: 'row', id, row });
            }
        }
        const showEmpty = total === 0 && !(hasSections && !filtering && blocks.length);

        // Gorunmeyen (filtre / arama / daraltma ile gizlenen) secimler eylemlere karismasin.
        const shownSet = new Set(shown);
        for (const id of [...this._selected]) if (!shownSet.has(id)) this._selected.delete(id);
        if (this._cursor && !shownSet.has(this._cursor)) this._cursor = '';
        if (this._anchor && !shownSet.has(this._anchor)) this._anchor = '';

        const sigParts: string[] = [
            this._theme, getCurrentLanguage(), this._layoutSig(), String(this._model.columns.chg),
            this._model.sort ? '1' : '0', this._model.readOnly ? '1' : '0', searching ? '1' : '0',
            showEmpty ? `E${filtering ? 1 : 0}${this._rows.length ? 1 : 0}` : '',
        ];
        for (const e of plan) {
            if (e.kind === 'section') {
                const id = itemId(e.item);
                sigParts.push(`S|${id}|${e.item.title}|${e.item.collapsed ? 1 : 0}|${e.count}|${this._selected.has(id) ? 1 : 0}|${this._editing?.id === e.item.id ? 1 : 0}`);
            } else if (e.kind === 'group') {
                sigParts.push(`G|${e.cat}|${this._model.isGroupCollapsed(e.cat) ? 1 : 0}|${e.count}`);
            } else {
                const k = key(e.row);
                sigParts.push(`R|${e.id}|${k}|${this._model.flagOf(k) ?? ''}|${this._selected.has(e.id) ? 1 : 0}|${e.row.code === this._activeCode ? 1 : 0}|${this._descText(e.row)}|${e.row.asset_class}`);
            }
        }
        const sig = sigParts.join('\n');

        this._shown = shown;
        this._rowRows = rowRows;
        if (sig === this._listSig) {
            for (const e of plan) if (e.kind === 'row') this._patchRow(e.id, e.row, c);
        } else {
            const keepScroll = this._list.scrollTop;
            this._list.replaceChildren();
            this._list.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden;position:relative;';
            this._dropLine = null;
            this._rowRefs.clear();
            for (const e of plan) {
                if (e.kind === 'section') this._list.appendChild(this._renderSection(e.item, c, e.count));
                else if (e.kind === 'group') this._list.appendChild(this._renderGroup(e.cat, e.count, c));
                else this._list.appendChild(this._renderRow(e.row, e.id, c));
            }
            if (showEmpty) {
                const loading = !this._model.readOnly && !this._rows.length;
                this._list.appendChild(rpEmptyState(
                    LIST_SVG,
                    filtering && this._rows.length ? t('No matching symbols') : this._model.readOnly ? 'Bu bayrakla işaretli sembol yok' : loading ? 'Yükleniyor…' : 'Liste boş',
                    filtering || this._model.readOnly || loading ? undefined : 'Sembol eklemek için + düğmesini kullan.',
                    'wl-empty',
                ));
            }
            this._list.scrollTop = keepScroll;
            this._listSig = sig;
        }
        this._pendingFlash = new Map();
        this._footerTotal = total;
        this._updateFooter();
        this._requestSparks();
        this._renderDetails();
    }

    /** Veri-sadece guncelleme: satirin fiyat / degisim / % / hacim hucrelerini yerinde yeniler. */
    private _patchRow(id: string, row: WatchlistRow, c: WlColors): void {
        const refs = this._rowRefs.get(id);
        if (!refs) return;
        const k = key(row);
        const dec = this._decimals.get(k, row.price, row.asset_class, row.code);
        const chg = changeOf(row);
        const pct = row.change_pct;
        const pctTrend = trendOf(pct, 2);
        const chgTrend = chg === null ? pctTrend : trendOf(chg, dec);
        const priceText = formatNum(row.price, dec);
        const priceChanged = refs.last.textContent !== priceText;
        setText(refs.last, priceText);
        const dir = this._pendingFlash.get(k);
        if (dir && priceChanged) this._flash(refs.last, dir);
        if (refs.chg) {
            setText(refs.chg, chg === null ? '—' : formatSigned(chg, dec));
            const col = this._trendColor(chgTrend, c);
            if (col !== refs.chgColor) {
                refs.chgColor = col;
                refs.chg.style.color = col;
            }
        }
        if (refs.pct) {
            setText(refs.pct, pct === null ? '—' : formatPct(pct));
            const pcol = this._trendColor(pctTrend, c);
            if (pcol !== refs.pctColor) {
                refs.pctColor = pcol;
                refs.pct.style.color = pcol;
            }
        }
        if (refs.vol) setText(refs.vol, formatVolume(row.volume));
    }

    private _flash(el: HTMLElement, dir: 'up' | 'down'): void {
        el.classList.remove('wl-flash-up', 'wl-flash-down');
        void el.offsetWidth;
        el.classList.add(dir === 'up' ? 'wl-flash-up' : 'wl-flash-down');
        setTimeout(() => el.classList.remove('wl-flash-up', 'wl-flash-down'), WL_FLASH_MS + 100);
    }

    // ---- Gunluk mumlar (grafik + ayrintilar) ----

    private _requestDaily(row: WatchlistRow, maxAgeMs?: number): void {
        const provider = WatchlistPanel.dailyProvider;
        if (!provider) return;
        this._daily.request(key(row), { code: row.code, exchange: row.exchange, assetClass: row.asset_class }, provider, (k) => this._onDailyLoaded(k), maxAgeMs);
    }

    private _requestSparks(): void {
        const keep = new Set<string>();
        // Grafik sutunu gizliyse (dar panel / kapali) satirlar icin mum cekilmez.
        if (this._visibleCols().includes('spark')) {
            for (const row of this._rowRows.values()) {
                keep.add(key(row));
                this._requestDaily(row);
            }
        }
        const dr = this._model.detailsOpen ? this._detailRow() : null;
        if (dr) keep.add(key(dr));
        // Artik gorunmeyen satirlar icin siradaki (baslamamis) istekleri birak.
        this._daily.prune(keep);
    }

    private _sparkMarkup(k: string): string {
        const closes = sparkCloses(this._daily.get(k));
        if (!closes) return '';
        const up = closes[closes.length - 1] >= closes[0];
        return sparkSvg(closes, SPARK_W, SPARK_H, up ? 'var(--rp-up)' : 'var(--rp-down)');
    }

    private _onDailyLoaded(k: string): void {
        const markup = this._sparkMarkup(k);
        for (const el of this._list.querySelectorAll<HTMLElement>('.wl-spark')) {
            // Sadece verisi degisen grafik yeniden cizilir.
            if (el.dataset.k === k && this._sparkMarkups.get(el) !== markup) {
                el.innerHTML = markup;
                this._sparkMarkups.set(el, markup);
            }
        }
        const dr = this._detailRow();
        if (dr && key(dr) === k && this._model.detailsOpen) this._renderDetails(true);
    }

    private _rowBg(id: string, active: boolean, c: WlColors): string {
        return this._selected.has(id) ? c.selected : active ? c.active : 'transparent';
    }

    private _wireDrag(el: HTMLElement, id: string): void {
        // Siralama acikken elle yeniden siralama kapali (TradingView davranisi).
        if (this._model.readOnly || this._model.sort) return;
        el.draggable = true;
        el.addEventListener('dragstart', (e) => {
            if (!this._selected.has(id)) {
                this._selected = new Set([id]);
                this._anchor = id;
            }
            this._dragIds = this._selectedIdsInOrder();
            this._dragging = true;
            e.dataTransfer?.setData('text/plain', this._dragIds.join(','));
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        });
        el.addEventListener('dragend', () => {
            this._endDrag();
            this._renderList(true);
        });
    }


    /** Ortak grup basligi: [ok] [simge] ad [adet]. Bolum ve otomatik grup ayni gorunumu paylasir. */
    private _groupHeader(cls: string, icon: string, collapsed: boolean, count: number, c: WlColors): { el: HTMLElement; chev: HTMLElement; slot: HTMLElement } {
        const el = h('div', `display:flex;align-items:center;gap:10px;height:${WL_METRICS.sectionH}px;padding:0 ${WL_METRICS.padRight}px 0 ${WL_METRICS.padLeft}px;box-sizing:border-box;border-bottom:1px solid ${c.border};cursor:pointer;position:relative;color:${c.text};font-size:14px;font-weight:600;`, undefined, cls);
        const chev = h('span', `display:flex;flex-shrink:0;width:16px;height:16px;align-items:center;justify-content:center;color:${c.muted};transition:transform .12s;transform:rotate(${collapsed ? 180 : 0}deg);`);
        chev.innerHTML = CHEV_UP_SVG;
        const ic = h('span', `display:flex;flex-shrink:0;color:${c.muted};`);
        ic.innerHTML = icon;
        const slot = h('span', 'flex:1;min-width:0;display:flex;align-items:center;');
        const chip = h('span', `flex-shrink:0;min-width:20px;box-sizing:border-box;padding:2px 8px;border-radius:999px;background:${c.selected};color:${c.muted};font-size:12px;font-weight:500;line-height:16px;text-align:center;font-variant-numeric:tabular-nums;`, String(count), 'wl-count-chip');
        el.append(chev, ic, slot, chip);
        return { el, chev, slot };
    }

    /** Arama sirasinda daraltma okunu soluk gosterir (gorunum daraltmayi yoksayar). */
    private _muteChevron(chev: HTMLElement): void {
        chev.style.opacity = '0.35';
        chev.style.cursor = 'default';
    }

    private _renderGroup(cat: Category, count: number, c: WlColors): HTMLElement {
        const collapsed = !this._query.trim() && this._model.isGroupCollapsed(cat);
        const { el, chev, slot } = this._groupHeader('wl-group', catIcon(cat), collapsed, count, c);
        el.dataset.cat = cat;
        el.title = this._query.trim() ? '' : collapsed ? 'Genişlet' : 'Daralt';
        slot.appendChild(h('span', 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', categoryLabel(cat), 'wl-group-title'));
        if (this._query.trim()) this._muteChevron(chev);
        el.addEventListener('click', () => {
            // Arama sirasinda gorunum daraltmayi yoksayar; modeli de degistirme.
            if (this._query.trim()) return;
            this._model.toggleGroup(cat);
            this._renderList(true);
        });
        return el;
    }

    private _renderSection(item: Extract<WatchlistItem, { type: 'section' }>, c: WlColors, count: number): HTMLElement {
        const id = itemId(item);
        const collapsed = !this._query.trim() && item.collapsed;
        const { el, chev, slot } = this._groupHeader('wl-section', catIcon('section'), collapsed, count, c);
        el.dataset.wlId = id;
        if (this._selected.has(id)) el.style.background = c.selected;
        chev.className = 'wl-section-chevron';
        chev.title = item.collapsed ? 'Genişlet' : 'Daralt';
        if (this._query.trim()) {
            this._muteChevron(chev);
            chev.title = '';
        }
        chev.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this._query.trim()) return;
            this._model.toggleSection(item.id);
            this._renderList(true);
        });
        if (this._editing?.id === item.id) {
            const input = document.createElement('input');
            input.className = 'wl-section-input';
            input.value = item.title;
            input.style.cssText = `flex:1;min-width:0;padding:3px 7px;border-radius:6px;border:1px solid ${c.muted};background:${c.input};color:${c.text};font:inherit;font-size:14px;font-weight:600;outline:none;user-select:text;`;
            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') input.blur();
                else if (e.key === 'Escape') {
                    input.dataset.cancel = '1';
                    input.blur();
                }
            });
            input.addEventListener('blur', () => this._finishEdit(item.id, input.dataset.cancel ? null : input.value));
            input.addEventListener('mousedown', (e) => e.stopPropagation());
            input.addEventListener('click', (e) => e.stopPropagation());
            input.addEventListener('dblclick', (e) => e.stopPropagation());
            slot.appendChild(input);
        } else {
            const title = h('span', 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', item.title, 'wl-section-title');
            title.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (!this._model.readOnly) this._startEdit(item.id, false);
            });
            slot.appendChild(title);
        }
        const del = document.createElement('button');
        del.className = 'wl-section-remove';
        del.textContent = '×';
        del.title = 'Bölümü sil';
        del.style.cssText = `display:none;align-items:center;justify-content:center;flex-shrink:0;width:20px;height:20px;padding:0;border:none;border-radius:6px;background:transparent;color:${c.muted};cursor:pointer;line-height:1;font-size:16px;`;
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            this._removeIds([id]);
        });
        el.insertBefore(del, el.lastChild);
        el.addEventListener('click', (e) => this._onRowClick(e, id, null));
        el.addEventListener('contextmenu', (e) => this._openRowMenu(e, id));
        this._wireDrag(el, id);
        return el;
    }

    /** Yuvarlak logo yer tutucusu: baz varligin ilk harfi, renk sembolden turetilir (forex'te iki daire). */
    private _logo(code: string, assetClass: string, size: number): HTMLElement {
        const info = logoInfo(code, assetClass);
        const dia = info.parts.length > 1 ? Math.round(size * 0.66) : size;
        const width = size;
        const wrap = h('span', `position:relative;display:block;flex-shrink:0;width:${width}px;height:${size}px;`, undefined, 'wl-logo');
        info.parts.forEach((p, i) => {
            const pos = i === 0 ? 'left:0;top:0;' : `right:0;bottom:0;box-shadow:0 0 0 1.5px ${WL_COLORS[this._theme].bg};`;
            wrap.appendChild(
                h('span', `position:absolute;${pos}width:${dia}px;height:${dia}px;border-radius:50%;background:${p.color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:${Math.round(dia * 0.5)}px;font-weight:700;line-height:1;`, p.letter),
            );
        });
        return wrap;
    }

    private _trendColor(tr: Trend, c: WlColors): string {
        return tr === 'up' ? c.up : tr === 'down' ? c.down : tr === 'flat' ? c.text : c.muted;
    }

    private _descText(row: WatchlistRow): string {
        const name = row.display_name;
        return name && name !== row.code ? name : displayExchange(row.exchange);
    }

    private _renderRow(row: WatchlistRow, id: string, c: WlColors): HTMLElement {
        const el = document.createElement('div');
        const isActive = row.code === this._activeCode;
        const k = key(row);
        const flag = this._model.flagOf(k);
        const cols = this._visibleCols();
        const dec = this._decimals.get(k, row.price, row.asset_class, row.code);
        el.className = 'wl-row';
        el.dataset.wlId = id;
        el.dataset.code = row.code;
        if (this._selected.has(id)) el.dataset.selected = '1';
        el.style.cssText = `display:grid;grid-template-columns:${gridTemplate(cols, this._width)};gap:6px;align-items:center;height:${WL_METRICS.rowH}px;box-sizing:border-box;padding:0 ${WL_METRICS.padRight}px 0 ${WL_METRICS.padLeft}px;border-bottom:1px solid ${c.border};cursor:pointer;background:${this._rowBg(id, isActive, c)};position:relative;`;
        if (isActive) el.appendChild(h('span', `position:absolute;left:0;top:0;bottom:0;width:3px;background:${c.text};pointer-events:none;`, undefined, 'wl-active-bar'));

        // Sembol hucresi: logo + kod (kalin) + aciklama/borsa (soluk)
        const symCell = h('span', 'display:flex;align-items:center;gap:10px;min-width:0;');
        if (this._model.sort && !this._model.readOnly) symCell.title = SORTED_DRAG_HINT;
        const text = h('span', 'display:flex;flex-direction:column;gap:1px;min-width:0;');
        text.append(
            h('span', 'font-size:14.5px;line-height:19px;font-weight:600;letter-spacing:-0.005em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', displaySymbol(row.code), 'wl-code'),
            h('span', `font-size:13px;line-height:16px;font-weight:400;color:${c.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`, this._descText(row), 'wl-desc'),
        );
        symCell.append(this._logo(row.code, row.asset_class, WL_METRICS.logoSize), text);
        el.appendChild(symCell);

        const num = 'text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        const chg = changeOf(row);
        const pct = row.change_pct;
        const pctTrend = trendOf(pct, 2);
        const chgTrend = chg === null ? pctTrend : trendOf(chg, dec);
        const chgColor = this._trendColor(chgTrend, c);
        const pctColor = this._trendColor(pctTrend, c);
        const refs: RowRefs = { last: el, chg: null, pct: null, vol: null, chgColor, pctColor };
        let lastColEl: HTMLElement | null = null;
        for (const col of cols) {
            if (col === 'spark') {
                const cell = h('span', `display:block;height:${SPARK_H}px;min-width:0;`, undefined, 'wl-spark');
                cell.dataset.k = k;
                const markup = this._sparkMarkup(k);
                cell.innerHTML = markup;
                this._sparkMarkups.set(cell, markup);
                el.appendChild(cell);
                lastColEl = cell;
            } else if (col === 'last') {
                const cell = h('span', 'display:flex;flex-direction:column;align-items:flex-end;gap:1px;min-width:0;');
                const last = h('span', `${num}font-size:14px;line-height:18px;font-weight:500;padding:0 4px;margin:0 -4px;border-radius:6px;`, formatNum(row.price, dec), 'wl-last wl-num');
                const dir = this._pendingFlash.get(k);
                if (dir) this._flash(last, dir);
                refs.last = last;
                cell.appendChild(last);
                if (this._model.columns.chg) {
                    const chgEl = h('span', `${num}font-size:12.5px;line-height:16px;font-weight:400;color:${chgColor};`, chg === null ? '—' : formatSigned(chg, dec), 'wl-chg wl-num');
                    refs.chg = chgEl;
                    cell.appendChild(chgEl);
                }
                el.appendChild(cell);
                lastColEl = cell;
            } else if (col === 'chgPct') {
                const pctEl = h('span', `${num}font-size:13.5px;font-weight:500;color:${pctColor};`, pct === null ? '—' : formatPct(pct), 'wl-pct wl-num');
                refs.pct = pctEl;
                el.appendChild(pctEl);
                lastColEl = pctEl;
            } else {
                const volEl = h('span', `${num}font-size:13px;font-weight:400;color:${c.muted};`, formatVolume(row.volume), 'wl-vol wl-num');
                refs.vol = volEl;
                el.appendChild(volEl);
                lastColEl = volEl;
            }
        }
        // Hover'da son sutunun degeri solar ve yerinde x gorunur (deger yarim kapanmaz).
        const lastCol: HTMLElement | null = lastColEl;
        if (lastCol) lastCol.style.transition = 'opacity .1s';
        this._rowRefs.set(id, refs);

        // Sol kenar bayrak alani: tiklayinca kirmizi bayrak ac/kapa
        const strip = document.createElement('div');
        strip.className = 'wl-flag-strip';
        strip.setAttribute('data-wl-flag', flag ?? '');
        strip.title = flag ? 'Bayrağı kaldır' : 'Bayrakla';
        strip.style.cssText = 'position:absolute;left:3px;top:0;bottom:0;width:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;';
        if (flag) strip.innerHTML = flagSvg(flagHex(flag));
        else {
            strip.innerHTML = flagSvg(c.muted, false);
            strip.style.opacity = '0';
        }
        strip.addEventListener('click', (e) => {
            e.stopPropagation();
            this._model.toggleFlag(k);
            this._renderList(true);
        });
        el.appendChild(strip);

        const remove = document.createElement('button');
        remove.textContent = '×';
        remove.title = 'Listeden çıkar';
        remove.className = 'wl-remove';
        remove.style.cssText = `position:absolute;right:${WL_METRICS.padRight - 4}px;top:50%;transform:translateY(-50%);display:none;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:none;border-radius:6px;background:transparent;color:${c.muted};cursor:pointer;line-height:1;font-size:16px;`;
        remove.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this._model.readOnly) this._unflag([k]);
            else this._removeIds([id]);
        });
        el.appendChild(remove);

        el.addEventListener('mouseenter', () => {
            if (!this._selected.has(id)) el.style.background = isActive ? c.active : c.hover;
            remove.style.display = 'flex';
            if (lastCol) lastCol.style.opacity = '0';
            if (!flag) strip.style.opacity = '0.5';
        });
        el.addEventListener('mouseleave', () => {
            el.style.background = this._rowBg(id, isActive, c);
            remove.style.display = 'none';
            if (lastCol) lastCol.style.opacity = '';
            if (!flag) strip.style.opacity = '0';
        });
        el.addEventListener('click', (e) => this._onRowClick(e, id, row));
        el.addEventListener('contextmenu', (e) => this._openRowMenu(e, id));
        this._wireDrag(el, id);
        return el;
    }

    // ---- Ayrintilar bolumu ----

    /** Ayrintilar icin satir: secili (imlecteki) satir, yoksa aktif (grafikteki) sembol. */
    private _detailRow(): WatchlistRow | null {
        return this._rowRows.get(this._cursor) ?? this._rows.find((r) => r.code === this._activeCode) ?? null;
    }

    private _maxDetailsHeight(): number {
        const total = this._el.clientHeight || 600;
        return Math.max(DETAILS_MIN, Math.round(total * WL_METRICS.detailsMaxFraction));
    }

    private _toggleDetails(): void {
        this._model.setDetails(!this._model.detailsOpen);
        this._renderDetails();
    }

    /**
     * Ayrintilar karti: yapi (sembol / tema / yukseklik / genislik sinifi) degismediyse kart yeniden kurulmaz,
     * degerler yerinde guncellenir (kaydirma korunur).
     */
    private _renderDetails(_fromLoad = false): void {
        const c = WL_COLORS[this._theme];
        const M = WL_METRICS;
        const open = this._model.detailsOpen;
        const wrap = this._detailsWrap;
        const row = open ? this._detailRow() : null;
        const stacked = this._width < 300;
        const bodyH = open ? Math.min(this._model.detailsHeight, this._maxDetailsHeight()) : 0;
        const sig = `${open ? 1 : 0}|${row ? `${key(row)}|${row.display_name}|${row.asset_class}` : '-'}|${this._theme}|${stacked ? 1 : 0}|${bodyH}|${getCurrentLanguage()}`;
        if (sig === this._detailsSig && (!row || this._dRefs)) {
            if (row) this._fillDetails(row);
            return;
        }
        this._detailsSig = sig;
        this._dRefs = null;
        const prevScroll = wrap.querySelector<HTMLElement>('.wl-details')?.scrollTop ?? 0;
        wrap.replaceChildren();
        wrap.className = 'wl-details-wrap';
        wrap.style.cssText = 'flex-shrink:0;display:flex;flex-direction:column;';

        if (!open) {
            const head = h('div', `display:flex;align-items:center;gap:8px;height:${M.detailsHeaderH}px;flex-shrink:0;padding:0 16px;box-sizing:border-box;border-top:1px solid ${c.border};cursor:pointer;color:${c.muted};font-size:13px;font-weight:500;background:${c.bg};`, undefined, 'wl-details-head');
            const chev = h('span', 'display:flex;');
            chev.innerHTML = CHEV_UP_SVG;
            head.append(chev, h('span', '', t('Details')));
            head.title = t('Expand details');
            head.addEventListener('click', () => this._toggleDetails());
            wrap.appendChild(head);
            return;
        }

        const divider = h('div', `height:${M.dividerH}px;flex-shrink:0;cursor:row-resize;position:relative;touch-action:none;background:${c.bg};`, undefined, 'wl-details-divider');
        divider.title = 'Yüksekliği ayarla';
        divider.appendChild(h('div', `position:absolute;left:0;right:0;top:${Math.floor(M.dividerH / 2)}px;height:1px;background:${c.border};`));
        divider.appendChild(h('div', `position:absolute;left:50%;top:${Math.floor(M.dividerH / 2) - 2}px;width:40px;height:4px;margin-left:-20px;border-radius:2px;background:${c.border};transition:background .12s;`, undefined, 'wl-pill'));
        this._bindDividerDrag(divider);
        wrap.appendChild(divider);

        const body = h('div', `height:${bodyH}px;overflow-y:auto;overflow-x:hidden;padding:8px 12px 10px;box-sizing:border-box;background:${c.bg};`, undefined, 'wl-details');
        wrap.appendChild(body);

        const collapseBtn = document.createElement('button');
        collapseBtn.className = 'rp-ib wl-details-collapse';
        collapseBtn.innerHTML = MINUS_SVG;
        collapseBtn.title = t('Collapse details');
        collapseBtn.setAttribute('aria-label', t('Collapse details'));
        collapseBtn.addEventListener('click', () => this._toggleDetails());

        if (!row) {
            const top = h('div', 'display:flex;align-items:center;justify-content:space-between;gap:10px;');
            top.append(h('span', `color:${c.muted};font-size:14px;`, t('Select a symbol for details.')), collapseBtn);
            body.appendChild(top);
            return;
        }

        const mono = `font-family:${RP_FONT_MONO};font-variant-numeric:tabular-nums;`;

        // Baslik: logo + ad + "KOD · tur" (sigmazsa gizlenir) + daralt
        const top = h('div', 'display:flex;align-items:center;gap:8px;min-width:0;height:32px;');
        const nameEl = h('span', 'font-size:15px;line-height:20px;font-weight:600;letter-spacing:-0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;min-width:0;', row.display_name || displaySymbol(row.code), 'wl-d-name');
        const metaEl = h('span', `font-size:12px;line-height:16px;color:${c.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 0;min-width:0;`, `${displaySymbol(row.code)} · ${categoryLabel(categoryOf(row))}`, 'wl-d-meta');
        top.append(this._logo(row.code, row.asset_class, 26), nameEl, metaEl, collapseBtn);
        collapseBtn.style.flexShrink = '0';
        body.appendChild(top);
        // Sigmiyorsa once "KOD · tur" gizlenir.
        const fitMeta = (): void => {
            metaEl.style.visibility = '';
            if (nameEl.scrollWidth > nameEl.clientWidth || metaEl.clientWidth < 40) metaEl.style.visibility = 'hidden';
        };
        this._fitMeta = fitMeta;

        // Govde: kucuk gosterge + fiyat
        const GAUGE = 72;
        const cols = h('div', 'display:flex;flex-direction:row;align-items:center;gap:12px;margin-top:6px;min-width:0;');
        const gaugeWrap = h('div', `position:relative;flex-shrink:0;width:${GAUGE}px;height:${GAUGE}px;`, undefined, 'wl-gauge');
        gaugeWrap.title = t("Green/red arc: open to now within today's range. Blue outer arc: elapsed part of the daily candle.");
        const gaugeHolder = h('div', 'position:absolute;inset:0;');
        gaugeWrap.appendChild(gaugeHolder);
        const centre = h('div', 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;pointer-events:none;');
        const gPct = h('span', `${mono}font-size:13px;line-height:16px;font-weight:500;white-space:nowrap;`, '', 'wl-g-pct');
        centre.appendChild(gPct);
        gaugeWrap.appendChild(centre);

        const right = h('div', 'min-width:0;flex:1;');
        const lastEl = h('div', `${mono}font-size:${this._width < 300 ? 20 : 24}px;line-height:30px;font-weight:400;letter-spacing:-0.02em;white-space:nowrap;overflow:hidden;`, '', 'wl-d-last');
        const subEl = h('div', `${mono}font-size:12px;line-height:16px;margin-top:2px;white-space:normal;overflow:hidden;color:${c.muted};`, undefined, 'wl-d-chg');
        const chgEl = h('span', 'white-space:nowrap;');
        const gSub = h('span', 'display:inline-block;white-space:nowrap;');
        subEl.append(chgEl, gSub);
        right.append(lastEl, subEl);
        cols.append(gaugeWrap, right);
        body.appendChild(cols);

        // OHLC: tek satir, 4 esit sutun (dar panelde 2x2)
        const grid = h('div', `display:grid;grid-template-columns:repeat(${this._width < 300 ? 2 : 4},minmax(0,1fr));gap:${this._width < 300 ? '6px' : '0'} 6px;margin-top:8px;min-width:0;`);
        const vals: HTMLElement[] = [];
        const stat = (label: string): void => {
            const cell = h('div', 'min-width:0;');
            const v = h('div', `${mono}font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;`, '—', 'wl-d-val');
            vals.push(v);
            cell.append(h('div', `${mono}font-size:10.5px;line-height:14px;letter-spacing:0.06em;text-transform:uppercase;color:${c.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`, label), v);
            grid.appendChild(cell);
        };
        stat(t('Open'));
        stat(t('High'));
        stat(t('Low'));
        stat(t('Volume'));
        body.appendChild(grid);

        // Aciklama: yalniz geri sayim
        const legend = h('div', `display:flex;align-items:flex-start;gap:8px;margin-top:6px;color:${c.muted};font-size:12px;line-height:16px;min-width:0;`);
        const legendBar = h('span', `flex-shrink:0;width:18px;height:3px;border-radius:2px;background:${c.accent};`);
        const countdown = h('span', 'min-width:0;');
        countdown.setAttribute('data-wl-countdown', '');
        legend.append(legendBar, countdown);
        body.appendChild(legend);
        body.scrollTop = prevScroll;

        this._gaugeMarkup = '';
        this._dRefs = { gauge: gaugeHolder, gPct, gSub, last: lastEl, chg: chgEl, vals, legendBar, countdown };
        this._fillDetails(row);
        fitMeta();
    }

    /** Ayrintilar kartinin degerlerini yerinde yazar (yapiya dokunmaz). */
    private _fillDetails(row: WatchlistRow): void {
        const refs = this._dRefs;
        if (!refs) return;
        const c = WL_COLORS[this._theme];
        const k = key(row);
        this._requestDaily(row, 60000);
        const bars = this._daily.get(k);
        const now = Date.now();
        const dec = this._decimals.get(k, row.price, row.asset_class, row.code);
        const chg = changeOf(row);
        const pctTrend = trendOf(row.change_pct, 2);
        const chgTrend = chg === null ? pctTrend : trendOf(chg, dec);
        const color = this._trendColor(chgTrend, c);
        const st = dayStats(bars, row, now);
        const win = dayWindow(bars, now);
        this._countdownEnd = win.end;

        const range = st.high !== null && st.low !== null ? st.high - st.low : 0;
        const pos = (v: number | null): number | null => (v === null || st.high === null || st.low === null ? null : range > 0 ? Math.min(1, Math.max(0, (v - st.low) / range)) : 0.5);
        const lastPos = Number.isFinite(row.price) ? pos(row.price) : null;
        const openPos = pos(st.open);
        const upDay = st.open !== null ? row.price >= st.open : (chg ?? 0) >= 0;
        const markup = gaugeSvg({ size: 72, openPos, lastPos: openPos === null ? null : lastPos, elapsed: (now - win.start) / DAY_MS, up: upDay });
        if (markup !== this._gaugeMarkup) {
            this._gaugeMarkup = markup;
            refs.gauge.innerHTML = markup;
        }
        const tr = getCurrentLanguage() === 'tr';
        let sub = '—';
        if (lastPos !== null && range > 0) {
            const pctN = Math.round(lastPos * 100);
            sub = t('{n}% of range').replace('{n}', String(pctN)) + (tr ? `'${trPercentSuffix(pctN)}` : '');
            sub = this._width < 300 ? '' : ' · ' + sub;
        }
        setText(refs.gPct, row.change_pct === null ? '—' : formatPct(row.change_pct));
        setColor(refs.gPct, color);
        setText(refs.gSub, sub);
        this._fitMeta?.();

        const priceStr = formatNum(row.price, dec);
        setText(refs.last, priceStr);
        setText(refs.chg, chg === null ? '—' : t('{v} today').replace('{v}', formatSigned(chg, dec)));
        setColor(refs.chg, color);
        // Fiyat: genislige gore kucult (sigmazsa 14px'e kadar).
        const baseFs = this._width < 300 ? 20 : 24;
        refs.last.style.fontSize = `${baseFs}px`;
        for (let fs = baseFs; fs > 14 && refs.last.clientWidth > 0 && refs.last.scrollWidth > refs.last.clientWidth; ) {
            fs -= 1;
            refs.last.style.fontSize = `${fs}px`;
        }
        // OHLC: tam metin sigmazsa ondaliksiz, sonra K/M/B kompakt bicim (elipsis yok).
        const fitVal = (el: HTMLElement, v: number | null, text: string): void => {
            el.style.fontSize = '';
            setText(el, text);
            if (v === null || el.clientWidth === 0 || el.scrollWidth <= el.clientWidth) return;
            const cands = [compactAbbrev(v)];
            if (Math.abs(v) >= 100) cands.unshift(formatNum(v, 0));
            for (const cand of cands) {
                setText(el, cand);
                if (el.scrollWidth <= el.clientWidth) return;
            }
            el.style.fontSize = '11px';
        };
        fitVal(refs.vals[0], st.open, st.open === null ? '—' : formatNum(st.open, dec));
        fitVal(refs.vals[1], st.high, st.high === null ? '—' : formatNum(st.high, dec));
        fitVal(refs.vals[2], st.low, st.low === null ? '—' : formatNum(st.low, dec));
        fitVal(refs.vals[3], null, st.volume === null ? '—' : formatVolume(st.volume));
        const cd = this._countdownText(now);
        this._lastCountdown = cd;
        setText(refs.countdown, cd);
    }

    private _countdownText(now: number): string {
        return t('Daily candle closes in {time}').replace('{time}', formatCountdown(this._countdownEnd - now, getCurrentLanguage() === 'tr'));
    }

    /** Saniyede bir geri sayimi (dakika degisince) yeniler, tum paneli yeniden cizmeden. */
    private _tickUpdated(): void {
        const el = this._dRefs?.countdown;
        if (!el || !el.isConnected) return;
        const text = this._countdownText(Date.now());
        if (text !== this._lastCountdown) {
            this._lastCountdown = text;
            el.textContent = text;
        }
    }

    private _bindDividerDrag(divider: HTMLElement): void {
        let startY = 0;
        let startH = 0;
        let frame = 0;
        const apply = (height: number, persist: boolean) => {
            const next = Math.max(DETAILS_MIN, Math.min(this._maxDetailsHeight(), Math.round(height)));
            this._model.setDetails(true, next);
            if (!persist) return;
            this._renderDetails();
        };
        divider.addEventListener('pointerdown', (e) => {
            startY = e.clientY;
            startH = this._model.detailsHeight;
            divider.setPointerCapture(e.pointerId);
            divider.dataset.drag = '1';
            e.preventDefault();
        });
        divider.addEventListener('pointermove', (e) => {
            if (!divider.hasPointerCapture(e.pointerId)) return;
            const target = startH + (startY - e.clientY);
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const body = this._detailsWrap.querySelector<HTMLElement>('.wl-details');
                const next = Math.max(DETAILS_MIN, Math.min(this._maxDetailsHeight(), Math.round(target)));
                if (body) body.style.height = `${next}px`;
                this._model.setDetails(true, next);
            });
        });
        const end = (e: PointerEvent) => {
            if (!divider.hasPointerCapture(e.pointerId)) return;
            divider.releasePointerCapture(e.pointerId);
            cancelAnimationFrame(frame);
            delete divider.dataset.drag;
            apply(this._model.detailsHeight, true);
        };
        divider.addEventListener('pointerup', end);
        divider.addEventListener('pointercancel', end);
    }

    destroy(): void {
        if (this._timer) clearInterval(this._timer);
        if (this._tick) clearInterval(this._tick);
        if (this._searchTimer) clearTimeout(this._searchTimer);
        this._daily.destroy();
        this._search?.close();
        this._ctx?.dispose();
        this.symbolSelected.destroy();
        this.visibilityChanged.destroy();
        this.widthChanged.destroy();
        this._el.remove();
    }
}

