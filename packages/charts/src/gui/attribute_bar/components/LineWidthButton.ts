/**
 * Line Width Button Component
 * Dropdown popup with visual line width options
 */

import { Drawing } from '../../../drawings';
import { ICONS } from './Icons';

const LINE_WIDTHS = [1, 2, 3, 4, 5];

/**
 * Creates a line width button with dropdown popup
 */
export function createLineWidthButton(
    drawing: Drawing,
    onChange: (width: number) => void
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: relative;';

    // Main button
    const btn = document.createElement('button');
    btn.innerHTML = ICONS.lineStyle;
    btn.title = 'Line width';
    btn.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        background: transparent;
        border: none;
        color: #787b86;
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.1s ease;
    `;

    btn.addEventListener('mouseenter', () => {
        btn.style.background = '#2a2e39';
        btn.style.color = '#d1d4dc';
    });

    btn.addEventListener('mouseleave', () => {
        if (!popup) {
            btn.style.background = 'transparent';
            btn.style.color = '#787b86';
        }
    });

    let popup: HTMLElement | null = null;
    let currentWidth = drawing.style.lineWidth || 2;

    const closePopup = () => {
        if (popup) {
            popup.remove();
            popup = null;
            btn.style.background = 'transparent';
            btn.style.color = '#787b86';
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
            padding: 8px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 4px;
        `;

        LINE_WIDTHS.forEach(width => {
            const option = document.createElement('div');
            option.style.cssText = `
                display: flex;
                align-items: center;
                padding: 8px 12px;
                cursor: pointer;
                border-radius: 4px;
                transition: background 0.1s;
                gap: 12px;
            `;

            // Line preview
            const linePreview = document.createElement('div');
            linePreview.style.cssText = `
                width: 40px;
                height: ${width}px;
                background: #d1d4dc;
                border-radius: 1px;
            `;

            // Width label
            const label = document.createElement('span');
            label.textContent = `${width}px`;
            label.style.cssText = `
                font-size: 12px;
                color: #787b86;
            `;

            // Check icon for selected
            const check = document.createElement('span');
            check.innerHTML = width === currentWidth
                ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2962ff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
                : '';
            check.style.cssText = 'margin-left: auto;';

            option.appendChild(linePreview);
            option.appendChild(label);
            option.appendChild(check);

            option.addEventListener('mouseenter', () => {
                option.style.background = '#2a2e39';
            });
            option.addEventListener('mouseleave', () => {
                option.style.background = 'transparent';
            });

            option.addEventListener('click', () => {
                currentWidth = width;
                drawing.style.lineWidth = width;
                onChange(width);
                closePopup();
            });

            popup!.appendChild(option);
        });

        wrapper.appendChild(popup);
        setTimeout(() => document.addEventListener('click', handleClickOutside), 10);
    });

    wrapper.appendChild(btn);
    return wrapper;
}
