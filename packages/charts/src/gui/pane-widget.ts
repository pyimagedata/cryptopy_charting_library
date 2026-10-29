import type { PriceMark } from '../model/price-scale';
import { PriceScaleMode } from '../model/price-scale';
import { ChartModel } from '../model/chart-model';
import { Series, SeriesType } from '../model/series';
import { CandlestickSeries } from '../model/candlestick-series';
import { LineSeries } from '../model/line-series';
import { AreaSeries } from '../model/area-series';
import { HeikenAshiSeries } from '../series/heiken-ashi-series';
import { CandlestickRenderer } from '../renderers/candlestick-renderer';
import { LineRenderer } from '../renderers/line-renderer';
import { AreaRenderer } from '../renderers/area-renderer';
import { GridRenderer } from '../renderers/grid-renderer';
import { WatermarkRenderer } from '../renderers/watermark-renderer';
import { TimePointIndex, coordinate } from '../model/coordinate';
import { displaySymbol } from '../helpers/display-aliases';
import { isBarData } from '../model/data';
import { OverlayIndicatorRenderer } from '../indicators/overlay-indicator-renderer';
import { OverlayIndicator } from '../indicators/indicator';
import { IndicatorLegendList, LegendActionHandler, LEGEND_STYLE } from './indicator_legend';
import { OrderbookHeatmapRenderer } from '../renderers/orderbook-heatmap-renderer';
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
    drawFibRetracement,
    drawFibExtension,
    drawFibChannel,
    drawParallelChannel,
    drawRegressionTrend,
    drawBrush,
    drawArrowMarker,
    drawArrowIcon,
    drawLongPosition,
    drawShortPosition,
    drawPriceRange,
    drawDateRange,
    drawDatePriceRange,
    drawText,
    drawCallout,
    drawPriceLabel,
    drawNoteTool,
    drawFlagMarked,
    drawSticker,
    drawAnchoredVwap,
    drawVolumeProfile,
    drawPitchTool,
    drawFibTimeTool,
    drawCycleTool,
    drawDoubleCurve,
    drawFibCircleTool,
    drawGannTool,
    drawChannelLinesTool,
    drawProjectionTool,
    drawPositionForecast,
    drawBarsPattern,
    drawGhostFeed,
} from './pane_widget/renderers';
import {
    Drawing,
    TrendLineDrawing,
    FibRetracementDrawing,
    HorizontalLineDrawing,
    VerticalLineDrawing,
    ParallelChannelDrawing,
    RegressionTrendDrawing,
    FibExtensionDrawing,
    FibChannelDrawing,
    BrushDrawing,
    HighlighterDrawing,
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
    ElliottWaveDrawing,
    ThreeDrivesDrawing,
    HeadShouldersDrawing,
    HEAD_SHOULDERS_LABELS,
    ABCDPatternDrawing,
    TrianglePatternDrawing,
    LongPositionDrawing,
    ShortPositionDrawing,
    PriceRangeDrawing,
    DateRangeDrawing,
    DatePriceRangeDrawing,
    TextDrawing,
    CalloutDrawing,
    NOTE_TOOL_TYPES,
    NoteToolDrawing,
    PriceLabelDrawing,
    FlagMarkedDrawing,
    StickerDrawing,
    AnchoredVwapDrawing,
    VolumeProfileDrawing,
    PitchToolBase,
    FibTimeToolBase,
    CycleToolBase,
    DoubleCurveDrawing,
    FibCircleToolBase,
    GannToolBase,
    ChannelLinesTool,
    ProjectionDrawing,
    PositionForecastDrawing,
    BarsPatternDrawing,
    GhostFeedDrawing,
} from '../drawings';
import { computeDrawingStats, estimatePricePrecision } from '../drawings/line-tool-common';

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
    private _heatmapRenderer: OrderbookHeatmapRenderer | null = null;
    private _crosshairX: number | null = null;
    private _crosshairY: number | null = null;


    // Callback for indicator legend actions (toggle, settings, remove, more menu)
    public onLegendAction: LegendActionHandler | null = null;

    // Legend header (symbol line) rebuild cache: only symbol / timeframe / theme change it
    private _lastHeaderKey: string = '';
    private _legendHeaderEl: HTMLElement | null = null;
    private _overlayLegend: IndicatorLegendList;
    private _priceMarksSource: (() => PriceMark[]) | null = null;
    private _gradientBottom: string | null = null;

    /** Vertical background gradient (top = layout.backgroundColor); null = solid. */
    setBackgroundGradient(bottom: string | null): void {
        this._gradientBottom = bottom;
    }

    /** Chart key the legend collapse state is stored under (one per chart) */
    setLegendChartKey(key: string): void {
        this._overlayLegend.setChartKey(key);
    }

    get overlayLegend(): IndicatorLegendList {
        return this._overlayLegend;
    }

    constructor(container: HTMLElement, model: ChartModel) {
        this._model = model;
        this._gridRenderer = new GridRenderer(model.options.grid);
        this._watermarkRenderer = new WatermarkRenderer(model.options.watermark);
        this._overlayRenderer = new OverlayIndicatorRenderer();
        this._overlayLegend = new IndicatorLegendList(
            (action, indicator, point) => this.onLegendAction?.(action, indicator, point),
            { collapsible: true, chartKey: 'default' },
        );
        this._createElement(container);
    }

    get element(): HTMLElement | null {
        return this._element;
    }

    get canvas(): HTMLCanvasElement | null {
        return this._canvas;
    }

    setCrosshair(x: number | null, y: number | null): void {
        this._crosshairX = x;
        this._crosshairY = y;
    }

    /**
     * Set overlay indicators to render on the main chart
     */
    /** Yatay izgara cizgilerinin seviyelerini verir (null: ana fiyat olcegi). */
    setPriceMarksSource(source: (() => PriceMark[]) | null): void {
        this._priceMarksSource = source;
    }

    setOverlayIndicators(indicators: readonly OverlayIndicator[]): void {
        this._overlayRenderer.setIndicators([...indicators]);
    }

    /**
     * Set heatmap renderer for orderbook visualization
     */
    setHeatmapRenderer(renderer: OrderbookHeatmapRenderer | null): void {
        this._heatmapRenderer = renderer;
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
        if (this._gradientBottom) {
            const g = this._ctx.createLinearGradient(0, 0, 0, height * dpr);
            g.addColorStop(0, this._model.options.layout.backgroundColor);
            g.addColorStop(1, this._gradientBottom);
            this._ctx.fillStyle = g;
        } else {
            this._ctx.fillStyle = this._model.options.layout.backgroundColor;
        }
        this._ctx.fillRect(0, 0, width * dpr, height * dpr);

        // Draw watermark
        this._watermarkRenderer.updateOptions(this._model.options.watermark);
        this._watermarkRenderer.draw(scope);

        // Get visible range
        const visibleRange = this._model.timeScale.visibleRange();
        if (!visibleRange) return;

        // Draw grid
        // Izgara, fiyat ekseninin gosterdigi seviyelerle hizali (spot modunda kaydirilmis olcek).
        const priceMarks = this._priceMarksSource ? this._priceMarksSource() : this._model.rightPriceScale.marks();
        this._gridRenderer.drawHorizontalLines(scope, priceMarks);

        // Vertical grid at the shared time axis tick marks (round times, stable while scrolling)
        const verticalXCoords: number[] = this._model.timeScale.marks().map(m => m.x);
        this._gridRenderer.drawVerticalLines(scope, verticalXCoords as any);

        // Render background overlay indicators (Histogram style like Volume)
        // These stay BEHIND the candles
        this._overlayRenderer.draw(scope, this._model.timeScale, this._model.rightPriceScale, 'histogram');

        // Render each series (Candles, Lines, etc.)
        for (const series of this._model.serieses) {
            this._renderSeries(scope, series, visibleRange.from, visibleRange.to);
        }

        // Render foreground overlay indicators (EMA, SMA, Bollinger Bands, SAR, etc.)
        // These stay ON TOP of the candles
        this._overlayRenderer.draw(scope, this._model.timeScale, this._model.rightPriceScale, 'non-histogram');

        // Render orderbook heatmap (liquidity visualization on right side)
        if (this._heatmapRenderer) {
            this._heatmapRenderer.drawOnChart(
                scope.context,
                this._model.rightPriceScale,
                width,
                height,
                dpr
            );
        }

        // Draw crosshair
        // x === null with a y set = horizontal-only crosshair (pointer over the price axis).
        if (this._crosshairX !== null || this._crosshairY !== null) {
            const ctx = scope.context;
            const opts = this._model.options.crosshair;
            const hRatio = scope.horizontalPixelRatio;
            const vRatio = scope.verticalPixelRatio;

            ctx.save();

            // Vertical line
            if (opts.vertLine.visible && this._crosshairX !== null) {
                ctx.beginPath();
                ctx.strokeStyle = opts.vertLine.color;
                ctx.lineWidth = Math.max(1, Math.floor(opts.vertLine.width * hRatio));
                const x = Math.round(this._crosshairX * hRatio) + 0.5;

                if (opts.vertLine.style === 'dashed') {
                    ctx.setLineDash([4 * hRatio, 4 * hRatio]);
                } else if (opts.vertLine.style === 'dotted') {
                    ctx.setLineDash([2 * hRatio, 2 * hRatio]);
                }

                ctx.moveTo(x, 0);
                ctx.lineTo(x, scope.bitmapSize.height);
                ctx.stroke();
            }

            // Horizontal line
            if (opts.horzLine.visible && this._crosshairY !== null) {
                ctx.beginPath();
                ctx.strokeStyle = opts.horzLine.color;
                ctx.lineWidth = Math.max(1, Math.floor(opts.horzLine.width * vRatio));
                const y = Math.round(this._crosshairY * vRatio) + 0.5;

                if (opts.horzLine.style === 'dashed') {
                    ctx.setLineDash([4 * hRatio, 4 * hRatio]);
                } else if (opts.horzLine.style === 'dotted') {
                    ctx.setLineDash([2 * hRatio, 2 * hRatio]);
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
        hoveredForAddTextId: string | null = null,
        hoveredDrawingId: string | null = null
    ): void {
        if (!this._ctx || !this._canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const ctx = this._ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const canvasWidth = this._canvas.width;
        const canvasHeight = this._canvas.height;

        ctx.save();
        // Fib araclarinin "log olcege gore seviyeler" secenegi icin.
        const isLogScale = this._model.rightPriceScale.mode === PriceScaleMode.Logarithmic;

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
                    },
                    isLogScale
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
                    },
                    isLogScale
                );
            } else if (drawing instanceof FibChannelDrawing) {
                drawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                drawing.calculateLevelLines(
                    pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })),
                    canvasWidth / dpr,
                    (y: number) => this._model.rightPriceScale.priceRange ? this._model.rightPriceScale.coordinateToPrice(y as any) as number : undefined
                );
            } else if (drawing instanceof BrushDrawing) {
                drawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
            } else if (drawing instanceof HighlighterDrawing) {
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

            // Pitchfork ailesi / Pitchfan: ekran uzayinda hesaplanan geometri (css px)
            if (drawing instanceof PitchToolBase) {
                drawPitchTool(ctx, drawing, pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })), canvasWidth / dpr, canvasHeight / dpr, dpr, drawing.state === 'selected' || drawing.state === 'creating');
                continue;
            }

            // Dongu araclari (Dongusel Cizgiler, Zaman Dongulari, Sinus Cizgisi): ekran uzayinda geometri
            if (drawing instanceof CycleToolBase) {
                drawCycleTool(ctx, drawing, pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })), canvasWidth / dpr, canvasHeight / dpr, dpr, drawing.state === 'selected' || drawing.state === 'creating');
                continue;
            }

            // Fib zaman araclari (Zaman Bolgesi, Trend Tabanli Zaman, Hiz Direnc Yelpazesi): ekran uzayinda geometri
            if (drawing instanceof FibTimeToolBase) {
                drawFibTimeTool(ctx, drawing, pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })), canvasWidth / dpr, canvasHeight / dpr, dpr, drawing.state === 'selected' || drawing.state === 'creating');
                continue;
            }

            // Dairesel fib araclari (Yaylar, Daireler, Spiral, Kama): ekran uzayinda geometri, yuvarlak kalir
            if (drawing instanceof FibCircleToolBase) {
                drawFibCircleTool(ctx, drawing, pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })), canvasWidth / dpr, canvasHeight / dpr, dpr, drawing.state === 'selected' || drawing.state === 'creating');
                continue;
            }

            // Gann araclari (Kutu, Yelpaze, Kare, Sabit Kare): ekran uzayinda geometri
            if (drawing instanceof GannToolBase) {
                // Olcek kilidi yedegi: gorunen fiyat olceginden piksel basina fiyat (P1 satirinda +-0.5 px'in fiyat farki; dogrusal olcekte
                // gorunen fiyat araligi / panel yuksekligi ile ayni, logaritmikte yerel oran)
                let pricePerPx: number | undefined;
                const rps = this._model.rightPriceScale;
                if (drawing.scaleLock && rps.priceRange && pixelPoints.length > 0) {
                    const y1 = pixelPoints[0].y / dpr;
                    const pp = Math.abs((rps.coordinateToPrice((y1 - 0.5) as any) as number) - (rps.coordinateToPrice((y1 + 0.5) as any) as number));
                    if (Number.isFinite(pp) && pp > 0) pricePerPx = pp;
                }
                drawGannTool(ctx, drawing, pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })), canvasWidth / dpr, canvasHeight / dpr, dpr, drawing.state === 'selected' || drawing.state === 'creating', this._model.timeScale.barSpacing, pricePerPx);
                continue;
            }

            // Ayrik Kanal / Duz Ust-Alt: ekran uzayinda iki cizgi + dolgu; istatistikler A cizgisi (P1-P2) icin
            if (drawing instanceof ChannelLinesTool) {
                const cssPts = pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr }));
                const selectedOrCreating = drawing.state === 'selected' || drawing.state === 'creating';
                const lp = drawing.lineProps;
                const statsVisible = lp.alwaysShowStats || selectedOrCreating || hoveredDrawingId === drawing.id;
                const statsLines = statsVisible && cssPts.length >= 2
                    ? computeDrawingStats(lp, drawing.points.slice(0, 2), cssPts.slice(0, 2), this._model.serieses[0]?.data ?? [], timeToPixel, 2, this._model.symbol)
                    : [];
                drawChannelLinesTool(ctx, drawing, cssPts, canvasWidth / dpr, canvasHeight / dpr, dpr, selectedOrCreating, statsLines);
                continue;
            }

            // Projeksiyon (sektor): ekran uzayinda yaylar
            if (drawing instanceof ProjectionDrawing) {
                drawProjectionTool(ctx, drawing, pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })), canvasWidth / dpr, canvasHeight / dpr, dpr, drawing.state === 'selected' || drawing.state === 'creating');
                continue;
            }

            // Tahmin araclari (Pozisyon Tahmini, Bar Deseni, Hayalet Akis): barlardan / sentetik, css px
            if (drawing instanceof PositionForecastDrawing || drawing instanceof BarsPatternDrawing || drawing instanceof GhostFeedDrawing) {
                drawing.setBarData(this._model.serieses[0]?.data ?? []);
                const cssPts = pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr }));
                const selected = drawing.state === 'selected' || drawing.state === 'creating';
                if (drawing instanceof PositionForecastDrawing) {
                    drawPositionForecast(ctx, drawing, cssPts, canvasWidth / dpr, canvasHeight / dpr, dpr, selected, this._model.symbol);
                } else if (drawing instanceof BarsPatternDrawing) {
                    drawBarsPattern(ctx, drawing, cssPts, timeToPixel, priceToPixel, canvasWidth / dpr, canvasHeight / dpr, dpr, selected);
                } else {
                    drawGhostFeed(ctx, drawing, cssPts, priceToPixel, canvasWidth / dpr, canvasHeight / dpr, dpr, selected);
                }
                continue;
            }

            // Hacim tabanli araclar: ana serinin barlarindan hesaplanir
            if (drawing instanceof AnchoredVwapDrawing || drawing instanceof VolumeProfileDrawing) {
                drawing.setBarData(this._model.serieses[0]?.data ?? []);
                const selected = drawing.state === 'selected' || drawing.state === 'creating';
                if (drawing instanceof AnchoredVwapDrawing) {
                    drawAnchoredVwap(ctx, drawing, timeToPixel, priceToPixel, canvasWidth / dpr, canvasHeight / dpr, dpr, selected);
                } else {
                    drawVolumeProfile(ctx, drawing, timeToPixel, priceToPixel, canvasWidth / dpr, canvasHeight / dpr, dpr, selected);
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
            if (drawing.type === 'arrowMarkedUp' || drawing.type === 'arrowMarkedDown' ||
                drawing.type === 'arrowMarkedLeft' || drawing.type === 'arrowMarkedRight') {
                if (pixelPoints.length >= 1) {
                    drawArrowIcon(ctx, drawing as ArrowIconDrawing, pixelPoints[0], dpr, drawing.state === 'selected');
                }
                continue;
            }

            if (drawing.type === 'text') {
                if (pixelPoints.length >= 1) {
                    const textDrawing = drawing as TextDrawing;
                    const isSelected = drawing.state === 'selected' || drawing.state === 'creating';
                    drawText(ctx, textDrawing, pixelPoints[0], dpr, isSelected);
                }
                continue;
            }

            if (drawing.type === 'callout') {
                if (pixelPoints.length >= 1) {
                    const calloutDrawing = drawing as CalloutDrawing;
                    // Update pixel points for hit testing control points
                    calloutDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));

                    const isSelected = drawing.state === 'selected' || drawing.state === 'creating';
                    drawCallout(ctx, calloutDrawing, pixelPoints, dpr, isSelected);
                }
                continue;
            }

            if (NOTE_TOOL_TYPES.has(drawing.type)) {
                if (pixelPoints.length >= 1) {
                    drawNoteTool(ctx, drawing as NoteToolDrawing, pixelPoints, dpr, drawing.state === 'selected' || drawing.state === 'creating');
                }
                continue;
            }

            if (drawing.type === 'priceLabel') {
                if (pixelPoints.length >= 1) {
                    const priceLabelDrawing = drawing as PriceLabelDrawing;
                    // Update pixel points for hit testing control points
                    priceLabelDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));

                    const isSelected = drawing.state === 'selected' || drawing.state === 'creating';
                    // Fiyat, seri hassasiyetiyle (son 100 mumun ondalik sayisi) bicimlenir
                    const plData = this._model.serieses[0]?.data ?? [];
                    const plPrecision = estimatePricePrecision(plData.slice(-100).map((d: any) => Number(d.close ?? d.value)), 2);
                    drawPriceLabel(ctx, priceLabelDrawing, pixelPoints[0], drawing.points[0].price, dpr, isSelected, plPrecision);
                }
                continue;
            }

            if (drawing.type === 'flagMarked') {
                if (pixelPoints.length >= 1) {
                    const flagMarkedDrawing = drawing as FlagMarkedDrawing;
                    const isSelected = drawing.state === 'selected' || drawing.state === 'creating';
                    drawFlagMarked(ctx, flagMarkedDrawing, pixelPoints[0], dpr, isSelected);
                }
                continue;
            }

            if (drawing.type === 'sticker') {
                if (pixelPoints.length >= 1) {
                    const stickerDrawing = drawing as StickerDrawing;
                    const isSelected = drawing.state === 'selected' || drawing.state === 'creating';
                    drawSticker(ctx, stickerDrawing, pixelPoints[0], dpr, isSelected);
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
            if (drawing.type === 'trendLine' || drawing.type === 'ray' || drawing.type === 'extendedLine'
                || drawing.type === 'infoLine' || drawing.type === 'arrow') {
                const trendLine = drawing as TrendLineDrawing;
                const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                const isHoveredForAddText = hoveredForAddTextId === drawing.id;
                const lp = trendLine.lineProps;
                // Istatistikler: hep acik ya da yalnizca secili/uzerinde gelinen cizimde
                const statsVisible = lp.alwaysShowStats || showControlPoints || hoveredDrawingId === drawing.id;
                const statsLines = statsVisible
                    ? computeDrawingStats(
                        lp, drawing.points,
                        pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })),
                        this._model.serieses[0]?.data ?? [],
                        timeToPixel,
                        2,
                        this._model.symbol
                    )
                    : [];
                const ext = trendLine.getScreenExtensions(pixelPoints[0].x, pixelPoints[1].x);
                drawTrendLine(ctx, pixelPoints, drawing.style, showControlPoints, ext.left, ext.right, this._canvas!.width, isHoveredForAddText, { props: lp, statsLines });
            } else if (drawing.type === 'trendAngle') {
                const trendAngle = drawing as TrendLineDrawing;
                const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                // Trend Angle yalnizca fiyat/yuzde/pip/bar istatistiklerini ve orta nokta/fiyat etiketlerini gosterir
                const lp = {
                    ...trendAngle.lineProps,
                    leftEnd: 'normal' as const, rightEnd: 'normal' as const,
                    showDateTimeRange: false, showDistance: false, showAngle: false,
                };
                const statsVisible = lp.alwaysShowStats || showControlPoints || hoveredDrawingId === drawing.id;
                const statsLines = statsVisible
                    ? computeDrawingStats(
                        lp, drawing.points,
                        pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })),
                        this._model.serieses[0]?.data ?? [],
                        timeToPixel,
                        2,
                        this._model.symbol
                    )
                    : [];
                drawTrendAngle(ctx, pixelPoints, drawing.style, dpr, showControlPoints, {
                    extendLeft: trendAngle.extendLeft,
                    extendRight: trendAngle.extendRight,
                    canvasWidth: this._canvas!.width,
                    isHoveredForAddText: hoveredForAddTextId === drawing.id,
                    decor: { props: lp, statsLines },
                });
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
            } else if (drawing instanceof DoubleCurveDrawing) {
                if (pixelPoints.length >= 2) {
                    drawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    drawDoubleCurve(ctx, drawing, pixelPoints, dpr, drawing.state === 'selected' || drawing.state === 'creating');
                }
            } else if (drawing.type === 'xabcdPattern' || drawing.type === 'cypherPattern' || drawing.type === 'elliotImpulse' || drawing.type === 'elliotCorrection' || drawing.type === 'elliotTriangle' || drawing.type === 'elliotDoubleCombo' || drawing.type === 'elliotTripleCombo' || drawing.type === 'threeDrives' || drawing.type === 'headShoulders' || drawing.type === 'abcd' || drawing.type === 'trianglePattern') {
                if (pixelPoints.length >= 2) {
                    const patternDrawing = drawing as XABCDPatternDrawing | ElliottWaveDrawing | ThreeDrivesDrawing | HeadShouldersDrawing | ABCDPatternDrawing | TrianglePatternDrawing;
                    patternDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    let labels: string[] = [];
                    if (drawing.type === 'xabcdPattern' || drawing.type === 'cypherPattern') {
                        labels = ['X', 'A', 'B', 'C', 'D'];
                    } else if (drawing instanceof ElliottWaveDrawing) {
                        labels = drawing.getLabels();
                    } else if (drawing.type === 'abcd') {
                        labels = ['A', 'B', 'C', 'D'];
                    } else if (drawing.type === 'trianglePattern') {
                        labels = ['A', 'B', 'C', 'D'];
                    } else if (drawing.type === 'headShoulders') {
                        labels = HEAD_SHOULDERS_LABELS;
                    } else if (drawing.type === 'threeDrives') {
                        labels = ['', '', '', '', '', '', '']; // no point labels (ratio badges instead)
                    }
                    drawPatternWave(ctx, patternDrawing, pixelPoints, dpr, showControlPoints, labels);
                }
            } else if (drawing.type === 'longPosition') {
                if (pixelPoints.length >= 2) {
                    const positionDrawing = drawing as LongPositionDrawing;
                    positionDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    drawLongPosition(ctx, positionDrawing, pixelPoints, dpr, showControlPoints, priceToPixel, {
                        symbol: this._model.symbol,
                        data: this._model.serieses[0]?.data ?? [],
                        hovered: hoveredDrawingId === drawing.id,
                    });
                }
            } else if (drawing.type === 'shortPosition') {
                if (pixelPoints.length >= 2) {
                    const positionDrawing = drawing as ShortPositionDrawing;
                    positionDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    drawShortPosition(ctx, positionDrawing, pixelPoints, dpr, showControlPoints, priceToPixel, {
                        symbol: this._model.symbol,
                        data: this._model.serieses[0]?.data ?? [],
                        hovered: hoveredDrawingId === drawing.id,
                    });
                }
            } else if (drawing.type === 'priceRange') {
                if (pixelPoints.length >= 2) {
                    const priceRangeDrawing = drawing as PriceRangeDrawing;
                    priceRangeDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';
                    drawPriceRange(ctx, priceRangeDrawing, pixelPoints, dpr, showControlPoints);
                }
            } else if (drawing.type === 'dateRange') {
                if (pixelPoints.length >= 2) {
                    const dateRangeDrawing = drawing as DateRangeDrawing;
                    dateRangeDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';

                    // Calculate bar count and volume
                    const mainSeries = this._model.serieses[0];
                    if (mainSeries && mainSeries.data.length > 0) {
                        const p1 = drawing.points[0];
                        const p2 = drawing.points[1];
                        const startTime = Math.min(p1.time, p2.time);
                        const endTime = Math.max(p1.time, p2.time);

                        let barCount = 0;
                        let totalVolume = 0;
                        for (const item of mainSeries.data) {
                            if (item.time >= startTime && item.time <= endTime) {
                                barCount++;
                                totalVolume += (item as any).volume || 0;
                            }
                        }
                        dateRangeDrawing.barCount = barCount;
                        dateRangeDrawing.volume = totalVolume;
                    }

                    drawDateRange(ctx, dateRangeDrawing, pixelPoints, dpr, showControlPoints);
                }
            } else if (drawing.type === 'datePriceRange') {
                if (pixelPoints.length >= 2) {
                    const datePriceRangeDrawing = drawing as DatePriceRangeDrawing;
                    datePriceRangeDrawing.setPixelPoints(pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr })));
                    const showControlPoints = drawing.state === 'selected' || drawing.state === 'creating';

                    // Calculate bar count and volume
                    const mainSeries = this._model.serieses[0];
                    if (mainSeries && mainSeries.data.length > 0) {
                        const p1 = drawing.points[0];
                        const p2 = drawing.points[1];
                        const startTime = Math.min(p1.time, p2.time);
                        const endTime = Math.max(p1.time, p2.time);

                        let barCount = 0;
                        let totalVolume = 0;
                        for (const item of mainSeries.data) {
                            if (item.time >= startTime && item.time <= endTime) {
                                barCount++;
                                totalVolume += (item as any).volume || 0;
                            }
                        }
                        datePriceRangeDrawing.barCount = barCount;
                        datePriceRangeDrawing.volume = totalVolume;
                    }

                    drawDatePriceRange(ctx, datePriceRangeDrawing, pixelPoints, dpr, showControlPoints);
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
        this._legendHeaderEl = null;
    }

    /**
     * Set theme colors for the pane
     */
    setTheme(theme: 'dark' | 'light'): void {
        this._currentTheme = theme;
        // Force legend rebuild
        this._lastHeaderKey = '';
        this._updateLegend();
    }

    private _currentTheme: 'dark' | 'light' = 'dark';

    private _updateLegend(): void {
        if (!this._legendElement) return;

        // Theme-based colors
        const isDark = this._currentTheme === 'dark';
        const labelColor = isDark ? '#787b86' : '#131722';
        const textColor = isDark ? '#d1d4dc' : '#131722';
        const secondaryColor = isDark ? '#787b86' : '#5d606b';

        const symbol = this._model.symbol || '---';
        const shownSymbol = displaySymbol(symbol);
        const timeframe = this._model.timeframe || '---';

        // Find main series for OHLC
        const mainSeries = this._model.serieses[0];
        let ohlcText = '';
        // Fare altindaki (yoksa son) mum indeksi; overlay legend hook'lari icin.
        let legendBarIndex: number | null = null;

        if (mainSeries) {
            const crosshair = this._model.crosshairPosition;
            let barIndex: TimePointIndex | null = null;

            if (crosshair && crosshair.visible) {
                barIndex = this._model.timeScale.coordinateToIndex(coordinate(crosshair.x));
            } else {
                // Use last bar if crosshair not visible
                barIndex = (this._model.timeScale.pointsCount - 1) as TimePointIndex;
            }

            legendBarIndex = barIndex as number;
            const mainSeriesData = mainSeries instanceof HeikenAshiSeries ? mainSeries.haData : mainSeries.data;
            const bar = mainSeriesData[barIndex];
            const prevBar = barIndex > 0 ? mainSeriesData[barIndex - 1] : null;

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
                    <span style="margin-left: 12px; color: ${labelColor}; font-size: 12px;">O<span style="color: ${priceColor}; margin-left: 2px;">${format(bar.open)}</span></span>
                    <span style="margin-left: 8px; color: ${labelColor}; font-size: 12px;">H<span style="color: ${priceColor}; margin-left: 2px;">${format(bar.high)}</span></span>
                    <span style="margin-left: 8px; color: ${labelColor}; font-size: 12px;">L<span style="color: ${priceColor}; margin-left: 2px;">${format(bar.low)}</span></span>
                    <span style="margin-left: 8px; color: ${labelColor}; font-size: 12px;">C<span style="color: ${priceColor}; margin-left: 2px;">${format(bar.close)}</span></span>
                    ${changeText}
                    <span style="margin-left: 12px; color: ${labelColor}; font-size: 12px;">Vol<span style="color: ${priceColor}; margin-left: 4px;">${formatVol(bar.volume || 0)}</span></span>
                `;
            }
        }

        // Header (symbol line) is rebuilt only when symbol / timeframe / theme change
        const headerKey = `${symbol}|${timeframe}|${this._currentTheme}|${this._model.marketTypeDisplayName}|${this._model.exchangeDisplayName}`;
        if (headerKey !== this._lastHeaderKey && this._legendHeaderEl) {
            this._lastHeaderKey = headerKey;
            this._legendHeaderEl.innerHTML = `
                <div style="width: 16px; height: 16px; border-radius: 50%; background: #2962ff; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: bold; color: white; margin-right: 6px;">${shownSymbol[0]}</div>
                <span style="font-weight: bold; color: ${textColor}; font-size: 13px;">${shownSymbol}</span>
                <span style="margin-left: 6px; color: ${secondaryColor}; font-size: 13px;">${this._model.marketTypeDisplayName}</span>
                <span style="margin-left: 6px; color: ${textColor}; font-size: 13px;">• ${timeframe} • ${this._model.exchangeDisplayName}</span>
                <div style="width: 8px; height: 8px; border-radius: 50%; background: #26a69a; margin-left: 8px; box-shadow: 0 0 5px #26a69a;"></div>
                <span class="ohlc-text"></span>
            `;
        }

        const ohlcSpan = this._legendElement.querySelector('.ohlc-text');
        if (ohlcSpan) {
            ohlcSpan.innerHTML = ohlcText;
        }

        // Indicator rows (title + parameters, values at the crosshair bar, hover buttons)
        this._overlayLegend.update(this._overlayRenderer.indicators, legendBarIndex, this._currentTheme);
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
            touch-action: none;
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
            pointer-events: none;
        `;
        this._legendHeaderEl = document.createElement('div');
        this._legendHeaderEl.style.cssText = 'display: flex; align-items: center; white-space: nowrap; pointer-events: none; height: 20px;';
        this._legendElement.appendChild(this._legendHeaderEl);
        this._overlayLegend.element.style.marginTop = `${LEGEND_STYLE.metrics.topOffset}px`;
        this._legendElement.appendChild(this._overlayLegend.element);
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
