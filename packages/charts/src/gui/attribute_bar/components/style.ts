/**
 * Attribute bar visual constants (TradingView floating drawing toolbar look).
 * All pixel / colour values live here (they are estimates and meant to be fine-tuned in one place).
 * The shared ContextMenu (More menu, drawing right-click menu) reads the `popup` tokens too.
 */

export type BarTheme = 'dark' | 'light';

export const ATTR_BAR_STYLE = {
    /** Theme independent sizes (px) */
    metrics: {
        barHeight: 40,
        barPadding: 4,
        barRadius: 6,
        barGap: 0,
        buttonSize: 32,
        buttonRadius: 4,
        gripWidth: 20,
        separatorWidth: 1,
        separatorHeight: 20,
        separatorMargin: 4,
        iconSize: 28,
        /** Colour stripe under the icon (inside the 32px button) */
        stripeWidth: 18,
        stripeHeight: 3,
        stripeRadius: 1,
        stripeBottom: 3,
        /** Icon lift in colour buttons so the stripe fits under it */
        stripeIconShift: -2,
        popupRadius: 6,
        popupGap: 6,
        popupItemHeight: 32,
        popupPadX: 12,
        popupFontSize: 14,
        popupHintFontSize: 12,
        popupSeparatorMargin: 6,
        popupVPad: 4,
        widthPreviewLength: 16,
        swatchSize: 20,
        swatchGap: 2,
        swatchRadius: 2,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
    },
    dark: {
        barBg: '#1e222d',
        barBorder: '#2a2e39',
        barShadow: '0 2px 4px rgba(0,0,0,.5)',
        icon: '#b2b5be',
        iconHover: '#d1d4dc',
        hoverBg: '#2a2e39',
        pressedBg: '#363a45',
        accent: '#2962ff',
        destructive: '#f23645',
        separator: '#363a45',
        popupBg: '#1e222d',
        popupBorder: '#2a2e39',
        popupShadow: '0 2px 4px rgba(0,0,0,.5)',
        popupText: '#d1d4dc',
        popupDisabledText: '#50535e',
        popupHint: '#787b86',
        popupHoverBg: '#2a2e39',
        popupSeparator: '#2a2e39',
        popupSelectedText: '#2962ff',
        swatchBorder: 'rgba(255,255,255,0.12)',
        checkerA: '#4a4e59',
        checkerB: '#2a2e39',
    },
    light: {
        barBg: '#ffffff',
        barBorder: '#e0e3eb',
        barShadow: '0 2px 4px rgba(0,0,0,.2)',
        icon: '#131722',
        iconHover: '#131722',
        hoverBg: '#f0f3fa',
        pressedBg: '#e0e3eb',
        accent: '#2962ff',
        destructive: '#f23645',
        separator: '#e0e3eb',
        popupBg: '#ffffff',
        popupBorder: '#e0e3eb',
        popupShadow: '0 2px 4px rgba(0,0,0,.2)',
        popupText: '#131722',
        popupDisabledText: '#b2b5be',
        popupHint: '#787b86',
        popupHoverBg: '#f0f3fa',
        popupSeparator: '#e0e3eb',
        popupSelectedText: '#2962ff',
        swatchBorder: 'rgba(0,0,0,0.12)',
        checkerA: '#d1d4dc',
        checkerB: '#ffffff',
    },
};

export type BarColors = typeof ATTR_BAR_STYLE.dark;

export function barColors(theme: BarTheme): BarColors {
    return theme === 'light' ? ATTR_BAR_STYLE.light : ATTR_BAR_STYLE.dark;
}

/** Checkerboard background (for transparent colours) */
export function checkerCss(theme: BarTheme, size: number = 4): string {
    const c = barColors(theme);
    return `background-color: ${c.checkerB}; background-image: linear-gradient(45deg, ${c.checkerA} 25%, transparent 25%, transparent 75%, ${c.checkerA} 75%), linear-gradient(45deg, ${c.checkerA} 25%, transparent 25%, transparent 75%, ${c.checkerA} 75%); background-size: ${size * 2}px ${size * 2}px; background-position: 0 0, ${size}px ${size}px;`;
}

