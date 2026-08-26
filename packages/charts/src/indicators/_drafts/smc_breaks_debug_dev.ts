interface SMCPivot {
    price: number;
    index: number;
    dir: number;
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
        zigzag.unshift({ price: value, index: idx, dir: direction, time: sourceData[idx].time });
    }
    function updatePivot(value: number, idx: number, direction: number) {
        if (zigzag.length === 0) {
            addPivot(value, idx, direction);
        } else {
            const current = zigzag[0];
            if ((direction === 1 && value > current.price) || (direction === -1 && value < current.price)) {
                current.price = value; current.index = idx; current.time = sourceData[idx].time; current.dir = direction;
            }
        }
    }

    for (let i = 0; i < sourceData.length; i++) {
        const startLookback = Math.max(0, i - prd + 1);
        let isPH = true;
        for (let j = startLookback; j < i; j++) { if (highs[j] > highs[i]) { isPH = false; break; } }
        let isPL = true;
        for (let j = startLookback; j < i; j++) { if (lows[j] < lows[i]) { isPL = false; break; } }
        const phVal = isPH ? highs[i] : null;
        const plVal = isPL ? lows[i] : null;
        const lastDir = dirVal;
        if (plVal !== null && phVal === null) { dirVal = -1; }
        else if (phVal !== null && plVal === null) { dirVal = 1; }
        else if (phVal !== null && plVal !== null) {
            if (dirVal === 0) { dirVal = sourceData[i].close >= sourceData[i].open ? 1 : -1; }
            else { dirVal = dirVal === -1 ? 1 : -1; }
        }
        if (phVal !== null || plVal !== null) {
            const valToUse = dirVal === 1 ? phVal! : plVal!;
            if (dirVal !== lastDir) { addPivot(valToUse, i, dirVal); } else { updatePivot(valToUse, i, dirVal); }
        }
    }
    return { zigzag, finalDir: dirVal };
}

function checkBreakBelow(level: number, startBar: number, endBar: number, breakSrc: 'Close' | 'High/Low', useTickFilter: boolean, tickThreshold: number, closes: number[], lows: number[], confirmCandles: number = 3): boolean {
    const sBar = Math.min(startBar, endBar);
    const eBar = Math.max(startBar, endBar);
    const required = useTickFilter ? level - tickThreshold : level;
    const actualConfirm = breakSrc === 'Close' ? confirmCandles : 1;
    const source = breakSrc === 'Close' ? closes : lows;
    for (let b = sBar; b <= eBar; b++) {
        if (b + actualConfirm - 1 < source.length) {
            let allOk = true;
            for (let offset = 0; offset < actualConfirm; offset++) { if (source[b + offset] >= required) { allOk = false; break; } }
            if (allOk) return true;
        }
    }
    return false;
}

function checkBreakAbove(level: number, startBar: number, endBar: number, breakSrc: 'Close' | 'High/Low', useTickFilter: boolean, tickThreshold: number, closes: number[], highs: number[], confirmCandles: number = 3): boolean {
    const sBar = Math.min(startBar, endBar);
    const eBar = Math.max(startBar, endBar);
    const required = useTickFilter ? level + tickThreshold : level;
    const actualConfirm = breakSrc === 'Close' ? confirmCandles : 1;
    const source = breakSrc === 'Close' ? closes : highs;
    for (let b = sBar; b <= eBar; b++) {
        if (b + actualConfirm - 1 < source.length) {
            let allOk = true;
            for (let offset = 0; offset < actualConfirm; offset++) { if (source[b + offset] <= required) { allOk = false; break; } }
            if (allOk) return true;
        }
    }
    return false;
}

