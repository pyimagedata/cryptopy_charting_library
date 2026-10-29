/**
 * Base Attribute Bar
 * Common infrastructure for floating toolbar
 */

import { Delegate } from '../../helpers/delegate';
import { Drawing } from '../../drawings';
import { DrawingType } from '../../drawings/drawing';
import { AttributeBarItem } from '../../drawings/drawing-settings-config';
import { shapeAttributeBarItems } from '../../drawings/shape-common';
import { isAlertableDrawing } from '../../alerts/drawing-geometry';
import { t } from '../../helpers/translations';
import { createToolbarButton, createSeparator, createColorButton, createLineWidthButton, createLineStyleButton, createFontSizeButton, ICONS } from './components';
import { ATTR_BAR_STYLE, barColors, refreshButtonState } from './components/style';

/**
 * Events emitted by attribute bar
 */
export interface AttributeBarEvents {
    colorChanged: Delegate<string>;
    lineWidthChanged: Delegate<number>;
    lineStyleChanged: Delegate<'solid' | 'dashed' | 'dotted'>;
    fontSizeChanged: Delegate<number>;
    deleteClicked: Delegate<void>;
    lockClicked: Delegate<void>;
    cloneClicked: Delegate<void>;
    settingsClicked: Delegate<void>;
    /** Bell button (drawing alerts; only on alertable drawings) */
    alertClicked: Delegate<void>;
    /** More (...) button clicked; carries the button's bounding rect for menu placement */
    moreClicked: Delegate<DOMRect>;
}

/**
 * Floating toolbar for editing drawing attributes
 */
export class BaseAttributeBar {
    protected _element: HTMLElement | null = null;
    protected _isVisible: boolean = false;
    protected _currentDrawing: Drawing | null = null;
    protected _theme: 'dark' | 'light' = 'dark';

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
    readonly fontSizeChanged = new Delegate<number>();
    readonly deleteClicked = new Delegate<void>();
    readonly lockClicked = new Delegate<void>();
    readonly cloneClicked = new Delegate<void>();
    readonly settingsClicked = new Delegate<void>();
    readonly alertClicked = new Delegate<void>();
    readonly moreClicked = new Delegate<DOMRect>();

    private _lockBtn: HTMLButtonElement | null = null;

    constructor(container: HTMLElement) {
        this._boundMouseMove = this._onMouseMove.bind(this);
        this._boundMouseUp = this._onMouseUp.bind(this);
        this._createElement(container);
    }

    // --- Public API ---

