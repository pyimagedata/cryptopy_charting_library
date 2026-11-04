import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
    nyWallToUtc, nyOffsetAtUtc, makeTzConverter, validateManifest, aggregateSlice,
    parseTimeInput, buildBacktestSlice, BACKTEST_DATA_DIR,
} from '../src/backtest-data.js';

const H = 3_600_000, D = 86_400_000;
const utc = (s) => Date.parse(s.endsWith('Z') ? s : `${s}Z`);

// ---- tz ------------------------------------------------------------------

test('nyOffsetAtUtc agrees with Intl America/New_York (2004-2026, ~55k samples)', () => {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    let checked = 0;
    for (let t = utc('2004-01-01T00:00:00'); t < utc('2026-12-31T00:00:00'); t += 3 * H + 1_800_000) {
        const p = {};
        for (const x of fmt.formatToParts(new Date(t))) p[x.type] = Number(x.value);
        const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
        assert.equal(nyOffsetAtUtc(t), wall - t, `offset at ${new Date(t).toISOString()}`);
        checked++;
    }
    assert.ok(checked > 50000);
});

test('ny+7 conversion: summer UTC+3, winter UTC+2', () => {
    const c = makeTzConverter('ny+7');
    assert.equal(c(utc('2024-07-10T12:00:00')), utc('2024-07-10T09:00:00'));
    assert.equal(c(utc('2024-01-10T12:00:00')), utc('2024-01-10T10:00:00'));
    assert.equal(c(utc('2008-07-10T12:00:00')), utc('2008-07-10T09:00:00'));
    assert.equal(nyWallToUtc(utc('2024-07-10T12:00:00')), utc('2024-07-10T16:00:00'));
});

test('ny+7 DST edges (US 2024: spring 03-10, fall 11-03; 2006 uses old rules: 04-02 / 10-29)', () => {
    const c = makeTzConverter('ny+7');
    // NY wall = local - 7h. Spring 2024: 02:00 NY -> 03:00 NY on Sun 03-10 (local 09:00 -> 10:00).
    assert.equal(c(utc('2024-03-10T08:59:00')), utc('2024-03-10T06:59:00'));  // 01:59 EST
    // gap (02:30 NY does not exist): pre-transition offset (EST) => 07:30Z
    assert.equal(c(utc('2024-03-10T09:30:00')), utc('2024-03-10T07:30:00'));
    assert.equal(c(utc('2024-03-10T10:00:00')), utc('2024-03-10T07:00:00'));  // 03:00 EDT
    // Fall 2024: wall 01:00-02:00 NY repeats (local 08:00-09:00). First occurrence (EDT) wins.
    assert.equal(c(utc('2024-11-03T08:30:00')), utc('2024-11-03T05:30:00'));
    assert.equal(c(utc('2024-11-03T09:00:00')), utc('2024-11-03T07:00:00'));  // 02:00 EST
    // 2006 (pre-2007 rules): DST began Sun April 2, ended Sun Oct 29.
    assert.equal(c(utc('2006-03-20T12:00:00')), utc('2006-03-20T10:00:00'));  // still EST
    assert.equal(c(utc('2006-04-03T12:00:00')), utc('2006-04-03T09:00:00'));  // EDT
    assert.equal(c(utc('2006-10-30T12:00:00')), utc('2006-10-30T10:00:00'));  // EST again
});

test('IANA converter: Europe/Athens DST edges are deterministic (first occurrence / pre-gap offset)', () => {
    const c = makeTzConverter('Europe/Athens');
    assert.equal(c(utc('2024-01-15T12:00:00')), utc('2024-01-15T10:00:00'));
    assert.equal(c(utc('2024-07-15T12:00:00')), utc('2024-07-15T09:00:00'));
    // spring 2024-03-31: 03:00 -> 04:00; 03:30 does not exist -> pre-transition (UTC+2) => 01:30Z
    assert.equal(c(utc('2024-03-31T03:30:00')), utc('2024-03-31T01:30:00'));
    assert.equal(c(utc('2024-03-31T04:00:00')), utc('2024-03-31T01:00:00'));
    // fall 2024-10-27: 04:00 -> 03:00; 03:30 occurs twice -> first (UTC+3) => 00:30Z
    assert.equal(c(utc('2024-10-27T03:30:00')), utc('2024-10-27T00:30:00'));
    assert.equal(c(utc('2024-10-27T04:00:00')), utc('2024-10-27T02:00:00'));
    // IANA machinery and the ny+7 fast path agree (America/New_York shifted by 7h)
    const ny = makeTzConverter('America/New_York'), ny7 = makeTzConverter('ny+7');
    for (const s of ['2024-03-10T09:30:00', '2024-11-03T08:30:00', '2015-06-01T10:00:00', '2012-12-12T10:00:00']) {
        assert.equal(ny(utc(s) - 7 * H), ny7(utc(s)), s);
    }
});

