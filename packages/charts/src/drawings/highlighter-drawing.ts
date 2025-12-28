/**
 * Highlighter Drawing Implementation
 * 
 * Free-form drawing tool that captures mouse movements as a path
 * Similar to a brush but typically thicker and more transparent
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

export interface HighlighterOptions {
    color?: string;
    lineWidth?: number;
    opacity?: number;
    smooth?: boolean;
}

/**
 * Highlighter Drawing - Free-form path drawing tool with transparency
 */
export class HighlighterDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'highlighter';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Highlighter specific options
    opacity: number = 0.35; // Lower default opacity for highlighting
    smooth: boolean = true;

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: HighlighterOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#ffeb3b', // Default yellow highlighter
            lineWidth: options.lineWidth || 10, // Thicker default
            lineDash: [],
        };
        this.opacity = options.opacity ?? 0.35;
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
                        title: 'Highlighter',
                        rows: [
                            colorRow('color', 'Color'),
                            lineWidthRow('lineWidth'),
                            lineStyleRow('lineStyle'),
                        ]
                    },
                    {
                        title: 'Opacity',
                        rows: [
                            sliderRow('opacity', 'Opacity', 10, 100, '%'),
                        ]
                    }
                ]),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Color' },
            { type: 'lineWidth', key: 'lineWidth', tooltip: 'Width' },
            { type: 'lineStyle', key: 'lineStyle', tooltip: 'Style' },
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

    /** Add a point to the path */
    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
    }

    /** Check if drawing is complete */
    isComplete(): boolean {
        return this.state === 'complete' && this.points.length >= 2;
    }

    /** Update the last point */
    updateLastPoint(time: number, price: number): void {
        if (this.state === 'creating') {
            if (this.points.length > 0) {
                const lastPoint = this.points[this.points.length - 1];
                const timeDiff = Math.abs(time - lastPoint.time);
                const priceDiff = Math.abs(price - lastPoint.price);

                // Use a threshold to prevent jitter (similar to brush)
                const minTimeDistance = 0.0001;
                const minPriceDistance = 0.0001;

                if (timeDiff > minTimeDistance || priceDiff > minPriceDistance) {
                    this.points.push({ time, price });
                }
            }
        }
    }

    /** Finish the stroke */
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

    /** Hit test on any segment of the path */
    hitTest(x: number, y: number, threshold: number = 8): boolean {
        if (this._pixelPoints.length < 2) return false;

        for (let i = 0; i < this._pixelPoints.length - 1; i++) {
            const p1 = this._pixelPoints[i];
            const p2 = this._pixelPoints[i + 1];
            const dist = this._pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
            if (dist <= threshold + this.style.lineWidth / 2) {
                return true;
            }
        }

        return false;
    }

    private _pointToLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;

        let param = -1;
        if (lenSq !== 0) param = dot / lenSq;

        let xx: number, yy: number;
        if (param < 0) { xx = x1; yy = y1; }
        else if (param > 1) { xx = x2; yy = y2; }
        else { xx = x1 + param * C; yy = y1 + param * D; }

        return Math.sqrt((px - xx) ** 2 + (py - yy) ** 2);
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length < 2) return null;

        const xs = this._pixelPoints.map(p => p.x);
        const ys = this._pixelPoints.map(p => p.y);

        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const pad = this.style.lineWidth / 2;
        return {
            x: minX - pad,
            y: minY - pad,
            width: maxX - minX + pad * 2,
            height: maxY - minY + pad * 2
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
            opacity: this.opacity,
        };
    }

    static fromJSON(data: SerializedDrawing): HighlighterDrawing {
        const drawing = new HighlighterDrawing({
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
