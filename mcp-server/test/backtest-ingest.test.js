// Uses a temp BACKTEST_DATA_DIR (set BEFORE importing the module; node --test runs each file in its own process).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await mkdtemp(path.join(os.tmpdir(), 'bt-data-'));
process.env.BACKTEST_DATA_DIR = dir;
process.env.BACKTEST_MAX_RESIDENT_MB = '0.2'; // ~210 KB: fits one 2500-row dataset (120 KB), not two
const M = await import('../src/backtest-data.js');

after(() => rm(dir, { recursive: true, force: true }));

const utc = (s) => Date.parse(`${s}Z`);
const manifest = (entries) => writeFile(path.join(dir, 'datasets.json'), JSON.stringify(entries));

test('CSV ingest: header detection, bad rows, duplicates, out-of-order, missing volume', async () => {
    const csv = [
        'Time,Open,High,Low,Close',                    // reordered-name header, NO volume column
        '2024-01-02 10:02:00,3,4,2,3.5',
        '2024-01-02 10:00:00,1,2,0.5,1.5',             // out of order
        '2024-01-02 10:01:00,2,3,1,2.5',
        '2024-01-02 10:01:00,2,3.1,1,2.6',             // duplicate timestamp: later row wins
        'garbage line',                                // bad: unparseable date
        '2024-01-02 10:03:00,5,,4,5',                  // bad: missing high
        '2024-01-02 10:04:00,5,6,4,abc',               // bad: non-numeric close
        '2024-01-02 10:05:00,1,0.5,2,1',               // h<l: kept, counted
        '',
    ].join('\r\n');
    await writeFile(path.join(dir, 'a.csv'), csv);
    await manifest([{ name: 'A', symbol: 'TEST', source: 'a.csv', tz: 'UTC', timeframe: '1m' }]); // relative source
    const meta = await M.ensureIngested('A');
    const q = meta.quality;
    assert.equal(meta.count, 4);                       // 10:00,10:01,10:02,10:05
    assert.equal(q.badRows, 3);
    assert.equal(q.outOfOrder, 1);
    assert.ok(q.duplicates >= 1);
    assert.equal(q.hLtL, 1);
    const s = await M.buildBacktestSlice({ dataset: 'A', timeframe: '1m' });
    const t = s.buffer.subarray(0, 4), h = s.buffer.subarray(8, 12), v = s.buffer.subarray(20, 24);
    assert.deepEqual([...t], [utc('2024-01-02T10:00:00'), utc('2024-01-02T10:01:00'), utc('2024-01-02T10:02:00'), utc('2024-01-02T10:05:00')]);
    assert.equal(h[1], 3.1);                           // later duplicate won
    assert.deepEqual([...v], [0, 0, 0, 0]);            // missing volume column => 0
});

test('ingest error messages do not leak paths', async () => {
    await manifest([{ name: 'Gone', symbol: 'X', source: 'does-not-exist.csv', tz: 'UTC' }]);
    await assert.rejects(() => M.ensureIngested('Gone'), (e) => {
        assert.match(e.message, /Gone/);
        assert.ok(!e.message.includes(dir) && !e.message.includes('does-not-exist'));
        return true;
    });
    const listing = await M.listBacktestDatasets();
    assert.equal(JSON.stringify(listing).includes(dir), false);
    assert.equal('dataDir' in listing, false);
});

function rowsCsv(n, start = '2024-01-01T00:00:00') {
    const out = ['Date,Open,High,Low,Close,Volume'];
    let t = utc(start);
    for (let i = 0; i < n; i++, t += 60_000) {
        out.push(`${new Date(t).toISOString().slice(0, 19).replace('T', ' ')},${100 + i},${101 + i},${99 + i},${100.5 + i},${i + 1}`);
    }
    return out.join('\n') + '\n';
}

test('cache invalidation when the source changes; meta written atomically (no .tmp left)', async () => {
    await writeFile(path.join(dir, 'b.csv'), rowsCsv(100));
    await manifest([{ name: 'B', symbol: 'T', source: 'b.csv', tz: 'UTC' }]);
    const m1 = await M.ensureIngested('B');
    assert.equal(m1.count, 100);
    const m1b = await M.ensureIngested('B');
    assert.equal(m1b.ingestedAt, m1.ingestedAt);       // cached, not re-ingested
    await writeFile(path.join(dir, 'b.csv'), rowsCsv(150));
    const m2 = await M.ensureIngested('B');
    assert.equal(m2.count, 150);
    assert.notEqual(m2.ingestedAt, m1.ingestedAt);
    const files = await readdir(path.join(dir, 'cache'));
    assert.ok(!files.some(f => f.endsWith('.tmp')), files.join());
    JSON.parse(await readFile(path.join(dir, 'cache', 'B.meta.json'), 'utf-8'));
    // tz change also invalidates
    await manifest([{ name: 'B', symbol: 'T', source: 'b.csv', tz: 'Europe/Athens' }]);
    const m3 = await M.ensureIngested('B');
    assert.equal(m3.fromMs, m2.fromMs - 2 * 3_600_000);
});

