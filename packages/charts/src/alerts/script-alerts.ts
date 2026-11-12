/**
 * Script alert runner: observes every Evo Script core on every chart of the page, evaluates the user's active script
 * alerts after each finished run (no timers) with the pure rules of script-alert-logic.ts and reports fires to the
 * server (alertsStore.fireScript). The toast / sound comes from the server's WebSocket broadcast, not from here.
 */
import { alertsStore } from './alerts-store';
import {
    evoScriptCores, evoScriptRunEvents, evoScriptCoreEvents, EvoScriptCore,
} from '../indicators/evo-script-core';
import {
    ScriptAlertEvaluator, ScriptAlertSpec, ScriptAlertTrigger, ScriptRunView, SentStore, ScriptFire,
    scriptAlertInterval, selectBindingCores, symbolMatches, sourceUsesAlertCall, isFresh,
} from './script-alert-logic';
import type { ChartAlert } from './types';

const STORAGE_KEY = 'evo.scriptAlertSent';
const SENT_MAX = 400;
const RETRY_MS = 5000;

class SessionSentStore implements SentStore {
    private readonly _list: string[] = [];
    private readonly _set = new Set<string>();
    constructor() {
        try {
            const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;
            const arr = raw ? JSON.parse(raw) : [];
            if (Array.isArray(arr)) for (const k of arr) if (typeof k === 'string') this._push(k);
        } catch { /* storage unavailable */ }
    }
    private _push(k: string): void {
        this._list.push(k);
        this._set.add(k);
        if (this._list.length > SENT_MAX) this._set.delete(this._list.shift() as string);
    }
    has(key: string): boolean { return this._set.has(key); }
    add(key: string): void {
        if (this._set.has(key)) return;
        this._push(key);
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this._list)); } catch { /* ignore */ }
    }
}

export function coreDisplayName(core: EvoScriptCore): string {
    const m = core.output?.meta;
    return core.settings.name || m?.shortTitle || m?.title || core.lastTitle || 'Evo Script';
}

export interface ScriptAlertConditionInfo { title: string; message: string }
export interface ScriptAlertSourceInfo {
    id: string;
    name: string;
    /** The script calls alert() (source scan or an alert() event in the last run) */
    usesAlert: boolean;
    conditions: ScriptAlertConditionInfo[];
}

/** Offer for the alert dialog: what the script can alert on. */
export function describeScriptCore(core: EvoScriptCore): ScriptAlertSourceInfo {
    const out = core.output;
    const conditions = out ? Object.keys(out.alertFlags).map((title) => ({ title, message: out.alertMessages[title] ?? '' })) : [];
    return {
        id: core.id, name: coreDisplayName(core),
        usesAlert: (out?.alertEvents.length ?? 0) > 0 || sourceUsesAlertCall(core.settings.source),
        conditions,
    };
}

function runView(core: EvoScriptCore): ScriptRunView | null {
    const info = core.runInfo;
    const out = core.output;
    if (!info || !out) return null;
    let liveReplay = false;
    try { liveReplay = core.alertContext?.().replay === true; } catch { /* ignore */ }
    return {
        key: info.key, replay: info.replay || liveReplay, len: info.len, lastTime: info.lastTime, prevTime: info.prevTime,
        lastClose: info.lastClose, prevClose: info.prevClose, forming: info.forming, barSec: info.barSec,
        flag: (title, bar) => { const a = out.alertFlags[title]; return !!a && bar >= 0 && bar < a.length && a[bar] === 1; },
        conditionMessage: (title) => out.alertMessages[title] ?? '',
        eventsAt: (bar) => out.alertEvents.filter((e) => e.bar === bar).map((e) => ({ message: e.message, freq: e.freq })),
    };
}

function normTrigger(tr: string | undefined): ScriptAlertTrigger {
    return tr === 'once' || tr === 'once_per_bar' ? tr : 'once_per_bar_close';
}

class ScriptAlertRunner {
    private _started = false;
    private readonly _sent = new SessionSentStore();
    private readonly _ev = new ScriptAlertEvaluator(this._sent);
    private _hostedSig = '';

