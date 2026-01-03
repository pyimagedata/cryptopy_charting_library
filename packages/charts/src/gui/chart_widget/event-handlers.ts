/**
 * Chart Widget Event Handlers
 * Mouse, wheel, and keyboard event handling for chart interactions
 */

import { ChartModel } from '../../model/chart-model';
import { PaneWidget } from '../pane-widget';
import { DrawingManager } from '../../drawings';

export interface EventHandlerState {
    isDragging: boolean;
    isDraggingDrawing: boolean;
    draggingControlPoint: number;
    isPriceScaleDragging: boolean;
    lastMouseX: number;
    lastMouseY: number;
    dragStartX: number;
    dragStartY: number;
}

export function createEventHandlerState(): EventHandlerState {
    return {
        isDragging: false,
        isDraggingDrawing: false,
        draggingControlPoint: -1,
        isPriceScaleDragging: false,
        lastMouseX: 0,
        lastMouseY: 0,
        dragStartX: 0,
        dragStartY: 0
    };
}

/**
 * Handle wheel event for zooming and panning
 */
export function handleWheel(
    e: WheelEvent,
    model: ChartModel
): void {
    e.preventDefault();

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;

    const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);

    if (isHorizontal && !e.ctrlKey) {
        model.timeScale.scrollBy(e.deltaX);
    } else {
        const isPinch = e.ctrlKey;
        const sensitivity = isPinch ? 0.05 : 0.2;
        const sign = e.deltaY > 0 ? -1 : 1;
        model.timeScale.zoom(x as any, sign * sensitivity);
    }

    model.recalculateAllPanes();
}

/**
 * Handle mouse down event
 */
export function handleMouseDown(
    e: MouseEvent,
    paneWidget: PaneWidget | null,
    model: ChartModel,
    drawingManager: DrawingManager,
    state: EventHandlerState,
    hitTestControlPoint: (x: number, y: number, drawing: any) => number
): void {
    const paneRect = paneWidget?.canvas?.getBoundingClientRect();
    if (!paneRect) return;

    const x = e.clientX - paneRect.left;
    const y = e.clientY - paneRect.top;
    const isOverPane = x >= 0 && x <= paneRect.width && y >= 0 && y <= paneRect.height;

    if (!isOverPane) {
        state.isDragging = true;
        state.lastMouseX = e.clientX;
        state.lastMouseY = e.clientY;
        return;
    }

    // Check if clicking on a control point of selected drawing
    const selected = drawingManager.selectedDrawing;
    if (selected) {
        const controlPointIndex = hitTestControlPoint(x, y, selected);
        if (controlPointIndex >= 0) {
            state.isDraggingDrawing = true;
            state.draggingControlPoint = controlPointIndex;
            state.dragStartX = x;
            state.dragStartY = y;
            return;
        }

        if (selected.hitTest(x, y, 8)) {
            state.isDraggingDrawing = true;
            state.draggingControlPoint = 99;
            state.dragStartX = x;
            state.dragStartY = y;
            return;
        }
    }

    // Try to select a drawing
    const hitDrawing = drawingManager.selectDrawingAt(x, y);
    if (hitDrawing) {
        state.isDraggingDrawing = true;
        state.draggingControlPoint = 99;
        state.dragStartX = x;
        state.dragStartY = y;
        return;
    }

    // Check if we're in drawing mode
    if (drawingManager.mode !== 'none') {
        if (drawingManager.activeDrawing) {
            if (drawingManager.activeDrawing.type !== 'brush' && drawingManager.activeDrawing.type !== 'highlighter') {
                drawingManager.finishDrawing(x, y);
            }
        } else {
            drawingManager.startDrawing(x, y);
        }
        return;
    }

    // Normal panning mode
    state.isDragging = true;
    state.lastMouseX = e.clientX;
    state.lastMouseY = e.clientY;

    if (!model.rightPriceScale.isAutoScale) {
        const canvas = paneWidget?.canvas;
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            model.rightPriceScale.startScroll(e.clientY - rect.top);
        }
    }
}

/**
 * Hit test control point
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
 * Handle mouse move event
 */
