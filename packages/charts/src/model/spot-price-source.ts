/**
 * Vadeli sembolun (GC1/SI1) spot karsiliginin (XAUUSD FOREXCOM / XAGUSD FXCM)
 * verisi: fiyat ekseninin "spot modu" icin.
 *
 * Grafigin her mumu icin ayni zamandaki spot mumu tutulur; eksen, ana fiyati
 * aradaki fark (vadeli - spot) kadar kaydirarak spot karsiligini gosterir.
 * Gecmis mumlar ve canli tikler host sayfadan gelir: host
 * `SpotPriceSource.defaultKlinesProvider` ve `defaultRealtimeProvider`
 * degerlerini bir kez set eder. Canli akis yoksa (ya da koparsa) 10 sn'de bir
 * son mumlar yoklanir.
 */

import { BarData } from './data';

export interface SpotBar {
    time: number; // epoch ms (ya da sn)
    open: number;
    high: number;
    low: number;
    close: number;
}

export type SpotKlinesProvider = (
    symbol: string,
    exchange: string,
    interval: string,
    limit: number
) => Promise<SpotBar[]>;

/** Canli abonelik: her tikte `onBar` cagrilir; donen fonksiyon aboneligi kapatir. */
export type SpotRealtimeProvider = (
    symbol: string,
    exchange: string,
    interval: string,
    onBar: (bar: SpotBar) => void
) => () => void;

export interface SpotPair {
    symbol: string;
    exchange: string;
}

/** Fiyat eksenine uygulanacak spot bilgisi. */
export interface SpotAxisInfo {
    /** Eksenin ustunde gosterilen kisa ad (broker, or. "FOREXCOM"): dar eksene sigar. */
    title: string;
    /** Eksenin kayma farki: vadeli - spot (en son ortak mumda). */
    offset: number;
    /** Spot sembolun son kapanisi. */
    lastPrice: number;
    /** O mumdaki fark; veri yoksa null (cagiran `offset`e duser). */
    offsetAt(barIndex: number): number | null;
}

// Sadece vadeli -> spot yonu. Broker etiketleri backend'in Symbol tablosundaki
// exchange ile ayni (bkz. tradingview_client.broker_for).
const PAIRS: Record<string, SpotPair> = {
    GC1: { symbol: 'XAUUSD', exchange: 'FOREXCOM' },
    SI1: { symbol: 'XAGUSD', exchange: 'FXCM' },
};

const POLL_MS = 10_000;
const HISTORY_LIMIT = 10_000;
const POLL_LIMIT = 5;
/** Son canli tik bu sureden yeniyse poll istegi atlanir (canli akis saglikli). */
const LIVE_FRESH_MS = 30_000;

function toMs(t: number): number {
    return t > 1e12 ? t : t * 1000;
}

function normalizeInterval(tf: string): string {
    if (/^1?M$/.test(tf)) return '1mo';
    return tf.toLowerCase();
}

export class SpotPriceSource {
    static defaultKlinesProvider: SpotKlinesProvider | null = null;
    static defaultRealtimeProvider: SpotRealtimeProvider | null = null;

    /** Sembolun spot karsiligi (yoksa null): toolbar dugmesi buna gore gorunur. */
    static pairFor(symbol: string): SpotPair | null {
        return PAIRS[symbol] ?? null;
    }

    private _symbol = '';
    private _timeframe = '';
    private _pair: SpotPair | null = null;
    private _active = false;
    private _byTime = new Map<number, SpotBar>();
    private _source: BarData[] = [];
    /** Kaynak mumlarla ayni indeks: o mumdaki spot mumu (yoksa null). */
    private _aligned: (SpotBar | null)[] = [];
    private _fetchToken = 0;
    private _pollTimer: ReturnType<typeof setInterval> | null = null;
    private _unsubscribeLive: (() => void) | null = null;
    private _lastLiveAt = 0;

    constructor(private readonly _onChange: () => void) {}

    get pair(): SpotPair | null {
        return this._pair;
    }

    /**
     * Grafik sembolu/zaman dilimi. Veri sadece `active` iken cekilir: spot modu
     * kapaliyken ag istegi ya da canli abonelik acilmaz.
     */
    setContext(symbol: string, timeframe: string, active: boolean): void {
        const tf = normalizeInterval(timeframe);
        if (symbol === this._symbol && tf === this._timeframe && active === this._active) return;
        const changed = symbol !== this._symbol || tf !== this._timeframe;
        this._symbol = symbol;
        this._timeframe = tf;
        this._active = active;
        this._pair = SpotPriceSource.pairFor(symbol);
        if (changed || !active) {
            this._stop();
            this._byTime.clear();
            this._aligned = [];
        }
        if (active && this._pair && tf && this._byTime.size === 0) this._loadHistory();
    }

