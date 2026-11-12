// Standalone tests for src/indicators/time-periods.ts (zone conversion, sessions, period bucketing,
// previous-level causality, ADR). The package has no test runner and tsc only includes src/, so this
// lives in scripts/. Run from packages/charts:
//   npx esbuild scripts/time-periods.test.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs && node <tmp>.mjs
// (or `npx tsx scripts/time-periods.test.ts` when tsx is available)

import assert from 'node:assert/strict';
import {
    ZoneClock, getZoneClock, parseHHMM, formatHHMM, inWindow, updateSessionInstances, SessionInstance,
    periodKey, tradingDay, PeriodSeries, previousLevelSets, computeAdr, timeframeSeconds,
    barIntervalSeconds, colorWithAlpha, formatLevelPrice, OhlcBar, barTimeMs, ScanGuard, detectDayStart,
} from '../src/indicators/time-periods';

let passed = 0;
function test(name: string, fn: () => void): void {
    try {
        fn();
        passed++;
        console.log('ok   - ' + name);
    } catch (e) {
        console.log('FAIL - ' + name);
        console.log(e);
        process.exitCode = 1;
    }
}

const Z = (iso: string): number => Date.parse(iso);
const HOUR = 3_600_000;

function bar(timeMs: number, o = 100, h = 101, l = 99, c = 100): OhlcBar {
    return { time: timeMs / 1000, open: o, high: h, low: l, close: c };
}

/** Hourly bars from start (ISO) for n bars; high/low from fn(i, timeMs) */
function hourly(startIso: string, n: number, fn?: (i: number, t: number) => Partial<OhlcBar>): OhlcBar[] {
    const t0 = Z(startIso);
    const out: OhlcBar[] = [];
    for (let i = 0; i < n; i++) {
        const t = t0 + i * HOUR;
        out.push({ ...bar(t), ...(fn ? fn(i, t) : {}) });
    }
    return out;
}

function hhmm(c: ZoneClock, iso: string): string {
    return formatHHMM(c.local(Z(iso)).minute);
}

// --- helpers ---------------------------------------------------------------

test('parseHHMM / formatHHMM / inWindow', () => {
    assert.equal(parseHHMM('08:30'), 510);
    assert.equal(parseHHMM('8:30'), 510);
    assert.equal(parseHHMM('0830'), 510);
    assert.equal(parseHHMM('24:00'), 1440);
    assert.equal(parseHHMM('25:00'), null);
    assert.equal(parseHHMM('12:60'), null);
    assert.equal(parseHHMM('ab'), null);
    assert.equal(formatHHMM(1440), '00:00');
    assert.ok(inWindow(8 * 60, 8 * 60, 17 * 60));
    assert.ok(!inWindow(17 * 60, 8 * 60, 17 * 60));
    // crossing midnight 22:00-02:00
    assert.ok(inWindow(23 * 60, 22 * 60, 2 * 60));
    assert.ok(inWindow(60, 22 * 60, 2 * 60));
    assert.ok(!inWindow(12 * 60, 22 * 60, 2 * 60));
    // 20:00-00:00
    assert.ok(inWindow(23 * 60 + 59, 20 * 60, 0));
    assert.ok(!inWindow(0, 20 * 60, 0));
    assert.ok(!inWindow(5, 600, 600));
});

test('timeframeSeconds / barIntervalSeconds', () => {
    assert.equal(timeframeSeconds('1m'), 60);
    assert.equal(timeframeSeconds('15m'), 900);
    assert.equal(timeframeSeconds('4h'), 14400);
    assert.equal(timeframeSeconds('12h'), 43200);
    assert.equal(timeframeSeconds('240'), 14400);
    assert.equal(timeframeSeconds('D'), 86400);
    assert.equal(timeframeSeconds('1D'), 86400);
    assert.equal(timeframeSeconds('W'), 604800);
    assert.equal(timeframeSeconds('M'), 28 * 86400);
    assert.equal(timeframeSeconds('3M'), null);
    assert.equal(timeframeSeconds('1T'), null);
    assert.equal(timeframeSeconds(''), null);
    assert.equal(barIntervalSeconds(hourly('2026-06-01T00:00:00Z', 10)), 3600);
    assert.equal(barIntervalSeconds([]), 0);
    assert.equal(barTimeMs(1_700_000_000), 1_700_000_000_000);
    assert.equal(barTimeMs(1_700_000_000_000), 1_700_000_000_000);
});

