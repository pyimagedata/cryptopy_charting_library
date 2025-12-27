/**
 * Vertical Line Drawing Implementation
 * A vertical line at a specific time point
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

export interface VerticalLineOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    showTime?: boolean;
}

/**
 * Vertical Line - A line that spans the entire chart height at a specific time
 */
export class VerticalLineDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'verticalLine';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Options
    showTime: boolean = true;

    // Cached pixel coordinates
    private _pixelX: number = 0;

    constructor(options: VerticalLineOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#2962ff',
            lineWidth: options.lineWidth || 1,
            lineDash: options.lineDash || [],
        };
        this.showTime = options.showTime !== false;
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    {
                        title: 'Vertical Line',
                        rows: [
                            colorRow('color', 'Line Color'),
                            lineWidthRow('lineWidth'),
                            lineStyleRow('lineStyle'),
                        ]
                    },
                    {
                        title: 'Labels',
                        rows: [
                            checkboxRow('showTime', 'Show Time'),
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
            case 'showTime': return this.showTime;
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
            case 'showTime':
                this.showTime = value;
                break;
        }
    }

    // =========================================================================
    // Core Drawing Methods
    // =========================================================================

    addPoint(time: number, price: number): void {
        // Vertical line needs only one point (for the time position)
        if (this.points.length === 0) {
            this.points.push({ time, price });
            this.state = 'complete';
        }
    }

    /** Update cached pixel coordinates */
    updatePixelCoordinates(
        timeToPixel: (time: number) => number | null,
        _priceToPixel: (price: number) => number | null
    ): void {
        if (this.points.length === 0) return;

        const x = timeToPixel(this.points[0].time);
        if (x !== null) {
            this._pixelX = x;
        }
    }

    /** Render the vertical line */
    render(
        ctx: CanvasRenderingContext2D,
        timeToPixel: (time: number) => number | null,
        _priceToPixel: (price: number) => number | null,
        _canvasWidth: number,
        canvasHeight: number,
        dpr: number = 1
    ): void {
        if (this.points.length === 0 || !this.visible) return;

        const x = timeToPixel(this.points[0].time);
        if (x === null) return;

        this._pixelX = x;

        ctx.save();
        ctx.strokeStyle = this.style.color;
        ctx.lineWidth = this.style.lineWidth * dpr;
        if (this.style.lineDash && this.style.lineDash.length > 0) {
            ctx.setLineDash(this.style.lineDash.map(d => d * dpr));
        }

        // Draw line across entire canvas height (in DPR-scaled coordinates)
        const xScaled = x * dpr;
        ctx.beginPath();
        ctx.moveTo(xScaled, 0);
        ctx.lineTo(xScaled, canvasHeight * dpr);
        ctx.stroke();

        // Draw time label at the bottom
        if (this.showTime) {
            const date = new Date(this.points[0].time);
            const timeText = date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            ctx.font = `${11 * dpr}px Arial`;
            const textMetrics = ctx.measureText(timeText);
            const padding = 4 * dpr;
            const labelWidth = textMetrics.width + padding * 2;
            const labelHeight = 16 * dpr;

            // Background
            ctx.fillStyle = this.style.color;
            ctx.fillRect(xScaled - labelWidth / 2, canvasHeight * dpr - labelHeight - 2 * dpr, labelWidth, labelHeight);

            // Text
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(timeText, xScaled, canvasHeight * dpr - labelHeight / 2 - 2 * dpr);
        }

        // Selection handles
        if (this.state === 'selected' || this.state === 'editing') {
            this._drawHandle(ctx, xScaled, canvasHeight * dpr / 2, dpr);
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

    hitTest(x: number, _y: number, threshold: number): boolean {
        if (this.points.length === 0) return false;
        return Math.abs(x - this._pixelX) <= threshold;
    }

    hitTestControlPoint(x: number, _y: number, threshold: number): number {
        if (this.points.length === 0) return -1;
        // Single control point in the middle
        if (Math.abs(x - this._pixelX) <= threshold) {
            return 0;
        }
        return -1;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this.points.length === 0) return null;
        return {
            x: this._pixelX - 5,
            y: 0,
            width: 10,
            height: 10000 // Full height
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
            showLabels: this.showTime,
        };
    }

    static fromJSON(data: SerializedDrawing): VerticalLineDrawing {
        const drawing = new VerticalLineDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            lineDash: data.style.lineDash,
            showTime: data.showLabels,
        });
        (drawing as any).id = data.id;
        drawing.points = [...data.points];
        drawing.state = data.state;
        drawing.visible = data.visible;
        drawing.locked = data.locked;
        return drawing;
    }
}
