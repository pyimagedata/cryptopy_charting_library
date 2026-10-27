/**
 * Zaman tabanli Fibonacci araclari (tek govde: FibTimeToolBase):
 *   fibTimeZone              Fib Zaman Bolgesi            (2 tik: P1, P2)
 *   trendBasedFibTime        Trend Tabanli Fib Zamani     (3 tik: P1, P2, P3)
 *   fibSpeedResistanceFan    Fib Hiz Direnc Yelpazesi     (2 tik: P1 orijin, P2 kutu kosesi)
 *
 * Geometri ekran (piksel) uzayinda hesaplanir. Ekranda x ekseni bar indeksiyle dogrusal oldugundan
 * "bar birimi" cinsinden olcum pikselde dogrudan oranla yapilir (veri bosluklari/ileri zamanlar dahil).
 *
 * FIB ZAMAN BOLGESI
 *   Birim = P2.x - P1.x. n katsayili dikey cizgi: x = P1.x + n * birim, n = 0,1,2,3,5,8,13,21,34,55,89
 *   (her satirin gorunurlugu / rengi / katsayisi duzenlenebilir). Cizgiler panel yuksekligince uzar.
 *
 * TREND TABANLI FIB ZAMANI
 *   x = P3.x + k * (P2.x - P1.x), k seviye katsayisi. Trend cizgileri P1-P2 ve P2-P3 (kesikli).
 *
 * FIB HIZ DIRENC YELPAZESI
 *   dx = P2.x - P1.x, dy = P2.y - P1.y (reverse: orijin P2, dx/dy ters isaretli -> seviyeler P2 tarafindan olculur).
 *   Orijin O'dan her zaman-seviyesi v icin (O.x + v*dx, O.y + dy) ve her fiyat-seviyesi h icin
 *   (O.x + dx, O.y + h*dy) noktalarindan gecen isinlar panel kenarina kadar uzar. Kutu (O, O+d) icinde
 *   her seviye icin dikey / yatay izgara cizgileri bulunur. Dolgu, aci sirasina gore komsu isinlar arasinda
 *   (iki isinin yuksek katsayili olaninin rengiyle; genis kamalar icin wedgeFillPoly).
 *   Ust/alt etiketler zaman seviyelerini, sol/sag etiketler fiyat seviyelerini yazar.
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
    selectRow,
} from './drawing-settings-config';
import { lineStyleFromDash, dashFromLineStyle } from './line-tool-common';
import { colorWithTransparency } from './volume-tools-common';
import { PitchLevel, PitchLineStyle, Pt, LevelLimits, sanitizeLevels, wedgeFillPoly } from './pitchfork-drawing';
import { t } from '../helpers/translations';

export type FibTimeToolType = 'fibTimeZone' | 'trendBasedFibTime' | 'fibSpeedResistanceFan';
export const FIB_TIME_TOOL_TYPES: ReadonlySet<string> = new Set<string>(['fibTimeZone', 'trendBasedFibTime', 'fibSpeedResistanceFan']);

export type FibTimeHAlign = 'left' | 'center' | 'right';
export type FibTimeVAlign = 'top' | 'middle' | 'bottom';

const GRAY = '#808080';
const RED = '#F23645';
const GREEN300 = '#81C784';
const GREEN = '#4CAF50';
const TEAL = '#089981';
const CYAN = '#00BCD4';
const BLUE = '#2962FF';
const PINK = '#E91E63';
const PURPLE = '#9C27B0';
const DEEP_PURPLE = '#673AB7';
const ORANGE = '#FF9800';

/** Seviye katsayilari 0 ve ustu kabul eder (0 = baslangic cizgisi) */
export const FIB_TIME_LEVEL_LIMITS: LevelLimits = { allowZero: true, max: 1000 };

const mkLevel = (level: number, visible: boolean, color: string): PitchLevel => ({ level, visible, color, lineWidth: 1, lineStyle: 'solid' as PitchLineStyle });

/** Fib Zaman Bolgesi: Fibonacci dizisi; renkler palet uzerinde sirayla (gri, kirmizi, turuncu, acik yesil, yesil, teal, camgobegi, mavi, pembe, mor, koyu mor) */
const TIME_ZONE_TABLE: [number, string][] = [
    [0, GRAY], [1, RED], [2, ORANGE], [3, GREEN300], [5, GREEN], [8, TEAL], [13, CYAN], [21, BLUE], [34, PINK], [55, PURPLE], [89, DEEP_PURPLE],
];
export function defaultTimeZoneLevels(): PitchLevel[] {
    return TIME_ZONE_TABLE.map(([c, col]) => mkLevel(c, true, col));
}

