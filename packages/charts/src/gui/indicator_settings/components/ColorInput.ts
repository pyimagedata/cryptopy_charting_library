/**
 * Color Input Component
 */

export function createColorInput(
    value: string,
    onChange: (value: string) => void
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `display: flex; align-items: center; gap: 8px;`;

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = (value || '#2962ff').substring(0, 7);
    colorInput.style.cssText = `
        width: 32px;
        height: 32px;
        border: 1px solid #e0e3eb;
        border-radius: 6px;
        padding: 0;
        cursor: pointer;
    `;

    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.value = colorInput.value.toUpperCase();
    hexInput.style.cssText = `
        width: 80px;
        background: white;
        border: 1px solid #e0e3eb;
        border-radius: 6px;
        padding: 8px;
        color: #131722;
        font-size: 13px;
        font-family: monospace;
    `;

    colorInput.addEventListener('input', () => {
        hexInput.value = colorInput.value.toUpperCase();
        onChange(colorInput.value);
    });

    hexInput.addEventListener('input', () => {
        if (/^#[0-9A-Fa-f]{6}$/.test(hexInput.value)) {
            colorInput.value = hexInput.value;
            onChange(hexInput.value);
        }
    });

    wrapper.appendChild(colorInput);
    wrapper.appendChild(hexInput);
    return wrapper;
}
