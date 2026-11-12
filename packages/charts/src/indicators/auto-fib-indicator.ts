// Auto Fibonacci: retracement levels over the highest high / lowest low of the last N bars.
// Recomputed from the last N bars; levels move when a new high or low forms. This is intentional and it
// is NOT a signal. The maths lives in auto-fib-math.ts.

import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import { t } from '../helpers/translations';
import { canvasSans } from '../helpers/fonts';
import { IndicatorLegendInfo, legendParams } from './legend-info';
import { SeriesFingerprint, syncTimePoints } from './indicator-cache';
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
import { FIB_LEVELS, FibResult, computeFibRange, fibPrice, formatRatio } from './auto-fib-math';
import { formatPrice } from './pivot-math';

/** Catalogue / picker description (EN). */
export const AUTO_FIB_DESCRIPTION = 'Recomputed from the last N bars; levels move when a new high or low forms.';

export type AutoFibLabelPosition = 'left' | 'right';
export type AutoFibLineStyle = 'solid' | 'dashed' | 'dotted';

export interface AutoFibOptions extends IndicatorOptions {
    /** window size in bars (20-1000) */
    lookback: number;
    show0: boolean;
    show236: boolean;
    show382: boolean;
    show500: boolean;
    show618: boolean;
    show786: boolean;
    show1000: boolean;
    /** extensions, default off */
    show1272: boolean;
    show1618: boolean;
    extendLeft: boolean;
    extendRight: boolean;
    /** diagonal line between the two anchors */
    showTrendLine: boolean;
    showLabels: boolean;
    showPrices: boolean;
    labelPosition: AutoFibLabelPosition;
    /** true: each level has its own colour (color0..color1618); false: everything uses `color` */
    perLevelColors: boolean;
    color0: string;
    color236: string;
    color382: string;
    color500: string;
    color618: string;
    color786: string;
    color1000: string;
    color1272: string;
    color1618: string;
    lineStyle: AutoFibLineStyle;
}

const defaultAutoFibOptions: Partial<AutoFibOptions> = {
    name: 'Auto Fib',
    color: '#787b86',
    lineWidth: 1,
    style: IndicatorStyle.Line,
    lookback: 100,
    show0: true,
    show236: true,
    show382: true,
    show500: true,
    show618: true,
    show786: true,
    show1000: true,
    show1272: false,
    show1618: false,
    extendLeft: false,
    extendRight: true,
    showTrendLine: true,
    showLabels: true,
    showPrices: true,
    labelPosition: 'left',
    perLevelColors: true,
    color0: '#787b86',
    color236: '#ef5350',
    color382: '#ff9800',
    color500: '#4caf50',
    color618: '#26a69a',
    color786: '#2196f3',
    color1000: '#787b86',
    color1272: '#ab47bc',
    color1618: '#e91e63',
    lineStyle: 'solid',
};

export class AutoFibIndicator extends OverlayIndicator {
    private _fibOptions: AutoFibOptions;
    private _fib: FibResult | null = null;
    private readonly _fp = new SeriesFingerprint();

