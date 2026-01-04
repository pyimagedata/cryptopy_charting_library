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
    colorRow,
    checkboxRow,
    textareaRow,
    toggleColorRow,
    groupRow,
    selectRow,
} from './drawing-settings-config';

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
    private _fontSize: number = 14;
    private _bold: boolean = false;
    private _italic: boolean = false;
    private _backgroundColor: string = 'rgba(41, 98, 255, 0.2)';
    private _borderColor: string = '#2962ff';
    private _borderWidth: number = 1;

    private _backgroundVisible: boolean = false;
    private _borderVisible: boolean = false;
    private _wrap: boolean = false;

    constructor(options: TextOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#2196f3',
        };
        if (options.text) this._text = options.text;
        if (options.fontSize) this._fontSize = options.fontSize;
        if (options.bold) this._bold = options.bold;
        if (options.italic) this._italic = options.italic;
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

    get backgroundVisible(): boolean { return this._backgroundVisible; }
    set backgroundVisible(value: boolean) { this._backgroundVisible = value; }

    get borderVisible(): boolean { return this._borderVisible; }
    set borderVisible(value: boolean) { this._borderVisible = value; }

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
                                        { value: '11', label: '11' },
                                        { value: '12', label: '12' },
                                        { value: '14', label: '14' },
                                        { value: '16', label: '16' },
                                        { value: '20', label: '20' },
                                        { value: '24', label: '24' },
                                        { value: '28', label: '28' },
                                        { value: '32', label: '32' },
                                        { value: '40', label: '40' },
                                    ]),
                                    checkboxRow('bold', 'B'),
                                    checkboxRow('italic', 'I'),
                                ]),
                                textareaRow('text'),
                                toggleColorRow('Background', 'backgroundVisible', 'backgroundColor'),
                                toggleColorRow('Border', 'borderVisible', 'borderColor'),
                                checkboxRow('wrap', 'Text wrap'),
                            ]
                        }
                    ]
                },
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
            case 'backgroundVisible': return this._backgroundVisible;
            case 'borderVisible': return this._borderVisible;
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
            case 'backgroundVisible': this._backgroundVisible = value; break;
            case 'borderVisible': this._borderVisible = value; break;
            case 'wrap': this._wrap = value; break;
            case 'visible': this.visible = value; break;
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
            fontSize: this._fontSize,
            fontWeight: this._bold ? 'bold' : 'normal',
            fontStyle: this._italic ? 'italic' : 'normal',
            fillColor: this._backgroundColor,
            // borderColor and borderWidth could be added to DrawingStyle or SerializedDrawing if needed
        };
    }

    static fromJSON(data: SerializedDrawing): TextDrawing {
        const drawing = new TextDrawing({
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
