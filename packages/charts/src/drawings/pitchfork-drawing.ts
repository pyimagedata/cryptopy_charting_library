/**
 * Pitchfork ailesi: Pitchfork (Andrews), Schiff Pitchfork, Modified Schiff Pitchfork, Inside Pitchfork ve Pitchfan.
 * Bes arac tek govdeyi paylasir (PitchToolBase); 3 tik: P1, P2, P3.
 *
 * Geometri ekran (piksel) uzayinda hesaplanir (cizgiler ekranda paralel olur). M = orta nokta(P2, P3).
 *
 * PITCHFORK AILESI
 *   Medyan cizgi, bir baslangic noktasi O'dan M'den gecerek ileri dogru uzar (yon u = (M - O) / |M - O|):
 *     original (Andrews)      O = P1
 *     schiff                  O = (P1.zaman, (P1.fiyat + P2.fiyat) / 2)
 *     modifiedSchiff          O = orta nokta(P1, P2) (zaman ve fiyatta)
 *     inside                  O = orta nokta(P1, P2), yon M'ye dogru
 *                             (TradingView'in tam "Inside Pitchfork" tanimi dogrulanamadi; bu tanim geometri olarak
 *                              Modified Schiff ile ayni cizgileri uretir.)
 *   Seviye katsayisi c: medyana paralel cizgi. Medyandan P2'ye dik ofset w = (P2 - M) - ((P2 - M).u) u ise,
 *   c katsayili cizgiler medyandan +c*w (P2 tarafi) ve -c*w (P3 tarafi) uzakliktadir; c = 1, P2 ve P3'ten gecer.
 *   (P3 - M = -(P2 - M) oldugundan iki taraf simetriktir.)
 *   Cizgi baslangici (origin): M + c * (P2 - M) ve M + c * (P3 - M) (yani P2-P3 dogrusu uzerinde; c = 1 icin P2 / P3).
 *   Cizgiler origin'den u yonunde panelin disina kadar uzar; extendLines acikken geriye de uzar.
 *   Dolgu: medyan (c = 0, M noktasindan baslayarak) ve gorunur seviyeler arasinda, her iki tarafta bitisik cizgi ciftleri
 *   arasi; dis seviyenin rengiyle.
 *
 * PITCHFAN
 *   Yelpaze cizgileri P1'den baslar ve P2-P3 dogrusu uzerindeki noktalardan gecer (panel kenarina kadar uzar):
 *   medyan M'den, c katsayili cizgiler M + c * (P3 - M) ve M + c * (P2 - M) noktalarindan. Dolgu bitisik yelpaze
 *   cizgileri arasinda (ucgenler), dis cizginin rengiyle.
 *
 * Ayarlar: style.color / style.lineWidth / style.lineDash = medyan cizgisi; digerleri `ext` icinde serilestirilir
 * (extendLines ust duzey alanda).
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
import { t } from '../helpers/translations';
import { parseStrictNumber } from '../helpers/strict-number';

export type PitchToolType = 'pitchfork' | 'schiffPitchfork' | 'modifiedSchiffPitchfork' | 'insidePitchfork' | 'pitchfan';
export type PitchforkVariant = 'original' | 'schiff' | 'modifiedSchiff' | 'inside';
export type PitchLineStyle = 'solid' | 'dashed' | 'dotted';

export const PITCH_TOOL_TYPES: ReadonlySet<string> = new Set<string>(['pitchfork', 'schiffPitchfork', 'modifiedSchiffPitchfork', 'insidePitchfork', 'pitchfan']);

/** Arac tipine gore varsayilan pitchfork stili */
export const PITCHFORK_TYPE_VARIANT: Record<string, PitchforkVariant> = {
    pitchfork: 'original',
    schiffPitchfork: 'schiff',
    modifiedSchiffPitchfork: 'modifiedSchiff',
    insidePitchfork: 'inside',
};

export const PITCHFORK_VARIANTS: { value: PitchforkVariant; label: string }[] = [
    { value: 'original', label: 'Original' },
    { value: 'schiff', label: 'Schiff' },
    { value: 'modifiedSchiff', label: 'Modified Schiff' },
    { value: 'inside', label: 'Inside' },
];

/** Seviye tanimi (katsayi, gorunurluk, renk, kalinlik, stil) */
export interface PitchLevel {
    level: number;
    visible: boolean;
    color: string;
    lineWidth: number;
    lineStyle: PitchLineStyle;
}

