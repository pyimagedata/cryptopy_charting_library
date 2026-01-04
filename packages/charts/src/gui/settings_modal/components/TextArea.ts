/**
 * Text Area Component
 */

export function createTextArea(
    value: string,
    placeholder: string,
    onInput: (value: string) => void
): HTMLElement {
    const textArea = document.createElement('textarea');
    textArea.value = value;
    textArea.placeholder = placeholder || '';
    textArea.style.cssText = `
        width: 100%;
        min-height: 100px;
        padding: 10px;
        background: #1e222d;
        border: 1px solid #363a45;
        border-radius: 6px;
        color: #d1d4dc;
        font-size: 13px;
        font-family: inherit;
        resize: vertical;
        outline: none;
        box-sizing: border-box;
    `;

    textArea.addEventListener('focus', () => {
        textArea.style.borderColor = '#2962ff';
    });

    textArea.addEventListener('blur', () => {
        textArea.style.borderColor = '#363a45';
    });

    textArea.addEventListener('input', () => {
        onInput(textArea.value);
    });

    return textArea;
}
