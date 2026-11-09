// Equal Highs / Equal Lows V2 (likidite seviyeleri). Tespit backend'de hesaplanır
// (bkz. remote-compute.ts); burada yalnızca çizilir.

import { OverlayIndicator } from './indicator';
import { BarData } from '../model/data';
import { RemoteCompute, RemoteContext, barIndexAtTime, drawAccessNotice } from './remote-compute';
import { canvasSans } from '../helpers/fonts';

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
    confirmBars: number;
    confirmCloseInside: boolean;
    confirmCandleType: 'regular' | 'heikin_ashi';
    showConfirmation: boolean;
    hideUnconfirmed: boolean;
    showLabels: boolean;
    eqhColor: string;
    eqlColor: string;
    confirmColor: string;
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
    confirmBars: 3,
    confirmCloseInside: false,
    confirmCandleType: 'regular',
    showConfirmation: true,
    hideUnconfirmed: false,
    showLabels: true,
    eqhColor: '#ef5350',
    eqlColor: '#26a69a',
    confirmColor: '#ffca28',
    sweptOpacity: 35,
    lineWidth: 1,
    visible: true,
};

// Sunucuya giden ayarlar (renk/etiket ayarları yerelde kalır).
const ALGO_KEYS = [
    'pivotBars', 'atrLength', 'useAcademicGamma', 'toleranceMult', 'gammaToleranceMult',
    'strictSideRatio', 'safeSideRatio', 'minGapBars', 'maxLookbackBars', 'hideSwept',
    'confirmBars', 'confirmCloseInside', 'confirmCandleType',
] as const;

type ConfirmStatus = 'confirmed' | 'failed' | 'pending' | null;

interface EqLevel {
    type: 'high' | 'low';
    price: number;
    firstBar: number;
    lastBar: number;
    touches: number;
    swept: boolean;
    sweptBar: number | null;
    confirmStatus: ConfirmStatus;
    confirmBar: number | null;
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
        confirm_status?: ConfirmStatus;
        confirm_time?: number | null;
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

