/**
 * Font Size Button Component
 * TradingView-style dropdown button showing the current size
 */

import { Drawing } from '../../../drawings';
import { ICONS } from './Icons';
import { ATTR_BAR_STYLE, buttonCss, bindButtonStates, refreshButtonState, popupCss, popupRowCss, bindRowHover } from './style';

export const FONT_SIZE_OPTIONS = [8, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40];

/**
 * Creates a font size dropdown button (shows the current number, opens a list below)
 */
export function createFontSizeButton(
    drawing: Drawing,
    title: string,
    onChange: (size: number) => void,
    theme: 'dark' | 'light' = 'dark'
): HTMLElement {
    const m = ATTR_BAR_STYLE.metrics;
    const d: any = drawing;
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: relative; flex: none;';

    let current = Number(d.getSettingValue?.('fontSize')) || 14;

    const btn = document.createElement('button');
    btn.title = title;
    btn.dataset.role = 'font-size';
    btn.style.cssText = buttonCss(theme) + `width: auto; min-width: ${m.buttonSize}px; padding: 0 6px 0 8px; gap: 4px; font-family: ${m.fontFamily}; font-size: 14px;`;
    const label = document.createElement('span');
    label.textContent = String(current);
    const chevron = document.createElement('span');
    chevron.style.cssText = 'display: flex; opacity: 0.8;';
    chevron.innerHTML = ICONS.chevronDown;
    btn.appendChild(label);
    btn.appendChild(chevron);

    let popup: HTMLElement | null = null;
    bindButtonStates(btn, theme, { isOpen: () => !!popup });

    const closePopup = () => {
        if (popup) {
            popup.remove();
            popup = null;
        }
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleKey);
        refreshButtonState(btn);
    };
    const handleClickOutside = (e: MouseEvent) => {
        if (!wrapper.contains(e.target as Node)) closePopup();
    };
    const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closePopup();
    };

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (popup) { closePopup(); return; }

        popup = document.createElement('div');
        popup.dataset.role = 'font-size-list';
        popup.style.cssText = popupCss(theme) + 'min-width: 72px; max-height: 260px; overflow-y: auto;';
        const sizes = FONT_SIZE_OPTIONS.includes(current) ? FONT_SIZE_OPTIONS : [...FONT_SIZE_OPTIONS, current].sort((a, b) => a - b);
        for (const size of sizes) {
            const option = document.createElement('div');
            option.dataset.size = String(size);
            option.textContent = String(size);
            const selected = size === current;
            option.style.cssText = popupRowCss(theme, selected) + 'justify-content: center;';
            bindRowHover(option, theme);
            option.addEventListener('click', (ev) => {
                ev.stopPropagation();
                current = size;
                label.textContent = String(size);
                d.setSettingValue?.('fontSize', String(size));
                onChange(size);
                closePopup();
            });
            popup.appendChild(option);
        }
        wrapper.appendChild(popup);
        refreshButtonState(btn);
        const sel = popup.querySelector<HTMLElement>(`[data-size="${current}"]`);
        sel?.scrollIntoView?.({ block: 'center' });
        setTimeout(() => {
            if (popup) {
                document.addEventListener('click', handleClickOutside);
                document.addEventListener('keydown', handleKey);
            }
        }, 10);
    });

    wrapper.appendChild(btn);
    return wrapper;
}
