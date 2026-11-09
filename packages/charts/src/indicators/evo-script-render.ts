/**
 * Canvas rendering of an Evo Script RunOutput. Shared by the overlay flavour (main price pane)
 * and the panel flavour (own pane). Draws with plain canvas 2D on the indicator pane's canvas.
 *
 * Coordinates: x = timeScale.indexToCoordinate(i) * hpr, y = priceScale.priceToCoordinate(p) * vpr.
 * Bar indices may be fractional / negative / beyond the last bar (the time scale maps them linearly).
 * The pane widget passes hpr = vpr = 1 (its context is already scaled), the overlay renderer
 * passes the device pixel ratios.
 */

import { BarData } from '../model/data';
import { TimeScale } from '../model/time-scale';
import { PriceScale } from '../model/price-scale';
import { EvoOutput, EvoPlot, EvoShape, EvoLabel, EvoBox, EvoCandles, EvoArrow, EvoPolyline, EvoLine, EvoStrategyFill } from './evo-script-core';
import { canvasSans, canvasMono } from '../helpers/fonts';
import { adaptivePrecision } from './legend-info';
export interface EvoDrawArgs {
    ctx: CanvasRenderingContext2D;
    timeScale: TimeScale;
    priceScale: PriceScale;
    hpr: number;
    vpr: number;
    /** pane size in media (css) pixels */
    width: number;
    height: number;
    bars: readonly BarData[];
    out: EvoOutput;
    /** number of bars the output was computed for */
    runLen: number;
    /** own pane (not the price pane): abovebar/belowbar anchor to the first plot's value instead of the candle */
    pane?: boolean;
    /** Media px at the top of the pane covered by the legend; `location.top` shapes start below it */
    topInset?: number;
    /** Receives the label boxes drawn (media px) so the host can show their tooltips on hover */
    hits?: EvoHit[];
    /** Chart theme (default dark): picks the strategy marker colours */
    dark?: boolean;
}

export interface EvoHit { x: number; y: number; w: number; h: number; text: string }

/** Font family of label / box text: "monospace" objects use the mono stack */
let family: string | null = null;
const font = () => family ?? canvasSans();
/** "bold" / "italic" prefix of the canvas font for the object being drawn */
let fontStyle = '';
const withFamily = (name: string | undefined, fn: () => void, formatting?: string): void => {
    family = name === 'monospace' ? canvasMono() : null;
    fontStyle = formatting ? `${/italic/.test(formatting) ? 'italic ' : ''}${/bold/.test(formatting) ? 'bold ' : ''}` : '';
    try { fn(); } finally { family = null; fontStyle = ''; }
};

// ---------------------------------------------------------------------------
// display flags / number formats (shared by the renderer, the legend and the axes)
// ---------------------------------------------------------------------------

const flagCache = new Map<string, Set<string>>();
function displayFlags(display: string): Set<string> {
    let f = flagCache.get(display);
    if (!f) {
        f = new Set(String(display || 'all').toLowerCase().split(/[^a-z_]+/).filter(Boolean));
        flagCache.set(display, f);
    }
    return f;
}
const hasFlag = (display: string, flag: string): boolean => {
    const f = displayFlags(display);
    return f.has('all') || f.has(flag);
};

/** Drawn in the pane (display "all" or containing "pane") */
export function isPlotDrawn(p: { display: string }): boolean {
    return hasFlag(p.display, 'pane');
}
/** Value listed in the legend (status line) */
export function isPlotInLegend(p: { display: string }): boolean {
    return hasFlag(p.display, 'status_line');
}
/** Last value tag on the price scale */
export function isPlotOnScale(p: { display: string }): boolean {
    return hasFlag(p.display, 'price_scale');
}

const NA_COLOR = 0xFFFF;

/** Colour of source bar `s`: the per-bar colour when the plot has a colour array, else `fallback`. null = na (do not draw). */
export function evoColorAt(table: string[], arr: Uint16Array | undefined, s: number, fallback: string): string | null {
    if (!arr || s < 0 || s >= arr.length) return fallback;
    const k = arr[s];
    return k === NA_COLOR ? null : (table[k] ?? null);
}

/** Effective number format of a plot: its own, else the script's, else price */
export function evoPlotFormat(out: EvoOutput, p: EvoPlot): string {
    if (p.format && p.format !== 'inherit') return p.format;
    const m = out.meta.format;
    return m && m !== 'inherit' ? m : 'price';
}

/** Last bar value of a plot (the value that sits on the newest computed bar) */
export function evoLastIndex(p: EvoPlot): number {
    for (let i = p.values.length - 1; i >= 0; i--) if (Number.isFinite(p.values[i])) return i;
    return -1;
}

/**
 * Decimals of a plot: plotOpts.precision, else meta.precision, else adaptive from the last value.
 * The legend and the price scale both go through here, so they always agree.
 */
export function evoPlotPrecision(out: EvoOutput, p: EvoPlot): number {
    if (p.precision !== undefined) return clampPrec(p.precision);
    if (out.meta.precision !== undefined) return clampPrec(out.meta.precision);
    const i = evoLastIndex(p);
    return i >= 0 ? adaptivePrecision(p.values[i]) : 2;
}
const clampPrec = (n: number): number => Math.max(0, Math.min(8, Math.round(n)));

export function formatEvoNumber(v: number, precision: number, format: string): string {
    if (!Number.isFinite(v)) return '∅';
    if (format === 'percent') return `${v.toFixed(precision)}%`;
    if (format === 'volume') {
        const a = Math.abs(v);
        if (a >= 1e9) return `${(v / 1e9).toFixed(precision)}B`;
        if (a >= 1e6) return `${(v / 1e6).toFixed(precision)}M`;
        if (a >= 1e3) return `${(v / 1e3).toFixed(precision)}K`;
        return v.toFixed(precision);
    }
    const out = v.toFixed(precision);
    return /^-0(\.0*)?$/.test(out) ? out.slice(1) : out;
}

export function formatEvoPlotValue(out: EvoOutput, p: EvoPlot, v: number, precisionOverride?: number): string {
    return formatEvoNumber(v, precisionOverride ?? evoPlotPrecision(out, p), evoPlotFormat(out, p));
}

export interface EvoValueLabel { price: number; text: string; color: string }

const stripAlpha = (c: string): string => (c.length === 9 && c[0] === '#' ? c.slice(0, 7) : c);

/** Last-value tags for the price scale: one per plot whose display includes the price scale, in the plot colour */
export function evoLastValueLabels(out: EvoOutput): EvoValueLabel[] {
    const res: EvoValueLabel[] = [];
    for (const p of out.plots) {
        if (!isPlotOnScale(p) || res.length >= 12) continue;
        for (let i = p.values.length - 1; i >= 0; i--) {
            const v = p.values[i];
            if (!Number.isFinite(v)) continue;
            const c = evoColorAt(out.colorTable, p.colors, i, p.color);
            if (c === null) continue; // na colour: look further back
            res.push({ price: v, text: formatEvoPlotValue(out, p, v), color: stripAlpha(c) });
            break;
        }
    }
    return res;
}

/** Label formatter of a pane's own price scale: follows the first drawn plot (precision and format) */
export function evoScaleFormatter(out: EvoOutput | null): ((v: number) => string) | null {
    const p = out?.plots.find(isPlotDrawn);
    if (!out || !p) return null;
    const prec = evoPlotPrecision(out, p), fmt = evoPlotFormat(out, p);
    return (v) => formatEvoNumber(v, prec, fmt);
}

