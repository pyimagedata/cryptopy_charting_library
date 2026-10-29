import { ChartModel, ChartModelOptions, GridOptions, InvalidateReason } from '../model/chart-model';
import { Delegate } from '../helpers/delegate';
import { t, setLanguage, getCurrentLanguage } from '../helpers/translations';
import { getTheme, ThemeType } from '../helpers/themes';
import { CandlestickSeries, CandlestickSeriesOptions } from '../model/candlestick-series';
import { LineSeries, LineSeriesOptions } from '../model/line-series';
import { AreaSeries, AreaSeriesOptions } from '../model/area-series';
import { HeikenAshiSeries, HeikenAshiSeriesOptions } from '../series/heiken-ashi-series';
import { BarData, LineData } from '../model/data';
import { PriceScale, PriceScaleMode } from '../model/price-scale';
import { PaneWidget } from './pane-widget';
import { PriceAxisWidget } from './price-axis-widget';
import { OffsetPriceScale } from '../model/offset-price-scale';
import { coordinate } from '../model/coordinate';
import { SpotPriceSource } from '../model/spot-price-source';
import { TimeAxisWidget } from './time-axis-widget';
import { ContextMenu, ContextMenuItem, ICONS } from './context_menu';
import { openAlertDialog, AlertDialogChart } from './alerts/alert-dialog';
import { alertCatalogId, alertIndicatorEntries, AlertIndicatorEntry } from '../alerts/indicator-plots';
import { DrawingAlertsController } from './alerts/drawing-alerts';
import { alertGeometryFor, alertDrawingLabel, geometrySeedPrice, isAlertableDrawing } from '../alerts/drawing-geometry';
import { AlertLinesController } from './alerts/alert-lines';
import { alertTicker, exactPrice, makeAlertSymbolId, snapAlertPrice } from '../alerts/alert-text';
import { LegendAction, LegendPoint, LEGEND_ICONS } from './indicator_legend';
import { WatchlistPanel } from './watchlist/watchlist_panel';
import { ObjectTreePanel } from './object_tree/object_tree_panel';
import { AlertsPanel, AlertsPanelChart } from './alerts/alerts-panel';
import { indicatorRowSignature } from './object_tree/object_tree_model';
import { ToolbarWidget, ChartType } from './toolbar';
import { SymbolSearch, SymbolInfo } from './symbol_search';
import { IndicatorType, IndicatorPaneWidget, PanelIndicator, IndicatorManager, Indicator, RSIIndicator, EMAIndicator, SMAIndicator, BBIndicator, MACDIndicator, StochIndicator, ParabolicSARIndicator, SuperTrendIndicator, AlphaTrendIndicator, IchimokuIndicator, FixedRangeVolumeProfileIndicator, ZigZagTrendlineIndicator, TrendlineBreakoutIndicator, VolumeIndicator, HMAIndicator, StochRSIIndicator, HalfTrendIndicator, TdojiOscillatorIndicator, ThunderbirdxIndicator, TdojiSRIndicator, TdojiMomIndicator, ZigZagIndicator, ABCDPatternIndicator, HarmonicPatternIndicator, ChartPatternsIndicator, DeMarkPivotIndicator, SMCIndicator, SpecialForcesIndicator, OverlayIndicator, BobbinIndicator, FVGIndicator, FvgInversionIndicator, EqHLIndicatorV2, JudasSwingIndicator, SMTDivergenceIndicator } from '../indicators';
import { IndicatorSearchModal, IndicatorAccess, isIndicatorAllowed, getIndicatorAccess, setIndicatorAccess, subscribeIndicatorAccess } from './indicator_search';
import { IndicatorSettingsModal, applySavedDefaults, withCommonSettings, safeLocalStorage } from './indicator_settings';
import { DrawingToolbarWidget } from './drawing_toolbar';
import { DrawingToolbarBinding } from './drawing_toolbar/drawing_toolbar_binding';
import { DrawingManager, DrawingMode, Drawing } from '../drawings';
import { TableDrawing } from '../drawings/note-drawings';
import { INLINE_TEXT_TYPES } from '../drawings/text-common';
import { hasAxisLabels, hasPriceScaleConsumer, estimatePricePrecision } from '../drawings/line-tool-common';
import { InteractionTools, ToolEnv, collectIndicatorPrices, CURSOR_KINDS, MODE_TOOLS } from './chart_widget/interaction-tools';
import { hasBarDataConsumer } from '../drawings/volume-tools-common';
import { FloatingAttributeBar } from './attribute_bar';
import { getPopoverHost } from './settings_modal/components/popover';
import { TextEditorOverlay } from './text-editor-overlay';
import { createSettingsModal, BaseSettingsModal } from './settings_modal';
import { ChartSettingsModal } from './chart-settings-modal';
import { ChartStateManager } from '../state';
import {
    MAIN_PANE_ID, PANE_STYLE, PaneAction, PaneLayoutPersist, canMovePane, dragSeparator, isPaneHiddenByInterval,
    paneColors, resolvePaneLayout, setPaneSeparatorOverride, getPaneSeparatorOverride, toggleCollapsed, toggleMaximized,
} from '../indicators/pane-layout';
import { AddTextTooltipHelper } from './tooltips';
import { TechnicalRatingBadge } from './technical-rating-badge';
import {
    BinanceSpotProvider,
    BinanceFuturesProvider,
    BybitSpotProvider,
    BybitFuturesProvider,
    OkxSpotProvider,
    OkxFuturesProvider,
    Orderbook
} from '../data-providers';
import { BistDataProvider } from '../data-providers/stocks/bist';
import { OrderbookHeatmapRenderer } from '../renderers/orderbook-heatmap-renderer';
import { ReplayController, ReplayChartAdapter } from '../replay/replay-controller';
import { ReplayUI } from './replay';
import { timeAtFloatIndex, floatIndexAtTime, scrollOffsetForRightEdge } from './layouts/time-sync-math';

// Type for all orderbook providers
type OrderbookProvider = BinanceSpotProvider | BinanceFuturesProvider |
    BybitSpotProvider | BybitFuturesProvider |
    OkxSpotProvider | OkxFuturesProvider | BistDataProvider;
import {
    ChartWidgetContext,
    isTypingTarget,
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
    handleContextCopyPrice,
    handleContextScreenshot,
    handleContextFullscreen,
    handleContextResetChart
} from './chart_widget';


/** Disposable interface for cleanup */
interface Disposable {
    dispose(): void;
}

export interface ChartWidgetOptions extends Omit<Partial<ChartModelOptions>, 'locale'> {
    symbol?: string;
    timeframe?: string;
    exchange?: string;
    locale?: ChartModelOptions['locale'];
    showToolbar?: boolean;
    /** Multi-chart slot index; slots >= 1 persist drawings/indicators under their own keys (slot 0 keeps the per-symbol key). */
    stateSlot?: number;
    showDrawingToolbar?: boolean;
}

/**
 * Chart widget - main UI container
 */
/** Coklu grafik imlec senkronu: imlecin gosterdigi zaman (+ ana panelde ise fiyat). */
export interface CrosshairSyncInfo {
    time: number;
    price: number | null;
    symbol: string;
}

function toMsTime(t: number): number {
    return t > 1e12 ? t : t * 1000;
}

/** Spot modunda fiyat ekseninin basligi ve son fiyat etiketi rengi. */
const SPOT_AXIS_COLOR = '#f5a623';
const SPOT_MODE_KEY = 'chart.axis.spotMode';

function readSpotMode(): boolean {
    try {
        return localStorage.getItem(SPOT_MODE_KEY) === '1';
    } catch {
        return false;
    }
}

function writeSpotMode(enabled: boolean): void {
    try {
        localStorage.setItem(SPOT_MODE_KEY, enabled ? '1' : '0');
    } catch {
        // Depolama kapali: tercih sadece bu oturumda gecerli.
    }
}

/** Klavye kisayollarini alacak aktif grafik (cok grafikli sayfada tek grafik tepki verir) */
const ALERT_MENU_ICON = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M9 2.5a4.5 4.5 0 0 0-4.5 4.5c0 3-1.5 4.5-1.5 4.5h12s-1.5-1.5-1.5-4.5A4.5 4.5 0 0 0 9 2.5z"/><path d="M7.6 14a1.5 1.5 0 0 0 2.8 0"/></svg>`;

let _keyboardActiveChart: ChartWidget | null = null;

export class ChartWidget implements Disposable {
    private readonly _container: HTMLElement;
    private readonly _model: ChartModel;
    private _element: HTMLElement | null = null;

    // Layout elements
    private _chartRow: HTMLElement | null = null;
    private _watchlistPanel: WatchlistPanel | null = null;
    private _objectTreePanel: ObjectTreePanel | null = null;
    private _alertsPanel: AlertsPanel | null = null;
    /** Object tree lives in a host-owned sidebar (multi-chart layout): it must not squeeze this chart. */
    private _objectTreeExternal: HTMLElement | null = null;
    private _timeAxisRow: HTMLElement | null = null;
    private _indicatorContainer: HTMLElement | null = null;

    // Widgets
    private _toolbarWidget: ToolbarWidget | null = null;
    private _drawingToolbarWidget: DrawingToolbarWidget | null = null;
    private _drawingToolbarBinding: DrawingToolbarBinding | null = null;
    /** Host-owned (MultiChartLayout) shared drawing toolbar: tool selection by shortcut goes through it. */
    private _sharedToolbar: { select: (tool: string) => void; closeFlyout: () => void } | null = null;
    /** Eraser / Measure / Zoom In modes and Dot / Demonstration cursors (not drawings) */
    private readonly _interactionTools = new InteractionTools();
    private _toolEnvCache: { key: string; times: number[]; precision: number } | null = null;
    private _symbolSearch: SymbolSearch | null = null;
    private _paneWidget: PaneWidget | null = null;
    private _priceAxisWidget: PriceAxisWidget | null = null;
    /** Fiyat ekseni spot karsiligini (GC1 -> XAUUSD FOREXCOM) gosteriyor mu: toolbar dugmesi. */
    private _spotMode = readSpotMode();
    private readonly _spotSource = new SpotPriceSource(() => this._scheduleDraw());
    /** Spot modunda eksene verilen, fark kadar kaydirilmis olcek. */
    private _spotScale: OffsetPriceScale | null = null;
    private _spotButtonState = '';
    private readonly _spotStateChanged = new Delegate<{ label: string | null; active: boolean }>();
    private _timeAxisWidget: TimeAxisWidget | null = null;
    private _floatingAttributeBar: FloatingAttributeBar | null = null;
    private _textEditor: TextEditorOverlay | null = null;
    private _drawingSettingsModal: BaseSettingsModal | null = null;
    private readonly _boundKeyDown: (e: KeyboardEvent) => void = (e) => this._onKeyDown(e);

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
    private _activeChartType: ChartType = 'candles';
    private _drawScheduled: boolean = false;

    // Interaction state
    private _isDragging: boolean = false;
    private _isPriceScaleDragging: boolean = false;
    private _lastMouseX: number = 0;
    private _lastMouseY: number = 0;
    private _interactionPaneId: string | null = null;
    private _interactionPaneCanvas: HTMLCanvasElement | null = null;
    private _interactionPriceScale: PriceScale | null = null;

    private readonly _symbolChanged = new Delegate<string>();
    private readonly _crosshairMoved = new Delegate<CrosshairSyncInfo | null>();
    private _crosshairSyncEnabled = false;
    private _pointerInside = false;
    private _syncedCrosshair: CrosshairSyncInfo | null = null;
    private _syncedLocalY: number | null = null;
    private _lastCrosshairKey = '';
    private readonly _timeframeChanged = new Delegate<string>();
    private readonly _objectTreeVisibilityChanged = new Delegate<boolean>();
    /** Bar replay engine (see src/replay). Public through the `replay` getter. */
    private readonly _replay: ReplayController = new ReplayController(this._createReplayAdapter());
    /** TradingView-style replay UI (selection line + control bar). */
    private _replayUI: ReplayUI | null = null;
    private _replayStateWired = false;
    private readonly _wiredIndicators = new WeakSet<Indicator>();

    // Context menu
    private _contextMenu: ContextMenu | null = null;
    private _drawingContextMenu: ContextMenu | null = null;
    private _mainLegendContainer: HTMLElement | null = null;
    private _brandingLogo: HTMLElement | null = null;
    private _gainMetricsPanel: HTMLElement | null = null;

    // Indicator system
    private readonly _indicatorManager: IndicatorManager;
    private readonly _indicatorPanes: Map<string, IndicatorPaneWidget> = new Map();
    // Sub-pane layout (persisted with the indicators): collapsed / maximized state, heights of restored panes
    private _collapsedPanes: Set<string> = new Set();
    private _maximizedPane: string | null = null;
    private _savedPaneHeights: Record<string, number> = {};
    private _lastMainHeight = 0;
    private _paneHiddenSig = '';
    private _paneDrag: { id: string; startY: number; upperId: string | null; upperH: number; lowerH: number } | null = null;
    private _mainPaneButton: HTMLButtonElement | null = null;
    private _mainPaneHover = false;

    // Loading overlay
    private _loadingOverlay: HTMLElement | null = null;
    private _noticeEl: HTMLElement | null = null;

    private _unsubscribeIndicatorAccess: (() => void) | null = null;
    // Indicator search modal
    private _indicatorSearchModal: IndicatorSearchModal | null = null;
    private _indicatorSettingsModal: IndicatorSettingsModal | null = null;
    private _chartSettingsModal: ChartSettingsModal | null = null;
    private _editingIndicator: PanelIndicator | OverlayIndicator | null = null;

    // State persistence
    private _chartStateManager: ChartStateManager | null = null;

    // Add Text tooltip
    private _addTextTooltipHelper: AddTextTooltipHelper | null = null;
    private _hoveredDrawingForText: string | null = null;

    // Indicator panes visibility (toggle with double-click on empty area)
    private _indicatorPanesHidden: boolean = false;

    // Mobile Zoom State
    private _lastTouchDistance: number = 0;
    private _touchLongPressTimer: number | null = null;
    private _touchLongPressStart: { clientX: number; clientY: number } | null = null;
    private _touchLongPressTriggered: boolean = false;
    private _priceAxisTouchStart: { x: number; y: number } | null = null;
    private _priceAxisTouchActive: 'scaling' | 'panning' | null = null;

    // Technical Rating Badge
    private _technicalRatingBadge: TechnicalRatingBadge | null = null;
    private _currentTheme: ThemeType = 'light';
    private _candlestickStyleOverrides: Partial<CandlestickSeriesOptions> = {};
    private _heikenAshiStyleOverrides: Partial<HeikenAshiSeriesOptions> = {};

    // Orderbook Heatmap
    private _dataProvider: OrderbookProvider | null = null;
    private _heatmapRenderer: OrderbookHeatmapRenderer | null = null;
    private _currentSymbol: string = '';
    private _currentExchange: string = 'BINANCE';

    // Throttling for orderbook updates
    private _lastOrderbookUpdate: number = 0;

    // Auto-resize
    private _resizeObserver: ResizeObserver | null = null;
    private readonly _showToolbar: boolean;
    private readonly _showDrawingToolbar: boolean;



    constructor(container: HTMLElement | string, options: ChartWidgetOptions = {}) {
        // Check localStorage for theme preference
        try {
            const savedTheme = localStorage.getItem('tv-chart-theme');
            if (savedTheme === 'dark' || savedTheme === 'light') {
                options.theme = savedTheme as 'dark' | 'light';
            }
        } catch (e) {
            // Include a gentle catch-all
        }

        // Set language first
        if (options.locale) {
            setLanguage(options.locale as any);
        }

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
        this._restoreGridOptions();
        this._restoreCanvasOptions();
        this._showToolbar = options.showToolbar !== false;
        this._showDrawingToolbar = options.showDrawingToolbar !== false;

        const initialSymbol = options.symbol || 'BTCUSDT';
        const initialTimeframe = options.timeframe || '1h';
        const initialExchange = options.exchange || 'BINANCE';
        this._currentExchange = initialExchange;

        // Set initial symbol/timeframe in model
        this._model.setSymbol(initialSymbol);
        this._model.setTimeframe(initialTimeframe);
        this._model.setExchange(initialExchange);

        // Initialize indicator manager
        this._indicatorManager = new IndicatorManager();
        this._indicatorManager.onPaneAdded = this._onIndicatorPaneAdded.bind(this);
        this._indicatorManager.onPaneRemoved = this._onIndicatorPaneRemoved.bind(this);
        this._indicatorManager.onIndicatorAdded = () => { this._updateMainLegend(); this._objectTreePanel?.refresh(); };
        this._indicatorManager.onIndicatorRemoved = () => { this._updateMainLegend(); this._objectTreePanel?.refresh(); };

        // Initialize drawing manager
        this._drawingManager = new DrawingManager();
        this._drawingManager.setTimeframe(initialTimeframe);
        this._drawingManager.setScales(this._model.timeScale, this._model.rightPriceScale);
        // Magnet "Snap to indicators": overlay indicator values at the bar are extra snap candidates
        this._drawingManager.setIndicatorPriceProvider((time) =>
            collectIndicatorPrices(this._indicatorManager.overlayIndicators as any, time));
        this._drawingManager.modeChanged.subscribe(() => {
            this._interactionTools.syncHost(this._drawingManager.mode !== 'none');
            this._scheduleDraw();
        });
        this._drawingManager.drawingsChanged.subscribe(() => {
            this._scheduleDraw();
        });
        // Satir ici metin editoru (Text/Callout): dinleyici varligi, yeni cizimin gecmis kaydini editor kapanana kadar erteler
        this._drawingManager.textEditRequested.subscribe(({ drawing, isNew }) => {
            // Tarayicinin mousedown odak islemi bittikten sonra ac (aksi halde textarea odagi kaybeder)
            setTimeout(() => {
                if (!this._element || !this._drawingManager.drawings.includes(drawing)) {
                    this._drawingManager.clearPendingText(drawing.id);
                    return;
                }
                if (!this._textEditor) {
                    this._textEditor = new TextEditorOverlay(
                        this._element,
                        (d) => this._getTextEditorCanvas(d),
                        this._drawingManager,
                        () => this._scheduleDraw()
                    );
                }
                this._textEditor.open(drawing, isNew);
            }, 0);
        });
        this._drawingManager.setPaneExistsResolver((paneId) => this._indicatorPanes.has(paneId));
        // Undo/redo cizim nesnelerini yeniden kurar: acik modal / attribute bar kopuk nesneyi duzenlemesin
        this._drawingManager.historyRestored.subscribe(() => {
            this._drawingSettingsModal?.hide();
            this._floatingAttributeBar?.hide();
        });

        // Initialize chart state manager for per-symbol persistence
        this._chartStateManager = new ChartStateManager(
            this._drawingManager, this._indicatorManager, undefined, options.stateSlot ?? 0);
        this._chartStateManager.setPaneLayoutHost({
            getPaneLayout: () => this._getPaneLayout(),
            applyPaneLayout: (layout) => this._applyPaneLayoutState(layout),
        });
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
        if (this._element) {
            this._chartSettingsModal = new ChartSettingsModal(this._element);
            this._chartSettingsModal.setTheme(this._currentTheme);
            this._chartSettingsModal.setChart(this);
        }

        // Now that UI is created, load saved state for symbol
        this._chartStateManager.setSymbol(initialSymbol);
        this._wireExistingIndicators();

        // Initialize indicator search modal
        this._indicatorSearchModal = new IndicatorSearchModal(this._container);
        this._indicatorSearchModal.indicatorSelected.subscribe((indicatorId) => {
            this._onIndicatorSelected(indicatorId);
        });
        this._indicatorSearchModal.setTheme(this._currentTheme === 'light' ? 'light' : 'dark');
        // Plan access changes (setIndicatorAccess, any chart): drop indicators that became locked
        this._unsubscribeIndicatorAccess = subscribeIndicatorAccess(() => {
            this._indicatorManager.removeDisallowed();
            this._indicatorSearchModal?.refreshAccess();
            this._scheduleDraw();
        });

        // Initialize indicator settings modal
        this._indicatorSettingsModal = new IndicatorSettingsModal(this._container);
        this._indicatorSettingsModal.setTheme(this._currentTheme === 'light' ? 'light' : 'dark');
        // Settings apply live while the dialog is open (Cancel restores the snapshot)
        this._indicatorSettingsModal.liveChanged.subscribe(() => {
            this._updateMainLegend();
            this._scheduleDraw();
        });
        this._indicatorSettingsModal.closed.subscribe(() => {
            // Ok and Cancel both end here: refresh and persist the final state
            // (the modal never recalculates from here: it already did, per change)
            if (this._editingIndicator) {
                this._updateMainLegend();
                this._scheduleDraw();
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

        // Fetch initial technical rating
        this._technicalRatingBadge?.updateRating(this._model.symbol, this._model.timeframe, this._currentExchange);

        // Initialize data provider and orderbook heatmap
        this._initializeDataProvider();

        // Auto-resize observer
        this._resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Use contentRect for precise content box size
                if (entry.contentRect) {
                    this.resize(entry.contentRect.width, entry.contentRect.height);
                }
            }
        });

        this._resizeObserver.observe(this._container);

        // Apply initial theme
        if (options.theme) {
            this.setTheme(options.theme as ThemeType);
        } else {
            // Tema hic secilmemisse (kayitli tercih yok) grafik varsayilan renkleriyle
            // cizilir; ayar pencereleri gibi temaya bakan parcalar da ona uysun diye
            // tema arka plan rengine gore belirlenir (eskiden sabit 'light' kaliyor,
            // koyu grafikte ayar pencereleri acik renkte aciliyordu).
            const bg = String(this._model.options.layout.backgroundColor || '');
            const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(bg);
            if (m) {
                const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
                this._currentTheme = (0.2126 * r + 0.7152 * g + 0.0722 * b) < 0.5 ? 'dark' : 'light';
                // Nesne agaci paneli yerlesim sirasinda varsayilan 'light' ile olusmustu
                this._objectTreePanel?.setTheme(this._currentTheme === 'light' ? 'light' : 'dark');
                this._watchlistPanel?.setTheme(this._currentTheme === 'light' ? 'light' : 'dark');
                this._alertsPanel?.setTheme(this._currentTheme === 'light' ? 'light' : 'dark');
                this._replayUI?.setTheme(this._currentTheme === 'light' ? 'light' : 'dark');
            }
        }
        if (this._bgCustomized) this._applyBackground();
    }

    /**
     * Initialize the data provider based on symbol type
     */
    private async _initializeDataProvider(): Promise<void> {
        // Disconnect existing
        if (this._dataProvider) {
            // Check if disconnect exists (TS safety)
            if ('disconnect' in this._dataProvider) {
                (this._dataProvider as any).disconnect();
            }
        }

        if (this._currentExchange === 'BIST') {
            this._dataProvider = new BistDataProvider();
        } else {
            // For now, use Spot provider. Later we can detect if symbol is futures
            this._dataProvider = new BinanceSpotProvider({ maxOrderbookLevels: 5000 });
        }

        this._heatmapRenderer = new OrderbookHeatmapRenderer();
        if (this._heatmapRenderer && this._toolbarWidget) {
            this._heatmapRenderer.enabled = this._toolbarWidget.domEnabled;
        }

        await this._dataProvider.connect();

        // Subscribe to orderbook if enabled
        this._currentSymbol = this._model.symbol;
        if (this._toolbarWidget?.domEnabled && this._dataProvider) {
            this._dataProvider.subscribeOrderbook(this._currentSymbol, this._onOrderbookUpdate);
        }
    }

