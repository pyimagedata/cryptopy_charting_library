/**
 * Iki cizgili kanal araclari (tek govde: ChannelLinesTool):
 *   disjointChannel   Ayrik Kanal     (3 tik: P1-P2 birinci cizgi; ikinci cizgi P3'ten baslar, egimi birincinin tersi)
 *   flatTopBottom     Duz Ust/Alt     (3 tik: P1-P2 birinci cizgi; ikinci cizgi P3'un fiyatinda yatay)
 *
 * Geometri ekran (piksel) uzayinda hesaplanir (dogrusal olcekte fiyat/zaman ile ayni; logaritmik olcekte ekranda aynalanir).
 *
 * AYRIK    A = P1->P2 (d = P2 - P1). B = P3 -> P3 + (dx, -dy): ayni sure/uzunluk, egimi A'nin tam tersi (ayna). B'nin baslangic
 *          zamani P3'ten gelir (cizgiler zamanda ayrik olabilir; birbirine yakinsar/uzaklasir).
 * DUZ      A = P1->P2. B = (P1.x, P3.y) -> (P2.x, P3.y): A ile ayni zaman araligi, P3'un fiyatinda yatay.
 * DOLGU    Iki cizgi arasindaki dortgen [A sol, A sag, B sag, B sol] (uzatma aciksa uzatilmis cizgilerle).
 * UZATMA   extendLeft / extendRight iki cizgiyi de panel kenarina (+pay) uzatir; oklar orijinal uclarda kalir.
 * ETIKET   style.text; labelVisible acikken A cizgisi uzerinde (textHAlign: cizgi boyunca sol/orta/sag, textVAlign: ustte/ortada/altta).
 * ISTATISTIK / FIYAT ETIKETLERI  A cizgisi (P1, P2) icin line-tool-common (fiyat/bar/sure); fiyat ekseni etiketleri her iki cizginin uclari.
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
    checkboxRow,
    colorRow,
} from './drawing-settings-config';
import {
    LineToolProps,
    createLineProps,
    getLineProp,
    setLineProp,
    isLineProp,
    serializeLineProps,
    deserializeLineProps,
    buildLineStyleSections,
    AxisLabelProvider,
    AxisLabelSpec,
    PriceScaleConsumer,
    DrawingAxisLabels,
} from './line-tool-common';
import { getShapeSetting, setShapeSetting } from './shape-common';
import type { Pt } from './pitchfork-drawing';

export type ChannelLinesType = 'disjointChannel' | 'flatTopBottom';
export const CHANNEL_LINES_TYPES: ReadonlySet<string> = new Set<string>(['disjointChannel', 'flatTopBottom']);

const TEAL = '#089981';
const ORANGE = '#FF9800';
/** Uzatma: panel kenarinin otesine tasan pay (px) */
const EXTEND_PAD = 50;

export const CHANNEL_LINES_DEFAULT_COLOR: Record<ChannelLinesType, string> = {
    disjointChannel: TEAL,
    flatTopBottom: ORANGE,
};

// ----------------------------------------------------------------------------
// Saf geometri
// ----------------------------------------------------------------------------

export interface ChannelSeg { a: Pt; b: Pt }

export interface ChannelGeometry {
    /** Cizilen (uzatilmis) cizgiler; B yoksa (olusturma, 2 nokta) null */
    lineA: ChannelSeg;
    lineB: ChannelSeg | null;
    /** Uzatilmamis orijinal uclar (oklar, orta nokta) */
    baseA: ChannelSeg;
    baseB: ChannelSeg | null;
    fill: Pt[];
}

/** B cizgisinin uclari (ekran uzayi). */
export function channelLineB(type: ChannelLinesType, p1: Pt, p2: Pt, p3: Pt): ChannelSeg {
    if (type === 'flatTopBottom') return { a: { x: p1.x, y: p3.y }, b: { x: p2.x, y: p3.y } };
    return { a: { x: p3.x, y: p3.y }, b: { x: p3.x + (p2.x - p1.x), y: p3.y - (p2.y - p1.y) } };
}

