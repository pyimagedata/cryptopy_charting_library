/**
 * Toolbar Button Component
 * Base icon button for attribute bar
 */

export interface ToolbarButtonOptions {
    icon: string;
    title: string;
    className?: string;
    theme?: 'dark' | 'light';
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

    const isDark = options.theme !== 'light';

    btn.style.cssText = styles.button;
    if (options.isDestructive) {
        btn.style.color = '#ef5350';
    } else {
        // Initial color based on theme? Standard is #787b86 which is fine for both
        btn.style.color = isDark ? '#787b86' : '#131722';
    }

    btn.addEventListener('mouseenter', () => {
        btn.style.background = isDark ? '#2a2e39' : '#e0e3eb';
        btn.style.color = options.isDestructive ? '#ff6659' : (isDark ? '#d1d4dc' : '#2962ff');
    });

    btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
        btn.style.color = options.isDestructive ? '#ef5350' : (isDark ? '#787b86' : '#131722');
    });

    btn.addEventListener('click', onClick);
    return btn;
}
