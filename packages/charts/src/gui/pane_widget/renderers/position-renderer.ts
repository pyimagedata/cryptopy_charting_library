/**
 * Position Renderer
 * Renders long and short position projections with profit/loss zones
 */

import { LongPositionDrawing } from '../../../drawings/long-position-drawing';
import { ShortPositionDrawing } from '../../../drawings/short-position-drawing';

/**
 * Draw a long position projection
 */
export function drawLongPosition(
    ctx: CanvasRenderingContext2D,
    drawing: LongPositionDrawing,
    dpr: number,
    showControlPoints: boolean
): void {
    const pixelPoints = drawing.getPixelPoints();
    if (pixelPoints.length < 2) return;

    const left = Math.min(pixelPoints[0].x, pixelPoints[1].x);
    const right = Math.max(pixelPoints[0].x, pixelPoints[1].x);
    const entryY = drawing.getEntryY();
    const targetY = drawing.getTargetY();
    const stopY = drawing.getStopY();

    // Skip if not properly initialized
    if (entryY === 0 && targetY === 0 && stopY === 0) return;

    ctx.save();

    // For long: profit zone is above entry (green), loss zone is below (red)
    // Draw profit zone (entry to target)
    ctx.fillStyle = drawing.profitColor;
    ctx.fillRect(left, targetY, right - left, entryY - targetY);
    ctx.strokeStyle = '#26a69a';
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(left, targetY, right - left, entryY - targetY);

    // Draw loss zone (entry to stop)
    ctx.fillStyle = drawing.lossColor;
    ctx.fillRect(left, entryY, right - left, stopY - entryY);
    ctx.strokeStyle = '#ef5350';
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(left, entryY, right - left, stopY - entryY);

    // Draw entry line
    ctx.beginPath();
    ctx.strokeStyle = '#26a69a';
    ctx.lineWidth = 2 * dpr;
    ctx.moveTo(left, entryY);
    ctx.lineTo(right, entryY);
    ctx.stroke();

    // Draw labels
    ctx.font = `bold ${11 * dpr}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const centerX = (left + right) / 2;
    const boxPadding = 6 * dpr;
    const boxHeight = 20 * dpr;

    // Target label (top)
    const targetPrice = drawing.getTargetPrice();
    const profitPercent = drawing.getProfitPercent();
    const profitAmount = drawing.getProfitAmount();
    const targetText = `Target: ${targetPrice.toFixed(2)} (${profitPercent.toFixed(3)}%), Amount: ${profitAmount.toFixed(2)}`;

    const targetTextWidth = ctx.measureText(targetText).width + boxPadding * 2;
    const targetLabelY = targetY - boxHeight / 2 - 5 * dpr;

    // Target label background
    ctx.fillStyle = '#26a69a';
    ctx.beginPath();
    ctx.roundRect(centerX - targetTextWidth / 2, targetLabelY - boxHeight / 2, targetTextWidth, boxHeight, 4 * dpr);
    ctx.fill();

    // Target label text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(targetText, centerX, targetLabelY);

    // Stop label (bottom)
    const stopPrice = drawing.getStopPrice();
    const lossPercent = drawing.getLossPercent();
    const lossAmount = drawing.getLossAmount();
    const stopText = `Stop: ${stopPrice.toFixed(2)} (${lossPercent.toFixed(3)}%), Amount: ${lossAmount.toFixed(2)}`;

    const stopTextWidth = ctx.measureText(stopText).width + boxPadding * 2;
    const stopLabelY = stopY + boxHeight / 2 + 5 * dpr;

    // Stop label background
    ctx.fillStyle = '#ef5350';
    ctx.beginPath();
    ctx.roundRect(centerX - stopTextWidth / 2, stopLabelY - boxHeight / 2, stopTextWidth, boxHeight, 4 * dpr);
    ctx.fill();

    // Stop label text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(stopText, centerX, stopLabelY);

    // Entry label (middle)
    const riskReward = drawing.getRiskRewardRatio();
    const quantity = drawing.quantity;
    const entryText = `Open P&L: 0.00, Qty: ${quantity}`;
    const rrText = `Risk/Reward Ratio: ${riskReward.toFixed(2)}`;

    const entryTextWidth = Math.max(
        ctx.measureText(entryText).width,
        ctx.measureText(rrText).width
    ) + boxPadding * 2;
    const entryBoxHeight = 36 * dpr;

    // Entry label background
    ctx.fillStyle = 'rgba(38, 166, 154, 0.9)';
    ctx.beginPath();
    ctx.roundRect(centerX - entryTextWidth / 2, entryY - entryBoxHeight / 2, entryTextWidth, entryBoxHeight, 4 * dpr);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();

    // Entry label text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(entryText, centerX, entryY - 8 * dpr);
    ctx.fillText(rrText, centerX, entryY + 8 * dpr);

    // Control points
    if (showControlPoints || drawing.state === 'selected') {
        const controlPointRadius = 5 * dpr;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#2962ff';
        ctx.lineWidth = 2 * dpr;

        // Entry left control point
        ctx.beginPath();
        ctx.rect(left - controlPointRadius, entryY - controlPointRadius, controlPointRadius * 2, controlPointRadius * 2);
        ctx.fill();
        ctx.stroke();

        // Entry right control point
        ctx.beginPath();
        ctx.rect(right - controlPointRadius, entryY - controlPointRadius, controlPointRadius * 2, controlPointRadius * 2);
        ctx.fill();
        ctx.stroke();

        // Target control point (top-left)
        ctx.beginPath();
        ctx.rect(left - controlPointRadius, targetY - controlPointRadius, controlPointRadius * 2, controlPointRadius * 2);
        ctx.fill();
        ctx.stroke();

        // Stop control point (bottom-left)
        ctx.beginPath();
        ctx.rect(left - controlPointRadius, stopY - controlPointRadius, controlPointRadius * 2, controlPointRadius * 2);
        ctx.fill();
        ctx.stroke();
    }

    ctx.restore();
}

/**
 * Draw a short position projection
 */
export function drawShortPosition(
    ctx: CanvasRenderingContext2D,
    drawing: ShortPositionDrawing,
    dpr: number,
    showControlPoints: boolean
): void {
    const pixelPoints = drawing.getPixelPoints();
    if (pixelPoints.length < 2) return;

    const left = Math.min(pixelPoints[0].x, pixelPoints[1].x);
    const right = Math.max(pixelPoints[0].x, pixelPoints[1].x);
    const entryY = drawing.getEntryY();
    const targetY = drawing.getTargetY();
    const stopY = drawing.getStopY();

    // Skip if not properly initialized
    if (entryY === 0 && targetY === 0 && stopY === 0) return;

    ctx.save();

    // For short: profit zone is below entry (green), loss zone is above (red)
    // Draw loss zone (stop to entry) - above entry for short
    ctx.fillStyle = drawing.lossColor;
    ctx.fillRect(left, stopY, right - left, entryY - stopY);
    ctx.strokeStyle = '#ef5350';
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(left, stopY, right - left, entryY - stopY);

    // Draw profit zone (entry to target) - below entry for short
    ctx.fillStyle = drawing.profitColor;
    ctx.fillRect(left, entryY, right - left, targetY - entryY);
    ctx.strokeStyle = '#26a69a';
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(left, entryY, right - left, targetY - entryY);

    // Draw entry line
    ctx.beginPath();
    ctx.strokeStyle = '#ef5350';
    ctx.lineWidth = 2 * dpr;
    ctx.moveTo(left, entryY);
    ctx.lineTo(right, entryY);
    ctx.stroke();

    // Draw labels
    ctx.font = `bold ${11 * dpr}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const centerX = (left + right) / 2;
    const boxPadding = 6 * dpr;
    const boxHeight = 20 * dpr;

    // Stop label (top for short)
    const stopPrice = drawing.getStopPrice();
    const lossPercent = drawing.getLossPercent();
    const lossAmount = drawing.getLossAmount();
    const stopText = `Stop: ${stopPrice.toFixed(2)} (${lossPercent.toFixed(3)}%), Amount: ${lossAmount.toFixed(2)}`;

    const stopTextWidth = ctx.measureText(stopText).width + boxPadding * 2;
    const stopLabelY = stopY - boxHeight / 2 - 5 * dpr;

    ctx.fillStyle = '#ef5350';
    ctx.beginPath();
    ctx.roundRect(centerX - stopTextWidth / 2, stopLabelY - boxHeight / 2, stopTextWidth, boxHeight, 4 * dpr);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(stopText, centerX, stopLabelY);

    // Target label (bottom for short)
    const targetPrice = drawing.getTargetPrice();
    const profitPercent = drawing.getProfitPercent();
    const profitAmount = drawing.getProfitAmount();
    const targetText = `Target: ${targetPrice.toFixed(2)} (${profitPercent.toFixed(3)}%), Amount: ${profitAmount.toFixed(2)}`;

    const targetTextWidth = ctx.measureText(targetText).width + boxPadding * 2;
    const targetLabelY = targetY + boxHeight / 2 + 5 * dpr;

    ctx.fillStyle = '#26a69a';
    ctx.beginPath();
    ctx.roundRect(centerX - targetTextWidth / 2, targetLabelY - boxHeight / 2, targetTextWidth, boxHeight, 4 * dpr);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(targetText, centerX, targetLabelY);

    // Entry label (middle)
    const quantity = drawing.quantity;
    const riskReward = drawing.getRiskRewardRatio();
    const entryText = `Open P&L: 0.00, Qty: ${quantity}`;
    const rrText = `Risk/Reward Ratio: ${riskReward.toFixed(2)}`;

    const entryTextWidth = Math.max(
        ctx.measureText(entryText).width,
        ctx.measureText(rrText).width
    ) + boxPadding * 2;
    const entryBoxHeight = 36 * dpr;

    ctx.fillStyle = 'rgba(239, 83, 80, 0.9)';
    ctx.beginPath();
    ctx.roundRect(centerX - entryTextWidth / 2, entryY - entryBoxHeight / 2, entryTextWidth, entryBoxHeight, 4 * dpr);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(entryText, centerX, entryY - 8 * dpr);
    ctx.fillText(rrText, centerX, entryY + 8 * dpr);

    // Control points
    if (showControlPoints || drawing.state === 'selected') {
        const controlPointRadius = 5 * dpr;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#2962ff';
        ctx.lineWidth = 2 * dpr;

        // Entry left control point
        ctx.beginPath();
        ctx.rect(left - controlPointRadius, entryY - controlPointRadius, controlPointRadius * 2, controlPointRadius * 2);
        ctx.fill();
        ctx.stroke();

        // Entry right control point
        ctx.beginPath();
        ctx.rect(right - controlPointRadius, entryY - controlPointRadius, controlPointRadius * 2, controlPointRadius * 2);
        ctx.fill();
        ctx.stroke();

        // Stop control point (top-left for short)
        ctx.beginPath();
        ctx.rect(left - controlPointRadius, stopY - controlPointRadius, controlPointRadius * 2, controlPointRadius * 2);
        ctx.fill();
        ctx.stroke();

        // Target control point (bottom-left for short)
        ctx.beginPath();
        ctx.rect(left - controlPointRadius, targetY - controlPointRadius, controlPointRadius * 2, controlPointRadius * 2);
        ctx.fill();
        ctx.stroke();
    }

    ctx.restore();
}
