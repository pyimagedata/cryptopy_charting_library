/**
 * Volume Renderer
 * Renders Anchored VWAP, Fixed Range Volume Profile and Anchored Volume Profile.
 * Cizim css piksel uzayinda yapilir (ctx dpr ile olceklenir); hit-test geometrisi cizime yazilir.
 */

import { AnchoredVwapDrawing, VolumeProfileDrawing } from '../../../drawings/volume-drawings';
import { colorWithTransparency, formatVolume } from '../../../drawings/volume-tools-common';
import { drawControlPoint } from './utils';

type TimeToPixel = (time: number) => number | null;
type PriceToPixel = (price: number) => number | null;

/** Bar indeksi -> x (css px): barlar esit aralikli oldugundan capa ve son bardan dogrusal. */
function makeIndexToX(bars: ReadonlyArray<{ time: number }>, timeToPixel: TimeToPixel, refIndex: number): ((i: number) => number) | null {
    const xRef = timeToPixel(bars[refIndex].time);
    if (xRef === null) return null;
    const n = bars.length;
    let spacing = 0;
    if (n >= 2) {
        const a = timeToPixel(bars[n - 2].time);
        const b = timeToPixel(bars[n - 1].time);
        if (a !== null && b !== null) spacing = b - a;
    }
    return (i: number) => xRef + (i - refIndex) * spacing;
}

function drawHandles(ctx: CanvasRenderingContext2D, handles: { x: number; y: number }[], color: string): void {
    for (const h of handles) drawControlPoint(ctx, h.x, h.y, 5, '#ffffff', color, 2);
}

export function drawAnchoredVwap(
    ctx: CanvasRenderingContext2D,
    drawing: AnchoredVwapDrawing,
    timeToPixel: TimeToPixel,
    priceToPixel: PriceToPixel,
    paneWidth: number,
    paneHeight: number,
    dpr: number,
    showHandles: boolean
): void {
    const comp = drawing.getComputed();
    const bars = drawing.bars;
    if (!comp) { drawing.clearGeometry(); return; }
    const indexToX = makeIndexToX(bars, timeToPixel, comp.anchorIndex);
    if (!indexToX) { drawing.clearGeometry(); return; }

    const { vwap, stdev } = comp.result;
    const start = comp.anchorIndex;
    const p = drawing.props;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.beginPath();
    ctx.rect(0, 0, paneWidth, paneHeight);
    ctx.clip();

    /** Seri (offset: sapma carpani) -> ekran noktalari (gecersiz fiyatlar atlanir) */
    const series = (mult: number): { x: number; y: number }[] => {
        const pts: { x: number; y: number }[] = [];
        for (let k = 0; k < vwap.length; k++) {
            if (!Number.isFinite(vwap[k])) continue;
            const y = priceToPixel(vwap[k] + mult * stdev[k]);
            if (y === null) continue;
            pts.push({ x: indexToX(start + k), y });
        }
        return pts;
    };
    const trace = (pts: { x: number; y: number }[]) => {
        ctx.beginPath();
        pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    };

    const lines: { x: number; y: number }[][] = [];
    const bands = drawing.enabledBands();

    // Dolgu (bantlarin ustte / altta cizgileri arasi)
    if (p.fillBands) {
        for (const band of bands) {
            const up = series(band.mult);
            const lo = series(-band.mult).reverse();
            if (up.length < 2) continue;
            trace([...up, ...lo]);
            ctx.closePath();
            ctx.fillStyle = colorWithTransparency(band.color, p.fillTransparency);
            ctx.fill();
        }
    }

    const vw = Math.max(1, drawing.style.lineWidth);
    for (const band of bands) {
        for (const sign of [1, -1]) {
            const pts = series(sign * band.mult);
            if (pts.length < 2) continue;
            trace(pts);
            ctx.strokeStyle = band.color;
            ctx.lineWidth = p.bandLineWidth;
            ctx.stroke();
            lines.push(pts);
        }
    }

    const main = series(0);
    if (main.length >= 1) {
        trace(main);
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = vw;
        ctx.stroke();
        lines.push(main);
    }

    const visible = (pts: { x: number; y: number }[]) => pts.filter((pt) => pt.x >= -20 && pt.x <= paneWidth + 20);
    drawing.setHitGeometry([], lines.map(visible));
    drawing.setHandles(main.length > 0 ? [main[0]] : []);
    if (showHandles && main.length > 0) drawHandles(ctx, [main[0]], drawing.style.color);

    ctx.restore();
}