    /**
     * Handle orderbook updates
     */
    private _onOrderbookUpdate = (orderbook: Orderbook): void => {
        const now = Date.now();
        if (now - this._lastOrderbookUpdate > 500) {
            this._lastOrderbookUpdate = now;
            this._heatmapRenderer?.updateOrderbook({
                symbol: orderbook.symbol,
                lastUpdateId: orderbook.timestamp,
                bids: orderbook.bids,
                asks: orderbook.asks
            });
            this._scheduleDraw();

            if (orderbook.bids.length > 0 && orderbook.asks.length > 0) {
                // Optional debug log
                // const lowestBid = orderbook.bids[orderbook.bids.length - 1].price;
                // const highestAsk = orderbook.asks[orderbook.asks.length - 1].price;
                // console.log(`📚 Orderbook: ${lowestBid.toFixed(2)} - ${highestAsk.toFixed(2)}`);
            }
        } else {
            // Still update internal state even if not redrawing immediately
            this._heatmapRenderer?.updateOrderbook({
                symbol: orderbook.symbol,
                lastUpdateId: orderbook.timestamp,
                bids: orderbook.bids,
                asks: orderbook.asks
            });
        }
    };

    // --- Public API ---

    get model(): ChartModel {
        return this._model;
    }

    /** Kullanici bu grafikte imleci hareket ettirince (sadece senkron aciksa) yayinlanir. */
    get crosshairMoved(): Delegate<CrosshairSyncInfo | null> {
        return this._crosshairMoved;
    }

    /** Coklu grafik duzeni acar/kapatir; kapaliyken grafik eskisi gibi davranir. */
    setCrosshairSyncEnabled(enabled: boolean): void {
        if (this._crosshairSyncEnabled === enabled) return;
        if (!enabled) this.setSyncedCrosshair(null);
        this._crosshairSyncEnabled = enabled;
    }

    /**
     * Baska bir grafikteki imleci bu grafikte ayni ZAMANA yansitir (piksele degil):
     * farkli zaman dilimlerinde o zamani iceren mum secilir; yatay cizgi sadece
     * ayni sembolde gosterilir. Fare bu grafigin uzerindeyse yok sayilir.
     */
    setSyncedCrosshair(info: CrosshairSyncInfo | null): void {
        if (!this._crosshairSyncEnabled || this._pointerInside) return;
        this._syncedCrosshair = info;
        const x = info ? this._xAtTime(info.time) : null;
        if (info === null || x === null) {
            this._syncedLocalY = null;
            this._model.setCrosshairPosition(0, 0, false);
        } else {
            this._syncedLocalY = info.price !== null && info.symbol === this._model.symbol
                ? (this._model.rightPriceScale.priceToCoordinate(info.price) as number)
                : null;
            this._model.setCrosshairPosition(x, 0, true);
        }
        this._scheduleDraw();
    }

    /** Fired after the user scrolls / zooms this chart's time axis (not for programmatic changes). */
    get viewChanged(): Delegate<void> {
        return this._model.timeScale.userViewChanged;
    }

    private _mainSeriesLike(): { n: number; at: (i: number) => number } {
        const data = (this._model.serieses[0]?.data ?? []) as { time: number }[];
        return { n: data.length, at: (i) => toMsTime(data[i].time) };
    }

    /**
     * Visible time span (ms) of the main series: time at the left edge and at the right edge of the pane
     * (interpolated / extrapolated past the data). null when there is no data or the pane has no width.
     */
    getVisibleTimeRange(): { from: number; to: number } | null {
        const ts = this._model.timeScale;
        if (ts.width <= 0) return null;
        const s = this._mainSeriesLike();
        const from = timeAtFloatIndex(s, ts.coordinateToFloatIndex(0 as any));
        const to = timeAtFloatIndex(s, ts.coordinateToFloatIndex((ts.width - 1) as any));
        return from === null || to === null ? null : { from, to };
    }

    /** Scrolls (keeping the zoom) so that `timeMs` is at the right edge. Silent (no viewChanged). */
    setRightEdgeTime(timeMs: number): void {
        const ts = this._model.timeScale;
        const f = floatIndexAtTime(this._mainSeriesLike(), timeMs);
        if (f === null || ts.width <= 0) return;
        ts.scrollToPosition(scrollOffsetForRightEdge(ts.pointsCount, ts.rightOffset, f), false);
        this._model.recalculateAllPanes();
    }

    /** Fits [fromMs, toMs] to the pane width (changes zoom). Silent (no viewChanged). */
    setVisibleTimeRange(fromMs: number, toMs: number): void {
        const ts = this._model.timeScale;
        const s = this._mainSeriesLike();
        const a = floatIndexAtTime(s, fromMs);
        const b = floatIndexAtTime(s, toMs);
        if (a === null || b === null || ts.width <= 0 || b <= a) return;
        ts.setVisibleBarRange(a, b, true);
        this._model.recalculateAllPanes();
    }

    private _mainBarTimes(): number[] {
        const data = this._model.serieses[0]?.data as { time: number }[] | undefined;
        return data ? data.map((d) => toMsTime(d.time)) : [];
    }

    private _timeAtX(x: number): number | null {
        const times = this._mainBarTimes();
        const n = times.length;
        if (!n) return null;
        const idx = this._model.timeScale.coordinateToIndex(x as any) as number;
        if (idx < 0) return null;
        if (idx < n) return times[idx];
        const dur = n > 1 ? times[n - 1] - times[n - 2] : 0;
        return dur > 0 ? times[n - 1] + (idx - (n - 1)) * dur : null;
    }

