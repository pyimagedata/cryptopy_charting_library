/**
 * Drawing System - Base types and interfaces
 */

import type { IntervalsVisibilities } from './intervals-visibility';

/** Logical point on the chart (time + price) */
export interface DrawingPoint {
    time: number;      // Unix timestamp in milliseconds
    price: number;     // Price value
}

/** Drawing style configuration */
export interface DrawingStyle {
    color: string;
    lineWidth: number;
    lineDash?: number[];
    fillColor?: string;
    fillOpacity?: number;
    /** Kapali sekillerde arka plan dolgusu (undefined = acik) */
    fillEnabled?: boolean;
    // Text properties
    text?: string;
    textColor?: string;
    fontSize?: number;
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    textHAlign?: 'left' | 'center' | 'right';
    textVAlign?: 'top' | 'middle' | 'bottom';
}

/** Base drawing types */
export type DrawingType =
    | 'trendLine'
    | 'horizontalLine'
    | 'verticalLine'
    | 'ray'
    | 'infoLine'
    | 'extendedLine'
    | 'trendAngle'
    | 'horizontalRay'
    | 'crossLine'
    | 'parallelChannel'
    | 'regressionTrend'
    | 'arrow'
    | 'arrowMarker'
    | 'arrowMarkedUp'
    | 'arrowMarkedDown'
    | 'arrowMarkedLeft'
    | 'arrowMarkedRight'
    | 'rectangle'
    | 'ellipse'
    | 'brush'
    | 'highlighter'
    | 'fibRetracement'
    | 'fibExtension'
    | 'fibChannel'
    | 'xabcd'
    | 'cypher'
    | 'elliotImpulse'
    | 'elliotCorrection'
    | 'elliotTriangle'
    | 'elliotDoubleCombo'
    | 'elliotTripleCombo'
    | 'threeDrives'
    | 'headShoulders'
    | 'abcd'
    | 'trianglePattern'
    | 'longPosition'
    | 'shortPosition'
    | 'priceRange'
    | 'dateRange'
    | 'datePriceRange'
    | 'anchoredVwap'
    | 'fixedRangeVolumeProfile'
    | 'anchoredVolumeProfile'
    | 'pitchfork'
    | 'schiffPitchfork'
    | 'modifiedSchiffPitchfork'
    | 'insidePitchfork'
    | 'pitchfan'
    | 'fibTimeZone'
    | 'trendBasedFibTime'
    | 'fibSpeedResistanceFan'
    | 'fibSpeedResistanceArcs'
    | 'fibCircles'
    | 'fibSpiral'
    | 'fibWedge'
    | 'gannBox'
    | 'gannSquareFixed'
    | 'gannSquare'
    | 'gannFan'
    | 'disjointChannel'
    | 'flatTopBottom'
    | 'projection'
    | 'positionForecast'
    | 'barsPattern'
    | 'ghostFeed'
    | 'text'
    | 'callout'
    | 'priceLabel'
    | 'note'
    | 'priceNote'
    | 'pin'
    | 'signpost'
    | 'comment'
    | 'table'
    | 'flagMarked'
    | 'sticker'
    | 'rotatedRectangle'
    | 'ellipse'
    | 'triangle'
    | 'arc'
    | 'path'
    | 'circle'
    | 'polyline'
    | 'curve'
    | 'doubleCurve'
    | 'cyclicLines'
    | 'timeCycles'
    | 'sineLine'
    | 'xabcdPattern'
    | 'cypherPattern'
    | 'elliotImpulse'
    | 'elliotCorrection'
    | 'elliotTriangle'
    | 'elliotDoubleCombo'
    | 'elliotTripleCombo'
    | 'threeDrives'
    | 'headShoulders';

/** Drawing state */
export type DrawingState = 'creating' | 'complete' | 'selected' | 'editing';

/** Serialized drawing data for persistence */
export interface SerializedDrawing {
    id: string;
    type: DrawingType;
    points: DrawingPoint[];
    style: DrawingStyle;
    state: DrawingState;
    visible: boolean;
    locked: boolean;
    paneId?: string | null;
    /** Zaman dilimlerinde gorunurluk; yalnizca varsayilandan farkliysa yazilir (yoksa hepsi gorunur). */
    intervalsVisibilities?: IntervalsVisibilities;
    // Type-specific properties
    extendLeft?: boolean;
    /** Dikdortgen orta cizgisi */
    middleLine?: { show: boolean; color: string; width: number; style: string };
    extendRight?: boolean;
    extendLines?: boolean;
    showLabels?: boolean;
    showPrices?: boolean;
    /** Dikey cizgi: tam yukseklik (yalnizca true uygulanir) ve metin yonu */
    extendLine?: boolean;
    textOrientation?: 'vertical' | 'horizontal';
    opacity?: number;
    backgroundOpacity?: number;
    reversed?: boolean;
    size?: number;
    direction?: 'up' | 'down' | 'left' | 'right';
    levels?: Array<{ value: number; color: string; visible: boolean; text?: string }>;
    /** Trend Line ailesinin ortak ayarlari (bkz. line-tool-common.ts LineToolProps). */
    lineProps?: Record<string, any>;
    /** Elliott dalga araclari: dalga cizgileri gorunurlugu ve derece (bkz. elliott-common.ts). */
    elliott?: { showWave: boolean; degree: string };
    /** Text / Callout metin kutusu ayarlari (bkz. text-common.ts TextBoxState); yoksa eski kayit. */
    textBox?: Record<string, any>;
    /** Fiyat etiketi / ok isareti / ok isaretleyici ek ayarlari (yoksa eski kayit). */
    ext?: Record<string, any>;
    /** Fibonacci araclarinin ortak ayarlari (bkz. fib-common.ts FibCommonSettings). */
    fib?: Record<string, any>;
    // Text properties
    text?: string;
    textColor?: string;
    fontSize?: number;
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    textHAlign?: 'left' | 'center' | 'right';
    textVAlign?: 'top' | 'middle' | 'bottom';
    // Position and Range properties
    profitPercent?: number;
    stopPercent?: number;
    quantity?: number;
    profitColor?: string;
    lossColor?: string;
    entryColor?: string;
    fillColor?: string;
    /** Long/Short Position ayarlari (bkz. position-common.ts PositionProps). */
    position?: Record<string, any>;
}

/** Base drawing interface */
export interface Drawing {
    readonly id: string;
    readonly type: DrawingType;
    points: DrawingPoint[];
    style: DrawingStyle;
    state: DrawingState;
    visible: boolean;
    locked: boolean;
    paneId?: string | null;
    /** Zaman dilimlerinde gorunurluk (yoksa tum zaman dilimlerinde gorunur); DrawingManager serilestirir. */
    intervalsVisibilities?: IntervalsVisibilities;

    /** Add a point to the drawing */
    addPoint(time: number, price: number): void;

    /** Check if point is near this drawing (for selection) */
    hitTest(x: number, y: number, threshold: number): boolean;

    /** Get bounding box in pixel coordinates */
    getBounds(): { x: number; y: number; width: number; height: number } | null;

    /** Serialize drawing to JSON for persistence */
    /** Serialize drawing to JSON for persistence */
    toJSON(): SerializedDrawing;

    /** Check if drawing is complete (optional, for single-point drawings) */
    isComplete?(): boolean;
}

/** Default drawing styles */
export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
    color: '#2962ff',
    lineWidth: 2,
    lineDash: [],
};

export * from './intervals-visibility';
export * from './three-drives-drawing';
export * from './head-shoulders-drawing';

/** Generate unique drawing ID */
export function generateDrawingId(): string {
    return `drawing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
