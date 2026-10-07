// ICT Judas Swing: seans açılışında referans aralığın dışına sahte kırılım yapıp
// likidite topladıktan sonra displacement ile ters yöne dönme paterni.
// Tespit backend'de hesaplanır (bkz. remote-compute.ts); burada yalnızca çizilir.

import { OverlayIndicator } from './indicator';
import { BarData } from '../model/data';
import { RemoteCompute, RemoteContext, barIndexAtTime, drawAccessNotice } from './remote-compute';

export interface JudasSwingIndicatorOptions {
    name: string;
    timezone: string;
    refStartH: number;
    refEndH: number;
    maxConfirmBars: number;
    requireFvg: boolean;
    requireRetest: boolean;
    maxRetestBars: number;
    requireMss: boolean;
    mssLookbackBars: number;
    mssPivotBars: number;
    enforceMssCutoff: boolean;
    mssCutoffH: number;
    requirePremiumDiscount: boolean;
    drawLastNDays: number;
    showRefRange: boolean;
    showMssLevel: boolean;
    showFvgBox: boolean;
    showTargets: boolean;
    showFailed: boolean;
    showLabels: boolean;
    bullColor: string;
    bearColor: string;
    refRangeColor: string;
    fvgColor: string;
    failedColor: string;
    lineWidth: number;
    visible: boolean;
}

const defaultJudasOptions: JudasSwingIndicatorOptions = {
    name: 'Judas Swing',
    timezone: 'America/New_York',
    refStartH: 20,
    refEndH: 0,
    maxConfirmBars: 60,
    requireFvg: true,
    requireRetest: true,
    maxRetestBars: 40,
    requireMss: true,
    mssLookbackBars: 10,
    mssPivotBars: 2,
    enforceMssCutoff: false,
    mssCutoffH: 5,
    requirePremiumDiscount: true,
    drawLastNDays: 15,
    showRefRange: true,
    showMssLevel: true,
    showFvgBox: true,
    showTargets: true,
    showFailed: false,
    showLabels: true,
    bullColor: '#26a69a',
    bearColor: '#ef5350',
    refRangeColor: '#787b86',
    fvgColor: '#ab47bc',
    failedColor: '#787b86',
    lineWidth: 2,
    visible: true,
};

// Sunucuya giden ayarlar (renk/etiket ayarları yerelde kalır). Son ikisi çizim filtresidir:
// yanıtı küçültmek için sunucuda da uygulanır.
const ALGO_KEYS = [
    'timezone', 'refStartH', 'refEndH', 'maxConfirmBars', 'requireFvg', 'requireRetest', 'maxRetestBars',
    'requireMss', 'mssLookbackBars', 'mssPivotBars', 'enforceMssCutoff', 'mssCutoffH', 'requirePremiumDiscount',
    'drawLastNDays', 'showFailed',
] as const;

interface RefRange {
    startIdx: number;
    endIdx: number;
    high: number;
    low: number;
}

interface JudasOcc {
    ref: RefRange;
    sweepDir: 'high' | 'low';
    sweepBar: number;
    sweepPrice: number;
    state: 'swept' | 'displaced' | 'confirmed' | 'failed';
    confirmBar: number | null;
    confirmPrice: number | null;
    targetPrice: number;
    resolvedBar: number;
    fvgTop: number | null;
    fvgBottom: number | null;
    fvgLeftBar: number | null;
    mssLevel: number;
}

