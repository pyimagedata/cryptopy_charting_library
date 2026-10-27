/**
 * Cift Egri (doubleCurve): kubik bezier, 3 tik (P1, P2, P3) - Arc ile ayni olusturma akisi.
 *
 * Geometri (piksel uzayi): P1 ve P3 uc noktalar, P2 egri UZERINDE (t = 0.5) bir noktadir (Curve'deki gibi).
 *   u = P3 - P1, M = (P1 + P3) / 2, D = P2 - M, n = 0.25 * (-u.y, u.x)  (kirisa dik, uzunlugu 0.25*|u|)
 *   C1 = P1 + 4D/3 + n,  C2 = P3 + 4D/3 - n
 * B(0.5) = (P1 + 3*C1 + 3*C2 + P3) / 8 = M + D = P2 oldugundan egri P2'den gecer; n terimi iki kontrol
 * noktasini kirisin zit yanlarina iterek S sekli verir (P2 kirisin ortasindaysa simetrik S).
 * Kontrol noktalari turetilir; duzenleme P1/P2/P3 tutamaclariyla yapilir.
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
} from './drawing-settings-config';
import { LineToolProps, createLineProps, serializeLineProps, deserializeLineProps } from './line-tool-common';
import { restoreShapeStyle } from './shape-common';
import {
    createOpenStyle,
    openLineSection,
    backgroundSection,
    openAttributeBarItems,
    getOpenSetting,
    setOpenSetting,
} from './open-shape-common';

type Pt = { x: number; y: number };

export const DOUBLE_CURVE_PURPLE = '#673AB7';

/** P2'den gecen S seklinin iki bezier kontrol noktasi (piksel uzayi). */
export function doubleCurveControls(p1: Pt, p2: Pt, p3: Pt): { c1: Pt; c2: Pt } {
    const ux = p3.x - p1.x, uy = p3.y - p1.y;
    const dx = p2.x - (p1.x + p3.x) / 2, dy = p2.y - (p1.y + p3.y) / 2;
    const nx = -0.25 * uy, ny = 0.25 * ux;
    return {
        c1: { x: p1.x + (4 * dx) / 3 + nx, y: p1.y + (4 * dy) / 3 + ny },
        c2: { x: p3.x + (4 * dx) / 3 - nx, y: p3.y + (4 * dy) / 3 - ny },
    };
}

/**
 * Uclardaki DIS yonlu teget vektorleri (normallestirilmemis): baslangic = P1 - C1, bitis = P3 - C2.
 * Teget uzunlugu ~0 ise (C1 == P1 / C2 == P3) sirasiyla diger kontrol noktasina, o da yoksa P1-P3 dogrusuna dusulur.
 */
export function doubleCurveEndDirs(p1: Pt, c1: Pt, c2: Pt, p3: Pt): { start: Pt; end: Pt } {
    const EPS = 1e-6;
    const pick = (cands: Pt[]): Pt => {
        for (const v of cands) if (Math.hypot(v.x, v.y) > EPS) return v;
        return cands[cands.length - 1];
    };
    return {
        start: pick([
            { x: p1.x - c1.x, y: p1.y - c1.y },
            { x: p1.x - c2.x, y: p1.y - c2.y },
            { x: p1.x - p3.x, y: p1.y - p3.y },
        ]),
        end: pick([
            { x: p3.x - c2.x, y: p3.y - c2.y },
            { x: p3.x - c1.x, y: p3.y - c1.y },
            { x: p3.x - p1.x, y: p3.y - p1.y },
        ]),
    };
}

export function cubicAt(p1: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
    const m = 1 - t;
    return {
        x: m * m * m * p1.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t * t * t * p3.x,
        y: m * m * m * p1.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t * t * t * p3.y,
    };
}