    constructor(options: Partial<AutoFibOptions> = {}) {
        const mergedOptions = { ...defaultAutoFibOptions, ...options };
        super(mergedOptions);
        this._fibOptions = { ...defaultAutoFibOptions, ...this._options } as AutoFibOptions;
        this._fibOptions.lookback = clampLookback(this._fibOptions.lookback);
        (this._options as any).lookback = this._fibOptions.lookback;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._fibOptions };
    }

    get fib(): FibResult | null {
        return this._fib;
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        const o = this._fibOptions;
        return {
            name: this.name,
            tabs: [
                createInputsTab([
                    { rows: [numberRow('lookback', t('Lookback (bars)'), 20, 1000, 1)] },
                    { rows: FIB_LEVELS.map(l => checkboxRow('show' + l.id, formatRatio(l.ratio), (o as any)['show' + l.id])) },
                    {
                        rows: [
                            checkboxRow('extendLeft', t('Extend lines left'), o.extendLeft),
                            checkboxRow('extendRight', t('Extend lines right'), o.extendRight),
                            checkboxRow('showTrendLine', t('Show trend line'), o.showTrendLine),
                            checkboxRow('showLabels', t('Show labels'), o.showLabels),
                            checkboxRow('showPrices', t('Show prices in labels'), o.showPrices),
                            selectRow('labelPosition', t('Label position'), [
                                { value: 'left', label: t('Left') },
                                { value: 'right', label: t('Right') },
                            ]),
                        ],
                    },
                ]),
                createStyleTab([
                    {
                        rows: [
                            checkboxRow('perLevelColors', t('Color per level'), o.perLevelColors),
                            colorRow('color', t('Line Color')),
                            lineWidthRow('lineWidth', t('Line Width')),
                            selectRow('lineStyle', t('Line style'), [
                                { value: 'solid', label: t('Solid') },
                                { value: 'dashed', label: t('Dashed') },
                                { value: 'dotted', label: t('Dotted') },
                            ]),
                        ],
                    },
                    { rows: FIB_LEVELS.map(l => colorRow('color' + l.id, formatRatio(l.ratio))) },
                ]),
                createVisibilityTab(),
            ],
        };
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this._options.visible;
        return (this._fibOptions as any)[key];
    }

    setSettingValue(key: string, value: any): boolean {
        if (key === 'lookback') value = clampLookback(value);
        Object.assign(this._fibOptions, { [key]: value });
        Object.assign(this._options, { [key]: value });
        if (key === 'lookback' && this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
        return false;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._data = syncTimePoints(this._data, sourceData, this._fp);
        this._fib = computeFibRange(sourceData, this._fibOptions.lookback);
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
        return { title: t('Auto Fib'), params: legendParams(this._fibOptions.lookback), plots: [] };
    }

    getDescription(): string {
        return `${t('Auto Fib')} (${this._fibOptions.lookback})`;
    }

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number
    ): void {
        const fib = this._fib;
        const bars = this._sourceData;
        if (!fib || bars.length === 0) return;
        const o = this._fibOptions;
        const halfBar = timeScale.barSpacing / 2;
        const widthPx = timeScale.width * hpr;
        const xStart = o.extendLeft ? 0 : Math.max(0, timeScale.indexToCoordinate(fib.startIdx as any) * hpr);
        const xEnd = o.extendRight ? widthPx : (timeScale.indexToCoordinate((bars.length - 1) as any) + halfBar) * hpr;
        if (xEnd <= xStart) return;

        ctx.save();
        ctx.lineCap = 'butt';
        ctx.font = `${10 * hpr}px ${canvasSans()}`;
        ctx.textBaseline = 'bottom';

        if (o.showTrendLine) {
            const y1 = priceScale.priceToCoordinate(fib.startPrice);
            const y2 = priceScale.priceToCoordinate(fib.endPrice);
            if (Number.isFinite(y1 as number) && Number.isFinite(y2 as number)) {
                ctx.strokeStyle = o.color;
                ctx.lineWidth = 1 * hpr;
                ctx.setLineDash([4 * hpr, 4 * hpr]);
                ctx.beginPath();
                ctx.moveTo(timeScale.indexToCoordinate(fib.startIdx as any) * hpr, (y1 as number) * vpr);
                ctx.lineTo(timeScale.indexToCoordinate(fib.endIdx as any) * hpr, (y2 as number) * vpr);
                ctx.stroke();
            }
        }

        ctx.lineWidth = Math.max(1, o.lineWidth) * hpr;
        ctx.setLineDash(o.lineStyle === 'dashed' ? [6 * hpr, 4 * hpr] : o.lineStyle === 'dotted' ? [2 * hpr, 3 * hpr] : []);
        const labelLeft = o.labelPosition === 'left';
        ctx.textAlign = labelLeft ? 'left' : 'right';
        for (const lvl of FIB_LEVELS) {
            if (!(o as any)['show' + lvl.id]) continue;
            const price = fibPrice(fib, lvl.ratio);
            const yc = priceScale.priceToCoordinate(price);
            if (yc === undefined || yc === null || !Number.isFinite(yc as number)) continue;
            const y = (yc as number) * vpr;
            const color = o.perLevelColors ? (o as any)['color' + lvl.id] || o.color : o.color;
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.moveTo(xStart, y);
            ctx.lineTo(xEnd, y);
            ctx.stroke();
            if (o.showLabels) {
                const ratio = formatRatio(lvl.ratio);
                const text = o.showPrices ? `${ratio} (${formatPrice(price, this._options.precision)})` : ratio;
                ctx.fillStyle = color;
                ctx.fillText(text, labelLeft ? xStart + 4 * hpr : xEnd - 4 * hpr, y - 2 * vpr);
            }
        }
        ctx.restore();
    }
}

function clampLookback(v: unknown): number {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return 100;
    return Math.max(20, Math.min(1000, n));
}
