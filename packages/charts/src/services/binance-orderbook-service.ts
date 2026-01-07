/**
 * Binance Orderbook Service
 * 
 * Fetches and maintains real-time orderbook data from Binance via WebSocket.
 * Provides depth data for heatmap visualization.
 */

import { Delegate } from '../helpers/delegate';

export interface OrderbookLevel {
    price: number;
    quantity: number;
}

export interface OrderbookData {
    bids: OrderbookLevel[];  // Buy orders (sorted high to low)
    asks: OrderbookLevel[];  // Sell orders (sorted low to high)
    lastUpdateId: number;
    symbol: string;
}

export interface DepthUpdate {
    bids: OrderbookLevel[];
    asks: OrderbookLevel[];
}

/**
 * Binance Orderbook Service
 */
export class BinanceOrderbookService {
    private _symbol: string = '';
    private _ws: WebSocket | null = null;
    private _orderbook: OrderbookData | null = null;
    private _isConnected: boolean = false;
    private _reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    private _maxLevels: number = 1000;  // Fetch more levels

    // Events
    public readonly onUpdate = new Delegate<OrderbookData>();
    public readonly onConnect = new Delegate<void>();
    public readonly onDisconnect = new Delegate<void>();

    constructor(maxLevels: number = 1000) {
        this._maxLevels = maxLevels;
    }

    get isConnected(): boolean {
        return this._isConnected;
    }

    get orderbook(): OrderbookData | null {
        return this._orderbook;
    }

    get symbol(): string {
        return this._symbol;
    }

    /**
     * Connect to orderbook stream for a symbol
     */
    async connect(symbol: string): Promise<void> {
        if (this._symbol === symbol && this._isConnected) {
            return;
        }

        // Disconnect from previous
        this.disconnect();

        this._symbol = symbol.toLowerCase().replace('/', '');
        console.log(`📚 Connecting to orderbook for ${this._symbol}...`);

        try {
            // First, fetch snapshot via REST
            await this._fetchSnapshot();

            // Then connect to WebSocket for updates
            this._connectWebSocket();
        } catch (error) {
            console.error('Failed to connect to orderbook:', error);
        }
    }

    /**
     * Disconnect from orderbook stream
     */
    disconnect(): void {
        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
        if (this._reconnectTimeout) {
            clearTimeout(this._reconnectTimeout);
            this._reconnectTimeout = null;
        }
        this._isConnected = false;
        this._orderbook = null;
    }

    /**
     * Fetch initial orderbook snapshot - get ALL available levels
     */
    private async _fetchSnapshot(): Promise<void> {
        // Binance allows up to 5000 levels
        const limit = Math.min(this._maxLevels, 5000);
        const url = `https://api.binance.com/api/v3/depth?symbol=${this._symbol.toUpperCase()}&limit=${limit}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch orderbook: ${response.status}`);
        }

        const data = await response.json();

        this._orderbook = {
            symbol: this._symbol,
            lastUpdateId: data.lastUpdateId,
            bids: data.bids.map((b: string[]) => ({
                price: parseFloat(b[0]),
                quantity: parseFloat(b[1])
            })),
            asks: data.asks.map((a: string[]) => ({
                price: parseFloat(a[0]),
                quantity: parseFloat(a[1])
            }))
        };

        console.log(`📚 Orderbook snapshot loaded: ${this._orderbook.bids.length} bids, ${this._orderbook.asks.length} asks`);

        // Fire initial update
        this.onUpdate.fire(this._orderbook);
    }

    /**
     * Connect to WebSocket for real-time updates
     */
    private _connectWebSocket(): void {
        // Use depth20 for faster updates (top 20 levels only for speed)
        // Full depth updates are too slow
        const wsUrl = `wss://stream.binance.com:9443/ws/${this._symbol}@depth@100ms`;

        this._ws = new WebSocket(wsUrl);

        this._ws.onopen = () => {
            console.log(`📚 WebSocket connected for ${this._symbol}`);
            this._isConnected = true;
            this.onConnect.fire();
        };

        this._ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this._processUpdate(data);
            } catch (error) {
                console.warn('Failed to process orderbook update:', error);
            }
        };

        this._ws.onclose = () => {
            console.log(`📚 WebSocket disconnected for ${this._symbol}`);
            this._isConnected = false;
            this.onDisconnect.fire();

            // Auto-reconnect after 5 seconds
            this._reconnectTimeout = setTimeout(() => {
                if (this._symbol) {
                    this.connect(this._symbol);
                }
            }, 5000);
        };

        this._ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    /**
     * Process depth update from WebSocket
     */
    private _processUpdate(data: any): void {
        if (!this._orderbook) return;

        // Apply bid updates
        for (const [priceStr, qtyStr] of data.b || []) {
            const price = parseFloat(priceStr);
            const quantity = parseFloat(qtyStr);
            this._updateLevel(this._orderbook.bids, price, quantity);
        }

        // Apply ask updates
        for (const [priceStr, qtyStr] of data.a || []) {
            const price = parseFloat(priceStr);
            const quantity = parseFloat(qtyStr);
            this._updateLevel(this._orderbook.asks, price, quantity);
        }

        // Sort and trim
        this._orderbook.bids.sort((a, b) => b.price - a.price);
        this._orderbook.asks.sort((a, b) => a.price - b.price);

        // Keep more levels
        if (this._orderbook.bids.length > this._maxLevels) {
            this._orderbook.bids = this._orderbook.bids.slice(0, this._maxLevels);
        }
        if (this._orderbook.asks.length > this._maxLevels) {
            this._orderbook.asks = this._orderbook.asks.slice(0, this._maxLevels);
        }

        this._orderbook.lastUpdateId = data.u || this._orderbook.lastUpdateId;

        // Fire update event
        this.onUpdate.fire(this._orderbook);
    }

    /**
     * Update a single level in bids or asks
     */
    private _updateLevel(levels: OrderbookLevel[], price: number, quantity: number): void {
        const index = levels.findIndex(l => l.price === price);

        if (quantity === 0) {
            // Remove level
            if (index !== -1) {
                levels.splice(index, 1);
            }
        } else if (index !== -1) {
            // Update existing level
            levels[index].quantity = quantity;
        } else {
            // Add new level
            levels.push({ price, quantity });
        }
    }

    /**
     * Get total bid/ask volume
     */
    getTotalVolume(): { bidVolume: number; askVolume: number; ratio: number } {
        if (!this._orderbook) {
            return { bidVolume: 0, askVolume: 0, ratio: 0.5 };
        }

        const bidVolume = this._orderbook.bids.reduce((sum, l) => sum + l.quantity * l.price, 0);
        const askVolume = this._orderbook.asks.reduce((sum, l) => sum + l.quantity * l.price, 0);
        const total = bidVolume + askVolume;
        const ratio = total > 0 ? bidVolume / total : 0.5;

        return { bidVolume, askVolume, ratio };
    }
}
