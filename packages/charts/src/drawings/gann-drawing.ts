/**
 * Gann araclari (tek govde: GannToolBase):
 *   gannBox          Gann Kutusu          (2 tik: karsit koseler P1, P2)
 *   gannFan          Gann Yelpazesi       (2 tik: P1 orijin, P2 = 1x1 cizgisi)
 *   gannSquareFixed  Sabit Gann Karesi    (2 tik: P1 orijin, P2 hucre boyutu; ekranda gercek kare)
 *   gannSquare       Gann Karesi          (2 tik: P1 orijin, P2 serbest; genislik/yukseklik bagimsiz, istege bagli olcek kilidi)
 *
 * Geometri ekran (piksel) uzayinda hesaplanir; hepsi cokgen / cizgi olarak uretilir (tek renderer).
 *
 * KUTU    O = reverse ? P2 : P1, d = diger kose - O. Yatay cizgi y = O.y + h*dy, dikey cizgi x = O.x + v*dx
 *         (h: fiyat, v: zaman seviyeleri). Yatay/dikey bantlar komsu seviyeler arasinda, ust seviyenin rengiyle.
 *         fans: O'dan (v, h) kesisimlerine (h, v > 0) giden caprazlar; ayni egim tek kez (en uzak kesisim).
 * YELPAZE P1'den 9 isin; yon = (dx, oran * dy), oran = fiyat/zaman (1x1 = P2'den gecer): 1/8 .. 8/1. Isinlar
 *         panel kenarina kadar uzar; dolgu komsu isinlar arasi; etiketler isin ucunda (P2'nin x'inde, panel disindaysa panel kenarinda).
 * KARE    5x5 hucre. Orijin O (reverse: P2), hucre vektoru = (sx/5, sy/5).
 *         Sabit: kenar = max(|dx|,|dy|) (ekranda kare, isaretler P1->P2 yonunden). Serbest: (sx, sy) = P1->P2;
 *         scaleLock: yukseklik = bar_sayisi * scaleRatio (bar basina fiyat) fiyat/piksel orani P1-P2'den turetilir; P1-P2 ayni fiyat/piksel
         satirindaysa (oran turetilemez) gorunen fiyat olceginden gelen fallbackPricePerPx (panel yuksekligi / gorunen fiyat araligi)
         kullanilir (yon: yukari); o da yoksa serbest kip korunur (kare cokmez).
KUTU     seviye katsayisi en fazla 10; tamamen panel disinda kalan kutu / fan cizgileri uretilmez.
 *         Izgara seviyeleri 0..5 (iki eksende de), yelpaze cizgileri O'dan karenin kenarina kadar (oran = fiyat/zaman),
 *         yaylar O merkezli ceyrek (elips) yaylar, yaricap = k hucre; yaylar arasi dolgu.
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
    SettingsSection,
    createStyleTab,
    createVisibilityTab,
    colorRow,
    lineWidthRow,
    lineStyleRow,
    checkboxRow,
    numberRow,
} from './drawing-settings-config';
import { lineStyleFromDash, dashFromLineStyle } from './line-tool-common';
import { colorWithTransparency } from './volume-tools-common';
import { PitchLevel, PitchLineStyle, Pt, LevelLimits, sanitizeLevels, wedgeFillPoly } from './pitchfork-drawing';
import { formatFibCoeff } from './fib-time-drawing';

export type GannToolType = 'gannBox' | 'gannSquareFixed' | 'gannSquare' | 'gannFan';
export const GANN_TOOL_TYPES: ReadonlySet<string> = new Set<string>(['gannBox', 'gannSquareFixed', 'gannSquare', 'gannFan']);

const GRAY = '#808080';
const GRAY400 = '#9598A1';
const ORANGE = '#FF9800';
const CYAN = '#00BCD4';
const GREEN = '#4CAF50';
const TEAL = '#089981';
const BLUE = '#2962FF';
const PURPLE = '#9C27B0';
const PINK = '#E91E63';
const RED = '#F23645';

const HALF_PI = Math.PI / 2;
const PAD = 4;
const CELLS = 5;

/** Kutu seviyeleri en fazla 10 (daha buyuk katsayilar paneli asan cizgiler uretir) */
export const GANN_BOX_LIMITS: LevelLimits = { allowZero: true, max: 10 };
export const GANN_GRID_LIMITS: LevelLimits = { allowZero: true, max: CELLS };
export const GANN_ARC_LIMITS: LevelLimits = { max: CELLS };
export const GANN_RATIO_LIMITS: LevelLimits = { max: 1000 };

const mkLevel = (level: number, visible: boolean, color: string): PitchLevel => ({ level, visible, color, lineWidth: 1, lineStyle: 'solid' as PitchLineStyle });

/** Kutu: hem fiyat hem zaman seviyeleri */
const BOX_TABLE: [number, string][] = [[0, GRAY], [0.25, ORANGE], [0.382, CYAN], [0.5, GREEN], [0.618, TEAL], [0.75, BLUE], [1, GRAY]];
export function defaultGannBoxLevels(): PitchLevel[] {
    return BOX_TABLE.map(([c, col]) => mkLevel(c, true, col));
}