/** Trend Tabanli Fib Zamani: TradingView varsayilanlari */
const TREND_TIME_TABLE: [number, boolean, string][] = [
    [0, true, GRAY], [0.382, true, RED], [0.5, false, GREEN300], [0.618, true, GREEN], [1, true, TEAL], [1.382, true, CYAN],
    [1.618, true, GRAY], [2, true, BLUE], [2.382, true, PINK], [2.618, true, PURPLE], [3, true, DEEP_PURPLE],
];
export function defaultTrendTimeLevels(): PitchLevel[] {
    return TREND_TIME_TABLE.map(([c, v, col]) => mkLevel(c, v, col));
}

/** Hiz Direnc Yelpazesi: hem fiyat hem zaman seviyeleri */
const FAN_TABLE: [number, string][] = [[0, GRAY], [0.25, ORANGE], [0.382, CYAN], [0.5, GREEN], [0.618, TEAL], [0.75, BLUE], [1, GRAY]];
export function defaultFanLevels(): PitchLevel[] {
    return FAN_TABLE.map(([c, col]) => mkLevel(c, true, col));
}

// ----------------------------------------------------------------------------
// Saf geometri (ekran uzayi)
// ----------------------------------------------------------------------------

export interface FibTimeLineGeom {
    kind: 'level' | 'ray' | 'grid' | 'trend';
    level: number;
    a: Pt;
    b: Pt;
    color: string;
    width: number;
    dash: number[];
}

export interface FibTimeLabelGeom {
    text: string;
    x: number;
    y: number;
    align: CanvasTextAlign;
    baseline: CanvasTextBaseline;
    color: string;
}

export interface FibTimeGeometry {
    lines: FibTimeLineGeom[];
    fills: { poly: Pt[]; color: string }[];
    labels: FibTimeLabelGeom[];
}

export interface FibTimeSpec {
    levels: PitchLevel[];
    hlevels: PitchLevel[];
    vlevels: PitchLevel[];
    lineColor: string;
    lineWidth: number;
    lineDash: number[];
    showLabels: boolean;
    labelH: FibTimeHAlign;
    labelV: FibTimeVAlign;
    fill: boolean;
    transparency: number;
    trend: { visible: boolean; color: string; width: number; dash: number[] };
    grid: { visible: boolean; color: string; width: number };
    showTopLabels: boolean;
    showBottomLabels: boolean;
    showLeftLabels: boolean;
    showRightLabels: boolean;
    reverse: boolean;
    width: number;
    height: number;
}

export function formatFibCoeff(v: number): string {
    return String(Number(v.toFixed(3)));
}

const PAD = 4;

function valid(levels: PitchLevel[]): PitchLevel[] {
    return levels.filter(l => l.visible && Number.isFinite(l.level) && l.level >= 0);
}

function verticalLabel(x: number, text: string, color: string, spec: FibTimeSpec): FibTimeLabelGeom {
    let px = x, align: CanvasTextAlign = 'left';
    if (spec.labelH === 'right') { px = x + PAD; align = 'left'; }
    else if (spec.labelH === 'left') { px = x - PAD; align = 'right'; }
    else { align = 'center'; }
    let py: number, baseline: CanvasTextBaseline;
    if (spec.labelV === 'top') { py = PAD; baseline = 'top'; }
    else if (spec.labelV === 'middle') { py = spec.height / 2; baseline = 'middle'; }
    else { py = spec.height - PAD; baseline = 'bottom'; }
    return { text, x: px, y: py, align, baseline, color };
}

/** Dikey seviye cizgileri (Zaman Bolgesi ve Trend Tabanli Zaman ortak) + dolgu + etiket */
function verticalLevels(xOf: (c: number) => number, spec: FibTimeSpec, out: FibTimeGeometry): void {
    const vis = valid(spec.levels);
    const dash = spec.lineDash;
    for (const lv of vis) {
        const x = xOf(lv.level);
        out.lines.push({ kind: 'level', level: lv.level, a: { x, y: 0 }, b: { x, y: spec.height }, color: lv.color, width: spec.lineWidth, dash });
        if (spec.showLabels) out.labels.push(verticalLabel(x, formatFibCoeff(lv.level), lv.color, spec));
    }
    if (spec.fill) {
        const sorted = [...vis].sort((a, b) => a.level - b.level);
        for (let i = 1; i < sorted.length; i++) {
            const x0 = xOf(sorted[i - 1].level), x1 = xOf(sorted[i].level);
            out.fills.push({
                poly: [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: spec.height }, { x: x0, y: spec.height }],
                color: colorWithTransparency(sorted[i].color, spec.transparency),
            });
        }
    }
}

