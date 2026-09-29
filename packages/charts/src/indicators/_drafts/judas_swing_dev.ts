// ICT Judas Swing — seans acilisinda gercek gunluk harekete once yanlis yonde
// (referans araligin disina) sahte bir kirilim yapip likidite topladiktan
// sonra, displacement ile ters yone donme paterni.
//
// Referans Aralik (Reference Range): onceki seansin (varsayilan: Asya, 20:00-
// 00:00 EST) high/low'u. Bu araligin disina cikan ilk hareket "sahte kirilim"
// adayidir.
//
// Not: Ilk versiyonda supurulme sadece sabit bir "kill zone" saat penceresinde
// (orn. Londra 02:00-05:00) aranıyordu. Gercek veride supurulme/displacement
// cogu zaman bu pencerenin disinda (pencere acilmadan once ya da saatler sonra)
// olustugu goruldu, bu yuzden saat penceresi kaldirildi - artik arama, referans
// aralik kapanisindan bir sonraki referans araligi baslayana kadar (bir sonraki
// gune kadar) saat sinirlamasi olmadan surer; sadece bar sayisi limitleri
// (maxConfirmBars, maxRetestBars) gecerlidir.
//
// State machine (referans-araligin her olusumu icin, en fazla bir Judas
// denemesi):
//  1. 'swept'     - Judas penceresinde fiyat ilk kez referans high/low disina
//                   cikti (wick yeterli, body sarti yok - bu asama sadece
//                   likidite alimi/supurulme).
//  2. 'displaced' - supurulmeden sonra fiyat KAPANIS ile MSS seviyesini
//                   (requireMss=true, varsayilan) body ile kirdi VE
//                   MSS seviyesi SABIT DEGIL: baslangicta supurmeden onceki
//                   son local swing kullanilir, ama supurmeden SONRA fiyat
//                   yeni bir pullback/konsolidasyon (yeni dalga yapisi)
//                   olustururlarsa bu da aday seviye olarak degerlendirilir
//                   (bkz. findPostSweepPivot) - cunku ICT'de kirilmasi gereken
//                   nokta sadece supurme oncesindeki degil, donusun kendi
//                   icinde olusan yapidan da gelebilir. Adaylar arasindan HER
//                   ZAMAN en kolay kirilabilecek (dir='low' icin en dusuk,
//                   dir='high' icin en yuksek) olan tutulur - yoksa fiyat yeni
//                   pivotlar olusturdukca esik surekli uzaklasip hicbir zaman
//                   yakalanamayan bir "kacan hedef"e donusur. requireMss=false
//                   ise MSS yerine tum referans araligin siniri kullanilir.
//                   Bu seviyenin ustune/altina KAPANIS ile gecilmesi gerekir VE
//                   supurmeden sonraki herhangi bir anda ters yonde 3-mumluk
//                   bir FVG (imbalance) olusmus olmasi gerekir (requireFvg=true,
//                   varsayilan) -> yapisal onay, ama henuz giris sinyali degil
//                   (ICT'de displacement sonrasi hemen girmek yerine FVG'ye
//                   retest beklenir). FVG taramasi MSS kirilimindan BAGIMSIZ
//                   her barda yapilir ve en son bulunan gap hatirlanir - cunku
//                   pratikte FVG genelde MSS kirilimindan once (erken bir
//                   pullback'te) olusur, ikisi nadiren ayni barda cakisir; FVG'yi
//                   sadece kirilim baninda aramak gercek FVG'leri kacirip
//                   olmayan bir "displacement yok" sonucuna goturuyordu. Wick ile
//                   kirilim "raid", body ile kapanis "shift" sayilir.
//  3. 'confirmed' - fiyat geri donup (retest) az once olusan FVG bolgesine
//                   tekrar dokundu (requireRetest=true, varsayilan) -> asil
//                   JUDAS giris sinyali burada olusur, gercek yon = supurulen
//                   tarafin tersi.
//  4. 'failed'    - maxConfirmBars icinde displacement gelmedi, ya da
//                   displacement sonrasi maxRetestBars icinde FVG'ye retest
//                   gelmedi, ya da bir sonraki referans araligi (yeni gun)
//                   basladi -> o gunku Judas denemesi gecersiz sayilir.
//
// Yon tahmini/bias girdisi yok: hangi tarafin supuruldugu onceden belirlenmis
// bir gunluk bias'a gore degil, sadece Judas penceresi icindeki fiili fiyat
// hareketine gore tespit ediliyor.
//
// Opsiyonel "premium" kurallar (hepsi ayarlardan acilip kapanabilir):
//  - requirePremiumDiscount: gece yarisi (00:00 EST) acilis fiyatina gore
//    baglam filtresi - high supurme (short beklentisi) sadece fiyat gece
//    yarisi acilisinin USTUNDEYSE (premium) gecerli, low supurme (long
//    beklentisi) sadece ALTINDAYSA (discount) gecerli. Yanlis baglamda
//    olusan supurme direkt 'failed' sayilir.
//  - enforceMssCutoff: katı ICT tanimina gore Judas Swing sadece gece yarisi
//    ile mssCutoffH (varsayilan 05:00 EST) arasinda tamamlanir; bu saatten
//    sonra hala 'swept'/'displaced' durumundaki bir deneme 'failed' sayilir.
//    Varsayilan kapali (esneklik icin) - kapatilirsa MSS/retest gun boyu
//    (bir sonraki referans araligina kadar) aranmaya devam eder.

