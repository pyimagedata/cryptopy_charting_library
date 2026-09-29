// Fair Value Gap Inversion (IFVG).
//
// FVG (Fair Value Gap): 3 mumluk dengesizlik. Bullish FVG: bars[i-2].high <
// bars[i].low -> aradaki bosluk [bars[i-2].high, bars[i].low] fiyatin geri
// gelip "dengelemesi" beklenen bir destek bolgesi (yukari hareket sirasinda
// olusuyor). Bearish FVG: bars[i-2].low > bars[i].high -> bosluk
// [bars[i].high, bars[i-2].low], direnc bolgesi (asagi hareket sirasinda
// olusuyor).
//
// Inversion (IFVG): bir FVG, KENDI yonunun TERSINE bir mum GOVDESI (sadece
// fitil degil - kapanis) ile tamamen kirilirsa rolu tersine doner. Bullish
// FVG (destek) asagi yonde govde-kapanisla kirilirsa -> bearish IFVG (artik
// direnc). Bearish FVG (direnc) yukari yonde govde-kapanisla kirilirsa ->
// bullish IFVG (artik destek). Sadece fitille icine girip geri donmek
// (wick) inversion SAYILMAZ - sadece "fill" (normal doldurma/mitigation)
// sayilir ve kutu orada durur, arti bir anlam tasimaz.
//
// Durum makinesi (her FVG icin, olusumdan sonra ileri tarama):
//   - Once EXPIRY kontrolu: formBar'dan itibaren maxOpenBars gecmisse VE
//     hala doldurulmadi/donmediyse -> 'expired'. Bu noktadan sonra gelen
//     HICBIR kapanis artik "donus" (inversion) SAYILMAZ. Gerekce: bir FVG
//     makul bir surede (varsayilan 50 bar) test edilmediyse piyasa o
//     bolgeyi zaten "unutmus" demektir - aylar sonra gelen rastgele bir
//     kapanisi anlamli bir "donus" saymak yanlis olur.
//   - Suresi dolmadiysa INVERSION kontrolu: sonraki bir barin KAPANISI tum
//     boslugun karsi tarafina gecerse -> 'inverted'. Kutu bu noktadan
//     itibaren TERS renkte (yeni rol) cizilmeye devam eder, guncel bara
//     kadar uzar (donus suresi maxOpenBars ile zaten sinirli oldugu icin
//     "ilk bolge" -donus oncesi- de dogal olarak asiri genislemez).
//   - INVERSION olmadiysa FILL kontrolu: bir barin fitili boslugun uzak
//     kenarina ulasirsa (tam doldurma) -> 'filled'. Kutu o barda durur,
//     soluklasir, artik takip edilmez.
//   - Hicbiri olmadiysa 'open' - kutu guncel bara kadar uzamaya devam eder.
//
// minGapAtr: bosluk yuksekligi ATR'nin bu oranindan kucukse gosterilmez -
// onemsiz/gurultu FVG'leri eler. maxDisplayAgeBars: cok eski, hala 'open'
// olan FVG'ler sonsuza kadar ekrani doldurmasin diye bir yas siniri (0 =
// sinirsiz) - bu SADECE goruntuleme filtresi, maxOpenBars ise VERI/mantik
// katmaninda gecerlilik suresi.
//
// showOpenFvg: varsayilan KAPALI - henuz donmemis/dolmamis normal FVG'ler
// (ve donmus olanlarin donus-oncesi soluk izi) hic gosterilmez, sadece
// GERCEKTEN DONMUS (IFVG) bolgeler cizilir. Indikatorun amaci zaten
// inversion oldugu icin bekleyen/nötr FVG'ler sadece gurultu yaratiyordu.

interface FvgOptions {
    name: string;
    atrLength: number;
    minGapAtr: number;
    maxOpenBars: number;
    maxDisplayAgeBars: number;
    showOpenFvg: boolean;
    showFilled: boolean;
    showLabels: boolean;
    bullColor: string;
    bearColor: string;
    boxOpacity: number;
    filledOpacity: number;
    visible: boolean;
}

