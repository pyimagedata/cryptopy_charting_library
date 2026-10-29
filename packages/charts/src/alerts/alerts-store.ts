/**
 * Page-level alerts store (singleton). Caches the user's alerts, delegates mutations to the host's
 * AlertsBackend and applies the server result. UI parts (alert lines, manager panel, dialog) subscribe via onChange.
 * Fired events produce the toast / sound notification here, so it happens once per page however many charts exist.
 */
import { t } from '../helpers/translations';
import { showToast } from '../gui/toast/toast';
import { playAlertSound } from './alert-sound';
import { getAlertSettings } from './alert-settings';
import { alertMatchesSymbol, alertTicker, conditionLabel, plainPrice } from './alert-text';
import { sameGeometry } from './drawing-geometry';
import {
    AlertGeometry, AlertsBackend, AlertsError, AlertsEvent, AlertDraft, AlertLogEntry, ChartAlert,
} from './types';

/** Store events: backend events plus 'reset' (list reloaded / backend swapped / cleared). */
export type AlertsStoreEvent = AlertsEvent | { type: 'reset' };
export type AlertsStoreListener = (ev: AlertsStoreEvent) => void;

const SEEN_FIRED_MAX = 200;
const TOMBSTONE_MAX = 500;

type AlertPatch = Partial<AlertDraft> & { status?: 'active' | 'stopped' };
/** Patch keys that are applied to the cache before the server answers (everything else waits for the server). */
const OPTIMISTIC_KEYS = new Set<string>(['price', 'status', 'name', 'message', 'notifyApp', 'notifyToast', 'playSound', 'sound', 'notifyTelegram', 'color']);

/** Per-alert request bookkeeping: in-flight count, version counter, last server-known object, queue tail. */
interface AlertReq {
    version: number;
    pending: number;
    /** Newest server-side object we know of (HTTP result or ws event, by arrival order); the rollback target. */
    confirmed: ChartAlert | undefined;
    /** Latest ws 'changed' / 'fired' object that arrived while a local request was in flight. */
    deferred: ChartAlert | undefined;
    /** Counts ws objects received while pending (to tell whether one arrived after a request was sent). */
    wsSeq: number;
    /** A ws 'removed' arrived while pending: the alert is gone for good, never re-insert it. */
    gone: boolean;
    /** This record removed the alert from the cache (optimistic remove) and has not confirmed / rolled it back yet. */
    removedLocally: boolean;
    /** Cache copy of the newest optimistic request (re-applied after a list reload), null = none. */
    optimistic: ChartAlert | 'remove' | null;
    /** Cache index the alert had when removed optimistically. */
    removeIndex: number;
    tail: Promise<unknown>;
}

const REQUEST_TIMEOUT_MS = 30000;

class AlertsStore {
    private _backend: AlertsBackend | null = null;
    private _unsubscribe: (() => void) | null = null;
    private _alerts: ChartAlert[] = [];
    private _limit = 0;
    private _telegramAvailable = false;
    private _webhookAvailable = false;
    private _presence: ((alert: ChartAlert) => boolean | null) | null = null;
    private _geometryOf: ((alert: ChartAlert) => AlertGeometry | null) | null = null;
    private readonly _listeners = new Set<AlertsStoreListener>();
    private readonly _seenFired: string[] = [];
    private _gen = 0;
    private readonly _reqs = new Map<string, AlertReq>();
    /** Ids removed locally (optimistic or by ws): a late ws 'changed' for them is ignored. Cleared on list reload. */
    private readonly _removed = new Set<string>();
    private _timeoutMs = REQUEST_TIMEOUT_MS;

    get hasBackend(): boolean { return this._backend !== null; }
    get limit(): number { return this._limit; }
    get telegramAvailable(): boolean { return this._telegramAvailable; }
    get webhookAvailable(): boolean { return this._webhookAvailable; }

    /**
     * Plugged in by the drawing side: true = the alert's drawing exists on an open chart, false = it is gone
     * (the panel appends "(çizim silindi)"), null = unknown. Call `notifyPresenceChanged()` after drawings change.
     */
    setDrawingPresenceResolver(fn: ((alert: ChartAlert) => boolean | null) | null): void {
        this._presence = fn;
        this._emit({ type: 'reset' });
    }
    /** Plugged in by the drawing side: current geometry of an alert's drawing when it is on an open chart, else null. */
    setDrawingGeometryResolver(fn: ((alert: ChartAlert) => AlertGeometry | null) | null): void {
        this._geometryOf = fn;
    }
    drawingPresence(alert: ChartAlert): boolean | null {
        if (!this._presence) return null;
        try { return this._presence(alert); } catch { return null; }
    }
    notifyPresenceChanged(): void { this._emit({ type: 'reset' }); }

