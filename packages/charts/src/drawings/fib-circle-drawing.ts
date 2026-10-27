/**
 * Dairesel Fibonacci araclari (tek govde: FibCircleToolBase):
 *   fibSpeedResistanceArcs   Fib Hiz Direnc Yaylari   (2 tik: P1 merkez, P2)
 *   fibCircles               Fib Daireleri            (2 tik: P1, P2 = 1.0 dairesinin capi)
 *   fibSpiral                Fib Spirali              (2 tik: P1 merkez, P2 baslangic yaricapi/acisi)
 *   fibWedge                 Fib Kama                 (3 tik: P1 tepe, P2, P3 kamanin iki kenari)
 *
 * Geometri ekran (piksel) uzayinda hesaplanir: daireler ekranda her zaman yuvarlak kalir, fiyat/zaman
 * eksenleriyle olceklenmez (TradingView'daki gibi). Yaricap, P1-P2 piksel uzakligindan turetilir.
 *
 * YAYLAR   Merkez P1, yaricap = seviye * |P1P2|. Varsayilan olarak yari daire: P2'nin dikey yonundeki yari
 *          duzlem (P2 yukaridaysa ust yari, asagidaysa alt yari). fullCircles: tam daire.
 * DAIRELER Merkez = orta(P1,P2), yaricap = seviye * |P1P2| / 2. coeffsAsPercents: etiketler yuzde.
 * SPIRAL   Altin logaritmik spiral r(t) = r0 * phi^(t / (pi/2)); r0 = |P1P2|, baslangic acisi P2'nin acisi.
 *          Varsayilan yon ekranda saat yonu; counterclockwise ile ters. Panel disina cikana kadar cizilir.
 *          Not: baslangic yaricapi r0 panelin en uzak kosesine olan mesafeden (maxR) buyukse spiral panele hic girmez
 *          ve hicbir sey cizilmez (kabul edilen davranis; spiralPoints tek nokta dondurur, polyline uretilmez).
 * KAMA     Merkez P1; P1->P2 ve P1->P3 isinlari arasindaki (kisa aci) yaylar, yaricap = seviye * |P1P2|.
 *          Kenarlar P1-P2 ve P1-P3 trend cizgileri; dolgu komsu yaylar arasindaki kama dilimi.
 *          Olusturma sirasinda yalnizca 2 nokta varken P1-P2 trend cizgisi cizilir (trendLineVisible'dan bagimsiz geri bildirim).
 *
 * Renderer, panele degmeyen yaylari / dolgulari atlar (devasa dairelerde yavas kesikli cizgiyi onler): bkz. circleMeetsRect, ringMeetsRect.
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
    SettingsSection,
    createStyleTab,
    createVisibilityTab,
    colorRow,
    lineWidthRow,
    lineStyleRow,
    checkboxRow,
} from './drawing-settings-config';
import { lineStyleFromDash, dashFromLineStyle } from './line-tool-common';
import { colorWithTransparency } from './volume-tools-common';
import { PitchLevel, PitchLineStyle, Pt, LevelLimits, sanitizeLevels } from './pitchfork-drawing';
import { formatFibCoeff } from './fib-time-drawing';

export type FibCircleToolType = 'fibSpeedResistanceArcs' | 'fibCircles' | 'fibSpiral' | 'fibWedge';
export const FIB_CIRCLE_TOOL_TYPES: ReadonlySet<string> = new Set<string>(['fibSpeedResistanceArcs', 'fibCircles', 'fibSpiral', 'fibWedge']);

const GRAY = '#808080';
const RED = '#F23645';
const ORANGE = '#FF9800';
const TEAL = '#089981';
const GREEN = '#4CAF50';
const CYAN = '#00BCD4';
const BLUE = '#2962FF';
const PINK = '#E91E63';
const DEEP_PURPLE = '#673AB7';

export const PHI = (1 + Math.sqrt(5)) / 2;
const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;

/** Katsayilar > 0 */
export const FIB_CIRCLE_LEVEL_LIMITS: LevelLimits = { max: 1000 };

const mkLevel = (level: number, visible: boolean, color: string): PitchLevel => ({ level, visible, color, lineWidth: 1, lineStyle: 'solid' as PitchLineStyle });

