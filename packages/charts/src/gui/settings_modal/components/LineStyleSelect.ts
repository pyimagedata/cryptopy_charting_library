/**
 * Line Style Select Component
 * Button group for selecting line style (Solid, Dashed, Dotted)
 */

export type LineStyleValue = 'solid' | 'dashed' | 'dotted';

interface StyleOption {
    value: LineStyleValue;
    label: string;
    dash: number[];
}

const STYLE_OPTIONS: StyleOption[] = [
    { value: 'solid', label: '━━━', dash: [] },
    { value: 'dashed', label: '┅┅┅', dash: [6, 4] },
    { value: 'dotted', label: '┈┈┈', dash: [2, 2] },
];

const styles = {
    button: `
        padding: 6px 12px;
        background: #2a2e39;
        border: none;
        border-radius: 4px;
        color: #787b86;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.1s;
    `,
    buttonActive: `
        background: #2962ff;
        color: #ffffff;
    `,
};

/**
 * Creates a line style selector with Solid/Dashed/Dotted options
 */
export function createLineStyleSelect(
    currentStyle: LineStyleValue,
    onChange: (style: LineStyleValue) => void
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; gap: 4px;';

    STYLE_OPTIONS.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt.label;
        btn.style.cssText = styles.button;
        if (opt.value === currentStyle) {
            btn.style.cssText += styles.buttonActive;
        }

        btn.onclick = () => {
            wrapper.querySelectorAll('button').forEach(b => {
                (b as HTMLButtonElement).style.cssText = styles.button;
            });
            btn.style.cssText = styles.button + styles.buttonActive;
            onChange(opt.value);
        };

        btn.onmouseenter = () => {
            if (opt.value !== currentStyle) {
                btn.style.background = '#363a45';
            }
        };
        btn.onmouseleave = () => {
            if (opt.value !== currentStyle) {
                btn.style.background = '#2a2e39';
            }
        };

        wrapper.appendChild(btn);
    });

    return wrapper;
}

/** Convert lineDash array to style value */
export function dashToLineStyle(lineDash?: number[]): LineStyleValue {
    if (!lineDash || lineDash.length === 0) return 'solid';
    if (lineDash[0] === 6) return 'dashed';
    return 'dotted';
}

/** Convert style value to lineDash array */
export function lineStyleToDash(style: LineStyleValue): number[] {
    const opt = STYLE_OPTIONS.find(o => o.value === style);
    return opt ? opt.dash : [];
}
