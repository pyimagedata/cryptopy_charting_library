interface SMCPivot {
    price: number;
    index: number;
    dir: number; // 1 for High, -1 for Low
    time: number;
}

interface SMCStructureBreak {
    type: 'BOS' | 'MSB';
    dir: 'Bullish' | 'Bearish';
    level: number;
    start_bar: number;
    end_bar: number;
}

function calculateMinorZigZag(
    sourceData: BarData[],
    prd: number,
    pivotSrc: 'Close' | 'High/Low'
): { zigzag: SMCPivot[]; finalDir: number } {
    const highs = sourceData.map(b => pivotSrc === 'Close' ? b.close : b.high);
    const lows = sourceData.map(b => pivotSrc === 'Close' ? b.close : b.low);

    const zigzag: SMCPivot[] = [];
    let dirVal = 0;

    function addPivot(value: number, idx: number, direction: number) {
        zigzag.unshift({
            price: value,
            index: idx,
            dir: direction,
            time: sourceData[idx].time
        });
    }

    function updatePivot(value: number, idx: number, direction: number) {
        if (zigzag.length === 0) {
            addPivot(value, idx, direction);
        } else {
            const current = zigzag[0];
            if ((direction === 1 && value > current.price) || (direction === -1 && value < current.price)) {
                current.price = value;
                current.index = idx;
                current.time = sourceData[idx].time;
                current.dir = direction;
            }
        }
    }

    for (let i = 0; i < sourceData.length; i++) {
        const startLookback = Math.max(0, i - prd + 1);

        let isPH = true;
        for (let j = startLookback; j < i; j++) {
            if (highs[j] > highs[i]) {
                isPH = false;
                break;
            }
        }

        let isPL = true;
        for (let j = startLookback; j < i; j++) {
            if (lows[j] < lows[i]) {
                isPL = false;
                break;
            }
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
            const valToUse = dirVal === 1 ? phVal! : plVal!;
            if (dirVal !== lastDir) {
                addPivot(valToUse, i, dirVal);
            } else {
                updatePivot(valToUse, i, dirVal);
            }
        }
    }

    return { zigzag, finalDir: dirVal };
}

function checkBreakBelow(
    level: number,
    startBar: number,
    endBar: number,
    breakSrc: 'Close' | 'High/Low',
    useTickFilter: boolean,
    tickThreshold: number,
    closes: number[],
    lows: number[],
    confirmCandles: number = 3
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
                if (source[b + offset] >= required) {
                    allOk = false;
                    break;
                }
            }
            if (allOk) {
                return true;
            }
        }
    }
    return false;
}

function checkBreakAbove(
    level: number,
    startBar: number,
    endBar: number,
    breakSrc: 'Close' | 'High/Low',
    useTickFilter: boolean,
    tickThreshold: number,
    closes: number[],
    highs: number[],
    confirmCandles: number = 3
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
                if (source[b + offset] <= required) {
                    allOk = false;
                    break;
                }
            }
            if (allOk) {
                return true;
            }
        }
    }
    return false;
}

