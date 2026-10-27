/**
 * Projeksiyon ("Sector") araci:
 *   projection   (3 tik: P1 merkez, P2 yayin baslangici, P3 tarama acisini belirler)
 *
 * Geometri ekran (piksel) uzayinda hesaplanir; yaylar ekranda yuvarlak kalir (fib-circle ile ayni).
 *
 * SEKTOR   Merkez P1; birim yaricap = |P1P2|. aA = P1->P2 isini acisi, aB = P1->P3 isini acisi; tarama d = aA'dan aB'ye KISA aci
 *          (|d| <= pi, isaretli). Sektor P1->P2 isini ile P1->P3 isini arasindadir; P3'un P1'e uzakligi onemsizdir (yalnizca yon).
 * SEVIYE   Gorunen her katsayi k icin yaricapi k * |P1P2| olan, aA..aA+d arasi bir yay (varsayilan: yalniz k = 1). Katsayi etiketi yayin ortasinda.
 * DOLGU    Gorunen katsayilar artan sirayla halkalara bolunur: [0, k1] (ic sektor), [k1, k2], [k2, k3] ...  Halkalar sirayla iki renkle
 *          boyanir: ic sektor 1. renk (mavi #2962FF), sonraki halka 2. renk (mor #9C27B0), sonra yine 1. renk ... Ikisi de %20 opaklik
 *          (seffaflik 80). (TradingView'daki "ic / dis sektor" iki rengi bu yorumla karsilanir; tek seviyede yalniz ic sektor gorunur.)
 * KENAR    P1-P2 ve P1-P3 trend cizgileri (varsayilan gorunur, duz, gray400 #9598A1). Olusturma sirasinda (2 nokta) P1-P2 cizgisi gorunur.
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
import { FibCircleGeometry, FibArcGeom, angleInSweep, arcLabel, normAngle } from './fib-circle-drawing';

const GRAY400 = '#9598A1';
const BLUE = '#2962FF';
const PURPLE = '#9C27B0';
const RED = '#F23645';
const ORANGE = '#FF9800';
const GREEN = '#4CAF50';
const TEAL = '#089981';
const CYAN = '#00BCD4';
const TWO_PI = Math.PI * 2;

export const PROJECTION_LEVEL_LIMITS: LevelLimits = { max: 1000 };

const mkLevel = (level: number, visible: boolean, color: string): PitchLevel => ({ level, visible, color, lineWidth: 1, lineStyle: 'solid' as PitchLineStyle });

/** Sabit satirlar: katsayi 1 gorunur, digerleri kapali (kullanici acar / katsayisini degistirir) */
const LEVEL_TABLE: [number, string][] = [[1, GRAY400], [0.5, RED], [1.5, ORANGE], [2, GREEN], [2.5, TEAL], [3, CYAN]];
export function defaultProjectionLevels(): PitchLevel[] {
    return LEVEL_TABLE.map(([c, col], i) => mkLevel(c, i === 0, col));
}

// ----------------------------------------------------------------------------
// Saf geometri (ekran uzayi)
// ----------------------------------------------------------------------------

export interface ProjectionSpec {
    levels: PitchLevel[];
    lineWidth: number;
    lineDash: number[];
    trend: { visible: boolean; color: string; width: number; dash: number[] };
    showCoeffs: boolean;
    fill: boolean;
    transparency: number;
    innerColor: string;
    outerColor: string;
}

/** P1->P2 isinindan P1->P3 isinina isaretli kisa tarama acisi (ekran koordinatlarinda, radyan, (-pi, pi]). */
export function projectionSweep(aA: number, aB: number): number {
    let d = normAngle(aB - aA);
    if (d > Math.PI) d -= TWO_PI;
    return d;
}

