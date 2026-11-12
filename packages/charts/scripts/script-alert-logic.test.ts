// Standalone tests for src/alerts/script-alert-logic.ts (script alert arming / bar selection / de-dup).
//   node scripts/run-script-alert-logic-test.mjs

import assert from 'node:assert/strict';
import {
    ScriptAlertEvaluator, MemorySentStore, ScriptRunView, ScriptAlertSpec, ScriptAlertTrigger, ScriptEventLite, SentStore,
    scriptAlertInterval, selectBindingCores, sourceUsesAlertCall, symbolMatches, isFresh,
} from '../src/alerts/script-alert-logic';

let passed = 0;
function test(name: string, fn: () => void): void {
    NOW = T0 + 100;
    try { fn(); passed++; console.log('ok   - ' + name); } catch (e) { console.log('FAIL - ' + name); console.log(e); process.exitCode = 1; }
}

const BAR = 3600;
const T0 = 1_800_000_000 - (1_800_000_000 % BAR); // a bar open time
let NOW = T0 + 100;

/** Simulated script: bars at T0 + i*BAR, flags / events per bar open time. */
class Sim {
    flags = new Map<string, Set<number>>();
    events = new Map<number, ScriptEventLite[]>();
    key = 'k1';
    replay = false;
    forming = true;
    firstBar = T0 - 50 * BAR;
    lastBar = T0;
    setFlag(title: string, barTime: number): void {
        if (!this.flags.has(title)) this.flags.set(title, new Set());
        this.flags.get(title)!.add(barTime);
    }
    addEvent(barTime: number, message: string, freq = 'all'): void {
        this.events.set(barTime, [...(this.events.get(barTime) ?? []), { message, freq }]);
    }
    view(): ScriptRunView {
        const last = this.lastBar, first = this.firstBar;
        const len = (last - first) / BAR + 1;
        const timeOf = (i: number): number => first + i * BAR;
        return {
            key: this.key, replay: this.replay, len, lastTime: last, prevTime: len >= 2 ? last - BAR : null,
            lastClose: 100 + (last - T0) / BAR, prevClose: 99 + (last - T0) / BAR, forming: this.forming, barSec: BAR,
            flag: (title, i) => this.flags.get(title)?.has(timeOf(i)) ?? false,
            conditionMessage: (title) => `msg:${title}`,
            eventsAt: (i) => this.events.get(timeOf(i)) ?? [],
        };
    }
}

const cond = (id: string, trigger: ScriptAlertTrigger, title = 'Long'): ScriptAlertSpec => ({ id, mode: 'condition', title, trigger });
const evt = (id: string, trigger: ScriptAlertTrigger): ScriptAlertSpec => ({ id, mode: 'alert', title: null, trigger });
const mk = (sent: SentStore = new MemorySentStore()): ScriptAlertEvaluator => new ScriptAlertEvaluator(sent, () => NOW);

test('arming run never fires, even with history flags set', () => {
    const sim = new Sim(); const ev = mk();
    for (let i = -40; i <= 0; i++) { sim.setFlag('Long', T0 + i * BAR); sim.addEvent(T0 + i * BAR, 'old'); }
    for (const spec of [cond('a', 'once_per_bar_close'), cond('b', 'once_per_bar'), cond('c', 'once'), evt('d', 'once_per_bar_close'), evt('e', 'once_per_bar')]) {
        assert.deepEqual(ev.evaluate('core', sim.view(), [spec]), []);
    }
});

test('bar close fires exactly once for the closed bar', () => {
    const sim = new Sim(); const ev = mk();
    const spec = cond('a', 'once_per_bar_close');
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []); // arm on T0
    sim.setFlag('Long', T0);
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []); // forming ticks: nothing
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
    sim.lastBar = T0 + BAR; NOW = T0 + BAR + 5; // new bar opens
    const f = ev.evaluate('c', sim.view(), [spec]);
    assert.equal(f.length, 1);
    assert.equal(f[0].barTime, T0);
    assert.equal(f[0].message, 'msg:Long');
    assert.equal(f[0].price, 99 + 1); // prevClose of the run that includes the new bar
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []); // later ticks of the new bar
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
});

test('bar close: flag on the new forming bar does not fire until it closes', () => {
    const sim = new Sim(); const ev = mk(); const spec = cond('a', 'once_per_bar_close');
    ev.evaluate('c', sim.view(), [spec]);
    sim.lastBar = T0 + BAR; NOW = T0 + BAR + 5; sim.setFlag('Long', T0 + BAR);
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
    sim.lastBar = T0 + 2 * BAR; NOW = T0 + 2 * BAR + 5;
    const f = ev.evaluate('c', sim.view(), [spec]);
    assert.deepEqual(f.map((x) => x.barTime), [T0 + BAR]);
});

