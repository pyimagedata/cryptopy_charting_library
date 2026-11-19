import { WebSocketServer } from 'ws';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Binary frame: [uint32 LE headerLen][header JSON, space-padded so the payload
 * starts on an 8-byte boundary][payload]. Decoded in demo-ts.html
 * (decodeBridgeMessage). Exported for tests.
 */
export function encodeBinaryFrame(headerJson, binary) {
    let header = Buffer.from(headerJson, 'utf-8');
    const pad = (8 - ((4 + header.length) % 8)) % 8;
    if (pad) header = Buffer.concat([header, Buffer.alloc(pad, 0x20)]);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(header.length, 0);
    const body = Buffer.isBuffer(binary) ? binary : Buffer.from(binary.buffer, binary.byteOffset, binary.byteLength);
    return Buffer.concat([lenBuf, header, body]);
}

const CLOCK_SKEW_SECONDS = 30;
const MAX_TICKET_LIFETIME_SECONDS = 600;
const DEFAULT_ALLOWED_EMAILS = ['ccryptopy@gmail.com'];
const DEFAULT_ALLOWED_ORIGINS = ['https://evotrading.net', 'https://www.evotrading.net'];

function b64urlDecode(str) {
    return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Verify a bridge ticket issued by Django (accounts.views.AgentBridgeTicketView):
 * `base64url(payload).base64url(HMAC-SHA256(secret, payloadB64))`, payload JSON
 * `{uid, email, exp}`. Returns `{ok: true, payload}` or `{ok: false, reason}`.
 * `allowedEmails` (array of lowercase emails) is optional; when non-empty the
 * ticket's email must be in it. Exported for tests.
 */
export function verifyBridgeTicket(ticket, secret, { allowedEmails = null, now = Date.now() / 1000 } = {}) {
    if (!secret) return { ok: false, reason: 'no-secret' };
    if (typeof ticket !== 'string' || ticket.length > 2048) return { ok: false, reason: 'malformed' };
    const parts = ticket.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
    const [body, sig] = parts;
    const expected = createHmac('sha256', secret).update(body).digest();
    const given = b64urlDecode(sig);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        return { ok: false, reason: 'bad-signature' };
    }
    let payload;
    try {
        payload = JSON.parse(b64urlDecode(body).toString('utf-8'));
    } catch {
        return { ok: false, reason: 'malformed' };
    }
    if (!payload || !Number.isFinite(payload.exp)) return { ok: false, reason: 'malformed' };
    if (payload.exp + CLOCK_SKEW_SECONDS < now) return { ok: false, reason: 'expired' };
    if (payload.exp > now + MAX_TICKET_LIFETIME_SECONDS) return { ok: false, reason: 'exp-too-far' };
    if (typeof payload.jti !== 'string' || !payload.jti) return { ok: false, reason: 'no-jti' };
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    if (allowedEmails && allowedEmails.length > 0 && !allowedEmails.includes(email)) {
        return { ok: false, reason: 'email-not-allowed' };
    }
    return { ok: true, payload: { ...payload, email } };
}

function parseList(value, fallback, lower = true) {
    const list = (value || '').split(',').map((e) => e.trim()).filter(Boolean).map((e) => (lower ? e.toLowerCase() : e));
    return list.length ? list : fallback;
}

/**
 * Holds WebSocket connections to one or more open chart tabs (browsers) and
 * dispatches tool commands to whichever is currently "active", matching
 * responses back to callers by request id.
 *
 * Multiple tabs may stay connected at once (e.g. the same account open in
 * two browsers) — connecting a new tab does NOT drop older ones, it only
 * changes which tab receives the next tool call. This is independent of how
 * many MCP client sessions (AI hosts) are attached upstream; one shared
 * bridge serves all of them.
 *
 * Mounted on an existing http.Server via `noServer: true` so it can share a
 * single port/tunnel with the MCP Streamable HTTP endpoint. Every upgrade
 * request must carry a `tab` (client-generated id, persisted per-tab in
 * sessionStorage) and a `ticket` (short-lived HMAC ticket minted by Django for
 * the one allowed superuser account, verified with AGENT_BRIDGE_SECRET; see
 * verifyBridgeTicket). The MCP bearer token does NOT authenticate the bridge.
 * If AGENT_BRIDGE_SECRET is unset every upgrade is rejected.
 */
export class ChartBridge {
    constructor(httpServer, {
        secret = process.env.AGENT_BRIDGE_SECRET,
        allowedEmails = parseList(process.env.AGENT_BRIDGE_ALLOWED_EMAILS, DEFAULT_ALLOWED_EMAILS),
        allowedOrigins = parseList(process.env.AGENT_BRIDGE_ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS),
        allowNoOrigin = process.env.AGENT_BRIDGE_ALLOW_NO_ORIGIN === '1', // dev only
    } = {}) {
        this._allowedOrigins = allowedOrigins.map((o) => o.toLowerCase());
        this._allowNoOrigin = allowNoOrigin;
        this._usedJti = new Map(); // jti -> exp (single-use tickets)
        this._secret = secret;
        this._allowedEmails = allowedEmails;
        this._warnedNoSecret = false;
        this._connections = new Map(); // tabId -> WebSocket
        this._emails = new Map(); // tabId -> account email
        this._activeTabId = null;
        this._pending = new Map(); // request id -> {resolve, reject, timeout}
        this._wss = new WebSocketServer({ noServer: true });

        httpServer.on('upgrade', (req, socket, head) => {
            let url;
            try {
                url = new URL(req.url, 'http://localhost');
            } catch {
                socket.destroy();
                return;
            }
            if (url.pathname !== '/agent-bridge') return; // not ours — let other listeners handle it

            if (!this._secret) {
                if (!this._warnedNoSecret) {
                    this._warnedNoSecret = true;
                    console.error('[chart-bridge] AGENT_BRIDGE_SECRET is not set - rejecting all bridge connections');
                }
                socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
                return;
            }

            const origin = (req.headers.origin || '').toLowerCase();
            if (origin ? !this._allowedOrigins.includes(origin) : !this._allowNoOrigin) {
                socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
                return;
            }

            const tabId = url.searchParams.get('tab');
            const result = verifyBridgeTicket(url.searchParams.get('ticket'), this._secret, { allowedEmails: this._allowedEmails });
            if (!result.ok || !tabId || !this._consumeJti(result.payload)) {
                socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
                return;
            }

            this._wss.handleUpgrade(req, socket, head, (ws) => {
                this._onConnection(ws, tabId, result.payload.email);
            });
        });

        console.error('[chart-bridge] mounted at /agent-bridge (multi-tab)');
    }