/** True when the colour string is fully transparent */
export function isTransparentColor(color: string): boolean {
    const c = (color || '').replace(/\s+/g, '').toLowerCase();
    if (c === 'transparent') return true;
    const m = c.match(/^rgba\(\d+,\d+,\d+,([\d.]+)\)$/);
    if (m && parseFloat(m[1]) === 0) return true;
    if (/^#[0-9a-f]{8}$/.test(c) && c.endsWith('00')) return true;
    return false;
}

/** Base css of a 32x32 bar button */
export function buttonCss(theme: BarTheme): string {
    const m = ATTR_BAR_STYLE.metrics;
    return `
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        box-sizing: border-box;
        width: ${m.buttonSize}px;
        height: ${m.buttonSize}px;
        padding: 0;
        margin: 0;
        background: transparent;
        border: none;
        border-radius: ${m.buttonRadius}px;
        color: ${barColors(theme).icon};
        cursor: pointer;
        outline: none;
        flex: none;
        transition: background 0.1s ease, color 0.1s ease;
    `;
}

/** Css of a dropdown popup attached under a bar button */
export function popupCss(theme: BarTheme): string {
    const m = ATTR_BAR_STYLE.metrics;
    const c = barColors(theme);
    return `
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-top: ${m.popupGap}px;
        box-sizing: border-box;
        background: ${c.popupBg};
        border: 1px solid ${c.popupBorder};
        border-radius: ${m.popupRadius}px;
        box-shadow: ${c.popupShadow};
        padding: ${m.popupVPad}px 0;
        z-index: 10000;
        font-family: ${m.fontFamily};
        font-size: ${m.popupFontSize}px;
        color: ${c.popupText};
        user-select: none;
    `;
}

/** Css of one popup row (32px high, 12px side padding) */
export function popupRowCss(theme: BarTheme, selected: boolean = false): string {
    const m = ATTR_BAR_STYLE.metrics;
    const c = barColors(theme);
    return `
        display: flex;
        align-items: center;
        gap: 12px;
        box-sizing: border-box;
        height: ${m.popupItemHeight}px;
        padding: 0 ${m.popupPadX}px;
        cursor: pointer;
        white-space: nowrap;
        font-size: ${m.popupFontSize}px;
        color: ${selected ? c.popupSelectedText : c.popupText};
        background: transparent;
    `;
}

/** Row hover background handling */
export function bindRowHover(row: HTMLElement, theme: BarTheme): void {
    const c = barColors(theme);
    row.addEventListener('mouseenter', () => { row.style.background = c.popupHoverBg; });
    row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
}

export const REFRESH_EVENT = 'attrbar-refresh';

export interface ButtonStateOptions {
    /** Icon turns red on hover (delete) */
    destructive?: boolean;
    /** Button looks pressed/hovered while true (open popup) */
    isOpen?: () => boolean;
    /** Toggled-on button (locked) uses the accent icon colour */
    isToggled?: () => boolean;
}

/**
 * Hover / pressed / open / toggled colouring for a bar button.
 * Dispatch `refreshButtonState(btn)` after changing the underlying state.
 */
export function bindButtonStates(btn: HTMLElement, theme: BarTheme, opts: ButtonStateOptions = {}): void {
    const c = barColors(theme);
    let hover = false;
    let pressed = false;
    const apply = () => {
        const open = !!opts.isOpen?.();
        const toggled = !!opts.isToggled?.();
        btn.style.background = pressed ? c.pressedBg : (hover || open) ? c.hoverBg : 'transparent';
        if (toggled) btn.style.color = c.accent;
        else if (hover && opts.destructive) btn.style.color = c.destructive;
        else btn.style.color = (hover || open) ? c.iconHover : c.icon;
    };
    btn.addEventListener('mouseenter', () => { hover = true; apply(); });
    btn.addEventListener('mouseleave', () => { hover = false; pressed = false; apply(); });
    btn.addEventListener('mousedown', () => { pressed = true; apply(); });
    btn.addEventListener('mouseup', () => { pressed = false; apply(); });
    btn.addEventListener(REFRESH_EVENT, apply);
    apply();
}

export function refreshButtonState(btn: HTMLElement): void {
    btn.dispatchEvent(new Event(REFRESH_EVENT));
}
