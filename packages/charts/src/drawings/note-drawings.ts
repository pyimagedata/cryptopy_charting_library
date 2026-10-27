/**
 * Not / aciklama araclari: Note, Price Note, Pin, Signpost, Comment, Table.
 *
 *   note       Not           1 tik. Capada kucuk isaret noktasi, sagda/ustte metin kutusu ve ikisini baglayan ince cizgi.
 *   priceNote  Fiyat Notu    2 tik: P1 = fiyat noktasi, P2 = metnin durdugu yer. P1-P2 cizgisi; metin P2'de (hiza ayarli);
 *                            P1'in fiyati fiyat ekseninde etiket (chip) olarak gosterilir.
 *   pin        Raptiye       1 tik. Capada harita raptiyesi simgesi; ustunde istege bagli metin.
 *   signpost   Yol Levhasi   1 tik. Capadan yukari (veya asagi) dikey direk ve ucunda yuvarlak levha (emoji + metin).
 *   comment    Yorum         2 tik: P1 = kuyrugun gosterdigi nokta, P2 = konusma balonunun merkezi.
 *   table      Tablo         1 tik. Sol ust kose capada; satir x sutun hucre izgarasi, her hucrenin metni duzenlenebilir.
 *
 * Geometri ekran (css piksel) uzayinda `layout(pts, measure)` ile hesaplanir (metin olcumu disaridan verilir);
 * cizici `geo` alanini okur. Satir ici editor icin `getEditorSpec()` / `getEditorBounds()` saglanir
 * (bkz. gui/text-editor-overlay.ts). Metin ayarlari text-common.ts'teki TextBoxState'i yeniden kullanir.
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
    createVisibilityTab,
    createCoordinatesTab,
    colorRow,
    checkboxRow,
    selectRow,
    numberRow,
    groupRow,
    textareaRow,
    lineWidthRow,
} from './drawing-settings-config';
import {
    TextBoxState,
    TextBoxDefaults,
    EditorSpec,
    createTextBoxState,
    getTextBoxSetting,
    setTextBoxSetting,
    textBoxToJSON,
    textBoxFromJSON,
    textBoxSettingsSections,
    textBoxBackgroundCss,
    fontSizeOptions,
    cssFont,
    wrapText,
} from './text-common';
import { colorToHex } from './shape-common';
import type { DrawingAxisLabels } from './line-tool-common';

export type NoteToolType = 'note' | 'priceNote' | 'pin' | 'signpost' | 'comment' | 'table';
export const NOTE_TOOL_TYPES: ReadonlySet<string> = new Set<string>(['note', 'priceNote', 'pin', 'signpost', 'comment', 'table']);

/** TradingView soguk gri / mavi paleti */
export const NOTE_COLORS = {
    blue: '#2962FF',
    white: '#FFFFFF',
    gray150: '#EBEBEB',
    gray200: '#DBDBDB',
    gray700: '#464646',
    gray800: '#1A1A1A',
    gray900: '#000000',
};

export const NOTE_BOX_DEFAULTS: TextBoxDefaults = {
    bgColor: NOTE_COLORS.gray800, bgOpacity: 1, bgVisible: true,
    borderColor: NOTE_COLORS.gray700, borderWidth: 1, borderVisible: false,
};
export const COMMENT_BOX_DEFAULTS: TextBoxDefaults = {
    bgColor: NOTE_COLORS.blue, bgOpacity: 0.7, bgVisible: true,
    borderColor: NOTE_COLORS.blue, borderWidth: 1, borderVisible: true,
};
export const TABLE_BOX_DEFAULTS: TextBoxDefaults = {
    bgColor: NOTE_COLORS.gray800, bgOpacity: 1, bgVisible: true,
    borderColor: NOTE_COLORS.gray700, borderWidth: 1, borderVisible: true,
};
const PLAIN_BOX_DEFAULTS: TextBoxDefaults = {
    bgColor: NOTE_COLORS.blue, bgOpacity: 1, bgVisible: false,
    borderColor: NOTE_COLORS.blue, borderWidth: 1, borderVisible: false,
};

export const TABLE_MIN = 1;
export const TABLE_MAX = 10;
export const SIGNPOST_EMOJIS = ['🙂', '😀', '😎', '🚀', '🔥', '💎', '💰', '⚠️', '✅', '❌', '📈', '📉', '⭐', '🎯'];

type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
type Measure = (s: string, font: string) => number;

export interface TextBlock { lines: string[]; w: number; h: number; lineH: number }

/** Metni (kelime kaydirma dahil) satirlara bolup boyutunu olcer. */
export function measureTextBlock(
    text: string, fontSize: number, bold: boolean, italic: boolean,
    wrap: boolean, wrapWidth: number, measure: Measure,
): TextBlock {
    const font = cssFont(fontSize, bold, italic);
    const m = (s: string) => measure(s, font);
    const lines = wrap ? wrapText(text, wrapWidth, m) : String(text ?? '').split('\n');
    let w = 0;
    for (const l of lines) w = Math.max(w, m(l));
    const lineH = fontSize * 1.2;
    return { lines, w, h: lines.length * lineH, lineH };
}

function segDist(px: number, py: number, a: Pt, b: Pt): number {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

function unionRect(rs: Rect[]): Rect | null {
    if (rs.length === 0) return null;
    const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y));
    const x1 = Math.max(...rs.map(r => r.x + r.width)), y1 = Math.max(...rs.map(r => r.y + r.height));
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

