import { Delegate } from '../helpers/delegate';
import { t } from '../helpers/translations';
import { ChartModelOptions } from '../model/chart-model';
import { ChartWidget } from './chart-widget';
import { SymbolInfo } from './symbol_search';
import { DrawingToolbarWidget } from './drawing_toolbar';
import { DrawingToolbarBinding } from './drawing_toolbar/drawing_toolbar_binding';
import { ToolbarWidget } from './toolbar';
import { WatchlistPanel } from './watchlist/watchlist_panel';
import { AlertsPanel, AlertsPanelChart } from './alerts/alerts-panel';
import {
    LayoutId,
    LayoutSizes,
    LegacyLayoutId,
    SplitterInfo,
    applyDrag,
    computeGeometry,
    equalWeights,
    getLayoutDef,
    isLayoutLocked,
    isValidSizes,
    legacyRatiosOf,
    pickFallbackLayout,
    requiredPlanFor,
    resolveLayoutId,
    sizesFromLegacyRatios,
} from './layouts/layout-catalog';
import { LayoutMenu, LayoutSyncState } from './layouts/layout-menu';

/** Any catalog layout id (see `LAYOUT_CATALOG`) or a legacy id ('1x1' | '2x1' | '1x2' | '1x3' | '2x2' | 'single'). */
export type MultiChartLayoutType = LayoutId | LegacyLayoutId;

export type MultiChartSync = LayoutSyncState;

export interface MultiChartSlotOptions extends Partial<ChartModelOptions> {
    symbol?: string;
    timeframe?: string;
    exchange?: string;
    locale?: string;
}

/**
 * LEGACY (grid era) relative sizes per axis. Kept for backward compatibility; prefer `LayoutSizes`
 * (`getLayoutSizes` / `layoutSizesChanged`). For a layout, `columns` are the weights of its first side-by-side
 * split and `rows` the weights of its first stacked split.
 */
export interface MultiChartRatios {
    columns: number[];
    rows: number[];
}

export interface MultiChartRatiosChangeEvent extends MultiChartRatios {
    layout: MultiChartLayoutType;
}

export interface MultiChartSizesChangeEvent {
    layout: LayoutId;
    /** Weights of every splitter group of that layout (key -> child weights). Persist as-is, restore via `sizes`. */
    sizes: LayoutSizes;
}

export interface MultiChartLayoutChangeEvent {
    layout: LayoutId;
    previous: LayoutId;
    count: number;
}

/** Fired when a layout switch created / disposed charts. Indices refer to `layout.charts`. */
export interface MultiChartChartsChangeEvent {
    layout: LayoutId;
    count: number;
    /** Indices of newly created charts (empty, no data yet: the host should load their data). */
    added: number[];
    /** Indices of disposed charts (they no longer exist). */
    removed: number[];
}

export interface MultiChartMaximizeEvent {
    layout: LayoutId;
    /** Maximized chart index, or null when restored. */
    index: number | null;
}

export interface MultiChartLockedLayoutEvent {
    layout: LayoutId;
    count: number;
    /** Lowest plan whose limit covers the layout, null if none (admin only). */
    requiredPlan: string | null;
}

export interface MultiChartLayoutOptions {
    layout?: MultiChartLayoutType;
    charts?: MultiChartSlotOptions[];
    /** Legacy initial values for sync.symbol / sync.interval (a persisted user preference wins over them). */
    syncSymbol?: boolean;
    syncTimeframe?: boolean;
    /** Initial sync state; overrides the persisted one. */
    sync?: Partial<MultiChartSync>;
    activeIndex?: number;
    gap?: number;
    locale?: string;
    /** Initial theme; a persisted choice ('tv-chart-theme') wins over it. */
    theme?: 'dark' | 'light';
    /** LEGACY initial `{columns, rows}` ratios, applied to `layout` only. */
    ratios?: Partial<MultiChartRatios>;
    /** Initial splitter sizes per layout id (as emitted by `layoutSizesChanged`). */
    sizes?: Record<string, LayoutSizes>;
    /** Initially maximized chart index per layout id. */
    maximized?: Record<string, number | null>;
    /** Max charts allowed (null/undefined = unlimited) and plan limits, see `setMaxCharts`. */
    maxCharts?: number | null;
    planLimits?: Record<string, number>;
    /** Minimum chart size while dragging splitters (px, default 120). */
    minChartSize?: number;
}

export interface MultiChartSymbolChangeEvent {
    index: number;
    symbol: SymbolInfo | string;
}

export interface MultiChartTimeframeChangeEvent {
    index: number;
    timeframe: string;
}

const defaultSlotOptions: MultiChartSlotOptions = {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    exchange: 'BINANCE',
};

const DEFAULT_GAP = 8;
const DEFAULT_MIN_CHART_PX = 120;
const DIVIDER_HIT_PX = 14;
const DIVIDER_ACCENT = 'rgba(41, 98, 255, 0.85)';
const SLOT_BORDER = 'rgba(148, 163, 184, 0.16)';

const DEFAULT_SYNC: MultiChartSync = { symbol: false, interval: false, crosshair: true, time: false, dateRange: false };

interface SplitterView {
    element: HTMLElement;
    line: HTMLElement;
    info: SplitterInfo;
}

export class MultiChartLayout {
    private readonly _container: HTMLElement;
    private readonly _element: HTMLElement;
    private readonly _grid: HTMLElement;
    /** Row holding the grid and the layout-wide watchlist sidebar (right edge). */
    private readonly _body: HTMLElement;
    private _watchlistPanel: WatchlistPanel | null = null;
    /** Page-level alerts manager (one instance in the shared right sidebar, drives the ACTIVE chart). */
    private _alertsPanel: AlertsPanel | null = null;
    /** Unread fired-alert count, kept here so a layout rebuild (new panel instance) does not reset the badge. */
    private _alertsUnread = 0;
    private _toolbarWidget: ToolbarWidget | null = null;
    /** One drawing toolbar for the whole layout (far left); drives the active chart. */
    private _drawingToolbar: DrawingToolbarWidget | null = null;
    private _drawingToolbarBinding: DrawingToolbarBinding | null = null;
    private _layout: LayoutId;
    private _options: MultiChartLayoutOptions;
    private _charts: ChartWidget[] = [];
    private _slots: HTMLElement[] = [];
    private _maxButtons: HTMLButtonElement[] = [];
    private _splitters: SplitterView[] = [];
    private _activeIndex: number = 0;
    private _syncing: boolean = false;
    private _viewSyncing: boolean = false;
    private _replaySync: boolean = true;
    private _replaySyncing: boolean = false;
    private _sync: MultiChartSync;
    private _theme: 'dark' | 'light' = 'dark';
    private _domEnabled: boolean = false;
    private _draggingSplitter = false;
    private _gridResizeObserver: ResizeObserver | null = null;
    private _sizes: Record<string, LayoutSizes> = {};
    private _maximized: Record<string, number | null> = {};
    private _maxCharts: number | null = null;
    private _planLimits: Record<string, number> | undefined;
    private _baseSlotOptions: MultiChartSlotOptions = {};
    private _menu: LayoutMenu;

