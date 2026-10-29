import { t } from '../helpers/translations';
import { displaySymbol } from '../helpers/display-aliases';
import { AlertsError } from './types';
import type { AlertCondition, AlertSound } from './types';

export const ALERT_CONDITIONS: readonly AlertCondition[] = ['crossing', 'crossing_up', 'crossing_down', 'greater_than', 'less_than'];
export const ALERT_SOUND_NAMES: readonly AlertSound[] = ['chime', 'bell', 'beep', 'alarm'];
export const DEFAULT_ALERT_COLOR = '#FF9800';

const CONDITION_EN: Record<AlertCondition, string> = {
    crossing: 'Crossing',
    crossing_up: 'Crossing Up',
    crossing_down: 'Crossing Down',
    greater_than: 'Greater Than',
    less_than: 'Less Than',
};

/** Localised condition label (EN keys double as translation keys). */
export function conditionLabel(c: AlertCondition): string {
    return t(CONDITION_EN[c]);
}

const SOUND_EN: Record<AlertSound, string> = { chime: 'Chime', bell: 'Bell', beep: 'Beep', alarm: 'Alarm' };
export function soundLabel(s: AlertSound): string {
    return t(SOUND_EN[s]);
}

/** Alert symbol id "EXCHANGE:CODE" (exchange trimmed + upper-cased so the same exchange always yields the same id). */
export function makeAlertSymbolId(exchange: string | undefined | null, code: string): string {
    const ex = (exchange || '').trim().toUpperCase();
    return ex ? `${ex}:${code}` : code;
}

/**
 * Does an alert's symbol belong to the chart with id `chartId`? Exact "EX:CODE" match; a legacy bare alert symbol
 * (no ":") matches any chart whose code equals it.
 */
export function alertMatchesSymbol(alertSymbol: string, chartId: string): boolean {
    if (alertSymbol === chartId) return true;
    if (alertSymbol.indexOf(':') >= 0) return false;
    const i = chartId.lastIndexOf(':');
    return (i >= 0 ? chartId.slice(i + 1) : chartId) === alertSymbol;
}

/** "BINANCE:BTCUSDT" -> "BTCUSDT" (display alias applied). */
export function alertTicker(symbol: string): string {
    const i = symbol.lastIndexOf(':');
    const code = i >= 0 ? symbol.slice(i + 1) : symbol;
    return displaySymbol(code);
}

/** Plain decimal text of a price (no grouping), used where no chart formatter is available. */
export function plainPrice(price: number): string {
    if (!isFinite(price)) return '';
    return String(Number(price.toFixed(8)));
}

/** Price typed by the user: accepts "," or "." as the decimal separator; NaN when not a number. */
export function parseAlertPrice(text: string): number {
    const s = text.trim().replace(/\s+/g, '').replace(',', '.');
    if (s === '' || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return Number(s);
}

/** Decimal places of a number (0.01 -> 2, 5 -> 0). */
export function priceDecimals(v: number): number {
    if (!isFinite(v)) return 0;
    // toFixed (not String(): that switches to exponent text below 1e-6)
    const s = Math.abs(v).toFixed(10).replace(/0+$/, '');
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
}

/** Snaps a dragged price to the tick grid (no step -> unchanged). */
export function snapAlertPrice(price: number, step: number | null): number {
    if (!step || !(step > 0)) return price;
    return Number((Math.round(price / step) * step).toFixed(priceDecimals(step)));
}

/** Full-precision plain decimal text (no exponent, no grouping, dot): 1.08543 -> "1.08543", 0.00001234 -> "0.00001234". */
export function exactPrice(price: number): string {
    if (!isFinite(price)) return '';
    return price.toFixed(Math.min(priceDecimals(price), 10));
}

/**
 * Text to seed the price input with. Never rounds to the price-axis format: plain decimal of `raw` limited to the
 * tick-step decimals when the step is known (`snap`: new alerts, the raw price is snapped to the tick grid first),
 * never fewer decimals than the step. Stored prices (edit) keep every decimal they have.
 */
export function alertPriceSeed(raw: number, step: number | null, snap: boolean): string {
    if (!isFinite(raw)) return '';
    const known = !!step && step > 0;
    const v = snap && known ? snapAlertPrice(raw, step) : raw;
    const dec = Math.min(Math.max(known ? priceDecimals(step as number) : 0, priceDecimals(v)), 10);
    return v.toFixed(dec);
}

/** Price as the server writes it in the default message: thousands commas, no trailing zeros ("65,000.5"). */
export function prettyPrice(price: number): string {
    const [whole, frac] = exactPrice(Math.abs(price)).split('.');
    return (price < 0 ? '-' : '') + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? '.' + frac : '');
}

/** The default message the server builds when it receives an empty one. */
export function serverDefaultMessage(symbol: string, condition: AlertCondition, price: number): string {
    const i = symbol.lastIndexOf(':');
    return `${i >= 0 ? symbol.slice(i + 1) : symbol} ${CONDITION_EN[condition]} ${prettyPrice(price)}`;
}

/**
 * True when `message` is empty or one of the auto-built texts for this alert (server default, or the client's
 * "<ticker> <condition> <price>" with the price as plain / axis-formatted text), i.e. the user never customised it.
 */
export function isAutoAlertMessage(message: string, symbol: string, condition: AlertCondition, price: number, extraPrices: string[] = []): boolean {
    const m = message.trim();
    if (m === '') return true;
    if (m === serverDefaultMessage(symbol, condition, price)) return true;
    const prices = [exactPrice(price), plainPrice(price), prettyPrice(price), ...extraPrices, ''];
    const i = symbol.lastIndexOf(':');
    const tickers = [alertTicker(symbol), i >= 0 ? symbol.slice(i + 1) : symbol];
    for (const tk of tickers) {
        for (const lab of [conditionLabel(condition), CONDITION_EN[condition]]) {
            for (const pr of prices) if (m === (pr ? `${tk} ${lab} ${pr}` : `${tk} ${lab}`)) return true;
        }
    }
    return false;
}

/**
 * User-facing text of an AlertsError. 'auth' is shown only when `showAuth` (a backend is set, i.e. the host
 * rejected the request with 401/403); without a backend the store already showed the sign-in toast.
 */
export function alertErrorText(e: unknown, showAuth = false): string | null {
    if (e instanceof AlertsError) {
        switch (e.code) {
            case 'limit_reached':
                return (e.limit ?? 0) === 0
                    ? t('Your plan does not include alerts.')
                    : t('Alert limit reached ({n}). Upgrade your plan.').replace('{n}', String(e.limit));
            case 'feed_capacity':
                return t('The server is not accepting alerts for new symbols right now, try again later.');
            case 'auth':
                return showAuth ? (e.message && e.message !== 'auth' ? e.message : t('Sign in to use alerts')) : null;
            case 'invalid':
                return e.message && e.message !== 'invalid' ? e.message : t('Something went wrong. Please try again.');
            default:
                return t('Something went wrong. Please try again.');
        }
    }
    return t('Something went wrong. Please try again.');
}
