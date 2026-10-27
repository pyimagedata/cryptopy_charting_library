/**
 * Info Line Drawing Implementation
 * Trend Line ailesinin bir uyesi: farkli varsayilanlarla (istatistikler hep acik, ortada, yedisi de acik).
 */

import {
    DrawingType,
    SerializedDrawing
} from './drawing';

import { LineToolProps, INFO_LINE_PROP_DEFAULTS } from './line-tool-common';
import { TrendLineDrawing } from './trend-line-drawing';

export interface InfoLineOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
}

/**
 * Info Line - Trend Line + varsayilan olarak gorunen istatistik kutusu
 */
export class InfoLineDrawing extends TrendLineDrawing {
    readonly type: DrawingType = 'infoLine';

    constructor(options: InfoLineOptions = {}) {
        super({
            ...options,
            extendLeft: false,
            extendRight: false
        });
    }

    protected getToolTitle(): string {
        return 'Info Line';
    }

    // Eski kayitlar (lineProps yok) da bu varsayilanlarla yuklenir: istatistikleri gorunmeye devam eder
    protected getDefaultLineProps(): Readonly<LineToolProps> {
        return INFO_LINE_PROP_DEFAULTS;
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
        drawing.extendLeft = !!data.extendLeft;
        drawing.extendRight = !!data.extendRight;
        return TrendLineDrawing.applySerialized(drawing, data);
    }
}
