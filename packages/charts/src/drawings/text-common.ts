/**
 * Metin / not araclari (Text, Callout, Price Label, Arrow Mark, Arrow Marker) icin ortak:
 * TradingView paleti, yazi tipi, arka plan (renk + opaklik), kenarlik, kelime kaydirma ve ayar anahtarlari.
 */

import { parseColor, colorToHex } from './shape-common';
import {
    SettingsSection,
    colorRow,
    checkboxRow,
    selectRow,
    numberRow,
    groupRow,
    textareaRow,
    lineWidthRow,
} from './drawing-settings-config';

/** TradingView paleti */
export const TV_COLORS = {
    blue: '#2962FF',
    blue600: '#1E53E5',
    teal: '#089981',
    red600: '#CC2F3C',
    cyan700: '#0097A7',
    gray550: '#707070',
    white: '#FFFFFF',
};

export const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, sans-serif';

export const FONT_SIZES = [10, 11, 12, 14, 16, 20, 24, 28, 32, 40, 48];

export function fontSizeOptions(): { value: string; label: string }[] {
    return FONT_SIZES.map(s => ({ value: String(s), label: String(s) }));
}

export function cssFont(size: number, bold: boolean, italic: boolean): string {
    return `${italic ? 'italic' : 'normal'} ${bold ? 'bold' : 'normal'} ${size}px ${FONT_FAMILY}`;
}

/** Rengi (hex / rgb / rgba) verilen opaklikla rgba() metnine cevirir; cozulemezse oldugu gibi doner. */
export function withAlpha(color: string, alpha: number): string {
    const p = parseColor(color);
    if (!p) return color;
    const a = Math.max(0, Math.min(1, alpha));
    return `rgba(${p.r}, ${p.g}, ${p.b}, ${Math.round(a * 10000) / 10000})`;
}

// ----------------------------------------------------------------------------
// Kelime kaydirma
// ----------------------------------------------------------------------------

/**
 * Metni `maxWidth` pikseli asmayacak sekilde satirlara boler. Mevcut satir sonlari korunur;
 * kelimeler sigmazsa bir sonraki satira gecer, tek basina sigmayan kelime karakter karakter bolunur.
 * `measure` bir satirin piksel genisligini verir.
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
    const out: string[] = [];
    const limit = Math.max(1, maxWidth);
    for (const paragraph of String(text ?? '').split('\n')) {
        if (paragraph === '' || measure(paragraph) <= limit) { out.push(paragraph); continue; }
        let line = '';
        for (const word of paragraph.split(' ')) {
            const candidate = line === '' ? word : line + ' ' + word;
            if (measure(candidate) <= limit) { line = candidate; continue; }
            if (line !== '') { out.push(line); line = ''; }
            if (measure(word) <= limit) { line = word; continue; }
            // Tek basina sigmayan kelime: karakter bazinda bol
            let chunk = '';
            for (const ch of word) {
                if (chunk !== '' && measure(chunk + ch) > limit) { out.push(chunk); chunk = ch; }
                else chunk += ch;
            }
            line = chunk;
        }
        out.push(line);
    }
    return out;
}

// ----------------------------------------------------------------------------
// Metin kutusu ayarlari (Text / Callout)
// ----------------------------------------------------------------------------

export interface TextBoxState {
    fontSize: number;
    bold: boolean;
    italic: boolean;
    /** Arka plan rengi (alfa disinda) ve opakligi (0..1) */
    bgColor: string;
    bgOpacity: number;
    bgVisible: boolean;
    borderColor: string;
    borderWidth: number;
    borderVisible: boolean;
    wrap: boolean;
    wrapWidth: number;
    /** Eski kayit: noktanin metin kutusunun ortasinda oldugu duzen (yeni: sol ust) */
    legacy: boolean;
}

export interface TextBoxDefaults {
    bgColor: string;
    bgOpacity: number;
    bgVisible: boolean;
    borderColor: string;
    borderWidth: number;
    borderVisible: boolean;
}

export const TEXT_BOX_DEFAULTS: TextBoxDefaults = {
    bgColor: TV_COLORS.blue,
    bgOpacity: 0.25,
    bgVisible: false,
    borderColor: TV_COLORS.gray550,
    borderWidth: 1,
    borderVisible: false,
};

export const CALLOUT_BOX_DEFAULTS: TextBoxDefaults = {
    bgColor: TV_COLORS.cyan700,
    bgOpacity: 0.7,
    bgVisible: true,
    borderColor: TV_COLORS.cyan700,
    borderWidth: 2,
    borderVisible: true,
};

