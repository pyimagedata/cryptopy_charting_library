/**
 * Orderbook Heatmap Renderer - Enhanced CoinGlass Style
 * 
 * Renders orderbook depth with gradient bars, glow effects, and distinct bid/ask colors.
 * Bars extend from RIGHT edge towards LEFT (next to price axis).
 */

import { OrderbookData } from '../services/binance-orderbook-service';
import { PriceScale } from '../model/price-scale';

export interface HeatmapOptions {
    enabled: boolean;
    bidColor: string;       // Green for bids (buy orders)
    askColor: string;       // Red for asks (sell orders)
    highlightColor: string; // Yellow for very large orders
    maxWidth: number;       // Maximum bar width as percentage of chart (0-1)
    opacity: number;        // Base opacity
    highlightThreshold: number; // Volume threshold for highlighting
    numBuckets: number;     // Number of price buckets
    glowEnabled: boolean;   // Enable glow effect on large orders
}

const defaultOptions: HeatmapOptions = {
    enabled: true,
    bidColor: '#00d4aa',     // Cyan/teal for bids
    askColor: '#ff6b6b',     // Coral red for asks
    highlightColor: '#ffd93d', // Gold for huge orders
    maxWidth: 0.5,           // Max 50% of chart width
    opacity: 0.6,
    highlightThreshold: 10,  // 10x average = highlight
    numBuckets: 80,          // More buckets for finer detail
    glowEnabled: true,
};

interface PriceBucket {
    priceFrom: number;
    priceTo: number;
    bidVolume: number;
    askVolume: number;
}

/**
 * Orderbook Heatmap Renderer
 */
export class OrderbookHeatmapRenderer {
    private _options: HeatmapOptions;
    private _orderbook: OrderbookData | null = null;
    private _enabled: boolean = true;
    private _cachedBuckets: PriceBucket[] = [];
    private _cacheMinPrice: number = 0;
    private _cacheMaxPrice: number = 0;
    private _midPrice: number = 0;

    constructor(options: Partial<HeatmapOptions> = {}) {
        this._options = { ...defaultOptions, ...options };
    }

    get enabled(): boolean {
        return this._enabled;
    }

    set enabled(value: boolean) {
        this._enabled = value;
    }

    get options(): HeatmapOptions {
        return this._options;
    }

    setOptions(options: Partial<HeatmapOptions>): void {
        this._options = { ...this._options, ...options };
    }

    toggle(): boolean {
        this._enabled = !this._enabled;
        return this._enabled;
    }

    updateOrderbook(orderbook: OrderbookData): void {
        this._orderbook = orderbook;
        this._cachedBuckets = []; // Invalidate cache

        // Calculate mid price
        if (orderbook.bids.length > 0 && orderbook.asks.length > 0) {
            this._midPrice = (orderbook.bids[0].price + orderbook.asks[0].price) / 2;
        }
    }

