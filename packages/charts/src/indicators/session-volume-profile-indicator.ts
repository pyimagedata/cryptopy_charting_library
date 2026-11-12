// Session Volume Profile: one volume profile per UTC day / ISO week / UTC month, drawn inside that
// period's span on the price pane. Computed client-side from the loaded bars with the same method as
// the fixed-range profile (volume-profile-math.ts). The open period updates live. Context read-out, not a signal.

import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import { toEpochMs } from '../helpers/time';
import { t } from '../helpers/translations';
import { IndicatorLegendInfo, legendParams, LEGEND_NO_VALUE } from './legend-info';
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
import {
    ProfilePeriod,
    PeriodRange,
    RangeProfile,
    RangeProfileOutcome,
    lastPeriods,
    summarizeRange,
    intervalFitsPeriod,
    timeframeSeconds,
    colorWithAlpha,
} from './profile-periods';
import { RemoteContext } from './remote-compute';

export interface SessionVolumeProfileOptions extends IndicatorOptions {
    period: ProfilePeriod;
    rows: number;
    valueAreaPercent: number;
    /** Max histogram width as % of the period's width */
    widthPercent: number;
    /** Draw at most this many of the latest periods */
    maxPeriods: number;
    showPOC: boolean;
    showValueArea: boolean;
    showVahVal: boolean;
    /** Extend each closed period's POC to the right until a later bar's range touches it */
    extendPOC: boolean;
    /** Two colours per row (up / down volume) */
    splitUpDown: boolean;
    profileColor: string;
    upColor: string;
    downColor: string;
    pocColor: string;
    valueAreaLineColor: string;
}

const defaultSessionOptions: Partial<SessionVolumeProfileOptions> = {
    name: 'Session Volume Profile',
    style: IndicatorStyle.Line,
    color: '#3b82f6',
    lineWidth: 2,
    period: 'day',
    rows: 24,
    valueAreaPercent: 70,
    widthPercent: 50,
    maxPeriods: 10,
    showPOC: true,
    showValueArea: true,
    showVahVal: false,
    extendPOC: false,
    splitUpDown: false,
    profileColor: '#3b82f6',
    upColor: '#26a69a',
    downColor: '#ef5350',
    pocColor: '#ef4444',
    valueAreaLineColor: '#f59e0b',
};

const ALGO_KEYS = new Set(['period', 'rows', 'valueAreaPercent', 'maxPeriods']);
const NUMERIC_KEYS = new Set(['rows', 'valueAreaPercent', 'widthPercent', 'maxPeriods', 'lineWidth']);
const NO_VOLUME_NOTE = 'No volume data for this symbol';
const MUTED = '#787b86';

interface PeriodEntry {
    range: PeriodRange;
    key: string;
    outcome: RangeProfileOutcome;
    /** POC extension: index of the first later bar whose range touches the POC (-1 = not touched yet) */
    touchedAt: number;
    /** Last bar index already scanned for the touch */
    scannedTo: number;
}

export class SessionVolumeProfileIndicator extends OverlayIndicator {
    private _sessOptions: SessionVolumeProfileOptions;
    private _entries: PeriodEntry[] = [];
    private _cache = new Map<number, PeriodEntry>();
    private _timeframe: string | null = null;
    private _symKey = '';
    private _intervalSec: number | null = null;
    private _hidden = false;
    private _noVolume = false;