    /** Cached alerts, newest first. The array identity changes whenever the list changes. */
    alerts(): ChartAlert[] { return this._alerts; }

    alertsForSymbol(symbol: string): ChartAlert[] {
        return this._alerts.filter((a) => alertMatchesSymbol(a.symbol, symbol));
    }

    /** Number of active alerts (the ones counting towards the plan limit). */
    activeCount(): number {
        return this._alerts.filter((a) => a.status === 'active').length;
    }

    onChange(listener: AlertsStoreListener): () => void {
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
    }

    private _emit(ev: AlertsStoreEvent): void {
        for (const l of [...this._listeners]) {
            try { l(ev); } catch (e) { console.error('[alerts] listener failed', e); }
        }
    }

    setBackend(backend: AlertsBackend | null): void {
        if (backend === this._backend) return;
        this._unsubscribe?.();
        this._unsubscribe = null;
        this._backend = backend;
        this._gen++;
        this._alerts = [];
        this._reqs.clear();
        this._removed.clear();
        this._limit = 0;
        this._telegramAvailable = false;
        this._webhookAvailable = false;
        this._emit({ type: 'reset' });
        if (!backend) return;
        this._unsubscribe = backend.subscribe((ev) => this._onBackendEvent(ev));
        void this.refresh().catch((e) => console.warn('[alerts] initial refresh failed', e));
    }

    /** Reloads the list from the backend. Rejects with the backend's error. */
    async refresh(): Promise<void> {
        const backend = this._backend;
        if (!backend) return;
        const gen = this._gen;
        const res = await backend.list();
        if (gen !== this._gen) return;
        let list = [...res.alerts];
        // requests still in flight keep their local state: optimistic remove stays removed, optimistic copy stays applied
        for (const [id, r] of this._reqs) {
            if (r.pending === 0) { this._reqs.delete(id); continue; }
            const srv = list.find((a) => a.id === id);
            if (srv && !r.gone) r.confirmed = srv;
            if (r.optimistic === 'remove') list = list.filter((a) => a.id !== id);
            else if (r.optimistic && srv) list = list.map((a) => (a.id === id ? r.optimistic as ChartAlert : a));
        }
        const keep = [...this._reqs].filter(([, r]) => r.removedLocally).map(([id]) => id);
        this._removed.clear();
        for (const id of keep) this._removed.add(id);
        this._alerts = list;
        this._limit = res.limit;
        this._telegramAvailable = res.telegramAvailable;
        this._webhookAvailable = !!res.webhookAvailable;
        this._emit({ type: 'reset' });
    }

    async create(draft: AlertDraft): Promise<ChartAlert> {
        const backend = this._backend;
        if (!backend) {
            showToast({ title: t('Sign in to use alerts'), kind: 'info' });
            throw new AlertsError('auth', 'Sign in to use alerts');
        }
        const alert = await backend.create(draft);
        this._upsert(alert);
        return alert;
    }

    /**
     * Update. A patch that only touches price / status / name / message / notification flags is applied to the cache
     * immediately (rolled back when the request fails); the server result wins when it returns. Requests of one alert
     * are sent in order and a stale response never overwrites a newer local state.
     */
    update(id: string, patch: AlertPatch): Promise<ChartAlert> {
        let backend: AlertsBackend;
        try { backend = this._requireBackend(); } catch (e) { return Promise.reject(e); }
        const cur = this._alerts.find((a) => a.id === id);
        const optimistic = cur ? this._optimisticCopy(cur, patch) : null;
        return this._mutate<ChartAlert>(id, optimistic, () => backend.update(id, patch)) as Promise<ChartAlert>;
    }

    /** Optimistic remove: the alert leaves the cache at once, comes back (same position) when the backend fails. */
    remove(id: string): Promise<void> {
        let backend: AlertsBackend;
        try { backend = this._requireBackend(); } catch (e) { return Promise.reject(e); }
        return this._mutate<void>(id, 'remove', () => backend.remove(id), true);
    }