/** rgba() string from #rgb/#rrggbb/#rrggbbaa/rgb()/rgba() with alpha multiplied by `mul` */
export function withAlpha(color: string, mul: number): string {
    const c = color.trim();
    let m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c);
    if (m) {
        const v = parseInt(m[1], 16);
        const a = (m[2] ? parseInt(m[2], 16) / 255 : 1) * mul;
        return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a.toFixed(3)})`;
    }
    m = /^#([0-9a-f]{3})$/i.exec(c);
    if (m) {
        const h = m[1];
        return `rgba(${parseInt(h[0] + h[0], 16)},${parseInt(h[1] + h[1], 16)},${parseInt(h[2] + h[2], 16)},${mul})`;
    }
    const r = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(c);
    if (r) return `rgba(${r[1]},${r[2]},${r[3]},${((r[4] !== undefined ? parseFloat(r[4]) : 1) * mul).toFixed(3)})`;
    return c;
}

/** Readable text colour (black/white) for a background colour */
function contrastText(bg: string): string {
    const m = /^#([0-9a-f]{6})/i.exec(bg.trim());
    if (!m) return '#ffffff';
    const v = parseInt(m[1], 16);
    const lum = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
    return lum > 0.65 ? '#131722' : '#ffffff';
}

function sizePx(size: string): number {
    switch (size) {
        case 'tiny': return 3.5;
        case 'small': return 5;
        case 'large': return 9;
        case 'huge': return 13;
        default: return 6.5; // normal / auto
    }
}

/** Font size (px) of label / box text */
function textPx(size: string): number {
    switch (size) {
        case 'tiny': return 8;
        case 'small': return 10;
        case 'large': return 14;
        case 'huge': return 18;
        case 'auto': return 11;
        default: return 12;
    }
}

function dashFor(style: string, hpr: number): number[] {
    if (style === 'dashed') return [5 * hpr, 3 * hpr];
    if (style === 'dotted') return [2 * hpr, 2 * hpr];
    return [];
}

/** A candle / bar exists at source index i (all four prices finite and a colour is not na) */
export function candleOk(c: EvoCandles, i: number): boolean {
    return Number.isFinite(c.open[i]) && Number.isFinite(c.high[i]) && Number.isFinite(c.low[i]) && Number.isFinite(c.close[i])
        && !(c.colors && c.colors[i] === NA_COLOR);
}

// ---------------------------------------------------------------------------
// force_overlay routing: a script in its own pane splits into "own" (pane) and "forced" (main pane) content
// ---------------------------------------------------------------------------

export interface EvoViews {
    /** Content that stays in the script's own pane (no strategy markers, no forceOverlay items) */
    own: EvoOutput;
    /** Content that goes to the main pane (forceOverlay items, strategy fill markers); null when there is none */
    forced: EvoOutput | null;
}

const viewCache = new WeakMap<EvoOutput, EvoViews>();

function evoSubset(out: EvoOutput, want: boolean, forcedView: boolean): EvoOutput {
    const keep = (f: boolean | undefined): boolean => (f === true) === want;
    const plots = out.plots.filter((p) => keep(p.forceOverlay));
    const shapes = out.shapes.filter((x) => keep(x.forceOverlay));
    const fillsKept = out.linefills.filter((f) => keep(f.forceOverlay));
    const needed = new Set<number>();
    for (const f of fillsKept) { needed.add(f.line1); needed.add(f.line2); }
    const idx = new Map<number, number>();
    const lines: EvoLine[] = [];
    out.lines.forEach((l, i) => { if (keep(l.forceOverlay) || needed.has(i)) { idx.set(i, lines.length); lines.push(l); } });
    const linefills = fillsKept.filter((f) => idx.has(f.line1) && idx.has(f.line2)).map((f) => ({ ...f, line1: idx.get(f.line1)!, line2: idx.get(f.line2)! }));
    const titles = new Set(plots.map((p) => p.title));
    const fills = forcedView
        ? out.fills.filter((f) => f.a.kind === 'plot' && f.b.kind === 'plot' && titles.has(f.a.ref) && titles.has(f.b.ref))
        : out.fills;
    const base: EvoOutput = {
        ...out, plots, shapes, lines, linefills, fills,
        labels: out.labels.filter((l) => keep(l.forceOverlay)),
        boxes: out.boxes.filter((b) => keep(b.forceOverlay)),
        polylines: out.polylines.filter((pl) => keep(pl.forceOverlay)),
        strategy: forcedView ? out.strategy : undefined,
    };
    if (forcedView) {
        base.hlines = []; base.bgcolors = []; base.candles = []; base.arrows = []; base.tables = []; base.barColors = undefined;
    }
    return base;
}

/** Split of an output into own-pane and main-pane content (cached per output object) */
export function evoViews(out: EvoOutput): EvoViews {
    let v = viewCache.get(out);
    if (v) return v;
    const flagged = out.plots.some((p) => p.forceOverlay) || out.shapes.some((s) => s.forceOverlay) || out.labels.some((l) => l.forceOverlay)
        || out.boxes.some((b) => b.forceOverlay) || out.lines.some((l) => l.forceOverlay) || out.polylines.some((p) => p.forceOverlay)
        || out.linefills.some((f) => f.forceOverlay);
    const markers = !!out.strategy && out.strategy.fills.length > 0;
    if (!flagged && !markers) v = { own: out, forced: null };
    else v = { own: evoSubset(out, false, false), forced: evoSubset(out, true, true) };
    viewCache.set(out, v);
    return v;
}

/** Marker geometry shared by autoscale and drawing (css px) */
const FILL_ARROW_LEN = 16, FILL_GAP = 6, FILL_TEXT_PX = 10, FILL_TEXT_MIN_SPACING = 14;
const fillStep = (withText: boolean): number => FILL_ARROW_LEN + (withText ? FILL_TEXT_PX + 4 : 0) + 4;

/** First fill index whose bar >= bar (fills are sorted by bar) */
function fillLowerBound(fills: readonly EvoStrategyFill[], bar: number): number {
    let lo = 0, hi = fills.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (fills[m].bar < bar) lo = m + 1; else hi = m; }
    return lo;
}

/** Value range of the drawn content in the visible index range (for pane auto-scale) */
export interface EvoRange { min: number; max: number; padTopPx: number; padBottomPx: number }

export function evoVisibleRange(out: EvoOutput, from: number, to: number, barCount = Infinity): EvoRange | null {
    let min = Infinity, max = -Infinity;
    const upd = (v: number) => { if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; } };
    // the visible range stops at the last bar: when it reaches it, shifted values that project past it count too
    const atEdge = to >= barCount - 1;
    const toS = atEdge ? to + 500 : to;
    for (const p of out.plots) {
        if (!isPlotDrawn(p)) continue;
        // target bar t shows source bar t - offset
        const a = Math.max(0, Math.floor(from) - p.offset), b = Math.min(p.values.length - 1, Math.ceil(toS) - p.offset);
        const minT = p.showLast !== undefined ? barCount - p.showLast : -Infinity;
        for (let i = a; i <= b; i++) if (i + p.offset >= minT && evoColorAt(out.colorTable, p.colors, i, '') !== null) upd(p.values[i]);
        if (p.style === 'histogram' || p.style === 'columns') upd(p.histbase);
    }
    for (const h of out.hlines) if (isPlotDrawn(h)) upd(h.price);
    // markers above / below the bars need pixel room: remember the tallest stack per bar
    const above = new Map<number, number>(), below = new Map<number, number>();
    for (const s of out.shapes) {
        if (!isPlotDrawn(s)) continue;
        const a = Math.max(0, Math.floor(from) - s.offset), b = Math.min(s.values.length - 1, Math.ceil(toS) - s.offset);
        const minT = s.showLast !== undefined ? barCount - s.showLast : -Infinity;
        for (let i = a; i <= b; i++) {
            const v = s.values[i];
            const t = i + s.offset;
            if (!Number.isFinite(v) || t < minT || evoColorAt(out.colorTable, s.colors, i, '') === null) continue;
            if (s.location === 'absolute') { upd(v); continue; }
            if (v === 0 || t >= barCount) continue;
            if (s.location !== 'abovebar' && s.location !== 'belowbar') continue;
            const label = s.style === 'labelup' || s.style === 'labeldown';
            const lines = Math.max(1, s.text.split('\n').length);
            const step = label ? lines * 13 + 6 + 10 : 2 * sizePx(s.size) + (s.text ? lines * 13 : 0) + 2;
            const m = s.location === 'abovebar' ? above : below;
            m.set(t, (m.get(t) ?? 0) + step);
        }
    }
    for (const c of out.candles) {
        if (!isPlotDrawn(c)) continue;
        const a = Math.max(0, Math.floor(from) - c.offset), b = Math.min(c.high.length - 1, Math.ceil(toS) - c.offset);
        for (let i = a; i <= b; i++) {
            if (!candleOk(c, i)) continue;
            upd(c.high[i]); upd(c.low[i]);
        }
    }
    let arrowId = 0;
    for (const ar of out.arrows) {
        if (!isPlotDrawn(ar)) continue;
        const a = Math.max(0, Math.floor(from) - ar.offset), b = Math.min(ar.values.length - 1, Math.ceil(toS) - ar.offset);
        let up = false, down = false;
        for (let i = a; i <= b; i++) {
            const v = ar.values[i];
            if (!Number.isFinite(v) || v === 0 || (i + ar.offset) >= barCount) continue;
            if (v > 0) up = true; else down = true;
        }
        if (up) below.set(1e9 + arrowId++, ar.maxHeight + 8);
        if (down) above.set(1e9 + arrowId++, ar.maxHeight + 8);
    }
    for (const b of out.boxes) {
        if (b.extend === 'none' && Math.max(b.left, b.right) >= from && Math.min(b.left, b.right) <= to) { upd(b.top); upd(b.bottom); }
    }
    for (const l of out.lines) {
        if (l.extend !== 'none' || Math.max(l.x1, l.x2) < from || Math.min(l.x1, l.x2) > to) continue;
        upd(l.y1); upd(l.y2);
    }
    for (const pl of out.polylines) {
        for (const q of pl.points) {
            if (Number.isFinite(q.x) && q.x >= from && q.x <= toS) upd(q.y);
        }
    }
    // strategy fill markers: the fill price and room for the arrows (+ text when the bars are wide enough)
    const sf = out.strategy?.fills;
    if (sf && sf.length > 0) {
        const step = fillStep(true);
        for (let k = fillLowerBound(sf, Math.max(0, Math.floor(from))); k < sf.length && sf[k].bar <= toS; k++) {
            const f = sf[k];
            if (f.bar >= barCount) continue;
            upd(f.price);
            const m = f.qty > 0 ? below : above;
            m.set(-1 - f.bar, (m.get(-1 - f.bar) ?? 0) + step);
        }
    }
    if (min === Infinity && above.size === 0 && below.size === 0) return null;
    const tall = (m: Map<number, number>) => (m.size ? Math.max(...m.values()) + 8 : 0);
    return { min, max, padTopPx: tall(above), padBottomPx: tall(below) };
}

export function drawEvoOutput(d: EvoDrawArgs): void {
    const { ctx, timeScale: ts, priceScale: ps, hpr, vpr, out } = d;
    const vr = ts.visibleRange();
    if (!vr || d.bars.length === 0) return;
    const n = d.bars.length;
    const start = Math.max(0, Math.floor(vr.from as number) - 1);
    // the visible range is clamped to the last bar; the pane itself may show future bars (offset projections)
    const rightEdge = Math.ceil(ts.coordinateToIndex(d.width as any) as number);
    const endX = Math.max(Math.ceil(vr.to as number), rightEdge) + 1; // may pass the last bar: plots shifted into the future
    if (endX < start) return;
    const bs = ts.barSpacing;
    const X = (i: number) => ts.indexToCoordinate(i as any) * hpr;
    const Y = (p: number) => ps.priceToCoordinate(p) * vpr;
    const W = d.width * hpr, H = d.height * vpr;
    const table = out.colorTable;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    ctx.setLineDash([]);

    // 1. background bands (shifted by their offset)
    for (const b of out.bgcolors) {
        const f = b.from + b.offset, tt = b.to + b.offset;
        if (tt < start || f > endX) continue;
        const x1 = X(Math.max(f, start)) - (bs / 2) * hpr;
        const x2 = X(Math.min(tt, endX)) + (bs / 2) * hpr;
        ctx.fillStyle = b.color;
        ctx.fillRect(x1, 0, x2 - x1, H);
    }

    // 2. fills between plots / hlines (each plot keeps its own offset)
    const plotByTitle = new Map<string, EvoPlot>();
    for (const p of out.plots) if (!plotByTitle.has(p.title)) plotByTitle.set(p.title, p);
    const hlineByTitle = new Map<string, number>();
    for (const h of out.hlines) if (!hlineByTitle.has(h.title)) hlineByTitle.set(h.title, h.price);
    const series = (r: { kind: string; ref: string }): ((i: number) => number) | null => {
        if (r.kind === 'hline') {
            const price = hlineByTitle.get(r.ref);
            return price === undefined ? null : () => price;
        }
        const p = plotByTitle.get(r.ref);
        if (!p) return null;
        const off = p.offset, v = p.values;
        return (i) => { const s = i - off; return s >= 0 && s < v.length ? v[s] : NaN; };
    };
    for (const f of out.fills) {
        if (f.display === 'none') continue;
        const sa = series(f.a), sb = series(f.b);
        if (!sa || !sb) continue;
        let style: string | CanvasGradient | null = null;
        if (f.color) style = f.color;
        else if (f.topColor && f.bottomColor && f.topValue !== undefined && f.bottomValue !== undefined) {
            const g = ctx.createLinearGradient(0, Y(f.topValue), 0, Y(f.bottomValue));
            g.addColorStop(0, f.topColor);
            g.addColorStop(1, f.bottomColor);
            style = g;
        } else if (f.topColor || f.bottomColor) style = (f.topColor || f.bottomColor)!;
        if (style === null) continue;
        ctx.fillStyle = style;
        let runStart = -1;
        const flush = (runEnd: number) => {
            if (runStart < 0) return;
            ctx.beginPath();
            ctx.moveTo(X(runStart), Y(sa(runStart)));
            for (let i = runStart + 1; i <= runEnd; i++) ctx.lineTo(X(i), Y(sa(i)));
            for (let i = runEnd; i >= runStart; i--) ctx.lineTo(X(i), Y(sb(i)));
            ctx.closePath();
            ctx.fill();
            runStart = -1;
        };
        for (let i = start; i <= endX; i++) {
            const ok = Number.isFinite(sa(i)) && Number.isFinite(sb(i));
            if (ok && runStart < 0) runStart = i;
            else if (!ok && runStart >= 0) flush(i - 1);
        }
        flush(endX);
    }

    // 3. horizontal lines
    for (const h of out.hlines) {
        if (!isPlotDrawn(h) || !Number.isFinite(h.price)) continue;
        const y = Math.round(Y(h.price)) + 0.5 * vpr;
        ctx.strokeStyle = h.color;
        ctx.lineWidth = Math.max(1, h.linewidth) * hpr;
        ctx.setLineDash(dashFor(h.linestyle, hpr));
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // 3b. linefills (under the lines and boxes)
    drawLinefills(d, start, endX, X, Y);

    // 4. boxes (under plots so lines stay readable)
    for (const b of out.boxes) {
        if (!Number.isFinite(b.left) || !Number.isFinite(b.right) || !Number.isFinite(b.top) || !Number.isFinite(b.bottom)) continue;
        let x1 = X(Math.min(b.left, b.right)), x2 = X(Math.max(b.left, b.right));
        if (b.extend === 'left' || b.extend === 'both') x1 = -2 * hpr;
        if (b.extend === 'right' || b.extend === 'both') x2 = W + 2 * hpr;
        if (x2 < 0 || x1 > W) continue;
        const y1 = Y(Math.max(b.top, b.bottom)), y2 = Y(Math.min(b.top, b.bottom));
        const base = b.border || b.fill || '#2962ff';
        if (b.fill !== undefined || b.border === undefined) {
            ctx.fillStyle = b.fill ?? withAlpha(base, 0.15);
            ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        }
        if (b.borderWidth > 0 && b.borderStyle !== 'none') {
            ctx.strokeStyle = b.border ?? withAlpha(base, 0.8);
            ctx.lineWidth = Math.max(1, b.borderWidth) * hpr;
            ctx.setLineDash(dashFor(b.borderStyle, hpr));
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            ctx.setLineDash([]);
        }
        if (b.text) withFamily(b.fontFamily, () => drawBoxText(d, b, x1, y1, x2, y2, b.textColor || base), b.textFormatting);
    }

    // 4b. plotcandle / plotbar (under the plots)
    for (const c of out.candles) {
        if (isPlotDrawn(c)) drawCandles(d, c, start, endX, X, Y, bs);
    }

    // 5. plots
    for (const p of out.plots) {
        if (!isPlotDrawn(p)) continue;
        drawPlot(d, p, start, Math.min(endX, p.values.length - 1 + p.offset), n, X, Y, bs);
    }

    // 5b. lines (Pine line.new)
    for (const l of out.lines) {
        let ax = X(l.x1), ay = Y(l.y1), bx = X(l.x2), by = Y(l.y2);
        const dx = bx - ax, dy = by - ay;
        const ext = l.extend;
        // extend to the pane edges along the slope
        const reach = (px: number, py: number, dirx: number, diry: number): [number, number] => {
            let t = Infinity;
            if (dirx > 0) t = Math.min(t, (W + 2 - px) / dirx); else if (dirx < 0) t = Math.min(t, (-2 - px) / dirx);
            if (diry > 0) t = Math.min(t, (H + 2 - py) / diry); else if (diry < 0) t = Math.min(t, (-2 - py) / diry);
            if (!Number.isFinite(t) || t < 0) t = 0;
            return [px + dirx * t, py + diry * t];
        };
        if (dx !== 0 || dy !== 0) {
            if (ext === 'right' || ext === 'both') [bx, by] = reach(bx, by, dx, dy);
            if (ext === 'left' || ext === 'both') [ax, ay] = reach(ax, ay, -dx, -dy);
        }
        ctx.strokeStyle = l.color;
        ctx.fillStyle = l.color;
        ctx.lineWidth = Math.max(1, l.width) * hpr;
        ctx.lineCap = 'butt';
        ctx.setLineDash(dashFor(l.style, hpr));
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);
        const head = (px: number, py: number, qx: number, qy: number) => { // arrow tip at p, pointing away from q
            const ang = Math.atan2(py - qy, px - qx);
            const s = (5 + l.width * 1.5) * hpr;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px - s * Math.cos(ang - 0.45), py - s * Math.sin(ang - 0.45));
            ctx.lineTo(px - s * Math.cos(ang + 0.45), py - s * Math.sin(ang + 0.45));
            ctx.closePath();
            ctx.fill();
        };
        if (l.style === 'arrow_right' || l.style === 'arrow_both') head(X(l.x2), Y(l.y2), X(l.x1), Y(l.y1));
        if (l.style === 'arrow_left' || l.style === 'arrow_both') head(X(l.x1), Y(l.y1), X(l.x2), Y(l.y2));
    }

    // 5c. polylines
    for (const pl of out.polylines) drawPolyline(d, pl, X, Y);

    // 6. shapes (target bar t shows source bar t - offset)
    const firstPlot = out.plots.find(isPlotDrawn);
    const stack = new Map<string, number>();
    const topInset = (d.topInset ?? 0) * vpr;
    for (const s of out.shapes) {
        if (!isPlotDrawn(s)) continue;
        const a = start, b = Math.min(endX, s.values.length - 1 + s.offset);
        const minT = s.showLast !== undefined ? n - s.showLast : -Infinity;
        const size = sizePx(s.size);
        const abs = s.location === 'absolute';
        for (let t = a; t <= b; t++) {
            if (t < minT) continue;
            const i = t - s.offset;
            if (i < 0 || i >= s.values.length) continue;
            const v = s.values[i];
            if (!Number.isFinite(v)) continue;
            if (!abs && v === 0) continue;
            const color = evoColorAt(table, s.colors, i, s.color);
            if (color === null) continue; // na colour: nothing on this bar
            const tcol = evoColorAt(table, s.textColors, i, s.textcolor); // na text colour: marker without text
            let bar = d.bars[t];
            if (!bar) {
                // projected past the last candle: only locations that do not need a candle
                if (!(abs || s.location === 'top' || s.location === 'bottom')) continue;
                bar = d.bars[n - 1];
            }
            let anchor = bar;
            if (d.pane && !abs) {
                // pane scale is not price: anchor to the first drawn plot's value (fallback: pane edge)
                const fs = firstPlot ? t - firstPlot.offset : -1;
                const pv = firstPlot && fs >= 0 && fs < firstPlot.values.length ? firstPlot.values[fs] : NaN;
                anchor = Number.isFinite(pv) ? { ...bar, high: pv, low: pv }
                    : { ...bar, high: ps.coordinateToPrice(0 as any), low: ps.coordinateToPrice(d.height as any) };
            }
            drawShape(d, s, t, abs ? v : 0, anchor, size, stack, X, Y, color, tcol === null ? '' : tcol, tcol === null ? '' : s.text, topInset);
        }
    }

    // 6b. plotarrow
    for (const ar of out.arrows) {
        if (isPlotDrawn(ar)) drawArrows(d, ar, start, endX, n, firstPlot, X, Y, bs);
    }

    // 7. labels (legacy label() and Pine label.new)
    for (const l of out.labels) {
        if (!Number.isFinite(l.bar)) continue;
        if (l.bar < start - 5 || l.bar > endX + 40) continue;
        let price = l.price;
        const bar = d.bars[Math.max(0, Math.min(n - 1, Math.round(l.bar)))];
        if (l.yloc === 'abovebar') price = bar.high;
        else if (l.yloc === 'belowbar') price = bar.low;
        if (!Number.isFinite(price)) continue;
        withFamily(l.fontFamily, () => drawLabel(d, l, X(l.bar), Y(price)), l.textFormatting);
    }

    // 8. strategy fill markers (main pane only)
    if (out.strategy && !d.pane) drawStrategyFills(d, start, endX, X, Y);

    ctx.restore();
}

const BUY_DARK = '#4d86ff', SELL_DARK = '#ff5c7a', BUY_LIGHT = '#2962ff', SELL_LIGHT = '#e0264a';

function fmtQty(q: number): string {
    const a = Math.abs(q);
    const t = a >= 100 ? a.toFixed(0) : a >= 1 ? a.toFixed(2) : a.toFixed(4);
    return `${q > 0 ? '+' : '-'}${t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t}`;
}

/** Order fills of a strategy: up arrow below the bar (buy), down arrow above (sell), text, dotted connector to the fill price. Culled to the visible bars. */
function drawStrategyFills(d: EvoDrawArgs, start: number, endX: number, X: (i: number) => number, Y: (p: number) => number): void {
    const fills = d.out.strategy!.fills;
    if (fills.length === 0) return;
    const { ctx, hpr, vpr, bars } = d;
    const bs = d.timeScale.barSpacing;
    const withText = bs >= FILL_TEXT_MIN_SPACING;
    const step = fillStep(withText) * vpr;
    const hw = Math.min(Math.max(3.5, bs * 0.32), 6.5) * hpr;
    const len = FILL_ARROW_LEN * vpr, headH = Math.min(len, hw * 1.7), sw = Math.max(1, hw * 0.4);
    const gap = FILL_GAP * vpr;
    let lastBar = -1, upK = 0, downK = 0;
    ctx.save();
    ctx.lineCap = 'butt';
    for (let k = fillLowerBound(fills, start); k < fills.length; k++) {
        const f = fills[k];
        if (f.bar > endX) break;
        const bar = bars[f.bar];
        if (!bar) continue;
        if (f.bar !== lastBar) { lastBar = f.bar; upK = 0; downK = 0; }
        const buy = f.qty > 0;
        const color = buy ? (d.dark === false ? BUY_LIGHT : BUY_DARK) : (d.dark === false ? SELL_LIGHT : SELL_DARK);
        const x = X(f.bar);
        const stack = buy ? upK++ : downK++;
        const dir = buy ? 1 : -1; // screen direction from the tip to the base
        const tipY = buy ? Y(bar.low) + gap + stack * step : Y(bar.high) - gap - stack * step;
        const baseY = tipY + dir * len;
        const py = Y(f.price);
        // dotted connector from the fill price to the tip
        if (Math.abs(py - tipY) > 2 * vpr) {
            ctx.strokeStyle = withAlpha(color, 0.75);
            ctx.lineWidth = Math.max(1, hpr);
            ctx.setLineDash([1.5 * hpr, 2.5 * hpr]);
            ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x, tipY); ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, py, Math.max(1.5, 1.8 * hpr), 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, tipY); ctx.lineTo(x + hw, tipY + dir * headH); ctx.lineTo(x - hw, tipY + dir * headH); ctx.closePath(); ctx.fill();
        if (len > headH) ctx.fillRect(x - sw / 2, Math.min(tipY + dir * headH, baseY), sw, Math.abs(baseY - tipY) - headH);
        if (withText || d.hits) {
            const idc = f.comment ? `${f.orderId} ${f.comment}` : f.orderId;
            const short = idc.length > 26 ? `${idc.slice(0, 25)}…` : idc;
            const label = `${short} ${fmtQty(f.qty)}`.trim();
            if (withText) drawText(d, label, x, baseY + dir * 2 * vpr, color, 'center', buy ? 'top' : 'bottom', FILL_TEXT_PX);
            if (d.hits) {
                const w = Math.max(24, label.length * 6);
                d.hits.push({ x: x / hpr - w / 2, y: Math.min(tipY, baseY) / vpr - (withText && !buy ? 14 : 0), w, h: len / vpr + (withText ? 14 : 0), text: `${idc} ${fmtQty(f.qty)} @ ${f.price}` });
            }
        }
    }
    ctx.restore();
}

/** Bar index of a time stamp; past the last bar it is projected with the bar duration (same as offsets) */
function timeToIndex(bars: readonly BarData[], t: number): number {
    const n = bars.length;
    if (n === 0) return NaN;
    const tm = (i: number) => bars[i].time as unknown as number;
    const dur = n > 1 ? (tm(n - 1) - tm(0)) / (n - 1) : 1;
    // bar times may be seconds or ms: only the ratio matters
    if (t >= tm(n - 1)) return n - 1 + (t - tm(n - 1)) / (dur || 1);
    if (t <= tm(0)) return (t - tm(0)) / (dur || 1);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tm(m) <= t) lo = m; else hi = m; }
    return lo + (t - tm(lo)) / ((tm(hi) - tm(lo)) || 1);
}

/** Fill between two lines over the x-range where both exist (extend modes honoured); crossing lines give two triangles */
function drawLinefills(d: EvoDrawArgs, start: number, endX: number, X: (i: number) => number, Y: (p: number) => number): void {
    const { ctx, out, timeScale: ts } = d;
    if (out.linefills.length === 0) return;
    // visible index window (extended lines are cut here)
    const vis0 = Math.min(start, ts.coordinateToIndex(0 as any) as number) - 2;
    const vis1 = Math.max(endX, ts.coordinateToIndex(d.width as any) as number) + 2;
    const range = (l: EvoLine): [number, number] => {
        const lo = Math.min(l.x1, l.x2), hi = Math.max(l.x1, l.x2);
        return [l.extend === 'left' || l.extend === 'both' ? -Infinity : lo, l.extend === 'right' || l.extend === 'both' ? Infinity : hi];
    };
    for (const f of out.linefills) {
        const A = out.lines[f.line1], B = out.lines[f.line2];
        if (!A || !B) continue;
        const [a0, a1] = range(A), [b0, b1] = range(B);
        const L = Math.max(a0, b0, vis0), R = Math.min(a1, b1, vis1);
        const at = (l: EvoLine, x: number) => (l.x2 === l.x1 ? l.y1 : l.y1 + (l.y2 - l.y1) * (x - l.x1) / (l.x2 - l.x1));
        if (R <= L) continue;
        const yaL = at(A, L), ybL = at(B, L), yaR = at(A, R), ybR = at(B, R);
        const dL = yaL - ybL, dR = yaR - ybR;
        ctx.fillStyle = f.color;
        ctx.beginPath();
        if (dL * dR < 0) {
            const t = dL / (dL - dR), xc = L + (R - L) * t, yc = yaL + (yaR - yaL) * t;
            ctx.moveTo(X(L), Y(yaL)); ctx.lineTo(X(xc), Y(yc)); ctx.lineTo(X(L), Y(ybL)); ctx.closePath();
            ctx.moveTo(X(R), Y(yaR)); ctx.lineTo(X(xc), Y(yc)); ctx.lineTo(X(R), Y(ybR)); ctx.closePath();
        } else {
            ctx.moveTo(X(L), Y(yaL)); ctx.lineTo(X(R), Y(yaR)); ctx.lineTo(X(R), Y(ybR)); ctx.lineTo(X(L), Y(ybL)); ctx.closePath();
        }
        ctx.fill();
    }
}

/** Pine polyline.new: straight or Catmull-Rom segments, optional close / fill / arrows. Culled and decimated for large point counts. */
function drawPolyline(d: EvoDrawArgs, pl: EvoPolyline, X: (i: number) => number, Y: (p: number) => number): void {
    const { ctx, hpr, vpr } = d;
    const W = d.width * hpr, H = d.height * vpr;
    // project, dropping sub-pixel steps (the last point is always kept)
    const px: number[] = [], py: number[] = [];
    const pts = pl.points;
    for (let i = 0; i < pts.length; i++) {
        let xi = pts[i].x;
        if (!Number.isFinite(xi)) xi = pts[i].time !== undefined ? timeToIndex(d.bars, pts[i].time!) : NaN;
        if (!Number.isFinite(xi)) continue;
        const x = X(xi), y = Y(pts[i].y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const k = px.length - 1;
        if (k >= 0 && i < pts.length - 1 && Math.abs(x - px[k]) < 0.5 * hpr && Math.abs(y - py[k]) < 0.5 * vpr) continue;
        px.push(x); py.push(y);
    }
    const n = px.length;
    if (n === 0) return;
    const closed = pl.closed && n > 2;
    const curved = pl.curved && n > 2;
    const lw = Math.max(1, pl.lineWidth) * hpr;
    // path builder over a segment range; curved segments are Catmull-Rom as cubic beziers (tension 1/6)
    const cpAt = (i: number): [number, number] => {
        if (closed) { const k = ((i % n) + n) % n; return [px[k], py[k]]; }
        const k = Math.max(0, Math.min(n - 1, i)); return [px[k], py[k]];
    };
    const segCount = closed ? n : n - 1;
    const seg = (i: number, first: boolean): void => {
        const [x1, y1] = cpAt(i), [x2, y2] = cpAt(i + 1);
        if (first) ctx.moveTo(x1, y1);
        if (!curved) { ctx.lineTo(x2, y2); return; }
        const [x0, y0] = cpAt(i - 1), [x3, y3] = cpAt(i + 2);
        ctx.bezierCurveTo(x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6, x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6, x2, y2);
    };
    const pad = 4 * lw;
    const segVisible = (i: number): boolean => {
        const [x1, y1] = cpAt(i), [x2, y2] = cpAt(i + 1);
        let lx = Math.min(x1, x2), hx = Math.max(x1, x2), ly = Math.min(y1, y2), hy = Math.max(y1, y2);
        if (curved) { // control points stay within one neighbour step of the end points
            const [x0, y0] = cpAt(i - 1), [x3, y3] = cpAt(i + 2);
            lx = Math.min(lx, x0, x3); hx = Math.max(hx, x0, x3); ly = Math.min(ly, y0, y3); hy = Math.max(hy, y0, y3);
        }
        return hx >= -pad && lx <= W + pad && hy >= -pad && ly <= H + pad;
    };

    // fill: whole polygon (open polylines are closed by the fill, as in Pine)
    if (pl.fillColor && n > 2) {
        ctx.fillStyle = pl.fillColor;
        ctx.beginPath();
        for (let i = 0; i < n - 1; i++) seg(i, i === 0);
        if (closed) seg(n - 1, false);
        ctx.closePath();
        ctx.fill();
    }

    ctx.strokeStyle = pl.lineColor;
    ctx.fillStyle = pl.lineColor;
    ctx.lineWidth = lw;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dashFor(pl.lineStyle, hpr));
    if (n === 1) {
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(px[0], py[0], lw / 2, 0, Math.PI * 2); ctx.fill();
        return;
    }
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < segCount; i++) {
        if (!segVisible(i)) { pen = false; continue; }
        seg(i, !pen);
        pen = true;
    }
    if (closed && pen) ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineJoin = 'miter';

    if (!closed) {
        const head = (tx: number, ty: number, qx: number, qy: number) => {
            const ang = Math.atan2(ty - qy, tx - qx);
            const sz = (5 + pl.lineWidth * 1.5) * hpr;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx - sz * Math.cos(ang - 0.45), ty - sz * Math.sin(ang - 0.45));
            ctx.lineTo(tx - sz * Math.cos(ang + 0.45), ty - sz * Math.sin(ang + 0.45));
            ctx.closePath();
            ctx.fill();
        };
        // the Catmull-Rom end tangent equals the last segment direction (phantom end point)
        if (pl.lineStyle === 'arrow_right' || pl.lineStyle === 'arrow_both') head(px[n - 1], py[n - 1], px[n - 2], py[n - 2]);
        if (pl.lineStyle === 'arrow_left' || pl.lineStyle === 'arrow_both') head(px[0], py[0], px[1], py[1]);
    }
}

function drawCandles(d: EvoDrawArgs, c: EvoCandles, a: number, endX: number, X: (i: number) => number, Y: (p: number) => number, bs: number): void {
    const { ctx, hpr, out } = d;
    const table = out.colorTable;
    const b = Math.min(endX, c.high.length - 1 + c.offset);
    const bodyW = Math.max(1, Math.floor(bs * 0.8 * hpr));
    const lw = Math.max(1, Math.floor(hpr));
    ctx.setLineDash([]);
    for (let t = a; t <= b; t++) {
        const i = t - c.offset;
        if (i < 0 || i >= c.high.length || !candleOk(c, i)) continue;
        const o = c.open[i], h = c.high[i], l = c.low[i], cl = c.close[i];
        const up = cl >= o;
        const def = up ? '#26a69a' : '#ef5350';
        const body = evoColorAt(table, c.colors, i, c.color ?? def);
        if (body === null) continue;
        const x = Math.round(X(t));
        const yo = Math.round(Y(o)), yh = Math.round(Y(h)), yl = Math.round(Y(l)), yc = Math.round(Y(cl));
        if (c.kind === 'bar') {
            ctx.strokeStyle = body;
            ctx.lineWidth = lw;
            const tick = Math.max(2, Math.floor(bodyW / 2));
            ctx.beginPath();
            ctx.moveTo(x + 0.5, yh); ctx.lineTo(x + 0.5, yl);
            ctx.moveTo(x - tick, yo + 0.5); ctx.lineTo(x + 0.5, yo + 0.5);
            ctx.moveTo(x + 0.5, yc + 0.5); ctx.lineTo(x + tick + 1, yc + 0.5);
            ctx.stroke();
            continue;
        }
        const wick = evoColorAt(table, c.wickColors, i, c.wickColor ?? body);
        const border = evoColorAt(table, c.borderColors, i, c.borderColor ?? body);
        const top = Math.min(yo, yc), bot = Math.max(yo, yc), bh = Math.max(1, bot - top);
        if (wick !== null) {
            ctx.fillStyle = wick;
            ctx.fillRect(x - Math.floor(lw / 2), yh, lw, Math.max(1, yl - yh));
        }
        const bx = x - Math.floor(bodyW / 2);
        ctx.fillStyle = body;
        ctx.fillRect(bx, top, bodyW, bh);
        if (border !== null && bodyW > 2) {
            ctx.strokeStyle = border;
            ctx.lineWidth = lw;
            const off = (lw % 2) / 2;
            ctx.strokeRect(bx + off, top + off, bodyW - off * 2, bh - off * 2);
        }
    }
}

function drawArrows(
    d: EvoDrawArgs, ar: EvoArrow, a: number, endX: number, n: number, firstPlot: EvoPlot | undefined,
    X: (i: number) => number, Y: (p: number) => number, bs: number
): void {
    const { ctx, hpr, vpr, out, priceScale: ps } = d;
    const table = out.colorTable;
    const b = Math.min(endX, ar.values.length - 1 + ar.offset, n - 1);
    // the longest arrow in view gets maxHeight
    let maxAbs = 0;
    for (let t = Math.max(0, a); t <= b; t++) {
        const i = t - ar.offset;
        if (i < 0 || i >= ar.values.length) continue;
        const v = ar.values[i];
        if (Number.isFinite(v) && Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
    }
    if (maxAbs === 0) return;
    const gap = 3 * vpr;
    for (let t = Math.max(0, a); t <= b; t++) {
        const i = t - ar.offset;
        if (i < 0 || i >= ar.values.length) continue;
        const v = ar.values[i];
        if (!Number.isFinite(v) || v === 0) continue;
        const up = v > 0;
        const color = up ? evoColorAt(table, ar.colorsUp, i, ar.colorUp) : evoColorAt(table, ar.colorsDown, i, ar.colorDown);
        if (color === null) continue;
        const bar = d.bars[t];
        if (!bar) continue;
        let hi = bar.high, lo = bar.low;
        if (d.pane) { // own pane: anchor to the first drawn plot (fallback: pane edges)
            const fs = firstPlot ? t - firstPlot.offset : -1;
            const pv = firstPlot && fs >= 0 && fs < firstPlot.values.length ? firstPlot.values[fs] : NaN;
            if (Number.isFinite(pv)) { hi = pv; lo = pv; }
            else { hi = ps.coordinateToPrice(0 as any); lo = ps.coordinateToPrice(d.height as any); }
        }
        const len = (ar.minHeight + (ar.maxHeight - ar.minHeight) * (Math.abs(v) / maxAbs)) * vpr;
        const x = X(t);
        const hw = Math.min(Math.max(3, bs * 0.35), 6) * hpr;
        const headH = Math.min(len, hw * 1.6);
        const sw = Math.max(1, Math.min(2.5, hw * 0.45)) * hpr;
        const dir = up ? 1 : -1; // screen direction from the tip to the base: up arrow points up, its base is lower on screen
        const tipY = up ? Y(lo) + gap : Y(hi) - gap;
        const baseY = tipY + dir * len;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, tipY);
        ctx.lineTo(x + hw, tipY + dir * headH);
        ctx.lineTo(x - hw, tipY + dir * headH);
        ctx.closePath();
        ctx.fill();
        if (len > headH) ctx.fillRect(x - sw / 2, Math.min(tipY + dir * headH, baseY), sw, Math.abs(baseY - tipY) - headH);
    }
}

function drawPlot(d: EvoDrawArgs, p: EvoPlot, a: number, b: number, n: number, X: (i: number) => number, Y: (p: number) => number, bs: number): void {
    const { ctx, hpr, out } = d;
    const lw = Math.max(1, p.linewidth) * hpr;
    const v = p.values;
    const off = p.offset;
    const table = out.colorTable;
    const minT = p.showLast !== undefined ? n - p.showLast : -Infinity;
    // value / colour at target bar t (source bar t - offset); NaN / null = nothing to draw there
    const val = (t: number): number => {
        if (t < minT) return NaN;
        const s = t - off;
        return s >= 0 && s < v.length ? v[s] : NaN;
    };
    const col = (t: number): string | null => evoColorAt(table, p.colors, t - off, p.color);
    ctx.strokeStyle = p.color;
    ctx.fillStyle = p.color;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash([]);
    const style = p.style;

    // line through the points, one colour run at a time (the segment i-1 -> i takes the colour of bar i)
    const polyline = (step: boolean, width: number): void => {
        ctx.lineWidth = width;
        let prevX = 0, prevY = 0, has = false, cur: string | null = null, open = false;
        const flush = () => { if (open) ctx.stroke(); open = false; };
        for (let t = a; t <= b; t++) {
            const val_ = val(t);
            const c = col(t);
            if (!Number.isFinite(val_) || c === null) { flush(); has = false; continue; }
            const x = X(t), y = Y(val_);
            if (!has) {
                flush();
                ctx.strokeStyle = c; cur = c;
                ctx.beginPath(); ctx.moveTo(x, y); open = true;
            } else {
                if (c !== cur) { // colour change: finish the run, continue from the previous point
                    flush();
                    ctx.strokeStyle = c; cur = c;
                    ctx.beginPath(); ctx.moveTo(prevX, prevY); open = true;
                }
                if (step) { ctx.lineTo(x, prevY); ctx.lineTo(x, y); } else ctx.lineTo(x, y);
            }
            prevX = x; prevY = y; has = true;
        }
        flush();
    };

    if (style === 'histogram' || style === 'columns') {
        const y0 = Y(p.histbase);
        const w = Math.max(1, bs * (style === 'columns' ? 0.7 : 0.45)) * hpr;
        for (let t = a; t <= b; t++) {
            const val_ = val(t);
            if (!Number.isFinite(val_)) continue;
            const c = col(t);
            if (c === null) continue;
            ctx.fillStyle = c;
            const y = Y(val_);
            ctx.fillRect(X(t) - w / 2, Math.min(y, y0), w, Math.max(1, Math.abs(y - y0)));
        }
    } else if (style === 'circles' || style === 'cross') {
        if (p.join) polyline(false, Math.max(1, hpr));
        const r = Math.max(2.5 * hpr, lw * 1.5);
        for (let t = a; t <= b; t++) {
            const val_ = val(t);
            if (!Number.isFinite(val_)) continue;
            const c = col(t);
            if (c === null) continue;
            const x = X(t), y = Y(val_);
            ctx.fillStyle = c;
            ctx.strokeStyle = c;
            ctx.beginPath();
            if (style === 'circles') {
                ctx.arc(x, y, Math.max(1.5, lw * 0.9), 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.lineWidth = Math.max(1, hpr);
                ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
                ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
                ctx.stroke();
            }
        }
    } else {
        // line / stepline / stepline_diamond / area / linebr: gaps at NaN and at na colours
        const step = style === 'stepline' || style === 'stepline_diamond';
        polyline(step, lw);
        if (style === 'stepline_diamond') {
            let prev = NaN;
            for (let t = a; t <= b; t++) {
                const val_ = val(t);
                if (!Number.isFinite(val_)) { prev = NaN; continue; }
                const c = col(t);
                if (c !== null && val_ !== prev) glyph(d, 'diamond', X(t), Y(val_), Math.max(3 * hpr, lw * 1.3), c);
                prev = val_;
            }
        }
        if (style === 'area' || style === 'areabr') {
            // approximation of Pine's area style: translucent fill down to the histbase line (opts colour)
            const y0 = Y(p.histbase);
            ctx.fillStyle = withAlpha(p.color, 0.18);
            let s = -1;
            const close = (e: number) => {
                if (s < 0) return;
                ctx.beginPath();
                ctx.moveTo(X(s), y0);
                for (let i = s; i <= e; i++) ctx.lineTo(X(i), Y(val(i)));
                ctx.lineTo(X(e), y0);
                ctx.closePath();
                ctx.fill();
                s = -1;
            };
            for (let t = a; t <= b; t++) {
                if (Number.isFinite(val(t))) { if (s < 0) s = t; } else close(t - 1);
            }
            close(b);
        }
    }

    if (p.trackprice) {
        // dashed horizontal line at the last value across the pane, in the colour of that bar
        for (let i = v.length - 1; i >= 0; i--) {
            if (!Number.isFinite(v[i])) continue;
            const c = evoColorAt(table, p.colors, i, p.color);
            if (c === null) continue;
            const y = Math.round(Y(v[i])) + 0.5 * d.vpr;
            ctx.strokeStyle = c;
            ctx.lineWidth = Math.max(1, hpr);
            ctx.setLineDash([4 * hpr, 4 * hpr]);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(d.width * hpr, y);
            ctx.stroke();
            ctx.setLineDash([]);
            break;
        }
    }
}

function drawText(d: EvoDrawArgs, text: string, x: number, y: number, color: string, align: CanvasTextAlign, baseline: CanvasTextBaseline, px = 11, outline = false): void {
    const { ctx, vpr } = d;
    ctx.font = `${fontStyle}${px * vpr}px ${font()}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    const lines = text.split('\n');
    const lh = (px + 2) * vpr;
    const put = (ln: string, yy: number) => {
        if (outline) {
            ctx.lineWidth = 3 * vpr;
            ctx.strokeStyle = 'rgba(19,23,34,0.85)';
            ctx.lineJoin = 'round';
            ctx.strokeText(ln, x, yy);
        }
        ctx.fillText(ln, x, yy);
    };
    if (baseline === 'bottom') [...lines].reverse().forEach((ln, k) => put(ln, y - k * lh));
    else if (baseline === 'middle') lines.forEach((ln, k) => put(ln, y + (k - (lines.length - 1) / 2) * lh));
    else lines.forEach((ln, k) => put(ln, y + k * lh));
}

