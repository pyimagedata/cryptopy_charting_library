// Likidasyon Haritasi (Liquidation Heatmap): CoinGlass tarzi isi haritasi, mumlarin ARKASINDA.
// Veri backend'den gelir (host `LiqHeatmapIndicator.defaultProvider` ile istegi yapar, oturum ve
// premium yetki orada kontrol edilir); burada yalnizca ayristirma, renklendirme ve cizim var.
//
// Cizim: gorunur kosular bir ImageData tamponuna (bitmap cozunurlugunde) rasterlanir, tek
// drawImage ile (opacity = globalAlpha) basilir. Dikdortgenler birbirini ortmedigi icin
// kosu sayisi 200k olsa da kare basina maliyet piksel sayisiyla sinirli kalir.

import { OverlayIndicator } from './indicator';
import { BarData } from '../model/data';
import { RemoteContext, barTimeMs } from './remote-compute';
import { IndicatorLegendInfo } from './legend-info';
import { parseTimeframe } from '../drawings/intervals-visibility';

export type LiqHeatmapPeriod = '12h' | '24h' | '3d' | '1w' | '2w' | '1m' | '3m';
/** Setting value: a real period or 'auto' (follows the chart timeframe). */
export type LiqHeatmapPeriodOption = LiqHeatmapPeriod | 'auto';
export type LiqHeatmapPalette = 'viridis' | 'magma' | 'jet' | 'cividis';

export interface LiqHeatmapOptions {
    name: string;
    period: LiqHeatmapPeriodOption;
    /** "Liquidity Threshold" 0..1 (CoinGlass slider benzeri; bkz. _satValue) */
    threshold: number;
    palette: LiqHeatmapPalette;
    opacity: number;
    visible: boolean;
}

const defaultLiqHeatmapOptions: LiqHeatmapOptions = {
    name: 'Likidasyon Haritası',
    period: 'auto',
    threshold: 0.85,
    palette: 'viridis',
    opacity: 0.85,
    visible: true,
};

export interface LiqHeatmapBin {
    /** Bin lower price */
    p: number;
    side: 'long' | 'short';
    /** [t0_ms, t1_ms, q] with q = round(255 * sqrt(v / scale)), 1..255 */
    runs: Array<[number, number, number]>;
}

export interface LiqHeatmapResponse {
    symbol?: string;
    period?: string;
    bucket_sec?: number;
    start?: number;
    end?: number;
    bin_size: number;
    scale: number;
    price_min?: number;
    price_max?: number;
    bins: LiqHeatmapBin[];
    oi_last_time?: number | null;
}

export interface LiqHeatmapQuery {
    /** Backend symbol (BTCUSDT / ETHUSDT) */
    symbol: string;
    period: LiqHeatmapPeriod;
    /** Replay cursor (epoch ms); undefined = live */
    end?: number;
}

/** Host-supplied fetcher. Throw an Error with `status` 401/403/404 on those responses; return null for "no data". */
export type LiqHeatmapProvider = (query: LiqHeatmapQuery) => Promise<LiqHeatmapResponse | null>;

const PERIODS: LiqHeatmapPeriod[] = ['12h', '24h', '3d', '1w', '2w', '1m', '3m'];
const PERIOD_LABELS: Record<LiqHeatmapPeriod, string> = {
    '12h': '12 saat', '24h': '24 saat', '3d': '3 gün', '1w': '1 hafta', '2w': '2 hafta', '1m': '1 ay', '3m': '3 ay',
};
const PERIOD_MINUTES: Record<LiqHeatmapPeriod, number> = {
    '12h': 720, '24h': 1440, '3d': 4320, '1w': 10080, '2w': 20160, '1m': 43200, '3m': 129600,
};
/** 'auto' target: the period should span about this many bars. */
const AUTO_TARGET_BARS = 120;