test('forming bar fires once per bar at the first run with the flag', () => {
    const sim = new Sim(); const ev = mk(); const spec = cond('a', 'once_per_bar');
    ev.evaluate('c', sim.view(), [spec]);
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
    sim.setFlag('Long', T0);
    const f = ev.evaluate('c', sim.view(), [spec]);
    assert.deepEqual(f.map((x) => x.barTime), [T0]);
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
    // closing the bar does not fire it again
    sim.lastBar = T0 + BAR; NOW = T0 + BAR + 5;
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
    sim.setFlag('Long', T0 + BAR);
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]).map((x) => x.barTime), [T0 + BAR]);
});

test('forming mode: flag already set at arming time is not fired (also not at close)', () => {
    const sim = new Sim(); const ev = mk(); const spec = cond('a', 'once_per_bar');
    sim.setFlag('Long', T0);
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
    sim.lastBar = T0 + BAR; NOW = T0 + BAR + 5;
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
});

test('forming mode catches a flag that only appears in the closing run', () => {
    const sim = new Sim(); const ev = mk(); const spec = cond('a', 'once');
    ev.evaluate('c', sim.view(), [spec]);
    sim.setFlag('Long', T0); sim.lastBar = T0 + BAR; NOW = T0 + BAR + 5;
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]).map((x) => x.barTime), [T0]);
});

test('close mode: flag set at arming bar still fires when that bar closes', () => {
    const sim = new Sim(); const ev = mk(); const spec = cond('a', 'once_per_bar_close');
    sim.setFlag('Long', T0);
    ev.evaluate('c', sim.view(), [spec]);
    sim.lastBar = T0 + BAR; NOW = T0 + BAR + 5;
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]).map((x) => x.barTime), [T0]);
});

test('symbol / timeframe switch re-arms: old flags never fire', () => {
    const sim = new Sim(); const ev = mk(); const spec = cond('a', 'once_per_bar_close');
    ev.evaluate('c', sim.view(), [spec]);
    sim.key = 'k2'; // other symbol: the new data ends at a much later bar, lots of flags in history
    sim.firstBar = T0 - 200 * BAR; sim.lastBar = T0 + 10 * BAR; NOW = T0 + 10 * BAR + 5;
    for (let i = -100; i <= 10; i++) sim.setFlag('Long', T0 + i * BAR);
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []); // re-arm run
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
    sim.lastBar = T0 + 11 * BAR; NOW = T0 + 11 * BAR + 5;
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]).map((x) => x.barTime), [T0 + 10 * BAR]);
});

test('recompile (new run key) re-arms', () => {
    const sim = new Sim(); const ev = mk(); const spec = cond('a', 'once_per_bar_close');
    ev.evaluate('c', sim.view(), [spec]);
    sim.lastBar = T0 + BAR; NOW = T0 + BAR + 5;
    sim.key = 'edited-source';
    for (let i = -5; i <= 1; i++) sim.setFlag('Long', T0 + i * BAR);
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
    // the bar that closes next (T0 + BAR) was the arming bar of the new key and fires at its close
    sim.lastBar = T0 + 2 * BAR; NOW = T0 + 2 * BAR + 5;
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]).map((x) => x.barTime), [T0 + BAR]);
});

test('stale (closed last bar) data does not arm', () => {
    const sim = new Sim(); const ev = mk(); const spec = cond('a', 'once_per_bar_close');
    sim.forming = false; sim.setFlag('Long', T0);
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
    assert.equal(ev.isArmed('c', 'a'), false);
    sim.forming = true;
    ev.evaluate('c', sim.view(), [spec]);
    assert.equal(ev.isArmed('c', 'a'), true);
});

test('replay never fires and disarms; re-arms afterwards', () => {
    const sim = new Sim(); const ev = mk(); const spec = cond('a', 'once_per_bar');
    ev.evaluate('c', sim.view(), [spec]);
    sim.replay = true; sim.setFlag('Long', T0);
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
    assert.equal(ev.isArmed('c', 'a'), false);
    sim.replay = false; // replay ended: arming run (flag already set -> suppressed)
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
    sim.lastBar = T0 + BAR; NOW = T0 + BAR + 5; sim.setFlag('Long', T0 + BAR);
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]).map((x) => x.barTime), [T0 + BAR]);
});

