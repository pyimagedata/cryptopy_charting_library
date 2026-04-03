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

export interface MultiChartLayoutOptions {
    layout?: MultiChartLayoutType;
    charts?: MultiChartSlotOptions[];
    syncSymbol?: boolean;
    syncTimeframe?: boolean;
    activeIndex?: number;
    gap?: number;
    locale?: string;
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

const LAYOUT_PRESETS: Record<MultiChartLayoutType, { count: number; columns: string; rows: string; positions: Array<{ col: number; row: number }> }> = {
    '1x1': { count: 1, columns: 'minmax(0, 1fr)', rows: 'minmax(0, 1fr)', positions: [{ col: 1, row: 1 }] },
    '2x1': {
        count: 2,
        columns: 'minmax(0, 1fr)',
        rows: 'minmax(0, 1fr) minmax(0, 1fr)',
        positions: [{ col: 1, row: 1 }, { col: 1, row: 2 }]
    },
    '1x2': {
        count: 2,
        columns: 'minmax(0, 1fr) minmax(0, 1fr)',
        rows: 'minmax(0, 1fr)',
        positions: [{ col: 1, row: 1 }, { col: 2, row: 1 }]
    },
    '1x3': {
        count: 3,
        columns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)',
        rows: 'minmax(0, 1fr)',
        positions: [{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 1 }]
    },
    '2x2': {
        count: 4,
        columns: 'minmax(0, 1fr) minmax(0, 1fr)',
        rows: 'minmax(0, 1fr) minmax(0, 1fr)',
        positions: [{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 1, row: 2 }, { col: 2, row: 2 }]
    },
};

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
    private _theme: 'dark' | 'light' = 'dark';
    private _domEnabled: boolean = false;

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
            background: #0f172a;
        `;

        this._container.appendChild(this._element);
        this._element.appendChild(this._grid);

        this._buildLayout(this._options.charts || []);
        this._createToolbar();
        this.setActiveChart(Math.min(this._activeIndex, this._charts.length - 1));
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
        this._element.remove();
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

        const preset = this._applyGridPreset();

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

            this._charts.push(chart);
        }
    }

    private _applyGridPreset() {
        const preset = LAYOUT_PRESETS[this._layout];
        this._grid.style.gridTemplateColumns = preset.columns;
        this._grid.style.gridTemplateRows = preset.rows;
        this._grid.style.gridAutoFlow = 'row';
        this._grid.style.gap = `${this._options.gap ?? defaultOptions.gap}px`;
        return preset;
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
