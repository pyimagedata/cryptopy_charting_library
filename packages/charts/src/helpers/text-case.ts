/**
 * Locale-aware text helpers.
 * Turkish has dotted/dotless i: "dilimlerinde".toUpperCase() gives "DILIMLERINDE",
 * the Turkish form is "DİLİMLERİNDE".
 */

import type { LanguageCode } from './translations';

/** BCP-47 locale used for case mapping */
export function caseLocale(lang: LanguageCode | string): string {
    return lang === 'tr' ? 'tr-TR' : 'en-US';
}

/** Uppercase with the rules of the UI language */
export function upperLocale(text: string, lang: LanguageCode | string): string {
    return text.toLocaleUpperCase(caseLocale(lang));
}

/** Lowercase with the rules of the UI language */
export function lowerLocale(text: string, lang: LanguageCode | string): string {
    return text.toLocaleLowerCase(caseLocale(lang));
}
