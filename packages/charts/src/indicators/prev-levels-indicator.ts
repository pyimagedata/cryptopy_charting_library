/**
 * Previous period High/Low: horizontal lines for the COMPLETED previous day / week / month
 * (PDH PDL PWH PWL PMH PML, optional previous close and current period open).
 *
 * Computed on the client from the loaded bars. Strictly causal: a level shown during period P uses
 * only bars of the period before P. If the loaded history starts inside that previous period, its
 * level is not drawn (it would be wrong).
 */

import { OverlayIndicator, IndicatorOptions, IndicatorRange } from './indicator';
import { BarData } from '../model/data';
import { TimeScale } from '../model/time-scale';
import { PriceScale } from '../model/price-scale';
import { t } from '../helpers/translations';
import { IndicatorLegendInfo } from './legend-info';
import {
    IndicatorSettingsConfig, createInputsTab, createStyleTab, createVisibilityTab,
    checkboxRow, colorRow, numberRow, selectRow, lineWidthRow,
} from '../gui/indicator_settings';
import {
    PeriodSeries, PeriodKind, DayStart, previousLevelSets, timeframeSeconds, barIntervalSeconds,
    periodNominalSeconds, formatLevelPrice, detectDayStart,
} from './time-periods';
import { LevelLine, LEVEL_STYLE_OPTIONS, normalizeLevelStyle, drawLevelLines } from './level-lines-draw';

export interface PrevLevelsOptions extends IndicatorOptions {
    dayStart: DayStart | 'auto';
    showDay: boolean;
    showWeek: boolean;
    showMonth: boolean;
    showPrevClose: boolean;
    showOpen: boolean;
    /** Levels for the current period plus this many - 1 past periods (1 = current only) */
    periods: number;
    showLabels: boolean;
    showPrice: boolean;
    dayColor: string;
    weekColor: string;
    monthColor: string;
    lineStyle: 'solid' | 'dashed' | 'dotted';
}

const defaultPrevLevelsOptions: Partial<PrevLevelsOptions> = {
    name: 'Previous Day/Week/Month High Low',
    color: '#2962ff',
    lineWidth: 1,
    dayStart: 'auto',
    showDay: true,
    showWeek: true,
    showMonth: true,
    showPrevClose: false,
    showOpen: false,
    periods: 1,
    showLabels: true,
    showPrice: true,
    dayColor: '#2962ff',
    weekColor: '#ff9800',
    monthColor: '#ab47bc',
    lineStyle: 'solid',
};

interface GroupDef {
    kind: PeriodKind;
    /** Label prefix letter: D / W / M */
    letter: string;
    showKey: 'showDay' | 'showWeek' | 'showMonth';
    colorKey: 'dayColor' | 'weekColor' | 'monthColor';
}

const GROUPS: ReadonlyArray<GroupDef> = [
    { kind: 'day', letter: 'D', showKey: 'showDay', colorKey: 'dayColor' },
    { kind: 'week', letter: 'W', showKey: 'showWeek', colorKey: 'weekColor' },
    { kind: 'month', letter: 'M', showKey: 'showMonth', colorKey: 'monthColor' },
];

export class PrevLevelsIndicator extends OverlayIndicator {
    private readonly _series: Record<PeriodKind, PeriodSeries> = {
        day: new PeriodSeries('day', 'utc'),
        week: new PeriodSeries('week', 'utc'),
        month: new PeriodSeries('month', 'utc'),
    };
    private _tf = '';
    private _ctxKey = '';
    private _autoKey = '';
    private _autoDayStart: DayStart = 'utc';
    private _lines: LevelLine[] = [];
    /** Lines of the current period (legend values) */
    private _current: Array<{ label: string; price: number; color: string }> = [];

    constructor(options: Partial<PrevLevelsOptions> = {}) {
        super({ ...defaultPrevLevelsOptions, ...options });
    }

