/**
 * RSI (Relative Strength Index) Indicator
 * 
 * A momentum oscillator that measures the speed and change of price movements.
 * RSI oscillates between 0 and 100.
 * 
 * Traditionally:
 * - RSI > 70: Overbought (potential sell signal)
 * - RSI < 30: Oversold (potential buy signal)
 * 
 * Formula:
 * RSI = 100 - (100 / (1 + RS))
 * RS = Average Gain / Average Loss
 */

import { PanelIndicator, IndicatorOptions, IndicatorRange } from './indicator';
import { BarData } from '../model/data';
import {
    IndicatorSettingsConfig,
    createInputsTab,
    createStyleTab,
    createVisibilityTab,
    numberRow,
    colorRow,
    checkboxRow
} from '../gui/indicator_settings';

/**
 * RSI indicator options
 */
export interface RSIIndicatorOptions extends IndicatorOptions {
    period: number;           // RSI period (default: 14)
    overboughtLevel: number;  // Overbought threshold (default: 70)
    oversoldLevel: number;    // Oversold threshold (default: 30)
    overboughtColor: string;  // Color for overbought line
    oversoldColor: string;    // Color for oversold line
    showLevels: boolean;      // Show overbought/oversold lines
}

/**
 * Default RSI options
 */
const defaultRSIOptions: Partial<RSIIndicatorOptions> = {
    name: 'RSI',
    period: 14,
    overboughtLevel: 70,
    oversoldLevel: 30,
    overboughtColor: 'rgba(239, 83, 80, 0.5)',   // Red
    oversoldColor: 'rgba(38, 166, 154, 0.5)',    // Green
    showLevels: true,
    color: '#9c27b0',  // Purple - distinctive for RSI
    lineWidth: 2,
};

/**
 * RSI Indicator
 */
export class RSIIndicator extends PanelIndicator {
    private _rsiOptions: RSIIndicatorOptions;