    start(): void {
        if (this._started) return;
        this._started = true;
        evoScriptRunEvents.subscribe((core) => this._onRun(core));
        evoScriptCoreEvents.subscribe(() => this._updateHosted());
        alertsStore.setScriptHostResolver((a) => this._cores(a).length > 0);
        alertsStore.onChange((ev) => {
            if (ev.type === 'removed') { this._ev.forgetAlert(ev.id); return; }
            if (ev.type === 'changed' || ev.type === 'fired') { if (ev.alert.status !== 'active') this._ev.forgetAlert(ev.alert.id); }
            if (ev.type === 'reset') this._ev.keepAlerts(new Set(this._active().map((a) => a.id)));
            this._evaluateAll();
            this._updateHosted();
        });
    }

    private _active(): ChartAlert[] {
        return alertsStore.alerts().filter((a) => a.source === 'script' && a.status === 'active' && !!a.script);
    }

    /** Cores that host the alert's script on its symbol and timeframe. */
    private _cores(a: ChartAlert): EvoScriptCore[] {
        const b = a.script;
        if (!b) return [];
        const here = evoScriptCores().filter((c) => {
            let sym = '';
            try { sym = c.alertContext?.().symbol ?? ''; } catch { /* ignore */ }
            return !!sym && symbolMatches(a.symbol, sym) && scriptAlertInterval(c.chartTimeframe) === b.timeframe;
        });
        return selectBindingCores(b, here.map((c) => ({ id: c.id, name: coreDisplayName(c), core: c }))).map((x) => x.core);
    }

    private _specsFor(core: EvoScriptCore, alerts: ChartAlert[]): ScriptAlertSpec[] {
        const specs: ScriptAlertSpec[] = [];
        for (const a of alerts) {
            if (!this._cores(a).includes(core)) continue;
            specs.push({ id: a.id, mode: a.script!.mode, title: a.script!.title, trigger: normTrigger(a.trigger) });
        }
        return specs;
    }

    private _onRun(core: EvoScriptCore): void {
        const alerts = this._active();
        this._ev.keepCores(new Set(evoScriptCores().map((c) => c.id)));
        if (alerts.length === 0) return;
        this._evalCore(core, alerts);
        this._updateHosted();
    }

    private _evaluateAll(): void {
        const alerts = this._active();
        if (alerts.length === 0) return;
        for (const core of evoScriptCores()) this._evalCore(core, alerts);
    }

    private _evalCore(core: EvoScriptCore, alerts: ChartAlert[]): void {
        const specs = this._specsFor(core, alerts);
        if (specs.length === 0) return;
        const view = runView(core);
        for (const f of this._ev.evaluate(core.id, view, specs)) void this._send(f, view?.barSec ?? null, 0);
    }

    private async _send(f: ScriptFire, barSec: number | null, attempt: number): Promise<void> {
        let res;
        try {
            res = await alertsStore.fireScript(f.alertId, { barTime: f.barTime, message: f.message, price: f.price });
        } catch {
            // network error: one retry for the same bar while it is still inside the server's freshness window
            if (attempt === 0) {
                setTimeout(() => {
                    if (isFresh(f.barTime, Date.now() / 1000, barSec)) void this._send(f, barSec, 1);
                }, RETRY_MS);
            }
            return;
        }
        if (res && (res.status === 404 || res.status === 409)) void alertsStore.refresh().catch(() => {});
        // 400 / 422 / 429: dropped, never retried (the bar stays marked as sent)
    }

    private _updateHosted(): void {
        const sig = this._active().filter((a) => this._cores(a).length > 0).map((a) => a.id).sort().join(',');
        if (sig === this._hostedSig) return;
        this._hostedSig = sig;
        alertsStore.notifyPresenceChanged();
    }
}

const runner = new ScriptAlertRunner();
/** Idempotent: called by the chart widget when it wires an Evo Script indicator. */
export function startScriptAlerts(): void { runner.start(); }
