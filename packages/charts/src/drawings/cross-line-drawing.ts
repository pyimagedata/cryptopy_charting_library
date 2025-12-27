import {
    Drawing,
    DrawingType,
    DrawingPoint,
    DrawingStyle,
    DrawingState,
    SerializedDrawing,
    generateDrawingId,
    DEFAULT_DRAWING_STYLE
} from './drawing';
import {
    DrawingSettingsConfig,
    createStyleTab,
    createVisibilityTab,
    colorRow,
    lineWidthRow,
    lineStyleRow
} from './drawing-settings-config';

export class CrossLineDrawing implements Drawing {
    readonly id: string;
    readonly type: DrawingType = 'crossLine';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Cached pixel coordinates (updated by renderer)
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: { color?: string } = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#2962ff',
        };
    }

    /** Set cached pixel coordinates (called by renderer) */
    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = points;
    }

    addPoint(time: number, price: number): void {
        if (this.points.length < 1) {
            this.points.push({ time, price });
            // Cross Line is complete after 1 point
            this.state = 'complete';
        }
    }

    updateLastPoint(time: number, price: number): void {
        if (this.points.length > 0) {
            this.points[this.points.length - 1] = { time, price };
        }
    }

    isComplete(): boolean {
        return this.state === 'complete' && this.points.length >= 1;
    }

    hitTest(x: number, y: number, threshold: number = 5): boolean {
        if (this._pixelPoints.length < 1) return false;

        const p = this._pixelPoints[0];

        // Hit if close to vertical line (x distance) OR horizontal line (y distance)
        const hitVertical = Math.abs(x - p.x) <= threshold;
        const hitHorizontal = Math.abs(y - p.y) <= threshold;

        return hitVertical || hitHorizontal;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        // Bounds are infinite (cross extends to all edges)
        return null;
    }

    toJSON(): SerializedDrawing {
        return {
            id: this.id,
            type: this.type,
            points: this.points,
            style: this.style,
            state: this.state,
            visible: this.visible,
            locked: this.locked
        };
    }

    static fromJSON(data: SerializedDrawing): CrossLineDrawing {
        const drawing = new CrossLineDrawing();
        // But usually we assign to (drawing as any).id or similar if it's readonly.
        // Let's check how other drawings do it. Usually constructor takes ID or we just force it.
        (drawing as any).id = data.id;
        drawing.points = data.points;
        drawing.style = data.style;
        drawing.state = data.state;
        drawing.visible = data.visible ?? true;
        drawing.locked = data.locked ?? false;
        return drawing;
    }

    // Settings Provider Implementation
    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    {
                        rows: [
                            colorRow('style.color', 'Color'),
                            lineWidthRow('style.lineWidth', 'Width'),
                            lineStyleRow('style.lineDash', 'Style')
                        ]
                    }
                ]),
                createVisibilityTab()
            ]
        };
    }

    getSettingValue(path: string): any {
        if (path.startsWith('style.')) {
            const key = path.split('.')[1] as keyof DrawingStyle;
            return this.style[key];
        }
        return (this as any)[path];
    }

    setSettingValue(path: string, value: any): void {
        if (path.startsWith('style.')) {
            const key = path.split('.')[1] as keyof DrawingStyle;
            (this.style as any)[key] = value;
        } else {
            (this as any)[path] = value;
        }
    }
}