const textColorItem: AttributeBarItem = { type: 'color', key: 'textColor', tooltip: 'Text Color', icon: 'textColor' } as AttributeBarItem;

// ============================================================================
// Ortak govde
// ============================================================================

export abstract class NoteToolBase implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType;
    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible = true;
    locked = false;
    /** Gecici: satir ici editor acikken cizim metni cizmez (serilestirilmez) */
    editing = false;

    protected _text = '';
    protected _pixelPoints: Pt[] = [];
    protected _rects: Rect[] = [];
    protected _segs: [Pt, Pt][] = [];
    protected _bounds: Rect | null = null;

    constructor(type: NoteToolType, style: Partial<DrawingStyle>) {
        this.id = generateDrawingId();
        this.type = type;
        this.style = { ...DEFAULT_DRAWING_STYLE, lineDash: [], ...style };
    }

    get text(): string { return this._text; }
    set text(v: string) { this._text = v; }

    /** Cizilecek nokta sayisi (tik sayisi) */
    protected get pointCount(): number { return 1; }

    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
        if (this.points.length >= this.pointCount) this.state = 'complete';
    }

    isComplete(): boolean {
        return this.points.length >= this.pointCount && this.state !== 'creating';
    }

    updateLastPoint(time: number, price: number): void {
        if (this.points.length === 0) return;
        this.points[this.points.length - 1] = { time, price };
    }

    getPixelPoints(): Pt[] { return this._pixelPoints; }
    setPixelPoints(pts: Pt[]): void { this._pixelPoints = pts; }

    /** Cizici/test: hesaplanan geometriyi onbellege yazar */
    protected _setHit(pts: Pt[], rects: Rect[], segs: [Pt, Pt][], bounds: Rect | null): void {
        this._pixelPoints = pts;
        this._rects = rects;
        this._segs = segs;
        this._bounds = bounds;
    }

    abstract layout(pts: Pt[], measure: Measure): void;
    abstract getSettingsConfig(): DrawingSettingsConfig;
    abstract getAttributeBarItems(): AttributeBarItem[];
    abstract getSettingValue(key: string): any;
    abstract setSettingValue(key: string, value: any): void;
    abstract toJSON(): SerializedDrawing;

    hitTest(x: number, y: number, threshold: number = 8): boolean {
        for (const r of this._rects) {
            if (x >= r.x - threshold && x <= r.x + r.width + threshold && y >= r.y - threshold && y <= r.y + r.height + threshold) return true;
        }
        for (const [a, b] of this._segs) {
            if (segDist(x, y, a, b) <= threshold) return true;
        }
        for (const p of this._pixelPoints) {
            if (Math.hypot(x - p.x, y - p.y) <= threshold) return true;
        }
        return false;
    }

    getBounds(): Rect | null { return this._bounds; }

    protected _baseJSON(): SerializedDrawing {
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

    /** Kayittan ortak alanlari yukler (id korunur) */
    protected _restoreBase(data: SerializedDrawing): void {
        Object.defineProperty(this, 'id', { value: data.id, writable: false });
        this.style = { ...this.style, ...data.style, lineDash: [...(data.style?.lineDash ?? [])] };
        this.points = (data.points ?? []).map(p => ({ ...p }));
        this.state = data.state as DrawingState;
        this.visible = data.visible;
        this.locked = data.locked;
        if (typeof data.text === 'string') this._text = data.text;
    }

    static fromJSON(data: SerializedDrawing): NoteToolBase {
        const d: NoteToolBase = createNoteTool(data.type as NoteToolType);
        d._restoreBase(data);
        d._restoreExt(data);
        return d;
    }

    protected abstract _restoreExt(data: SerializedDrawing): void;
}

/** Kutulu (TextBoxState tasiyan) araclarin ortak govdesi: Note, Price Note, Signpost, Comment */
abstract class NoteBoxTool extends NoteToolBase {
    readonly box: TextBoxState;

    constructor(type: NoteToolType, style: Partial<DrawingStyle>, boxDefaults: TextBoxDefaults) {
        super(type, style);
        this.box = createTextBoxState(boxDefaults);
    }

    get fontSize(): number { return this.box.fontSize; }
    set fontSize(v: number) { this.box.fontSize = v; }
    get bold(): boolean { return this.box.bold; }
    set bold(v: boolean) { this.box.bold = v; }
    get italic(): boolean { return this.box.italic; }
    set italic(v: boolean) { this.box.italic = v; }

    protected _measureText(measure: Measure): TextBlock {
        const b = this.box;
        return measureTextBlock(this._text, b.fontSize, b.bold, b.italic, b.wrap, b.wrapWidth, measure);
    }

    protected _boxJSON(ext: Record<string, any>): SerializedDrawing {
        return {
            ...this._baseJSON(),
            text: this._text,
            fontSize: this.box.fontSize,
            fontWeight: this.box.bold ? 'bold' : 'normal',
            fontStyle: this.box.italic ? 'italic' : 'normal',
            fillColor: this.box.bgColor,
            textBox: textBoxToJSON(this.box),
            ext,
        };
    }

    protected _restoreBox(data: SerializedDrawing, fallbackBorder: { color: string; width: number; visible: boolean }): void {
        textBoxFromJSON(this.box, data, fallbackBorder);
        this.box.legacy = false;
    }
}

// ============================================================================
// Note
// ============================================================================

export interface NoteGeometry {
    box: Rect;
    lines: string[];
    lineH: number;
    padH: number;
    padV: number;
    marker: Pt;
    lineTo: Pt;
}

