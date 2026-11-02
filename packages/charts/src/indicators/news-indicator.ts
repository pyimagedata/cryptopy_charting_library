// Haberler (News) katmani: haber akisini ana panelin altindaki olay seridinde
// (TradingView "events" satiri gibi) mumlara hizalanmis isaretler olarak cizer.
// Veri backend'den gelir (host `NewsIndicator.defaultProvider` ile istegi yapar,
// oturum/uyelik orada kontrol edilir); burada yalnizca onbellek, kumeleme ve cizim var.

import { OverlayIndicator } from './indicator';
import { BarData } from '../model/data';
import { RemoteContext, barTimeMs } from './remote-compute';
import { IndicatorLegendInfo } from './legend-info';

export type NewsFilter = 'all' | 'featured' | 'high';

export interface NewsIndicatorOptions {
    name: string;
    filter: NewsFilter;
    relevant: boolean;
    breaking: boolean;
    showVerticalLines: boolean;
    bullishColor: string;
    bearishColor: string;
    neutralColor: string;
    visible: boolean;
}

const defaultNewsOptions: NewsIndicatorOptions = {
    name: 'Haberler',
    filter: 'all',
    relevant: false,
    breaking: false,
    showVerticalLines: false,
    bullishColor: '#26a69a',
    bearishColor: '#ef5350',
    neutralColor: '#9598a1',
    visible: true,
};

export interface NewsItem {
    id: string | number;
    t: number;
    status?: string;
    featured?: boolean;
    breaking?: boolean;
    title?: string;
    title_en?: string;
    importance?: string | number | null;
    summary?: string;
    dir?: string | null;
    directions?: Record<string, unknown>;
    labels?: string[];
    link?: string;
}

export interface NewsResponse {
    symbol?: string;
    asset?: string | null;
    items: NewsItem[];
    truncated?: boolean;
}

export interface NewsQuery {
    symbol: string;
    from: number;
    to: number;
    filter: NewsFilter;
    relevant: boolean;
    breaking: boolean;
    limit: number;
}

/** Host-supplied fetcher. Throw an Error with `status` 401/403 when access is denied; return null for "no data". */
export type NewsProvider = (query: NewsQuery) => Promise<NewsResponse | null>;

const LIMIT = 3000;
const ENSURE_DEBOUNCE_MS = 300;
const POLL_MS = 60_000;
const MIN_MARKER_GAP = 12;
const BREAKING_COLOR = '#ff9800';
const MAX_CARD_ITEMS = 6;
const MAX_PAGES = 5;

type Dir = 'bull' | 'bear' | 'neutral';

interface Cluster {
    /** Representative bar index (first merged bar). */
    index: number;
    /** x of the marker in CSS px (average of merged bars). */
    x: number;
    items: NewsItem[]; // newest first
    dir: Dir;
    featured: boolean;
    breaking: boolean;
}

interface HitMarker {
    x: number;
    y: number;
    r: number;
    cluster: Cluster;
}

function itemDir(it: NewsItem): Dir | null {
    const m = typeof it.dir === 'string' ? DIR_MAP[it.dir] : undefined;
    return m && m.kind !== 'neutral' ? m.kind : null;
}

function aggregateDir(items: NewsItem[]): Dir {
    let bull = 0, bear = 0;
    for (const it of items) {
        const d = itemDir(it);
        if (d === 'bull') bull++;
        else if (d === 'bear') bear++;
    }
    if (bull > bear) return 'bull';
    if (bear > bull) return 'bear';
    return 'neutral';
}

