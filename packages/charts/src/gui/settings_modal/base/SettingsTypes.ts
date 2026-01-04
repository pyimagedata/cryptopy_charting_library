/**
 * Settings Modal - Type Definitions
 * Shared types for drawing settings modals
 */

// ========================================
// Row Types - Individual setting controls
// ========================================

export interface ColorRow {
    type: 'color';
    key: string;
    label: string;
}

export interface NumberRow {
    type: 'number';
    key: string;
    label: string;
    min?: number;
    max?: number;
    step?: number;
}

export interface SliderRow {
    type: 'slider';
    key: string;
    label: string;
    min: number;
    max: number;
    step?: number;
    suffix?: string; // e.g., '%' for opacity
}

export interface CheckboxRow {
    type: 'checkbox';
    key: string;
    label: string;
}

export interface LineStyleRow {
    type: 'lineStyle';
    key: string;
    label?: string;
}

export interface SelectRow {
    type: 'select';
    key: string;
    label: string;
    options: Array<{ value: string; label: string }>;
}

export interface LineWidthRow {
    type: 'lineWidth';
    key: string;
    label?: string;
}

export interface TextareaRow {
    type: 'textarea';
    key: string;
    label?: string;
}

export interface ToggleColorRow {
    type: 'toggleColor';
    toggleKey: string;
    colorKey: string;
    label: string;
}

export interface GroupRow {
    type: 'group';
    rows: SettingsRow[];
    label?: string;
}

// Union of all row types
export type SettingsRow =
    | ColorRow
    | NumberRow
    | SliderRow
    | CheckboxRow
    | LineStyleRow
    | SelectRow
    | LineWidthRow
    | TextareaRow
    | ToggleColorRow
    | GroupRow;

// ========================================
// Section - Group of related settings
// ========================================

export interface SettingsSection {
    title: string;
    rows: SettingsRow[];
    collapsible?: boolean;
}

// ========================================
// Tab - Modal tab configuration
// ========================================

export interface SettingsTab {
    id: string;
    label: string;
    icon?: string;
    sections: SettingsSection[];
}

// ========================================
// Full Settings Config
// ========================================

export interface SettingsConfig {
    tabs: SettingsTab[];
}

// ========================================
// Settings Provider Interface
// ========================================

/**
 * Interface that drawing classes implement to provide settings configuration.
 * The modal reads this config to dynamically generate UI.
 */
export interface DrawingSettingsProvider {
    /** Get the settings configuration for this drawing */
    getSettingsConfig(): SettingsConfig;

    /** Get current value for a setting key */
    getSettingValue(key: string): any;

    /** Set value for a setting key */
    setSettingValue(key: string, value: any): void;

    /** Get attribute bar items (optional quick-access settings) */
    getAttributeBarItems?(): AttributeBarItem[];
}

// ========================================
// Attribute Bar Items (Quick Access)
// ========================================

export interface AttributeBarItem {
    type: 'color' | 'lineWidth' | 'lineStyle' | 'checkbox';
    key: string;
    tooltip?: string;
}

// ========================================
// Helper type guards
// ========================================

export function isColorRow(row: SettingsRow): row is ColorRow {
    return row.type === 'color';
}

export function isNumberRow(row: SettingsRow): row is NumberRow {
    return row.type === 'number';
}

export function isSliderRow(row: SettingsRow): row is SliderRow {
    return row.type === 'slider';
}

export function isCheckboxRow(row: SettingsRow): row is CheckboxRow {
    return row.type === 'checkbox';
}

export function isLineStyleRow(row: SettingsRow): row is LineStyleRow {
    return row.type === 'lineStyle';
}

export function isSelectRow(row: SettingsRow): row is SelectRow {
    return row.type === 'select';
}

export function isLineWidthRow(row: SettingsRow): row is LineWidthRow {
    return row.type === 'lineWidth';
}

export function isTextareaRow(row: SettingsRow): row is TextareaRow {
    return row.type === 'textarea';
}

export function isToggleColorRow(row: SettingsRow): row is ToggleColorRow {
    return row.type === 'toggleColor';
}

export function isGroupRow(row: SettingsRow): row is GroupRow {
    return row.type === 'group';
}
