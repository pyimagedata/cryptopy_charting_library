/**
 * Base Indicator System
 * 
 * This module provides the foundation for all technical indicators.
 * Indicators can be either:
 * - Overlay: Drawn on top of the main price chart (e.g., EMA, Bollinger Bands)
 * - Panel: Drawn in a separate pane below the main chart (e.g., RSI, MACD)
 */

import { BarData } from '../model/data';
import { Delegate } from '../helpers/delegate';

/**
 * Indicator data point
 */
export interface IndicatorDataPoint {
    time: number;
    value: number;
    values?: number[];  // For multi-line indicators like MACD
}

/**
 * Indicator type
 */
export enum IndicatorType {
    Overlay = 'overlay',   // Drawn on main chart
    Panel = 'panel',       // Drawn in separate pane
}

/**
 * Base indicator options
 */
export interface IndicatorOptions {
    id: string;
    name: string;
    type: IndicatorType;
    visible: boolean;
    color: string;
    lineWidth: number;
}

/**
 * Default indicator options
 */
export const defaultIndicatorOptions: IndicatorOptions = {
    id: '',
    name: 'Indicator',
    type: IndicatorType.Overlay,
    visible: true,
    color: '#2962ff',
    lineWidth: 2,
};

/**
 * Indicator value range (for panel indicators)
 */
export interface IndicatorRange {
    min: number;
    max: number;
    fixedMin?: number;  // Fixed minimum (e.g., 0 for RSI)
    fixedMax?: number;  // Fixed maximum (e.g., 100 for RSI)
}

/**
 * Abstract base class for all indicators
 */
export abstract class Indicator {
    protected _options: IndicatorOptions;
    protected _data: IndicatorDataPoint[] = [];
    protected _sourceData: BarData[] = [];
    protected readonly _dataChanged = new Delegate<void>();

    constructor(options: Partial<IndicatorOptions> = {}) {
        this._options = { ...defaultIndicatorOptions, ...options };
        if (!this._options.id) {
            this._options.id = `${this._options.name}_${Date.now()}`;
        }
    }

    // --- Getters ---

    get dataChanged(): Delegate<void> {
        return this._dataChanged;
    }

    get id(): string {
        return this._options.id;
    }

    get name(): string {
        return this._options.name;
    }

    get type(): IndicatorType {
        return this._options.type;
    }

    get options(): Readonly<IndicatorOptions> {
        return this._options;
    }

    get data(): readonly IndicatorDataPoint[] {
        return this._data;
    }

    get visible(): boolean {
        return this._options.visible;
    }

    // --- Abstract methods ---

    /**
     * Calculate indicator values from source OHLC data
     */
    abstract calculate(sourceData: BarData[]): void;

    /**
     * Get the value range for this indicator (used for panel indicators)
     */
    abstract getRange(): IndicatorRange;

    /**
     * Get short description for legend
     */
    abstract getDescription(index?: number): string;

    // --- Methods ---

    /**
     * Update source data and recalculate
     */
    setData(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this.calculate(sourceData);
        this._dataChanged.fire();
    }

    /**
     * Show/hide indicator
     */
    setVisible(visible: boolean): void {
        this._options.visible = visible;
        this._dataChanged.fire();
    }

    /**
     * Update options
     */
    applyOptions(options: Partial<IndicatorOptions>): void {
        this._options = { ...this._options, ...options };
        this._dataChanged.fire();
    }

    /**
     * Get value at a specific index
     */
    getValueAt(index: number): IndicatorDataPoint | null {
        if (index >= 0 && index < this._data.length) {
            return this._data[index];
        }
        return null;
    }

    /**
     * Cleanup
     */
    destroy(): void {
        this._data = [];
        this._sourceData = [];
        this._dataChanged.destroy();
    }
}

/**
 * Overlay indicator - drawn on top of main price chart
 */
export abstract class OverlayIndicator extends Indicator {
    constructor(options: Partial<IndicatorOptions> = {}) {
        super({ ...options, type: IndicatorType.Overlay });
    }

    /**
     * Overlay indicators use the main price scale range
     */
    getRange(): IndicatorRange {
        if (this._data.length === 0) {
            return { min: 0, max: 100 };
        }

        let min = Infinity;
        let max = -Infinity;

        for (const point of this._data) {
            if (point.value < min) min = point.value;
            if (point.value > max) max = point.value;
        }

        return { min, max };
    }
}

/**
 * Panel indicator - drawn in a separate pane below main chart
 */
export abstract class PanelIndicator extends Indicator {
    protected _paneHeight: number = 100;

    constructor(options: Partial<IndicatorOptions> = {}) {
        super({ ...options, type: IndicatorType.Panel });
    }

    get paneHeight(): number {
        return this._paneHeight;
    }

    setPaneHeight(height: number): void {
        this._paneHeight = height;
    }
}
