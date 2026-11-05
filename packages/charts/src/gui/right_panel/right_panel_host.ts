/**
 * Shared right panel container (TradingView-style widget bar area): ONE host element docked at the right edge of the
 * layout body, ONE width, ONE resize handle. Every right-side panel (watchlist, alerts, object tree, host-registered
 * panels) is a "view" inside it; exactly one view is visible at a time. Views are never destroyed on switch: the
 * inactive ones are only hidden with `visibility` (not `display:none`) so scroll positions, filters and typed text survive.
 *
 * The host only owns geometry + the view switch; what a view shows is up to its owner (clean root element per view).
 */

import { applyRpTokens, ensureRpStyles } from './rp_tokens';

export const RIGHT_PANEL_WIDTH_KEY = 'chart.rightPanel.width';
const LEGACY_WIDTH_KEY = 'chart.watchlist.width';
const MIN_WIDTH = 240;
const MAX_WIDTH = 640;
const MIN_CHART_WIDTH = 320;
const DEFAULT_WIDTH = 360;

const STYLE_ID = 'tv-right-panel-style';
function ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    // `!important` so descendants with an explicit `visibility:visible` cannot paint through a hidden view / closed container.
    st.textContent = '.tv-right-panel-view[data-inactive="1"],.tv-right-panel-view[data-inactive="1"] *,'
        + '.tv-right-panel-container[data-closed="1"],.tv-right-panel-container[data-closed="1"] *{visibility:hidden !important;}';
    document.head.appendChild(st);
}

export interface RightPanelHostOptions {
    /** Width of the area the host is docked in (used for clamping); falls back to 1200. */
    getAvailableWidth: () => number;
    /** Fired on every live width change (resize drag, programmatic set). */
    onWidthChange: (width: number) => void;
}

function readNumber(key: string): number {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? NaN : Number(raw);
    } catch {
        return NaN;
    }
}

export class RightPanelHost {
    readonly element: HTMLElement;
    private readonly _handle: HTMLElement;
    private readonly _views = new Map<string, HTMLElement>();
    private readonly _opts: RightPanelHostOptions;
    private _active: string | null = null;
    private _width: number | null = null;
    private _theme: 'dark' | 'light' = 'dark';
    private _frame = 0;

    constructor(parent: HTMLElement, opts: RightPanelHostOptions) {
        this._opts = opts;
        ensureStyle();
        ensureRpStyles();
        const el = document.createElement('div');
        el.className = 'tv-right-panel-container rp-root';
        el.dataset.closed = '1';
        el.style.cssText = 'position:absolute;top:0;right:0;bottom:0;display:flex;flex-direction:column;'
            + 'z-index:30;box-sizing:border-box;visibility:hidden;pointer-events:none;';
        this.element = el;
        this._handle = this._createHandle();
        el.appendChild(this._handle);
        this._applyTheme();
        parent.appendChild(el);
    }

    get activeId(): string | null {
        return this._active;
    }

    get isOpen(): boolean {
        return this._active !== null;
    }

    /** Width the layout must reserve: the shared width while a view is open, 0 when closed. */
    get width(): number {
        return this._active !== null ? this._ensureWidth() : 0;
    }

    clamp(w: number): number {
        const max = Math.max(MIN_WIDTH, (this._opts.getAvailableWidth() || 1200) - MIN_CHART_WIDTH);
        return Math.round(Math.min(Math.max(w, MIN_WIDTH), Math.min(max, MAX_WIDTH)));
    }

    /**
     * Initial width when `chart.rightPanel.width` is absent: legacy `chart.watchlist.width`, else 360 (constant, so it
     * never depends on which view opens first; registered per-panel widths are ignored).
     */
    private _ensureWidth(): number {
        if (this._width === null) {
            let w = readNumber(RIGHT_PANEL_WIDTH_KEY);
            if (!(Number.isFinite(w) && w > 0)) w = readNumber(LEGACY_WIDTH_KEY);
            if (!(Number.isFinite(w) && w > 0)) w = DEFAULT_WIDTH;
            this._width = this.clamp(w);
        }
        const next = this.clamp(this._width);
        this.element.style.width = `${next}px`;
        return next;
    }