test('tz segments switch on the local wall-time bound; invalid specs rejected', () => {
    const c = makeTzConverter([{ tz: 'ny+7', until: '2020-03-29T00:00:00' }, { tz: 'Europe/Athens' }]);
    // 2020-03-16 (US DST on, EU not yet): ny+7 => UTC+3
    assert.equal(c(utc('2020-03-16T12:00:00')), utc('2020-03-16T09:00:00'));
    // 2020-10-28 (US DST still on, EU already off): Europe/Athens => UTC+2 (ny+7 would give +3)
    assert.equal(c(utc('2020-10-28T12:00:00')), utc('2020-10-28T10:00:00'));
    assert.throws(() => makeTzConverter('Mars/Olympus'), /Unsupported tz/);
    assert.throws(() => makeTzConverter([{ tz: 'UTC' }, { tz: 'UTC' }]), /needs "until"/);
    assert.throws(() => makeTzConverter([{ tz: 'UTC', until: '2020-01-01T00:00:00' }, { tz: 'UTC', until: '2019-01-01T00:00:00' }, { tz: 'UTC' }]), /ascending/);
});

// ---- manifest -------------------------------------------------------------

test('manifest validation', () => {
    const ok = { name: 'XAU_1m', symbol: 'XAUUSD', source: '/x/y.csv', tz: 'ny+7', timeframe: '1m' };
    const out = validateManifest([ok]);
    assert.equal(out[0].source, '/x/y.csv');
    assert.equal(out[0].timeframe, '1m');
    assert.throws(() => validateManifest({}), /array/);
    assert.throws(() => validateManifest([{ ...ok, name: '../etc/passwd' }]), /Invalid dataset name/);
    assert.throws(() => validateManifest([{ ...ok, name: 'a/b' }]), /Invalid dataset name/);
    assert.throws(() => validateManifest([ok, ok]), /duplicate/);
    assert.throws(() => validateManifest([{ ...ok, symbol: '' }]), /symbol/);
    assert.throws(() => validateManifest([{ ...ok, source: undefined }]), /source/);
    assert.throws(() => validateManifest([{ ...ok, tz: 'Nope/Zone' }]), /Unsupported tz/);
    assert.throws(() => validateManifest([{ ...ok, tz: undefined }]), /tz is required/);
    assert.throws(() => validateManifest([{ ...ok, timeframe: '7m' }]), /timeframe/);
    assert.equal(validateManifest([{ ...ok, timeframe: undefined }])[0].timeframe, '1m');
});

// ---- time input -----------------------------------------------------------

test('parseTimeInput', () => {
    assert.equal(parseTimeInput('2020-01-01', 'from'), utc('2020-01-01T00:00:00'));
    assert.equal(parseTimeInput('2020-01-01T08:30:00', 'from'), utc('2020-01-01T08:30:00'));
    assert.equal(parseTimeInput('2020-01-01 08:30', 'from'), utc('2020-01-01T08:30:00'));
    assert.equal(parseTimeInput('2020-01-01T08:30:00+02:00', 'from'), utc('2020-01-01T06:30:00'));
    assert.equal(parseTimeInput(1577836800000, 'from'), 1577836800000);
    assert.equal(parseTimeInput('1577836800000', 'from'), 1577836800000);
    assert.equal(parseTimeInput(undefined, 'from'), null);
    assert.throws(() => parseTimeInput('garbage', 'to'), /not a valid/);
});

// ---- aggregation / range / cap ---------------------------------------------

