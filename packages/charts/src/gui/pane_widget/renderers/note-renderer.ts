/**
 * Renders Note, Price Note, Pin, Signpost, Comment and Table (note-drawings.ts).
 * Cizim css piksel uzayinda yapilir (ctx dpr ile olceklenir); geometri drawing.layout() ile hesaplanir.
 */

import {
    NoteToolDrawing,
    NoteDrawing,
    PriceNoteDrawing,
    PinDrawing,
    SignpostDrawing,
    CommentDrawing,
    TableDrawing,
    Rect,
} from '../../../drawings/note-drawings';
import { cssFont, textBoxBackgroundCss } from '../../../drawings/text-common';
import { parseColor } from '../../../drawings/shape-common';
import { drawControlPoint } from './utils';

function isDrawable(c: string): boolean {
    return !!c && c !== 'transparent' && parseColor(c) !== null;
}

function roundRectPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number): void {
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') (ctx as any).roundRect(r.x, r.y, r.width, r.height, radius);
    else ctx.rect(r.x, r.y, r.width, r.height);
}

function dashedBox(ctx: CanvasRenderingContext2D, r: Rect, color: string): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x - 2, r.y - 2, r.width + 4, r.height + 4);
    ctx.restore();
}

function fillLines(ctx: CanvasRenderingContext2D, lines: string[], lineH: number, x: number, top: number, align: CanvasTextAlign): void {
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, x, top + lineH / 2 + i * lineH));
}

export function drawNoteTool(
    ctx: CanvasRenderingContext2D,
    drawing: NoteToolDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    selected: boolean,
): void {
    if (pixelPoints.length < 1) return;
    const pts = pixelPoints.map(p => ({ x: p.x / dpr, y: p.y / dpr }));
    const measure = (s: string, font: string) => {
        ctx.save();
        ctx.font = font;
        const w = ctx.measureText(s).width;
        ctx.restore();
        return w;
    };
    (drawing as any).layout(pts, measure);

    ctx.save();
    ctx.scale(dpr, dpr);
    switch (drawing.type) {
        case 'note': drawNote(ctx, drawing as NoteDrawing, selected); break;
        case 'priceNote': drawPriceNote(ctx, drawing as PriceNoteDrawing, selected); break;
        case 'pin': drawPin(ctx, drawing as PinDrawing, selected); break;
        case 'signpost': drawSignpost(ctx, drawing as SignpostDrawing, selected); break;
        case 'comment': drawComment(ctx, drawing as CommentDrawing, selected); break;
        case 'table': drawTable(ctx, drawing as TableDrawing, selected); break;
    }
    ctx.restore();
}

function drawNote(ctx: CanvasRenderingContext2D, d: NoteDrawing, selected: boolean): void {
    const g = d.geo;
    if (!g) return;
    const b = d.box;
    // Capadan kutuya ince cizgi
    ctx.strokeStyle = isDrawable(b.borderColor) ? b.borderColor : '#464646';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g.marker.x, g.marker.y);
    ctx.lineTo(g.lineTo.x, g.lineTo.y);
    ctx.stroke();
    // Isaret noktasi
    ctx.fillStyle = d.markerColor;
    ctx.beginPath();
    ctx.arc(g.marker.x, g.marker.y, 5, 0, Math.PI * 2);
    ctx.fill();

    if (!d.editing) {
        const drawBg = b.bgVisible && b.bgOpacity > 0;
        const drawBorder = b.borderVisible && isDrawable(b.borderColor) && b.borderWidth > 0;
        if (drawBg || drawBorder) {
            roundRectPath(ctx, g.box, 4);
            if (drawBg) { ctx.fillStyle = textBoxBackgroundCss(b); ctx.fill(); }
            if (drawBorder) { ctx.strokeStyle = b.borderColor; ctx.lineWidth = b.borderWidth; ctx.stroke(); }
        }
        ctx.font = cssFont(b.fontSize, b.bold, b.italic);
        ctx.fillStyle = d.style.color;
        fillLines(ctx, g.lines, g.lineH, g.box.x + g.padH, g.box.y + g.padV, 'left');
    }
    if (selected) {
        dashedBox(ctx, g.box, d.markerColor);
        drawControlPoint(ctx, g.marker.x, g.marker.y, 5, '#ffffff', d.markerColor, 2);
    }
}

