// Bobbin: sıkışma (bobin) bölgeleri. Tespit backend'de hesaplanır
// (bkz. remote-compute.ts), burada yalnızca çizilir.

import { OverlayIndicator } from './indicator';
import { BarData } from '../model/data';
import { RemoteCompute, RemoteContext, barIndexAtTime, drawAccessNotice } from './remote-compute';

export interface BobbinIndicatorOptions {
    name: string;
    minRun: number;
    maxHeightAtr: number;
    scoreThreshold: number;
    rightExtend: number;
    showScore: boolean;
    bobbinColor: string;
    boxOpacity: number;
    visible: boolean;
}

const defaultBobbinOptions: BobbinIndicatorOptions = {
    name: 'Bobbin',
    minRun: 4,
    maxHeightAtr: 1.5,
    scoreThreshold: 0.6,
    rightExtend: 60,
    showScore: false,
    bobbinColor: '#2962ff',
    boxOpacity: 20,
    visible: true,
};

interface RemoteBobbin {
    time: number;
    form_time: number;
    bars: number;
    top: number;
    bottom: number;
    n: number;
    u_cv: number;
    band_mx: number;
    height_atr: number;
    score: number;
}

interface Bobbin {
    left: number;
    formIdx: number;
    right: number;
    top: number;
    bottom: number;
    n: number;
    uCv: number;
    bandMx: number;
    heightAtr: number;
    score: number;
}

function rgbaFrom(color: string, alpha: number): string {
    const hex = color.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return color;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export class BobbinIndicator extends OverlayIndicator {
    private _bOptions: BobbinIndicatorOptions;
    private _bobbins: Bobbin[] = [];
    private _raw: { bobbins: RemoteBobbin[] } | null = null;
    private readonly _remote = new RemoteCompute<{ bobbins: RemoteBobbin[] }>('bobbin', (raw) => {
        this._raw = raw;
        this._rebuild();
    });

    constructor(options: Partial<BobbinIndicatorOptions> = {}) {
        const merged = { ...defaultBobbinOptions, ...options };
        super(merged);
        this._bOptions = { ...defaultBobbinOptions, ...this._options } as BobbinIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._bOptions };
    }

    setContext(ctx: RemoteContext): void {
        this._remote.setContext(ctx);
    }

    setSettingValue(key: string, value: any): boolean {
        (this._bOptions as any)[key] = value;
        (this._options as any)[key] = value;
        if (this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
        return true;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        // Sadece algoritmayı etkileyen ayarlar sunucuya gider; renk/opaklık yerelde.
        this._remote.request(
            {
                minRun: this._bOptions.minRun,
                maxHeightAtr: this._bOptions.maxHeightAtr,
                scoreThreshold: this._bOptions.scoreThreshold,
                rightExtend: this._bOptions.rightExtend,
            },
            () => this._dataChanged.fire()
        );
        this._rebuild();
    }

    /** Ham (zaman damgalı) sonucu mevcut mum dizisinin index'lerine çevirir. */
    private _rebuild(): void {
        this._data = [];
        this._bobbins = [];
        const bars = this._sourceData;
        if (!this._raw || bars.length === 0) return;

        for (const r of this._raw.bobbins) {
            const left = barIndexAtTime(bars, r.time);
            const formIdx = barIndexAtTime(bars, r.form_time);
            if (left < 0 || formIdx < 0) continue;
            this._bobbins.push({
                left, formIdx, right: left + r.bars, top: r.top, bottom: r.bottom, n: r.n,
                uCv: r.u_cv, bandMx: r.band_mx, heightAtr: r.height_atr, score: r.score,
            });
        }

        const byForm: Record<number, Bobbin> = {};
        for (const b of this._bobbins) byForm[b.formIdx] = b;
        // values = [score, top, bottom, n, uCv, bandMx, heightAtr]
        this._data = bars.map((bar, i) => {
            const b = byForm[i];
            return b
                ? { time: bar.time, value: b.score, values: [b.score, b.top, b.bottom, b.n, b.uCv, b.bandMx, b.heightAtr] }
                : { time: bar.time, value: NaN, values: [] };
        });
    }

    getRange(): { min: number; max: number } {
        if (this._bobbins.length === 0) return { min: 0, max: 100 };
        let min = Infinity, max = -Infinity;
        for (const b of this._bobbins) {
            if (b.bottom < min) min = b.bottom;
            if (b.top > max) max = b.top;
        }
        return { min, max };
    }

    getDescription(): string {
        return `Bobbin: ${this._bobbins.length} tespit (esik ${this._bOptions.scoreThreshold})`;
    }

    destroy(): void {
        this._remote.destroy();
        super.destroy();
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        if (this._remote.denied !== null) {
            drawAccessNotice(ctx, hpr, vpr, this._remote, this._bOptions.name);
            return;
        }
        if (this._bobbins.length === 0 || this._sourceData.length === 0) return;

        ctx.save();
        for (const box of this._bobbins) {
            const x1 = timeScale.indexToCoordinate(box.left as any) * hpr;
            const x2 = timeScale.indexToCoordinate(box.right as any) * hpr;
            const yA = priceScale.priceToCoordinate(box.top) * vpr;
            const yB = priceScale.priceToCoordinate(box.bottom) * vpr;

            const left = Math.min(x1, x2);
            const width = Math.max(1, Math.abs(x2 - x1));
            const top = Math.min(yA, yB);
            const height = Math.max(1, Math.abs(yB - yA));

            const t = Math.max(0, Math.min(1, (box.score - this._bOptions.scoreThreshold) /
                Math.max(0.01, 1 - this._bOptions.scoreThreshold)));
            const alpha = (this._bOptions.boxOpacity / 100) * (0.55 + 0.45 * t);

            ctx.fillStyle = rgbaFrom(this._bOptions.bobbinColor, alpha);
            ctx.fillRect(left, top, width, height);
            ctx.strokeStyle = rgbaFrom(this._bOptions.bobbinColor, 0.85);
            ctx.lineWidth = 1 * hpr;
            ctx.strokeRect(left, top, width, height);

            if (this._bOptions.showScore) {
                ctx.fillStyle = rgbaFrom(this._bOptions.bobbinColor, 0.95);
                ctx.font = `${10 * hpr}px sans-serif`;
                ctx.textBaseline = 'bottom';
                ctx.textAlign = 'left';
                ctx.fillText(box.score.toFixed(2), left + 2 * hpr, top - 2 * vpr);
            }
        }
        ctx.restore();
    }
}
