declare const OverlayIndicator: any;

// SMC Layered (dev)
// Production smc-indicator + patterns/smc.ts portunun, macro zigzag "latch"
// sorununu gideren varyanti.
//
// Sorun: macro zincire yeni pivot SADECE onceki macro ekstremi (lastHigh/lastLow)
// kirilirsa ekleniyor. Bu ekstremler onceki impuls bacaginin uclarindan geldigi
// icin, buyuk bir bacaktan sonra gereken kirilim bandi da o bacak kadar genis
// oluyor -> fiyat bandin icinde kaldigi surece hicbir pivot kaydedilmiyor
// (yuzlerce bar tek duz cizgi).
//
// Cozum (adaptiveBand): son macro pivottan bu yana gecen bar sayisi stallBars'i
// astikca, kapida kullanilan bant her stallBars periyodunda bandDecay orani
// kadar guncel fiyata dogru daraltiliyor. Bant asla ham banttan genis olamaz
// (clamp), yani indikator yalnizca daha hassas hale gelebilir. Bir pivot
// kaydedilince sayac sifirlanir ve bant gercek degerlerine doner.
//
// Ek olarak anchorBar: 0 disinda bir deger verilirse macro zincir, orijinal
// "tum gecmisin mutlak ekstremi" yerine o bar indeksinden itibaren kurulur.

interface SmcLayPivot {
    price: number;
    index: number;
    dir: number; // 1 = High, -1 = Low
    time: number;
}

interface SmcLayBreak {
    type: string; // 'BOS' | 'MSB'
    dir: string;  // 'Bullish' | 'Bearish'
    level: number;
    start_bar: number;
    end_bar: number;
}

const SMC_LAY_DEFAULTS: any = {
    name: 'SMC Layered',
    period: 15,
    pivotSrc: 'High/Low',
    breakSrc: 'Close',
    macroSrc: 'Close',
    useTickFilter: true,
    tickMult: 3,
    tickSize: 0,
    confirmCandles: 3,
    // --- yeni ayarlar ---
    adaptiveBand: true,
    stallBars: 100,
    bandDecay: 0.7,
    // --- capa (manuel baslangic) ---
    // anchorTime > 0 ise oncelikli (timeframe degisse de gecerli kalir),
    // yoksa anchorBar kullanilir. 0 = kapali, tum gecmis islenir.
    // Oncelik: cizim > anchorTime > anchorBar
    anchorFromDrawing: true,
    anchorDrawingTypes: 'verticalLine,crossLine',
    anchorPollMs: 800,
    anchorBar: 0,
    anchorTime: 0,
    anchorSnapBars: 20,
    anchorDir: 'auto',      // 'auto' | 'low' | 'high'
    showAnchor: true,
    anchorColor: '#9c27b0',
    adaptiveBreaks: true,
    // --- katmanlar ---
    // L1 'period' ile kurulur (kaba). L2/L3 ise ayri, daha ince bir taban
    // pivot havuzu kullanir; yoksa alt katmanlarin cozunurlugu L1'in
    // periyoduyla sinirli kalir ve L3 fiilen L2'yi tekrarlar.
    basePeriod: 5,
    showL2: true,
    l2Ratio: 0.25,
    l2MinBars: 2,
    showL3: true,
    l3Ratio: 0.18,
    l3MinBars: 2,
    showL2Breaks: true,
    showVolumeConfirm: true,
    volConfirmRatio: 1.5,
    debugEmit: '',
    l2Color: '#2962ff',
    l3Color: 'rgba(90, 90, 90, 0.55)',
    // -----------------
    showMinorZigZag: false,
    showMacroZigZag: true,
    showBOS: true,
    showMSB: true,
    minorColor: 'rgba(41, 98, 255, 0.35)',
    macroColor: '#ff9800',
    bullishColor: '#008080',
    bearishColor: '#ef4444',
    lineWidth: 2,
};

function smcLayEstimateTickSize(data: any[], startBar: number = 0): number {
    let minDiff = Infinity;
    const from = Math.max(1, startBar + 1);
    const len = Math.min(data.length, from + 100);
    for (let i = from; i < len; i++) {
        const diff = Math.abs(data[i].close - data[i - 1].close);
        if (diff > 0 && diff < minDiff) {
            minDiff = diff;
        }
    }
    return minDiff === Infinity ? 0.01 : minDiff;
}

function smcLayMinorZigZag(sourceData: any[], prd: number, pivotSrc: string, startBar: number = 0): SmcLayPivot[] {
    const highs = sourceData.map((b: any) => pivotSrc === 'Close' ? b.close : b.high);
    const lows = sourceData.map((b: any) => pivotSrc === 'Close' ? b.close : b.low);

    const zigzag: SmcLayPivot[] = [];
    let dirVal = 0;

    const from = Math.max(0, startBar);
    for (let i = from; i < sourceData.length; i++) {
        // Capadan oncesine hic bakilmaz.
        const startLookback = Math.max(from, i - prd + 1);

        let isPH = true;
        for (let j = startLookback; j < i; j++) {
            if (highs[j] > highs[i]) { isPH = false; break; }
        }

        let isPL = true;
        for (let j = startLookback; j < i; j++) {
            if (lows[j] < lows[i]) { isPL = false; break; }
        }

        const phVal = isPH ? highs[i] : null;
        const plVal = isPL ? lows[i] : null;

        const lastDir = dirVal;
        if (plVal !== null && phVal === null) {
            dirVal = -1;
        } else if (phVal !== null && plVal === null) {
            dirVal = 1;
        } else if (phVal !== null && plVal !== null) {
            if (dirVal === 0) {
                dirVal = sourceData[i].close >= sourceData[i].open ? 1 : -1;
            } else {
                dirVal = dirVal === -1 ? 1 : -1;
            }
        }

        if (phVal !== null || plVal !== null) {
            const valToUse = dirVal === 1 ? (phVal as number) : (plVal as number);
            if (dirVal !== lastDir) {
                zigzag.unshift({ price: valToUse, index: i, dir: dirVal, time: sourceData[i].time });
            } else if (zigzag.length === 0) {
                zigzag.unshift({ price: valToUse, index: i, dir: dirVal, time: sourceData[i].time });
            } else {
                const current = zigzag[0];
                if ((dirVal === 1 && valToUse > current.price) || (dirVal === -1 && valToUse < current.price)) {
                    current.price = valToUse;
                    current.index = i;
                    current.time = sourceData[i].time;
                    current.dir = dirVal;
                }
            }
        }
    }

    return zigzag;
}

