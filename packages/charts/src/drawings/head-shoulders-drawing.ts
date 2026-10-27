/**
 * Head and Shoulders Pattern Drawing Implementation
 * 
 * TradingView-style 7-point pattern:
 * - P0, P2, P4, P6 = Neckline points (same slope)
 * - P1 = Left Shoulder dip
 * - P3 = Head dip
 * - P5 = Right Shoulder dip
 * 
 * Fill progression:
 * - 4+ points: Head triangle shows (P2-P3-neckline projection)
 * - 5+ points: LS triangle shows (P0-P1-P2)
 * - 7 points: RS triangle shows (P4-P5-P6)
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
    createPatternStyle,
    applySerializedPattern,
    getPatternSetting,
    setPatternSetting,
    patternStyleSections,
    patternAttributeBarItems,
} from './pattern-common';


export interface HeadShouldersOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    fillColor?: string;
}

// Point labels for Head and Shoulders (7 points)
// Odd indices are dips: 1=LS, 3=Head, 5=RS
export const HEAD_SHOULDERS_LABELS = ['', 'Left Shoulder', '', 'Head', '', 'Right Shoulder', ''];

/**
 * Head and Shoulders Pattern - 7-point TradingView-style pattern
 */
export class HeadShouldersDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'headShoulders';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Preview point tracking
    private _previewPointIndex: number = -1;

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: HeadShouldersOptions = {}) {
        this.id = generateDrawingId();
        this.style = createPatternStyle('headShoulders', DEFAULT_DRAWING_STYLE, options);
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab(patternStyleSections(true)),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return patternAttributeBarItems(true);
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this.visible;
        return getPatternSetting(this.style, key);
    }

    setSettingValue(key: string, value: any): void {
        if (key === 'visible') this.visible = value;
        else setPatternSetting(this.style, key, value);
    }

    // =========================================================================
    // Point Management (7 points)
    // =========================================================================

    /** Add a point to the drawing */
    addPoint(time: number, price: number): void {
        this.points.push({ time, price });

        // Complete after 7 points
        if (this.points.length >= 7) {
            this.state = 'complete';
        }
    }

    /** Check if drawing is complete (7 points) */
    isComplete(): boolean {
        return this.points.length >= 7 && this.state === 'complete';
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
        return HEAD_SHOULDERS_LABELS[index] || '';
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
        };
    }

    static fromJSON(data: SerializedDrawing): HeadShouldersDrawing {
        const drawing = new HeadShouldersDrawing();
        applySerializedPattern(drawing, data);
        return drawing;
    }
}
