/**
 * Binance Futures (USD-M) Provider
 * 
 * Combined Orderbook + Candle + Liquidation provider for Binance USD-M Futures.
 * Uses fapi.binance.com endpoints.
 * 
 * Additional features compared to Spot:
 * - Liquidation stream
 * - Open Interest data
 * - Funding Rate data
 */

import { BaseDataProvider } from '../../base-provider';
import {
    IOrderbookProvider,
    ICandleProvider,
    IDerivativesProvider,
    ITradeProvider,
    Orderbook,
    OrderbookLevel,
    OrderbookUpdateCallback,
    Candle,
    CandleInterval,
    CandleUpdateCallback,
    Trade,
    TradeUpdateCallback,
    Liquidation,
    LiquidationCallback,
    OpenInterest,
    OpenInterestCallback,
    MarketType
} from '../../types';

// ============================================================================
// Configuration
// ============================================================================

export interface BinanceFuturesConfig {
    maxOrderbookLevels?: number;
    orderbookUpdateSpeed?: '100ms' | '250ms' | '500ms';
}

const DEFAULT_CONFIG: Required<BinanceFuturesConfig> = {
    maxOrderbookLevels: 1000,
    orderbookUpdateSpeed: '100ms'
};

// ============================================================================
// Constants
// ============================================================================

const REST_BASE_URL = 'https://fapi.binance.com';
const WS_BASE_URL = 'wss://fstream.binance.com/ws';

const INTERVAL_MAP: Record<CandleInterval, string> = {
    '1s': '1s', '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '8h': '8h', '12h': '12h',
    '1d': '1d', '3d': '3d', '1w': '1w', '1M': '1M'
};

// ============================================================================
// Provider Implementation
// ============================================================================

/**
 * Binance USD-M Futures Data Provider
 * 
 * Features:
 * - Real-time orderbook (depth) data
 * - Historical and streaming candle (OHLCV) data
 * - Real-time trade stream
 * - Liquidation events stream
 * - Open Interest data
 */
