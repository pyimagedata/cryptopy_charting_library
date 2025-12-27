/**
 * Floating Attribute Bar - Appears when a drawing is selected
 * TradingView-style toolbar for quick property editing
 */

import { Delegate } from '../helpers/delegate';
import { Drawing } from '../drawings';
import { DrawingType } from '../drawings/drawing';

/** Full color palette - matches TradingView */
const COLOR_PALETTE = [
    // Row 1: Grayscale
    ['#ffffff', '#e0e0e0', '#bdbdbd', '#9e9e9e', '#757575', '#616161', '#424242', '#303030', '#212121', '#000000'],
    // Row 2: Vibrant
    ['#f44336', '#ff9800', '#ffeb3b', '#4caf50', '#00bcd4', '#2196f3', '#673ab7', '#9c27b0', '#e91e63', '#f44336'],
    // Row 3: Medium
    ['#ef9a9a', '#ffcc80', '#fff59d', '#a5d6a7', '#80deea', '#90caf9', '#b39ddb', '#ce93d8', '#f48fb1', '#ef9a9a'],
    // Row 4: Light
    ['#ffcdd2', '#ffe0b2', '#fff9c4', '#c8e6c9', '#b2ebf2', '#bbdefb', '#d1c4e9', '#e1bee7', '#f8bbd9', '#ffcdd2'],
    // Row 5: Pastel
    ['#ff8a80', '#ffd180', '#ffff8d', '#b9f6ca', '#84ffff', '#82b1ff', '#b388ff', '#ea80fc', '#ff80ab', '#ff8a80'],
    // Row 6: Bright
    ['#ff5252', '#ffab40', '#ffff00', '#69f0ae', '#18ffff', '#448aff', '#7c4dff', '#e040fb', '#ff4081', '#ff5252'],
    // Row 7: Dark
    ['#d32f2f', '#f57c00', '#fbc02d', '#388e3c', '#0097a7', '#1976d2', '#512da8', '#7b1fa2', '#c2185b', '#d32f2f'],
    // Row 8: Darker
    ['#b71c1c', '#e65100', '#f57f17', '#1b5e20', '#006064', '#0d47a1', '#311b92', '#4a148c', '#880e4f', '#b71c1c'],
];

/** Line width options */
const LINE_WIDTHS = [1, 2, 3, 4];

/** SVG Icons */
const ICONS = {
    drag: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="5" cy="4" r="1.3"/><circle cx="11" cy="4" r="1.3"/>
        <circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/>
        <circle cx="5" cy="12" r="1.3"/><circle cx="11" cy="12" r="1.3"/>
    </svg>`,
    template: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
        <line x1="21" y1="3" x2="24" y2="3"/>
        <line x1="22.5" y1="1.5" x2="22.5" y2="4.5"/>
    </svg>`,
    pencil: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
    </svg>`,
    lineStyle: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>`,
    settings: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
        <circle cx="12" cy="12" r="3"/>
    </svg>`,
    lock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="5" y="11" width="14" height="10" rx="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>`,
    delete: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>`,
    more: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="5" cy="12" r="2" fill="currentColor"/>
        <circle cx="12" cy="12" r="2" fill="currentColor"/>
        <circle cx="19" cy="12" r="2" fill="currentColor"/>
    </svg>`,
};

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
export class FloatingAttributeBar {
    private _element: HTMLElement | null = null;
    private _isVisible: boolean = false;
    private _currentDrawing: Drawing | null = null;

    // Drag state
    private _isDragging: boolean = false;
    private _dragStartX: number = 0;
    private _dragStartY: number = 0;
    private _elementStartX: number = 0;
    private _elementStartY: number = 0;

    // Bound event handlers for cleanup
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
        // Bind event handlers
        this._boundMouseMove = this._onMouseMove.bind(this);
        this._boundMouseUp = this._onMouseUp.bind(this);

