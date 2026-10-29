/**
 * Indicator Pane Widget
 * 
 * A separate pane for rendering panel indicators (RSI, MACD, etc.)
 * Each pane has its own canvas, price scale, and can be resized.
 */

import { startDragSession } from '../helpers/drag-session';
import { PriceScale } from '../model/price-scale';
import { TimeScale } from '../model/time-scale';
import { CrosshairOptions, GridOptions } from '../model/chart-model';
import { PanelIndicator, IndicatorDataPoint } from './indicator';
import { PaneWidget } from '../gui/pane-widget';
import { Drawing } from '../drawings';
import { IndicatorLegendList, LegendActionHandler, LEGEND_STYLE } from '../gui/indicator_legend';
import { PANE_STYLE, PaneAction, paneColors } from './pane-layout';
import { t } from '../helpers/translations';

/** Disposable interface for cleanup */
interface Disposable {
    dispose(): void;
}

/**
 * Indicator pane options
 */
export interface IndicatorPaneOptions {
    height: number;
    minHeight: number;
    maxHeight: number;
    backgroundColor: string;
    borderColor: string;
    showPriceScale: boolean;
    priceScaleWidth: number;
    priceAxisBackgroundColor: string;
    priceAxisTextColor: string;
    priceAxisBorderColor: string;
    gridColor: string;
    crosshairColor: string;
}

const defaultIndicatorPaneOptions: IndicatorPaneOptions = {
    height: 100,
    minHeight: 50,
    maxHeight: Infinity,
    backgroundColor: '#1a1a2e',
    borderColor: 'rgba(255, 255, 255, 0.06)',
    showPriceScale: true,
    priceScaleWidth: 80,
    priceAxisBackgroundColor: '#16213e',
    priceAxisTextColor: 'rgba(255, 255, 255, 0.5)',
    priceAxisBorderColor: 'rgba(255, 255, 255, 0.1)',
    gridColor: 'rgba(255, 255, 255, 0.06)',
    crosshairColor: 'rgba(255, 255, 255, 0.4)',
};

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
 * Indicator Pane Widget
 */
export class IndicatorPaneWidget implements Disposable {
    private readonly _timeScale: TimeScale;
    /** Chart grid options (shared reference with the chart model); null = fallback to gridColor */
    private _gridOptions: GridOptions | null = null;
    /** Chart crosshair options (shared reference); null = built-in look */
    private _crosshairOptions: CrosshairOptions | null = null;
    private _gradientBottom: string | null = null;
    private readonly _priceScale: PriceScale;
    private readonly _options: IndicatorPaneOptions;

    private _element: HTMLElement | null = null;
    private _canvas: HTMLCanvasElement | null = null;
    private _ctx: CanvasRenderingContext2D | null = null;
    private _priceAxisCanvas: HTMLCanvasElement | null = null;
    private _priceAxisCtx: CanvasRenderingContext2D | null = null;
    private _resizeHandle: HTMLElement | null = null;
    private _legend: IndicatorLegendList | null = null;
    private _legendHost: HTMLElement | null = null;
    private _theme: 'dark' | 'light' = 'dark';

    private _width: number = 0;
    private _height: number = 0;
    private _indicators: PanelIndicator[] = [];

    /** User height (what a restore / expand returns to); `_height` is the content height drawn now */
    private _normalHeight: number = 0;
    private _layoutHidden: boolean = false;
    private _collapsed: boolean = false;
    private _controlsEl: HTMLElement | null = null;
    private _separatorLine: HTMLElement | null = null;
    private _controlsState = { canUp: false, canDown: false, maximized: false, collapsed: false };
    private _endSeparatorDrag: (() => void) | null = null;

    private _crosshairX: number | null = null;
    private _crosshairY: number | null = null;
    private _lastValueLabel: { price: number; text: string; color: string } | null = null;
    private _chartData: readonly any[] = [];


    constructor(
        container: HTMLElement,
        timeScale: TimeScale,
        options: Partial<IndicatorPaneOptions> = {}
    ) {
        this._timeScale = timeScale;
        this._options = { ...defaultIndicatorPaneOptions, ...options };
        this._priceScale = new PriceScale({ autoScale: true });

        this._createElement(container);

        // Properly initialize height (this will also set priceScale height and canvas attributes)
        this.setHeight(this._options.height);
    }

    // --- Getters ---

    get element(): HTMLElement | null {
        return this._element;
    }

    get canvas(): HTMLCanvasElement | null {
        return this._canvas;
    }

    get height(): number {
        // Return 0 when hidden so layout calculations work correctly
        if (this._isHidden || this._layoutHidden) return 0;
        return this._collapsed ? PANE_STYLE.metrics.collapsedHeight : this._height;
    }

