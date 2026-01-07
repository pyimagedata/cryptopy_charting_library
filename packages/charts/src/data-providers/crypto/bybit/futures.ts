/**
 * Bybit Futures (Linear Perpetual) Provider
 * 
 * Combined Orderbook + Candle provider for Bybit Futures market.
 * Uses api.bybit.com V5 API endpoints with category=linear.
 */

import { BaseDataProvider } from '../../base-provider';
import {
    IOrderbookProvider,
    ICandleProvider,
    Orderbook,
    OrderbookUpdateCallback,
    Candle,
    CandleInterval,
    CandleUpdateCallback
} from '../../types';

// ============================================================================
// Configuration
// ============================================================================

export interface BybitFuturesConfig {
    maxOrderbookLevels?: number;
}

const DEFAULT_CONFIG: Required<BybitFuturesConfig> = {
    maxOrderbookLevels: 500
};

// ============================================================================
// Constants
// ============================================================================

const BYBIT_REST_URL = 'https://api.bybit.com';
const BYBIT_WS_URL = 'wss://stream.bybit.com/v5/public/linear';

// Bybit interval mapping
const INTERVAL_MAP: Partial<Record<CandleInterval, string>> = {
    '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
    '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
    '1d': 'D', '1w': 'W', '1M': 'M'
};

/**
 * Bybit Futures (Linear Perpetual) Market Data Provider
 */
export class BybitFuturesProvider extends BaseDataProvider implements IOrderbookProvider, ICandleProvider {
    readonly name = 'Bybit Futures';
    readonly marketType = 'futures' as const;

    private _config: Required<BybitFuturesConfig>;
    private _orderbooks: Map<string, Orderbook> = new Map();
    private _orderbookCallbacks: Map<string, OrderbookUpdateCallback[]> = new Map();
    private _candleCallbacks: Map<string, CandleUpdateCallback[]> = new Map();
    private _ws: WebSocket | null = null;
    private _subscriptions: Set<string> = new Set();
    private _wsCallbacks: Map<string, (data: any) => void> = new Map();

    constructor(config: BybitFuturesConfig = {}) {
        super();
        this._config = { ...DEFAULT_CONFIG, ...config };
    }

    // ========================================================================
    // Connection
    // ========================================================================

    async connect(): Promise<void> {
        this.setStatus('connecting');
        this.log('Connecting to Bybit Futures...');
        this.setStatus('connected');
    }

    disconnect(): void {
        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
        this._orderbooks.clear();
        this._orderbookCallbacks.clear();
        this._candleCallbacks.clear();
        this._subscriptions.clear();
        this._wsCallbacks.clear();
        this.setStatus('disconnected');
    }

    // ========================================================================
    // Orderbook
    // ========================================================================

    async getOrderbook(symbol: string, limit: number = 500): Promise<Orderbook> {
        // Use linear category for futures
        const url = `${BYBIT_REST_URL}/v5/market/orderbook?category=linear&symbol=${symbol}&limit=${Math.min(limit, this._config.maxOrderbookLevels)}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Bybit Futures API error: ${response.status}`);

        const data = await response.json();
        if (data.retCode !== 0 || !data.result) {
            throw new Error(`Bybit Futures API error: ${data.retMsg}`);
        }

        const result = data.result;

        const orderbook: Orderbook = {
            symbol,
            exchange: 'BYBIT-FUTURES',
            timestamp: parseInt(result.ts) || Date.now(),
            bids: result.b.map((b: string[]) => ({
                price: parseFloat(b[0]),
                quantity: parseFloat(b[1])
            })),
            asks: result.a.map((a: string[]) => ({
                price: parseFloat(a[0]),
                quantity: parseFloat(a[1])
            }))
        };

