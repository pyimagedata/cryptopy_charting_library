/**
 * Evo Script style overrides ("Style" tab of the settings dialog): pure logic, no DOM.
 *
 * One row per visual output of the last run (plots, plotshape/plotchar, plotcandle/plotbar, plotarrow,
 * hline, fill, bgcolor, barcolor). Rows have a stable id `<kind>:<title>:<ordinal>` where the title is the
 * script's title (engine suffixes like `#12` and generated names like `plot3` are removed: untitled = '')
 * and the ordinal counts outputs of the same kind and title (1-based). Overrides are stored per id and only
 * hold the fields that differ from the script's own defaults. They are applied at render time to a derived
 * copy of the run output (`applyEvoStyles`), so changing a style never re-runs the script.
 *
 * Colour rule: an overridden colour replaces the colour of every bar the script did not mark na
 * (per-bar colours / transparency of the script are replaced, na gaps stay gaps).
 */

import type { EvoOutput, EvoPlot, EvoShape } from './evo-script-core';

export type EvoStyleKind = 'plot' | 'shape' | 'candle' | 'arrow' | 'hline' | 'fill' | 'bg' | 'bar';

export interface EvoStyleOverride {
    visible?: boolean;
    color?: string;
    width?: number;
    style?: string;
}
export type EvoStyleMap = Record<string, EvoStyleOverride>;

/** Fully resolved style of a row (defaults + override) */
export interface EvoResolvedStyle { visible: boolean; color?: string; width?: number; style?: string }

export interface EvoStyleItem {
    id: string;
    kind: EvoStyleKind;
    /** Index into the matching EvoOutput array (bg: raw title of the bgcolor call) */
    ref: number | string;
    label: string;
    defaults: EvoResolvedStyle;
}

const PREFIX: Record<EvoStyleKind, string> = { plot: 'p', shape: 's', candle: 'c', arrow: 'a', hline: 'h', fill: 'f', bg: 'g', bar: 'b' };
const UNTITLED_RE: Partial<Record<EvoStyleKind, RegExp>> = {
    plot: /^plot\d+$/, shape: /^shape\d+$/, candle: /^(candle|bar)\d+$/, arrow: /^arrow\d+$/, bg: /^bgcolor\d+$/,
};
const DEFAULT_LABEL: Record<EvoStyleKind, string> = {
    plot: 'Plot', shape: 'Shape', candle: 'Candles', arrow: 'Arrows', hline: 'Hline', fill: 'Fill', bg: 'Background', bar: 'Bar color',
};

export const EVO_PLOT_STYLES: Array<{ value: string; label: string }> = [
    { value: 'line', label: 'Line' },
    { value: 'linebr', label: 'Line with breaks' },
    { value: 'stepline', label: 'Step line' },
    { value: 'histogram', label: 'Histogram' },
    { value: 'columns', label: 'Columns' },
    { value: 'circles', label: 'Circles' },
    { value: 'cross', label: 'Cross' },
    { value: 'area', label: 'Area' },
];
export const EVO_LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;

const NA = 0xFFFF;
const MAX_STYLES = 300;