export class NoteDrawing extends NoteBoxTool {
    markerColor = NOTE_COLORS.blue;
    geo: NoteGeometry | null = null;

    static readonly PAD_H = 8;
    static readonly PAD_V = 6;
    static readonly MIN_W = 24;

    constructor() {
        super('note', { color: NOTE_COLORS.gray200 }, NOTE_BOX_DEFAULTS);
        this.box.fontSize = 14;
        this._text = 'Note';
    }

    layout(pts: Pt[], measure: Measure): void {
        if (pts.length < 1) { this.geo = null; return; }
        const a = pts[0];
        const tb = this._measureText(measure);
        const w = Math.max(tb.w, NoteDrawing.MIN_W) + NoteDrawing.PAD_H * 2;
        const h = tb.h + NoteDrawing.PAD_V * 2;
        const box: Rect = { x: a.x + 28, y: a.y - h - 20, width: w, height: h };
        const lineTo = { x: box.x, y: box.y + box.height };
        this.geo = { box, lines: tb.lines, lineH: tb.lineH, padH: NoteDrawing.PAD_H, padV: NoteDrawing.PAD_V, marker: a, lineTo };
        this._setHit(pts, [box, { x: a.x - 8, y: a.y - 8, width: 16, height: 16 }], [[a, lineTo]], box);
    }

    getEditorSpec(): EditorSpec {
        const b = this.box;
        return {
            fontSize: b.fontSize, bold: b.bold, italic: b.italic, wrap: b.wrap, wrapWidth: b.wrapWidth,
            padH: NoteDrawing.PAD_H, padV: NoteDrawing.PAD_V, radius: 4, minW: NoteDrawing.MIN_W,
            center: false, align: 'left', anchorBottom: true,
            bg: b.bgVisible ? textBoxBackgroundCss(b) : 'transparent',
            color: this.style.color,
            border: b.borderVisible && b.borderWidth > 0 ? { width: b.borderWidth, color: b.borderColor } : undefined,
        };
    }

    getSettingsConfig(): DrawingSettingsConfig {
        const sec = textBoxSettingsSections({ toggles: true });
        return {
            tabs: [
                { id: 'textContent', label: 'Text', sections: sec.text },
                { id: 'style', label: 'Style', sections: [...sec.style, { title: 'Marker', rows: [colorRow('markerColor', 'Color')] }] },
                createCoordinatesTab([]),
                createVisibilityTab(),
            ],
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Text Color', icon: 'textColor' } as AttributeBarItem,
            { type: 'color', key: 'backgroundColor', tooltip: 'Background', icon: 'fillBucket' } as AttributeBarItem,
            { type: 'color', key: 'markerColor', tooltip: 'Marker' },
            { type: 'number', key: 'fontSize', tooltip: 'Font Size' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'text': return this._text;
            case 'color': return this.style.color;
            case 'markerColor': return this.markerColor;
            case 'visible': return this.visible;
            default: return getTextBoxSetting(this.box, key);
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'text': this._text = String(value ?? ''); break;
            case 'color': this.style.color = value; break;
            case 'markerColor': this.markerColor = colorToHex(value) || value; break;
            case 'visible': this.visible = !!value; break;
            default: setTextBoxSetting(this.box, key, value);
        }
    }

    toJSON(): SerializedDrawing { return this._boxJSON({ markerColor: this.markerColor }); }

    protected _restoreExt(data: SerializedDrawing): void {
        this._restoreBox(data, { color: NOTE_COLORS.gray700, width: 1, visible: false });
        if (typeof data.ext?.markerColor === 'string') this.markerColor = data.ext.markerColor;
    }
}

// ============================================================================
// Price Note
// ============================================================================

export type HorzAlign = 'left' | 'center' | 'right';
export type VertAlign = 'top' | 'middle' | 'bottom';

export interface PriceNoteGeometry {
    textRect: Rect;
    lines: string[];
    lineH: number;
    padH: number;
    padV: number;
    from: Pt;
    to: Pt;
}

export class PriceNoteDrawing extends NoteBoxTool {
    /** Fiyat ekseni etiketinin (chip) rengi: dolgu + kenarlik; metin beyaz */
    chipColor = NOTE_COLORS.blue;
    horzLabelsAlign: HorzAlign = 'center';
    vertLabelsAlign: VertAlign = 'bottom';
    geo: PriceNoteGeometry | null = null;

    static readonly PAD_H = 4;
    static readonly PAD_V = 3;

    constructor() {
        super('priceNote', { color: NOTE_COLORS.blue, textColor: NOTE_COLORS.blue, lineWidth: 1 }, PLAIN_BOX_DEFAULTS);
        this.box.fontSize = 14;
        this._text = 'Price note';
    }

    protected get pointCount(): number { return 2; }

    /** callout ile ayni akis: ilk tikta iki nokta (P2 onizleme), ikinci tik P2'yi sabitler */
    addPoint(time: number, price: number): void {
        if (this.points.length === 0) {
            this.points.push({ time, price });
            this.points.push({ time, price });
        } else if (this.points.length === 2) {
            this.points[1] = { time, price };
            this.state = 'complete';
        }
    }

    isComplete(): boolean { return this.points.length >= 2 && this.state !== 'creating'; }

    updateLastPoint(time: number, price: number): void {
        if (this.points.length >= 2) this.points[1] = { time, price };
    }

