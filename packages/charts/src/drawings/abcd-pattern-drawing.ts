/**
 * ABCD Pattern Drawing Implementation
 * 
 * A 4-point harmonic pattern where:
 * - Points are labeled A, B, C, D
 * - Solid lines connect A-B, B-C, C-D
 * - Dashed lines connect A-C and B-D
 * - Fibonacci ratios displayed on diagonal lines
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

export interface ABCDPatternOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
}

// Point labels for ABCD pattern
export const ABCD_LABELS = ['A', 'B', 'C', 'D'];

/**
 * ABCD Pattern - 4-point harmonic pattern
 */
export class ABCDPatternDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'abcd';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Preview point tracking
    private _previewPointIndex: number = -1;

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: ABCDPatternOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#009688', // Teal green like TradingView
            lineWidth: options.lineWidth || 2,
            lineDash: options.lineDash || [],
            fillColor: undefined, // No fill for ABCD
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
        return ABCD_LABELS[index] || '';
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
    // Fibonacci Ratio Calculations
    // =========================================================================

    /** Calculate BC/AB ratio (retracement) */
    getBCRatio(): number | null {
        if (this.points.length < 3) return null;
        const abMove = Math.abs(this.points[1].price - this.points[0].price);
        const bcMove = Math.abs(this.points[2].price - this.points[1].price);
        if (abMove === 0) return null;
        return bcMove / abMove;
    }

    /** Calculate CD/BC ratio (extension) */
    getCDRatio(): number | null {
        if (this.points.length < 4) return null;
        const bcMove = Math.abs(this.points[2].price - this.points[1].price);
        const cdMove = Math.abs(this.points[3].price - this.points[2].price);
        if (bcMove === 0) return null;
        return cdMove / bcMove;
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

        // Check diagonal lines: A-C and B-D
        if (this._pixelPoints.length >= 3) {
            const dist = this._pointToLineDistance(
                x, y,
                this._pixelPoints[0].x, this._pixelPoints[0].y,
                this._pixelPoints[2].x, this._pixelPoints[2].y
            );
            if (dist <= threshold) return true;
        }
        if (this._pixelPoints.length >= 4) {
            const dist = this._pointToLineDistance(
                x, y,
                this._pixelPoints[1].x, this._pixelPoints[1].y,
                this._pixelPoints[3].x, this._pixelPoints[3].y
            );
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

    static fromJSON(data: SerializedDrawing): ABCDPatternDrawing {
        const drawing = new ABCDPatternDrawing({
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
