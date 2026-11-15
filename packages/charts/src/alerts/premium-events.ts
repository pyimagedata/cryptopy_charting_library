/**
 * Event registry of the Premium (backend-computed) indicators usable in event alerts (Phase 3b).
 *
 * Mirror of backend `alerts/premium_events.py` (PREMIUM_EVENTS): same type ids, event ids and EN labels (the Turkish ones live in TRANSLATIONS.tr), and the
 * default indicator label of the server. `paramKeys` are exactly the option keys the chart overlay sends to
 * `/api/indicators/<id>` (its ALGO_KEYS / request object), so IndicatorRef.params equals the overlay request params.
 * Special Forces has no registry params (the overlay requests /api/special-forces/*), hence no keys.
 */
export interface PremiumEventSpec { id: string; en: string }
export interface PremiumEventTypeSpec {
    /** Catalogue id = backend registry id. */
    type: string;
    /** Indicator label used in labels / the server default message. */
    title: string;
    events: readonly PremiumEventSpec[];
    paramKeys: readonly string[];
}

const e = (id: string, en: string): PremiumEventSpec => ({ id, en });

export const PREMIUM_EVENT_DEFS: readonly PremiumEventTypeSpec[] = [
    {
        type: 'trendline-breakout', title: 'Trendline Breakout',
        events: [e('breakout_up', 'Breakout Up'), e('breakout_down', 'Breakout Down')],
        paramKeys: ['period', 'useLength8', 'useLength10', 'useLength15', 'useLength30', 'volumeSpikeMultiplier', 'showHistory', 'showBullBreakout', 'showBearBreakdown'],
    },
    {
        type: 'fvg', title: 'FVG',
        events: [e('bull', 'Bullish FVG'), e('bear', 'Bearish FVG')],
        paramKeys: ['mitigation', 'mitigationSrc', 'atrPeriod', 'minGapATR', 'minGapTicks', 'tickSize', 'autoTimeframe', 'dispCutoffMin', 'useDisplacement',
            'dispLookback', 'dispMult', 'bodyRatio', 'useSweep', 'sweepPivotP', 'sweepLookback', 'showMitigated', 'maxBoxes'],
    },
    {
        type: 'fvg-inversion', title: 'FVG Inversion',
        events: [e('bull', 'Bullish Inversion'), e('bear', 'Bearish Inversion')],
        paramKeys: ['atrLength', 'minGapAtr', 'maxOpenBars', 'maxDisplayAgeBars', 'showOpenFvg', 'showFilled'],
    },
    {
        type: 'judas-swing', title: 'Judas Swing',
        events: [e('bull', 'Bullish Judas Swing'), e('bear', 'Bearish Judas Swing')],
        paramKeys: ['timezone', 'refStartH', 'refEndH', 'maxConfirmBars', 'requireFvg', 'requireRetest', 'maxRetestBars', 'requireMss', 'mssLookbackBars',
            'mssPivotBars', 'enforceMssCutoff', 'mssCutoffH', 'requirePremiumDiscount', 'drawLastNDays', 'showFailed'],
    },
    {
        type: 'tdoji', title: 'Tdoji',
        events: [e('buy', 'Buy'), e('sell', 'Sell')],
        paramKeys: ['curveLength', 'slopeLength', 'signalLength'],
    },
    {
        type: 'tdoji-mom', title: 'TDOJI MOM',
        events: [e('cross_up', 'Crosses above zero'), e('cross_down', 'Crosses below zero')],
        paramKeys: ['period'],
    },
    {
        type: 'thunderbirdx', title: 'Thunderbirdx',
        events: [e('bull', 'Bullish'), e('bear', 'Bearish')],
        paramKeys: ['postSmoothingStyle', 'maStyle', 'momentumLength', 'momentumSmoothing', 'postSmoothing', 'maLength'],
    },
    {
        type: 'abcd-pattern', title: 'ABCD Pattern',
        events: [e('bull', 'Bullish ABCD'), e('bear', 'Bearish ABCD')],
        paramKeys: ['period'],
    },
    {
        type: 'harmonic-patterns', title: 'Harmonic Patterns',
        events: [
            e('bull', 'Bullish Harmonic'), e('bear', 'Bearish Harmonic'),
            e('signal_bull', 'Bullish Harmonic Signal'), e('signal_bear', 'Bearish Harmonic Signal'),
        ],
        paramKeys: ['period', 'showABCD', 'showGartley', 'showBat', 'showCypher', 'showSignals', 'strongSignal'],
    },
    {
        type: 'chart-patterns', title: 'Chart Patterns',
        events: [e('bull', 'Bullish Pattern'), e('bear', 'Bearish Pattern')],
        paramKeys: ['period', 'showPrediction', 'showHistory', 'showDoubleTop', 'showDoubleBottom', 'showBullPennant', 'showBearPennant', 'showBullFlag',
            'showBearFlag', 'showBullWedgeCont', 'showBearWedgeCont', 'showBullWedgeRev', 'showBearWedgeRev', 'showHeadAndShoulders',
            'showInverseHeadAndShoulders', 'showCupAndHandle', 'showAscendingTriangle'],
    },
    {
        type: 'eqhl-v2', title: 'Equal Highs/Lows V2',
        events: [e('equal_highs', 'Equal Highs'), e('equal_lows', 'Equal Lows'),
            e('equal_high_sweep_confirmed', 'EQH Sweep Confirmed'),
            e('equal_low_sweep_confirmed', 'EQL Sweep Confirmed')],
        paramKeys: ['pivotBars', 'atrLength', 'useAcademicGamma', 'toleranceMult', 'gammaToleranceMult', 'strictSideRatio', 'safeSideRatio', 'minGapBars',
            'maxLookbackBars', 'hideSwept', 'confirmBars', 'confirmCloseInside', 'confirmCandleType'],
    },
    {
        type: 'bobbin', title: 'Bobbin',
        events: [e('bobbin', 'New Bobbin')],
        paramKeys: ['minRun', 'maxHeightAtr', 'scoreThreshold', 'rightExtend'],
    },
    {
        type: 'smt-divergence', title: 'SMT Divergence',
        events: [e('bull', 'Bullish SMT'), e('bear', 'Bearish SMT')],
        paramKeys: ['compareSymbol', 'correlation', 'pivotLen', 'tolerance', 'maxGap', 'showBullish', 'showBearish', 'drawLast'],
    },
    {
        type: 'special-forces', title: 'Special Forces',
        events: [
            e('bobbin_bull', 'Bullish Bobbin'), e('bobbin_bear', 'Bearish Bobbin'),
            e('engulf_bull', 'Bullish Engulf'), e('engulf_bear', 'Bearish Engulf'),
        ],
        paramKeys: [],
    },
];
