/**
 * Short Position Drawing
 *
 * 2 noktali arac: sol/sag kenar (giris fiyati) + yuzde olarak saklanan hedef/stop.
 * Tum mantik (hesap, ayarlar, serilestirme) PositionDrawingBase'tedir (position-common.ts).
 * Hedef girisin altinda, stop ustunde.
 */

import { DrawingType, SerializedDrawing } from './drawing';
import { PositionDrawingBase, PositionOptions } from './position-common';

export type ShortPositionOptions = PositionOptions;

export class ShortPositionDrawing extends PositionDrawingBase {
    readonly type: DrawingType = 'shortPosition';

    constructor(options: ShortPositionOptions = {}) {
        super(false, options);
    }

    static fromJSON(data: SerializedDrawing): ShortPositionDrawing {
        const drawing = new ShortPositionDrawing();
        drawing._applyJSON(data);
        return drawing;
    }
}
