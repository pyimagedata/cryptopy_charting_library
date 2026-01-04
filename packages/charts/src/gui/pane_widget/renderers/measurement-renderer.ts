/**
 * Measurement Renderer
 * Renders Price Range, Date Range and Date & Price Range measurement tools
 */

import { PriceRangeDrawing } from '../../../drawings/price-range-drawing';
import { DateRangeDrawing } from '../../../drawings/date-range-drawing';
import { DatePriceRangeDrawing } from '../../../drawings/date-price-range-drawing';

/**
 * Draw a Price Range measurement
 */
export function drawPriceRange(
    ctx: CanvasRenderingContext2D,
    drawing: PriceRangeDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    showControlPoints: boolean
): void {
    if (pixelPoints.length < 2) return;

    const p1 = pixelPoints[0];
    const p2 = pixelPoints[1];

    const left = Math.min(p1.x, p2.x);
    const right = Math.max(p1.x, p2.x);
    const top = Math.min(p1.y, p2.y);
    const bottom = Math.max(p1.y, p2.y);
    const width = right - left;
    const height = bottom - top;

    if (width < 2 && height < 2) return;

    ctx.save();

    // 1. Draw Background Rectangle
    ctx.fillStyle = drawing.fillColor;
    ctx.fillRect(left, top, width, height);

    // 2. Draw Top and Bottom Boundary Lines
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = 1 * dpr;

    // Top line
    ctx.beginPath();
    ctx.moveTo(left, p1.y);
    ctx.lineTo(right, p1.y);
    ctx.stroke();

    // Bottom line
    ctx.beginPath();
    ctx.moveTo(left, p2.y);
    ctx.lineTo(right, p2.y);
    ctx.stroke();

    // 3. Draw Vertical Arrow Line in the middle
    const centerX = (left + right) / 2;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(centerX, p1.y);
    ctx.lineTo(centerX, p2.y);
    ctx.stroke();

    // Arrow head at the end point (p2)
    const arrowSize = 6 * dpr;
    const direction = p2.y > p1.y ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(centerX - arrowSize, p2.y - direction * arrowSize);
    ctx.lineTo(centerX, p2.y);
    ctx.lineTo(centerX + arrowSize, p2.y - direction * arrowSize);
    ctx.stroke();

    // 4. Draw Metric Label (only when selected or being created)
    if (showControlPoints || drawing.state === 'selected') {
        const priceDiff = drawing.getPriceChange();
        const percentChange = drawing.getPercentageChange();

        // Format label text: "Diff (Percent%) Ticks"
        const priceText = `${priceDiff.toFixed(2)} (${(percentChange >= 0 ? '+' : '')}${percentChange.toFixed(2)}%)`;

        ctx.font = `bold ${12 * dpr}px Arial`;
        const textWidth = ctx.measureText(priceText).width;
        const padding = 6 * dpr;
        const boxHeight = 24 * dpr;
        const boxWidth = textWidth + padding * 2;

        // Position box at the end point (p2) but offset slightly
        const boxY = p1.y > p2.y ? bottom + boxHeight / 2 + 10 * dpr : top - boxHeight / 2 - 10 * dpr;

        // Draw background box for text
        ctx.fillStyle = drawing.style.color;

        if (typeof (ctx as any).roundRect === 'function') {
            ctx.beginPath();
            (ctx as any).roundRect(centerX - boxWidth / 2, boxY - boxHeight / 2, boxWidth, boxHeight, 4 * dpr);
            ctx.fill();
        } else {
            ctx.fillRect(centerX - boxWidth / 2, boxY - boxHeight / 2, boxWidth, boxHeight);
        }

        // Draw text
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(priceText, centerX, boxY);
    }

    // 5. Draw Control Points
    if (showControlPoints) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#2962ff';
        ctx.lineWidth = 1.5 * dpr;
        const radius = 4 * dpr;

        [p1, p2].forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    }

    ctx.restore();
}

/**
 * Draw a Date Range measurement
 */