/** Yelpaze / kare yelpaze cizgileri: fiyat/zaman orani */
export const GANN_RATIOS = [1 / 8, 1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4, 8];
const RATIO_COLORS = [ORANGE, TEAL, GREEN, TEAL, CYAN, BLUE, PURPLE, PINK, RED];
export function defaultGannFanRatios(): PitchLevel[] {
    return GANN_RATIOS.map((r, i) => mkLevel(r, true, RATIO_COLORS[i]));
}
/** Kare: varsayilan gorunur yelpaze cizgileri 1x4, 1x2, 1x1, 2x1, 4x1 (TradingView gibi simetrik, hepsi kalabaliklastirir) */
const SQUARE_FAN_VISIBLE = new Set([0.25, 0.5, 1, 2, 4]);
export function defaultGannSquareFanRatios(): PitchLevel[] {
    return GANN_RATIOS.map((r, i) => mkLevel(r, SQUARE_FAN_VISIBLE.has(r), RATIO_COLORS[i]));
}
const GRID_COLORS = [GRAY, ORANGE, CYAN, GREEN, BLUE, GRAY];
export function defaultGannGridLevels(): PitchLevel[] {
    return GRID_COLORS.map((col, i) => mkLevel(i, true, col));
}
const ARC_COLORS = [ORANGE, CYAN, GREEN, BLUE, PURPLE];
export function defaultGannArcLevels(): PitchLevel[] {
    return ARC_COLORS.map((col, i) => mkLevel(i + 1, true, col));
}

function defaultsFor(type: GannToolType, key: string): PitchLevel[] {
    switch (key) {
        case 'hlevels': case 'vlevels': return defaultGannBoxLevels();
        case 'gridLevels': return defaultGannGridLevels();
        case 'arcLevels': return defaultGannArcLevels();
        case 'fanLevels': return type === 'gannFan' ? defaultGannFanRatios() : defaultGannSquareFanRatios();
        default: return [];
    }
}

// ----------------------------------------------------------------------------
// Saf geometri (ekran uzayi)
// ----------------------------------------------------------------------------

export interface GannLineGeom { kind: 'level' | 'fan' | 'ray' | 'grid'; level: number; a: Pt; b: Pt; color: string; width: number; dash: number[] }
export interface GannPolylineGeom { kind: 'arc'; level: number; pts: Pt[]; color: string; width: number; dash: number[] }
export interface GannLabelGeom { text: string; x: number; y: number; align: CanvasTextAlign; baseline: CanvasTextBaseline; color: string; size: number }
export interface GannGeometry {
    lines: GannLineGeom[];
    polylines: GannPolylineGeom[];
    fills: { poly: Pt[]; color: string }[];
    labels: GannLabelGeom[];
}

export interface GannSpec {
    hlevels: PitchLevel[];
    vlevels: PitchLevel[];
    gridLevels: PitchLevel[];
    fanLevels: PitchLevel[];
    arcLevels: PitchLevel[];
    color: string;
    lineWidth: number;
    lineDash: number[];
    showLabels: boolean;
    labelFontSize: number;
    showTopLabels: boolean;
    showBottomLabels: boolean;
    showLeftLabels: boolean;
    showRightLabels: boolean;
    hFill: boolean;
    hFillTransparency: number;
    vFill: boolean;
    vFillTransparency: number;
    fansVisible: boolean;
    fill: boolean;
    transparency: number;
    reverse: boolean;
    width: number;
    height: number;
}

const emptyGeom = (): GannGeometry => ({ lines: [], polylines: [], fills: [], labels: [] });

function valid(levels: PitchLevel[], allowZero: boolean): PitchLevel[] {
    return levels.filter(l => l.visible && Number.isFinite(l.level) && (allowZero ? l.level >= 0 : l.level > 0));
}

const fmtNum = (v: number): string => String(Number(v.toFixed(2)));

/** "1/8" ... "8/1" */
export function ratioName(r: number): string {
    return r >= 1 ? `${fmtNum(r)}/1` : `1/${fmtNum(1 / r)}`;
}
/** "1x8" ... "8x1" (kare) */
export function ratioNameX(r: number): string {
    return r >= 1 ? `${fmtNum(r)}×1` : `1×${fmtNum(1 / r)}`;
}

// ---- Kutu ----

/** Dogru parcasi panelin [0,w]x[0,h] dikdortgeninin tamamen disinda mi (iki uc ayni dis tarafta)? */
export function segOutsideRect(a: Pt, b: Pt, w: number, h: number): boolean {
    return (a.x < 0 && b.x < 0) || (a.x > w && b.x > w) || (a.y < 0 && b.y < 0) || (a.y > h && b.y > h);
}

