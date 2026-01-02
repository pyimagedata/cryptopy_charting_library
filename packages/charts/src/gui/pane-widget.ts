import { ChartModel } from '../model/chart-model';
import { Series, SeriesType } from '../model/series';
import { CandlestickSeries } from '../model/candlestick-series';
import { LineSeries } from '../model/line-series';
import { AreaSeries } from '../model/area-series';
import { CandlestickRenderer } from '../renderers/candlestick-renderer';
import { LineRenderer } from '../renderers/line-renderer';
import { AreaRenderer } from '../renderers/area-renderer';
import { GridRenderer } from '../renderers/grid-renderer';
import { WatermarkRenderer } from '../renderers/watermark-renderer';
import { TimePointIndex, coordinate } from '../model/coordinate';
import { isBarData } from '../model/data';
import { OverlayIndicatorRenderer } from '../indicators/overlay-indicator-renderer';
import { OverlayIndicator } from '../indicators/indicator';
import {
    Drawing,
    TrendLineDrawing,
    FibRetracementDrawing,
    HorizontalLineDrawing,
    VerticalLineDrawing,
    InfoLineDrawing,
    ParallelChannelDrawing,
    RegressionTrendDrawing,
    FibExtensionDrawing,
    FibChannelDrawing,
    BrushDrawing,
    HighlighterDrawing,
    ArrowDrawing,
    ArrowMarkerDrawing,
    ArrowIconDrawing,
    RectangleDrawing,
    RotatedRectangleDrawing,
    EllipseDrawing,
    TriangleDrawing,
    ArcDrawing,
    PathDrawing,
    CircleDrawing,
    PolylineDrawing
} from '../drawings';

/** Disposable interface for cleanup */
export interface Disposable {
    dispose(): void;
}

// Re-export BitmapCoordinatesScope for renderers
export interface BitmapCoordinatesScope {
    readonly context: CanvasRenderingContext2D;
    readonly mediaSize: { width: number; height: number };
    readonly bitmapSize: { width: number; height: number };
    readonly horizontalPixelRatio: number;
    readonly verticalPixelRatio: number;
}

/**
 * Pane widget - renders a single chart pane with series
 */
export class PaneWidget implements Disposable {
    private readonly _model: ChartModel;
    private _element: HTMLElement | null = null;
    private _canvas: HTMLCanvasElement | null = null;
    private _ctx: CanvasRenderingContext2D | null = null;
    private _width: number = 0;
    private _height: number = 0;

    private _legendElement: HTMLElement | null = null;
    private _loadingElement: HTMLElement | null = null;
    private readonly _gridRenderer: GridRenderer;
    private readonly _watermarkRenderer: WatermarkRenderer;
    private readonly _seriesRenderers: Map<Series, CandlestickRenderer | LineRenderer | AreaRenderer> = new Map();
    private readonly _overlayRenderer: OverlayIndicatorRenderer;

    // Callback for overlay indicator actions (toggle, settings, remove)
    public onOverlayIndicatorAction: ((action: string, index: number) => void) | null = null;

    // Cache to prevent unnecessary legend rebuilds (causes flickering)
    private _lastOverlayIndicatorCount: number = -1;
    private _lastVisibilityState: string = '';
    private _lastIndicatorNames: string = '';

    constructor(container: HTMLElement, model: ChartModel) {
        this._model = model;
        this._gridRenderer = new GridRenderer(model.options.grid);
        this._watermarkRenderer = new WatermarkRenderer(model.options.watermark);
        this._overlayRenderer = new OverlayIndicatorRenderer();
        this._createElement(container);
    }

    get element(): HTMLElement | null {
        return this._element;
    }

    get canvas(): HTMLCanvasElement | null {
        return this._canvas;
    }

    /**
     * Set overlay indicators to render on the main chart
     */
    setOverlayIndicators(indicators: readonly OverlayIndicator[]): void {
        this._overlayRenderer.setIndicators([...indicators]);
    }

