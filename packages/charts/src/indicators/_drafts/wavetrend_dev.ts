// WaveTrend Oscillator (LazyBear WT_LB), ayri panelde.
//   ap  = (high + low + close) / 3
//   esa = ema(ap, n1)
//   d   = ema(abs(ap - esa), n1)
//   ci  = (ap - esa) / (0.015 * d)
//   wt1 = ema(ci, n2)
//   wt2 = sma(wt1, 4)
// EMA Pine ta.ema gibi: ilk NaN-olmayan degerle tohumlanir, alpha = 2/(len+1);
// NaN girdide onceki deger tasinir (ilk deger gelene kadar NaN).

interface WaveTrendOptions {
    name: string;
    style: string;
    color: string;
    lineWidth: number;
    n1: number;
    n2: number;
    obLevel1: number;
    obLevel2: number;
    osLevel1: number;
    osLevel2: number;
    wt1Color: string;
    wt2Color: string;
    histColor: string;
    levelColor: string;
    crossUpColor: string;
    crossDownColor: string;
}

const defaultWaveTrendOptions: WaveTrendOptions = {
    name: 'WaveTrend',
    style: 'line',
    color: '#26a69a',
    lineWidth: 2,
    n1: 10,
    n2: 21,
    obLevel1: 60,
    obLevel2: 53,
    osLevel1: -60,
    osLevel2: -53,
    wt1Color: '#26a69a',
    wt2Color: '#ef5350',
    histColor: 'rgba(33, 150, 243, 0.4)',
    levelColor: 'rgba(150, 150, 150, 0.7)',
    crossUpColor: '#26a69a',
    crossDownColor: '#ef5350',
};

function waveTrendEma(src: ArrayLike<number>, len: number): number[] {
    const alpha = 2 / (len + 1);
    const out: number[] = new Array(src.length);
    let prev = NaN;
    for (let i = 0; i < src.length; i++) {
        const x = src[i];
        if (Number.isNaN(x)) {
            out[i] = prev;
        } else {
            prev = Number.isNaN(prev) ? x : alpha * x + (1 - alpha) * prev;
            out[i] = prev;
        }
    }
    return out;
}

function waveTrendSma(src: ArrayLike<number>, len: number): number[] {
    const out: number[] = new Array(src.length);
    for (let i = 0; i < src.length; i++) {
        if (i < len - 1) { out[i] = NaN; continue; }
        let s = 0;
        for (let k = i - len + 1; k <= i; k++) s += src[k];
        out[i] = s / len; // pencerede NaN varsa NaN
    }
    return out;
}

function computeWaveTrend(high: ArrayLike<number>, low: ArrayLike<number>, close: ArrayLike<number>, n1: number, n2: number): { wt1: number[]; wt2: number[] } {
    const n = close.length;
    const ap: number[] = new Array(n);
    for (let i = 0; i < n; i++) ap[i] = (high[i] + low[i] + close[i]) / 3;
    const esa = waveTrendEma(ap, n1);
    const dev: number[] = new Array(n);
    for (let i = 0; i < n; i++) dev[i] = Math.abs(ap[i] - esa[i]);
    const d = waveTrendEma(dev, n1);
    const ci: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
        const den = 0.015 * d[i];
        ci[i] = den === 0 ? 0 : (ap[i] - esa[i]) / den;
    }
    const wt1 = waveTrendEma(ci, n2);
    const wt2 = waveTrendSma(wt1, 4);
    return { wt1, wt2 };
}

class WaveTrendIndicator extends PanelIndicator {
    private _wtOptions: WaveTrendOptions;

