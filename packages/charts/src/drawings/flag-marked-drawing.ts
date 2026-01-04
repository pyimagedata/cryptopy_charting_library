/**
 * Flag Marked Drawing Implementation
 * 
 * A 1-point drawing tool that shows a flag icon at its location.
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
    textRow
} from './drawing-settings-config';

export interface FlagMarkedOptions {
    color?: string;
    text?: string;
}

export class FlagMarkedDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'flagMarked';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    private _text: string = '';

    constructor(options: FlagMarkedOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#ef5350',
        };
        if (options.text) this._text = options.text;
    }

    // =========================================================================
    // Property Accessors
    // =========================================================================

    get text(): string { return this._text; }
    set text(value: string) { this._text = value; }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    {
                        title: 'Flag',
                        rows: [
                            colorRow('color', 'Flag Color'),
                            textRow('text', 'Label'),
                        ]
                    }
                ]),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Flag Color' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'color': return this.style.color;
            case 'text': return this._text;
            case 'visible': return this.visible;
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'color': this.style.color = value; break;
            case 'text': this._text = value; break;
            case 'visible': this.visible = value; break;
        }
    }

    // =========================================================================
    // Drawing Interface Implementation
    // =========================================================================

    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
        this.state = 'complete';
    }

    isComplete(): boolean {
        return this.points.length >= 1;
    }

    updateLastPoint(time: number, price: number): void {
        if (this.points.length === 0) return;
        this.points[0] = { time, price };
    }

    hitTest(x: number, y: number, threshold: number = 8): boolean {
        const bounds = this.getBounds();
        if (bounds) {
            return (
                x >= bounds.x - threshold &&
                x <= bounds.x + bounds.width + threshold &&
                y >= bounds.y - threshold &&
                y <= bounds.y + bounds.height + threshold
            );
        }
        return false;
    }

    private _cachedBounds: { x: number; y: number; width: number; height: number } | null = null;

    setCachedBounds(bounds: { x: number; y: number; width: number; height: number }): void {
        this._cachedBounds = bounds;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        return this._cachedBounds;
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
            text: this._text,
        };
    }

    static fromJSON(data: SerializedDrawing): FlagMarkedDrawing {
        const drawing = new FlagMarkedDrawing({
            color: data.style.color,
            text: data.text,
        });

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        return drawing;
    }
}
