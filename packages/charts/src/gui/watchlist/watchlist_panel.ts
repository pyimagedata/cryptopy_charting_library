/**
 * Izleme listesi (Watch list) paneli: grafigin sagina yerlesir, secili
 * sembollerin son fiyat / gunluk degisim % / hacmini periyodik gunceller;
 * satira tiklaninca grafik o sembole gecer.
 *
 * Veri host sayfadan gelir (SpecialForcesIndicator ile ayni desen): host
 * `WatchlistPanel.defaultProvider` degerini bir kez set eder. Kullanicinin
 * listesi ve panelin acik/kapali durumu sadece bu tarayicida (localStorage).
 */

import { Delegate } from '../../helpers/delegate';
import { displaySymbol, displayExchange } from '../../helpers/display-aliases';

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

const KEYS_STORAGE = 'chart.watchlist.keys';
const OPEN_STORAGE = 'chart.watchlist.open';
const WIDTH_STORAGE = 'chart.watchlist.width';
const MIN_WIDTH = 240;
const DEFAULT_WIDTH = 320;
// Bu genisligin altinda sadece Hacim sutunu gizlenir, isimler kesilmesin.
const COMPACT_BELOW = 320;
const REFRESH_MS = 5000;
const UP = '#26a69a';
const DOWN = '#ef5350';

const THEMES = {
    dark: { bg: '#131722', border: '#2a2e39', text: '#d1d4dc', muted: '#787b86', hover: '#1e222d', active: '#2a2e39', menu: '#1e222d' },
    light: { bg: '#ffffff', border: '#e0e3eb', text: '#131722', muted: '#5d606b', hover: '#f0f3fa', active: '#e3effd', menu: '#ffffff' },
};

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

