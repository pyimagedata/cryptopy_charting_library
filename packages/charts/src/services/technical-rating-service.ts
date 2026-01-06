/**
 * TradingView Technical Rating Service
 * 
 * Fetches technical analysis data from TradingView's scanner API.
 * Returns only: Recommend.All and Recommend.MA
 */

export interface TechnicalRating {
    technicalRating: number;      // Recommend.All: -1 to +1
    maRating: number;             // Recommend.MA: -1 to +1
}

export interface RatingLabel {
    text: string;
    color: string;
    bgColor: string;
}

/**
 * Convert numeric rating to label
 */
export function getRatingLabel(rating: number): RatingLabel {
    if (rating <= -0.5) {
        return { text: 'Strong Sell', color: '#ffffff', bgColor: '#ef5350' };
    } else if (rating <= -0.1) {
        return { text: 'Sell', color: '#ffffff', bgColor: '#ff7043' };
    } else if (rating <= 0.1) {
        return { text: 'Neutral', color: '#131722', bgColor: '#9e9e9e' };
    } else if (rating <= 0.5) {
        return { text: 'Buy', color: '#ffffff', bgColor: '#66bb6a' };
    } else {
        return { text: 'Strong Buy', color: '#ffffff', bgColor: '#26a69a' };
    }
}

/**
 * Fetch technical rating for a symbol from TradingView
 */
export async function fetchTechnicalRating(
    symbol: string,
    exchange: string = 'BINANCE',
    timeframe: string = ''
): Promise<TechnicalRating | null> {
    // Normalize timeframe to TradingView format
    let tvTimeframe = '';
    switch (timeframe) {
        case '1m': tvTimeframe = '|1'; break;
        case '5m': tvTimeframe = '|5'; break;
        case '15m': tvTimeframe = '|15'; break;
        case '30m': tvTimeframe = '|30'; break;
        case '1h': tvTimeframe = '|60'; break;
        case '2h': tvTimeframe = '|120'; break;
        case '4h': tvTimeframe = '|240'; break;
        case 'D':
        case '1d':
        case '1D':
        default: tvTimeframe = ''; break;
    }

    // Normalize symbol
    let normalizedSymbol = symbol.toUpperCase();
    if (normalizedSymbol.includes(':')) {
        normalizedSymbol = normalizedSymbol.split(':')[1];
    }
    if (!normalizedSymbol.endsWith('USDT') && !normalizedSymbol.endsWith('PERP')) {
        normalizedSymbol += 'USDT';
    }

    const ticker = `${exchange}:${normalizedSymbol}`;

    const requestBody = {
        symbols: {
            tickers: [ticker],
            query: { types: [] }
        },
        columns: [
            `Recommend.All${tvTimeframe}`,
            `Recommend.MA${tvTimeframe}`
        ]
    };

    try {
        // Make the request WITHOUT Content-Type header to avoid preflight
        const response = await fetch('https://scanner.tradingview.com/crypto/scan', {
            method: 'POST',
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            console.warn('TradingView rating fetch failed:', response.status);
            return null;
        }

        const data = await response.json();

        if (data.data && data.data.length > 0 && data.data[0].d) {
            const d = data.data[0].d;
            console.log('🏷️ Rating data received:', d);
            return {
                technicalRating: d[0] ?? 0,
                maRating: d[1] ?? 0
            };
        }

        return null;
    } catch (error) {
        console.warn('TradingView rating fetch error:', error);
        return null;
    }
}
