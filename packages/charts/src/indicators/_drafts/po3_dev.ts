interface PO3Options {
    name: string;
    accWindow: number;
    bodyRatioMax: number;
    rangeToBodyMult: number;
    maxWaitSweep: number;
    maxWaitConfirm: number;
    distExtend: number;
    accColor: string;
    bullColor: string;
    bearColor: string;
    visible: boolean;
}

const defaultPO3Options: PO3Options = {
    name: 'PO3 (Accumulation-Manipulation-Distribution)',
    accWindow: 4,
    bodyRatioMax: 2.0,
    rangeToBodyMult: 2.5,
    maxWaitSweep: 20,
    maxWaitConfirm: 20,
    distExtend: 20,
    accColor: '#ff9800',
    bullColor: '#089981',
    bearColor: '#f23645',
    visible: true,
};

interface PO3Zone {
    accStart: number;
    accEnd: number;
    accHi: number;
    accLo: number;
    sweepIdx: number;
    sweepDir: 1 | -1;
    confirmIdx: number;
    distEnd: number;
    direction: 1 | -1;
}

// ATR kullanmiyoruz - kullanicinin belirttigi gibi ATR disariki bir volatilite
// olcusu, mumlarin birbirine gore boyutunu dogrudan yansitmiyor (buyuk bir yukari
// mum + buyuk bir asagi mum net araligi dar gosterip ATR testini gecebiliyordu,
// halbuki gorsel olarak hic sakin degildi). Bunun yerine tamamen kendi icinde
// (self-referential) iki kontrol: (1) pencerede en buyuk govde / en kucuk govde
// orani bir esigi asmasin (govdeler birbirine yakin boyda olsun), (2) net aralik
// (kapanislarin max-min'i) ortalama govdenin belirli bir katini gecmesin (yatay
// kalsin, trend etmesin). Gercek kullanici ornegi (govdeler 15.5/12.7/10.0/12.3,
// oran 1.55) bu kontrolu rahatca geciyor; ATR bazli onceki versiyonun kabul ettigi
// bozuk ornek (govdeler 0.49-14.17, oran 29.2) artik reddediliyor.
function computePO3Zones(sourceData: BarData[], opts: PO3Options): PO3Zone[] {
    const n = sourceData.length;
    const opens = sourceData.map(b => b.open);
    const highs = sourceData.map(b => b.high);
    const lows = sourceData.map(b => b.low);
    const closes = sourceData.map(b => b.close);
    const zones: PO3Zone[] = [];

    let i = opts.accWindow - 1;
    while (i < n) {
        const accStart = i - opts.accWindow + 1;

        let minBody = Infinity, maxBody = -Infinity, sumBody = 0;
        let accHi = -Infinity, accLo = Infinity;
        for (let k = accStart; k <= i; k++) {
            const body = Math.abs(closes[k] - opens[k]);
            minBody = Math.min(minBody, body);
            maxBody = Math.max(maxBody, body);
            sumBody += body;
            accHi = Math.max(accHi, closes[k]);
            accLo = Math.min(accLo, closes[k]);
        }
        const avgBody = sumBody / opts.accWindow;

        if (minBody <= 0 || maxBody / minBody > opts.bodyRatioMax) { i++; continue; }
        if (accHi - accLo > avgBody * opts.rangeToBodyMult) { i++; continue; }

        const accEnd = i;

        let sweepDir: 1 | -1 | 0 = 0;
        let sweepIdx = -1;
        for (let j = accEnd + 1; j <= Math.min(n - 1, accEnd + opts.maxWaitSweep); j++) {
            if (lows[j] < accLo) { sweepDir = -1; sweepIdx = j; break; }
            if (highs[j] > accHi) { sweepDir = 1; sweepIdx = j; break; }
        }
        if (sweepDir === 0) { i = accEnd + 1; continue; }

        let confirmIdx = -1;
        for (let k = sweepIdx + 1; k <= Math.min(n - 1, sweepIdx + opts.maxWaitConfirm); k++) {
            if (sweepDir === -1 && closes[k] > accHi) { confirmIdx = k; break; }
            if (sweepDir === 1 && closes[k] < accLo) { confirmIdx = k; break; }
        }
        if (confirmIdx === -1) { i = sweepIdx + 1; continue; }

        const direction: 1 | -1 = sweepDir === -1 ? 1 : -1;
        zones.push({
            accStart, accEnd, accHi, accLo,
            sweepIdx, sweepDir, confirmIdx,
            distEnd: Math.min(n - 1, confirmIdx + opts.distExtend),
            direction,
        });
        i = confirmIdx + 1;
    }

    for (let z = 0; z < zones.length - 1; z++) {
        const nextStart = zones[z + 1].accStart;
        if (zones[z].distEnd >= nextStart) {
            zones[z].distEnd = Math.max(zones[z].confirmIdx, nextStart - 1);
        }
    }

    return zones;
}

