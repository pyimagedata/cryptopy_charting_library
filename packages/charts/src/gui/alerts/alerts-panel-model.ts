/**
 * Pure logic of the alerts manager panel (no DOM): filter / sort / search, unread badge counting,
 * log merging and time formatting. Kept separate so it can be unit-tested in node.
 */
import { t } from '../../helpers/translations';
import { alertTicker } from '../../alerts/alert-text';
import type { AlertLogEntry, AlertStatus, ChartAlert } from '../../alerts/types';

export type AlertStatusFilter = 'all' | AlertStatus;
export type AlertSortKey = 'created' | 'symbol' | 'status';

export const STATUS_FILTERS: readonly AlertStatusFilter[] = ['all', 'active', 'stopped', 'triggered', 'expired'];
export const SORT_KEYS: readonly AlertSortKey[] = ['created', 'symbol', 'status'];

const STATUS_EN: Record<AlertStatus, string> = {
    active: 'Active', stopped: 'Stopped', triggered: 'Triggered', expired: 'Expired',
};

export function statusLabel(s: AlertStatus): string {
    return t(STATUS_EN[s]);
}

export function filterLabel(f: AlertStatusFilter): string {
    return f === 'all' ? t('All') : statusLabel(f);
}

const SORT_EN: Record<AlertSortKey, string> = { created: 'Creation time', symbol: 'Symbol', status: 'Status' };
export function sortLabel(k: AlertSortKey): string {
    return t(SORT_EN[k]);
}

/** Case-insensitive match on ticker, full symbol, name and message. Empty query matches everything. */
export function matchesQuery(a: ChartAlert, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [alertTicker(a.symbol), a.symbol, a.name, a.message].some((s) => (s || '').toLowerCase().includes(q));
}

export function filterAlerts(alerts: readonly ChartAlert[], status: AlertStatusFilter, query: string): ChartAlert[] {
    return alerts.filter((a) => (status === 'all' || a.status === status) && matchesQuery(a, query));
}

const STATUS_ORDER: Record<AlertStatus, number> = { active: 0, triggered: 1, stopped: 2, expired: 3 };

/** Returns a sorted copy: created = newest first, symbol = ticker A-Z (newest first inside), status = active first. */
export function sortAlerts(alerts: readonly ChartAlert[], key: AlertSortKey): ChartAlert[] {
    const byNewest = (a: ChartAlert, b: ChartAlert) => b.createdAt - a.createdAt;
    const out = [...alerts];
    if (key === 'symbol') {
        out.sort((a, b) => alertTicker(a.symbol).localeCompare(alertTicker(b.symbol)) || byNewest(a, b));
    } else if (key === 'status') {
        out.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || byNewest(a, b));
    } else {
        out.sort(byNewest);
    }
    return out;
}

/** Counts fired alerts the user has not seen yet (panel closed). */
export class UnreadCounter {
    private _count = 0;
    get count(): number { return this._count; }
    /** Returns true when the count changed. */
    onFired(panelOpen: boolean): boolean {
        if (panelOpen) return false;
        this._count++;
        return true;
    }
    /** Restores a count carried over from a previous panel instance. */
    set(n: number): void { this._count = Math.max(0, Math.floor(n) || 0); }
    /** Returns true when the count changed. */
    reset(): boolean {
        if (this._count === 0) return false;
        this._count = 0;
        return true;
    }
}

const LOG_MAX = 500;

/** New entry first; an entry with the same id is not duplicated; capped to LOG_MAX. */
export function prependLog(entries: readonly AlertLogEntry[], entry: AlertLogEntry): AlertLogEntry[] {
    if (entries.some((e) => e.id === entry.id)) return [...entries];
    return [entry, ...entries].slice(0, LOG_MAX);
}

/** Fetched log (newest first) plus entries that arrived live while fetching; deduplicated, newest first. */
export function mergeLog(fetched: readonly AlertLogEntry[], live: readonly AlertLogEntry[]): AlertLogEntry[] {
    let out = [...fetched];
    for (const e of [...live].reverse()) out = prependLog(out, e);
    return out.slice(0, LOG_MAX);
}

function two(n: number): string { return n < 10 ? `0${n}` : String(n); }

/** Local time "dd.MM HH:mm:ss". */
export function formatLogTime(ms: number): string {
    const d = new Date(ms);
    return `${two(d.getDate())}.${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

/** "just now" / "5 min ago" / "3 h ago" / "2 d ago", older than 30 days: "dd.MM.yyyy". */
export function relativeTime(ms: number, now: number): string {
    const diff = Math.max(0, now - ms);
    const min = Math.floor(diff / 60000);
    if (min < 1) return t('just now');
    if (min < 60) return t('{n} min ago').replace('{n}', String(min));
    const h = Math.floor(min / 60);
    if (h < 24) return t('{n} h ago').replace('{n}', String(h));
    const d = Math.floor(h / 24);
    if (d <= 30) return t('{n} d ago').replace('{n}', String(d));
    const dt = new Date(ms);
    return `${two(dt.getDate())}.${two(dt.getMonth() + 1)}.${dt.getFullYear()}`;
}
