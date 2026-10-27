/**
 * Channel Lines Renderer
 * Renders Disjoint Channel and Flat Top/Bottom (iki cizgi + aralarinda dolgu).
 * Cizim css piksel uzayinda yapilir (ctx dpr ile olceklenir); geometri drawing.layout() ile hesaplanir ve hit-test icin onbellege yazilir.
 */

import { ChannelLinesTool } from '../../../drawings/channel-lines-drawing';
import { shapeFillCss } from '../../../drawings/shape-common';
import { drawArrowHead, drawMiddlePoint, drawStatsLabel } from '../../../drawings/line-tool-common';
import { drawControlPoint } from './utils';

export function drawChannelLinesTool(
    ctx: CanvasRenderingContext2D,
    drawing: ChannelLinesTool,
    pixelPoints: { x: number; y: number }[],
    paneWidth: number,
    paneHeight: number,
    dpr: number,
    showHandles: boolean,
    statsLines: string[] = []
): void {
    const geom = drawing.layout(pixelPoints, paneWidth);
    if (!geom) return;
    const style = drawing.style;
    const lp = drawing.lineProps;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.beginPath();
    ctx.rect(0, 0, paneWidth, paneHeight);
    ctx.clip();

    // Dolgu
    const fill = shapeFillCss(style);
    if (fill && geom.fill.length >= 4) {
        ctx.beginPath();
        geom.fill.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
    }

    // Cizgiler
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineWidth;
    ctx.setLineDash(style.lineDash ?? []);
    for (const s of [geom.lineA, geom.lineB]) {
        if (!s) continue;
        ctx.beginPath();
        ctx.moveTo(s.a.x, s.a.y);
        ctx.lineTo(s.b.x, s.b.y);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // Uc sekilleri / orta nokta: orijinal uclarda (uzatma acik olsa bile)
    for (const s of [geom.baseA, geom.baseB]) {
        if (!s) continue;
        if (lp.leftEnd === 'arrow') drawArrowHead(ctx, s.a, s.b, style.color, style.lineWidth, 1);
        if (lp.rightEnd === 'arrow') drawArrowHead(ctx, s.b, s.a, style.color, style.lineWidth, 1);
        if (lp.showMiddlePoint) drawMiddlePoint(ctx, s.a, s.b, style.color, 1);
    }

    // Etiket: A cizgisi uzerinde
    const text = style.text && style.text.trim() ? style.text : '';
    if (drawing.labelVisible && text) {
        const [l, r] = geom.baseA.a.x <= geom.baseA.b.x ? [geom.baseA.a, geom.baseA.b] : [geom.baseA.b, geom.baseA.a];
        const h = style.textHAlign || 'left';
        const v = style.textVAlign || 'bottom';
        const pad = 8;
        const t = h === 'left' ? 0 : h === 'right' ? 1 : 0.5;
        const x = l.x + (r.x - l.x) * t + (h === 'left' ? pad : h === 'right' ? -pad : 0);
        const slope = Math.abs(r.x - l.x) < 1e-9 ? 0 : (r.y - l.y) / (r.x - l.x);
        const yLine = l.y + slope * (x - l.x);
        const off = style.lineWidth / 2 + 3;
        ctx.font = `${style.fontStyle || 'normal'} ${style.fontWeight || 'normal'} ${style.fontSize || 14}px Arial`;
        ctx.fillStyle = style.textColor || style.color;
        ctx.textAlign = h;
        ctx.textBaseline = v === 'top' ? 'bottom' : v === 'bottom' ? 'top' : 'middle';
        ctx.fillText(text, x, v === 'top' ? yLine - off : v === 'bottom' ? yLine + off : yLine);
    }

    if (statsLines.length) {
        drawStatsLabel(ctx, statsLines, geom.baseA.a, geom.baseA.b, lp.statsPosition, style.color, 1, paneWidth, paneHeight);
    }

    if (showHandles) {
        for (const p of pixelPoints) drawControlPoint(ctx, p.x, p.y, 5, '#ffffff', style.color, 2);
    }

    ctx.restore();
}