interface JudasOptions {
    name: string;
    timezone: string;
    refStartH: number;
    refEndH: number;
    maxConfirmBars: number;
    requireFvg: boolean;
    requireRetest: boolean;
    maxRetestBars: number;
    requireMss: boolean;
    mssLookbackBars: number;
    mssPivotBars: number;
    enforceMssCutoff: boolean;
    mssCutoffH: number;
    requirePremiumDiscount: boolean;
    drawLastNDays: number;
    showRefRange: boolean;
    showMssLevel: boolean;
    showFvgBox: boolean;
    showTargets: boolean;
    showFailed: boolean;
    showLabels: boolean;
    bullColor: string;
    bearColor: string;
    refRangeColor: string;
    fvgColor: string;
    failedColor: string;
    lineWidth: number;
    visible: boolean;
}

const defaultJudasOptions: JudasOptions = {
    name: 'Judas Swing',
    timezone: 'America/New_York',
    refStartH: 20,
    refEndH: 0,
    maxConfirmBars: 60,
    requireFvg: true,
    requireRetest: true,
    maxRetestBars: 40,
    requireMss: true,
    mssLookbackBars: 10,
    mssPivotBars: 2,
    enforceMssCutoff: false,
    mssCutoffH: 5,
    requirePremiumDiscount: true,
    drawLastNDays: 15,
    showRefRange: true,
    showMssLevel: true,
    showFvgBox: true,
    showTargets: true,
    showFailed: false,
    showLabels: true,
    bullColor: '#26a69a',
    bearColor: '#ef5350',
    refRangeColor: '#787b86',
    fvgColor: '#ab47bc',
    failedColor: '#787b86',
    lineWidth: 2,
    visible: true,
};

interface RefRange {
    startIdx: number;
    endIdx: number;
    high: number;
    low: number;
    midnightOpen: number | null;
}

interface JudasOcc {
    ref: RefRange;
    sweepDir: 'high' | 'low';
    sweepBar: number;
    sweepPrice: number;
    state: 'swept' | 'displaced' | 'confirmed' | 'failed';
    displacedBar: number | null;
    confirmBar: number | null;
    confirmPrice: number | null;
    targetPrice: number;
    resolvedBar: number;
    fvgTop: number | null;
    fvgBottom: number | null;
    fvgLeftBar: number | null;
    mssLevel: number;
}