const MEDIAN_COLOR = '#F23645';
const DEFAULT_WIDTH = 2;

/** TradingView varsayilan seviyeleri: [katsayi, gorunur, pitchfork rengi, pitchfan rengi] */
const LEVEL_TABLE: [number, boolean, string, string][] = [
    [0.25, false, '#FFB74D', '#FFB74D'],
    [0.382, false, '#81C784', '#81C784'],
    [0.5, true, '#089981', '#00BCD4'],
    [0.618, false, '#089981', '#089981'],
    [0.75, false, '#00BCD4', '#00BCD4'],
    [1, true, '#2962FF', '#2962FF'],
    [1.5, false, '#9C27B0', '#9C27B0'],
    [1.75, false, '#E91E63', '#E91E63'],
    [2, false, '#F77C80', '#F77C80'],
];

export function defaultPitchLevels(fan: boolean): PitchLevel[] {
    return LEVEL_TABLE.map(([level, visible, forkColor, fanColor]) => ({
        level, visible, color: fan ? fanColor : forkColor, lineWidth: DEFAULT_WIDTH, lineStyle: 'solid' as PitchLineStyle,
    }));
}

// ----------------------------------------------------------------------------
// Saf geometri (ekran uzayi)
// ----------------------------------------------------------------------------

export interface Pt { x: number; y: number }

export interface PitchLineGeom {
    kind: 'median' | 'level';
    level: number;
    /** -1: P3 tarafi, 0: medyan, +1: P2 tarafi */
    side: -1 | 0 | 1;
    a: Pt;
    b: Pt;
    color: string;
    width: number;
    dash: number[];
}

export interface PitchFillGeom { poly: Pt[]; color: string }

export interface PitchGeometry {
    lines: PitchLineGeom[];
    fills: PitchFillGeom[];
    /** Kesikli tutamac cizgileri: P2-P3 ve P1-M */
    handles: [Pt, Pt][];
}

