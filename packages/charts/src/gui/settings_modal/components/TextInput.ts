/**
 * Text Input Component
 * Styled text input for string values (labels, names, etc.)
 */

const styles = {
    input: `
        width: 120px;
        padding: 6px 10px;
        background: #1e222d;
        border: 1px solid #363a45;
        border-radius: 4px;
        color: #d1d4dc;
        font-size: 13px;
        outline: none;
        transition: border-color 0.15s;
    `,
};

export interface TextInputOptions {
    placeholder?: string;
    maxLength?: number;
    width?: string;
}

/**
 * Creates a styled text input
 */
export function createTextInput(
    value: string,
    options: TextInputOptions = {},
    onChange: (value: string) => void
): HTMLElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.style.cssText = styles.input;

    if (options.placeholder) {
        input.placeholder = options.placeholder;
    }
    if (options.maxLength) {
        input.maxLength = options.maxLength;
    }
    if (options.width) {
        input.style.width = options.width;
    }

    input.addEventListener('focus', () => {
        input.style.borderColor = '#2962ff';
    });

    input.addEventListener('blur', () => {
        input.style.borderColor = '#363a45';
    });

    input.addEventListener('input', () => {
        onChange(input.value);
    });

    return input;
}