/**
 * Supurmeden (sweepBar) sonra olusan EN GUNCEL dogrulanmis local pivotu arar -
 * dir='high' (yukari supurme, asagi MSS bekleniyor) icin pivot LOW, dir='low'
 * icin pivot HIGH. Bir bar p, [p-pivotBars, p+pivotBars] penceresinde extremum
 * ise ve bu pencerenin sag ucu mevcut barin (uptoBar) icinde tamamen
 * dogrulanmissa (p+pivotBars < uptoBar) pivot sayilir. En yeniden en eskiye
 * dogru taranir, ilk bulunan (= en guncel) dondurulur - supurmeden sonra
 * fiyatin yeni dalga yapilari (pullback/konsolidasyon) olusturmaya devam
 * etmesi durumunda MSS seviyesi de bununla birlikte guncellenmis olur.
 */
function findPostSweepPivot(sourceData: BarData[], sweepBar: number, uptoBar: number, dir: 'high' | 'low', pivotBars: number): number | null {
    for (let p = uptoBar - 1 - pivotBars; p >= sweepBar; p--) {
        if (p - pivotBars < sweepBar) break;
        const val = dir === 'high' ? sourceData[p].low : sourceData[p].high;
        let isPivot = true;
        for (let k = p - pivotBars; k <= p + pivotBars; k++) {
            if (k === p) continue;
            if (dir === 'high' ? sourceData[k].low < val : sourceData[k].high > val) { isPivot = false; break; }
        }
        if (isPivot) return val;
    }
    return null;
}

