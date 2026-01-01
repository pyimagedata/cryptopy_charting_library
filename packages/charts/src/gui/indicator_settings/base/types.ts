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

    /** Apply a setting value */
    setSettingValue(key: string, value: any): void;
}

/** Collected settings from modal */
export interface IndicatorSettings {
    [key: string]: number | string | boolean;
}
