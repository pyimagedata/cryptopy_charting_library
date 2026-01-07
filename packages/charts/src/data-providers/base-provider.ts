/**
 * Base Data Provider
 * 
 * Abstract base class that implements common functionality for all data providers.
 * Extend this class when creating new providers for different exchanges/data sources.
 */

import {
    IDataProvider,
    MarketType,
    ProviderStatus,
    ProviderStatusEvent,
    StatusCallback
} from './types';

export abstract class BaseDataProvider implements IDataProvider {
    abstract readonly name: string;
    abstract readonly marketType: MarketType;

    protected _status: ProviderStatus = 'disconnected';
    protected _statusCallbacks: StatusCallback[] = [];
    protected _reconnectAttempts = 0;
    protected _maxReconnectAttempts = 5;
    protected _reconnectDelayMs = 1000;

    get status(): ProviderStatus {
        return this._status;
    }

    /**
     * Connect to the data source
     */
    abstract connect(): Promise<void>;

    /**
     * Disconnect from the data source
     */
    abstract disconnect(): void;

    /**
     * Register a callback for status changes
     */
    onStatusChange(callback: StatusCallback): void {
        this._statusCallbacks.push(callback);
    }

    /**
     * Remove a status callback
     */
    offStatusChange(callback: StatusCallback): void {
        const index = this._statusCallbacks.indexOf(callback);
        if (index > -1) {
            this._statusCallbacks.splice(index, 1);
        }
    }

    /**
     * Update the provider status and notify listeners
     */
    protected setStatus(status: ProviderStatus, message?: string): void {
        this._status = status;
        const event: ProviderStatusEvent = {
            status,
            message,
            timestamp: Date.now()
        };

        for (const callback of this._statusCallbacks) {
            try {
                callback(event);
            } catch (e) {
                console.error(`[${this.name}] Error in status callback:`, e);
            }
        }
    }

    /**
     * Attempt to reconnect with exponential backoff
     */
    protected async attemptReconnect(): Promise<boolean> {
        if (this._reconnectAttempts >= this._maxReconnectAttempts) {
            this.setStatus('error', `Max reconnection attempts (${this._maxReconnectAttempts}) reached`);
            return false;
        }

        this._reconnectAttempts++;
        const delay = this._reconnectDelayMs * Math.pow(2, this._reconnectAttempts - 1);

        console.log(`[${this.name}] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts})`);

        await this.sleep(delay);

        try {
            await this.connect();
            this._reconnectAttempts = 0; // Reset on successful connection
            return true;
        } catch (e) {
            console.error(`[${this.name}] Reconnection failed:`, e);
            return this.attemptReconnect();
        }
    }

    /**
     * Reset reconnection counter
     */
    protected resetReconnectAttempts(): void {
        this._reconnectAttempts = 0;
    }

    /**
     * Sleep utility
     */
    protected sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Log with provider name prefix
     */
    protected log(message: string, ...args: any[]): void {
        console.log(`[${this.name}]`, message, ...args);
    }

    /**
     * Error log with provider name prefix
     */
    protected logError(message: string, ...args: any[]): void {
        console.error(`[${this.name}]`, message, ...args);
    }
}
