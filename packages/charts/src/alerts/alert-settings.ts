/**
 * Page-level alert display / notification settings (shared by all charts, persisted in localStorage).
 * Keys: charts.alerts.lines / axisLabels / toast / sound ('1' | '0', default on).
 */
export interface AlertSettings {
    lines: boolean;
    axisLabels: boolean;
    toast: boolean;
    sound: boolean;
}

export type AlertSettingKey = keyof AlertSettings;

const KEYS: Record<AlertSettingKey, string> = {
    lines: 'charts.alerts.lines',
    axisLabels: 'charts.alerts.axisLabels',
    toast: 'charts.alerts.toast',
    sound: 'charts.alerts.sound',
};

const listeners = new Set<() => void>();
let cache: AlertSettings | null = null;

function load(): AlertSettings {
    const out: AlertSettings = { lines: true, axisLabels: true, toast: true, sound: true };
    try {
        for (const k of Object.keys(KEYS) as AlertSettingKey[]) {
            if (localStorage.getItem(KEYS[k]) === '0') out[k] = false;
        }
    } catch { /* storage unavailable */ }
    return out;
}

export function getAlertSettings(): Readonly<AlertSettings> {
    if (!cache) cache = load();
    return cache;
}

export function setAlertSetting(key: AlertSettingKey, value: boolean): void {
    const cur = getAlertSettings();
    if (cur[key] === value) return;
    cache = { ...cur, [key]: value };
    try { localStorage.setItem(KEYS[key], value ? '1' : '0'); } catch { /* storage unavailable */ }
    for (const l of [...listeners]) {
        try { l(); } catch (e) { console.error('[alerts] settings listener failed', e); }
    }
}

export function onAlertSettingsChange(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/** Drops the in-memory copy so the next read re-reads storage (tests). */
export function resetAlertSettingsCache(): void {
    cache = null;
}