function withAlpha(color: string, alpha: number): string {
    const hex = color.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return color;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

class PO3Indicator extends OverlayIndicator {
    private _po3Options: PO3Options;
    private _zones: PO3Zone[] = [];

    constructor(options: Partial<PO3Options> = {}) {
        const merged = { ...defaultPO3Options, ...options };
        super(merged);
        this._po3Options = { ...defaultPO3Options, ...this._options } as PO3Options;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._po3Options };
    }

    setSettingValue(key: string, value: any): boolean {
        (this._po3Options as any)[key] = value;
        (this._options as any)[key] = value;
        if (this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
        return true;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._data = [];
        if (sourceData.length === 0) {
            this._zones = [];
            return;
        }

        this._zones = computePO3Zones(sourceData, this._po3Options);

        this._data = sourceData.map((bar, idx) => {
            const z = this._zones.find(zz => zz.confirmIdx === idx);
            return { time: bar.time, value: z ? z.direction : 0, values: [this._zones.length] };
        });
    }

    getRange(): { min: number; max: number } {
        if (this._zones.length === 0) return { min: 0, max: 100 };
        let min = Infinity, max = -Infinity;
        for (const z of this._zones) {
            min = Math.min(min, z.accLo);
            max = Math.max(max, z.accHi);
        }
        return { min, max };
    }

    getDescription(): string {
        const bull = this._zones.filter(z => z.direction === 1).length;
        const bear = this._zones.filter(z => z.direction === -1).length;
        return `PO3: ${this._zones.length} zon (bull ${bull} / bear ${bear})`;
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number, visibleRange?: { from: number; to: number }): void {
        if (this._zones.length === 0 || this._sourceData.length === 0) return;

        const startIdx = visibleRange ? Math.max(0, Math.floor(visibleRange.from) - 30) : 0;
        const endIdx = visibleRange ? Math.min(this._sourceData.length - 1, Math.ceil(visibleRange.to) + 30) : this._sourceData.length - 1;

        ctx.save();
        for (const z of this._zones) {
            if (z.distEnd < startIdx || z.accStart > endIdx) continue;

            ctx.fillStyle = withAlpha(this._po3Options.accColor, 0.28);
            ctx.strokeStyle = this._po3Options.accColor;
            this._fillBox(ctx, timeScale, priceScale, hpr, vpr, z.accStart, z.accEnd, z.accHi, z.accLo, true);
        }
        ctx.restore();
    }

    private _fillBox(
        ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number,
        leftIdx: number, rightIdx: number, top: number, bottom: number, stroke: boolean
    ): void {
        const x1 = timeScale.indexToCoordinate(leftIdx as any) * hpr;
        const x2 = timeScale.indexToCoordinate(rightIdx as any) * hpr;
        const yTop = priceScale.priceToCoordinate(top) * vpr;
        const yBottom = priceScale.priceToCoordinate(bottom) * vpr;

        const left = Math.min(x1, x2);
        const width = Math.max(1, Math.abs(x2 - x1));
        const boxTop = Math.min(yTop, yBottom);
        const height = Math.max(1, Math.abs(yBottom - yTop));

        ctx.fillRect(left, boxTop, width, height);
        if (stroke) {
            ctx.lineWidth = 1.5 * hpr;
            ctx.strokeRect(left, boxTop, width, height);
        }
    }
}

globalThis.__draftIndicatorClass = PO3Indicator;
