/**
 * Brush Drawing Implementation
 * 
 * Free-form drawing tool that captures mouse movements as a path
 * Similar to a pen/pencil tool - draws smooth curves following cursor
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
    sliderRow
} from './drawing-settings-config';

export interface BrushOptions {
    color?: string;
    lineWidth?: number;
    opacity?: number;
    smooth?: boolean;
}

/**
 * Brush Drawing - Free-form path drawing tool
 */
export class BrushDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'brush';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Brush specific options
    opacity: number = 1.0;
    smooth: boolean = true;

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: BrushOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#2962ff',
            lineWidth: options.lineWidth || 2,
            lineDash: [],
        };
        this.opacity = options.opacity ?? 1.0;
        this.smooth = options.smooth !== false;
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
                            colorRow('color', 'Line Color'),
                            lineWidthRow('lineWidth'),
                            lineStyleRow('lineStyle'),
                        ]
                    },
                    {
                        title: 'Opacity',
                        rows: [
                            sliderRow('opacity', 'Line Opacity', 10, 100, '%'),
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
            case 'opacity': return Math.round(this.opacity * 100);
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
            case 'opacity':
                this.opacity = value / 100;
                break;
            case 'visible':
                this.visible = value;
                break;
        }
    }

    /** Add a point to the brush path */
    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
    }

    /** Check if drawing is complete (brush is complete when mouse is released) */
    isComplete(): boolean {
        return this.state === 'complete' && this.points.length >= 2;
    }

    /** Update the last point (add new point for brush during drag) */
    updateLastPoint(time: number, price: number): void {
        // For brush, we add new points instead of updating the last one
        // This creates the free-form path effect
        if (this.state === 'creating') {
            // Only add point if it's different enough from the last one
            if (this.points.length > 0) {
                const lastPoint = this.points[this.points.length - 1];

                // Calculate approximate distance in time/price units
                // Use a minimum threshold to avoid jittery/zigzag lines
                const timeDiff = Math.abs(time - lastPoint.time);
                const priceDiff = Math.abs(price - lastPoint.price);

                // Require meaningful movement before adding point
                // This prevents tiny movements from creating zigzag patterns
                const minTimeDistance = 0.0001; // Minimum time distance
                const minPriceDistance = 0.0001; // Minimum price distance as ratio

                if (timeDiff > minTimeDistance || priceDiff > minPriceDistance) {
                    this.points.push({ time, price });
                }
            }
        }
    }

    /** Finish the brush stroke */
    finishStroke(): void {
        if (this.points.length >= 2) {
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

    /** Check if a pixel coordinate is near this brush stroke */
    hitTest(x: number, y: number, threshold: number = 8): boolean {
        if (this._pixelPoints.length < 2) return false;

        // Check each segment of the path
        for (let i = 0; i < this._pixelPoints.length - 1; i++) {
            const p1 = this._pixelPoints[i];
            const p2 = this._pixelPoints[i + 1];
            const dist = this._pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
            if (dist <= threshold) {
                return true;
            }
        }

        return false;
    }

    /** Calculate distance from point to line segment */
    private _pointToLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;

        let param = -1;
        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx: number, yy: number;
        if (param < 0) {
            xx = x1; yy = y1;
        } else if (param > 1) {
            xx = x2; yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        return Math.sqrt((px - xx) ** 2 + (py - yy) ** 2);
    }

    /** Get bounding box */
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

    /** Serialize drawing to JSON */
    toJSON(): SerializedDrawing {
        return {
            id: this.id,
            type: this.type,
            points: [...this.points],
            style: { ...this.style },
            state: this.state === 'selected' ? 'complete' : this.state,
            visible: this.visible,
            locked: this.locked,
            opacity: this.opacity,
        };
    }

    /** Create BrushDrawing from serialized data */
    static fromJSON(data: SerializedDrawing): BrushDrawing {
        const drawing = new BrushDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            opacity: data.opacity,
        });

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });

        drawing.points = [...data.points];
        drawing.state = data.state;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
