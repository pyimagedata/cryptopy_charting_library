/**
 * Cypher Pattern Drawing (Harmonic Pattern)
 *
 * XABCD ile ayni 5 noktali yapi (X, A, B, C, D), ayni gorunum ve varsayilanlar.
 * Fark: oran etiketleri Cypher olcumunu izler (bkz. cypherRatios):
 *   XB = AB / XA, XC = XC / XA (XA uzantisi), XD = CD / XC (XC geri cekilmesi).
 */

import { DrawingType, SerializedDrawing } from './drawing';
import { XABCDPatternDrawing, XABCDPatternOptions } from './xabcd-pattern-drawing';
import { applySerializedPattern, cypherRatios, CypherRatios } from './pattern-common';

export class CypherPatternDrawing extends XABCDPatternDrawing {
    readonly type: DrawingType = 'cypherPattern';

    constructor(options: XABCDPatternOptions = {}) {
        super(options, 'cypher');
    }

    /** Cypher oranlari (eksik noktalar icin null). */
    getRatios(): CypherRatios {
        return cypherRatios(this.points);
    }

    static fromJSON(data: SerializedDrawing): CypherPatternDrawing {
        const drawing = new CypherPatternDrawing();
        applySerializedPattern(drawing, data);
        return drawing;
    }
}
