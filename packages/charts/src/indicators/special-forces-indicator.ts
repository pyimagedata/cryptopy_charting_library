import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';

/**
 * Special Forces: destek/direnç çizgileri + Bobbin/Engulf kutuları.
 *
 * Bu indikatör HESAP YAPMAZ: seviyeler ve kutular backend'de hesaplanır, host
 * sayfa `defaultLevelsProvider` / `defaultZonesProvider` ile getirir, burada
 * sadece çizilir. Algoritma bilerek tarayıcı paketinde yoktur. Provider
 * set edilmemişse ya da backend veri döndürmezse (sembol/timeframe bilinmiyor)
 * hiçbir şey çizilmez.
 */

export interface SpecialForcesIndicatorOptions extends IndicatorOptions {
    symbol: string;
    exchange: string;
    resistanceColor: string;
    supportColor: string;
    showBobbin: boolean;
    bobbinColor: string;
    showEngulf: boolean;
    engulfColor: string;
}

const defaultOptions: Partial<SpecialForcesIndicatorOptions> = {
    name: 'Special Forces',
    style: IndicatorStyle.Line,
    symbol: 'BTCUSDT',
    exchange: 'BINANCE',
    resistanceColor: '#FF5252',
    supportColor: '#00FFEF',
    showBobbin: true,
    bobbinColor: '#15e715',
    showEngulf: true,
    engulfColor: '#ffeb3b',
};

/** Backend'den gelen destek/direnç seviyesi (tek çizgi `mid` fiyatından geçer). */
export interface SRBox {
    top: number;
    bottom: number;
    mid: number;
    type: 'support' | 'resistance';
    date: number; // ms epoch, seviyenin oluştuğu mum
    sourceTf: string;
}

/** Backend'den gelen Bobbin/Engulf kutusu. */
export interface SpecialForcesZone {
    time: number; // ms epoch, sol kenardaki mum
    bars: number; // sol kenardan sağ kenara mum sayısı (sağdaki boş alana uzar)
    top: number;
    bottom: number;
}

export interface SpecialForcesZones {
    bobbin: SpecialForcesZone[];
    engulf: SpecialForcesZone[];
}

export type SpecialForcesLevelsProvider = (
    symbol: string,
    exchange: string,
    timeframe: string
) => Promise<SRBox[] | null>;

export type SpecialForcesZonesProvider = (
    symbol: string,
    exchange: string,
    timeframe: string
) => Promise<SpecialForcesZones | null>;

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

// Backend önbelleği 30-60 sn; aynı bağlam için bu süreden sık yeniden istenmez.
const REFRESH_MS = 30_000;

export class SpecialForcesIndicator extends OverlayIndicator {
    static defaultLevelsProvider: SpecialForcesLevelsProvider | null = null;
    static defaultZonesProvider: SpecialForcesZonesProvider | null = null;

    private _sfOptions: SpecialForcesIndicatorOptions;
    private _boxes: SRBox[] = [];
    private _bobbinZones: SpecialForcesZone[] = [];
    private _engulfZones: SpecialForcesZone[] = [];
    private _fetchToken = 0;
    private _ctxTimeframe = '';
    // Devam eden / son biten isteğin anahtarı (symbol|exchange|tf).
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
     * chart-widget her veri güncellemesinden önce çağırır. Sembol/borsa
     * oluşturma anında sabitlenirse (ya da kayıttan geri yüklenirse) grafik
     * başka bir sembole geçince eski sembolün seviyeleri çizilirdi.
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
        this._bobbinZones = [];
        this._engulfZones = [];
        this._lastDoneKey = '';
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        if (sourceData.length === 0) {
            return;
        }

