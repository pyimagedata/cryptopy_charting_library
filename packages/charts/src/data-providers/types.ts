/**
 * Data Provider Types and Interfaces
 * 
 * This module defines the common interfaces for all data providers,
 * whether they are for crypto (Binance, Hyperliquid) or stocks (dxFeed, Matriks).
 */

// ============================================================================
// Market Types
// ============================================================================

export type MarketType = 'crypto' | 'stocks' | 'forex' | 'futures' | 'spot';

// ============================================================================
// Orderbook Types
// ============================================================================

export interface OrderbookLevel {
    price: number;
    quantity: number;
}

export interface Orderbook {
    symbol: string;
    exchange?: string;
    lastUpdateId?: number;
    timestamp: number;
    bids: OrderbookLevel[];  // Sorted by price descending (highest first)
    asks: OrderbookLevel[];  // Sorted by price ascending (lowest first)
}

export type OrderbookUpdateCallback = (orderbook: Orderbook) => void;

// ============================================================================
// Candle/OHLCV Types
// ============================================================================

export interface Candle {
    time: number;       // Unix timestamp in seconds
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export type CandleInterval =
    | '1s' | '1m' | '3m' | '5m' | '15m' | '30m'
    | '1h' | '2h' | '4h' | '6h' | '8h' | '12h'
    | '1d' | '3d' | '1w' | '1M';

export type CandleUpdateCallback = (candle: Candle) => void;

// ============================================================================
// Trade Types (for real-time trade feed)
// ============================================================================

export interface Trade {
    id: string | number;
    symbol: string;
    price: number;
    quantity: number;
    side: 'buy' | 'sell';
    timestamp: number;
}

export type TradeUpdateCallback = (trade: Trade) => void;

// ============================================================================
// Liquidation Types (for crypto derivatives)
// ============================================================================

export interface Liquidation {
    symbol: string;
    side: 'long' | 'short';
    price: number;
    quantity: number;
    timestamp: number;
}

export type LiquidationCallback = (liquidation: Liquidation) => void;

// ============================================================================
// Open Interest Types (for derivatives markets)
// ============================================================================

export interface OpenInterest {
    symbol: string;
    openInterest: number;      // Total open interest in contracts or base currency
    openInterestValue: number; // Value in quote currency (e.g., USDT)
    timestamp: number;
}

export type OpenInterestCallback = (oi: OpenInterest) => void;

// ============================================================================
// Provider Status
// ============================================================================

export type ProviderStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ProviderStatusEvent {
    status: ProviderStatus;
    message?: string;
    timestamp: number;
}

export type StatusCallback = (event: ProviderStatusEvent) => void;

// ============================================================================
// Provider Interfaces
// ============================================================================

/**
 * Base interface for all data providers
 */
export interface IDataProvider {
    readonly name: string;
    readonly marketType: MarketType;
    readonly status: ProviderStatus;

    connect(): Promise<void>;
    disconnect(): void;

    onStatusChange(callback: StatusCallback): void;
}

/**
 * Interface for providers that supply orderbook/depth data
 */
export interface IOrderbookProvider extends IDataProvider {
    getOrderbook(symbol: string, limit?: number): Promise<Orderbook>;
    subscribeOrderbook(symbol: string, callback: OrderbookUpdateCallback): void;
    unsubscribeOrderbook(symbol: string): void;
}

/**
 * Interface for providers that supply candle/OHLCV data
 */
export interface ICandleProvider extends IDataProvider {
    getCandles(symbol: string, interval: CandleInterval, limit?: number): Promise<Candle[]>;
    subscribeCandles(symbol: string, interval: CandleInterval, callback: CandleUpdateCallback): void;
    unsubscribeCandles(symbol: string, interval: CandleInterval): void;
}

/**
 * Interface for providers that supply real-time trade data
 */
export interface ITradeProvider extends IDataProvider {
    subscribeTrades(symbol: string, callback: TradeUpdateCallback): void;
    unsubscribeTrades(symbol: string): void;
}

/**
 * Interface for crypto derivatives providers (liquidations, funding, OI)
 */
export interface IDerivativesProvider extends IDataProvider {
    subscribeLiquidations(symbol: string, callback: LiquidationCallback): void;
    unsubscribeLiquidations(symbol: string): void;

    getOpenInterest(symbol: string): Promise<OpenInterest>;
    subscribeOpenInterest(symbol: string, callback: OpenInterestCallback): void;
    unsubscribeOpenInterest(symbol: string): void;
}

/**
 * Combined provider interface for full-featured data sources
 */
export interface IFullDataProvider extends
    IOrderbookProvider,
    ICandleProvider,
    ITradeProvider { }
