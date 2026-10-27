/**
 * Elliott Triple Combo Wave (WXYXZ): 6 nokta (0,W,X,Y,X,Z), varsayilan renk #6AA84F.
 *
 * Ortak gerceklestirme: elliott-common.ts (derece notasyonu, showWave, serilestirme).
 */

import { SerializedDrawing } from './drawing';
import { ElliottWaveDrawing, ElliottOptions } from './elliott-common';

export type ElliottTripleComboOptions = ElliottOptions;

export class ElliottTripleComboDrawing extends ElliottWaveDrawing {
    constructor(options: ElliottTripleComboOptions = {}) {
        super('tripleCombo', options);
    }

    static fromJSON(data: SerializedDrawing): ElliottTripleComboDrawing {
        const drawing = new ElliottTripleComboDrawing();
        Object.assign(drawing.style, data.style);
        drawing.applySerialized(data);
        return drawing;
    }
}
