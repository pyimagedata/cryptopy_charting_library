// Bobbin tespiti.
//
// Dizi   : >=minRun mum, gövde rengi ardisik degisen maksimal dizi bulunur.
//          Sonra dizinin KENDISI degil, IÇINDEKI EN IYI BITISIK ALT-DIZI alinir:
//          >=minRun uzunlugundaki tüm pencereler taranir, yükseklik filtresini
//          geçenler arasindan model skoru en yüksek olan seçilir.
//          Bir dizi -> en fazla bir bobin.
// Bölge  : seçilen pencerenin gövde en üstü / en alti (fitil yok).
// Ön ele.: yükseklik <= maxHeightAtr * ATR(14). Skorun kalibre edildigi alan bu -
//          esigin üstünde model dogrulanmadi, oradaki skorlara güvenilmemeli.
//
// Yöntem : Multiple Instance Learning (MIL) - kullanici "bu dizide iyi bir
//          bobin var" dedi ama HANGI alt-pencere oldugunu söylemedi. Standart
//          MI-SVM semantigiyle çözüldü:
//            pozitif dizi -> en az bir alt-pencere pozitif (en yüksek skorlu
//                            olan "witness" seçilir)
//            negatif dizi -> TÜM alt-pencereler negatif, toplam bag agirligi 1'e
//                            normalize edilir (uzun diziler egitimde orantisiz
//                            söz sahibi olmasin diye - pozitif dizininki de
//                            zaten 1, tek witness)
//          Egitim: witness seç -> lojistik regresyon (L2, sklearn) fit et ->
//          yeniden witness seç -> ... 3-4 turda tam sabitleniyor.
//
// Skor   : 450 elle etiketlenmis dizi (236 iyi / 214 kötü) üzerinde, nested
//          cross-validation ile (dis katman: 5 orijinal etiketleme partisi, iç
//          katman: L2 ceza gücü C'nin egitim verisi disinda hiçbir seye
//          bakmadan seçimi) fit edilen model. ÜÇ özellik - hepsi olusum aninda
//          bilinir, ileriye bakan girdi yok, bobin pencerenin son mumunda
//          kesinlesir:
//            uCv       = 1 - (gövdelerin standart sapmasi / ortalamasi)
//                        "tekdüzelik" - bütün gövdeler birbirine yakin boyda mi
//            bandMx    = bölge yüksekligi / en büyük gövde
//            heightAtr = bölge yüksekligi / ATR(14)
//          Nested CV AUC = 0.887 (fold'lar: .870 .878 .884 .893 .912).
//          Esik 0.60'ta isabet %81 yakalama %80; 0.70'te %84 / %73.
//
// Bootstrap notu (1000 tekrar, bag-düzeyinde yerine koyarak örnekleme): uCv,
// bandMx, heightAtr katsayilarinin %90 araligi hiçbir zaman sifiri kapsamiyor
// (isaret degisimi %0) - saglam. Dördüncü özellik olan 'drift' (sarmal
// kaymasi) %90 araligi [-0.667, +0.110] ile SIFIRI KAPSIYOR, %12 örneklemede
// isareti degisiyor - istatistiksel olarak katkisiz. Çikarilinca nested CV
// 0.888 -> 0.887 (fark yok), fold varyansi hafif azaldi. Parsimoni için
// modelden alindi.
//
// 'n' (mum sayisi) daha önce çikarilmisti: pozitif witness'lerin %100'ü n=4
// çikiyordu ama negatif dizilerin en iyi penceresi de ayni sekilde n=4'e
// yigiliyordu - argmax aramasinin yapisal egilimiydi, ayirt edici sinyal degil.
//
// Daha önce denenip elenenler:
//   - ayrilis süresi : güçlüydü ama ileriye bakiyordu, tespit için kullanilamaz
//   - gövde örtüsmesi: CV katkisi +0.002, gürültü içinde
//   - fitil/gövde, hacim, son gövde/en büyük: hiçbir partide sinyal vermedi
//
// Model XAUUSD 1h üzerinde kalibre edildi. Baska sembol/timeframe'de yeniden fit.

interface BobbinOptions {
    name: string;
    minRun: number;
    maxHeightAtr: number;
    scoreThreshold: number;
    rightExtend: number;
    showScore: boolean;
    bobbinColor: string;
    boxOpacity: number;
    visible: boolean;
}

