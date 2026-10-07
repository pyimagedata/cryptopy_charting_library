// Equal Highs / Equal Lows V2 (likidite seviyeleri). Tespit backend'de hesaplanır
// (bkz. remote-compute.ts); burada yalnızca çizilir.

import { OverlayIndicator } from './indicator';
import { BarData } from '../model/data';
import { RemoteCompute, RemoteContext, barIndexAtTime, drawAccessNotice } from './remote-compute';

export interface EqHLIndicatorV2Options {
    name: string;
    pivotBars: number;
    atrLength: number;
    useAcademicGamma: boolean;
    toleranceMult: number;
    gammaToleranceMult: number;
    strictSideRatio: number;
    safeSideRatio: number;
    minGapBars: number;
    maxLookbackBars: number;
    hideSwept: boolean;
    showLabels: boolean;
    eqhColor: string;
    eqlColor: string;
    sweptOpacity: number;
    lineWidth: number;
    visible: boolean;
}

const defaultEqHLOptions: EqHLIndicatorV2Options = {
    name: 'Equal Highs/Lows V2',
    pivotBars: 5,
    atrLength: 14,
    useAcademicGamma: false,
    toleranceMult: 0.4,
    gammaToleranceMult: 1.0,
    strictSideRatio: 0.25,
    safeSideRatio: 0.5,
    minGapBars: 5,
    maxLookbackBars: 50,
    hideSwept: false,
    showLabels: true,
    eqhColor: '#ef5350',
    eqlColor: '#26a69a',
    sweptOpacity: 35,
    lineWidth: 1,
    visible: true,
};

// Sunucuya giden ayarlar (renk/etiket ayarları yerelde kalır).
const ALGO_KEYS = [
    'pivotBars', 'atrLength', 'useAcademicGamma', 'toleranceMult', 'gammaToleranceMult',
    'strictSideRatio', 'safeSideRatio', 'minGapBars', 'maxLookbackBars', 'hideSwept',
] as const;

interface EqLevel {
    type: 'high' | 'low';
    price: number;
    firstBar: number;
    lastBar: number;
    touches: number;
    swept: boolean;
    sweptBar: number | null;
}

interface RemoteEqHL {
    levels: Array<{
        type: 'high' | 'low';
        price: number;
        first_time: number;
        last_time: number;
        touches: number;
        swept: boolean;
        swept_time: number | null;
    }>;
}

