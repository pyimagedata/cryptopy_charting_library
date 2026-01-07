/**
 * Binance Spot Provider
 * 
 * Combined Orderbook + Candle provider for Binance Spot market.
 * Uses api.binance.com endpoints.
 */

import { BaseDataProvider } from '../../base-provider';
import {
    IFullDataProvider,
    Orderbook,
    OrderbookLevel,
    OrderbookUpdateCallback,
    Candle,
    CandleInterval,
    CandleUpdateCallback,
    Trade,
    TradeUpdateCallback,
    MarketType
} from '../../types';

// ============================================================================
// Configuration
// ============================================================================

export interface BinanceSpotConfig {
    maxOrderbookLevels?: number;
    orderbookUpdateSpeed?: '100ms' | '1000ms';
}

const DEFAULT_CONFIG: Required<BinanceSpotConfig> = {
    maxOrderbookLevels: 1000,
    orderbookUpdateSpeed: '100ms'
};

// ============================================================================
// Constants
// ============================================================================

const REST_BASE_URL = 'https://api.binance.com';
const WS_BASE_URL = 'wss://stream.binance.com:9443/ws';

const INTERVAL_MAP: Record<CandleInterval, string> = {
    '1s': '1s', '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '8h': '8h', '12h': '12h',
    '1d': '1d', '3d': '3d', '1w': '1w', '1M': '1M'
};

// ============================================================================
// Provider Implementation
// ============================================================================

/**
 * Binance Spot Market Data Provider
 * 
 * Features:
 * - Real-time orderbook (depth) data
 * - Historical and streaming candle (OHLCV) data
 * - Real-time trade stream
 */
export class BinanceSpotProvider extends BaseDataProvider implements IFullDataProvider {
    readonly name = 'Binance Spot';
    readonly marketType: MarketType = 'crypto';

    private _config: Required<BinanceSpotConfig>;

    // Orderbook state
    private _orderbooks: Map<string, Orderbook> = new Map();
    private _orderbookCallbacks: Map<string, OrderbookUpdateCallback[]> = new Map();
    private _orderbookWs: Map<string, WebSocket> = new Map();

    // Candle state
    private _candleCallbacks: Map<string, CandleUpdateCallback[]> = new Map();
    private _candleWs: Map<string, WebSocket> = new Map();

    // Trade state
    private _tradeCallbacks: Map<string, TradeUpdateCallback[]> = new Map();
    private _tradeWs: Map<string, WebSocket> = new Map();

    // Reconnection
    private _reconnectTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

    constructor(config: BinanceSpotConfig = {}) {
        super();
        this._config = { ...DEFAULT_CONFIG, ...config };
    }

    // ========================================================================
    // Connection Management
    // ========================================================================

    async connect(): Promise<void> {
        if (this.status === 'connected') return;

        this.setStatus('connecting');
        this.log('Connecting to Binance Spot...');

        // No auth needed for public data
        this.setStatus('connected');
        this.resetReconnectAttempts();
    }

    disconnect(): void {
        // Close all WebSockets
        this._closeAllConnections(this._orderbookWs);
        this._closeAllConnections(this._candleWs);
        this._closeAllConnections(this._tradeWs);

        // Clear timeouts
        for (const timeout of this._reconnectTimeouts.values()) {
            clearTimeout(timeout);
        }

        // Clear state
        this._orderbooks.clear();
        this._orderbookCallbacks.clear();
        this._candleCallbacks.clear();
        this._tradeCallbacks.clear();
        this._reconnectTimeouts.clear();

        this.setStatus('disconnected');
    }

    private _closeAllConnections(wsMap: Map<string, WebSocket>): void {
        for (const ws of wsMap.values()) {
            ws.close();
        }
        wsMap.clear();
    }

    // ========================================================================
    // IOrderbookProvider Implementation
    // ========================================================================