    private static readonly CROSSHAIR_SYNC_STORAGE = 'chart.multi.crosshairSync';
    private static readonly SYNC_STORAGE = 'chart.multi.sync';

    /** Kullanici tercihi (varsayilan acik); sadece bu tarayicida saklanir. */
    static crosshairSyncPreferred(): boolean {
        return MultiChartLayout.loadSync({}).crosshair;
    }

    private static loadSync(legacy: Partial<MultiChartSync>): MultiChartSync {
        const out: MultiChartSync = { ...DEFAULT_SYNC, ...legacy };
        try {
            const raw = localStorage.getItem(MultiChartLayout.SYNC_STORAGE);
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<MultiChartSync>;
                for (const key of Object.keys(DEFAULT_SYNC) as Array<keyof MultiChartSync>) {
                    if (typeof parsed[key] === 'boolean') out[key] = parsed[key] as boolean;
                }
            } else if (localStorage.getItem(MultiChartLayout.CROSSHAIR_SYNC_STORAGE) === '0') {
                out.crosshair = false;
            }
        } catch {
            // storage unavailable -> defaults
        }
        return out;
    }

    /**
     * Bar replay sync across the charts of this layout. When `sync` is true (default), starting /
     * stepping / playing replay on the ACTIVE chart drives every other chart to the same cursor
     * (each chart reveals its own bars that are closed by that cursor, no forming bar, no own timer),
     * and stopping replay on the active chart stops it on all charts. Per-chart hosts
     * (`chart.replay.setHost`) are still used by followers (pauseRealtime / resumeRealtime).
     */
    readonly replay = ((self: MultiChartLayout) => ({
        get sync(): boolean { return self._replaySync; },
        set sync(v: boolean) { self._replaySync = v; },
        /** true if any chart of the layout is in replay */
        get active(): boolean { return self._charts.some((c) => c.replay.active); },
        /** Stop replay on every chart. */
        stop: (): Promise<void> => self._stopAllReplays(),
        /** Start bar selection on the active chart (its control bar drives the others). */
        startSelection: (): void => self.activeChart?.replay.startSelection(),
        cancelSelection: (): void => self.activeChart?.replay.cancelSelection(),
    }))(this);

    private readonly _ratiosChanged = new Delegate<MultiChartRatiosChangeEvent>();
    private readonly _sizesChanged = new Delegate<MultiChartSizesChangeEvent>();
    private readonly _layoutChanged = new Delegate<MultiChartLayoutChangeEvent>();
    private readonly _chartsChanged = new Delegate<MultiChartChartsChangeEvent>();
    private readonly _maximizedChanged = new Delegate<MultiChartMaximizeEvent>();
    private readonly _syncChanged = new Delegate<MultiChartSync>();
    private readonly _lockedLayoutClicked = new Delegate<MultiChartLockedLayoutEvent>();
    private readonly _activeChartChanged = new Delegate<number>();
    private readonly _themeChanged = new Delegate<'dark' | 'light'>();
    private readonly _symbolChanged = new Delegate<MultiChartSymbolChangeEvent>();
    private readonly _timeframeChanged = new Delegate<MultiChartTimeframeChangeEvent>();

    /** Type-to-open: ONE listener for the whole layout, routed to the active chart only. */
    private readonly _onKeyPress = (e: KeyboardEvent): void => {
        if (!this._element.isConnected) return;
        this.activeChart?.handleTypeToOpen(e);
    };

    private readonly _onKeyDown = (e: KeyboardEvent): void => {
        if (!e.altKey || e.key !== 'Enter' || !this._element.isConnected) return;
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        if (this._charts.length < 2) return;
        e.preventDefault();
        this.toggleMaximize();
    };

    constructor(container: HTMLElement | string, options: MultiChartLayoutOptions = {}) {
        this._container = typeof container === 'string'
            ? document.querySelector(container) as HTMLElement
            : container;

        if (!this._container) {
            throw new Error('MultiChartLayout container not found');
        }

        this._options = { ...options };
        this._maxCharts = options.maxCharts ?? null;
        this._planLimits = options.planLimits;
        this._sync = MultiChartLayout.loadSync({
            ...(options.syncSymbol !== undefined ? { symbol: options.syncSymbol } : {}),
            ...(options.syncTimeframe !== undefined ? { interval: options.syncTimeframe } : {}),
        });
        if (options.sync) this._sync = { ...this._sync, ...this._cleanSync(options.sync) };

        // One source of truth for the theme: persisted choice (same key ChartWidget uses) > option > dark.
        let savedTheme: string | null = null;
        try { savedTheme = localStorage.getItem('tv-chart-theme'); } catch { /* storage unavailable */ }
        this._theme = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : (options.theme ?? 'dark');

        const requested = resolveLayoutId(options.layout ?? '4') ?? '4';
        this._layout = isLayoutLocked(requested, this._maxCharts) ? pickFallbackLayout(requested, this._maxCharts) : requested;
        this._activeIndex = options.activeIndex ?? 0;
        this._minChartPx = options.minChartSize ?? DEFAULT_MIN_CHART_PX;

        if (options.sizes) {
            for (const [id, sizes] of Object.entries(options.sizes)) {
                const resolved = resolveLayoutId(id);
                if (resolved && isValidSizes(sizes)) this._sizes[resolved] = { ...sizes };
            }
        }
        if (options.ratios) {
            const legacyLayout = resolveLayoutId(options.layout ?? this._layout) ?? this._layout;
            this._sizes[legacyLayout] = { ...(this._sizes[legacyLayout] || {}), ...sizesFromLegacyRatios(getLayoutDef(legacyLayout).tree, options.ratios) };
        }
        if (options.maximized) {
            for (const [id, index] of Object.entries(options.maximized)) {
                const resolved = resolveLayoutId(id);
                if (resolved) this._maximized[resolved] = index;
            }
        }
        const first = options.charts?.[0];
        if (first) {
            const { symbol: _s, timeframe: _t, exchange: _e, ...rest } = first;
            void _s; void _t; void _e;
            this._baseSlotOptions = rest;
        }

        this._element = document.createElement('div');
        this._element.className = 'tv-multi-chart-layout-shell';
        this._element.style.cssText = `
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            min-width: 0;
            min-height: 0;
            background: #131722;
        `;

        this._grid = document.createElement('div');
        this._grid.className = 'tv-multi-chart-layout-grid';
        this._grid.style.cssText = `
            flex: 1 1 auto;
            width: 100%;
            min-width: 0;
            min-height: 0;
            position: relative;
            overflow: hidden;
            background: #0f172a;
        `;

        this._body = document.createElement('div');
        this._body.className = 'tv-multi-chart-layout-body';
        this._body.style.cssText = `
            flex: 1 1 auto;
            display: flex;
            position: relative;
            width: 100%;
            min-width: 0;
            min-height: 0;
        `;
        this._body.appendChild(this._grid);

        this._container.appendChild(this._element);
        this._element.appendChild(this._body);

        this._menu = new LayoutMenu({
            getLayout: () => this._layout,
            getSync: () => this.getSync(),
            getMaxCharts: () => this._maxCharts,
            getTheme: () => this._theme,
            selectLayout: (id) => { this.setLayout(id); },
            lockedClicked: (id) => this._handleLockedClick(id),
            setSync: (partial) => this.setSync(partial),
        });

        this._createDrawingToolbar();

        const count = getLayoutDef(this._layout).count;
        for (let i = 0; i < count; i++) {
            this._addSlot(i, options.charts?.[i] || (i > 0 ? this._newSlotOptions() : {}));
        }
        this._rebuildSplitters();
        this._relayout();
        this._createWatchlist();
        this._createAlertsPanel();
        this._createToolbar();
        this.setActiveChart(Math.min(this._activeIndex, this._charts.length - 1));

        if (typeof ResizeObserver !== 'undefined') {
            this._gridResizeObserver = new ResizeObserver(() => this._relayout());
            this._gridResizeObserver.observe(this._grid);
        }
        document.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keypress', this._onKeyPress);
    }

    private _minChartPx: number;

    // --- accessors ---

    get charts(): readonly ChartWidget[] {
        return this._charts;
    }

    get activeChart(): ChartWidget | null {
        return this._charts[this._activeIndex] ?? null;
    }

    get activeIndex(): number {
        return this._activeIndex;
    }

    getChart(index: number): ChartWidget | null {
        return this._charts[index] ?? null;
    }

    /** Current catalog layout id (legacy ids are resolved). */
    getLayout(): LayoutId {
        return this._layout;
    }

    // --- events ---

    /** Fires after every theme change (toolbar toggle or setTheme), once all parts are re-themed. */
    get themeChanged(): Delegate<'dark' | 'light'> {
        return this._themeChanged;
    }

    get theme(): 'dark' | 'light' {
        return this._theme;
    }

    get activeChartChanged(): Delegate<number> {
        return this._activeChartChanged;
    }

    get symbolChanged(): Delegate<MultiChartSymbolChangeEvent> {
        return this._symbolChanged;
    }

    get timeframeChanged(): Delegate<MultiChartTimeframeChangeEvent> {
        return this._timeframeChanged;
    }

    /** After a layout switch (the charts already exist). */
    get layoutChanged(): Delegate<MultiChartLayoutChangeEvent> {
        return this._layoutChanged;
    }

    /** After a layout switch that created / disposed charts: load data for `added`. Fired after `layoutChanged`. */
    get chartsChanged(): Delegate<MultiChartChartsChangeEvent> {
        return this._chartsChanged;
    }

    /** User finished dragging a splitter (or double-clicked one to equalise): persist `sizes` for `layout`. */
    get layoutSizesChanged(): Delegate<MultiChartSizesChangeEvent> {
        return this._sizesChanged;
    }

    /** LEGACY twin of `layoutSizesChanged` in the old `{columns, rows}` shape. */
    get ratiosChanged(): Delegate<MultiChartRatiosChangeEvent> {
        return this._ratiosChanged;
    }

    get maximizedChanged(): Delegate<MultiChartMaximizeEvent> {
        return this._maximizedChanged;
    }

    get syncChanged(): Delegate<MultiChartSync> {
        return this._syncChanged;
    }

    /** A locked layout (above the plan limit) was clicked in the menu. */
    get onLockedLayoutClicked(): Delegate<MultiChartLockedLayoutEvent> {
        return this._lockedLayoutClicked;
    }

    // --- layout ---

    /**
     * Switches the layout (any catalog id or legacy alias). Existing charts are kept by index, extra ones are
     * created / disposed (see `chartsChanged`). A layout above the plan limit is replaced by the fallback
     * layout (see `setMaxCharts`). Returns the layout id that is active afterwards.
     */
    setLayout(layout: MultiChartLayoutType): LayoutId {
        const resolved = resolveLayoutId(layout);
        if (!resolved) return this._layout;
        const target = isLayoutLocked(resolved, this._maxCharts) ? pickFallbackLayout(resolved, this._maxCharts) : resolved;
        if (target === this._layout) return this._layout;

        const previous = this._layout;
        const prevCount = this._charts.length;
        const count = getLayoutDef(target).count;
        this._layout = target;

        const template = this._newSlotOptions();
        const removed: number[] = [];
        const added: number[] = [];
        while (this._charts.length > count) {
            const idx = this._charts.length - 1;
            this._removeSlot(idx);
            removed.unshift(idx);
        }
        for (let i = prevCount; i < count; i++) {
            this._addSlot(i, template);
            added.push(i);
        }

        this._rebuildSplitters();
        this._relayout();
        this.setActiveChart(Math.min(this._activeIndex, this._charts.length - 1));
        this._menu.refresh();
        this._layoutChanged.fire({ layout: target, previous, count });
        if (added.length || removed.length) {
            this._chartsChanged.fire({ layout: target, count, added, removed });
        }
        return target;
    }

    /** Splitter weights of a layout (default: current). Keys: `sync:<id>` (linked splits) or node path. */
    getLayoutSizes(layout?: MultiChartLayoutType): LayoutSizes {
        const id = resolveLayoutId(layout ?? this._layout) ?? this._layout;
        return JSON.parse(JSON.stringify(this._sizes[id] || {}));
    }

    /** Programmatic sizes for a layout (no event). Invalid input resets that layout to its default sizes. */
    setLayoutSizes(layout: MultiChartLayoutType, sizes: LayoutSizes | null): void {
        const id = resolveLayoutId(layout);
        if (!id) return;
        if (sizes && isValidSizes(sizes)) this._sizes[id] = JSON.parse(JSON.stringify(sizes));
        else delete this._sizes[id];
        if (id === this._layout) this._relayout();
    }

    getAllLayoutSizes(): Record<string, LayoutSizes> {
        return JSON.parse(JSON.stringify(this._sizes));
    }

    setAllLayoutSizes(all: Record<string, LayoutSizes>): void {
        this._sizes = {};
        for (const [id, sizes] of Object.entries(all || {})) {
            const resolved = resolveLayoutId(id);
            if (resolved && isValidSizes(sizes)) this._sizes[resolved] = JSON.parse(JSON.stringify(sizes));
        }
        this._relayout();
    }

    /** LEGACY: `{columns, rows}` of the current layout. */
    getRatios(): MultiChartRatios {
        return legacyRatiosOf(getLayoutDef(this._layout).tree, this._sizes[this._layout]);
    }

    /** LEGACY: applies `{columns, rows}` to the current layout (no event). */
    setRatios(ratios: Partial<MultiChartRatios>): void {
        const sizes = sizesFromLegacyRatios(getLayoutDef(this._layout).tree, ratios);
        if (Object.keys(sizes).length) {
            this._sizes[this._layout] = { ...(this._sizes[this._layout] || {}), ...sizes };
            this._relayout();
        }
    }

    // --- plan limit ---

    /**
     * Limits the number of charts per layout. Layouts with more charts are shown locked in the menu (click ->
     * inline notice "This layout requires {plan} membership", `onLockedLayoutClicked`). `planLimits` maps plan
     * name -> max charts; the notice names the lowest plan whose limit covers the layout ("admin only" if none).
     * If the current layout exceeds the limit it is replaced by the largest allowed layout of the same family,
     * else the single chart. null = unlimited. Returns the active layout id.
     */
    setMaxCharts(maxCharts: number | null, planLimits?: Record<string, number>): LayoutId {
        this._maxCharts = maxCharts === undefined ? null : maxCharts;
        this._planLimits = planLimits;
        let result = this._layout;
        if (isLayoutLocked(this._layout, this._maxCharts)) {
            result = this.setLayout(pickFallbackLayout(this._layout, this._maxCharts));
        }
        this._menu.refresh();
        return result;
    }

    getMaxCharts(): number | null {
        return this._maxCharts;
    }

    private _handleLockedClick(id: LayoutId): string {
        const count = getLayoutDef(id).count;
        const plan = requiredPlanFor(count, this._planLimits);
        this._lockedLayoutClicked.fire({ layout: id, count, requiredPlan: plan });
        return plan ? t('This layout requires {plan} membership').replace('{plan}', plan) : t('This layout is admin only');
    }

    // --- maximize / fullscreen ---

    /** Maximized chart index of the current layout (null = none). */
    getMaximizedIndex(): number | null {
        const index = this._maximized[this._layout];
        return typeof index === 'number' && index >= 0 && index < this._charts.length && this._charts.length > 1 ? index : null;
    }

    /** Makes chart `index` fill the layout (others are hidden, not disposed). State is kept per layout. */
    maximizeChart(index: number = this._activeIndex): void {
        if (this._charts.length < 2 || index < 0 || index >= this._charts.length) return;
        this._maximized[this._layout] = index;
        this.setActiveChart(index);
        this._relayout();
        this._maximizedChanged.fire({ layout: this._layout, index });
    }

    restoreChart(): void {
        if (this.getMaximizedIndex() === null) return;
        this._maximized[this._layout] = null;
        this._relayout();
        this._maximizedChanged.fire({ layout: this._layout, index: null });
    }

    /** Alt+Enter: maximizes the given (default active) chart or restores when it is already maximized. */
    toggleMaximize(index: number = this._activeIndex): void {
        if (this.getMaximizedIndex() === null) this.maximizeChart(index);
        else this.restoreChart();
    }

    /** Fullscreen (Fullscreen API) of the whole layout root. */
    toggleFullscreen(): Promise<void> {
        if (typeof document === 'undefined') return Promise.resolve();
        if (document.fullscreenElement) return document.exitFullscreen();
        return this._element.requestFullscreen ? this._element.requestFullscreen() : Promise.resolve();
    }

    // --- sync ---

    getSync(): MultiChartSync {
        return { ...this._sync };
    }

    /**
     * Updates the "Sync in layout" flags (persisted in localStorage). Also accepts the legacy
     * `{syncSymbol, syncTimeframe}` shape. Enabling symbol/interval applies the active chart's value to the
     * others immediately; enabling time/dateRange aligns the others to the active chart.
     */
    setSync(options: Partial<MultiChartSync> & Pick<MultiChartLayoutOptions, 'syncSymbol' | 'syncTimeframe'>): void {
        const partial: Partial<MultiChartSync> = this._cleanSync(options);
        if (typeof options.syncSymbol === 'boolean') partial.symbol = options.syncSymbol;
        if (typeof options.syncTimeframe === 'boolean') partial.interval = options.syncTimeframe;
        const prev = this._sync;
        const next: MultiChartSync = { ...prev, ...partial };
        const changed = (Object.keys(next) as Array<keyof MultiChartSync>).some((k) => next[k] !== prev[k]);
        if (!changed) return;
        this._sync = next;
        try {
            localStorage.setItem(MultiChartLayout.SYNC_STORAGE, JSON.stringify(next));
            localStorage.setItem(MultiChartLayout.CROSSHAIR_SYNC_STORAGE, next.crosshair ? '1' : '0');
        } catch {
            // works for this session even if it cannot be stored
        }
        if (next.crosshair !== prev.crosshair) this._charts.forEach((c) => c.setCrosshairSyncEnabled(next.crosshair));
        const active = this.activeChart;
        if (active) {
            if (next.symbol && !prev.symbol) {
                this._propagateSymbol(this._activeIndex, {
                    symbol: active.symbol,
                    full_name: active.symbol,
                    description: active.symbol,
                    exchange: active.model.exchange,
                    type: 'crypto',
                } as SymbolInfo);
            }
            if (next.interval && !prev.interval) this._propagateTimeframe(this._activeIndex, active.timeframe);
            if ((next.time && !prev.time) || (next.dateRange && !prev.dateRange)) this._syncViewFrom(this._activeIndex);
        }
        this._menu.refresh();
        this._syncChanged.fire({ ...next });
    }

    get crosshairSync(): boolean {
        return this._sync.crosshair;
    }

    /** Imleci tum grafiklerde ayni zamana senkronize et (TradingView "crosshair sync"). */
    setCrosshairSync(enabled: boolean): void {
        this.setSync({ crosshair: enabled });
    }

    private _cleanSync(src: Partial<MultiChartSync>): Partial<MultiChartSync> {
        const out: Partial<MultiChartSync> = {};
        for (const key of Object.keys(DEFAULT_SYNC) as Array<keyof MultiChartSync>) {
            if (typeof src[key] === 'boolean') out[key] = src[key];
        }
        return out;
    }

    // --- theme / active / destroy ---

    setTheme(theme: 'dark' | 'light'): void {
        this._theme = theme;
        this._toolbarWidget?.setTheme(theme);
        this._drawingToolbar?.setTheme(theme);
        this._watchlistPanel?.setTheme(theme === 'light' ? 'light' : 'dark');
        this._alertsPanel?.setTheme(theme === 'light' ? 'light' : 'dark');
        for (const chart of this._charts) chart.setTheme(theme); // also persists 'tv-chart-theme'
        this._menu.refresh();
        this._themeChanged.fire(theme);
    }

    setActiveChart(index: number): void {
        if (index < 0 || index >= this._slots.length) {
            return;
        }

        const prevChart = this._charts[this._activeIndex] ?? null;
        this._activeIndex = index;
        // Armed drawing tool follows the active chart (before the click that activated it is processed)
        this._drawingToolbarBinding?.onActiveChartChanged(prevChart, this._charts[index] ?? null);
        this._slots.forEach((slot, slotIndex) => {
            slot.style.borderColor = slotIndex === index ? '#2962ff' : SLOT_BORDER;
            slot.style.boxShadow = slotIndex === index
                ? 'inset 0 0 0 1px rgba(41, 98, 255, 0.3)'
                : 'none';
        });

        // replay control bar only on the active chart (followers just follow the cursor)
        this._charts.forEach((chart, chartIndex) => chart.setReplayControlsEnabled(chartIndex === index));

        this._syncObjectTrees();
        this._syncToolbarStateFromActiveChart();
        this._syncReplayButton();
        this._activeChartChanged.fire(index);
    }

    destroy(): void {
        document.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keypress', this._onKeyPress);
        this._watchlistPanel?.destroy();
        this._watchlistPanel = null;
        this._alertsPanel?.destroy();
        this._alertsPanel = null;
        for (const chart of this._charts) {
            chart.dispose();
        }
        this._charts = [];
        this._slots = [];
        this._maxButtons = [];
        this._menu.destroy();
        this._toolbarWidget?.dispose();
        this._toolbarWidget = null;
        this._drawingToolbarBinding?.detach();
        this._drawingToolbarBinding = null;
        this._drawingToolbar?.dispose();
        this._drawingToolbar = null;
        this._gridResizeObserver?.disconnect();
        this._gridResizeObserver = null;
        this._splitters = [];
        this._element.remove();
        this._ratiosChanged.destroy();
        this._sizesChanged.destroy();
        this._layoutChanged.destroy();
        this._chartsChanged.destroy();
        this._maximizedChanged.destroy();
        this._syncChanged.destroy();
        this._lockedLayoutClicked.destroy();
        this._activeChartChanged.destroy();
        this._themeChanged.destroy();
        this._symbolChanged.destroy();
        this._timeframeChanged.destroy();
    }

    // --- toolbar ---

    private _createToolbar(): void {
        this._toolbarWidget?.dispose();

        const activeChart = this.activeChart;
        this._toolbarWidget = new ToolbarWidget(this._element, {
            symbol: activeChart?.symbol || defaultSlotOptions.symbol,
            timeframe: activeChart?.timeframe || defaultSlotOptions.timeframe,
            chartType: activeChart?.chartType || 'candles',
            locale: this._options.locale || 'en',
            priceScaleMode: activeChart?.priceScaleMode || 'normal',
            ...(activeChart ? { timezone: activeChart.getTimezone() } : {}),
        });
        this._toolbarWidget.setTheme(this._theme);
        this._toolbarWidget.setWatchlistActive(this._watchlistPanel?.visible ?? false);
        this._toolbarWidget.setAlertsManagerActive(this._alertsPanel?.visible ?? false);
        this._toolbarWidget.setAlertsUnread(this._alertsPanel?.unreadCount ?? 0);
        // layout menu button: right end of the shared toolbar
        this._toolbarWidget.element?.appendChild(this._menu.createTrigger());

        this._toolbarWidget.symbolClicked.subscribe(() => {
            this.activeChart?.showSymbolSearch();
        });

        this._toolbarWidget.indicatorsClicked.subscribe(() => {
            this.activeChart?.showIndicatorSearch();
        });

        this._toolbarWidget.timeframeChanged.subscribe((timeframe) => {
            this.activeChart?.setTimeframe(timeframe);
        });

        this._toolbarWidget.chartTypeChanged.subscribe((chartType) => {
            this.activeChart?.setChartType(chartType);
        });

        this._toolbarWidget.priceScaleModeChanged.subscribe((mode) => {
            this.activeChart?.setPriceScaleMode(mode);
        });

        this._toolbarWidget.themeToggled.subscribe((theme) => {
            this.setTheme(theme);
        });

        // Time axis zone applies to every chart of the layout (each persists it the same way).
        this._toolbarWidget.timezoneChanged.subscribe((timezone) => {
            for (const chart of this._charts) chart.setTimezone(timezone);
        });

        // Spot price axis: per chart; the toolbar button mirrors the active chart.
        this._toolbarWidget.spotToggled.subscribe((enabled) => {
            this.activeChart?.setSpotMode(enabled);
        });

        this._toolbarWidget.watchlistToggled.subscribe((enabled) => {
            this._watchlistPanel?.setVisible(enabled);
        });

        this._toolbarWidget.alertsManagerToggled.subscribe((enabled) => {
            this._alertsPanel?.setVisible(enabled);
        });

        this._toolbarWidget.languageChanged.subscribe((locale) => {
            this._options = { ...this._options, locale };
            for (const chart of this._charts) {
                chart.setLanguage(locale);
            }
            this._createToolbar();
            this._createDrawingToolbar();
            this._syncObjectTrees();
            this._syncToolbarStateFromActiveChart();
            this._refreshMaxButtons();
        });

        this._toolbarWidget.domToggled.subscribe((enabled) => {
            this._domEnabled = enabled;
            for (const chart of this._charts) {
                chart.setDomEnabled(enabled);
            }
        });

        // Alert button: create-alert dialog for the active chart's symbol at its last price
        this._toolbarWidget.alertClicked.subscribe(() => {
            this.activeChart?.openAlertDialogAt();
        });

        // Replay button: starts / cancels bar selection on the active chart (its control bar drives the others)
        this._toolbarWidget.replayClicked.subscribe(() => {
            const chart = this.activeChart;
            if (!chart) return;
            const s = chart.replay.state;
            if (s.selecting) chart.replay.cancelSelection();
            else if (!s.active) chart.replay.startSelection();
        });
        this._syncReplayButton();
    }

    /** One watchlist sidebar for the whole layout; a row click changes the ACTIVE chart. */
    /** The single shared drawing toolbar (left column of the layout body); rebuilt on language change. */
    private _createDrawingToolbar(): void {
        const prev = this._drawingToolbar;
        const state = prev ? { tool: prev.activeTool, locked: prev.isLocked, hidden: prev.isVisibilityHidden } : null;
        this._drawingToolbarBinding?.detach();
        prev?.dispose();
        const toolbar = new DrawingToolbarWidget(this._body, true);
        if (toolbar.element) this._body.insertBefore(toolbar.element, this._grid);
        toolbar.setTheme(this._theme);
        if (state) {
            toolbar.setActiveTool(state.tool);
            toolbar.isLocked = state.locked;
            toolbar.isVisibilityHidden = state.hidden;
        }
        this._drawingToolbar = toolbar;
        this._drawingToolbarBinding = new DrawingToolbarBinding(toolbar, {
            getActive: () => this.activeChart,
            getAll: () => this._charts,
        });
    }

    private _createWatchlist(): void {
        this._watchlistPanel?.destroy();
        const panel = new WatchlistPanel(this._body, 0);
        this._watchlistPanel = panel;
        panel.setTheme(this._theme === 'light' ? 'light' : 'dark');
        const active = this.activeChart;
        if (active) panel.setActiveSymbol(active.symbol);

        panel.visibilityChanged.subscribe((visible) => {
            // Same exclusion as the single chart: watchlist, alerts panel and object tree share the right edge.
            if (visible) this._alertsPanel?.setVisible(false, { persist: false });
            this._syncObjectTrees();
            this._toolbarWidget?.setWatchlistActive(visible);
            this._applyWatchlistInset();
        });
        panel.widthChanged.subscribe(() => this._applyWatchlistInset());
        panel.symbolSelected.subscribe((sel) => {
            const type: SymbolInfo['type'] =
                sel.assetClass === 'crypto' ? 'crypto' : sel.exchange === 'COMEX' ? 'futures' : 'forex';
            this.activeChart?.setSymbol({
                symbol: sel.code,
                full_name: `${sel.exchange}:${sel.code}`,
                description: sel.name,
                exchange: sel.exchange,
                type,
            });
        });

        if (WatchlistPanel.wasOpen()) panel.setVisible(true);
    }

    private _createAlertsPanel(): void {
        this._alertsPanel?.destroy();
        const panel = new AlertsPanel(this._body, 0, () => this.activeChart as AlertsPanelChart | null);
        this._alertsPanel = panel;
        panel.setTheme(this._theme === 'light' ? 'light' : 'dark');
        panel.restoreUnread(this._alertsUnread);

        panel.unreadChanged.subscribe((n) => { this._alertsUnread = n; this._toolbarWidget?.setAlertsUnread(n); });
        panel.visibilityChanged.subscribe((visible) => {
            if (visible) this._watchlistPanel?.setVisible(false);
            this._syncObjectTrees();
            this._toolbarWidget?.setAlertsManagerActive(visible);
            this._applyWatchlistInset();
        });
        panel.widthChanged.subscribe(() => this._applyWatchlistInset());

        if (AlertsPanel.wasOpen() && !this._watchlistPanel?.visible) panel.setVisible(true);
    }

    /**
     * Right sidebar of the layout is shared: watchlist OR alerts panel OR the ACTIVE chart's object tree (never two).
     * Every chart's tree lives in the layout body; only the active chart's may be open.
     */
    private _syncObjectTrees(): void {
        const watchlistOpen = this._watchlistPanel?.visible ?? false;
        // Watchlist closed while the alerts panel was open in the previous session / before: it takes the slot back.
        if (!watchlistOpen && !(this._alertsPanel?.visible ?? false) && this._alertsPanel && AlertsPanel.wasOpen()) {
            this._alertsPanel.setVisible(true);
            return;
        }
        const sidebarOpen = watchlistOpen || (this._alertsPanel?.visible ?? false);
        this._charts.forEach((chart, i) => {
            if (i === this._activeIndex && !sidebarOpen) chart.restoreObjectTree();
            else chart.hideObjectTree();
        });
        this._applyWatchlistInset();
    }

    private _applyWatchlistInset(): void {
        const panel = this._watchlistPanel;
        let width = panel && panel.visible ? panel.width : 0;
        if (!width && this._alertsPanel?.visible) width = this._alertsPanel.width;
        if (!width) {
            const tree = this._charts.find((c) => c.objectTreeVisible);
            if (tree) width = tree.objectTreeWidth;
        }
        this._grid.style.marginRight = width ? `${width}px` : '0';
    }

    /** Highlight the shared toolbar's Replay button while replay is active / selecting on any chart. */
    private _syncReplayButton(): void {
        this._toolbarWidget?.setReplayActive(this._charts.some((c) => c.replay.active || c.replay.state.selecting));
    }

    // --- slots / charts ---

    /** Options of a newly created chart: the base (branding/colors) options + the active chart's market. */
    private _newSlotOptions(): MultiChartSlotOptions {
        const active = this.activeChart;
        return {
            ...this._baseSlotOptions,
            ...(active ? { symbol: active.symbol, timeframe: active.timeframe, exchange: active.model.exchange } : {}),
        };
    }

    private _addSlot(i: number, slotOptions: MultiChartSlotOptions): void {
        const slot = document.createElement('div');
        slot.className = 'tv-multi-chart-slot';
        slot.style.cssText = `
            position: absolute;
            left: 0; top: 0; width: 0; height: 0;
            box-sizing: border-box;
            min-width: 0;
            min-height: 0;
            overflow: hidden;
            border: 1px solid ${SLOT_BORDER};
            border-radius: 10px;
            background: #131722;
        `;
        slot.addEventListener('pointerdown', () => {
            this.setActiveChart(i);
        }, true);

        const maxBtn = document.createElement('button');
        maxBtn.type = 'button';
        maxBtn.className = 'tv-multi-chart-maximize';
        maxBtn.style.cssText = `
            position: absolute; bottom: 36px; right: 74px; z-index: 30; width: 24px; height: 24px; padding: 0;
            display: none; align-items: center; justify-content: center; border-radius: 4px; cursor: pointer;
            border: 1px solid rgba(120, 123, 134, 0.35); background: rgba(19, 23, 34, 0.72); color: #d1d4dc;
            opacity: 0; transition: opacity 0.12s;
        `;
        maxBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
        maxBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.getMaximizedIndex() === null) this.maximizeChart(i);
            else this.restoreChart();
        });
        slot.addEventListener('mouseenter', () => { maxBtn.style.opacity = '1'; });
        slot.addEventListener('mouseleave', () => { maxBtn.style.opacity = '0'; });

        this._grid.appendChild(slot);
        this._slots[i] = slot;

        const options = {
            ...defaultSlotOptions,
            locale: this._options.locale || 'en',
            ...slotOptions,
            showToolbar: false,
            showDrawingToolbar: false,
            stateSlot: i,
        };

        const chart = new ChartWidget(slot, options);
        slot.appendChild(maxBtn);
        this._maxButtons[i] = maxBtn;
        chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickVisible: true,
        });
        chart.setSharedDrawingToolbar({
            // keyboard shortcuts (Alt+T ...): the chart that received the key becomes active, then the shared toolbar selects
            select: (tool) => {
                this.setActiveChart(i);
                this._drawingToolbar?.setActiveTool(tool as any);
            },
            closeFlyout: () => this._drawingToolbar?.closeFlyout(),
        });
        chart.setTheme(this._theme);
        chart.setDomEnabled(this._domEnabled);
        chart.symbolChanged.subscribe((payload) => this._handleSymbolChanged(i, payload as any));
        chart.timeframeChanged.subscribe((timeframe) => this._handleTimeframeChanged(i, timeframe));
        chart.setCrosshairSyncEnabled(this._sync.crosshair);
        chart.replay.onStateChange.subscribe(() => {
            this._handleReplayState(i);
            this._syncReplayButton();
        });
        chart.spotStateChanged.subscribe((state) => {
            if (i === this._activeIndex) this._toolbarWidget?.setSpotButton(state.label, state.active);
        });
        chart.setObjectTreeContainer(this._body);
        chart.objectTreeVisibilityChanged.subscribe((visible) => {
            if (visible) {
                this._watchlistPanel?.setVisible(false);
                this._alertsPanel?.setVisible(false);
                if (chart !== this.activeChart) chart.hideObjectTree();
            }
            this._applyWatchlistInset();
        });
        chart.crosshairMoved.subscribe((info) => {
            if (!this._sync.crosshair) return;
            this._charts.forEach((other) => {
                if (other !== chart) other.setSyncedCrosshair(info);
            });
        });
        chart.viewChanged.subscribe(() => {
            if (this._viewSyncing || !(this._sync.time || this._sync.dateRange)) return;
            this._syncViewFrom(i);
        });

        this._charts[i] = chart;
        this._drawingToolbarBinding?.attachChart(chart);
        this._refreshMaxButtons();
    }

    private _removeSlot(i: number): void {
        // An armed tool of the removed active chart is cancelled (the toolbar returns to the cursor)
        if (i === this._activeIndex) this._drawingToolbarBinding?.cancelArmedTool();
        this._charts[i]?.dispose();
        this._slots[i]?.remove();
        this._charts.length = i;
        this._slots.length = i;
        this._maxButtons.length = i;
    }

    private _refreshMaxButtons(): void {
        const maximized = this.getMaximizedIndex() !== null;
        const multi = this._charts.length > 1;
        this._maxButtons.forEach((btn) => {
            btn.style.display = multi ? 'flex' : 'none';
            btn.title = maximized ? t('Restore chart') : t('Maximize chart');
            btn.innerHTML = maximized
                ? '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 1.5V5H1.5M9 12.5V9h3.5M9 1.5V5h3.5M5 12.5V9H1.5"/></svg>'
                : '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 5V1.5H5M12.5 5V1.5H9M1.5 9v3.5H5M12.5 9v3.5H9"/></svg>';
        });
    }

    // --- geometry / splitters ---

    private get _gap(): number {
        return this._options.gap ?? DEFAULT_GAP;
    }

    private _geometry() {
        return computeGeometry(
            getLayoutDef(this._layout).tree,
            this._grid.clientWidth,
            this._grid.clientHeight,
            this._gap,
            this._sizes[this._layout],
            this._minChartPx
        );
    }

    /** Positions every chart slot and splitter from the split tree (and the maximized state). */
    private _relayout(): void {
        const geo = this._geometry();
        const maximized = this.getMaximizedIndex();
        const full = { x: 0, y: 0, w: this._grid.clientWidth, h: this._grid.clientHeight };

        geo.cells.forEach((cell, i) => {
            const slot = this._slots[i];
            if (!slot) return;
            const rect = maximized === i ? full : cell;
            const s = slot.style;
            s.left = `${rect.x}px`;
            s.top = `${rect.y}px`;
            s.width = `${rect.w}px`;
            s.height = `${rect.h}px`;
            // others keep their rect (no zero-size resize) but are hidden
            s.visibility = maximized === null || maximized === i ? 'visible' : 'hidden';
            s.pointerEvents = maximized === null || maximized === i ? '' : 'none';
            s.zIndex = maximized === i ? '5' : '';
            // size the chart now (its ResizeObserver is async): data set right after creation must see a width
            this._charts[i]?.resize(Math.max(0, rect.w - 2), Math.max(0, rect.h - 2));
        });

        const half = DIVIDER_HIT_PX / 2;
        geo.splitters.forEach((info, k) => {
            const view = this._splitters[k];
            if (!view) return;
            view.info = info;
            const st = view.element.style;
            st.display = maximized === null ? 'flex' : 'none';
            if (info.dir === 'row') {
                st.left = `${info.gap.x + info.gap.w / 2 - half}px`;
                st.top = `${info.gap.y}px`;
                st.width = `${DIVIDER_HIT_PX}px`;
                st.height = `${info.gap.h}px`;
            } else {
                st.top = `${info.gap.y + info.gap.h / 2 - half}px`;
                st.left = `${info.gap.x}px`;
                st.height = `${DIVIDER_HIT_PX}px`;
                st.width = `${info.gap.w}px`;
            }
        });
        this._refreshMaxButtons();
    }

    private _rebuildSplitters(): void {
        for (const s of this._splitters) s.element.remove();
        this._splitters = [];
        const geo = this._geometry();
        geo.splitters.forEach((info, k) => {
            const element = document.createElement('div');
            element.className = `tv-multi-chart-divider tv-multi-chart-divider-${info.dir}`;
            element.style.cssText = `
                position: absolute;
                z-index: 6;
                touch-action: none;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: ${info.dir === 'row' ? 'col-resize' : 'row-resize'};
            `;
            const line = document.createElement('div');
            line.style.cssText = `
                background: ${DIVIDER_ACCENT};
                border-radius: 2px;
                opacity: 0;
                transition: opacity 0.12s;
                pointer-events: none;
                ${info.dir === 'row' ? 'width: 3px; height: 100%;' : 'height: 3px; width: 100%;'}
            `;
            element.appendChild(line);
            const view: SplitterView = { element, line, info };
            const setHot = (hot: boolean) => { line.style.opacity = hot ? '1' : '0'; };
            element.addEventListener('pointerenter', () => setHot(true));
            element.addEventListener('pointerleave', () => {
                if (!this._draggingSplitter) setHot(false);
            });
            element.addEventListener('pointerdown', (evt) => this._startDrag(evt, k, setHot));
            element.addEventListener('dblclick', () => this._equalise(k));
            this._grid.appendChild(element);
            this._splitters.push(view);
        });
    }

    private _startDrag(evt: PointerEvent, k: number, setHot: (hot: boolean) => void): void {
        evt.preventDefault();
        const element = this._splitters[k].element;
        element.setPointerCapture(evt.pointerId);
        this._draggingSplitter = true;
        setHot(true);
        const previousUserSelect = document.body.style.userSelect;
        document.body.style.userSelect = 'none';

        const onMove = (e: PointerEvent) => {
            const info = this._splitters[k]?.info;
            if (!info) return;
            const rect = this._grid.getBoundingClientRect();
            const pos = info.dir === 'row' ? e.clientX - rect.left : e.clientY - rect.top;
            const weights = applyDrag(info, pos);
            this._sizes[this._layout] = { ...(this._sizes[this._layout] || {}), [info.key]: weights };
            this._relayout();
        };
        const onEnd = (e: PointerEvent) => {
            element.removeEventListener('pointermove', onMove);
            element.removeEventListener('pointerup', onEnd);
            element.removeEventListener('pointercancel', onEnd);
            if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
            document.body.style.userSelect = previousUserSelect;
            this._draggingSplitter = false;
            setHot(false);
            this._fireSizesChanged();
        };
        element.addEventListener('pointermove', onMove);
        element.addEventListener('pointerup', onEnd);
        element.addEventListener('pointercancel', onEnd);
    }

    /** Double-click: equal sizes for the siblings of this splitter. */
    private _equalise(k: number): void {
        const info = this._splitters[k]?.info;
        if (!info) return;
        this._sizes[this._layout] = { ...(this._sizes[this._layout] || {}), [info.key]: equalWeights(info) };
        this._relayout();
        this._fireSizesChanged();
    }

    private _fireSizesChanged(): void {
        this._sizesChanged.fire({ layout: this._layout, sizes: this.getLayoutSizes() });
        this._ratiosChanged.fire({ layout: this._layout, ...this.getRatios() });
    }

    private _syncToolbarStateFromActiveChart(): void {
        if (!this._toolbarWidget || !this.activeChart) {
            return;
        }

        this._toolbarWidget.setSymbol(this.activeChart.symbol);
        this._toolbarWidget.setTimeframe(this.activeChart.timeframe, false);
        this._toolbarWidget.setChartType(this.activeChart.chartType, false);
        this._toolbarWidget.setPriceScaleMode(this.activeChart.priceScaleMode, false);
        const spot = this.activeChart.getSpotState();
        this._toolbarWidget.setSpotButton(spot.label, spot.active);
        this._watchlistPanel?.setActiveSymbol(this.activeChart.symbol);
        this._alertsPanel?.notifyActiveChartChanged();
    }

    // --- sync handlers ---

    /** Time / Date range sync: align every other chart to the chart `index` (by TIME, not bar index). */
    private _syncViewFrom(index: number): void {
        const source = this._charts[index];
        const range = source?.getVisibleTimeRange();
        if (!range) return;
        this._viewSyncing = true;
        try {
            this._charts.forEach((other, i) => {
                if (i === index) return;
                if (this._sync.dateRange) other.setVisibleTimeRange(range.from, range.to);
                else other.setRightEdgeTime(range.to);
            });
        } finally {
            this._viewSyncing = false;
        }
    }

    private _handleSymbolChanged(index: number, payload: SymbolInfo | string): void {
        this._symbolChanged.fire({ index, symbol: payload });

        if (index === this._activeIndex) {
            this._syncToolbarStateFromActiveChart();
        }

        if (this._syncing || !this._sync.symbol) {
            return;
        }
        this._propagateSymbol(index, payload);
    }

    private _propagateSymbol(index: number, payload: SymbolInfo | string): void {
        this._syncing = true;
        try {
            for (let i = 0; i < this._charts.length; i++) {
                if (i === index) {
                    continue;
                }

                const nextSymbol = typeof payload === 'string' ? payload : payload.symbol;
                const nextExchange = typeof payload === 'string' ? undefined : payload.exchange;
                const target = this._charts[i];

                if (target.symbol === nextSymbol && (!nextExchange || target.model.exchange === nextExchange)) {
                    continue;
                }

                target.setSymbol(typeof payload === 'string' ? nextSymbol : payload);
            }
        } finally {
            this._syncing = false;
        }
    }

    /** Replay sync: the active chart drives the others (see `replay`). */
    private _handleReplayState(index: number): void {
        if (this._replaySyncing || !this._replaySync || index !== this._activeIndex) return;
        const source = this._charts[index];
        if (!source) return;
        const state = source.replay.state;
        this._replaySyncing = true;
        try {
            if (state.active) {
                const cursorMs = source.replay.cursorMs;
                if (cursorMs === null) return;
                for (let i = 0; i < this._charts.length; i++) {
                    if (i !== index) this._charts[i].replay.syncCursor(cursorMs);
                }
            } else {
                for (let i = 0; i < this._charts.length; i++) {
                    if (i !== index && this._charts[i].replay.active) void this._charts[i].replay.stop();
                }
            }
        } finally {
            this._replaySyncing = false;
        }
    }

    private async _stopAllReplays(): Promise<void> {
        this._replaySyncing = true;
        try {
            await Promise.all(this._charts.map((c) => c.replay.stop()));
        } finally {
            this._replaySyncing = false;
        }
    }

    private _handleTimeframeChanged(index: number, timeframe: string): void {
        this._timeframeChanged.fire({ index, timeframe });

        if (index === this._activeIndex) {
            this._syncToolbarStateFromActiveChart();
        }

        if (this._syncing || !this._sync.interval) {
            return;
        }
        this._propagateTimeframe(index, timeframe);
    }

    private _propagateTimeframe(index: number, timeframe: string): void {
        this._syncing = true;
        try {
            for (let i = 0; i < this._charts.length; i++) {
                if (i === index) {
                    continue;
                }

                const target = this._charts[i];
                if (target.timeframe === timeframe) {
                    continue;
                }

                target.setTimeframe(timeframe);
            }
        } finally {
            this._syncing = false;
        }
    }
}

export function createMultiChartLayout(
    container: HTMLElement | string,
    options: MultiChartLayoutOptions = {}
): MultiChartLayout {
    return new MultiChartLayout(container, options);
}
