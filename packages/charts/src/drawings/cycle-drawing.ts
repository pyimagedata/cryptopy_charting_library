/**
 * Dongu araclari (tek govde: CycleToolBase), 2 tik: P1, P2. Geometri ekran (piksel) uzayinda; x ekseni bar
 * indeksiyle dogrusal oldugundan "periyot" pikselde dogrudan olculur.
 *
 *   cyclicLines  Dongusel Cizgiler  P1 + n*periyot (n = 0,1,2,...) konumlarinda panel yuksekligince dikey cizgiler.
 *                Periyot = P2.x - P1.x; "ileri" yon P1'den P2'ye dogrudur (P2 solda ise cizgiler sola gider).
 *                P1'in gerisi cizilmez.
 *   timeCycles   Zaman Dongulari    P1.y taban cizgisi uzerinde, her biri bir periyot genisliginde yari elips yaylar:
 *                [P1.x + n*periyot, P1.x + (n+1)*periyot]. Yay yuksekligi = |P2.y - P1.y| piksel; P2 ayni fiyattaysa
 *                (fark < 1 px) yuksekligi periyodun yarisi (yari daire). Yaylar her zaman tabanin ustundedir (y azalan).
 *                Dolgu: yay ile taban arasi.
 *   sineLine     Sinus Cizgisi      P1 = tepe/dip, P2 = karsi uc (yarim periyot). Genlik = |dy|/2, merkez = (y1+y2)/2,
 *                y(x) = merkez + (y1 - merkez) * cos(pi * (x - x1) / (x2 - x1)); periyot = 2*|x2 - x1|. Her iki yone
 *                panel kenarina kadar cizilir.
 *
 * Tum donguler yineleme sinirlidir (cycleCap: panel kapsami / periyot + 2, en fazla MAX_CYCLES); periyot < MIN_PERIOD_PX ise hicbir sey cizilmez.
 */

import {
    Drawing,
    DrawingPoint,
    DrawingStyle,
    DrawingState,
    DrawingType,
    DEFAULT_DRAWING_STYLE,
    generateDrawingId,
    SerializedDrawing,
} from './drawing';
import {
    DrawingSettingsProvider,
    DrawingSettingsConfig,
    AttributeBarItem,
    createStyleTab,
    createVisibilityTab,
} from './drawing-settings-config';
import { restoreShapeStyle, shapeFillCss } from './shape-common';
import {
    createOpenStyle,
    openLineSection,
    backgroundSection,
    openAttributeBarItems,
    getOpenSetting,
    setOpenSetting,
} from './open-shape-common';

export type CycleToolType = 'cyclicLines' | 'timeCycles' | 'sineLine';
export const CYCLE_TOOL_TYPES: ReadonlySet<string> = new Set<string>(['cyclicLines', 'timeCycles', 'sineLine']);

type Pt = { x: number; y: number };

/** Mutlak ust sinir (asiri kucuk periyot / devasa panel icin) */
export const MAX_CYCLES = 20000;

/** Panel genisligini kapsayacak kadar dongu: ceil(genislik / |periyot|) + 2, MAX_CYCLES ile sinirli. */
export function cycleCap(width: number, period: number): number {
    const n = Math.ceil(width / Math.max(MIN_PERIOD_PX, Math.abs(period))) + 2;
    return Math.max(2, Math.min(MAX_CYCLES, n));
}
export const MIN_PERIOD_PX = 1;

export interface CycleGeometry {
    /** Cizilecek cokgenler (acik) */
    lines: Pt[][];
    /** Dolgu cokgenleri (kapali) */
    fills: Pt[][];
}

const EMPTY: CycleGeometry = { lines: [], fills: [] };

