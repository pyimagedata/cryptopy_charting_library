import { t } from '../../helpers/translations';
import { LayoutDef, LayoutId, isLayoutLocked, layoutThumbnailSvg, layoutsByCount } from './layout-catalog';

export interface LayoutSyncState {
    symbol: boolean;
    interval: boolean;
    crosshair: boolean;
    time: boolean;
    dateRange: boolean;
}

/** What the menu needs from MultiChartLayout (keeps the UI free of layout internals). */
export interface LayoutMenuHost {
    getLayout(): LayoutId;
    getSync(): LayoutSyncState;
    getMaxCharts(): number | null;
    getTheme(): 'dark' | 'light';
    selectLayout(id: LayoutId): void;
    /** Called when a locked layout is clicked; returns the inline notice text. */
    lockedClicked(id: LayoutId): string;
    setSync(partial: Partial<LayoutSyncState>): void;
}

const SYNC_ROWS: Array<{ key: keyof LayoutSyncState; label: string }> = [
    { key: 'symbol', label: 'Symbol' },
    { key: 'interval', label: 'Interval' },
    { key: 'crosshair', label: 'Crosshair cursor' },
    { key: 'time', label: 'Time' },
    { key: 'dateRange', label: 'Date range' },
];

const LOCK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">' +
    '<path d="M5 0.5a2 2 0 0 0-2 2V4H2.5A.5.5 0 0 0 2 4.5v4a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-4A.5.5 0 0 0 7.5 4H7V2.5a2 2 0 0 0-2-2Zm1 3.5H4V2.5a1 1 0 0 1 2 0V4Z"/></svg>';

const CHEVRON_SVG =
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

interface MenuColors {
    bg: string;
    border: string;
    text: string;
    muted: string;
    hover: string;
    active: string;
    activeText: string;
    cellBg: string;
    shadow: string;
    notice: string;
    noticeBg: string;
}

function colors(theme: 'dark' | 'light'): MenuColors {
    return theme === 'dark'
        ? {
            bg: '#1e222d', border: '#363a45', text: '#d1d4dc', muted: '#787b86', hover: '#2a2e39',
            active: 'rgba(41, 98, 255, 0.22)', activeText: '#5b8cff', cellBg: '#2a2e39',
            shadow: '0 8px 24px rgba(0,0,0,0.45)', notice: '#ffb74d', noticeBg: 'rgba(255, 183, 77, 0.12)',
        }
        : {
            bg: '#ffffff', border: '#e0e3eb', text: '#131722', muted: '#787b86', hover: '#f0f3fa',
            active: 'rgba(41, 98, 255, 0.12)', activeText: '#2962ff', cellBg: '#f0f3fa',
            shadow: '0 8px 24px rgba(19,23,34,0.18)', notice: '#b26a00', noticeBg: 'rgba(255, 152, 0, 0.14)',
        };
}