function drawPriceNote(ctx: CanvasRenderingContext2D, d: PriceNoteDrawing, selected: boolean): void {
    const g = d.geo;
    if (!g) return;
    const lineColor = d.style.color;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = d.style.lineWidth;
    ctx.setLineDash(d.style.lineDash ?? []);
    ctx.beginPath();
    ctx.moveTo(g.from.x, g.from.y);
    ctx.lineTo(g.to.x, g.to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    // P1 ucu
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.arc(g.from.x, g.from.y, 3, 0, Math.PI * 2);
    ctx.fill();

    if (!d.editing) {
        const b = d.box;
        ctx.font = cssFont(b.fontSize, b.bold, b.italic);
        ctx.fillStyle = d.style.textColor || lineColor;
        const r = g.textRect;
        const align = d.horzLabelsAlign;
        const x = align === 'left' ? r.x + g.padH : align === 'right' ? r.x + r.width - g.padH : r.x + r.width / 2;
        fillLines(ctx, g.lines, g.lineH, x, r.y + g.padV, align);
    }
    if (selected) {
        for (const p of [g.from, g.to]) drawControlPoint(ctx, p.x, p.y, 5, '#ffffff', lineColor, 2);
    }
}

function drawPin(ctx: CanvasRenderingContext2D, d: PinDrawing, selected: boolean): void {
    const g = d.geo;
    if (!g) return;
    const a = g.anchor, c = g.headCenter, R = g.headRadius;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.bezierCurveTo(a.x - 4, a.y - 8, c.x - R, c.y + 8, c.x - R, c.y);
    ctx.arc(c.x, c.y, R, Math.PI, 0, false);
    ctx.bezierCurveTo(c.x + R, c.y + 8, a.x + 4, a.y - 8, a.x, a.y);
    ctx.closePath();
    ctx.fillStyle = d.style.color;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    if (g.textRect) {
        ctx.font = cssFont(d.fontSize, true, false);
        ctx.fillStyle = d.style.textColor || d.style.color;
        fillLines(ctx, g.lines, g.lineH, g.textRect.x + g.textRect.width / 2, g.textRect.y + g.padV, 'center');
    }
    if (selected) drawControlPoint(ctx, a.x, a.y, 5, '#ffffff', d.style.color, 2);
}

function drawSignpost(ctx: CanvasRenderingContext2D, d: SignpostDrawing, selected: boolean): void {
    const g = d.geo;
    if (!g) return;
    const color = d.style.color;
    ctx.strokeStyle = color;
    ctx.lineWidth = d.style.lineWidth;
    ctx.beginPath();
    ctx.moveTo(g.post[0].x, g.post[0].y);
    ctx.lineTo(g.post[1].x, g.post[1].y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(g.post[0].x, g.post[0].y, 3, 0, Math.PI * 2);
    ctx.fill();

    if (!d.editing) {
        roundRectPath(ctx, g.plate, 8);
        ctx.fillStyle = color;
        ctx.fill();
        const b = d.box;
        const midY = g.plate.y + g.plate.height / 2;
        if (d.showImage) {
            ctx.font = `${Math.round(b.fontSize * 1.3)}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(d.emoji, g.plate.x + g.padH, midY);
        }
        ctx.font = cssFont(b.fontSize, b.bold, b.italic);
        ctx.fillStyle = d.style.textColor || '#FFFFFF';
        const textTop = midY - (g.lines.length * g.lineH) / 2;
        fillLines(ctx, g.lines, g.lineH, g.plate.x + g.padH + g.emojiW, textTop, 'left');
    }
    if (selected) {
        dashedBox(ctx, g.plate, color);
        drawControlPoint(ctx, g.post[0].x, g.post[0].y, 5, '#ffffff', color, 2);
    }
}

function drawComment(ctx: CanvasRenderingContext2D, d: CommentDrawing, selected: boolean): void {
    const g = d.geo;
    if (!g) return;
    const b = d.box;
    if (!d.editing) {
        const { x, y, width: w, height: h } = g.box;
        const r = CommentDrawing.RADIUS;
        const a = g.anchor;
        const cx = x + w / 2, cy = y + h / 2;
        const dx = a.x - cx, dy = a.y - cy;
        const side: 'left' | 'right' | 'top' | 'bottom' = Math.abs(dx) * h > Math.abs(dy) * w ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'top' : 'bottom');
        const half = 9;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        if (g.tail && side === 'top') {
            const px = Math.max(x + r + half, Math.min(x + w - r - half, a.x));
            ctx.lineTo(px - half, y); ctx.lineTo(a.x, a.y); ctx.lineTo(px + half, y);
        }
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        if (g.tail && side === 'right') {
            const py = Math.max(y + r + half, Math.min(y + h - r - half, a.y));
            ctx.lineTo(x + w, py - half); ctx.lineTo(a.x, a.y); ctx.lineTo(x + w, py + half);
        }
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        if (g.tail && side === 'bottom') {
            const px = Math.max(x + r + half, Math.min(x + w - r - half, a.x));
            ctx.lineTo(px + half, y + h); ctx.lineTo(a.x, a.y); ctx.lineTo(px - half, y + h);
        }
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        if (g.tail && side === 'left') {
            const py = Math.max(y + r + half, Math.min(y + h - r - half, a.y));
            ctx.lineTo(x, py + half); ctx.lineTo(a.x, a.y); ctx.lineTo(x, py - half);
        }
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        if (b.bgVisible && b.bgOpacity > 0) { ctx.fillStyle = textBoxBackgroundCss(b); ctx.fill(); }
        if (b.borderVisible && isDrawable(b.borderColor) && b.borderWidth > 0) {
            ctx.strokeStyle = b.borderColor; ctx.lineWidth = b.borderWidth; ctx.lineJoin = 'round'; ctx.stroke();
        }
        ctx.font = cssFont(b.fontSize, b.bold, b.italic);
        ctx.fillStyle = d.style.color;
        fillLines(ctx, g.lines, g.lineH, cx, y + g.padV, 'center');
    }
    if (selected) {
        const cp = isDrawable(b.borderColor) ? b.borderColor : b.bgColor;
        drawControlPoint(ctx, g.anchor.x, g.anchor.y, 5, '#ffffff', cp, 2);
        drawControlPoint(ctx, g.box.x + g.box.width / 2, g.box.y + g.box.height / 2, 5, '#ffffff', cp, 2);
    }
}

function drawTable(ctx: CanvasRenderingContext2D, d: TableDrawing, selected: boolean): void {
    const bounds = d.getBounds();
    if (!bounds) return;
    const b = d.box;
    const { x, y } = bounds;
    const w = d.width, h = d.height;
    if (b.bgVisible && b.bgOpacity > 0) {
        ctx.fillStyle = textBoxBackgroundCss(b);
        ctx.fillRect(x, y, w, h);
    }
    if (b.borderVisible && isDrawable(b.borderColor) && b.borderWidth > 0) {
        ctx.strokeStyle = b.borderColor;
        ctx.lineWidth = b.borderWidth;
        ctx.beginPath();
        for (let r = 0; r <= d.rows; r++) { ctx.moveTo(x, y + r * d.rowHeight); ctx.lineTo(x + w, y + r * d.rowHeight); }
        for (let c = 0; c <= d.cols; c++) { ctx.moveTo(x + c * d.colWidth, y); ctx.lineTo(x + c * d.colWidth, y + h); }
        ctx.stroke();
    }
    ctx.font = cssFont(b.fontSize, b.bold, b.italic);
    ctx.fillStyle = d.style.color;
    const lineH = b.fontSize * 1.2;
    const align = d.hAlign;
    for (let r = 0; r < d.rows; r++) {
        for (let c = 0; c < d.cols; c++) {
            const text = d.getCell(r, c);
            if (text === '') continue;
            if (d.editing && d.editingCell && d.editingCell.row === r && d.editingCell.col === c) continue;
            const cx = x + c * d.colWidth, cy = y + r * d.rowHeight;
            const lines = text.split('\n');
            ctx.save();
            ctx.beginPath();
            ctx.rect(cx, cy, d.colWidth, d.rowHeight);
            ctx.clip();
            const tx = align === 'left' ? cx + TableDrawing.PAD_H : align === 'right' ? cx + d.colWidth - TableDrawing.PAD_H : cx + d.colWidth / 2;
            fillLines(ctx, lines, lineH, tx, cy + d.rowHeight / 2 - (lines.length * lineH) / 2, align);
            ctx.restore();
        }
    }
    if (selected) {
        dashedBox(ctx, { x, y, width: w, height: h }, '#2962FF');
        drawControlPoint(ctx, x, y, 5, '#ffffff', '#2962FF', 2);
    }
}
