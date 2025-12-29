/**
 * Color Button Component
 * Color picker button with popup palette for attribute bar
 */

import { Drawing } from '../../../drawings';
import { DrawingStyle } from '../../../drawings/drawing';

// Color palette - matches TradingView
const COLOR_PALETTE = [
    ['#ffffff', '#e0e0e0', '#bdbdbd', '#9e9e9e', '#757575', '#616161', '#424242', '#303030', '#212121', '#000000'],
    ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50'],
    ['#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#795548', '#9e9e9e', '#607d8b', '#2962ff'],
    ['#ef5350', '#ec407a', '#ab47bc', '#7e57c2', '#5c6bc0', '#42a5f5', '#29b6f6', '#26c6da', '#26a69a', '#66bb6a'],
];

export interface ColorButtonOptions {
    property: keyof DrawingStyle;
    icon: string;
    title: string;
    allowTransparent?: boolean;
}

/**
 * Creates a color picker button with popup
 */
export function createColorButton(
    drawing: Drawing,
    options: ColorButtonOptions,
    onChange: (color: string) => void
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: relative;';

    // Main button
    const btn = document.createElement('button');
    btn.innerHTML = options.icon;
    btn.title = options.title;
    btn.style.cssText = `
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
        position: relative;
    `;

    // Color indicator
    const colorDot = document.createElement('div');
    const currentColor = (drawing.style[options.property] as string) || '#2962ff';
    colorDot.style.cssText = `
        position: absolute;
        bottom: 2px;
        right: 2px;
        width: 8px;
        height: 8px;
        border-radius: 2px;
        background: ${currentColor};
        border: 1px solid rgba(0,0,0,0.2);
    `;
    btn.appendChild(colorDot);

    btn.addEventListener('mouseenter', () => {
        btn.style.background = '#2a2e39';
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
    });

    let popup: HTMLElement | null = null;

    const closePopup = () => {
        if (popup) {
            popup.remove();
            popup = null;
        }
    };

    const handleClickOutside = (e: MouseEvent) => {
        if (!wrapper.contains(e.target as Node)) {
            closePopup();
            document.removeEventListener('click', handleClickOutside);
        }
    };

    btn.addEventListener('click', (e) => {
        e.stopPropagation();

        if (popup) {
            closePopup();
            return;
        }

        popup = document.createElement('div');
        popup.style.cssText = `
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            margin-top: 8px;
            background: #1e222d;
            border-radius: 8px;
            padding: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            z-index: 10000;
        `;

        // Build color grid
        COLOR_PALETTE.forEach(row => {
            const rowDiv = document.createElement('div');
            rowDiv.style.cssText = 'display: flex; gap: 4px; margin-bottom: 4px;';

            row.forEach(color => {
                const box = document.createElement('div');
                box.style.cssText = `
                    width: 22px; height: 22px;
                    background: ${color};
                    border-radius: 4px;
                    cursor: pointer;
                    border: 1px solid rgba(255,255,255,0.1);
                    transition: transform 0.1s;
                `;
                box.addEventListener('mouseenter', () => box.style.transform = 'scale(1.15)');
                box.addEventListener('mouseleave', () => box.style.transform = 'scale(1)');
                box.addEventListener('click', () => {
                    (drawing.style as any)[options.property] = color;
                    colorDot.style.background = color;
                    onChange(color);
                    closePopup();
                });
                rowDiv.appendChild(box);
            });

            popup!.appendChild(rowDiv);
        });

        // Custom color picker
        const customRow = document.createElement('div');
        customRow.style.cssText = 'margin-top: 8px; display: flex; gap: 8px; align-items: center;';

        const customInput = document.createElement('input');
        customInput.type = 'color';
        customInput.value = currentColor;
        customInput.style.cssText = `
            width: 28px; height: 28px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            -webkit-appearance: none;
            padding: 0;
        `;
        customInput.addEventListener('change', () => {
            (drawing.style as any)[options.property] = customInput.value;
            colorDot.style.background = customInput.value;
            onChange(customInput.value);
            closePopup();
        });
        customRow.appendChild(customInput);

        popup.appendChild(customRow);
        wrapper.appendChild(popup);

        setTimeout(() => document.addEventListener('click', handleClickOutside), 10);
    });

    wrapper.appendChild(btn);
    return wrapper;
}
