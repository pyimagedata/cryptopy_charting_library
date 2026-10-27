/**
 * Position Renderer
 * Renders Long and Short Position drawings (TradingView style): profit/stop zones,
 * entry line, TP / centre / SL info blocks and control points.
 */

import { LongPositionDrawing } from '../../../drawings/long-position-drawing';
import { ShortPositionDrawing } from '../../../drawings/short-position-drawing';
import { PositionDrawingBase, buildPositionBlocks, pickLastClose } from '../../../drawings/position-common';
import { estimatePricePrecision } from '../../../drawings/line-tool-common';

/** Renderer'in hesaplar icin ihtiyac duydugu grafik baglami */
export interface PositionRenderContext {
    symbol: string;
    /** Ana seri barlari (son kapanis ve fiyat hassasiyeti icin) */
    data: readonly any[];
    /** Fare bu cizimin ustunde mi (TP/SL bloklari icin) */
    hovered: boolean;
}

const NO_CONTEXT: PositionRenderContext = { symbol: '', data: [], hovered: false };

/**
 * Draw a Long Position projection
 */
export function drawLongPosition(
    ctx: CanvasRenderingContext2D,
    drawing: LongPositionDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    showControlPoints: boolean,
    priceToPixel: (price: number) => number | null,
    rc: PositionRenderContext = NO_CONTEXT
): void {
    renderPosition(ctx, drawing, pixelPoints, dpr, showControlPoints, priceToPixel, true, rc);
}

/**
 * Draw a Short Position projection
 */
export function drawShortPosition(
    ctx: CanvasRenderingContext2D,
    drawing: ShortPositionDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    showControlPoints: boolean,
    priceToPixel: (price: number) => number | null,
    rc: PositionRenderContext = NO_CONTEXT
): void {
    renderPosition(ctx, drawing, pixelPoints, dpr, showControlPoints, priceToPixel, false, rc);
}

function rgbaOf(hex: string, transparencyPct: number): string {
    const m = /^#([a-f\d]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, 1 - transparencyPct / 100))})`;
}

/** Cok satirli etiket kutusu; above ise kutunun alt kenari anchorY'de, degilse ust kenari. */
function drawBlock(
    ctx: CanvasRenderingContext2D, lines: string[], centerX: number, anchorY: number, above: boolean,
    bg: string, fg: string, fontPx: number, dpr: number
): void {
    if (lines.length === 0) return;
    ctx.font = `${fontPx}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const padX = 6 * dpr;
    const padY = 4 * dpr;
    const lineH = fontPx * 1.35;
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + padX * 2;
    const h = lines.length * lineH + padY * 2 - (lineH - fontPx);
    const top = above ? anchorY - h : anchorY;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(centerX - w / 2, top, w, h, 4 * dpr);
    ctx.fill();
    ctx.fillStyle = fg;
    lines.forEach((l, i) => ctx.fillText(l, centerX, top + padY + fontPx / 2 + i * lineH));
}

/**
 * Common rendering logic for Long and Short positions
 */
function renderPosition(
    ctx: CanvasRenderingContext2D,
    drawing: PositionDrawingBase,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    showControlPoints: boolean,
    priceToPixel: (price: number) => number | null,
    isLong: boolean,
    rc: PositionRenderContext
): void {
    if (pixelPoints.length < 2) return;

    const left = Math.min(pixelPoints[0].x, pixelPoints[1].x);
    const right = Math.max(pixelPoints[0].x, pixelPoints[1].x);
    const width = right - left;
    if (width < 5) return; // Too small to draw

    const p = drawing.props;
    const entryPrice = drawing.getEntryPrice();
    const targetPrice = drawing.getTargetPrice();
    const stopPrice = drawing.getStopPrice();

    const entryYRaw = priceToPixel(entryPrice);
    const targetYRaw = priceToPixel(targetPrice);
    const stopYRaw = priceToPixel(stopPrice);
    if (entryYRaw === null || targetYRaw === null || stopYRaw === null) return;

    const entryY = entryYRaw * dpr;
    const targetY = targetYRaw * dpr;
    const stopY = stopYRaw * dpr;

    // Cache the zone Y positions for hit testing
    drawing.setCachedZoneY(targetYRaw, stopYRaw);

    ctx.save();
    const centerX = (left + right) / 2;

    // Zones
    ctx.fillStyle = rgbaOf(p.profitBackground, p.profitBackgroundTransparency);
    ctx.fillRect(left, Math.min(entryY, targetY), width, Math.abs(entryY - targetY));
    ctx.fillStyle = rgbaOf(p.stopBackground, p.stopBackgroundTransparency);
    ctx.fillRect(left, Math.min(entryY, stopY), width, Math.abs(stopY - entryY));

    // Target / stop edge lines in zone colours, entry line in line colour
    const lw = Math.max(1, p.linewidth) * dpr;
    const hline = (y: number, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
    };
    hline(targetY, p.profitBackground);
    hline(stopY, p.stopBackground);
    hline(entryY, p.linecolor);

    // Stats
    const data = rc.data ?? [];
    const precision = estimatePricePrecision(data.slice(-100).map((d: any) => Number(d.close ?? d.value)), 2);
    const calc = drawing.calc(pickLastClose(data, drawing.getEntryTime()), { symbol: rc.symbol, precision });
    const blocks = buildPositionBlocks(p, calc, { pricePrecision: precision });

    const fontPx = p.fontsize * (p.compact ? 0.85 : 1) * dpr;
    const gap = 4 * dpr;
    const showSideBlocks = p.alwaysShowStats || showControlPoints || drawing.state === 'selected' || rc.hovered;

    if (showSideBlocks) {
        // Target block outside the target edge, stop block outside the stop edge
        drawBlock(ctx, blocks.tp, centerX, isLong ? targetY - gap : targetY + gap, isLong,
            p.profitBackground, p.textcolor, fontPx, dpr);
        drawBlock(ctx, blocks.sl, centerX, isLong ? stopY + gap : stopY - gap, !isLong,
            p.stopBackground, p.textcolor, fontPx, dpr);
    }
    // Centre block: always shown, on the profit side of the entry line
    drawBlock(ctx, blocks.center, centerX, isLong ? entryY - gap / 2 : entryY + gap / 2, isLong,
        p.linecolor, p.textcolor, fontPx, dpr);

    // Control Points (when selected)
    if (showControlPoints) {
        const cpRadius = 5 * dpr;
        ctx.lineWidth = 2 * dpr;
        const box = (x: number, y: number, fill: string, stroke: string) => {
            ctx.fillStyle = fill;
            ctx.strokeStyle = stroke;
            ctx.beginPath();
            ctx.rect(x - cpRadius, y - cpRadius, cpRadius * 2, cpRadius * 2);
            ctx.fill();
            ctx.stroke();
        };
        box(left, entryY, '#ffffff', '#2962ff');      // index 0
        box(right, entryY, '#ffffff', '#2962ff');     // index 1
        box(centerX, targetY, p.profitBackground, '#ffffff'); // index 2
        box(centerX, stopY, p.stopBackground, '#ffffff');     // index 3
    }

    ctx.restore();
}
