/**
 * Line Drawing Renderer
 * Renders line-based drawings: TrendLine family (incl. InfoLine, Arrow), TrendAngle, HorizontalRay, CrossLine
 */

import type { DrawingStyle } from '../../../drawings/drawing';
import { LineToolProps, drawLineToolDecorations, drawLabeledHorizontalLine } from '../../../drawings/line-tool-common';

/** Trend Line ailesi icin ek cizimler: uc sekilleri, orta nokta, istatistik kutusu */
export interface LineToolDecor {
    props: LineToolProps;
    statsLines: string[];
}

/**
 * Draws a trend line with optional text and extensions
 */
export function drawTrendLine(
    ctx: CanvasRenderingContext2D,
    points: { x: number; y: number }[],
    style: { color: string; lineWidth: number; lineDash?: number[]; text?: string; textColor?: string; fontSize?: number; fontWeight?: 'normal' | 'bold'; fontStyle?: 'normal' | 'italic'; textHAlign?: 'left' | 'center' | 'right'; textVAlign?: 'top' | 'middle' | 'bottom' },
    isSelected: boolean,
    extendLeft: boolean = false,
    extendRight: boolean = false,
    canvasWidth: number = 0,
    isHoveredForAddText: boolean = false,
    decor?: LineToolDecor
): void {
    if (points.length < 2) return;

    const dpr = window.devicePixelRatio || 1;

    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineWidth * dpr;

    if (style.lineDash && style.lineDash.length > 0) {
        ctx.setLineDash(style.lineDash.map(d => d * dpr));
    } else {
        ctx.setLineDash([]);
    }

    // Calculate line direction
    const p1 = points[0];
    const p2 = points[1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lineLength = Math.sqrt(dx * dx + dy * dy);

    let startX = p1.x;
    let startY = p1.y;
    let endX = p2.x;
    let endY = p2.y;

    // "Extend left/right" are SCREEN sides: they apply to the left-most / right-most point, whichever of p1/p2 that is
    // (a line drawn right-to-left keeps its body). Left-to-right lines are unchanged.
    if (dx !== 0) {
        const slope = dy / dx;
        const p1IsLeft = dx > 0;
        const extendP1 = p1IsLeft ? extendLeft : extendRight;
        const extendP2 = p1IsLeft ? extendRight : extendLeft;
        if (extendP1 && (p1IsLeft || canvasWidth > 0)) {
            const x = p1IsLeft ? 0 : canvasWidth;
            startX = x;
            startY = p1.y + slope * (x - p1.x);
        }
        if (extendP2 && (!p1IsLeft || canvasWidth > 0)) {
            const x = p1IsLeft ? canvasWidth : 0;
            endX = x;
            endY = p2.y + slope * (x - p2.x);
        }
    }

    // Check if there's text to draw
    const hasText = style.text && style.text.trim();

    if (hasText) {
        // Calculate text dimensions
        const fontSize = (style.fontSize || 14) * dpr;
        const fontWeight = style.fontWeight || 'normal';
        const fontStyle = style.fontStyle || 'normal';
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px Arial`;

        const textMetrics = ctx.measureText(style.text!);
        const textWidth = textMetrics.width;
        const padding = 8 * dpr;
        const gapWidth = textWidth + padding * 2;

        // Calculate midpoint
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        // Calculate gap start and end points along the line
        const unitDx = dx / lineLength;
        const unitDy = dy / lineLength;
        const halfGap = gapWidth / 2;

        // Ensure the line is long enough to have a gap
        if (lineLength > gapWidth) {
            const gapStartX = midX - unitDx * halfGap;
            const gapStartY = midY - unitDy * halfGap;
            const gapEndX = midX + unitDx * halfGap;
            const gapEndY = midY + unitDy * halfGap;

            // Draw line segment 1: start to gap
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(gapStartX, gapStartY);
            ctx.stroke();

            // Draw line segment 2: gap to end
            ctx.beginPath();
            ctx.moveTo(gapEndX, gapEndY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // Draw text at midpoint
            const angle = Math.atan2(dy, dx);

            // Offset based on vertical alignment
            const vAlign = style.textVAlign || 'middle';
            let offsetY = 0;
            if (vAlign === 'top') offsetY = -10 * dpr;
            else if (vAlign === 'bottom') offsetY = 10 * dpr;

            ctx.save();
            ctx.translate(midX, midY);

            // Rotate text to follow line, but keep readable
            let textAngle = angle;
            if (textAngle > Math.PI / 2) textAngle -= Math.PI;
            if (textAngle < -Math.PI / 2) textAngle += Math.PI;
            ctx.rotate(textAngle);

            // Draw text
            ctx.fillStyle = style.textColor || style.color;
            const hAlign = style.textHAlign || 'center';
            ctx.textAlign = hAlign;
            ctx.textBaseline = 'middle';
            ctx.fillText(style.text!, 0, offsetY);
            ctx.restore();
        } else {
            // Line too short for gap, just draw full line
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }
    } else if (isHoveredForAddText && lineLength > 0) {
        // Hovered - create gap for "+ Add Text" tooltip
        const tooltipWidth = 70 * dpr;
        const padding = 4 * dpr;
        const gapWidth = tooltipWidth + padding * 2;

        // Ensure the line is long enough to have a gap
        if (lineLength > gapWidth) {
            const unitDx = dx / lineLength;
            const unitDy = dy / lineLength;
            const halfGap = gapWidth / 2;

            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;

            const gapStartX = midX - unitDx * halfGap;
            const gapStartY = midY - unitDy * halfGap;
            const gapEndX = midX + unitDx * halfGap;
            const gapEndY = midY + unitDy * halfGap;

            // Draw line segment 1: start to gap
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(gapStartX, gapStartY);
            ctx.stroke();

            // Draw line segment 2: gap to end
            ctx.beginPath();
            ctx.moveTo(gapEndX, gapEndY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        } else {
            // Line too short for gap
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }
    } else {
        // No text, not hovered or lineLength is 0 - draw full line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }

    if (decor) {
        drawLineToolDecorations(
            ctx, p1, p2, style.color, style.lineWidth, decor.props, decor.statsLines,
            dpr, ctx.canvas.width, ctx.canvas.height
        );
    }

    // Draw control points if selected
    if (isSelected) {
        ctx.fillStyle = style.color;
        for (const point of points) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 4 * dpr, 0, Math.PI * 2);
            ctx.fill();

            // White center
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(point.x, point.y, 2 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = style.color;
        }
    }
}

/** Trend Angle icin Trend Line ortak ozellikleri (uzatma, metin, istatistik kutusu) */
export interface TrendAngleExtras {
    extendLeft?: boolean;
    extendRight?: boolean;
    canvasWidth?: number;
    isHoveredForAddText?: boolean;
    decor?: LineToolDecor;
}

/**
 * Draws a trend angle: the trend line (with text/extensions/stats) plus arc and degree label
 */
export function drawTrendAngle(
    ctx: CanvasRenderingContext2D,
    points: { x: number; y: number }[],
    style: { color: string; lineWidth: number; lineDash?: number[]; text?: string; textColor?: string; fontSize?: number; fontWeight?: 'normal' | 'bold'; fontStyle?: 'normal' | 'italic'; textHAlign?: 'left' | 'center' | 'right'; textVAlign?: 'top' | 'middle' | 'bottom' },
    dpr: number,
    isSelected: boolean,
    extras: TrendAngleExtras = {}
): void {
    if (points.length < 2) return;

    const p1 = points[0];
    const p2 = points[1];

    // Calculate angle from horizontal
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const angleRad = Math.atan2(-dy, dx);
    const angleDeg = angleRad * (180 / Math.PI);

    // Main trend line (text, extension, middle point, stats)
    drawTrendLine(
        ctx, points, style, false,
        !!extras.extendLeft, !!extras.extendRight, extras.canvasWidth ?? 0,
        !!extras.isHoveredForAddText, extras.decor
    );

    // Draw dashed arc from horizontal to the trend line
    const arcRadius = 30 * dpr;

    ctx.beginPath();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([3 * dpr, 3 * dpr]);

    // Draw horizontal reference line (short)
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p1.x + arcRadius + 10 * dpr, p1.y);
    ctx.stroke();

    // Draw the arc
    ctx.beginPath();
    if (angleDeg >= 0) {
        ctx.arc(p1.x, p1.y, arcRadius, 0, -angleRad, true);
    } else {
        ctx.arc(p1.x, p1.y, arcRadius, 0, -angleRad, false);
    }
    ctx.stroke();

    // Draw angle label
    ctx.setLineDash([]);
    const labelX = p1.x + arcRadius + 15 * dpr;
    const labelY = p1.y + (angleDeg >= 0 ? -5 * dpr : 15 * dpr);

    ctx.font = `${12 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = style.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${angleDeg.toFixed(2)}°`, labelX, labelY);

    // Draw control points
    if (isSelected) {
        ctx.fillStyle = style.color;
        for (const point of points) {
            ctx.beginPath();
            ctx.strokeStyle = style.color;
            ctx.lineWidth = 2 * dpr;
            ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.fillStyle = '#fff';
            ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

/**
 * Draws a horizontal ray from a point to the right edge
 */
export function drawHorizontalRay(
    ctx: CanvasRenderingContext2D,
    point: { x: number; y: number },
    style: DrawingStyle,
    dpr: number,
    isSelected: boolean,
    canvasWidth: number
): void {
    // Metin (varsa) cizgi boyunca hizalanir; Horizontal Ray varsayilani: cizginin ustunde
    drawLabeledHorizontalLine(ctx, { ...style, lineWidth: style.lineWidth || 2 }, point.y, point.x, canvasWidth, dpr, 'top');
    ctx.setLineDash([]);

    if (isSelected) {
        ctx.beginPath();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 2 * dpr;
        ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = '#fff';
        ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * Draws a cross line (horizontal and vertical lines through a point)
 */
export function drawCrossLine(
    ctx: CanvasRenderingContext2D,
    point: { x: number; y: number },
    style: { color: string; lineWidth: number; lineDash?: number[] },
    dpr: number,
    isSelected: boolean,
    canvasWidth: number,
    canvasHeight: number
): void {
    const { x, y } = point;

    ctx.beginPath();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = (style.lineWidth || 1) * dpr;
    ctx.setLineDash((style.lineDash || []).map(d => d * dpr));

    // Horizontal line
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth, y);

    // Vertical line
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasHeight);

    ctx.stroke();
    ctx.setLineDash([]);

    if (isSelected) {
        ctx.beginPath();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 2 * dpr;
        ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = '#fff';
        ctx.arc(x, y, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
    }
}
