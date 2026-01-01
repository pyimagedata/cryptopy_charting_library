/**
 * SMA (Simple Moving Average) Indicator
 */

import { OverlayIndicator, IndicatorOptions } from './indicator';
import { BarData } from '../model/data';

/**
 * SMA indicator options
 */
export interface SMAIndicatorOptions extends IndicatorOptions {
    period: number;           // SMA period (default: 20)
    source: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4';  // Price source
}

/**
 * Default SMA options
 */
const defaultSMAOptions: Partial<SMAIndicatorOptions> = {
    name: 'SMA',
    period: 20,
    source: 'close',
    color: '#f23645',  // Red (Standard TradingView SMA color)
    lineWidth: 2,
};

/**
 * SMA Indicator - Overlay type
 */
export class SMAIndicator extends OverlayIndicator {
    private _smaOptions: SMAIndicatorOptions;

    constructor(options: Partial<SMAIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultSMAOptions, ...options };
        mergedOptions.name = `SMA (${mergedOptions.period})`;
        super(mergedOptions);
        this._smaOptions = { ...defaultSMAOptions, ...this._options } as SMAIndicatorOptions;
    }

    get period(): number {
        return this._smaOptions.period;
    }

    get source(): string {
        return this._smaOptions.source;
    }

    get smaOptions(): SMAIndicatorOptions {
        return this._smaOptions;
    }

    updateOptions(newOptions: Partial<SMAIndicatorOptions>): boolean {
        const needsRecalc =
            (newOptions.period !== undefined && newOptions.period !== this._smaOptions.period) ||
            (newOptions.source !== undefined && newOptions.source !== this._smaOptions.source);

        Object.assign(this._smaOptions, newOptions);
        Object.assign(this._options, newOptions);

        if (newOptions.period !== undefined) {
            this._smaOptions.name = `SMA (${this._smaOptions.period})`;
            this._options.name = this._smaOptions.name;
        }

        this._dataChanged.fire();
        return needsRecalc;
    }

    /**
     * Override to include SMA-specific options
     */
    protected _getAllOptions(): Record<string, any> {
        return { ...this._smaOptions };
    }

    /**
     * Override setSettingValue to use updateOptions
     */
    setSettingValue(key: string, value: any): boolean {
        return this.updateOptions({ [key]: value } as any);
    }

    private _getSourcePrice(bar: BarData): number {
        switch (this._smaOptions.source) {
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

    calculate(sourceData: BarData[]): void {
        this._data = [];
        const period = this._smaOptions.period;

        if (sourceData.length < period) {
            return;
        }

        // Add leading NaNs
        for (let i = 0; i < period - 1; i++) {
            this._data.push({
                time: sourceData[i].time,
                value: NaN,
            });
        }

        // Calculate sliding window SMA
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += this._getSourcePrice(sourceData[i]);
        }

        this._data.push({
            time: sourceData[period - 1].time,
            value: sum / period,
        });

        for (let i = period; i < sourceData.length; i++) {
            sum += this._getSourcePrice(sourceData[i]);
            sum -= this._getSourcePrice(sourceData[i - period]);

            this._data.push({
                time: sourceData[i].time,
                value: sum / period,
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
        return `SMA(${this._smaOptions.period}): ${valueStr}`;
    }
}
