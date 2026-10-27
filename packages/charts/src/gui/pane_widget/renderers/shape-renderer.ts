/**
 * Shape Drawing Renderer
 * Renders shape drawings: Rectangle, RotatedRectangle, Ellipse, Triangle, Arc, Path, Circle, Polyline, Curve
 */

import {
    RectangleDrawing,
    RotatedRectangleDrawing,
    EllipseDrawing,
    TriangleDrawing,
    ArcDrawing,
    PathDrawing,
    CircleDrawing,
    PolylineDrawing,
    CurveDrawing,
    DoubleCurveDrawing,
    doubleCurveControls,
    doubleCurveEndDirs,
} from '../../../drawings';

import { shapeFillCss } from '../../../drawings/shape-common';
import { dashFromLineStyle, drawArrowHead } from '../../../drawings/line-tool-common';

/** Kapali sekil dolgusu: renk + seffaflik (style.fillColor/fillOpacity/fillEnabled). Mevcut yolu doldurur. */
function fillShape(ctx: CanvasRenderingContext2D, style: RectangleDrawing['style']): void {
    const css = shapeFillCss(style);
    if (!css) return;
    ctx.save();
    ctx.fillStyle = css;
    ctx.fill();
    ctx.restore();
}

/**
 * Sekil icine metin (cok satir, kutu genisligine gore sarar). Hiza yalnizca `align` aciksa uygulanir.
 * `span` verilirse (uzatilmis dikdortgen) metin bu yatay aralikta hizalanir; metin `box` ile kirpilir.
 */
function drawShapeText(
    ctx: CanvasRenderingContext2D,
    style: RectangleDrawing['style'],
    box: { x: number; y: number; w: number; h: number },
    dpr: number,
    align: boolean,
    span?: { x: number; w: number }
): void {
    const text = style.text;
    if (!text || !text.trim()) return;
    const size = (style.fontSize || 14) * dpr;
    const pad = 6 * dpr;
    ctx.save();
    ctx.beginPath();
    ctx.rect(span ? span.x : box.x, box.y, span ? span.w : box.w, box.h);
    ctx.clip();
    ctx.font = `${style.fontStyle === 'italic' ? 'italic' : 'normal'} ${style.fontWeight === 'bold' ? 'bold' : 'normal'} ${size}px Arial`;
    ctx.fillStyle = style.textColor || style.color;
    ctx.textBaseline = 'top';
    const sx = span ? span.x : box.x;
    const sw = span ? span.w : box.w;
    const maxW = Math.max(size, sw - 2 * pad);
    const lines: string[] = [];
    for (const para of text.split('\n')) {
        let cur = '';
        for (const word of para.split(/\s+/)) {
            const trial = cur ? cur + ' ' + word : word;
            if (cur && ctx.measureText(trial).width > maxW) {
                lines.push(cur);
                cur = word;
            } else {
                cur = trial;
            }
        }
        lines.push(cur);
    }
    const lh = size * 1.2;
    const total = lines.length * lh;
    const h = align ? style.textHAlign || 'center' : 'center';
    const v = align ? style.textVAlign || 'middle' : 'middle';
    const top = v === 'top' ? box.y + pad : v === 'bottom' ? box.y + box.h - pad - total : box.y + (box.h - total) / 2;
    const x = h === 'left' ? sx + pad : h === 'right' ? sx + sw - pad : sx + sw / 2;
    ctx.textAlign = h;
    lines.forEach((ln, i) => ctx.fillText(ln, x, top + i * lh));
    ctx.restore();
}

// ============================================================================
// Rectangle
// ============================================================================

