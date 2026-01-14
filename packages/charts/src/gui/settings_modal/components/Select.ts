/**
 * Select Dropdown Component
 * Styled select with options
 */

export interface SelectOption {
    value: string;
    label: string;
}

/**
 * Creates a styled select dropdown
 */
export function createSelect(
    options: SelectOption[],
    currentValue: string,
    onChange: (value: string) => void
): HTMLElement {
    const select = document.createElement('select');
    select.style.cssText = `
        padding: 6px 10px;
        background: var(--input-bg);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        color: var(--text-primary);
        font-size: 13px;
        cursor: pointer;
        min-width: 100px;
    `;

    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === currentValue) option.selected = true;
        select.appendChild(option);
    });

    select.onchange = () => onChange(select.value);
    return select;
}