function smcLayBreakBelow(
    level: number, startBar: number, endBar: number, breakSrc: string,
    useTickFilter: boolean, tickThreshold: number,
    closes: number[], lows: number[], confirmCandles: number
): boolean {
    const sBar = Math.min(startBar, endBar);
    const eBar = Math.max(startBar, endBar);
    const required = useTickFilter ? level - tickThreshold : level;
    const actualConfirm = breakSrc === 'Close' ? confirmCandles : 1;
    const source = breakSrc === 'Close' ? closes : lows;

    for (let b = sBar; b <= eBar; b++) {
        if (b + actualConfirm - 1 < source.length) {
            let allOk = true;
            for (let offset = 0; offset < actualConfirm; offset++) {
                if (source[b + offset] >= required) { allOk = false; break; }
            }
            if (allOk) return true;
        }
    }
    return false;
}

function smcLayBreakAbove(
    level: number, startBar: number, endBar: number, breakSrc: string,
    useTickFilter: boolean, tickThreshold: number,
    closes: number[], highs: number[], confirmCandles: number
): boolean {
    const sBar = Math.min(startBar, endBar);
    const eBar = Math.max(startBar, endBar);
    const required = useTickFilter ? level + tickThreshold : level;
    const actualConfirm = breakSrc === 'Close' ? confirmCandles : 1;
    const source = breakSrc === 'Close' ? closes : highs;

    for (let b = sBar; b <= eBar; b++) {
        if (b + actualConfirm - 1 < source.length) {
            let allOk = true;
            for (let offset = 0; offset < actualConfirm; offset++) {
                if (source[b + offset] <= required) { allOk = false; break; }
            }
            if (allOk) return true;
        }
    }
    return false;
}

