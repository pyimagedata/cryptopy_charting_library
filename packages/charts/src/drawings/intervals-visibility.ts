/**
 * Cizimlerin "zaman dilimlerinde gorunurluk" (visibility on intervals) ayarlari.
 * Veri her cizim nesnesinde istege bagli `intervalsVisibilities` alanidir (bkz. Drawing);
 * DrawingManager serialize/clone/paste/undo sirasinda bu alani tasir. Alan yoksa hepsi gorunur.
 */

export interface IntervalsVisibilities {
    ticks: boolean;
    seconds: boolean; secondsFrom: number; secondsTo: number;
    minutes: boolean; minutesFrom: number; minutesTo: number;
    hours: boolean; hoursFrom: number; hoursTo: number;
    days: boolean; daysFrom: number; daysTo: number;
    weeks: boolean; weeksFrom: number; weeksTo: number;
    months: boolean; monthsFrom: number; monthsTo: number;
    ranges: boolean;
}

export type IntervalUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months';

/** Kucukten buyuge zaman birimleri (ticks en altta, ranges zaman disi) */
export const INTERVAL_UNITS: IntervalUnit[] = ['seconds', 'minutes', 'hours', 'days', 'weeks', 'months'];

/** Birim basina izin verilen alt/ust sinir */
export const UNIT_BOUNDS: Record<IntervalUnit, { min: number; max: number }> = {
    seconds: { min: 1, max: 59 },
    minutes: { min: 1, max: 59 },
    hours: { min: 1, max: 24 },
    days: { min: 1, max: 366 },
    weeks: { min: 1, max: 52 },
    months: { min: 1, max: 12 },
};

export type IntervalsPreset = 'all' | 'current' | 'above' | 'below';

export function defaultIntervalsVisibilities(): IntervalsVisibilities {
    return {
        ticks: true,
        seconds: true, secondsFrom: 1, secondsTo: 59,
        minutes: true, minutesFrom: 1, minutesTo: 59,
        hours: true, hoursFrom: 1, hoursTo: 24,
        days: true, daysFrom: 1, daysTo: 366,
        weeks: true, weeksFrom: 1, weeksTo: 52,
        months: true, monthsFrom: 1, monthsTo: 12,
        ranges: true,
    };
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
    const n = typeof v === 'number' && isFinite(v) ? Math.round(v) : fallback;
    return Math.max(min, Math.min(max, n));
}

/** Eksik/bozuk alanlari varsayilanla doldurur, sinirlara kirpar, From <= To saglar */
export function normalizeIntervalsVisibilities(raw: unknown): IntervalsVisibilities {
    const out = defaultIntervalsVisibilities();
    if (!raw || typeof raw !== 'object') return out;
    const src = raw as Record<string, unknown>;
    if (typeof src.ticks === 'boolean') out.ticks = src.ticks;
    if (typeof src.ranges === 'boolean') out.ranges = src.ranges;
    for (const u of INTERVAL_UNITS) {
        const { min, max } = UNIT_BOUNDS[u];
        if (typeof src[u] === 'boolean') out[u] = src[u] as boolean;
        let from = clampInt(src[`${u}From`], min, max, min);
        let to = clampInt(src[`${u}To`], min, max, max);
        if (from > to) { const tmp = from; from = to; to = tmp; }
        out[`${u}From` as const] = from;
        out[`${u}To` as const] = to;
    }
    return out;
}

export function isDefaultIntervalsVisibilities(v: IntervalsVisibilities): boolean {
    const d = defaultIntervalsVisibilities();
    for (const k of Object.keys(d) as (keyof IntervalsVisibilities)[]) {
        if (v[k] !== d[k]) return false;
    }
    return true;
}

/** Cizimin alanini (yoksa varsayilanla olusturup) dondurur; UI bu nesneyi dogrudan degistirir */
export function ensureIntervalsVisibilities(drawing: { intervalsVisibilities?: IntervalsVisibilities }): IntervalsVisibilities {
    if (!drawing.intervalsVisibilities) drawing.intervalsVisibilities = defaultIntervalsVisibilities();
    return drawing.intervalsVisibilities;
}

// --- Zaman dilimi ayristirma ---

export type ParsedTimeframe =
    | { kind: 'ticks' }
    | { kind: 'ranges' }
    | { kind: IntervalUnit; mult: number };

/**
 * Zaman dilimi dizesini ayristirir. Buyuk/kucuk harf duyarli: 'm' dakika, 'M' ay.
 * Ornek: 1s, 30s, 5m, 90m, 2h, 1d / D, 1w / W, 1M / M / 1mo, yalin sayi = dakika (240 -> 4h), 100T (tick), 10R (range).
 * Kural: saniye <60 -> seconds; >=60 sn -> dakikaya cevrilir (floor); dakika <60 -> minutes;
 * >=60 dk -> hours = floor(dk/60). Taninmayan dize -> null (her zaman gorunur sayilir).
 */
