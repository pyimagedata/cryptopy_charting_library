/**
 * Checkbox Component
 * Styled checkbox with optional label
 */

const styles = {
    checkbox: `
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: #2962ff;
    `,
};

/**
 * Creates a styled checkbox
 */
export function createCheckbox(
    checked: boolean,
    label: string,
    onChange: (checked: boolean) => void
): HTMLElement {
    const wrapper = document.createElement('label');
    wrapper.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkbox.style.cssText = styles.checkbox;

    checkbox.onchange = () => onChange(checkbox.checked);

    wrapper.appendChild(checkbox);

    if (label) {
        const labelSpan = document.createElement('span');
        labelSpan.textContent = label;
        labelSpan.style.cssText = 'font-size: 13px; color: #d1d4dc;';
        wrapper.appendChild(labelSpan);
    }

    return wrapper;
}