function trendLines(pts: Pt[], spec: FibTimeSpec, out: FibTimeGeometry): void {
    if (!spec.trend.visible) return;
    for (let i = 1; i < pts.length; i++) {
        out.lines.push({ kind: 'trend', level: 0, a: pts[i - 1], b: pts[i], color: spec.trend.color, width: spec.trend.width, dash: spec.trend.dash });
    }
}

export function computeFibTimeZone(p1: Pt, p2: Pt, spec: FibTimeSpec): FibTimeGeometry {
    const out: FibTimeGeometry = { lines: [], fills: [], labels: [] };
    const unit = p2.x - p1.x;
    verticalLevels(c => p1.x + c * unit, spec, out);
    trendLines([p1, p2], spec, out);
    return out;
}

export function computeTrendBasedFibTime(pts: Pt[], spec: FibTimeSpec): FibTimeGeometry {
    const out: FibTimeGeometry = { lines: [], fills: [], labels: [] };
    if (pts.length >= 3) {
        const unit = pts[1].x - pts[0].x;
        verticalLevels(c => pts[2].x + c * unit, spec, out);
    }
    trendLines(pts.slice(0, 3), spec, out);
    return out;
}

function fanReach(o: Pt, width: number, height: number): number {
    return Math.hypot(o.x - width / 2, o.y - height / 2) + Math.hypot(width, height) + 1;
}

