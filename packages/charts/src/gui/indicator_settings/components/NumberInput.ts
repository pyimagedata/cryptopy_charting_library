/**
 * Number Input Component
 */

export function createNumberInput(
    value: number,
    options: { min?: number; max?: number; step?: number },
    onChange: (value: number) => void
): HTMLElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value ?? 0);
    if (options.min !== undefined) input.min = String(options.min);
    if (options.max !== undefined) input.max = String(options.max);
    if (options.step !== undefined) input.step = String(options.step);

    input.style.cssText = `
        width: 80px;
        background: white;
        border: 1px solid #e0e3eb;
        border-radius: 6px;
        padding: 8px 12px;
        color: #131722;
        font-size: 14px;
        outline: none;
    `;

    input.addEventListener('focus', () => input.style.borderColor = '#2962ff');
    input.addEventListener('blur', () => input.style.borderColor = '#e0e3eb');
    input.addEventListener('input', () => onChange(parseFloat(input.value)));

    return input;
}
