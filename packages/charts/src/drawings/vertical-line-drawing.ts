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
    checkboxRow,
    selectRow
} from './drawing-settings-config';

import {
    AxisLabelProvider,
    DrawingAxisLabels,
    TextOrientation,
    applyTextFields,
    textFieldsToJSON,
    drawLabeledVerticalLine,
    lineStyleFromDash,
    dashFromLineStyle
} from './line-tool-common';

import { t } from '../helpers/translations';

export interface VerticalLineOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    showTime?: boolean;
}

/**
 * Vertical Line - A line that spans the entire chart height at a specific time
 */
export class VerticalLineDrawing implements Drawing, DrawingSettingsProvider, AxisLabelProvider {
    readonly id: string;
    readonly type: DrawingType = 'verticalLine';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Options
    showTime: boolean = true;
    /** Metin yonu: cizgi boyunca (dikey) ya da duz yazi */
    textOrientation: TextOrientation = 'vertical';
    /**
     * Tam pane yuksekligi. Yalnizca true desteklenir (false'un TradingView karsiligi belirsiz oldugu icin
     * arayuzde gosterilmez); kayitta korunur.
     */
    extendLine: boolean = true;

    // Cached pixel coordinates
    private _pixelX: number = 0;

    constructor(options: VerticalLineOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#2962ff',
            lineWidth: options.lineWidth || 1,
            lineDash: options.lineDash || [],
            // TradingView varsayilani: metin 14px, ortada
            fontSize: 14,
            textHAlign: 'center',
            textVAlign: 'middle',
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
                            checkboxRow('showTime', 'Time label'),
                        ]
                    }
                ]),
                {
                    id: 'text',
                    label: 'Text',
                    sections: [{
                        rows: [
                            selectRow('textOrientation', 'Text orientation', [
                                { value: 'vertical', label: t('Vertical') },
                                { value: 'horizontal', label: t('Horizontal') },
                            ]),
                        ]
                    }]
                },
                createVisibilityTab()
            ]
        };
    }

    /** Zaman ekseninde cizgi renginde etiket (showTime) */
    getAxisLabels(): DrawingAxisLabels {
        const times = this.showTime && this.points.length > 0
            ? [{ time: this.points[0].time, color: this.style.color }]
            : [];
        return { prices: [], times };
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
            case 'showTime': return this.showTime;
            case 'textOrientation': return this.textOrientation;
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
            case 'showTime':
                this.showTime = value;
                break;
            case 'textOrientation':
                if (value === 'vertical' || value === 'horizontal') this.textOrientation = value;
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

        // Tum yukseklik boyunca cizgi + (varsa) metin; zaman etiketi zaman ekseninde cizilir
        const xScaled = x * dpr;
        ctx.save();
        drawLabeledVerticalLine(ctx, this.style, xScaled, 0, canvasHeight * dpr, dpr, this.textOrientation);

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
            extendLine: this.extendLine,
            textOrientation: this.textOrientation,
            ...textFieldsToJSON(this.style),
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
        drawing.extendLine = data.extendLine !== false;
        if (data.textOrientation === 'vertical' || data.textOrientation === 'horizontal') {
            drawing.textOrientation = data.textOrientation;
        }
        applyTextFields(drawing.style, data);
        return drawing;
    }
}
