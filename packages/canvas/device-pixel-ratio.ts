import { Disposable } from './disposable';

/**
 * Observer for device pixel ratio changes
 * Listens for resolution changes using MediaQueryList
 */
export class DevicePixelRatioObserver implements Disposable {
    private _window: Window | null;
    private _mediaQueryList: MediaQueryList | null = null;
    private _listeners: Array<(ratio: number) => void> = [];

    constructor(win: Window) {
        this._window = win;
        this._installListener();
    }

    /**
     * Current device pixel ratio value
     */
    get value(): number {
        return this._window?.devicePixelRatio ?? 1;
    }

    /**
     * Subscribe to device pixel ratio changes
     */
    subscribe(callback: (ratio: number) => void): () => void {
        this._listeners.push(callback);
        return () => {
            this._listeners = this._listeners.filter(l => l !== callback);
        };
    }

    dispose(): void {
        this._uninstallListener();
        this._listeners = [];
        this._window = null;
    }

    private _installListener(): void {
        if (!this._window) return;

        const dpr = this._window.devicePixelRatio;
        this._mediaQueryList = this._window.matchMedia(
            `all and (resolution: ${dpr}dppx)`
        );
        this._mediaQueryList.addEventListener('change', this._handleChange);
    }

    private _uninstallListener(): void {
        if (this._mediaQueryList) {
            this._mediaQueryList.removeEventListener('change', this._handleChange);
            this._mediaQueryList = null;
        }
    }

    private _handleChange = (): void => {
        const ratio = this.value;
        this._listeners.forEach(listener => listener(ratio));
        // Reinstall listener for new DPR value
        this._uninstallListener();
        this._installListener();
    };
}

/**
 * Creates a device pixel ratio observer
 */
export function createDevicePixelRatioObserver(win: Window): DevicePixelRatioObserver {
    return new DevicePixelRatioObserver(win);
}