function rgbaFrom(color: string, alpha: number): string {
    const hex = color.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return color;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export class EqHLIndicatorV2 extends OverlayIndicator {
    private _eOptions: EqHLIndicatorV2Options;
    private _levels: EqLevel[] = [];
    private _raw: RemoteEqHL | null = null;
    private readonly _remote = new RemoteCompute<RemoteEqHL>('eqhl-v2', (raw) => {
        this._raw = raw;
        this._rebuild();
    });

    constructor(options: Partial<EqHLIndicatorV2Options> = {}) {
        const merged = { ...defaultEqHLOptions, ...options };
        super(merged);
        this._eOptions = { ...defaultEqHLOptions, ...this._options } as EqHLIndicatorV2Options;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._eOptions };
    }

    setContext(ctx: RemoteContext): void {
        this._remote.setContext(ctx);
    }

    setSettingValue(key: string, value: any): boolean {
        (this._eOptions as any)[key] = value;
        (this._options as any)[key] = value;
        if (this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
        return true;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        const params: Record<string, unknown> = {};
        for (const key of ALGO_KEYS) params[key] = this._eOptions[key];
        this._remote.request(params, () => this._dataChanged.fire());
        this._rebuild();
    }

    /** Ham (zaman damgalı) sonucu mevcut mum dizisinin index'lerine çevirir. */
    private _rebuild(): void {
        const bars = this._sourceData;
        this._data = [];
        this._levels = [];
        if (!this._raw || bars.length === 0) return;

        for (const r of this._raw.levels) {
            const firstBar = barIndexAtTime(bars, r.first_time);
            const lastBar = barIndexAtTime(bars, r.last_time);
            const sweptBar = r.swept_time === null ? null : barIndexAtTime(bars, r.swept_time);
            if (firstBar < 0 || lastBar < 0 || sweptBar === -1) continue;
            this._levels.push({ type: r.type, price: r.price, firstBar, lastBar, touches: r.touches, swept: r.swept, sweptBar });
        }

        const byBar: Record<number, EqLevel[]> = {};
        for (const lvl of this._levels) {
            (byBar[lvl.lastBar] = byBar[lvl.lastBar] || []).push(lvl);
        }
        this._data = bars.map((bar, i) => {
            const arr = byBar[i];
            return arr && arr.length > 0
                ? { time: bar.time, value: arr[0].price, values: arr.map(l => l.price) }
                : { time: bar.time, value: NaN, values: [] };
        });
    }

    destroy(): void {
        this._remote.destroy();
        super.destroy();
    }

    getRange(): { min: number; max: number } {
        if (this._sourceData.length === 0) return { min: 0, max: 100 };
        let min = Infinity, max = -Infinity;
        for (const bar of this._sourceData) {
            if (bar.low < min) min = bar.low;
            if (bar.high > max) max = bar.high;
        }
        return { min, max };
    }

    getDescription(): string {
        const active = this._levels.filter(l => !l.swept).length;
        const swept = this._levels.filter(l => l.swept).length;
        const method = this._eOptions.useAcademicGamma
            ? `gamma x${this._eOptions.gammaToleranceMult.toFixed(2)}`
            : `ATR x${this._eOptions.toleranceMult.toFixed(2)}`;
        return `EQH/EQL V2: ${active} aktif, ${swept} supurulmus (${method})`;
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        if (this._remote.denied !== null) {
            drawAccessNotice(ctx, hpr, vpr, this._remote, this._eOptions.name);
            return;
        }
        if (this._levels.length === 0 || this._sourceData.length === 0) return;

        const lastBar = this._sourceData.length - 1;
        ctx.save();
        for (const lvl of this._levels) {
            if (lvl.touches < 2) continue;
            if (lvl.swept && this._eOptions.hideSwept) continue;

            const color = lvl.type === 'high' ? this._eOptions.eqhColor : this._eOptions.eqlColor;
            const endBar = lvl.swept && lvl.sweptBar !== null ? lvl.sweptBar : lastBar;
            const x1 = timeScale.indexToCoordinate(lvl.firstBar as any) * hpr;
            const x2 = timeScale.indexToCoordinate(endBar as any) * hpr;
            const y = priceScale.priceToCoordinate(lvl.price) * vpr;

            const alpha = lvl.swept ? this._eOptions.sweptOpacity / 100 : 0.9;
            ctx.strokeStyle = rgbaFrom(color, alpha);
            ctx.lineWidth = this._eOptions.lineWidth * hpr;
            ctx.setLineDash(lvl.swept ? [4 * hpr, 3 * hpr] : []);
            ctx.beginPath();
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
            ctx.stroke();

            if (lvl.swept && lvl.sweptBar !== null) {
                const sx = timeScale.indexToCoordinate(lvl.sweptBar as any) * hpr;
                const sy = y;
                const r = 4 * hpr;
                ctx.strokeStyle = rgbaFrom(color, 0.9);
                ctx.lineWidth = 1.5 * hpr;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(sx - r, sy - r); ctx.lineTo(sx + r, sy + r);
                ctx.moveTo(sx - r, sy + r); ctx.lineTo(sx + r, sy - r);
                ctx.stroke();
            }

            if (this._eOptions.showLabels) {
                const label = `${lvl.type === 'high' ? 'EQH' : 'EQL'}${lvl.touches > 2 ? ' x' + lvl.touches : ''}${lvl.swept ? ' (supuruldu)' : ''}`;
                ctx.font = `${10 * hpr}px sans-serif`;
                ctx.fillStyle = rgbaFrom(color, Math.min(1, alpha + 0.15));
                ctx.textAlign = 'left';
                ctx.textBaseline = lvl.type === 'high' ? 'bottom' : 'top';
                ctx.fillText(label, x2 + 4 * hpr, y);
            }
        }
        ctx.restore();
    }
}
