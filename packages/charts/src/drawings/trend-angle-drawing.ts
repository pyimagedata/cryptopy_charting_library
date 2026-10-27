/**
 * Trend Angle Drawing Implementation
 * Trend Line ailesinin bir uyesi: aci yayi ve aci metni ile birlikte cizilir.
 */

import {
    DrawingType,
    SerializedDrawing
} from './drawing';

import {
    DrawingSettingsConfig,
    createStyleTab,
    createVisibilityTab
} from './drawing-settings-config';

import { buildLineStyleSections } from './line-tool-common';
import { TrendLineDrawing } from './trend-line-drawing';

export interface TrendAngleOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    extendLeft?: boolean;
    extendRight?: boolean;
}

/**
 * Trend Angle - A trend line that shows the angle between two points with arc
 */
export class TrendAngleDrawing extends TrendLineDrawing {
    readonly type: DrawingType = 'trendAngle';

    // Calculated angle in degrees
    private _angle: number = 0;

    constructor(options: TrendAngleOptions = {}) {
        super({
            ...options,
            extendLeft: options.extendLeft ?? false,
            extendRight: options.extendRight ?? false
        });
        // TradingView varsayilani: metin boyutu 12
        this.style.fontSize = 12;
    }

    // =========================================================================
    // Angle Calculation
    // =========================================================================

    /**
     * Calculate angle from horizontal (0°) to the line
     * @param p1 First point (pixel coordinates)
     * @param p2 Second point (pixel coordinates)
     */
    calculateAngle(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;

        // Calculate angle from horizontal (canvas Y is inverted, so negate dy)
        this._angle = Math.atan2(-dy, dx) * (180 / Math.PI);

        return this._angle;
    }

    /**
     * Get the calculated angle
     */
    getAngle(): number {
        return this._angle;
    }

    // =========================================================================
    // Settings: cizgi, uzatma, orta nokta, fiyat etiketleri, istatistik alt kumesi (uc sekli yok)
    // =========================================================================

    protected getToolTitle(): string {
        return 'Trend Angle';
    }

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab(buildLineStyleSections(this.getToolTitle(), true, { ends: false, fullStats: false })),
                createVisibilityTab()
            ]
        };
    }

    // =========================================================================
    // Serialization
    // =========================================================================

    toJSON(): SerializedDrawing {
        const json = super.toJSON();
        return {
            ...json,
            type: 'trendAngle'
        };
    }

    static fromJSON(data: SerializedDrawing): TrendAngleDrawing {
        const drawing = new TrendAngleDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            lineDash: data.style.lineDash,
            extendLeft: data.extendLeft,
            extendRight: data.extendRight,
        });
        return TrendLineDrawing.applySerialized(drawing, data);
    }
}