    /** Adds a view (hidden). The returned element fills the host; the owner appends its content to it. */
    addView(id: string): HTMLElement {
        this.removeView(id);
        const view = document.createElement('div');
        view.className = 'tv-right-panel-view';
        view.dataset.viewId = id;
        view.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;box-sizing:border-box;'
            + 'overflow:hidden;visibility:hidden;pointer-events:none;';
        view.dataset.inactive = '1';
        this._views.set(id, view);
        this.element.insertBefore(view, this._handle);
        return view;
    }

    getView(id: string): HTMLElement | undefined {
        return this._views.get(id);
    }

    removeView(id: string): void {
        const view = this._views.get(id);
        if (!view) return;
        view.remove();
        this._views.delete(id);
        if (this._active === id) this.show(null);
    }

    /** Shows exactly one view (null closes the container). `_ignoredWidth` is accepted for compatibility and ignored. */
    show(id: string | null, _ignoredWidth?: number): void {
        if (id !== null && !this._views.has(id)) id = null;
        this._active = id;
        for (const [vid, view] of this._views) {
            const on = vid === id;
            if (!on && view.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
            if (on) delete view.dataset.inactive; else view.dataset.inactive = '1';
            view.style.visibility = on ? 'visible' : 'hidden';
            view.style.pointerEvents = on ? 'auto' : 'none';
        }
        const open = id !== null;
        if (open) delete this.element.dataset.closed; else this.element.dataset.closed = '1';
        this.element.style.visibility = open ? 'visible' : 'hidden';
        this.element.style.pointerEvents = open ? 'auto' : 'none';
        // Closed = invisible but still laid out (display:none would reset the views' scroll offsets).
        if (open) this._ensureWidth();
    }

    /** Live width change (clamped); persisted only when `persist` is true. */
    setWidth(w: number, persist = true): void {
        const next = this.clamp(w);
        if (next === this._width) {
            if (persist) this._persist(next);
            return;
        }
        this._width = next;
        this.element.style.width = `${next}px`;
        if (persist) this._persist(next);
        this._opts.onWidthChange(next);
    }

    private _persist(w: number): void {
        try { localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(w)); } catch { /* preference only */ }
    }

    setTheme(theme: 'dark' | 'light'): void {
        this._theme = theme;
        this._applyTheme();
    }

    private _applyTheme(): void {
        applyRpTokens(this.element, this._theme);
        this.element.style.background = 'var(--rp-bg)';
        this.element.style.borderLeft = '1px solid var(--rp-border)';
    }

    destroy(): void {
        cancelAnimationFrame(this._frame);
        this._views.clear();
        this.element.remove();
    }

    /** Left-edge drag handle: 7px strip, col-resize, blue hover, pointer capture; dragging left widens the panel. */
    private _createHandle(): HTMLElement {
        const handle = document.createElement('div');
        handle.className = 'tv-right-panel-resize';
        handle.style.cssText = 'position:absolute;left:-3px;top:0;bottom:0;width:7px;cursor:col-resize;z-index:45;touch-action:none;';
        let startX = 0;
        let startW = 0;
        handle.addEventListener('pointerdown', (e) => {
            startX = e.clientX;
            startW = this.element.getBoundingClientRect().width;
            handle.setPointerCapture(e.pointerId);
            handle.style.background = 'rgba(41,98,255,0.35)';
            e.preventDefault();
        });
        handle.addEventListener('pointermove', (e) => {
            if (!handle.hasPointerCapture(e.pointerId)) return;
            const target = startW + (startX - e.clientX);
            cancelAnimationFrame(this._frame);
            this._frame = requestAnimationFrame(() => this.setWidth(target, false));
        });
        const end = (e: PointerEvent): void => {
            if (!handle.hasPointerCapture(e.pointerId)) return;
            handle.releasePointerCapture(e.pointerId);
            handle.style.background = 'transparent';
            cancelAnimationFrame(this._frame);
            this.setWidth(startW + (startX - e.clientX), true);
        };
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
        handle.addEventListener('mouseenter', () => (handle.style.background = 'rgba(41,98,255,0.35)'));
        handle.addEventListener('mouseleave', () => {
            if (!handle.hasPointerCapture?.(1)) handle.style.background = 'transparent';
        });
        return handle;
    }
}
