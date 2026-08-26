interface RangeDetectorOptions {
    name?: string;
    length: number; // minimum range length (also the SMA period)
    mult: number; // range width multiplier applied to the long ATR
    atrLen: number; // ATR period — deliberately long, a slow/stable volatility benchmark
    extendBars: number; // how many bars to extend the box display past its own last update
    upColor: string; // box color once price closes above the range (broken upward)
    dnColor: string; // box color once price closes below the range (broken downward)
    unbrokenColor: string; // box color while price remains inside the range
    boxOpacity: number;
    [key: string]: any;
}

type BreakState = 'unbroken' | 'up' | 'down';

interface RangeZone {
    startIndex: number; // n[length] at first detection — left edge of the box
    endIndex: number; // last bar the zone was actively extended/merged on
    displayEndIndex: number;
    top: number;
    bottom: number;
    state: BreakState; // classification as of endIndex (does the close sit above/below/inside the box)
}

const defaultOptions: RangeDetectorOptions = {
    name: 'Range Detector',
    length: 20,
    mult: 1.0,
    atrLen: 500,
    extendBars: 0,
    upColor: '#089981',
    dnColor: '#f23645',
    unbrokenColor: '#2157f3',
    boxOpacity: 0.2,
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

function sma(values: number[], period: number): number[] {
    const n = values.length;
    const out = new Array(n).fill(NaN);
    for (let i = 0; i < n; i++) {
        const start = Math.max(0, i - period + 1);
        if (i - start + 1 < period) continue; // need a full window, matching Pine's ta.sma warm-up
        let sum = 0;
        for (let j = start; j <= i; j++) sum += values[j];
        out[i] = sum / period;
    }
    return out;
}

// Faithful port of LuxAlgo's Range Detector:
//   ma  = SMA(close, length)
//   atr = ATR(atrLen) * mult          (deliberately slow-moving benchmark)
//   count = number of the last `length` closes whose |close - ma| exceeds atr
//   count == 0  =>  every one of those closes sits within the +-atr band
//                   around the current SMA: a validated range.
// Consecutive/overlapping detections are merged into one growing box (taking
// the union of top/bottom) rather than drawn as separate boxes, exactly as
// the source script does via `bx.get_right()` overlap testing.
function detectZones(sourceData: any[], length: number, mult: number, atrLen: number): RangeZone[] {
    const n = sourceData.length;
    const closes = sourceData.map((b) => b.close);
    const ma = sma(closes, length);
    const atrRaw = calculateATR(sourceData, atrLen);

    const zones: RangeZone[] = [];
    let countPrev = -1; // sentinel so the very first bar can't spuriously "transition" into count 0
    let zoneOpen = false;

    for (let i = 0; i < n; i++) {
        const atrVal = atrRaw[i] * mult;
        if (isNaN(ma[i]) || !atrVal || atrVal <= 0 || i < length - 1) {
            countPrev = -1;
            zoneOpen = false;
            continue;
        }

        let count = 0;
        for (let k = 0; k < length; k++) {
            const idx = i - k;
            if (idx < 0) continue;
            if (Math.abs(closes[idx] - ma[i]) > atrVal) count++;
        }

        if (count === 0 && countPrev !== 0) {
            const newStart = i - length + 1;
            const newTop = ma[i] + atrVal;
            const newBottom = ma[i] - atrVal;

            const last = zones[zones.length - 1];
            if (last && newStart <= last.endIndex) {
                // Overlaps the previous box: merge (union of bounds), matching
                // the source's `n[length] <= bx.get_right()` branch.
                last.top = Math.max(last.top, newTop);
                last.bottom = Math.min(last.bottom, newBottom);
                last.endIndex = i;
            } else {
                zones.push({ startIndex: newStart, endIndex: i, displayEndIndex: i, top: newTop, bottom: newBottom, state: 'unbroken' });
            }
            zoneOpen = true;
        } else if (count === 0 && zoneOpen) {
            const last = zones[zones.length - 1];
            if (last) last.endIndex = i;
        } else {
            zoneOpen = false;
        }

        // Live breakout classification against whichever zone is currently active/most recent.
        const active = zones[zones.length - 1];
        if (active && i >= active.startIndex) {
            const c = closes[i];
            if (c > active.top) active.state = 'up';
            else if (c < active.bottom) active.state = 'down';
            // else: leave state as-is (matches the source, which only recolors on an actual break)
        }

        countPrev = count;
    }

    return zones;
}

class RangeDetectorIndicator extends OverlayIndicator {
    private _opts: RangeDetectorOptions;
    private _zones: RangeZone[] = [];

    constructor(options: Partial<RangeDetectorOptions> = {}) {
        const merged = { ...defaultOptions, ...options };
        super(merged);
        this._opts = { ...defaultOptions, ...this._options } as RangeDetectorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._opts };
    }

    updateOptions(newOptions: Partial<RangeDetectorOptions>): boolean {
        const recalcKeys = ['length', 'mult', 'atrLen', 'extendBars'];
        const needsRecalc = recalcKeys.some(
            (key) => newOptions[key] !== undefined && newOptions[key] !== this._opts[key]
        );
        Object.assign(this._opts, newOptions);
        Object.assign(this._options, newOptions);
        this._dataChanged.fire();
        return needsRecalc;
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<RangeDetectorOptions>);
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        return needsRecalc;
    }

    calculate(sourceData: any[]): void {
        this._sourceData = sourceData;
        const opts = this._opts;

        const zones = detectZones(sourceData, opts.length, opts.mult, opts.atrLen);
        const extend = Math.max(0, opts.extendBars || 0);
        for (const z of zones) {
            z.displayEndIndex = Math.min(z.endIndex + extend, sourceData.length - 1);
        }

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
        return `Range Detector (${this._opts.length}, ${this._opts.mult})${
            this._zones.length > 0 ? ` ${this._zones.length} zone` : ''
        }`;
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        const opts = this._opts;
        ctx.save();
        for (let i = 0; i < this._zones.length; i++) {
            const z = this._zones[i];
            const color = z.state === 'up' ? opts.upColor : z.state === 'down' ? opts.dnColor : opts.unbrokenColor;

            const x1 = timeScale.indexToCoordinate(z.startIndex as any) * hpr;
            const x2 = timeScale.indexToCoordinate(z.displayEndIndex as any) * hpr;
            const yTop = priceScale.priceToCoordinate(z.top) * vpr;
            const yBottom = priceScale.priceToCoordinate(z.bottom) * vpr;

            ctx.fillStyle = _hexToRgba(color, opts.boxOpacity);
            ctx.fillRect(Math.min(x1, x2), Math.min(yTop, yBottom), Math.abs(x2 - x1), Math.abs(yBottom - yTop));

            ctx.strokeStyle = color;
            ctx.lineWidth = 1 * hpr;
            ctx.strokeRect(Math.min(x1, x2), Math.min(yTop, yBottom), Math.abs(x2 - x1), Math.abs(yBottom - yTop));

            // Midline, as in the source (a dotted level line through the box center).
            const yMid = priceScale.priceToCoordinate((z.top + z.bottom) / 2) * vpr;
            ctx.strokeStyle = color;
            ctx.setLineDash([2 * hpr, 2 * hpr]);
            ctx.beginPath();
            ctx.moveTo(Math.min(x1, x2), yMid);
            ctx.lineTo(Math.max(x1, x2), yMid);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = color;
            ctx.font = `${10 * hpr}px sans-serif`;
            ctx.fillText(`R${i + 1}`, Math.min(x1, x2) + 3 * hpr, Math.min(yTop, yBottom) + 11 * hpr);
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

globalThis.__draftIndicatorClass = RangeDetectorIndicator;
