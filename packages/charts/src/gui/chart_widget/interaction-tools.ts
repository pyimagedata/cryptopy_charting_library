/**
 * Chart interaction tools (not drawings): Dot / Demonstration cursors, Eraser, Measure, Zoom In.
 *
 * These are chart interaction modes. They never create a Drawing, never touch drawing history
 * and are never persisted. State lives in InteractionTools; event-handlers.ts routes mouse/keys
 * into it and chart-widget.ts owns the instance and its overlay canvas.
 */

import { formatDurationMs, resolvePipSize } from '../../drawings/line-tool-common';
import { fmt, fmtSigned } from '../../drawings/position-common';
import { t } from '../../helpers/translations';

// ---------------------------------------------------------------------------
// Tool ids
// ---------------------------------------------------------------------------

export type CursorKind = 'crosshair' | 'arrowCursor' | 'dotCursor' | 'demoCursor';
export type ToolMode = 'none' | 'eraser' | 'measure' | 'zoomIn';

export const CURSOR_KINDS: readonly string[] = ['crosshair', 'arrowCursor', 'dotCursor', 'demoCursor'];
export const MODE_TOOLS: readonly string[] = ['eraser', 'measure', 'zoomIn'];
/** Toolbar ids that are magnet settings, not cursors/tools (never change the active tool here) */
const MAGNET_IDS: readonly string[] = ['weakMagnet', 'strongMagnet', 'snapIndicators'];

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Bar index (float) + price: measure points follow the chart when it is panned/zoomed */
export interface MeasurePoint {
    index: number;
    price: number;
}

export interface MeasureResult {
    priceDiff: number;
    pct: number;
    ticks: number;
    bars: number;
    durationMs: number;
    up: boolean;
}

/** Bar time at a (float) index; extrapolates beyond the data with the minimal recent interval. */
export function indexToTime(index: number, times: readonly number[]): number | null {
    const n = times.length;
    if (n === 0) return null;
    if (n === 1) return times[0];
    let interval = Infinity;
    for (let i = Math.max(1, n - 50); i < n; i++) {
        const d = times[i] - times[i - 1];
        if (d > 0 && d < interval) interval = d;
    }
    if (!isFinite(interval)) interval = times[n - 1] - times[n - 2];
    if (index <= 0) return times[0] + index * interval;
    if (index >= n - 1) return times[n - 1] + (index - (n - 1)) * interval;
    const i0 = Math.floor(index);
    return times[i0] + (index - i0) * (times[i0 + 1] - times[i0]);
}

/** Price change, %, ticks (pip / 10), bars and duration between two points. */
export function computeMeasure(
    p1: MeasurePoint,
    p2: MeasurePoint,
    times: readonly number[],
    symbol: string,
    precision: number
): MeasureResult {
    const priceDiff = p2.price - p1.price;
    const pct = p1.price !== 0 ? (priceDiff / Math.abs(p1.price)) * 100 : 0;
    const tick = resolvePipSize(symbol, precision) / 10;
    const ticks = tick > 0 ? priceDiff / tick : 0;
    const bars = Math.round(Math.abs(p2.index - p1.index));
    const t1 = indexToTime(p1.index, times);
    const t2 = indexToTime(p2.index, times);
    const durationMs = t1 !== null && t2 !== null ? Math.abs(t2 - t1) : 0;
    return { priceDiff, pct, ticks, bars, durationMs, up: priceDiff >= 0 };
}

/** Label lines for the chip: price/%/ticks, then bars/duration. */
export function measureLabelLines(r: MeasureResult, precision: number): string[] {
    return [
        `${fmtSigned(r.priceDiff, precision)} (${fmtSigned(r.pct, 2)}%) ${fmtSigned(r.ticks, 0)} ${t('ticks')}`,
        `${fmt(r.bars, 0)} ${t('bars')}, ${formatDurationMs(r.durationMs)}`,
    ];
}

export interface ZoomTarget {
    fromIndex: number;
    toIndex: number;
    minPrice: number;
    maxPrice: number;
}

/**
 * Maps a dragged pixel rectangle to the bar range and price range it covers.
 * Returns null for degenerate (tiny) rectangles.
 */
