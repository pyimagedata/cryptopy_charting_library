/**
 * Path Drawing Implementation (Multi-point polyline)
 * 
 * A multi-point path where:
 * - Each click adds a new point
 * - Points are connected with lines
 * - ESC key finishes the drawing
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
    TV_BLUE,
    PATH_LINE_PROPS,
    createOpenStyle,
    openLineSection,
    openAttributeBarItems,
    getOpenSetting,
    setOpenSetting,
} from './open-shape-common';

export interface PathOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
}

/**
 * Path - A multi-point polyline
 */
export class PathDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'path';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    /** Sol/sag uc sekli (Path varsayilani: sag uc ok) */
    lineProps: LineToolProps = createLineProps(undefined, PATH_LINE_PROPS);

    // Preview point tracking
    private _previewPointIndex: number = -1;

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: PathOptions = {}) {
        this.id = generateDrawingId();
        this.style = createOpenStyle(DEFAULT_DRAWING_STYLE, { color: TV_BLUE, lineWidth: 2 }, options);
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([openLineSection({ ends: true })]),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return openAttributeBarItems({ fill: false, style: true });
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this.visible;
        return getOpenSetting(this.style, this.lineProps, key);
    }

    setSettingValue(key: string, value: any): void {
        if (key === 'visible') this.visible = value;
        else setOpenSetting(this.style, this.lineProps, key, value);
    }

    // =========================================================================
    // Point Management (Multi-point - never auto-completes)
    // =========================================================================

    /** Add a point to the drawing */
    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
        // Path never auto-completes - user must press ESC
    }

    /** Check if drawing is complete (path requires explicit completion) */
    isComplete(): boolean {
        // Path is complete when state is 'complete' (set by ESC key)
        return this.state === 'complete' && this.points.length >= 2;
    }

    /** Explicitly complete the path drawing (called when ESC is pressed) */
    finishPath(): void {
        // Remove preview point if exists
        if (this._previewPointIndex !== -1) {
            this.points.splice(this._previewPointIndex, 1);
            this._previewPointIndex = -1;
        }

        // Only complete if we have at least 2 points
        if (this.points.length >= 2) {
            this.state = 'complete';
        }
    }

    /** Update the last point (during preview) */
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

    // =========================================================================
    // Hit Testing
    // =========================================================================

    hitTest(x: number, y: number, threshold: number = 5): boolean {
        if (this._pixelPoints.length < 2) return false;

        // Check each line segment
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
            lineProps: serializeLineProps(this.lineProps),
        };
    }

    static fromJSON(data: SerializedDrawing): PathDrawing {
        const drawing = new PathDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            lineDash: data.style.lineDash
        });

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        restoreShapeStyle(drawing.style, data.style);
        drawing.lineProps = deserializeLineProps(data.lineProps, PATH_LINE_PROPS);
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
