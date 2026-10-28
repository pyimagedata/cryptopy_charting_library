/**
 * Select Component (TradingView style dropdown, native <select> for accessibility)
 */

import { t } from '../../../helpers/translations';

export function createSelectInput(
    value: string,
    options: { value: string; label: string }[],
    onChange: (value: string) => void,
    translate = true
): HTMLElement {
    const select = document.createElement('select');
    select.className = 'tvs-input tvs-select';
    options.forEach((o) => {
        const item = document.createElement('option');
        item.value = o.value;
        item.textContent = translate ? t(o.label) : o.label;
        select.appendChild(item);
    });
    // After the options exist: assigning .value earlier is silently dropped
    select.value = value ?? '';
    select.addEventListener('change', () => onChange(select.value));
    return select;
}