/** Resolves a period setting to a real backend period. 'auto' picks the smallest period covering ~120 bars of `timeframe`. */
export function resolveLiqHeatmapPeriod(period: LiqHeatmapPeriodOption, timeframe?: string | null): LiqHeatmapPeriod {
    if (period !== 'auto') return period;
    const tf = parseTimeframe(timeframe);
    if (!tf || tf.kind === 'ticks' || tf.kind === 'ranges') return '24h';
    const mult = tf.mult;
    const perBar = tf.kind === 'seconds' ? mult / 60
        : tf.kind === 'minutes' ? mult
        : tf.kind === 'hours' ? mult * 60
        : tf.kind === 'days' ? mult * 1440
        : tf.kind === 'weeks' ? mult * 10080
        : mult * 43200;
    const target = AUTO_TARGET_BARS * perBar;
    for (const p of PERIODS) if (PERIOD_MINUTES[p] >= target) return p;
    return '3m';
}

const ENSURE_DEBOUNCE_MS = 300;
/** Replay stepping: trailing debounce, with a max wait so continuous play still refreshes. */
const REPLAY_DEBOUNCE_MS = 250;
const REPLAY_MAX_WAIT_MS = 1000;
const POLL_MS = 60_000;
const BUCKET_MS = 60_000;
/** x below this is not drawn (chart background stays). */
const X_EPS = 0.002;
const SUPPORTED = new Set(['BTCUSDT', 'ETHUSDT']);

// --- Palettes -----------------------------------------------------------------

const PALETTE_STOPS: Record<LiqHeatmapPalette, string[]> = {
    viridis: ['#440154', '#472d7b', '#3b528b', '#2c728e', '#21918c', '#28ae80', '#5ec962', '#addc30', '#fde725'],
    magma: ['#000004', '#180f3e', '#451077', '#721f81', '#9f2f7f', '#cd4071', '#f1605d', '#fd9567', '#fec98d', '#fcfdbf'],
    jet: ['#000080', '#0000ff', '#00ffff', '#ffff00', '#ff0000', '#800000'],
    cividis: ['#00224e', '#123570', '#3b496c', '#575d6d', '#707173', '#8a8678', '#a59c74', '#c3b369', '#e1cc55', '#fee838'],
};
// jet: stops are not evenly spaced in the classic definition (0, .125, .375, .625, .875, 1)
const PALETTE_POS: Partial<Record<LiqHeatmapPalette, number[]>> = {
    jet: [0, 0.125, 0.375, 0.625, 0.875, 1],
};

const lutCache = new Map<LiqHeatmapPalette, Uint32Array>();

