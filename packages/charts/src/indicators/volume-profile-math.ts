/**
 * Saf hacim profili hesabi (indikator ve cizim araclari tarafindan paylasilir).
 *
 * - Fiyat araligi [lowest, highest] esit yukseklikte `rows` satira bolunur.
 * - Her barin hacmi, bar araligina (low..high) dokunan satirlara esit dagitilir.
 * - Bar kapanisi >= acilisi ise hacim "yukari", degilse "asagi" hacim sayilir.
 * - POC: en yuksek hacimli ilk satir. Deger alani: POC'tan baslayip komsu satirlarin
 *   hacimce buyugu eklenerek toplam hacmin yuzdesine ulasilana kadar genisler.
 */

export interface VolumeProfileBin {
    low: number;
    high: number;
    volume: number;
    upVolume: number;
    downVolume: number;
}

export interface VolumeProfileBar {
    open?: number;
    high: number;
    low: number;
    close?: number;
    volume?: number;
}

export interface VolumeProfileResult {
    startIndex: number;
    endIndex: number;
    lowest: number;
    highest: number;
    bins: VolumeProfileBin[];
    maxVolume: number;
    totalVolume: number;
    pocIndex: number;
    vahIndex: number;
    valIndex: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/** POC'tan baslayarak `percent` (0..1) hacme ulasan deger alani satir indeksleri. */
export function computeValueArea(
    bins: ReadonlyArray<{ volume: number }>,
    pocIndex: number,
    percent: number
): { vahIndex: number; valIndex: number } {
    const targetVolume = bins.reduce((sum, bin) => sum + bin.volume, 0) * percent;
    let cumulative = bins[pocIndex]?.volume || 0;
    let low = pocIndex;
    let high = pocIndex;

    while (cumulative < targetVolume && (low > 0 || high < bins.length - 1)) {
        const nextLow = low > 0 ? bins[low - 1].volume : -1;
        const nextHigh = high < bins.length - 1 ? bins[high + 1].volume : -1;

        if (nextHigh >= nextLow) {
            high = Math.min(bins.length - 1, high + 1);
            cumulative += bins[high].volume;
        } else {
            low = Math.max(0, low - 1);
            cumulative += bins[low].volume;
        }
    }

    return { vahIndex: high, valIndex: low };
}

/** "Ticks per row" duzeni icin satir sayisi (1..maxRows arasina sikistirilir). */
export function rowsForTicks(lowest: number, highest: number, tickSize: number, ticksPerRow: number, maxRows: number = 1000): number {
    const rowHeight = Math.max(tickSize, 1e-12) * Math.max(1, ticksPerRow);
    return clamp(Math.ceil((highest - lowest) / rowHeight - 1e-9), 1, maxRows);
}

/** [startIndex, endIndex] araligindaki barlarin fiyat araligi (aralik gecersizse null). */
export function volumeProfileExtent(bars: ReadonlyArray<VolumeProfileBar>, startIndex: number, endIndex: number): { lowest: number; highest: number } | null {
    let lowest = Infinity;
    let highest = -Infinity;
    for (let i = startIndex; i <= endIndex; i++) {
        const bar = bars[i];
        if (!bar) continue;
        if (bar.low < lowest) lowest = bar.low;
        if (bar.high > highest) highest = bar.high;
    }
    if (!Number.isFinite(lowest) || !Number.isFinite(highest) || highest - lowest <= 0) return null;
    return { lowest, highest };
}

/**
 * Hacim profilini hesaplar. `rows` sabit satir sayisi ya da (lowest, highest) alinip satir sayisi
 * donduren bir fonksiyon olabilir. Aralik gecersizse (fiyat araligi 0 / sonsuz) null doner.
 */
export function computeVolumeProfile(
    bars: ReadonlyArray<VolumeProfileBar>,
    startIndex: number,
    endIndex: number,
    rows: number | ((lowest: number, highest: number) => number),
    valueAreaFraction: number
): VolumeProfileResult | null {
    startIndex = Math.max(0, Math.floor(startIndex));
    endIndex = Math.min(bars.length - 1, Math.floor(endIndex));
    if (endIndex < startIndex) return null;

    const extent = volumeProfileExtent(bars, startIndex, endIndex);
    if (!extent) return null;
    const { lowest, highest } = extent;

    const rowCount = Math.max(1, Math.floor(typeof rows === 'function' ? rows(lowest, highest) : rows));
    const step = (highest - lowest) / rowCount;
    const bins: VolumeProfileBin[] = Array.from({ length: rowCount }, (_, idx) => ({
        low: lowest + idx * step,
        high: lowest + (idx + 1) * step,
        volume: 0,
        upVolume: 0,
        downVolume: 0,
    }));

    let totalVolume = 0;
    for (let i = startIndex; i <= endIndex; i++) {
        const bar = bars[i];
        const volume = Math.max(0, bar.volume || 0);
        totalVolume += volume;

        const high = clamp(bar.high, lowest, highest);
        const low = clamp(bar.low, lowest, highest);
        const startBin = clamp(Math.floor((low - lowest) / step), 0, rowCount - 1);
        // Sifir araliklu bar ic satir sinirinda ise endBin < startBin olup hacim kaybolmasin.
        const endBin = Math.max(startBin, clamp(Math.floor(((high - lowest) / step) - 1e-8), 0, rowCount - 1));
        const touched = Math.max(1, endBin - startBin + 1);
        const allocated = volume / touched;
        const isUp = (bar.close ?? 0) >= (bar.open ?? 0);

        for (let binIndex = startBin; binIndex <= endBin; binIndex++) {
            bins[binIndex].volume += allocated;
            if (isUp) bins[binIndex].upVolume += allocated;
            else bins[binIndex].downVolume += allocated;
        }
    }

    const maxVolume = bins.reduce((acc, bin) => Math.max(acc, bin.volume), 0);
    const pocIndex = bins.reduce((best, bin, idx) => bin.volume > bins[best].volume ? idx : best, 0);
    const { vahIndex, valIndex } = computeValueArea(bins, pocIndex, valueAreaFraction);

    return { startIndex, endIndex, lowest, highest, bins, maxVolume, totalVolume, pocIndex, vahIndex, valIndex };
}
