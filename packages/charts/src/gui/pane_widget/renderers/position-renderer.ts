/**
 * Position Renderer
 * Renders Long Position drawings with profit/loss zones
 */

import { LongPositionDrawing } from '../../../drawings/long-position-drawing';

/**
 * Draw a Long Position projection
 */
export function drawLongPosition(
    ctx: CanvasRenderingContext2D,
    drawing: LongPositionDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    showControlPoints: boolean,
    priceToPixel: (price: number) => number | null
): void {
    if (pixelPoints.length < 2) return;

    // Get entry coordinates
    const left = Math.min(pixelPoints[0].x, pixelPoints[1].x);
    const right = Math.max(pixelPoints[0].x, pixelPoints[1].x);
    const width = right - left;

    if (width < 5) return; // Too small to draw

    // Get prices
    const entryPrice = drawing.getEntryPrice();
    const targetPrice = drawing.getTargetPrice();
    const stopPrice = drawing.getStopPrice();

    // Convert prices to pixels (multiply by DPR to match canvas coordinates)
    const entryYRaw = priceToPixel(entryPrice);
    const targetYRaw = priceToPixel(targetPrice);
    const stopYRaw = priceToPixel(stopPrice);

    if (entryYRaw === null || targetYRaw === null || stopYRaw === null) return;

    const entryY = entryYRaw * dpr;
    const targetY = targetYRaw * dpr;
    const stopY = stopYRaw * dpr;

    // Cache the zone Y positions for hit testing (use non-DPR values)
    drawing.setCachedZoneY(targetYRaw, stopYRaw);

    ctx.save();

    const centerX = (left + right) / 2;

    // Calculate zone heights
    const profitHeight = Math.abs(entryY - targetY);
    const lossHeight = Math.abs(stopY - entryY);

    // Draw Profit Zone (green, above entry for long)
    if (profitHeight > 0) {
        ctx.fillStyle = drawing.profitColor;
        ctx.fillRect(left, Math.min(entryY, targetY), width, profitHeight);

        // Border
        ctx.strokeStyle = '#26a69a';
        ctx.lineWidth = 1 * dpr;
        ctx.strokeRect(left, Math.min(entryY, targetY), width, profitHeight);
    }

    // Draw Loss Zone (red, below entry for long)
    if (lossHeight > 0) {
        ctx.fillStyle = drawing.lossColor;
        ctx.fillRect(left, Math.min(entryY, stopY), width, lossHeight);

        // Border
        ctx.strokeStyle = '#ef5350';
        ctx.lineWidth = 1 * dpr;
        ctx.strokeRect(left, Math.min(entryY, stopY), width, lossHeight);
    }

    // Draw Entry Line
    ctx.strokeStyle = drawing.entryColor;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(left, entryY);
    ctx.lineTo(right, entryY);
    ctx.stroke();

    // Draw Labels (only when selected or being created)
    if (showControlPoints || drawing.state === 'selected') {
        ctx.font = `bold ${11 * dpr}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const boxPadding = 6 * dpr;
        const boxHeight = 20 * dpr;

        // Target Label (top)
        const profitPercent = drawing.profitPercent;
        const profitAmount = drawing.getProfitAmount();
        const targetText = `Target: ${targetPrice.toFixed(2)} (+${profitPercent.toFixed(1)}%) $${profitAmount.toFixed(2)}`;

        const targetTextWidth = ctx.measureText(targetText).width + boxPadding * 2;
        const targetLabelY = targetY - boxHeight / 2 - 5 * dpr;

        ctx.fillStyle = '#26a69a';
        ctx.beginPath();
        ctx.roundRect(centerX - targetTextWidth / 2, targetLabelY - boxHeight / 2, targetTextWidth, boxHeight, 4 * dpr);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.fillText(targetText, centerX, targetLabelY);

        // Stop Label (bottom)
        const lossPercent = drawing.stopPercent;
        const lossAmount = drawing.getLossAmount();
        const stopText = `Stop: ${stopPrice.toFixed(2)} (-${lossPercent.toFixed(1)}%) $${lossAmount.toFixed(2)}`;

        const stopTextWidth = ctx.measureText(stopText).width + boxPadding * 2;
        const stopLabelY = stopY + boxHeight / 2 + 5 * dpr;

        ctx.fillStyle = '#ef5350';
        ctx.beginPath();
        ctx.roundRect(centerX - stopTextWidth / 2, stopLabelY - boxHeight / 2, stopTextWidth, boxHeight, 4 * dpr);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.fillText(stopText, centerX, stopLabelY);

        // Entry Label (middle)
        const riskReward = drawing.getRiskRewardRatio();
        const quantity = drawing.quantity;
        const entryText = `Entry: ${entryPrice.toFixed(2)} | Qty: ${quantity}`;
        const rrText = `R/R: ${riskReward.toFixed(2)}`;

        const entryTextWidth = Math.max(
            ctx.measureText(entryText).width,
            ctx.measureText(rrText).width
        ) + boxPadding * 2;
        const entryBoxHeight = 36 * dpr;

        ctx.fillStyle = 'rgba(38, 166, 154, 0.9)';
        ctx.beginPath();
        ctx.roundRect(centerX - entryTextWidth / 2, entryY - entryBoxHeight / 2, entryTextWidth, entryBoxHeight, 4 * dpr);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.fillText(entryText, centerX, entryY - 8 * dpr);
        ctx.fillText(rrText, centerX, entryY + 8 * dpr);
    }

    // Control Points (when selected)
    if (showControlPoints) {
        const cpRadius = 5 * dpr;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#2962ff';
        ctx.lineWidth = 2 * dpr;

        // Left control point (index 0)
        ctx.beginPath();
        ctx.rect(left - cpRadius, entryY - cpRadius, cpRadius * 2, cpRadius * 2);
        ctx.fill();
        ctx.stroke();

        // Right control point (index 1)
        ctx.beginPath();
        ctx.rect(right - cpRadius, entryY - cpRadius, cpRadius * 2, cpRadius * 2);
        ctx.fill();
        ctx.stroke();

        // Target control point (index 2) - top center
        ctx.fillStyle = '#26a69a';
        ctx.beginPath();
        ctx.rect(centerX - cpRadius, targetY - cpRadius, cpRadius * 2, cpRadius * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Stop control point (index 3) - bottom center
        ctx.fillStyle = '#ef5350';
        ctx.beginPath();
        ctx.rect(centerX - cpRadius, stopY - cpRadius, cpRadius * 2, cpRadius * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    }

    ctx.restore();
}