    layout(pts: Pt[], measure: Measure): void {
        if (pts.length < 1) { this.geo = null; return; }
        const a = pts[0];
        const b = pts[1] ?? { x: a.x + 80, y: a.y - 40 };
        const tb = this._measureText(measure);
        const w = Math.max(tb.w, 20) + PriceNoteDrawing.PAD_H * 2;
        const h = tb.h + PriceNoteDrawing.PAD_V * 2;
        const x = this.horzLabelsAlign === 'left' ? b.x : this.horzLabelsAlign === 'right' ? b.x - w : b.x - w / 2;
        const y = this.vertLabelsAlign === 'top' ? b.y : this.vertLabelsAlign === 'middle' ? b.y - h / 2 : b.y - h;
        const textRect: Rect = { x, y, width: w, height: h };
        this.geo = { textRect, lines: tb.lines, lineH: tb.lineH, padH: PriceNoteDrawing.PAD_H, padV: PriceNoteDrawing.PAD_V, from: a, to: b };
        this._setHit(pts, [textRect], [[a, b]], textRect);
    }

    /** P1'in fiyati fiyat ekseninde chip olarak gosterilir (metin/biçim eksenin seri hassasiyetiyle) */
    getAxisLabels(): DrawingAxisLabels {
        if (this.points.length < 1) return { prices: [], times: [] };
        return { prices: [{ price: this.points[0].price, color: this.chipColor }], times: [] };
    }

    getEditorSpec(): EditorSpec {
        const b = this.box;
        return {
            fontSize: b.fontSize, bold: b.bold, italic: b.italic, wrap: b.wrap, wrapWidth: b.wrapWidth,
            padH: PriceNoteDrawing.PAD_H, padV: PriceNoteDrawing.PAD_V, radius: 4, minW: 20,
            center: true, align: this.horzLabelsAlign,
            bg: 'transparent', color: this.style.textColor || NOTE_COLORS.blue,
        };
    }

    getSettingsConfig(): DrawingSettingsConfig {
        const hAlign = [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }];
        const vAlign = [{ value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }];
        return {
            tabs: [
                {
                    id: 'textContent', label: 'Text', sections: [
                        {
                            rows: [
                                groupRow([
                                    colorRow('textColor', ''),
                                    selectRow('fontSize', '', fontSizeOptions()),
                                    checkboxRow('bold', 'B'),
                                    checkboxRow('italic', 'I'),
                                ]),
                                textareaRow('text'),
                                selectRow('horzLabelsAlign', 'Horizontal alignment', hAlign),
                                selectRow('vertLabelsAlign', 'Vertical alignment', vAlign),
                            ],
                        },
                    ],
                },
                {
                    id: 'style', label: 'Style', sections: [
                        { title: 'Line', rows: [colorRow('color', 'Color'), lineWidthRow('lineWidth', 'Width')] },
                        { title: 'Price label', rows: [colorRow('chipColor', 'Color')] },
                    ],
                },
                createCoordinatesTab([]),
                createVisibilityTab(),
            ],
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Line Color' },
            textColorItem,
            { type: 'color', key: 'chipColor', tooltip: 'Price Label', icon: 'fillBucket' } as AttributeBarItem,
            { type: 'number', key: 'fontSize', tooltip: 'Font Size' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'text': return this._text;
            case 'color': return this.style.color;
            case 'textColor': return this.style.textColor;
            case 'lineWidth': return this.style.lineWidth;
            case 'chipColor': return this.chipColor;
            case 'horzLabelsAlign': return this.horzLabelsAlign;
            case 'vertLabelsAlign': return this.vertLabelsAlign;
            case 'visible': return this.visible;
            case 'fontSize': case 'bold': case 'italic': return getTextBoxSetting(this.box, key);
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'text': this._text = String(value ?? ''); break;
            case 'color': this.style.color = value; break;
            case 'textColor': this.style.textColor = colorToHex(value) || value; break;
            case 'lineWidth': { const n = Number(value); if (n > 0) this.style.lineWidth = n; break; }
            case 'chipColor': this.chipColor = colorToHex(value) || value; break;
            case 'horzLabelsAlign': if (['left', 'center', 'right'].includes(value)) this.horzLabelsAlign = value; break;
            case 'vertLabelsAlign': if (['top', 'middle', 'bottom'].includes(value)) this.vertLabelsAlign = value; break;
            case 'visible': this.visible = !!value; break;
            case 'fontSize': case 'bold': case 'italic': setTextBoxSetting(this.box, key, value); break;
        }
    }

    toJSON(): SerializedDrawing {
        return this._boxJSON({ chipColor: this.chipColor, horzLabelsAlign: this.horzLabelsAlign, vertLabelsAlign: this.vertLabelsAlign });
    }

    protected _restoreExt(data: SerializedDrawing): void {
        this._restoreBox(data, { color: NOTE_COLORS.blue, width: 1, visible: false });
        const e = data.ext;
        if (!e) return;
        if (typeof e.chipColor === 'string') this.chipColor = e.chipColor;
        if (['left', 'center', 'right'].includes(e.horzLabelsAlign)) this.horzLabelsAlign = e.horzLabelsAlign;
        if (['top', 'middle', 'bottom'].includes(e.vertLabelsAlign)) this.vertLabelsAlign = e.vertLabelsAlign;
    }
}

// ============================================================================
// Pin
// ============================================================================

export interface PinGeometry {
    anchor: Pt;
    headCenter: Pt;
    headRadius: number;
    textRect: Rect | null;
    lines: string[];
    lineH: number;
    padH: number;
    padV: number;
}

export class PinDrawing extends NoteToolBase {
    fontSize = 14;
    geo: PinGeometry | null = null;