function formatPrice(v: number): string {
    const digits = Math.abs(v) < 10 ? 5 : Math.abs(v) < 100 ? 3 : 2;
    return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatVolume(v: number): string {
    if (!v || v <= 0) return '—';
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
    return v.toFixed(0);
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
    private _menu: HTMLElement | null = null;
    private _handle: HTMLElement | null = null;
    private _rows: WatchlistRow[] = [];
    private _keys: string[] | null = null;
    private _visible = false;
    private _theme: 'dark' | 'light' = 'dark';
    private _activeCode = '';
    private _timer: ReturnType<typeof setInterval> | null = null;
    private _dragIndex = -1;
    private _loadToken = 0;
    private readonly _onDocClick = (e: MouseEvent) => {
        if (this._menu && !this._menu.contains(e.target as Node) && !(e.target as HTMLElement).closest('.wl-add-btn')) {
            this._closeMenu();
        }
    };

    constructor(parent: HTMLElement, top: number) {
        this._parent = parent;
        const storedWidth = Number(readStorage(WIDTH_STORAGE));
        if (Number.isFinite(storedWidth) && storedWidth > 0) this._width = storedWidth;
        this._el = document.createElement('div');
        this._el.className = 'tv-watchlist';
        this._el.style.cssText = `
            position: absolute; top: ${top}px; right: 0; bottom: 0;
            width: ${this._width}px; display: none; flex-direction: column;
            z-index: 30; font-size: 12px; box-sizing: border-box; user-select: none;
        `;
        this._list = document.createElement('div');
        this._status = document.createElement('div');
        parent.appendChild(this._el);
        this._createResizeHandle();

        const stored = readStorage(KEYS_STORAGE);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) this._keys = parsed.filter((k) => typeof k === 'string');
            } catch {
                this._keys = null;
            }
        }
        this._render();
        document.addEventListener('click', this._onDocClick);
    }

    get visible(): boolean {
        return this._visible;
    }

    get width(): number {
        return this._width;
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

    private get _compact(): boolean {
        return this._width < COMPACT_BELOW;
    }

    private _gridColumns(): string {
        return this._compact ? '1fr 82px 64px' : '1fr 82px 64px 58px';
    }

    /** Genislik degisince sutun duzenini satirlari yeniden kurmadan gunceller. */
    private _applyColumns(): void {
        const cols = this._gridColumns();
        this._el.querySelectorAll<HTMLElement>('[data-wl-grid]').forEach((el) => {
            el.style.gridTemplateColumns = cols;
            el.querySelectorAll<HTMLElement>('[data-wl-vol]').forEach((v) => (v.style.display = this._compact ? 'none' : ''));
        });
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
        this._render();
    }

    setActiveSymbol(code: string): void {
        if (code === this._activeCode) return;
        this._activeCode = code;
        this._render();
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
            this._timer = setInterval(() => {
                if (typeof document === 'undefined' || !document.hidden) void this._refresh();
            }, REFRESH_MS);
        } else {
            if (this._timer) clearInterval(this._timer);
            this._timer = null;
            this._closeMenu();
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
            this._rows = rows;
            this._setStatus('');
            if (this._keys === null) this._keys = rows.map(key);
            this._renderList();
        } catch {
            if (token === this._loadToken) this._setStatus('Fiyatlar alınamadı, tekrar denenecek…');
        }
    }

    private _setStatus(text: string): void {
        this._status.textContent = text;
        this._status.style.display = text ? 'block' : 'none';
    }

    private _saveKeys(): void {
        writeStorage(KEYS_STORAGE, JSON.stringify(this._keys ?? []));
    }

    private _visibleRows(): WatchlistRow[] {
        const byKey = new Map(this._rows.map((r) => [key(r), r]));
        return (this._keys ?? []).map((k) => byKey.get(k)).filter((r): r is WatchlistRow => !!r);
    }

    private _closeMenu(): void {
        this._menu?.remove();
        this._menu = null;
    }

    private _openMenu(anchor: HTMLElement): void {
        if (this._menu) {
            this._closeMenu();
            return;
        }
        const c = THEMES[this._theme];
        const menu = document.createElement('div');
        menu.style.cssText = `
            position: absolute; top: 40px; right: 8px; min-width: 200px; max-height: 320px; overflow-y: auto;
            background: ${c.menu}; border: 1px solid ${c.border}; border-radius: 6px; padding: 4px 0;
            box-shadow: 0 6px 20px rgba(0,0,0,0.35); z-index: 40;
        `;
        const inList = new Set(this._keys ?? []);
        const available = this._rows.filter((r) => !inList.has(key(r)));
        if (available.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'Tüm semboller listede';
            empty.style.cssText = `padding: 8px 12px; color: ${c.muted};`;
            menu.appendChild(empty);
        }
        for (const row of available) {
            const item = document.createElement('div');
            item.style.cssText = `padding: 7px 12px; color: ${c.text}; cursor: pointer; display: flex; justify-content: space-between; gap: 12px;`;
            item.innerHTML = `<span>${displaySymbol(row.code)}</span><span style="color:${c.muted}">${displayExchange(row.exchange)}</span>`;
            item.addEventListener('mouseenter', () => (item.style.background = c.hover));
            item.addEventListener('mouseleave', () => (item.style.background = 'transparent'));
            item.addEventListener('click', () => {
                this._keys = [...(this._keys ?? []), key(row)];
                this._saveKeys();
                this._closeMenu();
                this._render();
            });
            menu.appendChild(item);
        }
        this._el.appendChild(menu);
        this._menu = menu;
        void anchor;
    }

    private _render(): void {
        const c = THEMES[this._theme];
        this._closeMenu();
        this._el.style.background = c.bg;
        this._el.style.borderLeft = `1px solid ${c.border}`;
        this._el.style.color = c.text;
        this._el.replaceChildren();

        // Baslik
        const header = document.createElement('div');
        header.style.cssText = `display:flex;align-items:center;justify-content:space-between;height:40px;padding:0 8px 0 12px;border-bottom:1px solid ${c.border};flex-shrink:0;`;
        const title = document.createElement('span');
        title.textContent = 'İzleme Listesi';
        title.style.cssText = 'font-size:13px;font-weight:600;';
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:2px;';
        const mkBtn = (label: string, titleText: string, cls: string): HTMLButtonElement => {
            const b = document.createElement('button');
            b.className = cls;
            b.textContent = label;
            b.title = titleText;
            b.style.cssText = `width:28px;height:28px;border:none;background:transparent;color:${c.muted};font-size:18px;line-height:1;border-radius:4px;cursor:pointer;`;
            b.addEventListener('mouseenter', () => (b.style.background = c.hover));
            b.addEventListener('mouseleave', () => (b.style.background = 'transparent'));
            return b;
        };
        const addBtn = mkBtn('+', 'Sembol ekle', 'wl-add-btn');
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._openMenu(addBtn);
        });
        const closeBtn = mkBtn('×', 'Kapat', 'wl-close-btn');
        closeBtn.addEventListener('click', () => this.setVisible(false));
        actions.append(addBtn, closeBtn);
        header.append(title, actions);
        this._el.appendChild(header);

        // Sutun basliklari
        const cols = document.createElement('div');
        cols.setAttribute('data-wl-grid', '');
        cols.style.cssText = `display:grid;grid-template-columns:${this._gridColumns()};gap:4px;padding:6px 12px;color:${c.muted};font-size:11px;border-bottom:1px solid ${c.border};flex-shrink:0;`;
        cols.innerHTML = `<span>Sembol</span><span style="text-align:right">Son</span><span style="text-align:right">Değ%</span><span data-wl-vol style="text-align:right;display:${this._compact ? 'none' : ''}">Hacim</span>`;
        this._el.appendChild(cols);

        // Satirlar
        this._renderList();
        this._el.appendChild(this._list);

        this._status.style.cssText = `display:${this._status.textContent ? 'block' : 'none'};padding:6px 12px;color:${c.muted};font-size:11px;border-top:1px solid ${c.border};flex-shrink:0;`;
        this._el.appendChild(this._status);
        if (this._handle) this._el.appendChild(this._handle);
    }

    /** Sadece satirlari yeniler (periyodik guncellemede acik menuyu/baslik durumunu bozmaz). */
    private _renderList(): void {
        const c = THEMES[this._theme];
        this._list.replaceChildren();
        this._list.style.cssText = 'flex:1;overflow-y:auto;';
        const rows = this._visibleRows();
        rows.forEach((row, index) => this._list.appendChild(this._renderRow(row, index, c)));
        if (rows.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = this._rows.length ? 'Liste boş. + ile sembol ekle.' : 'Yükleniyor…';
            empty.style.cssText = `padding:16px 12px;color:${c.muted};`;
            this._list.appendChild(empty);
        }
    }

    private _renderRow(row: WatchlistRow, index: number, c: (typeof THEMES)['dark']): HTMLElement {
        const el = document.createElement('div');
        const isActive = row.code === this._activeCode;
        const baseBg = isActive ? c.active : 'transparent';
        el.draggable = true;
        el.setAttribute('data-wl-grid', '');
        el.style.cssText = `display:grid;grid-template-columns:${this._gridColumns()};gap:4px;align-items:center;padding:7px 12px;cursor:pointer;background:${baseBg};position:relative;`;

        const change = row.change_pct;
        const color = change === null ? c.muted : change >= 0 ? UP : DOWN;
        const pct = change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
        el.innerHTML = `
            <span style="display:flex;flex-direction:column;min-width:0;">
                <span style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${displaySymbol(row.code)}</span>
                <span style="color:${c.muted};font-size:10px;">${displayExchange(row.exchange)}</span>
            </span>
            <span style="text-align:right;font-variant-numeric:tabular-nums;">${formatPrice(row.price)}</span>
            <span style="text-align:right;color:${color};font-variant-numeric:tabular-nums;">${pct}</span>
            <span data-wl-vol style="text-align:right;color:${c.muted};font-variant-numeric:tabular-nums;display:${this._compact ? 'none' : ''};">${formatVolume(row.volume)}</span>
        `;

        const remove = document.createElement('button');
        remove.textContent = '×';
        remove.title = 'Listeden çıkar';
        remove.style.cssText = `position:absolute;right:2px;top:50%;transform:translateY(-50%);display:none;width:20px;height:20px;border:none;border-radius:3px;background:${c.hover};color:${c.muted};cursor:pointer;line-height:1;`;
        remove.addEventListener('click', (e) => {
            e.stopPropagation();
            this._keys = (this._keys ?? []).filter((k) => k !== key(row));
            this._saveKeys();
            this._render();
        });
        el.appendChild(remove);

        el.addEventListener('mouseenter', () => {
            el.style.background = isActive ? c.active : c.hover;
            remove.style.display = 'block';
        });
        el.addEventListener('mouseleave', () => {
            el.style.background = baseBg;
            remove.style.display = 'none';
        });
        el.addEventListener('click', () => {
            this.symbolSelected.fire({ code: row.code, exchange: row.exchange, assetClass: row.asset_class, name: row.display_name });
        });

        // Surukle-birak ile siralama
        el.addEventListener('dragstart', (e) => {
            this._dragIndex = index;
            e.dataTransfer?.setData('text/plain', String(index));
        });
        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            el.style.boxShadow = `inset 0 2px 0 ${UP}`;
        });
        el.addEventListener('dragleave', () => (el.style.boxShadow = 'none'));
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            el.style.boxShadow = 'none';
            const from = this._dragIndex;
            this._dragIndex = -1;
            if (from < 0 || from === index) return;
            const shown = this._visibleRows().map(key);
            const [moved] = shown.splice(from, 1);
            shown.splice(index, 0, moved);
            // Gizli (veri gelmeyen) anahtarlar sona korunur.
            const hidden = (this._keys ?? []).filter((k) => !shown.includes(k));
            this._keys = [...shown, ...hidden];
            this._saveKeys();
            this._render();
        });
        return el;
    }

    destroy(): void {
        if (this._timer) clearInterval(this._timer);
        document.removeEventListener('click', this._onDocClick);
        this.symbolSelected.destroy();
        this.visibilityChanged.destroy();
        this.widthChanged.destroy();
        this._el.remove();
    }
}
