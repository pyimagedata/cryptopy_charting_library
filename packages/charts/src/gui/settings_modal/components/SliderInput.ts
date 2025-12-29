/**
 * Slider Input Component
 * Range slider with value display
 */

const styles = {
    slider: `
        width: 100%;
        height: 4px;
        background: #2B2B43;
        border-radius: 2px;
        outline: none;
        -webkit-appearance: none;
    `,
};

/**
 * Creates a slider with value label
 */
export function createSliderInput(
    value: number,
    min: number,
    max: number,
    step: number = 1,
    suffix: string = '',
    onChange: (value: number) => void
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; align-items: center; gap: 12px; flex: 1;';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.value = value.toString();
    slider.min = min.toString();
    slider.max = max.toString();
    slider.step = step.toString();
    slider.style.cssText = styles.slider + 'flex: 1;';

    const valueLabel = document.createElement('span');
    valueLabel.textContent = `${value}${suffix}`;
    valueLabel.style.cssText = 'font-size: 12px; color: #787b86; min-width: 40px; text-align: right;';

    slider.oninput = () => {
        const val = parseFloat(slider.value);
        valueLabel.textContent = `${val}${suffix}`;
        onChange(val);
    };

    wrapper.appendChild(slider);
    wrapper.appendChild(valueLabel);
    return wrapper;
}
