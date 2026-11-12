// Tests for divergence-math / profile-periods and a draw smoke test of the three indicators.
//   node scripts/run-indicator-profiles-test.mjs
import assert from 'node:assert/strict';
import {
    DivergenceEngine, DivergenceConfig, defaultDivergenceConfig, computeRsi, computeMacdHist, findDivergences, DivergenceBar,
} from '../src/indicators/divergence-math';
import {
    periodStartMs, nextPeriodStartMs, lastPeriods, allPeriods, timeframeSeconds, intervalFitsPeriod, summarizeRange,
} from '../src/indicators/profile-periods';
import { computeVolumeProfile } from '../src/indicators/volume-profile-math';
import { RSIIndicator } from '../src/indicators/rsi-indicator';
import { MACDIndicator } from '../src/indicators/macd-indicator';
import { DivergenceIndicator } from '../src/indicators/divergence-indicator';
import { SessionVolumeProfileIndicator } from '../src/indicators/session-volume-profile-indicator';
import { VisibleRangeVolumeProfileIndicator } from '../src/indicators/visible-range-volume-profile-indicator';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log('  ok   ' + name); }
    catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e as Error).message.split('\n').join('\n       ')); }
}

// ---- helpers ----
const cfg = (over: Partial<DivergenceConfig> = {}): DivergenceConfig =>
    ({ ...defaultDivergenceConfig, left: 2, right: 2, minBars: 2, maxBars: 20, ...over });

function engineFromSeries(osc: number[], lows: number[], highs: number[], c: DivergenceConfig): DivergenceEngine {
    const e = new DivergenceEngine(c);
    for (let i = 0; i < osc.length; i++) e.pushWithOsc({ time: 1000 + i, high: highs[i], low: lows[i], close: (highs[i] + lows[i]) / 2 }, osc[i]);
    return e;
}

// osc with strict pivot LOWS at idx 4 (20) and 12 (30); pivot HIGH at idx 8
const OSC_LOW = [50, 45, 40, 35, 20, 35, 40, 45, 50, 45, 40, 35, 30, 35, 40, 45, 50, 55];
const OSC_HIGH = OSC_LOW.map((v) => 100 - v); // pivot HIGHS at 4 (80) and 12 (70)
const N = OSC_LOW.length;
const flat = (v: number) => new Array(N).fill(v);
function withAt(base: number[], a: number, b: number, vb: number, va: number): number[] { const x = base.slice(); x[a] = va; x[b] = vb; return x; }

// ---- pivot timing ----
test('pivot is not known before R bars have passed, and never changes afterwards', () => {
    const c = cfg();
    const lows = withAt(flat(200), 4, 12, 90, 100);
    const highs = lows.map((l) => l + 5);
    const e = new DivergenceEngine(c);
    const snapshots: string[] = [];
    for (let i = 0; i < N; i++) {
        e.pushWithOsc({ time: 1000 + i, high: highs[i], low: lows[i], close: lows[i] }, OSC_LOW[i]);
        snapshots.push(JSON.stringify({ l: e.pivotLows, h: e.pivotHighs, d: e.divergences }));
        if (i < 4 + c.right) assert.equal(e.pivotLows.length, 0, `pivot low 4 must not exist at n=${i + 1}`);
    }
    // pivot at 4 appears exactly when bar 6 (= 4 + R) has been processed, i.e. n = 7
    assert.deepEqual(JSON.parse(snapshots[5]).l, []);
    assert.deepEqual(JSON.parse(snapshots[6]).l, [4]);
    // divergence for pivot 12 appears at n = 15 (12 + 2 + 1) and carries confirmedAt = 14
    assert.equal(JSON.parse(snapshots[13]).d.length, 0);
    assert.equal(JSON.parse(snapshots[14]).d.length, 1);
    assert.equal(e.divergences[0].confirmedAt, 14);
    // earlier outputs are prefixes of later ones
    for (let i = 1; i < snapshots.length; i++) {
        const prev = JSON.parse(snapshots[i - 1]), cur = JSON.parse(snapshots[i]);
        assert.deepEqual(cur.l.slice(0, prev.l.length), prev.l);
        assert.deepEqual(cur.h.slice(0, prev.h.length), prev.h);
        assert.deepEqual(cur.d.slice(0, prev.d.length), prev.d);
    }
});

test('pivot needs strictly lower on the right, non-higher on the left (plateau picks first bar)', () => {
    const e = engineFromSeries([5, 5, 3, 3, 5, 6, 7], flat(1).slice(0, 7), flat(2).slice(0, 7), cfg());
    // idx2: left [5,5] ok, right [3,5] -> 3 <= 3 not strictly lower -> not a pivot; idx3: left has 3 (not lower, ok), right [5,6] strictly higher -> pivot
    assert.deepEqual(e.pivotLows, [3]);
});

