/**
 * Separator Component
 * Vertical separator line for attribute bar
 */

/**
 * Creates a vertical separator
 */
export function createSeparator(): HTMLElement {
    const sep = document.createElement('div');
    sep.style.cssText = `
        width: 1px;
        height: 20px;
        background: #2B2B43;
        margin: 0 4px;
    `;
    return sep;
}
