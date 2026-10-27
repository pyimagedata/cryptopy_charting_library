/**
 * Elliott Impulse Wave (12345): 6 nokta (0,1,2,3,4,5), varsayilan renk #3D85C6.
 *
 * Ortak gerceklestirme: elliott-common.ts (derece notasyonu, showWave, serilestirme).
 */

import { SerializedDrawing } from './drawing';
import { ElliottWaveDrawing, ElliottOptions, elliottLabels, DEFAULT_ELLIOTT_DEGREE } from './elliott-common';

export type ElliottImpulseOptions = ElliottOptions;

/** Intermediate derece etiketleri (eski kayitlarla ayni): (0) (1) ... (5) */
export const ELLIOTT_IMPULSE_LABELS = elliottLabels('impulse', DEFAULT_ELLIOTT_DEGREE);

export class ElliottImpulseDrawing extends ElliottWaveDrawing {
    constructor(options: ElliottImpulseOptions = {}) {
        super('impulse', options);
    }

    static fromJSON(data: SerializedDrawing): ElliottImpulseDrawing {
        const drawing = new ElliottImpulseDrawing();
        Object.assign(drawing.style, data.style);
        drawing.applySerialized(data);
        return drawing;
    }
}
