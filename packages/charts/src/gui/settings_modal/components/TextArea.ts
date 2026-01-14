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
        background: var(--input-bg);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        color: var(--text-primary);
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
        textArea.style.borderColor = 'var(--border-color)';
    });

    textArea.addEventListener('input', () => {
        onInput(textArea.value);
    });

    return textArea;
}
