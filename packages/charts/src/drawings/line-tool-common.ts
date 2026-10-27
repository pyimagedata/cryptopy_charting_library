/**
 * Line Tool Common
 *
 * Trend Line ailesi (trendLine, ray, extendedLine) icin ortak katman:
 *  - ozellik arayuzu + varsayilanlar (uc sekilleri, orta nokta, fiyat etiketleri, istatistikler)
 *  - ayar satirlari, get/set, serilestirme
 *  - istatistik metni hesabi (fiyat/yuzde/pip/bar/sure/mesafe/aci)
 *  - canvas yardimcilari (ok ucu, orta nokta, istatistik kutusu)
 *  - Shift ile 45 derece adimina kilitleme yardimcisi (diger cizgi araclari da kullanabilir)
 */

import type { DrawingPoint, DrawingStyle, SerializedDrawing } from './drawing';
import { t } from '../helpers/translations';
import {
    SettingsSection,
    colorRow,
    lineWidthRow,
    lineStyleRow,
    checkboxRow,
    selectRow
} from './drawing-settings-config';

// ============================================================================
// Properties
// ============================================================================

export type LineEndStyle = 'normal' | 'arrow';
export type StatsPosition = 'left' | 'center' | 'right';

export interface LineToolProps {
    leftEnd: LineEndStyle;
    rightEnd: LineEndStyle;
    showMiddlePoint: boolean;
    showPriceLabels: boolean;
    showPriceRange: boolean;
    showPercentPriceRange: boolean;
    showPipsPriceRange: boolean;
    showBarsRange: boolean;
    showDateTimeRange: boolean;
    showDistance: boolean;
    showAngle: boolean;
    statsPosition: StatsPosition;
    alwaysShowStats: boolean;
}

export const DEFAULT_LINE_TOOL_PROPS: Readonly<LineToolProps> = {
    leftEnd: 'normal',
    rightEnd: 'normal',
    showMiddlePoint: false,
    showPriceLabels: false,
    showPriceRange: false,
    showPercentPriceRange: false,
    showPipsPriceRange: false,
    showBarsRange: false,
    showDateTimeRange: false,
    showDistance: false,
    showAngle: false,
    statsPosition: 'right',
    alwaysShowStats: false,
};

/** Info Line varsayilanlari: istatistikler hep acik ve ortada, yedi istatistigin hepsi acik. */
export const INFO_LINE_PROP_DEFAULTS: Readonly<LineToolProps> = {
    ...DEFAULT_LINE_TOOL_PROPS,
    showPriceRange: true,
    showPercentPriceRange: true,
    showPipsPriceRange: true,
    showBarsRange: true,
    showDateTimeRange: true,
    showDistance: true,
    showAngle: true,
    statsPosition: 'center',
    alwaysShowStats: true,
};

/** Arrow varsayilanlari: sag uc ok. */
export const ARROW_LINE_PROP_DEFAULTS: Readonly<LineToolProps> = {
    ...DEFAULT_LINE_TOOL_PROPS,
    rightEnd: 'arrow',
};

const LINE_PROP_KEYS = Object.keys(DEFAULT_LINE_TOOL_PROPS) as (keyof LineToolProps)[];
const END_VALUES: LineEndStyle[] = ['normal', 'arrow'];
const POSITION_VALUES: StatsPosition[] = ['left', 'center', 'right'];

export function createLineProps(
    partial?: Partial<LineToolProps>,
    defaults: Readonly<LineToolProps> = DEFAULT_LINE_TOOL_PROPS
): LineToolProps {
    return deserializeLineProps(partial, defaults);
}

export function isLineProp(key: string): key is keyof LineToolProps {
    return (LINE_PROP_KEYS as string[]).includes(key);
}

export function getLineProp(props: LineToolProps, key: string): any {
    return isLineProp(key) ? props[key] : undefined;
}