function smcLayMacroZigZag(
    sourceData: any[], minorZigzag: SmcLayPivot[], breakSrc: string,
    useTickFilter: boolean, tickThreshold: number, confirmCandles: number, opts: any
): { m_vals: number[]; m_bars: number[]; m_dirs: number[]; m_confirms: number[]; stallRescues: number } {
    const closes = sourceData.map((b: any) => b.close);
    const highs = sourceData.map((b: any) => b.high);
    const lows = sourceData.map((b: any) => b.low);

    if (minorZigzag.length < 2) {
        return { m_vals: [], m_bars: [], m_dirs: [], m_confirms: [], stallRescues: 0 };
    }

    const numPoints = minorZigzag.length;
    const baseVals = [...minorZigzag].reverse().map(p => p.price);
    const baseBars = [...minorZigzag].reverse().map(p => p.index);
    const baseDirs = [...minorZigzag].reverse().map(p => p.dir);

    // --- Baslangic noktasi: anchorBar override, yoksa orijinal mutlak-ekstrem mantigi
    let startIdx = 0;
    if (opts.anchorBar && opts.anchorBar > 0) {
        let found = -1;
        for (let i = 0; i < numPoints; i++) {
            if (baseBars[i] >= opts.anchorBar) { found = i; break; }
        }
        startIdx = found === -1 ? 0 : found;
    } else {
        let absoluteHigh = -Infinity, absoluteHighIdx = -1;
        let absoluteLow = Infinity, absoluteLowIdx = -1;
        for (let idx = 0; idx < numPoints; idx++) {
            if (baseDirs[idx] === 1 && baseVals[idx] > absoluteHigh) {
                absoluteHigh = baseVals[idx]; absoluteHighIdx = idx;
            }
            if (baseDirs[idx] === -1 && baseVals[idx] < absoluteLow) {
                absoluteLow = baseVals[idx]; absoluteLowIdx = idx;
            }
        }
        startIdx = (absoluteHighIdx !== -1 && absoluteLowIdx !== -1)
            ? Math.min(absoluteHighIdx, absoluteLowIdx) : 0;
    }

    const m_vals: number[] = [];
    const m_bars: number[] = [];
    const m_dirs: number[] = [];
    const m_confirms: number[] = [];

    let lastLow: number | null = null;
    let lastLowBar = -1;
    let lastHigh: number | null = null;
    let lastHighBar = -1;

    for (let i = startIdx; i < numPoints; i++) {
        if (baseDirs[i] === 1 && lastHigh === null) { lastHigh = baseVals[i]; lastHighBar = baseBars[i]; }
        if (baseDirs[i] === -1 && lastLow === null) { lastLow = baseVals[i]; lastLowBar = baseBars[i]; }
        if (lastHigh !== null && lastLow !== null) break;
    }
    if (lastHigh === null) { lastHigh = baseVals[startIdx]; lastHighBar = baseBars[startIdx]; }
    if (lastLow === null) { lastLow = baseVals[startIdx]; lastLowBar = baseBars[startIdx]; }

    const firstVal = baseVals[startIdx];
    const firstBar = baseBars[startIdx];
    const firstDir = baseDirs[startIdx];

    m_vals.push(firstVal);
    m_bars.push(firstBar);
    m_dirs.push(firstDir);
    m_confirms.push(firstBar);

    // --- latch cozumu icin durum
    let lastPushBar = firstBar;
    let stallRescues = 0;

    const stallBars = Math.max(1, Number(opts.stallBars) || 100);
    const bandDecay = Math.min(0.99, Math.max(0.05, Number(opts.bandDecay) || 0.7));
    const adaptive = !!opts.adaptiveBand;

    for (let idx = startIdx + 1; idx < numPoints; idx++) {
        const val = baseVals[idx];
        const bar = baseBars[idx];
        const pDir = baseDirs[idx];

        // --- Etkin (gate) bant: bekleme suresi uzadikca guncel fiyata dogru daralir.
        // Ham banttan asla genis olamaz -> yalnizca hassasiyet artabilir.
        let gateHigh = lastHigh as number;
        let gateLow = lastLow as number;
        let shrunk = false;
        if (adaptive && lastHigh !== null && lastLow !== null) {
            const stall = bar - lastPushBar;
            if (stall > stallBars) {
                const steps = Math.floor(stall / stallBars);
                const shrink = Math.pow(bandDecay, steps);
                const price = closes[bar];
                const half = ((lastHigh - lastLow) / 2) * shrink;
                const gh = Math.min(lastHigh, price + half);
                const gl = Math.max(lastLow, price - half);
                if (gh < lastHigh || gl > lastLow) {
                    gateHigh = gh;
                    gateLow = gl;
                    shrunk = true;
                }
            }
        }

        if (pDir === -1) { // Low adayi
            if (lastLow === null) {
                lastLow = val;
                lastLowBar = bar;
                if (m_dirs[m_dirs.length - 1] === 1) {
                    m_vals.push(val); m_bars.push(bar); m_dirs.push(-1); m_confirms.push(bar);
                }
                lastPushBar = bar;
            } else if (smcLayBreakBelow(gateLow, lastLowBar, bar, breakSrc, useTickFilter, tickThreshold, closes, lows, confirmCandles)) {
                if (shrunk) stallRescues++;

                let peakVal = -1e10;
                let peakBar = -1;
                if (lastLowBar !== -1) {
                    for (let b = lastLowBar + 1; b < bar; b++) {
                        if (highs[b] > peakVal) { peakVal = highs[b]; peakBar = b; }
                    }
                }

                if (peakBar !== -1) {
                    const breakBar = bar;
                    let isPeakValid = true;
                    if (lastHigh !== null && peakVal > lastHigh) {
                        if (!smcLayBreakAbove(lastHigh, lastHighBar, peakBar, breakSrc, useTickFilter, tickThreshold, closes, highs, confirmCandles)) {
                            isPeakValid = false;
                        }
                    }

                    if (isPeakValid) {
                        if (m_dirs[m_dirs.length - 1] === 1 && lastHighBar !== -1) {
                            let valleyVal = 1e10;
                            let valleyBar = -1;
                            for (let b = lastHighBar + 1; b < peakBar; b++) {
                                if (lows[b] < valleyVal) { valleyVal = lows[b]; valleyBar = b; }
                            }
                            if (valleyBar !== -1) {
                                m_vals.push(valleyVal); m_bars.push(valleyBar); m_dirs.push(-1); m_confirms.push(breakBar);
                                lastLow = valleyVal; lastLowBar = valleyBar;
                            }
                        }
                        m_vals.push(peakVal); m_bars.push(peakBar); m_dirs.push(1); m_confirms.push(breakBar);
                        lastHigh = peakVal; lastHighBar = peakBar;

                        m_vals.push(val); m_bars.push(bar); m_dirs.push(-1); m_confirms.push(breakBar);
                        lastLow = val; lastLowBar = bar;
                    } else {
                        m_vals.push(val); m_bars.push(bar); m_dirs.push(-1); m_confirms.push(breakBar);
                        lastLow = val; lastLowBar = bar;
                    }
                } else {
                    if (m_dirs[m_dirs.length - 1] === -1) {
                        m_vals[m_vals.length - 1] = val;
                        m_bars[m_bars.length - 1] = bar;
                        m_confirms[m_confirms.length - 1] = bar;
                    } else {
                        m_vals.push(val); m_bars.push(bar); m_dirs.push(-1); m_confirms.push(bar);
                    }
                    lastLow = val; lastLowBar = bar;
                }
                lastPushBar = bar;
            }
        } else if (pDir === 1) { // High adayi
            if (lastHigh === null) {
                lastHigh = val;
                lastHighBar = bar;
                if (m_dirs[m_dirs.length - 1] === -1) {
                    m_vals.push(val); m_bars.push(bar); m_dirs.push(1); m_confirms.push(bar);
                }
                lastPushBar = bar;
            } else if (smcLayBreakAbove(gateHigh, lastHighBar, bar, breakSrc, useTickFilter, tickThreshold, closes, highs, confirmCandles)) {
                if (shrunk) stallRescues++;

                let valleyVal = 1e10;
                let valleyBar = -1;
                if (lastHighBar !== -1) {
                    for (let b = lastHighBar + 1; b < bar; b++) {
                        if (lows[b] < valleyVal) { valleyVal = lows[b]; valleyBar = b; }
                    }
                }

                if (valleyBar !== -1) {
                    const breakBar = bar;
                    let isValleyValid = true;
                    if (lastLow !== null && valleyVal < lastLow) {
                        if (!smcLayBreakBelow(lastLow, lastLowBar, valleyBar, breakSrc, useTickFilter, tickThreshold, closes, lows, confirmCandles)) {
                            isValleyValid = false;
                        }
                    }

                    if (isValleyValid) {
                        if (m_dirs[m_dirs.length - 1] === -1 && lastLowBar !== -1) {
                            let peakVal = -1e10;
                            let peakBar = -1;
                            for (let b = lastLowBar + 1; b < valleyBar; b++) {
                                if (highs[b] > peakVal) { peakVal = highs[b]; peakBar = b; }
                            }
                            if (peakBar !== -1) {
                                m_vals.push(peakVal); m_bars.push(peakBar); m_dirs.push(1); m_confirms.push(breakBar);
                                lastHigh = peakVal; lastHighBar = peakBar;
                            }
                        }
                        m_vals.push(valleyVal); m_bars.push(valleyBar); m_dirs.push(-1); m_confirms.push(breakBar);
                        lastLow = valleyVal; lastLowBar = valleyBar;

                        m_vals.push(val); m_bars.push(bar); m_dirs.push(1); m_confirms.push(breakBar);
                        lastHigh = val; lastHighBar = bar;
                    } else {
                        m_vals.push(val); m_bars.push(bar); m_dirs.push(1); m_confirms.push(breakBar);
                        lastHigh = val; lastHighBar = bar;
                    }
                } else {
                    if (m_dirs[m_dirs.length - 1] === 1) {
                        m_vals[m_vals.length - 1] = val;
                        m_bars[m_bars.length - 1] = bar;
                        m_confirms[m_confirms.length - 1] = bar;
                    } else {
                        m_vals.push(val); m_bars.push(bar); m_dirs.push(1); m_confirms.push(bar);
                    }
                    lastHigh = val; lastHighBar = bar;
                }
                lastPushBar = bar;
            }
        }
    }

    // --- Ayni yonlu ardisik pivotlari birlestir
    const clean_vals: number[] = [];
    const clean_bars: number[] = [];
    const clean_dirs: number[] = [];
    const clean_confirms: number[] = [];

    if (m_vals.length > 0) {
        clean_vals.push(m_vals[0]);
        clean_bars.push(m_bars[0]);
        clean_dirs.push(m_dirs[0]);
        clean_confirms.push(m_confirms[0]);

        for (let j = 1; j < m_vals.length; j++) {
            const lastDir = clean_dirs[clean_dirs.length - 1];
            const currDir = m_dirs[j];
            if (currDir !== lastDir) {
                clean_vals.push(m_vals[j]);
                clean_bars.push(m_bars[j]);
                clean_dirs.push(currDir);
                clean_confirms.push(m_confirms[j]);
            } else {
                const lastVal = clean_vals[clean_vals.length - 1];
                const currVal = m_vals[j];
                const better = currDir === 1 ? currVal > lastVal : currVal < lastVal;
                if (better) {
                    clean_vals[clean_vals.length - 1] = currVal;
                    clean_bars[clean_bars.length - 1] = m_bars[j];
                    clean_confirms[clean_confirms.length - 1] = m_confirms[j];
                }
            }
        }
    }

    // --- Pivotlari komsulari arasindaki mutlak ekstreme oturt
    const N = clean_vals.length;
    // Capa varsa son-isleme de onun gerisine gecemez: aksi halde ilk pivot
    // [0, komsu] araliginin mutlak ekstremine oturup capayi deliyor.
    const floorBar = Math.max(0, Math.floor(Number(opts.anchorBar) || 0));
    for (let i = 0; i < N; i++) {
        const currentDir = clean_dirs[i];
        let rangeStart = floorBar;
        let rangeEnd = sourceData.length - 1;
        if (i > 0) rangeStart = Math.max(floorBar, clean_bars[i - 1] + 1);
        if (i < N - 1) rangeEnd = clean_bars[i + 1] - 1;

        if (rangeStart > rangeEnd) {
            const mid = Math.floor((rangeStart + rangeEnd) / 2);
            clean_bars[i] = mid;
            clean_vals[i] = currentDir === 1 ? highs[mid] : lows[mid];
        } else {
            let bestVal = currentDir === 1 ? -Infinity : Infinity;
            let bestBar = clean_bars[i];
            for (let b = rangeStart; b <= rangeEnd; b++) {
                if (currentDir === 1) {
                    if (highs[b] > bestVal) { bestVal = highs[b]; bestBar = b; }
                } else {
                    if (lows[b] < bestVal) { bestVal = lows[b]; bestBar = b; }
                }
            }
            clean_bars[i] = bestBar;
            clean_vals[i] = bestVal;
        }
    }

    return { m_vals: clean_vals, m_bars: clean_bars, m_dirs: clean_dirs, m_confirms: clean_confirms, stallRescues };
}

