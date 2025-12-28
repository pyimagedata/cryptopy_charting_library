/**
 * Regression Trend Drawing Implementation
 * 
 * A regression channel that:
 * - Uses 2 points to define a time range
 * - Calculates linear regression line through price data in that range
 * - Draws upper and lower channel lines based on standard deviation
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

export interface RegressionTrendOptions {
    color?: string;  // Main color for boundary lines
    lineWidth?: number;
    lineDash?: number[];
    fillColor?: string;  // Upper channel fill
    lowerFillColor?: string;  // Lower channel fill
    fillOpacity?: number;
    centerLineColor?: string;  // Regression line color
    extendLeft?: boolean;
    extendRight?: boolean;
    showUpperDeviation?: boolean;
    showLowerDeviation?: boolean;
    deviationMultiplier?: number; // Standard deviation multiplier (default 2.0)
}

/**
 * Regression Trend - Linear regression with deviation channels
 */
export class RegressionTrendDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'regressionTrend';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Extension options
    extendLeft: boolean = false;
    extendRight: boolean = true; // Usually extended right by default
    showUpperDeviation: boolean = true;
    showLowerDeviation: boolean = true;
    deviationMultiplier: number = 2.0;

    // TradingView style colors
    lowerFillColor: string = '#f23645';  // Red for lower channel
    centerLineColor: string = '#f7525f'; // Coral/salmon for center line

    // Cached regression data (calculated from price data)
    private _slope: number = 0;
    private _intercept: number = 0;
    private _standardDeviation: number = 0;

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];
    private _regressionLine: { start: { x: number; y: number }; end: { x: number; y: number } } | null = null;
    private _upperLine: { start: { x: number; y: number }; end: { x: number; y: number } } | null = null;
    private _lowerLine: { start: { x: number; y: number }; end: { x: number; y: number } } | null = null;

    // Preview point tracking
    private _previewPointIndex: number = -1;

    constructor(options: RegressionTrendOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#2962ff',  // Blue for boundary lines
            lineWidth: options.lineWidth || 2,
            lineDash: options.lineDash || [],
            fillColor: options.fillColor || '#2962ff',  // Blue for upper fill
            fillOpacity: options.fillOpacity || 0.2,
        };
        this.lowerFillColor = options.lowerFillColor || '#f23645';  // Red for lower fill
        this.centerLineColor = options.centerLineColor || '#f7525f';  // Coral for center
        this.extendLeft = options.extendLeft || false;
        this.extendRight = options.extendRight !== undefined ? options.extendRight : true;
        this.showUpperDeviation = options.showUpperDeviation !== undefined ? options.showUpperDeviation : true;
        this.showLowerDeviation = options.showLowerDeviation !== undefined ? options.showLowerDeviation : true;
        this.deviationMultiplier = options.deviationMultiplier || 2.0;
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    {
                        title: 'Regression Trend',
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
                        ]
                    },
                    {
                        title: 'Options',
                        rows: [
                            checkboxRow('extendLeft', 'Extend Left'),
                            checkboxRow('extendRight', 'Extend Right'),
                            checkboxRow('showUpperDeviation', 'Upper Channel'),
                            checkboxRow('showLowerDeviation', 'Lower Channel'),
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
            case 'showUpperDeviation': return this.showUpperDeviation;
            case 'showLowerDeviation': return this.showLowerDeviation;
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
            case 'showUpperDeviation':
                this.showUpperDeviation = value;
                break;
            case 'showLowerDeviation':
                this.showLowerDeviation = value;
                break;
            case 'visible':
                this.visible = value;
                break;
        }
    }

    /** Add a point to the drawing */
    addPoint(time: number, price: number): void {
        this.points.push({ time, price });

        // Regression trend needs exactly 2 points (defining the range)
        if (this.points.length >= 2) {
            this.state = 'complete';
        }
    }

    /** Check if drawing is complete */
    isComplete(): boolean {
        return this.points.length >= 2 && this.state === 'complete';
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

    /**
     * Calculate linear regression from price data
     * Called by renderer with the actual price data in the selected range
     */
    calculateRegression(priceData: { time: number; close: number }[]): void {
        if (priceData.length < 2) return;

        const n = priceData.length;

        // Calculate sums for linear regression
        let sumX = 0;
        let sumY = 0;
        let sumXY = 0;
        let sumXX = 0;

        for (let i = 0; i < n; i++) {
            const x = i; // Use index as X (time is linear)
            const y = priceData[i].close;
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumXX += x * x;
        }

        // Calculate slope and intercept
        const denominator = n * sumXX - sumX * sumX;
        if (denominator === 0) return;

        this._slope = (n * sumXY - sumX * sumY) / denominator;
        this._intercept = (sumY - this._slope * sumX) / n;

        // Calculate standard deviation from regression line
        let sumSquaredErrors = 0;
        for (let i = 0; i < n; i++) {
            const predictedY = this._slope * i + this._intercept;
            const error = priceData[i].close - predictedY;
            sumSquaredErrors += error * error;
        }
        this._standardDeviation = Math.sqrt(sumSquaredErrors / n);
    }

    /** Get regression parameters */
    getRegressionParams(): { slope: number; intercept: number; stdDev: number } {
        return {
            slope: this._slope,
            intercept: this._intercept,
            stdDev: this._standardDeviation
        };
    }

    /** Set pixel points (called by renderer) */
    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = points;
    }

    /** Get pixel points */
    getPixelPoints(): { x: number; y: number }[] {
        return this._pixelPoints;
    }

    /** Set regression line pixels */
    setRegressionLine(line: { start: { x: number; y: number }; end: { x: number; y: number } }): void {
        this._regressionLine = line;
    }

    /** Set upper channel line pixels */
    setUpperLine(line: { start: { x: number; y: number }; end: { x: number; y: number } }): void {
        this._upperLine = line;
    }

    /** Set lower channel line pixels */
    setLowerLine(line: { start: { x: number; y: number }; end: { x: number; y: number } }): void {
        this._lowerLine = line;
    }

    /** Get cached lines for hit testing */
    getCachedLines(): {
        regression: { start: { x: number; y: number }; end: { x: number; y: number } } | null;
        upper: { start: { x: number; y: number }; end: { x: number; y: number } } | null;
        lower: { start: { x: number; y: number }; end: { x: number; y: number } } | null;
    } {
        return {
            regression: this._regressionLine,
            upper: this._upperLine,
            lower: this._lowerLine
        };
    }

    /** Check if a pixel coordinate is near this drawing */
    hitTest(x: number, y: number, threshold: number = 5): boolean {
        // Check regression line
        if (this._regressionLine) {
            const dist = this._pointToLineDistance(
                x, y,
                this._regressionLine.start.x, this._regressionLine.start.y,
                this._regressionLine.end.x, this._regressionLine.end.y
            );
            if (dist <= threshold) return true;
        }

        // Check upper line
        if (this._upperLine && this.showUpperDeviation) {
            const dist = this._pointToLineDistance(
                x, y,
                this._upperLine.start.x, this._upperLine.start.y,
                this._upperLine.end.x, this._upperLine.end.y
            );
            if (dist <= threshold) return true;
        }

        // Check lower line
        if (this._lowerLine && this.showLowerDeviation) {
            const dist = this._pointToLineDistance(
                x, y,
                this._lowerLine.start.x, this._lowerLine.start.y,
                this._lowerLine.end.x, this._lowerLine.end.y
            );
            if (dist <= threshold) return true;
        }

        return false;
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

    /** Get bounding box */
    getBounds(): { x: number; y: number; width: number; height: number } | null {
        const allPoints: { x: number; y: number }[] = [];

        // Collect all cached line endpoints
        if (this._regressionLine) {
            allPoints.push(this._regressionLine.start, this._regressionLine.end);
        }
        if (this._upperLine) {
            allPoints.push(this._upperLine.start, this._upperLine.end);
        }
        if (this._lowerLine) {
            allPoints.push(this._lowerLine.start, this._lowerLine.end);
        }

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

    /** Create RegressionTrendDrawing from serialized data */
    static fromJSON(data: SerializedDrawing): RegressionTrendDrawing {
        const drawing = new RegressionTrendDrawing({
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
