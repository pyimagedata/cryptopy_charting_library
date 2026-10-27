/**
 * Color Button Component
 * Color picker button with popup palette for attribute bar
 */

import { Drawing } from '../../../drawings';
import { DrawingStyle } from '../../../drawings/drawing';
import { colorToHex } from '../../../drawings/shape-common';
import { ATTR_BAR_STYLE, barColors, buttonCss, bindButtonStates, refreshButtonState, checkerCss, isTransparentColor, popupCss } from './style';

// Color palette - matches TradingView
const COLOR_PALETTE = [
    ['#ffffff', '#e0e0e0', '#bdbdbd', '#9e9e9e', '#757575', '#616161', '#424242', '#303030', '#212121', '#000000'],
    ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50'],
    ['#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#795548', '#9e9e9e', '#607d8b', '#2962ff'],
    ['#ef5350', '#ec407a', '#ab47bc', '#7e57c2', '#5c6bc0', '#42a5f5', '#29b6f6', '#26c6da', '#26a69a', '#66bb6a'],
];

export interface ColorButtonOptions {
    /** DrawingStyle anahtari ya da (setSettingValue/getSettingValue ile cozulen) ozel ayar anahtari */
    property: keyof DrawingStyle | string;
    icon: string;
    title: string;
    allowTransparent?: boolean;
    theme?: 'dark' | 'light';
}

/**
 * Applies a picked color. Drawings that implement setSettingValue go through it (so shape logic such as
 * preserving the visible fill alpha applies); others (or keys it does not handle) get direct assignment.
 */
function applyColor(drawing: Drawing, property: string, color: string): void {
    const d = drawing as any;
    const hasProvider = typeof d.setSettingValue === 'function' && typeof d.getSettingValue === 'function';
    if (property === 'fillColor' && drawing.style.fillEnabled === false) {
        if (hasProvider) d.setSettingValue('fillEnabled', true);
        if (drawing.style.fillEnabled === false) drawing.style.fillEnabled = true;
    }
    if (hasProvider) {
        const before = d.getSettingValue(property);
        d.setSettingValue(property, color);
        if (isColorHandled(before, d.getSettingValue(property), color)) return;
    }
    (drawing.style as any)[property] = color;
}

/**
 * setSettingValue handled the key when the value changed, or when the stored value equals the requested colour
 * (compared as hex, so an alpha-preserving processed value still counts). Otherwise the raw hex is assigned directly.
 */
export function isColorHandled(before: unknown, after: unknown, requested: string): boolean {
    const norm = (c: unknown) => (typeof c === 'string' ? (colorToHex(c) ?? c.toLowerCase()) : c);
    return after !== before || (after !== undefined && norm(after) === norm(requested));
}

/** Paints the colour stripe (checkerboard underneath so transparent / translucent colours stay visible) */
function paintStripe(stripe: HTMLElement, color: string, theme: 'dark' | 'light'): void {
    const m = ATTR_BAR_STYLE.metrics;
    const c = barColors(theme);
    const none = !color || isTransparentColor(color);
    stripe.style.cssText = `
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        bottom: ${m.stripeBottom}px;
        width: ${m.stripeWidth}px;
        height: ${m.stripeHeight}px;
        border-radius: ${m.stripeRadius}px;
        pointer-events: none;
        ${checkerCss(theme, 2)}
        box-shadow: inset 0 0 0 1px ${c.swatchBorder};
    `;
    stripe.innerHTML = none ? '' : `<div style="position:absolute;inset:0;border-radius:${m.stripeRadius}px;background:${color};"></div>`;
}

/**
 * Creates a color picker button with popup
 */