export function drawDateRange(
    ctx: CanvasRenderingContext2D,
    drawing: DateRangeDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    showControlPoints: boolean
): void {
    if (pixelPoints.length < 2) return;

    const p1 = pixelPoints[0];
    const p2 = pixelPoints[1];

    const left = Math.min(p1.x, p2.x);
    const right = Math.max(p1.x, p2.x);
    const top = Math.min(p1.y, p2.y);
    const bottom = Math.max(p1.y, p2.y);
    const width = right - left;
    const height = bottom - top;

    if (width < 2 && height < 2) return;

    ctx.save();

    // 1. Draw Background Rectangle
    ctx.fillStyle = drawing.fillColor;
    ctx.fillRect(left, top, width, height);

    // 2. Draw Start and End Vertical Lines
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = 1 * dpr;

    // Start vertical line
    ctx.beginPath();
    ctx.moveTo(p1.x, top);
    ctx.lineTo(p1.x, bottom);
    ctx.stroke();

    // End vertical line
    ctx.beginPath();
    ctx.moveTo(p2.x, top);
    ctx.lineTo(p2.x, bottom);
    ctx.stroke();

    // 3. Draw Horizontal Arrow Line in the middle
    const centerY = (top + bottom) / 2;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(p1.x, centerY);
    ctx.lineTo(p2.x, centerY);
    ctx.stroke();

    // Arrow head at the end point (p2)
    const arrowSize = 6 * dpr;
    const directionX = p2.x > p1.x ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(p2.x - directionX * arrowSize, centerY - arrowSize);
    ctx.lineTo(p2.x, centerY);
    ctx.lineTo(p2.x - directionX * arrowSize, centerY + arrowSize);
    ctx.stroke();

    // 4. Draw Metric Label
    if (showControlPoints || drawing.state === 'selected') {
        const barCount = drawing.barCount;
        const durationText = drawing.getDurationText();
        const volValue = drawing.volume;

        const line1 = `${barCount} bars, ${durationText}`;
        const line2 = volValue > 0 ? `Vol ${formatVolume(volValue)}` : '';

        ctx.font = `bold ${12 * dpr}px Arial`;
        const textWidth1 = ctx.measureText(line1).width;
        const textWidth2 = line2 ? ctx.measureText(line2).width : 0;
        const textWidth = Math.max(textWidth1, textWidth2);

        const padding = 8 * dpr;
        const lineHeight = 16 * dpr;
        const boxHeight = (line2 ? lineHeight * 2 : lineHeight) + padding * 2;
        const boxWidth = textWidth + padding * 2;

        const centerX = (left + right) / 2;
        const boxY = bottom + boxHeight / 2 + 10 * dpr;

        // Draw background box
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.shadowColor = 'rgba(0,0,0,0.1)';
        ctx.shadowBlur = 4 * dpr;

        if (typeof (ctx as any).roundRect === 'function') {
            ctx.beginPath();
            (ctx as any).roundRect(centerX - boxWidth / 2, boxY - boxHeight / 2, boxWidth, boxHeight, 4 * dpr);
            ctx.fill();
        } else {
            ctx.fillRect(centerX - boxWidth / 2, boxY - boxHeight / 2, boxWidth, boxHeight);
        }
        ctx.shadowBlur = 0;

        // Draw text
        ctx.fillStyle = '#131722';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (line2) {
            ctx.fillText(line1, centerX, boxY - lineHeight / 2);
            ctx.fillText(line2, centerX, boxY + lineHeight / 2);
        } else {
            ctx.fillText(line1, centerX, boxY);
        }
    }

    // 5. Draw Control Points
    if (showControlPoints) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = 1.5 * dpr;
        const radius = 4 * dpr;

        [p1, p2].forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    }

    ctx.restore();
}

/**
 * Draw a Date and Price Range measurement
 */