function synthBase(startIso, count, stepMs = 60_000, skip = () => false) {
    const t = [], o = [], h = [], l = [], c = [], v = [];
    let ts = utc(startIso);
    for (let i = 0; i < count; i++, ts += stepMs) {
        if (skip(i)) continue;
        const px = 100 + i;
        t.push(ts); o.push(px); h.push(px + 2 + (i % 3)); l.push(px - 1 - (i % 2)); c.push(px + 0.5); v.push(i + 1);
    }
    const F = (a) => Float64Array.from(a);
    return { t: F(t), o: F(o), h: F(h), l: F(l), c: F(c), v: F(v) };
}

function bruteAgg(base, tfMs, from, to) {
    const m = new Map();
    for (let i = 0; i < base.t.length; i++) {
        const b = base.t[i] - (base.t[i] % tfMs);
        if (!m.has(b)) m.set(b, { t: b, o: base.o[i], h: base.h[i], l: base.l[i], c: base.c[i], v: base.v[i] });
        else {
            const x = m.get(b);
            x.h = Math.max(x.h, base.h[i]); x.l = Math.min(x.l, base.l[i]); x.c = base.c[i]; x.v += base.v[i];
        }
    }
    return [...m.values()].filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
}

test('aggregation matches brute force (5m/15m/1h/4h/1d) incl. gaps', () => {
    const base = synthBase('2024-03-01T00:00:00', 3 * 24 * 60, 60_000, (i) => i % 7 === 3 || (i > 500 && i < 700));
    for (const [tf, ms] of [['5m', 5 * 60_000], ['15m', 15 * 60_000], ['1h', H], ['4h', 4 * H], ['1d', D]]) {
        const r = aggregateSlice(base, { timeframe: tf, from: null, to: null });
        const exp = bruteAgg(base, ms, -Infinity, Infinity);
        assert.equal(r.count, exp.length, tf);
        for (let k = 0; k < exp.length; k++) {
            assert.equal(r.views.t[k], exp[k].t); assert.equal(r.views.o[k], exp[k].o);
            assert.equal(r.views.h[k], exp[k].h); assert.equal(r.views.l[k], exp[k].l);
            assert.equal(r.views.c[k], exp[k].c); assert.equal(r.views.v[k], exp[k].v);
        }
    }
});

test('range filter: [from, to) on bar open; edge buckets are whole, never truncated', () => {
    const base = synthBase('2024-03-01T00:00:00', 2 * 24 * 60);
    // from 00:30 => hour bar 00:00 is dropped (starts before from), first is 01:00
    const r = aggregateSlice(base, { timeframe: '1h', from: utc('2024-03-01T00:30:00'), to: utc('2024-03-01T05:00:00') });
    assert.equal(r.views.t[0], utc('2024-03-01T01:00:00'));
    assert.equal(r.views.t[r.count - 1], utc('2024-03-01T04:00:00'));   // 'to' exclusive
    assert.equal(r.count, 4);
    // 'to' mid-bucket: bucket 04:00 starts before 'to' => included whole
    const r2 = aggregateSlice(base, { timeframe: '1h', from: utc('2024-03-01T01:00:00'), to: utc('2024-03-01T04:30:00') });
    assert.equal(r2.views.t[r2.count - 1], utc('2024-03-01T04:00:00'));
    const exp = bruteAgg(base, H, utc('2024-03-01T04:00:00'), utc('2024-03-01T05:00:00'))[0];
    assert.equal(r2.views.v[r2.count - 1], exp.v);
    // 1m passthrough respects range exactly
    const r3 = aggregateSlice(base, { timeframe: '1m', from: utc('2024-03-01T00:10:00'), to: utc('2024-03-01T00:20:00') });
    assert.equal(r3.count, 10);
    assert.equal(r3.views.t[0], utc('2024-03-01T00:10:00'));
    // empty range
    assert.equal(aggregateSlice(base, { timeframe: '1h', from: utc('2030-01-01T00:00:00'), to: utc('2030-02-01T00:00:00') }).count, 0);
    assert.throws(() => aggregateSlice(base, { timeframe: '1h', from: 5, to: 5 }), /after/);
});

