/**
 * Chart Widget Event Handlers
 * Mouse, wheel, and keyboard event handling for chart interactions
 */

import { ChartModel } from '../../model/chart-model';
import { PriceScale } from '../../model/price-scale';
import { DrawingManager } from '../../drawings';
import { InteractionTools, ToolEnv, MeasurePoint, computeZoomTarget, applyZoomTarget } from './interaction-tools';

/**
 * Interface for the chart widget context needed by event handlers
 */
export interface ChartWidgetContext {
    model: ChartModel;
    drawingManager: DrawingManager;
    paneCanvas: HTMLCanvasElement | null;
    element: HTMLElement | null;
    paneId: string | null;
    priceScale: PriceScale;

    // State
    isDragging: boolean;
    isDraggingDrawing: boolean;
    draggingControlPoint: number;
    isPriceScaleDragging: boolean;
    lastMouseX: number;
    lastMouseY: number;
    dragStartX: number;
    dragStartY: number;

    // Bar data for magnet
    getBarData?: () => { time: number; open: number; high: number; low: number; close: number }[];

    // Callbacks
    scheduleDraw: () => void;

    /** Klavye kisayollari icin: bu grafik aktif (odakli) grafik mi? (cok grafikli sayfada) */
    isActiveForKeyboard?: () => boolean;
    /** Arac secimi (toolbar ile ayni yol; toolbar vurgusu da guncellenir) */
    selectTool?: (tool: string) => void;

    /** Chart interaction tools (eraser / measure / zoom in / dot & demo cursors) */
    tools?: InteractionTools;
    /** Main pane scale + data access for the tools */
    getToolEnv?: () => ToolEnv | null;

    /** Bar replay shortcuts (Esc cancels selection, Shift+Down play/pause, Shift+Right step). */
    replay?: { handleKey(e: KeyboardEvent): boolean };
}

/** Odak bir metin giris alanindaysa true (kisayollar calinmasin) */
export function isTypingTarget(target: EventTarget | null): boolean {
    const isEditable = (el: Element | null): boolean => {
        if (!el) return false;
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        return (el as HTMLElement).isContentEditable === true;
    };
    if (target instanceof Element && isEditable(target)) return true;
    return isEditable(document.activeElement);
}

/** Ctrl/Cmd+surukle klonlamasi: imlec bu mesafeden fazla hareket edene kadar kopya olusturulmaz */
const CLONE_DRAG_THRESHOLD = 3;
let _pendingClone: { id: string; clientX: number; clientY: number } | null = null;

/** Alt/Option + tus -> arac (e.code kullanilir; macOS'ta Option e.key'i degistirir) */
const TOOL_SHORTCUTS: Record<string, string> = {
    KeyT: 'trendLine',
    KeyH: 'horizontalLine',
    KeyJ: 'horizontalRay',
    KeyV: 'verticalLine',
    KeyC: 'crossLine',
};

/**
 * Handle wheel event for zooming and panning
 */
export function handleWheel(e: WheelEvent, ctx: ChartWidgetContext): void {
    e.preventDefault();

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Determine if this is a horizontal scroll (trackpad swipe)
    const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);

    if (isHorizontal && !e.ctrlKey) {
        // Horizontal scroll - pan the chart
        ctx.model.timeScale.scrollBy(e.deltaX);
    } else {
        // Vertical scroll or pinch - zoom the chart
        // Match TradingView's zoom behavior:
        // - Factor of 0.1 gives smooth, controlled zoom
        // - Negative deltaY = scroll up = zoom in (positive scale)
        // - Positive deltaY = scroll down = zoom out (negative scale)
        const scrollSpeedAdjustment = e.ctrlKey ? 0.5 : 1.0;
        const deltaY = -(scrollSpeedAdjustment * e.deltaY / 100);

        if (deltaY !== 0) {
            const zoomScale = Math.sign(deltaY) * Math.min(1, Math.abs(deltaY));
            ctx.model.timeScale.zoom(x as any, zoomScale);
        }
    }

    ctx.model.recalculateAllPanes();
}


/**
 * Hit test control point - returns index or -1
 */
