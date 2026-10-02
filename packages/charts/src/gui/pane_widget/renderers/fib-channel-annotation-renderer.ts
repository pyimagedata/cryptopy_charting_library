/**
 * Fibonacci, Channel, and Annotation Drawing Renderers
 * Contains renderers for: FibRetracement, FibExtension, FibChannel,
 * ParallelChannel, RegressionTrend, Brush, ArrowMarker, ArrowIcon, Arrow
 */

import { FibRetracementDrawing } from '../../../drawings/fibonacci-retracement-drawing';
import { FibExtensionDrawing } from '../../../drawings/fibonacci-extension-drawing';
import { FibChannelDrawing } from '../../../drawings/fib-channel-drawing';
import { ParallelChannelDrawing } from '../../../drawings/parallel-channel-drawing';
import { RegressionTrendDrawing } from '../../../drawings/regression-trend-drawing';
import { BrushDrawing } from '../../../drawings/brush-drawing';
import { ArrowMarkerDrawing } from '../../../drawings/arrow-marker-drawing';
import { ArrowIconDrawing } from '../../../drawings/arrow-icon-drawing';
import { ArrowDrawing } from '../../../drawings/arrow-drawing';
import { hexToRgba } from './utils';
import { FibCommonSettings, lineDashFor } from '../../../drawings/fib-common';

type FibLevelRow = { level: number; color: string; price: number; y: number };

/** Fiyat buyuklugune gore ondalik: forex 5, metal/endeks 2. */
function formatFibPrice(price: number): string {
    const abs = Math.abs(price);
    const digits = abs < 10 ? 5 : abs < 100 ? 3 : 2;
    return price.toFixed(digits);
}

