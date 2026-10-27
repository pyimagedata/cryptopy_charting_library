/**
 * Elliott dalga araclari icin ortak taban: derece (degree) notasyonu, "Wave" gorunurlugu, nokta yonetimi, serilestirme.
 *
 * Araclar: Impulse (12345), Correction (ABC), Triangle (ABCDE), Double Combo (WXY), Triple Combo (WXYXZ).
 * Ozellikler: cizgi rengi / kalinligi, showWave (false ise yalniz etiketler cizilir), degree (14 seviye).
 * Etiketler "(0)" ile baslar (eski kayitlarla ayni); varsayilan derece Intermediate = (0) (1) (2) / (A) (B) (C),
 * boylece eski Impulse / Correction kayitlari birebir ayni gorunur.
 *
 * Notasyon tablosu (sayi / harf; sayilar 1-5, harfler A-E, W X Y Z):
 *   Millennium       [[I]] [[II]]  / [[A]] [[B]]
 *   Submillennium    [I] [II]      / [A] [B]
 *   Grand Supercycle ((I)) ((II))  / ((a)) ((b))
 *   Supercycle       (I) (II)      / (a) (b)
 *   Cycle            I II III      / a b c
 *   Primary          1 2 3 (daire) / A B C (daireli harf)
 *   Intermediate     (1) (2) (3)   / (A) (B) (C)
 *   Minor            1 2 3         / A B C
 *   Minute           ((i)) ((ii))  / ((a)) ((b))
 *   Minuette         (i) (ii)      / (a) (b)
 *   Subminuette      i ii iii      / a b c
 *   Micro            [1] [2]       / [A] [B]
 *   Submicro         [[1]] [[2]]   / [[A]] [[B]]
 *   Minuscule        [i] [ii]      / [a] [b]
 * Nokta 0 her derecede ayni sarmalayici ile "0" olarak yazilir (Primary: daireli 0).
 */

import {
    Drawing,
    DrawingPoint,
    DrawingStyle,
    DrawingState,
    DrawingType,
    DEFAULT_DRAWING_STYLE,
    generateDrawingId,
    SerializedDrawing,
} from './drawing';
import {
    DrawingSettingsProvider,
    DrawingSettingsConfig,
    AttributeBarItem,
    createStyleTab,
    createVisibilityTab,
    colorRow,
    lineWidthRow,
    checkboxRow,
    selectRow,
} from './drawing-settings-config';

export type ElliottDegree =
    | 'millennium' | 'submillennium' | 'grandSupercycle' | 'supercycle' | 'cycle' | 'primary' | 'intermediate'
    | 'minor' | 'minute' | 'minuette' | 'subminuette' | 'micro' | 'submicro' | 'minuscule';

export const DEFAULT_ELLIOTT_DEGREE: ElliottDegree = 'intermediate';

/** TradingView sirasi */
export const ELLIOTT_DEGREES: { value: ElliottDegree; label: string }[] = [
    { value: 'millennium', label: 'Millennium' },
    { value: 'submillennium', label: 'Submillennium' },
    { value: 'grandSupercycle', label: 'Grand Supercycle' },
    { value: 'supercycle', label: 'Supercycle' },
    { value: 'cycle', label: 'Cycle' },
    { value: 'primary', label: 'Primary' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'minor', label: 'Minor' },
    { value: 'minute', label: 'Minute' },
    { value: 'minuette', label: 'Minuette' },
    { value: 'subminuette', label: 'Subminuette' },
    { value: 'micro', label: 'Micro' },
    { value: 'submicro', label: 'Submicro' },
    { value: 'minuscule', label: 'Minuscule' },
];

type NumKind = 'arabic' | 'romanUpper' | 'romanLower' | 'circled';
interface DegreeNotation {
    num: NumKind;
    /** Harf ailesi: buyuk / kucuk / daireli buyuk */
    letters: 'upper' | 'lower' | 'circled';
    wrap: (s: string) => string;
}

const br1 = (s: string) => `(${s})`;
const br2 = (s: string) => `((${s}))`;
const sq1 = (s: string) => `[${s}]`;
const sq2 = (s: string) => `[[${s}]]`;
const none = (s: string) => s;

const NOTATION: Record<ElliottDegree, DegreeNotation> = {
    millennium: { num: 'romanUpper', letters: 'upper', wrap: sq2 },
    submillennium: { num: 'romanUpper', letters: 'upper', wrap: sq1 },
    grandSupercycle: { num: 'romanUpper', letters: 'lower', wrap: br2 },
    supercycle: { num: 'romanUpper', letters: 'lower', wrap: br1 },
    cycle: { num: 'romanUpper', letters: 'lower', wrap: none },
    primary: { num: 'circled', letters: 'circled', wrap: none },
    intermediate: { num: 'arabic', letters: 'upper', wrap: br1 },
    minor: { num: 'arabic', letters: 'upper', wrap: none },
    minute: { num: 'romanLower', letters: 'lower', wrap: br2 },
    minuette: { num: 'romanLower', letters: 'lower', wrap: br1 },
    subminuette: { num: 'romanLower', letters: 'lower', wrap: none },
    micro: { num: 'arabic', letters: 'upper', wrap: sq1 },
    submicro: { num: 'arabic', letters: 'upper', wrap: sq2 },
    minuscule: { num: 'romanLower', letters: 'lower', wrap: sq1 },
};

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];
const CIRCLED_DIGITS = ['⓪', '①', '②', '③', '④', '⑤'];

