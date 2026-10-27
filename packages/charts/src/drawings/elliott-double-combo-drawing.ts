/**
 * Elliott Double Combo Wave (WXY): 4 nokta (0,W,X,Y), varsayilan renk #3D85C6.
 *
 * Ortak gerceklestirme: elliott-common.ts (derece notasyonu, showWave, serilestirme).
 */

import { SerializedDrawing } from './drawing';
import { ElliottWaveDrawing, ElliottOptions } from './elliott-common';

export type ElliottDoubleComboOptions = ElliottOptions;

export class ElliottDoubleComboDrawing extends ElliottWaveDrawing {
    constructor(options: ElliottDoubleComboOptions = {}) {
        super('doubleCombo', options);
    }

    static fromJSON(data: SerializedDrawing): ElliottDoubleComboDrawing {
        const drawing = new ElliottDoubleComboDrawing();
        Object.assign(drawing.style, data.style);
        drawing.applySerialized(data);
        return drawing;
    }
}