function rgbaFrom(color: string, alpha: number): string {
    const hex = color.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return color;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

class JudasSwingIndicator extends OverlayIndicator {
    private _jOptions: JudasOptions;
    private _occs: JudasOcc[] = [];
    private _fmt: any = null;
    private _fmtTz: string = '';

    constructor(options: Partial<JudasOptions> = {}) {
        const merged = { ...defaultJudasOptions, ...options };
        super(merged);
        this._jOptions = { ...defaultJudasOptions, ...this._options } as JudasOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._jOptions };
    }

    setSettingValue(key: string, value: any): boolean {
        (this._jOptions as any)[key] = value;
        (this._options as any)[key] = value;
        if (this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
        return true;
    }

    private _getFormatter(tz: string): any {
        if (!this._fmt || this._fmtTz !== tz) {
            try {
                this._fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
                this._fmtTz = tz;
            } catch (e) {
                this._fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
                this._fmtTz = 'UTC';
            }
        }
        return this._fmt;
    }

    private _computeMinutes(bars: BarData[]): number[] {
        const fmt = this._getFormatter(this._jOptions.timezone);
        const out: number[] = new Array(bars.length);
        for (let i = 0; i < bars.length; i++) {
            const parts = fmt.formatToParts(new Date(bars[i].time));
            let h = 0, m = 0;
            for (const p of parts) {
                if (p.type === 'hour') h = parseInt(p.value, 10);
                else if (p.type === 'minute') m = parseInt(p.value, 10);
            }
            if (h === 24) h = 0;
            out[i] = h * 60 + m;
        }
        return out;
    }

    /** Referans aralik + Judas penceresi taramasi ve state machine - tek ileri gecis. */
    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._data = sourceData.map(b => ({ time: b.time, value: NaN }));
        this._occs = [];
        if (sourceData.length === 0) return;

        const o = this._jOptions;
        const minutes = this._computeMinutes(sourceData);
        const refS = Math.round(o.refStartH * 60), refE = Math.round(o.refEndH * 60);
        const cutoffMin = Math.round(o.mssCutoffH * 60);
        const inRef = (m: number) => refS < refE ? (m >= refS && m < refE) : (m >= refS || m < refE);

        let ref: RefRange | null = null;
        let pendingRef: RefRange | null = null;
        let occ: JudasOcc | null = null;

        for (let i = 0; i < sourceData.length; i++) {
            const m = minutes[i];
            const b = sourceData[i];

            if (inRef(m)) {
                if (!ref) {
                    // Yeni gunun referans araligi basliyor - bir onceki gunden
                    // kalan cozulmemis bir deneme varsa artik gun bitti sayilir.
                    if (occ && (occ.state === 'swept' || occ.state === 'displaced')) {
                        occ.state = 'failed';
                        occ.resolvedBar = i;
                    }
                    occ = null;
                    pendingRef = null;
                    ref = { startIdx: i, endIdx: i, high: b.high, low: b.low, midnightOpen: null };
                } else {
                    ref.endIdx = i;
                    if (b.high > ref.high) ref.high = b.high;
                    if (b.low < ref.low) ref.low = b.low;
                }
            } else if (ref) {
                // referans araligi az once kapandi - bu barin acilisi "gece
                // yarisi acilis fiyati" (premium/discount referansi) olarak alinir.
                ref.midnightOpen = b.open;
                pendingRef = ref;
                ref = null;
            }

            if (!pendingRef) continue;

            // Kati ICT kuralina gore Judas Swing sadece gece yarisindan belli bir
            // saate (varsayilan 05:00 EST) kadar tamamlanir - enforceMssCutoff
            // acikken bu saatten sonra hala cozulmemis bir deneme gecersiz sayilir.
            if (o.enforceMssCutoff && occ && (occ.state === 'swept' || occ.state === 'displaced') && m >= cutoffMin) {
                occ.state = 'failed';
                occ.resolvedBar = i;
                occ = null;
                pendingRef = null;
                continue;
            }

            if (!occ) {
                const brokeHigh = b.high > pendingRef.high;
                const brokeLow = b.low < pendingRef.low;
                if (brokeHigh || brokeLow) {
                    const dir: 'high' | 'low' = (brokeHigh && brokeLow)
                        ? (Math.abs(b.close - pendingRef.high) <= Math.abs(b.close - pendingRef.low) ? 'high' : 'low')
                        : (brokeHigh ? 'high' : 'low');
                    const sweepPrice = dir === 'high' ? b.high : b.low;

                    // MSS seviyesi: supurmeden onceki mssLookbackBars pencerisinde olusan
                    // son local swing - yukari supurme icin en dusuk low, asagi supurme
                    // icin en yuksek high. Pencere referans araligin ENDINDEN (kapanisindan)
                    // sonraki barlarla sinirli - araligin icine (eski Asya barlarina) tasarsa
                    // anlamsiz/cok uzak bir seviye bulunur. Supurme referans kapanisina cok
                    // yakinsa (post-close bar yoksa) asagidaki fallback (araligin siniri)
                    // gecerli kalir.
                    const lookStart = Math.max(pendingRef.endIdx, i - o.mssLookbackBars);
                    let mssLevel = dir === 'high' ? pendingRef.low : pendingRef.high;
                    if (lookStart < i) {
                        if (dir === 'high') {
                            let lo = Infinity;
                            for (let k = lookStart; k < i; k++) if (sourceData[k].low < lo) lo = sourceData[k].low;
                            mssLevel = lo;
                        } else {
                            let hi = -Infinity;
                            for (let k = lookStart; k < i; k++) if (sourceData[k].high > hi) hi = sourceData[k].high;
                            mssLevel = hi;
                        }
                    }

                    // Premium/Discount baglami: high supurme (short beklentisi) sadece
                    // fiyat gece yarisi acilisinin USTUNDEYSE, low supurme (long
                    // beklentisi) sadece ALTINDAYSA gecerli sayilir.
                    const mo = pendingRef.midnightOpen;
                    const contextOk = !o.requirePremiumDiscount || mo === null
                        || (dir === 'high' ? sweepPrice > mo : sweepPrice < mo);

                    occ = {
                        ref: pendingRef,
                        sweepDir: dir,
                        sweepBar: i,
                        sweepPrice,
                        state: contextOk ? 'swept' : 'failed',
                        displacedBar: null,
                        confirmBar: null,
                        confirmPrice: null,
                        targetPrice: dir === 'high' ? pendingRef.low : pendingRef.high,
                        resolvedBar: i,
                        fvgTop: null,
                        fvgBottom: null,
                        fvgLeftBar: null,
                        mssLevel,
                    };
                    this._occs.push(occ);
                    if (!contextOk) { occ = null; pendingRef = null; }
                }
            } else if (occ.state === 'swept') {
                const barsSince = i - occ.sweepBar;
                if (barsSince > o.maxConfirmBars) {
                    occ.state = 'failed';
                    occ.resolvedBar = i;
                    occ = null;
                    pendingRef = null;
                } else {
                    // MSS seviyesi dinamik: supurmeden sonra fiyat yeni bir dogrulanmis
                    // pivot (pullback/konsolidasyon) olustururdukca bu da aday seviye
                    // olarak degerlendirilir. Her zaman EN KOLAY kirilabilecek (dir='low'
                    // icin en dusuk, dir='high' icin en yuksek) aday tutulur - yoksa fiyat
                    // hep yeni (daha uzak) pivotlar olusturdukca esik surekli uzaklasip
                    // hicbir zaman yakalanamayan bir "kacan hedef"e donusur.
                    if (o.requireMss) {
                        const postPivot = findPostSweepPivot(sourceData, occ.sweepBar, i, occ.sweepDir, o.mssPivotBars);
                        if (postPivot !== null) {
                            occ.mssLevel = occ.sweepDir === 'low'
                                ? Math.min(occ.mssLevel, postPivot)
                                : Math.max(occ.mssLevel, postPivot);
                        }
                    }
                    // MSS (Market Structure Shift): wick ile kirilim "raid", body ile
                    // KAPANIS "shift" sayilir - o yuzden close karsilastirilir.
                    const shiftLevel = o.requireMss ? occ.mssLevel : (occ.sweepDir === 'high' ? occ.ref.high : occ.ref.low);
                    const backThrough = occ.sweepDir === 'high' ? b.close < shiftLevel : b.close > shiftLevel;
                    // ters yonde 3-mumluk FVG: bars[i-2], bars[i-1], bars[i]. FVG taramasi
                    // backThrough'dan BAGIMSIZ, her barda yapilir ve bulunan en SON gap
                    // hatirlanir - cunku FVG genelde MSS kirilimindan farkli (genelde daha
                    // erken) bir barda olusur; ikisini ayni barda aramak gercek bir FVG'yi
                    // kacirip yanlislikla 'displacement olmadi' sonucuna varmaya sebep oluyordu.
                    if (o.requireFvg && i - 2 >= occ.sweepBar) {
                        const left = sourceData[i - 2];
                        if (occ.sweepDir === 'high' && left.low > b.high) {
                            occ.fvgTop = left.low; occ.fvgBottom = b.high; occ.fvgLeftBar = i - 2;
                        } else if (occ.sweepDir === 'low' && left.high < b.low) {
                            occ.fvgTop = b.low; occ.fvgBottom = left.high; occ.fvgLeftBar = i - 2;
                        }
                    }
                    const fvgOk = !o.requireFvg || occ.fvgTop !== null;
                    if (backThrough && fvgOk) {
                        if (o.requireRetest && occ.fvgTop !== null) {
                            // yapisal onay tamam, ama giris sinyali degil - fiyat
                            // FVG bolgesine geri donene (retest) kadar bekle.
                            occ.state = 'displaced';
                            occ.displacedBar = i;
                        } else {
                            occ.state = 'confirmed';
                            occ.confirmBar = i;
                            occ.confirmPrice = b.close;
                            occ.resolvedBar = i;
                            occ = null;
                            pendingRef = null;
                        }
                    }
                }
            } else if (occ.state === 'displaced') {
                const barsSinceDisp = i - (occ.displacedBar as number);
                if (barsSinceDisp > o.maxRetestBars) {
                    occ.state = 'failed';
                    occ.resolvedBar = i;
                    occ = null;
                    pendingRef = null;
                } else {
                    const fTop = occ.fvgTop as number, fBottom = occ.fvgBottom as number;
                    const touched = b.low <= fTop && b.high >= fBottom;
                    if (touched) {
                        occ.state = 'confirmed';
                        occ.confirmBar = i;
                        occ.confirmPrice = occ.sweepDir === 'low' ? fTop : fBottom;
                        occ.resolvedBar = i;
                        occ = null;
                        pendingRef = null;
                    }
                }
            }
        }
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
        const confirmed = this._occs.filter(o => o.state === 'confirmed').length;
        const failed = this._occs.filter(o => o.state === 'failed').length;
        return `Judas Swing: ${confirmed} onaylanmis, ${failed} basarisiz`;
    }

    private _cutoffTime(): number {
        const src = this._sourceData;
        return src[src.length - 1].time - this._jOptions.drawLastNDays * 86400000;
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        if (this._occs.length === 0 || this._sourceData.length === 0) return;
        const o = this._jOptions;
        const src = this._sourceData;
        const lastBar = src.length - 1;
        const cutoff = this._cutoffTime();
        const canvasW = ctx.canvas.width;

        ctx.save();
        for (const occ of this._occs) {
            if (src[occ.ref.startIdx].time < cutoff) continue;
            if (occ.state === 'failed' && !o.showFailed) continue;

            const isBull = occ.sweepDir === 'low'; // supurulen taraf low ise gercek yon yukari (bullish judas)
            const color = occ.state === 'failed' ? o.failedColor : (isBull ? o.bullColor : o.bearColor);
            const endBar = occ.state === 'confirmed' && occ.confirmBar !== null ? occ.confirmBar : occ.resolvedBar;

            if (o.showRefRange) {
                const x1 = timeScale.indexToCoordinate(occ.ref.startIdx as any) * hpr;
                const x2 = timeScale.indexToCoordinate(occ.ref.endIdx as any) * hpr;
                const yTop = priceScale.priceToCoordinate(occ.ref.high) * vpr;
                const yBot = priceScale.priceToCoordinate(occ.ref.low) * vpr;
                ctx.strokeStyle = rgbaFrom(o.refRangeColor, 0.5);
                ctx.setLineDash([3 * hpr, 3 * hpr]);
                ctx.lineWidth = 1 * hpr;
                ctx.strokeRect(x1, Math.min(yTop, yBot), x2 - x1, Math.abs(yBot - yTop));

                const lvlEndX = timeScale.indexToCoordinate(Math.max(occ.ref.endIdx, endBar) as any) * hpr;
                ctx.beginPath();
                ctx.moveTo(x2, yTop);
                ctx.lineTo(lvlEndX, yTop);
                ctx.moveTo(x2, yBot);
                ctx.lineTo(lvlEndX, yBot);
                ctx.stroke();
            }

            if (o.showMssLevel && o.requireMss) {
                const mx1 = timeScale.indexToCoordinate(occ.sweepBar as any) * hpr;
                const mx2 = timeScale.indexToCoordinate(Math.max(occ.sweepBar + 1, endBar) as any) * hpr;
                const my = priceScale.priceToCoordinate(occ.mssLevel) * vpr;
                ctx.setLineDash([2 * hpr, 2 * hpr]);
                ctx.strokeStyle = rgbaFrom(color, occ.state === 'failed' ? 0.3 : 0.7);
                ctx.lineWidth = 1 * hpr;
                ctx.beginPath();
                ctx.moveTo(mx1, my);
                ctx.lineTo(mx2, my);
                ctx.stroke();
                if (o.showLabels) {
                    ctx.font = `${8 * hpr}px sans-serif`;
                    ctx.fillStyle = rgbaFrom(color, 0.8);
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('MSS', mx2 + 3 * hpr, my);
                }
            }

            const sx = timeScale.indexToCoordinate(occ.sweepBar as any) * hpr;
            const sy = priceScale.priceToCoordinate(occ.sweepPrice) * vpr;
            const r = 4 * hpr;
            ctx.setLineDash([]);
            ctx.strokeStyle = rgbaFrom(color, occ.state === 'failed' ? 0.4 : 0.9);
            ctx.lineWidth = 1.5 * hpr;
            ctx.beginPath();
            ctx.moveTo(sx - r, sy - r); ctx.lineTo(sx + r, sy + r);
            ctx.moveTo(sx - r, sy + r); ctx.lineTo(sx + r, sy - r);
            ctx.stroke();

            if (o.showFvgBox && occ.fvgTop !== null && occ.fvgBottom !== null && occ.fvgLeftBar !== null) {
                // Retest bekleyen (displaced) veya onaylanmis (confirmed) her occurrence
                // icin FVG kutusu gosterilir - kutu, retest gelene kadar (ya da simdiki
                // bara kadar) sagda uzar, boylece retest'in nerede olustugu izlenebilir.
                const fEnd = occ.confirmBar !== null ? occ.confirmBar : lastBar;
                const fx1 = timeScale.indexToCoordinate(occ.fvgLeftBar as any) * hpr;
                const fx2 = timeScale.indexToCoordinate(Math.max(occ.fvgLeftBar + 2, fEnd) as any) * hpr;
                const fyTop = priceScale.priceToCoordinate(occ.fvgTop) * vpr;
                const fyBot = priceScale.priceToCoordinate(occ.fvgBottom) * vpr;
                const fAlpha = occ.state === 'failed' ? 0.4 : 1;
                ctx.setLineDash([]);
                ctx.fillStyle = rgbaFrom(o.fvgColor, 0.15 * fAlpha);
                ctx.fillRect(fx1, Math.min(fyTop, fyBot), fx2 - fx1, Math.abs(fyBot - fyTop));
                ctx.strokeStyle = rgbaFrom(o.fvgColor, 0.6 * fAlpha);
                ctx.lineWidth = 1 * hpr;
                ctx.strokeRect(fx1, Math.min(fyTop, fyBot), fx2 - fx1, Math.abs(fyBot - fyTop));
                if (o.showLabels) {
                    ctx.font = `${9 * hpr}px sans-serif`;
                    ctx.fillStyle = rgbaFrom(o.fvgColor, 0.9 * fAlpha);
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('FVG', fx1 + 3 * hpr, (fyTop + fyBot) / 2);
                }
            }

            if (occ.state === 'confirmed' && occ.confirmBar !== null) {
                const cx = timeScale.indexToCoordinate(occ.confirmBar as any) * hpr;
                const cy = priceScale.priceToCoordinate(occ.confirmPrice as number) * vpr;

                const ah = 8 * vpr;
                ctx.fillStyle = rgbaFrom(color, 0.95);
                ctx.beginPath();
                if (isBull) {
                    ctx.moveTo(cx, cy - ah); ctx.lineTo(cx - ah * 0.6, cy + ah * 0.3); ctx.lineTo(cx + ah * 0.6, cy + ah * 0.3);
                } else {
                    ctx.moveTo(cx, cy + ah); ctx.lineTo(cx - ah * 0.6, cy - ah * 0.3); ctx.lineTo(cx + ah * 0.6, cy - ah * 0.3);
                }
                ctx.closePath();
                ctx.fill();

                if (o.showLabels) {
                    ctx.font = `bold ${10 * hpr}px sans-serif`;
                    ctx.fillStyle = rgbaFrom(color, 0.95);
                    ctx.textAlign = 'left';
                    ctx.textBaseline = isBull ? 'bottom' : 'top';
                    ctx.fillText(isBull ? 'JUDAS ▲' : 'JUDAS ▼', cx + 6 * hpr, cy);
                }

                if (o.showTargets) {
                    const tx2 = timeScale.indexToCoordinate(lastBar as any) * hpr;
                    const ty = priceScale.priceToCoordinate(occ.targetPrice) * vpr;
                    ctx.setLineDash([2 * hpr, 4 * hpr]);
                    ctx.strokeStyle = rgbaFrom(color, 0.5);
                    ctx.lineWidth = 1 * hpr;
                    ctx.beginPath();
                    ctx.moveTo(cx, ty);
                    ctx.lineTo(tx2, ty);
                    ctx.stroke();

                    const stopY = priceScale.priceToCoordinate(occ.sweepPrice) * vpr;
                    ctx.strokeStyle = rgbaFrom(color, 0.3);
                    ctx.beginPath();
                    ctx.moveTo(cx, stopY);
                    ctx.lineTo(tx2, stopY);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }
}

globalThis.__draftIndicatorClass = JudasSwingIndicator;
