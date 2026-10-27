/**
 * Horizontal Ray Drawing Implementation
 * A horizontal line that extends from a single point to the right
 */

import {
    Drawing,
    DrawingType,
    DrawingState,
    DrawingStyle,
    SerializedDrawing
} from './drawing';

import {
    DrawingSettingsConfig,
    AttributeBarItem,
    createStyleTab,
    createVisibilityTab,
    colorRow,
    lineWidthRow,
    lineStyleRow,
    checkboxRow
} from './drawing-settings-config';

import {
    AxisLabelProvider,
    DrawingAxisLabels,
    applyTextFields,
    textFieldsToJSON,
    singlePriceAxisLabels
} from './line-tool-common';

const generateId = () => `hray-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export interface HorizontalRayOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    showPrice?: boolean;
}

/**
 * Horizontal Ray - A horizontal line that extends from anchor point to the right edge
 */
export class HorizontalRayDrawing implements Drawing, AxisLabelProvider {
    readonly id: string = generateId();
    readonly type: DrawingType = 'horizontalRay';

    points: { time: number; price: number }[] = [];
    state: DrawingState = 'creating';
    style: DrawingStyle;
    visible: boolean = true;
    locked: boolean = false;

    // Show price label on the line
    showPrice: boolean = true;

    constructor(options: HorizontalRayOptions = {}) {
        this.style = {
            color: options.color || '#2962ff',
            lineWidth: options.lineWidth || 2,
            lineDash: options.lineDash || [],
            // TradingView varsayilani: metin 12px, ortada, cizginin ustunde
            fontSize: 12,
            textHAlign: 'center',
            textVAlign: 'top',
        };
        this.showPrice = options.showPrice !== false;
    }

    addPoint(time: number, price: number): void {
        if (this.points.length < 1) {
            this.points.push({ time, price });
            // Horizontal Ray is complete after 1 point
            this.state = 'complete';
        }
    }

    updateLastPoint(time: number, price: number): void {
        if (this.points.length > 0) {
            this.points[this.points.length - 1] = { time, price };
        }
    }

    isComplete(): boolean {
        return this.points.length >= 1 && this.state !== 'creating';
    }

    // Cached pixel coordinates (updated by renderer)
    private _pixelPoints: { x: number; y: number }[] = [];

    /** Set cached pixel coordinates (called by renderer) */
    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = points;
    }

    hitTest(x: number, y: number, threshold: number = 5): boolean {
        if (this._pixelPoints.length < 1) return false;

        const p = this._pixelPoints[0];

        // Check if x is to the left of the start point
        if (x < p.x - threshold) {
            // Check distance to the start point
            const dx = x - p.x;
            const dy = y - p.y;
            return Math.sqrt(dx * dx + dy * dy) <= threshold;
        }

        // For x >= p.x (or close to it), check vertical distance to the line
        return Math.abs(y - p.y) <= threshold;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        // Bounds calculated at render time based on pixel coordinates
        return null;
    }

    /** Fiyat ekseninde cizgi renginde etiket (showPrice) */
    getAxisLabels(): DrawingAxisLabels {
        return singlePriceAxisLabels(this.showPrice, this.points, this.style.color);
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Line Color' },
            { type: 'lineWidth', key: 'lineWidth', tooltip: 'Line Width' },
            { type: 'lineStyle', key: 'lineStyle', tooltip: 'Line Style' },
        ];
    }

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    {
                        title: 'Horizontal Ray',
                        rows: [
                            colorRow('color', 'Line Color'),
                            lineWidthRow('lineWidth'),
                            lineStyleRow('lineStyle'),
                        ]
                    },
                    {
                        title: 'Labels',
                        rows: [
                            checkboxRow('showPrice', 'Price label'),
                        ]
                    }
                ]),
                createVisibilityTab()
            ]
        };
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'color': return this.style.color;
            case 'lineWidth': return this.style.lineWidth;
            case 'lineStyle':
                if (!this.style.lineDash || this.style.lineDash.length === 0) return 'solid';
                if (this.style.lineDash.length === 2 && this.style.lineDash[0] === 6) return 'dashed';
                return 'dotted';
            case 'showPrice': return this.showPrice;
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'color':
                this.style.color = value;
                break;
            case 'lineWidth':
                this.style.lineWidth = value;
                break;
            case 'lineStyle':
                if (value === 'solid') this.style.lineDash = [];
                else if (value === 'dashed') this.style.lineDash = [6, 4];
                else if (value === 'dotted') this.style.lineDash = [2, 2];
                break;
            case 'showPrice':
                this.showPrice = value;
                break;
        }
    }

    toJSON(): SerializedDrawing {
        return {
            id: this.id,
            type: this.type,
            points: [...this.points],
            state: this.state,
            style: { ...this.style },
            visible: this.visible,
            locked: this.locked,
            showPrices: this.showPrice,
            ...textFieldsToJSON(this.style),
        };
    }

    static fromJSON(data: SerializedDrawing): HorizontalRayDrawing {
        const drawing = new HorizontalRayDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            lineDash: data.style.lineDash,
            showPrice: data.showPrices,
        });

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });

        drawing.points = [...data.points];
        drawing.state = data.state;
        drawing.visible = data.visible;
        drawing.locked = data.locked;
        applyTextFields(drawing.style, data);

        return drawing;
    }
}
