// Equal Highs / Equal Lows V2 (likidite seviyeleri).
//
// Bu taslak artik production eqhl-v2 ile senkron (backend eqhl_v2.py + eqhl-v2-indicator.ts),
// supurme sonrasi ONAY (confirmation) dahil. Fark: tum hesap tarayicida yapilir (taslaklarda
// backend yok); production'da hesap sunucuda, burada computeLevels + confirmation yerelde.
//
// Supurme sonrasi onay: supurme mumu dahil confirmBars mum icinde ters yonde kapanis
// (EQH icin dusen mum, EQL icin yukselen mum) gelirse seviye 'confirmed', pencere dolup
// gelmediyse 'failed', pencere henuz dolmadiysa 'pending'. confirmCloseInside acikken
// kapanis ayrica seviyenin geri icine donmus olmali (GERCEK kapanis, HA modunda da).
// confirmCandleType='heikin_ashi' ise mum yonu Heikin Ashi mumundan okunur.
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
// gosterilir (cizim aninda filtrelenir, hesap tekrarlanmaz).

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
    confirmBars: number;
    confirmCloseInside: boolean;
    confirmCandleType: 'regular' | 'heikin_ashi';
    showConfirmation: boolean;
    hideUnconfirmed: boolean;
    showLabels: boolean;
    eqhColor: string;
    eqlColor: string;
    confirmColor: string;
    sweptOpacity: number;
    lineWidth: number;
    visible: boolean;
    showSignals: boolean;
    sigMode: 'sweep' | 'breakout';
    sigSweepConfirm: boolean;
    sigWaitEmaCross: boolean;
    sigEmaMode: 'ema35' | 'ema358';
    sigMaxWaitBars: number;
    sigMinScore: number;
    sigRsiDir: number;
    sigRangeAtr: number;
    sigVolRegime: number;
    sigApproachAtr: number;
    sigSlAtr: number;
    sigTpAtr: number;
    sigRequireEmaAlign: boolean;
    showSigLevels: boolean;
    showEma35: boolean;
    sigLongColor: string;
    sigShortColor: string;
    ema3Color: string;
    ema5Color: string;
    ema8Color: string;
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
    confirmBars: 3,
    confirmCloseInside: false,
    confirmCandleType: 'regular',
    showConfirmation: true,
    hideUnconfirmed: false,
    showLabels: true,
    eqhColor: '#ef5350',
    eqlColor: '#26a69a',
    confirmColor: '#ffca28',
    sweptOpacity: 35,
    lineWidth: 1,
    visible: true,
    showSignals: true,
    sigMode: 'sweep',
    sigSweepConfirm: false,
    sigWaitEmaCross: true,
    sigEmaMode: 'ema358',
    sigMaxWaitBars: 10,
    sigMinScore: 2,
    sigRsiDir: 23.4,
    sigRangeAtr: 2.71,
    sigVolRegime: 1.15,
    sigApproachAtr: 3.67,
    sigSlAtr: 2,
    sigTpAtr: 4,
    sigRequireEmaAlign: false,
    showSigLevels: true,
    showEma35: false,
    sigLongColor: '#00c853',
    sigShortColor: '#ff6d00',
    ema3Color: '#2962ff',
    ema5Color: '#ff9800',
    ema8Color: '#e91e63',
};

type ConfirmStatus = 'confirmed' | 'failed' | 'pending' | null;

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
    confirmStatus: ConfirmStatus;
    confirmBar: number | null;
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

