/**
 * MOST - Moving Stop Loss (Anil Ozeksi): a moving average (ExMov) with a percent- or
 * ATR-based trailing stop. BUY / SELL where ExMov crosses the stop, trend fill between
 * the two lines and a compact summary HUD. Computed on the client from the loaded bars.
 */

import { OverlayIndicator, IndicatorOptions, IndicatorRange } from './indicator';
import { BarData } from '../model/data';
import { TimeScale } from '../model/time-scale';
import { PriceScale } from '../model/price-scale';
import { t } from '../helpers/translations';
import { IndicatorLegendInfo, legendParams, legendBarIndex } from './legend-info';
import {
    IndicatorSettingsConfig, createInputsTab, createStyleTab, createVisibilityTab,
    checkboxRow, colorRow, numberRow, selectRow,
} from '../gui/indicator_settings';

export interface MostOptions extends IndicatorOptions {
    source: 'close' | 'hl2' | 'hlc3' | 'ohlc4' | 'open';
    maType: 'TSF' | 'EMA' | 'VAR' | 'WMA' | 'SMA' | 'TMA' | 'WWMA' | 'ZLEMA';
    length: number;
    bandMode: 'percent' | 'atr';
    percent: number;
    atrMult: number;
    useSlopeFlat: boolean;
    showSignals: boolean;
    showFill: boolean;
    showHud: boolean;
    exMovColor: string;
    mostColor: string;
    bullFillColor: string;
    bearFillColor: string;
}

interface MostSignal {
    bar: number;
    dir: 1 | -1;
    price: number;
}

const DEFAULT_MOST_OPTIONS: Partial<MostOptions> = {
    name: 'MOST - Moving Stop Loss',
    visible: true,
    color: '#00e676',
    lineWidth: 2,
    source: 'close',
    maType: 'TSF',
    length: 8,
    bandMode: 'percent',
    percent: 2.5,
    atrMult: 3.0,
    useSlopeFlat: false,
    showSignals: true,
    showFill: true,
    showHud: true,
    exMovColor: '#22c55e',
    mostColor: '#dc2626',
    bullFillColor: '#22c55e',
    bearFillColor: '#ef4444',
};

export class MostIndicator extends OverlayIndicator {
    private _cfg: MostOptions;
    private _exMov: Float64Array = new Float64Array(0);
    private _most: Float64Array = new Float64Array(0);
    private _dir: Int8Array = new Int8Array(0);
    private _effDir: Int8Array = new Int8Array(0);
    private _signals: MostSignal[] = [];
    private _stats = { total: 0, wins: 0, losses: 0, pf: 0, netPct: 0 };