test('colorWithAlpha / formatLevelPrice', () => {
    assert.equal(colorWithAlpha('#ff0000', 0.5), 'rgba(255, 0, 0, 0.5)');
    assert.equal(colorWithAlpha('#f00', 1), 'rgba(255, 0, 0, 1)');
    assert.equal(colorWithAlpha('rgba(10, 20, 30, 0.5)', 0.5), 'rgba(10, 20, 30, 0.25)');
    assert.equal(formatLevelPrice(67250.5), '67250.5');
    assert.equal(formatLevelPrice(67250), '67250');
    assert.equal(formatLevelPrice(1.23456789, 4), '1.2346');
});

// --- zone conversion across DST -------------------------------------------

test('London local time across the 2026-03-29 DST start (01:00 UTC)', () => {
    const c = getZoneClock('Europe/London');
    assert.equal(hhmm(c, '2026-03-28T12:00:00Z'), '12:00'); // GMT
    assert.equal(hhmm(c, '2026-03-29T00:59:00Z'), '00:59'); // still GMT
    assert.equal(hhmm(c, '2026-03-29T01:00:00Z'), '02:00'); // BST starts
    assert.equal(hhmm(c, '2026-03-30T12:00:00Z'), '13:00'); // BST
    // autumn: 2026-10-25 01:00 UTC back to GMT
    assert.equal(hhmm(c, '2026-10-25T00:30:00Z'), '01:30');
    assert.equal(hhmm(c, '2026-10-25T01:00:00Z'), '01:00');
    // local date
    assert.equal(c.local(Z('2026-03-29T23:30:00Z')).day, Math.floor(Z('2026-03-30T00:00:00Z') / 86400000));
});

test('New York local time across DST start (2026-03-08) and end (2026-11-01)', () => {
    const c = getZoneClock('America/New_York');
    assert.equal(hhmm(c, '2026-03-07T12:00:00Z'), '07:00'); // EST
    assert.equal(hhmm(c, '2026-03-08T06:59:00Z'), '01:59');
    assert.equal(hhmm(c, '2026-03-08T07:00:00Z'), '03:00'); // EDT
    assert.equal(hhmm(c, '2026-03-09T12:00:00Z'), '08:00');
    assert.equal(hhmm(c, '2026-11-01T05:30:00Z'), '01:30'); // EDT
    assert.equal(hhmm(c, '2026-11-01T06:30:00Z'), '01:30'); // EST again (repeated hour)
    assert.equal(hhmm(c, '2026-11-02T12:00:00Z'), '07:00');
});

test('Sydney (southern hemisphere DST) and Tokyo (no DST)', () => {
    const s = getZoneClock('Australia/Sydney');
    assert.equal(hhmm(s, '2026-01-15T00:00:00Z'), '11:00'); // AEDT +11
    assert.equal(hhmm(s, '2026-07-15T00:00:00Z'), '10:00'); // AEST +10
    const t = getZoneClock('Asia/Tokyo');
    assert.equal(hhmm(t, '2026-01-15T00:00:00Z'), '09:00');
    assert.equal(hhmm(t, '2026-07-15T00:00:00Z'), '09:00');
});

// --- sessions -----------------------------------------------------------------

function runSessions(bars: OhlcBar[], zone: string, s: string, e: string): SessionInstance[] {
    const inst: SessionInstance[] = [];
    updateSessionInstances(bars, getZoneClock(zone), parseHHMM(s)!, parseHHMM(e)!, inst, 0);
    return inst;
}

test('London 08:00-17:00 session starts 07:00Z in summer, 08:00Z in winter', () => {
    // Fri 2026-03-27 .. Tue 2026-03-31 hourly
    const bars = hourly('2026-03-27T00:00:00Z', 24 * 5);
    const inst = runSessions(bars, 'Europe/London', '08:00', '17:00');
    assert.equal(inst.length, 5);
    const startHour = (i: SessionInstance) => new Date(bars[i.first].time * 1000).getUTCHours();
    const endHour = (i: SessionInstance) => new Date(bars[i.last].time * 1000).getUTCHours();
    assert.equal(startHour(inst[0]), 8); // Mar 27 GMT
    assert.equal(endHour(inst[0]), 16);
    assert.equal(startHour(inst[1]), 8); // Mar 28 GMT
    assert.equal(startHour(inst[2]), 7); // Mar 29 BST (DST day itself)
    assert.equal(endHour(inst[2]), 15);
    assert.equal(startHour(inst[3]), 7);
});