/** Yaylar ve Daireler: 11 seviye, hepsi gorunur */
const ARC_TABLE: [number, string][] = [
    [0.236, RED], [0.382, ORANGE], [0.5, TEAL], [0.618, GREEN], [0.786, CYAN], [1, GRAY],
    [1.618, BLUE], [2.618, PINK], [3.618, BLUE], [4.236, PINK], [4.618, RED],
];
export function defaultArcLevels(): PitchLevel[] {
    return ARC_TABLE.map(([c, col]) => mkLevel(c, true, col));
}

/** Kama: ilk 6 gorunur; renkler kirmizi, turuncu, yesil, teal, camgobegi, gri, mavi, koyu mor, pembe, ... (dizi basa doner) */
const WEDGE_LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618, 3.618, 4.236, 4.618];
const WEDGE_COLORS = [RED, ORANGE, GREEN, TEAL, CYAN, GRAY, BLUE, DEEP_PURPLE, PINK];
export function defaultWedgeLevels(): PitchLevel[] {
    return WEDGE_LEVELS.map((c, i) => mkLevel(c, i < 6, WEDGE_COLORS[i % WEDGE_COLORS.length]));
}

export function defaultCircleLevels(type: FibCircleToolType): PitchLevel[] {
    return type === 'fibWedge' ? defaultWedgeLevels() : type === 'fibSpiral' ? [] : defaultArcLevels();
}

// ----------------------------------------------------------------------------
// Saf geometri (ekran uzayi)
// ----------------------------------------------------------------------------

export interface FibArcGeom {
    level: number;
    cx: number;
    cy: number;
    r: number;
    /** Baslangic / bitis acisi (ekran koordinatinda atan2(dy, dx); bitis = baslangic + tarama). */
    a0: number;
    a1: number;
    /** a1 < a0 (canvas anticlockwise) */
    ccw: boolean;
    full: boolean;
    color: string;
    width: number;
    dash: number[];
}

export interface FibRingFill {
    cx: number;
    cy: number;
    r0: number;
    r1: number;
    a0: number;
    a1: number;
    ccw: boolean;
    full: boolean;
    color: string;
}

export interface FibLineGeom { a: Pt; b: Pt; color: string; width: number; dash: number[] }
export interface FibPolylineGeom { pts: Pt[]; color: string; width: number; dash: number[] }
export interface FibCircleLabelGeom { text: string; x: number; y: number; align: CanvasTextAlign; baseline: CanvasTextBaseline; color: string }

export interface FibCircleGeometry {
    arcs: FibArcGeom[];
    fills: FibRingFill[];
    lines: FibLineGeom[];
    polylines: FibPolylineGeom[];
    labels: FibCircleLabelGeom[];
}

export interface FibCircleSpec {
    levels: PitchLevel[];
    lineWidth: number;
    lineDash: number[];
    trend: { visible: boolean; color: string; width: number; dash: number[] };
    showCoeffs: boolean;
    asPercents: boolean;
    fill: boolean;
    transparency: number;
    fullCircles: boolean;
    counterclockwise: boolean;
    /** Spiral cizgisi */
    line: { color: string; width: number; dash: number[] };
    width: number;
    height: number;
}

const emptyGeom = (): FibCircleGeometry => ({ arcs: [], fills: [], lines: [], polylines: [], labels: [] });

function visibleLevels(levels: PitchLevel[]): PitchLevel[] {
    return levels.filter(l => l.visible && Number.isFinite(l.level) && l.level > 0).sort((a, b) => a.level - b.level);
}

export function arcLabel(cx: number, cy: number, r: number, ang: number, text: string, color: string): FibCircleLabelGeom {
    const c = Math.cos(ang), s = Math.sin(ang);
    const rr = r + 6;
    return {
        text, x: cx + rr * c, y: cy + rr * s, color,
        align: c > 0.3 ? 'left' : c < -0.3 ? 'right' : 'center',
        baseline: s > 0.3 ? 'top' : s < -0.3 ? 'bottom' : 'middle',
    };
}

export function normAngle(a: number): number {
    const m = a % TWO_PI;
    return m < 0 ? m + TWO_PI : m;
}

/** Aci, [a0, a1] taramasi (a1 < a0 olabilir) icinde mi? */
export function angleInSweep(ang: number, a0: number, a1: number): boolean {
    const s = a1 - a0;
    if (Math.abs(s) >= TWO_PI - 1e-9) return true;
    return s >= 0 ? normAngle(ang - a0) <= s : normAngle(a0 - ang) <= -s;
}