    constructor(options: Partial<MostOptions> = {}) {
        super({ ...DEFAULT_MOST_OPTIONS, ...options });
        this._cfg = { ...DEFAULT_MOST_OPTIONS, ...this._options } as MostOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._cfg };
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([
                    {
                        title: t('MOST - Moving Stop Loss (Anil Ozeksi)'),
                        rows: [
                            selectRow('source', t('Source'), [
                                { value: 'close', label: t('Close (price)') },
                                { value: 'hl2', label: 'HL2' },
                                { value: 'hlc3', label: 'HLC3' },
                                { value: 'ohlc4', label: 'OHLC4' },
                                { value: 'open', label: t('Open') },
                            ], 'close'),
                            selectRow('maType', t('Moving average type'), [
                                { value: 'TSF', label: t('TSF (gold M5/M15/H4 champion)') },
                                { value: 'EMA', label: t('EMA (classic default)') },
                                { value: 'VAR', label: t('VAR (VIDYA / CMO, corrected)') },
                                { value: 'WMA', label: t('WMA (gold H1 champion)') },
                                { value: 'ZLEMA', label: t('ZLEMA (zero-lag EMA)') },
                                { value: 'WWMA', label: t('WWMA (Wilder)') },
                                { value: 'SMA', label: 'SMA' },
                                { value: 'TMA', label: 'TMA' },
                            ], 'TSF'),
                            numberRow('length', t('Moving average length'), 1, 200, 1),
                            selectRow('bandMode', t('Stop band type'), [
                                { value: 'percent', label: t('Original percent (%)') },
                                { value: 'atr', label: t('ATR-MOST (volatility adaptive)') },
                            ], 'percent'),
                            numberRow('percent', t('Shift percent (%)'), 0.05, 20.0, 0.1),
                            numberRow('atrMult', t('ATR multiplier (ATR-MOST only)'), 0.5, 15.0, 0.5),
                            checkboxRow('useSlopeFlat', t('Slope filter (show grey FLAT when sideways)'), false),
                        ],
                    },
                    {
                        title: t('Display'),
                        rows: [
                            checkboxRow('showSignals', t('Show BUY / SELL labels'), true),
                            checkboxRow('showFill', t('Show trend fill'), true),
                            checkboxRow('showHud', t('Show MOST summary HUD (top right)'), true),
                        ],
                    },
                ]),
                createStyleTab([{
                    rows: [
                        colorRow('exMovColor', t('ExMov line color'), '#22c55e'),
                        colorRow('mostColor', t('MOST stop line color'), '#dc2626'),
                        colorRow('bullFillColor', t('Uptrend fill color'), '#22c55e'),
                        colorRow('bearFillColor', t('Downtrend fill color'), '#ef4444'),
                        numberRow('lineWidth', t('Line Width'), 1, 5, 1),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    setSettingValue(key: string, value: any): boolean {
        const numKeys = ['length', 'percent', 'atrMult', 'lineWidth'];
        const normVal = numKeys.includes(key) ? Number(value) : value;
        (this._cfg as any)[key] = normVal;
        (this._options as any)[key] = normVal;
        const visualOnly = ['showSignals', 'showFill', 'showHud', 'exMovColor', 'mostColor', 'bullFillColor', 'bearFillColor', 'lineWidth', 'visible'];
        const needsRecalc = !visualOnly.includes(key);
        if (needsRecalc && this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
        return needsRecalc;
    }

    private _sma(s: Float64Array, len: number): Float64Array {
        const n = s.length, out = new Float64Array(n);
        let sum = 0;
        for (let i = 0; i < n; i++) {
            sum += s[i];
            if (i >= len) sum -= s[i - len];
            out[i] = sum / Math.min(i + 1, len);
        }
        return out;
    }

    private _ema(s: Float64Array, len: number): Float64Array {
        const n = s.length, out = new Float64Array(n);
        if (n === 0) return out;
        const a = 2 / (len + 1);
        out[0] = s[0];
        for (let i = 1; i < n; i++) out[i] = a * s[i] + (1 - a) * out[i - 1];
        return out;
    }

    private _wma(s: Float64Array, len: number): Float64Array {
        const n = s.length, out = new Float64Array(n);
        const den = len * (len + 1) * 0.5;
        for (let i = 0; i < n; i++) {
            if (i < len - 1) out[i] = s[i];
            else {
                let acc = 0;
                for (let k = 0; k < len; k++) acc += s[i - len + 1 + k] * (k + 1);
                out[i] = acc / den;
            }
        }
        return out;
    }

    private _tma(s: Float64Array, len: number): Float64Array {
        const l1 = Math.max(1, Math.ceil(len / 2));
        const l2 = Math.max(1, Math.floor(len / 2) + 1);
        return this._sma(this._sma(s, l1), l2);
    }

    private _varMA(s: Float64Array, len: number): Float64Array {
        const n = s.length, out = new Float64Array(n);
        if (n === 0) return out;
        const a = 2 / (len + 1);
        const up = new Float64Array(n), dn = new Float64Array(n);
        for (let i = 1; i < n; i++) {
            const d = s[i] - s[i - 1];
            if (d > 0) up[i] = d; else if (d < 0) dn[i] = -d;
        }
        out[0] = s[0];
        for (let i = 1; i < n; i++) {
            let su = 0, sd = 0;
            const st = Math.max(0, i - 8);
            for (let k = st; k <= i; k++) { su += up[k]; sd += dn[k]; }
            const cmo = (su + sd) > 1e-12 ? (su - sd) / (su + sd) : 0;
            const ac = a * Math.abs(cmo);
            out[i] = ac * s[i] + (1 - ac) * out[i - 1];
        }
        return out;
    }

    private _wwma(s: Float64Array, len: number): Float64Array {
        const n = s.length, out = new Float64Array(n);
        if (n === 0) return out;
        const a = 1 / len;
        out[0] = s[0];
        for (let i = 1; i < n; i++) out[i] = a * s[i] + (1 - a) * out[i - 1];
        return out;
    }

    private _zlema(s: Float64Array, len: number): Float64Array {
        const n = s.length, lag = len % 2 === 0 ? len / 2 : (len - 1) / 2;
        const adj = new Float64Array(n);
        for (let i = 0; i < n; i++) adj[i] = i >= lag ? (s[i] + (s[i] - s[i - lag])) : s[i];
        return this._ema(adj, len);
    }

    private _tsf(s: Float64Array, len: number): Float64Array {
        const n = s.length, out = new Float64Array(n);
        if (len < 2) { out.set(s); return out; }
        let sx = 0, sxx = 0;
        for (let k = 0; k < len; k++) { sx += k; sxx += k * k; }
        const den = len * sxx - sx * sx;
        for (let i = 0; i < n; i++) {
            if (i < len - 1) out[i] = s[i];
            else {
                let sy = 0, sxy = 0;
                for (let k = 0; k < len; k++) { const v = s[i - len + 1 + k]; sy += v; sxy += k * v; }
                const m = (len * sxy - sx * sy) / den;
                const b = (sy - m * sx) / len;
                out[i] = b + m * (len - 1) + m;
            }
        }
        return out;
    }

    private _getMA(s: Float64Array, len: number): Float64Array {
        switch (this._cfg.maType) {
            case 'SMA':   return this._sma(s, len);
            case 'EMA':   return this._ema(s, len);
            case 'WMA':   return this._wma(s, len);
            case 'TMA':   return this._tma(s, len);
            case 'VAR':   return this._varMA(s, len);
            case 'WWMA':  return this._wwma(s, len);
            case 'ZLEMA': return this._zlema(s, len);
            case 'TSF':   return this._tsf(s, len);
            default:      return this._ema(s, len);
        }
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._signals = [];
        this._stats = { total: 0, wins: 0, losses: 0, pf: 0, netPct: 0 };

        const n = sourceData.length;
        this._data = new Array(n);
        this._exMov = new Float64Array(n).fill(NaN);
        this._most = new Float64Array(n).fill(NaN);
        this._dir = new Int8Array(n);
        this._effDir = new Int8Array(n);

        if (n < 2) {
            for (let i = 0; i < n; i++) this._data[i] = { time: sourceData[i].time, value: NaN };
            return;
        }

        const src = new Float64Array(n);
        const atr = new Float64Array(n);
        let atrV = sourceData[0].high - sourceData[0].low;
        for (let i = 0; i < n; i++) {
            const b = sourceData[i];
            if (this._cfg.source === 'hl2') src[i] = (b.high + b.low) * 0.5;
            else if (this._cfg.source === 'hlc3') src[i] = (b.high + b.low + b.close) / 3;
            else if (this._cfg.source === 'ohlc4') src[i] = (b.open + b.high + b.low + b.close) * 0.25;
            else if (this._cfg.source === 'open') src[i] = b.open;
            else src[i] = b.close;

            const pc = i > 0 ? sourceData[i - 1].close : b.open;
            const tr = Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
            atrV = i === 0 ? tr : ((atrV * 13 + tr) / 14);
            atr[i] = atrV;
        }

        const len = Math.max(1, Math.round(this._cfg.length));
        const ex = this._getMA(src, len);
        const isAtr = this._cfg.bandMode === 'atr';

        let lPrev = ex[0] - (isAtr ? this._cfg.atrMult * atr[0] : ex[0] * this._cfg.percent * 0.01);
        let sPrev = ex[0] + (isAtr ? this._cfg.atrMult * atr[0] : ex[0] * this._cfg.percent * 0.01);
        let d: 1 | -1 = 1;

        this._exMov[0] = ex[0];
        this._most[0] = lPrev;
        this._dir[0] = 1;
        this._effDir[0] = 1;
        this._data[0] = { time: sourceData[0].time, value: lPrev, values: [ex[0], lPrev, 1] };

        let pos = 0, entryPx = 0, sumW = 0, sumL = 0, cumNet = 0;

        for (let i = 1; i < n; i++) {
            const fark = isAtr ? (this._cfg.atrMult * atr[i]) : (ex[i] * this._cfg.percent * 0.01);
            let lStop = ex[i] - fark;
            if (ex[i] > lPrev && lPrev > lStop) lStop = lPrev;
            let sStop = ex[i] + fark;
            if (ex[i] < sPrev && sPrev < sStop) sStop = sPrev;

            if (d === -1 && ex[i] > sPrev) d = 1;
            else if (d === 1 && ex[i] < lPrev) d = -1;

            const mVal = d === 1 ? lStop : sStop;
            this._exMov[i] = ex[i];
            this._most[i] = mVal;
            this._dir[i] = d;

            let eff: number = d;
            if (this._cfg.useSlopeFlat) {
                if (d === 1 && ex[i] <= ex[i - 1]) eff = 0;
                else if (d === -1 && ex[i] >= ex[i - 1]) eff = 0;
            }
            this._effDir[i] = eff;

            // Exact crossover / crossunder of exMov vs most (matching Pine script!)
            const buySig = (ex[i - 1] <= this._most[i - 1]) && (ex[i] > mVal);
            const sellSig = (ex[i - 1] >= this._most[i - 1]) && (ex[i] < mVal);
            if (buySig) {
                this._signals.push({ bar: i, dir: 1, price: sourceData[i].close });
                if (pos === -1) {
                    const ret = (entryPx - sourceData[i].close) / Math.max(entryPx, 1e-6) * 100;
                    this._stats.total++; cumNet += ret;
                    if (ret > 0) { this._stats.wins++; sumW += ret; } else { this._stats.losses++; sumL += Math.abs(ret); }
                }
                pos = 1; entryPx = sourceData[i].close;
            } else if (sellSig) {
                this._signals.push({ bar: i, dir: -1, price: sourceData[i].close });
                if (pos === 1) {
                    const ret = (sourceData[i].close - entryPx) / Math.max(entryPx, 1e-6) * 100;
                    this._stats.total++; cumNet += ret;
                    if (ret > 0) { this._stats.wins++; sumW += ret; } else { this._stats.losses++; sumL += Math.abs(ret); }
                }
                pos = -1; entryPx = sourceData[i].close;
            }

            this._data[i] = { time: sourceData[i].time, value: mVal, values: [ex[i], mVal, eff] };
            lPrev = lStop;
            sPrev = sStop;
        }

        this._stats.netPct = cumNet;
        this._stats.pf = sumL > 1e-9 ? (sumW / sumL) : (sumW > 0 ? 9.99 : 0);
        if (n > 0) {
            this._data[n - 1].values = [
                this._exMov[n - 1], this._most[n - 1], this._effDir[n - 1],
                this._stats.total, this._stats.pf, this._stats.netPct,
            ];
        }
    }

    getRange(): IndicatorRange {
        if (this._sourceData.length === 0) return { min: 0, max: 100 };
        let min = Infinity, max = -Infinity;
        for (const bar of this._sourceData) {
            if (bar.low < min) min = bar.low;
            if (bar.high > max) max = bar.high;
        }
        return min === Infinity ? { min: 0, max: 100 } : { min, max };
    }

    getLegendInfo(index?: number | null): IndicatorLegendInfo {
        const i = legendBarIndex(this._data.length, index);
        const c = this._cfg;
        const hasVal = (v: number) => i >= 0 && Number.isFinite(v);
        return {
            title: 'MOST',
            params: legendParams(c.maType, c.length, c.bandMode === 'atr' ? `${c.atrMult}xATR` : `%${c.percent}`),
            plots: [
                { color: c.exMovColor, value: hasVal(this._exMov[i]) ? this._exMov[i] : null },
                { color: c.mostColor, value: hasVal(this._most[i]) ? this._most[i] : null },
            ],
            precision: this._options.precision,
        };
    }

    getDescription(index?: number): string {
        const n = this._sourceData.length;
        if (n === 0) return 'MOST';
        const i = (index !== undefined && index >= 0 && index < n) ? index : n - 1;
        const bTxt = this._cfg.bandMode === 'atr' ? `${this._cfg.atrMult}xATR` : `%${this._cfg.percent}`;
        const dTxt = this._effDir[i] === 1 ? t('BUY') : (this._effDir[i] === -1 ? t('SELL') : t('SIDEWAYS'));
        return `MOST(${this._cfg.maType},${this._cfg.length},${bTxt}) | ${dTxt} | ExMov:${this._fmtPx(this._exMov[i])} MOST:${this._fmtPx(this._most[i])}`;
    }

    private _fmtPx(px: number): string {
        if (isNaN(px)) return '-';
        if (Math.abs(px) >= 100) return px.toFixed(2);
        if (Math.abs(px) >= 10) return px.toFixed(3);
        return px.toFixed(4);
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: TimeScale, priceScale: PriceScale, hpr: number, vpr: number): void {
        const n = this._sourceData.length;
        if (n < 2) return;
        const cw = ctx.canvas.width;
        const isDark = this.isDark;
        const lw = (this._cfg.lineWidth || 2) * hpr;

        // Visible bar range
        const pts: Array<{ i: number; x: number; yEx: number; yMo: number; dir: number }> = [];
        for (let i = 0; i < n; i++) {
            const rx = timeScale.indexToCoordinate(i as any);
            if (rx === null) continue;
            const x = rx * hpr;
            if (x < -40) continue;
            if (x > cw + 40) break;
            const ryE = priceScale.priceToCoordinate(this._exMov[i]);
            const ryM = priceScale.priceToCoordinate(this._most[i]);
            if (ryE === null || ryM === null) continue;
            pts.push({ i, x, yEx: ryE * vpr, yMo: ryM * vpr, dir: this._effDir[i] });
        }
        if (pts.length < 2) return;

        // 1) Trend Fill between ExMov and MOST
        if (this._cfg.showFill) {
            ctx.save();
            for (let k = 1; k < pts.length; k++) {
                const a = pts[k - 1], b = pts[k];
                const col = b.dir === 1 ? this._hexAlpha(this._cfg.bullFillColor, 0.14)
                    : (b.dir === -1 ? this._hexAlpha(this._cfg.bearFillColor, 0.14) : 'rgba(148, 163, 184, 0.10)');
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.moveTo(a.x, a.yEx);
                ctx.lineTo(b.x, b.yEx);
                ctx.lineTo(b.x, b.yMo);
                ctx.lineTo(a.x, a.yMo);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
        }

        // 2) ExMov Line
        ctx.save();
        ctx.strokeStyle = this._cfg.exMovColor;
        ctx.lineWidth = lw;
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].yEx);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].yEx);
        ctx.stroke();

        // 3) MOST Stop Line
        ctx.strokeStyle = this._cfg.mostColor;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].yMo);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].yMo);
        ctx.stroke();
        ctx.restore();

        // 4) AL / SAT Signal Badges
        if (this._cfg.showSignals) {
            ctx.save();
            for (const sig of this._signals) {
                const rx = timeScale.indexToCoordinate(sig.bar as any);
                if (rx === null) continue;
                const x = rx * hpr;
                if (x < -40 || x > cw + 40) continue;
                const bar = this._sourceData[sig.bar];
                const isBuy = sig.dir === 1;
                const ry = priceScale.priceToCoordinate(isBuy ? bar.low : bar.high);
                if (ry === null) continue;
                const y = ry * vpr + (isBuy ? 16 : -16) * vpr;
                const bg = isBuy ? '#16a34a' : '#dc2626';
                const txt = isBuy ? t('BUY') : t('SELL');

                ctx.font = `bold ${9.5 * hpr}px sans-serif`;
                const tw = ctx.measureText(txt).width;
                const bw = tw + 10 * hpr, bh = 15 * vpr;
                ctx.fillStyle = bg;
                this._roundRect(ctx, x - bw / 2, y - bh / 2, bw, bh, 3 * hpr);
                ctx.fill();

                // Pointer triangle
                ctx.beginPath();
                if (isBuy) {
                    ctx.moveTo(x, y - bh / 2 - 4 * vpr);
                    ctx.lineTo(x - 4 * hpr, y - bh / 2);
                    ctx.lineTo(x + 4 * hpr, y - bh / 2);
                } else {
                    ctx.moveTo(x, y + bh / 2 + 4 * vpr);
                    ctx.lineTo(x - 4 * hpr, y + bh / 2);
                    ctx.lineTo(x + 4 * hpr, y + bh / 2);
                }
                ctx.closePath(); ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(txt, x, y);
            }
            ctx.restore();
        }

        // 5) Compact Top-Right HUD (positioned below Master HUD if stacked, or top-left cleanly!)
        if (this._cfg.showHud && cw > 220) {
            const last = n - 1;
            const bTxt = this._cfg.bandMode === 'atr' ? `${this._cfg.atrMult}xATR` : `%${this._cfg.percent}`;
            const dTxt = this._effDir[last] === 1 ? t('UPTREND (BUY)') : (this._effDir[last] === -1 ? t('DOWNTREND (SELL)') : t('SIDEWAYS (FLAT)'));
            const dCol = this._effDir[last] === 1 ? this._cfg.exMovColor : (this._effDir[last] === -1 ? this._cfg.mostColor : '#94a3b8');
            const wr = this._stats.total > 0 ? ((this._stats.wins / this._stats.total) * 100).toFixed(1) : '0.0';
            const lines = [
                `MOST (${this._cfg.maType}, ${Math.round(this._cfg.length)}, ${bTxt}) -> ${dTxt}`,
                `ExMov: ${this._fmtPx(this._exMov[last])} | MOST: ${this._fmtPx(this._most[last])}`,
                `Flip: ${this._stats.total} Tr | WR:${wr}% | PF:${this._stats.pf.toFixed(2)} | 1x Net:${this._stats.netPct >= 0 ? '+' : ''}${this._stats.netPct.toFixed(1)}%`,
            ];
            ctx.save();
            ctx.font = `bold ${10 * hpr}px sans-serif`;
            let maxW = 0;
            for (const ln of lines) maxW = Math.max(maxW, ctx.measureText(ln).width);
            const boxW = maxW + 18 * hpr, lineH = 14.5 * vpr, boxH = lines.length * lineH + 12 * vpr;
            const bx = cw - boxW - 18 * hpr, by = 104 * vpr;
            ctx.fillStyle = isDark ? 'rgba(12, 18, 30, 0.90)' : 'rgba(255, 255, 255, 0.94)';
            this._roundRect(ctx, bx, by, boxW, boxH, 6 * hpr); ctx.fill();
            ctx.strokeStyle = dCol; ctx.lineWidth = 1.2 * hpr; ctx.stroke();
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            for (let k = 0; k < lines.length; k++) {
                ctx.fillStyle = k === 0 ? dCol : (isDark ? '#e5e7eb' : '#111827');
                ctx.fillText(lines[k], bx + 9 * hpr, by + 6 * vpr + k * lineH);
            }
            ctx.restore();
        }
    }

    private _hexAlpha(hex: string, alpha: number): string {
        if (!hex || !hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) return `rgba(34, 197, 94, ${alpha})`;
        let r = 34, g = 197, b = 94;
        if (hex.length === 7) { r = parseInt(hex.slice(1, 3), 16); g = parseInt(hex.slice(3, 5), 16); b = parseInt(hex.slice(5, 7), 16); }
        else { r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16); }
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    private _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
        ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    }
}
