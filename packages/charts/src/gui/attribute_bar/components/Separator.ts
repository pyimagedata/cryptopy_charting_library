/**
 * Separator Component
 * Vertical separator line for attribute bar
 */

import { ATTR_BAR_STYLE, barColors, BarTheme } from './style';

/**
 * Creates a vertical separator
 */
export function createSeparator(theme: BarTheme = 'dark'): HTMLElement {
    const m = ATTR_BAR_STYLE.metrics;
    const sep = document.createElement('div');
    sep.style.cssText = `
        width: ${m.separatorWidth}px;
        height: ${m.separatorHeight}px;
        background: ${barColors(theme).separator};
        margin: 0 ${m.separatorMargin}px;
        flex: none;
    `;
    return sep;
}
