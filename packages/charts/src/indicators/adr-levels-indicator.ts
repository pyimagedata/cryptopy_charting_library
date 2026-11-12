/**
 * ADR Levels: Average Daily Range = mean of (high - low) over the last N COMPLETED days.
 * Draws the current day's open and open +/- ADR/2, open +/- ADR, and reports ADR, today's range so far
 * and the share of ADR already used. Computed on the client from the loaded bars; intraday only.
 */

import { OverlayIndicator, IndicatorOptions, IndicatorRange } from './indicator';
import { BarData } from '../model/data';
import { TimeScale } from '../model/time-scale';
import { PriceScale } from '../model/price-scale';
import { t } from '../helpers/translations';
import { IndicatorLegendInfo, legendParams } from './legend-info';
import {
    IndicatorSettingsConfig, createInputsTab, createStyleTab, createVisibilityTab,
    checkboxRow, colorRow, numberRow, selectRow, lineWidthRow,
} from '../gui/indicator_settings';
import {
    PeriodSeries, DayStart, computeAdr, timeframeSeconds, barIntervalSeconds, periodNominalSeconds,
    formatLevelPrice, detectDayStart,
} from './time-periods';
import { LevelLine, LEVEL_STYLE_OPTIONS, normalizeLevelStyle, drawLevelLines } from './level-lines-draw';

export interface AdrLevelsOptions extends IndicatorOptions {
    length: number;
    dayStart: DayStart | 'auto';
    showOpen: boolean;
    showHalf: boolean;
    showFull: boolean;
    showLabels: boolean;
    showPrice: boolean;
    openColor: string;
    halfColor: string;
    fullColor: string;
    lineStyle: 'solid' | 'dashed' | 'dotted';
}

const defaultAdrLevelsOptions: Partial<AdrLevelsOptions> = {
    name: 'ADR Levels',
    color: '#ff9800',
    lineWidth: 1,
    length: 14,
    dayStart: 'auto',
    showOpen: true,
    showHalf: true,
    showFull: true,
    showLabels: true,
    showPrice: true,
    openColor: '#787b86',
    halfColor: '#2962ff',
    fullColor: '#ff9800',
    lineStyle: 'dashed',
};

export class AdrLevelsIndicator extends OverlayIndicator {
    private readonly _days = new PeriodSeries('day', 'utc');
    private _tf = '';
    private _ctxKey = '';
    private _autoKey = '';
    private _autoDayStart: DayStart = 'utc';
    private _lines: LevelLine[] = [];
    private _adr = NaN;
    private _adrDays = 0;
    private _range = NaN;

    constructor(options: Partial<AdrLevelsOptions> = {}) {
        super({ ...defaultAdrLevelsOptions, ...options });
    }

    private get _o(): AdrLevelsOptions {
        return this._options as AdrLevelsOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._options };
    }

    /** Today's range so far / ADR (0..n), NaN when unavailable */
    get percentUsed(): number {
        return this._adr > 0 ? this._range / this._adr : NaN;
    }

    get adr(): number { return this._adr; }
    get todayRange(): number { return this._range; }

    setContext(ctx: { symbol: string; timeframe: string; exchange?: string; end?: number }): void {
        const key = `${ctx.symbol}|${ctx.exchange ?? ''}`;
        const keyChanged = key !== this._ctxKey;
        if (keyChanged) {
            this._ctxKey = key;
            this._days.reset();
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
                        numberRow('length', t('ADR length (days)'), 1, 200, 1),
                        selectRow('dayStart', t('Day starts at'), [
                            { value: 'auto', label: t('Auto') },
                            { value: 'utc', label: t('UTC 00:00') },
                            { value: 'ny17', label: t('New York 17:00') },
                        ], 'auto'),
                        checkboxRow('showOpen', t('Show day open'), true),
                        checkboxRow('showHalf', t('Show half ADR levels'), true),
                        checkboxRow('showFull', t('Show full ADR levels'), true),
                    ],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('openColor', t('Day open color'), '#787b86'),
                        colorRow('halfColor', t('Half ADR color'), '#2962ff'),
                        colorRow('fullColor', t('Full ADR color'), '#ff9800'),
                        lineWidthRow('lineWidth', t('Line Width')),
                        selectRow('lineStyle', t('Line style'), LEVEL_STYLE_OPTIONS.map(o => ({ value: o.value, label: t(o.label) })), 'dashed'),
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
        if (key === 'length') {
            const n = Math.round(Number(value));
            value = Number.isFinite(n) ? Math.max(1, Math.min(200, n)) : 14;
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
        this._adr = NaN;
        this._adrDays = 0;
        this._range = NaN;
        if (bars.length < 2) return;
        const intervalSec = timeframeSeconds(this._tf) ?? barIntervalSeconds(bars);
        if (!(intervalSec > 0) || intervalSec >= periodNominalSeconds('day')) return; // intraday only

        this._days.configure(this._resolveDayStart(bars));
        this._days.update(bars);
        const ps = this._days.periods;
        const today = ps[ps.length - 1];
        if (!today) return;
        const res = computeAdr(this._days, this._days.firstPeriodComplete(bars, intervalSec), o.length);
        if (!res) return;
        this._adr = res.adr;
        this._adrDays = res.days;
        this._range = today.high - today.low;

        const style = normalizeLevelStyle(o.lineStyle);
        const add = (code: string, price: number, color: string, ls: LevelLine['style']) => {
            const priceText = o.showPrice ? formatLevelPrice(price, o.precision) : '';
            this._lines.push({ code, priceText, price, color, style: ls, startIdx: today.first, endIdx: -1 });
        };
        const open = today.open;
        if (o.showOpen) add('DO', open, o.openColor, 'solid');
        if (o.showHalf) {
            add('+½ADR', open + res.adr / 2, o.halfColor, style);
            add('-½ADR', open - res.adr / 2, o.halfColor, style);
        }
        if (o.showFull) {
            add('+ADR', open + res.adr, o.fullColor, style);
            add('-ADR', open - res.adr, o.fullColor, style);
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

    /** Constant: legend plots are pre-formatted text, so the Precision select never applies. */
    supportsPrecision(): boolean {
        return false;
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
        const o = this._o;
        const ok = Number.isFinite(this._adr);
        const pct = this.percentUsed;
        return {
            title: t('ADR'),
            params: legendParams(o.length, (o.dayStart === 'auto' ? this._autoDayStart : o.dayStart) === 'ny17' ? t('New York 17:00') : t('UTC 00:00')),
            plots: [
                { color: o.fullColor, value: ok ? this._adr : null, text: ok ? formatLevelPrice(this._adr, o.precision) : undefined },
                { color: o.halfColor, value: ok ? this._range : null, text: ok ? formatLevelPrice(this._range, o.precision) : undefined },
                { color: o.openColor, value: Number.isFinite(pct) ? pct * 100 : null, text: Number.isFinite(pct) ? `${(pct * 100).toFixed(0)}%` : undefined },
            ],
            precision: o.precision,
        };
    }

    getDescription(_index?: number): string {
        if (!Number.isFinite(this._adr)) return `${t('ADR')}: -`;
        return `${t('ADR')} (${this._adrDays}): ${formatLevelPrice(this._adr, this._o.precision)}  ${t('Range')}: ${formatLevelPrice(this._range, this._o.precision)}  ${(this.percentUsed * 100).toFixed(0)}%`;
    }
}