test('prepended history (older bars, same last bar) fires nothing and keeps the arming', () => {
    const sim = new Sim(); const ev = mk(); const spec = cond('a', 'once_per_bar_close');
    ev.evaluate('c', sim.view(), [spec]);
    sim.firstBar = T0 - 500 * BAR; // scroll-left loaded more history
    for (let i = -400; i < 0; i++) sim.setFlag('Long', T0 + i * BAR);
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
    sim.setFlag('Long', T0); sim.lastBar = T0 + BAR; NOW = T0 + BAR + 5;
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]).map((x) => x.barTime), [T0]);
});

test('reload in the same bar: shared sent store suppresses the repeat, new evaluator re-arms', () => {
    const sent = new MemorySentStore();
    const sim = new Sim(); const spec = cond('a', 'once_per_bar');
    let ev = mk(sent);
    ev.evaluate('c', sim.view(), [spec]);
    sim.setFlag('Long', T0);
    assert.equal(ev.evaluate('c', sim.view(), [spec]).length, 1);
    ev = mk(sent); // page reload: fresh evaluator, sessionStorage keeps `sent`
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
    // close mode alert fired at close, reload in the next bar, bar T0 evaluated again by nobody
    const s2 = new MemorySentStore(); const spec2 = cond('b', 'once_per_bar_close');
    const sim2 = new Sim(); sim2.setFlag('Long', T0);
    let e2 = mk(s2);
    e2.evaluate('c', sim2.view(), [spec2]);
    sim2.lastBar = T0 + BAR; NOW = T0 + BAR + 5;
    assert.equal(e2.evaluate('c', sim2.view(), [spec2]).length, 1);
    e2 = mk(s2);
    assert.deepEqual(e2.evaluate('c', sim2.view(), [spec2]), []);
    sim2.lastBar = T0 + 2 * BAR; NOW = T0 + 2 * BAR + 5;
    assert.deepEqual(e2.evaluate('c', sim2.view(), [spec2]), []);
    NOW = T0 + 100;
});

test('two cores (two tabs / charts) with a shared sent store fire a bar once', () => {
    const sent = new MemorySentStore(); const ev = mk(sent); const spec = cond('a', 'once_per_bar');
    const a = new Sim(), b = new Sim();
    ev.evaluate('c1', a.view(), [spec]); ev.evaluate('c2', b.view(), [spec]);
    a.setFlag('Long', T0); b.setFlag('Long', T0);
    const n = ev.evaluate('c1', a.view(), [spec]).length + ev.evaluate('c2', b.view(), [spec]).length;
    assert.equal(n, 1);
});

test('alert(): close trigger waits for the close regardless of script freq', () => {
    for (const freq of ['all', 'once_per_bar', 'once_per_bar_close']) {
        const sim = new Sim(); const ev = mk(); const spec = evt('a', 'once_per_bar_close');
        ev.evaluate('c', sim.view(), [spec]);
        sim.addEvent(T0, `hi-${freq}`, freq);
        assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), [], freq);
        sim.lastBar = T0 + BAR; NOW = T0 + BAR + 5;
        const f = ev.evaluate('c', sim.view(), [spec]);
        assert.deepEqual(f.map((x) => [x.barTime, x.message]), [[T0, `hi-${freq}`]], freq);
    }
});

test('alert(): forming trigger fires at once for freq all / once_per_bar, close-only freq waits', () => {
    for (const trig of ['once', 'once_per_bar'] as ScriptAlertTrigger[]) {
        for (const freq of ['all', 'once_per_bar']) {
            const sim = new Sim(); const ev = mk(); const spec = evt('a', trig);
            ev.evaluate('c', sim.view(), [spec]);
            sim.addEvent(T0, 'first', freq); sim.addEvent(T0, 'second', freq);
            const f = ev.evaluate('c', sim.view(), [spec]);
            assert.deepEqual(f.map((x) => x.message), ['first'], `${trig}/${freq}`);
            sim.addEvent(T0, 'third', freq);
            assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
        }
        const sim = new Sim(); const ev = mk(); const spec = evt('a', trig);
        ev.evaluate('c', sim.view(), [spec]);
        sim.addEvent(T0, 'late', 'once_per_bar_close');
        assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), [], `${trig}/close-freq forming`);
        sim.lastBar = T0 + BAR; NOW = T0 + BAR + 5;
        assert.deepEqual(ev.evaluate('c', sim.view(), [spec]).map((x) => x.message), ['late'], `${trig}/close-freq closed`);
    }
});