const defaultBobbinOptions: BobbinOptions = {
    name: 'Bobbin',
    minRun: 4,
    maxHeightAtr: 1.5,
    scoreThreshold: 0.6,
    rightExtend: 60,
    showScore: false,
    bobbinColor: '#2962ff',
    boxOpacity: 20,
    visible: true,
};

// --- MIL + nested CV ile fit edilmis lojistik model (standartlastirilmis girdiler) ---
const SC_MEAN_UCV = 0.3526, SC_SD_UCV = 0.2277, SC_W_UCV = 1.7994;
const SC_MEAN_BANDMX = 1.1791, SC_SD_BANDMX = 0.2430, SC_W_BANDMX = -1.1810;
const SC_MEAN_HEIGHT = 0.9007, SC_SD_HEIGHT = 0.3191, SC_W_HEIGHT = -0.9361;
const SC_BIAS = -0.6138;

interface Bobbin {
    left: number;
    formIdx: number;
    right: number;
    top: number;
    bottom: number;
    n: number;
    uCv: number;
    bandMx: number;
    heightAtr: number;
    score: number;
}

function bodyColor(b: BarData): number {
    if (b.close > b.open) return 1;
    if (b.close < b.open) return -1;
    return 0;
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

function findRuns(bars: BarData[], minRun: number): Array<[number, number]> {
    const runs: Array<[number, number]> = [];
    let i = 0;
    while (i < bars.length) {
        if (bodyColor(bars[i]) === 0) { i++; continue; }
        let j = i;
        while (j + 1 < bars.length) {
            const nxt = bodyColor(bars[j + 1]);
            if (nxt === 0 || nxt === bodyColor(bars[j])) break;
            j++;
        }
        if (j - i + 1 >= minRun) runs.push([i, j]);
        i = j + 1;
    }
    return runs;
}

/** Tek bir bitisik pencerenin özellikleri + skoru. Filtreye takilirsa null. */
function evalWindow(bars: BarData[], atr: (number | null)[],
                    lo: number, hi: number, maxHeightAtr: number): Bobbin | null {
    const a = atr[hi];
    if (a === null || a <= 0) return null;

    const n = hi - lo + 1;
    let top = -Infinity, bottom = Infinity, mxBody = 0, sumBody = 0;
    const bodies: number[] = [];
    for (let k = lo; k <= hi; k++) {
        const t = Math.max(bars[k].open, bars[k].close);
        const b = Math.min(bars[k].open, bars[k].close);
        const body = t - b;
        bodies.push(body);
        if (t > top) top = t;
        if (b < bottom) bottom = b;
        if (body > mxBody) mxBody = body;
        sumBody += body;
    }
    const height = top - bottom;
    if (height <= 0 || mxBody <= 0 || sumBody <= 0) return null;

    const heightAtr = height / a;
    if (heightAtr > maxHeightAtr) return null;

    // tekdüzelik: 1 - degisim katsayisi (populasyon std / ortalama)
    const meanBody = sumBody / n;
    let varSum = 0;
    for (let k = 0; k < n; k++) {
        const d = bodies[k] - meanBody;
        varSum += d * d;
    }
    const uCv = 1 - Math.sqrt(varSum / n) / meanBody;

    const bandMx = height / mxBody;

    const z = SC_BIAS
        + SC_W_UCV * ((uCv - SC_MEAN_UCV) / SC_SD_UCV)
        + SC_W_BANDMX * ((bandMx - SC_MEAN_BANDMX) / SC_SD_BANDMX)
        + SC_W_HEIGHT * ((heightAtr - SC_MEAN_HEIGHT) / SC_SD_HEIGHT);

    return {
        left: lo, formIdx: hi, right: hi,
        top: top, bottom: bottom, n: n,
        uCv: uCv, bandMx: bandMx, heightAtr: heightAtr,
        score: 1 / (1 + Math.exp(-z)),
    };
}

function computeBobbins(bars: BarData[], o: BobbinOptions): Bobbin[] {
    const atr = wilderAtr(bars, 14);
    const runs = findRuns(bars, o.minRun);
    const out: Bobbin[] = [];

    for (let ri = 0; ri < runs.length; ri++) {
        const rlo = runs[ri][0];
        const rhi = runs[ri][1];

        // MIL witness seçimi: dizideki en yüksek skorlu alt-pencere
        let best: Bobbin | null = null;
        for (let a = rlo; a <= rhi - o.minRun + 1; a++) {
            for (let b = a + o.minRun - 1; b <= rhi; b++) {
                const w = evalWindow(bars, atr, a, b, o.maxHeightAtr);
                if (w && (best === null || w.score > best.score)) best = w;
            }
        }
        if (best === null || best.score < o.scoreThreshold) continue;

        best.right = best.formIdx + o.rightExtend;
        out.push(best);
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

class BobbinIndicator extends OverlayIndicator {
    private _bOptions: BobbinOptions;
    private _bobbins: Bobbin[] = [];

    constructor(options: Partial<BobbinOptions> = {}) {
        const merged = { ...defaultBobbinOptions, ...options };
        super(merged);
        this._bOptions = { ...defaultBobbinOptions, ...this._options } as BobbinOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._bOptions };
    }

    setSettingValue(key: string, value: any): boolean {
        (this._bOptions as any)[key] = value;
        (this._options as any)[key] = value;
        if (this._sourceData.length > 0) this.calculate(this._sourceData);
        this._dataChanged.fire();
        return true;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._data = [];
        if (sourceData.length === 0) { this._bobbins = []; return; }

        this._bobbins = computeBobbins(sourceData, this._bOptions);

        const byForm: Record<number, Bobbin> = {};
        for (let i = 0; i < this._bobbins.length; i++) {
            byForm[this._bobbins[i].formIdx] = this._bobbins[i];
        }
        // values = [score, top, bottom, n, uCv, bandMx, heightAtr]
        this._data = sourceData.map((bar, i) => {
            const b = byForm[i];
            return b
                ? { time: bar.time, value: b.score, values: [b.score, b.top, b.bottom, b.n, b.uCv, b.bandMx, b.heightAtr] }
                : { time: bar.time, value: NaN, values: [] };
        });
    }

    getRange(): { min: number; max: number } {
        if (this._bobbins.length === 0) return { min: 0, max: 100 };
        let min = Infinity, max = -Infinity;
        for (const b of this._bobbins) {
            if (b.bottom < min) min = b.bottom;
            if (b.top > max) max = b.top;
        }
        return { min, max };
    }

    getDescription(): string {
        return `Bobbin: ${this._bobbins.length} tespit (esik ${this._bOptions.scoreThreshold})`;
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        if (this._bobbins.length === 0 || this._sourceData.length === 0) return;

        ctx.save();
        for (const box of this._bobbins) {
            const x1 = timeScale.indexToCoordinate(box.left as any) * hpr;
            const x2 = timeScale.indexToCoordinate(box.right as any) * hpr;
            const yA = priceScale.priceToCoordinate(box.top) * vpr;
            const yB = priceScale.priceToCoordinate(box.bottom) * vpr;

            const left = Math.min(x1, x2);
            const width = Math.max(1, Math.abs(x2 - x1));
            const top = Math.min(yA, yB);
            const height = Math.max(1, Math.abs(yB - yA));

            const t = Math.max(0, Math.min(1, (box.score - this._bOptions.scoreThreshold) /
                Math.max(0.01, 1 - this._bOptions.scoreThreshold)));
            const alpha = (this._bOptions.boxOpacity / 100) * (0.55 + 0.45 * t);

            ctx.fillStyle = rgbaFrom(this._bOptions.bobbinColor, alpha);
            ctx.fillRect(left, top, width, height);
            ctx.strokeStyle = rgbaFrom(this._bOptions.bobbinColor, 0.85);
            ctx.lineWidth = 1 * hpr;
            ctx.strokeRect(left, top, width, height);

            if (this._bOptions.showScore) {
                ctx.fillStyle = rgbaFrom(this._bOptions.bobbinColor, 0.95);
                ctx.font = `${10 * hpr}px sans-serif`;
                ctx.textBaseline = 'bottom';
                ctx.textAlign = 'left';
                ctx.fillText(box.score.toFixed(2), left + 2 * hpr, top - 2 * vpr);
            }
        }
        ctx.restore();
    }
}

globalThis.__draftIndicatorClass = BobbinIndicator;
