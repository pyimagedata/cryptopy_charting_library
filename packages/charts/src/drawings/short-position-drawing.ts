/**
 * Short Position Drawing Implementation
 * Trading projection tool for short positions showing entry, target, and stop-loss
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

export interface ShortPositionOptions {
    profitColor?: string;
    lossColor?: string;
    borderColor?: string;
    textColor?: string;
    quantity?: number;
    accountCurrency?: string;
}

/**
 * Short Position - A 3-point projection showing entry, target, and stop levels
 * For shorts: profit is below entry, loss is above
 * 
 * Points:
 * - Point 0: Entry left (defines entry price and left edge)
 * - Point 1: Entry right (defines right edge, same price as point 0)
 * - Point 2: Target/Stop (below entry = target (profit), above = stop (loss))
 */
export class ShortPositionDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'shortPosition';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Position specific properties
    private _profitColor: string = 'rgba(38, 166, 154, 0.5)';  // Teal/Green
    private _lossColor: string = 'rgba(239, 83, 80, 0.5)';     // Coral/Red
    private _borderColor: string = '#ef5350';
    private _textColor: string = '#ffffff';
    private _quantity: number = 1;
    private _accountCurrency: string = 'USDT';

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];
    private _entryY: number = 0;
    private _targetY: number = 0;
    private _stopY: number = 0;

    constructor(options: ShortPositionOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.borderColor || '#ef5350',
            lineWidth: 1,
        };

        if (options.profitColor) this._profitColor = options.profitColor;
        if (options.lossColor) this._lossColor = options.lossColor;
        if (options.borderColor) this._borderColor = options.borderColor;
        if (options.textColor) this._textColor = options.textColor;
        if (options.quantity) this._quantity = options.quantity;
        if (options.accountCurrency) this._accountCurrency = options.accountCurrency;
    }

    // =========================================================================
    // Property Accessors
    // =========================================================================

    get profitColor(): string { return this._profitColor; }
    set profitColor(value: string) { this._profitColor = value; }

    get lossColor(): string { return this._lossColor; }
    set lossColor(value: string) { this._lossColor = value; }

    get borderColor(): string { return this._borderColor; }
    set borderColor(value: string) { this._borderColor = value; }

    get textColor(): string { return this._textColor; }
    set textColor(value: string) { this._textColor = value; }

    get quantity(): number { return this._quantity; }
    set quantity(value: number) { this._quantity = value; }

    get accountCurrency(): string { return this._accountCurrency; }
    set accountCurrency(value: string) { this._accountCurrency = value; }

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
                            colorRow('borderColor', 'Border'),
                        ]
                    },
                    {
                        title: 'Position',
                        rows: [
                            {
                                type: 'number',
                                key: 'quantity',
                                label: 'Quantity',
                                defaultValue: 1
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
            case 'borderColor': return this._borderColor;
            case 'quantity': return this._quantity;
            case 'visible': return this.visible;
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'profitColor': this._profitColor = value; break;
            case 'lossColor': this._lossColor = value; break;
            case 'borderColor': this._borderColor = value; this.style.color = value; break;
            case 'quantity': this._quantity = value; break;
            case 'visible': this.visible = value; break;
        }
    }

    // =========================================================================
    // Drawing Interface Implementation
    // =========================================================================

    addPoint(time: number, price: number): void {
        this.points.push({ time, price });

        if (this.points.length >= 3) {
            this.state = 'complete';
        }
    }

    isComplete(): boolean {
        return this.points.length >= 3;
    }

    updateLastPoint(time: number, price: number): void {
        if (this.points.length === 0) return;

        if (this.points.length === 1) {
            // Second point - same price as first, different time
            this.points.push({ time, price: this.points[0].price });
        } else if (this.points.length === 2) {
            // Third point - target or stop
            this.points.push({ time: this.points[0].time, price });
        } else {
            this.points[this.points.length - 1] = { time: this.points[0].time, price };
        }
    }

    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = [...points];

        if (points.length >= 2) {
            this._entryY = points[0].y;

            if (points.length >= 3) {
                // For short: profit is below entry, loss is above
                if (points[2].y > this._entryY) {
                    // Point 2 is below entry = target (profit for short)
                    this._targetY = points[2].y;
                    const profitDistance = this._targetY - this._entryY;
                    this._stopY = this._entryY - (profitDistance / 2);
                } else {
                    // Point 2 is above entry = stop (loss for short)
                    this._stopY = points[2].y;
                    const lossDistance = this._entryY - this._stopY;
                    this._targetY = this._entryY + (lossDistance * 2);
                }
            }
        }
    }

    getPixelPoints(): { x: number; y: number }[] {
        return this._pixelPoints;
    }

    getEntryY(): number { return this._entryY; }
    getTargetY(): number { return this._targetY; }
    getStopY(): number { return this._stopY; }

    // =========================================================================
    // P&L Calculations (reversed for short)
    // =========================================================================

    getEntryPrice(): number {
        return this.points.length > 0 ? this.points[0].price : 0;
    }

    getTargetPrice(): number {
        if (this.points.length < 3) return 0;
        const entry = this.points[0].price;
        const point2 = this.points[2].price;

        // For short: target is below entry
        if (point2 < entry) {
            // Point 2 is target
            return point2;
        } else {
            // Point 2 is stop, calculate target
            const lossDistance = point2 - entry;
            return entry - (lossDistance * 2);
        }
    }

    getStopPrice(): number {
        if (this.points.length < 3) return 0;
        const entry = this.points[0].price;
        const point2 = this.points[2].price;

        // For short: stop is above entry
        if (point2 > entry) {
            // Point 2 is stop
            return point2;
        } else {
            // Point 2 is target, calculate stop
            const profitDistance = entry - point2;
            return entry + (profitDistance / 2);
        }
    }

    getProfitPercent(): number {
        const entry = this.getEntryPrice();
        if (entry === 0) return 0;
        // For short: profit when price goes down
        return ((entry - this.getTargetPrice()) / entry) * 100;
    }

    getLossPercent(): number {
        const entry = this.getEntryPrice();
        if (entry === 0) return 0;
        // For short: loss when price goes up
        return ((this.getStopPrice() - entry) / entry) * 100;
    }

    getProfitAmount(): number {
        // For short: profit = entry - target
        return (this.getEntryPrice() - this.getTargetPrice()) * this._quantity;
    }

    getLossAmount(): number {
        // For short: loss = stop - entry
        return (this.getStopPrice() - this.getEntryPrice()) * this._quantity;
    }

    getRiskRewardRatio(): number {
        const loss = this.getLossAmount();
        if (loss === 0) return 0;
        return Math.abs(this.getProfitAmount() / loss);
    }

    // =========================================================================
    // Hit Testing & Bounds
    // =========================================================================

    hitTest(x: number, y: number, threshold: number = 5): boolean {
        if (this._pixelPoints.length < 2) return false;

        const left = Math.min(this._pixelPoints[0].x, this._pixelPoints[1].x);
        const right = Math.max(this._pixelPoints[0].x, this._pixelPoints[1].x);
        const top = Math.min(this._targetY, this._stopY);
        const bottom = Math.max(this._targetY, this._stopY);

        return x >= left - threshold && x <= right + threshold &&
            y >= top - threshold && y <= bottom + threshold;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length < 2) return null;

        const left = Math.min(this._pixelPoints[0].x, this._pixelPoints[1].x);
        const right = Math.max(this._pixelPoints[0].x, this._pixelPoints[1].x);
        const top = Math.min(this._targetY, this._stopY);
        const bottom = Math.max(this._targetY, this._stopY);

        return {
            x: left,
            y: top,
            width: right - left,
            height: bottom - top
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

    static fromJSON(data: SerializedDrawing): ShortPositionDrawing {
        const drawing = new ShortPositionDrawing({
            borderColor: data.style.color,
        });

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
