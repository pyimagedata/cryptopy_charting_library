/**
 * Arrow Drawing Implementation
 * Trend Line ailesinin bir uyesi: varsayilan olarak sag ucu ok (kayit tipi 'arrow' korunur).
 */

import {
    DrawingType,
    SerializedDrawing
} from './drawing';

import { LineToolProps, ARROW_LINE_PROP_DEFAULTS } from './line-tool-common';
import { TrendLineDrawing } from './trend-line-drawing';

export interface ArrowOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
}

/**
 * Arrow - Trend Line with rightEnd 'arrow' default
 */
export class ArrowDrawing extends TrendLineDrawing {
    readonly type: DrawingType = 'arrow';

    constructor(options: ArrowOptions = {}) {
        super({
            ...options,
            extendLeft: false,
            extendRight: false
        });
    }

    protected getToolTitle(): string {
        return 'Arrow';
    }

    // Eski kayitlar (lineProps yok) sag ok ile yuklenir: eskiden de ok ucu vardi
    protected getDefaultLineProps(): Readonly<LineToolProps> {
        return ARROW_LINE_PROP_DEFAULTS;
    }

    toJSON(): SerializedDrawing {
        const json = super.toJSON();
        return {
            ...json,
            type: 'arrow'
        };
    }

    static fromJSON(data: SerializedDrawing): ArrowDrawing {
        const drawing = new ArrowDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            lineDash: data.style.lineDash,
        });
        drawing.extendLeft = !!data.extendLeft;
        drawing.extendRight = !!data.extendRight;
        return TrendLineDrawing.applySerialized(drawing, data);
    }
}
