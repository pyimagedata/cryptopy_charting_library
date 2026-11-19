// Tests for DrawingManager time<->x mapping across timeframes. Run: node scripts/run-drawing-timemap-test.mjs
import assert from 'node:assert/strict';
import { DrawingManager } from '../src/drawings/drawing-manager';

let passed = 0;
function test(name: string, fn: () => void): void {
    try { fn(); passed++; console.log('ok   - ' + name); } catch (e) { console.log('FAIL - ' + name); console.log(e); process.exitCode = 1; }
}

const H = 3600000;
const utc = (m: number, d: number, h: number) => Date.UTC(2026, m - 1, d, h);
const SPACING = 10;

/** Linear stub: x = index * SPACING */
const stubScale = {
    barSpacing: SPACING,
    indexToCoordinate: (i: number) => i * SPACING,
    coordinateToFloatIndex: (x: number) => x / SPACING,
};

function mk(ts: number[], tf: string): any {
    const dm: any = new DrawingManager();
    dm.setScales(stubScale, {});
    dm.setTimeframe(tf);
    dm.setTimestamps(ts);
    return dm;
}

/** Daily futures stamps with the real GC1! pattern: 22:00 UTC (summer), 23:00 (winter), DST duplicates on 1-2 Nov, weekend gaps. */
function dailySeries(): number[] {
    const out: number[] = [];
    // 22:00 days (skip weekends: 10-23 Fri->10-24 listed in real data, keep real list)
    const summer: Array<[number, number]> = [[9, 1], [9, 2], [9, 3], [9, 4], [9, 7], [9, 8], [9, 9], [9, 10], [9, 11], [9, 14], [9, 15], [9, 16], [9, 17], [9, 18],
        [9, 21], [9, 22], [9, 23], [9, 24], [9, 25], [9, 28], [9, 29], [9, 30], [10, 1], [10, 2], [10, 5], [10, 6], [10, 7], [10, 8], [10, 9], [10, 12],
        [10, 13], [10, 14], [10, 15], [10, 16], [10, 19], [10, 20], [10, 21], [10, 22], [10, 24], [10, 25], [10, 26], [10, 27], [10, 28], [10, 29]];
    for (const [m, d] of summer) out.push(utc(m, d, 22));
    out.push(utc(11, 1, 22), utc(11, 1, 23), utc(11, 2, 22), utc(11, 2, 23));
    for (const d of [3, 4, 5, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18]) out.push(utc(11, d, 23));
    for (let i = 1; i < out.length; i++) assert.ok(out[i] > out[i - 1]);
    return out;
}

function halfDaySeries(): number[] {
    const out: number[] = [];
    for (let t = utc(9, 1, 0); t <= utc(11, 19, 12); t += 12 * H) out.push(t);
    return out;
}

test('interval estimate ignores 1h DST duplicates (min diff would be 1h)', () => {
    const dm = mk(dailySeries(), 'D');
    assert.equal(dm._estimateInterval(), 24 * H);
    const dm2 = mk(dailySeries(), '');   // no timeframe known -> median
    assert.equal(dm2._estimateInterval(), 24 * H);
});

test('nominal interval per timeframe; mismatching label falls back to data median', () => {
    assert.equal(mk(halfDaySeries(), '12h')._estimateInterval(), 12 * H);
    assert.equal(mk(halfDaySeries(), '720')._estimateInterval(), 12 * H);
    // label says 1D but data is still 12h (switch in flight): within 2x -> nominal; else median
    assert.equal(mk(halfDaySeries(), '1h')._estimateInterval(), 12 * H);
});

test('12h points mapped onto daily series: in-range fractional index, beyond last bar uses 1 day per bar', () => {
    const daily = dailySeries();
    const dm = mk(daily, 'D');
    const last = daily.length - 1;
    // in-range: midway between 11-03 23:00 and 11-04 23:00 (indices i, i+1)
    const i = daily.indexOf(utc(11, 3, 23));
    assert.equal(dm.timeToPixel(utc(11, 4, 11)), (i + 0.5) * SPACING);
    // across the duplicate pair: exact bar stamps
    const j = daily.indexOf(utc(11, 1, 23));
    assert.equal(dm.timeToPixel(utc(11, 1, 23)), j * SPACING);
    assert.equal(dm.timeToPixel(utc(11, 1, 22)), (j - 1) * SPACING);
    // last 12h bar (19 Nov 12:00) is 13h after the last daily stamp (18 Nov 23:00) -> 13/24 bar, NOT 13 bars
    const x = dm.timeToPixel(utc(11, 19, 12));
    assert.ok(Math.abs(x - (last + 13 / 24) * SPACING) < 1e-6, 'got ' + x);
    // one week after last bar: ~7 bars
    const x7 = dm.timeToPixel(utc(11, 18, 23) + 7 * 24 * H);
    assert.ok(Math.abs(x7 - (last + 7) * SPACING) < 1e-6);
    // before first bar
    const x0 = dm.timeToPixel(utc(9, 1, 22) - 2 * 24 * H);
    assert.ok(Math.abs(x0 - (-2) * SPACING) < 1e-6);
});

test('pixel->time->pixel round trips (daily), including extrapolation and the duplicate pair', () => {
    const daily = dailySeries();
    const dm = mk(daily, 'D');
    const last = daily.length - 1;
    const j = daily.indexOf(utc(11, 1, 22));
    for (const idx of [-3.25, 0, 2.5, j + 0.5, j + 1, j + 1.7, last - 0.5, last + 0.4, last + 3.3]) {
        const t = dm._pixelToTime(idx * SPACING, true);
        const x = dm.timeToPixel(t);
        assert.ok(Math.abs(x - idx * SPACING) < 1e-6, `idx ${idx}: ${x}`);
    }
});

test('draw on daily beyond last bar, switch back to 12h: time is preserved', () => {
    const daily = dailySeries();
    const dm = mk(daily, 'D');
    const last = daily.length - 1;
    const t = dm._pixelToTime((last + 2.5) * SPACING, true);
    assert.equal(t, utc(11, 18, 23) + 2.5 * 24 * H);
    const half = halfDaySeries();
    dm.setTimeframe('12h'); dm.setTimestamps(half);
    const k = half.length - 1;
    const x = dm.timeToPixel(t);
    assert.ok(Math.abs(x - (k + (t - half[k]) / (12 * H)) * SPACING) < 1e-6);
    assert.ok(Math.abs(dm._pixelToTime(x, true) - t) < 1e-3);
});

test('timestamps swap (TF switch) uses new array, no stale cache', () => {
    const dm = mk(halfDaySeries(), '12h');
    assert.equal(dm._estimateInterval(), 12 * H);
    dm.setTimeframe('D'); dm.setTimestamps(dailySeries());
    assert.equal(dm._estimateInterval(), 24 * H);
});

console.log(`${passed} passed`);
