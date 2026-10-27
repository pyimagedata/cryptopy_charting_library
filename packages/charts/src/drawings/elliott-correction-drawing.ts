/**
 * Elliott Correction Wave (ABC): 4 nokta (0,A,B,C), varsayilan renk #FF9800.
 *
 * Ortak gerceklestirme: elliott-common.ts (derece notasyonu, showWave, serilestirme).
 */

import { SerializedDrawing } from './drawing';
import { ElliottWaveDrawing, ElliottOptions, elliottLabels, DEFAULT_ELLIOTT_DEGREE } from './elliott-common';

export type ElliottCorrectionOptions = ElliottOptions;

/** Intermediate derece etiketleri (eski kayitlarla ayni): (0) (A) (B) (C) */
export const ELLIOTT_CORRECTION_LABELS = elliottLabels('correction', DEFAULT_ELLIOTT_DEGREE);

export class ElliottCorrectionDrawing extends ElliottWaveDrawing {
    constructor(options: ElliottCorrectionOptions = {}) {
        super('correction', options);
    }

    static fromJSON(data: SerializedDrawing): ElliottCorrectionDrawing {
        const drawing = new ElliottCorrectionDrawing();
        Object.assign(drawing.style, data.style);
        drawing.applySerialized(data);
        return drawing;
    }
}
