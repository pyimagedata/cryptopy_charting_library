/**
 * Kapali sekil araclari (Rectangle, Rotated Rectangle, Ellipse, Circle, Triangle, Arc) icin ortak:
 * varsayilanlar, dolgu (renk + seffaflik), ayar anahtarlari (modal / ozellik cubugu), metin alanlari.
 *
 * Dolgu modeli: style.fillColor (renk), style.fillOpacity (0..1 opaklik), style.fillEnabled.
 * Etkin alfa = rengin kendi alfasi x fillOpacity; boylece eski kayitlar (rgba(...,0.2) + 0.2)
 * eskisi gibi gorunur. Arayuzdeki "Seffaflik" = (1 - etkin alfa) * 100.
 */

import { DrawingStyle } from './drawing';
import {
    SettingsSection,
    AttributeBarItem,
    colorRow,
    lineWidthRow,
    lineStyleRow,
    checkboxRow,
} from './drawing-settings-config';
import { lineStyleFromDash, dashFromLineStyle } from './line-tool-common';

export type ShapeKind = 'rectangle' | 'rotatedRectangle' | 'ellipse' | 'circle' | 'triangle' | 'arc';

export interface ShapeDefaults {
    color: string;
    /** Varsayilan dolgu opakligi (1 - seffaflik) */
    fillOpacity: number;
    /** Metin ayari olan arac mi */
    text: boolean;
}

export const SHAPE_DEFAULTS: Record<ShapeKind, ShapeDefaults> = {
    rectangle: { color: '#9C27B0', fillOpacity: 0.2, text: true },
    rotatedRectangle: { color: '#4CAF50', fillOpacity: 0.2, text: false },
    ellipse: { color: '#F23645', fillOpacity: 0.2, text: true },
    circle: { color: '#FF9800', fillOpacity: 0.2, text: true },
    triangle: { color: '#089981', fillOpacity: 0.2, text: false },
    arc: { color: '#E91E63', fillOpacity: 0.2, text: false },
};

export interface ShapeStyleOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    fillColor?: string;
    fillOpacity?: number;
}

/** Yeni cizim icin baslangic stili (TradingView varsayilanlari; secenekler uzerine yazar). */
export function createShapeStyle(kind: ShapeKind, base: DrawingStyle, o: ShapeStyleOptions = {}): DrawingStyle {
    const d = SHAPE_DEFAULTS[kind];
    const color = o.color || d.color;
    const style: DrawingStyle = {
        ...base,
        color,
        lineWidth: o.lineWidth || 2,
        lineDash: o.lineDash || [],
        fillColor: o.fillColor || color,
        fillOpacity: o.fillOpacity ?? d.fillOpacity,
        fillEnabled: true,
    };
    if (d.text) {
        style.textColor = color;
        style.fontSize = 14;
        style.fontWeight = 'normal';
        style.fontStyle = 'normal';
        style.textHAlign = 'center';
        style.textVAlign = 'middle';
    }
    return style;
}

/** Kayitli stili uygular; eksik (yeni) alanlar varsayilanda kalir. */
export function restoreShapeStyle(style: DrawingStyle, saved: DrawingStyle | undefined): void {
    if (!saved) return;
    for (const [k, v] of Object.entries(saved)) {
        if (v !== undefined && v !== null) (style as any)[k] = Array.isArray(v) ? [...v] : v;
    }
    // Eski kayitlarda metin rengi yoksa kenarlik rengini kullan (yeni arac varsayilani degil)
    if (style.textColor !== undefined && !saved.textColor && saved.color) style.textColor = saved.color;
}

// ----------------------------------------------------------------------------
// Renk / dolgu
// ----------------------------------------------------------------------------

export function parseColor(c: string | undefined): { r: number; g: number; b: number; a: number } | null {
    if (!c) return null;
    const hex = /^#([a-f\d]{3}|[a-f\d]{6}|[a-f\d]{8})$/i.exec(c.trim());
    if (hex) {
        let h = hex[1];
        if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16),
            a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
        };
    }
    const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(c.trim());
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
    return null;
}

