interface ZigZagIndicatorOptions {
    name?: string;
    color: string;
    lineWidth: number;
    period: number;
    [key: string]: any;
}

interface ZigZagPoint {
    time: any;
    price: number;
    index: number;
    type: 'high' | 'low';
}

const defaultZigZagIndicatorOptions: ZigZagIndicatorOptions = {
    name: 'ZigZag',
    color: '#f59e0b',
    lineWidth: 2,
    period: 15,
};

// Fractal-style pivot detection: a bar is a pivot high/low if its high/low is the
// most extreme within `period` bars on either side. Consecutive same-type pivots
// are collapsed, keeping the most extreme one, so the result strictly alternates.
function calculateZigZagPoints(sourceData: any[], options: { period: number }): ZigZagPoint[] {
    const period = Math.max(1, options.period || 15);
    const n = sourceData.length;
    const rawPivots: ZigZagPoint[] = [];

    for (let i = 0; i < n; i++) {
        const start = Math.max(0, i - period);
        const end = Math.min(n - 1, i + period);
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
    for (const p of rawPivots) {
        const last = result[result.length - 1];
        if (!last) {
            result.push(p);
            continue;
        }
        if (last.type === p.type) {
            if ((p.type === 'high' && p.price > last.price) || (p.type === 'low' && p.price < last.price)) {
                result[result.length - 1] = p;
            }
        } else {
            result.push(p);
        }
    }

    return result;
}

class ZigZagIndicator extends OverlayIndicator {
    private _zigZagOptions: ZigZagIndicatorOptions;
    private _points: ZigZagPoint[] = [];

    constructor(options: Partial<ZigZagIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultZigZagIndicatorOptions, ...options };
        super(mergedOptions);
        this._zigZagOptions = { ...defaultZigZagIndicatorOptions, ...this._options } as ZigZagIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._zigZagOptions };
    }

    updateOptions(newOptions: Partial<ZigZagIndicatorOptions>): boolean {
        const needsRecalc =
            newOptions.period !== undefined && newOptions.period !== this._zigZagOptions.period;

        Object.assign(this._zigZagOptions, newOptions);
        Object.assign(this._options, newOptions);

        this._dataChanged.fire();
        return needsRecalc;
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<ZigZagIndicatorOptions>);
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        return needsRecalc;
    }

    calculate(sourceData: any[]): void {
        this._sourceData = sourceData;
        this._points = calculateZigZagPoints(sourceData, {
            period: this._zigZagOptions.period,
        });

        this._data = this._points.map((point) => ({
            time: point.time,
            value: point.price,
        }));
    }

    getRange(): { min: number; max: number } {
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
        const count = this._points.length;
        return `ZigZag (${this._zigZagOptions.period})${count > 0 ? ` ${count}` : ''}`;
    }

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number
    ): void {
        if (this._points.length < 2) {
            return;
        }

        ctx.save();
        ctx.strokeStyle = this._zigZagOptions.color;
        ctx.lineWidth = this._zigZagOptions.lineWidth * hpr;
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

    hitTest(x: number, y: number, timeScale: any, priceScale: any): boolean {
        if (this._points.length < 2) {
            return false;
        }

        const threshold = 8;
        for (let i = 1; i < this._points.length; i++) {
            const start = this._points[i - 1];
            const end = this._points[i];
            const x1 = timeScale.indexToCoordinate(start.index as any);
            const y1 = priceScale.priceToCoordinate(start.price);
            const x2 = timeScale.indexToCoordinate(end.index as any);
            const y2 = priceScale.priceToCoordinate(end.price);

            if (_distanceToSegment(x, y, x1, y1, x2, y2) <= threshold) {
                return true;
            }
        }

        return false;
    }
}

function _distanceToSegment(
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

globalThis.__draftIndicatorClass = ZigZagIndicator;