export function computeGannBox(p1: Pt, p2: Pt, spec: GannSpec): GannGeometry {
    const out = emptyGeom();
    const o = spec.reverse ? p2 : p1;
    const e = spec.reverse ? p1 : p2;
    const dx = e.x - o.x, dy = e.y - o.y;
    const hs = valid(spec.hlevels, true).sort((a, b) => a.level - b.level);
    const vs = valid(spec.vlevels, true).sort((a, b) => a.level - b.level);
    if (!hs.length || !vs.length) return out;
    const x0 = o.x + vs[0].level * dx, x1 = o.x + vs[vs.length - 1].level * dx;
    const y0 = o.y + hs[0].level * dy, y1 = o.y + hs[hs.length - 1].level * dy;

    // Bantlar (cizgilerin altinda)
    if (spec.hFill) {
        for (let i = 1; i < hs.length; i++) {
            const ya = o.y + hs[i - 1].level * dy, yb = o.y + hs[i].level * dy;
            out.fills.push({ poly: [{ x: x0, y: ya }, { x: x1, y: ya }, { x: x1, y: yb }, { x: x0, y: yb }], color: colorWithTransparency(hs[i].color, spec.hFillTransparency) });
        }
    }
    if (spec.vFill) {
        for (let i = 1; i < vs.length; i++) {
            const xa = o.x + vs[i - 1].level * dx, xb = o.x + vs[i].level * dx;
            out.fills.push({ poly: [{ x: xa, y: y0 }, { x: xb, y: y0 }, { x: xb, y: y1 }, { x: xa, y: y1 }], color: colorWithTransparency(vs[i].color, spec.vFillTransparency) });
        }
    }

    for (const lv of hs) {
        const y = o.y + lv.level * dy;
        const a = { x: x0, y }, b = { x: x1, y };
        if (segOutsideRect(a, b, spec.width, spec.height)) continue;
        out.lines.push({ kind: 'level', level: lv.level, a, b, color: lv.color, width: spec.lineWidth, dash: spec.lineDash });
    }
    for (const lv of vs) {
        const x = o.x + lv.level * dx;
        const a = { x, y: y0 }, b = { x, y: y1 };
        if (segOutsideRect(a, b, spec.width, spec.height)) continue;
        out.lines.push({ kind: 'level', level: lv.level, a, b, color: lv.color, width: spec.lineWidth, dash: spec.lineDash });
    }

    if (spec.fansVisible) {
        const best = new Map<string, { v: number; h: number }>();
        for (const h of hs) for (const v of vs) {
            if (!(h.level > 0) || !(v.level > 0)) continue;
            const key = (h.level / v.level).toFixed(6);
            const cur = best.get(key);
            if (!cur || v.level > cur.v) best.set(key, { v: v.level, h: h.level });
        }
        for (const [, { v, h }] of best) {
            const fb = { x: o.x + v * dx, y: o.y + h * dy };
            if (segOutsideRect(o, fb, spec.width, spec.height)) continue;
            out.lines.push({ kind: 'fan', level: h / v, a: o, b: fb, color: spec.color, width: spec.lineWidth, dash: spec.lineDash });
        }
    }

    const top = Math.min(y0, y1), bottom = Math.max(y0, y1);
    const left = Math.min(x0, x1), right = Math.max(x0, x1);
    const fs = spec.labelFontSize;
    for (const lv of vs) {
        const x = o.x + lv.level * dx;
        const text = formatFibCoeff(lv.level);
        if (spec.showTopLabels) out.labels.push({ text, x, y: top - PAD, align: 'center', baseline: 'bottom', color: lv.color, size: fs });
        if (spec.showBottomLabels) out.labels.push({ text, x, y: bottom + PAD, align: 'center', baseline: 'top', color: lv.color, size: fs });
    }
    for (const lv of hs) {
        const y = o.y + lv.level * dy;
        const text = formatFibCoeff(lv.level);
        if (spec.showLeftLabels) out.labels.push({ text, x: left - PAD, y, align: 'right', baseline: 'middle', color: lv.color, size: fs });
        if (spec.showRightLabels) out.labels.push({ text, x: right + PAD, y, align: 'left', baseline: 'middle', color: lv.color, size: fs });
    }
    return out;
}

// ---- Yelpaze ----

function fanReach(o: Pt, width: number, height: number): number {
    return Math.hypot(o.x - width / 2, o.y - height / 2) + Math.hypot(width, height) + 1;
}

/** Isinin panel dikdortgenindeki [t0, t1] araligi (birim yon vektoru); kesismezse null (Liang-Barsky) */
export function clipRayToRect(o: Pt, u: Pt, w: number, h: number): [number, number] | null {
    let t0 = 0, t1 = Infinity;
    const clip = (p: number, q: number): boolean => {
        if (Math.abs(p) < 1e-12) return q >= 0;
        const r = q / p;
        if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
        else { if (r < t0) return false; if (r < t1) t1 = r; }
        return true;
    };
    if (!clip(-u.x, o.x) || !clip(u.x, w - o.x) || !clip(-u.y, o.y) || !clip(u.y, h - o.y)) return null;
    return Number.isFinite(t1) ? [t0, t1] : null;
}