/** Toolbar button (current layout icon) + TradingView-style popover: layouts by chart count + "Sync in layout". */
export class LayoutMenu {
    private _trigger: HTMLButtonElement | null = null;
    private _popover: HTMLElement | null = null;
    private _notice = '';
    private _noticeTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly _onDocPointerDown = (e: PointerEvent): void => {
        const target = e.target as Node | null;
        if (!target) return;
        if (this._popover?.contains(target) || this._trigger?.contains(target)) return;
        this.close();
    };
    private readonly _onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') this.close();
    };

    constructor(private readonly _host: LayoutMenuHost) {}

    get isOpen(): boolean {
        return this._popover !== null;
    }

    /** Creates the toolbar trigger (wrapper element to append into the toolbar). */
    createTrigger(): HTMLElement {
        this._trigger?.parentElement?.remove();
        const wrap = document.createElement('div');
        wrap.className = 'tv-layout-menu-wrap toolbar-layout-wrap';
        wrap.style.cssText = 'display:flex;align-items:center;margin-left:4px;flex-shrink:0;';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tv-layout-menu-trigger';
        btn.title = t('Chart layout');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.isOpen) this.close();
            else this.open();
        });
        wrap.appendChild(btn);
        this._trigger = btn;
        this.updateTrigger();
        return wrap;
    }

    updateTrigger(): void {
        const btn = this._trigger;
        if (!btn) return;
        const c = colors(this._host.getTheme());
        btn.title = t('Chart layout');
        btn.style.cssText = `display:flex;align-items:center;gap:5px;height:28px;padding:0 7px;border-radius:5px;cursor:pointer;
            border:none;background:${this.isOpen ? c.hover : 'transparent'};color:${c.text};`;
        btn.innerHTML = `<span style="display:flex">${layoutThumbnailSvg(this._host.getLayout(), 20, 15, { gap: 1.2, radius: 1 })}</span>${CHEVRON_SVG}`;
        btn.onmouseenter = () => { btn.style.background = c.hover; };
        btn.onmouseleave = () => { btn.style.background = this.isOpen ? c.hover : 'transparent'; };
    }

    open(): void {
        if (this._popover || !this._trigger) return;
        const pop = document.createElement('div');
        pop.className = 'tv-layout-menu';
        document.body.appendChild(pop);
        this._popover = pop;
        this._notice = '';
        this._render();
        this._position();
        document.addEventListener('pointerdown', this._onDocPointerDown, true);
        document.addEventListener('keydown', this._onKeyDown, true);
        window.addEventListener('resize', this._onResize);
        this.updateTrigger();
    }

    close(): void {
        if (!this._popover) return;
        this._popover.remove();
        this._popover = null;
        if (this._noticeTimer) clearTimeout(this._noticeTimer);
        this._noticeTimer = null;
        document.removeEventListener('pointerdown', this._onDocPointerDown, true);
        document.removeEventListener('keydown', this._onKeyDown, true);
        window.removeEventListener('resize', this._onResize);
        this.updateTrigger();
    }

    /** Re-render after theme / language / state changes. */
    refresh(): void {
        this.updateTrigger();
        if (this._popover) {
            this._render();
            this._position();
        }
    }

    destroy(): void {
        this.close();
        this._trigger?.parentElement?.remove();
        this._trigger = null;
    }

    private readonly _onResize = (): void => this._position();

    private _position(): void {
        const pop = this._popover;
        const trg = this._trigger;
        if (!pop || !trg) return;
        const r = trg.getBoundingClientRect();
        pop.style.position = 'fixed';
        pop.style.top = `${r.bottom + 6}px`;
        const w = pop.offsetWidth || 300;
        const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w));
        pop.style.left = `${left}px`;
    }

    private _render(): void {
        const pop = this._popover;
        if (!pop) return;
        const c = colors(this._host.getTheme());
        const current = this._host.getLayout();
        const max = this._host.getMaxCharts();
        pop.style.cssText = `position:fixed;z-index:100000;width:292px;box-sizing:border-box;padding:8px 0;border-radius:8px;
            background:${c.bg};color:${c.text};border:1px solid ${c.border};box-shadow:${c.shadow};
            font:13px -apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,Ubuntu,sans-serif;user-select:none;
            top:${pop.style.top};left:${pop.style.left};`;
        pop.innerHTML = '';

        const groups = layoutsByCount();
        const list = document.createElement('div');
        list.style.cssText = 'padding:0 8px;max-height:min(60vh,420px);overflow-y:auto;';
        groups.forEach((group, i) => {
            if (!group.length) return;
            const line = document.createElement('div');
            line.style.cssText = 'display:flex;align-items:flex-start;gap:6px;padding:3px 0;';
            const label = document.createElement('div');
            label.textContent = String(i + 1);
            label.style.cssText = `width:16px;flex:none;padding-top:9px;text-align:center;font-size:12px;color:${c.muted};`;
            line.appendChild(label);
            const cells = document.createElement('div');
            cells.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
            group.forEach((def) => cells.appendChild(this._cell(def, def.id === current, isLayoutLocked(def.id, max), c)));
            line.appendChild(cells);
            list.appendChild(line);
        });
        pop.appendChild(list);

        if (this._notice) {
            const n = document.createElement('div');
            n.className = 'tv-layout-menu-notice';
            n.textContent = this._notice;
            n.style.cssText = `margin:6px 8px 0;padding:6px 8px;border-radius:5px;font-size:12px;color:${c.notice};background:${c.noticeBg};`;
            pop.appendChild(n);
        }

        const sep = document.createElement('div');
        sep.style.cssText = `height:1px;margin:8px 0 6px;background:${c.border};`;
        pop.appendChild(sep);

        const head = document.createElement('div');
        head.textContent = t('Sync in layout');
        head.style.cssText = `padding:2px 14px 4px;font-size:11px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:${c.muted};`;
        pop.appendChild(head);

        const sync = this._host.getSync();
        for (const rowDef of SYNC_ROWS) {
            pop.appendChild(this._syncRow(rowDef.key, t(rowDef.label), sync[rowDef.key], c));
        }
    }

    private _cell(def: LayoutDef, active: boolean, locked: boolean, c: MenuColors): HTMLElement {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.layout = def.id;
        b.title = locked ? `${t(def.title)} (${t('Locked layout')})` : t(def.title);
        b.style.cssText = `position:relative;display:flex;align-items:center;justify-content:center;width:40px;height:30px;padding:0;
            border-radius:5px;cursor:pointer;border:1px solid ${active ? c.activeText : 'transparent'};
            background:${active ? c.active : 'transparent'};color:${active ? c.activeText : c.text};opacity:${locked ? 0.4 : 1};`;
        b.innerHTML = layoutThumbnailSvg(def.id, 28, 20);
        if (locked) {
            const lock = document.createElement('span');
            lock.innerHTML = LOCK_SVG;
            lock.style.cssText = `position:absolute;right:1px;bottom:1px;display:flex;color:${c.text};`;
            b.appendChild(lock);
        }
        b.addEventListener('mouseenter', () => { if (!active) b.style.background = c.hover; });
        b.addEventListener('mouseleave', () => { if (!active) b.style.background = 'transparent'; });
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            if (locked) {
                this._notice = this._host.lockedClicked(def.id);
                this._render();
                this._position();
                if (this._noticeTimer) clearTimeout(this._noticeTimer);
                this._noticeTimer = setTimeout(() => {
                    this._notice = '';
                    if (this._popover) { this._render(); this._position(); }
                }, 4000);
                return;
            }
            this._host.selectLayout(def.id);
            this.close();
        });
        return b;
    }

    private _syncRow(key: keyof LayoutSyncState, label: string, on: boolean, c: MenuColors): HTMLElement {
        const row = document.createElement('div');
        row.dataset.sync = key;
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 14px;cursor:pointer;';
        row.addEventListener('mouseenter', () => { row.style.background = c.hover; });
        row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
        const text = document.createElement('span');
        text.textContent = label;
        const sw = document.createElement('span');
        sw.style.cssText = `position:relative;flex:none;width:30px;height:16px;border-radius:8px;transition:background .12s;
            background:${on ? '#2962ff' : c.cellBg};border:1px solid ${on ? '#2962ff' : c.border};box-sizing:border-box;`;
        const knob = document.createElement('span');
        knob.style.cssText = `position:absolute;top:1px;left:${on ? 15 : 1}px;width:12px;height:12px;border-radius:50%;
            background:${on ? '#fff' : c.muted};transition:left .12s;`;
        sw.appendChild(knob);
        row.appendChild(text);
        row.appendChild(sw);
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            this._host.setSync({ [key]: !on });
            this._render();
            this._position();
        });
        return row;
    }
}