/**
 * Ortak yay uretici: ayni merkezli, seviyeye gore yaricapli yaylar + komsu yaylar arasi dolgu + etiketler.
 * unit: seviye 1'in yaricapi (piksel).
 */
function concentricArcs(cx: number, cy: number, unit: number, a0: number, a1: number, full: boolean, spec: FibCircleSpec, out: FibCircleGeometry): void {
    if (!(unit > 1e-9)) return;
    const vis = visibleLevels(spec.levels);
    const ccw = a1 < a0;
    const mid = (a0 + a1) / 2;
    for (const lv of vis) {
        const r = lv.level * unit;
        if (!Number.isFinite(r)) continue;
        out.arcs.push({ level: lv.level, cx, cy, r, a0, a1, ccw, full, color: lv.color, width: spec.lineWidth, dash: spec.lineDash });
        if (spec.showCoeffs) {
            const text = spec.asPercents ? formatFibCoeff(lv.level * 100) + '%' : formatFibCoeff(lv.level);
            out.labels.push(arcLabel(cx, cy, r, full ? -HALF_PI : mid, text, lv.color));
        }
    }
    if (spec.fill) {
        for (let i = 1; i < vis.length; i++) {
            out.fills.push({
                cx, cy, r0: vis[i - 1].level * unit, r1: vis[i].level * unit, a0, a1, ccw, full,
                color: colorWithTransparency(vis[i].color, spec.transparency),
            });
        }
    }
}

function trendSegments(pts: Pt[], spec: FibCircleSpec, out: FibCircleGeometry): void {
    if (!spec.trend.visible) return;
    for (const [i, j] of pts.length >= 3 ? [[0, 1], [0, 2]] : [[0, 1]]) {
        if (pts[i] && pts[j]) out.lines.push({ a: pts[i], b: pts[j], color: spec.trend.color, width: spec.trend.width, dash: spec.trend.dash });
    }
}

export function computeFibArcs(p1: Pt, p2: Pt, spec: FibCircleSpec): FibCircleGeometry {
    const out = emptyGeom();
    const unit = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const up = p2.y <= p1.y;
    // Ust yari: pi -> 2pi (ekranda yukari), alt yari: 0 -> pi
    concentricArcs(p1.x, p1.y, unit, up ? Math.PI : 0, up ? TWO_PI : Math.PI, spec.fullCircles, spec, out);
    trendSegments([p1, p2], spec, out);
    return out;
}