export function createTextBoxState(d: TextBoxDefaults): TextBoxState {
    return {
        fontSize: 14, bold: false, italic: false,
        bgColor: d.bgColor, bgOpacity: d.bgOpacity, bgVisible: d.bgVisible,
        borderColor: d.borderColor, borderWidth: d.borderWidth, borderVisible: d.borderVisible,
        wrap: false, wrapWidth: 200, legacy: false,
    };
}

/** Arka plan CSS rengi (rgba) */
export function textBoxBackgroundCss(s: TextBoxState): string {
    return withAlpha(s.bgColor, s.bgOpacity);
}

export function getTextBoxSetting(s: TextBoxState, key: string): any {
    switch (key) {
        case 'fontSize': return String(s.fontSize);
        case 'bold': return s.bold;
        case 'italic': return s.italic;
        case 'backgroundColor': return s.bgColor;
        case 'backgroundTransparency': return Math.round((1 - s.bgOpacity) * 100);
        case 'backgroundVisible': return s.bgVisible;
        case 'borderColor': return s.borderColor;
        case 'borderWidth': return s.borderWidth;
        case 'borderVisible': return s.borderVisible;
        case 'wrap': return s.wrap;
        case 'wrapWidth': return s.wrapWidth;
        default: return undefined;
    }
}

/** Anahtari yazar; islenirse true. */
export function setTextBoxSetting(s: TextBoxState, key: string, value: any): boolean {
    switch (key) {
        case 'fontSize': { const n = parseInt(value); if (n > 0) s.fontSize = n; return true; }
        case 'bold': s.bold = !!value; return true;
        case 'italic': s.italic = !!value; return true;
        case 'backgroundColor': {
            const p = parseColor(value);
            if (p) {
                s.bgColor = colorToHex(value) || s.bgColor;
                // Renk secici hex verir (opaklik korunur); acikca saydam bir rgba verildiyse onu uygula
                if (p.a < 1) s.bgOpacity = p.a;
            }
            return true;
        }
        case 'backgroundTransparency':
            s.bgOpacity = Math.max(0, Math.min(1, 1 - Number(value) / 100));
            return true;
        case 'backgroundVisible': s.bgVisible = !!value; return true;
        case 'borderColor': s.borderColor = colorToHex(value) || value; return true;
        case 'borderWidth': s.borderWidth = Number(value) || 1; return true;
        case 'borderVisible': s.borderVisible = !!value; return true;
        case 'wrap': s.wrap = !!value; return true;
        case 'wrapWidth': { const n = Number(value); if (n > 0) s.wrapWidth = Math.max(20, Math.min(2000, n)); return true; }
    }
    return false;
}

/** Serilestirme: yeni alanlar `textBox` altinda. */
export function textBoxToJSON(s: TextBoxState): Record<string, any> {
    return {
        bgColor: s.bgColor, bgOpacity: s.bgOpacity, bgVisible: s.bgVisible,
        borderColor: s.borderColor, borderWidth: s.borderWidth, borderVisible: s.borderVisible,
        wrap: s.wrap, wrapWidth: s.wrapWidth, legacy: s.legacy,
    };
}

/**
 * Kayittan yukler. `textBox` yoksa (eski kayit) gorunum eski haliyle korunur:
 * arka plan `fillColor`'dan, kenarlik eski varsayilanlardan, nokta kutu ortasinda.
 */