function drawControlPoints(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], color: string, dpr: number): void {
    for (const p of points) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawFibTrendLine(
    ctx: CanvasRenderingContext2D,
    drawing: { fib: FibCommonSettings; style: { color: string } },
    points: { x: number; y: number }[],
    dpr: number,
): void {
    if (!drawing.fib.trendLineVisible || points.length < 2) return;
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = (drawing.fib.trendLineWidth || 1) * dpr;
    ctx.setLineDash(lineDashFor(drawing.fib.trendLineStyle, dpr));
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
}

/**
 * Yatay Fib seviyeleri (duzeltme ve trend bazli uzatma ortak): dolgu, cizgiler,
 * etiketler. xA/xB seviyelerin yatay araligi (uzatma secenekleriyle genisler).
 */
function drawHorizontalFibLevels(
    ctx: CanvasRenderingContext2D,
    drawing: { fib: FibCommonSettings; style: { lineWidth: number; lineDash?: number[] }; opacity?: number; backgroundOpacity?: number },
    levelData: FibLevelRow[],
    xA: number,
    xB: number,
    canvasWidth: number,
    dpr: number,
): void {
    const fib = drawing.fib;
    const left = fib.extendLeft ? 0 : Math.min(xA, xB);
    const right = fib.extendRight ? canvasWidth : Math.max(xA, xB);
    const opacity = drawing.opacity ?? 0.8;

    if (fib.fillBackground) {
        const bgOpacity = drawing.backgroundOpacity ?? 0.1;
        for (let i = 0; i < levelData.length - 1; i++) {
            const y1 = levelData[i].y;
            const y2 = levelData[i + 1].y;
            ctx.fillStyle = hexToRgba(levelData[i + 1].color, bgOpacity);
            ctx.fillRect(left, Math.min(y1, y2), right - left, Math.abs(y2 - y1));
        }
    }

    ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
    ctx.lineWidth = drawing.style.lineWidth * dpr;
    for (const level of levelData) {
        const color = hexToRgba(level.color, opacity);
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(left, level.y);
        ctx.lineTo(right, level.y);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const level of levelData) {
        const text = fib.labelText(level.level, level.price, formatFibPrice);
        fib.drawLabel(ctx, text, level.color, left, level.y, right, level.y, dpr);
    }
}

/**
 * Draws Fibonacci Retracement levels
 */
export function drawFibRetracement(
    ctx: CanvasRenderingContext2D,
    drawing: FibRetracementDrawing,
    pixelPoints: { x: number; y: number }[],
    canvasWidth: number,
    dpr: number,
    isSelected: boolean
): void {
    if (pixelPoints.length < 2) return;
    drawHorizontalFibLevels(ctx, drawing, drawing.getLevelData(), pixelPoints[0].x, pixelPoints[1].x, canvasWidth, dpr);
    drawFibTrendLine(ctx, drawing, [pixelPoints[0], pixelPoints[1]], dpr);
    if (isSelected) drawControlPoints(ctx, pixelPoints, drawing.style.color, dpr);
}

/**
 * Draws Fibonacci Extension levels (seviyeler B..C araliginda, C'den A->B kadar)
 */
export function drawFibExtension(
    ctx: CanvasRenderingContext2D,
    drawing: FibExtensionDrawing,
    pixelPoints: { x: number; y: number }[],
    canvasWidth: number,
    dpr: number,
    isSelected: boolean
): void {
    if (pixelPoints.length < 2) return;
    const pB = pixelPoints[1];
    const pC = pixelPoints.length > 2 ? pixelPoints[2] : pB;
    drawHorizontalFibLevels(ctx, drawing, drawing.getLevelData(), pB.x, pC.x, canvasWidth, dpr);
    drawFibTrendLine(ctx, drawing, pixelPoints.slice(0, 3), dpr);
    if (isSelected) drawControlPoints(ctx, pixelPoints, drawing.style.color, dpr);
}

/**
 * Draws Fibonacci Channel
 */
export function drawFibChannel(
    ctx: CanvasRenderingContext2D,
    drawing: FibChannelDrawing,
    pixelPoints: { x: number; y: number }[],
    _canvasWidth: number,
    dpr: number,
    isSelected: boolean
): void {
    if (pixelPoints.length < 2) return;

    const fib = drawing.fib;
    const levelLines = drawing.getLevelLines();
    const opacity = drawing.opacity ?? 1;

    if (fib.fillBackground) {
        const bgOpacity = drawing.backgroundOpacity ?? 0.05;
        for (let i = 0; i < levelLines.length - 1; i++) {
            const l1 = levelLines[i];
            const l2 = levelLines[i + 1];
            ctx.fillStyle = hexToRgba(l2.color, bgOpacity);
            ctx.beginPath();
            ctx.moveTo(l1.startX * dpr, l1.startY * dpr);
            ctx.lineTo(l1.endX * dpr, l1.endY * dpr);
            ctx.lineTo(l2.endX * dpr, l2.endY * dpr);
            ctx.lineTo(l2.startX * dpr, l2.startY * dpr);
            ctx.closePath();
            ctx.fill();
        }
    }

    ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
    ctx.lineWidth = drawing.style.lineWidth * dpr;
    for (const line of levelLines) {
        ctx.strokeStyle = hexToRgba(line.color, opacity);
        ctx.beginPath();
        ctx.moveTo(line.startX * dpr, line.startY * dpr);
        ctx.lineTo(line.endX * dpr, line.endY * dpr);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const line of levelLines) {
        const text = fib.labelText(line.level, null);
        fib.drawLabel(ctx, text, line.color, line.startX * dpr, line.startY * dpr, line.endX * dpr, line.endY * dpr, dpr);
    }

    drawFibTrendLine(ctx, drawing, pixelPoints.slice(0, 3), dpr);
    if (isSelected) drawControlPoints(ctx, pixelPoints, drawing.style.color, dpr);
}

/**
 * Draws Parallel Channel
 */
export function drawParallelChannel(
    ctx: CanvasRenderingContext2D,
    points: { x: number; y: number }[],
    drawing: ParallelChannelDrawing,
    dpr: number,
    isSelected: boolean,
    canvasWidth: number
): void {
    if (points.length < 2) return;

    const style = drawing.style;
    const p0 = points[0];
    const p1 = points[1];

    // Calculate the offset for the parallel line
    let offsetY = 0;
    if (points.length >= 3) {
        const p2 = points[2];
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const lineLength = Math.sqrt(dx * dx + dy * dy);

        if (lineLength > 0) {
            const baseYAtP2X = p0.y + (dy / dx) * (p2.x - p0.x);
            offsetY = p2.y - baseYAtP2X;
        }
    }

    // Calculate parallel line points
    const parallel0 = { x: p0.x, y: p0.y + offsetY };
    const parallel1 = { x: p1.x, y: p1.y + offsetY };

    // Cache parallel points for hit testing
    drawing.setParallelPixelPoints([parallel0, parallel1].map(p => ({ x: p.x / dpr, y: p.y / dpr })));

    // Calculate extension points
    let baseStart = { ...p0 };
    let baseEnd = { ...p1 };
    let parallelStart = { ...parallel0 };
    let parallelEnd = { ...parallel1 };

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;

    if (drawing.extendLeft && dx !== 0) {
        const slope = dy / dx;
        baseStart.x = 0;
        baseStart.y = p0.y - slope * p0.x;
        parallelStart.x = 0;
        parallelStart.y = parallel0.y - slope * parallel0.x;
    }

    if (drawing.extendRight && dx !== 0) {
        const slope = dy / dx;
        baseEnd.x = canvasWidth;
        baseEnd.y = p1.y + slope * (canvasWidth - p1.x);
        parallelEnd.x = canvasWidth;
        parallelEnd.y = parallel1.y + slope * (canvasWidth - parallel1.x);
    }

    // Draw fill between lines
    if (style.fillColor && (style.fillOpacity ?? 0.1) > 0 && points.length >= 3) {
        ctx.fillStyle = hexToRgba(style.fillColor, style.fillOpacity ?? 0.1);
        ctx.beginPath();
        ctx.moveTo(baseStart.x, baseStart.y);
        ctx.lineTo(baseEnd.x, baseEnd.y);
        ctx.lineTo(parallelEnd.x, parallelEnd.y);
        ctx.lineTo(parallelStart.x, parallelStart.y);
        ctx.closePath();
        ctx.fill();
    }

    // Draw base line
    ctx.beginPath();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineWidth * dpr;
    ctx.setLineDash((style.lineDash || []).map(d => d * dpr));
    ctx.moveTo(baseStart.x, baseStart.y);
    ctx.lineTo(baseEnd.x, baseEnd.y);
    ctx.stroke();

    // Draw parallel line (only if we have 3 points)
    if (points.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(parallelStart.x, parallelStart.y);
        ctx.lineTo(parallelEnd.x, parallelEnd.y);
        ctx.stroke();

        // Draw middle line if enabled
        if (drawing.showMiddleLine) {
            const midStart = {
                x: (baseStart.x + parallelStart.x) / 2,
                y: (baseStart.y + parallelStart.y) / 2
            };
            const midEnd = {
                x: (baseEnd.x + parallelEnd.x) / 2,
                y: (baseEnd.y + parallelEnd.y) / 2
            };
            ctx.beginPath();
            ctx.strokeStyle = style.color;
            ctx.setLineDash([4 * dpr, 4 * dpr]);
            ctx.moveTo(midStart.x, midStart.y);
            ctx.lineTo(midEnd.x, midEnd.y);
            ctx.stroke();
        }
    }

    ctx.setLineDash([]);

    // Draw control points if selected
    if (isSelected) {
        const allPoints = points.length >= 3 ? [p0, p1, points[2]] : [p0, p1];

        ctx.fillStyle = style.color;
        for (const point of allPoints) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = style.color;
        }
    }
}

