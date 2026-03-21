import { PanelIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';

export interface TdojiMomIndicatorOptions extends IndicatorOptions {
    period: number;
    positiveColor: string;
    negativeColor: string;
    zeroLineColor: string;
}

const defaultTdojiMomOptions: Partial<TdojiMomIndicatorOptions> = {
    name: 'TDOJI MOM',
    period: 60,
    color: '#94a3b8',
    lineWidth: 1,
    style: IndicatorStyle.Histogram,
    positiveColor: 'rgba(37, 99, 235, 0.75)',
    negativeColor: 'rgba(239, 68, 68, 0.75)',
    zeroLineColor: 'rgba(148, 163, 184, 0.8)',
};

export class TdojiMomIndicator extends PanelIndicator {
    private _momOptions: TdojiMomIndicatorOptions;
    public readonly isHistogram = true;

    constructor(options: Partial<TdojiMomIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultTdojiMomOptions, ...options };
        super(mergedOptions);
        this._momOptions = { ...defaultTdojiMomOptions, ...this._options } as TdojiMomIndicatorOptions;
        this._paneHeight = 100;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._momOptions };
    }

    updateOptions(newOptions: Partial<TdojiMomIndicatorOptions>): boolean {
        const needsRecalc = newOptions.period !== undefined && newOptions.period !== this._momOptions.period;
        Object.assign(this._momOptions, newOptions);
        Object.assign(this._options, newOptions);
        this._dataChanged.fire();
        return needsRecalc;
    }

    setSettingValue(key: string, value: any): boolean {
        return this.updateOptions({ [key]: value } as any);
    }

    calculate(sourceData: BarData[]): void {
        this._data = [];
        if (sourceData.length === 0) {
            return;
        }

        const period = this._momOptions.period;
        const multiplier = 2 / (period + 1);
        let ema = sourceData[0].close;

        for (let i = 0; i < sourceData.length; i++) {
            const close = sourceData[i].close;
            if (i === 0) {
                ema = close;
            } else {
                ema = close * multiplier + ema * (1 - multiplier);
            }

            this._data.push({
                time: sourceData[i].time,
                value: close - ema,
            });
        }
    }

    getRange(): IndicatorRange {
        if (this._data.length === 0) {
            return { min: -1, max: 1 };
        }

        let min = Infinity;
        let max = -Infinity;
        for (const point of this._data) {
            if (isNaN(point.value)) continue;
            min = Math.min(min, point.value);
            max = Math.max(max, point.value);
        }

        const absMax = Math.max(Math.abs(min), Math.abs(max), 1e-6);
        return {
            min: -absMax,
            max: absMax,
            fixedMin: -absMax,
            fixedMax: absMax,
        };
    }

    getHistogramValue(index: number): number {
        return this._data[index]?.value ?? NaN;
    }

    getHistogramColor(index: number): string {
        const value = this._data[index]?.value ?? NaN;
        return value >= 0 ? this._momOptions.positiveColor : this._momOptions.negativeColor;
    }

    getLevelLines(): Array<{ y: number; color: string }> {
        return [{ y: 0, color: this._momOptions.zeroLineColor }];
    }

    getDescription(index?: number): string {
        let value = NaN;
        if (index !== undefined && index >= 0 && index < this._data.length) {
            value = this._data[index].value;
        } else if (this._data.length > 0) {
            value = this._data[this._data.length - 1].value;
        }

        const valueStr = isNaN(value) ? '-' : value.toFixed(4);
        return `TDOJI MOM: ${valueStr}`;
    }
}