const defaultFvgOptions: FvgOptions = {
    name: 'FVG Inversion',
    atrLength: 14,
    minGapAtr: 0.1,
    maxOpenBars: 50,
    maxDisplayAgeBars: 300,
    showOpenFvg: false,
    showFilled: false,
    showLabels: true,
    bullColor: '#26a69a',
    bearColor: '#ef5350',
    boxOpacity: 28,
    filledOpacity: 10,
    visible: true,
};

interface FvgBox {
    type: 'bull' | 'bear';
    gapBottom: number;
    gapTop: number;
    firstBar: number;
    formBar: number;
    state: 'open' | 'filled' | 'inverted' | 'invalidated' | 'expired';
    endBar: number;
    invertedBar: number | null;
}

function wilderAtr(bars: BarData[], period: number): (number | null)[] {
    const trs: number[] = [];
    for (let i = 0; i < bars.length; i++) {
        const b = bars[i];
        if (i === 0) {
            trs.push(b.high - b.low);
        } else {
            const pc = bars[i - 1].close;
            trs.push(Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc)));
        }
    }
    const out: (number | null)[] = new Array(bars.length).fill(null);
    if (bars.length < period) return out;
    let run = 0;
    for (let i = 0; i < period; i++) run += trs[i];
    run /= period;
    out[period - 1] = run;
    for (let i = period; i < bars.length; i++) {
        run = (run * (period - 1) + trs[i]) / period;
        out[i] = run;
    }
    return out;
}

function computeFvgs(bars: BarData[], o: FvgOptions): FvgBox[] {
    const atr = wilderAtr(bars, o.atrLength);
    const n = bars.length;
    const boxes: FvgBox[] = [];

    // 1) tum FVG'leri tespit et
    for (let i = 2; i < n; i++) {
        const a = atr[i];
        if (a === null || a <= 0) continue;
        const minGap = a * o.minGapAtr;

        if (bars[i - 2].high < bars[i].low) {
            const gapBottom = bars[i - 2].high, gapTop = bars[i].low;
            if (gapTop - gapBottom >= minGap) {
                boxes.push({ type: 'bull', gapBottom, gapTop, firstBar: i - 2, formBar: i, state: 'open', endBar: i, invertedBar: null });
            }
        }
        if (bars[i - 2].low > bars[i].high) {
            const gapTop = bars[i - 2].low, gapBottom = bars[i].high;
            if (gapTop - gapBottom >= minGap) {
                boxes.push({ type: 'bear', gapBottom, gapTop, firstBar: i - 2, formBar: i, state: 'open', endBar: i, invertedBar: null });
            }
        }
    }

    // 2) her FVG icin olusumdan sonra ileri tara: inversion mi, fill mi, yoksa hala acik mi?
    //    maxOpenBars: FVG olusumdan itibaren bu kadar bar icinde ne dolar ne donerse
    //    ARTIK GECERSIZ sayilir ('expired') - bu noktadan sonraki hicbir kapanis
    //    "donus" olarak KABUL EDILMEZ. Aylar sonra gelen gec bir kapanisi "inversion"
    //    saymak mantiksiz - piyasa o bolgeyi zaten unutmus demektir.
    for (const box of boxes) {
        for (let k = box.formBar + 1; k < n; k++) {
            if (o.maxOpenBars > 0 && k > box.formBar + o.maxOpenBars) {
                box.state = 'expired';
                box.endBar = box.formBar + o.maxOpenBars;
                break;
            }
            if (box.type === 'bull') {
                if (bars[k].close < box.gapBottom) {
                    box.state = 'inverted';
                    box.invertedBar = k;
                    box.endBar = n - 1;
                    break;
                }
                if (bars[k].low <= box.gapBottom) {
                    box.state = 'filled';
                    box.endBar = k;
                    break;
                }
            } else {
                if (bars[k].close > box.gapTop) {
                    box.state = 'inverted';
                    box.invertedBar = k;
                    box.endBar = n - 1;
                    break;
                }
                if (bars[k].high >= box.gapTop) {
                    box.state = 'filled';
                    box.endBar = k;
                    break;
                }
            }
        }
        if (box.state === 'open') box.endBar = n - 1;

        // 3) IFVG de sonsuza kadar gecerli degil: donusten (invertedBar) SONRA fiyat
        // govde-kapanisla ESKI (donusten onceki) yonune geri gecerse, bu IFVG'nin
        // yeni rolu de (destek/direnc) basarisiz olmus demektir - 'invalidated'.
        if (box.state === 'inverted' && box.invertedBar !== null) {
            for (let m = box.invertedBar + 1; m < n; m++) {
                if (box.type === 'bull') {
                    // bull FVG asagi donup bearish IFVG (direnc) oldu - yukari
                    // govde-kapanisla geri gecerse direnc basarisiz olmus.
                    if (bars[m].close > box.gapTop) {
                        box.state = 'invalidated';
                        box.endBar = m;
                        break;
                    }
                } else {
                    // bear FVG yukari donup bullish IFVG (destek) oldu - asagi
                    // govde-kapanisla geri gecerse destek basarisiz olmus.
                    if (bars[m].close < box.gapBottom) {
                        box.state = 'invalidated';
                        box.endBar = m;
                        break;
                    }
                }
            }
        }
    }

    return boxes;
}

