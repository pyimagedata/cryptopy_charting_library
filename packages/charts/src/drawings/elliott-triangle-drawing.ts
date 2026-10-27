/**
 * Elliott Triangle Wave (ABCDE): 6 nokta (0,A,B,C,D,E), varsayilan renk #6AA84F.
 *
 * Ortak gerceklestirme: elliott-common.ts (derece notasyonu, showWave, serilestirme).
 */

import { SerializedDrawing } from './drawing';
import { ElliottWaveDrawing, ElliottOptions } from './elliott-common';

export type ElliottTriangleOptions = ElliottOptions;

export class ElliottTriangleDrawing extends ElliottWaveDrawing {
    constructor(options: ElliottTriangleOptions = {}) {
        super('triangle', options);
    }

    static fromJSON(data: SerializedDrawing): ElliottTriangleDrawing {
        const drawing = new ElliottTriangleDrawing();
        Object.assign(drawing.style, data.style);
        drawing.applySerialized(data);
        return drawing;
    }
}
