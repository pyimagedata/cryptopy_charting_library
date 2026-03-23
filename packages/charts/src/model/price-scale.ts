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
        if (this._priceRange) {
            this._priceRange = this._normalizeRangeForMode(this._priceRange);
            this._rangeChanged.fire(this._priceRange);
        }
        this._modeChanged.fire(mode);
    }

    setPriceRange(range: PriceRange | null): void {
        this._priceRange = range ? this._normalizeRangeForMode(range) : null;
        this._rangeChanged.fire(this._priceRange);
    }

    /**
     * Update price range from visible data
     */
    updatePriceRange(min: number, max: number, padding: number = 0): void {
        if (!this._isAutoScale && this._priceRange !== null) {
            return; // Keep manual range
        }

        // We use scaleMargins for padding, no need to double pad here
        this._priceRange = this._normalizeRangeForMode({ min, max });
        this._rangeChanged.fire(this._priceRange);
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
        this._priceRange = this._normalizeRangeForMode(range);
        this._isAutoScale = false;
        this._rangeChanged.fire(this._priceRange);
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
        const logicalMin = this._priceToLogical(min);
        const logicalMax = this._priceToLogical(max);
        const logicalPrice = this._priceToLogical(this._normalizePriceForMode(price, max));
        const range = logicalMax - logicalMin;
        if (!Number.isFinite(range) || range === 0) return coordinate(this.topMarginPx);

        // Normalize price to 0-1 range
        const normalized = (logicalPrice - logicalMin) / range;

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
        const logicalMin = this._priceToLogical(min);
        const logicalMax = this._priceToLogical(max);
        const range = logicalMax - logicalMin;

        // Handle inverted scale
        const adjustedY = this._options.invertScale ? this._height - 1 - y : y;

        // Convert from pixel to normalized value
        const normalized = clamp(1 - (adjustedY - this.topMarginPx) / this.internalHeight, -10, 10);

        // Convert to price
        const logicalPrice = logicalMin + normalized * range;
        const price = this._logicalToPrice(logicalPrice);
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

        const values = this._options.mode === PriceScaleMode.Logarithmic && priceMin > 0 && priceMax > 0
            ? this._generateLogAxisValues(priceMin, priceMax, targetCount)
            : generateAxisValues(priceMin, priceMax, targetCount);

        return values
            .map(price => ({
                price,
                coord: this.priceToCoordinate(price),
                label: this.formatPrice(price),
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

        if (this._options.mode === PriceScaleMode.Logarithmic && this._rangeSnapshot.min > 0 && this._rangeSnapshot.max > 0) {
            const logMin = Math.log(this._rangeSnapshot.min);
            const logMax = Math.log(this._rangeSnapshot.max);
            const center = (logMin + logMax) / 2;
            const halfRange = (logMax - logMin) / 2;
            const newHalfRange = Math.max(halfRange * scaleFactor, 0.000001);

            this._priceRange = {
                min: Math.exp(center - newHalfRange),
                max: Math.exp(center + newHalfRange),
            };
        } else {
            const center = (this._rangeSnapshot.min + this._rangeSnapshot.max) / 2;
            const halfRange = (this._rangeSnapshot.max - this._rangeSnapshot.min) / 2;
            const newHalfRange = Math.max(halfRange * scaleFactor, 0.000001);

            this._priceRange = {
                min: center - newHalfRange,
                max: center + newHalfRange,
            };
        }
        this._priceRange = this._normalizeRangeForMode(this._priceRange);
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

        const pixelDelta = y - this._scrollStartPoint;
        const direction = this._options.invertScale ? -1 : 1;

        if (this._options.mode === PriceScaleMode.Logarithmic && this._rangeSnapshot.min > 0 && this._rangeSnapshot.max > 0) {
            const logMin = Math.log(this._rangeSnapshot.min);
            const logMax = Math.log(this._rangeSnapshot.max);
            const logPerPixel = (logMax - logMin) / this.internalHeight;
            const logDelta = pixelDelta * logPerPixel * direction;
            this._priceRange = {
                min: Math.exp(logMin + logDelta),
                max: Math.exp(logMax + logDelta),
            };
        } else {
            const range = this._rangeSnapshot.max - this._rangeSnapshot.min;
            const pricePerPixel = range / this.internalHeight;
            const priceDelta = pixelDelta * pricePerPixel * direction;

            this._priceRange = {
                min: this._rangeSnapshot.min + priceDelta,
                max: this._rangeSnapshot.max + priceDelta,
            };
        }
        this._priceRange = this._normalizeRangeForMode(this._priceRange);
        this._rangeChanged.fire(this._priceRange);
    }

    endScroll(): void {
        this._scrollStartPoint = null;
        this._rangeSnapshot = null;
    }

    // --- Private ---

    // --- Public: Formatting ---

    formatPrice(price: number): string {
        const absPrice = Math.abs(price);
        let decimals: number;

        if (price === 0) return '0.00';

        if (absPrice >= 1000) decimals = 2;
        else if (absPrice >= 1) decimals = 2;
        else if (absPrice >= 0.1) decimals = 4;
        else if (absPrice >= 0.01) decimals = 5;
        else if (absPrice >= 0.0001) decimals = 6;
        else decimals = 8;

        return price.toFixed(decimals);
    }

    private _priceToLogical(price: number): number {
        if (this._options.mode === PriceScaleMode.Logarithmic && price > 0) {
            return Math.log(price);
        }
        return price;
    }

    private _logicalToPrice(value: number): number {
        if (this._options.mode === PriceScaleMode.Logarithmic) {
            return Math.exp(value);
        }
        return value;
    }

    private _normalizePriceForMode(price: number, fallbackMax: number): number {
        if (this._options.mode !== PriceScaleMode.Logarithmic) {
            return price;
        }

        const safeMin = Math.max(Number.MIN_VALUE, fallbackMax * 1e-9);
        return Math.max(price, safeMin);
    }

    private _normalizeRangeForMode(range: PriceRange): PriceRange {
        let min = Math.min(range.min, range.max);
        let max = Math.max(range.min, range.max);

        if (this._options.mode === PriceScaleMode.Logarithmic) {
            max = Math.max(max, Number.MIN_VALUE);
            const safeMin = Math.max(Number.MIN_VALUE, max * 1e-9);
            min = Math.max(min, safeMin);
        }

        if (min === max) {
            const delta = this._options.mode === PriceScaleMode.Logarithmic
                ? Math.max(max * 0.001, Number.MIN_VALUE)
                : 0.000001;
            min -= delta;
            max += delta;
        }

        return { min, max };
    }

    private _generateLogAxisValues(min: number, max: number, targetCount: number): number[] {
        const values: number[] = [];
        const multipliers = [1, 2, 5];
        const minExp = Math.floor(Math.log10(min));
        const maxExp = Math.ceil(Math.log10(max));

        for (let exp = minExp; exp <= maxExp; exp++) {
            for (const multiplier of multipliers) {
                const value = multiplier * Math.pow(10, exp);
                if (value >= min && value <= max) {
                    values.push(value);
                }
            }
        }

        if (values.length >= Math.max(3, Math.floor(targetCount / 2))) {
            return values;
        }

        const generated: number[] = [];
        const steps = Math.max(2, targetCount - 1);
        for (let i = 0; i <= steps; i++) {
            const ratio = i / steps;
            generated.push(min * Math.pow(max / min, ratio));
        }

        return generated;
    }

    // --- Cleanup ---

    destroy(): void {
        this._modeChanged.destroy();
        this._rangeChanged.destroy();
    }
}