    constructor(options: Partial<SessionVolumeProfileOptions> = {}) {
        const merged = { ...defaultSessionOptions, ...options };
        super(merged);
        this._sessOptions = { ...defaultSessionOptions, ...this._options } as SessionVolumeProfileOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._sessOptions };
    }

    /** Chart symbol / timeframe from the widget (only the timeframe is used: the hide-by-interval rule). */
    setContext(ctx: RemoteContext): void {
        const symKey = `${ctx.symbol}|${ctx.exchange ?? ''}`;
        const hadSymbol = this._symKey !== '';
        const symChanged = symKey !== this._symKey;
        this._symKey = symKey;
        if (symChanged && hadSymbol) { this._cache.clear(); this._entries = []; this._noVolume = false; }
        if (ctx.timeframe === this._timeframe && !symChanged) return;
        this._timeframe = ctx.timeframe;
        // New symbol: the old bars are about to be replaced; show nothing until calculate() brings the new ones.
        if (symChanged && hadSymbol) { this._dataChanged.fire(); return; }
        if (this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
    }

    // --- settings ---

    getSettingsConfig(): IndicatorSettingsConfig {
        const o = this._sessOptions;
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    rows: [
                        selectRow('period', 'Period', [
                            { value: 'day', label: 'Day' },
                            { value: 'week', label: 'Week' },
                            { value: 'month', label: 'Month' },
                        ], o.period),
                        numberRow('rows', 'Rows', 10, 200, 1),
                        numberRow('valueAreaPercent', 'Value Area %', 50, 99, 1),
                        numberRow('widthPercent', 'Profile Width %', 10, 100, 1),
                        numberRow('maxPeriods', 'Max Periods', 1, 100, 1),
                        checkboxRow('showPOC', 'Show POC', o.showPOC),
                        checkboxRow('showValueArea', 'Show Value Area', o.showValueArea),
                        checkboxRow('showVahVal', 'Show VAH / VAL', o.showVahVal),
                        checkboxRow('extendPOC', 'Extend POC Until Touched', o.extendPOC),
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
        return (this._sessOptions as any)[key];
    }

    setSettingValue(key: string, value: any): boolean {
        const v = NUMERIC_KEYS.has(key) ? Number(value) : value;
        Object.assign(this._sessOptions, { [key]: v });
        Object.assign(this._options, { [key]: v });
        const needsRecalc = ALGO_KEYS.has(key);
        if (needsRecalc) {
            this._cache.clear();
            if (this._sourceData.length > 0) this.calculate(this._sourceData);
        }
        this._dataChanged.fire();
        return needsRecalc;
    }

    // --- calculation ---

    private _rows(): number {
        const r = Math.floor(Number(this._sessOptions.rows));
        return Number.isFinite(r) ? Math.max(10, Math.min(200, r)) : 24;
    }

    private _barStepSec(bars: BarData[]): number | null {
        const n = bars.length;
        if (n < 2) return null;
        let best = Infinity;
        for (let i = Math.max(1, n - 6); i < n; i++) {
            const d = (toEpochMs(bars[i].time) - toEpochMs(bars[i - 1].time)) / 1000;
            if (d > 0 && d < best) best = d;
        }
        return Number.isFinite(best) ? best : null;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._entries = [];
        this._noVolume = false;
        const n = sourceData.length;
        const o = this._sessOptions;
        if (n < 2) {
            this._data = [];
            return;
        }
        this._data = sourceData.length === this._data.length
            ? this._data
            : sourceData.map((b) => ({ time: b.time, value: NaN }));

        this._intervalSec = timeframeSeconds(this._timeframe) ?? this._barStepSec(sourceData);
        this._hidden = !intervalFitsPeriod(this._intervalSec, o.period);
        if (this._hidden) return;

        const maxPeriods = Math.max(1, Math.min(100, Math.floor(o.maxPeriods) || 10));
        const rows = this._rows();
        const va = Math.max(1, Math.min(100, o.valueAreaPercent));
        const ranges = lastPeriods(sourceData, o.period, maxPeriods);
        const keep = new Map<number, PeriodEntry>();
        let anyOk = false;
        let anyNoVolume = false;
        for (const range of ranges) {
            const f = sourceData[range.first];
            const l = sourceData[range.last];
            // Fingerprint of the period's first / middle / last bar (time + OHLCV): a different series with the same
            // timestamps (symbol switch, Heikin-Ashi) can never reuse a cached profile.
            const m = sourceData[(range.first + range.last) >> 1];
            const fp = (b: BarData) => `${b.time},${b.open},${b.high},${b.low},${b.close},${b.volume ?? 0}`;
            const key = `${range.first}|${range.last}|${fp(f)}|${fp(m)}|${fp(l)}|${rows}|${va}`;
            let entry = this._cache.get(range.startMs);
            if (!entry || entry.key !== key) {
                entry = { range, key, outcome: summarizeRange(sourceData, range.first, range.last, rows, va), touchedAt: -1, scannedTo: range.last };
            } else {
                entry.range = range;
            }
            if (entry.outcome.kind === 'ok') {
                anyOk = true;
                this._scanTouch(entry, sourceData);
            } else if (entry.outcome.kind === 'novolume') {
                anyNoVolume = true;
            }
            keep.set(range.startMs, entry);
            this._entries.push(entry);
        }
        this._cache = keep;
        this._noVolume = anyNoVolume && !anyOk;
    }

    /** Causal "until touched": first bar after the period whose low..high contains the POC price. */
    private _scanTouch(entry: PeriodEntry, bars: BarData[]): void {
        if (entry.touchedAt >= 0 || entry.outcome.kind !== 'ok') return;
        const poc = entry.outcome.profile.pocPrice;
        const n = bars.length;
        for (let i = entry.scannedTo + 1; i < n; i++) {
            if (bars[i].low <= poc && poc <= bars[i].high) {
                entry.touchedAt = i;
                break;
            }
        }
        entry.scannedTo = n - 1;
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

    // --- legend ---

    private _periodLabel(): string {
        const p = this._sessOptions.period;
        return t(p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'Day');
    }

    private _latestProfile(): RangeProfile | null {
        for (let i = this._entries.length - 1; i >= 0; i--) {
            const out = this._entries[i].outcome;
            if (out.kind === 'ok') return out.profile;
        }
        return null;
    }

    getLegendInfo(_index?: number | null): IndicatorLegendInfo {
        const o = this._sessOptions;
        const info: IndicatorLegendInfo = {
            title: t('Session Volume Profile'),
            params: legendParams(this._periodLabel(), this._rows()),
            plots: [],
        };
        if (this._hidden) {
            info.plots.push({ color: MUTED, value: null, text: t('Hidden: chart interval is not smaller than the period') });
        } else if (this._noVolume) {
            info.plots.push({ color: MUTED, value: null, text: t(NO_VOLUME_NOTE) });
        } else {
            const prof = this._latestProfile();
            info.plots.push({ color: o.pocColor, value: prof ? prof.pocPrice : null, text: prof ? undefined : LEGEND_NO_VALUE });
        }
        return info;
    }

    getDescription(_index?: number): string {
        if (this._hidden) return `${t('Session Volume Profile')}: ${t('Hidden: chart interval is not smaller than the period')}`;
        if (this._noVolume) return `${t('Session Volume Profile')}: ${t(NO_VOLUME_NOTE)}`;
        const prof = this._latestProfile();
        return `${t('Session Volume Profile')} (${this._periodLabel()}) POC ${prof ? prof.pocPrice.toFixed(2) : '-'}`;
    }

    // --- hit test (CSS px; same convention as the fixed-range profile: boolean) ---

    hitTest(x: number, y: number, timeScale: any, priceScale: any): boolean {
        if (this._hidden || this._noVolume) return false;
        const o = this._sessOptions;
        const half = (timeScale.barSpacing as number) / 2;
        const tol = 4;
        for (const entry of this._entries) {
            if (entry.outcome.kind !== 'ok') continue;
            const { range } = entry;
            const res = entry.outcome.profile.result;
            const x0 = (timeScale.indexToCoordinate(range.first as any) as number) - half;
            const x1 = (timeScale.indexToCoordinate(range.last as any) as number) + half;
            if (!Number.isFinite(x0) || !Number.isFinite(x1)) continue;
            const maxW = (x1 - x0) * Math.max(1, Math.min(100, o.widthPercent)) / 100;
            const yHi = priceScale.priceToCoordinate(res.highest) as number;
            const yLo = priceScale.priceToCoordinate(res.lowest) as number;
            if (x >= x0 && x <= x0 + maxW && y >= Math.min(yHi, yLo) && y <= Math.max(yHi, yLo)) return true;
            if (o.showPOC) {
                const yPoc = priceScale.priceToCoordinate(entry.outcome.profile.pocPrice) as number;
                if (x >= x0 && x <= x1 && Math.abs(y - yPoc) <= tol) return true;
            }
        }
        return false;
    }

    // --- drawing ---

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number,
        visibleRange?: { from: number; to: number }
    ): void {
        if (this._hidden || this._noVolume || this._entries.length === 0) return;
        const from = visibleRange ? visibleRange.from : 0;
        const to = visibleRange ? visibleRange.to : Infinity;
        const o = this._sessOptions;
        const half = (timeScale.barSpacing as number) / 2;
        const lastIdx = this._sourceData.length - 1;

        const normal = colorWithAlpha(o.profileColor, 0.28);
        const strong = colorWithAlpha(o.profileColor, 0.6);
        const upNormal = colorWithAlpha(o.upColor, 0.32);
        const upStrong = colorWithAlpha(o.upColor, 0.7);
        const downNormal = colorWithAlpha(o.downColor, 0.32);
        const downStrong = colorWithAlpha(o.downColor, 0.7);

        ctx.save();
        for (const entry of this._entries) {
            if (entry.outcome.kind !== 'ok') continue;
            const { range } = entry;
            const prof = entry.outcome.profile;
            const extEnd = o.extendPOC && o.showPOC && range.last < lastIdx ? (entry.touchedAt >= 0 ? entry.touchedAt : lastIdx) : range.last;
            const inView = range.last >= from && range.first <= to;
            if (!inView && !(extEnd >= from && range.first <= to)) continue;

            const x0 = (timeScale.indexToCoordinate(range.first as any) - half) * hpr;
            const x1 = (timeScale.indexToCoordinate(range.last as any) + half) * hpr;
            if (!Number.isFinite(x0) || !Number.isFinite(x1)) continue;
            const res = prof.result;
            const maxW = (x1 - x0) * Math.max(1, Math.min(100, o.widthPercent)) / 100;

            if (inView) {
                const bins = res.bins;
                const maxVol = res.maxVolume;
                const lo = Math.min(res.valIndex, res.vahIndex);
                const hi = Math.max(res.valIndex, res.vahIndex);
                for (let i = 0; i < bins.length; i++) {
                    const bin = bins[i];
                    if (bin.volume <= 0) continue;
                    const yA = priceScale.priceToCoordinate(bin.high) * vpr;
                    const yB = priceScale.priceToCoordinate(bin.low) * vpr;
                    const top = Math.min(yA, yB);
                    const h = Math.max(1, Math.abs(yB - yA));
                    const w = maxW * (bin.volume / maxVol);
                    const inVa = o.showValueArea && i >= lo && i <= hi;
                    if (o.splitUpDown) {
                        const wUp = w * (bin.upVolume / bin.volume);
                        ctx.fillStyle = inVa ? upStrong : upNormal;
                        ctx.fillRect(x0, top, wUp, h);
                        ctx.fillStyle = inVa ? downStrong : downNormal;
                        ctx.fillRect(x0 + wUp, top, w - wUp, h);
                    } else {
                        ctx.fillStyle = inVa ? strong : normal;
                        ctx.fillRect(x0, top, w, h);
                    }
                }
            }

            if (o.showPOC) {
                this._hline(ctx, priceScale, prof.pocPrice, x0, x1, o.pocColor, o.lineWidth * hpr, [], vpr);
                if (extEnd > range.last) {
                    const xe = (timeScale.indexToCoordinate(extEnd as any) + half) * hpr;
                    this._hline(ctx, priceScale, prof.pocPrice, x1, xe, o.pocColor, 1 * hpr, [4 * hpr, 3 * hpr], vpr);
                }
            }
            if (o.showVahVal && inView) {
                const dash = [5 * hpr, 4 * hpr];
                this._hline(ctx, priceScale, prof.vahPrice, x0, x1, o.valueAreaLineColor, 1 * hpr, dash, vpr);
                this._hline(ctx, priceScale, prof.valPrice, x0, x1, o.valueAreaLineColor, 1 * hpr, dash, vpr);
            }
        }
        ctx.restore();
    }

    private _hline(
        ctx: CanvasRenderingContext2D,
        priceScale: any,
        price: number,
        xa: number,
        xb: number,
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
        ctx.moveTo(xa, y);
        ctx.lineTo(xb, y);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}
