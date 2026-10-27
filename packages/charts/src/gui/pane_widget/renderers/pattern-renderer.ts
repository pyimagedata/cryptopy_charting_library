/**
 * Pattern Drawing Renderer
 * Renders pattern drawings: XABCD, Elliott, ABCD, Triangle, Head & Shoulders, Three Drives
 */

import {
    XABCDPatternDrawing,
    ElliottWaveDrawing,
    ThreeDrivesDrawing,
    HeadShouldersDrawing,
    ABCDPatternDrawing,
    TrianglePatternDrawing,
    shapeFillCss,
    xabcdRatios,
    cypherRatios,
    threeDrivesRatios,
} from '../../../drawings';
import { DrawingStyle } from '../../../drawings/drawing';
import { t } from '../../../helpers/translations';

import { fillWithOpacity } from './utils';

export type PatternDrawing =
    | XABCDPatternDrawing
    | ElliottWaveDrawing
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

    // Elliott: "Wave" kapaliyken yalniz etiketler (ve secimde kontrol noktalari) cizilir
    const waveHidden = drawing instanceof ElliottWaveDrawing && !drawing.showWave;

    // Draw fills: XAB triangle and BCD triangle (NOT for headShoulders or trianglePattern - they have custom fills)
    if (!waveHidden && drawing.style.fillColor && drawing.type !== 'headShoulders' && drawing.type !== 'trianglePattern') {
        // Fill XAB triangle (X, A, B)
        if (pixelPoints.length >= 3) {
            ctx.beginPath();
            ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y); // X
            ctx.lineTo(pixelPoints[1].x, pixelPoints[1].y); // A
            ctx.lineTo(pixelPoints[2].x, pixelPoints[2].y); // B
            ctx.closePath();
            fillPatternPath(ctx, drawing, drawing.style.fillColor);
        }

        // Fill BCD triangle (B, C, D)
        if (pixelPoints.length >= 5) {
            ctx.beginPath();
            ctx.moveTo(pixelPoints[2].x, pixelPoints[2].y); // B
            ctx.lineTo(pixelPoints[3].x, pixelPoints[3].y); // C
            ctx.lineTo(pixelPoints[4].x, pixelPoints[4].y); // D
            ctx.closePath();
            fillPatternPath(ctx, drawing, drawing.style.fillColor);
        }
    }

    // Draw lines: X-A, A-B, B-C, C-D
    if (!waveHidden) {
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
    }

    // Dashed connectors with ratio labels - XABCD (XB, AC, BD, XD) and Cypher (XB, XC, XD)
    if ((drawing.type === 'xabcdPattern' || drawing.type === 'cypherPattern') && pixelPoints.length >= 3) {
        drawHarmonicConnectors(ctx, drawing, pixelPoints, dpr);
    }

    // Draw dashed connecting lines for Three Drives (valleys: points 1, 3, 5)
    if (drawing.type === 'threeDrives' && pixelPoints.length >= 3) {
        drawThreeDrivesConnectingLines(ctx, drawing as ThreeDrivesDrawing, pixelPoints, dpr);
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
    drawLabels(ctx, pixelPoints, labels, drawing.style, dpr);
}

// ============================================================================
// XABCD / Cypher Pattern
// ============================================================================

