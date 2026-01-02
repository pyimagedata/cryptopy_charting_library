/**
 * Curve Drawing Implementation (Quadratic Bezier)
 * 
 * A curve where:
 * - User clicks 2 points (start and end)
 * - Middle control point is auto-generated
 * - Results in 3 control points for quadratic bezier
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
} from './drawing-settings-config';

export interface CurveOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
}

/**
 * Curve - A quadratic bezier curve (2 clicks, 3 control points)
 */
export class CurveDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'curve';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: CurveOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#2962ff',
            lineWidth: options.lineWidth || 2,
            lineDash: options.lineDash || [],
        };
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    {
                        title: 'Line',
                        rows: [
                            colorRow('color', 'Color'),
                            lineWidthRow('lineWidth'),
                            lineStyleRow('lineStyle'),
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
                if (this.style.lineDash[0] === 6) return 'dashed';
                return 'dotted';
            case 'visible': return this.visible;
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
            case 'visible':
                this.visible = value;
                break;
        }
    }

    // =========================================================================
    // Point Management (1-click start, preview with 3 points, 2nd click finish)
    // =========================================================================

    /** Add a point to the drawing */
    addPoint(time: number, price: number): void {
        if (this.points.length === 0) {
            // First click: add start point, middle control point, and end point (preview)
            this.points.push({ time, price });                    // Start
            this.points.push({ time, price });                    // Middle (will be calculated)
            this.points.push({ time, price });                    // End (preview)
        }
    }

    /** Check if drawing is complete (3 points and state is complete) */
    isComplete(): boolean {
        return this.points.length >= 3 && this.state === 'complete';
    }

    /** Update the last point (during preview) - recalculates middle point only during creation */
    updateLastPoint(time: number, price: number): void {
        if (this.points.length < 3) return;

        // Update end point
        this.points[2] = { time, price };

        // Only recalculate middle point during creation, not after edit
        if (this.state === 'creating') {
            // Recalculate middle control point based on distance
            const p0 = this.points[0]; // Start
            const p2 = this.points[2]; // End (current mouse)

            // Midpoint on line between start and end
            const lineMidTime = (p0.time + p2.time) / 2;
            const lineMidPrice = (p0.price + p2.price) / 2;

            // Offset for the curve (where we want the curve to pass through)
            const priceOffset = Math.abs(p2.price - p0.price) * 0.15 || (Math.max(p0.price, p2.price) * 0.01);

            // This is the point ON THE CURVE (Pm) where curve should pass at t=0.5
            const curvePassTime = lineMidTime;
            const curvePassPrice = lineMidPrice - priceOffset;

            // Store the CURVE PASS POINT (not bezier control) for user to edit
            this.points[1] = { time: curvePassTime, price: curvePassPrice };
        }
    }

    /** Finalize the curve (called on second click) */
    finalizeCurve(time: number, price: number): void {
        if (this.points.length >= 3) {
            this.points[2] = { time, price };

            // Recalculate middle point one final time
            const p0 = this.points[0];
            const p2 = this.points[2];

            const lineMidTime = (p0.time + p2.time) / 2;
            const lineMidPrice = (p0.price + p2.price) / 2;
            const priceOffset = Math.abs(p2.price - p0.price) * 0.15 || (Math.max(p0.price, p2.price) * 0.01);

            // Point ON THE CURVE at t=0.5
            this.points[1] = { time: lineMidTime, price: lineMidPrice - priceOffset };
            this.state = 'complete';
        }
    }

    /** Set cached pixel coordinates */
    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = points;
    }

    /** Get pixel coordinates */
    getPixelPoints(): { x: number; y: number }[] {
        return this._pixelPoints;
    }

    // =========================================================================
    // Hit Testing
    // =========================================================================

    hitTest(x: number, y: number, threshold: number = 5): boolean {
        if (this._pixelPoints.length < 3) return false;

        const p0 = this._pixelPoints[0]; // Start
        const pm = this._pixelPoints[1]; // Point ON curve (not bezier control)
        const p2 = this._pixelPoints[2]; // End

        // Calculate bezier control point: P1 = 2*Pm - 0.5*(P0 + P2)
        const controlX = 2 * pm.x - 0.5 * (p0.x + p2.x);
        const controlY = 2 * pm.y - 0.5 * (p0.y + p2.y);

        // Sample points along the bezier curve
        const samples = 50;
        for (let i = 0; i < samples; i++) {
            const t = i / (samples - 1);
            const bx = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * controlX + t * t * p2.x;
            const by = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * controlY + t * t * p2.y;

            const dist = Math.sqrt((x - bx) ** 2 + (y - by) ** 2);
            if (dist <= threshold) return true;
        }

        return false;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length < 3) return null;

        const xs = this._pixelPoints.map(p => p.x);
        const ys = this._pixelPoints.map(p => p.y);

        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
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
        };
    }

    static fromJSON(data: SerializedDrawing): CurveDrawing {
        const drawing = new CurveDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            lineDash: data.style.lineDash
        });

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
