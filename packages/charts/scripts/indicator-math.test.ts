// Unit tests for the pure maths of Pivot Points, Auto Fibonacci and Candlestick Patterns.
// Run: npx tsx scripts/indicator-math.test.ts   (from packages/charts)
// No test framework in this package: plain node:assert, exits non-zero on the first failure.

import assert from 'node:assert/strict';
import {
    computePivotLevels, computePivotPeriods, pivotPeriodsFromGroups, resolvePivotPeriod, periodStartMs, timeframeSeconds, formatPrice,
    PivotBar, PivotType, PivotPeriod,
} from '../src/indicators/pivot-math';
import { computeFibRange, fibPrice, formatRatio } from '../src/indicators/auto-fib-math';
import {
    CandleBar, DetectConfig, PatternDetector, PATTERN_DEFS, DEFAULT_OFF_PATTERNS, detectAt,
} from '../src/indicators/candlestick-patterns-math';
import { PivotGrouper } from '../src/indicators/pivot-math';
import { SeriesFingerprint, syncTimePoints } from '../src/indicators/indicator-cache';

let passed = 0;
function test(name: string, fn: () => void): void {
    try {
        fn();
        passed++;
        console.log('ok   ' + name);
    } catch (e) {
        console.log('FAIL ' + name);
        console.log(e);
        process.exit(1);
    }
}
const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} expected ${b}, got ${a}`);
function levelMap(type: PivotType, H: number, L: number, C: number): Record<string, number> {
    const m: Record<string, number> = {};
    for (const l of computePivotLevels(type, H, L, C)) m[l.name] = l.price;
    return m;
}

// ---------------------------------------------------------------- pivots: H=110 L=90 C=104, range 20, P=101.3333
const H = 110, L = 90, C = 104, P = (H + L + C) / 3;

test('pivot classic', () => {
    const m = levelMap('classic', H, L, C);
    near(m.P, 304 / 3);
    near(m.R1, 2 * P - L); near(m.R1, 338 / 3);
    near(m.S1, 2 * P - H); near(m.S1, 278 / 3);
    near(m.R2, P + 20); near(m.S2, P - 20);
    near(m.R3, H + 2 * (P - L)); near(m.R3, 398 / 3);
    near(m.S3, L - 2 * (H - P)); near(m.S3, 218 / 3);
    assert.equal(m.R4, undefined);
});
test('pivot fibonacci', () => {
    const m = levelMap('fibonacci', H, L, C);
    near(m.P, P);
    near(m.R1, P + 0.382 * 20); near(m.R2, P + 0.618 * 20); near(m.R3, P + 20);
    near(m.S1, P - 0.382 * 20); near(m.S2, P - 0.618 * 20); near(m.S3, P - 20);
    near(m.R3, 364 / 3);
});
test('pivot camarilla', () => {
    const m = levelMap('camarilla', H, L, C);
    near(m.P, P);
    near(m.R1, 104 + 20 * 1.1 / 12); near(m.R2, 104 + 20 * 1.1 / 6); near(m.R3, 109.5); near(m.R4, 115);
    near(m.S1, 104 - 20 * 1.1 / 12); near(m.S2, 104 - 20 * 1.1 / 6); near(m.S3, 98.5); near(m.S4, 93);
});
test('pivot woodie', () => {
    const m = levelMap('woodie', H, L, C);
    near(m.P, 102); near(m.R1, 114); near(m.S1, 94); near(m.R2, 122); near(m.S2, 82);
    assert.equal(m.R3, undefined);
});
test('pivot levels are ordered high to low (P excluded: Camarilla levels hang off C, not P)', () => {
    for (const t of ['classic', 'fibonacci', 'camarilla', 'woodie'] as PivotType[]) {
        const p = computePivotLevels(t, H, L, C).filter(l => l.kind !== 'P').map(l => l.price);
        assert.deepEqual([...p].sort((a, b) => b - a), p, t);
    }
});

// ---------------------------------------------------------------- Auto period mapping
test('auto period for every toolbar timeframe', () => {
    const cases: Array<[string, PivotPeriod]> = [
        ['1m', 'daily'], ['3m', 'daily'], ['5m', 'daily'], ['15m', 'daily'], ['15', 'daily'],
        ['30m', 'weekly'], ['1h', 'weekly'], ['2h', 'weekly'], ['4h', 'weekly'], ['6h', 'weekly'], ['8h', 'weekly'], ['12h', 'weekly'],
        ['60', 'weekly'], ['240', 'weekly'], ['16m', 'weekly'], ['90m', 'weekly'],
        ['D', 'monthly'], ['1D', 'monthly'], ['1d', 'monthly'], ['3D', 'monthly'],
        ['W', 'yearly'], ['1W', 'yearly'], ['M', 'yearly'], ['1M', 'yearly'], ['1mo', 'yearly'],
    ];
    for (const [tf, want] of cases) assert.equal(resolvePivotPeriod('auto', tf), want, tf);
    assert.equal(resolvePivotPeriod('auto', undefined), 'daily');
    assert.equal(resolvePivotPeriod('weekly', '1m'), 'weekly');
    assert.equal(resolvePivotPeriod('yearly', 'D'), 'yearly');
});
test('timeframe parsing: M is month, m is minute', () => {
    assert.equal(timeframeSeconds('M'), 31 * 86400);
    assert.equal(timeframeSeconds('1m'), 60);
    assert.equal(timeframeSeconds('240'), 14400);
    assert.equal(timeframeSeconds('garbage!'), null);
});
test('UTC period boundaries', () => {
    const wed = Date.UTC(2026, 10, 11, 15, 30); // Wed 2026-11-11
    assert.equal(periodStartMs(wed, 'daily'), Date.UTC(2026, 10, 11));
    assert.equal(periodStartMs(wed, 'weekly'), Date.UTC(2026, 10, 9)); // Monday
    assert.equal(periodStartMs(Date.UTC(2026, 10, 8, 23, 59), 'weekly'), Date.UTC(2026, 10, 2)); // Sunday -> previous Monday
    assert.equal(periodStartMs(Date.UTC(2026, 10, 9, 0, 0), 'weekly'), Date.UTC(2026, 10, 9)); // Monday 00:00
    assert.equal(periodStartMs(wed, 'monthly'), Date.UTC(2026, 10, 1));
    assert.equal(periodStartMs(wed, 'yearly'), Date.UTC(2026, 0, 1));
});

// ---------------------------------------------------------------- causality / truncated first period
function hourly(startMs: number, hours: number, f: (i: number) => [number, number, number]): PivotBar[] {
    const out: PivotBar[] = [];
    for (let i = 0; i < hours; i++) {
        const [high, low, close] = f(i);
        out.push({ time: Math.floor((startMs + i * 3600000) / 1000), high, low, close });
    }
    return out;
}
// start Mon 2026-01-05 12:00 UTC, 84 hourly bars: D0 (12 bars, truncated), D1, D2, D3 (full days), until Thu 00:00 excl.
const start = Date.UTC(2026, 0, 5, 12);
const mk = (hours: number, f?: (i: number) => [number, number, number]) =>
    hourly(start, hours, f ?? (i => [100 + i, 90 + i, 95 + i]));

test('truncated first period is never a source', () => {
    const bars = mk(12 + 24 + 5); // D0 (12h) + D1 (24h) + 5h of D2
    const res = computePivotPeriods(bars, 'daily', 'classic', 10);
    // D1 would use D0 (truncated) -> dropped; D2 uses D1 (complete)
    assert.equal(res.length, 1);
    assert.equal(res[0].firstIdx, 12 + 24);
    assert.equal(res[0].sourceHigh, Math.max(...bars.slice(12, 36).map(b => b.high)));
    assert.equal(res[0].sourceLow, Math.min(...bars.slice(12, 36).map(b => b.low)));
    assert.equal(res[0].sourceClose, bars[35].close);
});
test('only first period + current: nothing drawn', () => {
    assert.equal(computePivotPeriods(mk(12 + 5), 'daily', 'classic', 3).length, 0);
    assert.equal(computePivotPeriods(mk(7), 'daily', 'classic', 3).length, 0); // single (current) period
    assert.equal(computePivotPeriods([], 'daily', 'classic', 3).length, 0);
});
test('periods back limits the count; levels chain from the previous period', () => {
    const bars = mk(12 + 72 + 3); // D0, D1, D2, D3 (complete), D4 current
    const all = computePivotPeriods(bars, 'daily', 'classic', 20);
    assert.equal(all.length, 3); // D3 (src D2)... wait D2,D3,D4 use D1,D2,D3
    const one = computePivotPeriods(bars, 'daily', 'classic', 1);
    assert.equal(one.length, 2);
    assert.equal(computePivotPeriods(bars, 'daily', 'classic', 0).length, 1);
    assert.deepEqual(one, all.slice(-2));
});
test('causality: changing the current period does not change its levels', () => {
    const a = mk(12 + 24 + 6);
    const b = a.map((bar, i) => (i >= 36 ? { ...bar, high: bar.high + 500, low: bar.low - 500, close: bar.close + 7 } : bar));
    const ra = computePivotPeriods(a, 'daily', 'classic', 3);
    const rb = computePivotPeriods(b, 'daily', 'classic', 3);
    assert.deepEqual(ra[0].levels, rb[0].levels);
});
test('causality: adding future bars does not change earlier periods', () => {
    const short = computePivotPeriods(mk(12 + 48 + 2), 'daily', 'camarilla', 5);
    const long = computePivotPeriods(mk(12 + 48 + 2 + 30), 'daily', 'camarilla', 5);
    // the period that was current in `short` keeps identical levels once it is complete in `long`
    assert.deepEqual(short[short.length - 1].levels, long.find(p => p.firstIdx === short[short.length - 1].firstIdx)!.levels);
});
test('ms and s timestamps give the same periods', () => {
    const s = mk(12 + 40);
    const ms = s.map(b => ({ ...b, time: b.time * 1000 }));
    assert.deepEqual(computePivotPeriods(s, 'daily', 'classic', 3), computePivotPeriods(ms, 'daily', 'classic', 3));
});
test('weekly grouping starts on Monday', () => {
    const bars: PivotBar[] = [];
    // daily bars from Wed 2026-01-07 for 22 days
    for (let i = 0; i < 22; i++) bars.push({ time: Date.UTC(2026, 0, 7 + i) / 1000, high: 110 + i, low: 90 + i, close: 100 + i });
    const res = computePivotPeriods(bars, 'weekly', 'classic', 10);
    // weeks: Jan5(first, truncated: Wed-Sun), Jan12, Jan19, Jan26(Jan26-Jan28 current)
    assert.equal(res.length, 2);
    assert.equal(res[0].startMs, Date.UTC(2026, 0, 19));
    assert.equal(res[0].sourceHigh, 110 + 11); // week of Jan 12: bars index 5..11
    assert.equal(res[1].startMs, Date.UTC(2026, 0, 26));
});
test('formatPrice trims zeros', () => {
    assert.equal(formatPrice(67250.5), '67250.5');
    assert.equal(formatPrice(67250), '67250');
    assert.equal(formatPrice(0.012345), '0.01235');
    assert.equal(formatPrice(1.23456, 3), '1.235');
});

// ---------------------------------------------------------------- auto fib
function fibBars(n: number, hi: [number, number], lo: [number, number]): Array<{ high: number; low: number }> {
    const b = Array.from({ length: n }, () => ({ high: 105, low: 95 }));
    b[hi[0]] = { high: hi[1], low: 100 };
    b[lo[0]] = { high: 100, low: lo[1] };
    return b;
}
test('auto fib: up move (high after low)', () => {
    const bars = fibBars(120, [100, 110], [30, 90]);
    bars[5] = { high: 200, low: 5 }; // outside the 100-bar window
    const r = computeFibRange(bars, 100)!;
    assert.equal(r.highIdx, 100); assert.equal(r.lowIdx, 30); assert.equal(r.up, true);
    assert.equal(r.startIdx, 30); assert.equal(r.endIdx, 100);
    assert.equal(r.startPrice, 90); assert.equal(r.endPrice, 110);
    near(fibPrice(r, 0), 110); near(fibPrice(r, 0.5), 100); near(fibPrice(r, 1), 90);
    near(fibPrice(r, 0.236), 110 - 4.72); near(fibPrice(r, 0.382), 110 - 7.64); near(fibPrice(r, 0.618), 97.64);
    near(fibPrice(r, 0.786), 110 - 15.72); near(fibPrice(r, 1.272), 84.56); near(fibPrice(r, 1.618), 77.64);
});
test('auto fib: down move (low after high)', () => {
    const bars = fibBars(120, [40, 110], [100, 90]);
    const r = computeFibRange(bars, 100)!;
    assert.equal(r.up, false);
    assert.equal(r.startIdx, 40); assert.equal(r.endIdx, 100);
    assert.equal(r.startPrice, 110); assert.equal(r.endPrice, 90);
    near(fibPrice(r, 0), 90); near(fibPrice(r, 0.5), 100); near(fibPrice(r, 1), 110);
    near(fibPrice(r, 0.236), 94.72); near(fibPrice(r, 0.618), 102.36); near(fibPrice(r, 1.272), 115.44); near(fibPrice(r, 1.618), 122.36);
});
test('auto fib: window, ties and degenerate input', () => {
    const bars = fibBars(120, [100, 110], [30, 90]);
    assert.equal(computeFibRange(bars, 50)!.lowIdx !== 30, true); // 30 is outside the last 50 bars
    const tie = Array.from({ length: 30 }, (_, i) => ({ high: i === 8 || i === 20 ? 100 : 95, low: i === 3 ? 90 : 96 }));
    assert.equal(computeFibRange(tie, 30)!.highIdx, 20); // most recent tie wins
    assert.equal(computeFibRange(Array.from({ length: 30 }, () => ({ high: 5, low: 5 })), 20), null);
    assert.equal(computeFibRange([], 20), null);
    assert.equal(computeFibRange([{ high: 2, low: 1 }], 20), null);
});
test('auto fib: moves when a new extreme forms (documented repaint)', () => {
    const bars = fibBars(120, [100, 110], [30, 90]);
    const before = computeFibRange(bars, 100)!;
    bars.push({ high: 120, low: 108 });
    const after = computeFibRange(bars, 100)!;
    assert.equal(before.high, 110); assert.equal(after.high, 120);
    assert.notEqual(fibPrice(before, 0.5), fibPrice(after, 0.5));
});
test('ratio text', () => {
    assert.equal(formatRatio(0.236), '0.236'); assert.equal(formatRatio(0), '0'); assert.equal(formatRatio(1), '1'); assert.equal(formatRatio(1.272), '1.272');
});

// ---------------------------------------------------------------- candlestick patterns
type TBar = CandleBar & { time: number };
const k = (o: number, h: number, l: number, c: number): TBar => ({ open: o, high: h, low: l, close: c, time: 0 });
/** time = index * 60 s (the detector fingerprints times as well) */
const stamp = (bars: TBar[], t0 = 0): TBar[] => bars.map((b, i) => ({ ...b, time: t0 + i * 60 }));
// 30 trending bars, all body 2 / range 4 => avgBody 2, avgRange 4. Down base ends at close 171, up base at 129.
const downBase = (): TBar[] => Array.from({ length: 30 }, (_, i) => { const c = 200 - i; return k(c + 2, c + 3, c - 1, c); });
const upBase = (): TBar[] => Array.from({ length: 30 }, (_, i) => { const c = 100 + i; return k(c - 2, c + 1, c - 3, c); });
const off: DetectConfig = { useTrendFilter: false, trendPeriod: 20 };
const on: DetectConfig = { useTrendFilter: true, trendPeriod: 20 };
/** ids of patterns ending on the last bar of base+extra */
function ids(base: TBar[], extra: TBar[], cfg: DetectConfig = on): string[] {
    const bars = [...base, ...extra];
    return detectAt(bars, bars.length - 1, cfg).map(h => h.id);
}
function has(base: TBar[], extra: TBar[], id: string, cfg: DetectConfig = on): boolean {
    return ids(base, extra, cfg).includes(id);
}
function pos(id: string, base: () => CandleBar[], good: CandleBar[], bad: CandleBar[]) {
    test(`pattern ${id}: positive`, () => assert.ok(has(base(), good, id), `${id} not found, got ${ids(base(), good)}`));
    test(`pattern ${id}: near-miss`, () => assert.ok(!has(base(), bad, id), `${id} should not match, got ${ids(base(), bad)}`));
}

test('baseline sanity: trend bases', () => {
    assert.deepEqual(ids(downBase(), []), []);
    assert.deepEqual(ids(upBase(), []), []);
});
pos('doji', downBase, [k(171, 173, 169, 171.1)], [k(171, 173, 169, 172)]);
pos('hammer', downBase, [k(170.5, 171.2, 167, 171)], [k(170.5, 171.2, 169.7, 171)]);
pos('hangingMan', upBase, [k(129.5, 130.2, 126, 130)], [k(129.5, 130.2, 128.7, 130)]);
pos('invertedHammer', downBase, [k(170.2, 174, 170, 170.7)], [k(170.2, 171.5, 170, 170.7)]);
pos('shootingStar', upBase, [k(129.2, 133, 129, 129.7)], [k(129.2, 130.5, 129, 129.7)]);
pos('bullishEngulfing', downBase, [k(171, 172, 168.5, 169), k(168.5, 172, 168, 171.5)], [k(171, 172, 168.5, 169), k(168.5, 172, 168, 170.5)]);
pos('bearishEngulfing', upBase, [k(129, 131.5, 128.5, 131), k(131.5, 132, 128, 128.5)], [k(129, 131.5, 128.5, 131), k(131.5, 132, 128, 129.5)]);
pos('bullishHarami', downBase, [k(171, 172, 167, 167), k(168, 170.5, 167.5, 170)], [k(171, 172, 167, 167), k(168, 172, 167.5, 171.5)]);
pos('bearishHarami', upBase, [k(129, 133.5, 128.5, 133), k(132, 132.5, 129.5, 130)], [k(129, 133.5, 128.5, 133), k(133.5, 134, 129.5, 130)]);
pos('piercingLine', downBase, [k(171, 172, 166.5, 167), k(166, 170, 165.5, 169.5)], [k(171, 172, 166.5, 167), k(166, 170, 165.5, 168.5)]);
pos('darkCloudCover', upBase, [k(129, 133.5, 128.5, 133), k(134, 134.5, 130, 130.5)], [k(129, 133.5, 128.5, 133), k(134, 134.5, 130, 131.5)]);
pos('morningStar', downBase,
    [k(171, 171.5, 165.5, 166), k(165.5, 166.5, 165, 166), k(166.5, 170.5, 166, 170)],
    [k(171, 171.5, 165.5, 166), k(165.5, 166.5, 165, 166), k(166.5, 168.5, 166, 168)]);
pos('eveningStar', upBase,
    [k(129, 134.5, 128.5, 134), k(134.5, 135.5, 134, 135), k(134, 134.5, 129.5, 130)],
    [k(129, 134.5, 128.5, 134), k(134.5, 135.5, 134, 135), k(134, 134.5, 131.5, 132)]);
pos('threeWhiteSoldiers', upBase,
    [k(129, 131.6, 128.9, 131.5), k(130.5, 133.6, 130.4, 133.5), k(132.5, 135.7, 132.4, 135.5)],
    [k(129, 131.6, 128.9, 131.5), k(130.5, 133.6, 130.4, 133.5), k(132.5, 137, 132.4, 135.5)]);
pos('threeBlackCrows', downBase,
    [k(171, 171.1, 168.4, 168.5), k(169.5, 169.6, 166.4, 166.5), k(167.5, 167.6, 164.4, 164.5)],
    [k(171, 171.1, 168.4, 168.5), k(169.5, 169.6, 166.4, 166.5), k(167.5, 167.6, 166.4, 166.6)]);
pos('bullishMarubozu', downBase, [k(171, 176, 171, 176)], [k(171, 177, 171, 176)]);
pos('bearishMarubozu', upBase, [k(135, 135, 130, 130)], [k(135, 136, 130, 130)]);
pos('tweezerTop', upBase, [k(129, 133, 128.5, 132), k(132, 133.2, 129, 129.5)], [k(129, 133, 128.5, 132), k(132, 133.6, 129, 129.5)]);
pos('tweezerBottom', downBase, [k(171, 171.5, 167, 168), k(168, 170.5, 167.2, 170)], [k(171, 171.5, 167, 168), k(168, 170.5, 166.4, 170)]);

test('every defined pattern has a positive test above', () => {
    // 19 patterns: guard against adding a definition without a test
    assert.equal(PATTERN_DEFS.length, 19);
    assert.equal(new Set(PATTERN_DEFS.map(d => d.id)).size, 19);
    assert.equal(new Set(PATTERN_DEFS.map(d => d.code)).size, 19);
});
test('morning star: oversized middle bar rejected', () => {
    assert.ok(!has(downBase(), [k(171, 171.5, 165.5, 166), k(164, 167, 163.5, 166.5), k(166.5, 170.5, 166, 170)], 'morningStar'));
});
test('trend filter on/off', () => {
    const hammer = [k(129.5, 130.2, 126, 130)]; // hammer shape after an UPtrend
    assert.ok(!has(upBase(), hammer, 'hammer', on));
    assert.ok(has(upBase(), hammer, 'hangingMan', on));
    assert.ok(has(upBase(), hammer, 'hammer', off));
    const hits = detectAt([...upBase(), ...hammer], 30, off).map(h => h.id);
    assert.deepEqual(hits.filter(x => x === 'hammer' || x === 'hangingMan'), ['hammer', 'hangingMan']); // shape alone: both
    // trend decided by the bar BEFORE the pattern: engulfing in a downtrend is rejected after an uptrend
    const eng = [k(171, 172, 168.5, 169), k(168.5, 172, 168, 171.5)];
    assert.ok(has(downBase(), eng, 'bullishEngulfing', on));
    assert.ok(!has(upBase(), eng.map(c => k(c.open - 40, c.high - 40, c.low - 40, c.close - 40)), 'bullishEngulfing', on));
});
test('priority: 3-bar > 2-bar > 1-bar, others listed', () => {
    // three white soldiers whose last bar is also a bullish marubozu
    const bars = [...upBase(), k(129, 131.6, 128.9, 131.5), k(130.5, 133.6, 130.4, 133.5), k(132.5, 135.5, 132.5, 135.5)];
    const hits = detectAt(bars, bars.length - 1, on);
    assert.equal(hits[0].id, 'threeWhiteSoldiers');
    assert.ok(hits.some(h => h.id === 'bullishMarubozu'));
    const order = hits.map(h => h.bars);
    assert.deepEqual(order, [...order].sort((a, b) => b - a));
});
test('flat (range 0) bars are skipped', () => {
    assert.deepEqual(ids(downBase(), [k(171, 171, 171, 171)]), []);
    assert.deepEqual(ids(downBase(), [k(171, 172, 168.5, 169), k(170, 170, 170, 170)], off), []);
});
test('disabled patterns are not reported', () => {
    const cfg: DetectConfig = { ...on, enabled: { doji: false } };
    assert.ok(!has(downBase(), [k(171, 173, 169, 171.1)], 'doji', cfg));
    assert.ok(has(downBase(), [k(171, 173, 169, 171.1)], 'doji', { ...on, enabled: { hammer: false } }));
});
test('too little history: nothing detected', () => {
    assert.deepEqual(detectAt(downBase().slice(0, 10).concat([k(171, 176, 171, 176)]), 10, off), []);
});

test('the still-forming last bar is never labelled', () => {
    const bars = [...downBase(), k(171, 176, 171, 176)]; // a marubozu as the LAST bar
    const d = new PatternDetector();
    d.update(stamp(bars), off);
    assert.equal(d.hits[bars.length - 1], null);
    assert.ok(d.hits.every((h, i) => i < bars.length - 1 || h === null));
    // once a new bar arrives the marubozu is closed and gets labelled
    const next = [...bars, k(176, 177, 175, 176)];
    d.update(stamp(next), off);
    assert.ok(d.hits[bars.length - 1]!.some(h => h.id === 'bullishMarubozu'));
    assert.equal(d.hits[next.length - 1], null);
});
test('a tick on the forming bar changes nothing; it cannot create a label', () => {
    const bars = [...downBase(), k(171, 173, 169, 171.5)];
    const d = new PatternDetector();
    d.update(stamp(bars), off);
    const snap = JSON.stringify(d.hits);
    for (const c of [k(171, 176, 171, 176), k(171, 173, 169, 171.1)]) {
        const t = [...bars.slice(0, -1), c];
        d.update(stamp(t), off);
        assert.equal(JSON.stringify(d.hits), snap);
        assert.equal(d.hits[t.length - 1], null);
    }
});
test('incremental detection equals a full pass (random walk, growing series)', () => {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const all: TBar[] = [];
    let price = 100;
    for (let i = 0; i < 400; i++) {
        const o = price;
        const c = o + (rnd() - 0.5) * 4;
        const h = Math.max(o, c) + rnd() * 1.5;
        const l = Math.min(o, c) - rnd() * 1.5;
        all.push(k(o, h, l, c));
        price = c;
    }
    const inc = new PatternDetector();
    let total = 0;
    for (let n = 40; n <= all.length; n++) {
        const slice = all.slice(0, n);
        inc.update(stamp(slice), on);
        // also simulate a tick (forming bar rewritten) before the next bar
        if (n % 7 === 0) {
            const ticked = [...slice.slice(0, -1), k(slice[n - 1].open, slice[n - 1].high + 3, slice[n - 1].low - 3, slice[n - 1].close + 1)];
            inc.update(stamp(ticked), on);
            inc.update(stamp(slice), on);
        }
        const full = new PatternDetector();
        full.update(stamp(slice), on);
        assert.equal(JSON.stringify(inc.hits), JSON.stringify(full.hits), `mismatch at n=${n}`);
    }
    for (const h of inc.hits) if (h && h.length) total++;
    assert.ok(total > 20, 'random series should contain some patterns, got ' + total);
});
test('config change triggers a full pass', () => {
    const bars = [...upBase(), k(129.5, 130.2, 126, 130), k(130, 131, 129, 130)];
    const d = new PatternDetector();
    d.update(stamp(bars), on);
    assert.ok(!d.hits[30]!.some(h => h.id === 'hammer'));
    d.update(stamp(bars), off);
    assert.ok(d.hits[30]!.some(h => h.id === 'hammer'));
});


// ---------------------------------------------------------------- review fixes
function randSeries(seed0: number, n: number, vol: number, mixed = false): TBar[] {
    let seed = seed0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const out: TBar[] = [];
    let price = 100;
    for (let i = 0; i < n; i++) {
        // mixed: log-uniform bar sizes so some bars are tiny next to their neighbours
        const v = mixed ? vol * Math.exp((rnd() - 0.5) * 3) : vol;
        const o = price;
        const c = o + (rnd() - 0.5) * 2 * v;
        out.push(k(o, Math.max(o, c) + rnd() * v, Math.min(o, c) - rnd() * v, c));
        price = c;
    }
    return stamp(out, 1000);
}
const labelled = (d: PatternDetector) => {
    let n = 0, tot = 0;
    d.hits.forEach(h => { if (h) { tot++; if (h.length) n++; } });
    return n / Math.max(1, tot);
};

test('swapping to a different series with identical times/length equals a fresh full pass', () => {
    const a = randSeries(1, 300, 1.2), b = randSeries(2, 300, 1.2);
    assert.equal(a[0].time, b[0].time);
    const d = new PatternDetector();
    d.update(a, on);
    d.update(b, on);
    const fresh = new PatternDetector();
    fresh.update(b, on);
    assert.equal(JSON.stringify(d.hits), JSON.stringify(fresh.hits));
    // same first bar and same length but a different body (the old key could not tell)
    const c = b.map((x, i) => (i === 0 ? { ...a[0] } : x));
    d.update(c, on);
    const fresh2 = new PatternDetector();
    fresh2.update(c, on);
    assert.equal(JSON.stringify(d.hits), JSON.stringify(fresh2.hits));
});
test('prepending history equals a full pass', () => {
    const all = randSeries(3, 400, 1.2);
    const tail = all.slice(100);
    const d = new PatternDetector();
    d.update(tail, on);
    d.update(all, on);
    const fresh = new PatternDetector();
    fresh.update(all, on);
    assert.equal(JSON.stringify(d.hits), JSON.stringify(fresh.hits));
});
test('reset() forgets everything', () => {
    const a = randSeries(4, 200, 1.2);
    const d = new PatternDetector();
    d.update(a, on);
    d.reset();
    assert.equal(d.hits.length, 0);
    d.update(a, on);
    const fresh = new PatternDetector();
    fresh.update(a, on);
    assert.equal(JSON.stringify(d.hits), JSON.stringify(fresh.hits));
});
test('size guards: tiny shapes in a normal market are rejected', () => {
    // avgRange 4: a hammer with range 2 (< 0.8 * 4) and a doji with range 1.5 (< 0.5 * 4)
    assert.ok(!has(downBase(), [k(170.4, 170.55, 169, 170.5)], 'hammer'));
    assert.ok(has(downBase(), [k(170.4, 170.55, 169, 170.5)], 'hammer', { ...on, sizeGuards: false }));
    assert.ok(!has(downBase(), [k(171, 171.7, 170.2, 171.05)], 'doji'));
    assert.ok(has(downBase(), [k(171, 171.7, 170.2, 171.05)], 'doji', { ...on, sizeGuards: false }));
    // engulfing body 1.05 < 0.8 * avgBody(2)=1.6
    const small = [k(171, 172, 169.5, 170), k(169.95, 171.2, 169.5, 171.0)];
    assert.ok(!has(downBase(), small, 'bullishEngulfing'));
    assert.ok(has(downBase(), small, 'bullishEngulfing', { ...on, sizeGuards: false }));
    // tweezer with a small second bar
    const tw = [k(129, 133, 128.5, 132), k(132.1, 133.1, 132, 132)];
    assert.ok(!has(upBase(), tw, 'tweezerTop'));
    assert.ok(has(upBase(), tw, 'tweezerTop', { ...on, sizeGuards: false }));
});
test('default set: multi-bar patterns on, single-bar shapes / harami / marubozu / tweezers off', () => {
    const on_ = ['bullishEngulfing', 'bearishEngulfing', 'piercingLine', 'darkCloudCover', 'morningStar', 'eveningStar', 'threeWhiteSoldiers', 'threeBlackCrows'];
    const off_ = ['doji', 'hammer', 'hangingMan', 'invertedHammer', 'shootingStar', 'bullishHarami', 'bearishHarami',
        'bullishMarubozu', 'bearishMarubozu', 'tweezerTop', 'tweezerBottom'];
    assert.deepEqual([...DEFAULT_OFF_PATTERNS].sort(), [...off_].sort());
    assert.equal(on_.length + off_.length, PATTERN_DEFS.length);
    for (const id of on_) assert.ok(PATTERN_DEFS.some(d => d.id === id) && !DEFAULT_OFF_PATTERNS.includes(id), id);
    // the off patterns still detect when explicitly enabled (positive examples above run with everything enabled)
    const cfg: DetectConfig = { ...on, enabled: Object.fromEntries(PATTERN_DEFS.map(d => [d.id, !DEFAULT_OFF_PATTERNS.includes(d.id)])) };
    assert.ok(!has(downBase(), [k(171, 173, 169, 171.1)], 'doji', cfg));
    assert.ok(has(downBase(), [k(171, 172, 168.5, 169), k(168.5, 172, 168, 171.5)], 'bullishEngulfing', cfg));
});
test('engulfing guards: engulfing body >= 1.0 avgBody, engulfed body >= 0.3 avgBody', () => {
    // near-doji (body 0.1 < 0.6) followed by a big bullish bar that engulfs it
    const nearDoji = [k(171, 172, 169.5, 170.9), k(170.8, 174, 170.5, 173.5)];
    assert.ok(!has(downBase(), nearDoji, 'bullishEngulfing'));
    assert.ok(has(downBase(), nearDoji, 'bullishEngulfing', { ...on, sizeGuards: false }));
    // engulfing body 1.1 (< 1.0 * avgBody 2) rejected, 2.1 accepted
    const prev = k(170.5, 171, 169, 169.5); // body 1
    assert.ok(!has(downBase(), [prev, k(169.5, 171, 169.2, 170.6)], 'bullishEngulfing')); // body 1.1
    assert.ok(has(downBase(), [prev, k(169.3, 171.6, 169.2, 171.4)], 'bullishEngulfing')); // body 2.1
    // mirrored bearish
    const nd2 = [k(129, 131, 128.5, 129.1), k(129.2, 129.5, 126, 126.5)];
    assert.ok(!has(upBase(), nd2, 'bearishEngulfing'));
});
test('quiet / mixed-size market: labelled share drops with the guards', () => {
    const bars = randSeries(7, 3000, 0.15, true);
    const enabled: Record<string, boolean> = {};
    for (const d of PATTERN_DEFS) enabled[d.id] = true; // everything on, tweezers included
    const defaults: Record<string, boolean> = { ...enabled };
    for (const id of DEFAULT_OFF_PATTERNS) defaults[id] = false;
    const run = (cfg: DetectConfig) => { const d = new PatternDetector(); d.update(bars, cfg); return labelled(d); };
    const before = run({ ...on, enabled, sizeGuards: false });
    const afterAll = run({ ...on, enabled });
    const afterDefault = run({ ...on, enabled: defaults });
    console.log(`     labelled share: before ${(before * 100).toFixed(1)}%  after guards ${(afterAll * 100).toFixed(1)}%  after guards + tweezers off ${(afterDefault * 100).toFixed(1)}%`);
    assert.ok(afterDefault < before * 0.6, `expected a clear drop: ${before} -> ${afterDefault}`);
    assert.ok(afterDefault < 0.2);
});

// ---------------------------------------------------------------- pivot grouper / data cache
test('pivot grouper: incremental update equals a fresh grouping (ticks, new bars, history swap)', () => {
    const all = mk(12 + 24 * 6);
    const g = new PivotGrouper();
    for (let n = 20; n <= all.length; n += 3) {
        const slice = all.slice(0, n);
        g.update(slice, 'daily');
        const ticked = slice.map((b, i) => (i === n - 1 ? { ...b, high: b.high + 9, close: b.close + 1 } : b));
        g.update(ticked, 'daily');
        const fresh = new PivotGrouper().update(ticked, 'daily');
        assert.deepEqual(g.groups, fresh, `n=${n}`);
    }
    // different series, same length and first bar -> must regroup
    const other = all.map((b, i) => (i === 0 ? b : { ...b, high: b.high + 50, low: b.low + 50, close: b.close + 50 }));
    g.update(other, 'daily');
    assert.deepEqual(g.groups, new PivotGrouper().update(other, 'daily'));
    // period change and prepend
    g.update(other, 'weekly');
    assert.deepEqual(g.groups, new PivotGrouper().update(other, 'weekly'));
    g.update(all.slice(30), 'daily');
    g.update(all, 'daily');
    assert.deepEqual(g.groups, new PivotGrouper().update(all, 'daily'));
    assert.deepEqual(pivotPeriodsFromGroups(g.groups, 'classic', 3), computePivotPeriods(all, 'daily', 'classic', 3));
});
test('integer period start matches Date based start for day / week; month / year cache', () => {
    for (let ms = Date.UTC(2019, 11, 20); ms < Date.UTC(2021, 2, 1); ms += 5 * 3600000 + 1234567) {
        const d = new Date(ms);
        const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        assert.equal(periodStartMs(ms, 'daily'), day);
        assert.equal(periodStartMs(ms, 'weekly'), day - ((d.getUTCDay() + 6) % 7) * 86400000);
        assert.equal(periodStartMs(ms, 'monthly'), Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
        assert.equal(periodStartMs(ms, 'yearly'), Date.UTC(d.getUTCFullYear(), 0, 1));
    }
    // out-of-order access (cache must not return a stale boundary)
    assert.equal(periodStartMs(Date.UTC(2026, 5, 3), 'monthly'), Date.UTC(2026, 5, 1));
    assert.equal(periodStartMs(Date.UTC(2025, 0, 31), 'monthly'), Date.UTC(2025, 0, 1));
    assert.equal(periodStartMs(Date.UTC(2026, 5, 30, 23), 'monthly'), Date.UTC(2026, 5, 1));
    assert.equal(periodStartMs(Date.UTC(2026, 6, 1), 'monthly'), Date.UTC(2026, 6, 1));
});
test('syncTimePoints: reuses the array on a tick / new bar, rebuilds on a different series', () => {
    const a = randSeries(5, 100, 1);
    const fp = new SeriesFingerprint();
    const d1 = syncTimePoints([], a, fp);
    const d2 = syncTimePoints(d1, a.map((b, i) => (i === 99 ? { ...b, close: b.close + 1 } : b)), fp);
    assert.equal(d2, d1);
    const grown = [...a, { ...a[99], time: a[99].time + 60 }];
    const d3 = syncTimePoints(d2, grown, fp);
    assert.equal(d3, d1);
    assert.equal(d3.length, 101);
    assert.equal(d3[100].time, grown[100].time);
    const diff = randSeries(6, 101, 1);
    const d4 = syncTimePoints(d3, diff, fp);
    assert.notEqual(d4, d1);
    assert.deepEqual(d4.map(p => p.time), diff.map(b => b.time));
});

console.log(`\n${passed} tests passed`);