type Pointer = 'up' | 'down' | 'left' | 'right' | 'none';

/** Rounded label box centred at (cx, cy) with an optional pointer. In a pane it is kept inside vertically. */
function pill(d: EvoDrawArgs, cx: number, cy: number, text: string, bg: string, fg: string, pointer: Pointer, px = 11, align = 'center'): { x: number; y: number; w: number; h: number } {
    const { ctx, hpr, vpr } = d;
    ctx.font = `${fontStyle}${px * vpr}px ${font()}`;
    const lines = text.split('\n');
    const tw = Math.max(0, ...lines.map((ln) => ctx.measureText(ln).width));
    const lh = (px + 2) * vpr;
    const w = Math.max(tw + 10 * hpr, 12 * hpr), h = lines.length * lh + 6 * vpr;
    const ptr = 5 * vpr;
    if (d.pane) {
        const ext = h / 2 + (pointer === 'up' || pointer === 'down' ? ptr : 0) + 2 * vpr;
        cy = Math.max(ext, Math.min(d.height * vpr - ext, cy));
    }
    const x = cx - w / 2, y = cy - h / 2;
    ctx.fillStyle = bg;
    ctx.beginPath();
    const r = 3 * hpr;
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    if (pointer === 'up') { ctx.moveTo(cx - ptr, y); ctx.lineTo(cx, y - ptr); ctx.lineTo(cx + ptr, y); }
    else if (pointer === 'down') { ctx.moveTo(cx - ptr, y + h); ctx.lineTo(cx, y + h + ptr); ctx.lineTo(cx + ptr, y + h); }
    else if (pointer === 'left') { ctx.moveTo(x, cy - ptr); ctx.lineTo(x - ptr, cy); ctx.lineTo(x, cy + ptr); }
    else if (pointer === 'right') { ctx.moveTo(x + w, cy - ptr); ctx.lineTo(x + w + ptr, cy); ctx.lineTo(x + w, cy + ptr); }
    if (pointer !== 'none') ctx.fill();
    if (text) {
        ctx.fillStyle = fg;
        ctx.textBaseline = 'middle';
        const tx = align === 'left' ? x + 5 * hpr : align === 'right' ? x + w - 5 * hpr : cx;
        ctx.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
        lines.forEach((ln, k) => ctx.fillText(ln, tx, y + 3 * vpr + lh / 2 + k * lh));
    }
    return { x, y, w, h };
}

