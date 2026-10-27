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
} from './drawing-settings-config';

import { LineToolProps, createLineProps, serializeLineProps, deserializeLineProps } from './line-tool-common';
import { restoreShapeStyle } from './shape-common';
import {
    TV_CYAN,
    createOpenStyle,
    openLineSection,
    backgroundSection,
    openAttributeBarItems,
    getOpenSetting,
    setOpenSetting,
} from './open-shape-common';

export interface BrushOptions {
    color?: string;
    lineWidth?: number;
    opacity?: number;
    smooth?: boolean;
    fillColor?: string;
    fillOpacity?: number;
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

    /** Sol/sag uc sekli (stroke basi / sonu) */
    lineProps: LineToolProps = createLineProps();

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: BrushOptions = {}) {
        this.id = generateDrawingId();
        this.style = createOpenStyle(DEFAULT_DRAWING_STYLE, {
            color: TV_CYAN,
            lineWidth: 2,
            fill: { color: TV_CYAN, opacity: 0.2, enabled: false },
        }, options);
        this.opacity = options.opacity ?? 1.0;
        this.smooth = options.smooth !== false;
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([openLineSection({ style: false, ends: true }), backgroundSection()]),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return openAttributeBarItems({ fill: true, style: false });
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'visible': return this.visible;
            case 'opacity': return Math.round(this.opacity * 100);
        }
        return getOpenSetting(this.style, this.lineProps, key);
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'visible': this.visible = value; return;
            case 'opacity': this.opacity = value / 100; return;
        }
        setOpenSetting(this.style, this.lineProps, key, value);
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
            lineProps: serializeLineProps(this.lineProps),
        };
    }

    /** Create BrushDrawing from serialized data */
    static fromJSON(data: SerializedDrawing): BrushDrawing {
        const drawing = new BrushDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            opacity: data.opacity,
        });

        restoreShapeStyle(drawing.style, data.style);
        drawing.lineProps = deserializeLineProps(data.lineProps);
        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });

        drawing.points = [...data.points];
        drawing.state = data.state;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
