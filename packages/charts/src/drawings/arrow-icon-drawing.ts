/**
 * Arrow Icon Drawing Implementation (Single Point Up/Down Markers)
 */

import {
    Drawing,
    DrawingPoint,
    DrawingStyle,
    DrawingState,
    DrawingType,
    DEFAULT_DRAWING_STYLE,
    generateDrawingId,
    SerializedDrawing
} from './drawing';

import {
    DrawingSettingsProvider,
    DrawingSettingsConfig,
    AttributeBarItem,
    createStyleTab,
    createVisibilityTab,
    colorRow,
} from './drawing-settings-config';

export interface ArrowIconOptions {
    type: 'arrowMarkedUp' | 'arrowMarkedDown';
    color?: string;
    size?: number;
}

/**
 * Arrow Icon - A single-point icon marker (Up or Down)
 */
export class ArrowIconDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType;

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Icon specific options
    size: number = 32;

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: ArrowIconOptions) {
        this.id = generateDrawingId();
        this.type = options.type;
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || (this.type === 'arrowMarkedUp' ? '#089981' : '#f23645'), // Green for UP, Red for DOWN
        };
        this.size = options.size || 32;
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    {
                        title: this.type === 'arrowMarkedUp' ? 'Arrow Up' : 'Arrow Down',
                        rows: [
                            colorRow('color', 'Color'),
                            {
                                type: 'slider',
                                key: 'size',
                                label: 'Size',
                                min: 12,
                                max: 128,
                                step: 1,
                                defaultValue: 32
                            },
                        ]
                    }
                ]),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Color' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'color': return this.style.color;
            case 'size': return this.size;
            case 'visible': return this.visible;
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'color':
                this.style.color = value;
                break;
            case 'size':
                this.size = value;
                break;
            case 'visible':
                this.visible = value;
                break;
        }
    }

    /** Add a point to the drawing */
    addPoint(time: number, price: number): void {
        if (this.points.length === 0) {
            this.points.push({ time, price });
            this.state = 'complete'; // Finishes in one click
        }
    }

    /** Check if drawing is complete */
    isComplete(): boolean {
        return this.points.length >= 1;
    }

    /** Update the last point (preview) */
    updateLastPoint(time: number, price: number): void {
        if (this.points.length === 0) {
            this.points = [{ time, price }];
        } else {
            this.points[0] = { time, price };
        }
    }

    /** Set cached pixel coordinates */
    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = points;
    }

    /** Get pixel coordinates */
    getPixelPoints(): { x: number; y: number }[] {
        return this._pixelPoints;
    }

    /** Hit test on the icon area */
    hitTest(x: number, y: number, threshold: number = 5): boolean {
        if (this._pixelPoints.length === 0) return false;

        const p = this._pixelPoints[0];
        const halfSize = this.size / 2;

        return (
            x >= p.x - halfSize - threshold &&
            x <= p.x + halfSize + threshold &&
            y >= p.y - halfSize - threshold &&
            y <= p.y + halfSize + threshold
        );
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length === 0) return null;

        const p = this._pixelPoints[0];
        const halfSize = this.size / 2;

        return {
            x: p.x - halfSize,
            y: p.y - halfSize,
            width: this.size,
            height: this.size
        };
    }

    // =========================================================================
    // Serialization
    // =========================================================================

    toJSON(): SerializedDrawing {
        return {
            id: this.id,
            type: this.type,
            points: [...this.points],
            style: { ...this.style },
            state: this.state === 'selected' ? 'complete' : this.state,
            visible: this.visible,
            locked: this.locked,
            // Custom properties
            size: this.size,
        };
    }

    static fromJSON(data: SerializedDrawing): ArrowIconDrawing {
        const drawing = new ArrowIconDrawing({
            type: data.type as 'arrowMarkedUp' | 'arrowMarkedDown',
            color: data.style.color,
            size: (data as any).size,
        });

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
