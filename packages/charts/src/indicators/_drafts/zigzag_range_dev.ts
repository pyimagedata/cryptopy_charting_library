interface ZigZagRangeOptions {
    name?: string;
    color: string;
    lineWidth: number;
    period: number; // ZigZag fractal period — how many bars on each side must be less extreme for a pivot
    atrPeriod: number; // ATR period used to normalize the top/bottom flatness check
    flatnessMult: number; // max allowed AVERAGE of the top-diff and bottom-diff (each in ATR units)
    extendBars: number; // how many bars to extend a confirmed range box to the right, past its own end
    boxColor: string;
    bodyBoxColor: string; // box color when the range only qualifies via the body-based check
    boxOpacity: number;
    [key: string]: any;
}

interface ZigZagPoint {
    time: any;
    price: number;
    index: number;
    type: 'high' | 'low';
}

type FlatnessBasis = 'wick' | 'body';

interface FlatRange {
    startIndex: number; // index of the first of the 4 pivots
    endIndex: number; // index of the last of the 4 pivots
    displayEndIndex: number;
    top: number;
    bottom: number;
    avgDiffAtr: number;
    basis: FlatnessBasis; // which measurement (wick or body) qualified this range
}

const defaultOptions: ZigZagRangeOptions = {
    name: 'ZigZag Range',
    color: '#3b82f6',
    lineWidth: 2,
    period: 3,
    atrPeriod: 14,
    // Calibrated against this chart's own pivot-pair distribution: the
    // AVERAGE of the top-diff and bottom-diff (each in ATR units) under this
    // cutoff keeps roughly the flattest ~10% of all "2 top + 2 bottom" pivot
    // windows.
    flatnessMult: 0.5,
    extendBars: 0,
    boxColor: '#3b82f6',
    bodyBoxColor: '#14b8a6',
    boxOpacity: 0.15,
};

// Fractal-style pivot detection: a bar is a pivot high/low if its high/low is
// the most extreme within `period` bars on either side. Consecutive same-type
// pivots are collapsed to the most extreme one so the result strictly
// alternates high/low.
function calculateZigZagPoints(sourceData: any[], period: number): ZigZagPoint[] {
    const p = Math.max(1, period || 3);
    const n = sourceData.length;
    const rawPivots: ZigZagPoint[] = [];

    for (let i = 0; i < n; i++) {
        const start = Math.max(0, i - p);
        const end = Math.min(n - 1, i + p);
        const h = sourceData[i].high;
        const l = sourceData[i].low;

        let isHigh = true;
        let isLow = true;
        for (let j = start; j <= end; j++) {
            if (j === i) continue;
            if (sourceData[j].high > h) isHigh = false;
            if (sourceData[j].low < l) isLow = false;
        }

        if (isHigh) {
            rawPivots.push({ time: sourceData[i].time, price: h, index: i, type: 'high' });
        } else if (isLow) {
            rawPivots.push({ time: sourceData[i].time, price: l, index: i, type: 'low' });
        }
    }

    const result: ZigZagPoint[] = [];
    for (const pt of rawPivots) {
        const last = result[result.length - 1];
        if (!last) {
            result.push(pt);
            continue;
        }
        if (last.type === pt.type) {
            if ((pt.type === 'high' && pt.price > last.price) || (pt.type === 'low' && pt.price < last.price)) {
                result[result.length - 1] = pt;
            }
        } else {
            result.push(pt);
        }
    }

    return result;
}

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

// Scan every consecutive 4-pivot window (2 highs + 2 lows, in either order).
// A window qualifies as a flat range if EITHER:
//   (a) the wick-based top/bottom average difference is under `flatnessMult`
//       ATR (the pivots' own high/low values), or
//   (b) the candle-BODY-based average difference is under the same cutoff
//       (using max(open,close) for the 2 "top" bars and min(open,close) for
//       the 2 "bottom" bars instead of their wicks).
// (b) rescues cases where a single spike wick breaks an otherwise flat
// structure that the actual traded/closed prices still respected. Whichever
// basis passes (preferring wick if both do) is used for the box's own
// top/bottom coordinates, since that's the measurement that's actually flat.
function detectFlatRanges(
    sourceData: any[],
    points: ZigZagPoint[],
    atr: number[],
    flatnessMult: number
): FlatRange[] {
    const ranges: FlatRange[] = [];

    for (let i = 0; i + 3 < points.length; i++) {
        const window = points.slice(i, i + 4);
        const highs = window.filter((p) => p.type === 'high');
        const lows = window.filter((p) => p.type === 'low');
        if (highs.length !== 2 || lows.length !== 2) continue;

        const endIndex = window[3].index;
        const atrVal = atr[endIndex];
        if (!atrVal || atrVal <= 0) continue;

        // Wick-based (the pivots' own detected extreme values).
        const wickTopDiff = Math.abs(highs[0].price - highs[1].price) / atrVal;
        const wickBottomDiff = Math.abs(lows[0].price - lows[1].price) / atrVal;
        const wickAvg = (wickTopDiff + wickBottomDiff) / 2;

        // Body-based (max/min of open,close on those same 4 bars).
        const bh0 = Math.max(sourceData[highs[0].index].open, sourceData[highs[0].index].close);
        const bh1 = Math.max(sourceData[highs[1].index].open, sourceData[highs[1].index].close);
        const bl0 = Math.min(sourceData[lows[0].index].open, sourceData[lows[0].index].close);
        const bl1 = Math.min(sourceData[lows[1].index].open, sourceData[lows[1].index].close);
        const bodyTopDiff = Math.abs(bh0 - bh1) / atrVal;
        const bodyBottomDiff = Math.abs(bl0 - bl1) / atrVal;
        const bodyAvg = (bodyTopDiff + bodyBottomDiff) / 2;

        let basis: FlatnessBasis | null = null;
        let avgDiffAtr = 0;
        let top = 0;
        let bottom = 0;

        if (wickAvg <= flatnessMult) {
            basis = 'wick';
            avgDiffAtr = wickAvg;
            top = (highs[0].price + highs[1].price) / 2;
            bottom = (lows[0].price + lows[1].price) / 2;
        } else if (bodyAvg <= flatnessMult) {
            basis = 'body';
            avgDiffAtr = bodyAvg;
            top = (bh0 + bh1) / 2;
            bottom = (bl0 + bl1) / 2;
        }

        if (basis) {
            ranges.push({ startIndex: window[0].index, endIndex, displayEndIndex: endIndex, top, bottom, avgDiffAtr, basis });
        }
    }

    return ranges;
}

