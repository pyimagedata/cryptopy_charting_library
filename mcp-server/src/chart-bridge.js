import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

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
 * request must carry a matching `key` (shared bearer secret) and a `tab`
 * (client-generated id, persisted per-tab in sessionStorage) query param.
 */
export class ChartBridge {
    constructor(httpServer, sharedSecret) {
        this._sharedSecret = sharedSecret;
        this._connections = new Map(); // tabId -> WebSocket
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

            const key = url.searchParams.get('key');
            const tabId = url.searchParams.get('tab');
            if (key !== this._sharedSecret || !tabId) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }

            this._wss.handleUpgrade(req, socket, head, (ws) => {
                this._onConnection(ws, tabId);
            });
        });

        console.error('[chart-bridge] mounted at /agent-bridge (multi-tab)');
    }

    _onConnection(socket, tabId) {
        console.error(`[chart-bridge] tab connected: ${tabId}`);
        this._connections.set(tabId, socket);
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
