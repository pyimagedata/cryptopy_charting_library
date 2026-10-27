/**
 * Nesne agaci satir modeli (saf fonksiyonlar, DOM yok): cizimler -> satirlar.
 * Siralama: en ustteki (en son cizilen) once; filtre etiket + cizim metni uzerinde.
 */

export const OBJECT_TREE_MAX_ROWS = 500;
const TEXT_MAX = 40;

/** Satir modelinin ihtiyac duydugu cizim alanlari (Drawing arayuzunun alt kumesi) */
export interface TreeDrawingLike {
    readonly id: string;
    readonly type: string;
    visible: boolean;
    locked: boolean;
    state?: string;
    style?: { text?: string };
}

export interface DrawingRow {
    id: string;
    type: string;
    label: string;
    icon: string;
    /** Cizimin kendi metni (Text icerigi vb.), kisaltilmis; yoksa '' */
    text: string;
    visible: boolean;
    locked: boolean;
    hiddenByInterval: boolean;
    selected: boolean;
}

export interface DrawingRowsResult {
    rows: DrawingRow[];
    /** Filtreden gecen toplam satir (kesmeden once) */
    total: number;
    /** Kesilen (gosterilmeyen) satir sayisi */
    hiddenMore: number;
}

export interface DrawingRowsOptions {
    filter?: string;
    cap?: number;
    labelFor: (type: string) => string;
    iconFor: (type: string) => string;
    isVisibleOnTimeframe: (d: TreeDrawingLike) => boolean;
    selectedId?: string | null;
}

/** Cizimin gosterilecek metni: tek satira indirilir ve kisaltilir (ham metin, HTML degil) */
export function drawingText(d: TreeDrawingLike): string {
    const raw = (d as { text?: unknown }).text ?? d.style?.text;
    if (typeof raw !== 'string') return '';
    const flat = raw.replace(/\s+/g, ' ').trim();
    return flat.length > TEXT_MAX ? `${flat.slice(0, TEXT_MAX - 1)}…` : flat;
}

export function matchesFilter(filter: string, ...parts: string[]): boolean {
    const f = filter.trim().toLocaleLowerCase();
    if (!f) return true;
    return parts.some((p) => p.toLocaleLowerCase().includes(f));
}

/** drawings: DrawingManager sirasi (ekleme sirasi = cizim sirasi). */
export function buildDrawingRows(drawings: readonly TreeDrawingLike[], opts: DrawingRowsOptions): DrawingRowsResult {
    const cap = opts.cap ?? OBJECT_TREE_MAX_ROWS;
    const filter = opts.filter ?? '';
    const rows: DrawingRow[] = [];
    let total = 0;
    for (let i = drawings.length - 1; i >= 0; i--) {
        const d = drawings[i];
        if (d.state === 'creating') continue; // yarim cizim
        const label = opts.labelFor(d.type);
        const text = drawingText(d);
        if (!matchesFilter(filter, label, text)) continue;
        total++;
        if (rows.length >= cap) continue;
        rows.push({
            id: d.id,
            type: d.type,
            label,
            icon: opts.iconFor(d.type),
            text,
            visible: d.visible,
            locked: d.locked,
            hiddenByInterval: !opts.isVisibleOnTimeframe(d),
            selected: opts.selectedId === d.id,
        });
    }
    return { rows, total, hiddenMore: total - rows.length };
}

/**
 * Surukle-birak: satir listesi (ustte en son cizilen) uzerindeki birakmayi cizim sirasi indeksine cevirir.
 * ids: cizim sirasi (0 = en alt). Sonuc: moveDrawingTo'ya verilecek konum; degisiklik yoksa null.
 * above: birakma hedef satirin ust yarisinda mi (ekranda ustte = cizimde daha sonra).
 */
export function dropIndex(ids: readonly string[], draggedId: string, targetId: string, above: boolean): number | null {
    if (draggedId === targetId) return null;
    const rest = ids.filter((id) => id !== draggedId);
    const p = rest.indexOf(targetId);
    if (p < 0 || !ids.includes(draggedId)) return null;
    const at = above ? p + 1 : p;
    return at === ids.indexOf(draggedId) ? null : at;
}

/** Cizim kimlik kumesi anahtari (silme onayinin gecerlilik kontrolu icin; sira onemli degil) */
export function drawingIdsKey(ids: readonly string[]): string {
    return [...ids].sort().join('|');
}

/** Gosterge satirini etkileyen durumun imzasi (ad + gorunurluk); canli tick'te gereksiz yeniden cizimi onler */
export function indicatorRowSignature(name: string, visible: boolean): string {
    return `${visible ? 1 : 0}:${name}`;
}