class ZigZagRangeIndicator extends OverlayIndicator {
    private _opts: ZigZagRangeOptions;
    private _points: ZigZagPoint[] = [];
    private _ranges: FlatRange[] = [];

    constructor(options: Partial<ZigZagRangeOptions> = {}) {
        const merged = { ...defaultOptions, ...options };
        super(merged);
        this._opts = { ...defaultOptions, ...this._options } as ZigZagRangeOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._opts };
    }

    updateOptions(newOptions: Partial<ZigZagRangeOptions>): boolean {
        const recalcKeys = ['period', 'atrPeriod', 'flatnessMult', 'extendBars'];
        const needsRecalc = recalcKeys.some(
            (key) => newOptions[key] !== undefined && newOptions[key] !== this._opts[key]
        );
        Object.assign(this._opts, newOptions);
        Object.assign(this._options, newOptions);
        this._dataChanged.fire();
        return needsRecalc;
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<ZigZagRangeOptions>);
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        return needsRecalc;
    }

    calculate(sourceData: any[]): void {
        this._sourceData = sourceData;
        const opts = this._opts;

        this._points = calculateZigZagPoints(sourceData, opts.period);
        const atr = calculateATR(sourceData, opts.atrPeriod);
        const ranges = detectFlatRanges(sourceData, this._points, atr, opts.flatnessMult);

        const extend = Math.max(0, opts.extendBars || 0);
        for (const r of ranges) {
            r.displayEndIndex = Math.min(r.endIndex + extend, sourceData.length - 1);
        }
        this._ranges = ranges;

        this._data = this._points.map((point) => ({ time: point.time, value: point.price }));
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
        const wickN = this._ranges.filter((r) => r.basis === 'wick').length;
        const bodyN = this._ranges.filter((r) => r.basis === 'body').length;
        return `ZigZag Range (${this._opts.period})${
            this._ranges.length > 0 ? ` ${wickN} wick / ${bodyN} body` : ''
        }`;
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        const opts = this._opts;

        // ZigZag line, for context.
        if (this._points.length >= 2) {
            ctx.save();
            ctx.strokeStyle = opts.color;
            ctx.lineWidth = opts.lineWidth * hpr;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            let started = false;
            for (const point of this._points) {
                const x = timeScale.indexToCoordinate(point.index as any) * hpr;
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

        // Flat 2-top/2-bottom ranges. Wick-qualified boxes use boxColor,
        // body-qualified (wick-rescued-by-body) boxes use bodyBoxColor.
        ctx.save();
        for (let i = 0; i < this._ranges.length; i++) {
            const r = this._ranges[i];
            const color = r.basis === 'wick' ? opts.boxColor : opts.bodyBoxColor;
            const x1 = timeScale.indexToCoordinate(r.startIndex as any) * hpr;
            const x2 = timeScale.indexToCoordinate(r.displayEndIndex as any) * hpr;
            const yTop = priceScale.priceToCoordinate(r.top) * vpr;
            const yBottom = priceScale.priceToCoordinate(r.bottom) * vpr;

            ctx.fillStyle = _hexToRgba(color, opts.boxOpacity);
            ctx.fillRect(Math.min(x1, x2), Math.min(yTop, yBottom), Math.abs(x2 - x1), Math.abs(yBottom - yTop));

            ctx.strokeStyle = color;
            ctx.lineWidth = 1 * hpr;
            ctx.setLineDash(r.basis === 'wick' ? [4 * hpr, 3 * hpr] : []);
            ctx.strokeRect(Math.min(x1, x2), Math.min(yTop, yBottom), Math.abs(x2 - x1), Math.abs(yBottom - yTop));
            ctx.setLineDash([]);

            ctx.fillStyle = color;
            ctx.font = `${10 * hpr}px sans-serif`;
            ctx.fillText(`Z${i + 1}`, Math.min(x1, x2) + 3 * hpr, Math.min(yTop, yBottom) + 11 * hpr);
        }
        ctx.restore();
    }

    hitTest(x: number, y: number, timeScale: any, priceScale: any): boolean {
        if (this._points.length < 2) return false;
        const threshold = 8;
        for (let i = 1; i < this._points.length; i++) {
            const p1 = this._points[i - 1];
            const p2 = this._points[i];
            const x1 = timeScale.indexToCoordinate(p1.index as any);
            const y1 = priceScale.priceToCoordinate(p1.price);
            const x2 = timeScale.indexToCoordinate(p2.index as any);
            const y2 = priceScale.priceToCoordinate(p2.price);
            const dx = x2 - x1;
            const dy = y2 - y1;
            if (dx === 0 && dy === 0) {
                if (Math.hypot(x - x1, y - y1) <= threshold) return true;
                continue;
            }
            const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
            const cx = x1 + t * dx;
            const cy = y1 + t * dy;
            if (Math.hypot(x - cx, y - cy) <= threshold) return true;
        }
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

globalThis.__draftIndicatorClass = ZigZagRangeIndicator;
