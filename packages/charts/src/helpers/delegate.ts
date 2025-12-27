/**
 * Pub/Sub event delegate
 */
export class Delegate<T = void> {
    private _listeners: Array<(arg: T) => void> = [];

    /**
     * Subscribe to events
     */
    subscribe(callback: (arg: T) => void): void {
        this._listeners.push(callback);
    }

    /**
     * Unsubscribe from events
     */
    unsubscribe(callback: (arg: T) => void): void {
        this._listeners = this._listeners.filter(l => l !== callback);
    }

    /**
     * Unsubscribe all listeners
     */
    unsubscribeAll(): void {
        this._listeners = [];
    }

    /**
     * Fire event to all listeners
     */
    fire(arg: T): void {
        this._listeners.forEach(listener => listener(arg));
    }

    /**
     * Check if there are any listeners
     */
    hasListeners(): boolean {
        return this._listeners.length > 0;
    }

    /**
     * Cleanup
     */
    destroy(): void {
        this._listeners = [];
    }
}