interface RemoteJudas {
    occurrences: Array<{
        ref_start_time: number;
        ref_end_time: number;
        ref_high: number;
        ref_low: number;
        sweep_dir: 'high' | 'low';
        sweep_time: number;
        sweep_price: number;
        state: JudasOcc['state'];
        confirm_time: number | null;
        confirm_price: number | null;
        target_price: number;
        resolved_time: number;
        fvg_top: number | null;
        fvg_bottom: number | null;
        fvg_left_time: number | null;
        mss_level: number;
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

export class JudasSwingIndicator extends OverlayIndicator {
    private _jOptions: JudasSwingIndicatorOptions;
    private _occs: JudasOcc[] = [];
    private _raw: RemoteJudas | null = null;
    private readonly _remote = new RemoteCompute<RemoteJudas>('judas-swing', (raw) => {
        this._raw = raw;
        this._rebuild();
    });

    constructor(options: Partial<JudasSwingIndicatorOptions> = {}) {
        const merged = { ...defaultJudasOptions, ...options };
        super(merged);
        this._jOptions = { ...defaultJudasOptions, ...this._options } as JudasSwingIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._jOptions };
    }

    setContext(ctx: RemoteContext): void {
        this._remote.setContext(ctx);
    }

    setSettingValue(key: string, value: any): boolean {
        (this._jOptions as any)[key] = value;
        (this._options as any)[key] = value;
        if (this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
        return true;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        const params: Record<string, unknown> = {};
        for (const key of ALGO_KEYS) params[key] = this._jOptions[key];
        this._remote.request(params, () => this._dataChanged.fire());
        this._rebuild();
    }

    /** Ham (zaman damgalı) sonucu mevcut mum dizisinin index'lerine çevirir. */
    private _rebuild(): void {
        const bars = this._sourceData;
        this._data = bars.map(b => ({ time: b.time, value: NaN }));
        this._occs = [];
        if (!this._raw || bars.length === 0) return;

        const idx = (t: number | null) => (t === null ? null : barIndexAtTime(bars, t));
        for (const r of this._raw.occurrences) {
            const startIdx = barIndexAtTime(bars, r.ref_start_time);
            const endIdx = barIndexAtTime(bars, r.ref_end_time);
            const sweepBar = barIndexAtTime(bars, r.sweep_time);
            const resolvedBar = barIndexAtTime(bars, r.resolved_time);
            const confirmBar = idx(r.confirm_time);
            const fvgLeftBar = idx(r.fvg_left_time);
            if (startIdx < 0 || endIdx < 0 || sweepBar < 0 || resolvedBar < 0 || confirmBar === -1 || fvgLeftBar === -1) continue;
            this._occs.push({
                ref: { startIdx, endIdx, high: r.ref_high, low: r.ref_low },
                sweepDir: r.sweep_dir, sweepBar, sweepPrice: r.sweep_price, state: r.state,
                confirmBar, confirmPrice: r.confirm_price, targetPrice: r.target_price, resolvedBar,
                fvgTop: r.fvg_top, fvgBottom: r.fvg_bottom, fvgLeftBar, mssLevel: r.mss_level,
            });
        }
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
        const confirmed = this._occs.filter(o => o.state === 'confirmed').length;
        const failed = this._occs.filter(o => o.state === 'failed').length;
        return `Judas Swing: ${confirmed} onaylanmis, ${failed} basarisiz`;
    }

    private _cutoffTime(): number {
        const src = this._sourceData;
        return src[src.length - 1].time - this._jOptions.drawLastNDays * 86400000;
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        if (this._remote.denied !== null) {
            drawAccessNotice(ctx, hpr, vpr, this._remote, this._jOptions.name);
            return;
        }
        if (this._occs.length === 0 || this._sourceData.length === 0) return;
        const o = this._jOptions;
        const src = this._sourceData;
        const lastBar = src.length - 1;
        const cutoff = this._cutoffTime();

        ctx.save();
        for (const occ of this._occs) {
            if (src[occ.ref.startIdx].time < cutoff) continue;
            if (occ.state === 'failed' && !o.showFailed) continue;

            const isBull = occ.sweepDir === 'low'; // süpürülen taraf low ise gerçek yön yukarı (bullish judas)
            const color = occ.state === 'failed' ? o.failedColor : (isBull ? o.bullColor : o.bearColor);
            const endBar = occ.state === 'confirmed' && occ.confirmBar !== null ? occ.confirmBar : occ.resolvedBar;

            if (o.showRefRange) {
                const x1 = timeScale.indexToCoordinate(occ.ref.startIdx as any) * hpr;
                const x2 = timeScale.indexToCoordinate(occ.ref.endIdx as any) * hpr;
                const yTop = priceScale.priceToCoordinate(occ.ref.high) * vpr;
                const yBot = priceScale.priceToCoordinate(occ.ref.low) * vpr;
                ctx.strokeStyle = rgbaFrom(o.refRangeColor, 0.5);
                ctx.setLineDash([3 * hpr, 3 * hpr]);
                ctx.lineWidth = 1 * hpr;
                ctx.strokeRect(x1, Math.min(yTop, yBot), x2 - x1, Math.abs(yBot - yTop));

                const lvlEndX = timeScale.indexToCoordinate(Math.max(occ.ref.endIdx, endBar) as any) * hpr;
                ctx.beginPath();
                ctx.moveTo(x2, yTop);
                ctx.lineTo(lvlEndX, yTop);
                ctx.moveTo(x2, yBot);
                ctx.lineTo(lvlEndX, yBot);
                ctx.stroke();
            }

            if (o.showMssLevel && o.requireMss) {
                const mx1 = timeScale.indexToCoordinate(occ.sweepBar as any) * hpr;
                const mx2 = timeScale.indexToCoordinate(Math.max(occ.sweepBar + 1, endBar) as any) * hpr;
                const my = priceScale.priceToCoordinate(occ.mssLevel) * vpr;
                ctx.setLineDash([2 * hpr, 2 * hpr]);
                ctx.strokeStyle = rgbaFrom(color, occ.state === 'failed' ? 0.3 : 0.7);
                ctx.lineWidth = 1 * hpr;
                ctx.beginPath();
                ctx.moveTo(mx1, my);
                ctx.lineTo(mx2, my);
                ctx.stroke();
                if (o.showLabels) {
                    ctx.font = `${8 * hpr}px sans-serif`;
                    ctx.fillStyle = rgbaFrom(color, 0.8);
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('MSS', mx2 + 3 * hpr, my);
                }
            }

            const sx = timeScale.indexToCoordinate(occ.sweepBar as any) * hpr;
            const sy = priceScale.priceToCoordinate(occ.sweepPrice) * vpr;
            const r = 4 * hpr;
            ctx.setLineDash([]);
            ctx.strokeStyle = rgbaFrom(color, occ.state === 'failed' ? 0.4 : 0.9);
            ctx.lineWidth = 1.5 * hpr;
            ctx.beginPath();
            ctx.moveTo(sx - r, sy - r); ctx.lineTo(sx + r, sy + r);
            ctx.moveTo(sx - r, sy + r); ctx.lineTo(sx + r, sy - r);
            ctx.stroke();

            if (o.showFvgBox && occ.fvgTop !== null && occ.fvgBottom !== null && occ.fvgLeftBar !== null) {
                // Retest bekleyen (displaced) veya onaylanmış (confirmed) her olay için FVG kutusu:
                // retest gelene kadar (ya da şimdiki muma kadar) sağda uzar.
                const fEnd = occ.confirmBar !== null ? occ.confirmBar : lastBar;
                const fx1 = timeScale.indexToCoordinate(occ.fvgLeftBar as any) * hpr;
                const fx2 = timeScale.indexToCoordinate(Math.max(occ.fvgLeftBar + 2, fEnd) as any) * hpr;
                const fyTop = priceScale.priceToCoordinate(occ.fvgTop) * vpr;
                const fyBot = priceScale.priceToCoordinate(occ.fvgBottom) * vpr;
                const fAlpha = occ.state === 'failed' ? 0.4 : 1;
                ctx.setLineDash([]);
                ctx.fillStyle = rgbaFrom(o.fvgColor, 0.15 * fAlpha);
                ctx.fillRect(fx1, Math.min(fyTop, fyBot), fx2 - fx1, Math.abs(fyBot - fyTop));
                ctx.strokeStyle = rgbaFrom(o.fvgColor, 0.6 * fAlpha);
                ctx.lineWidth = 1 * hpr;
                ctx.strokeRect(fx1, Math.min(fyTop, fyBot), fx2 - fx1, Math.abs(fyBot - fyTop));
                if (o.showLabels) {
                    ctx.font = `${9 * hpr}px sans-serif`;
                    ctx.fillStyle = rgbaFrom(o.fvgColor, 0.9 * fAlpha);
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('FVG', fx1 + 3 * hpr, (fyTop + fyBot) / 2);
                }
            }

            if (occ.state === 'confirmed' && occ.confirmBar !== null) {
                const cx = timeScale.indexToCoordinate(occ.confirmBar as any) * hpr;
                const cy = priceScale.priceToCoordinate(occ.confirmPrice as number) * vpr;

                const ah = 8 * vpr;
                ctx.fillStyle = rgbaFrom(color, 0.95);
                ctx.beginPath();
                if (isBull) {
                    ctx.moveTo(cx, cy - ah); ctx.lineTo(cx - ah * 0.6, cy + ah * 0.3); ctx.lineTo(cx + ah * 0.6, cy + ah * 0.3);
                } else {
                    ctx.moveTo(cx, cy + ah); ctx.lineTo(cx - ah * 0.6, cy - ah * 0.3); ctx.lineTo(cx + ah * 0.6, cy - ah * 0.3);
                }
                ctx.closePath();
                ctx.fill();

                if (o.showLabels) {
                    ctx.font = `bold ${10 * hpr}px sans-serif`;
                    ctx.fillStyle = rgbaFrom(color, 0.95);
                    ctx.textAlign = 'left';
                    ctx.textBaseline = isBull ? 'bottom' : 'top';
                    ctx.fillText(isBull ? 'JUDAS ▲' : 'JUDAS ▼', cx + 6 * hpr, cy);
                }

                if (o.showTargets) {
                    const tx2 = timeScale.indexToCoordinate(lastBar as any) * hpr;
                    const ty = priceScale.priceToCoordinate(occ.targetPrice) * vpr;
                    ctx.setLineDash([2 * hpr, 4 * hpr]);
                    ctx.strokeStyle = rgbaFrom(color, 0.5);
                    ctx.lineWidth = 1 * hpr;
                    ctx.beginPath();
                    ctx.moveTo(cx, ty);
                    ctx.lineTo(tx2, ty);
                    ctx.stroke();

                    const stopY = priceScale.priceToCoordinate(occ.sweepPrice) * vpr;
                    ctx.strokeStyle = rgbaFrom(color, 0.3);
                    ctx.beginPath();
                    ctx.moveTo(cx, stopY);
                    ctx.lineTo(tx2, stopY);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }
}
