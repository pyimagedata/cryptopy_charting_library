/**
 * Script alerts: pure decision logic (no DOM, no network, no chart classes).
 *
 * A script alert is evaluated in the browser from the output of an Evo Script indicator and delivered by the server
 * (POST /api/alerts/<id>/fire/). This module decides WHICH bar fires WHAT:
 *
 *  - Arming: the first time an alert is seen on a run of a given identity (script + inputs + symbol + timeframe) the
 *    then-current forming bar is remembered. Nothing before that bar can ever fire. Any identity change (symbol /
 *    timeframe switch, script edit or recompile, input change) and replay re-arm. History loads and scroll-left only
 *    add older bars, which are never looked at: only the last two bars of a run are evaluated.
 *  - "once per bar close": when a NEW bar opens, the bar that just closed (run index len-2) is evaluated.
 *  - "once per bar" / "once": the forming bar (index len-1) is evaluated on every run; the first run in which its
 *    flag / event is set fires. A flag that is already set on the arming bar at the moment of arming is NOT fired
 *    (it happened before the alert was watching). When the bar closes it is evaluated once more as a catch-up.
 *  - Every fire is for one (alert, bar) pair at most once (v1 ceiling, same as the server).
 */

export type ScriptAlertTrigger = 'once' | 'once_per_bar' | 'once_per_bar_close';
export type ScriptAlertMode = 'alert' | 'condition';

export interface ScriptAlertSpec {
    id: string;
    mode: ScriptAlertMode;
    /** alertcondition title (mode = condition) */
    title: string | null;
    trigger: ScriptAlertTrigger;
}

export interface ScriptEventLite { message: string; freq: string }

/** What the evaluator needs to know about one finished script run (times in unix seconds, indices are run indices). */
export interface ScriptRunView {
    /** Identity of the run: other key = other data (script, inputs, symbol, timeframe) */
    key: string;
    replay: boolean;
    len: number;
    lastTime: number;
    prevTime: number | null;
    lastClose: number;
    prevClose: number | null;
    /** The last bar of the run was still open when the run started */
    forming: boolean;
    /** Bar length in seconds (null = unknown: no client side freshness check) */
    barSec: number | null;
    /** alertcondition flag of the bar at run index `bar` */
    flag(title: string, bar: number): boolean;
    /** alertcondition message of a title */
    conditionMessage(title: string): string;
    /** alert() events of the bar at run index `bar` */
    eventsAt(bar: number): ScriptEventLite[];
}

export interface ScriptFire {
    alertId: string;
    /** Open time of the bar, unix seconds */
    barTime: number;
    message: string;
    price: number;
}

/** Remembers (alert, bar) pairs that were already sent; the real implementation also survives a reload (sessionStorage). */
export interface SentStore {
    has(key: string): boolean;
    add(key: string): void;
}

export class MemorySentStore implements SentStore {
    private readonly _set = new Set<string>();
    has(key: string): boolean { return this._set.has(key); }
    add(key: string): void { this._set.add(key); }
}

export function sentKey(alertId: string, barTime: number): string {
    return `${alertId}:${barTime}`;
}

/** The server accepts bars up to 2 bar lengths old and 1 bar length ahead; the client mirrors that. */
export const PAST_BARS = 2;
export const FUTURE_BARS = 1;

export function isFresh(barTime: number, nowSec: number, barSec: number | null): boolean {
    if (barSec === null || !(barSec > 0)) return true;
    return barTime >= nowSec - PAST_BARS * barSec && barTime <= nowSec + FUTURE_BARS * barSec;
}

interface ArmState {
    runKey: string;
    /** Open time of the bar that was forming when the alert was armed; nothing earlier fires */
    armedBar: number;
    /** Newest bar time seen */
    lastSeen: number;
    /** Newest closed bar already evaluated */
    closedDone: number;
    /** Bar whose flag / event was already set when armed (forming modes): never fires */
    suppressed: number | null;
}

function formingEvents(events: ScriptEventLite[]): ScriptEventLite[] {
    return events.filter((e) => e.freq !== 'once_per_bar_close');
}

export class ScriptAlertEvaluator {
    private readonly _states = new Map<string, ArmState>();
    private readonly _now: () => number;

    constructor(private readonly _sent: SentStore, now: () => number = () => Date.now() / 1000) {
        this._now = now;
    }

    /** Evaluates the alerts watching `coreKey` on its newest run; returns the fires to send (already marked as sent). */
    evaluate(coreKey: string, run: ScriptRunView | null, specs: readonly ScriptAlertSpec[]): ScriptFire[] {
        if (!run) return [];
        if (run.replay) {
            this.forgetCore(coreKey);
            return [];
        }
        const out: ScriptFire[] = [];
        const nowSec = this._now();
        for (const spec of specs) {
            const stKey = `${coreKey}|${spec.id}`;
            let st = this._states.get(stKey);
            if (!st || st.runKey !== run.key) {
                // arm on the live forming bar only (a run of stale / closed data must not arm)
                if (!run.forming) { this._states.delete(stKey); continue; }
                st = {
                    runKey: run.key, armedBar: run.lastTime, lastSeen: run.lastTime, closedDone: run.lastTime - 1,
                    suppressed: spec.trigger !== 'once_per_bar_close' && this._formingHit(spec, run) ? run.lastTime : null,
                };
                this._states.set(stKey, st);
                continue;
            }
            if (run.lastTime < st.lastSeen) continue; // older data than already seen (lagging / replaced): ignore
            const push = (barTime: number, message: string, price: number): void => {
                const key = sentKey(spec.id, barTime);
                if (this._sent.has(key)) return;
                if (barTime < st!.armedBar) return;
                if (!isFresh(barTime, nowSec, run.barSec)) return;
                this._sent.add(key);
                out.push({ alertId: spec.id, barTime, message, price });
            };
            // a new bar opened: the previous bar just closed
            if (run.lastTime > st.lastSeen && run.prevTime !== null && run.len >= 2 && run.prevTime > st.closedDone) {
                st.closedDone = run.prevTime;
                if (run.prevTime !== st.suppressed) {
                    const hit = this._hit(spec, run, run.len - 2, true);
                    if (hit !== null) push(run.prevTime, hit, run.prevClose ?? run.lastClose);
                }
            }
            if (spec.trigger !== 'once_per_bar_close' && run.lastTime !== st.suppressed) {
                const hit = this._hit(spec, run, run.len - 1, false);
                if (hit !== null) push(run.lastTime, hit, run.lastClose);
            }
            st.lastSeen = run.lastTime;
        }
        return out;
    }