    /**
     * Show or hide loading overlay
     */
    setLoading(loading: boolean, message: string = 'Loading data...'): void {
        if (!this._loadingElement) return;

        if (loading) {
            this._loadingElement.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
                    <div style="
                        width: 40px;
                        height: 40px;
                        border: 3px solid rgba(41, 98, 255, 0.2);
                        border-top-color: #2962ff;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    "></div>
                    <span style="color: #787b86; font-size: 13px;">${message}</span>
                </div>
                <style>
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                </style>
            `;
            this._loadingElement.style.display = 'flex';
        } else {
            this._loadingElement.style.display = 'none';
        }
    }

    setSize(width: number, height: number): void {
        this._width = width;
        this._height = height;

        if (this._element) {
            this._element.style.width = `${width}px`;
            this._element.style.height = `${height}px`;
        }
        if (this._canvas) {
            const dpr = window.devicePixelRatio || 1;
            this._canvas.style.width = `${width}px`;
            this._canvas.style.height = `${height}px`;
            this._canvas.width = width * dpr;
            this._canvas.height = height * dpr;
        }
    }

    render(): void {
        if (!this._ctx || !this._canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const { _width: width, _height: height } = this;

        // Create scope for renderers
        const scope: BitmapCoordinatesScope = {
            context: this._ctx,
            mediaSize: { width, height },
            bitmapSize: { width: width * dpr, height: height * dpr },
            horizontalPixelRatio: dpr,
            verticalPixelRatio: dpr,
        };

        // Clear and reset transform
        this._ctx.setTransform(1, 0, 0, 1, 0, 0);
        this._ctx.fillStyle = this._model.options.layout.backgroundColor;
        this._ctx.fillRect(0, 0, width * dpr, height * dpr);

        // Draw watermark
        this._watermarkRenderer.updateOptions(this._model.options.watermark);
        this._watermarkRenderer.draw(scope);

        // Get visible range
        const visibleRange = this._model.timeScale.visibleRange();
        if (!visibleRange) return;

        // Draw grid
        const priceMarks = this._model.rightPriceScale.marks();
        this._gridRenderer.drawHorizontalLines(scope, priceMarks);

        // Calculate vertical grid x positions (every N bars)
        const barSpacing = this._model.timeScale.barSpacing;
        const gridInterval = Math.ceil(80 / barSpacing);
        const verticalXCoords: number[] = [];
        for (let i = visibleRange.from as number; i <= (visibleRange.to as number); i += gridInterval) {
            verticalXCoords.push(this._model.timeScale.indexToCoordinate(i as TimePointIndex));
        }
        this._gridRenderer.drawVerticalLines(scope, verticalXCoords as any);

        // Render each series
        for (const series of this._model.serieses) {
            this._renderSeries(scope, series, visibleRange.from, visibleRange.to);
        }

        // Render overlay indicators (EMA, SMA, Bollinger Bands, etc.)
        this._overlayRenderer.draw(scope, this._model.timeScale, this._model.rightPriceScale);

        // Draw crosshair
        const crosshair = this._model.crosshairPosition;
        if (crosshair && crosshair.visible) {
            const ctx = scope.context;
            const opts = this._model.options.crosshair;
            const hRatio = scope.horizontalPixelRatio;
            const vRatio = scope.verticalPixelRatio;

            ctx.save();

            // Vertical line
            if (opts.vertLine.visible) {
                ctx.beginPath();
                ctx.strokeStyle = opts.vertLine.color;
                ctx.lineWidth = Math.max(1, Math.floor(opts.vertLine.width * hRatio));
                const x = Math.round(crosshair.x * hRatio) + 0.5;

                if (opts.vertLine.style === 'dashed') {
                    ctx.setLineDash([4 * hRatio, 4 * hRatio]);
                }

                ctx.moveTo(x, 0);
                ctx.lineTo(x, scope.bitmapSize.height);
                ctx.stroke();
            }

            // Horizontal line
            if (opts.horzLine.visible) {
                ctx.beginPath();
                ctx.strokeStyle = opts.horzLine.color;
                ctx.lineWidth = Math.max(1, Math.floor(opts.horzLine.width * vRatio));
                const y = Math.round(crosshair.y * vRatio) + 0.5;

                if (opts.horzLine.style === 'dashed') {
                    ctx.setLineDash([4 * hRatio, 4 * hRatio]);
                } else {
                    ctx.setLineDash([]);
                }

                ctx.moveTo(0, y);
                ctx.lineTo(scope.bitmapSize.width, y);
                ctx.stroke();
            }

            ctx.restore();
        }

        // Update legend and buy/sell
        this._updateLegend();
    }

    private _renderSeries(
        scope: BitmapCoordinatesScope,
        series: Series,
        from: TimePointIndex,
        to: TimePointIndex
    ): void {
        // Calculate coordinates
        const bars = series.calculateCoordinates(
            this._model.timeScale,
            this._model.rightPriceScale,
            from,
            to
        );

        // Get or create renderer
        let renderer = this._seriesRenderers.get(series);
        if (!renderer) {
            const newRenderer = this._createRenderer(series);
            if (newRenderer) {
                this._seriesRenderers.set(series, newRenderer);
                renderer = newRenderer;
            }
        }

        // Render
        if (renderer) {
            const backgroundColor = this._model.options.layout.backgroundColor;
            const barSpacing = this._model.timeScale.barSpacing;
            // Pass background color and barSpacing
            (renderer as any).draw(scope, bars, backgroundColor, barSpacing);
        }
    }

    private _createRenderer(series: Series): CandlestickRenderer | LineRenderer | AreaRenderer | null {
        // Check if series provides its own renderer (e.g. Heiken Ashi)
        if ('getRenderer' in series && typeof (series as any).getRenderer === 'function') {
            return (series as any).getRenderer();
        }

        switch (series.type) {
            case SeriesType.Candlestick:
                return new CandlestickRenderer(series as CandlestickSeries);
            case SeriesType.Line:
                return new LineRenderer(series as LineSeries);
            case SeriesType.Area:
                return new AreaRenderer(series as AreaSeries);
            default:
                return null;
        }
    }

    /**
     * Render drawings on the canvas
     * @param drawings Array of drawings to render
     * @param timeToPixel Function to convert time (bar index) to pixel X
     * @param priceToPixel Function to convert price to pixel Y
     */
    renderDrawings(
        drawings: Drawing[],
        timeToPixel: (time: number) => number | null,
        priceToPixel: (price: number) => number | null,
        hoveredForAddTextId: string | null = null
    ): void {
        if (!this._ctx || !this._canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const ctx = this._ctx;
        const canvasWidth = this._canvas.width;
        const canvasHeight = this._canvas.height;

        ctx.save();

        for (const drawing of drawings) {
            if (!drawing.visible) continue;

            // Convert logical coordinates to pixel coordinates
            const pixelPoints: { x: number; y: number }[] = [];
            for (const point of drawing.points) {
                const x = timeToPixel(point.time);
                const y = priceToPixel(point.price);
                if (x !== null && y !== null) {
                    pixelPoints.push({ x: x * dpr, y: y * dpr });
                }
            }

            // Cache pixel points for hit testing
            if (drawing instanceof TrendLineDrawing || drawing.type === 'ray') {
                (drawing as TrendLineDrawing).setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
            } else if (drawing instanceof FibRetracementDrawing) {
                drawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                // Calculate Fibonacci levels - pass both scaled (for rendering) and non-scaled (for hit testing)
                drawing.calculateLevels(
                    (price: number) => {
                        const y = priceToPixel(price);
                        return y !== null ? y * dpr : 0;
                    },
                    (price: number) => {
                        const y = priceToPixel(price);
                        return y !== null ? y : 0;
                    }
                );
            } else if (drawing instanceof FibExtensionDrawing) {
                drawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                // Calculate Extension levels - pass both scaled (for rendering) and non-scaled (for hit testing)
                drawing.calculateLevels(
                    (price: number) => {
                        const y = priceToPixel(price);
                        return y !== null ? y * dpr : 0;
                    },
                    (price: number) => {
                        const y = priceToPixel(price);
                        return y !== null ? y : 0;
                    }
                );
            } else if (drawing instanceof FibChannelDrawing) {
                drawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                drawing.calculateLevelLines(
                    pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })),
                    canvasWidth / dpr
                );
            } else if (drawing instanceof BrushDrawing) {
                drawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
            } else if (drawing instanceof HighlighterDrawing) {
                drawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
            } else if (drawing instanceof ArrowDrawing) {
                drawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
            } else if (drawing instanceof ArrowMarkerDrawing) {
                drawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
            } else if (drawing instanceof ArrowIconDrawing) {
                drawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
            } else if (drawing instanceof RectangleDrawing) {
                drawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
            }

            // Handle single-point drawings (HorizontalLine, VerticalLine)
            if (drawing instanceof HorizontalLineDrawing) {
                drawing.render(ctx, timeToPixel, priceToPixel, canvasWidth / dpr, dpr);
                continue;
            }

            if (drawing instanceof VerticalLineDrawing) {
                const canvasHeight = this._canvas.height / dpr;
                drawing.render(ctx, timeToPixel, priceToPixel, canvasWidth / dpr, canvasHeight, dpr);
                continue;
            }

            // Handle single-point drawings: horizontalRay, crossLine
            if (drawing.type === 'horizontalRay' || drawing.type === 'crossLine') {
                if (pixelPoints.length >= 1) {
                    // Update cache for hit testing
                    (drawing as any).setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));

                    const showPoints = drawing.state === 'selected' || drawing.state === 'creating';

                    if (drawing.type === 'horizontalRay') {
                        this._drawHorizontalRay(ctx, pixelPoints[0], drawing.style, dpr, showPoints, canvasWidth);
                    } else {
                        // CrossLine
                        this._drawCrossLine(ctx, pixelPoints[0], drawing.style, dpr, showPoints, canvasWidth, canvasHeight);
                    }
                }
                continue;
            }

            // Handle single-point drawings: arrowMarker
            if (drawing.type === 'arrowMarker') {
                if (pixelPoints.length >= 1) {
                    this._drawArrowMarker(ctx, drawing as ArrowMarkerDrawing, pixelPoints, dpr, drawing.state === 'selected');
                }
                continue;
            }

            // Handle single-point drawings: arrowMarkedUp, arrowMarkedDown
            if (drawing.type === 'arrowMarkedUp' || drawing.type === 'arrowMarkedDown') {
                if (pixelPoints.length >= 1) {
                    this._drawArrowIcon(ctx, drawing as ArrowIconDrawing, pixelPoints[0], dpr, drawing.state === 'selected');
                }
                continue;
            }

            if (drawing instanceof RectangleDrawing) {
                if (pixelPoints.length >= 2) {
                    this._drawRectangle(ctx, drawing, pixelPoints, dpr, drawing.state === 'selected');
                }
                continue;
            }

            if (pixelPoints.length < 2) continue;

            // Draw based on type
            if (drawing.type === 'trendLine' || drawing.type === 'ray' || drawing.type === 'extendedLine') {
                const trendLine = drawing as TrendLineDrawing;
                const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                const isHoveredForAddText = hoveredForAddTextId === drawing.id;
                this._drawTrendLine(ctx, pixelPoints, drawing.style, showControlPoints, trendLine.extendLeft, trendLine.extendRight, this._canvas!.width, isHoveredForAddText);
            } else if (drawing.type === 'trendAngle') {
                const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                this._drawTrendAngle(ctx, pixelPoints, drawing.style, dpr, showControlPoints);
            } else if (drawing.type === 'infoLine') {
                const infoLine = drawing as InfoLineDrawing;
                // Calculate measurements
                if (drawing.points.length >= 2) {
                    const p1 = drawing.points[0];
                    const p2 = drawing.points[1];

                    // Get bar interval from chart data (difference between 2 consecutive bars)
                    let barIntervalMs = 60000; // Default 1 minute
                    const mainSeries = this._model.serieses[0];
                    if (mainSeries && mainSeries.data.length >= 2) {
                        const data = mainSeries.data;
                        // Calculate average interval from last few bars
                        const t1 = data[data.length - 2].time;
                        const t2 = data[data.length - 1].time;
                        barIntervalMs = Math.abs(t2 - t1);
                    }

                    infoLine.calculateMeasurements(
                        { x: pixelPoints[0].x, y: pixelPoints[0].y, price: p1.price, time: p1.time },
                        { x: pixelPoints[1].x, y: pixelPoints[1].y, price: p2.price, time: p2.time },
                        barIntervalMs
                    );
                }
                const showInfoLinePoints = drawing.state === 'selected' || drawing.state === 'creating';
                this._drawInfoLine(ctx, pixelPoints, infoLine, dpr, showInfoLinePoints);
            } else if (drawing.type === 'fibRetracement') {
                this._drawFibRetracement(ctx, drawing as FibRetracementDrawing, pixelPoints, canvasWidth, dpr, drawing.state === 'selected');
            } else if (drawing.type === 'fibExtension') {
                this._drawFibExtension(ctx, drawing as FibExtensionDrawing, pixelPoints, canvasWidth, dpr, drawing.state === 'selected');
            } else if (drawing.type === 'fibChannel') {
                this._drawFibChannel(ctx, drawing as FibChannelDrawing, pixelPoints, canvasWidth, dpr, drawing.state === 'selected');
            } else if (drawing.type === 'parallelChannel') {
                // For parallel channel we need 3 points
                if (pixelPoints.length >= 2) {
                    const parallelChannel = drawing as ParallelChannelDrawing;
                    parallelChannel.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    this._drawParallelChannel(ctx, pixelPoints, parallelChannel, dpr, showControlPoints, canvasWidth);
                }
            } else if (drawing.type === 'regressionTrend') {
                // Regression trend needs to calculate regression from price data
                if (pixelPoints.length >= 2) {
                    const regressionTrend = drawing as RegressionTrendDrawing;
                    regressionTrend.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    this._drawRegressionTrend(ctx, pixelPoints, regressionTrend, dpr, showControlPoints, canvasWidth, timeToPixel, priceToPixel);
                }
            } else if (drawing.type === 'brush') {
                if (pixelPoints.length >= 2) {
                    this._drawBrush(ctx, drawing as BrushDrawing, pixelPoints, dpr, drawing.state === 'selected');
                }
            } else if (drawing.type === 'highlighter') {
                if (pixelPoints.length >= 2) {
                    this._drawBrush(ctx, drawing as any, pixelPoints, dpr, drawing.state === 'selected');
                }
            } else if (drawing.type === 'arrow') {
                if (pixelPoints.length >= 2) {
                    this._drawArrow(ctx, drawing as ArrowDrawing, pixelPoints, dpr, drawing.state === 'selected');
                }
            } else if (drawing.type === 'rotatedRectangle') {
                // Need at least 2 points for preview, 3 for complete
                if (pixelPoints.length >= 2) {
                    const rotatedRect = drawing as RotatedRectangleDrawing;
                    rotatedRect.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    this._drawRotatedRectangle(ctx, rotatedRect, pixelPoints, dpr, showControlPoints);
                }
            } else if (drawing.type === 'ellipse') {
                if (pixelPoints.length >= 2) {
                    const ellipseDrawing = drawing as EllipseDrawing;
                    ellipseDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    this._drawEllipse(ctx, ellipseDrawing, pixelPoints, dpr, showControlPoints);
                }
            } else if (drawing.type === 'triangle') {
                if (pixelPoints.length >= 2) {
                    const triangleDrawing = drawing as TriangleDrawing;
                    triangleDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    this._drawTriangle(ctx, triangleDrawing, pixelPoints, dpr, showControlPoints);
                }
            } else if (drawing.type === 'arc') {
                if (pixelPoints.length >= 2) {
                    const arcDrawing = drawing as ArcDrawing;
                    arcDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    this._drawArc(ctx, arcDrawing, pixelPoints, dpr, showControlPoints);
                }
            } else if (drawing.type === 'path') {
                if (pixelPoints.length >= 2) {
                    const pathDrawing = drawing as PathDrawing;
                    pathDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    this._drawPath(ctx, pathDrawing, pixelPoints, dpr, showControlPoints);
                }
            } else if (drawing.type === 'circle') {
                if (pixelPoints.length >= 2) {
                    const circleDrawing = drawing as CircleDrawing;
                    circleDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    this._drawCircle(ctx, circleDrawing, pixelPoints, dpr, showControlPoints);
                }
            } else if (drawing.type === 'polyline') {
                if (pixelPoints.length >= 2) {
                    const polylineDrawing = drawing as PolylineDrawing;
                    polylineDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    this._drawPolyline(ctx, polylineDrawing, pixelPoints, dpr, showControlPoints);
                }
            }
        }

        ctx.restore();
    }

    private _drawTrendLine(
        ctx: CanvasRenderingContext2D,
        points: { x: number; y: number }[],
        style: { color: string; lineWidth: number; lineDash?: number[]; text?: string; textColor?: string; fontSize?: number; fontWeight?: 'normal' | 'bold'; fontStyle?: 'normal' | 'italic'; textHAlign?: 'left' | 'center' | 'right'; textVAlign?: 'top' | 'middle' | 'bottom' },
        isSelected: boolean,
        extendLeft: boolean = false,
        extendRight: boolean = false,
        canvasWidth: number = 0,
        isHoveredForAddText: boolean = false
    ): void {
        if (points.length < 2) return;

        const dpr = window.devicePixelRatio || 1;

        ctx.strokeStyle = style.color;
        ctx.lineWidth = style.lineWidth * dpr;

        if (style.lineDash && style.lineDash.length > 0) {
            ctx.setLineDash(style.lineDash.map(d => d * dpr));
        } else {
            ctx.setLineDash([]);
        }

        // Calculate line direction
        const p1 = points[0];
        const p2 = points[1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lineLength = Math.sqrt(dx * dx + dy * dy);

        let startX = p1.x;
        let startY = p1.y;
        let endX = p2.x;
        let endY = p2.y;

        // Extend left (from p1 towards negative direction)
        if (extendLeft && dx !== 0) {
            const slope = dy / dx;
            startX = 0;
            startY = p1.y - slope * p1.x;
        }

        // Extend right (from p2 towards positive direction)
        if (extendRight && dx !== 0 && canvasWidth > 0) {
            const slope = dy / dx;
            endX = canvasWidth;
            endY = p2.y + slope * (canvasWidth - p2.x);
        }

        // Check if there's text to draw
        const hasText = style.text && style.text.trim();

        if (hasText) {
            // Calculate text dimensions
            const fontSize = (style.fontSize || 14) * dpr;
            const fontWeight = style.fontWeight || 'normal';
            const fontStyle = style.fontStyle || 'normal';
            ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px Arial`;

            const textMetrics = ctx.measureText(style.text!);
            const textWidth = textMetrics.width;
            const padding = 8 * dpr;
            const gapWidth = textWidth + padding * 2;

            // Calculate midpoint
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;

            // Calculate gap start and end points along the line
            const unitDx = dx / lineLength;
            const unitDy = dy / lineLength;
            const halfGap = gapWidth / 2;

            const gapStartX = midX - unitDx * halfGap;
            const gapStartY = midY - unitDy * halfGap;
            const gapEndX = midX + unitDx * halfGap;
            const gapEndY = midY + unitDy * halfGap;

            // Draw line segment 1: start to gap
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(gapStartX, gapStartY);
            ctx.stroke();

            // Draw line segment 2: gap to end
            ctx.beginPath();
            ctx.moveTo(gapEndX, gapEndY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // Draw text at midpoint
            const angle = Math.atan2(dy, dx);

            // Offset based on vertical alignment
            const vAlign = style.textVAlign || 'middle';
            let offsetY = 0;
            if (vAlign === 'top') offsetY = -10 * dpr;
            else if (vAlign === 'bottom') offsetY = 10 * dpr;

            ctx.save();
            ctx.translate(midX, midY);

            // Rotate text to follow line, but keep readable
            let textAngle = angle;
            if (textAngle > Math.PI / 2) textAngle -= Math.PI;
            if (textAngle < -Math.PI / 2) textAngle += Math.PI;
            ctx.rotate(textAngle);

            // Draw text
            ctx.fillStyle = style.textColor || style.color;
            const hAlign = style.textHAlign || 'center';
            ctx.textAlign = hAlign;
            ctx.textBaseline = 'middle';
            ctx.fillText(style.text!, 0, offsetY);
            ctx.restore();
        } else if (isHoveredForAddText) {
            // Hovered - create gap for "+ Add Text" tooltip
            const tooltipWidth = 70 * dpr; // Approximate width of "+ Add Text"
            const padding = 4 * dpr;
            const gapWidth = tooltipWidth + padding * 2;

            // Calculate midpoint
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;

            // Calculate gap start and end points along the line
            const unitDx = dx / lineLength;
            const unitDy = dy / lineLength;
            const halfGap = gapWidth / 2;

            const gapStartX = midX - unitDx * halfGap;
            const gapStartY = midY - unitDy * halfGap;
            const gapEndX = midX + unitDx * halfGap;
            const gapEndY = midY + unitDy * halfGap;

            // Draw line segment 1: start to gap
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(gapStartX, gapStartY);
            ctx.stroke();

            // Draw line segment 2: gap to end
            ctx.beginPath();
            ctx.moveTo(gapEndX, gapEndY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        } else {
            // No text, not hovered - draw full line
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }

        // Draw control points if selected
        if (isSelected) {
            ctx.fillStyle = style.color;
            for (const point of points) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 4 * dpr, 0, Math.PI * 2);
                ctx.fill();

                // White center
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(point.x, point.y, 2 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = style.color;
            }
        }
    }

    private _drawTrendAngle(
        ctx: CanvasRenderingContext2D,
        points: { x: number; y: number }[],
        style: { color: string; lineWidth: number; lineDash?: number[] },
        dpr: number,
        isSelected: boolean
    ): void {
        if (points.length < 2) return;

        const p1 = points[0]; // Start point
        const p2 = points[1]; // End point

        // Calculate angle from horizontal
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const angleRad = Math.atan2(-dy, dx); // Negate dy because canvas Y is inverted
        const angleDeg = angleRad * (180 / Math.PI);

        // Draw the main trend line
        ctx.beginPath();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = (style.lineWidth || 2) * dpr;
        ctx.setLineDash((style.lineDash || []).map(d => d * dpr));
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Draw dashed arc from horizontal to the trend line
        const arcRadius = 30 * dpr;
        const startAngle = 0; // Horizontal (0°)
        const endAngle = -angleRad; // To the trend line (negative because canvas Y is inverted)

        ctx.beginPath();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 1 * dpr;
        ctx.setLineDash([3 * dpr, 3 * dpr]); // Dashed

        // Draw horizontal reference line (short)
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x + arcRadius + 10 * dpr, p1.y);
        ctx.stroke();

        // Draw the arc
        ctx.beginPath();
        if (angleDeg >= 0) {
            // Upward angle
            ctx.arc(p1.x, p1.y, arcRadius, 0, -angleRad, true);
        } else {
            // Downward angle
            ctx.arc(p1.x, p1.y, arcRadius, 0, -angleRad, false);
        }
        ctx.stroke();

        // Draw angle label
        ctx.setLineDash([]);
        const labelX = p1.x + arcRadius + 15 * dpr;
        const labelY = p1.y + (angleDeg >= 0 ? -5 * dpr : 15 * dpr);

        ctx.font = `${12 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillStyle = style.color;
        ctx.textAlign = 'left';
        ctx.fillText(`${angleDeg.toFixed(2)}°`, labelX, labelY);

        // Draw control points
        if (isSelected) {
            ctx.fillStyle = style.color;
            for (const point of points) {
                // Outer circle
                ctx.beginPath();
                ctx.strokeStyle = style.color;
                ctx.lineWidth = 2 * dpr;
                ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
                ctx.stroke();

                // Inner fill (white)
                ctx.beginPath();
                ctx.fillStyle = '#fff';
                ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    private _drawHorizontalRay(
        ctx: CanvasRenderingContext2D,
        point: { x: number; y: number },
        style: { color: string; lineWidth: number; lineDash?: number[] },
        dpr: number,
        isSelected: boolean,
        canvasWidth: number
    ): void {
        // Draw horizontal line from point to right edge
        ctx.beginPath();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = (style.lineWidth || 2) * dpr;
        ctx.setLineDash((style.lineDash || []).map(d => d * dpr));
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(canvasWidth, point.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw control point if selected
        if (isSelected) {
            // Outer circle
            ctx.beginPath();
            ctx.strokeStyle = style.color;
            ctx.lineWidth = 2 * dpr;
            ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
            ctx.stroke();

            // Inner fill (white)
            ctx.beginPath();
            ctx.fillStyle = '#fff';
            ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    private _drawCrossLine(
        ctx: CanvasRenderingContext2D,
        point: { x: number; y: number },
        style: { color: string; lineWidth: number; lineDash?: number[] },
        dpr: number,
        isSelected: boolean,
        canvasWidth: number,
        canvasHeight: number
    ): void {
        const { x, y } = point;

        ctx.beginPath();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = (style.lineWidth || 1) * dpr;
        ctx.setLineDash((style.lineDash || []).map(d => d * dpr));

        // Horizontal line
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);

        // Vertical line
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);

        ctx.stroke();
        ctx.setLineDash([]);

        if (isSelected) {
            // Draw intersection point
            ctx.beginPath();
            ctx.strokeStyle = style.color;
            ctx.lineWidth = 2 * dpr;
            ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.fillStyle = '#fff';
            ctx.arc(x, y, 3 * dpr, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    private _drawInfoLine(
        ctx: CanvasRenderingContext2D,
        points: { x: number; y: number }[],
        drawing: InfoLineDrawing,
        dpr: number,
        isSelected: boolean
    ): void {
        if (points.length < 2) return;

        const style = drawing.style;

        // Draw the line
        ctx.beginPath();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = style.lineWidth * dpr;
        ctx.setLineDash([]);
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(points[1].x, points[1].y);
        ctx.stroke();

        // Draw control points
        ctx.fillStyle = style.color;
        for (const point of points) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = style.color;
        }

        // Get measurements
        const m = drawing.getMeasurements();

        // Format text lines - TradingView style
        const priceSign = m.priceChange >= 0 ? '+' : '';
        const priceColor = m.priceChange >= 0 ? '#26a69a' : '#ef5350'; // Green/Red

        const line1 = `${priceSign}${m.priceChange.toFixed(2)} (${m.priceChangePercent.toFixed(2)}%)`;
        const line2 = `${m.barCount} bar, ${m.timeDuration}`;
        const line3 = `${m.angle.toFixed(2)}°`;

        // Calculate tooltip position (near second point, offset to right)
        const tooltipX = points[1].x + 20 * dpr;
        const tooltipY = points[1].y - 10 * dpr;

        // Font setup
        const fontSize = 12 * dpr;
        const fontBold = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial`;
        const fontNormal = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial`;
        ctx.font = fontNormal;

        const padding = 10 * dpr;
        const lineHeight = fontSize + 6 * dpr;
        const iconWidth = 20 * dpr;

        // Measure text widths
        ctx.font = fontBold;
        const textWidths = [
            ctx.measureText(line1).width,
            ctx.measureText(line2).width,
            ctx.measureText(line3).width
        ];
        const maxTextWidth = Math.max(...textWidths);

        const boxWidth = iconWidth + maxTextWidth + padding * 2 + 5 * dpr;
        const boxHeight = lineHeight * 3 + padding * 2;

        // Draw shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
        ctx.shadowBlur = 8 * dpr;
        ctx.shadowOffsetX = 2 * dpr;
        ctx.shadowOffsetY = 2 * dpr;

        // Background - white with subtle border
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(tooltipX, tooltipY, boxWidth, boxHeight, 6 * dpr);
        ctx.fill();

        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Border
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();

        // Text rendering
        ctx.textBaseline = 'middle';
        const textX = tooltipX + padding;
        let textY = tooltipY + padding + lineHeight / 2;

        // Line 1 - Price change (colored)
        ctx.fillStyle = '#787878';
        ctx.font = fontNormal;
        ctx.fillText('↕', textX, textY);
        ctx.fillStyle = priceColor;
        ctx.font = fontBold;
        ctx.fillText(line1, textX + iconWidth, textY);
        textY += lineHeight;

        // Line 2 - Bars/Time
        ctx.fillStyle = '#787878';
        ctx.font = fontNormal;
        ctx.fillText('↔', textX, textY);
        ctx.fillStyle = '#333333';
        ctx.font = fontBold;
        ctx.fillText(line2, textX + iconWidth, textY);
        textY += lineHeight;

        // Line 3 - Angle
        ctx.fillStyle = '#787878';
        ctx.font = fontNormal;
        ctx.fillText('∠', textX, textY);
        ctx.fillStyle = '#333333';
        ctx.font = fontBold;
        ctx.fillText(line3, textX + iconWidth, textY);
    }

    private _drawFibRetracement(
        ctx: CanvasRenderingContext2D,
        drawing: FibRetracementDrawing,
        pixelPoints: { x: number; y: number }[],
        canvasWidth: number,
        dpr: number,
        isSelected: boolean
    ): void {
        if (pixelPoints.length < 2) return;

        const levelData = drawing.getLevelData();
        const style = drawing.style;

        // Determine left and right X boundaries
        const minX = Math.min(pixelPoints[0].x, pixelPoints[1].x);
        const maxX = drawing.extendLines ? canvasWidth : Math.max(pixelPoints[0].x, pixelPoints[1].x);

        // Get opacity from drawing (default 0.8)
        const opacity = drawing.opacity ?? 0.8;

        // Helper to apply opacity to hex color
        const applyOpacity = (hexColor: string, alpha: number): string => {
            // Parse hex color
            const hex = hexColor.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        // Draw semi-transparent fill between levels
        const bgOpacity = drawing.backgroundOpacity ?? 0.1;
        for (let i = 0; i < levelData.length - 1; i++) {
            const y1 = levelData[i].y;
            const y2 = levelData[i + 1].y;
            // Use the current level's color for the fill
            const fillColor = applyOpacity(levelData[i].color, bgOpacity);
            ctx.fillStyle = fillColor;
            ctx.fillRect(minX, Math.min(y1, y2), maxX - minX, Math.abs(y2 - y1));
        }

        // Draw horizontal lines at each level
        // Apply line dash style from drawing
        if (style.lineDash && style.lineDash.length > 0) {
            ctx.setLineDash(style.lineDash.map(d => d * dpr));
        } else {
            ctx.setLineDash([]);
        }
        ctx.lineWidth = style.lineWidth * dpr;

        for (let i = 0; i < levelData.length; i++) {
            const level = levelData[i];
            // Use the level's own color with opacity
            const color = applyOpacity(level.color, opacity);

            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.moveTo(minX, level.y);
            ctx.lineTo(maxX, level.y);
            ctx.stroke();

            // Draw label with price
            if (drawing.showLabels) {
                const labelText = drawing.showPrices
                    ? `${level.label} (${level.price.toFixed(2)})`
                    : level.label;

                ctx.font = `${11 * dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;
                ctx.fillStyle = color;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                ctx.fillText(labelText, minX + 4 * dpr, level.y - 2 * dpr);
            }
        }