export function drawRectangle(
    ctx: CanvasRenderingContext2D,
    drawing: RectangleDrawing,
    points: { x: number; y: number }[],
    dpr: number,
    isSelected: boolean
): void {
    if (points.length < 2) return;

    const p1 = points[0];
    const p2 = points[1];
    const style = drawing.style;

    const bx = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const bw = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);
    // Uzatma: kutuyu pencere kenarina kadar yatay uzat
    const x = drawing.extendLeft ? 0 : bx;
    const right = drawing.extendRight ? ctx.canvas.width : bx + bw;
    const w = Math.max(0, right - x);

    // Draw Fill
    if (style.fillColor) {
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        fillShape(ctx, style);
    }

    // Draw Border
    ctx.beginPath();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineWidth * dpr;

    if (style.lineDash && style.lineDash.length > 0) {
        ctx.setLineDash(style.lineDash.map(d => d * dpr));
    } else {
        ctx.setLineDash([]);
    }

    if (!drawing.extendLeft && !drawing.extendRight) {
        ctx.rect(x, y, w, h);
    } else {
        // Uzatilan tarafta dikey kenar cizilmez
        ctx.moveTo(x, y);
        ctx.lineTo(right, y);
        ctx.moveTo(x, y + h);
        ctx.lineTo(right, y + h);
        if (!drawing.extendLeft) { ctx.moveTo(x, y); ctx.lineTo(x, y + h); }
        if (!drawing.extendRight) { ctx.moveTo(right, y); ctx.lineTo(right, y + h); }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Orta cizgi
    const ml = drawing.middleLine;
    if (ml && ml.show) {
        const my = y + h / 2;
        ctx.beginPath();
        ctx.strokeStyle = ml.color;
        ctx.lineWidth = ml.width * dpr;
        ctx.setLineDash((dashFromLineStyle(ml.style) || []).map(d => d * dpr));
        ctx.moveTo(x, my);
        ctx.lineTo(right, my);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Uzatilmis halde metin gorunen aralikta (tuval ile kirpilmis) hizalanir
    const vx = Math.max(0, x);
    const vw = Math.max(0, Math.min(right, ctx.canvas.width) - vx);
    drawShapeText(ctx, style, { x: bx, y, w: bw, h }, dpr, true,
        drawing.extendLeft || drawing.extendRight ? { x: vx, w: vw } : undefined);

    // Draw selection points
    if (isSelected) {
        const corners = [
            { x: p1.x, y: p1.y },
            { x: p2.x, y: p2.y },
            { x: p2.x, y: p1.y },
            { x: p1.x, y: p2.y }
        ];

        ctx.lineWidth = 1 * dpr;
        ctx.strokeStyle = '#2962ff';

        corners.forEach(p => {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#2962ff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3 * dpr, 0, Math.PI * 2);
            ctx.fill();
        });
    }
}

// ============================================================================
// Rotated Rectangle
// ============================================================================

export function drawRotatedRectangle(
    ctx: CanvasRenderingContext2D,
    drawing: RotatedRectangleDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    isSelected: boolean
): void {
    const corners = drawing.getRectangleCorners();

    if (corners && corners.length === 4) {
        const scaledCorners = corners.map(c => ({ x: c.x * dpr, y: c.y * dpr }));

        // Draw fill
        if (drawing.style.fillColor) {
            ctx.beginPath();
            ctx.moveTo(scaledCorners[0].x, scaledCorners[0].y);
            for (let i = 1; i < 4; i++) {
                ctx.lineTo(scaledCorners[i].x, scaledCorners[i].y);
            }
            ctx.closePath();
            fillShape(ctx, drawing.style);
        }

        // Draw stroke
        ctx.beginPath();
        ctx.moveTo(scaledCorners[0].x, scaledCorners[0].y);
        for (let i = 1; i < 4; i++) {
            ctx.lineTo(scaledCorners[i].x, scaledCorners[i].y);
        }
        ctx.closePath();
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = drawing.style.lineWidth * dpr;
        ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
        ctx.stroke();
        ctx.setLineDash([]);

    } else if (pixelPoints.length >= 2) {
        const p1 = pixelPoints[0];
        const p2 = pixelPoints[1];

        ctx.beginPath();
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = drawing.style.lineWidth * dpr;
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    if (isSelected) {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = 2 * dpr;

        const rectCorners = drawing.getRectangleCorners();
        const controlPoints = rectCorners
            ? rectCorners.slice(0, 3).map(c => ({ x: c.x * dpr, y: c.y * dpr }))
            : pixelPoints;

        for (const point of controlPoints) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = drawing.style.color;
            ctx.beginPath();
            ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
        }
    }
}

// ============================================================================
// Ellipse
// ============================================================================

export function drawEllipse(
    ctx: CanvasRenderingContext2D,
    drawing: EllipseDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    isSelected: boolean
): void {
    if (pixelPoints.length === 2 && drawing.state === 'creating') {
        const p0 = pixelPoints[0];
        const p1 = pixelPoints[1];

        ctx.beginPath();
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = drawing.style.lineWidth * dpr;
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.setLineDash([]);
        return;
    }

    const params = drawing.getEllipseParams();

    if (params) {
        const { cx, cy, rx, ry, rotation } = params;
        const scaledCx = cx * dpr;
        const scaledCy = cy * dpr;
        const scaledRx = rx * dpr;
        const scaledRy = ry * dpr;

        if (drawing.style.fillColor && scaledRx > 0 && scaledRy > 0) {
            ctx.beginPath();
            ctx.ellipse(scaledCx, scaledCy, scaledRx, scaledRy, rotation, 0, Math.PI * 2);
            fillShape(ctx, drawing.style);
        }

        if (scaledRx > 0 && scaledRy > 0) {
            ctx.beginPath();
            ctx.ellipse(scaledCx, scaledCy, scaledRx, scaledRy, rotation, 0, Math.PI * 2);
            ctx.strokeStyle = drawing.style.color;
            ctx.lineWidth = drawing.style.lineWidth * dpr;
            ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (scaledRx > 0 && scaledRy > 0) {
            const k = Math.SQRT1_2;
            drawShapeText(ctx, drawing.style, {
                x: scaledCx - scaledRx * k, y: scaledCy - scaledRy * k, w: scaledRx * 2 * k, h: scaledRy * 2 * k
            }, dpr, false);
        }
    }

    if (isSelected && pixelPoints.length >= 2) {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = 2 * dpr;

        const controlPoints = drawing.getControlPoints();
        const pointsToDraw = controlPoints
            ? controlPoints.map(p => ({ x: p.x * dpr, y: p.y * dpr }))
            : pixelPoints;

        for (const point of pointsToDraw) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = drawing.style.color;
            ctx.beginPath();
            ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
        }
    }
}

// ============================================================================
// Triangle (Shape)
// ============================================================================

export function drawTriangleShape(
    ctx: CanvasRenderingContext2D,
    drawing: TriangleDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    isSelected: boolean
): void {
    if (pixelPoints.length === 2 && drawing.state === 'creating') {
        const p0 = pixelPoints[0];
        const p1 = pixelPoints[1];

        ctx.beginPath();
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = drawing.style.lineWidth * dpr;
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.setLineDash([]);
        return;
    }

    if (pixelPoints.length >= 3) {
        const p0 = pixelPoints[0];
        const p1 = pixelPoints[1];
        const p2 = pixelPoints[2];

        if (drawing.style.fillColor) {
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.closePath();
            fillShape(ctx, drawing.style);
        }

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = drawing.style.lineWidth * dpr;
        ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
        ctx.stroke();
        ctx.setLineDash([]);
    }

    if (isSelected && pixelPoints.length >= 3) {
        drawControlPoints(ctx, pixelPoints, drawing.style.color, dpr);
    }
}

// ============================================================================
// Arc
// ============================================================================

export function drawArc(
    ctx: CanvasRenderingContext2D,
    drawing: ArcDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    isSelected: boolean
): void {
    if (pixelPoints.length === 2 && drawing.state === 'creating') {
        const p0 = pixelPoints[0];
        const p1 = pixelPoints[1];

        ctx.beginPath();
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = drawing.style.lineWidth * dpr;
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.setLineDash([]);
        return;
    }

    if (pixelPoints.length >= 3) {
        const p0 = pixelPoints[0];
        const p1 = pixelPoints[1];
        const p2 = pixelPoints[2];

        const controlX = 2 * p2.x - 0.5 * p0.x - 0.5 * p1.x;
        const controlY = 2 * p2.y - 0.5 * p0.y - 0.5 * p1.y;

        if (drawing.style.fillColor) {
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.quadraticCurveTo(controlX, controlY, p1.x, p1.y);
            ctx.lineTo(p0.x, p0.y);
            fillShape(ctx, drawing.style);
        }

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(controlX, controlY, p1.x, p1.y);
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = drawing.style.lineWidth * dpr;
        ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
        ctx.stroke();
        ctx.setLineDash([]);
    }

    if (isSelected && pixelPoints.length >= 3) {
        drawControlPoints(ctx, pixelPoints, drawing.style.color, dpr);
    }
}

// ============================================================================
// Path
// ============================================================================

export function drawPath(
    ctx: CanvasRenderingContext2D,
    drawing: PathDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    isSelected: boolean
): void {
    if (pixelPoints.length < 2) return;

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

    // Arrow heads at the first / last point (lineProps.leftEnd / rightEnd)
    const first = pixelPoints[0];
    const last = pixelPoints[pixelPoints.length - 1];
    const next = pixelPoints.find(p => p.x !== first.x || p.y !== first.y);
    let prev: { x: number; y: number } | undefined;
    for (let i = pixelPoints.length - 2; i >= 0; i--) {
        if (pixelPoints[i].x !== last.x || pixelPoints[i].y !== last.y) { prev = pixelPoints[i]; break; }
    }
    if (drawing.lineProps.leftEnd === 'arrow' && next) {
        drawArrowHead(ctx, first, next, drawing.style.color, drawing.style.lineWidth, dpr);
    }
    if (drawing.lineProps.rightEnd === 'arrow' && prev) {
        drawArrowHead(ctx, last, prev, drawing.style.color, drawing.style.lineWidth, dpr);
    }

    if (isSelected) {
        drawControlPoints(ctx, pixelPoints, drawing.style.color, dpr);
    }
}

// ============================================================================
// Circle
// ============================================================================

export function drawCircle(
    ctx: CanvasRenderingContext2D,
    drawing: CircleDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    isSelected: boolean
): void {
    if (pixelPoints.length < 2) return;

    const center = pixelPoints[0];
    const edge = pixelPoints[1];
    const radius = Math.sqrt((edge.x - center.x) ** 2 + (edge.y - center.y) ** 2);

    if (drawing.style.fillColor) {
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        fillShape(ctx, drawing.style);
    }

    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = drawing.style.lineWidth * dpr;
    ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
    ctx.stroke();
    ctx.setLineDash([]);

    const k = Math.SQRT1_2;
    drawShapeText(ctx, drawing.style, {
        x: center.x - radius * k, y: center.y - radius * k, w: radius * 2 * k, h: radius * 2 * k
    }, dpr, false);

    if (isSelected) {
        drawControlPoints(ctx, pixelPoints, drawing.style.color, dpr);
    }
}

// ============================================================================
// Polyline
// ============================================================================

export function drawPolyline(
    ctx: CanvasRenderingContext2D,
    drawing: PolylineDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    isSelected: boolean
): void {
    if (pixelPoints.length < 2) return;

    if (pixelPoints.length >= 3 && drawing.shouldFill(pixelPoints.length)) {
        ctx.beginPath();
        ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);
        for (let i = 1; i < pixelPoints.length; i++) {
            ctx.lineTo(pixelPoints[i].x, pixelPoints[i].y);
        }
        ctx.closePath();
        fillShape(ctx, drawing.style);
    }

    ctx.beginPath();
    ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);

    for (let i = 1; i < pixelPoints.length; i++) {
        ctx.lineTo(pixelPoints[i].x, pixelPoints[i].y);
    }

    if (drawing.isClosed) {
        ctx.closePath();
    }

    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = drawing.style.lineWidth * dpr;
    ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
    ctx.stroke();
    ctx.setLineDash([]);

    if (isSelected) {
        drawControlPoints(ctx, pixelPoints, drawing.style.color, dpr);
    }
}