    /** Message when the alert's flag / event is set on run bar `bar`, else null. `closed`: every event counts. */
    private _hit(spec: ScriptAlertSpec, run: ScriptRunView, bar: number, closed: boolean): string | null {
        if (spec.mode === 'condition') {
            const title = spec.title ?? '';
            return run.flag(title, bar) ? (run.conditionMessage(title) || title) : null;
        }
        const events = run.eventsAt(bar);
        const usable = closed ? events : formingEvents(events);
        return usable.length > 0 ? usable[0].message : null;
    }

    private _formingHit(spec: ScriptAlertSpec, run: ScriptRunView): boolean {
        return this._hit(spec, run, run.len - 1, false) !== null;
    }

    /** Drops the arming state of an alert (deleted / stopped), so it arms afresh when it becomes active again. */
    forgetAlert(alertId: string): void {
        const suffix = `|${alertId}`;
        for (const k of [...this._states.keys()]) if (k.endsWith(suffix)) this._states.delete(k);
    }

    /** Drops the states of alerts that are not in `alertIds` (deleted / no longer active). */
    keepAlerts(alertIds: ReadonlySet<string>): void {
        for (const k of [...this._states.keys()]) {
            if (!alertIds.has(k.slice(k.lastIndexOf('|') + 1))) this._states.delete(k);
        }
    }

    /** Drops every alert state of a script core (replay, core destroyed). */
    forgetCore(coreKey: string): void {
        const prefix = `${coreKey}|`;
        for (const k of [...this._states.keys()]) if (k.startsWith(prefix)) this._states.delete(k);
    }

    /** Drops the states of cores that no longer exist. */
    keepCores(coreKeys: ReadonlySet<string>): void {
        for (const k of [...this._states.keys()]) {
            const i = k.lastIndexOf('|');
            if (!coreKeys.has(k.slice(0, i))) this._states.delete(k);
        }
    }

    isArmed(coreKey: string, alertId: string): boolean {
        return this._states.has(`${coreKey}|${alertId}`);
    }
}

// ---------------------------------------------------------------------------
// Timeframes and binding
// ---------------------------------------------------------------------------

/**
 * Chart timeframe text ("15m", "1H", "60", "1D", "1W", "1M") -> the interval string script alerts store
 * ("15m", "1h", "1h", "1d", "1w", "1M"); null when it cannot be expressed. Uppercase M is a month (TradingView notation).
 */
export function scriptAlertInterval(tf: string | null | undefined): string | null {
    if (!tf) return null;
    const s = String(tf).trim();
    const m = s.match(/^(\d+)\s*([smhdwMHDW]?)$/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (!(n >= 1)) return null;
    const unit = m[2] === 'M' ? 'M' : m[2].toLowerCase();
    if (unit === 's') return null;
    if (unit === 'M') return n === 1 ? '1M' : null;
    let minutes: number;
    if (unit === '') minutes = n;
    else if (unit === 'm') minutes = n;
    else if (unit === 'h') minutes = n * 60;
    else if (unit === 'd') minutes = n * 1440;
    else minutes = n * 10080;
    if (minutes % 10080 === 0 && minutes / 10080 <= 99) return `${minutes / 10080}w`;
    if (minutes % 1440 === 0 && minutes / 1440 <= 99) return `${minutes / 1440}d`;
    if (minutes % 60 === 0 && minutes / 60 <= 99) return `${minutes / 60}h`;
    return minutes <= 999 ? `${minutes}m` : null;
}

export interface ScriptBindingLite { scriptId: string | null; scriptName: string }
export interface ScriptCoreLite { id: string; name: string }

/**
 * Which script instances an alert watches: instances whose id equals the stored script id; if there is none,
 * instances with the same (case-insensitive) script name.
 */
export function selectBindingCores<T extends ScriptCoreLite>(binding: ScriptBindingLite, cores: readonly T[]): T[] {
    if (binding.scriptId) {
        const byId = cores.filter((c) => c.id === binding.scriptId);
        if (byId.length > 0) return byId;
    }
    const name = binding.scriptName.trim().toLowerCase();
    return name ? cores.filter((c) => c.name.trim().toLowerCase() === name) : [];
}

/** True when the alert's symbol is the chart's ("EXCHANGE:CODE" exact; a legacy bare code matches the code). */
export function symbolMatches(alertSymbol: string, chartSymbol: string): boolean {
    if (alertSymbol === chartSymbol) return true;
    if (alertSymbol.indexOf(':') >= 0) return false;
    const i = chartSymbol.lastIndexOf(':');
    return (i >= 0 ? chartSymbol.slice(i + 1) : chartSymbol) === alertSymbol;
}

/** True when the script source contains an alert( call (comments and string literals ignored). */
export function sourceUsesAlertCall(source: string): boolean {
    const src = source.replace(
        /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g,
        (m) => (m[0] === '/' ? ' ' : '""'),
    );
    return /(^|[^\w.$])alert\s*\(/.test(src);
}