test('session box high/low/open/close come from window bars only', () => {
    const bars = hourly('2026-06-01T00:00:00Z', 24, (i) => ({
        open: 100 + i, close: 100 + i, high: i === 9 ? 500 : 100 + i + 1, low: i === 20 ? 1 : 100 + i - 1,
    }));
    // Tokyo 09:00-18:00 local = 00:00-09:00Z -> bars 0..8
    const inst = runSessions(bars, 'Asia/Tokyo', '09:00', '18:00');
    assert.equal(inst.length, 1);
    assert.equal(inst[0].first, 0);
    assert.equal(inst[0].last, 8);
    assert.equal(inst[0].open, 100);
    assert.equal(inst[0].close, 108);
    assert.equal(inst[0].high, 109); // bar 9 (spike 500) is outside the window
    assert.equal(inst[0].low, 99);
});

test('session crossing midnight (NY 20:00-00:00 and 22:00-02:00) groups into one instance', () => {
    // Mon 2026-06-01 00:00Z .. Thu; NY is EDT (UTC-4) -> 20:00 NY = 00:00Z next day
    const bars = hourly('2026-06-01T00:00:00Z', 24 * 3);
    const asian = runSessions(bars, 'America/New_York', '20:00', '00:00');
    // window 00:00Z-04:00Z each day (20:00-24:00 NY): bars 0-3 (Jun1 00-03Z, local Mon May 31 20-23), 24-27, 48-51
    assert.equal(asian.length, 3);
    assert.deepEqual(asian.map(i => [i.first, i.last]), [[0, 3], [24, 27], [48, 51]]);

    // custom 22:00-02:00 NY = 02:00Z-06:00Z; a session spans two local dates but is ONE instance
    const cross = runSessions(bars, 'America/New_York', '22:00', '02:00');
    assert.equal(cross.length, 3);
    assert.deepEqual(cross.map(i => [i.first, i.last]), [[2, 5], [26, 29], [50, 53]]);
});

test('crossing session split by local midnight stays one instance (Tokyo 22:00-02:00)', () => {
    // Tokyo = UTC+9: 22:00-02:00 JST = 13:00Z-17:00Z
    const bars = hourly('2026-06-01T00:00:00Z', 48);
    const inst = runSessions(bars, 'Asia/Tokyo', '22:00', '02:00');
    // local midnight JST is 15:00Z: bars 13,14 (before), 15,16 (after) form one instance
    assert.deepEqual(inst.map(i => [i.first, i.last]), [[13, 16], [37, 40]]);
});

test('incremental update equals full scan (tick on last bar, appended bars)', () => {
    const all = hourly('2026-03-25T00:00:00Z', 24 * 8, (i) => ({ high: 100 + ((i * 7) % 13), low: 90 - ((i * 5) % 11) }));
    const full: SessionInstance[] = [];
    updateSessionInstances(all, getZoneClock('Europe/London'), 480, 1020, full, 0);

    const inc: SessionInstance[] = [];
    let scanned = 0;
    for (let n = 30; n <= all.length; n += 7) {
        const slice = all.slice(0, n);
        scanned = updateSessionInstances(slice, getZoneClock('Europe/London'), 480, 1020, inc, scanned);
        // tick: re-run with the same bars, last bar high raised -> must reflect after rerun
        const fresh: SessionInstance[] = [];
        updateSessionInstances(slice, getZoneClock('Europe/London'), 480, 1020, fresh, 0);
        assert.deepEqual(inc, fresh, 'n=' + n);
    }
    scanned = updateSessionInstances(all, getZoneClock('Europe/London'), 480, 1020, inc, scanned);
    assert.deepEqual(inc, full);

    // live tick on the last bar
    const ticked = all.map(b => ({ ...b }));
    ticked[ticked.length - 1].high = 9999;
    const tickInc: SessionInstance[] = [];
    let sc = updateSessionInstances(all, getZoneClock('Asia/Tokyo'), 0, 1440 - 1, tickInc, 0);
    sc = updateSessionInstances(ticked, getZoneClock('Asia/Tokyo'), 0, 1440 - 1, tickInc, sc);
    assert.equal(tickInc[tickInc.length - 1].high, 9999);
    const tickFresh: SessionInstance[] = [];
    updateSessionInstances(ticked, getZoneClock('Asia/Tokyo'), 0, 1439, tickFresh, 0);
    assert.deepEqual(tickInc, tickFresh);
});

test('weekend gap produces no session box', () => {
    // Fri 2026-06-05 and Mon 2026-06-08 only
    const bars = [...hourly('2026-06-05T00:00:00Z', 24), ...hourly('2026-06-08T00:00:00Z', 24)];
    const inst = runSessions(bars, 'Europe/London', '08:00', '17:00');
    assert.equal(inst.length, 2);
});

// --- day / week / month bucketing ----------------------------------------------

