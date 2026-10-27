/**
 * Renders Cyclic Lines, Time Cycles and Sine Line (CycleToolBase).
 * Cizim css piksel uzayinda yapilir (ctx dpr ile olceklenir); geometri drawing.layout() ile hesaplanir.
 */

import { CycleToolBase } from '../../../drawings/cycle-drawing';
import { drawControlPoint } from './utils';

export function drawCycleTool(
    ctx: CanvasRenderingContext2D,
    drawing: CycleToolBase,
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

    const fill = drawing.fillCss();
    if (fill && drawing.type === 'timeCycles') {
        ctx.fillStyle = fill;
        for (const arc of geom.fills) {
            if (arc.length < 2) continue;
            ctx.beginPath();
            arc.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
            ctx.closePath(); // taban: yayin iki ucu arasi duz cizgi (ayni y)
            ctx.fill();
        }
    }

    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = drawing.style.lineWidth;
    ctx.setLineDash(drawing.style.lineDash ?? []);
    ctx.lineJoin = 'round';
    for (const poly of geom.lines) {
        if (poly.length < 2) continue;
        ctx.beginPath();
        poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
    }
    ctx.setLineDash([]);

    if (showHandles) {
        for (const p of pixelPoints) drawControlPoint(ctx, p.x, p.y, 5, '#ffffff', drawing.style.color, 2);
    }
    ctx.restore();
}