        // calculate() canlı mum güncellemeleri (WebSocket tick'leri) her fullUpdate()'te
        // tekrar tetiklenebiliyor; her tetiklemede backend'e istek atmamak için debounce.
        if (this._debounceTimer !== null) {
            clearTimeout(this._debounceTimer);
        }
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = null;
            const key = `${this._sfOptions.symbol}|${this._sfOptions.exchange}|${this._currentTimeframeGuess(this._sourceData)}`;
            if (this._inFlightKey === key) return;
            if (this._lastDoneKey === key && Date.now() - this._lastDoneAt < REFRESH_MS) return;
            void this._refresh(key);
        }, 500);
    }

    getRange(): IndicatorRange {
        let min = Infinity;
        let max = -Infinity;
        for (const box of this._boxes) {
            min = Math.min(min, box.bottom);
            max = Math.max(max, box.top);
        }
        for (const zone of [...this._bobbinZones, ...this._engulfZones]) {
            min = Math.min(min, zone.bottom);
            max = Math.max(max, zone.top);
        }
        if (min === Infinity || max === -Infinity) {
            return { min: 0, max: 100 };
        }
        return { min, max };
    }

    getDescription(): string {
        return `Special Forces S/R (${this._boxes.length}) Bobbin (${this._bobbinZones.length}) Engulf (${this._engulfZones.length})`;
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
        const hasAnything = this._boxes.length > 0 || this._bobbinZones.length > 0 || this._engulfZones.length > 0;
        if (!hasAnything) {
            return;
        }

        const lastIndex = this._sourceData.length - 1;
        const x2 = timeScale.indexToCoordinate(lastIndex) * hpr;

        ctx.save();

        // Destek/direnç: seviyenin `mid` fiyatından geçen tek çizgi.
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

        // Bobbin ve Engulf: dolgulu kutu.
        if (this._sfOptions.showBobbin && this._bobbinZones.length > 0) {
            ctx.fillStyle = withAlpha(this._sfOptions.bobbinColor, 0.32);
            for (const zone of this._bobbinZones) {
                this._fillZone(ctx, timeScale, priceScale, hpr, vpr, zone);
            }
        }

        if (this._sfOptions.showEngulf && this._engulfZones.length > 0) {
            ctx.fillStyle = withAlpha(this._sfOptions.engulfColor, 0.32);
            for (const zone of this._engulfZones) {
                this._fillZone(ctx, timeScale, priceScale, hpr, vpr, zone);
            }
        }

        ctx.restore();
    }

    private _fillZone(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number,
        zone: SpecialForcesZone
    ): void {
        // Grafiğin ilk mumundan önce başlayan kutunun sol kenarı index olarak
        // bilinemez; çizilmez.
        if (this._toMs(this._sourceData[0].time) > zone.time) return;
        const leftIndex = this._nearestBarIndex(zone.time);

        const x1 = timeScale.indexToCoordinate(leftIndex as any) * hpr;
        const x2 = timeScale.indexToCoordinate((leftIndex + zone.bars) as any) * hpr;
        const yTop = priceScale.priceToCoordinate(zone.top) * vpr;
        const yBottom = priceScale.priceToCoordinate(zone.bottom) * vpr;

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

    private _currentTimeframeGuess(sourceData: BarData[]): string {
        // Gerçek zaman dilimi biliniyorsa onu kullan: son iki mumun aralığı
        // COMEX'in kapalı saatlerinde/hafta sonunda yanlış (2h, 1d...) çıkıyor.
        if (this._ctxTimeframe) return this._ctxTimeframe;
        if (sourceData.length < 2) return '15m';
        const deltaMs = this._toMs(sourceData[sourceData.length - 1].time) - this._toMs(sourceData[sourceData.length - 2].time);
        const minutes = Math.round(deltaMs / 60000);
        const map: Record<number, string> = {
            1: '1m', 3: '3m', 5: '5m', 15: '15m', 30: '30m',
            60: '1h', 120: '2h', 240: '4h', 720: '12h', 1440: '1d',
        };
        return map[minutes] || '15m';
    }

    private async _refresh(key: string): Promise<void> {
        const token = ++this._fetchToken;
        this._inFlightKey = key;
        const { symbol, exchange } = this._sfOptions;
        const timeframe = this._currentTimeframeGuess(this._sourceData);

        try {
            const [levels, zones] = await Promise.all([
                this._callProvider(SpecialForcesIndicator.defaultLevelsProvider, symbol, exchange, timeframe),
                this._callProvider(SpecialForcesIndicator.defaultZonesProvider, symbol, exchange, timeframe),
            ]);
            // Başka bir bağlama (sembol/timeframe) ait iptal edilmiş istek yenisini ezmesin.
            if (token !== this._fetchToken) return;

            this._boxes = levels ?? [];
            this._bobbinZones = zones?.bobbin ?? [];
            this._engulfZones = zones?.engulf ?? [];
            this._lastDoneKey = key;
            this._lastDoneAt = Date.now();
            this._dataChanged.fire();
        } finally {
            if (token === this._fetchToken) this._inFlightKey = null;
        }
    }

    private async _callProvider<T>(
        provider: ((symbol: string, exchange: string, timeframe: string) => Promise<T | null>) | null,
        symbol: string,
        exchange: string,
        timeframe: string
    ): Promise<T | null> {
        if (!provider) return null;
        try {
            return await provider(symbol, exchange, timeframe);
        } catch (error) {
            console.warn('SpecialForcesIndicator: backend verisi alınamadı', error);
            return null;
        }
    }
}
