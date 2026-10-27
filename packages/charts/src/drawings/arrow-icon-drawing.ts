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
    createVisibilityTab,
    createCoordinatesTab,
    colorRow,
    checkboxRow,
    textareaRow,
    selectRow,
    groupRow,
    sliderRow,
} from './drawing-settings-config';

import { TV_COLORS, fontSizeOptions } from './text-common';

export type ArrowIconType = 'arrowMarkedUp' | 'arrowMarkedDown' | 'arrowMarkedLeft' | 'arrowMarkedRight';

export interface ArrowIconOptions {
    type: ArrowIconType;
    color?: string;
    size?: number;
}

const ARROW_DEFAULT_COLOR: Record<ArrowIconType, string> = {
    arrowMarkedUp: TV_COLORS.teal,
    arrowMarkedDown: TV_COLORS.red600,
    arrowMarkedLeft: TV_COLORS.blue,
    arrowMarkedRight: TV_COLORS.blue,
};

const ARROW_TITLE: Record<ArrowIconType, string> = {
    arrowMarkedUp: 'Arrow Up',
    arrowMarkedDown: 'Arrow Down',
    arrowMarkedLeft: 'Arrow Left',
    arrowMarkedRight: 'Arrow Right',
};

/**
 * Arrow Icon - A single-point block arrow marker (Up, Down, Left or Right) with an optional text label
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

    // Text label
    text: string = '';
    textColor: string;
    fontSize: number = 14;
    bold: boolean = false;
    italic: boolean = false;
    showLabel: boolean = true;
    /** Yeni duzen: nokta okun ucundadir (eski kayitlarda ok noktanin ortasindaydi) */
    anchorTip: boolean = true;

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];
    private _labelRect: { x: number; y: number; width: number; height: number } | null = null;

    constructor(options: ArrowIconOptions) {
        this.id = generateDrawingId();
        this.type = options.type;
        const color = options.color || ARROW_DEFAULT_COLOR[options.type];
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color,
        };
        this.textColor = color;
        this.size = options.size || 32;
    }

    /** Okun kutusunun merkezi (verilen cizim noktasina gore, piksel) */
    getArrowCenter(p: { x: number; y: number }): { x: number; y: number } {
        if (!this.anchorTip) return { x: p.x, y: p.y };
        const h = this.size / 2;
        switch (this.type) {
            case 'arrowMarkedUp': return { x: p.x, y: p.y + h };
            case 'arrowMarkedDown': return { x: p.x, y: p.y - h };
            case 'arrowMarkedLeft': return { x: p.x + h, y: p.y };
            default: return { x: p.x - h, y: p.y };
        }
    }

    /** Renderer tarafindan etiket dikdortgenini (css px) onbellege alir */
    setLabelRect(rect: { x: number; y: number; width: number; height: number } | null): void {
        this._labelRect = rect;
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                {
                    id: 'style',
                    label: 'Style',
                    sections: [
                        {
                            title: ARROW_TITLE[this.type as ArrowIconType],
                            rows: [
                                colorRow('color', 'Color'),
                                sliderRow('size', 'Size', 12, 128),
                            ]
                        }
                    ]
                },
                {
                    id: 'textContent',
                    label: 'Text',
                    sections: [
                        {
                            rows: [
                                checkboxRow('showLabel', 'Show label'),
                                groupRow([
                                    colorRow('textColor', ''),
                                    selectRow('fontSize', '', fontSizeOptions()),
                                    checkboxRow('bold', 'B'),
                                    checkboxRow('italic', 'I'),
                                ]),
                                textareaRow('text'),
                            ]
                        }
                    ]
                },
                createCoordinatesTab([]),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Arrow Color' },
            { type: 'color', key: 'textColor', tooltip: 'Text Color' },
            { type: 'number', key: 'fontSize', tooltip: 'Font Size' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'color': return this.style.color;
            case 'size': return this.size;
            case 'text': return this.text;
            case 'textColor': return this.textColor;
            case 'fontSize': return String(this.fontSize);
            case 'bold': return this.bold;
            case 'italic': return this.italic;
            case 'showLabel': return this.showLabel;
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
            case 'text': this.text = String(value ?? ''); break;
            case 'textColor': this.textColor = value; break;
            case 'fontSize': { const n = parseInt(value); if (n > 0) this.fontSize = n; break; }
            case 'bold': this.bold = !!value; break;
            case 'italic': this.italic = !!value; break;
            case 'showLabel': this.showLabel = !!value; break;
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

    /** Hit test on the icon area (and its label) */
    hitTest(x: number, y: number, threshold: number = 5): boolean {
        if (this._pixelPoints.length === 0) return false;

        const c = this.getArrowCenter(this._pixelPoints[0]);
        const halfSize = this.size / 2;

        if (x >= c.x - halfSize - threshold && x <= c.x + halfSize + threshold &&
            y >= c.y - halfSize - threshold && y <= c.y + halfSize + threshold) return true;

        const l = this._labelRect;
        return !!l && this.showLabel && x >= l.x - threshold && x <= l.x + l.width + threshold &&
            y >= l.y - threshold && y <= l.y + l.height + threshold;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length === 0) return null;

        const c = this.getArrowCenter(this._pixelPoints[0]);
        const halfSize = this.size / 2;

        return {
            x: c.x - halfSize,
            y: c.y - halfSize,
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
            text: this.text,
            textColor: this.textColor,
            fontSize: this.fontSize,
            fontWeight: this.bold ? 'bold' : 'normal',
            fontStyle: this.italic ? 'italic' : 'normal',
            ext: { showLabel: this.showLabel, anchorTip: this.anchorTip },
        };
    }

    static fromJSON(data: SerializedDrawing): ArrowIconDrawing {
        const drawing = new ArrowIconDrawing({
            type: data.type as ArrowIconType,
            color: data.style.color,
            size: (data as any).size,
        });

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;

        // Eski kayitlarda metin alanlari yok: varsayilanlar (bos etiket, ok ortada)
        if (typeof data.text === 'string') drawing.text = data.text;
        if (data.textColor) drawing.textColor = data.textColor;
        if (data.fontSize) drawing.fontSize = data.fontSize;
        drawing.bold = data.fontWeight === 'bold';
        drawing.italic = data.fontStyle === 'italic';
        const ext = data.ext;
        drawing.showLabel = ext && typeof ext.showLabel === 'boolean' ? ext.showLabel : true;
        drawing.anchorTip = !!ext && ext.anchorTip === true;

        return drawing;
    }
}
