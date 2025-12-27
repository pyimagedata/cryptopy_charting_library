/**
 * Stochastic Oscillator Indicator
 */

import { PanelIndicator, IndicatorOptions, IndicatorRange } from './indicator';
import { BarData } from '../model/data';

/**
 * Stochastic indicator options
 */
export interface StochIndicatorOptions extends IndicatorOptions {
    kPeriod: number;      // %K period (default: 14)
    dPeriod: number;      // %D period (smoothing, default: 3)
    sPeriod: number;      // %K smoothing (default: 3)
}

const defaultStochOptions: Partial<StochIndicatorOptions> = {
    name: 'Stochastic',
    kPeriod: 14,
    dPeriod: 3,
    sPeriod: 3,
    color: '#2196f3', // %K color
    lineWidth: 1.5,
};

/**
 * Stochastic Indicator
 * Renders: %K line and %D smoothing line
 */
export class StochIndicator extends PanelIndicator {
    private _stochOptions: StochIndicatorOptions;

    get stochOptions(): StochIndicatorOptions {
        return this._stochOptions;
    }

    constructor(options: Partial<StochIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultStochOptions, ...options };
        mergedOptions.name = `Stoch (${mergedOptions.kPeriod}, ${mergedOptions.sPeriod}, ${mergedOptions.dPeriod})`;
        super(mergedOptions);
        this._stochOptions = { ...defaultStochOptions, ...this._options } as StochIndicatorOptions;
        this._paneHeight = 100;
    }

    updateOptions(newOptions: Partial<StochIndicatorOptions>): boolean {
        const needsRecalc =
            newOptions.kPeriod !== undefined ||
            newOptions.dPeriod !== undefined ||
            newOptions.sPeriod !== undefined;

        Object.assign(this._stochOptions, newOptions);
        Object.assign(this._options, newOptions);

        if (needsRecalc) {
            this._stochOptions.name = `Stoch (${this._stochOptions.kPeriod}, ${this._stochOptions.sPeriod}, ${this._stochOptions.dPeriod})`;
            this._options.name = this._stochOptions.name;
        }

        this._dataChanged.fire();
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._data = [];
        const { kPeriod, dPeriod, sPeriod } = this._stochOptions;

        if (sourceData.length < kPeriod) return;

        const kValuesRaw: number[] = [];

        // 1. Calculate Raw %K
        for (let i = 0; i < sourceData.length; i++) {
            if (i < kPeriod - 1) {
                kValuesRaw.push(NaN);
                continue;
            }

            let low = Infinity;
            let high = -Infinity;
            for (let j = 0; j < kPeriod; j++) {
                const bar = sourceData[i - j];
                if (bar.low < low) low = bar.low;
                if (bar.high > high) high = bar.high;
            }

            const close = sourceData[i].close;
            const diff = high - low;
            const k = diff === 0 ? 50 : ((close - low) / diff) * 100;
            kValuesRaw.push(k);
        }

        // 2. Smooth %K (Full Stochastic)
        const kValuesSmoothed: number[] = [];
        for (let i = 0; i < kValuesRaw.length; i++) {
            if (i < kPeriod + sPeriod - 2) {
                kValuesSmoothed.push(NaN);
                continue;
            }

            let sum = 0;
            let count = 0;
            for (let j = 0; j < sPeriod; j++) {
                const val = kValuesRaw[i - j];
                if (!isNaN(val)) {
                    sum += val;
                    count++;
                }
            }
            kValuesSmoothed.push(count > 0 ? sum / count : NaN);
        }

        // 3. Calculate %D (SMA of smoothed %K)
        for (let i = 0; i < kValuesSmoothed.length; i++) {
            if (i < kPeriod + sPeriod + dPeriod - 3) {
                this._data.push({
                    time: sourceData[i].time,
                    value: NaN,
                    values: [NaN, NaN]
                });
                continue;
            }

            let sum = 0;
            let count = 0;
            for (let j = 0; j < dPeriod; j++) {
                const val = kValuesSmoothed[i - j];
                if (!isNaN(val)) {
                    sum += val;
                    count++;
                }
            }
            const d = count > 0 ? sum / count : NaN;
            const k = kValuesSmoothed[i];

            this._data.push({
                time: sourceData[i].time,
                value: k, // Main value for legend
                values: [k, d]
            });
        }
    }

    getRange(): IndicatorRange {
        return {
            min: 0,
            max: 100,
            fixedMin: 0,
            fixedMax: 100
        };
    }

    getLevelLines(): { y: number; color: string; label: string }[] {
        return [
            { y: 80, color: 'rgba(239, 83, 80, 0.4)', label: '80' },
            { y: 20, color: 'rgba(38, 166, 154, 0.4)', label: '20' }
        ];
    }

    getLineColors(): string[] {
        return [this._stochOptions.color, '#ff6d00']; // %K (Blue), %D (Orange)
    }

    getDescription(index?: number): string {
        let k = NaN, d = NaN;
        if (index !== undefined && index >= 0 && index < this._data.length) {
            k = this._data[index].values![0];
            d = this._data[index].values![1];
        } else if (this._data.length > 0) {
            const last = this._data.length - 1;
            k = this._data[last].values![0];
            d = this._data[last].values![1];
        }

        const kStr = isNaN(k) ? '-' : k.toFixed(2);
        const dStr = isNaN(d) ? '-' : d.toFixed(2);

        return `Stoch(${this._stochOptions.kPeriod}): ${kStr} ${dStr}`;
    }
}