// ---- the four divergence types ----
test('regular bullish: price lower low + oscillator higher low', () => {
    const lows = withAt(flat(200), 4, 12, 90, 100);
    const e = engineFromSeries(OSC_LOW, lows, lows.map((l) => l + 5), cfg());
    assert.equal(e.divergences.length, 1);
    const d = e.divergences[0];
    assert.deepEqual([d.kind, d.a, d.b, d.priceA, d.priceB, d.oscA, d.oscB], ['bull', 4, 12, 100, 90, 20, 30]);
});
test('hidden bullish: price higher low + oscillator lower low', () => {
    const osc = OSC_LOW.slice(); osc[12] = 15; // osc[b] < osc[a]
    const lows = withAt(flat(200), 4, 12, 110, 100);
    const e = engineFromSeries(osc, lows, lows.map((l) => l + 5), cfg());
    assert.equal(e.divergences.length, 1);
    assert.equal(e.divergences[0].kind, 'hbull');
});
test('regular bearish: price higher high + oscillator lower high', () => {
    const highs = withAt(flat(100), 4, 12, 110, 100);
    const e = engineFromSeries(OSC_HIGH, highs.map((h) => h - 5), highs, cfg());
    assert.equal(e.divergences.length, 1);
    const d = e.divergences[0];
    assert.deepEqual([d.kind, d.a, d.b, d.priceA, d.priceB, d.oscA, d.oscB], ['bear', 4, 12, 100, 110, 80, 70]);
});
test('hidden bearish: price lower high + oscillator higher high', () => {
    const osc = OSC_HIGH.slice(); osc[12] = 85; // osc[b] > osc[a]
    const highs = withAt(flat(100), 4, 12, 90, 100);
    const e = engineFromSeries(osc, highs.map((h) => h - 5), highs, cfg());
    assert.equal(e.divergences.length, 1);
    assert.equal(e.divergences[0].kind, 'hbear');
});
test('hidden bullish really is the opposite of regular: osc lower low + price higher low gives no "bull"', () => {
    const lows = withAt(flat(200), 4, 12, 110, 100);
    const e = engineFromSeries(OSC_LOW, lows, lows.map((l) => l + 5), cfg());
    assert.ok(!e.divergences.some((d) => d.kind === 'bull'));
});
test('negative: price lower low AND oscillator lower low (and equal prices) gives nothing', () => {
    const osc = OSC_LOW.slice(); osc[12] = 15; // osc[b] < osc[a]
    const lows = withAt(flat(200), 4, 12, 90, 100);
    assert.equal(engineFromSeries(osc, lows, lows.map((l) => l + 5), cfg()).divergences.length, 0);
    const eq = withAt(flat(200), 4, 12, 100, 100);
    assert.equal(engineFromSeries(OSC_LOW, eq, eq.map((l) => l + 5), cfg()).divergences.length, 0);
});

// ---- min / max distance ----
test('min/max bars between pivots (b-a = 8)', () => {
    const lows = withAt(flat(200), 4, 12, 90, 100);
    const highs = lows.map((l) => l + 5);
    assert.equal(engineFromSeries(OSC_LOW, lows, highs, cfg({ minBars: 8, maxBars: 8 })).divergences.length, 1);
    assert.equal(engineFromSeries(OSC_LOW, lows, highs, cfg({ minBars: 9 })).divergences.length, 0);
    assert.equal(engineFromSeries(OSC_LOW, lows, highs, cfg({ maxBars: 7 })).divergences.length, 0);
});

// ---- real oscillators: parity with the library ----
function walk(n: number, seed = 7): DivergenceBar[] & { open: number; volume: number }[] {
    let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    let p = 100; const out: any[] = [];
    for (let i = 0; i < n; i++) {
        const o = p; p = Math.max(5, p + (rnd() - 0.5) * 4 + Math.sin(i / 17) * 0.8);
        const hi = Math.max(o, p) + rnd() * 1.5, lo = Math.min(o, p) - rnd() * 1.5;
        out.push({ time: 1_700_000_000 + i * 3600, open: o, high: hi, low: lo, close: p, volume: 100 + rnd() * 50 });
    }
    return out;
}
test('RSI equals the library RSIIndicator (period 14, 9, 1)', () => {
    const bars = walk(400);
    for (const period of [14, 9, 1]) {
        const lib = new RSIIndicator({ period }); lib.calculate(bars as any);
        const mine = computeRsi(bars.map((b) => b.close), period);
        assert.equal(lib.data.length, mine.length);
        for (let i = 0; i < mine.length; i++) {
            const a = lib.data[i].value, b = mine[i];
            if (Number.isNaN(a)) assert.ok(Number.isNaN(b), `i=${i}`); else assert.equal(b, a, `period ${period} i=${i}`);
        }
    }
});
test('MACD histogram equals the library MACDIndicator (12/26/9) from slow-1 on', () => {
    const bars = walk(400);
    const lib = new MACDIndicator(); lib.calculate(bars as any);
    const mine = computeMacdHist(bars.map((b) => b.close), 12, 26, 9);
    for (let i = 0; i < mine.length; i++) {
        if (i < 25) assert.ok(Number.isNaN(mine[i])); else assert.equal(mine[i], lib.data[i].value, `i=${i}`);
    }
});

