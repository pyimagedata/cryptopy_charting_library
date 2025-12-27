/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation
 */
export function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
}

/**
 * Check if a number is an integer
 */
export function isInteger(value: number): boolean {
    return Number.isInteger(value);
}

/**
 * Round to a specified number of decimal places
 */
export function roundTo(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

/**
 * Calculate a "nice" number for axis labels
 */
export function niceNumber(value: number, round: boolean): number {
    const exponent = Math.floor(Math.log10(value));
    const fraction = value / Math.pow(10, exponent);

    let niceFraction: number;
    if (round) {
        if (fraction < 1.5) niceFraction = 1;
        else if (fraction < 3) niceFraction = 2;
        else if (fraction < 7) niceFraction = 5;
        else niceFraction = 10;
    } else {
        if (fraction <= 1) niceFraction = 1;
        else if (fraction <= 2) niceFraction = 2;
        else if (fraction <= 5) niceFraction = 5;
        else niceFraction = 10;
    }

    return niceFraction * Math.pow(10, exponent);
}

/**
 * Generate nice axis values
 */
export function generateAxisValues(
    min: number,
    max: number,
    targetCount: number
): number[] {
    if (min >= max) return [min];

    const range = niceNumber(max - min, false);
    const step = niceNumber(range / (targetCount - 1), true);
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;

    const values: number[] = [];
    for (let v = niceMin; v <= niceMax + step * 0.5; v += step) {
        values.push(roundTo(v, 10)); // Avoid floating point errors
    }

    return values;
}
