/**
 * Indicator catalogue + pure (DOM-free) search / grouping / favourites / recents logic
 * used by the indicator dialog. Kept free of DOM so it can be smoke-tested in node.
 */

export interface IndicatorItem {
    id: string;
    name: string;
    shortName: string;
    description: string;
    category: 'standard' | 'custom' | 'pattern';
    type: 'overlay' | 'panel';
}

type BaseIndicator = IndicatorItem;

export type IndicatorSection = 'technical' | 'volume' | 'pattern' | 'custom';

/** Sidebar entries. 'favorites' / 'recent' are virtual; 'backend' filters by `remote`. */
export type IndicatorCategoryId = 'favorites' | 'recent' | 'technical' | 'volume' | 'pattern' | 'backend';

export interface CatalogItem extends IndicatorItem {
    /** Primary (non-overlapping) section, used for headers in search results. */
    section: IndicatorSection;
    /** Computed on the backend (RemoteCompute / host provider). */
    remote: boolean;
}

const BASE_INDICATORS: BaseIndicator[] = [
    {
        id: 'ema',
        name: 'Exponential Moving Average',
        shortName: 'EMA',
        description: 'Trend-following indicator that gives more weight to recent prices',
        category: 'standard',
        type: 'overlay'
    },
    {
        id: 'rsi',
        name: 'Relative Strength Index',
        shortName: 'RSI',
        description: 'Momentum oscillator measuring speed and change of price movements',
        category: 'standard',
        type: 'panel'
    },
    {
        id: 'sma',
        name: 'Simple Moving Average',
        shortName: 'SMA',
        description: 'Average price over a specified period',
        category: 'standard',
        type: 'overlay'
    },
    {
        id: 'bb',
        name: 'Bollinger Bands',
        shortName: 'BB',
        description: 'Volatility bands placed above and below a moving average',
        category: 'standard',
        type: 'overlay'
    },
    {
        id: 'macd',
        name: 'MACD',
        shortName: 'MACD',
        description: 'Trend-following momentum indicator showing relationship between two EMAs',
        category: 'standard',
        type: 'panel'
    },
    {
        id: 'stoch',
        name: 'Stochastic',
        shortName: 'STOCH',
        description: 'Momentum indicator comparing closing price to price range',
        category: 'standard',
        type: 'panel'
    },
    {
        id: 'sar',
        name: 'Parabolic SAR',
        shortName: 'SAR',
        description: 'Stop and Reverse indicator that identifies potential trend reversals',
        category: 'standard',
        type: 'overlay'
    },
    {
        id: 'halftrend',
        name: 'HalfTrend',
        shortName: 'HT',
        description: 'Trend reversal overlay with ATR channels and buy/sell signals',
        category: 'standard',
        type: 'overlay'
    },
    {
        id: 'supertrend',
        name: 'SuperTrend',
        shortName: 'ST',
        description: 'ATR tabanli trend takip overlay indikatori',
        category: 'standard',
        type: 'overlay'
    },
    {
        id: 'alphatrend',
        name: 'AlphaTrend',
        shortName: 'AT',
        description: 'ATR ve RSI/MFI tabanli trend overlay indikatori',
        category: 'standard',
        type: 'overlay'
    },
    {
        id: 'ichimoku',
        name: 'Ichimoku Cloud',
        shortName: 'ICHI',
        description: 'Conversion, base, lagging spans and kumo cloud overlay',
        category: 'standard',
        type: 'overlay'
    },
    {
        id: 'fixed-range-volume-profile',
        name: 'Fixed Range Volume Profile',
        shortName: 'FRVP',
        description: 'Seçilen sabit bar aralığı için fiyat seviyelerine göre hacim dağılımı gösterir',
        category: 'standard',
        type: 'overlay'
    },
    {
        id: 'volume',
        name: 'Volume',
        shortName: 'Vol',
        description: 'Measures the number of shares or contracts traded in a security or market during a given period',
        category: 'standard',
        type: 'panel'
    },
    {
        id: 'hma',
        name: 'Hull Moving Average',
        shortName: 'HMA',
        description: 'Modified moving average with reduced lag and increased smoothness',
        category: 'standard',
        type: 'overlay'
    },
    {
        id: 'stochrsi',
        name: 'Stochastic RSI',
        shortName: 'StochRSI',
        description: 'Combines Stochastic oscillator with RSI to identify overbought/oversold levels of the RSI',
        category: 'standard',
        type: 'panel'
    },
    {
        id: 'tdoji',
        name: 'Tdoji Oscilator',
        shortName: 'TDOJI',
        description: 'Linear regression slope oscillator with EMA smoothing, SMA signal, and zero-line context',
        category: 'custom',
        type: 'panel'
    },
    {
        id: 'thunderbirdx',
        name: 'Thunderbirdx',
        shortName: 'TBX',
        description: 'Sinc momentum, MA and convergence-divergence histogram oscillator',
        category: 'custom',
        type: 'panel'
    },
    {
        id: 'tdoji-sr',
        name: 'TDOJI-SR',
        shortName: 'SR',
        description: 'Prev close based support and resistance ladder with labels and level notes',
        category: 'custom',
        type: 'overlay'
    },
    {
        id: 'demark-pivot',
        name: 'GainMetrics',
        shortName: 'GM',
        description: 'Günlük, haftalık veya aylık DeMark destek direnç pivotları, EMA ve OBV çizgileri',
        category: 'custom',
        type: 'overlay'
    },
    {
        id: 'tdoji-mom',
        name: 'TDOJI MOM',
        shortName: 'MOM',
        description: 'EMA(60) tabanli close farkini kolon histogram olarak gosterir',
        category: 'custom',
        type: 'panel'
    },
    {
        id: 'zigzag',
        name: 'ZigZag',
        shortName: 'ZZ',
        description: 'Pivot high ve low noktalarini deviation filtresi ile birlestiren formasyon indikatori',
        category: 'pattern',
        type: 'overlay'
    },
    {
        id: 'abcd-pattern',
        name: 'ABCD Pattern',
        shortName: 'ABCD',
        description: 'ZigZag pivotlarindan bullish veya bearish ABCD harmonic formasyonu tespit eder',
        category: 'pattern',
        type: 'overlay'
    },
    {
        id: 'harmonic-patterns',
        name: 'Harmonic Patterns',
        shortName: 'HARM',
        description: 'ABCD ve Gartley patternlerini ortak zigzag pivotlariyla tespit eder',
        category: 'pattern',
        type: 'overlay'
    },
    {
        id: 'chart-patterns',
        name: 'Chart Patterns',
        shortName: 'CHART',
        description: 'Cifte tepe, cifte dip, flama ve bayrak gibi klasik grafik formasyonlarini tespit eder',
        category: 'pattern',
        type: 'overlay'
    },
    {
        id: 'zigzag-trendline',
        name: 'Trendline',
        shortName: 'TL',
        description: 'ZigZag pivotlarindan otomatik trendline cizer',
        category: 'pattern',
        type: 'overlay'
    },
    {
        id: 'trendline-breakout',
        name: 'Trendline Breakout',
        shortName: 'TL BO',
        description: 'Alcalan veya yukselen zigzag trendline kirilimlarini tespit eder',
        category: 'pattern',
        type: 'overlay'
    },
    {
        id: 'smc',
        name: 'Smart Money Concepts',
        shortName: 'SMC',
        description: 'BOS (Break of Structure) ve MSB (Market Structure Break) yapısal kırılımlarını ve minor/macro zigzag kanallarını gösterir',
        category: 'pattern',
        type: 'overlay'
    },
    {
        id: 'special-forces',
        name: 'Special Forces',
        shortName: 'SF',
        description: 'Üst timeframe Heikin Ashi pivotlarından otomatik destek/direnç kutuları çizer',
        category: 'custom',
        type: 'overlay'
    },
    {
        id: 'bobbin',
        name: 'Bobbin',
        shortName: 'Bobbin',
        description: 'Ardışık gövde-renk dizilerindeki tekdüze/dar bantlı "bobin" bölgelerini istatistiksel bir skor modeliyle tespit eder',
        category: 'custom',
        type: 'overlay'
    },
    {
        id: 'fvg',
        name: 'Fair Value Gap',
        shortName: 'FVG',
        description: '3 mumluk dengesizlik (imbalance) bölgelerini ATR/displacement filtreleriyle çizer, Londra seansı ve 1:2 hedef çizgisi vurgulu',
        category: 'pattern',
        type: 'overlay'
    },
    {
        id: 'fvg-inversion',
        name: 'FVG Inversion',
        shortName: 'IFVG',
        description: 'Kendi yönünün tersine gövde-kapanışla kırılan Fair Value Gap bölgelerini (IFVG) tespit eder',
        category: 'pattern',
        type: 'overlay'
    },
    {
        id: 'eqhl-v2',
        name: 'Equal Highs/Lows V2',
        shortName: 'EQH/EQL',
        description: 'ATR veya akademik gama toleransıyla eşit tepe/dip likidite seviyelerini kümeleyip süpürülmeyi işaretler',
        category: 'pattern',
        type: 'overlay'
    },
    {
        id: 'judas-swing',
        name: 'Judas Swing',
        shortName: 'Judas',
        description: 'ICT Judas Swing: referans aralık dışına sahte kırılım, MSS, FVG onayı ve retest ile giriş sinyali',
        category: 'pattern',
        type: 'overlay'
    },
    {
        id: 'smt-divergence',
        name: 'SMT Divergence',
        shortName: 'SMT',
        description: 'ICT SMT Divergence: korele varlıkla (ör. altın/gümüş) tepe/dip uyumsuzluğunu çizgilerle gösterir',
        category: 'pattern',
        type: 'overlay'
    },
];