test('incremental sync equals batch; earlier outputs never change as bars arrive (RSI and MACD)', () => {
    const bars = walk(500, 3);
    for (const oscillator of ['rsi', 'macd'] as const) {
        const c = { ...defaultDivergenceConfig, oscillator };
        const batch = findDivergences(bars, c);
        const e = new DivergenceEngine(c);
        let prev = '[]';
        for (let k = 1; k <= bars.length; k++) {
            e.sync(bars, k);
            const cur = JSON.stringify(e.divergences);
            assert.ok(cur.startsWith(prev.slice(0, -1)), `outputs changed at k=${k}`);
            prev = cur;
        }
        assert.equal(JSON.stringify(batch), prev);
        assert.ok(batch.length > 0, `${oscillator}: expected some divergences on the walk`);
        // every divergence is only reported once its confirmation bar exists
        for (const d of batch) assert.ok(d.confirmedAt === d.b + c.right && d.confirmedAt < bars.length);
    }
});
test('the forming (last) bar is not used when the caller passes closedCount = n-1', () => {
    const bars = walk(120);
    const e = new DivergenceEngine(defaultDivergenceConfig);
    e.sync(bars, bars.length - 1);
    assert.equal(e.processed, bars.length - 1);
    const changed = bars.slice(); changed[changed.length - 1] = { ...changed[changed.length - 1], close: 1, low: 0.5 } as any;
    const before = JSON.stringify(e.divergences);
    assert.equal(e.sync(changed, changed.length - 1), false);
    assert.equal(JSON.stringify(e.divergences), before);
});
test('history change restarts the engine (prepended bars / different data)', () => {
    const bars = walk(100);
    const e = new DivergenceEngine(defaultDivergenceConfig);
    e.sync(bars, 100);
    const shifted = [{ ...bars[0], time: bars[0].time - 3600 } as any, ...bars];
    assert.equal(e.sync(shifted, shifted.length), true);
    assert.equal(e.processed, shifted.length);
});

// ---- period bucketing ----
const T = (s: string) => Date.parse(s);
test('day / week / month starts (UTC, ISO Monday)', () => {
    assert.equal(periodStartMs(T('2024-03-15T13:45:00Z'), 'day'), T('2024-03-15T00:00:00Z'));
    assert.equal(periodStartMs(T('2024-03-15T13:45:00Z'), 'week'), T('2024-03-11T00:00:00Z')); // Friday -> Monday
    assert.equal(periodStartMs(T('2024-03-11T00:00:00Z'), 'week'), T('2024-03-11T00:00:00Z')); // Monday itself
    assert.equal(periodStartMs(T('2024-03-17T23:59:59Z'), 'week'), T('2024-03-11T00:00:00Z')); // Sunday
    assert.equal(periodStartMs(T('2024-01-01T00:00:00Z'), 'week'), T('2024-01-01T00:00:00Z')); // Monday, year start
    assert.equal(periodStartMs(T('2023-12-31T23:59:59Z'), 'week'), T('2023-12-25T00:00:00Z'));
    assert.equal(periodStartMs(T('1969-12-31T12:00:00Z'), 'week'), T('1969-12-29T00:00:00Z')); // negative epoch
    assert.equal(periodStartMs(T('2024-02-29T23:00:00Z'), 'month'), T('2024-02-01T00:00:00Z'));
    assert.equal(nextPeriodStartMs(T('2024-02-01T00:00:00Z'), 'month'), T('2024-03-01T00:00:00Z'));
    assert.equal(nextPeriodStartMs(T('2023-12-01T00:00:00Z'), 'month'), T('2024-01-01T00:00:00Z'));
    assert.equal(nextPeriodStartMs(T('2024-03-11T00:00:00Z'), 'week'), T('2024-03-18T00:00:00Z'));
});
test('lastPeriods splits bars (seconds or ms) and respects the count', () => {
    const t0 = T('2024-03-14T22:00:00Z');
    const mk = (unit: number) => Array.from({ length: 8 }, (_, i) => ({ time: (t0 + i * 3_600_000) / unit })); // 22:00 .. 05:00 next days
    for (const unit of [1000, 1]) {
        const bars = mk(unit); // 14th: 22,23 | 15th: 00..05
        const day = allPeriods(bars, 'day');
        assert.deepEqual(day.map((p) => [p.first, p.last]), [[0, 1], [2, 7]]);
        assert.equal(day[1].startMs, T('2024-03-15T00:00:00Z'));
        assert.deepEqual(lastPeriods(bars, 'day', 1).map((p) => [p.first, p.last]), [[2, 7]]);
        assert.deepEqual(allPeriods(bars, 'week').map((p) => [p.first, p.last]), [[0, 7]]); // Thu+Fri same ISO week
        assert.deepEqual(allPeriods(bars, 'month').map((p) => [p.first, p.last]), [[0, 7]]);
    }
    const across = [{ time: T('2024-03-31T23:00:00Z') / 1000 }, { time: T('2024-04-01T00:00:00Z') / 1000 }];
    assert.equal(allPeriods(across, 'month').length, 2);
    assert.equal(allPeriods(across, 'week').length, 2); // Sunday 23:00 / Monday 00:00 are different ISO weeks
});
test('week boundary: Sunday 23:00 and Monday 00:00 are different ISO weeks', () => {
    const bars = [{ time: T('2024-03-17T23:00:00Z') / 1000 }, { time: T('2024-03-18T00:00:00Z') / 1000 }];
    assert.equal(allPeriods(bars, 'week').length, 2);
});
test('timeframe parsing and hide-by-interval rule', () => {
    assert.equal(timeframeSeconds('1m'), 60);
    assert.equal(timeframeSeconds('240'), 14400);
    assert.equal(timeframeSeconds('12h'), 43200);
    assert.equal(timeframeSeconds('D'), 86400);
    assert.equal(timeframeSeconds('W'), 604800);
    assert.equal(timeframeSeconds('M'), 31 * 86400);
    assert.equal(timeframeSeconds('90m'), 5400);
    assert.equal(timeframeSeconds('5s'), null);
    assert.equal(intervalFitsPeriod(43200, 'day'), true);
    assert.equal(intervalFitsPeriod(86400, 'day'), false);
    assert.equal(intervalFitsPeriod(604800, 'week'), false);
    assert.equal(intervalFitsPeriod(86400, 'week'), true);
    assert.equal(intervalFitsPeriod(604800, 'month'), true);
    assert.equal(intervalFitsPeriod(31 * 86400, 'month'), false);
    assert.equal(intervalFitsPeriod(null, 'day'), true);
});

