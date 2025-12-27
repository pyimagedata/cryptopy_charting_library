/**
 * MACD (Moving Average Convergence Divergence) Indicator
 */

import { PanelIndicator, IndicatorOptions, IndicatorRange } from './indicator';
import { BarData } from '../model/data';

/**
 * MACD indicator options
 */
export interface MACDIndicatorOptions extends IndicatorOptions {
    fastPeriod: number;    // default: 12
    slowPeriod: number;    // default: 26
    signalPeriod: number;  // default: 9
    source: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4';
}

const defaultMACDOptions: Partial<MACDIndicatorOptions> = {
    name: 'MACD',
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    source: 'close',
    color: '#2196f3',  // MACD Line Color
    lineWidth: 1.5,
};

/**
 * MACD Indicator
 * Renders: MACD Line, Signal Line, and Histogram
 */
export class MACDIndicator extends PanelIndicator {
    private _macdOptions: MACDIndicatorOptions;
    private _histogramData: number[] = [];

    get macdOptions(): MACDIndicatorOptions {
        return this._macdOptions;
    }

    // Panel properties for renderer
    public readonly isHistogram = true;

    constructor(options: Partial<MACDIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultMACDOptions, ...options };
        mergedOptions.name = `MACD (${mergedOptions.fastPeriod}, ${mergedOptions.slowPeriod}, ${mergedOptions.signalPeriod})`;
        super(mergedOptions);
        this._macdOptions = { ...defaultMACDOptions, ...this._options } as MACDIndicatorOptions;
        this._paneHeight = 120;
    }

    updateOptions(newOptions: Partial<MACDIndicatorOptions>): boolean {
        const needsRecalc =
            newOptions.fastPeriod !== undefined ||
            newOptions.slowPeriod !== undefined ||
            newOptions.signalPeriod !== undefined ||
            newOptions.source !== undefined;

        Object.assign(this._macdOptions, newOptions);
        Object.assign(this._options, newOptions);

        if (needsRecalc) {
            this._macdOptions.name = `MACD (${this._macdOptions.fastPeriod}, ${this._macdOptions.slowPeriod}, ${this._macdOptions.signalPeriod})`;
            this._options.name = this._macdOptions.name;
        }

        this._dataChanged.fire();
        return needsRecalc;
    }

    private _getSourcePrice(bar: BarData): number {
        switch (this._macdOptions.source) {
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
        this._histogramData = [];

        if (sourceData.length < this._macdOptions.slowPeriod) return;

        const fastK = 2 / (this._macdOptions.fastPeriod + 1);
        const slowK = 2 / (this._macdOptions.slowPeriod + 1);
        const signalK = 2 / (this._macdOptions.signalPeriod + 1);

        let fastEma = this._getSourcePrice(sourceData[0]);
        let slowEma = this._getSourcePrice(sourceData[0]);

        const macdLineValues: number[] = [];

        // Calculate MACD Line
        for (let i = 0; i < sourceData.length; i++) {
            const price = this._getSourcePrice(sourceData[i]);
            fastEma = price * fastK + fastEma * (1 - fastK);
            slowEma = price * slowK + slowEma * (1 - slowK);
            macdLineValues.push(fastEma - slowEma);
        }

        // Calculate Signal Line (EMA of MACD Line)
        let signalEma = macdLineValues[0];
        const signalLineValues: number[] = [];
        for (let i = 0; i < macdLineValues.length; i++) {
            signalEma = macdLineValues[i] * signalK + signalEma * (1 - signalK);
            signalLineValues.push(signalEma);

            // Histogram
            const hist = macdLineValues[i] - signalEma;
            this._histogramData.push(hist);

            this._data.push({
                time: sourceData[i].time,
                value: hist, // Base value for auto-scaling
                values: [macdLineValues[i], signalEma]
            });
        }
    }

    getRange(): IndicatorRange {
        if (this._data.length === 0) return { min: -1, max: 1 };

        let min = Infinity;
        let max = -Infinity;

        for (const point of this._data) {
            const hist = point.value;
            const macd = point.values![0];
            const signal = point.values![1];

            min = Math.min(min, hist, macd, signal);
            max = Math.max(max, hist, macd, signal);
        }

        return { min, max };
    }

    getHistogramValue(index: number): number {
        return this._histogramData[index] ?? NaN;
    }

    getLineColors(): string[] {
        return [this._macdOptions.color, '#ff6d00']; // MACD (Blue), Signal (Orange)
    }

    getDescription(index?: number): string {
        let macd = NaN, signal = NaN, hist = NaN;

        if (index !== undefined && index >= 0 && index < this._data.length) {
            macd = this._data[index].values![0];
            signal = this._data[index].values![1];
            hist = this._histogramData[index];
        } else if (this._data.length > 0) {
            const last = this._data.length - 1;
            macd = this._data[last].values![0];
            signal = this._data[last].values![1];
            hist = this._histogramData[last];
        }

        const m = isNaN(macd) ? '-' : macd.toFixed(2);
        const s = isNaN(signal) ? '-' : signal.toFixed(2);
        const h = isNaN(hist) ? '-' : hist.toFixed(2);

        return `MACD: ${m} ${s} ${h}`;
    }
}
