/**
 * Fib Time Renderer
 * Renders Fib Time Zone, Trend-Based Fib Time and Fib Speed Resistance Fan.
 * Cizim css piksel uzayinda yapilir (ctx dpr ile olceklenir); geometri drawing.layout() ile hesaplanir ve hit-test icin onbellege yazilir.
 */

import { FibTimeToolBase } from '../../../drawings/fib-time-drawing';
import { drawControlPoint } from './utils';

const FONT = '12px -apple-system, BlinkMacSystemFont, sans-serif';

export function drawFibTimeTool(
    ctx: CanvasRenderingContext2D,
    drawing: FibTimeToolBase,
    pixelPoints: { x: number; y: number }[],
    paneWidth: number,
    paneHeight: number,
    dpr: number,
    showHandles: boolean
): void {
    const geom = drawing.layout(pixelPoints, paneWidth, paneHeight);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.beginPath();
    ctx.rect(0, 0, paneWidth, paneHeight);
    ctx.clip();

    // Dolgu (cizgilerin altinda)
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
    ctx.setLineDash([]);

    ctx.font = FONT;
    for (const lb of geom.labels) {
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