function calculateMacroZigZag(
    sourceData: BarData[],
    minorZigzag: SMCPivot[],
    breakSrc: 'Close' | 'High/Low',
    useTickFilter: boolean,
    tickThreshold: number,
    confirmCandles: number = 3
): { m_vals: number[]; m_bars: number[]; m_dirs: number[]; m_confirms: number[] } {
    const closes = sourceData.map(b => b.close);
    const highs = sourceData.map(b => b.high);
    const lows = sourceData.map(b => b.low);

    if (minorZigzag.length < 2) {
        return { m_vals: [], m_bars: [], m_dirs: [], m_confirms: [] };
    }

    const numPoints = minorZigzag.length;
    // Extract base points in chronological order (oldest first)
    const baseVals = [...minorZigzag].reverse().map(p => p.price);
    const baseBars = [...minorZigzag].reverse().map(p => p.index);
    const baseDirs = [...minorZigzag].reverse().map(p => p.dir);

    let absoluteHigh = -Infinity;
    let absoluteHighIdx = -1;
    let absoluteLow = Infinity;
    let absoluteLowIdx = -1;

    for (let idx = 0; idx < numPoints; idx++) {
        if (baseDirs[idx] === 1 && baseVals[idx] > absoluteHigh) {
            absoluteHigh = baseVals[idx];
            absoluteHighIdx = idx;
        }
        if (baseDirs[idx] === -1 && baseVals[idx] < absoluteLow) {
            absoluteLow = baseVals[idx];
            absoluteLowIdx = idx;
        }
    }

    const startIdx = (absoluteHighIdx !== -1 && absoluteLowIdx !== -1)
        ? Math.min(absoluteHighIdx, absoluteLowIdx)
        : 0;

    const m_vals: number[] = [];
    const m_bars: number[] = [];
    const m_dirs: number[] = [];
    const m_confirms: number[] = [];

    let lastLow: number | null = null;
    let lastLowBar = -1;
    let lastHigh: number | null = null;
    let lastHighBar = -1;

    for (let i = startIdx; i < numPoints; i++) {
        if (baseDirs[i] === 1 && lastHigh === null) {
            lastHigh = baseVals[i];
            lastHighBar = baseBars[i];
        }
        if (baseDirs[i] === -1 && lastLow === null) {
            lastLow = baseVals[i];
            lastLowBar = baseBars[i];
        }
        if (lastHigh !== null && lastLow !== null) {
            break;
        }
    }

    if (lastHigh === null) {
        lastHigh = baseVals[startIdx];
        lastHighBar = baseBars[startIdx];
    }
    if (lastLow === null) {
        lastLow = baseVals[startIdx];
        lastLowBar = baseBars[startIdx];
    }

    const firstVal = baseVals[startIdx];
    const firstBar = baseBars[startIdx];
    const firstDir = baseDirs[startIdx];

    m_vals.push(firstVal);
    m_bars.push(firstBar);
    m_dirs.push(firstDir);
    m_confirms.push(firstBar);

    for (let idx = startIdx + 1; idx < numPoints; idx++) {
        const val = baseVals[idx];
        const bar = baseBars[idx];
        const pDir = baseDirs[idx];

        if (pDir === -1) { // Low candidate
            if (lastLow === null) {
                lastLow = val;
                lastLowBar = bar;
                if (m_dirs[m_dirs.length - 1] === 1) {
                    m_vals.push(val);
                    m_bars.push(bar);
                    m_dirs.push(-1);
                    m_confirms.push(bar);
                }
            } else if (checkBreakBelow(lastLow, lastLowBar, bar, breakSrc, useTickFilter, tickThreshold, closes, lows, confirmCandles)) {
                let peakVal = -1e10;
                let peakBar = -1;

                // Scan raw highs of all candles between previous Low pivot and current Low breakout
                if (lastLowBar !== -1) {
                    for (let b = lastLowBar + 1; b < bar; b++) {
                        if (highs[b] > peakVal) {
                            peakVal = highs[b];
                            peakBar = b;
                        }
                    }
                }

                if (peakBar !== -1) {
                    const breakBar = bar;

                    // Verify breakout of lastHigh
                    let isPeakValid = true;
                    if (lastHigh !== null && peakVal > lastHigh) {
                        const isHighBroken = checkBreakAbove(
                            lastHigh,
                            lastHighBar,
                            peakBar,
                            breakSrc,
                            useTickFilter,
                            tickThreshold,
                            closes,
                            highs,
                            confirmCandles
                        );
                        if (!isHighBroken) {
                            isPeakValid = false;
                        }
                    }

                    if (isPeakValid) {
                        if (m_dirs[m_dirs.length - 1] === 1 && lastHighBar !== -1) {
                            let valleyVal = 1e10;
                            let valleyBar = -1;
                            for (let b = lastHighBar + 1; b < peakBar; b++) {
                                if (lows[b] < valleyVal) {
                                    valleyVal = lows[b];
                                    valleyBar = b;
                                }
                            }
                            if (valleyBar !== -1) {
                                m_vals.push(valleyVal);
                                m_bars.push(valleyBar);
                                m_dirs.push(-1);
                                m_confirms.push(breakBar);
                                lastLow = valleyVal;
                                lastLowBar = valleyBar;
                            }
                        }

                        // Push peak
                        m_vals.push(peakVal);
                        m_bars.push(peakBar);
                        m_dirs.push(1);
                        m_confirms.push(breakBar);
                        lastHigh = peakVal;
                        lastHighBar = peakBar;

                        // Push new low
                        m_vals.push(val);
                        m_bars.push(bar);
                        m_dirs.push(-1);
                        m_confirms.push(breakBar);
                        lastLow = val;
                        lastLowBar = bar;
                    } else {
                        // Peak is invalid (fake breakout/wick sweep), just push the new low directly
                        m_vals.push(val);
                        m_bars.push(bar);
                        m_dirs.push(-1);
                        m_confirms.push(breakBar);
                        lastLow = val;
                        lastLowBar = bar;
                    }
                } else {
                    if (m_dirs[m_dirs.length - 1] === -1) {
                        m_vals[m_vals.length - 1] = val;
                        m_bars[m_bars.length - 1] = bar;
                        m_confirms[m_confirms.length - 1] = bar;
                        lastLow = val;
                        lastLowBar = bar;
                    } else {
                        m_vals.push(val);
                        m_bars.push(bar);
                        m_dirs.push(-1);
                        m_confirms.push(bar);
                        lastLow = val;
                        lastLowBar = bar;
                    }
                }
            }
        } else if (pDir === 1) { // High candidate
            if (lastHigh === null) {
                lastHigh = val;
                lastHighBar = bar;
                if (m_dirs[m_dirs.length - 1] === -1) {
                    m_vals.push(val);
                    m_bars.push(bar);
                    m_dirs.push(1);
                    m_confirms.push(bar);
                }
            } else if (checkBreakAbove(lastHigh, lastHighBar, bar, breakSrc, useTickFilter, tickThreshold, closes, highs, confirmCandles)) {
                let valleyVal = 1e10;
                let valleyBar = -1;

                // Scan raw lows of all candles between previous High pivot and current High breakout
                if (lastHighBar !== -1) {
                    for (let b = lastHighBar + 1; b < bar; b++) {
                        if (lows[b] < valleyVal) {
                            valleyVal = lows[b];
                            valleyBar = b;
                        }
                    }
                }

                if (valleyBar !== -1) {
                    const breakBar = bar;

                    // Verify breakout of lastLow
                    let isValleyValid = true;
                    if (lastLow !== null && valleyVal < lastLow) {
                        const isLowBroken = checkBreakBelow(
                            lastLow,
                            lastLowBar,
                            valleyBar,
                            breakSrc,
                            useTickFilter,
                            tickThreshold,
                            closes,
                            lows,
                            confirmCandles
                        );
                        if (!isLowBroken) {
                            isValleyValid = false;
                        }
                    }

                    if (isValleyValid) {
                        if (m_dirs[m_dirs.length - 1] === -1 && lastLowBar !== -1) {
                            let peakVal = -1e10;
                            let peakBar = -1;
                            for (let b = lastLowBar + 1; b < valleyBar; b++) {
                                if (highs[b] > peakVal) {
                                    peakVal = highs[b];
                                    peakBar = b;
                                }
                            }
                            if (peakBar !== -1) {
                                m_vals.push(peakVal);
                                m_bars.push(peakBar);
                                m_dirs.push(1);
                                m_confirms.push(breakBar);
                                lastHigh = peakVal;
                                lastHighBar = peakBar;
                            }
                        }

                        // Push valley
                        m_vals.push(valleyVal);
                        m_bars.push(valleyBar);
                        m_dirs.push(-1);
                        m_confirms.push(breakBar);
                        lastLow = valleyVal;
                        lastLowBar = valleyBar;

                        // Push new high
                        m_vals.push(val);
                        m_bars.push(bar);
                        m_dirs.push(1);
                        m_confirms.push(breakBar);
                        lastHigh = val;
                        lastHighBar = bar;
                    } else {
                        // Valley is invalid (fake breakout/wick sweep), just push the new high directly
                        m_vals.push(val);
                        m_bars.push(bar);
                        m_dirs.push(1);
                        m_confirms.push(breakBar);
                        lastHigh = val;
                        lastHighBar = bar;
                    }
                } else {
                    if (m_dirs[m_dirs.length - 1] === 1) {
                        m_vals[m_vals.length - 1] = val;
                        m_bars[m_bars.length - 1] = bar;
                        m_confirms[m_confirms.length - 1] = bar;
                        lastHigh = val;
                        lastHighBar = bar;
                    } else {
                        m_vals.push(val);
                        m_bars.push(bar);
                        m_dirs.push(1);
                        m_confirms.push(bar);
                        lastHigh = val;
                        lastHighBar = bar;
                    }
                }
            }
        }
    }

    // Clean duplicates (consecutive elements with same direction)
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
                if (currDir === 1) { // High
                    if (currVal > lastVal) {
                        clean_vals[clean_vals.length - 1] = currVal;
                        clean_bars[clean_bars.length - 1] = m_bars[j];
                        clean_confirms[clean_confirms.length - 1] = m_confirms[j];
                    }
                } else { // Low
                    if (currVal < lastVal) {
                        clean_vals[clean_vals.length - 1] = currVal;
                        clean_bars[clean_bars.length - 1] = m_bars[j];
                        clean_confirms[clean_confirms.length - 1] = m_confirms[j];
                    }
                }
            }
        }
    }

    // Post-processing adjustment to ensure macro points reside on the absolute highest/lowest prices of the range
    const N = clean_vals.length;
    if (N > 0) {
        for (let i = 0; i < N; i++) {
            const currentDir = clean_dirs[i];

            let rangeStart = 0;
            let rangeEnd = sourceData.length - 1;

            if (i > 0) {
                rangeStart = clean_bars[i - 1] + 1;
            }
            if (i < N - 1) {
                rangeEnd = clean_bars[i + 1] - 1;
            }

            if (rangeStart > rangeEnd) {
                const mid = Math.floor((rangeStart + rangeEnd) / 2);
                clean_bars[i] = mid;
                clean_vals[i] = currentDir === 1 ? highs[mid] : lows[mid];
            } else {
                let bestVal = currentDir === 1 ? -Infinity : Infinity;
                let bestBar = clean_bars[i];
                for (let b = rangeStart; b <= rangeEnd; b++) {
                    if (currentDir === 1) {
                        if (highs[b] > bestVal) {
                            bestVal = highs[b];
                            bestBar = b;
                        }
                    } else {
                        if (lows[b] < bestVal) {
                            bestVal = lows[b];
                            bestBar = b;
                        }
                    }
                }
                clean_bars[i] = bestBar;
                clean_vals[i] = bestVal;
            }
        }
    }

    return {
        m_vals: clean_vals,
        m_bars: clean_bars,
        m_dirs: clean_dirs,
        m_confirms: clean_confirms
    };
}

