interface IctObOptions {
    name?: string;
    period: number; // ZigZag fractal period used to find swing highs/lows (structure/BOS points)
    requireDisplacement: boolean; // Filter 1: the breakout candle's own range must dwarf the OB candle's own range
    displacementRatio: number; // breakout candle's (high-low) must be at least this many times the OB candle's (high-low)
    extendBars: number; // how many bars to extend a confirmed order block box to the right
    bullColor: string;
    bearColor: string;
    boxOpacity: number;
    [key: string]: any;
}

interface ZigZagPoint {
    price: number;
    index: number;
    type: 'high' | 'low';
}

type ObDirection = 'bull' | 'bear';

interface OrderBlock {
    direction: ObDirection;
    obIndex: number; // the last opposite-colored candle before the break-of-structure move
    breakIndex: number; // the bar whose close broke structure (confirming the order block)
    displayEndIndex: number;
    top: number; // order block candle's high
    bottom: number; // order block candle's low
    mean: number; // the 50% "mean threshold" of the block
    mitigated: boolean; // a candle BODY has closed back through the block (not just a wick touch)
}

// Base configuration: displacement filter off by default (added back in one
// at a time, as requested). When enabled, it's a direct visual comparison —
// the breakout candle's own range (high-low) must be at least
// `displacementRatio` times the OB candle's own range — no ATR, no
// body/range ratio. Calibrated from a reference sketch showing the
// displacement candle at roughly ~3x the OB candle's height.
const defaultOptions: IctObOptions = {
    name: 'ICT OB',
    period: 5,
    requireDisplacement: false,
    displacementRatio: 3,
    extendBars: 40,
    bullColor: '#22c55e',
    bearColor: '#ef4444',
    boxOpacity: 0.18,
};

