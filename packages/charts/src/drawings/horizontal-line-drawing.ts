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

export interface HorizontalLineOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    showPrice?: boolean;
}

/**
 * Horizontal Line - A line that spans the entire chart width at a specific price
 */
export class HorizontalLineDrawing implements Drawing, DrawingSettingsProvider {
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
                            checkboxRow('showPrice', 'Show Price'),
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
            case 'lineStyle':
                if (!this.style.lineDash || this.style.lineDash.length === 0) return 'solid';
                if (this.style.lineDash[0] === 5) return 'dashed';
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
                else if (value === 'dashed') this.style.lineDash = [5, 5];
                else if (value === 'dotted') this.style.lineDash = [2, 2];
                break;
            case 'showPrice':
                this.showPrice = value;
                break;
        }
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

        ctx.save();
        ctx.strokeStyle = this.style.color;
        ctx.lineWidth = this.style.lineWidth * dpr;
        if (this.style.lineDash && this.style.lineDash.length > 0) {
            ctx.setLineDash(this.style.lineDash.map(d => d * dpr));
        }

        // Draw line across entire canvas width (in DPR-scaled coordinates)
        const yScaled = y * dpr;
        ctx.beginPath();
        ctx.moveTo(0, yScaled);
        ctx.lineTo(canvasWidth * dpr, yScaled);
        ctx.stroke();

        // Draw price label on the right side
        if (this.showPrice) {
            const priceText = this.points[0].price.toFixed(2);
            ctx.font = `${11 * dpr}px Arial`;
            const textMetrics = ctx.measureText(priceText);
            const padding = 4 * dpr;
            const labelWidth = textMetrics.width + padding * 2;
            const labelHeight = 16 * dpr;

            // Background
            ctx.fillStyle = this.style.color;
            ctx.fillRect(canvasWidth * dpr - labelWidth - 5 * dpr, yScaled - labelHeight / 2, labelWidth, labelHeight);

            // Text
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(priceText, canvasWidth * dpr - 5 * dpr - padding, yScaled);
        }

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
        return drawing;
    }
}
