/**
 * Chart Widget Event Handlers
 * Mouse, wheel, and keyboard event handling for chart interactions
 */

import { ChartModel } from '../../model/chart-model';
import { DrawingManager } from '../../drawings';

/**
 * Interface for the chart widget context needed by event handlers
 */
export interface ChartWidgetContext {
    model: ChartModel;
    drawingManager: DrawingManager;
    paneCanvas: HTMLCanvasElement | null;
    element: HTMLElement | null;

    // State
    isDragging: boolean;
    isDraggingDrawing: boolean;
    draggingControlPoint: number;
    isPriceScaleDragging: boolean;
    lastMouseX: number;
    lastMouseY: number;
    dragStartX: number;
    dragStartY: number;

    // Callbacks
    scheduleDraw: () => void;
}

/**
 * Handle wheel event for zooming and panning
 */
export function handleWheel(e: WheelEvent, ctx: ChartWidgetContext): void {
    e.preventDefault();

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;

    const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);

    if (isHorizontal && !e.ctrlKey) {
        ctx.model.timeScale.scrollBy(e.deltaX);
    } else {
        const isPinch = e.ctrlKey;
        const sensitivity = isPinch ? 0.05 : 0.2;
        const sign = e.deltaY > 0 ? -1 : 1;
        ctx.model.timeScale.zoom(x as any, sign * sensitivity);
    }

    ctx.model.recalculateAllPanes();
}

/**
 * Hit test control point - returns index or -1
 */
export function hitTestControlPoint(x: number, y: number, drawing: any): number {
    if (!drawing.getPixelPoints) return -1;

    const points = drawing.getPixelPoints();
    const threshold = 10;

    for (let i = 0; i < points.length; i++) {
        const dx = x - points[i].x;
        const dy = y - points[i].y;
        if (Math.sqrt(dx * dx + dy * dy) <= threshold) {
            return i;
        }
    }
    return -1;
}

/**
 * Handle mouse down event - returns updated state
 */
export function handleMouseDown(
    e: MouseEvent,
    ctx: ChartWidgetContext
): Partial<ChartWidgetContext> {
    const paneRect = ctx.paneCanvas?.getBoundingClientRect();
    if (!paneRect) return {};

    const x = e.clientX - paneRect.left;
    const y = e.clientY - paneRect.top;
    const isOverPane = x >= 0 && x <= paneRect.width && y >= 0 && y <= paneRect.height;

    if (!isOverPane) {
        return {
            isDragging: true,
            lastMouseX: e.clientX,
            lastMouseY: e.clientY
        };
    }

    // Check if clicking on a control point of selected drawing
    const selected = ctx.drawingManager.selectedDrawing;
    if (selected) {
        const controlPointIndex = hitTestControlPoint(x, y, selected);
        if (controlPointIndex >= 0) {
            return {
                isDraggingDrawing: true,
                draggingControlPoint: controlPointIndex,
                dragStartX: x,
                dragStartY: y
            };
        }

        if (selected.hitTest(x, y, 8)) {
            return {
                isDraggingDrawing: true,
                draggingControlPoint: 99,
                dragStartX: x,
                dragStartY: y
            };
        }
    }

    // Try to select a drawing
    const hitDrawing = ctx.drawingManager.selectDrawingAt(x, y);
    if (hitDrawing) {
        return {
            isDraggingDrawing: true,
            draggingControlPoint: 99,
            dragStartX: x,
            dragStartY: y
        };
    }

    // Check if we're in drawing mode
    if (ctx.drawingManager.mode !== 'none') {
        if (ctx.drawingManager.activeDrawing) {
            if (ctx.drawingManager.activeDrawing.type !== 'brush' &&
                ctx.drawingManager.activeDrawing.type !== 'highlighter') {
                ctx.drawingManager.finishDrawing(x, y);
            }
        } else {
            ctx.drawingManager.startDrawing(x, y);
        }
        return {};
    }

    // Normal panning mode
    const result: Partial<ChartWidgetContext> = {
        isDragging: true,
        lastMouseX: e.clientX,
        lastMouseY: e.clientY
    };

    if (!ctx.model.rightPriceScale.isAutoScale && ctx.paneCanvas) {
        const rect = ctx.paneCanvas.getBoundingClientRect();
        ctx.model.rightPriceScale.startScroll(e.clientY - rect.top);
    }

    return result;
}

/**
 * Handle mouse move event - returns updated state
 */
