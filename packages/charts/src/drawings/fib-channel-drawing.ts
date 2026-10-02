/**
 * Fibonacci Channel Drawing Implementation
 * 
 * A Fibonacci Channel combines parallel channel with Fibonacci levels:
 * - Points 0 and 1 define the base trend line
 * - Point 2 defines the channel width (100% level)
 * - Fibonacci levels (0%, 23.6%, 38.2%, 50%, 61.8%, 100%) are drawn as parallel lines
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
import { FibCommonSettings, defaultFibLevels, levelsFromJSON, levelsToJSON } from './fib-common';

/** Fibonacci channel level */
export interface FibChannelLevel {
    level: number;
    label: string;
    color: string;
    enabled: boolean;
}

/** Standard Fibonacci channel levels */
export const FIB_CHANNEL_LEVELS: FibChannelLevel[] = defaultFibLevels();

export interface FibChannelOptions {
    color?: string;
    lineWidth?: number;
    showLabels?: boolean;
    showPrices?: boolean;
    extendLeft?: boolean;
    extendRight?: boolean;
    reversed?: boolean;
    backgroundOpacity?: number;
    levels?: FibChannelLevel[];
}

/**
 * Fibonacci Channel Drawing
 * 
 * Uses 3 points: A (base start), B (base end), C (channel width/100% level)
 * Draws parallel lines at Fibonacci intervals between base (0%) and C (100%)
 */
