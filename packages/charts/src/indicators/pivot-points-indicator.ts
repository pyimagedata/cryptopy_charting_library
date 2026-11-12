// Pivot Points: horizontal support/resistance levels from the previous COMPLETED period's high, low and
// close (Classic, Fibonacci, Camarilla, Woodie). Computed client-side from the loaded bars; levels for a
// period use only the finished period before it, so nothing repaints. This marks reference levels, it is
// not a signal. The maths lives in pivot-math.ts.

import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import { t } from '../helpers/translations';
import { canvasSans } from '../helpers/fonts';
import { RemoteContext } from './remote-compute';
import { SeriesFingerprint, syncTimePoints } from './indicator-cache';
import { IndicatorLegendInfo, legendParams } from './legend-info';
import {
    IndicatorSettingsConfig,
    createInputsTab,
    createStyleTab,
    createVisibilityTab,
    checkboxRow,
    colorRow,
    lineWidthRow,
    numberRow,
    selectRow,
} from '../gui/indicator_settings';
import {
    PIVOT_LEVEL_NAMES,
    PivotPeriod,
    PivotPeriodResult,
    PivotPeriodSetting,
    PivotType,
    PivotGrouper,
    pivotPeriodsFromGroups,
    formatPrice,
    resolvePivotPeriod,
} from './pivot-math';

export type PivotLineStyle = 'solid' | 'dashed' | 'dotted';

export interface PivotPointsOptions extends IndicatorOptions {
    pivotType: PivotType;
    periodSetting: PivotPeriodSetting;
    /** historical periods drawn besides the current one (0-20) */
    periodsBack: number;
    showLabels: boolean;
    showPrices: boolean;
    showP: boolean;
    showR1: boolean;
    showR2: boolean;
    showR3: boolean;
    showR4: boolean;
    showS1: boolean;
    showS2: boolean;
    showS3: boolean;
    showS4: boolean;
    pColor: string;
    rColor: string;
    sColor: string;
    lineStyle: PivotLineStyle;
}

const defaultPivotOptions: Partial<PivotPointsOptions> = {
    name: 'Pivot Points',
    color: '#f6c343',
    lineWidth: 1,
    style: IndicatorStyle.Line,
    pivotType: 'classic',
    periodSetting: 'auto',
    periodsBack: 3,
    showLabels: true,
    showPrices: true,
    showP: true,
    showR1: true,
    showR2: true,
    showR3: true,
    showR4: true,
    showS1: true,
    showS2: true,
    showS3: true,
    showS4: true,
    pColor: '#f6c343',
    rColor: '#ef5350',
    sColor: '#26a69a',
    lineStyle: 'solid',
};

const RECALC_KEYS = new Set(['pivotType', 'periodSetting', 'periodsBack']);

export const PIVOT_TYPE_LABELS: Record<PivotType, string> = {
    classic: 'Classic',
    fibonacci: 'Fibonacci',
    camarilla: 'Camarilla',
    woodie: 'Woodie',
};
export const PIVOT_PERIOD_LABELS: Record<PivotPeriodSetting, string> = {
    auto: 'Auto',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    yearly: 'Yearly',
};

export class PivotPointsIndicator extends OverlayIndicator {
    private _pivotOptions: PivotPointsOptions;
    private _timeframe: string | null = null;
    private _periods: PivotPeriodResult[] = [];
    private _resolved: PivotPeriod = 'daily';
    private readonly _grouper = new PivotGrouper();
    private readonly _fp = new SeriesFingerprint();

