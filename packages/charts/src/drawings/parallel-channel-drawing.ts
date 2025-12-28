/**
 * Parallel Channel Drawing Implementation
 * 
 * A parallel channel consists of two parallel trend lines:
 * - Points 0 and 1 define the main line (base)
 * - Point 2 defines the parallel line offset (channel width)
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
    checkboxRow
} from './drawing-settings-config';

export interface ParallelChannelOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    fillColor?: string;
    fillOpacity?: number;
    extendLeft?: boolean;
    extendRight?: boolean;
    showMiddleLine?: boolean;
}

/**
 * Parallel Channel - Two parallel lines with optional fill
 */
export class ParallelChannelDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'parallelChannel';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Extension options
    extendLeft: boolean = false;
    extendRight: boolean = false;
    showMiddleLine: boolean = true;

    // Cached pixel coordinates (updated by renderer)
    private _pixelPoints: { x: number; y: number }[] = [];
    // Cached parallel line pixel points
    private _parallelPixelPoints: { x: number; y: number }[] = [];
    // Index of the current preview point (-1 if none)
    private _previewPointIndex: number = -1;


    constructor(options: ParallelChannelOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#2962ff',
            lineWidth: options.lineWidth || 2,
            lineDash: options.lineDash || [],
            fillColor: options.fillColor || '#2962ff',
            fillOpacity: options.fillOpacity || 0.1,
        };
        this.extendLeft = options.extendLeft || false;
        this.extendRight = options.extendRight || false;
        this.showMiddleLine = options.showMiddleLine !== undefined ? options.showMiddleLine : true;
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    {
                        title: 'Parallel Channel',
                        rows: [
                            colorRow('color', 'Line Color'),
                            lineWidthRow('lineWidth'),
                            lineStyleRow('lineStyle'),
                        ]
                    },
                    {
                        title: 'Fill',
                        rows: [
                            colorRow('fillColor', 'Fill Color'),
                            // TODO: Add opacity slider
                        ]
                    },
                    {
                        title: 'Options',
                        rows: [
                            checkboxRow('extendLeft', 'Extend Left'),
                            checkboxRow('extendRight', 'Extend Right'),
                            checkboxRow('showMiddleLine', 'Show Middle Line'),
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
            case 'fillColor': return this.style.fillColor;
            case 'fillOpacity': return this.style.fillOpacity;
            case 'extendLeft': return this.extendLeft;
            case 'extendRight': return this.extendRight;
            case 'showMiddleLine': return this.showMiddleLine;
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
            case 'fillColor':
                this.style.fillColor = value;
                break;
            case 'fillOpacity':
                this.style.fillOpacity = value;
                break;
            case 'extendLeft':
                this.extendLeft = value;
                break;
            case 'extendRight':
                this.extendRight = value;
                break;
            case 'showMiddleLine':
                this.showMiddleLine = value;
                break;
            case 'visible':
                this.visible = value;
                break;
        }
    }

    /** Add a point to the drawing */
    addPoint(time: number, price: number): void {
        this.points.push({ time, price });

        // Parallel channel has exactly 3 points:
        // Point 0: Start of base line
        // Point 1: End of base line
        // Point 2: Defines the parallel offset (channel width)
        if (this.points.length >= 3) {
            this.state = 'complete';
        }
    }

    /** Check if drawing is complete (all required points placed) */
    isComplete(): boolean {
        return this.points.length >= 3 && this.state === 'complete';
    }


    /** Update the last point (during drawing preview) */
    updateLastPoint(time: number, price: number): void {
        // This method is for showing preview during mouse move
        // We need to show a preview of the next line segment
        if (this.points.length === 0) return;

        // For preview, we temporarily add a point and mark it as preview
        // When finishDrawing is called, the preview becomes permanent

        if (this.state === 'creating') {
            // Check if we need to add a preview point or update existing one
            if (this._previewPointIndex === -1) {
                // Add a new preview point
                this.points.push({ time, price });
                this._previewPointIndex = this.points.length - 1;
            } else {
                // Update existing preview point
                this.points[this._previewPointIndex] = { time, price };
            }
        } else {
            // Editing mode - just update the last point
            const lastIndex = this.points.length - 1;
            this.points[lastIndex] = { time, price };
        }
    }

    /** Confirm the current preview point as permanent */
    confirmPreviewPoint(): void {
        this._previewPointIndex = -1;
    }

    /** Get preview point index (-1 if none) */
    get previewPointIndex(): number {
        return this._previewPointIndex;
    }




    /** Set cached pixel coordinates for base line (called by renderer) */
    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = points;
    }

    /** Get pixel coordinates for base line */
    getPixelPoints(): { x: number; y: number }[] {
        return this._pixelPoints;
    }

    /** Set cached pixel coordinates for parallel line (called by renderer) */
    setParallelPixelPoints(points: { x: number; y: number }[]): void {
        this._parallelPixelPoints = points;
    }

    /** Get pixel coordinates for parallel line */
    getParallelPixelPoints(): { x: number; y: number }[] {
        return this._parallelPixelPoints;
    }

    /**
     * Calculate the parallel offset in price units
     * Returns the perpendicular distance from point 2 to the base line
     */
    getChannelOffset(): number {
        if (this.points.length < 3) return 0;

        const p0 = this.points[0];
        const p1 = this.points[1];
        const p2 = this.points[2];

        // Simply use the price difference of point 2 relative to the base line
        // This is a simplified approach - for proper perpendicular distance,
        // we'd need to consider the time vs price scaling
        const baseSlope = (p1.price - p0.price) / (p1.time - p0.time);
        const baseYAtP2Time = p0.price + baseSlope * (p2.time - p0.time);

        return p2.price - baseYAtP2Time;
    }

    /** Check if a pixel coordinate is near this channel */
    hitTest(x: number, y: number, threshold: number = 5): boolean {
        // Check base line
        if (this._pixelPoints.length >= 2) {
            const p1 = this._pixelPoints[0];
            const p2 = this._pixelPoints[1];
            const distBase = this._pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
            if (distBase <= threshold) return true;
        }

        // Check parallel line
        if (this._parallelPixelPoints.length >= 2) {
            const p1 = this._parallelPixelPoints[0];
            const p2 = this._parallelPixelPoints[1];
            const distParallel = this._pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
            if (distParallel <= threshold) return true;
        }

        // Check if inside the channel (for fill hit test)
        if (this._pixelPoints.length >= 2 && this._parallelPixelPoints.length >= 2) {
            const inChannel = this._isPointInChannel(x, y);
            if (inChannel) return true;
        }

        return false;
    }

    /** Check if point is inside the channel */
    private _isPointInChannel(x: number, y: number): boolean {
        if (this._pixelPoints.length < 2 || this._parallelPixelPoints.length < 2) return false;

        const b0 = this._pixelPoints[0];
        const b1 = this._pixelPoints[1];
        const p0 = this._parallelPixelPoints[0];
        const p1 = this._parallelPixelPoints[1];

        // Check if x is within the channel's horizontal range
        const minX = Math.min(b0.x, b1.x, p0.x, p1.x);
        const maxX = Math.max(b0.x, b1.x, p0.x, p1.x);
        if (x < minX || x > maxX) return false;

        // Calculate Y at this X for both lines
        const baseY = this._interpolateY(x, b0, b1);
        const parallelY = this._interpolateY(x, p0, p1);

        if (baseY === null || parallelY === null) return false;

        const minY = Math.min(baseY, parallelY);
        const maxY = Math.max(baseY, parallelY);

        return y >= minY && y <= maxY;
    }

    /** Interpolate Y value at given X on line */
    private _interpolateY(x: number, p1: { x: number; y: number }, p2: { x: number; y: number }): number | null {
        if (p1.x === p2.x) return null;
        const t = (x - p1.x) / (p2.x - p1.x);
        return p1.y + t * (p2.y - p1.y);
    }

    /** Get bounding box */
    getBounds(): { x: number; y: number; width: number; height: number } | null {
        const allPoints = [...this._pixelPoints, ...this._parallelPixelPoints];
        if (allPoints.length < 2) return null;

        const xs = allPoints.map(p => p.x);
        const ys = allPoints.map(p => p.y);

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

    /** Calculate distance from point to line segment */
    private _pointToLineDistance(
        px: number, py: number,
        x1: number, y1: number,
        x2: number, y2: number
    ): number {
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
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;

        return Math.sqrt(dx * dx + dy * dy);
    }

    // =========================================================================
    // Serialization
    // =========================================================================

    /** Serialize drawing to JSON for persistence */
    toJSON(): SerializedDrawing {
        return {
            id: this.id,
            type: this.type,
            points: [...this.points],
            style: { ...this.style },
            state: this.state === 'selected' ? 'complete' : this.state,
            visible: this.visible,
            locked: this.locked,
            extendLeft: this.extendLeft,
            extendRight: this.extendRight,
        };
    }

    /** Create ParallelChannelDrawing from serialized data */
    static fromJSON(data: SerializedDrawing): ParallelChannelDrawing {
        const drawing = new ParallelChannelDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            lineDash: data.style.lineDash,
            fillColor: data.style.fillColor,
            fillOpacity: data.style.fillOpacity,
            extendLeft: data.extendLeft,
            extendRight: data.extendRight,
        });

        // Override generated id with saved id
        (drawing as any)._id = data.id;
        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });

        drawing.points = [...data.points];
        drawing.state = data.state;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
