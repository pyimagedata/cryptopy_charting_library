/**
 * Formasyon araclari (XABCD, Cypher, ABCD, Head & Shoulders, Triangle Pattern, Three Drives) icin ortak:
 * TradingView varsayilanlari, stil olusturma / geri yukleme, ayar anahtarlari (modal / ozellik cubugu),
 * oran hesaplari.
 *
 * Dolgu modeli shape-common ile ayni: style.fillColor + style.fillOpacity + style.fillEnabled.
 * Metin: style.textColor / fontSize / fontWeight / fontStyle (etiketler cizgi renginde yuvarlak kutu icinde cizilir).
 */

import { DrawingStyle, DrawingPoint, DrawingState, SerializedDrawing } from './drawing';
import {
    SettingsSection,
    AttributeBarItem,
    colorRow,
    lineWidthRow,
    lineStyleRow,
    checkboxRow,
    numberRow,
} from './drawing-settings-config';
import { getShapeSetting, setShapeSetting } from './shape-common';

export type PatternKind = 'xabcd' | 'cypher' | 'abcd' | 'headShoulders' | 'triangle' | 'threeDrives';

export interface PatternDefaults {
    color: string;
    /** Arka plan dolgusu olan arac mi */
    fill: boolean;
}

/** TradingView paleti: mavi #2962FF, turkuaz #089981, mor #673AB7 */
export const PATTERN_DEFAULTS: Record<PatternKind, PatternDefaults> = {
    xabcd: { color: '#2962FF', fill: true },
    cypher: { color: '#2962FF', fill: true },
    abcd: { color: '#089981', fill: false },
    headShoulders: { color: '#089981', fill: true },
    triangle: { color: '#673AB7', fill: true },
    threeDrives: { color: '#673AB7', fill: false },
};

/** Varsayilan dolgu opakligi (seffaflik %85) */
export const PATTERN_FILL_OPACITY = 0.15;

export interface PatternStyleOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    fillColor?: string;
    fillOpacity?: number;
}

/** Yeni cizim icin baslangic stili (secenekler uzerine yazar). */
export function createPatternStyle(kind: PatternKind, base: DrawingStyle, o: PatternStyleOptions = {}): DrawingStyle {
    const d = PATTERN_DEFAULTS[kind];
    const color = o.color || d.color;
    const style: DrawingStyle = {
        ...base,
        color,
        lineWidth: o.lineWidth || 2,
        lineDash: o.lineDash || [],
        textColor: '#FFFFFF',
        fontSize: 12,
        fontWeight: 'normal',
        fontStyle: 'normal',
    };
    if (d.fill) {
        style.fillColor = o.fillColor || color;
        style.fillOpacity = o.fillOpacity ?? PATTERN_FILL_OPACITY;
        style.fillEnabled = true;
    } else {
        style.fillColor = undefined;
        style.fillOpacity = undefined;
    }
    return style;
}

/**
 * Kayitli stili uygular; eksik (yeni) alanlar varsayilanda kalir.
 * Eski kayitlarda fillColor var ama fillOpacity yok (rengin kendi alfasi kullaniliyordu): opaklik 1 sayilir,
 * boylece eski dolgu eskisi gibi gorunur.
 */
export function restorePatternStyle(style: DrawingStyle, saved: DrawingStyle | undefined): void {
    if (!saved) return;
    for (const [k, v] of Object.entries(saved)) {
        if (v !== undefined && v !== null) (style as any)[k] = Array.isArray(v) ? [...v] : v;
    }
    if (saved.fillColor && saved.fillOpacity === undefined) style.fillOpacity = undefined;
}

/** Ortak serilestirme sonrasi alanlari uygular (fromJSON). */
export function applySerializedPattern(
    drawing: { points: DrawingPoint[]; state: DrawingState; visible: boolean; locked: boolean; style: DrawingStyle },
    data: SerializedDrawing
): void {
    Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
    restorePatternStyle(drawing.style, data.style);
    drawing.points = [...data.points];
    drawing.state = data.state;
    drawing.visible = data.visible;
    drawing.locked = data.locked;
}

// ----------------------------------------------------------------------------
// Ayar anahtarlari
// ----------------------------------------------------------------------------

export function getPatternSetting(style: DrawingStyle, key: string): any {
    switch (key) {
        case 'textColor': return style.textColor || '#FFFFFF';
        case 'fontSize': return style.fontSize ?? 12;
        case 'bold': return style.fontWeight === 'bold';
        case 'italic': return style.fontStyle === 'italic';
        default: return getShapeSetting(style, key);
    }
}

export function setPatternSetting(style: DrawingStyle, key: string, value: any): void {
    switch (key) {
        case 'textColor': style.textColor = value; return;
        case 'fontSize': {
            const n = Number(value);
            if (isFinite(n) && n > 0) style.fontSize = n;
            return;
        }
        case 'bold': style.fontWeight = value ? 'bold' : 'normal'; return;
        case 'italic': style.fontStyle = value ? 'italic' : 'normal'; return;
        default: setShapeSetting(style, key, value);
    }
}

