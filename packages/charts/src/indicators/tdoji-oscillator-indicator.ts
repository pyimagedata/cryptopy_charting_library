import { PanelIndicator, IndicatorOptions, IndicatorRange } from './indicator';
import { BarData } from '../model/data';
import { RemoteCompute, RemoteContext, accessNoticeText, legendIndex, timeIndexMap } from './remote-compute';
import {
    IndicatorSettingsConfig,
    createInputsTab,
    createStyleTab,
    createVisibilityTab,
    numberRow,
    colorRow,
    lineWidthRow,
} from '../gui/indicator_settings';

// Tdoji Osilatör: değerler backend'de hesaplanır (bkz. remote-compute.ts); burada yalnızca çizilir.

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
    color: '#94a3b8',
    lineWidth: 2,
    upColor: '#22c55e',
    downColor: '#ef4444',
    neutralColor: '#2563eb',
    signalColor: '#9ca3af',
    zeroLineColor: '#9ca3af',
};

interface RemoteTdoji {
    times: number[];
    slope: Array<number | null>;
    signal: Array<number | null>;
    state: number[]; // 1: yukarı ivme, -1: aşağı ivme, 0: nötr
}

export class TdojiOscillatorIndicator extends PanelIndicator {
    private _tdojiOptions: TdojiOscillatorOptions;
    private _lineColors: string[] = [];
    private _raw: RemoteTdoji | null = null;
    private _rawIndex: Map<number, number> = new Map();
    private readonly _remote = new RemoteCompute<RemoteTdoji>('tdoji', (raw) => {
        this._raw = raw;
        this._rawIndex = raw ? timeIndexMap(raw.times) : new Map();
        this._rebuild();
    });

    constructor(options: Partial<TdojiOscillatorOptions> = {}) {
        const mergedOptions = { ...defaultTdojiOscillatorOptions, ...options };
        super(mergedOptions);
        this._tdojiOptions = { ...defaultTdojiOscillatorOptions, ...this._options } as TdojiOscillatorOptions;
        this._paneHeight = 120;
    }

    setContext(ctx: RemoteContext): void {
        this._remote.setContext(ctx);
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
        if (key === 'visible') return this._options.visible;
        return (this._tdojiOptions as any)[key];
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = key === 'curveLength' || key === 'slopeLength' || key === 'signalLength';
        Object.assign(this._tdojiOptions, { [key]: value });
        Object.assign(this._options, { [key]: value });
        // Renk değişince çizgi renkleri yeniden kurulur; hesap ayarı değişince calculate() yeniden istek atar.
        if (!needsRecalc) this._rebuild();
        this._dataChanged.fire();
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._remote.request(
            {
                curveLength: this._tdojiOptions.curveLength,
                slopeLength: this._tdojiOptions.slopeLength,
                signalLength: this._tdojiOptions.signalLength,
            },
            () => this._dataChanged.fire()
        );
        this._rebuild();
    }

    /** Ham (zaman damgalı) diziyi mevcut mum dizisine eşler; çizgi renklerini yerel renklerle kurar. */
    private _rebuild(): void {
        this._data = [];
        this._lineColors = [];
        const bars = this._sourceData;
        const raw = this._raw;
        if (!raw || raw.times.length === 0 || bars.length === 0) return;

        for (const bar of bars) {
            const j = this._rawIndex.get(this._toMs(bar.time));
            const slope = j === undefined || raw.slope[j] === null ? NaN : (raw.slope[j] as number);
            const avgSlope = j === undefined || raw.signal[j] === null ? NaN : (raw.signal[j] as number);
            this._data.push({ time: bar.time, value: slope, values: [slope, avgSlope] });

            const state = j === undefined ? 0 : raw.state[j];
            this._lineColors.push(
                state === 1 ? this._tdojiOptions.upColor : state === -1 ? this._tdojiOptions.downColor : this._tdojiOptions.neutralColor
            );
        }
    }

    private _toMs(time: number): number {
        return time > 1e12 ? time : time * 1000;
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
            if (!point) continue;

            const slope = point.values?.[0];
            const signal = point.values?.[1];

            if (slope !== undefined && !isNaN(slope) && isFinite(slope)) {
                min = Math.min(min, slope);
                max = Math.max(max, slope);
            }

            if (signal !== undefined && !isNaN(signal) && isFinite(signal)) {
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
        const denied = accessNoticeText(this._remote, 'Tdoji Oscilator');
        if (denied !== null) return denied;

        const point = this._data[legendIndex(this._data, index)];
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
}
