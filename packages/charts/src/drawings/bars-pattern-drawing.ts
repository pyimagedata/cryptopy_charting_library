/**
 * Bar Deseni (Bars Pattern) araci: barsPattern (3 tik: P1 ve P2 mevcut barlardan aralik secer; P3 kopyanin yeri).
 *
 * KOPYA    P1..P2 (zamana gore sirali, en yakin bara yapisir; son bardan sonrasi son bara kenetlenir) arasindaki OHLC barlari
 *          P3'ten baslayarak cizilir: ilk barin x'i P3.time, sonraki barlar bar araligi kadar saga.
 * OFSET    Cizilen ilk barin KAPANISI P3.price'a oturur (acilis degil; cizgi modunda cizgi P3'ten baslar):
 *          yeni = P3.price + (deger - ilkBar.close). Desen capayla birlikte tasinir.
 * AYNA     mirrored: capa (ilk kapanis) etrafinda dikey cevirme: yeni = P3.price - (deger - ilkBar.close); high/low yer degistirir.
 * TERS     flipped: zaman sirasi ters (son bar once cizilir). "Ilk bar" ters siradaki ilk bardir.
 * MODLAR   hlBars (yuksek-dusuk cubuklari, varsayilan), openClose (govde), line (kapanis cizgisi), ohlc (klasik OHLC barlari).
 * AYARLAR  mode, mirrored, flipped, transparency (0-100), color (varsayilan #2962FF), lineWidth.
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
    selectRow,
    sliderRow,
} from './drawing-settings-config';
import { VolumeToolBase } from './volume-drawings';
import { VolumeBar, nearestBarIndex } from './volume-tools-common';

export type BarsPatternMode = 'hlBars' | 'openClose' | 'line' | 'ohlc';
export const BARS_PATTERN_MODES: { value: BarsPatternMode; label: string }[] = [
    { value: 'hlBars', label: 'HL bars' },
    { value: 'openClose', label: 'Open-close' },
    { value: 'line', label: 'Line' },
    { value: 'ohlc', label: 'OHLC bars' },
];

/** Kopyalanabilecek en fazla bar (cok genis aralik cizimi yavaslatmasin) */
export const BARS_PATTERN_MAX_BARS = 5000;

export interface PatternBar { open: number; high: number; low: number; close: number }

const DEFAULTS = {
    mode: 'hlBars' as BarsPatternMode,
    mirrored: false,
    flipped: false,
    transparency: 50,
};
const LIMITS: Record<string, [number, number]> = { transparency: [0, 100] };

/** Zamana en yakin bar (son bardan cok sonrasi -> son bar); bar yoksa -1. */
function clampedIndex(bars: ReadonlyArray<{ time: number }>, time: number): number {
    if (bars.length === 0) return -1;
    return nearestBarIndex(bars, time) ?? bars.length - 1;
}

/** P1/P2 zamanlarinin sectigi bar araligi (dahil) ve barlari; bar yoksa null. */
export function selectPatternBars(bars: ReadonlyArray<VolumeBar>, t1: number, t2: number): { start: number; end: number; bars: PatternBar[] } | null {
    let a = clampedIndex(bars, t1);
    let b = clampedIndex(bars, t2);
    if (a < 0 || b < 0) return null;
    if (a > b) [a, b] = [b, a];
    b = Math.min(b, a + BARS_PATTERN_MAX_BARS - 1);
    const out: PatternBar[] = [];
    for (let i = a; i <= b; i++) {
        const x = bars[i];
        const close = Number(x.close ?? x.value);
        const open = Number(x.open ?? close);
        const high = Number(x.high ?? Math.max(open, close));
        const low = Number(x.low ?? Math.min(open, close));
        if (![open, high, low, close].every(Number.isFinite)) continue;
        out.push({ open, high, low, close });
    }
    return out.length ? { start: a, end: b, bars: out } : null;
}

