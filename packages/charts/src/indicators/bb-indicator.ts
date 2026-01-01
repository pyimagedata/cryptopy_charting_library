/**
 * Bollinger Bands (BB) Indicator
 */

import { OverlayIndicator, IndicatorOptions } from './indicator';
import { BarData } from '../model/data';

/**
 * BB indicator options
 */
export interface BBIndicatorOptions extends IndicatorOptions {
    period: number;      // Lookback period (default: 20)
    stdDev: number;      // Standard deviation multiplier (default: 2)
    source: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4';
}

/**
 * Default BB options
 */
const defaultBBOptions: Partial<BBIndicatorOptions> = {
    name: 'Bollinger Bands',
    period: 20,
    stdDev: 2,
    source: 'close',
    color: '#2962ff', // Middle band color
    lineWidth: 1,
};

/**
 * Bollinger Bands Indicator
 * Renders 3 lines: Middle, Upper, Lower
 */
export class BBIndicator extends OverlayIndicator {
    private _bbOptions: BBIndicatorOptions;

    get bbOptions(): BBIndicatorOptions {
        return this._bbOptions;
    }

    constructor(options: Partial<BBIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultBBOptions, ...options };
        mergedOptions.name = `BB (${mergedOptions.period}, ${mergedOptions.stdDev})`;
        super(mergedOptions);
        this._bbOptions = { ...defaultBBOptions, ...this._options } as BBIndicatorOptions;
    }

    updateOptions(newOptions: Partial<BBIndicatorOptions>): boolean {
        const needsRecalc =
            (newOptions.period !== undefined && newOptions.period !== this._bbOptions.period) ||
            (newOptions.stdDev !== undefined && newOptions.stdDev !== this._bbOptions.stdDev) ||
            (newOptions.source !== undefined && newOptions.source !== this._bbOptions.source);

        Object.assign(this._bbOptions, newOptions);
        Object.assign(this._options, newOptions);

        if (newOptions.period !== undefined || newOptions.stdDev !== undefined) {
            this._bbOptions.name = `BB (${this._bbOptions.period}, ${this._bbOptions.stdDev})`;
            this._options.name = this._bbOptions.name;
        }

        this._dataChanged.fire();
        return needsRecalc;
    }

    /**
     * Set setting value by key
     */
    setSettingValue(key: string, value: any): boolean {
        return this.updateOptions({ [key]: value } as any);
    }

    private _getSourcePrice(bar: BarData): number {
        switch (this._bbOptions.source) {
            case 'open': return bar.open;
            case 'high': return bar.high;
            case 'low': return bar.low;
            case 'hl2': return (bar.high + bar.low) / 2;
            case 'hlc3': return (bar.high + bar.low + bar.close) / 3;
            case 'ohlc4': return (bar.open + bar.high + bar.low + bar.close) / 4;
            default: return bar.close;
        }
    }

    calculate(sourceData: BarData[]): void {
        this._data = [];
        const period = this._bbOptions.period;
        const mult = this._bbOptions.stdDev;

        if (sourceData.length < period) return;

        // Leading NaNs
        for (let i = 0; i < period - 1; i++) {
            this._data.push({
                time: sourceData[i].time,
                value: NaN,
                values: [NaN, NaN, NaN]
            });
        }

        for (let i = period - 1; i < sourceData.length; i++) {
            // Calculate SMA
            let sum = 0;
            const prices: number[] = [];
            for (let j = 0; j < period; j++) {
                const p = this._getSourcePrice(sourceData[i - j]);
                sum += p;
                prices.push(p);
            }
            const middle = sum / period;

            // Calculate Std Dev
            let variance = 0;
            for (const p of prices) {
                variance += Math.pow(p - middle, 2);
            }
            const stdDev = Math.sqrt(variance / period);

            const upper = middle + (mult * stdDev);
            const lower = middle - (mult * stdDev);

            this._data.push({
                time: sourceData[i].time,
                value: middle,
                values: [middle, upper, lower]
            });
        }
    }

    getDescription(index?: number): string {
        let values = [NaN, NaN, NaN];
        if (index !== undefined && index >= 0 && index < this._data.length) {
            values = this._data[index].values || [NaN, NaN, NaN];
        } else if (this._data.length > 0) {
            values = this._data[this._data.length - 1].values || [NaN, NaN, NaN];
        }

        const m = isNaN(values[0]) ? '-' : values[0].toFixed(2);
        const u = isNaN(values[1]) ? '-' : values[1].toFixed(2);
        const l = isNaN(values[2]) ? '-' : values[2].toFixed(2);

        return `BB(${this._bbOptions.period}, ${this._bbOptions.stdDev}): ${m} (${l}, ${u})`;
    }
}
