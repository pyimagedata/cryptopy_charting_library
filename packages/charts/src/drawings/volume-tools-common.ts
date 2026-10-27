/**
 * Hacim tabanli cizim araclarinin (Anchored VWAP, Fixed Range / Anchored Volume Profile) ortak mantigi.
 * Hesaplar saf fonksiyondur (render'dan bagimsiz test edilir).
 *
 * VWAP = Σ(kaynakFiyat × hacim) / Σhacim (capa barindan itibaren kumulatif).
 * Bant sapmasi: hacim agirlikli standart sapma = sqrt(Σ(h × p²)/Σh − vwap²), bantlar vwap ± k × sapma.
 */

import { estimatePricePrecision } from './line-tool-common';

export type VwapSource = 'hlc3' | 'close' | 'open' | 'high' | 'low' | 'ohlc4' | 'hl2';

export const VWAP_SOURCES: { value: VwapSource; label: string }[] = [
    { value: 'hlc3', label: 'HLC3 (Typical Price)' },
    { value: 'close', label: 'Close' },
    { value: 'open', label: 'Open' },
    { value: 'high', label: 'High' },
    { value: 'low', label: 'Low' },
    { value: 'ohlc4', label: 'OHLC4' },
    { value: 'hl2', label: 'HL2' },
];

/** Hacim tabanli araclarin okudugu bar (OHLCV; cizgi serilerinde yalnizca value olabilir). */
export interface VolumeBar {
    time: number;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    value?: number;
    volume?: number;
}

/** Cizimlere ana serinin barlarini veren arayuz (pane-widget / chart-widget cagirir). */
export interface BarDataConsumer {
    setBarData(bars: ReadonlyArray<any>): void;
}

export function hasBarDataConsumer(d: unknown): d is BarDataConsumer {
    return !!d && typeof (d as any).setBarData === 'function';
}

/** Bar icin kaynak fiyat; eksik alanlar kapanisa (ya da value'ya) duser. */
export function vwapSourcePrice(bar: VolumeBar, source: VwapSource): number {
    const close = Number(bar.close ?? bar.value);
    const open = Number(bar.open ?? close);
    const high = Number(bar.high ?? close);
    const low = Number(bar.low ?? close);
    switch (source) {
        case 'close': return close;
        case 'open': return open;
        case 'high': return high;
        case 'low': return low;
        case 'ohlc4': return (open + high + low + close) / 4;
        case 'hl2': return (high + low) / 2;
        default: return (high + low + close) / 3;
    }
}

export interface AnchoredVwapResult {
    startIndex: number;
    /** Her bar icin (startIndex'ten itibaren) VWAP; kumulatif hacim 0 iken NaN */
    vwap: number[];
    /** Hacim agirlikli standart sapma (vwap ile ayni uzunluk) */
    stdev: number[];
}

/** Capa barindan son bara VWAP ve sapma. Aralikta toplam hacim 0 ise null (hicbir sey cizilmez). */
export function computeAnchoredVwap(bars: ReadonlyArray<VolumeBar>, startIndex: number, source: VwapSource = 'hlc3'): AnchoredVwapResult | null {
    startIndex = Math.max(0, Math.floor(startIndex));
    if (startIndex >= bars.length) return null;

    const vwap: number[] = [];
    const stdev: number[] = [];
    let cumVol = 0;
    let cumPV = 0;
    let cumPPV = 0;
    for (let i = startIndex; i < bars.length; i++) {
        const volume = Math.max(0, Number(bars[i].volume) || 0);
        const price = vwapSourcePrice(bars[i], source);
        if (Number.isFinite(price)) {
            cumVol += volume;
            cumPV += price * volume;
            cumPPV += price * price * volume;
        }
        if (cumVol > 0) {
            const v = cumPV / cumVol;
            vwap.push(v);
            stdev.push(Math.sqrt(Math.max(0, cumPPV / cumVol - v * v)));
        } else {
            vwap.push(NaN);
            stdev.push(NaN);
        }
    }
    if (cumVol <= 0) return null;
    return { startIndex, vwap, stdev };
}

/**
 * Zamana en yakin barin indeksi (capa bara yapisir). Zaman son barin bir aralik otesindeyse
 * (gelecekte) ya da barlar bossa null.
 */
export function nearestBarIndex(bars: ReadonlyArray<{ time: number }>, time: number): number | null {
    const n = bars.length;
    if (n === 0) return null;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (bars[mid].time < time) lo = mid + 1; else hi = mid;
    }
    // lo: time'dan buyuk/esit ilk bar
    if (lo > 0 && Math.abs(bars[lo - 1].time - time) <= Math.abs(bars[lo].time - time)) lo--;
    if (lo === n - 1 && n >= 2 && time - bars[n - 1].time > (bars[n - 1].time - bars[n - 2].time)) return null;
    return lo;
}

/** Son barlarin ondalik sayisindan tick buyuklugu (10^-hassasiyet). */
export function estimateTickSize(bars: ReadonlyArray<VolumeBar>): number {
    const tail = bars.slice(-100).map((b) => Number(b.close ?? b.value));
    return Math.pow(10, -estimatePricePrecision(tail, 2));
}

/** 1000 -> 1K, 1.5e6 -> 1.50M */
export function formatVolume(value: number): string {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
    return value.toFixed(0);
}

/** "#rrggbb" + seffaflik yuzdesi (0 = opak) -> rgba(); hex degilse renk aynen doner. */
export function colorWithTransparency(color: string, transparencyPercent: number): string {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(color.trim());
    if (!m) return color;
    const alpha = Math.max(0, Math.min(1, 1 - transparencyPercent / 100));
    return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

/** Ayar degerini varsayilanin turune gore normallestirir (sayi/bool/metin) ve sinirlar. */
export function coerceSetting(defaultValue: any, value: any, limits?: [number, number]): any {
    if (typeof defaultValue === 'number') {
        let n = Number(value);
        if (!Number.isFinite(n)) n = defaultValue;
        if (limits) n = Math.max(limits[0], Math.min(limits[1], n));
        return n;
    }
    if (typeof defaultValue === 'boolean') return !!value;
    return String(value ?? defaultValue);
}

/** Cizim noktasi (zaman) -> en yakin bar zamani (bar yoksa ayni). */
export function snapTimeToBars(bars: ReadonlyArray<{ time: number }>, time: number): number {
    const idx = nearestBarIndex(bars, time);
    return idx === null ? time : bars[idx].time;
}
