/**
 * Toolbar Button Component
 * Base icon button for attribute bar
 */

export interface ToolbarButtonOptions {
    icon: string;
    title: string;
    className?: string;
    isDestructive?: boolean;
}

const styles = {
    button: `
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        background: transparent;
        border: none;
        border-radius: 4px;
        color: #787b86;
        cursor: pointer;
        transition: all 0.1s ease;
    `,
    destructive: `
        color: #ef5350;
    `,
};

/**
 * Creates a toolbar icon button
 */
export function createToolbarButton(
    options: ToolbarButtonOptions,
    onClick: () => void
): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.innerHTML = options.icon;
    btn.title = options.title;
    if (options.className) {
        btn.className = options.className;
    }

    btn.style.cssText = styles.button;
    if (options.isDestructive) {
        btn.style.color = '#ef5350';
    }

    btn.addEventListener('mouseenter', () => {
        btn.style.background = '#2a2e39';
        btn.style.color = options.isDestructive ? '#ff6659' : '#d1d4dc';
    });

    btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
        btn.style.color = options.isDestructive ? '#ef5350' : '#787b86';
    });

    btn.addEventListener('click', onClick);
    return btn;
}