        this._orderbooks.set(symbol, orderbook);
        this.log(`Orderbook loaded: ${orderbook.bids.length} bids, ${orderbook.asks.length} asks`);
        return orderbook;
    }

    subscribeOrderbook(symbol: string, callback: OrderbookUpdateCallback): void {
        const callbacks = this._orderbookCallbacks.get(symbol) || [];
        callbacks.push(callback);
        this._orderbookCallbacks.set(symbol, callbacks);

        if (!this._subscriptions.has(`orderbook:${symbol}`)) {
            this._subscriptions.add(`orderbook:${symbol}`);
            this._subscribeWs(`orderbook.50.${symbol}`, (data) => {
                this._processOrderbookUpdate(symbol, data);
            });
        }

        // Send initial orderbook
        const existing = this._orderbooks.get(symbol);
        if (existing) {
            callback(existing);
        } else {
            this.getOrderbook(symbol).then(ob => callback(ob)).catch(console.error);
        }
    }

    unsubscribeOrderbook(symbol: string): void {
        this._orderbookCallbacks.delete(symbol);
        this._subscriptions.delete(`orderbook:${symbol}`);
        this._orderbooks.delete(symbol);
    }

    private _processOrderbookUpdate(symbol: string, data: any): void {
        if (!data.data) return;

        const update = data.data;
        let orderbook = this._orderbooks.get(symbol);

        if (!orderbook) {
            orderbook = {
                symbol,
                exchange: 'BYBIT-FUTURES',
                timestamp: Date.now(),
                bids: [],
                asks: []
            };
            this._orderbooks.set(symbol, orderbook);
        }

        // Bybit sends full snapshot
        if (update.b) {
            orderbook.bids = update.b.map((b: string[]) => ({
                price: parseFloat(b[0]),
                quantity: parseFloat(b[1])
            }));
        }
        if (update.a) {
            orderbook.asks = update.a.map((a: string[]) => ({
                price: parseFloat(a[0]),
                quantity: parseFloat(a[1])
            }));
        }
        orderbook.timestamp = parseInt(update.ts) || Date.now();

        // Notify callbacks
        const callbacks = this._orderbookCallbacks.get(symbol);
        if (callbacks && orderbook) {
            callbacks.forEach(cb => cb(orderbook!));
        }
    }

    // ========================================================================
    // Candles
    // ========================================================================

    async getCandles(symbol: string, interval: CandleInterval, limit: number = 200): Promise<Candle[]> {
        const intervalStr = INTERVAL_MAP[interval] || '60';
        // Use linear category for futures
        const url = `${BYBIT_REST_URL}/v5/market/kline?category=linear&symbol=${symbol}&interval=${intervalStr}&limit=${Math.min(limit, 200)}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Bybit Futures candle API error: ${response.status}`);

        const data = await response.json();
        if (data.retCode !== 0 || !data.result?.list) {
            throw new Error(`Bybit Futures candle API error: ${data.retMsg}`);
        }

        // Bybit returns [startTime, open, high, low, close, volume, turnover]
        // Sorted newest first, we need oldest first
        return data.result.list.reverse().map((c: string[]) => ({
            time: parseInt(c[0]),
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5])
        }));
    }

    subscribeCandles(symbol: string, interval: CandleInterval, callback: CandleUpdateCallback): void {
        const key = `${symbol}:${interval}`;
        const callbacks = this._candleCallbacks.get(key) || [];
        callbacks.push(callback);
        this._candleCallbacks.set(key, callbacks);

        if (!this._subscriptions.has(`candle:${key}`)) {
            this._subscriptions.add(`candle:${key}`);
            const intervalStr = INTERVAL_MAP[interval] || '60';
            this._subscribeWs(`kline.${intervalStr}.${symbol}`, (data) => {
                if (data.data?.[0]) {
                    const c = data.data[0];
                    const candle: Candle = {
                        time: parseInt(c.start),
                        open: parseFloat(c.open),
                        high: parseFloat(c.high),
                        low: parseFloat(c.low),
                        close: parseFloat(c.close),
                        volume: parseFloat(c.volume)
                    };
                    const cbs = this._candleCallbacks.get(key);
                    cbs?.forEach(cb => cb(candle));
                }
            });
        }
    }

    unsubscribeCandles(symbol: string, interval: CandleInterval): void {
        const key = `${symbol}:${interval}`;
        this._candleCallbacks.delete(key);
        this._subscriptions.delete(`candle:${key}`);
    }

    // ========================================================================
    // WebSocket
    // ========================================================================

    private _subscribeWs(topic: string, onMessage: (data: any) => void): void {
        this._wsCallbacks.set(topic, onMessage);

        if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
            this._ws = new WebSocket(BYBIT_WS_URL);

            this._ws.onopen = () => {
                this.log('WebSocket connected (Linear/Futures)');
                this._sendSubscription(topic);
            };

            this._ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.topic) {
                        const cb = this._wsCallbacks.get(data.topic);
                        if (cb) cb(data);
                    }
                } catch (e) {
                    console.error('Bybit Futures WS parse error:', e);
                }
            };

            this._ws.onerror = (e) => {
                console.error('Bybit Futures WS error:', e);
            };
        } else {
            this._sendSubscription(topic);
        }
    }

    private _sendSubscription(topic: string): void {
        if (this._ws?.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify({
                op: 'subscribe',
                args: [topic]
            }));
        }
    }

    // Get total bid/ask volume for a symbol
    getTotalVolume(symbol: string): { bidVolume: number; askVolume: number; ratio: number } {
        const orderbook = this._orderbooks.get(symbol);
        if (!orderbook) return { bidVolume: 0, askVolume: 0, ratio: 0 };

        const bidVolume = orderbook.bids.reduce((sum, l) => sum + l.quantity * l.price, 0);
        const askVolume = orderbook.asks.reduce((sum, l) => sum + l.quantity * l.price, 0);
        const ratio = askVolume > 0 ? bidVolume / askVolume : 0;

        return { bidVolume, askVolume, ratio };
    }
}