        // Draw vertical connecting line (trend reference)
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 1 * dpr;
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.beginPath();
        ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);
        ctx.lineTo(pixelPoints[1].x, pixelPoints[1].y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw control points if selected
        if (isSelected) {
            ctx.fillStyle = style.color;
            for (const point of pixelPoints) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = style.color;
            }
        }
    }

    private _drawParallelChannel(
        ctx: CanvasRenderingContext2D,
        points: { x: number; y: number }[],
        drawing: ParallelChannelDrawing,
        dpr: number,
        isSelected: boolean,
        canvasWidth: number
    ): void {
        if (points.length < 2) return;

        const style = drawing.style;
        const p0 = points[0]; // Start of base line
        const p1 = points[1]; // End of base line

        // Calculate the offset for the parallel line
        let offsetY = 0;
        if (points.length >= 3) {
            // Use the third point to determine the channel width
            const p2 = points[2];
            // Calculate the perpendicular offset
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            const lineLength = Math.sqrt(dx * dx + dy * dy);

            if (lineLength > 0) {
                // Project p2 onto the perpendicular of the base line
                const baseYAtP2X = p0.y + (dy / dx) * (p2.x - p0.x);
                offsetY = p2.y - baseYAtP2X;
            }
        }

        // Calculate parallel line points
        const parallel0 = { x: p0.x, y: p0.y + offsetY };
        const parallel1 = { x: p1.x, y: p1.y + offsetY };

        // Cache parallel points for hit testing
        drawing.setParallelPixelPoints([parallel0, parallel1].map(p => ({ x: p.x / dpr, y: p.y / dpr })));

        // Calculate extension points
        let baseStart = { ...p0 };
        let baseEnd = { ...p1 };
        let parallelStart = { ...parallel0 };
        let parallelEnd = { ...parallel1 };

        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;

        if (drawing.extendLeft && dx !== 0) {
            const slope = dy / dx;
            baseStart.x = 0;
            baseStart.y = p0.y - slope * p0.x;
            parallelStart.x = 0;
            parallelStart.y = parallel0.y - slope * parallel0.x;
        }

        if (drawing.extendRight && dx !== 0) {
            const slope = dy / dx;
            baseEnd.x = canvasWidth;
            baseEnd.y = p1.y + slope * (canvasWidth - p1.x);
            parallelEnd.x = canvasWidth;
            parallelEnd.y = parallel1.y + slope * (canvasWidth - parallel1.x);
        }

        // Draw fill between lines
        if (style.fillColor && (style.fillOpacity ?? 0.1) > 0 && points.length >= 3) {
            ctx.fillStyle = this._hexToRgba(style.fillColor, style.fillOpacity ?? 0.1);
            ctx.beginPath();
            ctx.moveTo(baseStart.x, baseStart.y);
            ctx.lineTo(baseEnd.x, baseEnd.y);
            ctx.lineTo(parallelEnd.x, parallelEnd.y);
            ctx.lineTo(parallelStart.x, parallelStart.y);
            ctx.closePath();
            ctx.fill();
        }

        // Draw base line
        ctx.beginPath();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = style.lineWidth * dpr;
        ctx.setLineDash((style.lineDash || []).map(d => d * dpr));
        ctx.moveTo(baseStart.x, baseStart.y);
        ctx.lineTo(baseEnd.x, baseEnd.y);
        ctx.stroke();

        // Draw parallel line (only if we have 3 points)
        if (points.length >= 3) {
            ctx.beginPath();
            ctx.moveTo(parallelStart.x, parallelStart.y);
            ctx.lineTo(parallelEnd.x, parallelEnd.y);
            ctx.stroke();

            // Draw middle line if enabled
            if (drawing.showMiddleLine) {
                const midStart = {
                    x: (baseStart.x + parallelStart.x) / 2,
                    y: (baseStart.y + parallelStart.y) / 2
                };
                const midEnd = {
                    x: (baseEnd.x + parallelEnd.x) / 2,
                    y: (baseEnd.y + parallelEnd.y) / 2
                };
                ctx.beginPath();
                ctx.strokeStyle = style.color;
                ctx.setLineDash([4 * dpr, 4 * dpr]); // Dashed middle line
                ctx.moveTo(midStart.x, midStart.y);
                ctx.lineTo(midEnd.x, midEnd.y);
                ctx.stroke();
            }
        }

        ctx.setLineDash([]);

        // Draw control points if selected
        if (isSelected) {
            const allPoints = points.length >= 3
                ? [p0, p1, points[2]]
                : [p0, p1];

            ctx.fillStyle = style.color;
            for (const point of allPoints) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = style.color;
            }
        }
    }

    private _drawRegressionTrend(
        ctx: CanvasRenderingContext2D,
        points: { x: number; y: number }[],
        drawing: RegressionTrendDrawing,
        dpr: number,
        isSelected: boolean,
        canvasWidth: number,
        timeToPixel: (time: number) => number | null,
        priceToPixel: (price: number) => number | null
    ): void {
        if (points.length < 2) return;

        const style = drawing.style;
        const p0 = points[0]; // Start point
        const p1 = points[1]; // End point

        // Get the logical time range from drawing points
        const startTime = Math.min(drawing.points[0].time, drawing.points[1].time);
        const endTime = Math.max(drawing.points[0].time, drawing.points[1].time);

        // Get price data from the chart model in the specified range
        const mainSeries = this._model.serieses[0];
        if (!mainSeries || mainSeries.data.length === 0) return;

        // Find bars in the time range
        const barsInRange: { time: number; close: number }[] = [];
        for (const bar of mainSeries.data) {
            if (bar.time >= startTime && bar.time <= endTime) {
                barsInRange.push({
                    time: bar.time,
                    close: 'close' in bar ? (bar as any).close : (bar as any).value || 0
                });
            }
        }

        if (barsInRange.length < 2) {
            // Not enough data, just draw a simple line
            ctx.beginPath();
            ctx.strokeStyle = style.color;
            ctx.lineWidth = style.lineWidth * dpr;
            ctx.setLineDash((style.lineDash || []).map(d => d * dpr));
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
            ctx.setLineDash([]);
            return;
        }

        // Calculate linear regression
        drawing.calculateRegression(barsInRange);
        const { slope, intercept, stdDev } = drawing.getRegressionParams();

        // Calculate regression line Y values at start and end points
        const startIndex = 0;
        const endIndex = barsInRange.length - 1;

        const startPrice = intercept;
        const endPrice = slope * endIndex + intercept;

        // Convert to pixel coordinates
        const startY = priceToPixel(startPrice);
        const endY = priceToPixel(endPrice);

        if (startY === null || endY === null) return;

        // Get pixel X positions
        const startX = timeToPixel(barsInRange[0].time);
        const endX = timeToPixel(barsInRange[barsInRange.length - 1].time);

        if (startX === null || endX === null) return;

        // Scale to DPR
        const regStart = { x: startX * dpr, y: startY * dpr };
        const regEnd = { x: endX * dpr, y: endY * dpr };

        // Calculate upper and lower deviation lines
        const deviationOffset = stdDev * drawing.deviationMultiplier;
        const upperStartY = priceToPixel(startPrice + deviationOffset);
        const upperEndY = priceToPixel(endPrice + deviationOffset);
        const lowerStartY = priceToPixel(startPrice - deviationOffset);
        const lowerEndY = priceToPixel(endPrice - deviationOffset);

        if (upperStartY === null || upperEndY === null || lowerStartY === null || lowerEndY === null) return;

        const upperStart = { x: regStart.x, y: upperStartY * dpr };
        const upperEnd = { x: regEnd.x, y: upperEndY * dpr };
        const lowerStart = { x: regStart.x, y: lowerStartY * dpr };
        const lowerEnd = { x: regEnd.x, y: lowerEndY * dpr };

        // Handle extensions
        let extRegStart = { ...regStart };
        let extRegEnd = { ...regEnd };
        let extUpperStart = { ...upperStart };
        let extUpperEnd = { ...upperEnd };
        let extLowerStart = { ...lowerStart };
        let extLowerEnd = { ...lowerEnd };

        if (drawing.extendRight && regEnd.x !== regStart.x) {
            const slopePixel = (regEnd.y - regStart.y) / (regEnd.x - regStart.x);
            const extX = canvasWidth;
            extRegEnd = { x: extX, y: regEnd.y + slopePixel * (extX - regEnd.x) };
            extUpperEnd = { x: extX, y: upperEnd.y + slopePixel * (extX - upperEnd.x) };
            extLowerEnd = { x: extX, y: lowerEnd.y + slopePixel * (extX - lowerEnd.x) };
        }

        if (drawing.extendLeft && regEnd.x !== regStart.x) {
            const slopePixel = (regEnd.y - regStart.y) / (regEnd.x - regStart.x);
            extRegStart = { x: 0, y: regStart.y - slopePixel * regStart.x };
            extUpperStart = { x: 0, y: upperStart.y - slopePixel * upperStart.x };
            extLowerStart = { x: 0, y: lowerStart.y - slopePixel * lowerStart.x };
        }

        // Cache lines for hit testing
        drawing.setRegressionLine({
            start: { x: extRegStart.x / dpr, y: extRegStart.y / dpr },
            end: { x: extRegEnd.x / dpr, y: extRegEnd.y / dpr }
        });
        drawing.setUpperLine({
            start: { x: extUpperStart.x / dpr, y: extUpperStart.y / dpr },
            end: { x: extUpperEnd.x / dpr, y: extUpperEnd.y / dpr }
        });
        drawing.setLowerLine({
            start: { x: extLowerStart.x / dpr, y: extLowerStart.y / dpr },
            end: { x: extLowerEnd.x / dpr, y: extLowerEnd.y / dpr }
        });

        // Draw UPPER fill (between upper line and regression line) - BLUE
        if (style.fillColor && (style.fillOpacity ?? 0.2) > 0) {
            ctx.fillStyle = this._hexToRgba(style.fillColor, style.fillOpacity ?? 0.2);
            ctx.beginPath();
            ctx.moveTo(extUpperStart.x, extUpperStart.y);
            ctx.lineTo(extUpperEnd.x, extUpperEnd.y);
            ctx.lineTo(extRegEnd.x, extRegEnd.y);
            ctx.lineTo(extRegStart.x, extRegStart.y);
            ctx.closePath();
            ctx.fill();
        }

        // Draw LOWER fill (between regression line and lower line) - RED
        if (drawing.lowerFillColor && (style.fillOpacity ?? 0.2) > 0) {
            ctx.fillStyle = this._hexToRgba(drawing.lowerFillColor, style.fillOpacity ?? 0.2);
            ctx.beginPath();
            ctx.moveTo(extRegStart.x, extRegStart.y);
            ctx.lineTo(extRegEnd.x, extRegEnd.y);
            ctx.lineTo(extLowerEnd.x, extLowerEnd.y);
            ctx.lineTo(extLowerStart.x, extLowerStart.y);
            ctx.closePath();
            ctx.fill();
        }

        // Draw upper deviation line (solid blue)
        if (drawing.showUpperDeviation) {
            ctx.beginPath();
            ctx.strokeStyle = style.color;  // Blue
            ctx.lineWidth = style.lineWidth * dpr;
            ctx.setLineDash([]);  // Solid line
            ctx.moveTo(extUpperStart.x, extUpperStart.y);
            ctx.lineTo(extUpperEnd.x, extUpperEnd.y);
            ctx.stroke();
        }

        // Draw lower deviation line (solid blue)
        if (drawing.showLowerDeviation) {
            ctx.beginPath();
            ctx.strokeStyle = style.color;  // Blue
            ctx.lineWidth = style.lineWidth * dpr;
            ctx.setLineDash([]);  // Solid line
            ctx.moveTo(extLowerStart.x, extLowerStart.y);
            ctx.lineTo(extLowerEnd.x, extLowerEnd.y);
            ctx.stroke();
        }

        // Draw regression line (center line) - DASHED CORAL/RED
        ctx.beginPath();
        ctx.strokeStyle = drawing.centerLineColor;  // Coral/salmon color
        ctx.lineWidth = style.lineWidth * dpr;
        ctx.setLineDash([6 * dpr, 4 * dpr]);  // Dashed
        ctx.moveTo(extRegStart.x, extRegStart.y);
        ctx.lineTo(extRegEnd.x, extRegEnd.y);
        ctx.stroke();

        ctx.setLineDash([]);


        // Draw control points if selected
        if (isSelected) {
            ctx.fillStyle = style.color;
            for (const point of [p0, p1]) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = style.color;
            }
        }
    }

    private _drawFibExtension(
        ctx: CanvasRenderingContext2D,
        drawing: FibExtensionDrawing,
        pixelPoints: { x: number; y: number }[],
        canvasWidth: number,
        dpr: number,
        isSelected: boolean
    ): void {
        const style = drawing.style;
        const levelData = drawing.getLevelData();
        const pA = pixelPoints[0];
        const pB = pixelPoints[1];
        const pC = pixelPoints.length > 2 ? pixelPoints[2] : pB;
        // Level lines go from min(B,C) to max(B,C) or canvas width if extended
        const levelMinX = Math.min(pB.x, pC.x);
        const levelMaxX = Math.max(pB.x, pC.x);
        const startX = levelMinX;
        const endX = drawing.extendLines ? canvasWidth : levelMaxX;
        const bgOpacity = drawing.backgroundOpacity ?? 0.1;

        // Draw fills
        for (let i = 0; i < levelData.length - 1; i++) {
            const y1 = levelData[i].y;
            const y2 = levelData[i + 1].y;
            ctx.fillStyle = this._hexToRgba(levelData[i].color, bgOpacity);
            ctx.fillRect(startX, Math.min(y1, y2), endX - startX, Math.abs(y2 - y1));
        }

        // Draw levels
        ctx.setLineDash((style.lineDash || []).map(d => d * dpr));
        ctx.lineWidth = style.lineWidth * dpr;

        const opacity = drawing.opacity ?? 0.8;

        for (const level of levelData) {
            ctx.strokeStyle = this._hexToRgba(level.color, opacity);
            ctx.beginPath();
            ctx.moveTo(startX, level.y);
            ctx.lineTo(endX, level.y);
            ctx.stroke();

            if (drawing.showLabels) {
                const label = drawing.showPrices ? `${level.label} (${level.price.toFixed(2)})` : level.label;
                ctx.font = `${11 * dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;
                ctx.fillStyle = level.color;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                ctx.fillText(label, startX + 4 * dpr, level.y - 2 * dpr);
            }
        }

        // Trendlines (A->B->C) dashed
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 1 * dpr;
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.beginPath();
        ctx.moveTo(pA.x, pA.y);
        ctx.lineTo(pB.x, pB.y);
        ctx.lineTo(pC.x, pC.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Points
        if (isSelected) {
            ctx.fillStyle = style.color;
            for (const p of pixelPoints) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = style.color;
            }
        }
    }

    private _drawFibChannel(
        ctx: CanvasRenderingContext2D,
        drawing: FibChannelDrawing,
        pixelPoints: { x: number; y: number }[],
        canvasWidth: number,
        dpr: number,
        isSelected: boolean
    ): void {
        if (pixelPoints.length < 2) return;

        const style = drawing.style;
        const levelLines = drawing.getLevelLines();
        const bgOpacity = drawing.backgroundOpacity ?? 0.05;

        // Draw fills between consecutive levels
        for (let i = 0; i < levelLines.length - 1; i++) {
            const l1 = levelLines[i];
            const l2 = levelLines[i + 1];

            ctx.fillStyle = this._hexToRgba(l1.color, bgOpacity);
            ctx.beginPath();
            ctx.moveTo(l1.startX * dpr, l1.startY * dpr);
            ctx.lineTo(l1.endX * dpr, l1.endY * dpr);
            ctx.lineTo(l2.endX * dpr, l2.endY * dpr);
            ctx.lineTo(l2.startX * dpr, l2.startY * dpr);
            ctx.closePath();
            ctx.fill();
        }

        // Draw level lines
        ctx.setLineDash((style.lineDash || []).map(d => d * dpr));
        ctx.lineWidth = style.lineWidth * dpr;

        for (const line of levelLines) {
            ctx.strokeStyle = line.color;
            ctx.beginPath();
            ctx.moveTo(line.startX * dpr, line.startY * dpr);
            ctx.lineTo(line.endX * dpr, line.endY * dpr);
            ctx.stroke();

            // Labels
            if (drawing.showLabels) {
                ctx.font = `${11 * dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;
                ctx.fillStyle = line.color;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                ctx.fillText(line.label, line.startX * dpr + 4 * dpr, line.startY * dpr - 2 * dpr);
            }
        }

        // Draw control points A-B-C trend lines
        if (pixelPoints.length >= 2) {
            ctx.strokeStyle = style.color;
            ctx.lineWidth = 1 * dpr;
            ctx.setLineDash([4 * dpr, 4 * dpr]);
            ctx.beginPath();
            ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);
            ctx.lineTo(pixelPoints[1].x, pixelPoints[1].y);
            if (pixelPoints.length >= 3) {
                ctx.lineTo(pixelPoints[2].x, pixelPoints[2].y);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Control points
        if (isSelected) {
            ctx.fillStyle = style.color;
            for (const p of pixelPoints) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = style.color;
            }
        }
    }

    private _drawBrush(
        ctx: CanvasRenderingContext2D,
        drawing: BrushDrawing,
        pixelPoints: { x: number; y: number }[],
        dpr: number,
        isSelected: boolean
    ): void {
        if (pixelPoints.length < 2) return;

        const style = drawing.style;
        const opacity = drawing.opacity ?? 1.0;

        // Filter points to remove jitter - require minimum pixel distance
        const minDistance = 3 * dpr; // Minimum 3 pixels between points
        const filteredPoints: { x: number; y: number }[] = [pixelPoints[0]];

        for (let i = 1; i < pixelPoints.length; i++) {
            const lastFiltered = filteredPoints[filteredPoints.length - 1];
            const current = pixelPoints[i];
            const dx = current.x - lastFiltered.x;
            const dy = current.y - lastFiltered.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance >= minDistance) {
                filteredPoints.push(current);
            }
        }

        // Always include the last point
        if (filteredPoints.length > 0 && pixelPoints.length > 0) {
            const lastPoint = pixelPoints[pixelPoints.length - 1];
            const lastFiltered = filteredPoints[filteredPoints.length - 1];
            if (lastPoint.x !== lastFiltered.x || lastPoint.y !== lastFiltered.y) {
                filteredPoints.push(lastPoint);
            }
        }

        if (filteredPoints.length < 2) return;

        // Draw the brush path
        ctx.strokeStyle = this._hexToRgba(style.color, opacity);
        ctx.lineWidth = style.lineWidth * dpr;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash((style.lineDash || []).map(d => d * dpr));

        ctx.beginPath();
        ctx.moveTo(filteredPoints[0].x, filteredPoints[0].y);

        // Use quadratic curves for smoother drawing
        if (drawing.smooth && filteredPoints.length > 2) {
            for (let i = 1; i < filteredPoints.length - 1; i++) {
                const xc = (filteredPoints[i].x + filteredPoints[i + 1].x) / 2;
                const yc = (filteredPoints[i].y + filteredPoints[i + 1].y) / 2;
                ctx.quadraticCurveTo(filteredPoints[i].x, filteredPoints[i].y, xc, yc);
            }
            // Draw final segment
            const lastPoint = filteredPoints[filteredPoints.length - 1];
            ctx.lineTo(lastPoint.x, lastPoint.y);
        } else {
            // Simple line segments
            for (let i = 1; i < filteredPoints.length; i++) {
                ctx.lineTo(filteredPoints[i].x, filteredPoints[i].y);
            }
        }

        ctx.stroke();
        ctx.setLineDash([]);

        // Draw control points when selected (just end points)
        if (isSelected && pixelPoints.length >= 2) {
            ctx.fillStyle = style.color;
            const endpoints = [pixelPoints[0], pixelPoints[pixelPoints.length - 1]];
            for (const p of endpoints) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = style.color;
            }
        }
    }

    private _drawArrowMarker(
        ctx: CanvasRenderingContext2D,
        drawing: ArrowMarkerDrawing,
        pixelPoints: { x: number; y: number }[],
        dpr: number,
        isSelected: boolean
    ): void {
        if (pixelPoints.length < 2) return;

        const { style, size } = drawing;
        const p1 = pixelPoints[0];
        const p2 = pixelPoints[1];

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const angle = Math.atan2(dy, dx);
        const length = Math.sqrt(dx * dx + dy * dy);

        // Constants for arrow proportions
        const stemWidth = size * dpr;
        const headWidth = stemWidth * 2.5;
        const headLength = Math.min(length * 0.4, stemWidth * 2);

        ctx.fillStyle = style.color;
        ctx.save();
        ctx.translate(p1.x, p1.y);
        ctx.rotate(angle);

        ctx.beginPath();
        // Start from base (Origin P1 is a single point)
        ctx.moveTo(0, 0);

        // To head junction (top corner of stem)
        ctx.lineTo(length - headLength, -stemWidth / 2);

        // To head corner (top corner of arrow head)
        ctx.lineTo(length - headLength, -headWidth / 2);

        // To tip (Point P2)
        ctx.lineTo(length, 0);

        // Back to head corner (bottom corner of arrow head)
        ctx.lineTo(length - headLength, headWidth / 2);

        // Back to head junction (bottom corner of stem)
        ctx.lineTo(length - headLength, stemWidth / 2);

        // Back to base (point)
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        // Draw selection markers
        if (isSelected) {
            ctx.fillStyle = style.color;
            for (const p of pixelPoints) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = style.color;
            }
        }
    }

    private _drawArrowIcon(
        ctx: CanvasRenderingContext2D,
        drawing: ArrowIconDrawing,
        p: { x: number; y: number },
        dpr: number,
        isSelected: boolean
    ): void {
        const { style, size, type } = drawing;
        const s = size * dpr;
        const halfSize = s / 2;

        ctx.fillStyle = style.color;
        ctx.beginPath();

        if (type === 'arrowMarkedUp') {
            // Arrow pointing UP
            ctx.moveTo(p.x, p.y - halfSize); // Tip
            ctx.lineTo(p.x - halfSize, p.y); // Bottom left
            ctx.lineTo(p.x - halfSize / 2, p.y); // Inner left
            ctx.lineTo(p.x - halfSize / 2, p.y + halfSize); // Base bottom left
            ctx.lineTo(p.x + halfSize / 2, p.y + halfSize); // Base bottom right
            ctx.lineTo(p.x + halfSize / 2, p.y); // Inner right
            ctx.lineTo(p.x + halfSize, p.y); // Bottom right
        } else {
            // Arrow pointing DOWN
            ctx.moveTo(p.x, p.y + halfSize); // Tip
            ctx.lineTo(p.x - halfSize, p.y); // Top left
            ctx.lineTo(p.x - halfSize / 2, p.y); // Inner left
            ctx.lineTo(p.x - halfSize / 2, p.y - halfSize); // Base top left
            ctx.lineTo(p.x + halfSize / 2, p.y - halfSize); // Base top right
            ctx.lineTo(p.x + halfSize / 2, p.y); // Inner right
            ctx.lineTo(p.x + halfSize, p.y); // Top right
        }

        ctx.closePath();
        ctx.fill();

        // Draw selection markers
        if (isSelected) {
            ctx.strokeStyle = style.color;
            ctx.setLineDash([2 * dpr, 2 * dpr]);
            ctx.lineWidth = 1 * dpr;
            ctx.strokeRect(p.x - halfSize - 2 * dpr, p.y - halfSize - 2 * dpr, s + 4 * dpr, s + 4 * dpr);
            ctx.setLineDash([]);

            // Draw a small point in the center
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2 * dpr, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    private _drawArrow(
        ctx: CanvasRenderingContext2D,
        drawing: ArrowDrawing,
        pixelPoints: { x: number; y: number }[],
        dpr: number,
        isSelected: boolean
    ): void {
        const { style } = drawing;
        const p1 = pixelPoints[0];
        const p2 = pixelPoints[1];

        ctx.strokeStyle = style.color;
        ctx.lineWidth = style.lineWidth * dpr;
        ctx.setLineDash((style.lineDash || []).map(d => d * dpr));

        // Draw line
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        ctx.setLineDash([]);

        // Draw arrowhead
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const headLength = 10 * dpr + style.lineWidth * 2 * dpr;
        const headAngle = Math.PI / 7;

        ctx.fillStyle = style.color;
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(
            p2.x - headLength * Math.cos(angle - headAngle),
            p2.y - headLength * Math.sin(angle - headAngle)
        );
        ctx.lineTo(
            p2.x - headLength * Math.cos(angle + headAngle),
            p2.y - headLength * Math.sin(angle + headAngle)
        );
        ctx.closePath();
        ctx.fill();

        // Draw selection markers
        if (isSelected) {
            ctx.fillStyle = style.color;
            for (const p of pixelPoints) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = style.color;
            }
        }
    }

    private _hexToRgba(hex: string, alpha: number): string {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            const r = parseInt(result[1], 16);
            const g = parseInt(result[2], 16);
            const b = parseInt(result[3], 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return hex;
    }

    dispose(): void {
        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
        this._seriesRenderers.clear();
        this._element = null;
        this._canvas = null;
        this._ctx = null;
        this._legendElement = null;
    }

    private _updateLegend(): void {
        if (!this._legendElement) return;

        const symbol = this._model.symbol || '---';
        const timeframe = this._model.timeframe || '---';

        // Find main series for OHLC
        const mainSeries = this._model.serieses[0];
        let ohlcText = '';

        if (mainSeries) {
            const crosshair = this._model.crosshairPosition;
            let barIndex: TimePointIndex | null = null;

            if (crosshair && crosshair.visible) {
                barIndex = this._model.timeScale.coordinateToIndex(coordinate(crosshair.x));
            } else {
                // Use last bar if crosshair not visible
                barIndex = (this._model.timeScale.pointsCount - 1) as TimePointIndex;
            }

            const bar = mainSeries.data[barIndex];
            const prevBar = barIndex > 0 ? mainSeries.data[barIndex - 1] : null;

            if (bar && 'open' in bar) {
                const format = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const formatVol = (v: number) => {
                    if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
                    if (v >= 1000) return (v / 1000).toFixed(2) + 'K';
                    return v.toFixed(2);
                };

                const isCloseUp = bar.close >= bar.open;
                const priceColor = isCloseUp ? '#26a69a' : '#ef5350';

                // Calculate change from previous close
                let changeText = '';
                if (prevBar && isBarData(prevBar)) {
                    const change = bar.close - prevBar.close;
                    const changePercent = (change / prevBar.close) * 100;
                    const sign = change >= 0 ? '+' : '';
                    const changeColor = change >= 0 ? '#26a69a' : '#ef5350';
                    changeText = `<span style="margin-left: 8px; color: ${changeColor}; font-size: 12px;">${sign}${format(change)} (${sign}${changePercent.toFixed(2)}%)</span>`;
                }

                ohlcText = `
                    <span style="margin-left: 12px; color: #787b86; font-size: 12px;">O<span style="color: ${priceColor}; margin-left: 2px;">${format(bar.open)}</span></span>
                    <span style="margin-left: 8px; color: #787b86; font-size: 12px;">H<span style="color: ${priceColor}; margin-left: 2px;">${format(bar.high)}</span></span>
                    <span style="margin-left: 8px; color: #787b86; font-size: 12px;">L<span style="color: ${priceColor}; margin-left: 2px;">${format(bar.low)}</span></span>
                    <span style="margin-left: 8px; color: #787b86; font-size: 12px;">C<span style="color: ${priceColor}; margin-left: 2px;">${format(bar.close)}</span></span>
                    ${changeText}
                    <span style="margin-left: 12px; color: #787b86; font-size: 12px;">Vol<span style="color: ${priceColor}; margin-left: 4px;">${formatVol(bar.volume || 0)}</span></span>
                `;
            }
        }

        // Build overlay indicator labels - TradingView style (vertical list with action buttons)
        let overlayIndicatorsHtml = '';
        const overlayIndicators = this._overlayRenderer.indicators;
        if (overlayIndicators.length > 0) {
            overlayIndicatorsHtml = '<div style="margin-top: 32px; display: flex; flex-direction: column;">';
            for (let i = 0; i < overlayIndicators.length; i++) {
                const indicator = overlayIndicators[i];
                const color = indicator.options.color || '#2962ff';
                const name = indicator.name || indicator.options.name || 'Indicator';
                // Get current value if available
                const lastValue = indicator.data.length > 0 ? indicator.data[indicator.data.length - 1]?.value : null;
                const valueText = lastValue !== null && !isNaN(lastValue) ? `${lastValue.toFixed(2)}` : '';
                const opacity = indicator.visible ? '1' : '0.4';
                const eyeColor = indicator.visible ? '#787b86' : '#ef5350';

                // Eye icon (visible/hidden) - size 16x16
                const eyeIcon = indicator.visible
                    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="16" height="16"><path fill="${eyeColor}" fill-rule="evenodd" d="M12 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm-1 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"></path><path fill="${eyeColor}" d="M16.91 8.8C15.31 4.99 12.18 3 9 3 5.82 3 2.7 4.98 1.08 8.8L1 9l.08.2C2.7 13.02 5.82 15 9 15c3.18 0 6.3-1.97 7.91-5.8L17 9l-.09-.2ZM9 14c-2.69 0-5.42-1.63-6.91-5 1.49-3.37 4.22-5 6.9-5 2.7 0 5.43 1.63 6.92 5-1.5 3.37-4.23 5-6.91 5Z"></path></svg>`
                    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="16" height="16"><path fill="${eyeColor}" d="M3.7 15 15 3.7l-.7-.7L3 14.3l.7.7ZM9 3c1.09 0 2.17.23 3.19.7l-.77.76C10.64 4.16 9.82 4 9 4 6.31 4 3.58 5.63 2.08 9a9.35 9.35 0 0 0 1.93 2.87l-.7.7A10.44 10.44 0 0 1 1.08 9.2L1 9l.08-.2C2.69 4.99 5.82 3 9 3Z"></path><path fill="${eyeColor}" d="M9 6a3 3 0 0 1 .78.1l-.9.9A2 2 0 0 0 7 8.87l-.9.9A3 3 0 0 1 9 6ZM11.9 8.22l-.9.9A2 2 0 0 1 9.13 11l-.9.9a3 3 0 0 0 3.67-3.68Z"></path><path fill="${eyeColor}" d="M9 14c-.82 0-1.64-.15-2.43-.45l-.76.76c1.02.46 2.1.7 3.19.7 3.18 0 6.31-1.98 7.92-5.81L17 9l-.08-.2a10.44 10.44 0 0 0-2.23-3.37l-.7.7c.75.76 1.41 1.71 1.93 2.87-1.5 3.37-4.23 5-6.92 5Z"></path></svg>`;

                // Settings icon - size 16x16
                const settingsIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="16" height="16"><path fill="currentColor" fill-rule="evenodd" d="m3.1 9 2.28-5h7.24l2.28 5-2.28 5H5.38L3.1 9Zm1.63-6h8.54L16 9l-2.73 6H4.73L2 9l2.73-6Zm5.77 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm1 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z"></path></svg>`;

                // Remove icon - size 16x16
                const removeIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="16" height="16"><path fill="currentColor" d="M7.5 4a.5.5 0 0 0-.5.5V5h4v-.5a.5.5 0 0 0-.5-.5h-3ZM12 5h3v1h-1.05l-.85 7.67A1.5 1.5 0 0 1 11.6 15H6.4a1.5 1.5 0 0 1-1.5-1.33L4.05 6H3V5h3v-.5C6 3.67 6.67 3 7.5 3h3c.83 0 1.5.67 1.5 1.5V5ZM5.06 6l.84 7.56a.5.5 0 0 0 .5.44h5.2a.5.5 0 0 0 .5-.44L12.94 6H5.06Z"></path></svg>`;

                overlayIndicatorsHtml += `
                    <div class="overlay-indicator-row" data-indicator-index="${i}" style="display: flex; align-items: center; font-size: 12px; height: 20px; opacity: ${opacity}; pointer-events: auto; cursor: default;">
                        <span style="color: #d1d4dc; font-weight: 500;">${name}</span>
                        <span style="color: #d1d4dc; margin-left: 6px;">${valueText}</span>
                        <div class="overlay-btn-group" style="visibility: hidden; display: flex; align-items: center; gap: 4px; margin-left: 8px;">
                            <button class="overlay-btn overlay-toggle-btn" data-action="toggle" data-index="${i}" style="background: none; border: none; cursor: pointer; color: #787b86; padding: 2px; display: flex; align-items: center;" title="Toggle visibility">${eyeIcon}</button>
                            <button class="overlay-btn overlay-settings-btn" data-action="settings" data-index="${i}" style="background: none; border: none; cursor: pointer; color: #787b86; padding: 2px; display: flex; align-items: center;" title="Settings">${settingsIcon}</button>
                            <button class="overlay-btn overlay-remove-btn" data-action="remove" data-index="${i}" style="background: none; border: none; cursor: pointer; color: #787b86; padding: 2px; display: flex; align-items: center;" title="Remove">${removeIcon}</button>
                        </div>
                    </div>
                `;
            }
            overlayIndicatorsHtml += '</div>';
        }

        // Check if we need to rebuild overlay indicators HTML (when count, visibility, or names change)
        const currentCount = overlayIndicators.length;
        const currentVisibilityState = overlayIndicators.map(i => i.visible ? '1' : '0').join('');
        const currentNames = overlayIndicators.map(i => i.name || i.options.name || '').join('|');
        const needsOverlayRebuild = currentCount !== this._lastOverlayIndicatorCount ||
            currentVisibilityState !== this._lastVisibilityState ||
            currentNames !== this._lastIndicatorNames;

        if (needsOverlayRebuild) {
            this._lastOverlayIndicatorCount = currentCount;
            this._lastVisibilityState = currentVisibilityState;
            this._lastIndicatorNames = currentNames;

            this._legendElement.innerHTML = `
                <div style="display: flex; align-items: center; white-space: nowrap; pointer-events: none;">
                    <div style="width: 16px; height: 16px; border-radius: 50%; background: #2962ff; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: bold; color: white; margin-right: 6px;">${symbol[0]}</div>
                    <span style="font-weight: bold; color: #d1d4dc; font-size: 13px;">${symbol}</span>
                    <span style="margin-left: 6px; color: #787b86; font-size: 13px;">Perpetual Contract</span>
                    <span style="margin-left: 6px; color: #d1d4dc; font-size: 13px;">• ${timeframe} • Binance</span>
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: #26a69a; margin-left: 8px; box-shadow: 0 0 5px #26a69a;"></div>
                    <span class="ohlc-text">${ohlcText}</span>
                </div>
                ${overlayIndicatorsHtml}
            `;

            // Add click event listeners to overlay indicator buttons
            const buttons = this._legendElement.querySelectorAll('.overlay-btn');
            buttons.forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = (btn as HTMLElement).dataset.action;
                    const index = parseInt((btn as HTMLElement).dataset.index || '0', 10);
                    if (action && this.onOverlayIndicatorAction) {
                        this.onOverlayIndicatorAction(action, index);
                    }
                });
            });

            // Add hover event listeners to show/hide button group
            const rows = this._legendElement.querySelectorAll('.overlay-indicator-row');
            rows.forEach((row) => {
                const btnGroup = row.querySelector('.overlay-btn-group') as HTMLElement;
                if (btnGroup) {
                    row.addEventListener('mouseenter', () => {
                        btnGroup.style.visibility = 'visible';
                    });
                    row.addEventListener('mouseleave', () => {
                        btnGroup.style.visibility = 'hidden';
                    });
                }
            });
        } else {
            // Just update OHLC text without rebuilding
            const ohlcSpan = this._legendElement.querySelector('.ohlc-text');
            if (ohlcSpan) {
                ohlcSpan.innerHTML = ohlcText;
            }
        }
    }


    private _createElement(container: HTMLElement): void {
        this._element = document.createElement('div');
        this._element.style.cssText = `
            flex: 1;
            position: relative;
            overflow: hidden;
        `;

        this._canvas = document.createElement('canvas');
        this._canvas.style.cssText = `
            display: block;
            position: absolute;
            top: 0;
            left: 0;
        `;

        this._ctx = this._canvas.getContext('2d');
        this._element.appendChild(this._canvas);

        // Legend overlay
        this._legendElement = document.createElement('div');
        this._legendElement.style.cssText = `
            position: absolute;
            top: 8px;
            left: 12px;
            z-index: 10;
            font-family: ${this._model.options.layout.fontFamily};
            user-select: none;
        `;
        this._element.appendChild(this._legendElement);

        // Loading overlay
        this._loadingElement = document.createElement('div');
        this._loadingElement.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(26, 26, 46, 0.9);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 100;
            font-family: ${this._model.options.layout.fontFamily};
        `;
        this._element.appendChild(this._loadingElement);

        container.appendChild(this._element);
    }


    private _drawRectangle(
        ctx: CanvasRenderingContext2D,
        drawing: RectangleDrawing,
        points: { x: number; y: number }[],
        dpr: number,
        isSelected: boolean
    ): void {
        if (points.length < 2) return;

        const p1 = points[0];
        const p2 = points[1];
        const style = drawing.style;

        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);

        // Draw Fill
        if (style.fillColor) {
            ctx.save();
            ctx.globalAlpha = style.fillOpacity !== undefined ? style.fillOpacity : 0.2;
            ctx.fillStyle = style.fillColor;
            ctx.fillRect(x, y, w, h);
            ctx.restore();
        }

        // Draw Border
        ctx.beginPath();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = style.lineWidth * dpr;

        if (style.lineDash && style.lineDash.length > 0) {
            ctx.setLineDash(style.lineDash.map(d => d * dpr));
        } else {
            ctx.setLineDash([]);
        }

        ctx.rect(x, y, w, h);
        ctx.stroke();

        ctx.setLineDash([]); // Reset

        // Draw selection points
        if (isSelected) {
            const corners = [
                { x: p1.x, y: p1.y },
                { x: p2.x, y: p2.y },
                { x: p2.x, y: p1.y },
                { x: p1.x, y: p2.y }
            ];

            ctx.lineWidth = 1 * dpr;
            ctx.strokeStyle = '#2962ff';

            corners.forEach(p => {
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#2962ff';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3 * dpr, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }

    private _drawRotatedRectangle(
        ctx: CanvasRenderingContext2D,
        drawing: RotatedRectangleDrawing,
        pixelPoints: { x: number; y: number }[],
        dpr: number,
        isSelected: boolean
    ): void {
        const corners = drawing.getRectangleCorners();

        // If we have full 4 corners, draw the rectangle
        if (corners && corners.length === 4) {
            // Scale corners for DPR
            const scaledCorners = corners.map(c => ({ x: c.x * dpr, y: c.y * dpr }));

            // Draw fill
            if (drawing.style.fillColor) {
                ctx.beginPath();
                ctx.moveTo(scaledCorners[0].x, scaledCorners[0].y);
                for (let i = 1; i < 4; i++) {
                    ctx.lineTo(scaledCorners[i].x, scaledCorners[i].y);
                }
                ctx.closePath();
                ctx.fillStyle = drawing.style.fillColor;
                ctx.fill();
            }

            // Draw stroke
            ctx.beginPath();
            ctx.moveTo(scaledCorners[0].x, scaledCorners[0].y);
            for (let i = 1; i < 4; i++) {
                ctx.lineTo(scaledCorners[i].x, scaledCorners[i].y);
            }
            ctx.closePath();
            ctx.strokeStyle = drawing.style.color;
            ctx.lineWidth = drawing.style.lineWidth * dpr;
            ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
            ctx.stroke();
            ctx.setLineDash([]);

        } else if (pixelPoints.length >= 2) {
            // Only 2 points - draw preview line
            const p1 = pixelPoints[0];
            const p2 = pixelPoints[1];

            ctx.beginPath();
            ctx.strokeStyle = drawing.style.color;
            ctx.lineWidth = drawing.style.lineWidth * dpr;
            ctx.setLineDash([6 * dpr, 4 * dpr]); // Dashed for preview
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw control points at rectangle corners (not original click positions)
        if (isSelected) {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = drawing.style.color;
            ctx.lineWidth = 2 * dpr;

            // Use rectangle corners for control points (if available)
            const corners = drawing.getRectangleCorners();
            const controlPoints = corners
                ? corners.slice(0, 3).map(c => ({ x: c.x * dpr, y: c.y * dpr })) // First 3 corners
                : pixelPoints;

            for (const point of controlPoints) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = drawing.style.color;
                ctx.beginPath();
                ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
            }
        }
    }

    private _drawEllipse(
        ctx: CanvasRenderingContext2D,
        drawing: EllipseDrawing,
        pixelPoints: { x: number; y: number }[],
        dpr: number,
        isSelected: boolean
    ): void {
        // If only 2 points (before 2nd click is confirmed), draw a line preview
        if (pixelPoints.length === 2 && drawing.state === 'creating') {
            const p0 = pixelPoints[0];
            const p1 = pixelPoints[1];

            ctx.beginPath();
            ctx.strokeStyle = drawing.style.color;
            ctx.lineWidth = drawing.style.lineWidth * dpr;
            ctx.setLineDash([6 * dpr, 4 * dpr]); // Dashed for preview
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
            ctx.setLineDash([]);
            return;
        }

        // 3+ points: draw ellipse
        const params = drawing.getEllipseParams();

        if (params) {
            const { cx, cy, rx, ry, rotation } = params;
            const scaledCx = cx * dpr;
            const scaledCy = cy * dpr;
            const scaledRx = rx * dpr;
            const scaledRy = ry * dpr;

            // Draw fill
            if (drawing.style.fillColor && scaledRx > 0 && scaledRy > 0) {
                ctx.beginPath();
                ctx.ellipse(scaledCx, scaledCy, scaledRx, scaledRy, rotation, 0, Math.PI * 2);
                ctx.fillStyle = drawing.style.fillColor;
                ctx.fill();
            }

            // Draw stroke
            if (scaledRx > 0 && scaledRy > 0) {
                ctx.beginPath();
                ctx.ellipse(scaledCx, scaledCy, scaledRx, scaledRy, rotation, 0, Math.PI * 2);
                ctx.strokeStyle = drawing.style.color;
                ctx.lineWidth = drawing.style.lineWidth * dpr;
                ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // Draw control points on ellipse edges
        if (isSelected && pixelPoints.length >= 2) {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = drawing.style.color;
            ctx.lineWidth = 2 * dpr;

            // Use control points on the ellipse edges (if available)
            const controlPoints = drawing.getControlPoints();
            const pointsToDraw = controlPoints
                ? controlPoints.map(p => ({ x: p.x * dpr, y: p.y * dpr }))
                : pixelPoints;

            for (const point of pointsToDraw) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = drawing.style.color;
                ctx.beginPath();
                ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
            }
        }
    }

    private _drawTriangle(
        ctx: CanvasRenderingContext2D,
        drawing: TriangleDrawing,
        pixelPoints: { x: number; y: number }[],
        dpr: number,
        isSelected: boolean
    ): void {
        // If only 2 points (before 2nd click is confirmed), draw a line preview
        if (pixelPoints.length === 2 && drawing.state === 'creating') {
            const p0 = pixelPoints[0];
            const p1 = pixelPoints[1];

            ctx.beginPath();
            ctx.strokeStyle = drawing.style.color;
            ctx.lineWidth = drawing.style.lineWidth * dpr;
            ctx.setLineDash([6 * dpr, 4 * dpr]); // Dashed for preview
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
            ctx.setLineDash([]);
            return;
        }

        // 3 points: draw triangle
        if (pixelPoints.length >= 3) {
            const p0 = pixelPoints[0];
            const p1 = pixelPoints[1];
            const p2 = pixelPoints[2];

            // Draw fill
            if (drawing.style.fillColor) {
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.closePath();
                ctx.fillStyle = drawing.style.fillColor;
                ctx.fill();
            }

            // Draw stroke
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.closePath();
            ctx.strokeStyle = drawing.style.color;
            ctx.lineWidth = drawing.style.lineWidth * dpr;
            ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw control points at vertices
        if (isSelected && pixelPoints.length >= 3) {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = drawing.style.color;
            ctx.lineWidth = 2 * dpr;

            for (const point of pixelPoints) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = drawing.style.color;
                ctx.beginPath();
                ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
            }
        }
    }

    private _drawArc(
        ctx: CanvasRenderingContext2D,
        drawing: ArcDrawing,
        pixelPoints: { x: number; y: number }[],
        dpr: number,
        isSelected: boolean
    ): void {
        // If only 2 points (before 2nd click is confirmed), draw a line preview
        if (pixelPoints.length === 2 && drawing.state === 'creating') {
            const p0 = pixelPoints[0];
            const p1 = pixelPoints[1];

            ctx.beginPath();
            ctx.strokeStyle = drawing.style.color;
            ctx.lineWidth = drawing.style.lineWidth * dpr;
            ctx.setLineDash([6 * dpr, 4 * dpr]); // Dashed for preview
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
            ctx.setLineDash([]);
            return;
        }

        // 3 points: draw quadratic bezier curve that PASSES THROUGH the 3rd point
        if (pixelPoints.length >= 3) {
            const p0 = pixelPoints[0]; // Start
            const p1 = pixelPoints[1]; // End  
            const p2 = pixelPoints[2]; // Point ON the curve (we calculate control point from this)

            // Calculate control point so that curve passes through p2 at t=0.5
            // For quadratic bezier: B(0.5) = 0.25*P0 + 0.5*C + 0.25*P1 = P2
            // So: C = 2*P2 - 0.5*P0 - 0.5*P1
            const controlX = 2 * p2.x - 0.5 * p0.x - 0.5 * p1.x;
            const controlY = 2 * p2.y - 0.5 * p0.y - 0.5 * p1.y;

            // Draw fill first (curve + chord line)
            if (drawing.style.fillColor) {
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.quadraticCurveTo(controlX, controlY, p1.x, p1.y);
                ctx.lineTo(p0.x, p0.y); // Close with chord
                ctx.fillStyle = drawing.style.fillColor;
                ctx.fill();
            }

            // Draw curve stroke
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.quadraticCurveTo(controlX, controlY, p1.x, p1.y);
            ctx.strokeStyle = drawing.style.color;
            ctx.lineWidth = drawing.style.lineWidth * dpr;
            ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw control points at vertices
        if (isSelected && pixelPoints.length >= 3) {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = drawing.style.color;
            ctx.lineWidth = 2 * dpr;

            for (const point of pixelPoints) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = drawing.style.color;
                ctx.beginPath();
                ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
            }
        }
    }

    private _drawPath(
        ctx: CanvasRenderingContext2D,
        drawing: PathDrawing,
        pixelPoints: { x: number; y: number }[],
        dpr: number,
        isSelected: boolean
    ): void {
        if (pixelPoints.length < 2) return;

        // Draw lines connecting all points
        ctx.beginPath();
        ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);

        for (let i = 1; i < pixelPoints.length; i++) {
            ctx.lineTo(pixelPoints[i].x, pixelPoints[i].y);
        }

        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = drawing.style.lineWidth * dpr;
        ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw arrow head at the last point
        if (pixelPoints.length >= 2) {
            const lastPoint = pixelPoints[pixelPoints.length - 1];
            const prevPoint = pixelPoints[pixelPoints.length - 2];

            // Calculate angle
            const angle = Math.atan2(lastPoint.y - prevPoint.y, lastPoint.x - prevPoint.x);
            const arrowSize = 10 * dpr;

            // Draw arrow head
            ctx.beginPath();
            ctx.moveTo(lastPoint.x, lastPoint.y);
            ctx.lineTo(
                lastPoint.x - arrowSize * Math.cos(angle - Math.PI / 6),
                lastPoint.y - arrowSize * Math.sin(angle - Math.PI / 6)
            );
            ctx.lineTo(
                lastPoint.x - arrowSize * Math.cos(angle + Math.PI / 6),
                lastPoint.y - arrowSize * Math.sin(angle + Math.PI / 6)
            );
            ctx.closePath();
            ctx.fillStyle = drawing.style.color;
            ctx.fill();
        }

        // Draw control points at each vertex
        if (isSelected) {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = drawing.style.color;
            ctx.lineWidth = 2 * dpr;

            for (const point of pixelPoints) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = drawing.style.color;
                ctx.beginPath();
                ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
            }
        }
    }

    private _drawCircle(
        ctx: CanvasRenderingContext2D,
        drawing: CircleDrawing,
        pixelPoints: { x: number; y: number }[],
        dpr: number,
        isSelected: boolean
    ): void {
        if (pixelPoints.length < 2) return;

        const center = pixelPoints[0];
        const edge = pixelPoints[1];
        const radius = Math.sqrt((edge.x - center.x) ** 2 + (edge.y - center.y) ** 2);

        // Draw fill
        if (drawing.style.fillColor) {
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = drawing.style.fillColor;
            ctx.fill();
        }

        // Draw stroke
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = drawing.style.lineWidth * dpr;
        ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw control points (center and edge)
        if (isSelected) {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = drawing.style.color;
            ctx.lineWidth = 2 * dpr;

            for (const point of pixelPoints) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = drawing.style.color;
                ctx.beginPath();
                ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
            }
        }
    }

    private _drawPolyline(
        ctx: CanvasRenderingContext2D,
        drawing: PolylineDrawing,
        pixelPoints: { x: number; y: number }[],
        dpr: number,
        isSelected: boolean
    ): void {
        if (pixelPoints.length < 2) return;

        // Draw fill if closed
        if (drawing.isClosed && drawing.style.fillColor) {
            ctx.beginPath();
            ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);
            for (let i = 1; i < pixelPoints.length; i++) {
                ctx.lineTo(pixelPoints[i].x, pixelPoints[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = drawing.style.fillColor;
            ctx.fill();
        }

        // Draw lines connecting all points
        ctx.beginPath();
        ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);

        for (let i = 1; i < pixelPoints.length; i++) {
            ctx.lineTo(pixelPoints[i].x, pixelPoints[i].y);
        }

        // Close the path if it's a polygon
        if (drawing.isClosed) {
            ctx.closePath();
        }

        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = drawing.style.lineWidth * dpr;
        ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw control points at each vertex
        if (isSelected) {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = drawing.style.color;
            ctx.lineWidth = 2 * dpr;

            for (const point of pixelPoints) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = drawing.style.color;
                ctx.beginPath();
                ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
            }
        }
    }
}