export function computeGannFan(p1: Pt, p2: Pt, spec: GannSpec): GannGeometry {
    const out = emptyGeom();
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    if (Math.abs(dx) < 1e-9) return out;
    const L = fanReach(p1, spec.width, spec.height);
    const vis = valid(spec.fanLevels, false).sort((a, b) => a.level - b.level);
    const rays: { level: number; color: string; b: Pt }[] = [];
    for (const lv of vis) {
        const vx = dx, vy = lv.level * dy;
        const len = Math.hypot(vx, vy);
        const u = { x: vx / len, y: vy / len };
        const b = { x: p1.x + u.x * L, y: p1.y + u.y * L };
        rays.push({ level: lv.level, color: lv.color, b });
        out.lines.push({ kind: 'ray', level: lv.level, a: p1, b, color: lv.color, width: spec.lineWidth, dash: spec.lineDash });
        if (spec.showLabels) {
            // Etiket: P2'nin x'indeki nokta (panelde ise), degilse isinin panelden cikis noktasi
            const T = { x: p1.x + dx, y: p1.y + lv.level * dy };
            const inside = T.x >= 0 && T.x <= spec.width && T.y >= 0 && T.y <= spec.height;
            let lx = T.x, ly = T.y;
            let align: CanvasTextAlign = dx >= 0 ? 'left' : 'right';
            let baseline: CanvasTextBaseline = 'middle';
            if (!inside) {
                const rg = clipRayToRect(p1, u, spec.width, spec.height);
                if (!rg || rg[1] <= 1e-6) continue;
                lx = Math.min(spec.width - PAD, Math.max(PAD, p1.x + u.x * rg[1]));
                ly = Math.min(spec.height - PAD, Math.max(PAD, p1.y + u.y * rg[1]));
                align = lx > spec.width / 2 ? 'right' : 'left';
                baseline = ly > spec.height / 2 ? 'bottom' : 'top';
            } else {
                lx += dx >= 0 ? PAD : -PAD;
            }
            out.labels.push({ text: ratioName(lv.level), x: lx, y: ly, align, baseline, color: lv.color, size: spec.labelFontSize });
        }
    }
    if (spec.fill) {
        for (let i = 1; i < rays.length; i++) {
            out.fills.push({ poly: wedgeFillPoly(p1, rays[i - 1].b, rays[i].b, L), color: colorWithTransparency(rays[i].color, spec.transparency) });
        }
    }
    return out;
}

// ---- Kare ----

export interface GannSquareOpts {
    fixed: boolean;
    reverse: boolean;
    scaleLock: boolean;
    /** bar basina fiyat */
    scaleRatio: number;
    /** css px / bar */
    barSpacing?: number;
    /** points'ten: P1->P2 fiyat farki (isaretli) */
    priceDelta?: number;
    /**
     * Gorunen fiyat olceginden piksel basina fiyat (panel yuksekligi / gorunen fiyat araligi). Yalnizca scaleLock acikken ve
     * P1-P2 ayni fiyat/piksel satirindaysa (kendi orani turetilemiyorsa) kullanilir; verilmezse serbest kip korunur.
     */
    fallbackPricePerPx?: number;
}

export interface GannSquareExtent {
    o: Pt;
    sx: number;
    sy: number;
    info: { priceDiff: number; bars: number; ratio: number } | null;
}

/** Karenin orijini ve 5 hucrelik vektoru (sx, sy) + kose bilgisi. */
export function gannSquareExtent(p1: Pt, p2: Pt, opts: GannSquareOpts): GannSquareExtent {
    const o = opts.reverse ? p2 : p1;
    const e = opts.reverse ? p1 : p2;
    let vx = e.x - o.x, vy = e.y - o.y;
    const sgx = vx < 0 ? -1 : 1;
    let sgy = vy < 0 ? -1 : 1;
    if (opts.fixed) {
        const side = Math.max(Math.abs(vx), Math.abs(vy));
        return { o, sx: sgx * side, sy: sgy * side, info: null };
    }
    // fiyat / piksel: P1-P2'den turetilir
    const dyPx = Math.abs(p2.y - p1.y);
    let pricePerPx = opts.priceDelta !== undefined && dyPx > 1e-9 ? Math.abs(opts.priceDelta) / dyPx : NaN;
    const bars = opts.barSpacing && opts.barSpacing > 0 ? Math.abs(vx) / opts.barSpacing : NaN;
    // Olcek kilidi: P1-P2 ayni fiyatta / piksel satirindaysa kendi orani yok -> gorunen fiyat olcegi (varsa), yoksa serbest kip
    if (opts.scaleLock && opts.scaleRatio > 0 && !(pricePerPx > 0) && opts.fallbackPricePerPx !== undefined
        && Number.isFinite(opts.fallbackPricePerPx) && opts.fallbackPricePerPx > 0) {
        pricePerPx = opts.fallbackPricePerPx;
        if (Math.abs(vy) < 1e-9) sgy = -1; // ayni satirda yon belirsiz: yukari
    }
    if (opts.scaleLock && opts.scaleRatio > 0 && Number.isFinite(pricePerPx) && pricePerPx > 0 && Number.isFinite(bars)) {
        vy = sgy * (bars * opts.scaleRatio) / pricePerPx;
    }
    let info: GannSquareExtent['info'] = null;
    if (Number.isFinite(pricePerPx) && Number.isFinite(bars) && bars > 0) {
        // Isaret: origin'den diger koseye fiyat yonu (reverse: P2 origin, yon P1'e doner)
        let sign = (opts.reverse ? -1 : 1) * Math.sign(opts.priceDelta ?? 0);
        if (sign === 0 && vy !== 0) sign = -Math.sign(vy); // ayni fiyat (yedek olcek): ekranda yukari = pozitif
        const priceDiff = sign * Math.abs(vy) * pricePerPx;
        info = { priceDiff, bars, ratio: Math.abs(priceDiff) / bars };
    }
    return { o, sx: vx, sy: vy, info };
}

