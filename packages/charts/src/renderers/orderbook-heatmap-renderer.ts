/**
 * Orderbook Heatmap Renderer - KDE with Liquidity Age Analysis
 * 
 * Features:
 * 1. KDE Splatting: Smooth density visualization.
 * 2. Order Aging: Tracks how long orders stay in the book.
 *    - New orders (Flash/Spoof?) -> Bright/Neon colors.
 *    - Old orders (Stable/Iceberg?) -> Deep/Solid colors.
 */

import { OrderbookData } from '../services/binance-orderbook-service';
import { PriceScale } from '../model/price-scale';

export interface HeatmapOptions {
    enabled: boolean;
    bidColor: string;       // Color for bid density (Buy walls)
    askColor: string;       // Color for ask density (Sell walls)
    highlightColor: string; // Color for peak density (Liquidity magnets)
    stableWallColor: string;// Color for STABLE peak density (Real Walls)
    maxWidth: number;       // Max width of the heatmap as % of chart width (0-1)
    opacity: number;        // Base opacity of the heatmap
    bandwidth: number;      // KDE Bandwidth (Smoothing factor) in pixels.
    threshold: number;      // Noise floor (0-1).
    maxDensity: 'local' | 'global';

    // Stability Analysis Options
    useStabilityColoring: boolean; // Enable age-based coloring
    stableAgeSeconds: number;      // Time in seconds to reach "Full Stability" color
}

const defaultOptions: HeatmapOptions = {
    enabled: true,
    bidColor: '#00d4aa',      // Cyan
    askColor: '#ff6b6b',      // Red
    highlightColor: '#ffd93d',// Gold/Yellow
    stableWallColor: '#d500f9', // Neon Purple
    maxWidth: 0.2,            // 20% width
    opacity: 0.8,
    bandwidth: 4,
    threshold: 0.05,
    maxDensity: 'global',

    useStabilityColoring: true,
    stableAgeSeconds: 30,     // 30 seconds to be considered "Stable"
};

export class OrderbookHeatmapRenderer {
    private _options: HeatmapOptions;
    private _orderbook: OrderbookData | null = null;

    // Caching for Global Max Density
    private _globalMaxDensity: number = 0;

    // Stability Tracking: Map<PriceKey, Timestamp>
    private _orderAgeMap: Map<string, number> = new Map();
    private _lastUpdateTime: number = Date.now();
    private _lastMidPrice: number = 0; // For symbol change detection

    private _maxTrackedLevels = 10000;

    // Buffer Cache (Memory Optimization)
    private _bidBuffer: Float32Array | null = null;
    private _askBuffer: Float32Array | null = null;
    private _bidAgeBuffer: Float32Array | null = null;
    private _askAgeBuffer: Float32Array | null = null;
    private _bufferSize: number = 0;

    constructor(options: Partial<HeatmapOptions> = {}) {
        this._options = { ...defaultOptions, ...options };
    }

    get enabled(): boolean { return this._options.enabled; }
    set enabled(value: boolean) { this._options.enabled = value; }

    toggle(): boolean {
        this._options.enabled = !this._options.enabled;
        return this._options.enabled;
    }

    setOptions(options: Partial<HeatmapOptions>): void {
        this._options = { ...this._options, ...options };
    }

