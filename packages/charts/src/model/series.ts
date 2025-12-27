import { BarData, LineData, SeriesDataItem, isBarData, isLineData } from './data';
import { PriceScale } from './price-scale';
import { TimeScale } from './time-scale';
import { Coordinate, TimePointIndex } from './coordinate';
import { Delegate } from '../helpers/delegate';

/**
 * Series type enum
 */
export enum SeriesType {
    Candlestick = 'Candlestick',
    Line = 'Line',
    Area = 'Area',
    Bar = 'Bar',
    Histogram = 'Histogram',
}

/**
 * Base series options
 */
export interface SeriesOptionsBase {
    visible: boolean;
    priceScaleId: 'left' | 'right' | string;
}

/**
 * Bar with screen coordinates
 */
export interface BarWithCoordinates {
    index: TimePointIndex;
    x: Coordinate;
    data: BarData | LineData;
    // For candlestick/bar
    openY?: Coordinate;
    highY?: Coordinate;
    lowY?: Coordinate;
    closeY?: Coordinate;
    // For line/area
    y?: Coordinate;
}

/**
 * Abstract series base class
 */
export abstract class Series<TData extends SeriesDataItem = SeriesDataItem> {
    protected _data: TData[] = [];
    protected _options: SeriesOptionsBase;
    protected readonly _type: SeriesType;

    protected readonly _dataChanged = new Delegate<void>();

    constructor(type: SeriesType, options: Partial<SeriesOptionsBase> = {}) {
        this._type = type;
        this._options = {
            visible: true,
            priceScaleId: 'right',
            ...options,
        };
    }

    // --- Getters ---

    get type(): SeriesType {
        return this._type;
    }

    get data(): readonly TData[] {
        return this._data;
    }

    get options(): Readonly<SeriesOptionsBase> {
        return this._options;
    }

    get dataChanged(): Delegate<void> {
        return this._dataChanged;
    }

    // --- Data management ---

    setData(data: TData[]): void {
        this._data = [...data];
        this._dataChanged.fire();
    }

    updateData(data: TData): void {
        // Find existing data point by time
        const index = this._data.findIndex(d => d.time === data.time);
        if (index >= 0) {
            this._data[index] = data;
        } else {
            // Insert in sorted order
            const insertIndex = this._data.findIndex(d => d.time > data.time);
            if (insertIndex >= 0) {
                this._data.splice(insertIndex, 0, data);
            } else {
                this._data.push(data);
            }
        }
        this._dataChanged.fire();
    }

    // --- Price range ---

    /**
     * Get min/max price for visible range
     */
    getPriceRange(from: number, to: number): { min: number; max: number } | null {
        if (this._data.length === 0) return null;

        let min = Infinity;
        let max = -Infinity;

        const startIndex = Math.max(0, Math.floor(from));
        const endIndex = Math.min(this._data.length - 1, Math.ceil(to));

        for (let i = startIndex; i <= endIndex; i++) {
            const item = this._data[i];
            if (isBarData(item)) {
                min = Math.min(min, item.low);
                max = Math.max(max, item.high);
            } else if (isLineData(item)) {
                min = Math.min(min, item.value);
                max = Math.max(max, item.value);
            }
        }

        return min === Infinity ? null : { min, max };
    }

    // --- Coordinate calculation ---

    /**
     * Calculate coordinates for visible bars
     */
    calculateCoordinates(
        timeScale: TimeScale,
        priceScale: PriceScale,
        from: number,
        to: number
    ): BarWithCoordinates[] {
        const result: BarWithCoordinates[] = [];

        const startIndex = Math.max(0, Math.floor(from));
        const endIndex = Math.min(this._data.length - 1, Math.ceil(to));

        for (let i = startIndex; i <= endIndex; i++) {
            const item = this._data[i];
            const x = timeScale.indexToCoordinate(i as TimePointIndex);

            if (isBarData(item)) {
                result.push({
                    index: i as TimePointIndex,
                    x,
                    data: item,
                    openY: priceScale.priceToCoordinate(item.open),
                    highY: priceScale.priceToCoordinate(item.high),
                    lowY: priceScale.priceToCoordinate(item.low),
                    closeY: priceScale.priceToCoordinate(item.close),
                });
            } else if (isLineData(item)) {
                result.push({
                    index: i as TimePointIndex,
                    x,
                    data: item,
                    y: priceScale.priceToCoordinate(item.value),
                });
            }
        }

        return result;
    }

    // --- Abstract methods ---

    abstract applyOptions(options: Partial<SeriesOptionsBase>): void;

    // --- Cleanup ---

    destroy(): void {
        this._dataChanged.destroy();
        this._data = [];
    }
}
