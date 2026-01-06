/**
 * Parabolic SAR (Stop and Reverse) Indicator
 * 
 * Developed by J. Welles Wilder Jr., this indicator is used to find 
 * potential reversals in the market price direction.
 * 
 * It appears as dots above or below the price candles.
 */

import { OverlayIndicator, IndicatorOptions, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';

/**
 * Parabolic SAR options
 */
export interface ParabolicSAROptions extends IndicatorOptions {
    start: number;      // Initial acceleration factor (default: 0.02)
    increment: number;  // AF increment step (default: 0.02)
    maximum: number;    // Maximum AF (default: 0.20)
}

/**
 * Default Parabolic SAR options
 */
const defaultSAROptions: Partial<ParabolicSAROptions> = {
    name: 'SAR',
    start: 0.02,
    increment: 0.02,
    maximum: 0.20,
    color: '#2962ff',
    lineWidth: 1, // Radius will be lineWidth + 1
    style: IndicatorStyle.Dots,
};

/**
 * Parabolic SAR Indicator
 */
export class ParabolicSARIndicator extends OverlayIndicator {
    private _sarOptions: ParabolicSAROptions;

    constructor(options: Partial<ParabolicSAROptions> = {}) {
        const mergedOptions = { ...defaultSAROptions, ...options };
        mergedOptions.name = `SAR (${mergedOptions.start}, ${mergedOptions.increment}, ${mergedOptions.maximum})`;
        super(mergedOptions);
        this._sarOptions = { ...defaultSAROptions, ...this._options } as ParabolicSAROptions;
    }

    // --- Getters ---

    get start(): number { return this._sarOptions.start; }
    get increment(): number { return this._sarOptions.increment; }
    get maximum(): number { return this._sarOptions.maximum; }

    /**
     * Update options dynamically
     */
    updateOptions(newOptions: Partial<ParabolicSAROptions>): boolean {
        const needsRecalc =
            (newOptions.start !== undefined && newOptions.start !== this._sarOptions.start) ||
            (newOptions.increment !== undefined && newOptions.increment !== this._sarOptions.increment) ||
            (newOptions.maximum !== undefined && newOptions.maximum !== this._sarOptions.maximum);

        Object.assign(this._sarOptions, newOptions);
        Object.assign(this._options, newOptions);

        if (needsRecalc) {
            this._options.name = `SAR (${this._sarOptions.start}, ${this._sarOptions.increment}, ${this._sarOptions.maximum})`;
        }

        this._dataChanged.fire();
        return needsRecalc;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._sarOptions };
    }

    setSettingValue(key: string, value: any): boolean {
        return this.updateOptions({ [key]: value } as any);
    }

    /**
     * Calculate Parabolic SAR values
     */
    calculate(sourceData: BarData[]): void {
        this._data = [];

        if (sourceData.length < 2) {
            return;
        }

        const start = this._sarOptions.start;
        const increment = this._sarOptions.increment;
        const maximum = this._sarOptions.maximum;

        // Initialize state
        let isUptrend = sourceData[1].close > sourceData[0].close;
        let sar = isUptrend ? sourceData[0].low : sourceData[0].high;
        let ep = isUptrend ? sourceData[0].high : sourceData[0].low;
        let af = start;

        // First point
        this._data.push({
            time: sourceData[0].time,
            value: sar,
        });

        for (let i = 1; i < sourceData.length; i++) {
            const bar = sourceData[i];
            const prevBar = sourceData[i - 1];
            const prevPrevBar = i > 1 ? sourceData[i - 2] : prevBar;

            // Calculate SAR for current bar before updating ep/af
            let nextSar = sar + af * (ep - sar);

            if (isUptrend) {
                // SAR cannot be above the prior two lows
                nextSar = Math.min(nextSar, prevBar.low, prevPrevBar.low);

                if (bar.low < nextSar) {
                    // Trend Reversal: Up to Down
                    isUptrend = false;
                    nextSar = ep; // New SAR is the highest high of the uptrend
                    ep = bar.low;
                    af = start;
                } else {
                    // Stay in Uptrend
                    if (bar.high > ep) {
                        ep = bar.high;
                        af = Math.min(maximum, af + increment);
                    }
                }
            } else {
                // SAR cannot be below the prior two highs
                nextSar = Math.max(nextSar, prevBar.high, prevPrevBar.high);

                if (bar.high > nextSar) {
                    // Trend Reversal: Down to Up
                    isUptrend = true;
                    nextSar = ep; // New SAR is the lowest low of the downtrend
                    ep = bar.high;
                    af = start;
                } else {
                    // Stay in Downtrend
                    if (bar.low < ep) {
                        ep = bar.low;
                        af = Math.min(maximum, af + increment);
                    }
                }
            }

            sar = nextSar;
            this._data.push({
                time: bar.time,
                value: sar,
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
        return `SAR(${this._sarOptions.start}, ${this._sarOptions.increment}, ${this._sarOptions.maximum}): ${valueStr}`;
    }
}
