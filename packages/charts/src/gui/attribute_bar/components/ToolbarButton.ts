/**
 * Toolbar Button Component
 * Base icon button for attribute bar
 */

import { buttonCss, bindButtonStates } from './style';

export interface ToolbarButtonOptions {
    icon: string;
    title: string;
    className?: string;
    theme?: 'dark' | 'light';
    isDestructive?: boolean;
}

/**
 * Creates a toolbar icon button
 */
export function createToolbarButton(
    options: ToolbarButtonOptions,
    onClick: () => void
): HTMLButtonElement {
    const theme = options.theme === 'light' ? 'light' : 'dark';
    const btn = document.createElement('button');
    btn.innerHTML = options.icon;
    btn.title = options.title;
    if (options.className) {
        btn.className = options.className;
    }

    btn.style.cssText = buttonCss(theme);
    bindButtonStates(btn, theme, {
        destructive: options.isDestructive,
        isToggled: () => btn.dataset.locked === '1',
    });

    btn.addEventListener('click', onClick);
    return btn;
}
