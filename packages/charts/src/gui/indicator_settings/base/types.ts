/**
 * Indicator Settings Types
 * 
 * Core type definitions for the indicator settings system.
 */

import { SettingRow, SettingsSection, SettingsTab } from '../../../drawings/drawing-settings-config';

// Re-export drawing types for convenience
export { SettingRow, SettingsSection, SettingsTab };

/** Complete settings configuration for an indicator */
export interface IndicatorSettingsConfig {
    name: string;
    tabs: SettingsTab[];
}

/** Interface that indicators implement to provide their settings */
export interface IndicatorSettingsProvider {
    /** Get the settings configuration for the modal */
    getSettingsConfig(): IndicatorSettingsConfig;

    /** Get current value for a setting key */
    getSettingValue(key: string): any;

    /** Apply a setting value. Returns true if recalculation is needed. */
    setSettingValue(key: string, value: any): boolean;

    /** Common settings (precision, intervalsVisibilities) shared by every indicator */
    getCommonSetting?(key: string): any;
    setCommonSetting?(key: string, value: any): void;
    /** True when plot values are shown in the legend (enables the Precision select) */
    supportsPrecision?(): boolean;
    /** Short name for the dialog title (e.g. "RSI") */
    getLegendInfo?(index?: number | null): { title: string };
    /** Recompute from the current source data (used when a live change needs it) */
    recalculate?(): void;
    /** Calculated data; reference changes when the indicator recalculated itself */
    readonly data?: readonly unknown[];
}

/** Options for IndicatorSettingsModal.showForIndicator */
export interface IndicatorSettingsOpenOptions {
    /** Indicator type id ("RSI", "EMA", ...) used to persist "Save as default" */
    typeId?: string;
    /** Current chart timeframe, for the visibility presets */
    getTimeframe?: () => string;
}

/** Collected settings from modal */
export interface IndicatorSettings {
    [key: string]: number | string | boolean;
}
