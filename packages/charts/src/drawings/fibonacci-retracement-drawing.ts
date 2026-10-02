/**
 * Fibonacci Retracement Drawing Implementation
 *
 * Iki nokta (A -> B) arasinda yatay Fibonacci seviyeleri. Ortak ayarlar
 * (uzatma, etiketler, log olcek, trend cizgisi) fib-common.ts'te.
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
import { FibCommonSettings, defaultFibLevels, fibLevelPrice, levelsFromJSON, levelsToJSON } from './fib-common';

/** Fibonacci level with color and enabled state */
export interface FibLevel {
    level: number;
    label: string;
    color: string;
    enabled: boolean;
}

/** Standard Fibonacci retracement levels with colors */
export const FIBONACCI_LEVELS: FibLevel[] = defaultFibLevels();

export interface FibRetracementOptions {
    color?: string;
    lineWidth?: number;
    showLabels?: boolean;
    showPrices?: boolean;
    extendLines?: boolean;
    opacity?: number;
    backgroundOpacity?: number;
    reversed?: boolean;
    levels?: FibLevel[];
    opacityValue?: number;
}

/**
 * Fibonacci Retracement Drawing
 * 
 * User draws from point A (start) to point B (end).
 * Horizontal lines are drawn at each Fibonacci level between A and B prices.
 */
export class FibRetracementDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'fibRetracement';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Fibonacci specific options
    readonly fib = new FibCommonSettings({ prices: true, logScale: true });
    opacity: number = 1;           // 0-1 opacity for lines
    backgroundOpacity: number = 0.2;  // 0-1 opacity for fill between levels
    reversed: boolean = false;        // Reverse level order
    levels: FibLevel[];

    // Cached pixel coordinates (updated by renderer) - NON-SCALED for hit testing
    private _pixelPoints: { x: number; y: number }[] = [];

    // Pre-calculated level prices and Y coordinates (DPR-SCALED for rendering)
    private _levelData: { level: number; label: string; color: string; price: number; y: number }[] = [];

    // Pre-calculated level Y coordinates (NON-SCALED for hit testing)
    private _levelYNonScaled: number[] = [];

    constructor(options: FibRetracementOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#f0b90b',  // Golden color for Fibonacci
            lineWidth: options.lineWidth || 1,
            lineDash: [],
        };
        this.fib.showLabels = options.showLabels !== false;
        this.fib.showPrices = options.showPrices !== false;
        this.fib.extendRight = options.extendLines || false;
        this.backgroundOpacity = options.backgroundOpacity ?? 0.2;
        if (options.opacityValue !== undefined) this.opacity = options.opacityValue;
        this.reversed = options.reversed ?? false;
        // Deep copy levels to allow independent modification
        this.levels = options.levels ? [...options.levels] : FIBONACCI_LEVELS.map(l => ({ ...l }));
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
                            { type: 'levelsGrid', key: 'levels', label: 'Fibonacci Levels' }
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
            case 'color': return this.style.color;
            case 'lineWidth': return this.style.lineWidth;
            case 'lineStyle':
                if (!this.style.lineDash || this.style.lineDash.length === 0) return 'solid';
                if (this.style.lineDash[0] === 6) return 'dashed';
                return 'dotted';
            case 'opacity': return Math.round(this.opacity * 100);
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

        // Fibonacci retracement requires exactly 2 points
        if (this.points.length >= 2) {
            this.state = 'complete';
        }
    }

    /** Update the last point (during drawing preview) */
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

    /** Set cached pixel coordinates (called by renderer) - these are NON-SCALED */
    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = points;
    }

    /** Get pixel coordinates */
    getPixelPoints(): { x: number; y: number }[] {
        return this._pixelPoints;
    }

    /**
     * Calculate and cache level data (called by renderer).
     * Seviye 0 ikinci noktada (B), 1 ilk noktada (A); "Reverse" yonu cevirir.
     */
    calculateLevels(
        priceToYScaled: (price: number) => number,
        priceToYNonScaled?: (price: number) => number,
        isLogScale: boolean = false,
    ): void {
        if (this.points.length < 2) {
            this._levelData = [];
            this._levelYNonScaled = [];
            return;
        }

        const a = this.points[0].price;
        const b = this.points[1].price;
        const base = this.reversed ? a : b;
        const target = this.reversed ? b : a;
        const useLog = this.fib.logScale && isLogScale;

        const enabledLevels = this.levels.filter(l => l.enabled);
        this._levelData = enabledLevels.map(({ level, label, color }) => {
            const price = fibLevelPrice(base, target, level, useLog);
            return { level, label, color, price, y: priceToYScaled(price) };
        });
        this._levelYNonScaled = priceToYNonScaled
            ? this._levelData.map(ld => priceToYNonScaled(ld.price))
            : this._levelData.map(ld => ld.y);
    }

    /** Get calculated level data (DPR-scaled for rendering) */
    getLevelData(): { level: number; label: string; color: string; price: number; y: number }[] {
        return this._levelData;
    }

    /** Check if a pixel coordinate is near this drawing (uses NON-SCALED coordinates) */
    hitTest(x: number, y: number, threshold: number = 8): boolean {
        if (this._pixelPoints.length < 2) return false;

        const x1 = this.fib.extendLeft ? -Infinity : Math.min(this._pixelPoints[0].x, this._pixelPoints[1].x);
        const x2 = this.fib.extendRight ? Infinity : Math.max(this._pixelPoints[0].x, this._pixelPoints[1].x);

        // Check if near any of the horizontal level lines (using non-scaled Y)
        for (const levelY of this._levelYNonScaled) {
            // Check if x is within range and y is near the level line
            if (x >= x1 - threshold && x <= x2 + threshold) {
                if (Math.abs(y - levelY) <= threshold) {
                    return true;
                }
            }
        }

        // Also check if near the control points
        for (const point of this._pixelPoints) {
            const dx = x - point.x;
            const dy = y - point.y;
            if (Math.sqrt(dx * dx + dy * dy) <= threshold) {
                return true;
            }
        }

        return false;
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

    /** Get price range for the drawing */
    getPriceRange(): { min: number; max: number } | null {
        if (this.points.length < 2) return null;

        return {
            min: Math.min(this.points[0].price, this.points[1].price),
            max: Math.max(this.points[0].price, this.points[1].price)
        };
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
            // Fib-specific
            extendLines: this.fib.extendRight,
            showLabels: this.fib.showLabels,
            showPrices: this.fib.showPrices,
            opacity: this.opacity,
            backgroundOpacity: this.backgroundOpacity,
            reversed: this.reversed,
            levels: levelsToJSON(this.levels),
            fib: this.fib.toJSON(),
        };
    }

    /** Create FibRetracementDrawing from serialized data */
    static fromJSON(data: SerializedDrawing): FibRetracementDrawing {
        const drawing = new FibRetracementDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            showLabels: data.showLabels,
            showPrices: data.showPrices,
            extendLines: data.extendLines,
            backgroundOpacity: data.backgroundOpacity,
            reversed: data.reversed,
            levels: levelsFromJSON(data.levels),
            opacityValue: data.opacity,
        });
        drawing.style = { ...drawing.style, ...data.style };
        drawing.fib.applyJSON(data.fib);

        // Override generated id with saved id
        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });

        drawing.points = [...data.points];
        drawing.state = data.state;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
