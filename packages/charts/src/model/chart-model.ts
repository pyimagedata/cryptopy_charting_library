import { TimeScale, TimeScaleOptions } from './time-scale';
import { PriceScale, PriceScaleOptions } from './price-scale';
import { Series } from './series';
import { CandlestickSeries, CandlestickSeriesOptions } from './candlestick-series';
import { LineSeries, LineSeriesOptions } from './line-series';
import { AreaSeries, AreaSeriesOptions } from './area-series';
import { HeikenAshiSeries, HeikenAshiSeriesOptions } from '../series/heiken-ashi-series';
import { Delegate } from '../helpers/delegate';

/**
 * Layout options
 */
export interface LayoutOptions {
    backgroundColor: string;
    textColor: string;
    fontSize: number;
    fontFamily: string;
}

/**
 * Grid options
 */
export interface GridOptions {
    vertLines: {
        visible: boolean;
        color: string;
        style: 'solid' | 'dashed' | 'dotted';
    };
    horzLines: {
        visible: boolean;
        color: string;
        style: 'solid' | 'dashed' | 'dotted';
    };
}

/**
 * Crosshair options
 */
export interface CrosshairOptions {
    mode: 'normal' | 'magnet';
    vertLine: {
        visible: boolean;
        color: string;
        width: number;
        style: 'solid' | 'dashed';
        labelVisible: boolean;
        labelBackgroundColor: string;
    };
    horzLine: {
        visible: boolean;
        color: string;
        width: number;
        style: 'solid' | 'dashed';
        labelVisible: boolean;
        labelBackgroundColor: string;
    };
}

/**
 * Watermark options
 */
export interface WatermarkOptions {
    visible: boolean;
    color: string;
    text: string;
    fontSize: number;
    fontFamily: string;
    align: 'left' | 'center' | 'right';
    vertAlign: 'top' | 'middle' | 'bottom';
}

/**
 * Chart model options
 */
export interface ChartModelOptions {
    width: number;
    height: number;
    layout: LayoutOptions;
    grid: GridOptions;
    crosshair: CrosshairOptions;
    watermark: WatermarkOptions;
    timeScale: Partial<TimeScaleOptions>;
    rightPriceScale: Partial<PriceScaleOptions>;
    leftPriceScale: Partial<PriceScaleOptions>;
}

/**
 * Default chart options - matches original JavaScript design
 */