export function createColorButton(
    drawing: Drawing,
    options: ColorButtonOptions,
    onChange: (color: string) => void
): HTMLElement {
    const theme = options.theme === 'light' ? 'light' : 'dark';
    const c = barColors(theme);
    const m = ATTR_BAR_STYLE.metrics;
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: relative; flex: none;';

    // Main button: icon + colour stripe underneath
    const btn = document.createElement('button');
    btn.title = options.title;
    btn.style.cssText = buttonCss(theme);
    const iconBox = document.createElement('span');
    iconBox.style.cssText = `display: flex; align-items: center; justify-content: center; margin-top: ${m.stripeIconShift}px; pointer-events: none;`;
    iconBox.innerHTML = options.icon;
    btn.appendChild(iconBox);

    const stripe = document.createElement('div');
    const d0 = drawing as any;
    const provided = typeof d0.getSettingValue === 'function' ? d0.getSettingValue(options.property) : undefined;
    let currentColor = (typeof provided === 'string' && provided ? provided : (drawing.style as any)[options.property] as string) || '#2962ff';
    paintStripe(stripe, currentColor, theme);
    btn.appendChild(stripe);

    let popup: HTMLElement | null = null;
    bindButtonStates(btn, theme, { isOpen: () => !!popup });

    const setColor = (color: string) => {
        currentColor = color;
        paintStripe(stripe, color, theme);
    };

    const closePopup = () => {
        if (popup) {
            popup.remove();
            popup = null;
        }
        document.removeEventListener('click', handleClickOutside);
        refreshButtonState(btn);
    };

    const handleClickOutside = (e: MouseEvent) => {
        if (!wrapper.contains(e.target as Node)) {
            closePopup();
        }
    };

    btn.addEventListener('click', (e) => {
        e.stopPropagation();

        if (popup) {
            closePopup();
            return;
        }

        popup = document.createElement('div');
        popup.style.cssText = popupCss(theme) + 'padding: 12px;';

        const selectedHex = colorToHex(currentColor);

        // Build color grid
        COLOR_PALETTE.forEach((row, rowIndex) => {
            const rowDiv = document.createElement('div');
            rowDiv.style.cssText = `display: flex; gap: ${m.swatchGap}px; margin-bottom: ${m.swatchGap}px;${rowIndex === 0 ? ` padding-bottom: ${m.swatchGap + 4}px; border-bottom: 1px solid ${c.popupSeparator}; margin-bottom: ${m.swatchGap + 4}px;` : ''}`;

            row.forEach(color => {
                const box = document.createElement('div');
                const selected = selectedHex === colorToHex(color);
                box.dataset.color = color;
                box.style.cssText = `
                    box-sizing: border-box;
                    width: ${m.swatchSize}px; height: ${m.swatchSize}px;
                    flex: none;
                    background: ${color};
                    border-radius: ${m.swatchRadius}px;
                    cursor: pointer;
                    box-shadow: ${selected ? `0 0 0 2px ${c.popupBg}, 0 0 0 3px ${c.accent}` : `inset 0 0 0 1px ${c.swatchBorder}`};
                    transition: transform 0.1s;
                `;
                box.addEventListener('mouseenter', () => box.style.transform = 'scale(1.12)');
                box.addEventListener('mouseleave', () => box.style.transform = 'scale(1)');
                box.addEventListener('click', () => {
                    applyColor(drawing, options.property, color);
                    setColor(color);
                    onChange(color);
                    closePopup();
                });
                rowDiv.appendChild(box);
            });

            popup!.appendChild(rowDiv);
        });

        // Custom color picker: "+" button opens the native colour input
        const customRow = document.createElement('div');
        customRow.style.cssText = `margin-top: 6px; padding-top: 10px; border-top: 1px solid ${c.popupSeparator}; display: flex; gap: 8px; align-items: center;`;

        const addWrap = document.createElement('div');
        addWrap.style.cssText = `position: relative; width: ${m.swatchSize}px; height: ${m.swatchSize}px;`;
        const addBtn = document.createElement('div');
        addBtn.innerHTML = '+';
        addBtn.style.cssText = `
            box-sizing: border-box;
            width: ${m.swatchSize}px; height: ${m.swatchSize}px;
            display: flex; align-items: center; justify-content: center;
            border: 1px dashed ${c.popupHint};
            border-radius: ${m.swatchRadius}px;
            color: ${c.popupHint};
            font-size: 16px; line-height: 1;
            cursor: pointer;
        `;
        addBtn.addEventListener('mouseenter', () => { addBtn.style.background = c.popupHoverBg; });
        addBtn.addEventListener('mouseleave', () => { addBtn.style.background = 'transparent'; });
        const customInput = document.createElement('input');
        customInput.type = 'color';
        customInput.value = colorToHex(currentColor) || '#2962ff';
        customInput.style.cssText = `
            position: absolute; left: 0; top: 0;
            width: ${m.swatchSize}px; height: ${m.swatchSize}px;
            opacity: 0; cursor: pointer; padding: 0; border: none;
        `;
        customInput.addEventListener('change', () => {
            applyColor(drawing, options.property, customInput.value);
            setColor(customInput.value);
            onChange(customInput.value);
            closePopup();
        });
        addWrap.appendChild(addBtn);
        addWrap.appendChild(customInput);
        customRow.appendChild(addWrap);

        popup.appendChild(customRow);
        wrapper.appendChild(popup);
        refreshButtonState(btn);

        setTimeout(() => { if (popup) document.addEventListener('click', handleClickOutside); }, 10);
    });

    wrapper.appendChild(btn);
    return wrapper;
}