/** Volume related indicators (everything else with category 'standard' is "technical"). */
const VOLUME_IDS = new Set(['volume', 'fixed-range-volume-profile']);

/**
 * Indicators whose values come from the backend: they use RemoteCompute / a host provider
 * (see src/indicators/*-indicator.ts and demo-ts.html RemoteIndicators.defaultProvider).
 */
const REMOTE_IDS = new Set([
    'tdoji', 'thunderbirdx', 'tdoji-sr', 'demark-pivot', 'tdoji-mom', 'zigzag',
    'abcd-pattern', 'harmonic-patterns', 'chart-patterns', 'zigzag-trendline',
    'trendline-breakout', 'smc', 'special-forces', 'bobbin', 'fvg', 'fvg-inversion',
    'eqhl-v2', 'judas-swing', 'smt-divergence',
]);

function sectionOf(ind: IndicatorItem): IndicatorSection {
    if (VOLUME_IDS.has(ind.id)) return 'volume';
    if (ind.category === 'pattern') return 'pattern';
    if (ind.category === 'custom') return 'custom';
    return 'technical';
}

export const AVAILABLE_INDICATORS: CatalogItem[] = BASE_INDICATORS.map(ind => ({
    ...ind,
    section: sectionOf(ind),
    remote: REMOTE_IDS.has(ind.id),
}));

