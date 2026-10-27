/**
 * Izleme listesi modeli (DOM'suz): birden fazla liste, bolumler, bayraklar ve
 * localStorage kaliciligi. Panel sadece bu modeli cizer; node'da test edilebilir.
 */

import { ColumnVisibility, DEFAULT_COLUMNS, SortState, SortCol } from './watchlist_format';

export interface SymbolItem {
    type: 'symbol';
    key: string;
}

export interface SectionItem {
    type: 'section';
    id: string;
    title: string;
    collapsed: boolean;
}

export type WatchlistItem = SymbolItem | SectionItem;

export interface WatchlistData {
    id: string;
    name: string;
    items: WatchlistItem[];
}

export interface KeyValueStore {
    get(name: string): string | null;
    set(name: string, value: string): void;
}

export const LISTS_STORAGE = 'chart.watchlist.lists';
export const ACTIVE_STORAGE = 'chart.watchlist.active';
export const FLAGS_STORAGE = 'chart.watchlist.flags';
/** Eski tek-liste anahtari: sadece bir kez goc icin okunur. */
export const LEGACY_KEYS_STORAGE = 'chart.watchlist.keys';
export const SEEDED_STORAGE = 'chart.watchlist.seeded';
export const COLUMNS_STORAGE = 'chart.watchlist.columns';
export const SORT_STORAGE = 'chart.watchlist.sort';
export const DETAILS_STORAGE = 'chart.watchlist.details';
export const DETAILS_MIN = 96;
export const DETAILS_DEFAULT = 190;
export const FLAGGED_PREFIX = 'flag:';
export const DEFAULT_LIST_NAME = 'İzleme Listesi';

export const FLAG_COLORS: { id: string; label: string; hex: string }[] = [
    { id: 'red', label: 'Kırmızı', hex: '#f23645' },
    { id: 'blue', label: 'Mavi', hex: '#2962ff' },
    { id: 'green', label: 'Yeşil', hex: '#089981' },
    { id: 'orange', label: 'Turuncu', hex: '#ff9800' },
    { id: 'purple', label: 'Mor', hex: '#9c27b0' },
    { id: 'cyan', label: 'Camgöbeği', hex: '#00bcd4' },
    { id: 'pink', label: 'Pembe', hex: '#e91e63' },
];

export function flagHex(color: string): string {
    return FLAG_COLORS.find((f) => f.id === color)?.hex ?? FLAG_COLORS[0].hex;
}

export function itemId(item: WatchlistItem): string {
    return item.type === 'symbol' ? `s:${item.key}` : `c:${item.id}`;
}

export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
    const data = { ...initial };
    return {
        data,
        get: (n) => (n in data ? data[n] : null),
        set: (n, v) => {
            data[n] = v;
        },
    };
}

export function browserStore(): KeyValueStore {
    return {
        get(name) {
            try {
                return localStorage.getItem(name);
            } catch {
                return null;
            }
        },
        set(name, value) {
            try {
                localStorage.setItem(name, value);
            } catch {
                // Kaydedilemese de bu oturumda calisir.
            }
        },
    };
}