/** Dongusel cizgilerin x konumlari (panel [0,width] icinde, P1'den P2 yonunde). */
export function cyclicLineXs(x1: number, x2: number, width: number): number[] {
    const period = x2 - x1;
    if (!Number.isFinite(period) || Math.abs(period) < MIN_PERIOD_PX || !(width > 0)) return [];
    const out: number[] = [];
    // Panelin onune dusen n'leri atla (sinirli)
    let n = 0;
    if (period > 0 && x1 < 0) n = Math.ceil(-x1 / period);
    else if (period < 0 && x1 > width) n = Math.ceil((x1 - width) / -period);
    const cap = cycleCap(width, period);
    for (let i = 0; i < cap; i++, n++) {
        const x = x1 + n * period;
        if (period > 0 ? x > width : x < 0) break;
        if (x >= 0 && x <= width) out.push(x);
    }
    return out;
}

/** Zaman dongusu yaylari: her yay bir cokgen; dolgu = yay + taban. */
export function timeCycleArcs(p1: Pt, p2: Pt, width: number): { arcs: Pt[][]; fills: Pt[][] } {
    const period = p2.x - p1.x;
    const arcs: Pt[][] = [];
    const fills: Pt[][] = [];
    if (!Number.isFinite(period) || Math.abs(period) < MIN_PERIOD_PX || !(width > 0)) return { arcs, fills };
    const w = Math.abs(period);
    const dy = Math.abs(p2.y - p1.y);
    const h = dy < 1 ? w / 2 : dy;
    const segs = 2 * Math.max(4, Math.min(24, Math.ceil(w / 8))); // cift: tepe noktasi ornek olur
    let n = 0;
    if (period > 0 && p1.x < 0) n = Math.max(0, Math.floor(-p1.x / w));
    else if (period < 0 && p1.x > width) n = Math.max(0, Math.floor((p1.x - width) / w));
    const cap = cycleCap(width, period);
    for (let i = 0; i < cap; i++, n++) {
        const x0 = p1.x + n * period;
        const xEnd = x0 + period;
        const left = Math.min(x0, xEnd), right = Math.max(x0, xEnd);
        if (period > 0 ? left >= width : right <= 0) break;
        if (right <= 0 || left >= width) continue;
        const arc: Pt[] = [];
        for (let k = 0; k <= segs; k++) {
            const th = (Math.PI * k) / segs;
            arc.push({ x: x0 + (period / 2) * (1 - Math.cos(th)), y: p1.y - h * Math.sin(th) });
        }
        arcs.push(arc);
        fills.push(arc);
    }
    return { arcs, fills };
}

/** Sinus dalgasi: P1 ve P2 uzerinden gecer, periyot 2*|dx|; [0,width] boyunca ornekler. */
export function sineLinePoints(p1: Pt, p2: Pt, width: number): Pt[] {
    const dx = p2.x - p1.x;
    if (!Number.isFinite(dx) || Math.abs(dx) < MIN_PERIOD_PX || !(width > 0)) return [];
    const cy = (p1.y + p2.y) / 2;
    const amp = p1.y - cy;
    const step = Math.max(0.5, Math.min(3, Math.abs(dx) / 12));
    const pts: Pt[] = [];
    const count = Math.min(8000, Math.ceil(width / step));
    for (let i = 0; i <= count; i++) {
        const x = (width * i) / count;
        pts.push({ x, y: cy + amp * Math.cos((Math.PI * (x - p1.x)) / dx) });
    }
    return pts;
}

