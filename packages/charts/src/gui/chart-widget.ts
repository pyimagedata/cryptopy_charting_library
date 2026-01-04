import { ChartModel, ChartModelOptions, InvalidateReason } from '../model/chart-model';
import { Delegate } from '../helpers/delegate';
import { CandlestickSeries, CandlestickSeriesOptions } from '../model/candlestick-series';
import { LineSeries, LineSeriesOptions } from '../model/line-series';
import { AreaSeries, AreaSeriesOptions } from '../model/area-series';
import { HeikenAshiSeries, HeikenAshiSeriesOptions } from '../series/heiken-ashi-series';
import { BarData, LineData } from '../model/data';
import { PaneWidget } from './pane-widget';
import { PriceAxisWidget } from './price-axis-widget';
import { TimeAxisWidget } from './time-axis-widget';
import { ContextMenu, ICONS } from './context_menu';
import { ToolbarWidget, ChartType } from './toolbar';
import { SymbolSearch, SymbolInfo } from './symbol_search';
import { IndicatorPaneWidget, PanelIndicator, IndicatorManager, RSIIndicator, EMAIndicator, SMAIndicator, BBIndicator, MACDIndicator, StochIndicator, OverlayIndicator } from '../indicators';
import { IndicatorSearchModal } from './indicator_search';
import { IndicatorSettingsModal } from './indicator_settings';
import { DrawingToolbarWidget } from './drawing_toolbar';
import { DrawingManager, DrawingMode } from '../drawings';
import { FloatingAttributeBar } from './attribute_bar';
import { createSettingsModal, BaseSettingsModal } from './settings_modal';
import { ChartStateManager } from '../state';
import { AddTextTooltipHelper } from './tooltips';
import {
    ChartWidgetContext,
    handleWheel as handleWheelEvent,
    handleMouseDown as handleMouseDownEvent,
    handleMouseMove as handleMouseMoveEvent,
    handleKeyDown as handleKeyDownEvent,
    handleMouseLeave as handleMouseLeaveEvent,
    handleMouseUp as handleMouseUpEvent,
    handlePriceAxisMouseDown as handlePriceAxisMouseDownEvent,
    handlePriceAxisDoubleClick as handlePriceAxisDoubleClickEvent
} from './chart_widget';
import {
    handleContextSettings,
    handleContextCopyPrice,
    handleContextScreenshot,
    handleContextFullscreen,
    handleContextResetChart
} from './chart_widget';


/** Disposable interface for cleanup */
interface Disposable {
    dispose(): void;
}

/**
 * Chart widget - main UI container
 */
export class ChartWidget implements Disposable {
    private readonly _container: HTMLElement;
    private readonly _model: ChartModel;
    private _element: HTMLElement | null = null;

    // Layout elements
    private _chartRow: HTMLElement | null = null;
    private _timeAxisRow: HTMLElement | null = null;
    private _indicatorContainer: HTMLElement | null = null;

    // Widgets
    private _toolbarWidget: ToolbarWidget | null = null;
    private _drawingToolbarWidget: DrawingToolbarWidget | null = null;
    private _symbolSearch: SymbolSearch | null = null;
    private _paneWidget: PaneWidget | null = null;
    private _priceAxisWidget: PriceAxisWidget | null = null;
    private _timeAxisWidget: TimeAxisWidget | null = null;
    private _floatingAttributeBar: FloatingAttributeBar | null = null;
    private _drawingSettingsModal: BaseSettingsModal | null = null;

    // Drawing state
    private readonly _drawingManager: DrawingManager;
    private _isDraggingDrawing: boolean = false;
    private _draggingControlPoint: number = -1;  // -1 = none, 0 = first point, 1 = second point, 99 = whole line
    private _dragStartX: number = 0;
    private _dragStartY: number = 0;


    // State
    private _width: number = 0;
    private _height: number = 0;
    private _timestamps: number[] = [];
    private _drawScheduled: boolean = false;

    // Interaction state
    private _isDragging: boolean = false;
    private _isPriceScaleDragging: boolean = false;
    private _lastMouseX: number = 0;
    private _lastMouseY: number = 0;

    private readonly _symbolChanged = new Delegate<string>();
    private readonly _timeframeChanged = new Delegate<string>();

    // Context menu
    private _contextMenu: ContextMenu | null = null;
    private _mainLegendContainer: HTMLElement | null = null;
    private _brandingLogo: HTMLElement | null = null;

    // Indicator system
    private readonly _indicatorManager: IndicatorManager;
    private readonly _indicatorPanes: Map<string, IndicatorPaneWidget> = new Map();

    // Loading overlay
    private _loadingOverlay: HTMLElement | null = null;

    // Indicator search modal
    private _indicatorSearchModal: IndicatorSearchModal | null = null;
    private _indicatorSettingsModal: IndicatorSettingsModal | null = null;
    private _editingIndicator: PanelIndicator | null = null;

    // State persistence
    private _chartStateManager: ChartStateManager | null = null;

    // Add Text tooltip
    private _addTextTooltipHelper: AddTextTooltipHelper | null = null;
    private _hoveredDrawingForText: string | null = null;