// ---- profile maths ----
const B = (low: number, high: number, volume: number, open?: number, close?: number) =>
    ({ open: open ?? low, high, low, close: close ?? high, volume });
test('hand-checkable profile: totals, POC, value area (upper row wins neighbour ties)', () => {
    const bars = [B(0, 1, 10), B(1, 3, 20), B(3, 4, 5), B(1, 2, 10)];
    const out = summarizeRange(bars, 0, 3, 4, 70);
    assert.equal(out.kind, 'ok');
    if (out.kind !== 'ok') return;
    const r = out.profile.result;
    assert.deepEqual(r.bins.map((b) => b.volume), [10, 20, 10, 5]);
    assert.equal(r.totalVolume, 45);
    assert.equal(r.bins.reduce((s, b) => s + b.volume, 0), 45);
    assert.equal(r.pocIndex, 1);
    assert.equal(r.vahIndex, 2); // tie 10 vs 10 -> upper row first (existing computeValueArea: nextHigh >= nextLow)
    assert.equal(r.valIndex, 0); // 30 < 31.5 -> next larger neighbour: row 0 (10) beats row 3 (5)
    assert.deepEqual([out.profile.pocPrice, out.profile.vahPrice, out.profile.valPrice], [1.5, 2.5, 0.5]);
});
test('POC tie: the lowest price row wins', () => {
    const bars = [B(0, 1, 10), B(3, 4, 10)];
    const out = summarizeRange(bars, 0, 1, 4, 70);
    assert.equal(out.kind, 'ok');
    if (out.kind === 'ok') assert.equal(out.profile.result.pocIndex, 0);
});
test('profile total equals the sum of bar volumes on random data, any rows', () => {
    const bars = walk(300, 11);
    const sum = bars.reduce((s, b) => s + b.volume, 0);
    for (const rows of [10, 24, 60, 200]) {
        const out = summarizeRange(bars, 0, bars.length - 1, rows, 70);
        assert.equal(out.kind, 'ok');
        if (out.kind !== 'ok') continue;
        assert.ok(Math.abs(out.profile.result.totalVolume - sum) < 1e-6);
        const binSum = out.profile.result.bins.reduce((s, b) => s + b.volume, 0);
        assert.ok(Math.abs(binSum - sum) < 1e-6, `rows=${rows} binSum=${binSum} sum=${sum}`);
        const ud = out.profile.result.bins.reduce((s, b) => s + b.upVolume + b.downVolume, 0);
        assert.ok(Math.abs(ud - sum) < 1e-6);
    }
});
test('summarizeRange matches the shared computeVolumeProfile exactly', () => {
    const bars = walk(80, 5);
    const a = summarizeRange(bars, 10, 70, 24, 70);
    const b = computeVolumeProfile(bars, 10, 70, 24, 0.7);
    assert.equal(a.kind, 'ok');
    if (a.kind === 'ok') assert.deepEqual(a.profile.result, b);
});
test('zero / missing volume everywhere -> novolume; flat range -> empty', () => {
    const zero = [B(0, 1, 0), B(1, 3, 0), B(2, 4, 0)];
    assert.equal(summarizeRange(zero, 0, 2, 24, 70).kind, 'novolume');
    const missing = [{ high: 2, low: 1, open: 1, close: 2 }, { high: 3, low: 1, open: 1, close: 2 }];
    assert.equal(summarizeRange(missing as any, 0, 1, 24, 70).kind, 'novolume');
    assert.equal(summarizeRange([B(5, 5, 10)], 0, 0, 24, 70).kind, 'empty');
    assert.equal(summarizeRange([], 0, 0, 24, 70).kind, 'empty');
});

