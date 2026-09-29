// Equal Highs / Equal Lows V2 (likidite seviyeleri) - tolerans yontemi karsilastirmasi.
//
// v1 (eqhl_dev) ile ayni temel: pivot tespiti + esitlik kumeleme + supurulme.
// Fark: esitlik toleransini hesaplamak icin IKI yontem arasinda gecis yapilabiliyor
// (useAcademicGamma ile ayarlar panelinden canli degistirilebilir):
//
//   ATR yontemi (useAcademicGamma=false, varsayilan v1 davranisi):
//     tolerance = ATR(atrLength) * toleranceMult
//     Rolling/lokal - volatilite zaman icinde degistikce tolerans da degisir.
//     Pratikte cogu ticari EQH/EQL indikatorunun kullandigi yontem (LuxAlgo vb).
//
//   Akademik gama yontemi (useAcademicGamma=true):
//     tolerance = gamma * gammaToleranceMult
//     gamma = (1/(T-1)) * sum(|close[t] - close[t-1]|)  -- SERININ TAMAMI icin
//     TEK SABIT deger (rolling degil). Chung & Bellotti (2021, arXiv:2101.07410,
//     Imperial College London / Nottingham) "Evidence and Behaviour of Support
//     and Resistance Levels in Financial Time Series" makalesindeki gamma
//     tanimi - Garzarelli et al. (2014)'u takip ediyorlar. Makalede bu secimin
//     rastgele yürüyüs (random walk) simulasyonlarinda p(bounce)=0.5 (notr
//     taban çizgisi) verdigi gosterilip kalibre ediliyor - yani ATR carpani
//     gibi keyfi degil, istatistiksel bir gerekcesi var. ATR'nin true-range +
//     Wilder-smoothing karmasikligi olmadan, tum seri icin tek bir olcek.
//
// Iki yontem ayri carpanlarla (toleranceMult / gammaToleranceMult) tutuluyor
// ki mod degistirince yeniden ayar yapmaya gerek kalmasin, ikisi de bagimsiz
// ince ayarlanabilir.
//
// Geri kalan mantik v1 ile birebir ayni (bkz. eqhl_dev.ts basindaki genis
// aciklama): pivot sol/sag pencere, maxLookbackBars ile uzak pivot eslesmesin,
// >=2 dokunusa ulasan seviyeler cizilir, supurulme = tolerans-otesi kirilma.
// minGapBars: iki pivot arasinda EN AZ bu kadar bar olmali - yoksa 2-3 mumluk
// bitisik/onemsiz kucuk sapmalar bile "esit seviye" sayilabiliyordu.
//
// Asimetrik tolerans (strictSideRatio / safeSideRatio): esitlik kontrolu YON
// BAGIMSIZ degil. EQL icin 2. pivot 1.'in COK altina inemez - inerse bu, 1.
// pivotun likiditesi ZATEN ALINMIS demektir (fiyat oraya kadar inip gecmis),
// ikisini "hala duran esit seviye" olarak eslestirmek yanlis olur. Yukari
// yonde (daha sig bir dip) daha gevsek ama YINE DE SINIRLI bir tolerans var.
// EQH icin simetrigi: 2. pivot 1.'in COK ustune cikamaz (cikarsa 1. zaten
// alinmis demektir), altinda olmasi (daha alcak bir tepe) gevsek toleransla
// serbest. Kirilma yonu = tolerance*strictSideRatio (varsayilan %25), guvenli
// yon = tolerance*safeSideRatio (varsayilan %50) - ikisi de HAM tolerans
// DEGIL. Guvenli yon ilk basta ham (tam) toleransti ama bu COK genisti: eski/
// uzak bir seviye, aralarinda sadece kucuk bir fark olan YENI bir yakin cifti
// (ornegin 0.03 birim) kendi kumesine yutup, o ciftin KENDI basina ayri bir
// esit-seviye kurmasini engelliyordu (kullanicinin bizzat grafikte isaretleyip
// "bunlar ayri bir EQL" dedigi bir durumda gozlemlendi). safeSideRatio<1 ile
// artik uzak eski seviyeler her seyi yutamiyor, yakin ciftler kendi
// seviyelerini kurabiliyor. Supurulme esigi STRICT (siki) degeri kullaniyor
// (tutarlilik icin - "esit" saymadigimiz bir sapma zaten "supuruldu" sayilmali).
//
// Seviye fiyati: eslesme oldukca ORTALAMA yerine EN UC noktaya (EQH->en yuksek
// high, EQL->en dusuk low) sabitleniyor - dinlenen likidite (stop kumesi)
// gercekte en uc noktada duruyor, ortalama fiyat orada degil.
//
// hideSwept: supurulmus (artik gecerli olmayan) seviyeleri tamamen gizler -
// varsayilan KAPALI (false), acilirsa sadece hala aktif/supurulmemis seviyeler
// gosterilir.

