/**
 * Checkbox Component (TradingView style: 18px box, blue when checked)
 */

const CHECK_SVG = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 6.2 2.4 2.4 4.6-5"/></svg>`;

export function createCheckbox(
    label: string,
    value: boolean,
    onChange: (value: boolean) => void
): HTMLElement {
    const wrapper = document.createElement('label');
    wrapper.className = 'tvs-check';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value ?? false;
    input.addEventListener('change', () => onChange(input.checked));

    const box = document.createElement('span');
    box.className = 'tvs-box';
    box.innerHTML = CHECK_SVG;

    wrapper.appendChild(input);
    wrapper.appendChild(box);
    if (label) {
        const text = document.createElement('span');
        text.textContent = label;
        wrapper.appendChild(text);
    }
    return wrapper;
}
