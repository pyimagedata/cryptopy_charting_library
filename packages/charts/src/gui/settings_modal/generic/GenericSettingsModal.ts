/**
 * Generic Settings Modal
 * Config-driven modal for simple drawings (TrendLine, Rectangle, etc.)
 * Uses reusable section components for common UI patterns
 */

import { Drawing } from '../../../drawings';
import { BaseSettingsModal } from '../base/BaseSettingsModal';
import { t } from '../../../helpers/translations';
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
    isTextareaRow,
    isToggleColorRow,
    isGroupRow,
    isLevelsGridRow,
} from '../base/SettingsTypes';
import { createFibLevelsEditor } from '../components';
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
import { createTextArea } from '../components/TextArea';
import { createLineButton, closeLineButtonMenu, LineButtonStyle } from '../components/LineButton';
import { TOOL_GROUPS } from '../../drawing_toolbar/groups/tool_groups';

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
    headShoulders: 'Head & Shoulders',
    xabcd: 'XABCD Pattern',
    xabcdPattern: 'XABCD Pattern',
    abcd: 'ABCD Pattern',
    trianglePattern: 'Triangle Pattern',
    threeDrives: 'Three Drives Pattern',
    cypher: 'Cypher Pattern',
    elliotImpulse: 'Elliott Impulse Wave (12345)',
    elliotCorrection: 'Elliot Correction Wave (ABC)',
};