export function textBoxFromJSON(
    s: TextBoxState,
    data: { fillColor?: string; fontSize?: number; fontWeight?: string; fontStyle?: string; textBox?: Record<string, any> },
    legacyBorder: { color: string; width: number; visible: boolean },
): void {
    if (data.fontSize) s.fontSize = data.fontSize;
    s.bold = data.fontWeight === 'bold';
    s.italic = data.fontStyle === 'italic';
    const tb = data.textBox;
    if (tb) {
        s.legacy = tb.legacy === true;
        if (typeof tb.bgColor === 'string') s.bgColor = tb.bgColor;
        if (typeof tb.bgOpacity === 'number') s.bgOpacity = tb.bgOpacity;
        if (typeof tb.bgVisible === 'boolean') s.bgVisible = tb.bgVisible;
        if (typeof tb.borderColor === 'string') s.borderColor = tb.borderColor;
        if (typeof tb.borderWidth === 'number') s.borderWidth = tb.borderWidth;
        if (typeof tb.borderVisible === 'boolean') s.borderVisible = tb.borderVisible;
        if (typeof tb.wrap === 'boolean') s.wrap = tb.wrap;
        if (typeof tb.wrapWidth === 'number') s.wrapWidth = tb.wrapWidth;
        return;
    }
    s.legacy = true;
    const p = parseColor(data.fillColor);
    if (p) {
        s.bgColor = colorToHex(data.fillColor) || s.bgColor;
        // Eski cizici rgba'da alfayi iki kez uyguluyordu (a*a), hex'te 0.2 kullaniyordu: gorunumu koru
        s.bgOpacity = /^rgba\(/i.test((data.fillColor || '').trim()) ? p.a * p.a : 0.2;
    }
    s.borderColor = legacyBorder.color;
    s.borderWidth = legacyBorder.width;
    s.borderVisible = legacyBorder.visible;
}

/** Text / Callout ayar bolumleri: [Text sekmesi, Style sekmesi]. */
export function textBoxSettingsSections(opts: { toggles: boolean; borderWidthRow?: boolean }): { text: SettingsSection[]; style: SettingsSection[] } {
    const bg = opts.toggles
        ? [checkboxRow('backgroundVisible', 'Background'), colorRow('backgroundColor', 'Color')]
        : [colorRow('backgroundColor', 'Background')];
    const border = opts.toggles
        ? [checkboxRow('borderVisible', 'Border'), colorRow('borderColor', 'Color')]
        : [colorRow('borderColor', 'Border')];
    return {
        text: [
            {
                rows: [
                    groupRow([
                        colorRow('color', ''),
                        selectRow('fontSize', '', fontSizeOptions()),
                        checkboxRow('bold', 'B'),
                        checkboxRow('italic', 'I'),
                    ]),
                    textareaRow('text'),
                ],
            },
        ],
        style: [
            {
                title: 'Background',
                rows: [
                    ...bg,
                    { type: 'slider', key: 'backgroundTransparency', label: 'Transparency', min: 0, max: 100, step: 1, unit: '%', suffix: '%' } as any,
                ],
            },
            { title: 'Border', rows: opts.borderWidthRow ? [...border, lineWidthRow('borderWidth', 'Width')] : border },
            {
                title: 'Text wrap',
                rows: [
                    checkboxRow('wrap', 'Word wrap'),
                    numberRow('wrapWidth', 'Wrap width', { min: 20, max: 2000, step: 10 }),
                ],
            },
        ],
    };
}

// ----------------------------------------------------------------------------
// Satir ici editor: hangi araclar editor acar + editor yerlesim ozellikleri
// ----------------------------------------------------------------------------

/** Cift tiklamada satir ici editor acan araclar (Table: hucre). */
export const INLINE_TEXT_TYPES: ReadonlySet<string> = new Set(['text', 'callout', 'note', 'priceNote', 'signpost', 'comment', 'table']);
/** Tek tikla yerlesen ve hemen editor acan araclar */
export const SINGLE_CLICK_TEXT_TYPES: ReadonlySet<string> = new Set(['text', 'note', 'signpost']);
/** Ikinci tikla (kutu konumu) tamamlanan ve o zaman editor acan araclar */
export const TWO_CLICK_TEXT_TYPES: ReadonlySet<string> = new Set(['callout', 'priceNote', 'comment']);

/**
 * Cizim `getEditorSpec()` verirse satir ici editor (TextEditorOverlay) bu ozelliklere gore dizilir.
 * Yoksa Text/Callout icin eski `box` tabanli yerlesim kullanilir.
 */
export interface EditorSpec {
    fontSize: number;
    bold: boolean;
    italic: boolean;
    wrap: boolean;
    wrapWidth: number;
    padH: number;
    padV: number;
    /** Sol ek bosluk (varsayilan padH): Signpost'ta emoji icin */
    padL?: number;
    radius: number;
    minW: number;
    /** true: editor sinirlarin ortasina; false: sol ust kosesine oturur */
    center: boolean;
    align: 'left' | 'center' | 'right';
    bg: string;
    color: string;
    border?: { width: number; color: string };
    /** true: editor boyutu sinirlara sabitlenir (Table hucresi), metinle buyumez */
    fixed?: boolean;
    /** true: editor alt kenari sinirlarin alt kenarina sabit kalir, cok satirda yukari buyur (Note) */
    anchorBottom?: boolean;
    /** Satir yuksekligi / yazi boyutu orani (varsayilan 1.2); Callout 1 */
    lineHeightRatio?: number;
    /** Metin genisligine eklenen imlec payi px (varsayilan 4) */
    extraW?: number;
    /** true: kelime kaydirma aciksa editor genisligi tam wrapWidth (Callout) */
    wrapFixed?: boolean;
}