test('UTC convention: day, week (Monday start), month keys', () => {
    const k = (iso: string, kind: 'day' | 'week' | 'month') => periodKey(Z(iso), kind, 'utc');
    assert.equal(k('2026-06-01T00:00:00Z', 'day'), k('2026-06-01T23:59:59Z', 'day'));
    assert.notEqual(k('2026-06-01T23:59:59Z', 'day'), k('2026-06-02T00:00:00Z', 'day'));
    // 2026-06-01 is a Monday
    assert.equal(new Date('2026-06-01T00:00:00Z').getUTCDay(), 1);
    assert.equal(k('2026-06-01T00:00:00Z', 'week'), k('2026-06-07T23:59:59Z', 'week')); // Mon..Sun
    assert.notEqual(k('2026-05-31T23:59:59Z', 'week'), k('2026-06-01T00:00:00Z', 'week'));
    assert.notEqual(k('2026-06-07T23:59:59Z', 'week'), k('2026-06-08T00:00:00Z', 'week'));
    assert.equal(k('2026-06-01T00:00:00Z', 'month'), k('2026-06-30T23:59:59Z', 'month'));
    assert.notEqual(k('2026-06-30T23:59:59Z', 'month'), k('2026-07-01T00:00:00Z', 'month'));
    assert.equal(k('2026-12-31T23:59:59Z', 'month') + 1, k('2027-01-01T00:00:00Z', 'month'));
    // leap day
    assert.notEqual(k('2028-02-29T12:00:00Z', 'day'), k('2028-03-01T12:00:00Z', 'day'));
    assert.equal(k('2028-02-29T12:00:00Z', 'month') + 1, k('2028-03-01T12:00:00Z', 'month'));
});

test('NY 17:00 convention: day boundary at 17:00 local, DST aware', () => {
    const d = (iso: string) => periodKey(Z(iso), 'day', 'ny17');
    // winter: 17:00 EST = 22:00Z
    assert.equal(d('2026-01-14T21:59:00Z'), d('2026-01-14T10:00:00Z'));
    assert.equal(d('2026-01-14T22:00:00Z'), d('2026-01-14T21:59:00Z') + 1);
    // summer: 17:00 EDT = 21:00Z
    assert.equal(d('2026-06-10T20:59:00Z'), d('2026-06-10T10:00:00Z'));
    assert.equal(d('2026-06-10T21:00:00Z'), d('2026-06-10T20:59:00Z') + 1);
    // trading day label of Sun 17:00 NY is Monday
    assert.equal(tradingDay(Z('2026-06-07T21:00:00Z'), 'ny17'), tradingDay(Z('2026-06-08T12:00:00Z'), 'ny17'));
});

test('NY 17:00 convention: week starts Sunday 17:00 NY, month follows the shifted day', () => {
    const w = (iso: string) => periodKey(Z(iso), 'week', 'ny17');
    // winter: Sun 2026-03-01 17:00 EST = 22:00Z
    assert.notEqual(w('2026-03-01T21:59:00Z'), w('2026-03-01T22:00:00Z'));
    assert.equal(w('2026-03-01T22:00:00Z'), w('2026-03-06T20:00:00Z')); // Fri before close
    assert.equal(w('2026-03-06T22:30:00Z'), w('2026-03-01T22:00:00Z')); // Fri after 17:00 still same week
    // after DST start (Mar 8): Sun 2026-03-15 17:00 EDT = 21:00Z
    assert.notEqual(w('2026-03-15T20:59:00Z'), w('2026-03-15T21:00:00Z'));
    assert.equal(w('2026-03-15T21:00:00Z'), w('2026-03-20T10:00:00Z'));
    // UTC convention puts Sunday 2026-03-01 22:00Z into the previous (Mon-start) week, NY 17:00 into the next
    assert.notEqual(periodKey(Z('2026-03-01T22:00:00Z'), 'week', 'utc'), periodKey(Z('2026-03-02T00:00:00Z'), 'week', 'utc'));
    assert.equal(periodKey(Z('2026-03-01T22:00:00Z'), 'week', 'ny17'), periodKey(Z('2026-03-02T00:00:00Z'), 'week', 'ny17'));
    // month: Sat 2026-02-28 22:00Z = 17:00 EST -> trading day Mar 1 -> March; UTC convention keeps it Feb
    assert.equal(periodKey(Z('2026-02-28T22:00:00Z'), 'month', 'ny17'), periodKey(Z('2026-03-02T12:00:00Z'), 'month', 'ny17'));
    assert.notEqual(periodKey(Z('2026-02-28T21:59:00Z'), 'month', 'ny17'), periodKey(Z('2026-02-28T22:00:00Z'), 'month', 'ny17'));
    assert.notEqual(periodKey(Z('2026-02-28T22:00:00Z'), 'month', 'utc'), periodKey(Z('2026-03-02T12:00:00Z'), 'month', 'utc'));
});

