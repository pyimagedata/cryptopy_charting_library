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
import { IndicatorLegendInfo, legendTitleFromName } from './legend-info';
import { IntervalsVisibilities, ParsedTimeframe, isVisibleOnTimeframe, normalizeIntervalsVisibilities, parseTimeframe } from '../drawings/intervals-visibility';

export type { IndicatorLegendInfo, LegendPlot } from './legend-info';

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
 * Indicator plot style
 */
export enum IndicatorStyle {
    Line = 'line',
    Dots = 'dots',
    Histogram = 'histogram',
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
    style: IndicatorStyle;  // Plot style (line, dots, etc.)
    /** Legend value decimals (undefined = adaptive "Default") */
    precision?: number;
    /** Intervals the indicator is shown on (undefined = all); same model as drawings */
    intervalsVisibilities?: IntervalsVisibilities;
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
    style: IndicatorStyle.Line,
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
    protected _theme: 'dark' | 'light' = 'dark';
    private _parsedTimeframe: ParsedTimeframe | null = null;

    constructor(options: Partial<IndicatorOptions> = {}) {
        this._options = { ...defaultIndicatorOptions, ...options };
        if (!this._options.id) {
            this._options.id = `${this._options.name}_${Date.now()}`;
        }
    }

    /**
     * Chart theme, pushed down by IndicatorManager. Indicators that paint their own
     * text (labels, plates, callouts) need it: a plate hardcoded to black is
     * invisible on a light chart, and vice versa.
     */
    setTheme(theme: 'dark' | 'light'): void {
        this._theme = theme;
    }

    get theme(): 'dark' | 'light' {
        return this._theme;
    }

    protected get isDark(): boolean {
        return this._theme === 'dark';
    }

