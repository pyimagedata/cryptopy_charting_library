// Fetch / poll state machine tests for RemotePaneIndicator, DerivsPaneIndicator, FundingRateIndicator.
// Fake timers, controllable clock (Date.now), stubbed `document`, injected providers: no network, no DOM.
// Run from packages/charts:  node scripts/run-remote-pane-test.mjs

import assert from 'node:assert/strict';
import { OpenInterestIndicator } from '../src/indicators/open-interest-indicator';
import { LongShortRatioIndicator } from '../src/indicators/long-short-ratio-indicator';
import { FundingRateIndicator } from '../src/indicators/funding-rate-indicator';
import { DerivsPaneIndicator, derivsRequestCache, DerivsQuery, DerivsResponse } from '../src/indicators/remote-pane-base';

// ---------- fake environment ----------
const realSetImmediate = setImmediate;
let nowMs = 0;
interface FakeTimer { id: number; at: number; fn: () => void; every: number | null }
let timers: FakeTimer[] = [];
let nextId = 1;
(globalThis as any).setTimeout = (fn: () => void, ms = 0) => { const id = nextId++; timers.push({ id, at: nowMs + ms, fn, every: null }); return id; };
(globalThis as any).setInterval = (fn: () => void, ms = 0) => { const id = nextId++; timers.push({ id, at: nowMs + ms, fn, every: ms }); return id; };
(globalThis as any).clearTimeout = (id: number) => { timers = timers.filter((t) => t.id !== id); };
(globalThis as any).clearInterval = (globalThis as any).clearTimeout;
Date.now = () => nowMs;

const listeners: Array<() => void> = [];
const doc = {
    hidden: false,
    addEventListener: (_: string, fn: () => void) => { listeners.push(fn); },
    removeEventListener: (_: string, fn: () => void) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
};
(globalThis as any).document = doc;

const flush = () => new Promise<void>((r) => realSetImmediate(r));
async function advance(ms: number): Promise<void> {
    const target = nowMs + ms;
    for (;;) {
        const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        nowMs = Math.max(nowMs, due.at);
        if (due.every !== null) due.at += due.every; else timers = timers.filter((t) => t !== due);
        due.fn();
        await flush();
    }
    nowMs = target;
    await flush();
}

const DAY = 86400;
const BASE_SEC = 1_800_000_000 - (1_800_000_000 % DAY);

function reset(): void {
    timers = [];
    listeners.length = 0;
    doc.hidden = false;
    nowMs = (BASE_SEC + 12 * 3600) * 1000 + 30_000;
    derivsRequestCache.clear();
    DerivsPaneIndicator.defaultProvider = null;
    FundingRateIndicator.defaultProvider = null;
}

function makeBars(stepSec: number, n: number): any[] {
    const end = Math.floor(nowMs / 1000 / stepSec) * stepSec;
    const out: any[] = [];
    for (let i = n - 1; i >= 0; i--) out.push({ time: end - i * stepSec, open: 1, high: 1, low: 1, close: 1 });
    return out;
}

function ctx(tf: string, symbol = 'BTCUSDT', extra: Record<string, unknown> = {}): any {
    return { symbol, timeframe: tf, exchange: 'BINANCE', ...extra };
}

class Fake {
    calls: Array<{ q: DerivsQuery; at: number }> = [];
    mode: 'ok' | 'degraded' | 'fail503' | 'fail404' | 'fail403' = 'ok';
    period: string | undefined;
    value = 100;
    gate: Array<() => void> | null = null;
    provider = async (q: DerivsQuery): Promise<DerivsResponse> => {
        this.calls.push({ q, at: nowMs });
        if (this.gate) await new Promise<void>((r) => this.gate!.push(r));
        if (this.mode === 'fail503') throw Object.assign(new Error('x'), { status: 503 });
        if (this.mode === 'fail404') throw Object.assign(new Error('x'), { status: 404 });
        if (this.mode === 'fail403') throw Object.assign(new Error('x'), { status: 403 });
        const step = q.interval === '1h' ? 3600 : q.interval.endsWith('m') ? parseInt(q.interval) * 60 : DAY;
        const bars: DerivsResponse['bars'] = [];
        const from = Math.ceil(q.from / step) * step;
        for (let t = from; t <= q.to && bars.length < 5000; t += step) bars.push([t, this.value + (t / step) % 7, 1.1, 1.2, 1.3, 1.4]);
        return { symbol: q.symbol, interval: q.interval, source: 'live', period: this.period, degraded: this.mode === 'degraded' ? true : undefined, bars };
    };
}