export interface PitchGeomSpec {
    median: { visible: boolean; color: string; width: number; dash: number[] };
    levels: PitchLevel[];
    extend: boolean;
    fill: boolean;
    transparency: number;
    width: number;
    height: number;
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Pitchfork medyan baslangic noktasi (O) */
export function pitchforkOrigin(variant: PitchforkVariant, p1: Pt, p2: Pt): Pt {
    switch (variant) {
        case 'schiff': return { x: p1.x, y: (p1.y + p2.y) / 2 };
        case 'modifiedSchiff':
        case 'inside': return mid(p1, p2);
        default: return { x: p1.x, y: p1.y };
    }
}

/** Isin uzunlugu: panelin disina tasmaya yeter */
function reach(o: Pt, width: number, height: number): number {
    return Math.hypot(o.x - width / 2, o.y - height / 2) + Math.hypot(width, height) + 1;
}

/**
 * Iki isin arasindaki kama dolgusu (O: ortak baslangic, b1/b2: isin uclari, ikisi de O'dan `len` uzakliginda).
 * Ucgen [O, b1, b2] genis kamada paneli kapsamaz; bu yuzden her iki isina `len` uzaklikta dik olan
 * teget dogrularin kesistigi acisortay noktasi (uzaklik len / cos(theta/2)) eklenir -> 4 kosegenli cokgen.
 */
export function wedgeFillPoly(o: Pt, b1: Pt, b2: Pt, len: number): Pt[] {
    const u1x = b1.x - o.x, u1y = b1.y - o.y, u2x = b2.x - o.x, u2y = b2.y - o.y;
    const l1 = Math.hypot(u1x, u1y), l2 = Math.hypot(u2x, u2y);
    if (l1 < 1e-9 || l2 < 1e-9) return [o, b1, b2];
    const a = { x: u1x / l1, y: u1y / l1 }, b = { x: u2x / l2, y: u2y / l2 };
    let mx = a.x + b.x, my = a.y + b.y;
    const ml = Math.hypot(mx, my);
    if (ml < 1e-6) return [o, b1, b2]; // ters yonlu isinlar (kama 180 derece): dolgu tanimsiz
    mx /= ml; my /= ml;
    const cosHalf = Math.max(0.05, a.x * mx + a.y * my); // 0'a yakin acilarda tasmayi sinirla
    const r = len / cosHalf;
    return [o, b1, { x: o.x + mx * r, y: o.y + my * r }, b2];
}

function sortedVisible(levels: PitchLevel[]): PitchLevel[] {
    return levels.filter(l => l.visible && Number.isFinite(l.level) && l.level > 0).sort((a, b) => a.level - b.level);
}

/** Pitchfork ailesi geometrisi */
export function computePitchfork(variant: PitchforkVariant, p1: Pt, p2: Pt, p3: Pt, spec: PitchGeomSpec): PitchGeometry {
    const M = mid(p2, p3);
    const O = pitchforkOrigin(variant, p1, p2);
    const handles: [Pt, Pt][] = [[p2, p3], [p1, M]];
    const out: PitchGeometry = { lines: [], fills: [], handles };
    const dx = M.x - O.x, dy = M.y - O.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return out;
    const u = { x: dx / len, y: dy / len };
    const L = (o: Pt) => reach(o, spec.width, spec.height);
    const far = (o: Pt): Pt => ({ x: o.x + u.x * L(o), y: o.y + u.y * L(o) });
    const near = (o: Pt): Pt => (spec.extend ? { x: o.x - u.x * L(o), y: o.y - u.y * L(o) } : o);

    if (spec.median.visible) {
        out.lines.push({ kind: 'median', level: 0, side: 0, a: near(O), b: far(O), color: spec.median.color, width: spec.median.width, dash: spec.median.dash });
    }

    const visible = sortedVisible(spec.levels);
    for (const side of [1, -1] as const) {
        const ref = side === 1 ? p2 : p3;
        const originOf = (c: number): Pt => ({ x: M.x + c * (ref.x - M.x), y: M.y + c * (ref.y - M.y) });
        // Dolgu medyan boyunca M'den baslar (medyan origin'i O degil): kenar P2-P3 dogrusu uzerinde kalir
        let prev: { o: Pt; c: number } = { o: M, c: 0 };
        for (const lv of visible) {
            const o = originOf(lv.level);
            out.lines.push({ kind: 'level', level: lv.level, side, a: near(o), b: far(o), color: lv.color, width: lv.lineWidth, dash: dashFromLineStyle(lv.lineStyle) ?? [] });
            if (spec.fill) {
                out.fills.push({ poly: [near(prev.o), far(prev.o), far(o), near(o)], color: colorWithTransparency(lv.color, spec.transparency) });
            }
            prev = { o, c: lv.level };
        }
    }
    return out;
}

/** Pitchfan geometrisi */
export function computePitchfan(p1: Pt, p2: Pt, p3: Pt, spec: PitchGeomSpec): PitchGeometry {
    const M = mid(p2, p3);
    const handles: [Pt, Pt][] = [[p2, p3], [p1, M]];
    const out: PitchGeometry = { lines: [], fills: [], handles };
    const ray = (target: Pt): { a: Pt; b: Pt } | null => {
        const dx = target.x - p1.x, dy = target.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-9) return null;
        const l = reach(p1, spec.width, spec.height);
        return { a: p1, b: { x: p1.x + dx / len * l, y: p1.y + dy / len * l } };
    };
    const med = ray(M);
    if (med && spec.median.visible) {
        out.lines.push({ kind: 'median', level: 0, side: 0, a: med.a, b: med.b, color: spec.median.color, width: spec.median.width, dash: spec.median.dash });
    }
    const visible = sortedVisible(spec.levels);
    for (const side of [1, -1] as const) {
        const ref = side === 1 ? p2 : p3;
        let prev = med;
        for (const lv of visible) {
            const target = { x: M.x + lv.level * (ref.x - M.x), y: M.y + lv.level * (ref.y - M.y) };
            const r = ray(target);
            if (!r) continue;
            out.lines.push({ kind: 'level', level: lv.level, side, a: r.a, b: r.b, color: lv.color, width: lv.lineWidth, dash: dashFromLineStyle(lv.lineStyle) ?? [] });
            if (spec.fill && prev) {
                out.fills.push({ poly: wedgeFillPoly(p1, prev.b, r.b, reach(p1, spec.width, spec.height)), color: colorWithTransparency(lv.color, spec.transparency) });
            }
            prev = r;
        }
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

export interface LevelLimits {
    /** 0 katsayisi gecerli mi (varsayilan: hayir, katsayi > 0) */
    allowZero?: boolean;
    /** En buyuk katsayi (varsayilan 100) */
    max?: number;
}

export interface SanitizeOptions extends LevelLimits {
    /**
     * Kayitli veriyi geri yuklerken true: sonlu ama aralik disi (<=0 / >max) katsayi oldugu gibi korulur
     * (saklanan veri sessizce degistirilmez). Yeni/gecersiz girdiyi yalniz editor reddeder (false, varsayilan).
     * Sayi olmayan / sonlu olmayan katsayi her durumda varsayilana doner.
     */
    keepOutOfRange?: boolean;
}

/** Katsayi gecerli mi: sonlu, > 0 (allowZero ile >= 0) ve <= max */
export function isValidLevelCoeff(v: number, limits: LevelLimits = {}): boolean {
    return Number.isFinite(v) && (limits.allowZero ? v >= 0 : v > 0) && v <= (limits.max ?? 100);
}

export function sanitizeLevels(raw: any, fallback: PitchLevel[], limits: SanitizeOptions = {}): PitchLevel[] {
    if (!Array.isArray(raw)) return fallback.map(l => ({ ...l }));
    return raw.map((r: any, i: number) => {
        const d = fallback[i] ?? { level: 1, visible: false, color: '#787b86', lineWidth: DEFAULT_WIDTH, lineStyle: 'solid' as PitchLineStyle };
        // Siki cozumleme: "1abc" gecersiz; gecersiz / aralik disi katsayi varsayilana doner
        const rawLevel = typeof r?.level === 'number' ? r.level : typeof r?.level === 'string' ? parseStrictNumber(r.level) : NaN;
        return {
            level: (limits.keepOutOfRange ? Number.isFinite(rawLevel) : isValidLevelCoeff(rawLevel, limits)) ? rawLevel : d.level,
            visible: r?.visible === undefined ? d.visible : !!r.visible,
            color: typeof r?.color === 'string' && r.color ? r.color : d.color,
            lineWidth: clampInt(r?.lineWidth, 1, 10, d.lineWidth),
            lineStyle: r?.lineStyle === 'dashed' || r?.lineStyle === 'dotted' || r?.lineStyle === 'solid' ? r.lineStyle : d.lineStyle,
        };
    });
}

export class PitchToolBase implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType;

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;
    paneId?: string | null;
    intervalsVisibilities?: import('./intervals-visibility').IntervalsVisibilities;

    /** Pitchfork stili (type kimligi sabit kalir; stil degisince geometri degisir). Pitchfan'da kullanilmaz. */
    pitchStyle: PitchforkVariant;
    medianVisible = true;
    extendLines = false;
    fillBackground = true;
    fillTransparency = 80;
    levels: PitchLevel[];

    private _previewIndex = -1;
    private _pixelPoints: Pt[] = [];
    private _geom: PitchGeometry = { lines: [], fills: [], handles: [] };

    constructor(type: PitchToolType) {
        this.id = generateDrawingId();
        this.type = type;
        this.style = { ...DEFAULT_DRAWING_STYLE, color: MEDIAN_COLOR, lineWidth: DEFAULT_WIDTH, lineDash: [] };
        this.pitchStyle = PITCHFORK_TYPE_VARIANT[type] ?? 'original';
        this.levels = defaultPitchLevels(type === 'pitchfan');
    }

    get isFan(): boolean { return this.type === 'pitchfan'; }
    get requiredPoints(): number { return 3; }

    // ---- Nokta yonetimi (3 noktali araclar: FibChannel ile ayni onizleme akisi) ----

    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
        if (this.points.length >= 3) this.state = 'complete';
    }

