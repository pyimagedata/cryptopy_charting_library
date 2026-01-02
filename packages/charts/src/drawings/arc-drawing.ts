/**
 * Arc Drawing Implementation (3-point)
 * 
 * A 3-point arc where:
 * - Point 0: Start of the arc
 * - Point 1: End of the arc
 * - Point 2: Control point that determines the curvature
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

export interface ArcOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    fillColor?: string;
    fillOpacity?: number;
}

/**
 * Arc - A 3-point curved line
 */
export class ArcDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'arc';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Preview point tracking (like parallelChannel)
    private _previewPointIndex: number = -1;

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: ArcOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#2962ff',
            lineWidth: options.lineWidth || 2,
            lineDash: options.lineDash || [],
            fillColor: options.fillColor || 'rgba(41, 98, 255, 0.2)',
            fillOpacity: options.fillOpacity || 0.2,
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
                    },
                    {
                        title: 'Background',
                        rows: [
                            colorRow('fillColor', 'Fill Color'),
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
            { type: 'color', key: 'fillColor', tooltip: 'Fill Color' },
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
            case 'fillColor': return this.style.fillColor;
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
            case 'fillColor':
                this.style.fillColor = value;
                break;
            case 'visible':
                this.visible = value;
                break;
        }
    }

    // =========================================================================
    // Point Management (3-point pattern like parallelChannel)
    // =========================================================================

    /** Add a point to the drawing */
    addPoint(time: number, price: number): void {
        this.points.push({ time, price });

        // Complete after 3 points
        if (this.points.length >= 3) {
            this.state = 'complete';
        }
    }

    /** Check if drawing is complete */
    isComplete(): boolean {
        return this.points.length >= 3;
    }

    /** Update the last point (during preview) - parallelChannel pattern */
    updateLastPoint(time: number, price: number): void {
        if (this.state === 'creating') {
            if (this._previewPointIndex === -1) {
                // No preview exists - add one
                this.points.push({ time, price });
                this._previewPointIndex = this.points.length - 1;
            } else {
                // Update existing preview
                this.points[this._previewPointIndex] = { time, price };
            }
        } else {
            // Editing: update the last point
            const lastIndex = this.points.length - 1;
            if (lastIndex >= 0) {
                this.points[lastIndex] = { time, price };
            }
        }
    }

    /** Confirm the preview point (called on click) */
    confirmPreviewPoint(): void {
        this._previewPointIndex = -1;
    }

    /** Set cached pixel coordinates */
    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = points;
    }

    /** Get pixel coordinates */
    getPixelPoints(): { x: number; y: number }[] {
        return this._pixelPoints;
    }

    /**
     * Calculate arc parameters from 3 points
     * Returns center, radius, start angle, and end angle
     */
    getArcParams(): {
        cx: number;
        cy: number;
        radius: number;
        startAngle: number;
        endAngle: number;
        counterClockwise: boolean;
    } | null {
        if (this._pixelPoints.length < 3) return null;

        const p0 = this._pixelPoints[0]; // Start
        const p1 = this._pixelPoints[1]; // End
        const p2 = this._pixelPoints[2]; // Control point (on arc)

        // Calculate the circumcircle of the 3 points
        const ax = p0.x, ay = p0.y;
        const bx = p1.x, by = p1.y;
        const cx = p2.x, cy = p2.y;

        const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));

        if (Math.abs(d) < 0.0001) {
            // Points are collinear, no valid circle
            return null;
        }

        const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
        const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;

        const radius = Math.sqrt((ax - ux) ** 2 + (ay - uy) ** 2);
        const startAngle = Math.atan2(ay - uy, ax - ux);
        const endAngle = Math.atan2(by - uy, bx - ux);
        const controlAngle = Math.atan2(cy - uy, cx - ux);

        // Determine direction based on control point position
        const crossProduct = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
        const counterClockwise = crossProduct > 0;

        return { cx: ux, cy: uy, radius, startAngle, endAngle, counterClockwise };
    }

    // =========================================================================
    // Hit Testing
    // =========================================================================

    hitTest(x: number, y: number, threshold: number = 5): boolean {
        if (this._pixelPoints.length < 3) {
            // Fallback to line test if not enough points
            if (this._pixelPoints.length >= 2) {
                return this._pointToLineDistance(x, y,
                    this._pixelPoints[0].x, this._pixelPoints[0].y,
                    this._pixelPoints[1].x, this._pixelPoints[1].y) <= threshold;
            }
            return false;
        }

        // Check distance to quadratic bezier curve by sampling
        const p0 = this._pixelPoints[0]; // Start
        const p1 = this._pixelPoints[1]; // End
        const p2 = this._pixelPoints[2]; // Point ON curve

        // Calculate control point so that curve passes through p2 at t=0.5
        // C = 2*P2 - 0.5*P0 - 0.5*P1
        const controlX = 2 * p2.x - 0.5 * p0.x - 0.5 * p1.x;
        const controlY = 2 * p2.y - 0.5 * p0.y - 0.5 * p1.y;

        // Sample the curve at multiple points and check distance
        const samples = 20;
        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            // Quadratic bezier formula: B(t) = (1-t)²P0 + 2(1-t)t*C + t²P1
            const mt = 1 - t;
            const bx = mt * mt * p0.x + 2 * mt * t * controlX + t * t * p1.x;
            const by = mt * mt * p0.y + 2 * mt * t * controlY + t * t * p1.y;

            const dist = Math.sqrt((x - bx) ** 2 + (y - by) ** 2);
            if (dist <= threshold) return true;
        }

        return false;
    }

    private _pointToLineDistance(
        px: number, py: number,
        x1: number, y1: number,
        x2: number, y2: number
    ): number {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSq = dx * dx + dy * dy;

        if (lengthSq === 0) {
            return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        }

        let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));

        const nearestX = x1 + t * dx;
        const nearestY = y1 + t * dy;

        return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length < 2) return null;

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

    static fromJSON(data: SerializedDrawing): ArcDrawing {
        const drawing = new ArcDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            lineDash: data.style.lineDash,
            fillColor: data.style.fillColor
        });

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