/**
 * Draws Regression Trend channel
 */
export function drawRegressionTrend(
    ctx: CanvasRenderingContext2D,
    points: { x: number; y: number }[],
    drawing: RegressionTrendDrawing,
    dpr: number,
    isSelected: boolean,
    canvasWidth: number,
    timeToPixel: (time: number) => number | null,
    priceToPixel: (price: number) => number | null,
    mainSeriesData: { time: number; close?: number; value?: number }[]
): void {
    if (points.length < 2) return;

    const style = drawing.style;
    const p0 = points[0];
    const p1 = points[1];

    // Get the logical time range from drawing points
    const startTime = Math.min(drawing.points[0].time, drawing.points[1].time);
    const endTime = Math.max(drawing.points[0].time, drawing.points[1].time);

    // Find bars in the time range
    const barsInRange: { time: number; close: number }[] = [];
    for (const bar of mainSeriesData) {
        if (bar.time >= startTime && bar.time <= endTime) {
            barsInRange.push({
                time: bar.time,
                close: bar.close !== undefined ? bar.close : (bar.value || 0)
            });
        }
    }

    if (barsInRange.length < 2) {
        // Not enough data, just draw a simple line
        ctx.beginPath();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = style.lineWidth * dpr;
        ctx.setLineDash((style.lineDash || []).map(d => d * dpr));
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.setLineDash([]);
        return;
    }

    // Calculate linear regression
    drawing.calculateRegression(barsInRange);
    const { slope, intercept, stdDev } = drawing.getRegressionParams();

    // Calculate regression line Y values
    const endIndex = barsInRange.length - 1;
    const startPrice = intercept;
    const endPrice = slope * endIndex + intercept;

    // Convert to pixel coordinates
    const startY = priceToPixel(startPrice);
    const endY = priceToPixel(endPrice);

    if (startY === null || endY === null) return;

    // Get pixel X positions
    const startX = timeToPixel(barsInRange[0].time);
    const endX = timeToPixel(barsInRange[barsInRange.length - 1].time);

    if (startX === null || endX === null) return;

    // Scale to DPR
    const regStart = { x: startX * dpr, y: startY * dpr };
    const regEnd = { x: endX * dpr, y: endY * dpr };

    // Calculate upper and lower deviation lines
    const deviationOffset = stdDev * drawing.deviationMultiplier;
    const upperStartY = priceToPixel(startPrice + deviationOffset);
    const upperEndY = priceToPixel(endPrice + deviationOffset);
    const lowerStartY = priceToPixel(startPrice - deviationOffset);
    const lowerEndY = priceToPixel(endPrice - deviationOffset);

    if (upperStartY === null || upperEndY === null || lowerStartY === null || lowerEndY === null) return;

    const upperStart = { x: regStart.x, y: upperStartY * dpr };
    const upperEnd = { x: regEnd.x, y: upperEndY * dpr };
    const lowerStart = { x: regStart.x, y: lowerStartY * dpr };
    const lowerEnd = { x: regEnd.x, y: lowerEndY * dpr };

    // Handle extensions
    let extRegStart = { ...regStart };
    let extRegEnd = { ...regEnd };
    let extUpperStart = { ...upperStart };
    let extUpperEnd = { ...upperEnd };
    let extLowerStart = { ...lowerStart };
    let extLowerEnd = { ...lowerEnd };

    if (drawing.extendRight && regEnd.x !== regStart.x) {
        const slopePixel = (regEnd.y - regStart.y) / (regEnd.x - regStart.x);
        const extX = canvasWidth;
        extRegEnd = { x: extX, y: regEnd.y + slopePixel * (extX - regEnd.x) };
        extUpperEnd = { x: extX, y: upperEnd.y + slopePixel * (extX - upperEnd.x) };
        extLowerEnd = { x: extX, y: lowerEnd.y + slopePixel * (extX - lowerEnd.x) };
    }

    if (drawing.extendLeft && regEnd.x !== regStart.x) {
        const slopePixel = (regEnd.y - regStart.y) / (regEnd.x - regStart.x);
        extRegStart = { x: 0, y: regStart.y - slopePixel * regStart.x };
        extUpperStart = { x: 0, y: upperStart.y - slopePixel * upperStart.x };
        extLowerStart = { x: 0, y: lowerStart.y - slopePixel * lowerStart.x };
    }

    // Cache lines for hit testing
    drawing.setRegressionLine({
        start: { x: extRegStart.x / dpr, y: extRegStart.y / dpr },
        end: { x: extRegEnd.x / dpr, y: extRegEnd.y / dpr }
    });
    drawing.setUpperLine({
        start: { x: extUpperStart.x / dpr, y: extUpperStart.y / dpr },
        end: { x: extUpperEnd.x / dpr, y: extUpperEnd.y / dpr }
    });
    drawing.setLowerLine({
        start: { x: extLowerStart.x / dpr, y: extLowerStart.y / dpr },
        end: { x: extLowerEnd.x / dpr, y: extLowerEnd.y / dpr }
    });

    // Draw UPPER fill
    if (style.fillColor && (style.fillOpacity ?? 0.2) > 0) {
        ctx.fillStyle = hexToRgba(style.fillColor, style.fillOpacity ?? 0.2);
        ctx.beginPath();
        ctx.moveTo(extUpperStart.x, extUpperStart.y);
        ctx.lineTo(extUpperEnd.x, extUpperEnd.y);
        ctx.lineTo(extRegEnd.x, extRegEnd.y);
        ctx.lineTo(extRegStart.x, extRegStart.y);
        ctx.closePath();
        ctx.fill();
    }

    // Draw LOWER fill
    if (drawing.lowerFillColor && (style.fillOpacity ?? 0.2) > 0) {
        ctx.fillStyle = hexToRgba(drawing.lowerFillColor, style.fillOpacity ?? 0.2);
        ctx.beginPath();
        ctx.moveTo(extRegStart.x, extRegStart.y);
        ctx.lineTo(extRegEnd.x, extRegEnd.y);
        ctx.lineTo(extLowerEnd.x, extLowerEnd.y);
        ctx.lineTo(extLowerStart.x, extLowerStart.y);
        ctx.closePath();
        ctx.fill();
    }

    // Draw upper deviation line
    if (drawing.showUpperDeviation) {
        ctx.beginPath();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = style.lineWidth * dpr;
        ctx.setLineDash([]);
        ctx.moveTo(extUpperStart.x, extUpperStart.y);
        ctx.lineTo(extUpperEnd.x, extUpperEnd.y);
        ctx.stroke();
    }

    // Draw lower deviation line
    if (drawing.showLowerDeviation) {
        ctx.beginPath();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = style.lineWidth * dpr;
        ctx.setLineDash([]);
        ctx.moveTo(extLowerStart.x, extLowerStart.y);
        ctx.lineTo(extLowerEnd.x, extLowerEnd.y);
        ctx.stroke();
    }

    // Draw regression line (center line) - DASHED
    ctx.beginPath();
    ctx.strokeStyle = drawing.centerLineColor;
    ctx.lineWidth = style.lineWidth * dpr;
    ctx.setLineDash([6 * dpr, 4 * dpr]);
    ctx.moveTo(extRegStart.x, extRegStart.y);
    ctx.lineTo(extRegEnd.x, extRegEnd.y);
    ctx.stroke();

    ctx.setLineDash([]);

    // Draw control points if selected
    if (isSelected) {
        ctx.fillStyle = style.color;
        for (const point of [p0, p1]) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = style.color;
        }
    }
}