function textWidth(d: EvoDrawArgs, text: string, px: number): number {
    d.ctx.font = `${fontStyle}${px * d.vpr}px ${font()}`;
    return Math.max(0, ...text.split('\n').map((ln) => d.ctx.measureText(ln).width));
}

/** Glyph for shape-like label styles and plotshape styles, centred at (x, cy) with radius r. False when the style is unknown. */
function glyph(d: EvoDrawArgs, style: string, x: number, cy: number, r: number, color: string): boolean {
    const { ctx, hpr } = d;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, 1.5 * hpr);
    ctx.beginPath();
    switch (style) {
        case 'circle': ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.fill(); return true;
        case 'square': ctx.fillRect(x - r, cy - r, 2 * r, 2 * r); return true;
        case 'diamond':
            ctx.moveTo(x, cy - r * 1.2); ctx.lineTo(x + r * 1.2, cy); ctx.lineTo(x, cy + r * 1.2); ctx.lineTo(x - r * 1.2, cy);
            ctx.closePath(); ctx.fill(); return true;
        case 'triangleup':
            ctx.moveTo(x, cy - r); ctx.lineTo(x + r * 1.1, cy + r); ctx.lineTo(x - r * 1.1, cy + r); ctx.closePath(); ctx.fill(); return true;
        case 'triangledown':
            ctx.moveTo(x, cy + r); ctx.lineTo(x + r * 1.1, cy - r); ctx.lineTo(x - r * 1.1, cy - r); ctx.closePath(); ctx.fill(); return true;
        case 'arrowup':
            ctx.moveTo(x, cy - r * 1.3); ctx.lineTo(x + r, cy); ctx.lineTo(x + r * 0.4, cy); ctx.lineTo(x + r * 0.4, cy + r * 1.3);
            ctx.lineTo(x - r * 0.4, cy + r * 1.3); ctx.lineTo(x - r * 0.4, cy); ctx.lineTo(x - r, cy); ctx.closePath(); ctx.fill(); return true;
        case 'arrowdown':
            ctx.moveTo(x, cy + r * 1.3); ctx.lineTo(x + r, cy); ctx.lineTo(x + r * 0.4, cy); ctx.lineTo(x + r * 0.4, cy - r * 1.3);
            ctx.lineTo(x - r * 0.4, cy - r * 1.3); ctx.lineTo(x - r * 0.4, cy); ctx.lineTo(x - r, cy); ctx.closePath(); ctx.fill(); return true;
        case 'xcross':
            ctx.moveTo(x - r, cy - r); ctx.lineTo(x + r, cy + r); ctx.moveTo(x - r, cy + r); ctx.lineTo(x + r, cy - r); ctx.stroke(); return true;
        case 'cross':
            ctx.moveTo(x - r, cy); ctx.lineTo(x + r, cy); ctx.moveTo(x, cy - r); ctx.lineTo(x, cy + r); ctx.stroke(); return true;
        case 'flag':
            ctx.moveTo(x - r * 0.6, cy + r); ctx.lineTo(x - r * 0.6, cy - r); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x - r * 0.6, cy - r); ctx.lineTo(x + r, cy - r * 0.4); ctx.lineTo(x - r * 0.6, cy + r * 0.2); ctx.closePath(); ctx.fill(); return true;
        default: return false;
    }
}