    get actualHeight(): number {
        return this._normalHeight;
    }

    get collapsed(): boolean {
        return this._collapsed;
    }

    get priceScale(): PriceScale {
        return this._priceScale;
    }

    get indicators(): readonly PanelIndicator[] {
        return this._indicators;
    }

    get isHidden(): boolean {
        return this._isHidden;
    }

    // --- Visibility ---

    private _isHidden: boolean = false;

    /** Hide the indicator pane */
    hide(): void {
        this._isHidden = true;
        this._applyDisplay();
    }

    /** Show the indicator pane */
    show(): void {
        this._isHidden = false;
        this._applyDisplay();
    }

    private _applyDisplay(): void {
        if (this._element) {
            this._element.style.display = this._isHidden || this._layoutHidden ? 'none' : 'flex';
        }
    }

    /**
     * Apply the resolved layout: hidden (other pane maximized / hidden on this timeframe),
     * collapsed (legend row only) and the content height (full available height when maximized).
     */
    applyLayout(layout: { hidden: boolean; collapsed: boolean; displayHeight: number; contentHeight: number }): void {
        this._layoutHidden = layout.hidden;
        this._collapsed = layout.collapsed;
        this._applyDisplay();
        this._setContentHeight(Math.max(1, layout.contentHeight));
        if (this._element) {
            this._element.style.height = `${layout.collapsed ? PANE_STYLE.metrics.collapsedHeight : this._height}px`;
        }
        // Collapsed: the plot and axis are not drawn, only the legend row and controls remain
        const vis = layout.collapsed ? 'hidden' : 'visible';
        if (this._canvas) this._canvas.style.visibility = vis;
        if (this._priceAxisCanvas) this._priceAxisCanvas.style.visibility = vis;
        this._renderControls();
    }

    /** Button state: neighbours exist / maximized / collapsed */
    setControlsState(state: { canUp: boolean; canDown: boolean; maximized: boolean; collapsed: boolean }): void {
        const cur = this._controlsState;
        if (cur.canUp === state.canUp && cur.canDown === state.canDown
            && cur.maximized === state.maximized && cur.collapsed === state.collapsed) return;
        this._controlsState = { ...state };
        this._renderControls();
    }

    // --- Indicator management ---


    hasIndicator(indicator: PanelIndicator): boolean {
        return this._indicators.includes(indicator);
    }


    // --- Size management ---

    setWidth(width: number, priceScaleWidth?: number): void {
        this._width = width;
        if (priceScaleWidth !== undefined && priceScaleWidth !== this._options.priceScaleWidth) {
            this._options.priceScaleWidth = priceScaleWidth;
            if (this._priceAxisCanvas) {
                this._priceAxisCanvas.style.width = `${priceScaleWidth}px`;
                const dpr = window.devicePixelRatio || 1;
                this._priceAxisCanvas.width = priceScaleWidth * dpr;
            }
        }
        const chartWidth = width - this._options.priceScaleWidth;

        if (this._element) {
            this._element.style.width = `${width}px`;
        }

        if (this._canvas) {
            const dpr = window.devicePixelRatio || 1;
            this._canvas.style.width = `${chartWidth}px`;
            this._canvas.width = chartWidth * dpr;
        }

        if (this._legendHost) {
            this._legendHost.style.right = `${this._options.priceScaleWidth + LEGEND_STYLE.metrics.reservedRight}px`;
        }
        if (this._controlsEl) {
            this._controlsEl.style.right = `${this._options.priceScaleWidth + PANE_STYLE.metrics.controlsRight}px`;
        }
    }

    setHeight(height: number): void {
        this._normalHeight = Math.max(
            this._options.minHeight,
            Math.min(this._options.maxHeight, height)
        );
        this._setContentHeight(this._normalHeight);
        if (this._element) {
            this._element.style.height = `${this.height}px`;
        }
    }

    private _setContentHeight(height: number): void {
        if (height === this._height) return;
        this._height = height;

        if (this._canvas) {
            const dpr = window.devicePixelRatio || 1;
            this._canvas.style.height = `${this._height}px`;
            this._canvas.height = this._height * dpr;
        }

        this._priceScale.setHeight(this._height);

        if (this._priceAxisCanvas) {
            const dpr = window.devicePixelRatio || 1;
            this._priceAxisCanvas.style.height = `${this._height}px`;
            this._priceAxisCanvas.height = this._height * dpr;
        }

        this._priceScale.setHeight(this._height);
    }

    // --- Rendering ---

