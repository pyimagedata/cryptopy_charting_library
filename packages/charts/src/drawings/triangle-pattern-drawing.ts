/**
 * Triangle Pattern Drawing Implementation
 * 
 * A 4-point triangle pattern where:
 * - Points are labeled A, B, C, D
 * - Lines connect A-B, B-C, C-D
 * - Top trendline extends from above A through B and D to apex
 * - Bottom trendline extends from A through C to apex
 * - Triangle area is filled with color
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

export interface TrianglePatternOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    fillColor?: string;
}

// Point labels for Triangle pattern
export const TRIANGLE_PATTERN_LABELS = ['A', 'B', 'C', 'D'];

/**
 * Triangle Pattern - 4-point converging triangle pattern
 */
export class TrianglePatternDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'trianglePattern';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Preview point tracking
    private _previewPointIndex: number = -1;

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: TrianglePatternOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#5b5fc7', // Blue-purple like TradingView
            lineWidth: options.lineWidth || 2,
            lineDash: options.lineDash || [],
            fillColor: options.fillColor || 'rgba(91, 95, 199, 0.3)',
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
    // Point Management (4 points: A, B, C, D)
    // =========================================================================

    /** Add a point to the drawing */
    addPoint(time: number, price: number): void {
        this.points.push({ time, price });

        // Complete after 4 points
        if (this.points.length >= 4) {
            this.state = 'complete';
        }
    }

    /** Check if drawing is complete (4 points) */
    isComplete(): boolean {
        return this.points.length >= 4 && this.state === 'complete';
    }

    /** Update the last point (during preview) */
    updateLastPoint(time: number, price: number): void {
        if (this.points.length === 0) return;

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

    /** Get the label for a point index */
    getPointLabel(index: number): string {
        return TRIANGLE_PATTERN_LABELS[index] || '';
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
    // Triangle Apex Calculation
    // =========================================================================

    /** Calculate the apex point where trendlines converge */
    calculateApex(): { time: number; price: number } | null {
        if (this.points.length < 4) return null;

        const A = this.points[0];
        const B = this.points[1];
        const C = this.points[2];
        const D = this.points[3];

        // Top trendline: through B and D
        // Bottom trendline: through A and C

        // Calculate slopes
        const topSlope = (D.price - B.price) / (D.time - B.time);
        const bottomSlope = (C.price - A.price) / (C.time - A.time);

        // If slopes are equal or nearly equal, lines are parallel (no apex)
        if (Math.abs(topSlope - bottomSlope) < 0.0000001) {
            return null;
        }

        // Find intersection point
        // Top line: y = B.price + topSlope * (x - B.time)
        // Bottom line: y = A.price + bottomSlope * (x - A.time)
        // Set equal and solve for x:
        // B.price + topSlope * (x - B.time) = A.price + bottomSlope * (x - A.time)
        // topSlope * x - topSlope * B.time + B.price = bottomSlope * x - bottomSlope * A.time + A.price
        // x * (topSlope - bottomSlope) = -bottomSlope * A.time + A.price + topSlope * B.time - B.price
        const apexTime = (-bottomSlope * A.time + A.price + topSlope * B.time - B.price) / (topSlope - bottomSlope);
        const apexPrice = A.price + bottomSlope * (apexTime - A.time);

        return { time: apexTime, price: apexPrice };
    }

    // =========================================================================
    // Hit Testing
    // =========================================================================

    hitTest(x: number, y: number, threshold: number = 5): boolean {
        if (this._pixelPoints.length < 2) return false;

        // Check each line segment: A-B, B-C, C-D
        for (let i = 0; i < this._pixelPoints.length - 1; i++) {
            const p0 = this._pixelPoints[i];
            const p1 = this._pixelPoints[i + 1];

            const dist = this._pointToLineDistance(x, y, p0.x, p0.y, p1.x, p1.y);
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

    static fromJSON(data: SerializedDrawing): TrianglePatternDrawing {
        const drawing = new TrianglePatternDrawing({
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
