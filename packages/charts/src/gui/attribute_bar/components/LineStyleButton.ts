/**
 * Line Style Button Component
 * Icon button (solid / dashed / dotted) with a dropdown list of the three styles
 */

import { Drawing } from '../../../drawings';
import { lineStyleFromDash, dashFromLineStyle } from '../../../drawings/line-tool-common';
import { t } from '../../../helpers/translations';
import { ICONS } from './Icons';
import { barColors, buttonCss, bindButtonStates, refreshButtonState, popupCss, popupRowCss, bindRowHover } from './style';

type LineStyleValue = 'solid' | 'dashed' | 'dotted';

const LINE_STYLES: { value: LineStyleValue; label: string; icon: string }[] = [
    { value: 'solid', label: 'Solid', icon: ICONS.lineSolid },
    { value: 'dashed', label: 'Dashed', icon: ICONS.lineDashed },
    { value: 'dotted', label: 'Dotted', icon: ICONS.lineDotted },
];

function iconFor(style: string): string {
    return (LINE_STYLES.find(s => s.value === style) || LINE_STYLES[0]).icon;
}

/**
 * Creates a line style button with dropdown popup
 */
export function createLineStyleButton(
    drawing: Drawing,
    onChange: (style: LineStyleValue) => void,
    theme: 'dark' | 'light' = 'dark'
): HTMLElement {
    const c = barColors(theme);
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: relative; flex: none;';

    const btn = document.createElement('button');
    btn.title = t('Line style');
    btn.dataset.role = 'line-style';
    btn.style.cssText = buttonCss(theme);
    btn.innerHTML = iconFor(lineStyleFromDash(drawing.style.lineDash));

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

        const current = lineStyleFromDash(drawing.style.lineDash);
        popup = document.createElement('div');
        popup.dataset.role = 'line-style-list';
        popup.style.cssText = popupCss(theme) + 'min-width: 140px;';

        LINE_STYLES.forEach(({ value, label, icon }) => {
            const option = document.createElement('div');
            option.dataset.style = value;
            option.style.cssText = popupRowCss(theme, false);

            const preview = document.createElement('span');
            preview.style.cssText = 'display: flex; width: 28px; height: 28px; margin: 0 -2px; flex: none;';
            preview.innerHTML = icon;

            const text = document.createElement('span');
            text.textContent = t(label);
            text.style.cssText = 'flex: 1;';

            const check = document.createElement('span');
            check.innerHTML = value === current ? ICONS.check : '';
            check.style.cssText = `display: flex; width: 14px; color: ${c.accent};`;

            option.appendChild(preview);
            option.appendChild(text);
            option.appendChild(check);
            bindRowHover(option, theme);
            option.addEventListener('click', () => {
                const dash = dashFromLineStyle(value);
                if (dash) drawing.style.lineDash = dash;
                btn.innerHTML = iconFor(value);
                onChange(value);
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
