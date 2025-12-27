
import { Series, SeriesOptionsBase, SeriesType } from '../model/series';
import { BarData } from '../model/data';
import { ChartModel } from '../model/chart-model';

// Local interface for canvas renderer
interface CanvasRenderer {
    draw(ctx: any, bars?: any, backgroundColor?: string, barSpacing?: number): void;
}


/**
 * Heiken Ashi options
 */
export interface HeikenAshiSeriesOptions extends SeriesOptionsBase {
    upColor: string;
    downColor: string;
    wickVisible: boolean;
    borderVisible: boolean;
}

/**
 * Heiken Ashi Series
 */
export class HeikenAshiSeries extends Series<BarData> {
    private _haData: BarData[] = [];
    protected _options: HeikenAshiSeriesOptions;

    // We need access to the model for the renderer
    public readonly model: ChartModel;

    constructor(model: ChartModel, options: Partial<HeikenAshiSeriesOptions> = {}) {
        super(SeriesType.Candlestick, options); // Heiken Ashi behaves like Candlestick
        this.model = model;
        this._options = {
            visible: true,
            priceScaleId: 'right',
            upColor: '#26a69a',
            downColor: '#ef5350',
            wickVisible: true,
            borderVisible: false,
            ...options,
        };
    }

    public get haOptions(): HeikenAshiSeriesOptions {
        return this._options;
    }

    public applyOptions(options: Partial<HeikenAshiSeriesOptions>): void {
        this._options = { ...this._options, ...options };
        this._dataChanged.fire();
    }

    public setData(data: BarData[]): void {
        super.setData(data);
        this._calculateHeikenAshi(data);
    }

    public get haData(): BarData[] {
        return this._haData;
    }

    private _calculateHeikenAshi(data: BarData[]): void {
        this._haData = [];
        if (data.length === 0) return;

        // First HA candle
        let prevHaOpen = (data[0].open + data[0].close) / 2;
        let prevHaClose = (data[0].open + data[0].high + data[0].low + data[0].close) / 4;

        this._haData.push({
            time: data[0].time,
            open: prevHaOpen,
            high: data[0].high,
            low: data[0].low,
            close: prevHaClose,
            volume: data[0].volume
        });

        for (let i = 1; i < data.length; i++) {
            const bar = data[i];

            // HA Close = (Open + High + Low + Close) / 4
            const haClose = (bar.open + bar.high + bar.low + bar.close) / 4;

            // HA Open = (Prev HA Open + Prev HA Close) / 2
            const haOpen = (prevHaOpen + prevHaClose) / 2;

            // HA High = Max(High, HA Open, HA Close)
            const haHigh = Math.max(bar.high, haOpen, haClose);

            // HA Low = Min(Low, HA Open, HA Close)
            const haLow = Math.min(bar.low, haOpen, haClose);

            this._haData.push({
                time: bar.time,
                open: haOpen,
                high: haHigh,
                low: haLow,
                close: haClose,
                volume: bar.volume
            });

            prevHaOpen = haOpen;
            prevHaClose = haClose;
        }
    }

    public getRenderer(): CanvasRenderer {
        return new HeikenAshiRenderer(this);
    }

    /**
     * Override calculateCoordinates to use Heiken Ashi data instead of raw data
     */
    public override calculateCoordinates(
        timeScale: any,
        priceScale: any,
        from: number,
        to: number
    ): any[] {
        const result: any[] = [];

        const startIndex = Math.max(0, Math.floor(from));
        const endIndex = Math.min(this._haData.length - 1, Math.ceil(to));

        for (let i = startIndex; i <= endIndex; i++) {
            const item = this._haData[i];
            if (!item) continue;

            const x = timeScale.indexToCoordinate(i);
            result.push({
                index: i,
                x,
                data: item,
                openY: priceScale.priceToCoordinate(item.open),
                highY: priceScale.priceToCoordinate(item.high),
                lowY: priceScale.priceToCoordinate(item.low),
                closeY: priceScale.priceToCoordinate(item.close),
            });
        }

        return result;
    }
}

// Re-export BitmapCoordinatesScope for renderers
interface BitmapCoordinatesScope {
    readonly context: CanvasRenderingContext2D;
    readonly mediaSize: { width: number; height: number };
    readonly bitmapSize: { width: number; height: number };
    readonly horizontalPixelRatio: number;
    readonly verticalPixelRatio: number;
}

interface BarWithCoordinates {
    index: number;
    x: number;
    data: BarData;
    openY?: number;
    highY?: number;
    lowY?: number;
    closeY?: number;
}

/**
 * Heiken Ashi Renderer
 */
class HeikenAshiRenderer implements CanvasRenderer {
    constructor(private _series: HeikenAshiSeries) { }

    public draw(scope: BitmapCoordinatesScope, bars: BarWithCoordinates[], _backgroundColor: string = '#1a1a2e', barSpacing: number = 6): void {
        if (bars.length === 0) return;

        const { context: ctx, horizontalPixelRatio, verticalPixelRatio } = scope;
        const options = this._series.haOptions;

        // Calculate bar width based on spacing
        const barWidth = Math.max(1, Math.floor(barSpacing * 0.8 * horizontalPixelRatio));
        const wickWidth = Math.max(1, Math.floor(1 * horizontalPixelRatio));

        for (const bar of bars) {
            const data = bar.data;
            const isUp = data.close >= data.open;
            const color = isUp ? options.upColor : options.downColor;

            const x = Math.round(bar.x * horizontalPixelRatio);
            const openY = Math.round((bar.openY ?? 0) * verticalPixelRatio);
            const highY = Math.round((bar.highY ?? 0) * verticalPixelRatio);
            const lowY = Math.round((bar.lowY ?? 0) * verticalPixelRatio);
            const closeY = Math.round((bar.closeY ?? 0) * verticalPixelRatio);

            const bodyTop = Math.min(openY, closeY);
            const bodyBottom = Math.max(openY, closeY);
            const bodyHeight = Math.max(1, bodyBottom - bodyTop);

            // Draw wick
            if (options.wickVisible) {
                ctx.fillStyle = color;
                ctx.fillRect(
                    x - Math.floor(wickWidth / 2),
                    highY,
                    wickWidth,
                    lowY - highY
                );
            }

            // Draw body
            const bodyX = x - Math.floor(barWidth / 2);
            ctx.fillStyle = color;
            ctx.fillRect(bodyX, bodyTop, barWidth, bodyHeight);
        }
    }
}

