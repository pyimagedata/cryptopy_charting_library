// Visible Range Volume Profile: one volume profile of the bars currently on screen, anchored to the
// left or right edge of the price pane. Computed client-side from the loaded bars with the same method as
// the fixed-range profile (volume-profile-math.ts). Recomputed (debounced) when the view scrolls / zooms
// and immediately on new bars. Context read-out, not a signal.

import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import { t } from '../helpers/translations';
import { canvasSans } from '../helpers/fonts';
import { IndicatorLegendInfo, legendParams, adaptivePrecision, LEGEND_NO_VALUE } from './legend-info';
import {
    IndicatorSettingsConfig,
    createInputsTab,
    createStyleTab,
    createVisibilityTab,
    numberRow,
    colorRow,
    checkboxRow,
    selectRow,
    lineWidthRow,
} from '../gui/indicator_settings';
import { RemoteContext } from './remote-compute';
import { RangeProfile, RangeProfileOutcome, summarizeRange, colorWithAlpha } from './profile-periods';

export interface VisibleRangeVolumeProfileOptions extends IndicatorOptions {
    placement: 'left' | 'right';
    /** Max histogram width as % of the pane width */
    widthPercent: number;
    rows: number;
    valueAreaPercent: number;
    showPOC: boolean;
    showValueArea: boolean;
    showVahVal: boolean;
    showLabels: boolean;
    /** Two colours per row (up / down volume) */
    splitUpDown: boolean;
    profileColor: string;
    upColor: string;
    downColor: string;
    pocColor: string;
    valueAreaLineColor: string;
}

const defaultVisibleOptions: Partial<VisibleRangeVolumeProfileOptions> = {
    name: 'Visible Range Volume Profile',
    style: IndicatorStyle.Line,
    color: '#3b82f6',
    lineWidth: 2,
    placement: 'right',
    widthPercent: 30,
    rows: 60,
    valueAreaPercent: 70,
    showPOC: true,
    showValueArea: true,
    showVahVal: true,
    showLabels: true,
    splitUpDown: false,
    profileColor: '#3b82f6',
    upColor: '#26a69a',
    downColor: '#ef5350',
    pocColor: '#ef4444',
    valueAreaLineColor: '#f59e0b',
};

const ALGO_KEYS = new Set(['rows', 'valueAreaPercent']);
const NUMERIC_KEYS = new Set(['rows', 'valueAreaPercent', 'widthPercent', 'lineWidth']);
const DEBOUNCE_MS = 100;
const NO_VOLUME_NOTE = 'No volume data for this symbol';
const MUTED = '#787b86';

export class VisibleRangeVolumeProfileIndicator extends OverlayIndicator {
    private _visOptions: VisibleRangeVolumeProfileOptions;
    private _outcome: RangeProfileOutcome = { kind: 'empty' };
    /** Range of the cached profile / last range the pane asked for (bar indices) */
    private _pFrom = -1;
    private _pTo = -1;
    private _seenFrom = -1;
    private _seenTo = -1;
    private _computed = false;
    /** Bar count of the cached profile (a changed count = new bar -> recompute at once) */
    private _pCount = -1;
    /** Hidden / re-shown / interval-switched since the last compute: recompute at once on the next draw */
    private _stale = false;
    private _timer: ReturnType<typeof setTimeout> | null = null;
    private _symKey = '';
    private _labelPoc = '';
    private _labelVah = '';
    private _labelVal = '';