function quarterArc(o: Pt, sx: number, sy: number, k: number): Pt[] {
    const rx = (k * sx) / CELLS, ry = (k * sy) / CELLS; // isaretli: dogru kadrana duser
    const pts: Pt[] = [];
    const n = 40;
    for (let i = 0; i <= n; i++) {
        const t = (HALF_PI * i) / n;
        pts.push({ x: o.x + rx * Math.cos(t), y: o.y + ry * Math.sin(t) });
    }
    return pts;
}

const fmtPrice = (v: number): string => String(Number(v.toPrecision(6)));

export function computeGannSquare(p1: Pt, p2: Pt, spec: GannSpec, opts: GannSquareOpts): GannGeometry {
    const out = emptyGeom();
    const { o, sx, sy, info } = gannSquareExtent(p1, p2, opts);
    if (Math.abs(sx) < 1e-9 || Math.abs(sy) < 1e-9) return out;
    const cx = sx / CELLS, cy = sy / CELLS;
    const grid = valid(spec.gridLevels, true).sort((a, b) => a.level - b.level);
    const fans = valid(spec.fanLevels, false).sort((a, b) => a.level - b.level);
    const arcs = valid(spec.arcLevels, false).sort((a, b) => a.level - b.level);
    const fs = spec.labelFontSize;

    // Yay dolgulari (en altta)
    if (spec.fill) {
        for (let i = 1; i < arcs.length; i++) {
            const inner = quarterArc(o, sx, sy, arcs[i - 1].level);
            const outer = quarterArc(o, sx, sy, arcs[i].level);
            out.fills.push({ poly: outer.concat(inner.reverse()), color: colorWithTransparency(arcs[i].color, spec.transparency) });
        }
    }
    for (const g of grid) {
        out.lines.push({ kind: 'grid', level: g.level, a: { x: o.x + g.level * cx, y: o.y }, b: { x: o.x + g.level * cx, y: o.y + sy }, color: g.color, width: spec.lineWidth, dash: spec.lineDash });
        out.lines.push({ kind: 'grid', level: g.level, a: { x: o.x, y: o.y + g.level * cy }, b: { x: o.x + sx, y: o.y + g.level * cy }, color: g.color, width: spec.lineWidth, dash: spec.lineDash });
    }
    for (const a of arcs) {
        out.polylines.push({ kind: 'arc', level: a.level, pts: quarterArc(o, sx, sy, a.level), color: a.color, width: spec.lineWidth, dash: spec.lineDash });
    }
    for (const f of fans) {
        const ex = f.level <= 1 ? CELLS : CELLS / f.level;
        const ey = f.level <= 1 ? CELLS * f.level : CELLS;
        const b = { x: o.x + ex * cx, y: o.y + ey * cy };
        out.lines.push({ kind: 'fan', level: f.level, a: o, b, color: f.color, width: spec.lineWidth, dash: spec.lineDash });
        if (spec.showLabels && opts.fixed) {
            out.labels.push({ text: ratioNameX(f.level), x: b.x + (sx >= 0 ? PAD : -PAD), y: b.y + (sy >= 0 ? PAD : -PAD), align: sx >= 0 ? 'left' : 'right', baseline: sy >= 0 ? 'top' : 'bottom', color: f.color, size: fs });
        }
    }
    if (spec.showLabels) {
        if (opts.fixed) {
            // Izgara seviye numaralari: ust (zaman) ve sol (fiyat) kenar
            const near = sy >= 0 ? -PAD : PAD;
            for (const g of grid) {
                if (g.level > 0) out.labels.push({ text: formatFibCoeff(g.level), x: o.x + g.level * cx, y: o.y + near, align: 'center', baseline: sy >= 0 ? 'bottom' : 'top', color: g.color, size: fs });
                if (g.level > 0) out.labels.push({ text: formatFibCoeff(g.level), x: o.x + (sx >= 0 ? -PAD : PAD), y: o.y + g.level * cy, align: sx >= 0 ? 'right' : 'left', baseline: 'middle', color: g.color, size: fs });
            }
        } else if (info) {
            const c = spec.color;
            out.labels.push({ text: `${fmtNum(info.bars)} bars`, x: o.x + sx, y: o.y - (sy >= 0 ? PAD : -PAD), align: sx >= 0 ? 'right' : 'left', baseline: sy >= 0 ? 'bottom' : 'top', color: c, size: fs });
            out.labels.push({ text: fmtPrice(info.priceDiff), x: o.x + (sx >= 0 ? -PAD : PAD), y: o.y + sy, align: sx >= 0 ? 'right' : 'left', baseline: sy >= 0 ? 'top' : 'bottom', color: c, size: fs });
            out.labels.push({ text: fmtPrice(info.ratio), x: o.x + sx + (sx >= 0 ? PAD : -PAD), y: o.y + sy + (sy >= 0 ? PAD : -PAD), align: sx >= 0 ? 'left' : 'right', baseline: sy >= 0 ? 'top' : 'bottom', color: c, size: fs });
        }
    }
    return out;
}

