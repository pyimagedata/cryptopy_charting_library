/**
 * Long Position Drawing
 *
 * 2 noktali arac: sol/sag kenar (giris fiyati) + yuzde olarak saklanan hedef/stop.
 * Tum mantik (hesap, ayarlar, serilestirme) PositionDrawingBase'tedir (position-common.ts).
 * Hedef girisin ustunde, stop altinda.
 */

import { DrawingType, SerializedDrawing } from './drawing';
import { PositionDrawingBase, PositionOptions } from './position-common';

export type LongPositionOptions = PositionOptions;

export class LongPositionDrawing extends PositionDrawingBase {
    readonly type: DrawingType = 'longPosition';

    constructor(options: LongPositionOptions = {}) {
        super(true, options);
    }

    static fromJSON(data: SerializedDrawing): LongPositionDrawing {
        const drawing = new LongPositionDrawing();
        drawing._applyJSON(data);
        return drawing;
    }
}
