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
} from '../../drawings';

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

    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);

    // Draw Fill
    if (style.fillColor) {
        ctx.save();
        ctx.globalAlpha = style.fillOpacity !== undefined ? style.fillOpacity : 0.2;
        ctx.fillStyle = style.fillColor;
        ctx.fillRect(x, y, w, h);
        ctx.restore();
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

    ctx.rect(x, y, w, h);
    ctx.stroke();
    ctx.setLineDash([]);

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
            ctx.fillStyle = drawing.style.fillColor;
            ctx.fill();
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
            ctx.fillStyle = drawing.style.fillColor;
            ctx.fill();
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
            ctx.fillStyle = drawing.style.fillColor;
            ctx.fill();
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
            ctx.fillStyle = drawing.style.fillColor;
            ctx.fill();
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

    // Draw arrow head at the last point
    if (pixelPoints.length >= 2) {
        const lastPoint = pixelPoints[pixelPoints.length - 1];
        const prevPoint = pixelPoints[pixelPoints.length - 2];

        const angle = Math.atan2(lastPoint.y - prevPoint.y, lastPoint.x - prevPoint.x);
        const arrowSize = 10 * dpr;

        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(
            lastPoint.x - arrowSize * Math.cos(angle - Math.PI / 6),
            lastPoint.y - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            lastPoint.x - arrowSize * Math.cos(angle + Math.PI / 6),
            lastPoint.y - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = drawing.style.color;
        ctx.fill();
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
        ctx.fillStyle = drawing.style.fillColor;
        ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
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

    if (drawing.isClosed && drawing.style.fillColor) {
        ctx.beginPath();
        ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);
        for (let i = 1; i < pixelPoints.length; i++) {
            ctx.lineTo(pixelPoints[i].x, pixelPoints[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = drawing.style.fillColor;
        ctx.fill();
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

    ctx.beginPath();
    ctx.moveTo(pixelPoints[0].x, pixelPoints[0].y);

    if (pixelPoints.length >= 3) {
        const p0 = pixelPoints[0];
        const pm = pixelPoints[1];
        const p2 = pixelPoints[2];

        const controlX = 2 * pm.x - 0.5 * (p0.x + p2.x);
        const controlY = 2 * pm.y - 0.5 * (p0.y + p2.y);

        ctx.quadraticCurveTo(controlX, controlY, p2.x, p2.y);
    } else {
        ctx.lineTo(pixelPoints[1].x, pixelPoints[1].y);
    }

    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = drawing.style.lineWidth * dpr;
    ctx.setLineDash((drawing.style.lineDash || []).map(d => d * dpr));
    ctx.stroke();
    ctx.setLineDash([]);

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
