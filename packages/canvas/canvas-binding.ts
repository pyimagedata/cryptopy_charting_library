import { Disposable } from './disposable';
import { Size, size, equalSizes } from './size';
import { DevicePixelRatioObserver, createDevicePixelRatioObserver } from './device-pixel-ratio';

export type BitmapSizeChangedListener = (oldSize: Size, newSize: Size) => void;

/**
 * Canvas binding interface for HiDPI support
 */
export interface CanvasBinding extends Disposable {
    readonly canvasElement: HTMLCanvasElement;
    readonly canvasElementClientSize: Size;
    readonly bitmapSize: Size;

    resizeCanvasElement(clientSize: { width: number; height: number }): void;
    subscribeBitmapSizeChanged(listener: BitmapSizeChangedListener): void;
    unsubscribeBitmapSizeChanged(listener: BitmapSizeChangedListener): void;
}

/**
 * Binding options
 */
export interface BindingOptions {
    allowResizeObserver?: boolean;
}

/**
 * Main canvas binding implementation
 * Handles HiDPI rendering by managing canvas bitmap size
 */
class CanvasBindingImpl implements CanvasBinding {
    private _canvasElement: HTMLCanvasElement | null;
    private _canvasElementClientSize: Size;
    private _bitmapSizeChangedListeners: BitmapSizeChangedListener[] = [];

    private _devicePixelRatioObserver: DevicePixelRatioObserver | null = null;
    private _resizeObserver: ResizeObserver | null = null;
    private _allowResizeObserver: boolean;
    private _pendingBitmapSize: Size | null = null;

    constructor(canvasElement: HTMLCanvasElement, options?: BindingOptions) {
        this._canvasElement = canvasElement;
        this._canvasElementClientSize = size({
            width: canvasElement.clientWidth,
            height: canvasElement.clientHeight,
        });
        this._allowResizeObserver = options?.allowResizeObserver ?? true;

        this._initObserver();
    }

    get canvasElement(): HTMLCanvasElement {
        if (!this._canvasElement) {
            throw new Error('Binding is disposed');
        }
        return this._canvasElement;
    }

    get canvasElementClientSize(): Size {
        return this._canvasElementClientSize;
    }

    get bitmapSize(): Size {
        return size({
            width: this.canvasElement.width,
            height: this.canvasElement.height,
        });
    }

    resizeCanvasElement(clientSize: { width: number; height: number }): void {
        this._canvasElementClientSize = size(clientSize);
        this.canvasElement.style.width = `${clientSize.width}px`;
        this.canvasElement.style.height = `${clientSize.height}px`;
        this._updateBitmapSize();
    }

    subscribeBitmapSizeChanged(listener: BitmapSizeChangedListener): void {
        this._bitmapSizeChangedListeners.push(listener);
    }

    unsubscribeBitmapSizeChanged(listener: BitmapSizeChangedListener): void {
        this._bitmapSizeChangedListeners = this._bitmapSizeChangedListeners.filter(
            l => l !== listener
        );
    }

    dispose(): void {
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
        this._devicePixelRatioObserver?.dispose();
        this._devicePixelRatioObserver = null;
        this._bitmapSizeChangedListeners = [];
        this._canvasElement = null;
    }

    private _initObserver(): void {
        if (this._allowResizeObserver && this._supportsDevicePixelContentBox()) {
            this._initResizeObserver();
        } else {
            this._initDevicePixelRatioObserver();
        }
    }

    private _supportsDevicePixelContentBox(): boolean {
        // Check if ResizeObserver supports devicePixelContentBox
        try {
            return 'ResizeObserver' in window;
        } catch {
            return false;
        }
    }

    private _initDevicePixelRatioObserver(): void {
        if (!this._canvasElement) return;

        const win = this._canvasElement.ownerDocument?.defaultView;
        if (!win) return;

        this._devicePixelRatioObserver = createDevicePixelRatioObserver(win);
        this._devicePixelRatioObserver.subscribe(() => this._updateBitmapSize());
        this._updateBitmapSize();
    }

    private _initResizeObserver(): void {
        if (!this._canvasElement) return;

        this._resizeObserver = new ResizeObserver((entries) => {
            const entry = entries.find(e => e.target === this._canvasElement);
            if (!entry) return;

            // Try to use devicePixelContentBoxSize for pixel-perfect sizing
            const dpContentBox = entry.devicePixelContentBoxSize?.[0];
            if (dpContentBox) {
                this._suggestBitmapSize(size({
                    width: dpContentBox.inlineSize,
                    height: dpContentBox.blockSize,
                }));
            } else {
                // Fallback to calculated size
                this._updateBitmapSize();
            }
        });

        try {
            this._resizeObserver.observe(this._canvasElement, {
                box: 'device-pixel-content-box',
            });
        } catch {
            // Fallback if device-pixel-content-box is not supported
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
            this._initDevicePixelRatioObserver();
        }
    }

    private _updateBitmapSize(): void {
        if (!this._canvasElement) return;

        const win = this._canvasElement.ownerDocument?.defaultView;
        if (!win) return;

        const ratio = this._devicePixelRatioObserver?.value ?? win.devicePixelRatio ?? 1;
        const rect = this._canvasElement.getBoundingClientRect();

        const newSize = this._predictBitmapSize(rect, ratio);
        this._suggestBitmapSize(newSize);
    }

    private _predictBitmapSize(rect: DOMRect, ratio: number): Size {
        // Calculate bitmap size that aligns with physical pixels
        return size({
            width: Math.round(rect.left * ratio + rect.width * ratio) - Math.round(rect.left * ratio),
            height: Math.round(rect.top * ratio + rect.height * ratio) - Math.round(rect.top * ratio),
        });
    }

    private _suggestBitmapSize(newSize: Size): void {
        if (equalSizes(this.bitmapSize, newSize)) {
            return;
        }

        this._pendingBitmapSize = newSize;
        this._applyBitmapSize();
    }

    private _applyBitmapSize(): void {
        if (!this._pendingBitmapSize) return;

        const oldSize = this.bitmapSize;
        const newSize = this._pendingBitmapSize;
        this._pendingBitmapSize = null;

        this.canvasElement.width = newSize.width;
        this.canvasElement.height = newSize.height;

        this._bitmapSizeChangedListeners.forEach(listener => listener(oldSize, newSize));
    }
}

/**
 * Creates a canvas binding for HiDPI support
 */
export function bindCanvasElement(
    canvasElement: HTMLCanvasElement,
    options?: BindingOptions
): CanvasBinding {
    return new CanvasBindingImpl(canvasElement, options);
}