export function computeProjection(p1: Pt, p2: Pt, p3: Pt | null, spec: ProjectionSpec): FibCircleGeometry {
    const out: FibCircleGeometry = { arcs: [], fills: [], lines: [], polylines: [], labels: [] };
    const unit = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const aA = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    if (p3 && unit > 1e-9 && Math.hypot(p3.x - p1.x, p3.y - p1.y) > 1e-9) {
        const d = projectionSweep(aA, Math.atan2(p3.y - p1.y, p3.x - p1.x));
        if (Math.abs(d) > 1e-9) {
            const a1 = aA + d, ccw = d < 0, mid = aA + d / 2;
            // Esit katsayilar (ilk gorunen kalir) tekillestirilir; aksi halde sifir kalinlikli halka dolgu renk dongusunu kaydirir
            const vis = spec.levels.filter(l => l.visible && Number.isFinite(l.level) && l.level > 0).sort((a, b) => a.level - b.level)
                .filter((l, i, arr) => i === 0 || l.level !== arr[i - 1].level);
            if (spec.fill) {
                vis.forEach((lv, i) => {
                    out.fills.push({
                        cx: p1.x, cy: p1.y, r0: i === 0 ? 0 : vis[i - 1].level * unit, r1: lv.level * unit, a0: aA, a1, ccw, full: false,
                        color: colorWithTransparency(i % 2 === 0 ? spec.innerColor : spec.outerColor, spec.transparency),
                    });
                });
            }
            for (const lv of vis) {
                const r = lv.level * unit;
                const arc: FibArcGeom = { level: lv.level, cx: p1.x, cy: p1.y, r, a0: aA, a1, ccw, full: false, color: lv.color, width: spec.lineWidth, dash: spec.lineDash };
                out.arcs.push(arc);
                if (spec.showCoeffs) out.labels.push(arcLabel(p1.x, p1.y, r, mid, formatFibCoeff(lv.level), lv.color));
            }
        }
    }
    // Olusturma sirasinda (P3 yok) P1-P2 cizgisi her zaman gorunur
    if (spec.trend.visible || !p3) {
        const t = spec.trend;
        out.lines.push({ a: p1, b: p2, color: t.color, width: t.width, dash: t.dash });
        if (p3 && spec.trend.visible) out.lines.push({ a: p1, b: p3, color: t.color, width: t.width, dash: t.dash });
    }
    return out;
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

export class ProjectionDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'projection';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;
    paneId?: string | null;
    intervalsVisibilities?: import('./intervals-visibility').IntervalsVisibilities;

    levels: PitchLevel[] = defaultProjectionLevels();
    showCoeffs = true;
    fillBackground = true;
    fillTransparency = 80;
    innerFillColor = BLUE;
    outerFillColor = PURPLE;
    trendLineVisible = true;
    trendLineStyle: PitchLineStyle = 'solid';

    private _previewIndex = -1;
    private _pixelPoints: Pt[] = [];
    private _geom: FibCircleGeometry = { arcs: [], fills: [], lines: [], polylines: [], labels: [] };

    constructor() {
        this.id = generateDrawingId();
        // style.color: trend cizgileri; style.lineWidth / lineDash: seviye yaylari ve trend cizgileri kalinligi
        this.style = { ...DEFAULT_DRAWING_STYLE, color: GRAY400, lineWidth: 2, lineDash: [] };
    }

    get requiredPoints(): number { return 3; }

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

    geomSpec(): ProjectionSpec {
        const dash = this.style.lineDash ?? [];
        return {
            levels: this.levels,
            lineWidth: this.style.lineWidth,
            lineDash: dash,
            trend: { visible: this.trendLineVisible, color: this.style.color, width: this.style.lineWidth, dash: dashFromLineStyle(this.trendLineStyle) ?? [] },
            showCoeffs: this.showCoeffs,
            fill: this.fillBackground,
            transparency: this.fillTransparency,
            innerColor: this.innerFillColor,
            outerColor: this.outerFillColor,
        };
    }

    /** Ekran noktalarindan (css px) geometriyi hesaplar ve onbellege yazar. */
    layout(pts: Pt[]): FibCircleGeometry {
        this._pixelPoints = pts;
        this._geom = pts.length < 2
            ? { arcs: [], fills: [], lines: [], polylines: [], labels: [] }
            : computeProjection(pts[0], pts[1], pts.length >= 3 ? pts[2] : null, this.geomSpec());
        return this._geom;
    }

    hitTest(x: number, y: number, threshold: number = 6): boolean {
        for (const a of this._geom.arcs) {
            if (Math.abs(Math.hypot(x - a.cx, y - a.cy) - a.r) > threshold) continue;
            if (angleInSweep(Math.atan2(y - a.cy, x - a.cx), a.a0, a.a1)) return true;
        }
        for (const l of this._geom.lines) {
            if (segDist(x, y, l.a, l.b) <= threshold) return true;
        }
        // Dolgu aciksa sektor ici de secilebilir
        if (this.fillBackground && this._geom.fills.length) {
            const f = this._geom.fills[this._geom.fills.length - 1];
            const dist = Math.hypot(x - f.cx, y - f.cy);
            if (dist <= f.r1 && angleInSweep(Math.atan2(y - f.cy, x - f.cx), f.a0, f.a1)) return true;
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
        const sections: SettingsSection[] = [
            { title: 'Trend line', rows: [checkboxRow('trendLineVisible', 'Trend line', true), colorRow('color', 'Color'), lineStyleRow('trendLineStyle', 'Trend Line Style')] },
            { title: 'Levels line', rows: [lineWidthRow('lineWidth'), lineStyleRow('lineStyle')] },
            { title: 'Levels', rows: [{ type: 'pitchLevels', key: 'levels', label: 'Levels', max: PROJECTION_LEVEL_LIMITS.max, lines: false } as any] },
            { title: 'Labels', rows: [checkboxRow('showCoeffs', 'Show coefficients', true)] },
            {
                title: 'Background',
                rows: [
                    checkboxRow('fillBackground', 'Background', true),
                    colorRow('innerFillColor', 'Inner color'),
                    colorRow('outerFillColor', 'Outer color'),
                    { type: 'slider', key: 'fillTransparency', label: 'Transparency', min: 0, max: 100, step: 1, unit: '%', suffix: '%' } as any,
                ],
            },
        ];
        return { tabs: [createStyleTab(sections), createVisibilityTab()] };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Trend Line Color' },
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
            case 'fillBackground': return this.fillBackground;
            case 'fillTransparency': return this.fillTransparency;
            case 'innerFillColor': return this.innerFillColor;
            case 'outerFillColor': return this.outerFillColor;
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
            case 'levels': this.levels = sanitizeLevels(value, defaultProjectionLevels(), PROJECTION_LEVEL_LIMITS); return;
            case 'showCoeffs': this.showCoeffs = !!value; return;
            case 'fillBackground': this.fillBackground = !!value; return;
            case 'fillTransparency': this.fillTransparency = clampInt(value, 0, 100, 80); return;
            case 'innerFillColor': this.innerFillColor = String(value); return;
            case 'outerFillColor': this.outerFillColor = String(value); return;
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
                fillBackground: this.fillBackground,
                fillTransparency: this.fillTransparency,
                innerFillColor: this.innerFillColor,
                outerFillColor: this.outerFillColor,
                trendLineVisible: this.trendLineVisible,
                trendLineStyle: this.trendLineStyle,
            },
        };
    }

    protected _restore(data: SerializedDrawing): void {
        Object.defineProperty(this, 'id', { value: data.id, writable: false });
        this.points = (data.points ?? []).map(p => ({ ...p }));
        this.style = { ...this.style, ...data.style, lineDash: [...(data.style?.lineDash ?? this.style.lineDash ?? [])] };
        this.state = data.state as DrawingState;
        this.visible = data.visible;
        this.locked = data.locked;
        const ext = data.ext ?? {};
        if (ext.levels !== undefined) this.levels = sanitizeLevels(ext.levels, defaultProjectionLevels(), { ...PROJECTION_LEVEL_LIMITS, keepOutOfRange: true });
        for (const k of ['showCoeffs', 'fillBackground', 'fillTransparency', 'innerFillColor', 'outerFillColor', 'trendLineVisible', 'trendLineStyle']) {
            if (ext[k] !== undefined) this.setSettingValue(k, ext[k]);
        }
    }

    static fromJSON(data: SerializedDrawing): ProjectionDrawing {
        const drawing = new ProjectionDrawing();
        drawing._restore(data);
        return drawing;
    }
}
