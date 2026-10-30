import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import { RemoteCompute, RemoteContext, barIndexAtTime, drawAccessNotice } from './remote-compute';
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

// SMT Divergence backend'de hesaplanır (bkz. remote-compute.ts); burada yalnızca çizilir.
interface RemoteSmt {
    compareSymbol: string;
    mode: 'positive' | 'inverse';
    correlation: number | null;
    divergences: Array<{
        side: 'bearish' | 'bullish';
        t1: number;
        t2: number;
        p1: number;
        p2: number;
        ct1: number;
        ct2: number;
        c1: number;
        c2: number;
        leader: 'main' | 'compare';
        confirmTime: number;
    }>;
}

interface SmtLine {
    side: 'bearish' | 'bullish';
    i1: number;
    i2: number;
    p1: number;
    p2: number;
    leader: 'main' | 'compare';
}

export interface SMTDivergenceIndicatorOptions extends IndicatorOptions {
    compareSymbol: string;
    correlation: 'auto' | 'positive' | 'inverse';
    pivotLen: number;
    tolerance: number;
    maxGap: number;
    drawLast: number;
    showBullish: boolean;
    showBearish: boolean;
    showLabels: boolean;
    bullColor: string;
    bearColor: string;
}

const defaultSmtOptions: Partial<SMTDivergenceIndicatorOptions> = {
    name: 'SMT Divergence',
    style: IndicatorStyle.Line,
    lineWidth: 2,
    compareSymbol: 'auto',
    correlation: 'auto',
    pivotLen: 5,
    tolerance: 2,
    maxGap: 60,
    drawLast: 40,
    showBullish: true,
    showBearish: true,
    showLabels: true,
    bullColor: '#22c55e',
    bearColor: '#ef4444',
};

const ALGO_KEYS = [
    'compareSymbol', 'correlation', 'pivotLen', 'tolerance', 'maxGap',
    'showBullish', 'showBearish', 'drawLast',
] as const;

const COMPARE_OPTIONS = ['GC1', 'SI1', 'XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD',
    'USDCHF', 'USDCAD', 'USDJPY', 'USOIL', 'UKOIL', 'BTCUSDT', 'ETHUSDT', 'DXY', 'SPX500', 'NAS100'];

export class SMTDivergenceIndicator extends OverlayIndicator {
    private _smtOptions: SMTDivergenceIndicatorOptions;
    private _lines: SmtLine[] = [];
    private _raw: RemoteSmt | null = null;
    private readonly _remote = new RemoteCompute<RemoteSmt>('smt-divergence', (raw) => {
        this._raw = raw;
        this._rebuild();
    });

