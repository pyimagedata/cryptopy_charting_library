import { Coordinate, BarPrice, coordinate, barPrice } from './coordinate';
import { Delegate } from '../helpers/delegate';
import { clamp, generateAxisValues } from '../helpers/math';

/**
 * Price scale mode
 */
export enum PriceScaleMode {
    Normal = 0,
    Logarithmic = 1,
    Percentage = 2,
    IndexedTo100 = 3,
}

/**
 * Price scale margins (as percentage of height)
 */
export interface PriceScaleMargins {
    top: number;    // 0.0 - 1.0
    bottom: number; // 0.0 - 1.0
}

/**
 * Price scale options
 */
export interface PriceScaleOptions {
    /** Enable auto scaling */
    autoScale: boolean;
    /** Price scale mode */
    mode: PriceScaleMode;
    /** Invert the scale */
    invertScale: boolean;
    /** Scale margins */
    scaleMargins: PriceScaleMargins;
    /** Show border */
    borderVisible: boolean;
    /** Border color */
    borderColor: string;
    /** Minimum width */
    minimumWidth: number;
}

/**
 * Default price scale options
 */
export const defaultPriceScaleOptions: PriceScaleOptions = {
    autoScale: true,
    mode: PriceScaleMode.Normal,
    invertScale: false,
    scaleMargins: { top: 0.1, bottom: 0.05 }, // Reduced margins for better fit
    borderVisible: true,
    borderColor: '#2B2B43',
    minimumWidth: 0,
};

/**
 * Price range
 */
export interface PriceRange {
    min: number;
    max: number;
}

/**
 * Price mark for axis labels
 */
export interface PriceMark {
    coord: Coordinate;
    label: string;
    price: number;
}

/**
 * Price scale model - manages vertical (price) axis
 */
export class PriceScale {
    private _options: PriceScaleOptions;
    private _height: number = 0;
    private _priceRange: PriceRange | null = null;
    private _isAutoScale: boolean;

    private readonly _modeChanged = new Delegate<PriceScaleMode>();
    private readonly _rangeChanged = new Delegate<PriceRange | null>();

    constructor(options: Partial<PriceScaleOptions> = {}) {
        this._options = { ...defaultPriceScaleOptions, ...options };
        this._isAutoScale = this._options.autoScale;
    }

    // --- Getters ---

    get height(): number {
        return this._height;
    }

    get options(): Readonly<PriceScaleOptions> {
        return this._options;
    }

    get priceRange(): PriceRange | null {
        return this._priceRange;
    }

    get isAutoScale(): boolean {
        return this._isAutoScale;
    }

    get mode(): PriceScaleMode {
        return this._options.mode;
    }

    // --- Events ---

    get modeChanged(): Delegate<PriceScaleMode> {
        return this._modeChanged;
    }

    get rangeChanged(): Delegate<PriceRange | null> {
        return this._rangeChanged;
    }

    // --- Computed values ---

    /**
     * Internal height (excluding margins)
     */
    get internalHeight(): number {
        const margins = this._options.scaleMargins;
        return this._height * (1 - margins.top - margins.bottom);
    }

    /**
     * Top margin in pixels
     */
    get topMarginPx(): number {
        return this._height * this._options.scaleMargins.top;
    }

    /**
     * Bottom margin in pixels
     */
    get bottomMarginPx(): number {
        return this._height * this._options.scaleMargins.bottom;
    }

    // --- Configuration ---

    setHeight(height: number): void {
        this._height = height;
    }

    setAutoScale(enabled: boolean): void {
        this._isAutoScale = enabled;
    }

    setMode(mode: PriceScaleMode): void {
        if (this._options.mode === mode) return;
        this._options.mode = mode;
        this._modeChanged.fire(mode);
    }

    setPriceRange(range: PriceRange | null): void {
        this._priceRange = range;
        this._rangeChanged.fire(range);
    }

    /**
     * Update price range from visible data
     */
    updatePriceRange(min: number, max: number, padding: number = 0): void {
        if (!this._isAutoScale && this._priceRange !== null) {
            return; // Keep manual range
        }

        // We use scaleMargins for padding, no need to double pad here
        this._priceRange = { min, max };
    }

    /**
     * Get current visible price range
     */
    getVisiblePriceRange(): PriceRange | null {
        return this._priceRange;
    }

    /**
     * Set visible price range (disables auto-scale)
     */
    setVisiblePriceRange(range: PriceRange): void {
        this._priceRange = range;
        this._isAutoScale = false;
        this._rangeChanged.fire(range);
    }

    // --- Coordinate conversions ---

