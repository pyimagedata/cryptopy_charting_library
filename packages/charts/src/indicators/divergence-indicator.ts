// Divergence: marks divergences between price and an oscillator (RSI or MACD histogram) on the price pane.
// Computed client-side from the loaded bars (divergence-math.ts). A pivot is confirmed R bars after it
// happened; marks are not changed by NEW (appended) bars, and the still-forming bar is not used.
// Caveat: "does not repaint" holds for appended bars only. When older history is loaded (scroll left), or on a
// symbol / timeframe change or a replay step back, the engine restarts from the loaded data; because RSI / MACD
// are recursive, the oscillator near the start of the loaded data (and thus marks there) can change.
// Context read-out, not a signal.

import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import { t } from '../helpers/translations';
import { canvasSans } from '../helpers/fonts';
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
import { DivergenceConfig, DivergenceEngine, DivergenceKind, OscillatorKind } from './divergence-math';

export interface DivergenceIndicatorOptions extends IndicatorOptions {
    oscillator: OscillatorKind;
    rsiLength: number;
    macdFast: number;
    macdSlow: number;
    macdSignal: number;
    /** Pivot bars to the left / right (R = confirmation delay in bars) */
    leftBars: number;
    rightBars: number;
    minBars: number;
    maxBars: number;
    showRegularBull: boolean;
    showRegularBear: boolean;
    showHiddenBull: boolean;
    showHiddenBear: boolean;
    /** Only bullish when the oscillator pivot is below bullLevel / bearish above bearLevel (RSI only) */
    useLevelFilter: boolean;
    bullLevel: number;
    bearLevel: number;
    bullColor: string;
    bearColor: string;
    showLabels: boolean;
}

const defaultDivergenceOptions: Partial<DivergenceIndicatorOptions> = {
    name: 'Divergence',
    style: IndicatorStyle.Line,
    color: '#9c27b0',
    lineWidth: 2,
    oscillator: 'rsi',
    rsiLength: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    leftBars: 5,
    rightBars: 5,
    minBars: 5,
    maxBars: 60,
    showRegularBull: true,
    showRegularBear: true,
    showHiddenBull: false,
    showHiddenBear: false,
    useLevelFilter: false,
    bullLevel: 40,
    bearLevel: 60,
    bullColor: '#26a69a',
    bearColor: '#ef5350',
    showLabels: true,
};

/** Settings that change the detected set (everything else only changes what is drawn). */
const ALGO_KEYS = new Set([
    'oscillator', 'rsiLength', 'macdFast', 'macdSlow', 'macdSignal', 'leftBars', 'rightBars', 'minBars', 'maxBars',
]);
const NUMERIC_KEYS = new Set([
    'rsiLength', 'macdFast', 'macdSlow', 'macdSignal', 'leftBars', 'rightBars', 'minBars', 'maxBars',
    'bullLevel', 'bearLevel', 'lineWidth',
]);

const LABEL_EN: Record<DivergenceKind, string> = { bull: 'Bull', hbull: 'H Bull', bear: 'Bear', hbear: 'H Bear' };

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

export class DivergenceIndicator extends OverlayIndicator {
    private _divOptions: DivergenceIndicatorOptions;
    private readonly _engine: DivergenceEngine;
    /** Divergences drawn in the last paint (legend count) */
    private _visibleCount = -1;

    constructor(options: Partial<DivergenceIndicatorOptions> = {}) {
        const merged = { ...defaultDivergenceOptions, ...options };
        super(merged);
        this._divOptions = { ...defaultDivergenceOptions, ...this._options } as DivergenceIndicatorOptions;
        this._engine = new DivergenceEngine(this._config());
    }

