interface ConsolidationOptions {
    name?: string;
    lookback: number; // bars used to compute the rolling highest-high / lowest-low range
    atrPeriod: number; // ATR period used as the volatility benchmark
    atrMult: number; // max allowed range width, as a multiple of ATR — lower = stricter/tighter zones
    minBars: number; // minimum consecutive compressed bars required before a zone is confirmed
    extendBars: number; // how many bars to extend a confirmed zone box to the right, past its own end
    // "PtGambler-style" extra validation, beyond plain ATR compression:
    touchTolerancePct: number; // how close (as % of zone height) a wick must be to count as a boundary "touch"
    minTouchesPerSide: number; // minimum wick touches required at both the top AND the bottom to confirm the zone
    centerMinPct: number; // zone's average close must sit between this and centerMaxPct of its own height
    centerMaxPct: number;
    boxColor: string;
    boxOpacity: number;
    borderOpacity: number;
    rejectedBoxColor: string; // color for zones that passed compression but failed touch/center validation
    showRejected: boolean;
    [key: string]: any;
}

interface ConsolidationZone {
    startIndex: number;
    endIndex: number; // last bar that was still inside the compressed range
    displayEndIndex: number;
    top: number;
    bottom: number;
    barCount: number;
    topTouches: number;
    bottomTouches: number;
    centerPct: number;
    valid: boolean; // passed the touch-count + centering validation
}

const defaultOptions: ConsolidationOptions = {
    name: 'Consolidation Range',
    lookback: 10,
    atrPeriod: 14,
    atrMult: 2.0,
    minBars: 6,
    extendBars: 0,
    touchTolerancePct: 15,
    minTouchesPerSide: 2,
    centerMinPct: 35,
    centerMaxPct: 65,
    boxColor: '#a855f7',
    boxOpacity: 0.14,
    borderOpacity: 0.7,
    rejectedBoxColor: '#94a3b8',
    showRejected: true,
};

// Wilder's ATR.
function calculateATR(sourceData: any[], period: number): number[] {
    const n = sourceData.length;
    const tr = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
        const h = sourceData[i].high;
        const l = sourceData[i].low;
        const pc = sourceData[i - 1].close;
        tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }
    const atr = new Array(n).fill(0);
    if (n <= period) return atr;
    let sum = 0;
    for (let i = 1; i <= period; i++) sum += tr[i];
    atr[period] = sum / period;
    for (let i = period + 1; i < n; i++) {
        atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
    }
    return atr;
}

// Rolling max/min over the trailing `lookback` bars (inclusive of the current bar).
function rollingExtremes(sourceData: any[], lookback: number): { highs: number[]; lows: number[] } {
    const n = sourceData.length;
    const highs = new Array(n).fill(NaN);
    const lows = new Array(n).fill(NaN);
    for (let i = 0; i < n; i++) {
        const start = Math.max(0, i - lookback + 1);
        let h = -Infinity;
        let l = Infinity;
        for (let j = start; j <= i; j++) {
            h = Math.max(h, sourceData[j].high);
            l = Math.min(l, sourceData[j].low);
        }
        highs[i] = h;
        lows[i] = l;
    }
    return { highs, lows };
}

