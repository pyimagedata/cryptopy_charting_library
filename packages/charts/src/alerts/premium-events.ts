/**
 * Event registry of the Premium (backend-computed) indicators usable in event alerts (Phase 3b).
 *
 * Mirror of backend `alerts/premium_events.py` (PREMIUM_EVENTS): same type ids, event ids and EN/TR labels, and the
 * default indicator label of the server. `paramKeys` are exactly the option keys the chart overlay sends to
 * `/api/indicators/<id>` (its ALGO_KEYS / request object), so IndicatorRef.params equals the overlay request params.
 * Special Forces has no registry params (the overlay requests /api/special-forces/*), hence no keys.
 */
export interface PremiumEventSpec { id: string; en: string; tr: string }
export interface PremiumEventTypeSpec {
    /** Catalogue id = backend registry id. */
    type: string;
    /** Indicator label used in labels / the server default message. */
    title: string;
    events: readonly PremiumEventSpec[];
    paramKeys: readonly string[];
}

const e = (id: string, en: string, tr: string): PremiumEventSpec => ({ id, en, tr });

export const PREMIUM_EVENT_DEFS: readonly PremiumEventTypeSpec[] = [
    {
        type: 'trendline-breakout', title: 'Trendline Breakout',
        events: [e('breakout_up', 'Breakout Up', 'Yukarı kırılım'), e('breakout_down', 'Breakout Down', 'Aşağı kırılım')],
        paramKeys: ['period', 'useLength8', 'useLength10', 'useLength15', 'useLength30', 'volumeSpikeMultiplier', 'showHistory', 'showBullBreakout', 'showBearBreakdown'],
    },
    {
        type: 'fvg', title: 'FVG',
        events: [e('bull', 'Bullish FVG', 'Yükseliş FVG'), e('bear', 'Bearish FVG', 'Düşüş FVG')],
        paramKeys: ['mitigation', 'mitigationSrc', 'atrPeriod', 'minGapATR', 'minGapTicks', 'tickSize', 'autoTimeframe', 'dispCutoffMin', 'useDisplacement',
            'dispLookback', 'dispMult', 'bodyRatio', 'useSweep', 'sweepPivotP', 'sweepLookback', 'showMitigated', 'maxBoxes'],
    },
    {
        type: 'fvg-inversion', title: 'FVG Inversion',
        events: [e('bull', 'Bullish Inversion', 'Yükseliş inversion'), e('bear', 'Bearish Inversion', 'Düşüş inversion')],
        paramKeys: ['atrLength', 'minGapAtr', 'maxOpenBars', 'maxDisplayAgeBars', 'showOpenFvg', 'showFilled'],
    },
    {
        type: 'judas-swing', title: 'Judas Swing',
        events: [e('bull', 'Bullish Judas Swing', 'Yükseliş Judas Swing'), e('bear', 'Bearish Judas Swing', 'Düşüş Judas Swing')],
        paramKeys: ['timezone', 'refStartH', 'refEndH', 'maxConfirmBars', 'requireFvg', 'requireRetest', 'maxRetestBars', 'requireMss', 'mssLookbackBars',
            'mssPivotBars', 'enforceMssCutoff', 'mssCutoffH', 'requirePremiumDiscount', 'drawLastNDays', 'showFailed'],
    },
    {
        type: 'tdoji', title: 'Tdoji',
        events: [e('buy', 'Buy', 'Al'), e('sell', 'Sell', 'Sat')],
        paramKeys: ['curveLength', 'slopeLength', 'signalLength'],
    },
    {
        type: 'tdoji-mom', title: 'TDOJI MOM',
        events: [e('cross_up', 'Crosses above zero', 'Sıfırı yukarı kesti'), e('cross_down', 'Crosses below zero', 'Sıfırı aşağı kesti')],
        paramKeys: ['period'],
    },
    {
        type: 'thunderbirdx', title: 'Thunderbirdx',
        events: [e('bull', 'Bullish', 'Yükseliş'), e('bear', 'Bearish', 'Düşüş')],
        paramKeys: ['postSmoothingStyle', 'maStyle', 'momentumLength', 'momentumSmoothing', 'postSmoothing', 'maLength'],
    },
    {
        type: 'abcd-pattern', title: 'ABCD Pattern',
        events: [e('bull', 'Bullish ABCD', 'Yükseliş ABCD'), e('bear', 'Bearish ABCD', 'Düşüş ABCD')],
        paramKeys: ['period'],
    },
    {
        type: 'harmonic-patterns', title: 'Harmonic Patterns',
        events: [
            e('bull', 'Bullish Harmonic', 'Yükseliş Harmonik'), e('bear', 'Bearish Harmonic', 'Düşüş Harmonik'),
            e('signal_bull', 'Bullish Harmonic Signal', 'Yükseliş Harmonik Sinyal'), e('signal_bear', 'Bearish Harmonic Signal', 'Düşüş Harmonik Sinyal'),
        ],
        paramKeys: ['period', 'showABCD', 'showGartley', 'showBat', 'showCypher', 'showSignals', 'strongSignal'],
    },
    {
        type: 'chart-patterns', title: 'Chart Patterns',
        events: [e('bull', 'Bullish Pattern', 'Yükseliş Formasyon'), e('bear', 'Bearish Pattern', 'Düşüş Formasyon')],
        paramKeys: ['period', 'showPrediction', 'showHistory', 'showDoubleTop', 'showDoubleBottom', 'showBullPennant', 'showBearPennant', 'showBullFlag',
            'showBearFlag', 'showBullWedgeCont', 'showBearWedgeCont', 'showBullWedgeRev', 'showBearWedgeRev', 'showHeadAndShoulders',
            'showInverseHeadAndShoulders', 'showCupAndHandle', 'showAscendingTriangle'],
    },
    {
        type: 'eqhl-v2', title: 'Equal Highs/Lows V2',
        events: [e('equal_highs', 'Equal Highs', 'Eşit Tepeler'), e('equal_lows', 'Equal Lows', 'Eşit Dipler')],
        paramKeys: ['pivotBars', 'atrLength', 'useAcademicGamma', 'toleranceMult', 'gammaToleranceMult', 'strictSideRatio', 'safeSideRatio', 'minGapBars',
            'maxLookbackBars', 'hideSwept'],
    },
    {
        type: 'bobbin', title: 'Bobbin',
        events: [e('bobbin', 'New Bobbin', 'Yeni Bobbin')],
        paramKeys: ['minRun', 'maxHeightAtr', 'scoreThreshold', 'rightExtend'],
    },
    {
        type: 'smt-divergence', title: 'SMT Divergence',
        events: [e('bull', 'Bullish SMT', 'Yükseliş SMT'), e('bear', 'Bearish SMT', 'Düşüş SMT')],
        paramKeys: ['compareSymbol', 'correlation', 'pivotLen', 'tolerance', 'maxGap', 'showBullish', 'showBearish', 'drawLast'],
    },
    {
        type: 'special-forces', title: 'Special Forces',
        events: [
            e('bobbin_bull', 'Bullish Bobbin', 'Yükseliş Bobbin'), e('bobbin_bear', 'Bearish Bobbin', 'Düşüş Bobbin'),
            e('engulf_bull', 'Bullish Engulf', 'Yükseliş Engulf'), e('engulf_bear', 'Bearish Engulf', 'Düşüş Engulf'),
        ],
        paramKeys: [],
    },
];