    constructor(options: Partial<WaveTrendOptions> = {}) {
        const merged = { ...defaultWaveTrendOptions, ...options };
        super(merged as any);
        this._wtOptions = { ...defaultWaveTrendOptions, ...this._options } as WaveTrendOptions;
        this._paneHeight = 140;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._wtOptions };
    }

    setSettingValue(key: string, value: any): boolean {
        (this._wtOptions as any)[key] = value;
        (this._options as any)[key] = value;
        if (key === 'n1' || key === 'n2') {
            this._options.name = `WaveTrend (${this._wtOptions.n1}, ${this._wtOptions.n2})`;
            this._wtOptions.name = this._options.name;
        }
        if (this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
        return true;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._data = [];
        const n = sourceData.length;
        if (n === 0) return;
        const h = sourceData.map((b) => b.high);
        const l = sourceData.map((b) => b.low);
        const c = sourceData.map((b) => b.close);
        const { wt1, wt2 } = computeWaveTrend(h, l, c, Math.max(1, this._wtOptions.n1), Math.max(1, this._wtOptions.n2));
        for (let i = 0; i < n; i++) {
            this._data.push({ time: sourceData[i].time, value: wt1[i], values: [wt1[i], wt2[i]] });
        }
    }

    getRange(): IndicatorRange {
        let m = Math.max(Math.abs(this._wtOptions.obLevel1), Math.abs(this._wtOptions.osLevel1), 60);
        for (const p of this._data) {
            const v = p.values;
            if (!v) continue;
            for (const x of v) if (Number.isFinite(x) && Math.abs(x) > m) m = Math.abs(x);
        }
        m *= 1.05;
        return { min: -m, max: m };
    }

    getLineColors(): string[] {
        return [this._wtOptions.wt1Color, this._wtOptions.wt2Color];
    }

    getDescription(index?: number): string {
        const i = index !== undefined && index >= 0 && index < this._data.length ? index : this._data.length - 1;
        const v = i >= 0 ? this._data[i].values : undefined;
        const f = (x: number | undefined) => (x === undefined || Number.isNaN(x) ? '-' : x.toFixed(2));
        return `WaveTrend (${this._wtOptions.n1}, ${this._wtOptions.n2}): ${f(v?.[0])} ${f(v?.[1])}`;
    }

    // Pane widget hook: tum panel icerigini kendimiz ciziyoruz (ctx medya piksel olceginde).
    drawPane(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, width: number, _height: number): void {
        const data = this._data;
        if (data.length === 0) return;
        const vr = timeScale.visibleRange();
        if (!vr) return;
        const o = this._wtOptions;
        const start = Math.max(0, Math.floor(vr.from as number) - 1);
        const end = Math.min(data.length - 1, Math.ceil(vr.to as number) + 1);
        const X = (i: number) => timeScale.indexToCoordinate(i as any) as number;
        const Y = (v: number) => priceScale.priceToCoordinate(v) as number;

        ctx.save();

        // Seviyeler
        ctx.strokeStyle = o.levelColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        for (const lv of [0, o.obLevel1, o.obLevel2, o.osLevel1, o.osLevel2]) {
            const y = Y(lv);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // Histogram wt1 - wt2
        const barW = Math.max(1, 0.6 * (timeScale.barSpacing as number));
        const zeroY = Y(0);
        ctx.fillStyle = o.histColor;
        for (let i = start; i <= end; i++) {
            const v = data[i].values;
            if (!v) continue;
            const hv = v[0] - v[1];
            if (Number.isNaN(hv)) continue;
            const y = Y(hv);
            ctx.fillRect(X(i) - barW / 2, Math.min(y, zeroY), barW, Math.abs(y - zeroY));
        }

        // Cizgiler: wt1 duz, wt2 noktali
        const line = (idx: number, color: string, dash: number[]) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = o.lineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.setLineDash(dash);
            ctx.beginPath();
            let started = false;
            for (let i = start; i <= end; i++) {
                const x = data[i].values?.[idx];
                if (x === undefined || Number.isNaN(x)) { started = false; continue; }
                if (!started) { ctx.moveTo(X(i), Y(x)); started = true; } else ctx.lineTo(X(i), Y(x));
            }
            ctx.stroke();
            ctx.setLineDash([]);
        };
        line(0, o.wt1Color, []);
        line(1, o.wt2Color, [2, 3]);

        // Kesisim noktalari
        for (let i = Math.max(1, start); i <= end; i++) {
            const a = data[i].values, b = data[i - 1].values;
            if (!a || !b) continue;
            const up = a[0] > a[1] && b[0] <= b[1];
            const dn = a[0] < a[1] && b[0] >= b[1];
            if (!up && !dn) continue;
            if (Number.isNaN(a[1]) || Number.isNaN(b[1])) continue;
            ctx.fillStyle = up ? o.crossUpColor : o.crossDownColor;
            ctx.beginPath();
            ctx.arc(X(i), Y((a[0] + a[1]) / 2), 3, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

globalThis.__draftIndicatorClass = WaveTrendIndicator;
