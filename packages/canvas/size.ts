/**
 * Represents a size with width and height
 */
export interface Size {
    readonly width: number;
    readonly height: number;
}

/**
 * Creates a validated Size object
 */
export function size(dimensions: { width: number; height: number }): Size {
    if (dimensions.width < 0) {
        throw new Error('Negative width is not allowed for Size');
    }
    if (dimensions.height < 0) {
        throw new Error('Negative height is not allowed for Size');
    }
    return {
        width: dimensions.width,
        height: dimensions.height,
    };
}

/**
 * Checks if two sizes are equal
 */
export function equalSizes(first: Size, second: Size): boolean {
    return first.width === second.width && first.height === second.height;
}