function segDist(px: number, py: number, a: Pt, b: Pt): number {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

export class CycleToolBase implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType;
    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible = true;
    locked = false;

    private _previewIndex = -1;
    private _pixelPoints: Pt[] = [];
    private _geom: CycleGeometry = EMPTY;

    constructor(type: CycleToolType) {
        this.id = generateDrawingId();
        this.type = type;
        if (type === 'cyclicLines') {
            this.style = createOpenStyle(DEFAULT_DRAWING_STYLE, { color: '#80CCDB', lineWidth: 2 });
        } else if (type === 'timeCycles') {
            this.style = createOpenStyle(DEFAULT_DRAWING_STYLE, { color: '#159980', lineWidth: 2, fill: { color: '#6AA84F', opacity: 0.5, enabled: true } });
        } else {
            this.style = createOpenStyle(DEFAULT_DRAWING_STYLE, { color: '#159980', lineWidth: 2 });
        }
    }

    get hasFill(): boolean { return this.type === 'timeCycles'; }

    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
        if (this.points.length >= 2) this.state = 'complete';
    }

    isComplete(): boolean {
        return this.points.length >= 2 && this.state !== 'creating';
    }

    updateLastPoint(time: number, price: number): void {
        if (this.points.length === 0) return;
        if (this.state === 'creating') {
            if (this._previewIndex === -1) {
                this.points.push({ time, price });
                this._previewIndex = this.points.length - 1;
            } else {
                this.points[this._previewIndex] = { time, price };
            }
        } else {
            this.points[this.points.length - 1] = { time, price };
        }
    }

    confirmPreviewPoint(): void { this._previewIndex = -1; }

    getPixelPoints(): Pt[] { return this._pixelPoints; }
    setPixelPoints(pts: Pt[]): void { this._pixelPoints = pts; }
    getGeometry(): CycleGeometry { return this._geom; }

    /** Ekran noktalarindan (css px) geometriyi hesaplar ve onbellege yazar. */
    layout(pts: Pt[], width: number, height: number): CycleGeometry {
        this._pixelPoints = pts;
        if (pts.length < 2) { this._geom = EMPTY; return this._geom; }
        const [p1, p2] = pts;
        if (this.type === 'cyclicLines') {
            this._geom = { lines: cyclicLineXs(p1.x, p2.x, width).map(x => [{ x, y: 0 }, { x, y: height }]), fills: [] };
        } else if (this.type === 'timeCycles') {
            const r = timeCycleArcs(p1, p2, width);
            this._geom = { lines: r.arcs, fills: r.fills };
        } else {
            const s = sineLinePoints(p1, p2, width);
            this._geom = { lines: s.length ? [s] : [], fills: [] };
        }
        return this._geom;
    }

    fillCss(): string | null { return this.hasFill ? shapeFillCss(this.style) : null; }

    hitTest(x: number, y: number, threshold: number = 6): boolean {
        for (const poly of this._geom.lines) {
            for (let i = 1; i < poly.length; i++) {
                if (segDist(x, y, poly[i - 1], poly[i]) <= threshold) return true;
            }
        }
        for (const p of this._pixelPoints) {
            if (Math.hypot(x - p.x, y - p.y) <= threshold) return true;
        }
        return false;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length < 2) return null;
        const xs = this._pixelPoints.map(p => p.x), ys = this._pixelPoints.map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    // ---- Ayarlar ----

    getSettingsConfig(): DrawingSettingsConfig {
        const sections = [openLineSection()];
        if (this.hasFill) sections.push(backgroundSection());
        return { tabs: [createStyleTab(sections), createVisibilityTab()] };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return openAttributeBarItems({ fill: this.hasFill, style: true });
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this.visible;
        return getOpenSetting(this.style, undefined, key);
    }

    setSettingValue(key: string, value: any): void {
        if (key === 'visible') { this.visible = !!value; return; }
        setOpenSetting(this.style, undefined, key, value);
    }

    // ---- Serilestirme ----

    toJSON(): SerializedDrawing {
        return {
            id: this.id,
            type: this.type,
            points: this.points.map(p => ({ ...p })),
            style: { ...this.style, lineDash: [...(this.style.lineDash ?? [])] },
            state: this.state === 'selected' ? 'complete' : this.state,
            visible: this.visible,
            locked: this.locked,
        };
    }

    static fromJSON(data: SerializedDrawing): CycleToolBase {
        const d = new CycleToolBase(data.type as CycleToolType);
        restoreShapeStyle(d.style, data.style);
        Object.defineProperty(d, 'id', { value: data.id, writable: false });
        d.points = (data.points ?? []).map(p => ({ ...p }));
        d.state = data.state as DrawingState;
        d.visible = data.visible;
        d.locked = data.locked;
        return d;
    }
}

export { CycleToolBase as CyclicLinesDrawing, CycleToolBase as TimeCyclesDrawing, CycleToolBase as SineLineDrawing };
