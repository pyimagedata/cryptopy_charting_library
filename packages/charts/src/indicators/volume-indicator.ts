/**
 * Volume Indicator
 *
 * Displays the trading volume for each bar as a histogram at the bottom of the main chart.
 * Optionally overlays a moving average of volume (SMA/EMA/WMA), toggleable and configurable
 * from the indicator's settings.
 */

import { OverlayIndicator, IndicatorOptions, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import {
    IndicatorSettingsConfig,
    createInputsTab,
    createStyleTab,
    createVisibilityTab,
    numberRow,
    colorRow,
    checkboxRow,
    selectRow,
} from '../gui/indicator_settings';

export type VolumeMAType = 'sma' | 'ema' | 'wma';

/**
 * Volume indicator options
 */
export interface VolumeIndicatorOptions extends IndicatorOptions {
    upColor: string;
    downColor: string;
    showMA: boolean;
    maType: VolumeMAType;
    maPeriod: number;
    maColor: string;
}

/**
 * Default Volume options
 */
const defaultVolumeOptions: Partial<VolumeIndicatorOptions> = {
    name: 'Volume',
    upColor: 'rgba(38, 166, 154, 0.5)',   // Green
    downColor: 'rgba(239, 83, 80, 0.5)', // Red
    color: '#787b86',
    lineWidth: 1,
    style: IndicatorStyle.Histogram,
    showMA: false,
    maType: 'sma',
    maPeriod: 20,
    maColor: '#f59e0b',
};

/**
 * Volume Indicator (Overlay type)
 */
export class VolumeIndicator extends OverlayIndicator {
    private _volumeOptions: VolumeIndicatorOptions;

    constructor(options: Partial<VolumeIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultVolumeOptions, ...options };
        super(mergedOptions);
        this._volumeOptions = { ...defaultVolumeOptions, ...this._options } as VolumeIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._volumeOptions };
    }

    updateOptions(newOptions: Partial<VolumeIndicatorOptions>): boolean {
        const needsRecalc =
            (newOptions.maType !== undefined && newOptions.maType !== this._volumeOptions.maType) ||
            (newOptions.maPeriod !== undefined && newOptions.maPeriod !== this._volumeOptions.maPeriod);

        Object.assign(this._volumeOptions, newOptions);
        Object.assign(this._options, newOptions);

        this._dataChanged.fire();
        return needsRecalc;
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<VolumeIndicatorOptions>);
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        return needsRecalc;
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    title: 'Volume MA',
                    rows: [
                        checkboxRow('showMA', 'Show Moving Average', false),
                        selectRow('maType', 'MA Type', [
                            { value: 'sma', label: 'SMA' },
                            { value: 'ema', label: 'EMA' },
                            { value: 'wma', label: 'WMA' },
                        ], 'sma'),
                        numberRow('maPeriod', 'MA Length', 1, 200, 1),
                    ],
                }]),
                createStyleTab([{
                    title: 'Volume Bars',
                    rows: [
                        colorRow('upColor', 'Up Color'),
                        colorRow('downColor', 'Down Color'),
                    ],
                }, {
                    title: 'MA Line',
                    rows: [
                        colorRow('maColor', 'MA Color'),
                        numberRow('lineWidth', 'MA Line Width', 1, 5, 1),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    /**
     * Calculate Volume histogram data (+ optional volume moving average)
     */
    calculate(sourceData: BarData[]): void {
        this._data = [];
        if (sourceData.length === 0) return;

        const volumes = sourceData.map(bar => bar.volume || 0);
        const maValues = this._volumeOptions.showMA
            ? this._calculateMA(volumes, this._volumeOptions.maPeriod, this._volumeOptions.maType)
            : null;

        for (let i = 0; i < sourceData.length; i++) {
            const bar = sourceData[i];
            const volume = volumes[i];

            // Color sequence: 1 = UP (green), -1 = DOWN (red)
            const direction = bar.close >= bar.open ? 1 : -1;

            this._data.push({
                time: bar.time,
                value: volume,
                // values[0] = direction (used by the histogram renderer for coloring),
                // values[1] = volume MA (NaN when disabled or still in warmup period).
                values: [direction, maValues ? maValues[i] : NaN],
            });
        }
    }

    private _calculateMA(values: number[], period: number, type: VolumeMAType): number[] {
        const n = values.length;
        const result = new Array(n).fill(NaN);
        const p = Math.max(1, period);
        if (n < p) return result;

        switch (type) {
            case 'ema': {
                const k = 2 / (p + 1);
                let sum = 0;
                for (let i = 0; i < p; i++) sum += values[i];
                let prevEma = sum / p;
                result[p - 1] = prevEma;
                for (let i = p; i < n; i++) {
                    prevEma = values[i] * k + prevEma * (1 - k);
                    result[i] = prevEma;
                }
                return result;
            }
            case 'wma': {
                const denom = (p * (p + 1)) / 2;
                for (let i = p - 1; i < n; i++) {
                    let weightedSum = 0;
                    for (let j = 0; j < p; j++) {
                        weightedSum += values[i - j] * (p - j);
                    }
                    result[i] = weightedSum / denom;
                }
                return result;
            }
            case 'sma':
            default: {
                let sum = 0;
                for (let i = 0; i < p; i++) sum += values[i];
                result[p - 1] = sum / p;
                for (let i = p; i < n; i++) {
                    sum += values[i] - values[i - p];
                    result[i] = sum / p;
                }
                return result;
            }
        }
    }

    getDescription(index?: number): string {
        let value = NaN;
        if (index !== undefined && index >= 0 && index < this._data.length) {
            value = this._data[index].value;
        } else if (this._data.length > 0) {
            value = this._data[this._data.length - 1].value;
        }

        const valueStr = isNaN(value) ? '-' : this._formatVolume(value);
        let desc = `Vol ${valueStr}`;

        if (this._volumeOptions.showMA) {
            const maPoint = index !== undefined
                ? this._data[index]
                : this._data[this._data.length - 1];
            const maValue = maPoint?.values?.[1];
            if (maValue !== undefined && !isNaN(maValue)) {
                desc += ` ${this._volumeOptions.maType.toUpperCase()}(${this._volumeOptions.maPeriod}) ${this._formatVolume(maValue)}`;
            }
        }

        return desc;
    }

    private _formatVolume(vol: number): string {
        if (vol >= 1000000) return (vol / 1000000).toFixed(2) + 'M';
        if (vol >= 1000) return (vol / 1000).toFixed(2) + 'K';
        return vol.toFixed(2);
    }

    /**
     * Custom overlay draw: histogram bars (same as the generic renderer would
     * produce) plus, if enabled, a volume moving-average line scaled to the
     * same reduced height band the histogram uses.
     */
    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        _priceScale: any,
        hpr: number,
        vpr: number,
        visibleRange: { from: number; to: number }
    ): void {
        const data = this._data;
        if (data.length === 0) return;

        const startIndex = Math.max(0, Math.floor(visibleRange.from));
        const endIndex = Math.min(data.length - 1, Math.ceil(visibleRange.to));

        const h = ctx.canvas.height / vpr;
        const volumeHeightRatio = 0.15;
        const barWidth = 0.8 * timeScale.barSpacing;

        const upColor = this._volumeOptions.upColor;
        const downColor = this._volumeOptions.downColor;

        let maxVal = -Infinity;
        for (let i = startIndex; i <= endIndex; i++) {
            const val = data[i]?.value;
            if (val !== undefined && !isNaN(val) && val > maxVal) maxVal = val;
        }
        if (maxVal <= 0) maxVal = 1;

        const valueToY = (value: number) => h - (value / maxVal) * (h * volumeHeightRatio);

        for (let i = startIndex; i <= endIndex; i++) {
            const point = data[i];
            if (point === undefined || point.value === undefined || isNaN(point.value) || point.value === 0) continue;

            const x = timeScale.indexToCoordinate(i as any) * hpr;
            const barHeight = (point.value / maxVal) * (h * volumeHeightRatio);
            const y = h - barHeight;

            ctx.fillStyle = (point.values && point.values[0] === -1) ? downColor : upColor;
            ctx.fillRect(
                x - (barWidth / 2) * hpr,
                y * vpr,
                barWidth * hpr,
                barHeight * vpr
            );
        }

        if (this._volumeOptions.showMA) {
            ctx.save();
            ctx.strokeStyle = this._volumeOptions.maColor;
            ctx.lineWidth = this._volumeOptions.lineWidth * hpr;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();

            let started = false;
            for (let i = startIndex; i <= endIndex; i++) {
                const maValue = data[i]?.values?.[1];
                if (maValue === undefined || isNaN(maValue)) {
                    started = false;
                    continue;
                }

                const x = timeScale.indexToCoordinate(i as any) * hpr;
                const y = valueToY(maValue) * vpr;

                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }

            ctx.stroke();
            ctx.restore();
        }
    }
}