function make<T extends OpenInterestIndicator | LongShortRatioIndicator>(Cls: new () => T, tf: string, bars: any[], symbol = 'BTCUSDT'): T {
    const ind = new Cls();
    ind.setContext(ctx(tf, symbol));
    ind.calculate(bars);
    return ind;
}

let passed = 0;
async function test(name: string, fn: () => Promise<void>): Promise<void> {
    reset();
    try {
        await fn();
        passed++;
        console.log('ok   - ' + name);
    } catch (e) {
        console.log('FAIL - ' + name);
        console.log(e);
        process.exitCode = 1;
    }
}

export async function runMachineTests(): Promise<number> {
    await test('first load: request counts for 1m / 5m / 1h charts', async () => {
        for (const [tf, step, n, expected] of [['1m', 60, 5000, 1], ['5m', 300, 3000, 1], ['1h', 3600, 5000, 2]] as const) {
            reset();
            const f = new Fake();
            DerivsPaneIndicator.defaultProvider = f.provider;
            const ind = make(OpenInterestIndicator, tf, makeBars(step, n));
            await advance(500);
            assert.equal(f.calls.length, expected, `${tf}: requests`);
            if (tf === '1m') assert.equal(f.calls[0].q.interval, '5m'); // sub-5m charts ask for 5m points
            if (tf === '1m') assert.ok(f.calls[0].q.from >= Math.floor(nowMs / 1000) - 29 * DAY - 1, 'clamped to 29 days');
            ind.destroy();
        }
    });

    await test('failure: calculate path does not retry; first retry after 15 s, then 60 s', async () => {
        const f = new Fake();
        f.mode = 'fail503';
        DerivsPaneIndicator.defaultProvider = f.provider;
        const ind = make(OpenInterestIndicator, '5m', makeBars(300, 500));
        await advance(500);
        assert.equal(f.calls.length, 1);
        for (let i = 0; i < 12; i++) { ind.calculate(makeBars(300, 500)); await advance(1000); } // ~12 s of data updates
        assert.equal(f.calls.length, 1, 'no retry from calculate');
        f.mode = 'ok'; // transient error is over
        await advance(5_000);
        assert.equal(f.calls.length, 2, 'retry 15 s after the failure');
        assert.ok((ind as any)._oi.some((v: number | null) => v !== null), 'recovered');
        ind.destroy();

        reset();
        const g = new Fake();
        g.mode = 'fail503';
        DerivsPaneIndicator.defaultProvider = g.provider;
        const ind2 = make(OpenInterestIndicator, '5m', makeBars(300, 500));
        await advance(500 + 15_100);
        assert.equal(g.calls.length, 2);
        await advance(50_000);
        assert.equal(g.calls.length, 2, 'second wait is 60 s');
        await advance(11_000);
        assert.equal(g.calls.length, 3);
        ind2.destroy();
    });

    await test('tab visible again retries at once (>= 5 s after the last attempt); symbol change retries at once', async () => {
        const f = new Fake();
        f.mode = 'fail503';
        DerivsPaneIndicator.defaultProvider = f.provider;
        const ind = make(OpenInterestIndicator, '5m', makeBars(300, 500));
        await advance(500);
        assert.equal(f.calls.length, 1);
        await advance(2_000);
        listeners.slice().forEach((fn) => fn()); // visibilitychange 2 s after the attempt: too soon
        await flush();
        assert.equal(f.calls.length, 1, '5 s minimum gap');
        await advance(4_000);
        f.mode = 'ok';
        listeners.slice().forEach((fn) => fn());
        await flush();
        assert.equal(f.calls.length, 2, 'forced retry inside the back-off window');
        assert.ok((ind as any)._oi.some((v: number | null) => v !== null));
        ind.destroy();

        reset();
        const g = new Fake();
        g.mode = 'fail503';
        DerivsPaneIndicator.defaultProvider = g.provider;
        const ind2 = make(OpenInterestIndicator, '5m', makeBars(300, 500));
        await advance(500);
        ind2.setContext(ctx('15m'));
        ind2.calculate(makeBars(900, 300));
        await advance(500);
        assert.equal(g.calls.length, 2, 'timeframe change loads at once');
        ind2.destroy();
    });

    await test('persistent degraded: bounded requests per hour, growing gaps, data kept', async () => {
        const f = new Fake();
        f.mode = 'degraded';
        DerivsPaneIndicator.defaultProvider = f.provider;
        const ind = make(OpenInterestIndicator, '1h', makeBars(3600, 5000)); // 2 chunks
        await advance(500);
        assert.equal(f.calls.length, 1, 'pass stops at the first degraded chunk');
        assert.ok((ind as any)._oi.some((v: number | null) => v !== null), 'degraded data is kept');
        await advance(3600_000 - 500);
        const n = f.calls.length;
        assert.ok(n <= 12, `requests in an hour: ${n}`);
        assert.equal(f.calls[1].at - f.calls[0].at, 15_025, 'first retry after 15 s');
        const gaps = f.calls.slice(1).map((c, i) => c.at - f.calls[i].at);
        for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] >= gaps[i - 1] - 1, `gaps grow: ${gaps.join(',')}`);
        assert.ok(Math.max(...gaps) <= 600_000 + 60_000, 'back-off capped at 10 min');
        console.log(`       (degraded hour: ${n} requests, gaps s = ${gaps.map((g) => Math.round(g / 1000)).join(',')})`);
        ind.destroy();
    });

    await test('recovery resets the back-off (one tail request per minute again)', async () => {
        const f = new Fake();
        f.mode = 'degraded';
        DerivsPaneIndicator.defaultProvider = f.provider;
        const ind = make(OpenInterestIndicator, '1h', makeBars(3600, 500));
        await advance(500);
        await advance(1200_000); // streak grows
        f.mode = 'ok';
        await advance(700_000); // beyond the longest wait: a clean pass happens
        const before = f.calls.length;
        await advance(180_000);
        assert.equal(f.calls.length - before, 3, 'one request per poll after recovery');
        ind.destroy();
    });

    await test('tail poll always refetches; two panes on one chart share a single request', async () => {
        const f = new Fake();
        DerivsPaneIndicator.defaultProvider = f.provider;
        const bars = makeBars(300, 500);
        const a = make(OpenInterestIndicator, '5m', bars);
        const b = make(LongShortRatioIndicator, '5m', bars);
        await advance(500);
        assert.equal(f.calls.length, 1, 'initial load deduplicated');
        await advance(60_000);
        assert.equal(f.calls.length, 2, 'first poll: fresh, shared by both');
        await advance(60_000);
        await advance(60_000);
        assert.equal(f.calls.length, 4, 'every poll refetches (not served from the 60 s cache)');
        a.destroy(); b.destroy();
    });

    await test('hidden tab / hidden indicator: no requests; visibility refresh on return', async () => {
        const f = new Fake();
        DerivsPaneIndicator.defaultProvider = f.provider;
        doc.hidden = true;
        const ind = make(OpenInterestIndicator, '5m', makeBars(300, 500));
        await advance(130_000);
        assert.equal(f.calls.length, 0, 'background tab');
        doc.hidden = false;
        listeners.slice().forEach((fn) => fn());
        await flush();
        assert.equal(f.calls.length, 1, 'refresh on becoming visible');
        const ind2 = make(LongShortRatioIndicator, '15m', makeBars(900, 300));
        (ind2 as any)._options.visible = false;
        const n = f.calls.length;
        await advance(130_000);
        assert.equal(f.calls.filter((c) => c.q.interval === '15m').length, 0, `hidden indicator (${n})`);
        ind.destroy(); ind2.destroy();
    });

    await test('symbol change mid-flight: the late response is dropped', async () => {
        const f = new Fake();
        f.gate = [];
        DerivsPaneIndicator.defaultProvider = f.provider;
        const ind = make(OpenInterestIndicator, '5m', makeBars(300, 500));
        await advance(500);
        assert.equal(f.calls.length, 1);
        const oldGate = f.gate.slice();
        ind.setContext(ctx('5m', 'ETHUSDT'));
        ind.calculate(makeBars(300, 500));
        await advance(500);
        assert.equal(f.calls.length, 2);
        oldGate.forEach((r) => r());
        await flush();
        assert.equal((ind as any)._points.size, 0, 'BTC answer ignored');
        f.gate.slice(oldGate.length).forEach((r) => r());
        await flush();
        assert.ok((ind as any)._points.size > 0, 'ETH answer used');
        ind.destroy();
    });

    await test('4xx blocks until the context changes; 403 shows the legend notice', async () => {
        const f = new Fake();
        f.mode = 'fail403';
        DerivsPaneIndicator.defaultProvider = f.provider;
        const ind = make(OpenInterestIndicator, '5m', makeBars(300, 500));
        await advance(500);
        await advance(300_000);
        ind.calculate(makeBars(300, 500));
        await advance(1000);
        assert.equal(f.calls.length, 1);
        assert.ok(ind.getLegendInfo().error);
        f.mode = 'ok';
        ind.setContext(ctx('5m', 'ETHUSDT'));
        ind.calculate(makeBars(300, 500));
        await advance(500);
        assert.equal(f.calls.length, 2);
        ind.destroy();
    });

    await test('replay and non-Binance symbols: zero requests', async () => {
        const f = new Fake();
        DerivsPaneIndicator.defaultProvider = f.provider;
        const ind = new OpenInterestIndicator();
        ind.setContext(ctx('5m', 'BTCUSDT', { end: 1_000 }));
        ind.calculate(makeBars(300, 500));
        const other = new LongShortRatioIndicator();
        other.setContext({ symbol: 'AAPL', timeframe: '5m', exchange: 'NASDAQ' });
        other.calculate(makeBars(300, 500));
        await advance(200_000);
        assert.equal(f.calls.length, 0);
        ind.destroy(); other.destroy();
    });

    await test('funding: truncated answer continues with the older part, capped at 4 requests', async () => {
        const calls: Array<{ from: number; to: number }> = [];
        FundingRateIndicator.defaultProvider = async (q) => {
            calls.push({ from: q.from, to: q.to });
            const n = Math.min(5000, Math.floor((q.to - q.from) / 3600) + 1);
            const rows: Array<[number, number]> = [];
            for (let k = 0; k < n; k++) rows.push([q.to - (n - 1 - k) * 3600, 0.0001]);
            return { rows, current: { rate: 0.0001, next_funding_time: Math.floor(nowMs / 1000) + 3600 }, interval_hours: 1 };
        };
        const ind = new FundingRateIndicator();
        ind.setContext(ctx('1D'));
        ind.calculate(makeBars(DAY, 4000)); // ~11 years: way beyond 4 x 5000 hourly rows
        await advance(500);
        assert.equal(calls.length, 4, 'hard cap');
        for (let i = 1; i < calls.length; i++) assert.equal(calls[i].to, calls[i - 1].to - 4999 * 3600 - 1, 'continues below the oldest row');
        ind.destroy();

        reset();
        let n2 = 0;
        FundingRateIndicator.defaultProvider = async (q) => {
            n2++;
            return { rows: [[q.to - 100, 0.0001]], current: null, interval_hours: 8 };
        };
        const ind2 = new FundingRateIndicator();
        ind2.setContext(ctx('1D'));
        ind2.calculate(makeBars(DAY, 400));
        await advance(500);
        assert.equal(n2, 1, 'not truncated: one request');
        ind2.destroy();
    });

    await test('step-hold visibility: 5m points appear at t+5m on a 1m chart, own bar on a 5m chart', async () => {
        const f = new Fake();
        f.period = '5m';
        DerivsPaneIndicator.defaultProvider = f.provider;
        const bars1 = makeBars(60, 600);
        const ind = make(OpenInterestIndicator, '1m', bars1);
        await advance(500);
        const oi: Array<number | null> = (ind as any)._oi;
        const t0 = Math.ceil(bars1[10].time / 300) * 300; // some 5m point inside the range
        const i0 = bars1.findIndex((b) => b.time === t0);
        assert.equal(oi[i0], oi[i0 - 1] === null ? null : oi[i0], 'sanity');
        // bars inside [t0, t0+5m) still show the PREVIOUS point (its own period ended at t0), or nothing before the first point
        const prevPt = f.value + ((t0 - 300) / 300) % 7;
        const curPt = f.value + (t0 / 300) % 7;
        if (i0 - 1 >= 0 && bars1[i0 - 1].time >= Math.ceil(bars1[0].time / 300) * 300 + 300) {
            assert.equal(oi[i0], prevPt, 'point t is not visible during [t, t+5m)');
            assert.equal(oi[i0 + 4], prevPt);
        }
        assert.equal(oi[i0 + 5], curPt, 'point t shows from t+5m');
        ind.destroy();

        reset();
        const f2 = new Fake();
        f2.period = '5m';
        DerivsPaneIndicator.defaultProvider = f2.provider;
        const bars5 = makeBars(300, 100);
        const ind5 = make(OpenInterestIndicator, '5m', bars5);
        await advance(500);
        const oi5: Array<number | null> = (ind5 as any)._oi;
        const k = 50;
        assert.equal(oi5[k], f2.value + (bars5[k].time / 300) % 7, 'equal interval: value on its own bar');
        ind5.destroy();
    });

    await test('open interest delta sits on the bar where the newer server point appears; legend shows the latest step', async () => {
        const f = new Fake();
        f.period = '5m';
        DerivsPaneIndicator.defaultProvider = f.provider;
        const bars = makeBars(60, 600);
        const ind = make(OpenInterestIndicator, '1m', bars);
        await advance(500);
        const delta: Array<number | null> = (ind as any)._delta;
        const nonNull = delta.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
        assert.ok(nonNull.length > 50 && nonNull.length < 200, `delta bars only at step changes (${nonNull.length})`);
        for (const i of nonNull.slice(2)) assert.equal(delta[i - 1], null);
        const pct = (ind as any)._stepPct as Array<number | null>;
        const i = nonNull[10];
        assert.equal(pct[i + 1], pct[i], 'legend keeps the latest step between points');
        ind.destroy();
    });

    await test('non-Binance symbols: BTCUSDT -> EURUSD -> BTCUSDT', async () => {
        const f = new Fake();
        DerivsPaneIndicator.defaultProvider = f.provider;
        const fundingCalls: number[] = [];
        FundingRateIndicator.defaultProvider = async () => { fundingCalls.push(nowMs); return { rows: [], current: null, interval_hours: 8 }; };
        const oi = make(OpenInterestIndicator, '5m', makeBars(300, 500));
        const fr = new FundingRateIndicator();
        fr.setContext(ctx('5m'));
        fr.calculate(makeBars(300, 500));
        await advance(500);
        assert.equal(f.calls.length, 1);
        assert.equal(fundingCalls.length, 1);
        for (const ind of [oi, fr] as any[]) {
            ind.setContext({ symbol: 'EURUSD', timeframe: '5m', exchange: 'OANDA' });
            ind.calculate(makeBars(300, 500));
        }
        await advance(200_000);
        assert.equal(f.calls.length, 1, 'no derivs request for EURUSD');
        assert.equal(fundingCalls.length, 1, 'no funding request for EURUSD');
        for (const ind of [oi, fr] as any[]) {
            ind.setContext(ctx('5m'));
            ind.calculate(makeBars(300, 500));
        }
        await advance(500);
        assert.equal(f.calls.length, 2, 'back to BTCUSDT loads');
        assert.equal(fundingCalls.length, 2);
        oi.destroy(); fr.destroy();
    });

    await test('symbol arrives before the exchange: no request leaks with the stale exchange', async () => {
        const f = new Fake();
        DerivsPaneIndicator.defaultProvider = f.provider;
        let funding = 0;
        FundingRateIndicator.defaultProvider = async () => { funding++; return { rows: [], current: null, interval_hours: 8 }; };
        const oi = make(OpenInterestIndicator, '5m', makeBars(300, 500));
        const fr = new FundingRateIndicator();
        fr.setContext(ctx('5m'));
        fr.calculate(makeBars(300, 500));
        await advance(500);
        const base = f.calls.length, baseF = funding;
        for (const ind of [oi, fr] as any[]) {
            ind.setContext({ symbol: 'EURUSD', timeframe: '5m', exchange: 'BINANCE' }); // new symbol, previous exchange
            ind.calculate(makeBars(300, 500));
        }
        await advance(250);
        for (const ind of [oi, fr] as any[]) ind.setContext({ symbol: 'EURUSD', timeframe: '5m', exchange: 'OANDA' }); // exchange follows
        await advance(5_000);
        assert.equal(f.calls.length, base, 'derivs');
        assert.equal(funding, baseF, 'funding');

        // no calculate() after the symbol change yet: nothing requested with the previous symbol's bars
        for (const ind of [oi, fr] as any[]) ind.setContext(ctx('5m', 'ETHUSDT'));
        await advance(5_000);
        assert.equal(f.calls.length, base, 'bars not recalculated yet');
        for (const ind of [oi, fr] as any[]) ind.calculate(makeBars(300, 500));
        await advance(500);
        assert.equal(f.calls.length, base + 1);
        assert.equal(f.calls[base].q.symbol, 'ETHUSDT');
        assert.equal(funding, baseF + 1);
        oi.destroy(); fr.destroy();
    });

    await test('debounce has a maximum wait: a steady stream of calculate calls cannot starve the load', async () => {
        const f = new Fake();
        DerivsPaneIndicator.defaultProvider = f.provider;
        const ind = new OpenInterestIndicator();
        ind.setContext(ctx('5m'));
        for (let i = 0; i < 6; i++) { ind.calculate(makeBars(300, 500)); await advance(100); }
        assert.ok(f.calls.length >= 1, 'request fired within 300 ms of the first update');
        ind.destroy();
    });

    return passed;
}
