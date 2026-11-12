// Open Interest: Binance USD-M perpetual open interest in USD, in a separate pane.
// Data comes from the EvoTrading backend (GET /api/market/derivs, shared with the Long/Short Ratio pane).
// Sub-hour charts use 5-minute (or coarser) server points that are carried over the finer bars; older
// intraday history does not exist (about 30 days). Context read-out, not a signal.

import { IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import { TimeScale } from '../model/time-scale';
import { PriceScale } from '../model/price-scale';
import { t } from '../helpers/translations';
import { IndicatorLegendInfo, legendBarIndex } from './legend-info';
import { DerivsPaneIndicator, DerivsRow } from './remote-pane-base';
import { formatCompact, formatSignedPercent, lineRuns, NO_VALUE } from './remote-pane-utils';
import { colorWithAlpha } from './time-periods';
import {
    IndicatorSettingsConfig,
    createInputsTab,
    createStyleTab,
    createVisibilityTab,
    colorRow,
    selectRow,
} from '../gui/indicator_settings';

export type OpenInterestMode = 'line' | 'area' | 'delta';

export interface OpenInterestOptions extends IndicatorOptions {
    /** line / area of the OI value, or histogram of the bar-to-bar change */
    displayMode: OpenInterestMode;
    /** Delta histogram: OI increased */
    upColor: string;
    /** Delta histogram: OI decreased */
    downColor: string;
    zeroLineColor: string;
}

const defaultOpenInterestOptions: Partial<OpenInterestOptions> = {
    name: 'Open Interest',
    color: '#2962ff',
    lineWidth: 2,
    style: IndicatorStyle.Line,
    displayMode: 'line',
    upColor: '#26a69a',
    downColor: '#ef5350',
    zeroLineColor: '#787b86',
};

/** A gap of more than this many empty bars breaks the line. */
const MAX_GAP_BARS = 3;

export class OpenInterestIndicator extends DerivsPaneIndicator {
    private _oiOptions: OpenInterestOptions;
    /** OI per source bar (null = no data) */
    private _oi: Array<number | null> = [];
    /** Change between consecutive server points, only on the bar where the newer point appears */
    private _delta: Array<number | null> = [];
    /** % change of the latest server step visible at each bar (null = unknown) */
    private _stepPct: Array<number | null> = [];

    constructor(options: Partial<OpenInterestOptions> = {}) {
        super({ ...defaultOpenInterestOptions, ...options });
        this._oiOptions = { ...defaultOpenInterestOptions, ...this._options } as OpenInterestOptions;
        this._paneHeight = 120;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._oiOptions };
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    rows: [selectRow('displayMode', t('Display'), [
                        { value: 'line', label: t('Line') },
                        { value: 'area', label: t('Area') },
                        { value: 'delta', label: t('Change per bar (histogram)') },
                    ], 'line')],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('color', t('Open Interest')),
                        colorRow('upColor', t('Increase')),
                        colorRow('downColor', t('Decrease')),
                        colorRow('zeroLineColor', t('Zero Line Color')),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this._options.visible;
        return (this._oiOptions as any)[key];
    }

    setSettingValue(key: string, value: any): boolean {
        Object.assign(this._oiOptions, { [key]: value });
        Object.assign(this._options, { [key]: value });
        this._dataChanged.fire();
        return false;
    }

    // --- data ---

    protected _buildData(map: number[], rows: DerivsRow[]): void {
        const bars: BarData[] = this._sourceData;
        const num = (x: number | null | undefined): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
        const oi: Array<number | null> = new Array(bars.length);
        const delta: Array<number | null> = new Array(bars.length);
        const stepPct: Array<number | null> = new Array(bars.length);
        this._data = new Array(bars.length);
        for (let i = 0; i < bars.length; i++) {
            const k = map[i];
            const v = k >= 0 ? num(rows[k][1]) : null;
            oi[i] = v;
            // Change between consecutive SERVER points; the delta bar sits where the newer point becomes visible,
            // bars that just carry the value forward have no delta bar.
            const prev = k > 0 ? num(rows[k - 1][1]) : null;
            const step = v !== null && prev !== null ? v - prev : null;
            stepPct[i] = step !== null && prev !== 0 ? (step / (prev as number)) * 100 : null;
            delta[i] = k >= 0 && (i === 0 || map[i - 1] !== k) ? step : null;
            this._data[i] = { time: bars[i].time, value: v ?? NaN };
        }
        this._oi = oi;
        this._delta = delta;
        this._stepPct = stepPct;
    }

    // --- range / drawing / legend ---

    private _plotted(): Array<number | null> {
        return this._oiOptions.displayMode === 'delta' ? this._delta : this._oi;
    }

    getRange(visibleRange?: { from: number; to: number } | null): IndicatorRange {
        const vals = this._plotted();
        if (vals.length === 0) return { min: -1, max: 1 };
        const start = visibleRange ? Math.max(0, Math.floor(visibleRange.from)) : 0;
        const end = visibleRange ? Math.min(vals.length - 1, Math.ceil(visibleRange.to)) : vals.length - 1;
        let min = Infinity;
        let max = -Infinity;
        for (let i = start; i <= end; i++) {
            const v = vals[i];
            if (v === null || v === undefined) continue;
            if (v < min) min = v;
            if (v > max) max = v;
        }
        if (min === Infinity) return { min: -1, max: 1 };
        if (this._oiOptions.displayMode === 'delta') {
            min = Math.min(min, 0);
            max = Math.max(max, 0);
        }
        const pad = (max - min) * 0.1 || Math.abs(max) * 0.05 || 1;
        return { min: min - pad, max: max + pad };
    }

    getScaleFormatter(): (v: number) => string {
        return (v: number) => formatCompact(v);
    }

    getLastValueLabels(): Array<{ price: number; text: string; color: string }> {
        if (this._oiOptions.displayMode === 'delta') return [];
        for (let i = this._oi.length - 1; i >= 0; i--) {
            const v = this._oi[i];
            if (v !== null) return [{ price: v, text: formatCompact(v), color: this._oiOptions.color }];
        }
        return [];
    }

    drawPane(ctx: CanvasRenderingContext2D, timeScale: TimeScale, priceScale: PriceScale, width: number, height: number): void {
        const range = timeScale.visibleRange();
        const vals = this._plotted();
        if (!range || vals.length === 0) return;
        const o = this._oiOptions;
        const from = Math.max(0, Math.floor(range.from as number));
        const to = Math.min(vals.length - 1, Math.ceil(range.to as number));

        ctx.save();
        if (o.displayMode === 'delta') {
            const zeroY = priceScale.priceToCoordinate(0) as number;
            ctx.strokeStyle = o.zeroLineColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, Math.round(zeroY) + 0.5);
            ctx.lineTo(width, Math.round(zeroY) + 0.5);
            ctx.stroke();
            const barWidth = Math.max(1, 0.7 * timeScale.barSpacing);
            for (let i = from; i <= to; i++) {
                const v = vals[i];
                if (v === null || v === undefined || v === 0) continue;
                const x = (timeScale.indexToCoordinate(i as any) as number) - barWidth / 2;
                const y = priceScale.priceToCoordinate(v) as number;
                ctx.fillStyle = v > 0 ? o.upColor : o.downColor;
                ctx.fillRect(x, Math.min(y, zeroY), barWidth, Math.abs(zeroY - y));
            }
            ctx.restore();
            return;
        }

        const runs = lineRuns(vals, from - 1, to + 1, MAX_GAP_BARS);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = o.lineWidth || 2;
        for (const run of runs) {
            const xs = run.map((i) => timeScale.indexToCoordinate(i as any) as number);
            const ys = run.map((i) => priceScale.priceToCoordinate(vals[i] as number) as number);
            if (o.displayMode === 'area') {
                ctx.beginPath();
                ctx.moveTo(xs[0], height);
                for (let k = 0; k < run.length; k++) ctx.lineTo(xs[k], ys[k]);
                ctx.lineTo(xs[run.length - 1], height);
                ctx.closePath();
                ctx.fillStyle = colorWithAlpha(o.color, 0.18);
                ctx.fill();
            }
            ctx.beginPath();
            ctx.strokeStyle = o.color;
            ctx.moveTo(xs[0], ys[0]);
            for (let k = 1; k < run.length; k++) ctx.lineTo(xs[k], ys[k]);
            if (run.length === 1) ctx.lineTo(xs[0] + 0.01, ys[0]);
            ctx.stroke();
        }
        ctx.restore();
    }

    private _changePct(i: number): number | null {
        return this._stepPct[i] ?? null;
    }

    getLegendInfo(index?: number | null): IndicatorLegendInfo {
        const i = legendBarIndex(this._oi.length, index);
        const o = this._oiOptions;
        const v = i >= 0 ? this._oi[i] : null;
        const ch = i >= 0 ? this._changePct(i) : null;
        const info: IndicatorLegendInfo = {
            title: t('Open Interest'),
            params: [],
            plots: [
                { color: o.color, value: v, text: v !== null ? formatCompact(v) : NO_VALUE },
                { color: ch === null ? o.color : ch >= 0 ? o.upColor : o.downColor, value: ch, text: formatSignedPercent(ch) },
            ],
        };
        return this._applyDenied(info);
    }

    getDescription(index?: number): string {
        const i = legendBarIndex(this._oi.length, index);
        const v = i >= 0 ? this._oi[i] : null;
        const ch = i >= 0 ? this._changePct(i) : null;
        return `${t('Open Interest')}: ${v !== null ? formatCompact(v) : '-'} (${formatSignedPercent(ch)})`;
    }
}