test('PeriodSeries incremental equals fresh; reset on history change', () => {
    const all = hourly('2026-05-25T00:00:00Z', 24 * 12, (i) => ({ high: 100 + (i % 17), low: 90 - (i % 5), close: 95 + (i % 3) }));
    const inc = new PeriodSeries('day', 'utc');
    for (let n = 5; n <= all.length; n += 11) {
        inc.update(all.slice(0, n));
        const fresh = new PeriodSeries('day', 'utc');
        fresh.update(all.slice(0, n));
        assert.deepEqual(inc.periods, fresh.periods, 'n=' + n);
    }
    // tick change on last bar
    const ticked = all.map(b => ({ ...b }));
    ticked[ticked.length - 1].high = 777;
    inc.update(all);
    inc.update(ticked);
    assert.equal(inc.periods[inc.periods.length - 1].high, 777);
    // older history prepended -> reset
    const older = hourly('2026-05-20T00:00:00Z', 24 * 5).concat(all);
    inc.update(older);
    const fresh = new PeriodSeries('day', 'utc');
    fresh.update(older);
    assert.deepEqual(inc.periods, fresh.periods);
    // convention switch
    inc.configure('ny17');
    inc.update(all);
    const fresh2 = new PeriodSeries('day', 'ny17');
    fresh2.update(all);
    assert.deepEqual(inc.periods, fresh2.periods);
});

// --- previous levels: causality + truncation --------------------------------------

/** Day d (0-based from 2026-06-01): bars 00..23 with low 100, high 100 + (d+1)*10 at 12:00, else 101 */
function dayBars(startIso: string, days: number, skipHours = 0): OhlcBar[] {
    const t0 = Z(startIso);
    const out: OhlcBar[] = [];
    for (let i = skipHours; i < days * 24; i++) {
        const d = Math.floor(i / 24);
        const h = i % 24;
        out.push({ time: (t0 + i * HOUR) / 1000, open: 100, close: 100, low: 100, high: h === 12 ? 100 + (d + 1) * 10 : 101 });
    }
    return out;
}

test('previous day levels use only the previous day (no look-ahead)', () => {
    const bars = dayBars('2026-06-01T00:00:00Z', 4); // days 0..3, day 3 forming at full 24 bars
    const s = new PeriodSeries('day', 'utc');
    s.update(bars);
    const sets = previousLevelSets(s, bars, 3600, 1);
    assert.equal(sets.length, 1);
    assert.equal(sets[0].isCurrent, true);
    assert.equal(sets[0].prevHigh, 130); // day 2 -> 100 + 3*10
    assert.equal(sets[0].prevLow, 100);
    assert.equal(sets[0].startIdx, 72);

    // making the CURRENT day extreme must not change its own previous-day level
    const mod = bars.map(b => ({ ...b }));
    mod[mod.length - 1].high = 100000;
    mod[mod.length - 1].low = -5;
    const s2 = new PeriodSeries('day', 'utc');
    s2.update(mod);
    const sets2 = previousLevelSets(s2, mod, 3600, 1);
    assert.equal(sets2[0].prevHigh, 130);
    assert.equal(sets2[0].prevLow, 100);

    // truncating the series to an earlier point in time gives that point's levels (same as live then)
    const cut = bars.slice(0, 24 * 2 + 5); // only 5 hours into day 2
    const s3 = new PeriodSeries('day', 'utc');
    s3.update(cut);
    const sets3 = previousLevelSets(s3, cut, 3600, 1);
    assert.equal(sets3[0].prevHigh, 120); // day 1
    assert.equal(sets3[0].open, 100);
});

test('last K periods: each set uses the period before it', () => {
    const bars = dayBars('2026-06-01T00:00:00Z', 5); // days 0..4
    const s = new PeriodSeries('day', 'utc');
    s.update(bars);
    const sets = previousLevelSets(s, bars, 3600, 3);
    assert.equal(sets.length, 3);
    assert.deepEqual(sets.map(x => x.prevHigh), [140, 130, 120]); // prev of day4, day3, day2
    assert.deepEqual(sets.map(x => x.isCurrent), [true, false, false]);
    assert.equal(sets[1].endIdx, 24 * 4 - 1);
    // count larger than history: stops where no previous period exists
    const big = previousLevelSets(s, bars, 3600, 10);
    assert.equal(big.length, 4);
});