// Fractal-style pivot detection: a bar is a pivot high/low if its high/low is
// the most extreme within `period` bars on either side. Consecutive same-type
// pivots are collapsed to the most extreme one so the result strictly
// alternates high/low. These pivots stand in for "market structure" points
// used for break-of-structure (BOS) detection.
function calculateZigZagPoints(sourceData: any[], period: number): ZigZagPoint[] {
    const p = Math.max(1, period || 5);
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

        if (isHigh) rawPivots.push({ price: h, index: i, type: 'high' });
        else if (isLow) rawPivots.push({ price: l, index: i, type: 'low' });
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

// Order block detection — the last opposite-colored candle before a
// close-based break of structure (BOS) against the most recent ZigZag swing
// high/low, gated by an optional displacement filter on the breakout candle:
//
//  requireDisplacement: the breakout candle's own range (high - low) must be
//  at least `displacementRatio` times the OB candle's own range. This is a
//  direct, candle-to-candle visual comparison — not ATR-normalized and not a
//  body/range purity check — matching a reference sketch where the
//  displacement candle towers over the OB candle by roughly 3x its height.
//
// Two structural details baked into the base logic regardless of the
// filter's state:
//  1. The pivot cursor uses strict `< i` (a bar's own freshly-confirmed
//     pivot never overwrites the reference before that same bar's own BOS
//     check runs).
//  2. The swing reference trails forward by CLOSE after each trigger,
//     rather than being nulled out.
// "Mitigated" is tracked for display only — it does not filter blocks out.
function detectOrderBlocks(
    sourceData: any[],
    points: ZigZagPoint[],
    requireDisplacement: boolean,
    displacementRatio: number,
    extendBars: number
): OrderBlock[] {
    const n = sourceData.length;
    const blocks: OrderBlock[] = [];

    let lastSwingHigh: number | null = null;
    let lastSwingLow: number | null = null;
    let pivotCursor = 0;

    const isDisplacementCandle = (breakIndex: number, obIndex: number): boolean => {
        if (!requireDisplacement) return true;
        const breakBar = sourceData[breakIndex];
        const obBar = sourceData[obIndex];
        const breakRange = breakBar.high - breakBar.low;
        const obRange = obBar.high - obBar.low;
        if (obRange <= 0) return false;
        return breakRange >= displacementRatio * obRange;
    };

    for (let i = 0; i < n; i++) {
        while (pivotCursor < points.length && points[pivotCursor].index < i) {
            const pt = points[pivotCursor];
            if (pt.type === 'high') lastSwingHigh = pt.price;
            else lastSwingLow = pt.price;
            pivotCursor++;
        }

        if (i === 0) continue;
        const bar = sourceData[i];

        // Bullish BOS: close breaks above the last known swing high.
        if (lastSwingHigh !== null && bar.close > lastSwingHigh && bar.close > bar.open) {
            let obIndex = -1;
            for (let k = i - 1; k >= 0; k--) {
                if (sourceData[k].close < sourceData[k].open) {
                    obIndex = k;
                    break;
                }
                if (k < i - 5) break;
            }
            if (obIndex !== -1 && isDisplacementCandle(i, obIndex)) {
                const obBar = sourceData[obIndex];
                const top = obBar.high;
                const bottom = obBar.low;
                const mean = (top + bottom) / 2;
                let mitigated = false;
                for (let m = i + 1; m < Math.min(n, i + 1 + extendBars); m++) {
                    const bodyLow = Math.min(sourceData[m].open, sourceData[m].close);
                    if (bodyLow <= top) {
                        mitigated = true;
                        break;
                    }
                }
                blocks.push({
                    direction: 'bull',
                    obIndex,
                    breakIndex: i,
                    displayEndIndex: Math.min(i + extendBars, n - 1),
                    top,
                    bottom,
                    mean,
                    mitigated,
                });
            }
            lastSwingHigh = Math.max(lastSwingHigh, bar.close);
        }

        // Bearish BOS: close breaks below the last known swing low.
        if (lastSwingLow !== null && bar.close < lastSwingLow && bar.close < bar.open) {
            let obIndex = -1;
            for (let k = i - 1; k >= 0; k--) {
                if (sourceData[k].close > sourceData[k].open) {
                    obIndex = k;
                    break;
                }
                if (k < i - 5) break;
            }
            if (obIndex !== -1 && isDisplacementCandle(i, obIndex)) {
                const obBar = sourceData[obIndex];
                const top = obBar.high;
                const bottom = obBar.low;
                const mean = (top + bottom) / 2;
                let mitigated = false;
                for (let m = i + 1; m < Math.min(n, i + 1 + extendBars); m++) {
                    const bodyHigh = Math.max(sourceData[m].open, sourceData[m].close);
                    if (bodyHigh >= bottom) {
                        mitigated = true;
                        break;
                    }
                }
                blocks.push({
                    direction: 'bear',
                    obIndex,
                    breakIndex: i,
                    displayEndIndex: Math.min(i + extendBars, n - 1),
                    top,
                    bottom,
                    mean,
                    mitigated,
                });
            }
            lastSwingLow = Math.min(lastSwingLow, bar.close);
        }
    }

    return blocks;
}

class IctObIndicator extends OverlayIndicator {
    private _opts: IctObOptions;
    private _points: ZigZagPoint[] = [];
    private _blocks: OrderBlock[] = [];

    constructor(options: Partial<IctObOptions> = {}) {
        const merged = { ...defaultOptions, ...options };
        super(merged);
        this._opts = { ...defaultOptions, ...this._options } as IctObOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._opts };
    }

    updateOptions(newOptions: Partial<IctObOptions>): boolean {
        const recalcKeys = ['period', 'requireDisplacement', 'displacementRatio', 'extendBars'];
        const needsRecalc = recalcKeys.some(
            (key) => newOptions[key] !== undefined && newOptions[key] !== this._opts[key]
        );
        Object.assign(this._opts, newOptions);
        Object.assign(this._options, newOptions);
        this._dataChanged.fire();
        return needsRecalc;
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<IctObOptions>);
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        return needsRecalc;
    }

    calculate(sourceData: any[]): void {
        this._sourceData = sourceData;
        const opts = this._opts;

        this._points = calculateZigZagPoints(sourceData, opts.period);
        this._blocks = detectOrderBlocks(sourceData, this._points, opts.requireDisplacement, opts.displacementRatio, opts.extendBars);

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
        const bullN = this._blocks.filter((b) => b.direction === 'bull').length;
        const bearN = this._blocks.filter((b) => b.direction === 'bear').length;
        return `ICT OB (${this._opts.period})${this._blocks.length > 0 ? ` ${bullN} bull / ${bearN} bear` : ''}`;
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        const opts = this._opts;
        ctx.save();
        let bullN = 0;
        let bearN = 0;
        for (const b of this._blocks) {
            const color = b.direction === 'bull' ? opts.bullColor : opts.bearColor;
            const label = b.direction === 'bull' ? `OB${++bullN}+` : `OB${++bearN}-`;

            const x1 = timeScale.indexToCoordinate(b.obIndex as any) * hpr;
            const x2 = timeScale.indexToCoordinate(b.displayEndIndex as any) * hpr;
            const yTop = priceScale.priceToCoordinate(b.top) * vpr;
            const yBottom = priceScale.priceToCoordinate(b.bottom) * vpr;
            const yMean = priceScale.priceToCoordinate(b.mean) * vpr;

            ctx.fillStyle = _hexToRgba(color, b.mitigated ? opts.boxOpacity * 0.4 : opts.boxOpacity);
            ctx.fillRect(Math.min(x1, x2), Math.min(yTop, yBottom), Math.abs(x2 - x1), Math.abs(yBottom - yTop));

            ctx.strokeStyle = color;
            ctx.lineWidth = 1 * hpr;
            ctx.setLineDash(b.mitigated ? [3 * hpr, 3 * hpr] : []);
            ctx.strokeRect(Math.min(x1, x2), Math.min(yTop, yBottom), Math.abs(x2 - x1), Math.abs(yBottom - yTop));
            ctx.setLineDash([]);

            // 50% mean threshold line through the block.
            ctx.strokeStyle = color;
            ctx.setLineDash([2 * hpr, 2 * hpr]);
            ctx.beginPath();
            ctx.moveTo(Math.min(x1, x2), yMean);
            ctx.lineTo(Math.max(x1, x2), yMean);
            ctx.stroke();
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

globalThis.__draftIndicatorClass = IctObIndicator;
