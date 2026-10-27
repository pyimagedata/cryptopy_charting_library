/**
 * Visibility Section Component
 * Reusable section for visibility settings (visible, locked) and "visibility on intervals"
 */

import { Drawing } from '../../../drawings';
import {
    INTERVAL_UNITS, IntervalUnit, IntervalsPreset, UNIT_BOUNDS,
    buildIntervalsPreset, ensureIntervalsVisibilities, parseTimeframe,
} from '../../../drawings/intervals-visibility';
import { createCheckbox } from '../components/Checkbox';
import { createNumberInput } from '../components/NumberInput';
import { createSection, createSettingsRow } from '../base/SettingsComponents';
import { t } from '../../../helpers/translations';

const UNIT_LABELS: Record<IntervalUnit, string> = {
    seconds: 'Seconds', minutes: 'Minutes', hours: 'Hours', days: 'Days', weeks: 'Weeks', months: 'Months',
};

const PRESETS: [IntervalsPreset, string][] = [
    ['all', 'All intervals'],
    ['current', 'Current interval only'],
    ['above', 'Current interval and above'],
    ['below', 'Current interval and below'],
];

/**
 * Creates a visibility settings section with visible and locked checkboxes
 * and per-interval visibility rows (Ticks, Seconds ... Months, Ranges).
 * `timeframe` is the chart's current timeframe, or a getter read when a preset is applied/rendered.
 */
export function createVisibilitySection(
    drawing: Drawing,
    onChanged: () => void,
    timeframe: string | (() => string) = ''
): HTMLElement {
    const wrapper = document.createElement('div');

    wrapper.appendChild(createSection(t('Display'), (content) => {
        // Visible
        const visibleRow = createSettingsRow(t('Visible'),
            createCheckbox(drawing.visible, '', (checked: boolean) => {
                drawing.visible = checked;
                onChanged();
            })
        );
        content.appendChild(visibleRow);

        // Locked
        const lockedRow = createSettingsRow(t('Locked'),
            createCheckbox(drawing.locked, '', (checked: boolean) => {
                drawing.locked = checked;
                onChanged();
            })
        );
        content.appendChild(lockedRow);
    }));

    wrapper.appendChild(createSection(t('Intervals'), (content) => {
        const render = () => {
            content.innerHTML = '';
            const iv = ensureIntervalsVisibilities(drawing);

            // Hazir ayarlar (mevcut zaman dilimine gore)
            const parsed = parseTimeframe(typeof timeframe === 'function' ? timeframe() : timeframe);
            if (parsed) {
                const select = document.createElement('select');
                select.style.cssText = 'padding: 6px 8px; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 13px;';
                const ph = document.createElement('option');
                ph.value = '';
                ph.textContent = '—';
                select.appendChild(ph);
                for (const [id, label] of PRESETS) {
                    const o = document.createElement('option');
                    o.value = id;
                    o.textContent = t(label);
                    select.appendChild(o);
                }
                select.onchange = () => {
                    if (!select.value) return;
                    Object.assign(iv, buildIntervalsPreset(select.value as IntervalsPreset, parseTimeframe(typeof timeframe === 'function' ? timeframe() : timeframe)));
                    onChanged();
                    render();
                };
                content.appendChild(createSettingsRow(t('Presets'), select));
            }

            content.appendChild(createSettingsRow(t('Ticks'),
                createCheckbox(iv.ticks, '', (c) => { iv.ticks = c; onChanged(); })));

            for (const u of INTERVAL_UNITS) {
                const { min, max } = UNIT_BOUNDS[u];
                const fromKey = `${u}From` as const;
                const toKey = `${u}To` as const;

                const controls = document.createElement('div');
                controls.style.cssText = 'display: flex; align-items: center; gap: 8px;';
                controls.appendChild(createCheckbox(iv[u], '', (c) => { iv[u] = c; onChanged(); }));

                const addNum = (label: string, key: typeof fromKey | typeof toKey) => {
                    const lab = document.createElement('span');
                    lab.textContent = t(label);
                    lab.style.cssText = 'font-size: 12px; color: var(--text-secondary, var(--text-primary));';
                    controls.appendChild(lab);
                    controls.appendChild(createNumberInput(iv[key], min, max, 1, (v) => {
                        iv[key] = Math.round(v);
                        // From <= To
                        if (iv[fromKey] > iv[toKey]) {
                            if (key === fromKey) iv[toKey] = iv[fromKey]; else iv[fromKey] = iv[toKey];
                        }
                        onChanged();
                        render();
                    }));
                };
                addNum('From', fromKey);
                addNum('To', toKey);
                content.appendChild(createSettingsRow(t(UNIT_LABELS[u]), controls));
            }

            content.appendChild(createSettingsRow(t('Ranges'),
                createCheckbox(iv.ranges, '', (c) => { iv.ranges = c; onChanged(); })));
        };
        render();
    }));

    return wrapper;
}