/** Kaynak barlardan cizilecek deseni uretir (bkz. dosya basligi: ters, ofset, ayna). */
export function buildBarsPattern(src: ReadonlyArray<PatternBar>, anchorPrice: number, mirrored: boolean, flipped: boolean): PatternBar[] {
    if (src.length === 0) return [];
    const ordered = flipped ? [...src].reverse() : src;
    const ref = ordered[0].close;
    const sign = mirrored ? -1 : 1;
    const map = (v: number) => anchorPrice + sign * (v - ref);
    return ordered.map((b) => {
        const o = map(b.open), h = map(b.high), l = map(b.low), c = map(b.close);
        return { open: o, high: Math.max(h, l), low: Math.min(h, l), close: c };
    });
}

export interface BarsPatternComputed {
    startIndex: number;
    endIndex: number;
    source: PatternBar[];
    /** P3 yokken (olusturma) null */
    pattern: PatternBar[] | null;
}

export class BarsPatternDrawing extends VolumeToolBase {
    private _computed: BarsPatternComputed | null = null;
    private _previewIndex = -1;

    constructor() {
        super('barsPattern', '#2962FF', DEFAULTS);
    }

    protected get _defaults() { return DEFAULTS; }
    protected get _limits() { return LIMITS; }
    get requiredPoints(): number { return 3; }
    /** Onayli (onizleme olmayan) nokta sayisi */
    get confirmedPointCount(): number { return this._previewIndex === -1 ? this.points.length : this.points.length - 1; }

    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
        if (this.points.length >= this.requiredPoints) this.state = 'complete';
    }

    isComplete(): boolean {
        return this.points.length >= this.requiredPoints && this.state !== 'creating';
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

    setSettingValue(key: string, value: any): void {
        if (key === 'mode') {
            if (BARS_PATTERN_MODES.some((m) => m.value === value)) this.props.mode = value;
            return;
        }
        super.setSettingValue(key, value);
    }

    /** Kaynak aralik (P1,P2) ve (P3 varsa) desen; onbellekli. Bar yoksa null. */
    getComputed(): BarsPatternComputed | null {
        if (this.points.length < 2) return null;
        const p3 = this.points.length >= 3 ? this.points[2] : null;
        const key = [this._barsKey(), this.points[0].time, this.points[1].time, p3 ? p3.price : '-', this.props.mirrored, this.props.flipped].join('|');
        if (key === this._cacheKey) return this._computed;
        this._cacheKey = key;
        const sel = selectPatternBars(this._bars, this.points[0].time, this.points[1].time);
        this._computed = sel ? {
            startIndex: sel.start,
            endIndex: sel.end,
            source: sel.bars,
            pattern: p3 ? buildBarsPattern(sel.bars, p3.price, !!this.props.mirrored, !!this.props.flipped) : null,
        } : null;
        return this._computed;
    }

    getSettingsConfig(): DrawingSettingsConfig {
        const sections: SettingsSection[] = [
            {
                title: 'Pattern',
                rows: [
                    selectRow('mode', 'Mode', BARS_PATTERN_MODES),
                    checkboxRow('mirrored', 'Mirrored'),
                    checkboxRow('flipped', 'Flipped'),
                ],
            },
            {
                title: 'Style',
                rows: [colorRow('color', 'Color'), lineWidthRow('lineWidth', 'Line width'), sliderRow('transparency', 'Transparency', 0, 100, '%')],
            },
        ];
        return { tabs: [createStyleTab(sections), createCoordinatesTab([]), createVisibilityTab()] };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Color' },
            { type: 'lineWidth', key: 'lineWidth', tooltip: 'Line Width' },
        ];
    }

    static fromJSON(data: SerializedDrawing): BarsPatternDrawing {
        const d = new BarsPatternDrawing();
        d._restore(data);
        if (!BARS_PATTERN_MODES.some((m) => m.value === d.props.mode)) d.props.mode = DEFAULTS.mode;
        return d;
    }
}
