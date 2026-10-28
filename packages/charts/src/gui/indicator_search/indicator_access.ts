/**
 * Plan-based indicator access (DOM-free). The host (EvoTrading) tells the library which
 * catalogue ids the logged-in user may use; everything else shows as locked in the
 * indicator dialog and is refused on every add path. `null` = no restriction, so the
 * library keeps working standalone.
 *
 * The state is module-global on purpose: a page can hold several chart widgets
 * (multi-chart layout) and the access is a property of the user, not of one chart.
 */

export interface IndicatorAccess {
    /** Catalogue ids (indicator_catalog.ts) the user may use. */
    allowed: string[];
    /** id -> plan needed ("PLUS" / "PRO"); null = admin only. Missing id = unknown. */
    required?: Record<string, string | null>;
}

/** IndicatorManager.typeIdOf() value -> catalogue id. Unlisted typeIds (drafts) are never locked. */
export const TYPE_ID_TO_CATALOG_ID: Record<string, string> = {
    RSI: 'rsi',
    EMA: 'ema',
    SMA: 'sma',
    BollingerBands: 'bb',
    MACD: 'macd',
    Stochastic: 'stoch',
    SAR: 'sar',
    SuperTrend: 'supertrend',
    AlphaTrend: 'alphatrend',
    Ichimoku: 'ichimoku',
    FixedRangeVolumeProfile: 'fixed-range-volume-profile',
    ZigZagTrendline: 'zigzag-trendline',
    Volume: 'volume',
    HMA: 'hma',
    StochasticRSI: 'stochrsi',
    HalfTrend: 'halftrend',
    TdojiOscillator: 'tdoji',
    Thunderbirdx: 'thunderbirdx',
    TdojiSR: 'tdoji-sr',
    TdojiMom: 'tdoji-mom',
    ZigZag: 'zigzag',
    ABCDPattern: 'abcd-pattern',
    HarmonicPattern: 'harmonic-patterns',
    ChartPatterns: 'chart-patterns',
    TrendlineBreakout: 'trendline-breakout',
    DeMarkPivot: 'demark-pivot',
    SMC: 'smc',
    Bobbin: 'bobbin',
    FVG: 'fvg',
    FvgInversion: 'fvg-inversion',
    EqHLV2: 'eqhl-v2',
    JudasSwing: 'judas-swing',
    SMTDivergence: 'smt-divergence',
    SpecialForces: 'special-forces',
};

export function isIndicatorAllowed(access: IndicatorAccess | null | undefined, id: string): boolean {
    if (!access) return true;
    return access.allowed.indexOf(id) >= 0;
}

/** Plan label for a locked indicator: "PLUS" / "PRO", or "Admin" when only staff may use it. */
export function requiredPlanLabel(access: IndicatorAccess | null | undefined, id: string): string {
    const plan = access?.required?.[id];
    return plan ? String(plan).toUpperCase() : 'Admin';
}

type Listener = (access: IndicatorAccess | null) => void;

let current: IndicatorAccess | null = null;
const listeners = new Set<Listener>();

export function getIndicatorAccess(): IndicatorAccess | null {
    return current;
}

export function setIndicatorAccess(access: IndicatorAccess | null | undefined): void {
    current = access && Array.isArray(access.allowed)
        ? { allowed: access.allowed.slice(), required: { ...(access.required ?? {}) } }
        : null;
    listeners.forEach(fn => fn(current));
}

export function subscribeIndicatorAccess(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}
