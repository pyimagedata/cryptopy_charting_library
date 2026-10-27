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
    SettingsSection,
    createStyleTab,
    createVisibilityTab,
    colorRow,
} from './drawing-settings-config';

import { parseColor, colorToHex, restoreShapeStyle } from './shape-common';
import { TV_RED, createOpenStyle } from './open-shape-common';

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
    opacity: number = 0.2; // TradingView: transparency 80
    smooth: boolean = true;

    /** Attribute bar genislik secenekleri (varsayilan 1-5 yerine) */
    readonly lineWidthOptions: number[] = [5, 10, 20, 30, 40];

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: HighlighterOptions = {}) {
        this.id = generateDrawingId();
        this.style = createOpenStyle(DEFAULT_DRAWING_STYLE, { color: TV_RED, lineWidth: 20 }, options);
        this.opacity = options.opacity ?? 0.2;
        this.smooth = options.smooth !== false;
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        const section: SettingsSection = {
            title: 'Highlighter',
            rows: [
                colorRow('color', 'Color'),
                { type: 'slider', key: 'transparency', label: 'Transparency', min: 0, max: 100, step: 1, unit: '%', suffix: '%' } as any,
                { type: 'slider', key: 'lineWidth', label: 'Width', min: 1, max: 50, step: 1, unit: 'px' } as any,
            ]
        };
        return { tabs: [createStyleTab([section]), createVisibilityTab()] };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Color' },
            { type: 'lineWidth', key: 'lineWidth', tooltip: 'Width' },
        ];
    }

    /** Etkin alfa = rengin kendi alfasi x opacity */
    private _effectiveAlpha(): number {
        const p = parseColor(this.style.color);
        return (p ? p.a : 1) * this.opacity;
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'color': return this.style.color;
            case 'lineWidth': return this.style.lineWidth;
            case 'transparency': return Math.round((1 - this._effectiveAlpha()) * 100);
            case 'opacity': return Math.round(this.opacity * 100);
            case 'visible': return this.visible;
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'color': {
                // Gorunen etkin alfayi koru; rengin kendi alfasi varsa o belirler
                const eff = this._effectiveAlpha();
                const next = parseColor(value);
                this.style.color = value;
                this.opacity = Math.max(0, Math.min(1, eff / (next && next.a > 0 ? next.a : 1)));
                break;
            }
            case 'lineWidth':
                this.style.lineWidth = value;
                break;
            case 'transparency':
                this.style.color = colorToHex(this.style.color) ?? this.style.color;
                this.opacity = Math.max(0, Math.min(1, 1 - Number(value) / 100));
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
        drawing.opacity = data.opacity ?? 0.35; // Eski kayit: opacity yoksa eski varsayilan

        restoreShapeStyle(drawing.style, data.style);
        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