function drawHarmonicConnectors(
    ctx: CanvasRenderingContext2D,
    drawing: PatternDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number
): void {
    const isCypher = drawing.type === 'cypherPattern';
    // [from index, to index, ratio]
    let connectors: [number, number, number | null][];
    if (isCypher) {
        const r = cypherRatios(drawing.points);
        connectors = [[0, 2, r.xb], [0, 3, r.xc], [0, 4, r.xd]];
    } else {
        const r = xabcdRatios(drawing.points);
        connectors = [[0, 2, r.xb], [1, 3, r.ac], [2, 4, r.bd], [0, 4, r.xd]];
    }
    // Null ratio (undefined/absurd) -> no connector either
    const visible = connectors.filter(([from, to, value]) => to < pixelPoints.length && from < pixelPoints.length && value !== null);

    ctx.beginPath();
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = 1 * dpr;
    for (const [from, to] of visible) {
        ctx.moveTo(pixelPoints[from].x, pixelPoints[from].y);
        ctx.lineTo(pixelPoints[to].x, pixelPoints[to].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    for (const [from, to, value] of visible) {
        if (value === null) continue;
        drawBadge(
            ctx,
            value.toFixed(3),
            (pixelPoints[from].x + pixelPoints[to].x) / 2,
            (pixelPoints[from].y + pixelPoints[to].y) / 2,
            drawing.style,
            dpr
        );
    }
}

// ============================================================================
// Three Drives Pattern
// ============================================================================

/**
 * Ratios (PiPj = price(Pj) - price(Pi), see threeDrivesRatios):
 *  - retracement 1 = |P1P2| / |P0P1|, badge at the middle of segment P1->P2
 *  - retracement 2 = |P3P4| / |P2P3|, badge at the middle of segment P3->P4
 *  - extension 1   = |P2P3| / |P1P2|, badge at the middle of dashed connector P1->P3
 *  - extension 2   = |P4P5| / |P3P4|, badge at the middle of dashed connector P3->P5
 * A dashed connector is skipped when its ratio is null.
 */
function drawThreeDrivesConnectingLines(
    ctx: CanvasRenderingContext2D,
    drawing: ThreeDrivesDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number
): void {
    const r = threeDrivesRatios(drawing.points);
    const n = pixelPoints.length;
    // [from, to, ratio] dashed valley connectors
    const connectors: [number, number, number | null][] = [[1, 3, r.ext1], [3, 5, r.ext2]];
    const visible = connectors.filter(([, to, v]) => to < n && v !== null);

    ctx.beginPath();
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = 1 * dpr;
    for (const [from, to] of visible) {
        ctx.moveTo(pixelPoints[from].x, pixelPoints[from].y);
        ctx.lineTo(pixelPoints[to].x, pixelPoints[to].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const badges: [number, number, number | null][] = [[1, 2, r.retrace1], [3, 4, r.retrace2], ...visible];
    for (const [from, to, value] of badges) {
        if (value === null || to >= n) continue;
        drawBadge(
            ctx,
            value.toFixed(3),
            (pixelPoints[from].x + pixelPoints[to].x) / 2,
            (pixelPoints[from].y + pixelPoints[to].y) / 2,
            drawing.style,
            dpr
        );
    }
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

    // Draw Fibonacci ratio labels (BC/AB on A-C, CD/BC on B-D)
    const bcRatio = drawing.getBCRatio();
    if (bcRatio !== null && pixelPoints.length >= 3) {
        drawBadge(
            ctx,
            bcRatio.toFixed(3),
            (pixelPoints[0].x + pixelPoints[2].x) / 2,
            (pixelPoints[0].y + pixelPoints[2].y) / 2 - 15 * dpr,
            drawing.style,
            dpr
        );
    }

    const cdRatio = drawing.getCDRatio();
    if (cdRatio !== null && pixelPoints.length >= 4) {
        drawBadge(
            ctx,
            cdRatio.toFixed(3),
            (pixelPoints[1].x + pixelPoints[3].x) / 2,
            (pixelPoints[1].y + pixelPoints[3].y) / 2 - 15 * dpr,
            drawing.style,
            dpr
        );
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
    {
        if (pixelPoints.length >= 4 && apexX !== null && apexY !== null) {
            const A = pixelPoints[0];
            const B = pixelPoints[1];
            const D = pixelPoints[3];

            // Top edge: from vertical start above A, through B and D to apex
            const topSlope = (D.y - B.y) / (D.x - B.x);
            const topStartY = B.y - topSlope * (B.x - A.x);

            ctx.beginPath();
            ctx.moveTo(A.x, topStartY);
            ctx.lineTo(apexX, apexY);
            ctx.lineTo(A.x, A.y);
            ctx.closePath();
            fillStylePath(ctx, drawing.style);
        } else if (pixelPoints.length >= 3) {
            ctx.beginPath();
            ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);
            ctx.lineTo(pixelPoints[1].x, pixelPoints[1].y);
            ctx.lineTo(pixelPoints[2].x, pixelPoints[2].y);
            ctx.closePath();
            fillStylePath(ctx, drawing.style);
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
        fillStylePath(ctx, drawing.style);

        // HEAD FILL: P2-P3-P4
        ctx.beginPath();
        ctx.moveTo(pixelPoints[2].x, pixelPoints[2].y);
        ctx.lineTo(pixelPoints[3].x, pixelPoints[3].y);
        ctx.lineTo(pixelPoints[4].x, pixelPoints[4].y);
        ctx.closePath();
        fillStylePath(ctx, drawing.style);
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
        fillStylePath(ctx, drawing.style);
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

function fontFor(style: DrawingStyle, dpr: number): string {
    const size = (style.fontSize || 12) * dpr;
    return `${style.fontStyle === 'italic' ? 'italic ' : ''}${style.fontWeight === 'bold' ? 'bold ' : ''}${size}px Arial`;
}

/** Fill the current path with the pattern's background (colour + opacity + enabled flag). */
function fillStylePath(ctx: CanvasRenderingContext2D, style: DrawingStyle): void {
    const css = shapeFillCss(style);
    if (!css) return;
    ctx.save();
    ctx.fillStyle = css;
    ctx.fill();
    ctx.restore();
}

/** Fill for the generic X-A-B / B-C-D triangles: XABCD/Cypher use the shared model, other patterns keep legacy fill. */
function fillPatternPath(ctx: CanvasRenderingContext2D, drawing: PatternDrawing, fillColor: string): void {
    if (drawing.type === 'xabcdPattern' || drawing.type === 'cypherPattern') {
        fillStylePath(ctx, drawing.style);
    } else {
        fillWithOpacity(ctx, fillColor, drawing.style.fillOpacity);
    }
}

/** Rounded box filled with the line colour and text in the text colour, centred on (cx, cy). Returns box height. */
function drawBadge(
    ctx: CanvasRenderingContext2D,
    text: string,
    cx: number,
    cy: number,
    style: DrawingStyle,
    dpr: number
): { w: number; h: number } {
    ctx.save();
    ctx.font = fontFor(style, dpr);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 10 * dpr;
    const h = (style.fontSize || 12) * dpr + 8 * dpr;
    const x = cx - w / 2;
    const y = cy - h / 2;
    const r = Math.min(4 * dpr, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.fillStyle = style.color;
    ctx.fill();
    ctx.fillStyle = style.textColor || '#FFFFFF';
    ctx.fillText(text, cx, cy + 0.5 * dpr);
    ctx.restore();
    return { w, h };
}

function drawLabels(
    ctx: CanvasRenderingContext2D,
    pixelPoints: { x: number; y: number }[],
    labels: string[],
    style: DrawingStyle,
    dpr: number
): void {
    const h = (style.fontSize || 12) * dpr + 8 * dpr;
    const gap = 6 * dpr;
    for (let i = 0; i < pixelPoints.length; i++) {
        const point = pixelPoints[i];
        const raw = labels[i] ?? String(i);
        if (!raw) continue; // intentionally unlabeled point
        // Only multi-letter names are translated (single letters like D would collide with unit abbreviations)
        const label = raw.length > 1 ? t(raw) : raw;

        // Determine if this point is a local peak or valley
        let isValley = false;

        if (pixelPoints.length >= 2) {
            const prevY = i > 0 ? pixelPoints[i - 1].y : point.y;
            const nextY = i < pixelPoints.length - 1 ? pixelPoints[i + 1].y : point.y;
            isValley = point.y > prevY || point.y > nextY;
        }

        const cy = isValley ? point.y + gap + h / 2 : point.y - gap - h / 2;
        drawBadge(ctx, label, point.x, cy, style, dpr);
    }
}