interface EqHLOptions {
    name: string;
    pivotBars: number;
    atrLength: number;
    useAcademicGamma: boolean;
    toleranceMult: number;
    gammaToleranceMult: number;
    strictSideRatio: number;
    safeSideRatio: number;
    minGapBars: number;
    maxLookbackBars: number;
    hideSwept: boolean;
    showLabels: boolean;
    eqhColor: string;
    eqlColor: string;
    sweptOpacity: number;
    lineWidth: number;
    visible: boolean;
}

const defaultEqHLOptions: EqHLOptions = {
    name: 'Equal Highs/Lows V2',
    pivotBars: 5,
    atrLength: 14,
    useAcademicGamma: false,
    toleranceMult: 0.4,
    gammaToleranceMult: 1.0,
    strictSideRatio: 0.25,
    safeSideRatio: 0.5,
    minGapBars: 5,
    maxLookbackBars: 50,
    hideSwept: false,
    showLabels: true,
    eqhColor: '#ef5350',
    eqlColor: '#26a69a',
    sweptOpacity: 35,
    lineWidth: 1,
    visible: true,
};

interface EqLevel {
    type: 'high' | 'low';
    price: number;
    firstBar: number;
    lastBar: number;
    touches: number;
    tolerance: number;
    strictTolerance: number;
    swept: boolean;
    sweptBar: number | null;
}

/** Kirilma yonundeki sapma (EQL->asagi, EQH->yukari) SIKI tolerans, guvenli yon
 * DAHA GEVSEK ama YINE DE SINIRLI tolerans (tam/ham tolerans DEGIL) - tam tolerans
 * cok genis oldugu icin eski/uzak bir seviye, aralarinda sadece kucuk bir fark
 * olan YAKIN bir cifti (ornegin 0.03 birim) kendi kumesine yutup, o ciftin KENDI
 * basina ayri bir esit-seviye kurmasini engelliyordu. */