    private get _o(): PrevLevelsOptions {
        return this._options as PrevLevelsOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._options };
    }

    setContext(ctx: { symbol: string; timeframe: string; exchange?: string; end?: number }): void {
        const key = `${ctx.symbol}|${ctx.exchange ?? ''}`;
        const keyChanged = key !== this._ctxKey;
        if (keyChanged) {
            this._ctxKey = key;
            for (const k of Object.keys(this._series) as PeriodKind[]) this._series[k].reset();
        }
        if (ctx.timeframe !== this._tf || keyChanged) {
            this._tf = ctx.timeframe;
            this._rebuild();
            this._dataChanged.fire();
        }
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    rows: [
                        selectRow('dayStart', t('Day starts at'), [
                            { value: 'auto', label: t('Auto') },
                            { value: 'utc', label: t('UTC 00:00') },
                            { value: 'ny17', label: t('New York 17:00') },
                        ], 'auto'),
                        checkboxRow('showDay', t('Previous day (PDH / PDL)'), true),
                        checkboxRow('showWeek', t('Previous week (PWH / PWL)'), true),
                        checkboxRow('showMonth', t('Previous month (PMH / PML)'), true),
                        checkboxRow('showPrevClose', t('Previous close (PDC / PWC / PMC)'), false),
                        checkboxRow('showOpen', t('Current open (DO / WO / MO)'), false),
                        numberRow('periods', t('Past periods to draw'), 1, 10, 1),
                    ],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('dayColor', t('Day color'), '#2962ff'),
                        colorRow('weekColor', t('Week color'), '#ff9800'),
                        colorRow('monthColor', t('Month color'), '#ab47bc'),
                        lineWidthRow('lineWidth', t('Line Width')),
                        selectRow('lineStyle', t('Line style'), LEVEL_STYLE_OPTIONS.map(o => ({ value: o.value, label: t(o.label) })), 'solid'),
                        checkboxRow('showLabels', t('Show labels'), true),
                        checkboxRow('showPrice', t('Show price in labels'), true),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this._options.visible;
        return (this._options as any)[key];
    }

    setSettingValue(key: string, value: any): boolean {
        if (key === 'periods') {
            const n = Math.round(Number(value));
            value = Number.isFinite(n) ? Math.max(1, Math.min(10, n)) : 1;
        } else if (key === 'dayStart') {
            value = value === 'ny17' || value === 'utc' ? value : 'auto';
        } else if (key === 'lineStyle') {
            value = normalizeLevelStyle(value);
        }
        (this._options as any)[key] = value;
        this._rebuild();
        this._dataChanged.fire();
        return false;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._rebuild();
    }

    private _rebuild(): void {
        const bars = this._sourceData;
        const o = this._o;
        this._data = bars.map(b => ({ time: b.time, value: NaN }));
        this._lines = [];
        this._current = [];
        if (bars.length < 2) return;
        const intervalSec = timeframeSeconds(this._tf) ?? barIntervalSeconds(bars);
        if (!(intervalSec > 0)) return;
        const dayStart = this._resolveDayStart(bars);
        const style = normalizeLevelStyle(o.lineStyle);
        const count = Math.max(1, Math.min(10, Math.round(o.periods) || 1));

        for (const g of GROUPS) {
            if (!o[g.showKey]) continue;
            // Hide day levels at >= 1D, week levels at >= 1W, month levels at >= 1M.
            if (intervalSec >= periodNominalSeconds(g.kind)) continue;
            const series = this._series[g.kind];
            series.configure(dayStart);
            series.update(bars);
            const color = String(o[g.colorKey]);
            for (const set of previousLevelSets(series, bars, intervalSec, count)) {
                const endIdx = set.isCurrent ? -1 : set.endIdx;
                const add = (code: string, price: number, ls: LevelLine['style']) => {
                    const priceText = o.showPrice ? formatLevelPrice(price, o.precision) : '';
                    this._lines.push({ code, priceText, price, color, style: ls, startIdx: set.startIdx, endIdx });
                    if (set.isCurrent) this._current.push({ label: code, price, color });
                };
                add(`P${g.letter}H`, set.prevHigh, style);
                add(`P${g.letter}L`, set.prevLow, style);
                if (o.showPrevClose) add(`P${g.letter}C`, set.prevClose, 'dotted');
                if (o.showOpen) add(`${g.letter}O`, set.open, 'dashed');
            }
        }
    }

    /** 'auto' is decided once per data load (symbol / first bar), not on every tick. */
    private _resolveDayStart(bars: BarData[]): DayStart {
        const mode = this._o.dayStart;
        if (mode === 'utc' || mode === 'ny17') return mode;
        const key = `${this._ctxKey}|${bars[0].time}`;
        if (key !== this._autoKey) {
            this._autoKey = key;
            this._autoDayStart = detectDayStart(bars);
        }
        return this._autoDayStart;
    }

    private _dayStartLabel(): string {
        const ds = this._o.dayStart === 'auto' ? this._autoDayStart : this._o.dayStart;
        return ds === 'ny17' ? t('New York 17:00') : t('UTC 00:00');
    }

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: TimeScale,
        priceScale: PriceScale,
        hpr: number,
        vpr: number,
        visibleRange: { from: number; to: number },
        scope?: { bitmapSize?: { width: number } },
    ): void {
        if (this._lines.length === 0) return;
        const right = scope?.bitmapSize?.width ?? ctx.canvas.width;
        drawLevelLines(ctx, timeScale, priceScale, hpr, vpr, right, this._lines,
            this._o.lineWidth, this._o.showLabels, visibleRange, this.plateColor(0.45));
    }

    getRange(visibleRange?: { from: number; to: number } | null): IndicatorRange {
        const bars = this._sourceData;
        if (bars.length === 0) return { min: 0, max: 100 };
        const a = visibleRange ? Math.max(0, Math.floor(visibleRange.from)) : 0;
        const b = visibleRange ? Math.min(bars.length - 1, Math.ceil(visibleRange.to)) : bars.length - 1;
        let min = Infinity, max = -Infinity;
        for (let i = a; i <= b; i++) {
            if (bars[i].low < min) min = bars[i].low;
            if (bars[i].high > max) max = bars[i].high;
        }
        return min === Infinity ? { min: 0, max: 100 } : { min, max };
    }

    getLegendInfo(_index?: number | null): IndicatorLegendInfo {
        return {
            title: t('Prev Levels'),
            params: [this._dayStartLabel()],
            plots: this._current.map(c => ({
                color: c.color,
                value: c.price,
                text: `${c.label} ${formatLevelPrice(c.price, this._o.precision)}`,
            })),
            precision: this._o.precision,
        };
    }

    getDescription(_index?: number): string {
        return this._current.map(c => `${c.label} ${formatLevelPrice(c.price, this._o.precision)}`).join(' ') || t('Prev Levels');
    }
}
