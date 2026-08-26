declare const OverlayIndicator: any;

// SMC Adaptive (dev)
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

interface SmcAdpPivot {
    price: number;
    index: number;
    dir: number; // 1 = High, -1 = Low
    time: number;
}

interface SmcAdpBreak {
    type: string; // 'BOS' | 'MSB'
    dir: string;  // 'Bullish' | 'Bearish'
    level: number;
    start_bar: number;
    end_bar: number;
}

const SMC_ADP_DEFAULTS: any = {
    name: 'SMC Adaptive',
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
    anchorBar: 0,
    emitBreaks: false,
    adaptiveBreaks: true,
    // --------------------
    showMinorZigZag: true,
    showMacroZigZag: true,
    showBOS: true,
    showMSB: true,
    minorColor: 'rgba(41, 98, 255, 0.35)',
    macroColor: '#ff9800',
    bullishColor: '#008080',
    bearishColor: '#ef4444',
    lineWidth: 2,
};

function smcAdpEstimateTickSize(data: any[]): number {
    let minDiff = Infinity;
    const len = Math.min(data.length, 100);
    for (let i = 1; i < len; i++) {
        const diff = Math.abs(data[i].close - data[i - 1].close);
        if (diff > 0 && diff < minDiff) {
            minDiff = diff;
        }
    }
    return minDiff === Infinity ? 0.01 : minDiff;
}

