/**
 * Annotation Renderer
 * Renders Text, Callouts, and other annotation tools
 */

import { TextDrawing } from '../../../drawings/text-drawing';
import { CalloutDrawing } from '../../../drawings/callout-drawing';
import { PriceLabelDrawing } from '../../../drawings/price-label-drawing';
import { FlagMarkedDrawing } from '../../../drawings/flag-marked-drawing';
import { StickerDrawing } from '../../../drawings/sticker-drawing';

/**
 * Draw a Text label
 */
export function drawText(
    ctx: CanvasRenderingContext2D,
    drawing: TextDrawing,
    pixelPoint: { x: number; y: number },
    dpr: number,
    isSelected: boolean
): void {
    const { text, fontSize, bold, italic, style, backgroundColor, borderColor, borderWidth, backgroundVisible, borderVisible } = drawing;

    ctx.save();

    // Set font
    const fontWeight = bold ? 'bold' : 'normal';
    const fontStyle = italic ? 'italic' : 'normal';
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize * dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;

    // Support multiline text
    const lines = text.split('\n');
    const lineHeight = fontSize * 1.2 * dpr;

    // Measure total dimensions
    let maxLineWidth = 0;
    lines.forEach(line => {
        const metrics = ctx.measureText(line);
        maxLineWidth = Math.max(maxLineWidth, metrics.width);
    });

    const textWidth = maxLineWidth;
    const textHeight = lines.length * lineHeight;
    const padding = 6 * dpr;

    const boxWidth = textWidth + padding * 2;
    const boxHeight = textHeight + padding * 2;

    // Position (center on the point by default)
    const x = pixelPoint.x - boxWidth / 2;
    const y = pixelPoint.y - boxHeight / 2;

    // Cache bounds for hit testing
    drawing.setCachedBounds({
        x: x / dpr,
        y: y / dpr,
        width: boxWidth / dpr,
        height: boxHeight / dpr
    });

    // 1. Draw Background and Border
    if (backgroundVisible || borderVisible) {
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(x, y, boxWidth, boxHeight, 4 * dpr);
        } else {
            ctx.rect(x, y, boxWidth, boxHeight);
        }

        if (backgroundVisible && backgroundColor !== 'transparent') {
            ctx.fillStyle = backgroundColor;
            ctx.fill();
        }

        if (borderVisible && borderColor !== 'transparent' && borderWidth > 0) {
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = borderWidth * dpr;
            ctx.stroke();
        }
    }

    // 2. Draw Text lines
    ctx.fillStyle = style.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const startY = pixelPoint.y - textHeight / 2 + lineHeight / 2;
    lines.forEach((line, i) => {
        ctx.fillText(line, pixelPoint.x, startY + i * lineHeight);
    });

    // 3. Draw selection
    if (isSelected) {
        drawSelectionBox(ctx, x, y, boxWidth, boxHeight, style.color, dpr);
        drawControlPoint(ctx, pixelPoint.x, pixelPoint.y, style.color, dpr);
    }

    ctx.restore();
}

/**
 * Draw a Callout
 */
