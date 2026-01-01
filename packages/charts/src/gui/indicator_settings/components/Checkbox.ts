/**
 * Checkbox Component
 */

export function createCheckbox(
    label: string,
    value: boolean,
    onChange: (value: boolean) => void
): HTMLElement {
    const wrapper = document.createElement('label');
    wrapper.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        color: #131722;
        font-size: 14px;
    `;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = value ?? false;
    checkbox.style.cssText = `
        width: 18px;
        height: 18px;
        accent-color: #131722;
        cursor: pointer;
    `;

    checkbox.addEventListener('change', () => onChange(checkbox.checked));

    wrapper.appendChild(checkbox);
    wrapper.appendChild(document.createTextNode(label));
    return wrapper;
}