function smcLayDetectBreaks(
    sourceData: any[], m_vals: number[], m_bars: number[], m_dirs: number[], m_confirms: number[],
    breakSrc: string, useTickFilter: boolean, tickThreshold: number, confirmCandles: number, opts: any
): SmcLayBreak[] {
    const closes = sourceData.map((b: any) => b.close);
    const highs = sourceData.map((b: any) => b.high);
    const lows = sourceData.map((b: any) => b.low);

    const breaks: SmcLayBreak[] = [];
    if (m_vals.length <= 1) return breaks;

    let currentTrend = 0;
    let hasBosInCurrentTrend = true;

    let runningHigh: number | null = null;
    let runningHighBar = -1;
    let runningLow: number | null = null;
    let runningLowBar = -1;

    let candidateHigh: number | null = null;
    let candidateHighBar = -1;
    let candidateLow: number | null = null;
    let candidateLowBar = -1;

    // --- Latch cozumu (macro zigzag'dekiyle ayni mantik, bir kat yukarida).
    // runningHigh/runningLow de yalnizca kirildiklarinda guncellendigi icin, buyuk
    // bir impuls bacagindan sonra BOS/MSB tespiti de kor kaliyordu. Son kirilimdan
    // bu yana stallBars asilirsa, referans olarak mutlak running ekstrem yerine
    // range icindeki en son anlamli swing (candidate) da kabul edilir.
    // Bildirilen level her zaman gercek bir swing fiyatidir, sentetik seviye yok.
    const adaptiveBreaks = !!opts.adaptiveBreaks;
    const stallBars = Math.max(1, Number(opts.stallBars) || 100);
    let lastBreakBar = m_bars[0];

    for (let i = 0; i < m_vals.length; i++) {
        if (m_dirs[i] === 1 && runningHigh === null) { runningHigh = m_vals[i]; runningHighBar = m_bars[i]; }
        if (m_dirs[i] === -1 && runningLow === null) { runningLow = m_vals[i]; runningLowBar = m_bars[i]; }
        if (runningHigh !== null && runningLow !== null) break;
    }

    for (let j = 1; j < m_vals.length; j++) {
        const val = m_vals[j];
        const bar = m_bars[j];
        const pDir = m_dirs[j];
        const confirmBar = m_confirms[j];
        const stalled = adaptiveBreaks && (bar - lastBreakBar) > stallBars;

        if (pDir === 1) {
            let level: number | null = null;
            let levelBar = -1;

            if (runningHigh !== null && val > runningHigh &&
                smcLayBreakAbove(runningHigh, runningHighBar, confirmBar, breakSrc, useTickFilter, tickThreshold, closes, highs, confirmCandles)) {
                level = runningHigh;
                levelBar = runningHighBar;
            } else if (stalled && runningHigh !== null && candidateHigh !== null &&
                candidateHigh < runningHigh && val > candidateHigh &&
                smcLayBreakAbove(candidateHigh, candidateHighBar, confirmBar, breakSrc, useTickFilter, tickThreshold, closes, highs, confirmCandles)) {
                level = candidateHigh;
                levelBar = candidateHighBar;
            }

            if (level !== null) {
                if (currentTrend === -1) {
                    if (hasBosInCurrentTrend) {
                        breaks.push({ type: 'MSB', dir: 'Bullish', level, start_bar: levelBar, end_bar: confirmBar });
                        currentTrend = 1;
                        hasBosInCurrentTrend = false;
                    } else {
                        breaks.push({ type: 'BOS', dir: 'Bullish', level, start_bar: levelBar, end_bar: confirmBar });
                        currentTrend = 1;
                        hasBosInCurrentTrend = true;
                        if (candidateLow !== null) { runningLow = candidateLow; runningLowBar = candidateLowBar; }
                    }
                } else if (currentTrend === 1) {
                    breaks.push({ type: 'BOS', dir: 'Bullish', level, start_bar: levelBar, end_bar: confirmBar });
                    hasBosInCurrentTrend = true;
                    if (candidateLow !== null) { runningLow = candidateLow; runningLowBar = candidateLowBar; }
                } else {
                    currentTrend = 1;
                    hasBosInCurrentTrend = true;
                }

                runningHigh = val;
                runningHighBar = bar;
                candidateHigh = null; candidateHighBar = -1;
                candidateLow = null; candidateLowBar = -1;
                lastBreakBar = bar;
                continue;
            }

            if (candidateHigh === null || val > candidateHigh) { candidateHigh = val; candidateHighBar = bar; }
        } else if (pDir === -1) {
            let level: number | null = null;
            let levelBar = -1;

            if (runningLow !== null && val < runningLow &&
                smcLayBreakBelow(runningLow, runningLowBar, confirmBar, breakSrc, useTickFilter, tickThreshold, closes, lows, confirmCandles)) {
                level = runningLow;
                levelBar = runningLowBar;
            } else if (stalled && runningLow !== null && candidateLow !== null &&
                candidateLow > runningLow && val < candidateLow &&
                smcLayBreakBelow(candidateLow, candidateLowBar, confirmBar, breakSrc, useTickFilter, tickThreshold, closes, lows, confirmCandles)) {
                level = candidateLow;
                levelBar = candidateLowBar;
            }

            if (level !== null) {
                if (currentTrend === 1) {
                    if (hasBosInCurrentTrend) {
                        breaks.push({ type: 'MSB', dir: 'Bearish', level, start_bar: levelBar, end_bar: confirmBar });
                        currentTrend = -1;
                        hasBosInCurrentTrend = false;
                    } else {
                        breaks.push({ type: 'BOS', dir: 'Bearish', level, start_bar: levelBar, end_bar: confirmBar });
                        currentTrend = -1;
                        hasBosInCurrentTrend = true;
                        if (candidateHigh !== null) { runningHigh = candidateHigh; runningHighBar = candidateHighBar; }
                    }
                } else if (currentTrend === -1) {
                    breaks.push({ type: 'BOS', dir: 'Bearish', level, start_bar: levelBar, end_bar: confirmBar });
                    hasBosInCurrentTrend = true;
                    if (candidateHigh !== null) { runningHigh = candidateHigh; runningHighBar = candidateHighBar; }
                } else {
                    currentTrend = -1;
                    hasBosInCurrentTrend = true;
                }

                runningLow = val;
                runningLowBar = bar;
                candidateHigh = null; candidateHighBar = -1;
                candidateLow = null; candidateLowBar = -1;
                lastBreakBar = bar;
                continue;
            }

            if (candidateLow === null || val < candidateLow) { candidateLow = val; candidateLowBar = bar; }
        }
    }

    return breaks;
}

