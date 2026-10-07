// Fair Value Gap Inversion (IFVG): bir FVG kendi yönünün tersine gövde kapanışıyla
// kırılırsa rolü tersine döner. Tespit backend'de hesaplanır (bkz. remote-compute.ts);
// burada yalnızca çizilir.

import { OverlayIndicator } from './indicator';
import { BarData } from '../model/data';
import { RemoteCompute, RemoteContext, barIndexAtTime, drawAccessNotice } from './remote-compute';

export interface FvgInversionIndicatorOptions {
    name: string;
    atrLength: number;
    minGapAtr: number;
    maxOpenBars: number;
    maxDisplayAgeBars: number;
    showOpenFvg: boolean;
    showFilled: boolean;
    showLabels: boolean;
    bullColor: string;
    bearColor: string;
    boxOpacity: number;
    filledOpacity: number;
    visible: boolean;
}

const defaultFvgOptions: FvgInversionIndicatorOptions = {
    name: 'FVG Inversion',
    atrLength: 14,
    minGapAtr: 0.1,
    maxOpenBars: 50,
    maxDisplayAgeBars: 300,
    showOpenFvg: false,
    showFilled: false,
    showLabels: true,
    bullColor: '#26a69a',
    bearColor: '#ef5350',
    boxOpacity: 28,
    filledOpacity: 10,
    visible: true,
};

// Sunucuya giden ayarlar (renk/etiket ayarları yerelde kalır). Son üçü çizim filtresidir:
// yanıtı küçültmek için sunucuda da uygulanır.
const ALGO_KEYS = ['atrLength', 'minGapAtr', 'maxOpenBars', 'maxDisplayAgeBars', 'showOpenFvg', 'showFilled'] as const;

type FvgState = 'open' | 'filled' | 'inverted' | 'invalidated' | 'expired';

interface FvgBox {
    type: 'bull' | 'bear';
    gapBottom: number;
    gapTop: number;
    firstBar: number;
    formBar: number;
    state: FvgState;
    endBar: number;
    invertedBar: number | null;
}