// ---- indicator smoke tests (calculate + legend + draw with a recording canvas) ----
function recordingCtx(): any {
    const calls: string[] = [];
    return new Proxy({ calls }, {
        get(t: any, p: string) { if (p === 'calls') return t.calls; return (..._a: any[]) => { t.calls.push(p); }; },
        set() { return true; },
    });
}
const fakeTs = { barSpacing: 10, width: 800, indexToCoordinate: (i: number) => i * 10 };
const fakePs = { priceToCoordinate: (p: number) => 1000 - p * 3 };
const hours = (n: number, t0 = T('2024-03-01T00:00:00Z') / 1000) => walk(n, 9).map((b, i) => ({ ...b, time: t0 + i * 3600 }));

test('SessionVolumeProfileIndicator: periods, hide by interval, no-volume note, draw', () => {
    const bars = hours(24 * 5);
    const ind = new SessionVolumeProfileIndicator({ extendPOC: true, showVahVal: true, splitUpDown: true });
    ind.setContext({ symbol: 'X', timeframe: '1h' });
    ind.calculate(bars as any);
    assert.equal(ind.getLegendInfo().plots.length, 1);
    assert.ok(ind.getLegendInfo().plots[0].value !== null);
    const ctx = recordingCtx();
    ind.drawOverlay(ctx, fakeTs, fakePs, 1, 1, { from: 0, to: bars.length - 1 });
    assert.ok(ctx.calls.filter((c: string) => c === 'fillRect').length > 20);
    // interval not smaller than the period -> nothing drawn + note
    ind.setContext({ symbol: 'X', timeframe: 'D' });
    const ctx2 = recordingCtx();
    ind.drawOverlay(ctx2, fakeTs, fakePs, 1, 1, { from: 0, to: bars.length - 1 });
    assert.equal(ctx2.calls.filter((c: string) => c === 'fillRect').length, 0);
    assert.match(ind.getLegendInfo().plots[0].text!, /Hidden/);
    // max periods
    const ind2 = new SessionVolumeProfileIndicator({ maxPeriods: 2 });
    ind2.setContext({ symbol: 'X', timeframe: '1h' });
    ind2.calculate(bars as any);
    const ctx3 = recordingCtx();
    ind2.drawOverlay(ctx3, fakeTs, fakePs, 1, 1, { from: 0, to: bars.length - 1 });
    assert.ok(ctx3.calls.filter((c: string) => c === 'stroke').length === 2); // 2 POC lines only
    // zero volume
    const ind3 = new SessionVolumeProfileIndicator();
    ind3.setContext({ symbol: 'X', timeframe: '1h' });
    ind3.calculate(bars.map((b) => ({ ...b, volume: 0 })) as any);
    const ctx4 = recordingCtx();
    ind3.drawOverlay(ctx4, fakeTs, fakePs, 1, 1, { from: 0, to: bars.length - 1 });
    assert.equal(ctx4.calls.length <= 0 ? 0 : ctx4.calls.length, 0);
    assert.equal(ind3.getLegendInfo().plots[0].text, 'No volume data for this symbol');
});
test('SessionVolumeProfileIndicator: POC extension stops at the first touching bar (causal)', () => {
    // day 1: price 100..110 volume concentrated at ~105; day 2 never touches 105 for 2 bars then touches
    const mk = (time: number, lo: number, hi: number, v: number) => ({ time, open: lo, high: hi, low: lo, close: hi, volume: v });
    const d1 = T('2024-03-01T00:00:00Z') / 1000, d2 = T('2024-03-02T00:00:00Z') / 1000;
    const bars = [mk(d1, 104, 106, 1000), mk(d1 + 3600, 100, 101, 1), mk(d1 + 7200, 109, 110, 1),
        mk(d2, 120, 125, 5), mk(d2 + 3600, 120, 126, 5), mk(d2 + 7200, 103, 108, 5), mk(d2 + 10800, 130, 131, 5)];
    const ind = new SessionVolumeProfileIndicator({ extendPOC: true, maxPeriods: 5 });
    ind.setContext({ symbol: 'X', timeframe: '1h' });
    ind.calculate(bars as any);
    const e = (ind as any)._entries[0];
    assert.equal(e.touchedAt, 5);
    // appending later bars cannot move it
    ind.calculate([...bars, mk(d2 + 14400, 100, 110, 5)] as any);
    assert.equal((ind as any)._entries[0].touchedAt, 5);
});
test('VisibleRangeVolumeProfileIndicator: profile of visible bars, debounce on scroll, no-volume note', async () => {
    const bars = hours(300);
    const ind = new VisibleRangeVolumeProfileIndicator();
    ind.calculate(bars as any);
    let ctx = recordingCtx();
    ind.drawOverlay(ctx, fakeTs, fakePs, 1, 1, { from: 100, to: 200 }, { bitmapSize: { width: 800, height: 400 } });
    assert.ok(ctx.calls.filter((c: string) => c === 'fillRect').length > 10);
    const poc1 = (ind as any)._outcome.profile.pocPrice;
    const expected = summarizeRange(bars as any, 100, 200, 60, 70);
    assert.equal(expected.kind === 'ok' && expected.profile.pocPrice, poc1);
    // scroll: stale profile kept until the debounce fires
    ctx = recordingCtx();
    ind.drawOverlay(ctx, fakeTs, fakePs, 1, 1, { from: 0, to: 50 }, { bitmapSize: { width: 800, height: 400 } });
    assert.equal((ind as any)._pFrom, 100);
    await new Promise((r) => setTimeout(r, 160));
    assert.equal((ind as any)._pFrom, 0);
    const e2 = summarizeRange(bars as any, 0, 50, 60, 70);
    assert.equal(e2.kind === 'ok' && e2.profile.pocPrice, (ind as any)._outcome.profile.pocPrice);
    // new bars: recomputed immediately for the last seen range
    const more = hours(301);
    ind.calculate(more as any);
    assert.equal((ind as any)._pTo, 50);
    // no volume
    const z = new VisibleRangeVolumeProfileIndicator();
    z.calculate(bars.map((b) => ({ ...b, volume: 0 })) as any);
    ctx = recordingCtx();
    z.drawOverlay(ctx, fakeTs, fakePs, 1, 1, { from: 0, to: 100 });
    assert.equal(ctx.calls.length, 0);
    assert.equal(z.getLegendInfo().plots[0].text, 'No volume data for this symbol');
    ind.destroy(); z.destroy();
});
test('DivergenceIndicator: calculate excludes forming bar, legend, draw, settings round trip', () => {
    const bars = walk(500, 3);
    const ind = new DivergenceIndicator({ showHiddenBull: true, showHiddenBear: true });
    ind.calculate(bars as any);
    const eng = (ind as any)._engine as DivergenceEngine;
    assert.equal(eng.processed, bars.length - 1);
    const total = eng.divergences.length;
    assert.ok(total > 0);
    const ctx = recordingCtx();
    ind.drawOverlay(ctx, fakeTs, fakePs, 1, 1, { from: 0, to: 600 });
    assert.ok(ctx.calls.filter((c: string) => c === 'stroke').length === total);
    assert.equal(ind.getLegendInfo().plots[0].text, String(total));
    // toggles do not recompute; algo settings do
    ind.setSettingValue('showHiddenBull', false); ind.setSettingValue('showHiddenBear', false);
    const regular = eng.divergences.filter((d) => d.kind === 'bull' || d.kind === 'bear').length;
    const ctx2 = recordingCtx();
    ind.drawOverlay(ctx2, fakeTs, fakePs, 1, 1, { from: 0, to: 600 });
    assert.equal(ctx2.calls.filter((c: string) => c === 'stroke').length, regular);
    assert.equal(ind.setSettingValue('oscillator', 'macd'), true);
    assert.equal(((ind as any)._engine as DivergenceEngine).config.oscillator, 'macd');
    assert.equal(ind.getSettingValue('oscillator'), 'macd');
    // level filter (RSI only): with MACD it is ignored
    ind.setSettingValue('useLevelFilter', true);
    ind.setSettingValue('oscillator', 'rsi');
    ind.setSettingValue('bullLevel', 0); ind.setSettingValue('bearLevel', 100); ind.setSettingValue('showHiddenBull', true); ind.setSettingValue('showHiddenBear', true);
    const ctx3 = recordingCtx();
    ind.drawOverlay(ctx3, fakeTs, fakePs, 1, 1, { from: 0, to: 600 });
    assert.equal(ctx3.calls.filter((c: string) => c === 'stroke').length, 0);
});


