/**
 * Indicator Settings Helper Functions
 * 
 * Factory functions for creating settings configurations.
 */

import {
    SettingsTab,
    SettingsSection,
    ColorSettingRow,
    NumberSettingRow,
    CheckboxSettingRow,
    LineWidthSettingRow,
    SliderSettingRow
} from '../../../drawings/drawing-settings-config';

// ============================================================================
// Tab Helpers
// ============================================================================

/** Create Inputs tab */
export function createInputsTab(sections: SettingsSection[]): SettingsTab {
    return { id: 'inputs', label: 'Inputs', sections };
}

/** Create Style tab */
export function createStyleTab(sections: SettingsSection[]): SettingsTab {
    return { id: 'style', label: 'Style', sections };
}

/** Create Visibility tab */
export function createVisibilityTab(): SettingsTab {
    return {
        id: 'visibility',
        label: 'Visibility',
        sections: [{
            rows: [
                { type: 'checkbox', key: 'visible', label: 'Show on all timeframes', defaultValue: true }
            ]
        }]
    };
}

// ============================================================================
// Row Helpers
// ============================================================================

/** Number input row */
export function numberRow(key: string, label: string, min?: number, max?: number, step?: number): NumberSettingRow {
    return { type: 'number', key, label, min, max, step };
}

/** Color picker row */
export function colorRow(key: string, label: string, defaultValue?: string): ColorSettingRow {
    return { type: 'color', key, label, defaultValue };
}

/** Checkbox row */
export function checkboxRow(key: string, label: string, defaultValue?: boolean): CheckboxSettingRow {
    return { type: 'checkbox', key, label, defaultValue };
}

/** Line width row */
export function lineWidthRow(key: string, label: string = 'Line Width'): LineWidthSettingRow {
    return { type: 'lineWidth', key, label, min: 1, max: 4 };
}

/** Slider row */
export function sliderRow(key: string, label: string, min: number, max: number, step?: number): SliderSettingRow {
    return { type: 'slider', key, label, min, max, step };
}
