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

export interface SectionContext {
    getValue: (key: string) => any;
    setValue: (key: string, value: any) => void;
    rerender: () => void;
}

export function renderSection(section: SettingsSection, context: SectionContext): HTMLElement {
    const container = document.createElement('div');

    if (section.title) {
        const titleEl = document.createElement('div');
        titleEl.textContent = section.title;
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

    const currentValue = row.key ? context.getValue(row.key) : undefined;

    switch (row.type) {
        case 'number': {
            const label = document.createElement('label');
            label.textContent = row.label;
            label.style.cssText = `color: #131722; font-size: 14px;`;
            rowEl.appendChild(label);

            rowEl.appendChild(createNumberInput(
                currentValue as number,
                { min: (row as any).min, max: (row as any).max, step: (row as any).step },
                (value) => row.key && context.setValue(row.key, value)
            ));
            break;
        }

        case 'color': {
            const label = document.createElement('label');
            label.textContent = row.label;
            label.style.cssText = `color: #131722; font-size: 14px;`;
            rowEl.appendChild(label);

            rowEl.appendChild(createColorInput(
                currentValue as string || (row as any).defaultValue || '#2962ff',
                (value) => row.key && context.setValue(row.key, value)
            ));
            break;
        }

        case 'checkbox': {
            rowEl.innerHTML = '';
            rowEl.appendChild(createCheckbox(
                row.label,
                currentValue as boolean ?? (row as any).defaultValue ?? false,
                (value) => row.key && context.setValue(row.key, value)
            ));
            break;
        }

        case 'lineWidth': {
            const label = document.createElement('label');
            label.textContent = row.label;
            label.style.cssText = `color: #131722; font-size: 14px;`;
            rowEl.appendChild(label);

            rowEl.appendChild(createLineWidthSelect(
                currentValue as number,
                { min: (row as any).min || 1, max: (row as any).max || 4 },
                (value) => row.key && context.setValue(row.key, value),
                context.rerender
            ));
            break;
        }

        case 'slider': {
            const label = document.createElement('label');
            label.textContent = row.label;
            label.style.cssText = `color: #131722; font-size: 14px;`;
            rowEl.appendChild(label);

            rowEl.appendChild(createSliderInput(
                currentValue as number,
                { min: (row as any).min, max: (row as any).max, step: (row as any).step },
                (value) => row.key && context.setValue(row.key, value)
            ));
            break;
        }

        default: {
            const label = document.createElement('label');
            label.textContent = row.label;
            label.style.cssText = `color: #131722; font-size: 14px;`;
            rowEl.appendChild(label);
        }
    }

    return rowEl;
}
