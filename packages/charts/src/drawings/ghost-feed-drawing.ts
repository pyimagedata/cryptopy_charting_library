/**
 * Hayalet Akis (Ghost Feed) araci: ghostFeed (N tik, polyline gibi; cift tik / Enter / Esc ile biter).
 *
 * SEGMENT  Ardisik her nokta cifti arasinda `candlesPerSegment` (varsayilan 20; TradingView'daki "averageHL" sayisi bu araca
 *          "segment basina mum sayisi" olarak yorumlanir) sentetik mum uretilir. Ilk mumun acilisi segment basi fiyati,
 *          son mumun kapanisi segment sonu fiyatidir (yol hedef noktalara tam oturur).
 * VARYANS  variance (%, varsayilan 50): birim = max(|hareket| / mumSayisi, 0.05% fiyat). Ara kapanis, dogrusal yoldan
 *          (rnd*2-1) * v * birim * 1.5 sapar; fitiller govdenin ustune/altina birim * (0.1 + v * rnd) eklenir (v = variance/100).
 * TOHUM    Uretim deterministiktir: mulberry32(FNV-1a(`${seed}:${segment}`)). seed varsayilan cizim id'sidir ve ext.seed'de
 *          saklanir (yeniden yukleme ve klon ayni mumlari verir). Her mum icin 3 rastgele sayi (sabit sira) kullanilir.
 * STIL     yukari: tealrenk + seffaflik 50, asagi: kirmizi; kenar yukari teal / asagi kirmizi; fitil #808080; drawWick, drawBorder acik.
 */

import { SerializedDrawing } from './drawing';
import {
    DrawingSettingsConfig,
    AttributeBarItem,
    SettingsSection,
    createStyleTab,
    createCoordinatesTab,
    createVisibilityTab,
    colorRow,
    lineWidthRow,
    checkboxRow,
    numberRow,
    sliderRow,
} from './drawing-settings-config';
import { VolumeToolBase } from './volume-drawings';

const TEAL = '#089981';
const RED = '#F23645';
const GRAY = '#808080';

const DEFAULTS = {
    candlesPerSegment: 20,
    variance: 50,
    upColor: TEAL,
    downColor: RED,
    borderUpColor: TEAL,
    borderDownColor: RED,
    wickColor: GRAY,
    drawWick: true,
    drawBorder: true,
    transparency: 50,
    seed: '',
};
const LIMITS: Record<string, [number, number]> = {
    candlesPerSegment: [1, 500], variance: [0, 100], transparency: [0, 100],
};