    constructor(options: Partial<VisibleRangeVolumeProfileOptions> = {}) {
        const merged = { ...defaultVisibleOptions, ...options };
        super(merged);
        this._visOptions = { ...defaultVisibleOptions, ...this._options } as VisibleRangeVolumeProfileOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._visOptions };
    }

    // --- settings ---

    getSettingsConfig(): IndicatorSettingsConfig {
        const o = this._visOptions;
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    rows: [
                        numberRow('rows', 'Rows', 10, 200, 1),
                        numberRow('valueAreaPercent', 'Value Area %', 50, 99, 1),
                        selectRow('placement', 'Placement', [
                            { value: 'right', label: 'Right' },
                            { value: 'left', label: 'Left' },
                        ], o.placement),
                        numberRow('widthPercent', 'Profile Width %', 5, 80, 1),
                        checkboxRow('showPOC', 'Show POC', o.showPOC),
                        checkboxRow('showValueArea', 'Show Value Area', o.showValueArea),
                        checkboxRow('showVahVal', 'Show VAH / VAL', o.showVahVal),
                        checkboxRow('showLabels', 'Show Labels', o.showLabels),
                        checkboxRow('splitUpDown', 'Split Up / Down Volume', o.splitUpDown),
                    ],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('profileColor', 'Profile Color', o.profileColor),
                        colorRow('upColor', 'Up Volume Color', o.upColor),
                        colorRow('downColor', 'Down Volume Color', o.downColor),
                        colorRow('pocColor', 'POC Color', o.pocColor),
                        colorRow('valueAreaLineColor', 'VAH / VAL Color', o.valueAreaLineColor),
                        lineWidthRow('lineWidth', 'Line Width'),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this._options.visible;
        return (this._visOptions as any)[key];
    }

    setSettingValue(key: string, value: any): boolean {
        const v = NUMERIC_KEYS.has(key) ? Number(value) : value;
        Object.assign(this._visOptions, { [key]: v });
        Object.assign(this._options, { [key]: v });
        const needsRecalc = ALGO_KEYS.has(key);
        if (needsRecalc) this._recomputeNow();
        this._dataChanged.fire();
        return needsRecalc;
    }

    // --- calculation ---

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        if (this._data.length !== sourceData.length) {
            this._data = sourceData.map((b) => ({ time: b.time, value: NaN }));
        }
        // A new bar recomputes at once; a plain tick on the same bar goes through the 100 ms timer.
        if (sourceData.length !== this._pCount) this._recomputeNow();
        else if (this._computed) this._schedule();
    }

    /** Symbol / exchange change: drop every cached profile field; the next draw recomputes. */
    setContext(ctx: RemoteContext): void {
        const key = `${ctx.symbol}|${ctx.exchange ?? ''}`;
        if (key === this._symKey) return;
        this._symKey = key;
        this._outcome = { kind: 'empty' };
        this._labelPoc = '';
        this._labelVah = '';
        this._labelVal = '';
        this._computed = false;
        this._pCount = -1;
        if (this._timer !== null) { clearTimeout(this._timer); this._timer = null; }
        this._dataChanged.fire();
    }

    setVisible(visible: boolean): void {
        if (visible) this._stale = true;
        super.setVisible(visible);
    }

    setTimeframe(timeframe: string): void {
        super.setTimeframe(timeframe);
        this._stale = true;
    }

    setCommonSetting(key: string, value: any): void {
        if (key === 'intervalsVisibilities') this._stale = true;
        super.setCommonSetting(key, value);
    }

    /** Recompute for the last range the pane asked for (new bars / settings); lazily on first draw otherwise. */
    private _recomputeNow(): void {
        if (this._seenFrom < 0) {
            this._computed = false;
            return;
        }
        this._compute(this._seenFrom, this._seenTo);
    }

    private _compute(from: number, to: number): void {
        const bars = this._sourceData;
        const last = bars.length - 1;
        const a = Math.max(0, Math.min(from, last));
        const b = Math.max(a, Math.min(to, last));
        this._pFrom = from;
        this._pTo = to;
        this._pCount = bars.length;
        this._stale = false;
        this._computed = true;
        const rows = Math.max(10, Math.min(200, Math.floor(this._visOptions.rows) || 60));
        const va = Math.max(1, Math.min(100, this._visOptions.valueAreaPercent));
        this._outcome = last < 0 ? { kind: 'empty' } : summarizeRange(bars, a, b, rows, va);
        // Never keep labels from a previous profile: they are rewritten only for an 'ok' outcome.
        this._labelPoc = '';
        this._labelVah = '';
        this._labelVal = '';
        if (this._outcome.kind === 'ok') {
            const p = this._outcome.profile;
            const prec = adaptivePrecision(p.pocPrice);
            this._labelPoc = `POC ${p.pocPrice.toFixed(prec)}`;
            this._labelVah = `VAH ${p.vahPrice.toFixed(prec)}`;
            this._labelVal = `VAL ${p.valPrice.toFixed(prec)}`;
        }
    }

    private _schedule(): void {
        if (this._timer !== null) clearTimeout(this._timer);
        this._timer = setTimeout(() => {
            this._timer = null;
            if (!this.shown) { this._stale = true; return; }
            this._compute(this._seenFrom, this._seenTo);
            this._dataChanged.fire();
        }, DEBOUNCE_MS);
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

    // --- hit test (CSS px; same convention as the fixed-range profile: boolean) ---

    hitTest(x: number, y: number, timeScale: any, priceScale: any): boolean {
        if (this._outcome.kind !== 'ok') return false;
        const res = this._outcome.profile.result;
        const o = this._visOptions;
        const paneW = timeScale.width as number;
        const maxW = paneW * Math.max(1, Math.min(100, o.widthPercent)) / 100;
        const yHi = priceScale.priceToCoordinate(res.highest) as number;
        const yLo = priceScale.priceToCoordinate(res.lowest) as number;
        const inY = y >= Math.min(yHi, yLo) && y <= Math.max(yHi, yLo);
        const inX = o.placement === 'left' ? x >= 0 && x <= maxW : x >= paneW - maxW && x <= paneW;
        return inX && inY;
    }

    // --- legend ---

    private _profile(): RangeProfile | null {
        return this._outcome.kind === 'ok' ? this._outcome.profile : null;
    }

    getLegendInfo(_index?: number | null): IndicatorLegendInfo {
        const o = this._visOptions;
        const info: IndicatorLegendInfo = {
            title: t('Visible Range Volume Profile'),
            params: legendParams(o.rows),
            plots: [],
        };
        if (this._outcome.kind === 'novolume') {
            info.plots.push({ color: MUTED, value: null, text: t(NO_VOLUME_NOTE) });
        } else {
            const p = this._profile();
            info.plots.push({ color: o.pocColor, value: p ? p.pocPrice : null, text: p ? undefined : LEGEND_NO_VALUE });
        }
        return info;
    }

    getDescription(_index?: number): string {
        if (this._outcome.kind === 'novolume') return `${t('Visible Range Volume Profile')}: ${t(NO_VOLUME_NOTE)}`;
        const p = this._profile();
        return `${t('Visible Range Volume Profile')} POC ${p ? p.pocPrice.toFixed(2) : '-'}`;
    }

    // --- drawing ---

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number,
        visibleRange?: { from: number; to: number },
        scope?: any
    ): void {
        if (!visibleRange) return;
        const from = Math.floor(visibleRange.from);
        const to = Math.ceil(visibleRange.to);
        this._seenFrom = from;
        this._seenTo = to;
        if (!this._computed || this._stale) this._compute(from, to);
        else if (from !== this._pFrom || to !== this._pTo) this._schedule();

        if (this._outcome.kind !== 'ok') return;
        const prof = this._outcome.profile;
        const res = prof.result;
        const o = this._visOptions;
        const paneW = (scope && scope.bitmapSize && scope.bitmapSize.width) || (timeScale.width as number) * hpr;
        if (!(paneW > 0)) return;
        const right = o.placement !== 'left';
        const maxW = paneW * Math.max(1, Math.min(100, o.widthPercent)) / 100;
        const bins = res.bins;
        const maxVol = res.maxVolume;
        const lo = Math.min(res.valIndex, res.vahIndex);
        const hi = Math.max(res.valIndex, res.vahIndex);

        ctx.save();

        if (o.showValueArea) {
            const yTop = priceScale.priceToCoordinate(bins[hi].high) * vpr;
            const yBot = priceScale.priceToCoordinate(bins[lo].low) * vpr;
            if (Number.isFinite(yTop) && Number.isFinite(yBot)) {
                ctx.fillStyle = colorWithAlpha(o.profileColor, 0.07);
                ctx.fillRect(0, Math.min(yTop, yBot), paneW, Math.abs(yBot - yTop));
            }
        }

        const normal = colorWithAlpha(o.profileColor, 0.3);
        const strong = colorWithAlpha(o.profileColor, 0.6);
        const upNormal = colorWithAlpha(o.upColor, 0.32);
        const upStrong = colorWithAlpha(o.upColor, 0.7);
        const downNormal = colorWithAlpha(o.downColor, 0.32);
        const downStrong = colorWithAlpha(o.downColor, 0.7);
        for (let i = 0; i < bins.length; i++) {
            const bin = bins[i];
            if (bin.volume <= 0) continue;
            const yA = priceScale.priceToCoordinate(bin.high) * vpr;
            const yB = priceScale.priceToCoordinate(bin.low) * vpr;
            const top = Math.min(yA, yB);
            const h = Math.max(1, Math.abs(yB - yA));
            const w = maxW * (bin.volume / maxVol);
            const inVa = o.showValueArea && i >= lo && i <= hi;
            // Anchored at the pane edge: right placement grows left, left placement grows right.
            if (o.splitUpDown) {
                const wUp = w * (bin.upVolume / bin.volume);
                const x = right ? paneW - w : 0;
                ctx.fillStyle = inVa ? upStrong : upNormal;
                ctx.fillRect(x, top, wUp, h);
                ctx.fillStyle = inVa ? downStrong : downNormal;
                ctx.fillRect(x + wUp, top, w - wUp, h);
            } else {
                ctx.fillStyle = inVa ? strong : normal;
                ctx.fillRect(right ? paneW - w : 0, top, w, h);
            }
        }

        if (o.showPOC) this._hline(ctx, priceScale, prof.pocPrice, paneW, o.pocColor, o.lineWidth * hpr, [], vpr);
        if (o.showVahVal) {
            const dash = [5 * hpr, 4 * hpr];
            this._hline(ctx, priceScale, prof.vahPrice, paneW, o.valueAreaLineColor, 1 * hpr, dash, vpr);
            this._hline(ctx, priceScale, prof.valPrice, paneW, o.valueAreaLineColor, 1 * hpr, dash, vpr);
        }
        if (o.showLabels) {
            ctx.font = `${10 * hpr}px ${canvasSans()}`;
            ctx.textBaseline = 'bottom';
            ctx.textAlign = right ? 'right' : 'left';
            const x = right ? paneW - maxW - 4 * hpr : maxW + 4 * hpr;
            if (o.showPOC) this._label(ctx, priceScale, prof.pocPrice, this._labelPoc, x, o.pocColor, vpr);
            if (o.showVahVal) {
                this._label(ctx, priceScale, prof.vahPrice, this._labelVah, x, o.valueAreaLineColor, vpr);
                this._label(ctx, priceScale, prof.valPrice, this._labelVal, x, o.valueAreaLineColor, vpr);
            }
        }
        ctx.restore();
    }

    private _hline(
        ctx: CanvasRenderingContext2D,
        priceScale: any,
        price: number,
        paneW: number,
        color: string,
        width: number,
        dash: number[],
        vpr: number
    ): void {
        const y = priceScale.priceToCoordinate(price) * vpr;
        if (!Number.isFinite(y)) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(paneW, y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    private _label(ctx: CanvasRenderingContext2D, priceScale: any, price: number, text: string, x: number, color: string, vpr: number): void {
        const y = priceScale.priceToCoordinate(price) * vpr;
        if (!Number.isFinite(y)) return;
        ctx.fillStyle = color;
        ctx.fillText(text, x, y - 2 * vpr);
    }

    destroy(): void {
        if (this._timer !== null) clearTimeout(this._timer);
        this._timer = null;
        super.destroy();
    }
}