test('alert(): events present at arming time are not fired (forming mode)', () => {
    const sim = new Sim(); const ev = mk(); const spec = evt('a', 'once_per_bar');
    sim.addEvent(T0, 'old');
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
});

test('client side freshness mirrors the server window', () => {
    assert.equal(isFresh(T0, T0 + 2 * BAR, BAR), true);
    assert.equal(isFresh(T0, T0 + 2 * BAR + 1, BAR), false);
    assert.equal(isFresh(T0 + BAR, T0, BAR), true);
    assert.equal(isFresh(T0 + BAR + 1, T0, BAR), false);
    assert.equal(isFresh(1, T0, null), true);
    // a lagging closed bar (laptop slept for hours) is not sent
    const sim = new Sim(); const ev = mk(); const spec = cond('a', 'once_per_bar_close');
    ev.evaluate('c', sim.view(), [spec]);
    sim.setFlag('Long', T0); sim.lastBar = T0 + BAR; NOW = T0 + 10 * BAR;
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []);
    NOW = T0 + 100;
});

test('forgetAlert re-arms (stopped then restarted alert does not fire for the gap)', () => {
    const sim = new Sim(); const ev = mk(); const spec = cond('a', 'once_per_bar_close');
    ev.evaluate('c', sim.view(), [spec]);
    ev.forgetAlert('a');
    assert.equal(ev.isArmed('c', 'a'), false);
    sim.setFlag('Long', T0); sim.lastBar = T0 + 3 * BAR; NOW = T0 + 3 * BAR + 5;
    assert.deepEqual(ev.evaluate('c', sim.view(), [spec]), []); // re-arm at T0+3
    NOW = T0 + 100;
});

test('keepAlerts / keepCores drop stale state', () => {
    const sim = new Sim(); const ev = mk();
    ev.evaluate('c1', sim.view(), [cond('a', 'once'), cond('b', 'once')]);
    ev.keepAlerts(new Set(['a']));
    assert.equal(ev.isArmed('c1', 'a'), true);
    assert.equal(ev.isArmed('c1', 'b'), false);
    ev.keepCores(new Set(['other']));
    assert.equal(ev.isArmed('c1', 'a'), false);
});

test('scriptAlertInterval', () => {
    const cases: Record<string, string | null> = {
        '1m': '1m', '15m': '15m', '60': '1h', '1H': '1h', '4h': '4h', '240': '4h', '1D': '1d', '1d': '1d', '1W': '1w', '1M': '1M',
        '90': '90m', '2h': '2h', '3m': '3m', '1440': '1d', '': null, 'x': null, '30s': null, '2M': null,
    };
    for (const [k, v] of Object.entries(cases)) assert.equal(scriptAlertInterval(k), v, k);
});

test('selectBindingCores: id first, name fallback', () => {
    const cores = [{ id: 'A', name: 'RSI Strat' }, { id: 'B', name: 'rsi strat' }, { id: 'C', name: 'Other' }];
    assert.deepEqual(selectBindingCores({ scriptId: 'B', scriptName: 'x' }, cores).map((c) => c.id), ['B']);
    assert.deepEqual(selectBindingCores({ scriptId: 'gone', scriptName: 'RSI Strat' }, cores).map((c) => c.id), ['A', 'B']);
    assert.deepEqual(selectBindingCores({ scriptId: null, scriptName: 'nope' }, cores), []);
    assert.deepEqual(selectBindingCores({ scriptId: null, scriptName: '' }, cores), []);
});

test('symbolMatches / sourceUsesAlertCall', () => {
    assert.equal(symbolMatches('BINANCE:BTCUSDT', 'BINANCE:BTCUSDT'), true);
    assert.equal(symbolMatches('BINANCE:BTCUSDT', 'BINANCE-FUTURES:BTCUSDT'), false);
    assert.equal(symbolMatches('BTCUSDT', 'BINANCE:BTCUSDT'), true);
    assert.equal(sourceUsesAlertCall('if x { alert("hi") }'), true);
    assert.equal(sourceUsesAlertCall('alert ("hi", alert.freq_all)'), true);
    assert.equal(sourceUsesAlertCall('alertcondition(x, "t")'), false);
    assert.equal(sourceUsesAlertCall('// alert("no")\nplot(1)'), false);
    assert.equal(sourceUsesAlertCall('s = "alert(x)"; plot(1) /* alert(1) */'), false);
    assert.equal(sourceUsesAlertCall('s = "http://x"; alert(s)'), true);
});

console.log(`\n${passed} passed${process.exitCode ? ' (with failures)' : ''}`);
