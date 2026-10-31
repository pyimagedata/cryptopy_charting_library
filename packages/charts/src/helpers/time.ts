/**
 * Bar times may be epoch seconds or milliseconds. 1e10 ms = 1970-04-26 and 1e10 s = year 2286,
 * so both units are unambiguous for any realistic market data (1e12 ms = 2001 would misread
 * older daily history as seconds).
 */
export const MS_THRESHOLD = 1e10;

export function toEpochMs(t: number): number {
    return t > MS_THRESHOLD ? t : t * 1000;
}