// Core detection: a bar is "compressed" when its trailing rolling range is
// tighter than atrMult * ATR. A zone is confirmed once at least `minBars`
// consecutive bars have been compressed, and the zone is backfilled to cover
// the whole compressed run. The zone keeps extending for as long as bars
// remain compressed, and closes the moment a bar breaks out of compression.
function detectRawZones(
    sourceData: any[],
    highs: number[],
    lows: number[],
    atr: number[],
    minBars: number,
    atrMult: number
): Array<{ startIndex: number; endIndex: number }> {
    const n = sourceData.length;
    const zones: Array<{ startIndex: number; endIndex: number }> = [];

    const isCompressed = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
        const atrVal = atr[i];
        if (!atrVal || atrVal <= 0 || isNaN(highs[i]) || isNaN(lows[i])) continue;
        isCompressed[i] = highs[i] - lows[i] < atrVal * atrMult;
    }

    let streakStart = -1;
    let zoneOpen = false;
    let currentZoneStart = -1;

    for (let i = 0; i < n; i++) {
        if (isCompressed[i]) {
            if (streakStart === -1) streakStart = i;
            const streakLen = i - streakStart + 1;
            if (!zoneOpen && streakLen >= minBars) {
                zoneOpen = true;
                currentZoneStart = streakStart;
            }
        } else {
            if (zoneOpen) {
                zones.push({ startIndex: currentZoneStart, endIndex: i - 1 });
                zoneOpen = false;
            }
            streakStart = -1;
        }
    }
    if (zoneOpen) {
        zones.push({ startIndex: currentZoneStart, endIndex: n - 1 });
    }

    return zones;
}

// Extra validation beyond plain ATR compression, mirroring the "average
// price comparison" and "number of touches at the range boundaries" checks
// described for tools like Consolidation Range Detector [Pt]:
//  - centering: the zone's average close should sit roughly in the middle of
//    its own high-low band, not hugging one edge (which usually means it's a
//    shallow drift/trend that merely happened to pass the ATR-width test,
//    not a genuine back-and-forth range).
//  - touches: both the top and the bottom must have been genuinely tested by
//    at least `minTouchesPerSide` wicks (within `touchTolerancePct` of the
//    zone's own height), confirming both boundaries acted as real support/
//    resistance rather than being touched once by chance.
function validateZone(
    sourceData: any[],
    startIndex: number,
    endIndex: number,
    touchTolerancePct: number,
    minTouchesPerSide: number,
    centerMinPct: number,
    centerMaxPct: number
): { top: number; bottom: number; topTouches: number; bottomTouches: number; centerPct: number; valid: boolean } {
    let top = -Infinity;
    let bottom = Infinity;
    let closeSum = 0;
    for (let i = startIndex; i <= endIndex; i++) {
        top = Math.max(top, sourceData[i].high);
        bottom = Math.min(bottom, sourceData[i].low);
        closeSum += sourceData[i].close;
    }
    const height = top - bottom;
    const avgClose = closeSum / (endIndex - startIndex + 1);
    const centerPct = height > 0 ? ((avgClose - bottom) / height) * 100 : 50;

    const tol = (touchTolerancePct / 100) * height;
    let topTouches = 0;
    let bottomTouches = 0;
    for (let i = startIndex; i <= endIndex; i++) {
        if (Math.abs(sourceData[i].high - top) <= tol) topTouches++;
        if (Math.abs(sourceData[i].low - bottom) <= tol) bottomTouches++;
    }

    const isCentered = centerPct >= centerMinPct && centerPct <= centerMaxPct;
    const hasTouches = topTouches >= minTouchesPerSide && bottomTouches >= minTouchesPerSide;

    return { top, bottom, topTouches, bottomTouches, centerPct, valid: isCentered && hasTouches };
}

class ConsolidationRangeIndicator extends OverlayIndicator {
    private _opts: ConsolidationOptions;
    private _zones: ConsolidationZone[] = [];