function calculateMacroZigZag(sourceData: BarData[], minorZigzag: SMCPivot[], breakSrc: 'Close' | 'High/Low', useTickFilter: boolean, tickThreshold: number, confirmCandles: number = 3) {
    const closes = sourceData.map(b => b.close);
    const highs = sourceData.map(b => b.high);
    const lows = sourceData.map(b => b.low);
    if (minorZigzag.length < 2) return { m_vals: [], m_bars: [], m_dirs: [], m_confirms: [] };
    const numPoints = minorZigzag.length;
    const baseVals = [...minorZigzag].reverse().map(p => p.price);
    const baseBars = [...minorZigzag].reverse().map(p => p.index);
    const baseDirs = [...minorZigzag].reverse().map(p => p.dir);
    let absoluteHigh = -Infinity, absoluteHighIdx = -1, absoluteLow = Infinity, absoluteLowIdx = -1;
    for (let idx = 0; idx < numPoints; idx++) {
        if (baseDirs[idx] === 1 && baseVals[idx] > absoluteHigh) { absoluteHigh = baseVals[idx]; absoluteHighIdx = idx; }
        if (baseDirs[idx] === -1 && baseVals[idx] < absoluteLow) { absoluteLow = baseVals[idx]; absoluteLowIdx = idx; }
    }
    const startIdx = (absoluteHighIdx !== -1 && absoluteLowIdx !== -1) ? Math.min(absoluteHighIdx, absoluteLowIdx) : 0;
    const m_vals: number[] = [], m_bars: number[] = [], m_dirs: number[] = [], m_confirms: number[] = [];
    let lastLow: number | null = null, lastLowBar = -1, lastHigh: number | null = null, lastHighBar = -1;
    for (let i = startIdx; i < numPoints; i++) {
        if (baseDirs[i] === 1 && lastHigh === null) { lastHigh = baseVals[i]; lastHighBar = baseBars[i]; }
        if (baseDirs[i] === -1 && lastLow === null) { lastLow = baseVals[i]; lastLowBar = baseBars[i]; }
        if (lastHigh !== null && lastLow !== null) break;
    }
    if (lastHigh === null) { lastHigh = baseVals[startIdx]; lastHighBar = baseBars[startIdx]; }
    if (lastLow === null) { lastLow = baseVals[startIdx]; lastLowBar = baseBars[startIdx]; }
    const firstVal = baseVals[startIdx], firstBar = baseBars[startIdx], firstDir = baseDirs[startIdx];
    m_vals.push(firstVal); m_bars.push(firstBar); m_dirs.push(firstDir); m_confirms.push(firstBar);

    for (let idx = startIdx + 1; idx < numPoints; idx++) {
        const val = baseVals[idx], bar = baseBars[idx], pDir = baseDirs[idx];
        if (pDir === -1) {
            if (lastLow === null) {
                lastLow = val; lastLowBar = bar;
                if (m_dirs[m_dirs.length - 1] === 1) { m_vals.push(val); m_bars.push(bar); m_dirs.push(-1); m_confirms.push(bar); }
            } else if (checkBreakBelow(lastLow, lastLowBar, bar, breakSrc, useTickFilter, tickThreshold, closes, lows, confirmCandles)) {
                let peakVal = -1e10, peakBar = -1;
                if (lastLowBar !== -1) { for (let b = lastLowBar + 1; b < bar; b++) { if (highs[b] > peakVal) { peakVal = highs[b]; peakBar = b; } } }
                if (peakBar !== -1) {
                    const breakBar = bar;
                    let isPeakValid = true;
                    if (lastHigh !== null && peakVal > lastHigh) {
                        const isHighBroken = checkBreakAbove(lastHigh, lastHighBar, peakBar, breakSrc, useTickFilter, tickThreshold, closes, highs, confirmCandles);
                        if (!isHighBroken) isPeakValid = false;
                    }
                    if (isPeakValid) {
                        if (m_dirs[m_dirs.length - 1] === 1 && lastHighBar !== -1) {
                            let valleyVal = 1e10, valleyBar = -1;
                            for (let b = lastHighBar + 1; b < peakBar; b++) { if (lows[b] < valleyVal) { valleyVal = lows[b]; valleyBar = b; } }
                            if (valleyBar !== -1) { m_vals.push(valleyVal); m_bars.push(valleyBar); m_dirs.push(-1); m_confirms.push(breakBar); lastLow = valleyVal; lastLowBar = valleyBar; }
                        }
                        m_vals.push(peakVal); m_bars.push(peakBar); m_dirs.push(1); m_confirms.push(breakBar); lastHigh = peakVal; lastHighBar = peakBar;
                        m_vals.push(val); m_bars.push(bar); m_dirs.push(-1); m_confirms.push(breakBar); lastLow = val; lastLowBar = bar;
                    } else {
                        m_vals.push(val); m_bars.push(bar); m_dirs.push(-1); m_confirms.push(breakBar); lastLow = val; lastLowBar = bar;
                    }
                } else {
                    if (m_dirs[m_dirs.length - 1] === -1) { m_vals[m_vals.length - 1] = val; m_bars[m_bars.length - 1] = bar; m_confirms[m_confirms.length - 1] = bar; lastLow = val; lastLowBar = bar; }
                    else { m_vals.push(val); m_bars.push(bar); m_dirs.push(-1); m_confirms.push(bar); lastLow = val; lastLowBar = bar; }
                }
            }
        } else if (pDir === 1) {
            if (lastHigh === null) {
                lastHigh = val; lastHighBar = bar;
                if (m_dirs[m_dirs.length - 1] === -1) { m_vals.push(val); m_bars.push(bar); m_dirs.push(1); m_confirms.push(bar); }
            } else if (checkBreakAbove(lastHigh, lastHighBar, bar, breakSrc, useTickFilter, tickThreshold, closes, highs, confirmCandles)) {
                let valleyVal = 1e10, valleyBar = -1;
                if (lastHighBar !== -1) { for (let b = lastHighBar + 1; b < bar; b++) { if (lows[b] < valleyVal) { valleyVal = lows[b]; valleyBar = b; } } }
                if (valleyBar !== -1) {
                    const breakBar = bar;
                    let isValleyValid = true;
                    if (lastLow !== null && valleyVal < lastLow) {
                        const isLowBroken = checkBreakBelow(lastLow, lastLowBar, valleyBar, breakSrc, useTickFilter, tickThreshold, closes, lows, confirmCandles);
                        if (!isLowBroken) isValleyValid = false;
                    }
                    if (isValleyValid) {
                        if (m_dirs[m_dirs.length - 1] === -1 && lastLowBar !== -1) {
                            let peakVal = -1e10, peakBar = -1;
                            for (let b = lastLowBar + 1; b < valleyBar; b++) { if (highs[b] > peakVal) { peakVal = highs[b]; peakBar = b; } }
                            if (peakBar !== -1) { m_vals.push(peakVal); m_bars.push(peakBar); m_dirs.push(1); m_confirms.push(breakBar); lastHigh = peakVal; lastHighBar = peakBar; }
                        }
                        m_vals.push(valleyVal); m_bars.push(valleyBar); m_dirs.push(-1); m_confirms.push(breakBar); lastLow = valleyVal; lastLowBar = valleyBar;
                        m_vals.push(val); m_bars.push(bar); m_dirs.push(1); m_confirms.push(breakBar); lastHigh = val; lastHighBar = bar;
                    } else {
                        m_vals.push(val); m_bars.push(bar); m_dirs.push(1); m_confirms.push(breakBar); lastHigh = val; lastHighBar = bar;
                    }
                } else {
                    if (m_dirs[m_dirs.length - 1] === 1) { m_vals[m_vals.length - 1] = val; m_bars[m_bars.length - 1] = bar; m_confirms[m_confirms.length - 1] = bar; lastHigh = val; lastHighBar = bar; }
                    else { m_vals.push(val); m_bars.push(bar); m_dirs.push(1); m_confirms.push(bar); lastHigh = val; lastHighBar = bar; }
                }
            }
        }
    }

    const clean_vals: number[] = [], clean_bars: number[] = [], clean_dirs: number[] = [], clean_confirms: number[] = [];
    if (m_vals.length > 0) {
        clean_vals.push(m_vals[0]); clean_bars.push(m_bars[0]); clean_dirs.push(m_dirs[0]); clean_confirms.push(m_confirms[0]);
        for (let j = 1; j < m_vals.length; j++) {
            const lastDir = clean_dirs[clean_dirs.length - 1], currDir = m_dirs[j];
            if (currDir !== lastDir) { clean_vals.push(m_vals[j]); clean_bars.push(m_bars[j]); clean_dirs.push(currDir); clean_confirms.push(m_confirms[j]); }
            else {
                const lastVal = clean_vals[clean_vals.length - 1], currVal = m_vals[j];
                if (currDir === 1) { if (currVal > lastVal) { clean_vals[clean_vals.length - 1] = currVal; clean_bars[clean_bars.length - 1] = m_bars[j]; clean_confirms[clean_confirms.length - 1] = m_confirms[j]; } }
                else { if (currVal < lastVal) { clean_vals[clean_vals.length - 1] = currVal; clean_bars[clean_bars.length - 1] = m_bars[j]; clean_confirms[clean_confirms.length - 1] = m_confirms[j]; } }
            }
        }
    }
    const N = clean_vals.length;
    if (N > 0) {
        for (let i = 0; i < N; i++) {
            const currentDir = clean_dirs[i];
            let rangeStart = 0, rangeEnd = sourceData.length - 1;
            if (i > 0) rangeStart = clean_bars[i - 1] + 1;
            if (i < N - 1) rangeEnd = clean_bars[i + 1] - 1;
            if (rangeStart > rangeEnd) {
                const mid = Math.floor((rangeStart + rangeEnd) / 2);
                clean_bars[i] = mid; clean_vals[i] = currentDir === 1 ? highs[mid] : lows[mid];
            } else {
                let bestVal = currentDir === 1 ? -Infinity : Infinity, bestBar = clean_bars[i];
                for (let b = rangeStart; b <= rangeEnd; b++) {
                    if (currentDir === 1) { if (highs[b] > bestVal) { bestVal = highs[b]; bestBar = b; } }
                    else { if (lows[b] < bestVal) { bestVal = lows[b]; bestBar = b; } }
                }
                clean_bars[i] = bestBar; clean_vals[i] = bestVal;
            }
        }
    }
    return { m_vals: clean_vals, m_bars: clean_bars, m_dirs: clean_dirs, m_confirms: clean_confirms };
}