export function parseTimeframe(tf: string | null | undefined): ParsedTimeframe | null {
    if (!tf) return null;
    const str = String(tf).trim();
    // Yalin sayi (60, 240, 1440): TradingView kurali, dakika
    const bare = str.match(/^(\d+)$/);
    if (bare) {
        const mins = parseInt(bare[1], 10);
        if (!(mins >= 1)) return null;
        return mins < 60 ? { kind: 'minutes', mult: mins } : { kind: 'hours', mult: Math.floor(mins / 60) };
    }
    const m = str.match(/^(\d*)\s*([A-Za-z]+)$/);
    if (!m) return null;
    const n = m[1] === '' ? 1 : parseInt(m[1], 10);
    if (!(n >= 1)) return null;
    const raw = m[2];
    const low = raw.toLowerCase();

    if (raw === 'M' || low === 'mo' || low === 'mon' || low === 'month' || low === 'months') {
        return { kind: 'months', mult: n };
    }
    if (low === 't' || low === 'tick' || low === 'ticks') return { kind: 'ticks' };
    if (low === 'r' || low === 'range' || low === 'ranges') return { kind: 'ranges' };

    let minutes: number | null = null;
    if (low === 's' || low === 'sec' || low === 'second' || low === 'seconds') {
        if (n < 60) return { kind: 'seconds', mult: n };
        minutes = Math.floor(n / 60);
    } else if (low === 'm' || low === 'min' || low === 'minute' || low === 'minutes') {
        minutes = n;
    } else if (low === 'h' || low === 'hour' || low === 'hours') {
        return { kind: 'hours', mult: n };
    } else if (low === 'd' || low === 'day' || low === 'days') {
        return { kind: 'days', mult: n };
    } else if (low === 'w' || low === 'week' || low === 'weeks') {
        return { kind: 'weeks', mult: n };
    } else {
        return null;
    }
    return minutes < 60 ? { kind: 'minutes', mult: minutes } : { kind: 'hours', mult: Math.floor(minutes / 60) };
}

/** Cizim verilen zaman diliminde gorunur mu? (ayristirilamayan zaman dilimi -> gorunur) */
export function isVisibleOnTimeframe(v: IntervalsVisibilities | undefined, tf: ParsedTimeframe | null): boolean {
    if (!v || !tf) return true;
    if (tf.kind === 'ticks') return v.ticks;
    if (tf.kind === 'ranges') return v.ranges;
    const u = tf.kind;
    // Ust kova dahil: ozel zaman dilimi (48h, 400d...) birim ust sinirina kirpilir (buildIntervalsPreset ile tutarli)
    const mult = Math.min(tf.mult, UNIT_BOUNDS[u].max);
    return v[u] && mult >= v[`${u}From` as const] && mult <= v[`${u}To` as const];
}

/**
 * Hazir ayarlar. `tf` mevcut zaman dilimi. Eslesme:
 *  - all: varsayilan (hepsi gorunur).
 *  - current: yalnizca mevcut birim acik, From=To=carpan; diger tum birimler/ticks/ranges kapali.
 *  - above: mevcut birim acik, From=carpan, To=birim ust siniri; daha buyuk birimler tam aralikla acik;
 *    kucuk birimler, ticks ve ranges kapali.
 *  - below: mevcut birim acik, From=1 (birim alt siniri), To=carpan; daha kucuk birimler tam aralikla acik
 *    ve ticks acik; buyuk birimler ve ranges kapali.
 *  Mevcut zaman dilimi ticks/ranges ise: current -> yalnizca o bayrak; above/below -> o bayrak + tum zaman birimleri
 *  acik (tick/range icin anlamli bir siralama yok), diger bayrak kapali.
 *  Zaman dilimi ayristirilamazsa tum zaman dilimleri uygulanir.
 */
export function buildIntervalsPreset(preset: IntervalsPreset, tf: ParsedTimeframe | null): IntervalsVisibilities {
    const all = defaultIntervalsVisibilities();
    if (preset === 'all' || !tf) return all;

    const out = defaultIntervalsVisibilities();
    out.ticks = false; out.ranges = false;
    for (const u of INTERVAL_UNITS) out[u] = false;

    if (tf.kind === 'ticks' || tf.kind === 'ranges') {
        out[tf.kind] = true;
        if (preset !== 'current') for (const u of INTERVAL_UNITS) out[u] = true;
        return out;
    }

    const cur = tf.kind;
    const curIdx = INTERVAL_UNITS.indexOf(cur);
    const { min, max } = UNIT_BOUNDS[cur];
    const mult = Math.max(min, Math.min(max, tf.mult));
    out[cur] = true;
    if (preset === 'current') {
        out[`${cur}From` as const] = mult;
        out[`${cur}To` as const] = mult;
    } else if (preset === 'above') {
        out[`${cur}From` as const] = mult;
        INTERVAL_UNITS.forEach((u, i) => { if (i > curIdx) out[u] = true; });
    } else {
        out[`${cur}To` as const] = mult;
        out.ticks = true;
        INTERVAL_UNITS.forEach((u, i) => { if (i < curIdx) out[u] = true; });
    }
    return out;
}
