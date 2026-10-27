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
    checkboxRow,
} from './drawing-settings-config';

import { LineToolProps, createLineProps, serializeLineProps, deserializeLineProps } from './line-tool-common';
import { restoreShapeStyle } from './shape-common';
import {
    TV_BLUE,
    createOpenStyle,
    openLineSection,
    backgroundSection,
    openAttributeBarItems,
    getOpenSetting,
    setOpenSetting,
} from './open-shape-common';

export interface CurveOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    fillColor?: string;
    fillOpacity?: number;
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

    /** Egrinin uc teget dogrultusunda grafik kenarina uzatma */
    extendLeft: boolean = false;
    extendRight: boolean = false;

    /** Sol/sag uc sekli */
    lineProps: LineToolProps = createLineProps();

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: CurveOptions = {}) {
        this.id = generateDrawingId();
        this.style = createOpenStyle(DEFAULT_DRAWING_STYLE, {
            color: TV_BLUE,
            lineWidth: 2,
            fill: { color: TV_BLUE, opacity: 0.2, enabled: false },
        }, options);
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    openLineSection({ ends: true }),
                    backgroundSection(),
                    {
                        title: 'Extend',
                        rows: [
                            checkboxRow('extendLeft', 'Extend Left'),
                            checkboxRow('extendRight', 'Extend Right'),
                        ]
                    },
                ]),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return openAttributeBarItems({ fill: true, style: true });
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'visible': return this.visible;
            case 'extendLeft': return this.extendLeft;
            case 'extendRight': return this.extendRight;
        }
        return getOpenSetting(this.style, this.lineProps, key);
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'visible': this.visible = value; return;
            case 'extendLeft': this.extendLeft = !!value; return;
            case 'extendRight': this.extendRight = !!value; return;
        }
        setOpenSetting(this.style, this.lineProps, key, value);
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

        // Uzatilan teget isinlari (baslangicta P0-C, bitiste P2-C yonunde)
        const far = 10000;
        const rays: [{ x: number; y: number }, number, number][] = [];
        if (this.extendLeft) rays.push([p0, p0.x - controlX, p0.y - controlY]);
        if (this.extendRight) rays.push([p2, p2.x - controlX, p2.y - controlY]);
        for (const [o, dx, dy] of rays) {
            const len = Math.hypot(dx, dy);
            if (len === 0) continue;
            const ex = o.x + (dx / len) * far;
            const ey = o.y + (dy / len) * far;
            if (this._distToSegment(x, y, o.x, o.y, ex, ey) <= threshold) return true;
        }

        return false;
    }

    private _distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
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
            extendLeft: this.extendLeft,
            extendRight: this.extendRight,
            lineProps: serializeLineProps(this.lineProps),
        };
    }

    static fromJSON(data: SerializedDrawing): CurveDrawing {
        const drawing = new CurveDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            lineDash: data.style.lineDash
        });

        restoreShapeStyle(drawing.style, data.style);
        drawing.extendLeft = data.extendLeft === true;
        drawing.extendRight = data.extendRight === true;
        drawing.lineProps = deserializeLineProps(data.lineProps);
        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