export function handleMouseMove(
    e: MouseEvent,
    paneWidget: PaneWidget | null,
    model: ChartModel,
    drawingManager: DrawingManager,
    state: EventHandlerState,
    element: HTMLElement | null,
    scheduleDraw: () => void
): void {
    const deltaX = e.clientX - state.lastMouseX;
    const deltaY = e.clientY - state.lastMouseY;

    state.lastMouseX = e.clientX;
    state.lastMouseY = e.clientY;

    const paneRect = paneWidget?.canvas?.getBoundingClientRect();

    // Handle drawing dragging
    if (state.isDraggingDrawing && paneRect) {
        const x = e.clientX - paneRect.left;
        const y = e.clientY - paneRect.top;

        const selected = drawingManager.selectedDrawing;
        if (selected) {
            if (state.draggingControlPoint === 99) {
                drawingManager.moveDrawing(x - state.dragStartX, y - state.dragStartY);
                state.dragStartX = x;
                state.dragStartY = y;
            } else if (state.draggingControlPoint >= 0) {
                drawingManager.moveControlPoint(state.draggingControlPoint, x, y);
            }
        }

        model.setCrosshairPosition(x, y, true);
        return;
    }

    // Update drawing preview
    if (paneRect && drawingManager.activeDrawing) {
        const x = e.clientX - paneRect.left;
        const y = e.clientY - paneRect.top;
        drawingManager.updateDrawing(x, y);
    }

    if (state.isDragging) {
        model.timeScale.scrollBy(-deltaX);

        if (!model.rightPriceScale.isAutoScale) {
            const canvas = paneWidget?.canvas;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                model.rightPriceScale.scrollTo(e.clientY - rect.top);
            }
        }

        model.recalculateAllPanes();
    }

    if (state.isPriceScaleDragging) {
        model.rightPriceScale.scaleTo(deltaY);
        scheduleDraw();
    }

    // Crosshair logic
    if (!state.isDragging && !state.isPriceScaleDragging && element) {
        if (paneRect) {
            const x = e.clientX - paneRect.left;
            const y = e.clientY - paneRect.top;
            const chartAreaWidth = paneRect.width;

            if (x >= 0 && x <= chartAreaWidth && y >= 0 && y <= paneRect.height) {
                model.setCrosshairPosition(x, y, true);
            } else if (x >= 0 && x <= chartAreaWidth) {
                model.setCrosshairPosition(x, y, true);
            } else {
                model.setCrosshairPosition(0, 0, false);
            }
        } else {
            model.setCrosshairPosition(0, 0, false);
        }
    }
}

/**
 * Handle keyboard events
 */
export function handleKeyDown(
    e: KeyboardEvent,
    drawingManager: DrawingManager,
    scheduleDraw: () => void
): void {
    if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = drawingManager.selectedDrawing;
        if (selected) {
            e.preventDefault();
            drawingManager.deleteDrawing(selected.id);
            scheduleDraw();
        }
    }

    if (e.key === 'Escape') {
        const activeDrawing = drawingManager.activeDrawing;
        if (activeDrawing && activeDrawing.type === 'path') {
            drawingManager.finishPathDrawing();
            scheduleDraw();
            return;
        }

        if (activeDrawing && activeDrawing.type === 'polyline') {
            drawingManager.finishPolylineDrawing();
            scheduleDraw();
            return;
        }

        const selected = drawingManager.selectedDrawing;
        if (selected) {
            selected.state = 'complete';
            drawingManager.setMode('none');
            scheduleDraw();
        }
    }
}

/**
 * Handle mouse leave
 */
export function handleMouseLeave(model: ChartModel): void {
    model.setCrosshairPosition(0, 0, false);
}

/**
 * Handle mouse up
 */
export function handleMouseUp(
    e: MouseEvent,
    paneWidget: PaneWidget | null,
    model: ChartModel,
    drawingManager: DrawingManager,
    state: EventHandlerState
): void {
    const canvas = paneWidget?.canvas;
    if (!canvas) return;

    const paneRect = canvas.getBoundingClientRect();

    if (state.isDragging) {
        state.isDragging = false;
        model.rightPriceScale.endScroll();
    }
    if (state.isPriceScaleDragging) {
        model.rightPriceScale.endScale();
        state.isPriceScaleDragging = false;
    }
    if (state.isDraggingDrawing) {
        state.isDraggingDrawing = false;
        state.draggingControlPoint = -1;
    }

    // Finish brush or highlighter drawing on mouse up
    if (paneRect && drawingManager.activeDrawing &&
        (drawingManager.activeDrawing.type === 'brush' || drawingManager.activeDrawing.type === 'highlighter')) {
        const x = e.clientX - paneRect.left;
        const y = e.clientY - paneRect.top;
        drawingManager.finishDrawing(x, y);
    }
}

/**
 * Handle price axis mouse down
 */
export function handlePriceAxisMouseDown(
    e: MouseEvent,
    model: ChartModel,
    state: EventHandlerState
): void {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    state.isPriceScaleDragging = true;
    state.lastMouseY = rect.top;
    model.rightPriceScale.startScale(e.clientY - rect.top);
}

/**
 * Handle price axis double click
 */
export function handlePriceAxisDoubleClick(model: ChartModel): void {
    model.rightPriceScale.setAutoScale(true);
    model.recalculateAllPanes();
}