    static readonly HEAD_R = 9;
    static readonly HEIGHT = 30;

    constructor() {
        super('pin', { color: NOTE_COLORS.blue, textColor: NOTE_COLORS.blue });
        this._text = '';
    }

    layout(pts: Pt[], measure: Measure): void {
        if (pts.length < 1) { this.geo = null; return; }
        const a = pts[0];
        const R = PinDrawing.HEAD_R;
        const iconRect: Rect = { x: a.x - R, y: a.y - PinDrawing.HEIGHT, width: R * 2, height: PinDrawing.HEIGHT };
        let textRect: Rect | null = null;
        let lines: string[] = [];
        let lineH = this.fontSize * 1.2;
        if (this._text.trim() !== '') {
            const tb = measureTextBlock(this._text, this.fontSize, true, false, false, 0, measure);
            lines = tb.lines; lineH = tb.lineH;
            const w = tb.w + 8, h = tb.h + 4;
            textRect = { x: a.x - w / 2, y: iconRect.y - 4 - h, width: w, height: h };
        }
        this.geo = {
            anchor: a, headCenter: { x: a.x, y: a.y - PinDrawing.HEIGHT + R }, headRadius: R,
            textRect, lines, lineH, padH: 4, padV: 2,
        };
        const rects = textRect ? [iconRect, textRect] : [iconRect];
        this._setHit(pts, rects, [], unionRect(rects));
    }

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                { id: 'style', label: 'Style', sections: [{ rows: [colorRow('color', 'Pin color')] }] },
                {
                    id: 'textContent', label: 'Text', sections: [
                        { rows: [groupRow([colorRow('textColor', ''), selectRow('fontSize', '', fontSizeOptions())]), textareaRow('text')] },
                    ],
                },
                createCoordinatesTab([]),
                createVisibilityTab(),
            ],
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Pin Color' },
            textColorItem,
            { type: 'number', key: 'fontSize', tooltip: 'Font Size' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'text': return this._text;
            case 'color': return this.style.color;
            case 'textColor': return this.style.textColor;
            case 'fontSize': return String(this.fontSize);
            case 'visible': return this.visible;
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'text': this._text = String(value ?? ''); break;
            case 'color': this.style.color = value; break;
            case 'textColor': this.style.textColor = colorToHex(value) || value; break;
            case 'fontSize': { const n = parseInt(value); if (n > 0) this.fontSize = n; break; }
            case 'visible': this.visible = !!value; break;
        }
    }

    toJSON(): SerializedDrawing {
        return { ...this._baseJSON(), text: this._text, fontSize: this.fontSize };
    }

    protected _restoreExt(data: SerializedDrawing): void {
        if (typeof data.fontSize === 'number' && data.fontSize > 0) this.fontSize = data.fontSize;
    }
}

// ============================================================================
// Signpost
// ============================================================================

export interface SignpostGeometry {
    plate: Rect;
    post: [Pt, Pt];
    lines: string[];
    lineH: number;
    emojiW: number;
    padH: number;
    padV: number;
}

/** Emoji alanini en fazla 4 grafem kumesine sinirlar */
function capEmoji(v: string): string {
    return Array.from(v).slice(0, 4).join('');
}

export class SignpostDrawing extends NoteBoxTool {
    showImage = false;
    emoji = '🙂';
    placement: 'above' | 'below' = 'above';
    geo: SignpostGeometry | null = null;

    static readonly PAD_H = 10;
    static readonly PAD_V = 6;
    static readonly POST_H = 32;

    constructor() {
        super('signpost', { color: NOTE_COLORS.blue, textColor: NOTE_COLORS.white, lineWidth: 2 }, PLAIN_BOX_DEFAULTS);
        this.box.fontSize = 12;
        this._text = 'Signpost';
    }

    private _emojiW(): number { return this.showImage ? this.box.fontSize * 1.3 + 6 : 0; }

    layout(pts: Pt[], measure: Measure): void {
        if (pts.length < 1) { this.geo = null; return; }
        const a = pts[0];
        const tb = this._measureText(measure);
        const emojiW = this._emojiW();
        const w = Math.max(tb.w, 16) + emojiW + SignpostDrawing.PAD_H * 2;
        const h = Math.max(tb.h, this.showImage ? this.box.fontSize * 1.3 : 0) + SignpostDrawing.PAD_V * 2;
        const above = this.placement === 'above';
        const plate: Rect = {
            x: a.x - w / 2,
            y: above ? a.y - SignpostDrawing.POST_H - h : a.y + SignpostDrawing.POST_H,
            width: w, height: h,
        };
        const postEnd = { x: a.x, y: above ? plate.y + h : plate.y };
        this.geo = { plate, post: [a, postEnd], lines: tb.lines, lineH: tb.lineH, emojiW, padH: SignpostDrawing.PAD_H, padV: SignpostDrawing.PAD_V };
        this._setHit(pts, [plate, { x: a.x - 6, y: a.y - 6, width: 12, height: 12 }], [[a, postEnd]], plate);
    }

