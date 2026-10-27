/**
 * Nesne agaci (Object Tree) paneli: grafigin sagina yerlesir (izleme listesi gibi grafigi daraltir);
 * tum cizim ve gostergeleri listeler. Cizim satirlari: secim senkronu, goz/kilit/sil, surukleyerek
 * siralama, cift tikla ayarlar, sag tik baglam menusu. Gosterge satirlari: goz/ayar/sil.
 *
 * Guvenlik: kullanici metni (cizim metni, gosterge adi) yalnizca textContent ile yazilir;
 * innerHTML sadece sabit SVG ikonlar icin kullanilir.
 * Panel acikken DrawingManager olaylarina abone olur, kapaninca abonelikleri ve DOM'u birakir.
 */

import { Delegate } from '../../helpers/delegate';
import { t } from '../../helpers/translations';
import type { DrawingManager } from '../../drawings/drawing-manager';
import type { Drawing } from '../../drawings/drawing';
import type { Indicator } from '../../indicators/indicator';
import type { IndicatorManager } from '../../indicators/indicator-manager';
import { getDrawingToolMeta, ROW_ACTION_ICONS as DRAWING_ICONS } from '../drawing_toolbar/drawing_toolbar_widget';
import {
    buildDrawingRows,
    dropIndex,
    matchesFilter,
    drawingIdsKey,
    OBJECT_TREE_MAX_ROWS,
    type DrawingRow,
    type TreeDrawingLike,
} from './object_tree_model';

const OPEN_STORAGE = 'chart.objectTree.open';
const PANEL_WIDTH = 280;

const THEMES = {
    dark: { bg: '#131722', border: '#2a2e39', text: '#d1d4dc', muted: '#787b86', hover: '#1e222d', active: '#2a2e39', sel: 'rgba(41,98,255,0.28)', input: '#1e222d', danger: '#ef5350' },
    light: { bg: '#ffffff', border: '#e0e3eb', text: '#131722', muted: '#5d606b', hover: '#f0f3fa', active: '#e3effd', sel: 'rgba(41,98,255,0.16)', input: '#f0f3fa', danger: '#d32f2f' },
};

const SVG_GEAR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="16" height="16"><path fill="currentColor" fill-rule="evenodd" d="m3.1 9 2.28-5h7.24l2.28 5-2.28 5H5.38L3.1 9Zm1.63-.5L6.2 5h5.6l1.47 3.5L11.8 12H6.2L4.73 8.5ZM9 7.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/></svg>';
const SVG_CLOSE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="16" height="16"><path fill="currentColor" d="m4.7 4 4.3 4.3L13.3 4l.7.7L9.7 9l4.3 4.3-.7.7L9 9.7 4.7 14l-.7-.7L8.3 9 4 4.7l.7-.7Z"/></svg>';
const SVG_INDICATOR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="16" height="16"><path fill="none" stroke="currentColor" stroke-width="1.4" d="M2 12l4-5 3 3 3-5 4 6"/></svg>';

function readStorage(name: string): string | null {
    try { return localStorage.getItem(name); } catch { return null; }
}
function writeStorage(name: string, value: string): void {
    try { localStorage.setItem(name, value); } catch { /* tercih bu oturumda kalir */ }
}

export interface ObjectTreeHost {
    drawings: DrawingManager;
    indicators: IndicatorManager;
    openDrawingSettings(d: Drawing): void;
    openIndicatorSettings(ind: Indicator): void;
    toggleIndicator(ind: Indicator): void;
    removeIndicator(ind: Indicator): void;
    showDrawingMenu(d: Drawing, x: number, y: number): void;
    requestDraw(): void;
}

interface IndicatorRow {
    id: string;
    name: string;
    visible: boolean;
}

export class ObjectTreePanel {
    readonly visibilityChanged = new Delegate<boolean>();

    private readonly _el: HTMLElement;
    private readonly _body: HTMLElement;
    private readonly _search: HTMLInputElement;
    private readonly _hideAllBtn: HTMLButtonElement;
    private readonly _deleteAllBtn: HTMLButtonElement;
    private readonly _title: HTMLElement;
    private readonly _closeBtn: HTMLButtonElement;
    private _visible = false;
    private _theme: 'dark' | 'light' = 'dark';
    private _filter = '';
    private _confirmDelete = false;
    private _raf = 0;
    private _signature = '';
    private _lastSelectedId: string | null = null;
    private _dragId: string | null = null;
    private _drawingById = new Map<string, Drawing>();
    private _indicatorById = new Map<string, Indicator>();
    private _idsKey = '';
    private _pendingRefresh = false;

