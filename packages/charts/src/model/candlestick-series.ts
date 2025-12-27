import { BarData } from './data';
import { Series, SeriesType, SeriesOptionsBase } from './series';

/**
 * Candlestick series options
 */
export interface CandlestickSeriesOptions extends SeriesOptionsBase {
    upColor: string;
    downColor: string;
    borderUpColor: string;
    borderDownColor: string;
    wickUpColor: string;
    wickDownColor: string;
    borderVisible: boolean;
    wickVisible: boolean;
}

/**
 * Default candlestick options
 */
export const defaultCandlestickOptions: CandlestickSeriesOptions = {
    visible: true,
    priceScaleId: 'right',
    upColor: '#26a69a',
    downColor: '#ef5350',
    borderUpColor: '#26a69a',
    borderDownColor: '#ef5350',
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350',
    borderVisible: true,
    wickVisible: true,
};

/**
 * Candlestick series
 */
export class CandlestickSeries extends Series<BarData> {
    private _candleOptions: CandlestickSeriesOptions;

    constructor(options: Partial<CandlestickSeriesOptions> = {}) {
        super(SeriesType.Candlestick, options);
        this._candleOptions = { ...defaultCandlestickOptions, ...options };
        this._options = this._candleOptions;
    }

    get candleOptions(): Readonly<CandlestickSeriesOptions> {
        return this._candleOptions;
    }

    applyOptions(options: Partial<CandlestickSeriesOptions>): void {
        this._candleOptions = { ...this._candleOptions, ...options };
        this._options = this._candleOptions;
    }

    /**
     * Get colors for a bar
     */
    getBarColors(bar: BarData): {
        body: string;
        border: string;
        wick: string;
    } {
        const isUp = bar.close >= bar.open;
        return {
            body: isUp ? this._candleOptions.upColor : this._candleOptions.downColor,
            border: isUp ? this._candleOptions.borderUpColor : this._candleOptions.borderDownColor,
            wick: isUp ? this._candleOptions.wickUpColor : this._candleOptions.wickDownColor,
        };
    }
}