test('truncated first period is not used; whole first period is', () => {
    // history starts 10:00Z of day 0 -> day 0 truncated
    const trunc = dayBars('2026-06-01T00:00:00Z', 3, 10);
    const s = new PeriodSeries('day', 'utc');
    s.update(trunc);
    assert.equal(s.firstPeriodComplete(trunc, 3600), false);
    // current = day 2, previous = day 1 (complete) -> fine
    const sets = previousLevelSets(s, trunc, 3600, 3);
    assert.equal(sets.length, 1); // day 1's own previous (day 0) is truncated -> skipped
    assert.equal(sets[0].prevHigh, 120);
    // current = day 1 (cut series): previous would be truncated day 0 -> nothing drawn
    const cut = trunc.slice(0, 14 + 3);
    const s2 = new PeriodSeries('day', 'utc');
    s2.update(cut);
    assert.equal(previousLevelSets(s2, cut, 3600, 1).length, 0);

    // history starts exactly at the day start -> first period complete
    const whole = dayBars('2026-06-01T00:00:00Z', 2);
    const s3 = new PeriodSeries('day', 'utc');
    s3.update(whole);
    assert.equal(s3.firstPeriodComplete(whole, 3600), true);
    assert.equal(previousLevelSets(s3, whole, 3600, 1).length, 1);
});

test('chart interval equal to the period uses the previous bar directly', () => {
    const t0 = Z('2026-06-01T00:00:00Z');
    const daily: OhlcBar[] = [0, 1, 2].map(i => ({ time: (t0 + i * 86400000) / 1000, open: 100, close: 100 + i, high: 110 + i, low: 90 - i }));
    const s = new PeriodSeries('day', 'utc');
    s.update(daily);
    assert.equal(s.firstPeriodComplete(daily, 86400), true);
    const sets = previousLevelSets(s, daily, 86400, 1);
    assert.equal(sets[0].prevHigh, 111);
    assert.equal(sets[0].prevLow, 89);
    assert.equal(sets[0].prevClose, 101);
});

test('weekly and monthly previous levels', () => {
    // 3 weeks of hourly bars starting Mon 2026-06-01 (day 0 high = 110, 120, ... as dayBars)
    const bars = dayBars('2026-06-01T00:00:00Z', 21);
    const w = new PeriodSeries('week', 'utc');
    w.update(bars);
    const ws = previousLevelSets(w, bars, 3600, 1);
    assert.equal(ws.length, 1);
    assert.equal(ws[0].prevHigh, 100 + 14 * 10); // week 2 (days 7..13): max day high = day 13 -> 100 + 14*10
    assert.equal(ws[0].startIdx, 14 * 24);
    // months: June 1..21 only -> single month -> no previous month
    const m = new PeriodSeries('month', 'utc');
    m.update(bars);
    assert.equal(previousLevelSets(m, bars, 3600, 1).length, 0);
    // Jun 20 .. Jul 3 -> previous month (June) is truncated at the start -> nothing
    const span = dayBars('2026-06-20T00:00:00Z', 14);
    const m2 = new PeriodSeries('month', 'utc');
    m2.update(span);
    assert.equal(m2.firstPeriodComplete(span, 3600), false);
    assert.equal(previousLevelSets(m2, span, 3600, 1).length, 0);
});

// --- ADR ----------------------------------------------------------------------------

test('ADR averages the last N completed days; excludes forming day', () => {
    // 8 days: day d range = 10*(d+1) (low 100, high 100+10*(d+1)); day 7 is forming
    const bars = dayBars('2026-06-01T00:00:00Z', 8);
    const s = new PeriodSeries('day', 'utc');
    s.update(bars);
    const r = computeAdr(s, s.firstPeriodComplete(bars, 3600), 3)!;
    assert.equal(r.days, 3);
    assert.equal(r.adr, (50 + 60 + 70) / 3); // days 4,5,6 -> ranges 50,60,70
    const all = computeAdr(s, true, 14)!;
    assert.equal(all.days, 7); // fewer than N -> use what exists (>= 5)
    assert.equal(all.adr, (10 + 20 + 30 + 40 + 50 + 60 + 70) / 7);
});