test('engine restarts when timestamps and bar count are identical but prices differ (symbol switch / Heikin-Ashi)', () => {
    const a = walk(200, 3);
    const b = walk(200, 4).map((x, i) => ({ ...x, time: a[i].time })); // same times, different series
    const e = new DivergenceEngine(defaultDivergenceConfig);
    e.sync(a, 199);
    const asB = findDivergences(b, defaultDivergenceConfig, 199);
    assert.equal(e.sync(b, 199), true);
    assert.equal(JSON.stringify(e.divergences), JSON.stringify(asB));
    // a change only in the middle bar (HA-like) is also caught
    const c = b.map((x, i) => (i === 99 ? { ...x, close: x.close + 0.5 } : x));
    assert.equal(e.sync(c, 199), true);
    // identical series: no restart
    assert.equal(e.sync(c, 199), false);
    // DivergenceIndicator end to end
    const ind = new DivergenceIndicator();
    ind.calculate(a as any);
    ind.calculate(b as any);
    const fresh = new DivergenceIndicator();
    fresh.calculate(b as any);
    assert.equal(JSON.stringify((ind as any)._engine.divergences), JSON.stringify((fresh as any)._engine.divergences));
});
test('session profile cache cannot survive a symbol switch with identical timestamps', () => {
    const a = hours(24 * 4);
    const b = walk(24 * 4, 21).map((x, i) => ({ ...x, time: a[i].time, high: x.high + 50, low: x.low + 50, open: x.open + 50, close: x.close + 50 }));
    const ind = new SessionVolumeProfileIndicator();
    ind.setContext({ symbol: 'AAA', timeframe: '1h' });
    ind.calculate(a as any);
    const pocA = (ind as any)._entries[0].outcome.profile.pocPrice;
    ind.setContext({ symbol: 'BBB', timeframe: '1h' });
    ind.calculate(b as any);
    const fresh = new SessionVolumeProfileIndicator();
    fresh.setContext({ symbol: 'BBB', timeframe: '1h' });
    fresh.calculate(b as any);
    assert.equal((ind as any)._entries[0].outcome.profile.pocPrice, (fresh as any)._entries[0].outcome.profile.pocPrice);
    assert.notEqual(pocA, (ind as any)._entries[0].outcome.profile.pocPrice);
    // even without setContext (cache key alone) a different series is recomputed
    const k = new SessionVolumeProfileIndicator();
    k.setContext({ symbol: 'AAA', timeframe: '1h' });
    k.calculate(a as any); k.calculate(b as any);
    assert.equal((k as any)._entries[0].outcome.profile.pocPrice, (fresh as any)._entries[0].outcome.profile.pocPrice);
});
test('hitTest: session profile (histogram block + POC line) and visible-range edge strip', () => {
    const bars = hours(24 * 3);
    const ind = new SessionVolumeProfileIndicator({ widthPercent: 50 });
    ind.setContext({ symbol: 'X', timeframe: '1h' });
    ind.calculate(bars as any);
    const ent = (ind as any)._entries[(ind as any)._entries.length - 1];
    const res = ent.outcome.profile.result;
    const x0 = ent.range.first * 10 - 5, x1 = ent.range.last * 10 + 5;
    const yMid = 1000 - ((res.lowest + res.highest) / 2) * 3;
    assert.equal(ind.hitTest(x0 + 2, yMid, fakeTs, fakePs), true);
    assert.equal(ind.hitTest(x0 + (x1 - x0) * 0.9, yMid + 200, fakeTs, fakePs), false); // right part, off the POC
    assert.equal(ind.hitTest(x0 + (x1 - x0) * 0.9, 1000 - ent.outcome.profile.pocPrice * 3 + 2, fakeTs, fakePs), true); // on the POC line
    assert.equal(ind.hitTest(-500, yMid, fakeTs, fakePs), false);
    const v = new VisibleRangeVolumeProfileIndicator({ widthPercent: 30 });
    v.calculate(bars as any);
    v.drawOverlay(recordingCtx(), fakeTs, fakePs, 1, 1, { from: 0, to: 70 }, { bitmapSize: { width: 800, height: 400 } });
    const r = (v as any)._outcome.profile.result;
    const y = 1000 - ((r.lowest + r.highest) / 2) * 3;
    assert.equal(v.hitTest(790, y, fakeTs, fakePs), true);
    assert.equal(v.hitTest(400, y, fakeTs, fakePs), false);
    assert.equal(v.hitTest(790, y + 5000, fakeTs, fakePs), false);
    v.setSettingValue('placement', 'left');
    assert.equal(v.hitTest(10, y, fakeTs, fakePs), true);
    assert.equal(v.hitTest(790, y, fakeTs, fakePs), false);
    v.destroy();
});
test('visible-range: ticks on the same bar are coalesced; new bar / setting immediate; re-show immediate', async () => {
    const bars = hours(200);
    const v = new VisibleRangeVolumeProfileIndicator();
    v.calculate(bars as any);
    const sc = { bitmapSize: { width: 800, height: 400 } };
    v.drawOverlay(recordingCtx(), fakeTs, fakePs, 1, 1, { from: 50, to: 150 }, sc);
    const pocBefore = (v as any)._outcome.profile.pocPrice;
    // tick: same count, last bar volume balloons
    const tick = bars.map((b, i) => (i === 150 ? { ...b, volume: 1e9 } : b));
    v.calculate(tick as any);
    assert.equal((v as any)._outcome.profile.pocPrice, pocBefore); // not recomputed yet
    await new Promise((r) => setTimeout(r, 160));
    assert.notEqual((v as any)._outcome.profile.pocPrice, pocBefore); // timer fired
    // new bar: immediate
    const timerBefore = (v as any)._timer;
    v.calculate(hours(201) as any);
    assert.equal((v as any)._pCount, 201);
    void timerBefore;
    // setting: immediate
    v.setSettingValue('rows', 20);
    assert.equal((v as any)._outcome.profile.result.bins.length, 20);
    // hide, tick, re-show: recomputed at the next draw without waiting
    v.setVisible(false);
    v.calculate(hours(201).map((b, i) => (i === 100 ? { ...b, volume: 5e9 } : b)) as any);
    v.setVisible(true);
    v.drawOverlay(recordingCtx(), fakeTs, fakePs, 1, 1, { from: 50, to: 150 }, sc);
    const exp = summarizeRange(hours(201).map((b, i) => (i === 100 ? { ...b, volume: 5e9 } : b)) as any, 50, 150, 20, 70);
    assert.equal(exp.kind === 'ok' && exp.profile.pocPrice, (v as any)._outcome.profile.pocPrice);
    v.destroy();
});

