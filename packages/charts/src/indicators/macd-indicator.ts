/**
 * MACD (Moving Average Convergence Divergence) Indicator
 */

import { PanelIndicator, IndicatorOptions, IndicatorRange } from './indicator';
import { BarData } from '../model/data';
import { IndicatorLegendInfo, legendParams, legendBarIndex } from './legend-info';
import {
    IndicatorSettingsConfig, createInputsTab, createStyleTab, numberRow, selectRow, colorRow, lineWidthRow, SOURCE_OPTIONS,
} from '../gui/indicator_settings';

/**
 * MACD indicator options
 */
export interface MACDIndicatorOptions extends IndicatorOptions {
    fastPeriod: number;    // default: 12
    slowPeriod: number;    // default: 26
    signalPeriod: number;  // default: 9
    source: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4';
    signalColor: string;      // Signal line colour
    histUpColor: string;      // Histogram colour above zero
    histDownColor: string;    // Histogram colour below zero
}

const defaultMACDOptions: Partial<MACDIndicatorOptions> = {
    name: 'MACD',
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    source: 'close',
    color: '#2196f3',  // MACD Line Color
    lineWidth: 1.5,
    signalColor: '#ff6d00',
    histUpColor: 'rgba(38, 166, 154, 0.5)',
    histDownColor: 'rgba(239, 83, 80, 0.5)',
};

/** rgba(r,g,b,a) -> rgb(r,g,b): legend value text is painted opaque */
function opaque(color: string): string {
    const m = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(color);
    return m ? `rgb(${m[1]}, ${m[2]}, ${m[3]})` : color;
}

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

    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    rows: [
                        numberRow('fastPeriod', 'Fast Length', 1, 500, 1),
                        numberRow('slowPeriod', 'Slow Length', 1, 500, 1),
                        numberRow('signalPeriod', 'Signal Smoothing', 1, 500, 1),
                        selectRow('source', 'Source', SOURCE_OPTIONS, this._macdOptions.source),
                    ],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('color', 'MACD Line Color'),
                        lineWidthRow('lineWidth', 'Line Width'),
                        colorRow('signalColor', 'Signal Line Color'),
                        colorRow('histUpColor', 'Histogram Up Color'),
                        colorRow('histDownColor', 'Histogram Down Color'),
                    ],
                }]),
            ],
        };
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this._options.visible;
        return (this._macdOptions as any)[key];
    }

    /**
     * Set setting value by key
     */
    setSettingValue(key: string, value: any): boolean {
        return this.updateOptions({ [key]: value } as any);
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

    getRange(visibleRange?: { from: number; to: number } | null): IndicatorRange {
        if (this._data.length === 0) return { min: -1, max: 1 };

        let min = Infinity;
        let max = -Infinity;

        const startIndex = visibleRange ? Math.max(0, Math.floor(visibleRange.from)) : 0;
        const endIndex = visibleRange ? Math.min(this._data.length - 1, Math.ceil(visibleRange.to)) : this._data.length - 1;

        for (let i = startIndex; i <= endIndex; i++) {
            const point = this._data[i];
            if (!point) continue;

            const hist = point.value;
            const macd = point.values?.[0];
            const signal = point.values?.[1];

            if (hist !== undefined && !isNaN(hist) && isFinite(hist)) {
                min = Math.min(min, hist);
                max = Math.max(max, hist);
            }
            if (macd !== undefined && !isNaN(macd) && isFinite(macd)) {
                min = Math.min(min, macd);
                max = Math.max(max, macd);
            }
            if (signal !== undefined && !isNaN(signal) && isFinite(signal)) {
                min = Math.min(min, signal);
                max = Math.max(max, signal);
            }
        }

        if (min === Infinity || max === -Infinity) {
            return { min: -1, max: 1 };
        }

        return { min, max };
    }

    getHistogramValue(index: number): number {
        return this._histogramData[index] ?? NaN;
    }

    getLineColors(): string[] {
        return [this._macdOptions.color, this._macdOptions.signalColor]; // MACD (Blue), Signal (Orange)
    }

    getHistogramColor(index: number): string {
        const v = this._histogramData[index];
        return v >= 0 ? this._macdOptions.histUpColor : this._macdOptions.histDownColor;
    }

    getLegendInfo(index?: number | null): IndicatorLegendInfo {
        const i = legendBarIndex(this._data.length, index);
        const v = i >= 0 ? this._data[i].values : undefined;
        const hist = i >= 0 ? this.getHistogramValue(i) : NaN;
        const o = this._macdOptions;
        const [macdColor, signalColor] = this.getLineColors();
        return {
            title: 'MACD',
            params: legendParams(o.fastPeriod, o.slowPeriod, o.source, o.signalPeriod),
            plots: [
                { color: opaque(hist >= 0 ? o.histUpColor : o.histDownColor), value: hist },
                { color: macdColor, value: v ? v[0] : null },
                { color: signalColor, value: v ? v[1] : null },
            ],
        };
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