    private _xAtTime(timeMs: number): number | null {
        const t = toMsTime(timeMs);
        const times = this._mainBarTimes();
        const n = times.length;
        if (!n || t < times[0]) return null;
        // t'yi iceren mum: acilisi t'den kucuk/esit olan son mum.
        let lo = 0;
        let hi = n - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (times[mid] <= t) lo = mid;
            else hi = mid - 1;
        }
        let idx = lo;
        if (idx === n - 1 && n > 1) {
            const dur = times[n - 1] - times[n - 2];
            if (dur > 0 && t >= times[n - 1] + dur) idx = n - 1 + Math.floor((t - times[n - 1]) / dur);
        }
        const x = this._model.timeScale.indexToCoordinate(idx as any) as number;
        const width = this._model.timeScale.width;
        return x < 0 || x > width ? null : x;
    }

    private _emitCrosshair(info: CrosshairSyncInfo | null): void {
        const key = info ? `${info.time}|${info.price}|${info.symbol}` : 'null';
        if (key === this._lastCrosshairKey) return;
        this._lastCrosshairKey = key;
        this._crosshairMoved.fire(info);
    }

    private _emitCrosshairFromModel(e: MouseEvent): void {
        const cross = this._model.crosshairPosition;
        const time = cross && cross.visible ? this._timeAtX(cross.x) : null;
        if (time === null) {
            this._emitCrosshair(null);
            return;
        }
        let price: number | null = null;
        const rect = this._paneWidget?.element?.getBoundingClientRect();
        if (rect && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            price = this._model.rightPriceScale.coordinateToPrice((e.clientY - rect.top) as any) as number;
        }
        this._emitCrosshair({ time, price, symbol: this._model.symbol });
    }

    get symbolChanged(): Delegate<string> {
        return this._symbolChanged;
    }

    get timeframeChanged(): Delegate<string> {
        return this._timeframeChanged;
    }

    /** Bar replay controller of this chart (start / step / play / stop, host hooks, state events). */
    get replay(): ReplayController {
        return this._replay;
    }

    get chartType(): ChartType {
        return this._activeChartType;
    }

    get priceScaleMode(): 'normal' | 'logarithmic' {
        return this._model.rightPriceScale.mode === PriceScaleMode.Logarithmic ? 'logarithmic' : 'normal';
    }

    get symbol(): string {
        return this._model.symbol;
    }

    get timeframe(): string {
        return this._model.timeframe;
    }

    setSymbol(symbol: string | SymbolInfo): void {
        const symbolInfo: SymbolInfo = typeof symbol === 'string'
            ? {
                symbol,
                full_name: symbol,
                description: symbol,
                exchange: this._currentExchange || this._model.exchange || 'BINANCE',
                type: 'crypto',
            }
            : symbol;

        this._onSymbolChange(symbolInfo);
    }

    setTimeframe(timeframe: string): void {
        if (this._toolbarWidget) {
            this._toolbarWidget.setTimeframe(timeframe, false);
        }

        this._onTimeframeChange(timeframe);
    }

    setChartType(type: ChartType): void {
        if (this._toolbarWidget) {
            this._toolbarWidget.setChartType(type);
            return;
        }

        this._onChartTypeChange(type);
    }

    setPriceScaleMode(mode: 'normal' | 'logarithmic'): void {
        if (this._toolbarWidget) {
            this._toolbarWidget.setPriceScaleMode(mode);
            return;
        }

        this._onPriceScaleModeChange(mode);
    }

    setDomEnabled(enabled: boolean): void {
        if (!this._heatmapRenderer) {
            return;
        }

        this._heatmapRenderer.enabled = enabled;
        if (enabled) {
            this._dataProvider?.subscribeOrderbook(this._currentSymbol, this._onOrderbookUpdate);
        } else if (this._dataProvider instanceof BinanceSpotProvider) {
            this._dataProvider.unsubscribeOrderbook(this._currentSymbol);
        } else {
            (this._dataProvider as any)?.unsubscribeOrderbook?.(this._currentSymbol);
        }

        this._scheduleDraw();
    }

    showSymbolSearch(): void {
        this._symbolSearch?.show();
    }

    /** Type-to-open entry point for hosts that own the keyboard listener (MultiChartLayout). */
    handleTypeToOpen(e: KeyboardEvent): boolean {
        return this._symbolSearch?.handleTypeToOpen(e) ?? false;
    }

    private _createSymbolSearch(): SymbolSearch {
        const search = new SymbolSearch({
            getActiveSymbol: () => ({ symbol: this._model.symbol, exchange: this._model.exchange }),
            getTheme: () => (this._currentTheme === 'light' ? 'light' : 'dark'),
        });
        search.setTheme(this._currentTheme === 'light' ? 'light' : 'dark');
        search.symbolSelected.subscribe((symbol: SymbolInfo) => {
            this._onSymbolChange(symbol);
        });
        return search;
    }

    /** Type-to-open: a printable key pressed on the (active) chart opens the symbol search prefilled. */
    private readonly _boundKeyPress: (e: KeyboardEvent) => void = (e) => {
        // Without an own toolbar (multi-chart layout) the layout owns one listener and routes it here.
        if (!this._showToolbar || !this._symbolSearch) return;
        if (_keyboardActiveChart !== null && _keyboardActiveChart !== this) return;
        this._symbolSearch.handleTypeToOpen(e);
    };

    /**
     * Plan-based indicator access. `null` (default) = everything allowed. Locked indicators
     * show a lock in the indicator dialog, cannot be added by any path and are removed from
     * every chart when the access is set. State is shared by all charts on the page.
     */
    setIndicatorAccess(access: IndicatorAccess | null): void {
        setIndicatorAccess(access);
    }

    // --- Alerts -------------------------------------------------------------------------------

    /**
     * Display text of a price in the chart's own price format. The axis format rounds (2 decimals from 1 up), so when
     * it would lose digits of `price` the exact decimal text is used instead (display only; the input seeds from the value).
     */
    /** Right price scale mode, for the drawing-alert dialog note (log / percent / indexed scales distort drawing lines). */
    alertPriceScaleMode(): 'normal' | 'logarithmic' | 'percentage' {
        const m = this._model.rightPriceScale.mode;
        return m === PriceScaleMode.Logarithmic ? 'logarithmic'
            : m === PriceScaleMode.Percentage || m === PriceScaleMode.IndexedTo100 ? 'percentage' : 'normal';
    }

    formatAlertPrice(price: number): string {
        const axis = this._model.rightPriceScale.formatPrice(price);
        const exact = exactPrice(price);
        return exact !== '' && Number(axis) !== Number(exact) ? exact : axis;
    }

    /** Tick size (10^-precision from the loaded bars) or null when there is no data yet. */
    alertPriceStep(): number | null {
        const data = this._model.serieses[0]?.data;
        if (!data || data.length === 0) return null;
        const env = this._getToolEnv();
        return env ? Math.pow(10, -env.precision) : null;
    }

    alertTheme(): 'light' | 'dark' {
        return this._currentTheme === 'light' ? 'light' : 'dark';
    }

    /** Close of the last bar (or the line value); null without data. */
    getLastPrice(): number | null {
        const data = this._model.serieses[0]?.data;
        if (!data || data.length === 0) return null;
        const last: any = data[data.length - 1];
        const v = 'close' in last ? last.close : last.value;
        return typeof v === 'number' && isFinite(v) ? v : null;
    }

    /** Price under the crosshair when the mouse is over the main pane, else null. */
    private _hoverPrice(): number | null {
        const crosshair = this._visibleCrosshair();
        const el = this._paneWidget?.element;
        if (!crosshair || !crosshair.visible || !el || !this._pointerInside || this._lastMouseY === 0) return null;
        const rect = el.getBoundingClientRect();
        if (this._lastMouseY < rect.top || this._lastMouseY > rect.bottom) return null;
        const price = this._model.rightPriceScale.coordinateToPrice(coordinate(this._lastMouseY - rect.top)) as number;
        return isFinite(price) ? price : null;
    }

    private _addAlertLabel(price: number): string {
        return t('Add alert for {symbol} at {price}...')
            .replace('{symbol}', alertTicker(this.symbol))
            .replace('{price}', this.formatAlertPrice(snapAlertPrice(price, this.alertPriceStep())));
    }

    /** Full identity of this chart's symbol for alerts: "EXCHANGE:CODE" (e.g. "BINANCE:BTCUSDT", "BINANCE-FUTURES:BTCUSDT"). */
    alertSymbolId(): string {
        return makeAlertSymbolId(this._model.exchange || this._currentExchange, this._model.symbol);
    }

    /** Opens the create-alert dialog for this chart's symbol at `price` (default: the last price). */
    openAlertDialogAt(price?: number): void {
        const raw = price ?? this.getLastPrice();
        const p = raw !== null && isFinite(raw) ? snapAlertPrice(raw, this.alertPriceStep()) : raw;
        openAlertDialog({ chart: this as AlertDialogChart, symbol: this.alertSymbolId(), price: p ?? NaN });
    }

    /** Alertable, unlocked indicators on this chart (indicator alerts in the alert dialog). */
    alertIndicators(): AlertIndicatorEntry[] {
        return alertIndicatorEntries(this._indicatorManager.allIndicators as any, (i) => this._indicatorManager.typeIdOf(i));
    }

    /** Indicator alert entry (legend menu): opens the dialog with this indicator's first event (else first plot) preselected. */
    openIndicatorAlert(indicator: Indicator): void {
        const raw = this.getLastPrice();
        const price = raw !== null && isFinite(raw) ? snapAlertPrice(raw, this.alertPriceStep()) : NaN;
        openAlertDialog({ chart: this as AlertDialogChart, symbol: this.alertSymbolId(), price, indicator: { instanceId: indicator.id } });
    }

    /** Drawing alert entry (context menu / attribute bar bell): opens the dialog for this drawing's current geometry. */
    openDrawingAlert(drawing: Drawing): void {
        const geometry = alertGeometryFor(drawing);
        if (!geometry) return;
        const lastBar = this._timestamps.length > 0 ? this._timestamps[this._timestamps.length - 1] : null;
        const raw = geometrySeedPrice(geometry, lastBar);
        const price = isFinite(raw) ? snapAlertPrice(raw, this.alertPriceStep()) : (this.getLastPrice() ?? NaN);
        openAlertDialog({
            chart: this as AlertDialogChart,
            symbol: this.alertSymbolId(),
            price,
            drawing: { id: drawing.id, type: drawing.type, label: alertDrawingLabel(drawing.type), geometry },
        });
    }

    private _drawingAlerts: DrawingAlertsController | null = null;

    /** Bell badges on drawings with active alerts + follow-edit geometry updates + drawing presence for the panel. */
    private _setupDrawingAlerts(): void {
        if (this._drawingAlerts || !this._paneWidget) return;
        this._drawingAlerts = new DrawingAlertsController({
            paneElement: () => this._paneWidget?.element ?? null,
            drawingManager: () => this._drawingManager,
            symbol: () => this.alertSymbolId(),
            timeToX: (time) => this._drawingManager.timeToPixel(time),
            priceToY: (price) => {
                const y = this._model.rightPriceScale.priceToCoordinate(price) as number;
                return Number.isFinite(y) ? y : null;
            },
            theme: () => this.alertTheme(),
            isDragging: () => this._isDraggingDrawing,
        });
        this._drawingAlerts.attach();
    }

    /** Alt+A / toolbar entry: crosshair price while hovering the chart, else the last price. */
    openAlertDialogAtCursor(): void {
        this.openAlertDialogAt(this._hoverPrice() ?? this.getLastPrice() ?? undefined);
    }

    /** Adds a horizontal line drawing at `price` on the main pane. */
    addHorizontalLineAtPrice(price: number): void {
        this._drawingManager.addHorizontalLineAt(price);
        this._scheduleDraw();
    }

    private _alertLines: AlertLinesController | null = null;

    /** Alert lines / pills on the main pane (listeners are added before the chart's own pane listeners). */
    private _setupAlertLines(): void {
        if (this._alertLines || !this._paneWidget) return;
        this._alertLines = new AlertLinesController({
            paneElement: () => this._paneWidget?.element ?? null,
            paneCanvas: () => this._paneWidget?.canvas ?? null,
            symbol: () => this.alertSymbolId(),
            priceToY: (price) => {
                const y = this._model.rightPriceScale.priceToCoordinate(price) as number;
                return Number.isFinite(y) ? y : null;
            },
            yToPrice: (y) => {
                const p = this._model.rightPriceScale.coordinateToPrice(coordinate(y)) as number;
                return Number.isFinite(p) ? p : null;
            },
            formatPrice: (price) => this.formatAlertPrice(price),
            priceStep: () => this.alertPriceStep(),
            theme: () => this.alertTheme(),
            paneHeight: () => this._model.rightPriceScale.height,
            requestDraw: () => this._scheduleDraw(),
            blocked: () => this._drawingManager.mode !== 'none' || this._interactionTools.mode !== 'none'
                || this._drawingManager.activeDrawing !== null || this._isDragging || this._isDraggingDrawing,
            openEdit: (alert) => openAlertDialog({ chart: this as AlertDialogChart, symbol: alert.symbol, price: alert.price, alert }),
        });
        this._alertLines.attach();
    }

    private _alertAxisMenu: ContextMenu | null = null;
    private _alertAxisPrice: number | null = null;
    /** Local y (price-axis coordinates) while the pointer is over the main pane's price axis, else null. */
    private _axisHoverY: number | null = null;

    /** Axis-hover y if it is usable for a price-only crosshair (inside the main pane, not drawing / dragging). */
    private _axisHoverCrosshairY(): number | null {
        const y = this._axisHoverY;
        if (y === null || this._drawingManager.mode !== 'none' || this._interactionTools.mode !== 'none'
            || this._isDragging || this._isDraggingDrawing || this._isPriceScaleDragging || this._alertLines?.dragging) return null;
        return y >= 0 && y <= this._model.rightPriceScale.height ? y : null;
    }

    private _wireAlertAxisButton(): void {
        const axis = this._priceAxisWidget;
        if (!axis) return;
        axis.onHover = (y) => {
            if (this._axisHoverY === y) return;
            this._axisHoverY = y;
            this._scheduleDraw();
        };
        axis.onAddButtonClick = (x, y) => {
            const price = this._alertAxisPrice;
            if (price === null) return;
            this._alertAxisMenu?.dispose();
            this._alertAxisMenu = new ContextMenu({
                items: [
                    { id: 'add-alert', label: this._addAlertLabel(price), icon: ALERT_MENU_ICON, action: () => this.openAlertDialogAt(price) },
                    {
                        id: 'add-hline',
                        label: t('Draw horizontal line at {price}').replace('{price}', this.formatAlertPrice(snapAlertPrice(price, this.alertPriceStep()))),
                        action: () => this.addHorizontalLineAtPrice(price),
                    },
                ],
                theme: this._currentTheme === 'light' ? 'light' : 'dark',
            });
            this._alertAxisMenu.show(x, y);
        };
    }

    /** Called every draw: "+" button next to the crosshair label (hidden when the crosshair is off / drawing). */
    private _syncAlertAxisButton(): void {
        if (!this._priceAxisWidget) return;
        const axisY = this._axisHoverCrosshairY();
        const price = axisY !== null
            ? (() => { const p = this._model.rightPriceScale.coordinateToPrice(coordinate(axisY)) as number; return isFinite(p) ? p : null; })()
            : this._drawingManager.mode === 'none' && !this._isDragging && !this._alertLines?.dragging ? this._hoverPrice() : null;
        if (price !== null) this._alertAxisPrice = price;
        this._priceAxisWidget.setAddButtonEnabled(price !== null, t('Add alert for {symbol} at {price}...')
            .replace('{symbol}', alertTicker(this.symbol))
            .replace('{price}', price !== null ? this.formatAlertPrice(snapAlertPrice(price, this.alertPriceStep())) : ''));
    }

    showIndicatorSearch(): void {
        this._indicatorSearchModal?.show();
    }

    setLanguage(locale: string): void {
        this._onLanguageChange(locale);
    }

    openSettings(): void {
        this._openChartSettings();
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
        // Replay: the primary series' data becomes the replay buffer, only revealed bars are shown
        if (series === this._model.serieses[0] && this._replay.interceptData(data as BarData[])) {
            return;
        }
        this._applyData(series, data);
    }

    /** Real data application (bypasses the replay interception). */
    private _applyData(series: CandlestickSeries | LineSeries | AreaSeries | HeikenAshiSeries, data: BarData[] | LineData[]): void {
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
            const indicatorData = this._resolveIndicatorSourceData(series, data as BarData[]);
            this._pushIndicatorContext();
            this._syncSpot(data as BarData[]);
            this._indicatorManager.setData(indicatorData);
        } else if (data.length === 0 && this._replay.active) {
            // replay cursor before the first bar of the (new) data: indicators must not keep stale values
            this._indicatorManager.setData([]);
        }
    }

    /** ReplayController <-> chart glue: all primary-series access of the replay engine goes through here. */
    private _createReplayAdapter(): ReplayChartAdapter {
        return {
            getBars: () => (this._model.serieses[0]?.data ?? []) as readonly BarData[],
            getTimeframe: () => this._model.timeframe,
            getSymbol: () => this._model.symbol,
            getExchange: () => this._currentExchange || this._model.exchange,
            setBars: (bars) => {
                const series = this._model.serieses[0] as any;
                if (!series) return;
                this._applyData(series, bars);
                this._model.fullUpdate();
            },
            applyTail: (truncateTo, push) => this._replayApplyTail(truncateTo, push),
            scrollToRightEdge: () => {
                this._model.timeScale.scrollToPosition(0, false);
                this._scheduleDraw();
            },
        };
    }

    /**
     * Cheap incremental replay update, same way as the host's live tick path: mutate series.data
     * (cut + push), setPointsCount, one fullUpdate. Keeps the user's scroll position.
     */
    private _replayApplyTail(truncateTo: number, push: BarData[]): void {
        const series = this._model.serieses[0] as any;
        if (!series) return;
        const data = series.data as BarData[];
        const before = data.length;
        if (data.length > truncateTo) data.length = truncateTo;
        for (const bar of push) data.push(bar);
        // keep the timestamp array identity: time axis + drawing manager hold references to it
        const ts = this._timestamps;
        if (ts.length > truncateTo) ts.length = truncateTo;
        for (const bar of push) ts.push(bar.time);
        this._model.timeScale.timeMarks.invalidate();
        if (series instanceof HeikenAshiSeries) series.syncTail(truncateTo);

        const timeScale = this._model.timeScale;
        const delta = data.length - before;
        timeScale.setPointsCount(data.length);
        // user scrolled away from the right edge (into history OR into the future whitespace; scrollOffset is
        // negative there): shift the offset so the visible bars do not move. Near the edge the view follows.
        if (delta !== 0 && Math.abs(timeScale.scrollOffset) >= 1) {
            timeScale.scrollToPosition(timeScale.scrollOffset + delta, false);
        }
        this._model.fullUpdate();
    }

    /** Sembol/zaman dilimi bilgisine ihtiyac duyan indikatorlere (ör. spot karsilastirma) guncel degeri verir. */
    private _pushIndicatorContext(): void {
        // Replay: backend indicators only see bars closed by the cursor (epoch ms, exclusive)
        const end = this._replay.remoteEndMs();
        for (const ind of this._indicatorManager.allIndicators) {
            const withCtx = ind as unknown as { setContext?: (c: { symbol: string; timeframe: string; exchange?: string; end?: number }) => void };
            ind.setTimeframe(this._model.timeframe);
            withCtx.setContext?.({
                symbol: this._model.symbol,
                timeframe: this._model.timeframe,
                exchange: this._currentExchange || this._model.exchange,
                end,
            });
        }
    }

    private _resolveIndicatorSourceData(
        series: CandlestickSeries | LineSeries | AreaSeries | HeikenAshiSeries,
        fallbackData: BarData[]
    ): BarData[] {
        if (series instanceof HeikenAshiSeries) {
            return series.haData;
        }

        return fallbackData;
    }

    timeScale() {
        return this._model.timeScale;
    }

    priceScale() {
        return this._model.rightPriceScale;
    }

    /** Small non-blocking message inside the chart (null clears it); e.g. "no data" after a failed load. */
    setNotice(message: string | null): void {
        if (!this._element) return;
        let el = this._noticeEl;
        if (!message) {
            el?.remove();
            this._noticeEl = null;
            return;
        }
        if (!el) {
            el = document.createElement('div');
            el.className = 'tv-chart-notice';
            el.style.cssText = `
                position: absolute; top: ${(this._toolbarWidget?.height ?? 0) + 18}px; left: 50%; transform: translateX(-50%);
                z-index: 900; padding: 6px 12px; border-radius: 4px; pointer-events: none;
                background: rgba(239, 83, 80, 0.15); border: 1px solid #ef5350; color: #ef9a9a;
                font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif;
            `;
            this._element.appendChild(el);
            this._noticeEl = el;
        }
        el.textContent = message;
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

    /**
     * Set the zone the time axis renders its labels in, e.g. 'America/New_York'.
     * Pass '' to follow the browser's local zone.
     *
     * Bar timestamps are absolute epoch ms, so this changes labels only - no bar
     * moves. Worth aligning with any time-based indicator (killzones, sessions),
     * which resolve their own windows in their own configured zone.
     */
    setTimezone(timezone: string): void {
        try {
            localStorage.setItem('tv-chart-timezone', timezone);
        } catch (e) { }

        if (this._timeAxisWidget) {
            this._timeAxisWidget.setTimezone(timezone);
        }
        // Tick marks (and the grid that follows them) depend on the zone
        this._model.fullUpdate();
    }

    // --- Grid options -----------------------------------------------------------------------

    private _gridCustomized = { vertLines: false, horzLines: false };

    /** Deep copy of the chart's grid options. */
    getGridOptions(): GridOptions {
        const g = this._model.options.grid;
        return { vertLines: { ...g.vertLines }, horzLines: { ...g.horzLines } };
    }

    /**
     * Update grid line visibility / color / style per direction. Repaints the main pane and every
     * sub-pane, persists to localStorage (`charts.gridOptions`). Setting a color marks it as user
     * customized (kept across theme switches); pass color '' to go back to the theme default.
     */
    setGridOptions(partial: {
        vertLines?: Partial<{ visible: boolean; color: string; style: 'solid' | 'dashed' | 'dotted' }>;
        horzLines?: Partial<{ visible: boolean; color: string; style: 'solid' | 'dashed' | 'dotted' }>;
    }): void {
        const grid = (this._model as any)._options.grid as GridOptions;
        for (const dir of ['vertLines', 'horzLines'] as const) {
            const p = partial?.[dir];
            if (!p) continue;
            const target = grid[dir];
            if (typeof p.visible === 'boolean') target.visible = p.visible;
            if (p.style === 'solid' || p.style === 'dashed' || p.style === 'dotted') target.style = p.style;
            if (typeof p.color === 'string') {
                if (p.color === '') {
                    this._gridCustomized[dir] = false;
                    target.color = getTheme(this._currentTheme).grid.color;
                } else {
                    // Cancel in the settings dialog re-applies the old (default) color: not a customization
                    this._gridCustomized[dir] = p.color !== getTheme(this._currentTheme).grid.color;
                    target.color = p.color;
                }
            }
        }
        this._persistGridOptions();
        this._model.fullUpdate();
    }

    /** Convenience over the visible flags: 'both' | 'vert' | 'horz' | 'none'. */
    setGridLinesMode(mode: 'both' | 'vert' | 'horz' | 'none'): void {
        this.setGridOptions({
            vertLines: { visible: mode === 'both' || mode === 'vert' },
            horzLines: { visible: mode === 'both' || mode === 'horz' },
        });
    }

    getGridLinesMode(): 'both' | 'vert' | 'horz' | 'none' {
        const g = this._model.options.grid;
        if (g.vertLines.visible && g.horzLines.visible) return 'both';
        if (g.vertLines.visible) return 'vert';
        if (g.horzLines.visible) return 'horz';
        return 'none';
    }


    // --- Canvas settings: background, pane separators, crosshair, watermark -------------------

    private _bg: { type: 'solid' | 'gradient'; color: string; gradientColor: string } =
        { type: 'solid', color: '#ffffff', gradientColor: '#e0e3eb' };
    private _bgCustomized = false;
    private _crosshairColorCustomized = false;

    private _defaultBackground(theme: ThemeType) {
        return {
            type: 'solid' as const,
            color: getTheme(theme).layout.backgroundColor,
            gradientColor: theme === 'dark' ? '#131722' : '#e0e3eb',
        };
    }

    private _readStore(key: string): any {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    private _writeStore(key: string, value: unknown): void {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { }
    }

    private _restoreCanvasOptions(): void {
        const opts = (this._model as any)._options as ChartModelOptions;
        this._bg = this._defaultBackground(this._currentTheme);
        this._bg.color = opts.layout.backgroundColor;

        const bg = this._readStore('charts.backgroundOptions');
        if (bg && bg.customized === true && typeof bg.color === 'string') {
            this._bgCustomized = true;
            this._bg = {
                type: bg.type === 'gradient' ? 'gradient' : 'solid',
                color: bg.color,
                gradientColor: typeof bg.gradientColor === 'string' ? bg.gradientColor : this._bg.gradientColor,
            };
            opts.layout.backgroundColor = this._bg.color;
        }

        const sep = this._readStore('charts.paneSeparatorColor');
        if (typeof sep === 'string' && sep) setPaneSeparatorOverride(sep);

        const ch = this._readStore('charts.crosshairStyle');
        if (ch && typeof ch === 'object') {
            for (const l of [opts.crosshair.vertLine, opts.crosshair.horzLine]) {
                if (ch.style === 'solid' || ch.style === 'dashed' || ch.style === 'dotted') l.style = ch.style;
                if (typeof ch.width === 'number' && ch.width > 0) l.width = ch.width;
                if (ch.customized === true && typeof ch.color === 'string' && ch.color) {
                    l.color = ch.color;
                    this._crosshairColorCustomized = true;
                }
            }
        }

        const wm = this._readStore('charts.watermarkOptions');
        if (wm && typeof wm === 'object') {
            if (typeof wm.visible === 'boolean') opts.watermark.visible = wm.visible;
            if (typeof wm.color === 'string' && wm.color) opts.watermark.color = wm.color;
        }
    }

    /** Push the background state to the main pane, sub-panes and axes. */
    private _applyBackground(): void {
        const opts = (this._model as any)._options as ChartModelOptions;
        const bg = this._bg;
        const bottom = bg.type === 'gradient' ? bg.gradientColor : null;
        opts.layout.backgroundColor = bg.color;
        if (this._element) {
            this._element.style.background = bottom ? `linear-gradient(${bg.color}, ${bottom})` : bg.color;
        }
        this._paneWidget?.setBackgroundGradient(bottom);
        if (this._bgCustomized) {
            this._priceAxisWidget?.setBackgroundColor(bg.color);
            this._timeAxisWidget?.setBackgroundColor(bg.color);
            for (const pane of this._indicatorPanes.values()) pane.setBackground(bg.color, bottom);
        } else {
            // theme defaults (panes / axes re-themed in setTheme)
            if (this._priceAxisWidget) this._priceAxisWidget.setTheme(this._currentTheme);
            if (this._timeAxisWidget) this._timeAxisWidget.setTheme(this._currentTheme);
            for (const pane of this._indicatorPanes.values()) {
                pane.setTheme(this._currentTheme);
                pane.setBackground(bg.color, bottom);
            }
        }
    }

    getBackgroundOptions(): { type: 'solid' | 'gradient'; color: string; gradientColor: string } {
        return { ...this._bg };
    }

    /** Background: color = top, gradientColor = bottom; type 'gradient' paints a vertical gradient. */
    setBackgroundOptions(partial: Partial<{ type: 'solid' | 'gradient'; color: string; gradientColor: string }>): void {
        const next = { ...this._bg };
        if (partial.type === 'solid' || partial.type === 'gradient') next.type = partial.type;
        if (typeof partial.color === 'string' && partial.color) next.color = partial.color;
        if (typeof partial.gradientColor === 'string' && partial.gradientColor) next.gradientColor = partial.gradientColor;
        const def = this._defaultBackground(this._currentTheme);
        this._bgCustomized = !(next.type === def.type && next.color === def.color && next.gradientColor === def.gradientColor);
        this._bg = next;
        this._writeStore('charts.backgroundOptions', { ...next, customized: this._bgCustomized });
        this._applyBackground();
        this._model.fullUpdate();
    }

    private _repaintPaneSeparators(): void {
        for (const pane of this._indicatorPanes.values()) pane.repaintSeparator();
        this._updateMainPaneButton(this._priceAxisWidget?.width ?? 52);
    }

    getPaneSeparatorColor(): string {
        return getPaneSeparatorOverride() ?? paneColors(this._currentTheme === 'light' ? 'light' : 'dark').separator;
    }

    setPaneSeparatorColor(color: string): void {
        const themeDefault = this._currentTheme === 'light' ? PANE_STYLE.light.separator : PANE_STYLE.dark.separator;
        const override = !color || color.toLowerCase() === themeDefault.toLowerCase() ? null : color;
        setPaneSeparatorOverride(override);
        try {
            if (override) localStorage.setItem('charts.paneSeparatorColor', JSON.stringify(override));
            else localStorage.removeItem('charts.paneSeparatorColor');
        } catch (e) { }
        this._repaintPaneSeparators();
        this._model.fullUpdate();
    }

    getCrosshairStyle(): { color: string; style: 'solid' | 'dashed' | 'dotted'; width: number } {
        const l = this._model.options.crosshair.vertLine;
        return { color: l.color, style: l.style, width: l.width };
    }

    setCrosshairStyle(partial: Partial<{ color: string; style: 'solid' | 'dashed' | 'dotted'; width: number }>): void {
        const ch = (this._model as any)._options.crosshair as ChartModelOptions['crosshair'];
        for (const l of [ch.vertLine, ch.horzLine]) {
            if (typeof partial.color === 'string' && partial.color) l.color = partial.color;
            if (partial.style === 'solid' || partial.style === 'dashed' || partial.style === 'dotted') l.style = partial.style;
            if (typeof partial.width === 'number' && partial.width > 0) l.width = partial.width;
        }
        if (typeof partial.color === 'string' && partial.color) {
            this._crosshairColorCustomized = partial.color !== getTheme(this._currentTheme).crosshair.lineColor;
        }
        this._writeStore('charts.crosshairStyle', {
            color: ch.vertLine.color, style: ch.vertLine.style, width: ch.vertLine.width,
            customized: this._crosshairColorCustomized,
        });
        this._model.fullUpdate();
    }

    getWatermarkOptions(): { visible: boolean; color: string } {
        const w = this._model.options.watermark;
        return { visible: w.visible, color: w.color };
    }

    setWatermarkOptions(partial: Partial<{ visible: boolean; color: string }>): void {
        const w = (this._model as any)._options.watermark as ChartModelOptions['watermark'];
        if (typeof partial.visible === 'boolean') w.visible = partial.visible;
        if (typeof partial.color === 'string' && partial.color) w.color = partial.color;
        this._writeStore('charts.watermarkOptions', { visible: w.visible, color: w.color });
        this._model.fullUpdate();
    }

    private _persistGridOptions(): void {
        const g = this._model.options.grid;
        try {
            localStorage.setItem('charts.gridOptions', JSON.stringify({
                vertLines: { ...g.vertLines, customized: this._gridCustomized.vertLines },
                horzLines: { ...g.horzLines, customized: this._gridCustomized.horzLines },
            }));
        } catch (e) { }
    }

    private _restoreGridOptions(): void {
        let saved: any = null;
        try {
            const raw = localStorage.getItem('charts.gridOptions');
            if (raw) saved = JSON.parse(raw);
        } catch (e) { }
        if (!saved || typeof saved !== 'object') return;
        const grid = (this._model as any)._options.grid as GridOptions;
        for (const dir of ['vertLines', 'horzLines'] as const) {
            const p = saved[dir];
            if (!p || typeof p !== 'object') continue;
            if (typeof p.visible === 'boolean') grid[dir].visible = p.visible;
            if (p.style === 'solid' || p.style === 'dashed' || p.style === 'dotted') grid[dir].style = p.style;
            if (p.customized === true && typeof p.color === 'string' && p.color) {
                this._gridCustomized[dir] = true;
                grid[dir].color = p.color;
            }
        }
    }

    getTimezone(): string {
        return this._timeAxisWidget ? this._timeAxisWidget.timezone : '';
    }

    /**
     * Saved preference wins, otherwise New York. ICT killzones and most session
     * tooling are defined against the NY clock, so matching it here keeps the
     * axis labels and those windows reading the same. Set '' to follow the
     * browser's local zone instead. Used both for the initial TimeAxisWidget
     * setup and the toolbar selector's starting value.
     */
    private _resolveInitialTimezone(): string {
        let axisTimezone = 'America/New_York';
        try {
            const saved = localStorage.getItem('tv-chart-timezone');
            if (saved !== null) axisTimezone = saved;
        } catch (e) { }
        return axisTimezone;
    }

    /**
     * Set chart theme (dark or light)
     */
    setTheme(theme: ThemeType): void {
        const colors = getTheme(theme);
        this._currentTheme = theme;

        // Save preference
        try {
            localStorage.setItem('tv-chart-theme', theme);
        } catch (e) { }

        // Update model options
        (this._model as any)._options.theme = theme;
        (this._model as any)._options.layout.backgroundColor = colors.layout.backgroundColor;
        (this._model as any)._options.layout.textColor = colors.layout.textColor;
        // TradingView resets grid colors to the theme defaults on theme change, unless the user picked a color
        const grid = (this._model as any)._options.grid as GridOptions;
        if (!this._gridCustomized.vertLines) grid.vertLines.color = colors.grid.color;
        if (!this._gridCustomized.horzLines) grid.horzLines.color = colors.grid.color;
        if (!this._crosshairColorCustomized) {
            (this._model as any)._options.crosshair.vertLine.color = colors.crosshair.lineColor;
            (this._model as any)._options.crosshair.horzLine.color = colors.crosshair.lineColor;
        }
        if (!this._bgCustomized) this._bg = this._defaultBackground(theme);

        // Update main container
        if (this._element) {
            this._element.style.background = colors.layout.backgroundColor;
        }

        // Update toolbar
        if (this._toolbarWidget) {
            this._toolbarWidget.setTheme(theme);
        }
        this._replayUI?.setTheme(theme === 'light' ? 'light' : 'dark');

        this._watchlistPanel?.setTheme(theme === 'light' ? 'light' : 'dark');
        this._alertsPanel?.setTheme(theme === 'light' ? 'light' : 'dark');
        this._objectTreePanel?.setTheme(theme === 'light' ? 'light' : 'dark');

        // Update drawing settings modal if open
        if (this._drawingSettingsModal) {
            this._drawingSettingsModal.setTheme(theme);
        }

        if (this._chartSettingsModal) {
            this._chartSettingsModal.setTheme(theme);
        }

        this._indicatorSettingsModal?.setTheme(theme === 'light' ? 'light' : 'dark');

        this._indicatorSearchModal?.setTheme(theme === 'light' ? 'light' : 'dark');
        this._symbolSearch?.setTheme(theme === 'light' ? 'light' : 'dark');

        // Update drawing toolbar
        if (this._drawingToolbarWidget) {
            this._drawingToolbarWidget.setTheme(theme);
        }

        // Update floating attribute bar
        if (this._floatingAttributeBar) {
            this._floatingAttributeBar.setTheme(theme);
        }

        // Context menus (chart / drawing right-click and bar "More" menu)
        this._contextMenu?.setTheme(theme === 'light' ? 'light' : 'dark');
        this._drawingContextMenu?.setTheme(theme === 'light' ? 'light' : 'dark');

        // Update add text tooltip
        if (this._addTextTooltipHelper) {
            this._addTextTooltipHelper.setTheme(theme);
        }

        // Update branding logo
        if (this._brandingLogo) {
            this._brandingLogo.style.color = colors.branding.textColor;
            this._brandingLogo.style.textShadow = `
                0 0 10px ${colors.branding.shadowColor},
                0 0 20px ${colors.branding.shadowColor},
                2px 2px 4px rgba(0, 0, 0, 0.5)
            `;
        }

        // Update time axis
        if (this._timeAxisWidget) {
            this._timeAxisWidget.setTheme(theme);
        }

        // Update price axis
        if (this._priceAxisWidget) {
            this._priceAxisWidget.setTheme(theme);
        }

        // Update main chart pane
        if (this._paneWidget) {
            this._paneWidget.setTheme(theme);
        }

        // Update indicator panels
        for (const pane of this._indicatorPanes.values()) {
            pane.setTheme(theme);
        }

        // Indicators paint their own labels on the canvas, so they need the theme too
        if (this._indicatorManager) {
            this._indicatorManager.setTheme(theme);
        }

        // Update loading overlay
        if (this._loadingOverlay) {
            const isDark = theme === 'dark';
            this._loadingOverlay.style.background = isDark
                ? 'rgba(22, 33, 62, 0.95)'
                : 'rgba(255, 255, 255, 0.95)';

            const spinner = this._loadingOverlay.firstElementChild as HTMLElement;
            if (spinner) {
                spinner.style.borderColor = isDark
                    ? 'rgba(255, 255, 255, 0.1)'
                    : 'rgba(0, 0, 0, 0.1)';
                spinner.style.borderTopColor = '#2962ff';
            }

            const loadingText = this._loadingOverlay.querySelector('.loading-text') as HTMLElement;
            if (loadingText) {
                loadingText.style.color = isDark
                    ? 'rgba(255, 255, 255, 0.7)'
                    : 'rgba(0, 0, 0, 0.7)';
            }
        }

        // Update technical rating badge
        if (this._technicalRatingBadge) {
            this._technicalRatingBadge.setTheme(theme);
        }

        this._applyBackground();
        this._repaintPaneSeparators();

        // Trigger full redraw
        this._model.fullUpdate();
    }

    /**
     * Get current theme
     */
    getTheme(): ThemeType {
        return this._model.options.theme || 'dark';
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
            --tv-price-axis-width: 52px;
            --tv-content-padding: 12px;
        `;

        // Chart row (pane + price axis)
        this._chartRow = document.createElement('div');
        this._chartRow.style.cssText = `
            display: flex;
            flex: 1;
            overflow: hidden;
            position: relative;
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
            .tv-gainmetrics-panel {
                position: absolute;
                right: calc(var(--tv-price-axis-width) + 12px);
                bottom: calc(var(--tv-time-axis-height) + 12px);
                z-index: 19;
                min-width: 154px;
                max-width: min(230px, calc(100% - var(--tv-price-axis-width) - var(--tv-drawing-toolbar-width) - 36px));
                padding: 8px 9px;
                border: 1px solid rgba(0, 188, 212, 0.35);
                background: rgba(0, 6, 12, 0.72);
                box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
                color: #e5e7eb;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 11px;
                line-height: 1.28;
                pointer-events: none;
                backdrop-filter: blur(4px);
            }
            .tv-gainmetrics-title {
                color: #22d3ee;
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 0.02em;
                margin-bottom: 4px;
            }
            .tv-gainmetrics-group + .tv-gainmetrics-group {
                margin-top: 7px;
                padding-top: 6px;
                border-top: 1px solid rgba(34, 211, 238, 0.18);
            }
            .tv-gainmetrics-period {
                color: #94a3b8;
                font-weight: 800;
                margin-bottom: 2px;
            }
            .tv-gainmetrics-line {
                display: flex;
                justify-content: space-between;
                gap: 10px;
                white-space: nowrap;
            }
            .tv-gainmetrics-label {
                font-weight: 800;
            }
            .tv-gainmetrics-value {
                color: #f8fafc;
                font-variant-numeric: tabular-nums;
                font-weight: 700;
            }
            .tv-gainmetrics-resistance .tv-gainmetrics-label {
                color: #22d3ee;
            }
            .tv-gainmetrics-pivot .tv-gainmetrics-label,
            .tv-gainmetrics-pivot .tv-gainmetrics-value {
                color: #facc15;
            }
            .tv-gainmetrics-support .tv-gainmetrics-label {
                color: #f472b6;
            }
        `;
        document.head.appendChild(legendStyle);
        this._element.appendChild(this._mainLegendContainer);

        this._gainMetricsPanel = document.createElement('div');
        this._gainMetricsPanel.className = 'tv-gainmetrics-panel';
        this._gainMetricsPanel.style.display = 'none';
        this._element.appendChild(this._gainMetricsPanel);

        this._element.appendChild(this._indicatorContainer);
        this._element.appendChild(this._timeAxisRow);

        // Create loading overlay (covers entire chart widget)
        this._loadingOverlay = document.createElement('div');
        this._loadingOverlay.style.cssText = `
            position: absolute;
            top: ${this._showToolbar ? 38 : 0}px;
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
        const brandingOpts = this._model.options.branding?.logo;
        const logoVisible = brandingOpts?.visible !== false;

        if (logoVisible) {
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

            // Use image if imageUrl provided, otherwise use text
            if (brandingOpts?.imageUrl) {
                const img = document.createElement('img');
                img.src = brandingOpts.imageUrl;
                img.style.cssText = 'height: 32px; width: auto;';
                img.alt = brandingOpts?.text || 'Logo';
                this._brandingLogo.appendChild(img);
            } else {
                this._brandingLogo.textContent = brandingOpts?.text || 'cryptopy';
            }

            this._element.appendChild(this._brandingLogo);
        }

        // Add spinner animation via style tag
        const spinnerStyle = document.createElement('style');
        spinnerStyle.textContent = `
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(spinnerStyle);

        this._container.appendChild(this._element);

        // Technical Rating Badge (top-right corner inside chart pane area)
        this._technicalRatingBadge = new TechnicalRatingBadge(this._chartRow);

        // Create toolbar first (inserts at top)
        if (this._showToolbar) {
            this._createTopToolbar();
        }

        // Initialize Symbol Search Modal
        this._symbolSearch = this._createSymbolSearch();
        if (!this._showToolbar) this._syncSpot();

        // Create widgets
        this._paneWidget = new PaneWidget(this._chartRow, this._model);

        // Indicator legend (main pane rows): eye / settings / remove / more
        this._paneWidget.setLegendChartKey(this._container.id || 'default');
        this._paneWidget.onLegendAction = (action, indicator, point) => this._onLegendAction(action, indicator, point);
        this._priceAxisWidget = new PriceAxisWidget(this._chartRow, this._model.rightPriceScale, {
            backgroundColor: this._model.options.layout.backgroundColor,
            textColor: this._model.options.layout.textColor,
        });
        this._wireAlertAxisButton();
        this._timeAxisWidget = new TimeAxisWidget(this._timeAxisRow, this._model.timeScale, this._timestamps, {
            backgroundColor: this._model.options.layout.backgroundColor,
            textColor: this._model.options.layout.textColor,
            timezone: this._resolveInitialTimezone(),
        });

        // Create drawing toolbar (left side)
        // Initialize Drawing Toolbar
        if (this._showDrawingToolbar) {
            this._createDrawingToolbar();
        }

        // Without an own toolbar the host-owned one (MultiChartLayout) provides the watchlist / spot toggle;
        // the object tree only needs the drawing toolbar button.
        if (!this._showToolbar) this._createObjectTree();

        // Create floating attribute bar (shown when drawing is selected)
        this._floatingAttributeBar = new FloatingAttributeBar(this._element);
        this._floatingAttributeBar.deleteClicked.subscribe(() => {
            this._drawingManager.deleteSelected();
            this._floatingAttributeBar?.hide();
        });
        this._floatingAttributeBar.colorChanged.subscribe((_color) => {
            this._commitSettingsHistory(this._drawingManager.selectedDrawing);
            this._scheduleDraw();  // Refresh to show new color
        });
        this._floatingAttributeBar.lineWidthChanged.subscribe((_width) => {
            this._commitSettingsHistory(this._drawingManager.selectedDrawing);
            this._scheduleDraw();
        });
        this._floatingAttributeBar.fontSizeChanged.subscribe((_size) => {
            this._commitSettingsHistory(this._drawingManager.selectedDrawing);
            this._scheduleDraw();
        });
        this._floatingAttributeBar.lineStyleChanged.subscribe((_style) => {
            this._commitSettingsHistory(this._drawingManager.selectedDrawing);
            this._scheduleDraw();
        });
        this._floatingAttributeBar.lockClicked.subscribe(() => {
            const sel = this._drawingManager.selectedDrawing;
            if (!sel) return;
            this._drawingManager.setDrawingLocked(sel.id, !sel.locked);
            this._floatingAttributeBar?.syncLockState();
            this._scheduleDraw();
        });
        // Lock can also change from the context menu / object tree: keep the bar's lock button in sync
        this._drawingManager.drawingsChanged.subscribe(() => this._floatingAttributeBar?.syncLockState());
        this._floatingAttributeBar.alertClicked.subscribe(() => {
            const sel = this._drawingManager.selectedDrawing;
            if (sel) this.openDrawingAlert(sel);
        });
        this._floatingAttributeBar.moreClicked.subscribe((rect) => {
            const sel = this._drawingManager.selectedDrawing;
            if (sel) this._showBarMoreMenu(sel, rect);
        });
        this._floatingAttributeBar.settingsClicked.subscribe(() => {
            const selectedDrawing = this._drawingManager.selectedDrawing;
            if (selectedDrawing && this._element) {
                // Create or reuse modal (factory creates appropriate type)
                if (this._drawingSettingsModal) {
                    this._drawingSettingsModal.hide();
                }
                this._drawingSettingsModal = this._createDrawingSettingsModal(selectedDrawing);
                this._drawingSettingsModal.setTheme(this._currentTheme);
                this._drawingSettingsModal.settingsChanged.subscribe(() => {
                    this._commitSettingsHistory(selectedDrawing);
                    this._scheduleDraw();
                });
                this._drawingSettingsModal.show(selectedDrawing);
            }
        });

        this._createReplayUI();
    }

    /** Bar replay UI: selection line + control bar (the toolbar button is wired in _createTopToolbar). */
    private _createReplayUI(): void {
        if (!this._element) return;
        this._replayUI?.dispose();
        this._replayUI = new ReplayUI({
            root: this._element,
            controller: this._replay,
            getPaneElement: () => this._paneWidget?.element ?? null,
            getBars: () => (this._model.serieses[0]?.data ?? []) as readonly BarData[],
            coordinateToIndex: (x) => this._model.timeScale.coordinateToIndex(x as any),
            indexToCoordinate: (i) => this._model.timeScale.indexToCoordinate(i as any),
            getTimeframe: () => this._model.timeframe,
            getTimezone: () => this._timeAxisWidget?.timezone ?? '',
            getTheme: () => (this._currentTheme === 'light' ? 'light' : 'dark'),
        });
        if (!this._replayStateWired) {
            this._replayStateWired = true;
            let wasActive = this._replay.active;
            this._replay.onStateChange.subscribe((s) => {
                this._toolbarWidget?.setReplayActive(s.active || s.selecting);
                if (s.active !== wasActive) {
                    wasActive = s.active;
                    const data = this._model.serieses[0]?.data as BarData[] | undefined;
                    this._syncSpot(data && data.length > 0 && 'open' in data[0] ? data : undefined);
                    this._scheduleDraw();
                }
            });
        }
    }

    /** Replay toolbar button: starts bar selection, or cancels it. While replaying it does nothing special. */
    private _onReplayButton(): void {
        const s = this._replay.state;
        if (s.selecting) this._replay.cancelSelection();
        else if (!s.active) this._replay.startSelection();
        else this._replayUI?.refresh();
    }

    /** Multi-chart layouts: only the active chart shows the replay control bar. */
    setReplayControlsEnabled(enabled: boolean): void {
        this._replayUI?.setEnabled(enabled);
    }

    private _updateSize(): void {
        const rect = this._container.getBoundingClientRect();
        this._width = rect.width;
        this._height = rect.height;
        this._updateLayout();
    }

    private _updateLayout(): void {
        const toolbarHeight = this._toolbarWidget?.height ?? 0;
        const timeAxisHeight = this._timeAxisWidget?.height ?? 28;
        this._priceAxisWidget?.updateWidth();
        const priceAxisWidth = this._priceAxisWidget?.width ?? 52;
        const drawingToolbarWidth = this._drawingToolbarWidget?.width ?? 0;

        // Sub-pane heights (collapsed / maximized / hidden on this timeframe) and what is left for the main pane
        const paneLayout = this._layoutIndicatorPanes(this._height - timeAxisHeight - toolbarHeight);

        // Izleme listesi acikken grafik onun genisligi kadar daralir.
        // Nesne agaci paneli de ayni sag kenari kullanir (ikisi ayni anda acik olmaz).
        const watchlistWidth = this._watchlistPanel?.visible
            ? this._watchlistPanel.width
            : this._alertsPanel?.visible ? this._alertsPanel.width
            : this._objectTreePanel?.visible && !this._objectTreeExternal ? this._objectTreePanel.width : 0;
        const usableWidth = this._width - watchlistWidth;
        this._technicalRatingBadge?.setRightOffset(watchlistWidth);
        const paneWidth = usableWidth - priceAxisWidth - drawingToolbarWidth;
        const paneHeight = paneLayout.mainHeight;
        if (this._chartRow) this._chartRow.style.display = paneLayout.mainHidden ? 'none' : 'flex';

        // Update model (kept as is while a sub-pane covers the main pane)
        this._model.timeScale.setWidth(paneWidth);
        if (!paneLayout.mainHidden) {
            this._lastMainHeight = paneHeight;
            this._model.setSize(usableWidth, paneHeight);
            this._model.rightPriceScale.setHeight(paneHeight);

            // Update widgets
            this._paneWidget?.setSize(paneWidth, paneHeight);
            this._priceAxisWidget?.setHeight(paneHeight);
        }
        this._timeAxisWidget?.setWidth(paneWidth);
        this._updateMainPaneButton(priceAxisWidth);

        // Offset chart row for drawing toolbar (using CSS variable reference)
        // Izleme listesi acikken satirlar (dolayisiyla fiyat/zaman eksenleri) da onun
        // soluna daralir; yoksa eksenler panelin ALTINDA kalirdi.
        if (this._chartRow) {
            this._chartRow.style.marginLeft = 'var(--tv-drawing-toolbar-width)';
            this._chartRow.style.marginRight = `${watchlistWidth}px`;
        }
        if (this._indicatorContainer) {
            this._indicatorContainer.style.marginLeft = 'var(--tv-drawing-toolbar-width)';
            this._indicatorContainer.style.width = watchlistWidth ? `calc(100% - ${watchlistWidth}px)` : '100%';
        }
        if (this._timeAxisRow) {
            this._timeAxisRow.style.marginLeft = 'var(--tv-drawing-toolbar-width)';
            this._timeAxisRow.style.marginRight = `${watchlistWidth}px`;
        }

        // Update indicator pane widths
        for (const pane of this._indicatorPanes.values()) {
            pane.setWidth(usableWidth - drawingToolbarWidth, priceAxisWidth);
        }

        // Update CSS Custom Properties dynamically (for runtime changes)
        if (this._element) {
            this._element.style.setProperty('--tv-toolbar-height', `${toolbarHeight}px`);
            this._element.style.setProperty('--tv-drawing-toolbar-width', `${drawingToolbarWidth}px`);
            this._element.style.setProperty('--tv-time-axis-height', `${timeAxisHeight}px`);
            this._element.style.setProperty('--tv-price-axis-width', `${priceAxisWidth}px`);
        }
    }

    // --- Sub-pane layout (order, separators, maximize / collapse) ---

    /** Panes in display order (the indicator order), hidden-on-timeframe ones included */
    private _orderedPanes(): Array<{ id: string; pane: IndicatorPaneWidget }> {
        const out: Array<{ id: string; pane: IndicatorPaneWidget }> = [];
        for (const ind of this._indicatorManager.panelIndicators) {
            const pane = this._indicatorPanes.get(ind.id);
            if (pane) out.push({ id: ind.id, pane });
        }
        return out;
    }

    private _isPaneHiddenNow(pane: IndicatorPaneWidget): boolean {
        return this._indicatorPanesHidden || isPaneHiddenByInterval(pane.indicators);
    }

    /** Resolve and apply the layout of every sub-pane; returns the main pane share */
    private _layoutIndicatorPanes(available: number) {
        const ordered = this._orderedPanes();
        const layout = resolvePaneLayout(
            available,
            ordered.map(({ id, pane }) => ({
                id,
                height: pane.actualHeight,
                collapsed: this._collapsedPanes.has(id),
                hiddenByInterval: this._isPaneHiddenNow(pane),
            })),
            this._maximizedPane,
        );
        const visible = ordered.filter(({ pane }) => !this._isPaneHiddenNow(pane)).map((o) => o.id);
        for (const { id, pane } of ordered) {
            pane.applyLayout(layout.panes[id]);
            pane.setControlsState({
                canUp: canMovePane(visible, id, 'up'),
                canDown: canMovePane(visible, id, 'down'),
                maximized: this._maximizedPane === id,
                collapsed: this._collapsedPanes.has(id),
            });
        }
        return layout;
    }

    private _syncPaneDom(): void {
        const container = this._indicatorContainer;
        if (!container) return;
        for (const { pane } of this._orderedPanes()) {
            if (pane.element) container.appendChild(pane.element);
        }
    }

    private _onPaneAction(action: PaneAction, indicator: Indicator): void {
        const id = indicator.id;
        switch (action) {
            case 'up':
            case 'down': {
                if (this._maximizedPane !== null) return;
                const ordered = this._orderedPanes();
                const visible = ordered.filter(({ pane }) => !this._isPaneHiddenNow(pane)).map((o) => o.id);
                const vi = visible.indexOf(id);
                const target = visible[action === 'up' ? vi - 1 : vi + 1];
                if (vi < 0 || target === undefined) return;
                const all = ordered.map((o) => o.id);
                const steps = Math.abs(all.indexOf(target) - all.indexOf(id));
                for (let i = 0; i < steps; i++) this._indicatorManager.movePanelIndicator(id, action);
                this._syncPaneDom();
                break;
            }
            case 'maximize':
                this._maximizedPane = toggleMaximized(this._maximizedPane, id);
                break;
            case 'collapse':
                if (this._maximizedPane === id) this._maximizedPane = null;
                this._collapsedPanes = new Set(toggleCollapsed([...this._collapsedPanes], id));
                break;
            case 'delete':
                this._indicatorManager.removeIndicator(id);
                break;
        }
        this._updateLayout();
        this._scheduleDraw();
        this._chartStateManager?.requestSave();
    }

    private _onPaneSeparatorDrag(id: string, phase: 'start' | 'move' | 'end', clientY: number): void {
        const m = PANE_STYLE.metrics;
        if (phase === 'start') {
            this._paneDrag = null;
            if (this._maximizedPane !== null || this._collapsedPanes.has(id)) return;
            const visible = this._orderedPanes().filter(({ pane }) => !this._isPaneHiddenNow(pane));
            const i = visible.findIndex((o) => o.id === id);
            if (i < 0) return;
            let upper: { id: string; pane: IndicatorPaneWidget } | null = null;
            for (let k = i - 1; k >= 0; k--) {
                if (!this._collapsedPanes.has(visible[k].id)) { upper = visible[k]; break; }
            }
            this._paneDrag = {
                id, startY: clientY, upperId: upper ? upper.id : null,
                upperH: upper ? upper.pane.height : this._lastMainHeight,
                lowerH: visible[i].pane.height,
            };
        } else if (phase === 'move') {
            const d = this._paneDrag;
            const lowerPane = d ? this._indicatorPanes.get(d.id) : undefined;
            if (!d || !lowerPane) return;
            const upperPane = d.upperId ? this._indicatorPanes.get(d.upperId) : undefined;
            const [u, l] = dragSeparator(d.upperH, d.lowerH, clientY - d.startY,
                upperPane ? m.minHeight : m.minMainHeight, m.minHeight);
            lowerPane.setHeight(l);
            upperPane?.setHeight(u);
            this._updateLayout();
            this._scheduleDraw();
        } else {
            if (this._paneDrag) this._chartStateManager?.requestSave();
            this._paneDrag = null;
        }
    }

    private _getPaneLayout(): PaneLayoutPersist {
        const heights: Record<string, number> = {};
        for (const { id, pane } of this._orderedPanes()) heights[id] = pane.actualHeight;
        return {
            heights,
            collapsed: [...this._collapsedPanes].filter((id) => this._indicatorPanes.has(id)),
            maximized: this._maximizedPane === MAIN_PANE_ID || (this._maximizedPane !== null && this._indicatorPanes.has(this._maximizedPane))
                ? this._maximizedPane : null,
        };
    }

    private _applyPaneLayoutState(layout: PaneLayoutPersist | undefined): void {
        if (!layout) return;
        this._savedPaneHeights = { ...(layout.heights ?? {}) };
        for (const [id, h] of Object.entries(this._savedPaneHeights)) {
            if (typeof h === 'number' && h > 0) this._indicatorPanes.get(id)?.setHeight(h);
        }
        this._collapsedPanes = new Set((layout.collapsed ?? []).filter((id) => this._indicatorPanes.has(id)));
        this._maximizedPane = layout.maximized && (layout.maximized === MAIN_PANE_ID || this._indicatorPanes.has(layout.maximized))
            ? layout.maximized : null;
        this._syncPaneDom();
        this._updateLayout();
        this._scheduleDraw();
    }

    /** Maximize / restore button of the main pane (top-right, on hover; only with sub-panes) */
    private _updateMainPaneButton(priceAxisWidth: number): void {
        if (!this._chartRow) return;
        const m = PANE_STYLE.metrics;
        if (!this._mainPaneButton) {
            const b = document.createElement('button');
            b.type = 'button';
            b.style.cssText = `
                position: absolute; top: ${m.controlsTop}px; z-index: 12; display: none;
                width: ${m.buttonSize}px; height: ${m.buttonSize}px; padding: 0; border: 0; border-radius: ${m.radius}px;
                align-items: center; justify-content: center; cursor: pointer;
            `;
            b.addEventListener('mousedown', (e) => e.stopPropagation());
            b.addEventListener('dblclick', (e) => e.stopPropagation());
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                this._maximizedPane = toggleMaximized(this._maximizedPane, MAIN_PANE_ID);
                this._updateLayout();
                this._scheduleDraw();
                this._chartStateManager?.requestSave();
            });
            this._chartRow.appendChild(b);
            this._chartRow.addEventListener('mouseenter', () => { this._mainPaneHover = true; this._updateMainPaneButton(this._priceAxisWidget?.width ?? 52); });
            this._chartRow.addEventListener('mouseleave', () => { this._mainPaneHover = false; this._updateMainPaneButton(this._priceAxisWidget?.width ?? 52); });
            this._mainPaneButton = b;
        }
        const b = this._mainPaneButton;
        const maximized = this._maximizedPane === MAIN_PANE_ID;
        const c = paneColors(this._currentTheme === 'light' ? 'light' : 'dark');
        const hasPanes = this._orderedPanes().some(({ pane }) => !this._isPaneHiddenNow(pane)) || maximized;
        b.style.display = this._mainPaneHover && hasPanes ? 'inline-flex' : 'none';
        // Keep clear of the technical rating card that sits in the same corner
        let right = priceAxisWidth + m.controlsRight;
        const badge = this._element?.querySelector('#tv-technical-rating-badge') as HTMLElement | null;
        if (badge && badge.offsetWidth > 0) {
            const br = badge.getBoundingClientRect();
            const cr = this._chartRow.getBoundingClientRect();
            if (br.top < cr.top + m.controlsTop + m.buttonSize && br.bottom > cr.top + m.controlsTop) {
                right = Math.max(right, Math.round(cr.right - br.left) + m.controlsRight);
            }
        }
        b.style.right = `${right}px`;
        b.style.background = c.controlsBg;
        b.style.color = c.icon;
        const label = maximized ? t('Restore pane') : t('Maximize pane');
        b.title = label;
        b.setAttribute('aria-label', label);
        b.dataset.paneAction = 'maximize-main';
        const body = maximized
            ? '<path d="M7.5 4.5v3h-3M10.5 4.5v3h3M7.5 13.5v-3h-3M10.5 13.5v-3h3"/>'
            : '<path d="M4.5 7.5v-3h3M13.5 7.5v-3h-3M4.5 10.5v3h3M13.5 10.5v3h-3"/>';
        b.innerHTML = `<svg width="${m.iconSize}" height="${m.iconSize}" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
    }

    private _onChartTypeChange(type: ChartType): void {
        this._activeChartType = type;
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
                    wickVisible: true,
                    ...this._heikenAshiStyleOverrides
                });
                break;
            case 'candles':
            default:
                newSeries = this._model.addCandlestickSeries({
                    upColor: '#26a69a',
                    downColor: '#ef5350',
                    borderVisible: false,
                    wickVisible: true,
                    ...this._candlestickStyleOverrides
                });
                break;
        }

        // Restore data
        if (data.length > 0) {
            // `data` is what is displayed (during replay: already truncated), so bypass replay interception
            this._applyData(newSeries as any, data as any);
        }
    }

    private _onPriceScaleModeChange(mode: 'normal' | 'logarithmic'): void {
        this._model.rightPriceScale.setMode(
            mode === 'logarithmic' ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal
        );
        this._model.rightPriceScale.setAutoScale(true);
        this._model.recalculateAllPanes();
        this._model.fullUpdate();
    }

    private _onTimeframeChange(timeframe: string): void {
        console.log('📊 Timeframe changed to:', timeframe);
        this._model.setTimeframe(timeframe);
        // Cizimlerin "zaman dilimlerinde gorunurluk" filtresi
        this._drawingManager.setTimeframe(timeframe);
        for (const ind of this._indicatorManager.allIndicators) ind.setTimeframe(timeframe);
        this._drawingSettingsModal?.setTimeframe(timeframe);
        this._objectTreePanel?.resetDeleteConfirm();
        this._objectTreePanel?.refresh();
        this._scheduleDraw();
        this._timeframeChanged.fire(timeframe);

        // Update technical rating badge
        this._technicalRatingBadge?.updateRating(this._model.symbol, timeframe, this._currentExchange);
    }

    /** Toolbar'daki "Liste" dugmesiyle acilan izleme listesi paneli. */
    private _createWatchlist(): void {
        if (!this._element || !this._toolbarWidget) return;
        this._watchlistPanel?.destroy();
        const panel = new WatchlistPanel(this._element, this._toolbarWidget.height);
        this._watchlistPanel = panel;
        panel.setTheme(this._currentTheme === 'light' ? 'light' : 'dark');
        panel.setActiveSymbol(this._model.symbol);

        this._toolbarWidget.watchlistToggled.subscribe((enabled) => panel.setVisible(enabled));
        panel.visibilityChanged.subscribe((visible) => {
            // Izleme listesi acilinca agac gecici kapanir (tercih yazilmaz); liste kapaninca agac,
            // kullanici onu onceden acik biraktiysa (wasOpen) yeniden acilir.
            if (visible) {
                this._alertsPanel?.setVisible(false, { persist: false });
                this._objectTreePanel?.setVisible(false, { persist: false });
            } else this._restoreRightPanel();
            this._toolbarWidget?.setWatchlistActive(visible);
            this._updateLayout();
            this._scheduleDraw();
        });
        panel.widthChanged.subscribe(() => {
            if (!panel.visible) return;
            this._updateLayout();
            this._scheduleDraw();
        });
        panel.symbolSelected.subscribe((sel) => {
            const type: SymbolInfo['type'] =
                sel.assetClass === 'crypto' ? 'crypto' : sel.exchange === 'COMEX' ? 'futures' : 'forex';
            this._onSymbolChange({
                symbol: sel.code,
                full_name: `${sel.exchange}:${sel.code}`,
                description: sel.name,
                exchange: sel.exchange,
                type,
            });
        });

        if (WatchlistPanel.wasOpen()) panel.setVisible(true);
    }

    /** Right slot freed: re-open the alerts panel or the object tree if the user left it open (never both). */
    private _restoreRightPanel(): void {
        if (this._watchlistPanel?.visible || this._alertsPanel?.visible) return;
        if (AlertsPanel.wasOpen() && this._alertsPanel) this._alertsPanel.setVisible(true);
        else if (ObjectTreePanel.wasOpen()) this._objectTreePanel?.setVisible(true);
    }

    /** Alerts manager panel ("Alarm yoneticisi"): same right slot as the watchlist / object tree (only one open). */
    private _createAlertsPanel(): void {
        if (!this._element || !this._toolbarWidget) return;
        this._alertsPanel?.destroy();
        const panel = new AlertsPanel(this._element, this._toolbarWidget.height, () => this as AlertsPanelChart);
        this._alertsPanel = panel;
        panel.setTheme(this._currentTheme === 'light' ? 'light' : 'dark');

        this._toolbarWidget.alertsManagerToggled.subscribe((enabled) => panel.setVisible(enabled));
        panel.unreadChanged.subscribe((n) => this._toolbarWidget?.setAlertsUnread(n));
        panel.visibilityChanged.subscribe((visible) => {
            if (visible) {
                this._watchlistPanel?.setVisible(false);
                this._objectTreePanel?.setVisible(false, { persist: false });
            } else this._restoreRightPanel();
            this._toolbarWidget?.setAlertsManagerActive(visible);
            this._updateLayout();
            this._scheduleDraw();
        });
        panel.widthChanged.subscribe(() => {
            if (!panel.visible) return;
            this._updateLayout();
            this._scheduleDraw();
        });

        if (AlertsPanel.wasOpen() && !this._watchlistPanel?.visible) panel.setVisible(true);
    }

    /** Nesne agaci: sag kenarda yerlesir (izleme listesiyle ayni anda acik olmaz). */
    private _createObjectTree(): void {
        if (!this._element) return;
        this._objectTreePanel?.destroy();
        const panel = new ObjectTreePanel(this._element, this._toolbarWidget?.height ?? 0, {
            drawings: this._drawingManager,
            indicators: this._indicatorManager,
            openDrawingSettings: (d) => this._openDrawingSettings(d),
            openIndicatorSettings: (ind) => this._openIndicatorSettings(ind),
            toggleIndicator: (ind) => { ind.setVisible(!ind.visible); this._scheduleDraw(); },
            removeIndicator: (ind) => { this._indicatorManager.removeIndicator(ind.id); this._scheduleDraw(); },
            showDrawingMenu: (d, x, y) => this._showDrawingContextMenu(d, x, y),
            requestDraw: () => this._scheduleDraw(),
        });
        this._objectTreePanel = panel;
        if (this._objectTreeExternal) panel.mountIn(this._objectTreeExternal, 0);
        panel.setTheme(this._currentTheme === 'light' ? 'light' : 'dark');
        panel.visibilityChanged.subscribe((visible) => {
            if (visible) {
                this._watchlistPanel?.setVisible(false);
                this._alertsPanel?.setVisible(false);
            }
            this._drawingToolbarWidget?.setObjectTreeActive(visible);
            this._updateLayout();
            this._scheduleDraw();
            this._objectTreeVisibilityChanged.fire(visible);
        });
        if (ObjectTreePanel.wasOpen() && !this._watchlistPanel?.visible && !this._alertsPanel?.visible && !this._objectTreeExternal) panel.setVisible(true);
        this._drawingToolbarWidget?.setObjectTreeActive(panel.visible);
    }

    /** Drawing state / interaction tools (used by DrawingToolbarBinding). */
    get drawingManager(): DrawingManager {
        return this._drawingManager;
    }

    get interactionTools(): InteractionTools {
        return this._interactionTools;
    }

    get objectTreeWidth(): number {
        return this._objectTreePanel?.width ?? 0;
    }

    get objectTreeVisible(): boolean {
        return this._objectTreePanel?.visible ?? false;
    }

    /** Redraws the drawings layer (after a host changed drawing-manager flags). */
    refreshDrawings(): void {
        this._scheduleDraw();
    }

    /** Registers the host-owned shared drawing toolbar (this chart has no toolbar of its own then). */
    setSharedDrawingToolbar(handlers: { select: (tool: string) => void; closeFlyout: () => void } | null): void {
        this._sharedToolbar = handlers;
    }

    /** Hosts the object tree in an external container (layout sidebar) instead of inside this chart; null = back inside. */
    setObjectTreeContainer(container: HTMLElement | null): void {
        this._objectTreeExternal = container;
        const target = container ?? this._element;
        if (target) this._objectTreePanel?.mountIn(target, container ? 0 : this._toolbarWidget?.height ?? 0);
        this._updateLayout();
        this._scheduleDraw();
    }

    /** Fires when the object tree panel of this chart opens / closes (host-owned watchlist exclusion). */
    get objectTreeVisibilityChanged(): Delegate<boolean> {
        return this._objectTreeVisibilityChanged;
    }

    /** Temporarily closes the object tree (preference is kept); `restoreObjectTree` re-opens it if it was open before. */
    hideObjectTree(): void {
        this._objectTreePanel?.setVisible(false, { persist: false });
    }

    restoreObjectTree(): void {
        if (ObjectTreePanel.wasOpen()) this._objectTreePanel?.setVisible(true);
    }

    /** Nesne agacini ac/kapat (toolbar dugmesi ve baglam menusu) */
    toggleObjectTree(): void {
        this._objectTreePanel?.toggle();
    }

    private _onSymbolChange(symbol: SymbolInfo): void {
        this._textEditor?.close(true);
        this._watchlistPanel?.setActiveSymbol(symbol.symbol);
        this._alertsPanel?.notifyActiveChartChanged();
        console.log('🔍 Symbol changed to:', symbol.symbol, '@ Exchange:', symbol.exchange);

        // Update state manager - this saves current symbol's drawings and loads new symbol's drawings
        this._chartStateManager?.setSymbol(symbol.symbol);
        this._objectTreePanel?.resetDeleteConfirm();
        this._objectTreePanel?.refresh();

        this._model.setSymbol(symbol.symbol);
        if (symbol.exchange) {
            this._model.setExchange(symbol.exchange);
        }
        this._toolbarWidget?.setSymbol(symbol.symbol);

        // Reset price scale auto-scaling to ensure new symbol's price range is visible
        this._model.rightPriceScale.setAutoScale(true);

        // Fire full symbol info including exchange for data fetching
        this._symbolChanged.fire({
            symbol: symbol.symbol,
            exchange: symbol.exchange,
            provider: symbol.provider,
            type: symbol.type
        } as any);

        // Update technical rating badge
        this._technicalRatingBadge?.updateRating(symbol.symbol, this._model.timeframe, symbol.exchange || this._currentExchange);

        // Switch orderbook provider if exchange changed
        const needsProviderSwitch = symbol.exchange !== this._currentExchange;

        // Unsubscribe from current symbol
        if (this._dataProvider && this._currentSymbol) {
            this._dataProvider.unsubscribeOrderbook(this._currentSymbol);
        }

        // Switch provider if exchange changed
        if (needsProviderSwitch && symbol.exchange) {
            // Disconnect old provider
            this._dataProvider?.disconnect();

            // Create new provider based on exchange
            this._dataProvider = this._createProviderForExchange(symbol.exchange);
            this._currentExchange = symbol.exchange;

            // Connect new provider
            this._dataProvider?.connect().catch(console.error);
            console.log(`📡 Switched orderbook provider to: ${symbol.exchange}`);
        }

        this._currentSymbol = symbol.symbol;

        // Subscribe to orderbook for new symbol
        // Subscribe to orderbook for new symbol - only if enabled
        if (this._dataProvider && this._toolbarWidget?.domEnabled) {
            this._dataProvider.subscribeOrderbook(symbol.symbol, this._onOrderbookUpdate);
        }
    }

    /**
     * Create the appropriate orderbook provider for the given exchange
     */
    private _createProviderForExchange(exchange: string): OrderbookProvider {
        switch (exchange) {
            case 'BINANCE':
                return new BinanceSpotProvider({ maxOrderbookLevels: 5000 });
            case 'BINANCE-FUTURES':
                return new BinanceFuturesProvider({ maxOrderbookLevels: 5000 });
            case 'BIST':
                return new BistDataProvider();
            case 'BYBIT':
                return new BybitSpotProvider({ maxOrderbookLevels: 500 });
            case 'BYBIT-FUTURES':
                return new BybitFuturesProvider({ maxOrderbookLevels: 500 });
            case 'OKX':
                return new OkxSpotProvider({ maxOrderbookLevels: 400 });
            case 'OKX-FUTURES':
                return new OkxFuturesProvider({ maxOrderbookLevels: 400 });
            default:
                console.warn(`Unknown exchange: ${exchange}, using Binance Spot`);
                return new BinanceSpotProvider({ maxOrderbookLevels: 5000 });
        }
    }

    // --- Private: Event Listeners ---

    private _setupEventListeners(): void {
        if (this._element) {
            this._interactionTools.attach({
                container: this._element,
                getPaneCanvas: () => this._paneWidget?.canvas ?? null,
                getEnv: () => this._getToolEnv(),
                getForeground: () => String(this._model.options.layout.textColor || '#d1d4dc'),
            });
        }
        // Imlec senkronu icin: fare bu grafigin (herhangi bir parcasinin) uzerinde mi?
        this._element?.addEventListener('mouseenter', () => {
            this._pointerInside = true;
            this._syncedCrosshair = null;
        });
        this._element?.addEventListener('mouseleave', () => {
            this._pointerInside = false;
            if (this._crosshairSyncEnabled) this._emitCrosshair(null);
        });

        this._setupAlertLines();
        this._setupDrawingAlerts();
        const paneCanvas = this._paneWidget?.canvas;
        if (paneCanvas) {
            paneCanvas.addEventListener('wheel', this._onWheel.bind(this), { passive: false });
            paneCanvas.addEventListener('mousedown', this._onMouseDown.bind(this));
            paneCanvas.addEventListener('mousemove', this._onPaneMouseMove.bind(this));
            paneCanvas.addEventListener('mouseleave', this._onMouseLeave.bind(this));
            paneCanvas.addEventListener('dblclick', this._onPaneDoubleClick.bind(this));

            // Touch events for mobile support
            paneCanvas.addEventListener('touchstart', this._onTouchStart.bind(this), { passive: false });
            paneCanvas.addEventListener('touchmove', this._onTouchMove.bind(this), { passive: false });
            paneCanvas.addEventListener('touchend', this._onTouchEnd.bind(this), { passive: false });
            paneCanvas.addEventListener('touchcancel', this._onTouchEnd.bind(this), { passive: false });
        }

        // Keyboard shortcuts for drawings (Delete/Backspace to delete selected)
        document.addEventListener('keydown', this._boundKeyDown);
        window.addEventListener('keypress', this._boundKeyPress);

        // Aktif grafik: son tiklanan / uzerine gelinen grafik (ilk olusturulan varsayilan)
        if (_keyboardActiveChart === null) _keyboardActiveChart = this;
        this._element?.addEventListener('pointerdown', () => { _keyboardActiveChart = this; }, true);
        this._element?.addEventListener('mouseenter', () => { _keyboardActiveChart = this; });

        const priceAxisElement = this._priceAxisWidget?.element;
        if (priceAxisElement) {
            // Fare ile olcekleme SADECE PriceAxisWidget'in kendi canvas dinleyicisinde
            // (sayfa koordinatlari + kaybolan mouseup guvencesi). Burada ikinci bir
            // mousedown dinleyicisi ayni PriceScale'i farkli koordinat tabaninda
            // (pane'e gore) baslatiyordu: surukleme once ters yone (pane'in sayfadaki
            // ust bosluğu kadar) kayip sonra dogru yone donuyordu. Dokunmatik yol
            // _onPriceAxisMouseDown'u dogrudan cagiriyor, bu dinleyiciye bagli degil.
            priceAxisElement.addEventListener('dblclick', this._onPriceAxisDoubleClick.bind(this));

            // Touch events for price axis scaling
            priceAxisElement.addEventListener('touchstart', this._onPriceAxisTouchStart.bind(this), { passive: false });
            priceAxisElement.addEventListener('touchmove', this._onPriceAxisTouchMove.bind(this), { passive: false });
            priceAxisElement.addEventListener('touchend', this._onTouchEnd.bind(this), { passive: false });
            priceAxisElement.addEventListener('touchcancel', this._onTouchEnd.bind(this), { passive: false });
        }

        // Custom context menu
        if (this._element) {
            this._createContextMenu();

            this._element.addEventListener('contextmenu', (e) => {
                // Legend rows open their own "More" menu
                if (e.target instanceof Element && e.target.closest('.tvl-row')) return;
                const hitDrawing = this._getDrawingForContextMenu(e.clientX, e.clientY, e.target);
                if (hitDrawing) {
                    e.preventDefault();
                    e.stopPropagation();
                    this._showDrawingContextMenu(hitDrawing, e.clientX, e.clientY);
                    return false;
                }

                const contextPoint = this._getMainPaneEmptyContextPoint(e.clientX, e.clientY, e.target);
                if (!contextPoint) {
                    return;
                }

                e.preventDefault();
                e.stopPropagation();

                this._showChartContextMenu(e.clientX, e.clientY, contextPoint.price);
                return false;
            }, true);
        }

        document.addEventListener('mousemove', this._onMouseMove.bind(this));
        document.addEventListener('mouseup', this._onMouseUp.bind(this));

        window.addEventListener('resize', this._onResize.bind(this));

        // Handle fullscreen changes - move context menu and modals to correct container
        document.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement === this._element) {
                // Entering fullscreen - move context menu to chart element
                this._contextMenu?.setContainer(this._element!);
                this._drawingContextMenu?.setContainer(this._element!);
            } else if (!document.fullscreenElement) {
                // Exiting fullscreen - move context menu back to body
                this._contextMenu?.setContainer(document.body);
                this._drawingContextMenu?.setContainer(document.body);
            }
        });
    }

    private _onWheel(e: WheelEvent): void {
        const pane = this._resolvePaneInteraction(e.currentTarget ?? e.target);
        handleWheelEvent(e, this._getEventContextForPane(pane.paneId, pane.paneCanvas));
    }

    private _onMouseDown(e: MouseEvent): void {
        this._closeOpenMenus();
        // Sag tik: yalnizca baglam menusu (contextmenu olayi) ilgilenir; cizim/kaydirma baslatilmaz
        if (e.button === 2 && this._drawingManager.mode === 'none') return;
        // Cizim surerken (ilk nokta konmus) tiklama baska bir panelde olsa da cizimin
        // basladigi panelin olcegi kullanilir; yoksa nokta ör. RSI degeriyle (0-100) kaydedilirdi.
        const pane = this._drawingManager.activeDrawing !== null
            ? this._resolvePaneInteraction(null)
            : this._resolvePaneInteraction(e.currentTarget ?? e.target);
        this._setInteractionPane(pane.paneId, pane.paneCanvas, pane.priceScale);
        const stateUpdates = handleMouseDownEvent(e, this._getEventContextForPane(pane.paneId, pane.paneCanvas));
        this._applyEventState(stateUpdates);
    }

    private _closeOpenMenus(): void {
        this._contextMenu?.hide();
        this._drawingContextMenu?.hide();
        this._drawingToolbarWidget?.closeFlyout();
        this._sharedToolbar?.closeFlyout();
    }

    private _onMouseMove(e: MouseEvent): void {
        // Senkron modunda fare baska bir grafikteyken bu grafigin imleci
        // setSyncedCrosshair ile yonetilir; document'tan gelen hareket onu ezmesin.
        if (this._crosshairSyncEnabled && !this._pointerInside && !this._isDragging && !this._isDraggingDrawing
            && !this._isPriceScaleDragging && this._drawingManager.activeDrawing === null) {
            return;
        }
        this._onMouseMoveInner(e);
        if (this._crosshairSyncEnabled && this._pointerInside) this._emitCrosshairFromModel(e);
    }

    private _onMouseMoveInner(e: MouseEvent): void {
        const shouldUseActivePane = this._isDragging || this._isDraggingDrawing || this._drawingManager.activeDrawing !== null;
        const hoverTarget = shouldUseActivePane ? null : document.elementFromPoint(e.clientX, e.clientY);
        const pane = shouldUseActivePane
            ? this._resolvePaneInteraction(null)
            : this._resolvePaneInteraction(hoverTarget ?? e.target);
        this._drawingManager.setScales(this._model.timeScale, pane.priceScale);
        this._drawingManager.setActivePaneId(pane.paneId);
        const stateUpdates = handleMouseMoveEvent(e, this._getEventContextForPane(pane.paneId, pane.paneCanvas));
        this._applyEventState(stateUpdates);
    }

    private _onKeyDown(e: KeyboardEvent): void {
        // Alt+A: create an alert (crosshair price while the mouse is over the chart, else the last price)
        if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyA'
            && !isTypingTarget(e.target) && (_keyboardActiveChart === null || _keyboardActiveChart === this)) {
            e.preventDefault();
            this.openAlertDialogAtCursor();
            return;
        }
        handleKeyDownEvent(e, this._getEventContextForPane(this._interactionPaneId, this._interactionPaneCanvas));
    }

    private _resolvePaneInteraction(target: EventTarget | null): {
        paneId: string | null;
        paneCanvas: HTMLCanvasElement | null;
        priceScale: PriceScale;
    } {
        const mainCanvas = this._paneWidget?.canvas ?? null;
        if (target === mainCanvas || (target instanceof Node && this._paneWidget?.element?.contains(target))) {
            return {
                paneId: null,
                paneCanvas: mainCanvas,
                priceScale: this._model.rightPriceScale,
            };
        }

        for (const [indicatorId, pane] of this._indicatorPanes.entries()) {
            const canvas = pane.canvas;
            if (target === canvas || (target instanceof Node && pane.element?.contains(target))) {
                return {
                    paneId: indicatorId,
                    paneCanvas: canvas,
                    priceScale: pane.priceScale,
                };
            }
        }

        return {
            paneId: this._interactionPaneId,
            paneCanvas: this._interactionPaneCanvas,
            priceScale: this._interactionPriceScale ?? this._model.rightPriceScale,
        };
    }

    private _setInteractionPane(paneId: string | null, paneCanvas: HTMLCanvasElement | null, priceScale: PriceScale): void {
        this._interactionPaneId = paneId;
        this._interactionPaneCanvas = paneCanvas;
        this._interactionPriceScale = priceScale;
        this._drawingManager.setScales(this._model.timeScale, priceScale);
        this._drawingManager.setActivePaneId(paneId);
    }

    /** Create context object for event handlers */
    private _getEventContextForPane(
        paneId: string | null,
        paneCanvas: HTMLCanvasElement | null
    ): ChartWidgetContext {
        const priceScale = paneId === null
            ? this._model.rightPriceScale
            : this._indicatorPanes.get(paneId)?.priceScale ?? this._model.rightPriceScale;

        return {
            model: this._model,
            drawingManager: this._drawingManager,
            paneCanvas,
            element: this._element,
            paneId,
            priceScale,
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
                // OHLC bar data is used as is (no per-mousemove copy of every bar)
                const first: any = series.data[0];
                if (first && first.open !== undefined && first.high !== undefined && first.low !== undefined && first.close !== undefined) {
                    return series.data as any;
                }
                return series.data.map((d: any) => ({
                    time: d.time,
                    open: d.open ?? d.value ?? 0,
                    high: d.high ?? d.value ?? 0,
                    low: d.low ?? d.value ?? 0,
                    close: d.close ?? d.value ?? 0
                }));
            },
            scheduleDraw: () => this._scheduleDraw(),
            isActiveForKeyboard: () => _keyboardActiveChart === null || _keyboardActiveChart === this,
            selectTool: (tool: string) => this._selectToolByShortcut(tool),
            tools: this._interactionTools,
            getToolEnv: () => this._getToolEnv(),
            replay: this._replay,
        };
    }

    /** Klavye kisayolu ile arac secimi: toolbar tiklamasiyla ayni yol (vurgu da guncellenir) */
    private _selectToolByShortcut(tool: string): void {
        if (this._drawingToolbarWidget) {
            this._drawingToolbarWidget.setActiveTool(tool);
        } else if (this._sharedToolbar) {
            this._sharedToolbar.select(tool);
        } else {
            // cursors / interaction tools are not drawing modes
            this._interactionTools.setTool(tool);
            this._drawingManager.setMode(
                CURSOR_KINDS.includes(tool) || MODE_TOOLS.includes(tool) ? 'none' : tool as DrawingMode
            );
            this._interactionTools.syncHost(this._drawingManager.mode !== 'none');
            this._scheduleDraw();
        }
    }

    /** Main pane scale + data access for the interaction tools (bar times / precision cached per data) */
    private _getToolEnv(): ToolEnv | null {
        const series = this._model.serieses[0];
        const data = series?.data as readonly any[] | undefined;
        if (!data || data.length === 0) return null;
        const key = `${data.length}|${data[0].time}|${data[data.length - 1].time}`;
        if (!this._toolEnvCache || this._toolEnvCache.key !== key) {
            const tail = data.slice(-200).map((d: any) => Number(d.close ?? d.value ?? 0));
            this._toolEnvCache = {
                key,
                times: data.map((d: any) => Number(d.time)),
                precision: estimatePricePrecision(tail, 2),
            };
        }
        return {
            timeScale: this._model.timeScale as any,
            priceScale: this._model.rightPriceScale as any,
            times: this._toolEnvCache.times,
            symbol: this._model.symbol,
            precision: this._toolEnvCache.precision,
        };
    }

    /** Crosshair as rendered: dot / demonstration cursors replace the crosshair lines */
    private _visibleCrosshair() {
        if (this._interactionTools.hideCrosshair(this._drawingManager.mode !== 'none')) return null;
        return this._model.crosshairPosition;
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

    private _onMouseLeave(e?: MouseEvent): void {
        // "+ Add Text" balonunun uzerine gecmek canvas'tan cikmak sayilmaz (istatistik kutusu yanip sonmesin);
        // ama grafik elemanindan tamamen cikilirsa (relatedTarget grafigin disinda) hover her durumda temizlenir.
        const related = e?.relatedTarget as Node | null | undefined;
        const leftChart = !related ||
            (!this._container.contains(related) && !(related as Element).closest?.('.add-text-tooltip'));
        if (this._drawingManager.hoveredDrawingId !== null &&
            (leftChart || this._drawingManager.hoveredDrawingId !== this._hoveredDrawingForText)) {
            this._drawingManager.updateHoveredDrawing(-1e9, -1e9, null);
            this._scheduleDraw();
        }
        handleMouseLeaveEvent(this._getEventContextForPane(this._interactionPaneId, this._interactionPaneCanvas));
    }

    private _onMouseUp(e: MouseEvent): void {
        const pane = this._resolvePaneInteraction(null);
        const stateUpdates = handleMouseUpEvent(e, this._getEventContextForPane(pane.paneId, pane.paneCanvas));
        this._applyEventState(stateUpdates);

        if (!this._isDragging && !this._isDraggingDrawing && this._drawingManager.activeDrawing === null) {
            this._interactionPaneId = null;
            this._interactionPaneCanvas = null;
            this._interactionPriceScale = null;
            this._drawingManager.setActivePaneId(null);
            this._drawingManager.setScales(this._model.timeScale, this._model.rightPriceScale);
        }
    }

    private _onPriceAxisMouseDown(e: MouseEvent): void {
        const stateUpdates = handlePriceAxisMouseDownEvent(e, this._getEventContextForPane(null, this._paneWidget?.canvas ?? null));
        this._applyEventState(stateUpdates);
    }

    private _onPriceAxisDoubleClick(): void {
        handlePriceAxisDoubleClickEvent(this._getEventContextForPane(null, this._paneWidget?.canvas ?? null));
    }

    /** Handle mouse move on pane - show Add Text tooltip on line midpoint */
    private _onPaneMouseMove(e: MouseEvent): void {
        if (e.currentTarget !== this._paneWidget?.canvas) {
            this._hideAddTextTooltip();
            this._hoveredDrawingForText = null;
            return;
        }

        const paneRect = this._paneWidget?.canvas?.getBoundingClientRect();
        if (!paneRect) return;

        // Hover: cizgi istatistik kutusu yalnizca uzerine gelinince gorunebilsin
        if (this._drawingManager.updateHoveredDrawing(e.clientX - paneRect.left, e.clientY - paneRect.top, null)) {
            this._scheduleDraw();
        }

        // Skip hit testing for "Add Text" if in drawing mode or an interaction tool (eraser etc.)
        // is active (the tooltip would also swallow the eraser's click on the line midpoint)
        if (this._drawingManager.mode !== 'none' || this._interactionTools.mode !== 'none') {
            if (this._drawingManager.hoveredForAddText !== null) {
                this._drawingManager.hoveredForAddText = null;
                this._scheduleDraw();
            }
            this._hideAddTextTooltip();
            this._hoveredDrawingForText = null;
            return;
        }

        const x = e.clientX - paneRect.left;
        const y = e.clientY - paneRect.top;

        // Check if hovering over a line drawing midpoint
        const drawings = this._drawingManager.displayableDrawings;
        const lineTypes = ['trendLine', 'ray', 'extendedLine', 'horizontalLine', 'verticalLine',
            'parallelChannel', 'trendAngle', 'horizontalRay', 'infoLine', 'arrow'];

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
                        this._drawingSettingsModal = this._createDrawingSettingsModal(d);
                        this._drawingSettingsModal.setTheme(this._currentTheme);
                        this._drawingSettingsModal.settingsChanged.subscribe(() => {
                            this._commitSettingsHistory(d);
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
            // Ensure helper uses current theme
            this._addTextTooltipHelper.setTheme(this._currentTheme);
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

    // --- Touch Event Handlers ---

    private _mouseEventFromTouch(type: 'mousedown' | 'mousemove' | 'mouseup', touch: Touch): MouseEvent {
        return new MouseEvent(type, {
            clientX: touch.clientX,
            clientY: touch.clientY,
            bubbles: true,
            cancelable: true,
            view: window
        });
    }

    private _clearTouchLongPress(): void {
        if (this._touchLongPressTimer !== null) {
            window.clearTimeout(this._touchLongPressTimer);
            this._touchLongPressTimer = null;
        }
        this._touchLongPressStart = null;
    }

    private _hitTestDrawingAt(x: number, y: number, paneId: string | null): boolean {
        const drawings = this._drawingManager.displayableDrawings;

        this._drawingManager.setScales(
            this._model.timeScale,
            paneId === null ? this._model.rightPriceScale : this._indicatorPanes.get(paneId)?.priceScale ?? this._model.rightPriceScale
        );

        for (let i = drawings.length - 1; i >= 0; i--) {
            const drawing = drawings[i];

            if (!drawing.visible || (drawing.paneId ?? null) !== paneId) {
                continue;
            }

            if (drawing === this._drawingManager.activeDrawing && drawing.state === 'creating') {
                continue;
            }

            if (drawing.type === 'longPosition' || drawing.type === 'shortPosition' || drawing.type === 'priceRange' || drawing.type === 'dateRange' || drawing.type === 'datePriceRange') {
                if (drawing.points.length >= 2) {
                    const p1 = drawing.points[0];
                    const p2 = drawing.points[1];
                    const x1 = this._drawingManager.timeToPixel(p1.time);
                    const y1 = this._drawingManager.priceToPixel(p1.price);
                    const x2 = this._drawingManager.timeToPixel(p2.time);
                    const y2 = this._drawingManager.priceToPixel(p2.price);
                    if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
                        (drawing as any).setPixelPoints([{ x: x1, y: y1 }, { x: x2, y: y2 }]);
                    }
                }
            }

            if (drawing.hitTest(x, y, 8)) {
                return true;
            }
        }

        return false;
    }

    private _getMainPaneEmptyContextPoint(clientX: number, clientY: number, target: EventTarget | null): { x: number; y: number; price: number } | null {
        if (this._drawingManager.mode !== 'none') {
            return null;
        }

        const mainCanvas = this._paneWidget?.canvas ?? null;
        const mainPaneElement = this._paneWidget?.element ?? null;
        if (!mainCanvas || !mainPaneElement) {
            return null;
        }

        const isMainPaneTarget = target === mainCanvas || (target instanceof Node && mainPaneElement.contains(target));
        if (!isMainPaneTarget) {
            return null;
        }

        const rect = mainCanvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
            return null;
        }

        if (this._hitTestOverlayIndicator(x, y) || this._hitTestDrawingAt(x, y, null)) {
            return null;
        }

        return {
            x,
            y,
            price: this._model.rightPriceScale.coordinateToPrice(y as any),
        };
    }

    private _scheduleTouchContextMenu(e: TouchEvent, touch: Touch): void {
        this._clearTouchLongPress();
        this._touchLongPressTriggered = false;

        const contextPoint = this._getMainPaneEmptyContextPoint(touch.clientX, touch.clientY, e.currentTarget ?? e.target);
        if (!contextPoint) {
            return;
        }

        this._touchLongPressStart = { clientX: touch.clientX, clientY: touch.clientY };
        this._touchLongPressTimer = window.setTimeout(() => {
            this._touchLongPressTimer = null;
            this._touchLongPressTriggered = true;

            this._finishTouchInteraction(this._mouseEventFromTouch('mouseup', touch));
            this._showChartContextMenu(touch.clientX, touch.clientY, contextPoint.price);

            const suppressNextClick = (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
                document.removeEventListener('click', suppressNextClick, true);
            };
            document.addEventListener('click', suppressNextClick, true);
            window.setTimeout(() => {
                document.removeEventListener('click', suppressNextClick, true);
            }, 350);
        }, 650);
    }

    private _finishTouchInteraction(mouseEvent: MouseEvent): void {
        const pane = this._resolvePaneInteraction(null);
        const stateUpdates = handleMouseUpEvent(mouseEvent, this._getEventContextForPane(pane.paneId, pane.paneCanvas));
        this._applyEventState(stateUpdates);

        if (!this._isDragging && !this._isDraggingDrawing && this._drawingManager.activeDrawing === null) {
            this._interactionPaneId = null;
            this._interactionPaneCanvas = null;
            this._interactionPriceScale = null;
            this._drawingManager.setActivePaneId(null);
            this._drawingManager.setScales(this._model.timeScale, this._model.rightPriceScale);
        }
    }

    private _onTouchStart(e: TouchEvent): void {
        e.preventDefault(); // Prevent scrolling
        this._closeOpenMenus();

        if (e.touches.length === 1) {
            // Single touch - draw/select/pan on the pane that received the real touch event.
            const touch = e.touches[0];
            this._scheduleTouchContextMenu(e, touch);
            const pane = this._resolvePaneInteraction(e.currentTarget ?? e.target);
            this._setInteractionPane(pane.paneId, pane.paneCanvas, pane.priceScale);
            const stateUpdates = handleMouseDownEvent(
                this._mouseEventFromTouch('mousedown', touch),
                this._getEventContextForPane(pane.paneId, pane.paneCanvas)
            );
            this._applyEventState(stateUpdates);
        } else if (e.touches.length === 2) {
            this._clearTouchLongPress();
            // Two touches - Start Zoom
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            this._lastTouchDistance = dist;

            // Should we end dragging if it was active?
            if (this._isDragging) {
                this._isDragging = false;
                this._finishTouchInteraction(this._mouseEventFromTouch('mouseup', t1));
            }
        }
    }

    private _onTouchMove(e: TouchEvent): void {
        e.preventDefault();

        if (e.touches.length === 1) {
            // Single touch - update the same interaction path as mouse move, but with a pane
            // resolved from the real touch target instead of a synthetic MouseEvent target.
            const touch = e.touches[0];
            if (this._touchLongPressStart) {
                const dx = touch.clientX - this._touchLongPressStart.clientX;
                const dy = touch.clientY - this._touchLongPressStart.clientY;
                if (Math.sqrt(dx * dx + dy * dy) > 10) {
                    this._clearTouchLongPress();
                }
            }
            const shouldUseActivePane = this._isDragging || this._isDraggingDrawing || this._drawingManager.activeDrawing !== null;
            const hoverTarget = shouldUseActivePane ? null : document.elementFromPoint(touch.clientX, touch.clientY);
            const pane = shouldUseActivePane
                ? this._resolvePaneInteraction(null)
                : this._resolvePaneInteraction(hoverTarget ?? e.currentTarget ?? e.target);

            this._drawingManager.setScales(this._model.timeScale, pane.priceScale);
            this._drawingManager.setActivePaneId(pane.paneId);
            const stateUpdates = handleMouseMoveEvent(
                this._mouseEventFromTouch('mousemove', touch),
                this._getEventContextForPane(pane.paneId, pane.paneCanvas)
            );
            this._applyEventState(stateUpdates);
        } else if (e.touches.length === 2) {
            this._clearTouchLongPress();
            // Two touches - Zoom
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

            if (this._lastTouchDistance > 0) {
                const delta = dist - this._lastTouchDistance;

                // Sensitivity factor
                const scale = delta * 0.05;

                // Calculate midpoint for zoom center
                const rect = this._paneWidget?.canvas?.getBoundingClientRect();
                if (rect) {
                    const midX = ((t1.clientX + t2.clientX) / 2) - rect.left;
                    this._model.timeScale.zoom(midX as any, scale);
                    this._scheduleDraw();
                }
            }

            this._lastTouchDistance = dist;
        }
    }

    private _onTouchEnd(e: TouchEvent): void {
        e.preventDefault();
        this._clearTouchLongPress();
        this._priceAxisTouchStart = null;
        this._priceAxisTouchActive = null;

        if (this._touchLongPressTriggered) {
            this._touchLongPressTriggered = false;
            return;
        }

        if (e.touches.length === 0) {
            // All fingers lifted
            this._lastTouchDistance = 0;

            const touch = e.changedTouches[0];
            const mouseEvent = touch
                ? this._mouseEventFromTouch('mouseup', touch)
                : new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
            this._finishTouchInteraction(mouseEvent);
        } else if (e.touches.length === 1) {
            // Switched from 2 to 1 finger? Or 1 to 0 (handled above)?
            // If we still have 1 finger, maybe resume panning? 
            // For now, let's just reset zoom distance
            this._lastTouchDistance = 0;

            // Trigger a mousedown to "restart" panning if needed, 
            // but complex transition might be jumpy.
            // Simplest is to treat it as end of interaction until all lifted.
        }
    }

    private _onPriceAxisTouchStart(e: TouchEvent): void {
        if (e.touches.length !== 1) return;
        e.preventDefault();

        const touch = e.touches[0];
        this._priceAxisTouchStart = { x: touch.clientX, y: touch.clientY };
        this._priceAxisTouchActive = null;
    }

    private _onPriceAxisTouchMove(e: TouchEvent): void {
        if (e.touches.length !== 1 || !this._priceAxisTouchStart) return;
        e.preventDefault();

        const touch = e.touches[0];

        if (this._priceAxisTouchActive === null) {
            const dx = touch.clientX - this._priceAxisTouchStart.x;
            const dy = touch.clientY - this._priceAxisTouchStart.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 10) {
                if (Math.abs(dy) > Math.abs(dx)) {
                    this._priceAxisTouchActive = 'scaling';
                    const mouseEvent = new MouseEvent('mousedown', {
                        clientX: this._priceAxisTouchStart.x,
                        clientY: this._priceAxisTouchStart.y,
                        bubbles: true,
                        cancelable: true,
                        view: window
                    } as MouseEventInit);

                    Object.defineProperty(mouseEvent, 'target', {
                        value: this._priceAxisWidget?.element,
                        writable: false,
                        enumerable: true,
                        configurable: true
                    });

                    this._onPriceAxisMouseDown(mouseEvent);
                } else {
                    this._priceAxisTouchActive = 'panning';
                    const pane = this._resolvePaneInteraction(null);
                    this._setInteractionPane(pane.paneId, pane.paneCanvas, pane.priceScale);
                    const mouseEvent = new MouseEvent('mousedown', {
                        clientX: this._priceAxisTouchStart.x,
                        clientY: this._priceAxisTouchStart.y,
                        bubbles: true,
                        cancelable: true,
                        view: window
                    } as MouseEventInit);
                    
                    const stateUpdates = handleMouseDownEvent(
                        mouseEvent,
                        this._getEventContextForPane(pane.paneId, pane.paneCanvas)
                    );
                    this._applyEventState(stateUpdates);
                }
            }
        }

        if (this._priceAxisTouchActive !== null) {
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY,
                bubbles: true,
                cancelable: true,
                view: window
            });

            if (this._priceAxisTouchActive === 'scaling') {
                this._onMouseMove(mouseEvent);
            } else if (this._priceAxisTouchActive === 'panning') {
                const shouldUseActivePane = this._isDragging || this._isDraggingDrawing || this._drawingManager.activeDrawing !== null;
                const pane = shouldUseActivePane
                    ? this._resolvePaneInteraction(null)
                    : this._resolvePaneInteraction(e.currentTarget ?? e.target);

                this._drawingManager.setScales(this._model.timeScale, pane.priceScale);
                this._drawingManager.setActivePaneId(pane.paneId);
                const stateUpdates = handleMouseMoveEvent(
                    mouseEvent,
                    this._getEventContextForPane(pane.paneId, pane.paneCanvas)
                );
                this._applyEventState(stateUpdates);
            }
        }
    }

    private _onPaneDoubleClick(e: MouseEvent): void {
        const paneRect = this._paneWidget?.canvas?.getBoundingClientRect();
        if (!paneRect) return;

        const x = e.clientX - paneRect.left;
        const y = e.clientY - paneRect.top;

        // Path/polyline olusturulurken cift tiklama cizimi bitirir (TradingView)
        const creating = this._drawingManager.activeDrawing;
        if (creating && creating.type === 'path') {
            this._drawingManager.finishPathDrawing(true);
            this._scheduleDraw();
            return;
        }
        if (creating && creating.type === 'polyline') {
            this._drawingManager.finishPolylineDrawing(true);
            this._scheduleDraw();
            return;
        }
        if (creating && creating.type === 'ghostFeed') {
            this._drawingManager.finishGhostFeedDrawing(true);
            this._scheduleDraw();
            return;
        }

        // Check if double-clicked on an overlay indicator line
        const hitIndicator = this._hitTestOverlayIndicator(x, y);
        if (hitIndicator) {
            this._openIndicatorSettings(hitIndicator);
            return;
        }

        // Check if double-clicked on a drawing
        const hitDrawing = this._drawingManager.selectDrawingAt(x, y);
        if (hitDrawing) {
            // Text/Callout/Note/Price Note/Signpost/Comment: cift tiklama satir ici editoru acar (ayarlar modal'i degil)
            if (INLINE_TEXT_TYPES.has(hitDrawing.type) && hitDrawing.type !== 'table') {
                this._drawingManager.requestTextEdit(hitDrawing);
                return;
            }
            // Table: tiklanan hucre editorle duzenlenir; dis kenar (~4px) veya hucre disi ayarlar modal'ini acar
            if (hitDrawing.type === 'table') {
                const table = hitDrawing as TableDrawing;
                const cell = table.cellAt(x, y);
                const tb = table.getBounds();
                const onBorder = !!tb && (x - tb.x < 4 || tb.x + tb.width - x < 4 || y - tb.y < 4 || tb.y + tb.height - y < 4);
                if (cell && !onBorder && table.beginCellEdit(cell.row, cell.col)) {
                    this._drawingManager.requestTextEdit(hitDrawing);
                    return;
                }
            }
            // Open settings modal for this drawing
            if (this._element) {
                if (this._drawingSettingsModal) {
                    this._drawingSettingsModal.hide();
                }
                this._drawingSettingsModal = this._createDrawingSettingsModal(hitDrawing);
                this._drawingSettingsModal.setTheme(this._currentTheme);
                this._drawingSettingsModal.settingsChanged.subscribe(() => {
                    this._commitSettingsHistory(hitDrawing);
                    this._scheduleDraw();
                });
                this._drawingSettingsModal.show(hitDrawing);
            }
            return;
        }

        // Double-clicked on empty area - toggle indicator panes visibility
        this._toggleIndicatorPanesVisibility();
    }

    /** Toggle visibility of all indicator panes (like TradingView) */
    private _toggleIndicatorPanesVisibility(): void {
        if (this._indicatorPanes.size === 0) return;

        this._indicatorPanesHidden = !this._indicatorPanesHidden;

        for (const pane of this._indicatorPanes.values()) {
            if (this._indicatorPanesHidden) {
                pane.hide();
            } else {
                pane.show();
            }
        }

        // Recalculate layout
        this._updateSize();
        this._scheduleDraw();
    }


    /** Check if coordinates hit an overlay indicator line */
    private _hitTestOverlayIndicator(x: number, y: number): any | null {
        const threshold = 8; // pixels
        const timeScale = this._model.timeScale;
        const priceScale = this._model.rightPriceScale;
        const indicators = [...this._indicatorManager.overlayIndicators].reverse();

        for (const indicator of indicators) {
            if (!indicator.shown) {
                continue;
            }

            if (typeof (indicator as any).hitTest === 'function') {
                if ((indicator as any).hitTest(x, y, timeScale, priceScale)) {
                    return indicator;
                }
                continue;
            }

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

    private _onInvalidated(reason: InvalidateReason): void {
        // If data changed or full update triggered, update indicators
        if (reason === InvalidateReason.Data || reason === InvalidateReason.Layout) {
            const mainSeries = this._model.serieses[0];
            if (mainSeries) {
                const data = mainSeries.data;

                // Only update indicators if data is BarData (has open/high/low/close)
                // Indicators typically need OHLC data. Check first element.
                if (data.length > 0 && 'open' in (data[0] as any)) {
                    const indicatorData = this._resolveIndicatorSourceData(mainSeries as any, data as BarData[]);
                    this._pushIndicatorContext();
                    this._syncSpot(data as BarData[]);
                    this._indicatorManager.setData(indicatorData);
                }
            }
        }

        this._scheduleDraw();
    }

    private _scheduleDraw(): void {
        if (this._drawScheduled) return;
        this._drawScheduled = true;
        requestAnimationFrame(() => this._draw());
    }

    private _draw(): void {
        this._drawScheduled = false;

        const crosshair = this._visibleCrosshair();
        let mainPaneLocalY: number | null = null;

        if (crosshair && crosshair.visible && this._paneWidget?.element && this._lastMouseY !== 0) {
            const rect = this._paneWidget.element.getBoundingClientRect();
            if (this._lastMouseY >= rect.top && this._lastMouseY <= rect.bottom) {
                mainPaneLocalY = this._lastMouseY - rect.top;
                // Cizim araci aktifken model y'si magnet ile yapismis olabilir: cizgi/etiket onu izler
                if (this._drawingManager.mode !== 'none' && this._drawingManager.activePaneId === null
                    && isFinite(crosshair.y)) {
                    mainPaneLocalY = crosshair.y;
                }
            }
        }

        if (this._crosshairSyncEnabled && !this._pointerInside) {
            mainPaneLocalY = crosshair?.visible && this._syncedLocalY !== null
                && this._syncedLocalY >= 0 && this._syncedLocalY <= this._model.rightPriceScale.height
                ? this._syncedLocalY
                : null;
        }

        // Gizli imlec (visible=false, x=0) eskiden sol kenarda dikey cizgi olarak kaliyordu.
        const axisHoverY = this._axisHoverCrosshairY();
        if (axisHoverY !== null) {
            // pointer over the price axis: price-only (horizontal) crosshair + axis label + "+" button
            this._paneWidget?.setCrosshair(null, axisHoverY);
            this._priceAxisWidget?.setCrosshair(axisHoverY, true);
            this._timeAxisWidget?.setCrosshair(0, false);
        } else if (crosshair && crosshair.visible) {
            this._paneWidget?.setCrosshair(crosshair.x, mainPaneLocalY);
            this._priceAxisWidget?.setCrosshair(mainPaneLocalY ?? 0, mainPaneLocalY !== null);
            this._timeAxisWidget?.setCrosshair(crosshair.x, crosshair.visible);
        } else {
            this._paneWidget?.setCrosshair(null, null);
            this._priceAxisWidget?.setCrosshair(0, false);
            this._timeAxisWidget?.setCrosshair(0, false);
        }

        this._updateLastPriceLabel();
        this._syncAlertAxisButton();
        this._applySpotAxis(crosshair?.visible ? crosshair.x : null, mainPaneLocalY);
        // Trend Line ailesi "Price labels": uc noktalarin fiyatlari eksende.
        // Eksen genisligi etiketlere gore hesaplandigi icin updateWidth()'ten ONCE verilir.
        // Spot modunda eksen kaydirilmis olcegi gosterir: etiket fiyati eksen birimine cevrilir
        // (fiyat - offset); eksen y'si ana olcekteki fiyatla ayni, metin eksenin gosterdigi deger olur.
        const axisScale = this._spotScale ?? this._model.rightPriceScale;
        const spotOffset = this._spotScale ? this._spotScale.offset : 0;
        const axisLabels: { price: number; text: string; color: string }[] = [];
        const timeLabels: { time: number; x: number; color: string }[] = [];
        for (const d of this._drawingManager.getDrawingsForPane(null)) {
            if (!d.visible || !hasAxisLabels(d)) continue;
            if (hasBarDataConsumer(d)) d.setBarData(this._model.serieses[0]?.data ?? []);
            if (hasPriceScaleConsumer(d)) {
                const rps = this._model.rightPriceScale;
                d.setPriceScale(
                    (price) => { const y = rps.priceToCoordinate(price) as number; return Number.isFinite(y) ? y : null; },
                    (y) => { const p = rps.coordinateToPrice(y as any) as number; return Number.isFinite(p) ? p : null; },
                );
            }
            const labels = d.getAxisLabels();
            for (const l of labels.prices) {
                const axisPrice = l.price - spotOffset;
                axisLabels.push({ price: axisPrice, text: axisScale.formatPrice(axisPrice), color: l.color });
            }
            // Zaman etiketleri (dikey/kesisim cizgi): x, cizimlerle ayni zaman->piksel donusumunden
            for (const l of labels.times) {
                const x = this._drawingManager.timeToPixel(l.time);
                if (x !== null) timeLabels.push({ time: l.time, x, color: l.color });
            }
        }
        this._timeAxisWidget?.setDrawingLabels(timeLabels);
        this._priceAxisWidget?.setDrawingLabels(axisLabels);
        this._priceAxisWidget?.setAlertLabels(this._alertLines?.sync() ?? []);
        this._drawingAlerts?.sync();
        if (this._priceAxisWidget?.updateWidth()) {
            this._updateLayout();
        }

        // Pass overlay indicators to pane widget for rendering
        this._paneWidget?.setOverlayIndicators(this._indicatorManager.overlayIndicators);

        // Pass heatmap renderer to pane widget
        this._paneWidget?.setHeatmapRenderer(this._heatmapRenderer);

        this._paneWidget?.render();

        // Render drawings on top of chart
        this._paneWidget?.renderDrawings(
            this._drawingManager.getDrawingsForPane(null),
            (time) => this._drawingManager.timeToPixel(time),
            // Ana paneldeki cizimler her zaman ana fiyat olcegiyle: drawingManager'in
            // olcegi fare hangi paneldeyse ona gecer (RSI'ye girince 0-100) ve
            // ana paneldeki Fib/trend cizgileri ekran disina kayip kayboluyordu.
            (price) => this._model.rightPriceScale.priceToCoordinate(price),
            this._drawingManager.hoveredForAddText,
            this._drawingManager.hoveredDrawingId
        );

        this._priceAxisWidget?.render();
        this._timeAxisWidget?.render();

        // Render indicator panes (RSI, MACD, etc.)
        this._renderIndicatorPanes();
        this._updateGainMetricsPanel();

        // Update main legend with overlay indicators only when needed
        // Removed call from here to prevent flickering on every draw

        // Measure box / zoom rectangle follow the scales: repaint the overlay with the chart
        this._interactionTools.requestRender();
    }

    private _updateGainMetricsPanel(): void {
        if (!this._gainMetricsPanel) {
            return;
        }

        const gainMetrics = this._indicatorManager.overlayIndicators.find(
            (indicator) => indicator instanceof DeMarkPivotIndicator && indicator.shown
        ) as DeMarkPivotIndicator | undefined;

        if (!gainMetrics) {
            this._gainMetricsPanel.style.display = 'none';
            this._gainMetricsPanel.innerHTML = '';
            return;
        }

        const rows = gainMetrics.getPivotSummaryRows();
        if (rows.length === 0) {
            this._gainMetricsPanel.style.display = 'none';
            this._gainMetricsPanel.innerHTML = '';
            return;
        }

        const content = rows.map((row) => `
            <div class="tv-gainmetrics-group">
                <div class="tv-gainmetrics-period">${row.label.toUpperCase()}</div>
                ${this._gainMetricsLine('DIRENC', row.values.r3, 'resistance')}
                ${this._gainMetricsLine('DIRENC', row.values.r2, 'resistance')}
                ${this._gainMetricsLine('DIRENC', row.values.r1, 'resistance')}
                ${this._gainMetricsLine('PIVOT', row.values.pp, 'pivot')}
                ${this._gainMetricsLine('DESTEK', row.values.s1, 'support')}
                ${this._gainMetricsLine('DESTEK', row.values.s2, 'support')}
                ${this._gainMetricsLine('DESTEK', row.values.s3, 'support')}
            </div>
        `).join('');

        this._gainMetricsPanel.innerHTML = `
            <div class="tv-gainmetrics-title">GainMetrics</div>
            ${content}
        `;
        this._gainMetricsPanel.style.display = 'block';
    }

    private _gainMetricsLine(label: string, value: number, type: 'resistance' | 'pivot' | 'support'): string {
        const formattedValue = Number.isFinite(value) ? this._formatGainMetricsValue(value) : '-';
        return `
            <div class="tv-gainmetrics-line tv-gainmetrics-${type}">
                <span class="tv-gainmetrics-label">${label} :</span>
                <span class="tv-gainmetrics-value">${formattedValue}</span>
            </div>
        `;
    }

    private _formatGainMetricsValue(value: number): string {
        if (Math.abs(value) >= 100) {
            return value.toFixed(2);
        }

        if (Math.abs(value) >= 1) {
            return value.toFixed(2);
        }

        return value.toFixed(4);
    }

    /**
     * Spot modu: ana fiyat ekseni ayni mumlar uzerinde spot sembolun (GC1 grafiginde
     * XAUUSD FOREXCOM) karsiligini gosterir. Eksen seviyeleri ve son fiyat en son
     * ortak mumdaki farkla, imlec etiketi fare altindaki mumun kendi farkiyla
     * hesaplanir. Mod kapaliysa ya da spot verisi henuz yoksa eksen normaldir.
     */
    private _applySpotAxis(crosshairX: number | null, localY: number | null): void {
        const axis = this._priceAxisWidget;
        if (!axis) return;
        const info = this._spotMode ? this._spotSource.axisInfo() : null;
        if (!info) {
            if (this._spotScale) {
                axis.setScale(this._model.rightPriceScale);
                axis.setTitle(null);
                this._paneWidget?.setPriceMarksSource(null);
                this._spotScale = null;
            }
            return;
        }
        if (!this._spotScale) {
            this._spotScale = new OffsetPriceScale(this._model.rightPriceScale);
            axis.setScale(this._spotScale);
            // Yatay izgara eksenin (kaydirilmis) seviyeleriyle hizali kalsin.
            this._paneWidget?.setPriceMarksSource(() => axis.marks());
        }
        const scale = this._spotScale;
        scale.offset = info.offset;
        axis.setTitle(info.title, SPOT_AXIS_COLOR);
        axis.setLastValue(info.lastPrice, scale.formatPrice(info.lastPrice), SPOT_AXIS_COLOR);

        if (localY !== null && crosshairX !== null) {
            const index = this._model.timeScale.coordinateToIndex(coordinate(crosshairX)) as number;
            const offset = info.offsetAt(index) ?? info.offset;
            const price = this._model.rightPriceScale.coordinateToPrice(coordinate(localY)) - offset;
            axis.setCrosshair(localY, true, scale.formatPrice(price));
        }
    }

    /** Spot veri kaynagini grafik sembolu/zaman dilimi/verisiyle esitler, toolbar dugmesini gunceller. */
    private _syncSpot(data?: BarData[]): void {
        const pair = SpotPriceSource.pairFor(this._model.symbol);
        // spot overlay has its own live data and ignores the replay cursor: suspended while replaying
        this._spotSource.setContext(this._model.symbol, this._model.timeframe, this._spotMode && pair !== null && !this._replay.active);
        if (data) this._spotSource.setSourceData(data);
        const state = `${pair ? pair.exchange : ''}|${this._spotMode}`;
        if (state !== this._spotButtonState) {
            this._spotButtonState = state;
            this._toolbarWidget?.setSpotButton(pair ? pair.exchange : null, this._spotMode);
            this._spotStateChanged.fire({ label: pair ? pair.exchange : null, active: this._spotMode });
        }
    }

    /** Spot toggle state of this chart (label = spot exchange, null when the symbol has no spot counterpart). */
    getSpotState(): { label: string | null; active: boolean } {
        const pair = SpotPriceSource.pairFor(this._model.symbol);
        return { label: pair ? pair.exchange : null, active: this._spotMode };
    }

    /** Fires when the spot button state of this chart changes (for a host-owned toolbar). */
    get spotStateChanged(): Delegate<{ label: string | null; active: boolean }> {
        return this._spotStateChanged;
    }

    /** Turns the spot price axis on/off for this chart. */
    setSpotMode(enabled: boolean): void {
        this._spotMode = enabled;
        writeSpotMode(enabled);
        const data = this._model.serieses[0]?.data as BarData[] | undefined;
        this._syncSpot(data && data.length > 0 && 'open' in data[0] ? data : undefined);
        this._scheduleDraw();
    }

    private _initSpotToggle(): void {
        if (!this._toolbarWidget) return;
        this._toolbarWidget.spotToggled.subscribe((enabled) => this.setSpotMode(enabled));
        this._syncSpot();
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

        this._priceAxisWidget.setLastValue(price, this._model.rightPriceScale.formatPrice(price), color);

        // Calculate and set countdown
        const countdown = this._calculateCountdown();
        this._priceAxisWidget.setCountdown(countdown);
    }

    /**
     * Calculate countdown until current candle closes
     */
    private _calculateCountdown(): string | null {
        const timeframe = this._model.timeframe;
        if (!timeframe) return null;
        // bar replay: the live countdown is meaningless (history), hidden until replay stops
        if (this._replay.active) return null;

        const now = Date.now();
        let remainingMs: number;
        if (timeframe === 'M' || timeframe === '1mo') {
            // Takvim ayi sabit sure degil; ayrica _parseTimeframeToMs "M"yi
            // (buyuk harf) kucuk harfe cevirip "m" = 1 DAKIKA sanardi.
            const d = new Date(now);
            remainingMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - now;
        } else {
            // Parse timeframe to milliseconds
            const intervalMs = this._parseTimeframeToMs(timeframe);
            if (intervalMs === 0) return null;

            // Calculate next candle close time
            const currentCandleStart = Math.floor(now / intervalMs) * intervalMs;
            const nextCandleStart = currentCandleStart + intervalMs;
            remainingMs = nextCandleStart - now;
        }

        if (remainingMs <= 0) return null;

        // Format countdown
        const totalSeconds = Math.floor(remainingMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Parse timeframe string to milliseconds
     */
    private _parseTimeframeToMs(tf: string): number {
        const lower = tf.toLowerCase();

        // Handle formats like "1m", "5m", "15m", "1h", "4h", "1d", "1w"
        const match = lower.match(/^(\d+)([smhdw])$/);
        if (match) {
            const value = parseInt(match[1], 10);
            const unit = match[2];

            switch (unit) {
                case 's': return value * 1000;
                case 'm': return value * 60 * 1000;
                case 'h': return value * 60 * 60 * 1000;
                case 'd': return value * 24 * 60 * 60 * 1000;
                case 'w': return value * 7 * 24 * 60 * 60 * 1000;
            }
        }

        // Handle single letter formats
        if (lower === 'd') return 24 * 60 * 60 * 1000;
        if (lower === 'w') return 7 * 24 * 60 * 60 * 1000;
        if (lower === 'm') return 60 * 1000;
        if (lower === 'h') return 60 * 60 * 1000;

        return 0;
    }

    // --- Context Menu Actions ---

    private _onContextSettings(): void {
        this._openChartSettings();
    }

    private _openChartSettings(): void {
        const series = this._model.serieses[0];
        if (!series || !this._chartSettingsModal) {
            return;
        }

        if (series instanceof CandlestickSeries) {
            const options = series.candleOptions;
            this._chartSettingsModal.showCandlestick({
                upColor: options.upColor,
                downColor: options.downColor,
                wickUpColor: options.wickUpColor,
                wickDownColor: options.wickDownColor,
                borderUpColor: options.borderUpColor,
                borderDownColor: options.borderDownColor,
                wickVisible: options.wickVisible,
                borderVisible: options.borderVisible,
            }, (next) => {
                this._candlestickStyleOverrides = { ...next };
                series.applyOptions(next);
                this._scheduleDraw();
            });
            return;
        }

        if (series instanceof HeikenAshiSeries) {
            const options = series.haOptions;
            this._chartSettingsModal.showHeikenAshi({
                upColor: options.upColor,
                downColor: options.downColor,
                wickVisible: options.wickVisible,
                borderVisible: options.borderVisible,
            }, (next) => {
                this._heikenAshiStyleOverrides = { ...next };
                series.applyOptions(next);
                this._scheduleDraw();
            });
            return;
        }

        this._chartSettingsModal.showUnsupported('Bu ayar su anda sadece mum ve Heiken Ashi grafiklerinde kullanilabilir.');
    }

    private _onContextCopyPrice(): void {
        handleContextCopyPrice(this._model);
    }

    private _onContextScreenshot(): void {
        // Collect indicator panes data for screenshot
        const indicatorPanesData: { canvas: HTMLCanvasElement | null; height: number }[] = [];
        for (const pane of this._indicatorPanes.values()) {
            indicatorPanesData.push({
                canvas: pane.canvas,
                height: pane.height
            });
        }

        handleContextScreenshot(
            this._model,
            this._paneWidget,
            this._priceAxisWidget,
            this._timeAxisWidget,
            indicatorPanesData
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
        // Pane varsayilan (koyu) renklerle olusur; setTheme sadece tema DEGISINCE
        // cagrildigi icin acik temada yeni eklenen panel koyu kaliyordu.
        pane.setTheme(this._currentTheme);
        pane.setGridOptions(this._model.options.grid);
        pane.setCrosshairOptions(this._model.options.crosshair);
        if (this._bgCustomized) this._applyBackground();

        // Add interaction event listeners
        const canvas = pane.canvas;
        if (canvas) {
            canvas.addEventListener('wheel', this._onWheel.bind(this), { passive: false });
            canvas.addEventListener('mousedown', this._onMouseDown.bind(this));
            canvas.addEventListener('mousemove', this._onPaneMouseMove.bind(this));
            canvas.addEventListener('mouseleave', this._onMouseLeave.bind(this));

            // Touch events for mobile
            canvas.addEventListener('touchstart', this._onTouchStart.bind(this), { passive: false });
            canvas.addEventListener('touchmove', this._onTouchMove.bind(this), { passive: false });
            canvas.addEventListener('touchend', this._onTouchEnd.bind(this), { passive: false });
            canvas.addEventListener('touchcancel', this._onTouchEnd.bind(this), { passive: false });
        }

        // Ensure redraw when indicator price scale changes (e.g. during Y-axis drag)
        pane.priceScale.rangeChanged.subscribe(() => {
            this._scheduleDraw();
        });

        // Legend buttons / menu of the sub-pane row
        pane.onLegendAction = (action, ind, point) => this._onLegendAction(action, ind, point);
        pane.onPaneAction = (action, ind) => this._onPaneAction(action, ind);
        pane.onSeparatorDrag = (phase, y) => this._onPaneSeparatorDrag(indicator.id, phase, y);
        const savedHeight = this._savedPaneHeights[indicator.id];
        if (typeof savedHeight === 'number' && savedHeight > 0) pane.setHeight(savedHeight);

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
        this._collapsedPanes.delete(indicator.id);
        delete this._savedPaneHeights[indicator.id];
        if (this._maximizedPane === indicator.id) this._maximizedPane = null;

        this._updateLayout();
        this._scheduleDraw();
    }

    /**
     * Open settings modal for an indicator
     */
    /** Indicator legend actions (main pane and sub-panes share this) */
    private _onLegendAction(action: LegendAction, indicator: Indicator, point: LegendPoint): void {
        switch (action) {
            case 'toggle':
                indicator.setVisible(!indicator.visible);
                this._scheduleDraw();
                this._chartStateManager?.requestSave();
                break;
            case 'settings':
                this._openIndicatorSettings(indicator);
                break;
            case 'remove':
                this._indicatorManager.removeIndicator(indicator.id);
                this._scheduleDraw();
                break;
            case 'more':
                this._showIndicatorMenu(indicator, point);
                break;
        }
    }

    /** "More" menu of a legend row (also opened by right-click on the row) */
    private _showIndicatorMenu(indicator: Indicator, point: LegendPoint): void {
        const menu = this._drawingContextMenu;
        if (!menu) return;
        if (menu.isVisible()) menu.hide();
        this._contextMenu?.hide();
        const manager = this._indicatorManager;
        const id = indicator.id;
        const redraw = () => { this._scheduleDraw(); this._chartStateManager?.requestSave(); };
        const items: ContextMenuItem[] = [
            {
                id: 'toggle',
                label: indicator.visible ? t('Hide') : t('Show'),
                icon: indicator.visible ? LEGEND_ICONS.eyeOff : LEGEND_ICONS.eye,
                action: () => { indicator.setVisible(!indicator.visible); redraw(); },
            },
            { id: 'settings', label: t('Settings...'), icon: LEGEND_ICONS.settings, action: () => this._openIndicatorSettings(indicator) },
            { id: 'clone', label: t('Clone'), icon: LEGEND_ICONS.clone, action: () => { manager.duplicateIndicator(id); redraw(); } },
        ];
        const alertEntry = this.alertIndicators().find((e) => e.ref.instanceId === id);
        if (alertEntry && alertCatalogId(manager.typeIdOf(indicator))) {
            items.push({
                id: 'add-alert',
                label: t('Add alert on {label}...').replace('{label}', alertEntry.ref.label),
                icon: ALERT_MENU_ICON,
                action: () => this.openIndicatorAlert(indicator),
            });
        }
        if (indicator.type === IndicatorType.Overlay) {
            items.push(
                { id: 'sep1', label: '', separator: true },
                {
                    id: 'order',
                    label: t('Visual order'),
                    submenu: true,
                    children: [
                        { id: 'order-front', label: t('Bring to front'), action: () => { if (manager.moveOverlayIndicator(id, 'front')) redraw(); } },
                        { id: 'order-back', label: t('Send to back'), action: () => { if (manager.moveOverlayIndicator(id, 'back')) redraw(); } },
                    ],
                },
            );
        }
        items.push(
            { id: 'sep2', label: '', separator: true },
            { id: 'remove', label: t('Remove'), icon: LEGEND_ICONS.remove, action: () => { manager.removeIndicator(id); redraw(); } },
        );
        menu.setItems(items);
        menu.setTheme(this._currentTheme === 'light' ? 'light' : 'dark');
        if (point.rect) menu.showAnchored(point.rect);
        else menu.show(point.x, point.y);
    }

    private _openIndicatorSettings(ind: any): void {
        this._editingIndicator = ind;

        // Check if indicator has modular settings (implements getSettingsConfig)
        if (typeof ind.getSettingsConfig === 'function') {
            this._indicatorSettingsModal?.setTheme(this._currentTheme === 'light' ? 'light' : 'dark');
            this._indicatorSettingsModal?.showForIndicator(ind, {
                typeId: this._indicatorManager.typeIdOf(ind),
                getTimeframe: () => this._model.timeframe,
            });
        } else {
            console.warn('Indicator does not implement getSettingsConfig:', ind.name);
        }
    }

    private _renderIndicatorPanes(): void {
        const crosshair = this._visibleCrosshair();

        const mainSeries = this._model.serieses[0];

        // A pane whose indicators are all hidden on this timeframe collapses (and returns with the timeframe)
        const hiddenSig = this._orderedPanes().map(({ id, pane }) => `${id}:${this._isPaneHiddenNow(pane) ? 1 : 0}`).join('|');
        if (hiddenSig !== this._paneHiddenSig) {
            this._paneHiddenSig = hiddenSig;
            this._updateLayout();
        }

        for (const [paneId, pane] of this._indicatorPanes.entries()) {
            if (this._isPaneHiddenNow(pane)) continue;
            if (crosshair && crosshair.visible) {
                // X is synchronized (time axis)
                // Y is only shown if the mouse is actually over THIS specific pane
                const paneElement = pane.element;
                let localY: number | null = null;

                if (paneElement && this._lastMouseY !== 0 && !(this._crosshairSyncEnabled && !this._pointerInside)) {
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

            pane.setChartData(mainSeries?.data ?? []);
            pane.render();
            pane.renderDrawings(
                this._drawingManager.getDrawingsForPane(paneId),
                (time) => this._drawingManager.timeToPixel(time),
                (price) => pane.priceScale.priceToCoordinate(price),
                null
            );
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
        if (!isIndicatorAllowed(getIndicatorAccess(), indicatorId)) return;
        const before = new Set<Indicator>(this._indicatorManager.allIndicators);
        this._createIndicatorById(indicatorId);
        // "Save as default" values of the indicator type apply to what was just added
        for (const ind of this._indicatorManager.allIndicators) {
            if (before.has(ind)) continue;
            const typeId = this._indicatorManager.typeIdOf(ind);
            if (applySavedDefaults(withCommonSettings(ind), safeLocalStorage(), typeId)) {
                ind.recalculate();
            }
        }
        this._scheduleDraw();
    }

    private _createIndicatorById(indicatorId: string): void {
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
            case 'sar':
                this.addOverlayIndicator(new ParabolicSARIndicator({ start: 0.02, increment: 0.02, maximum: 0.20 }));
                break;
            case 'supertrend':
                this.addOverlayIndicator(new SuperTrendIndicator({
                    period: 10,
                    multiplier: 3,
                    changeATR: true,
                    showSignals: true,
                    highlighting: true,
                }));
                break;
            case 'alphatrend':
                this.addOverlayIndicator(new AlphaTrendIndicator({
                    multiplier: 1,
                    commonPeriod: 14,
                    showSignals: true,
                    noVolumeData: false,
                }));
                break;
            case 'ichimoku':
                this.addOverlayIndicator(new IchimokuIndicator({
                    conversionPeriods: 9,
                    basePeriods: 26,
                    laggingSpan2Periods: 52,
                    displacement: 26,
                }));
                break;
            case 'fixed-range-volume-profile':
                this.addOverlayIndicator(new FixedRangeVolumeProfileIndicator({
                    rangeBars: 200,
                    rows: 32,
                    valueAreaPercent: 70,
                    profileWidthPercent: 35,
                    showPOC: true,
                    showValueArea: true,
                }));
                break;
            case 'halftrend':
                this.addOverlayIndicator(new HalfTrendIndicator({
                    amplitude: 2,
                    channelDeviation: 2,
                    showArrows: true,
                    showChannels: true,
                    showLabels: true,
                }));
                break;
            case 'volume':
                this.addOverlayIndicator(new VolumeIndicator());
                break;
            case 'hma':
                this.addOverlayIndicator(new HMAIndicator({ period: 9 }));
                break;
            case 'stochrsi':
                this.addIndicator(new StochRSIIndicator({ rsiPeriod: 14, stochPeriod: 14, kPeriod: 3, dPeriod: 3 }));
                break;
            case 'tdoji':
                this.addIndicator(new TdojiOscillatorIndicator({
                    curveLength: 144,
                    slopeLength: 5,
                    signalLength: 21,
                }));
                break;
            case 'thunderbirdx':
                this.addIndicator(new ThunderbirdxIndicator());
                break;
            case 'tdoji-sr':
                this.addOverlayIndicator(new TdojiSRIndicator());
                break;
            case 'demark-pivot':
                this.addOverlayIndicator(new DeMarkPivotIndicator({
                    timeframe: 'D',
                    showPivots: true,
                    showObv: false,
                }));
                break;
            case 'tdoji-mom':
                this.addIndicator(new TdojiMomIndicator({ period: 60 }));
                break;
            case 'zigzag':
                this.addOverlayIndicator(new ZigZagIndicator({
                    period: 15,
                }));
                break;
            case 'abcd-pattern':
                this.addOverlayIndicator(new ABCDPatternIndicator({
                    period: 15,
                }));
                break;
            case 'harmonic-patterns':
                this.addOverlayIndicator(new HarmonicPatternIndicator({
                    period: 15,
                    showABCD: true,
                    showGartley: true,
                }));
                break;
            case 'chart-patterns':
                this.addOverlayIndicator(new ChartPatternsIndicator({
                    period: 15,
                    showDoubleTop: true,
                    showDoubleBottom: true,
                    showBullPennant: true,
                    showBearPennant: true,
                    showBullFlag: true,
                    showBearFlag: true,
                    showBullWedgeCont: true,
                    showBearWedgeCont: true,
                    showBullWedgeRev: true,
                    showBearWedgeRev: true,
                    showHeadAndShoulders: true,
                    showInverseHeadAndShoulders: true,
                    showCupAndHandle: true,
                    showAscendingTriangle: true,
                    showPrediction: true,
                    showHistory: false,
                }));
                break;
            case 'zigzag-trendline':
                this.addOverlayIndicator(new ZigZagTrendlineIndicator({
                    period: 15,
                    pivotCount: 2,
                    showHistory: false,
                }));
                break;
            case 'trendline-breakout':
                this.addOverlayIndicator(new TrendlineBreakoutIndicator({
                    period: 20,
                    useLength8: true,
                    useLength10: true,
                    useLength15: true,
                    useLength30: true,
                    volumeSpikeMultiplier: 1,
                    showHistory: false,
                    showBullBreakout: true,
                    showBearBreakdown: true,
                }));
                break;
            case 'smc':
                this.addOverlayIndicator(new SMCIndicator({
                    period: 15,
                }));
                break;
            case 'special-forces':
                this.addOverlayIndicator(new SpecialForcesIndicator({
                    symbol: this._model.symbol,
                    exchange: this._currentExchange,
                }));
                break;
            case 'bobbin':
                this.addOverlayIndicator(new BobbinIndicator({}));
                break;
            case 'fvg':
                this.addOverlayIndicator(new FVGIndicator({}));
                break;
            case 'fvg-inversion':
                this.addOverlayIndicator(new FvgInversionIndicator({}));
                break;
            case 'eqhl-v2':
                this.addOverlayIndicator(new EqHLIndicatorV2({}));
                break;
            case 'judas-swing':
                this.addOverlayIndicator(new JudasSwingIndicator({}));
                break;
            case 'smt-divergence':
                this.addOverlayIndicator(new SMTDivergenceIndicator({}));
                break;

            default:
                console.warn(`Unknown indicator: ${indicatorId}`);
        }
    }

    /**
     * Public API: Add an indicator to the chart
     */
    addIndicator(indicator: PanelIndicator): void {
        if (!this._indicatorManager.isAllowed(indicator)) return;
        this._indicatorManager.addPanelIndicator(indicator);
        this._wireIndicatorEvents(indicator);
        // Backend'de hesaplanan indikatorler sembol/zaman dilimini ilk hesaptan ONCE bilmeli.
        this._pushIndicatorContext();

        const data = this._indicatorManager.sourceData as BarData[];
        if (data.length > 0 && indicator.data.length === 0) {
            indicator.calculate([...data]);
        }
    }

    /**
     * Public API: Add an overlay indicator to the chart (drawn on main chart)
     */
    addOverlayIndicator(indicator: OverlayIndicator): void {
        if (!this._indicatorManager.isAllowed(indicator)) return;
        this._indicatorManager.addOverlayIndicator(indicator);
        this._wireIndicatorEvents(indicator);
        // Backend'de hesaplanan indikatorler sembol/zaman dilimini ilk hesaptan ONCE bilmeli.
        this._pushIndicatorContext();

        const data = this._indicatorManager.sourceData as BarData[];
        if (data.length > 0 && indicator.data.length === 0) {
            indicator.calculate([...data]);
        }


        // Trigger redraw
        this._scheduleDraw();
    }

    private _wireExistingIndicators(): void {
        for (const indicator of this._indicatorManager.allIndicators) {
            this._wireIndicatorEvents(indicator);
        }

        this._updateMainLegend();
        this._scheduleDraw();
    }

    private _wireIndicatorEvents(indicator: Indicator): void {
        if (this._wiredIndicators.has(indicator)) {
            return;
        }

        this._wiredIndicators.add(indicator);
        const rowSig = () => indicatorRowSignature(indicator.name || indicator.options?.name || 'Indicator', indicator.visible);
        let lastRowSig = rowSig();
        indicator.dataChanged.subscribe(() => {
            this._updateMainLegend();
            // Canli tick'te agac yalnizca satir durumu (ad/gorunurluk) degistiyse yenilenir
            const sig = rowSig();
            if (sig !== lastRowSig) {
                lastRowSig = sig;
                this._objectTreePanel?.refresh();
            }
            this._scheduleDraw();
        });
    }

    /** Text editoru icin cizimin bulundugu pane'in canvas'i (gosterge pane'i veya ana pane) */
    private _getTextEditorCanvas(d: Drawing): HTMLCanvasElement | null {
        const paneId = d.paneId;
        if (paneId && this._indicatorPanes.has(paneId)) return this._indicatorPanes.get(paneId)?.canvas ?? null;
        return this._paneWidget?.canvas ?? null;
    }

    // --- Cleanup ---

    dispose(): void {
        if (_keyboardActiveChart === this) _keyboardActiveChart = null;
        document.removeEventListener('keydown', this._boundKeyDown);
        window.removeEventListener('keypress', this._boundKeyPress);
        this._replayUI?.dispose();
        this._replayUI = null;
        this._replay.dispose();
        this._unsubscribeIndicatorAccess?.();
        this._unsubscribeIndicatorAccess = null;
        // Yarim kalan yeni Text (bos) model yok edilmeden kaldirilir; yazilmis metin kaydedilir
        this._textEditor?.close(true);
        this._textEditor?.dispose();
        this._textEditor = null;
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
        this._model.destroy();
        this._symbolChanged.destroy();
        this._crosshairMoved.destroy();
        this._timeframeChanged.destroy();
        this._indicatorManager.destroy();

        // Dispose indicator panes
        for (const pane of this._indicatorPanes.values()) {
            pane.dispose();
        }
        this._indicatorPanes.clear();

        this._watchlistPanel?.destroy();
        this._watchlistPanel = null;
        this._alertsPanel?.destroy();
        this._alertsPanel = null;
        this._objectTreePanel?.destroy();
        this._objectTreePanel = null;
        this._toolbarWidget?.dispose();
        this._drawingToolbarBinding?.detach();
        this._drawingToolbarWidget?.dispose();
        this._interactionTools.dispose();
        this._symbolSearch?.dispose();
        this._indicatorSearchModal?.dispose();
        this._chartSettingsModal?.dispose();
        this._paneWidget?.dispose();
        this._priceAxisWidget?.dispose();
        this._spotSource.destroy();
        this._timeAxisWidget?.dispose();
        this._contextMenu?.dispose();
        this._drawingContextMenu?.dispose();
        this._alertAxisMenu?.dispose();
        this._alertLines?.dispose();
        this._alertLines = null;
        this._drawingAlerts?.dispose();
        this._drawingAlerts = null;

        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }

        this._element = null;
        this._chartRow = null;
        this._timeAxisRow = null;
        this._indicatorContainer = null;
    }

    private _createContextMenu(): void {
        this._drawingContextMenu?.dispose();
        this._drawingContextMenu = new ContextMenu({ items: [], theme: this._currentTheme === 'light' ? 'light' : 'dark' });
        if (document.fullscreenElement === this._element && this._element) {
            this._drawingContextMenu.setContainer(this._element);
        }
        this._contextMenu = new ContextMenu({
            items: this._buildChartMenuItems(),
            theme: this._currentTheme === 'light' ? 'light' : 'dark'
        });
    }

    private static _modKey(): string {
        return /Mac|iPhone|iPad/.test(navigator.platform) ? '\u2318' : 'Ctrl+';
    }

    /** Bos alan (grafik) baglam menusu ogeleri; Paste/Undo/Redo durumu her acilista yenilenir */
    private _buildChartMenuItems(price?: number): ContextMenuItem[] {
        const mod = ChartWidget._modKey();
        const alertItems: ContextMenuItem[] = price !== undefined && isFinite(price) ? [
            {
                id: 'add-alert',
                label: this._addAlertLabel(price),
                icon: ALERT_MENU_ICON,
                shortcut: '\u2325 A',
                action: () => this.openAlertDialogAt(price),
            },
            { id: 'sep-alert', label: '', separator: true },
        ] : [];
        const dm = this._drawingManager;
        const hiddenCount = dm.hiddenDrawingCount;
        const showHiddenItems: ContextMenuItem[] = hiddenCount > 0 ? [{
            id: 'show-hidden',
            label: `${t('Show hidden drawings')} (${hiddenCount})`,
            action: () => { dm.showHiddenDrawings(); this._scheduleDraw(); }
        }] : [];
        return [
                ...alertItems,
                {
                    id: 'reset',
                    label: t('Reset chart view'),
                    icon: ICONS.reset,
                    shortcut: '⌥ R',
                    action: () => this._onContextResetChart()
                },
                { id: 'sep1', label: '', separator: true },
                {
                    id: 'copy-price',
                    label: t('Copy price'),
                    icon: ICONS.copy,
                    action: () => this._onContextCopyPrice()
                },
                { id: 'sep-edit', label: '', separator: true },
                ...showHiddenItems,
                {
                    id: 'paste',
                    label: t('Paste'),
                    shortcut: `${mod}V`,
                    disabled: !dm.hasClipboard,
                    action: () => { dm.pasteFromClipboard(); this._scheduleDraw(); }
                },
                {
                    id: 'undo',
                    label: t('Undo'),
                    shortcut: `${mod}Z`,
                    disabled: !dm.canUndo,
                    action: () => { dm.undo(); this._scheduleDraw(); }
                },
                {
                    id: 'redo',
                    label: t('Redo'),
                    shortcut: `${mod}Y`,
                    disabled: !dm.canRedo,
                    action: () => { dm.redo(); this._scheduleDraw(); }
                },
                { id: 'sep2', label: '', separator: true },
                {
                    id: 'screenshot',
                    label: t('Take a snapshot'),
                    icon: ICONS.screenshot,
                    shortcut: '⌥ S',
                    action: () => this._onContextScreenshot()
                },
                {
                    id: 'fullscreen',
                    label: t('Fullscreen'),
                    icon: ICONS.fullscreen,
                    action: () => this._onContextFullscreen()
                },
                ...(this._objectTreePanel ? [{
                    id: 'object-tree',
                    label: t('Object tree'),
                    action: () => this.toggleObjectTree()
                }] : []),
                { id: 'sep3', label: '', separator: true },
                {
                    id: 'settings',
                    label: t('Settings...'),
                    icon: ICONS.settings,
                    action: () => this._onContextSettings()
                }
        ];
    }

    private _showChartContextMenu(clientX: number, clientY: number, price: number): void {
        this._drawingContextMenu?.hide();
        this._drawingManager.setActivePaneId(null);
        this._contextMenu?.setItems(this._buildChartMenuItems(price));
        this._contextMenu?.setCurrentPrice(price);
        this._contextMenu?.show(clientX, clientY);
    }

    /** Sag tiklanan noktadaki cizimi (sol tik ile ayni hit-test) secer ve dondurur */
    private _getDrawingForContextMenu(clientX: number, clientY: number, target: EventTarget | null): Drawing | null {
        if (this._drawingManager.mode !== 'none' || !(target instanceof Node)) {
            return null;
        }

        const mainCanvas = this._paneWidget?.canvas ?? null;
        const candidates: Array<{ paneId: string | null; canvas: HTMLCanvasElement | null; element: HTMLElement | null; priceScale: PriceScale }> = [
            { paneId: null, canvas: mainCanvas, element: this._paneWidget?.element ?? null, priceScale: this._model.rightPriceScale },
        ];
        for (const [indicatorId, pane] of this._indicatorPanes.entries()) {
            candidates.push({ paneId: indicatorId, canvas: pane.canvas, element: pane.element ?? null, priceScale: pane.priceScale });
        }

        for (const c of candidates) {
            if (!c.canvas || !(target === c.canvas || c.element?.contains(target))) continue;
            const rect = c.canvas.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = clientY - rect.top;
            if (x < 0 || x > rect.width || y < 0 || y > rect.height) return null;
            this._setInteractionPane(c.paneId, c.canvas, c.priceScale);
            return this._drawingManager.selectDrawingAt(x, y, c.paneId);
        }
        return null;
    }

    /** Ayar degisikligini tek cizim kimligiyle birlestirilebilir gecmis kaydi olarak ekler */
    private _commitSettingsHistory(drawing: Drawing | null): void {
        if (!drawing) return;
        this._drawingManager.commitSettingsChange(drawing.id);
    }

    /** Cizim ayar modali; mevcut zaman dilimi (gorunurluk hazir ayarlari icin) modala iletilir */
    private _createDrawingSettingsModal(drawing: Drawing) {
        const modal = createSettingsModal(this._element!, drawing);
        modal.setTimeframe(this._model.timeframe);
        return modal;
    }

    private _openDrawingSettings(drawing: Drawing): void {
        if (!this._element) return;
        if (this._drawingSettingsModal) {
            this._drawingSettingsModal.hide();
        }
        this._drawingSettingsModal = this._createDrawingSettingsModal(drawing);
        this._drawingSettingsModal.setTheme(this._currentTheme);
        this._drawingSettingsModal.settingsChanged.subscribe(() => {
            this._commitSettingsHistory(drawing);
            this._scheduleDraw();
        });
        this._drawingSettingsModal.show(drawing);
    }

    private _showDrawingContextMenu(drawing: Drawing, clientX: number, clientY: number): void {
        if (!this._drawingContextMenu) return;
        const dm = this._drawingManager;
        const mod = ChartWidget._modKey();
        const id = drawing.id;
        const redraw = () => this._scheduleDraw();

        this._contextMenu?.hide();
        this._drawingContextMenu.setItems([
            { id: 'settings', label: t('Settings...'), icon: ICONS.settings, action: () => this._openDrawingSettings(drawing) },
            ...(isAlertableDrawing(drawing) ? [{
                id: 'add-alert',
                label: t('Add alert on {label}...').replace('{label}', alertDrawingLabel(drawing.type)),
                icon: ALERT_MENU_ICON,
                action: () => this.openDrawingAlert(drawing),
            }] : []),
            { id: 'sep1', label: '', separator: true },
            { id: 'clone', label: t('Clone'), shortcut: `${mod}drag`, action: () => { dm.duplicateDrawing(id); redraw(); } },
            { id: 'copy', label: t('Copy'), icon: ICONS.copy, shortcut: `${mod}C`, action: () => { dm.copySelected(); } },
            { id: 'paste', label: t('Paste'), shortcut: `${mod}V`, disabled: !dm.hasClipboard, action: () => { dm.pasteFromClipboard(); redraw(); } },
            { id: 'sep2', label: '', separator: true },
            { id: 'front', label: t('Bring to front'), action: () => { dm.bringToFront(id); redraw(); } },
            { id: 'back', label: t('Send to back'), action: () => { dm.sendToBack(id); redraw(); } },
            { id: 'sep3', label: '', separator: true },
            {
                id: 'intervals',
                label: t('Visibility on intervals'),
                submenu: true,
                children: ([
                    ['all', 'All intervals'],
                    ['current', 'Current interval only'],
                    ['above', 'Current interval and above'],
                    ['below', 'Current interval and below'],
                ] as const).map(([preset, label]) => ({
                    id: `intervals-${preset}`,
                    label: t(label),
                    action: () => { dm.applyIntervalsPreset(id, preset); redraw(); },
                })),
            },
            {
                id: 'lock',
                label: drawing.locked ? t('Unlock') : t('Lock'),
                action: () => { dm.setDrawingLocked(id, !drawing.locked); redraw(); }
            },
            { id: 'hide', label: t('Hide'), action: () => { dm.setDrawingVisible(id, false); redraw(); } },
            { id: 'delete', label: t('Delete'), shortcut: 'Del', action: () => { dm.deleteDrawing(id); redraw(); } },
            { id: 'sep4', label: '', separator: true },
            { id: 'undo', label: t('Undo'), shortcut: `${mod}Z`, disabled: !dm.canUndo, action: () => { dm.undo(); redraw(); } },
            { id: 'redo', label: t('Redo'), shortcut: `${mod}Y`, disabled: !dm.canRedo, action: () => { dm.redo(); redraw(); } },
        ]);
        this._drawingContextMenu.show(clientX, clientY);
    }

    /** Attribute bar "..." menu: Clone / Copy / Visual order / Visibility on intervals, anchored below the button */
    private _showBarMoreMenu(drawing: Drawing, anchor: DOMRect): void {
        const menu = this._drawingContextMenu;
        if (!menu) return;
        if (menu.isVisible()) { menu.hide(); return; }
        const dm = this._drawingManager;
        const mod = ChartWidget._modKey();
        const id = drawing.id;
        const redraw = () => this._scheduleDraw();

        this._contextMenu?.hide();
        menu.setItems([
            { id: 'clone', label: t('Clone'), shortcut: `${mod}Drag`, action: () => { dm.duplicateDrawing(id); redraw(); } },
            { id: 'copy', label: t('Copy'), icon: ICONS.copy, shortcut: `${mod}C`, action: () => { dm.copySelected(); } },
            { id: 'sep1', label: '', separator: true },
            {
                id: 'order',
                label: t('Visual order'),
                submenu: true,
                children: [
                    { id: 'front', label: t('Bring to front'), action: () => { dm.bringToFront(id); redraw(); } },
                    { id: 'back', label: t('Send to back'), action: () => { dm.sendToBack(id); redraw(); } },
                ],
            },
            {
                id: 'intervals',
                label: t('Visibility on intervals'),
                submenu: true,
                children: ([
                    ['all', 'All intervals'],
                    ['current', 'Current interval only'],
                    ['above', 'Current interval and above'],
                    ['below', 'Current interval and below'],
                ] as const).map(([preset, label]) => ({
                    id: `intervals-${preset}`,
                    label: t(label),
                    action: () => { dm.applyIntervalsPreset(id, preset); redraw(); },
                })),
            },
        ]);
        menu.setContainer(getPopoverHost());
        menu.showAnchored(anchor);
    }

    private _onLanguageChange(lang: string): void {
        console.log('🌐 Language changed to:', lang);
        setLanguage(lang as any);

        // Refresh rating
        if (this._technicalRatingBadge && this._model) {
            this._technicalRatingBadge.updateRating(this._model.symbol, this._model.timeframe, this._currentExchange);
        }

        // Re-create context menu
        this._contextMenu = null;
        this._createContextMenu();

        // Re-create drawing toolbar to update tooltips
        if (this._showDrawingToolbar) {
            this._createDrawingToolbar();
        }

        // Re-create top toolbar
        if (this._showToolbar) {
            this._createTopToolbar();
        }

        // Re-create symbol search modal
        if (this._symbolSearch) {
            const oldSearch = this._symbolSearch;
            this._symbolSearch = this._createSymbolSearch();
            // Remove old modal from DOM if it exists
            oldSearch.dispose();
        }

        // Re-apply current theme to ensure new widgets match the theme
        this.setTheme(this._currentTheme);
    }

    private _createTopToolbar(): void {
        if (this._toolbarWidget) {
            this._toolbarWidget.dispose();
        }

        // Create toolbar (inserts at top)
        this._toolbarWidget = new ToolbarWidget(this._element!, {
            symbol: this._model.symbol,
            timeframe: this._model.timeframe,
            chartType: this._activeChartType,
            locale: getCurrentLanguage(),
            priceScaleMode: this._model.rightPriceScale.mode === PriceScaleMode.Logarithmic
                ? 'logarithmic'
                : 'normal',
            timezone: this._timeAxisWidget ? this._timeAxisWidget.timezone : this._resolveInitialTimezone(),
        });

        this._createWatchlist();
        this._createAlertsPanel();
        this._createObjectTree();
        this._initSpotToggle();

        this._toolbarWidget.replayClicked.subscribe(() => this._onReplayButton());
        this._toolbarWidget.alertClicked.subscribe(() => this.openAlertDialogAt());
        this._toolbarWidget.setReplayActive(this._replay.state.active || this._replay.state.selecting);

        // Listen for language changes
        this._toolbarWidget.languageChanged.subscribe((lang: string) => {
            this._onLanguageChange(lang);
        });

        // Listen for timezone changes
        this._toolbarWidget.timezoneChanged.subscribe((timezone: string) => {
            this.setTimezone(timezone);
        });

        // Listen for theme changes
        this._toolbarWidget.themeToggled.subscribe((theme: 'dark' | 'light') => {
            this.setTheme(theme);
        });

        // Connect toolbar events
        this._toolbarWidget.timeframeChanged.subscribe((tf) => {
            this._onTimeframeChange(tf);
        });

        this._toolbarWidget.chartTypeChanged.subscribe((type) => {
            this._onChartTypeChange(type);
        });

        this._toolbarWidget.priceScaleModeChanged.subscribe((mode) => {
            this._onPriceScaleModeChange(mode);
        });

        this._toolbarWidget.symbolClicked.subscribe(() => {
            this._symbolSearch?.show();
        });

        this._toolbarWidget.indicatorsClicked.subscribe(() => {
            this._indicatorSearchModal?.show();
        });

        // DOM toggle
        this._toolbarWidget.domToggled.subscribe((enabled) => {
            if (this._heatmapRenderer) {
                this._heatmapRenderer.enabled = enabled;

                if (enabled) {
                    // Subscribe
                    this._dataProvider?.subscribeOrderbook(this._currentSymbol, this._onOrderbookUpdate);
                } else {
                    // Unsubscribe
                    if (this._dataProvider instanceof BinanceSpotProvider) {
                        this._dataProvider.unsubscribeOrderbook(this._currentSymbol);
                    } else {
                        (this._dataProvider as any)?.unsubscribeOrderbook?.(this._currentSymbol);
                    }
                }

                this._scheduleDraw();
            }
        });
    }

    private _createDrawingToolbar(): void {
        if (!this._showDrawingToolbar) {
            return;
        }

        if (this._drawingToolbarWidget) {
            this._drawingToolbarWidget.dispose();
        }

        this._drawingToolbarWidget = new DrawingToolbarWidget(this._element!);
        this._drawingToolbarBinding?.detach();
        // Wiring (tools, magnet, lock / hide, object tree ...) lives in the adapter shared with MultiChartLayout
        this._drawingToolbarBinding = new DrawingToolbarBinding(this._drawingToolbarWidget, {
            getActive: () => this,
            getAll: () => [this],
        });
    }
}

/**
 * Create a new chart widget
 */
export function createChart(
    container: HTMLElement | string,
    options?: ChartWidgetOptions
): ChartWidget {
    return new ChartWidget(container, options);
}