    getEditorSpec(): EditorSpec {
        const b = this.box;
        return {
            fontSize: b.fontSize, bold: b.bold, italic: b.italic, wrap: b.wrap, wrapWidth: b.wrapWidth,
            padH: SignpostDrawing.PAD_H, padV: SignpostDrawing.PAD_V, padL: SignpostDrawing.PAD_H + this._emojiW(),
            radius: 8, minW: 16, center: false, align: 'left',
            bg: this.style.color, color: this.style.textColor || NOTE_COLORS.white,
        };
    }

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                {
                    id: 'textContent', label: 'Text', sections: [
                        {
                            rows: [
                                groupRow([
                                    colorRow('textColor', ''),
                                    selectRow('fontSize', '', fontSizeOptions()),
                                    checkboxRow('bold', 'B'),
                                    checkboxRow('italic', 'I'),
                                ]),
                                textareaRow('text'),
                            ],
                        },
                        { title: 'Image', rows: [checkboxRow('showImage', 'Show emoji'), selectRow('emoji', 'Emoji', SIGNPOST_EMOJIS.map(e => ({ value: e, label: e })))] },
                    ],
                },
                {
                    id: 'style', label: 'Style', sections: [
                        { title: 'Plate', rows: [colorRow('color', 'Color')] },
                        { title: 'Position', rows: [selectRow('placement', 'Plate placement', [{ value: 'above', label: 'Above' }, { value: 'below', label: 'Below' }])] },
                    ],
                },
                createCoordinatesTab([]),
                createVisibilityTab(),
            ],
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Plate Color', icon: 'fillBucket' } as AttributeBarItem,
            textColorItem,
            { type: 'number', key: 'fontSize', tooltip: 'Font Size' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'text': return this._text;
            case 'color': return this.style.color;
            case 'textColor': return this.style.textColor;
            case 'showImage': return this.showImage;
            case 'emoji': return this.emoji;
            case 'placement': return this.placement;
            case 'visible': return this.visible;
            case 'fontSize': case 'bold': case 'italic': return getTextBoxSetting(this.box, key);
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'text': this._text = String(value ?? ''); break;
            case 'color': this.style.color = colorToHex(value) || value; break;
            case 'textColor': this.style.textColor = colorToHex(value) || value; break;
            case 'showImage': this.showImage = !!value; break;
            case 'emoji': if (typeof value === 'string' && value !== '') this.emoji = capEmoji(value); break;
            case 'placement': if (value === 'above' || value === 'below') this.placement = value; break;
            case 'visible': this.visible = !!value; break;
            case 'fontSize': case 'bold': case 'italic': setTextBoxSetting(this.box, key, value); break;
        }
    }

    toJSON(): SerializedDrawing {
        return this._boxJSON({ showImage: this.showImage, emoji: this.emoji, placement: this.placement });
    }

    protected _restoreExt(data: SerializedDrawing): void {
        this._restoreBox(data, { color: NOTE_COLORS.blue, width: 1, visible: false });
        const e = data.ext;
        if (!e) return;
        this.showImage = e.showImage === true;
        if (typeof e.emoji === 'string' && e.emoji !== '') this.emoji = capEmoji(e.emoji);
        if (e.placement === 'above' || e.placement === 'below') this.placement = e.placement;
    }
}

// ============================================================================
// Comment
// ============================================================================

export interface CommentGeometry {
    box: Rect;
    anchor: Pt;
    /** Kuyruk cizilsin mi (P1 balonun disinda) */
    tail: boolean;
    lines: string[];
    lineH: number;
    padH: number;
    padV: number;
}

export class CommentDrawing extends NoteBoxTool {
    geo: CommentGeometry | null = null;

    static readonly PAD_H = 14;
    static readonly PAD_V = 10;
    static readonly MIN_W = 40;
    static readonly RADIUS = 10;

    constructor() {
        super('comment', { color: NOTE_COLORS.white }, COMMENT_BOX_DEFAULTS);
        this.box.fontSize = 14;
        this._text = 'Comment';
    }

    protected get pointCount(): number { return 2; }

    addPoint(time: number, price: number): void {
        if (this.points.length === 0) {
            this.points.push({ time, price });
            this.points.push({ time, price });
        } else if (this.points.length === 2) {
            this.points[1] = { time, price };
            this.state = 'complete';
        }
    }

    isComplete(): boolean { return this.points.length >= 2 && this.state !== 'creating'; }

    updateLastPoint(time: number, price: number): void {
        if (this.points.length >= 2) this.points[1] = { time, price };
    }

    layout(pts: Pt[], measure: Measure): void {
        if (pts.length < 1) { this.geo = null; return; }
        const a = pts[0];
        const c = pts[1] ?? { x: a.x + 80, y: a.y - 60 };
        const tb = this._measureText(measure);
        const w = Math.max(tb.w, CommentDrawing.MIN_W) + CommentDrawing.PAD_H * 2;
        const h = tb.h + CommentDrawing.PAD_V * 2;
        const box: Rect = { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h };
        const tail = a.x < box.x || a.x > box.x + w || a.y < box.y || a.y > box.y + h;
        this.geo = { box, anchor: a, tail, lines: tb.lines, lineH: tb.lineH, padH: CommentDrawing.PAD_H, padV: CommentDrawing.PAD_V };
        this._setHit(pts, [box], tail ? [[a, c]] : [], box);
    }

