/**
 * Drawing Settings Modal
 * Modal for editing drawing properties - TradingView-style
 */

import { Delegate } from '../helpers/delegate';
import { Drawing, DrawingSettingsProvider } from '../drawings';
import { FibRetracementDrawing, FIBONACCI_LEVELS } from '../drawings/fibonacci-retracement-drawing';

/** Tab configuration for settings modal */
interface SettingsTab {
    id: string;
    label: string;
    icon?: string;
}

/** Fibonacci level configuration */
interface FibLevelConfig {
    level: number;
    label: string;
    color: string;
    visible: boolean;
}

/**
 * Modal dialog for drawing settings
 */
export class DrawingSettingsModal {
    private _element: HTMLElement | null = null;
    private _overlay: HTMLElement | null = null;
    private _currentDrawing: Drawing | null = null;
    private _container: HTMLElement;

    // Events
    readonly closed = new Delegate<void>();
    readonly settingsChanged = new Delegate<Drawing>();

    // Fibonacci specific state
    private _fibLevels: FibLevelConfig[] = [];

    constructor(container: HTMLElement) {
        this._container = container;
    }

    /** Check if drawing implements DrawingSettingsProvider */
    private _isSettingsProvider(drawing: Drawing): drawing is Drawing & DrawingSettingsProvider {
        return 'getSettingsConfig' in drawing &&
            'getAttributeBarItems' in drawing &&
            'getSettingValue' in drawing &&
            'setSettingValue' in drawing;
    }

    /** Show the settings modal for a drawing */
    show(drawing: Drawing): void {
        this._currentDrawing = drawing;
        this._createElement();

        if (drawing.type === 'fibRetracement') {
            this._initFibonacciSettings(drawing as FibRetracementDrawing);
        }
    }

    /** Hide and destroy the modal */
    hide(): void {
        if (this._overlay) {
            this._overlay.remove();
            this._overlay = null;
        }
        if (this._element) {
            this._element.remove();
            this._element = null;
        }
        this._currentDrawing = null;
        this.closed.fire();
    }

    /** Get title for current drawing type */
    private _getDrawingTitle(): string {
        if (!this._currentDrawing) return 'Drawing Settings';

        switch (this._currentDrawing.type) {
            case 'trendLine': return 'Trend Line';
            case 'horizontalLine': return 'Horizontal Line';
            case 'verticalLine': return 'Vertical Line';
            case 'ray': return 'Ray';
            case 'infoLine': return 'Info Line';
            case 'extendedLine': return 'Extended Line';
            case 'trendAngle': return 'Trend Angle';
            case 'horizontalRay': return 'Horizontal Ray';
            case 'crossLine': return 'Cross Line';
            case 'parallelChannel': return 'Parallel Channel';
            case 'rectangle': return 'Rectangle';
            case 'ellipse': return 'Ellipse';
            case 'fibRetracement': return 'Fib Retracement';
            default: return 'Drawing Settings';
        }
    }

    private _createElement(): void {
        // Overlay
        this._overlay = document.createElement('div');
        this._overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            z-index: 1000;
        `;
        this._overlay.addEventListener('click', () => this.hide());

        // Modal container
        this._element = document.createElement('div');
        this._element.className = 'drawing-settings-modal';
        this._element.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 480px;
            max-height: 80vh;
            background: #1e222d;
            border: 1px solid #2B2B43;
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            z-index: 1001;
            display: flex;
            flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif;
            color: #d1d4dc;
            overflow: hidden;
        `;
        this._element.addEventListener('click', (e) => e.stopPropagation());

        // Header
        this._createHeader();

        // Tabs
        this._createTabs();

        // Content area
        this._createContent();

        // Footer
        this._createFooter();

        this._container.appendChild(this._overlay);
        this._container.appendChild(this._element);
    }