function drawLabel(d: EvoDrawArgs, l: EvoLabel, x: number, y: number): void {
    const { hpr, vpr } = d;
    const px = textPx(l.size);
    const color = l.color;
    const fg = l.textcolor || contrastText(color);
    const gap = 6 * vpr;
    const lines = Math.max(1, l.text.split('\n').length);
    const h = lines * (px + 2) * vpr + 6 * vpr;
    const w = Math.max(textWidth(d, l.text, px) + 10 * hpr, 12 * hpr);
    const align = l.textalign;
    let box: { x: number; y: number; w: number; h: number } | null = null;
    switch (l.style) {
        case 'up': box = pill(d, x, y + gap + h / 2, l.text, color, fg, 'up', px, align); break;
        case 'down': box = pill(d, x, y - gap - h / 2, l.text, color, fg, 'down', px, align); break;
        case 'left': box = pill(d, x + gap + w / 2, y, l.text, color, fg, 'left', px, align); break;
        case 'right': box = pill(d, x - gap - w / 2, y, l.text, color, fg, 'right', px, align); break;
        // corner anchored boxes: the anchor point is the named corner of the box
        case 'upperleft': box = pill(d, x + w / 2, y + h / 2, l.text, color, fg, 'none', px, align); break;
        case 'upperright': box = pill(d, x - w / 2, y + h / 2, l.text, color, fg, 'none', px, align); break;
        case 'lowerleft': box = pill(d, x + w / 2, y - h / 2, l.text, color, fg, 'none', px, align); break;
        case 'lowerright': box = pill(d, x - w / 2, y - h / 2, l.text, color, fg, 'none', px, align); break;
        case 'center': box = pill(d, x, y, l.text, color, fg, 'none', px, align); break;
        case 'none': drawText(d, l.text, x, y, l.textcolor || color, 'center', 'middle', px); box = { x: x - w / 2, y: y - h / 2, w, h }; break;
        case 'textoutline': drawText(d, l.text, x, y, l.textcolor || color, 'center', 'middle', px, true); box = { x: x - w / 2, y: y - h / 2, w, h }; break;
        default: {
            // shape styles: glyph at the anchor, text beside it (below for up-pointing, above otherwise)
            const r = 5 * hpr;
            if (glyph(d, l.style, x, y, r, color)) {
                box = { x: x - r, y: y - r, w: 2 * r, h: 2 * r };
                if (l.text) {
                    const below = l.style === 'arrowup' || l.style === 'triangleup';
                    if (below) drawText(d, l.text, x, y + r + 3 * vpr, l.textcolor || color, 'center', 'top', px);
                    else drawText(d, l.text, x, y - r - 3 * vpr, l.textcolor || color, 'center', 'bottom', px);
                }
            } else {
                box = pill(d, x, y - gap - h / 2, l.text, color, fg, 'down', px, align); // unknown -> labeldown
            }
        }
    }
    if (l.tooltip && box && d.hits) d.hits.push({ x: box.x / hpr, y: box.y / vpr, w: box.w / hpr, h: box.h / vpr, text: l.tooltip });
}