export function computeFibSpeedFan(p1: Pt, p2: Pt, spec: FibTimeSpec): FibTimeGeometry {
    const out: FibTimeGeometry = { lines: [], fills: [], labels: [] };
    const o = spec.reverse ? p2 : p1;
    const e = spec.reverse ? p1 : p2;
    const dx = e.x - o.x, dy = e.y - o.y;
    const L = fanReach(o, spec.width, spec.height);
    const gridColor = spec.grid.color;
    const vis = { h: valid(spec.hlevels), v: valid(spec.vlevels) };

    // Izgara (kutu icinde)
    if (spec.grid.visible) {
        for (const lv of vis.v) {
            const x = o.x + lv.level * dx;
            out.lines.push({ kind: 'grid', level: lv.level, a: { x, y: o.y }, b: { x, y: e.y }, color: gridColor, width: spec.grid.width, dash: [] });
        }
        for (const lv of vis.h) {
            const y = o.y + lv.level * dy;
            out.lines.push({ kind: 'grid', level: lv.level, a: { x: o.x, y }, b: { x: e.x, y }, color: gridColor, width: spec.grid.width, dash: [] });
        }
    }

    // Isinlar
    interface Ray { level: number; color: string; ang: number; b: Pt }
    const rays: Ray[] = [];
    const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
    const addRay = (target: Pt, level: number, color: string) => {
        const vx = target.x - o.x, vy = target.y - o.y;
        const len = Math.hypot(vx, vy);
        if (len < 1e-9) return;
        const b = { x: o.x + vx / len * L, y: o.y + vy / len * L };
        // Yatay seviye-0 ekseninden olculen aci (tum isinlar ayni 90 derecelik kadranda)
        const ang = Math.atan2(vy * sy, vx * sx);
        rays.push({ level, color, ang, b });
        out.lines.push({ kind: 'ray', level, a: o, b, color, width: spec.lineWidth, dash: spec.lineDash });
    };
    // Birebir ayni isin (ornegin 1 / 1) iki kez cizilmez
    const dup = (target: Pt) => {
        const vx = target.x - o.x, vy = target.y - o.y;
        const len = Math.hypot(vx, vy);
        if (len < 1e-9) return false;
        const ang = Math.atan2(vy * sy, vx * sx);
        return rays.some(r => Math.abs(r.ang - ang) < 1e-9);
    };
    for (const lv of vis.h) {
        const target = { x: o.x + dx, y: o.y + lv.level * dy };
        if (!dup(target)) addRay(target, lv.level, lv.color);
    }
    for (const lv of vis.v) {
        const target = { x: o.x + lv.level * dx, y: o.y + dy };
        if (!dup(target)) addRay(target, lv.level, lv.color);
    }

    if (spec.fill && rays.length > 1) {
        const sorted = [...rays].sort((a, b) => a.ang - b.ang);
        for (let i = 1; i < sorted.length; i++) {
            const a = sorted[i - 1], b = sorted[i];
            const color = b.level >= a.level ? b.color : a.color;
            out.fills.push({ poly: wedgeFillPoly(o, a.b, b.b, L), color: colorWithTransparency(color, spec.transparency) });
        }
    }

    // Etiketler
    const top = Math.min(o.y, e.y), bottom = Math.max(o.y, e.y);
    const left = Math.min(o.x, e.x), right = Math.max(o.x, e.x);
    for (const lv of vis.v) {
        const x = o.x + lv.level * dx;
        const text = formatFibCoeff(lv.level);
        if (spec.showTopLabels) out.labels.push({ text, x, y: top - PAD, align: 'center', baseline: 'bottom', color: lv.color });
        if (spec.showBottomLabels) out.labels.push({ text, x, y: bottom + PAD, align: 'center', baseline: 'top', color: lv.color });
    }
    for (const lv of vis.h) {
        const y = o.y + lv.level * dy;
        const text = formatFibCoeff(lv.level);
        if (spec.showLeftLabels) out.labels.push({ text, x: left - PAD, y, align: 'right', baseline: 'middle', color: lv.color });
        if (spec.showRightLabels) out.labels.push({ text, x: right + PAD, y, align: 'left', baseline: 'middle', color: lv.color });
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

const H_ALIGNS: FibTimeHAlign[] = ['left', 'center', 'right'];
const V_ALIGNS: FibTimeVAlign[] = ['top', 'middle', 'bottom'];
const LINE_STYLES = ['solid', 'dashed', 'dotted'];

export class FibTimeToolBase implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType;

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;
    paneId?: string | null;
    intervalsVisibilities?: import('./intervals-visibility').IntervalsVisibilities;

    /** Zaman Bolgesi / Trend Tabanli Zaman seviyeleri */
    levels: PitchLevel[];
    /** Yelpaze fiyat (hlevels) ve zaman (vlevels) seviyeleri */
    hlevels: PitchLevel[] = [];
    vlevels: PitchLevel[] = [];
    showLabels = true;
    labelH: FibTimeHAlign = 'right';
    labelV: FibTimeVAlign = 'bottom';
    fillBackground: boolean;
    fillTransparency = 80;
    trendLineVisible = true;
    trendLineStyle: PitchLineStyle = 'dashed';
    // Yelpaze
    gridVisible = true;
    gridWidth = 1;
    showTopLabels = true;
    showBottomLabels = true;
    showLeftLabels = true;
    showRightLabels = true;
    reverse = false;

    private _previewIndex = -1;
    private _pixelPoints: Pt[] = [];
    private _geom: FibTimeGeometry = { lines: [], fills: [], labels: [] };

    constructor(type: FibTimeToolType) {
        this.id = generateDrawingId();
        this.type = type;
        // style.color: Zaman Bolgesi / Trend Tabanli'da trend cizgisi rengi, Yelpaze'de izgara rengi; style.lineWidth: seviye/isin kalinligi
        this.style = { ...DEFAULT_DRAWING_STYLE, color: GRAY, lineWidth: 1, lineDash: [] };
        this.levels = type === 'trendBasedFibTime' ? defaultTrendTimeLevels() : type === 'fibTimeZone' ? defaultTimeZoneLevels() : [];
        if (type === 'fibSpeedResistanceFan') {
            this.hlevels = defaultFanLevels();
            this.vlevels = defaultFanLevels();
        }
        this.fillBackground = type !== 'fibTimeZone';
    }

    get isFan(): boolean { return this.type === 'fibSpeedResistanceFan'; }
    get requiredPoints(): number { return this.type === 'trendBasedFibTime' ? 3 : 2; }

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
    getGeometry(): FibTimeGeometry { return this._geom; }

    geomSpec(width: number, height: number): FibTimeSpec {
        return {
            levels: this.levels,
            hlevels: this.hlevels,
            vlevels: this.vlevels,
            lineColor: this.style.color,
            lineWidth: this.style.lineWidth,
            lineDash: this.style.lineDash ?? [],
            showLabels: this.showLabels,
            labelH: this.labelH,
            labelV: this.labelV,
            fill: this.fillBackground,
            transparency: this.fillTransparency,
            trend: { visible: this.trendLineVisible, color: this.style.color, width: this.style.lineWidth, dash: dashFromLineStyle(this.trendLineStyle) ?? [] },
            grid: { visible: this.gridVisible, color: this.style.color, width: this.gridWidth },
            showTopLabels: this.showTopLabels,
            showBottomLabels: this.showBottomLabels,
            showLeftLabels: this.showLeftLabels,
            showRightLabels: this.showRightLabels,
            reverse: this.reverse,
            width, height,
        };
    }

    /** Ekran noktalarindan (css px) geometriyi hesaplar ve onbellege yazar. */
    layout(pts: Pt[], width: number, height: number): FibTimeGeometry {
        this._pixelPoints = pts;
        const spec = this.geomSpec(width, height);
        if (this.type === 'trendBasedFibTime') {
            this._geom = computeTrendBasedFibTime(pts, spec);
        } else if (pts.length < 2) {
            this._geom = { lines: [], fills: [], labels: [] };
        } else if (this.type === 'fibTimeZone') {
            this._geom = computeFibTimeZone(pts[0], pts[1], spec);
        } else {
            this._geom = computeFibSpeedFan(pts[0], pts[1], spec);
        }
        return this._geom;
    }

    hitTest(x: number, y: number, threshold: number = 6): boolean {
        for (const l of this._geom.lines) {
            if (segDist(x, y, l.a, l.b) <= threshold) return true;
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

    private _defaultLevels(key: string): PitchLevel[] {
        if (key === 'levels') return this.type === 'trendBasedFibTime' ? defaultTrendTimeLevels() : defaultTimeZoneLevels();
        return defaultFanLevels();
    }

    getSettingsConfig(): DrawingSettingsConfig {
        const levelsRow = (key: string, label: string) => ({ type: 'pitchLevels', key, label, allowZero: true, max: FIB_TIME_LEVEL_LIMITS.max, lines: false } as any);
        const bg: SettingsSection = {
            title: 'Background',
            rows: [
                checkboxRow('fillBackground', 'Background', this.type !== 'fibTimeZone'),
                { type: 'slider', key: 'fillTransparency', label: 'Transparency', min: 0, max: 100, step: 1, unit: '%', suffix: '%' } as any,
            ],
        };
        const sections: SettingsSection[] = [];
        if (this.isFan) {
            sections.push({ title: 'Rays', rows: [lineWidthRow('lineWidth'), lineStyleRow('lineStyle')] });
            sections.push({ title: 'Grid', rows: [checkboxRow('gridVisible', 'Grid', true), colorRow('color', 'Color'), lineWidthRow('gridWidth', 'Grid Width')] });
            sections.push({ title: 'Price levels', rows: [levelsRow('hlevels', 'Price levels')] });
            sections.push({ title: 'Time levels', rows: [levelsRow('vlevels', 'Time levels')] });
            sections.push({
                title: 'Labels',
                rows: [
                    checkboxRow('showTopLabels', 'Top labels', true),
                    checkboxRow('showBottomLabels', 'Bottom labels', true),
                    checkboxRow('showLeftLabels', 'Left labels', true),
                    checkboxRow('showRightLabels', 'Right labels', true),
                ],
            });
            sections.push({ rows: [checkboxRow('reverse', 'Reverse', false)] });
        } else {
            sections.push({
                title: 'Trend line',
                rows: [checkboxRow('trendLineVisible', 'Trend line', true), colorRow('color', 'Color'), lineStyleRow('trendLineStyle', 'Trend Line Style')],
            });
            sections.push({ title: 'Levels line', rows: [lineWidthRow('lineWidth'), lineStyleRow('lineStyle')] });
            sections.push({ title: 'Levels', rows: [levelsRow('levels', 'Levels')] });
            sections.push({
                title: 'Labels',
                rows: [
                    checkboxRow('showLabels', this.type === 'trendBasedFibTime' ? 'Show coefficients' : 'Show labels', true),
                    selectRow('labelH', 'Labels Horizontal', [
                        { value: 'left', label: t('Left') },
                        { value: 'center', label: t('Center') },
                        { value: 'right', label: t('Right') },
                    ]),
                    selectRow('labelV', 'Labels Vertical', [
                        { value: 'top', label: t('Top') },
                        { value: 'middle', label: t('Middle') },
                        { value: 'bottom', label: t('Bottom') },
                    ]),
                ],
            });
        }
        sections.push(bg);
        return { tabs: [createStyleTab(sections), createVisibilityTab()] };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: this.isFan ? 'Grid Color' : 'Trend Line Color' },
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
            case 'hlevels': return this.hlevels.map(l => ({ ...l }));
            case 'vlevels': return this.vlevels.map(l => ({ ...l }));
            case 'showLabels': return this.showLabels;
            case 'labelH': return this.labelH;
            case 'labelV': return this.labelV;
            case 'fillBackground': return this.fillBackground;
            case 'fillTransparency': return this.fillTransparency;
            case 'gridVisible': return this.gridVisible;
            case 'gridWidth': return this.gridWidth;
            case 'showTopLabels': return this.showTopLabels;
            case 'showBottomLabels': return this.showBottomLabels;
            case 'showLeftLabels': return this.showLeftLabels;
            case 'showRightLabels': return this.showRightLabels;
            case 'reverse': return this.reverse;
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
            case 'levels': this.levels = sanitizeLevels(value, this._defaultLevels('levels'), FIB_TIME_LEVEL_LIMITS); return;
            case 'hlevels': this.hlevels = sanitizeLevels(value, this._defaultLevels('hlevels'), FIB_TIME_LEVEL_LIMITS); return;
            case 'vlevels': this.vlevels = sanitizeLevels(value, this._defaultLevels('vlevels'), FIB_TIME_LEVEL_LIMITS); return;
            case 'showLabels': this.showLabels = !!value; return;
            case 'labelH': if (H_ALIGNS.includes(value)) this.labelH = value; return;
            case 'labelV': if (V_ALIGNS.includes(value)) this.labelV = value; return;
            case 'fillBackground': this.fillBackground = !!value; return;
            case 'fillTransparency': this.fillTransparency = clampInt(value, 0, 100, 80); return;
            case 'gridVisible': this.gridVisible = !!value; return;
            case 'gridWidth': this.gridWidth = clampInt(value, 1, 10, 1); return;
            case 'showTopLabels': this.showTopLabels = !!value; return;
            case 'showBottomLabels': this.showBottomLabels = !!value; return;
            case 'showLeftLabels': this.showLeftLabels = !!value; return;
            case 'showRightLabels': this.showRightLabels = !!value; return;
            case 'reverse': this.reverse = !!value; return;
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
                hlevels: this.hlevels.map(l => ({ ...l })),
                vlevels: this.vlevels.map(l => ({ ...l })),
                showLabels: this.showLabels,
                labelH: this.labelH,
                labelV: this.labelV,
                fillBackground: this.fillBackground,
                fillTransparency: this.fillTransparency,
                trendLineVisible: this.trendLineVisible,
                trendLineStyle: this.trendLineStyle,
                gridVisible: this.gridVisible,
                gridWidth: this.gridWidth,
                showTopLabels: this.showTopLabels,
                showBottomLabels: this.showBottomLabels,
                showLeftLabels: this.showLeftLabels,
                showRightLabels: this.showRightLabels,
                reverse: this.reverse,
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
        // Seviye tablolari ve diger ayarlar setSettingValue ile (dogrulama/sinirlama ayni)
        const keys = [
            'levels', 'hlevels', 'vlevels', 'showLabels', 'labelH', 'labelV', 'fillBackground', 'fillTransparency', 'trendLineVisible',
            'trendLineStyle', 'gridVisible', 'gridWidth', 'showTopLabels', 'showBottomLabels', 'showLeftLabels', 'showRightLabels', 'reverse',
        ];
        for (const k of keys) {
            if (ext[k] === undefined) continue;
            if ((k === 'levels' && this.isFan) || ((k === 'hlevels' || k === 'vlevels') && !this.isFan)) continue;
            this.setSettingValue(k, ext[k]);
        }
    }

    static fromJSON(data: SerializedDrawing): FibTimeToolBase {
        const drawing = new FibTimeToolBase(data.type as FibTimeToolType);
        drawing._restore(data);
        return drawing;
    }
}

export { FibTimeToolBase as FibTimeZoneDrawing, FibTimeToolBase as TrendBasedFibTimeDrawing, FibTimeToolBase as FibSpeedResistanceFanDrawing };