    private _createHeader(): void {
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px;
            border-bottom: 1px solid #2B2B43;
            cursor: move;
            user-select: none;
        `;

        // Make modal draggable
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.target === header || (e.target as HTMLElement).tagName === 'H3') {
                isDragging = true;
                if (this._element) {
                    const rect = this._element.getBoundingClientRect();
                    offsetX = e.clientX - rect.left;
                    offsetY = e.clientY - rect.top;
                    // Remove transform to switch to absolute positioning
                    this._element.style.transform = 'none';
                    this._element.style.left = `${rect.left}px`;
                    this._element.style.top = `${rect.top}px`;
                }
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging && this._element) {
                this._element.style.left = `${e.clientX - offsetX}px`;
                this._element.style.top = `${e.clientY - offsetY}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        const title = document.createElement('h3');
        // Dynamic title based on drawing type
        title.textContent = this._getDrawingTitle();
        title.style.cssText = `
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: #d1d4dc;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>`;
        closeBtn.style.cssText = `
            background: transparent;
            border: none;
            color: #787b86;
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
        `;
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = '#2a2e39';
            closeBtn.style.color = '#d1d4dc';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = 'transparent';
            closeBtn.style.color = '#787b86';
        });
        closeBtn.addEventListener('click', () => this.hide());

        header.appendChild(title);
        header.appendChild(closeBtn);
        this._element!.appendChild(header);
    }

    private _createTabs(): void {
        const tabs: SettingsTab[] = [
            { id: 'style', label: 'Style' },
            { id: 'coordinates', label: 'Coordinates' },
            { id: 'visibility', label: 'Visibility' },
        ];

        const tabBar = document.createElement('div');
        tabBar.style.cssText = `
            display: flex;
            gap: 0;
            border-bottom: 1px solid #2B2B43;
            padding: 0 20px;
        `;

        tabs.forEach((tab, idx) => {
            const tabBtn = document.createElement('button');
            tabBtn.textContent = tab.label;
            tabBtn.dataset.tabId = tab.id;
            tabBtn.style.cssText = `
                padding: 12px 16px;
                background: transparent;
                border: none;
                border-bottom: 2px solid ${idx === 0 ? '#2962ff' : 'transparent'};
                color: ${idx === 0 ? '#d1d4dc' : '#787b86'};
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.15s;
            `;

            tabBtn.addEventListener('click', () => {
                // Update tab styles
                tabBar.querySelectorAll('button').forEach(btn => {
                    (btn as HTMLElement).style.borderBottomColor = 'transparent';
                    (btn as HTMLElement).style.color = '#787b86';
                });
                tabBtn.style.borderBottomColor = '#2962ff';
                tabBtn.style.color = '#d1d4dc';

                // Show/hide content
                this._showTabContent(tab.id);
            });

            tabBar.appendChild(tabBtn);
        });

        this._element!.appendChild(tabBar);
    }

    private _createContent(): void {
        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        `;

        // Style tab content (default visible)
        const styleContent = document.createElement('div');
        styleContent.className = 'tab-content';
        styleContent.dataset.tabId = 'style';
        this._createStyleTab(styleContent);
        content.appendChild(styleContent);

        // Coordinates tab content
        const coordsContent = document.createElement('div');
        coordsContent.className = 'tab-content';
        coordsContent.dataset.tabId = 'coordinates';
        coordsContent.style.display = 'none';
        this._createCoordinatesTab(coordsContent);
        content.appendChild(coordsContent);

        // Visibility tab content  
        const visContent = document.createElement('div');
        visContent.className = 'tab-content';
        visContent.dataset.tabId = 'visibility';
        visContent.style.display = 'none';
        this._createVisibilityTab(visContent);
        content.appendChild(visContent);

        this._element!.appendChild(content);
    }

    private _showTabContent(tabId: string): void {
        const contents = this._element!.querySelectorAll('.tab-content');
        contents.forEach(c => {
            (c as HTMLElement).style.display = (c as HTMLElement).dataset.tabId === tabId ? 'block' : 'none';
        });
    }

    private _createStyleTab(container: HTMLElement): void {
        if (this._currentDrawing?.type === 'fibRetracement') {
            this._createFibonacciStyleTab(container);
        } else if (this._currentDrawing?.type === 'trendLine' ||
            this._currentDrawing?.type === 'horizontalLine' ||
            this._currentDrawing?.type === 'verticalLine' ||
            this._currentDrawing?.type === 'ray' ||
            this._currentDrawing?.type === 'infoLine' ||
            this._currentDrawing?.type === 'extendedLine' ||
            this._currentDrawing?.type === 'trendAngle' ||
            this._currentDrawing?.type === 'horizontalRay' ||
            this._currentDrawing?.type === 'crossLine') {
            // TrendLine, HorizontalLine, VerticalLine, Ray, InfoLine, ExtendedLine, TrendAngle, HorizontalRay, CrossLine style tab with color picker
            this._createTrendLineStyleTab(container);
        } else {
            // Default style tab for other drawings
            this._createSection(container, 'Line', (section) => {
                this._createColorRow(section, 'Color', this._currentDrawing?.style.color || '#2962ff', (color) => {
                    if (this._currentDrawing) {
                        this._currentDrawing.style.color = color;
                        this.settingsChanged.fire(this._currentDrawing);
                    }
                });
                this._createNumberRow(section, 'Width', this._currentDrawing?.style.lineWidth || 2, 1, 10, (value) => {
                    if (this._currentDrawing) {
                        this._currentDrawing.style.lineWidth = value;
                        this.settingsChanged.fire(this._currentDrawing);
                    }
                });
            });
        }
    }

    /** TrendLine-specific style tab */
    private _createTrendLineStyleTab(container: HTMLElement): void {
        const drawing = this._currentDrawing as any;

        // === Line Color Row (Fib-style) ===
        const colorRow = document.createElement('div');
        colorRow.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #2B2B43;
        `;

        const colorLabel = document.createElement('span');
        colorLabel.textContent = 'Line Color';
        colorLabel.style.cssText = `
            font-size: 14px;
            color: #d1d4dc;
        `;

        const colorPicker = this._createColorSwatch(drawing?.style.color || '#2962ff', (color) => {
            if (drawing) {
                drawing.style.color = color;
                this.settingsChanged.fire(drawing);
            }
        });

        colorRow.appendChild(colorLabel);
        colorRow.appendChild(colorPicker);
        container.appendChild(colorRow);

        // === Line Width Row ===
        const widthRow = document.createElement('div');
        widthRow.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #2B2B43;
        `;

        const widthLabel = document.createElement('span');
        widthLabel.textContent = 'Line Width';
        widthLabel.style.cssText = `
            font-size: 14px;
            color: #d1d4dc;
        `;

        // Width toggle buttons (1-4)
        const widthToggle = document.createElement('div');
        widthToggle.style.cssText = `
            display: flex;
            gap: 4px;
            background: #131722;
            border: 1px solid #2B2B43;
            border-radius: 4px;
            padding: 2px;
        `;

        const currentWidth = drawing?.style.lineWidth || 2;
        [1, 2, 3, 4].forEach(w => {
            const btn = document.createElement('button');
            btn.style.cssText = `
                width: 28px;
                height: 24px;
                border: none;
                border-radius: 3px;
                background: ${currentWidth === w ? '#2962ff' : 'transparent'};
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            // Line SVG with varying thickness
            btn.innerHTML = `<svg width="20" height="16" viewBox="0 0 20 16">
                <line x1="2" y1="8" x2="18" y2="8" stroke="${currentWidth === w ? '#fff' : '#787b86'}" stroke-width="${w}"/>
            </svg>`;
            btn.onclick = () => {
                if (drawing) {
                    drawing.style.lineWidth = w;
                    this.settingsChanged.fire(drawing);
                    // Update button states
                    widthToggle.querySelectorAll('button').forEach((b, idx) => {
                        const isActive = idx + 1 === w;
                        (b as HTMLButtonElement).style.background = isActive ? '#2962ff' : 'transparent';
                        (b as HTMLButtonElement).innerHTML = `<svg width="20" height="16" viewBox="0 0 20 16">
                            <line x1="2" y1="8" x2="18" y2="8" stroke="${isActive ? '#fff' : '#787b86'}" stroke-width="${idx + 1}"/>
                        </svg>`;
                    });
                }
            };
            widthToggle.appendChild(btn);
        });

        widthRow.appendChild(widthLabel);
        widthRow.appendChild(widthToggle);
        container.appendChild(widthRow);

        // Line Style Row
        const styleRow = document.createElement('div');
        styleRow.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 0;
            `;

        const styleLabel = document.createElement('span');
        styleLabel.textContent = 'Style';
        styleLabel.style.cssText = `font-size: 13px; color: #787b86;`;
        styleRow.appendChild(styleLabel);

        const styleButtons = document.createElement('div');
        styleButtons.style.cssText = `display: flex; gap: 4px;`;

        const styles = [
            { value: 'solid', label: '—', dash: [] },
            { value: 'dashed', label: '- -', dash: [6, 4] },
            { value: 'dotted', label: '···', dash: [2, 2] }
        ];

        const currentDash = drawing?.style.lineDash || [];
        let currentStyle = 'solid';
        if (currentDash.length > 0) {
            currentStyle = currentDash[0] === 6 ? 'dashed' : 'dotted';
        }

        styles.forEach(s => {
            const btn = document.createElement('button');
            btn.textContent = s.label;
            btn.style.cssText = `
                    padding: 4px 12px;
                    background: ${currentStyle === s.value ? '#2962ff' : '#2a2e39'};
                    color: ${currentStyle === s.value ? '#fff' : '#787b86'};
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                `;
            btn.onclick = () => {
                if (drawing) {
                    drawing.style.lineDash = s.dash;
                    this.settingsChanged.fire(drawing);
                    // Update button states
                    styleButtons.querySelectorAll('button').forEach((b, idx) => {
                        const isActive = styles[idx].value === s.value;
                        (b as HTMLButtonElement).style.background = isActive ? '#2962ff' : '#2a2e39';
                        (b as HTMLButtonElement).style.color = isActive ? '#fff' : '#787b86';
                    });
                }
            };
            styleButtons.appendChild(btn);
        });

        styleRow.appendChild(styleButtons);
        container.appendChild(styleRow);

        // === Extend Section (only for trendLine) ===
        if (this._currentDrawing?.type === 'trendLine') {
            const extendRow1 = document.createElement('div');
            extendRow1.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 0;
                border-bottom: 1px solid #2B2B43;
            `;

            const extendLeftLabel = document.createElement('span');
            extendLeftLabel.textContent = 'Extend Left';
            extendLeftLabel.style.cssText = `font-size: 14px; color: #d1d4dc;`;

            const extendLeftCheckbox = document.createElement('input');
            extendLeftCheckbox.type = 'checkbox';
            extendLeftCheckbox.checked = drawing?.extendLeft || false;
            extendLeftCheckbox.style.cssText = `width: 18px; height: 18px; cursor: pointer;`;
            extendLeftCheckbox.onchange = () => {
                if (drawing) {
                    drawing.extendLeft = extendLeftCheckbox.checked;
                    this.settingsChanged.fire(drawing);
                }
            };

            extendRow1.appendChild(extendLeftLabel);
            extendRow1.appendChild(extendLeftCheckbox);
            container.appendChild(extendRow1);

            const extendRow2 = document.createElement('div');
            extendRow2.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 0;
                border-bottom: 1px solid #2B2B43;
            `;

            const extendRightLabel = document.createElement('span');
            extendRightLabel.textContent = 'Extend Right';
            extendRightLabel.style.cssText = `font-size: 14px; color: #d1d4dc;`;

            const extendRightCheckbox = document.createElement('input');
            extendRightCheckbox.type = 'checkbox';
            extendRightCheckbox.checked = drawing?.extendRight || false;
            extendRightCheckbox.style.cssText = `width: 18px; height: 18px; cursor: pointer;`;
            extendRightCheckbox.onchange = () => {
                if (drawing) {
                    drawing.extendRight = extendRightCheckbox.checked;
                    this.settingsChanged.fire(drawing);
                }
            };

            extendRow2.appendChild(extendRightLabel);
            extendRow2.appendChild(extendRightCheckbox);
            container.appendChild(extendRow2);
        }
    }

    /** Fibonacci-specific style tab - simplified */
    private _createFibonacciStyleTab(container: HTMLElement): void {
        // === Line Color Row ===
        const colorRow = document.createElement('div');
        colorRow.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #2B2B43;
        `;

        const colorLabel = document.createElement('span');
        colorLabel.textContent = 'Line Color';
        colorLabel.style.cssText = `
            font-size: 14px;
            color: #d1d4dc;
        `;

        const colorPicker = this._createColorSwatch(this._currentDrawing?.style.color || '#787b86', (color) => {
            if (this._currentDrawing) {
                this._currentDrawing.style.color = color;
                this.settingsChanged.fire(this._currentDrawing);
            }
        });

        colorRow.appendChild(colorLabel);
        colorRow.appendChild(colorPicker);
        container.appendChild(colorRow);

        // === Line Type Row ===
        const typeRow = document.createElement('div');
        typeRow.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #2B2B43;
        `;

        const typeLabel = document.createElement('span');
        typeLabel.textContent = 'Line Type';
        typeLabel.style.cssText = `
            font-size: 14px;
            color: #d1d4dc;
        `;

        // Line type toggle buttons
        const toggleGroup = document.createElement('div');
        toggleGroup.style.cssText = `
            display: flex;
            gap: 4px;
            background: #131722;
            border: 1px solid #2B2B43;
            border-radius: 4px;
            padding: 2px;
        `;

        const lineTypes = [
            { value: 'solid', svg: '<line x1="2" y1="8" x2="30" y2="8" stroke="currentColor" stroke-width="2"/>' },
            { value: 'dashed', svg: '<line x1="2" y1="8" x2="30" y2="8" stroke="currentColor" stroke-width="2" stroke-dasharray="4,3"/>' },
            { value: 'dotted', svg: '<line x1="2" y1="8" x2="30" y2="8" stroke="currentColor" stroke-width="2" stroke-dasharray="2,2"/>' },
        ];

        let activeBtn: HTMLButtonElement | null = null;

        lineTypes.forEach((type, idx) => {
            const btn = document.createElement('button');
            btn.innerHTML = `<svg width="32" height="16" viewBox="0 0 32 16">${type.svg}</svg>`;
            btn.dataset.value = type.value;
            btn.style.cssText = `
                padding: 6px 10px;
                background: ${idx === 0 ? '#2962ff' : 'transparent'};
                border: none;
                border-radius: 3px;
                color: ${idx === 0 ? '#ffffff' : '#787b86'};
                cursor: pointer;
                display: flex;
                align-items: center;
                transition: all 0.15s;
            `;

            if (idx === 0) activeBtn = btn;

            btn.addEventListener('click', () => {
                // Update active state
                if (activeBtn) {
                    activeBtn.style.background = 'transparent';
                    activeBtn.style.color = '#787b86';
                }
                btn.style.background = '#2962ff';
                btn.style.color = '#ffffff';
                activeBtn = btn;

                // Update drawing
                if (this._currentDrawing) {
                    const style = type.value;
                    this._currentDrawing.style.lineDash = style === 'solid' ? [] :
                        style === 'dashed' ? [6, 4] : [2, 2];
                    this.settingsChanged.fire(this._currentDrawing);
                }
            });

            toggleGroup.appendChild(btn);
        });

        typeRow.appendChild(typeLabel);
        typeRow.appendChild(toggleGroup);
        container.appendChild(typeRow);

        // === Line Width Row ===
        const widthRow = document.createElement('div');
        widthRow.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #2B2B43;
        `;

        const widthLabel = document.createElement('span');
        widthLabel.textContent = 'Line Width';
        widthLabel.style.cssText = `
            font-size: 14px;
            color: #d1d4dc;
        `;

        // Width toggle buttons (1, 2, 3, 4)
        const widthGroup = document.createElement('div');
        widthGroup.style.cssText = `
            display: flex;
            gap: 4px;
            background: #131722;
            border: 1px solid #2B2B43;
            border-radius: 4px;
            padding: 2px;
        `;

        const widths = [1, 2, 3, 4];
        const currentWidth = this._currentDrawing?.style.lineWidth || 1;
        let activeWidthBtn: HTMLButtonElement | null = null;

        widths.forEach((w) => {
            const btn = document.createElement('button');
            btn.innerHTML = `<svg width="24" height="16" viewBox="0 0 24 16">
                <line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" stroke-width="${w}"/>
            </svg>`;
            btn.style.cssText = `
                padding: 4px 8px;
                background: ${w === currentWidth ? '#2962ff' : 'transparent'};
                border: none;
                border-radius: 3px;
                color: ${w === currentWidth ? '#ffffff' : '#787b86'};
                cursor: pointer;
                display: flex;
                align-items: center;
                transition: all 0.15s;
            `;

            if (w === currentWidth) activeWidthBtn = btn;

            btn.addEventListener('click', () => {
                if (activeWidthBtn) {
                    activeWidthBtn.style.background = 'transparent';
                    activeWidthBtn.style.color = '#787b86';
                }
                btn.style.background = '#2962ff';
                btn.style.color = '#ffffff';
                activeWidthBtn = btn;

                if (this._currentDrawing) {
                    this._currentDrawing.style.lineWidth = w;
                    this.settingsChanged.fire(this._currentDrawing);
                }
            });

            widthGroup.appendChild(btn);
        });

        widthRow.appendChild(widthLabel);
        widthRow.appendChild(widthGroup);
        container.appendChild(widthRow);

        // === Opacity Row ===
        const opacityRow = document.createElement('div');
        opacityRow.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #2B2B43;
        `;

        const opacityLabel = document.createElement('span');
        opacityLabel.textContent = 'Opacity';
        opacityLabel.style.cssText = `
            font-size: 14px;
            color: #d1d4dc;
        `;

        // Opacity control container
        const opacityControl = document.createElement('div');
        opacityControl.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
        `;

        // Slider
        const opacitySlider = document.createElement('input');
        opacitySlider.type = 'range';
        opacitySlider.min = '10';
        opacitySlider.max = '100';
        opacitySlider.value = '80';
        opacitySlider.style.cssText = `
            width: 120px;
            cursor: pointer;
            accent-color: #2962ff;
        `;

        // Value display
        const opacityValue = document.createElement('span');
        opacityValue.textContent = '80%';
        opacityValue.style.cssText = `
            font-size: 13px;
            color: #787b86;
            min-width: 36px;
            text-align: right;
        `;

        opacitySlider.addEventListener('input', () => {
            const val = parseInt(opacitySlider.value);
            opacityValue.textContent = `${val}%`;

            if (this._currentDrawing) {
                // Store opacity (will be used in rendering)
                (this._currentDrawing as any).opacity = val / 100;
                this.settingsChanged.fire(this._currentDrawing);
            }
        });

        opacityControl.appendChild(opacitySlider);
        opacityControl.appendChild(opacityValue);

        opacityRow.appendChild(opacityLabel);
        opacityRow.appendChild(opacityControl);
        container.appendChild(opacityRow);

        // === Background Opacity Row ===
        const bgOpacityRow = document.createElement('div');
        bgOpacityRow.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #2B2B43;
        `;

        const bgOpacityLabel = document.createElement('span');
        bgOpacityLabel.textContent = 'Background';
        bgOpacityLabel.style.cssText = `
            font-size: 14px;
            color: #d1d4dc;
        `;

        const bgOpacityControl = document.createElement('div');
        bgOpacityControl.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
        `;

        const fibDrawing = this._currentDrawing as any;
        const currentBgOpacity = fibDrawing?.backgroundOpacity ?? 0.1;

        const bgOpacitySlider = document.createElement('input');
        bgOpacitySlider.type = 'range';
        bgOpacitySlider.min = '0';
        bgOpacitySlider.max = '50';
        bgOpacitySlider.value = String(Math.round(currentBgOpacity * 100));
        bgOpacitySlider.style.cssText = `
            width: 120px;
            cursor: pointer;
            accent-color: #2962ff;
        `;

        const bgOpacityValueDisplay = document.createElement('span');
        bgOpacityValueDisplay.textContent = `${Math.round(currentBgOpacity * 100)}%`;
        bgOpacityValueDisplay.style.cssText = `
            font-size: 13px;
            color: #787b86;
            min-width: 36px;
            text-align: right;
        `;

        bgOpacitySlider.addEventListener('input', () => {
            const val = parseInt(bgOpacitySlider.value);
            bgOpacityValueDisplay.textContent = `${val}%`;

            if (this._currentDrawing) {
                (this._currentDrawing as any).backgroundOpacity = val / 100;
                this.settingsChanged.fire(this._currentDrawing);
            }
        });

        bgOpacityControl.appendChild(bgOpacitySlider);
        bgOpacityControl.appendChild(bgOpacityValueDisplay);

        bgOpacityRow.appendChild(bgOpacityLabel);
        bgOpacityRow.appendChild(bgOpacityControl);
        container.appendChild(bgOpacityRow);

        // === Reverse Row ===
        const reverseRow = document.createElement('div');
        reverseRow.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #2B2B43;
        `;

        const reverseLabel = document.createElement('span');
        reverseLabel.textContent = 'Reverse';
        reverseLabel.style.cssText = `
            font-size: 14px;
            color: #d1d4dc;
        `;

        const reverseToggle = document.createElement('input');
        reverseToggle.type = 'checkbox';
        reverseToggle.checked = fibDrawing?.reversed ?? false;
        reverseToggle.style.cssText = `
            width: 18px;
            height: 18px;
            cursor: pointer;
            accent-color: #2962ff;
        `;

        reverseToggle.addEventListener('change', () => {
            if (this._currentDrawing) {
                (this._currentDrawing as any).reversed = reverseToggle.checked;
                this.settingsChanged.fire(this._currentDrawing);
            }
        });

        reverseRow.appendChild(reverseLabel);
        reverseRow.appendChild(reverseToggle);
        container.appendChild(reverseRow);

        // === Levels Section ===
        const levelsSection = document.createElement('div');
        levelsSection.style.cssText = `
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid #2B2B43;
        `;

        const levelsTitle = document.createElement('div');
        levelsTitle.textContent = 'Levels';
        levelsTitle.style.cssText = `
            font-size: 13px;
            font-weight: 600;
            color: #787b86;
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        `;
        levelsSection.appendChild(levelsTitle);

        // 2-column grid for levels
        const levelsGrid = document.createElement('div');
        levelsGrid.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 16px;
            max-height: 300px;
            overflow-y: auto;
        `;

        // Get levels from the current drawing (FibRetracementDrawing)
        const currentFibDrawing = this._currentDrawing as any;
        if (currentFibDrawing && currentFibDrawing.levels) {
            currentFibDrawing.levels.forEach((lvl: { level: number; label: string; color: string; enabled: boolean }, idx: number) => {
                const levelItem = document.createElement('div');
                levelItem.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;

                // Checkbox
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = lvl.enabled;
                checkbox.style.cssText = `
                    width: 16px;
                    height: 16px;
                    cursor: pointer;
                    accent-color: #2962ff;
                `;
                checkbox.addEventListener('change', () => {
                    lvl.enabled = checkbox.checked;
                    this.settingsChanged.fire(this._currentDrawing!);
                });

                // Value input - editable
                const input = document.createElement('input');
                input.type = 'text';
                input.value = lvl.label;
                input.style.cssText = `
                    width: 135px;
                    padding: 6px 8px;
                    background: #2a2e39;
                    border: 1px solid #363a45;
                    border-radius: 4px;
                    color: #d1d4dc;
                    font-size: 13px;
                `;
                input.addEventListener('change', () => {
                    const newValue = parseFloat(input.value);
                    if (!isNaN(newValue)) {
                        lvl.level = newValue;
                        lvl.label = input.value;
                        this.settingsChanged.fire(this._currentDrawing!);
                    }
                });

                // Color swatch
                const colorSwatch = document.createElement('div');
                colorSwatch.style.cssText = `
                    width: 28px;
                    height: 28px;
                    background: ${lvl.color};
                    border-radius: 4px;
                    cursor: pointer;
                    border: 1px solid rgba(255,255,255,0.1);
                `;

                // Color picker functionality
                const colorInput = document.createElement('input');
                colorInput.type = 'color';
                colorInput.value = lvl.color;
                colorInput.style.cssText = `
                    position: absolute;
                    opacity: 0;
                    width: 28px;
                    height: 28px;
                    cursor: pointer;
                `;
                colorInput.addEventListener('input', () => {
                    colorSwatch.style.background = colorInput.value;
                    lvl.color = colorInput.value;
                    this.settingsChanged.fire(this._currentDrawing!);
                });

                const colorWrapper = document.createElement('div');
                colorWrapper.style.cssText = 'position: relative;';
                colorWrapper.appendChild(colorSwatch);
                colorWrapper.appendChild(colorInput);

                levelItem.appendChild(checkbox);
                levelItem.appendChild(input);
                levelItem.appendChild(colorWrapper);
                levelsGrid.appendChild(levelItem);
            });
        }

        levelsSection.appendChild(levelsGrid);
        container.appendChild(levelsSection);
    }


    /** Trend line row: checkbox + label + color + line style */
    private _createTrendLineRow(container: HTMLElement): void {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 0;
        `;

        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.style.cssText = `
            width: 16px;
            height: 16px;
            cursor: pointer;
            accent-color: #2962ff;
        `;

        // Label
        const label = document.createElement('span');
        label.textContent = 'Trend line';
        label.style.cssText = `
            font-size: 13px;
            color: #d1d4dc;
            min-width: 80px;
        `;

        // Spacer
        const spacer = document.createElement('div');
        spacer.style.flex = '1';

        // Color picker
        const colorPicker = this._createColorSwatch(this._currentDrawing?.style.color || '#787b86', (color) => {
            if (this._currentDrawing) {
                this._currentDrawing.style.color = color;
                this.settingsChanged.fire(this._currentDrawing);
            }
        });

        // Line style dropdown
        const lineStyleSelect = document.createElement('select');
        lineStyleSelect.style.cssText = `
            padding: 6px 12px;
            background: #131722;
            border: 1px solid #2B2B43;
            border-radius: 4px;
            color: #d1d4dc;
            font-size: 12px;
            cursor: pointer;
            min-width: 80px;
        `;
        const styles = [
            { value: 'solid', label: '────' },
            { value: 'dashed', label: '- - - -' },
            { value: 'dotted', label: '· · · ·' },
        ];
        styles.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.value;
            opt.textContent = s.label;
            lineStyleSelect.appendChild(opt);
        });
        lineStyleSelect.addEventListener('change', () => {
            if (this._currentDrawing) {
                const style = lineStyleSelect.value;
                this._currentDrawing.style.lineDash = style === 'solid' ? [] :
                    style === 'dashed' ? [6, 4] : [2, 2];
                this.settingsChanged.fire(this._currentDrawing);
            }
        });

        row.appendChild(checkbox);
        row.appendChild(label);
        row.appendChild(spacer);
        row.appendChild(colorPicker);
        row.appendChild(lineStyleSelect);
        container.appendChild(row);
    }

    /** Levels line row: label + solid/thin toggle buttons */
    private _createLevelsLineRow(container: HTMLElement): void {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 0;
        `;

        // Label
        const label = document.createElement('span');
        label.textContent = 'Levels line';
        label.style.cssText = `
            font-size: 13px;
            color: #d1d4dc;
            min-width: 80px;
        `;

        // Spacer
        const spacer = document.createElement('div');
        spacer.style.flex = '1';

        // Toggle group
        const toggleGroup = document.createElement('div');
        toggleGroup.style.cssText = `
            display: flex;
            gap: 4px;
            background: #131722;
            border: 1px solid #2B2B43;
            border-radius: 4px;
            padding: 2px;
        `;

        // Thick line button
        const thickBtn = document.createElement('button');
        thickBtn.innerHTML = `<svg width="24" height="16" viewBox="0 0 24 16">
            <line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" stroke-width="3"/>
        </svg>`;
        thickBtn.style.cssText = `
            padding: 4px 8px;
            background: #2962ff;
            border: none;
            border-radius: 2px;
            color: #ffffff;
            cursor: pointer;
            display: flex;
            align-items: center;
        `;

        // Thin line button
        const thinBtn = document.createElement('button');
        thinBtn.innerHTML = `<svg width="24" height="16" viewBox="0 0 24 16">
            <line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" stroke-width="1"/>
        </svg>`;
        thinBtn.style.cssText = `
            padding: 4px 8px;
            background: transparent;
            border: none;
            border-radius: 2px;
            color: #787b86;
            cursor: pointer;
            display: flex;
            align-items: center;
        `;

        // Toggle logic
        thickBtn.addEventListener('click', () => {
            thickBtn.style.background = '#2962ff';
            thickBtn.style.color = '#ffffff';
            thinBtn.style.background = 'transparent';
            thinBtn.style.color = '#787b86';
            if (this._currentDrawing) {
                this._currentDrawing.style.lineWidth = 2;
                this.settingsChanged.fire(this._currentDrawing);
            }
        });
        thinBtn.addEventListener('click', () => {
            thinBtn.style.background = '#2962ff';
            thinBtn.style.color = '#ffffff';
            thickBtn.style.background = 'transparent';
            thickBtn.style.color = '#787b86';
            if (this._currentDrawing) {
                this._currentDrawing.style.lineWidth = 1;
                this.settingsChanged.fire(this._currentDrawing);
            }
        });

        toggleGroup.appendChild(thickBtn);
        toggleGroup.appendChild(thinBtn);

        row.appendChild(label);
        row.appendChild(spacer);
        row.appendChild(toggleGroup);
        container.appendChild(row);
    }

    /** Extend row: label + dropdown */
    private _createExtendRow(container: HTMLElement): void {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 0;
        `;

        // Label
        const label = document.createElement('span');
        label.textContent = 'Extend';
        label.style.cssText = `
            font-size: 13px;
            color: #d1d4dc;
            min-width: 80px;
        `;

        // Spacer
        const spacer = document.createElement('div');
        spacer.style.flex = '1';

        // Dropdown
        const select = document.createElement('select');
        select.style.cssText = `
            padding: 6px 12px;
            background: #131722;
            border: 1px solid #2B2B43;
            border-radius: 4px;
            color: #d1d4dc;
            font-size: 12px;
            cursor: pointer;
            min-width: 160px;
        `;
        const options = [
            { value: 'right', label: 'Extend lines right' },
            { value: 'left', label: 'Extend lines left' },
            { value: 'both', label: 'Extend both ways' },
            { value: 'none', label: 'None' },
        ];
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            select.appendChild(option);
        });

        row.appendChild(label);
        row.appendChild(spacer);
        row.appendChild(select);
        container.appendChild(row);
    }

    /** Create a color swatch button with TradingView-style color picker popup */
    private _createColorSwatch(initialColor: string, onChange: (color: string) => void): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: relative;
            display: inline-block;
        `;

        // Current color swatch
        const swatch = document.createElement('div');
        swatch.style.cssText = `
            width: 32px;
            height: 24px;
            background: ${initialColor};
            border-radius: 4px;
            border: 1px solid #2B2B43;
            cursor: pointer;
        `;

        let currentColor = initialColor;
        let popupVisible = false;
        let popup: HTMLElement | null = null;

        // Color palette (TradingView style)
        const grayscale = ['#FFFFFF', '#E0E0E0', '#BDBDBD', '#9E9E9E', '#757575', '#616161', '#424242', '#212121', '#000000'];

        const colorPalette = [
            // Row 1: Bright/saturated
            ['#F44336', '#FFEB3B', '#4CAF50', '#00BCD4', '#2196F3', '#673AB7', '#9C27B0', '#E91E63', '#FF5722'],
            // Row 2
            ['#EF9A9A', '#FFF59D', '#A5D6A7', '#80DEEA', '#90CAF9', '#B39DDB', '#CE93D8', '#F48FB1', '#FFAB91'],
            // Row 3
            ['#FCE4EC', '#FFFDE7', '#E8F5E9', '#E0F7FA', '#E3F2FD', '#EDE7F6', '#F3E5F5', '#FCE4EC', '#FBE9E7'],
            // Row 4
            ['#FFCDD2', '#FFF9C4', '#C8E6C9', '#B2EBF2', '#BBDEFB', '#D1C4E9', '#E1BEE7', '#F8BBD0', '#FFCCBC'],
            // Row 5
            ['#FF8A80', '#FFFF8D', '#B9F6CA', '#84FFFF', '#82B1FF', '#B388FF', '#EA80FC', '#FF80AB', '#FF9E80'],
            // Row 6
            ['#FF5252', '#FFFF00', '#69F0AE', '#18FFFF', '#448AFF', '#7C4DFF', '#E040FB', '#FF4081', '#FF6E40'],
            // Row 7
            ['#D32F2F', '#FBC02D', '#388E3C', '#0097A7', '#1976D2', '#512DA8', '#7B1FA2', '#C2185B', '#E64A19'],
            // Row 8
            ['#B71C1C', '#F57F17', '#1B5E20', '#006064', '#0D47A1', '#311B92', '#4A148C', '#880E4F', '#BF360C']
        ];

        const showPopup = () => {
            if (popup) return;
            popupVisible = true;

            popup = document.createElement('div');
            popup.style.cssText = `
                position: absolute;
                top: 100%;
                right: 0;
                margin-top: 8px;
                background: #1e222d;
                border-radius: 8px;
                padding: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                z-index: 10000;
                min-width: 280px;
            `;

            // Grayscale row
            const grayRow = document.createElement('div');
            grayRow.style.cssText = `display: flex; gap: 4px; margin-bottom: 8px;`;
            grayscale.forEach(color => {
                const colorBox = document.createElement('div');
                colorBox.style.cssText = `
                    width: 26px;
                    height: 26px;
                    background: ${color};
                    border-radius: 4px;
                    cursor: pointer;
                    border: ${color === currentColor ? '2px solid #2962ff' : '1px solid #363a45'};
                `;
                colorBox.onclick = () => {
                    currentColor = color;
                    swatch.style.background = color;
                    onChange(color);
                    hidePopup();
                };
                grayRow.appendChild(colorBox);
            });
            popup.appendChild(grayRow);

            // Current color indicator (on the right side)
            const indicatorWrapper = document.createElement('div');
            indicatorWrapper.style.cssText = `
                position: absolute;
                top: 12px;
                right: -50px;
                width: 36px;
                height: 36px;
                background: ${currentColor};
                border-radius: 4px;
                border: 2px solid #363a45;
            `;
            // Note: Keeping indicator inside the popup for now

            // Color palette grid
            colorPalette.forEach(row => {
                const rowDiv = document.createElement('div');
                rowDiv.style.cssText = `display: flex; gap: 4px; margin-bottom: 4px;`;
                row.forEach(color => {
                    const colorBox = document.createElement('div');
                    colorBox.style.cssText = `
                        width: 26px;
                        height: 26px;
                        background: ${color};
                        border-radius: 4px;
                        cursor: pointer;
                        border: ${color === currentColor ? '2px solid #2962ff' : 'none'};
                        transition: transform 0.1s;
                    `;
                    colorBox.onmouseenter = () => colorBox.style.transform = 'scale(1.1)';
                    colorBox.onmouseleave = () => colorBox.style.transform = 'scale(1)';
                    colorBox.onclick = () => {
                        currentColor = color;
                        swatch.style.background = color;
                        onChange(color);
                        hidePopup();
                    };
                    rowDiv.appendChild(colorBox);
                });
                popup!.appendChild(rowDiv);
            });

            // Custom color button (+ button)
            const customRow = document.createElement('div');
            customRow.style.cssText = `margin-top: 12px; display: flex; gap: 8px; align-items: center;`;

            const addBtn = document.createElement('button');
            addBtn.innerHTML = '+';
            addBtn.style.cssText = `
                width: 32px;
                height: 32px;
                border: 1px dashed #4a4e59;
                border-radius: 4px;
                background: transparent;
                color: #787b86;
                font-size: 18px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            // Hidden native color picker for custom colors
            const customInput = document.createElement('input');
            customInput.type = 'color';
            customInput.value = currentColor;
            customInput.style.cssText = `
                position: absolute;
                opacity: 0;
                width: 32px;
                height: 32px;
                cursor: pointer;
            `;
            customInput.onchange = () => {
                currentColor = customInput.value;
                swatch.style.background = customInput.value;
                onChange(customInput.value);
                hidePopup();
            };

            addBtn.onclick = () => customInput.click();

            const addBtnWrapper = document.createElement('div');
            addBtnWrapper.style.cssText = 'position: relative;';
            addBtnWrapper.appendChild(addBtn);
            addBtnWrapper.appendChild(customInput);
            customRow.appendChild(addBtnWrapper);

            popup.appendChild(customRow);

            wrapper.appendChild(popup);

            // Close popup when clicking outside
            setTimeout(() => {
                document.addEventListener('click', handleClickOutside);
            }, 10);
        };

        const hidePopup = () => {
            if (popup) {
                popup.remove();
                popup = null;
                popupVisible = false;
                document.removeEventListener('click', handleClickOutside);
            }
        };

        const handleClickOutside = (e: MouseEvent) => {
            if (!wrapper.contains(e.target as Node)) {
                hidePopup();
            }
        };

        swatch.onclick = (e) => {
            e.stopPropagation();
            if (popupVisible) {
                hidePopup();
            } else {
                showPopup();
            }
        };

        wrapper.appendChild(swatch);

        return wrapper;
    }

    /** Fibonacci levels grid (2 columns) - placeholder for Phase 2 */
    private _createFibLevelsGrid(container: HTMLElement): void {
        // Will be implemented in Phase 2
        this._createFibLevelsEditor(container);
    }

    /** Additional options - placeholder for Phase 3 */
    private _createAdditionalOptions(container: HTMLElement): void {
        // Placeholder - will be expanded in Phase 3
        this._createCheckboxRow(container, 'Background', true, () => { });
        this._createCheckboxRow(container, 'Prices', true, () => { });
    }


    private _createCoordinatesTab(container: HTMLElement): void {
        this._createSection(container, 'Points', (section) => {
            const drawing = this._currentDrawing;
            if (drawing && drawing.points.length >= 2) {
                this._createCoordinateRow(section, 'Point 1', drawing.points[0].price, drawing.points[0].time);
                this._createCoordinateRow(section, 'Point 2', drawing.points[1].price, drawing.points[1].time);
            }
        });
    }

    private _createVisibilityTab(container: HTMLElement): void {
        this._createSection(container, 'Timeframe Visibility', (section) => {
            const timeframes = ['1m', '5m', '15m', '1h', '4h', '1D', '1W', '1M'];
            timeframes.forEach(tf => {
                this._createCheckboxRow(section, tf, true, () => { });
            });
        });
    }

    private _createSection(container: HTMLElement, title: string, contentBuilder: (section: HTMLElement) => void): void {
        const section = document.createElement('div');
        section.style.cssText = `
            margin-bottom: 20px;
        `;

        const header = document.createElement('div');
        header.textContent = title;
        header.style.cssText = `
            font-size: 12px;
            font-weight: 600;
            color: #787b86;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
        `;
        section.appendChild(header);

        const content = document.createElement('div');
        content.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;
        contentBuilder(content);
        section.appendChild(content);

        container.appendChild(section);
    }

    private _createColorRow(container: HTMLElement, label: string, initialColor: string, onChange: (color: string) => void): void {
        const row = this._createRow(label);

        const colorSwatch = document.createElement('div');
        colorSwatch.style.cssText = `
            width: 32px;
            height: 24px;
            background: ${initialColor};
            border-radius: 4px;
            border: 1px solid #2B2B43;
            cursor: pointer;
        `;

        // Simple color picker on click
        colorSwatch.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'color';
            input.value = initialColor;
            input.style.cssText = 'position: absolute; visibility: hidden;';
            input.addEventListener('input', () => {
                colorSwatch.style.background = input.value;
                onChange(input.value);
            });
            colorSwatch.appendChild(input);
            input.click();
            setTimeout(() => input.remove(), 100);
        });

        row.appendChild(colorSwatch);
        container.appendChild(row);
    }

    private _createNumberRow(container: HTMLElement, label: string, initialValue: number, min: number, max: number, onChange: (value: number) => void): void {
        const row = this._createRow(label);

        const input = document.createElement('input');
        input.type = 'number';
        input.value = String(initialValue);
        input.min = String(min);
        input.max = String(max);
        input.style.cssText = `
            width: 60px;
            padding: 4px 8px;
            background: #131722;
            border: 1px solid #2B2B43;
            border-radius: 4px;
            color: #d1d4dc;
            font-size: 13px;
            text-align: center;
        `;
        input.addEventListener('change', () => {
            onChange(parseInt(input.value) || initialValue);
        });

        row.appendChild(input);
        container.appendChild(row);
    }

    private _createCheckboxRow(container: HTMLElement, label: string, initialValue: boolean, onChange: (value: boolean) => void): void {
        const row = this._createRow(label);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = initialValue;
        checkbox.style.cssText = `
            width: 16px;
            height: 16px;
            cursor: pointer;
        `;
        checkbox.addEventListener('change', () => {
            onChange(checkbox.checked);
        });

        row.appendChild(checkbox);
        container.appendChild(row);
    }

    private _createSliderRow(container: HTMLElement, label: string, initialValue: number, min: number, max: number, onChange: (value: number) => void): void {
        const row = this._createRow(label);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.value = String(initialValue);
        slider.min = String(min);
        slider.max = String(max);
        slider.style.cssText = `
            width: 100px;
            cursor: pointer;
        `;
        slider.addEventListener('input', () => {
            onChange(parseInt(slider.value));
        });

        row.appendChild(slider);
        container.appendChild(row);
    }

    private _createCoordinateRow(container: HTMLElement, label: string, price: number, time: number): void {
        const row = this._createRow(label);

        const priceInput = document.createElement('input');
        priceInput.type = 'text';
        priceInput.value = price.toFixed(2);
        priceInput.style.cssText = `
            width: 80px;
            padding: 4px 8px;
            background: #131722;
            border: 1px solid #2B2B43;
            border-radius: 4px;
            color: #d1d4dc;
            font-size: 12px;
            margin-right: 8px;
        `;

        const timeInput = document.createElement('input');
        timeInput.type = 'text';
        timeInput.value = new Date(time * 1000).toLocaleDateString();
        timeInput.style.cssText = `
            width: 100px;
            padding: 4px 8px;
            background: #131722;
            border: 1px solid #2B2B43;
            border-radius: 4px;
            color: #d1d4dc;
            font-size: 12px;
        `;

        row.appendChild(priceInput);
        row.appendChild(timeInput);
        container.appendChild(row);
    }

    private _createRow(label: string): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 4px 0;
        `;

        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        labelEl.style.cssText = `
            font-size: 13px;
            color: #d1d4dc;
        `;
        row.appendChild(labelEl);

        return row;
    }

    private _initFibonacciSettings(drawing: FibRetracementDrawing): void {
        // Initialize Fibonacci level configurations
        const defaultColors = [
            '#787b86', // 0%
            '#ef5350', // 23.6%
            '#4caf50', // 38.2%
            '#26a69a', // 50%
            '#2196f3', // 61.8%
            '#9c27b0', // 78.6%
            '#ffc107', // 100%
        ];

        this._fibLevels = drawing.levels.map((level, idx) => ({
            level: level.level,
            label: level.label,
            color: defaultColors[idx % defaultColors.length],
            visible: true,
        }));
    }

    private _createFibLevelsEditor(container: HTMLElement): void {
        const levelsContainer = document.createElement('div');
        levelsContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 200px;
            overflow-y: auto;
        `;

        this._fibLevels.forEach((level, idx) => {
            const row = document.createElement('div');
            row.style.cssText = `
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 4px 0;
            `;

            // Visibility checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = level.visible;
            checkbox.style.cssText = `
                width: 14px;
                height: 14px;
                cursor: pointer;
            `;

            // Color swatch
            const colorSwatch = document.createElement('div');
            colorSwatch.style.cssText = `
                width: 20px;
                height: 20px;
                background: ${level.color};
                border-radius: 4px;
                cursor: pointer;
            `;

            // Level label
            const labelEl = document.createElement('span');
            labelEl.textContent = level.label;
            labelEl.style.cssText = `
                flex: 1;
                font-size: 13px;
                color: #d1d4dc;
            `;

            // Value input
            const valueInput = document.createElement('input');
            valueInput.type = 'text';
            valueInput.value = String(level.level);
            valueInput.style.cssText = `
                width: 60px;
                padding: 4px 6px;
                background: #131722;
                border: 1px solid #2B2B43;
                border-radius: 4px;
                color: #d1d4dc;
                font-size: 12px;
                text-align: right;
            `;

            row.appendChild(checkbox);
            row.appendChild(colorSwatch);
            row.appendChild(labelEl);
            row.appendChild(valueInput);
            levelsContainer.appendChild(row);
        });

        container.appendChild(levelsContainer);

        // Add level button
        const addBtn = document.createElement('button');
        addBtn.textContent = '+ Add Level';
        addBtn.style.cssText = `
            margin-top: 8px;
            padding: 8px 12px;
            background: transparent;
            border: 1px dashed #2B2B43;
            border-radius: 4px;
            color: #787b86;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.15s;
        `;
        addBtn.addEventListener('mouseenter', () => {
            addBtn.style.borderColor = '#2962ff';
            addBtn.style.color = '#2962ff';
        });
        addBtn.addEventListener('mouseleave', () => {
            addBtn.style.borderColor = '#2B2B43';
            addBtn.style.color = '#787b86';
        });
        container.appendChild(addBtn);
    }

    private _createFooter(): void {
        const footer = document.createElement('div');
        footer.style.cssText = `
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding: 16px 20px;
            border-top: 1px solid #2B2B43;
        `;

        // Template dropdown
        const templateBtn = document.createElement('button');
        templateBtn.textContent = 'Template';
        templateBtn.style.cssText = `
            padding: 8px 16px;
            background: transparent;
            border: 1px solid #2B2B43;
            border-radius: 4px;
            color: #787b86;
            font-size: 13px;
            cursor: pointer;
            margin-right: auto;
        `;

        // OK button
        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = `
            padding: 8px 24px;
            background: #2962ff;
            border: none;
            border-radius: 4px;
            color: #ffffff;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s;
        `;
        okBtn.addEventListener('mouseenter', () => {
            okBtn.style.background = '#1e53e4';
        });
        okBtn.addEventListener('mouseleave', () => {
            okBtn.style.background = '#2962ff';
        });
        okBtn.addEventListener('click', () => {
            this.hide();
        });

        footer.appendChild(templateBtn);
        footer.appendChild(okBtn);
        this._element!.appendChild(footer);
    }

    dispose(): void {
        this.hide();
        this.closed.destroy();
        this.settingsChanged.destroy();
    }
}
