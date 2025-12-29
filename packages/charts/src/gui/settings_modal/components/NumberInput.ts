/**
 * Number Input Component
 * Styled number input with min/max validation
 */

const styles = {
    input: `
        width: 60px;
        padding: 6px 8px;
        background: #1e222d;
        border: 1px solid #363a45;
        border-radius: 4px;
        color: #d1d4dc;
        font-size: 13px;
    `,
};

/**
 * Creates a number input with validation
 */
export function createNumberInput(
    value: number,
    min: number,
    max: number,
    step: number = 1,
    onChange: (value: number) => void
): HTMLElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = value.toString();
    input.min = min.toString();
    input.max = max.toString();
    input.step = step.toString();
    input.style.cssText = styles.input;

    input.onchange = () => {
        let val = parseFloat(input.value);
        if (isNaN(val)) val = min;
        val = Math.max(min, Math.min(max, val));
        input.value = val.toString();
        onChange(val);
    };

    return input;
}
