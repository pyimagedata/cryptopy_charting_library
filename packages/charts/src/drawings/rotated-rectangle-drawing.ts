/**
 * Rotated Rectangle Drawing Implementation
 * 
 * A 3-point rectangle where:
 * - Point 0: First corner
 * - Point 1: Second corner (defines one edge and rotation)
 * - Point 2: Defines width perpendicular to first edge
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

export interface RotatedRectangleOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    fillColor?: string;
    fillOpacity?: number;
}

/**
 * Rotated Rectangle - 3-point shape with rotation support
 */
export class RotatedRectangleDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'rotatedRectangle';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Cached pixel coordinates (updated by renderer)
    private _pixelPoints: { x: number; y: number }[] = [];
    // Index of the current preview point (-1 if none)
    private _previewPointIndex: number = -1;

    constructor(options: RotatedRectangleOptions = {}) {
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
                        title: 'Border',
                        rows: [
                            colorRow('color', 'Border Color'),
                            lineWidthRow('lineWidth'),
                            lineStyleRow('lineStyle'),
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
            { type: 'color', key: 'color', tooltip: 'Border Color' },
            { type: 'color', key: 'fillColor', tooltip: 'Background Color' },
            { type: 'lineWidth', key: 'lineWidth', tooltip: 'Border Width' },
            { type: 'lineStyle', key: 'lineStyle', tooltip: 'Border Style' },
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
    // Point Management - Same pattern as ParallelChannel
    // =========================================================================

    /** Add a point to the drawing */
    addPoint(time: number, price: number): void {
        this.points.push({ time, price });

        // Rotated rectangle has exactly 3 points
        if (this.points.length >= 3) {
            this.state = 'complete';
        }
    }

    /** Check if drawing is complete */
    isComplete(): boolean {
        return this.points.length >= 3 && this.state === 'complete';
    }

    /** Update the last point (during drawing preview) */
    updateLastPoint(time: number, price: number): void {
        if (this.points.length === 0) return;

        if (this.state === 'creating') {
            // Check if we need to add a preview point or update existing one
            if (this._previewPointIndex === -1) {
                // Add a new preview point
                this.points.push({ time, price });
                this._previewPointIndex = this.points.length - 1;
            } else {
                // Update existing preview point
                this.points[this._previewPointIndex] = { time, price };
            }
        } else {
            // Editing mode - just update the last point
            const lastIndex = this.points.length - 1;
            this.points[lastIndex] = { time, price };
        }
    }

    /** Confirm the current preview point as permanent */
    confirmPreviewPoint(): void {
        this._previewPointIndex = -1;
    }

    /** Get preview point index (-1 if none) */
    get previewPointIndex(): number {
        return this._previewPointIndex;
    }

    // =========================================================================
    // Pixel Coordinates
    // =========================================================================

    /** Set cached pixel coordinates (called by renderer) */
    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = points;
    }

    /** Get pixel coordinates */
    getPixelPoints(): { x: number; y: number }[] {
        return this._pixelPoints;
    }

    /**
     * Calculate the 4 corners of the rotated rectangle from 3 control points
     */
    getRectangleCorners(): { x: number; y: number }[] | null {
        if (this._pixelPoints.length < 3) return null;

        const [p1, p2, p3] = this._pixelPoints;

        // Vector from p1 to p2 (first edge)
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;

        // Length of first edge
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length === 0) return null;

        // Perpendicular unit vector
        const perpX = -dy / length;
        const perpY = dx / length;

        // Project p3 onto perpendicular to get width
        const projLength = (p3.x - p1.x) * perpX + (p3.y - p1.y) * perpY;

        // Calculate 4th corner
        const p4 = {
            x: p2.x + perpX * projLength,
            y: p2.y + perpY * projLength
        };

        // Correct p3 to be exactly perpendicular
        const p3Corrected = {
            x: p1.x + perpX * projLength,
            y: p1.y + perpY * projLength
        };

        return [p1, p2, p4, p3Corrected];
    }

    // =========================================================================
    // Hit Testing
    // =========================================================================

    private _distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const l2 = dx * dx + dy * dy;

        if (l2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);

        let t = ((px - x1) * dx + (py - y1) * dy) / l2;
        t = Math.max(0, Math.min(1, t));

        const projX = x1 + t * dx;
        const projY = y1 + t * dy;

        return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
    }

    private _pointInPolygon(px: number, py: number, corners: { x: number; y: number }[]): boolean {
        let inside = false;
        const n = corners.length;

        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = corners[i].x, yi = corners[i].y;
            const xj = corners[j].x, yj = corners[j].y;

            if (((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
    }

    hitTest(x: number, y: number, threshold: number = 5): boolean {
        const corners = this.getRectangleCorners();
        if (!corners) return false;

        // Check inside polygon
        if (this._pointInPolygon(x, y, corners)) return true;

        // Check edges
        for (let i = 0; i < 4; i++) {
            const c1 = corners[i];
            const c2 = corners[(i + 1) % 4];
            if (this._distToSegment(x, y, c1.x, c1.y, c2.x, c2.y) <= threshold) {
                return true;
            }
        }

        return false;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        const corners = this.getRectangleCorners();
        if (!corners) return null;

        const xs = corners.map(c => c.x);
        const ys = corners.map(c => c.y);

        return {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys)
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

    static fromJSON(data: SerializedDrawing): RotatedRectangleDrawing {
        const drawing = new RotatedRectangleDrawing({
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
