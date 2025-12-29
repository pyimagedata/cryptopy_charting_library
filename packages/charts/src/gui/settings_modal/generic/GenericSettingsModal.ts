/**
 * Generic Settings Modal
 * Config-driven modal for simple drawings (TrendLine, Rectangle, etc.)
 * Reads settings config from drawing class and renders UI dynamically
 */

import { Drawing, DrawingPoint } from '../../../drawings';
import { BaseSettingsModal } from '../base/BaseSettingsModal';
import {
    SettingsConfig,
    SettingsSection,
    SettingsRow,
    DrawingSettingsProvider,
    isColorRow,
    isNumberRow,
    isSliderRow,
    isCheckboxRow,
    isLineStyleRow,
    isLineWidthRow,
    isSelectRow,
} from '../base/SettingsTypes';
import {
    createColorSwatch,
    createNumberInput,
    createSlider,
    createCheckbox,
    createLineStyleButtons,
    createLineWidthSelector,
    createSelect,
    createSection,
    createSettingsRow,
    LineStyleValue,
} from '../base/SettingsComponents';

/** Drawing type to human-readable title mapping */
const DRAWING_TITLES: Record<string, string> = {
    trendLine: 'Trend Line',
    horizontalLine: 'Horizontal Line',
    verticalLine: 'Vertical Line',
    ray: 'Ray',
    infoLine: 'Info Line',
    extendedLine: 'Extended Line',
    trendAngle: 'Trend Angle',
    horizontalRay: 'Horizontal Ray',
    crossLine: 'Cross Line',
    parallelChannel: 'Parallel Channel',
    rectangle: 'Rectangle',
    ellipse: 'Ellipse',
    brush: 'Brush',
    highlighter: 'Highlighter',
    arrow: 'Arrow',
    arrowMarker: 'Arrow Marker',
    arrowMarkedUp: 'Arrow Marked Up',
    arrowMarkedDown: 'Arrow Marked Down',
};

/**
 * Generic settings modal for simple drawings.
 * Uses DrawingSettingsProvider.getSettingsConfig() to render UI dynamically.
 * Falls back to default style/visibility tabs if no config provided.
 */
export class GenericSettingsModal extends BaseSettingsModal {
    private _settingsConfig: SettingsConfig | null = null;

    /** Get modal title */
    protected getTitle(): string {
        if (!this._currentDrawing) return 'Settings';
        return DRAWING_TITLES[this._currentDrawing.type] || 'Drawing Settings';
    }

    /** Initialize by reading settings config from drawing */
    protected initializeForDrawing(drawing: Drawing): void {
        if (this._isSettingsProvider(drawing)) {
            this._settingsConfig = drawing.getSettingsConfig();
        } else {
            this._settingsConfig = null;
        }
    }

    /** Check if drawing implements DrawingSettingsProvider */
    private _isSettingsProvider(drawing: Drawing): drawing is Drawing & DrawingSettingsProvider {
        return 'getSettingsConfig' in drawing &&
            'getSettingValue' in drawing &&
            'setSettingValue' in drawing;
    }

    /** Render tab content based on tab ID */
    protected renderTabContent(tabId: string, container: HTMLElement): void {
        switch (tabId) {
            case 'style':
                this._renderStyleTab(container);
                break;
            case 'coordinates':
                this._renderCoordinatesTab(container);
                break;
            case 'visibility':
                this._renderVisibilityTab(container);
                break;
        }
    }

    /** Render style tab - either from config or fallback */
    private _renderStyleTab(container: HTMLElement): void {
        if (!this._currentDrawing) return;

        // Try to use config-driven rendering
        if (this._settingsConfig && this._isSettingsProvider(this._currentDrawing)) {
            const styleTab = this._settingsConfig.tabs.find(t => t.id === 'style');
            if (styleTab) {
                this._renderSectionsFromConfig(container, styleTab.sections, this._currentDrawing as Drawing & DrawingSettingsProvider);
                return;
            }
        }

        // Fallback: Default style controls
        this._renderDefaultStyleTab(container);
    }

    /** Render sections from config (data-driven) */
    private _renderSectionsFromConfig(
        container: HTMLElement,
        sections: SettingsSection[],
        provider: Drawing & DrawingSettingsProvider
    ): void {
        sections.forEach(section => {
            const sectionEl = createSection(section.title, (content) => {
                section.rows.forEach(row => {
                    const control = this._createControlForRow(row, provider);
                    if (control) {
                        const rowEl = createSettingsRow(row.label || '', control);
                        content.appendChild(rowEl);
                    }
                });
            });
            container.appendChild(sectionEl);
        });
    }