    updateOrderbook(orderbook: OrderbookData): void {
        const now = Date.now();
        this._orderbook = orderbook;

        // 0. Detect Symbol Change (Heuristic)
        if (orderbook.bids.length > 0 && orderbook.asks.length > 0) {
            const bestBid = orderbook.bids[0].price;
            const bestAsk = orderbook.asks[0].price;
            const midPrice = (bestBid + bestAsk) / 2;

            if (this._lastMidPrice > 0) {
                const change = Math.abs(midPrice - this._lastMidPrice) / this._lastMidPrice;
                if (change > 0.20) {
                    this._globalMaxDensity = 0;
                    this._orderAgeMap.clear();
                    this._lastMidPrice = midPrice;
                }
            } else {
                this._lastMidPrice = midPrice;
            }
            this._lastMidPrice = midPrice;
        }

        // 1. Update Age Map
        const currentKeys = new Set<string>();

        // Helper to process levels
        const processLevel = (price: number) => {
            const key = price.toFixed(8);
            currentKeys.add(key);

            if (!this._orderAgeMap.has(key)) {
                this._orderAgeMap.set(key, now);
            }
        };

        orderbook.bids.forEach(b => processLevel(b.price));
        orderbook.asks.forEach(a => processLevel(a.price));

        // 2. Cleanup Old/Removed Levels
        if (this._orderAgeMap.size > this._maxTrackedLevels) {
            this._orderAgeMap.clear();
        } else {
            for (const key of this._orderAgeMap.keys()) {
                if (!currentKeys.has(key)) {
                    this._orderAgeMap.delete(key);
                }
            }
        }

        this._lastUpdateTime = now;

        // 3. Recalculate Global Max Density (Approx)
        let maxVol = 0;
        for (const b of this._orderbook.bids) maxVol = Math.max(maxVol, b.price * b.quantity);
        for (const a of this._orderbook.asks) maxVol = Math.max(maxVol, a.price * a.quantity);

        if (maxVol > this._globalMaxDensity) {
            this._globalMaxDensity = maxVol;
        } else {
            // Decay global max
            this._globalMaxDensity = this._globalMaxDensity * 0.999 + maxVol * 0.001;
        }
    }

    drawOnChart(
        ctx: CanvasRenderingContext2D,
        priceScale: PriceScale,
        chartWidth: number,
        chartHeight: number,
        vpr: number
    ): void {
        if (!this._options.enabled || !this._orderbook) return;

        const visibleRange = priceScale.getVisiblePriceRange();
        if (!visibleRange) return;

        const chartHeightPx = chartHeight * vpr;
        const chartWidthPx = chartWidth * vpr;
        const width = chartWidthPx * this._options.maxWidth;

        const bufferSize = Math.ceil(chartHeightPx);

        // --- Memory Optimization: Reuse Buffers ---
        if (bufferSize !== this._bufferSize || !this._bidBuffer) {
            this._bufferSize = bufferSize;
            this._bidBuffer = new Float32Array(bufferSize);
            this._askBuffer = new Float32Array(bufferSize);
            this._bidAgeBuffer = new Float32Array(bufferSize);
            this._askAgeBuffer = new Float32Array(bufferSize);
        } else {
            // Zero out existing buffers
            this._bidBuffer!.fill(0);
            this._askBuffer!.fill(0);
            this._bidAgeBuffer!.fill(0);
            this._askAgeBuffer!.fill(0);
        }

        if (!this._bidBuffer || !this._askBuffer || !this._bidAgeBuffer || !this._askAgeBuffer) return;

        // References for speed
        const bidBuffer = this._bidBuffer;
        const askBuffer = this._askBuffer;
        const bidAgeBuffer = this._bidAgeBuffer;
        const askAgeBuffer = this._askAgeBuffer;

        const bandwidth = this._options.bandwidth * vpr;
        const kernelRadius = Math.ceil(bandwidth * 3);
        const now = this._lastUpdateTime;

        // Helper: Add Gaussian splat with Age
        const splat = (yCenter: number, volume: number, price: number, densityBuf: Float32Array, ageBuf: Float32Array) => {
            const startY = Math.max(0, Math.floor(yCenter - kernelRadius));
            const endY = Math.min(bufferSize - 1, Math.ceil(yCenter + kernelRadius));

            const sigma2 = bandwidth * bandwidth;

            const key = price.toFixed(8);
            const birthTime = this._orderAgeMap.get(key) || now;
            const ageSeconds = (now - birthTime) / 1000;

            for (let y = startY; y <= endY; y++) {
                const dist = y - yCenter;
                const weight = Math.exp(-0.5 * (dist * dist) / sigma2);

                const contribution = volume * weight;
                densityBuf[y] += contribution;
                ageBuf[y] += ageSeconds * contribution;
            }
        };

        for (const bid of this._orderbook.bids) {
            const y = priceScale.priceToCoordinate(bid.price);
            if (y === null) continue;
            const yPx = y * vpr;
            if (yPx < -kernelRadius || yPx > chartHeightPx + kernelRadius) continue;
            splat(yPx, bid.price * bid.quantity, bid.price, bidBuffer, bidAgeBuffer);
        }

        for (const ask of this._orderbook.asks) {
            const y = priceScale.priceToCoordinate(ask.price);
            if (y === null) continue;
            const yPx = y * vpr;
            if (yPx < -kernelRadius || yPx > chartHeightPx + kernelRadius) continue;
            splat(yPx, ask.price * ask.quantity, ask.price, askBuffer, askAgeBuffer);
        }

        // --- RENDER ---
        let maxDensity = this._options.maxDensity === 'local' ? 0 : this._globalMaxDensity;
        if (this._options.maxDensity === 'local') {
            for (let i = 0; i < bufferSize; i++) maxDensity = Math.max(maxDensity, bidBuffer[i], askBuffer[i]);
        }

        if (maxDensity <= 0) maxDensity = 1;

        ctx.save();

        for (let y = 0; y < bufferSize; y++) {
            const bidD = bidBuffer[y];
            const askD = askBuffer[y];

            // Noise Filter
            if (bidD < maxDensity * this._options.threshold && askD < maxDensity * this._options.threshold) continue;

            const isBid = bidD > askD;
            const density = isBid ? bidD : askD;
            const ageSum = isBid ? bidAgeBuffer[y] : askAgeBuffer[y];

            // Average Age at this pixel
            const avgAge = density > 0 ? ageSum / density : 0;

            // Normalize Density
            const normalized = Math.min(1, density / maxDensity);
            const visualIntensity = Math.sqrt(normalized);

            // 1. Base Color Selection
            let color: string;

            if (visualIntensity > 0.95) {
                // Peak Density -> Yellow/Gold
                color = this._options.highlightColor;
            } else {
                // Normal Density -> Bid/Ask Color
                color = isBid ? this._options.bidColor : this._options.askColor;
            }

            // 2. Stability Overlay (Apply to ANY color)
            if (this._options.useStabilityColoring) {
                const stability = Math.min(1, avgAge / this._options.stableAgeSeconds);

                // Logic:
                // Moderate+ Density (>80% visual, ~64% raw) + Stable (>70%) -> PURPLE (Real Wall)
                // 0.5 was too low (too much purple). 0.8 is a better balance.

                if (visualIntensity > 0.8 && stability > 0.7) {
                    color = this._options.stableWallColor;
                }
                // If Fresh (< 30% stable time), mix with white to create "Neon/Bright" effect
                else if (stability < 0.3) {
                    color = this._getStabilityColor(color, stability);
                }
            }

            const barWidth = width * visualIntensity;
            const alpha = this._options.opacity * (0.2 + 0.8 * visualIntensity);

            ctx.fillStyle = this._colorWithOpacity(color, alpha);
            ctx.fillRect(chartWidthPx - 12 * vpr - barWidth, y, barWidth, 1);
        }

        ctx.restore();
    }

