// SF Bobbin/Engulf: Special Forces gostergesinin sadece Bobbin ve Engulf bolgeleri.
// Tespit mantigi ve cizim special_forces.ts'den birebir; S/R seviyeleri yok.

interface SFZonesOptions {
    name: string;
    style: string;
    showBobbin: boolean;
    bobbinMult: number;
    bobbinMaxActive: number;
    bobbinRightExtend: number;
    bobbinColor: string;
    showEngulf: boolean;
    engulfRightExtend: number;
    engulfColor: string;
}

const defaultSFZonesOptions: SFZonesOptions = {
    name: 'SF Bobbin/Engulf',
    style: 'line',
    showBobbin: true,
    bobbinMult: 0.2,
    bobbinMaxActive: 10,
    bobbinRightExtend: 500,
    bobbinColor: '#15e715',
    showEngulf: true,
    engulfRightExtend: 400,
    engulfColor: '#ffeb3b',
};

interface BobbinBox {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

interface EngulfBox {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

function isGreen(c: number, o: number): boolean {
    return c > o;
}

function isRed(c: number, o: number): boolean {
    return o > c;
}

// Pine intersection(): iki [bottom,top] aralığının çakışma testi.
function boxIntersects(b: number, t: number, b1: number, t1: number): boolean {
    return (b > b1 && b1 > t) || (b > t1 && t1 > t);
}

// spetial.txt showbobbin bloğu ile birebir aynı: 3-mumluk yeşil-kırmızı-yeşil /
// kırmızı-yeşil-kırmızı örüntüsü, en fazla maxActive aktif kutu, üç ardışık eski
// kutu iç içeyse en eskisi güncel bara kısaltılarak kapatılır.
function computeBobbinBoxes(sourceData: BarData[], mult: number, maxActive: number, rightExtend: number): BobbinBox[] {
    const active: BobbinBox[] = [];

    for (let i = 2; i < sourceData.length; i++) {
        const c2 = sourceData[i - 2].close;
        const o2 = sourceData[i - 2].open;
        const c1 = sourceData[i - 1].close;
        const o1 = sourceData[i - 1].open;
        const c0 = sourceData[i].close;
        const o0 = sourceData[i].open;

        let box: BobbinBox | null = null;

        if (isGreen(c2, o2) && isRed(c1, o1) && isGreen(c0, o0)) {
            const mx = Math.max(c2 - o2, o1 - c1, c0 - o0);
            const cmx = Math.max(c2, o1, c0) - mx * mult;
            const cmin = Math.min(o2, c1, o0) + mx * mult;
            const bobin = cmx < c2 && cmx < o1 && cmx < c0 && cmin > o2 && cmin > c1 && cmin > o0;
            if (bobin) {
                box = {
                    left: i - 2,
                    right: i + rightExtend,
                    top: Math.max(c2, o1, c0),
                    bottom: Math.min(o2, c1, o0),
                };
            }
        }

        if (isRed(c2, o2) && isGreen(c1, o1) && isRed(c0, o0)) {
            const mx = Math.max(o2 - c2, c1 - o1, o0 - c0);
            const cmx = Math.max(o2, c1, o0) - mx * mult;
            const cmin = Math.min(c2, o1, c0) + mx * mult;
            const bobin1 = cmx < o2 && cmx < c1 && cmx < o0 && cmin > c2 && cmin > o1 && cmin > c0;
            if (bobin1) {
                active.push({
                    left: i - 2,
                    right: i + rightExtend,
                    top: Math.max(o2, c1, o0),
                    bottom: Math.min(c2, o1, c0),
                });
            }
        }

        if (box !== null) {
            active.push(box);
        }

        if (active.length > maxActive) {
            active.shift();
            if (active.length > 9) {
                const b7 = active[7];
                const b8 = active[8];
                const b9 = active[9];
                if (
                    boxIntersects(b7.bottom, b7.top, b8.bottom, b8.top) &&
                    boxIntersects(b7.bottom, b7.top, b9.bottom, b9.top)
                ) {
                    b7.right = i;
                }
            }
        }
    }

    return active;
}

const YESIL_KIRMIZININ_KAC_KATI = 0.5;
const KIRMIZI_YESILIN_YUZDE_KACINDAN_KUCUK_OLMASIN = 0.1;

// spetial.txt getBearish(true) - direc her zaman true ile çağrılıyor.
function getBearish(c1: number, o1: number, h1: number, l1: number, c0: number, o0: number, h0: number, l0: number): boolean {
    return (
        c0 <= o1 && c1 > o1 &&
        h0 + (o0 - c0) * 0.05 > h1 &&
        l0 - (o0 - c0) * 0.05 < l1 &&
        YESIL_KIRMIZININ_KAC_KATI * (h1 - l1) < h0 - l0 &&
        c1 - o1 > KIRMIZI_YESILIN_YUZDE_KACINDAN_KUCUK_OLMASIN * (o0 - c0)
    );
}

function getMultBearish(
    multOfBody: number, multOfNeedle: number,
    c1: number, o1: number, h1: number, l1: number, c0: number, o0: number, h0: number, l0: number
): boolean {
    if (o0 - c0 > multOfBody * (c1 - o1)) {
        if ((o1 - l1) + (h1 - c1) < multOfNeedle * (c1 - o1)) {
            return getBearish(c1, o1, h1, l1, c0, o0, h0, l0);
        }
    }
    return false;
}

// spetial.txt getbullish(true).
function getBullish(c1: number, o1: number, h1: number, l1: number, c0: number, o0: number, h0: number, l0: number): boolean {
    return (
        c0 >= o1 && c1 < o1 &&
        l0 - (c0 - o0) * 0.05 < l1 &&
        h0 + (c0 - o0) * 0.05 > h1 &&
        YESIL_KIRMIZININ_KAC_KATI * (h1 - l1) < h0 - l0 &&
        o1 - c1 > KIRMIZI_YESILIN_YUZDE_KACINDAN_KUCUK_OLMASIN * (c0 - o0)
    );
}

function getMultBullish(
    multOfBody: number, multOfNeedle: number,
    c1: number, o1: number, h1: number, l1: number, c0: number, o0: number, h0: number, l0: number
): boolean {
    if (c0 - o0 > multOfBody * (o1 - c1)) {
        if ((c1 - l1) + (h1 - o1) < multOfNeedle * (o1 - c1)) {
            return getBullish(c1, o1, h1, l1, c0, o0, h0, l0);
        }
    }
    return false;
}

// Pine'daki sabit ardışık deneme sırası - ilk eşleşen kazanır. Bearish ve
// bullish çiftleri kasıtlı olarak asimetrik (4. çift farklı: 2,0.5 vs 2,1).
const BEARISH_MULT_PAIRS: Array<[number, number]> = [[5, 3.5], [4, 2.5], [3, 1.5], [2, 0.5], [1.5, 0.2]];
const BULLISH_MULT_PAIRS: Array<[number, number]> = [[5, 3.5], [4, 2.5], [3, 1.5], [2, 1], [1.5, 0.2]];

// spetial.txt showengulf bloğu ile birebir aynı: her bar için bearish ve
// bullish engulfing BEARISH_MULT_PAIRS/BULLISH_MULT_PAIRS sırasıyla denenir,
// ilk eşleşen kazanır. Kutu kapatma mantığı yok (Bobbin'in aksine sabit kalır).
function computeEngulfBoxes(sourceData: BarData[], rightExtend: number): EngulfBox[] {
    const boxes: EngulfBox[] = [];

    for (let i = 1; i < sourceData.length; i++) {
        const c1 = sourceData[i - 1].close;
        const o1 = sourceData[i - 1].open;
        const h1 = sourceData[i - 1].high;
        const l1 = sourceData[i - 1].low;
        const c0 = sourceData[i].close;
        const o0 = sourceData[i].open;
        const h0 = sourceData[i].high;
        const l0 = sourceData[i].low;

        let bearish = false;
        for (const [multBody, multNeedle] of BEARISH_MULT_PAIRS) {
            if (getMultBearish(multBody, multNeedle, c1, o1, h1, l1, c0, o0, h0, l0)) {
                bearish = true;
                break;
            }
        }

        let bullish = false;
        for (const [multBody, multNeedle] of BULLISH_MULT_PAIRS) {
            if (getMultBullish(multBody, multNeedle, c1, o1, h1, l1, c0, o0, h0, l0)) {
                bullish = true;
                break;
            }
        }

        if (bullish) {
            boxes.push({ left: i - 1, right: i + rightExtend, top: o1, bottom: c1 });
        }
        if (bearish) {
            boxes.push({ left: i - 1, right: i + rightExtend, top: c1, bottom: o1 });
        }
    }

    return boxes;
}

function withAlpha(color: string, alpha: number): string {
    const hex = color.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
        return color;
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

class SFZonesIndicator extends OverlayIndicator {
    private _sfOptions: SFZonesOptions;
    private _bobbinBoxes: BobbinBox[] = [];
    private _engulfBoxes: EngulfBox[] = [];

    constructor(options: Partial<SFZonesOptions> = {}) {
        const merged = { ...defaultSFZonesOptions, ...options };
        super(merged as any);
        this._sfOptions = { ...defaultSFZonesOptions, ...this._options } as SFZonesOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._sfOptions };
    }

    setSettingValue(key: string, value: any): boolean {
        (this._sfOptions as any)[key] = value;
        (this._options as any)[key] = value;
        if (this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
        return true;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._data = sourceData.map((bar) => ({ time: bar.time, value: NaN }));
        if (sourceData.length === 0) {
            this._bobbinBoxes = [];
            this._engulfBoxes = [];
            return;
        }

        this._bobbinBoxes = this._sfOptions.showBobbin
            ? computeBobbinBoxes(sourceData, this._sfOptions.bobbinMult, this._sfOptions.bobbinMaxActive, this._sfOptions.bobbinRightExtend)
            : [];
        this._engulfBoxes = this._sfOptions.showEngulf
            ? computeEngulfBoxes(sourceData, this._sfOptions.engulfRightExtend)
            : [];
    }

    getRange(): IndicatorRange {
        let min = Infinity;
        let max = -Infinity;
        for (const box of this._bobbinBoxes) {
            min = Math.min(min, box.bottom);
            max = Math.max(max, box.top);
        }
        for (const box of this._engulfBoxes) {
            min = Math.min(min, box.bottom);
            max = Math.max(max, box.top);
        }
        if (min === Infinity || max === -Infinity) {
            for (const bar of this._sourceData) {
                min = Math.min(min, bar.low);
                max = Math.max(max, bar.high);
            }
        }
        if (min === Infinity || max === -Infinity) {
            return { min: 0, max: 100 };
        }
        return { min, max };
    }

    getDescription(): string {
        return `SF Bobbin (${this._bobbinBoxes.length}) Engulf (${this._engulfBoxes.length})`;
    }

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number
    ): void {
        if (this._sourceData.length === 0) {
            return;
        }
        if (this._bobbinBoxes.length === 0 && this._engulfBoxes.length === 0) {
            return;
        }

        ctx.save();

        // Bobbin ve Engulf, S/R'ın aksine gerçek DOLGULU KUTU çiziyor
        // (box.new(..., bgcolor=...)) - Pine'daki gibi ctx.fillRect ile.
        if (this._bobbinBoxes.length > 0) {
            ctx.fillStyle = withAlpha(this._sfOptions.bobbinColor, 0.32);
            for (const box of this._bobbinBoxes) {
                this._fillBox(ctx, timeScale, priceScale, hpr, vpr, box);
            }
        }

        if (this._engulfBoxes.length > 0) {
            ctx.fillStyle = withAlpha(this._sfOptions.engulfColor, 0.32);
            for (const box of this._engulfBoxes) {
                this._fillBox(ctx, timeScale, priceScale, hpr, vpr, box);
            }
        }

        ctx.restore();
    }

    private _fillBox(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number,
        box: BobbinBox | EngulfBox
    ): void {
        const x1 = timeScale.indexToCoordinate(box.left as any) * hpr;
        const x2 = timeScale.indexToCoordinate(box.right as any) * hpr;
        const yTop = priceScale.priceToCoordinate(box.top) * vpr;
        const yBottom = priceScale.priceToCoordinate(box.bottom) * vpr;

        const left = Math.min(x1, x2);
        const width = Math.max(1, Math.abs(x2 - x1));
        const top = Math.min(yTop, yBottom);
        const height = Math.max(1, Math.abs(yBottom - yTop));

        ctx.fillRect(left, top, width, height);
    }
}

globalThis.__draftIndicatorClass = SFZonesIndicator;
