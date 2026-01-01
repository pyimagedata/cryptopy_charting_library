/**
 * Drawing Renderer Utilities
 * 
 * Common utility functions used across drawing renderers.
 */

/**
 * Convert hex color to rgba with opacity
 */
export function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Apply line style from drawing options
 */
export function applyLineStyle(
    ctx: CanvasRenderingContext2D,
    style: { color: string; lineWidth: number; lineDash?: number[] },
    dpr: number
): void {
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineWidth * dpr;
    ctx.setLineDash(style.lineDash?.map(d => d * dpr) || []);
}

/**
 * Draw selection handles at a point
 */
export function drawSelectionHandle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    dpr: number
): void {
    const handleRadius = 4 * dpr;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, handleRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#2962ff';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();
    ctx.restore();
}

/**
 * Calculate angle between two points
 */
export function calculateAngle(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.atan2(dy, dx);
}

/**
 * Extend a line from p1 through p2 to canvas edge
 */
export function extendLineToEdge(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    canvasWidth: number,
    canvasHeight: number,
    direction: 'left' | 'right'
): { x: number; y: number } {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    if (dx === 0) {
        // Vertical line
        return { x: p1.x, y: direction === 'right' ? canvasHeight : 0 };
    }

    const slope = dy / dx;

    if (direction === 'right') {
        const targetX = canvasWidth;
        const targetY = p2.y + slope * (targetX - p2.x);
        return { x: targetX, y: targetY };
    } else {
        const targetX = 0;
        const targetY = p1.y + slope * (targetX - p1.x);
        return { x: targetX, y: targetY };
    }
}