function hexToRgb(hex: string): [number, number, number] {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** 256-entry LUT of opaque pixels packed as little-endian ABGR (ImageData byte order RGBA). */
function paletteLut(name: LiqHeatmapPalette): Uint32Array {
    const cached = lutCache.get(name);
    if (cached) return cached;
    const stops = (PALETTE_STOPS[name] ?? PALETTE_STOPS.viridis).map(hexToRgb);
    const pos = PALETTE_POS[name] ?? stops.map((_, i) => i / (stops.length - 1));
    const lut = new Uint32Array(256);
    let seg = 0;
    for (let i = 0; i < 256; i++) {
        const x = i / 255;
        while (seg < stops.length - 2 && x > pos[seg + 1]) seg++;
        const span = pos[seg + 1] - pos[seg] || 1;
        const f = Math.max(0, Math.min(1, (x - pos[seg]) / span));
        const a = stops[seg], b = stops[seg + 1];
        const r = Math.round(a[0] + (b[0] - a[0]) * f);
        const g = Math.round(a[1] + (b[1] - a[1]) * f);
        const bl = Math.round(a[2] + (b[2] - a[2]) * f);
        lut[i] = ((255 << 24) | (bl << 16) | (g << 8) | r) >>> 0;
    }
    lutCache.set(name, lut);
    return lut;
}

/** Chart symbol/exchange -> backend symbol, or null when unsupported. */
export function liqHeatmapSymbol(symbol: string, exchange?: string): string | null {
    const ex = (exchange ?? '').toUpperCase();
    if (ex !== 'BINANCE' && ex !== 'BINANCE-FUTURES') return null;
    const s = symbol.toUpperCase().replace(/\.P$/, '');
    return SUPPORTED.has(s) ? s : null;
}

/** Flattened, long+short-combined cells. */
interface Cells {
    n: number;
    t0: Float64Array;
    t1: Float64Array;
    /** index into binP */
    bin: Uint32Array;
    v: Float32Array;
    binP: Float64Array;
    binSize: number;
    /** sorted copy of v (for quantiles) */
    sorted: Float32Array;
}

export class LiqHeatmapIndicator extends OverlayIndicator {
    /** Host sets this once (page script), like NewsIndicator.defaultProvider. */
    static defaultProvider: LiqHeatmapProvider | null = null;

    /** Read by OverlayIndicatorRenderer: drawn in the pass BEFORE the candles. */
    readonly drawBehind = true;

    private _ctx: RemoteContext | null = null;
    private _cells: Cells | null = null;
    private _colorIdx: Uint8Array | null = null;
    private _colorKey = '';
    private _loadedKey = '';
    private _gen = 0;
    private _inFlight = false;
    private _again = false;
    private _denied: 401 | 403 | null = null;
    /** Backend said 404 unsupported_symbol (reset on period / replay cursor change). */
    private _unsupportedSrv = false;
    /** Symbol/exchange is not BTCUSDT/ETHUSDT on Binance (client-side mapping). */
    private _unsupportedMap = false;
    /** Backend 404 other than unsupported_symbol (e.g. not enough data yet). */
    private _noData = false;
    private _ensureSince = 0;
    private _tz = '';
    private _failed = false;
    private _warned = false;
    private _updatedAt = 0;
    private _ensureTimer: ReturnType<typeof setTimeout> | null = null;
    private _pollTimer: ReturnType<typeof setInterval> | null = null;
    private _retryAt = 0;
    private _retryDelay = 0;
    private _retryTimer: ReturnType<typeof setTimeout> | null = null;

    // Bar times for ms <-> fractional index
    private _times = new Float64Array(0);
    private _barMsCache = 60_000;
    /** true when every bar is exactly one interval after the previous (no gaps): ms <-> index is linear, no search. */
    private _uniform = false;

    // Raster buffer
    private _off: HTMLCanvasElement | null = null;
    private _offCtx: CanvasRenderingContext2D | null = null;
    private _img: ImageData | null = null;
    private _px: Uint32Array | null = null;
    private _binY0 = new Int32Array(0);
    private _binY1 = new Int32Array(0);

    /** Last draw timing (ms) and drawn run count, for perf checks. */
    readonly stats = { lastDrawMs: 0, drawnRuns: 0, totalRuns: 0 };

    constructor(options: Partial<LiqHeatmapOptions> = {}) {
        super({ ...defaultLiqHeatmapOptions, ...options } as any);
        this._pollTimer = setInterval(() => this._poll(), POLL_MS);
    }

    private get _o(): LiqHeatmapOptions {
        return this._options as unknown as LiqHeatmapOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._options };
    }

    getSettingsConfig(): any {
        return {
            name: this.name,
            tabs: [
                {
                    id: 'inputs', label: 'Inputs', sections: [{ rows: [
                        {
                            type: 'select', key: 'period', label: 'Periyot', defaultValue: this._o.period,
                            options: [{ value: 'auto', label: 'Otomatik' }, ...PERIODS.map(p => ({ value: p, label: PERIOD_LABELS[p] }))],
                        },
                        { type: 'slider', key: 'threshold', label: 'Likidite Eşiği', min: 0, max: 1, step: 0.01, defaultValue: this._o.threshold },
                    ] }],
                },
                {
                    id: 'style', label: 'Style', sections: [{ rows: [
                        {
                            type: 'select', key: 'palette', label: 'Palet', defaultValue: this._o.palette,
                            options: [
                                { value: 'viridis', label: 'Viridis' },
                                { value: 'magma', label: 'Magma' },
                                { value: 'jet', label: 'Jet' },
                                { value: 'cividis', label: 'Cividis' },
                            ],
                        },
                        { type: 'slider', key: 'opacity', label: 'Opaklık', min: 0.1, max: 1, step: 0.05, defaultValue: this._o.opacity },
                    ] }],
                },
            ],
        };
    }

    setSettingValue(key: string, value: any): boolean {
        const old = (this._options as any)[key];
        if (old === value) return false;
        (this._options as any)[key] = value;
        if (key === 'period') {
            this._resetData();
            this._denied = null;
            this._unsupportedSrv = false;
            this._scheduleEnsure();
        }
        this._dataChanged.fire();
        return false;
    }

    /** chart-widget her veri guncellemesinden once cagirir. */
    setContext(ctx: RemoteContext): void {
        const prev = this._ctx;
        const prevPeriod = this._period();
        this._ctx = ctx;
        const tfPeriodChanged = !!prev && this._period() !== prevPeriod;
        if (!prev || prev.symbol !== ctx.symbol || (prev.exchange ?? '') !== (ctx.exchange ?? '')) {
            this._resetData();
            this._denied = null;
            this._unsupportedSrv = false;
            this._unsupportedMap = this._backendSymbol() === null;
            this._scheduleEnsure();
        } else if (tfPeriodChanged || prev.end !== ctx.end) {
            if (tfPeriodChanged) {
                this._resetData();
                this._denied = null;
            }
            // Replay enter/leave or cursor moved backward: a later-end payload must not stay on screen
            // (same rule as RemoteCompute.setContext).
            const enterLeave = (prev.end === undefined) !== (ctx.end === undefined);
            const backward = prev.end !== undefined && ctx.end !== undefined && ctx.end < prev.end;
            if (enterLeave || backward) this._resetData();
            this._unsupportedSrv = false;
            this._noData = false;
            this._clearRetry();
            this._scheduleEnsure(); // yalnizca dakika kovasi degisince gercekten istek atilir
            this._dataChanged.fire();
        }
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        const n = sourceData.length;
        if (n > 0) {
            const first = barTimeMs(sourceData[0]);
            const last = barTimeMs(sourceData[n - 1]);
            const t = this._times;
            // Only rebuild when the series changed shape (live ticks only touch the last bar's OHLC).
            if (t.length !== n || t[0] !== first || t[n - 1] !== last) {
                const times = new Float64Array(n);
                for (let i = 0; i < n; i++) times[i] = barTimeMs(sourceData[i]);
                this._times = times;
                const d = n >= 2 ? times[n - 1] - times[n - 2] : 0;
                if (d > 0) this._barMsCache = d;
                let uniform = d > 0;
                for (let i = 1; uniform && i < n; i++) if (times[i] - times[i - 1] !== d) uniform = false;
                this._uniform = uniform;
            }
        } else {
            this._times = new Float64Array(0);
        }
    }

    setVisible(visible: boolean): void {
        super.setVisible(visible);
        if (visible) this._scheduleEnsure();
    }

    getRange(): { min: number; max: number } {
        // Fiyat olcegini etkilemez.
        return { min: 0, max: 100 };
    }

    private _statusText(): string {
        if (this._denied === 401) return 'giriş gerekli';
        if (this._denied === 403) return 'premium gerekli';
        if (this._unsupportedMap || this._unsupportedSrv) return 'desteklenmeyen sembol (yalnız Binance BTCUSDT/ETHUSDT)';
        const parts: string[] = [
            this._o.period === 'auto' ? `Otomatik (${PERIOD_LABELS[this._period()]})` : this._o.period,
            'Binance',
        ];
        if (this._cells) {
            const ts = this._updatedAt;
            if (ts > 0) parts.push(this._fmtTime(ts));
        } else if (this._noData) parts.push('veri yok');
        else if (this._failed) parts.push('veri alınamadı');
        else parts.push('yükleniyor…');
        return parts.join(' · ');
    }

    /** HH:MM:SS in the chart's timezone (as on the time axis); explicit UTC when it is unknown. */
    private _fmtTime(ms: number): string {
        const o: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
        if (this._tz) {
            try { return new Intl.DateTimeFormat('tr-TR', { ...o, timeZone: this._tz }).format(ms); } catch { /* fall through */ }
        }
        return new Intl.DateTimeFormat('tr-TR', { ...o, timeZone: 'UTC' }).format(ms) + ' UTC';
    }

    getDescription(): string {
        return `Likidasyon Haritası: ${this._statusText()}`;
    }

    getLegendInfo(): IndicatorLegendInfo {
        return { title: 'Likidasyon Haritası', params: [this._statusText()], plots: [] };
    }

    // --- Data ---------------------------------------------------------------

    private _backendSymbol(): string | null {
        const c = this._ctx;
        return c ? liqHeatmapSymbol(c.symbol, c.exchange) : null;
    }

    private _resetData(): void {
        this._gen++;
        this._cells = null;
        this._colorIdx = null;
        this._colorKey = '';
        this._loadedKey = '';
        this._inFlight = false;
        this._again = false;
        this._failed = false;
        this._noData = false;
        this._warned = false;
        this._updatedAt = 0;
        this._clearRetry();
    }

    private _clearRetry(): void {
        this._retryAt = 0;
        this._retryDelay = 0;
        if (this._retryTimer !== null) clearTimeout(this._retryTimer);
        this._retryTimer = null;
    }

    private _backoff(): void {
        this._retryDelay = this._retryDelay === 0 ? 30_000 : Math.min(this._retryDelay * 2, 300_000);
        this._retryAt = Date.now() + this._retryDelay;
        if (this._retryTimer !== null) clearTimeout(this._retryTimer);
        this._retryTimer = setTimeout(() => { this._retryTimer = null; this._scheduleEnsure(); }, this._retryDelay + 50);
    }

    private _blocked(): boolean {
        return this._denied !== null || this._unsupportedMap || this._unsupportedSrv || Date.now() < this._retryAt;
    }

    /** Replay cursor, or undefined when live. */
    private _end(): number | undefined {
        return this._ctx?.end;
    }

    /** Real period to send/key: 'auto' resolved from the chart timeframe. */
    private _period(): LiqHeatmapPeriod {
        return resolveLiqHeatmapPeriod(this._o.period, this._ctx?.timeframe);
    }

    private _wantKey(sym: string): string {
        const end = this._end();
        return `${sym}|${this._period()}|${end === undefined ? 'live' : Math.floor(end / BUCKET_MS)}`;
    }

    private _scheduleEnsure(): void {
        const now = Date.now();
        let delay = ENSURE_DEBOUNCE_MS;
        if (this._end() !== undefined) {
            // replay: trailing debounce (each step restarts it), capped by a max wait
            if (this._ensureTimer !== null) clearTimeout(this._ensureTimer);
            else this._ensureSince = now;
            delay = Math.max(0, Math.min(REPLAY_DEBOUNCE_MS, this._ensureSince + REPLAY_MAX_WAIT_MS - now));
        } else if (this._ensureTimer !== null) return; // throttle: scroll redraws must not starve it
        this._ensureTimer = setTimeout(() => {
            this._ensureTimer = null;
            this._ensure();
        }, delay);
    }

    private _ensure(): void {
        if (this._blocked() || !LiqHeatmapIndicator.defaultProvider || !this._ctx || !this.shown) return;
        const sym = this._backendSymbol();
        if (!sym) return;
        if (this._wantKey(sym) === this._loadedKey) return;
        void this._fetch(sym);
    }

    private async _fetch(sym: string): Promise<void> {
        const provider = LiqHeatmapIndicator.defaultProvider;
        if (!provider) return;
        if (this._inFlight) { this._again = true; return; }
        this._inFlight = true;
        const gen = this._gen;
        const key = this._wantKey(sym);
        const end = this._end();
        try {
            const resp = await provider({ symbol: sym, period: this._period(), ...(end !== undefined ? { end } : {}) });
            if (gen !== this._gen) return;
            if (resp && Array.isArray(resp.bins) && resp.bin_size > 0 && resp.scale > 0) {
                this._cells = buildCells(resp);
                this._colorIdx = null;
                this._colorKey = '';
                this._loadedKey = key;
                this._failed = false;
                this._noData = false;
                this._updatedAt = typeof resp.oi_last_time === 'number' && resp.oi_last_time > 0 ? resp.oi_last_time : Date.now();
                this.stats.totalRuns = this._cells.n;
                this._clearRetry();
            } else {
                this._failed = true;
                this._backoff();
            }
        } catch (error) {
            if (gen !== this._gen) return;
            const status = (error as { status?: number } | null)?.status;
            if (status === 401 || status === 403) this._denied = status;
            else if (status === 404 && (error as { detail?: unknown }).detail === 'unsupported_symbol') {
                this._unsupportedSrv = true; // yeniden deneme yok (periyot / replay imleci degisince sifirlanir)
            } else if (status === 404) {
                this._noData = true; // "yeterli veri yok" gibi: gecici, backoff ile tekrar dene
                this._backoff();
            } else {
                this._failed = true;
                this._backoff();
                if (!this._warned) {
                    this._warned = true;
                    console.warn('LiqHeatmapIndicator: veri alınamadı', error);
                }
            }
        } finally {
            if (gen === this._gen) {
                this._inFlight = false;
                this._dataChanged.fire();
                if (this._again) { this._again = false; this._scheduleEnsure(); }
            }
        }
    }

    private _poll(): void {
        if (this._blocked() || !LiqHeatmapIndicator.defaultProvider || !this._ctx || !this.shown) return;
        if (this._end() !== undefined) return; // replay: imlec hareketi yeniler
        if (typeof document !== 'undefined' && document.hidden) return;
        this._loadedKey = ''; // force a refetch (bucket granularity is 60 s)
        this._ensure();
    }

    // --- Colour ---------------------------------------------------------------

    /**
     * Saturation value: values >= sat get the top colour. CoinGlass's "Liquidity Threshold" slider
     * is not documented; this is an APPROXIMATION: sat = quantile(nonzero cells, 1 - (1 - t) / 30),
     * so t = 0.85 -> 99.5th percentile, t = 1 -> max, t = 0 -> 96.7th percentile.
     */
    private _satValue(cells: Cells, t: number): number {
        const s = cells.sorted;
        if (s.length === 0) return 1;
        const q = 1 - (1 - Math.max(0, Math.min(1, t))) / 30;
        return Math.max(s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))], 1e-12);
    }

    /** Per-cell palette index (0 = not drawn): x = min(v / sat, 1), colour = palette(x^0.75). */
    private _ensureColors(cells: Cells): Uint8Array {
        const key = `${this._o.threshold}`;
        if (this._colorIdx && this._colorKey === key && this._colorIdx.length === cells.n) return this._colorIdx;
        const sat = this._satValue(cells, this._o.threshold);
        const out = new Uint8Array(cells.n);
        for (let i = 0; i < cells.n; i++) {
            const x = Math.min(cells.v[i] / sat, 1);
            out[i] = x < X_EPS ? 0 : Math.max(1, Math.round(Math.pow(x, 0.75) * 255));
        }
        this._colorIdx = out;
        this._colorKey = key;
        return out;
    }

    // --- Time mapping -----------------------------------------------------------

    /** ms -> fractional bar index (bar i spans [i, i+1) from its open). Extrapolates outside the series. */
    private _msToFi(ms: number): number {
        const T = this._times;
        const n = T.length;
        if (this._uniform) return (ms - T[0]) / this._barMsCache;
        if (ms >= T[n - 1]) return n - 1 + (ms - T[n - 1]) / this._barMsCache;
        if (ms < T[0]) return (ms - T[0]) / this._barMsCache;
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (T[mid] <= ms) lo = mid; else hi = mid;
        }
        return lo + (ms - T[lo]) / (T[lo + 1] - T[lo]);
    }

    private _fiToMs(fi: number): number {
        const T = this._times;
        const n = T.length;
        if (this._uniform) return T[0] + fi * this._barMsCache;
        if (fi >= n - 1) return T[n - 1] + (fi - (n - 1)) * this._barMsCache;
        if (fi < 0) return T[0] + fi * this._barMsCache;
        const i = Math.floor(fi);
        return T[i] + (fi - i) * (T[i + 1] - T[i]);
    }

    // --- Drawing ----------------------------------------------------------------

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        const cells = this._cells;
        if (!this._blocked() && LiqHeatmapIndicator.defaultProvider && this._ctx) {
            const sym = this._backendSymbol();
            if (sym && this._wantKey(sym) !== this._loadedKey) this._scheduleEnsure();
        }
        if (!cells || cells.n === 0 || this._denied !== null || this._unsupportedMap || this._unsupportedSrv || this._times.length === 0) return;

        this._tz = timeScale.timeMarks?.timezone ?? '';
        const tStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const W = ctx.canvas.width, H = ctx.canvas.height;
        if (W <= 0 || H <= 0) return;
        const px = this._ensureBuffer(W, H);
        px.fill(0);

        const colorIdx = this._ensureColors(cells);
        const lut = paletteLut(this._o.palette);

        const spacing = timeScale.barSpacing as number;
        const xBase = timeScale.indexToCoordinate(0) as number;
        const cssW = W / hpr;
        // visible time window (with a small margin) for culling
        const fiLeft = (0 - xBase) / spacing + 0.5;
        const fiRight = (cssW - xBase) / spacing + 0.5;
        const tMin = this._fiToMs(fiLeft - 1);
        const tMax = this._fiToMs(fiRight + 1);
        const end = this._end();
        const cutoff = end === undefined ? Infinity : end;

        // per-bin pixel rows (once per frame)
        const nb = cells.binP.length;
        if (this._binY0.length < nb) { this._binY0 = new Int32Array(nb); this._binY1 = new Int32Array(nb); }
        const binY0 = this._binY0, binY1 = this._binY1;
        const size = cells.binSize;
        for (let b = 0; b < nb; b++) {
            const ya = (priceScale.priceToCoordinate(cells.binP[b] + size) as number) * vpr;
            const yb = (priceScale.priceToCoordinate(cells.binP[b]) as number) * vpr;
            let y0 = Math.floor(Math.min(ya, yb));
            let y1 = Math.ceil(Math.max(ya, yb));
            if (!(y1 > y0)) y1 = y0 + 1;
            if (y1 <= 0 || y0 >= H || !isFinite(y0) || !isFinite(y1)) { binY0[b] = -1; binY1[b] = -1; continue; }
            binY0[b] = Math.max(0, y0);
            binY1[b] = Math.min(H, y1);
        }

        const { t0, t1, bin } = cells;
        let drawn = 0;
        for (let i = 0; i < cells.n; i++) {
            const ci = colorIdx[i];
            if (ci === 0) continue;
            const a = t0[i];
            let b = t1[i];
            if (b > cutoff) b = cutoff;
            if (b <= tMin || a >= tMax || b <= a) continue;
            const y0 = binY0[bin[i]];
            if (y0 < 0) continue;
            const y1 = binY1[bin[i]];
            let xa = Math.floor((xBase + (this._msToFi(a) - 0.5) * spacing) * hpr);
            let xb = Math.ceil((xBase + (this._msToFi(b) - 0.5) * spacing) * hpr);
            if (xb <= xa) xb = xa + 1;
            if (xa < 0) xa = 0;
            if (xb > W) xb = W;
            if (xb <= xa) continue;
            const col = lut[ci];
            for (let y = y0; y < y1; y++) px.fill(col, y * W + xa, y * W + xb);
            drawn++;
        }

        this._offCtx!.putImageData(this._img!, 0, 0);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = Math.max(0, Math.min(1, this._o.opacity));
        ctx.drawImage(this._off!, 0, 0);
        ctx.restore();

        this.stats.drawnRuns = drawn;
        this.stats.lastDrawMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - tStart;
    }

    private _ensureBuffer(W: number, H: number): Uint32Array {
        if (!this._off) {
            this._off = document.createElement('canvas');
            this._offCtx = this._off.getContext('2d');
        }
        if (this._off.width !== W || this._off.height !== H || !this._img || !this._px) {
            this._off.width = W;
            this._off.height = H;
            this._img = this._offCtx!.createImageData(W, H);
            this._px = new Uint32Array(this._img.data.buffer);
        }
        return this._px;
    }

    destroy(): void {
        this._gen++;
        if (this._ensureTimer !== null) clearTimeout(this._ensureTimer);
        this._ensureTimer = null;
        this._clearRetry();
        if (this._pollTimer !== null) clearInterval(this._pollTimer);
        this._pollTimer = null;
        this._cells = null;
        this._colorIdx = null;
        this._img = null;
        this._px = null;
        this._off = null;
        this._offCtx = null;
        super.destroy();
    }
}

