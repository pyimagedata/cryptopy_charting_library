/**
 * Coordinate type for type safety
 */
export type Coordinate = number & { __brand: 'Coordinate' };

/**
 * Time point index (bar index)
 */
export type TimePointIndex = number & { __brand: 'TimePointIndex' };

/**
 * Bar price type
 */
export type BarPrice = number & { __brand: 'BarPrice' };

/**
 * Create a coordinate value
 */
export function coordinate(value: number): Coordinate {
    return value as Coordinate;
}

/**
 * Create a time point index
 */
export function timePointIndex(value: number): TimePointIndex {
    return value as TimePointIndex;
}

/**
 * Create a bar price
 */
export function barPrice(value: number): BarPrice {
    return value as BarPrice;
}