/**
 * Draws brush strokes
 */
export function drawBrush(
    ctx: CanvasRenderingContext2D,
    drawing: BrushDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    isSelected: boolean
): void {
    if (pixelPoints.length < 2) return;

    const style = drawing.style;
    const opacity = drawing.opacity ?? 1.0;

    // Filter points to remove jitter
    const minDistance = 3 * dpr;
    const filteredPoints: { x: number; y: number }[] = [pixelPoints[0]];

    for (let i = 1; i < pixelPoints.length; i++) {
        const lastFiltered = filteredPoints[filteredPoints.length - 1];
        const current = pixelPoints[i];
        const dx = current.x - lastFiltered.x;
        const dy = current.y - lastFiltered.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance >= minDistance) {
            filteredPoints.push(current);
        }
    }

    // Always include the last point
    if (filteredPoints.length > 0 && pixelPoints.length > 0) {
        const lastPoint = pixelPoints[pixelPoints.length - 1];
        const lastFiltered = filteredPoints[filteredPoints.length - 1];
        if (lastPoint.x !== lastFiltered.x || lastPoint.y !== lastFiltered.y) {
            filteredPoints.push(lastPoint);
        }
    }

    if (filteredPoints.length < 2) return;

    // Draw the brush path
    ctx.strokeStyle = hexToRgba(style.color, opacity);
    ctx.lineWidth = style.lineWidth * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash((style.lineDash || []).map(d => d * dpr));

    ctx.beginPath();
    ctx.moveTo(filteredPoints[0].x, filteredPoints[0].y);

    // Use quadratic curves for smoother drawing
    if (drawing.smooth && filteredPoints.length > 2) {
        for (let i = 1; i < filteredPoints.length - 1; i++) {
            const xc = (filteredPoints[i].x + filteredPoints[i + 1].x) / 2;
            const yc = (filteredPoints[i].y + filteredPoints[i + 1].y) / 2;
            ctx.quadraticCurveTo(filteredPoints[i].x, filteredPoints[i].y, xc, yc);
        }
        const lastPoint = filteredPoints[filteredPoints.length - 1];
        ctx.lineTo(lastPoint.x, lastPoint.y);
    } else {
        for (let i = 1; i < filteredPoints.length; i++) {
            ctx.lineTo(filteredPoints[i].x, filteredPoints[i].y);
        }
    }

    ctx.stroke();
    ctx.setLineDash([]);

    // Draw control points when selected
    if (isSelected && pixelPoints.length >= 2) {
        ctx.fillStyle = style.color;
        const endpoints = [pixelPoints[0], pixelPoints[pixelPoints.length - 1]];
        for (const p of endpoints) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = style.color;
        }
    }
}

