import { Coordinate, TimePointIndex, coordinate, timePointIndex } from './coordinate';
import { Delegate } from '../helpers/delegate';
import { clamp } from '../helpers/math';

/**
 * Time scale options
 */
export interface TimeScaleOptions {
    /** Right offset in bars (gap at right edge) */
    rightOffset: number;
    /** Bar spacing in pixels */
    barSpacing: number;
    /** Minimum bar spacing */
    minBarSpacing: number;
    /** Maximum bar spacing (0 = no limit) */
    maxBarSpacing: number;
    /** Fix left edge (prevent scrolling past first bar) */
    fixLeftEdge: boolean;
    /** Fix right edge (prevent scrolling past last bar) */
    fixRightEdge: boolean;
}

/**
 * Default time scale options
 */
export const defaultTimeScaleOptions: TimeScaleOptions = {
    rightOffset: 5,
    barSpacing: 8,
    minBarSpacing: 2,
    maxBarSpacing: 50,
    fixLeftEdge: false,
    fixRightEdge: false,
};

/**
 * Visible range of bar indices
 */
export interface VisibleRange {
    from: TimePointIndex;
    to: TimePointIndex;
}

/**
 * Time scale model - manages horizontal (time) axis
 */
export class TimeScale {
    private _options: TimeScaleOptions;
    private _width: number = 0;
    private _barSpacing: number;
    private _rightOffset: number;
    private _scrollOffset: number = 0;
    private _baseIndex: TimePointIndex | null = null;
    private _pointsCount: number = 0;

    private readonly _sizeChanged = new Delegate<void>();
    private readonly _visibleRangeChanged = new Delegate<VisibleRange>();

    constructor(options: Partial<TimeScaleOptions> = {}) {
        this._options = { ...defaultTimeScaleOptions, ...options };
        this._barSpacing = this._options.barSpacing;
        this._rightOffset = this._options.rightOffset;
    }

    // --- Getters ---

    get width(): number {
        return this._width;
    }

    get barSpacing(): number {
        return this._barSpacing;
    }

    get rightOffset(): number {
        return this._rightOffset;
    }

    get pointsCount(): number {
        return this._pointsCount;
    }

    get options(): Readonly<TimeScaleOptions> {
        return this._options;
    }

    // --- Events ---

    get sizeChanged(): Delegate<void> {
        return this._sizeChanged;
    }

    get visibleRangeChanged(): Delegate<VisibleRange> {
        return this._visibleRangeChanged;
    }

    // --- Configuration ---

    setWidth(width: number): void {
        if (this._width === width) return;
        this._width = width;
        this._sizeChanged.fire();
    }

    setBarSpacing(spacing: number): void {
        const newSpacing = clamp(
            spacing,
            this._options.minBarSpacing,
            this._options.maxBarSpacing || Infinity
        );
        if (this._barSpacing === newSpacing) return;
        this._barSpacing = newSpacing;
    }

    setRightOffset(offset: number): void {
        this._rightOffset = offset;
    }

    setPointsCount(count: number): void {
        this._pointsCount = count;
        this._baseIndex = count > 0 ? timePointIndex(count - 1) : null;
    }

    // --- Coordinate conversions ---

    /**
     * Convert bar index to X coordinate
     * Uses TradingView Lightweight Charts formula
     */
    indexToCoordinate(index: TimePointIndex): Coordinate {
        if (this._baseIndex === null) {
            return coordinate(0);
        }

        const deltaFromRight = this._baseIndex + this._rightOffset - this._scrollOffset - index;
        const x = this._width - (deltaFromRight + 0.5) * this._barSpacing - 1;
        return coordinate(x);
    }

    /**
     * Convert X coordinate to bar index
     */
    coordinateToIndex(x: Coordinate): TimePointIndex {
        if (this._baseIndex === null) {
            return timePointIndex(0);
        }

        const deltaFromRight = (this._width - x - 1) / this._barSpacing - 0.5;
        const index = this._baseIndex + this._rightOffset - this._scrollOffset - deltaFromRight;
        return timePointIndex(Math.round(index));
    }

    // --- Visible range ---

    /**
     * Get visible bar range
     */
    visibleRange(): VisibleRange | null {
        if (this._baseIndex === null || this._width === 0) {
            return null;
        }

        const barsCount = Math.ceil(this._width / this._barSpacing);
        const lastVisibleIndex = this._baseIndex + this._rightOffset - this._scrollOffset;
        const firstVisibleIndex = lastVisibleIndex - barsCount;

        return {
            from: timePointIndex(Math.max(0, Math.floor(firstVisibleIndex))),
            to: timePointIndex(Math.min(this._pointsCount - 1, Math.ceil(lastVisibleIndex))),
        };
    }

    // --- Scrolling ---

    scrollToPosition(position: number, _animated: boolean = false): void {
        this._scrollOffset = position;
        this._correctOffset();
    }

    scrollBy(deltaPixels: number): void {
        const deltaBars = deltaPixels / this._barSpacing;
        this._scrollOffset += deltaBars;
        this._correctOffset();
    }

    // --- Zooming ---

    zoom(zoomPoint: Coordinate, scale: number): void {
        const floatIndex = this.coordinateToIndex(zoomPoint);

        const oldBarSpacing = this._barSpacing;
        const newBarSpacing = oldBarSpacing + scale * (oldBarSpacing / 10);
        this.setBarSpacing(newBarSpacing);

        // Correct right offset to keep zoom point stable
        const newFloatIndex = this.coordinateToIndex(zoomPoint);
        this._scrollOffset += floatIndex - newFloatIndex;
        this._correctOffset();
    }

    // --- Private ---

    private _correctOffset(): void {
        if (this._pointsCount === 0) {
            this._scrollOffset = 0;
            return;
        }

        const maxOffset = this._pointsCount - 1;
        const minOffset = this._options.fixLeftEdge ? 0 : -maxOffset;

        this._scrollOffset = clamp(this._scrollOffset, minOffset, maxOffset);
    }

    // --- Cleanup ---

    destroy(): void {
        this._sizeChanged.destroy();
        this._visibleRangeChanged.destroy();
    }
}