    constructor(options: Partial<PivotPointsOptions> = {}) {
        const mergedOptions = { ...defaultPivotOptions, ...options };
        super(mergedOptions);
        this._pivotOptions = { ...defaultPivotOptions, ...this._options } as PivotPointsOptions;
        // restored options may be stale or hand-edited: keep them valid in both copies
        this._pivotOptions.periodsBack = clampPeriodsBack(this._pivotOptions.periodsBack);
        (this._options as any).periodsBack = this._pivotOptions.periodsBack;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._pivotOptions };
    }

    setContext(ctx: RemoteContext): void {
        if (ctx.timeframe === this._timeframe) return;
        this._timeframe = ctx.timeframe;
        this._grouper.reset();
        this._fp.forget();
        if (this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        const o = this._pivotOptions;
        const levelRows = PIVOT_LEVEL_NAMES.map(n => checkboxRow('show' + n, n, (o as any)['show' + n]));
        return {
            name: this.name,
            tabs: [
                createInputsTab([
                    {
                        rows: [
                            selectRow('pivotType', t('Type'), (Object.keys(PIVOT_TYPE_LABELS) as PivotType[])
                                .map(v => ({ value: v, label: t(PIVOT_TYPE_LABELS[v]) }))),
                            selectRow('periodSetting', t('Period'), (Object.keys(PIVOT_PERIOD_LABELS) as PivotPeriodSetting[])
                                .map(v => ({ value: v, label: t(PIVOT_PERIOD_LABELS[v]) }))),
                            numberRow('periodsBack', t('Periods back'), 0, 20, 1),
                        ],
                    },
                    { rows: levelRows },
                    {
                        rows: [
                            checkboxRow('showLabels', t('Show labels'), o.showLabels),
                            checkboxRow('showPrices', t('Show prices in labels'), o.showPrices),
                        ],
                    },
                ]),
                createStyleTab([{
                    rows: [
                        colorRow('pColor', t('Pivot (P) color')),
                        colorRow('rColor', t('Resistance (R) color')),
                        colorRow('sColor', t('Support (S) color')),
                        lineWidthRow('lineWidth', t('Line Width')),
                        selectRow('lineStyle', t('Line style'), [
                            { value: 'solid', label: t('Solid') },
                            { value: 'dashed', label: t('Dashed') },
                            { value: 'dotted', label: t('Dotted') },
                        ]),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this._options.visible;
        return (this._pivotOptions as any)[key];
    }

    setSettingValue(key: string, value: any): boolean {
        if (key === 'periodsBack') value = clampPeriodsBack(value);
        Object.assign(this._pivotOptions, { [key]: value });
        Object.assign(this._options, { [key]: value });
        if (key === 'pColor') (this._options as any).color = value;
        if (RECALC_KEYS.has(key) && this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
        return false;
    }

    /** Timeframe for the Auto period: the context timeframe, else guessed from the bar spacing. */
    private _effectiveTimeframe(bars: BarData[]): string | null {
        if (this._timeframe) return this._timeframe;
        if (bars.length < 2) return null;
        const a = bars[bars.length - 2].time;
        const b = bars[bars.length - 1].time;
        const sec = (b > 1e10 ? b - a : (b - a) * 1000) / 1000;
        return sec > 0 ? `${Math.max(1, Math.round(sec / 60))}m` : null;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        const o = this._pivotOptions;
        // tick / new bar: reuse the data array and regroup only the newest period (see indicator-cache.ts)
        this._data = syncTimePoints(this._data, sourceData, this._fp);
        this._resolved = resolvePivotPeriod(o.periodSetting, this._effectiveTimeframe(sourceData));
        this._periods = pivotPeriodsFromGroups(this._grouper.update(sourceData, this._resolved), o.pivotType, o.periodsBack);
    }

    getRange(): IndicatorRange {
        if (this._sourceData.length === 0) return { min: 0, max: 100 };
        let min = Infinity;
        let max = -Infinity;
        for (const bar of this._sourceData) {
            if (bar.low < min) min = bar.low;
            if (bar.high > max) max = bar.high;
        }
        return { min, max };
    }

    getLegendInfo(): IndicatorLegendInfo {
        const o = this._pivotOptions;
        return {
            title: t('Pivot Points'),
            params: legendParams(t(PIVOT_TYPE_LABELS[o.pivotType]), t(PIVOT_PERIOD_LABELS[o.periodSetting === 'auto' ? this._resolved : o.periodSetting])),
            plots: [],
        };
    }

    getDescription(): string {
        const o = this._pivotOptions;
        return `${t('Pivot Points')} ${t(PIVOT_TYPE_LABELS[o.pivotType])} (${t(PIVOT_PERIOD_LABELS[this._resolved])})`;
    }

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number,
        visibleRange: { from: number; to: number }
    ): void {
        const bars = this._sourceData;
        if (bars.length === 0 || this._periods.length === 0) return;
        const o = this._pivotOptions;
        const halfBar = timeScale.barSpacing / 2;
        const widthPx = timeScale.width * hpr;
        const lastIdx = bars.length - 1;

        ctx.save();
        ctx.lineWidth = Math.max(1, o.lineWidth) * hpr;
        ctx.lineCap = 'butt';
        ctx.setLineDash(o.lineStyle === 'dashed' ? [6 * hpr, 4 * hpr] : o.lineStyle === 'dotted' ? [2 * hpr, 3 * hpr] : []);
        ctx.font = `${10 * hpr}px ${canvasSans()}`;
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'right';

        for (const p of this._periods) {
            if (p.lastIdx < visibleRange.from - 1 || p.firstIdx > visibleRange.to + 1) continue;
            const isCurrent = p.lastIdx === lastIdx;
            const x1 = Math.max(0, (timeScale.indexToCoordinate(p.firstIdx as any) - halfBar) * hpr);
            const x2 = isCurrent ? widthPx : (timeScale.indexToCoordinate(p.lastIdx as any) + halfBar) * hpr;
            if (x2 <= x1) continue;
            for (const level of p.levels) {
                if (!(o as any)['show' + level.name]) continue;
                const yc = priceScale.priceToCoordinate(level.price);
                if (yc === undefined || yc === null || !Number.isFinite(yc as number)) continue;
                const y = (yc as number) * vpr;
                const color = level.kind === 'P' ? o.pColor : level.kind === 'R' ? o.rColor : o.sColor;
                ctx.strokeStyle = color;
                ctx.beginPath();
                ctx.moveTo(x1, y);
                ctx.lineTo(x2, y);
                ctx.stroke();
                if (o.showLabels) {
                    const text = o.showPrices ? `${level.name} ${formatPrice(level.price, this._options.precision)}` : level.name;
                    if (ctx.measureText(text).width + 4 * hpr <= x2 - x1) {
                        ctx.fillStyle = color;
                        ctx.fillText(text, x2 - 3 * hpr, y - 2 * vpr);
                    }
                }
            }
        }
        ctx.restore();
    }
}

function clampPeriodsBack(v: unknown): number {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(0, Math.min(20, n)) : 3;
}
