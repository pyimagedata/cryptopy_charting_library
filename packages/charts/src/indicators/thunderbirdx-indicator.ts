import { PanelIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import {
    IndicatorSettingsConfig,
    createInputsTab,
    createStyleTab,
    createVisibilityTab,
    numberRow,
    colorRow,
    lineWidthRow,
} from '../gui/indicator_settings';

type SmoothingStyle = 'EMA' | 'DEMA' | 'TEMA' | 'WMA' | 'SMA';

export interface ThunderbirdxIndicatorOptions extends IndicatorOptions {
    postSmoothingStyle: SmoothingStyle;
    maStyle: SmoothingStyle;
    momentumLength: number;
    momentumSmoothing: number;
    postSmoothing: number;
    maLength: number;
    momentumColor: string;
    maColor: string;
    positiveFillColor: string;
    negativeFillColor: string;
    neutralFillColor: string;
    fillOpacity: number;
    histUpStrong: string;
    histUpWeak: string;
    histDownStrong: string;
    histDownWeak: string;
}

const defaultThunderbirdxOptions: Partial<ThunderbirdxIndicatorOptions> = {
    name: 'Thunderbirdx',
    style: IndicatorStyle.Histogram,
    postSmoothingStyle: 'WMA',
    maStyle: 'EMA',
    momentumLength: 50,
    momentumSmoothing: 50,
    postSmoothing: 4,
    maLength: 24,
    color: '#94a3b8',
    lineWidth: 2,
    momentumColor: '#5800fc',
    maColor: '#ff0000',
    positiveFillColor: '#22c55e',
    negativeFillColor: '#ef4444',
    neutralFillColor: '#facc15',
    fillOpacity: 50,
    histUpStrong: '#2ac075',
    histUpWeak: '#d5fce9',
    histDownStrong: '#f82934',
    histDownWeak: '#ffc8cb',
};

export class ThunderbirdxIndicator extends PanelIndicator {
    private _tbxOptions: ThunderbirdxIndicatorOptions;
    private _histogram: number[] = [];
    private _histogramColors: string[] = [];
    private _fillColors: string[] = [];
    public readonly isHistogram = true;

    constructor(options: Partial<ThunderbirdxIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultThunderbirdxOptions, ...options };
        super(mergedOptions);
        this._tbxOptions = { ...defaultThunderbirdxOptions, ...this._options } as ThunderbirdxIndicatorOptions;
        this._paneHeight = 140;
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([{ rows: [
                    numberRow('momentumLength', 'Momentum Length', 2, 200, 1),
                    numberRow('momentumSmoothing', 'Momentum Smoothing', 2, 200, 1),
                    numberRow('postSmoothing', 'Post Smoothing', 1, 50, 1),
                    numberRow('maLength', 'MA Length', 1, 100, 1),
                ] }]),
                createStyleTab([{ rows: [
                    colorRow('momentumColor', 'Momentum Color'),
                    colorRow('maColor', 'MA Color'),
                    colorRow('positiveFillColor', 'Bull Fill'),
                    colorRow('negativeFillColor', 'Bear Fill'),
                    colorRow('neutralFillColor', 'Neutral Fill'),
                    numberRow('fillOpacity', 'Fill Opacity', 0, 100, 1),
                    colorRow('histUpStrong', 'Hist Up Strong'),
                    colorRow('histUpWeak', 'Hist Up Weak'),
                    colorRow('histDownStrong', 'Hist Down Strong'),
                    colorRow('histDownWeak', 'Hist Down Weak'),
                    lineWidthRow('lineWidth'),
                ] }]),
                createVisibilityTab(),
            ],
        };
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._tbxOptions };
    }

    setSettingValue(key: string, value: any): boolean {
        const numericKeys = new Set([
            'momentumLength',
            'momentumSmoothing',
            'postSmoothing',
            'maLength',
        ]);
        const normalizedValue = numericKeys.has(key) ? Number(value) : value;
        const needsRecalc = numericKeys.has(key);
        Object.assign(this._tbxOptions, { [key]: normalizedValue });
        Object.assign(this._options, { [key]: normalizedValue });
        this._dataChanged.fire();
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._data = [];
        this._histogram = [];
        this._histogramColors = [];
        this._fillColors = [];

        const {
            momentumLength,
            momentumSmoothing,
            postSmoothing,
            maLength,
            postSmoothingStyle,
            maStyle,
        } = this._tbxOptions;

        if (sourceData.length < momentumLength * 2) {
            return;
        }

        const source = sourceData.map((bar) => bar.close);
        const lengthCorrection = momentumLength * 2;
        const offset = (lengthCorrection - 1) / 2;
        const sincSeries = ltiSincSeries(source, lengthCorrection, momentumSmoothing);
        const rawDelta = source.map((price, index) => {
            const sincValue = sincSeries[index];
            return isNaN(sincValue) ? NaN : (price - sincValue) / offset;
        });
        const delta = filterSeries(rawDelta, postSmoothing, postSmoothingStyle);
        const maSeed = filterSeries(delta, 2, maStyle);
        const ma = filterSeries(maSeed, maLength, maStyle);
        const momo = delta.map((value, index) => (isNaN(value) || isNaN(ma[index]) ? NaN : value - ma[index]));
        const obv = computeObv(sourceData);
        const obvm = emaSeries(obv, 7);
        const obvSignal = emaSeries(obvm, 10);

        for (let i = 0; i < sourceData.length; i++) {
            const deltaValue = delta[i];
            const maValue = ma[i];
            const momoValue = momo[i];

            this._histogram.push(momoValue);
            this._histogramColors.push(resolveHistogramColor(momo, i, this._tbxOptions));
            this._fillColors.push(resolveFillColor(deltaValue, maValue, obvm[i], obvSignal[i], this._tbxOptions));

            this._data.push({
                time: sourceData[i].time,
                value: momoValue,
                values: [deltaValue, maValue],
            });
        }
    }

    getRange(): IndicatorRange {
        if (this._data.length === 0) {
            return { min: -1, max: 1 };
        }

        let min = Infinity;
        let max = -Infinity;

        for (let i = 0; i < this._data.length; i++) {
            const point = this._data[i];
            const values = point.values ?? [];
            const hist = this._histogram[i];
            for (const value of [hist, ...values]) {
                if (value !== undefined && !isNaN(value)) {
                    min = Math.min(min, value);
                    max = Math.max(max, value);
                }
            }
        }

        if (min === Infinity || max === -Infinity) {
            return { min: -1, max: 1 };
        }

        const padding = (max - min) * 0.1 || 1;
        return { min: min - padding, max: max + padding };
    }

    getDescription(index?: number): string {
        const dataIndex = index !== undefined && index >= 0 && index < this._data.length
            ? index
            : this._data.length - 1;
        const point = this._data[dataIndex];
        const delta = point?.values?.[0];
        const ma = point?.values?.[1];
        const hist = this._histogram[dataIndex];

        const deltaLabel = delta === undefined || isNaN(delta) ? '-' : delta.toFixed(4);
        const maLabel = ma === undefined || isNaN(ma) ? '-' : ma.toFixed(4);
        const histLabel = hist === undefined || isNaN(hist) ? '-' : hist.toFixed(4);

        return `Thunderbirdx: ${histLabel} ${deltaLabel} ${maLabel}`;
    }

    getHistogramValue(index: number): number {
        return this._histogram[index] ?? NaN;
    }

    getHistogramColor(index: number): string {
        return this._histogramColors[index] ?? this._tbxOptions.histUpStrong;
    }

    getLineColors(): string[] {
        return [this._tbxOptions.momentumColor, this._tbxOptions.maColor];
    }

    getLineFills(): Array<{ from: number; to: number }> {
        return [{ from: 0, to: 1 }];
    }

    getLineFillColor(_from: number, _to: number, index: number): string {
        return this._fillColors[index] ?? withAlpha(this._tbxOptions.neutralFillColor, this._tbxOptions.fillOpacity);
    }

    getLevelLines(): Array<{ y: number; color: string }> {
        return [{ y: 0, color: 'rgba(255,255,255,0.25)' }];
    }
}