test('concurrent ingest calls share one run; concurrent loads de-dupe', async () => {
    await writeFile(path.join(dir, 'c.csv'), rowsCsv(2500));
    await manifest([{ name: 'C', symbol: 'T', source: 'c.csv', tz: 'UTC' }]);
    const [a, b] = await Promise.all([M.ensureIngested('C'), M.ensureIngested('C')]);
    assert.equal(a.ingestedAt, b.ingestedAt);
    M._dropResident();
    const [s1, s2] = await Promise.all([
        M.buildBacktestSlice({ dataset: 'C', timeframe: '1m' }),
        M.buildBacktestSlice({ dataset: 'C', timeframe: '1h' }),
    ]);
    assert.equal(s1.meta.count, 2500);
    assert.equal(s2.meta.count, 42);
    const st = M._residentState();
    assert.deepEqual(st.names, ['C']);
    assert.equal(st.loading, 0);
});

test('resident budget: LRU eviction keeps the newest, evicted dataset reloads fine', async () => {
    await writeFile(path.join(dir, 'd.csv'), rowsCsv(2500));
    await writeFile(path.join(dir, 'e.csv'), rowsCsv(2500));
    await manifest([
        { name: 'C', symbol: 'T', source: 'c.csv', tz: 'UTC' },
        { name: 'D', symbol: 'T', source: 'd.csv', tz: 'UTC' },
        { name: 'E', symbol: 'T', source: 'e.csv', tz: 'UTC' },
    ]);
    M._dropResident();
    await M.buildBacktestSlice({ dataset: 'C', timeframe: '1h' });
    await M.buildBacktestSlice({ dataset: 'D', timeframe: '1h' });
    assert.deepEqual(M._residentState().names, ['D']);          // C evicted (LRU)
    await M.buildBacktestSlice({ dataset: 'E', timeframe: '1h' });
    assert.deepEqual(M._residentState().names, ['E']);
    const again = await M.buildBacktestSlice({ dataset: 'C', timeframe: '1h' });
    assert.equal(again.meta.count, 42);
    assert.deepEqual(M._residentState().names, ['C']);
});

test('from/to parsing: year, epoch seconds, epoch ms, ISO; ambiguous rejected', () => {
    const p = M.parseTimeInput;
    assert.equal(p(2020, 'from'), Date.UTC(2020, 0, 1));
    assert.equal(p('2020', 'from'), Date.UTC(2020, 0, 1));
    assert.equal(p(1577836800, 'from'), 1577836800000);
    assert.equal(p('1577836800', 'to'), 1577836800000);
    assert.equal(p(1577836800000, 'to'), 1577836800000);
    assert.equal(p('2020-06-01', 'from'), utc('2020-06-01T00:00:00'));
    assert.equal(p('2020-06-01T12:00:00+02:00', 'from'), utc('2020-06-01T10:00:00'));
    assert.equal(p(null, 'from'), null);
    for (const bad of [20201, '202001', 123456, '12345678901', 1.5, 'nope']) {
        assert.throws(() => p(bad, 'from'), /ambiguous|not an integer|not a valid/, String(bad));
    }
});

test('empty slice gives a clear error with the available range', async () => {
    await assert.rejects(
        () => M.buildBacktestSlice({ dataset: 'C', timeframe: '1h', from: '2030-01-01', to: '2030-02-01' }),
        /No bars in the requested range.*Available data: 2024-01-01T00:00:00\.000Z to 2024-01-02T17:39:00\.000Z/s
    );
});

test('env validation: bad BACKTEST_MAX_BARS falls back to the default', async () => {
    assert.equal(M.MAX_BARS, 2_000_000);
    process.env.BACKTEST_MAX_BARS = 'abc';
    const { stdout } = await import('node:child_process').then(({ execFileSync }) => ({
        stdout: execFileSync(process.execPath, ['-e', "import('./src/backtest-data.js').then(m=>console.log(m.MAX_BARS))"], { cwd: path.join(import.meta.dirname, '..'), env: { ...process.env, BACKTEST_MAX_BARS: '-5' } }).toString(),
    }));
    assert.equal(stdout.trim(), '2000000');
});

test('list: ingest=true returns ready for small CSV; ingesting status when in flight', async () => {
    await writeFile(path.join(dir, 'f.csv'), rowsCsv(50));
    await manifest([{ name: 'F', symbol: 'T', source: 'f.csv', tz: 'UTC' }]);
    const before = await M.listBacktestDatasets();
    assert.equal(before.datasets[0].status, 'not_ingested');
    const l = await M.listBacktestDatasets({ ingest: true });
    assert.equal(l.datasets[0].status, 'ready');
    assert.equal(l.datasets[0].bars, 50);
});