export function normalizeElliottDegree(v: any): ElliottDegree {
    return ELLIOTT_DEGREES.some(d => d.value === v) ? (v as ElliottDegree) : DEFAULT_ELLIOTT_DEGREE;
}

/** Derece notasyonunda sayi etiketi (0-5). */
export function elliottNumberLabel(degree: ElliottDegree, n: number): string {
    const nt = NOTATION[degree];
    switch (nt.num) {
        case 'circled': return CIRCLED_DIGITS[n];
        case 'romanUpper': return nt.wrap(ROMAN[n]);
        case 'romanLower': return nt.wrap(ROMAN[n].toLowerCase());
        default: return nt.wrap(String(n));
    }
}

/** Derece notasyonunda harf etiketi (A-Z, buyuk harf verilir). */
export function elliottLetterLabel(degree: ElliottDegree, letter: string): string {
    const nt = NOTATION[degree];
    if (nt.letters === 'circled') {
        return String.fromCharCode(0x24B6 + (letter.toUpperCase().charCodeAt(0) - 65));
    }
    return nt.wrap(nt.letters === 'lower' ? letter.toLowerCase() : letter.toUpperCase());
}

export type ElliottKind = 'impulse' | 'correction' | 'triangle' | 'doubleCombo' | 'tripleCombo';

interface ElliottKindConfig {
    type: DrawingType;
    points: number;
    color: string;
    /** Null: sayi etiketi, harf: derece harf notasyonu */
    labels: (string | null)[];
}

export const ELLIOTT_KINDS: Record<ElliottKind, ElliottKindConfig> = {
    impulse: { type: 'elliotImpulse', points: 6, color: '#3D85C6', labels: [null, null, null, null, null, null] },
    correction: { type: 'elliotCorrection', points: 4, color: '#FF9800', labels: [null, 'A', 'B', 'C'] },
    triangle: { type: 'elliotTriangle', points: 6, color: '#6AA84F', labels: [null, 'A', 'B', 'C', 'D', 'E'] },
    doubleCombo: { type: 'elliotDoubleCombo', points: 4, color: '#3D85C6', labels: [null, 'W', 'X', 'Y'] },
    tripleCombo: { type: 'elliotTripleCombo', points: 6, color: '#6AA84F', labels: [null, 'W', 'X', 'Y', 'X', 'Z'] },
};

/** Bir arac turu icin derece notasyonunda tum nokta etiketleri. */
export function elliottLabels(kind: ElliottKind, degree: ElliottDegree): string[] {
    return ELLIOTT_KINDS[kind].labels.map((l, i) =>
        l === null ? elliottNumberLabel(degree, i) : elliottLetterLabel(degree, l)
    );
}

export interface ElliottOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    fillColor?: string;
    showWave?: boolean;
    degree?: ElliottDegree;
}