    /** Backing plate colour for on-canvas text, readable in either theme. */
    protected plateColor(alpha: number = 0.55): string {
        return this.isDark ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha + 0.25})`;
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

    /**
     * Drawn right now: the user flag (eye) AND the current chart interval is inside the
     * indicator's "visibility on intervals" settings. Render / hit-test paths use this;
     * `visible` stays the eye state shown in the legend.
     */
    get shown(): boolean {
        if (!this._options.visible) return false;
        return isVisibleOnTimeframe(this._options.intervalsVisibilities, this._parsedTimeframe);
    }

    /** The current chart interval is outside the "visibility on intervals" settings (eye state ignored) */
    get hiddenByInterval(): boolean {
        return !isVisibleOnTimeframe(this._options.intervalsVisibilities, this._parsedTimeframe);
    }

    /** Chart timeframe, pushed down by the chart widget (drives `shown`) */
    setTimeframe(timeframe: string): void {
        this._parsedTimeframe = parseTimeframe(timeframe);
    }

    // --- Settings Provider Methods (IndicatorSettingsProvider interface) ---

    /**
     * Get settings configuration - auto-generates from options
     * Subclasses can override for custom settings UI
     */
    getSettingsConfig(): any {
        const inputRows: any[] = [];
        const styleRows: any[] = [];

        // Get all options from the indicator
        const allOptions = this._getAllOptions();

        for (const [key, value] of Object.entries(allOptions)) {
            // Skip internal/readonly options and the ones the dialog handles itself
            if (['id', 'name', 'type', 'visible', 'style', 'precision', 'intervalsVisibilities'].includes(key)) continue;

            if (typeof value === 'number') {
                const lower = key.toLowerCase();
                const step = Number.isInteger(value) ? 1 : 0.01;
                if (lower.includes('width')) {
                    styleRows.push({ type: 'lineWidth', key, label: 'Line Width', min: 1, max: 4 });
                } else if (lower.includes('period') || lower.includes('length')) {
                    inputRows.push({ type: 'number', key, label: this._formatLabel(key), min: 1, max: 500, step: 1 });
                } else if (lower.includes('level')) {
                    inputRows.push({ type: 'number', key, label: this._formatLabel(key), min: 0, max: 100, step: 1 });
                } else {
                    inputRows.push({ type: 'number', key, label: this._formatLabel(key), step });
                }
            } else if (key === 'source' && typeof value === 'string') {
                inputRows.push({
                    type: 'select', key, label: 'Source', defaultValue: value,
                    options: ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'].map(v => ({ value: v, label: v })),
                });
            } else if (typeof value === 'string' && (value.startsWith('#') || value.startsWith('rgb'))) {
                styleRows.push({ type: 'color', key, label: key === 'color' ? 'Line Color' : this._formatLabel(key), defaultValue: value });
            } else if (typeof value === 'boolean') {
                inputRows.push({ type: 'checkbox', key, label: this._formatLabel(key), defaultValue: value });
            }
        }

        // Main colour first, its width right after it (the dialog folds them into one row)
        const order = (r: any) => (r.key === 'color' ? 0 : r.type === 'lineWidth' ? 1 : 2);
        styleRows.sort((a, b) => order(a) - order(b));

        return {
            name: this.name,
            tabs: [
                { id: 'inputs', label: 'Inputs', sections: [{ rows: inputRows }] },
                { id: 'style', label: 'Style', sections: [{ rows: styleRows }] },
            ]
        };
    }

    // --- Common settings (every indicator): precision + visibility on intervals ---

    getCommonSetting(key: string): any {
        return (this._options as any)[key];
    }

    setCommonSetting(key: string, value: any): void {
        if (key === 'intervalsVisibilities') {
            (this._options as any)[key] = value ? normalizeIntervalsVisibilities(value) : undefined;
        } else {
            (this._options as any)[key] = value;
        }
        this._dataChanged.fire();
    }

    /** The Precision select applies to indicators that print plot values in the legend */
    supportsPrecision(): boolean {
        try {
            return this.getLegendInfo().plots.some(p => p.text === undefined);
        } catch {
            return false;
        }
    }

    /** Recompute from the current source data (live settings apply) */
    recalculate(): void {
        if (this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        this._dataChanged.fire();
    }

    /**
     * Get all options including subclass-specific options
     */
    protected _getAllOptions(): Record<string, any> {
        return { ...this._options };
    }

    /**
     * Format key to readable label (e.g., 'lineWidth' -> 'Line Width')
     */
    private _formatLabel(key: string): string {
        return key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }

    /**
     * Get setting value by key
     */
    getSettingValue(key: string): any {
        // Gorunurluk icin tek dogru kaynak _options: goz simgesi (setVisible) sadece
        // onu gunceller. Alt siniflarin tuttugu ayar kopyasi (ör. _optionsEx) eski
        // kalabiliyordu; ayarlar penceresi "Tamam"da bu eski degeri geri yazip
        // indikatoru gizliyordu (gizliyken kaydedilip sonra gozle acilan durum).
        if (key === 'visible') return this._options.visible;
        const allOptions = this._getAllOptions();
        return allOptions[key];
    }

    /**
     * Set setting value by key
     * @returns true if the change requires a recalculation (e.g. period change)
     */
    setSettingValue(key: string, value: any): boolean {
        const oldValue = (this._options as any)[key];
        if (oldValue === value) return false;

        // Update options
        (this._options as any)[key] = value;

        // Determine if recalculation is needed (default: any number change is usually a recalc)
        // Subclasses can override this logic or the whole method
        const needsRecalc = typeof value === 'number' &&
            (key.toLowerCase().includes('period') ||
                key.toLowerCase().includes('length') ||
                key.toLowerCase().includes('source') ||
                key.toLowerCase().includes('dev'));

        // Recalculate if needed and we have data
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }

        this._dataChanged.fire();
        return needsRecalc;
    }

    /**
     * Legend row model (title, parameters, per-plot values at `index`).
     * `index` is the bar index under the crosshair; null/undefined means the last bar.
     * The default shows only the name; indicators with plain numeric plots override it.
     */
    getLegendInfo(_index?: number | null): IndicatorLegendInfo {
        return { title: legendTitleFromName(this.name), params: [], plots: [] };
    }

    // --- Abstract methods ---

    /**
     * Calculate indicator values from source OHLC data
     */
    abstract calculate(sourceData: BarData[]): void;

    /**
     * Get the value range for this indicator (used for panel indicators)
     */
    abstract getRange(visibleRange?: { from: number; to: number } | null): IndicatorRange;

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
    getRange(visibleRange?: { from: number; to: number } | null): IndicatorRange {
        if (this._data.length === 0) {
            return { min: 0, max: 100 };
        }

        let min = Infinity;
        let max = -Infinity;

        const startIndex = visibleRange ? Math.max(0, Math.floor(visibleRange.from)) : 0;
        const endIndex = visibleRange ? Math.min(this._data.length - 1, Math.ceil(visibleRange.to)) : this._data.length - 1;

        for (let i = startIndex; i <= endIndex; i++) {
            const point = this._data[i];
            if (point && !isNaN(point.value) && isFinite(point.value)) {
                if (point.value < min) min = point.value;
                if (point.value > max) max = point.value;
            }
        }

        if (min === Infinity || max === -Infinity) {
            return { min: 0, max: 100 };
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
