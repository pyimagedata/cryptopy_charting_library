/**
 * Gann Renderer
 * Renders Gann Box, Gann Fan, Gann Square Fixed and Gann Square.
 * Cizim css piksel uzayinda yapilir (ctx dpr ile olceklenir); geometri drawing.layout() ile hesaplanir ve hit-test icin onbellege yazilir.
 */

import { GannToolBase } from '../../../drawings/gann-drawing';
import { drawControlPoint } from './utils';

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, sans-serif';

export function drawGannTool(
    ctx: CanvasRenderingContext2D,
    drawing: GannToolBase,
    pixelPoints: { x: number; y: number }[],
    paneWidth: number,
    paneHeight: number,
    dpr: number,
    showHandles: boolean,
    barSpacing?: number,
    fallbackPricePerPx?: number
): void {
    const geom = drawing.layout(pixelPoints, paneWidth, paneHeight, barSpacing, fallbackPricePerPx);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.beginPath();
    ctx.rect(0, 0, paneWidth, paneHeight);
    ctx.clip();

    for (const f of geom.fills) {
        ctx.beginPath();
        f.poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.fillStyle = f.color;
        ctx.fill();
    }

    for (const l of geom.lines) {
        ctx.beginPath();
        ctx.moveTo(l.a.x, l.a.y);
        ctx.lineTo(l.b.x, l.b.y);
        ctx.strokeStyle = l.color;
        ctx.lineWidth = l.width;
        ctx.setLineDash(l.dash);
        ctx.stroke();
    }
    for (const pl of geom.polylines) {
        ctx.beginPath();
        pl.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.strokeStyle = pl.color;
        ctx.lineWidth = pl.width;
        ctx.setLineDash(pl.dash);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const lb of geom.labels) {
        ctx.font = `${lb.size}px ${FONT_FAMILY}`;
        ctx.fillStyle = lb.color;
        ctx.textAlign = lb.align;
        ctx.textBaseline = lb.baseline;
        ctx.fillText(lb.text, lb.x, lb.y);
    }

    if (showHandles) {
        for (const p of pixelPoints) drawControlPoint(ctx, p.x, p.y, 5, '#ffffff', drawing.style.color, 2);
    }

    ctx.restore();
}
