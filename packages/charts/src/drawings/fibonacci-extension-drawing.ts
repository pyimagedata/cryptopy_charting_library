/**
 * Fibonacci Extension Drawing Implementation
 * 
 * Extension levels: 0%, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618, 4.236
 * 
 * Uses 3 points:
 * - Point A: Start of the move
 * - Point B: End of the move  
 * - Point C: Retracement point (where the extension starts)
 * 
 * Extension levels are calculated from Point C using A-B distance
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

/** Fibonacci extension level */
export interface FibExtLevel {
    level: number;
    label: string;
    color: string;
    enabled: boolean;
}

/** Standard Fibonacci extension levels */
export const FIBONACCI_EXTENSION_LEVELS: FibExtLevel[] = [
    { level: 0, label: '0', color: '#787b86', enabled: true },
    { level: 0.236, label: '0.236', color: '#f48fb1', enabled: false },
    { level: 0.382, label: '0.382', color: '#ce93d8', enabled: false },
    { level: 0.5, label: '0.5', color: '#b39ddb', enabled: false },
    { level: 0.618, label: '0.618', color: '#9fa8da', enabled: true },
    { level: 0.786, label: '0.786', color: '#90caf9', enabled: false },
    { level: 1, label: '1', color: '#80cbc4', enabled: true },
    { level: 1.272, label: '1.272', color: '#a5d6a7', enabled: false },
    { level: 1.414, label: '1.414', color: '#c5e1a5', enabled: false },
    { level: 1.618, label: '1.618', color: '#fff59d', enabled: true },
    { level: 2, label: '2', color: '#ffe082', enabled: false },
    { level: 2.272, label: '2.272', color: '#ffcc80', enabled: false },
    { level: 2.618, label: '2.618', color: '#ffab91', enabled: true },
    { level: 3.618, label: '3.618', color: '#bcaaa4', enabled: false },
    { level: 4.236, label: '4.236', color: '#b0bec5', enabled: false },
];

export interface FibExtensionOptions {
    color?: string;
    lineWidth?: number;
    showLabels?: boolean;
    showPrices?: boolean;
    extendLines?: boolean;
    backgroundOpacity?: number;
    reversed?: boolean;
    levels?: FibExtLevel[];
}

/**
 * Fibonacci Extension Drawing
 * 
 * Uses 3 points: A (start), B (end), C (retracement)
 * Extension levels project from C using the A-B distance
 */
export class FibExtensionDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'fibExtension';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Extension specific options
    showLabels: boolean = true;
    showPrices: boolean = true;
    extendLines: boolean = false;
    opacity: number = 0.8;           // 0-1 opacity for lines
    backgroundOpacity: number = 0.1;  // 0-1 opacity for fill between levels
    reversed: boolean = false;
    levels: FibExtLevel[];

    // Preview point tracking for 3-point drawing
    private _previewPointIndex: number = -1;

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    // Pre-calculated level data for rendering
    private _levelData: { level: number; label: string; color: string; price: number; y: number }[] = [];

    // Non-scaled Y for hit testing
    private _levelYNonScaled: number[] = [];

    constructor(options: FibExtensionOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#9c27b0',  // Purple for extension
            lineWidth: options.lineWidth || 1,
            lineDash: [],
        };
        this.showLabels = options.showLabels !== false;
        this.showPrices = options.showPrices !== false;
        this.extendLines = options.extendLines || false;
        this.backgroundOpacity = options.backgroundOpacity ?? 0.1;
        this.reversed = options.reversed ?? false;
        this.levels = options.levels ? [...options.levels] : FIBONACCI_EXTENSION_LEVELS.map(l => ({ ...l }));
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
                            { type: 'levelsGrid', key: 'levels', label: 'Extension Levels' }
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

        // Fibonacci extension requires exactly 3 points
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
     * Calculate extension levels
     * Extension is calculated from Point C (retracement) using A-B distance
     */
    calculateLevels(priceToYScaled: (price: number) => number, priceToYNonScaled?: (price: number) => number): void {
        if (this.points.length < 3) {
            this._levelData = [];
            this._levelYNonScaled = [];
            return;
        }

        const pointA = this.points[0];  // Start of move
        const pointB = this.points[1];  // End of move
        const pointC = this.points[2];  // Retracement point

        // Calculate the A-B distance
        const abDistance = pointB.price - pointA.price;

        // Only include enabled levels
        const enabledLevels = this.levels.filter(l => l.enabled);

        // Extension levels project FROM point C using A-B distance
        this._levelData = enabledLevels.map(({ level, label, color }) => {
            // For bullish extension (A < B), extensions go UP from C
            // For bearish extension (A > B), extensions go DOWN from C
            const effectiveLevel = this.reversed ? -level : level;
            const price = pointC.price + (abDistance * effectiveLevel);
            const y = priceToYScaled(price);
            return { level, label, color, price, y };
        });

        // Calculate non-scaled Y for hit testing
        if (priceToYNonScaled) {
            this._levelYNonScaled = enabledLevels.map(({ level }) => {
                const effectiveLevel = this.reversed ? -level : level;
                const price = pointC.price + (abDistance * effectiveLevel);
                return priceToYNonScaled(price);
            });
        } else {
            this._levelYNonScaled = this._levelData.map(ld => ld.y);
        }
    }

    /** Get calculated level data */
    getLevelData(): { level: number; label: string; color: string; price: number; y: number }[] {
        return this._levelData;
    }

    /** Check if a pixel coordinate is near this drawing */
    hitTest(x: number, y: number, threshold: number = 8): boolean {
        if (this._pixelPoints.length < 2) return false;

        // Get the x range for levels (matches renderer: starts from B, ends at C or extended)
        const pB = this._pixelPoints[1];
        const pC = this._pixelPoints.length > 2 ? this._pixelPoints[2] : pB;
        const levelStartX = pB.x;
        const levelEndX = this.extendLines ? 10000 : pC.x; // 10000 as large value for extended

        // Check if near any of the horizontal level lines
        for (const levelY of this._levelYNonScaled) {
            if (x >= levelStartX - threshold && x <= levelEndX + threshold) {
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

        // Check if near the A-B-C connecting lines
        for (let i = 0; i < this._pixelPoints.length - 1; i++) {
            const p1 = this._pixelPoints[i];
            const p2 = this._pixelPoints[i + 1];
            const dist = this._pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
            if (dist <= threshold) return true;
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

    /** Create FibExtensionDrawing from serialized data */
    static fromJSON(data: SerializedDrawing): FibExtensionDrawing {
        let levels: FibExtLevel[] | undefined;
        if (data.levels) {
            levels = data.levels.map(l => ({
                level: l.value,
                label: String(l.value),
                color: l.color,
                enabled: l.visible,
            }));
        }

        const drawing = new FibExtensionDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            showLabels: data.showLabels,
            showPrices: data.showPrices,
            extendLines: data.extendLines,
            backgroundOpacity: data.backgroundOpacity,
            reversed: data.reversed,
            levels: levels,
        });

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });

        drawing.points = [...data.points];
        drawing.state = data.state;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