let _seq = 0;
function uid(prefix: string): string {
    _seq += 1;
    return `${prefix}${Date.now().toString(36)}${_seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

const SORT_COLS: SortCol[] = ['symbol', 'last', 'chg', 'chgPct', 'vol'];

function parseJson(raw: string | null): unknown {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function cleanItems(raw: unknown): WatchlistItem[] {
    const out: WatchlistItem[] = [];
    const seenKeys = new Set<string>();
    if (!Array.isArray(raw)) return out;
    for (const it of raw) {
        if (it && it.type === 'symbol' && typeof it.key === 'string' && !seenKeys.has(it.key)) {
            seenKeys.add(it.key);
            out.push({ type: 'symbol', key: it.key });
        } else if (it && it.type === 'section' && typeof it.id === 'string') {
            out.push({ type: 'section', id: it.id, title: String(it.title ?? ''), collapsed: !!it.collapsed });
        }
    }
    return out;
}

export class WatchlistModel {
    private readonly _store: KeyValueStore;
    private _lists: WatchlistData[] = [];
    private _activeId = '';
    private _flags: Record<string, string> = {};
    private _seeded = false;
    private _columns: ColumnVisibility = { ...DEFAULT_COLUMNS };
    private _sorts: Record<string, SortState> = {};
    private _details = { open: true, height: DETAILS_DEFAULT };

    constructor(store: KeyValueStore = browserStore()) {
        this._store = store;
        this._load();
    }

    // ---- Yukleme / kaydetme ----

    private _load(): void {
        const stored = parseJson(this._store.get(LISTS_STORAGE));
        if (Array.isArray(stored)) {
            for (const l of stored) {
                if (l && typeof l.id === 'string' && typeof l.name === 'string') {
                    this._lists.push({ id: l.id, name: l.name, items: cleanItems(l.items) });
                }
            }
        }
        this._seeded = this._store.get(SEEDED_STORAGE) === '1';
        if (this._lists.length === 0) this._migrate();
        const flags = parseJson(this._store.get(FLAGS_STORAGE));
        if (flags && typeof flags === 'object' && !Array.isArray(flags)) {
            for (const [k, v] of Object.entries(flags as Record<string, unknown>)) {
                if (typeof v === 'string' && FLAG_COLORS.some((f) => f.id === v)) this._flags[k] = v;
            }
        }
        this._loadPrefs();
        const active = this._store.get(ACTIVE_STORAGE) ?? '';
        this._activeId = this._isValidId(active) ? active : this._lists[0].id;
    }

    private _loadPrefs(): void {
        const cols = parseJson(this._store.get(COLUMNS_STORAGE)) as Record<string, unknown> | null;
        if (cols && typeof cols === 'object') {
            for (const k of ['chg', 'chgPct', 'vol'] as const) if (typeof cols[k] === 'boolean') this._columns[k] = cols[k] as boolean;
        }
        const sorts = parseJson(this._store.get(SORT_STORAGE)) as Record<string, { col?: unknown; dir?: unknown }> | null;
        if (sorts && typeof sorts === 'object' && !Array.isArray(sorts)) {
            for (const [id, v] of Object.entries(sorts)) {
                if (v && SORT_COLS.includes(v.col as SortCol) && (v.dir === 'asc' || v.dir === 'desc')) this._sorts[id] = { col: v.col as SortCol, dir: v.dir };
            }
        }
        const det = parseJson(this._store.get(DETAILS_STORAGE)) as { open?: unknown; height?: unknown } | null;
        if (det && typeof det === 'object') {
            if (typeof det.open === 'boolean') this._details.open = det.open;
            if (typeof det.height === 'number' && Number.isFinite(det.height) && det.height >= DETAILS_MIN) this._details.height = Math.round(det.height);
        }
    }

    /** Eski `chart.watchlist.keys` varsa varsayilan listeye tasir, yoksa bos liste (ilk veride tohumlanir). */
    private _migrate(): void {
        const legacy = parseJson(this._store.get(LEGACY_KEYS_STORAGE));
        const items: WatchlistItem[] = [];
        if (Array.isArray(legacy)) {
            for (const k of legacy) if (typeof k === 'string') items.push({ type: 'symbol', key: k });
            this._seeded = true;
        }
        this._lists = [{ id: uid('l'), name: DEFAULT_LIST_NAME, items: cleanItems(items) }];
        this._saveAll();
    }

    private _isValidId(id: string): boolean {
        if (id.startsWith(FLAGGED_PREFIX)) return FLAG_COLORS.some((f) => f.id === id.slice(FLAGGED_PREFIX.length));
        return this._lists.some((l) => l.id === id);
    }

    private _saveAll(): void {
        this._store.set(LISTS_STORAGE, JSON.stringify(this._lists));
        this._store.set(ACTIVE_STORAGE, this._activeId);
        this._store.set(SEEDED_STORAGE, this._seeded ? '1' : '0');
    }

    private _saveFlags(): void {
        this._store.set(FLAGS_STORAGE, JSON.stringify(this._flags));
    }

    // ---- Listeler ----

    get lists(): readonly WatchlistData[] {
        return this._lists;
    }

    get activeId(): string {
        return this._activeId;
    }

    get readOnly(): boolean {
        return this._activeId.startsWith(FLAGGED_PREFIX);
    }

    get activeName(): string {
        if (this.readOnly) {
            const c = FLAG_COLORS.find((f) => f.id === this._activeId.slice(FLAGGED_PREFIX.length));
            return `Bayrak: ${c?.label ?? ''}`;
        }
        return this._real().name;
    }

    /** Aktif gercek liste (bayrak gorunumundeyken ilk liste; degisiklikler zaten engellenir). */
    private _real(): WatchlistData {
        return this._lists.find((l) => l.id === this._activeId) ?? this._lists[0];
    }

    /** Aktif listenin ogeleri (bayrak gorunumunde bayrakli semboller). */
    get items(): readonly WatchlistItem[] {
        if (this.readOnly) {
            const color = this._activeId.slice(FLAGGED_PREFIX.length);
            return Object.keys(this._flags)
                .filter((k) => this._flags[k] === color)
                .map((key) => ({ type: 'symbol', key }) as SymbolItem);
        }
        return this._real().items;
    }

    setActive(id: string): boolean {
        if (!this._isValidId(id)) return false;
        this._activeId = id;
        this._saveAll();
        return true;
    }

    createList(name: string): string {
        const list: WatchlistData = { id: uid('l'), name: name.trim() || DEFAULT_LIST_NAME, items: [] };
        this._lists.push(list);
        this._activeId = list.id;
        this._seeded = true;
        this._saveAll();
        return list.id;
    }

    renameList(id: string, name: string): boolean {
        const l = this._lists.find((x) => x.id === id);
        const n = name.trim();
        if (!l || !n) return false;
        l.name = n;
        this._saveAll();
        return true;
    }

    copyList(id: string): string | null {
        const l = this._lists.find((x) => x.id === id);
        if (!l) return null;
        const copy: WatchlistData = {
            id: uid('l'),
            name: `${l.name} (kopya)`,
            items: l.items.map((it) => (it.type === 'section' ? { ...it, id: uid('c') } : { ...it })),
        };
        this._lists.splice(this._lists.indexOf(l) + 1, 0, copy);
        this._activeId = copy.id;
        this._saveAll();
        return copy.id;
    }

    clearList(id: string): boolean {
        const l = this._lists.find((x) => x.id === id);
        if (!l) return false;
        l.items = [];
        this._seeded = true;
        this._saveAll();
        return true;
    }

    /** Son liste silinirse yerine bos varsayilan liste acilir. */
    deleteList(id: string): boolean {
        const idx = this._lists.findIndex((x) => x.id === id);
        if (idx < 0) return false;
        this._lists.splice(idx, 1);
        if (this._sorts[id]) {
            delete this._sorts[id];
            this._store.set(SORT_STORAGE, JSON.stringify(this._sorts));
        }
        if (this._lists.length === 0) this._lists.push({ id: uid('l'), name: DEFAULT_LIST_NAME, items: [] });
        if (this._activeId === id) this._activeId = this._lists[Math.min(idx, this._lists.length - 1)].id;
        this._seeded = true;
        this._saveAll();
        return true;
    }

    /** Hic liste verisi kaydedilmediyse ilk gelen veriyle varsayilan liste doldurulur (eski davranis). */
    get needsSeed(): boolean {
        return !this._seeded;
    }

    seed(keys: string[]): void {
        if (this._seeded) return;
        this._seeded = true;
        const list = this._lists[0];
        if (list.items.length === 0) list.items = keys.map((key) => ({ type: 'symbol', key }));
        this._saveAll();
    }

    // ---- Ogeler (sadece gercek liste) ----

    has(key: string): boolean {
        return this.items.some((it) => it.type === 'symbol' && it.key === key);
    }

    addSymbol(key: string): boolean {
        if (this.readOnly || this.has(key)) return false;
        this._real().items.push({ type: 'symbol', key });
        this._saveAll();
        return true;
    }

    /** Verilen oge id'lerini (sembol veya bolum basligi) siler; bolum silinince satirlari kalir. */
    removeItems(ids: string[]): number {
        if (this.readOnly) return 0;
        const set = new Set(ids);
        const list = this._real();
        const before = list.items.length;
        list.items = list.items.filter((it) => !set.has(itemId(it)));
        this._saveAll();
        return before - list.items.length;
    }

    /** Bolum ekler; `index` verilmezse sona. Yeni bolumun id'sini dondurur. */
    addSection(title: string, index?: number): string {
        const list = this._real();
        const section: SectionItem = { type: 'section', id: uid('c'), title, collapsed: false };
        if (this.readOnly) return section.id;
        const at = index === undefined ? list.items.length : Math.max(0, Math.min(index, list.items.length));
        list.items.splice(at, 0, section);
        this._saveAll();
        return section.id;
    }

    indexOfItem(id: string): number {
        return this.items.findIndex((it) => itemId(it) === id);
    }

    private _section(id: string): SectionItem | undefined {
        if (this.readOnly) return undefined;
        return this._real().items.find((it): it is SectionItem => it.type === 'section' && it.id === id);
    }

    renameSection(id: string, title: string): boolean {
        const s = this._section(id);
        if (!s) return false;
        s.title = title.trim() || s.title;
        this._saveAll();
        return true;
    }

    toggleSection(id: string): boolean {
        const s = this._section(id);
        if (!s) return false;
        s.collapsed = !s.collapsed;
        this._saveAll();
        return true;
    }

    /** Daraltilmis bolumlerin altinda gizli kalan ogeler haric gorunen ogeler. */
    visibleItems(): WatchlistItem[] {
        const out: WatchlistItem[] = [];
        let hidden = false;
        for (const it of this.items) {
            if (it.type === 'section') {
                hidden = it.collapsed;
                out.push(it);
            } else if (!hidden) out.push(it);
        }
        return out;
    }

    /**
     * Ogeleri (liste sirasiyla) `beforeIndex` konumundan once yerlestirir. Bolum basligi
     * tasininca altindaki satirlar da (sonraki bolume kadar) birlikte gider.
     */
    moveItems(ids: string[], beforeIndex: number): boolean {
        if (this.readOnly) return false;
        const list = this._real();
        const want = new Set(ids);
        const moving = new Set<number>();
        let inBlock = false;
        list.items.forEach((it, i) => {
            if (it.type === 'section') {
                inBlock = want.has(itemId(it));
                if (inBlock) moving.add(i);
            } else if (want.has(itemId(it)) || inBlock) moving.add(i);
        });
        if (moving.size === 0) return false;
        const target = Math.max(0, Math.min(beforeIndex, list.items.length));
        const picked = [...moving].sort((a, b) => a - b).map((i) => list.items[i]);
        const before = [...moving].filter((i) => i < target).length;
        const rest = list.items.filter((_, i) => !moving.has(i));
        rest.splice(target - before, 0, ...picked);
        const changed = rest.some((it, i) => it !== list.items[i]);
        list.items = rest;
        if (changed) this._saveAll();
        return changed;
    }

    moveToTop(ids: string[]): boolean {
        return this.moveItems(ids, 0);
    }

    moveToBottom(ids: string[]): boolean {
        return this.moveItems(ids, this.items.length);
    }

    // ---- Gorunum tercihleri: sutunlar, siralama, ayrintilar ----

    get columns(): Readonly<ColumnVisibility> {
        return this._columns;
    }

    setColumn(id: keyof ColumnVisibility, on: boolean): void {
        this._columns[id] = on;
        this._store.set(COLUMNS_STORAGE, JSON.stringify(this._columns));
    }

    /** Aktif listenin (veya bayrak gorunumunun) siralamasi; null = elle sira. */
    get sort(): SortState | null {
        return this._sorts[this._activeId] ?? null;
    }

    setSort(sort: SortState | null): void {
        if (sort) this._sorts[this._activeId] = { col: sort.col, dir: sort.dir };
        else delete this._sorts[this._activeId];
        this._store.set(SORT_STORAGE, JSON.stringify(this._sorts));
    }

    get detailsOpen(): boolean {
        return this._details.open;
    }

    get detailsHeight(): number {
        return this._details.height;
    }

    setDetails(open: boolean, height?: number): void {
        this._details.open = open;
        if (height !== undefined && Number.isFinite(height)) this._details.height = Math.max(DETAILS_MIN, Math.round(height));
        this._store.set(DETAILS_STORAGE, JSON.stringify(this._details));
    }

    // ---- Bayraklar (sembol basina global) ----

    flagOf(key: string): string | null {
        return this._flags[key] ?? null;
    }

    setFlag(keys: string[], color: string | null): void {
        for (const k of keys) {
            if (color && FLAG_COLORS.some((f) => f.id === color)) this._flags[k] = color;
            else delete this._flags[k];
        }
        this._saveFlags();
    }

    /** Tiklanan sol kenar: bayrakliysa kaldirir, degilse kirmizi koyar. */
    toggleFlag(key: string): void {
        this.setFlag([key], this._flags[key] ? null : 'red');
    }

    flaggedCount(color: string): number {
        return Object.values(this._flags).filter((c) => c === color).length;
    }
}
