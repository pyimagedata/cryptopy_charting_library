import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBt } from '../src/bt-engine.js';
import { aggregateSlice } from '../src/backtest-data.js';

const bt = createBt(globalThis);
const H = 3_600_000, D = 86_400_000;
const near = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} expected ${b}, got ${a}`);

// bars: [o,h,l,c][] at hourly spacing from `t0`.
function mk(bars, { t0 = 0, step = H, symbol = 'TEST', timeframe = '1h' } = {}) {
    const n = bars.length;
    const d = { t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n), v: new Float64Array(n).fill(1), length: n };
    bars.forEach((b, i) => { d.t[i] = t0 + i * step; [d.o[i], d.h[i], d.l[i], d.c[i]] = b; });
    d.meta = { symbol, timeframe, count: n };
    return d;
}
// Strategy that fires scripted orders at given bar indices: { 0: ['buy', {...}], 3: ['close'] }.
function scripted(bars, script, extra = {}) {
    const data = bars.length !== undefined && bars.t ? bars : mk(bars);
    return bt.run({
        data, lotStep: 0, ...extra,
        onBar(ctx, i) {
            const s = script[i];
            if (!s) return;
            if (s[0] === 'buy') ctx.buy(s[1] || {}); else if (s[0] === 'sell') ctx.sell(s[1] || {}); else if (s[0] === 'close') ctx.close(s[1]);
            else if (s[0] === 'fn') s[1](ctx);
        },
    });
}
const flat = (p) => [p, p, p, p];

test('long: fills at next open, exits at close order next open, no costs', () => {
    const r = scripted([[100, 101, 99, 100], [100, 105, 99, 104], [106, 107, 105, 106], [106, 106, 106, 106]], { 0: ['buy', { lots: 1 }], 1: ['close'] });
    assert.equal(r.allTrades.length, 1);
    const t = r.allTrades[0];
    assert.equal(t.entry, 100); assert.equal(t.exit, 106); assert.equal(t.entryIdx, 1); assert.equal(t.exitIdx, 2);
    assert.equal(t.pnl, 6); assert.equal(t.reason, 'signal');
    assert.equal(r.summary.finalEquity, 10006);
    assert.equal(r.summary.netProfit, 6);
});

test('costs: half spread each side, slippage, commission per lot per side', () => {
    const r = scripted([[100, 101, 99, 100], [100, 105, 99, 104], [106, 107, 105, 106], flat(106)], { 0: ['buy', { lots: 2 }], 1: ['close'] },
        { costs: { spread: 0.4, slippage: 0.1, commissionPerLot: 2 } });
    const t = r.allTrades[0];
    near(t.entry, 100.3); near(t.exit, 105.7);
    // gross (105.7-100.3)*2 = 10.8, commission 2*2*2 = 8
    near(t.pnl, 2.8, 1e-9);
    near(r.summary.costsPaid.spread, 0.4 * 2, 1e-9);   // 0.2 each side * 2 lots
    near(r.summary.costsPaid.slippage, 0.1 * 2 * 2, 1e-9);
    near(r.summary.costsPaid.commission, 8);
    near(r.summary.finalEquity, 10002.8, 1e-9);
});

test('short with costs mirrors long', () => {
    const r = scripted([[100, 101, 99, 100], [100, 101, 94, 95], [94, 95, 93, 94], flat(94)], { 0: ['sell', { lots: 1 }], 1: ['close'] },
        { costs: { spread: 0.4, slippage: 0.1 } });
    const t = r.allTrades[0];
    assert.equal(t.side, 'short');
    near(t.entry, 99.7); near(t.exit, 94.3);
    near(t.pnl, 5.4);
});

test('SL hit intrabar fills at stop; TP at target (no slippage on TP)', () => {
    const base = [[100, 101, 99, 100], [100, 101, 99, 100]];
    let r = scripted([...base, [100, 100.5, 97.5, 98], flat(98)], { 0: ['buy', { lots: 1, sl: 98, tp: 103 }] }, { costs: { slippage: 0.2 } });
    assert.equal(r.allTrades[0].reason, 'sl');
    near(r.allTrades[0].exit, 97.8); // stop exits pay slippage
    r = scripted([...base, [100, 104, 99.5, 103], flat(103)], { 0: ['buy', { lots: 1, sl: 98, tp: 103 }] }, { costs: { slippage: 0.2 } });
    assert.equal(r.allTrades[0].reason, 'tp');
    near(r.allTrades[0].entry, 100.2); near(r.allTrades[0].exit, 103);
});

test('SL and TP in the same bar: SL first by default, TP with sameBar:"tp"', () => {
    const bars = [[100, 101, 99, 100], [100, 101, 99, 100], [100, 104, 97, 100], flat(100)];
    let r = scripted(bars, { 0: ['buy', { lots: 1, sl: 98, tp: 103 }] });
    assert.equal(r.allTrades[0].reason, 'sl'); assert.equal(r.allTrades[0].exit, 98);
    r = scripted(bars, { 0: ['buy', { lots: 1, sl: 98, tp: 103 }] }, { sameBar: 'tp' });
    assert.equal(r.allTrades[0].reason, 'tp'); assert.equal(r.allTrades[0].exit, 103);
});

test('gap through stop fills at the open; gap through target fills at the (better) open', () => {
    let r = scripted([[100, 101, 99, 100], [100, 101, 99, 100], [96, 97, 95, 96], flat(96)], { 0: ['buy', { lots: 1, sl: 98 }] });
    assert.equal(r.allTrades[0].exit, 96); assert.equal(r.allTrades[0].pnl, -4);
    r = scripted([[100, 101, 99, 100], [100, 101, 99, 100], [106, 107, 105, 106], flat(106)], { 0: ['buy', { lots: 1, tp: 103 }] });
    assert.equal(r.allTrades[0].exit, 106);
    // short mirrored
    r = scripted([[100, 101, 99, 100], [100, 101, 99, 100], [104, 105, 103, 104], flat(104)], { 0: ['sell', { lots: 1, sl: 102 }] });
    assert.equal(r.allTrades[0].exit, 104); assert.equal(r.allTrades[0].pnl, -4);
});

test('stop can trigger on the entry bar itself', () => {
    const r = scripted([[100, 101, 99, 100], [100, 100.5, 98.5, 99], flat(99)], { 0: ['buy', { lots: 1, sl: 99 }] });
    assert.equal(r.allTrades[0].entryIdx, 1); assert.equal(r.allTrades[0].exitIdx, 1); assert.equal(r.allTrades[0].exit, 99);
});

test('reversal closes then opens at the same price; end of data closes at last close', () => {
    const r = scripted([[100, 101, 99, 100], [100, 102, 99, 101], [103, 104, 102, 103], [103, 104, 90, 95]],
        { 0: ['buy', { lots: 1 }], 1: ['sell', { lots: 1 }] });
    assert.equal(r.allTrades.length, 2);
    assert.equal(r.allTrades[0].side, 'long'); assert.equal(r.allTrades[0].exit, 103); assert.equal(r.allTrades[0].pnl, 3);
    assert.equal(r.allTrades[1].side, 'short'); assert.equal(r.allTrades[1].entry, 103);
    assert.equal(r.allTrades[1].reason, 'eod'); assert.equal(r.allTrades[1].exit, 95); assert.equal(r.allTrades[1].pnl, 8);
    assert.ok(r.warnings.some((w) => /still open/.test(w)));
    assert.equal(r.summary.finalEquity, 10011);
});

test('riskPct sizing: lots = balance*risk% / (stop distance * contractSize), floored to lotStep', () => {
    const bars = [[100, 101, 99, 100], [100, 101, 99, 100], [100, 100.5, 97, 98], flat(98)];
    let r = scripted(bars, { 0: ['buy', { slDist: 2 }] }, { contractSize: 100, lotStep: 0.01, sizing: { mode: 'riskPct', riskPct: 1 } });
    near(r.allTrades[0].lots, 0.5);              // 100 / (2*100)
    near(r.allTrades[0].pnl, -100);              // loses exactly 1%
    near(r.allTrades[0].r, -1);
    r = scripted(bars, { 0: ['buy', { slDist: 3 }] }, { contractSize: 1, lotStep: 0.01, sizing: { mode: 'riskPct', riskPct: 1 } });
    near(r.allTrades[0].lots, 33.33);            // floor(100/3, 0.01)
    r = scripted(bars, { 0: ['buy', {}] }, { sizing: { mode: 'riskPct', riskPct: 1 } });
    assert.equal(r.allTrades.length, 0);
    assert.ok(r.warnings.some((w) => /noStopForRisk=1/.test(w)));
});

test('invalid stops are rejected; maxLots caps; too-small orders skipped', () => {
    const bars = [[100, 101, 99, 100], [100, 101, 99, 100], flat(100)];
    let r = scripted(bars, { 0: ['buy', { lots: 1, sl: 101 }] });
    assert.equal(r.allTrades.length, 0); assert.ok(r.warnings.some((w) => /stopWrongSide=1/.test(w)));
    r = scripted(bars, { 0: ['buy', { lots: 500 }] }, { maxLots: 5 });
    assert.equal(r.allTrades[0].lots, 5);
    r = scripted(bars, { 0: ['buy', { slDist: 1 }] }, { lotStep: 0.01, contractSize: 100, capital: 10, sizing: { mode: 'riskPct', riskPct: 1 } });
    assert.equal(r.allTrades.length, 0); assert.ok(r.warnings.some((w) => /tooSmall=1/.test(w)));
});

test('fill:"close" fills at the signal bar close; SL/TP from the next bar', () => {
    const r = scripted([[100, 101, 99, 100.5], [100.5, 102, 97, 98], flat(98)], { 0: ['buy', { lots: 1, sl: 98 }] }, { fill: 'close' });
    assert.equal(r.allTrades[0].entryIdx, 0); assert.equal(r.allTrades[0].entry, 100.5);
    assert.equal(r.allTrades[0].exitIdx, 1); assert.equal(r.allTrades[0].exit, 98);
});

test('setStop acts from the next bar (trailing); tpR / slDist resolved at fill price', () => {
    let r = scripted([[100, 101, 99, 100], [100, 103, 100, 103], [103, 104, 100.5, 101], flat(101)],
        { 0: ['buy', { lots: 1, sl: 95 }], 1: ['fn', (c) => c.setStop(101)] });
    assert.equal(r.allTrades[0].exit, 101); assert.equal(r.allTrades[0].exitIdx, 2);
    r = scripted([[100, 101, 99, 100], [100, 101, 99, 100], [100, 108, 99.5, 108], flat(108)], { 0: ['buy', { lots: 1, slDist: 2, tpR: 3 }] });
    assert.equal(r.allTrades[0].exit, 106); assert.equal(r.allTrades[0].reason, 'tp'); near(r.allTrades[0].r, 3);
});

test('pyramiding off ignores same-side orders; on averages the entry', () => {
    const bars = [[100, 101, 99, 100], [100, 101, 99, 100], [102, 103, 101, 102], [104, 105, 103, 104], flat(104)];
    const sc = { 0: ['buy', { lots: 1 }], 1: ['buy', { lots: 1 }] };
    let r = scripted(bars, sc);
    assert.equal(r.allTrades[0].lots, 1);
    r = scripted(bars, sc, { pyramiding: true });
    assert.equal(r.allTrades[0].lots, 2); near(r.allTrades[0].entry, 101);
});

test('allowShort=false ignores sells when flat; sessionFilter blocks entries by fill-bar time', () => {
    let r = scripted([[100, 101, 99, 100], [100, 101, 99, 100], flat(100)], { 0: ['sell', { lots: 1 }] }, { allowShort: false });
    assert.equal(r.allTrades.length, 0);
    r = scripted([[100, 101, 99, 100], [100, 101, 99, 100], flat(100)], { 0: ['buy', { lots: 1 }] }, { sessionFilter: (t) => t !== H });
    assert.equal(r.allTrades.length, 0); assert.ok(r.warnings.some((w) => /session=1/.test(w)));
});

test('stats: winRate, profitFactor, expectancyR, long/short split, exposure', () => {
    // trade1 long +4 (sl 98 -> risk 2 => +2R), trade2 short -2 (sl 102 hit => -1R)
    const bars = [[100, 101, 99, 100], [100, 105, 99, 104], [104, 104, 104, 104], [104, 104, 104, 104], [100, 100, 100, 100], [100, 103, 99, 100], [100, 100, 100, 100]];
    const r = scripted(bars, { 0: ['buy', { lots: 1, sl: 98 }], 1: ['close'], 3: ['sell', { lots: 1, sl: 102 }] });
    assert.equal(r.allTrades.length, 2);
    assert.equal(r.allTrades[0].pnl, 4);                   // 100 -> 104 (open of bar 2)
    assert.equal(r.allTrades[1].entry, 100);               // fills at open[4]
    assert.equal(r.allTrades[1].exit, 102); assert.equal(r.allTrades[1].pnl, -2);
    const s = r.summary;
    assert.equal(s.trades, 2); assert.equal(s.winRate, 50); assert.equal(s.profitFactor, 2);
    assert.equal(s.avgTrade, 1); assert.equal(s.avgWin, 4); assert.equal(s.avgLoss, -2);
    near(s.expectancyR, (2 + -1) / 2, 1e-9);
    assert.equal(s.long.trades, 1); assert.equal(s.short.trades, 1); assert.equal(s.short.net, -2);
    assert.equal(s.netProfit, 2);
    // held bars: trade1 enters at open[1] and exits at open[2] -> only bar 1; trade2 bars 4..5 (SL bar counts) -> 3 of 7
    near(s.exposurePct, 3 / 7 * 100, 0.1);
    assert.deepEqual(r.allTrades.map((x) => x.bars), [1, 2]);
    assert.equal(r.tradesTotal, 2);
    assert.equal(r.byYear[0].year, 1970);
});

test('drawdown: peak-to-trough on bar-level equity', () => {
    // long 1 lot from 100: equity path 100->110 (+10), ->95 (-5), end 98
    const r = scripted([[100, 100, 100, 100], [100, 110, 100, 110], [110, 110, 94, 95], [95, 98, 95, 98]], { 0: ['buy', { lots: 1 }] });
    near(r.summary.maxDrawdown, 15);
    near(r.summary.maxDrawdownPct, 15 / 10010 * 100, 0.01);
});

test('trades output is capped (first+last) but allTrades keeps everything; equity <= 500 points', () => {
    const bars = [];
    for (let i = 0; i < 2000; i++) bars.push([100, 101, 99, 100]);
    const script = {};
    for (let i = 0; i < 1990; i += 2) script[i] = i % 4 === 0 ? ['buy', { lots: 1 }] : ['close'];
    const r = scripted(bars, script, { output: { maxTrades: 100 } });
    assert.ok(r.tradesTotal > 400); assert.equal(r.trades.length, 100); assert.equal(r.allTrades.length, r.tradesTotal);
    assert.ok(r.equity.length <= 500);
    assert.ok(!JSON.stringify(r).includes('allTrades'));
});

test('warnings: no costs, few trades', () => {
    const r = scripted([[100, 101, 99, 100], [100, 101, 99, 100], flat(100)], { 0: ['buy', { lots: 1 }] });
    assert.ok(r.warnings.some((w) => /No trading costs/.test(w)));
    assert.ok(r.warnings.some((w) => /Only 1 trades/.test(w)));
});

test('default contractSize: 100 for XAU symbols, 1 otherwise', () => {
    const b = [[100, 101, 99, 100], [100, 101, 99, 100], [101, 101, 101, 101]];
    assert.equal(bt.run({ data: mk(b, { symbol: 'XAUUSD' }), onBar: (c, i) => { if (i === 0) c.buy({ lots: 1 }); } }).config.contractSize, 100);
    assert.equal(bt.run({ data: mk(b), onBar() {} }).config.contractSize, 1);
});

// ---- look-ahead -----------------------------------------------------------

function randomWalk(n, seed = 7) {
    let s = seed; const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const bars = []; let p = 100;
    for (let i = 0; i < n; i++) {
        const o = p; const c = o + (rnd() - 0.5) * 2; const h = Math.max(o, c) + rnd(); const l = Math.min(o, c) - rnd();
        bars.push([o, h, l, c]); p = c;
    }
    return bars;
}
const prefix = (d, m) => ({ t: d.t.subarray(0, m), o: d.o.subarray(0, m), h: d.h.subarray(0, m), l: d.l.subarray(0, m), c: d.c.subarray(0, m), v: d.v.subarray(0, m), length: m, meta: d.meta });

function donchianStrategy(d) {
    return {
        data: d, lotStep: 0, costs: { spread: 0.05, commissionPerLot: 1 }, sizing: { mode: 'riskPct', riskPct: 1 },
        init(ctx) { ctx.state.up = bt.shift(bt.highest(d.h, 20), 1); ctx.state.dn = bt.shift(bt.lowest(d.l, 10), 1); ctx.state.atr = bt.atr(d, 14); },
        onBar(ctx, i) {
            const s = ctx.state;
            if (!(s.atr[i] > 0) || Number.isNaN(s.up[i])) return;
            if (!ctx.position && d.c[i] > s.up[i]) ctx.buy({ slDist: 2 * s.atr[i] });
            else if (ctx.position && d.c[i] < s.dn[i]) ctx.close();
        },
    };
}

test('engine has no look-ahead: results on a truncated series match the full run', () => {
    const d = mk(randomWalk(3000));
    const full = bt.run(donchianStrategy(d));
    assert.ok(full.allTrades.length > 10, 'strategy should trade');
    for (const m of [800, 1500, 2200]) {
        const part = bt.run(donchianStrategy(prefix(d, m)));
        // every trade fully inside the prefix (exit before the last bar, not forced 'eod') must be identical
        const a = part.allTrades.filter((t) => t.reason !== 'eod');
        const b = full.allTrades.slice(0, a.length);
        assert.ok(a.length > 3);
        assert.deepEqual(a, b);
        // and bar-level equity up to the first divergence-free region is identical
        const cut = a.length ? a[a.length - 1].exitIdx : 0;
        for (let i = 0; i <= cut; i += 37) assert.equal(part.equitySeries[i], full.equitySeries[i]);
    }
});

test('engine never reads bars after the fill bar when deciding: poisoning bars > i+1 before onBar(i) leaves past trades unchanged', () => {
    const d = mk(randomWalk(1200, 3));
    const ref = bt.run(donchianStrategy(d));
    // Same run, but a wrapper strategy reading from a copy where all bars beyond i+1 are garbage at call time.
    const poison = { ...d, t: d.t, o: Float64Array.from(d.o), h: Float64Array.from(d.h), l: Float64Array.from(d.l), c: Float64Array.from(d.c), v: d.v };
    const strat = donchianStrategy(d);
    const inner = strat.onBar;
    // indicators were precomputed from the clean arrays, so this checks the ENGINE: it must work from the arrays it was given
    strat.data = poison;
    strat.onBar = (ctx, i) => {
        for (let k = i + 2; k < Math.min(poison.o.length, i + 40); k++) { poison.o[k] = poison.h[k] = poison.l[k] = poison.c[k] = NaN; }
        inner(ctx, i);
        for (let k = i + 2; k < Math.min(poison.o.length, i + 40); k++) { poison.o[k] = d.o[k]; poison.h[k] = d.h[k]; poison.l[k] = d.l[k]; poison.c[k] = d.c[k]; }
    };
    const got = bt.run(strat);
    assert.deepEqual(got.allTrades, ref.allTrades);
});

// ---- indicators vs reference ------------------------------------------------

const series = (n, seed = 5) => { let s = seed; const out = new Float64Array(n); let p = 50; for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) % 2147483648; p += (s / 2147483648 - 0.5) * 3; out[i] = p; } return out; };
const same = (a, b, eps = 1e-9, name = '') => {
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) {
        if (Number.isNaN(b[i])) assert.ok(Number.isNaN(a[i]), `${name}[${i}] should be NaN, got ${a[i]}`);
        else assert.ok(Math.abs(a[i] - b[i]) <= eps, `${name}[${i}] expected ${b[i]} got ${a[i]}`);
    }
};
const naive = (x, n, f) => Float64Array.from(x, (_, i) => (i < n - 1 ? NaN : f(Array.from(x.subarray(i - n + 1, i + 1)))));

test('indicators match straightforward references', () => {
    const x = series(500);
    same(bt.sma(x, 20), naive(x, 20, (w) => w.reduce((a, b) => a + b) / w.length), 1e-9, 'sma');
    same(bt.wma(x, 10), naive(x, 10, (w) => w.reduce((a, b, k) => a + b * (k + 1), 0) / 55), 1e-9, 'wma');
    same(bt.stdev(x, 20), naive(x, 20, (w) => { const m = w.reduce((a, b) => a + b) / w.length; return Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length); }), 1e-9, 'stdev');
    same(bt.highest(x, 15), naive(x, 15, (w) => Math.max(...w)), 0, 'highest');
    same(bt.lowest(x, 15), naive(x, 15, (w) => Math.min(...w)), 0, 'lowest');
    // ema: seeded with SMA(n), alpha 2/(n+1)
    const e = new Float64Array(500).fill(NaN); let prev = x.slice(0, 10).reduce((a, b) => a + b) / 10; e[9] = prev;
    for (let i = 10; i < 500; i++) { prev = 2 / 11 * x[i] + (1 - 2 / 11) * prev; e[i] = prev; }
    same(bt.ema(x, 10), e, 1e-9, 'ema');
    const r = new Float64Array(500).fill(NaN); prev = x.slice(0, 14).reduce((a, b) => a + b) / 14; r[13] = prev;
    for (let i = 14; i < 500; i++) { prev = (prev * 13 + x[i]) / 14; r[i] = prev; }
    same(bt.rma(x, 14), r, 1e-9, 'rma');
    const bb = bt.bollinger(x, 20, 2), m = bt.sma(x, 20), sd = bt.stdev(x, 20);
    same(bb.upper, Float64Array.from(m, (v, i) => v + 2 * sd[i]), 1e-12, 'bbU'); same(bb.lower, Float64Array.from(m, (v, i) => v - 2 * sd[i]), 1e-12, 'bbL');
    same(bt.change(x, 3), Float64Array.from(x, (v, i) => (i < 3 ? NaN : v - x[i - 3])), 0, 'change');
    same(bt.roc(x, 3), Float64Array.from(x, (v, i) => (i < 3 ? NaN : (v / x[i - 3] - 1) * 100)), 1e-12, 'roc');
    const mc = bt.macd(x, 12, 26, 9);
    const e12 = bt.ema(x, 12), e26 = bt.ema(x, 26);
    same(mc.macd, Float64Array.from(x, (_, i) => e12[i] - e26[i]), 1e-12, 'macd');
    assert.ok(Number.isNaN(mc.signal[30]) && !Number.isNaN(mc.signal[40]));
});

test('rsi equals a naive Wilder implementation; atr = rma(tr)', () => {
    const x = series(300, 11);
    const n = 14, ref = new Float64Array(300).fill(NaN);
    let ag = 0, al = 0;
    for (let i = 1; i <= n; i++) { const c = x[i] - x[i - 1]; ag += Math.max(c, 0); al += Math.max(-c, 0); }
    ag /= n; al /= n; ref[n] = 100 - 100 / (1 + ag / al);
    for (let i = n + 1; i < 300; i++) { const c = x[i] - x[i - 1]; ag = (ag * (n - 1) + Math.max(c, 0)) / n; al = (al * (n - 1) + Math.max(-c, 0)) / n; ref[i] = 100 - 100 / (1 + ag / al); }
    same(bt.rsi(x, n), ref, 1e-9, 'rsi');
    const d = mk(randomWalk(200, 9));
    const trRef = Float64Array.from(d.t, (_, i) => (i === 0 ? d.h[0] - d.l[0] : Math.max(d.h[i] - d.l[i], Math.abs(d.h[i] - d.c[i - 1]), Math.abs(d.l[i] - d.c[i - 1]))));
    same(bt.tr(d), trRef, 0, 'tr');
    same(bt.atr(d, 14), bt.rma(trRef, 14), 1e-12, 'atr');
});

test('crossover/crossunder with series and numbers; NaN-safe', () => {
    const a = Float64Array.from([1, 2, 3, 2, 1, NaN, 3]);
    assert.deepEqual(Array.from(bt.crossover(a, 2.5)), [0, 0, 1, 0, 0, 0, 0]);
    assert.deepEqual(Array.from(bt.crossunder(a, 2.5)), [0, 0, 0, 1, 0, 0, 0]);
    const b = Float64Array.from([2, 2, 2, 2, 2, 2, 2]);
    assert.deepEqual(Array.from(bt.crossover(a, b)), [0, 0, 1, 0, 0, 0, 0]);
    assert.deepEqual(Array.from(bt.crossunder(a, b)), [0, 0, 0, 0, 1, 0, 0]);
});

test('NaN gaps in input restart windows (sma/ema) instead of poisoning the rest', () => {
    const x = Float64Array.from([1, 2, 3, NaN, 5, 6, 7, 8]);
    const s = bt.sma(x, 2);
    assert.deepEqual(Array.from(s), [NaN, 1.5, 2.5, NaN, NaN, 5.5, 6.5, 7.5]);
});

test('vwap resets per UTC day and per 1d_ny trading day', () => {
    const t0 = Date.UTC(2024, 0, 10, 20); // 20:00 UTC = 15:00 NY (winter)
    const bars = Array.from({ length: 12 }, (_, i) => [100 + i, 100 + i, 100 + i, 100 + i]);
    const d = mk(bars, { t0 });
    d.v = Float64Array.from([1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2]);
    const u = bt.vwap(d, { reset: '1d' });
    // bars 0..3 are Jan 10 (20,21,22,23 UTC); bar 4 starts Jan 11
    near(u[0], 100); near(u[1], (100 * 1 + 101 * 2) / 3);
    near(u[4], 104); near(u[5], (104 * 1 + 105 * 2) / 3);
    const ny = bt.vwap(d, { reset: '1d_ny' });
    // trading day starts 22:00 UTC (17:00 NY): bars 0,1 (20,21) | bars 2.. (22:00 UTC) onward until next 22:00
    near(ny[1], u[1]); near(ny[2], 102); near(ny[3], (102 * 1 + 103 * 2) / 3);
    near(ny[4], (102 + 103 * 2 + 104) / 4, 1e-9);
});

// ---- resample ---------------------------------------------------------------

test('resample builds correct HTF OHLCV and aligns without look-ahead', () => {
    const min = 60_000;
    const bars = []; for (let i = 0; i < 180; i++) bars.push([100 + i, 100.5 + i, 99.5 + i, 100.2 + i]);
    const d = mk(bars, { t0: 0, step: min, timeframe: '1m' });
    const h = bt.resample(d, '1h');
    assert.equal(h.length, 3);
    assert.equal(h.o[0], 100); assert.equal(h.c[0], 100.2 + 59); assert.equal(h.h[0], 100.5 + 59); assert.equal(h.l[0], 99.5);
    assert.equal(h.v[0], 60);
    const al = h.align(h.c);
    // before the first hour closes: nothing visible
    assert.ok(Number.isNaN(al[0]) && Number.isNaN(al[58]));
    // base bar 59 closes exactly at the end of HTF bar 0 -> now visible
    assert.equal(al[59], h.c[0]); assert.equal(al[60], h.c[0]); assert.equal(al[118], h.c[0]);
    assert.equal(al[119], h.c[1]);
});

test('resample.align is prefix-invariant (a truncated base series gives identical aligned values)', () => {
    const d = mk(randomWalk(5000, 21), { step: 5 * 60_000, timeframe: '5m' });
    const full = bt.resample(d, '1h');
    const fa = full.align(bt.ema(full.c, 5));
    for (const m of [777, 1234, 3001, 4999]) {
        const p = prefix(d, m);
        const hp = bt.resample(p, '1h');
        const pa = hp.align(bt.ema(hp.c, 5));
        for (let i = 0; i < m; i++) {
            if (Number.isNaN(fa[i])) assert.ok(Number.isNaN(pa[i])); else assert.equal(pa[i], fa[i], `m=${m} i=${i}`);
        }
    }
});

test('resample handles gaps conservatively (last bar of a bucket missing -> visible from the next bucket)', () => {
    const bars = []; for (let i = 0; i < 6; i++) bars.push(flat(100 + i));
    const d = mk(bars, { t0: 0, step: 30 * 60_000, timeframe: '30m' });
    // remove the 2nd half of hour 0 -> keep bars at 00:00, 01:00, 01:30, ...
    const keep = [0, 2, 3, 4, 5];
    const g2 = mk(keep.map((i) => bars[i]), { t0: 0, step: 30 * 60_000, timeframe: '30m' });
    keep.forEach((k, j) => { g2.t[j] = d.t[k]; });
    const h = bt.resample(g2, '1h');
    const al = h.align(h.c);
    assert.ok(Number.isNaN(al[0]));          // hour 0 not provably closed at bar 00:00
    assert.equal(al[1], h.c[0]);             // visible once hour 1 begins
});

test('resample 1d_ny bucket starts match phase-1 aggregateSlice across DST changes', () => {
    const t0 = Date.UTC(2023, 0, 1);
    const n = 24 * 400;
    const d = mk(Array.from({ length: n }, (_, i) => [100, 101, 99, 100 + (i % 7)]), { t0 });
    const h = bt.resample(d, '1d_ny');
    const ref = aggregateSlice({ t: d.t, o: d.o, h: d.h, l: d.l, c: d.c, v: d.v }, { timeframe: '1d_ny', baseTimeframe: '1h' });
    assert.equal(h.length, ref.count);
    for (let i = 0; i < ref.count; i++) assert.equal(h.t[i], ref.views.t[i], `bucket ${i}`);
});

// ---- sweep / walk-forward -------------------------------------------------------

test('sweep ranks by metric, honours maxCombos and minTrades', async () => {
    const d = mk(randomWalk(1500, 4));
    const mkRun = (p) => bt.run({ data: d, lotStep: 0, onBar(ctx, i) { if (i % p.every === 0) { ctx.position ? ctx.close() : ctx.buy({ lots: 1 }); } } });
    const sw = await bt.sweep({ every: [3, 5, 7, 11] }, mkRun, { metric: 'netPct', minTrades: 5 });
    assert.equal(sw.combos, 4);
    for (let i = 1; i < sw.rows.length; i++) assert.ok(sw.rows[i - 1].netPct >= sw.rows[i].netPct);
    await assert.rejects(() => bt.sweep({ a: [1, 2, 3], b: [1, 2, 3] }, mkRun, { maxCombos: 5 }), /maxCombos/);
    const low = await bt.sweep({ every: [1000] }, mkRun, { minTrades: 50 });
    assert.equal(low.rows.length, 0); assert.equal(low.skippedFewTrades, 1);
    const dd = await bt.sweep({ every: [3, 5] }, mkRun, { metric: 'maxDrawdownPct', minTrades: 1 });
    assert.ok(dd.rows[0].maxDrawdownPct <= dd.rows[1].maxDrawdownPct); // lower is better
});

test('walkForward: folds roll by test length; test slices use warm-up bars but trade only inside the window', async () => {
    const d = mk(randomWalk(24 * 365 * 3, 8), { t0: Date.UTC(2020, 0, 1) });
    const seenStart = [];
    const wf = await bt.walkForward({
        data: d, train: '12m', test: '6m', grid: { every: [5, 9] }, metric: 'netPct', minTrades: 5, warmupBars: 50,
        run: (p, s) => {
            seenStart.push(s.startIndex);
            return bt.run({ data: s, lotStep: 0, onBar(ctx, i) { if (i % p.every === 0) { ctx.position ? ctx.close() : ctx.buy({ lots: 1 }); } } });
        },
    });
    assert.equal(wf.folds.length, 3);   // 3y span: folds start 0, 6m, 12m (18m+... needs 18m window)
    assert.ok(wf.folds.every((f) => f.test && f.params));
    assert.ok(seenStart.some((x) => x === 50));
    assert.equal(wf.oos.folds, 3);
});

test('slice returns subarray views with startIndex for warm-up', () => {
    const d = mk(randomWalk(100), { t0: 0 });
    const s = bt.slice(d, 40 * H, 60 * H, 10);
    assert.equal(s.length, 30); assert.equal(s.startIndex, 10); assert.equal(s.t[10], 40 * H);
    const r = bt.run({ data: s, onBar(ctx, i) { assert.ok(i >= 10); } });
    assert.equal(r.config.bars, 20);
});

// ---- injection into compiled drafts ------------------------------------------------

test('compileDraftBacktest injects bt and the compiled JS runs via new Function with a fake __backtestData', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'btdrafts-'));
    process.env.BACKTEST_DRAFTS_DIR = dir;
    const { compileDraftBacktest, writeDraftBacktest, getBtEngineJs } = await import('../src/draft-backtests.js?inject');
    const code = `
        const D = bt.data();
        const sma5 = bt.sma(D.c, 5);
        const res = bt.run({ data: D, lotStep: 0, onBar(ctx, i) { if (i === 10) ctx.buy({ lots: 1 }); if (i === 20) ctx.close(); } });
        (globalThis as any).__draftBacktestResult = { v: bt.version, n: res.summary.trades, pnl: res.summary.netProfit, s: sma5[9] };
    `;
    await writeDraftBacktest({ name: 'inject_test_bt', code });
    const { js } = await compileDraftBacktest({ name: 'inject_test_bt' });
    const n = 50;
    const bars = Array.from({ length: n }, (_, i) => [100 + i, 101 + i, 99 + i, 100.5 + i]);
    const d = mk(bars);
    globalThis.__backtestData = { meta: d.meta, t: d.t, o: d.o, h: d.h, l: d.l, c: d.c, v: d.v };
    try {
        await new Function(js)();
    } finally { delete globalThis.__backtestData; }
    const out = globalThis.__draftBacktestResult; delete globalThis.__draftBacktestResult;
    assert.equal(out.v, bt.version); assert.equal(out.n, 1); near(out.pnl, 10, 1e-9); near(out.s, 107.5, 1e-9); // mean of closes 105.5..109.5 -> bars 5..9: 100.5+7
    // drafts that declare their own `bt` (any form) just shadow the injected one
    const variants = {
        own_const_bt: 'const bt = 5; (globalThis as any).__x = bt;',
        own_destruct_bt: 'const { bt } = { bt: 7 }; (globalThis as any).__x = bt;',
        own_comment_bt: '// const bt = 1 in a comment\nfor (const k of [1]) { (globalThis as any).__x = bt.version; }',
        own_fn_bt: 'function bt() { return 9; } (globalThis as any).__x = bt();',
    };
    const want = { own_const_bt: 5, own_destruct_bt: 7, own_comment_bt: bt.version, own_fn_bt: 9 };
    for (const [nm, src] of Object.entries(variants)) {
        await writeDraftBacktest({ name: nm, code: src });
        const own = await compileDraftBacktest({ name: nm });
        await new Function(own.js)();
        assert.equal(globalThis.__x, want[nm], nm); delete globalThis.__x;
    }
    assert.ok((await getBtEngineJs()).length < 30_000);
});

test('chartData builds the same shape from get_chart_context; plotTrades maps times to bar indices', async () => {
    const bars = Array.from({ length: 50 }, (_, i) => ({ barIndex: 100 + i, time: (1_700_000_000 + i * 3600), open: 100, high: 101, low: 99, close: 100, volume: 5 }));
    const calls = [];
    const g = {
        window: { __agentBridge: { handleCommand: async (c) => { calls.push(c); if (c.tool === 'get_chart_context') return { symbol: 'X', timeframe: '1h', totalBars: 50, bars: bars.slice(50 - c.args.lookback) }; return { ok: true }; } } },
    };
    const b2 = createBt(g);
    const cd = await b2.chartData();
    assert.equal(cd.length, 50); assert.equal(cd.t[0], 1_700_000_000_000); assert.equal(cd.meta.symbol, 'X');
    const fake = { allTrades: [
        { entryT: 1_700_000_000_000 + 3600_000 * 5, exitT: 1_700_000_000_000 + 3600_000 * 9, entry: 100, exit: 103, pnl: 3, r: 1.5 },
        { entryT: 1_600_000_000_000, exitT: 1_600_000_100_000, entry: 100, exit: 99, pnl: -1, r: -1 },
    ] };
    const pr = await b2.plotTrades(fake, { max: 10 });
    assert.equal(pr.drawn, 1); assert.equal(pr.skipped, 1);
    const dl = calls.find((c) => c.tool === 'draw_trendline');
    assert.equal(dl.args.startBarIndex, 105); assert.equal(dl.args.endBarIndex, 109); assert.equal(dl.args.label, '+1.5R');
});

// ---- review round 2 -----------------------------------------------------------

test('held-bar convention: reversal does not double count; exit at open not held; entry at close not held', () => {
    // 5 bars: buy@0 -> long fills open[1]; sell@2 -> reversal at open[3]; short runs to the end (eod at close[4])
    const bars = [flat(100), flat(100), flat(101), flat(102), flat(103)];
    const r = scripted(bars, { 0: ['buy', { lots: 1 }], 2: ['sell', { lots: 1 }] });
    assert.deepEqual(r.allTrades.map((x) => [x.side, x.entryIdx, x.exitIdx, x.bars]), [['long', 1, 3, 2], ['short', 3, 4, 2]]);
    near(r.summary.exposurePct, 80);
    // entry at close of bar 0 is not held on bar 0; exit signal fills at the close of bar 2 -> bar 2 is held
    const r2 = scripted(bars, { 0: ['buy', { lots: 1 }], 2: ['close'] }, { fill: 'close' });
    assert.equal(r2.allTrades[0].bars, 2); near(r2.summary.exposurePct, 40);
    // ctx.position.barsHeld follows the same convention
    const seen = [];
    scripted(bars, { 0: ['buy', { lots: 1 }], 1: ['fn', (c) => seen.push(c.position.barsHeld)], 2: ['fn', (c) => seen.push(c.position.barsHeld)] });
    assert.deepEqual(seen, [1, 2]);
});

test('profit factor with no losing trades is capped at 999; sweep ranks non-finite metrics last', async () => {
    const r = scripted([flat(100), flat(100), flat(105), flat(105)], { 0: ['buy', { lots: 1 }] });
    assert.equal(r.summary.profitFactor, 999);
    const d = mk(randomWalk(600, 2));
    const sw = await bt.sweep({ stop: [false, true] }, (p) => bt.run({ data: d, params: p, lotStep: 0, onBar(ctx, i) { if (i % 5 === 0 && !ctx.position) ctx.buy(p.stop ? { lots: 1, slDist: 1 } : { lots: 1 }); else if (i % 5 === 3) ctx.close(); } }),
        { metric: 'expectancyR', minTrades: 1 });
    assert.equal(sw.rows[0].params.stop, true); // no-stop run has expectancyR null -> NaN -> last
    assert.ok(Number.isNaN(sw.rows[1].expectancyR));
});

test('riskPct with riskIncludesCosts: a costed stop-out loses exactly riskPct (-1R); off -> loses more', () => {
    const bars = [[100, 101, 99, 100], [100, 100.5, 99, 100], [100, 100.5, 97, 98], flat(98)];
    const extra = { contractSize: 100, lotStep: 0, costs: { spread: 0.3, slippage: 0.1, commissionPerLot: 3.5 }, sizing: { mode: 'riskPct', riskPct: 1 } };
    let r = scripted(bars, { 0: ['buy', { slDist: 2 }] }, extra);
    const t = r.allTrades[0];
    assert.equal(t.reason, 'sl');
    near(t.entry, 100.25); near(t.exit, 97.9);
    near(t.lots, 100 / 242, 1e-9);
    near(t.pnl, -100, 1e-9); near(t.r, -1, 1e-9);
    r = scripted(bars, { 0: ['buy', { slDist: 2 }] }, { ...extra, riskIncludesCosts: false });
    assert.ok(r.allTrades[0].pnl < -100.5);
    // short, same property
    const sbars = [[100, 101, 99, 100], [100, 101, 99.5, 100], [100, 103, 99.5, 102], flat(102)];
    r = scripted(sbars, { 0: ['sell', { slDist: 2 }] }, extra);
    near(r.allTrades[0].pnl, -100, 1e-9); near(r.allTrades[0].r, -1, 1e-9);
});

test('priceBasis "mid": SL/TP triggers padded by half spread; entries/exits at ask/bid', () => {
    const ex = { costs: { spread: 1 }, priceBasis: 'mid' };
    // long SL: raw low 98.4 -> bid 97.9 <= 98 -> stopped at 98
    let r = scripted([flat(100), [100, 100.5, 99, 100], [100, 100.5, 98.4, 99], flat(99)], { 0: ['buy', { lots: 1, sl: 98 }] }, ex);
    near(r.allTrades[0].entry, 100.5); assert.equal(r.allTrades[0].reason, 'sl'); near(r.allTrades[0].exit, 98); near(r.allTrades[0].pnl, -2.5);
    // long TP: raw high 103.4 -> bid 102.9 < 103: no hit; 103.6 -> hit at 103
    r = scripted([flat(100), [100, 100.5, 99, 100], [100, 103.4, 99.5, 103], flat(103)], { 0: ['buy', { lots: 1, tp: 103 }] }, ex);
    assert.equal(r.allTrades[0].reason, 'eod');
    r = scripted([flat(100), [100, 100.5, 99, 100], [100, 103.6, 99.5, 103], flat(103)], { 0: ['buy', { lots: 1, tp: 103 }] }, ex);
    assert.equal(r.allTrades[0].reason, 'tp'); near(r.allTrades[0].exit, 103);
    // short: entry at bid (raw-0.5); SL on ask: raw high 101.6 -> 102.1 >= 102
    r = scripted([flat(100), [100, 100.5, 99, 100], [100, 101.6, 99.6, 100], flat(100)], { 0: ['sell', { lots: 1, sl: 102 }] }, ex);
    near(r.allTrades[0].entry, 99.5); assert.equal(r.allTrades[0].reason, 'sl'); near(r.allTrades[0].exit, 102);
    // short TP on ask: raw low 96.4 -> 96.9 <= 97 hit; raw low 96.6 -> 97.1 not
    r = scripted([flat(100), [100, 100.5, 99, 100], [100, 100.5, 96.6, 98], flat(98)], { 0: ['sell', { lots: 1, tp: 97 }] }, ex);
    assert.equal(r.allTrades[0].reason, 'eod');
    r = scripted([flat(100), [100, 100.5, 99, 100], [100, 100.5, 96.4, 98], flat(98)], { 0: ['sell', { lots: 1, tp: 97 }] }, ex);
    assert.equal(r.allTrades[0].reason, 'tp'); near(r.allTrades[0].exit, 97);
    // gaps: long open 96 -> bid 95.5; short open 104 -> ask 104.5
    r = scripted([flat(100), flat(100), [96, 97, 95, 96], flat(96)], { 0: ['buy', { lots: 1, sl: 98 }] }, ex);
    near(r.allTrades[0].exit, 95.5);
    r = scripted([flat(100), flat(100), [104, 105, 103, 104], flat(104)], { 0: ['sell', { lots: 1, sl: 102 }] }, ex);
    near(r.allTrades[0].exit, 104.5);
    near(r.summary.costsPaid.spread, 1);
});

test('priceBasis "bid": long pays the spread on entry, short on exit; triggers on raw (long) / raw+spread (short)', () => {
    const ex = { costs: { spread: 1 }, priceBasis: 'bid' };
    // long entry at ask = 101; raw low 98.4 does NOT hit sl 98 (bid basis); 97.9 does
    let r = scripted([flat(100), [100, 100.5, 99, 100], [100, 100.5, 98.4, 99], flat(99)], { 0: ['buy', { lots: 1, sl: 98 }] }, ex);
    near(r.allTrades[0].entry, 101); assert.equal(r.allTrades[0].reason, 'eod');
    r = scripted([flat(100), [100, 100.5, 99, 100], [100, 100.5, 97.9, 99], flat(99)], { 0: ['buy', { lots: 1, sl: 98 }] }, ex);
    assert.equal(r.allTrades[0].reason, 'sl'); near(r.allTrades[0].exit, 98); near(r.allTrades[0].pnl, -3);
    // long TP on raw high
    r = scripted([flat(100), [100, 100.5, 99, 100], [100, 103, 99.5, 102], flat(102)], { 0: ['buy', { lots: 1, tp: 103 }] }, ex);
    assert.equal(r.allTrades[0].reason, 'tp'); near(r.allTrades[0].exit, 103);
    // short entry at bid = raw; SL on ask: raw high 101 -> 102 >= 102
    r = scripted([flat(100), [100, 100.5, 99, 100], [100, 101, 99.6, 100], flat(100)], { 0: ['sell', { lots: 1, sl: 102 }] }, ex);
    near(r.allTrades[0].entry, 100); assert.equal(r.allTrades[0].reason, 'sl'); near(r.allTrades[0].exit, 102);
    // short TP on ask: raw low 95.9 -> 96.9 <= 97
    r = scripted([flat(100), [100, 100.5, 99, 100], [100, 100.5, 95.9, 98], flat(98)], { 0: ['sell', { lots: 1, tp: 97 }] }, ex);
    assert.equal(r.allTrades[0].reason, 'tp'); near(r.allTrades[0].exit, 97);
    // gaps: long open 96 -> fills 96 (bid); short open 104 -> ask 105
    r = scripted([flat(100), flat(100), [96, 97, 95, 96], flat(96)], { 0: ['buy', { lots: 1, sl: 98 }] }, ex);
    near(r.allTrades[0].exit, 96);
    r = scripted([flat(100), flat(100), [104, 105, 103, 104], flat(104)], { 0: ['sell', { lots: 1, sl: 102 }] }, ex);
    near(r.allTrades[0].exit, 105);
    // spread cost totals one spread per round trip either way
    near(r.summary.costsPaid.spread, 1);
    // signal exits: long exits at bid (raw), short at ask (raw+spread)
    r = scripted([flat(100), flat(100), flat(104), flat(104)], { 0: ['buy', { lots: 1 }], 1: ['close'] }, ex);
    near(r.allTrades[0].entry, 101); near(r.allTrades[0].exit, 104);
    r = scripted([flat(100), flat(100), flat(96), flat(96)], { 0: ['sell', { lots: 1 }], 1: ['close'] }, ex);
    near(r.allTrades[0].entry, 100); near(r.allTrades[0].exit, 97);
    // default comes from data.meta.priceBasis, explicit option wins
    const d = mk([flat(100), flat(100), flat(104), flat(104)]); d.meta.priceBasis = 'bid';
    const run = (extra) => bt.run({ data: d, lotStep: 0, costs: { spread: 1 }, onBar(c, i) { if (i === 0) c.buy({ lots: 1 }); if (i === 1) c.close(); }, ...extra });
    assert.equal(run({}).config.priceBasis, 'bid'); near(run({}).allTrades[0].entry, 101);
    assert.equal(run({ priceBasis: 'mid' }).config.priceBasis, 'mid'); near(run({ priceBasis: 'mid' }).allTrades[0].entry, 100.5);
    assert.throws(() => run({ priceBasis: 'ask' }), /priceBasis/);
});

test('wipeout: position closed with reason wipeout, equity floored at 0, trading halted; leverage warning', () => {
    const r = scripted([flat(100), flat(100), [100, 100, 97, 98], flat(98), flat(98)], { 0: ['buy', { lots: 10 }], 3: ['buy', { lots: 1 }] }, { capital: 1000, contractSize: 100 });
    assert.equal(r.allTrades[0].reason, 'wipeout');
    assert.equal(r.summary.finalEquity, 0);
    assert.ok(r.equitySeries[4] === 0 && r.equitySeries[2] === 0);
    assert.ok(r.warnings.some((w) => /wiped out/.test(w)));
    assert.ok(r.warnings.some((w) => /exceeded 30x leverage/.test(w)));
    assert.ok(r.warnings.some((w) => /halted=1/.test(w)));
    const r2 = scripted([flat(100), flat(100), flat(100)], { 0: ['buy', { lots: 10 }] }, { capital: 1000, contractSize: 100, maxLeverageWarn: 1000 });
    assert.ok(!r2.warnings.some((w) => /leverage/.test(w)));
});

test('orders placed on the final bar are dropped with a warning (both fill modes)', () => {
    for (const fill of ['nextOpen', 'close']) {
        const r = scripted([flat(100), flat(100), flat(100)], { 2: ['buy', { lots: 1 }] }, { fill });
        assert.equal(r.allTrades.length, 0, fill);
        assert.ok(r.warnings.some((w) => /final bar were dropped/.test(w)), fill);
    }
});

test('fill:"close" combined with sameBar on the bar after entry', () => {
    const bars = [[100, 101, 99, 100], [100, 104, 97, 100], flat(100)];
    let r = scripted(bars, { 0: ['buy', { lots: 1, sl: 98, tp: 103 }] }, { fill: 'close' });
    assert.equal(r.allTrades[0].entryIdx, 0); assert.equal(r.allTrades[0].reason, 'sl'); assert.equal(r.allTrades[0].exit, 98); assert.equal(r.allTrades[0].bars, 1);
    r = scripted(bars, { 0: ['buy', { lots: 1, sl: 98, tp: 103 }] }, { fill: 'close', sameBar: 'tp' });
    assert.equal(r.allTrades[0].reason, 'tp'); assert.equal(r.allTrades[0].exit, 103);
});

test('sharpe / sortino / cagr / maxDDDuration / byYear on a hand-computed equity path', () => {
    // 1 lot long entered at close[0]=100; 30-day bars; equity = 10000 + (close-100)
    const closes = [100, 110, 99, 99, 120];
    const bars = closes.map((c) => flat(c));
    const d = mk(bars, { step: 30 * D });
    const run = (extra) => bt.run({ data: d, lotStep: 0, fill: 'close', onBar(c, i) { if (i === 0) c.buy({ lots: 1 }); }, ...extra });
    const r = run({});
    const eqs = [10000, 10010, 9999, 9999, 10020];
    for (let i = 0; i < 5; i++) assert.equal(r.equitySeries[i], eqs[i]);
    const rets = [0, 10 / 10000, 9999 / 10010 - 1, 0, 10020 / 9999 - 1];
    const m = rets.reduce((a, b) => a + b) / 5;
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / 4);
    const dd = Math.sqrt(rets.reduce((a, b) => a + (b < 0 ? b * b : 0), 0) / 5);
    near(r.summary.sharpe, m / sd * Math.sqrt(252), 1e-3);
    near(r.summary.sortino, m / dd * Math.sqrt(252), 1e-3);
    near(run({ periodsPerYear: 365 }).summary.sharpe, m / sd * Math.sqrt(365), 1e-3);
    const years = 120 * D / (365.25 * D);
    near(r.summary.cagr, (Math.pow(10020 / 10000, 1 / years) - 1) * 100, 0.01);
    near(r.summary.maxDrawdown, 11); near(r.summary.maxDDDurationDays, 90);
    assert.equal(r.byYear.length, 1);
    assert.deepEqual(r.byYear[0], { year: 1970, net: 20, pct: 0.2, trades: 1, winRate: 100, maxDDPct: 0.11 });
});

test('strategy reading ctx.data with bars after i poisoned gives the same trades as on clean data; a cheating strategy does not', () => {
    const d = mk(randomWalk(1500, 13));
    const mkStrat = (data, cheat) => ({
        data, lotStep: 0, sizing: { mode: 'riskPct', riskPct: 1 },
        onBar(ctx, i) {
            const D2 = ctx.data;
            if (i < 25) return;
            let hi = -Infinity, rng = 0;
            for (let k = i - 20; k < i; k++) hi = Math.max(hi, D2.h[k]);
            for (let k = i - 13; k <= i; k++) rng += D2.h[k] - D2.l[k];
            const ref = cheat ? D2.c[i + 1] : D2.c[i];
            if (!ctx.position && ref > hi) ctx.buy({ slDist: Math.max(0.1, 2 * rng / 14) });
            else if (ctx.position && ref < D2.l[i - 1]) ctx.close();
        },
    });
    const clean = bt.run(mkStrat(d, false));
    assert.ok(clean.allTrades.length > 5);
    const poisonRun = (cheat) => {
        const pd = { ...d, o: Float64Array.from(d.o), h: Float64Array.from(d.h), l: Float64Array.from(d.l), c: Float64Array.from(d.c) };
        const s = mkStrat(pd, cheat); const inner = s.onBar;
        s.onBar = (ctx, i) => {
            const hi = Math.min(pd.c.length, i + 80);
            for (let k = i + 1; k < hi; k++) { pd.o[k] = pd.h[k] = pd.l[k] = pd.c[k] = NaN; }
            inner(ctx, i);
            for (let k = i + 1; k < hi; k++) { pd.o[k] = d.o[k]; pd.h[k] = d.h[k]; pd.l[k] = d.l[k]; pd.c[k] = d.c[k]; }
        };
        return bt.run(s);
    };
    assert.deepEqual(poisonRun(false).allTrades, clean.allTrades);
    assert.notDeepEqual(poisonRun(true).allTrades, bt.run(mkStrat(d, true)).allTrades); // control: the poison does detect look-ahead
});

test('slice rejects to < from', () => {
    const d = mk(randomWalk(50));
    assert.throws(() => bt.slice(d, 10 * H, 5 * H), /before fromMs/);
});