    /** Create appropriate control for a settings row */
    private _createControlForRow(row: SettingsRow, provider: Drawing & DrawingSettingsProvider): HTMLElement | null {
        const currentValue = provider.getSettingValue(row.key);

        if (isColorRow(row)) {
            return createColorSwatch(currentValue || '#2962ff', (color) => {
                provider.setSettingValue(row.key, color);
                this.notifySettingsChanged();
            });
        }

        if (isNumberRow(row)) {
            return createNumberInput(
                currentValue ?? row.min ?? 1,
                row.min ?? 0,
                row.max ?? 100,
                row.step ?? 1,
                (value) => {
                    provider.setSettingValue(row.key, value);
                    this.notifySettingsChanged();
                }
            );
        }

        if (isSliderRow(row)) {
            return createSlider(
                currentValue ?? row.min,
                row.min,
                row.max,
                row.step ?? 1,
                row.suffix ?? '',
                (value) => {
                    provider.setSettingValue(row.key, value);
                    this.notifySettingsChanged();
                }
            );
        }

        if (isCheckboxRow(row)) {
            return createCheckbox(currentValue ?? false, '', (checked) => {
                provider.setSettingValue(row.key, checked);
                this.notifySettingsChanged();
            });
        }

        if (isLineStyleRow(row)) {
            const style = currentValue || 'solid';
            return createLineStyleButtons(style as LineStyleValue, (newStyle) => {
                provider.setSettingValue(row.key, newStyle);
                this.notifySettingsChanged();
            });
        }

        if (isLineWidthRow(row)) {
            return createLineWidthSelector(currentValue ?? 2, (width) => {
                provider.setSettingValue(row.key, width);
                this.notifySettingsChanged();
            });
        }

        if (isSelectRow(row)) {
            return createSelect(row.options, currentValue ?? '', (value) => {
                provider.setSettingValue(row.key, value);
                this.notifySettingsChanged();
            });
        }

        return null;
    }

    /** Fallback: render default style tab for drawings without config */
    private _renderDefaultStyleTab(container: HTMLElement): void {
        const drawing = this._currentDrawing;
        if (!drawing) return;

        // Line section
        const lineSection = createSection('Line', (content) => {
            // Color
            const colorRow = createSettingsRow('Color',
                createColorSwatch(drawing.style.color, (color) => {
                    drawing.style.color = color;
                    this.notifySettingsChanged();
                })
            );
            content.appendChild(colorRow);

            // Width
            const widthRow = createSettingsRow('Width',
                createLineWidthSelector(drawing.style.lineWidth, (width) => {
                    drawing.style.lineWidth = width;
                    this.notifySettingsChanged();
                })
            );
            content.appendChild(widthRow);

            // Style
            const currentStyle = this._getLineStyleFromDash(drawing.style.lineDash);
            const styleRow = createSettingsRow('Style',
                createLineStyleButtons(currentStyle, (style) => {
                    drawing.style.lineDash = this._getDashFromLineStyle(style);
                    this.notifySettingsChanged();
                })
            );
            content.appendChild(styleRow);
        });
        container.appendChild(lineSection);

        // Background section (for shapes with fill)
        if ('fillColor' in drawing.style && drawing.style.fillColor) {
            const bgSection = createSection('Background', (content) => {
                const colorRow = createSettingsRow('Color',
                    createColorSwatch(drawing.style.fillColor || '#2962ff', (color) => {
                        drawing.style.fillColor = color;
                        this.notifySettingsChanged();
                    })
                );
                content.appendChild(colorRow);

                if ('fillOpacity' in drawing.style) {
                    const opacityRow = createSettingsRow('Opacity',
                        createSlider(
                            Math.round((drawing.style.fillOpacity ?? 0.2) * 100),
                            0, 100, 1, '%',
                            (value) => {
                                drawing.style.fillOpacity = value / 100;
                                this.notifySettingsChanged();
                            }
                        )
                    );
                    content.appendChild(opacityRow);
                }
            });
            container.appendChild(bgSection);
        }
    }

    /** Render coordinates tab */
    private _renderCoordinatesTab(container: HTMLElement): void {
        const drawing = this._currentDrawing;
        if (!drawing) return;

        const section = createSection('Points', (content) => {
            drawing.points.forEach((point: DrawingPoint, index: number) => {
                const pointLabel = document.createElement('div');
                pointLabel.style.cssText = `
                    padding: 12px 0;
                    border-bottom: 1px solid #2B2B43;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                `;

                const label = document.createElement('span');
                label.textContent = `Point ${index + 1}`;
                label.style.cssText = 'font-size: 13px; color: #787b86;';

                const values = document.createElement('span');
                const date = new Date(point.time);
                values.textContent = `${date.toLocaleDateString()} | ${point.price.toFixed(2)}`;
                values.style.cssText = 'font-size: 13px; color: #d1d4dc;';

                pointLabel.appendChild(label);
                pointLabel.appendChild(values);
                content.appendChild(pointLabel);
            });
        });
        container.appendChild(section);
    }

    /** Render visibility tab */
    private _renderVisibilityTab(container: HTMLElement): void {
        const drawing = this._currentDrawing;
        if (!drawing) return;

        const section = createSection('Display', (content) => {
            // Visible checkbox
            const visibleRow = createSettingsRow('Visible',
                createCheckbox(drawing.visible, '', (checked) => {
                    drawing.visible = checked;
                    this.notifySettingsChanged();
                })
            );
            content.appendChild(visibleRow);

            // Locked checkbox
            const lockedRow = createSettingsRow('Locked',
                createCheckbox(drawing.locked, '', (checked) => {
                    drawing.locked = checked;
                    this.notifySettingsChanged();
                })
            );
            content.appendChild(lockedRow);
        });
        container.appendChild(section);
    }

    /** Convert lineDash array to style name */
    private _getLineStyleFromDash(lineDash?: number[]): LineStyleValue {
        if (!lineDash || lineDash.length === 0) return 'solid';
        if (lineDash[0] === 6) return 'dashed';
        return 'dotted';
    }

    /** Convert style name to lineDash array */
    private _getDashFromLineStyle(style: LineStyleValue): number[] {
        switch (style) {
            case 'dashed': return [6, 4];
            case 'dotted': return [2, 2];
            default: return [];
        }
    }
}
