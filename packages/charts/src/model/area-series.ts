import { LineData } from './data';
import { Series, SeriesType, SeriesOptionsBase } from './series';

/**
 * Area series options
 */
export interface AreaSeriesOptions extends SeriesOptionsBase {
    topColor: string;
    bottomColor: string;
    lineColor: string;
    lineWidth: number;
}

/**
 * Default area options
 */
export const defaultAreaOptions: AreaSeriesOptions = {
    visible: true,
    priceScaleId: 'right',
    topColor: 'rgba(41, 98, 255, 0.5)',     // Original blue accent
    bottomColor: 'rgba(41, 98, 255, 0.0)',
    lineColor: '#2962ff',
    lineWidth: 2,
};

/**
 * Area series (line with gradient fill)
 */
export class AreaSeries extends Series<LineData> {
    private _areaOptions: AreaSeriesOptions;

    constructor(options: Partial<AreaSeriesOptions> = {}) {
        super(SeriesType.Area, options);
        this._areaOptions = { ...defaultAreaOptions, ...options };
        this._options = this._areaOptions;
    }

    get areaOptions(): Readonly<AreaSeriesOptions> {
        return this._areaOptions;
    }

    applyOptions(options: Partial<AreaSeriesOptions>): void {
        this._areaOptions = { ...this._areaOptions, ...options };
        this._options = this._areaOptions;
    }
}