    private _config(): DivergenceConfig {
        const o = this._divOptions;
        const slow = clampInt(o.macdSlow, 2, 200, 26);
        return {
            oscillator: o.oscillator === 'macd' ? 'macd' : 'rsi',
            rsiLength: clampInt(o.rsiLength, 1, 200, 14),
            macdFast: Math.min(clampInt(o.macdFast, 1, 200, 12), slow - 1),
            macdSlow: slow,
            macdSignal: clampInt(o.macdSignal, 1, 200, 9),
            left: clampInt(o.leftBars, 1, 50, 5),
            right: clampInt(o.rightBars, 1, 50, 5),
            minBars: clampInt(o.minBars, 1, 500, 5),
            maxBars: clampInt(o.maxBars, 1, 1000, 60),
        };
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._divOptions };
    }

    // --- settings ---

    getSettingsConfig(): IndicatorSettingsConfig {
        const o = this._divOptions;
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    rows: [
                        selectRow('oscillator', 'Oscillator', [
                            { value: 'rsi', label: 'RSI' },
                            { value: 'macd', label: 'MACD Histogram' },
                        ], o.oscillator),
                        numberRow('rsiLength', 'RSI Length', 1, 200, 1),
                        numberRow('macdFast', 'MACD Fast Length', 1, 200, 1),
                        numberRow('macdSlow', 'MACD Slow Length', 2, 200, 1),
                        numberRow('macdSignal', 'MACD Signal Length', 1, 200, 1),
                        numberRow('leftBars', 'Pivot Left Bars', 1, 50, 1),
                        numberRow('rightBars', 'Pivot Right Bars', 1, 50, 1),
                        numberRow('minBars', 'Min Bars Between Pivots', 1, 500, 1),
                        numberRow('maxBars', 'Max Bars Between Pivots', 1, 1000, 1),
                        checkboxRow('showRegularBull', 'Regular Bullish', o.showRegularBull),
                        checkboxRow('showRegularBear', 'Regular Bearish', o.showRegularBear),
                        checkboxRow('showHiddenBull', 'Hidden Bullish', o.showHiddenBull),
                        checkboxRow('showHiddenBear', 'Hidden Bearish', o.showHiddenBear),
                        checkboxRow('useLevelFilter', 'Oscillator Level Filter (RSI only)', o.useLevelFilter),
                        numberRow('bullLevel', 'Bullish Only Below', 0, 100, 1),
                        numberRow('bearLevel', 'Bearish Only Above', 0, 100, 1),
                    ],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('bullColor', 'Bullish Color', o.bullColor),
                        colorRow('bearColor', 'Bearish Color', o.bearColor),
                        lineWidthRow('lineWidth', 'Line Width'),
                        checkboxRow('showLabels', 'Show Labels', o.showLabels),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this._options.visible;
        return (this._divOptions as any)[key];
    }

    setSettingValue(key: string, value: any): boolean {
        const v = NUMERIC_KEYS.has(key) ? Number(value) : value;
        Object.assign(this._divOptions, { [key]: v });
        Object.assign(this._options, { [key]: v });
        const needsRecalc = ALGO_KEYS.has(key);
        if (needsRecalc) {
            this._engine.setConfig(this._config());
            if (this._sourceData.length > 0) this.calculate(this._sourceData);
        }
        this._visibleCount = -1;
        this._dataChanged.fire();
        return needsRecalc;
    }

    // --- calculation ---

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        const n = sourceData.length;
        // The last bar is the forming one: never used.
        this._engine.sync(sourceData, n - 1);
        if (this._data.length !== n) {
            this._data = sourceData.map((b) => ({ time: b.time, value: NaN }));
        } else if (n > 0) {
            this._data[n - 1] = { time: sourceData[n - 1].time, value: NaN };
        }
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

    /** Is this divergence enabled by the kind toggles and (RSI only) the level filter? */
    private _accepts(kind: DivergenceKind, oscB: number): boolean {
        const o = this._divOptions;
        if (kind === 'bull' && !o.showRegularBull) return false;
        if (kind === 'bear' && !o.showRegularBear) return false;
        if (kind === 'hbull' && !o.showHiddenBull) return false;
        if (kind === 'hbear' && !o.showHiddenBear) return false;
        if (o.useLevelFilter && o.oscillator === 'rsi') {
            const bullish = kind === 'bull' || kind === 'hbull';
            if (bullish && !(oscB < o.bullLevel)) return false;
            if (!bullish && !(oscB > o.bearLevel)) return false;
        }
        return true;
    }

    // --- legend ---

    private _oscName(): string {
        const o = this._divOptions;
        return o.oscillator === 'macd' ? 'MACD' : 'RSI';
    }

    private _acceptedTotal(): number {
        let c = 0;
        for (const d of this._engine.divergences) if (this._accepts(d.kind, d.oscB)) c++;
        return c;
    }

    private _latest(): { kind: DivergenceKind } | null {
        const divs = this._engine.divergences;
        for (let i = divs.length - 1; i >= 0; i--) if (this._accepts(divs[i].kind, divs[i].oscB)) return divs[i];
        return null;
    }

    getLegendInfo(_index?: number | null): IndicatorLegendInfo {
        const o = this._divOptions;
        const count = this._visibleCount >= 0 ? this._visibleCount : this._acceptedTotal();
        const latest = this._latest();
        const bullish = latest ? latest.kind === 'bull' || latest.kind === 'hbull' : true;
        const params = o.oscillator === 'macd'
            ? legendParams('MACD', o.macdFast, o.macdSlow, o.macdSignal, o.leftBars, o.rightBars)
            : legendParams('RSI', o.rsiLength, o.leftBars, o.rightBars);
        return {
            title: t('Divergence'),
            params,
            plots: [
                { color: o.color, value: count, text: String(count) },
                {
                    color: latest ? (bullish ? o.bullColor : o.bearColor) : o.color,
                    value: null,
                    text: latest ? t(LABEL_EN[latest.kind]) : LEGEND_NO_VALUE,
                },
            ],
        };
    }

    getDescription(_index?: number): string {
        const count = this._visibleCount >= 0 ? this._visibleCount : this._acceptedTotal();
        return `${t('Divergence')} (${this._oscName()}): ${count}`;
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
        const divs = this._engine.divergences;
        const from = visibleRange ? visibleRange.from : 0;
        const to = visibleRange ? visibleRange.to : Infinity;
        const o = this._divOptions;
        let drawn = 0;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.font = `bold ${9 * hpr}px ${canvasSans()}`;
        ctx.textAlign = 'center';
        // divergences are ordered by b: walk back from the newest and stop once b is left of the view
        for (let k = divs.length - 1; k >= 0; k--) {
            const d = divs[k];
            if (d.b < from) break;
            if (d.a > to || !this._accepts(d.kind, d.oscB)) continue;
            drawn++;
            const bullish = d.kind === 'bull' || d.kind === 'hbull';
            const hidden = d.kind === 'hbull' || d.kind === 'hbear';
            const color = bullish ? o.bullColor : o.bearColor;
            const x1 = timeScale.indexToCoordinate(d.a as any) * hpr;
            const y1 = priceScale.priceToCoordinate(d.priceA) * vpr;
            const x2 = timeScale.indexToCoordinate(d.b as any) * hpr;
            const y2 = priceScale.priceToCoordinate(d.priceB) * vpr;
            if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) continue;

            ctx.strokeStyle = color;
            ctx.lineWidth = o.lineWidth * hpr;
            ctx.setLineDash(hidden ? [5 * hpr, 4 * hpr] : []);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            if (o.showLabels) {
                ctx.setLineDash([]);
                ctx.fillStyle = color;
                ctx.textBaseline = bullish ? 'top' : 'bottom';
                ctx.fillText(t(LABEL_EN[d.kind]), x2, y2 + (bullish ? 4 : -4) * vpr);
            }
        }
        ctx.restore();

        this._visibleCount = drawn;
    }

    hitTest(x: number, y: number, timeScale: any, priceScale: any): boolean {
        const divs = this._engine.divergences;
        for (let k = divs.length - 1; k >= 0; k--) {
            const d = divs[k];
            if (!this._accepts(d.kind, d.oscB)) continue;
            const x1 = timeScale.indexToCoordinate(d.a as any);
            const y1 = priceScale.priceToCoordinate(d.priceA);
            const x2 = timeScale.indexToCoordinate(d.b as any);
            const y2 = priceScale.priceToCoordinate(d.priceB);
            if (x > Math.max(x1, x2) + 8) continue;
            if (distanceToSegment(x, y, x1, y1, x2, y2) <= 8) return true;
        }
        return false;
    }
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const u = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (x1 + u * dx), py - (y1 + u * dy));
}