function smcLayTriangle(ctx: any, x: number, y: number, size: number, direction: string): void {
    ctx.beginPath();
    if (direction === 'up') {
        ctx.moveTo(x, y);
        ctx.lineTo(x - size, y + size * 1.5);
        ctx.lineTo(x + size, y + size * 1.5);
    } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x - size, y - size * 1.5);
        ctx.lineTo(x + size, y - size * 1.5);
    }
    ctx.closePath();
    ctx.fill();
}

function smcLayRoundRect(ctx: any, x: number, y: number, width: number, height: number, radius: number): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}


// ============================================================
//  Katmanli yapi:  L1 (macro)  ->  L2  ->  L3
//  Alt katman esigi, UST bacagin genligine oranli:  T = |bacak| * ratio
//  Boylece esik kuresel bir sabit degil; 1200 puanlik bir L1 bacaginda
//  ~300 puanlik alt dalgalar, 230 puanlik bir bacakta ~58 puanlik alt
//  dalgalar yakalanir. Sabit periyot / sabit ATR esigi bunu yapamaz.
// ============================================================

interface SmcLayChain {
    vals: number[];
    bars: number[];
    dirs: number[];
    /** Bu indeksten itibaren pivotlar HENUZ TAMAMLANMAMIS ust bacagin icinde:
     *  yeni bar geldikce yer degistirebilirler (repaint bolgesi). */
    provisionalFrom: number;
}

function smcLayEmptyChain(): SmcLayChain {
    return { vals: [], bars: [], dirs: [], provisionalFrom: 0 };
}

/** Zincire pivot ekler; ayni bar veya ayni yon ardarda gelirse daha ekstrem olani tutar. */
function smcLayPush(c: SmcLayChain, val: number, bar: number, dir: number): void {
    const k = c.vals.length - 1;
    if (k >= 0 && (c.bars[k] === bar || c.dirs[k] === dir)) {
        if ((dir === 1 && val > c.vals[k]) || (dir === -1 && val < c.vals[k])) {
            c.vals[k] = val;
            c.bars[k] = bar;
            c.dirs[k] = dir;
        }
        return;
    }
    c.vals.push(val);
    c.bars.push(bar);
    c.dirs.push(dir);
}

/**
 * Ust katmanin her bacagi icin, o bacagin genligine oranli esikle minor
 * pivotlari filtreleyip alt katman zincirini kurar.
 */
function smcLaySubLayer(
    sourceData: any[],
    minorChron: SmcLayPivot[],
    parent: SmcLayChain,
    ratio: number,
    minBars: number
): SmcLayChain {
    const out = smcLayEmptyChain();
    const n = parent.bars.length;
    if (n < 1 || !(ratio > 0)) return out;

    const segs: number[][] = []; // [startBar, endBar, amplitude]
    for (let i = 0; i + 1 < n; i++) {
        segs.push([parent.bars[i], parent.bars[i + 1], Math.abs(parent.vals[i + 1] - parent.vals[i])]);
    }

    // Devam eden (onaylanmamis) bacak: son parent pivotundan son bara.
    // Genligi henuz kesin degil, o yuzden su ana kadarki aralik kullaniliyor.
    let provisionalSeg = -1;
    const lastBar = parent.bars[n - 1];
    if (lastBar < sourceData.length - 1) {
        let hi = -Infinity;
        let lo = Infinity;
        for (let b = lastBar; b < sourceData.length; b++) {
            if (sourceData[b].high > hi) hi = sourceData[b].high;
            if (sourceData[b].low < lo) lo = sourceData[b].low;
        }
        provisionalSeg = segs.length;
        segs.push([lastBar, sourceData.length - 1, hi - lo]);
    }

    out.provisionalFrom = -1;

    for (let s = 0; s < segs.length; s++) {
        if (s === provisionalSeg) out.provisionalFrom = out.vals.length;

        const sb = segs[s][0];
        const eb = segs[s][1];
        const T = segs[s][2] * ratio;
        if (!(T > 0) || eb <= sb) continue;

        // Genlik-filtreli zigzag: kosan ekstremi tut, ters yonde T kadar
        // geri cekilme olunca ekstremi pivot olarak kaydet.
        let curDir = 0;
        let extVal = 0;
        let extBar = -1;

        for (let k = 0; k < minorChron.length; k++) {
            const p = minorChron[k];
            if (p.index < sb) continue;
            if (p.index > eb) break;

            if (curDir === 0) {
                curDir = p.dir;
                extVal = p.price;
                extBar = p.index;
                continue;
            }
            if (p.dir === curDir) {
                if ((curDir === 1 && p.price > extVal) || (curDir === -1 && p.price < extVal)) {
                    extVal = p.price;
                    extBar = p.index;
                }
            } else if (Math.abs(p.price - extVal) >= T && (p.index - extBar) >= minBars) {
                smcLayPush(out, extVal, extBar, curDir);
                curDir = p.dir;
                extVal = p.price;
                extBar = p.index;
            }
        }
        if (extBar !== -1) smcLayPush(out, extVal, extBar, curDir);
    }

    if (out.provisionalFrom < 0) out.provisionalFrom = out.vals.length;
    return out;
}

/**
 * Dow'un hacim onayi: bacak yonundeki barlarin hacmi, karsi yondekileri
 * asiyor mu? >= volConfirmRatio ise bacak teyitli sayilir.
 */
function smcLayLegVolumeRatio(sourceData: any[], b0: number, b1: number, dir: number): number {
    let withV = 0;
    let againstV = 0;
    for (let b = b0 + 1; b <= b1 && b < sourceData.length; b++) {
        const bar = sourceData[b];
        const v = Number(bar.volume) || 0;
        const up = bar.close >= bar.open;
        if ((dir === 1 && up) || (dir === -1 && !up)) withV += v;
        else againstV += v;
    }
    if (againstV <= 0) return withV > 0 ? 99 : 1;
    return withV / againstV;
}

function smcLayDrawChain(
    ctx: any, timeScale: any, priceScale: any, hpr: number, vpr: number,
    chain: SmcLayChain, color: string, width: number, dash: number[]
): void {
    if (chain.vals.length < 2) return;

    const stroke = (from: number, to: number, alpha: number) => {
        if (to - from < 1) return;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = width * hpr;
        ctx.setLineDash(dash.map(d => d * hpr));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = from; i <= to; i++) {
            const x = timeScale.indexToCoordinate(chain.bars[i]) * hpr;
            const y = priceScale.priceToCoordinate(chain.vals[i]) * vpr;
            if (i === from) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
    };

    const pf = Math.max(0, Math.min(chain.vals.length, chain.provisionalFrom));
    stroke(0, pf - 1, 1);
    // Onaylanmamis ust bacagin icindeki kisim: solgun cizilir (repaint bolgesi)
    stroke(Math.max(0, pf - 1), chain.vals.length - 1, 0.45);
}

