import { PanelIndicator, IndicatorOptions, IndicatorRange } from './indicator';
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

export interface TdojiOscillatorOptions extends IndicatorOptions {
    curveLength: number;
    slopeLength: number;
    signalLength: number;
    upColor: string;
    downColor: string;
    neutralColor: string;
    signalColor: string;
    zeroLineColor: string;
}

const defaultTdojiOscillatorOptions: Partial<TdojiOscillatorOptions> = {
    name: 'Tdoji Oscilator',
    curveLength: 144,
    slopeLength: 5,
    signalLength: 21,
    color: '#2563eb',
    lineWidth: 2,
    upColor: '#22c55e',
    downColor: '#ef4444',
    neutralColor: '#2563eb',
    signalColor: '#9ca3af',
    zeroLineColor: '#9ca3af',
};

export class TdojiOscillatorIndicator extends PanelIndicator {
    private _tdojiOptions: TdojiOscillatorOptions;
    private _lineColors: string[] = [];

    constructor(options: Partial<TdojiOscillatorOptions> = {}) {
        const mergedOptions = { ...defaultTdojiOscillatorOptions, ...options };
        super(mergedOptions);
        this._tdojiOptions = { ...defaultTdojiOscillatorOptions, ...this._options } as TdojiOscillatorOptions;
        this._paneHeight = 120;
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    rows: [
                        numberRow('curveLength', 'Curve Length', 1, 500, 1),
                        numberRow('slopeLength', 'Slope Length', 1, 100, 1),
                        numberRow('signalLength', 'Signal Length', 1, 200, 1),
                    ],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('upColor', 'Up Color'),
                        colorRow('downColor', 'Down Color'),
                        colorRow('neutralColor', 'Neutral Color'),
                        colorRow('signalColor', 'Signal Color'),
                        colorRow('zeroLineColor', 'Zero Line Color'),
                        lineWidthRow('lineWidth'),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    getSettingValue(key: string): any {
        return (this._tdojiOptions as any)[key];
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = key === 'curveLength' || key === 'slopeLength' || key === 'signalLength';
        Object.assign(this._tdojiOptions, { [key]: value });
        Object.assign(this._options, { [key]: value });
        this._dataChanged.fire();
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._data = [];
        this._lineColors = [];

        const { curveLength, slopeLength, signalLength } = this._tdojiOptions;
        if (sourceData.length < curveLength + signalLength) {
            return;
        }

        const src = sourceData.map((bar) => bar.close);
        const lrc = this._linearRegressionSeries(src, curveLength);
        const lrs = lrc.map((value, index) => index === 0 || isNaN(value) || isNaN(lrc[index - 1]) ? NaN : value - lrc[index - 1]);
        const slrs = this._emaSeries(lrs, slopeLength);
        const alrs = this._smaSeries(slrs, signalLength);

        for (let i = 0; i < sourceData.length; i++) {
            const slope = slrs[i];
            const avgSlope = alrs[i];
            const rawSlope = lrs[i];

            this._data.push({
                time: sourceData[i].time,
                value: slope,
                values: [slope, avgSlope],
            });

            if (isNaN(rawSlope) || isNaN(avgSlope)) {
                this._lineColors.push(this._tdojiOptions.neutralColor);
                continue;
            }

            const acceleratingUp = rawSlope > avgSlope && rawSlope > 0;
            const acceleratingDown = rawSlope < avgSlope && rawSlope < 0;

            if (acceleratingUp) {
                this._lineColors.push(this._tdojiOptions.upColor);
            } else if (acceleratingDown) {
                this._lineColors.push(this._tdojiOptions.downColor);
            } else {
                this._lineColors.push(this._tdojiOptions.neutralColor);
            }
        }
    }

    getRange(): IndicatorRange {
        if (this._data.length === 0) {
            return { min: -1, max: 1 };
        }

        let min = Infinity;
        let max = -Infinity;

        for (const point of this._data) {
            const slope = point.values?.[0];
            const signal = point.values?.[1];

            if (slope !== undefined && !isNaN(slope)) {
                min = Math.min(min, slope);
                max = Math.max(max, slope);
            }

            if (signal !== undefined && !isNaN(signal)) {
                min = Math.min(min, signal);
                max = Math.max(max, signal);
            }
        }

        if (min === Infinity || max === -Infinity) {
            return { min: -1, max: 1 };
        }

        const absMax = Math.max(Math.abs(min), Math.abs(max), 1e-6);

        return {
            min: -absMax,
            max: absMax,
            fixedMin: -absMax,
            fixedMax: absMax,
        };
    }

    getDescription(index?: number): string {
        const lastIndex = index !== undefined && index >= 0 && index < this._data.length ? index : this._data.length - 1;
        const point = this._data[lastIndex];
        const slope = point?.values?.[0];
        const signal = point?.values?.[1];

        const slopeLabel = slope === undefined || isNaN(slope) ? '-' : slope.toFixed(4);
        const signalLabel = signal === undefined || isNaN(signal) ? '-' : signal.toFixed(4);

        return `Tdoji Oscilator: ${slopeLabel} ${signalLabel}`;
    }

    getLevelLines(): Array<{ y: number; color: string }> {
        return [{ y: 0, color: this._tdojiOptions.zeroLineColor }];
    }

    getLineColors(): string[] {
        return [this._tdojiOptions.color, this._tdojiOptions.signalColor];
    }

    getLineColor(lineIndex: number, pointIndex: number): string {
        if (lineIndex === 0) {
            return this._lineColors[pointIndex] ?? this._tdojiOptions.neutralColor;
        }

        return this._tdojiOptions.signalColor;
    }

    private _linearRegressionSeries(values: number[], length: number): number[] {
        const result = new Array<number>(values.length).fill(NaN);
        const xMean = (length - 1) / 2;
        let denominator = 0;

        for (let i = 0; i < length; i++) {
            const dx = i - xMean;
            denominator += dx * dx;
        }

        for (let end = length - 1; end < values.length; end++) {
            let yMean = 0;
            for (let offset = 0; offset < length; offset++) {
                yMean += values[end - length + 1 + offset];
            }
            yMean /= length;

            let numerator = 0;
            for (let offset = 0; offset < length; offset++) {
                numerator += (offset - xMean) * (values[end - length + 1 + offset] - yMean);
            }

            const slope = denominator === 0 ? 0 : numerator / denominator;
            const intercept = yMean - slope * xMean;
            result[end] = intercept + slope * (length - 1);
        }

        return result;
    }

    private _emaSeries(values: number[], length: number): number[] {
        const result = new Array<number>(values.length).fill(NaN);
        const multiplier = 2 / (length + 1);
        let ema = NaN;

        for (let i = 0; i < values.length; i++) {
            const value = values[i];
            if (isNaN(value)) {
                continue;
            }

            if (isNaN(ema)) {
                ema = value;
            } else {
                ema = value * multiplier + ema * (1 - multiplier);
            }

            result[i] = ema;
        }

        return result;
    }

    private _smaSeries(values: number[], length: number): number[] {
        const result = new Array<number>(values.length).fill(NaN);
        let sum = 0;
        let validCount = 0;

        for (let i = 0; i < values.length; i++) {
            if (!isNaN(values[i])) {
                sum += values[i];
                validCount++;
            }

            if (i >= length && !isNaN(values[i - length])) {
                sum -= values[i - length];
                validCount--;
            }

            if (i >= length - 1 && validCount === length) {
                result[i] = sum / length;
            }
        }

        return result;
    }
}
