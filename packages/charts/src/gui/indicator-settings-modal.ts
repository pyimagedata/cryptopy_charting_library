/**
 * Indicator Settings Modal - TradingView-style light theme
 */

import { Delegate } from '../helpers/delegate';

export interface IndicatorSettings {
    [key: string]: number | string | boolean;
}

export interface IndicatorSettingsConfig {
    name: string;
    parameters: {
        key: string;
        label: string;
        type: 'number' | 'string' | 'color' | 'boolean';
        value: number | string | boolean;
        min?: number;
        max?: number;
        step?: number;
    }[];
    styleParameters?: {
        key: string;
        label: string;
        type: 'color' | 'number' | 'select';
        value: string | number;
        options?: { label: string; value: string | number }[];
        min?: number;
        max?: number;
    }[];
}

export class IndicatorSettingsModal {
    private _element: HTMLElement | null = null;
    private _overlay: HTMLElement | null = null;
    private _config: IndicatorSettingsConfig | null = null;
    private _activeTab: 'inputs' | 'style' | 'visibility' = 'inputs';

    // Store collected values across all tabs
    private _collectedSettings: IndicatorSettings = {};

    private readonly _settingsChanged = new Delegate<IndicatorSettings>();
    private readonly _closed = new Delegate<void>();

    constructor(private _container: HTMLElement) {
        this._createElement();
    }

    // --- Public API ---

    get settingsChanged(): Delegate<IndicatorSettings> {
        return this._settingsChanged;
    }

    get closed(): Delegate<void> {
        return this._closed;
    }

    show(config: IndicatorSettingsConfig): void {
        this._config = config;
        this._activeTab = 'inputs';

        // Initialize collected settings with default values
        this._collectedSettings = {};
        config.parameters.forEach(p => {
            this._collectedSettings[p.key] = p.value;
        });
        config.styleParameters?.forEach(p => {
            this._collectedSettings[p.key] = p.value;
        });

        this._renderContent();
        if (this._overlay) {
            this._overlay.style.display = 'flex';
        }
    }

    hide(): void {
        if (this._overlay) {
            this._overlay.style.display = 'none';
            this._closed.fire();
        }
    }

    // --- Private methods ---

    private _createElement(): void {
        // Overlay background
        this._overlay = document.createElement('div');
        this._overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.4);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        // Modal container - light theme like TradingView
        this._element = document.createElement('div');
        this._element.style.cssText = `
            background: white;
            border-radius: 8px;
            width: 420px;
            max-width: 95vw;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        `;

        this._overlay.appendChild(this._element);
        this._container.appendChild(this._overlay);