// ============================================================================
// Curve
// ============================================================================

export function drawCurve(
    ctx: CanvasRenderingContext2D,
    drawing: CurveDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    showControlPoints: boolean
): void {
    if (pixelPoints.length < 2) return;

    const p0 = pixelPoints[0];
    const hasCurve = pixelPoints.length >= 3;
    const pm = pixelPoints[1];
    const p2 = pixelPoints[hasCurve ? 2 : 1];
    // Bezier control point from the on-curve middle point: C = 2*Pm - 0.5*(P0 + P2)
    const controlX = hasCurve ? 2 * pm.x - 0.5 * (p0.x + p2.x) : (p0.x + p2.x) / 2;
    const controlY = hasCurve ? 2 * pm.y - 0.5 * (p0.y + p2.y) : (p0.y + p2.y) / 2;

    const tracePath = () => {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        if (hasCurve) ctx.quadraticCurveTo(controlX, controlY, p2.x, p2.y);
        else ctx.lineTo(p2.x, p2.y);
    };

    if (hasCurve) {
        tracePath();
        ctx.closePath();
        fillShape(ctx, drawing.style);
    }

    tracePath();
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = drawing.style.lineWidth * dpr;
    ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
    ctx.stroke();

    // End tangents: start = P0 - C (outwards), end = P2 - C
    const sdx = p0.x - controlX, sdy = p0.y - controlY;
    const edx = p2.x - controlX, edy = p2.y - controlY;
    const far = (ctx.canvas.width + ctx.canvas.height) * 2;
    const extend = (o: { x: number; y: number }, dx: number, dy: number) => {
        const len = Math.hypot(dx, dy);
        if (len === 0) return;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(o.x + (dx / len) * far, o.y + (dy / len) * far);
        ctx.stroke();
    };
    if (drawing.extendLeft) extend(p0, sdx, sdy);
    if (drawing.extendRight) extend(p2, edx, edy);
    ctx.setLineDash([]);

    // Arrow heads stay at the original end points
    const tipFrom = (o: { x: number; y: number }, dx: number, dy: number) => ({ x: o.x - dx, y: o.y - dy });
    if (drawing.lineProps.leftEnd === 'arrow') {
        drawArrowHead(ctx, p0, tipFrom(p0, sdx, sdy), drawing.style.color, drawing.style.lineWidth, dpr);
    }
    if (drawing.lineProps.rightEnd === 'arrow') {
        drawArrowHead(ctx, p2, tipFrom(p2, edx, edy), drawing.style.color, drawing.style.lineWidth, dpr);
    }

    if (showControlPoints) {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = drawing.style.color;
        ctx.lineWidth = 2 * dpr;

        for (let i = 0; i < pixelPoints.length; i++) {
            const point = pixelPoints[i];
            ctx.beginPath();
            ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = drawing.style.color;
            ctx.beginPath();
            ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
        }

        if (pixelPoints.length >= 3) {
            ctx.strokeStyle = 'rgba(41, 98, 255, 0.5)';
            ctx.lineWidth = 1 * dpr;
            ctx.setLineDash([4 * dpr, 4 * dpr]);

            ctx.beginPath();
            ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);
            ctx.lineTo(pixelPoints[1].x, pixelPoints[1].y);
            ctx.lineTo(pixelPoints[2].x, pixelPoints[2].y);
            ctx.stroke();

            ctx.setLineDash([]);
        }
    }
}

