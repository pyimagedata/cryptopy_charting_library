import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import WebSocket from 'ws';
import { ChartBridge, verifyBridgeTicket } from '../src/chart-bridge.js';

const SECRET = 'unit-test-secret';
const NOW = 1_700_000_000;

function mint(payload, secret = SECRET) {
    payload = { jti: randomUUID(), ...payload };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

test('valid ticket', () => {
    const r = verifyBridgeTicket(mint({ uid: 1, email: 'A@x.com', exp: NOW + 300 }), SECRET, { now: NOW, allowedEmails: ['a@x.com'] });
    assert.equal(r.ok, true);
    assert.equal(r.payload.email, 'a@x.com');
});

test('bad signature', () => {
    const r = verifyBridgeTicket(mint({ uid: 1, email: 'a@x.com', exp: NOW + 300 }, 'other'), SECRET, { now: NOW });
    assert.deepEqual(r, { ok: false, reason: 'bad-signature' });
});

test('expired (beyond 30 s skew) rejected, within skew accepted', () => {
    assert.equal(verifyBridgeTicket(mint({ email: 'a@x.com', exp: NOW - 31 }), SECRET, { now: NOW }).reason, 'expired');
    assert.equal(verifyBridgeTicket(mint({ email: 'a@x.com', exp: NOW - 10 }), SECRET, { now: NOW }).ok, true);
});

test('wrong email', () => {
    const r = verifyBridgeTicket(mint({ email: 'evil@x.com', exp: NOW + 300 }), SECRET, { now: NOW, allowedEmails: ['a@x.com'] });
    assert.equal(r.reason, 'email-not-allowed');
});

test('missing secret / malformed / missing ticket', () => {
    assert.equal(verifyBridgeTicket(mint({ email: 'a@x.com', exp: NOW + 300 }), '', { now: NOW }).reason, 'no-secret');
    assert.equal(verifyBridgeTicket('garbage', SECRET).ok, false);
    assert.equal(verifyBridgeTicket(null, SECRET).ok, false);
});

async function tryConnect(bridgeOpts, query, headers = { Origin: 'https://evotrading.net' }) {
    const server = http.createServer();
    new ChartBridge(server, { allowedEmails: ['a@x.com'], ...bridgeOpts });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/agent-bridge?${query}`, { headers });
    const outcome = await new Promise((resolve) => {
        ws.on('open', () => resolve('open'));
        ws.on('error', () => resolve('rejected'));
    });
    ws.terminate();
    server.close();
    return outcome;
}

test('upgrade: ticket accepted, bearer-style key and missing secret rejected', async () => {
    const t = mint({ email: 'a@x.com', exp: Math.floor(Date.now() / 1000) + 300 });
    assert.equal(await tryConnect({ secret: SECRET }, `tab=t1&ticket=${t}`), 'open');
    assert.equal(await tryConnect({ secret: SECRET }, 'tab=t1&key=whatever'), 'rejected');
    assert.equal(await tryConnect({ secret: SECRET, allowedEmails: undefined }, `tab=t1&ticket=${mint({ email: 'ccryptopy@gmail.com', exp: Math.floor(Date.now() / 1000) + 300 })}`), 'open', 'default email allowlist');
    assert.equal(await tryConnect({ secret: SECRET, allowedEmails: undefined }, `tab=t1&ticket=${mint({ email: 'evil@x.com', exp: Math.floor(Date.now() / 1000) + 300 })}`), 'rejected');
    assert.equal(await tryConnect({ secret: '' }, `tab=t1&ticket=${t}`), 'rejected');
});

test('exp validation: non-finite, too far in the future, missing jti', () => {
    assert.equal(verifyBridgeTicket(mint({ email: 'a@x.com', exp: 'soon' }), SECRET, { now: NOW }).ok, false);
    assert.equal(verifyBridgeTicket(mint({ email: 'a@x.com', exp: null }), SECRET, { now: NOW }).ok, false);
    assert.equal(verifyBridgeTicket(mint({ email: 'a@x.com', exp: NOW + 601 }), SECRET, { now: NOW }).reason, 'exp-too-far');
    assert.equal(verifyBridgeTicket(mint({ email: 'a@x.com', exp: NOW + 600 }), SECRET, { now: NOW }).ok, true);
    assert.equal(verifyBridgeTicket(mint({ email: 'a@x.com', exp: NOW + 60, jti: '' }), SECRET, { now: NOW }).reason, 'no-jti');
});

test('ticket is single use (replay rejected)', async () => {
    const server = http.createServer();
    new ChartBridge(server, { secret: SECRET, allowedEmails: ['a@x.com'] });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const t = mint({ email: 'a@x.com', exp: Math.floor(Date.now() / 1000) + 300 });
    const attempt = async (tab) => {
        const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/agent-bridge?tab=${tab}&ticket=${t}`, { headers: { Origin: 'https://evotrading.net' } });
        const r = await new Promise((res) => { ws.on('open', () => res('open')); ws.on('error', () => res('rejected')); });
        return { r, ws };
    };
    const first = await attempt('t1');
    const second = await attempt('t2');
    assert.equal(first.r, 'open');
    assert.equal(second.r, 'rejected');
    first.ws.terminate();
    server.close();
});

test('Origin allowlist: foreign origin and missing origin rejected unless explicitly allowed', async () => {
    const t = () => mint({ email: 'a@x.com', exp: Math.floor(Date.now() / 1000) + 300 });
    assert.equal(await tryConnect({ secret: SECRET }, `tab=t1&ticket=${t()}`, { Origin: 'https://evil.example' }), 'rejected');
    assert.equal(await tryConnect({ secret: SECRET }, `tab=t1&ticket=${t()}`, {}), 'rejected');
    assert.equal(await tryConnect({ secret: SECRET, allowNoOrigin: true }, `tab=t1&ticket=${t()}`, {}), 'open');
    assert.equal(await tryConnect({ secret: SECRET }, `tab=t1&ticket=${t()}`, { Origin: 'https://www.evotrading.net' }), 'open');
});

const HTML = '/Users/mac/Desktop/MY_PROJECTS/AI_CHARTS/EvoTrdading/frontend/public/demo-ts.html';
test('demo-ts.html: hostile wsUrl is ignored, only allowlisted hosts accepted', { skip: !existsSync(HTML) && 'demo-ts.html not found' }, () => {
    const html = readFileSync(HTML, 'utf-8');
    assert.ok(!/searchParams\.get\('wsUrl'\)|urlParams\.get\('wsUrl'\)|AGENT_BRIDGE_WS_URL|AGENT_BRIDGE_KEY/.test(html), 'page must not read wsUrl/key params');
    const a = html.indexOf('function isAllowedBridgeUrl(');
    const b = html.indexOf('// end isAllowedBridgeUrl', a);
    assert.ok(a > 0 && b > a);
    const ok = new Function(`${html.slice(a, b)}\nreturn isAllowedBridgeUrl;`)();
    assert.equal(ok('wss://mcp.evotrading.net/agent-bridge'), true);
    assert.equal(ok('ws://localhost:8766/agent-bridge'), true);
    assert.equal(ok('ws://127.0.0.1:8766/agent-bridge'), true);
    for (const bad of ['wss://evil.example/agent-bridge', 'ws://mcp.evotrading.net/x', 'wss://mcp.evotrading.net.evil.com/x',
        'wss://user@mcp.evotrading.net/x', 'wss://localhost/x', 'ws://localhost.evil.com/x', '', undefined, 'not a url']) {
        assert.equal(ok(bad), false, String(bad));
    }
});