function segDist(px: number, py: number, a: Pt, b: Pt): number {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

// ----------------------------------------------------------------------------
// Cizim sinifi
// ----------------------------------------------------------------------------

const clampInt = (v: any, lo: number, hi: number, d: number): number => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};

const LEVEL_KEYS = ['hlevels', 'vlevels', 'gridLevels', 'fanLevels', 'arcLevels'] as const;
const BOOL_KEYS = ['showLabels', 'showTopLabels', 'showBottomLabels', 'showLeftLabels', 'showRightLabels', 'hFill', 'vFill', 'fansVisible', 'fillBackground', 'reverse', 'scaleLock'] as const;

export class GannToolBase implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType;

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;
    paneId?: string | null;
    intervalsVisibilities?: import('./intervals-visibility').IntervalsVisibilities;

    hlevels: PitchLevel[] = [];
    vlevels: PitchLevel[] = [];
    gridLevels: PitchLevel[] = [];
    fanLevels: PitchLevel[] = [];
    arcLevels: PitchLevel[] = [];
    showLabels = true;
    labelFontSize = 12;
    showTopLabels = true;
    showBottomLabels = true;
    showLeftLabels = true;
    showRightLabels = true;
    hFill = true;
    hFillTransparency = 80;
    vFill = true;
    vFillTransparency = 80;
    fansVisible = false;
    fillBackground = true;
    fillTransparency = 80;
    reverse = false;
    scaleLock = false;
    /** bar basina fiyat */
    scaleRatio = 1;

    private _previewIndex = -1;
    private _pixelPoints: Pt[] = [];
    private _geom: GannGeometry = emptyGeom();

    constructor(type: GannToolType) {
        this.id = generateDrawingId();
        this.type = type;
        // style.color: Kutu'da fans cizgi rengi; digerlerinde kontrol noktasi / kare etiket rengi. style.lineWidth: tum cizgiler.
        this.style = { ...DEFAULT_DRAWING_STYLE, color: type === 'gannBox' ? GRAY400 : GRAY, lineWidth: 1, lineDash: [] };
        if (type === 'gannBox') { this.hlevels = defaultGannBoxLevels(); this.vlevels = defaultGannBoxLevels(); }
        else if (type === 'gannFan') { this.fanLevels = defaultGannFanRatios(); }
        else { this.gridLevels = defaultGannGridLevels(); this.fanLevels = defaultGannSquareFanRatios(); this.arcLevels = defaultGannArcLevels(); }
        // Kare etiketleri: Sabit karede izgara/yelpaze numaralari, Karede kose bilgileri; ikisi de varsayilan acik
    }

    get isBox(): boolean { return this.type === 'gannBox'; }
    get isFan(): boolean { return this.type === 'gannFan'; }
    get isSquare(): boolean { return this.type === 'gannSquare' || this.type === 'gannSquareFixed'; }
    get requiredPoints(): number { return 2; }

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

    // ---- Geometri / hit-test ----

    getPixelPoints(): Pt[] { return this._pixelPoints; }
    setPixelPoints(pts: Pt[]): void { this._pixelPoints = pts; }
    getGeometry(): GannGeometry { return this._geom; }

    geomSpec(width: number, height: number): GannSpec {
        return {
            hlevels: this.hlevels, vlevels: this.vlevels, gridLevels: this.gridLevels, fanLevels: this.fanLevels, arcLevels: this.arcLevels,
            color: this.style.color,
            lineWidth: this.style.lineWidth,
            lineDash: this.style.lineDash ?? [],
            showLabels: this.showLabels,
            labelFontSize: this.labelFontSize,
            showTopLabels: this.showTopLabels,
            showBottomLabels: this.showBottomLabels,
            showLeftLabels: this.showLeftLabels,
            showRightLabels: this.showRightLabels,
            hFill: this.hFill, hFillTransparency: this.hFillTransparency,
            vFill: this.vFill, vFillTransparency: this.vFillTransparency,
            fansVisible: this.fansVisible,
            fill: this.fillBackground,
            transparency: this.fillTransparency,
            reverse: this.reverse,
            width, height,
        };
    }

    /** Ekran noktalarindan (css px) geometriyi hesaplar ve onbellege yazar. barSpacing: css px / bar (Gann Karesi etiket + olcek kilidi); fallbackPricePerPx: gorunen olcekten piksel basina fiyat (olcek kilidi yedegi). */
    layout(pts: Pt[], width: number, height: number, barSpacing?: number, fallbackPricePerPx?: number): GannGeometry {
        this._pixelPoints = pts;
        const spec = this.geomSpec(width, height);
        if (pts.length < 2) this._geom = emptyGeom();
        else if (this.isBox) this._geom = computeGannBox(pts[0], pts[1], spec);
        else if (this.isFan) this._geom = computeGannFan(pts[0], pts[1], spec);
        else {
            const priceDelta = this.points.length >= 2 ? this.points[1].price - this.points[0].price : undefined;
            this._geom = computeGannSquare(pts[0], pts[1], spec, {
                fixed: this.type === 'gannSquareFixed', reverse: this.reverse, scaleLock: this.scaleLock, scaleRatio: this.scaleRatio, barSpacing, priceDelta, fallbackPricePerPx,
            });
        }
        return this._geom;
    }

    hitTest(x: number, y: number, threshold: number = 6): boolean {
        for (const l of this._geom.lines) {
            if (segDist(x, y, l.a, l.b) <= threshold) return true;
        }
        for (const pl of this._geom.polylines) {
            for (let i = 1; i < pl.pts.length; i++) {
                if (segDist(x, y, pl.pts[i - 1], pl.pts[i]) <= threshold) return true;
            }
        }
        for (const p of this._pixelPoints) {
            if (Math.hypot(x - p.x, y - p.y) <= threshold) return true;
        }
        return false;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length < 2) return null;
        const xs = this._pixelPoints.map(p => p.x);
        const ys = this._pixelPoints.map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    // ---- Ayarlar ----

    getSettingsConfig(): DrawingSettingsConfig {
        const levelsRow = (key: string, label: string, allowZero: boolean, max: number) => ({ type: 'pitchLevels', key, label, allowZero, max, lines: false } as any);
        const slider = (key: string) => ({ type: 'slider', key, label: 'Transparency', min: 0, max: 100, step: 1, unit: '%', suffix: '%' } as any);
        const sections: SettingsSection[] = [];
        if (this.isBox) {
            sections.push({ title: 'Lines', rows: [lineWidthRow('lineWidth'), lineStyleRow('lineStyle')] });
            sections.push({ title: 'Price levels', rows: [levelsRow('hlevels', 'Price levels', true, GANN_BOX_LIMITS.max!)] });
            sections.push({ title: 'Time levels', rows: [levelsRow('vlevels', 'Time levels', true, GANN_BOX_LIMITS.max!)] });
            sections.push({ title: 'Angles', rows: [checkboxRow('fansVisible', 'Angles', false), colorRow('color', 'Color')] });
            sections.push({
                title: 'Labels',
                rows: [
                    checkboxRow('showTopLabels', 'Top labels', true),
                    checkboxRow('showBottomLabels', 'Bottom labels', true),
                    checkboxRow('showLeftLabels', 'Left labels', true),
                    checkboxRow('showRightLabels', 'Right labels', true),
                ],
            });
            sections.push({ title: 'Horizontal background', rows: [checkboxRow('hFill', 'Horizontal background', true), slider('hFillTransparency')] });
            sections.push({ title: 'Vertical background', rows: [checkboxRow('vFill', 'Vertical background', true), slider('vFillTransparency')] });
            sections.push({ rows: [checkboxRow('reverse', 'Reverse', false)] });
        } else if (this.isFan) {
            sections.push({ title: 'Rays', rows: [lineWidthRow('lineWidth'), lineStyleRow('lineStyle')] });
            sections.push({ title: 'Fan levels', rows: [levelsRow('fanLevels', 'Fan levels', false, GANN_RATIO_LIMITS.max!)] });
            sections.push({ title: 'Labels', rows: [checkboxRow('showLabels', 'Show labels', true)] });
            sections.push({ title: 'Background', rows: [checkboxRow('fillBackground', 'Background', true), slider('fillTransparency')] });
        } else {
            sections.push({ title: 'Lines', rows: [lineWidthRow('lineWidth'), lineStyleRow('lineStyle')] });
            sections.push({ title: 'Grid levels', rows: [levelsRow('gridLevels', 'Grid levels', true, CELLS)] });
            sections.push({ title: 'Fan levels', rows: [levelsRow('fanLevels', 'Fan levels', false, GANN_RATIO_LIMITS.max!)] });
            sections.push({ title: 'Arc levels', rows: [levelsRow('arcLevels', 'Arc levels', false, CELLS)] });
            const labelRows: any[] = [checkboxRow('showLabels', 'Show labels', true)];
            if (this.type === 'gannSquare') {
                labelRows.push(colorRow('color', 'Label color'), numberRow('labelFontSize', 'Label font size', { min: 8, max: 40, step: 1 }));
            }
            sections.push({ title: 'Labels', rows: labelRows });
            if (this.type === 'gannSquare') {
                sections.push({ title: 'Scale', rows: [checkboxRow('scaleLock', 'Lock scale ratio', false), numberRow('scaleRatio', 'Scale ratio (price per bar)', { min: 0.0000001, max: 1000000, step: 0.1, wide: true })] });
            }
            sections.push({ title: 'Arcs background', rows: [checkboxRow('fillBackground', 'Arcs background', true), slider('fillTransparency')] });
            sections.push({ rows: [checkboxRow('reverse', 'Reverse', false)] });
        }
        return { tabs: [createStyleTab(sections), createVisibilityTab()] };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: this.isBox ? 'Angles Color' : 'Color' },
            { type: 'lineWidth', key: 'lineWidth', tooltip: 'Line Width' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'color': return this.style.color;
            case 'lineWidth': return this.style.lineWidth;
            case 'lineStyle': return lineStyleFromDash(this.style.lineDash);
            case 'hlevels': case 'vlevels': case 'gridLevels': case 'fanLevels': case 'arcLevels':
                return this[key].map(l => ({ ...l }));
            case 'showLabels': case 'showTopLabels': case 'showBottomLabels': case 'showLeftLabels': case 'showRightLabels':
            case 'hFill': case 'vFill': case 'fansVisible': case 'fillBackground': case 'reverse': case 'scaleLock':
            case 'labelFontSize': case 'hFillTransparency': case 'vFillTransparency': case 'fillTransparency': case 'scaleRatio':
                return this[key];
            case 'visible': return this.visible;
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'color': this.style.color = String(value); return;
            case 'lineWidth': {
                const n = Number(value);
                if (Number.isFinite(n) && n > 0) this.style.lineWidth = Math.min(10, n);
                return;
            }
            case 'lineStyle': {
                const dash = dashFromLineStyle(value);
                if (dash) this.style.lineDash = dash;
                return;
            }
            case 'hlevels': case 'vlevels': case 'gridLevels': case 'arcLevels': case 'fanLevels':
                this._setLevels(key, value, false); return;
            case 'showLabels': case 'showTopLabels': case 'showBottomLabels': case 'showLeftLabels': case 'showRightLabels':
            case 'hFill': case 'vFill': case 'fansVisible': case 'fillBackground': case 'reverse': case 'scaleLock':
                this[key] = !!value; return;
            case 'hFillTransparency': case 'vFillTransparency': case 'fillTransparency':
                this[key] = clampInt(value, 0, 100, 80); return;
            case 'labelFontSize': this.labelFontSize = clampInt(value, 8, 40, 12); return;
            case 'scaleRatio': {
                const n = Number(value);
                if (Number.isFinite(n) && n > 0) this.scaleRatio = n;
                return;
            }
            case 'visible': this.visible = !!value; return;
        }
    }

    /**
     * Seviye tablosu yazar. keepOutOfRange=false (arayuz duzenlemesi): aralik disi katsayi reddedilir (varsayilana doner);
     * true (kayitli veriyi geri yukleme): sonlu ama aralik disi katsayi oldugu gibi korunur (eski kayitlar sessizce degismez).
     */
    private _setLevels(key: 'hlevels' | 'vlevels' | 'gridLevels' | 'arcLevels' | 'fanLevels', value: any, keepOutOfRange: boolean): void {
        switch (key) {
            case 'hlevels': case 'vlevels':
                this[key] = sanitizeLevels(value, defaultsFor(this.type as GannToolType, key), { ...GANN_BOX_LIMITS, keepOutOfRange }); return;
            case 'gridLevels': this.gridLevels = sanitizeLevels(value, defaultGannGridLevels(), { ...GANN_GRID_LIMITS, keepOutOfRange }); return;
            case 'arcLevels': this.arcLevels = sanitizeLevels(value, defaultGannArcLevels(), { ...GANN_ARC_LIMITS, keepOutOfRange }); return;
            case 'fanLevels': this.fanLevels = sanitizeLevels(value, defaultsFor(this.type as GannToolType, 'fanLevels'), { ...GANN_RATIO_LIMITS, keepOutOfRange }); return;
        }
    }

    // ---- Serilestirme ----

    toJSON(): SerializedDrawing {
        const ext: Record<string, any> = {};
        for (const k of LEVEL_KEYS) ext[k] = this[k].map(l => ({ ...l }));
        for (const k of BOOL_KEYS) ext[k] = this[k];
        ext.labelFontSize = this.labelFontSize;
        ext.hFillTransparency = this.hFillTransparency;
        ext.vFillTransparency = this.vFillTransparency;
        ext.fillTransparency = this.fillTransparency;
        ext.scaleRatio = this.scaleRatio;
        return {
            id: this.id,
            type: this.type,
            points: this.points.map(p => ({ ...p })),
            style: { ...this.style, lineDash: [...(this.style.lineDash ?? [])] },
            state: this.state === 'selected' ? 'complete' : this.state,
            visible: this.visible,
            locked: this.locked,
            ext,
        };
    }

    protected _restore(data: SerializedDrawing): void {
        Object.defineProperty(this, 'id', { value: data.id, writable: false });
        this.points = (data.points ?? []).map(p => ({ ...p }));
        this.style = { ...this.style, ...data.style };
        this.state = data.state as DrawingState;
        this.visible = data.visible;
        this.locked = data.locked;
        const ext = data.ext ?? {};
        const keys = [...LEVEL_KEYS, ...BOOL_KEYS, 'labelFontSize', 'hFillTransparency', 'vFillTransparency', 'fillTransparency', 'scaleRatio'];
        for (const k of keys) {
            if (ext[k] === undefined) continue;
            // Bu tipte kullanilmayan seviye tablolari varsayilan (bos) kalir
            if ((LEVEL_KEYS as readonly string[]).includes(k)) {
                if ((this as any)[k].length === 0) continue;
                this._setLevels(k as typeof LEVEL_KEYS[number], ext[k], true);
                continue;
            }
            this.setSettingValue(k, ext[k]);
        }
    }

    static fromJSON(data: SerializedDrawing): GannToolBase {
        const drawing = new GannToolBase(data.type as GannToolType);
        drawing._restore(data);
        return drawing;
    }
}

export { GannToolBase as GannBoxDrawing, GannToolBase as GannSquareFixedDrawing, GannToolBase as GannSquareDrawing, GannToolBase as GannFanDrawing };
