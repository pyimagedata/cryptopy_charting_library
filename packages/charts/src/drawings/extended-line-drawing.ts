/**
 * Extended Line Drawing Implementation
 * A line that extends infinitely in BOTH directions (left and right)
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

export interface ExtendedLineOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
}

/**
 * Extended Line - Extends infinitely in both directions from anchor points
 */
export class ExtendedLineDrawing extends TrendLineDrawing {
    readonly type: DrawingType = 'extendedLine';

    constructor(options: ExtendedLineOptions = {}) {
        super({
            ...options,
            extendLeft: true,
            extendRight: true
        });
    }

    // =========================================================================
    // Override Settings - hide extend options since they're always true
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    {
                        title: 'Extended Line',
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

    // Block extend changes - always both directions
    setSettingValue(key: string, value: any): void {
        if (key === 'extendLeft' || key === 'extendRight') {
            return; // Ignore - always extended in both directions
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
            type: 'extendedLine'
        };
    }

    static fromJSON(data: SerializedDrawing): ExtendedLineDrawing {
        const drawing = new ExtendedLineDrawing({
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