    constructor(options: Partial<SMTDivergenceIndicatorOptions> = {}) {
        const merged = { ...defaultSmtOptions, ...options };
        super(merged);
        this._smtOptions = { ...defaultSmtOptions, ...this._options } as SMTDivergenceIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._smtOptions };
    }

    setContext(ctx: RemoteContext): void {
        this._remote.setContext(ctx);
    }

    updateOptions(newOptions: Partial<SMTDivergenceIndicatorOptions>): boolean {
        const needsRecalc = ALGO_KEYS.some((k) => {
            const v = (newOptions as any)[k];
            return v !== undefined && v !== (this._smtOptions as any)[k];
        });

        Object.assign(this._smtOptions, newOptions);
        Object.assign(this._options, newOptions);

        this._dataChanged.fire();
        return needsRecalc;
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        const o = this._smtOptions;
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    rows: [
                        selectRow('compareSymbol', 'Compare Symbol', [
                            { value: 'auto', label: 'Auto' },
                            ...COMPARE_OPTIONS.map((s) => ({ value: s, label: s })),
                        ], o.compareSymbol),
                        selectRow('correlation', 'Correlation', [
                            { value: 'auto', label: 'Auto' },
                            { value: 'positive', label: 'Positive' },
                            { value: 'inverse', label: 'Inverse' },
                        ], o.correlation),
                        numberRow('pivotLen', 'Pivot Length', 2, 30, 1),
                        numberRow('tolerance', 'Tolerance', 0, 10, 1),
                        numberRow('maxGap', 'Max Gap (bars)', 5, 500, 1),
                        numberRow('drawLast', 'Draw Last', 1, 500, 1),
                        checkboxRow('showBullish', 'Show Bullish', o.showBullish),
                        checkboxRow('showBearish', 'Show Bearish', o.showBearish),
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

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<SMTDivergenceIndicatorOptions>);
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        const params: Record<string, unknown> = {};
        for (const key of ALGO_KEYS) params[key] = this._smtOptions[key];
        this._remote.request(params, () => this._dataChanged.fire());
        this._rebuild();
    }

    /** Ham (zaman damgalı) sonucu mevcut mum dizisinin index'lerine çevirir. */
    private _rebuild(): void {
        this._lines = [];
        const bars = this._sourceData;
        this._data = bars.map((b) => ({ time: b.time, value: NaN }));
        if (!this._raw || bars.length === 0) return;
        for (const d of this._raw.divergences ?? []) {
            const i1 = barIndexAtTime(bars, d.t1);
            const i2 = barIndexAtTime(bars, d.t2);
            if (i1 < 0 || i2 < 0) continue;
            this._lines.push({ side: d.side, i1, i2, p1: d.p1, p2: d.p2, leader: d.leader });
        }
    }

    destroy(): void {
        this._remote.destroy();
        super.destroy();
    }

    getRange(): IndicatorRange {
        if (this._sourceData.length === 0) {
            return { min: 0, max: 100 };
        }
        let min = Infinity;
        let max = -Infinity;
        for (const bar of this._sourceData) {
            min = Math.min(min, bar.low);
            max = Math.max(max, bar.high);
        }
        return { min, max };
    }

    getDescription(): string {
        const raw = this._raw;
        if (!raw) return 'SMT';
        let info = raw.compareSymbol;
        if (raw.correlation !== null && raw.correlation !== undefined) {
            const c = raw.correlation;
            info += ` · ${c >= 0 ? '+' : ''}${c.toFixed(2)}`;
        } else if (raw.mode === 'inverse') {
            info += ' · ters';
        }
        return `SMT (${info})`;
    }

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number
    ): void {
        if (this._remote.denied !== null) {
            drawAccessNotice(ctx, hpr, vpr, this._remote, this._smtOptions.name);
            return;
        }
        if (this._lines.length === 0) return;

        const o = this._smtOptions;
        const symbol = this._raw?.compareSymbol ?? '';
        ctx.save();
        ctx.lineCap = 'round';
        for (const l of this._lines) {
            const color = l.side === 'bearish' ? o.bearColor : o.bullColor;
            const x1 = timeScale.indexToCoordinate(l.i1 as any) * hpr;
            const y1 = priceScale.priceToCoordinate(l.p1) * vpr;
            const x2 = timeScale.indexToCoordinate(l.i2 as any) * hpr;
            const y2 = priceScale.priceToCoordinate(l.p2) * vpr;
            if (![x1, y1, x2, y2].every(Number.isFinite)) continue;

            ctx.strokeStyle = color;
            ctx.lineWidth = o.lineWidth * hpr;
            ctx.setLineDash(l.leader === 'compare' ? [6 * hpr, 4 * hpr] : []);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            if (o.showLabels) {
                ctx.setLineDash([]);
                ctx.font = `bold ${9 * hpr}px sans-serif`;
                ctx.fillStyle = color;
                ctx.textAlign = 'center';
                const bear = l.side === 'bearish';
                ctx.textBaseline = bear ? 'bottom' : 'top';
                ctx.fillText(symbol ? `SMT · ${symbol}` : 'SMT', x2, y2 + (bear ? -4 : 4) * vpr);
            }
        }
        ctx.restore();
    }

    hitTest(x: number, y: number, timeScale: any, priceScale: any): boolean {
        const threshold = 8;
        for (const l of this._lines) {
            const x1 = timeScale.indexToCoordinate(l.i1 as any);
            const y1 = priceScale.priceToCoordinate(l.p1);
            const x2 = timeScale.indexToCoordinate(l.i2 as any);
            const y2 = priceScale.priceToCoordinate(l.p2);
            if (_distanceToSegment(x, y, x1, y1, x2, y2) <= threshold) {
                return true;
            }
        }
        return false;
    }
}

function _distanceToSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) {
        return Math.hypot(px - x1, py - y1);
    }
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
