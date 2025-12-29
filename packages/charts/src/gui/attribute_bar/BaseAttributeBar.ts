/**
 * Base Attribute Bar
 * Common infrastructure for floating toolbar
 */

import { Delegate } from '../../helpers/delegate';
import { Drawing } from '../../drawings';
import { DrawingType } from '../../drawings/drawing';
import { createToolbarButton, createSeparator, createColorButton, createLineWidthButton, ICONS } from './components';

/**
 * Events emitted by attribute bar
 */
export interface AttributeBarEvents {
    colorChanged: Delegate<string>;
    lineWidthChanged: Delegate<number>;
    lineStyleChanged: Delegate<'solid' | 'dashed' | 'dotted'>;
    deleteClicked: Delegate<void>;
    lockClicked: Delegate<void>;
    cloneClicked: Delegate<void>;
    settingsClicked: Delegate<void>;
}

/**
 * Floating toolbar for editing drawing attributes
 */
export class BaseAttributeBar {
    protected _element: HTMLElement | null = null;
    protected _isVisible: boolean = false;
    protected _currentDrawing: Drawing | null = null;

    // Drag state
    private _isDragging: boolean = false;
    private _dragStartX: number = 0;
    private _dragStartY: number = 0;
    private _elementStartX: number = 0;
    private _elementStartY: number = 0;
    private _boundMouseMove: (e: MouseEvent) => void;
    private _boundMouseUp: (e: MouseEvent) => void;

    // Events
    readonly colorChanged = new Delegate<string>();
    readonly lineWidthChanged = new Delegate<number>();
    readonly lineStyleChanged = new Delegate<'solid' | 'dashed' | 'dotted'>();
    readonly deleteClicked = new Delegate<void>();
    readonly lockClicked = new Delegate<void>();
    readonly cloneClicked = new Delegate<void>();
    readonly settingsClicked = new Delegate<void>();

    constructor(container: HTMLElement) {
        this._boundMouseMove = this._onMouseMove.bind(this);
        this._boundMouseUp = this._onMouseUp.bind(this);
        this._createElement(container);
    }

    // --- Public API ---

    show(drawing: Drawing): void {
        if (!this._element) return;

        this._currentDrawing = drawing;
        this._rebuildForDrawingType(drawing.type);
        this._element.style.display = 'flex';
        this._isVisible = true;
    }

    hide(): void {
        if (!this._element) return;
        this._element.style.display = 'none';
        this._isVisible = false;
        this._currentDrawing = null;
    }

    isVisible(): boolean {
        return this._isVisible;
    }

