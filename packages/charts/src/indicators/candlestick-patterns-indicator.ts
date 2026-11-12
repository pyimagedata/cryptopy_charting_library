// Candlestick Patterns: marks classic candlestick shapes on closed bars (a small code above bearish /
// below bullish patterns; the full names show in the legend for the bar under the crosshair).
// The still-forming last bar is never labelled. Shape rules only, no claim about what happens next.
// The maths lives in candlestick-patterns-math.ts.

import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import { t } from '../helpers/translations';
import { canvasSans } from '../helpers/fonts';
import { IndicatorLegendInfo, legendBarIndex, LEGEND_NO_VALUE } from './legend-info';
import {
    IndicatorSettingsConfig,
    createInputsTab,
    createStyleTab,
    createVisibilityTab,
    checkboxRow,
    colorRow,
    numberRow,
} from '../gui/indicator_settings';
import { DEFAULT_OFF_PATTERNS, PATTERN_DEFS, PatternDetector, PatternHit } from './candlestick-patterns-math';
import { RemoteContext } from './remote-compute';
import { SeriesFingerprint, syncTimePoints } from './indicator-cache';

/** Catalogue / picker description (EN). */
export const CANDLESTICK_PATTERNS_DESCRIPTION = 'Marks classic candlestick shapes (doji, hammer, engulfing, stars and more) on closed bars.';

export interface CandlestickPatternsOptions extends IndicatorOptions {
    useTrendFilter: boolean;
    trendPeriod: number;
    bullColor: string;
    bearColor: string;
    neutralColor: string;
    /** per pattern toggles: pat_<id>, e.g. pat_hammer (all default on) */
    [key: string]: any;
}

const defaultPatternOptions: Record<string, boolean> = {};
for (const d of PATTERN_DEFS) defaultPatternOptions['pat_' + d.id] = !DEFAULT_OFF_PATTERNS.includes(d.id);

const defaultCandleOptions: Partial<CandlestickPatternsOptions> = {
    name: 'Candlestick Patterns',
    color: '#ffb74d',
    lineWidth: 1,
    style: IndicatorStyle.Line,
    useTrendFilter: true,
    trendPeriod: 20,
    bullColor: '#26a69a',
    bearColor: '#ef5350',
    neutralColor: '#9598a1',
    ...defaultPatternOptions,
};

export class CandlestickPatternsIndicator extends OverlayIndicator {
    private _cOptions: CandlestickPatternsOptions;
    private readonly _detector = new PatternDetector();
    private readonly _fp = new SeriesFingerprint();
    private _ctxKey = '';
    /** reusable per-visible-bar text/dot decision buffer (draw path allocates nothing per frame) */
    private _flags = new Uint8Array(512);

    constructor(options: Partial<CandlestickPatternsOptions> = {}) {
        const mergedOptions = { ...defaultCandleOptions, ...options };
        super(mergedOptions);
        this._cOptions = { ...defaultCandleOptions, ...this._options } as CandlestickPatternsOptions;
        this._cOptions.trendPeriod = clampTrendPeriod(this._cOptions.trendPeriod);
        (this._options as any).trendPeriod = this._cOptions.trendPeriod;
    }

    /** Symbol / timeframe change: drop every cached hit so the old series' labels cannot survive. */
    setContext(ctx: RemoteContext): void {
        const key = `${ctx.symbol}|${ctx.exchange ?? ''}|${ctx.timeframe}`;
        if (key === this._ctxKey) return;
        this._ctxKey = key;
        this._detector.reset();
        this._fp.forget();
        if (this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._cOptions };
    }

