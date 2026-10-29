import { t } from '../helpers/translations';
import { displaySymbol } from '../helpers/display-aliases';
import { AlertsError } from './types';
import type { AlertCondition, AlertGeometry, AlertInterval, AlertSound, AlertSource, AlertTrigger } from './types';

export const ALERT_CONDITIONS: readonly AlertCondition[] = ['crossing', 'crossing_up', 'crossing_down', 'greater_than', 'less_than'];
export const ALERT_SOUND_NAMES: readonly AlertSound[] = ['chime', 'bell', 'beep', 'alarm'];
export const DEFAULT_ALERT_COLOR = '#FF9800';

const CONDITION_EN: Record<AlertCondition, string> = {
    crossing: 'Crossing',
    crossing_up: 'Crossing Up',
    crossing_down: 'Crossing Down',
    greater_than: 'Greater Than',
    less_than: 'Less Than',
    entering_channel: 'Entering Channel',
    exiting_channel: 'Exiting Channel',
    inside_channel: 'Inside Channel',
    outside_channel: 'Outside Channel',
    moving_up: 'Moving Up',
    moving_down: 'Moving Down',
    moving_up_percent: 'Moving Up %',
    moving_down_percent: 'Moving Down %',
};

export const LINE_CONDITIONS: readonly AlertCondition[] = ALERT_CONDITIONS;
export const CHANNEL_CONDITIONS: readonly AlertCondition[] = ['entering_channel', 'exiting_channel', 'inside_channel', 'outside_channel'];
export const MOVING_CONDITIONS: readonly AlertCondition[] = ['moving_up', 'moving_down', 'moving_up_percent', 'moving_down_percent'];

export function isMovingCondition(c: AlertCondition): boolean { return MOVING_CONDITIONS.indexOf(c) >= 0; }
export function isChannelCondition(c: AlertCondition): boolean { return CHANNEL_CONDITIONS.indexOf(c) >= 0; }
export function isPercentCondition(c: AlertCondition): boolean { return c === 'moving_up_percent' || c === 'moving_down_percent'; }

/** Conditions selectable for a source / geometry: price = 5 + 4 moving, drawing line = 5, drawing channel = 4 channel. */
export function conditionsFor(source: AlertSource | undefined, geometryType?: AlertGeometry['type'] | null): readonly AlertCondition[] {
    if (source === 'drawing') return geometryType === 'channel' ? CHANNEL_CONDITIONS : LINE_CONDITIONS;
    return [...ALERT_CONDITIONS, ...MOVING_CONDITIONS];
}

export const ALERT_TRIGGERS: readonly AlertTrigger[] = ['once', 'once_per_bar', 'once_per_bar_close', 'once_per_minute'];
export const ALERT_INTERVALS: readonly AlertInterval[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
export const DEFAULT_ALERT_INTERVAL: AlertInterval = '1h';
export const DEFAULT_MOVE_BARS = 10;

const TRIGGER_EN: Record<AlertTrigger, string> = {
    once: 'Only once',
    once_per_bar: 'Once per bar',
    once_per_bar_close: 'Once per bar close',
    once_per_minute: 'Once per minute',
};
export function triggerLabel(tr: AlertTrigger): string { return t(TRIGGER_EN[tr]); }

const INTERVAL_EN: Record<AlertInterval, string> = {
    '1m': '1 minute', '5m': '5 minutes', '15m': '15 minutes', '30m': '30 minutes', '1h': '1 hour', '4h': '4 hours', '1d': '1 day',
};
export function intervalLabel(i: AlertInterval): string { return t(INTERVAL_EN[i]); }

/** Chart timeframe text ("15m", "1H", "60", "1D") -> alert interval; null when it is not one of the supported bar sizes. */
export function mapChartInterval(tf: string | null | undefined): AlertInterval | null {
    if (!tf) return null;
    const s = String(tf).trim().toLowerCase();
    let min: number;
    const m = s.match(/^(\d+)\s*([smhdw]?)$/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    switch (m[2]) {
        case '': case 'm': min = n; break;
        case 'h': min = n * 60; break;
        case 'd': min = n * 1440; break;
        default: return null;
    }
    const map: Record<number, AlertInterval> = { 1: '1m', 5: '5m', 15: '15m', 30: '30m', 60: '1h', 240: '4h', 1440: '1d' };
    return map[min] ?? null;
}

/** Move value text: "2.5" / "2.5%". */
export function moveValueText(c: AlertCondition, value: number): string {
    return plainPrice(value) + (isPercentCondition(c) ? '%' : '');
}

/** "<value>[%] / <bars> bar" (auto message tail of a moving alert). */
export function movingTail(c: AlertCondition, value: number, bars: number): string {
    return `${moveValueText(c, value)} / ${bars} ${t('bars')}`;
}

/** Second line of a panel row for a moving alert: "<condition> <value>[%] · <bars> bar · <interval>". */
export function movingSummary(c: AlertCondition, value: number, bars: number, interval: AlertInterval): string {
    return `${conditionLabel(c)} ${moveValueText(c, value)} · ${bars} ${t('bars')} · ${interval}`;
}

/** Placeholders usable in alert messages (rendered by the server at fire time). */
export const ALERT_PLACEHOLDERS: readonly string[] = [
    'ticker', 'exchange', 'close', 'open', 'high', 'low', 'volume', 'time', 'timenow', 'interval', 'alert_name', 'condition',
];

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

/** Server default message of a moving alert: "<ticker> <EN label> <value>[%]" (no bar count). */
export function serverMovingMessage(symbol: string, condition: AlertCondition, value: number): string {
    const i = symbol.lastIndexOf(':');
    return `${i >= 0 ? symbol.slice(i + 1) : symbol} ${CONDITION_EN[condition]} ${prettyPrice(value)}${isPercentCondition(condition) ? '%' : ''}`;
}

/** Server default message of a drawing alert: "<ticker> <EN label> <drawing label>". */
export function serverDrawingMessage(symbol: string, condition: AlertCondition, drawingLabel: string): string {
    const i = symbol.lastIndexOf(':');
    return `${i >= 0 ? symbol.slice(i + 1) : symbol} ${CONDITION_EN[condition]} ${drawingLabel}`;
}

/** Tails (after "<ticker> <condition> ") that mark a moving alert message as auto-built: server default and client forms. */
export function movingAutoTails(c: AlertCondition, value: number, bars: number): string[] {
    const unit = isPercentCondition(c) ? '%' : '';
    return [`${prettyPrice(value)}${unit}`, moveValueText(c, value), movingTail(c, value, bars)];
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