function rgba(color: string, alpha: number): string {
    const hex = color.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return color;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function importanceInfo(v: string | number | null | undefined): { label: string; color: string; strong?: boolean } | null {
    if (typeof v !== 'string') return null;
    switch (v.toUpperCase()) {
        case 'CRITICAL': return { label: 'Kritik', color: '#d50000', strong: true };
        case 'HIGH': return { label: 'Yüksek', color: '#ef5350' };
        case 'MEDIUM': return { label: 'Orta', color: '#ff9800' };
        case 'LOW': return { label: 'Düşük', color: '#9598a1' };
        default: return null;
    }
}

const DIR_MAP: Record<string, { label: string; kind: Dir }> = {
    STRONG_BULLISH: { label: '↑↑ güçlü', kind: 'bull' },
    BULLISH: { label: '↑', kind: 'bull' },
    SLIGHT_BULLISH: { label: '↑ hafif', kind: 'bull' },
    NEUTRAL: { label: 'Nötr', kind: 'neutral' },
    SLIGHT_BEARISH: { label: '↓ hafif', kind: 'bear' },
    BEARISH: { label: '↓', kind: 'bear' },
    STRONG_BEARISH: { label: '↓↓ güçlü', kind: 'bear' },
};

function dirLabel(dir: string | null | undefined): { label: string; kind: Dir } | null {
    return typeof dir === 'string' ? DIR_MAP[dir] ?? null : null;
}

function safeLink(link: string | undefined): string | null {
    if (!link) return null;
    return /^https?:\/\//i.test(link) ? link : null;
}

interface Covered { a: number; b: number }

export class NewsIndicator extends OverlayIndicator {
    /** Host sets this once (page script), like SpecialForcesIndicator providers. */
    static defaultProvider: NewsProvider | null = null;

    private _ctx: RemoteContext | null = null;
    private _items = new Map<string | number, NewsItem>();
    private _covered: Covered[] = [];
    private _byBar = new Map<number, NewsItem[]>();
    private _gen = 0;
    private _inFlight = false;
    private _again = false;
    private _denied: 401 | 403 | null = null;
    private _truncated = false;
    private _ensureTimer: ReturnType<typeof setTimeout> | null = null;
    private _pollTimer: ReturnType<typeof setInterval> | null = null;
    private _want: { from: number; to: number; latest: boolean } | null = null;
    private _visIdx: { from: number; to: number } | null = null;
    private _latestVisible = false;
    private _warned = false;
    private _pages = 0;
    private _retryAt = 0;
    private _retryDelay = 0;
    private _retryTimer: ReturnType<typeof setTimeout> | null = null;
    private _unknownSymbol = false;
    private _wantKey = '';

    // Interaction
    private _hits: HitMarker[] = [];
    private _canvas: HTMLCanvasElement | null = null;
    private _hover: Cluster | null = null;
    private _pinned: Cluster | null = null;
    private _hoverIndex = -1;
    private _pinnedIndex = -1;
    private _card: HTMLDivElement | null = null;
    private _cardKey = '';
    private _tz = '';
    private _downPos: { x: number; y: number } | null = null;

    private readonly _onMove = (e: MouseEvent) => this._handleMove(e);
    private readonly _onLeave = () => this._handleLeave();
    private readonly _onClick = (e: MouseEvent) => this._handleClick(e);
    private readonly _onCanvasDown = (e: MouseEvent) => { this._downPos = { x: e.clientX, y: e.clientY }; };
    private readonly _onDocDown = (e: MouseEvent) => this._handleDocDown(e);
    private readonly _onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this._unpin(); };

    constructor(options: Partial<NewsIndicatorOptions> = {}) {
        super({ ...defaultNewsOptions, ...options } as any);
        this._pollTimer = setInterval(() => this._poll(), POLL_MS);
    }

    private get _o(): NewsIndicatorOptions {
        return this._options as unknown as NewsIndicatorOptions;
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
                            type: 'select', key: 'filter', label: 'Filtre', defaultValue: 'all',
                            options: [
                                { value: 'all', label: 'Tümü' },
                                { value: 'featured', label: 'Öne Çıkanlar' },
                                { value: 'high', label: 'Önem ≥ Yüksek' },
                            ],
                        },
                        { type: 'checkbox', key: 'relevant', label: 'Sadece bu sembolle ilgili', defaultValue: false },
                        { type: 'checkbox', key: 'breaking', label: 'Sadece son dakika', defaultValue: false },
                        { type: 'checkbox', key: 'showVerticalLines', label: 'Dikey çizgi göster', defaultValue: false },
                    ] }],
                },
                {
                    id: 'style', label: 'Style', sections: [{ rows: [
                        { type: 'color', key: 'bullishColor', label: 'Yükseliş rengi', defaultValue: this._o.bullishColor },
                        { type: 'color', key: 'bearishColor', label: 'Düşüş rengi', defaultValue: this._o.bearishColor },
                        { type: 'color', key: 'neutralColor', label: 'Nötr rengi', defaultValue: this._o.neutralColor },
                    ] }],
                },
            ],
        };
    }

    setSettingValue(key: string, value: any): boolean {
        const old = (this._options as any)[key];
        if (old === value) return false;
        (this._options as any)[key] = value;
        if (key === 'filter' || key === 'relevant' || key === 'breaking') {
            // Sunucu tarafinda suzuldugu icin onbellek gecersiz: bastan iste.
            this._resetData();
            this._denied = null;
            this._scheduleEnsure();
        }
        this._hide();
        this._dataChanged.fire();
        return false;
    }

    /** chart-widget her veri guncellemesinden once cagirir. */
    setContext(ctx: RemoteContext): void {
        const prev = this._ctx;
        this._ctx = ctx;
        if (!prev || prev.symbol !== ctx.symbol || (prev.exchange ?? '') !== (ctx.exchange ?? '')) {
            this._resetData();
            this._denied = null;
            this._hide();
            this._scheduleEnsure();
        }
        if (prev && prev.end !== ctx.end) {
            this._rebuild();
            this._hide();
        }
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._rebuild();
    }

    setVisible(visible: boolean): void {
        if (!visible) this._hide();
        super.setVisible(visible);
    }

    getRange(): { min: number; max: number } {
        // Fiyat olcegini etkilemez.
        return { min: 0, max: 100 };
    }

    private _statusText(): string {
        if (this._denied === 401) return 'giriş gerekli';
        if (this._denied === 403) return 'premium gerekli';
        const n = this._visibleCount();
        return `${n} (görünen aralık)${this._truncated ? ' - çok fazla haber — filtreyi daralt' : ''}`;
    }

    getDescription(): string {
        return `Haberler: ${this._statusText()}`;
    }

    getLegendInfo(): IndicatorLegendInfo {
        return { title: 'Haberler', params: [this._statusText()], plots: [] };
    }

    private _visibleCount(): number {
        if (!this._visIdx) return 0;
        let n = 0;
        for (let i = this._visIdx.from; i <= this._visIdx.to; i++) n += this._byBar.get(i)?.length ?? 0;
        return n;
    }

    // --- Data ---------------------------------------------------------------

    private _resetData(): void {
        this._gen++;
        this._items.clear();
        this._covered = [];
        this._truncated = false;
        this._inFlight = false;
        this._again = false;
        this._byBar = new Map();
        this._warned = false;
        this._pages = 0;
        this._clearRetry();
        this._unknownSymbol = false;
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
        return this._denied !== null || this._unknownSymbol || Date.now() < this._retryAt;
    }

    private _cutoff(): number {
        const end = this._ctx?.end;
        return end === undefined ? Infinity : end;
    }

    /** Item t -> bar index (bar whose [open, next open) contains t); -1 when before the first bar. */
    private _rebuild(): void {
        const bars = this._sourceData;
        const map = new Map<number, NewsItem[]>();
        this._byBar = map;
        if (bars.length === 0 || this._items.size === 0) return;
        const times = new Array<number>(bars.length);
        for (let i = 0; i < bars.length; i++) times[i] = barTimeMs(bars[i]);
        const cutoff = this._cutoff();
        const lastIdx = times.length - 1;
        const lastEnd = times[lastIdx] + this._barMs();
        const sorted = Array.from(this._items.values()).sort((a, b) => b.t - a.t); // newest first
        for (const it of sorted) {
            if (!(it.t < cutoff)) continue;
            if (it.t < times[0]) continue;
            let lo = 0, hi = times.length - 1;
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                if (times[mid] <= it.t) lo = mid; else hi = mid - 1;
            }
            if (lo === lastIdx && it.t >= lastEnd) continue; // henüz oluşmamış muma ait
            let arr = map.get(lo);
            if (!arr) { arr = []; map.set(lo, arr); }
            arr.push(it);
        }
    }

    private _barMs(): number {
        const b = this._sourceData;
        if (b.length >= 2) {
            const d = barTimeMs(b[b.length - 1]) - barTimeMs(b[b.length - 2]);
            if (d > 0) return d;
        }
        return 60_000;
    }

    private _missing(from: number, to: number): [number, number] | null {
        const gaps: Array<[number, number]> = [];
        let cur = from;
        for (const c of this._covered) {
            if (c.b < cur) continue;
            if (c.a > to) break;
            if (c.a > cur) gaps.push([cur, c.a]);
            cur = Math.max(cur, c.b);
            if (cur >= to) break;
        }
        if (cur < to) gaps.push([cur, to]);
        if (gaps.length === 0) return null;
        return [gaps[0][0], gaps[gaps.length - 1][1]];
    }

    private _addCovered(a: number, b: number): void {
        if (!(b > a)) return;
        const all = [...this._covered, { a, b }].sort((x, y) => x.a - y.a);
        const out: Covered[] = [];
        for (const c of all) {
            const last = out[out.length - 1];
            if (last && c.a <= last.b) last.b = Math.max(last.b, c.b);
            else out.push({ ...c });
        }
        this._covered = out;
    }

    private _scheduleEnsure(): void {
        if (this._ensureTimer !== null) return; // throttle: replay/scroll redraws must not starve it
        this._ensureTimer = setTimeout(() => {
            this._ensureTimer = null;
            this._ensure();
        }, ENSURE_DEBOUNCE_MS);
    }

    private _ensure(): void {
        const want = this._want;
        if (!want || this._blocked() || !NewsIndicator.defaultProvider || !this._ctx) return;
        let { from, to } = want;
        const cutoff = this._cutoff();
        if (cutoff !== Infinity) to = Math.min(to, cutoff - 1);
        if (!(to > from)) return;
        const gap = this._missing(from, to);
        if (!gap) return;
        void this._fetch(gap[0], gap[1]);
    }

    private async _fetch(from: number, to: number): Promise<void> {
        const provider = NewsIndicator.defaultProvider;
        const ctx = this._ctx;
        if (!provider || !ctx) return;
        if (this._inFlight) { this._again = true; return; }
        this._inFlight = true;
        const gen = this._gen;
        let pageAgain = false;
        try {
            const resp = await provider({
                symbol: ctx.symbol, from, to,
                filter: this._o.filter, relevant: !!this._o.relevant, breaking: !!this._o.breaking, limit: LIMIT,
            });
            if (gen !== this._gen) return;
            if (resp && Array.isArray(resp.items)) {
                let added = 0;
                let minT = Infinity;
                for (const it of resp.items) {
                    if (!it || typeof it.t !== 'number') continue;
                    if (!this._items.has(it.id)) added++;
                    this._items.set(it.id, it);
                    if (it.t < minT) minT = it.t;
                }
                if (resp.truncated && minT !== Infinity && minT > from) {
                    // Sunucu aralığın EN SON `limit` haberini verir: yalnızca [minT, to] kapsandı,
                    // eski kısım sonraki sayfada istenir (sayfa sayısı sınırlı, yeni öğe yoksa dur).
                    this._pages++;
                    if (added === 0 || this._pages >= MAX_PAGES) {
                        this._truncated = true;
                        this._addCovered(from, to);
                    } else {
                        this._addCovered(minT, to);
                        pageAgain = true;
                    }
                } else {
                    this._truncated = false;
                    this._addCovered(from, to);
                }
                this._clearRetry();
                this._rebuild();
            } else {
                this._backoff();
            }
        } catch (error) {
            if (gen !== this._gen) return;
            const status = (error as { status?: number } | null)?.status;
            if (status === 401 || status === 403) this._denied = status;
            else if (status === 404) {
                // Bilinmeyen sembol: boş say, yeniden deneme yok (sembol değişince sıfırlanır).
                this._unknownSymbol = true;
                this._addCovered(from, to);
            } else {
                this._backoff();
                if (!this._warned) {
                    this._warned = true;
                    console.warn('NewsIndicator: haberler alınamadı', error);
                }
            }
        } finally {
            if (gen === this._gen) {
                this._inFlight = false;
                this._dataChanged.fire();
                if (this._again || pageAgain) { this._again = false; this._scheduleEnsure(); }
            }
        }
    }

    private _poll(): void {
        if (this._blocked() || !NewsIndicator.defaultProvider || !this._ctx) return;
        if (this._ctx.end !== undefined || !this._latestVisible || this._sourceData.length === 0) return;
        let last = 0;
        for (const it of this._items.values()) if (it.t > last) last = it.t;
        const from = last > 0 ? last : barTimeMs(this._sourceData[this._sourceData.length - 1]);
        void this._fetch(from, Date.now() + POLL_MS);
    }

    // --- Drawing --------------------------------------------------------------

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, _priceScale: any, hpr: number, vpr: number): void {
        const bars = this._sourceData;
        this._attach(ctx.canvas);
        this._tz = timeScale.timeMarks?.timezone ?? '';
        this._hits = [];
        if (bars.length === 0) return;
        const vr = timeScale.visibleRange();
        if (!vr) return;
        const iFrom = Math.max(0, Math.floor(vr.from as number));
        const iTo = Math.min(bars.length - 1, Math.ceil(vr.to as number));
        if (!(iFrom <= iTo) || iTo < 0 || iFrom > bars.length - 1) {
            this._visIdx = null;
            this._latestVisible = false;
            this._syncCard();
            return;
        }
        this._visIdx = { from: iFrom, to: iTo };
        this._latestVisible = iTo >= bars.length - 1;

        // Istenen zaman araligi (+ kenar payi)
        const t0 = barTimeMs(bars[iFrom]);
        const interval = this._barMs();
        const t1 = barTimeMs(bars[iTo]) + interval;
        const margin = (t1 - t0) * 0.25;
        this._want = { from: Math.max(0, t0 - margin), to: t1 + (this._latestVisible ? 0 : margin), latest: this._latestVisible };
        const wantKey = `${Math.round(this._want.from)}|${Math.round(this._want.to)}`;
        if (wantKey !== this._wantKey) { this._wantKey = wantKey; this._pages = 0; this._truncated = false; }
        if (!this._blocked() && NewsIndicator.defaultProvider) {
            const to = this._cutoff() === Infinity ? this._want.to : Math.min(this._want.to, this._cutoff() - 1);
            if (to > this._want.from && this._missing(this._want.from, to)) this._scheduleEnsure();
        }

        if (this._denied !== null || this._byBar.size === 0) {
            this._syncCard();
            return;
        }

        // Mum bazinda kume -> dar mumlarda komsu kumeleri birlestir
        const barsSorted: Cluster[] = [];
        for (let i = iFrom; i <= iTo; i++) {
            const items = this._byBar.get(i);
            if (!items) continue;
            const x = timeScale.indexToCoordinate(i as any) as number;
            barsSorted.push({ index: i, x, items: items.slice(), dir: 'neutral', featured: false, breaking: false });
        }
        const merged: Cluster[] = [];
        let groupXs: number[] = [];
        for (const c of barsSorted) {
            const last = merged[merged.length - 1];
            if (last && c.x - groupXs[0] < MIN_MARKER_GAP) {
                last.items = last.items.concat(c.items);
                groupXs.push(c.x);
                last.x = groupXs.reduce((s, v) => s + v, 0) / groupXs.length;
            } else {
                merged.push(c);
                groupXs = [c.x];
            }
        }
        for (const c of merged) {
            c.items.sort((a, b) => b.t - a.t);
            c.dir = aggregateDir(c.items);
            c.featured = c.items.some(i => !!i.featured);
            c.breaking = c.items.some(i => !!i.breaking);
        }

        // Fare/sabit durumdaki kumeleri yeni kumelerle esle (indeks ile)
        this._hover = this._hoverIndex >= 0 ? this._findByIndex(merged, this._hoverIndex) : null;
        this._pinned = this._pinnedIndex >= 0 ? this._findByIndex(merged, this._pinnedIndex) : null;

        const mediaH = ctx.canvas.height / vpr;
        const mediaW = ctx.canvas.width / hpr;
        const r = 7;
        const cy = mediaH - 8 - r - 2;
        ctx.save();
        for (const c of merged) {
            if (c.x < -r * 2 || c.x > mediaW + r * 2) continue;
            const active = c === this._hover || c === this._pinned;
            if (this._o.showVerticalLines || active) {
                ctx.save();
                ctx.strokeStyle = this.isDark ? 'rgba(178,181,190,0.45)' : 'rgba(80,84,96,0.45)';
                ctx.lineWidth = Math.max(1, hpr);
                ctx.setLineDash([3 * hpr, 3 * hpr]);
                ctx.beginPath();
                const lx = Math.round(c.x * hpr) + 0.5;
                ctx.moveTo(lx, (cy - r - 4) * vpr);
                ctx.lineTo(lx, 0);
                ctx.stroke();
                ctx.restore();
            }
            this._drawMarker(ctx, c, c.x * hpr, cy * vpr, r, hpr, vpr, active);
            this._hits.push({ x: c.x, y: cy, r: r + 4, cluster: c });
        }
        ctx.restore();
        this._syncCard();
    }

    private _findByIndex(list: Cluster[], index: number): Cluster | null {
        // Birlesmis kume ilk mum indeksiyle tanimlanir; yakin kumeyi de kabul et
        for (const c of list) if (c.index === index) return c;
        return null;
    }

    private _colorOf(dir: Dir): string {
        return dir === 'bull' ? this._o.bullishColor : dir === 'bear' ? this._o.bearishColor : this._o.neutralColor;
    }

    private _drawMarker(ctx: CanvasRenderingContext2D, c: Cluster, x: number, y: number, r: number, hpr: number, vpr: number, active: boolean): void {
        const color = this._colorOf(c.dir);
        const rx = r * hpr, ry = r * vpr;
        ctx.save();
        ctx.setLineDash([]);
        if (c.breaking) {
            ctx.strokeStyle = BREAKING_COLOR;
            ctx.lineWidth = 1.5 * hpr;
            ctx.beginPath();
            ctx.ellipse(x, y, rx + 3 * hpr, ry + 3 * vpr, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        if (active) {
            ctx.fillStyle = rgba(color, 0.22);
            ctx.beginPath();
            ctx.ellipse(x, y, rx + 5 * hpr, ry + 5 * vpr, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.beginPath();
        if (c.dir === 'bull') {
            ctx.moveTo(x, y - ry);
            ctx.lineTo(x + rx, y + ry * 0.8);
            ctx.lineTo(x - rx, y + ry * 0.8);
            ctx.closePath();
        } else if (c.dir === 'bear') {
            ctx.moveTo(x, y + ry);
            ctx.lineTo(x + rx, y - ry * 0.8);
            ctx.lineTo(x - rx, y - ry * 0.8);
            ctx.closePath();
        } else {
            ctx.ellipse(x, y, rx * 0.85, ry * 0.85, 0, 0, Math.PI * 2);
        }
        if (c.featured) {
            ctx.fillStyle = color;
            ctx.fill();
        } else {
            ctx.fillStyle = rgba(color, 0.18);
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5 * hpr;
            ctx.lineJoin = 'round';
            ctx.stroke();
        }
        if (c.items.length > 1) {
            const bx = x + rx * 0.85, by = y - ry * 0.95;
            const br = 6 * hpr;
            ctx.fillStyle = this.isDark ? '#2a2e39' : '#ffffff';
            ctx.strokeStyle = color;
            ctx.lineWidth = 1 * hpr;
            ctx.beginPath();
            ctx.ellipse(bx, by, br, 6 * vpr, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = this.isDark ? '#d1d4dc' : '#131722';
            ctx.font = `bold ${8 * hpr}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(c.items.length > 99 ? '99+' : String(c.items.length), bx, by + 0.5 * vpr);
        }
        ctx.restore();
    }

    // --- Interaction ------------------------------------------------------------

    private _attach(canvas: HTMLCanvasElement): void {
        if (this._canvas === canvas) return;
        this._detach();
        this._canvas = canvas;
        canvas.addEventListener('mousemove', this._onMove);
        canvas.addEventListener('mouseleave', this._onLeave);
        canvas.addEventListener('mousedown', this._onCanvasDown);
        canvas.addEventListener('click', this._onClick);
    }

    private _detach(): void {
        const c = this._canvas;
        if (c) {
            c.removeEventListener('mousemove', this._onMove);
            c.removeEventListener('mouseleave', this._onLeave);
            c.removeEventListener('mousedown', this._onCanvasDown);
            c.removeEventListener('click', this._onClick);
            if (c.style.cursor === 'pointer') c.style.cursor = '';
        }
        this._canvas = null;
    }

    private _hitAt(e: MouseEvent): HitMarker | null {
        const canvas = this._canvas;
        if (!canvas || !this.shown) return null;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        let best: HitMarker | null = null;
        let bestD = Infinity;
        for (const h of this._hits) {
            const d = Math.hypot(x - h.x, y - h.y);
            if (d <= h.r && d < bestD) { best = h; bestD = d; }
        }
        return best;
    }

    private _handleMove(e: MouseEvent): void {
        const hit = this._hitAt(e);
        if (this._canvas) this._canvas.style.cursor = hit ? 'pointer' : '';
        const next = hit ? hit.cluster : null;
        const nextIdx = next ? next.index : -1;
        if (nextIdx !== this._hoverIndex) {
            this._hoverIndex = nextIdx;
            this._hover = next;
            this._dataChanged.fire();
        }
    }

    private _handleLeave(): void {
        if (this._canvas) this._canvas.style.cursor = '';
        if (this._hoverIndex !== -1) {
            this._hoverIndex = -1;
            this._hover = null;
            this._dataChanged.fire();
        }
    }

    private _handleClick(e: MouseEvent): void {
        const d = this._downPos;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return; // surukleme
        const hit = this._hitAt(e);
        if (!hit) return;
        this._pinnedIndex = hit.cluster.index;
        this._pinned = hit.cluster;
        document.addEventListener('mousedown', this._onDocDown, true);
        document.addEventListener('keydown', this._onKey, true);
        this._dataChanged.fire();
    }

    private _handleDocDown(e: MouseEvent): void {
        if (this._card && e.target instanceof Node && this._card.contains(e.target)) return;
        if (e.target === this._canvas && this._hitAt(e)) return;
        this._unpin();
    }

    private _unpin(): void {
        document.removeEventListener('mousedown', this._onDocDown, true);
        document.removeEventListener('keydown', this._onKey, true);
        if (this._pinnedIndex === -1) return;
        this._pinnedIndex = -1;
        this._pinned = null;
        this._dataChanged.fire();
    }

    private _hide(): void {
        this._hoverIndex = -1;
        this._hover = null;
        this._pinnedIndex = -1;
        this._pinned = null;
        document.removeEventListener('mousedown', this._onDocDown, true);
        document.removeEventListener('keydown', this._onKey, true);
        this._removeCard();
    }

    private _removeCard(): void {
        if (this._card) {
            this._card.remove();
            this._card = null;
        }
        this._cardKey = '';
    }

    // --- Card ---------------------------------------------------------------------

    private _syncCard(): void {
        const pinned = this._pinned;
        const cluster = pinned ?? this._hover;
        const canvas = this._canvas;
        if (!cluster || !canvas || !this.shown) { this._removeCard(); return; }
        const hit = this._hits.find(h => h.cluster === cluster);
        if (!hit) { this._removeCard(); return; }
        const key = `${cluster.index}|${cluster.items.length}|${cluster.items[0]?.id}|${pinned ? 1 : 0}|${this.isDark ? 1 : 0}`;
        if (!this._card || this._cardKey !== key) {
            this._removeCard();
            this._card = this._buildCard(cluster, !!pinned);
            this._cardKey = key;
            document.body.appendChild(this._card);
        }
        const card = this._card;
        const rect = canvas.getBoundingClientRect();
        const cw = card.offsetWidth, ch = card.offsetHeight;
        let left = rect.left + hit.x - cw / 2;
        left = Math.max(rect.left + 4, Math.min(left, rect.right - cw - 4));
        let top = rect.top + hit.y - hit.r - ch - 6;
        if (top < rect.top + 4) top = Math.min(rect.bottom - ch - 4, rect.top + hit.y + hit.r + 6);
        card.style.left = `${Math.round(left)}px`;
        card.style.top = `${Math.round(Math.max(rect.top + 4, top))}px`;
    }

    private _fmtTime(ms: number): { time: string; day: string } {
        const opts = (extra: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => {
            try {
                return new Intl.DateTimeFormat('tr-TR', { ...extra, ...(this._tz ? { timeZone: this._tz } : {}) });
            } catch {
                return new Intl.DateTimeFormat('tr-TR', extra);
            }
        };
        const time = opts({ hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);
        const day = opts({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(ms);
        return { time, day };
    }

    private _buildCard(cluster: Cluster, pinned: boolean): HTMLDivElement {
        const dark = this.isDark;
        const fg = dark ? '#d1d4dc' : '#131722';
        const muted = dark ? '#8b90a0' : '#6a6d78';
        const card = document.createElement('div');
        card.style.cssText = [
            'position:fixed', 'z-index:2147483000', 'box-sizing:border-box', 'width:320px', 'max-width:92vw',
            `background:${dark ? '#1e222d' : '#ffffff'}`, `color:${fg}`,
            `border:1px solid ${dark ? '#363a45' : '#d0d3db'}`, 'border-radius:8px', 'padding:8px 10px',
            'box-shadow:0 6px 24px rgba(0,0,0,0.35)', 'font:12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
            `pointer-events:${pinned ? 'auto' : 'none'}`, 'left:0', 'top:0',
        ].join(';');
        const today = this._fmtTime(Date.now()).day;
        const shown = cluster.items.slice(0, MAX_CARD_ITEMS);
        shown.forEach((it, idx) => {
            const row = document.createElement('div');
            row.style.cssText = `padding:6px 0;${idx > 0 ? `border-top:1px solid ${dark ? '#2a2e39' : '#eceef2'};` : ''}`;

            const head = document.createElement('div');
            head.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:2px;flex-wrap:wrap';
            const f = this._fmtTime(it.t);
            const tm = document.createElement('span');
            tm.style.cssText = `color:${muted};font-variant-numeric:tabular-nums`;
            tm.textContent = f.day === today ? f.time : `${f.day.slice(0, 5)} ${f.time}`;
            head.appendChild(tm);
            const imp = importanceInfo(it.importance);
            if (imp) head.appendChild(this._chip(imp.label, imp.color, imp.strong));
            const dl = dirLabel(it.dir);
            if (dl) head.appendChild(this._chip(dl.label, dl.kind === 'bull' ? this._o.bullishColor : dl.kind === 'bear' ? this._o.bearishColor : this._o.neutralColor));
            if (it.breaking) head.appendChild(this._chip('Son dakika', BREAKING_COLOR));
            row.appendChild(head);

            const titleText = it.title || it.title_en || '';
            const link = safeLink(it.link);
            let title: HTMLElement;
            if (pinned && link) {
                const a = document.createElement('a');
                a.href = link;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.style.cssText = `color:${fg};text-decoration:none;cursor:pointer`;
                a.addEventListener('mouseenter', () => { a.style.textDecoration = 'underline'; });
                a.addEventListener('mouseleave', () => { a.style.textDecoration = 'none'; });
                title = a;
            } else {
                title = document.createElement('div');
            }
            title.style.cssText += ';display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:600;word-break:break-word';
            title.textContent = titleText;
            row.appendChild(title);

            if (it.summary) {
                const s = document.createElement('div');
                s.style.cssText = `color:${muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px`;
                s.textContent = it.summary;
                row.appendChild(s);
            }
            card.appendChild(row);
        });
        if (cluster.items.length > shown.length) {
            const more = document.createElement('div');
            more.style.cssText = `padding-top:4px;color:${muted}`;
            more.textContent = `+${cluster.items.length - shown.length} daha`;
            card.appendChild(more);
        }
        return card;
    }

    private _chip(text: string, color: string, strong = false): HTMLSpanElement {
        const s = document.createElement('span');
        if (strong) {
            s.style.cssText = `font-size:10px;line-height:14px;padding:0 5px;border-radius:7px;color:#fff;background:${color};font-weight:700;white-space:nowrap`;
            s.textContent = text;
            return s;
        }
        s.style.cssText = `font-size:10px;line-height:14px;padding:0 5px;border-radius:7px;color:${color};background:${rgba(color, 0.16)};border:1px solid ${rgba(color, 0.45)};white-space:nowrap`;
        s.textContent = text;
        return s;
    }

    destroy(): void {
        this._gen++;
        if (this._ensureTimer !== null) clearTimeout(this._ensureTimer);
        this._ensureTimer = null;
        this._clearRetry();
        if (this._pollTimer !== null) clearInterval(this._pollTimer);
        this._pollTimer = null;
        this._hide();
        this._detach();
        this._items.clear();
        this._byBar.clear();
        super.destroy();
    }
}