    /** Restart; a drawing alert whose drawing moved while it was stopped / triggered / expired gets the current geometry in the same PATCH. */
    restart(id: string): Promise<ChartAlert> {
        const patch: Partial<AlertDraft> & { status: 'active' } = { status: 'active' };
        const alert = this._alerts.find((a) => a.id === id);
        if (alert && alert.source === 'drawing' && this._geometryOf) {
            let g: AlertGeometry | null = null;
            try { g = this._geometryOf(alert); } catch { g = null; }
            if (g && !sameGeometry(alert.geometry, g)) patch.geometry = g;
        }
        return this.update(id, patch);
    }
    stop(id: string): Promise<ChartAlert> { return this.update(id, { status: 'stopped' }); }

    async log(): Promise<AlertLogEntry[]> {
        return this._backend ? this._backend.log() : [];
    }

    async clearLog(): Promise<void> {
        if (this._backend) await this._backend.clearLog();
    }

    private _requireBackend(): AlertsBackend {
        if (!this._backend) {
            showToast({ title: t('Sign in to use alerts'), kind: 'info' });
            throw new AlertsError('auth', 'Sign in to use alerts');
        }
        return this._backend;
    }

    private _upsert(alert: ChartAlert): void {
        const i = this._alerts.findIndex((a) => a.id === alert.id);
        if (i >= 0) {
            this._alerts = this._alerts.map((a, k) => (k === i ? alert : a));
        } else {
            this._alerts = [alert, ...this._alerts];
        }
        this._emit({ type: 'changed', alert });
    }

    private _removeLocal(id: string): void {
        this._rememberRemoved(id);
        if (!this._alerts.some((a) => a.id === id)) return;
        this._alerts = this._alerts.filter((a) => a.id !== id);
        this._emit({ type: 'removed', id });
    }

    private _rememberRemoved(id: string): void {
        this._removed.add(id);
        if (this._removed.size > TOMBSTONE_MAX) {
            const first = this._removed.values().next().value;
            if (first !== undefined) this._removed.delete(first);
        }
    }

    /** Cached copy with the patch applied, or null when the patch has keys that must wait for the server. */
    private _optimisticCopy(cur: ChartAlert, patch: AlertPatch): ChartAlert | null {
        const next: Record<string, unknown> = { ...cur };
        const curRec = cur as unknown as Record<string, unknown>;
        for (const [k, v] of Object.entries(patch)) {
            if (v === undefined) continue;
            if (JSON.stringify(curRec[k]) === JSON.stringify(v)) continue;
            if (!OPTIMISTIC_KEYS.has(k)) return null;
            // '' = "server rebuilds the auto message": keep the old text until it answers
            if (k === 'message' && v === '') continue;
            next[k] = v;
        }
        return next as unknown as ChartAlert;
    }

    /** Re-inserts an alert keeping the newest-first (createdAt) order. */
    private _insertSorted(alert: ChartAlert, prefer = -1): void {
        const at = this._alerts.findIndex((a) => a.createdAt < alert.createdAt);
        const hi = at < 0 ? this._alerts.length : at;
        let lo = hi;
        while (lo > 0 && this._alerts[lo - 1].createdAt === alert.createdAt) lo--;
        // among equal createdAt keep the old position
        const i = prefer >= 0 ? Math.min(Math.max(prefer, lo), hi) : hi;
        this._alerts = [...this._alerts.slice(0, i), alert, ...this._alerts.slice(i)];
        this._emit({ type: 'changed', alert });
    }