test('ADR needs at least 5 completed days (or N if smaller); truncated first day excluded', () => {
    const four = dayBars('2026-06-01T00:00:00Z', 5); // 4 completed + 1 forming
    const s = new PeriodSeries('day', 'utc');
    s.update(four);
    assert.equal(computeAdr(s, true, 14), null);
    assert.equal(computeAdr(s, true, 4)!.days, 4); // N=4 satisfied
    // 5 completed + 1 forming but first day truncated -> only 4 usable -> null
    const trunc = dayBars('2026-06-01T00:00:00Z', 6, 6);
    const s2 = new PeriodSeries('day', 'utc');
    s2.update(trunc);
    assert.equal(s2.firstPeriodComplete(trunc, 3600), false);
    assert.equal(computeAdr(s2, false, 14), null);
    // exactly 5 completed whole days -> value
    const five = dayBars('2026-06-01T00:00:00Z', 6);
    const s3 = new PeriodSeries('day', 'utc');
    s3.update(five);
    const r = computeAdr(s3, true, 14)!;
    assert.equal(r.days, 5);
    assert.equal(r.adr, (10 + 20 + 30 + 40 + 50) / 5);
    // single day loaded
    const one = dayBars('2026-06-01T00:00:00Z', 1);
    const s4 = new PeriodSeries('day', 'utc');
    s4.update(one);
    assert.equal(computeAdr(s4, true, 14), null);
});

test('ADR in NY 17:00 convention buckets by 17:00 NY days', () => {
    // bars over 3 NY-trading days in June (EDT: 17:00 = 21:00Z)
    const t0 = Z('2026-06-01T21:00:00Z');
    const bars: OhlcBar[] = [];
    for (let i = 0; i < 72; i++) {
        const d = Math.floor(i / 24);
        bars.push({ time: (t0 + i * HOUR) / 1000, open: 100, close: 100, low: 100, high: i % 24 === 3 ? 100 + (d + 1) * 10 : 101 });
    }
    const s = new PeriodSeries('day', 'ny17');
    s.update(bars);
    assert.equal(s.periods.length, 3);
    assert.deepEqual(s.periods.map(p => p.high - p.low), [10, 20, 30]);
    assert.equal(s.firstPeriodComplete(bars, 3600), true);
    // same bars bucketed in UTC split differently
    const u = new PeriodSeries('day', 'utc');
    u.update(bars);
    assert.equal(u.periods.length, 4);
});

// --- review fixes ---------------------------------------------------------------

/** Same timestamps and length, different prices (other symbol / Heikin-Ashi) */
function reprice(bars: OhlcBar[], k: number): OhlcBar[] {
    return bars.map(b => ({ ...b, open: b.open + k, close: b.close + k, high: b.high + k, low: b.low + k }));
}

test('PeriodSeries: different series with identical timestamps/length equals a fresh computation', () => {
    const a = hourly('2026-05-25T00:00:00Z', 24 * 6, (i) => ({ high: 100 + (i % 17), low: 90 - (i % 5) }));
    const b = reprice(a, 1000);
    const inc = new PeriodSeries('day', 'utc');
    inc.update(a);
    inc.update(b);
    const fresh = new PeriodSeries('day', 'utc');
    fresh.update(b);
    assert.deepEqual(inc.periods, fresh.periods);
    assert.ok(inc.periods[0].high > 1000);
    // reset() (symbol change from setContext) also gives the fresh result
    inc.update(a);
    inc.reset();
    inc.update(a);
    const freshA = new PeriodSeries('day', 'utc');
    freshA.update(a);
    assert.deepEqual(inc.periods, freshA.periods);
});

test('PeriodSeries: shrink (replay step back) equals a fresh computation', () => {
    const a = hourly('2026-05-25T00:00:00Z', 24 * 6, (i) => ({ high: 100 + (i % 17) }));
    const inc = new PeriodSeries('day', 'utc');
    inc.update(a);
    inc.update(a.slice(0, 24 * 3 + 5));
    const fresh = new PeriodSeries('day', 'utc');
    fresh.update(a.slice(0, 24 * 3 + 5));
    assert.deepEqual(inc.periods, fresh.periods);
});

test('ScanGuard: sessions cache invalid on symbol swap, shrink, interval change, anchor change; valid on append/tick', () => {
    const a = hourly('2026-03-25T00:00:00Z', 24 * 6, (i) => ({ high: 100 + ((i * 7) % 13) }));
    const g = new ScanGuard();
    assert.equal(g.isValid(a, 3600), false); // nothing committed
    g.commit(a, 3600);
    assert.equal(g.isValid(a, 3600), true);
    const ticked = a.map(b => ({ ...b }));
    ticked[ticked.length - 1].close += 5; ticked[ticked.length - 1].high += 5;
    assert.equal(g.isValid(ticked, 3600), true); // live tick keeps the cache
    assert.equal(g.isValid([...a, ...hourly('2026-03-31T00:00:00Z', 3)], 3600), true); // append
    assert.equal(g.isValid(reprice(a, 500), 3600), false); // other symbol, same times
    assert.equal(g.isValid(a.slice(0, 24 * 3), 3600), false); // shrink, same first bar
    assert.equal(g.isValid(a, 900), false); // interval change
    assert.equal(g.isValid(a.slice(1), 3600), false); // first bar changed
    const anchorMoved = a.map((b, i) => (i === a.length - 1 ? { ...b, time: b.time + 60 } : b));
    assert.equal(g.isValid(anchorMoved, 3600), false);

    // consequence: with the guard, rebuilt sessions after a swap equal a fresh scan
    const z = getZoneClock('Europe/London');
    const inst: SessionInstance[] = [];
    updateSessionInstances(a, z, 480, 1020, inst, 0);
    const b2 = reprice(a, 1000);
    if (!g.isValid(b2, 3600)) inst.length = 0;
    const sc = updateSessionInstances(b2, z, 480, 1020, inst, g.isValid(b2, 3600) ? a.length : 0);
    assert.equal(sc, b2.length);
    const fresh: SessionInstance[] = [];
    updateSessionInstances(b2, z, 480, 1020, fresh, 0);
    assert.deepEqual(inst, fresh);
});

