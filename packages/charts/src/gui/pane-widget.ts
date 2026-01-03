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
    drawPatternWave,
    drawRectangle,
    drawRotatedRectangle,
    drawEllipse,
    drawTriangleShape,
    drawArc,
    drawPath,
    drawCircle,
    drawPolyline,
    drawCurve,
    drawTrendLine,
    drawTrendAngle,
    drawHorizontalRay,
    drawCrossLine,
    drawInfoLine,
    drawFibRetracement,
    drawFibExtension,
    drawFibChannel,
    drawParallelChannel,
    drawRegressionTrend,
    drawBrush,
    drawArrowMarker,
    drawArrowIcon,
    drawArrow
} from './renderers';
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
    PolylineDrawing,
    CurveDrawing,
    XABCDPatternDrawing,
    ElliottImpulseDrawing,
    ElliottCorrectionDrawing,
    ThreeDrivesDrawing,
    HeadShouldersDrawing,
    ABCDPatternDrawing,
    TrianglePatternDrawing
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
                        drawHorizontalRay(ctx, pixelPoints[0], drawing.style, dpr, showPoints, canvasWidth);
                    } else {
                        // CrossLine
                        drawCrossLine(ctx, pixelPoints[0], drawing.style, dpr, showPoints, canvasWidth, canvasHeight);
                    }
                }
                continue;
            }

            // Handle single-point drawings: arrowMarker
            if (drawing.type === 'arrowMarker') {
                if (pixelPoints.length >= 1) {
                    drawArrowMarker(ctx, drawing as ArrowMarkerDrawing, pixelPoints, dpr, drawing.state === 'selected');
                }
                continue;
            }

            // Handle single-point drawings: arrowMarkedUp, arrowMarkedDown
            if (drawing.type === 'arrowMarkedUp' || drawing.type === 'arrowMarkedDown') {
                if (pixelPoints.length >= 1) {
                    drawArrowIcon(ctx, drawing as ArrowIconDrawing, pixelPoints[0], dpr, drawing.state === 'selected');
                }
                continue;
            }

            if (drawing instanceof RectangleDrawing) {
                if (pixelPoints.length >= 2) {
                    drawRectangle(ctx, drawing, pixelPoints, dpr, drawing.state === 'selected');
                }
                continue;
            }

            if (pixelPoints.length < 2) continue;

            // Draw based on type
            if (drawing.type === 'trendLine' || drawing.type === 'ray' || drawing.type === 'extendedLine') {
                const trendLine = drawing as TrendLineDrawing;
                const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                const isHoveredForAddText = hoveredForAddTextId === drawing.id;
                drawTrendLine(ctx, pixelPoints, drawing.style, showControlPoints, trendLine.extendLeft, trendLine.extendRight, this._canvas!.width, isHoveredForAddText);
            } else if (drawing.type === 'trendAngle') {
                const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                drawTrendAngle(ctx, pixelPoints, drawing.style, dpr, showControlPoints);
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
                drawInfoLine(ctx, pixelPoints, infoLine, dpr, showInfoLinePoints);
            } else if (drawing.type === 'fibRetracement') {
                drawFibRetracement(ctx, drawing as FibRetracementDrawing, pixelPoints, canvasWidth, dpr, drawing.state === 'selected');
            } else if (drawing.type === 'fibExtension') {
                drawFibExtension(ctx, drawing as FibExtensionDrawing, pixelPoints, canvasWidth, dpr, drawing.state === 'selected');
            } else if (drawing.type === 'fibChannel') {
                drawFibChannel(ctx, drawing as FibChannelDrawing, pixelPoints, canvasWidth, dpr, drawing.state === 'selected');
            } else if (drawing.type === 'parallelChannel') {
                // For parallel channel we need 3 points
                if (pixelPoints.length >= 2) {
                    const parallelChannel = drawing as ParallelChannelDrawing;
                    parallelChannel.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    drawParallelChannel(ctx, pixelPoints, parallelChannel, dpr, showControlPoints, canvasWidth);
                }
            } else if (drawing.type === 'regressionTrend') {
                // Regression trend needs to calculate regression from price data
                if (pixelPoints.length >= 2) {
                    const regressionTrend = drawing as RegressionTrendDrawing;
                    regressionTrend.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    drawRegressionTrend(ctx, pixelPoints, regressionTrend, dpr, showControlPoints, canvasWidth, timeToPixel, priceToPixel, [...(this._model.serieses[0]?.data || [])]);
                }
            } else if (drawing.type === 'brush') {
                if (pixelPoints.length >= 2) {
                    drawBrush(ctx, drawing as BrushDrawing, pixelPoints, dpr, drawing.state === 'selected');
                }
            } else if (drawing.type === 'highlighter') {
                if (pixelPoints.length >= 2) {
                    drawBrush(ctx, drawing as any, pixelPoints, dpr, drawing.state === 'selected');
                }
            } else if (drawing.type === 'arrow') {
                if (pixelPoints.length >= 2) {
                    drawArrow(ctx, drawing as ArrowDrawing, pixelPoints, dpr, drawing.state === 'selected');
                }
            } else if (drawing.type === 'rotatedRectangle') {
                // Need at least 2 points for preview, 3 for complete
                if (pixelPoints.length >= 2) {
                    const rotatedRect = drawing as RotatedRectangleDrawing;
                    rotatedRect.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    drawRotatedRectangle(ctx, rotatedRect, pixelPoints, dpr, showControlPoints);
                }
            } else if (drawing.type === 'ellipse') {
                if (pixelPoints.length >= 2) {
                    const ellipseDrawing = drawing as EllipseDrawing;
                    ellipseDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    drawEllipse(ctx, ellipseDrawing, pixelPoints, dpr, showControlPoints);
                }
            } else if (drawing.type === 'triangle') {
                if (pixelPoints.length >= 2) {
                    const triangleDrawing = drawing as TriangleDrawing;
                    triangleDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    drawTriangleShape(ctx, triangleDrawing, pixelPoints, dpr, showControlPoints);
                }
            } else if (drawing.type === 'arc') {
                if (pixelPoints.length >= 2) {
                    const arcDrawing = drawing as ArcDrawing;
                    arcDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    drawArc(ctx, arcDrawing, pixelPoints, dpr, showControlPoints);
                }
            } else if (drawing.type === 'path') {
                if (pixelPoints.length >= 2) {
                    const pathDrawing = drawing as PathDrawing;
                    pathDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    drawPath(ctx, pathDrawing, pixelPoints, dpr, showControlPoints);
                }
            } else if (drawing.type === 'circle') {
                if (pixelPoints.length >= 2) {
                    const circleDrawing = drawing as CircleDrawing;
                    circleDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    drawCircle(ctx, circleDrawing, pixelPoints, dpr, showControlPoints);
                }
            } else if (drawing.type === 'polyline') {
                if (pixelPoints.length >= 2) {
                    const polylineDrawing = drawing as PolylineDrawing;
                    polylineDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    drawPolyline(ctx, polylineDrawing, pixelPoints, dpr, showControlPoints);
                }
            } else if (drawing.type === 'curve') {
                if (pixelPoints.length >= 2) {
                    const curveDrawing = drawing as CurveDrawing;
                    curveDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    drawCurve(ctx, curveDrawing, pixelPoints, dpr, showControlPoints);
                }
            } else if (drawing.type === 'xabcdPattern' || drawing.type === 'elliotImpulse' || drawing.type === 'elliotCorrection' || drawing.type === 'threeDrives' || drawing.type === 'headShoulders' || drawing.type === 'abcd' || drawing.type === 'trianglePattern') {
                if (pixelPoints.length >= 2) {
                    const patternDrawing = drawing as XABCDPatternDrawing | ElliottImpulseDrawing | ElliottCorrectionDrawing | ThreeDrivesDrawing | HeadShouldersDrawing | ABCDPatternDrawing | TrianglePatternDrawing;
                    patternDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    let labels: string[] = [];
                    if (drawing.type === 'xabcdPattern') {
                        labels = ['X', 'A', 'B', 'C', 'D'];
                    } else if (drawing.type === 'elliotImpulse') {
                        labels = ['(0)', '(1)', '(2)', '(3)', '(4)', '(5)'];
                    } else if (drawing.type === 'elliotCorrection') {
                        labels = ['(0)', '(A)', '(B)', '(C)'];
                    } else if (drawing.type === 'abcd') {
                        labels = ['A', 'B', 'C', 'D'];
                    } else if (drawing.type === 'trianglePattern') {
                        labels = ['A', 'B', 'C', 'D'];
                    } // threeDrives and headShoulders have their own labels
                    drawPatternWave(ctx, patternDrawing, pixelPoints, dpr, showControlPoints, labels);
                }
            }
        }

        ctx.restore();
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
}
