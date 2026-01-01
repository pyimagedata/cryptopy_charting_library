/**
 * Slider Input Component
 */

export function createSliderInput(
    value: number,
    options: { min: number; max: number; step?: number },
    onChange: (value: number) => void
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `display: flex; align-items: center; gap: 12px;`;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(options.min);
    slider.max = String(options.max);
    slider.step = String(options.step || 1);
    slider.value = String(value ?? options.min);
    slider.style.cssText = `width: 120px;`;

    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = slider.value;
    valueDisplay.style.cssText = `
        font-size: 14px;
        color: #131722;
        min-width: 30px;
    `;

    slider.addEventListener('input', () => {
        valueDisplay.textContent = slider.value;
        onChange(parseFloat(slider.value));
    });

    wrapper.appendChild(slider);
    wrapper.appendChild(valueDisplay);
    return wrapper;
}