function resolveHistogramColor(
    momo: number[],
    index: number,
    options: ThunderbirdxIndicatorOptions
): string {
    const current = momo[index];
    const previous = index > 0 ? momo[index - 1] : NaN;

    if (isNaN(current)) {
        return options.histUpStrong;
    }

    if (current > 0) {
        return current > previous ? options.histUpStrong : options.histUpWeak;
    }

    return current < previous ? options.histDownStrong : options.histDownWeak;
}

function resolveFillColor(
    delta: number,
    ma: number,
    obvm: number,
    signal: number,
    options: ThunderbirdxIndicatorOptions
): string {
    if ([delta, ma, obvm, signal].some((value) => isNaN(value))) {
        return withAlpha(options.neutralFillColor, options.fillOpacity);
    }

    if (delta > ma && obvm > signal) {
        return withAlpha(options.positiveFillColor, options.fillOpacity);
    }

    if (delta < ma && obvm < signal) {
        return withAlpha(options.negativeFillColor, options.fillOpacity);
    }

    return withAlpha(options.neutralFillColor, options.fillOpacity);
}

function withAlpha(color: string, opacity: number): string {
    const normalizedOpacity = Math.max(0, Math.min(100, opacity)) / 100;

    if (color.startsWith('#')) {
        const hex = color.slice(1);
        const value = hex.length === 3
            ? hex.split('').map((char) => char + char).join('')
            : hex;

        if (value.length === 6) {
            const r = parseInt(value.slice(0, 2), 16);
            const g = parseInt(value.slice(2, 4), 16);
            const b = parseInt(value.slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${normalizedOpacity})`;
        }
    }

    if (color.startsWith('rgb(')) {
        return color.replace('rgb(', 'rgba(').replace(')', `, ${normalizedOpacity})`);
    }

    if (color.startsWith('rgba(')) {
        const match = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)$/);
        if (match) {
            return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${normalizedOpacity})`;
        }
    }

    return color;
}