/** Wrap `text` to `maxW` (device px) at spaces; a single word wider than that stays on its own line (it is clipped) */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
    const out: string[] = [];
    for (const para of text.split('\n')) {
        let line = '';
        for (const word of para.split(' ')) {
            const test = line ? `${line} ${word}` : word;
            if (line && ctx.measureText(test).width > maxW) { out.push(line); line = word; } else line = test;
        }
        out.push(line);
    }
    return out;
}

/** Box text: horizontal / vertical alignment, optional wrapping ("auto"), always clipped to the box rectangle */
function drawBoxText(d: EvoDrawArgs, b: EvoBox, x1: number, y1: number, x2: number, y2: number, color: string): void {
    const { ctx, hpr, vpr } = d;
    const px = textPx(b.textSize);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x1, Math.min(y1, y2), x2 - x1, Math.abs(y2 - y1));
    ctx.clip();
    ctx.font = `${fontStyle}${px * vpr}px ${font()}`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    const pad = 4 * hpr;
    // keep the text on the visible part of boxes that extend past the pane
    const rl = Math.max(x1, 0), rr = Math.min(x2, d.width * hpr);
    const lines = b.textWrap === 'auto' ? wrapText(ctx, b.text!, Math.max(1, rr - rl - 2 * pad)) : b.text!.split('\n');
    const lh = (px + 2) * vpr;
    const blockH = lines.length * lh;
    const top = Math.min(y1, y2), bottom = Math.max(y1, y2);
    let ty: number;
    if (b.textValign === 'top') ty = top + 3 * vpr;
    else if (b.textValign === 'bottom') ty = bottom - 3 * vpr - blockH;
    else ty = (top + bottom) / 2 - blockH / 2;
    let tx: number;
    if (b.textHalign === 'left') { ctx.textAlign = 'left'; tx = rl + pad; }
    else if (b.textHalign === 'right') { ctx.textAlign = 'right'; tx = rr - pad; }
    else { ctx.textAlign = 'center'; tx = (rl + rr) / 2; }
    lines.forEach((ln, k) => ctx.fillText(ln, tx, ty + k * lh));
    ctx.restore();
}

