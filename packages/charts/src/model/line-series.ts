import { LineData } from './data';
import { Series, SeriesType, SeriesOptionsBase } from './series';

/**
 * Line series options
 */
export interface LineSeriesOptions extends SeriesOptionsBase {
    color: string;
    lineWidth: number;
    lineStyle: 'solid' | 'dashed' | 'dotted';
    crosshairMarkerVisible: boolean;
    crosshairMarkerRadius: number;
}

/**
 * Default line options
 */
export const defaultLineOptions: LineSeriesOptions = {
    visible: true,
    priceScaleId: 'right',
    color: '#2962ff',  // Original blue accent
    lineWidth: 2,
    lineStyle: 'solid',
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
};

/**
 * Line series
 */
export class LineSeries extends Series<LineData> {
    private _lineOptions: LineSeriesOptions;

    constructor(options: Partial<LineSeriesOptions> = {}) {
        super(SeriesType.Line, options);
        this._lineOptions = { ...defaultLineOptions, ...options };
        this._options = this._lineOptions;
    }

    get lineOptions(): Readonly<LineSeriesOptions> {
        return this._lineOptions;
    }

    applyOptions(options: Partial<LineSeriesOptions>): void {
        this._lineOptions = { ...this._lineOptions, ...options };
        this._options = this._lineOptions;
    }
}