function detectSMCBreaks(
    sourceData: BarData[],
    m_vals: number[],
    m_bars: number[],
    m_dirs: number[],
    m_confirms: number[],
    breakSrc: 'Close' | 'High/Low',
    useTickFilter: boolean,
    tickThreshold: number,
    confirmCandles: number = 3
): SMCStructureBreak[] {
    const closes = sourceData.map(b => b.close);
    const highs = sourceData.map(b => b.high);
    const lows = sourceData.map(b => b.low);

    const breaks: SMCStructureBreak[] = [];
    if (m_vals.length <= 1) {
        return breaks;
    }

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

    // Initialize both running high and low from the first available macro high and low
    for (let i = 0; i < m_vals.length; i++) {
        if (m_dirs[i] === 1 && runningHigh === null) {
            runningHigh = m_vals[i];
            runningHighBar = m_bars[i];
        }
        if (m_dirs[i] === -1 && runningLow === null) {
            runningLow = m_vals[i];
            runningLowBar = m_bars[i];
        }
        if (runningHigh !== null && runningLow !== null) {
            break;
        }
    }

    for (let j = 1; j < m_vals.length; j++) {
        const val = m_vals[j];
        const bar = m_bars[j];
        const pDir = m_dirs[j];
        const confirmBar = m_confirms[j];

        if (pDir === 1) { // High pivot
            if (runningHigh !== null && val > runningHigh) {
                const isHighBroken = checkBreakAbove(
                    runningHigh,
                    runningHighBar,
                    confirmBar,
                    breakSrc,
                    useTickFilter,
                    tickThreshold,
                    closes,
                    highs,
                    confirmCandles
                );
                if (isHighBroken) {
                    if (currentTrend === -1) { // Bearish to Bullish -> MSB
                        if (hasBosInCurrentTrend) {
                            breaks.push({
                                type: 'MSB',
                                dir: 'Bullish',
                                level: runningHigh,
                                start_bar: runningHighBar,
                                end_bar: confirmBar
                            });
                            currentTrend = 1;
                            hasBosInCurrentTrend = false;
                            if (candidateLow !== null) {
                                runningLow = candidateLow;
                                runningLowBar = candidateLowBar;
                            }
                        } else {
                            breaks.push({
                                type: 'BOS',
                                dir: 'Bullish',
                                level: runningHigh,
                                start_bar: runningHighBar,
                                end_bar: confirmBar
                            });
                            currentTrend = 1;
                            hasBosInCurrentTrend = true;
                            if (candidateLow !== null) {
                                runningLow = candidateLow;
                                runningLowBar = candidateLowBar;
                            }
                        }
                    } else if (currentTrend === 1) { // Bullish to Bullish -> BOS
                        breaks.push({
                            type: 'BOS',
                            dir: 'Bullish',
                            level: runningHigh,
                            start_bar: runningHighBar,
                            end_bar: confirmBar
                        });
                        hasBosInCurrentTrend = true;
                        if (candidateLow !== null) {
                            runningLow = candidateLow;
                            runningLowBar = candidateLowBar;
                        }
                    } else {
                        currentTrend = 1;
                        hasBosInCurrentTrend = true;
                    }

                    runningHigh = val;
                    runningHighBar = bar;
                    candidateHigh = null;
                    candidateHighBar = -1;
                    candidateLow = null;
                    candidateLowBar = -1;
                    continue;
                }
            }

            if (candidateHigh === null || val > candidateHigh) {
                candidateHigh = val;
                candidateHighBar = bar;
            }
        } else if (pDir === -1) { // Low pivot
            if (runningLow !== null && val < runningLow) {
                const isLowBroken = checkBreakBelow(
                    runningLow,
                    runningLowBar,
                    confirmBar,
                    breakSrc,
                    useTickFilter,
                    tickThreshold,
                    closes,
                    lows,
                    confirmCandles
                );
                if (isLowBroken) {
                    if (currentTrend === 1) { // Bullish to Bearish -> MSB
                        if (hasBosInCurrentTrend) {
                            breaks.push({
                                type: 'MSB',
                                dir: 'Bearish',
                                level: runningLow,
                                start_bar: runningLowBar,
                                end_bar: confirmBar
                            });
                            currentTrend = -1;
                            hasBosInCurrentTrend = false;
                            if (candidateHigh !== null) {
                                runningHigh = candidateHigh;
                                runningHighBar = candidateHighBar;
                            }
                        } else {
                            breaks.push({
                                type: 'BOS',
                                dir: 'Bearish',
                                level: runningLow,
                                start_bar: runningLowBar,
                                end_bar: confirmBar
                            });
                            currentTrend = -1;
                            hasBosInCurrentTrend = true;
                            if (candidateHigh !== null) {
                                runningHigh = candidateHigh;
                                runningHighBar = candidateHighBar;
                            }
                        }
                    } else if (currentTrend === -1) { // Bearish to Bearish -> BOS
                        breaks.push({
                            type: 'BOS',
                            dir: 'Bearish',
                            level: runningLow,
                            start_bar: runningLowBar,
                            end_bar: confirmBar
                        });
                        hasBosInCurrentTrend = true;
                        if (candidateHigh !== null) {
                            runningHigh = candidateHigh;
                            runningHighBar = candidateHighBar;
                        }
                    } else {
                        currentTrend = -1;
                        hasBosInCurrentTrend = true;
                    }

                    runningLow = val;
                    runningLowBar = bar;
                    candidateHigh = null;
                    candidateHighBar = -1;
                    candidateLow = null;
                    candidateLowBar = -1;
                    continue;
                }
            }

            if (candidateLow === null || val < candidateLow) {
                candidateLow = val;
                candidateLowBar = bar;
            }
        }
    }

    return breaks;
}

