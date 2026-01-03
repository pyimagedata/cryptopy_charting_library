/**
 * Pattern Drawing Renderer
 * Renders pattern drawings: XABCD, Elliott, ABCD, Triangle, Head & Shoulders, Three Drives
 */

import {
    XABCDPatternDrawing,
    ElliottImpulseDrawing,
    ElliottCorrectionDrawing,
    ThreeDrivesDrawing,
    HeadShouldersDrawing,
    ABCDPatternDrawing,
    TrianglePatternDrawing
} from '../../../drawings';

export type PatternDrawing =
    | XABCDPatternDrawing
    | ElliottImpulseDrawing
    | ElliottCorrectionDrawing
    | ThreeDrivesDrawing
    | HeadShouldersDrawing
    | ABCDPatternDrawing
    | TrianglePatternDrawing;

/**
 * Draw pattern wave (XABCD, Elliott, ABCD, Triangle, Head & Shoulders, Three Drives)
 */
export function drawPatternWave(
    ctx: CanvasRenderingContext2D,
    drawing: PatternDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    showControlPoints: boolean,
    labels: string[]
): void {
    if (pixelPoints.length < 2) return;

    // Draw fills: XAB triangle and BCD triangle (NOT for headShoulders - it has custom fills)
    if (drawing.style.fillColor && drawing.type !== 'headShoulders') {
        ctx.fillStyle = drawing.style.fillColor;

        // Fill XAB triangle (X, A, B)
        if (pixelPoints.length >= 3) {
            ctx.beginPath();
            ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y); // X
            ctx.lineTo(pixelPoints[1].x, pixelPoints[1].y); // A
            ctx.lineTo(pixelPoints[2].x, pixelPoints[2].y); // B
            ctx.closePath();
            ctx.fill();
        }

        // Fill BCD triangle (B, C, D)
        if (pixelPoints.length >= 5) {
            ctx.beginPath();
            ctx.moveTo(pixelPoints[2].x, pixelPoints[2].y); // B
            ctx.lineTo(pixelPoints[3].x, pixelPoints[3].y); // C
            ctx.lineTo(pixelPoints[4].x, pixelPoints[4].y); // D
            ctx.closePath();
            ctx.fill();
        }
    }

    // Draw lines: X-A, A-B, B-C, C-D
    ctx.beginPath();
    ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);
    for (let i = 1; i < pixelPoints.length; i++) {
        ctx.lineTo(pixelPoints[i].x, pixelPoints[i].y);
    }
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = drawing.style.lineWidth * dpr;
    ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw X-B, A-C, B-D, X-D connecting lines (dashed) - ONLY for XABCD pattern
    if (drawing.type === 'xabcdPattern' && pixelPoints.length >= 3) {
        drawXABCDConnectingLines(ctx, pixelPoints, drawing.style.color, dpr);
    }

    // Draw dashed connecting lines for Three Drives (valleys: points 1, 3, 5)
    if (drawing.type === 'threeDrives' && pixelPoints.length >= 4) {
        drawThreeDrivesConnectingLines(ctx, pixelPoints, drawing.style.color, dpr);
    }

    // Draw ABCD pattern: dashed diagonal lines A-C and B-D with Fibonacci ratios
    if (drawing.type === 'abcd' && pixelPoints.length >= 3) {
        drawABCDPattern(ctx, drawing as ABCDPatternDrawing, pixelPoints, dpr);
    }

    // Draw Triangle Pattern: converging trendlines with fill
    if (drawing.type === 'trianglePattern' && pixelPoints.length >= 3) {
        drawTrianglePattern(ctx, drawing as TrianglePatternDrawing, pixelPoints, dpr);
    }

    // Draw Head and Shoulders pattern
    if (drawing.type === 'headShoulders' && pixelPoints.length >= 2) {
        drawHeadAndShoulders(ctx, drawing as HeadShouldersDrawing, pixelPoints, dpr);
    }

    // Draw control points (only when selected/creating)
    if (showControlPoints) {
        drawControlPoints(ctx, pixelPoints, drawing.style.color, dpr);
    }

    // Always draw labels
    drawLabels(ctx, pixelPoints, labels, drawing.style.color, dpr);
}

// ============================================================================
// XABCD Pattern
// ============================================================================

function drawXABCDConnectingLines(
    ctx: CanvasRenderingContext2D,
    pixelPoints: { x: number; y: number }[],
    color: string,
    dpr: number
): void {
    ctx.beginPath();
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 * dpr;

    // X-B line
    ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);
    ctx.lineTo(pixelPoints[2].x, pixelPoints[2].y);

    // A-C line (if exists)
    if (pixelPoints.length >= 4) {
        ctx.moveTo(pixelPoints[1].x, pixelPoints[1].y);
        ctx.lineTo(pixelPoints[3].x, pixelPoints[3].y);
    }

    // B-D line (if exists)
    if (pixelPoints.length >= 5) {
        ctx.moveTo(pixelPoints[2].x, pixelPoints[2].y);
        ctx.lineTo(pixelPoints[4].x, pixelPoints[4].y);

        // X-D line
        ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);
        ctx.lineTo(pixelPoints[4].x, pixelPoints[4].y);
    }

    ctx.stroke();
    ctx.setLineDash([]);
}

