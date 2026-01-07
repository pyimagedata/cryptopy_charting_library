/**
 * OKX Futures (Swap/Perpetual) Provider
 * 
 * Combined Orderbook + Candle provider for OKX Swap market.
 * Uses okx.com API endpoints with instType=SWAP.
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

export interface OkxFuturesConfig {
    maxOrderbookLevels?: number;
}

const DEFAULT_CONFIG: Required<OkxFuturesConfig> = {
    maxOrderbookLevels: 400
};

// ============================================================================
// Constants
// ============================================================================

const OKX_REST_URL = 'https://www.okx.com';
const OKX_WS_URL = 'wss://ws.okx.com:8443/ws/v5/public';

// OKX interval mapping
const INTERVAL_MAP: Partial<Record<CandleInterval, string>> = {
    '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6H', '12h': '12H',
    '1d': '1D', '1w': '1W', '1M': '1M'
};

/**
 * OKX Futures (Swap/Perpetual) Market Data Provider
 */
export class OkxFuturesProvider extends BaseDataProvider implements IOrderbookProvider, ICandleProvider {
    readonly name = 'OKX Futures';
    readonly marketType = 'futures' as const;

    private _config: Required<OkxFuturesConfig>;
    private _orderbooks: Map<string, Orderbook> = new Map();
    private _orderbookCallbacks: Map<string, OrderbookUpdateCallback[]> = new Map();
    private _candleCallbacks: Map<string, CandleUpdateCallback[]> = new Map();
    private _ws: WebSocket | null = null;
    private _subscriptions: Set<string> = new Set();
    private _wsCallbacks: Map<string, (data: any) => void> = new Map();

    constructor(config: OkxFuturesConfig = {}) {
        super();
        this._config = { ...DEFAULT_CONFIG, ...config };
    }

    // ========================================================================
    // Connection
    // ========================================================================

    async connect(): Promise<void> {
        this.setStatus('connecting');
        this.log('Connecting to OKX Futures...');
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

    async getOrderbook(symbol: string, limit: number = 400): Promise<Orderbook> {
        const instId = this._toSwapInstId(symbol);
        const url = `${OKX_REST_URL}/api/v5/market/books?instId=${instId}&sz=${Math.min(limit, this._config.maxOrderbookLevels)}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`OKX Futures API error: ${response.status}`);

        const data = await response.json();
        if (data.code !== '0' || !data.data?.[0]) {
            throw new Error(`OKX Futures API error: ${data.msg}`);
        }

        const book = data.data[0];

        const orderbook: Orderbook = {
            symbol,
            exchange: 'OKX-FUTURES',
            timestamp: parseInt(book.ts),
            bids: book.bids.map((b: string[]) => ({
                price: parseFloat(b[0]),
                quantity: parseFloat(b[1])
            })),
            asks: book.asks.map((a: string[]) => ({
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
            const instId = this._toSwapInstId(symbol);
            this._subscribeWs('books', instId, (data) => {
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
        if (!data.data?.[0]) return;

        const update = data.data[0];
        let orderbook = this._orderbooks.get(symbol);

        if (!orderbook) {
            orderbook = {
                symbol,
                exchange: 'OKX-FUTURES',
                timestamp: Date.now(),
                bids: [],
                asks: []
            };
            this._orderbooks.set(symbol, orderbook);
        }

        orderbook.bids = update.bids.map((b: string[]) => ({
            price: parseFloat(b[0]),
            quantity: parseFloat(b[1])
        }));
        orderbook.asks = update.asks.map((a: string[]) => ({
            price: parseFloat(a[0]),
            quantity: parseFloat(a[1])
        }));
        orderbook.timestamp = parseInt(update.ts);

        // Notify callbacks
        const callbacks = this._orderbookCallbacks.get(symbol);
        if (callbacks && orderbook) {
            callbacks.forEach(cb => cb(orderbook!));
        }
    }

    // ========================================================================
    // Candles
    // ========================================================================

    async getCandles(symbol: string, interval: CandleInterval, limit: number = 300): Promise<Candle[]> {
        const instId = this._toSwapInstId(symbol);
        const bar = INTERVAL_MAP[interval] || '1H';
        const url = `${OKX_REST_URL}/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${Math.min(limit, 300)}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`OKX Futures candle API error: ${response.status}`);

        const data = await response.json();
        if (data.code !== '0' || !data.data) {
            throw new Error(`OKX Futures candle API error: ${data.msg}`);
        }

        // OKX returns [ts, open, high, low, close, vol, volCcy, volCcyQuote, confirm]
        // Sorted newest first, we need oldest first
        return data.data.reverse().map((c: string[]) => ({
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
            const bar = INTERVAL_MAP[interval] || '1H';
            const instId = this._toSwapInstId(symbol);
            this._subscribeWs(`candle${bar}`, instId, (data) => {
                if (data.data?.[0]) {
                    const c = data.data[0];
                    const candle: Candle = {
                        time: parseInt(c[0]),
                        open: parseFloat(c[1]),
                        high: parseFloat(c[2]),
                        low: parseFloat(c[3]),
                        close: parseFloat(c[4]),
                        volume: parseFloat(c[5])
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
    // Helpers
    // ========================================================================

    private _toSwapInstId(symbol: string): string {
        // Convert BTCUSDT or BTC-USDT-SWAP -> BTC-USDT-SWAP
        if (symbol.includes('-SWAP')) return symbol;
        if (symbol.includes('-')) {
            return symbol + '-SWAP';
        }
        if (symbol.endsWith('USDT')) {
            return symbol.slice(0, -4) + '-USDT-SWAP';
        }
        if (symbol.endsWith('USDC')) {
            return symbol.slice(0, -4) + '-USDC-SWAP';
        }
        return symbol + '-SWAP';
    }

    private _subscribeWs(channel: string, instId: string, onMessage: (data: any) => void): void {
        const key = `${channel}:${instId}`;
        this._wsCallbacks.set(key, onMessage);

        if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
            this._ws = new WebSocket(OKX_WS_URL);

            this._ws.onopen = () => {
                this.log('WebSocket connected (Futures/Swap)');
                this._sendSubscription(channel, instId);
            };

            this._ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.arg?.channel && data.arg?.instId) {
                        const cbKey = `${data.arg.channel}:${data.arg.instId}`;
                        const cb = this._wsCallbacks.get(cbKey);
                        if (cb) cb(data);
                    }
                } catch (e) {
                    console.error('OKX Futures WS parse error:', e);
                }
            };

            this._ws.onerror = (e) => {
                console.error('OKX Futures WS error:', e);
            };
        } else {
            this._sendSubscription(channel, instId);
        }
    }

    private _sendSubscription(channel: string, instId: string): void {
        if (this._ws?.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify({
                op: 'subscribe',
                args: [{ channel, instId }]
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