/**
 * Draws arrow marker (filled arrow shape)
 */
export function drawArrowMarker(
    ctx: CanvasRenderingContext2D,
    drawing: ArrowMarkerDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    isSelected: boolean
): void {
    if (pixelPoints.length < 2) return;

    const { style, size } = drawing;
    const p1 = pixelPoints[0];
    const p2 = pixelPoints[1];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);

    const stemWidth = size * dpr;
    const headWidth = stemWidth * 2.5;
    const headLength = Math.min(length * 0.4, stemWidth * 2);

    ctx.fillStyle = style.color;
    ctx.save();
    ctx.translate(p1.x, p1.y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(length - headLength, -stemWidth / 2);
    ctx.lineTo(length - headLength, -headWidth / 2);
    ctx.lineTo(length, 0);
    ctx.lineTo(length - headLength, headWidth / 2);
    ctx.lineTo(length - headLength, stemWidth / 2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Draw selection markers
    if (isSelected) {
        ctx.fillStyle = style.color;
        for (const p of pixelPoints) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = style.color;
        }
    }
}

/**
 * Draws arrow icon (up/down arrow)
 */
export function drawArrowIcon(
    ctx: CanvasRenderingContext2D,
    drawing: ArrowIconDrawing,
    p: { x: number; y: number },
    dpr: number,
    isSelected: boolean
): void {
    const { style, size, type } = drawing;
    const s = size * dpr;
    const halfSize = s / 2;

    ctx.fillStyle = style.color;
    ctx.beginPath();

    if (type === 'arrowMarkedUp') {
        ctx.moveTo(p.x, p.y - halfSize);
        ctx.lineTo(p.x - halfSize, p.y);
        ctx.lineTo(p.x - halfSize / 2, p.y);
        ctx.lineTo(p.x - halfSize / 2, p.y + halfSize);
        ctx.lineTo(p.x + halfSize / 2, p.y + halfSize);
        ctx.lineTo(p.x + halfSize / 2, p.y);
        ctx.lineTo(p.x + halfSize, p.y);
    } else {
        ctx.moveTo(p.x, p.y + halfSize);
        ctx.lineTo(p.x - halfSize, p.y);
        ctx.lineTo(p.x - halfSize / 2, p.y);
        ctx.lineTo(p.x - halfSize / 2, p.y - halfSize);
        ctx.lineTo(p.x + halfSize / 2, p.y - halfSize);
        ctx.lineTo(p.x + halfSize / 2, p.y);
        ctx.lineTo(p.x + halfSize, p.y);
    }

    ctx.closePath();
    ctx.fill();

    if (isSelected) {
        ctx.strokeStyle = style.color;
        ctx.setLineDash([2 * dpr, 2 * dpr]);
        ctx.lineWidth = 1 * dpr;
        ctx.strokeRect(p.x - halfSize - 2 * dpr, p.y - halfSize - 2 * dpr, s + 4 * dpr, s + 4 * dpr);
        ctx.setLineDash([]);

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2 * dpr, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * Draws arrow with line and arrowhead
 */
export function drawArrow(
    ctx: CanvasRenderingContext2D,
    drawing: ArrowDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    isSelected: boolean
): void {
    const { style } = drawing;
    const p1 = pixelPoints[0];
    const p2 = pixelPoints[1];

    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineWidth * dpr;
    ctx.setLineDash((style.lineDash || []).map(d => d * dpr));

    // Draw line
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    ctx.setLineDash([]);

    // Draw arrowhead
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const headLength = 10 * dpr + style.lineWidth * 2 * dpr;
    const headAngle = Math.PI / 7;

    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(
        p2.x - headLength * Math.cos(angle - headAngle),
        p2.y - headLength * Math.sin(angle - headAngle)
    );
    ctx.lineTo(
        p2.x - headLength * Math.cos(angle + headAngle),
        p2.y - headLength * Math.sin(angle + headAngle)
    );
    ctx.closePath();
    ctx.fill();

    // Draw selection markers
    if (isSelected) {
        ctx.fillStyle = style.color;
        for (const p of pixelPoints) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = style.color;
        }
    }
}