    /** Grafik verisi her guncellendiginde: hizalama (senkron, ucuz). */
    setSourceData(bars: BarData[]): void {
        this._source = bars;
        if (this._byTime.size > 0) this._realign();
    }

    /** Eksen icin spot bilgisi; veri yoksa null. */
    axisInfo(): SpotAxisInfo | null {
        if (!this._pair || !this._active) return null;
        let last = -1;
        for (let i = this._aligned.length - 1; i >= 0; i--) {
            if (this._aligned[i] && this._source[i]) {
                last = i;
                break;
            }
        }
        if (last < 0) return null;
        const offsetAt = (i: number): number | null => {
            const spot = this._aligned[i];
            const src = this._source[i];
            return spot && src ? src.close - spot.close : null;
        };
        return {
            title: this._pair.exchange,
            offset: offsetAt(last) as number,
            lastPrice: (this._aligned[last] as SpotBar).close,
            offsetAt,
        };
    }

    destroy(): void {
        this._stop();
        this._byTime.clear();
        this._aligned = [];
    }

    private async _fetch(limit: number): Promise<SpotBar[]> {
        const provider = SpotPriceSource.defaultKlinesProvider;
        if (!provider || !this._pair) return [];
        return provider(this._pair.symbol, this._pair.exchange, this._timeframe, limit);
    }

    private async _loadHistory(): Promise<void> {
        const token = ++this._fetchToken;
        try {
            const bars = await this._fetch(HISTORY_LIMIT);
            if (token !== this._fetchToken) return;
            this._byTime.clear();
            for (const b of bars) this._byTime.set(toMs(b.time), b);
            this._realign();
            this._startLive(token);
            this._startPolling();
            this._onChange();
        } catch (error) {
            if (token === this._fetchToken) console.warn('SpotPriceSource: spot verisi cekilemedi', error);
        }
    }

    private _startPolling(): void {
        if (this._pollTimer) return;
        this._pollTimer = setInterval(() => this._poll(), POLL_MS);
    }

    private _stop(): void {
        this._fetchToken++;
        if (this._pollTimer) clearInterval(this._pollTimer);
        this._pollTimer = null;
        const unsubscribe = this._unsubscribeLive;
        this._unsubscribeLive = null;
        try {
            unsubscribe?.();
        } catch {
            // Kapanmis baglanti: yok sayilir.
        }
    }

    private async _poll(): Promise<void> {
        if (typeof document !== 'undefined' && document.hidden) return;
        // Canli akis calisiyorsa gerek yok; koparsa (tik gelmezse) poll yedek olarak devreye girer.
        if (this._unsubscribeLive && Date.now() - this._lastLiveAt < LIVE_FRESH_MS) return;
        const token = this._fetchToken;
        try {
            const bars = await this._fetch(POLL_LIMIT);
            if (token !== this._fetchToken || bars.length === 0) return;
            for (const b of bars) this._byTime.set(toMs(b.time), b);
            this._realign();
            this._onChange();
        } catch {
            // Gecici ag hatasi: bir sonraki turda tekrar denenir.
        }
    }

    private _startLive(token: number): void {
        const provider = SpotPriceSource.defaultRealtimeProvider;
        if (!provider || !this._pair || this._unsubscribeLive) return;
        try {
            this._unsubscribeLive = provider(this._pair.symbol, this._pair.exchange, this._timeframe, (bar) => {
                if (token !== this._fetchToken) return;
                this._applyLiveBar(bar);
            });
        } catch (error) {
            // Canli baglanti acilamazsa 10 sn'lik poll devam eder.
            console.warn('SpotPriceSource: canli abonelik acilamadi', error);
            this._unsubscribeLive = null;
        }
    }

    /** Canli tik: son mumu yerinde gunceller; yeni bir mumsa tum hizalama yenilenir. */
    private _applyLiveBar(bar: SpotBar): void {
        this._lastLiveAt = Date.now();
        const time = toMs(bar.time);
        this._byTime.set(time, bar);
        const last = this._source.length - 1;
        if (last >= 0 && toMs(this._source[last].time) === time && this._aligned.length === last + 1) {
            this._aligned[last] = bar;
        } else {
            this._realign();
        }
        this._onChange();
    }

    private _realign(): void {
        const src = this._source;
        this._aligned = new Array(src.length);
        for (let i = 0; i < src.length; i++) {
            this._aligned[i] = this._byTime.get(toMs(src[i].time)) ?? null;
        }
    }
}
