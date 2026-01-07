/**
 * Binance Orderbook Provider
 * 
 * Fetches and maintains real-time orderbook data from Binance via WebSocket.
 * Provides depth data for heatmap visualization.
 * 
 * Supports both Spot and Futures markets.
 */

import { BaseDataProvider } from '../base-provider';
import {
    IOrderbookProvider,
    Orderbook,
    OrderbookLevel,
    OrderbookUpdateCallback,
    MarketType
} from '../types';

export type BinanceMarket = 'spot' | 'futures';

export interface BinanceOrderbookConfig {
    market?: BinanceMarket;
    maxLevels?: number;
    updateSpeed?: '100ms' | '1000ms';  // Binance supports 100ms or 1000ms updates
}

const DEFAULT_CONFIG: Required<BinanceOrderbookConfig> = {
    market: 'spot',
    maxLevels: 1000,
    updateSpeed: '100ms'
};

/**
 * Binance Orderbook Provider
 */
export class BinanceOrderbookProvider extends BaseDataProvider implements IOrderbookProvider {
    readonly name = 'Binance';
    readonly marketType: MarketType = 'crypto';

    private _config: Required<BinanceOrderbookConfig>;
    private _ws: WebSocket | null = null;
    private _orderbooks: Map<string, Orderbook> = new Map();
    private _callbacks: Map<string, OrderbookUpdateCallback[]> = new Map();
    private _reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    private _subscribedSymbols: Set<string> = new Set();

    constructor(config: BinanceOrderbookConfig = {}) {
        super();
        this._config = { ...DEFAULT_CONFIG, ...config };
    }

    // ========================================================================
    // REST API Endpoints
    // ========================================================================

    private get _restBaseUrl(): string {
        return this._config.market === 'futures'
            ? 'https://fapi.binance.com'
            : 'https://api.binance.com';
    }

    private get _wsBaseUrl(): string {
        return this._config.market === 'futures'
            ? 'wss://fstream.binance.com/ws'
            : 'wss://stream.binance.com:9443/ws';
    }

    // ========================================================================
    // Connection Management
    // ========================================================================

    async connect(): Promise<void> {
        if (this.status === 'connected' || this.status === 'connecting') {
            return;
        }

        this.setStatus('connecting');
        this.log('Connecting...');

        // For Binance, we connect to streams per-symbol, so main "connect" just sets status
        this.setStatus('connected');
        this.resetReconnectAttempts();
    }

    disconnect(): void {
        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
        if (this._reconnectTimeout) {
            clearTimeout(this._reconnectTimeout);
            this._reconnectTimeout = null;
        }
        this._subscribedSymbols.clear();
        this._orderbooks.clear();
        this._callbacks.clear();
        this.setStatus('disconnected');
    }

    // ========================================================================
    // IOrderbookProvider Implementation
    // ========================================================================