        // Close on overlay click
        this._overlay.addEventListener('click', (e) => {
            if (e.target === this._overlay) {
                this.hide();
            }
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._overlay?.style.display === 'flex') {
                this.hide();
            }
        });
    }

    private _renderContent(): void {
        if (!this._element || !this._config) return;

        this._element.innerHTML = '';

        // Header with title and close button
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 20px 24px 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
        `;

        const title = document.createElement('div');
        title.textContent = this._config.name;
        title.style.cssText = `
            font-size: 20px;
            font-weight: 600;
            color: #131722;
        `;
        header.appendChild(title);

        const closeButton = document.createElement('button');
        closeButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#131722" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        closeButton.style.cssText = `
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: background 0.15s;
        `;
        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.background = '#f0f3fa';
        });
        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.background = 'none';
        });
        closeButton.addEventListener('click', () => this.hide());
        header.appendChild(closeButton);

        this._element.appendChild(header);

        // Tab navigation
        const tabNav = document.createElement('div');
        tabNav.style.cssText = `
            display: flex;
            padding: 16px 24px 0;
            border-bottom: 1px solid #e0e3eb;
        `;

        const tabs = ['Inputs', 'Style', 'Visibility'];
        tabs.forEach((tabName) => {
            const tab = document.createElement('button');
            tab.textContent = tabName;
            const isActive = tabName.toLowerCase() === this._activeTab;
            tab.style.cssText = `
                background: none;
                border: none;
                padding: 12px 0;
                margin-right: 24px;
                font-size: 14px;
                font-weight: 500;
                color: ${isActive ? '#131722' : '#787b86'};
                cursor: pointer;
                position: relative;
                transition: color 0.15s;
            `;

            if (isActive) {
                const underline = document.createElement('div');
                underline.style.cssText = `
                    position: absolute;
                    bottom: -1px;
                    left: 0;
                    right: 0;
                    height: 2px;
                    background: #131722;
                    border-radius: 1px;
                `;
                tab.appendChild(underline);
            }

            tab.addEventListener('mouseenter', () => {
                if (!isActive) tab.style.color = '#131722';
            });
            tab.addEventListener('mouseleave', () => {
                if (!isActive) tab.style.color = '#787b86';
            });
            tab.addEventListener('click', () => {
                this._activeTab = tabName.toLowerCase() as 'inputs' | 'style' | 'visibility';
                this._renderContent();
            });

            tabNav.appendChild(tab);
        });

        this._element.appendChild(tabNav);

        // Content area
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 20px 24px;
            overflow-y: auto;
            flex: 1;
            max-height: 400px;
        `;

        const inputs: { [key: string]: HTMLInputElement } = {};

        if (this._activeTab === 'inputs') {
            this._config.parameters.forEach(param => {
                const row = document.createElement('div');
                row.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 20px;
                `;

                const label = document.createElement('label');
                label.textContent = param.label;
                label.style.cssText = `
                    color: #131722;
                    font-size: 14px;
                `;
                row.appendChild(label);

                if (param.type === 'boolean') {
                    // Checkbox
                    const checkboxWrapper = document.createElement('div');
                    checkboxWrapper.style.cssText = `
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    `;

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = param.value as boolean;
                    checkbox.style.cssText = `
                        width: 18px;
                        height: 18px;
                        accent-color: #131722;
                        cursor: pointer;
                    `;
                    checkbox.addEventListener('change', () => {
                        this._collectedSettings[param.key] = checkbox.checked;
                    });
                    inputs[param.key] = checkbox;

                    checkboxWrapper.appendChild(checkbox);
                    row.innerHTML = '';

                    const checkLabel = document.createElement('label');
                    checkLabel.style.cssText = `
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        cursor: pointer;
                        color: #131722;
                        font-size: 14px;
                    `;
                    checkLabel.appendChild(checkbox);
                    checkLabel.appendChild(document.createTextNode(param.label));
                    row.appendChild(checkLabel);
                } else {
                    // Number/text input
                    const input = document.createElement('input');
                    input.type = param.type === 'number' ? 'number' : 'text';
                    input.value = String(param.value);

                    if (param.type === 'number') {
                        if (param.min !== undefined) input.min = String(param.min);
                        if (param.max !== undefined) input.max = String(param.max);
                        if (param.step !== undefined) input.step = String(param.step);
                    }

                    input.style.cssText = `
                        width: 120px;
                        background: white;
                        border: 1px solid #e0e3eb;
                        border-radius: 6px;
                        padding: 10px 14px;
                        color: #131722;
                        font-size: 14px;
                        outline: none;
                        text-align: left;
                        transition: border-color 0.15s;
                    `;

                    input.addEventListener('focus', () => {
                        input.style.borderColor = '#2962ff';
                    });
                    input.addEventListener('blur', () => {
                        input.style.borderColor = '#e0e3eb';
                    });
                    input.addEventListener('input', () => {
                        this._collectedSettings[param.key] = param.type === 'number'
                            ? parseFloat(input.value)
                            : input.value;
                    });

                    inputs[param.key] = input;
                    row.appendChild(input);
                }

                content.appendChild(row);
            });
        } else if (this._activeTab === 'style') {
            // Style tab - colors and line widths
            const styleParams = this._config.styleParameters || [
                { key: 'lineColor', label: 'Line Color', type: 'color' as const, value: '#7E57C2' },
                { key: 'lineWidth', label: 'Line Width', type: 'number' as const, value: 2, min: 1, max: 5 },
                { key: 'upperBandColor', label: 'Upper Band', type: 'color' as const, value: '#ef5350' },
                { key: 'lowerBandColor', label: 'Lower Band', type: 'color' as const, value: '#26a69a' },
                { key: 'fillColor', label: 'Fill Background', type: 'color' as const, value: '#7E57C220' },
            ];

            styleParams.forEach(param => {
                const row = document.createElement('div');
                row.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 20px;
                `;

                const label = document.createElement('label');
                label.textContent = param.label;
                label.style.cssText = `
                    color: #131722;
                    font-size: 14px;
                `;
                row.appendChild(label);

                if (param.type === 'color') {
                    // Color picker with preview
                    const colorWrapper = document.createElement('div');
                    colorWrapper.style.cssText = `
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    `;

                    const colorInput = document.createElement('input');
                    colorInput.type = 'color';
                    colorInput.value = String(param.value).substring(0, 7);
                    colorInput.style.cssText = `
                        width: 32px;
                        height: 32px;
                        border: 1px solid #e0e3eb;
                        border-radius: 6px;
                        padding: 0;
                        cursor: pointer;
                        -webkit-appearance: none;
                        appearance: none;
                        background: none;
                    `;

                    // Style the color picker appearance
                    const style = document.createElement('style');
                    style.textContent = `
                        input[type="color"]::-webkit-color-swatch-wrapper { padding: 2px; }
                        input[type="color"]::-webkit-color-swatch { border-radius: 4px; border: none; }
                    `;
                    document.head.appendChild(style);

                    colorWrapper.appendChild(colorInput);

                    // Hex input field
                    const hexInput = document.createElement('input');
                    hexInput.type = 'text';
                    hexInput.value = String(param.value).toUpperCase();
                    hexInput.style.cssText = `
                        width: 90px;
                        background: white;
                        border: 1px solid #e0e3eb;
                        border-radius: 6px;
                        padding: 8px 10px;
                        color: #131722;
                        font-size: 13px;
                        font-family: monospace;
                        outline: none;
                    `;

                    // Sync color picker to hex input and save to settings
                    colorInput.addEventListener('input', () => {
                        hexInput.value = colorInput.value.toUpperCase();
                        this._collectedSettings[param.key] = colorInput.value;
                    });

                    // Sync hex input to color picker
                    hexInput.addEventListener('input', () => {
                        if (/^#[0-9A-Fa-f]{6}$/.test(hexInput.value)) {
                            colorInput.value = hexInput.value;
                            this._collectedSettings[param.key] = hexInput.value;
                        }
                    });
                    hexInput.addEventListener('focus', () => hexInput.style.borderColor = '#2962ff');
                    hexInput.addEventListener('blur', () => hexInput.style.borderColor = '#e0e3eb');

                    colorWrapper.appendChild(hexInput);
                    row.appendChild(colorWrapper);
                } else if (param.type === 'number') {
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.value = String(param.value);
                    if (param.min !== undefined) input.min = String(param.min);
                    if (param.max !== undefined) input.max = String(param.max);
                    input.style.cssText = `
                        width: 80px;
                        background: white;
                        border: 1px solid #e0e3eb;
                        border-radius: 6px;
                        padding: 10px 14px;
                        color: #131722;
                        font-size: 14px;
                        outline: none;
                    `;
                    input.addEventListener('focus', () => input.style.borderColor = '#2962ff');
                    input.addEventListener('blur', () => input.style.borderColor = '#e0e3eb');
                    input.addEventListener('input', () => {
                        this._collectedSettings[param.key] = parseFloat(input.value);
                    });
                    row.appendChild(input);
                }

                content.appendChild(row);
            });
        } else {
            // Visibility tab - placeholder
            const placeholder = document.createElement('div');
            placeholder.textContent = 'Visibility settings allow you to control when this indicator is shown on different timeframes.';
            placeholder.style.cssText = `
                color: #787b86;
                font-size: 14px;
                text-align: center;
                padding: 40px 0;
            `;
            content.appendChild(placeholder);
        }

        this._element.appendChild(content);

        // Footer with buttons
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 16px 24px;
            border-top: 1px solid #e0e3eb;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

        // Defaults dropdown
        const defaultsBtn = document.createElement('button');
        defaultsBtn.innerHTML = `Defaults <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 4px;"><path d="M6 9l6 6 6-6"/></svg>`;
        defaultsBtn.style.cssText = `
            background: white;
            border: 1px solid #e0e3eb;
            border-radius: 6px;
            padding: 10px 16px;
            color: #131722;
            font-size: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            transition: all 0.15s;
        `;
        defaultsBtn.addEventListener('mouseenter', () => {
            defaultsBtn.style.background = '#f8f9fd';
        });
        defaultsBtn.addEventListener('mouseleave', () => {
            defaultsBtn.style.background = 'white';
        });
        footer.appendChild(defaultsBtn);

        // Right buttons container
        const rightBtns = document.createElement('div');
        rightBtns.style.cssText = `
            display: flex;
            gap: 10px;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            background: white;
            border: 1px solid #e0e3eb;
            border-radius: 6px;
            padding: 10px 20px;
            color: #131722;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s;
        `;
        cancelBtn.addEventListener('mouseenter', () => {
            cancelBtn.style.background = '#f8f9fd';
        });
        cancelBtn.addEventListener('mouseleave', () => {
            cancelBtn.style.background = 'white';
        });
        cancelBtn.addEventListener('click', () => this.hide());
        rightBtns.appendChild(cancelBtn);

        const okBtn = document.createElement('button');
        okBtn.textContent = 'Ok';
        okBtn.style.cssText = `
            background: #131722;
            border: none;
            border-radius: 6px;
            padding: 10px 24px;
            color: white;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s;
        `;
        okBtn.addEventListener('mouseenter', () => {
            okBtn.style.background = '#2a2e3a';
        });
        okBtn.addEventListener('mouseleave', () => {
            okBtn.style.background = '#131722';
        });
        okBtn.addEventListener('click', () => {
            this._settingsChanged.fire(this._collectedSettings);
            this.hide();
        });
        rightBtns.appendChild(okBtn);

        footer.appendChild(rightBtns);
        this._element.appendChild(footer);
    }

    dispose(): void {
        this._settingsChanged.destroy();
        this._closed.destroy();

        if (this._overlay && this._overlay.parentNode) {
            this._overlay.parentNode.removeChild(this._overlay);
        }

        this._overlay = null;
        this._element = null;
    }
}
