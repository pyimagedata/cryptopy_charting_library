/**
 * EMA (Exponential Moving Average) Indicator
 * 
 * A type of moving average that gives more weight to recent prices.
 * EMA reacts faster to price changes compared to SMA.
 * 
 * Formula:
 * EMA = Price(t) × k + EMA(y) × (1 − k)
 * where k = 2 / (N + 1), N = period
 */

import { OverlayIndicator, IndicatorOptions } from './indicator';
import { BarData } from '../model/data';

/**
 * EMA indicator options
 */
export interface EMAIndicatorOptions extends IndicatorOptions {
    period: number;           // EMA period (default: 20)
    source: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4';  // Price source
}

/**
 * Default EMA options
 */
const defaultEMAOptions: Partial<EMAIndicatorOptions> = {
    name: 'EMA',
    period: 20,
    source: 'close',
    color: '#2962ff',  // Blue
    lineWidth: 2,
};

/**
 * EMA Indicator - Overlay type (drawn on main chart)
 */
export class EMAIndicator extends OverlayIndicator {
    private _emaOptions: EMAIndicatorOptions;

    constructor(options: Partial<EMAIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultEMAOptions, ...options };
        // Update name to show period
        mergedOptions.name = `EMA (${mergedOptions.period})`;
        super(mergedOptions);
        this._emaOptions = { ...defaultEMAOptions, ...this._options } as EMAIndicatorOptions;
    }

    // --- Getters ---

    get period(): number {
        return this._emaOptions.period;
    }

    get source(): string {
        return this._emaOptions.source;
    }

    get emaOptions(): EMAIndicatorOptions {
        return this._emaOptions;
    }

    /**
     * Update EMA options dynamically
     */
    updateOptions(newOptions: Partial<EMAIndicatorOptions>): boolean {
        const needsRecalc =
            (newOptions.period !== undefined && newOptions.period !== this._emaOptions.period) ||
            (newOptions.source !== undefined && newOptions.source !== this._emaOptions.source);

        Object.assign(this._emaOptions, newOptions);
        Object.assign(this._options, newOptions);

        // Update name if period changed
        if (newOptions.period !== undefined) {
            this._emaOptions.name = `EMA (${this._emaOptions.period})`;
            this._options.name = this._emaOptions.name;
        }

        this._dataChanged.fire();

        return needsRecalc;
    }

    /**
     * Override to include EMA-specific options
     */
    protected _getAllOptions(): Record<string, any> {
        return { ...this._emaOptions };
    }

    /**
     * Override setSettingValue to use updateOptions
     */
    setSettingValue(key: string, value: any): boolean {
        return this.updateOptions({ [key]: value } as any);
    }

    // --- Helper to get source price ---

    private _getSourcePrice(bar: BarData): number {
        switch (this._emaOptions.source) {
            case 'open': return bar.open;
            case 'high': return bar.high;
            case 'low': return bar.low;
            case 'hl2': return (bar.high + bar.low) / 2;
            case 'hlc3': return (bar.high + bar.low + bar.close) / 3;
            case 'ohlc4': return (bar.open + bar.high + bar.low + bar.close) / 4;
            case 'close':
            default: return bar.close;
        }
    }

    // --- Abstract implementations ---

    /**
     * Calculate EMA values from source data
     */
    calculate(sourceData: BarData[]): void {
        this._data = [];

        if (sourceData.length < this._emaOptions.period) {
            return;
        }

        const period = this._emaOptions.period;
        const k = 2 / (period + 1);  // EMA multiplier

        // Calculate initial SMA for the first EMA value
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += this._getSourcePrice(sourceData[i]);
        }
        let ema = sum / period;

        // Add null values for indices before EMA can be calculated
        for (let i = 0; i < period - 1; i++) {
            this._data.push({
                time: sourceData[i].time,
                value: NaN,
            });
        }

        // First EMA value
        this._data.push({
            time: sourceData[period - 1].time,
            value: ema,
        });

        // Calculate subsequent EMA values
        for (let i = period; i < sourceData.length; i++) {
            const price = this._getSourcePrice(sourceData[i]);
            ema = price * k + ema * (1 - k);

            this._data.push({
                time: sourceData[i].time,
                value: ema,
            });
        }
    }

    /**
     * Get description for legend
     */
    getDescription(index?: number): string {
        let value = NaN;

        if (index !== undefined && index >= 0 && index < this._data.length) {
            value = this._data[index].value;
        } else if (this._data.length > 0) {
            value = this._data[this._data.length - 1].value;
        }

        const valueStr = isNaN(value) ? '-' : value.toFixed(2);
        return `EMA(${this._emaOptions.period}): ${valueStr}`;
    }
}