    /** Patterns ending on bar `index` (primary first); [] when none, null when the bar is not evaluated. */
    hitsAt(index: number): readonly PatternHit[] | null {
        return this._detector.hits[index] ?? null;
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        const o = this._cOptions;
        return {
            name: this.name,
            tabs: [
                createInputsTab([
                    {
                        rows: [
                            checkboxRow('useTrendFilter', t('Trend filter'), o.useTrendFilter),
                            numberRow('trendPeriod', t('Trend SMA length'), 2, 200, 1),
                        ],
                    },
                    { rows: PATTERN_DEFS.map(d => checkboxRow('pat_' + d.id, t(d.name), o['pat_' + d.id])) },
                ]),
                createStyleTab([{
                    rows: [
                        colorRow('bullColor', t('Bullish label color')),
                        colorRow('bearColor', t('Bearish label color')),
                        colorRow('neutralColor', t('Neutral label color')),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this._options.visible;
        return (this._cOptions as any)[key];
    }

    setSettingValue(key: string, value: any): boolean {
        if (key === 'trendPeriod') value = clampTrendPeriod(value);
        Object.assign(this._cOptions, { [key]: value });
        Object.assign(this._options, { [key]: value });
        if ((key === 'trendPeriod' || key === 'useTrendFilter' || key.startsWith('pat_')) && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        this._dataChanged.fire();
        return false;
    }

    private _detectConfig() {
        const o = this._cOptions;
        const enabled: Record<string, boolean> = {};
        for (const d of PATTERN_DEFS) enabled[d.id] = o['pat_' + d.id] !== false;
        return { enabled, useTrendFilter: o.useTrendFilter, trendPeriod: o.trendPeriod };
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        // _data only mirrors the bar times (nothing numeric to plot)
        this._data = syncTimePoints(this._data, sourceData, this._fp);
        this._detector.update(sourceData, this._detectConfig());
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

    private _colorOf(h: PatternHit): string {
        const o = this._cOptions;
        return h.bias === 'bullish' ? o.bullColor : h.bias === 'bearish' ? o.bearColor : o.neutralColor;
    }

    /** "Bullish Engulfing (+ Hammer, Doji)" for the legend. */
    private _textFor(hits: readonly PatternHit[]): string {
        const [first, ...rest] = hits;
        return rest.length ? `${t(first.name)} (+ ${rest.map(h => t(h.name)).join(', ')})` : t(first.name);
    }

    getLegendInfo(index?: number | null): IndicatorLegendInfo {
        const i = legendBarIndex(this._data.length, index);
        const hits = i >= 0 ? this._detector.hits[i] : null;
        const plot = hits && hits.length > 0
            ? { color: this._colorOf(hits[0]), value: null, text: this._textFor(hits) }
            : { color: this._cOptions.neutralColor, value: null, text: LEGEND_NO_VALUE };
        return { title: t('Candlestick Patterns'), params: [], plots: [plot] };
    }

    getDescription(index?: number): string {
        const i = legendBarIndex(this._data.length, index);
        const hits = i >= 0 ? this._detector.hits[i] : null;
        return `${t('Candlestick Patterns')}: ${hits && hits.length > 0 ? this._textFor(hits) : '-'}`;
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
        const hitsArr = this._detector.hits;
        if (bars.length < 2) return;
        // visible range only; the last bar is still forming and never labelled
        const start = Math.max(0, Math.floor(visibleRange.from));
        const end = Math.min(bars.length - 2, Math.ceil(visibleRange.to));
        const compact = timeScale.barSpacing < 7;
        const spacing = timeScale.barSpacing;

        // Pass 1: decide text (1) or dot (0) per bar. Labels of the same side that would overlap horizontally keep
        // the higher-priority one (more bars in the pattern, then the earlier bar); the others become dots.
        const count = Math.max(0, end - start + 1);
        if (this._flags.length < count) this._flags = new Uint8Array(Math.max(count, this._flags.length * 2));
        const flags = this._flags;
        let keptAbove = -1;
        let keptBelow = -1;
        let keptAboveW = 0;
        let keptBelowW = 0;
        for (let i = start; i <= end; i++) {
            flags[i - start] = 0;
            const hits = hitsArr[i];
            if (!hits || hits.length === 0 || compact) continue;
            const h = hits[0];
            const below = h.bias === 'bullish';
            const w = (h.code.length + (hits.length > 1 ? 1 : 0)) * 5.6 + 3; // text width in css px (9px bold)
            const kept = below ? keptBelow : keptAbove;
            if (kept >= 0) {
                const kw = below ? keptBelowW : keptAboveW;
                if ((i - kept) * spacing < (w + kw) / 2 + 2) {
                    // overlap: higher priority wins
                    if (h.bars > hitsArr[kept]![0].bars) {
                        flags[kept - start] = 0;
                    } else {
                        continue;
                    }
                }
            }
            flags[i - start] = 1;
            if (below) { keptBelow = i; keptBelowW = w; } else { keptAbove = i; keptAboveW = w; }
        }

        // Pass 2: draw
        ctx.save();
        ctx.font = `bold ${9 * hpr}px ${canvasSans()}`;
        ctx.textAlign = 'center';
        for (let i = start; i <= end; i++) {
            const hits = hitsArr[i];
            if (!hits || hits.length === 0) continue;
            const h = hits[0];
            const below = h.bias === 'bullish';
            const yc = priceScale.priceToCoordinate(below ? bars[i].low : bars[i].high);
            if (yc === undefined || yc === null || !Number.isFinite(yc as number)) continue;
            const x = timeScale.indexToCoordinate(i as any) * hpr;
            const y = (yc as number) * vpr + (below ? 4 : -4) * vpr;
            ctx.fillStyle = this._colorOf(h);
            if (flags[i - start] === 1) {
                ctx.textBaseline = below ? 'top' : 'bottom';
                ctx.fillText(hits.length > 1 ? h.code + '*' : h.code, x, y);
            } else {
                ctx.beginPath();
                ctx.arc(x, y, 2 * hpr, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}

function clampTrendPeriod(v: unknown): number {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(2, Math.min(200, n)) : 20;
}