export function hitTestControlPoint(x: number, y: number, drawing: any): number {
    if (!drawing.getPixelPoints) return -1;

    // Callout: tutamaclar sabit (0) ve kelime kaydirma (1); kutu govdesi tutamac degil
    const points = typeof drawing.getHandlePoints === 'function' ? drawing.getHandlePoints() : drawing.getPixelPoints();
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

/** Pane-local pointer position relative to the canvas the tool gesture started on */
function toolLocal(e: MouseEvent, canvas: HTMLCanvasElement | null): { x: number; y: number } | null {
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return null;
    return {
        x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
        y: Math.max(0, Math.min(rect.height, e.clientY - rect.top)),
    };
}

/**
 * Effective magnet mode for one pointer event: Ctrl (not Cmd) temporarily toggles the magnet
 * (off -> weak, on -> off) like TradingView. Indicator panes and brush strokes never snap.
 */
function eventMagnetMode(e: MouseEvent, ctx: ChartWidgetContext): 'none' | 'weak' | 'strong' {
    if (ctx.paneId !== null) return 'none';
    const dm = ctx.drawingManager;
    const tool = dm.activeDrawing?.type ?? dm.mode;
    if (tool === 'brush' || tool === 'highlighter') return 'none';
    const base = dm.magnetMode;
    if (e.ctrlKey && !e.metaKey) return base === 'none' ? 'weak' : 'none';
    return base;
}

/** Pixel -> measure point (bar snapped, magnet aware) on the main pane */
function toolPoint(ctx: ChartWidgetContext, x: number, y: number): MeasurePoint | null {
    const env = ctx.getToolEnv?.();
    if (!env) return null;
    let px = x;
    let price: number | null = null;
    if (ctx.getBarData && ctx.drawingManager.magnetMode !== 'none') {
        const m = ctx.drawingManager.applyMagnet(x, y, ctx.getBarData(), ctx.paneId === null ? undefined : 'none');
        if (m.snappedX !== undefined) px = m.snappedX;
        if (m.snapped && m.snappedPrice !== undefined) price = m.snappedPrice;
    }
    if (price === null) price = env.priceScale.coordinateToPrice(y as any);
    const index = Math.round(env.timeScale.coordinateToFloatIndex(px as any));
    if (!isFinite(index) || !isFinite(price)) return null;
    return { index, price };
}

/**
 * Shift+drag on empty chart space starts Measure. Never when the press hits a drawing
 * (control point or body), so Shift-constrained endpoint drags and Shift+click selection work.
 */
export function shouldStartShiftMeasure(o: {
    shiftKey: boolean;
    mod: boolean;
    paneId: string | null;
    activeDrawing: unknown;
    hitDrawing: boolean;
}): boolean {
    return o.shiftKey && !o.mod && o.paneId === null && o.activeDrawing === null && !o.hitDrawing;
}

/**
 * Interaction tool mouse down. Returns the state update when the tool consumed the click,
 * or null to continue with the normal flow.
 */
function handleToolMouseDown(
    e: MouseEvent,
    ctx: ChartWidgetContext,
    x: number,
    y: number
): Partial<ChartWidgetContext> | null {
    const tools = ctx.tools!;

    if (tools.mode === 'eraser') {
        if (ctx.drawingManager.eraseDrawingAt(x, y, ctx.paneId)) {
            ctx.scheduleDraw();
            return {};
        }
        // Nothing under the cursor: plain panning (no selection while erasing)
        if (!ctx.priceScale.isAutoScale && ctx.paneCanvas) {
            ctx.priceScale.startScroll(e.clientY - ctx.paneCanvas.getBoundingClientRect().top);
        }
        return { isDragging: true, lastMouseX: e.clientX, lastMouseY: e.clientY };
    }

    if (tools.mode === 'measure') {
        if (ctx.paneId !== null) return {};
        tools.setCanvas(ctx.paneCanvas);
        if (tools.hasMeasure && !tools.measurePreviewing) {
            tools.clearMeasure();
            return {};
        }
        const p = toolPoint(ctx, x, y);
        if (!p) return {};
        if (tools.measurePreviewing) tools.measureFinish(p);
        else tools.measureStart(p, false);
        return {};
    }

    if (tools.mode === 'zoomIn') {
        if (ctx.paneId !== null) return {};
        tools.setCanvas(ctx.paneCanvas);
        tools.zoomStart(x, y);
        return {};
    }

    // Cursor tools: any click clears a finished measurement (Shift+drag measure is decided
    // in handleMouseDown after the drawing hit tests)
    tools.clearMeasure();
    tools.ripple(e.clientX, e.clientY);
    return null;
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

    // Cizim surerken (ilk nokta konmus) baska bir paneldeki tiklama cizimi bu panelin
    // olcegiyle tamamlar (onizlemede gorunen nokta); kaydirma baslatmaz.
    const finishingDrawing = ctx.drawingManager.mode !== 'none' && ctx.drawingManager.activeDrawing !== null;
    if (!isOverPane && !finishingDrawing) {
        return {
            isDragging: true,
            lastMouseX: e.clientX,
            lastMouseY: e.clientY
        };
    }

    // Interaction tools (eraser / measure / zoom in, Shift+drag measure) - not drawing modes
    if (ctx.tools && e.button === 0 && ctx.drawingManager.mode === 'none') {
        const handled = handleToolMouseDown(e, ctx, x, y);
        if (handled) return handled;
    }

    // Drawing tools must own pane clicks before existing drawings are hit-tested.
    // This lets new shapes start or finish even when the pointer is over another drawing.
    if (ctx.drawingManager.mode !== 'none') {
        // Apply magnet if enabled
        let finalX = x;
        let finalY = y;
        let snappedPrice: number | undefined;

        if (ctx.getBarData) {
            const barData = ctx.getBarData();
            const magnetResult = ctx.drawingManager.applyMagnet(x, y, barData, eventMagnetMode(e, ctx));

            // Snap X to bar center (only where a bar exists, magnet on)
            if (magnetResult.snappedX !== undefined) {
                finalX = magnetResult.snappedX;
            }

            if (magnetResult.snapped) {
                finalY = magnetResult.y;
                snappedPrice = magnetResult.snappedPrice;
            }
        }

        if (ctx.drawingManager.activeDrawing) {
            if (ctx.drawingManager.activeDrawing.type !== 'brush' &&
                ctx.drawingManager.activeDrawing.type !== 'highlighter') {
                ctx.drawingManager.finishDrawing(finalX, finalY, snappedPrice, e.shiftKey);
            }
        } else {
            ctx.drawingManager.startDrawing(finalX, finalY, snappedPrice);
        }
        return {};
    }

    if (!ctx.drawingManager.isLocked) {
        // Check if clicking on a control point of selected drawing
        const selected = ctx.drawingManager.selectedDrawing;
        if (selected && (selected.paneId ?? null) === ctx.paneId) {
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
                // Ctrl/Cmd + surukle: hareket esigi asilinca kopya olusturulur ve kopya surulur
                // (orijinal yerinde kalir); hareketsiz Ctrl+tik kopya uretmez
                _pendingClone = ((e.ctrlKey || e.metaKey) && !selected.locked)
                    ? { id: selected.id, clientX: e.clientX, clientY: e.clientY }
                    : null;
                return {
                    isDraggingDrawing: true,
                    draggingControlPoint: 99,
                    dragStartX: x,
                    dragStartY: y
                };
            }
        }

        // Try to select a drawing
        const hitDrawing = ctx.drawingManager.selectDrawingAt(x, y, ctx.paneId);
        if (hitDrawing) {
            return {
                isDraggingDrawing: true,
                draggingControlPoint: 99,
                dragStartX: x,
                dragStartY: y
            };
        }
    }

    // Shift+drag on empty space (nothing hit above) measures
    if (ctx.tools && e.button === 0 && ctx.drawingManager.mode === 'none' &&
        shouldStartShiftMeasure({
            shiftKey: e.shiftKey,
            mod: e.ctrlKey || e.metaKey,
            paneId: ctx.paneId,
            activeDrawing: ctx.drawingManager.activeDrawing,
            hitDrawing: false
        })) {
        const p = toolPoint(ctx, x, y);
        if (p) {
            ctx.tools.setCanvas(ctx.paneCanvas);
            ctx.tools.measureStart(p, true);
            return {};
        }
    }

    // Normal panning mode
    const result: Partial<ChartWidgetContext> = {
        isDragging: true,
        lastMouseX: e.clientX,
        lastMouseY: e.clientY
    };

        if (!ctx.priceScale.isAutoScale && ctx.paneCanvas) {
            const rect = ctx.paneCanvas.getBoundingClientRect();
            ctx.priceScale.startScroll(e.clientY - rect.top);
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
    };

    // Only update lastMouseY if not dragging price scale (need to keep relative to top)
    if (!ctx.isPriceScaleDragging) {
        result.lastMouseY = e.clientY;
    }

    const paneRect = ctx.paneCanvas?.getBoundingClientRect();

    // Interaction tools: pointer for dot/demo cursors, live measure / zoom rectangle
    const tools = ctx.tools;
    if (tools) {
        tools.setPointer(e.clientX, e.clientY);
        if (tools.measurePreviewing || tools.zoomDragging) {
            const local = toolLocal(e, tools.canvas);
            if (local) {
                if (tools.zoomDragging) {
                    tools.zoomMove(local.x, local.y);
                } else {
                    const p = toolPoint(ctx, local.x, local.y);
                    if (p) tools.measureMove(p);
                }
            }
        }
    }

    // Handle drawing dragging
    if (ctx.isDraggingDrawing && paneRect) {
        let dx = e.clientX - paneRect.left;
        let dy = e.clientY - paneRect.top;
        let snappedPrice: number | undefined;

        // Apply magnet if enabled and moving a control point (not the whole drawing)
        if (ctx.getBarData && ctx.draggingControlPoint !== 99) {
            const barData = ctx.getBarData();
            const magnetResult = ctx.drawingManager.applyMagnet(dx, dy, barData, eventMagnetMode(e, ctx));

            // Snap X to bar center when moving control points (only where a bar exists, magnet on)
            if (magnetResult.snappedX !== undefined) {
                dx = magnetResult.snappedX;
            }

            if (magnetResult.snapped) {
                dy = magnetResult.y;
                snappedPrice = magnetResult.snappedPrice;
            }
        }

        if (_pendingClone) {
            const moved = Math.hypot(e.clientX - _pendingClone.clientX, e.clientY - _pendingClone.clientY);
            if (moved <= CLONE_DRAG_THRESHOLD) {
                ctx.model.setCrosshairPosition(dx, dy, true);
                return result;
            }
            const cloneId = _pendingClone.id;
            _pendingClone = null;
            ctx.drawingManager.cloneDrawing(cloneId);
        }

        const selected = ctx.drawingManager.selectedDrawing;
        if (selected) {
            if (ctx.draggingControlPoint === 99) {
                ctx.drawingManager.moveDrawing(dx - ctx.dragStartX, dy - ctx.dragStartY);
                result.dragStartX = dx;
                result.dragStartY = dy;
            } else if (ctx.draggingControlPoint >= 0) {
                ctx.drawingManager.moveControlPoint(ctx.draggingControlPoint, dx, dy, snappedPrice, e.shiftKey);
            }
        }

        ctx.model.setCrosshairPosition(dx, dy, true);
        return result;
    }

    // Update drawing preview
    if (paneRect && ctx.drawingManager.activeDrawing) {
        let dx = e.clientX - paneRect.left;
        let dy = e.clientY - paneRect.top;
        let snappedPrice: number | undefined;

        // Apply magnet if enabled
        if (ctx.getBarData) {
            const barData = ctx.getBarData();
            const magnetResult = ctx.drawingManager.applyMagnet(dx, dy, barData, eventMagnetMode(e, ctx));

            // Snap X to bar center (only where a bar exists, magnet on)
            if (magnetResult.snappedX !== undefined) {
                dx = magnetResult.snappedX;
            }

            if (magnetResult.snapped) {
                dy = magnetResult.y;
                snappedPrice = magnetResult.snappedPrice;
            }
        }

        ctx.drawingManager.updateDrawing(dx, dy, snappedPrice, e.shiftKey);
    }

    if (ctx.isDragging) {
        ctx.model.timeScale.scrollBy(deltaX);

        if (!ctx.priceScale.isAutoScale && ctx.paneCanvas) {
            const rect = ctx.paneCanvas.getBoundingClientRect();
            ctx.priceScale.scrollTo(e.clientY - rect.top);
        }

        ctx.model.recalculateAllPanes();
    }

    if (ctx.isPriceScaleDragging) {
        ctx.priceScale.scaleTo(deltaY);
        ctx.scheduleDraw();
    }

    // Crosshair logic - update crosshair position during dragging too so it follows the cursor
    if (ctx.element && paneRect) {
        let x = e.clientX - paneRect.left;
        let y = e.clientY - paneRect.top;
        const chartAreaWidth = paneRect.width;

        // Apply magnet to crosshair when drawing mode is active (not during dragging)
        if (!ctx.isDragging && !ctx.isPriceScaleDragging && ctx.drawingManager.mode !== 'none' && ctx.getBarData) {
            const barData = ctx.getBarData();
            const magnetResult = ctx.drawingManager.applyMagnet(x, y, barData, eventMagnetMode(e, ctx));

            // Snap X to bar center (only where a bar exists, magnet on) to avoid "sliding" mismatch
            if (magnetResult.snappedX !== undefined) {
                x = magnetResult.snappedX;
            }

            if (magnetResult.snapped) {
                y = magnetResult.y;
            }
        }

        if (x >= 0 && x <= chartAreaWidth && y >= 0 && y <= paneRect.height) {
            ctx.model.setCrosshairPosition(x, y, true);
        } else if (x >= 0 && x <= chartAreaWidth) {
            ctx.model.setCrosshairPosition(x, y, true);
        } else {
            ctx.model.setCrosshairPosition(0, 0, false);
        }
    } else if (ctx.element) {
        ctx.model.setCrosshairPosition(0, 0, false);
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
    // Metin girisinde (ayar modali, sembol arama, metin editoru) kisayollar devre disi
    if (isTypingTarget(e.target)) return;

    // Cok grafikli sayfada kisayollar yalnizca aktif grafikte
    if (ctx.isActiveForKeyboard?.() === false) return;

    // Bar replay shortcuts
    if (ctx.replay?.handleKey(e)) return;

    const mod = e.ctrlKey || e.metaKey;

    // Undo / redo / copy / paste
    if (mod && !e.altKey) {
        if (e.code === 'KeyZ') {
            e.preventDefault();
            if (e.shiftKey) ctx.drawingManager.redo();
            else ctx.drawingManager.undo();
            ctx.scheduleDraw();
            return;
        }
        if (e.code === 'KeyY') {
            e.preventDefault();
            ctx.drawingManager.redo();
            ctx.scheduleDraw();
            return;
        }
        if (e.code === 'KeyC' && ctx.drawingManager.selectedDrawing) {
            e.preventDefault();
            ctx.drawingManager.copySelected();
            return;
        }
        if (e.code === 'KeyV' && ctx.drawingManager.hasClipboard) {
            e.preventDefault();
            ctx.drawingManager.pasteFromClipboard();
            ctx.scheduleDraw();
            return;
        }
    }

    // Arac kisayollari: Alt/Option + T/H/J/V/C
    if (e.altKey && !mod && !e.shiftKey && TOOL_SHORTCUTS[e.code]) {
        e.preventDefault();
        ctx.selectTool?.(TOOL_SHORTCUTS[e.code]);
        return;
    }

    // Esc: clear a measurement / cancel a zoom rectangle / leave Eraser, Measure, Zoom In
    if (e.key === 'Escape' && ctx.tools && ctx.drawingManager.activeDrawing === null) {
        const tools = ctx.tools;
        const leaveTool = tools.mode !== 'none';
        if (tools.cancel()) {
            if (leaveTool) {
                if (ctx.selectTool) ctx.selectTool(tools.lastCursor);
                else tools.setTool(tools.lastCursor);
            }
            ctx.scheduleDraw();
            return;
        }
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = ctx.drawingManager.selectedDrawing;
        if (selected) {
            e.preventDefault();
            ctx.drawingManager.deleteDrawing(selected.id);
            ctx.scheduleDraw();
        }
    }

    if (e.key === 'Escape' || e.key === 'Enter') {
        const dm = ctx.drawingManager;
        const activeDrawing = dm.activeDrawing;
        // Cok noktali serbest cizimler: Esc / Enter bitirir (yeterli nokta yoksa atilir); Esc ayrica araci birakir
        const finishers: Record<string, () => void> = {
            path: () => dm.finishPathDrawing(),
            polyline: () => dm.finishPolylineDrawing(),
            ghostFeed: () => dm.finishGhostFeedDrawing(),
        };
        if (activeDrawing && finishers[activeDrawing.type]) {
            finishers[activeDrawing.type]();
            if (e.key === 'Escape' && dm.mode !== 'none') dm.setMode('none');
            ctx.scheduleDraw();
            return;
        }

        if (e.key === 'Enter') return;

        // Esc: yarim cizimi iptal et (gecmise yazilmaz), araci birak (imlec / toolbar vurgusu modeChanged ile doner)
        let handled = false;
        if (activeDrawing) {
            dm.cancelActiveDrawing();
            handled = true;
        }
        if (dm.mode !== 'none') {
            dm.setMode('none');
            handled = true;
        }
        // Arac yokken: secili cizimin secimini kaldir
        if (!handled || dm.selectedDrawing) dm.deselect();
        ctx.scheduleDraw();
    }
}

/**
 * Handle mouse leave
 */
export function handleMouseLeave(ctx: ChartWidgetContext): void {
    ctx.tools?.clearPointer();
    ctx.model.setCrosshairPosition(0, 0, false);
}

/**
 * Handle mouse up - returns updated state
 */
export function handleMouseUp(
    e: MouseEvent,
    ctx: ChartWidgetContext
): Partial<ChartWidgetContext> {
    const result: Partial<ChartWidgetContext> = {};

    const tools = ctx.tools;
    if (tools) {
        if (tools.measurePreviewing && tools.measureViaDrag) {
            // Shift+drag released: freeze the measurement (dropped when it has no extent)
            const local = toolLocal(e, tools.canvas);
            const p = local ? toolPoint(ctx, local.x, local.y) : null;
            if (p) tools.measureFinish(p);
            else tools.clearMeasure();
        }
        if (tools.zoomDragging) {
            const rect = tools.zoomEnd();
            const env = ctx.getToolEnv?.();
            if (rect && env) {
                const target = computeZoomTarget(
                    rect.x1, rect.y1, rect.x2, rect.y2,
                    (px) => env.timeScale.coordinateToFloatIndex(px as any),
                    (py) => env.priceScale.coordinateToPrice(py as any)
                );
                if (target) {
                    applyZoomTarget(target, env.timeScale, env.priceScale);
                    ctx.model.recalculateAllPanes();
                    // Zoom In is a one-shot tool: back to the cursor
                    if (ctx.selectTool) ctx.selectTool(tools.lastCursor);
                    else tools.setTool(tools.lastCursor);
                }
            }
            ctx.scheduleDraw();
        }
    }

    if (ctx.isDragging) {
        result.isDragging = false;
        ctx.priceScale.endScroll();
    }
    if (ctx.isPriceScaleDragging) {
        ctx.priceScale.endScale();
        result.isPriceScaleDragging = false;
    }
    _pendingClone = null;
    if (ctx.isDraggingDrawing) {
        result.isDraggingDrawing = false;
        result.draggingControlPoint = -1;
        // Surukleme (tasima / kontrol noktasi / klon) bitti: tek gecmis kaydi
        ctx.drawingManager.commitHistory();
    }

    // Finish brush or highlighter drawing on mouse up
    if (ctx.paneCanvas) {
        const paneRect = ctx.paneCanvas.getBoundingClientRect();
        if (paneRect && ctx.drawingManager.activeDrawing &&
            (ctx.drawingManager.activeDrawing.type === 'brush' ||
                ctx.drawingManager.activeDrawing.type === 'highlighter')) {
            const x = e.clientX - paneRect.left;
            const y = e.clientY - paneRect.top;
            ctx.drawingManager.finishDrawing(x, y);
        }
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
    ctx.priceScale.startScale(e.clientY - rect.top);

    return {
        isPriceScaleDragging: true,
        lastMouseY: rect.top
    };
}

/**
 * Handle price axis double click
 */
export function handlePriceAxisDoubleClick(ctx: ChartWidgetContext): void {
    ctx.priceScale.setAutoScale(true);
    ctx.model.recalculateAllPanes();
}
