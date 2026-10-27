/**
 * Polyline Drawing Implementation (Multi-point polyline/polygon)
 * 
 * A multi-point polyline where:
 * - Each click adds a new point
 * - Points are connected with lines
 * - Clicking near the start point closes the shape (becomes polygon with fill)
 * - ESC key finishes the drawing as an open polyline
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

export interface PolylineOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    fillColor?: string;
    fillOpacity?: number;
    /** Acikken de (>=3 nokta) kapali alan gibi doldur (yeni cizimlerde true; eski kayitlarda false) */
    fillOpenArea?: boolean;
}

/**
 * Polyline - A multi-point polyline that can become a closed polygon
 */
export class PolylineDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'polyline';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Is the shape closed (polygon)?
    isClosed: boolean = false;

    // Fill the implied polygon of an open polyline too (TradingView behaviour)
    fillOpenArea: boolean = true;

    // Preview point tracking
    private _previewPointIndex: number = -1;

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: PolylineOptions = {}) {
        this.id = generateDrawingId();
        this.style = createOpenStyle(DEFAULT_DRAWING_STYLE, {
            color: TV_CYAN,
            lineWidth: 2,
            fill: { color: TV_CYAN, opacity: 0.2, enabled: true },
        }, options);
        this.fillOpenArea = options.fillOpenArea !== false;
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([openLineSection(), backgroundSection()]),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return openAttributeBarItems({ fill: true, style: true });
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this.visible;
        return getOpenSetting(this.style, undefined, key);
    }

    setSettingValue(key: string, value: any): void {
        if (key === 'visible') this.visible = value;
        else setOpenSetting(this.style, undefined, key, value);
    }

    /** Dolgu cizilmeli mi: kapali sekil ya da (fillOpenArea) en az 3 nokta */
    shouldFill(pointCount: number): boolean {
        return this.isClosed || (this.fillOpenArea && pointCount >= 3);
    }

    // =========================================================================
    // Point Management (Multi-point)
    // =========================================================================

    /** Add a point to the drawing */
    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
    }

    /** Check if drawing is complete */
    isComplete(): boolean {
        return this.state === 'complete' && this.points.length >= 2;
    }

    /** Check if a pixel point is near the start point (for closing) */
    isNearStartPoint(x: number, y: number, threshold: number = 15): boolean {
        if (this._pixelPoints.length < 3) return false; // Need at least 3 points to close

        const startPoint = this._pixelPoints[0];
        const distance = Math.sqrt((x - startPoint.x) ** 2 + (y - startPoint.y) ** 2);
        return distance <= threshold;
    }

    /** Close the shape (become polygon) */
    closeShape(): void {
        if (this.points.length >= 3) {
            // Remove preview point if exists
            if (this._previewPointIndex !== -1) {
                this.points.splice(this._previewPointIndex, 1);
                this._previewPointIndex = -1;
            }

            this.isClosed = true;
            this.state = 'complete';
        }
    }

    /** Finish as open polyline (called when ESC is pressed) */
    finishPolyline(): void {
        // Remove preview point if exists
        if (this._previewPointIndex !== -1) {
            this.points.splice(this._previewPointIndex, 1);
            this._previewPointIndex = -1;
        }

        // Only complete if we have at least 2 points
        if (this.points.length >= 2) {
            this.isClosed = false;
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

        // If filled (closed or open-but-filled), check if point is inside the polygon
        if (this.shouldFill(this._pixelPoints.length)) {
            if (this._isPointInPolygon(x, y)) return true;
        }

        // Check each line segment
        const numSegments = this.isClosed ? this._pixelPoints.length : this._pixelPoints.length - 1;
        for (let i = 0; i < numSegments; i++) {
            const p0 = this._pixelPoints[i];
            const p1 = this._pixelPoints[(i + 1) % this._pixelPoints.length];

            const dist = this._pointToLineDistance(x, y, p0.x, p0.y, p1.x, p1.y);
            if (dist <= threshold) return true;
        }

        return false;
    }

    private _isPointInPolygon(x: number, y: number): boolean {
        let inside = false;
        const n = this._pixelPoints.length;

        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = this._pixelPoints[i].x;
            const yi = this._pixelPoints[i].y;
            const xj = this._pixelPoints[j].x;
            const yj = this._pixelPoints[j].y;

            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
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
            isClosed: this.isClosed,
            fillOpenArea: this.fillOpenArea,
        } as any;
    }

    static fromJSON(data: SerializedDrawing): PolylineDrawing {
        const drawing = new PolylineDrawing();
        restoreShapeStyle(drawing.style, data.style);
        // Eski kayitlarda opaklik rengin kendi alfasindaydi (fillOpacity yok)
        // fillColor yoksa dolgu kapali kalir (ani opak dolgu olmasin)
        if (data.style?.fillColor && data.style?.fillOpacity === undefined) drawing.style.fillOpacity = 1;
        // Eski kayitlarda yalnizca kapali sekil dolduruluyordu
        drawing.fillOpenArea = (data as any).fillOpenArea === true;

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;
        drawing.isClosed = (data as any).isClosed || false;

        return drawing;
    }
}
