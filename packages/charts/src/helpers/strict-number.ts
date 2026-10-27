/**
 * Siki sayi cozumleme: "1abc" gibi artiklar reddedilir (NaN doner).
 * Virgul ondalik ayirici olarak kabul edilir; us (e) gosterimi kabul edilmez.
 */
const STRICT_NUMBER = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

export function parseStrictNumber(text: string): number {
    const trimmed = text.trim();
    if (!STRICT_NUMBER.test(trimmed)) return NaN;
    return Number(trimmed.replace(',', '.'));
}
