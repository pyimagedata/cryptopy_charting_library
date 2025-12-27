/**
 * Overlay Indicator Renderer
 * 
 * Renders overlay indicators on top of the main price chart.
 * This renderer is called by PaneWidget after rendering the main series.
 */

import { OverlayIndicator } from './indicator';
import { TimeScale } from '../model/time-scale';
import { PriceScale } from '../model/price-scale';

/**
 * Scope for bitmap rendering
 */
interface BitmapCoordinatesScope {
    readonly context: CanvasRenderingContext2D;
    readonly mediaSize: { width: number; height: number };
    readonly bitmapSize: { width: number; height: number };
    readonly horizontalPixelRatio: number;
    readonly verticalPixelRatio: number;
}

/**
 * Overlay Indicator Renderer
 */
export class OverlayIndicatorRenderer {
    private _indicators: OverlayIndicator[] = [];

    constructor() { }

    /**
     * Set indicators to render
     */
    setIndicators(indicators: OverlayIndicator[]): void {
        this._indicators = indicators;
    }

    /**
     * Draw all overlay indicators
     */
    draw(
        scope: BitmapCoordinatesScope,
        timeScale: TimeScale,
        priceScale: PriceScale
    ): void {
        const { context: ctx, horizontalPixelRatio, verticalPixelRatio } = scope;
        const visibleRange = timeScale.visibleRange();

        if (!visibleRange) return;

        for (const indicator of this._indicators) {
            if (!indicator.visible) continue;

            const data = indicator.data;
            if (data.length === 0) continue;

            this._drawIndicatorLine(
                ctx,
                indicator,
                data,
                timeScale,
                priceScale,
                visibleRange,
                horizontalPixelRatio,
                verticalPixelRatio
            );
        }
    }

    private _drawIndicatorLine(
        ctx: CanvasRenderingContext2D,
        indicator: OverlayIndicator,
        data: readonly { time: number; value: number; values?: number[] }[],
        timeScale: TimeScale,
        priceScale: PriceScale,
        visibleRange: { from: number; to: number },
        hpr: number,
        vpr: number
    ): void {
        const options = indicator.options;
        const startIndex = Math.max(0, Math.floor(visibleRange.from));
        const endIndex = Math.min(data.length - 1, Math.ceil(visibleRange.to));

        // Handle multi-line indicators (like Bollinger Bands)
        if (data[0]?.values && data[0].values.length > 0) {
            this._drawMultiLine(ctx, indicator, data, timeScale, priceScale, startIndex, endIndex, hpr, vpr);
            return;
        }

        // Single line indicator
        ctx.strokeStyle = options.color;
        ctx.lineWidth = options.lineWidth * hpr;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        let started = false;

        for (let i = startIndex; i <= endIndex; i++) {
            const point = data[i];
            if (point === undefined || point.value === undefined || isNaN(point.value)) continue;

            const x = timeScale.indexToCoordinate(i as any) * hpr;
            const y = priceScale.priceToCoordinate(point.value) * vpr;

            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();
    }

    private _drawMultiLine(
        ctx: CanvasRenderingContext2D,
        indicator: OverlayIndicator,
        data: readonly { time: number; value: number; values?: number[] }[],
        timeScale: TimeScale,
        priceScale: PriceScale,
        startIndex: number,
        endIndex: number,
        hpr: number,
        vpr: number
    ): void {
        const options = indicator.options;
        const lineCount = data[0]?.values?.length || 0;

        // Color variations for multi-line
        const colors = this._getMultiLineColors(options.color, lineCount);

        for (let lineIdx = 0; lineIdx < lineCount; lineIdx++) {
            ctx.strokeStyle = colors[lineIdx];
            ctx.lineWidth = options.lineWidth * hpr;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.beginPath();
            let started = false;

            for (let i = startIndex; i <= endIndex; i++) {
                const point = data[i];
                const values = point?.values;
                if (!values || values[lineIdx] === undefined || isNaN(values[lineIdx])) continue;

                const x = timeScale.indexToCoordinate(i as any) * hpr;
                const y = priceScale.priceToCoordinate(values[lineIdx]) * vpr;

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

    private _getMultiLineColors(baseColor: string, count: number): string[] {
        // Generate color variations for multi-line indicators
        const colors: string[] = [baseColor];

        // Add lighter and darker variations
        if (count >= 2) {
            colors.push(this._adjustColorOpacity(baseColor, 0.6));
        }
        if (count >= 3) {
            colors.push(this._adjustColorOpacity(baseColor, 0.4));
        }

        // Fill remaining with base color
        while (colors.length < count) {
            colors.push(baseColor);
        }

        return colors;
    }

    private _adjustColorOpacity(color: string, opacity: number): string {
        // Handle hex colors
        if (color.startsWith('#')) {
            return color + Math.round(opacity * 255).toString(16).padStart(2, '0');
        }
        // Handle rgb/rgba
        if (color.startsWith('rgb')) {
            const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (match) {
                return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity})`;
            }
        }
        return color;
    }
}
