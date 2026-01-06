/**
 * HMA (Hull Moving Average) Indicator
 * 
 * Developed by Alan Hull in 2005, the HMA aims to provide a smoother
 * moving average with significantly reduced lag.
 * 
 * Formula:
 * HMA = WMA(2 * WMA(n/2) - WMA(n), sqrt(n))
 */

import { OverlayIndicator, IndicatorOptions } from './indicator';
import { BarData } from '../model/data';

/**
 * HMA indicator options
 */
export interface HMAIndicatorOptions extends IndicatorOptions {
    period: number;           // HMA period (default: 9)
    source: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4';  // Price source
}

/**
 * Default HMA options
 */
const defaultHMAOptions: Partial<HMAIndicatorOptions> = {
    name: 'HMA',
    period: 9,
    source: 'close',
    color: '#00bcd4',  // Cyan
    lineWidth: 2,
};

/**
 * HMA Indicator - Overlay type
 */
export class HMAIndicator extends OverlayIndicator {
    private _hmaOptions: HMAIndicatorOptions;

    constructor(options: Partial<HMAIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultHMAOptions, ...options };
        mergedOptions.name = `HMA (${mergedOptions.period})`;
        super(mergedOptions);
        this._hmaOptions = { ...defaultHMAOptions, ...this._options } as HMAIndicatorOptions;
    }

    get period(): number { return this._hmaOptions.period; }
    get source(): string { return this._hmaOptions.source; }

    updateOptions(newOptions: Partial<HMAIndicatorOptions>): boolean {
        const needsRecalc =
            (newOptions.period !== undefined && newOptions.period !== this._hmaOptions.period) ||
            (newOptions.source !== undefined && newOptions.source !== this._hmaOptions.source);

        Object.assign(this._hmaOptions, newOptions);
        Object.assign(this._options, newOptions);

        if (newOptions.period !== undefined) {
            this._hmaOptions.name = `HMA (${this._hmaOptions.period})`;
            this._options.name = this._hmaOptions.name;
        }

        this._dataChanged.fire();
        return needsRecalc;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._hmaOptions };
    }

    setSettingValue(key: string, value: any): boolean {
        return this.updateOptions({ [key]: value } as any);
    }

    private _getSourcePrice(bar: BarData): number {
        switch (this._hmaOptions.source) {
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

    /**
     * Helper to calculate WMA of a numbers array
     */
    private _calculateWMA(values: number[], period: number): number[] {
        const result: number[] = new Array(values.length).fill(NaN);
        if (values.length < period) return result;

        // Weights sum: n * (n + 1) / 2
        const denom = (period * (period + 1)) / 2;

        for (let i = period - 1; i < values.length; i++) {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                const val = values[i - j];
                if (isNaN(val)) {
                    sum = NaN;
                    break;
                }
                sum += val * (period - j);
            }
            result[i] = sum / denom;
        }
        return result;
    }

    calculate(sourceData: BarData[]): void {
        this._data = [];
        const n = this._hmaOptions.period;
        if (sourceData.length < n) return;

        const prices = sourceData.map(d => this._getSourcePrice(d));

        // 1. Calculate WMA(n/2) and multiply by 2
        const halfPeriod = Math.floor(n / 2);
        const wmaHalf = this._calculateWMA(prices, halfPeriod);
        const wmaHalfDouble = wmaHalf.map(v => v * 2);

        // 2. Calculate WMA(n)
        const wmaFull = this._calculateWMA(prices, n);

        // 3. Raw HMA = (2 * WMA(n/2)) - WMA(n)
        const rawHMA = wmaHalfDouble.map((v, i) => v - wmaFull[i]);

        // 4. Final HMA = WMA(Raw HMA, sqrt(n))
        const sqrtPeriod = Math.floor(Math.sqrt(n));
        const finalHMAValues = this._calculateWMA(rawHMA, sqrtPeriod);

        // Fill data
        for (let i = 0; i < sourceData.length; i++) {
            this._data.push({
                time: sourceData[i].time,
                value: finalHMAValues[i],
            });
        }
    }

    getDescription(index?: number): string {
        let value = NaN;
        if (index !== undefined && index >= 0 && index < this._data.length) {
            value = this._data[index].value;
        } else if (this._data.length > 0) {
            value = this._data[this._data.length - 1].value;
        }

        const valueStr = isNaN(value) ? '-' : value.toFixed(2);
        return `HMA(${this._hmaOptions.period}): ${valueStr}`;
    }
}