    constructor(options: Partial<ConsolidationOptions> = {}) {
        const merged = { ...defaultOptions, ...options };
        super(merged);
        this._opts = { ...defaultOptions, ...this._options } as ConsolidationOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._opts };
    }

    updateOptions(newOptions: Partial<ConsolidationOptions>): boolean {
        const recalcKeys = [
            'lookback',
            'atrPeriod',
            'atrMult',
            'minBars',
            'extendBars',
            'touchTolerancePct',
            'minTouchesPerSide',
            'centerMinPct',
            'centerMaxPct',
        ];
        const needsRecalc = recalcKeys.some(
            (key) => newOptions[key] !== undefined && newOptions[key] !== this._opts[key]
        );
        Object.assign(this._opts, newOptions);
        Object.assign(this._options, newOptions);
        this._dataChanged.fire();
        return needsRecalc;
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<ConsolidationOptions>);
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        return needsRecalc;
    }

    calculate(sourceData: any[]): void {
        this._sourceData = sourceData;
        const opts = this._opts;

        const atr = calculateATR(sourceData, opts.atrPeriod);
        const { highs, lows } = rollingExtremes(sourceData, opts.lookback);
        const rawZones = detectRawZones(sourceData, highs, lows, atr, opts.minBars, opts.atrMult);

        const extend = Math.max(0, opts.extendBars || 0);
        const zones: ConsolidationZone[] = rawZones.map((z) => {
            const v = validateZone(
                sourceData,
                z.startIndex,
                z.endIndex,
                opts.touchTolerancePct,
                opts.minTouchesPerSide,
                opts.centerMinPct,
                opts.centerMaxPct
            );
            return {
                startIndex: z.startIndex,
                endIndex: z.endIndex,
                displayEndIndex: Math.min(z.endIndex + extend, sourceData.length - 1),
                top: v.top,
                bottom: v.bottom,
                barCount: z.endIndex - z.startIndex + 1,
                topTouches: v.topTouches,
                bottomTouches: v.bottomTouches,
                centerPct: v.centerPct,
                valid: v.valid,
            };
        });

        this._zones = zones;
        this._data = sourceData.map((bar) => ({ time: bar.time, value: NaN }));
    }

    getRange(): { min: number; max: number } {
        if (this._sourceData.length === 0) return { min: 0, max: 100 };
        let min = Infinity;
        let max = -Infinity;
        for (const bar of this._sourceData) {
            min = Math.min(min, bar.low);
            max = Math.max(max, bar.high);
        }
        return { min, max };
    }

    getDescription(): string {
        const validCount = this._zones.filter((z) => z.valid).length;
        return `Consolidation Range (${this._opts.lookback}, ${this._opts.minBars})${
            this._zones.length > 0 ? ` ${validCount}/${this._zones.length} valid` : ''
        }`;
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        const opts = this._opts;
        ctx.save();
        let validN = 0;
        let rejectedN = 0;
        for (const z of this._zones) {
            if (!z.valid && !opts.showRejected) continue;

            const color = z.valid ? opts.boxColor : opts.rejectedBoxColor;
            const label = z.valid ? `C${++validN}` : `x${++rejectedN}`;

            const x1 = timeScale.indexToCoordinate(z.startIndex as any) * hpr;
            const x2 = timeScale.indexToCoordinate(z.displayEndIndex as any) * hpr;
            const yTop = priceScale.priceToCoordinate(z.top) * vpr;
            const yBottom = priceScale.priceToCoordinate(z.bottom) * vpr;

            ctx.fillStyle = _hexToRgba(color, z.valid ? opts.boxOpacity : opts.boxOpacity * 0.5);
            ctx.fillRect(Math.min(x1, x2), Math.min(yTop, yBottom), Math.abs(x2 - x1), Math.abs(yBottom - yTop));

            ctx.strokeStyle = _hexToRgba(color, z.valid ? opts.borderOpacity : opts.borderOpacity * 0.5);
            ctx.lineWidth = 1 * hpr;
            ctx.setLineDash(z.valid ? [] : [3 * hpr, 3 * hpr]);
            ctx.strokeRect(Math.min(x1, x2), Math.min(yTop, yBottom), Math.abs(x2 - x1), Math.abs(yBottom - yTop));
            ctx.setLineDash([]);

            ctx.fillStyle = color;
            ctx.font = `${10 * hpr}px sans-serif`;
            ctx.fillText(label, Math.min(x1, x2) + 3 * hpr, Math.min(yTop, yBottom) + 11 * hpr);
        }
        ctx.restore();
    }

    hitTest(): boolean {
        return false;
    }
}

function _hexToRgba(hex: string, alpha: number): string {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

globalThis.__draftIndicatorClass = ConsolidationRangeIndicator;