    private readonly _onChange = () => {
        this._syncConfirm();
        this.refresh();
    };

    constructor(_parent: HTMLElement, top: number, private readonly _host: ObjectTreeHost) {
        const el = document.createElement('div');
        el.className = 'tv-object-tree';
        el.style.cssText = `position:absolute;top:${top}px;right:0;bottom:0;width:${PANEL_WIDTH}px;display:none;`
            + 'flex-direction:column;z-index:30;font-size:12px;box-sizing:border-box;user-select:none;'
            + "font-family:-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,Ubuntu,sans-serif;";
        this._el = el;

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px 6px;';
        this._title = document.createElement('span');
        this._title.style.cssText = 'font-size:13px;font-weight:600;';
        this._closeBtn = this._mkIconBtn(SVG_CLOSE);
        this._closeBtn.dataset.otAction = 'close';
        header.append(this._title, this._closeBtn);

        const tools = document.createElement('div');
        tools.style.cssText = 'padding:0 12px 8px;display:flex;flex-direction:column;gap:6px;';
        this._search = document.createElement('input');
        this._search.type = 'text';
        this._search.dataset.otSearch = '1';
        this._search.style.cssText = 'width:100%;box-sizing:border-box;padding:5px 8px;border-radius:4px;font-size:12px;outline:none;';
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:6px;align-items:center;';
        this._hideAllBtn = this._mkTextBtn();
        this._hideAllBtn.dataset.otAction = 'hide-all';
        this._deleteAllBtn = this._mkTextBtn();
        this._deleteAllBtn.dataset.otAction = 'delete-all';
        btnRow.append(this._hideAllBtn, this._deleteAllBtn);
        tools.append(this._search, btnRow);

        this._body = document.createElement('div');
        this._body.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;padding-bottom:12px;';

        el.append(header, tools, this._body);
        _parent.appendChild(el);

        el.addEventListener('click', this._onClick);
        el.addEventListener('dblclick', this._onDblClick);
        el.addEventListener('contextmenu', this._onContextMenu);
        el.addEventListener('dragstart', this._onDragStart);
        el.addEventListener('dragover', this._onDragOver);
        el.addEventListener('dragleave', this._onDragLeave);
        el.addEventListener('drop', this._onDrop);
        el.addEventListener('dragend', this._onDragEnd);
        // Grafik/belge kisayollari (Delete, Ctrl+Z ...) panel icindeki yazma alanindan etkilenmesin
        this._search.addEventListener('input', () => {
            this._filter = this._search.value;
            this.refresh();
        });
        this._applyTheme();
        this._applyStaticTexts();
    }

    get visible(): boolean { return this._visible; }
    get width(): number { return PANEL_WIDTH; }

    static wasOpen(): boolean { return readStorage(OPEN_STORAGE) === '1'; }

    toggle(): void { this.setVisible(!this._visible); }

    /** persist:false -> tercih (chart.objectTree.open) yazilmaz (izleme listesi gecici kapatirken) */
    setVisible(visible: boolean, opts: { persist?: boolean } = {}): void {
        if (visible === this._visible) return;
        this._visible = visible;
        if (opts.persist !== false) writeStorage(OPEN_STORAGE, visible ? '1' : '0');
        this._el.style.display = visible ? 'flex' : 'none';
        const dm = this._host.drawings;
        if (visible) {
            dm.drawingsChanged.subscribe(this._onChange);
            dm.selectionChanged.subscribe(this._onChange);
            dm.historyRestored.subscribe(this._onChange);
            this._signature = '';
            this._idsKey = drawingIdsKey(dm.drawings.map((d) => d.id));
            this._render();
        } else {
            this._detach();
        }
        this.visibilityChanged.fire(visible);
    }

    /** Olay abonelikleri ve satir DOM'u birakilir (kapanista ve destroy'da; kalici durum yazilmaz) */
    private _detach(): void {
        const dm = this._host.drawings;
        dm.drawingsChanged.unsubscribe(this._onChange);
        dm.selectionChanged.unsubscribe(this._onChange);
        dm.historyRestored.unsubscribe(this._onChange);
        this._cancelRaf();
        this._body.textContent = '';
        this._drawingById.clear();
        this._indicatorById.clear();
        this._confirmDelete = false;
        this._dragId = null;
        this._pendingRefresh = false;
        this._visible = false;
    }