/** Heikin Ashi mumlari (open/close; backend common.heikin_ashi ile ayni formul, HA_open ozyinelemeli). */
function heikinAshi(bars: BarData[]): { open: number; close: number }[] {
    const out: { open: number; close: number }[] = [];
    for (let i = 0; i < bars.length; i++) {
        const b = bars[i];
        const haClose = (b.open + b.high + b.low + b.close) / 4;
        const haOpen = i === 0 ? (b.open + b.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
        out.push({ open: haOpen, close: haClose });
    }
    return out;
}

/** Supurme sonrasi onay: supurme mumu dahil confirmBars mum icinde ters yonde kapanis.
 * ha verilirse mum yonu HA mumundan okunur; closeInside yine GERCEK kapanisi kullanir.
 * Pencere tam dolmadan onay yoksa 'pending' (son mum olusuyor olabilir). */
function confirmation(
    bars: BarData[], lvl: EqLevel, confirmBars: number, closeInside: boolean, ha: { open: number; close: number }[] | null,
): { status: ConfirmStatus; bar: number | null } {
    const s = lvl.sweptBar;
    if (s === null) return { status: null, bar: null };
    const isHigh = lvl.type === 'high';
    const last = Math.min(s + confirmBars - 1, bars.length - 1);
    for (let c = s; c <= last; c++) {
        const realClose = bars[c].close;
        const o = ha === null ? bars[c].open : ha[c].open;
        const cl = ha === null ? realClose : ha[c].close;
        const ok = isHigh
            ? cl < o && (!closeInside || realClose < lvl.price)
            : cl > o && (!closeInside || realClose > lvl.price);
        if (ok) return { status: 'confirmed', bar: c };
    }
    return { status: s + confirmBars - 1 <= bars.length - 1 ? 'failed' : 'pending', bar: null };
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
                const lvl: EqLevel = { type: 'high', price: hp, firstBar: p, lastBar: p, touches: 1, tolerance, strictTolerance, swept: false, sweptBar: null, confirmStatus: null, confirmBar: null };
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
                const lvl: EqLevel = { type: 'low', price: lp, firstBar: p, lastBar: p, touches: 1, tolerance, strictTolerance, swept: false, sweptBar: null, confirmStatus: null, confirmBar: null };
                activeLow.push(lvl);
                all.push(lvl);
            }
        }
    }

    // Heikin Ashi tum seri uzerinden, yalnizca secildiyse hesaplanir (grafigin mum tipinden bagimsiz).
    const ha = o.confirmCandleType === 'heikin_ashi' ? heikinAshi(bars) : null;
    const confirmBars = Math.max(1, Math.trunc(o.confirmBars));
    const out: EqLevel[] = [];
    for (const lvl of all) {
        if (lvl.touches < 2) continue;
        const r = confirmation(bars, lvl, confirmBars, !!o.confirmCloseInside, ha);
        lvl.confirmStatus = r.status;
        lvl.confirmBar = r.bar;
        out.push(lvl);
    }
    return out;
}