    setTheme(theme: 'dark' | 'light'): void {
        if (this._theme === theme) return;
        this._theme = theme;

        if (this._element) {
            const c = barColors(theme);
            this._element.style.background = c.barBg;
            this._element.style.boxShadow = c.barShadow;
            this._element.style.border = `1px solid ${c.barBorder}`;
        }

        // Rebuild if visible to update buttons
        if (this._isVisible && this._currentDrawing) {
            this._rebuildForDrawingType(this._currentDrawing.type);
        }
    }

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
        this._lockBtn = null;
    }

    /** Updates the lock button icon/tooltip/active colour from the current drawing's locked flag (no rebuild) */
    syncLockState(): void {
        const btn = this._lockBtn;
        const drawing = this._currentDrawing;
        if (!btn || !drawing) return;
        this._applyLockState(btn, !!drawing.locked);
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
        this.fontSizeChanged.destroy();
        this.deleteClicked.destroy();
        this.lockClicked.destroy();
        this.cloneClicked.destroy();
        this.settingsClicked.destroy();
        this.alertClicked.destroy();
        this.moreClicked.destroy();

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
            case 'rotatedRectangle':
            case 'ellipse':
            case 'circle':
            case 'triangle':
            case 'arc':
            case 'path':
            case 'polyline':
            case 'brush':
            case 'highlighter':
            case 'curve':
            case 'doubleCurve':
            case 'cyclicLines':
            case 'timeCycles':
            case 'sineLine':
            case 'xabcdPattern':
            case 'cypherPattern':
            case 'elliotImpulse':
            case 'elliotCorrection':
            case 'elliotTriangle':
            case 'elliotDoubleCombo':
            case 'elliotTripleCombo':
            case 'abcd':
            case 'headShoulders':
            case 'trianglePattern':
            case 'threeDrives':
            case 'text':
            case 'callout':
            case 'note':
            case 'priceNote':
            case 'pin':
            case 'signpost':
            case 'comment':
            case 'table':
            case 'priceLabel':
            case 'flagMarked':
            case 'arrowMarkedUp':
            case 'arrowMarkedDown':
            case 'arrowMarkedLeft':
            case 'arrowMarkedRight':
            case 'arrowMarker':
            case 'anchoredVwap':
            case 'fixedRangeVolumeProfile':
            case 'anchoredVolumeProfile':
            case 'pitchfork':
            case 'schiffPitchfork':
            case 'modifiedSchiffPitchfork':
            case 'insidePitchfork':
            case 'pitchfan':
            case 'fibTimeZone':
            case 'trendBasedFibTime':
            case 'fibSpeedResistanceFan':
            case 'fibSpeedResistanceArcs':
            case 'fibCircles':
            case 'fibSpiral':
            case 'fibWedge':
            case 'gannBox':
            case 'gannSquareFixed':
            case 'gannSquare':
            case 'gannFan':
            case 'disjointChannel':
            case 'flatTopBottom':
            case 'projection':
            case 'positionForecast':
            case 'barsPattern':
            case 'ghostFeed':
                this._buildShapeBar();
                break;
            case 'parallelChannel':
                this._buildChannelBar();
                break;
            default:
                this._buildDefaultBar();
        }

        if (isAlertableDrawing(this._currentDrawing)) this._insertAlertButton();
    }

    /** Bell ("Add alert") just before the lock button (or at the end when the bar has none) */
    private _insertAlertButton(): void {
        if (!this._element) return;
        const btn = createToolbarButton(
            { icon: ICONS.bell, title: t('Add alert'), className: 'attr-bar-alert', theme: this._theme },
            () => this.alertClicked.fire()
        );
        const ref = this._lockBtn;
        if (ref && ref.parentNode === this._element) this._element.insertBefore(btn, ref);
        else this._element.appendChild(btn);
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
        this._addTextColorButton(); // Text color for line labels
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
        this._addMoreButton();
    }

    protected _buildShapeBar(): void {
        // Items come from the drawing (border color, fill color, width, style)
        const drawing: any = this._currentDrawing;
        const items: AttributeBarItem[] = typeof drawing?.getAttributeBarItems === 'function'
            ? drawing.getAttributeBarItems()
            : shapeAttributeBarItems();
        for (const item of items) {
            if (item.type === 'color') {
                if (item.key === 'fillColor' || item.key === 'color') {
                    // Eski davranis: yalnizca fillColor / color (kalem simgesi); icon verilirse ona uyulur
                    this._addColorButton(item.key === 'fillColor' ? 'fillColor' : 'color', item.tooltip, item.icon);
                } else {
                    this._addColorButton(item.key, item.tooltip, item.icon);
                }
            } else if (item.type === 'number' && item.key === 'fontSize') {
                this._addFontSizeSelect(item.tooltip);
            } else if (item.type === 'lineWidth') {
                this._addLineWidthButton();
            } else if (item.type === 'lineStyle') {
                this._addLineStyleButton();
            }
        }
        this._addSeparator();
        this._addSettingsButton();
        this._addLockButton();
        this._addDeleteButton();
        this._addMoreButton();
    }

    protected _buildChannelBar(): void {
        this._addColorButton();
        this._addLineWidthButton();
        this._addSeparator();
        this._addSettingsButton();
        this._addLockButton();
        this._addDeleteButton();
        this._addMoreButton();
    }

    protected _buildDefaultBar(): void {
        this._addColorButton();
        this._addLineWidthButton();
        this._addSeparator();
        this._addLockButton();
        this._addDeleteButton();
        this._addMoreButton();
    }

    // --- Protected: Button Helpers ---

    protected _addDragHandle(): void {
        if (!this._element) return;
        const btn = createToolbarButton(
            { icon: ICONS.drag, title: t('Move toolbar'), className: 'drag-handle', theme: this._theme },
            () => { }
        );
        btn.style.cursor = 'grab';
        btn.style.width = `${ATTR_BAR_STYLE.metrics.gripWidth}px`;
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
            { icon: ICONS.template, title: t('Template'), theme: this._theme },
            () => this.settingsClicked.fire()
        );
        this._element.appendChild(btn);
    }

    protected _addSeparator(): void {
        if (!this._element) return;
        const sep = createSeparator(this._theme);
        this._element.appendChild(sep);
    }

    protected _addColorButton(
        property: string = 'color',
        title: string = 'Color',
        iconName?: 'pencil' | 'fillBucket' | 'textColor'
    ): void {
        if (!this._element || !this._currentDrawing) return;
        const icon = iconName ? ICONS[iconName] : property === 'fillColor' ? ICONS.fillBucket : ICONS.pencil;
        const colorBtn = createColorButton(
            this._currentDrawing,
            { property, icon, title: t(title), theme: this._theme },
            (color) => this.colorChanged.fire(color)
        );
        this._element.appendChild(colorBtn);
    }

    /** Yazi boyutu secici (Text / Callout / Price Label / Arrow Mark / Arrow Marker): TV tarzi acilir dugme */
    protected _addFontSizeSelect(title: string = 'Font Size'): void {
        if (!this._element || !this._currentDrawing) return;
        const btn = createFontSizeButton(
            this._currentDrawing,
            t(title),
            (size) => this.fontSizeChanged.fire(size),
            this._theme
        );
        this._element.appendChild(btn);
    }

    protected _addLineWidthButton(): void {
        if (!this._element || !this._currentDrawing) return;
        const btn = createLineWidthButton(
            this._currentDrawing,
            (width) => this.lineWidthChanged.fire(width),
            this._theme
        );
        this._element.appendChild(btn);
    }

    protected _addLineStyleButton(): void {
        if (!this._element || !this._currentDrawing) return;
        const btn = createLineStyleButton(
            this._currentDrawing,
            (style) => this.lineStyleChanged.fire(style),
            this._theme
        );
        this._element.appendChild(btn);
    }

    protected _addTextColorButton(): void {
        if (!this._element || !this._currentDrawing) return;
        const colorBtn = createColorButton(
            this._currentDrawing,
            { property: 'textColor', icon: ICONS.textColor, title: t('Text Color'), theme: this._theme },
            (color) => this.colorChanged.fire(color)
        );
        this._element.appendChild(colorBtn);
    }

    protected _addSettingsButton(): void {
        if (!this._element) return;
        const btn = createToolbarButton(
            { icon: ICONS.settings, title: t('Settings'), theme: this._theme },
            () => this.settingsClicked.fire()
        );
        this._element.appendChild(btn);
    }

    protected _addLockButton(): void {
        if (!this._element) return;
        const btn = createToolbarButton(
            { icon: ICONS.lock, title: t('Lock'), theme: this._theme },
            () => this.lockClicked.fire()
        );
        this._lockBtn = btn;
        this._applyLockState(btn, !!this._currentDrawing?.locked);
        this._element.appendChild(btn);
    }

    private _applyLockState(btn: HTMLButtonElement, locked: boolean): void {
        btn.innerHTML = locked ? ICONS.lock : ICONS.lockOpen;
        btn.title = locked ? t('Unlock') : t('Lock');
        btn.dataset.locked = locked ? '1' : '0';
        // Locked state uses the accent icon colour (see bindButtonStates isToggled)
        refreshButtonState(btn);
    }

    protected _addDeleteButton(): void {
        if (!this._element) return;
        const btn = createToolbarButton(
            { icon: ICONS.delete, title: t('Delete'), isDestructive: true, theme: this._theme },
            () => this.deleteClicked.fire()
        );
        this._element.appendChild(btn);
    }

    protected _addMoreButton(): void {
        if (!this._element) return;
        const btn = createToolbarButton(
            { icon: ICONS.more, title: t('More options'), theme: this._theme },
            () => this.moreClicked.fire(btn.getBoundingClientRect())
        );
        this._element.appendChild(btn);
    }

    // --- Private: Element Creation ---

    private _createElement(container: HTMLElement): void {
        this._element = document.createElement('div');
        const m = ATTR_BAR_STYLE.metrics;
        const c = barColors(this._theme);
        this._element.style.cssText = `
            position: absolute;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            display: none;
            align-items: center;
            box-sizing: border-box;
            height: ${m.barHeight}px;
            background: ${c.barBg};
            border: 1px solid ${c.barBorder};
            border-radius: ${m.barRadius}px;
            padding: 0 ${m.barPadding}px;
            box-shadow: ${c.barShadow};
            z-index: 2000;
            gap: ${m.barGap}px;
            font-family: ${m.fontFamily};
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
