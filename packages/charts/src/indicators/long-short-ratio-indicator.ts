// Long/Short Ratio: Binance long/short ratios (all accounts, top traders by accounts and by positions) and the
// taker buy/sell volume ratio, in a separate pane with a dashed reference line at 1.0.
// Data comes from the EvoTrading backend (GET /api/market/derivs, shared with the Open Interest pane).
// Context read-out, not a signal.

import { IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import { TimeScale } from '../model/time-scale';
import { PriceScale } from '../model/price-scale';
import { t } from '../helpers/translations';
import { IndicatorLegendInfo, legendBarIndex, LegendPlot } from './legend-info';
import { DerivsPaneIndicator, DerivsRow } from './remote-pane-base';
import { formatRatio, lineRuns, NO_VALUE } from './remote-pane-utils';
import {
    IndicatorSettingsConfig,
    createInputsTab,
    createStyleTab,
    createVisibilityTab,
    checkboxRow,
    colorRow,
} from '../gui/indicator_settings';

export interface LongShortRatioOptions extends IndicatorOptions {
    showAccounts: boolean;
    showTopAccounts: boolean;
    showTopPositions: boolean;
    showTaker: boolean;
    accountsColor: string;
    topAccountsColor: string;
    topPositionsColor: string;
    takerColor: string;
    referenceLineColor: string;
}

const defaultLongShortRatioOptions: Partial<LongShortRatioOptions> = {
    name: 'Long/Short Ratio',
    color: '#2962ff',
    lineWidth: 2,
    style: IndicatorStyle.Line,
    showAccounts: true,
    showTopAccounts: true,
    showTopPositions: false,
    showTaker: false,
    accountsColor: '#2962ff',
    topAccountsColor: '#ff9800',
    topPositionsColor: '#ab47bc',
    takerColor: '#26a69a',
    referenceLineColor: '#787b86',
};

/** A gap of more than this many empty bars breaks a line. */
const MAX_GAP_BARS = 3;

interface LineDef {
    /** index in the server row (2 = ls_ratio, 3 = top_ls_ratio, 4 = top_ls_pos_ratio, 5 = taker_ratio) */
    col: number;
    show: keyof LongShortRatioOptions;
    color: keyof LongShortRatioOptions;
    label: string;
}

const LINES: LineDef[] = [
    { col: 2, show: 'showAccounts', color: 'accountsColor', label: 'All accounts' },
    { col: 3, show: 'showTopAccounts', color: 'topAccountsColor', label: 'Top traders (accounts)' },
    { col: 4, show: 'showTopPositions', color: 'topPositionsColor', label: 'Top traders (positions)' },
    { col: 5, show: 'showTaker', color: 'takerColor', label: 'Taker buy/sell' },
];

export class LongShortRatioIndicator extends DerivsPaneIndicator {
    private _lsOptions: LongShortRatioOptions;
    /** one series per LINES entry, one value per source bar (null = no data) */
    private _series: Array<Array<number | null>> = LINES.map(() => []);

    constructor(options: Partial<LongShortRatioOptions> = {}) {
        super({ ...defaultLongShortRatioOptions, ...options });
        this._lsOptions = { ...defaultLongShortRatioOptions, ...this._options } as LongShortRatioOptions;
        this._paneHeight = 120;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._lsOptions };
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    rows: [
                        checkboxRow('showAccounts', t('All accounts'), true),
                        checkboxRow('showTopAccounts', t('Top traders (accounts)'), true),
                        checkboxRow('showTopPositions', t('Top traders (positions)'), false),
                        checkboxRow('showTaker', t('Taker buy/sell'), false),
                    ],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('accountsColor', t('All accounts')),
                        colorRow('topAccountsColor', t('Top traders (accounts)')),
                        colorRow('topPositionsColor', t('Top traders (positions)')),
                        colorRow('takerColor', t('Taker buy/sell')),
                        colorRow('referenceLineColor', t('Reference line (1.0)')),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this._options.visible;
        return (this._lsOptions as any)[key];
    }

    setSettingValue(key: string, value: any): boolean {
        Object.assign(this._lsOptions, { [key]: value });
        Object.assign(this._options, { [key]: value });
        this._dataChanged.fire();
        return false;
    }

    // --- data ---

    protected _buildData(map: number[], rows: DerivsRow[]): void {
        const bars: BarData[] = this._sourceData;
        const series: Array<Array<number | null>> = LINES.map(() => new Array(bars.length));
        this._data = new Array(bars.length);
        for (let i = 0; i < bars.length; i++) {
            const k = map[i];
            for (let s = 0; s < LINES.length; s++) {
                const raw = k >= 0 ? rows[k][LINES[s].col] : null;
                series[s][i] = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
            }
            this._data[i] = { time: bars[i].time, value: series[0][i] ?? NaN };
        }
        this._series = series;
    }

    // --- range / drawing / legend ---

    private _visibleLines(): number[] {
        const out: number[] = [];
        for (let s = 0; s < LINES.length; s++) if (this._lsOptions[LINES[s].show]) out.push(s);
        return out;
    }

    getRange(visibleRange?: { from: number; to: number } | null): IndicatorRange {
        const n = this._data.length;
        if (n === 0) return { min: 0, max: 2 };
        const start = visibleRange ? Math.max(0, Math.floor(visibleRange.from)) : 0;
        const end = visibleRange ? Math.min(n - 1, Math.ceil(visibleRange.to)) : n - 1;
        let min = 1;
        let max = 1;
        for (const s of this._visibleLines()) {
            const arr = this._series[s];
            for (let i = start; i <= end; i++) {
                const v = arr[i];
                if (v === null || v === undefined) continue;
                if (v < min) min = v;
                if (v > max) max = v;
            }
        }
        const pad = (max - min) * 0.1 || 0.1;
        return { min: min - pad, max: max + pad };
    }

    getScaleFormatter(): (v: number) => string {
        return (v: number) => formatRatio(v, 2);
    }

    getLastValueLabels(): Array<{ price: number; text: string; color: string }> {
        const out: Array<{ price: number; text: string; color: string }> = [];
        for (const s of this._visibleLines()) {
            const arr = this._series[s];
            for (let i = arr.length - 1; i >= 0; i--) {
                const v = arr[i];
                if (v !== null && v !== undefined) {
                    out.push({ price: v, text: formatRatio(v, 2), color: this._lsOptions[LINES[s].color] as string });
                    break;
                }
            }
        }
        return out;
    }

    drawPane(ctx: CanvasRenderingContext2D, timeScale: TimeScale, priceScale: PriceScale, width: number, _height: number): void {
        const range = timeScale.visibleRange();
        if (!range || this._data.length === 0) return;
        const o = this._lsOptions;
        const from = Math.max(0, Math.floor(range.from as number));
        const to = Math.min(this._data.length - 1, Math.ceil(range.to as number));

        ctx.save();
        const refY = Math.round(priceScale.priceToCoordinate(1) as number) + 0.5;
        ctx.strokeStyle = o.referenceLineColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, refY);
        ctx.lineTo(width, refY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = o.lineWidth || 2;
        for (const s of this._visibleLines()) {
            const arr = this._series[s];
            ctx.strokeStyle = o[LINES[s].color] as string;
            for (const run of lineRuns(arr, from - 1, to + 1, MAX_GAP_BARS)) {
                ctx.beginPath();
                for (let k = 0; k < run.length; k++) {
                    const x = timeScale.indexToCoordinate(run[k] as any) as number;
                    const y = priceScale.priceToCoordinate(arr[run[k]] as number) as number;
                    if (k === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                if (run.length === 1) {
                    const x = timeScale.indexToCoordinate(run[0] as any) as number;
                    ctx.lineTo(x + 0.01, priceScale.priceToCoordinate(arr[run[0]] as number) as number);
                }
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    getLegendInfo(index?: number | null): IndicatorLegendInfo {
        const i = legendBarIndex(this._data.length, index);
        const plots: LegendPlot[] = this._visibleLines().map((s) => {
            const v = i >= 0 ? this._series[s][i] : null;
            return { color: this._lsOptions[LINES[s].color] as string, value: v, text: v !== null && v !== undefined ? formatRatio(v, 3) : NO_VALUE };
        });
        return this._applyDenied({ title: t('Long/Short Ratio'), params: [], plots });
    }

    getDescription(index?: number): string {
        const i = legendBarIndex(this._data.length, index);
        const parts = this._visibleLines().map((s) => {
            const v = i >= 0 ? this._series[s][i] : null;
            return `${t(LINES[s].label)} ${v !== null && v !== undefined ? formatRatio(v, 3) : '-'}`;
        });
        return `${t('Long/Short Ratio')}: ${parts.join(' ')}`;
    }
}