// ============================================================
//  Cizimden capa
//  Draft'in DrawingManager'a dogrudan erisimi yok (sayfa kapanisinda,
//  window'da degil). Ama demo sayfasi window.__agentBridge.handleCommand'i
//  disari aciyor; cizimler oradan asenkron okunup onbellege alinir.
//  Kural: eslesen SON cizilen sekil capadir.
// ============================================================

let smcLayDrawings: any[] = [];
let smcLayFetchAt = 0;
let smcLayFetching = false;

function smcLayFetchDrawings(onChange: () => void, minGapMs: number): void {
    const bridge = (globalThis as any).__agentBridge;
    if (!bridge || typeof bridge.handleCommand !== 'function') return;
    const now = Date.now();
    if (smcLayFetching || now - smcLayFetchAt < minGapMs) return;
    smcLayFetching = true;
    Promise.resolve(bridge.handleCommand({ tool: 'list_drawings' }))
        .then((res: any) => {
            smcLayFetchAt = Date.now();
            const next = (res && res.drawings) || [];
            const key = (l: any[]) => l.map((d: any) =>
                `${d.id}:${d.type}:${d.points && d.points[0] ? d.points[0].time : ''}`).join('|');
            const changed = key(next) !== key(smcLayDrawings);
            smcLayDrawings = next;
            if (changed) onChange();
        })
        .catch(() => { smcLayFetchAt = Date.now(); })
        .then(() => { smcLayFetching = false; });
}

/** Eslesen son cizimin ilk noktasi. */
function smcLayDrawingAnchor(typesCsv: string): { time: number; price: number } | null {
    const types = String(typesCsv || '')
        .split(',').map(t => t.trim()).filter(t => t.length > 0);
    let best: { time: number; price: number } | null = null;
    for (const d of smcLayDrawings) {
        if (!d || d.visible === false) continue;
        if (types.length > 0 && types.indexOf(d.type) < 0) continue;
        const p = d.points && d.points[0];
        if (!p || typeof p.time !== 'number') continue;
        best = { time: p.time, price: Number(p.price) || 0 };
    }
    return best;
}

class SMCLayeredIndicator extends OverlayIndicator {
    private _o: any;
    private _minor: SmcLayPivot[] = [];
    private _base: SmcLayPivot[] = [];
    private _l1: SmcLayChain = smcLayEmptyChain();
    private _l2: SmcLayChain = smcLayEmptyChain();
    private _l3: SmcLayChain = smcLayEmptyChain();
    private _breaks: SmcLayBreak[] = [];
    private _l2Breaks: SmcLayBreak[] = [];
    private _volOk: boolean[] = [];
    private _anchor = 0;
    private _anchorPrice = 0;
    private _anchorSrc = '';
    private _pollTimer: any = null;
    private _lastAnchorTime = -1;

    constructor(options: any = {}) {
        const merged = { ...SMC_LAY_DEFAULTS, ...options, name: 'SMC Layered' };
        super(merged);
        this._o = { ...SMC_LAY_DEFAULTS, ...this._options, name: 'SMC Layered' };
        this._startAnchorPoll();
    }

    /** Cizim degisimini yakalamak icin hafif yoklama. destroy()'da temizlenir. */
    private _startAnchorPoll(): void {
        const ms = Math.max(200, Number(this._o.anchorPollMs) || 800);
        this._pollTimer = setInterval(() => {
            if (!this._o.anchorFromDrawing) return;
            smcLayFetchDrawings(() => {
                const d = smcLayDrawingAnchor(this._o.anchorDrawingTypes);
                const t = d ? d.time : (Number(this._o.anchorTime) || 0);
                if (t === this._lastAnchorTime) return;   // degismediyse yeniden hesaplama
                if (this._sourceData && this._sourceData.length > 0) {
                    this.calculate(this._sourceData);
                    if (this._dataChanged) this._dataChanged.fire();
                }
            }, ms / 2);
        }, ms);
    }

    destroy(): void {
        if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
        if (super.destroy) super.destroy();
    }

    protected _getAllOptions(): any {
        return { ...this._o };
    }

