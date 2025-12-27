// Canvas scope type
export interface BitmapCoordinatesScope {
    readonly context: CanvasRenderingContext2D;
    readonly mediaSize: { width: number; height: number };
    readonly bitmapSize: { width: number; height: number };
    readonly horizontalPixelRatio: number;
    readonly verticalPixelRatio: number;
}
import { AreaSeries } from '../model/area-series';
import { BarWithCoordinates } from '../model/series';

/**
 * Area renderer (line with gradient fill)
 */
export class AreaRenderer {
    private readonly _series: AreaSeries;

    constructor(series: AreaSeries) {
        this._series = series;
    }

    /**
     * Render area chart
     */
    draw(scope: BitmapCoordinatesScope, bars: BarWithCoordinates[]): void {
        if (bars.length < 2) return;

        const { context: ctx, horizontalPixelRatio, verticalPixelRatio, bitmapSize } = scope;
        const options = this._series.areaOptions;

        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, bitmapSize.height);
        gradient.addColorStop(0, options.topColor);
        gradient.addColorStop(1, options.bottomColor);

        // Draw filled area
        ctx.beginPath();
        ctx.fillStyle = gradient;

        let firstX = 0;
        let started = false;

        for (const bar of bars) {
            // Use 'y' for LineData, fall back to 'closeY' for BarData
            const yValue = bar.y ?? bar.closeY;
            if (yValue === undefined) continue;

            const x = bar.x * horizontalPixelRatio;
            const y = yValue * verticalPixelRatio;

            if (!started) {
                firstX = x;
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }

        // Close the path at the bottom
        const lastBar = bars[bars.length - 1];
        const lastYValue = lastBar?.y ?? lastBar?.closeY;
        if (lastBar && lastYValue !== undefined) {
            const lastX = lastBar.x * horizontalPixelRatio;
            ctx.lineTo(lastX, bitmapSize.height);
            ctx.lineTo(firstX, bitmapSize.height);
            ctx.closePath();
            ctx.fill();
        }

        // Draw top line
        ctx.beginPath();
        ctx.strokeStyle = options.lineColor;
        ctx.lineWidth = options.lineWidth * horizontalPixelRatio;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        started = false;
        for (const bar of bars) {
            // Use 'y' for LineData, fall back to 'closeY' for BarData
            const yValue = bar.y ?? bar.closeY;
            if (yValue === undefined) continue;

            const x = bar.x * horizontalPixelRatio;
            const y = yValue * verticalPixelRatio;

            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();
    }
}