    dispose(): void {
        document.removeEventListener('mousemove', this._boundMouseMove);
        document.removeEventListener('mouseup', this._boundMouseUp);

        this.colorChanged.destroy();
        this.lineWidthChanged.destroy();
        this.lineStyleChanged.destroy();
        this.deleteClicked.destroy();
        this.lockClicked.destroy();
        this.cloneClicked.destroy();
        this.settingsClicked.destroy();

        if (this._element?.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
        this._element = null;
    }

    // --- Protected: Bar Building ---

    protected _rebuildForDrawingType(drawingType: DrawingType): void {
        if (!this._element) return;
        this._element.innerHTML = '';

        // Drag handle - always present
        this._addDragHandle();

        // Build type-specific buttons
        switch (drawingType) {
            case 'fibRetracement':
            case 'fibExtension':
            case 'fibChannel':
                this._buildFibonacciBar();
                break;
            case 'trendLine':
            case 'ray':
            case 'extendedLine':
                this._buildTrendLineBar();
                break;
            case 'horizontalLine':
            case 'verticalLine':
                this._buildSimpleLineBar();
                break;
            case 'rectangle':
            case 'ellipse':
                this._buildShapeBar();
                break;
            case 'parallelChannel':
                this._buildChannelBar();
                break;
            default:
                this._buildDefaultBar();
        }
    }

    protected _buildFibonacciBar(): void {
        this._addTemplateButton();
        this._addSeparator();
        this._addColorButton();
        this._addLineWidthButton();
        this._addSeparator();
        this._addSettingsButton();
        this._addLockButton();
        this._addSeparator();
        this._addDeleteButton();
        this._addMoreButton();
    }

    protected _buildTrendLineBar(): void {
        this._addTemplateButton();
        this._addSeparator();
        this._addColorButton();
        this._addLineWidthButton();
        this._addSeparator();
        this._addSettingsButton();
        this._addLockButton();
        this._addSeparator();
        this._addDeleteButton();
        this._addMoreButton();
    }

    protected _buildSimpleLineBar(): void {
        this._addColorButton();
        this._addLineWidthButton();
        this._addSeparator();
        this._addLockButton();
        this._addDeleteButton();
    }

    protected _buildShapeBar(): void {
        // Border color
        this._addColorButton('color', 'Border Color');
        // Fill color
        this._addColorButton('fillColor', 'Background Color');
        this._addLineWidthButton();
        this._addSeparator();
        this._addSettingsButton();
        this._addLockButton();
        this._addDeleteButton();
    }

    protected _buildChannelBar(): void {
        this._addColorButton();
        this._addLineWidthButton();
        this._addSeparator();
        this._addSettingsButton();
        this._addLockButton();
        this._addDeleteButton();
    }

    protected _buildDefaultBar(): void {
        this._addColorButton();
        this._addLineWidthButton();
        this._addSeparator();
        this._addLockButton();
        this._addDeleteButton();
    }

    // --- Protected: Button Helpers ---

    protected _addDragHandle(): void {
        if (!this._element) return;
        const btn = createToolbarButton(
            { icon: ICONS.drag, title: 'Move toolbar', className: 'drag-handle' },
            () => { }
        );
        btn.style.cursor = 'grab';
        btn.addEventListener('mousedown', (e) => {
            btn.style.cursor = 'grabbing';
            this._onDragStart(e);
        });
        btn.addEventListener('mouseup', () => {
            btn.style.cursor = 'grab';
        });
        this._element.appendChild(btn);
    }

    protected _addTemplateButton(): void {
        if (!this._element) return;
        const btn = createToolbarButton(
            { icon: ICONS.template, title: 'Template' },
            () => this.settingsClicked.fire()
        );
        this._element.appendChild(btn);
    }

    protected _addSeparator(): void {
        if (!this._element) return;
        this._element.appendChild(createSeparator());
    }

    protected _addColorButton(property: 'color' | 'fillColor' = 'color', title: string = 'Color'): void {
        if (!this._element || !this._currentDrawing) return;
        const icon = property === 'fillColor' ? ICONS.fillBucket : ICONS.pencil;
        const colorBtn = createColorButton(
            this._currentDrawing,
            { property, icon, title },
            (color) => this.colorChanged.fire(color)
        );
        this._element.appendChild(colorBtn);
    }

    protected _addLineWidthButton(): void {
        if (!this._element || !this._currentDrawing) return;
        const btn = createLineWidthButton(
            this._currentDrawing,
            (width) => this.lineWidthChanged.fire(width)
        );
        this._element.appendChild(btn);
    }

    protected _addSettingsButton(): void {
        if (!this._element) return;
        const btn = createToolbarButton(
            { icon: ICONS.settings, title: 'Settings' },
            () => this.settingsClicked.fire()
        );
        this._element.appendChild(btn);
    }

    protected _addLockButton(): void {
        if (!this._element) return;
        const btn = createToolbarButton(
            { icon: ICONS.lock, title: 'Lock drawing' },
            () => this.lockClicked.fire()
        );
        this._element.appendChild(btn);
    }

    protected _addDeleteButton(): void {
        if (!this._element) return;
        const btn = createToolbarButton(
            { icon: ICONS.delete, title: 'Delete', isDestructive: true },
            () => this.deleteClicked.fire()
        );
        this._element.appendChild(btn);
    }

    protected _addMoreButton(): void {
        if (!this._element) return;
        const btn = createToolbarButton(
            { icon: ICONS.more, title: 'More options' },
            () => { }
        );
        this._element.appendChild(btn);
    }

    // --- Private: Element Creation ---

    private _createElement(container: HTMLElement): void {
        this._element = document.createElement('div');
        this._element.style.cssText = `
            position: absolute;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            display: none;
            align-items: center;
            background: #1e222d;
            border-radius: 6px;
            padding: 4px 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            z-index: 2000;
            gap: 2px;
        `;
        container.appendChild(this._element);
    }

    // --- Private: Drag Handling ---

    private _onDragStart(e: MouseEvent): void {
        if (!this._element) return;

        this._isDragging = true;
        this._dragStartX = e.clientX;
        this._dragStartY = e.clientY;

        const rect = this._element.getBoundingClientRect();
        this._elementStartX = rect.left;
        this._elementStartY = rect.top;

        document.addEventListener('mousemove', this._boundMouseMove);
        document.addEventListener('mouseup', this._boundMouseUp);
    }

    private _onMouseMove(e: MouseEvent): void {
        if (!this._isDragging || !this._element) return;

        const dx = e.clientX - this._dragStartX;
        const dy = e.clientY - this._dragStartY;

        this._element.style.left = `${this._elementStartX + dx}px`;
        this._element.style.top = `${this._elementStartY + dy}px`;
        this._element.style.transform = 'none';
    }

    private _onMouseUp(): void {
        this._isDragging = false;
        document.removeEventListener('mousemove', this._boundMouseMove);
        document.removeEventListener('mouseup', this._boundMouseUp);
    }
}