    setTheme(theme: 'dark' | 'light'): void {
        this._theme = theme;
        this._applyTheme();
        this._signature = '';
        if (this._visible) this.refresh();
    }

    /** "Tumunu sil" onayini iptal eder (sembol/zaman dilimi degisiminde yeni sembolun cizimleri silinmesin) */
    resetDeleteConfirm(): void {
        if (!this._confirmDelete) return;
        this._confirmDelete = false;
        this.refresh();
    }

    /** Cizim kimlik kumesi degistiyse bekleyen silme onayi gecersizdir */
    private _syncConfirm(): void {
        const key = drawingIdsKey(this._host.drawings.drawings.map((d) => d.id));
        if (key !== this._idsKey) {
            this._idsKey = key;
            this._confirmDelete = false;
        }
    }

    /** rAF ile birlestirilmis yeniden cizim (gosterge ekle/sil, zaman dilimi, sembol degisimi vb.) */
    refresh(): void {
        if (!this._visible || this._raf) return;
        if (typeof requestAnimationFrame !== 'function') { this._render(); return; }
        this._raf = requestAnimationFrame(() => {
            this._raf = 0;
            this._render();
        });
    }

    destroy(): void {
        this._detach();
        this._el.removeEventListener('click', this._onClick);
        this._el.removeEventListener('dblclick', this._onDblClick);
        this._el.removeEventListener('contextmenu', this._onContextMenu);
        this._el.removeEventListener('dragstart', this._onDragStart);
        this._el.removeEventListener('dragover', this._onDragOver);
        this._el.removeEventListener('dragleave', this._onDragLeave);
        this._el.removeEventListener('drop', this._onDrop);
        this._el.removeEventListener('dragend', this._onDragEnd);
        this.visibilityChanged.destroy();
        this._el.remove();
    }

    // --- Render ---

    private _cancelRaf(): void {
        if (this._raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._raf);
        this._raf = 0;
    }

    private _labelFor(type: string): string {
        return getDrawingToolMeta(type)?.label ?? type;
    }

    private _iconFor(type: string): string {
        return getDrawingToolMeta(type)?.icon ?? '';
    }

    private _indicatorRows(): IndicatorRow[] {
        const rows: IndicatorRow[] = [];
        for (const ind of this._host.indicators.allIndicators) {
            const name = ind.name || ind.options?.name || 'Indicator';
            if (!matchesFilter(this._filter, name)) continue;
            rows.push({ id: ind.id, name, visible: ind.visible });
        }
        return rows;
    }

    private _render(): void {
        if (!this._visible) return;
        // Suruklenen satir DOM'dan kopmasin: yeniden cizim dragend/drop sonrasina ertelenir
        if (this._dragId) { this._pendingRefresh = true; return; }
        this._syncConfirm();
        const dm = this._host.drawings;
        const all = dm.drawings;
        const selectedId = dm.selectedDrawing?.id ?? null;
        const result = buildDrawingRows(all as unknown as TreeDrawingLike[], {
            filter: this._filter,
            cap: OBJECT_TREE_MAX_ROWS,
            labelFor: (ty) => this._labelFor(ty),
            iconFor: (ty) => this._iconFor(ty),
            isVisibleOnTimeframe: (d) => dm.isVisibleOnCurrentTimeframe(d as unknown as Drawing),
            selectedId,
        });
        const inds = this._indicatorRows();
        const hiddenAll = dm.drawingsHidden;
        const totalDrawings = all.filter((d) => d.state !== 'creating').length;
        const totalInds = this._host.indicators.allIndicators.length;

        const signature = JSON.stringify([this._filter, hiddenAll, this._confirmDelete, this._theme,
            totalDrawings, totalInds, result, inds]);
        if (signature === this._signature) return;
        this._signature = signature;

        this._drawingById = new Map(all.map((d) => [d.id, d]));
        this._indicatorById = new Map(this._host.indicators.allIndicators.map((i) => [i.id, i]));

        this._hideAllBtn.textContent = hiddenAll ? t('Show all') : t('Hide all');
        this._deleteAllBtn.textContent = this._confirmDelete ? `${t('Delete all drawings?')} ${t('Yes')}` : t('Delete all');
        this._deleteAllBtn.dataset.otAction = this._confirmDelete ? 'delete-all-yes' : 'delete-all';
        this._deleteAllBtn.disabled = totalDrawings === 0;
        this._deleteAllBtn.style.opacity = totalDrawings === 0 ? '0.4' : '1';
        this._hideAllBtn.disabled = totalDrawings === 0 && !hiddenAll;

        const c = THEMES[this._theme];
        const frag = document.createDocumentFragment();

        frag.appendChild(this._sectionHeader(`${t('Drawings')} (${this._filter ? result.total : totalDrawings})`));
        if (result.rows.length === 0) {
            frag.appendChild(this._emptyNote(this._filter && totalDrawings > 0 ? t('No matches') : t('No drawings')));
        }
        for (const row of result.rows) frag.appendChild(this._drawingRowEl(row, c));
        if (result.hiddenMore > 0) {
            frag.appendChild(this._emptyNote(`… ${result.hiddenMore} ${t('more')}`));
        }

        frag.appendChild(this._sectionHeader(`${t('Indicators')} (${this._filter ? inds.length : totalInds})`));
        if (inds.length === 0) {
            frag.appendChild(this._emptyNote(this._filter && totalInds > 0 ? t('No matches') : t('No indicators')));
        }
        for (const row of inds) frag.appendChild(this._indicatorRowEl(row));

        this._body.textContent = '';
        this._body.appendChild(frag);

        if (selectedId && selectedId !== this._lastSelectedId) {
            const el = this._body.querySelector<HTMLElement>(`[data-ot-row="drawing"][data-id="${CSS.escape(selectedId)}"]`);
            el?.scrollIntoView?.({ block: 'nearest' });
        }
        this._lastSelectedId = selectedId;
    }