test('1d_ny buckets start 17:00 New York (21:00Z summer, 22:00Z winter)', () => {
    const base = synthBase('2024-07-01T00:00:00', 3 * 24 * 60);
    const r = aggregateSlice(base, { timeframe: '1d_ny', from: null, to: null });
    assert.equal(r.views.t[1], utc('2024-07-01T21:00:00'));
    assert.equal(r.views.t[2], utc('2024-07-02T21:00:00'));
    const w = synthBase('2024-01-08T00:00:00', 3 * 24 * 60);
    const rw = aggregateSlice(w, { timeframe: '1d_ny', from: null, to: null });
    assert.equal(rw.views.t[1], utc('2024-01-08T22:00:00'));
    // a bar at 20:59Z (summer) belongs to the previous session, 21:00Z to the new one
    const two = {
        t: Float64Array.from([utc('2024-07-01T20:59:00'), utc('2024-07-01T21:00:00')]),
        o: Float64Array.from([1, 2]), h: Float64Array.from([1, 2]), l: Float64Array.from([1, 2]),
        c: Float64Array.from([1, 2]), v: Float64Array.from([1, 1]),
    };
    assert.equal(aggregateSlice(two, { timeframe: '1d_ny', from: null, to: null }).count, 2);
});

test('bar cap error is clear and checked before allocation', () => {
    const base = synthBase('2024-03-01T00:00:00', 10_000);
    assert.throws(
        () => aggregateSlice(base, { timeframe: '1m', from: null, to: null, maxBars: 5000 }),
        /10,000 1m bars \(> max 5,000 per load\).*larger timeframe.*narrower from\/to/s
    );
    assert.equal(aggregateSlice(base, { timeframe: '1h', from: null, to: null, maxBars: 5000 }).count, 167);
    assert.throws(() => aggregateSlice(base, { timeframe: '2m' }), /Unsupported timeframe/);
});

// ---- real data (skipped when the cache has not been built) -----------------

const cacheMeta = path.join(BACKTEST_DATA_DIR, 'cache', 'XAU_1m.meta.json');
test('XAU_1m cache: daily break ends 22:xx UTC in US summer, 23:xx UTC in US winter', { skip: !existsSync(cacheMeta) }, async () => {
    for (const [from, to, hourUtc] of [
        ['2024-07-01', '2024-07-15', 22], ['2024-01-08', '2024-01-22', 23],
        ['2015-07-06', '2015-07-20', 22], ['2015-01-05', '2015-01-19', 23],
        ['2008-07-01', '2008-08-01', 22], ['2008-01-02', '2008-02-01', 23],
        // the weeks where the US and EU DST dates differ (clock convention switch in 2020)
        ['2024-03-11', '2024-03-15', 22], ['2024-10-28', '2024-11-01', 22], ['2019-03-11', '2019-03-15', 22],
    ]) {
        const s = await buildBacktestSlice({ dataset: 'XAU_1m', timeframe: '1m', from, to });
        const t = new Float64Array(s.buffer.buffer, 0, s.meta.count);
        let hits = 0, breaks = 0;
        for (let i = 1; i < t.length; i++) {
            const dt = t[i] - t[i - 1];
            const dow = new Date(t[i - 1]).getUTCDay();
            if (dt >= 50 * 60_000 && dt <= 3 * H && dow >= 1 && dow <= 4 && new Date(t[i]).getUTCHours() >= 21) {
                breaks++;
                if (new Date(t[i]).getUTCHours() === hourUtc) hits++;
            }
        }
        assert.ok(breaks >= 3, `${from}: found ${breaks} breaks`);
        assert.ok(hits / breaks >= 0.9, `${from}: ${hits}/${breaks} breaks end at ${hourUtc}:xx UTC`);
    }
});

test('validateManifest: optional priceBasis must be mid|bid', () => {
    const base = { name: 'X_1m', symbol: 'X', source: 'x.csv', tz: 'UTC' };
    assert.equal(validateManifest([{ ...base, priceBasis: 'bid' }])[0].priceBasis, 'bid');
    assert.equal(validateManifest([base])[0].priceBasis, undefined);
    assert.throws(() => validateManifest([{ ...base, priceBasis: 'ask' }]), /priceBasis/);
});
