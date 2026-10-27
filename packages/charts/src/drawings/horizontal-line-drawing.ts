/**
 * Horizontal Line Drawing Implementation
 * A horizontal line at a specific price level
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
    lineWidthRow,
    lineStyleRow,
    checkboxRow
} from './drawing-settings-config';

import {
    AxisLabelProvider,
    DrawingAxisLabels,
    applyTextFields,
    textFieldsToJSON,
    drawLabeledHorizontalLine,
    singlePriceAxisLabels,
    lineStyleFromDash,
    dashFromLineStyle
} from './line-tool-common';

export interface HorizontalLineOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    showPrice?: boolean;
}

/**
 * Horizontal Line - A line that spans the entire chart width at a specific price
 */
export class HorizontalLineDrawing implements Drawing, DrawingSettingsProvider, AxisLabelProvider {
    readonly id: string;
    readonly type: DrawingType = 'horizontalLine';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Options
    showPrice: boolean = true;

    // Cached pixel coordinates
    private _pixelY: number = 0;

    constructor(options: HorizontalLineOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#2962ff',
            lineWidth: options.lineWidth || 1,
            lineDash: options.lineDash || [],
            // TradingView varsayilani: metin 12px, yatayda orta, dikeyde cizgi uzerinde (orta)
            fontSize: 12,
            textHAlign: 'center',
            textVAlign: 'middle',
        };
        this.showPrice = options.showPrice !== false;
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    {
                        title: 'Horizontal Line',
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

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Line Color' },
            { type: 'lineWidth', key: 'lineWidth', tooltip: 'Line Width' },
            { type: 'lineStyle', key: 'lineStyle', tooltip: 'Line Style' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'color': return this.style.color;
            case 'lineWidth': return this.style.lineWidth;
            case 'lineStyle': return lineStyleFromDash(this.style.lineDash);
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
            case 'lineStyle': {
                const dash = dashFromLineStyle(value);
                if (dash) this.style.lineDash = dash;
                break;
            }
            case 'showPrice':
                this.showPrice = value;
                break;
        }
    }

    /** Fiyat ekseninde cizgi renginde etiket (showPrice) */
    getAxisLabels(): DrawingAxisLabels {
        return singlePriceAxisLabels(this.showPrice, this.points, this.style.color);
    }

    // =========================================================================
    // Core Drawing Methods
    // =========================================================================

    addPoint(time: number, price: number): void {
        // Horizontal line needs only one point (for the price level)
        if (this.points.length === 0) {
            this.points.push({ time, price });
            this.state = 'complete';
        }
    }

    /** Update cached pixel coordinates */
    updatePixelCoordinates(
        _timeToPixel: (time: number) => number | null,
        priceToPixel: (price: number) => number | null
    ): void {
        if (this.points.length === 0) return;

        const y = priceToPixel(this.points[0].price);
        if (y !== null) {
            this._pixelY = y;
        }
    }

    /** Render the horizontal line */
    render(
        ctx: CanvasRenderingContext2D,
        _timeToPixel: (time: number) => number | null,
        priceToPixel: (price: number) => number | null,
        canvasWidth: number,
        dpr: number = 1
    ): void {
        if (this.points.length === 0 || !this.visible) return;

        const y = priceToPixel(this.points[0].price);
        if (y === null) return;

        this._pixelY = y;

        // Tum genislik boyunca cizgi + (varsa) hizali metin; fiyat etiketi eksende cizilir
        const yScaled = y * dpr;
        ctx.save();
        drawLabeledHorizontalLine(ctx, this.style, yScaled, 0, canvasWidth * dpr, dpr, 'middle');

        // Selection handles
        if (this.state === 'selected' || this.state === 'editing') {
            this._drawHandle(ctx, canvasWidth * dpr / 2, yScaled, dpr);
        }

        ctx.restore();
    }

    private _drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number, dpr: number = 1): void {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = this.style.color;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    hitTest(_x: number, y: number, threshold: number): boolean {
        if (this.points.length === 0) return false;
        return Math.abs(y - this._pixelY) <= threshold;
    }

    hitTestControlPoint(_x: number, y: number, threshold: number): number {
        if (this.points.length === 0) return -1;
        // Single control point in the middle
        if (Math.abs(y - this._pixelY) <= threshold) {
            return 0;
        }
        return -1;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this.points.length === 0) return null;
        return {
            x: 0,
            y: this._pixelY - 5,
            width: 10000, // Full width
            height: 10
        };
    }

    toJSON(): SerializedDrawing {
        return {
            id: this.id,
            type: this.type,
            points: [...this.points],
            style: { ...this.style },
            state: this.state,
            visible: this.visible,
            locked: this.locked,
            showPrices: this.showPrice,
            ...textFieldsToJSON(this.style),
        };
    }

    static fromJSON(data: SerializedDrawing): HorizontalLineDrawing {
        const drawing = new HorizontalLineDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            lineDash: data.style.lineDash,
            showPrice: data.showPrices,
        });
        (drawing as any).id = data.id;
        drawing.points = [...data.points];
        drawing.state = data.state;
        drawing.visible = data.visible;
        drawing.locked = data.locked;
        applyTextFields(drawing.style, data);
        return drawing;
    }
}