    private _sectionHeader(text: string): HTMLElement {
        const h = document.createElement('div');
        h.dataset.otSection = '1';
        h.style.cssText = `padding:8px 12px 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:${THEMES[this._theme].muted};`;
        h.textContent = text;
        return h;
    }

    private _emptyNote(text: string): HTMLElement {
        const n = document.createElement('div');
        n.style.cssText = `padding:4px 12px 6px;color:${THEMES[this._theme].muted};font-style:italic;`;
        n.textContent = text;
        return n;
    }

    private _actionBtn(action: string, svg: string, title: string, active = false): HTMLButtonElement {
        const b = this._mkIconBtn(svg);
        b.dataset.otAction = action;
        b.title = title;
        b.dataset.otActive = active ? '1' : '0';
        b.style.opacity = active ? '1' : '0';
        b.style.color = active ? THEMES[this._theme].danger : THEMES[this._theme].muted;
        b.className = 'ot-act';
        return b;
    }

    private _drawingRowEl(row: DrawingRow, c: typeof THEMES.dark): HTMLElement {
        const el = document.createElement('div');
        el.className = 'ot-row';
        el.dataset.otRow = 'drawing';
        el.dataset.id = row.id;
        el.draggable = true;
        el.style.cssText = this._rowCss(c, row.selected, !row.visible || row.hiddenByInterval);
        if (row.selected) el.dataset.selected = '1';

        const icon = document.createElement('span');
        icon.style.cssText = 'width:20px;height:20px;flex:none;display:flex;align-items:center;justify-content:center;';
        icon.innerHTML = row.icon; // sabit arac ikonu (kullanici icerigi degil)
        const svg = icon.querySelector('svg');
        if (svg) { svg.setAttribute('width', '18'); svg.setAttribute('height', '18'); }

        const label = document.createElement('span');
        label.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        const name = document.createElement('span');
        name.textContent = row.label;
        label.appendChild(name);
        if (row.text) {
            const txt = document.createElement('span');
            txt.dataset.otText = '1';
            txt.style.cssText = `margin-left:6px;color:${c.muted};`;
            txt.textContent = row.text;
            label.appendChild(txt);
        }

        el.append(icon, label);
        if (row.hiddenByInterval) {
            const m = document.createElement('span');
            m.dataset.otInterval = '1';
            m.textContent = '⏱';
            m.title = t('Hidden on this interval');
            m.style.cssText = 'flex:none;margin-right:2px;';
            el.appendChild(m);
        }
        el.append(
            this._actionBtn('toggle-visible', row.visible ? DRAWING_ICONS.visible : DRAWING_ICONS.hidden, row.visible ? t('Hide') : t('Show'), !row.visible),
            this._actionBtn('toggle-lock', row.locked ? DRAWING_ICONS.lockClosed : DRAWING_ICONS.lock, row.locked ? t('Unlock') : t('Lock'), row.locked),
            this._actionBtn('delete', DRAWING_ICONS.trash, t('Delete')),
        );
        return el;
    }

