/**
 * Price Label Drawing Implementation
 * 
 * A 1-point drawing tool that automatically displays the price at its location.
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
    createStyleTab,
    createVisibilityTab,
    colorRow,
    numberRow,
    checkboxRow
} from './drawing-settings-config';

export interface PriceLabelOptions {
    color?: string;
    fontSize?: number;
    backgroundColor?: string;
}

export class PriceLabelDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'priceLabel';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    private _fontSize: number = 12;
    private _backgroundColor: string = '#2196f3';
    private _bold: boolean = true;

    constructor(options: PriceLabelOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#ffffff',
        };
        if (options.fontSize) this._fontSize = options.fontSize;
        if (options.backgroundColor) this._backgroundColor = options.backgroundColor;
    }

    // =========================================================================
    // Property Accessors
    // =========================================================================

    get fontSize(): number { return this._fontSize; }
    set fontSize(value: number) { this._fontSize = value; }

    get backgroundColor(): string { return this._backgroundColor; }
    set backgroundColor(value: string) { this._backgroundColor = value; }

    get bold(): boolean { return this._bold; }
    set bold(value: boolean) { this._bold = value; }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    {
                        title: 'Appearance',
                        rows: [
                            colorRow('color', 'Text Color'),
                            colorRow('backgroundColor', 'Background Color'),
                            numberRow('fontSize', 'Font Size', { min: 8, max: 72 }),
                            checkboxRow('bold', 'Bold'),
                        ]
                    }
                ]),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'backgroundColor', tooltip: 'Background Color' },
            { type: 'color', key: 'color', tooltip: 'Text Color' },
            { type: 'number', key: 'fontSize', tooltip: 'Font Size' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'color': return this.style.color;
            case 'backgroundColor': return this._backgroundColor;
            case 'fontSize': return this._fontSize;
            case 'bold': return this._bold;
            case 'visible': return this.visible;
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'color': this.style.color = value; break;
            case 'backgroundColor': this._backgroundColor = value; break;
            case 'fontSize': this._fontSize = value; break;
            case 'bold': this._bold = value; break;
            case 'visible': this.visible = value; break;
        }
    }

    // =========================================================================
    // Drawing Interface Implementation
    // =========================================================================

    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
        this.state = 'complete';
    }

    isComplete(): boolean {
        return this.points.length >= 1;
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
        if (this.points.length === 0) return;
        this.points[0] = { time, price };
    }

    hitTest(x: number, y: number, threshold: number = 8): boolean {
        const bounds = this.getBounds();
        if (bounds) {
            return (
                x >= bounds.x - threshold &&
                x <= bounds.x + bounds.width + threshold &&
                y >= bounds.y - threshold &&
                y <= bounds.y + bounds.height + threshold
            );
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
            fontSize: this._fontSize,
            fontWeight: this._bold ? 'bold' : 'normal',
            fillColor: this._backgroundColor,
        };
    }

    static fromJSON(data: SerializedDrawing): PriceLabelDrawing {
        const drawing = new PriceLabelDrawing({
            color: data.style.color,
            fontSize: data.fontSize,
            backgroundColor: data.fillColor,
        });

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;
        drawing.bold = data.fontWeight === 'bold';

        return drawing;
    }
}