/** Elliott dalga cizimlerinin ortak gercekleme sinifi (alt siniflar yalniz `kind` verir). */
export class ElliottWaveDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType;
    readonly kind: ElliottKind;

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;
    /** false: dalga cizgileri cizilmez, yalniz etiketler gorunur */
    showWave: boolean = true;
    degree: ElliottDegree = DEFAULT_ELLIOTT_DEGREE;

    private _previewPointIndex: number = -1;
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(kind: ElliottKind, options: ElliottOptions = {}) {
        this.kind = kind;
        const cfg = ELLIOTT_KINDS[kind];
        this.type = cfg.type;
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || cfg.color,
            lineWidth: options.lineWidth || 2,
            lineDash: options.lineDash || [],
            fillColor: options.fillColor, // yalniz eski Impulse kayitlari
        };
        if (options.showWave !== undefined) this.showWave = options.showWave;
        if (options.degree) this.degree = normalizeElliottDegree(options.degree);
    }

    get requiredPoints(): number {
        return ELLIOTT_KINDS[this.kind].points;
    }

    // ------------------------------------------------------------------ settings

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    { title: 'Line', rows: [colorRow('color', 'Color'), lineWidthRow('lineWidth')] },
                    {
                        title: 'Wave',
                        rows: [
                            checkboxRow('showWave', 'Wave', true),
                            selectRow('degree', 'Degree', ELLIOTT_DEGREES),
                        ],
                    },
                ]),
                createVisibilityTab(),
            ],
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Line Color' },
            { type: 'lineWidth', key: 'lineWidth', tooltip: 'Line Width' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'color': return this.style.color;
            case 'lineWidth': return this.style.lineWidth;
            case 'lineStyle':
                if (!this.style.lineDash || this.style.lineDash.length === 0) return 'solid';
                return this.style.lineDash[0] === 6 ? 'dashed' : 'dotted';
            case 'fillColor': return this.style.fillColor;
            case 'showWave': return this.showWave;
            case 'degree': return this.degree;
            case 'visible': return this.visible;
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'color': this.style.color = value; break;
            case 'lineWidth': this.style.lineWidth = value; break;
            case 'lineStyle':
                if (value === 'solid') this.style.lineDash = [];
                else if (value === 'dashed') this.style.lineDash = [6, 4];
                else if (value === 'dotted') this.style.lineDash = [2, 2];
                break;
            case 'fillColor': this.style.fillColor = value; break;
            case 'showWave': this.showWave = !!value; break;
            case 'degree': this.degree = normalizeElliottDegree(value); break;
            case 'visible': this.visible = value; break;
        }
    }

    // ------------------------------------------------------------------ points

    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
        if (this.points.length >= this.requiredPoints) this.state = 'complete';
    }

    isComplete(): boolean {
        return this.points.length >= this.requiredPoints && this.state === 'complete';
    }

    updateLastPoint(time: number, price: number): void {
        if (this.points.length === 0) return;
        if (this.state === 'creating') {
            if (this._previewPointIndex === -1) {
                this.points.push({ time, price });
                this._previewPointIndex = this.points.length - 1;
            } else {
                this.points[this._previewPointIndex] = { time, price };
            }
        } else {
            this.points[this.points.length - 1] = { time, price };
        }
    }

    confirmPreviewPoint(): void {
        this._previewPointIndex = -1;
    }

    /** Tum nokta etiketleri (derece notasyonunda). */
    getLabels(): string[] {
        return elliottLabels(this.kind, this.degree);
    }

    getPointLabel(index: number): string {
        return this.getLabels()[index] || '';
    }

    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = points;
    }

    getPixelPoints(): { x: number; y: number }[] {
        return this._pixelPoints;
    }

    // ------------------------------------------------------------------ hit test

    hitTest(x: number, y: number, threshold: number = 5): boolean {
        if (this._pixelPoints.length < 2) return false;
        if (!this.showWave) {
            // Yalniz etiketler gorunur: nokta ve etiket kutusu cevresi secilebilir
            const r = threshold + 14;
            const labelH = (this.style.fontSize || 12) + 8;
            const gap = 6;
            const labels = this.getLabels();
            return this._pixelPoints.some((p, i) => {
                if (Math.hypot(x - p.x, y - p.y) <= r) return true;
                if (!labels[i]) return false;
                // Etiket kutusu (pattern-renderer drawLabels ile ayni konum): tepe ise ustte, dip ise altta
                const prevY = i > 0 ? this._pixelPoints[i - 1].y : p.y;
                const nextY = i < this._pixelPoints.length - 1 ? this._pixelPoints[i + 1].y : p.y;
                const isValley = p.y > prevY || p.y > nextY;
                const cy = isValley ? p.y + gap + labelH / 2 : p.y - gap - labelH / 2;
                const halfW = Math.max(labelH, (labels[i].length * 0.6 * (this.style.fontSize || 12)) + 12) / 2;
                return Math.abs(x - p.x) <= halfW + threshold && Math.abs(y - cy) <= labelH / 2 + threshold;
            });
        }
        for (let i = 0; i < this._pixelPoints.length - 1; i++) {
            const a = this._pixelPoints[i];
            const b = this._pixelPoints[i + 1];
            if (pointToSegment(x, y, a.x, a.y, b.x, b.y) <= threshold) return true;
        }
        return false;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length < 2) return null;
        const xs = this._pixelPoints.map(p => p.x);
        const ys = this._pixelPoints.map(p => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
    }

    // ------------------------------------------------------------------ serialization

    toJSON(): SerializedDrawing {
        return {
            id: this.id,
            type: this.type,
            points: [...this.points],
            style: { ...this.style },
            state: this.state === 'selected' ? 'complete' : this.state,
            visible: this.visible,
            locked: this.locked,
            elliott: { showWave: this.showWave, degree: this.degree },
        };
    }

    /** fromJSON yardimcisi: eski kayitlarda `elliott` yoktur (showWave=true, derece Intermediate). */
    applySerialized(data: SerializedDrawing): void {
        Object.defineProperty(this, 'id', { value: data.id, writable: false });
        this.points = [...data.points];
        this.state = data.state as DrawingState;
        this.visible = data.visible;
        this.locked = data.locked;
        const e = (data as any).elliott;
        this.showWave = e && typeof e.showWave === 'boolean' ? e.showWave : true;
        this.degree = normalizeElliottDegree(e?.degree);
    }
}

function pointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
