/**
 * Line Width Button Component
 * Dropdown popup with visual line width options (TradingView style: line preview + "Npx")
 */

import { Drawing } from '../../../drawings';
import { t } from '../../../helpers/translations';
import { ICONS } from './Icons';
import { ATTR_BAR_STYLE, barColors, buttonCss, bindButtonStates, refreshButtonState, popupCss, popupRowCss, bindRowHover } from './style';

const LINE_WIDTHS = [1, 2, 3, 4];

/**
 * Creates a line width button with dropdown popup
 */
export function createLineWidthButton(
    drawing: Drawing,
    onChange: (width: number) => void,
    theme: 'dark' | 'light' = 'dark'
): HTMLElement {
    const c = barColors(theme);
    const m = ATTR_BAR_STYLE.metrics;
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: relative; flex: none;';

    let currentWidth = drawing.style.lineWidth || 2;

    // Main button: thickness preview + "Npx"
    const btn = document.createElement('button');
    btn.title = t('Line width');
    btn.dataset.role = 'line-width';
    btn.style.cssText = buttonCss(theme) + `width: auto; min-width: ${m.buttonSize}px; padding: 0 8px; gap: 6px; font-family: ${m.fontFamily}; font-size: 12px;`;
    const preview = document.createElement('span');
    const label = document.createElement('span');
    const renderButton = () => {
        preview.style.cssText = `display: block; width: ${m.widthPreviewLength}px; height: ${Math.max(1, Math.min(currentWidth, 8))}px; background: currentColor; border-radius: 1px; flex: none;`;
        label.textContent = `${currentWidth}px`;
    };
    renderButton();
    btn.appendChild(preview);
    btn.appendChild(label);

    let popup: HTMLElement | null = null;
    bindButtonStates(btn, theme, { isOpen: () => !!popup });

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
        popup.dataset.role = 'line-width-list';
        popup.style.cssText = popupCss(theme) + 'min-width: 120px;';

        const base: number[] = (drawing as any).lineWidthOptions || LINE_WIDTHS;
        const widths = base.includes(currentWidth) ? base : [...base, currentWidth].sort((a, b) => a - b);
        widths.forEach(width => {
            const selected = width === currentWidth;
            const option = document.createElement('div');
            option.dataset.width = String(width);
            option.style.cssText = popupRowCss(theme, false);

            // Line preview
            const linePreview = document.createElement('div');
            linePreview.style.cssText = `
                width: 32px;
                height: ${Math.max(1, Math.min(width, 14))}px;
                background: ${c.popupText};
                border-radius: 1px;
                flex: none;
            `;

            const text = document.createElement('span');
            text.textContent = `${width}px`;
            text.style.cssText = 'flex: 1;';

            // Check icon for selected
            const check = document.createElement('span');
            check.innerHTML = selected ? ICONS.check : '';
            check.style.cssText = `display: flex; width: 14px; color: ${c.accent};`;

            option.appendChild(linePreview);
            option.appendChild(text);
            option.appendChild(check);
            bindRowHover(option, theme);

            option.addEventListener('click', () => {
                currentWidth = width;
                drawing.style.lineWidth = width;
                renderButton();
                onChange(width);
                closePopup();
            });

            popup!.appendChild(option);
        });

        wrapper.appendChild(popup);
        refreshButtonState(btn);
        setTimeout(() => { if (popup) document.addEventListener('click', handleClickOutside); }, 10);
    });

    wrapper.appendChild(btn);
    return wrapper;
}