export class FibChannelDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'fibChannel';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Channel specific options (kanalda seviyeler egik: fiyat etiketi ve log olcek yok)
    readonly fib = new FibCommonSettings({ prices: false, logScale: false });
    opacity: number = 1;
    reversed: boolean = false;
    backgroundOpacity: number = 0.2;
    levels: FibChannelLevel[];

    // Preview point tracking
    private _previewPointIndex: number = -1;

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    // Calculated level line data for rendering
    private _levelLines: {
        level: number;
        label: string;
        color: string;
        startX: number;
        startY: number;
        endX: number;
        endY: number;
    }[] = [];

    constructor(options: FibChannelOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#00bcd4', // Cyan for channel
            lineWidth: options.lineWidth || 1,
            lineDash: [],
        };
        this.fib.showLabels = options.showLabels !== false;
        this.fib.extendLeft = options.extendLeft || false;
        this.fib.extendRight = options.extendRight || false;
        this.reversed = options.reversed || false;
        this.backgroundOpacity = options.backgroundOpacity ?? 0.2;
        this.levels = options.levels ? [...options.levels] : FIB_CHANNEL_LEVELS.map(l => ({ ...l }));
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    ...this.fib.sections(),
                    {
                        title: 'Levels',
                        rows: [
                            { type: 'levelsGrid', key: 'levels', label: 'Channel Levels' }
                        ]
                    }
                ]),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Trend Line Color' },
            { type: 'lineWidth', key: 'lineWidth', tooltip: 'Line Width' },
            { type: 'lineStyle', key: 'lineStyle', tooltip: 'Line Style' },
        ];
    }

    getSettingValue(key: string): any {
        if (this.fib.has(key)) return this.fib.get(key);
        switch (key) {
            case 'opacity': return Math.round(this.opacity * 100);
            case 'color': return this.style.color;
            case 'lineWidth': return this.style.lineWidth;
            case 'lineStyle':
                if (!this.style.lineDash || this.style.lineDash.length === 0) return 'solid';
                if (this.style.lineDash[0] === 6) return 'dashed';
                return 'dotted';
            case 'backgroundOpacity': return Math.round(this.backgroundOpacity * 100);
            case 'reversed': return this.reversed;
            case 'levels': return this.levels;
            case 'visible': return this.visible;
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        if (this.fib.set(key, value)) return;
        switch (key) {
            case 'opacity':
                this.opacity = value / 100;
                break;
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
            case 'backgroundOpacity':
                this.backgroundOpacity = value / 100;
                break;
            case 'reversed':
                this.reversed = value;
                break;
            case 'levels':
                this.levels = value;
                break;
            case 'visible':
                this.visible = value;
                break;
        }
    }

    /** Add a point to the drawing */
    addPoint(time: number, price: number): void {
        this.points.push({ time, price });

        // Fib channel requires exactly 3 points
        if (this.points.length >= 3) {
            this.state = 'complete';
        }
    }

    /** Check if drawing is complete */
    isComplete(): boolean {
        return this.points.length >= 3 && this.state === 'complete';
    }

    /** Update the last point (during drawing preview) */
    updateLastPoint(time: number, price: number): void {
        if (this.points.length === 0) return;

        if (this.state === 'creating') {
            if (this._previewPointIndex === -1) {
                this.points.push({ time, price });
                this._previewPointIndex = this.points.length - 1;
            } else {
                this.points[this._previewPointIndex] = { time, price };
            }
        } else {
            const lastIndex = this.points.length - 1;
            this.points[lastIndex] = { time, price };
        }
    }

    /** Confirm the current preview point as permanent */
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

    /**
     * Calculate channel level lines
     * Each level is a line parallel to the base (A-B) at a Fibonacci distance toward C
     */
    calculateLevelLines(
        pixelPoints: { x: number; y: number }[],
        canvasWidth: number
    ): void {
        if (pixelPoints.length < 3) {
            this._levelLines = [];
            return;
        }

        const pA = pixelPoints[0]; // Base start
        const pB = pixelPoints[1]; // Base end
        const pC = pixelPoints[2]; // 100% level point

        // Calculate the perpendicular offset from base line to C
        // Vector from A to B
        const abX = pB.x - pA.x;
        const abY = pB.y - pA.y;

        // At point C's x position, find the Y on the base line
        const t = abX !== 0 ? (pC.x - pA.x) / abX : 0;
        const baseYAtCX = pA.y + t * abY;

        // Offset is the difference between C and the base line
        const offsetY = pC.y - baseYAtCX;

        // Enabled levels only
        const enabledLevels = this.levels.filter(l => l.enabled);

        // Calculate extension for left and right
        let extendLeftX = 0;
        let extendRightX = canvasWidth;

        // Calculate line start/end based on extend options
        const lineStartX = this.fib.extendLeft ? extendLeftX : Math.min(pA.x, pB.x);
        const lineEndX = this.fib.extendRight ? extendRightX : Math.max(pA.x, pB.x);

        // Calculate Y positions at start and end X for each level
        this._levelLines = enabledLevels.map(({ level, label, color }) => {
            // Offset for this level, reversed if needed (swap 0 and 1)
            const effectiveLevel = this.reversed ? (1 - level) : level;
            const levelOffsetY = offsetY * effectiveLevel;

            // Calculate Y at lineStartX and lineEndX
            const tStart = abX !== 0 ? (lineStartX - pA.x) / abX : 0;
            const tEnd = abX !== 0 ? (lineEndX - pA.x) / abX : 1;

            const startY = pA.y + tStart * abY + levelOffsetY;
            const endY = pA.y + tEnd * abY + levelOffsetY;

            return {
                level,
                label,
                color,
                startX: lineStartX,
                startY,
                endX: lineEndX,
                endY
            };
        });
    }

    /** Get calculated level lines for rendering */
    getLevelLines(): { level: number; label: string; color: string; startX: number; startY: number; endX: number; endY: number }[] {
        return this._levelLines;
    }

    /** Check if a pixel coordinate is near this drawing */
    hitTest(x: number, y: number, threshold: number = 8): boolean {
        // Check if near any level line
        for (const line of this._levelLines) {
            const dist = this._pointToLineDistance(x, y, line.startX, line.startY, line.endX, line.endY);
            if (dist <= threshold) {
                return true;
            }
        }

        // Check if near control points
        for (const point of this._pixelPoints) {
            const dx = x - point.x;
            const dy = y - point.y;
            if (Math.sqrt(dx * dx + dy * dy) <= threshold) {
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

        const allPoints = [...this._pixelPoints];
        // Add level line endpoints
        for (const line of this._levelLines) {
            allPoints.push({ x: line.startX, y: line.startY });
            allPoints.push({ x: line.endX, y: line.endY });
        }

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
            extendLeft: this.fib.extendLeft,
            extendRight: this.fib.extendRight,
            showLabels: this.fib.showLabels,
            opacity: this.opacity,
            backgroundOpacity: this.backgroundOpacity,
            reversed: this.reversed,
            levels: levelsToJSON(this.levels),
            fib: this.fib.toJSON(),
        };
    }

    /** Create FibChannelDrawing from serialized data */
    static fromJSON(data: SerializedDrawing): FibChannelDrawing {
        const drawing = new FibChannelDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            showLabels: data.showLabels,
            extendLeft: data.extendLeft,
            extendRight: data.extendRight,
            backgroundOpacity: data.backgroundOpacity,
            reversed: data.reversed,
            levels: levelsFromJSON(data.levels),
        });
        drawing.style = { ...drawing.style, ...data.style };
        if (data.opacity !== undefined) drawing.opacity = data.opacity;
        drawing.fib.applyJSON(data.fib);

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });

        drawing.points = [...data.points];
        drawing.state = data.state;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
