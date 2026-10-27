/**
 * Callout Drawing Implementation
 * 
 * A 2-point drawing tool for displaying text labels with a pointer to a specific chart location.
 */

import {
    Drawing,
    DrawingPoint,
    DrawingStyle,
    DrawingState,
    DrawingType,
    DEFAULT_DRAWING_STYLE,
    generateDrawingId,
    SerializedDrawing
} from './drawing';

import {
    DrawingSettingsProvider,
    DrawingSettingsConfig,
    AttributeBarItem,
    createVisibilityTab,
    createCoordinatesTab
} from './drawing-settings-config';

import {
    TV_COLORS,
    TextBoxState,
    CALLOUT_BOX_DEFAULTS,
    createTextBoxState,
    getTextBoxSetting,
    setTextBoxSetting,
    textBoxToJSON,
    textBoxFromJSON,
    textBoxSettingsSections,
    withAlpha,
    EditorSpec,
} from './text-common';
import { numberRow, checkboxRow } from './drawing-settings-config';

// ----------------------------------------------------------------------------
// Geometri (TradingView Callout): saf fonksiyonlar, canvas gerektirmez
// ----------------------------------------------------------------------------

/** Kose yaricapi */
export const CALLOUT_RADIUS = 8;
/** Metin ile kose yayi arasindaki ek bosluk; her kenarda ic bosluk = RADIUS + MARGIN = 10 */
export const CALLOUT_MARGIN = 2;
/** Kelime kaydirma genisligi alt siniri (surukleme / ayar) */
export const CALLOUT_MIN_WRAP_WIDTH = 100;
export const CALLOUT_DEFAULT_WRAP_WIDTH = 200;

export type CalloutPathCmd =
    | { op: 'M'; x: number; y: number }
    | { op: 'L'; x: number; y: number }
    | { op: 'A'; x1: number; y1: number; x2: number; y2: number; r: number };

export interface CalloutGeometry {
    /** Kutunun sol ust kosesi ve toplam boyutu (ic bosluk dahil) */
    left: number; top: number; width: number; height: number;
    textWidth: number; textHeight: number;
    /**
     * Sabitin konumu: yatay (0 sol, 1 icinde, 2 sag) * 10 + dikey (0 ust, 1 icinde, 2 alt) sirasiyla
     * TV kodu: 0 sol-ust kose, 1 sol, 2 sol-alt, 10 ust, 11 icinde, 12 alt, 20 sag-ust, 21 sag, 22 sag-alt
     */
    region: number;
    /** Kutu sol ustune gore (0,0) yol komutlari; arcTo yuvarlak kose */
    cmds: CalloutPathCmd[];
}

/** Metin boyutu: satir yuksekligi = yazi boyutu; genislik = en genis satir (kaydirma aciksa kaydirma genisligi) */
export function calloutTextSize(
    maxLineWidth: number, lineCount: number, fontSize: number,
    wrap: boolean, wrapWidth: number, scale: number = 1,
): { textWidth: number; textHeight: number } {
    const textWidth = wrap ? Math.max(CALLOUT_MIN_WRAP_WIDTH, wrapWidth) * scale : maxLineWidth;
    return { textWidth, textHeight: fontSize * scale * Math.max(1, lineCount) };
}

/**
 * Kutu (merkez = nokta 2) ve sabit (nokta 1) icin dis hat yolu. Sabit kutunun 8 bolgesinden
 * birindeyse kenarda kama (taban 2*radius, kutu merkezine ortali; kenar yeterince uzunsa) ya da kosede
 * iki dogru olusur; kutunun icindeyse kuyruk yoktur.
 */
export function buildCalloutGeometry(
    anchor: { x: number; y: number }, center: { x: number; y: number },
    textWidth: number, textHeight: number, scale: number = 1,
): CalloutGeometry {
    const o = CALLOUT_RADIUS * scale;
    const m = CALLOUT_MARGIN * scale;
    const w = textWidth + 2 * m + 2 * o;
    const h = textHeight + 2 * m + 2 * o;
    const left = center.x - w / 2;
    const top = center.y - h / 2;
    let region = 0;
    if (anchor.x > left + w) region = 20; else if (anchor.x > left) region = 10;
    if (anchor.y > top + h) region += 2; else if (anchor.y > top) region += 1;

    const ax = anchor.x - left, ay = anchor.y - top;
    const cx = w / 2, cy = h / 2;
    const wideEnough = textWidth + 2 * m > 2 * o;
    const highEnough = textHeight + 2 * m > 2 * o;
    const cmds: CalloutPathCmd[] = [];
    const M = (x: number, y: number) => cmds.push({ op: 'M', x, y });
    const L = (x: number, y: number) => cmds.push({ op: 'L', x, y });
    const A = (x1: number, y1: number, x2: number, y2: number) => cmds.push({ op: 'A', x1, y1, x2, y2, r: o });

    M(o, 0);
    // ust kenar
    if (region === 10) {
        if (wideEnough) { L(cx - o, 0); L(ax, ay); L(cx + o, 0); L(w - o, 0); } else { L(ax, ay); L(w - o, 0); }
    } else L(w - o, 0);
    // sag-ust kose
    if (region === 20) { L(ax, ay); L(w, o); } else A(w, 0, w, o);
    // sag kenar
    if (region === 21) {
        if (highEnough) { L(w, cy - o); L(ax, ay); L(w, cy + o); L(w, h - o); } else { L(ax, ay); L(w, h - o); }
    } else L(w, h - o);
    // sag-alt kose
    if (region === 22) { L(ax, ay); L(w - o, h); } else A(w, h, w - o, h);
    // alt kenar
    if (region === 12) {
        if (wideEnough) { L(cx + o, h); L(ax, ay); L(cx - o, h); L(o, h); } else { L(ax, ay); L(o, h); }
    } else L(o, h);
    // sol-alt kose
    if (region === 2) { L(ax, ay); L(0, h - o); } else A(0, h, 0, h - o);
    // sol kenar
    if (region === 1) {
        if (highEnough) { L(0, cy + o); L(ax, ay); L(0, cy - o); L(0, o); } else { L(ax, ay); L(0, o); }
    } else L(0, o);
    // sol-ust kose
    if (region === 0) { L(ax, ay); L(o, 0); } else A(0, 0, o, 0);

    return { left, top, width: w, height: h, textWidth, textHeight, region, cmds };
}

