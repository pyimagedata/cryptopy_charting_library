/**
 * Price Range Drawing Implementation
 * 
 * A 2-point drawing tool for measuring the vertical distance between two price levels.
 * Shows the difference in price, percentage change, and distance.
 * 
 * Points:
 * - Point 0: Start point (time1, price1)
 * - Point 1: End point (time2, price2)
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
} from './drawing-settings-config';

export interface PriceRangeOptions {
    color?: string;
    fillColor?: string;
}

export class PriceRangeDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'priceRange';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    private _fillColor: string = 'rgba(33, 150, 243, 0.2)'; // Default light blue

    // Cached pixel coordinates for hit testing
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: PriceRangeOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#2196f3',
            lineWidth: 2,
        };
        if (options.fillColor) this._fillColor = options.fillColor;
    }

    // =========================================================================
    // Property Accessors
    // =========================================================================

    get fillColor(): string { return this._fillColor; }
    set fillColor(value: string) { this._fillColor = value; }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    {
                        title: 'Lines',
                        rows: [
                            colorRow('color', 'Line Color'),
                        ]
                    },
                    {
                        title: 'Background',
                        rows: [
                            colorRow('fillColor', 'Background Color'),
                        ]
                    }
                ]),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Line Color' },
            { type: 'color', key: 'fillColor', tooltip: 'Background Color' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'color': return this.style.color;
            case 'fillColor': return this._fillColor;
            case 'visible': return this.visible;
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'color': this.style.color = value; break;
            case 'fillColor': this._fillColor = value; break;
            case 'visible': this.visible = value; break;
        }
    }

    // =========================================================================
    // Drawing Interface Implementation
    // =========================================================================

    addPoint(time: number, price: number): void {
        this.points.push({ time, price });

        if (this.points.length >= 2) {
            this.state = 'complete';
        }
    }

    isComplete(): boolean {
        return this.points.length >= 2;
    }

    updateLastPoint(time: number, price: number): void {
        if (this.points.length === 0) return;

        if (this.points.length === 1) {
            this.points.push({ time, price });
        } else {
            this.points[this.points.length - 1] = { time, price };
        }
    }

    // =========================================================================
    // Metrics Calculations
    // =========================================================================

    getStartPrice(): number {
        return this.points.length > 0 ? this.points[0].price : 0;
    }

    getEndPrice(): number {
        return this.points.length > 1 ? this.points[1].price : this.getStartPrice();
    }

    getPriceChange(): number {
        return this.getEndPrice() - this.getStartPrice();
    }

    getPercentageChange(): number {
        const start = this.getStartPrice();
        if (start === 0) return 0;
        return (this.getPriceChange() / start) * 100;
    }

    // =========================================================================
    // Pixel Coordinates
    // =========================================================================

    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = [...points];
    }

    getPixelPoints(): { x: number; y: number }[] {
        return this._pixelPoints;
    }

    // =========================================================================
    // Hit Testing
    // =========================================================================

    hitTest(x: number, y: number, threshold: number = 8): boolean {
        if (this._pixelPoints.length < 2) return false;

        const p1 = this._pixelPoints[0];
        const p2 = this._pixelPoints[1];

        const left = Math.min(p1.x, p2.x);
        const right = Math.max(p1.x, p2.x);
        const top = Math.min(p1.y, p2.y);
        const bottom = Math.max(p1.y, p2.y);

        // Check if point is inside the rectangle area (with threshold)
        return (
            x >= left - threshold &&
            x <= right + threshold &&
            y >= top - threshold &&
            y <= bottom + threshold
        );
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length < 2) return null;

        const p1 = this._pixelPoints[0];
        const p2 = this._pixelPoints[1];

        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const width = Math.abs(p2.x - p1.x);
        const height = Math.abs(p2.y - p1.y);

        return { x, y, width, height };
    }

    // =========================================================================
    // Serialization
    // =========================================================================

    toJSON(): SerializedDrawing {
        return {
            id: this.id,
            type: this.type,
            points: [...this.points],
            style: {
                ...this.style,
                fillColor: this._fillColor
            },
            state: this.state === 'selected' ? 'complete' : this.state,
            visible: this.visible,
            locked: this.locked,
        };
    }

    static fromJSON(data: SerializedDrawing): PriceRangeDrawing {
        const drawing = new PriceRangeDrawing({
            color: data.style.color,
            fillColor: data.style.fillColor,
        });

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
