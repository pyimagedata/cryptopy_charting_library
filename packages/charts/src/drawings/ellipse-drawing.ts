/**
 * Ellipse Drawing Implementation (3-point, edge-based like TradingView)
 * 
 * A 3-point ellipse where:
 * - Point 0: Left edge of ellipse (one end of horizontal axis)
 * - Point 1: Right edge of ellipse (other end of horizontal axis) 
 * - Point 2: Top or bottom edge (determines vertical radius)
 * 
 * Center is calculated as midpoint between points 0 and 1.
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
} from './drawing-settings-config';

import {
    createShapeStyle,
    restoreShapeStyle,
    getShapeSetting,
    setShapeSetting,
    shapeStyleSections,
    shapeAttributeBarItems,
} from './shape-common';

export interface EllipseOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    fillColor?: string;
    fillOpacity?: number;
}

/**
 * Ellipse - A 3-point shape (left edge + right edge + height)
 */
export class EllipseDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'ellipse';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Preview point tracking (like parallelChannel)
    private _previewPointIndex: number = -1;

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: EllipseOptions = {}) {
        this.id = generateDrawingId();
        this.style = createShapeStyle('ellipse', DEFAULT_DRAWING_STYLE, options);
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab(shapeStyleSections()),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return shapeAttributeBarItems();
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this.visible;
        return getShapeSetting(this.style, key);
    }

    setSettingValue(key: string, value: any): void {
        if (key === 'visible') this.visible = value;
        else setShapeSetting(this.style, key, value);
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
     * Get ellipse parameters for rendering
     * Center is calculated from points 0 and 1
     * rx = distance from center to point 0 (or 1)
     * ry = perpendicular distance from point 2 to the line between 0 and 1
     */
    getEllipseParams(): {
        cx: number; cy: number;
        rx: number; ry: number;
        rotation: number
    } | null {
        if (this._pixelPoints.length < 2) return null;

        const p0 = this._pixelPoints[0]; // Left edge
        const p1 = this._pixelPoints[1]; // Right edge

        // Center is midpoint of p0 and p1
        const cx = (p0.x + p1.x) / 2;
        const cy = (p0.y + p1.y) / 2;

        // First radius (horizontal) = half distance between p0 and p1
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const rx = Math.sqrt(dx * dx + dy * dy) / 2;

        // Rotation angle of the major axis
        const rotation = Math.atan2(dy, dx);

        if (this._pixelPoints.length < 3) {
            // Preview with 2 points - use half of rx for ry
            return { cx, cy, rx, ry: rx * 0.5, rotation };
        }

        // Third point determines the second radius (perpendicular to major axis)
        const p2 = this._pixelPoints[2];

        // Vector from center to p2
        const dx2 = p2.x - cx;
        const dy2 = p2.y - cy;

        // Perpendicular direction to the major axis
        const perpX = -Math.sin(rotation);
        const perpY = Math.cos(rotation);

        // Project vector onto perpendicular axis to get ry
        const ry = Math.abs(dx2 * perpX + dy2 * perpY);

        return { cx, cy, rx, ry, rotation };
    }

    /**
     * Get control point positions (on the ellipse edges)
     * Returns positions for: left, right, top, bottom of ellipse
     */
    getControlPoints(): { x: number; y: number }[] | null {
        const params = this.getEllipseParams();
        if (!params) return null;

        const { cx, cy, rx, ry, rotation } = params;

        // Calculate the 4 control points on the ellipse
        const cosR = Math.cos(rotation);
        const sinR = Math.sin(rotation);

        // Left point (negative rx direction)
        const left = {
            x: cx - rx * cosR,
            y: cy - rx * sinR
        };

        // Right point (positive rx direction)
        const right = {
            x: cx + rx * cosR,
            y: cy + rx * sinR
        };

        // Top point (negative ry in perpendicular direction)
        const top = {
            x: cx - ry * (-sinR),
            y: cy - ry * cosR
        };

        // Bottom point (positive ry in perpendicular direction)
        const bottom = {
            x: cx + ry * (-sinR),
            y: cy + ry * cosR
        };

        return [left, right, bottom, top];
    }

    // =========================================================================
    // Hit Testing
    // =========================================================================

    hitTest(x: number, y: number, threshold: number = 5): boolean {
        const params = this.getEllipseParams();
        if (!params) return false;

        const { cx, cy, rx, ry, rotation } = params;
        if (rx === 0 || ry === 0) return false;

        // Rotate the test point to align with ellipse axes
        const cosR = Math.cos(-rotation);
        const sinR = Math.sin(-rotation);
        const dx = x - cx;
        const dy = y - cy;
        const rotatedX = dx * cosR - dy * sinR;
        const rotatedY = dx * sinR + dy * cosR;

        // Check if inside ellipse (with threshold for border)
        const normalizedDist = (rotatedX * rotatedX) / (rx * rx) + (rotatedY * rotatedY) / (ry * ry);

        // Inside ellipse
        if (normalizedDist <= 1) return true;

        // Near border (within threshold)
        const outerRx = rx + threshold;
        const outerRy = ry + threshold;
        if (outerRx === 0 || outerRy === 0) return false;

        const outerDist = (rotatedX * rotatedX) / (outerRx * outerRx) + (rotatedY * rotatedY) / (outerRy * outerRy);
        return outerDist <= 1;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        const params = this.getEllipseParams();
        if (!params) return null;

        const { cx, cy, rx, ry } = params;

        return {
            x: cx - rx,
            y: cy - ry,
            width: rx * 2,
            height: ry * 2
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

    static fromJSON(data: SerializedDrawing): EllipseDrawing {
        const drawing = new EllipseDrawing();
        restoreShapeStyle(drawing.style, data.style);

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