    getEditorSpec(): EditorSpec {
        const b = this.box;
        return {
            fontSize: b.fontSize, bold: b.bold, italic: b.italic, wrap: b.wrap, wrapWidth: b.wrapWidth,
            padH: CommentDrawing.PAD_H, padV: CommentDrawing.PAD_V, radius: CommentDrawing.RADIUS, minW: CommentDrawing.MIN_W,
            center: true, align: 'center',
            bg: b.bgVisible ? textBoxBackgroundCss(b) : 'transparent', color: this.style.color,
            border: b.borderVisible && b.borderWidth > 0 ? { width: b.borderWidth, color: b.borderColor } : undefined,
        };
    }

    getSettingsConfig(): DrawingSettingsConfig {
        const sec = textBoxSettingsSections({ toggles: true, borderWidthRow: true });
        return {
            tabs: [
                { id: 'textContent', label: 'Text', sections: sec.text },
                { id: 'style', label: 'Style', sections: sec.style },
                createCoordinatesTab([]),
                createVisibilityTab(),
            ],
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Text Color', icon: 'textColor' } as AttributeBarItem,
            { type: 'color', key: 'backgroundColor', tooltip: 'Background', icon: 'fillBucket' } as AttributeBarItem,
            { type: 'color', key: 'borderColor', tooltip: 'Border' },
            { type: 'number', key: 'fontSize', tooltip: 'Font Size' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'text': return this._text;
            case 'color': return this.style.color;
            case 'visible': return this.visible;
            default: return getTextBoxSetting(this.box, key);
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'text': this._text = String(value ?? ''); break;
            case 'color': this.style.color = value; break;
            case 'visible': this.visible = !!value; break;
            default: setTextBoxSetting(this.box, key, value);
        }
    }

    toJSON(): SerializedDrawing { return this._boxJSON({}); }

    protected _restoreExt(data: SerializedDrawing): void {
        this._restoreBox(data, { color: NOTE_COLORS.blue, width: 1, visible: true });
    }
}

// ============================================================================
// Table
// ============================================================================

export class TableDrawing extends NoteBoxTool {
    rows = 2;
    cols = 2;
    colWidth = 80;
    rowHeight = 28;
    hAlign: HorzAlign = 'left';
    cells: string[][] = [['', ''], ['', '']];
    /** Duzenlenen hucre (satir ici editor); `text` bu hucreyi okur/yazar */
    editingCell: { row: number; col: number } | null = null;
    /** Bos metin de gecerlidir (hucre temizlenir; cizim silinmez) */
    readonly allowEmptyText = true;

    static readonly PAD_H = 6;
    static readonly PAD_V = 4;

    constructor() {
        super('table', { color: NOTE_COLORS.gray200 }, TABLE_BOX_DEFAULTS);
        this.box.fontSize = 12;
    }

    get text(): string {
        const c = this.editingCell;
        return c && this.cells[c.row] ? (this.cells[c.row][c.col] ?? '') : '';
    }
    set text(v: string) { this.setSettingValue('text', v); }

    get width(): number { return this.cols * this.colWidth; }
    get height(): number { return this.rows * this.rowHeight; }

    private _resize(rows: number, cols: number): void {
        const r = Math.max(TABLE_MIN, Math.min(TABLE_MAX, Math.round(rows) || (Number(rows) === 0 ? TABLE_MIN : this.rows)));
        const c = Math.max(TABLE_MIN, Math.min(TABLE_MAX, Math.round(cols) || (Number(cols) === 0 ? TABLE_MIN : this.cols)));
        const next: string[][] = [];
        for (let i = 0; i < r; i++) {
            next.push(Array.from({ length: c }, (_, j) => this.cells[i]?.[j] ?? ''));
        }
        this.rows = r; this.cols = c; this.cells = next;
        if (this.editingCell && (this.editingCell.row >= r || this.editingCell.col >= c)) this.editingCell = null;
    }

    /** Hucre metnini yazar (satir/sutun sinir disindaysa yok sayilir) */
    setCell(row: number, col: number, text: string): void {
        if (row < 0 || col < 0 || row >= this.rows || col >= this.cols) return;
        this.cells[row][col] = text;
    }

    getCell(row: number, col: number): string { return this.cells[row]?.[col] ?? ''; }

    layout(pts: Pt[]): void {
        if (pts.length < 1) { this._setHit([], [], [], null); return; }
        const a = pts[0];
        const r: Rect = { x: a.x, y: a.y, width: this.width, height: this.height };
        this._setHit(pts, [r], [], r);
    }

    /** Ekran noktasinin (css px) hucresi; tablo disindaysa null */
    cellAt(x: number, y: number): { row: number; col: number } | null {
        const b = this._bounds;
        if (!b || x < b.x || y < b.y || x >= b.x + b.width || y >= b.y + b.height) return null;
        return { row: Math.floor((y - b.y) / this.rowHeight), col: Math.floor((x - b.x) / this.colWidth) };
    }

    cellRect(row: number, col: number): Rect | null {
        const b = this._bounds;
        if (!b) return null;
        return { x: b.x + col * this.colWidth, y: b.y + row * this.rowHeight, width: this.colWidth, height: this.rowHeight };
    }

    beginCellEdit(row: number, col: number): boolean {
        if (row < 0 || col < 0 || row >= this.rows || col >= this.cols) return false;
        this.editingCell = { row, col };
        return true;
    }

    getEditorBounds(): Rect | null {
        const c = this.editingCell;
        return c ? this.cellRect(c.row, c.col) : null;
    }

