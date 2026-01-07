/**
 * Data Providers Module
 * 
 * This module provides a unified interface for fetching market data from
 * various sources including cryptocurrency exchanges and traditional stock markets.
 * 
 * Usage:
 * ```typescript
 * import { BinanceOrderbookProvider, DxFeedProvider } from '@charting/charts/data-providers';
 * 
 * // For crypto
 * const binance = new BinanceOrderbookProvider({ market: 'futures' });
 * await binance.connect();
 * binance.subscribeOrderbook('BTCUSDT', (ob) => console.log(ob));
 * 
 * // For stocks (requires API key)
 * const dxfeed = new DxFeedProvider({ apiKey: 'your-key' });
 * await dxfeed.connect();
 * dxfeed.subscribeOrderbook('THYAO:ISE', (ob) => console.log(ob));
 * ```
 */

// Types and Interfaces
export * from './types';

// Base Provider
export { BaseDataProvider } from './base-provider';

// Crypto Providers
export * from './crypto';

// Stock Providers
export * from './stocks';
