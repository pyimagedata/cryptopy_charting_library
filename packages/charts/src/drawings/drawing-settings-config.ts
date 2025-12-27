/**
 * Drawing Settings Configuration System
 * 
 * Base interfaces for defining drawing-specific settings and attribute bar items.
 * Each drawing type implements these interfaces to provide its own customized UI.
 */

// ============================================================================
// Settings Row Types
// ============================================================================

/** Color picker setting */
export interface ColorSettingRow {
    type: 'color';
    key: string;
    label: string;
    defaultValue?: string;
}

/** Line width setting (1-4 toggle buttons) */
export interface LineWidthSettingRow {
    type: 'lineWidth';
    key: string;
    label: string;
    min?: number;
    max?: number;
    defaultValue?: number;
}

/** Line style setting (solid, dashed, dotted) */
export interface LineStyleSettingRow {
    type: 'lineStyle';
    key: string;
    label: string;
    defaultValue?: 'solid' | 'dashed' | 'dotted';
}

/** Checkbox/toggle setting */
export interface CheckboxSettingRow {
    type: 'checkbox';
    key: string;
    label: string;
    defaultValue?: boolean;
}

/** Slider setting */
export interface SliderSettingRow {
    type: 'slider';
    key: string;
    label: string;
    min: number;
    max: number;
    step?: number;
    unit?: string;  // e.g., '%'
    defaultValue?: number;
}

/** Number input setting */
export interface NumberSettingRow {
    type: 'number';
    key: string;
    label: string;
    min?: number;
    max?: number;
    step?: number;
    defaultValue?: number;
}

/** Fibonacci levels grid setting */
export interface LevelsGridSettingRow {
    type: 'levelsGrid';
    key: string;
    label: string;
}

/** Dropdown select setting */
export interface SelectSettingRow {
    type: 'select';
    key: string;
    label: string;
    options: { value: string; label: string }[];
    defaultValue?: string;
}

/** Union of all setting row types */
export type SettingRow =
    | ColorSettingRow
    | LineWidthSettingRow
    | LineStyleSettingRow
    | CheckboxSettingRow
    | SliderSettingRow
    | NumberSettingRow
    | LevelsGridSettingRow
    | SelectSettingRow;

// ============================================================================
// Settings Section and Tab
// ============================================================================

/** A section within a tab (can have optional title) */
export interface SettingsSection {
    title?: string;
    rows: SettingRow[];
}

/** A tab in the settings modal */
export interface SettingsTab {
    id: string;
    label: string;
    icon?: string;  // SVG string
    sections: SettingsSection[];
}

/** Complete settings configuration for a drawing */
export interface DrawingSettingsConfig {
    tabs: SettingsTab[];
}

// ============================================================================
// Attribute Bar Types
// ============================================================================

/** Attribute bar item types */
export type AttributeBarItemType = 'color' | 'lineWidth' | 'lineStyle' | 'toggle' | 'separator';

/** Base attribute bar item */
export interface AttributeBarItemBase {
    type: AttributeBarItemType;
    key?: string;
    tooltip?: string;
}

/** Color picker in attribute bar */
export interface AttributeBarColorItem extends AttributeBarItemBase {
    type: 'color';
    key: string;
}

/** Line width selector in attribute bar */
export interface AttributeBarLineWidthItem extends AttributeBarItemBase {
    type: 'lineWidth';
    key: string;
}

/** Line style selector in attribute bar */
export interface AttributeBarLineStyleItem extends AttributeBarItemBase {
    type: 'lineStyle';
    key: string;
}

/** Toggle button in attribute bar */
export interface AttributeBarToggleItem extends AttributeBarItemBase {
    type: 'toggle';
    key: string;
    icon: string;  // SVG string
    activeIcon?: string;
}

/** Separator in attribute bar */
export interface AttributeBarSeparatorItem extends AttributeBarItemBase {
    type: 'separator';
}

/** Union of all attribute bar item types */
export type AttributeBarItem =
    | AttributeBarColorItem
    | AttributeBarLineWidthItem
    | AttributeBarLineStyleItem
    | AttributeBarToggleItem
    | AttributeBarSeparatorItem;

// ============================================================================
// Drawing Settings Provider Interface
// ============================================================================

/**
 * Interface that drawings implement to provide their settings configuration.
 * This allows each drawing type to define its own customized settings UI.
 */
export interface DrawingSettingsProvider {
    /** Get the settings configuration for the modal */
    getSettingsConfig(): DrawingSettingsConfig;

    /** Get the attribute bar items for quick access */
    getAttributeBarItems(): AttributeBarItem[];

    /** Get current value for a setting key */
    getSettingValue(key: string): any;

    /** Apply a setting value */
    setSettingValue(key: string, value: any): void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a standard style tab configuration
 */
export function createStyleTab(sections: SettingsSection[]): SettingsTab {
    return {
        id: 'style',
        label: 'Style',
        sections
    };
}

/**
 * Create a standard coordinates tab configuration
 */
export function createCoordinatesTab(sections: SettingsSection[]): SettingsTab {
    return {
        id: 'coordinates',
        label: 'Coordinates',
        sections
    };
}

/**
 * Create a standard visibility tab configuration
 */
export function createVisibilityTab(): SettingsTab {
    return {
        id: 'visibility',
        label: 'Visibility',
        sections: [
            {
                rows: [
                    { type: 'checkbox', key: 'visible', label: 'Show on all timeframes', defaultValue: true }
                ]
            }
        ]
    };
}

/**
 * Standard color row
 */
export function colorRow(key: string, label: string, defaultValue?: string): ColorSettingRow {
    return { type: 'color', key, label, defaultValue };
}

/**
 * Standard line width row
 */
export function lineWidthRow(key: string, label: string = 'Line Width'): LineWidthSettingRow {
    return { type: 'lineWidth', key, label, min: 1, max: 4 };
}

/**
 * Standard line style row
 */
export function lineStyleRow(key: string, label: string = 'Line Style'): LineStyleSettingRow {
    return { type: 'lineStyle', key, label };
}

/**
 * Standard checkbox row
 */
export function checkboxRow(key: string, label: string, defaultValue?: boolean): CheckboxSettingRow {
    return { type: 'checkbox', key, label, defaultValue };
}

/**
 * Standard slider row
 */
export function sliderRow(key: string, label: string, min: number, max: number, unit?: string): SliderSettingRow {
    return { type: 'slider', key, label, min, max, unit };
}