export class BinanceFuturesProvider extends BaseDataProvider implements
    IOrderbookProvider,
    ICandleProvider,
    ITradeProvider,
    IDerivativesProvider {

    readonly name = 'Binance Futures';
    readonly marketType: MarketType = 'futures';

    private _config: Required<BinanceFuturesConfig>;

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

    // Liquidation state
    private _liquidationCallbacks: Map<string, LiquidationCallback[]> = new Map();
    private _liquidationWs: WebSocket | null = null;

    // Open Interest state
    private _oiCallbacks: Map<string, OpenInterestCallback[]> = new Map();

    // Reconnection
    private _reconnectTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

    constructor(config: BinanceFuturesConfig = {}) {
        super();
        this._config = { ...DEFAULT_CONFIG, ...config };
    }

    // ========================================================================
    // Connection Management
    // ========================================================================

    async connect(): Promise<void> {
        if (this.status === 'connected') return;

        this.setStatus('connecting');
        this.log('Connecting to Binance Futures...');

        this.setStatus('connected');
        this.resetReconnectAttempts();
    }

    disconnect(): void {
        this._closeAllConnections(this._orderbookWs);
        this._closeAllConnections(this._candleWs);
        this._closeAllConnections(this._tradeWs);

        if (this._liquidationWs) {
            this._liquidationWs.close();
            this._liquidationWs = null;
        }

        for (const timeout of this._reconnectTimeouts.values()) {
            clearTimeout(timeout);
        }

        this._orderbooks.clear();
        this._orderbookCallbacks.clear();
        this._candleCallbacks.clear();
        this._tradeCallbacks.clear();
        this._liquidationCallbacks.clear();
        this._oiCallbacks.clear();
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
        const levels = Math.min(limit || this._config.maxOrderbookLevels, 1000);

        const url = `${REST_BASE_URL}/fapi/v1/depth?symbol=${sym}&limit=${levels}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch orderbook: ${response.status}`);
        }

        const data = await response.json();
        const orderbook: Orderbook = {
            symbol: sym,
            exchange: 'Binance Futures',
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

        const url = `${REST_BASE_URL}/fapi/v1/klines?symbol=${sym}&interval=${binanceInterval}&limit=${limit}`;
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
            const streamName = `${sym.toLowerCase()}@aggTrade`;
            const ws = this._createWebSocket(streamName, sym, 'trade', (data) => {
                const trade: Trade = {
                    id: data.a,
                    symbol: sym,
                    price: parseFloat(data.p),
                    quantity: parseFloat(data.q),
                    side: data.m ? 'sell' : 'buy',
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
    // IDerivativesProvider Implementation
    // ========================================================================

    /**
     * Subscribe to all liquidation events (all symbols)
     */
    subscribeLiquidations(symbol: string, callback: LiquidationCallback): void {
        const sym = symbol === '*' ? '*' : this._normalizeSymbol(symbol);

        if (!this._liquidationCallbacks.has(sym)) {
            this._liquidationCallbacks.set(sym, []);
        }
        this._liquidationCallbacks.get(sym)!.push(callback);

        // Connect to all-market liquidation stream if not connected
        if (!this._liquidationWs) {
            const wsUrl = `${WS_BASE_URL}/!forceOrder@arr`;
            this._liquidationWs = new WebSocket(wsUrl);

            this._liquidationWs.onopen = () => this.log('Liquidation stream connected');

            this._liquidationWs.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.e === 'forceOrder') {
                        const o = data.o;
                        const liquidation: Liquidation = {
                            symbol: o.s,
                            side: o.S === 'BUY' ? 'short' : 'long',  // BUY = short liquidated
                            price: parseFloat(o.p),
                            quantity: parseFloat(o.q),
                            timestamp: data.E
                        };

                        // Notify symbol-specific callbacks
                        this._notifyCallbacks(this._liquidationCallbacks, o.s, liquidation);
                        // Notify wildcard callbacks
                        this._notifyCallbacks(this._liquidationCallbacks, '*', liquidation);
                    }
                } catch (e) {
                    this.logError('Failed to parse liquidation:', e);
                }
            };

            this._liquidationWs.onclose = () => {
                this.log('Liquidation stream closed');
                this._liquidationWs = null;
                // Auto-reconnect after 5s
                setTimeout(() => {
                    if (this._liquidationCallbacks.size > 0) {
                        this.subscribeLiquidations('*', () => { });
                    }
                }, 5000);
            };
        }
    }

    unsubscribeLiquidations(symbol: string): void {
        const sym = symbol === '*' ? '*' : this._normalizeSymbol(symbol);
        this._liquidationCallbacks.delete(sym);

        // Close stream if no more subscribers
        if (this._liquidationCallbacks.size === 0 && this._liquidationWs) {
            this._liquidationWs.close();
            this._liquidationWs = null;
        }
    }

    /**
     * Get current open interest for a symbol
     */
    async getOpenInterest(symbol: string): Promise<OpenInterest> {
        const sym = this._normalizeSymbol(symbol);
        const url = `${REST_BASE_URL}/fapi/v1/openInterest?symbol=${sym}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch open interest: ${response.status}`);
        }

        const data = await response.json();

        // Get mark price for value calculation
        const markPrice = await this._getMarkPrice(sym);

        return {
            symbol: sym,
            openInterest: parseFloat(data.openInterest),
            openInterestValue: parseFloat(data.openInterest) * markPrice,
            timestamp: Date.now()
        };
    }

    private async _getMarkPrice(symbol: string): Promise<number> {
        const url = `${REST_BASE_URL}/fapi/v1/premiumIndex?symbol=${symbol}`;
        const response = await fetch(url);
        if (!response.ok) return 0;
        const data = await response.json();
        return parseFloat(data.markPrice);
    }

    subscribeOpenInterest(symbol: string, callback: OpenInterestCallback): void {
        const sym = this._normalizeSymbol(symbol);

        if (!this._oiCallbacks.has(sym)) {
            this._oiCallbacks.set(sym, []);
        }
        this._oiCallbacks.get(sym)!.push(callback);

        // Poll every 5 seconds (no WS stream for OI)
        this._pollOpenInterest(sym);
    }

    private async _pollOpenInterest(symbol: string): Promise<void> {
        if (!this._oiCallbacks.has(symbol)) return;

        try {
            const oi = await this.getOpenInterest(symbol);
            this._notifyCallbacks(this._oiCallbacks, symbol, oi);
        } catch (e) {
            this.logError(`Failed to poll OI for ${symbol}:`, e);
        }

        // Schedule next poll
        setTimeout(() => this._pollOpenInterest(symbol), 5000);
    }

    unsubscribeOpenInterest(symbol: string): void {
        this._oiCallbacks.delete(this._normalizeSymbol(symbol));
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
            const timeout = setTimeout(() => { }, 5000);
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
