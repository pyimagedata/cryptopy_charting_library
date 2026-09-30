import { Delegate } from '../helpers/delegate';
import { ChartModelOptions } from '../model/chart-model';
import { ChartWidget } from './chart-widget';
import { SymbolInfo } from './symbol_search';
import { ToolbarWidget, ChartType } from './toolbar';

export type MultiChartLayoutType = '1x1' | '2x1' | '1x2' | '1x3' | '2x2';

export interface MultiChartSlotOptions extends Partial<ChartModelOptions> {
    symbol?: string;
    timeframe?: string;
    exchange?: string;
    locale?: string;
}

/**
 * Hucrelerin birbirine gore boyutu: her eksen icin goreli agirliklar (fr).
 * Ornegin 1x2'de columns [3, 2] sol hucrenin sagdakinden 1.5 kat genis
 * olmasi demek. Uzunluk, layout'un sutun/satir sayisina esit olmali.
 */
export interface MultiChartRatios {
    columns: number[];
    rows: number[];
}

export interface MultiChartRatiosChangeEvent extends MultiChartRatios {
    layout: MultiChartLayoutType;
}

export interface MultiChartLayoutOptions {
    layout?: MultiChartLayoutType;
    charts?: MultiChartSlotOptions[];
    syncSymbol?: boolean;
    syncTimeframe?: boolean;
    activeIndex?: number;
    gap?: number;
    locale?: string;
    /** Baslangic hucre oranlari (sadece `layout` icin gecerli; gecersizse esit bolunur). */
    ratios?: Partial<MultiChartRatios>;
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

const defaultOptions: Required<Pick<MultiChartLayoutOptions, 'layout' | 'syncSymbol' | 'syncTimeframe' | 'activeIndex' | 'gap'>> = {
    layout: '2x2',
    syncSymbol: false,
    syncTimeframe: false,
    activeIndex: 0,
    gap: 8,
};

type LayoutPreset = { count: number; columns: number; rows: number; positions: Array<{ col: number; row: number }> };

const LAYOUT_PRESETS: Record<MultiChartLayoutType, LayoutPreset> = {
    '1x1': { count: 1, columns: 1, rows: 1, positions: [{ col: 1, row: 1 }] },
    '2x1': { count: 2, columns: 1, rows: 2, positions: [{ col: 1, row: 1 }, { col: 1, row: 2 }] },
    '1x2': { count: 2, columns: 2, rows: 1, positions: [{ col: 1, row: 1 }, { col: 2, row: 1 }] },
    '1x3': { count: 3, columns: 3, rows: 1, positions: [{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 }] },
    '2x2': {
        count: 4,
        columns: 2,
        rows: 2,
        positions: [{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 1, row: 2 }, { col: 2, row: 2 }]
    },
};

/** Bir hucrenin (px) inebilecegi en kucuk boyut -- altina inerse grafik kaybolur. */
const MIN_PANE_PX = 160;
/** Ayirici tutamacinin tiklama alani (gorunen gap sadece 8px, tutmak zor olurdu). */
const DIVIDER_HIT_PX = 14;
const DIVIDER_ACCENT = 'rgba(41, 98, 255, 0.85)';

type DividerKind = 'col' | 'row' | 'cross';
interface Divider {
    kind: DividerKind;
    /** col/row icin: bu ayirici index ve index+1. iz (track) arasinda. */
    index: number;
    element: HTMLElement;
    line: HTMLElement | null;
}

export class MultiChartLayout {
    private readonly _container: HTMLElement;
    private readonly _element: HTMLElement;
    private readonly _grid: HTMLElement;
    private _toolbarWidget: ToolbarWidget | null = null;
    private _layout: MultiChartLayoutType;
    private _options: MultiChartLayoutOptions;
    private _charts: ChartWidget[] = [];
    private _slots: HTMLElement[] = [];
    private _activeIndex: number = 0;
    private _syncing: boolean = false;
    private _crosshairSync: boolean = MultiChartLayout.crosshairSyncPreferred();

    private static readonly CROSSHAIR_SYNC_STORAGE = 'chart.multi.crosshairSync';

    /** Kullanici tercihi (varsayilan acik); sadece bu tarayicida saklanir. */
    static crosshairSyncPreferred(): boolean {
        try {
            return localStorage.getItem(MultiChartLayout.CROSSHAIR_SYNC_STORAGE) !== '0';
        } catch {
            return true;
        }
    }