export function drawDatePriceRange(
    ctx: CanvasRenderingContext2D,
    drawing: DatePriceRangeDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    showControlPoints: boolean
): void {
    if (pixelPoints.length < 2) return;

    const p1 = pixelPoints[0];
    const p2 = pixelPoints[1];

    const left = Math.min(p1.x, p2.x);
    const right = Math.max(p1.x, p2.x);
    const top = Math.min(p1.y, p2.y);
    const bottom = Math.max(p1.y, p2.y);
    const width = right - left;
    const height = bottom - top;

    if (width < 2 && height < 2) return;

    ctx.save();

    // 1. Draw Background Rectangle
    ctx.fillStyle = drawing.fillColor;
    ctx.fillRect(left, top, width, height);

    // 2. Draw Horizontal Arrow Line
    const centerY = (top + bottom) / 2;
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(p1.x, centerY);
    ctx.lineTo(p2.x, centerY);
    ctx.stroke();

    // Horizontal Arrow head
    const arrowSize = 6 * dpr;
    const directionX = p2.x > p1.x ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(p2.x - directionX * arrowSize, centerY - arrowSize);
    ctx.lineTo(p2.x, centerY);
    ctx.lineTo(p2.x - directionX * arrowSize, centerY + arrowSize);
    ctx.stroke();

    // 3. Draw Vertical Arrow Line
    const centerX = (left + right) / 2;
    ctx.beginPath();
    ctx.moveTo(centerX, p1.y);
    ctx.lineTo(centerX, p2.y);
    ctx.stroke();

    // Vertical Arrow head
    const directionY = p2.y > p1.y ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(centerX - arrowSize, p2.y - directionY * arrowSize);
    ctx.lineTo(centerX, p2.y);
    ctx.lineTo(centerX + arrowSize, p2.y - directionY * arrowSize);
    ctx.stroke();

    // 4. Draw Metric Label
    if (showControlPoints || drawing.state === 'selected') {
        const priceDiff = drawing.getPriceChange();
        const percentChange = drawing.getPercentageChange();
        const barCount = drawing.barCount;
        const durationText = drawing.getDurationText();
        const volValue = drawing.volume;

        const line1 = `${priceDiff.toFixed(2)} (${(percentChange >= 0 ? '+' : '')}${percentChange.toFixed(2)}%)`;
        const line2 = `${barCount} bars, ${durationText}`;
        const line3 = volValue > 0 ? `Vol ${formatVolume(volValue)}` : '';

        ctx.font = `bold ${12 * dpr}px Arial`;
        const textWidth = Math.max(
            ctx.measureText(line1).width,
            ctx.measureText(line2).width,
            line3 ? ctx.measureText(line3).width : 0
        );

        const padding = 8 * dpr;
        const lineHeight = 16 * dpr;
        const boxHeight = (line3 ? lineHeight * 3 : lineHeight * 2) + padding * 2;
        const boxWidth = textWidth + padding * 2;

        const boxY = bottom + boxHeight / 2 + 10 * dpr;

        // Draw background box
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.shadowColor = 'rgba(0,0,0,0.1)';
        ctx.shadowBlur = 4 * dpr;

        if (typeof (ctx as any).roundRect === 'function') {
            ctx.beginPath();
            (ctx as any).roundRect(centerX - boxWidth / 2, boxY - boxHeight / 2, boxWidth, boxHeight, 4 * dpr);
            ctx.fill();
        } else {
            ctx.fillRect(centerX - boxWidth / 2, boxY - boxHeight / 2, boxWidth, boxHeight);
        }
        ctx.shadowBlur = 0;

        // Draw text
        ctx.fillStyle = '#131722';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (line3) {
            ctx.fillText(line1, centerX, boxY - lineHeight);
            ctx.fillText(line2, centerX, boxY);
            ctx.fillText(line3, centerX, boxY + lineHeight);
        } else {
            ctx.fillText(line1, centerX, boxY - lineHeight / 2);
            ctx.fillText(line2, centerX, boxY + lineHeight / 2);
        }
    }

    // 5. Draw Control Points
    if (showControlPoints) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = 1.5 * dpr;
        const radius = 4 * dpr;

        [p1, p2].forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    }

    ctx.restore();
}

/**
 * Format volume with abbreviations (K, M, B, T)
 */
function formatVolume(val: number): string {
    const absVal = Math.abs(val);
    if (absVal >= 1e12) return (val / 1e12).toFixed(2) + ' T';
    if (absVal >= 1e9) return (val / 1e9).toFixed(2) + ' B';
    if (absVal >= 1e6) return (val / 1e6).toFixed(2) + ' M';
    if (absVal >= 1e3) return (val / 1e3).toFixed(2) + ' K';
    return val.toString();
}