    /**
     * Draw heatmap on chart canvas
     */
    drawOnChart(
        ctx: CanvasRenderingContext2D,
        priceScale: PriceScale,
        chartWidth: number,
        chartHeight: number,
        vpr: number
    ): void {
        if (!this._enabled || !this._orderbook) {
            return;
        }

        const visibleRange = priceScale.getVisiblePriceRange();
        if (!visibleRange) return;

        const { min: minPrice, max: maxPrice } = visibleRange;
        const priceRange = maxPrice - minPrice;
        if (priceRange <= 0) return;

        const chartWidthPx = chartWidth * vpr;
        const chartHeightPx = chartHeight * vpr;
        const maxBarWidth = chartWidthPx * this._options.maxWidth;
        const numBuckets = this._options.numBuckets;
        const priceStep = priceRange / numBuckets;

        // Check if we need to rebuild cache
        const cacheStale = Math.abs(this._cacheMinPrice - minPrice) > priceStep * 0.5 ||
            Math.abs(this._cacheMaxPrice - maxPrice) > priceStep * 0.5 ||
            this._cachedBuckets.length === 0;

        if (cacheStale) {
            this._rebuildBuckets(minPrice, maxPrice, numBuckets, priceStep);
        }

        if (this._cachedBuckets.length === 0) return;

        // Find max volume for normalization
        let maxBidVol = 0, maxAskVol = 0;
        let totalBidVol = 0, totalAskVol = 0;
        let bidCount = 0, askCount = 0;

        for (const bucket of this._cachedBuckets) {
            if (bucket.bidVolume > 0) {
                maxBidVol = Math.max(maxBidVol, bucket.bidVolume);
                totalBidVol += bucket.bidVolume;
                bidCount++;
            }
            if (bucket.askVolume > 0) {
                maxAskVol = Math.max(maxAskVol, bucket.askVolume);
                totalAskVol += bucket.askVolume;
                askCount++;
            }
        }

        const maxVol = Math.max(maxBidVol, maxAskVol);
        if (maxVol === 0) return;

        // Calculate percentiles for better normalization
        const allVolumes: number[] = [];
        for (const bucket of this._cachedBuckets) {
            if (bucket.bidVolume > 0) allVolumes.push(bucket.bidVolume);
            if (bucket.askVolume > 0) allVolumes.push(bucket.askVolume);
        }
        allVolumes.sort((a, b) => a - b);

        // Use 95th percentile as reference for normalization (ignore outliers)
        const p95Index = Math.floor(allVolumes.length * 0.95);
        const p95Vol = allVolumes[p95Index] || maxVol;

        const barHeight = Math.max(3 * vpr, (chartHeightPx / numBuckets) - 1);
        const rightMargin = 12 * vpr;

        ctx.save();

        // Draw each bucket
        for (const bucket of this._cachedBuckets) {
            const centerPrice = (bucket.priceFrom + bucket.priceTo) / 2;
            const y = priceScale.priceToCoordinate(centerPrice) as number * vpr;

            if (y < -barHeight || y > chartHeightPx + barHeight) continue;

            // Determine if this is bid or ask territory
            const isBid = centerPrice < this._midPrice;
            const volume = isBid ? bucket.bidVolume : bucket.askVolume;

            if (volume === 0) continue;

            // LOG-SCALE NORMALIZATION: works consistently across all coins
            // Formula: log(1 + volume) / log(1 + maxVolume)
            const logNorm = Math.log(1 + volume) / Math.log(1 + p95Vol);
            const normalizedVol = Math.min(1, logNorm); // cap at 1
            const barWidth = Math.max(3 * vpr, normalizedVol * maxBarWidth);

            // Check if huge order (above 90th percentile)
            const isHuge = volume > p95Vol;

            // Choose color
            let baseColor: string;
            let opacity: number;

            if (isHuge) {
                baseColor = this._options.highlightColor;
                opacity = 0.9;
            } else {
                baseColor = isBid ? this._options.bidColor : this._options.askColor;
                // Opacity also based on log scale for smoother gradient
                opacity = this._options.opacity * (0.3 + normalizedVol * 0.7);
            }

            const x = chartWidthPx - rightMargin - barWidth;

            // Draw glow for large orders
            if (this._options.glowEnabled && (isHuge || normalizedVol > 0.6)) {
                const glowSize = 4 * vpr;
                ctx.shadowColor = baseColor;
                ctx.shadowBlur = glowSize;
                ctx.fillStyle = this._colorWithOpacity(baseColor, opacity * 0.5);
                ctx.fillRect(x - glowSize, y - barHeight / 2 - glowSize / 2, barWidth + glowSize * 2, barHeight + glowSize);
                ctx.shadowBlur = 0;
            }

            // Draw main bar with gradient
            const gradient = ctx.createLinearGradient(x, 0, x + barWidth, 0);
            gradient.addColorStop(0, this._colorWithOpacity(baseColor, opacity * 0.3));
            gradient.addColorStop(0.5, this._colorWithOpacity(baseColor, opacity * 0.8));
            gradient.addColorStop(1, this._colorWithOpacity(baseColor, opacity));

            ctx.fillStyle = gradient;
            ctx.fillRect(x, y - barHeight / 2, barWidth, barHeight);

            // Add bright edge for depth effect
            ctx.fillStyle = this._colorWithOpacity(baseColor, opacity * 1.2);
            ctx.fillRect(x + barWidth - 2 * vpr, y - barHeight / 2, 2 * vpr, barHeight);
        }

        ctx.restore();
    }

    private _rebuildBuckets(minPrice: number, maxPrice: number, numBuckets: number, priceStep: number): void {
        this._cacheMinPrice = minPrice;
        this._cacheMaxPrice = maxPrice;
        this._cachedBuckets = [];

        if (!this._orderbook) return;

        // Create empty buckets
        for (let i = 0; i < numBuckets; i++) {
            this._cachedBuckets.push({
                priceFrom: minPrice + i * priceStep,
                priceTo: minPrice + (i + 1) * priceStep,
                bidVolume: 0,
                askVolume: 0
            });
        }

        // Aggregate bids
        for (const bid of this._orderbook.bids) {
            if (bid.price < minPrice || bid.price > maxPrice) continue;
            const bucketIndex = Math.floor((bid.price - minPrice) / priceStep);
            if (bucketIndex >= 0 && bucketIndex < numBuckets) {
                this._cachedBuckets[bucketIndex].bidVolume += bid.quantity * bid.price;
            }
        }

        // Aggregate asks
        for (const ask of this._orderbook.asks) {
            if (ask.price < minPrice || ask.price > maxPrice) continue;
            const bucketIndex = Math.floor((ask.price - minPrice) / priceStep);
            if (bucketIndex >= 0 && bucketIndex < numBuckets) {
                this._cachedBuckets[bucketIndex].askVolume += ask.quantity * ask.price;
            }
        }
    }

    private _colorWithOpacity(color: string, opacity: number): string {
        opacity = Math.min(1, Math.max(0, opacity));
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }
        return color;
    }

    getSummary(): { bidVolume: number; askVolume: number; ratio: number; levels: number } | null {
        if (!this._orderbook) return null;

        const bidVolume = this._orderbook.bids.reduce((sum, l) => sum + l.quantity * l.price, 0);
        const askVolume = this._orderbook.asks.reduce((sum, l) => sum + l.quantity * l.price, 0);
        const total = bidVolume + askVolume;

        return {
            bidVolume,
            askVolume,
            ratio: total > 0 ? bidVolume / total : 0.5,
            levels: this._orderbook.bids.length + this._orderbook.asks.length
        };
    }
}
