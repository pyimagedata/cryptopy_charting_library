// load_dataset_to_chart server side: temp BACKTEST_DATA_DIR + real ChartBridge with a fake tab.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const dir = await mkdtemp(path.join(os.tmpdir(), 'bt-chart-'));
process.env.BACKTEST_DATA_DIR = dir;
delete process.env.BACKTEST_CHART_MAX_BARS;
const { ChartBridge } = await import('../src/chart-bridge.js');
const { loadDatasetToChart } = await import('../src/chart-dataset.js');
const { aggregateSlice, CHART_MAX_BARS } = await import('../src/backtest-data.js');

after(() => rm(dir, { recursive: true, force: true }));

const utc = (s) => Date.parse(`${s}Z`);
const N = 2500; // 1m bars from 2024-01-01T00:00Z
{
    const out = ['Date,Open,High,Low,Close,Volume'];
    let t = utc('2024-01-01T00:00:00');
    for (let i = 0; i < N; i++, t += 60_000) {
        out.push(`${new Date(t).toISOString().slice(0, 19).replace('T', ' ')},${100 + i},${101 + i},${99 + i},${100.5 + i},${i + 1}`);
    }
    await writeFile(path.join(dir, 'x.csv'), out.join('\n') + '\n');
    await writeFile(path.join(dir, 'datasets.json'), JSON.stringify([{ name: 'X_1m', symbol: 'X', source: 'x.csv', tz: 'UTC', timeframe: '1m' }]));
}

// Fake tab: records the decoded binary frame and answers ok.
async function setup() {
    const server = http.createServer();
    const bridge = new ChartBridge(server, 'k');
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/agent-bridge?key=k&tab=t1`);
    ws.binaryType = 'arraybuffer';
    await new Promise((r) => ws.on('open', r));
    await new Promise((r) => setTimeout(r, 50));
    const frames = [];
    ws.on('message', (data, isBinary) => {
        const hl = new DataView(data).getUint32(0, true);
        const msg = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 4, hl)));
        const off = 4 + hl;
        const n = msg.args.dataMeta.count;
        frames.push({ isBinary, msg, off, t: new Float64Array(data, off, n), c: new Float64Array(data, off + 4 * n * 8, n) });
        ws.send(JSON.stringify({ id: msg.id, ok: true, result: { ok: true } }));
    });
    return { server, bridge, ws, frames };
}
const close = ({ ws, server }) => { ws.close(); server.close(); server.closeAllConnections?.(); };

test('default chart cap is 300000 and aggregateSlice keepLast keeps the newest bars', () => {
    assert.equal(CHART_MAX_BARS, 300_000);
    const base = { t: new Float64Array(10), o: new Float64Array(10), h: new Float64Array(10), l: new Float64Array(10), c: new Float64Array(10), v: new Float64Array(10) };
    for (let i = 0; i < 10; i++) { base.t[i] = utc('2024-01-01T00:00:00') + i * 60_000; for (const f of 'ohlcv') base[f][i] = i; }
    const r = aggregateSlice(base, { timeframe: '5m', maxBars: 1, keepLast: true });
    assert.equal(r.count, 1);
    assert.equal(r.totalBars, 2);
    assert.equal(r.views.t[0], utc('2024-01-01T00:05:00'));
    assert.equal(r.views.o[0], 5); assert.equal(r.views.c[0], 9); assert.equal(r.views.v[0], 5 + 6 + 7 + 8 + 9);
});

test('no from + over cap: newest bars kept, truncated reported, frame header/payload correct', async () => {
    const env = await setup();
    try {
        const r = await loadDatasetToChart(env.bridge, { dataset: 'X_1m', timeframe: '1m' }, { chartMaxBars: 1000 });
        assert.equal(r.barsShown, 1000);
        assert.equal(r.truncated, true);
        assert.equal(r.firstBarUtc, new Date(utc('2024-01-01T00:00:00') + 1500 * 60_000).toISOString());
        assert.equal(r.lastBarUtc, new Date(utc('2024-01-01T00:00:00') + 2499 * 60_000).toISOString());
        assert.match(r.note, /2,500.*1,000/);
        assert.equal(env.frames.length, 1);
        const f = env.frames[0];
        assert.ok(f.isBinary);
        assert.equal(f.msg.tool, 'load_dataset_to_chart');
        assert.equal(f.off % 8, 0);
        assert.equal(f.msg.args.dataMeta.count, 1000);
        assert.equal(f.msg.args.dataMeta.dataset, 'X_1m');
        assert.equal(f.msg.args.dataMeta.timeframe, '1m');
        assert.equal(f.msg.args.truncated, true);
        assert.equal(f.t[0], utc('2024-01-01T00:00:00') + 1500 * 60_000);
        assert.equal(f.c[999], 100.5 + 2499);
    } finally { close(env); }
});

test('under cap: not truncated; aggregated timeframe', async () => {
    const env = await setup();
    try {
        const r = await loadDatasetToChart(env.bridge, { dataset: 'X_1m', timeframe: '1h' }, { chartMaxBars: 1000 });
        assert.equal(r.barsShown, 42);
        assert.equal(r.truncated, false);
        assert.equal(r.note, undefined);
        assert.equal(env.frames[0].msg.args.truncated, false);
    } finally { close(env); }
});

test('explicit from over cap: clear error, nothing sent; explicit range under cap works', async () => {
    const env = await setup();
    try {
        await assert.rejects(
            () => loadDatasetToChart(env.bridge, { dataset: 'X_1m', timeframe: '1m', from: '2024-01-01' }, { chartMaxBars: 1000 }),
            /2,500 1m bars.*chart display cap of 1,000.*higher timeframe.*narrower/s
        );
        assert.equal(env.frames.length, 0);
        const r = await loadDatasetToChart(env.bridge, { dataset: 'X_1m', timeframe: '1m', from: '2024-01-01T01:00', to: '2024-01-01T02:00' }, { chartMaxBars: 1000 });
        assert.equal(r.barsShown, 60);
        assert.equal(r.truncated, false);
    } finally { close(env); }
});

test('no chart connected -> clear error', async () => {
    const server = http.createServer();
    const bridge = new ChartBridge(server, 'k');
    await assert.rejects(() => loadDatasetToChart(bridge, { dataset: 'X_1m', timeframe: '1h' }), /No chart connected/);
    server.close();
});