/** Kelime kaydirma tutamacinin x'i: kutu merkezi + wrapWidth/2 + radius + margin */
export function calloutWrapHandleX(centerX: number, wrapWidth: number, scale: number = 1): number {
    return centerX + (Math.max(CALLOUT_MIN_WRAP_WIDTH, wrapWidth) / 2 + CALLOUT_RADIUS + CALLOUT_MARGIN) * scale;
}

/** Tutamac x'inden (px) kaydirma genisligi (alt sinirli) */
export function calloutWrapWidthFromHandle(handleX: number, centerX: number): number {
    return Math.max(CALLOUT_MIN_WRAP_WIDTH, Math.round(2 * (handleX - centerX - CALLOUT_RADIUS - CALLOUT_MARGIN)));
}

export interface CalloutOptions {
    color?: string;
    text?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    backgroundColor?: string;
}

export class CalloutDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'callout';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    private _text: string = 'Callout';
    /** Metin kutusu ayarlari (yazi tipi, arka plan, kenarlik, kelime kaydirma) */
    readonly box: TextBoxState = createTextBoxState(CALLOUT_BOX_DEFAULTS);
    /** Gecici: satir ici editor acikken cizim cizilmez (serilestirilmez) */
    editing: boolean = false;
    /** Gecici: editor acikken textarea'daki canli metin (kutu boyutu buna uyar; serilestirilmez) */
    editText: string | null = null;

    constructor(options: CalloutOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || TV_COLORS.white,
        };
        if (options.text) this._text = options.text;
        if (options.fontSize) this.box.fontSize = options.fontSize;
        if (options.bold) this.box.bold = options.bold;
        if (options.italic) this.box.italic = options.italic;
        if (options.backgroundColor) setTextBoxSetting(this.box, 'backgroundColor', options.backgroundColor);
    }

    // =========================================================================
    // Property Accessors
    // =========================================================================

    get text(): string { return this._text; }
    set text(value: string) { this._text = value; }

    get fontSize(): number { return this.box.fontSize; }
    set fontSize(value: number) { this.box.fontSize = value; }

    get bold(): boolean { return this.box.bold; }
    set bold(value: boolean) { this.box.bold = value; }

    get italic(): boolean { return this.box.italic; }
    set italic(value: boolean) { this.box.italic = value; }

    /** Arka plan rengi (rgba, opaklik dahil) */
    get backgroundColor(): string { return withAlpha(this.box.bgColor, this.box.bgOpacity); }
    set backgroundColor(value: string) { setTextBoxSetting(this.box, 'backgroundColor', value); }

    get borderColor(): string { return this.box.borderColor; }
    set borderColor(value: string) { this.box.borderColor = value; }

    get borderWidth(): number { return this.box.borderWidth; }
    set borderWidth(value: number) { this.box.borderWidth = value; }

    get wrap(): boolean { return this.box.wrap; }
    set wrap(value: boolean) { this.box.wrap = value; }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        // TradingView: tek "Text" sekmesi (renk, boyut, B/I, metin, arka plan + saydamlik, kenarlik + kalinlik, kelime kaydirma)
        const sec = textBoxSettingsSections({ toggles: false, borderWidthRow: true });
        const style = sec.style.slice(0, 2);
        return {
            tabs: [
                {
                    id: 'textContent', label: 'Text',
                    sections: [
                        ...sec.text,
                        ...style,
                        { title: 'Text wrap', rows: [
                            checkboxRow('wrap', 'Word wrap'),
                            numberRow('wrapWidth', 'Wrap width', { min: CALLOUT_MIN_WRAP_WIDTH, max: 2000, step: 10 }),
                        ] },
                    ],
                },
                createCoordinatesTab([]),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Text Color' },
            { type: 'color', key: 'backgroundColor', tooltip: 'Background' },
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
            case 'visible': this.visible = value; break;
            case 'wrapWidth': { const n = Number(value); if (n > 0) this.box.wrapWidth = Math.max(CALLOUT_MIN_WRAP_WIDTH, Math.min(2000, n)); break; }
            default: setTextBoxSetting(this.box, key, value);
        }
    }

    // =========================================================================
    // Drawing Interface Implementation
    // =========================================================================

    addPoint(time: number, price: number): void {
        if (this.points.length === 0) {
            // First click: add both anchor and box center at the same position
            // (TradingView style - user will drag to place the box)
            this.points.push({ time, price });  // anchor
            this.points.push({ time, price });  // box center (same position initially)
        } else if (this.points.length === 2) {
            // Second click: finalize box center position
            this.points[1] = { time, price };
            this.state = 'complete';
        }
    }

    isComplete(): boolean {
        return this.state === 'complete';
    }

    // Cached pixel coordinates (updated by renderer)
    private _pixelPoints: { x: number; y: number }[] = [];

    /** Set cached pixel coordinates (called by renderer) */
    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = points;
    }

    /** Get pixel coordinates */
    getPixelPoints(): { x: number; y: number }[] {
        return this._pixelPoints;
    }

    updateLastPoint(time: number, price: number): void {
        // Always update the second point (box center)
        // First point (anchor) stays fixed after first click
        if (this.points.length >= 2) {
            this.points[1] = { time, price };
        }
    }

    /** Surukleme tutamaclari (CSS px): 0 = sabit (kuyruk ucu), 1 = kelime kaydirma (yalniz kaydirma aciksa) */
    private _handles: { x: number; y: number }[] = [];
    setHandlePoints(h: { x: number; y: number }[]): void { this._handles = h; }
    getHandlePoints(): { x: number; y: number }[] { return this._handles; }

    /** Satir ici editor: TV ile ayni ic bosluk (10), satir yuksekligi = yazi boyutu, yaricap 8 */
    getEditorSpec(): EditorSpec {
        const box = this.box;
        const pad = CALLOUT_RADIUS + CALLOUT_MARGIN;
        return {
            fontSize: box.fontSize, bold: box.bold, italic: box.italic, wrap: box.wrap,
            wrapWidth: Math.max(CALLOUT_MIN_WRAP_WIDTH, box.wrapWidth),
            padH: pad, padV: pad, radius: CALLOUT_RADIUS, minW: 0,
            center: true, align: box.legacy ? 'center' : 'left',
            // Kutu (dolgu + kenarlik + kuyruk) canvas'ta cizilir; textarea seffaf
            bg: 'transparent',
            color: this.style.color,
            lineHeightRatio: 1,
            extraW: 0,
            wrapFixed: true,
        };
    }

    hitTest(x: number, y: number, threshold: number = 8): boolean {
        if (this.points.length === 0) return false;

        // Sabit (kuyruk ucu) yakininda
        const tip = this._handles[0];
        if (tip && Math.hypot(x - tip.x, y - tip.y) <= threshold) return true;

        // Note: Actual hit test needs coordinate conversion which is handled in DrawingManager
        // For now, this is a placeholder as the real hit test loop in DrawingManager
        // will call this but we need access to scales.

        // However, Callout box hit test is more important.
        const bounds = this.getBounds();
        if (bounds) {
            if (x >= bounds.x - threshold && x <= bounds.x + bounds.width + threshold &&
                y >= bounds.y - threshold && y <= bounds.y + bounds.height + threshold) {
                return true;
            }
        }

        return false;
    }

    private _cachedBounds: { x: number; y: number; width: number; height: number } | null = null;

    setCachedBounds(bounds: { x: number; y: number; width: number; height: number }): void {
        this._cachedBounds = bounds;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        return this._cachedBounds;
    }

    // =========================================================================
    // Serialization
    // =========================================================================

    toJSON(): SerializedDrawing {
        return {
            id: this.id,
            type: this.type,
            points: [...this.points],
            style: { ...this.style },
            state: this.state === 'selected' ? 'complete' : this.state,
            visible: this.visible,
            locked: this.locked,
            text: this._text,
            fontSize: this.box.fontSize,
            fontWeight: this.box.bold ? 'bold' : 'normal',
            fontStyle: this.box.italic ? 'italic' : 'normal',
            fillColor: this.backgroundColor,
            textBox: textBoxToJSON(this.box),
        };
    }

    static fromJSON(data: SerializedDrawing): CalloutDrawing {
        const drawing = new CalloutDrawing({
            color: data.style.color,
            text: data.text,
        });
        if (data.text === '') drawing._text = '';

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        // Eski Callout: kenarlik #FF5252 / 2px gorunurdu, arka plan fillColor'dan
        textBoxFromJSON(drawing.box, data, { color: '#FF5252', width: 2, visible: true });
        if (drawing.box.legacy) drawing.box.bgVisible = true;

        return drawing;
    }
}