// ============================================================================
// Double Curve (cubic bezier through P2, see double-curve-drawing.ts)
// ============================================================================

export function drawDoubleCurve(
    ctx: CanvasRenderingContext2D,
    drawing: DoubleCurveDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    showControlPoints: boolean
): void {
    if (pixelPoints.length < 2) return;
    const p0 = pixelPoints[0];
    const hasCurve = pixelPoints.length >= 3;
    const p2 = pixelPoints[hasCurve ? 2 : 1];
    const { c1, c2 } = hasCurve
        ? doubleCurveControls(p0, pixelPoints[1], p2)
        : { c1: { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 }, c2: { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 } };

    const tracePath = () => {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        if (hasCurve) ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p2.x, p2.y);
        else ctx.lineTo(p2.x, p2.y);
    };

    if (hasCurve) {
        tracePath();
        ctx.closePath();
        fillShape(ctx, drawing.style);
    }

    tracePath();
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = drawing.style.lineWidth * dpr;
    ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
    ctx.stroke();

    // End tangents: start = P0 - C1 (outwards), end = P2 - C2
    const dirs = doubleCurveEndDirs(p0, c1, c2, p2);
    const sdx = dirs.start.x, sdy = dirs.start.y;
    const edx = dirs.end.x, edy = dirs.end.y;
    const far = (ctx.canvas.width + ctx.canvas.height) * 2;
    const extend = (o: { x: number; y: number }, dx: number, dy: number) => {
        const len = Math.hypot(dx, dy);
        if (len === 0) return;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(o.x + (dx / len) * far, o.y + (dy / len) * far);
        ctx.stroke();
    };
    if (drawing.extendLeft) extend(p0, sdx, sdy);
    if (drawing.extendRight) extend(p2, edx, edy);
    ctx.setLineDash([]);

    if (drawing.lineProps.leftEnd === 'arrow') drawArrowHead(ctx, p0, { x: p0.x - sdx, y: p0.y - sdy }, drawing.style.color, drawing.style.lineWidth, dpr);
    if (drawing.lineProps.rightEnd === 'arrow') drawArrowHead(ctx, p2, { x: p2.x - edx, y: p2.y - edy }, drawing.style.color, drawing.style.lineWidth, dpr);

    if (showControlPoints) {
        for (const point of pixelPoints) {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.strokeStyle = drawing.style.color;
            ctx.lineWidth = 2 * dpr;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
            ctx.fillStyle = drawing.style.color;
            ctx.fill();
        }
    }
}

// ============================================================================
// Helper Functions
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

    for (const point of pixelPoints) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
    }
}