function smcAdpMinorZigZag(sourceData: any[], prd: number, pivotSrc: string): SmcAdpPivot[] {
    const highs = sourceData.map((b: any) => pivotSrc === 'Close' ? b.close : b.high);
    const lows = sourceData.map((b: any) => pivotSrc === 'Close' ? b.close : b.low);

    const zigzag: SmcAdpPivot[] = [];
    let dirVal = 0;

    for (let i = 0; i < sourceData.length; i++) {
        const startLookback = Math.max(0, i - prd + 1);

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

function smcAdpBreakBelow(
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

function smcAdpBreakAbove(
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

function smcAdpMacroZigZag(
    sourceData: any[], minorZigzag: SmcAdpPivot[], breakSrc: string,
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
            } else if (smcAdpBreakBelow(gateLow, lastLowBar, bar, breakSrc, useTickFilter, tickThreshold, closes, lows, confirmCandles)) {
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
                        if (!smcAdpBreakAbove(lastHigh, lastHighBar, peakBar, breakSrc, useTickFilter, tickThreshold, closes, highs, confirmCandles)) {
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
            } else if (smcAdpBreakAbove(gateHigh, lastHighBar, bar, breakSrc, useTickFilter, tickThreshold, closes, highs, confirmCandles)) {
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
                        if (!smcAdpBreakBelow(lastLow, lastLowBar, valleyBar, breakSrc, useTickFilter, tickThreshold, closes, lows, confirmCandles)) {
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
    for (let i = 0; i < N; i++) {
        const currentDir = clean_dirs[i];
        let rangeStart = 0;
        let rangeEnd = sourceData.length - 1;
        if (i > 0) rangeStart = clean_bars[i - 1] + 1;
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

function smcAdpDetectBreaks(
    sourceData: any[], m_vals: number[], m_bars: number[], m_dirs: number[], m_confirms: number[],
    breakSrc: string, useTickFilter: boolean, tickThreshold: number, confirmCandles: number, opts: any
): SmcAdpBreak[] {
    const closes = sourceData.map((b: any) => b.close);
    const highs = sourceData.map((b: any) => b.high);
    const lows = sourceData.map((b: any) => b.low);

    const breaks: SmcAdpBreak[] = [];
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
                smcAdpBreakAbove(runningHigh, runningHighBar, confirmBar, breakSrc, useTickFilter, tickThreshold, closes, highs, confirmCandles)) {
                level = runningHigh;
                levelBar = runningHighBar;
            } else if (stalled && runningHigh !== null && candidateHigh !== null &&
                candidateHigh < runningHigh && val > candidateHigh &&
                smcAdpBreakAbove(candidateHigh, candidateHighBar, confirmBar, breakSrc, useTickFilter, tickThreshold, closes, highs, confirmCandles)) {
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
                smcAdpBreakBelow(runningLow, runningLowBar, confirmBar, breakSrc, useTickFilter, tickThreshold, closes, lows, confirmCandles)) {
                level = runningLow;
                levelBar = runningLowBar;
            } else if (stalled && runningLow !== null && candidateLow !== null &&
                candidateLow > runningLow && val < candidateLow &&
                smcAdpBreakBelow(candidateLow, candidateLowBar, confirmBar, breakSrc, useTickFilter, tickThreshold, closes, lows, confirmCandles)) {
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

function smcAdpTriangle(ctx: any, x: number, y: number, size: number, direction: string): void {
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

function smcAdpRoundRect(ctx: any, x: number, y: number, width: number, height: number, radius: number): void {
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

class SMCAdaptiveIndicator extends OverlayIndicator {
    private _o: any;
    private _minorZigzag: SmcAdpPivot[] = [];
    private _macroVals: number[] = [];
    private _macroBars: number[] = [];
    private _breaks: SmcAdpBreak[] = [];
    private _stallRescues = 0;

    constructor(options: any = {}) {
        const merged = { ...SMC_ADP_DEFAULTS, ...options, name: 'SMC Adaptive' };
        super(merged);
        this._o = { ...SMC_ADP_DEFAULTS, ...this._options, name: 'SMC Adaptive' };
    }

    protected _getAllOptions(): any {
        return { ...this._o };
    }

    updateOptions(newOptions: any): boolean {
        const n = { ...newOptions };
        const numKeys = ['period', 'tickMult', 'tickSize', 'confirmCandles', 'stallBars', 'bandDecay', 'anchorBar'];
        for (const k of numKeys) {
            if (n[k] !== undefined) n[k] = Number(n[k]);
        }

        const recalcKeys = numKeys.concat(['pivotSrc', 'breakSrc', 'macroSrc', 'useTickFilter', 'adaptiveBand', 'adaptiveBreaks', 'emitBreaks']);
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

    calculate(sourceData: any[]): void {
        this._sourceData = sourceData;
        if (!sourceData || sourceData.length < this._o.period) {
            this._minorZigzag = [];
            this._macroVals = [];
            this._macroBars = [];
            this._breaks = [];
            this._data = [];
            return;
        }

        let tickSize = Number(this._o.tickSize);
        if (!(tickSize > 0)) tickSize = smcAdpEstimateTickSize(sourceData);
        const tickThreshold = Number(this._o.tickMult) * tickSize;

        this._minorZigzag = smcAdpMinorZigZag(sourceData, Number(this._o.period), this._o.pivotSrc);

        const macro = smcAdpMacroZigZag(
            sourceData,
            this._minorZigzag,
            this._o.macroSrc,
            !!this._o.useTickFilter,
            tickThreshold,
            Number(this._o.confirmCandles),
            this._o
        );

        this._macroVals = macro.m_vals;
        this._macroBars = macro.m_bars;
        this._stallRescues = macro.stallRescues;

        this._breaks = smcAdpDetectBreaks(
            sourceData,
            macro.m_vals, macro.m_bars, macro.m_dirs, macro.m_confirms,
            this._o.breakSrc,
            !!this._o.useTickFilter,
            tickThreshold,
            Number(this._o.confirmCandles),
            this._o
        );

        if (this._o.emitBreaks) {
            // Teshis modu: _data = BOS/MSB listesi.
            // values = [type (0=BOS, 1=MSB), dir (1=Bullish, -1=Bearish), start_bar, end_bar]
            this._data = this._breaks.map((b: SmcAdpBreak) => ({
                time: sourceData[b.end_bar].time,
                value: b.level,
                values: [b.type === 'MSB' ? 1 : 0, b.dir === 'Bullish' ? 1 : -1, b.start_bar, b.end_bar],
            }));
        } else {
            this._data = macro.m_bars.map((barIdx: number, i: number) => ({
                time: sourceData[barIdx].time,
                value: macro.m_vals[i],
            }));
        }

        console.log(`[SMC Adaptive] minor: ${this._minorZigzag.length}, macro: ${this._macroVals.length}, breaks: ${this._breaks.length}, stall-rescues: ${this._stallRescues}`);
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
        return `SMC Adaptive (${this._o.period}, stall ${this._o.stallBars}, decay ${this._o.bandDecay})`;
    }

    drawOverlay(ctx: any, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        if (!this._sourceData || this._sourceData.length === 0) return;

        if (this._o.showMinorZigZag && this._minorZigzag.length >= 2) {
            ctx.save();
            ctx.strokeStyle = this._o.minorColor;
            ctx.lineWidth = 1 * hpr;
            ctx.setLineDash([4 * hpr, 4 * hpr]);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            let started = false;
            for (let i = this._minorZigzag.length - 1; i >= 0; i--) {
                const point = this._minorZigzag[i];
                const x = timeScale.indexToCoordinate(point.index) * hpr;
                const y = priceScale.priceToCoordinate(point.price) * vpr;
                if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
            }
            ctx.stroke();
            ctx.restore();
        }

        if (this._o.showMacroZigZag && this._macroVals.length >= 2) {
            ctx.save();
            ctx.strokeStyle = this._o.macroColor;
            ctx.lineWidth = this._o.lineWidth * hpr;
            ctx.setLineDash([]);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < this._macroVals.length; i++) {
                const x = timeScale.indexToCoordinate(this._macroBars[i]) * hpr;
                const y = priceScale.priceToCoordinate(this._macroVals[i]) * vpr;
                if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
            }
            ctx.stroke();
            ctx.restore();
        }

        for (const b of this._breaks) {
            const isBOS = b.type === 'BOS';
            const isMSB = b.type === 'MSB';
            if (isBOS && !this._o.showBOS) continue;
            if (isMSB && !this._o.showMSB) continue;

            const startX = timeScale.indexToCoordinate(b.start_bar) * hpr;
            const endX = timeScale.indexToCoordinate(b.end_bar) * hpr;
            const y = priceScale.priceToCoordinate(b.level) * vpr;
            const color = b.dir === 'Bullish' ? this._o.bullishColor : this._o.bearishColor;

            ctx.save();
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

            const labelX = endX;
            const labelText = `${b.type} (${b.dir === 'Bullish' ? 'BULL' : 'BEAR'})`;

            ctx.save();
            ctx.font = `bold ${10 * hpr}px sans-serif`;
            const textWidth = ctx.measureText(labelText).width;
            const textHeight = 12 * vpr;

            if (b.dir === 'Bullish') {
                const peakY = priceScale.priceToCoordinate(bar.high) * vpr;
                const arrowY = peakY - 8 * vpr;
                ctx.fillStyle = color;
                smcAdpTriangle(ctx, labelX, arrowY, 5 * hpr, 'up');
                const textY = arrowY - 14 * vpr;
                smcAdpRoundRect(ctx, labelX - textWidth / 2 - 4 * hpr, textY - 2 * vpr, textWidth + 8 * hpr, textHeight + 4 * vpr, 3 * hpr);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelText, labelX, textY + textHeight / 2);
            } else {
                const valleyY = priceScale.priceToCoordinate(bar.low) * vpr;
                const arrowY = valleyY + 8 * vpr;
                ctx.fillStyle = color;
                smcAdpTriangle(ctx, labelX, arrowY, 5 * hpr, 'down');
                const textY = arrowY + 8 * vpr;
                smcAdpRoundRect(ctx, labelX - textWidth / 2 - 4 * hpr, textY - 2 * vpr, textWidth + 8 * hpr, textHeight + 4 * vpr, 3 * hpr);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelText, labelX, textY + textHeight / 2);
            }
            ctx.restore();
        }
    }
}

globalThis.__draftIndicatorClass = SMCAdaptiveIndicator;
