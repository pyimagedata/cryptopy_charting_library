/**
 * Binance Candle (OHLCV) Provider
 * 
 * Fetches and streams real-time OHLCV data from Binance.
 * Supports both Spot and Futures markets.
 */

import { BaseDataProvider } from '../base-provider';
import {
    ICandleProvider,
    Candle,
    CandleInterval,
    CandleUpdateCallback,
    MarketType
} from '../types';

export type BinanceMarket = 'spot' | 'futures';

export interface BinanceCandleConfig {
    market?: BinanceMarket;
}

const DEFAULT_CONFIG: Required<BinanceCandleConfig> = {
    market: 'spot'
};

// Map our standard intervals to Binance API intervals
const INTERVAL_MAP: Record<CandleInterval, string> = {
    '1s': '1s',
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '2h': '2h',
    '4h': '4h',
    '6h': '6h',
    '8h': '8h',
    '12h': '12h',
    '1d': '1d',
    '3d': '3d',
    '1w': '1w',
    '1M': '1M'
};

/**
 * Binance Candle Provider
 */
export class BinanceCandleProvider extends BaseDataProvider implements ICandleProvider {
    readonly name = 'Binance';
    readonly marketType: MarketType = 'crypto';

    private _config: Required<BinanceCandleConfig>;
    private _wsConnections: Map<string, WebSocket> = new Map();
    private _callbacks: Map<string, CandleUpdateCallback[]> = new Map();
    private _reconnectTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

    constructor(config: BinanceCandleConfig = {}) {
        super();
        this._config = { ...DEFAULT_CONFIG, ...config };
    }

    // ========================================================================
    // API Endpoints
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

        // Binance doesn't require authentication for public data
        this.setStatus('connected');
        this.resetReconnectAttempts();
    }

    disconnect(): void {
        // Close all WebSocket connections
        for (const [key, ws] of this._wsConnections) {
            ws.close();
            const timeout = this._reconnectTimeouts.get(key);
            if (timeout) {
                clearTimeout(timeout);
            }
        }
        this._wsConnections.clear();
        this._reconnectTimeouts.clear();
        this._callbacks.clear();
        this.setStatus('disconnected');
    }

    // ========================================================================
    // ICandleProvider Implementation
    // ========================================================================

    /**
     * Fetch historical candles from Binance REST API
     */
    async getCandles(symbol: string, interval: CandleInterval, limit: number = 500): Promise<Candle[]> {
        const normalizedSymbol = this._normalizeSymbol(symbol);
        const binanceInterval = INTERVAL_MAP[interval] || '1h';

        const endpoint = this._config.market === 'futures'
            ? `/fapi/v1/klines?symbol=${normalizedSymbol}&interval=${binanceInterval}&limit=${limit}`
            : `/api/v3/klines?symbol=${normalizedSymbol}&interval=${binanceInterval}&limit=${limit}`;

        const url = `${this._restBaseUrl}${endpoint}`;

        this.log(`Fetching ${limit} ${interval} candles for ${normalizedSymbol}...`);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch candles: ${response.status}`);
        }

        const data = await response.json();

        const candles: Candle[] = data.map((kline: any[]) => ({
            time: Math.floor(kline[0] / 1000),  // Convert ms to seconds
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: parseFloat(kline[5])
        }));

        this.log(`Loaded ${candles.length} candles for ${normalizedSymbol}`);
        return candles;
    }

    /**
     * Subscribe to real-time candle updates via WebSocket
     */
    subscribeCandles(symbol: string, interval: CandleInterval, callback: CandleUpdateCallback): void {
        const normalizedSymbol = this._normalizeSymbol(symbol);
        const binanceInterval = INTERVAL_MAP[interval] || '1h';
        const streamKey = `${normalizedSymbol}:${binanceInterval}`;

        // Register callback
        if (!this._callbacks.has(streamKey)) {
            this._callbacks.set(streamKey, []);
        }
        this._callbacks.get(streamKey)!.push(callback);

        // If already connected, don't reconnect
        if (this._wsConnections.has(streamKey)) {
            return;
        }

        // Connect to WebSocket stream
        this._connectCandleStream(normalizedSymbol, binanceInterval, streamKey);
    }

    /**
     * Unsubscribe from candle updates
     */
    unsubscribeCandles(symbol: string, interval: CandleInterval): void {
        const normalizedSymbol = this._normalizeSymbol(symbol);
        const binanceInterval = INTERVAL_MAP[interval] || '1h';
        const streamKey = `${normalizedSymbol}:${binanceInterval}`;

        // Remove callbacks
        this._callbacks.delete(streamKey);

        // Close WebSocket
        const ws = this._wsConnections.get(streamKey);
        if (ws) {
            ws.close();
            this._wsConnections.delete(streamKey);
        }

        // Clear reconnect timeout
        const timeout = this._reconnectTimeouts.get(streamKey);
        if (timeout) {
            clearTimeout(timeout);
            this._reconnectTimeouts.delete(streamKey);
        }

        this.log(`Unsubscribed from ${streamKey}`);
    }

    // ========================================================================
    // WebSocket Management
    // ========================================================================

    private _connectCandleStream(symbol: string, interval: string, streamKey: string): void {
        // Stream name format: btcusdt@kline_1h
        const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
        const wsUrl = `${this._wsBaseUrl}/${streamName}`;

        this.log(`Connecting to candle stream: ${streamName}`);

        const ws = new WebSocket(wsUrl);
        this._wsConnections.set(streamKey, ws);

        ws.onopen = () => {
            this.log(`WebSocket connected for ${streamKey}`);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.e === 'kline') {
                    const kline = data.k;
                    const candle: Candle = {
                        time: Math.floor(kline.t / 1000),  // Open time in seconds
                        open: parseFloat(kline.o),
                        high: parseFloat(kline.h),
                        low: parseFloat(kline.l),
                        close: parseFloat(kline.c),
                        volume: parseFloat(kline.v)
                    };

                    // Notify subscribers
                    const callbacks = this._callbacks.get(streamKey);
                    if (callbacks) {
                        for (const cb of callbacks) {
                            try {
                                cb(candle);
                            } catch (e) {
                                this.logError('Error in candle callback:', e);
                            }
                        }
                    }
                }
            } catch (e) {
                this.logError('Failed to parse candle update:', e);
            }
        };

        ws.onclose = () => {
            this.log(`WebSocket closed for ${streamKey}`);
            this._wsConnections.delete(streamKey);

            // Auto-reconnect if still subscribed
            if (this._callbacks.has(streamKey)) {
                const timeout = setTimeout(() => {
                    if (this._callbacks.has(streamKey)) {
                        this._connectCandleStream(symbol, interval, streamKey);
                    }
                }, 5000);
                this._reconnectTimeouts.set(streamKey, timeout);
            }
        };

        ws.onerror = (error) => {
            this.logError(`WebSocket error for ${streamKey}:`, error);
        };
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private _normalizeSymbol(symbol: string): string {
        return symbol.toUpperCase().replace(/[\/\-_]/g, '');
    }

    /**
     * Get available intervals for Binance
     */
    static getSupportedIntervals(): CandleInterval[] {
        return Object.keys(INTERVAL_MAP) as CandleInterval[];
    }

    /**
     * Convert Binance kline array to Candle object
     */
    static parseKline(kline: any[]): Candle {
        return {
            time: Math.floor(kline[0] / 1000),
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: parseFloat(kline[5])
        };
    }
}