function detectSMCBreaks(sourceData: BarData[], m_vals: number[], m_bars: number[], m_dirs: number[], m_confirms: number[], breakSrc: 'Close' | 'High/Low', useTickFilter: boolean, tickThreshold: number, confirmCandles: number = 3): SMCStructureBreak[] {
    const closes = sourceData.map(b => b.close);
    const highs = sourceData.map(b => b.high);
    const lows = sourceData.map(b => b.low);
    const breaks: SMCStructureBreak[] = [];
    if (m_vals.length <= 1) return breaks;
    let currentTrend = 0, hasBosInCurrentTrend = true;
    let runningHigh: number | null = null, runningHighBar = -1, runningLow: number | null = null, runningLowBar = -1;
    let candidateHigh: number | null = null, candidateHighBar = -1, candidateLow: number | null = null, candidateLowBar = -1;
    for (let i = 0; i < m_vals.length; i++) {
        if (m_dirs[i] === 1 && runningHigh === null) { runningHigh = m_vals[i]; runningHighBar = m_bars[i]; }
        if (m_dirs[i] === -1 && runningLow === null) { runningLow = m_vals[i]; runningLowBar = m_bars[i]; }
        if (runningHigh !== null && runningLow !== null) break;
    }
    for (let j = 1; j < m_vals.length; j++) {
        const val = m_vals[j], bar = m_bars[j], pDir = m_dirs[j], confirmBar = m_confirms[j];
        if (pDir === 1) {
            if (runningHigh !== null && val > runningHigh) {
                const isHighBroken = checkBreakAbove(runningHigh, runningHighBar, confirmBar, breakSrc, useTickFilter, tickThreshold, closes, highs, confirmCandles);
                if (isHighBroken) {
                    if (currentTrend === -1) {
                        if (hasBosInCurrentTrend) { breaks.push({ type: 'MSB', dir: 'Bullish', level: runningHigh, start_bar: runningHighBar, end_bar: confirmBar }); currentTrend = 1; hasBosInCurrentTrend = false; if (candidateLow !== null) { runningLow = candidateLow; runningLowBar = candidateLowBar; } }
                        else { breaks.push({ type: 'BOS', dir: 'Bullish', level: runningHigh, start_bar: runningHighBar, end_bar: confirmBar }); currentTrend = 1; hasBosInCurrentTrend = true; if (candidateLow !== null) { runningLow = candidateLow; runningLowBar = candidateLowBar; } }
                    } else if (currentTrend === 1) {
                        breaks.push({ type: 'BOS', dir: 'Bullish', level: runningHigh, start_bar: runningHighBar, end_bar: confirmBar }); hasBosInCurrentTrend = true;
                        if (candidateLow !== null) { runningLow = candidateLow; runningLowBar = candidateLowBar; }
                    } else { currentTrend = 1; hasBosInCurrentTrend = true; }
                    runningHigh = val; runningHighBar = bar; candidateHigh = null; candidateHighBar = -1; candidateLow = null; candidateLowBar = -1;
                    continue;
                }
            }
            if (candidateHigh === null || val > candidateHigh) { candidateHigh = val; candidateHighBar = bar; }
        } else if (pDir === -1) {
            if (runningLow !== null && val < runningLow) {
                const isLowBroken = checkBreakBelow(runningLow, runningLowBar, confirmBar, breakSrc, useTickFilter, tickThreshold, closes, lows, confirmCandles);
                if (isLowBroken) {
                    if (currentTrend === 1) {
                        if (hasBosInCurrentTrend) { breaks.push({ type: 'MSB', dir: 'Bearish', level: runningLow, start_bar: runningLowBar, end_bar: confirmBar }); currentTrend = -1; hasBosInCurrentTrend = false; if (candidateHigh !== null) { runningHigh = candidateHigh; runningHighBar = candidateHighBar; } }
                        else { breaks.push({ type: 'BOS', dir: 'Bearish', level: runningLow, start_bar: runningLowBar, end_bar: confirmBar }); currentTrend = -1; hasBosInCurrentTrend = true; if (candidateHigh !== null) { runningHigh = candidateHigh; runningHighBar = candidateHighBar; } }
                    } else if (currentTrend === -1) {
                        breaks.push({ type: 'BOS', dir: 'Bearish', level: runningLow, start_bar: runningLowBar, end_bar: confirmBar }); hasBosInCurrentTrend = true;
                        if (candidateHigh !== null) { runningHigh = candidateHigh; runningHighBar = candidateHighBar; }
                    } else { currentTrend = -1; hasBosInCurrentTrend = true; }
                    runningLow = val; runningLowBar = bar; candidateHigh = null; candidateHighBar = -1; candidateLow = null; candidateLowBar = -1;
                    continue;
                }
            }
            if (candidateLow === null || val < candidateLow) { candidateLow = val; candidateLowBar = bar; }
        }
    }
    return breaks;
}

