/**
 * Section Renderer
 *
 * Renders a settings section (small uppercase group header + rows) TradingView style:
 * label on the left, control(s) on the right. In the Style tab neighbouring rows are
 * folded into one TV-like row: "<colour> + <line width>" and "<value> + <colour>".
 */

import { SettingsSection, SettingRow } from '../base';
import {
    createNumberInput,
    createColorInput,
    createCheckbox,
    createLineWidthSelect,
    createSliderInput,
    createSelectInput
} from '../components';
import { t } from '../../../helpers/translations';

export interface SectionContext {
    getValue: (key: string) => any;
    setValue: (key: string, value: any) => void;
    rerender: () => void;
    /** Dialog root: carries the theme variables the shared popovers copy */
    host?: HTMLElement | null;
    /** 'style' enables the row folding described above */
    mode?: 'inputs' | 'style';
}

type AnyRow = SettingRow & Record<string, any>;

export function renderSection(section: SettingsSection, context: SectionContext): HTMLElement {
    const container = document.createElement('div');

    if (section.title) {
        const titleEl = document.createElement('div');
        titleEl.className = 'tvs-group';
        titleEl.textContent = t(section.title);
        container.appendChild(titleEl);
    }

    const rows = section.rows as AnyRow[];
    const fold = context.mode === 'style';
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const next = rows[i + 1];
        if (fold && next) {
            if (row.type === 'color' && isWidthRow(next)) {
                container.appendChild(renderColorWidthRow(row, next, context));
                i++;
                continue;
            }
            if (row.type === 'number' && !isWidthRow(row) && next.type === 'color' && colorBelongsToNumber(row, next)) {
                container.appendChild(renderValueColorRow(row, next, context));
                i++;
                continue;
            }
        }
        container.appendChild(renderRow(row, context));
    }

    return container;
}

function isWidthRow(row: AnyRow): boolean {
    if (row.type === 'lineWidth') return true;
    return row.type === 'number' && /^(line)?width$/i.test(String(row.key || ''));
}

const stripColor = (label: string) => String(label || '').replace(/\s*colou?r\s*$/i, '').trim();

function colorBelongsToNumber(num: AnyRow, color: AnyRow): boolean {
    const nl = String(num.label || '').trim().toLowerCase();
    const cl = stripColor(color.label as string).toLowerCase();
    if (nl && cl && nl === cl) return true;
    const nk = String(num.key || '').replace(/(level|value)$/i, '').toLowerCase();
    const ck = String(color.key || '').replace(/colou?r$/i, '').toLowerCase();
    return !!nk && nk === ck;
}

function makeRowEl(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'tvs-row';
    return el;
}

function labelEl(text: string): HTMLElement {
    const label = document.createElement('label');
    label.className = 'tvs-label';
    label.textContent = text ? t(text) : '';
    label.title = label.textContent || '';
    return label;
}

function colorControl(row: AnyRow, context: SectionContext): HTMLElement {
    return createColorInput(
        (context.getValue(row.key) as string) || row.defaultValue || '#2962ff',
        (value) => context.setValue(row.key, value)
    );
}

function widthControl(row: AnyRow, context: SectionContext): HTMLElement {
    return createLineWidthSelect(
        Number(context.getValue(row.key)) || 1,
        { min: row.min || 1, max: row.max || 4 },
        (value) => context.setValue(row.key, value),
        context.rerender,
        context.host ?? null
    );
}

function numberControl(row: AnyRow, context: SectionContext): HTMLElement {
    return createNumberInput(
        context.getValue(row.key) as number,
        { min: row.min, max: row.max, step: row.step },
        (value) => context.setValue(row.key, value)
    );
}

function controls(...els: HTMLElement[]): HTMLElement {
    const c = document.createElement('div');
    c.className = 'tvs-controls';
    els.forEach((e) => c.appendChild(e));
    return c;
}

/** "Line  [swatch] [width]" */
function renderColorWidthRow(color: AnyRow, width: AnyRow, context: SectionContext): HTMLElement {
    const el = makeRowEl();
    el.appendChild(labelEl(stripColor(color.label as string) || 'Line'));
    el.appendChild(controls(colorControl(color, context), widthControl(width, context)));
    return el;
}

/** "Overbought  [70] [swatch]" */
function renderValueColorRow(num: AnyRow, color: AnyRow, context: SectionContext): HTMLElement {
    const el = makeRowEl();
    el.appendChild(labelEl(num.label as string));
    el.appendChild(controls(numberControl(num, context), colorControl(color, context)));
    return el;
}

function renderRow(row: AnyRow, context: SectionContext): HTMLElement {
    const rowEl = makeRowEl();
    const key = row.key as string | undefined;
    const currentValue = key ? context.getValue(key) : undefined;

    switch (row.type) {
        case 'number': {
            rowEl.appendChild(labelEl(row.label as string));
            rowEl.appendChild(isWidthRow(row) && context.mode === 'style'
                ? controls(widthControl(row, context))
                : numberControl(row, context));
            break;
        }

        case 'color': {
            rowEl.appendChild(labelEl(row.label as string));
            rowEl.appendChild(controls(colorControl(row, context)));
            break;
        }

        case 'checkbox': {
            rowEl.appendChild(createCheckbox(
                row.label ? t(row.label) : '',
                (currentValue as boolean) ?? row.defaultValue ?? false,
                (value) => key && context.setValue(key, value)
            ));
            break;
        }

        case 'select': {
            rowEl.appendChild(labelEl(row.label as string));
            rowEl.appendChild(createSelectInput(
                String(currentValue ?? row.defaultValue ?? ''),
                row.options || [],
                (value) => key && context.setValue(key, value)
            ));
            break;
        }

        case 'lineWidth': {
            rowEl.appendChild(labelEl(row.label as string));
            rowEl.appendChild(controls(widthControl(row, context)));
            break;
        }

        case 'slider': {
            rowEl.appendChild(labelEl(row.label as string));
            rowEl.appendChild(createSliderInput(
                currentValue as number,
                { min: row.min, max: row.max, step: row.step },
                (value) => key && context.setValue(key, value)
            ));
            break;
        }

        default: {
            rowEl.appendChild(labelEl(row.label as string));
        }
    }

    return rowEl;
}
