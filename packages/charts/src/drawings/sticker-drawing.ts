import { Drawing, DrawingType, SerializedDrawing, DrawingState, DEFAULT_DRAWING_STYLE, DrawingStyle } from './drawing';

export interface SerializedStickerDrawing extends SerializedDrawing {
    type: 'sticker';
    content: string; // The emoji or sticker ID
}

export class StickerDrawing implements Drawing {
    public readonly id: string;
    public readonly type: DrawingType = 'sticker';
    public points: { time: number; price: number }[] = [];
    public style: DrawingStyle = { ...DEFAULT_DRAWING_STYLE };
    public state: DrawingState = 'complete';
    public visible: boolean = true;
    public locked: boolean = false;
    public content: string = '😀'; // Default emoji
    private _fontSize: number = 32;

    constructor(id: string = Math.random().toString(36).substr(2, 9)) {
        this.id = id;
    }

    get fontSize(): number { return this._fontSize; }
    set fontSize(value: number) { this._fontSize = value; }

    public addPoint(time: number, price: number): void {
        this.points = [{ time, price }];
        this.state = 'complete';
    }

    public updateLastPoint(time: number, price: number): void {
        this.points[0] = { time, price };
    }

    public isComplete(): boolean {
        return this.points.length === 1;
    }

    private _cachedBounds: { x: number; y: number; width: number; height: number } | null = null;

    setCachedBounds(bounds: { x: number; y: number; width: number; height: number }): void {
        this._cachedBounds = bounds;
    }

    public hitTest(x: number, y: number, threshold: number = 8): boolean {
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

    public getBounds(): { x: number; y: number; width: number; height: number } | null {
        return this._cachedBounds;
    }

    public toJSON(): SerializedStickerDrawing {
        return {
            id: this.id,
            type: 'sticker',
            points: [...this.points],
            style: { ...this.style },
            state: this.state === 'selected' ? 'complete' : this.state,
            visible: this.visible,
            locked: this.locked,
            content: this.content,
            fontSize: this._fontSize,
        };
    }

    public static fromJSON(data: SerializedStickerDrawing): StickerDrawing {
        const drawing = new StickerDrawing(data.id);
        drawing.points = [...data.points];
        drawing.style = { ...data.style };
        drawing.state = data.state as any;
        drawing.visible = data.visible;
        drawing.locked = data.locked;
        drawing.content = data.content;
        if (data.fontSize) drawing.fontSize = data.fontSize;
        return drawing;
    }
}