    isComplete(): boolean {
        return this.points.length >= 3 && this.state !== 'creating';
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
    getGeometry(): PitchGeometry { return this._geom; }

    geomSpec(width: number, height: number): PitchGeomSpec {
        return {
            median: { visible: this.medianVisible, color: this.style.color, width: this.style.lineWidth, dash: this.style.lineDash ?? [] },
            levels: this.levels,
            extend: this.extendLines,
            fill: this.fillBackground,
            transparency: this.fillTransparency,
            width, height,
        };
    }

    /** Ekran noktalarindan (css px) geometriyi hesaplar ve onbellege yazar (3 nokta yoksa bos). */
    layout(pts: Pt[], width: number, height: number): PitchGeometry {
        this._pixelPoints = pts;
        if (pts.length < 3) {
            this._geom = { lines: [], fills: [], handles: pts.length === 2 ? [[pts[0], pts[1]]] : [] };
        } else {
            const spec = this.geomSpec(width, height);
            this._geom = this.isFan
                ? computePitchfan(pts[0], pts[1], pts[2], spec)
                : computePitchfork(this.pitchStyle, pts[0], pts[1], pts[2], spec);
        }
        return this._geom;
    }

    hitTest(x: number, y: number, threshold: number = 6): boolean {
        for (const l of this._geom.lines) {
            if (segDist(x, y, l.a, l.b) <= threshold) return true;
        }
        for (const [a, b] of this._geom.handles) {
            if (segDist(x, y, a, b) <= threshold) return true;
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
        if (!this.isFan) {
            sections.push({
                title: 'Pitchfork style',
                rows: [selectRow('pitchStyle', 'Style', PITCHFORK_VARIANTS.map(v => ({ value: v.value, label: t(v.label) })))],
            });
        }
        sections.push({
            title: 'Median',
            rows: [
                checkboxRow('medianVisible', 'Median', true),
                colorRow('color', 'Color'),
                lineWidthRow('lineWidth'),
                lineStyleRow('lineStyle'),
            ],
        });
        sections.push({ title: 'Levels', rows: [{ type: 'pitchLevels', key: 'levels', label: 'Levels' } as any] });
        if (!this.isFan) {
            sections.push({ rows: [checkboxRow('extendLines', 'Extend lines', false)] });
        }
        sections.push({
            title: 'Background',
            rows: [
                checkboxRow('fillBackground', 'Background', true),
                { type: 'slider', key: 'fillTransparency', label: 'Transparency', min: 0, max: 100, step: 1, unit: '%', suffix: '%' } as any,
            ],
        });
        return { tabs: [createStyleTab(sections), createVisibilityTab()] };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Median Color' },
            { type: 'lineWidth', key: 'lineWidth', tooltip: 'Line Width' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'pitchStyle': return this.pitchStyle;
            case 'medianVisible': return this.medianVisible;
            case 'color': return this.style.color;
            case 'lineWidth': return this.style.lineWidth;
            case 'lineStyle': return lineStyleFromDash(this.style.lineDash);
            case 'levels': return this.levels.map(l => ({ ...l }));
            case 'extendLines': return this.extendLines;
            case 'fillBackground': return this.fillBackground;
            case 'fillTransparency': return this.fillTransparency;
            case 'visible': return this.visible;
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'pitchStyle':
                if (PITCHFORK_VARIANTS.some(v => v.value === value)) this.pitchStyle = value;
                return;
            case 'medianVisible': this.medianVisible = !!value; return;
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
            case 'levels': this.levels = sanitizeLevels(value, defaultPitchLevels(this.isFan)); return;
            case 'extendLines': this.extendLines = !!value; return;
            case 'fillBackground': this.fillBackground = !!value; return;
            case 'fillTransparency': this.fillTransparency = clampInt(value, 0, 100, 80); return;
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
            extendLines: this.extendLines,
            ext: {
                pitchStyle: this.pitchStyle,
                medianVisible: this.medianVisible,
                fillBackground: this.fillBackground,
                fillTransparency: this.fillTransparency,
                levels: this.levels.map(l => ({ ...l })),
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
        this.extendLines = !!data.extendLines;
        const ext = data.ext ?? {};
        if (PITCHFORK_VARIANTS.some(v => v.value === ext.pitchStyle)) this.pitchStyle = ext.pitchStyle;
        if (ext.medianVisible !== undefined) this.medianVisible = !!ext.medianVisible;
        if (ext.fillBackground !== undefined) this.fillBackground = !!ext.fillBackground;
        if (ext.fillTransparency !== undefined) this.fillTransparency = clampInt(ext.fillTransparency, 0, 100, 80);
        if (ext.levels !== undefined) this.levels = sanitizeLevels(ext.levels, defaultPitchLevels(this.isFan), { keepOutOfRange: true });
    }

    static fromJSON(data: SerializedDrawing): PitchToolBase {
        const drawing = new PitchToolBase(data.type as PitchToolType);
        drawing._restore(data);
        return drawing;
    }
}

/** Ayri adlarla (okunabilirlik): pitchfork ailesi ve pitchfan ayni sinifi paylasir, tip kimligi ayirir. */
export { PitchToolBase as PitchforkDrawing, PitchToolBase as PitchfanDrawing };
