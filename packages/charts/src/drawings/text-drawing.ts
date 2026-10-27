/**
 * Text Drawing Implementation
 * 
 * A 1-point drawing tool for displaying text labels on the chart.
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
    createCoordinatesTab,
} from './drawing-settings-config';

import {
    TV_COLORS,
    TextBoxState,
    TEXT_BOX_DEFAULTS,
    createTextBoxState,
    getTextBoxSetting,
    setTextBoxSetting,
    textBoxToJSON,
    textBoxFromJSON,
    textBoxSettingsSections,
} from './text-common';

export interface TextOptions {
    color?: string;
    text?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
}

export class TextDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'text';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    private _text: string = 'Text';
    /** Metin kutusu ayarlari (yazi tipi, arka plan, kenarlik, kelime kaydirma) */
    readonly box: TextBoxState = createTextBoxState(TEXT_BOX_DEFAULTS);
    /** Gecici: satir ici editor acikken cizim metni/kutuyu cizmez (serilestirilmez) */
    editing: boolean = false;

    constructor(options: TextOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || TV_COLORS.blue,
        };
        if (options.text) this._text = options.text;
        if (options.fontSize) this.box.fontSize = options.fontSize;
        if (options.bold) this.box.bold = options.bold;
        if (options.italic) this.box.italic = options.italic;
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

    get borderColor(): string { return this.box.borderColor; }
    set borderColor(value: string) { this.box.borderColor = value; }

    get borderWidth(): number { return this.box.borderWidth; }
    set borderWidth(value: number) { this.box.borderWidth = value; }

    get backgroundVisible(): boolean { return this.box.bgVisible; }
    set backgroundVisible(value: boolean) { this.box.bgVisible = value; }

    get borderVisible(): boolean { return this.box.borderVisible; }
    set borderVisible(value: boolean) { this.box.borderVisible = value; }

    get wrap(): boolean { return this.box.wrap; }
    set wrap(value: boolean) { this.box.wrap = value; }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        const sec = textBoxSettingsSections({ toggles: true });
        return {
            tabs: [
                { id: 'textContent', label: 'Text', sections: sec.text },
                { id: 'style', label: 'Style', sections: sec.style },
                createCoordinatesTab([]),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Text Color', icon: 'textColor' } as AttributeBarItem,
            { type: 'color', key: 'backgroundColor', tooltip: 'Background', icon: 'fillBucket' } as AttributeBarItem,
            { type: 'color', key: 'borderColor', tooltip: 'Border', icon: 'pencil' } as AttributeBarItem,
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
            default: setTextBoxSetting(this.box, key, value);
        }
    }

    // =========================================================================
    // Drawing Interface Implementation
    // =========================================================================

    addPoint(time: number, price: number): void {
        this.points.push({ time, price });

        // Single point drawing is complete after first point
        if (this.points.length >= 1) {
            this.state = 'complete';
        }
    }

    isComplete(): boolean {
        return this.points.length >= 1;
    }

    updateLastPoint(time: number, price: number): void {
        if (this.points.length === 0) return;
        this.points[this.points.length - 1] = { time, price };
    }

    hitTest(x: number, y: number, threshold: number = 8): boolean {
        if (this.points.length === 0) return false;

        // Note: Actual hit testing for text requires measurement on canvas,
        // which usually happens in the renderer. For now, a rough estimate.
        // The DrawingManager or PaneWidget will usually provide the actual bounds.
        const bounds = this.getBounds();
        if (!bounds) return false;

        return (
            x >= bounds.x - threshold &&
            x <= bounds.x + bounds.width + threshold &&
            y >= bounds.y - threshold &&
            y <= bounds.y + bounds.height + threshold
        );
    }

    private _cachedBounds: { x: number; y: number; width: number; height: number } | null = null;

    setCachedBounds(bounds: { x: number; y: number; width: number; height: number }): void {
        this._cachedBounds = bounds;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._cachedBounds) return this._cachedBounds;

        // Default tiny bounds centered on the point if not cached
        if (this.points.length === 0) return null;
        return null; // Will be set by renderer
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
            fillColor: this.box.bgColor,
            textBox: textBoxToJSON(this.box),
        };
    }

    static fromJSON(data: SerializedDrawing): TextDrawing {
        const drawing = new TextDrawing({
            color: data.style.color,
            text: data.text,
        });
        // Eski kayitlarda metin bos olabilir; bos metin de korunur
        if (data.text === '') drawing._text = '';

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        // Eski Text: arka plan/kenarlik hic gorunmezdi
        textBoxFromJSON(drawing.box, data, { color: TV_COLORS.gray550, width: 1, visible: false });
        if (drawing.box.legacy) drawing.box.bgVisible = false;

        return drawing;
    }
}
