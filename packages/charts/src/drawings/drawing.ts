/**
 * Drawing System - Base types and interfaces
 */

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
    | 'threeDrives'
    | 'headShoulders'
    | 'abcd'
    | 'trianglePattern'
    | 'longPosition'
    | 'shortPosition'
    | 'priceRange'
    | 'dateRange'
    | 'datePriceRange'
    | 'flagMarked'
    | 'sticker';

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
    // Type-specific properties
    extendLeft?: boolean;
    extendRight?: boolean;
    extendLines?: boolean;
    showLabels?: boolean;
    showPrices?: boolean;
    opacity?: number;
    backgroundOpacity?: number;
    reversed?: boolean;
    levels?: Array<{ value: number; color: string; visible: boolean }>;
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

/** Generate unique drawing ID */
export function generateDrawingId(): string {
    return `drawing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