    private _withTimeout<T>(call: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => reject(new AlertsError('network', t('Request timed out'))), this._timeoutMs);
            let p: Promise<T>;
            try { p = call(); } catch (e) { clearTimeout(timer); reject(e); return; }
            p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
        });
    }

    /**
     * Runs one mutation of alert `id`. `optimistic` = the cache copy to show now, 'remove' = drop it, null = wait for the server.
     * Calls of one alert are chained so the server sees them in order; only the response of the newest call is applied.
     */
    private _mutate<T extends ChartAlert | void>(id: string, optimistic: ChartAlert | 'remove' | null, call: () => Promise<T>, isRemove = false): Promise<T> {
        const gen = this._gen;
        let rec = this._reqs.get(id);
        if (!rec) {
            rec = { version: 0, pending: 0, confirmed: undefined, deferred: undefined, wsSeq: 0, gone: false, removedLocally: false, optimistic: null, removeIndex: -1, tail: Promise.resolve() };
            this._reqs.set(id, rec);
        }
        const r = rec;
        if (r.pending === 0) {
            r.confirmed = this._alerts.find((a) => a.id === id);
            r.deferred = undefined; r.gone = false; r.removedLocally = false;
        }
        r.pending++;
        const version = ++r.version;
        r.optimistic = optimistic;
        if (optimistic === 'remove') { if (!r.removedLocally) r.removeIndex = this._alerts.findIndex((a) => a.id === id); r.removedLocally = true; this._removeLocal(id); }
        else if (optimistic) this._upsert(optimistic);

        let sentSeq = 0;
        const run = r.tail.then(() => { sentSeq = r.wsSeq; return this._withTimeout(call); });
        r.tail = run.then(() => undefined, () => undefined);
        const done = () => {
            r.pending--;
            if (r.pending === 0 && this._reqs.get(id) === r) this._reqs.delete(id);
        };
        return run.then(
            (res) => {
                if (gen !== this._gen) { r.pending--; return res; }
                const latest = version === r.version;
                if (isRemove) {
                    r.gone = true;
                    r.removedLocally = false;
                    done();
                    this._removeLocal(id);
                    return res;
                }
                if (res && !r.gone) r.confirmed = res as ChartAlert;
                let out = res as ChartAlert | void;
                // a ws fired / triggered that arrived after this request was sent is newer than the HTTP result
                const d = r.deferred;
                if (d && r.wsSeq > sentSeq && (d.status === 'triggered' || d.status === 'expired') && out && out.status !== d.status) out = d;
                const wasLocal = r.removedLocally;
                const gone = r.gone;
                if (latest) r.removedLocally = false;
                done();
                if (latest && out && !gone) {
                    if (wasLocal) this._removed.delete(id);
                    if (!this._removed.has(id)) this._upsert(out);
                }
                return res;
            },
            (err: unknown) => {
                if (gen !== this._gen) { r.pending--; throw err; }
                const latest = version === r.version;
                // DELETE of an alert the server no longer has (404 -> 'invalid') is a success for the user
                if (isRemove && err instanceof AlertsError && err.code === 'invalid') {
                    r.gone = true;
                    r.removedLocally = false;
                    done();
                    this._removeLocal(id);
                    return undefined as T;
                }
                const truth = r.gone ? undefined : r.confirmed;
                const wasLocal = r.removedLocally;
                done();
                if (latest && truth) {
                    if (wasLocal) { this._removed.delete(id); r.removedLocally = false; }
                    const cached = this._alerts.find((a) => a.id === id);
                    if (cached) { if (cached !== truth) this._upsert(truth); }
                    else if (wasLocal) this._insertSorted(truth, r.removeIndex);
                }
                throw err;
            },
        );
    }

    private _onBackendEvent(ev: AlertsEvent): void {
        if (ev.type === 'changed') {
            this._applyServerAlert(ev.alert);
        } else if (ev.type === 'removed') {
            const rec = this._reqs.get(ev.id);
            if (rec && rec.pending > 0) { rec.gone = true; rec.confirmed = undefined; rec.deferred = undefined; }
            this._removeLocal(ev.id);
        } else if (ev.type === 'fired') {
            this._applyServerAlert(ev.alert);
            const key = `${ev.entry.id}`;
            if (this._seenFired.includes(key)) return;
            this._seenFired.push(key);
            if (this._seenFired.length > SEEN_FIRED_MAX) this._seenFired.shift();
            this._emit(ev);
            this._notifyFired(ev.alert, ev.entry);
        }
    }

    /** ws 'changed' / 'fired': deferred while a local request of that alert is in flight (its result wins afterwards). */
    private _applyServerAlert(alert: ChartAlert): void {
        const rec = this._reqs.get(alert.id);
        if (rec && rec.pending > 0) {
            if (rec.gone) return;
            rec.deferred = alert;
            rec.confirmed = alert;
            rec.wsSeq++;
            return;
        }
        if (this._removed.has(alert.id)) return;
        this._upsert(alert);
    }

    private _notifyFired(alert: ChartAlert, entry: AlertLogEntry): void {
        try {
            const cfg = getAlertSettings();
            if (alert.notifyToast && cfg.toast) {
                const ticker = alertTicker(alert.symbol);
                const label = alert.name ? `${t('Alert')}: ${alert.name}` : `${t('Alert')}: ${ticker}`;
                showToast({
                    kind: 'alert',
                    title: label,
                    body: entry.message || alert.message || `${ticker} ${conditionLabel(alert.condition)} ${plainPrice(alert.price)}`,
                    detail: `${t('Price')}: ${plainPrice(entry.price)}`,
                    time: entry.firedAt,
                });
            }
            if (alert.playSound && cfg.sound) playAlertSound(alert.sound);
        } catch (e) {
            console.error('[alerts] notify failed', e);
        }
    }
}

export const alertsStore = new AlertsStore();
export type { AlertsStore };