    /** Otomatik ayar listesi metin seçeneklerini üretmez: onay mum tipi seçimi buraya eklenir. */
    getSettingsConfig(): any {
        const cfg = super.getSettingsConfig();
        const rows: any[] | undefined = cfg?.tabs?.[0]?.sections?.[0]?.rows;
        if (rows) {
            const row = {
                type: 'select', key: 'confirmCandleType', label: 'Confirm Candle Type', defaultValue: 'regular',
                options: [{ value: 'regular', label: 'Normal' }, { value: 'heikin_ashi', label: 'Heikin Ashi' }],
            };
            const at = rows.findIndex(r => r.key === 'confirmCloseInside');
            rows.splice(at >= 0 ? at + 1 : rows.length, 0, row);
        }
        return cfg;
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
            // Eski sunucu: alanlar yok -> onay bilgisi yok (null) olarak ele alınır.
            let confirmStatus: ConfirmStatus = r.confirm_status ?? null;
            let confirmBar: number | null = null;
            if (r.confirm_time !== null && r.confirm_time !== undefined) {
                const cb = barIndexAtTime(bars, r.confirm_time);
                if (cb >= 0) confirmBar = cb;
                else confirmStatus = null;
            }
            this._levels.push({ type: r.type, price: r.price, firstBar, lastBar, touches: r.touches, swept: r.swept, sweptBar, confirmStatus, confirmBar });
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
        const conf = this._levels.filter(l => l.confirmStatus === 'confirmed').length;
        const failed = this._levels.filter(l => l.confirmStatus === 'failed').length;
        const haText = this._eOptions.confirmCandleType === 'heikin_ashi' ? ', HA' : '';
        const confText = this._eOptions.showConfirmation && (conf > 0 || failed > 0) ? `, ${conf} onayli, ${failed} kirildi` : '';
        return `EQH/EQL V2: ${active} aktif, ${swept} supurulmus${confText} (${method}${haText})`;
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
            if (lvl.confirmStatus === 'failed' && this._eOptions.hideUnconfirmed) continue;

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

            const showConf = this._eOptions.showConfirmation;
            if (showConf && lvl.confirmStatus === 'confirmed' && lvl.confirmBar !== null) {
                // Ters yönde onay: EQH -> aşağı, EQL -> yukarı bakan küçük üçgen (seviyenin dışında, uca doğru).
                const cx = timeScale.indexToCoordinate(lvl.confirmBar as any) * hpr;
                const w = 4.5 * hpr;
                const h = 6 * hpr;
                const gap = 3 * hpr;
                const down = lvl.type === 'high';
                const baseY = down ? y - gap - h : y + gap + h;
                const tipY = down ? y - gap : y + gap;
                ctx.fillStyle = rgbaFrom(this._eOptions.confirmColor, 0.95);
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(cx - w, baseY);
                ctx.lineTo(cx + w, baseY);
                ctx.lineTo(cx, tipY);
                ctx.closePath();
                ctx.fill();
            }

            if (this._eOptions.showLabels) {
                let suffix = lvl.swept ? ' (supuruldu)' : '';
                if (showConf && lvl.swept) {
                    if (lvl.confirmStatus === 'confirmed') suffix = ' (süpürüldü ✓)';
                    else if (lvl.confirmStatus === 'failed') suffix = ' (kırıldı)';
                    else if (lvl.confirmStatus === 'pending') suffix = ' (bekliyor)';
                }
                const label = `${lvl.type === 'high' ? 'EQH' : 'EQL'}${lvl.touches > 2 ? ' x' + lvl.touches : ''}${suffix}`;
                ctx.font = `${10 * hpr}px ${canvasSans()}`;
                ctx.textAlign = 'left';
                const stateLabel = showConf && lvl.swept && lvl.confirmStatus !== null;
                if (stateLabel) {
                    // Onay durumu etiketi: tam opaklıkta metin + tema uyumlu yarı saydam zemin; çizgi sweptOpacity'de kalır.
                    // Onaylıda üçgenin sağına, çizginin dışına (EQH üstte, EQL altta) yerleştirilir.
                    let lx = x2 + 4 * hpr;
                    if (lvl.confirmStatus === 'confirmed' && lvl.confirmBar !== null) {
                        const cx = timeScale.indexToCoordinate(lvl.confirmBar as any) * hpr;
                        lx = Math.max(lx, cx + 4.5 * hpr + 4 * hpr);
                    }
                    const above = lvl.type === 'high';
                    const tw = ctx.measureText(label).width;
                    const th = 12 * hpr;
                    const padX = 4 * hpr;
                    const ly = above ? y - 4 * hpr - th : y + 4 * hpr;
                    ctx.fillStyle = this.isDark ? 'rgba(19, 23, 34, 0.85)' : 'rgba(255, 255, 255, 0.85)';
                    ctx.beginPath();
                    const rr = 3 * hpr;
                    const rx = lx - padX, rw = tw + 2 * padX;
                    ctx.moveTo(rx + rr, ly);
                    ctx.arcTo(rx + rw, ly, rx + rw, ly + th, rr);
                    ctx.arcTo(rx + rw, ly + th, rx, ly + th, rr);
                    ctx.arcTo(rx, ly + th, rx, ly, rr);
                    ctx.arcTo(rx, ly, rx + rw, ly, rr);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = rgbaFrom(color, 1);
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, lx, ly + th / 2);
                } else {
                    ctx.fillStyle = rgbaFrom(color, Math.min(1, alpha + 0.15));
                    ctx.textBaseline = lvl.type === 'high' ? 'bottom' : 'top';
                    ctx.fillText(label, x2 + 4 * hpr, y);
                }
            }
        }
        ctx.restore();
    }
}