export function computeZoomTarget(
    x1: number, y1: number, x2: number, y2: number,
    xToIndex: (x: number) => number,
    yToPrice: (y: number) => number,
    minPx: number = 6
): ZoomTarget | null {
    if (Math.abs(x2 - x1) < minPx || Math.abs(y2 - y1) < minPx) return null;
    const fromIndex = xToIndex(Math.min(x1, x2));
    const toIndex = xToIndex(Math.max(x1, x2));
    const pa = yToPrice(y1);
    const pb = yToPrice(y2);
    const minPrice = Math.min(pa, pb);
    const maxPrice = Math.max(pa, pb);
    if (!isFinite(fromIndex) || !isFinite(toIndex) || !isFinite(minPrice) || !isFinite(maxPrice)) return null;
    if (toIndex <= fromIndex || maxPrice <= minPrice) return null;
    return { fromIndex, toIndex, minPrice, maxPrice };
}

/** Applies a zoom target: time scale to the bar range, price scale to the price range (autoscale off). */
export function applyZoomTarget(
    target: ZoomTarget,
    timeScale: { setVisibleBarRange(from: number, to: number): void },
    priceScale: { setVisiblePriceRange(range: { min: number; max: number }): void }
): void {
    timeScale.setVisibleBarRange(target.fromIndex, target.toIndex);
    priceScale.setVisiblePriceRange({ min: target.minPrice, max: target.maxPrice } as any);
}

/**
 * Overlay indicator values (finite numbers) at a bar time, for the magnet's "Snap to indicators".
 * Hidden indicators, histogram styles and volume-like indicators (other scale) are skipped.
 */
