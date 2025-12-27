/**
 * OHLC Bar data structure
 */
export interface BarData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

/**
 * Line data point
 */
export interface LineData {
    time: number;
    value: number;
}

/**
 * Bar with computed coordinates
 */
export interface BarCoordinates {
    x: number;
    openY: number;
    highY: number;
    lowY: number;
    closeY: number;
}

/**
 * Whitespace data point (no data)
 */
export interface WhitespaceData {
    time: number;
}

/**
 * Union of all data types
 */
export type SeriesDataItem = BarData | LineData | WhitespaceData;

/**
 * Check if data is bar data
 */
export function isBarData(data: SeriesDataItem): data is BarData {
    return 'open' in data && 'high' in data && 'low' in data && 'close' in data;
}

/**
 * Check if data is line data
 */
export function isLineData(data: SeriesDataItem): data is LineData {
    return 'value' in data && !('open' in data);
}