export function handleMouseMove(
    e: MouseEvent,
    ctx: ChartWidgetContext
): Partial<ChartWidgetContext> {
    const deltaX = e.clientX - ctx.lastMouseX;
    const deltaY = e.clientY - ctx.lastMouseY;

    const result: Partial<ChartWidgetContext> = {
        lastMouseX: e.clientX,
        lastMouseY: e.clientY
    };

    const paneRect = ctx.paneCanvas?.getBoundingClientRect();

    // Handle drawing dragging
    if (ctx.isDraggingDrawing && paneRect) {
        const x = e.clientX - paneRect.left;
        const y = e.clientY - paneRect.top;

        const selected = ctx.drawingManager.selectedDrawing;
        if (selected) {
            if (ctx.draggingControlPoint === 99) {
                ctx.drawingManager.moveDrawing(x - ctx.dragStartX, y - ctx.dragStartY);
                result.dragStartX = x;
                result.dragStartY = y;
            } else if (ctx.draggingControlPoint >= 0) {
                ctx.drawingManager.moveControlPoint(ctx.draggingControlPoint, x, y);
            }
        }

        ctx.model.setCrosshairPosition(x, y, true);
        return result;
    }

    // Update drawing preview
    if (paneRect && ctx.drawingManager.activeDrawing) {
        const x = e.clientX - paneRect.left;
        const y = e.clientY - paneRect.top;
        ctx.drawingManager.updateDrawing(x, y);
    }

    if (ctx.isDragging) {
        ctx.model.timeScale.scrollBy(-deltaX);

        if (!ctx.model.rightPriceScale.isAutoScale && ctx.paneCanvas) {
            const rect = ctx.paneCanvas.getBoundingClientRect();
            ctx.model.rightPriceScale.scrollTo(e.clientY - rect.top);
        }

        ctx.model.recalculateAllPanes();
    }

    if (ctx.isPriceScaleDragging) {
        ctx.model.rightPriceScale.scaleTo(deltaY);
        ctx.scheduleDraw();
    }

    // Crosshair logic
    if (!ctx.isDragging && !ctx.isPriceScaleDragging && ctx.element) {
        if (paneRect) {
            const x = e.clientX - paneRect.left;
            const y = e.clientY - paneRect.top;
            const chartAreaWidth = paneRect.width;

            if (x >= 0 && x <= chartAreaWidth && y >= 0 && y <= paneRect.height) {
                ctx.model.setCrosshairPosition(x, y, true);
            } else if (x >= 0 && x <= chartAreaWidth) {
                ctx.model.setCrosshairPosition(x, y, true);
            } else {
                ctx.model.setCrosshairPosition(0, 0, false);
            }
        } else {
            ctx.model.setCrosshairPosition(0, 0, false);
        }
    }

    return result;
}

/**
 * Handle keyboard events
 */
export function handleKeyDown(
    e: KeyboardEvent,
    ctx: ChartWidgetContext
): void {
    if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = ctx.drawingManager.selectedDrawing;
        if (selected) {
            e.preventDefault();
            ctx.drawingManager.deleteDrawing(selected.id);
            ctx.scheduleDraw();
        }
    }

    if (e.key === 'Escape') {
        const activeDrawing = ctx.drawingManager.activeDrawing;
        if (activeDrawing && activeDrawing.type === 'path') {
            ctx.drawingManager.finishPathDrawing();
            ctx.scheduleDraw();
            return;
        }

        if (activeDrawing && activeDrawing.type === 'polyline') {
            ctx.drawingManager.finishPolylineDrawing();
            ctx.scheduleDraw();
            return;
        }

        const selected = ctx.drawingManager.selectedDrawing;
        if (selected) {
            selected.state = 'complete';
            ctx.drawingManager.setMode('none');
            ctx.scheduleDraw();
        }
    }
}

/**
 * Handle mouse leave
 */
export function handleMouseLeave(ctx: ChartWidgetContext): void {
    ctx.model.setCrosshairPosition(0, 0, false);
}

/**
 * Handle mouse up - returns updated state
 */
export function handleMouseUp(
    e: MouseEvent,
    ctx: ChartWidgetContext
): Partial<ChartWidgetContext> {
    if (!ctx.paneCanvas) return {};

    const paneRect = ctx.paneCanvas.getBoundingClientRect();
    const result: Partial<ChartWidgetContext> = {};

    if (ctx.isDragging) {
        result.isDragging = false;
        ctx.model.rightPriceScale.endScroll();
    }
    if (ctx.isPriceScaleDragging) {
        ctx.model.rightPriceScale.endScale();
        result.isPriceScaleDragging = false;
    }
    if (ctx.isDraggingDrawing) {
        result.isDraggingDrawing = false;
        result.draggingControlPoint = -1;
    }

    // Finish brush or highlighter drawing on mouse up
    if (paneRect && ctx.drawingManager.activeDrawing &&
        (ctx.drawingManager.activeDrawing.type === 'brush' ||
            ctx.drawingManager.activeDrawing.type === 'highlighter')) {
        const x = e.clientX - paneRect.left;
        const y = e.clientY - paneRect.top;
        ctx.drawingManager.finishDrawing(x, y);
    }

    return result;
}

/**
 * Handle price axis mouse down - returns updated state
 */
export function handlePriceAxisMouseDown(
    e: MouseEvent,
    ctx: ChartWidgetContext
): Partial<ChartWidgetContext> {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    ctx.model.rightPriceScale.startScale(e.clientY - rect.top);

    return {
        isPriceScaleDragging: true,
        lastMouseY: rect.top
    };
}

/**
 * Handle price axis double click
 */
export function handlePriceAxisDoubleClick(ctx: ChartWidgetContext): void {
    ctx.model.rightPriceScale.setAutoScale(true);
    ctx.model.recalculateAllPanes();
}