export function computeFibCircles(p1: Pt, p2: Pt, spec: FibCircleSpec): FibCircleGeometry {
    const out = emptyGeom();
    const unit = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2;
    concentricArcs((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, unit, 0, TWO_PI, true, spec, out);
    trendSegments([p1, p2], spec, out);
    return out;
}

/** Spiral noktalari (merkez c, baslangic yaricapi r0, baslangic acisi a0); maxR'ye ulasana kadar */
export function spiralPoints(c: Pt, r0: number, a0: number, ccw: boolean, maxR: number): Pt[] {
    const pts: Pt[] = [];
    if (!(r0 > 1e-6) || !(maxR > r0)) return r0 > 1e-6 ? [{ x: c.x + r0 * Math.cos(a0), y: c.y + r0 * Math.sin(a0) }] : pts;
    const k = Math.log(PHI) / HALF_PI; // r = r0 * exp(k * t)
    const tEnd = Math.log(maxR / r0) / k;
    const step = 0.04;
    const n = Math.min(8000, Math.ceil(tEnd / step));
    const dir = ccw ? -1 : 1;
    for (let i = 0; i <= n; i++) {
        const t = Math.min(tEnd, i * step);
        const r = r0 * Math.exp(k * t);
        const a = a0 + dir * t;
        pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
    }
    return pts;
}

export function computeFibSpiral(p1: Pt, p2: Pt, spec: FibCircleSpec): FibCircleGeometry {
    const out = emptyGeom();
    const r0 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (!(r0 > 1e-6)) return out;
    const a0 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const maxR = Math.max(
        Math.hypot(p1.x, p1.y), Math.hypot(spec.width - p1.x, p1.y),
        Math.hypot(p1.x, spec.height - p1.y), Math.hypot(spec.width - p1.x, spec.height - p1.y),
    ) + 2;
    const pts = spiralPoints(p1, r0, a0, spec.counterclockwise, maxR);
    if (pts.length >= 2) out.polylines.push({ pts, color: spec.line.color, width: spec.line.width, dash: spec.line.dash });
    return out;
}

export function computeFibWedge(p1: Pt, p2: Pt, p3: Pt, spec: FibCircleSpec): FibCircleGeometry {
    const out = emptyGeom();
    const unit = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const aA = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const aB = Math.atan2(p3.y - p1.y, p3.x - p1.x);
    let d = normAngle(aB - aA);
    if (d > Math.PI) d -= TWO_PI; // kisa aci
    if (Math.hypot(p3.x - p1.x, p3.y - p1.y) > 1e-9 && Math.abs(d) > 1e-9) {
        concentricArcs(p1.x, p1.y, unit, aA, aA + d, false, spec, out);
    }
    trendSegments([p1, p2, p3], spec, out);
    return out;
}

/** Merkezin (cx, cy) panel dikdortgenine [0,w]x[0,h] en kisa ve en uzak mesafesi (kose) */
export function rectDistRange(cx: number, cy: number, w: number, h: number): { min: number; max: number } {
    const dx = cx < 0 ? -cx : cx > w ? cx - w : 0;
    const dy = cy < 0 ? -cy : cy > h ? cy - h : 0;
    const max = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
    return { min: Math.hypot(dx, dy), max };
}

/** Cember (cizgi kalinligi pad) panele degiyor mu? Yaricap < en kisa mesafe ya da > en uzak kose ise degmez. */
export function circleMeetsRect(cx: number, cy: number, r: number, w: number, h: number, pad = 0): boolean {
    const d = rectDistRange(cx, cy, w, h);
    return r >= d.min - pad && r <= d.max + pad;
}

/** Halka (r0..r1) panelin bir kismini kapliyor mu? Kucuk disk panele ulasmiyorsa (r1 < min) ya da halkanin deligi tum paneli iceriyorsa (r0 > max) kapsamaz. */
export function ringMeetsRect(cx: number, cy: number, r0: number, r1: number, w: number, h: number): boolean {
    const d = rectDistRange(cx, cy, w, h);
    return r1 >= d.min && r0 <= d.max;
}

function segDist(px: number, py: number, a: Pt, b: Pt): number {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

// ----------------------------------------------------------------------------
// Cizim sinifi
// ----------------------------------------------------------------------------

const clampInt = (v: any, lo: number, hi: number, d: number): number => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};
const LINE_STYLES = ['solid', 'dashed', 'dotted'];

export class FibCircleToolBase implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType;

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;
    paneId?: string | null;
    intervalsVisibilities?: import('./intervals-visibility').IntervalsVisibilities;

    levels: PitchLevel[];
    showCoeffs = true;
    coeffsAsPercents = false;
    fillBackground = true;
    fillTransparency = 80;
    fullCircles = false;
    counterclockwise = false;
    trendLineVisible = true;
    trendLineStyle: PitchLineStyle;

    private _previewIndex = -1;
    private _pixelPoints: Pt[] = [];
    private _geom: FibCircleGeometry = emptyGeom();

    constructor(type: FibCircleToolType) {
        this.id = generateDrawingId();
        this.type = type;
        // style.color: trend cizgisi (Spiral'de spiral cizgisi); style.lineWidth: seviye yayi (Spiral'de spiral) kalinligi
        this.style = type === 'fibSpiral'
            ? { ...DEFAULT_DRAWING_STYLE, color: CYAN, lineWidth: 2, lineDash: [] }
            : { ...DEFAULT_DRAWING_STYLE, color: GRAY, lineWidth: 1, lineDash: [] };
        this.levels = defaultCircleLevels(type);
        this.trendLineStyle = type === 'fibWedge' ? 'solid' : 'dashed';
    }

    get isSpiral(): boolean { return this.type === 'fibSpiral'; }
    get requiredPoints(): number { return this.type === 'fibWedge' ? 3 : 2; }

    // ---- Nokta yonetimi ----

    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
        if (this.points.length >= this.requiredPoints) this.state = 'complete';
    }

    isComplete(): boolean {
        return this.points.length >= this.requiredPoints && this.state !== 'creating';
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

    confirmPreviewPoint(): void {
        this._previewIndex = -1;
    }

    // ---- Geometri / hit-test ----

    getPixelPoints(): Pt[] { return this._pixelPoints; }
    setPixelPoints(pts: Pt[]): void { this._pixelPoints = pts; }
    getGeometry(): FibCircleGeometry { return this._geom; }

    geomSpec(width: number, height: number): FibCircleSpec {
        const dash = this.style.lineDash ?? [];
        return {
            levels: this.levels,
            lineWidth: this.style.lineWidth,
            lineDash: dash,
            trend: { visible: this.trendLineVisible, color: this.style.color, width: this.style.lineWidth, dash: dashFromLineStyle(this.trendLineStyle) ?? [] },
            showCoeffs: this.showCoeffs,
            asPercents: this.type === 'fibCircles' && this.coeffsAsPercents,
            fill: this.fillBackground,
            transparency: this.fillTransparency,
            fullCircles: this.fullCircles,
            counterclockwise: this.counterclockwise,
            line: { color: this.style.color, width: this.style.lineWidth, dash },
            width, height,
        };
    }

    /** Ekran noktalarindan (css px) geometriyi hesaplar ve onbellege yazar. */
    layout(pts: Pt[], width: number, height: number): FibCircleGeometry {
        this._pixelPoints = pts;
        const spec = this.geomSpec(width, height);
        if (pts.length < 2) this._geom = emptyGeom();
        else if (this.type === 'fibSpeedResistanceArcs') this._geom = computeFibArcs(pts[0], pts[1], spec);
        else if (this.type === 'fibCircles') this._geom = computeFibCircles(pts[0], pts[1], spec);
        else if (this.type === 'fibSpiral') this._geom = computeFibSpiral(pts[0], pts[1], spec);
        else if (pts.length >= 3) this._geom = computeFibWedge(pts[0], pts[1], pts[2], spec);
        else {
            // Kama olusturulurken (2 nokta): P1-P2 trend cizgisi
            this._geom = emptyGeom();
            trendSegments([pts[0], pts[1]], { ...spec, trend: { ...spec.trend, visible: true } }, this._geom);
        }
        return this._geom;
    }

    hitTest(x: number, y: number, threshold: number = 6): boolean {
        for (const a of this._geom.arcs) {
            if (Math.abs(Math.hypot(x - a.cx, y - a.cy) - a.r) > threshold) continue;
            if (a.full || angleInSweep(Math.atan2(y - a.cy, x - a.cx), a.a0, a.a1)) return true;
        }
        for (const l of this._geom.lines) {
            if (segDist(x, y, l.a, l.b) <= threshold) return true;
        }
        for (const pl of this._geom.polylines) {
            for (let i = 1; i < pl.pts.length; i++) {
                if (segDist(x, y, pl.pts[i - 1], pl.pts[i]) <= threshold) return true;
            }
        }
        for (const p of this._pixelPoints) {
            if (Math.hypot(x - p.x, y - p.y) <= threshold) return true;
        }
        return false;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length < 2) return null;
        const xs = this._pixelPoints.map(p => p.x);
        const ys = this._pixelPoints.map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    // ---- Ayarlar ----

    getSettingsConfig(): DrawingSettingsConfig {
        const sections: SettingsSection[] = [];
        if (this.isSpiral) {
            sections.push({
                title: 'Line',
                rows: [colorRow('color', 'Color'), lineWidthRow('lineWidth'), lineStyleRow('lineStyle'), checkboxRow('counterclockwise', 'Counterclockwise', false)],
            });
        } else {
            sections.push({
                title: 'Trend line',
                rows: [checkboxRow('trendLineVisible', 'Trend line', true), colorRow('color', 'Color'), lineStyleRow('trendLineStyle', 'Trend Line Style')],
            });
            sections.push({ title: 'Levels line', rows: [lineWidthRow('lineWidth'), lineStyleRow('lineStyle')] });
            sections.push({ title: 'Levels', rows: [{ type: 'pitchLevels', key: 'levels', label: 'Levels', max: FIB_CIRCLE_LEVEL_LIMITS.max, lines: false } as any] });
            const labelRows: any[] = [checkboxRow('showCoeffs', 'Show coefficients', true)];
            if (this.type === 'fibCircles') labelRows.push(checkboxRow('coeffsAsPercents', 'Coefficients as percents', false));
            sections.push({ title: 'Labels', rows: labelRows });
            if (this.type === 'fibSpeedResistanceArcs') sections.push({ rows: [checkboxRow('fullCircles', 'Full circles', false)] });
            sections.push({
                title: 'Background',
                rows: [
                    checkboxRow('fillBackground', 'Background', true),
                    { type: 'slider', key: 'fillTransparency', label: 'Transparency', min: 0, max: 100, step: 1, unit: '%', suffix: '%' } as any,
                ],
            });
        }
        return { tabs: [createStyleTab(sections), createVisibilityTab()] };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: this.isSpiral ? 'Line Color' : 'Trend Line Color' },
            { type: 'lineWidth', key: 'lineWidth', tooltip: 'Line Width' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'color': return this.style.color;
            case 'lineWidth': return this.style.lineWidth;
            case 'lineStyle': return lineStyleFromDash(this.style.lineDash);
            case 'trendLineStyle': return this.trendLineStyle;
            case 'trendLineVisible': return this.trendLineVisible;
            case 'levels': return this.levels.map(l => ({ ...l }));
            case 'showCoeffs': return this.showCoeffs;
            case 'coeffsAsPercents': return this.coeffsAsPercents;
            case 'fillBackground': return this.fillBackground;
            case 'fillTransparency': return this.fillTransparency;
            case 'fullCircles': return this.fullCircles;
            case 'counterclockwise': return this.counterclockwise;
            case 'visible': return this.visible;
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'color': this.style.color = String(value); return;
            case 'lineWidth': {
                const n = Number(value);
                if (Number.isFinite(n) && n > 0) this.style.lineWidth = Math.min(10, n);
                return;
            }
            case 'lineStyle': {
                const dash = dashFromLineStyle(value);
                if (dash) this.style.lineDash = dash;
                return;
            }
            case 'trendLineStyle': if (LINE_STYLES.includes(value)) this.trendLineStyle = value; return;
            case 'trendLineVisible': this.trendLineVisible = !!value; return;
            case 'levels': this.levels = sanitizeLevels(value, defaultCircleLevels(this.type as FibCircleToolType), FIB_CIRCLE_LEVEL_LIMITS); return;
            case 'showCoeffs': this.showCoeffs = !!value; return;
            case 'coeffsAsPercents': this.coeffsAsPercents = !!value; return;
            case 'fillBackground': this.fillBackground = !!value; return;
            case 'fillTransparency': this.fillTransparency = clampInt(value, 0, 100, 80); return;
            case 'fullCircles': this.fullCircles = !!value; return;
            case 'counterclockwise': this.counterclockwise = !!value; return;
            case 'visible': this.visible = !!value; return;
        }
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
            ext: {
                levels: this.levels.map(l => ({ ...l })),
                showCoeffs: this.showCoeffs,
                coeffsAsPercents: this.coeffsAsPercents,
                fillBackground: this.fillBackground,
                fillTransparency: this.fillTransparency,
                fullCircles: this.fullCircles,
                counterclockwise: this.counterclockwise,
                trendLineVisible: this.trendLineVisible,
                trendLineStyle: this.trendLineStyle,
            },
        };
    }

    protected _restore(data: SerializedDrawing): void {
        Object.defineProperty(this, 'id', { value: data.id, writable: false });
        this.points = (data.points ?? []).map(p => ({ ...p }));
        this.style = { ...this.style, ...data.style };
        this.state = data.state as DrawingState;
        this.visible = data.visible;
        this.locked = data.locked;
        const ext = data.ext ?? {};
        const keys = ['levels', 'showCoeffs', 'coeffsAsPercents', 'fillBackground', 'fillTransparency', 'fullCircles', 'counterclockwise', 'trendLineVisible', 'trendLineStyle'];
        for (const k of keys) {
            if (ext[k] === undefined) continue;
            if (k === 'levels' && this.isSpiral) continue;
            this.setSettingValue(k, ext[k]);
        }
    }

    static fromJSON(data: SerializedDrawing): FibCircleToolBase {
        const drawing = new FibCircleToolBase(data.type as FibCircleToolType);
        drawing._restore(data);
        return drawing;
    }
}

export { FibCircleToolBase as FibSpeedResistanceArcsDrawing, FibCircleToolBase as FibCirclesDrawing, FibCircleToolBase as FibSpiralDrawing, FibCircleToolBase as FibWedgeDrawing };
