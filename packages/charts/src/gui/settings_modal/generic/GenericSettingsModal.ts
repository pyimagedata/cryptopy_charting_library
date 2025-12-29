/**
 * Generic Settings Modal
 * Config-driven modal for simple drawings (TrendLine, Rectangle, etc.)
 * Uses reusable section components for common UI patterns
 */

import { Drawing } from '../../../drawings';
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

// Import high-level section components
import {
    createBorderSection,
    createBackgroundSection,
    createVisibilitySection,
    createPointsSection,
    createTextSection,
} from '../sections';

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
 * Falls back to section components if no config provided.
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

        // Set tabs based on drawing type
        const lineBasedTypes = [
            'trendLine', 'ray', 'extendedLine', 'horizontalLine', 'verticalLine',
            'parallelChannel', 'trendAngle', 'horizontalRay', 'infoLine'
        ];

        if (lineBasedTypes.includes(drawing.type)) {
            // Line-based drawings have Text tab
            this._tabs = [
                { id: 'style', label: 'Style' },
                { id: 'text', label: 'Text' },
                { id: 'coordinates', label: 'Coordinates' },
                { id: 'visibility', label: 'Visibility' },
            ];
        } else {
            // Other drawings don't have Text tab
            this._tabs = [
                { id: 'style', label: 'Style' },
                { id: 'coordinates', label: 'Coordinates' },
                { id: 'visibility', label: 'Visibility' },
            ];
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
            case 'text':
                this._renderTextTab(container);
                break;
            case 'visibility':
                this._renderVisibilityTab(container);
                break;
        }
    }

    /** Render style tab - either from config or using section components */
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

        // Fallback: Use section components
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

    /** Fallback: render default style tab using section components */
    private _renderDefaultStyleTab(container: HTMLElement): void {
        const drawing = this._currentDrawing;
        if (!drawing) return;

        // Border section (using component)
        const borderSection = createBorderSection(drawing, () => this.notifySettingsChanged());
        container.appendChild(borderSection);

        // Background section (using component) - returns null if not applicable
        const bgSection = createBackgroundSection(drawing, () => this.notifySettingsChanged());
        if (bgSection) {
            container.appendChild(bgSection);
        }
    }

    /** Render coordinates tab using section component */
    private _renderCoordinatesTab(container: HTMLElement): void {
        const drawing = this._currentDrawing;
        if (!drawing) return;

        const pointsSection = createPointsSection(drawing);
        container.appendChild(pointsSection);
    }

    /** Render visibility tab using section component */
    private _renderVisibilityTab(container: HTMLElement): void {
        const drawing = this._currentDrawing;
        if (!drawing) return;

        const visibilitySection = createVisibilitySection(drawing, () => this.notifySettingsChanged());
        container.appendChild(visibilitySection);
    }

    /** Render text tab for line-based drawings */
    private _renderTextTab(container: HTMLElement): void {
        const drawing = this._currentDrawing;
        if (!drawing) return;

        const textSection = createTextSection(drawing, () => this.notifySettingsChanged());
        container.appendChild(textSection);
    }
}