    constructor(container: HTMLElement | string, options: Partial<ChartModelOptions> = {}) {
        // Resolve container
        if (typeof container === 'string') {
            const el = document.querySelector(container);
            if (!el) throw new Error(`Container not found: ${container}`);
            this._container = el as HTMLElement;
        } else {
            this._container = container;
        }

        // Create model
        this._model = new ChartModel(options);

        // Set initial symbol/timeframe in model
        this._model.setSymbol('BTCUSDT');
        this._model.setTimeframe('1h');

        // Initialize indicator manager
        this._indicatorManager = new IndicatorManager();
        this._indicatorManager.onPaneAdded = this._onIndicatorPaneAdded.bind(this);
        this._indicatorManager.onPaneRemoved = this._onIndicatorPaneRemoved.bind(this);
        this._indicatorManager.onIndicatorAdded = () => this._updateMainLegend();
        this._indicatorManager.onIndicatorRemoved = () => this._updateMainLegend();

        // Initialize drawing manager
        this._drawingManager = new DrawingManager();
        this._drawingManager.setScales(this._model.timeScale, this._model.rightPriceScale);
        this._drawingManager.drawingsChanged.subscribe(() => this._scheduleDraw());

        // Initialize chart state manager for per-symbol persistence
        this._chartStateManager = new ChartStateManager(this._drawingManager, this._indicatorManager);
        // Note: setSymbol is called AFTER _createLayout to ensure UI containers exist

        // Subscribe to drawing selection changes - show/hide attribute bar
        this._drawingManager.selectionChanged.subscribe((drawing) => {
            if (drawing) {
                this._floatingAttributeBar?.show(drawing);
            } else {
                this._floatingAttributeBar?.hide();
            }
        });

        // Subscribe to invalidation
        this._model.invalidated.subscribe(this._onInvalidated.bind(this));

        // Build UI
        this._createLayout();
        this._setupEventListeners();

        // Now that UI is created, load saved state for symbol
        this._chartStateManager.setSymbol('BTCUSDT');

        // Initialize indicator search modal
        this._indicatorSearchModal = new IndicatorSearchModal(this._container);
        this._indicatorSearchModal.indicatorSelected.subscribe((indicatorId) => {
            this._onIndicatorSelected(indicatorId);
        });

        // Initialize indicator settings modal
        this._indicatorSettingsModal = new IndicatorSettingsModal(this._container);
        this._indicatorSettingsModal.settingsChanged.subscribe(() => {
            if (this._editingIndicator) {
                // Modular modal already updated the indicator. 
                // We just need to trigger a redraw and save state.

                // Recalculate if it was an input change (modular modal handled setSettingValue)
                this._indicatorManager.recalculateIndicator(this._editingIndicator.id);

                this._updateMainLegend();
                this._scheduleDraw();

                // Save state after settings change
                this._chartStateManager?.saveState();
            }
            this._editingIndicator = null;
        });

        // Subscribe to price scale changes for Y-axis dragging
        this._model.rightPriceScale.rangeChanged.subscribe(() => {
            this._scheduleDraw();
        });

        // Initial size
        this._updateSize();
    }

    // --- Public API ---

    get model(): ChartModel {
        return this._model;
    }

    get symbolChanged(): Delegate<string> {
        return this._symbolChanged;
    }

    get timeframeChanged(): Delegate<string> {
        return this._timeframeChanged;
    }

    resize(width: number, height: number): void {
        this._width = width;
        this._height = height;
        this._updateLayout();
        this._scheduleDraw();
    }

    addCandlestickSeries(options?: Partial<CandlestickSeriesOptions>): CandlestickSeries {
        return this._model.addCandlestickSeries(options);
    }

    addLineSeries(options?: Partial<LineSeriesOptions>): LineSeries {
        return this._model.addLineSeries(options);
    }

    addAreaSeries(options?: Partial<AreaSeriesOptions>): AreaSeries {
        return this._model.addAreaSeries(options);
    }

    addHeikenAshiSeries(options?: Partial<HeikenAshiSeriesOptions>): HeikenAshiSeries {
        return this._model.addHeikenAshiSeries(options);
    }

    setData(series: CandlestickSeries | LineSeries | AreaSeries | HeikenAshiSeries, data: BarData[] | LineData[]): void {
        series.setData(data as any);

        // Update timestamps
        this._timestamps = data.map(d => d.time);
        if (this._timeAxisWidget) {
            this._timeAxisWidget.updateTimestamps(this._timestamps);
        }

        // Update drawing manager timestamps for accurate positioning across timeframes
        this._drawingManager.setTimestamps(this._timestamps);

        // Update indicators with new data (only for BarData, not LineData)
        if (data.length > 0 && 'open' in data[0]) {
            this._indicatorManager.setData(data as BarData[]);
        }
    }

    timeScale() {
        return this._model.timeScale;
    }

    priceScale() {
        return this._model.rightPriceScale;
    }

    /**
     * Show or hide loading indicator
     */
    setLoading(loading: boolean, message?: string): void {
        if (!this._loadingOverlay) return;

        if (loading) {
            const loadingText = this._loadingOverlay.querySelector('.loading-text');
            if (loadingText && message) {
                loadingText.textContent = message;
            }
            this._loadingOverlay.style.display = 'flex';
        } else {
            this._loadingOverlay.style.display = 'none';
        }
    }

    // --- Private: Layout ---