    get crosshairSync(): boolean {
        return this._crosshairSync;
    }

    /** Imleci tum grafiklerde ayni zamana senkronize et (TradingView "crosshair sync"). */
    setCrosshairSync(enabled: boolean): void {
        this._crosshairSync = enabled;
        try {
            localStorage.setItem(MultiChartLayout.CROSSHAIR_SYNC_STORAGE, enabled ? '1' : '0');
        } catch {
            // Tercih kaydedilemese de bu oturumda calisir.
        }
        this._charts.forEach((c) => c.setCrosshairSyncEnabled(enabled));
    }
    private _theme: 'dark' | 'light' = 'dark';
    private _domEnabled: boolean = false;
    private _columnRatios: number[] = [1];
    private _rowRatios: number[] = [1];
    private _dividers: Divider[] = [];
    private _draggingDivider = false;
    private _gridResizeObserver: ResizeObserver | null = null;

    private readonly _ratiosChanged = new Delegate<MultiChartRatiosChangeEvent>();
    private readonly _activeChartChanged = new Delegate<number>();
    private readonly _symbolChanged = new Delegate<MultiChartSymbolChangeEvent>();
    private readonly _timeframeChanged = new Delegate<MultiChartTimeframeChangeEvent>();

    constructor(container: HTMLElement | string, options: MultiChartLayoutOptions = {}) {
        this._container = typeof container === 'string'
            ? document.querySelector(container) as HTMLElement
            : container;

        if (!this._container) {
            throw new Error('MultiChartLayout container not found');
        }

        this._options = { ...defaultOptions, ...options };
        this._layout = this._options.layout || defaultOptions.layout;
        this._activeIndex = this._options.activeIndex ?? defaultOptions.activeIndex;

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
            display: grid;
            position: relative;
            background: #0f172a;
        `;

        this._container.appendChild(this._element);
        this._element.appendChild(this._grid);

        this._resetRatios(this._options.ratios);
        this._buildLayout(this._options.charts || []);
        this._createToolbar();
        this.setActiveChart(Math.min(this._activeIndex, this._charts.length - 1));

        if (typeof ResizeObserver !== 'undefined') {
            this._gridResizeObserver = new ResizeObserver(() => this._layoutDividers());
            this._gridResizeObserver.observe(this._grid);
        }
    }

    get charts(): readonly ChartWidget[] {
        return this._charts;
    }

    get activeChart(): ChartWidget | null {
        return this._charts[this._activeIndex] ?? null;
    }

    get activeChartChanged(): Delegate<number> {
        return this._activeChartChanged;
    }

    /** Kullanici bir ayiriciyi surukleyip biraktiginda (ya da cift tikla sifirladiginda) tetiklenir. */
    get ratiosChanged(): Delegate<MultiChartRatiosChangeEvent> {
        return this._ratiosChanged;
    }

    getRatios(): MultiChartRatios {
        return { columns: [...this._columnRatios], rows: [...this._rowRatios] };
    }

    /** Hucre oranlarini programatik ayarlar (olay tetiklemez). Gecersiz eksen yok sayilir. */
    setRatios(ratios: Partial<MultiChartRatios>): void {
        this._resetRatios(ratios);
        this._applyGridTemplate();
        this._layoutDividers();
    }

    get symbolChanged(): Delegate<MultiChartSymbolChangeEvent> {
        return this._symbolChanged;
    }

    get timeframeChanged(): Delegate<MultiChartTimeframeChangeEvent> {
        return this._timeframeChanged;
    }

    getChart(index: number): ChartWidget | null {
        return this._charts[index] ?? null;
    }

    setLayout(layout: MultiChartLayoutType): void {
        if (this._layout === layout) {
            return;
        }

        const currentSlots = this._charts.map((chart) => ({
            symbol: chart.symbol,
            timeframe: chart.timeframe,
            exchange: chart.model.exchange,
            locale: this._options.locale,
        }));

        this._layout = layout;
        this._resetRatios();
        this._buildLayout(currentSlots);
        this._createToolbar();
        this.setActiveChart(Math.min(this._activeIndex, this._charts.length - 1));
    }

    setActiveChart(index: number): void {
        if (index < 0 || index >= this._slots.length) {
            return;
        }

        this._activeIndex = index;
        this._slots.forEach((slot, slotIndex) => {
            slot.style.borderColor = slotIndex === index ? '#2962ff' : 'rgba(148, 163, 184, 0.16)';
            slot.style.boxShadow = slotIndex === index
                ? 'inset 0 0 0 1px rgba(41, 98, 255, 0.3)'
                : 'none';
        });

        this._syncToolbarStateFromActiveChart();
        this._activeChartChanged.fire(index);
    }

    setSync(options: Pick<MultiChartLayoutOptions, 'syncSymbol' | 'syncTimeframe'>): void {
        this._options = { ...this._options, ...options };
    }

    destroy(): void {
        for (const chart of this._charts) {
            chart.dispose();
        }
        this._charts = [];
        this._slots = [];
        this._toolbarWidget?.dispose();
        this._toolbarWidget = null;
        this._gridResizeObserver?.disconnect();
        this._gridResizeObserver = null;
        this._dividers = [];
        this._element.remove();
        this._ratiosChanged.destroy();
        this._activeChartChanged.destroy();
        this._symbolChanged.destroy();
        this._timeframeChanged.destroy();
    }

    private _createToolbar(): void {
        this._toolbarWidget?.dispose();

        const activeChart = this.activeChart;
        this._toolbarWidget = new ToolbarWidget(this._element, {
            symbol: activeChart?.symbol || defaultSlotOptions.symbol,
            timeframe: activeChart?.timeframe || defaultSlotOptions.timeframe,
            chartType: activeChart?.chartType || 'candles',
            locale: this._options.locale || 'en',
            priceScaleMode: activeChart?.priceScaleMode || 'normal',
        });
        this._toolbarWidget.setTheme(this._theme);

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
            this._theme = theme;
            for (const chart of this._charts) {
                chart.setTheme(theme);
            }
        });

        this._toolbarWidget.languageChanged.subscribe((locale) => {
            this._options = { ...this._options, locale };
            for (const chart of this._charts) {
                chart.setLanguage(locale);
            }
            this._createToolbar();
            this._syncToolbarStateFromActiveChart();
        });

        this._toolbarWidget.domToggled.subscribe((enabled) => {
            this._domEnabled = enabled;
            for (const chart of this._charts) {
                chart.setDomEnabled(enabled);
            }
        });
    }

    private _buildLayout(slotOptions: MultiChartSlotOptions[]): void {
        for (const chart of this._charts) {
            chart.dispose();
        }

        this._charts = [];
        this._slots = [];
        this._grid.innerHTML = '';

        const preset = LAYOUT_PRESETS[this._layout];
        this._applyGridTemplate();

        for (let i = 0; i < preset.count; i++) {
            const slot = document.createElement('div');
            slot.className = 'tv-multi-chart-slot';
            slot.style.cssText = `
                position: relative;
                min-width: 0;
                min-height: 0;
                overflow: hidden;
                border: 1px solid rgba(148, 163, 184, 0.16);
                border-radius: 10px;
                background: #131722;
            `;
            slot.style.gridColumn = `${preset.positions[i].col}`;
            slot.style.gridRow = `${preset.positions[i].row}`;

            slot.addEventListener('pointerdown', () => {
                this.setActiveChart(i);
            });

            this._grid.appendChild(slot);
            this._slots.push(slot);

            const options = {
                ...defaultSlotOptions,
                locale: this._options.locale || 'en',
                ...(slotOptions[i] || {}),
                showToolbar: false,
                showDrawingToolbar: true,
            };

            const chart = new ChartWidget(slot, options);
            chart.addCandlestickSeries({
                upColor: '#26a69a',
                downColor: '#ef5350',
                borderVisible: false,
                wickVisible: true,
            });
            chart.setTheme(this._theme);
            chart.setDomEnabled(this._domEnabled);
            chart.symbolChanged.subscribe((payload) => this._handleSymbolChanged(i, payload as any));
            chart.timeframeChanged.subscribe((timeframe) => this._handleTimeframeChanged(i, timeframe));
            chart.setCrosshairSyncEnabled(this._crosshairSync);
            chart.crosshairMoved.subscribe((info) => {
                if (!this._crosshairSync) return;
                this._charts.forEach((other) => {
                    if (other !== chart) other.setSyncedCrosshair(info);
                });
            });

            this._charts.push(chart);
        }

        this._buildDividers();
    }

    private _applyGridTemplate(): void {
        const track = (ratio: number) => `minmax(0, ${ratio}fr)`;
        this._grid.style.gridTemplateColumns = this._columnRatios.map(track).join(' ');
        this._grid.style.gridTemplateRows = this._rowRatios.map(track).join(' ');
        this._grid.style.gridAutoFlow = 'row';
        this._grid.style.gap = `${this._gap}px`;
    }

    private get _gap(): number {
        return this._options.gap ?? defaultOptions.gap;
    }

    /** Esit oranlara doner; `initial` gecerliyse (uzunluk + pozitif sayilar) o eksen icin onu kullanir. */
    private _resetRatios(initial?: Partial<MultiChartRatios>): void {
        const preset = LAYOUT_PRESETS[this._layout];
        const valid = (values: number[] | undefined, length: number): values is number[] =>
            Array.isArray(values) && values.length === length && values.every((v) => Number.isFinite(v) && v > 0);
        this._columnRatios = valid(initial?.columns, preset.columns) ? [...initial!.columns!] : new Array(preset.columns).fill(1);
        this._rowRatios = valid(initial?.rows, preset.rows) ? [...initial!.rows!] : new Array(preset.rows).fill(1);
    }

    // --- Yeniden boyutlandirma ayiricilari ---

    private _buildDividers(): void {
        this._dividers = [];

        const addDivider = (kind: DividerKind, index: number): Divider => {
            const element = document.createElement('div');
            element.className = `tv-multi-chart-divider tv-multi-chart-divider-${kind}`;
            element.style.cssText = `
                position: absolute;
                z-index: ${kind === 'cross' ? 7 : 6};
                touch-action: none;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: ${kind === 'col' ? 'col-resize' : kind === 'row' ? 'row-resize' : 'move'};
            `;
            let line: HTMLElement | null = null;
            if (kind !== 'cross') {
                line = document.createElement('div');
                line.style.cssText = `
                    background: ${DIVIDER_ACCENT};
                    border-radius: 2px;
                    opacity: 0;
                    transition: opacity 0.12s;
                    pointer-events: none;
                    ${kind === 'col' ? 'width: 3px; height: 100%;' : 'height: 3px; width: 100%;'}
                `;
                element.appendChild(line);
            } else {
                element.style.borderRadius = '50%';
            }
            const divider: Divider = { kind, index, element, line };

            const setHot = (hot: boolean) => {
                if (divider.line) {
                    divider.line.style.opacity = hot ? '1' : '0';
                } else {
                    element.style.background = hot ? DIVIDER_ACCENT : 'transparent';
                }
            };
            element.addEventListener('pointerenter', () => setHot(true));
            element.addEventListener('pointerleave', () => {
                // Surukleme sirasinda pointer capture var, imlec ayiricidan
                // "cikmis" gorunse de vurgu surukleme bitene kadar kalir.
                if (!this._draggingDivider) setHot(false);
            });
            element.addEventListener('pointerdown', (evt) => this._startDrag(evt, divider, setHot));
            element.addEventListener('dblclick', () => this._resetAxis(kind));

            this._grid.appendChild(element);
            this._dividers.push(divider);
            return divider;
        };

        const preset = LAYOUT_PRESETS[this._layout];
        for (let i = 0; i < preset.columns - 1; i++) addDivider('col', i);
        for (let i = 0; i < preset.rows - 1; i++) addDivider('row', i);
        // 2x2'de dikey ve yatay ayiricinin kesistigi noktadan ikisi birden surulur.
        if (preset.columns === 2 && preset.rows === 2) addDivider('cross', 0);

        this._layoutDividers();
    }

    private _trackSizes(total: number, ratios: number[]): number[] {
        const available = Math.max(0, total - this._gap * (ratios.length - 1));
        const sum = ratios.reduce((a, b) => a + b, 0);
        return ratios.map((r) => (available * r) / sum);
    }

    /** i. ve i+1. iz arasindaki bosluğun merkezi (grid'in sol/ust kenarindan px). */
    private _boundaryCenter(sizes: number[], i: number): number {
        let pos = 0;
        for (let k = 0; k <= i; k++) pos += sizes[k];
        return pos + this._gap * i + this._gap / 2;
    }

    private _layoutDividers(): void {
        if (this._dividers.length === 0) return;
        const width = this._grid.clientWidth;
        const height = this._grid.clientHeight;
        const colSizes = this._trackSizes(width, this._columnRatios);
        const rowSizes = this._trackSizes(height, this._rowRatios);
        const half = DIVIDER_HIT_PX / 2;

        for (const d of this._dividers) {
            const style = d.element.style;
            if (d.kind === 'col') {
                style.left = `${this._boundaryCenter(colSizes, d.index) - half}px`;
                style.top = '0px';
                style.width = `${DIVIDER_HIT_PX}px`;
                style.height = '100%';
            } else if (d.kind === 'row') {
                style.top = `${this._boundaryCenter(rowSizes, d.index) - half}px`;
                style.left = '0px';
                style.height = `${DIVIDER_HIT_PX}px`;
                style.width = '100%';
            } else {
                style.left = `${this._boundaryCenter(colSizes, 0) - DIVIDER_HIT_PX}px`;
                style.top = `${this._boundaryCenter(rowSizes, 0) - DIVIDER_HIT_PX}px`;
                style.width = `${DIVIDER_HIT_PX * 2}px`;
                style.height = `${DIVIDER_HIT_PX * 2}px`;
            }
        }
    }

    private _startDrag(evt: PointerEvent, divider: Divider, setHot: (hot: boolean) => void): void {
        evt.preventDefault();
        const element = divider.element;
        element.setPointerCapture(evt.pointerId);
        this._draggingDivider = true;
        setHot(true);
        const previousUserSelect = document.body.style.userSelect;
        document.body.style.userSelect = 'none';

        const onMove = (e: PointerEvent) => {
            if (divider.kind === 'col' || divider.kind === 'cross') {
                this._dragTrack('col', divider.kind === 'cross' ? 0 : divider.index, e.clientX);
            }
            if (divider.kind === 'row' || divider.kind === 'cross') {
                this._dragTrack('row', divider.kind === 'cross' ? 0 : divider.index, e.clientY);
            }
            this._applyGridTemplate();
            this._layoutDividers();
        };
        const onEnd = (e: PointerEvent) => {
            element.removeEventListener('pointermove', onMove);
            element.removeEventListener('pointerup', onEnd);
            element.removeEventListener('pointercancel', onEnd);
            if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
            document.body.style.userSelect = previousUserSelect;
            this._draggingDivider = false;
            setHot(false);
            this._fireRatiosChanged();
        };
        element.addEventListener('pointermove', onMove);
        element.addEventListener('pointerup', onEnd);
        element.addEventListener('pointercancel', onEnd);
    }

    /** i. ve i+1. izin toplam payini korur, aralarindaki siniri imlece tasir (min boyut sinirli). */
    private _dragTrack(axis: 'col' | 'row', i: number, clientPos: number): void {
        const rect = this._grid.getBoundingClientRect();
        const ratios = axis === 'col' ? this._columnRatios : this._rowRatios;
        const total = axis === 'col' ? rect.width : rect.height;
        const origin = axis === 'col' ? rect.left : rect.top;
        const sizes = this._trackSizes(total, ratios);

        let start = 0;
        for (let k = 0; k < i; k++) start += sizes[k] + this._gap;
        const pairContent = sizes[i] + sizes[i + 1];
        const minPx = Math.min(MIN_PANE_PX, pairContent / 2);
        const wanted = clientPos - origin - start - this._gap / 2;
        const first = Math.min(Math.max(wanted, minPx), pairContent - minPx);

        const pairRatio = ratios[i] + ratios[i + 1];
        ratios[i] = (pairRatio * first) / pairContent;
        ratios[i + 1] = pairRatio - ratios[i];
    }

    private _resetAxis(kind: DividerKind): void {
        const preset = LAYOUT_PRESETS[this._layout];
        if (kind === 'col' || kind === 'cross') this._columnRatios = new Array(preset.columns).fill(1);
        if (kind === 'row' || kind === 'cross') this._rowRatios = new Array(preset.rows).fill(1);
        this._applyGridTemplate();
        this._layoutDividers();
        this._fireRatiosChanged();
    }

    private _fireRatiosChanged(): void {
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
    }

    private _handleSymbolChanged(index: number, payload: SymbolInfo | string): void {
        this._symbolChanged.fire({ index, symbol: payload });

        if (index === this._activeIndex) {
            this._syncToolbarStateFromActiveChart();
        }

        if (this._syncing || !this._options.syncSymbol) {
            return;
        }

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

    private _handleTimeframeChanged(index: number, timeframe: string): void {
        this._timeframeChanged.fire({ index, timeframe });

        if (index === this._activeIndex) {
            this._syncToolbarStateFromActiveChart();
        }

        if (this._syncing || !this._options.syncTimeframe) {
            return;
        }

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