test('no stale labels / geometry after a volume series is replaced by a zero-volume one (same timestamps)', () => {
    const bars = hours(24 * 3);
    const zero = bars.map((b) => ({ ...b, volume: 0 }));
    const sc = { bitmapSize: { width: 800, height: 400 } };
    // visible range
    const v = new VisibleRangeVolumeProfileIndicator();
    v.setContext({ symbol: 'EURUSD', timeframe: '1h' });
    v.calculate(bars as any);
    v.drawOverlay(recordingCtx(), fakeTs, fakePs, 1, 1, { from: 0, to: 70 }, sc);
    assert.match((v as any)._labelPoc, /^POC /);
    const r = (v as any)._outcome.profile.result;
    const y = 1000 - ((r.lowest + r.highest) / 2) * 3;
    assert.equal(v.hitTest(790, y, fakeTs, fakePs), true);
    v.setContext({ symbol: 'XAUUSD', timeframe: '1h' });
    assert.equal((v as any)._labelPoc, '');
    assert.equal(v.hitTest(790, y, fakeTs, fakePs), false);
    v.calculate(zero as any);
    const ctx = recordingCtx();
    v.drawOverlay(ctx, fakeTs, fakePs, 1, 1, { from: 0, to: 70 }, sc);
    assert.equal(ctx.calls.length, 0);
    assert.equal((v as any)._outcome.kind, 'novolume');
    assert.deepEqual([(v as any)._labelPoc, (v as any)._labelVah, (v as any)._labelVal], ['', '', '']);
    assert.equal(v.hitTest(790, y, fakeTs, fakePs), false);
    assert.equal(v.getLegendInfo().plots[0].text, 'No volume data for this symbol');
    // same indicator, no symbol change: volume -> zero volume on the same timestamps
    const w = new VisibleRangeVolumeProfileIndicator();
    w.calculate(bars as any);
    w.drawOverlay(recordingCtx(), fakeTs, fakePs, 1, 1, { from: 0, to: 70 }, sc);
    w.setSettingValue('rows', 30); // forces an immediate recompute path
    w.calculate(zero as any);
    w.setSettingValue('rows', 31);
    assert.equal((w as any)._outcome.kind, 'novolume');
    assert.equal((w as any)._labelPoc, '');
    assert.equal(w.hitTest(790, y, fakeTs, fakePs), false);
    v.destroy(); w.destroy();
    // session
    const s = new SessionVolumeProfileIndicator();
    s.setContext({ symbol: 'EURUSD', timeframe: '1h' });
    s.calculate(bars as any);
    const ent = (s as any)._entries[(s as any)._entries.length - 1];
    const ys = 1000 - ent.outcome.profile.pocPrice * 3;
    const xs = ent.range.first * 10;
    assert.equal(s.hitTest(xs, ys, fakeTs, fakePs), true);
    s.setContext({ symbol: 'XAUUSD', timeframe: '1h' });
    assert.equal((s as any)._entries.length, 0);
    assert.equal(s.hitTest(xs, ys, fakeTs, fakePs), false);
    s.calculate(zero as any);
    assert.equal(s.hitTest(xs, ys, fakeTs, fakePs), false);
    assert.equal(s.getLegendInfo().plots[0].text, 'No volume data for this symbol');
    const c2 = recordingCtx();
    s.drawOverlay(c2, fakeTs, fakePs, 1, 1, { from: 0, to: 70 });
    assert.equal(c2.calls.length, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