function isEqualMatch(type: 'high' | 'low', newPrice: number, levelPrice: number, safeTolerance: number, strictTolerance: number): boolean {
    if (type === 'low') {
        return newPrice < levelPrice
            ? (levelPrice - newPrice) <= strictTolerance
            : (newPrice - levelPrice) <= safeTolerance;
    }
    return newPrice > levelPrice
        ? (newPrice - levelPrice) <= strictTolerance
        : (levelPrice - newPrice) <= safeTolerance;
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

/** Chung & Bellotti (2021) gamma'si: seri boyunca ortalama |kapanis farki| - tek sabit deger. */
function avgAbsChange(bars: BarData[]): number {
    if (bars.length < 2) return 0;
    let sum = 0;
    for (let i = 1; i < bars.length; i++) sum += Math.abs(bars[i].close - bars[i - 1].close);
    return sum / (bars.length - 1);
}

/** Tum pivot taramasi + seviye kumeleme + supurulme tespiti - tek ileri geçis. */
function computeLevels(bars: BarData[], o: EqHLOptions): EqLevel[] {
    const atr = wilderAtr(bars, o.atrLength);
    const gammaTolerance = avgAbsChange(bars) * o.gammaToleranceMult;
    const n = bars.length;
    const pb = Math.max(1, o.pivotBars);
    const activeHigh: EqLevel[] = [];
    const activeLow: EqLevel[] = [];
    const all: EqLevel[] = [];

    for (let i = 0; i < n; i++) {
        // 1) Supurulme kontrolu: aktif seviyeler bu barda SIKI (kirilma yonu) tolerans-otesi kirildi mi?
        for (let k = activeHigh.length - 1; k >= 0; k--) {
            const lvl = activeHigh[k];
            if (bars[i].high > lvl.price + lvl.strictTolerance) {
                lvl.swept = true;
                lvl.sweptBar = i;
                activeHigh.splice(k, 1);
            }
        }
        for (let k = activeLow.length - 1; k >= 0; k--) {
            const lvl = activeLow[k];
            if (bars[i].low < lvl.price - lvl.strictTolerance) {
                lvl.swept = true;
                lvl.sweptBar = i;
                activeLow.splice(k, 1);
            }
        }

        // 2) pivotBars kadar geriden bir pivot onaylanabilir mi?
        if (i < 2 * pb) continue;
        const p = i - pb;

        let tolerance: number;
        if (o.useAcademicGamma) {
            tolerance = gammaTolerance;
            if (tolerance <= 0) continue;
        } else {
            const a = atr[p];
            if (a === null || a <= 0) continue;
            tolerance = a * o.toleranceMult;
        }
        const strictTolerance = tolerance * o.strictSideRatio;
        const safeTolerance = tolerance * o.safeSideRatio;

        const hp = bars[p].high, lp = bars[p].low;
        let isPH = true, isPL = true;
        for (let k = i - 2 * pb; k <= i; k++) {
            if (k === p) continue;
            if (bars[k].high > hp) isPH = false;
            if (bars[k].low < lp) isPL = false;
        }

        if (isPH) {
            let matched: EqLevel | null = null;
            for (const lvl of activeHigh) {
                if (p - lvl.lastBar > o.maxLookbackBars) continue;
                if (p - lvl.lastBar < o.minGapBars) continue;
                if (!isEqualMatch('high', hp, lvl.price, safeTolerance, strictTolerance)) continue;
                const diff = Math.abs(hp - lvl.price);
                if (!matched || diff < Math.abs(hp - matched.price)) matched = lvl;
            }
            if (matched) {
                // Seviye fiyati EN UC noktaya (en yuksek high) sabitlenir - dinlenen
                // likidite gercek stop kumesinin oldugu yer, ortalama degil.
                matched.price = Math.max(matched.price, hp);
                matched.touches++;
                matched.lastBar = p;
                matched.tolerance = tolerance;
                matched.strictTolerance = strictTolerance;
            } else {
                const lvl: EqLevel = { type: 'high', price: hp, firstBar: p, lastBar: p, touches: 1, tolerance, strictTolerance, swept: false, sweptBar: null };
                activeHigh.push(lvl);
                all.push(lvl);
            }
        }
        if (isPL) {
            let matched: EqLevel | null = null;
            for (const lvl of activeLow) {
                if (p - lvl.lastBar > o.maxLookbackBars) continue;
                if (p - lvl.lastBar < o.minGapBars) continue;
                if (!isEqualMatch('low', lp, lvl.price, safeTolerance, strictTolerance)) continue;
                const diff = Math.abs(lp - lvl.price);
                if (!matched || diff < Math.abs(lp - matched.price)) matched = lvl;
            }
            if (matched) {
                // Seviye fiyati EN UC noktaya (en dusuk low) sabitlenir - dinlenen
                // likidite gercek stop kumesinin oldugu yer, ortalama degil.
                matched.price = Math.min(matched.price, lp);
                matched.touches++;
                matched.lastBar = p;
                matched.tolerance = tolerance;
                matched.strictTolerance = strictTolerance;
            } else {
                const lvl: EqLevel = { type: 'low', price: lp, firstBar: p, lastBar: p, touches: 1, tolerance, strictTolerance, swept: false, sweptBar: null };
                activeLow.push(lvl);
                all.push(lvl);
            }
        }
    }
    return all;
}

function rgbaFrom(color: string, alpha: number): string {
    const hex = color.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return color;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

class EqHLIndicatorV2 extends OverlayIndicator {
    private _eOptions: EqHLOptions;
    private _levels: EqLevel[] = [];

    constructor(options: Partial<EqHLOptions> = {}) {
        const merged = { ...defaultEqHLOptions, ...options };
        super(merged);
        this._eOptions = { ...defaultEqHLOptions, ...this._options } as EqHLOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._eOptions };
    }

    setSettingValue(key: string, value: any): boolean {
        (this._eOptions as any)[key] = value;
        (this._options as any)[key] = value;
        if (this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
        return true;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._data = [];
        if (sourceData.length === 0) { this._levels = []; return; }

        this._levels = computeLevels(sourceData, this._eOptions);

        const byBar: Record<number, EqLevel[]> = {};
        for (const lvl of this._levels) {
            if (lvl.touches < 2) continue;
            (byBar[lvl.lastBar] = byBar[lvl.lastBar] || []).push(lvl);
        }
        this._data = sourceData.map((bar, i) => {
            const arr = byBar[i];
            return arr && arr.length > 0
                ? { time: bar.time, value: arr[0].price, values: arr.map(l => l.price) }
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
        const confirmed = this._levels.filter(l => l.touches >= 2);
        const active = confirmed.filter(l => !l.swept).length;
        const swept = confirmed.filter(l => l.swept).length;
        const method = this._eOptions.useAcademicGamma
            ? `gamma x${this._eOptions.gammaToleranceMult.toFixed(2)}`
            : `ATR x${this._eOptions.toleranceMult.toFixed(2)}`;
        return `EQH/EQL V2: ${active} aktif, ${swept} supurulmus (${method})`;
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        if (this._levels.length === 0 || this._sourceData.length === 0) return;

        const lastBar = this._sourceData.length - 1;
        ctx.save();
        for (const lvl of this._levels) {
            if (lvl.touches < 2) continue;
            if (lvl.swept && this._eOptions.hideSwept) continue;

            const color = lvl.type === 'high' ? this._eOptions.eqhColor : this._eOptions.eqlColor;
            const endBar = lvl.swept && lvl.sweptBar !== null ? lvl.sweptBar : lastBar;
            const x1 = timeScale.indexToCoordinate(lvl.firstBar as any) * hpr;
            const x2 = timeScale.indexToCoordinate(endBar as any) * hpr;
            const y = priceScale.priceToCoordinate(lvl.price) * vpr;

            const alpha = lvl.swept ? this._eOptions.sweptOpacity / 100 : 0.9;
            ctx.strokeStyle = rgbaFrom(color, alpha);
            ctx.lineWidth = this._eOptions.lineWidth * hpr;
            ctx.setLineDash(lvl.swept ? [4 * hpr, 3 * hpr] : []);
            ctx.beginPath();
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
            ctx.stroke();

            if (lvl.swept && lvl.sweptBar !== null) {
                const sx = timeScale.indexToCoordinate(lvl.sweptBar as any) * hpr;
                const sy = y;
                const r = 4 * hpr;
                ctx.strokeStyle = rgbaFrom(color, 0.9);
                ctx.lineWidth = 1.5 * hpr;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(sx - r, sy - r); ctx.lineTo(sx + r, sy + r);
                ctx.moveTo(sx - r, sy + r); ctx.lineTo(sx + r, sy - r);
                ctx.stroke();
            }

            if (this._eOptions.showLabels) {
                const label = `${lvl.type === 'high' ? 'EQH' : 'EQL'}${lvl.touches > 2 ? ' x' + lvl.touches : ''}${lvl.swept ? ' (supuruldu)' : ''}`;
                ctx.font = `${10 * hpr}px sans-serif`;
                ctx.fillStyle = rgbaFrom(color, Math.min(1, alpha + 0.15));
                ctx.textAlign = 'left';
                ctx.textBaseline = lvl.type === 'high' ? 'bottom' : 'top';
                ctx.fillText(label, x2 + 4 * hpr, y);
            }
        }
        ctx.restore();
    }
}

globalThis.__draftIndicatorClass = EqHLIndicatorV2;
