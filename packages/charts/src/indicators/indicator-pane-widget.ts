/**
 * Indicator Pane Widget
 * 
 * A separate pane for rendering panel indicators (RSI, MACD, etc.)
 * Each pane has its own canvas, price scale, and can be resized.
 */

import { PriceScale } from '../model/price-scale';
import { TimeScale } from '../model/time-scale';
import { PanelIndicator, IndicatorDataPoint } from './indicator';

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
}

const defaultIndicatorPaneOptions: IndicatorPaneOptions = {
    height: 100,
    minHeight: 50,
    maxHeight: 300,
    backgroundColor: '#1a1a2e',
    borderColor: 'rgba(255, 255, 255, 0.06)', // Match main grid/border color
    showPriceScale: true,
    priceScaleWidth: 80, // Match main price axis width
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
    private readonly _priceScale: PriceScale;
    private readonly _options: IndicatorPaneOptions;

    private _element: HTMLElement | null = null;
    private _canvas: HTMLCanvasElement | null = null;
    private _ctx: CanvasRenderingContext2D | null = null;
    private _priceAxisCanvas: HTMLCanvasElement | null = null;
    private _priceAxisCtx: CanvasRenderingContext2D | null = null;
    private _resizeHandle: HTMLElement | null = null;
    private _legendContainer: HTMLElement | null = null;

    private _width: number = 0;
    private _height: number = 0;
    private _indicators: PanelIndicator[] = [];

    private _isResizing: boolean = false;
    private _resizeStartY: number = 0;
    private _resizeStartHeight: number = 0;

    private _crosshairX: number | null = null;
    private _crosshairY: number | null = null;


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

    get height(): number {
        // Return 0 when hidden so layout calculations work correctly
        return this._isHidden ? 0 : this._height;
    }

    get actualHeight(): number {
        return this._height;
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
        if (this._element) {
            this._element.style.display = 'none';
        }
    }

    /** Show the indicator pane */
    show(): void {
        this._isHidden = false;
        if (this._element) {
            this._element.style.display = 'flex';
        }
    }

    // --- Indicator management ---


    hasIndicator(indicator: PanelIndicator): boolean {
        return this._indicators.includes(indicator);
    }


    // --- Size management ---

    setWidth(width: number): void {
        this._width = width;
        const chartWidth = width - this._options.priceScaleWidth;

        if (this._element) {
            this._element.style.width = `${width}px`;
        }

        if (this._canvas) {
            const dpr = window.devicePixelRatio || 1;
            this._canvas.style.width = `${chartWidth}px`;
            this._canvas.width = chartWidth * dpr;
        }
    }

    setHeight(height: number): void {
        this._height = Math.max(
            this._options.minHeight,
            Math.min(this._options.maxHeight, height)
        );

        if (this._element) {
            this._element.style.height = `${this._height}px`;
        }

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
        this._ctx.fillStyle = this._options.backgroundColor;
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
            if (indicator.visible) {
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

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        // Draw vertical line (X axis)
        ctx.beginPath();
        ctx.moveTo(this._crosshairX + 0.5, 0);
        ctx.lineTo(this._crosshairX + 0.5, mediaSize.height);
        ctx.stroke();

        // Draw horizontal line (Y axis - only if mouse is over this pane)
        if (this._crosshairY !== null) {
            ctx.beginPath();
            ctx.moveTo(0, this._crosshairY + 0.5);
            ctx.lineTo(mediaSize.width, this._crosshairY + 0.5);
            ctx.stroke();
        }

        ctx.setLineDash([]);
    }

    private _drawGrid(scope: BitmapCoordinatesScope): void {
        const { context: ctx, mediaSize } = scope;
        const marks = this._priceScale.marks();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;

        for (const mark of marks) {
            const y = Math.round(mark.coord) + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(mediaSize.width, y);
            ctx.stroke();
        }
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

        // Draw indicator label
        this._drawIndicatorLabel(ctx, indicator);
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

        for (let lineIdx = 0; lineIdx < lineCount; lineIdx++) {
            ctx.strokeStyle = lineColors[lineIdx] || options.color;
            ctx.lineWidth = options.lineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.beginPath();
            let started = false;

            for (let i = startIndex; i <= endIndex; i++) {
                const point = data[i];
                const values = point?.values;
                if (!values || values[lineIdx] === undefined || isNaN(values[lineIdx])) continue;

                const x = this._timeScale.indexToCoordinate(i as any);
                const y = this._priceScale.priceToCoordinate(values[lineIdx]);

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

    private _drawIndicatorLabel(ctx: CanvasRenderingContext2D, indicator: PanelIndicator): void {
        let index: number | undefined;

        if (this._crosshairX !== null) {
            index = Math.round(this._timeScale.coordinateToIndex(this._crosshairX as any));
        }

        const description = indicator.getDescription(index);

        ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = indicator.options.color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(description, 8, 8);
    }

    private _renderPriceAxis(): void {
        if (!this._priceAxisCtx || !this._priceAxisCanvas) return;

        const dpr = window.devicePixelRatio || 1;
        const width = this._options.priceScaleWidth;
        const height = this._height;

        this._priceAxisCtx.setTransform(1, 0, 0, 1, 0, 0);
        this._priceAxisCtx.scale(dpr, dpr);

        // Background
        this._priceAxisCtx.fillStyle = '#16213e';
        this._priceAxisCtx.fillRect(0, 0, width, height);

        // Left border - Synchronize with main chart's price axis border
        this._priceAxisCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this._priceAxisCtx.lineWidth = 1;
        this._priceAxisCtx.beginPath();
        this._priceAxisCtx.moveTo(0.5, 0);
        this._priceAxisCtx.lineTo(0.5, height);
        this._priceAxisCtx.stroke();

        // Price labels
        const marks = this._priceScale.marks();
        this._priceAxisCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        this._priceAxisCtx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        this._priceAxisCtx.textAlign = 'right';
        this._priceAxisCtx.textBaseline = 'middle';

        for (const mark of marks) {
            this._priceAxisCtx.fillText(mark.label, width - 8, mark.coord);
        }
    }

    private _updatePriceRange(): void {
        if (this._indicators.length === 0) return;

        let min = Infinity;
        let max = -Infinity;
        let hasFixedRange = false;

        for (const indicator of this._indicators) {
            const range = indicator.getRange();

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

        // Create action buttons container (minimal - no box, just buttons)
        this._legendContainer = document.createElement('div');
        this._legendContainer.style.cssText = `
            position: absolute;
            top: 6px;
            right: 90px;
            z-index: 5;
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 4px;
            opacity: 0;
            transition: opacity 0.15s ease;
            pointer-events: none;
        `;

        // Show buttons on panel hover
        this._element.addEventListener('mouseenter', () => {
            if (this._legendContainer) {
                this._legendContainer.style.opacity = '1';
                this._legendContainer.style.pointerEvents = 'auto';
            }
        });
        this._element.addEventListener('mouseleave', () => {
            if (this._legendContainer) {
                this._legendContainer.style.opacity = '0';
                this._legendContainer.style.pointerEvents = 'none';
            }
        });

        this._element.appendChild(this._legendContainer);

        // Main canvas
        this._canvas = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;
        this._canvas.style.cssText = `
            display: block;
            flex: 1;
        `;
        this._canvas.height = this._height * dpr;
        this._ctx = this._canvas.getContext('2d');

        // Double-click to open indicator settings
        this._canvas.addEventListener('dblclick', () => {
            if (this._indicators.length > 0 && this.onSettingsRequested) {
                this.onSettingsRequested(this._indicators[0]);
            }
        });

        this._element.appendChild(this._canvas);

        this._renderLegend();

        // Price axis canvas
        this._priceAxisCanvas = document.createElement('canvas');
        this._priceAxisCanvas.style.cssText = `
            display: block;
            width: ${this._options.priceScaleWidth}px;
            flex-shrink: 0;
            cursor: ns-resize;
        `;
        this._priceAxisCanvas.width = this._options.priceScaleWidth * dpr;
        this._priceAxisCanvas.height = this._height * dpr;
        this._priceAxisCtx = this._priceAxisCanvas.getContext('2d');
        this._element.appendChild(this._priceAxisCanvas);

        // Add drag scaling to indicator price axis
        const onScaleMove = (e: MouseEvent) => {
            this._priceScale.scaleTo(e.clientY);
        };

        const onScaleUp = () => {
            this._priceScale.endScale();
            document.removeEventListener('mousemove', onScaleMove);
            document.removeEventListener('mouseup', onScaleUp);
        };

        this._priceAxisCanvas.addEventListener('mousedown', (e: MouseEvent) => {
            this._priceScale.startScale(e.clientY);
            document.addEventListener('mousemove', onScaleMove);
            document.addEventListener('mouseup', onScaleUp);
            e.preventDefault();
        });

        // Resize handle (top border) - larger for easier grabbing
        this._resizeHandle = document.createElement('div');
        this._resizeHandle.style.cssText = `
            position: absolute;
            top: -2px;
            left: 0;
            right: 0;
            height: 8px;
            cursor: ns-resize;
            z-index: 10;
            transition: background 0.15s;
        `;

        // Add visual feedback on hover
        this._resizeHandle.addEventListener('mouseenter', () => {
            if (this._resizeHandle) {
                this._resizeHandle.style.background = 'rgba(41, 98, 255, 0.3)';
            }
        });
        this._resizeHandle.addEventListener('mouseleave', () => {
            if (this._resizeHandle && !this._isResizing) {
                this._resizeHandle.style.background = 'transparent';
            }
        });

        this._element.appendChild(this._resizeHandle);

        // Resize events
        this._resizeHandle.addEventListener('mousedown', this._onResizeStart.bind(this));
        document.addEventListener('mousemove', this._onResizeMove.bind(this));
        document.addEventListener('mouseup', this._onResizeEnd.bind(this));

        container.appendChild(this._element);
    }

    // --- Resize handling ---

    private _onResizeStart(e: MouseEvent): void {
        this._isResizing = true;
        this._resizeStartY = e.clientY;
        this._resizeStartHeight = this._height;
        e.preventDefault();
    }

    private _onResizeMove(e: MouseEvent): void {
        if (!this._isResizing) return;

        const deltaY = this._resizeStartY - e.clientY;
        const newHeight = this._resizeStartHeight + deltaY;
        this.setHeight(newHeight);
    }

    private _onResizeEnd(): void {
        this._isResizing = false;
        // Reset visual feedback
        if (this._resizeHandle) {
            this._resizeHandle.style.background = 'transparent';
        }
    }

    private _renderLegend(): void {
        if (!this._legendContainer) return;
        this._legendContainer.innerHTML = '';

        if (this._indicators.length === 0) return;

        const indicator = this._indicators[0];

        // Simple transparent icon button
        const createBtn = (svgContent: string, onClick: () => void) => {
            const btn = document.createElement('div');
            btn.style.cssText = `
                cursor: pointer;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 3px;
                transition: background 0.1s;
            `;
            btn.innerHTML = svgContent;
            btn.onmouseenter = () => btn.style.background = 'rgba(0,0,0,0.1)';
            btn.onmouseleave = () => btn.style.background = 'transparent';
            btn.onclick = (e) => { e.stopPropagation(); onClick(); };
            return btn;
        };

        // Settings button (gear icon - simple)
        const settingsBtn = createBtn(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#787b86" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`, () => {
            if (this.onSettingsRequested) {
                this.onSettingsRequested(indicator);
            }
        });

        // Delete button (trash icon)
        const closeBtn = createBtn(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#787b86" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`, () => {
            this._onRemoveIndicator(indicator);
        });

        this._legendContainer.appendChild(settingsBtn);
        this._legendContainer.appendChild(closeBtn);
    }

    private _onRemoveIndicator(indicator: PanelIndicator): void {
        const index = this._indicators.indexOf(indicator);
        if (index > -1) {
            this._indicators.splice(index, 1);
            this._renderLegend();

            if (this.onIndicatorRemoved) {
                this.onIndicatorRemoved(indicator);
            }
        }
    }

    public onIndicatorRemoved?: (indicator: PanelIndicator) => void;
    public onSettingsRequested?: (indicator: PanelIndicator) => void;

    public addIndicator(indicator: PanelIndicator): void {
        this._indicators.push(indicator);
        this._renderLegend();
    }

    public dispose(): void {
        if (this._resizeHandle) {
            this._resizeHandle.removeEventListener('mousedown', this._onResizeStart.bind(this));
        }
        document.removeEventListener('mousemove', this._onResizeMove.bind(this));
        document.removeEventListener('mouseup', this._onResizeEnd.bind(this));

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
        this._legendContainer = null;
    }
}
