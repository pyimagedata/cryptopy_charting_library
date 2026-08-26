interface Bobbin4Options {
    name: string;
    bobbinMult: number;
    bobbinMaxActive: number;
    bobbinRightExtend: number;
    bullColor: string;
    bearColor: string;
    visible: boolean;
}

const defaultBobbin4Options: Bobbin4Options = {
    name: 'Bobbin x4 (4-mum)',
    bobbinMult: 0.2,
    bobbinMaxActive: 10,
    bobbinRightExtend: 80,
    bullColor: '#15e715',
    bearColor: '#ff6d00',
    visible: true,
};

interface BobbinBox {
    left: number;
    right: number;
    top: number;
    bottom: number;
    dir: 1 | -1; // 1 = yesil-kirmizi-yesil-kirmizi (talep), -1 = kirmizi-yesil-kirmizi-yesil (arz)
}

function isGreen(c: number, o: number): boolean {
    return c > o;
}

function isRed(c: number, o: number): boolean {
    return o > c;
}

// special-forces-indicator.ts'deki intersection() ile ayni: iki [bottom,top]
// araliginin cakisma testi.
function boxIntersects(b: number, t: number, b1: number, t1: number): boolean {
    return (b > b1 && b1 > t) || (b > t1 && t1 > t);
}

// 3 mumluk orijinal Bobbin mantiginin 4 muma genellestirilmis hali:
// Yesil-Kirmizi-Yesil-Kirmizi (ve simetrigi Kirmizi-Yesil-Kirmizi-Yesil),
// tam donusumlu (alternating) 4 mum penceresi. Her mumun govde ust/alt
// kenari (topEdge/bottomEdge) cikarilip, en genis govdeye (mx) gore bir
// sikisma bandi (cmx/cmin) kuruluyor; butun mumlarin ust kenarlari cmx'in
// altinda, alt kenarlari cmin'in ustundeyse "bobbin" (sikisma) kutusu olusuyor.
function computeBobbin4Boxes(sourceData: BarData[], mult: number, maxActive: number, rightExtend: number): BobbinBox[] {
    const active: BobbinBox[] = [];

    for (let i = 3; i < sourceData.length; i++) {
        const c3 = sourceData[i - 3].close, o3 = sourceData[i - 3].open;
        const c2 = sourceData[i - 2].close, o2 = sourceData[i - 2].open;
        const c1 = sourceData[i - 1].close, o1 = sourceData[i - 1].open;
        const c0 = sourceData[i].close, o0 = sourceData[i].open;

        let box: BobbinBox | null = null;

        // Yesil-Kirmizi-Yesil-Kirmizi: talep (bullish) bobbin
        if (isGreen(c3, o3) && isRed(c2, o2) && isGreen(c1, o1) && isRed(c0, o0)) {
            const mx = Math.max(c3 - o3, o2 - c2, c1 - o1, o0 - c0);
            const cmx = Math.max(c3, o2, c1, o0) - mx * mult;
            const cmin = Math.min(o3, c2, o1, c0) + mx * mult;
            const bobin = cmx < c3 && cmx < o2 && cmx < c1 && cmx < o0 &&
                cmin > o3 && cmin > c2 && cmin > o1 && cmin > c0;
            if (bobin) {
                box = {
                    left: i - 3,
                    right: i + rightExtend,
                    top: Math.max(c3, o2, c1, o0),
                    bottom: Math.min(o3, c2, o1, c0),
                    dir: 1,
                };
            }
        }

        // Kirmizi-Yesil-Kirmizi-Yesil: arz (bearish) bobbin
        if (isRed(c3, o3) && isGreen(c2, o2) && isRed(c1, o1) && isGreen(c0, o0)) {
            const mx = Math.max(o3 - c3, c2 - o2, o1 - c1, c0 - o0);
            const cmx = Math.max(o3, c2, o1, c0) - mx * mult;
            const cmin = Math.min(c3, o2, c1, o0) + mx * mult;
            const bobin1 = cmx < o3 && cmx < c2 && cmx < o1 && cmx < c0 &&
                cmin > c3 && cmin > o2 && cmin > c1 && cmin > o0;
            if (bobin1) {
                active.push({
                    left: i - 3,
                    right: i + rightExtend,
                    top: Math.max(o3, c2, o1, c0),
                    bottom: Math.min(c3, o2, c1, o0),
                    dir: -1,
                });
            }
        }

        if (box !== null) {
            active.push(box);
        }

        // special-forces-indicator.ts'deki gibi: maxActive asilinca en eski
        // kutu atilir; kalan son 3 kutu birbiriyle cakisiyorsa en eskisi
        // guncel bara kisaltilarak kapatilir.
        if (active.length > maxActive) {
            active.shift();
            if (active.length >= 3) {
                const n = active.length;
                const b1 = active[n - 3];
                const b2 = active[n - 2];
                const b3 = active[n - 1];
                if (
                    boxIntersects(b1.bottom, b1.top, b2.bottom, b2.top) &&
                    boxIntersects(b1.bottom, b1.top, b3.bottom, b3.top)
                ) {
                    b1.right = i;
                }
            }
        }
    }

    return active;
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

class Bobbin4Indicator extends OverlayIndicator {
    private _b4Options: Bobbin4Options;
    private _boxes: BobbinBox[] = [];

    constructor(options: Partial<Bobbin4Options> = {}) {
        const merged = { ...defaultBobbin4Options, ...options };
        super(merged);
        this._b4Options = { ...defaultBobbin4Options, ...this._options } as Bobbin4Options;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._b4Options };
    }

    setSettingValue(key: string, value: any): boolean {
        (this._b4Options as any)[key] = value;
        (this._options as any)[key] = value;
        if (this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
        return true;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._data = [];
        if (sourceData.length === 0) {
            this._boxes = [];
            return;
        }

        this._boxes = computeBobbin4Boxes(
            sourceData,
            this._b4Options.bobbinMult,
            this._b4Options.bobbinMaxActive,
            this._b4Options.bobbinRightExtend
        );

        // Gercek ic durumu (kutu sayisi + son kutunun yonu) get_indicator_data
        // ile dogrudan dogrulanabilsin diye values alanina yaziliyor.
        this._data = sourceData.map((bar, idx) => {
            const lastBoxAtBar = [...this._boxes].reverse().find(b => b.left === idx);
            return {
                time: bar.time,
                value: lastBoxAtBar ? lastBoxAtBar.dir : 0,
                values: [this._boxes.length],
            };
        });
    }

    getRange(): { min: number; max: number } {
        if (this._boxes.length === 0) return { min: 0, max: 100 };
        let min = Infinity, max = -Infinity;
        for (const b of this._boxes) {
            min = Math.min(min, b.bottom);
            max = Math.max(max, b.top);
        }
        return { min, max };
    }

    getDescription(): string {
        const bull = this._boxes.filter(b => b.dir === 1).length;
        const bear = this._boxes.filter(b => b.dir === -1).length;
        return `Bobbin x4: ${this._boxes.length} kutu (talep ${bull} / arz ${bear})`;
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        if (this._boxes.length === 0 || this._sourceData.length === 0) return;

        ctx.save();
        for (const box of this._boxes) {
            ctx.fillStyle = withAlpha(box.dir === 1 ? this._b4Options.bullColor : this._b4Options.bearColor, 0.32);
            this._fillBox(ctx, timeScale, priceScale, hpr, vpr, box);
        }
        ctx.restore();
    }

    private _fillBox(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number, box: BobbinBox): void {
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

globalThis.__draftIndicatorClass = Bobbin4Indicator;