/**
 * B cizgisinin uclari (mantiksal zaman/fiyat); fiyat ekseni etiketleri icin.
 * Ayrik kanalda B'nin bitis fiyati piksel uzayindan turetilir (ekranda ayna: y3 - (y2 - y1)); boylece logaritmik olcekte de
 * cizilen cizginin ucuyla tutarlidir. Donusturucu yoksa (ya da donusum sonlu degilse) dogrusal fiyat farki kullanilir
 * (dogrusal olcekte ayni sonuc, log olcekte yaklasik).
 */
export function channelLineBPoints(
    type: ChannelLinesType, p1: DrawingPoint, p2: DrawingPoint, p3: DrawingPoint,
    scale?: { priceToPixel: (price: number) => number | null; pixelToPrice: (y: number) => number | null } | null
): [DrawingPoint, DrawingPoint] {
    if (type === 'flatTopBottom') return [{ time: p1.time, price: p3.price }, { time: p2.time, price: p3.price }];
    let endPrice = p3.price - (p2.price - p1.price);
    if (scale) {
        const y1 = scale.priceToPixel(p1.price), y2 = scale.priceToPixel(p2.price), y3 = scale.priceToPixel(p3.price);
        if (y1 !== null && y2 !== null && y3 !== null && [y1, y2, y3].every(Number.isFinite)) {
            const px = scale.pixelToPrice(y3 - (y2 - y1));
            if (px !== null && Number.isFinite(px)) endPrice = px;
        }
    }
    return [{ time: p3.time, price: p3.price }, { time: p3.time + (p2.time - p1.time), price: endPrice }];
}

/** Dogruyu (a->b yonu korunur) sola / saga panel kenarina (+pay) uzatir; dikey dogru uzatilmaz. */
export function extendChannelSeg(s: ChannelSeg, left: boolean, right: boolean, paneWidth: number): ChannelSeg {
    const dx = s.b.x - s.a.x;
    if (Math.abs(dx) < 1e-9 || (!left && !right)) return { a: { ...s.a }, b: { ...s.b } };
    const slope = (s.b.y - s.a.y) / dx;
    const aIsLeft = s.a.x <= s.b.x;
    const l = aIsLeft ? { ...s.a } : { ...s.b };
    const r = aIsLeft ? { ...s.b } : { ...s.a };
    if (left) { const x = Math.min(l.x, -EXTEND_PAD); l.y = l.y + slope * (x - l.x); l.x = x; }
    if (right) { const x = Math.max(r.x, paneWidth + EXTEND_PAD); r.y = r.y + slope * (x - r.x); r.x = x; }
    return aIsLeft ? { a: l, b: r } : { a: r, b: l };
}

const byX = (s: ChannelSeg): [Pt, Pt] => (s.a.x <= s.b.x ? [s.a, s.b] : [s.b, s.a]);

export function computeChannelLines(type: ChannelLinesType, p1: Pt, p2: Pt, p3: Pt | null, extendLeft: boolean, extendRight: boolean, paneWidth: number): ChannelGeometry {
    const baseA: ChannelSeg = { a: p1, b: p2 };
    const lineA = extendChannelSeg(baseA, extendLeft, extendRight, paneWidth);
    if (!p3) return { lineA, lineB: null, baseA, baseB: null, fill: [] };
    const baseB = channelLineB(type, p1, p2, p3);
    const lineB = extendChannelSeg(baseB, extendLeft, extendRight, paneWidth);
    const [al, ar] = byX(lineA);
    const [bl, br] = byX(lineB);
    return { lineA, lineB, baseA, baseB, fill: [al, ar, br, bl] };
}