test('detectDayStart: auto = UTC for 7-day series, NY17 for 5-day (Saturday-less) series', () => {
    const sevenDay = hourly('2026-06-01T00:00:00Z', 24 * 7); // Mon..Sun includes Sat
    assert.equal(detectDayStart(sevenDay), 'utc');
    // FX: Sun 22:00Z .. Fri 21:00Z
    const fx = hourly('2026-06-07T22:00:00Z', 24 * 5 - 1);
    assert.equal(new Date(fx[fx.length - 1].time * 1000).getUTCDay(), 5);
    assert.equal(detectDayStart(fx), 'ny17');
});

/** FX weeks: open Sun 22:00Z, close Fri 21:00Z. Mon..Thu range 10, Fri range 20, Sunday sliver range 1. */
function fxBars(): OhlcBar[] {
    const out: OhlcBar[] = [];
    for (const sun of ['2026-05-31T22:00:00Z', '2026-06-07T22:00:00Z', '2026-06-14T22:00:00Z']) {
        const t0 = Z(sun);
        const lastWeek = sun === '2026-06-14T22:00:00Z';
        const hours = lastWeek ? 14 : 5 * 24 - 1; // last week: Sunday 22:00 .. Monday 11:00 (forming)
        for (let i = 0; i < hours; i++) {
            const t = t0 + i * HOUR;
            const dow = new Date(t).getUTCDay();
            const h = new Date(t).getUTCHours();
            let high = 101;
            if (dow === 0) high = 101; // Sunday sliver
            else if (dow === 5 && h === 12) high = 120;
            else if (h === 12) high = 110;
            out.push({ time: t / 1000, open: 100, close: 100, low: 100, high });
        }
    }
    return out;
}

test('FX Sunday sliver in UTC mode: previous-day levels come from Friday; ADR unaffected by the stub', () => {
    const bars = fxBars();
    const s = new PeriodSeries('day', 'utc');
    s.update(bars);
    const raw = s.periods;
    const last = raw[raw.length - 1];
    assert.ok(last.last - last.first + 1 <= 14);
    assert.equal(new Date(bars[raw[raw.length - 2].first].time * 1000).getUTCDay(), 0); // raw: previous period is the Sunday sliver
    const sets = previousLevelSets(s, bars, 3600, 1);
    assert.equal(sets.length, 1);
    assert.equal(sets[0].prevHigh, 120, 'Friday high, not the Sunday sliver');
    assert.equal(sets[0].prevLow, 100);
    assert.equal(sets[0].startIdx, raw[raw.length - 2].first, 'Monday line starts at the Sunday open');
    // ADR over completed days: Mon-Thu 10, Fri 20 (x2 weeks) -> mean 12; slivers merged into Mondays
    const adr = computeAdr(s, s.firstPeriodComplete(bars, 3600), 14)!;
    assert.ok(adr, 'adr available');
    // week 1 Monday (merged with its sliver) is the truncated first period => dropped: Tue-Fri w1 + Mon-Fri w2 = 7 x 10 + 2 x 20
    assert.equal(adr.days, 9);
    assert.equal(adr.adr, 110 / 9);
});

test('Stub merging leaves week/month and normal days unchanged', () => {
    const bars = dayBars('2026-06-01T00:00:00Z', 6);
    const d = new PeriodSeries('day', 'utc');
    d.update(bars);
    assert.equal(d.effectivePeriods(), d.periods);
    const w = new PeriodSeries('week', 'utc');
    w.update(bars);
    assert.equal(w.effectivePeriods(), w.periods);
});

console.log(`\n${passed} tests passed` + (process.exitCode ? ' (with FAILURES)' : ''));
