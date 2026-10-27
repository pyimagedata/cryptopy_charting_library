/**
 * Ray Drawing Implementation
 * A line that starts from a point and extends infinitely in one direction
 */

import {
    DrawingType,
    SerializedDrawing
} from './drawing';

import { TrendLineDrawing } from './trend-line-drawing';

export interface RayOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
}

/**
 * Ray - A line that extends infinitely from the second point
 * Inherits from TrendLineDrawing with forced extendRight = true
 */
export class RayDrawing extends TrendLineDrawing {
    readonly type: DrawingType = 'ray';

    constructor(options: RayOptions = {}) {
        // Force extendRight = true for ray behavior
        super({
            ...options,
            extendLeft: false,
            extendRight: true
        });
    }

    // Ray is always extended right: no Extend section in settings
    protected getToolTitle(): string {
        return 'Ray';
    }

    protected allowExtendSettings(): boolean {
        return false;
    }

    // Override setSettingValue to prevent changing extend properties
    setSettingValue(key: string, value: any): void {
        // Block extend changes
        if (key === 'extendLeft' || key === 'extendRight') {
            return; // Ignore - Ray always extends right
        }
        super.setSettingValue(key, value);
    }

    // =========================================================================
    // Serialization
    // =========================================================================

    /** Serialize drawing to JSON for persistence */
    toJSON(): SerializedDrawing {
        const json = super.toJSON();
        return {
            ...json,
            type: 'ray', // Override type
            extendLeft: false,
            extendRight: true
        };
    }

    /** Create RayDrawing from serialized data */
    static fromJSON(data: SerializedDrawing): RayDrawing {
        const drawing = new RayDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            lineDash: data.style.lineDash,
        });
        return TrendLineDrawing.applySerialized(drawing, data);
    }
}