interface RemoteFvgInversion {
    boxes: Array<{
        type: 'bull' | 'bear';
        gap_bottom: number;
        gap_top: number;
        first_time: number;
        form_time: number;
        state: FvgState;
        end_time: number | null; // null: güncel muma kadar uzar (open / inverted)
        inverted_time: number | null;
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

export class FvgInversionIndicator extends OverlayIndicator {
    private _fOptions: FvgInversionIndicatorOptions;
    private _boxes: FvgBox[] = [];
    private _raw: RemoteFvgInversion | null = null;
    private readonly _remote = new RemoteCompute<RemoteFvgInversion>('fvg-inversion', (raw) => {
        this._raw = raw;
        this._rebuild();
    });

    constructor(options: Partial<FvgInversionIndicatorOptions> = {}) {
        const merged = { ...defaultFvgOptions, ...options };
        super(merged);
        this._fOptions = { ...defaultFvgOptions, ...this._options } as FvgInversionIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._fOptions };
    }

    setContext(ctx: RemoteContext): void {
        this._remote.setContext(ctx);
    }

    setSettingValue(key: string, value: any): boolean {
        (this._fOptions as any)[key] = value;
        (this._options as any)[key] = value;
        if (this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
        return true;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        const params: Record<string, unknown> = {};
        for (const key of ALGO_KEYS) params[key] = this._fOptions[key];
        this._remote.request(params, () => this._dataChanged.fire());
        this._rebuild();
    }

    /** Ham (zaman damgalı) sonucu mevcut mum dizisinin index'lerine çevirir. */
    private _rebuild(): void {
        const bars = this._sourceData;
        this._data = [];
        this._boxes = [];
        if (!this._raw || bars.length === 0) return;

        const last = bars.length - 1;
        for (const r of this._raw.boxes) {
            const firstBar = barIndexAtTime(bars, r.first_time);
            const formBar = barIndexAtTime(bars, r.form_time);
            const endBar = r.end_time === null ? last : barIndexAtTime(bars, r.end_time);
            const invertedBar = r.inverted_time === null ? null : barIndexAtTime(bars, r.inverted_time);
            if (firstBar < 0 || formBar < 0 || endBar < 0 || invertedBar === -1) continue;
            this._boxes.push({
                type: r.type, gapBottom: r.gap_bottom, gapTop: r.gap_top, firstBar, formBar,
                state: r.state, endBar, invertedBar,
            });
        }

        const byBar: Record<number, FvgBox[]> = {};
        for (const box of this._boxes) {
            (byBar[box.formBar] = byBar[box.formBar] || []).push(box);
        }
        this._data = bars.map((bar, i) => {
            const arr = byBar[i];
            return arr && arr.length > 0
                ? { time: bar.time, value: (arr[0].gapTop + arr[0].gapBottom) / 2, values: arr.map(b => (b.gapTop + b.gapBottom) / 2) }
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
        const open = this._boxes.filter(b => b.state === 'open').length;
        const inverted = this._boxes.filter(b => b.state === 'inverted').length;
        const filled = this._boxes.filter(b => b.state === 'filled').length;
        const invalidated = this._boxes.filter(b => b.state === 'invalidated').length;
        const expired = this._boxes.filter(b => b.state === 'expired').length;
        return `FVG Inversion: ${open} acik, ${inverted} donmus (IFVG), ${filled + invalidated + expired} gecersiz`;
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        if (this._remote.denied !== null) {
            drawAccessNotice(ctx, hpr, vpr, this._remote, this._fOptions.name);
            return;
        }
        if (this._boxes.length === 0 || this._sourceData.length === 0) return;

        const lastBar = this._sourceData.length - 1;
        const minFirstBar = this._fOptions.maxDisplayAgeBars > 0
            ? lastBar - this._fOptions.maxDisplayAgeBars
            : -Infinity;

        ctx.save();
        for (const box of this._boxes) {
            if ((box.state === 'filled' || box.state === 'invalidated' || box.state === 'expired') && !this._fOptions.showFilled) continue;
            if (box.state === 'open' && !this._fOptions.showOpenFvg) continue;
            if (box.formBar < minFirstBar) continue;

            const origColor = box.type === 'bull' ? this._fOptions.bullColor : this._fOptions.bearColor;
            const invColor = box.type === 'bull' ? this._fOptions.bearColor : this._fOptions.bullColor;

            const yTop = priceScale.priceToCoordinate(box.gapTop) * vpr;
            const yBottom = priceScale.priceToCoordinate(box.gapBottom) * vpr;
            const top = Math.min(yTop, yBottom);
            const height = Math.max(1, Math.abs(yBottom - yTop));

            if ((box.state === 'inverted' || box.state === 'invalidated') && box.invertedBar !== null) {
                // Dönüşten ÖNCE (soluk, orijinal FVG'nin izi): sadece showOpenFvg açıkken çizilir.
                const xInv = timeScale.indexToCoordinate(box.invertedBar as any) * hpr;
                if (this._fOptions.showOpenFvg) {
                    const x1 = timeScale.indexToCoordinate(box.firstBar as any) * hpr;
                    const preAlpha = (this._fOptions.filledOpacity / 100);
                    ctx.fillStyle = rgbaFrom(origColor, preAlpha);
                    ctx.fillRect(Math.min(x1, xInv), top, Math.max(1, Math.abs(xInv - x1)), height);
                }

                // Dönüşten SONRA: ters renk (yeni rol - IFVG); invalidated ise soluk.
                const x2 = timeScale.indexToCoordinate(box.endBar as any) * hpr;
                const postAlpha = box.state === 'invalidated'
                    ? this._fOptions.filledOpacity / 100
                    : this._fOptions.boxOpacity / 100;
                ctx.fillStyle = rgbaFrom(invColor, postAlpha);
                ctx.fillRect(Math.min(xInv, x2), top, Math.max(1, Math.abs(x2 - xInv)), height);
                if (box.state === 'inverted') {
                    ctx.strokeStyle = rgbaFrom(invColor, 0.85);
                    ctx.lineWidth = 1 * hpr;
                    ctx.strokeRect(Math.min(xInv, x2), top, Math.max(1, Math.abs(x2 - xInv)), height);
                }

                if (this._fOptions.showLabels && box.state === 'inverted') {
                    ctx.fillStyle = rgbaFrom(invColor, 0.95);
                    ctx.font = `${10 * hpr}px sans-serif`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = box.type === 'bull' ? 'top' : 'bottom';
                    ctx.fillText('IFVG', xInv + 3 * hpr, box.type === 'bull' ? top + height + 2 * vpr : top - 2 * vpr);
                }
            } else {
                const x1 = timeScale.indexToCoordinate(box.firstBar as any) * hpr;
                const x2 = timeScale.indexToCoordinate(box.endBar as any) * hpr;
                const alpha = (box.state === 'filled' || box.state === 'expired') ? this._fOptions.filledOpacity / 100 : this._fOptions.boxOpacity / 100;
                ctx.fillStyle = rgbaFrom(origColor, alpha);
                ctx.fillRect(Math.min(x1, x2), top, Math.max(1, Math.abs(x2 - x1)), height);
                if (box.state === 'open') {
                    ctx.strokeStyle = rgbaFrom(origColor, 0.6);
                    ctx.lineWidth = 1 * hpr;
                    ctx.strokeRect(Math.min(x1, x2), top, Math.max(1, Math.abs(x2 - x1)), height);
                    if (this._fOptions.showLabels) {
                        ctx.fillStyle = rgbaFrom(origColor, 0.9);
                        ctx.font = `${10 * hpr}px sans-serif`;
                        ctx.textAlign = 'left';
                        ctx.textBaseline = box.type === 'bull' ? 'top' : 'bottom';
                        ctx.fillText('FVG', x1 + 3 * hpr, box.type === 'bull' ? top + height + 2 * vpr : top - 2 * vpr);
                    }
                }
            }
        }
        ctx.restore();
    }
}