export function drawCallout(
    ctx: CanvasRenderingContext2D,
    drawing: CalloutDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    isSelected: boolean
): void {
    if (pixelPoints.length < 1) return;

    // First point: anchor (where pointer tip goes)
    // Second point: box center
    const anchor = pixelPoints[0];
    const boxCenter = pixelPoints.length > 1
        ? pixelPoints[1]
        : { x: anchor.x + 80 * dpr, y: anchor.y - 60 * dpr };

    const { text, fontSize, bold, italic, style, backgroundColor, borderColor, borderWidth } = drawing;

    ctx.save();

    // Set font
    const fontWeight = bold ? 'bold' : 'normal';
    const fontStyle = italic ? 'italic' : 'normal';
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize * dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;

    // Support multiline text
    const lines = text.split('\n');
    const lineHeight = fontSize * 1.2 * dpr;

    // Measure total dimensions
    let maxLineWidth = 0;
    lines.forEach(line => {
        const metrics = ctx.measureText(line);
        maxLineWidth = Math.max(maxLineWidth, metrics.width);
    });

    const textWidth = Math.max(maxLineWidth, 50 * dpr);
    const textHeight = lines.length * lineHeight;
    const paddingH = 16 * dpr;
    const paddingV = 12 * dpr;

    const w = textWidth + paddingH * 2;
    const h = textHeight + paddingV * 2;
    const r = 8 * dpr;  // corner radius

    // Box bounds (top-left corner)
    const x = boxCenter.x - w / 2;
    const y = boxCenter.y - h / 2;

    // Cache bounds
    drawing.setCachedBounds({
        x: x / dpr,
        y: y / dpr,
        width: w / dpr,
        height: h / dpr
    });

    // Determine which side is nearest to anchor (relative to box)
    const deltaX = anchor.x - boxCenter.x;
    const deltaY = anchor.y - boxCenter.y;

    // Calculate nearest side
    let nearestSide: 'left' | 'right' | 'top' | 'bottom';

    // Check if anchor is outside the box
    const isOutside = Math.abs(deltaX) > w / 2 || Math.abs(deltaY) > h / 2;

    if (Math.abs(deltaX) * h > Math.abs(deltaY) * w) {
        nearestSide = deltaX < 0 ? 'left' : 'right';
    } else {
        nearestSide = deltaY < 0 ? 'top' : 'bottom';
    }

    // Pointer base half-width
    const pointerHalf = 10 * dpr;

    ctx.beginPath();

    // Start from top-left corner (after radius)
    ctx.moveTo(x + r, y);

    // TOP EDGE
    if (nearestSide === 'top' && isOutside && pixelPoints.length > 1) {
        const px = Math.max(x + r + pointerHalf, Math.min(x + w - r - pointerHalf, anchor.x));
        ctx.lineTo(px + pointerHalf, y);
        ctx.lineTo(anchor.x, anchor.y);
        ctx.lineTo(px - pointerHalf, y);
    }
    ctx.lineTo(x + w - r, y);

    // Top-right corner
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);

    // RIGHT EDGE
    if (nearestSide === 'right' && isOutside && pixelPoints.length > 1) {
        const py = Math.max(y + r + pointerHalf, Math.min(y + h - r - pointerHalf, anchor.y));
        ctx.lineTo(x + w, py - pointerHalf);
        ctx.lineTo(anchor.x, anchor.y);
        ctx.lineTo(x + w, py + pointerHalf);
    }
    ctx.lineTo(x + w, y + h - r);

    // Bottom-right corner
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);

    // BOTTOM EDGE
    if (nearestSide === 'bottom' && isOutside && pixelPoints.length > 1) {
        const px = Math.max(x + r + pointerHalf, Math.min(x + w - r - pointerHalf, anchor.x));
        ctx.lineTo(px + pointerHalf, y + h);
        ctx.lineTo(anchor.x, anchor.y);
        ctx.lineTo(px - pointerHalf, y + h);
    }
    ctx.lineTo(x + r, y + h);

    // Bottom-left corner
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);

    // LEFT EDGE
    if (nearestSide === 'left' && isOutside && pixelPoints.length > 1) {
        const py = Math.max(y + r + pointerHalf, Math.min(y + h - r - pointerHalf, anchor.y));
        ctx.lineTo(x, py + pointerHalf);
        ctx.lineTo(anchor.x, anchor.y);
        ctx.lineTo(x, py - pointerHalf);
    }
    ctx.lineTo(x, y + r);

    // Top-left corner
    ctx.quadraticCurveTo(x, y, x + r, y);

    ctx.closePath();

    // Fill
    if (backgroundColor !== 'transparent') {
        ctx.fillStyle = backgroundColor;
        ctx.fill();
    }

    // Stroke
    if (borderColor !== 'transparent' && borderWidth > 0) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth * dpr;
        ctx.stroke();
    }

    // Draw Text lines
    ctx.fillStyle = style.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const startY = boxCenter.y - textHeight / 2 + lineHeight / 2;
    lines.forEach((line, i) => {
        ctx.fillText(line, boxCenter.x, startY + i * lineHeight);
    });

    // Draw selection (only control points, no dashed box)
    if (isSelected) {
        drawControlPoint(ctx, anchor.x, anchor.y, borderColor || style.color, dpr);
        if (pixelPoints.length > 1) {
            drawControlPoint(ctx, boxCenter.x, boxCenter.y, borderColor || style.color, dpr);
        }
    }

    ctx.restore();
}

/**
 * Draw a Price Label
 */
