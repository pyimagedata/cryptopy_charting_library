/**
 * Projection Renderer
 * Projeksiyon (sektor) araci: geometri dairesel fib araclariyla ayni sekilde (arc/fill/line/label) cizilir.
 */

import { ProjectionDrawing } from '../../../drawings/projection-drawing';
import { drawFibCircleGeometry } from './fib-circle-renderer';

export function drawProjectionTool(
    ctx: CanvasRenderingContext2D,
    drawing: ProjectionDrawing,
    pixelPoints: { x: number; y: number }[],
    paneWidth: number,
    paneHeight: number,
    dpr: number,
    showHandles: boolean
): void {
    drawFibCircleGeometry(ctx, drawing.layout(pixelPoints), pixelPoints, paneWidth, paneHeight, dpr, showHandles, drawing.style.color);
}
