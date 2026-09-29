import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';

export interface SpecialForcesIndicatorOptions extends IndicatorOptions {
    symbol: string;
    exchange: string;
    pivotLeft: number;
    pivotRight: number;
    numOfLine: number;
    tolerance: number;
    resistanceColor: string;
    supportColor: string;
    // Bobbin (Arz-Talep Bölgesi) - spetial.txt showbobbin bloğu
    showBobbin: boolean;
    bobbinMult: number;
    bobbinMaxActive: number;
    bobbinRightExtend: number;
    bobbinColor: string;
    // Engulf (Arz-Talep Bölgesi) - spetial.txt showengulf bloğu
    showEngulf: boolean;
    engulfRightExtend: number;
    engulfColor: string;
}

const defaultOptions: Partial<SpecialForcesIndicatorOptions> = {
    name: 'Special Forces',
    style: IndicatorStyle.Line,
    symbol: 'BTCUSDT',
    exchange: 'BINANCE',
    pivotLeft: 20,
    pivotRight: 15,
    numOfLine: 10,
    tolerance: 0.01,
    resistanceColor: '#FF5252',
    supportColor: '#00FFEF',
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

// special_forces.py TIMEFRAME_CONFIG ile birebir aynı: [higher_tf_1, higher_tf_2, mult_1, mult_2].
// mult'lar TV_CHART_BARS ile birlikte HTF veri miktarını (effective_htf_bars) belirlemek için kullanılır.
const TIMEFRAME_CONFIG: Record<string, [string, string, number, number]> = {
    '1m': ['15m', '15m', 15, 15],
    '3m': ['30m', '30m', 10, 10],
    '5m': ['1h', '1h', 12, 12],
    '15m': ['2h', '4h', 8, 16],
    '30m': ['2h', '4h', 4, 8],
    '1h': ['4h', '1d', 4, 24],
    '2h': ['4h', '1d', 2, 12],
    '4h': ['1d', '3d', 6, 18],
    '12h': ['1d', '3d', 2, 6],
    '1d': ['3d', '3d', 3, 3],
    '1w': ['1w', '1w', 2, 2],
    '1M': ['1M', '1M', 2, 2],
};

// special_forces.py PERIOD_FILTER_MS ile birebir aynı: ana grafik timeframe'ine göre
// eski pivotları filtreleyen zaman eşiği (ms).
const PERIOD_FILTER_MS: Record<string, number> = {
    '15m': 4314856211,
    '1h': 17276457450,
    '4h': 69116504788,
};

const TV_CHART_BARS = 15000;

interface HABar {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

export interface SRBox {
    top: number;
    bottom: number;
    mid: number;
    type: 'support' | 'resistance';
    date: number; // ms epoch, pivota ait ana grafik zaman damgası (en yakın bar)
    sourceTf: string;
}

export interface SpecialForcesBar {
    time: number; // epoch ms
    open: number;
    high: number;
    low: number;
    close: number;
}

export type SpecialForcesKlinesProvider = (
    symbol: string,
    exchange: string,
    interval: string,
    limit: number
) => Promise<SpecialForcesBar[]>;

export class SpecialForcesIndicator extends OverlayIndicator {
    /**
     * Set once by the host page (demo-ts.html) so this indicator can fetch
     * higher-timeframe candles through the same multi-exchange data fetcher
     * the chart itself uses (Binance/Bybit/OKX/OANDA+brokers), instead of
     * always hitting Binance Futures directly.
     */
    static defaultKlinesProvider: SpecialForcesKlinesProvider | null = null;

    private _sfOptions: SpecialForcesIndicatorOptions;
    private _boxes: SRBox[] = [];
    private _bobbinBoxes: BobbinBox[] = [];
    private _engulfBoxes: EngulfBox[] = [];
    private _fetchToken = 0;
    private _ctxTimeframe = '';
    // Devam eden / son biten HTF hesabinin anahtari (symbol|exchange|tf).
    private _inFlightKey: string | null = null;
    private _lastDoneKey = '';
    private _lastDoneAt = 0;
    private _debounceTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(options: Partial<SpecialForcesIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultOptions, ...options };
        super(mergedOptions);
        this._sfOptions = { ...defaultOptions, ...this._options } as SpecialForcesIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._sfOptions };
    }

    get boxes(): SRBox[] {
        return this._boxes;
    }

    /**
     * chart-widget her veri guncellemesinden once cagirir. Sembol/borsa
     * olusturma aninda sabitlenirse (ya da kayittan geri yuklenirse) grafik
     * baska bir sembole gecince eski sembolun HTF verisiyle kutu cizilirdi.
     */
    setContext(ctx: { symbol: string; timeframe: string; exchange?: string }): void {
        this._ctxTimeframe = ctx.timeframe;
        const exchange = ctx.exchange || this._sfOptions.exchange;
        if (ctx.symbol === this._sfOptions.symbol && exchange === this._sfOptions.exchange) return;
        this._sfOptions.symbol = ctx.symbol;
        this._sfOptions.exchange = exchange;
        (this._options as any).symbol = ctx.symbol;
        (this._options as any).exchange = exchange;
        this._boxes = [];
        this._bobbinBoxes = [];
        this._engulfBoxes = [];
        this._lastDoneKey = '';
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        if (sourceData.length === 0) {
            return;
        }

        // Bobbin/Engulf, S/R'ın aksine HTF fetch gerektirmiyor - sadece ana
        // grafiğin kendi OHLC verisi üzerinde senkron çalışıyorlar, bu yüzden
        // debounce/async zincire ihtiyaç yok, her calculate() çağrısında
        // doğrudan yeniden hesaplanabilirler.
        this._bobbinBoxes = this._sfOptions.showBobbin
            ? computeBobbinBoxes(sourceData, this._sfOptions.bobbinMult, this._sfOptions.bobbinMaxActive, this._sfOptions.bobbinRightExtend)
            : [];
        this._engulfBoxes = this._sfOptions.showEngulf
            ? computeEngulfBoxes(sourceData, this._sfOptions.engulfRightExtend)
            : [];

        // calculate() canlı mum güncellemeleri (WebSocket tick'leri) her fullUpdate()'te
        // tekrar tetiklenebiliyor. Her tetiklemede HTF fetch zinciri başlatmak hem
        // gereksiz API yükü hem de yarım kalan (iptal edilen) zincirlerin eksik
        // kutu seti üretmesine yol açıyor - bu yüzden debounce edilir.
        if (this._debounceTimer !== null) {
            clearTimeout(this._debounceTimer);
        }
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = null;
            // Canli tick'ler ~her saniye calculate() tetikler; HTF veri cekmek bundan
            // uzun surdugu icin her tick hesabi bastan baslatip oncekini iptal
            // ediyordu ve kutular HIC olusmuyordu (sayfa yenilenince / sembol
            // degisince). Ayni sembol+borsa+zaman diliminde hesap surerken ya da
            // yeni bittiyse tekrar baslatma; baglam degisirse yenisi eskisini iptal eder.
            const key = `${this._sfOptions.symbol}|${this._sfOptions.exchange}|${this._currentTimeframeGuess(this._sourceData)}`;
            if (this._inFlightKey === key) return;
            if (this._lastDoneKey === key && Date.now() - this._lastDoneAt < 30_000) return;
            void this._recompute(this._sourceData, key);
        }, 500);
    }

    getRange(): IndicatorRange {
        let min = Infinity;
        let max = -Infinity;
        for (const box of this._boxes) {
            min = Math.min(min, box.bottom);
            max = Math.max(max, box.top);
        }
        for (const box of this._bobbinBoxes) {
            min = Math.min(min, box.bottom);
            max = Math.max(max, box.top);
        }
        for (const box of this._engulfBoxes) {
            min = Math.min(min, box.bottom);
            max = Math.max(max, box.top);
        }
        if (min === Infinity || max === -Infinity) {
            return { min: 0, max: 100 };
        }
        return { min, max };
    }

    getDescription(): string {
        return `Special Forces S/R (${this._boxes.length}) Bobbin (${this._bobbinBoxes.length}) Engulf (${this._engulfBoxes.length})`;
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
        const hasAnything = this._boxes.length > 0 || this._bobbinBoxes.length > 0 || this._engulfBoxes.length > 0;
        if (!hasAnything) {
            return;
        }

        const lastIndex = this._sourceData.length - 1;
        const x2 = timeScale.indexToCoordinate(lastIndex) * hpr;

        ctx.save();

        // Pine Script'te getLine() sadece `mid` fiyatından geçen tek bir çizgi çizer
        // (line.new(..., mid, ..., mid, ...)) - top/bottom yalnızca checkLines()
        // çakışma kontrolü için dahili olarak kullanılır, hiç görsel kutu çizilmez.
        for (const box of this._boxes) {
            const startIndex = this._nearestBarIndex(box.date);
            const clampedStart = Math.max(0, Math.min(lastIndex, startIndex));
            const x1 = timeScale.indexToCoordinate(clampedStart) * hpr;
            if (x2 <= x1) continue;

            const y = priceScale.priceToCoordinate(box.mid) * vpr;
            const strokeColor = box.type === 'resistance' ? this._sfOptions.resistanceColor : this._sfOptions.supportColor;

            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 2 * hpr;
            ctx.beginPath();
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
            ctx.stroke();
        }

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

    private _nearestBarIndex(timeMs: number): number {
        // sourceData zaman sırasına göre artan; en yakın (>=) bar index'ini bul.
        const data = this._sourceData;
        let lo = 0;
        let hi = data.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this._toMs(data[mid].time) < timeMs) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    private _toMs(time: number): number {
        return time > 1e12 ? time : time * 1000;
    }

    private async _recompute(sourceData: BarData[], key: string = ''): Promise<void> {
        const token = ++this._fetchToken;
        this._inFlightKey = key;
        const mainTf = this._currentTimeframeGuess(sourceData);
        const config = TIMEFRAME_CONFIG[mainTf];
        if (!config) {
            this._inFlightKey = null;
            return;
        }
        const [tf1, tf2, mult1, mult2] = config;
        const cutoffMs = this._cutoffTime(mainTf);

        try {
            const boxes1 = await this._computeBoxesForTimeframe(tf1, mult1, cutoffMs);
            if (token !== this._fetchToken) return;

            // _computeBoxesForTimeframe, existingBoxes'ı zaten kendi dönüş değerine
            // dahil ediyor (special_forces.py'deki gibi tf1 sonuçları üzerine tf2
            // kutuları eklenir) - bu yüzden burada tekrar concat etmiyoruz.
            let allBoxes = boxes1;
            if (tf2 !== tf1) {
                allBoxes = await this._computeBoxesForTimeframe(tf2, mult2, cutoffMs, boxes1);
                if (token !== this._fetchToken) return;
            }

            const currentPrice = sourceData[sourceData.length - 1].close;
            this._boxes = this._selectNearestLevels(allBoxes, currentPrice);
            this._lastDoneKey = key;
            this._lastDoneAt = Date.now();
            this._dataChanged.fire();
        } catch (error) {
            console.warn('SpecialForcesIndicator: HTF veri çekilemedi', error);
        } finally {
            // Iptal edilmis (baska baglama ait) bir calisma yenisinin durumunu ezmesin.
            if (token === this._fetchToken) this._inFlightKey = null;
        }
    }

    // spetial.txt barstate.islast bloğu (satır 592-731) ile BİREBİR aynı olacak
    // şekilde satır satır çevrildi. `boxes` burada Pine'daki hem `data` (mid
    // fiyat listesi, pivot oluşum sırasında unshift edilir) hem de dolaylı
    // olarak `lines` yerine geçiyor -- kutunun kendisi zaten hem veri hem
    // "çizgi" referansı. `checkData` Pine'da `data`'nın SIRALANMIŞ bir kopyası
    // (array.sort) ve NOT deduplike edilmiş -- tolerans zaten checkOverlap'te
    // pivot ekleme anında uygulanıyor, burada tekrar filtrelemek Pine'da
    // olmayan bir adım eklemek olurdu, bu yüzden kaldırıldı.
    private _selectNearestLevels(boxes: SRBox[], currentPrice: number): SRBox[] {
        if (boxes.length === 0) return [];

        // checkData = sort(data) -- satır 594. `boxes` zaten Pine'daki `data`
        // (pivot oluşum sırası, en yeni önce, _computeBoxesForTimeframe'de
        // unshift ile dolduruluyor) ile aynı rolü görüyor, ayrıca tutmaya
        // gerek yok.
        const checkData = [...boxes].sort((a, b) => a.mid - b.mid);

        // point == 0 varsayılan (satır 592), sadece i>0 durumunda ve
        // checkData[i-1] < close < checkData[i] koşulunda güncellenir (satır 597-601).
        let point = 0;
        let found = false;
        for (let i = 1; i < checkData.length; i++) {
            if (checkData[i - 1].mid < currentPrice && currentPrice < checkData[i].mid) {
                point = i;
                found = true; // Pine'da break ile çıkılıyor ama "found" flag'i yok;
                break;        // point==0 kalması ile point==0'da bulunması ayrımı biz ekledik.
            }
        }

        const half = this._sfOptions.numOfLine / 2; // Pine'da numOfLine/2, int değil (satır 605, 615...)
        const resultBoxes: SRBox[] = [];
        const resultTypes = new Map<SRBox, 'support' | 'resistance'>();
        const dts: SRBox[] = []; // Pine'daki dts array'i

        if (!found) {
            // point == 0 dalı (satır 602-613): checkData baştan taranır, sadece
            // (checkData.length - x) <= half+1 olan (yani sondan half+1 tanesi)
            // kutular işlenir. Renk d<close ise support, d>close ise resistance.
            for (let x = 0; x < checkData.length; x++) {
                const y = checkData[x];
                if (checkData.length - x <= half + 1) {
                    if (y.mid < currentPrice) {
                        resultTypes.set(y, 'support');
                        resultBoxes.push(y);
                    }
                    if (y.mid > currentPrice) {
                        resultTypes.set(y, 'resistance');
                        resultBoxes.push(y);
                    }
                }
            }
        } else {
            // found dalı (satır 614-728).
            // Direnç tarafı (satır 615-634): üstteki `half` seviye.
            if (checkData.length - point > half - 1) {
                if (checkData.length >= point + half) {
                    for (let i = 0; i <= half - 1; i++) {
                        const box = checkData[point + i];
                        if (box === undefined) continue;
                        dts.push(box);
                        resultTypes.set(box, 'resistance');
                        resultBoxes.push(box);
                    }
                }
                // Pine'da bu dış if'in bir else'i yok: length >= point+half değilse
                // hiçbir direnç eklenmiyor (satır 616-634 sadece bu koşulda çalışıyor).
            } else {
                // else dalı (satır 635-653): checkData.length - point kadarını al.
                const count = checkData.length - point;
                for (let i = 0; i < count; i++) {
                    const box = checkData[point + i];
                    if (box === undefined) continue;
                    dts.push(box);
                    resultTypes.set(box, 'resistance');
                    resultBoxes.push(box);
                }
            }

            // Destek tarafı (satır 666-704).
            if (point - half > 0) {
                // satır 667: for i = 1 to half (point dahil değil).
                for (let i = 1; i <= half; i++) {
                    const box = checkData[point - i];
                    if (box === undefined) continue;
                    dts.push(box);
                    resultTypes.set(box, 'support');
                    resultBoxes.push(box);
                }
            } else {
                // satır 687: for i = 0 to point (point dahil), ayrıca d<close şartı.
                for (let i = 0; i <= point; i++) {
                    const box = checkData[point - i];
                    if (box === undefined) continue;
                    if (box.mid < currentPrice) {
                        dts.push(box);
                        resultTypes.set(box, 'support');
                        resultBoxes.push(box);
                    }
                }
            }
        }

        // Pine'ın dts filtresi (satır 654-663, 708-728): sadece dts içinde
        // bulunanlar "extend.right" (yani görünür) kalıyor, diğerleri
        // "extend.none" (kaybolur) -- resultBoxes zaten yalnızca işlenen/dts'e
        // eklenen kutuları içeriyor, ayrı bir filtreleme adımına gerek yok.
        return resultBoxes.map((box) => ({ ...box, type: resultTypes.get(box)! }));
    }

    private _cutoffTime(mainTf: string): number | null {
        const filterMs = PERIOD_FILTER_MS[mainTf];
        if (filterMs === undefined) return null;
        return Date.now() - filterMs;
    }

    private _currentTimeframeGuess(sourceData: BarData[]): string {
        // Gercek zaman dilimi biliniyorsa onu kullan: son iki mumun araligı
        // COMEX'in kapali saatlerinde/hafta sonunda yanlis (2h, 1d...) cikiyor.
        if (this._ctxTimeframe && TIMEFRAME_CONFIG[this._ctxTimeframe]) return this._ctxTimeframe;
        if (sourceData.length < 2) return '15m';
        const deltaMs = this._toMs(sourceData[sourceData.length - 1].time) - this._toMs(sourceData[sourceData.length - 2].time);
        const minutes = Math.round(deltaMs / 60000);
        const map: Record<number, string> = {
            1: '1m', 3: '3m', 5: '5m', 15: '15m', 30: '30m',
            60: '1h', 120: '2h', 240: '4h', 720: '12h', 1440: '1d',
        };
        return map[minutes] || '15m';
    }

    // Delegates to the host page's own multi-exchange data fetcher (fetchData
    // in demo-ts.html, which already knows Binance/Bybit/OKX/OANDA+brokers)
    // instead of hitting Binance Futures directly. The original hard-coded
    // fapi.binance.com URL silently failed for any non-Binance symbol (e.g.
    // XAUUSD via OANDA/FXCM) since Binance Futures has no such symbol, so no
    // S/R boxes were ever computed for forex/commodity charts. Pagination for
    // limits above what a single request returns is the provider's own
    // responsibility (demo-ts.html's fetchBinanceData already paginates).
    private async _fetchKlines(interval: string, limit: number): Promise<HABar[]> {
        if (!SpecialForcesIndicator.defaultKlinesProvider) {
            throw new Error(
                'SpecialForcesIndicator.defaultKlinesProvider was not set. The host page must set it ' +
                '(e.g. LightweightCharts.SpecialForcesIndicator.defaultKlinesProvider = fetchKlines) before adding this indicator.'
            );
        }
        const bars = await SpecialForcesIndicator.defaultKlinesProvider(
            this._sfOptions.symbol, this._sfOptions.exchange, interval, limit
        );
        return bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }));
    }

    private _heikinAshi(bars: HABar[]): HABar[] {
        if (bars.length === 0) return [];
        const ha: HABar[] = [];
        let prevOpen = (bars[0].open + bars[0].close) / 2;
        let prevClose = (bars[0].open + bars[0].high + bars[0].low + bars[0].close) / 4;
        ha.push({ time: bars[0].time, open: prevOpen, high: bars[0].high, low: bars[0].low, close: prevClose });

        for (let i = 1; i < bars.length; i++) {
            const bar = bars[i];
            const close = (bar.open + bar.high + bar.low + bar.close) / 4;
            const open = (prevOpen + prevClose) / 2;
            const high = Math.max(bar.high, open, close);
            const low = Math.min(bar.low, open, close);
            ha.push({ time: bar.time, open, high, low, close });
            prevOpen = open;
            prevClose = close;
        }
        return ha;
    }

    // Pine ta.pivothigh/pivotlow eşdeğeri: >=/<= (special_forces.py ile aynı, stepped
    // HTF verisinde tekrarlı değerler için eşitliğe izin verir).
    private _pivotIndices(closes: number[], left: number, right: number, mode: 'high' | 'low'): number[] {
        const result: number[] = [];
        const window = left + right + 1;
        if (closes.length <= window) return result;

        for (let i = left; i < closes.length - right; i++) {
            const val = closes[i];
            let ok = true;
            for (let j = i - left; j <= i + right; j++) {
                if (j === i) continue;
                if (mode === 'high' ? closes[j] > val : closes[j] < val) {
                    ok = false;
                    break;
                }
            }
            if (ok) result.push(i);
        }
        return result;
    }

    private _checkOverlap(top: number, bottom: number, boxes: SRBox[], tolerance: number): boolean {
        for (const box of boxes) {
            const bAdj = box.bottom - box.bottom * tolerance;
            const tAdj = box.top + box.top * tolerance;
            if ((top > bAdj && top < tAdj) || (bottom < tAdj && bottom > bAdj)) {
                return false;
            }
        }
        return true;
    }

    private async _computeBoxesForTimeframe(
        higherTf: string,
        mult: number,
        cutoffMs: number | null,
        existingBoxes: SRBox[] = []
    ): Promise<SRBox[]> {
        // special_forces.py _process_timeframe ile birebir aynı limit hesabı:
        // effective_htf_bars = TV_CHART_BARS // mult, + pivot left/right + 50, min 200.
        const effectiveHtfBars = Math.floor(TV_CHART_BARS / mult);
        const limit = Math.max(effectiveHtfBars + this._sfOptions.pivotLeft + this._sfOptions.pivotRight + 50, 200);

        const raw = await this._fetchKlines(higherTf, limit);
        const ha = this._heikinAshi(raw);
        const closes = ha.map((b) => b.close);

        const phIdx = this._pivotIndices(closes, this._sfOptions.pivotLeft, this._sfOptions.pivotRight, 'high');
        const plIdx = this._pivotIndices(closes, this._sfOptions.pivotLeft, this._sfOptions.pivotRight, 'low');

        const allIdx = Array.from(new Set([...phIdx, ...plIdx])).sort((a, b) => a - b);
        const phSet = new Set(phIdx);
        const plSet = new Set(plIdx);

        const boxes: SRBox[] = [...existingBoxes];

        for (const idx of allIdx) {
            const bar = ha[idx];
            if (cutoffMs !== null && bar.time < cutoffMs) {
                continue;
            }

            if (phSet.has(idx)) {
                const diff = bar.high - bar.close;
                const top = bar.close + diff * 0.8;
                const bottom = bar.close + diff * 0.2;
                if (this._checkOverlap(top, bottom, boxes, this._sfOptions.tolerance)) {
                    boxes.unshift({
                        top, bottom, mid: bar.close + diff * 0.5,
                        type: 'resistance', date: bar.time, sourceTf: higherTf,
                    });
                }
            }
            if (plSet.has(idx)) {
                const diff = bar.close - bar.low;
                const top = bar.close - diff * 0.2;
                const bottom = bar.close - diff * 0.8;
                if (this._checkOverlap(top, bottom, boxes, this._sfOptions.tolerance)) {
                    boxes.unshift({
                        top, bottom, mid: bar.close - diff * 0.5,
                        type: 'support', date: bar.time, sourceTf: higherTf,
                    });
                }
            }
        }

        return boxes;
    }
}