// --- Payload -> cells -----------------------------------------------------------

/**
 * Decode q -> v = (q/255)^2 * scale and combine long+short runs of the same price bin by summing
 * values over the time axis (runs of one side never overlap; the two sides are merged on their
 * union of breakpoints).
 */
function buildCells(resp: LiqHeatmapResponse): Cells {
    const scale = resp.scale;
    const size = resp.bin_size;
    const dec = (q: number): number => { const r = q / 255; return r * r * scale; };

    type Run = [number, number, number];
    const byBin = new Map<number, { p: number; a: Run[]; b: Run[] }>();
    for (const bin of resp.bins) {
        if (!bin || !Array.isArray(bin.runs) || typeof bin.p !== 'number') continue;
        const k = Math.round(bin.p / size);
        let e = byBin.get(k);
        if (!e) { e = { p: bin.p, a: [], b: [] }; byBin.set(k, e); }
        const target = bin.side === 'short' ? e.b : e.a;
        for (const r of bin.runs) target.push(r);
    }

    const T0: number[] = [], T1: number[] = [], V: number[] = [], B: number[] = [];
    const binP: number[] = [];
    const emit = (bi: number, t0: number, t1: number, v: number): void => {
        if (!(v > 0) || !(t1 > t0)) return;
        const last = T0.length - 1;
        if (last >= 0 && B[last] === bi && T1[last] === t0 && Math.abs(V[last] - v) <= v * 1e-6) { T1[last] = t1; return; }
        T0.push(t0); T1.push(t1); V.push(v); B.push(bi);
    };
    const byT0 = (x: Run, y: Run): number => x[0] - y[0];

    for (const e of byBin.values()) {
        const bi = binP.length;
        binP.push(e.p);
        const A = e.a.sort(byT0), Bs = e.b.sort(byT0);
        if (Bs.length === 0 || A.length === 0) {
            for (const r of (A.length ? A : Bs)) emit(bi, r[0], r[1], dec(r[2]));
            continue;
        }
        const pts = new Set<number>();
        for (const r of A) { pts.add(r[0]); pts.add(r[1]); }
        for (const r of Bs) { pts.add(r[0]); pts.add(r[1]); }
        const bp = Array.from(pts).sort((x, y) => x - y);
        let ia = 0, ib = 0;
        for (let k = 0; k < bp.length - 1; k++) {
            const s = bp[k];
            while (ia < A.length && A[ia][1] <= s) ia++;
            while (ib < Bs.length && Bs[ib][1] <= s) ib++;
            let v = 0;
            if (ia < A.length && A[ia][0] <= s) v += dec(A[ia][2]);
            if (ib < Bs.length && Bs[ib][0] <= s) v += dec(Bs[ib][2]);
            emit(bi, s, bp[k + 1], v);
        }
    }

    const n = T0.length;
    const v = Float32Array.from(V);
    const sorted = Float32Array.from(v).sort();
    return {
        n,
        t0: Float64Array.from(T0),
        t1: Float64Array.from(T1),
        bin: Uint32Array.from(B),
        v,
        binP: Float64Array.from(binP),
        binSize: size,
        sorted,
    };
}