export const SECTION_ORDER: IndicatorSection[] = ['technical', 'volume', 'pattern', 'custom'];

export const SECTION_LABELS: Record<IndicatorSection, string> = {
    technical: 'Technical indicators',
    volume: 'Volume & profiles',
    pattern: 'Patterns',
    custom: 'Premium',
};

export const CATEGORY_LABELS: Record<IndicatorCategoryId, string> = {
    favorites: 'Favorites',
    recent: 'Recently used',
    technical: 'Technical indicators',
    volume: 'Volume & profiles',
    pattern: 'Patterns',
    backend: 'Premium',
};

export const CATEGORY_ORDER: IndicatorCategoryId[] = ['favorites', 'recent', 'technical', 'volume', 'pattern', 'backend'];

export const RECENT_LIMIT = 10;
export const FAVORITES_KEY = 'tv-indicator-favorites';
export const RECENTS_KEY = 'tv-indicator-recents';

/** Lower-case and strip diacritics / Turkish dotless i so "Göstergeler" matches "gostergeler". */
export function foldText(s: string): string {
    return s
        .replace(/İ/g, 'i')
        .replace(/I/g, 'i')
        .toLowerCase()
        .replace(/ı/g, 'i')
        .replace(/ş/g, 's')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/** Lower is better; -1 = no match. */
export function scoreIndicator(ind: IndicatorItem, query: string): number {
    const q = foldText(query.trim());
    if (!q) return 0;
    const name = foldText(ind.name);
    const short = foldText(ind.shortName);
    const desc = foldText(ind.description);
    if (short === q || name === q) return 0;
    if (name.startsWith(q) || short.startsWith(q)) return 1;
    if (name.split(/[\s\-/]+/).some(w => w.startsWith(q))) return 2;
    if (name.includes(q) || short.includes(q)) return 3;
    // every token must appear somewhere (name, short name, description)
    const tokens = q.split(/\s+/);
    if (tokens.length > 1 && tokens.every(tk => name.includes(tk) || short.includes(tk) || desc.includes(tk))) return 4;
    if (desc.includes(q)) return 5;
    return -1;
}

/** Search across ALL indicators; best score first, catalogue order breaks ties. */
export function searchIndicators(query: string, items: CatalogItem[] = AVAILABLE_INDICATORS): CatalogItem[] {
    return items
        .map((ind, idx) => ({ ind, idx, score: scoreIndicator(ind, query) }))
        .filter(r => r.score >= 0)
        .sort((a, b) => a.score - b.score || a.idx - b.idx)
        .map(r => r.ind);
}

export interface IndicatorGroup {
    section: IndicatorSection;
    items: CatalogItem[];
}

/** Group by primary section in SECTION_ORDER (empty sections dropped), preserving item order. */
export function groupBySection(items: CatalogItem[]): IndicatorGroup[] {
    return SECTION_ORDER
        .map(section => ({ section, items: items.filter(i => i.section === section) }))
        .filter(g => g.items.length > 0);
}

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

function readIds(storage: StorageLike | null, key: string): string[] {
    if (!storage) return [];
    try {
        const raw = storage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch (e) {
        return [];
    }
}

/** Favourites + recents with persistence in a localStorage-like store. */
export class IndicatorPrefs {
    private _favorites: string[];
    private _recents: string[];

    constructor(private readonly _storage: StorageLike | null, private readonly _known: CatalogItem[] = AVAILABLE_INDICATORS) {
        const ids = new Set(_known.map(i => i.id));
        this._favorites = readIds(_storage, FAVORITES_KEY).filter(id => ids.has(id));
        this._recents = readIds(_storage, RECENTS_KEY).filter(id => ids.has(id)).slice(0, RECENT_LIMIT);
    }

    isFavorite(id: string): boolean {
        return this._favorites.includes(id);
    }

    /** Returns the new favourite state. */
    toggleFavorite(id: string): boolean {
        const i = this._favorites.indexOf(id);
        if (i >= 0) this._favorites.splice(i, 1);
        else this._favorites.push(id);
        this._save(FAVORITES_KEY, this._favorites);
        return i < 0;
    }

    /** Move to front, de-duplicated, capped at RECENT_LIMIT. */
    addRecent(id: string): void {
        this._recents = [id, ...this._recents.filter(r => r !== id)].slice(0, RECENT_LIMIT);
        this._save(RECENTS_KEY, this._recents);
    }

    favorites(): CatalogItem[] {
        return this._pick(this._favorites);
    }

    recents(): CatalogItem[] {
        return this._pick(this._recents);
    }

    private _pick(ids: string[]): CatalogItem[] {
        return ids.map(id => this._known.find(k => k.id === id)).filter((x): x is CatalogItem => !!x);
    }

    private _save(key: string, ids: string[]): void {
        try {
            this._storage?.setItem(key, JSON.stringify(ids));
        } catch (e) { /* storage unavailable / full */ }
    }
}

/** Items shown for a sidebar category (no search active). */
export function itemsForCategory(cat: IndicatorCategoryId, prefs: IndicatorPrefs, items: CatalogItem[] = AVAILABLE_INDICATORS): CatalogItem[] {
    switch (cat) {
        case 'favorites': return prefs.favorites();
        case 'recent': return prefs.recents();
        case 'backend': return items.filter(i => i.remote);
        default: return items.filter(i => i.section === cat);
    }
}
