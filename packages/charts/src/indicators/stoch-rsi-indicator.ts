/**
 * Stochastic RSI Indicator
 * 
 * StochRSI is an oscillator that measures the level of RSI relative to its high-low range 
 * over a set period of time.
 * 
 * Formula:
 * StochRSI = (RSI - Lowest Low RSI) / (Highest High RSI - Lowest Low RSI)
 */

import { PanelIndicator, IndicatorOptions, IndicatorRange } from './indicator';
import { BarData } from '../model/data';

/**
 * Stochastic RSI indicator options
 */
export interface StochRSIIndicatorOptions extends IndicatorOptions {
    rsiPeriod: number;    // RSI period (default: 14)
    stochPeriod: number;  // Stochastic period (default: 14)
    kPeriod: number;      // %K smoothing (default: 3)
    dPeriod: number;      // %D smoothing (signal line, default: 3)
}

/**
 * Default StochRSI options
 */
const defaultStochRSIOptions: Partial<StochRSIIndicatorOptions> = {
    name: 'Stoch RSI',
    rsiPeriod: 14,
    stochPeriod: 14,
    kPeriod: 3,
    dPeriod: 3,
    color: '#2196f3', // %K color (Blue)
    lineWidth: 1.5,
};

/**
 * Stochastic RSI Indicator
 */
export class StochRSIIndicator extends PanelIndicator {
    private _stochRSIOptions: StochRSIIndicatorOptions;

    constructor(options: Partial<StochRSIIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultStochRSIOptions, ...options };
        mergedOptions.name = `Stoch RSI (${mergedOptions.rsiPeriod}, ${mergedOptions.stochPeriod}, ${mergedOptions.kPeriod}, ${mergedOptions.dPeriod})`;
        super(mergedOptions);
        this._stochRSIOptions = { ...defaultStochRSIOptions, ...this._options } as StochRSIIndicatorOptions;
        this._paneHeight = 110;
    }

    updateOptions(newOptions: Partial<StochRSIIndicatorOptions>): boolean {
        const needsRecalc =
            newOptions.rsiPeriod !== undefined ||
            newOptions.stochPeriod !== undefined ||
            newOptions.kPeriod !== undefined ||
            newOptions.dPeriod !== undefined;

        Object.assign(this._stochRSIOptions, newOptions);
        Object.assign(this._options, newOptions);

        if (needsRecalc) {
            this._stochRSIOptions.name = `Stoch RSI (${this._stochRSIOptions.rsiPeriod}, ${this._stochRSIOptions.stochPeriod}, ${this._stochRSIOptions.kPeriod}, ${this._stochRSIOptions.dPeriod})`;
            this._options.name = this._stochRSIOptions.name;
        }

        this._dataChanged.fire();
        return needsRecalc;
    }

    setSettingValue(key: string, value: any): boolean {
        return this.updateOptions({ [key]: value } as any);
    }

    calculate(sourceData: BarData[]): void {
        this._data = [];
        const { rsiPeriod, stochPeriod, kPeriod, dPeriod } = this._stochRSIOptions;

        if (sourceData.length < rsiPeriod + stochPeriod) return;

        // 1. Calculate RSI values
        const rsiValues = this._calculateRSI(sourceData, rsiPeriod);

        // 2. Calculate Raw StochRSI
        const rawStochRSI: number[] = new Array(rsiValues.length).fill(NaN);
        for (let i = rsiPeriod + stochPeriod - 1; i < rsiValues.length; i++) {
            let low = Infinity;
            let high = -Infinity;

            for (let j = 0; j < stochPeriod; j++) {
                const val = rsiValues[i - j];
                if (val < low) low = val;
                if (val > high) high = val;
            }

            const rsi = rsiValues[i];
            const diff = high - low;
            rawStochRSI[i] = diff === 0 ? 0 : (rsi - low) / diff;
        }

        // 3. Smooth %K (kPeriod SMA)
        const kValues: number[] = this._calculateSMA(rawStochRSI, kPeriod);

        // 4. Smooth %D (dPeriod SMA of %K)
        const dValues: number[] = this._calculateSMA(kValues, dPeriod);

        // Fill final data
        for (let i = 0; i < sourceData.length; i++) {
            const k = kValues[i] * 100;
            const d = dValues[i] * 100;

            this._data.push({
                time: sourceData[i].time,
                value: k, // Primary line
                values: [k, d]
            });
        }
    }

    private _calculateRSI(data: BarData[], period: number): number[] {
        const result: number[] = new Array(data.length).fill(NaN);
        if (data.length < period + 1) return result;

        let avgGain = 0;
        let avgLoss = 0;

        // Initial SMA
        for (let i = 1; i <= period; i++) {
            const diff = data[i].close - data[i - 1].close;
            if (diff >= 0) avgGain += diff;
            else avgLoss -= diff;
        }
        avgGain /= period;
        avgLoss /= period;

        result[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

        // Subsequent RMA
        for (let i = period + 1; i < data.length; i++) {
            const diff = data[i].close - data[i - 1].close;
            const gain = diff >= 0 ? diff : 0;
            const loss = diff < 0 ? -diff : 0;

            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;

            result[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
        }

        return result;
    }

    private _calculateSMA(values: number[], period: number): number[] {
        const result: number[] = new Array(values.length).fill(NaN);
        if (values.length < period) return result;

        let sum = 0;
        let count = 0;

        for (let i = 0; i < values.length; i++) {
            const val = values[i];

            if (!isNaN(val)) {
                sum += val;
                count++;
            }

            if (count > period) {
                const prevVal = values[i - period];
                if (!isNaN(prevVal)) {
                    sum -= prevVal;
                    count--;
                }
            }

            if (count === period) {
                result[i] = sum / period;
            }
        }
        return result;
    }

    getRange(): IndicatorRange {
        return { min: 0, max: 100, fixedMin: 0, fixedMax: 100 };
    }

    getLevelLines(): { y: number; color: string; label: string }[] {
        return [
            { y: 80, color: 'rgba(239, 83, 80, 0.4)', label: '80' },
            { y: 20, color: 'rgba(38, 166, 154, 0.4)', label: '20' }
        ];
    }

    getLineColors(): string[] {
        return [this._stochRSIOptions.color, '#ff6d00']; // K (Blue), D (Orange)
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

        return `Stoch RSI(${this._stochRSIOptions.rsiPeriod}): ${kStr} ${dStr}`;
    }
}
