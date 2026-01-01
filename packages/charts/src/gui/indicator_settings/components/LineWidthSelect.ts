/**
 * Line Width Select Component
 */

export function createLineWidthSelect(
    value: number,
    options: { min?: number; max?: number },
    onChange: (value: number) => void,
    rerenderCallback?: () => void
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `display: flex; gap: 4px;`;

    const min = options.min || 1;
    const max = options.max || 4;

    for (let i = min; i <= max; i++) {
        const btn = document.createElement('button');
        btn.style.cssText = `
            width: 28px;
            height: 28px;
            border: 1px solid ${value === i ? '#2962ff' : '#e0e3eb'};
            background: ${value === i ? '#e3f2fd' : 'white'};
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const line = document.createElement('div');
        line.style.cssText = `
            width: 16px;
            height: ${i}px;
            background: #131722;
            border-radius: 1px;
        `;
        btn.appendChild(line);

        btn.addEventListener('click', () => {
            onChange(i);
            if (rerenderCallback) rerenderCallback();
        });

        wrapper.appendChild(btn);
    }

    return wrapper;
}
