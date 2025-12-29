/**
 * Toggle Button Component
 * Icon-based toggle button for boolean options (reverse, extend left/right, etc.)
 */

export interface ToggleButtonOptions {
    icon?: string;      // SVG or text icon
    label?: string;     // Text label
    tooltip?: string;   // Hover tooltip
}

const styles = {
    button: `
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 6px 10px;
        background: #2a2e39;
        border: none;
        border-radius: 4px;
        color: #787b86;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.15s ease;
        gap: 6px;
    `,
    buttonActive: `
        background: #2962ff;
        color: #ffffff;
    `,
    icon: `
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
    `,
};

// Common icons for drawing options
export const TOGGLE_ICONS = {
    reverse: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 2L4 6h3v4H3v2h4v2l4-4-4-4v2H5V6h3L8 2z"/>
    </svg>`,
    extendLeft: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M2 8h10M2 8l3-3M2 8l3 3" stroke="currentColor" stroke-width="1.5" fill="none"/>
    </svg>`,
    extendRight: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4 8h10M14 8l-3-3M14 8l-3 3" stroke="currentColor" stroke-width="1.5" fill="none"/>
    </svg>`,
    lockPrice: `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <rect x="3" y="7" width="10" height="7" rx="1"/>
        <path d="M5 7V5a3 3 0 116 0v2" stroke="currentColor" stroke-width="1.5" fill="none"/>
    </svg>`,
};

/**
 * Creates a toggle button for boolean options
 */
export function createToggleButton(
    active: boolean,
    options: ToggleButtonOptions,
    onChange: (active: boolean) => void
): HTMLElement {
    const button = document.createElement('button');
    button.style.cssText = styles.button;
    if (active) {
        button.style.cssText += styles.buttonActive;
    }

    if (options.tooltip) {
        button.title = options.tooltip;
    }

    // Add icon
    if (options.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.style.cssText = styles.icon;
        iconSpan.innerHTML = options.icon;
        button.appendChild(iconSpan);
    }

    // Add label
    if (options.label) {
        const labelSpan = document.createElement('span');
        labelSpan.textContent = options.label;
        button.appendChild(labelSpan);
    }

    let isActive = active;

    button.onclick = () => {
        isActive = !isActive;
        button.style.cssText = isActive
            ? styles.button + styles.buttonActive
            : styles.button;
        onChange(isActive);
    };

    button.onmouseenter = () => {
        if (!isActive) {
            button.style.background = '#363a45';
        }
    };

    button.onmouseleave = () => {
        if (!isActive) {
            button.style.background = '#2a2e39';
        }
    };

    return button;
}

/**
 * Creates a toggle button group (multiple toggle buttons in a row)
 */
export function createToggleButtonGroup(
    buttons: Array<{
        key: string;
        active: boolean;
        options: ToggleButtonOptions;
    }>,
    onChange: (key: string, active: boolean) => void
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; gap: 4px;';

    buttons.forEach(btn => {
        const toggleBtn = createToggleButton(btn.active, btn.options, (active) => {
            onChange(btn.key, active);
        });
        wrapper.appendChild(toggleBtn);
    });

    return wrapper;
}
