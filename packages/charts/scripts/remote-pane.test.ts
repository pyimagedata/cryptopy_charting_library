// Standalone tests for src/indicators/remote-pane-utils.ts (shared logic of the Funding Rate, Open Interest and
// Long/Short Ratio panes). Run from packages/charts:  node scripts/run-remote-pane-test.mjs

import assert from 'node:assert/strict';
import {
    normalizeInterval, derivsRequestInterval, binanceFuturesSymbol, clampDerivsFrom, chunkWindows, holdToBars,
    holdSecondsFor, aggregateFunding, lineRuns, formatCompact, formatPercent, formatSignedPercent, formatCountdown,
    formatRatio, SharedRequestCache, NO_VALUE, mapDerivsPoints,
} from '../src/indicators/remote-pane-utils';
import { runMachineTests } from './remote-pane-machine.test';

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
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


(async () => {
    await test('normalizeInterval: toolbar strings', () => {
        assert.deepEqual(normalizeInterval('1m'), { interval: '1m', seconds: 60 });
        assert.deepEqual(normalizeInterval('240'), { interval: '240m', seconds: 14400 });
        assert.deepEqual(normalizeInterval('4h'), { interval: '4h', seconds: 14400 });
        assert.deepEqual(normalizeInterval('12h'), { interval: '12h', seconds: 43200 });
        assert.deepEqual(normalizeInterval('D'), { interval: '1d', seconds: 86400 });
        assert.deepEqual(normalizeInterval('W'), { interval: '1w', seconds: 604800 });
        assert.equal(normalizeInterval('M')?.interval, '1mo');
        assert.equal(normalizeInterval('1M')?.interval, '1mo');
        assert.equal(normalizeInterval('3M'), null);
        assert.equal(normalizeInterval('30s'), null);
        assert.equal(normalizeInterval(''), null);
        assert.equal(normalizeInterval(undefined), null);
    });

    await test('derivsRequestInterval: below 5m is requested as 5m', () => {
        assert.deepEqual(derivsRequestInterval(normalizeInterval('1m')!), { interval: '5m', seconds: 300 });
        assert.deepEqual(derivsRequestInterval(normalizeInterval('3m')!), { interval: '5m', seconds: 300 });
        assert.deepEqual(derivsRequestInterval(normalizeInterval('15m')!), { interval: '15m', seconds: 900 });
        assert.equal(derivsRequestInterval(normalizeInterval('4h')!).interval, '4h');
    });

    await test('binanceFuturesSymbol', () => {
        assert.equal(binanceFuturesSymbol('BTCUSDT', 'BINANCE'), 'BTCUSDT');
        assert.equal(binanceFuturesSymbol('btcusdt.P', 'binance-futures'), 'BTCUSDT');
        assert.equal(binanceFuturesSymbol('BTCUSDT', 'BYBIT'), null);
        assert.equal(binanceFuturesSymbol('AAPL', 'NASDAQ'), null);
        assert.equal(binanceFuturesSymbol('BTC/USDT', 'BINANCE'), null);
        assert.equal(binanceFuturesSymbol('BTCUSDT', undefined), null);
    });

    await test('clampDerivsFrom: sub-hour clamps to now-29d, hourly+ untouched', () => {
        const now = 1_800_000_000;
        assert.equal(clampDerivsFrom(now - 100 * 86400, 60, now), now - 29 * 86400);
        assert.equal(clampDerivsFrom(now - 10 * 86400, 900, now), now - 10 * 86400);
        assert.equal(clampDerivsFrom(now - 100 * 86400, 3600, now), now - 100 * 86400);
        assert.equal(clampDerivsFrom(now - 500 * 86400, 86400, now), now - 500 * 86400);
    });

    await test('chunkWindows: newest first, within the cap, no overlap, full coverage', () => {
        const step = 3600;
        const from = 1_000_000 * step;
        const to = from + 9999 * step; // 10000 buckets
        const w = chunkWindows(from, to, step, 4000);
        assert.equal(w.length, 3);
        assert.equal(w[0][1], to);
        assert.equal(w[w.length - 1][0], from);
        let covered = 0;
        for (let i = 0; i < w.length; i++) {
            const buckets = (w[i][1] - w[i][0]) / step + 1;
            assert.ok(buckets <= 4000);
            covered += buckets;
            if (i > 0) assert.equal(w[i][1], w[i - 1][0] - step);
        }
        assert.equal(covered, 10000);
        assert.deepEqual(chunkWindows(100, 100, 60, 4000), [[100, 100]]);
        assert.deepEqual(chunkWindows(200, 100, 60, 4000), []);
    });

    await test('holdToBars: 5m points on a 1m chart are carried forward, never backward', () => {
        const base = 1_800_000_000 - (1_800_000_000 % 300);
        const points = [base, base + 300, base + 600];
        // bars: 2 minutes before the first point, then every minute for 12 minutes
        const bars: number[] = [];
        for (let m = -2; m < 12; m++) bars.push((base + m * 60) * 1000);
        const idx = holdToBars(bars, points, holdSecondsFor(60));
        assert.deepEqual(idx.slice(0, 2), [-1, -1]); // before first point: empty
        assert.deepEqual(idx.slice(2, 7), [0, 0, 0, 0, 0]);
        assert.deepEqual(idx.slice(7, 12), [1, 1, 1, 1, 1]);
        assert.deepEqual(idx.slice(12), [2, 2]);
    });

    await test('holdToBars: hold stops after maxAge (missing data is not stretched forever)', () => {
        const points = [0, 3600];
        const bars = [0, 1800, 3599, 3600, 7200, 7300].map((s) => s * 1000);
        const idx = holdToBars(bars, points, 3600);
        assert.deepEqual(idx, [0, 0, 0, 1, -1, -1]);
    });

    await test('holdToBars: charts >= 1h need an aligned point', () => {
        const h4 = 14400;
        const points = [0, h4, 3 * h4]; // bucket 2 missing
        const bars = [0, h4, 2 * h4, 3 * h4].map((s) => s * 1000);
        assert.deepEqual(holdToBars(bars, points, holdSecondsFor(h4)), [0, 1, -1, 2]);
        assert.equal(holdSecondsFor(60), 3600);
        assert.equal(holdSecondsFor(86400), 86400);
    });

    await test('aggregateFunding: one settlement per 8h bar on a 4h chart', () => {
        const h = 3600;
        const t0 = 1_800_000_000 - (1_800_000_000 % (4 * h));
        const bars = [0, 1, 2, 3, 4].map((i) => (t0 + i * 4 * h) * 1000);
        const rows: Array<[number, number]> = [[t0 + 4 * h, 0.0001], [t0 + 12 * h, -0.00005]];
        const out = aggregateFunding(bars, 4 * h * 1000, rows);
        assert.deepEqual(out, [null, 0.0001, null, -0.00005, null]);
    });

    await test('aggregateFunding: several settlements in one 1D bar are summed', () => {
        const day = 86400;
        const d0 = 1_800_000_000 - (1_800_000_000 % day);
        const bars = [d0, d0 + day, d0 + 2 * day].map((s) => s * 1000);
        const rows: Array<[number, number]> = [
            [d0 + 0, 0.0001], [d0 + 8 * 3600, 0.0002], [d0 + 16 * 3600, -0.00005],
            [d0 + day, 0.0003],
        ];
        const out = aggregateFunding(bars, day * 1000, rows);
        assert.ok(Math.abs((out[0] as number) - 0.00025) < 1e-12);
        assert.ok(Math.abs((out[1] as number) - 0.0003) < 1e-12);
        assert.equal(out[2], null);
    });

    await test('aggregateFunding: before first bar / after last bar are dropped; time inside a bar maps to it', () => {
        const t0 = 1_800_000_000 - (1_800_000_000 % 3600);
        const bars = [t0, t0 + 3600].map((s) => s * 1000);
        const rows: Array<[number, number]> = [
            [t0 - 10, 0.1], [t0 + 1800, 0.01], [t0 + 3600 + 3599, 0.02], [t0 + 7200, 0.5],
        ];
        assert.deepEqual(aggregateFunding(bars, 3600 * 1000, rows), [0.01, 0.02]);
        assert.deepEqual(aggregateFunding([], 3600 * 1000, rows), []);
    });

    await test('lineRuns: short gaps connect, long gaps break the line', () => {
        const v = [1, 2, null, null, 3, null, null, null, null, 4, 5];
        const runs = lineRuns(v, 0, v.length - 1, 3);
        assert.deepEqual(runs, [[0, 1, 4], [9, 10]]);
        assert.deepEqual(lineRuns([null, null], 0, 1, 3), []);
        assert.deepEqual(lineRuns([1, NaN, 2], 0, 2, 3), [[0, 2]]);
    });

    await test('formatCompact', () => {
        assert.equal(formatCompact(1.234e9), '1.23B');
        assert.equal(formatCompact(340e6), '340M');
        assert.equal(formatCompact(12_500), '12.5K');
        assert.equal(formatCompact(-2.5e6), '-2.5M');
        assert.equal(formatCompact(12), '12');
        assert.equal(formatCompact(null), NO_VALUE);
        assert.equal(formatCompact(NaN), NO_VALUE);
    });

    await test('percent / ratio formatting', () => {
        assert.equal(formatPercent(0.01), '0.0100%');
        assert.equal(formatPercent(-0.0085), '-0.0085%');
        assert.equal(formatPercent(null), NO_VALUE);
        assert.equal(formatSignedPercent(1.234), '+1.23%');
        assert.equal(formatSignedPercent(-0.5), '-0.50%');
        assert.equal(formatRatio(1.23456, 3), '1.235');
        assert.equal(formatRatio(undefined), NO_VALUE);
    });

    await test('formatCountdown', () => {
        const now = 1_800_000_000_000;
        assert.equal(formatCountdown(1_800_000_000 + 2 * 3600 + 14 * 60 + 7, now), '02:14:07');
        assert.equal(formatCountdown(1_800_000_000 + 59, now), '00:00:59');
        assert.equal(formatCountdown(1_800_000_000 - 5, now), '00:00:00');
        assert.equal(formatCountdown(0, now), null);
        assert.equal(formatCountdown(null, now), null);
        assert.equal(formatCountdown(undefined, now), null);
        assert.equal(formatCountdown(NaN, now), null);
    });

    await test('SharedRequestCache: concurrent identical requests share one fetch', async () => {
        let clock = 0;
        const cache = new SharedRequestCache<number>(60_000, () => clock);
        let calls = 0;
        const fetcher = async () => { calls++; await Promise.resolve(); return 42; };
        const [a, b] = await Promise.all([cache.get('k', fetcher), cache.get('k', fetcher)]);
        assert.equal(a, 42);
        assert.equal(b, 42);
        assert.equal(calls, 1);
    });

    await test('SharedRequestCache: TTL reuse, expiry, separate keys (symbols stay separate)', async () => {
        let clock = 1000;
        const cache = new SharedRequestCache<string>(60_000, () => clock);
        const calls: string[] = [];
        const mk = (k: string) => async () => { calls.push(k); return k + calls.length; };
        assert.equal(await cache.get('BTC|5m', mk('BTC')), 'BTC1');
        clock += 59_000;
        assert.equal(await cache.get('BTC|5m', mk('BTC')), 'BTC1'); // within TTL: no new call
        assert.equal(await cache.get('ETH|5m', mk('ETH')), 'ETH2'); // other symbol: own request
        clock += 2_000; // BTC entry is now 61 s old
        assert.equal(await cache.get('BTC|5m', mk('BTC')), 'BTC3');
        assert.deepEqual(calls, ['BTC', 'ETH', 'BTC']);
    });

    await test('SharedRequestCache: failures are not cached and clear the in-flight slot', async () => {
        const cache = new SharedRequestCache<number>(60_000, () => 0);
        let n = 0;
        const f = async () => { n++; if (n === 1) throw Object.assign(new Error('x'), { status: 503 }); return 7; };
        await assert.rejects(cache.get('k', f));
        assert.equal(await cache.get('k', f), 7);
        assert.equal(n, 2);
    });

    await test('SharedRequestCache: bounded size', async () => {
        const cache = new SharedRequestCache<number>(60_000, () => 0, 3);
        for (let i = 0; i < 10; i++) await cache.get('k' + i, async () => i);
        assert.ok(cache.size <= 3);
    });

    await test('SharedRequestCache: fresh requests skip old answers, share in-flight, reuse answers <= 5 s old', async () => {
        let clock = 0;
        const cache = new SharedRequestCache<number>(60_000, () => clock);
        let n = 0;
        const f = async () => { n++; await Promise.resolve(); return n; };
        assert.equal(await cache.get('k', f), 1);
        clock = 3000;
        assert.equal(await cache.get('k', f, { fresh: true }), 1); // just fetched: reused
        clock = 30_000;
        assert.equal(await cache.get('k', f), 1); // non-fresh: TTL
        const [a, b] = await Promise.all([cache.get('k', f, { fresh: true }), cache.get('k', f, { fresh: true })]);
        assert.equal(a, 2); // fresh: refetched once, shared
        assert.equal(b, 2);
        clock = 30_000 + 100;
        assert.equal(await cache.get('k', f), 2); // and stored for others
    });

    await test('mapDerivsPoints: point becomes visible at t+period on finer bars, never backward', () => {
        const t0 = 1_800_000_000 - (1_800_000_000 % 300);
        const bars = [];
        for (let m = -1; m < 12; m++) bars.push((t0 + m * 60) * 1000);
        const pts = [{ t: t0, period: 300 }, { t: t0 + 300, period: 300 }];
        const idx = mapDerivsPoints(bars, pts, 60);
        assert.deepEqual(idx.slice(0, 6), [-1, -1, -1, -1, -1, -1]); // t0-1m .. t0+4m: nothing known yet
        assert.deepEqual(idx.slice(6, 11), [0, 0, 0, 0, 0]);        // from t0+5m
        assert.deepEqual(idx.slice(11), [1, 1]);                     // from t0+10m
        // equal interval: visible on its own bar
        const b5 = [t0, t0 + 300, t0 + 600].map((s) => s * 1000);
        assert.deepEqual(mapDerivsPoints(b5, pts, 300), [0, 1, 1]);
        // 30m points on a 5m chart appear 30 minutes late
        const b30 = [0, 1, 2, 5, 6, 7].map((i) => (t0 + i * 300) * 1000);
        assert.deepEqual(mapDerivsPoints(b30, [{ t: t0, period: 1800 }], 300), [-1, -1, -1, -1, 0, 0]);
    });

    await test('mapDerivsPoints: >= 1h charts use the bar that opens at the point; month never borrows the previous month', () => {
        const h = 3600;
        const t0 = 1_800_000_000 - (1_800_000_000 % h);
        const bars = [0, 1, 2, 3].map((i) => (t0 + i * h) * 1000);
        const pts = [{ t: t0, period: h }, { t: t0 + 2 * h, period: h }];
        assert.deepEqual(mapDerivsPoints(bars, pts, h), [0, -1, 1, -1]);
        const feb = Date.UTC(2026, 1, 1) / 1000, mar = Date.UTC(2026, 2, 1) / 1000, apr = Date.UTC(2026, 3, 1) / 1000;
        assert.deepEqual(mapDerivsPoints([feb * 1000, mar * 1000, apr * 1000], [{ t: feb, period: 31 * 86400 }], 31 * 86400), [0, -1, -1]);
    });

    passed += await runMachineTests();
    console.log(`\n${passed} passed${process.exitCode ? ', with failures' : ''}`);
})();
