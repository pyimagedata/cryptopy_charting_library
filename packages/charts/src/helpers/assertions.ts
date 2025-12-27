/**
 * Assert that a value is not null or undefined
 */
export function ensureNotNull<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) {
        throw new Error('Value is null or undefined');
    }
    return value;
}

/**
 * Assert that a value is defined
 */
export function ensureDefined<T>(value: T | undefined): T {
    if (value === undefined) {
        throw new Error('Value is undefined');
    }
    return value;
}

/**
 * Assert a condition is true
 */
export function assert(condition: boolean, message?: string): asserts condition {
    if (!condition) {
        throw new Error(message ?? 'Assertion failed');
    }
}
