/**
 * Long Position Drawing Implementation
 * 
 * A 2-point drawing tool for visualizing long trade setups.
 * Shows entry level, profit zone (green), and loss zone (red).
 * 
 * Points:
 * - Point 0: Entry left edge (time1, entryPrice)
 * - Point 1: Entry right edge (time2, entryPrice)
 * 
 * Target and Stop are calculated as fixed percentages from entry.
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
} from './drawing-settings-config';

export interface LongPositionOptions {
    profitColor?: string;
    lossColor?: string;
    entryColor?: string;
    quantity?: number;
    profitPercent?: number;  // Default: 3%
    stopPercent?: number;    // Default: 1.5%
}

export class LongPositionDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'longPosition';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Position specific properties
    private _profitColor: string = 'rgba(38, 166, 154, 0.4)';  // Green
    private _lossColor: string = 'rgba(239, 83, 80, 0.4)';     // Red
    private _entryColor: string = '#26a69a';                    // Teal
    private _quantity: number = 1;
    private _profitPercent: number = 3;   // 3% profit target
    private _stopPercent: number = 1.5;   // 1.5% stop loss

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];
    private _cachedTargetY: number = 0;
    private _cachedStopY: number = 0;

    constructor(options: LongPositionOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.entryColor || '#26a69a',
            lineWidth: 2,
        };

        if (options.profitColor) this._profitColor = options.profitColor;
        if (options.lossColor) this._lossColor = options.lossColor;
        if (options.entryColor) this._entryColor = options.entryColor;
        if (options.quantity) this._quantity = options.quantity;
        if (options.profitPercent) this._profitPercent = options.profitPercent;
        if (options.stopPercent) this._stopPercent = options.stopPercent;
    }

    // =========================================================================
    // Property Accessors
    // =========================================================================

    get profitColor(): string { return this._profitColor; }
    set profitColor(value: string) { this._profitColor = value; }

    get lossColor(): string { return this._lossColor; }
    set lossColor(value: string) { this._lossColor = value; }

    get entryColor(): string { return this._entryColor; }
    set entryColor(value: string) { this._entryColor = value; }

    get quantity(): number { return this._quantity; }
    set quantity(value: number) { this._quantity = value; }

    get profitPercent(): number { return this._profitPercent; }
    set profitPercent(value: number) { this._profitPercent = value; }

    get stopPercent(): number { return this._stopPercent; }
    set stopPercent(value: number) { this._stopPercent = value; }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    {
                        title: 'Colors',
                        rows: [
                            colorRow('profitColor', 'Profit Zone'),
                            colorRow('lossColor', 'Loss Zone'),
                            colorRow('entryColor', 'Entry Line'),
                        ]
                    },
                    {
                        title: 'Position',
                        rows: [
                            {
                                type: 'number',
                                key: 'quantity',
                                label: 'Quantity',
                                min: 0.001,
                                step: 0.1,
                                defaultValue: 1
                            },
                            {
                                type: 'number',
                                key: 'profitPercent',
                                label: 'Profit %',
                                min: 0.1,
                                max: 100,
                                step: 0.1,
                                defaultValue: 3
                            },
                            {
                                type: 'number',
                                key: 'stopPercent',
                                label: 'Stop %',
                                min: 0.1,
                                max: 100,
                                step: 0.1,
                                defaultValue: 1.5
                            }
                        ]
                    }
                ]),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'profitColor', tooltip: 'Profit Color' },
            { type: 'color', key: 'lossColor', tooltip: 'Loss Color' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'profitColor': return this._profitColor;
            case 'lossColor': return this._lossColor;
            case 'entryColor': return this._entryColor;
            case 'quantity': return this._quantity;
            case 'profitPercent': return this._profitPercent;
            case 'stopPercent': return this._stopPercent;
            case 'visible': return this.visible;
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'profitColor': this._profitColor = value; break;
            case 'lossColor': this._lossColor = value; break;
            case 'entryColor': this._entryColor = value; this.style.color = value; break;
            case 'quantity': this._quantity = value; break;
            case 'profitPercent': this._profitPercent = value; break;
            case 'stopPercent': this._stopPercent = value; break;
            case 'visible': this.visible = value; break;
        }
    }

    // =========================================================================
    // Drawing Interface Implementation (2-point like Rectangle)
    // =========================================================================

    addPoint(time: number, price: number): void {
        this.points.push({ time, price });

        if (this.points.length >= 2) {
            this.state = 'complete';
        }
    }

    isComplete(): boolean {
        return this.points.length >= 2;
    }

    updateLastPoint(time: number, price: number): void {
        if (this.points.length === 0) return;

        if (this.points.length === 1) {
            // Add second point with SAME price (horizontal entry line)
            this.points.push({ time, price: this.points[0].price });
        } else {
            // Update second point, keep price same as first
            this.points[1] = { time, price: this.points[0].price };
        }
    }

    // =========================================================================
    // Pixel Coordinates
    // =========================================================================

    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = [...points];
    }

    /** Cache the target and stop Y positions (set by renderer) */
    setCachedZoneY(targetY: number, stopY: number): void {
        this._cachedTargetY = targetY;
        this._cachedStopY = stopY;
    }

    /** Returns 4 control points: [Left, Right, Target, Stop] */
    getPixelPoints(): { x: number; y: number }[] {
        if (this._pixelPoints.length < 2) return this._pixelPoints;

        const p1 = this._pixelPoints[0];
        const p2 = this._pixelPoints[1];
        const centerX = (p1.x + p2.x) / 2;

        // Return 4 points for control: Left, Right, Target, Stop
        return [
            p1,  // Index 0: Left
            p2,  // Index 1: Right
            { x: centerX, y: this._cachedTargetY },  // Index 2: Target
            { x: centerX, y: this._cachedStopY }     // Index 3: Stop
        ];
    }

    // =========================================================================
    // Price Calculations
    // =========================================================================

    getEntryPrice(): number {
        return this.points.length > 0 ? this.points[0].price : 0;
    }

    getTargetPrice(): number {
        const entry = this.getEntryPrice();
        return entry * (1 + this._profitPercent / 100);
    }

    getStopPrice(): number {
        const entry = this.getEntryPrice();
        return entry * (1 - this._stopPercent / 100);
    }

    getProfitAmount(): number {
        const entry = this.getEntryPrice();
        const target = this.getTargetPrice();
        return (target - entry) * this._quantity;
    }

    getLossAmount(): number {
        const entry = this.getEntryPrice();
        const stop = this.getStopPrice();
        return (entry - stop) * this._quantity;
    }

    getRiskRewardRatio(): number {
        const profit = this.getProfitAmount();
        const loss = this.getLossAmount();
        return loss > 0 ? profit / loss : 0;
    }

    // =========================================================================
    // Hit Testing
    // =========================================================================

    hitTest(x: number, y: number, threshold: number = 8): boolean {
        if (this._pixelPoints.length < 2) return false;

        const p1 = this._pixelPoints[0];
        const p2 = this._pixelPoints[1];

        const left = Math.min(p1.x, p2.x);
        const right = Math.max(p1.x, p2.x);
        const entryY = p1.y;

        // Check if within horizontal bounds
        if (x < left - threshold || x > right + threshold) return false;

        // Use cached zone heights (set during render)
        // For now, use a generous vertical range based on entry
        const verticalRange = 150; // pixels above and below entry

        if (y < entryY - verticalRange - threshold || y > entryY + verticalRange + threshold) {
            return false;
        }

        return true;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length < 2) return null;

        const p1 = this._pixelPoints[0];
        const p2 = this._pixelPoints[1];

        const left = Math.min(p1.x, p2.x);
        const right = Math.max(p1.x, p2.x);
        const width = right - left;

        // Rough estimate
        return {
            x: left,
            y: p1.y - 100,
            width: width,
            height: 200
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

    static fromJSON(data: SerializedDrawing): LongPositionDrawing {
        const drawing = new LongPositionDrawing({
            entryColor: data.style.color,
        });

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
