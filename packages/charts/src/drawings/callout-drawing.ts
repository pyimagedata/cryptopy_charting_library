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
    colorRow,
    checkboxRow,
    textareaRow,
    groupRow,
    selectRow,
    lineWidthRow,
    createCoordinatesTab
} from './drawing-settings-config';

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
    private _fontSize: number = 14;
    private _bold: boolean = false;
    private _italic: boolean = false;
    private _backgroundColor: string = 'rgba(255, 82, 82, 0.2)';
    private _borderColor: string = '#FF5252';
    private _borderWidth: number = 2;
    private _wrap: boolean = false;

    constructor(options: CalloutOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#2196f3',
        };
        if (options.text) this._text = options.text;
        if (options.fontSize) this._fontSize = options.fontSize;
        if (options.bold) this._bold = options.bold;
        if (options.italic) this._italic = options.italic;
        if (options.backgroundColor) this._backgroundColor = options.backgroundColor;
    }

    // =========================================================================
    // Property Accessors
    // =========================================================================

    get text(): string { return this._text; }
    set text(value: string) { this._text = value; }

    get fontSize(): number { return this._fontSize; }
    set fontSize(value: number) { this._fontSize = value; }

    get bold(): boolean { return this._bold; }
    set bold(value: boolean) { this._bold = value; }

    get italic(): boolean { return this._italic; }
    set italic(value: boolean) { this._italic = value; }

    get backgroundColor(): string { return this._backgroundColor; }
    set backgroundColor(value: string) { this._backgroundColor = value; }

    get borderColor(): string { return this._borderColor; }
    set borderColor(value: string) { this._borderColor = value; }

    get borderWidth(): number { return this._borderWidth; }
    set borderWidth(value: number) { this._borderWidth = value; }

    get wrap(): boolean { return this._wrap; }
    set wrap(value: boolean) { this._wrap = value; }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                {
                    id: 'style',
                    label: 'Text',
                    sections: [
                        {
                            rows: [
                                groupRow([
                                    colorRow('color', ''),
                                    selectRow('fontSize', '', [
                                        { value: '10', label: '10' },
                                        { value: '12', label: '12' },
                                        { value: '14', label: '14' },
                                        { value: '16', label: '16' },
                                        { value: '20', label: '20' },
                                        { value: '24', label: '24' },
                                        { value: '28', label: '28' },
                                        { value: '32', label: '32' },
                                        { value: '40', label: '40' },
                                        { value: '48', label: '48' },
                                    ]),
                                    checkboxRow('bold', 'B'),
                                    checkboxRow('italic', 'I'),
                                ]),
                                textareaRow('text'),
                                colorRow('backgroundColor', 'Background'),
                                groupRow([
                                    colorRow('borderColor', ''),
                                    lineWidthRow('borderWidth', ''),
                                ], 'Border'),
                                checkboxRow('wrap', 'Text wrap'),
                            ]
                        }
                    ]
                },
                createCoordinatesTab([
                    {
                        rows: [
                            // Points section is handled automatically by GenericSettingsModal if no config
                            // But since we are providing config, we should ideally define it.
                            // For simplicity, let's just use the default section name if possible.
                            // GenericSettingsModal.renderTabContent('coordinates') calls createPointsSection(drawing)
                        ]
                    }
                ]),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Text Color' },
            { type: 'number', key: 'fontSize', tooltip: 'Font Size' },
            { type: 'color', key: 'backgroundColor', tooltip: 'Background' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'text': return this._text;
            case 'color': return this.style.color;
            case 'fontSize': return String(this._fontSize);
            case 'bold': return this._bold;
            case 'italic': return this._italic;
            case 'backgroundColor': return this._backgroundColor;
            case 'borderColor': return this._borderColor;
            case 'borderWidth': return this._borderWidth;
            case 'wrap': return this._wrap;
            case 'visible': return this.visible;
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'text': this._text = value; break;
            case 'color': this.style.color = value; break;
            case 'fontSize': this._fontSize = parseInt(value); break;
            case 'bold': this._bold = value; break;
            case 'italic': this._italic = value; break;
            case 'backgroundColor': this._backgroundColor = value; break;
            case 'borderColor': this._borderColor = value; break;
            case 'borderWidth': this._borderWidth = value; break;
            case 'wrap': this._wrap = value; break;
            case 'visible': this.visible = value; break;
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

    hitTest(x: number, y: number, threshold: number = 8): boolean {
        if (this.points.length === 0) return false;

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
            fontSize: this._fontSize,
            fontWeight: this._bold ? 'bold' : 'normal',
            fontStyle: this._italic ? 'italic' : 'normal',
            fillColor: this._backgroundColor,
        };
    }

    static fromJSON(data: SerializedDrawing): CalloutDrawing {
        const drawing = new CalloutDrawing({
            color: data.style.color,
            text: data.text,
            fontSize: data.fontSize,
            bold: data.fontWeight === 'bold',
            italic: data.fontStyle === 'italic',
        });

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        if (data.fillColor) drawing.backgroundColor = data.fillColor;

        return drawing;
    }
}
