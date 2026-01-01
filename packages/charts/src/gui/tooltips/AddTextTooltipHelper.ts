/**
 * AddTextTooltipHelper - Simple helper for the Add Text tooltip DOM element
 * 
 * This helper ONLY handles:
 * - Creating and styling the tooltip DOM element
 * - Show/hide at specified coordinates
 * - Click callback
 * 
 * All hover detection and state management stays in ChartWidget.
 */

export interface TooltipClickHandler {
    (): void;
}

export class AddTextTooltipHelper {
    private _element: HTMLDivElement | null = null;
    private _onClick: TooltipClickHandler;

    constructor(onClick: TooltipClickHandler) {
        this._onClick = onClick;
    }

    /**
     * Show tooltip at the specified screen position with rotation
     */
    show(screenX: number, screenY: number, rotationDeg: number = 0): void {
        if (!this._element) {
            this._createElement();
        }

        this._element!.style.left = `${screenX}px`;
        this._element!.style.top = `${screenY}px`;
        this._element!.style.transform = `translate(-50%, -50%) rotate(${rotationDeg}deg)`;
        this._element!.style.display = 'block';
    }

    /**
     * Hide the tooltip
     */
    hide(): void {
        if (this._element) {
            this._element.style.display = 'none';
        }
    }

    /**
     * Dispose and remove the tooltip element
     */
    dispose(): void {
        if (this._element) {
            this._element.remove();
            this._element = null;
        }
    }

    // --- Private ---

    private _createElement(): void {
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
            this._onClick();
            this.hide();
        });

        document.body.appendChild(this._element);
    }
}