    private _getStabilityColor(baseColor: string, stability: number): string {
        if (!baseColor.startsWith('#')) return baseColor;

        if (stability < 0.3) {
            const mix = (0.3 - stability) * 2;
            return this._mixColors(baseColor, '#ffffff', mix);
        }
        return baseColor;
    }

    private _mixColors(c1: string, c2: string, ratio: number): string {
        const r1 = parseInt(c1.slice(1, 3), 16);
        const g1 = parseInt(c1.slice(3, 5), 16);
        const b1 = parseInt(c1.slice(5, 7), 16);

        const r2 = parseInt(c2.slice(1, 3), 16);
        const g2 = parseInt(c2.slice(3, 5), 16);
        const b2 = parseInt(c2.slice(5, 7), 16);

        const r = Math.round(r1 * (1 - ratio) + r2 * ratio);
        const g = Math.round(g1 * (1 - ratio) + g2 * ratio);
        const b = Math.round(b1 * (1 - ratio) + b2 * ratio);

        return `rgba(${r}, ${g}, ${b}, 1)`;
    }

    private _colorWithOpacity(color: string, opacity: number): string {
        opacity = Math.min(1, Math.max(0, opacity));

        if (color.startsWith('rgba')) {
            return color.replace(', 1)', `, ${opacity})`).replace(',1)', `, ${opacity})`);
        }

        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }
        return color;
    }

    getSummary() {
        if (!this._orderbook) return null;
        return {
            levels: this._orderbook.bids.length + this._orderbook.asks.length
        };
    }
}
