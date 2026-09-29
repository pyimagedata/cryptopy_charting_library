/**
 * Spot Karsilastirma (Spot Compare) Indicator
 *
 * Grafikteki vadeli sembolun (GC1/SI1) spot karsiligini (XAUUSD/XAGUSD) ayni
 * zaman diliminde ust uste ceker ve fare mumlarin uzerinde gezinirken legend'da
 * karsi sembolun O/H/L/C degerlerini + farki (grafik - karsi sembol) gosterir.
 * Ters yonde de calisir (XAUUSD grafiginde GC1 gosterilir).
 *
 * Veri host sayfadan gelir (SpecialForcesIndicator ile ayni desen): host
 * `SpotCompareIndicator.defaultKlinesProvider` degerini bir kez set eder.
 */

import { OverlayIndicator, IndicatorOptions, IndicatorRange } from './indicator';
import { BarData } from '../model/data';
import { displaySymbol } from '../helpers/display-aliases';

export interface SpotCompareBar {
    time: number; // epoch ms (ya da sn)
    open: number;
    high: number;
    low: number;
    close: number;
}

export type SpotCompareKlinesProvider = (
    symbol: string,
    exchange: string,
    interval: string,
    limit: number
) => Promise<SpotCompareBar[]>;

export interface SpotCompareIndicatorOptions extends IndicatorOptions {
    /** 'auto' = grafik sembolunden eslestir; aksi halde sabit karsi sembol kodu. */
    pairSymbol: string;
    pairExchange: string;
    showDifference: boolean;
    /** Karsi sembolun kapanis cizgisi; varsayilan kapali (sadece legend degerleri). */
    showLine: boolean;
}

interface PairInfo {
    symbol: string;
    exchange: string;
}

// Grafik sembolu -> karsilastirilacak sembol. Broker etiketleri backend'in
// Symbol tablosundaki exchange ile ayni (bkz. tradingview_client.broker_for).
const PAIR_MAP: Record<string, PairInfo> = {
    GC1: { symbol: 'XAUUSD', exchange: 'FOREXCOM' },
    SI1: { symbol: 'XAGUSD', exchange: 'FXCM' },
    XAUUSD: { symbol: 'GC1', exchange: 'COMEX' },
    XAGUSD: { symbol: 'SI1', exchange: 'COMEX' },
};

const POLL_MS = 10_000;
const HISTORY_LIMIT = 10_000;
const POLL_LIMIT = 5;

const defaultOptions: Partial<SpotCompareIndicatorOptions> = {
    name: 'Spot Karşılaştırma',
    pairSymbol: 'auto',
    pairExchange: '',
    showDifference: true,
    showLine: false,
    color: '#f5a623',
    lineWidth: 1,
};

function toMs(t: number): number {
    return t > 1e12 ? t : t * 1000;
}

function normalizeInterval(tf: string): string {
    if (/^1?M$/.test(tf)) return '1mo';
    return tf.toLowerCase();
}

export class SpotCompareIndicator extends OverlayIndicator {
    static defaultKlinesProvider: SpotCompareKlinesProvider | null = null;

    private _scOptions: SpotCompareIndicatorOptions;
    private _chartSymbol = '';
    private _timeframe = '';
    private _pair: PairInfo | null = null;
    private _byTime = new Map<number, SpotCompareBar>();
    /** Kaynak mumlarla ayni indeks: karsi sembolun o mumdaki degeri (yoksa null). */
    private _aligned: (SpotCompareBar | null)[] = [];
    private _fetchToken = 0;
    private _pollTimer: ReturnType<typeof setInterval> | null = null;
    private _loading = false;

    constructor(options: Partial<SpotCompareIndicatorOptions> = {}) {
        super({ ...defaultOptions, ...options });
        this._scOptions = { ...defaultOptions, ...this._options } as SpotCompareIndicatorOptions;
    }

    /** chart-widget her veri guncellemesinden once cagirir; degisiklik yoksa no-op. */
    setContext(ctx: { symbol: string; timeframe: string }): void {
        const symbol = ctx.symbol;
        const timeframe = normalizeInterval(ctx.timeframe);
        if (symbol === this._chartSymbol && timeframe === this._timeframe) return;
        this._chartSymbol = symbol;
        this._timeframe = timeframe;
        this._pair = this._resolvePair(symbol);
        this._byTime.clear();
        this._aligned = [];
        this._data = [];
        this._stopPolling();
        if (this._pair && timeframe) {
            this._loadHistory();
        } else {
            this._syncName();
            this._dataChanged.fire();
        }
    }

    private _resolvePair(symbol: string): PairInfo | null {
        if (this._scOptions.pairSymbol && this._scOptions.pairSymbol !== 'auto') {
            return { symbol: this._scOptions.pairSymbol, exchange: this._scOptions.pairExchange || 'FOREXCOM' };
        }
        return PAIR_MAP[symbol] ?? null;
    }