        this._createElement(container);
    }

    // --- Public Methods ---

    /** Show the attribute bar for a drawing */
    show(drawing: Drawing): void {
        if (!this._element) return;

        this._currentDrawing = drawing;

        // Rebuild bar for specific drawing type
        this._rebuildForDrawingType(drawing.type);

        this._updateFromDrawing(drawing);
        this._element.style.display = 'flex';
        this._isVisible = true;
    }

    /** Hide the attribute bar */
    hide(): void {
        if (!this._element) return;

        this._element.style.display = 'none';
        this._isVisible = false;
        this._currentDrawing = null;
    }

    get isVisible(): boolean {
        return this._isVisible;
    }

    // --- Private Methods ---

    private _createElement(container: HTMLElement): void {
        this._element = document.createElement('div');
        this._element.className = 'floating-attribute-bar';
        this._element.style.cssText = `
            position: absolute;
            top: 46px;
            left: 50%;
            transform: translateX(-50%);
            display: none;
            align-items: center;
            gap: 2px;
            padding: 4px 8px;
            background: #1e222d;
            border: 1px solid #2B2B43;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            z-index: 500;
            font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif;
            user-select: none;
        `;

        // Drag handle - special handling for dragging
        const dragHandle = this._createButton(ICONS.drag, 'Move toolbar', () => { }, 'drag-handle');
        dragHandle.style.cursor = 'grab';
        dragHandle.addEventListener('mousedown', (e) => {
            dragHandle.style.cursor = 'grabbing';
            this._onDragStart(e);
        });
        dragHandle.addEventListener('mouseup', () => {
            dragHandle.style.cursor = 'grab';
        });

        // Template button (opens settings modal)
        this._createButton(ICONS.template, 'Template', () => this.settingsClicked.fire());

        // Separator
        this._createSeparator();

        // Color picker section (pencil with rainbow bar)
        this._createColorPickerButton();

        // Line style picker (3 horizontal lines)
        this._createLineStyleButton();

        // Separator
        this._createSeparator();

        // Settings button (hexagon/gear - opens settings modal)
        this._createButton(ICONS.settings, 'Settings', () => this.settingsClicked.fire());

        // Lock button
        this._createButton(ICONS.lock, 'Lock drawing', () => this.lockClicked.fire());

        // Separator
        this._createSeparator();

        // Delete button
        this._createButton(ICONS.delete, 'Delete', () => this.deleteClicked.fire(), 'delete-btn');

        // More options
        this._createButton(ICONS.more, 'More options', () => { });

        container.appendChild(this._element);
        this._container = container;
    }

    private _container: HTMLElement | null = null;

    /** Rebuild the attribute bar for a specific drawing type */
    private _rebuildForDrawingType(drawingType: DrawingType): void {
        if (!this._element) return;

        // Clear existing content except the element itself
        this._element.innerHTML = '';

        // Drag handle - always present
        const dragHandle = this._createButton(ICONS.drag, 'Move toolbar', () => { }, 'drag-handle');
        dragHandle.style.cursor = 'grab';
        dragHandle.addEventListener('mousedown', (e) => {
            dragHandle.style.cursor = 'grabbing';
            this._onDragStart(e);
        });
        dragHandle.addEventListener('mouseup', () => {
            dragHandle.style.cursor = 'grab';
        });

        // Build type-specific buttons
        switch (drawingType) {
            case 'fibRetracement':
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

    /** Fibonacci Retracement attribute bar */
    private _buildFibonacciBar(): void {
        // Template button
        this._createButton(ICONS.template, 'Template', () => this.settingsClicked.fire());
        this._createSeparator();

        // Color picker (pencil with rainbow)
        this._createColorPickerButton();

        // Line width (3 horizontal lines)
        this._createLineStyleButton();

        this._createSeparator();

        // Settings (gear/hexagon)
        this._createButton(ICONS.settings, 'Settings', () => this.settingsClicked.fire());

        // Lock
        this._createButton(ICONS.lock, 'Lock drawing', () => this.lockClicked.fire());

        this._createSeparator();

        // Delete
        this._createButton(ICONS.delete, 'Delete', () => this.deleteClicked.fire(), 'delete-btn');

        // More
        this._createButton(ICONS.more, 'More options', () => { });
    }

    /** Trend Line, Ray, Extended Line attribute bar */
    private _buildTrendLineBar(): void {
        // Template button
        this._createButton(ICONS.template, 'Template', () => this.settingsClicked.fire());
        this._createSeparator();

        // Color picker
        this._createColorPickerButton();

        // Line width
        this._createLineStyleButton();

        this._createSeparator();

        // Settings (gear/hexagon)
        this._createButton(ICONS.settings, 'Settings', () => this.settingsClicked.fire());

        // Lock
        this._createButton(ICONS.lock, 'Lock drawing', () => this.lockClicked.fire());

        this._createSeparator();

        // Delete
        this._createButton(ICONS.delete, 'Delete', () => this.deleteClicked.fire(), 'delete-btn');

        // More
        this._createButton(ICONS.more, 'More options', () => { });
    }

    /** Horizontal/Vertical Line attribute bar */
    private _buildSimpleLineBar(): void {
        // Color picker
        this._createColorPickerButton();

        // Line width
        this._createLineStyleButton();

        this._createSeparator();

        // Lock
        this._createButton(ICONS.lock, 'Lock drawing', () => this.lockClicked.fire());

        // Delete
        this._createButton(ICONS.delete, 'Delete', () => this.deleteClicked.fire(), 'delete-btn');
    }

    /** Rectangle, Ellipse attribute bar */
    private _buildShapeBar(): void {
        // Border color
        this._createColorPickerButton();

        // Line width
        this._createLineStyleButton();

        this._createSeparator();

        // Settings
        this._createButton(ICONS.settings, 'Settings', () => this.settingsClicked.fire());

        // Lock
        this._createButton(ICONS.lock, 'Lock drawing', () => this.lockClicked.fire());

        // Delete
        this._createButton(ICONS.delete, 'Delete', () => this.deleteClicked.fire(), 'delete-btn');
    }

    /** Parallel Channel attribute bar */
    private _buildChannelBar(): void {
        // Color picker
        this._createColorPickerButton();

        // Line width
        this._createLineStyleButton();

        this._createSeparator();

        // Settings
        this._createButton(ICONS.settings, 'Settings', () => this.settingsClicked.fire());

        // Lock
        this._createButton(ICONS.lock, 'Lock drawing', () => this.lockClicked.fire());

        // Delete
        this._createButton(ICONS.delete, 'Delete', () => this.deleteClicked.fire(), 'delete-btn');
    }

    /** Default attribute bar (fallback) */
    private _buildDefaultBar(): void {
        // Color picker
        this._createColorPickerButton();

        // Line width
        this._createLineStyleButton();

        this._createSeparator();

        // Lock
        this._createButton(ICONS.lock, 'Lock drawing', () => this.lockClicked.fire());

        // Delete
        this._createButton(ICONS.delete, 'Delete', () => this.deleteClicked.fire(), 'delete-btn');
    }


    private _createButton(icon: string, title: string, onClick: () => void, className: string = ''): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.innerHTML = icon;
        btn.title = title;
        btn.className = className;
        btn.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            background: transparent;
            border: none;
            border-radius: 4px;
            color: #787b86;
            cursor: pointer;
            transition: all 0.1s ease;
        `;

        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#2a2e39';
            btn.style.color = '#d1d4dc';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'transparent';
            btn.style.color = className === 'delete-btn' ? '#ef5350' : '#787b86';
        });

        if (className === 'delete-btn') {
            btn.style.color = '#ef5350';
        }

        btn.addEventListener('click', onClick);
        this._element!.appendChild(btn);
        return btn;
    }

    private _createSeparator(): void {
        const sep = document.createElement('div');
        sep.style.cssText = `
            width: 1px;
            height: 20px;
            background: #2B2B43;
            margin: 0 4px;
        `;
        this._element!.appendChild(sep);
    }

    /** Create color picker button with pencil icon and rainbow gradient bar */
    private _createColorPickerButton(): void {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
            padding: 2px 4px;
            position: relative;
        `;

        // Pencil icon button
        const btn = document.createElement('button');
        btn.innerHTML = ICONS.pencil;
        btn.title = 'Line color';
        btn.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 20px;
            background: transparent;
            border: none;
            color: #d1d4dc;
            cursor: pointer;
        `;

        // Rainbow gradient bar under pencil
        const rainbowBar = document.createElement('div');
        rainbowBar.style.cssText = `
            width: 22px;
            height: 4px;
            background: linear-gradient(90deg, 
                #ff0000, #ff8000, #ffff00, #80ff00, 
                #00ff00, #00ff80, #00ffff, #0080ff, 
                #0000ff, #8000ff, #ff00ff, #ff0080
            );
            border-radius: 2px;
            margin-top: 1px;
        `;

        wrapper.appendChild(btn);
        wrapper.appendChild(rainbowBar);

        // Hover effect
        wrapper.addEventListener('mouseenter', () => {
            wrapper.style.background = '#2a2e39';
            wrapper.style.borderRadius = '4px';
        });
        wrapper.addEventListener('mouseleave', () => {
            wrapper.style.background = 'transparent';
        });

        // Click to open color palette
        let paletteOpen = false;
        let palette: HTMLElement | null = null;

        wrapper.addEventListener('click', (e) => {
            e.stopPropagation();

            if (paletteOpen && palette) {
                palette.remove();
                paletteOpen = false;
                return;
            }

            palette = this._createColorPalette(this._currentDrawing?.style.color || '#ef5350', (selectedColor) => {
                if (this._currentDrawing) {
                    this._currentDrawing.style.color = selectedColor;
                    this.colorChanged.fire(selectedColor);
                }
                if (palette) {
                    palette.remove();
                    paletteOpen = false;
                }
            });

            wrapper.appendChild(palette);
            paletteOpen = true;

            // Close on outside click
            const closeHandler = (evt: MouseEvent) => {
                if (!wrapper.contains(evt.target as Node)) {
                    if (palette) {
                        palette.remove();
                        paletteOpen = false;
                    }
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 0);
        });

        this._element!.appendChild(wrapper);
    }

    /** Create line width button (3 horizontal lines icon) - cycles through widths */
    private _createLineStyleButton(): void {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            display: flex;
            align-items: center;
            cursor: pointer;
            padding: 4px;
            position: relative;
        `;

        const btn = document.createElement('button');
        btn.innerHTML = ICONS.lineStyle;
        btn.title = 'Line width';
        btn.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            background: transparent;
            border: none;
            color: #787b86;
            cursor: pointer;
            border-radius: 4px;
        `;

        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#2a2e39';
            btn.style.color = '#d1d4dc';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'transparent';
            btn.style.color = '#787b86';
        });

        // Toggle line width on click (1, 2, 3, 4)
        const widths = [1, 2, 3, 4];
        let currentWidthIdx = 0;

        btn.addEventListener('click', () => {
            currentWidthIdx = (currentWidthIdx + 1) % widths.length;
            const width = widths[currentWidthIdx];

            this.lineWidthChanged.fire(width);
            if (this._currentDrawing) {
                this._currentDrawing.style.lineWidth = width;
            }

            // Visual feedback - update icon line thickness
            const lines = btn.querySelectorAll('line');
            lines.forEach(line => {
                line.setAttribute('stroke-width', String(width));
            });
        });

        wrapper.appendChild(btn);
        this._element!.appendChild(wrapper);
    }


    /** Create a color button with icon and colored underline that opens a palette */
    private _createColorButton(
        container: HTMLElement,
        icon: string,
        initialColor: string,
        title: string,
        onColorSelect: (color: string) => void
    ): void {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
        `;

        // Icon button
        const btn = document.createElement('button');
        btn.innerHTML = icon;
        btn.title = title;
        btn.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 20px;
            background: transparent;
            border: none;
            border-radius: 4px;
            color: #d1d4dc;
            cursor: pointer;
        `;

        // Color bar under icon
        const colorBar = document.createElement('div');
        colorBar.style.cssText = `
            width: 20px;
            height: 4px;
            background: ${initialColor};
            border-radius: 2px;
            margin-top: 2px;
        `;

        wrapper.appendChild(btn);
        wrapper.appendChild(colorBar);

        // Hover effects
        wrapper.addEventListener('mouseenter', () => {
            btn.style.background = '#2a2e39';
        });
        wrapper.addEventListener('mouseleave', () => {
            btn.style.background = 'transparent';
        });

        // Click to open palette
        let paletteOpen = false;
        let palette: HTMLElement | null = null;

        wrapper.addEventListener('click', (e) => {
            e.stopPropagation();

            if (paletteOpen && palette) {
                palette.remove();
                paletteOpen = false;
                return;
            }

            // Create palette dropdown
            palette = this._createColorPalette(initialColor, (selectedColor) => {
                colorBar.style.background = selectedColor;
                onColorSelect(selectedColor);
                if (palette) {
                    palette.remove();
                    paletteOpen = false;
                }
            });

            wrapper.appendChild(palette);
            paletteOpen = true;

            // Close on outside click
            const closeHandler = (evt: MouseEvent) => {
                if (!wrapper.contains(evt.target as Node)) {
                    if (palette) {
                        palette.remove();
                        paletteOpen = false;
                    }
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 0);
        });

        container.appendChild(wrapper);
    }

    /** Create the color palette dropdown */
    private _createColorPalette(currentColor: string, onSelect: (color: string) => void): HTMLElement {
        const palette = document.createElement('div');
        palette.style.cssText = `
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            margin-top: 8px;
            padding: 12px;
            background: #1e222d;
            border: 1px solid #2B2B43;
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            z-index: 1000;
            display: flex;
            flex-direction: column;
            gap: 6px;
        `;

        // Color grid
        COLOR_PALETTE.forEach(row => {
            const rowEl = document.createElement('div');
            rowEl.style.cssText = `
                display: flex;
                gap: 2px;
            `;

            row.forEach(color => {
                const swatch = document.createElement('button');
                swatch.style.cssText = `
                    width: 22px;
                    height: 22px;
                    background: ${color};
                    border: 2px solid ${color === currentColor ? '#ffffff' : 'transparent'};
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all 0.1s;
                `;

                swatch.addEventListener('mouseenter', () => {
                    swatch.style.transform = 'scale(1.1)';
                    swatch.style.borderColor = '#ffffff';
                });
                swatch.addEventListener('mouseleave', () => {
                    swatch.style.transform = 'scale(1)';
                    swatch.style.borderColor = color === currentColor ? '#ffffff' : 'transparent';
                });
                swatch.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onSelect(color);
                });

                rowEl.appendChild(swatch);
            });

            palette.appendChild(rowEl);
        });

        // Add + button for custom color
        const addRow = document.createElement('div');
        addRow.style.cssText = `
            display: flex;
            align-items: center;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid #2B2B43;
        `;

        const addBtn = document.createElement('button');
        addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#787b86" stroke-width="2">
            <line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/>
        </svg>`;
        addBtn.style.cssText = `
            width: 24px;
            height: 24px;
            background: transparent;
            border: 1px dashed #2B2B43;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        addBtn.title = 'Add custom color';
        addRow.appendChild(addBtn);
        palette.appendChild(addRow);

        return palette;
    }

    private _createLineWidthPicker(): void {
        const container = document.createElement('div');
        container.style.cssText = `
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 0 4px;
            cursor: pointer;
        `;

        // Line preview
        const linePreview = document.createElement('div');
        linePreview.style.cssText = `
            width: 16px;
            height: 2px;
            background: #d1d4dc;
        `;
        container.appendChild(linePreview);

        // Width text
        const widthText = document.createElement('span');
        widthText.textContent = '2px';
        widthText.style.cssText = `
            color: #d1d4dc;
            font-size: 11px;
            font-weight: 500;
        `;
        container.appendChild(widthText);

        // Dropdown arrow
        const arrow = document.createElement('span');
        arrow.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M2 3L4 5L6 3" stroke="#787b86" stroke-width="1.5" stroke-linecap="round"/>
        </svg>`;
        container.appendChild(arrow);

        // Click handler - cycle through widths
        let currentWidth = 2;
        container.addEventListener('click', () => {
            const idx = LINE_WIDTHS.indexOf(currentWidth);
            currentWidth = LINE_WIDTHS[(idx + 1) % LINE_WIDTHS.length];
            widthText.textContent = `${currentWidth}px`;
            linePreview.style.height = `${currentWidth}px`;
            this.lineWidthChanged.fire(currentWidth);
            if (this._currentDrawing) {
                this._currentDrawing.style.lineWidth = currentWidth;
            }
        });

        container.addEventListener('mouseenter', () => {
            container.style.background = '#2a2e39';
            container.style.borderRadius = '4px';
        });
        container.addEventListener('mouseleave', () => {
            container.style.background = 'transparent';
        });

        this._element!.appendChild(container);
    }

    private _createLineStylePicker(): void {
        const container = document.createElement('div');
        container.style.cssText = `
            display: flex;
            align-items: center;
            padding: 4px 8px;
            cursor: pointer;
        `;

        // Solid line preview
        const linePreview = document.createElement('div');
        linePreview.style.cssText = `
            width: 20px;
            height: 2px;
            background: #d1d4dc;
        `;
        container.appendChild(linePreview);

        // Track style state
        const styles: Array<'solid' | 'dashed' | 'dotted'> = ['solid', 'dashed', 'dotted'];
        let currentStyleIdx = 0;

        container.addEventListener('click', () => {
            currentStyleIdx = (currentStyleIdx + 1) % styles.length;
            const style = styles[currentStyleIdx];

            switch (style) {
                case 'solid':
                    linePreview.style.background = '#d1d4dc';
                    linePreview.style.backgroundImage = 'none';
                    break;
                case 'dashed':
                    linePreview.style.background = 'repeating-linear-gradient(90deg, #d1d4dc 0px, #d1d4dc 4px, transparent 4px, transparent 8px)';
                    break;
                case 'dotted':
                    linePreview.style.background = 'repeating-linear-gradient(90deg, #d1d4dc 0px, #d1d4dc 2px, transparent 2px, transparent 5px)';
                    break;
            }

            this.lineStyleChanged.fire(style);
            if (this._currentDrawing) {
                this._currentDrawing.style.lineDash = style === 'solid' ? [] :
                    style === 'dashed' ? [6, 4] : [2, 2];
            }
        });

        container.addEventListener('mouseenter', () => {
            container.style.background = '#2a2e39';
            container.style.borderRadius = '4px';
        });
        container.addEventListener('mouseleave', () => {
            container.style.background = 'transparent';
        });

        this._element!.appendChild(container);
    }

    private _updateFromDrawing(drawing: Drawing): void {
        // Update UI to reflect current drawing properties
        // This could update color pickers, line width display, etc.
        // For now, this is a placeholder for future enhancements
        void drawing; // suppress unused warning
    }

    // --- Drag Handlers ---

    private _onDragStart(e: MouseEvent): void {
        if (!this._element) return;

        this._isDragging = true;
        this._dragStartX = e.clientX;
        this._dragStartY = e.clientY;

        // Get current position (parse from style)
        const rect = this._element.getBoundingClientRect();
        const parentRect = this._element.parentElement?.getBoundingClientRect();
        if (parentRect) {
            this._elementStartX = rect.left - parentRect.left;
            this._elementStartY = rect.top - parentRect.top;
        }

        // Add document listeners
        document.addEventListener('mousemove', this._boundMouseMove);
        document.addEventListener('mouseup', this._boundMouseUp);

        e.preventDefault();
        e.stopPropagation();
    }

    private _onMouseMove(e: MouseEvent): void {
        if (!this._isDragging || !this._element) return;

        const deltaX = e.clientX - this._dragStartX;
        const deltaY = e.clientY - this._dragStartY;

        const newX = this._elementStartX + deltaX;
        const newY = this._elementStartY + deltaY;

        // Update position - remove the centering transform and use fixed position
        this._element.style.left = `${newX}px`;
        this._element.style.top = `${newY}px`;
        this._element.style.transform = 'none';

        e.preventDefault();
    }

    private _onMouseUp(e: MouseEvent): void {
        if (!this._isDragging) return;

        this._isDragging = false;

        // Remove document listeners
        document.removeEventListener('mousemove', this._boundMouseMove);
        document.removeEventListener('mouseup', this._boundMouseUp);

        e.preventDefault();
    }

    // --- Cleanup ---

    dispose(): void {
        // Remove any lingering document listeners
        document.removeEventListener('mousemove', this._boundMouseMove);
        document.removeEventListener('mouseup', this._boundMouseUp);

        this.colorChanged.destroy();
        this.lineWidthChanged.destroy();
        this.lineStyleChanged.destroy();
        this.deleteClicked.destroy();
        this.lockClicked.destroy();
        this.cloneClicked.destroy();
        this.settingsClicked.destroy();

        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
        this._element = null;
    }
}