function ltiSincSeries(source: number[], length: number, fc: number): number[] {
    const result = new Array<number>(source.length).fill(NaN);
    const coefficients = sincCoefficients(length, fc);
    const normalize = coefficients.reduce((sum, value) => sum + value, 0);

    for (let i = length; i < source.length; i++) {
        let sum = 0;
        for (let j = 0; j < length; j++) {
            sum += source[i - j] * coefficients[j];
        }
        result[i] = normalize === 0 ? NaN : sum / normalize;
    }

    return result;
}

function sincCoefficients(length: number, fc: number): number[] {
    const coefficients: number[] = [];
    const mid = (length - 1) / 2;
    const cutoff = 1 / fc;

    for (let i = 0; i < length; i++) {
        const n = i - mid;
        if (length % 2 === 0) {
            coefficients.push(sinc(2 * cutoff * n) * blackman(i + 0.5, length));
        } else {
            coefficients.push(sinc(2 * cutoff * n) * blackman(i, length));
        }
    }

    return coefficients;
}

function sinc(x: number): number {
    return x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
}

function blackman(n: number, length: number): number {
    return 0.42
        - 0.5 * Math.cos((2 * Math.PI * n) / (length - 1))
        + 0.08 * Math.cos((4 * Math.PI * n) / (length - 1));
}

function computeObv(sourceData: BarData[]): number[] {
    const result = new Array<number>(sourceData.length).fill(0);
    let obv = 0;

    for (let i = 1; i < sourceData.length; i++) {
        const volume = sourceData[i].volume ?? 0;
        if (sourceData[i].close > sourceData[i - 1].close) {
            obv += volume;
        } else if (sourceData[i].close < sourceData[i - 1].close) {
            obv -= volume;
        }
        result[i] = obv;
    }

    return result;
}

function filterSeries(values: number[], length: number, style: SmoothingStyle): number[] {
    if (length <= 1) {
        return values.slice();
    }

    switch (style) {
        case 'EMA':
            return emaSeries(values, length);
        case 'DEMA':
            return demaSeries(values, length);
        case 'TEMA':
            return temaSeries(values, length);
        case 'WMA':
            return wmaSeries(values, length);
        default:
            return smaSeries(values, length);
    }
}

function emaSeries(values: number[], length: number): number[] {
    const result = new Array<number>(values.length).fill(NaN);
    const alpha = 2 / (length + 1);
    let smoothed = NaN;

    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (isNaN(value)) {
            continue;
        }

        smoothed = isNaN(smoothed) ? value : alpha * value + (1 - alpha) * smoothed;
        result[i] = smoothed;
    }

    return result;
}

function demaSeries(values: number[], length: number): number[] {
    const ema1 = emaSeries(values, length);
    const ema2 = emaSeries(ema1, length);
    return ema1.map((value, index) => isNaN(value) || isNaN(ema2[index]) ? NaN : 2 * value - ema2[index]);
}

function temaSeries(values: number[], length: number): number[] {
    const ema1 = emaSeries(values, length);
    const ema2 = emaSeries(ema1, length);
    const ema3 = emaSeries(ema2, length);
    return ema1.map((value, index) => (
        isNaN(value) || isNaN(ema2[index]) || isNaN(ema3[index])
            ? NaN
            : (value - ema2[index]) * 3 + ema3[index]
    ));
}

function wmaSeries(values: number[], length: number): number[] {
    const result = new Array<number>(values.length).fill(NaN);
    const weightSum = length * 0.5 * (length + 1);

    for (let i = length - 1; i < values.length; i++) {
        let sum = 0;
        let valid = true;
        for (let j = 0; j < length; j++) {
            const value = values[i - j];
            if (isNaN(value)) {
                valid = false;
                break;
            }
            sum += value * (length - j);
        }
        if (valid) {
            result[i] = sum / weightSum;
        }
    }

    return result;
}

function smaSeries(values: number[], length: number): number[] {
    const result = new Array<number>(values.length).fill(NaN);
    let sum = 0;
    let validCount = 0;

    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (!isNaN(value)) {
            sum += value;
            validCount++;
        }

        if (i >= length) {
            const prev = values[i - length];
            if (!isNaN(prev)) {
                sum -= prev;
                validCount--;
            }
        }

        if (validCount === length) {
            result[i] = sum / length;
        }
    }

    return result;
}