    render(): void {
        this._updatePriceRange();
        this._renderChart();
        this._renderPriceAxis();
        this._updateLegend();
    }

    setChartData(data: readonly any[]): void {
        this._chartData = data;
    }

    renderDrawings(
        drawings: Drawing[],
        timeToPixel: (time: number) => number | null,
        priceToPixel: (price: number) => number | null,
        hoveredForAddTextId: string | null = null
    ): void {
        if (!this._ctx || !this._canvas || drawings.length === 0) return;

        (PaneWidget.prototype as any).renderDrawings.call(
            {
                _ctx: this._ctx,
                _canvas: this._canvas,
                _model: { serieses: [{ data: this._chartData }], rightPriceScale: this._priceScale },
            },
            drawings,
            timeToPixel,
            priceToPixel,
            hoveredForAddTextId
        );
    }

    private _renderChart(): void {
        if (!this._ctx || !this._canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const width = this._width - this._options.priceScaleWidth;
        const height = this._height;

        // Create scope
        const scope: BitmapCoordinatesScope = {
            context: this._ctx,
            mediaSize: { width, height },
            bitmapSize: { width: width * dpr, height: height * dpr },
            horizontalPixelRatio: dpr,
            verticalPixelRatio: dpr,
        };

        // Clear canvas
        this._ctx.setTransform(1, 0, 0, 1, 0, 0);
        this._ctx.scale(dpr, dpr);
        if (this._gradientBottom) {
            const g = this._ctx.createLinearGradient(0, 0, 0, height);
            g.addColorStop(0, this._options.backgroundColor);
            g.addColorStop(1, this._gradientBottom);
            this._ctx.fillStyle = g;
        } else {
            this._ctx.fillStyle = this._options.backgroundColor;
        }
        this._ctx.fillRect(0, 0, width, height);

        // Draw top border
        this._ctx.strokeStyle = this._options.borderColor;
        this._ctx.lineWidth = 1;
        this._ctx.beginPath();
        this._ctx.moveTo(0, 0.5);
        this._ctx.lineTo(width, 0.5);
        this._ctx.stroke();

        // Draw horizontal grid lines
        this._drawGrid(scope);

        // Draw each indicator
        for (const indicator of this._indicators) {
            if (indicator.shown) {
                this._drawIndicator(scope, indicator);
            }
        }

        // Draw crosshair
        this._drawCrosshair(scope);
    }

    setCrosshair(x: number | null, y: number | null): void {
        this._crosshairX = x;
        this._crosshairY = y;
    }

    private _drawCrosshair(scope: BitmapCoordinatesScope): void {
        const { context: ctx, mediaSize } = scope;

        if (this._crosshairX === null) return;

        const co = this._crosshairOptions;
        const dash = (style: string) =>
            ctx.setLineDash(style === 'dotted' ? [2, 2] : style === 'solid' ? [] : [4, 4]);
        const v = co ? co.vertLine : { visible: true, color: this._options.crosshairColor, width: 1, style: 'dashed' };
        const h = co ? co.horzLine : { visible: true, color: this._options.crosshairColor, width: 1, style: 'dashed' };

        // Draw vertical line (X axis)
        if (v.visible) {
            ctx.strokeStyle = v.color;
            ctx.lineWidth = Math.max(1, v.width);
            dash(v.style);
            ctx.beginPath();
            ctx.moveTo(this._crosshairX + 0.5, 0);
            ctx.lineTo(this._crosshairX + 0.5, mediaSize.height);
            ctx.stroke();
        }

        // Draw horizontal line (Y axis - only if mouse is over this pane)
        if (h.visible && this._crosshairY !== null) {
            ctx.strokeStyle = h.color;
            ctx.lineWidth = Math.max(1, h.width);
            dash(h.style);
            ctx.beginPath();
            ctx.moveTo(0, this._crosshairY + 0.5);
            ctx.lineTo(mediaSize.width, this._crosshairY + 0.5);
            ctx.stroke();
        }

        ctx.setLineDash([]);
        ctx.lineWidth = 1;
    }

    /** Share the chart's crosshair options (color / style / width / visibility). */
    public setCrosshairOptions(opts: CrosshairOptions | null): void {
        this._crosshairOptions = opts;
    }

    /** Custom background (user canvas settings). bottom null = solid. */
    public setBackground(top: string, bottom: string | null): void {
        this._options.backgroundColor = top;
        this._options.priceAxisBackgroundColor = top;
        this._gradientBottom = bottom;
        if (this._element) {
            this._element.style.background = bottom ? `linear-gradient(${top}, ${bottom})` : top;
        }
    }

    /** Repaint the separator line (after the separator color changed). */
    public repaintSeparator(): void {
        this._paintSeparator(false);
    }

    /** Share the chart's grid options (visible / color / style per direction). */
    public setGridOptions(grid: GridOptions | null): void {
        this._gridOptions = grid;
    }

    private _drawGrid(scope: BitmapCoordinatesScope): void {
        const { context: ctx, mediaSize } = scope;
        const g = this._gridOptions;
        const horz = g ? g.horzLines : { visible: true, color: this._options.gridColor, style: 'solid' as const };
        const vert = g ? g.vertLines : { visible: true, color: this._options.gridColor, style: 'solid' as const };
        const dash = (style: string) =>
            ctx.setLineDash(style === 'dashed' ? [5, 3] : style === 'dotted' ? [2, 2] : []);

        ctx.lineWidth = 1;

        if (horz.visible) {
            ctx.strokeStyle = horz.color;
            dash(horz.style);
            for (const mark of this._priceScale.marks()) {
                const y = Math.round(mark.coord) + 0.5;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(mediaSize.width, y);
                ctx.stroke();
            }
        }

        if (vert.visible) {
            ctx.strokeStyle = vert.color;
            dash(vert.style);
            for (const mark of this._timeScale.marks()) {
                const x = Math.round(mark.x) + 0.5;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, mediaSize.height);
                ctx.stroke();
            }
        }

        ctx.setLineDash([]);
    }

