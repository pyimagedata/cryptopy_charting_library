/**
 * Arrow Marker Drawing Implementation (Broad Tapered Arrow)
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
} from './drawing-settings-config';

export interface ArrowMarkerOptions {
    color?: string;
    size?: number;
}

/**
 * Arrow Marker - A 2-point broad tapered arrow drawing
 */
export class ArrowMarkerDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'arrowMarker';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Arrow specific options
    size: number = 24; // Thickness

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: ArrowMarkerOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#f23645', // Default red from image
        };
        this.size = options.size || 24;
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    {
                        title: 'Arrow Marker',
                        rows: [
                            colorRow('color', 'Color'),
                            {
                                type: 'slider',
                                key: 'size',
                                label: 'Thickness',
                                min: 4,
                                max: 100,
                                step: 1,
                                defaultValue: 24
                            },
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
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'color': return this.style.color;
            case 'size': return this.size;
            case 'visible': return this.visible;
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'color':
                this.style.color = value;
                break;
            case 'size':
                this.size = value;
                break;
            case 'visible':
                this.visible = value;
                break;
        }
    }

    /** Add a point to the drawing */
    addPoint(time: number, price: number): void {
        this.points.push({ time, price });

        // Broad arrow has exactly 2 points
        if (this.points.length >= 2) {
            this.state = 'complete';
        }
    }

    /** Check if drawing is complete */
    isComplete(): boolean {
        return this.points.length >= 2;
    }

    /** Update the last point (during preview) */
    updateLastPoint(time: number, price: number): void {
        if (this.points.length > 0) {
            if (this.points.length === 1) {
                // Add second point as preview
                this.points.push({ time, price });
            } else {
                // Update existing second point
                this.points[1] = { time, price };
            }
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

    /** Hit test on the marker area */
    hitTest(x: number, y: number, threshold: number = 8): boolean {
        if (this._pixelPoints.length < 2) return false;

        const p1 = this._pixelPoints[0];
        const p2 = this._pixelPoints[1];

        const distance = this._pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);

        return distance <= (this.size / 2) + threshold;
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

        let xx, yy;

        if (param < 0) { xx = x1; yy = y1; }
        else if (param > 1) { xx = x2; yy = y2; }
        else { xx = x1 + param * C; yy = y1 + param * D; }

        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length < 2) return null;

        const p1 = this._pixelPoints[0];
        const p2 = this._pixelPoints[1];

        const minX = Math.min(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxX = Math.max(p1.x, p2.x);
        const maxY = Math.max(p1.y, p2.y);

        const halfSize = this.size / 2;

        return {
            x: minX - halfSize,
            y: minY - halfSize,
            width: (maxX - minX) + this.size,
            height: (maxY - minY) + this.size
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
            // Custom properties
            size: this.size,
        };
    }

    static fromJSON(data: SerializedDrawing): ArrowMarkerDrawing {
        const drawing = new ArrowMarkerDrawing({
            color: data.style.color,
            size: (data as any).size,
        });

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