    private _createLayout(): void {
        // Main container
        this._element = document.createElement('div');
        this._element.className = 'tv-chart-container';
        this._element.style.cssText = `
            position: relative;
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 100%;
            background: ${this._model.options.layout.backgroundColor};
            font-family: ${this._model.options.layout.fontFamily};
            user-select: none;
            
            /* CSS Custom Properties for Layout (TradingView-style) */
            --tv-toolbar-height: 38px;
            --tv-drawing-toolbar-width: 48px;
            --tv-time-axis-height: 28px;
            --tv-price-axis-width: 80px;
            --tv-content-padding: 12px;
        `;

        // Chart row (pane + price axis)
        this._chartRow = document.createElement('div');
        this._chartRow.style.cssText = `
            display: flex;
            flex: 1;
            overflow: hidden;
        `;

        // Indicator container (for panel indicators like RSI, MACD)
        this._indicatorContainer = document.createElement('div');
        this._indicatorContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            width: 100%;
            flex-shrink: 0;
        `;

        // Time axis row
        this._timeAxisRow = document.createElement('div');
        this._timeAxisRow.style.cssText = `
            display: flex;
        `;

        this._element.appendChild(this._chartRow);

        // Main Chart Legend Container
        this._mainLegendContainer = document.createElement('div');
        this._mainLegendContainer.className = 'tv-legend-container';
        this._mainLegendContainer.style.cssText = `
            position: absolute;
            top: 140px;
            /* Using CSS Custom Properties for positioning */
            left: calc(var(--tv-drawing-toolbar-width) + var(--tv-content-padding));
            z-index: 20;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
            pointer-events: none;
        `;
        this._element.appendChild(this._mainLegendContainer);

        // Inject Styles for Legend
        const legendStyle = document.createElement('style');
        legendStyle.textContent = `
            .tv-legend-item {
                display: flex;
                align-items: center;
                gap: 0;
                padding: 2px 8px;
                border-radius: 4px;
                cursor: default;
                user-select: none;
                pointer-events: auto;
                background-color: transparent;
                border: 1px solid transparent;
                transition: background-color 0.1s;
                min-width: 140px;
                height: 28px;
            }
            .tv-legend-item:hover {
                background-color: #ffffff;
                border-color: #e0e3eb;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .tv-legend-name {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 13px;
                font-weight: 600;
                color: #d1d4dc;
                margin-right: 8px;
            }
            .tv-legend-item:hover .tv-legend-name {
                color: #131722;
            }
            .tv-legend-actions {
                display: flex;
                align-items: center;
                opacity: 0;
                transition: opacity 0.1s;
                pointer-events: auto;
            }
            .tv-legend-item:hover .tv-legend-actions {
                opacity: 1;
            }
            .tv-legend-btn {
                width: 26px;
                height: 26px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #787b86;
                border-radius: 4px;
                cursor: pointer;
                transition: background-color 0.1s, color 0.1s;
                background: transparent;
                border: none;
                margin: 0 1px;
            }
            .tv-legend-btn:hover {
                background-color: #f0f3fa;
                color: #2962ff;
            }
            .tv-legend-item.hidden .tv-legend-name {
                opacity: 0.5;
            }
            .tv-legend-btn svg {
                fill: currentColor;
            }
        `;
        document.head.appendChild(legendStyle);
        this._element.appendChild(this._mainLegendContainer);

        this._element.appendChild(this._indicatorContainer);
        this._element.appendChild(this._timeAxisRow);

        // Create loading overlay (covers entire chart widget)
        this._loadingOverlay = document.createElement('div');
        this._loadingOverlay.style.cssText = `
            position: absolute;
            top: 38px;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(22, 33, 62, 0.95);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            flex-direction: column;
            gap: 16px;
        `;

        // Spinner
        const spinner = document.createElement('div');
        spinner.style.cssText = `
            width: 48px;
            height: 48px;
            border: 4px solid rgba(255, 255, 255, 0.1);
            border-top-color: #2962ff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        `;

        // Loading text
        const loadingText = document.createElement('div');
        loadingText.className = 'loading-text';
        loadingText.style.cssText = `
            color: rgba(255, 255, 255, 0.7);
            font-size: 14px;
        `;
        loadingText.textContent = 'Loading data...';

        this._loadingOverlay.appendChild(spinner);
        this._loadingOverlay.appendChild(loadingText);
        this._element.appendChild(this._loadingOverlay);

        // Branding Logo (Global Overlay)
        this._brandingLogo = document.createElement('div');
        this._brandingLogo.className = 'tv-branding-logo';
        this._brandingLogo.style.cssText = `
            position: absolute;
            z-index: 50; 
            pointer-events: none;
            user-select: none;
            color: rgba(255, 255, 255, 0.9);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 28px;
            font-weight: 800;
            display: flex;
            align-items: center;
            text-shadow: 
                0 0 10px rgba(41, 98, 255, 0.8),
                0 0 20px rgba(41, 98, 255, 0.4),
                2px 2px 4px rgba(0, 0, 0, 0.5);
            /* Using CSS Custom Properties for positioning */
            left: calc(var(--tv-drawing-toolbar-width) + var(--tv-content-padding));
            bottom: calc(var(--tv-time-axis-height) + var(--tv-content-padding));
        `;
        this._brandingLogo.textContent = 'cryptopy';
        this._element.appendChild(this._brandingLogo);

        // Add spinner animation via style tag
        const spinnerStyle = document.createElement('style');
        spinnerStyle.textContent = `
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(spinnerStyle);

        this._container.appendChild(this._element);

        // Create toolbar first (inserts at top)
        this._toolbarWidget = new ToolbarWidget(this._element, {
            symbol: 'BTCUSDT',
            timeframe: '1h',
            chartType: 'candles',
        });

        // Connect toolbar events
        this._toolbarWidget.timeframeChanged.subscribe((tf) => {
            this._onTimeframeChange(tf);
        });

        this._toolbarWidget.chartTypeChanged.subscribe((type) => {
            this._onChartTypeChange(type);
        });

        this._toolbarWidget.symbolClicked.subscribe(() => {
            this._symbolSearch?.show();
        });

        // Initialize Symbol Search Modal
        this._symbolSearch = new SymbolSearch();
        this._symbolSearch.symbolSelected.subscribe((symbol: SymbolInfo) => {
            this._onSymbolChange(symbol);
        });

        this._toolbarWidget.indicatorsClicked.subscribe(() => {
            this._indicatorSearchModal?.show();
        });

        // Create widgets
        this._paneWidget = new PaneWidget(this._chartRow, this._model);

        // Connect overlay indicator action callback
        this._paneWidget.onOverlayIndicatorAction = (action, index) => {
            const indicators = this._indicatorManager.overlayIndicators;
            if (index < 0 || index >= indicators.length) return;
            const indicator = indicators[index];

            switch (action) {
                case 'toggle':
                    indicator.setVisible(!indicator.visible);
                    this._scheduleDraw();
                    break;
                case 'settings':
                    this._openIndicatorSettings(indicator);
                    break;
                case 'remove':
                    this._indicatorManager.removeIndicator(indicator.id);
                    this._scheduleDraw();
                    break;
            }
        };
        this._priceAxisWidget = new PriceAxisWidget(this._chartRow, this._model.rightPriceScale, {
            backgroundColor: this._model.options.layout.backgroundColor,
            textColor: this._model.options.layout.textColor,
        });
        this._timeAxisWidget = new TimeAxisWidget(this._timeAxisRow, this._model.timeScale, this._timestamps, {
            backgroundColor: this._model.options.layout.backgroundColor,
            textColor: this._model.options.layout.textColor,
        });

        // Create drawing toolbar (left side)
        this._drawingToolbarWidget = new DrawingToolbarWidget(this._element);
        this._drawingToolbarWidget.toolChanged.subscribe((tool) => {
            // Map toolbar tool names to drawing modes
            const toolToMode: Record<string, DrawingMode> = {
                'cursor': 'none',
                'crosshair': 'none',
                'trendLine': 'trendLine',
                'horizontalLine': 'horizontalLine',
                'verticalLine': 'verticalLine',
                'ray': 'ray',
                'extendedLine': 'extendedLine',
                'parallelChannel': 'parallelChannel',
                'regressionTrend': 'regressionTrend',
                'arrow': 'arrow',
                'arrowMarker': 'arrowMarker',
                'arrowMarkedUp': 'arrowMarkedUp',
                'arrowMarkedDown': 'arrowMarkedDown',
                'rectangle': 'rectangle',
                'rotatedRectangle': 'rotatedRectangle',
                'ellipse': 'ellipse',
                'triangle': 'triangle',
                'arc': 'arc',
                'path': 'path',
                'circle': 'circle',
                'polyline': 'polyline',
                'curve': 'curve',
                'xabcdPattern': 'xabcdPattern',
                'fibRetracement': 'fibRetracement',
                'fibExtension': 'fibExtension',
                'fibChannel': 'fibChannel',
                'brush': 'brush',
                'highlighter': 'highlighter',
                'infoLine': 'infoLine',
                'trendAngle': 'trendAngle',
                'horizontalRay': 'horizontalRay',
                'crossLine': 'crossLine',
                'xabcd': 'xabcdPattern',
                'elliotImpulse': 'elliotImpulse',
                'elliotCorrection': 'elliotCorrection',
                'threeDrives': 'threeDrives',
                'headShoulders': 'headShoulders',
                'abcd': 'abcd',
                'trianglePattern': 'trianglePattern',
                'longPosition': 'longPosition',
                'shortPosition': 'shortPosition',
                'priceRange': 'priceRange',
                'dateRange': 'dateRange',
                'datePriceRange': 'datePriceRange',
                'text': 'text',
                'callout': 'callout',
                'priceLabel': 'priceLabel',
                'flagMarked': 'flagMarked',
                'sticker': 'sticker',
            };

            // Handle sticker tools (they all share 'sticker' mode but have different content)
            let mode = toolToMode[tool];
            if (!mode && tool.startsWith('sticker-')) {
                mode = 'sticker';
                const emoji = this._drawingToolbarWidget?.getToolIcon(tool);
                if (emoji) {
                    this._drawingManager.stickerContent = emoji;
                }
            }

            this._drawingManager.setMode(mode || 'none');
            console.log('Drawing mode:', mode, mode === 'sticker' ? `Content: ${this._drawingManager.stickerContent}` : '');
        });
        this._drawingToolbarWidget.deleteAllClicked.subscribe(() => {
            this._drawingManager.deleteAll();
        });
        this._drawingToolbarWidget.lockToggled.subscribe((isLocked) => {
            this._drawingManager.isLocked = isLocked;
            this._scheduleDraw();
        });
        this._drawingToolbarWidget.visibilityToggled.subscribe((isHidden) => {
            this._drawingManager.drawings.forEach(d => d.visible = !isHidden);
            this._scheduleDraw();
        });
        this._drawingToolbarWidget.magnetToggled.subscribe((_isOn) => {
            // Magnet is handled via toolChanged, this is just for compatibility
        });

        // Listen to tool changes for magnet handling
        this._drawingToolbarWidget.toolChanged.subscribe((tool) => {
            if (tool === 'weakMagnet') {
                // Toggle weak magnet
                if (this._drawingManager.magnetMode === 'weak') {
                    this._drawingManager.magnetMode = 'none';
                    this._drawingToolbarWidget!.magnetMode = 'none';
                    console.log('Magnet: off');
                } else {
                    this._drawingManager.magnetMode = 'weak';
                    this._drawingToolbarWidget!.magnetMode = 'weak';
                    console.log('Magnet: weak');
                }
            } else if (tool === 'strongMagnet') {
                // Toggle strong magnet
                if (this._drawingManager.magnetMode === 'strong') {
                    this._drawingManager.magnetMode = 'none';
                    this._drawingToolbarWidget!.magnetMode = 'none';
                    console.log('Magnet: off');
                } else {
                    this._drawingManager.magnetMode = 'strong';
                    this._drawingToolbarWidget!.magnetMode = 'strong';
                    console.log('Magnet: strong');
                }
            }
        });

        // Sync toolbar buttons when drawing mode changes (e.g., after drawing completion)
        this._drawingManager.modeChanged.subscribe((mode) => {
            if (mode === 'none') {
                this._drawingToolbarWidget?.setActiveTool('crosshair');
            }
        });

        // Create floating attribute bar (shown when drawing is selected)
        this._floatingAttributeBar = new FloatingAttributeBar(this._element);
        this._floatingAttributeBar.deleteClicked.subscribe(() => {
            this._drawingManager.deleteSelected();
            this._floatingAttributeBar?.hide();
        });
        this._floatingAttributeBar.colorChanged.subscribe((_color) => {
            this._scheduleDraw();  // Refresh to show new color
        });
        this._floatingAttributeBar.lineWidthChanged.subscribe((_width) => {
            this._scheduleDraw();
        });
        this._floatingAttributeBar.lineStyleChanged.subscribe((_style) => {
            this._scheduleDraw();
        });
        this._floatingAttributeBar.settingsClicked.subscribe(() => {
            const selectedDrawing = this._drawingManager.selectedDrawing;
            if (selectedDrawing && this._element) {
                // Create or reuse modal (factory creates appropriate type)
                if (this._drawingSettingsModal) {
                    this._drawingSettingsModal.hide();
                }
                this._drawingSettingsModal = createSettingsModal(this._element, selectedDrawing);
                this._drawingSettingsModal.settingsChanged.subscribe(() => {
                    this._scheduleDraw();
                });
                this._drawingSettingsModal.show(selectedDrawing);
            }
        });
    }

    private _updateSize(): void {
        const rect = this._container.getBoundingClientRect();
        this._width = rect.width;
        this._height = rect.height;
        this._updateLayout();
    }

    private _updateLayout(): void {
        const toolbarHeight = this._toolbarWidget?.height ?? 38;
        const timeAxisHeight = this._timeAxisWidget?.height ?? 28;
        const priceAxisWidth = this._priceAxisWidget?.width ?? 80;
        const drawingToolbarWidth = this._drawingToolbarWidget?.width ?? 48;

        // Calculate total indicator pane heights
        let indicatorPanesHeight = 0;
        for (const pane of this._indicatorPanes.values()) {
            indicatorPanesHeight += pane.height;
        }

        const paneWidth = this._width - priceAxisWidth - drawingToolbarWidth;
        const paneHeight = this._height - timeAxisHeight - toolbarHeight - indicatorPanesHeight;

        // Update model
        this._model.setSize(this._width, paneHeight);
        this._model.timeScale.setWidth(paneWidth);
        this._model.rightPriceScale.setHeight(paneHeight);

        // Update widgets
        this._paneWidget?.setSize(paneWidth, paneHeight);
        this._priceAxisWidget?.setHeight(paneHeight);
        this._timeAxisWidget?.setWidth(paneWidth);

        // Offset chart row for drawing toolbar (using CSS variable reference)
        if (this._chartRow) {
            this._chartRow.style.marginLeft = 'var(--tv-drawing-toolbar-width)';
        }
        if (this._indicatorContainer) {
            this._indicatorContainer.style.marginLeft = 'var(--tv-drawing-toolbar-width)';
        }
        if (this._timeAxisRow) {
            this._timeAxisRow.style.marginLeft = 'var(--tv-drawing-toolbar-width)';
        }

        // Update indicator pane widths
        for (const pane of this._indicatorPanes.values()) {
            pane.setWidth(this._width - drawingToolbarWidth);
        }

        // Update CSS Custom Properties dynamically (for runtime changes)
        if (this._element) {
            this._element.style.setProperty('--tv-toolbar-height', `${toolbarHeight}px`);
            this._element.style.setProperty('--tv-drawing-toolbar-width', `${drawingToolbarWidth}px`);
            this._element.style.setProperty('--tv-time-axis-height', `${timeAxisHeight}px`);
            this._element.style.setProperty('--tv-price-axis-width', `${priceAxisWidth}px`);
        }
    }

    private _onChartTypeChange(type: ChartType): void {
        console.log('📊 Chart type changed:', type);

        // Get current data from existing series
        const currentSeries = this._model.serieses[0];
        if (!currentSeries) return;

        const data = currentSeries.data;

        // Remove old series
        this._model.removeSeries(currentSeries);

        // Add new series based on type
        let newSeries;
        switch (type) {
            case 'line':
                newSeries = this._model.addLineSeries({
                    color: '#2962ff',
                    lineWidth: 2
                });
                break;
            case 'area':
                newSeries = this._model.addAreaSeries({
                    lineColor: '#2962ff',
                    topColor: 'rgba(41, 98, 255, 0.4)',
                    bottomColor: 'rgba(41, 98, 255, 0)'
                });
                break;
            case 'heiken-ashi':
                newSeries = this._model.addHeikenAshiSeries({
                    upColor: '#26a69a',
                    downColor: '#ef5350',
                    borderVisible: false,
                    wickVisible: true
                });
                break;
            case 'candles':
            default:
                newSeries = this._model.addCandlestickSeries({
                    upColor: '#26a69a',
                    downColor: '#ef5350',
                    borderVisible: false,
                    wickVisible: true
                });
                break;
        }

        // Restore data
        if (data.length > 0) {
            this.setData(newSeries as any, data as any);
        }
    }

    private _onTimeframeChange(timeframe: string): void {
        console.log('📊 Timeframe changed to:', timeframe);
        this._model.setTimeframe(timeframe);
        this._timeframeChanged.fire(timeframe);
    }

    private _onSymbolChange(symbol: SymbolInfo): void {
        console.log('🔍 Symbol changed to:', symbol.symbol);

        // Update state manager - this saves current symbol's drawings and loads new symbol's drawings
        this._chartStateManager?.setSymbol(symbol.symbol);

        this._model.setSymbol(symbol.symbol);
        this._toolbarWidget?.setSymbol(symbol.symbol);
        this._symbolChanged.fire(symbol.symbol);
    }

    // --- Private: Event Listeners ---

    private _setupEventListeners(): void {
        const paneCanvas = this._paneWidget?.canvas;
        if (paneCanvas) {
            paneCanvas.addEventListener('wheel', this._onWheel.bind(this), { passive: false });
            paneCanvas.addEventListener('mousedown', this._onMouseDown.bind(this));
            paneCanvas.addEventListener('mousemove', this._onPaneMouseMove.bind(this));
            paneCanvas.addEventListener('mouseleave', this._onMouseLeave.bind(this));
            paneCanvas.addEventListener('dblclick', this._onPaneDoubleClick.bind(this));
        }

        // Keyboard shortcuts for drawings (Delete/Backspace to delete selected)
        document.addEventListener('keydown', this._onKeyDown.bind(this));

        const priceAxisElement = this._priceAxisWidget?.element;
        if (priceAxisElement) {
            priceAxisElement.addEventListener('mousedown', this._onPriceAxisMouseDown.bind(this));
            priceAxisElement.addEventListener('dblclick', this._onPriceAxisDoubleClick.bind(this));
        }

        // Custom context menu
        if (this._element) {
            this._contextMenu = new ContextMenu({
                items: [
                    {
                        id: 'reset',
                        label: 'Reset chart view',
                        icon: ICONS.reset,
                        shortcut: '⌥ R',
                        action: () => this._onContextResetChart()
                    },
                    { id: 'sep1', label: '', separator: true },
                    {
                        id: 'copy-price',
                        label: 'Copy price',
                        icon: ICONS.copy,
                        action: () => this._onContextCopyPrice()
                    },
                    { id: 'sep2', label: '', separator: true },
                    {
                        id: 'screenshot',
                        label: 'Take a snapshot',
                        icon: ICONS.screenshot,
                        shortcut: '⌥ S',
                        action: () => this._onContextScreenshot()
                    },
                    {
                        id: 'fullscreen',
                        label: 'Fullscreen',
                        icon: ICONS.fullscreen,
                        action: () => this._onContextFullscreen()
                    },
                    { id: 'sep3', label: '', separator: true },
                    {
                        id: 'settings',
                        label: 'Settings...',
                        icon: ICONS.settings,
                        action: () => this._onContextSettings()
                    }
                ]
            });

            this._element.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Get current price at mouse position
                const rect = this._paneWidget?.canvas?.getBoundingClientRect();
                if (rect) {
                    const y = e.clientY - rect.top;
                    const price = this._model.rightPriceScale.coordinateToPrice(y as any);
                    this._contextMenu?.setCurrentPrice(price);
                }

                this._contextMenu?.show(e.clientX, e.clientY);
                return false;
            }, true);
        }

        document.addEventListener('mousemove', this._onMouseMove.bind(this));
        document.addEventListener('mouseup', this._onMouseUp.bind(this));

        window.addEventListener('resize', this._onResize.bind(this));
    }

    private _onWheel(e: WheelEvent): void {
        handleWheelEvent(e, this._getEventContext());
    }

    private _onMouseDown(e: MouseEvent): void {
        const stateUpdates = handleMouseDownEvent(e, this._getEventContext());
        this._applyEventState(stateUpdates);
    }

    private _onMouseMove(e: MouseEvent): void {
        const stateUpdates = handleMouseMoveEvent(e, this._getEventContext());
        this._applyEventState(stateUpdates);
    }

    private _onKeyDown(e: KeyboardEvent): void {
        handleKeyDownEvent(e, this._getEventContext());
    }

    /** Create context object for event handlers */
    private _getEventContext(): ChartWidgetContext {
        return {
            model: this._model,
            drawingManager: this._drawingManager,
            paneCanvas: this._paneWidget?.canvas ?? null,
            element: this._element,
            isDragging: this._isDragging,
            isDraggingDrawing: this._isDraggingDrawing,
            draggingControlPoint: this._draggingControlPoint,
            isPriceScaleDragging: this._isPriceScaleDragging,
            lastMouseX: this._lastMouseX,
            lastMouseY: this._lastMouseY,
            dragStartX: this._dragStartX,
            dragStartY: this._dragStartY,
            getBarData: () => {
                const series = this._model.serieses[0];
                if (!series) return [];
                return series.data.map((d: any) => ({
                    time: d.time,
                    open: d.open ?? d.value ?? 0,
                    high: d.high ?? d.value ?? 0,
                    low: d.low ?? d.value ?? 0,
                    close: d.close ?? d.value ?? 0
                }));
            },
            scheduleDraw: () => this._scheduleDraw()
        };
    }

    /** Apply state updates from event handlers */
    private _applyEventState(state: Partial<ChartWidgetContext>): void {
        if (state.isDragging !== undefined) this._isDragging = state.isDragging;
        if (state.isDraggingDrawing !== undefined) this._isDraggingDrawing = state.isDraggingDrawing;
        if (state.draggingControlPoint !== undefined) this._draggingControlPoint = state.draggingControlPoint;
        if (state.isPriceScaleDragging !== undefined) this._isPriceScaleDragging = state.isPriceScaleDragging;
        if (state.lastMouseX !== undefined) this._lastMouseX = state.lastMouseX;
        if (state.lastMouseY !== undefined) this._lastMouseY = state.lastMouseY;
        if (state.dragStartX !== undefined) this._dragStartX = state.dragStartX;
        if (state.dragStartY !== undefined) this._dragStartY = state.dragStartY;
    }

    private _onMouseLeave(): void {
        handleMouseLeaveEvent(this._getEventContext());
    }

    private _onMouseUp(e: MouseEvent): void {
        const stateUpdates = handleMouseUpEvent(e, this._getEventContext());
        this._applyEventState(stateUpdates);
    }

    private _onPriceAxisMouseDown(e: MouseEvent): void {
        const stateUpdates = handlePriceAxisMouseDownEvent(e, this._getEventContext());
        this._applyEventState(stateUpdates);
    }

    private _onPriceAxisDoubleClick(): void {
        handlePriceAxisDoubleClickEvent(this._getEventContext());
    }

    /** Handle mouse move on pane - show Add Text tooltip on line midpoint */
    private _onPaneMouseMove(e: MouseEvent): void {
        const paneRect = this._paneWidget?.canvas?.getBoundingClientRect();
        if (!paneRect) return;

        // Skip hit testing for "Add Text" if in drawing mode
        if (this._drawingManager.mode !== 'none') {
            if (this._drawingManager.hoveredForAddText !== null) {
                this._drawingManager.hoveredForAddText = null;
                this._scheduleDraw();
            }
            return;
        }

        const x = e.clientX - paneRect.left;
        const y = e.clientY - paneRect.top;

        // Check if hovering over a line drawing midpoint
        const drawings = this._drawingManager.drawings;
        const lineTypes = ['trendLine', 'ray', 'extendedLine', 'horizontalLine', 'verticalLine',
            'parallelChannel', 'trendAngle', 'horizontalRay', 'infoLine'];

        let foundMidpoint = false;
        let midX = 0, midY = 0;
        let targetDrawing: any = null;

        for (const drawing of drawings) {
            if (!lineTypes.includes(drawing.type)) continue;
            if (drawing.style.text && drawing.style.text.trim()) continue; // Already has text

            // getPixelPoints() already returns screen coordinates (divided by DPR in renderDrawings)
            const pixelPoints = (drawing as any).getPixelPoints?.();
            if (!pixelPoints || pixelPoints.length < 2) continue;

            const p1 = pixelPoints[0];
            const p2 = pixelPoints[1];

            // Calculate midpoint - these are already screen coords
            midX = (p1.x + p2.x) / 2;
            midY = (p1.y + p2.y) / 2;

            // Check if mouse is near midpoint (within 30px)
            const dist = Math.sqrt((x - midX) ** 2 + (y - midY) ** 2);
            if (dist < 30) {
                foundMidpoint = true;
                targetDrawing = drawing;
                break;
            }
        }

        if (foundMidpoint && targetDrawing) {
            this._showAddTextTooltip(midX, midY, targetDrawing);
            this._hoveredDrawingForText = targetDrawing.id;
            // Update DrawingManager and redraw
            if (this._drawingManager.hoveredForAddText !== targetDrawing.id) {
                this._drawingManager.hoveredForAddText = targetDrawing.id;
                this._scheduleDraw();
            }
        } else {
            this._hideAddTextTooltip();
            this._hoveredDrawingForText = null;
            // Clear hover state and redraw if needed
            if (this._drawingManager.hoveredForAddText !== null) {
                this._drawingManager.hoveredForAddText = null;
                this._scheduleDraw();
            }
        }
    }

    /** Show Add Text tooltip at position */
    private _showAddTextTooltip(x: number, y: number, drawing: any): void {
        if (!this._paneWidget?.canvas) return;
        const paneRect = this._paneWidget.canvas.getBoundingClientRect();

        // Initialize helper if needed
        if (!this._addTextTooltipHelper) {
            this._addTextTooltipHelper = new AddTextTooltipHelper(() => {
                // Click handler - open settings modal with Text tab
                if (this._hoveredDrawingForText) {
                    const d = this._drawingManager.drawings.find((dr: any) => dr.id === this._hoveredDrawingForText);
                    if (d && this._element) {
                        if (this._drawingSettingsModal) {
                            this._drawingSettingsModal.hide();
                        }
                        this._drawingSettingsModal = createSettingsModal(this._element, d);
                        this._drawingSettingsModal.settingsChanged.subscribe(() => {
                            this._scheduleDraw();
                        });
                        if (!d.style.text) {
                            d.style.text = '';
                        }
                        this._drawingSettingsModal.show(d);
                        setTimeout(() => {
                            const textTab = document.querySelector('button[data-tab-id="text"]') as HTMLButtonElement;
                            if (textTab) textTab.click();
                        }, 50);
                    }
                }
            });
        }

        // Calculate angle from line
        let angle = 0;
        const pixelPoints = drawing.getPixelPoints?.();
        if (pixelPoints && pixelPoints.length >= 2) {
            const dx = pixelPoints[1].x - pixelPoints[0].x;
            const dy = pixelPoints[1].y - pixelPoints[0].y;
            angle = Math.atan2(dy, dx) * (180 / Math.PI);
            if (angle > 90) angle -= 180;
            if (angle < -90) angle += 180;
        }

        // Show at screen position
        this._addTextTooltipHelper.show(paneRect.left + x, paneRect.top + y, angle);
    }

    /** Hide Add Text tooltip */
    private _hideAddTextTooltip(): void {
        this._addTextTooltipHelper?.hide();
    }

    private _onPaneDoubleClick(e: MouseEvent): void {
        const paneRect = this._paneWidget?.canvas?.getBoundingClientRect();
        if (!paneRect) return;

        const x = e.clientX - paneRect.left;
        const y = e.clientY - paneRect.top;

        // Check if double-clicked on an overlay indicator line
        const hitIndicator = this._hitTestOverlayIndicator(x, y);
        if (hitIndicator) {
            this._openIndicatorSettings(hitIndicator);
            return;
        }

        // Check if double-clicked on a drawing
        const hitDrawing = this._drawingManager.selectDrawingAt(x, y);
        if (hitDrawing) {
            // Open settings modal for this drawing
            if (this._element) {
                if (this._drawingSettingsModal) {
                    this._drawingSettingsModal.hide();
                }
                this._drawingSettingsModal = createSettingsModal(this._element, hitDrawing);
                this._drawingSettingsModal.settingsChanged.subscribe(() => {
                    this._scheduleDraw();
                });
                this._drawingSettingsModal.show(hitDrawing);
            }
        }
    }

    /** Check if coordinates hit an overlay indicator line */
    private _hitTestOverlayIndicator(x: number, y: number): any | null {
        const threshold = 8; // pixels
        const timeScale = this._model.timeScale;
        const priceScale = this._model.rightPriceScale;

        for (const indicator of this._indicatorManager.overlayIndicators) {
            const data = indicator.data;
            if (data.length === 0) continue;

            // Get data index from x coordinate
            const dataIndex = Math.round(timeScale.coordinateToIndex(x as any));

            // Check a few points around the dataIndex
            for (let i = Math.max(0, dataIndex - 1); i <= Math.min(data.length - 1, dataIndex + 1); i++) {
                const point = data[i];
                if (!point || point.value === undefined) continue;

                const pointX = timeScale.indexToCoordinate(i as any);
                const pointY = priceScale.priceToCoordinate(point.value);

                const dx = x - pointX;
                const dy = y - pointY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance <= threshold) {
                    return indicator;
                }
            }
        }

        return null;
    }

    private _onResize(): void {
        this._updateSize();
        this._scheduleDraw();
    }

    // --- Private: Rendering ---

    private _onInvalidated(_reason: InvalidateReason): void {
        this._scheduleDraw();
    }

    private _scheduleDraw(): void {
        if (this._drawScheduled) return;
        this._drawScheduled = true;
        requestAnimationFrame(() => this._draw());
    }

    private _draw(): void {
        this._drawScheduled = false;

        const crosshair = this._model.crosshairPosition;
        if (crosshair) {
            this._priceAxisWidget?.setCrosshair(crosshair.y, crosshair.visible);
            this._timeAxisWidget?.setCrosshair(crosshair.x, crosshair.visible);
        }

        this._updateLastPriceLabel();

        // Pass overlay indicators to pane widget for rendering
        this._paneWidget?.setOverlayIndicators(this._indicatorManager.overlayIndicators);

        this._paneWidget?.render();

        // Render drawings on top of chart
        this._paneWidget?.renderDrawings(
            this._drawingManager.drawings,
            (time) => this._drawingManager.timeToPixel(time),
            (price) => this._drawingManager.priceToPixel(price),
            this._drawingManager.hoveredForAddText
        );

        this._priceAxisWidget?.render();
        this._timeAxisWidget?.render();

        // Render indicator panes (RSI, MACD, etc.)
        this._renderIndicatorPanes();

        // Update main legend with overlay indicators only when needed
        // Removed call from here to prevent flickering on every draw
    }

    private _updateLastPriceLabel(): void {
        if (!this._priceAxisWidget || this._model.serieses.length === 0) return;

        const series = this._model.serieses[0];
        const data = series.data;
        if (data.length === 0) return;

        const last = data[data.length - 1];
        let price = 0;
        let color = '#2962ff';

        // Helper to check for OHLC data
        if ('close' in last) {
            price = (last as any).close;
            const open = (last as any).open;

            // Get colors from series options
            if (series instanceof CandlestickSeries) {
                const opts = series.candleOptions;
                color = price >= open ? opts.upColor : opts.downColor;
            }
        } else {
            // Line/Area
            price = (last as any).value;
            if (series instanceof LineSeries) {
                color = series.lineOptions.color;
            } else if (series instanceof AreaSeries) {
                color = series.areaOptions.lineColor;
            }
        }

        this._priceAxisWidget.setLastValue(price, price.toFixed(2), color);
    }

    // --- Context Menu Actions ---

    private _onContextSettings(): void {
        handleContextSettings();
    }

    private _onContextCopyPrice(): void {
        handleContextCopyPrice(this._model);
    }

    private _onContextScreenshot(): void {
        handleContextScreenshot(
            this._model,
            this._width,
            this._height,
            this._paneWidget,
            this._priceAxisWidget,
            this._timeAxisWidget
        );
    }

    private _onContextFullscreen(): void {
        handleContextFullscreen(this._element);
    }

    private _onContextResetChart(): void {
        handleContextResetChart(this._model);
    }

    // --- Indicator Management ---

    /**
     * Get indicator manager for adding/removing indicators
     */
    get indicators(): IndicatorManager {
        return this._indicatorManager;
    }

    /**
     * Add a panel indicator (creates a new pane below the main chart)
     */
    addPanelIndicator(indicator: PanelIndicator): void {
        this._indicatorManager.addPanelIndicator(indicator);
    }

    /**
     * Remove indicator by ID
     */
    removeIndicator(id: string): void {
        this._indicatorManager.removeIndicator(id);
    }

    private _onIndicatorPaneAdded(indicator: PanelIndicator): void {
        if (!this._indicatorContainer || !this._timeAxisRow) return;

        // Create indicator pane widget
        const pane = new IndicatorPaneWidget(
            this._indicatorContainer,
            this._model.timeScale,
            { height: indicator.paneHeight }
        );

        // Ensure redraw when indicator price scale changes (e.g. during Y-axis drag)
        pane.priceScale.rangeChanged.subscribe(() => {
            this._scheduleDraw();
        });

        // Handle indicator removal from pane UI (the legend 'X' button)
        pane.onIndicatorRemoved = (removedIndicator) => {
            this._indicatorManager.removeIndicator(removedIndicator.id);
        };

        // Handle settings button click
        pane.onSettingsRequested = (ind) => {
            this._openIndicatorSettings(ind);
        };

        pane.addIndicator(indicator);
        this._indicatorPanes.set(indicator.id, pane);

        // Subscribe to data changes to trigger redraw
        indicator.dataChanged.subscribe(() => {
            this._scheduleDraw();
        });

        // Move time axis to end
        if (this._element && this._timeAxisRow) {
            this._element.appendChild(this._timeAxisRow);
        }

        this._updateLayout();
        this._scheduleDraw();
    }

    private _onIndicatorPaneRemoved(indicator: PanelIndicator): void {
        const pane = this._indicatorPanes.get(indicator.id);
        if (pane) {
            pane.dispose();
            this._indicatorPanes.delete(indicator.id);
        }

        this._updateLayout();
        this._scheduleDraw();
    }

    /**
     * Open settings modal for an indicator
     */
    private _openIndicatorSettings(ind: any): void {
        this._editingIndicator = ind;

        // Check if indicator has modular settings (implements getSettingsConfig)
        if (typeof ind.getSettingsConfig === 'function') {
            this._indicatorSettingsModal?.showForIndicator(ind);
        } else {
            console.warn('Indicator does not implement getSettingsConfig:', ind.name);
        }
    }

    private _renderIndicatorPanes(): void {
        const crosshair = this._model.crosshairPosition;

        for (const pane of this._indicatorPanes.values()) {
            if (crosshair && crosshair.visible) {
                // X is synchronized (time axis)
                // Y is only shown if the mouse is actually over THIS specific pane
                const paneElement = pane.element;
                let localY: number | null = null;

                if (paneElement && this._lastMouseY !== 0) {
                    const rect = paneElement.getBoundingClientRect();
                    // Check if mouse Y is within this pane (with a small buffer for borders)
                    if (this._lastMouseY >= rect.top && this._lastMouseY <= rect.bottom) {
                        localY = this._lastMouseY - rect.top;
                    }
                }

                pane.setCrosshair(crosshair.x, localY);
            } else {
                pane.setCrosshair(null, null);
            }
            pane.render();
        }
    }

    private _updateMainLegend(): void {
        // Disabled - now using pane-widget's overlay indicator legend
        // Just clear the old container if it exists
        if (this._mainLegendContainer) {
            this._mainLegendContainer.innerHTML = '';
        }
    }

    private _onIndicatorSelected(indicatorId: string): void {
        // Create and add indicator based on ID
        switch (indicatorId) {
            case 'rsi':
                this.addIndicator(new RSIIndicator({ period: 14 }));
                break;
            case 'ema':
                this.addOverlayIndicator(new EMAIndicator({ period: 20 }));
                break;
            case 'sma':
                this.addOverlayIndicator(new SMAIndicator({ period: 20 }));
                break;
            case 'bb':
                this.addOverlayIndicator(new BBIndicator({ period: 20, stdDev: 2 }));
                break;
            case 'macd':
                this.addIndicator(new MACDIndicator({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }));
                break;
            case 'stoch':
                this.addIndicator(new StochIndicator({ kPeriod: 14, sPeriod: 3, dPeriod: 3 }));
                break;
            default:
                console.warn(`Unknown indicator: ${indicatorId}`);
        }
    }

    /**
     * Public API: Add an indicator to the chart
     */
    addIndicator(indicator: PanelIndicator): void {
        this._indicatorManager.addPanelIndicator(indicator);

        // If there's data in the chart, calculate the indicator
        const series = this._model.serieses[0];
        if (series && 'data' in series) {
            const data = (series as any).data() as BarData[];
            if (data && data.length > 0) {
                indicator.calculate(data);
            }
        }
    }

    /**
     * Public API: Add an overlay indicator to the chart (drawn on main chart)
     */
    addOverlayIndicator(indicator: OverlayIndicator): void {
        this._indicatorManager.addOverlayIndicator(indicator);

        // If there's data in the chart, calculate the indicator
        const series = this._model.serieses[0];
        if (series && 'data' in series) {
            const data = (series as any).data() as BarData[];
            if (data && data.length > 0) {
                indicator.calculate(data);
            }
        }

        // Trigger redraw
        this._scheduleDraw();
    }

    // --- Cleanup ---

    dispose(): void {
        this._model.destroy();
        this._symbolChanged.destroy();
        this._timeframeChanged.destroy();
        this._indicatorManager.destroy();

        // Dispose indicator panes
        for (const pane of this._indicatorPanes.values()) {
            pane.dispose();
        }
        this._indicatorPanes.clear();

        this._toolbarWidget?.dispose();
        this._drawingToolbarWidget?.dispose();
        this._symbolSearch?.dispose();
        this._indicatorSearchModal?.dispose();
        this._paneWidget?.dispose();
        this._priceAxisWidget?.dispose();
        this._timeAxisWidget?.dispose();
        this._contextMenu?.dispose();

        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }

        this._element = null;
        this._chartRow = null;
        this._timeAxisRow = null;
        this._indicatorContainer = null;
    }
}

/**
 * Create a new chart widget
 */
export function createChart(
    container: HTMLElement | string,
    options?: Partial<ChartModelOptions>
): ChartWidget {
    return new ChartWidget(container, options);
}
