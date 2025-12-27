// Canvas scope type (from @charting/canvas package)
export interface BitmapCoordinatesScope {
    readonly context: CanvasRenderingContext2D;
    readonly mediaSize: { width: number; height: number };
    readonly bitmapSize: { width: number; height: number };
    readonly horizontalPixelRatio: number;
    readonly verticalPixelRatio: number;
}
import { CandlestickSeries } from '../model/candlestick-series';
import { BarWithCoordinates } from '../model/series';
import { BarData, isBarData } from '../model/data';

/**
 * Candlestick renderer
 */
export class CandlestickRenderer {
    private readonly _series: CandlestickSeries;

    constructor(series: CandlestickSeries) {
        this._series = series;
    }

    /**
     * Render candlesticks
     */
    draw(scope: BitmapCoordinatesScope, bars: BarWithCoordinates[], backgroundColor: string = '#1a1a2e', barSpacing: number = 6): void {
        const { context: ctx, horizontalPixelRatio, verticalPixelRatio } = scope;
        const options = this._series.candleOptions;

        // Calculate bar width based on spacing (dynamic zoom)
        // 0.8 factor creates a small gap between bars
        const barWidth = Math.max(1, Math.floor(barSpacing * 0.8 * horizontalPixelRatio));
        const wickWidth = Math.max(1, Math.floor(1 * horizontalPixelRatio));

        for (const bar of bars) {
            if (!isBarData(bar.data)) continue;

            const data = bar.data as BarData;
            const colors = this._series.getBarColors(data);

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
                ctx.fillStyle = colors.wick;
                ctx.fillRect(
                    x - Math.floor(wickWidth / 2),
                    highY,
                    wickWidth,
                    lowY - highY
                );
            }

            // Draw body (Solid style like index.html)
            const bodyX = x - Math.floor(barWidth / 2);

            ctx.fillStyle = colors.body;
            ctx.fillRect(bodyX, bodyTop, barWidth, bodyHeight);

            // Optional border (only if explicitly enabled in options, default false usually)
            if (options.borderVisible) {
                ctx.strokeStyle = colors.border;
                ctx.lineWidth = Math.max(1, Math.floor(1 * horizontalPixelRatio));

                // Adjust for crisp lines
                const offset = (ctx.lineWidth % 2) / 2;
                ctx.strokeRect(
                    bodyX + offset,
                    bodyTop + offset,
                    barWidth - (offset * 2),
                    bodyHeight - (offset * 2)
                );
            }
        }
    }
}
