import { Size } from './size';
import { CanvasBinding } from './canvas-binding';

/**
 * Scope for rendering in media (CSS) coordinates
 */
export interface MediaCoordinatesScope {
    readonly context: CanvasRenderingContext2D;
    readonly mediaSize: Size;
}

/**
 * Scope for rendering in bitmap (physical pixel) coordinates
 */
export interface BitmapCoordinatesScope {
    readonly context: CanvasRenderingContext2D;
    readonly mediaSize: Size;
    readonly bitmapSize: Size;
    readonly horizontalPixelRatio: number;
    readonly verticalPixelRatio: number;
}

/**
 * Canvas rendering target with support for two coordinate systems:
 * - Media coordinates (CSS pixels)
 * - Bitmap coordinates (physical pixels)
 */
export class CanvasRenderingTarget2D {
    private readonly _context: CanvasRenderingContext2D;
    private readonly _mediaSize: Size;
    private readonly _bitmapSize: Size;

    constructor(
        context: CanvasRenderingContext2D,
        mediaSize: Size,
        bitmapSize: Size
    ) {
        if (mediaSize.width === 0 || mediaSize.height === 0) {
            throw new TypeError('Media size must have positive width and height');
        }
        if (bitmapSize.width === 0 || bitmapSize.height === 0) {
            throw new TypeError('Bitmap size must have positive width and height');
        }

        this._context = context;
        this._mediaSize = mediaSize;
        this._bitmapSize = bitmapSize;
    }

    /**
     * Use media (CSS) coordinate space for rendering
     * Automatically scales context to match device pixel ratio
     */
    useMediaCoordinateSpace<T>(fn: (scope: MediaCoordinatesScope) => T): T {
        try {
            this._context.save();
            this._context.setTransform(1, 0, 0, 1, 0, 0);
            this._context.scale(this._horizontalPixelRatio, this._verticalPixelRatio);

            return fn({
                context: this._context,
                mediaSize: this._mediaSize,
            });
        } finally {
            this._context.restore();
        }
    }

    /**
     * Use bitmap (physical pixel) coordinate space for rendering
     * Provides direct access to physical pixels for pixel-perfect drawing
     */
    useBitmapCoordinateSpace<T>(fn: (scope: BitmapCoordinatesScope) => T): T {
        try {
            this._context.save();
            this._context.setTransform(1, 0, 0, 1, 0, 0);

            return fn({
                context: this._context,
                mediaSize: this._mediaSize,
                bitmapSize: this._bitmapSize,
                horizontalPixelRatio: this._horizontalPixelRatio,
                verticalPixelRatio: this._verticalPixelRatio,
            });
        } finally {
            this._context.restore();
        }
    }

    private get _horizontalPixelRatio(): number {
        return this._bitmapSize.width / this._mediaSize.width;
    }

    private get _verticalPixelRatio(): number {
        return this._bitmapSize.height / this._mediaSize.height;
    }
}

/**
 * Creates a rendering target from a canvas binding
 */
export function createCanvasRenderingTarget2D(
    binding: CanvasBinding,
    contextOptions?: CanvasRenderingContext2DSettings
): CanvasRenderingTarget2D {
    const context = binding.canvasElement.getContext('2d', contextOptions);
    if (!context) {
        throw new Error('Could not get 2d context from canvas');
    }

    return new CanvasRenderingTarget2D(
        context,
        binding.canvasElementClientSize,
        binding.bitmapSize
    );
}

/**
 * Tries to create a rendering target, returns null on failure
 */
export function tryCreateCanvasRenderingTarget2D(
    binding: CanvasBinding,
    contextOptions?: CanvasRenderingContext2DSettings
): CanvasRenderingTarget2D | null {
    const { canvasElementClientSize, bitmapSize } = binding;

    if (canvasElementClientSize.width === 0 || canvasElementClientSize.height === 0) {
        return null;
    }
    if (bitmapSize.width === 0 || bitmapSize.height === 0) {
        return null;
    }

    const context = binding.canvasElement.getContext('2d', contextOptions);
    if (!context) {
        return null;
    }

    return new CanvasRenderingTarget2D(context, canvasElementClientSize, bitmapSize);
}