export function drawPriceLabel(
    ctx: CanvasRenderingContext2D,
    drawing: PriceLabelDrawing,
    pixelPoint: { x: number; y: number },
    price: number,
    dpr: number,
    isSelected: boolean
): void {
    const { fontSize, style, backgroundColor, bold } = drawing;

    ctx.save();

    const text = price.toFixed(2);
    const fontWeight = bold ? 'bold' : 'normal';
    ctx.font = `${fontWeight} ${fontSize * dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;

    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize * dpr;
    const paddingX = 12 * dpr;
    const paddingY = 8 * dpr;

    const boxWidth = textWidth + paddingX * 2;
    const boxHeight = textHeight + paddingY * 2;
    const radius = 6 * dpr;

    // Box position - offset from anchor point (anchor is at bottom-left)
    const x = pixelPoint.x + 8 * dpr;
    const y = pixelPoint.y - boxHeight - 8 * dpr;

    drawing.setCachedBounds({
        x: x / dpr,
        y: y / dpr,
        width: boxWidth / dpr,
        height: boxHeight / dpr
    });

    // Pointer base points (from bottom-left corner of box)
    const pointerOffset = 10 * dpr;
    const p1 = { x: x, y: y + boxHeight - pointerOffset };  // Up from bottom-left on left edge
    const p2 = { x: x + pointerOffset, y: y + boxHeight };  // Right from bottom-left on bottom edge

    // Draw pointer triangle (filled)
    ctx.beginPath();
    ctx.moveTo(pixelPoint.x, pixelPoint.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.fillStyle = backgroundColor;
    ctx.fill();

    // Draw rounded rectangle box
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + boxWidth - radius, y);
    ctx.quadraticCurveTo(x + boxWidth, y, x + boxWidth, y + radius);
    ctx.lineTo(x + boxWidth, y + boxHeight - radius);
    ctx.quadraticCurveTo(x + boxWidth, y + boxHeight, x + boxWidth - radius, y + boxHeight);
    ctx.lineTo(x + radius, y + boxHeight);
    ctx.quadraticCurveTo(x, y + boxHeight, x, y + boxHeight - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fillStyle = backgroundColor;
    ctx.fill();

    // Text
    ctx.fillStyle = style.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + boxWidth / 2, y + boxHeight / 2);

    // Control point when selected
    if (isSelected) {
        drawControlPoint(ctx, pixelPoint.x, pixelPoint.y, backgroundColor, dpr);
    }

    ctx.restore();
}

/**
 * Draw a Flag Marker
 */
export function drawFlagMarked(
    ctx: CanvasRenderingContext2D,
    drawing: FlagMarkedDrawing,
    pixelPoint: { x: number; y: number },
    dpr: number,
    isSelected: boolean
): void {
    const { text, style } = drawing;

    ctx.save();

    const size = 24 * dpr;
    const x = pixelPoint.x;
    const y = pixelPoint.y - size;

    drawing.setCachedBounds({
        x: x / dpr,
        y: y / dpr,
        width: size / dpr,
        height: size / dpr
    });

    // Draw Flag Pole
    ctx.strokeStyle = '#787b86';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, pixelPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    // Draw Flag
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + size * 0.8, y + size * 0.3);
    ctx.lineTo(x, y + size * 0.6);
    ctx.closePath();
    ctx.fill();

    if (text) {
        ctx.font = `${10 * dpr}px sans-serif`;
        ctx.fillStyle = '#787b86';
        ctx.textAlign = 'left';
        ctx.fillText(text, x + 4 * dpr, pixelPoint.y + 12 * dpr);
    }

    if (isSelected) {
        drawControlPoint(ctx, pixelPoint.x, pixelPoint.y, style.color, dpr);
    }

    ctx.restore();
}

/**
 * Draw a Sticker (Emoji/Icon)
 */
export function drawSticker(
    ctx: CanvasRenderingContext2D,
    drawing: StickerDrawing,
    pixelPoint: { x: number; y: number },
    dpr: number,
    isSelected: boolean
): void {
    const { content, fontSize } = drawing;

    ctx.save();

    const fontScalar = fontSize * dpr;
    ctx.font = `${fontScalar}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Measure text for selection box and hit testing
    const metrics = ctx.measureText(content);
    const width = metrics.width;
    const height = fontScalar; // Approximate height

    drawing.setCachedBounds({
        x: (pixelPoint.x - width / 2) / dpr,
        y: (pixelPoint.y - height / 2) / dpr,
        width: width / dpr,
        height: height / dpr
    });

    // Draw the sticker
    ctx.fillText(content, pixelPoint.x, pixelPoint.y);

    if (isSelected) {
        // Just draw a small circle at the anchor if selected
        drawControlPoint(ctx, pixelPoint.x, pixelPoint.y, '#2962ff', dpr);
    }

    ctx.restore();
}

// Helpers
function drawSelectionBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, dpr: number) {
    ctx.strokeStyle = color;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(x - 2 * dpr, y - 2 * dpr, w + 4 * dpr, h + 4 * dpr);
    ctx.setLineDash([]);
}

function drawControlPoint(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, dpr: number) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 2 * dpr, 0, Math.PI * 2);
    ctx.fill();
}
