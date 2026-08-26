import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

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

    /** Send a tool command to the currently active chart tab and await its response. */
    call(tool, args, timeoutMs = 5000) {
        const socket = this._activeTabId ? this._connections.get(this._activeTabId) : null;
        if (!socket || socket.readyState !== socket.OPEN) {
            return Promise.reject(new Error('No chart connected. Open the chart page (demo-ts.html) first.'));
        }

        const id = randomUUID();
        const payload = JSON.stringify({ id, tool, args });

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this._pending.delete(id);
                reject(new Error(`Timed out waiting for chart response to '${tool}'`));
            }, timeoutMs);

            this._pending.set(id, { resolve, reject, timeout });
            socket.send(payload);
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