/** Etkin dolgu alfasi (0..1). */
export function shapeFillAlpha(style: DrawingStyle): number {
    const p = parseColor(style.fillColor);
    return (p ? p.a : 1) * (style.fillOpacity ?? 1);
}

/** Cizilecek dolgu rengi (rgba); dolgu kapaliysa null. */
export function shapeFillCss(style: DrawingStyle): string | null {
    if (style.fillEnabled === false || !style.fillColor) return null;
    const p = parseColor(style.fillColor);
    if (!p) return style.fillColor;
    return `rgba(${p.r}, ${p.g}, ${p.b}, ${Math.round(shapeFillAlpha(style) * 10000) / 10000})`;
}

function toHex(p: { r: number; g: number; b: number }): string {
    const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${h(p.r)}${h(p.g)}${h(p.b)}`;
}

/** Herhangi bir CSS rengini (#hex / rgb / rgba) kucuk harfli #rrggbb'ye cevirir (alfa atilir); cozulemezse null. */
export function colorToHex(c: string | undefined): string | null {
    const p = parseColor(c);
    return p ? toHex(p) : null;
}

// ----------------------------------------------------------------------------
// Ayar anahtarlari (DrawingSettingsProvider)
// ----------------------------------------------------------------------------

/** Ortak anahtarlari okur; bilinmeyen anahtar icin undefined. */
export function getShapeSetting(style: DrawingStyle, key: string): any {
    switch (key) {
        case 'color': return style.color;
        case 'lineWidth': return style.lineWidth;
        case 'lineStyle': return lineStyleFromDash(style.lineDash);
        case 'fillColor': return style.fillColor;
        case 'fillEnabled': return style.fillEnabled !== false;
        case 'fillTransparency': return Math.round((1 - shapeFillAlpha(style)) * 100);
        default: return undefined;
    }
}

/** Ortak anahtarlari yazar; islenirse true. */
export function setShapeSetting(style: DrawingStyle, key: string, value: any): boolean {
    switch (key) {
        case 'color':
            style.color = value;
            return true;
        case 'lineWidth':
            style.lineWidth = value;
            return true;
        case 'lineStyle': {
            const dash = dashFromLineStyle(value);
            if (dash) style.lineDash = dash;
            return true;
        }
        case 'fillColor': {
            // Gorunen etkin alfayi koru (eski rgba kayitlari renk degisince solmasin / koyulasmasin)
            const eff = shapeFillAlpha(style);
            const next = parseColor(value);
            style.fillColor = value;
            style.fillOpacity = Math.max(0, Math.min(1, eff / (next && next.a > 0 ? next.a : 1)));
            return true;
        }
        case 'fillEnabled':
            style.fillEnabled = !!value;
            return true;
        case 'fillTransparency': {
            const p = parseColor(style.fillColor);
            if (p) style.fillColor = toHex(p);
            style.fillOpacity = Math.max(0, Math.min(1, 1 - Number(value) / 100));
            return true;
        }
    }
    return false;
}

/** Style sekmesi bolumleri: Kenarlik + Arkaplan (ve arac ozel bolumler `extra` ile eklenir). */
export function shapeStyleSections(extra: SettingsSection[] = []): SettingsSection[] {
    return [
        {
            title: 'Border',
            rows: [
                colorRow('color', 'Border Color'),
                lineWidthRow('lineWidth'),
                lineStyleRow('lineStyle'),
            ],
        },
        {
            title: 'Background',
            rows: [
                checkboxRow('fillEnabled', 'Background', true),
                colorRow('fillColor', 'Color'),
                { type: 'slider', key: 'fillTransparency', label: 'Transparency', min: 0, max: 100, step: 1, unit: '%', suffix: '%' } as any,
            ],
        },
        ...extra,
    ];
}

export function shapeAttributeBarItems(): AttributeBarItem[] {
    return [
        { type: 'color', key: 'color', tooltip: 'Border Color' },
        { type: 'color', key: 'fillColor', tooltip: 'Background Color' },
        { type: 'lineWidth', key: 'lineWidth', tooltip: 'Border Width' },
        { type: 'lineStyle', key: 'lineStyle', tooltip: 'Border Style' },
    ];
}