export class DoubleCurveDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'doubleCurve';
    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible = true;
    locked = false;
    extendLeft = false;
    extendRight = false;
    lineProps: LineToolProps = createLineProps();

    private _previewIndex = -1;
    private _pixelPoints: Pt[] = [];

    constructor() {
        this.id = generateDrawingId();
        this.style = createOpenStyle(DEFAULT_DRAWING_STYLE, {
            color: DOUBLE_CURVE_PURPLE,
            lineWidth: 2,
            fill: { color: DOUBLE_CURVE_PURPLE, opacity: 0.2, enabled: false },
        });
    }

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    openLineSection({ ends: true }),
                    backgroundSection(),
                    { title: 'Extend', rows: [checkboxRow('extendLeft', 'Extend Left'), checkboxRow('extendRight', 'Extend Right')] },
                ]),
                createVisibilityTab(),
            ],
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return openAttributeBarItems({ fill: true, style: true });
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'visible': return this.visible;
            case 'extendLeft': return this.extendLeft;
            case 'extendRight': return this.extendRight;
        }
        return getOpenSetting(this.style, this.lineProps, key);
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'visible': this.visible = !!value; return;
            case 'extendLeft': this.extendLeft = !!value; return;
            case 'extendRight': this.extendRight = !!value; return;
        }
        setOpenSetting(this.style, this.lineProps, key, value);
    }

    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
        if (this.points.length >= 3) this.state = 'complete';
    }

    isComplete(): boolean { return this.points.length >= 3; }

    updateLastPoint(time: number, price: number): void {
        if (this.state === 'creating') {
            if (this._previewIndex === -1) {
                this.points.push({ time, price });
                this._previewIndex = this.points.length - 1;
            } else {
                this.points[this._previewIndex] = { time, price };
            }
        } else {
            const last = this.points.length - 1;
            if (last >= 0) this.points[last] = { time, price };
        }
    }

    confirmPreviewPoint(): void { this._previewIndex = -1; }

    setPixelPoints(points: Pt[]): void { this._pixelPoints = points; }
    getPixelPoints(): Pt[] { return this._pixelPoints; }

    hitTest(x: number, y: number, threshold: number = 5): boolean {
        const pp = this._pixelPoints;
        if (pp.length < 2) return false;
        for (const p of pp) if (Math.hypot(x - p.x, y - p.y) <= threshold) return true;
        const seg = (a: Pt, b: Pt) => {
            const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
            const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
            return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
        };
        if (pp.length < 3) return seg(pp[0], pp[1]) <= threshold;
        const { c1, c2 } = doubleCurveControls(pp[0], pp[1], pp[2]);
        let prev = pp[0];
        for (let i = 1; i <= 60; i++) {
            const q = cubicAt(pp[0], c1, c2, pp[2], i / 60);
            if (seg(prev, q) <= threshold) return true;
            prev = q;
        }
        const far = 10000;
        const dirs = doubleCurveEndDirs(pp[0], c1, c2, pp[2]);
        const rays: [Pt, Pt][] = [];
        if (this.extendLeft) rays.push([pp[0], dirs.start]);
        if (this.extendRight) rays.push([pp[2], dirs.end]);
        for (const [o, d] of rays) {
            const len = Math.hypot(d.x, d.y);
            if (len === 0) continue;
            if (seg(o, { x: o.x + (d.x / len) * far, y: o.y + (d.y / len) * far }) <= threshold) return true;
        }
        return false;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length < 2) return null;
        const xs = this._pixelPoints.map(p => p.x), ys = this._pixelPoints.map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

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
        };
    }

    static fromJSON(data: SerializedDrawing): DoubleCurveDrawing {
        const d = new DoubleCurveDrawing();
        restoreShapeStyle(d.style, data.style);
        d.extendLeft = data.extendLeft === true;
        d.extendRight = data.extendRight === true;
        d.lineProps = deserializeLineProps(data.lineProps);
        Object.defineProperty(d, 'id', { value: data.id, writable: false });
        d.points = (data.points ?? []).map(p => ({ ...p }));
        d.state = data.state as DrawingState;
        d.visible = data.visible;
        d.locked = data.locked;
        return d;
    }
}
