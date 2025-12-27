/**
 * Trend Angle Drawing Implementation
 * A TrendLine that displays the angle with an arc visualization
 */

import {
    DrawingType,
    SerializedDrawing
} from './drawing';

import {
    DrawingSettingsConfig,
    createStyleTab,
    createVisibilityTab,
    colorRow,
    lineWidthRow,
    lineStyleRow
} from './drawing-settings-config';

import { TrendLineDrawing } from './trend-line-drawing';

export interface TrendAngleOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
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
            extendLeft: false,
            extendRight: false
        });
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
    // Override Settings - simpler config without extend options
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    {
                        title: 'Trend Angle',
                        rows: [
                            colorRow('color', 'Line Color'),
                            lineWidthRow('lineWidth'),
                            lineStyleRow('lineStyle'),
                        ]
                    }
                ]),
                createVisibilityTab()
            ]
        };
    }

    // Block extend changes - trend angle doesn't extend
    setSettingValue(key: string, value: any): void {
        if (key === 'extendLeft' || key === 'extendRight') {
            return;
        }
        super.setSettingValue(key, value);
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
        });

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });

        drawing.points = [...data.points];
        drawing.state = data.state;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
