import { PanelIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import { RemoteCompute, RemoteContext, accessNoticeText, legendIndex, timeIndexMap } from './remote-compute';

// TDOJI MOM: değerler backend'de hesaplanır (bkz. remote-compute.ts); burada yalnızca çizilir.

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

interface RemoteMom {
    times: number[];
    value: number[];
}

export class TdojiMomIndicator extends PanelIndicator {
    private _momOptions: TdojiMomIndicatorOptions;
    public readonly isHistogram = true;
    private _raw: RemoteMom | null = null;
    private _rawIndex: Map<number, number> = new Map();
    private readonly _remote = new RemoteCompute<RemoteMom>('tdoji-mom', (raw) => {
        this._raw = raw;
        this._rawIndex = raw ? timeIndexMap(raw.times) : new Map();
        this._rebuild();
    });

    constructor(options: Partial<TdojiMomIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultTdojiMomOptions, ...options };
        super(mergedOptions);
        this._momOptions = { ...defaultTdojiMomOptions, ...this._options } as TdojiMomIndicatorOptions;
        this._paneHeight = 100;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._momOptions };
    }

    setContext(ctx: RemoteContext): void {
        this._remote.setContext(ctx);
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
        this._sourceData = sourceData;
        this._remote.request({ period: this._momOptions.period }, () => this._dataChanged.fire());
        this._rebuild();
    }

    /** Ham (zaman damgalı) diziyi mevcut mum dizisine eşler. */
    private _rebuild(): void {
        this._data = [];
        const bars = this._sourceData;
        const raw = this._raw;
        if (!raw || raw.times.length === 0 || bars.length === 0) return;

        for (const bar of bars) {
            const j = this._rawIndex.get(bar.time > 1e12 ? bar.time : bar.time * 1000);
            this._data.push({ time: bar.time, value: j === undefined ? NaN : raw.value[j] });
        }
    }

    destroy(): void {
        this._remote.destroy();
        super.destroy();
    }

    getRange(visibleRange?: { from: number; to: number } | null): IndicatorRange {
        if (this._data.length === 0) {
            return { min: -1, max: 1 };
        }

        let min = Infinity;
        let max = -Infinity;

        const startIndex = visibleRange ? Math.max(0, Math.floor(visibleRange.from)) : 0;
        const endIndex = visibleRange ? Math.min(this._data.length - 1, Math.ceil(visibleRange.to)) : this._data.length - 1;

        for (let i = startIndex; i <= endIndex; i++) {
            const point = this._data[i];
            if (point && !isNaN(point.value) && isFinite(point.value)) {
                min = Math.min(min, point.value);
                max = Math.max(max, point.value);
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
        const denied = accessNoticeText(this._remote, 'TDOJI MOM');
        if (denied !== null) return denied;

        const value = this._data.length > 0 ? this._data[legendIndex(this._data, index)].value : NaN;

        const valueStr = isNaN(value) ? '-' : value.toFixed(4);
        return `TDOJI MOM: ${valueStr}`;
    }
}