export function collectIndicatorPrices(
    indicators: readonly {
        visible: boolean;
        options?: { name?: string; style?: string };
        data: readonly { time: number; value: number; values?: number[] }[];
    }[],
    time: number
): number[] {
    const out: number[] = [];
    for (const ind of indicators) {
        if (!ind.visible) continue;
        if (ind.options?.style === 'histogram') continue;
        if (/volume/i.test(ind.options?.name ?? '')) continue;
        const data = ind.data;
        // binary search by time (data is bar aligned and ascending)
        let lo = 0;
        let hi = data.length - 1;
        let found = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const tm = data[mid].time;
            if (tm === time) { found = mid; break; }
            if (tm < time) lo = mid + 1; else hi = mid - 1;
        }
        if (found < 0) continue;
        const pt = data[found];
        const values = pt.values && pt.values.length > 0 ? pt.values : [pt.value];
        for (const v of values) {
            if (typeof v === 'number' && isFinite(v)) out.push(v);
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Tool state + overlay rendering
// ---------------------------------------------------------------------------

/** Scale/data access for the tools (main pane only) */
export interface ToolEnv {
    timeScale: {
        coordinateToFloatIndex(x: any): number;
        indexToCoordinate(i: any): number;
        setVisibleBarRange(from: number, to: number): void;
    };
    priceScale: {
        coordinateToPrice(y: any): number;
        priceToCoordinate(p: number): number;
        setVisiblePriceRange(range: any): void;
    };
    times: readonly number[];
    symbol: string;
    precision: number;
}

export interface OverlayHost {
    container: HTMLElement;
    getPaneCanvas: () => HTMLCanvasElement | null;
    getEnv: () => ToolEnv | null;
    getForeground: () => string;
}

interface MeasureState {
    p1: MeasurePoint;
    p2: MeasurePoint;
    /** 'preview': p2 follows the mouse; 'done': frozen */
    phase: 'preview' | 'done';
    viaDrag: boolean;
}

const UP_COLOR = '#2962ff';
const DOWN_COLOR = '#F23645';
const STYLE_ID = 'tv-interaction-tools-style';
const RIPPLE_MS = 550;

const ERASER_CURSOR_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 28 28'>"
    + "<g fill='%23ffffff' stroke='%23131722' stroke-width='1.6' stroke-linejoin='round'>"
    + "<path d='M6.2 16.4l8.4-8.4a2 2 0 0 1 2.8 0l4.6 4.6a2 2 0 0 1 0 2.8l-6.6 6.6h-4.4l-4.8-4.8a2 2 0 0 1 0-2.8z'/>"
    + "<path d='M10.4 12.2l7.4 7.4'/></g></svg>";

function ensureStyle(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    const sel = (k: string) => `.tv-chart-container[data-cursor-tool="${k}"] canvas`;
    style.textContent = `
        ${sel('dotCursor')}, ${sel('demoCursor')} { cursor: none !important; }
        ${sel('eraser')} { cursor: url("data:image/svg+xml;utf8,${ERASER_CURSOR_SVG}") 5 21, cell !important; }
        ${sel('measure')} { cursor: crosshair !important; }
        ${sel('zoomIn')} { cursor: zoom-in !important; }
    `;
    document.head.appendChild(style);
}

export class InteractionTools {
    /** Persistent visual cursor (crosshair / arrow / dot / demonstration) */
    cursor: CursorKind = 'crosshair';
    /** Active interaction tool */
    mode: ToolMode = 'none';

    private _measure: MeasureState | null = null;
    private _zoom: { x1: number; y1: number; x2: number; y2: number } | null = null;
    private _canvas: HTMLCanvasElement | null = null;
    private _pointer: { x: number; y: number } | null = null;
    private _ripples: { x: number; y: number; t0: number }[] = [];
    private _host: OverlayHost | null = null;
    private _overlay: HTMLCanvasElement | null = null;
    private _raf = 0;

    // --- Tool selection ---

    /** Applies a toolbar tool id. Returns false when the id is not for the tools (magnet ids). */
    setTool(id: string): boolean {
        if (MAGNET_IDS.includes(id)) return false;
        this.clearTransient();
        if (CURSOR_KINDS.includes(id)) {
            this.cursor = id as CursorKind;
            this.mode = 'none';
        } else if (MODE_TOOLS.includes(id)) {
            this.mode = id as ToolMode;
        } else {
            // drawing tool or unknown: interaction modes off, cursor kind kept
            this.mode = 'none';
        }
        this.syncHost(false);
        this.requestRender();
        return true;
    }

    /** Cursor to go back to after Esc / finishing a tool */
    get lastCursor(): CursorKind {
        return this.cursor;
    }

    /** Crosshair lines + axis labels are replaced by dot/demonstration cursor */
    hideCrosshair(drawingActive: boolean): boolean {
        return !drawingActive && this.mode === 'none' && (this.cursor === 'dotCursor' || this.cursor === 'demoCursor');
    }

    /** Key shown to CSS (cursor style) and used by render */
    visualTool(drawingActive: boolean): string {
        if (drawingActive) return '';
        return this.mode !== 'none' ? this.mode : this.cursor;
    }

    // --- Transient state ---

    get hasMeasure(): boolean {
        return this._measure !== null;
    }

    get measurePreviewing(): boolean {
        return this._measure !== null && this._measure.phase === 'preview';
    }

    get measureViaDrag(): boolean {
        return this._measure !== null && this._measure.viaDrag;
    }

    get zoomDragging(): boolean {
        return this._zoom !== null;
    }

    get canvas(): HTMLCanvasElement | null {
        return this._canvas;
    }

    setCanvas(canvas: HTMLCanvasElement | null): void {
        this._canvas = canvas;
    }

    measureStart(p: MeasurePoint, viaDrag: boolean): void {
        this._measure = { p1: p, p2: p, phase: 'preview', viaDrag };
        this.requestRender();
    }

    measureMove(p: MeasurePoint): void {
        if (this._measure && this._measure.phase === 'preview') {
            this._measure.p2 = p;
            this.requestRender();
        }
    }

    /** Freezes the measurement (or drops it when it has no extent, e.g. a plain Shift+click) */
    measureFinish(p: MeasurePoint): void {
        const m = this._measure;
        if (!m || m.phase !== 'preview') return;
        m.p2 = p;
        if (m.p1.index === p.index && m.p1.price === p.price) {
            this._measure = null;
        } else {
            m.phase = 'done';
        }
        this.requestRender();
    }

    clearMeasure(): void {
        if (this._measure) {
            this._measure = null;
            this.requestRender();
        }
    }

    zoomStart(x: number, y: number): void {
        this._zoom = { x1: x, y1: y, x2: x, y2: y };
        this.requestRender();
    }

    zoomMove(x: number, y: number): void {
        if (this._zoom) {
            this._zoom.x2 = x;
            this._zoom.y2 = y;
            this.requestRender();
        }
    }

    /** Ends the drag; returns the rectangle (pane-local px) or null */
    zoomEnd(): { x1: number; y1: number; x2: number; y2: number } | null {
        const z = this._zoom;
        this._zoom = null;
        this.requestRender();
        return z;
    }

    clearTransient(): void {
        this._measure = null;
        this._zoom = null;
        this._canvas = null;
    }

    /**
     * Escape: clears transient state. Returns true when it did something (transient state
     * cleared or a tool mode is active, so the caller should go back to the cursor).
     */
    cancel(): boolean {
        const had = this._measure !== null || this._zoom !== null || this.mode !== 'none';
        this._measure = null;
        this._zoom = null;
        this.requestRender();
        return had;
    }

    // --- Pointer (dot / demonstration) ---

    setPointer(clientX: number, clientY: number): void {
        this._pointer = { x: clientX, y: clientY };
        if (this.mode === 'none' && (this.cursor === 'dotCursor' || this.cursor === 'demoCursor')) {
            this.requestRender();
        }
    }

    clearPointer(): void {
        if (this._pointer) {
            this._pointer = null;
            this.requestRender();
        }
    }

    /** Demonstration cursor click: quick ripple */
    ripple(clientX: number, clientY: number): void {
        if (this.cursor !== 'demoCursor' || this.mode !== 'none') return;
        this._ripples.push({ x: clientX, y: clientY, t0: Date.now() });
        this.requestRender();
    }

    // --- Overlay ---

    attach(host: OverlayHost): void {
        this._overlay?.remove();
        this._host = host;
        ensureStyle();
        const canvas = document.createElement('canvas');
        canvas.className = 'tv-interaction-overlay';
        canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:40;';
        host.container.appendChild(canvas);
        this._overlay = canvas;
    }

    /** Mirrors the active tool on the container so CSS can switch the mouse cursor */
    syncHost(drawingActive: boolean): void {
        const el = this._host?.container;
        if (!el) return;
        const key = this.visualTool(drawingActive);
        if (key && key !== 'crosshair' && key !== 'arrowCursor') el.setAttribute('data-cursor-tool', key);
        else el.removeAttribute('data-cursor-tool');
    }

    requestRender(): void {
        if (this._raf || !this._overlay || typeof requestAnimationFrame === 'undefined') return;
        this._raf = requestAnimationFrame(() => {
            this._raf = 0;
            this.render();
        });
    }

    dispose(): void {
        if (this._raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this._raf);
        this._raf = 0;
        this._overlay?.remove();
        this._overlay = null;
        this._host?.container.removeAttribute('data-cursor-tool');
        this._host = null;
    }

    render(): void {
        const host = this._host;
        const overlay = this._overlay;
        if (!host || !overlay) return;
        const hostRect = host.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.round(hostRect.width * dpr));
        const h = Math.max(1, Math.round(hostRect.height * dpr));
        if (overlay.width !== w || overlay.height !== h) {
            overlay.width = w;
            overlay.height = h;
        }
        const ctx = overlay.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, hostRect.width, hostRect.height);

        const paneCanvas = host.getPaneCanvas();
        const paneRect = paneCanvas?.getBoundingClientRect() ?? null;
        const env = host.getEnv();

        if (paneRect && env) {
            const ox = paneRect.left - hostRect.left;
            const oy = paneRect.top - hostRect.top;
            ctx.save();
            ctx.beginPath();
            ctx.rect(ox, oy, paneRect.width, paneRect.height);
            ctx.clip();
            if (this._measure) this._drawMeasure(ctx, env, ox, oy, paneRect.width, paneRect.height);
            if (this._zoom) this._drawZoom(ctx, ox, oy);
            ctx.restore();
        }

        // Dot / demonstration cursor (client coords -> host)
        const p = this._pointer;
        const inside = p && p.x >= hostRect.left && p.x <= hostRect.right && p.y >= hostRect.top && p.y <= hostRect.bottom
            && (!paneRect || p.x >= paneRect.left);
        if (inside && p && this.mode === 'none') {
            const lx = p.x - hostRect.left;
            const ly = p.y - hostRect.top;
            if (this.cursor === 'dotCursor') {
                ctx.beginPath();
                ctx.arc(lx, ly, 2, 0, Math.PI * 2);
                ctx.fillStyle = host.getForeground();
                ctx.fill();
            } else if (this.cursor === 'demoCursor') {
                ctx.beginPath();
                ctx.arc(lx, ly, 20, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(242, 54, 69, 0.35)';
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(242, 54, 69, 0.9)';
                ctx.stroke();
            }
        }

        // Ripples
        if (this._ripples.length > 0) {
            const now = Date.now();
            this._ripples = this._ripples.filter(r => now - r.t0 < RIPPLE_MS);
            for (const r of this._ripples) {
                const k = (now - r.t0) / RIPPLE_MS;
                ctx.beginPath();
                ctx.arc(r.x - hostRect.left, r.y - hostRect.top, 20 + 30 * k, 0, Math.PI * 2);
                ctx.lineWidth = 2;
                ctx.strokeStyle = `rgba(242, 54, 69, ${(1 - k) * 0.9})`;
                ctx.stroke();
            }
            if (this._ripples.length > 0) this.requestRender();
        }
    }

    private _drawMeasure(
        ctx: CanvasRenderingContext2D, env: ToolEnv, ox: number, oy: number, pw: number, ph: number
    ): void {
        const m = this._measure!;
        const x1 = env.timeScale.indexToCoordinate(m.p1.index) + ox;
        const x2 = env.timeScale.indexToCoordinate(m.p2.index) + ox;
        const y1 = env.priceScale.priceToCoordinate(m.p1.price) + oy;
        const y2 = env.priceScale.priceToCoordinate(m.p2.price) + oy;
        if (![x1, x2, y1, y2].every(isFinite)) return;

        const r = computeMeasure(m.p1, m.p2, env.times, env.symbol, env.precision);
        const color = r.up ? UP_COLOR : DOWN_COLOR;
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const bw = Math.abs(x2 - x1);
        const bh = Math.abs(y2 - y1);

        ctx.fillStyle = r.up ? 'rgba(41, 98, 255, 0.2)' : 'rgba(242, 54, 69, 0.2)';
        ctx.fillRect(left, top, bw, bh);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(left + 0.5, top + 0.5, bw, bh);

        // Direction guide through the box centre
        const cx = left + bw / 2;
        const cy = top + bh / 2;
        ctx.beginPath();
        ctx.moveTo(left, cy);
        ctx.lineTo(left + bw, cy);
        ctx.moveTo(cx, top);
        ctx.lineTo(cx, top + bh);
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label chip: above the box when up, below when down (clamped to the pane)
        const lines = measureLabelLines(r, env.precision);
        ctx.font = '12px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
        ctx.textBaseline = 'middle';
        const padX = 8;
        const lineH = 16;
        const chipW = Math.max(...lines.map(l => ctx.measureText(l).width)) + padX * 2;
        const chipH = lines.length * lineH + 8;
        let chipX = cx - chipW / 2;
        chipX = Math.max(ox + 2, Math.min(chipX, ox + pw - chipW - 2));
        let chipY = r.up ? top - chipH - 6 : top + bh + 6;
        chipY = Math.max(oy + 2, Math.min(chipY, oy + ph - chipH - 2));

        ctx.fillStyle = color;
        ctx.beginPath();
        const rad = 4;
        ctx.moveTo(chipX + rad, chipY);
        ctx.arcTo(chipX + chipW, chipY, chipX + chipW, chipY + chipH, rad);
        ctx.arcTo(chipX + chipW, chipY + chipH, chipX, chipY + chipH, rad);
        ctx.arcTo(chipX, chipY + chipH, chipX, chipY, rad);
        ctx.arcTo(chipX, chipY, chipX + chipW, chipY, rad);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        lines.forEach((l, i) => ctx.fillText(l, chipX + padX, chipY + 4 + lineH * i + lineH / 2));
    }

    private _drawZoom(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
        const z = this._zoom!;
        const left = Math.min(z.x1, z.x2) + ox;
        const top = Math.min(z.y1, z.y2) + oy;
        const w = Math.abs(z.x2 - z.x1);
        const h = Math.abs(z.y2 - z.y1);
        ctx.fillStyle = 'rgba(41, 98, 255, 0.15)';
        ctx.fillRect(left, top, w, h);
        ctx.strokeStyle = UP_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(left + 0.5, top + 0.5, w, h);
        ctx.setLineDash([]);
    }
}