export const defaultChartOptions: ChartModelOptions = {
    width: 0,
    height: 0,
    layout: {
        backgroundColor: '#1a1a2e',  // Navy background (original)
        textColor: 'rgba(255, 255, 255, 0.7)',
        fontSize: 12,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    grid: {
        vertLines: {
            visible: true,
            color: 'rgba(255, 255, 255, 0.06)',  // Light white grid (original)
            style: 'solid',
        },
        horzLines: {
            visible: true,
            color: 'rgba(255, 255, 255, 0.06)',  // Light white grid (original)
            style: 'solid',
        },
    },
    crosshair: {
        mode: 'magnet',
        vertLine: {
            visible: true,
            color: 'rgba(255, 255, 255, 0.3)',  // Lighter crosshair
            width: 1,
            style: 'dashed',
            labelVisible: true,
            labelBackgroundColor: '#2962ff',     // Blue accent (original)
        },
        horzLine: {
            visible: true,
            color: 'rgba(255, 255, 255, 0.3)',
            width: 1,
            style: 'dashed',
            labelVisible: true,
            labelBackgroundColor: '#2962ff',
        },
    },
    watermark: {
        visible: false,
        color: 'rgba(255, 255, 255, 0.08)',
        text: '',
        fontSize: 48,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        align: 'center',
        vertAlign: 'middle',
    },
    timeScale: {},
    rightPriceScale: {},
    leftPriceScale: {},
};

/**
 * Invalidation reasons
 */
export enum InvalidateReason {
    Layout = 'layout',
    Data = 'data',
    Cursor = 'cursor',
}

/**
 * Chart model - central data/logic layer
 */
export class ChartModel {
    private _options: ChartModelOptions;
    private readonly _timeScale: TimeScale;
    private readonly _rightPriceScale: PriceScale;
    private readonly _leftPriceScale: PriceScale;
    private _serieses: Series[] = [];

    private readonly _invalidated = new Delegate<InvalidateReason>();
    private _crosshairPosition: { x: number; y: number; visible: boolean } | null = null;

    private _symbol: string = '';
    private _timeframe: string = '';

    constructor(options: Partial<ChartModelOptions> = {}) {
        this._options = this._mergeOptions(defaultChartOptions, options);

        this._timeScale = new TimeScale(this._options.timeScale);
        this._rightPriceScale = new PriceScale(this._options.rightPriceScale);
        this._leftPriceScale = new PriceScale(this._options.leftPriceScale);
    }

    setCrosshairPosition(x: number, y: number, visible: boolean): void {
        this._crosshairPosition = { x, y, visible };
        this._invalidated.fire(InvalidateReason.Cursor);
    }

    get crosshairPosition() {
        return this._crosshairPosition;
    }

    setSymbol(symbol: string): void {
        this._symbol = symbol;
        this._updateWatermarkText();
        this._invalidated.fire(InvalidateReason.Data);
    }

    get symbol(): string {
        return this._symbol;
    }

    setTimeframe(timeframe: string): void {
        this._timeframe = timeframe;
        this._updateWatermarkText();
        this._invalidated.fire(InvalidateReason.Data);
    }

    get timeframe(): string {
        return this._timeframe;
    }

    private _updateWatermarkText(): void {
        const text = `${this._symbol} ${this._timeframe}`.trim();
        this._options.watermark.text = text;
    }

    // --- Getters ---

    get options(): Readonly<ChartModelOptions> {
        return this._options;
    }

    get timeScale(): TimeScale {
        return this._timeScale;
    }

    get rightPriceScale(): PriceScale {
        return this._rightPriceScale;
    }

    get leftPriceScale(): PriceScale {
        return this._leftPriceScale;
    }

    get serieses(): readonly Series[] {
        return this._serieses;
    }

    // --- Events ---

    get invalidated(): Delegate<InvalidateReason> {
        return this._invalidated;
    }

    // --- Series management ---

    addCandlestickSeries(options?: Partial<CandlestickSeriesOptions>): CandlestickSeries {
        const series = new CandlestickSeries(options);
        this._addSeries(series);
        return series;
    }

    addLineSeries(options?: Partial<LineSeriesOptions>): LineSeries {
        const series = new LineSeries(options);
        this._addSeries(series);
        return series;
    }

    addAreaSeries(options?: Partial<AreaSeriesOptions>): AreaSeries {
        const series = new AreaSeries(options);
        this._addSeries(series);
        return series;
    }

    addHeikenAshiSeries(options?: Partial<HeikenAshiSeriesOptions>): HeikenAshiSeries {
        const series = new HeikenAshiSeries(this, options);
        this._addSeries(series);
        return series;
    }

    removeSeries(series: Series): void {
        const index = this._serieses.indexOf(series);
        if (index >= 0) {
            this._serieses.splice(index, 1);
            series.destroy();
            this._invalidated.fire(InvalidateReason.Data);
        }
    }

    private _addSeries(series: Series): void {
        this._serieses.push(series);
        series.dataChanged.subscribe(() => this._onSeriesDataChanged());
        this._invalidated.fire(InvalidateReason.Data);
    }

    private _onSeriesDataChanged(): void {
        this._updateTimeScalePoints();
        this._updatePriceRange();
        this._invalidated.fire(InvalidateReason.Data);
    }

    // --- Size management ---

    setSize(width: number, height: number): void {
        this._options.width = width;
        this._options.height = height;

        // Distribute height (for now, single pane)
        const priceScaleHeight = height;
        this._rightPriceScale.setHeight(priceScaleHeight);
        this._leftPriceScale.setHeight(priceScaleHeight);

        this._invalidated.fire(InvalidateReason.Layout);
    }

    setWidth(width: number): void {
        this._timeScale.setWidth(width);
        this._invalidated.fire(InvalidateReason.Layout);
    }

    // --- Updates ---

    private _updateTimeScalePoints(): void {
        // Find max data points across all series
        let maxPoints = 0;
        for (const series of this._serieses) {
            maxPoints = Math.max(maxPoints, series.data.length);
        }
        this._timeScale.setPointsCount(maxPoints);
    }

    private _updatePriceRange(): void {
        const visibleRange = this._timeScale.visibleRange();
        if (!visibleRange) return;

        let min = Infinity;
        let max = -Infinity;

        for (const series of this._serieses) {
            const range = series.getPriceRange(visibleRange.from, visibleRange.to);
            if (range) {
                min = Math.min(min, range.min);
                max = Math.max(max, range.max);
            }
        }

        if (min !== Infinity) {
            this._rightPriceScale.updatePriceRange(min, max);
        }
    }

    recalculateAllPanes(): void {
        this._updatePriceRange();
        this._invalidated.fire(InvalidateReason.Data);
    }

    lightUpdate(): void {
        this._invalidated.fire(InvalidateReason.Cursor);
    }

    fullUpdate(): void {
        this._updateTimeScalePoints();
        this._updatePriceRange();
        this._invalidated.fire(InvalidateReason.Layout);
    }

    // --- Private ---

    private _mergeOptions<T extends object>(defaults: T, overrides: Partial<T>): T {
        const result = { ...defaults };
        for (const key in overrides) {
            if (overrides[key] !== undefined) {
                if (typeof overrides[key] === 'object' && !Array.isArray(overrides[key])) {
                    (result as any)[key] = this._mergeOptions(
                        (defaults as any)[key] || {},
                        overrides[key] as object
                    );
                } else {
                    (result as any)[key] = overrides[key];
                }
            }
        }
        return result;
    }

    // --- Cleanup ---

    destroy(): void {
        for (const series of this._serieses) {
            series.destroy();
        }
        this._serieses = [];
        this._timeScale.destroy();
        this._rightPriceScale.destroy();
        this._leftPriceScale.destroy();
        this._invalidated.destroy();
    }
}