/** Degeri dogrular ve yazar. Bilinmeyen anahtar/gecersiz deger icin false doner. */
export function setLineProp(props: LineToolProps, key: string, value: any): boolean {
    if (!isLineProp(key)) return false;
    if (key === 'leftEnd' || key === 'rightEnd') {
        if (!END_VALUES.includes(value)) return false;
        props[key] = value;
    } else if (key === 'statsPosition') {
        if (!POSITION_VALUES.includes(value)) return false;
        props[key] = value;
    } else {
        props[key] = !!value;
    }
    return true;
}

export function serializeLineProps(props: LineToolProps): LineToolProps {
    return { ...props };
}

/** Eksik/gecersiz alanlar varsayilana duser (eski kayitlar degismeden yuklenir). */
export function deserializeLineProps(
    raw: unknown,
    defaults: Readonly<LineToolProps> = DEFAULT_LINE_TOOL_PROPS
): LineToolProps {
    const result: LineToolProps = { ...defaults };
    if (raw && typeof raw === 'object') {
        for (const key of LINE_PROP_KEYS) {
            const v = (raw as any)[key];
            if (v !== undefined) setLineProp(result, key, v);
        }
    }
    return result;
}

export function hasAnyStats(p: LineToolProps): boolean {
    return p.showPriceRange || p.showPercentPriceRange || p.showPipsPriceRange ||
        p.showBarsRange || p.showDateTimeRange || p.showDistance || p.showAngle;
}

// ============================================================================
// Settings rows
// ============================================================================

/** Secenek etiketleri ayar penceresi acilirken cevrilir (dil degisimine uyumlu) */
export const endOptions = () => [
    { value: 'normal', label: t('Normal') },
    { value: 'arrow', label: t('Arrow') },
];

const positionOptions = () => [
    { value: 'left', label: t('Left') },
    { value: 'center', label: t('Center') },
    { value: 'right', label: t('Right') },
];

export interface LineStyleSectionOptions {
    /** Sol/sag uc sekli satirlari (varsayilan: acik) */
    ends?: boolean;
    /** true: yedi istatistigin hepsi; false: fiyat/yuzde/pip/bar alt kumesi (Trend Angle) */
    fullStats?: boolean;
}

/** Style sekmesi bolumleri. allowExtend=false: Extend bolumu gizlenir (ray/extendedLine). */
export function buildLineStyleSections(
    title: string,
    allowExtend: boolean,
    opts: LineStyleSectionOptions = {}
): SettingsSection[] {
    const ends = opts.ends !== false;
    const fullStats = opts.fullStats !== false;
    const lineRows: SettingsSection['rows'] = [
        colorRow('color', 'Line Color'),
        lineWidthRow('lineWidth'),
        lineStyleRow('lineStyle'),
    ];
    if (ends) {
        lineRows.push(selectRow('leftEnd', 'Left end', endOptions()));
        lineRows.push(selectRow('rightEnd', 'Right end', endOptions()));
    }
    const sections: SettingsSection[] = [{ title, rows: lineRows }];
    if (allowExtend) {
        sections.push({
            title: 'Extend',
            rows: [
                checkboxRow('extendLeft', 'Extend Left'),
                checkboxRow('extendRight', 'Extend Right'),
            ]
        });
    }
    sections.push({
        title: 'Display',
        rows: [
            checkboxRow('showMiddlePoint', 'Middle point'),
            checkboxRow('showPriceLabels', 'Price labels'),
        ]
    });
    const statRows: SettingsSection['rows'] = [
        checkboxRow('showPriceRange', 'Price range'),
        checkboxRow('showPercentPriceRange', 'Percent price range'),
        checkboxRow('showPipsPriceRange', 'Pips price range'),
        checkboxRow('showBarsRange', 'Bars range'),
    ];
    if (fullStats) {
        statRows.push(
            checkboxRow('showDateTimeRange', 'Date/time range'),
            checkboxRow('showDistance', 'Distance'),
            checkboxRow('showAngle', 'Angle'),
        );
    }
    statRows.push(
        selectRow('statsPosition', 'Stats position', positionOptions()),
        checkboxRow('alwaysShowStats', 'Always show stats'),
    );
    sections.push({ title: 'Stats', rows: statRows });
    return sections;
}

