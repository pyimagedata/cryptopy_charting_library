import { PanelIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
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

// Thunderbirdx: değerler backend'de hesaplanır (bkz. remote-compute.ts); burada yalnızca çizilir.

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

interface RemoteThunderbirdx {
    times: number[];
    hist: Array<number | null>;
    delta: Array<number | null>;
    ma: Array<number | null>;
    hist_class: number[]; // 1 yukarı güçlü, 2 yukarı zayıf, 3 aşağı güçlü, 4 aşağı zayıf
    fill_class: number[]; // 0 nötr, 1 boğa, 2 ayı
}

export class ThunderbirdxIndicator extends PanelIndicator {
    private _tbxOptions: ThunderbirdxIndicatorOptions;
    private _histogram: number[] = [];
    private _histogramColors: string[] = [];
    private _fillColors: string[] = [];
    public readonly isHistogram = true;
    private _raw: RemoteThunderbirdx | null = null;
    private _rawIndex: Map<number, number> = new Map();
    private readonly _remote = new RemoteCompute<RemoteThunderbirdx>('thunderbirdx', (raw) => {
        this._raw = raw;
        this._rawIndex = raw ? timeIndexMap(raw.times) : new Map();
        this._rebuild();
    });

    constructor(options: Partial<ThunderbirdxIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultThunderbirdxOptions, ...options };
        super(mergedOptions);
        this._tbxOptions = { ...defaultThunderbirdxOptions, ...this._options } as ThunderbirdxIndicatorOptions;
        this._paneHeight = 140;
    }

    setContext(ctx: RemoteContext): void {
        this._remote.setContext(ctx);
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
        // Renk ayarları yerelde yeniden uygulanır; hesap ayarı değişince calculate() yeniden istek atar.
        if (!needsRecalc) this._rebuild();
        this._dataChanged.fire();
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        const o = this._tbxOptions;
        this._remote.request(
            {
                postSmoothingStyle: o.postSmoothingStyle,
                maStyle: o.maStyle,
                momentumLength: o.momentumLength,
                momentumSmoothing: o.momentumSmoothing,
                postSmoothing: o.postSmoothing,
                maLength: o.maLength,
            },
            () => this._dataChanged.fire()
        );
        this._rebuild();
    }

    /** Ham (zaman damgalı) diziyi mevcut mum dizisine eşler; renkleri yerel ayarlarla kurar. */
    private _rebuild(): void {
        this._data = [];
        this._histogram = [];
        this._histogramColors = [];
        this._fillColors = [];
        const bars = this._sourceData;
        const raw = this._raw;
        if (!raw || raw.times.length === 0 || bars.length === 0) return;

        const o = this._tbxOptions;
        const histColors = [o.histUpStrong, o.histUpStrong, o.histUpWeak, o.histDownStrong, o.histDownWeak];
        const neutral = withAlpha(o.neutralFillColor, o.fillOpacity);
        const fills = [neutral, withAlpha(o.positiveFillColor, o.fillOpacity), withAlpha(o.negativeFillColor, o.fillOpacity)];

        for (const bar of bars) {
            const j = this._rawIndex.get(bar.time > 1e12 ? bar.time : bar.time * 1000);
            const hist = j === undefined || raw.hist[j] === null ? NaN : (raw.hist[j] as number);
            const delta = j === undefined || raw.delta[j] === null ? NaN : (raw.delta[j] as number);
            const ma = j === undefined || raw.ma[j] === null ? NaN : (raw.ma[j] as number);

            this._histogram.push(hist);
            this._histogramColors.push(j === undefined ? o.histUpStrong : (histColors[raw.hist_class[j]] ?? o.histUpStrong));
            this._fillColors.push(j === undefined ? neutral : (fills[raw.fill_class[j]] ?? neutral));
            this._data.push({ time: bar.time, value: hist, values: [delta, ma] });
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
            if (!point) continue;

            const values = point.values ?? [];
            const hist = this._histogram[i];
            for (const value of [hist, ...values]) {
                if (value !== undefined && !isNaN(value) && isFinite(value)) {
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
        const denied = accessNoticeText(this._remote, 'Thunderbirdx');
        if (denied !== null) return denied;

        const dataIndex = legendIndex(this._data, index);
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