function rgbaFrom(color: string, alpha: number): string {
    const hex = color.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return color;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

// ---- Sinyal katmani (iki mod) ----
// sweep (varsayilan): EQH supurulunce SAT, EQL supurulunce AL (likidite supurme); EMA200 filtresi
// ve minimum skor yok, skor yalnizca gosterim. breakout: EQH->AL, EQL->SAT, EMA200 trend + skor filtreli.
// Seviye supurulen mumun KAPANISINDA degerlendirilir (ileriye bakis yok); sonuc (tp/sl)
// yalnizca gosterim icin sonraki mumlardan hesaplanir.

interface MomentumSignal {
    bar: number;
    dir: 1 | -1;
    score: number;
    emaAligned: boolean;
    atr: number;
    entry: number;
    sl: number;
    tp: number;
    result: 'tp' | 'sl' | 'open';
    exitBar: number | null;
}

/** EMA: ilk deger ilk `period` kapanisin SMA'si, sonra klasik alfa=2/(period+1). Tanimsiz yerler NaN. */
function emaSeries(values: number[], period: number): number[] {
    const out: number[] = new Array(values.length).fill(NaN);
    if (values.length < period) return out;
    let sum = 0;
    for (let i = 0; i < period; i++) sum += values[i];
    let prev = sum / period;
    out[period - 1] = prev;
    const k = 2 / (period + 1);
    for (let i = period; i < values.length; i++) {
        prev = values[i] * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
}

/** Wilder RSI: ilk ortalama ilk `period` kazanc/kaybin SMA'si, sonra Wilder yumusatma. avgLoss=0 ise 100. */
function wilderRsi(values: number[], period: number): number[] {
    const out: number[] = new Array(values.length).fill(NaN);
    if (values.length <= period) return out;
    let g = 0, l = 0;
    for (let i = 1; i <= period; i++) {
        const d = values[i] - values[i - 1];
        if (d > 0) g += d; else l -= d;
    }
    let avgG = g / period, avgL = l / period;
    out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    for (let i = period + 1; i < values.length; i++) {
        const d = values[i] - values[i - 1];
        avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
        avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
        out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    }
    return out;
}

/** Supurulen (touches>=2) seviyelerden momentum kirilim sinyalleri uretir. */
function computeSignals(bars: BarData[], levels: EqLevel[], o: EqHLOptions, ema3: number[], ema5: number[], ema8: number[]): MomentumSignal[] {
    const n = bars.length;
    const closes = bars.map(b => b.close);
    const ema200 = emaSeries(closes, 200);
    const rsi = wilderRsi(closes, 14);
    const atr = wilderAtr(bars, o.atrLength);
    const sorted = levels
        .filter(l => l.touches >= 2 && l.swept && l.sweptBar !== null)
        .sort((a, b) => (a.sweptBar as number) - (b.sweptBar as number));
    const seen: Record<string, boolean> = {};
    const out: MomentumSignal[] = [];

    const sweepMode = o.sigMode !== 'breakout';
    const use358 = o.sigEmaMode !== 'ema35';

    for (const lvl of sorted) {
        let b = lvl.sweptBar as number;
        let d: 1 | -1;
        const al = (i: number) => (ema3[i] - ema5[i]) * d > 0 && (!use358 || (ema5[i] - ema8[i]) * d > 0);
        if (sweepMode) {
            d = lvl.type === 'high' ? -1 : 1;
            if (o.sigSweepConfirm) {
                if (lvl.confirmStatus !== 'confirmed' || lvl.confirmBar === null) continue;
                b = lvl.confirmBar;
            }
            // EMA hizalanmasini bekle (sinyal hizalanma mumunun kapanisinda):
            //  ema35  : EMA3/5 ters yone kesisim  -> (ema3-ema5)*d > 0
            //  ema358 : EMA3>5>8 (AL) / 3<5<8 (SAT) dizilimi -> ayrica (ema5-ema8)*d > 0
            // Sweep mumunda zaten hizaliysa sinyal o mumda; degilse sigMaxWaitBars icinde
            // hizalanmaya ilk gecis mumunda.
            if (o.sigWaitEmaCross) {
                let c = -1;
                if (al(b)) c = b;
                else {
                    const lim = Math.min(n - 1, b + Math.max(1, Math.trunc(o.sigMaxWaitBars)));
                    for (let k = b + 1; k <= lim; k++) { if (al(k) && !al(k - 1)) { c = k; break; } }
                }
                if (c < 0) continue;
                b = c;
            }
            if (b - 12 < 0 || b >= n) continue;
        } else {
            if (b < 220 || b - 12 < 0 || b >= n) continue;
            const e200 = ema200[b];
            if (isNaN(e200)) continue;
            d = lvl.type === 'high' ? 1 : -1;
            const trend = closes[b] > e200 ? 1 : -1;
            if (d !== trend) continue;
        }
        const key = b + ':' + d;
        if (seen[key]) continue;

        const a = atr[b];
        if (a === null || a <= 0) continue;
        // SMA100(ATR): son 100 ATR degerinin hepsi tanimli olmali
        let sum = 0, cnt = 0;
        for (let k = b - 99; k <= b; k++) {
            if (k < 0) break;
            const v = atr[k];
            if (v === null) break;
            sum += v; cnt++;
        }
        const atrSma = cnt >= 100 ? sum / 100 : NaN;
        const r = rsi[b];
        if (!sweepMode && (cnt < 100 || isNaN(r) || atrSma <= 0)) continue;

        let score = 0;
        if (!isNaN(r) && (r - 50) * d > o.sigRsiDir) score++;
        if ((bars[b].high - bars[b].low) / a > o.sigRangeAtr) score++;
        if (!isNaN(atrSma) && atrSma > 0 && a / atrSma > o.sigVolRegime) score++;
        if ((closes[b] - closes[b - 12]) * d / a > o.sigApproachAtr) score++;
        if (!sweepMode && score < o.sigMinScore) continue;

        const emaAligned = al(b);
        if (o.sigRequireEmaAlign && !emaAligned) continue;

        seen[key] = true;
        const entry = closes[b];
        const sl = entry - d * o.sigSlAtr * a;
        const tp = entry + d * o.sigTpAtr * a;
        let result: 'tp' | 'sl' | 'open' = 'open';
        let exitBar: number | null = null;
        for (let j = b + 1; j < n; j++) {
            const hitSl = d === 1 ? bars[j].low <= sl : bars[j].high >= sl;
            const hitTp = d === 1 ? bars[j].high >= tp : bars[j].low <= tp;
            if (hitSl) { result = 'sl'; exitBar = j; break; }
            if (hitTp) { result = 'tp'; exitBar = j; break; }
        }
        out.push({ bar: b, dir: d, score, emaAligned, atr: a, entry, sl, tp, result, exitBar });
    }
    out.sort((x, y) => x.bar - y.bar);
    return out;
}

class EqHLIndicatorV2 extends OverlayIndicator {
    private _eOptions: EqHLOptions;
    private _levels: EqLevel[] = [];
    private _signals: MomentumSignal[] = [];
    private _ema3: number[] = [];
    private _ema5: number[] = [];
    private _ema8: number[] = [];

    constructor(options: Partial<EqHLOptions> = {}) {
        const merged = { ...defaultEqHLOptions, ...options };
        super(merged);
        this._eOptions = { ...defaultEqHLOptions, ...this._options } as EqHLOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._eOptions };
    }

    /** Otomatik ayar listesi metin seceneklerini uretmez: onay mum tipi secimi buraya eklenir. */
    getSettingsConfig(): any {
        const cfg = super.getSettingsConfig();
        const rows: any[] | undefined = cfg?.tabs?.[0]?.sections?.[0]?.rows;
        if (rows) {
            const row = {
                type: 'select', key: 'confirmCandleType', label: 'Confirm Candle Type', defaultValue: 'regular',
                options: [{ value: 'regular', label: 'Normal' }, { value: 'heikin_ashi', label: 'Heikin Ashi' }],
            };
            const at = rows.findIndex(r => r.key === 'confirmCloseInside');
            rows.splice(at >= 0 ? at + 1 : rows.length, 0, row);

            const modeRow = {
                type: 'select', key: 'sigMode', label: 'Signal Mode', defaultValue: 'sweep',
                options: [
                    { value: 'sweep', label: 'Likidite supurme (EQH->SAT, EQL->AL)' },
                    { value: 'breakout', label: 'Kirilim (EQH->AL, EQL->SAT)' },
                ],
            };
            // Varsa otomatik uretilmis sigMode satirini kaldir (cift satir olmasin)
            for (let k = rows.length - 1; k >= 0; k--) {
                if (rows[k].key === 'sigMode') rows.splice(k, 1);
            }
            const sAt = rows.findIndex(r => r.key === 'showSignals');
            rows.splice(sAt >= 0 ? sAt + 1 : rows.length, 0, modeRow);

            const emaModeRow = {
                type: 'select', key: 'sigEmaMode', label: 'EMA Onay Modu', defaultValue: 'ema358',
                options: [
                    { value: 'ema35', label: 'EMA 3/5 kesisim' },
                    { value: 'ema358', label: 'EMA 3>5>8 dizilim' },
                ],
            };
            for (let k = rows.length - 1; k >= 0; k--) {
                if (rows[k].key === 'sigEmaMode') rows.splice(k, 1);
            }
            const wAt = rows.findIndex(r => r.key === 'sigWaitEmaCross');
            rows.splice(wAt >= 0 ? wAt + 1 : rows.length, 0, emaModeRow);
        }
        return cfg;
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
        if (sourceData.length === 0) { this._levels = []; this._signals = []; this._ema3 = []; this._ema5 = []; this._ema8 = []; return; }

        this._levels = computeLevels(sourceData, this._eOptions);
        const closes = sourceData.map(b => b.close);
        this._ema3 = emaSeries(closes, 3);
        this._ema5 = emaSeries(closes, 5);
        this._ema8 = emaSeries(closes, 8);
        this._signals = computeSignals(sourceData, this._levels, this._eOptions, this._ema3, this._ema5, this._ema8);

        const byBar: Record<number, EqLevel[]> = {};
        for (const lvl of this._levels) {
            if (lvl.swept && this._eOptions.hideSwept) continue;
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
        // Production'da hideSwept sunucuda elenir; burada ayni sonuc icin sayimdan da elenir.
        const lvls = this._eOptions.hideSwept ? this._levels.filter(l => !l.swept) : this._levels;
        const active = lvls.filter(l => !l.swept).length;
        const swept = lvls.filter(l => l.swept).length;
        const method = this._eOptions.useAcademicGamma
            ? `gamma x${this._eOptions.gammaToleranceMult.toFixed(2)}`
            : `ATR x${this._eOptions.toleranceMult.toFixed(2)}`;
        const conf = lvls.filter(l => l.confirmStatus === 'confirmed').length;
        const failed = lvls.filter(l => l.confirmStatus === 'failed').length;
        const haText = this._eOptions.confirmCandleType === 'heikin_ashi' ? ', HA' : '';
        const confText = this._eOptions.showConfirmation && (conf > 0 || failed > 0) ? `, ${conf} onayli, ${failed} kirildi` : '';
        let sigText = '';
        if (this._eOptions.showSignals) {
            const tp = this._signals.filter(s => s.result === 'tp').length;
            const sl = this._signals.filter(s => s.result === 'sl').length;
            const open = this._signals.filter(s => s.result === 'open').length;
            sigText = ` | Sinyal: ${this._signals.length} (TP ${tp}, SL ${sl}, acik ${open})`;
        }
        return `EQH/EQL V2: ${active} aktif, ${swept} supurulmus${confText} (${method}${haText})${sigText}`;
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        if (this._levels.length === 0 || this._sourceData.length === 0) return;

        const lastBar = this._sourceData.length - 1;
        ctx.save();
        for (const lvl of this._levels) {
            if (lvl.touches < 2) continue;
            if (lvl.swept && this._eOptions.hideSwept) continue;
            if (lvl.confirmStatus === 'failed' && this._eOptions.hideUnconfirmed) continue;

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

            const showConf = this._eOptions.showConfirmation;
            if (showConf && lvl.confirmStatus === 'confirmed' && lvl.confirmBar !== null) {
                // Ters yonde onay: EQH -> asagi, EQL -> yukari bakan kucuk ucgen (seviyenin disinda, uca dogru).
                const cx = timeScale.indexToCoordinate(lvl.confirmBar as any) * hpr;
                const w = 4.5 * hpr;
                const h = 6 * hpr;
                const gap = 3 * hpr;
                const down = lvl.type === 'high';
                const baseY = down ? y - gap - h : y + gap + h;
                const tipY = down ? y - gap : y + gap;
                ctx.fillStyle = rgbaFrom(this._eOptions.confirmColor, 0.95);
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(cx - w, baseY);
                ctx.lineTo(cx + w, baseY);
                ctx.lineTo(cx, tipY);
                ctx.closePath();
                ctx.fill();
            }

            if (this._eOptions.showLabels) {
                let suffix = lvl.swept ? ' (supuruldu)' : '';
                if (showConf && lvl.swept) {
                    if (lvl.confirmStatus === 'confirmed') suffix = ' (süpürüldü ✓)';
                    else if (lvl.confirmStatus === 'failed') suffix = ' (kırıldı)';
                    else if (lvl.confirmStatus === 'pending') suffix = ' (bekliyor)';
                }
                const label = `${lvl.type === 'high' ? 'EQH' : 'EQL'}${lvl.touches > 2 ? ' x' + lvl.touches : ''}${suffix}`;
                ctx.font = `${10 * hpr}px sans-serif`;
                ctx.textAlign = 'left';
                const stateLabel = showConf && lvl.swept && lvl.confirmStatus !== null;
                if (stateLabel) {
                    // Onay durumu etiketi: tam opaklikta metin + tema uyumlu yari saydam zemin; cizgi sweptOpacity'de kalir.
                    // Onaylida ucgenin sagina, cizginin disina (EQH ustte, EQL altta) yerlestirilir.
                    let lx = x2 + 4 * hpr;
                    if (lvl.confirmStatus === 'confirmed' && lvl.confirmBar !== null) {
                        const cx = timeScale.indexToCoordinate(lvl.confirmBar as any) * hpr;
                        lx = Math.max(lx, cx + 4.5 * hpr + 4 * hpr);
                    }
                    const above = lvl.type === 'high';
                    const tw = ctx.measureText(label).width;
                    const th = 12 * hpr;
                    const padX = 4 * hpr;
                    const ly = above ? y - 4 * hpr - th : y + 4 * hpr;
                    const isDark = (this as any).isDark === true;
                    ctx.fillStyle = isDark ? 'rgba(19, 23, 34, 0.85)' : 'rgba(255, 255, 255, 0.85)';
                    ctx.beginPath();
                    const rr = 3 * hpr;
                    const rx = lx - padX, rw = tw + 2 * padX;
                    ctx.moveTo(rx + rr, ly);
                    ctx.arcTo(rx + rw, ly, rx + rw, ly + th, rr);
                    ctx.arcTo(rx + rw, ly + th, rx, ly + th, rr);
                    ctx.arcTo(rx, ly + th, rx, ly, rr);
                    ctx.arcTo(rx, ly, rx + rw, ly, rr);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = rgbaFrom(color, 1);
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, lx, ly + th / 2);
                } else {
                    ctx.fillStyle = rgbaFrom(color, Math.min(1, alpha + 0.15));
                    ctx.textBaseline = lvl.type === 'high' ? 'bottom' : 'top';
                    ctx.fillText(label, x2 + 4 * hpr, y);
                }
            }
        }
        if (this._eOptions.showSignals) this._drawSignals(ctx, timeScale, priceScale, hpr, vpr, lastBar);
        ctx.restore();
    }

    private _drawSignals(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number, lastBar: number): void {
        const o = this._eOptions;
        const bars = this._sourceData;

        if (o.showEma35) {
            const series: [number[], string][] = [[this._ema3, o.ema3Color], [this._ema5, o.ema5Color]];
            if (o.sigEmaMode !== 'ema35') series.push([this._ema8, o.ema8Color]);
            const cw = ctx.canvas.width;
            for (const [arr, col] of series) {
                ctx.strokeStyle = col;
                ctx.lineWidth = 1 * hpr;
                ctx.setLineDash([]);
                ctx.beginPath();
                let started = false;
                for (let i = 0; i < arr.length; i++) {
                    const v = arr[i];
                    if (isNaN(v)) { started = false; continue; }
                    const x = timeScale.indexToCoordinate(i as any) * hpr;
                    if (x < -20 * hpr || x > cw + 20 * hpr) { started = false; continue; }
                    const y = priceScale.priceToCoordinate(v) * vpr;
                    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        }

        for (const sg of this._signals) {
            const long = sg.dir === 1;
            const color = long ? o.sigLongColor : o.sigShortColor;
            const x = timeScale.indexToCoordinate(sg.bar as any) * hpr;

            if (o.showSigLevels) {
                const endBar = sg.exitBar !== null ? sg.exitBar : Math.min(sg.bar + 20, lastBar);
                const x2 = timeScale.indexToCoordinate(endBar as any) * hpr;
                const lines: [number, string, number[]][] = [
                    [sg.entry, 'rgba(150, 150, 150, 0.9)', [4 * hpr, 3 * hpr]],
                    [sg.sl, 'rgba(239, 83, 80, 0.9)', []],
                    [sg.tp, 'rgba(38, 166, 154, 0.9)', []],
                ];
                ctx.lineWidth = 1 * hpr;
                for (const [price, col, dash] of lines) {
                    const y = priceScale.priceToCoordinate(price) * vpr;
                    ctx.strokeStyle = col;
                    ctx.setLineDash(dash);
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x2, y);
                    ctx.stroke();
                }
                ctx.setLineDash([]);
                const tag = sg.result === 'tp' ? 'TP' : sg.result === 'sl' ? 'SL' : 'acik';
                const tagPrice = sg.result === 'sl' ? sg.sl : sg.result === 'tp' ? sg.tp : sg.entry;
                ctx.font = `${8 * hpr}px sans-serif`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = sg.result === 'sl' ? 'rgba(239, 83, 80, 1)' : sg.result === 'tp' ? 'rgba(38, 166, 154, 1)' : 'rgba(150, 150, 150, 1)';
                ctx.fillText(tag, x2 + 3 * hpr, priceScale.priceToCoordinate(tagPrice) * vpr);
            }

            // Etiket giris (kapanis) seviyesinde, mumun sagina cizilir: giris cizgisi gorunuyorsa etiket de gorunur
            const entryY = priceScale.priceToCoordinate(sg.entry) * vpr;
            const text = `${long ? 'AL' : 'SAT'} ${sg.score}/4${sg.emaAligned ? ' \u2713EMA' : ' \u2717EMA'}`;
            ctx.font = `bold ${9 * hpr}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const tw = ctx.measureText(text).width;
            const padX = 4 * hpr, th = 13 * hpr, ph = 5 * hpr, rr = 3 * hpr;
            const rw = tw + 2 * padX;
            const rx = x + ph + 6 * hpr;
            const ry = entryY - th / 2;
            ctx.fillStyle = color;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(rx + rr, ry);
            ctx.arcTo(rx + rw, ry, rx + rw, ry + th, rr);
            ctx.arcTo(rx + rw, ry + th, rx, ry + th, rr);
            ctx.arcTo(rx, ry + th, rx, ry, rr);
            ctx.arcTo(rx, ry, rx + rw, ry, rr);
            ctx.closePath();
            ctx.fill();
            // Mume dogru (sola) bakan isaretci
            ctx.beginPath();
            ctx.moveTo(rx, entryY - 4 * hpr);
            ctx.lineTo(rx, entryY + 4 * hpr);
            ctx.lineTo(rx - ph, entryY);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillText(text, rx + rw / 2, ry + th / 2);
        }
    }
}

globalThis.__draftIndicatorClass = EqHLIndicatorV2;