    /**
     * Get current orderbook snapshot for a symbol
     */
    async getOrderbook(symbol: string, limit?: number): Promise<Orderbook> {
        const normalizedSymbol = this._normalizeSymbol(symbol);
        const levels = Math.min(limit || this._config.maxLevels, 5000);

        const endpoint = this._config.market === 'futures'
            ? `/fapi/v1/depth?symbol=${normalizedSymbol}&limit=${levels}`
            : `/api/v3/depth?symbol=${normalizedSymbol}&limit=${levels}`;

        const url = `${this._restBaseUrl}${endpoint}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch orderbook: ${response.status}`);
        }

        const data = await response.json();

        const orderbook: Orderbook = {
            symbol: normalizedSymbol,
            exchange: this.name,
            timestamp: Date.now(),
            bids: data.bids.map((b: string[]) => ({
                price: parseFloat(b[0]),
                quantity: parseFloat(b[1])
            })),
            asks: data.asks.map((a: string[]) => ({
                price: parseFloat(a[0]),
                quantity: parseFloat(a[1])
            }))
        };

        // Cache it
        this._orderbooks.set(normalizedSymbol, orderbook);

        this.log(`Orderbook snapshot loaded: ${orderbook.bids.length} bids, ${orderbook.asks.length} asks`);
        return orderbook;
    }

    /**
     * Subscribe to real-time orderbook updates
     */
    subscribeOrderbook(symbol: string, callback: OrderbookUpdateCallback): void {
        const normalizedSymbol = this._normalizeSymbol(symbol);

        // Register callback
        if (!this._callbacks.has(normalizedSymbol)) {
            this._callbacks.set(normalizedSymbol, []);
        }
        this._callbacks.get(normalizedSymbol)!.push(callback);

        // If already subscribed, just fire current state
        if (this._subscribedSymbols.has(normalizedSymbol)) {
            const cached = this._orderbooks.get(normalizedSymbol);
            if (cached) {
                callback(cached);
            }
            return;
        }

        // Subscribe to WebSocket stream
        this._subscribeToStream(normalizedSymbol);
    }

    /**
     * Unsubscribe from orderbook updates
     */
    unsubscribeOrderbook(symbol: string): void {
        const normalizedSymbol = this._normalizeSymbol(symbol);
        this._callbacks.delete(normalizedSymbol);
        this._subscribedSymbols.delete(normalizedSymbol);
        this._orderbooks.delete(normalizedSymbol);

        // TODO: Actually unsubscribe from WebSocket if no more subscriptions
    }

    // ========================================================================
    // WebSocket Management
    // ========================================================================

    private async _subscribeToStream(symbol: string): Promise<void> {
        // First fetch snapshot
        try {
            await this.getOrderbook(symbol);
        } catch (e) {
            this.logError(`Failed to fetch initial orderbook for ${symbol}:`, e);
            return;
        }

        this._subscribedSymbols.add(symbol);

        // Connect to WebSocket
        const streamName = `${symbol.toLowerCase()}@depth@${this._config.updateSpeed}`;
        const wsUrl = `${this._wsBaseUrl}/${streamName}`;

        this._ws = new WebSocket(wsUrl);

        this._ws.onopen = () => {
            this.log(`WebSocket connected for ${symbol}`);
        };

        this._ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this._processUpdate(symbol, data);
            } catch (e) {
                this.logError('Failed to process orderbook update:', e);
            }
        };

        this._ws.onclose = () => {
            this.log(`WebSocket disconnected for ${symbol}`);

            // Auto-reconnect after delay
            this._reconnectTimeout = setTimeout(() => {
                if (this._subscribedSymbols.has(symbol)) {
                    this._subscribeToStream(symbol);
                }
            }, 5000);
        };

        this._ws.onerror = (error) => {
            this.logError('WebSocket error:', error);
        };
    }

    private _processUpdate(symbol: string, data: any): void {
        const orderbook = this._orderbooks.get(symbol);
        if (!orderbook) return;

        // Apply bid updates
        for (const [priceStr, qtyStr] of data.b || []) {
            const price = parseFloat(priceStr);
            const quantity = parseFloat(qtyStr);
            this._updateLevel(orderbook.bids, price, quantity);
        }

        // Apply ask updates
        for (const [priceStr, qtyStr] of data.a || []) {
            const price = parseFloat(priceStr);
            const quantity = parseFloat(qtyStr);
            this._updateLevel(orderbook.asks, price, quantity);
        }

        // Sort
        orderbook.bids.sort((a, b) => b.price - a.price);
        orderbook.asks.sort((a, b) => a.price - b.price);

        // Trim to max levels
        if (orderbook.bids.length > this._config.maxLevels) {
            orderbook.bids = orderbook.bids.slice(0, this._config.maxLevels);
        }
        if (orderbook.asks.length > this._config.maxLevels) {
            orderbook.asks = orderbook.asks.slice(0, this._config.maxLevels);
        }

        orderbook.timestamp = Date.now();

        // Notify subscribers
        const callbacks = this._callbacks.get(symbol);
        if (callbacks) {
            for (const cb of callbacks) {
                try {
                    cb(orderbook);
                } catch (e) {
                    this.logError('Error in orderbook callback:', e);
                }
            }
        }
    }

    private _updateLevel(levels: OrderbookLevel[], price: number, quantity: number): void {
        const index = levels.findIndex(l => l.price === price);

        if (quantity === 0) {
            if (index !== -1) {
                levels.splice(index, 1);
            }
        } else if (index !== -1) {
            levels[index].quantity = quantity;
        } else {
            levels.push({ price, quantity });
        }
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private _normalizeSymbol(symbol: string): string {
        // Remove common separators and uppercase
        return symbol.toUpperCase().replace(/[\/\-_]/g, '');
    }

    /**
     * Get total bid/ask volume for a symbol
     */
    getTotalVolume(symbol: string): { bidVolume: number; askVolume: number; ratio: number } {
        const orderbook = this._orderbooks.get(this._normalizeSymbol(symbol));
        if (!orderbook) {
            return { bidVolume: 0, askVolume: 0, ratio: 0.5 };
        }

        const bidVolume = orderbook.bids.reduce((sum, l) => sum + l.quantity * l.price, 0);
        const askVolume = orderbook.asks.reduce((sum, l) => sum + l.quantity * l.price, 0);
        const total = bidVolume + askVolume;
        const ratio = total > 0 ? bidVolume / total : 0.5;

        return { bidVolume, askVolume, ratio };
    }
}