    /** Single use: remember each jti until its ticket expires; false on replay. */
    _consumeJti(payload) {
        const now = Date.now() / 1000;
        for (const [jti, exp] of this._usedJti) {
            if (exp + CLOCK_SKEW_SECONDS < now) this._usedJti.delete(jti);
        }
        if (this._usedJti.has(payload.jti)) return false;
        if (this._usedJti.size >= 1000) return false; // savunma: tek sahip icin asla dolmaz
        this._usedJti.set(payload.jti, payload.exp);
        return true;
    }

    _onConnection(socket, tabId, email) {
        console.error(`[chart-bridge] tab connected: ${tabId} (${email})`);
        this._connections.set(tabId, socket);
        this._emails.set(tabId, email);
        this._activeTabId = tabId; // most-recently-connected tab becomes the AI's target

        socket.on('message', (data) => this._handleMessage(data));
        socket.on('close', () => {
            console.error(`[chart-bridge] tab disconnected: ${tabId}`);
            // Fail this tab's in-flight requests now instead of waiting for their timeouts.
            for (const [id, p] of this._pending) {
                if (p.socket !== socket) continue;
                this._pending.delete(id);
                clearTimeout(p.timeout);
                p.reject(new Error(`Chart tab disconnected before responding to '${p.tool}'`));
            }
            if (this._connections.get(tabId) !== socket) return; // superseded by a newer socket with the same id
            this._connections.delete(tabId);
            this._emails.delete(tabId);
            if (this._activeTabId === tabId) {
                // Fall back to any other still-open tab, if one exists.
                const remaining = [...this._connections.keys()];
                this._activeTabId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
            }
        });
        socket.on('error', (err) => {
            console.error(`[chart-bridge] socket error (tab ${tabId}):`, err.message);
        });
    }

    _handleMessage(data) {
        let msg;
        try {
            msg = JSON.parse(data.toString());
        } catch {
            return;
        }
        const pending = this._pending.get(msg.id);
        if (!pending) return;
        this._pending.delete(msg.id);
        clearTimeout(pending.timeout);
        if (msg.ok) {
            pending.resolve(msg.result);
        } else {
            pending.reject(new Error(msg.error || 'Unknown chart error'));
        }
    }

    /**
     * Send a tool command to the currently active chart tab and await its response.
     *
     * `binary` (optional Buffer/TypedArray) is shipped as ONE binary WebSocket
     * frame instead of JSON number arrays: [uint32 LE headerLen][header JSON,
     * space-padded so the payload starts on an 8-byte boundary][payload bytes].
     * The browser (demo-ts.html decodeBridgeMessage) puts the payload on
     * args.dataBuffer / args.dataOffset. No size limit is applied on this send
     * path (ws maxPayload only limits INCOMING frames: the default 100 MiB
     * covers the small JSON replies the browser sends back).
     */
    call(tool, args, timeoutMs = 5000, binary = null) {
        const socket = this._activeTabId ? this._connections.get(this._activeTabId) : null;
        if (!socket || socket.readyState !== socket.OPEN) {
            return Promise.reject(new Error('No chart connected. Open the chart page (demo-ts.html) first.'));
        }

        const id = randomUUID();
        let payload = JSON.stringify({ id, tool, args });
        let sendOpts;
        if (binary) {
            payload = encodeBinaryFrame(payload, binary);
            sendOpts = { binary: true };
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this._pending.delete(id);
                reject(new Error(`Timed out waiting for chart response to '${tool}'`));
            }, timeoutMs);

            this._pending.set(id, { resolve, reject, timeout, socket, tool });
            socket.send(payload, sendOpts, (err) => {
                if (!err) return;
                if (!this._pending.delete(id)) return;
                clearTimeout(timeout);
                reject(new Error(`Failed to send '${tool}' to the chart: ${err.message}`));
            });
        });
    }

    /** List every currently connected tab, marking which one tool calls target. */
    listConnections() {
        return [...this._connections.keys()].map((tabId) => ({
            tabId,
            email: this._emails.get(tabId) || null,
            active: tabId === this._activeTabId,
        }));
    }

    /** Redirect subsequent tool calls to a specific already-connected tab. */
    setActiveTab(tabId) {
        if (!this._connections.has(tabId)) {
            throw new Error(`No connected tab with id '${tabId}'. See list_connected_charts.`);
        }
        this._activeTabId = tabId;
    }

    get isChartConnected() {
        const socket = this._activeTabId ? this._connections.get(this._activeTabId) : null;
        return !!socket && socket.readyState === socket.OPEN;
    }
}