function rgbaFrom(color: string, alpha: number): string {
    const hex = color.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return color;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

class FvgInversionIndicator extends OverlayIndicator {
    private _fOptions: FvgOptions;
    private _boxes: FvgBox[] = [];

    constructor(options: Partial<FvgOptions> = {}) {
        const merged = { ...defaultFvgOptions, ...options };
        super(merged);
        this._fOptions = { ...defaultFvgOptions, ...this._options } as FvgOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._fOptions };
    }

    setSettingValue(key: string, value: any): boolean {
        (this._fOptions as any)[key] = value;
        (this._options as any)[key] = value;
        if (this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
        return true;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._data = [];
        if (sourceData.length === 0) { this._boxes = []; return; }

        this._boxes = computeFvgs(sourceData, this._fOptions);

        const byBar: Record<number, FvgBox[]> = {};
        for (const box of this._boxes) {
            (byBar[box.formBar] = byBar[box.formBar] || []).push(box);
        }
        this._data = sourceData.map((bar, i) => {
            const arr = byBar[i];
            return arr && arr.length > 0
                ? { time: bar.time, value: (arr[0].gapTop + arr[0].gapBottom) / 2, values: arr.map(b => (b.gapTop + b.gapBottom) / 2) }
                : { time: bar.time, value: NaN, values: [] };
        });
    }

    getRange(): { min: number; max: number } {
        if (this._sourceData.length === 0) return { min: 0, max: 100 };
        let min = Infinity, max = -Infinity;
        for (const bar of this._sourceData) {
            if (bar.low < min) min = bar.low;
            if (bar.high > max) max = bar.high;
        }
        return { min, max };
    }

    getDescription(): string {
        const open = this._boxes.filter(b => b.state === 'open').length;
        const inverted = this._boxes.filter(b => b.state === 'inverted').length;
        const filled = this._boxes.filter(b => b.state === 'filled').length;
        const invalidated = this._boxes.filter(b => b.state === 'invalidated').length;
        const expired = this._boxes.filter(b => b.state === 'expired').length;
        return `FVG Inversion: ${open} acik, ${inverted} donmus (IFVG), ${filled + invalidated + expired} gecersiz`;
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        if (this._boxes.length === 0 || this._sourceData.length === 0) return;

        const lastBar = this._sourceData.length - 1;
        const minFirstBar = this._fOptions.maxDisplayAgeBars > 0
            ? lastBar - this._fOptions.maxDisplayAgeBars
            : -Infinity;

        ctx.save();
        for (const box of this._boxes) {
            if ((box.state === 'filled' || box.state === 'invalidated' || box.state === 'expired') && !this._fOptions.showFilled) continue;
            if (box.state === 'open' && !this._fOptions.showOpenFvg) continue;
            if (box.formBar < minFirstBar) continue;

            const origColor = box.type === 'bull' ? this._fOptions.bullColor : this._fOptions.bearColor;
            const invColor = box.type === 'bull' ? this._fOptions.bearColor : this._fOptions.bullColor;

            const yTop = priceScale.priceToCoordinate(box.gapTop) * vpr;
            const yBottom = priceScale.priceToCoordinate(box.gapBottom) * vpr;
            const top = Math.min(yTop, yBottom);
            const height = Math.max(1, Math.abs(yBottom - yTop));

            if ((box.state === 'inverted' || box.state === 'invalidated') && box.invertedBar !== null) {
                // Donusten ONCE (soluk, orijinal FVG'nin izi): sadece showOpenFvg
                // acikken cizilir - kullanicinin talebi geregi varsayilan olarak
                // yalnizca asil IFVG (donus sonrasi) gorunsun, kalabalik olmasin.
                const xInv = timeScale.indexToCoordinate(box.invertedBar as any) * hpr;
                if (this._fOptions.showOpenFvg) {
                    const x1 = timeScale.indexToCoordinate(box.firstBar as any) * hpr;
                    const preAlpha = (this._fOptions.filledOpacity / 100);
                    ctx.fillStyle = rgbaFrom(origColor, preAlpha);
                    ctx.fillRect(Math.min(x1, xInv), top, Math.max(1, Math.abs(xInv - x1)), height);
                }

                // Donusten SONRA: ters renk (yeni rol - IFVG), invalidated olduysa
                // (o da gecersiz kilindiysa) soluk, hala gecerliyse tam opaklikta.
                const x2 = timeScale.indexToCoordinate(box.endBar as any) * hpr;
                const postAlpha = box.state === 'invalidated'
                    ? this._fOptions.filledOpacity / 100
                    : this._fOptions.boxOpacity / 100;
                ctx.fillStyle = rgbaFrom(invColor, postAlpha);
                ctx.fillRect(Math.min(xInv, x2), top, Math.max(1, Math.abs(x2 - xInv)), height);
                if (box.state === 'inverted') {
                    ctx.strokeStyle = rgbaFrom(invColor, 0.85);
                    ctx.lineWidth = 1 * hpr;
                    ctx.strokeRect(Math.min(xInv, x2), top, Math.max(1, Math.abs(x2 - xInv)), height);
                }

                if (this._fOptions.showLabels && box.state === 'inverted') {
                    ctx.fillStyle = rgbaFrom(invColor, 0.95);
                    ctx.font = `${10 * hpr}px sans-serif`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = box.type === 'bull' ? 'top' : 'bottom';
                    ctx.fillText('IFVG', xInv + 3 * hpr, box.type === 'bull' ? top + height + 2 * vpr : top - 2 * vpr);
                }
            } else {
                const x1 = timeScale.indexToCoordinate(box.firstBar as any) * hpr;
                const x2 = timeScale.indexToCoordinate(box.endBar as any) * hpr;
                const alpha = (box.state === 'filled' || box.state === 'expired') ? this._fOptions.filledOpacity / 100 : this._fOptions.boxOpacity / 100;
                ctx.fillStyle = rgbaFrom(origColor, alpha);
                ctx.fillRect(Math.min(x1, x2), top, Math.max(1, Math.abs(x2 - x1)), height);
                if (box.state === 'open') {
                    ctx.strokeStyle = rgbaFrom(origColor, 0.6);
                    ctx.lineWidth = 1 * hpr;
                    ctx.strokeRect(Math.min(x1, x2), top, Math.max(1, Math.abs(x2 - x1)), height);
                    if (this._fOptions.showLabels) {
                        ctx.fillStyle = rgbaFrom(origColor, 0.9);
                        ctx.font = `${10 * hpr}px sans-serif`;
                        ctx.textAlign = 'left';
                        ctx.textBaseline = box.type === 'bull' ? 'top' : 'bottom';
                        ctx.fillText('FVG', x1 + 3 * hpr, box.type === 'bull' ? top + height + 2 * vpr : top - 2 * vpr);
                    }
                }
            }
        }
        ctx.restore();
    }
}

globalThis.__draftIndicatorClass = FvgInversionIndicator;