    private _indicatorRowEl(row: IndicatorRow): HTMLElement {
        const c = THEMES[this._theme];
        const el = document.createElement('div');
        el.className = 'ot-row';
        el.dataset.otRow = 'indicator';
        el.dataset.id = row.id;
        el.style.cssText = this._rowCss(c, false, !row.visible);
        const icon = document.createElement('span');
        icon.style.cssText = 'width:20px;height:20px;flex:none;display:flex;align-items:center;justify-content:center;';
        icon.innerHTML = SVG_INDICATOR;
        const label = document.createElement('span');
        label.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        label.textContent = row.name;
        el.append(icon, label,
            this._actionBtn('ind-toggle', row.visible ? DRAWING_ICONS.visible : DRAWING_ICONS.hidden, row.visible ? t('Hide') : t('Show'), !row.visible),
            this._actionBtn('ind-settings', SVG_GEAR, t('Settings')),
            this._actionBtn('ind-delete', DRAWING_ICONS.trash, t('Delete')),
        );
        return el;
    }

    private _rowCss(c: typeof THEMES.dark, selected: boolean, dim: boolean): string {
        return `display:flex;align-items:center;gap:6px;padding:4px 8px 4px 12px;min-height:28px;cursor:pointer;`
            + `color:${c.text};background:${selected ? c.sel : 'transparent'};opacity:${dim ? 0.5 : 1};`
            + 'border-top:2px solid transparent;border-bottom:2px solid transparent;';
    }

    private _mkIconBtn(svg: string): HTMLButtonElement {
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = svg;
        b.style.cssText = 'flex:none;width:22px;height:22px;padding:0;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:3px;color:inherit;';
        const s = b.querySelector('svg');
        if (s) { s.setAttribute('width', '16'); s.setAttribute('height', '16'); }
        return b;
    }

    private _mkTextBtn(): HTMLButtonElement {
        const b = document.createElement('button');
        b.type = 'button';
        b.style.cssText = 'padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid transparent;background:transparent;';
        return b;
    }

    private _applyStaticTexts(): void {
        this._title.textContent = t('Object tree');
        this._search.placeholder = t('Filter...');
        this._closeBtn.title = t('Close');
    }

    private _applyTheme(): void {
        const c = THEMES[this._theme];
        this._el.style.background = c.bg;
        this._el.style.color = c.text;
        this._el.style.borderLeft = `1px solid ${c.border}`;
        this._search.style.background = c.input;
        this._search.style.color = c.text;
        this._search.style.border = `1px solid ${c.border}`;
        for (const b of [this._hideAllBtn, this._deleteAllBtn]) {
            b.style.color = c.text;
            b.style.borderColor = c.border;
        }
        this._deleteAllBtn.style.color = c.danger;
        this._closeBtn.style.color = c.muted;
        // Tema renkleri panel koküne CSS degiskeni olarak yazilir (grafik basina; paylasilan stil renk icermez)
        this._el.style.setProperty('--ot-hover', c.hover);
        this._el.style.setProperty('--ot-active', c.active);
        this._el.style.setProperty('--ot-sel', c.sel);
        this._ensureStyle();
    }

    /** Satir hover davranisi (eylem dugmeleri hover'da gorunur): tek, statik, renksiz paylasilan stil etiketi */
    private _ensureStyle(): void {
        if (document.getElementById('tv-object-tree-style')) return;
        const st = document.createElement('style');
        st.id = 'tv-object-tree-style';
        st.textContent = '.tv-object-tree .ot-row:hover{background:var(--ot-hover) !important;}'
            + '.tv-object-tree .ot-row[data-selected="1"]:hover{background:var(--ot-sel) !important;}'
            + '.tv-object-tree .ot-row:hover .ot-act{opacity:1 !important;}'
            + '.tv-object-tree .ot-act:hover{background:var(--ot-active);}'
            + '.tv-object-tree button:disabled{cursor:default;}'
            + '.tv-object-tree .ot-drop-above{border-top-color:#2962ff !important;}'
            + '.tv-object-tree .ot-drop-below{border-bottom-color:#2962ff !important;}';
        document.head.appendChild(st);
    }

    // --- Events ---

    private _rowOf(target: EventTarget | null): HTMLElement | null {
        return target instanceof Element ? target.closest<HTMLElement>('[data-ot-row]') : null;
    }