    /**
     * Convert price to Y coordinate
     */
    priceToCoordinate(price: number): Coordinate {
        if (!this._priceRange || this.internalHeight === 0) {
            return coordinate(0);
        }

        const { min, max } = this._priceRange;
        const range = max - min;
        if (range === 0) return coordinate(this.topMarginPx);

        // Normalize price to 0-1 range
        const normalized = (price - min) / range;

        // Convert to pixel coordinate
        const y = this.topMarginPx + (1 - normalized) * this.internalHeight;

        return this._options.invertScale
            ? coordinate(this._height - 1 - y)
            : coordinate(y);
    }

    /**
     * Convert Y coordinate to price
     */
    coordinateToPrice(y: Coordinate): BarPrice {
        if (!this._priceRange || this.internalHeight === 0) {
            return barPrice(0);
        }

        const { min, max } = this._priceRange;
        const range = max - min;

        // Handle inverted scale
        const adjustedY = this._options.invertScale ? this._height - 1 - y : y;

        // Convert from pixel to normalized value
        const normalized = 1 - (adjustedY - this.topMarginPx) / this.internalHeight;

        // Convert to price
        const price = min + normalized * range;
        return barPrice(price);
    }

    // --- Axis marks ---

    /**
     * Generate price axis marks/labels
     */
    marks(): PriceMark[] {
        if (!this._priceRange || this._height === 0) {
            return [];
        }

        // Calculate price range for the entire axis height (including margins)
        const minPrice = this.coordinateToPrice(coordinate(this._height));
        const maxPrice = this.coordinateToPrice(coordinate(0));

        const priceMin = Math.min(minPrice, maxPrice);
        const priceMax = Math.max(minPrice, maxPrice);

        const targetCount = Math.max(3, Math.floor(this._height / 30));

        const values = generateAxisValues(priceMin, priceMax, targetCount);

        return values
            .map(price => ({
                price,
                coord: this.priceToCoordinate(price),
                label: this._formatPrice(price),
            }))
            .filter(mark => mark.coord >= 0 && mark.coord <= this._height);
    }

    // --- Scaling interactions ---

    private _scaleStartPoint: number | null = null;
    private _rangeSnapshot: PriceRange | null = null;

    startScale(y: number): void {
        if (!this._priceRange) return;
        this._scaleStartPoint = y;
        this._rangeSnapshot = { ...this._priceRange };
        this._isAutoScale = false;
    }

    scaleTo(y: number): void {
        if (this._scaleStartPoint === null || !this._rangeSnapshot) return;

        const deltaY = y - this._scaleStartPoint;
        // Exponential scaling for natural feel: 200px drag = 2x scale
        const sensitivity = 0.005;
        const scaleFactor = Math.exp(deltaY * sensitivity);

        const center = (this._rangeSnapshot.min + this._rangeSnapshot.max) / 2;
        const halfRange = (this._rangeSnapshot.max - this._rangeSnapshot.min) / 2;
        const newHalfRange = Math.max(halfRange * scaleFactor, 0.000001);

        this._priceRange = {
            min: center - newHalfRange,
            max: center + newHalfRange,
        };
        this._rangeChanged.fire(this._priceRange);
    }

    endScale(): void {
        this._scaleStartPoint = null;
        this._rangeSnapshot = null;
    }

    // --- Scrolling interactions ---

    private _scrollStartPoint: number | null = null;

    startScroll(y: number): void {
        if (!this._priceRange) return;
        this._scrollStartPoint = y;
        this._rangeSnapshot = { ...this._priceRange };
        this._isAutoScale = false;
    }

    scrollTo(y: number): void {
        if (this._scrollStartPoint === null || !this._rangeSnapshot) return;

        const range = this._rangeSnapshot.max - this._rangeSnapshot.min;
        const pricePerPixel = range / this.internalHeight;
        const pixelDelta = y - this._scrollStartPoint;
        const priceDelta = pixelDelta * pricePerPixel * (this._options.invertScale ? -1 : 1);

        this._priceRange = {
            min: this._rangeSnapshot.min + priceDelta,
            max: this._rangeSnapshot.max + priceDelta,
        };
    }

    endScroll(): void {
        this._scrollStartPoint = null;
        this._rangeSnapshot = null;
    }

    // --- Private ---

    private _formatPrice(price: number): string {
        const absPrice = Math.abs(price);
        let decimals: number;

        if (absPrice >= 1000) decimals = 2;
        else if (absPrice >= 100) decimals = 2;
        else if (absPrice >= 1) decimals = 2;
        else if (absPrice >= 0.01) decimals = 4;
        else decimals = 6;

        return price.toFixed(decimals);
    }

    // --- Cleanup ---

    destroy(): void {
        this._modeChanged.destroy();
        this._rangeChanged.destroy();
    }
}
