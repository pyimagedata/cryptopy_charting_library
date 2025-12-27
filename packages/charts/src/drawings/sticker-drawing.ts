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

    constructor(id: string = Math.random().toString(36).substr(2, 9)) {
        this.id = id;
    }

    public addPoint(time: number, price: number): void {
        this.points = [{ time, price }];
    }

    public updateLastPoint(time: number, price: number): void {
        this.points[0] = { time, price };
    }

    public isComplete(): boolean {
        return this.points.length === 1;
    }

    public hitTest(_x: number, _y: number, _tolerance: number): boolean {
        // Simple hit test for a single point
        return false;
    }

    public getBounds(): { x: number; y: number; width: number; height: number } | null {
        // To be implemented by the renderer
        return null;
    }

    public toJSON(): SerializedStickerDrawing {
        return {
            id: this.id,
            type: 'sticker',
            points: [...this.points],
            style: { ...this.style },
            state: this.state,
            visible: this.visible,
            locked: this.locked,
            content: this.content,
        };
    }

    public static fromJSON(data: SerializedStickerDrawing): StickerDrawing {
        const drawing = new StickerDrawing(data.id);
        drawing.points = [...data.points];
        drawing.style = { ...data.style };
        drawing.state = data.state;
        drawing.visible = data.visible;
        drawing.locked = data.locked;
        drawing.content = data.content;
        return drawing;
    }
}