/** Arac cubugundaki ad (TOOL_GROUPS), yoksa tipten okunur ad ("longPosition" -> "Long Position"). */
function toolTitle(type: string): string {
    for (const group of TOOL_GROUPS as any[]) {
        for (const tool of group.tools ?? []) {
            if (tool.id === type && tool.name) return tool.name;
        }
    }
    return type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

/**
 * Generic settings modal for simple drawings.
 * Uses DrawingSettingsProvider.getSettingsConfig() to render UI dynamically.
 * Falls back to section components if no config provided.
 */
export class GenericSettingsModal extends BaseSettingsModal {
    private _settingsConfig: SettingsConfig | null = null;
    private _genericSnapshot: { style: any; points: any[]; visible: boolean; values: Record<string, any> } | null = null;

    protected getModalWidth(): number {
        return 460;
    }

    protected hasCancel(): boolean {
        return true;
    }

    hide(): void {
        closeLineButtonMenu();
        super.hide();
    }

    /** Ayar yapilandirmasindaki tum anahtarlar (grup ve renk/onay satirlari dahil). */
    private _configKeys(): string[] {
        const keys = new Set<string>();
        const visit = (row: any) => {
            if (!row) return;
            if (row.key) keys.add(row.key);
            if (row.toggleKey) keys.add(row.toggleKey);
            if (row.colorKey) keys.add(row.colorKey);
            (row.rows ?? []).forEach(visit);
        };
        for (const tab of this._settingsConfig?.tabs ?? []) {
            for (const section of tab.sections ?? []) section.rows.forEach(visit);
        }
        return [...keys];
    }

    /** Iptal icin pencere acildigindaki hal: stil, noktalar, gorunurluk ve ayar degerleri. */
    private _takeSnapshot(drawing: Drawing): void {
        const clone = (v: any) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
        const values: Record<string, any> = {};
        if (this._isSettingsProvider(drawing)) {
            for (const key of this._configKeys()) values[key] = clone(drawing.getSettingValue(key));
        }
        this._genericSnapshot = {
            style: clone(drawing.style),
            points: clone(drawing.points),
            visible: drawing.visible,
            values,
        };
    }

    protected onCancel(): void {
        const drawing = this._currentDrawing;
        const snap = this._genericSnapshot;
        if (!drawing || !snap) return;
        drawing.style = JSON.parse(JSON.stringify(snap.style));
        drawing.points = JSON.parse(JSON.stringify(snap.points));
        drawing.visible = snap.visible;
        if (this._isSettingsProvider(drawing)) {
            for (const [key, value] of Object.entries(snap.values)) {
                if (value !== undefined) drawing.setSettingValue(key, JSON.parse(JSON.stringify(value)));
            }
        }
    }

    /** Get modal title */
    protected getTitle(): string {
        if (!this._currentDrawing) return t('Settings');
        const type = this._currentDrawing.type;
        return t(DRAWING_TITLES[type] ?? toolTitle(type));
    }

    /** Initialize by reading settings config from drawing */
    protected initializeForDrawing(drawing: Drawing): void {
        if (this._isSettingsProvider(drawing)) {
            this._settingsConfig = drawing.getSettingsConfig();
        } else {
            this._settingsConfig = null;
        }
        this._takeSnapshot(drawing);

        // Set tabs based on drawing type
        const lineBasedTypes = [
            'trendLine', 'ray', 'extendedLine', 'horizontalLine', 'verticalLine',
            'parallelChannel', 'trendAngle', 'horizontalRay', 'infoLine'
        ];

        if (lineBasedTypes.includes(drawing.type)) {
            // Override getTabs for line-based drawings
            this.getTabs = () => [
                { id: 'style', label: t('Style') },
                { id: 'text', label: t('Text') },
                { id: 'coordinates', label: t('Coordinates') },
                { id: 'visibility', label: t('Visibility') },
            ];
        } else {
            // Use default tabs from base class
            delete (this as any).getTabs;
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

    private _renderSectionsFromConfig(
        container: HTMLElement,
        sections: SettingsSection[],
        provider: Drawing & DrawingSettingsProvider
    ): void {
        sections.forEach(section => {
            const sectionEl = createSection(t(section.title), (content) => {
                // TradingView tarzi: ayni bolumdeki kalinlik + stil (+ renk) tek satirda:
                // [renk kutusu] [cizgi dugmesi -> kalinlik/stil menusu].
                const widthRow = section.rows.find((r) => isLineWidthRow(r)) as any;
                const styleRow = section.rows.find((r) => isLineStyleRow(r)) as any;
                const colorRow = widthRow && styleRow ? section.rows.find((r) => isColorRow(r)) as any : undefined;
                if (widthRow && styleRow) {
                    const controls: HTMLElement[] = [];
                    if (colorRow) {
                        controls.push(createColorSwatch(provider.getSettingValue(colorRow.key) || '#2962ff', (color) => {
                            provider.setSettingValue(colorRow.key, color);
                            this.notifySettingsChanged();
                        }));
                    }
                    controls.push(createLineButton(
                        Number(provider.getSettingValue(widthRow.key) ?? 2),
                        (provider.getSettingValue(styleRow.key) || 'solid') as LineButtonStyle,
                        (w) => { provider.setSettingValue(widthRow.key, w); this.notifySettingsChanged(); },
                        (st) => { provider.setSettingValue(styleRow.key, st); this.notifySettingsChanged(); },
                        this._element,
                    ));
                    const wrap = document.createElement('div');
                    wrap.style.cssText = 'display: flex; align-items: center; gap: 10px;';
                    controls.forEach((c) => wrap.appendChild(c));
                    // TradingView'deki gibi satir adi "Cizgi"; bolum basligi zaten ne oldugunu soyluyor.
                    const label = 'Line';
                    content.appendChild(createSettingsRow(t(label), wrap));
                }
                const combined = new Set<any>([widthRow, styleRow, colorRow].filter((r) => widthRow && styleRow && r));

                section.rows.forEach(row => {
                    if (combined.has(row)) return;

                    // Onay kutusu etiketin solunda (TradingView duzeni)
                    if (isCheckboxRow(row)) {
                        const rowEl = document.createElement('div');
                        rowEl.style.cssText = 'display: flex; align-items: center; padding: 4px 0; min-height: 28px;';
                        const cb = createCheckbox(provider.getSettingValue(row.key) ?? false, row.label ? t(row.label) : '', (checked) => {
                            provider.setSettingValue(row.key, checked);
                            this.notifySettingsChanged();
                        });
                        cb.style.fontSize = '13px';
                        cb.style.color = 'var(--text-primary)';
                        rowEl.appendChild(cb);
                        content.appendChild(rowEl);
                        return;
                    }

                    if (isGroupRow(row)) {
                        const groupEl = document.createElement('div');
                        groupEl.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 4px 0; min-height: 28px;';

                        if (row.label) {
                            const labelEl = document.createElement('span');
                            labelEl.textContent = t(row.label);
                            labelEl.style.cssText = 'font-size: 13px; color: var(--text-primary);';
                            groupEl.appendChild(labelEl);
                        }

                        const controlsWrapper = document.createElement('div');
                        controlsWrapper.style.cssText = 'display: flex; align-items: center; gap: 8px;';

                        row.rows.forEach(subRow => {
                            const ctrl = this._createControlForRow(subRow, provider);
                            if (ctrl) controlsWrapper.appendChild(ctrl);
                        });

                        groupEl.appendChild(controlsWrapper);
                        content.appendChild(groupEl);
                        return;
                    }

                    if (isToggleColorRow(row)) {
                        const rowEl = document.createElement('div');
                        rowEl.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 4px 0; min-height: 28px;';

                        const checked = provider.getSettingValue(row.toggleKey);
                        const checkbox = createCheckbox(checked ?? false, row.label, (val) => {
                            provider.setSettingValue(row.toggleKey, val);
                            this.notifySettingsChanged();
                        });
                        rowEl.appendChild(checkbox);

                        const color = provider.getSettingValue(row.colorKey);
                        const swatch = createColorSwatch(color || '#000000', (val) => {
                            provider.setSettingValue(row.colorKey, val);
                            this.notifySettingsChanged();
                        });
                        rowEl.appendChild(swatch);

                        content.appendChild(rowEl);
                        return;
                    }

                    if (isTextareaRow(row)) {
                        const val = provider.getSettingValue(row.key);
                        const ctrl = createTextArea(val || '', '', (newVal) => {
                            provider.setSettingValue(row.key, newVal);
                            this.notifySettingsChanged();
                        });
                        const rowEl = document.createElement('div');
                        rowEl.style.cssText = 'padding: 4px 0; min-height: 28px;';
                        rowEl.appendChild(ctrl);
                        content.appendChild(rowEl);
                        return;
                    }

                    if (isLevelsGridRow(row)) {
                        const currentLevels = provider.getSettingValue(row.key) || [];
                        const normalizedLevels = currentLevels.map((level: any) => ({
                            level: level.level,
                            label: level.label,
                            color: level.color,
                            visible: level.visible ?? level.enabled ?? true,
                        }));

                        const editor = createFibLevelsEditor(normalizedLevels, (updatedLevels) => {
                            const mappedLevels = updatedLevels.map((level: any) => ({
                                level: level.level,
                                label: level.label,
                                color: level.color,
                                enabled: level.visible,
                            }));

                            provider.setSettingValue(row.key, mappedLevels);
                            this.notifySettingsChanged();
                        });

                        const rowEl = document.createElement('div');
                        rowEl.style.cssText = 'padding: 4px 0; min-height: 28px;';
                        rowEl.appendChild(editor);
                        content.appendChild(rowEl);
                        return;
                    }

                    const control = this._createControlForRow(row, provider);
                    if (control) {
                        const rowEl = createSettingsRow(row.label ? t(row.label) : '', control);
                        content.appendChild(rowEl);
                    }
                });
            });
            container.appendChild(sectionEl);
        });
    }

    private _createControlForRow(row: SettingsRow, provider: Drawing & DrawingSettingsProvider): HTMLElement | null {
        if (isGroupRow(row) || isToggleColorRow(row) || isTextareaRow(row) || isLevelsGridRow(row)) return null;

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
