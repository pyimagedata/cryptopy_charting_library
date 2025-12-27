// Canvas scope type
export interface BitmapCoordinatesScope {
    readonly context: CanvasRenderingContext2D;
    readonly mediaSize: { width: number; height: number };
    readonly bitmapSize: { width: number; height: number };
    readonly horizontalPixelRatio: number;
    readonly verticalPixelRatio: number;
}
import { GridOptions } from '../model/chart-model';
import { PriceMark } from '../model/price-scale';
import { Coordinate } from '../model/coordinate';

/**
 * Grid renderer
 */
export class GridRenderer {
    private _options: GridOptions;

    constructor(options: GridOptions) {
        this._options = options;
    }

    updateOptions(options: GridOptions): void {
        this._options = options;
    }

    /**
     * Draw horizontal grid lines
     */
    drawHorizontalLines(scope: BitmapCoordinatesScope, marks: PriceMark[]): void {
        if (!this._options.horzLines.visible) return;

        const { context: ctx, horizontalPixelRatio, verticalPixelRatio, bitmapSize } = scope;

        ctx.strokeStyle = this._options.horzLines.color;
        ctx.lineWidth = 1;

        this._setLineStyle(ctx, this._options.horzLines.style, horizontalPixelRatio);

        for (const mark of marks) {
            const y = Math.round(mark.coord * verticalPixelRatio) + 0.5;

            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(bitmapSize.width, y);
            ctx.stroke();
        }

        ctx.setLineDash([]);
    }

    /**
     * Draw vertical grid lines
     */
    drawVerticalLines(scope: BitmapCoordinatesScope, xCoords: Coordinate[]): void {
        if (!this._options.vertLines.visible) return;

        const { context: ctx, horizontalPixelRatio, bitmapSize } = scope;

        ctx.strokeStyle = this._options.vertLines.color;
        ctx.lineWidth = 1;

        this._setLineStyle(ctx, this._options.vertLines.style, horizontalPixelRatio);

        for (const x of xCoords) {
            const xPx = Math.round(x * horizontalPixelRatio) + 0.5;

            ctx.beginPath();
            ctx.moveTo(xPx, 0);
            ctx.lineTo(xPx, bitmapSize.height);
            ctx.stroke();
        }

        ctx.setLineDash([]);
    }

    private _setLineStyle(
        ctx: CanvasRenderingContext2D,
        style: 'solid' | 'dashed' | 'dotted',
        pixelRatio: number
    ): void {
        if (style === 'dashed') {
            ctx.setLineDash([5 * pixelRatio, 3 * pixelRatio]);
        } else if (style === 'dotted') {
            ctx.setLineDash([2 * pixelRatio, 2 * pixelRatio]);
        } else {
            ctx.setLineDash([]);
        }
    }
}
