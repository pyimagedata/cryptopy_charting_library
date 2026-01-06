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
     * Get current indicators
     */
    get indicators(): readonly OverlayIndicator[] {
        return this._indicators;
    }

    /**
     * Draw all overlay indicators
     * @param styleFilter Optional filter to draw ONLY specific styles (e.g. 'histogram' for background, or 'line' for foreground)
     */
    draw(
        scope: BitmapCoordinatesScope,
        timeScale: TimeScale,
        priceScale: PriceScale,
        styleFilter?: 'histogram' | 'non-histogram'
    ): void {
        const { context: ctx, horizontalPixelRatio, verticalPixelRatio } = scope;
        const visibleRange = timeScale.visibleRange();

        if (!visibleRange) return;

        for (const indicator of this._indicators) {
            if (!indicator.visible) continue;

            // Apply filter if provided
            const isHistogram = indicator.options.style === 'histogram';
            if (styleFilter === 'histogram' && !isHistogram) continue;
            if (styleFilter === 'non-histogram' && isHistogram) continue;

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

        if (options.style === 'histogram' /* IndicatorStyle.Histogram */) {
            this._drawHistogram(ctx, indicator, data, timeScale, priceScale, startIndex, endIndex, hpr, vpr);
            return;
        }

        // Handle multi-line indicators (like Bollinger Bands)
        if (data[0]?.values && data[0].values.length > 1) { // Changed to > 1 to allow 1 value for histogram coloring
            this._drawMultiLine(ctx, indicator, data, timeScale, priceScale, startIndex, endIndex, hpr, vpr);
            return;
        }

        if (options.style === 'dots' /* IndicatorStyle.Dots */) {
            this._drawDots(ctx, indicator, data, timeScale, priceScale, startIndex, endIndex, hpr, vpr);
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

    private _drawHistogram(
        ctx: CanvasRenderingContext2D,
        indicator: OverlayIndicator,
        data: readonly { time: number; value: number; values?: number[] }[],
        timeScale: TimeScale,
        _priceScale: PriceScale,
        startIndex: number,
        endIndex: number,
        hpr: number,
        vpr: number
    ): void {
        const h = ctx.canvas.height / vpr;
        const volumeHeightRatio = 0.15; // Reduced further as per user request
        const barWidth = 0.8 * timeScale.barSpacing; // Match candle body width better

        // Colors from options or defaults with higher opacity
        const upColor = (indicator.options as any).upColor || 'rgba(38, 166, 154, 0.7)';
        const downColor = (indicator.options as any).downColor || 'rgba(239, 83, 80, 0.7)';

        // Find max value in visible range for scaling
        let maxVal = -Infinity;
        for (let i = startIndex; i <= endIndex; i++) {
            const val = data[i]?.value;
            if (val !== undefined && !isNaN(val) && val > maxVal) maxVal = val;
        }
        if (maxVal <= 0) maxVal = 1;

        for (let i = startIndex; i <= endIndex; i++) {
            const point = data[i];
            if (point === undefined || point.value === undefined || isNaN(point.value) || point.value === 0) continue;

            const x = timeScale.indexToCoordinate(i as any) * hpr;

            // Map value to 0 -> volumeHeightRatio * totalHeight
            const barHeight = (point.value / maxVal) * (h * volumeHeightRatio);
            const y = h - barHeight;

            // Color: red if price closed lower, green if higher/equal (from data.values[0])
            ctx.fillStyle = (point.values && point.values[0] === -1) ? downColor : upColor;

            ctx.fillRect(
                x - (barWidth / 2) * hpr,
                y * vpr,
                barWidth * hpr,
                barHeight * vpr
            );
        }
    }

    private _drawDots(
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
        ctx.fillStyle = options.color;
        const radius = (options.lineWidth + 1) * hpr;

        for (let i = startIndex; i <= endIndex; i++) {
            const point = data[i];
            if (point === undefined || point.value === undefined || isNaN(point.value)) continue;

            const x = timeScale.indexToCoordinate(i as any) * hpr;
            const y = priceScale.priceToCoordinate(point.value) * vpr;

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
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