    private readonly _onClick = (e: MouseEvent): void => {
        const target = e.target as Element | null;
        const actionEl = target?.closest<HTMLElement>('[data-ot-action]');
        const row = this._rowOf(target);
        const action = actionEl?.dataset.otAction;
        const dm = this._host.drawings;

        if (action === 'close') { this.setVisible(false); return; }
        if (action === 'hide-all') {
            dm.drawingsHidden = !dm.drawingsHidden;
            this._host.requestDraw();
            return;
        }
        if (action === 'delete-all') { this._confirmDelete = true; this.refresh(); return; }
        if (action === 'delete-all-yes') {
            this._confirmDelete = false;
            dm.deleteAll();
            this._host.requestDraw();
            return;
        }
        if (this._confirmDelete) { this._confirmDelete = false; this.refresh(); }
        if (!row) return;

        const id = row.dataset.id ?? '';
        if (row.dataset.otRow === 'indicator') {
            const ind = this._indicatorById.get(id);
            if (!ind) return;
            if (action === 'ind-toggle') { this._host.toggleIndicator(ind); this.refresh(); }
            else if (action === 'ind-settings') this._host.openIndicatorSettings(ind);
            else if (action === 'ind-delete') { this._host.removeIndicator(ind); this.refresh(); }
            return;
        }
        const d = this._drawingById.get(id);
        if (!d) return;
        if (action === 'toggle-visible') dm.setDrawingVisible(id, !d.visible);
        else if (action === 'toggle-lock') dm.setDrawingLocked(id, !d.locked);
        else if (action === 'delete') dm.deleteDrawing(id);
        else if (dm.selectDrawingById(id)) { /* secim olaylari yeniden cizimi tetikler */ }
        this._host.requestDraw();
    };

    private readonly _onDblClick = (e: MouseEvent): void => {
        const target = e.target as Element | null;
        if (target?.closest('[data-ot-action]')) return;
        const row = this._rowOf(target);
        if (!row) return;
        const id = row.dataset.id ?? '';
        if (row.dataset.otRow === 'indicator') {
            const ind = this._indicatorById.get(id);
            if (ind) this._host.openIndicatorSettings(ind);
            return;
        }
        const d = this._drawingById.get(id);
        if (d) this._host.openDrawingSettings(d);
    };

    private readonly _onContextMenu = (e: MouseEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        const row = this._rowOf(e.target);
        if (!row || row.dataset.otRow !== 'drawing') return;
        const d = this._drawingById.get(row.dataset.id ?? '');
        if (!d) return;
        this._host.drawings.selectDrawingById(d.id);
        this._host.showDrawingMenu(d, e.clientX, e.clientY);
    };

    private readonly _onDragStart = (e: DragEvent): void => {
        const row = this._rowOf(e.target);
        if (!row || row.dataset.otRow !== 'drawing') return;
        this._dragId = row.dataset.id ?? null;
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this._dragId ?? '');
        }
    };

    private _clearDropMarks(): void {
        this._body.querySelectorAll('.ot-drop-above,.ot-drop-below').forEach((n) => n.classList.remove('ot-drop-above', 'ot-drop-below'));
    }

    private readonly _onDragOver = (e: DragEvent): void => {
        if (!this._dragId) return;
        const row = this._rowOf(e.target);
        if (!row || row.dataset.otRow !== 'drawing' || row.dataset.id === this._dragId) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        const rect = row.getBoundingClientRect();
        const above = e.clientY < rect.top + rect.height / 2;
        this._clearDropMarks();
        row.classList.add(above ? 'ot-drop-above' : 'ot-drop-below');
    };

    private readonly _onDragLeave = (e: DragEvent): void => {
        const related = e.relatedTarget;
        if (!(related instanceof Node) || !this._body.contains(related)) this._clearDropMarks();
    };

    private readonly _onDrop = (e: DragEvent): void => {
        const dragId = this._dragId;
        this._dragId = null;
        const row = this._rowOf(e.target);
        this._clearDropMarks();
        this._flushPending();
        if (!dragId || !row || row.dataset.otRow !== 'drawing') return;
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        const above = e.clientY < rect.top + rect.height / 2;
        const dm = this._host.drawings;
        const idx = dropIndex(dm.drawings.map((d) => d.id), dragId, row.dataset.id ?? '', above);
        if (idx === null) return;
        dm.moveDrawingTo(dragId, idx);
        this._host.requestDraw();
    };

    private readonly _onDragEnd = (): void => {
        this._dragId = null;
        this._clearDropMarks();
        this._flushPending();
    };

    /** Suruklerken ertelenen yeniden cizim tek seferde calistirilir */
    private _flushPending(): void {
        if (!this._pendingRefresh) return;
        this._pendingRefresh = false;
        this._signature = '';
        this.refresh();
    }
}
