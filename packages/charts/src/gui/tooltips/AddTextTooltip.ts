/**
 * AddTextTooltip - Modular component for "Add Text" hover tooltip on line drawings
 * 
 * This component handles:
 * - Tooltip element creation and styling
 * - Show/hide logic based on hover state
 * - Click events to open settings modal
 * - Hover state detection on line midpoints
 */

import { Drawing } from '../../drawings';

export interface AddTextTooltipConfig {
    /** Container element for positioning reference */
    container: HTMLElement;
    /** Callback when tooltip is clicked - should open settings modal */
    onTextClick: (drawing: Drawing) => void;
    /** Callback to trigger chart redraw */
    onHoverChange: () => void;
}

/** Line types that support the Add Text feature */
const LINE_TYPES = [
    'trendLine', 'ray', 'extendedLine', 'horizontalLine', 'verticalLine',
    'parallelChannel', 'trendAngle', 'horizontalRay', 'infoLine'
];

/**
 * AddTextTooltip component for adding text to line drawings
 */
export class AddTextTooltip {
    private _element: HTMLDivElement | null = null;
    private _container: HTMLElement;
    private _onTextClick: (drawing: Drawing) => void;
    private _onHoverChange: () => void;

    /** Currently hovered drawing ID for Add Text */
    private _hoveredDrawingId: string | null = null;

    constructor(config: AddTextTooltipConfig) {
        this._container = config.container;
        this._onTextClick = config.onTextClick;
        this._onHoverChange = config.onHoverChange;
    }

    // --- Public API ---

    /** Get the currently hovered drawing ID */
    get hoveredDrawingId(): string | null {
        return this._hoveredDrawingId;
    }

    /**
     * Check if mouse is near a line midpoint and show/hide tooltip accordingly
     * @param drawings Array of drawings to check
     * @param mouseX Mouse X coordinate relative to pane
     * @param mouseY Mouse Y coordinate relative to pane
     * @param paneRect Pane bounding rect for positioning
     */
    handleMouseMove(
        drawings: Drawing[],
        mouseX: number,
        mouseY: number,
        paneRect: DOMRect
    ): void {
        let foundMidpoint = false;
        let midX = 0, midY = 0;
        let targetDrawing: Drawing | null = null;

        for (const drawing of drawings) {
            // Skip non-line types
            if (!LINE_TYPES.includes(drawing.type)) continue;
            // Skip drawings that already have text
            if (drawing.style.text && drawing.style.text.trim()) continue;

            // Get pixel points (already in screen coordinates)
            const pixelPoints = (drawing as any).getPixelPoints?.();
            if (!pixelPoints || pixelPoints.length < 2) continue;

            const p1 = pixelPoints[0];
            const p2 = pixelPoints[1];

            // Calculate midpoint in screen coords
            midX = (p1.x + p2.x) / 2;
            midY = (p1.y + p2.y) / 2;

            // Check if mouse is near midpoint (within 30px)
            const dist = Math.sqrt((mouseX - midX) ** 2 + (mouseY - midY) ** 2);
            if (dist < 30) {
                foundMidpoint = true;
                targetDrawing = drawing;
                break;
            }
        }

        if (foundMidpoint && targetDrawing) {
            this._show(midX, midY, targetDrawing, paneRect);
            if (this._hoveredDrawingId !== targetDrawing.id) {
                this._hoveredDrawingId = targetDrawing.id;
                this._onHoverChange();
            }
        } else {
            this._hide();
            if (this._hoveredDrawingId !== null) {
                this._hoveredDrawingId = null;
                this._onHoverChange();
            }
        }
    }

    /** Hide the tooltip and clear hover state */
    hide(): void {
        this._hide();
        if (this._hoveredDrawingId !== null) {
            this._hoveredDrawingId = null;
            this._onHoverChange();
        }
    }

    /** Dispose the tooltip element */
    dispose(): void {
        if (this._element) {
            this._element.remove();
            this._element = null;
        }
        this._hoveredDrawingId = null;
    }

    // --- Private Methods ---

    /** Show tooltip at position */
    private _show(x: number, y: number, drawing: Drawing, paneRect: DOMRect): void {
        if (!this._element) {
            this._createElement(drawing);
        }

        // Calculate rotation angle based on line
        const pixelPoints = (drawing as any).getPixelPoints?.();
        if (pixelPoints && pixelPoints.length >= 2) {
            const dx = pixelPoints[1].x - pixelPoints[0].x;
            const dy = pixelPoints[1].y - pixelPoints[0].y;
            let angle = Math.atan2(dy, dx) * (180 / Math.PI);
            if (angle > 90) angle -= 180;
            if (angle < -90) angle += 180;
            this._element!.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
        }

        this._element!.style.left = `${paneRect.left + x}px`;
        this._element!.style.top = `${paneRect.top + y}px`;
        this._element!.style.display = 'block';
    }

    /** Hide tooltip */
    private _hide(): void {
        if (this._element) {
            this._element.style.display = 'none';
        }
    }

    /** Create tooltip DOM element */
    private _createElement(drawing: Drawing): void {
        this._element = document.createElement('div');
        this._element.className = 'add-text-tooltip';
        this._element.style.cssText = `
            position: fixed;
            padding: 2px 4px;
            background: transparent;
            color: #787B86;
            font-size: 12px;
            font-weight: 400;
            cursor: pointer;
            pointer-events: auto;
            white-space: nowrap;
            z-index: 10000;
            text-shadow: 0 0 4px rgba(0,0,0,0.8);
            transform: translate(-50%, -50%);
            user-select: none;
        `;
        this._element.textContent = '+ Add Text';

        this._element.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this._hoveredDrawingId) {
                // Find the drawing by ID
                const targetDrawing = (drawing as any);
                if (targetDrawing) {
                    this._onTextClick(targetDrawing);
                }
            }
            this._hide();
        });

        // Store drawing reference for click handler
        (this._element as any)._drawing = drawing;

        // Update click handler to use stored reference
        this._element.onclick = (e) => {
            e.stopPropagation();
            const storedDrawing = (this._element as any)?._drawing;
            if (storedDrawing) {
                this._onTextClick(storedDrawing);
            }
            this._hide();
        };

        document.body.appendChild(this._element);
    }
}