// ============================================================================
// Three Drives Pattern
// ============================================================================

function drawThreeDrivesConnectingLines(
    ctx: CanvasRenderingContext2D,
    pixelPoints: { x: number; y: number }[],
    color: string,
    dpr: number
): void {
    ctx.beginPath();
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 * dpr;

    // Connect valleys: point 1 → point 3 (indices 1 and 3)
    if (pixelPoints.length >= 4) {
        ctx.moveTo(pixelPoints[1].x, pixelPoints[1].y);
        ctx.lineTo(pixelPoints[3].x, pixelPoints[3].y);
    }

    // Connect valleys: point 3 → point 5 (indices 3 and 5)
    if (pixelPoints.length >= 6) {
        ctx.moveTo(pixelPoints[3].x, pixelPoints[3].y);
        ctx.lineTo(pixelPoints[5].x, pixelPoints[5].y);
    }

    ctx.stroke();
    ctx.setLineDash([]);
}

// ============================================================================
// ABCD Pattern
// ============================================================================

function drawABCDPattern(
    ctx: CanvasRenderingContext2D,
    drawing: ABCDPatternDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number
): void {
    ctx.beginPath();
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = 1 * dpr;

    // A-C dashed line (indices 0 and 2)
    ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);
    ctx.lineTo(pixelPoints[2].x, pixelPoints[2].y);

    // B-D dashed line (indices 1 and 3)
    if (pixelPoints.length >= 4) {
        ctx.moveTo(pixelPoints[1].x, pixelPoints[1].y);
        ctx.lineTo(pixelPoints[3].x, pixelPoints[3].y);
    }

    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Fibonacci ratio labels
    ctx.font = `bold ${11 * dpr}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // BC/AB ratio on A-C line
    const bcRatio = drawing.getBCRatio();
    if (bcRatio !== null && pixelPoints.length >= 3) {
        const labelX = (pixelPoints[0].x + pixelPoints[2].x) / 2;
        const labelY = (pixelPoints[0].y + pixelPoints[2].y) / 2 - 15 * dpr;

        // Draw background
        const ratioText = bcRatio.toFixed(3);
        const textWidth = ctx.measureText(ratioText).width;
        ctx.fillStyle = drawing.style.color;
        ctx.fillRect(labelX - textWidth / 2 - 4 * dpr, labelY - 8 * dpr, textWidth + 8 * dpr, 16 * dpr);

        // Draw text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(ratioText, labelX, labelY);
    }

    // CD/BC ratio on B-D line
    const cdRatio = drawing.getCDRatio();
    if (cdRatio !== null && pixelPoints.length >= 4) {
        const labelX = (pixelPoints[1].x + pixelPoints[3].x) / 2;
        const labelY = (pixelPoints[1].y + pixelPoints[3].y) / 2 - 15 * dpr;

        // Draw background
        const ratioText = cdRatio.toFixed(3);
        const textWidth = ctx.measureText(ratioText).width;
        ctx.fillStyle = drawing.style.color;
        ctx.fillRect(labelX - textWidth / 2 - 4 * dpr, labelY - 8 * dpr, textWidth + 8 * dpr, 16 * dpr);

        // Draw text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(ratioText, labelX, labelY);
    }
}

// ============================================================================
// Triangle Pattern
// ============================================================================

function drawTrianglePattern(
    ctx: CanvasRenderingContext2D,
    drawing: TrianglePatternDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number
): void {
    // Calculate apex point (where trendlines converge)
    let apexX: number | null = null;
    let apexY: number | null = null;

    if (pixelPoints.length >= 4) {
        const A = pixelPoints[0];
        const B = pixelPoints[1];
        const C = pixelPoints[2];
        const D = pixelPoints[3];

        // Top trendline: through B and D
        const topSlope = (D.y - B.y) / (D.x - B.x);
        // Bottom trendline: through A and C
        const bottomSlope = (C.y - A.y) / (C.x - A.x);

        // Calculate intersection (apex)
        if (Math.abs(topSlope - bottomSlope) > 0.0001) {
            apexX = (-bottomSlope * A.x + A.y + topSlope * B.x - B.y) / (topSlope - bottomSlope);
            apexY = A.y + bottomSlope * (apexX - A.x);
        }
    }

    // Draw filled triangle area
    if (drawing.style.fillColor) {
        ctx.beginPath();
        ctx.fillStyle = drawing.style.fillColor;

        if (pixelPoints.length >= 4 && apexX !== null && apexY !== null) {
            const A = pixelPoints[0];
            const B = pixelPoints[1];
            const D = pixelPoints[3];

            // Top edge: from vertical start above A, through B and D to apex
            const topSlope = (D.y - B.y) / (D.x - B.x);
            const topStartY = B.y - topSlope * (B.x - A.x);

            ctx.moveTo(A.x, topStartY);
            ctx.lineTo(apexX, apexY);
            ctx.lineTo(A.x, A.y);
            ctx.closePath();
            ctx.fill();
        } else if (pixelPoints.length >= 3) {
            ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);
            ctx.lineTo(pixelPoints[1].x, pixelPoints[1].y);
            ctx.lineTo(pixelPoints[2].x, pixelPoints[2].y);
            ctx.closePath();
            ctx.fill();
        }
    }

    // Draw dashed trendlines
    ctx.beginPath();
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = 1 * dpr;

    if (pixelPoints.length >= 4 && apexX !== null && apexY !== null) {
        const A = pixelPoints[0];
        const B = pixelPoints[1];
        const D = pixelPoints[3];

        // Top trendline
        const topSlope = (D.y - B.y) / (D.x - B.x);
        const topStartY = B.y - topSlope * (B.x - A.x);
        ctx.moveTo(A.x, topStartY);
        ctx.lineTo(apexX, apexY);

        // Bottom trendline
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(apexX, apexY);
    } else if (pixelPoints.length >= 3) {
        const A = pixelPoints[0];
        const B = pixelPoints[1];
        const C = pixelPoints[2];

        const topStartY = B.y - (B.x - A.x) * 0.3;
        ctx.moveTo(A.x, topStartY);
        ctx.lineTo(B.x + (B.x - A.x), B.y + (B.y - topStartY) * 0.5);

        ctx.moveTo(A.x, A.y);
        ctx.lineTo(C.x + (C.x - A.x) * 0.5, C.y + (C.y - A.y) * 0.5);
    }

    ctx.stroke();
    ctx.setLineDash([]);
}

// ============================================================================
// Head and Shoulders Pattern
// ============================================================================

function drawHeadAndShoulders(
    ctx: CanvasRenderingContext2D,
    drawing: HeadShouldersDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number
): void {
    ctx.fillStyle = drawing.style.fillColor || 'rgba(206, 147, 216, 0.4)';

    // Calculate neckline slope from P2 to P4 (when available)
    let necklineSlope = 0;
    if (pixelPoints.length >= 5) {
        const dx = pixelPoints[4].x - pixelPoints[2].x;
        if (dx !== 0) {
            necklineSlope = (pixelPoints[4].y - pixelPoints[2].y) / dx;
        }
    } else if (pixelPoints.length >= 3) {
        const dx = pixelPoints[2].x - pixelPoints[0].x;
        if (dx !== 0) {
            necklineSlope = (pixelPoints[2].y - pixelPoints[0].y) / dx;
        }
    }

    // Helper: calculate Y on neckline at given X (based on P2)
    const calcNecklineY = (targetX: number): number => {
        if (pixelPoints.length >= 3) {
            return pixelPoints[2].y + necklineSlope * (targetX - pixelPoints[2].x);
        }
        return pixelPoints[0].y;
    };

    // LEFT SHOULDER FILL + HEAD FILL: Preview starts after P3 (5+ points)
    if (pixelPoints.length >= 5) {
        const p0 = pixelPoints[0];
        const p1 = pixelPoints[1];
        const p2 = pixelPoints[2];

        const lineSlope = (p1.y - p0.y) / (p1.x - p0.x);
        const slopeDiff = lineSlope - necklineSlope;
        let lsLeftX: number, lsLeftY: number;
        if (Math.abs(slopeDiff) > 0.0001) {
            lsLeftX = (-necklineSlope * p2.x + p2.y + lineSlope * p0.x - p0.y) / slopeDiff;
            lsLeftY = calcNecklineY(lsLeftX);
        } else {
            lsLeftX = p1.x - (p2.x - p1.x) * 0.5;
            lsLeftY = calcNecklineY(lsLeftX);
        }

        ctx.beginPath();
        ctx.moveTo(lsLeftX, lsLeftY);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.fill();

        // HEAD FILL: P2-P3-P4
        ctx.beginPath();
        ctx.moveTo(pixelPoints[2].x, pixelPoints[2].y);
        ctx.lineTo(pixelPoints[3].x, pixelPoints[3].y);
        ctx.lineTo(pixelPoints[4].x, pixelPoints[4].y);
        ctx.closePath();
        ctx.fill();
    }

    // RIGHT SHOULDER FILL
    if (pixelPoints.length >= 6) {
        const p4 = pixelPoints[4];
        const p5 = pixelPoints[5];

        let rsRightX: number, rsRightY: number;

        if (pixelPoints.length >= 7) {
            const p6 = pixelPoints[6];
            const lineSlope = (p6.y - p5.y) / (p6.x - p5.x);
            const slopeDiff = lineSlope - necklineSlope;
            if (Math.abs(slopeDiff) > 0.0001) {
                rsRightX = (-necklineSlope * p4.x + p4.y + lineSlope * p5.x - p5.y) / slopeDiff;
                rsRightY = calcNecklineY(rsRightX);
            } else {
                rsRightX = p5.x + (p5.x - p4.x) * 0.5;
                rsRightY = calcNecklineY(rsRightX);
            }
        } else {
            rsRightX = p5.x + (p5.x - p4.x) * 0.5;
            rsRightY = calcNecklineY(rsRightX);
        }

        ctx.beginPath();
        ctx.moveTo(p4.x, p4.y);
        ctx.lineTo(p5.x, p5.y);
        ctx.lineTo(rsRightX, rsRightY);
        ctx.closePath();
        ctx.fill();
    }

    // Draw dashed neckline
    if (pixelPoints.length >= 5) {
        ctx.beginPath();
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = 1 * dpr;

        const p0 = pixelPoints[0];
        const p1 = pixelPoints[1];
        const p2 = pixelPoints[2];
        const lineSlope01 = (p1.y - p0.y) / (p1.x - p0.x);
        const slopeDiff01 = lineSlope01 - necklineSlope;
        let neckStartX: number, neckStartY: number;
        if (Math.abs(slopeDiff01) > 0.0001) {
            neckStartX = (-necklineSlope * p2.x + p2.y + lineSlope01 * p0.x - p0.y) / slopeDiff01;
            neckStartY = calcNecklineY(neckStartX);
        } else {
            neckStartX = p1.x - (p2.x - p1.x) * 0.5;
            neckStartY = calcNecklineY(neckStartX);
        }

        let neckEndX: number, neckEndY: number;
        if (pixelPoints.length >= 7) {
            const p4 = pixelPoints[4];
            const p5 = pixelPoints[5];
            const p6 = pixelPoints[6];
            const lineSlope56 = (p6.y - p5.y) / (p6.x - p5.x);
            const slopeDiff56 = lineSlope56 - necklineSlope;
            if (Math.abs(slopeDiff56) > 0.0001) {
                neckEndX = (-necklineSlope * p4.x + p4.y + lineSlope56 * p5.x - p5.y) / slopeDiff56;
                neckEndY = calcNecklineY(neckEndX);
            } else {
                neckEndX = p5.x + (p5.x - p4.x) * 0.5;
                neckEndY = calcNecklineY(neckEndX);
            }
        } else if (pixelPoints.length >= 6) {
            const p4 = pixelPoints[4];
            const p5 = pixelPoints[5];
            neckEndX = p5.x + (p5.x - p4.x) * 0.5;
            neckEndY = calcNecklineY(neckEndX);
        } else {
            neckEndX = pixelPoints[4].x + (pixelPoints[4].x - p2.x) * 0.5;
            neckEndY = calcNecklineY(neckEndX);
        }

        ctx.moveTo(neckStartX, neckStartY);
        ctx.lineTo(neckEndX, neckEndY);

        ctx.stroke();
        ctx.setLineDash([]);
    }
}

// ============================================================================
// Common Drawing Functions
// ============================================================================

function drawControlPoints(
    ctx: CanvasRenderingContext2D,
    pixelPoints: { x: number; y: number }[],
    color: string,
    dpr: number
): void {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * dpr;

    for (let i = 0; i < pixelPoints.length; i++) {
        const point = pixelPoints[i];

        // Draw circle
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw center dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
    }
}

function drawLabels(
    ctx: CanvasRenderingContext2D,
    pixelPoints: { x: number; y: number }[],
    labels: string[],
    color: string,
    dpr: number
): void {
    for (let i = 0; i < pixelPoints.length; i++) {
        const point = pixelPoints[i];
        const label = labels[i] || String(i);
        ctx.font = `bold ${12 * dpr}px Arial`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';

        // Determine if this point is a local peak or valley
        let isValley = false;

        if (pixelPoints.length >= 2) {
            const prevY = i > 0 ? pixelPoints[i - 1].y : point.y;
            const nextY = i < pixelPoints.length - 1 ? pixelPoints[i + 1].y : point.y;
            isValley = point.y > prevY || point.y > nextY;
        }

        if (isValley) {
            ctx.textBaseline = 'top';
            ctx.fillText(label, point.x, point.y + 8 * dpr);
        } else {
            ctx.textBaseline = 'bottom';
            ctx.fillText(label, point.x, point.y - 8 * dpr);
        }
    }
}