export function patternStyleSections(hasFill: boolean): SettingsSection[] {
    const sections: SettingsSection[] = [
        {
            title: 'Line',
            rows: [colorRow('color', 'Color'), lineWidthRow('lineWidth'), lineStyleRow('lineStyle')],
        },
    ];
    if (hasFill) {
        sections.push({
            title: 'Background',
            rows: [
                checkboxRow('fillEnabled', 'Background', true),
                colorRow('fillColor', 'Color'),
                { type: 'slider', key: 'fillTransparency', label: 'Transparency', min: 0, max: 100, step: 1, unit: '%', suffix: '%' } as any,
            ],
        });
    }
    sections.push({
        title: 'Text',
        rows: [
            colorRow('textColor', 'Text Color'),
            numberRow('fontSize', 'Font Size', { min: 8, max: 40, step: 1 }),
            checkboxRow('bold', 'Bold'),
            checkboxRow('italic', 'Italic'),
        ],
    });
    return sections;
}

export function patternAttributeBarItems(hasFill: boolean): AttributeBarItem[] {
    const items: AttributeBarItem[] = [{ type: 'color', key: 'color', tooltip: 'Line Color' }];
    if (hasFill) items.push({ type: 'color', key: 'fillColor', tooltip: 'Fill Color' });
    items.push({ type: 'lineWidth', key: 'lineWidth', tooltip: 'Line Width' });
    items.push({ type: 'lineStyle', key: 'lineStyle', tooltip: 'Line Style' });
    return items;
}

// ----------------------------------------------------------------------------
// Oranlar (yalnizca fiyat farklarina dayanir)
// ----------------------------------------------------------------------------

export interface XABCDRatios {
    /** AB / XA */
    xb: number | null;
    /** BC / AB */
    ac: number | null;
    /** CD / BC */
    bd: number | null;
    /** AD / XA */
    xd: number | null;
}

export interface CypherRatios {
    /** AB / XA (B, XA'nin geri cekilmesi) */
    xb: number | null;
    /** XC / XA (C, XA'nin uzantisi; X'ten C'ye mesafe) */
    xc: number | null;
    /** CD / XC (D, XC'nin geri cekilmesi) */
    xd: number | null;
}

const RATIO_DISPLAY_CAP = 99.999;

/** |num| / |den|; null when not finite or when den is negligible relative to num (avoids absurd values). */
export function ratio(num: number, den: number): number | null {
    if (!Number.isFinite(num) || !Number.isFinite(den)) return null;
    if (Math.abs(den) < 1e-9 * Math.max(Math.abs(num), 1)) return null;
    const r = Math.abs(num) / Math.abs(den);
    return Number.isFinite(r) ? Math.min(r, RATIO_DISPLAY_CAP) : null;
}

export interface ThreeDrivesRatios {
    /** |P1P2| / |P0P1| (retracement of drive 1) */
    retrace1: number | null;
    /** |P3P4| / |P2P3| (retracement of drive 2) */
    retrace2: number | null;
    /** |P2P3| / |P1P2| (drive 2 extension of retracement 1) */
    ext1: number | null;
    /** |P4P5| / |P3P4| (drive 3 extension of retracement 2) */
    ext2: number | null;
}

/**
 * Three Drives ratios. points: P0..P6, PiPj = price(Pj) - price(Pi).
 * Drive 1 = P0->P1, retrace 1 = P1->P2, drive 2 = P2->P3, retrace 2 = P3->P4, drive 3 = P4->P5.
 *   retrace1 = |P1P2| / |P0P1|     retrace2 = |P3P4| / |P2P3|
 *   ext1     = |P2P3| / |P1P2|     ext2     = |P4P5| / |P3P4|
 */
export function threeDrivesRatios(p: DrawingPoint[]): ThreeDrivesRatios {
    const d = (i: number, j: number) => p[j].price - p[i].price;
    const r: ThreeDrivesRatios = { retrace1: null, retrace2: null, ext1: null, ext2: null };
    if (p.length >= 3) r.retrace1 = ratio(d(1, 2), d(0, 1));
    if (p.length >= 4) r.ext1 = ratio(d(2, 3), d(1, 2));
    if (p.length >= 5) r.retrace2 = ratio(d(3, 4), d(2, 3));
    if (p.length >= 6) r.ext2 = ratio(d(4, 5), d(3, 4));
    return r;
}

/** points: X, A, B, C, D (eksik noktalar icin null). */
export function xabcdRatios(p: DrawingPoint[]): XABCDRatios {
    const r: XABCDRatios = { xb: null, ac: null, bd: null, xd: null };
    if (p.length >= 3) r.xb = ratio(p[2].price - p[1].price, p[1].price - p[0].price);
    if (p.length >= 4) r.ac = ratio(p[3].price - p[2].price, p[2].price - p[1].price);
    if (p.length >= 5) {
        r.bd = ratio(p[4].price - p[3].price, p[3].price - p[2].price);
        r.xd = ratio(p[4].price - p[1].price, p[1].price - p[0].price);
    }
    return r;
}

/** points: X, A, B, C, D. */
export function cypherRatios(p: DrawingPoint[]): CypherRatios {
    const r: CypherRatios = { xb: null, xc: null, xd: null };
    if (p.length >= 3) r.xb = ratio(p[2].price - p[1].price, p[1].price - p[0].price);
    if (p.length >= 4) r.xc = ratio(p[3].price - p[0].price, p[1].price - p[0].price);
    if (p.length >= 5) r.xd = ratio(p[4].price - p[3].price, p[3].price - p[0].price);
    return r;
}