function segDist(px: number, py: number, a: Pt, b: Pt): number {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

export function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

// ----------------------------------------------------------------------------
// Cizim sinifi
// ----------------------------------------------------------------------------

export class ChannelLinesTool implements Drawing, DrawingSettingsProvider, AxisLabelProvider, PriceScaleConsumer {
    readonly id: string;
    readonly type: DrawingType;

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;
    paneId?: string | null;
    intervalsVisibilities?: import('./intervals-visibility').IntervalsVisibilities;

    extendLeft = false;
    extendRight = false;
    labelVisible = false;
    /** Uc sekilleri, orta nokta, fiyat etiketleri, istatistikler (varsayilan: hepsi kapali) */
    lineProps: LineToolProps = createLineProps();

    private _previewIndex = -1;
    private _pixelPoints: Pt[] = [];
    private _geom: ChannelGeometry | null = null;
    private _scale: { priceToPixel: (price: number) => number | null; pixelToPrice: (y: number) => number | null } | null = null;

    constructor(type: ChannelLinesType) {
        this.id = generateDrawingId();
        this.type = type;
        const color = CHANNEL_LINES_DEFAULT_COLOR[type];
        // Arka plan: ayni renk %20 opaklik (arayuzde seffaflik 80); etiket: sol-alt, 14 px
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color,
            lineWidth: 2,
            lineDash: [],
            fillColor: color,
            fillOpacity: 0.2,
            fillEnabled: true,
            text: '',
            textColor: color,
            fontSize: 14,
            fontWeight: 'normal',
            fontStyle: 'normal',
            textHAlign: 'left',
            textVAlign: 'bottom',
        };
    }

    get requiredPoints(): number { return 3; }
    /** Onayli (onizleme olmayan) nokta sayisi; Shift kilidi yalnizca ikinci nokta yerlestirilirken (1) gecerlidir */
    get confirmedPointCount(): number { return this._previewIndex === -1 ? this.points.length : this.points.length - 1; }
    get title(): string { return this.type === 'flatTopBottom' ? 'Flat Top/Bottom' : 'Disjoint Channel'; }

    // ---- Nokta yonetimi ----

    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
        if (this.points.length >= this.requiredPoints) this.state = 'complete';
    }

    isComplete(): boolean {
        return this.points.length >= this.requiredPoints && this.state !== 'creating';
    }

    updateLastPoint(time: number, price: number): void {
        if (this.points.length === 0) return;
        if (this.state === 'creating') {
            if (this._previewIndex === -1) {
                this.points.push({ time, price });
                this._previewIndex = this.points.length - 1;
            } else {
                this.points[this._previewIndex] = { time, price };
            }
        } else {
            this.points[this.points.length - 1] = { time, price };
        }
    }

    confirmPreviewPoint(): void {
        this._previewIndex = -1;
    }

    // ---- Eksen etiketleri ----

    /** Fiyat olcegi donusturucusu (chart-widget her karede verir); ayrik kanal etiketi log olcekte dogru olur. */
    setPriceScale(priceToPixel: (price: number) => number | null, pixelToPrice: (y: number) => number | null): void {
        this._scale = { priceToPixel, pixelToPrice };
    }

    /** showPriceLabels: A ve B cizgilerinin uclarinin fiyati (ayni fiyat tek etiket) */
    getAxisLabels(): DrawingAxisLabels {
        const prices: AxisLabelSpec[] = [];
        if (!this.lineProps.showPriceLabels || this.points.length < 2) return { prices, times: [] };
        const seen = new Set<number>();
        const add = (price: number) => {
            if (!Number.isFinite(price) || seen.has(price)) return;
            seen.add(price);
            prices.push({ price, color: this.style.color });
        };
        add(this.points[0].price);
        add(this.points[1].price);
        if (this.points.length >= 3) {
            const [b0, b1] = channelLineBPoints(this.type as ChannelLinesType, this.points[0], this.points[1], this.points[2], this._scale);
            add(b0.price);
            add(b1.price);
        }
        return { prices, times: [] };
    }

    // ---- Geometri / hit-test ----

    getPixelPoints(): Pt[] { return this._pixelPoints; }
    setPixelPoints(pts: Pt[]): void { this._pixelPoints = pts; }
    getGeometry(): ChannelGeometry | null { return this._geom; }

    /** Ekran noktalarindan (css px) geometriyi hesaplar ve onbellege yazar. */
    layout(pts: Pt[], paneWidth: number): ChannelGeometry | null {
        this._pixelPoints = pts;
        this._geom = pts.length < 2 ? null
            : computeChannelLines(this.type as ChannelLinesType, pts[0], pts[1], pts.length >= 3 ? pts[2] : null, this.extendLeft, this.extendRight, paneWidth);
        return this._geom;
    }

    hitTest(x: number, y: number, threshold: number = 6): boolean {
        const g = this._geom;
        if (g) {
            if (segDist(x, y, g.lineA.a, g.lineA.b) <= threshold) return true;
            if (g.lineB && segDist(x, y, g.lineB.a, g.lineB.b) <= threshold) return true;
            if (g.fill.length >= 4 && this.style.fillEnabled !== false && pointInPolygon(x, y, g.fill)) return true;
        }
        for (const p of this._pixelPoints) {
            if (Math.hypot(x - p.x, y - p.y) <= threshold) return true;
        }
        return false;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length < 2) return null;
        const pts = [...this._pixelPoints];
        if (this._geom?.baseB) pts.push(this._geom.baseB.a, this._geom.baseB.b);
        const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    // ---- Ayarlar ----

    getSettingsConfig(): DrawingSettingsConfig {
        const sections = buildLineStyleSections(this.title, true);
        // Ucuncu sirada (Line, Extend'den sonra) arka plan
        sections.splice(2, 0, {
            title: 'Background',
            rows: [
                checkboxRow('fillEnabled', 'Background', true),
                colorRow('fillColor', 'Color'),
                { type: 'slider', key: 'fillTransparency', label: 'Transparency', min: 0, max: 100, step: 1, unit: '%', suffix: '%' } as any,
            ],
        });
        return {
            tabs: [
                createStyleTab(sections),
                // Modal'in standart Text bolumunun (metin, renk, boyut, hiza) altina eklenir
                { id: 'text', label: 'Text', sections: [{ title: 'Label', rows: [checkboxRow('labelVisible', 'Show label', false)] }] },
                createVisibilityTab(),
            ],
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Line Color' },
            { type: 'color', key: 'fillColor', tooltip: 'Background Color' },
            { type: 'lineWidth', key: 'lineWidth', tooltip: 'Line Width' },
            { type: 'lineStyle', key: 'lineStyle', tooltip: 'Line Style' },
        ];
    }

    getSettingValue(key: string): any {
        const shape = getShapeSetting(this.style, key);
        if (shape !== undefined) return shape;
        switch (key) {
            case 'extendLeft': return this.extendLeft;
            case 'extendRight': return this.extendRight;
            case 'labelVisible': return this.labelVisible;
            case 'text': return this.style.text ?? '';
            case 'visible': return this.visible;
            default: return getLineProp(this.lineProps, key);
        }
    }

    setSettingValue(key: string, value: any): void {
        if (setShapeSetting(this.style, key, value)) return;
        switch (key) {
            case 'extendLeft': this.extendLeft = !!value; return;
            case 'extendRight': this.extendRight = !!value; return;
            case 'labelVisible': this.labelVisible = !!value; return;
            case 'text': this.style.text = String(value ?? ''); return;
            case 'visible': this.visible = !!value; return;
            default:
                if (isLineProp(key)) setLineProp(this.lineProps, key, value);
        }
    }

    // ---- Serilestirme ----

    toJSON(): SerializedDrawing {
        return {
            id: this.id,
            type: this.type,
            points: this.points.map(p => ({ ...p })),
            style: { ...this.style, lineDash: [...(this.style.lineDash ?? [])] },
            state: this.state === 'selected' ? 'complete' : this.state,
            visible: this.visible,
            locked: this.locked,
            extendLeft: this.extendLeft,
            extendRight: this.extendRight,
            lineProps: serializeLineProps(this.lineProps),
            ext: { labelVisible: this.labelVisible },
        };
    }

    protected _restore(data: SerializedDrawing): void {
        Object.defineProperty(this, 'id', { value: data.id, writable: false });
        this.points = (data.points ?? []).map(p => ({ ...p }));
        this.style = { ...this.style, ...data.style, lineDash: [...(data.style?.lineDash ?? this.style.lineDash ?? [])] };
        this.state = data.state as DrawingState;
        this.visible = data.visible;
        this.locked = data.locked;
        this.extendLeft = !!data.extendLeft;
        this.extendRight = !!data.extendRight;
        this.lineProps = deserializeLineProps(data.lineProps);
        this.labelVisible = !!data.ext?.labelVisible;
    }

    static fromJSON(data: SerializedDrawing): ChannelLinesTool {
        const drawing = new ChannelLinesTool(data.type as ChannelLinesType);
        drawing._restore(data);
        return drawing;
    }
}

export { ChannelLinesTool as DisjointChannelDrawing, ChannelLinesTool as FlatTopBottomDrawing };