function drawShape(
    d: EvoDrawArgs, s: EvoShape, i: number, absPrice: number, bar: BarData, size: number,
    stack: Map<string, number>, X: (i: number) => number, Y: (p: number) => number,
    color: string, textcolor: string, text: string, topInset: number
): void {
    const { ctx, hpr, vpr } = d;
    const x = X(i);
    const isLabel = s.style === 'labelup' || s.style === 'labeldown';
    const px = 11;
    const lineCount = Math.max(1, text.split('\n').length);
    const hs = isLabel ? (lineCount * (px + 2) * vpr + 6 * vpr) / 2 + 5 * vpr : size * vpr; // half extent along y
    const gap = (d.pane ? 10 : 4) * vpr;
    const textH = text && !isLabel ? lineCount * (px + 2) * vpr : 0;
    const key = `${i}|${s.location}`;
    const k = stack.get(key) ?? 0;
    const step = 2 * hs + textH + 2 * vpr;
    stack.set(key, k + 1);

    let cy: number;
    let above = true;
    switch (s.location) {
        case 'belowbar': cy = Y(bar.low) + gap + hs + k * step; above = false; break;
        case 'bottom': cy = d.height * vpr - 4 * vpr - hs - k * step; above = false; break;
        case 'top': cy = topInset + 4 * vpr + hs + k * step; break;
        case 'absolute': cy = Y(absPrice); above = s.style !== 'labelup' && s.style !== 'arrowup' && s.style !== 'triangleup'; break;
        default: cy = Y(bar.high) - gap - hs - k * step; // abovebar
    }
    if (d.pane) { // keep the marker (and its text) fully inside the pane
        const ext = hs + (text && !isLabel ? textH : 0) + 2 * vpr;
        cy = Math.max(ext + topInset * (s.location === 'top' ? 1 : 0), Math.min(d.height * vpr - ext, cy));
    }
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, 1.5 * hpr);

    if (isLabel) {
        pill(d, x, cy, text, color, textcolor || contrastText(color), s.style === 'labelup' ? 'up' : 'down', px);
        return;
    }
    if (s.style === 'char') {
        const ch = s.char || text.slice(0, 1) || '●';
        drawText(d, ch, x, cy, color, 'center', 'middle', Math.max(10, size * 2));
        return;
    }
    if (!glyph(d, s.style, x, cy, size * hpr, color)) glyph(d, 'circle', x, cy, size * hpr, color); // unknown -> circle
    if (text) {
        const col = textcolor || color;
        if (above) drawText(d, text, x, cy - hs - 2 * vpr, col, 'center', 'bottom', px);
        else drawText(d, text, x, cy + hs + 2 * vpr, col, 'center', 'top', px);
    }
}