    updateOptions(newOptions: any): boolean {
        const n = { ...newOptions };
        const numKeys = ['period', 'basePeriod', 'tickMult', 'tickSize', 'confirmCandles', 'stallBars', 'bandDecay',
            'anchorBar', 'anchorTime', 'anchorSnapBars', 'anchorPollMs', 'l2Ratio', 'l2MinBars', 'l3Ratio', 'l3MinBars', 'volConfirmRatio'];
        for (const k of numKeys) {
            if (n[k] !== undefined) n[k] = Number(n[k]);
        }
        const recalcKeys = numKeys.concat(['pivotSrc', 'breakSrc', 'macroSrc', 'useTickFilter',
            'adaptiveBand', 'adaptiveBreaks', 'anchorDir', 'anchorFromDrawing', 'anchorDrawingTypes', 'showL2', 'showL3', 'showL2Breaks', 'debugEmit']);
        let needsRecalc = false;
        for (const k of recalcKeys) {
            if (n[k] !== undefined) { needsRecalc = true; break; }
        }
        Object.assign(this._o, n);
        Object.assign(this._options, n);
        if (this._dataChanged) this._dataChanged.fire();
        return needsRecalc;
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value });
        if (needsRecalc && this._sourceData && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        return needsRecalc;
    }

    /**
     * Kullanicinin verdigi capayi gercek bir dip/tepe barina oturtur.
     * anchorTime oncelikli; sonra anchorBar. 0 donerse capa kapali.
     */
    private _resolveAnchor(sourceData: any[]): number {
        let t = Number(this._o.anchorTime) || 0;
        this._anchorSrc = t > 0 ? 'time' : 'bar';

        if (this._o.anchorFromDrawing) {
            const d = smcLayDrawingAnchor(this._o.anchorDrawingTypes);
            if (d) { t = d.time; this._anchorSrc = 'drawing'; }
        }
        this._lastAnchorTime = t;

        let a = 0;

        if (t > 0) {
            // Zamandan bar indeksi: time <= t olan en buyuk bar
            let lo = 0;
            let hi = sourceData.length - 1;
            a = 0;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (sourceData[mid].time <= t) { a = mid; lo = mid + 1; } else { hi = mid - 1; }
            }
        } else {
            a = Math.floor(Number(this._o.anchorBar) || 0);
        }

        if (a <= 0 || a >= sourceData.length - 1) {
            this._anchorPrice = 0;
            return 0;
        }

        // Verilen noktanin etrafindaki pencerede gercek ekstreme oturt
        const snap = Math.max(0, Math.floor(Number(this._o.anchorSnapBars) || 0));
        if (snap > 0) {
            const lo = Math.max(0, a - snap);
            const hi = Math.min(sourceData.length - 1, a + snap);
            let loBar = a;
            let loVal = Infinity;
            let hiBar = a;
            let hiVal = -Infinity;
            for (let b = lo; b <= hi; b++) {
                if (sourceData[b].low < loVal) { loVal = sourceData[b].low; loBar = b; }
                if (sourceData[b].high > hiVal) { hiVal = sourceData[b].high; hiBar = b; }
            }
            const dir = String(this._o.anchorDir || 'auto');
            if (dir === 'low') { a = loBar; this._anchorPrice = loVal; }
            else if (dir === 'high') { a = hiBar; this._anchorPrice = hiVal; }
            else {
                // auto: istenen bara daha yakin olan ekstremi sec
                const dLo = Math.abs(loBar - a);
                const dHi = Math.abs(hiBar - a);
                if (dLo <= dHi) { a = loBar; this._anchorPrice = loVal; }
                else { a = hiBar; this._anchorPrice = hiVal; }
            }
        } else {
            this._anchorPrice = sourceData[a].close;
        }

        return a;
    }

    calculate(sourceData: any[]): void {
        this._sourceData = sourceData;
        if (!sourceData || sourceData.length < this._o.period) {
            this._minor = [];
            this._base = [];
            this._l1 = smcLayEmptyChain();
            this._l2 = smcLayEmptyChain();
            this._l3 = smcLayEmptyChain();
            this._breaks = [];
            this._l2Breaks = [];
            this._volOk = [];
            this._anchor = 0;
            this._data = [];
            return;
        }

        // --- Capa: buradan oncesi tamamen yok sayilir
        this._anchor = this._resolveAnchor(sourceData);
        const anchor = this._anchor;
        const opts = { ...this._o, anchorBar: anchor };

        let tickSize = Number(this._o.tickSize);
        if (!(tickSize > 0)) tickSize = smcLayEstimateTickSize(sourceData, anchor);
        const tickThreshold = Number(this._o.tickMult) * tickSize;

        // --- L1: macro zincir (adaptif bant duzeltmesiyle)
        this._minor = smcLayMinorZigZag(sourceData, Number(this._o.period), this._o.pivotSrc, anchor);
        const macro = smcLayMacroZigZag(
            sourceData, this._minor, this._o.macroSrc, !!this._o.useTickFilter,
            tickThreshold, Number(this._o.confirmCandles), opts
        );
        this._l1 = {
            vals: macro.m_vals, bars: macro.m_bars, dirs: macro.m_dirs,
            provisionalFrom: macro.m_vals.length,
        };
        this._breaks = smcLayDetectBreaks(
            sourceData, macro.m_vals, macro.m_bars, macro.m_dirs, macro.m_confirms,
            this._o.breakSrc, !!this._o.useTickFilter, tickThreshold,
            Number(this._o.confirmCandles), opts
        );

        // --- L2 / L3: ust bacagin genligine oranli esikle.
        // Taban havuz L1'inkinden daha ince bir periyottan gelir.
        const basePrd = Math.max(2, Number(this._o.basePeriod) || 5);
        this._base = basePrd === Number(this._o.period)
            ? this._minor
            : smcLayMinorZigZag(sourceData, basePrd, this._o.pivotSrc, anchor);
        const minorChron = [...this._base].reverse();

        this._l2 = this._o.showL2
            ? smcLaySubLayer(sourceData, minorChron, this._l1, Number(this._o.l2Ratio), Number(this._o.l2MinBars))
            : smcLayEmptyChain();

        this._l2Breaks = (this._o.showL2 && this._o.showL2Breaks && this._l2.vals.length > 1)
            ? smcLayDetectBreaks(
                sourceData, this._l2.vals, this._l2.bars, this._l2.dirs, this._l2.bars,
                this._o.breakSrc, !!this._o.useTickFilter, tickThreshold,
                Number(this._o.confirmCandles), opts)
            : [];

        this._l3 = (this._o.showL3 && this._l2.vals.length > 1)
            ? smcLaySubLayer(sourceData, minorChron, this._l2, Number(this._o.l3Ratio), Number(this._o.l3MinBars))
            : smcLayEmptyChain();

        // --- Hacim onayi (L1 bacaklari)
        this._volOk = [];
        const minRatio = Number(this._o.volConfirmRatio) || 1;
        for (let i = 0; i + 1 < this._l1.bars.length; i++) {
            const r = smcLayLegVolumeRatio(sourceData, this._l1.bars[i], this._l1.bars[i + 1], this._l1.dirs[i + 1]);
            this._volOk.push(r >= minRatio);
        }

        // --- Cikti / teshis
        const emit = String(this._o.debugEmit || '');
        const chainOut = (c: SmcLayChain) => c.bars.map((b: number, i: number) => ({
            time: sourceData[b].time, value: c.vals[i], values: [c.dirs[i]],
        }));
        const breaksOut = (bs: SmcLayBreak[]) => bs.map((b: SmcLayBreak) => ({
            time: sourceData[b.end_bar].time,
            value: b.level,
            values: [b.type === 'MSB' ? 1 : 0, b.dir === 'Bullish' ? 1 : -1, b.start_bar, b.end_bar],
        }));

        if (emit === 'stats') {
            // Tek noktada sayimlar: [minor, L1, L2, L3, L1 kirilim, L2 kirilim, hacim-teyitli L1 bacagi]
            const volOkCount = this._volOk.filter((x: boolean) => x).length;
            this._data = [{
                time: sourceData[sourceData.length - 1].time,
                value: 0,
                values: [this._base.length, this._l1.vals.length, this._l2.vals.length,
                    this._l3.vals.length, this._breaks.length, this._l2Breaks.length,
                    volOkCount, this._volOk.length, this._anchor],
            }];
        } else if (emit === 'l2') this._data = chainOut(this._l2);
        else if (emit === 'l3') this._data = chainOut(this._l3);
        else if (emit === 'breaks') this._data = breaksOut(this._breaks);
        else if (emit === 'l2breaks') this._data = breaksOut(this._l2Breaks);
        else this._data = chainOut(this._l1);

        console.log(`[SMC Layered] minor=${this._minor.length} base=${this._base.length} L1=${this._l1.vals.length} L2=${this._l2.vals.length} L3=${this._l3.vals.length} breaks=${this._breaks.length} l2breaks=${this._l2Breaks.length}`);
    }

    getRange(): any {
        if (!this._sourceData || this._sourceData.length === 0) return { min: 0, max: 100 };
        let min = Infinity;
        let max = -Infinity;
        for (const bar of this._sourceData) {
            min = Math.min(min, bar.low);
            max = Math.max(max, bar.high);
        }
        return { min, max };
    }

    getDescription(): string {
        const a = this._anchor > 0 ? ` | anchor @${this._anchor} (${this._anchorSrc})` : ' | anchor yok';
        return `SMC Layered (${this._o.period} | L2 ${this._o.l2Ratio} | L3 ${this._o.l3Ratio}${a})`;
    }

    private _drawBreakLabels(ctx: any, timeScale: any, priceScale: any, hpr: number, vpr: number,
        list: SmcLayBreak[], major: boolean): void {
        const fontPx = major ? 10 : 8;
        for (const b of list) {
            if (b.type === 'BOS' && !this._o.showBOS) continue;
            if (b.type === 'MSB' && !this._o.showMSB) continue;

            const startX = timeScale.indexToCoordinate(b.start_bar) * hpr;
            const endX = timeScale.indexToCoordinate(b.end_bar) * hpr;
            const y = priceScale.priceToCoordinate(b.level) * vpr;
            const color = b.dir === 'Bullish' ? this._o.bullishColor : this._o.bearishColor;

            ctx.save();
            ctx.globalAlpha = major ? 1 : 0.65;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1 * hpr;
            ctx.setLineDash([2 * hpr, 2 * hpr]);
            ctx.beginPath();
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
            ctx.stroke();
            ctx.restore();

            const bar = this._sourceData[b.end_bar];
            if (!bar) continue;

            const labelText = major
                ? `${b.type} (${b.dir === 'Bullish' ? 'BULL' : 'BEAR'})`
                : b.type.toLowerCase();

            ctx.save();
            ctx.globalAlpha = major ? 1 : 0.8;
            ctx.font = `bold ${fontPx * hpr}px sans-serif`;
            const textWidth = ctx.measureText(labelText).width;
            const textHeight = (fontPx + 2) * vpr;
            const gap = (major ? 8 : 4) * vpr;

            if (b.dir === 'Bullish') {
                const arrowY = priceScale.priceToCoordinate(bar.high) * vpr - gap;
                ctx.fillStyle = color;
                smcLayTriangle(ctx, endX, arrowY, (major ? 5 : 3) * hpr, 'up');
                const textY = arrowY - (major ? 14 : 10) * vpr;
                smcLayRoundRect(ctx, endX - textWidth / 2 - 4 * hpr, textY - 2 * vpr, textWidth + 8 * hpr, textHeight + 4 * vpr, 3 * hpr);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelText, endX, textY + textHeight / 2);
            } else {
                const arrowY = priceScale.priceToCoordinate(bar.low) * vpr + gap;
                ctx.fillStyle = color;
                smcLayTriangle(ctx, endX, arrowY, (major ? 5 : 3) * hpr, 'down');
                const textY = arrowY + (major ? 8 : 5) * vpr;
                smcLayRoundRect(ctx, endX - textWidth / 2 - 4 * hpr, textY - 2 * vpr, textWidth + 8 * hpr, textHeight + 4 * vpr, 3 * hpr);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelText, endX, textY + textHeight / 2);
            }
            ctx.restore();
        }
    }

    drawOverlay(ctx: any, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        if (!this._sourceData || this._sourceData.length === 0) return;

        // minor zigzag (en altta, cok solgun)
        if (this._o.showMinorZigZag && this._minor.length >= 2) {
            ctx.save();
            ctx.strokeStyle = this._o.minorColor;
            ctx.lineWidth = 1 * hpr;
            ctx.setLineDash([3 * hpr, 3 * hpr]);
            ctx.beginPath();
            for (let i = this._minor.length - 1; i >= 0; i--) {
                const p = this._minor[i];
                const x = timeScale.indexToCoordinate(p.index) * hpr;
                const y = priceScale.priceToCoordinate(p.price) * vpr;
                if (i === this._minor.length - 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.restore();
        }

        // Capa isareti: takibin basladigi yer
        if (this._o.showAnchor && this._anchor > 0) {
            const ax = timeScale.indexToCoordinate(this._anchor) * hpr;
            ctx.save();
            ctx.strokeStyle = this._o.anchorColor;
            ctx.lineWidth = 1.5 * hpr;
            ctx.setLineDash([5 * hpr, 4 * hpr]);
            ctx.beginPath();
            ctx.moveTo(ax, 0);
            ctx.lineTo(ax, ctx.canvas ? ctx.canvas.height : 10000);
            ctx.stroke();
            ctx.setLineDash([]);
            if (this._anchorPrice > 0) {
                const ay = priceScale.priceToCoordinate(this._anchorPrice) * vpr;
                ctx.fillStyle = this._o.anchorColor;
                ctx.beginPath();
                ctx.arc(ax, ay, 5 * hpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.font = `bold ${10 * hpr}px sans-serif`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText('ANCHOR', ax + 8 * hpr, ay);
            }
            ctx.restore();
        }

        // L3 -> L2 -> L1 (ustte kalin olan)
        if (this._o.showL3) {
            smcLayDrawChain(ctx, timeScale, priceScale, hpr, vpr, this._l3, this._o.l3Color, 1, [2, 3]);
        }
        if (this._o.showL2) {
            smcLayDrawChain(ctx, timeScale, priceScale, hpr, vpr, this._l2, this._o.l2Color, 1.5, [6, 3]);
        }
        if (this._o.showMacroZigZag) {
            smcLayDrawChain(ctx, timeScale, priceScale, hpr, vpr, this._l1, this._o.macroColor, Number(this._o.lineWidth) || 2, []);
        }

        // Hacim onayi: L1 bacaklarinin ortasinda kucuk daire (dolu = teyitli)
        if (this._o.showVolumeConfirm) {
            for (let i = 0; i + 1 < this._l1.bars.length && i < this._volOk.length; i++) {
                const x0 = timeScale.indexToCoordinate(this._l1.bars[i]);
                const y0 = priceScale.priceToCoordinate(this._l1.vals[i]);
                const x1 = timeScale.indexToCoordinate(this._l1.bars[i + 1]);
                const y1 = priceScale.priceToCoordinate(this._l1.vals[i + 1]);
                const cx = ((x0 + x1) / 2) * hpr;
                const cy = ((y0 + y1) / 2) * vpr;

                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, cy, 3.5 * hpr, 0, Math.PI * 2);
                if (this._volOk[i]) {
                    ctx.fillStyle = this._o.macroColor;
                    ctx.fill();
                } else {
                    ctx.strokeStyle = this._o.macroColor;
                    ctx.lineWidth = 1.2 * hpr;
                    ctx.setLineDash([]);
                    ctx.stroke();
                }
                ctx.restore();
            }
        }

        if (this._o.showL2 && this._o.showL2Breaks) {
            this._drawBreakLabels(ctx, timeScale, priceScale, hpr, vpr, this._l2Breaks, false);
        }
        this._drawBreakLabels(ctx, timeScale, priceScale, hpr, vpr, this._breaks, true);
    }
}

globalThis.__draftIndicatorClass = SMCLayeredIndicator;
