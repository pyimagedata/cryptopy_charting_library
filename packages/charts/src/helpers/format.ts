// Number / date formatting shared across the UI.
//  - prices: always "." decimal and "," thousands (same as the price axis), independent of browser locale and UI language
//  - text numbers (percentages, counts, ratios): follow the UI language (tr: "1,5" / "12.345", en: "1.5" / "12,345")
//  - dates: follow the UI language (tr-TR / en-US)
import { getCurrentLanguage, type LanguageCode } from './translations';

export function localeOf(lang: LanguageCode = getCurrentLanguage()): string {
    return lang === 'tr' ? 'tr-TR' : 'en-US';
}

const MONTHS_SHORT: Record<LanguageCode, readonly string[]> = {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    tr: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
};

/** Short month name in the UI language; month is 0-based (0 = January). */
export function monthShort(month: number, lang: LanguageCode = getCurrentLanguage()): string {
    return (MONTHS_SHORT[lang] ?? MONTHS_SHORT.en)[month] ?? '';
}

function groupInt(int: string, sep: string, minGroupDigits: number): string {
    if (int.length < minGroupDigits) return int;
    return int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

function fixedParts(value: number, minDec: number, maxDec: number): { neg: boolean; int: string; frac: string } {
    const dec = Math.min(100, Math.max(0, Math.round(maxDec)));
    let s = Math.abs(value).toFixed(dec);
    let [int, frac = ''] = s.split('.');
    const min = Math.min(dec, Math.max(0, Math.round(minDec)));
    while (frac.length > min && frac.endsWith('0')) frac = frac.slice(0, -1);
    const isZero = /^0*$/.test(int) && /^0*$/.test(frac);
    return { neg: value < 0 && !isZero, int, frac };
}

function render(p: { neg: boolean; int: string; frac: string }, group: string, dec: string, minGroupDigits: number): string {
    return (p.neg ? '-' : '') + groupInt(p.int, group, minGroupDigits) + (p.frac ? dec + p.frac : '');
}

/** Price text: fixed `precision` decimals, "." decimal, "," thousands. Non-finite values give an em dash. */
export function formatPrice(value: number, precision: number): string {
    if (!Number.isFinite(value)) return '—';
    return render(fixedParts(value, precision, precision), ',', '.', 4);
}

/** Adds "," thousands separators to the integer part of an already formatted price text (price axis output). */
export function groupThousands(text: string): string {
    return text.replace(/^(-?)(\d+)/, (_m, sign: string, int: string) => sign + groupInt(int, ',', 4));
}

export interface FormatNumberOpts {
    minDecimals?: number;
    maxDecimals?: number;
    /** Prefix positive values with "+". */
    signed?: boolean;
    lang?: LanguageCode;
}

/** Number in the UI language (tr: "." thousands + "," decimal, grouping from 5 integer digits like tr-TR; en: "," + "."). */
export function formatNumber(value: number, opts: FormatNumberOpts = {}): string {
    if (!Number.isFinite(value)) return '—';
    const lang = opts.lang ?? getCurrentLanguage();
    const min = opts.minDecimals ?? 0;
    const max = Math.max(min, opts.maxDecimals ?? min);
    const p = fixedParts(value, min, max);
    const s = lang === 'tr' ? render(p, '.', ',', 5) : render(p, ',', '.', 4);
    return opts.signed && value > 0 && !p.neg && !/^[0.,]*$/.test(s) ? `+${s}` : s;
}

/** Percentage text in the UI language, e.g. "1,25%" (tr) / "1.25%" (en). `value` is already a percent. */
export function formatPercent(value: number, digits = 2, opts: { signed?: boolean; lang?: LanguageCode } = {}): string {
    if (!Number.isFinite(value)) return '—';
    return `${formatNumber(value, { minDecimals: digits, maxDecimals: digits, signed: opts.signed, lang: opts.lang })}%`;
}

export interface FormatDateOpts {
    /** Include the time of day (hh:mm). */
    time?: boolean;
    /** IANA zone; default is the browser zone. */
    timeZone?: string;
    lang?: LanguageCode;
}

/** Date (and optionally time) in the UI language: tr "15.03.2024 13:05", en "3/15/2024, 1:05 PM". */
export function formatDate(date: Date | number | string, opts: FormatDateOpts = {}): string {
    const d = date instanceof Date ? date : new Date(date);
    if (!Number.isFinite(d.getTime())) return '—';
    const o: Intl.DateTimeFormatOptions = opts.time
        ? { dateStyle: 'short', timeStyle: 'short' }
        : { dateStyle: 'short' };
    if (opts.timeZone) o.timeZone = opts.timeZone;
    return new Intl.DateTimeFormat(localeOf(opts.lang), o).format(d);
}
