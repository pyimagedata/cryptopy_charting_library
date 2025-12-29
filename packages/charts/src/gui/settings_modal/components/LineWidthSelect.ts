/**
 * Line Width Select Component
 * Button group for selecting line width (1-5)
 */

const LINE_WIDTHS = [1, 2, 3, 4, 5];

/**
 * Creates a line width selector with visual buttons
 */
export function createLineWidthSelect(
    currentWidth: number,
    onChange: (width: number) => void
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; gap: 6px; align-items: center;';

    LINE_WIDTHS.forEach(width => {
        const btn = document.createElement('button');
        btn.style.cssText = `
            width: 28px; height: 28px;
            display: flex; align-items: center; justify-content: center;
            background: ${width === currentWidth ? '#2962ff' : '#2a2e39'};
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.1s;
        `;

        // Draw line representation
        const line = document.createElement('div');
        line.style.cssText = `
            width: 16px;
            height: ${width}px;
            background: ${width === currentWidth ? '#ffffff' : '#d1d4dc'};
            border-radius: 1px;
        `;
        btn.appendChild(line);

        btn.onclick = () => {
            wrapper.querySelectorAll('button').forEach(b => {
                (b as HTMLButtonElement).style.background = '#2a2e39';
                const l = b.querySelector('div');
                if (l) l.style.background = '#d1d4dc';
            });
            btn.style.background = '#2962ff';
            line.style.background = '#ffffff';
            onChange(width);
        };

        btn.onmouseenter = () => {
            if (width !== currentWidth) {
                btn.style.background = '#363a45';
            }
        };
        btn.onmouseleave = () => {
            if (width !== currentWidth) {
                btn.style.background = '#2a2e39';
            }
        };

        wrapper.appendChild(btn);
    });

    return wrapper;
}
