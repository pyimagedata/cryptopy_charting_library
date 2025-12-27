// Canvas scope type
export interface BitmapCoordinatesScope {
    readonly context: CanvasRenderingContext2D;
    readonly mediaSize: { width: number; height: number };
    readonly bitmapSize: { width: number; height: number };
    readonly horizontalPixelRatio: number;
    readonly verticalPixelRatio: number;
}
import { LineSeries } from '../model/line-series';
import { BarWithCoordinates } from '../model/series';

/**
 * Line renderer
 */
export class LineRenderer {
    private readonly _series: LineSeries;

    constructor(series: LineSeries) {
        this._series = series;
    }

    /**
     * Render line chart
     */
    draw(scope: BitmapCoordinatesScope, bars: BarWithCoordinates[]): void {
        if (bars.length < 2) return;

        const { context: ctx, horizontalPixelRatio, verticalPixelRatio } = scope;
        const options = this._series.lineOptions;

        ctx.beginPath();
        ctx.strokeStyle = options.color;
        ctx.lineWidth = options.lineWidth * horizontalPixelRatio;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Set line style
        if (options.lineStyle === 'dashed') {
            ctx.setLineDash([5 * horizontalPixelRatio, 3 * horizontalPixelRatio]);
        } else if (options.lineStyle === 'dotted') {
            ctx.setLineDash([2 * horizontalPixelRatio, 2 * horizontalPixelRatio]);
        } else {
            ctx.setLineDash([]);
        }

        let started = false;
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
        ctx.setLineDash([]);
    }
}