    private _drawIndicator(scope: BitmapCoordinatesScope, indicator: PanelIndicator): void {
        const { context: ctx, mediaSize } = scope;
        const data = indicator.data;
        const visibleRange = this._timeScale.visibleRange();

        if (!visibleRange || data.length === 0) return;

        const options = indicator.options;

        // Draw level lines if available (e.g., RSI overbought/oversold)
        if ('getLevelLines' in indicator && typeof (indicator as any).getLevelLines === 'function') {
            const levelLines = (indicator as any).getLevelLines();
            for (const level of levelLines) {
                const y = this._priceScale.priceToCoordinate(level.y);

                // Draw dashed line
                ctx.strokeStyle = level.color;
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(mediaSize.width, y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        const startIndex = Math.max(0, Math.floor(visibleRange.from as number));
        const endIndex = Math.min(data.length - 1, Math.ceil(visibleRange.to as number));

        // Handle Histogram
        if ('isHistogram' in indicator && (indicator as any).isHistogram === true) {
            this._drawHistogram(ctx, indicator, startIndex, endIndex);
        }

        // Handle Multi-line
        if (data[0]?.values && data[0].values.length > 0) {
            this._drawMultiLine(ctx, indicator, data, startIndex, endIndex);
        } else {
            // Single line indicator
            ctx.strokeStyle = options.color;
            ctx.lineWidth = options.lineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.beginPath();
            let started = false;

            for (let i = startIndex; i <= endIndex; i++) {
                const point = data[i];
                if (point === undefined || point.value === undefined || isNaN(point.value)) continue;

                const x = this._timeScale.indexToCoordinate(i as any);
                const y = this._priceScale.priceToCoordinate(point.value);

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

    private _drawHistogram(
        ctx: CanvasRenderingContext2D,
        indicator: PanelIndicator,
        startIndex: number,
        endIndex: number
    ): void {
        const barWidth = 0.6 * this._timeScale.barSpacing;
        const zeroY = this._priceScale.priceToCoordinate(0);

        for (let i = startIndex; i <= endIndex; i++) {
            const value = (indicator as any).getHistogramValue?.(i) ?? NaN;
            if (isNaN(value)) continue;

            const x = this._timeScale.indexToCoordinate(i as any);
            const y = this._priceScale.priceToCoordinate(value);

            // Use dynamic color if available, otherwise fallback to MACD-style logic
            if (typeof (indicator as any).getHistogramColor === 'function') {
                ctx.fillStyle = (indicator as any).getHistogramColor(i);
            } else {
                ctx.fillStyle = value >= 0 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)';
            }

            ctx.fillRect(x - barWidth / 2, Math.min(y, zeroY), barWidth, Math.abs(y - zeroY));
        }
    }

    private _drawMultiLine(
        ctx: CanvasRenderingContext2D,
        indicator: PanelIndicator,
        data: readonly IndicatorDataPoint[],
        startIndex: number,
        endIndex: number
    ): void {
        const options = indicator.options;
        const lineCount = data[0]?.values?.length || 0;

        // Define standard MACD/Multi-line colors if not provided
        const lineColors = (indicator as any).getLineColors?.() || [options.color, '#ff6d00', '#2196f3'];

        if (typeof (indicator as any).getLineFills === 'function' && typeof (indicator as any).getLineFillColor === 'function') {
            const fills = (indicator as any).getLineFills() as Array<{ from: number; to: number }>;
            if (Array.isArray(fills)) {
                for (const fill of fills) {
                    this._drawLineFill(ctx, indicator, data, startIndex, endIndex, fill.from, fill.to);
                }
            }
        }

        for (let lineIdx = 0; lineIdx < lineCount; lineIdx++) {
            ctx.lineWidth = options.lineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            let previousX: number | null = null;
            let previousY: number | null = null;
            let previousColor: string | null = null;

            for (let i = startIndex; i <= endIndex; i++) {
                const point = data[i];
                const values = point?.values;
                if (!values || values[lineIdx] === undefined || isNaN(values[lineIdx])) continue;

                const x = this._timeScale.indexToCoordinate(i as any);
                const y = this._priceScale.priceToCoordinate(values[lineIdx]);
                const color = (indicator as any).getLineColor?.(lineIdx, i, values[lineIdx], point)
                    || lineColors[lineIdx]
                    || options.color;

                if (previousX !== null && previousY !== null) {
                    ctx.beginPath();
                    ctx.strokeStyle = previousColor ?? color;
                    ctx.moveTo(previousX, previousY);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                }

                previousX = x;
                previousY = y;
                previousColor = color;
            }
        }
    }

    private _drawLineFill(
        ctx: CanvasRenderingContext2D,
        indicator: PanelIndicator,
        data: readonly IndicatorDataPoint[],
        startIndex: number,
        endIndex: number,
        fromLineIndex: number,
        toLineIndex: number
    ): void {
        let previousX: number | null = null;
        let previousFromY: number | null = null;
        let previousToY: number | null = null;

        for (let i = startIndex; i <= endIndex; i++) {
            const point = data[i];
            const values = point?.values;
            if (!values) {
                previousX = null;
                previousFromY = null;
                previousToY = null;
                continue;
            }

            const fromValue = values[fromLineIndex];
            const toValue = values[toLineIndex];
            if (fromValue === undefined || toValue === undefined || isNaN(fromValue) || isNaN(toValue)) {
                previousX = null;
                previousFromY = null;
                previousToY = null;
                continue;
            }

            const x = this._timeScale.indexToCoordinate(i as any);
            const fromY = this._priceScale.priceToCoordinate(fromValue);
            const toY = this._priceScale.priceToCoordinate(toValue);

            if (previousX !== null && previousFromY !== null && previousToY !== null) {
                ctx.beginPath();
                ctx.moveTo(previousX, previousFromY);
                ctx.lineTo(x, fromY);
                ctx.lineTo(x, toY);
                ctx.lineTo(previousX, previousToY);
                ctx.closePath();
                ctx.fillStyle = (indicator as any).getLineFillColor(fromLineIndex, toLineIndex, i, point);
                ctx.fill();
            }

            previousX = x;
            previousFromY = fromY;
            previousToY = toY;
        }
    }

    private _renderPriceAxis(): void {
        if (!this._priceAxisCtx || !this._priceAxisCanvas) return;

        const dpr = window.devicePixelRatio || 1;
        const width = this._options.priceScaleWidth;
        const height = this._height;

        this._priceAxisCtx.setTransform(1, 0, 0, 1, 0, 0);
        this._priceAxisCtx.scale(dpr, dpr);

        // Background
        this._priceAxisCtx.fillStyle = this._options.priceAxisBackgroundColor;
        this._priceAxisCtx.fillRect(0, 0, width, height);

        // Left border
        this._priceAxisCtx.strokeStyle = this._options.priceAxisBorderColor;
        this._priceAxisCtx.lineWidth = 1;
        this._priceAxisCtx.beginPath();
        this._priceAxisCtx.moveTo(0.5, 0);
        this._priceAxisCtx.lineTo(0.5, height);
        this._priceAxisCtx.stroke();

        // Price labels
        const marks = this._priceScale.marks();
        this._priceAxisCtx.fillStyle = this._options.priceAxisTextColor;
        this._priceAxisCtx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        this._priceAxisCtx.textAlign = 'right';
        this._priceAxisCtx.textBaseline = 'middle';

        for (const mark of marks) {
            this._priceAxisCtx.fillText(mark.label, width - 8, mark.coord);
        }

        this._updateLastValueLabel();

        if (this._lastValueLabel) {
            const y = this._priceScale.priceToCoordinate(this._lastValueLabel.price);
            this._drawAxisLabel(y, this._lastValueLabel.text, this._lastValueLabel.color, true);
        }

        if (this._crosshairY !== null) {
            const value = this._priceScale.coordinateToPrice(this._crosshairY as any);
            const text = this._priceScale.formatPrice(value);
            this._drawAxisLabel(this._crosshairY, text, '#2962ff', false);
        }
    }

    private _updateLastValueLabel(): void {
        this._lastValueLabel = null;
        if (this._indicators.length === 0) return;

        const indicator = this._indicators[0];
        const data = indicator.data;
        if (data.length === 0) return;

        for (let i = data.length - 1; i >= 0; i--) {
            const point = data[i];
            const price = this._resolveLabelValue(point);
            if (price === null) {
                continue;
            }

            const text = this._priceScale.formatPrice(price);
            const color = this._resolveLabelColor(indicator);
            this._lastValueLabel = { price, text, color };
            return;
        }
    }

    private _resolveLabelValue(point: IndicatorDataPoint | undefined): number | null {
        if (!point) return null;

        if (point.values && point.values.length > 0 && !isNaN(point.values[0])) {
            return point.values[0];
        }

        if (!isNaN(point.value)) {
            return point.value;
        }

        return null;
    }

    private _resolveLabelColor(indicator: PanelIndicator): string {
        if ('getLineColors' in indicator && typeof (indicator as any).getLineColors === 'function') {
            const colors = (indicator as any).getLineColors();
            if (Array.isArray(colors) && colors.length > 0 && colors[0]) {
                return colors[0];
            }
        }

        return indicator.options.color;
    }

    private _drawAxisLabel(y: number, text: string, color: string, isLastValue: boolean): void {
        if (!this._priceAxisCtx || !this._element) return;
        const ctx = this._priceAxisCtx;
        const width = this._options.priceScaleWidth;
        const height = this._height;

        if (y < -20 || y > height + 20) return;

        const padding = 8;
        ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const textWidth = ctx.measureText(text).width;
        const boxHeight = 20;
        const boxWidth = textWidth + (padding * 2);
        const boxY = y - (boxHeight / 2);
        const boxX = width - boxWidth;

        ctx.fillStyle = color;
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, boxX + (boxWidth / 2), y);

        if (isLastValue) {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.moveTo(0, y);
            ctx.lineTo(boxX, y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    private _updatePriceRange(): void {
        if (this._indicators.length === 0) return;

        let min = Infinity;
        let max = -Infinity;
        let hasFixedRange = false;

        const visibleRange = this._timeScale.visibleRange();

        for (const indicator of this._indicators) {
            const range = indicator.getRange(visibleRange);

            // Use fixed range if available (e.g., RSI 0-100)
            if (range.fixedMin !== undefined && range.fixedMax !== undefined) {
                min = range.fixedMin;
                max = range.fixedMax;
                hasFixedRange = true;
                break;
            }

            min = Math.min(min, range.min);
            max = Math.max(max, range.max);
        }

        if (min !== Infinity && max !== -Infinity) {
            // Add padding for non-fixed ranges
            if (!hasFixedRange) {
                const padding = (max - min) * 0.1;
                min -= padding;
                max += padding;
            }
            this._priceScale.updatePriceRange(min, max);
        }
    }

    // --- Element creation ---

    private _createElement(container: HTMLElement): void {
        this._element = document.createElement('div');
        this._element.style.cssText = `
            display: flex;
            flex-direction: row;
            width: 100%;
            height: ${this._height}px;
            position: relative;
            flex-shrink: 0;
        `;

        // Legend row (title, parameters, values, hover buttons) at the top-left of the pane.
        // The right side of the pane top stays free for pane header controls.
        this._legend = new IndicatorLegendList(
            (action, indicator, point) => this.onLegendAction?.(action, indicator, point),
            { collapsible: false, chartKey: 'pane' },
        );
        this._legendHost = document.createElement('div');
        this._legendHost.style.cssText = `
            position: absolute;
            top: 6px;
            left: 12px;
            right: ${this._options.priceScaleWidth + LEGEND_STYLE.metrics.reservedRight}px;
            z-index: 11;
            pointer-events: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;
        this._legendHost.appendChild(this._legend.element);
        this._element.appendChild(this._legendHost);

        // Main canvas
        this._canvas = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;
        this._canvas.style.cssText = `
            display: block;
            flex: 1;
            touch-action: none;
        `;
        this._canvas.height = this._height * dpr;
        this._ctx = this._canvas.getContext('2d');

        // Double-click on the empty plot toggles maximize (TradingView); settings: legend row / button
        this._canvas.addEventListener('dblclick', () => this._emitPaneAction('maximize'));

        this._element.appendChild(this._canvas);

        // Price axis canvas
        this._priceAxisCanvas = document.createElement('canvas');
        this._priceAxisCanvas.style.cssText = `
            display: block;
            width: ${this._options.priceScaleWidth}px;
            flex-shrink: 0;
            cursor: ns-resize;
            touch-action: none;
        `;
        this._priceAxisCanvas.width = this._options.priceScaleWidth * dpr;
        this._priceAxisCanvas.height = this._height * dpr;
        this._priceAxisCtx = this._priceAxisCanvas.getContext('2d');
        this._element.appendChild(this._priceAxisCanvas);

        // Add drag scaling to indicator price axis
        let endScaleSession: (() => void) | null = null;
        this._priceAxisCanvas.addEventListener('mousedown', (e: MouseEvent) => {
            if (e.button !== 0) return;
            endScaleSession?.();
            this._priceScale.startScale(e.clientY);
            endScaleSession = startDragSession(
                (ev) => this._priceScale.scaleTo(ev.clientY),
                () => {
                    this._priceScale.endScale();
                    endScaleSession = null;
                },
            );
            e.preventDefault();
        });

        // Separator (top edge): 1px line in the middle of a row-resize hit zone
        const m = PANE_STYLE.metrics;
        this._resizeHandle = document.createElement('div');
        this._resizeHandle.className = 'tvp-separator';
        this._resizeHandle.style.cssText = `
            position: absolute;
            top: -${Math.floor(m.separatorZone / 2)}px;
            left: 0;
            right: 0;
            height: ${m.separatorZone}px;
            cursor: row-resize;
            z-index: 13;
        `;
        this._separatorLine = document.createElement('div');
        this._separatorLine.style.cssText = `
            position: absolute; left: 0; right: 0; top: ${Math.floor(m.separatorZone / 2)}px; height: 1px; pointer-events: none;
        `;
        this._resizeHandle.appendChild(this._separatorLine);
        this._resizeHandle.addEventListener('mouseenter', () => this._paintSeparator(true));
        this._resizeHandle.addEventListener('mouseleave', () => { if (!this._endSeparatorDrag) this._paintSeparator(false); });
        this._resizeHandle.addEventListener('mousedown', this._onSeparatorDown);
        this._resizeHandle.addEventListener('dblclick', () => this._emitPaneAction('maximize'));
        this._element.appendChild(this._resizeHandle);

        // Controls (move up / down, maximize, collapse, delete) at the top-right, shown on hover
        this._controlsEl = document.createElement('div');
        this._controlsEl.className = 'tvp-controls';
        this._controlsEl.style.cssText = `
            position: absolute;
            top: ${m.controlsTop}px;
            right: ${this._options.priceScaleWidth + m.controlsRight}px;
            display: none;
            align-items: center;
            z-index: 12;
            border-radius: ${m.radius}px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;
        this._element.appendChild(this._controlsEl);
        this._element.addEventListener('mouseenter', () => this._showControls(true));
        this._element.addEventListener('mouseleave', () => this._showControls(false));
        this._renderControls();
        this._paintSeparator(false);
        this._element.style.background = this._options.backgroundColor;

        container.appendChild(this._element);
    }

    // --- Separator / controls ---

    /** Separator drag: the chart widget resizes the neighbouring panes */
    public onSeparatorDrag?: (phase: 'start' | 'move' | 'end', clientY: number) => void;

    /** Pane header buttons (up / down / maximize / collapse / delete) */
    public onPaneAction?: (action: PaneAction, indicator: PanelIndicator) => void;

    private _emitPaneAction(action: PaneAction): void {
        const ind = this._indicators[0];
        if (ind) this.onPaneAction?.(action, ind);
    }

    private _onSeparatorDown = (e: MouseEvent): void => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        this._endSeparatorDrag?.();
        this._paintSeparator(true);
        this.onSeparatorDrag?.('start', e.clientY);
        this._endSeparatorDrag = startDragSession(
            (ev) => this.onSeparatorDrag?.('move', ev.clientY),
            () => {
                this._endSeparatorDrag = null;
                this._paintSeparator(false);
                this.onSeparatorDrag?.('end', 0);
            },
        );
    };

    private _paintSeparator(hover: boolean): void {
        const c = paneColors(this._theme);
        if (this._resizeHandle) this._resizeHandle.style.background = hover ? c.zoneHover : 'transparent';
        if (this._separatorLine) this._separatorLine.style.background = hover ? c.separatorHover : c.separator;
    }

    private _showControls(on: boolean): void {
        if (this._controlsEl) this._controlsEl.style.display = on ? 'flex' : 'none';
    }

    private _renderControls(): void {
        const el = this._controlsEl;
        if (!el) return;
        const c = paneColors(this._theme);
        const m = PANE_STYLE.metrics;
        const st = this._controlsState;
        el.style.background = c.controlsBg;
        el.innerHTML = '';
        const svg = (body: string) =>
            `<svg width="${m.iconSize}" height="${m.iconSize}" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
        const items: Array<{ action: PaneAction; icon: string; label: string; disabled?: boolean }> = [
            { action: 'up', icon: svg('<path d="M9 14V4.5M5 8.5l4-4 4 4"/>'), label: t('Move pane up'), disabled: !st.canUp },
            { action: 'down', icon: svg('<path d="M9 4v9.5M5 9.5l4 4 4-4"/>'), label: t('Move pane down'), disabled: !st.canDown },
            {
                action: 'maximize',
                icon: svg(st.maximized
                    ? '<path d="M7.5 4.5v3h-3M10.5 4.5v3h3M7.5 13.5v-3h-3M10.5 13.5v-3h3"/>'
                    : '<path d="M4.5 7.5v-3h3M13.5 7.5v-3h-3M4.5 10.5v3h3M13.5 10.5v3h-3"/>'),
                label: st.maximized ? t('Restore pane') : t('Maximize pane'),
            },
            {
                action: 'collapse',
                icon: svg(st.collapsed ? '<path d="M5 11l4-4 4 4"/>' : '<path d="M5 7l4 4 4-4"/>'),
                label: st.collapsed ? t('Expand pane') : t('Collapse pane'),
            },
            { action: 'delete', icon: svg('<path d="M5.5 6.5h7M7.5 6.5V5h3v1.5M6.5 6.5l.5 7h4l.5-7M8 8.5v3.5M10 8.5v3.5"/>'), label: t('Delete pane') },
        ];
        for (const it of items) {
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset.paneAction = it.action;
            b.innerHTML = it.icon;
            b.title = it.label;
            b.disabled = !!it.disabled;
            b.setAttribute('aria-label', it.label);
            b.style.cssText = `
                width: ${m.buttonSize}px; height: ${m.buttonSize}px; padding: 0; border: 0; border-radius: ${m.radius}px;
                background: none; display: inline-flex; align-items: center; justify-content: center;
                color: ${it.disabled ? c.disabled : c.icon}; cursor: ${it.disabled ? 'default' : 'pointer'};
            `;
            if (!it.disabled) {
                b.addEventListener('mouseenter', () => { b.style.background = c.buttonHover; b.style.color = c.iconHover; });
                b.addEventListener('mouseleave', () => { b.style.background = 'none'; b.style.color = c.icon; });
            }
            b.addEventListener('mousedown', (e) => e.stopPropagation());
            b.addEventListener('dblclick', (e) => e.stopPropagation());
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!it.disabled) this._emitPaneAction(it.action);
            });
            el.appendChild(b);
        }
    }

    /** Legend actions (toggle / settings / remove / more) are handled by the chart widget */
    public onLegendAction?: LegendActionHandler;

    private _updateLegend(): void {
        if (!this._legend) return;
        let index: number | null = null;
        if (this._crosshairX !== null) {
            index = Math.round(this._timeScale.coordinateToIndex(this._crosshairX as any));
        }
        this._legend.update(this._indicators, index, this._theme);
    }

    public addIndicator(indicator: PanelIndicator): void {
        this._indicators.push(indicator);
        this._updateLegend();
    }

    public dispose(): void {
        this._endSeparatorDrag?.();

        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }

        this._priceScale.destroy();
        this._indicators = [];
        this._element = null;
        this._canvas = null;
        this._ctx = null;
        this._priceAxisCanvas = null;
        this._priceAxisCtx = null;
        this._legend = null;
        this._legendHost = null;
        this._controlsEl = null;
        this._separatorLine = null;
        this._resizeHandle = null;
    }

    /**
     * Set theme colors for the indicator pane
     */
    public setTheme(theme: 'dark' | 'light'): void {
        const isDark = theme === 'dark';
        this._theme = theme;

        this._options.backgroundColor = isDark ? '#1a1a2e' : '#ffffff';
        this._options.borderColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
        this._options.priceAxisBackgroundColor = isDark ? '#16213e' : '#f8f9fa';
        this._options.priceAxisTextColor = isDark ? 'rgba(255, 255, 255, 0.5)' : '#787b86';
        this._options.priceAxisBorderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        this._options.gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
        this._options.crosshairColor = isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.3)';

        if (this._element) this._element.style.background = this._options.backgroundColor;
        this._paintSeparator(false);
        this._renderControls();
        this.render();
    }
}