// ============================================================================
// Shift: 45 degree constraint
// ============================================================================

/**
 * (x, y) noktasini, sabit (ax, ay) capasi etrafinda en yakin aci adimina (varsayilan 45 derece)
 * kilitler. Ekran uzayinda calisir; uzunluk imlecin kilitli dogrultudaki izdusumudur.
 */
export function snapToAngleStep(
    ax: number, ay: number, x: number, y: number, stepDeg: number = 45
): { x: number; y: number } {
    const dx = x - ax;
    const dy = y - ay;
    if (dx === 0 && dy === 0) return { x, y };
    const step = (stepDeg * Math.PI) / 180;
    const snapped = Math.round(Math.atan2(dy, dx) / step) * step;
    const ux = Math.cos(snapped);
    const uy = Math.sin(snapped);
    const len = dx * ux + dy * uy;
    return { x: ax + len * ux, y: ay + len * uy };
}

/**
 * Shift kilidi uygulanabilen cizgi araclari (baska cizgi araclari buraya eklenebilir).
 * Kanal araclarinda (3 nokta) yalnizca birinci cizgi (P1-P2) kilitlenir; P3 serbest kalir.
 */
const SHIFT_CONSTRAIN_TYPES = new Set<string>(['trendLine', 'ray', 'extendedLine', 'trendAngle', 'arrow', 'infoLine', 'disjointChannel', 'flatTopBottom']);

export function supportsShiftConstraint(type: string): boolean {
    return SHIFT_CONSTRAIN_TYPES.has(type);
}

// ============================================================================
// Stats text
// ============================================================================

export interface LineStatsInput {
    p1: DrawingPoint;
    p2: DrawingPoint;
    /** Ekran (CSS px) koordinatlari */
    x1: number; y1: number; x2: number; y2: number;
    /** Bir barin piksel genisligi */
    barSpacing: number;
    /** Fiyat ondalik basamak sayisi */
    precision: number;
    /** Grafik sembolu (pip buyuklugu icin) */
    symbol?: string;
}

/** Degerlerdeki en fazla ondalik basamak (en cok 8); veri yoksa fallback. */
export function estimatePricePrecision(values: number[], fallback: number = 2): number {
    let max = 0;
    for (const v of values) {
        if (!isFinite(v)) continue;
        const s = v.toFixed(8).replace(/0+$/, '');
        const dot = s.indexOf('.');
        const dec = dot < 0 ? 0 : s.length - dot - 1;
        if (dec > max) max = dec;
    }
    return Math.max(max, fallback);
}

/** Pip = 10 x tick; tick = 10^-precision (JPY: precision 3 -> 0.01). */
export function pipSizeForPrecision(precision: number): number {
    return Math.pow(10, -(precision - 1));
}

/** Host sayfanin pip buyuklugu cozucusu: sembol -> pip (fiyat birimi) ya da null (varsayilan kural). */
export type PipSizeResolver = (symbol: string) => number | null;

let pipSizeResolver: PipSizeResolver | null = null;

/**
 * Pip buyuklugunu host sayfa belirler (ornegin enstruman tablosundan). Cozucu null/gecersiz donerse
 * varsayilan kural kullanilir. null verilirse cozucu kaldirilir.
 */
export function setPipSizeResolver(resolver: PipSizeResolver | null): void {
    pipSizeResolver = resolver;
}

/**
 * Pip buyuklugu: once host cozucusu; yoksa/null ise 6 harfli forex benzeri sembol
 * (borsa oneki atilir) icin JPY karsiligi 0.01, digerleri 0.0001; baska semboller icin
 * 10 x tahmini tick (pipSizeForPrecision).
 */