/** Title as the user wrote it ('' = untitled) */
export function evoBaseTitle(kind: EvoStyleKind, raw: string): string {
    const s = String(raw ?? '').replace(/#\d+$/, '');
    const re = UNTITLED_RE[kind];
    return re && re.test(s) ? '' : s;
}

/** Plot style name without the `style_` / `plot.` decoration */
export function evoNormStyle(s: unknown): string {
    const str = typeof s === 'string' ? s : '';
    return str.replace(/^.*\./, '').replace(/^style_/, '') || 'line';
}

const hasFlag = (display: string, flag: string): boolean => {
    const f = String(display || 'all').toLowerCase().split(/[^a-z_]+/).filter(Boolean);
    return f.includes('all') || f.includes(flag);
};
const drawn = (display: string): boolean => hasFlag(display, 'pane');
const notNone = (display: string | undefined): boolean => display !== 'none';

/** First colour the script paints: first non-na per-bar colour, else the fixed colour */
export function evoFirstColor(table: string[], colors: Uint16Array | undefined, fallback: string): string {
    if (colors) {
        for (let i = 0; i < colors.length; i++) {
            const k = colors[i];
            if (k !== NA && table[k]) return table[k];
        }
    }
    return fallback;
}

/** Rows of the Style tab for an output, in a fixed order (plots, shapes, candles, arrows, hlines, fills, bg, barcolor) */
export function evoStyleItems(out: EvoOutput | null, tr: (s: string) => string = (s) => s): EvoStyleItem[] {
    const items: EvoStyleItem[] = [];
    if (!out) return items;
    const counts = new Map<string, number>();
    const add = (kind: EvoStyleKind, ref: number | string, rawTitle: string, defaults: EvoResolvedStyle): void => {
        const base = evoBaseTitle(kind, rawTitle);
        const ck = `${PREFIX[kind]}:${base}`;
        const n = (counts.get(ck) ?? 0) + 1;
        counts.set(ck, n);
        const label = base ? (n === 1 ? base : `${base} (${n})`) : (n === 1 ? tr(DEFAULT_LABEL[kind]) : `${tr(DEFAULT_LABEL[kind])} ${n}`);
        items.push({ id: `${ck}:${n}`, kind, ref, label, defaults });
    };
    out.plots.forEach((p, i) => add('plot', i, p.title, {
        visible: drawn(p.display), color: evoFirstColor(out.colorTable, p.colors, p.color), width: p.linewidth, style: evoNormStyle(p.style),
    }));
    out.shapes.forEach((s, i) => add('shape', i, s.title, { visible: drawn(s.display), color: evoFirstColor(out.colorTable, s.colors, s.color) }));
    out.candles.forEach((c, i) => add('candle', i, c.title, { visible: drawn(c.display) }));
    out.arrows.forEach((a, i) => add('arrow', i, a.title, { visible: drawn(a.display) }));
    out.hlines.forEach((h, i) => add('hline', i, h.title, { visible: drawn(h.display), color: h.color, width: h.linewidth, style: h.linestyle || 'dashed' }));
    out.fills.forEach((f, i) => add('fill', i, f.title, { visible: notNone(f.display), color: f.color ?? f.topColor ?? f.bottomColor }));
    const seenBg = new Set<string>();
    for (const b of out.bgcolors) {
        const key = b.title ?? '';
        if (seenBg.has(key)) continue;
        seenBg.add(key);
        add('bg', key, key, { visible: notNone(b.display) });
    }
    if (out.barColors) add('bar', 0, '', { visible: notNone(out.barColorDisplay) });
    return items;
}

export function resolveEvoStyle(item: EvoStyleItem, ov: EvoStyleOverride | undefined): EvoResolvedStyle {
    const d = item.defaults;
    return {
        visible: ov?.visible ?? d.visible,
        color: ov?.color ?? d.color,
        width: ov?.width ?? d.width,
        style: ov?.style ?? d.style,
    };
}

/** Override holding only the fields of `value` that differ from the defaults (undefined = nothing to store) */
export function normalizeEvoOverride(item: EvoStyleItem, value: unknown): EvoStyleOverride | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const v = value as Record<string, unknown>;
    const d = item.defaults;
    const o: EvoStyleOverride = {};
    if (typeof v.visible === 'boolean' && v.visible !== d.visible) o.visible = v.visible;
    if (d.color !== undefined && typeof v.color === 'string' && v.color !== '' && v.color !== d.color) o.color = v.color;
    if (d.width !== undefined && typeof v.width === 'number' && Number.isFinite(v.width) && v.width >= 1 && v.width <= 20 && Math.round(v.width) !== d.width) o.width = Math.round(v.width);
    if (d.style !== undefined && typeof v.style === 'string' && v.style !== '' && v.style !== d.style) o.style = v.style;
    return Object.keys(o).length > 0 ? o : undefined;
}

/** Untrusted (persisted / host supplied) value -> clean map */
export function sanitizeEvoStyles(v: unknown): EvoStyleMap {
    const out: EvoStyleMap = Object.create(null);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    let n = 0;
    for (const k of Object.keys(v as object)) {
        if (n >= MAX_STYLES || k.length > 200) break;
        const e = (v as Record<string, unknown>)[k];
        if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
        const r = e as Record<string, unknown>;
        const o: EvoStyleOverride = {};
        if (typeof r.visible === 'boolean') o.visible = r.visible;
        if (typeof r.color === 'string' && r.color.length > 0 && r.color.length <= 64) o.color = r.color;
        if (typeof r.width === 'number' && Number.isFinite(r.width) && r.width >= 1 && r.width <= 20) o.width = Math.round(r.width);
        if (typeof r.style === 'string' && r.style.length > 0 && r.style.length <= 32) o.style = r.style;
        if (Object.keys(o).length === 0) continue;
        Object.defineProperty(out, k, { value: o, enumerable: true, writable: true, configurable: true });
        n++;
    }
    return out;
}

/** Keep the overrides whose row still exists (same kind, title and ordinal); the rest is dropped */
export function pruneEvoStyles(styles: EvoStyleMap, items: EvoStyleItem[]): EvoStyleMap {
    const ids = new Set(items.map((i) => i.id));
    const out: EvoStyleMap = Object.create(null);
    for (const k of Object.keys(styles)) if (ids.has(k)) out[k] = styles[k];
    return out;
}

/** Copy of `styles` with the entry of `item` replaced (undefined / equal to the defaults removes it) */
export function setEvoOverride(styles: EvoStyleMap, item: EvoStyleItem, value: unknown): EvoStyleMap {
    const out: EvoStyleMap = Object.create(null);
    for (const k of Object.keys(styles)) if (k !== item.id) out[k] = styles[k];
    const o = normalizeEvoOverride(item, value);
    if (o) out[item.id] = o;
    return out;
}

