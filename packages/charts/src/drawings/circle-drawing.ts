/**
 * Circle Drawing Implementation
 * 
 * Circle is defined by center point and radius (edge point).
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

export interface CircleOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    fillColor?: string;
    fillOpacity?: number;
}

/**
 * Circle - Defined by center and a point on the edge
 */
export class CircleDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'circle';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    constructor(options: CircleOptions = {}) {
        this.id = generateDrawingId();
        this.style = createShapeStyle('circle', DEFAULT_DRAWING_STYLE, options);
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

    /** Add a point to the drawing */
    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
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
                this.points.push({ time, price });
            } else {
                this.points[1] = { time, price };
            }
        }
    }

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    /** Set cached pixel coordinates */
    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = points;
    }

    /** Get pixel coordinates */
    getPixelPoints(): { x: number; y: number }[] {
        return this._pixelPoints;
    }

    /** Calculate radius in pixels */
    getRadius(): number {
        if (this._pixelPoints.length < 2) return 0;
        const [center, edge] = this._pixelPoints;
        return Math.sqrt((edge.x - center.x) ** 2 + (edge.y - center.y) ** 2);
    }

    /** Hit test on the circle border or body */
    hitTest(x: number, y: number, threshold: number = 5): boolean {
        if (this._pixelPoints.length < 2) return false;

        const center = this._pixelPoints[0];
        const radius = this.getRadius();

        if (radius === 0) return false;

        const distance = Math.sqrt((x - center.x) ** 2 + (y - center.y) ** 2);

        // Inside circle (for fill hit)
        if (distance <= radius) return true;

        // On border (with threshold)
        if (Math.abs(distance - radius) <= threshold) return true;

        return false;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length < 2) return null;

        const center = this._pixelPoints[0];
        const radius = this.getRadius();

        return {
            x: center.x - radius,
            y: center.y - radius,
            width: radius * 2,
            height: radius * 2
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

    static fromJSON(data: SerializedDrawing): CircleDrawing {
        const drawing = new CircleDrawing();
        restoreShapeStyle(drawing.style, data.style);

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
