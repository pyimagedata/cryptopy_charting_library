/**
 * Line Drawing Renderer
 * Renders line-based drawings: TrendLine, TrendAngle, HorizontalRay, CrossLine, InfoLine
 */

import { InfoLineDrawing } from '../../drawings/info-line-drawing';

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
    isHoveredForAddText: boolean = false
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

    // Extend left (from p1 towards negative direction)
    if (extendLeft && dx !== 0) {
        const slope = dy / dx;
        startX = 0;
        startY = p1.y - slope * p1.x;
    }

    // Extend right (from p2 towards positive direction)
    if (extendRight && dx !== 0 && canvasWidth > 0) {
        const slope = dy / dx;
        endX = canvasWidth;
        endY = p2.y + slope * (canvasWidth - p2.x);
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
    } else if (isHoveredForAddText) {
        // Hovered - create gap for "+ Add Text" tooltip
        const tooltipWidth = 70 * dpr;
        const padding = 4 * dpr;
        const gapWidth = tooltipWidth + padding * 2;

        // Calculate midpoint
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        // Calculate gap start and end points along the line
        const unitDx = dx / lineLength;
        const unitDy = dy / lineLength;
        const halfGap = gapWidth / 2;

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
        // No text, not hovered - draw full line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
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

/**
 * Draws a trend angle with arc and degree label
 */
export function drawTrendAngle(
    ctx: CanvasRenderingContext2D,
    points: { x: number; y: number }[],
    style: { color: string; lineWidth: number; lineDash?: number[] },
    dpr: number,
    isSelected: boolean
): void {
    if (points.length < 2) return;

    const p1 = points[0];
    const p2 = points[1];

    // Calculate angle from horizontal
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const angleRad = Math.atan2(-dy, dx);
    const angleDeg = angleRad * (180 / Math.PI);

    // Draw the main trend line
    ctx.beginPath();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = (style.lineWidth || 2) * dpr;
    ctx.setLineDash((style.lineDash || []).map(d => d * dpr));
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

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
    style: { color: string; lineWidth: number; lineDash?: number[] },
    dpr: number,
    isSelected: boolean,
    canvasWidth: number
): void {
    ctx.beginPath();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = (style.lineWidth || 2) * dpr;
    ctx.setLineDash((style.lineDash || []).map(d => d * dpr));
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(canvasWidth, point.y);
    ctx.stroke();
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

/**
 * Draws an info line with measurement tooltip
 */
export function drawInfoLine(
    ctx: CanvasRenderingContext2D,
    points: { x: number; y: number }[],
    drawing: InfoLineDrawing,
    dpr: number,
    _isSelected: boolean
): void {
    if (points.length < 2) return;

    const style = drawing.style;

    // Draw the line
    ctx.beginPath();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineWidth * dpr;
    ctx.setLineDash([]);
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();

    // Draw control points
    ctx.fillStyle = style.color;
    for (const point of points) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = style.color;
    }

    // Get measurements
    const m = drawing.getMeasurements();

    // Format text lines
    const priceSign = m.priceChange >= 0 ? '+' : '';
    const priceColor = m.priceChange >= 0 ? '#26a69a' : '#ef5350';

    const line1 = `${priceSign}${m.priceChange.toFixed(2)} (${m.priceChangePercent.toFixed(2)}%)`;
    const line2 = `${m.barCount} bar, ${m.timeDuration}`;
    const line3 = `${m.angle.toFixed(2)}°`;

    // Tooltip position
    const tooltipX = points[1].x + 20 * dpr;
    const tooltipY = points[1].y - 10 * dpr;

    // Font setup
    const fontSize = 12 * dpr;
    const fontBold = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial`;
    const fontNormal = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial`;
    ctx.font = fontNormal;

    const padding = 10 * dpr;
    const lineHeight = fontSize + 6 * dpr;
    const iconWidth = 20 * dpr;

    // Measure text widths
    ctx.font = fontBold;
    const textWidths = [
        ctx.measureText(line1).width,
        ctx.measureText(line2).width,
        ctx.measureText(line3).width
    ];
    const maxTextWidth = Math.max(...textWidths);

    const boxWidth = iconWidth + maxTextWidth + padding * 2 + 5 * dpr;
    const boxHeight = lineHeight * 3 + padding * 2;

    // Draw shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 8 * dpr;
    ctx.shadowOffsetX = 2 * dpr;
    ctx.shadowOffsetY = 2 * dpr;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(tooltipX, tooltipY, boxWidth, boxHeight, 6 * dpr);
    ctx.fill();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Border
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();

    // Text rendering
    ctx.textBaseline = 'middle';
    const textX = tooltipX + padding;
    let textY = tooltipY + padding + lineHeight / 2;

    // Line 1 - Price change
    ctx.fillStyle = '#787878';
    ctx.font = fontNormal;
    ctx.fillText('↕', textX, textY);
    ctx.fillStyle = priceColor;
    ctx.font = fontBold;
    ctx.fillText(line1, textX + iconWidth, textY);
    textY += lineHeight;

    // Line 2 - Bars/Time
    ctx.fillStyle = '#787878';
    ctx.font = fontNormal;
    ctx.fillText('↔', textX, textY);
    ctx.fillStyle = '#333333';
    ctx.font = fontBold;
    ctx.fillText(line2, textX + iconWidth, textY);
    textY += lineHeight;

    // Line 3 - Angle
    ctx.fillStyle = '#787878';
    ctx.font = fontNormal;
    ctx.fillText('∠', textX, textY);
    ctx.fillStyle = '#333333';
    ctx.font = fontBold;
    ctx.fillText(line3, textX + iconWidth, textY);
}