function estimateTickSize(data: BarData[]): number {
    let minDiff = Infinity;
    const len = Math.min(data.length, 100);
    for (let i = 1; i < len; i++) { const diff = Math.abs(data[i].close - data[i - 1].close); if (diff > 0 && diff < minDiff) minDiff = diff; }
    return minDiff === Infinity ? 0.01 : minDiff;
}

class SMCBreaksDebug extends OverlayIndicator {
    constructor(options: Partial<IndicatorOptions> = {}) {
        super({ ...options, name: 'SMC Breaks Debug' });
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        const period = 15;
        const tickSize = estimateTickSize(sourceData);
        const tickThreshold = 3 * tickSize;
        const { zigzag } = calculateMinorZigZag(sourceData, period, 'High/Low');
        const minorChron = [...zigzag].reverse();
        const internalVals = minorChron.map(p => p.price);
        const internalBars = minorChron.map(p => p.index);
        const internalDirs = minorChron.map(p => p.dir);
        const breaks = detectSMCBreaks(sourceData, internalVals, internalBars, internalDirs, internalBars, 'Close', true, tickThreshold, 3);

        this._data = breaks.map(b => ({
            time: sourceData[b.end_bar].time,
            value: b.level,
            values: [b.start_bar, b.dir === 'Bullish' ? 1 : -1, b.type === 'MSB' ? 2 : 1],
        }));
    }

    getRange(): IndicatorRange {
        if (this._sourceData.length === 0) return { min: 0, max: 100 };
        let min = Infinity, max = -Infinity;
        for (const bar of this._sourceData) { min = Math.min(min, bar.low); max = Math.max(max, bar.high); }
        return { min, max };
    }

    getDescription(): string { return 'SMC Breaks Debug'; }

    drawOverlay(): void {}
}

globalThis.__draftIndicatorClass = SMCBreaksDebug;
