/**
 * Pitchfork Renderer
 * Renders Pitchfork, Schiff, Modified Schiff, Inside Pitchfork and Pitchfan.
 * Cizim css piksel uzayinda yapilir (ctx dpr ile olceklenir); geometri drawing.layout() ile hesaplanir ve hit-test icin onbellege yazilir.
 */

import { PitchToolBase } from '../../../drawings/pitchfork-drawing';
import { drawControlPoint } from './utils';

const HANDLE_COLOR = 'rgba(120, 123, 134, 0.9)';

export function drawPitchTool(
    ctx: CanvasRenderingContext2D,
    drawing: PitchToolBase,
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

    // Olusturma sirasinda (2 nokta) P1-P2 dogrusu
    if (pixelPoints.length === 2) {
        ctx.beginPath();
        ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);
        ctx.lineTo(pixelPoints[1].x, pixelPoints[1].y);
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = drawing.style.lineWidth;
        ctx.setLineDash(drawing.style.lineDash ?? []);
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

    // Kesikli tutamac cizgileri (P2-P3, P1-M)
    if (pixelPoints.length >= 3) {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = HANDLE_COLOR;
        ctx.lineWidth = 1;
        for (const [a, b] of geom.handles) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
    }
    ctx.setLineDash([]);

    if (showHandles) {
        for (const p of pixelPoints) drawControlPoint(ctx, p.x, p.y, 5, '#ffffff', drawing.style.color, 2);
    }

    ctx.restore();
}