    getEditorSpec(): EditorSpec {
        const b = this.box;
        return {
            fontSize: b.fontSize, bold: b.bold, italic: b.italic, wrap: false, wrapWidth: this.colWidth,
            padH: TableDrawing.PAD_H, padV: TableDrawing.PAD_V, radius: 0, minW: 10,
            center: false, align: this.hAlign, fixed: true,
            bg: b.bgVisible ? textBoxBackgroundCss(b) : 'transparent', color: this.style.color,
        };
    }

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                {
                    id: 'style', label: 'Style', sections: [
                        {
                            title: 'Size', rows: [
                                numberRow('rows', 'Rows', { min: TABLE_MIN, max: TABLE_MAX, step: 1 }),
                                numberRow('cols', 'Columns', { min: TABLE_MIN, max: TABLE_MAX, step: 1 }),
                                numberRow('colWidth', 'Column width', { min: 20, max: 400, step: 5 }),
                                numberRow('rowHeight', 'Row height', { min: 14, max: 200, step: 2 }),
                            ],
                        },
                        {
                            title: 'Background', rows: [
                                colorRow('backgroundColor', 'Color'),
                                { type: 'slider', key: 'backgroundTransparency', label: 'Transparency', min: 0, max: 100, step: 1, unit: '%', suffix: '%' } as any,
                            ],
                        },
                        { title: 'Border', rows: [checkboxRow('borderVisible', 'Border'), colorRow('borderColor', 'Color')] },
                    ],
                },
                {
                    id: 'textContent', label: 'Text', sections: [
                        {
                            rows: [
                                groupRow([
                                    colorRow('color', ''),
                                    selectRow('fontSize', '', fontSizeOptions()),
                                    checkboxRow('bold', 'B'),
                                    checkboxRow('italic', 'I'),
                                ]),
                                selectRow('horzAlign', 'Alignment', [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]),
                            ],
                        },
                    ],
                },
                createCoordinatesTab([]),
                createVisibilityTab(),
            ] as DrawingSettingsConfig['tabs'],
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Text Color', icon: 'textColor' } as AttributeBarItem,
            { type: 'color', key: 'backgroundColor', tooltip: 'Background', icon: 'fillBucket' } as AttributeBarItem,
            { type: 'color', key: 'borderColor', tooltip: 'Border' },
            { type: 'number', key: 'fontSize', tooltip: 'Font Size' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'text': return this.text;
            case 'color': return this.style.color;
            case 'rows': return this.rows;
            case 'cols': return this.cols;
            case 'colWidth': return this.colWidth;
            case 'rowHeight': return this.rowHeight;
            case 'horzAlign': return this.hAlign;
            case 'visible': return this.visible;
            default: return getTextBoxSetting(this.box, key);
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'text': {
                const c = this.editingCell;
                if (c) this.setCell(c.row, c.col, String(value ?? ''));
                this.editingCell = null;
                break;
            }
            case 'color': this.style.color = value; break;
            case 'rows': this._resize(Number(value), this.cols); break;
            case 'cols': this._resize(this.rows, Number(value)); break;
            case 'colWidth': { const n = Number(value); if (n > 0) this.colWidth = Math.max(20, Math.min(400, n)); break; }
            case 'rowHeight': { const n = Number(value); if (n > 0) this.rowHeight = Math.max(14, Math.min(200, n)); break; }
            case 'horzAlign': if (value === 'left' || value === 'center' || value === 'right') this.hAlign = value; break;
            case 'visible': this.visible = !!value; break;
            default: setTextBoxSetting(this.box, key, value);
        }
    }

    toJSON(): SerializedDrawing {
        return this._boxJSON({
            rows: this.rows, cols: this.cols, colWidth: this.colWidth, rowHeight: this.rowHeight,
            hAlign: this.hAlign, cells: this.cells.map(r => [...r]),
        });
    }

    protected _restoreExt(data: SerializedDrawing): void {
        this._restoreBox(data, { color: NOTE_COLORS.gray700, width: 1, visible: true });
        const e = data.ext;
        if (!e) return;
        if (typeof e.colWidth === 'number' && isFinite(e.colWidth) && e.colWidth > 0) this.colWidth = Math.max(20, Math.min(400, e.colWidth));
        if (typeof e.rowHeight === 'number' && isFinite(e.rowHeight) && e.rowHeight > 0) this.rowHeight = Math.max(14, Math.min(200, e.rowHeight));
        if (e.hAlign === 'left' || e.hAlign === 'center' || e.hAlign === 'right') this.hAlign = e.hAlign;
        this.rows = Math.max(TABLE_MIN, Math.min(TABLE_MAX, Math.round(e.rows) || 2));
        this.cols = Math.max(TABLE_MIN, Math.min(TABLE_MAX, Math.round(e.cols) || 2));
        const src: any[] = Array.isArray(e.cells) ? e.cells : [];
        this.cells = Array.from({ length: this.rows }, (_, i) =>
            Array.from({ length: this.cols }, (_, j) => (Array.isArray(src[i]) && typeof src[i][j] === 'string' ? src[i][j] : '')));
    }
}

// ============================================================================
// Fabrika
// ============================================================================

export type NoteToolDrawing = NoteDrawing | PriceNoteDrawing | PinDrawing | SignpostDrawing | CommentDrawing | TableDrawing;

export function createNoteTool(type: NoteToolType): NoteToolDrawing {
    switch (type) {
        case 'note': return new NoteDrawing();
        case 'priceNote': return new PriceNoteDrawing();
        case 'pin': return new PinDrawing();
        case 'signpost': return new SignpostDrawing();
        case 'comment': return new CommentDrawing();
        default: return new TableDrawing();
    }
}
