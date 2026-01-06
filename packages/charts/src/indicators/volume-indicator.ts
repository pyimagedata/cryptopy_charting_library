/**
 * Volume Indicator
 * 
 * Displays the trading volume for each bar as a histogram at the bottom of the main chart.
 */

import { OverlayIndicator, IndicatorOptions, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';

/**
 * Volume indicator options
 */
export interface VolumeIndicatorOptions extends IndicatorOptions {
    upColor: string;
    downColor: string;
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
};

/**
 * Volume Indicator (Overlay type)
 */
export class VolumeIndicator extends OverlayIndicator {
    constructor(options: Partial<VolumeIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultVolumeOptions, ...options };
        super(mergedOptions);
    }

    /**
     * Calculate Volume histogram data
     */
    calculate(sourceData: BarData[]): void {
        this._data = [];
        if (sourceData.length === 0) return;

        for (let i = 0; i < sourceData.length; i++) {
            const bar = sourceData[i];
            const volume = bar.volume || 0;

            // Color sequence: 1 = UP (green), -1 = DOWN (red)
            const direction = bar.close >= bar.open ? 1 : -1;

            this._data.push({
                time: bar.time,
                value: volume,
                values: [direction] // Used by renderer for coloring
            });
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
        return `Vol ${valueStr}`;
    }

    private _formatVolume(vol: number): string {
        if (vol >= 1000000) return (vol / 1000000).toFixed(2) + 'M';
        if (vol >= 1000) return (vol / 1000).toFixed(2) + 'K';
        return vol.toFixed(2);
    }
}
