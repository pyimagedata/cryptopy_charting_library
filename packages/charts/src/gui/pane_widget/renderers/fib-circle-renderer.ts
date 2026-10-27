/**
 * Fib Circle Renderer
 * Renders Fib Speed Resistance Arcs, Fib Circles, Fib Spiral and Fib Wedge.
 * Cizim css piksel uzayinda yapilir (ctx dpr ile olceklenir); geometri drawing.layout() ile hesaplanir ve hit-test icin onbellege yazilir.
 */

import { FibCircleToolBase, FibCircleGeometry, circleMeetsRect, ringMeetsRect } from '../../../drawings/fib-circle-drawing';
import { drawControlPoint } from './utils';

const FONT = '12px -apple-system, BlinkMacSystemFont, sans-serif';

export function drawFibCircleTool(
    ctx: CanvasRenderingContext2D,
    drawing: FibCircleToolBase,
    pixelPoints: { x: number; y: number }[],
    paneWidth: number,
    paneHeight: number,
    dpr: number,
    showHandles: boolean
): void {
    drawFibCircleGeometry(ctx, drawing.layout(pixelPoints, paneWidth, paneHeight), pixelPoints, paneWidth, paneHeight, dpr, showHandles, drawing.style.color);
}

/** Hazir dairesel geometriyi cizer (Projeksiyon da kullanir). */
export function drawFibCircleGeometry(
    ctx: CanvasRenderingContext2D,
    geom: FibCircleGeometry,
    pixelPoints: { x: number; y: number }[],
    paneWidth: number,
    paneHeight: number,
    dpr: number,
    showHandles: boolean,
    handleColor: string
): void {
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.beginPath();
    ctx.rect(0, 0, paneWidth, paneHeight);
    ctx.clip();

    // Dolgu (cizgilerin altinda)
    for (const f of geom.fills) {
        if (!ringMeetsRect(f.cx, f.cy, f.r0, f.r1, paneWidth, paneHeight)) continue;
        ctx.beginPath();
        if (f.full) {
            ctx.arc(f.cx, f.cy, f.r1, 0, Math.PI * 2);
            ctx.moveTo(f.cx + f.r0, f.cy);
            ctx.arc(f.cx, f.cy, f.r0, 0, Math.PI * 2, true);
        } else {
            ctx.arc(f.cx, f.cy, f.r1, f.a0, f.a1, f.ccw);
            ctx.arc(f.cx, f.cy, f.r0, f.a1, f.a0, !f.ccw);
        }
        ctx.closePath();
        ctx.fillStyle = f.color;
        ctx.fill();
    }

    for (const a of geom.arcs) {
        if (!circleMeetsRect(a.cx, a.cy, a.r, paneWidth, paneHeight, a.width)) continue;
        ctx.beginPath();
        if (a.full) ctx.arc(a.cx, a.cy, a.r, 0, Math.PI * 2);
        else ctx.arc(a.cx, a.cy, a.r, a.a0, a.a1, a.ccw);
        ctx.strokeStyle = a.color;
        ctx.lineWidth = a.width;
        ctx.setLineDash(a.dash);
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

    for (const l of geom.lines) {
        ctx.beginPath();
        ctx.moveTo(l.a.x, l.a.y);
        ctx.lineTo(l.b.x, l.b.y);
        ctx.strokeStyle = l.color;
        ctx.lineWidth = l.width;
        ctx.setLineDash(l.dash);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.font = FONT;
    for (const lb of geom.labels) {
        ctx.fillStyle = lb.color;
        ctx.textAlign = lb.align;
        ctx.textBaseline = lb.baseline;
        ctx.fillText(lb.text, lb.x, lb.y);
    }

    if (showHandles) {
        for (const p of pixelPoints) drawControlPoint(ctx, p.x, p.y, 5, '#ffffff', handleColor, 2);
    }

    ctx.restore();
}