    private _syncName(): void {
        const name = this._pair
            ? `${displaySymbol(this._pair.symbol)} · ${this._pair.exchange}`
            : 'Spot Karşılaştırma (eşleşme yok)';
        this._options.name = name;
        this._scOptions.name = name;
    }

    private async _fetch(limit: number): Promise<SpotCompareBar[]> {
        const provider = SpotCompareIndicator.defaultKlinesProvider;
        if (!provider || !this._pair) return [];
        return provider(this._pair.symbol, this._pair.exchange, this._timeframe, limit);
    }

    private async _loadHistory(): Promise<void> {
        const token = ++this._fetchToken;
        this._loading = true;
        this._syncName();
        try {
            const bars = await this._fetch(HISTORY_LIMIT);
            if (token !== this._fetchToken) return;
            this._byTime.clear();
            for (const b of bars) this._byTime.set(toMs(b.time), b);
            this._realign();
            this._startPolling();
        } catch (error) {
            if (token === this._fetchToken) console.warn('SpotCompareIndicator: karsi sembol verisi cekilemedi', error);
        } finally {
            if (token === this._fetchToken) {
                this._loading = false;
                this._dataChanged.fire();
            }
        }
    }

    private _startPolling(): void {
        if (this._pollTimer) return;
        this._pollTimer = setInterval(() => this._poll(), POLL_MS);
    }

    private _stopPolling(): void {
        if (this._pollTimer) clearInterval(this._pollTimer);
        this._pollTimer = null;
    }

    private async _poll(): Promise<void> {
        if (typeof document !== 'undefined' && document.hidden) return;
        const token = this._fetchToken;
        try {
            const bars = await this._fetch(POLL_LIMIT);
            if (token !== this._fetchToken || bars.length === 0) return;
            for (const b of bars) this._byTime.set(toMs(b.time), b);
            this._realign();
            this._dataChanged.fire();
        } catch {
            // Gecici ag hatasi: bir sonraki turda tekrar denenir.
        }
    }

    private _realign(): void {
        const src = this._sourceData;
        this._aligned = new Array(src.length);
        this._data = new Array(src.length);
        for (let i = 0; i < src.length; i++) {
            const other = this._byTime.get(toMs(src[i].time)) ?? null;
            this._aligned[i] = other;
            this._data[i] = { time: src[i].time, value: other && this._scOptions.showLine ? other.close : NaN };
        }
    }

    // Kaynak veri her tick'te gelir: sadece hizalama (senkron, ucuz).
    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._realign();
    }

    /** Legend hook'u: `barIndex` = fare altindaki (yoksa son) mum. */
    getLegendHtml(barIndex: number | null, isDark: boolean): string {
        const muted = isDark ? '#787b86' : '#5d606b';
        if (!this._pair) return `<span style="color:${muted}">bu sembol için eşleşme yok</span>`;
        if (this._loading && this._byTime.size === 0) return `<span style="color:${muted}">yükleniyor…</span>`;
        const idx = barIndex ?? this._aligned.length - 1;
        const other = idx >= 0 && idx < this._aligned.length ? this._aligned[idx] : null;
        if (!other) return `<span style="color:${muted}">bu mumda veri yok</span>`;

        const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const color = this._scOptions.color;
        const part = (label: string, v: number) =>
            `<span style="color:${muted}">${label}</span><span style="color:${color};margin-left:2px;margin-right:6px">${fmt(v)}</span>`;
        let html = part('O', other.open) + part('H', other.high) + part('L', other.low) + part('C', other.close);
        if (this._scOptions.showDifference) {
            const src = this._sourceData[idx];
            if (src) {
                const diff = src.close - other.close;
                const sign = diff >= 0 ? '+' : '';
                html += `<span style="color:${muted}">Fark</span><span style="color:${color};margin-left:2px">${sign}${fmt(diff)}</span>`;
            }
        }
        return html;
    }

    getRange(visibleRange?: { from: number; to: number } | null): IndicatorRange {
        return super.getRange(visibleRange);
    }

    getDescription(index?: number): string {
        const idx = index ?? this._aligned.length - 1;
        const other = idx >= 0 ? this._aligned[idx] : null;
        return `${this.name}: ${other ? other.close.toFixed(2) : '-'}`;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._scOptions };
    }

    setSettingValue(key: string, value: any): boolean {
        (this._scOptions as any)[key] = value;
        (this._options as any)[key] = value;
        if (key === 'pairSymbol' || key === 'pairExchange') {
            const ctxSymbol = this._chartSymbol;
            const tf = this._timeframe;
            this._chartSymbol = '';
            this.setContext({ symbol: ctxSymbol, timeframe: tf });
            return true;
        }
        if (key === 'showLine') this._realign();
        this._dataChanged.fire();
        return false;
    }

    destroy(): void {
        this._fetchToken++;
        this._stopPolling();
        this._byTime.clear();
        this._aligned = [];
        super.destroy();
    }
}
