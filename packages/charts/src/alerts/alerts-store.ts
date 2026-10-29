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
import {
    AlertsBackend, AlertsError, AlertsEvent, AlertDraft, AlertLogEntry, ChartAlert,
} from './types';

/** Store events: backend events plus 'reset' (list reloaded / backend swapped / cleared). */
export type AlertsStoreEvent = AlertsEvent | { type: 'reset' };
export type AlertsStoreListener = (ev: AlertsStoreEvent) => void;

const SEEN_FIRED_MAX = 200;

class AlertsStore {
    private _backend: AlertsBackend | null = null;
    private _unsubscribe: (() => void) | null = null;
    private _alerts: ChartAlert[] = [];
    private _limit = 0;
    private _telegramAvailable = false;
    private readonly _listeners = new Set<AlertsStoreListener>();
    private readonly _seenFired: string[] = [];
    private _gen = 0;

    get hasBackend(): boolean { return this._backend !== null; }
    get limit(): number { return this._limit; }
    get telegramAvailable(): boolean { return this._telegramAvailable; }

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
        this._limit = 0;
        this._telegramAvailable = false;
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
        this._alerts = [...res.alerts];
        this._limit = res.limit;
        this._telegramAvailable = res.telegramAvailable;
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

    async update(id: string, patch: Partial<AlertDraft> & { status?: 'active' | 'stopped' }): Promise<ChartAlert> {
        const backend = this._requireBackend();
        const alert = await backend.update(id, patch);
        this._upsert(alert);
        return alert;
    }

    async remove(id: string): Promise<void> {
        const backend = this._requireBackend();
        await backend.remove(id);
        this._removeLocal(id);
    }

    restart(id: string): Promise<ChartAlert> { return this.update(id, { status: 'active' }); }
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
        if (!this._alerts.some((a) => a.id === id)) return;
        this._alerts = this._alerts.filter((a) => a.id !== id);
        this._emit({ type: 'removed', id });
    }

    private _onBackendEvent(ev: AlertsEvent): void {
        if (ev.type === 'changed') {
            this._upsert(ev.alert);
        } else if (ev.type === 'removed') {
            this._removeLocal(ev.id);
        } else if (ev.type === 'fired') {
            this._upsert(ev.alert);
            const key = `${ev.entry.id}`;
            if (this._seenFired.includes(key)) return;
            this._seenFired.push(key);
            if (this._seenFired.length > SEEN_FIRED_MAX) this._seenFired.shift();
            this._emit(ev);
            this._notifyFired(ev.alert, ev.entry);
        }
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
