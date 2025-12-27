/**
 * Fibonacci Retracement Drawing Implementation
 * 
 * Standard Fibonacci levels: 0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%
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
    checkboxRow,
    sliderRow
} from './drawing-settings-config';

/** Fibonacci level with color and enabled state */
export interface FibLevel {
    level: number;
    label: string;
    color: string;
    enabled: boolean;
}

/** Standard Fibonacci retracement levels with colors */
export const FIBONACCI_LEVELS: FibLevel[] = [
    // Standard retracement levels (enabled by default)
    { level: 0, label: '0', color: '#787b86', enabled: true },
    { level: 0.236, label: '0.236', color: '#ef5350', enabled: true },
    { level: 0.382, label: '0.382', color: '#4caf50', enabled: true },
    { level: 0.5, label: '0.5', color: '#26a69a', enabled: true },
    { level: 0.618, label: '0.618', color: '#2196f3', enabled: true },
    { level: 0.786, label: '0.786', color: '#ab47bc', enabled: true },
    { level: 1, label: '1', color: '#ffc107', enabled: true },

    // Extension levels (disabled by default)
    { level: -0.236, label: '-0.236', color: '#ef9a9a', enabled: false },
    { level: -0.5, label: '-0.5', color: '#81d4fa', enabled: false },
    { level: 1.272, label: '1.272', color: '#ffab91', enabled: false },
    { level: 1.414, label: '1.414', color: '#ef9a9a', enabled: false },
    { level: 1.618, label: '1.618', color: '#90caf9', enabled: false },
    { level: 1.886, label: '1.886', color: '#81c784', enabled: false },
    { level: 2, label: '2', color: '#80cbc4', enabled: false },
    { level: 2.618, label: '2.618', color: '#ba68c8', enabled: false },
    { level: 3.618, label: '3.618', color: '#ce93d8', enabled: false },
    { level: 4.236, label: '4.236', color: '#f48fb1', enabled: false },
];

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
    showLabels: boolean = true;
    showPrices: boolean = true;
    extendLines: boolean = false;
    opacity: number = 0.8;           // 0-1 opacity for lines
    backgroundOpacity: number = 0.1;  // 0-1 opacity for fill between levels
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
        this.showLabels = options.showLabels !== false;
        this.showPrices = options.showPrices !== false;
        this.extendLines = options.extendLines || false;
        this.backgroundOpacity = options.backgroundOpacity ?? 0.1;
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
                    {
                        title: 'Line',
                        rows: [
                            colorRow('color', 'Trend Line Color'),
                            lineWidthRow('lineWidth'),
                            lineStyleRow('lineStyle'),
                        ]
                    },
                    {
                        title: 'Opacity',
                        rows: [
                            sliderRow('opacity', 'Line Opacity', 10, 100, '%'),
                            sliderRow('backgroundOpacity', 'Background', 0, 50, '%'),
                        ]
                    },
                    {
                        title: 'Options',
                        rows: [
                            checkboxRow('extendLines', 'Extend Lines'),
                            checkboxRow('reversed', 'Reverse'),
                            checkboxRow('showLabels', 'Show Labels'),
                            checkboxRow('showPrices', 'Show Prices'),
                        ]
                    },
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
        switch (key) {
            case 'color': return this.style.color;
            case 'lineWidth': return this.style.lineWidth;
            case 'lineStyle':
                if (!this.style.lineDash || this.style.lineDash.length === 0) return 'solid';
                if (this.style.lineDash[0] === 6) return 'dashed';
                return 'dotted';
            case 'opacity': return Math.round(this.opacity * 100);
            case 'backgroundOpacity': return Math.round(this.backgroundOpacity * 100);
            case 'extendLines': return this.extendLines;
            case 'reversed': return this.reversed;
            case 'showLabels': return this.showLabels;
            case 'showPrices': return this.showPrices;
            case 'levels': return this.levels;
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
            case 'opacity':
                this.opacity = value / 100;
                break;
            case 'backgroundOpacity':
                this.backgroundOpacity = value / 100;
                break;
            case 'extendLines':
                this.extendLines = value;
                break;
            case 'reversed':
                this.reversed = value;
                break;
            case 'showLabels':
                this.showLabels = value;
                break;
            case 'showPrices':
                this.showPrices = value;
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

    /** Calculate and cache level data (called by renderer) */
    calculateLevels(priceToYScaled: (price: number) => number, priceToYNonScaled?: (price: number) => number): void {
        if (this.points.length < 2) {
            this._levelData = [];
            this._levelYNonScaled = [];
            return;
        }

        const startPrice = this.points[0].price;
        const endPrice = this.points[1].price;
        const priceDiff = endPrice - startPrice;

        // Only include enabled levels
        const enabledLevels = this.levels.filter(l => l.enabled);

        this._levelData = enabledLevels.map(({ level, label, color }) => {
            // Level 0 = end price, Level 1 = start price (for uptrend)
            // When reversed, swap the direction
            const effectiveLevel = this.reversed ? (1 - level) : level;
            const price = startPrice + priceDiff * (1 - effectiveLevel);
            const y = priceToYScaled(price);
            return { level, label, color, price, y };
        });

        // Calculate non-scaled Y for hit testing
        if (priceToYNonScaled) {
            this._levelYNonScaled = enabledLevels.map(({ level }) => {
                const effectiveLevel = this.reversed ? (1 - level) : level;
                const price = startPrice + priceDiff * (1 - effectiveLevel);
                return priceToYNonScaled(price);
            });
        } else {
            // Fallback: use pixel points if available
            this._levelYNonScaled = this._levelData.map(ld => ld.y);
        }
    }

    /** Get calculated level data (DPR-scaled for rendering) */
    getLevelData(): { level: number; label: string; color: string; price: number; y: number }[] {
        return this._levelData;
    }

    /** Check if a pixel coordinate is near this drawing (uses NON-SCALED coordinates) */
    hitTest(x: number, y: number, threshold: number = 8): boolean {
        if (this._pixelPoints.length < 2) return false;

        const x1 = Math.min(this._pixelPoints[0].x, this._pixelPoints[1].x);
        const x2 = Math.max(this._pixelPoints[0].x, this._pixelPoints[1].x);

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
            extendLines: this.extendLines,
            showLabels: this.showLabels,
            showPrices: this.showPrices,
            backgroundOpacity: this.backgroundOpacity,
            reversed: this.reversed,
            levels: this.levels.map(l => ({
                value: l.level,
                color: l.color,
                visible: l.enabled
            })),
        };
    }

    /** Create FibRetracementDrawing from serialized data */
    static fromJSON(data: SerializedDrawing): FibRetracementDrawing {
        // Reconstruct levels from serialized data
        let levels: FibLevel[] | undefined;
        if (data.levels) {
            levels = data.levels.map((l, idx) => ({
                level: l.value,
                label: String(l.value),
                color: l.color,
                enabled: l.visible,
            }));
        }

        const drawing = new FibRetracementDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            showLabels: data.showLabels,
            showPrices: data.showPrices,
            extendLines: data.extendLines,
            backgroundOpacity: data.backgroundOpacity,
            reversed: data.reversed,
            levels: levels,
        });

        // Override generated id with saved id
        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });

        drawing.points = [...data.points];
        drawing.state = data.state;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
