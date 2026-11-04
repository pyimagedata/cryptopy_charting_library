import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import WebSocket from 'ws';
import { ChartBridge, encodeBinaryFrame } from '../src/chart-bridge.js';

const HTML = '/Users/mac/Desktop/MY_PROJECTS/AI_CHARTS/EvoTrdading/frontend/public/demo-ts.html';

function browserDecode() {
    if (existsSync(HTML)) {
        const html = readFileSync(HTML, 'utf-8');
        const a = html.indexOf('function decodeBridgeMessage(data) {');
        const b = html.indexOf('function connect()', a);
        return new Function(`${html.slice(a, b)}\nreturn decodeBridgeMessage;`)();
    }
    return null;
}

async function setup() {
    const server = http.createServer();
    const bridge = new ChartBridge(server, 'k');
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/agent-bridge?key=k&tab=t1`);
    ws.binaryType = 'arraybuffer';
    await new Promise((r) => ws.on('open', r));
    await new Promise((r) => setTimeout(r, 50));
    return { server, bridge, ws };
}

test('encodeBinaryFrame: header length, 8-byte padding, payload alignment', () => {
    for (const json of ['{}', '{"a":1}', '{"id":"x","tool":"t","args":{"n":12345}}', 'x'.repeat(13)]) {
        const body = Float64Array.from([1.5, -2, 3]);
        const f = encodeBinaryFrame(json, body);
        const hl = f.readUInt32LE(0);
        assert.equal((4 + hl) % 8, 0);
        assert.equal(f.subarray(4, 4 + hl).toString().trim(), json);
        assert.equal(f.length, 4 + hl + 24);
        const ab = f.buffer.slice(f.byteOffset, f.byteOffset + f.length);
        assert.deepEqual([...new Float64Array(ab, 4 + hl, 3)], [1.5, -2, 3]);
    }
});

test('binary frame round trip through ChartBridge using the browser decodeBridgeMessage', { skip: !existsSync(HTML) && 'demo-ts.html not found (EvoTrading repo not next to the library)' }, async () => {
    const decode = browserDecode();
    assert.ok(decode, 'decodeBridgeMessage not found in demo-ts.html');
    const { server, bridge, ws } = await setup();
    try {
        ws.on('message', (data, isBinary) => {
            assert.ok(isBinary);
            const msg = decode(data);               // ArrayBuffer (binaryType) like a real browser
            const f = new Float64Array(msg.args.dataBuffer, msg.args.dataOffset, 4);
            ws.send(JSON.stringify({ id: msg.id, ok: true, result: { tool: msg.tool, meta: msg.args.dataMeta, sum: f.reduce((a, b) => a + b, 0), off: msg.args.dataOffset } }));
        });
        const r = await bridge.call('load_draft_backtest', { name: 'x', dataMeta: { count: 4 } }, 5000, Float64Array.from([1, 2, 3, 4.5]));
        assert.equal(r.sum, 10.5);
        assert.equal(r.off % 8, 0);
        assert.deepEqual(r.meta, { count: 4 });
        // text frames still work unchanged
        ws.removeAllListeners('message');
        ws.on('message', (data) => { const m = JSON.parse(data.toString()); ws.send(JSON.stringify({ id: m.id, ok: true, result: 'pong' })); });
        assert.equal(await bridge.call('ping', {}), 'pong');
    } finally { ws.close(); server.close(); server.closeAllConnections?.(); }
});

test('pending requests reject immediately when the tab disconnects', async () => {
    const { server, bridge, ws } = await setup();
    try {
        ws.on('message', () => ws.close());   // never answers; closes instead
        const t0 = Date.now();
        await assert.rejects(() => bridge.call('slow', {}, 30000), /disconnected/);
        assert.ok(Date.now() - t0 < 3000);
        assert.equal(bridge._pending.size, 0);
    } finally { server.close(); server.closeAllConnections?.(); }
});