    constructor(options: Partial<RSIIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultRSIOptions, ...options };
        mergedOptions.name = `RSI (${mergedOptions.period})`;
        super(mergedOptions);
        this._rsiOptions = { ...defaultRSIOptions, ...this._options } as RSIIndicatorOptions;
        this._paneHeight = 100; // Default height for RSI pane
    }

    // --- Getters ---

    get period(): number {
        return this._rsiOptions.period;
    }

    get overboughtLevel(): number {
        return this._rsiOptions.overboughtLevel;
    }

    get oversoldLevel(): number {
        return this._rsiOptions.oversoldLevel;
    }

    get rsiOptions(): RSIIndicatorOptions {
        return this._rsiOptions;
    }

    /**
     * Update RSI options dynamically
     * Returns true if recalculation is needed (e.g., period changed)
     */
    updateOptions(newOptions: Partial<RSIIndicatorOptions>): boolean {
        const needsRecalc = newOptions.period !== undefined && newOptions.period !== this._rsiOptions.period;

        // Update options
        Object.assign(this._rsiOptions, newOptions);
        Object.assign(this._options, newOptions);

        // Update name if period changed
        if (newOptions.period !== undefined) {
            this._rsiOptions.name = `RSI (${this._rsiOptions.period})`;
            this._options.name = this._rsiOptions.name;
        }

        // Fire change event
        this._dataChanged.fire();

        return needsRecalc;
    }

    // --- Settings Configuration ---

    /**
     * Get settings configuration for the modal
     */
    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    rows: [
                        numberRow('period', 'RSI Length', 1, 100, 1),
                    ]
                }]),
                createStyleTab([{
                    title: 'RSI Line',
                    rows: [
                        colorRow('color', 'Line Color'),
                        numberRow('lineWidth', 'Line Width', 1, 5, 1),
                    ]
                }, {
                    title: 'Levels',
                    rows: [
                        numberRow('overboughtLevel', 'Overbought', 50, 100, 1),
                        colorRow('overboughtColor', 'Overbought Color'),
                        numberRow('oversoldLevel', 'Oversold', 0, 50, 1),
                        colorRow('oversoldColor', 'Oversold Color'),
                        checkboxRow('showLevels', 'Show Levels', true),
                    ]
                }]),
                createVisibilityTab()
            ]
        };
    }

    /**
     * Get setting value by key
     */
    getSettingValue(key: string): any {
        return (this._rsiOptions as any)[key];
    }

    /**
     * Set setting value by key
     */
    setSettingValue(key: string, value: any): boolean {
        return this.updateOptions({ [key]: value } as any);
    }

    // --- Abstract implementations ---

    /**
     * Calculate RSI values from source data
     */
    calculate(sourceData: BarData[]): void {
        this._data = [];

        if (sourceData.length < this._rsiOptions.period + 1) {
            return;
        }

        const period = this._rsiOptions.period;
        const closes = sourceData.map(d => d.close);

        // Calculate price changes
        const changes: number[] = [];
        for (let i = 1; i < closes.length; i++) {
            changes.push(closes[i] - closes[i - 1]);
        }

        // Separate gains and losses
        const gains = changes.map(c => c > 0 ? c : 0);
        const losses = changes.map(c => c < 0 ? Math.abs(c) : 0);

        // Calculate initial average gain and loss (SMA)
        let avgGain = 0;
        let avgLoss = 0;
        for (let i = 0; i < period; i++) {
            avgGain += gains[i];
            avgLoss += losses[i];
        }
        avgGain /= period;
        avgLoss /= period;

        // First RSI value (at index = period)
        // Formula: 100 - (100 / (1 + RS)) is mathematically same as (100 * avgGain) / (avgGain + avgLoss)
        // but the latter is more stable for zero-loss cases.
        let rsi = (avgGain + avgLoss) === 0 ? 50 : (100 * avgGain) / (avgGain + avgLoss);

        // Add null values for indices before RSI can be calculated
        for (let i = 0; i < period; i++) {
            this._data.push({
                time: sourceData[i].time,
                value: NaN,
            });
        }

        // Add first RSI value
        this._data.push({
            time: sourceData[period].time,
            value: rsi,
        });

        // Calculate subsequent RSI values using Wilder's smoothing (RMA)
        // TradingView RMA: Alpha = 1/period
        for (let i = period; i < changes.length; i++) {
            // Smooth average gain and loss using Wilder's method
            avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
            avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;

            const total = avgGain + avgLoss;
            rsi = total === 0 ? 50 : (100 * avgGain) / total;

            this._data.push({
                time: sourceData[i + 1].time,
                value: rsi,
            });
        }
    }

    /**
     * RSI has a fixed range of 0-100
     */
    getRange(): IndicatorRange {
        return {
            min: 0,
            max: 100,
            fixedMin: 0,
            fixedMax: 100,
        };
    }

    /**
     * Get description for legend
     */
    getDescription(index?: number): string {
        let value = NaN;

        if (index !== undefined && index >= 0 && index < this._data.length) {
            value = this._data[index].value;
        } else if (this._data.length > 0) {
            value = this._data[this._data.length - 1].value;
        }

        const valueStr = isNaN(value) ? '-' : value.toFixed(2);
        return `RSI(${this._rsiOptions.period}): ${valueStr}`;
    }

    /**
     * Get RSI level lines for rendering
     */
    getLevelLines(): { y: number; color: string; label: string }[] {
        if (!this._rsiOptions.showLevels) return [];

        return [
            {
                y: this._rsiOptions.overboughtLevel,
                color: this._rsiOptions.overboughtColor,
                label: this._rsiOptions.overboughtLevel.toString()
            },
            {
                y: 50,
                color: 'rgba(255, 255, 255, 0.2)',
                label: '50'
            },
            {
                y: this._rsiOptions.oversoldLevel,
                color: this._rsiOptions.oversoldColor,
                label: this._rsiOptions.oversoldLevel.toString()
            },
        ];
    }

    /**
     * Check if current RSI is overbought
     */
    isOverbought(): boolean {
        if (this._data.length === 0) return false;
        const lastValue = this._data[this._data.length - 1].value;
        return !isNaN(lastValue) && lastValue > this._rsiOptions.overboughtLevel;
    }

    /**
     * Check if current RSI is oversold
     */
    isOversold(): boolean {
        if (this._data.length === 0) return false;
        const lastValue = this._data[this._data.length - 1].value;
        return !isNaN(lastValue) && lastValue < this._rsiOptions.oversoldLevel;
    }
}