/** Same colour for every non-na bar of a per-bar colour array (extends the shared table) */
function recolor(colors: Uint16Array, table: string[], color: string): Uint16Array {
    let idx = table.indexOf(color);
    if (idx < 0) { idx = table.length; table.push(color); }
    const o = new Uint16Array(colors.length);
    for (let i = 0; i < colors.length; i++) o[i] = colors[i] === NA ? NA : idx;
    return o;
}

/**
 * Output as it is drawn: script defaults + user overrides. Visibility goes through `display`
 * ('none' = not drawn, no autoscale, no legend value, no price tag), so every consumer of the output
 * (renderer, range, legend, tags) honours it without knowing about styles.
 * Returns `out` itself when nothing differs from the script's own output.
 */
export function applyEvoStyles(out: EvoOutput, styles: EvoStyleMap, items: EvoStyleItem[] = evoStyleItems(out)): EvoOutput {
    const table = out.colorTable.slice();
    const res: EvoOutput = { ...out, colorTable: table };
    let changed = false;
    let plots: EvoPlot[] | null = null, shapes: EvoShape[] | null = null;
    let hlines: EvoOutput['hlines'] | null = null, fills: EvoOutput['fills'] | null = null;
    let candles: EvoOutput['candles'] | null = null, arrows: EvoOutput['arrows'] | null = null;
    const hiddenBg = new Set<string>();
    for (const it of items) {
        const r = resolveEvoStyle(it, styles[it.id]);
        const dispChanged = r.visible !== it.defaults.visible;
        const disp = r.visible ? 'all' : 'none';
        const colorChanged = it.defaults.color !== undefined && r.color !== it.defaults.color;
        const widthChanged = it.defaults.width !== undefined && r.width !== it.defaults.width;
        const styleChanged = it.defaults.style !== undefined && r.style !== it.defaults.style;
        switch (it.kind) {
            case 'plot': {
                if (!dispChanged && !colorChanged && !widthChanged && !styleChanged) break;
                plots ??= out.plots.slice();
                const p = plots[it.ref as number];
                const q: EvoPlot = { ...p };
                if (dispChanged) q.display = disp;
                if (colorChanged) { q.color = r.color!; if (p.colors) q.colors = recolor(p.colors, table, r.color!); }
                if (widthChanged) q.linewidth = r.width!;
                if (styleChanged) q.style = r.style!;
                plots[it.ref as number] = q;
                changed = true;
                break;
            }
            case 'shape': {
                if (!dispChanged && !colorChanged) break;
                shapes ??= out.shapes.slice();
                const s = shapes[it.ref as number];
                const q: EvoShape = { ...s };
                if (dispChanged) q.display = disp;
                if (colorChanged) { q.color = r.color!; if (s.colors) q.colors = recolor(s.colors, table, r.color!); }
                shapes[it.ref as number] = q;
                changed = true;
                break;
            }
            case 'candle':
                if (!dispChanged) break;
                candles ??= out.candles.slice();
                candles[it.ref as number] = { ...candles[it.ref as number], display: disp };
                changed = true;
                break;
            case 'arrow':
                if (!dispChanged) break;
                arrows ??= out.arrows.slice();
                arrows[it.ref as number] = { ...arrows[it.ref as number], display: disp };
                changed = true;
                break;
            case 'hline': {
                if (!dispChanged && !colorChanged && !widthChanged && !styleChanged) break;
                hlines ??= out.hlines.slice();
                const h = hlines[it.ref as number];
                hlines[it.ref as number] = {
                    ...h, display: dispChanged ? disp : h.display, color: colorChanged ? r.color! : h.color,
                    linewidth: widthChanged ? r.width! : h.linewidth, linestyle: styleChanged ? r.style! : h.linestyle,
                };
                changed = true;
                break;
            }
            case 'fill': {
                if (!dispChanged && !colorChanged) break;
                fills ??= out.fills.slice();
                const f = fills[it.ref as number];
                fills[it.ref as number] = { ...f, display: dispChanged ? disp : f.display, ...(colorChanged ? { color: r.color! } : {}) };
                changed = true;
                break;
            }
            case 'bg':
                if (!r.visible) hiddenBg.add(String(it.ref));
                break;
            case 'bar':
                if (!r.visible) { res.barColors = undefined; changed = true; }
                break;
        }
    }
    // bgcolor bands: hidden calls (script display.none or user) are dropped
    const hidesBg = out.bgcolors.some((b) => hiddenBg.has(b.title ?? ''));
    if (hidesBg) { res.bgcolors = out.bgcolors.filter((b) => !hiddenBg.has(b.title ?? '')); changed = true; }
    if (!changed) return out;
    if (plots) res.plots = plots;
    if (shapes) res.shapes = shapes;
    if (candles) res.candles = candles;
    if (arrows) res.arrows = arrows;
    if (hlines) res.hlines = hlines;
    if (fills) res.fills = fills;
    return res;
}
