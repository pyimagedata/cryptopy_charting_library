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
import { ContextMenu, ICONS } from './context-menu';
import { ToolbarWidget, ChartType } from './toolbar-widget';
import { SymbolSearch, SymbolInfo } from './symbol-search';
import { IndicatorPaneWidget, PanelIndicator, IndicatorManager, RSIIndicator, EMAIndicator, SMAIndicator, BBIndicator, MACDIndicator, StochIndicator, OverlayIndicator } from '../indicators';
import { IndicatorSearchModal } from './indicator-search-modal';
import { IndicatorSettingsModal, IndicatorSettingsConfig } from './indicator-settings-modal';
import { DrawingToolbarWidget } from './drawing-toolbar-widget';
import { DrawingManager, DrawingMode } from '../drawings';
import { FloatingAttributeBar } from './floating-attribute-bar';
import { DrawingSettingsModal } from './drawing-settings-modal';
import { ChartStateManager } from '../state';


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
    private _drawingSettingsModal: DrawingSettingsModal | null = null;

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
        this._chartStateManager.setSymbol('BTCUSDT'); // Initial symbol

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

        // Initialize indicator search modal
        this._indicatorSearchModal = new IndicatorSearchModal(this._container);
        this._indicatorSearchModal.indicatorSelected.subscribe((indicatorId) => {
            this._onIndicatorSelected(indicatorId);
        });

        // Initialize indicator settings modal
        this._indicatorSettingsModal = new IndicatorSettingsModal(this._container);
        this._indicatorSettingsModal.settingsChanged.subscribe((settings) => {
            if (this._editingIndicator) {
                if (this._editingIndicator instanceof RSIIndicator) {
                    const rsi = this._editingIndicator as RSIIndicator;

                    // Map settings to RSI options
                    const rsiSettings: Partial<typeof rsi.rsiOptions> = {};

                    if (settings.rsiLength !== undefined) {
                        rsiSettings.period = settings.rsiLength as number;
                    }
                    if (settings.oversold !== undefined) {
                        rsiSettings.oversoldLevel = settings.oversold as number;
                    }
                    if (settings.overbought !== undefined) {
                        rsiSettings.overboughtLevel = settings.overbought as number;
                    }
                    if (settings.lineColor !== undefined) {
                        rsiSettings.color = settings.lineColor as string;
                    }
                    if (settings.lineWidth !== undefined) {
                        rsiSettings.lineWidth = settings.lineWidth as number;
                    }
                    if (settings.upperBandColor !== undefined) {
                        rsiSettings.overboughtColor = settings.upperBandColor as string;
                    }
                    if (settings.lowerBandColor !== undefined) {
                        rsiSettings.oversoldColor = settings.lowerBandColor as string;
                    }
                    if (settings.showBands !== undefined) {
                        rsiSettings.showLevels = settings.showBands as boolean;
                    }

                    // Apply settings
                    const needsRecalc = rsi.updateOptions(rsiSettings);

                    // Recalculate if period changed
                    if (needsRecalc) {
                        this._indicatorManager.recalculateIndicator(rsi.id);
                    }
                } else if (this._editingIndicator instanceof EMAIndicator || this._editingIndicator instanceof SMAIndicator) {
                    const ind = this._editingIndicator as EMAIndicator | SMAIndicator;
                    const indSettings: any = {};

                    if (settings.length !== undefined) indSettings.period = settings.length as number;
                    if (settings.source !== undefined) indSettings.source = settings.source as string;
                    if (settings.lineColor !== undefined) indSettings.color = settings.lineColor as string;
                    if (settings.lineWidth !== undefined) indSettings.lineWidth = settings.lineWidth as number;

                    const needsRecalc = ind.updateOptions(indSettings);
                    if (needsRecalc) this._indicatorManager.recalculateIndicator(ind.id);
                } else if (this._editingIndicator instanceof BBIndicator) {
                    const bb = this._editingIndicator as BBIndicator;
                    const bbSettings: any = {};
                    if (settings.period !== undefined) bbSettings.period = settings.period as number;
                    if (settings.stdDev !== undefined) bbSettings.stdDev = settings.stdDev as number;
                    if (settings.lineColor !== undefined) bbSettings.color = settings.lineColor as string;
                    if (settings.lineWidth !== undefined) bbSettings.lineWidth = settings.lineWidth as number;
                    const needsRecalc = bb.updateOptions(bbSettings);
                    if (needsRecalc) this._indicatorManager.recalculateIndicator(bb.id);
                } else if (this._editingIndicator instanceof MACDIndicator) {
                    const macd = this._editingIndicator as MACDIndicator;
                    const macdSettings: any = {};
                    if (settings.fastLength !== undefined) macdSettings.fastPeriod = settings.fastLength as number;
                    if (settings.slowLength !== undefined) macdSettings.slowPeriod = settings.slowLength as number;
                    if (settings.signalLength !== undefined) macdSettings.signalPeriod = settings.signalLength as number;
                    if (settings.lineColor !== undefined) macdSettings.color = settings.lineColor as string;
                    if (settings.lineWidth !== undefined) macdSettings.lineWidth = settings.lineWidth as number;
                    const needsRecalc = macd.updateOptions(macdSettings);
                    if (needsRecalc) this._indicatorManager.recalculateIndicator(macd.id);
                } else if (this._editingIndicator instanceof StochIndicator) {
                    const stoch = this._editingIndicator as StochIndicator;
                    const stochSettings: any = {};
                    if (settings.kLength !== undefined) stochSettings.kPeriod = settings.kLength as number;
                    if (settings.sLength !== undefined) stochSettings.sPeriod = settings.sLength as number;
                    if (settings.dLength !== undefined) stochSettings.dPeriod = settings.dLength as number;
                    if (settings.lineColor !== undefined) stochSettings.color = settings.lineColor as string;
                    if (settings.lineWidth !== undefined) stochSettings.lineWidth = settings.lineWidth as number;
                    const needsRecalc = stoch.updateOptions(stochSettings);
                    if (needsRecalc) this._indicatorManager.recalculateIndicator(stoch.id);
                }

                this._updateMainLegend();
                this._scheduleDraw();
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
                'rectangle': 'rectangle',
                'ellipse': 'ellipse',
                'fibRetracement': 'fibRetracement',
                'fibExtension': 'fibExtension',
                'infoLine': 'infoLine',
                'trendAngle': 'trendAngle',
                'horizontalRay': 'horizontalRay',
                'crossLine': 'crossLine',
                'xabcd': 'xabcd',
                'cypher': 'cypher',
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
                'flagMarked': 'flagMarked',
                'sticker': 'sticker',
            };

            // Handle sticker tools (they all share 'sticker' mode but have different content)
            let mode = toolToMode[tool];
            if (!mode && tool.startsWith('sticker-')) {
                mode = 'sticker';
                // In a real implementation, we would set the sticker content here
                // e.g. this._drawingManager.setStickerContent(emoji)
            }

            this._drawingManager.setMode(mode || 'none');
            console.log('Drawing mode:', mode);
        });
        this._drawingToolbarWidget.deleteAllClicked.subscribe(() => {
            this._drawingManager.deleteAll();
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
        this._floatingAttributeBar.colorChanged.subscribe((color) => {
            this._scheduleDraw();  // Refresh to show new color
        });
        this._floatingAttributeBar.lineWidthChanged.subscribe((width) => {
            this._scheduleDraw();
        });
        this._floatingAttributeBar.lineStyleChanged.subscribe((style) => {
            this._scheduleDraw();
        });
        this._floatingAttributeBar.settingsClicked.subscribe(() => {
            const selectedDrawing = this._drawingManager.selectedDrawing;
            if (selectedDrawing && this._element) {
                if (!this._drawingSettingsModal) {
                    this._drawingSettingsModal = new DrawingSettingsModal(this._element);
                    this._drawingSettingsModal.settingsChanged.subscribe(() => {
                        this._scheduleDraw();
                    });
                }
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
        e.preventDefault();

        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;

        // Distinguish between horizontal scroll (Panning) and vertical/pinch (Zooming)
        // deltaX is primarily for horizontal movement (two-finger swipe on trackpad)
        // deltaY is for vertical movement or pinch-to-zoom

        const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);

        if (isHorizontal && !e.ctrlKey) {
            // Horizontal Pan (two-finger swipe left/right)
            // No need for sensitivity adjustment here as it's a direct pixel mapping
            this._model.timeScale.scrollBy(e.deltaX);
        } else {
            // Zoom (Vertical swipe, Mouse wheel, or Pinch)
            // pinch-to-zoom usually carries ctrlKey = true
            const isPinch = e.ctrlKey;

            // Adjust sensitivity
            // Trackpads send many small events, mouse wheels send fewer large ones.
            // pinch gestures need higher sensitivity than normal swipes.
            const sensitivity = isPinch ? 0.05 : 0.2;

            // deltaY < 0 (swipe up / zoom in) -> sign 1
            // deltaY > 0 (swipe down / zoom out) -> sign -1
            const sign = e.deltaY > 0 ? -1 : 1;

            this._model.timeScale.zoom(x as any, sign * sensitivity);
        }

        this._model.recalculateAllPanes();
    }

    private _onMouseDown(e: MouseEvent): void {
        const paneRect = this._paneWidget?.canvas?.getBoundingClientRect();
        if (!paneRect) return;

        const x = e.clientX - paneRect.left;
        const y = e.clientY - paneRect.top;
        const isOverPane = x >= 0 && x <= paneRect.width && y >= 0 && y <= paneRect.height;

        if (!isOverPane) {
            // Normal panning mode for areas outside pane
            this._isDragging = true;
            this._lastMouseX = e.clientX;
            this._lastMouseY = e.clientY;
            return;
        }

        // Check if we're in drawing mode (creating new drawings)
        if (this._drawingManager.mode !== 'none') {
            if (this._drawingManager.activeDrawing) {
                this._drawingManager.finishDrawing(x, y);
            } else {
                this._drawingManager.startDrawing(x, y);
            }
            return;
        }

        // Check if clicking on a control point of selected drawing (for resizing)
        const selected = this._drawingManager.selectedDrawing;
        if (selected) {
            const controlPointIndex = this._hitTestControlPoint(x, y, selected);
            if (controlPointIndex >= 0) {
                // Start resizing
                this._isDraggingDrawing = true;
                this._draggingControlPoint = controlPointIndex;
                this._dragStartX = x;
                this._dragStartY = y;
                return;
            }

            // Check if clicking on the line itself (for moving)
            if (selected.hitTest(x, y, 8)) {
                this._isDraggingDrawing = true;
                this._draggingControlPoint = 99; // Moving whole drawing
                this._dragStartX = x;
                this._dragStartY = y;
                return;
            }
        }

        // Try to select a drawing
        const hitDrawing = this._drawingManager.selectDrawingAt(x, y);
        if (hitDrawing) {
            // Start dragging the newly selected drawing
            this._isDraggingDrawing = true;
            this._draggingControlPoint = 99; // Moving whole drawing
            this._dragStartX = x;
            this._dragStartY = y;
            return;
        }

        // Normal panning mode
        this._isDragging = true;
        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;

        // If auto-scale is off, start vertical scrolling too
        if (!this._model.rightPriceScale.isAutoScale) {
            const canvas = this._paneWidget?.canvas;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                this._model.rightPriceScale.startScroll(e.clientY - rect.top);
            }
        }
    }

    /** Check if point hits a control point of the drawing, returns index or -1 */
    private _hitTestControlPoint(x: number, y: number, drawing: any): number {
        if (!drawing.getPixelPoints) return -1;

        const points = drawing.getPixelPoints();
        const threshold = 10;

        for (let i = 0; i < points.length; i++) {
            const dx = x - points[i].x;
            const dy = y - points[i].y;
            if (Math.sqrt(dx * dx + dy * dy) <= threshold) {
                return i;
            }
        }
        return -1;
    }

    private _onMouseMove(e: MouseEvent): void {
        const deltaX = e.clientX - this._lastMouseX;
        const deltaY = e.clientY - this._lastMouseY;

        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;

        // Get pane rect for coordinate conversion
        const paneRect = this._paneWidget?.canvas?.getBoundingClientRect();

        // Handle drawing dragging (move or resize)
        if (this._isDraggingDrawing && paneRect) {
            const x = e.clientX - paneRect.left;
            const y = e.clientY - paneRect.top;

            const selected = this._drawingManager.selectedDrawing;
            if (selected) {
                if (this._draggingControlPoint === 99) {
                    // Moving the whole drawing
                    this._drawingManager.moveDrawing(x - this._dragStartX, y - this._dragStartY);
                    this._dragStartX = x;
                    this._dragStartY = y;
                } else if (this._draggingControlPoint >= 0) {
                    // Resizing - move a specific control point
                    this._drawingManager.moveControlPoint(this._draggingControlPoint, x, y);
                }
            }

            // Show crosshair during drawing edit for precision positioning
            this._model.setCrosshairPosition(x, y, true);
            return;
        }

        // Update drawing preview if there's an active drawing
        if (paneRect && this._drawingManager.activeDrawing) {
            const x = e.clientX - paneRect.left;
            const y = e.clientY - paneRect.top;
            this._drawingManager.updateDrawing(x, y);
        }

        if (this._isDragging) {
            this._model.timeScale.scrollBy(-deltaX);

            // If auto-scale is off, also scroll vertically
            if (!this._model.rightPriceScale.isAutoScale) {
                const canvas = this._paneWidget?.canvas;
                if (canvas) {
                    const rect = canvas.getBoundingClientRect();
                    this._model.rightPriceScale.scrollTo(e.clientY - rect.top);
                }
            }

            this._model.recalculateAllPanes();
        }

        if (this._isPriceScaleDragging) {
            this._model.rightPriceScale.scaleTo(deltaY);
            this._scheduleDraw();
        }

        // Crosshair logic (Global for all panes) - show during drawing drag too for precision
        if (!this._isDragging && !this._isPriceScaleDragging && this._element) {
            if (paneRect) {
                const x = e.clientX - paneRect.left;
                const y = e.clientY - paneRect.top;
                const chartAreaWidth = paneRect.width;

                if (x >= 0 && x <= chartAreaWidth && y >= 0 && y <= paneRect.height) {
                    this._model.setCrosshairPosition(x, y, true);
                } else if (x >= 0 && x <= chartAreaWidth) {
                    // Mouse is horizontally over chart but vertically outside main pane
                    // Still show vertical crosshair line
                    this._model.setCrosshairPosition(x, y, true);
                } else {
                    this._model.setCrosshairPosition(0, 0, false);
                }
            } else {
                this._model.setCrosshairPosition(0, 0, false);
            }
        }
    }

    private _onKeyDown(e: KeyboardEvent): void {
        // Delete selected drawing with Delete or Backspace key
        if (e.key === 'Delete' || e.key === 'Backspace') {
            const selected = this._drawingManager.selectedDrawing;
            if (selected) {
                // Prevent default browser behavior (e.g., navigating back)
                e.preventDefault();
                this._drawingManager.deleteDrawing(selected.id);
                this._scheduleDraw();
            }
        }

        // Escape to deselect drawing or cancel current mode
        if (e.key === 'Escape') {
            // Try to deselect selected drawing
            const selected = this._drawingManager.selectedDrawing;
            if (selected) {
                selected.state = 'complete';
                this._drawingManager.setMode('none');
                this._scheduleDraw();
            }
        }
    }

    private _onMouseLeave(): void {
        this._model.setCrosshairPosition(0, 0, false);
    }

    private _onMouseUp(): void {
        if (this._isDragging) {
            this._isDragging = false;
            // End vertical scroll if it was active
            this._model.rightPriceScale.endScroll();
        }
        if (this._isPriceScaleDragging) {
            this._model.rightPriceScale.endScale();
            this._isPriceScaleDragging = false;
        }
        // End drawing drag
        if (this._isDraggingDrawing) {
            this._isDraggingDrawing = false;
            this._draggingControlPoint = -1;
        }
    }

    private _onPriceAxisMouseDown(e: MouseEvent): void {
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        this._isPriceScaleDragging = true;
        this._lastMouseY = rect.top;
        this._model.rightPriceScale.startScale(e.clientY - rect.top);
    }

    private _onPriceAxisDoubleClick(): void {
        this._model.rightPriceScale.setAutoScale(true);
        this._model.recalculateAllPanes();
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
                if (!this._drawingSettingsModal) {
                    this._drawingSettingsModal = new DrawingSettingsModal(this._element);
                    this._drawingSettingsModal.settingsChanged.subscribe(() => {
                        this._scheduleDraw();
                    });
                }
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
            (price) => this._drawingManager.priceToPixel(price)
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
        // TODO: Open settings modal
        console.log('📋 Settings clicked - Modal will be implemented');
        alert('Settings feature coming soon!');
    }

    private _onContextCopyPrice(): void {
        // Get the price that was set when context menu was opened
        const priceScale = this._model.rightPriceScale;
        const priceRange = priceScale.priceRange;
        if (!priceRange) return;

        // Get crosshair position for accurate price
        const crosshair = this._model.crosshairPosition;
        let price = 0;
        if (crosshair && crosshair.visible) {
            price = priceScale.coordinateToPrice(crosshair.y as any);
        } else {
            // Use middle of visible range as fallback
            price = (priceRange.min + priceRange.max) / 2;
        }

        // Format and copy to clipboard
        const formattedPrice = price.toLocaleString('en-US', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 2
        });

        navigator.clipboard.writeText(formattedPrice).then(() => {
            console.log(`📋 Copied price: ${formattedPrice}`);
        }).catch(err => {
            console.warn('Copy failed:', err);
        });
    }

    private _onContextScreenshot(): void {
        const canvas = this._paneWidget?.canvas;
        if (!canvas) return;

        // Create a combined canvas with all elements
        const combinedCanvas = document.createElement('canvas');
        combinedCanvas.width = this._width;
        combinedCanvas.height = this._height;
        const ctx = combinedCanvas.getContext('2d');
        if (!ctx) return;

        // Fill background
        ctx.fillStyle = this._model.options.layout.backgroundColor;
        ctx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);

        // Draw pane canvas
        ctx.drawImage(canvas, 0, 0);

        // Draw price axis if available
        const priceCanvas = this._priceAxisWidget?.canvas;
        if (priceCanvas) {
            ctx.drawImage(priceCanvas, canvas.width, 0);
        }

        // Draw time axis if available
        const timeCanvas = this._timeAxisWidget?.canvas;
        if (timeCanvas) {
            ctx.drawImage(timeCanvas, 0, canvas.height);
        }

        // Download
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.download = `chart-screenshot-${timestamp}.png`;
        link.href = combinedCanvas.toDataURL('image/png');
        link.click();
    }

    private _onContextFullscreen(): void {
        if (!this._element) return;

        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            this._element.requestFullscreen().catch(err => {
                console.warn('Fullscreen failed:', err);
            });
        }
    }

    private _onContextResetChart(): void {
        // Reset time scale to default values
        this._model.timeScale.setBarSpacing(8);
        this._model.timeScale.setRightOffset(10);

        // Reset scroll position to 0 (show most recent data)
        this._model.timeScale.scrollToPosition(0, false);

        // Reset price scale to auto mode and recalculate range
        this._model.rightPriceScale.setAutoScale(true);
        this._model.rightPriceScale.setPriceRange(null); // Force recalculation

        // Full update to recalculate everything
        this._model.fullUpdate();
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
        let config: IndicatorSettingsConfig | null = null;

        if (ind instanceof RSIIndicator) {
            const rsi = ind as RSIIndicator;
            config = {
                name: ind.name,
                parameters: [
                    { key: 'rsiLength', label: 'RSI Length', type: 'number', value: rsi.period, min: 1, max: 200, step: 1 },
                    { key: 'oversold', label: 'Oversold', type: 'number', value: rsi.oversoldLevel, min: 0, max: 100 },
                    { key: 'overbought', label: 'Overbought', type: 'number', value: rsi.overboughtLevel, min: 0, max: 100 },
                    { key: 'showBands', label: 'Show Levels', type: 'boolean', value: rsi.rsiOptions.showLevels },
                ],
                styleParameters: [
                    { key: 'lineColor', label: 'Line Color', type: 'color', value: rsi.rsiOptions.color || '#9c27b0' },
                    { key: 'lineWidth', label: 'Line Width', type: 'number', value: rsi.rsiOptions.lineWidth || 2, min: 1, max: 5 },
                    { key: 'upperBandColor', label: 'Overbought Line', type: 'color', value: rsi.rsiOptions.overboughtColor || 'rgba(239, 83, 80, 0.5)' },
                    { key: 'lowerBandColor', label: 'Oversold Line', type: 'color', value: rsi.rsiOptions.oversoldColor || 'rgba(38, 166, 154, 0.5)' },
                ]
            };
        } else if (ind instanceof EMAIndicator) {
            const ema = ind as EMAIndicator;
            config = {
                name: ind.name,
                parameters: [
                    { key: 'length', label: 'Length', type: 'number', value: ema.period, min: 1, max: 500, step: 1 },
                ],
                styleParameters: [
                    { key: 'lineColor', label: 'Line Color', type: 'color', value: ema.emaOptions.color || '#2962ff' },
                    { key: 'lineWidth', label: 'Line Width', type: 'number', value: ema.emaOptions.lineWidth || 2, min: 1, max: 5 },
                ]
            };
        } else if (ind instanceof SMAIndicator) {
            const sma = ind as SMAIndicator;
            config = {
                name: ind.name,
                parameters: [
                    { key: 'length', label: 'Length', type: 'number', value: sma.period, min: 1, max: 500, step: 1 },
                ],
                styleParameters: [
                    { key: 'lineColor', label: 'Line Color', type: 'color', value: sma.smaOptions.color || '#f23645' },
                    { key: 'lineWidth', label: 'Line Width', type: 'number', value: sma.smaOptions.lineWidth || 2, min: 1, max: 5 },
                ]
            };
        } else if (ind instanceof BBIndicator) {
            const bb = ind as BBIndicator;
            config = {
                name: ind.name,
                parameters: [
                    { key: 'period', label: 'Period', type: 'number', value: bb.bbOptions.period, min: 1, max: 500, step: 1 },
                    { key: 'stdDev', label: 'StdDev', type: 'number', value: bb.bbOptions.stdDev, min: 0.1, max: 10, step: 0.1 },
                ],
                styleParameters: [
                    { key: 'lineColor', label: 'Middle Band', type: 'color', value: bb.bbOptions.color || '#2962ff' },
                    { key: 'lineWidth', label: 'Line Width', type: 'number', value: bb.bbOptions.lineWidth || 1, min: 1, max: 5 },
                ]
            };
        } else if (ind instanceof MACDIndicator) {
            const macd = ind as MACDIndicator;
            config = {
                name: ind.name,
                parameters: [
                    { key: 'fastLength', label: 'Fast Length', type: 'number', value: macd.macdOptions.fastPeriod, min: 1, max: 500, step: 1 },
                    { key: 'slowLength', label: 'Slow Length', type: 'number', value: macd.macdOptions.slowPeriod, min: 1, max: 500, step: 1 },
                    { key: 'signalLength', label: 'Signal Range', type: 'number', value: macd.macdOptions.signalPeriod, min: 1, max: 100, step: 1 },
                ],
                styleParameters: [
                    { key: 'lineColor', label: 'MACD Color', type: 'color', value: macd.options.color || '#2196f3' },
                    { key: 'lineWidth', label: 'Line Width', type: 'number', value: macd.options.lineWidth || 1.5, min: 1, max: 5 },
                ]
            };
        } else if (ind instanceof StochIndicator) {
            const stoch = ind as StochIndicator;
            config = {
                name: ind.name,
                parameters: [
                    { key: 'kLength', label: '%K Length', type: 'number', value: stoch.stochOptions.kPeriod, min: 1, max: 200 },
                    { key: 'sLength', label: '%K Smoothing', type: 'number', value: stoch.stochOptions.sPeriod, min: 1, max: 50 },
                    { key: 'dLength', label: '%D Smoothing', type: 'number', value: stoch.stochOptions.dPeriod, min: 1, max: 50 },
                ],
                styleParameters: [
                    { key: 'lineColor', label: '%K Color', type: 'color', value: stoch.options.color || '#2196f3' },
                    { key: 'lineWidth', label: 'Line Width', type: 'number', value: stoch.options.lineWidth || 1.5, min: 1, max: 5 },
                ]
            };
        }

        if (config) {
            this._indicatorSettingsModal?.show(config);
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
        if (!this._mainLegendContainer) return;
        this._mainLegendContainer.innerHTML = '';

        this._indicatorManager.overlayIndicators.forEach(indicator => {
            const row = document.createElement('div');
            row.className = `tv-legend-item ${indicator.visible ? '' : 'hidden'}`;

            const name = document.createElement('span');
            name.className = 'tv-legend-name';
            name.textContent = `${indicator.name}`;
            row.appendChild(name);

            // Actions Container
            const actions = document.createElement('div');
            actions.className = 'tv-legend-actions';

            const createButton = (iconSvg: string, title: string, onClick: (e: MouseEvent) => void) => {
                const btn = document.createElement('div');
                btn.className = 'tv-legend-btn';
                btn.title = title;
                btn.innerHTML = iconSvg;
                btn.onclick = (e) => {
                    e.stopPropagation();
                    onClick(e);
                };
                return btn;
            };

            // Eye Icon (Heroicons Mini)
            const hideBtn = createButton(`
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                    <path fill-rule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clip-rule="evenodd" />
                </svg>
            `, 'Hide/Show', () => {
                indicator.setVisible(!indicator.visible);
                this._updateMainLegend();
                this._scheduleDraw();
            });

            // Settings Icon (Heroicons Mini Gear)
            const settingsBtn = createButton(`
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .205 1.251l-1.18 2.044a1 1 0 0 1-1.186.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.331 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.113a7.047 7.047 0 0 1 0-2.228l-1.267-1.113a1 1 0 0 1-.205-1.251l1.18-2.044a1 1 0 0 1 1.186-.447l1.598.54a6.993 6.993 0 0 1 1.929-1.115L7.84 1.804ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clip-rule="evenodd" />
                </svg>
            `, 'Settings', () => this._openIndicatorSettings(indicator));

            // Remove Icon (Heroicons Mini Trash)
            const removeBtn = createButton(`
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 1 .75.75v5a.75.75 0 0 1-1.5 0v-5a.75.75 0 0 1 .75-.75Zm3.59.75a.75.75 0 0 0-1.5 0v5a.75.75 0 0 0 1.5 0v-5Z" clip-rule="evenodd" />
                </svg>
            `, 'Remove', () => this._indicatorManager.removeIndicator(indicator.id));

            actions.appendChild(hideBtn);
            actions.appendChild(settingsBtn);
            actions.appendChild(removeBtn);
            row.appendChild(actions);
            this._mainLegendContainer!.appendChild(row);
        });
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
