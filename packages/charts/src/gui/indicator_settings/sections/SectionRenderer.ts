/**
 * Section Renderer
 * 
 * Renders a settings section with title and rows.
 */

import { SettingsSection, SettingRow } from '../base';
import {
    createNumberInput,
    createColorInput,
    createCheckbox,
    createLineWidthSelect,
    createSliderInput
} from '../components';
import { t } from '../../../helpers/translations';

export interface SectionContext {
    getValue: (key: string) => any;
    setValue: (key: string, value: any) => void;
    rerender: () => void;
}

export function renderSection(section: SettingsSection, context: SectionContext): HTMLElement {
    const container = document.createElement('div');

    if (section.title) {
        const titleEl = document.createElement('div');
        titleEl.textContent = t(section.title);
        titleEl.style.cssText = `
            font-size: 12px;
            font-weight: 600;
            color: #787b86;
            text-transform: uppercase;
            margin-bottom: 12px;
            margin-top: 16px;
        `;
        container.appendChild(titleEl);
    }

    section.rows.forEach(row => {
        container.appendChild(renderRow(row, context));
    });

    return container;
}

function renderRow(row: SettingRow, context: SectionContext): HTMLElement {
    const rowEl = document.createElement('div');
    rowEl.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
    `;

    const currentValue = (row as any).key ? context.getValue((row as any).key) : undefined;

    switch (row.type) {
        case 'number': {
            const label = document.createElement('label');
            label.textContent = row.label ? t(row.label) : '';
            label.style.cssText = `color: #131722; font-size: 14px;`;
            rowEl.appendChild(label);

            rowEl.appendChild(createNumberInput(
                currentValue as number,
                { min: (row as any).min, max: (row as any).max, step: (row as any).step },
                (value) => (row as any).key && context.setValue((row as any).key, value)
            ));
            break;
        }

        case 'color': {
            const label = document.createElement('label');
            label.textContent = row.label ? t(row.label) : '';
            label.style.cssText = `color: #131722; font-size: 14px;`;
            rowEl.appendChild(label);

            rowEl.appendChild(createColorInput(
                currentValue as string || (row as any).defaultValue || '#2962ff',
                (value) => (row as any).key && context.setValue((row as any).key, value)
            ));
            break;
        }

        case 'checkbox': {
            rowEl.innerHTML = '';
            rowEl.appendChild(createCheckbox(
                row.label ? t(row.label) : '',
                currentValue as boolean ?? (row as any).defaultValue ?? false,
                (value) => (row as any).key && context.setValue((row as any).key, value)
            ));
            break;
        }

        case 'select': {
            const label = document.createElement('label');
            label.textContent = row.label ? t(row.label) : '';
            label.style.cssText = `color: #131722; font-size: 14px;`;
            rowEl.appendChild(label);

            const select = document.createElement('select');
            select.style.cssText = `
                min-width: 150px;
                height: 34px;
                border: 1px solid #e0e3eb;
                border-radius: 6px;
                background: #ffffff;
                color: #131722;
                font-size: 13px;
                padding: 0 10px;
                outline: none;
            `;

            ((row as any).options || []).forEach((option: { value: string; label: string }) => {
                const item = document.createElement('option');
                item.value = option.value;
                item.textContent = t(option.label);
                select.appendChild(item);
            });

            // Must run AFTER the options exist: assigning .value to a <select> with no
            // matching child is silently dropped, leaving the browser on option[0]. That
            // made every select in every indicator display its first entry regardless of
            // the saved setting.
            select.value = (currentValue as string) || (row as any).defaultValue || '';

            select.addEventListener('change', () => {
                if ((row as any).key) {
                    context.setValue((row as any).key, select.value);
                }
            });

            rowEl.appendChild(select);
            break;
        }

        case 'lineWidth': {
            const label = document.createElement('label');
            label.textContent = row.label ? t(row.label) : '';
            label.style.cssText = `color: #131722; font-size: 14px;`;
            rowEl.appendChild(label);

            rowEl.appendChild(createLineWidthSelect(
                currentValue as number,
                { min: (row as any).min || 1, max: (row as any).max || 4 },
                (value) => (row as any).key && context.setValue((row as any).key, value),
                context.rerender
            ));
            break;
        }

        case 'slider': {
            const label = document.createElement('label');
            label.textContent = row.label ? t(row.label) : '';
            label.style.cssText = `color: #131722; font-size: 14px;`;
            rowEl.appendChild(label);

            rowEl.appendChild(createSliderInput(
                currentValue as number,
                { min: (row as any).min, max: (row as any).max, step: (row as any).step },
                (value) => (row as any).key && context.setValue((row as any).key, value)
            ));
            break;
        }

        default: {
            const label = document.createElement('label');
            label.textContent = row.label ? t(row.label) : '';
            label.style.cssText = `color: #131722; font-size: 14px;`;
            rowEl.appendChild(label);
        }
    }

    return rowEl;
}