export interface GhostCandle {
    /** Segment indeksi (0 = ilk iki nokta arasi) */
    segment: number;
    /** Segment icindeki konum 0..1 (mumun orta noktasi) */
    f: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

function fnv1a(str: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

function mulberry32(a: number): () => number {
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Noktalar arasi sentetik mumlar (bkz. dosya basligi); ayni seed + girdi -> ayni mumlar. */
export function generateGhostCandles(
    points: ReadonlyArray<{ price: number }>, seed: string, candlesPerSegment: number, variance: number
): GhostCandle[] {
    const out: GhostCandle[] = [];
    const n = Math.max(1, Math.round(candlesPerSegment));
    const v = Math.max(0, Math.min(100, variance)) / 100;
    for (let s = 0; s + 1 < points.length; s++) {
        const p0 = points[s].price, p1 = points[s + 1].price;
        if (!Number.isFinite(p0) || !Number.isFinite(p1)) continue;
        const rnd = mulberry32(fnv1a(`${seed}:${s}`));
        const unit = Math.max(Math.abs(p1 - p0) / n, Math.abs(p0) * 0.0005);
        let prevClose = p0;
        for (let i = 0; i < n; i++) {
            const r1 = rnd(), r2 = rnd(), r3 = rnd();
            const open = prevClose;
            const close = i === n - 1 ? p1 : p0 + ((p1 - p0) * (i + 1)) / n + (r1 * 2 - 1) * v * unit * 1.5;
            const top = Math.max(open, close), bottom = Math.min(open, close);
            out.push({
                segment: s,
                f: (i + 0.5) / n,
                open, close,
                high: top + unit * (0.1 + v * r2),
                low: bottom - unit * (0.1 + v * r3),
            });
            prevClose = close;
        }
    }
    return out;
}

export class GhostFeedDrawing extends VolumeToolBase {
    private _candles: GhostCandle[] = [];
    private _candlesKey = '';
    private _previewIndex = -1;

    constructor() {
        super('ghostFeed', TEAL, DEFAULTS);
        this.props.seed = this.id;
        this.style.lineWidth = 1;
    }

    protected get _defaults() { return DEFAULTS; }
    protected get _limits() { return LIMITS; }
    get requiredPoints(): number { return 2; }

    get seed(): string { return String(this.props.seed || this.id); }

    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
    }

    isComplete(): boolean {
        return this.state !== 'creating' && this.points.length >= 2;
    }

    /** Cift tik / Enter / Esc: onizleme noktasi atilir; en az 2 nokta varsa tamamlanir. */
    finishGhostFeed(): void {
        if (this._previewIndex !== -1) {
            this.points.splice(this._previewIndex, 1);
            this._previewIndex = -1;
        }
        if (this.points.length >= 2) this.state = 'complete';
    }

    updateLastPoint(time: number, price: number): void {
        if (this.points.length === 0) return;
        if (this.state === 'creating') {
            if (this._previewIndex === -1) {
                this.points.push({ time, price });
                this._previewIndex = this.points.length - 1;
            } else {
                this.points[this._previewIndex] = { time, price };
            }
        } else {
            this.points[this.points.length - 1] = { time, price };
        }
    }

    confirmPreviewPoint(): void { this._previewIndex = -1; }

    /** Ana renk = yukari mum rengi (volume profile ile ayni kural) */
    protected _onSet(key: string, value: any): void {
        if (key === 'color') this.props.upColor = value;
        else if (key === 'upColor') this.style.color = value;
    }

    /** Sentetik mumlar; ayar/nokta/tohum degismedikce onbellekten. */
    getCandles(): GhostCandle[] {
        const p = this.props;
        const key = [this.seed, p.candlesPerSegment, p.variance, this.points.map((pt) => pt.price).join(',')].join('|');
        if (key !== this._candlesKey) {
            this._candlesKey = key;
            this._candles = generateGhostCandles(this.points, this.seed, p.candlesPerSegment, p.variance);
        }
        return this._candles;
    }

    getSettingsConfig(): DrawingSettingsConfig {
        const sections: SettingsSection[] = [
            {
                title: 'Feed',
                rows: [
                    numberRow('candlesPerSegment', 'Candles per segment', { min: 1, max: 500, step: 1 }),
                    sliderRow('variance', 'Variance', 0, 100, '%'),
                ],
            },
            {
                title: 'Candles',
                rows: [
                    colorRow('upColor', 'Up color'),
                    colorRow('downColor', 'Down color'),
                    sliderRow('transparency', 'Transparency', 0, 100, '%'),
                ],
            },
            {
                title: 'Border',
                rows: [
                    checkboxRow('drawBorder', 'Border'),
                    colorRow('borderUpColor', 'Border up color'),
                    colorRow('borderDownColor', 'Border down color'),
                    lineWidthRow('lineWidth', 'Border width'),
                ],
            },
            {
                title: 'Wick',
                rows: [checkboxRow('drawWick', 'Wick'), colorRow('wickColor', 'Wick color')],
            },
        ];
        return { tabs: [createStyleTab(sections), createCoordinatesTab([]), createVisibilityTab()] };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'upColor', tooltip: 'Up Color' },
            { type: 'color', key: 'downColor', tooltip: 'Down Color' },
            { type: 'lineWidth', key: 'lineWidth', tooltip: 'Border Width' },
        ];
    }

    protected _restore(data: SerializedDrawing): void {
        super._restore(data);
        // Eski/eksik kayitlarda tohum cizim id'si olur
        if (!this.props.seed) this.props.seed = data.id;
        this.style.color = this.props.upColor;
    }

    static fromJSON(data: SerializedDrawing): GhostFeedDrawing {
        const d = new GhostFeedDrawing();
        d._restore(data);
        return d;
    }
}