export function drawVolumeProfile(
    ctx: CanvasRenderingContext2D,
    drawing: VolumeProfileDrawing,
    timeToPixel: TimeToPixel,
    priceToPixel: PriceToPixel,
    paneWidth: number,
    paneHeight: number,
    dpr: number,
    showHandles: boolean
): void {
    const comp = drawing.getComputed();
    const bars = drawing.bars;
    if (!comp) { drawing.clearGeometry(); return; }

    const xl = timeToPixel(bars[comp.startIndex].time);
    const xr = timeToPixel(bars[comp.endIndex].time);
    if (xl === null || xr === null) { drawing.clearGeometry(); return; }

    const { profile } = comp;
    const p = drawing.props;
    const left = Math.min(xl, xr);
    const right = Math.max(xl, xr);
    const maxWidth = Math.max(24, (right - left) * p.widthPercent / 100);
    const fromLeft = p.placement !== 'right';
    const baseX = fromLeft ? left : right;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.beginPath();
    ctx.rect(0, 0, paneWidth, paneHeight);
    ctx.clip();

    const rects: { x: number; y: number; w: number; h: number }[] = [];
    const minVa = Math.min(profile.valIndex, profile.vahIndex);
    const maxVa = Math.max(profile.valIndex, profile.vahIndex);

    for (let i = 0; i < profile.bins.length; i++) {
        const bin = profile.bins[i];
        if (bin.volume <= 0) continue;
        const yA = priceToPixel(bin.high);
        const yB = priceToPixel(bin.low);
        if (yA === null || yB === null) continue;
        const top = Math.min(yA, yB);
        const height = Math.max(1, Math.abs(yB - yA) - (Math.abs(yB - yA) > 4 ? 1 : 0));
        const inVa = i >= minVa && i <= maxVa;
        const upW = (bin.upVolume / profile.maxVolume) * maxWidth;
        const downW = (bin.downVolume / profile.maxVolume) * maxWidth;

        const upColor = inVa ? colorWithTransparency(p.vaUpColor, p.vaUpTransparency) : colorWithTransparency(p.upColor, p.upTransparency);
        const downColor = inVa ? colorWithTransparency(p.vaDownColor, p.vaDownTransparency) : colorWithTransparency(p.downColor, p.downTransparency);

        ctx.fillStyle = upColor;
        ctx.fillRect(fromLeft ? baseX : baseX - upW, top, upW, height);
        ctx.fillStyle = downColor;
        ctx.fillRect(fromLeft ? baseX + upW : baseX - upW - downW, top, downW, height);

        const total = upW + downW;
        rects.push({ x: fromLeft ? baseX : baseX - total, y: top, w: total, h: height });
    }

    const lines: { x: number; y: number }[][] = [];
    const level = (price: number, color: string, dash: number[]) => {
        const y = priceToPixel(price);
        if (y === null) return;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, drawing.style.lineWidth);
        ctx.setLineDash(dash);
        ctx.stroke();
        ctx.setLineDash([]);
        lines.push([{ x: left, y }, { x: right, y }]);
    };
    if (p.showPoc) {
        const poc = profile.bins[profile.pocIndex];
        level((poc.low + poc.high) / 2, p.pocColor, []);
    }
    if (p.showVaLines) {
        level(profile.bins[profile.vahIndex].high, p.vaLineColor, [5, 4]);
        level(profile.bins[profile.valIndex].low, p.vaLineColor, [5, 4]);
    }

    const yTop = priceToPixel(profile.highest);
    const yBottom = priceToPixel(profile.lowest);

    if (p.showTotals && yTop !== null) {
        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = drawing.style.color;
        ctx.fillText(`Vol ${formatVolume(profile.totalVolume)}`, left + 2, yTop - 3);
    }

    if (showHandles && yTop !== null && yBottom !== null) {
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(left, Math.min(yTop, yBottom), Math.max(1, right - left), Math.abs(yBottom - yTop));
        ctx.setLineDash([]);
    }

    // Tutamaclar: cizim noktalari (secimde gorunur)
    const handles: { x: number; y: number }[] = [];
    for (const pt of drawing.points) {
        const x = timeToPixel(pt.time);
        const y = priceToPixel(pt.price);
        if (x !== null && y !== null) handles.push({ x, y });
    }
    drawing.setHandles(handles);
    drawing.setHitGeometry(rects, lines);
    if (showHandles) drawHandles(ctx, handles, drawing.style.color);

    ctx.restore();
}
