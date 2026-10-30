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
import { ContextMenu, ContextMenuItem } from '../context_menu/context_menu';
import { WatchlistModel, WatchlistItem, itemId, FLAG_COLORS, flagHex, FLAGGED_PREFIX, DETAILS_MIN } from './watchlist_model';
import { WL_COLORS, WlColors, WL_METRICS, WL_FLASH_MS } from './watchlist_theme';
import { promptDialog, confirmDialog } from './watchlist_dialogs';
import { WatchlistSearch } from './watchlist_search';
import {
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
    gridTemplate,
    logoInfo,
    nextSort,
    requiredWidth,
    relativeTime,
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
const COL_LABELS: Record<SortCol, string> = { symbol: 'Sembol', last: 'Son', chg: 'Değ', chgPct: 'Değ%', vol: 'Hacim' };
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
        .tv-watchlist * { scrollbar-width: thin; scrollbar-color: var(--wl-scroll) transparent; }
        .tv-watchlist ::-webkit-scrollbar { width: 6px; height: 6px; }
        .tv-watchlist ::-webkit-scrollbar-thumb { background: var(--wl-scroll); border-radius: 3px; }
        .tv-watchlist ::-webkit-scrollbar-track { background: transparent; }
        .tv-watchlist .wl-colhead:hover { color: var(--wl-text) !important; }
    `;
    document.head.appendChild(st);
}

const CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 7.5l3.5 3.5L12 3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEVRON_SVG = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 3.5l3 3 3-3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const PLUS_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 3.5v11M3.5 9h11"/></svg>';
const MORE_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><circle cx="4" cy="9" r="1.4"/><circle cx="9" cy="9" r="1.4"/><circle cx="14" cy="9" r="1.4"/></svg>';
const CLOSE_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/></svg>';
const ARROW_SVG = (dir: 'asc' | 'desc'): string =>
    `<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" style="display:block"><path d="${dir === 'asc' ? 'M4 1.5l3 5H1z' : 'M4 6.5l3-5H1z'}"/></svg>`;

function flagSvg(color: string, filled = true): string {
    return `<svg width="10" height="12" viewBox="0 0 10 12" fill="${filled ? color : 'none'}" stroke="${color}" stroke-width="1.2"><path d="M1.5 0.5v11M1.5 1.5h7l-2 2.5 2 2.5h-7" stroke-linejoin="round"/></svg>`;
}

export class WatchlistPanel {
    static defaultProvider: WatchlistProvider | null = null;

    readonly symbolSelected = new Delegate<WatchlistSelection>();
    readonly visibilityChanged = new Delegate<boolean>();
    readonly widthChanged = new Delegate<number>();
    private _width = DEFAULT_WIDTH;
    private readonly _parent: HTMLElement;

    private readonly _el: HTMLElement;
    private readonly _list: HTMLElement;
    private readonly _status: HTMLElement;
    private readonly _model: WatchlistModel;
    private _handle: HTMLElement | null = null;
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
    private _colsSig = '';
    private _tick: ReturnType<typeof setInterval> | null = null;

    constructor(parent: HTMLElement, top: number, model?: WatchlistModel) {
        this._parent = parent;
        this._model = model ?? new WatchlistModel();
        const storedWidth = Number(readStorage(WIDTH_STORAGE));
        if (Number.isFinite(storedWidth) && storedWidth > 0) this._width = storedWidth;
        this._el = document.createElement('div');
        this._el.className = 'tv-watchlist';
        this._el.tabIndex = 0;
        this._el.style.cssText = `
            position: absolute; top: ${top}px; right: 0; bottom: 0;
            width: ${this._width}px; display: none; flex-direction: column;
            z-index: 30; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif; box-sizing: border-box; user-select: none; outline: none;
        `;
        this._list = document.createElement('div');
        this._status = document.createElement('div');
        this._colHeader = document.createElement('div');
        this._detailsWrap = document.createElement('div');
        ensureStyles();
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

    /** Test / host erisimi icin model. */
    get model(): WatchlistModel {
        return this._model;
    }

    /** Genislik, panelin yanindaki grafik en az ~320px kalacak sekilde sinirlanir. */
    private _clampWidth(w: number): number {
        const max = Math.max(MIN_WIDTH, (this._parent.clientWidth || 1200) - 320);
        return Math.round(Math.min(Math.max(w, MIN_WIDTH), Math.min(max, 640)));
    }

    setWidth(w: number, persist = true): void {
        const next = this._clampWidth(w);
        if (next === this._width) return;
        this._width = next;
        this._el.style.width = `${next}px`;
        if (persist) writeStorage(WIDTH_STORAGE, String(next));
        this._applyColumns();
        this.widthChanged.fire(next);
    }

    private _visibleCols(): ColId[] {
        return effectiveColumns(this._model.columns, this._width);
    }

    /** Genislik degisince gorunen sutun kumesi degistiyse baslik ve satirlari yeniler. */
    private _applyColumns(): void {
        const sig = this._visibleCols().join();
        if (sig === this._colsSig) return;
        this._renderColHeader();
        this._renderList(true);
        this._renderDetails();
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
        this._el.style.display = visible ? 'flex' : 'none';
        if (visible) {
            void this._refresh();
            this._tick = setInterval(() => this._tickUpdated(), 1000);
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
        this._status.textContent = text;
        this._status.style.display = text ? 'block' : 'none';
    }

    // ---- Menuler ----

    private _menu(items: ContextMenuItem[]): ContextMenu {
        if (!this._ctx) this._ctx = new ContextMenu({ items, container: this._parent, theme: this._theme });
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

    private _columnItems(): ContextMenuItem[] {
        const cols = this._model.columns;
        const toggle = (id: 'chg' | 'chgPct' | 'vol') => () => {
            const on = !this._model.columns[id];
            this._model.setColumn(id, on);
            // Acilan sutun sigmiyorsa panel gerektigi kadar genisler (sutun sessizce kaybolmasin).
            if (on && this._width < requiredWidth(this._model.columns)) this.setWidth(requiredWidth(this._model.columns));
            this._renderColHeader();
            this._renderList(true);
        };
        return [
            { id: 'col-last', label: COL_LABELS.last, icon: CHECK_SVG, disabled: true },
            { id: 'col-chg', label: COL_LABELS.chg, icon: cols.chg ? CHECK_SVG : '', action: toggle('chg') },
            { id: 'col-chgPct', label: COL_LABELS.chgPct, icon: cols.chgPct ? CHECK_SVG : '', action: toggle('chgPct') },
            { id: 'col-vol', label: COL_LABELS.vol, icon: cols.vol ? CHECK_SVG : '', action: toggle('vol') },
        ];
    }

    private _openMoreMenu(anchor: HTMLElement): void {
        const ro = this._model.readOnly;
        const items: ContextMenuItem[] = [
            { id: 'add-section', label: 'Bölüm ekle', disabled: ro, action: () => this._addSection() },
            { id: 'columns', label: 'Sütunlar', submenu: true, children: this._columnItems() },
            { id: 's1', label: '', separator: true },
            ...this._listActionItems(),
            { id: 's2', label: '', separator: true },
            { id: 'new', label: 'Yeni liste oluştur…', action: () => void this._createList() },
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

    private _render(): void {
        const c = WL_COLORS[this._theme];
        const M = WL_METRICS;
        this._el.style.background = c.bg;
        this._el.style.borderLeft = `1px solid ${c.border}`;
        this._el.style.color = c.text;
        this._el.style.setProperty('--wl-flash-up', c.flashUp);
        this._el.style.setProperty('--wl-flash-down', c.flashDown);
        this._el.style.setProperty('--wl-up', c.up);
        this._el.style.setProperty('--wl-down', c.down);
        this._el.style.setProperty('--wl-text', c.text);
        this._el.style.setProperty('--wl-scroll', c.scrollThumb);
        this._el.replaceChildren();

        // Baslik: liste adi + acilir menu, sag tarafta dugmeler
        const header = h('div', `display:flex;align-items:center;justify-content:space-between;height:${M.headerH}px;padding:0 8px 0 8px;border-bottom:1px solid ${c.border};flex-shrink:0;gap:4px;`);
        const nameBtn = h('button', `display:flex;align-items:center;gap:6px;min-width:0;max-width:70%;height:${M.buttonSize}px;padding:0 8px;border:none;background:transparent;color:${c.text};font:inherit;font-size:14px;font-weight:600;border-radius:4px;cursor:pointer;`, undefined, 'wl-list-btn');
        nameBtn.title = 'Listeler';
        const nameText = h('span', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', this._model.activeName, 'wl-list-name');
        const caret = h('span', `display:flex;color:${c.muted};`);
        caret.innerHTML = CHEVRON_SVG;
        nameBtn.append(nameText, caret);
        nameBtn.addEventListener('mouseenter', () => (nameBtn.style.background = c.hover));
        nameBtn.addEventListener('mouseleave', () => (nameBtn.style.background = 'transparent'));
        nameBtn.addEventListener('click', () => this._openListMenu(nameBtn));

        const actions = h('div', 'display:flex;gap:2px;flex-shrink:0;');
        const mkBtn = (svg: string, titleText: string, cls: string): HTMLButtonElement => {
            const b = document.createElement('button');
            b.className = cls;
            b.innerHTML = svg;
            b.title = titleText;
            b.style.cssText = `display:flex;align-items:center;justify-content:center;width:${M.buttonSize}px;height:${M.buttonSize}px;padding:0;border:none;background:transparent;color:${c.muted};border-radius:4px;cursor:pointer;`;
            b.addEventListener('mouseenter', () => {
                b.style.background = c.hover;
                b.style.color = c.text;
            });
            b.addEventListener('mouseleave', () => {
                b.style.background = 'transparent';
                b.style.color = c.muted;
            });
            return b;
        };
        const addBtn = mkBtn(PLUS_SVG, 'Sembol ekle', 'wl-add-btn');
        if (this._model.readOnly) addBtn.style.opacity = '0.4';
        addBtn.addEventListener('click', () => this._openSearch());
        const moreBtn = mkBtn(MORE_SVG, 'Liste işlemleri', 'wl-more-btn');
        moreBtn.addEventListener('click', () => this._openMoreMenu(moreBtn));
        const closeBtn = mkBtn(CLOSE_SVG, 'Kapat', 'wl-close-btn');
        closeBtn.addEventListener('click', () => this.setVisible(false));
        actions.append(addBtn, moreBtn, closeBtn);
        header.append(nameBtn, actions);
        this._el.appendChild(header);

        // Sutun basliklari (tiklayinca siralar)
        this._el.appendChild(this._colHeader);
        this._renderColHeader();

        // Satirlar
        this._list.style.minHeight = '60px';
        this._renderList(true);
        this._el.appendChild(this._list);

        this._status.style.cssText = `display:${this._status.textContent ? 'block' : 'none'};padding:6px 12px;color:${c.muted};font-size:11px;border-top:1px solid ${c.border};flex-shrink:0;`;
        this._el.appendChild(this._status);

        // Ayrintilar bolumu (ayirici + icerik)
        this._el.appendChild(this._detailsWrap);
        this._renderDetails();

        if (this._handle) this._el.appendChild(this._handle);
        this._bindListDrop();
    }

    // ---- Sutun basligi / siralama ----

    private _renderColHeader(): void {
        const c = WL_COLORS[this._theme];
        const cols = this._visibleCols();
        this._colsSig = cols.join();
        const sort = this._model.sort;
        const hd = this._colHeader;
        hd.replaceChildren();
        hd.style.cssText = `display:grid;grid-template-columns:${gridTemplate(cols)};gap:6px;align-items:center;height:${WL_METRICS.colHeaderH}px;padding:0 ${WL_METRICS.padRight}px 0 ${WL_METRICS.padLeft}px;color:${c.muted};font-size:11px;border-bottom:1px solid ${c.border};flex-shrink:0;`;
        const mk = (col: SortCol): HTMLElement => {
            const right = col !== 'symbol';
            const active = sort?.col === col;
            const cell = h('span', `display:flex;align-items:center;gap:4px;min-width:0;cursor:pointer;white-space:nowrap;${right ? 'justify-content:flex-end;' : ''}${active ? `color:${c.text};` : ''}`, undefined, 'wl-colhead');
            cell.dataset.sort = col;
            cell.title = 'Sırala';
            if (active && right) {
                const arrow = h('span', 'display:flex;');
                arrow.innerHTML = ARROW_SVG(sort!.dir);
                cell.appendChild(arrow);
            }
            cell.appendChild(h('span', '', COL_LABELS[col]));
            if (active && !right) {
                const arrow = h('span', 'display:flex;');
                arrow.innerHTML = ARROW_SVG(sort!.dir);
                cell.appendChild(arrow);
            }
            if (active) cell.dataset.dir = sort!.dir;
            cell.addEventListener('click', () => this._onSortClick(col));
            return cell;
        };
        hd.append(mk('symbol'), ...cols.map(mk));
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
            const items = this._model.items;
            let top: number;
            if (!rowEl) {
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

    /**
     * Sadece satirlari yeniler. Periyodik guncelleme (force=false) bolum adi duzenlenirken
     * veya surukleme sirasinda atlanir.
     */
    private _renderList(force = false): void {
        if (!force && (this._editing || this._dragging)) return;
        const c = WL_COLORS[this._theme];
        this._list.replaceChildren();
        this._list.style.cssText = 'flex:1;overflow-y:auto;position:relative;';
        this._dropLine = null;
        const byKey = new Map(this._rows.map((r) => [key(r), r]));
        this._shown = [];
        this._rowRows.clear();
        let count = 0;
        const sorted = applySort(this._model.visibleItems(), (k) => byKey.get(k), this._model.sort);
        for (const item of sorted) {
            const id = itemId(item);
            if (item.type === 'section') {
                this._shown.push(id);
                this._list.appendChild(this._renderSection(item, c));
                continue;
            }
            const row = byKey.get(item.key);
            if (!row) continue;
            this._shown.push(id);
            this._rowRows.set(id, row);
            count += 1;
            this._list.appendChild(this._renderRow(row, id, c));
        }
        if (count === 0 && this._shown.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = this._model.readOnly
                ? 'Bu bayrakla işaretli sembol yok.'
                : this._rows.length
                  ? 'Liste boş. + ile sembol ekle.'
                  : 'Yükleniyor…';
            empty.style.cssText = `padding:16px 12px;color:${c.muted};`;
            this._list.appendChild(empty);
        }
        this._pendingFlash = new Map();
        this._renderDetails();
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

    private _renderSection(item: Extract<WatchlistItem, { type: 'section' }>, c: WlColors): HTMLElement {
        const id = itemId(item);
        const el = document.createElement('div');
        el.className = 'wl-section';
        el.dataset.wlId = id;
        el.style.cssText = `display:flex;align-items:center;gap:6px;height:${WL_METRICS.sectionH}px;padding:0 8px 0 8px;cursor:pointer;background:${this._selected.has(id) ? c.selected : c.hover};border-bottom:1px solid ${c.border};position:relative;color:${c.muted};font-size:11px;font-weight:600;letter-spacing:0.4px;`;
        const chev = document.createElement('span');
        chev.className = 'wl-section-chevron';
        chev.innerHTML = CHEVRON_SVG;
        chev.title = item.collapsed ? 'Genişlet' : 'Daralt';
        chev.style.cssText = `display:flex;width:16px;height:16px;align-items:center;justify-content:center;transition:transform .1s;transform:rotate(${item.collapsed ? -90 : 0}deg);`;
        chev.addEventListener('click', (e) => {
            e.stopPropagation();
            this._model.toggleSection(item.id);
            this._renderList(true);
        });
        el.appendChild(chev);
        if (this._editing?.id === item.id) {
            const input = document.createElement('input');
            input.className = 'wl-section-input';
            input.value = item.title;
            input.style.cssText = `flex:1;min-width:0;padding:2px 6px;border-radius:3px;border:1px solid ${c.accent};background:${c.input};color:${c.text};font-size:11px;font-weight:600;text-transform:uppercase;outline:none;`;
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
            el.appendChild(input);
        } else {
            const title = document.createElement('span');
            title.className = 'wl-section-title';
            title.textContent = item.title;
            title.style.cssText = 'flex:1;min-width:0;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            title.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (!this._model.readOnly) this._startEdit(item.id, false);
            });
            el.appendChild(title);
        }
        const del = document.createElement('button');
        del.className = 'wl-section-remove';
        del.textContent = '×';
        del.title = 'Bölümü sil';
        del.style.cssText = `display:none;width:20px;height:20px;border:none;border-radius:3px;background:transparent;color:${c.muted};cursor:pointer;line-height:1;`;
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            this._removeIds([id]);
        });
        el.appendChild(del);
        el.addEventListener('mouseenter', () => (del.style.display = 'block'));
        el.addEventListener('mouseleave', () => (del.style.display = 'none'));
        el.addEventListener('click', (e) => this._onRowClick(e, id, null));
        el.addEventListener('contextmenu', (e) => this._openRowMenu(e, id));
        this._wireDrag(el, id);
        return el;
    }

    /** Yuvarlak logo yer tutucusu: baz varligin ilk harfi, renk sembolden turetilir (forex'te iki daire). */
    private _logo(code: string, assetClass: string, size: number): HTMLElement {
        const info = logoInfo(code, assetClass);
        const dia = info.parts.length > 1 ? Math.round(size * 0.68) : size;
        const width = info.parts.length > 1 ? Math.round(dia * 1.75) : size;
        const wrap = h('span', `position:relative;display:block;flex-shrink:0;width:${width}px;height:${size}px;`, undefined, 'wl-logo');
        info.parts.forEach((p, i) => {
            const pos = i === 0 ? 'left:0;top:0;' : `right:0;bottom:0;box-shadow:0 0 0 1.5px ${WL_COLORS[this._theme].bg};`;
            wrap.appendChild(
                h('span', `position:absolute;${pos}width:${dia}px;height:${dia}px;border-radius:50%;background:${p.color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:${Math.round(dia * 0.5)}px;font-weight:700;line-height:1;`, p.letter),
            );
        });
        return wrap;
    }

    private _trendColor(t: Trend, c: WlColors): string {
        return t === 'up' ? c.up : t === 'down' ? c.down : t === 'flat' ? c.text : c.muted;
    }

    private _descText(row: WatchlistRow): string {
        return row.display_name || displayExchange(row.exchange);
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
        el.style.cssText = `display:grid;grid-template-columns:${gridTemplate(cols)};gap:6px;align-items:center;height:${WL_METRICS.rowH}px;box-sizing:border-box;padding:0 ${WL_METRICS.padRight}px 0 ${WL_METRICS.padLeft}px;cursor:pointer;background:${this._rowBg(id, isActive, c)};position:relative;${isActive ? `box-shadow:inset 2px 0 0 ${c.accent};` : ''}`;

        // Sembol hucresi: logo + kod (kalin) + aciklama/borsa (soluk)
        const symCell = h('span', 'display:flex;align-items:center;gap:8px;min-width:0;');
        if (this._model.sort && !this._model.readOnly) symCell.title = SORTED_DRAG_HINT;
        const text = h('span', 'display:flex;flex-direction:column;min-width:0;');
        text.append(
            h('span', 'font-size:13px;line-height:16px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', displaySymbol(row.code), 'wl-code'),
            h('span', `font-size:11px;line-height:14px;color:${c.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`, this._descText(row), 'wl-desc'),
        );
        symCell.append(this._logo(row.code, row.asset_class, WL_METRICS.logoSize), text);
        el.appendChild(symCell);

        const num = 'text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        const chg = changeOf(row);
        const pct = row.change_pct;
        const pctTrend = trendOf(pct, 2);
        const chgTrend = chg === null ? pctTrend : trendOf(chg, dec);
        for (const col of cols) {
            if (col === 'last') {
                const cell = h('span', 'display:flex;justify-content:flex-end;min-width:0;');
                const last = h('span', `${num}font-size:13px;padding:2px 4px;margin:0 -4px;border-radius:3px;`, formatNum(row.price, dec), 'wl-last');
                const dir = this._pendingFlash.get(k);
                if (dir) {
                    last.classList.add(dir === 'up' ? 'wl-flash-up' : 'wl-flash-down');
                    setTimeout(() => last.classList.remove('wl-flash-up', 'wl-flash-down'), WL_FLASH_MS + 100);
                }
                cell.appendChild(last);
                el.appendChild(cell);
            } else if (col === 'chg') {
                el.appendChild(h('span', `${num}color:${this._trendColor(chgTrend, c)};`, chg === null ? '—' : formatSigned(chg, dec), 'wl-chg'));
            } else if (col === 'chgPct') {
                el.appendChild(h('span', `${num}color:${this._trendColor(pctTrend, c)};`, pct === null ? '—' : formatPct(pct), 'wl-pct'));
            } else {
                el.appendChild(h('span', `${num}color:${c.muted};`, formatVolume(row.volume), 'wl-vol'));
            }
        }

        // Sol kenar bayrak alani: tiklayinca kirmizi bayrak ac/kapa
        const strip = document.createElement('div');
        strip.className = 'wl-flag-strip';
        strip.setAttribute('data-wl-flag', flag ?? '');
        strip.title = flag ? 'Bayrağı kaldır' : 'Bayrakla';
        strip.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:14px;display:flex;align-items:center;justify-content:center;cursor:pointer;';
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
        remove.style.cssText = `position:absolute;right:2px;top:50%;transform:translateY(-50%);display:none;width:20px;height:20px;border:none;border-radius:3px;background:${c.hover};color:${c.muted};cursor:pointer;line-height:1;`;
        remove.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this._model.readOnly) this._unflag([k]);
            else this._removeIds([id]);
        });
        el.appendChild(remove);

        el.addEventListener('mouseenter', () => {
            if (!this._selected.has(id)) el.style.background = isActive ? c.active : c.hover;
            remove.style.display = 'block';
            if (!flag) strip.style.opacity = '0.5';
        });
        el.addEventListener('mouseleave', () => {
            el.style.background = this._rowBg(id, isActive, c);
            remove.style.display = 'none';
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

    private _renderDetails(): void {
        const c = WL_COLORS[this._theme];
        const M = WL_METRICS;
        const open = this._model.detailsOpen;
        const wrap = this._detailsWrap;
        wrap.replaceChildren();
        wrap.className = 'wl-details-wrap';
        wrap.style.cssText = 'flex-shrink:0;display:flex;flex-direction:column;';

        if (open) {
            const divider = h('div', `height:${M.dividerH}px;flex-shrink:0;cursor:row-resize;position:relative;touch-action:none;background:${c.bg};`, undefined, 'wl-details-divider');
            divider.title = 'Yüksekliği ayarla';
            divider.appendChild(h('div', `position:absolute;left:0;right:0;top:${Math.floor(M.dividerH / 2)}px;height:1px;background:${c.border};`));
            this._bindDividerDrag(divider);
            wrap.appendChild(divider);
        }

        const head = h('div', `display:flex;align-items:center;gap:6px;height:${M.detailsHeaderH}px;flex-shrink:0;padding:0 8px 0 10px;cursor:pointer;color:${c.text};font-size:12px;font-weight:600;${open ? '' : `border-top:1px solid ${c.border};`}background:${c.bg};`, undefined, 'wl-details-head');
        const chev = h('span', `display:flex;color:${c.muted};transition:transform .1s;transform:rotate(${open ? 0 : -90}deg);`);
        chev.innerHTML = CHEVRON_SVG;
        head.append(chev, h('span', '', 'Ayrıntılar'));
        head.title = open ? 'Daralt' : 'Genişlet';
        head.addEventListener('click', () => this._toggleDetails());
        wrap.appendChild(head);
        if (!open) return;

        const body = h('div', `height:${Math.min(this._model.detailsHeight, this._maxDetailsHeight()) - M.detailsHeaderH}px;overflow-y:auto;padding:4px 14px 12px;box-sizing:border-box;background:${c.bg};`, undefined, 'wl-details');
        wrap.appendChild(body);
        const row = this._detailRow();
        if (!row) {
            body.appendChild(h('div', `padding:10px 0;color:${c.muted};`, 'Ayrıntılar için bir sembol seç.'));
            return;
        }
        const dec = this._decimals.get(key(row), row.price, row.asset_class, row.code);
        const chg = changeOf(row);
        const pctTrend = trendOf(row.change_pct, 2);
        const chgTrend = chg === null ? pctTrend : trendOf(chg, dec);
        const color = this._trendColor(chgTrend, c);

        const top = h('div', 'display:flex;align-items:center;gap:10px;min-width:0;');
        const names = h('div', 'display:flex;flex-direction:column;min-width:0;');
        names.append(
            h('span', 'font-size:15px;line-height:20px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', displaySymbol(row.code), 'wl-d-code'),
            h('span', `font-size:12px;line-height:16px;color:${c.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`, row.display_name || displaySymbol(row.code), 'wl-d-name'),
            h('span', `font-size:11px;line-height:15px;color:${c.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:capitalize;`, [displayExchange(row.exchange), row.asset_class].filter(Boolean).join(' · '), 'wl-d-meta'),
        );
        top.append(this._logo(row.code, row.asset_class, 32), names);
        body.appendChild(top);

        const priceRow = h('div', 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-top:10px;');
        priceRow.append(
            h('span', 'font-size:26px;line-height:30px;font-weight:700;font-variant-numeric:tabular-nums;', formatNum(row.price, dec), 'wl-d-last'),
            h('span', `font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;color:${color};`, chg === null ? '—' : formatSigned(chg, dec), 'wl-d-chg'),
            h('span', `font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;color:${this._trendColor(pctTrend, c)};`, row.change_pct === null ? '—' : formatPct(row.change_pct), 'wl-d-pct'),
        );
        body.appendChild(priceRow);

        const stats = h('div', `display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin-top:12px;padding-top:10px;border-top:1px solid ${c.border};`);
        const stat = (label: string, value: string, attr?: string): HTMLElement => {
            const box = h('div', 'display:flex;flex-direction:column;gap:2px;min-width:0;');
            const v = h('span', 'font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', value);
            if (attr) v.setAttribute(attr, row.updated_at);
            box.append(h('span', `font-size:11px;color:${c.muted};`, label), v);
            return box;
        };
        stats.appendChild(stat('Hacim', formatVolume(row.volume)));
        const rel = relativeTime(row.updated_at, Date.now());
        if (rel) stats.appendChild(stat('Güncelleme', rel, 'data-wl-updated'));
        body.appendChild(stats);
    }

    /** Saniyede bir "x sn once" metnini yeniler (tum paneli yeniden cizmeden). */
    private _tickUpdated(): void {
        const el = this._detailsWrap.querySelector<HTMLElement>('[data-wl-updated]');
        if (!el) return;
        const rel = relativeTime(el.getAttribute('data-wl-updated') ?? '', Date.now());
        if (rel) el.textContent = rel;
    }

    private _bindDividerDrag(divider: HTMLElement): void {
        const c = WL_COLORS[this._theme];
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
            divider.style.background = c.accent;
            e.preventDefault();
        });
        divider.addEventListener('pointermove', (e) => {
            if (!divider.hasPointerCapture(e.pointerId)) return;
            const target = startH + (startY - e.clientY);
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const body = this._detailsWrap.querySelector<HTMLElement>('.wl-details');
                const next = Math.max(DETAILS_MIN, Math.min(this._maxDetailsHeight(), Math.round(target)));
                if (body) body.style.height = `${next - WL_METRICS.detailsHeaderH}px`;
                this._model.setDetails(true, next);
            });
        });
        const end = (e: PointerEvent) => {
            if (!divider.hasPointerCapture(e.pointerId)) return;
            divider.releasePointerCapture(e.pointerId);
            cancelAnimationFrame(frame);
            divider.style.background = c.bg;
            apply(this._model.detailsHeight, true);
        };
        divider.addEventListener('pointerup', end);
        divider.addEventListener('pointercancel', end);
        divider.addEventListener('mouseenter', () => (divider.style.background = c.hover));
        divider.addEventListener('mouseleave', () => {
            if (!divider.hasPointerCapture?.(1)) divider.style.background = c.bg;
        });
    }

    destroy(): void {
        if (this._timer) clearInterval(this._timer);
        if (this._tick) clearInterval(this._tick);
        this._search?.close();
        this._ctx?.dispose();
        this.symbolSelected.destroy();
        this.visibilityChanged.destroy();
        this.widthChanged.destroy();
        this._el.remove();
    }
}