interface SMCIndicatorOptions extends IndicatorOptions {
    period: number;
    pivotSrc: 'Close' | 'High/Low';
    breakSrc: 'Close' | 'High/Low';
    macroSrc: 'Close' | 'High/Low';
    useTickFilter: boolean;
    tickMult: number;
    tickSize: number; // 0 for auto
    confirmCandles: number;
    showMinorZigZag: boolean;
    showMacroZigZag: boolean;
    showBOS: boolean;
    showMSB: boolean;
    showInternal: boolean;
    minorColor: string;
    macroColor: string;
    bullishColor: string;
    bearishColor: string;
    internalBullColor: string;
    internalBearColor: string;
}

const defaultSMCOptions: Partial<SMCIndicatorOptions> = {
    name: 'Smart Money Concepts (Copy)',
    period: 15,
    pivotSrc: 'High/Low',
    breakSrc: 'Close',
    macroSrc: 'Close',
    useTickFilter: true,
    tickMult: 3,
    tickSize: 0, // 0 means Auto
    confirmCandles: 3,
    showMinorZigZag: true,
    showMacroZigZag: true,
    showBOS: true,
    showMSB: true,
    showInternal: true,
    minorColor: 'rgba(41, 98, 255, 0.4)',
    macroColor: '#212121',
    bullishColor: '#008080',
    bearishColor: '#ef4444',
    internalBullColor: 'rgba(0, 128, 128, 0.55)',
    internalBearColor: 'rgba(239, 68, 68, 0.55)',
    lineWidth: 2,
};