    async getOrderbook(symbol: string, limit?: number): Promise<Orderbook> {
        const sym = this._normalizeSymbol(symbol);
        const levels = Math.min(limit || this._config.maxOrderbookLevels, 5000);

        const url = `${REST_BASE_URL}/api/v3/depth?symbol=${sym}&limit=${levels}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch orderbook: ${response.status}`);
        }

        const data = await response.json();
        const orderbook: Orderbook = {
            symbol: sym,
            exchange: 'Binance Spot',
            timestamp: Date.now(),
            bids: data.bids.map((b: string[]) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) })),
            asks: data.asks.map((a: string[]) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) }))
        };

        this._orderbooks.set(sym, orderbook);
        this.log(`Orderbook loaded: ${orderbook.bids.length} bids, ${orderbook.asks.length} asks`);
        return orderbook;
    }

    subscribeOrderbook(symbol: string, callback: OrderbookUpdateCallback): void {
        const sym = this._normalizeSymbol(symbol);

        if (!this._orderbookCallbacks.has(sym)) {
            this._orderbookCallbacks.set(sym, []);
        }
        this._orderbookCallbacks.get(sym)!.push(callback);

        if (!this._orderbookWs.has(sym)) {
            this._connectOrderbookStream(sym);
        } else {
            // Fire cached data
            const cached = this._orderbooks.get(sym);
            if (cached) callback(cached);
        }
    }

    unsubscribeOrderbook(symbol: string): void {
        const sym = this._normalizeSymbol(symbol);
        this._orderbookCallbacks.delete(sym);
        this._orderbooks.delete(sym);

        const ws = this._orderbookWs.get(sym);
        if (ws) {
            ws.close();
            this._orderbookWs.delete(sym);
        }
    }

    private async _connectOrderbookStream(symbol: string): Promise<void> {
        // Fetch snapshot first
        await this.getOrderbook(symbol);

        const streamName = `${symbol.toLowerCase()}@depth@${this._config.orderbookUpdateSpeed}`;
        const ws = this._createWebSocket(streamName, symbol, 'orderbook', (data) => {
            this._processOrderbookUpdate(symbol, data);
        });

        this._orderbookWs.set(symbol, ws);
    }

    private _processOrderbookUpdate(symbol: string, data: any): void {
        const orderbook = this._orderbooks.get(symbol);
        if (!orderbook) return;

        for (const [priceStr, qtyStr] of data.b || []) {
            this._updateLevel(orderbook.bids, parseFloat(priceStr), parseFloat(qtyStr));
        }
        for (const [priceStr, qtyStr] of data.a || []) {
            this._updateLevel(orderbook.asks, parseFloat(priceStr), parseFloat(qtyStr));
        }

        orderbook.bids.sort((a, b) => b.price - a.price);
        orderbook.asks.sort((a, b) => a.price - b.price);

        if (orderbook.bids.length > this._config.maxOrderbookLevels) {
            orderbook.bids = orderbook.bids.slice(0, this._config.maxOrderbookLevels);
        }
        if (orderbook.asks.length > this._config.maxOrderbookLevels) {
            orderbook.asks = orderbook.asks.slice(0, this._config.maxOrderbookLevels);
        }

        orderbook.timestamp = Date.now();
        this._notifyCallbacks(this._orderbookCallbacks, symbol, orderbook);
    }

    private _updateLevel(levels: OrderbookLevel[], price: number, quantity: number): void {
        const index = levels.findIndex(l => l.price === price);
        if (quantity === 0) {
            if (index !== -1) levels.splice(index, 1);
        } else if (index !== -1) {
            levels[index].quantity = quantity;
        } else {
            levels.push({ price, quantity });
        }
    }

    // ========================================================================
    // ICandleProvider Implementation
    // ========================================================================

    async getCandles(symbol: string, interval: CandleInterval, limit: number = 500): Promise<Candle[]> {
        const sym = this._normalizeSymbol(symbol);
        const binanceInterval = INTERVAL_MAP[interval] || '1h';

        const url = `${REST_BASE_URL}/api/v3/klines?symbol=${sym}&interval=${binanceInterval}&limit=${limit}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch candles: ${response.status}`);
        }

        const data = await response.json();
        const candles: Candle[] = data.map((k: any[]) => ({
            time: Math.floor(k[0] / 1000),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5])
        }));

        this.log(`Loaded ${candles.length} ${interval} candles for ${sym}`);
        return candles;
    }

    subscribeCandles(symbol: string, interval: CandleInterval, callback: CandleUpdateCallback): void {
        const sym = this._normalizeSymbol(symbol);
        const key = `${sym}:${interval}`;

        if (!this._candleCallbacks.has(key)) {
            this._candleCallbacks.set(key, []);
        }
        this._candleCallbacks.get(key)!.push(callback);

        if (!this._candleWs.has(key)) {
            const binanceInterval = INTERVAL_MAP[interval] || '1h';
            const streamName = `${sym.toLowerCase()}@kline_${binanceInterval}`;
            const ws = this._createWebSocket(streamName, key, 'candle', (data) => {
                if (data.e === 'kline') {
                    const k = data.k;
                    const candle: Candle = {
                        time: Math.floor(k.t / 1000),
                        open: parseFloat(k.o),
                        high: parseFloat(k.h),
                        low: parseFloat(k.l),
                        close: parseFloat(k.c),
                        volume: parseFloat(k.v)
                    };
                    this._notifyCallbacks(this._candleCallbacks, key, candle);
                }
            });
            this._candleWs.set(key, ws);
        }
    }

    unsubscribeCandles(symbol: string, interval: CandleInterval): void {
        const key = `${this._normalizeSymbol(symbol)}:${interval}`;
        this._candleCallbacks.delete(key);

        const ws = this._candleWs.get(key);
        if (ws) {
            ws.close();
            this._candleWs.delete(key);
        }
    }

    // ========================================================================
    // ITradeProvider Implementation
    // ========================================================================

    subscribeTrades(symbol: string, callback: TradeUpdateCallback): void {
        const sym = this._normalizeSymbol(symbol);

        if (!this._tradeCallbacks.has(sym)) {
            this._tradeCallbacks.set(sym, []);
        }
        this._tradeCallbacks.get(sym)!.push(callback);

        if (!this._tradeWs.has(sym)) {
            const streamName = `${sym.toLowerCase()}@trade`;
            const ws = this._createWebSocket(streamName, sym, 'trade', (data) => {
                const trade: Trade = {
                    id: data.t,
                    symbol: sym,
                    price: parseFloat(data.p),
                    quantity: parseFloat(data.q),
                    side: data.m ? 'sell' : 'buy',  // m = true means buyer is market maker
                    timestamp: data.T
                };
                this._notifyCallbacks(this._tradeCallbacks, sym, trade);
            });
            this._tradeWs.set(sym, ws);
        }
    }

    unsubscribeTrades(symbol: string): void {
        const sym = this._normalizeSymbol(symbol);
        this._tradeCallbacks.delete(sym);

        const ws = this._tradeWs.get(sym);
        if (ws) {
            ws.close();
            this._tradeWs.delete(sym);
        }
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private _normalizeSymbol(symbol: string): string {
        return symbol.toUpperCase().replace(/[\/\-_]/g, '');
    }

    private _createWebSocket(
        streamName: string,
        key: string,
        type: string,
        onMessage: (data: any) => void
    ): WebSocket {
        const wsUrl = `${WS_BASE_URL}/${streamName}`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => this.log(`${type} stream connected: ${streamName}`);

        ws.onmessage = (event) => {
            try {
                onMessage(JSON.parse(event.data));
            } catch (e) {
                this.logError(`Failed to parse ${type} update:`, e);
            }
        };

        ws.onclose = () => {
            this.log(`${type} stream closed: ${streamName}`);
            // Auto-reconnect
            const timeout = setTimeout(() => {
                // Reconnect logic would go here
            }, 5000);
            this._reconnectTimeouts.set(`${type}:${key}`, timeout);
        };

        ws.onerror = (e) => this.logError(`${type} stream error:`, e);

        return ws;
    }

    private _notifyCallbacks<T>(callbackMap: Map<string, ((data: T) => void)[]>, key: string, data: T): void {
        const callbacks = callbackMap.get(key);
        if (callbacks) {
            for (const cb of callbacks) {
                try { cb(data); } catch (e) { this.logError('Callback error:', e); }
            }
        }
    }

    /**
     * Get total bid/ask volume for a symbol
     */
    getTotalVolume(symbol: string): { bidVolume: number; askVolume: number; ratio: number } {
        const orderbook = this._orderbooks.get(this._normalizeSymbol(symbol));
        if (!orderbook) return { bidVolume: 0, askVolume: 0, ratio: 0.5 };

        const bidVolume = orderbook.bids.reduce((sum, l) => sum + l.quantity * l.price, 0);
        const askVolume = orderbook.asks.reduce((sum, l) => sum + l.quantity * l.price, 0);
        const total = bidVolume + askVolume;

        return { bidVolume, askVolume, ratio: total > 0 ? bidVolume / total : 0.5 };
    }
}
