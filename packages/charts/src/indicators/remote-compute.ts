import { BarData } from '../model/data';
import { t } from '../helpers/translations';

/**
 * Backend'de hesaplanan indikatörlerin ortak istemci tarafı.
 *
 * İndikatörün algoritması tarayıcı paketinde YOKTUR: hesap backend'de çalışır,
 * host sayfa `RemoteIndicators.defaultProvider` ile sonucu getirir, indikatör
 * sadece çizer. Backend giriş + üyelik ister: provider 401/403 için `status`
 * alanlı bir Error fırlatırsa indikatör boş kalmak yerine nedenini yazar.
 * Backend'in bilmediği sembol/timeframe için provider null döner: hiçbir şey çizilmez.
 */

export type RemoteIndicatorProvider = (
    indicatorId: string,
    symbol: string,
    exchange: string,
    timeframe: string,
    params: Record<string, unknown>
) => Promise<unknown | null>;

export class RemoteIndicators {
    static defaultProvider: RemoteIndicatorProvider | null = null;
}

export interface RemoteContext {
    symbol: string;
    timeframe: string;
    exchange?: string;
}

// Backend önbelleği 30 sn; aynı bağlam için bu süreden sık yeniden istenmez.
const REFRESH_MS = 30_000;
const DEBOUNCE_MS = 500;

/** Sunucudan gelen `times` dizisini (ms) dizindeki yerine eşleyen tablo; panel indikatörleri için. */
export function timeIndexMap(times: number[]): Map<number, number> {
    const map = new Map<number, number>();
    for (let i = 0; i < times.length; i++) map.set(times[i], i);
    return map;
}

export class RemoteCompute<T> {
    private static _nextSlot = 0;
    /** Yetki reddi yazısının satırı: birden çok indikatör yazılarını üst üste bindirmesin. */
    readonly noticeSlot = RemoteCompute._nextSlot++ % 8;

    private _ctx: RemoteContext | null = null;
    private _token = 0;
    private _inFlightKey: string | null = null;
    private _lastKey = '';
    private _lastAt = 0;
    private _timer: ReturnType<typeof setTimeout> | null = null;
    private _denied: 401 | 403 | null = null;

    constructor(
        private readonly _indicatorId: string,
        /** Yeni ham sonuç geldiğinde (ya da bağlam değişip sonuç silindiğinde: null). */
        private readonly _onResult: (raw: T | null) => void
    ) {}

    get denied(): 401 | 403 | null {
        return this._denied;
    }

    /** chart-widget her veri güncellemesinden önce çağırır. */
    setContext(ctx: RemoteContext): void {
        const changed =
            !this._ctx ||
            this._ctx.symbol !== ctx.symbol ||
            this._ctx.timeframe !== ctx.timeframe ||
            (this._ctx.exchange ?? '') !== (ctx.exchange ?? '');
        this._ctx = ctx;
        if (changed) {
            // Eski sembolün/timeframe'in sonucu yenisinin üstünde çizilmesin.
            this._lastKey = '';
            this._denied = null;
            this._token++;
            this._inFlightKey = null;
            this._onResult(null);
        }
    }

    /** Hesap parametreleri (yalnızca algoritmayı etkileyenler) ile sonucu ister; debounce'lu. */
    request(params: Record<string, unknown>, onDone: () => void): void {
        if (!this._ctx) return;
        if (this._timer !== null) clearTimeout(this._timer);
        this._timer = setTimeout(() => {
            this._timer = null;
            const ctx = this._ctx;
            if (!ctx) return;
            const key = `${ctx.symbol}|${ctx.exchange ?? ''}|${ctx.timeframe}|${JSON.stringify(params)}`;
            if (this._inFlightKey === key) return;
            if (this._lastKey === key && Date.now() - this._lastAt < REFRESH_MS) return;
            void this._fetch(key, ctx, params, onDone);
        }, DEBOUNCE_MS);
    }

    destroy(): void {
        if (this._timer !== null) clearTimeout(this._timer);
        this._timer = null;
        this._token++;
    }

    private async _fetch(key: string, ctx: RemoteContext, params: Record<string, unknown>, onDone: () => void): Promise<void> {
        const token = ++this._token;
        this._inFlightKey = key;
        let raw: T | null = null;
        let denied: 401 | 403 | null = null;
        try {
            const provider = RemoteIndicators.defaultProvider;
            if (provider) {
                raw = (await provider(this._indicatorId, ctx.symbol, ctx.exchange ?? '', ctx.timeframe, params)) as T | null;
            }
        } catch (error) {
            const status = (error as { status?: number } | null)?.status;
            if (status === 401 || status === 403) denied = status;
            else console.warn(`RemoteCompute(${this._indicatorId}): backend verisi alınamadı`, error);
        } finally {
            if (token === this._token) this._inFlightKey = null;
        }
        // Bağlam değişmişse (yeni istek başladı) eski istek sonucu yenisini ezmesin.
        if (token !== this._token) return;
        this._denied = denied;
        this._lastKey = key;
        this._lastAt = Date.now();
        this._onResult(raw);
        onDone();
    }
}

/**
 * Panel başlığı için varsayılan değer indeksi: istenen indeks yoksa son GEÇERLİ noktayı verir.
 * Oluşan (henüz kapanmamış) son mum sunucu verisinde olmadığından en son nokta boştur.
 */
export function legendIndex(points: ReadonlyArray<{ value: number }>, index?: number): number {
    if (index !== undefined && index >= 0 && index < points.length) return index;
    for (let i = points.length - 1; i >= 0; i--) {
        if (!Number.isNaN(points[i].value)) return i;
    }
    return points.length - 1;
}

export function barTimeMs(bar: BarData): number {
    return bar.time > 1e12 ? bar.time : bar.time * 1000;
}

/**
 * `timeMs`'e karşılık gelen mum index'i (sourceData zamana göre artan): tam
 * eşleşme ya da sonraki en yakın mum. Tüm mumlardan önceyse -1 döner (çizilmez).
 */
export function barIndexAtTime(data: BarData[], timeMs: number): number {
    if (data.length === 0 || barTimeMs(data[0]) > timeMs) return -1;
    let lo = 0;
    let hi = data.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (barTimeMs(data[mid]) < timeMs) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

/** Panel indikatörleri için: açıklama (legend) satırında gösterilecek yetki reddi metni (yoksa null). */
export function accessNoticeText(
    remote: { readonly denied: 401 | 403 | null },
    indicatorName: string
): string | null {
    if (remote.denied === null) return null;
    const message = remote.denied === 401 ? t('Sign in to use this indicator') : t('This indicator requires a PRO membership');
    return `${indicatorName}: ${message}`;
}

/** Yetki reddedilince grafikte nedeni gösteren kısa yazı (indikatör başına ayrı satır). */
export function drawAccessNotice(
    ctx: CanvasRenderingContext2D,
    hpr: number,
    vpr: number,
    remote: { readonly denied: 401 | 403 | null; readonly noticeSlot: number },
    indicatorName: string,
    color: string = '#FF5252'
): void {
    const denied = remote.denied;
    if (denied === null) return;
    ctx.save();
    ctx.font = `${12 * vpr}px sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    const message = denied === 401 ? t('Sign in to use this indicator') : t('This indicator requires a PRO membership');
    ctx.fillText(`${indicatorName}: ${message}`, 70 * hpr, (120 + 16 * remote.noticeSlot) * vpr);
    ctx.restore();
}
