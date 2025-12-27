/**
 * Info Line Drawing Implementation
 * A measurement tool that displays price change, bar count, time, and angle
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

export interface InfoLineOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
}

/**
 * Info Line - A measurement line that shows price, time, and angle information
 */
export class InfoLineDrawing extends TrendLineDrawing {
    readonly type: DrawingType = 'infoLine';

    // Measurement data (calculated during render)
    private _measurements: {
        priceChange: number;
        priceChangePercent: number;
        barCount: number;
        timeDuration: string;
        pixelDistance: number;
        angle: number;
    } = {
            priceChange: 0,
            priceChangePercent: 0,
            barCount: 0,
            timeDuration: '',
            pixelDistance: 0,
            angle: 0
        };

    constructor(options: InfoLineOptions = {}) {
        super({
            ...options,
            extendLeft: false,
            extendRight: false
        });
    }

    // =========================================================================
    // Override Settings - simpler config for info line
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    {
                        title: 'Info Line',
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

    // =========================================================================
    // Measurement Calculations
    // =========================================================================

    /**
     * Calculate all measurements between two points
     * @param p1 First point with pixel coords, price and timestamp
     * @param p2 Second point with pixel coords, price and timestamp  
     * @param barIntervalMs Bar interval in milliseconds (e.g., 60000 for 1m, 3600000 for 1h)
     */
    calculateMeasurements(
        p1: { x: number; y: number; price: number; time: number },
        p2: { x: number; y: number; price: number; time: number },
        barIntervalMs: number = 60000 // Default 1 minute
    ): void {
        // Price calculations
        this._measurements.priceChange = p2.price - p1.price;
        this._measurements.priceChangePercent = p1.price !== 0
            ? (this._measurements.priceChange / p1.price) * 100
            : 0;

        // Time/Bar calculations - time is already in ms (Unix timestamp)
        const timeDiffMs = Math.abs(p2.time - p1.time);

        // Calculate bar count based on actual bar interval (+1 to include both endpoints)
        this._measurements.barCount = Math.round(timeDiffMs / barIntervalMs) + 1;

        // Format duration
        this._measurements.timeDuration = this._formatDuration(timeDiffMs);

        // Pixel distance
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        this._measurements.pixelDistance = Math.round(Math.sqrt(dx * dx + dy * dy));

        // Angle in degrees (from horizontal, positive = upward)
        this._measurements.angle = Math.atan2(-dy, dx) * (180 / Math.PI);
    }

    /**
     * Format time duration to human readable string
     */
    private _formatDuration(ms: number): string {
        const totalSeconds = Math.floor(ms / 1000);
        const totalMinutes = Math.floor(totalSeconds / 60);
        const totalHours = Math.floor(totalMinutes / 60);
        const days = Math.floor(totalHours / 24);

        const hours = totalHours % 24;
        const minutes = totalMinutes % 60;

        const parts: string[] = [];

        if (days > 0) {
            parts.push(`${days}g`);
        }
        if (hours > 0) {
            parts.push(`${hours}sa`);
        }
        if (minutes > 0 && days === 0) { // Only show minutes if less than a day
            parts.push(`${minutes}dk`);
        }

        if (parts.length === 0) {
            // Less than a minute
            const seconds = totalSeconds % 60;
            return `${seconds}sn`;
        }

        return parts.join(' ');
    }

    /**
     * Get calculated measurements
     */
    getMeasurements() {
        return this._measurements;
    }

    // =========================================================================
    // Serialization
    // =========================================================================

    toJSON(): SerializedDrawing {
        const json = super.toJSON();
        return {
            ...json,
            type: 'infoLine'
        };
    }

    static fromJSON(data: SerializedDrawing): InfoLineDrawing {
        const drawing = new InfoLineDrawing({
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