class SMCIndicatorDev extends OverlayIndicator {
    private _smcOptions: SMCIndicatorOptions;
    private _minorZigzag: SMCPivot[] = [];
    private _macroVals: number[] = [];
    private _macroBars: number[] = [];
    private _breaks: SMCStructureBreak[] = [];
    private _internalBreaks: SMCStructureBreak[] = [];

    constructor(options: Partial<SMCIndicatorOptions> = {}) {
        const merged = { ...defaultSMCOptions, ...options };
        super(merged);
        this._smcOptions = { ...defaultSMCOptions, ...this._options } as SMCIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._smcOptions };
    }

    updateOptions(newOptions: Partial<SMCIndicatorOptions>): boolean {
        const normalized = { ...newOptions };
        if (normalized.period !== undefined) normalized.period = Number(normalized.period);
        if (normalized.tickMult !== undefined) normalized.tickMult = Number(normalized.tickMult);
        if (normalized.tickSize !== undefined) normalized.tickSize = Number(normalized.tickSize);
        if (normalized.confirmCandles !== undefined) normalized.confirmCandles = Number(normalized.confirmCandles);

        const needsRecalc =
            normalized.period !== undefined ||
            normalized.pivotSrc !== undefined ||
            normalized.breakSrc !== undefined ||
            normalized.macroSrc !== undefined ||
            normalized.useTickFilter !== undefined ||
            normalized.tickMult !== undefined ||
            normalized.tickSize !== undefined ||
            normalized.confirmCandles !== undefined;

        Object.assign(this._smcOptions, normalized);
        Object.assign(this._options, normalized);
        this._dataChanged.fire();
        return !!needsRecalc;
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<SMCIndicatorOptions>);
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        if (sourceData.length < this._smcOptions.period) {
            this._minorZigzag = [];
            this._macroVals = [];
            this._macroBars = [];
            this._breaks = [];
            this._internalBreaks = [];
            this._data = [];
            return;
        }

        // 1. Calculate Tick Threshold
        let tickSize = this._smcOptions.tickSize;
        if (tickSize <= 0) {
            tickSize = estimateTickSize(sourceData);
        }
        const tickThreshold = this._smcOptions.tickMult * tickSize;

        // 2. Compute Minor ZigZag
        const { zigzag } = calculateMinorZigZag(sourceData, this._smcOptions.period, this._smcOptions.pivotSrc);
        this._minorZigzag = zigzag;

        // 3. Compute Macro ZigZag (uses user-configured confirmCandles)
        const { m_vals, m_bars, m_dirs, m_confirms } = calculateMacroZigZag(
            sourceData,
            zigzag,
            this._smcOptions.macroSrc,
            this._smcOptions.useTickFilter,
            tickThreshold,
            this._smcOptions.confirmCandles
        );
        this._macroVals = m_vals;
        this._macroBars = m_bars;

        // 4. Compute Structure Breaks (BOS / MSB)
        this._breaks = detectSMCBreaks(
            sourceData,
            m_vals,
            m_bars,
            m_dirs,
            m_confirms,
            this._smcOptions.breakSrc,
            this._smcOptions.useTickFilter,
            tickThreshold,
            this._smcOptions.confirmCandles
        );

        // 5. Compute Internal Structure Breaks (same break logic, fed with raw minor
        // pivots instead of consolidated macro pivots). This gives a "local trend"
        // reading that keeps updating even during long stretches where the major
        // swing high/low hasn't been broken yet, instead of the indicator staying
        // silent for hundreds/thousands of bars while price makes lower-highs /
        // higher-lows underneath an untouched major level.
        const minorChron = [...zigzag].reverse();
        const internalVals = minorChron.map(p => p.price);
        const internalBars = minorChron.map(p => p.index);
        const internalDirs = minorChron.map(p => p.dir);
        this._internalBreaks = detectSMCBreaks(
            sourceData,
            internalVals,
            internalBars,
            internalDirs,
            internalBars,
            this._smcOptions.breakSrc,
            this._smcOptions.useTickFilter,
            tickThreshold,
            this._smcOptions.confirmCandles
        );

        // Map line points for default series mapping (uses macro zigzag)
        this._data = m_bars.map((barIdx, i) => ({
            time: sourceData[barIdx].time,
            value: m_vals[i],
        }));
    }

    getRange(): IndicatorRange {
        if (this._sourceData.length === 0) {
            return { min: 0, max: 100 };
        }

        let min = Infinity;
        let max = -Infinity;
        for (const bar of this._sourceData) {
            min = Math.min(min, bar.low);
            max = Math.max(max, bar.high);
        }
        return { min, max };
    }

    getDescription(): string {
        return `SMC Copy (${this._smcOptions.period})`;
    }

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number
    ): void {
        if (this._sourceData.length === 0) return;

        // 1. Draw Minor ZigZag
        if (this._smcOptions.showMinorZigZag && this._minorZigzag.length >= 2) {
            ctx.save();
            ctx.strokeStyle = this._smcOptions.minorColor;
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
                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            ctx.restore();
        }

        // 2. Draw Macro ZigZag
        if (this._smcOptions.showMacroZigZag && this._macroVals.length >= 2) {
            ctx.save();
            ctx.strokeStyle = this._smcOptions.macroColor;
            ctx.lineWidth = this._smcOptions.lineWidth * hpr;
            ctx.setLineDash([]);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();

            let started = false;
            for (let i = 0; i < this._macroVals.length; i++) {
                const barIdx = this._macroBars[i];
                const price = this._macroVals[i];
                const x = timeScale.indexToCoordinate(barIdx) * hpr;
                const y = priceScale.priceToCoordinate(price) * vpr;
                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            ctx.restore();
        }

        // 3. Draw BOS & MSB Levels and Markers
        for (const b of this._breaks) {
            const isBOS = b.type === 'BOS';
            const isMSB = b.type === 'MSB';

            if (isBOS && !this._smcOptions.showBOS) continue;
            if (isMSB && !this._smcOptions.showMSB) continue;

            const startX = timeScale.indexToCoordinate(b.start_bar) * hpr;
            const endX = timeScale.indexToCoordinate(b.end_bar) * hpr;
            const y = priceScale.priceToCoordinate(b.level) * vpr;

            const color = b.dir === 'Bullish' ? this._smcOptions.bullishColor : this._smcOptions.bearishColor;

            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1 * hpr;
            ctx.setLineDash([2 * hpr, 2 * hpr]);
            ctx.beginPath();
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
            ctx.stroke();
            ctx.restore();

            const labelX = endX;
            const bar = this._sourceData[b.end_bar];
            if (!bar) continue;

            const labelText = `${b.type} (${b.dir === 'Bullish' ? 'BULL' : 'BEAR'})`;

            ctx.save();
            ctx.font = `bold ${10 * hpr}px sans-serif`;
            const textMetrics = ctx.measureText(labelText);
            const textWidth = textMetrics.width;
            const textHeight = 12 * vpr;

            if (b.dir === 'Bullish') {
                const peakY = priceScale.priceToCoordinate(bar.high) * vpr;
                const arrowY = peakY - 8 * vpr;

                ctx.fillStyle = color;
                drawTriangle(ctx, labelX, arrowY, 5 * hpr, 'up');

                const textY = arrowY - 14 * vpr;
                roundRect(ctx, labelX - textWidth / 2 - 4 * hpr, textY - 2 * vpr, textWidth + 8 * hpr, textHeight + 4 * vpr, 3 * hpr);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelText, labelX, textY + textHeight / 2);
            } else {
                const valleyY = priceScale.priceToCoordinate(bar.low) * vpr;
                const arrowY = valleyY + 8 * vpr;

                ctx.fillStyle = color;
                drawTriangle(ctx, labelX, arrowY, 5 * hpr, 'down');

                const textY = arrowY + 8 * vpr;
                roundRect(ctx, labelX - textWidth / 2 - 4 * hpr, textY - 2 * vpr, textWidth + 8 * hpr, textHeight + 4 * vpr, 3 * hpr);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelText, labelX, textY + textHeight / 2);
            }
            ctx.restore();
        }

        // 4. Draw Internal Structure breaks (lighter/thinner - local trend reads
        // that keep firing even while the major swing level above stays untouched)
        if (this._smcOptions.showInternal) {
            for (const b of this._internalBreaks) {
                const startX = timeScale.indexToCoordinate(b.start_bar) * hpr;
                const endX = timeScale.indexToCoordinate(b.end_bar) * hpr;
                const y = priceScale.priceToCoordinate(b.level) * vpr;
                const color = b.dir === 'Bullish' ? this._smcOptions.internalBullColor : this._smcOptions.internalBearColor;

                ctx.save();
                ctx.strokeStyle = color;
                ctx.lineWidth = 1 * hpr;
                ctx.setLineDash([1 * hpr, 3 * hpr]);
                ctx.beginPath();
                ctx.moveTo(startX, y);
                ctx.lineTo(endX, y);
                ctx.stroke();
                ctx.restore();

                const bar = this._sourceData[b.end_bar];
                if (!bar) continue;

                ctx.save();
                ctx.fillStyle = color;
                if (b.dir === 'Bullish') {
                    const arrowY = priceScale.priceToCoordinate(bar.high) * vpr - 4 * hpr;
                    drawTriangle(ctx, endX, arrowY, 3 * hpr, 'up');
                } else {
                    const arrowY = priceScale.priceToCoordinate(bar.low) * vpr + 4 * hpr;
                    drawTriangle(ctx, endX, arrowY, 3 * hpr, 'down');
                }
                ctx.restore();
            }
        }
    }

    hitTest(x: number, y: number, timeScale: any, priceScale: any): boolean {
        if (this._macroVals.length < 2) {
            return false;
        }

        const threshold = 8;
        for (let i = 1; i < this._macroVals.length; i++) {
            const startBar = this._macroBars[i - 1];
            const startPrice = this._macroVals[i - 1];
            const endBar = this._macroBars[i];
            const endPrice = this._macroVals[i];

            const x1 = timeScale.indexToCoordinate(startBar);
            const y1 = priceScale.priceToCoordinate(startPrice);
            const x2 = timeScale.indexToCoordinate(endBar);
            const y2 = priceScale.priceToCoordinate(endPrice);

            if (distanceToSegment(x, y, x1, y1, x2, y2) <= threshold) {
                return true;
            }
        }

        return false;
    }
}

function estimateTickSize(data: BarData[]): number {
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

function drawTriangle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    direction: 'up' | 'down'
): void {
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

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
): void {
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

function distanceToSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
): number {
    const dx = x2 - x1;
    const dy = y2 - y1;

    if (dx === 0 && dy === 0) {
        return Math.hypot(px - x1, py - y1);
    }

    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
}

globalThis.__draftIndicatorClass = SMCIndicatorDev;