export function resolvePipSize(symbol: string, precision: number): number {
    if (pipSizeResolver) {
        try {
            const v = pipSizeResolver(symbol);
            if (typeof v === 'number' && isFinite(v) && v > 0) return v;
        } catch { /* host hatasi: varsayilana dus */ }
    }
    const colon = symbol.lastIndexOf(':');
    const bare = colon >= 0 ? symbol.slice(colon + 1) : symbol;
    if (/^[A-Z]{6}$/.test(bare)) return bare.slice(3) === 'JPY' ? 0.01 : 0.0001;
    return pipSizeForPrecision(precision);
}

function signed(value: number, decimals: number): string {
    const abs = Math.abs(value).toFixed(decimals);
    if (Number(abs) === 0) return abs;
    return (value > 0 ? '+' : '-') + abs;
}

/** Sure bicimi: "3d 4h 15m" (gun varsa dakika, gun yoksa saat+dakika; <1dk: saniye). */
export function formatDurationMs(ms: number): string {
    const totalSeconds = Math.floor(Math.abs(ms) / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const minutes = totalMinutes % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (parts.length === 0) return `${totalSeconds % 60}s`;
    return parts.join(' ');
}

/** Ekran uzayinda aci (derece); saga dogru yukseliyorsa pozitif, (-90, 90] araligi. */
export function screenAngleDeg(x1: number, y1: number, x2: number, y2: number): number {
    let dx = x2 - x1;
    let dy = y2 - y1;
    if (dx < 0) { dx = -dx; dy = -dy; }
    return (Math.atan2(-dy, dx) * 180) / Math.PI;
}

/** Etkin istatistiklerden satirlari uretir; bos satirlar atlanir. */
export function computeLineStats(props: LineToolProps, input: LineStatsInput): string[] {
    const lines: string[] = [];
    const { p1, p2, precision } = input;
    const diff = p2.price - p1.price;

    // 1: fiyat araligi (+ yuzde) (+ pip)
    const priceParts: string[] = [];
    const pr = props.showPriceRange ? signed(diff, precision) : '';
    const pct = props.showPercentPriceRange
        ? signed(p1.price !== 0 ? (diff / Math.abs(p1.price)) * 100 : 0, 2) + '%'
        : '';
    if (pr && pct) priceParts.push(`${pr} (${pct})`);
    else if (pr || pct) priceParts.push(pr || pct);
    if (props.showPipsPriceRange) {
        priceParts.push(`${signed(diff / resolvePipSize(input.symbol ?? '', precision), 1)} ${t('pips')}`);
    }
    if (priceParts.length) lines.push(priceParts.join(', '));

    // 2: bar sayisi + sure
    const bars = input.barSpacing > 0
        ? Math.round(Math.abs(input.x2 - input.x1) / input.barSpacing)
        : 0;
    const timeParts: string[] = [];
    if (props.showBarsRange) timeParts.push(`${bars} ${t('bars')}`);
    if (props.showDateTimeRange) timeParts.push(formatDurationMs(p2.time - p1.time));
    if (timeParts.length) lines.push(timeParts.join(', '));

    // 3: mesafe (bar cinsinden) + aci; aci ayri bir parca olarak " · " ile ayrilir
    const geoParts: string[] = [];
    if (props.showDistance) geoParts.push(`${t('Distance:')} ${bars}`);
    if (props.showAngle) {
        geoParts.push(`∠ ${screenAngleDeg(input.x1, input.y1, input.x2, input.y2).toFixed(1)}°`);
    }
    if (geoParts.length) lines.push(geoParts.join(' · '));

    return lines;
}

/**
 * Cizim icin istatistik satirlari. data: ana seri verisi (bar araligi ve hassasiyet icin),
 * timeToPixel: mantiksal zamandan CSS px'e. Bar genisligi son iki barin ekran farkindan bulunur.
 */
export function computeDrawingStats(
    props: LineToolProps,
    points: DrawingPoint[],
    cssPoints: { x: number; y: number }[],
    data: readonly any[],
    timeToPixel: (time: number) => number | null,
    fallbackPrecision: number = 2,
    symbol: string = ''
): string[] {
    if (!hasAnyStats(props) || points.length < 2 || cssPoints.length < 2) return [];

    let barSpacing = 0;
    if (data.length >= 2) {
        const a = timeToPixel(data[data.length - 2].time);
        const b = timeToPixel(data[data.length - 1].time);
        if (a !== null && b !== null) barSpacing = Math.abs(b - a);
    }

    const tail = data.slice(-100).map((d: any) => Number(d.close ?? d.value));
    const precision = estimatePricePrecision(tail, fallbackPrecision);

    return computeLineStats(props, {
        p1: points[0], p2: points[1],
        x1: cssPoints[0].x, y1: cssPoints[0].y, x2: cssPoints[1].x, y2: cssPoints[1].y,
        barSpacing, precision, symbol,
    });
}

// ============================================================================
// Price axis labels
// ============================================================================

export interface AxisLabelSpec { price: number; color: string; }

/** Zaman ekseni etiketi: cizimin zamani ve etiket rengi (zaman ekseni cizer). */
export interface TimeLabelSpec { time: number; color: string; }

/** Bir cizimin fiyat ve zaman ekseninde gostermek istedigi etiketler. */
export interface DrawingAxisLabels { prices: AxisLabelSpec[]; times: TimeLabelSpec[]; }

/** Eksen etiketi veren cizimler bu arayuzu uygular; chart-widget her karede toplar. */
export interface AxisLabelProvider { getAxisLabels(): DrawingAxisLabels; }

export function hasAxisLabels(d: unknown): d is AxisLabelProvider {
    return !!d && typeof (d as any).getAxisLabels === 'function';
}

/**
 * Fiyat <-> piksel donusturucusu isteyen cizimler (log olcekte piksel uzayi geometrisinin fiyat karsiligi icin).
 * chart-widget her karede ana fiyat olcegiyle verir.
 */
export interface PriceScaleConsumer {
    setPriceScale(priceToPixel: (price: number) => number | null, pixelToPrice: (y: number) => number | null): void;
}

export function hasPriceScaleConsumer(d: unknown): d is PriceScaleConsumer {
    return !!d && typeof (d as any).setPriceScale === 'function';
}

/** Tek fiyat etiketi (yatay cizgi / yatay isin): showPrice aciksa ilk noktanin fiyati cizgi renginde. */
export function singlePriceAxisLabels(show: boolean, points: DrawingPoint[], color: string): DrawingAxisLabels {
    const prices = show && points.length > 0 ? [{ price: points[0].price, color }] : [];
    return { prices, times: [] };
}

/** showPriceLabels aciksa iki ucun fiyat etiketi (fiyat ekseni cizer). */
export function lineAxisLabels(props: LineToolProps, points: DrawingPoint[], color: string): AxisLabelSpec[] {
    if (!props.showPriceLabels) return [];
    return points.slice(0, 2).map(p => ({ price: p.price, color }));
}

// ============================================================================
// Canvas helpers (device pixel coordinates)
// ============================================================================

export function drawArrowHead(
    ctx: CanvasRenderingContext2D,
    tip: { x: number; y: number },
    from: { x: number; y: number },
    color: string,
    lineWidth: number,
    dpr: number
): void {
    const dx = tip.x - from.x;
    const dy = tip.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const ux = dx / len;
    const uy = dy / len;
    const headLen = (8 + lineWidth * 2.5) * dpr;
    const half = headLen * 0.42;
    const bx = tip.x - ux * headLen;
    const by = tip.y - uy * headLen;

    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 * dpr;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(bx - uy * half, by + ux * half);
    ctx.lineTo(bx + uy * half, by - ux * half);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

export function drawMiddlePoint(
    ctx: CanvasRenderingContext2D,
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    color: string,
    dpr: number
): void {
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

/** Yuvarlak koseli yari saydam kutu icinde cok satirli istatistik metni. */
const STATS_FONT = 'Arial, "Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", sans-serif';

export function drawStatsLabel(
    ctx: CanvasRenderingContext2D,
    lines: string[],
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    position: StatsPosition,
    color: string,
    dpr: number,
    canvasWidth: number,
    canvasHeight: number
): void {
    if (lines.length === 0) return;

    ctx.save();
    ctx.setLineDash([]);
    const fontPx = 12 * dpr;
    ctx.font = `${fontPx}px ${STATS_FONT}`;
    // Aci simgesi bu yazi tiplerinde yoksa (bos/cok dar glif) "Aci:" yazisina dus
    if (lines.some(l => l.includes('∠')) && ctx.measureText('∠').width < fontPx * 0.3) {
        lines = lines.map(l => l.replace('∠', `${t('Angle')}:`));
    }
    const pad = 6 * dpr;
    const lineH = 16 * dpr;
    const gap = 8 * dpr;
    const textW = Math.max(...lines.map(l => ctx.measureText(l).width));
    const w = textW + pad * 2;
    const h = lines.length * lineH + pad * 2 - (lineH - fontPx);

    const anchor = position === 'left' ? p1
        : position === 'right' ? p2
        : { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    // Cizgiye dik, ekranda yukari bakan birim vektor (dikey cizgide saga)
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    let nx = dy;
    let ny = -dx;
    if (ny > 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }
    if (Math.abs(ny) < 1e-6) { nx = 1; ny = 0; }

    // Kutunun n dogrultusundaki yari kalinligi kadar + bosluk: kutu cizgiyi kapatmaz
    const support = Math.abs(nx) * w / 2 + Math.abs(ny) * h / 2;
    let cx = anchor.x + nx * (support + gap);
    let cy = anchor.y + ny * (support + gap);
    if (position !== 'center') {
        // Sag: p2'nin otesi, sol: p1'in otesi (cizgi yonunun tersi); kutu cizgiyi kesmez
        const sgn = position === 'right' ? 1 : -1;
        const along = Math.abs(dx) * w / 2 + Math.abs(dy) * h / 2 + gap;
        cx += sgn * dx * along;
        cy += sgn * dy * along;
    }

    let bx = cx - w / 2;
    let by = cy - h / 2;
    const margin = 4 * dpr;
    bx = Math.max(margin, Math.min(bx, canvasWidth - w - margin));
    by = Math.max(margin, Math.min(by, canvasHeight - h - margin));

    ctx.fillStyle = 'rgba(19, 23, 34, 0.82)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    const r = 4 * dpr;
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + w, by, bx + w, by + h, r);
    ctx.arcTo(bx + w, by + h, bx, by + h, r);
    ctx.arcTo(bx, by + h, bx, by, r);
    ctx.arcTo(bx, by, bx + w, by, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => {
        ctx.fillText(line, bx + pad, by + pad + (fontPx / 2) + i * lineH);
    });
    ctx.restore();
}

/** Uc sekilleri + orta nokta + istatistik kutusu (cizgi cizildikten sonra cagrilir). */
export function drawLineToolDecorations(
    ctx: CanvasRenderingContext2D,
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    color: string,
    lineWidth: number,
    props: LineToolProps,
    statsLines: string[],
    dpr: number,
    canvasWidth: number,
    canvasHeight: number
): void {
    // Uzatma acik olsa bile ok orijinal uc noktada durur
    if (props.leftEnd === 'arrow') drawArrowHead(ctx, p1, p2, color, lineWidth, dpr);
    if (props.rightEnd === 'arrow') drawArrowHead(ctx, p2, p1, color, lineWidth, dpr);
    if (props.showMiddlePoint) drawMiddlePoint(ctx, p1, p2, color, dpr);
    if (statsLines.length) {
        drawStatsLabel(ctx, statsLines, p1, p2, props.statsPosition, color, dpr, canvasWidth, canvasHeight);
    }
}


// ============================================================================
// Text fields (style.text*) serialization shared by line tools
// ============================================================================

export function textFieldsToJSON(style: DrawingStyle): Partial<SerializedDrawing> {
    return {
        text: style.text,
        textColor: style.textColor,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        textHAlign: style.textHAlign,
        textVAlign: style.textVAlign,
    };
}

/** Kayitta bulunan metin alanlarini uygular; olmayanlar mevcut (varsayilan) degerde kalir. */
export function applyTextFields(style: DrawingStyle, data: SerializedDrawing): void {
    if (data.text) style.text = data.text;
    if (data.textColor) style.textColor = data.textColor;
    if (data.fontSize) style.fontSize = data.fontSize;
    if (data.fontWeight) style.fontWeight = data.fontWeight;
    if (data.fontStyle) style.fontStyle = data.fontStyle;
    if (data.textHAlign) style.textHAlign = data.textHAlign;
    if (data.textVAlign) style.textVAlign = data.textVAlign;
}

/** "solid" | "dashed" | "dotted" <-> lineDash donusumu (tek cizgi araclari icin ortak). */
export function lineStyleFromDash(dash: number[] | undefined): 'solid' | 'dashed' | 'dotted' {
    if (!dash || dash.length === 0) return 'solid';
    return dash[0] >= 4 ? 'dashed' : 'dotted';
}

export function dashFromLineStyle(value: string): number[] | null {
    if (value === 'solid') return [];
    if (value === 'dashed') return [6, 4];
    if (value === 'dotted') return [2, 2];
    return null;
}

// ============================================================================
// Horizontal / vertical line text (device pixel coordinates)
// ============================================================================

type VAlign = 'top' | 'middle' | 'bottom';

function textFont(style: DrawingStyle, defaultSize: number, dpr: number): { font: string; size: number } {
    const size = (style.fontSize || defaultSize) * dpr;
    return { font: `${style.fontStyle || 'normal'} ${style.fontWeight || 'normal'} ${size}px Arial`, size };
}

/**
 * Yatay cizgiyi (x0..x1, y) ve varsa metnini cizer. Metin hizasi style.textHAlign (cizgi parcasi
 * boyunca) ve style.textVAlign (ustte/ortada/altta); ortada ise cizgide metin boslugu birakilir.
 */
export function drawLabeledHorizontalLine(
    ctx: CanvasRenderingContext2D,
    style: DrawingStyle,
    y: number,
    x0: number,
    x1: number,
    dpr: number,
    defaultVAlign: VAlign
): void {
    const text = style.text && style.text.trim() ? style.text : '';
    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineWidth * dpr;
    ctx.setLineDash((style.lineDash ?? []).map(d => d * dpr));

    let gap: [number, number] | null = null;
    let tx = 0;
    let ty = y;
    let baseline: CanvasTextBaseline = 'middle';
    let tw = 0;
    let font = '';
    if (text) {
        font = textFont(style, 12, dpr).font;
        ctx.font = font;
        tw = ctx.measureText(text).width;
        const pad = 8 * dpr;
        const h = style.textHAlign || 'center';
        const v = style.textVAlign || defaultVAlign;
        tx = h === 'left' ? x0 + pad : h === 'right' ? x1 - pad - tw : (x0 + x1) / 2 - tw / 2;
        const off = (style.lineWidth / 2 + 3) * dpr;
        if (v === 'top') { baseline = 'bottom'; ty = y - off; }
        else if (v === 'bottom') { baseline = 'top'; ty = y + off; }
        else { baseline = 'middle'; gap = [tx - 4 * dpr, tx + tw + 4 * dpr]; }
    }

    ctx.beginPath();
    if (gap) {
        // Metnin kenara yapistigi yerde gereksiz kisa kalintilar cizilmez
        const stub = 6 * dpr;
        if (gap[0] - x0 > stub) { ctx.moveTo(x0, y); ctx.lineTo(Math.min(gap[0], x1), y); }
        if (x1 - gap[1] > stub) { ctx.moveTo(Math.max(gap[1], x0), y); ctx.lineTo(x1, y); }
    } else {
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
    }
    ctx.stroke();

    if (text) {
        ctx.setLineDash([]);
        ctx.font = font;
        ctx.fillStyle = style.textColor || style.color;
        ctx.textAlign = 'left';
        ctx.textBaseline = baseline;
        ctx.fillText(text, tx, ty);
    }
    ctx.restore();
}

export type TextOrientation = 'vertical' | 'horizontal';

/**
 * Dikey cizgiyi (x, y0..y1) ve varsa metnini cizer. orientation 'vertical': metin cizgi boyunca
 * (alttan uste okunur); 'horizontal': duz yazi. textHAlign: metnin cizgiye gore solu/ustu/sagi,
 * textVAlign: cizgi boyunca ust/orta/alt.
 */
export function drawLabeledVerticalLine(
    ctx: CanvasRenderingContext2D,
    style: DrawingStyle,
    x: number,
    y0: number,
    y1: number,
    dpr: number,
    orientation: TextOrientation
): void {
    const text = style.text && style.text.trim() ? style.text : '';
    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineWidth * dpr;
    ctx.setLineDash((style.lineDash ?? []).map(d => d * dpr));

    const h = style.textHAlign || 'center';
    const v = style.textVAlign || 'middle';
    const pad = 8 * dpr;
    const off = (style.lineWidth / 2 + 3) * dpr;
    const len = y1 - y0;
    const { font, size } = textFont(style, 14, dpr);
    let gap: [number, number] | null = null;
    let tw = 0;
    if (text) {
        ctx.font = font;
        tw = ctx.measureText(text).width;
    }

    // Metin yerlesimi (ekran uzayinda): [anchorX, anchorY, rotasyon, textAlign, baseline]
    let place: { ax: number; ay: number; rot: number; align: CanvasTextAlign; baseline: CanvasTextBaseline } | null = null;
    if (text && orientation === 'vertical') {
        // Yerel x ekranda yukari, yerel y saga bakar
        const s = v === 'top' ? len - pad : v === 'bottom' ? pad : len / 2;
        const align: CanvasTextAlign = v === 'top' ? 'right' : v === 'bottom' ? 'left' : 'center';
        const baseline: CanvasTextBaseline = h === 'left' ? 'bottom' : h === 'right' ? 'top' : 'middle';
        const ax = h === 'left' ? x - off : h === 'right' ? x + off : x;
        place = { ax, ay: y1 - s, rot: -Math.PI / 2, align, baseline };
        if (h === 'center') {
            const ay = y1 - s;
            const lo = v === 'top' ? ay : v === 'bottom' ? ay - tw : ay - tw / 2;
            gap = [lo - 4 * dpr, lo + tw + 4 * dpr];
        }
    } else if (text) {
        const align: CanvasTextAlign = h === 'left' ? 'right' : h === 'right' ? 'left' : 'center';
        const ax = h === 'left' ? x - off : h === 'right' ? x + off : x;
        const baseline: CanvasTextBaseline = v === 'top' ? 'top' : v === 'bottom' ? 'bottom' : 'middle';
        const ay = v === 'top' ? y0 + pad : v === 'bottom' ? y1 - pad : (y0 + y1) / 2;
        place = { ax, ay, rot: 0, align, baseline };
        if (h === 'center') {
            const lo = v === 'top' ? ay : v === 'bottom' ? ay - size : ay - size / 2;
            gap = [lo - 3 * dpr, lo + size + 3 * dpr];
        }
    }

    ctx.beginPath();
    if (gap) {
        const stub = 6 * dpr;
        if (gap[0] - y0 > stub) { ctx.moveTo(x, y0); ctx.lineTo(x, Math.min(gap[0], y1)); }
        if (y1 - gap[1] > stub) { ctx.moveTo(x, Math.max(gap[1], y0)); ctx.lineTo(x, y1); }
    } else {
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
    }
    ctx.stroke();

    if (place) {
        ctx.setLineDash([]);
        ctx.font = font;
        ctx.fillStyle = style.textColor || style.color;
        ctx.textAlign = place.align;
        ctx.textBaseline = place.baseline;
        ctx.translate(place.ax, place.ay);
        if (place.rot !== 0) ctx.rotate(place.rot);
        ctx.fillText(text, 0, 0);
    }
    ctx.restore();
}
