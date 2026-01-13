import {
    ICandleProvider,
    Candle,
    CandleInterval,
    CandleUpdateCallback,
    ProviderStatus,
    StatusCallback,
    ProviderStatusEvent
} from '../types';

import { Delegate } from '../../helpers/delegate';

export class BistDataProvider implements ICandleProvider {
    readonly name = 'BIST (Delayed)';
    readonly marketType = 'stocks';

    private _status: ProviderStatus = 'disconnected';
    private _statusChanged = new Delegate<ProviderStatusEvent>();

    private _activeSymbol: string | null = null;
    private _activeInterval: CandleInterval | null = null;
    private _pollingTimer: any = null;
    private _callback: CandleUpdateCallback | null = null;

    private _baseUrl: string = 'http://localhost:8000/api/v1/market'; // Default Backend URL

    constructor(baseUrl?: string) {
        if (baseUrl) this._baseUrl = baseUrl;
    }

    get status(): ProviderStatus {
        return this._status;
    }

    onStatusChange(callback: StatusCallback): void {
        this._statusChanged.subscribe(callback);
    }

    async connect(): Promise<void> {
        this._setStatus('connecting', 'Connecting to BIST Data Feed...');
        // Simulate auth check or API handshake
        await new Promise(resolve => setTimeout(resolve, 500));
        this._setStatus('connected', 'Connected (Mock Mode)');
    }

    disconnect(): void {
        this._stopPolling();
        this._setStatus('disconnected');
    }

    async getCandles(symbol: string, interval: CandleInterval, limit: number = 200): Promise<Candle[]> {
        // Fetch from YOUR Backend
        // Endpoint: GET /history?symbol=THYAO&interval=15m&limit=200

        // Map interval to backend format if needed
        const tf = this._mapInterval(interval);

        try {
            const url = `${this._baseUrl}/history?symbol=${symbol}&interval=${tf}&limit=${limit}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.error('Backend Data Error:', response.statusText);
                return [];
            }

            const data = await response.json();

            // Expected Backend Format: 
            // [{ time: 123456789, open: 10, high: 11, low: 9, close: 10.5, volume: 100 }, ...]
            return data.map((d: any) => ({
                time: d.time, // Ensure timestamps are in ms (backend should send ms)
                open: Number(d.open),
                high: Number(d.high),
                low: Number(d.low),
                close: Number(d.close),
                volume: Number(d.volume)
            }));

        } catch (err) {
            console.error('Failed to fetch BIST history:', err);
            return [];
        }
    }

    subscribeCandles(symbol: string, interval: CandleInterval, callback: CandleUpdateCallback): void {
        this._activeSymbol = symbol;
        this._activeInterval = interval;
        this._callback = callback;

        this._startPolling();
    }

    unsubscribeCandles(symbol: string, interval: CandleInterval): void {
        if (this._activeSymbol === symbol) {
            this._stopPolling();
            this._activeSymbol = null;
            this._activeInterval = null;
            this._callback = null;
        }
    }

    // --- Private Methods ---

    private _setStatus(status: ProviderStatus, message?: string) {
        this._status = status;
        this._statusChanged.fire({
            status,
            message,
            timestamp: Date.now()
        });
    }

    private _startPolling() {
        if (this._pollingTimer) clearInterval(this._pollingTimer);

        // Poll every 1 minute for the LATEST candle
        this._pollingTimer = setInterval(async () => {
            if (!this._callback || !this._activeSymbol || !this._activeInterval) return;

            const tf = this._mapInterval(this._activeInterval);
            const url = `${this._baseUrl}/last-candle?symbol=${this._activeSymbol}&interval=${tf}`;

            try {
                const response = await fetch(url);
                if (response.ok) {
                    const d = await response.json();
                    if (d && d.time) {
                        this._callback({
                            time: d.time,
                            open: Number(d.open),
                            high: Number(d.high),
                            low: Number(d.low),
                            close: Number(d.close),
                            volume: Number(d.volume)
                        });
                    }
                }
            } catch (e) {
                // Silently fail on polling errors to avoid log spam
            }

        }, 60000);
    }

    private _stopPolling() {
        if (this._pollingTimer) {
            clearInterval(this._pollingTimer);
            this._pollingTimer = null;
        }
    }

    private _mapInterval(interval: string): string {
        // Backend might expect '15' instead of '15m' or vice versa
        // For now, pass through
        return interval;
    }

    // No-op for Orderbook (BIST doesn't provide level 2 data yet)
    subscribeOrderbook(symbol: string, callback: any): void { }
    unsubscribeOrderbook(symbol: string): void { }
}
