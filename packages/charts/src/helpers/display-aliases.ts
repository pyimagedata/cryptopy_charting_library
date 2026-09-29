/**
 * Sadece GORUNEN adlari degistirir: sembol kodu ("GC1") ve borsa ("COMEX")
 * veri/yonlendirme icin oldugu gibi kalir; baslikta, arac cubugunda, filigranda
 * ve sembol aramasinda kullaniciya takma ad ("GoldFutures", "FUTURES")
 * gosterilir. Uygulama (host sayfa) `setDisplayAliases` ile ayarlar.
 */
export interface DisplayAliases {
    /** Sembol kodu -> gorunen ad (ör. { GC1: 'GoldFutures' }). */
    symbols?: Record<string, string>;
    /** Borsa kodu -> gorunen ad (ör. { COMEX: 'FUTURES' }). */
    exchanges?: Record<string, string>;
}

let symbolAliases: Record<string, string> = {};
let exchangeAliases: Record<string, string> = {};

export function setDisplayAliases(aliases: DisplayAliases): void {
    symbolAliases = { ...(aliases.symbols || {}) };
    exchangeAliases = { ...(aliases.exchanges || {}) };
}

export function displaySymbol(symbol: string): string {
    return Object.prototype.hasOwnProperty.call(symbolAliases, symbol) ? symbolAliases[symbol] : symbol;
}

/** Takma ad tanimliysa onu, yoksa `undefined` doner (cagiran kendi varsayilanina duser). */
export function exchangeAlias(exchange: string): string | undefined {
    return Object.prototype.hasOwnProperty.call(exchangeAliases, exchange) ? exchangeAliases[exchange] : undefined;
}

export function displayExchange(exchange: string): string {
    return exchangeAlias(exchange) ?? exchange;
}
