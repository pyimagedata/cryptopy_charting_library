/**
 * Pure logic of the indicator settings dialog: snapshot / revert for Cancel and
 * "Defaults" (save as default per indicator type, reset). No DOM; storage is injected.
 */

export interface SettingsProviderLike {
    getSettingValue(key: string): any;
    setSettingValue(key: string, value: any): boolean;
}

export interface SettingsStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export type SettingsValues = Record<string, any>;

const DEFAULTS_PREFIX = 'indicator_defaults_v1:';

/** Keys never stored in saved defaults (per-instance state, not style) */
/** Settings every indicator has, routed through get/setCommonSetting (see withCommonSettings) */
export const COMMON_KEYS = ['precision', 'intervalsVisibilities'];

const NON_DEFAULT_KEYS = new Set(['visible', 'intervalsVisibilities', 'id', 'name', 'type']);

export function cloneValue<T>(v: T): T {
    if (v === null || typeof v !== 'object') return v;
    return JSON.parse(JSON.stringify(v));
}

/** Current value of every key, deep-copied */
export function snapshotSettings(provider: SettingsProviderLike, keys: string[]): SettingsValues {
    const out: SettingsValues = {};
    for (const k of keys) out[k] = cloneValue(provider.getSettingValue(k));
    return out;
}

/**
 * Write values back (Cancel / Reset). Only keys whose value differs are applied.
 * Returns true when any applied setting asked for a recalculation.
 */
export function applySettings(provider: SettingsProviderLike, values: SettingsValues, current?: SettingsValues): boolean {
    let recalc = false;
    for (const [k, v] of Object.entries(values)) {
        if (v === undefined && !COMMON_KEYS.includes(k)) continue;
        if (current && JSON.stringify(current[k]) === JSON.stringify(v)) continue;
        if (provider.setSettingValue(k, cloneValue(v))) recalc = true;
    }
    return recalc;
}

export interface CommonSettingsHost {
    getCommonSetting?(key: string): any;
    setCommonSetting?(key: string, value: any): void;
}

/**
 * Provider view where `precision` / `intervalsVisibilities` are routed to the
 * indicator's common-setting accessors (subclasses override get/setSettingValue
 * with their own option copies, which know nothing about these two).
 */
export function withCommonSettings<T extends SettingsProviderLike & CommonSettingsHost>(provider: T): SettingsProviderLike {
    return {
        getSettingValue: (key) => COMMON_KEYS.includes(key) && provider.getCommonSetting
            ? provider.getCommonSetting(key)
            : provider.getSettingValue(key),
        setSettingValue: (key, value) => {
            if (COMMON_KEYS.includes(key) && provider.setCommonSetting) { provider.setCommonSetting(key, value); return false; }
            return provider.setSettingValue(key, value);
        },
    };
}

export function defaultsStorageKey(typeId: string): string {
    return DEFAULTS_PREFIX + typeId;
}

export function filterDefaultValues(values: SettingsValues): SettingsValues {
    const out: SettingsValues = {};
    for (const [k, v] of Object.entries(values)) {
        if (NON_DEFAULT_KEYS.has(k) || v === undefined || typeof v === 'function') continue;
        out[k] = cloneValue(v);
    }
    return out;
}

export function saveDefaults(storage: SettingsStorage | null, typeId: string, values: SettingsValues): boolean {
    if (!storage || !typeId) return false;
    try {
        storage.setItem(defaultsStorageKey(typeId), JSON.stringify(filterDefaultValues(values)));
        return true;
    } catch { return false; }
}

export function loadDefaults(storage: SettingsStorage | null, typeId: string): SettingsValues | null {
    if (!storage || !typeId) return null;
    try {
        const raw = storage.getItem(defaultsStorageKey(typeId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? filterDefaultValues(parsed) : null;
    } catch { return null; }
}

export function clearDefaults(storage: SettingsStorage | null, typeId: string): void {
    try { storage?.removeItem(defaultsStorageKey(typeId)); } catch { /* ignore */ }
}

/**
 * Apply the saved defaults of `typeId` to a freshly created indicator.
 * Only keys the indicator actually exposes (value !== undefined) are written.
 */
export function applySavedDefaults(provider: SettingsProviderLike, storage: SettingsStorage | null, typeId: string): boolean {
    const saved = loadDefaults(storage, typeId);
    if (!saved) return false;
    const usable: SettingsValues = {};
    for (const [k, v] of Object.entries(saved)) {
        if (provider.getSettingValue(k) !== undefined) usable[k] = v;
    }
    applySettings(provider, usable);
    return true;
}

/** Values "Reset settings" should restore: factory values overlaid with the saved defaults. */
export function resolveResetValues(factory: SettingsValues, saved: SettingsValues | null): SettingsValues {
    const out = filterDefaultValues(factory);
    if (saved) for (const [k, v] of Object.entries(saved)) if (k in out) out[k] = cloneValue(v);
    return out;
}

export function safeLocalStorage(): SettingsStorage | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage;
    } catch { return null; }
}
