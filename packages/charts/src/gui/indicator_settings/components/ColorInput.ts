/**
 * Indicator Color Input
 * Swatch button opening the shared colour popover: palette, custom colour, opacity.
 * The popover lives in the shared popover host (fullscreen safe) and copies the
 * dialog theme variables, like the drawing settings colour select.
 */

import { t } from '../../../helpers/translations';
import { getPopoverHost, registerOpenPopover, unregisterOpenPopover, copyThemeVars } from '../../settings_modal/components/popover';

const GRAYSCALE = ['#ffffff', '#e0e0e0', '#bdbdbd', '#9e9e9e', '#757575', '#424242', '#212121', '#000000'];

const COLOR_PALETTE = [
    ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50'],
    ['#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#795548', '#607d8b', '#2962ff', '#00e676'],
    ['#ef5350', '#ec407a', '#ab47bc', '#7e57c2', '#5c6bc0', '#42a5f5', '#29b6f6', '#26c6da', '#26a69a', '#66bb6a'],
    ['#9ccc65', '#d4e157', '#ffee58', '#ffca28', '#ffa726', '#ff7043', '#8d6e63', '#78909c', '#1565c0', '#00c853'],
];

export interface RGBA { r: number; g: number; b: number; a: number }

/** Parses #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(); null when not a colour */
export function parseColor(input: string): RGBA | null {
    const s = (input || '').trim();
    let m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) {
        const h = m[1];
        return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16), a: 1 };
    }
    m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
    if (m) {
        const h = m[1];
        return {
            r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
            a: m[2] ? Math.round((parseInt(m[2], 16) / 255) * 100) / 100 : 1,
        };
    }
    m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
    return null;
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Opaque colours serialise as #rrggbb, translucent ones as rgba() */
export function formatColor(c: RGBA): string {
    if (c.a >= 1) return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
    return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${Math.round(c.a * 100) / 100})`;
}

export function createColorInput(
    value: string,
    onChange: (value: string) => void
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: relative; display: flex;';

    let current: RGBA = parseColor(value) || { r: 41, g: 98, b: 255, a: 1 };
    let popup: HTMLElement | null = null;
    let observer: MutationObserver | null = null;

    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'tvs-swatch';
    swatch.title = t('Color');
    const fill = document.createElement('span');
    swatch.appendChild(fill);
    const paintSwatch = () => { fill.style.background = formatColor(current); };
    paintSwatch();

    const emit = () => {
        paintSwatch();
        onChange(formatColor(current));
    };

    const hidePopup = () => {
        if (popup) { popup.remove(); popup = null; }
        document.removeEventListener('mousedown', handleOutside, true);
        document.removeEventListener('keydown', handleKeydown, true);
        document.removeEventListener('fullscreenchange', hidePopup);
        window.removeEventListener('resize', hidePopup);
        window.removeEventListener('scroll', handleScroll, true);
        unregisterOpenPopover(hidePopup);
        observer?.disconnect();
        observer = null;
    };
    const handleOutside = (e: MouseEvent) => {
        const target = e.target as Node;
        if (!wrapper.contains(target) && !(popup && popup.contains(target))) hidePopup();
    };
    // First Esc closes only the popup (the dialog does not see it)
    const handleKeydown = (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        e.preventDefault();
        hidePopup();
    };
    const handleScroll = (e: Event) => {
        if (popup && e.target instanceof Node && popup.contains(e.target)) return;
        hidePopup();
    };

    const position = (el: HTMLElement) => {
        const r = swatch.getBoundingClientRect();
        const w = el.offsetWidth, h = el.offsetHeight, gap = 8;
        let top = r.bottom + gap;
        if (top + h > window.innerHeight - gap) {
            const above = r.top - gap - h;
            top = above >= gap ? above : Math.max(gap, window.innerHeight - gap - h);
        }
        const left = Math.max(gap, Math.min(r.right - w, window.innerWidth - w - gap));
        el.style.top = `${top}px`;
        el.style.left = `${left}px`;
        el.style.visibility = 'visible';
    };

    swatch.onclick = (e) => {
        e.stopPropagation();
        if (popup) { hidePopup(); return; }

        popup = document.createElement('div');
        popup.className = 'tvs-color-popup';
        popup.style.cssText = `position: fixed; top: 0; left: 0; visibility: hidden; background: var(--modal-bg); color: var(--text-primary);
            border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; box-shadow: var(--shadow); z-index: 10001; width: 284px;
            box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif; font-size: 13px;`;

        let boxes: HTMLElement[] = [];
        const refreshBoxes = () => {
            boxes.forEach((b) => {
                const sel = b.dataset.color === formatColor({ ...current, a: 1 }).toLowerCase();
                b.style.border = sel ? '2px solid #2962ff' : '1px solid var(--border-color)';
            });
        };
        const pick = (hex: string) => {
            const c = parseColor(hex);
            if (!c) return;
            current = { ...c, a: current.a };
            emit();
            refreshBoxes();
            syncCustom();
        };
        const makeRow = (colors: string[], mb: number) => {
            const row = document.createElement('div');
            row.style.cssText = `display: flex; gap: 4px; margin-bottom: ${mb}px;`;
            colors.forEach((color) => {
                const box = document.createElement('div');
                box.dataset.color = formatColor({ ...(parseColor(color) as RGBA), a: 1 }).toLowerCase();
                box.style.cssText = `width: 22px; height: 22px; background: ${color}; border-radius: 4px; cursor: pointer; box-sizing: border-box;`;
                box.onclick = () => pick(color);
                boxes.push(box);
                row.appendChild(box);
            });
            return row;
        };
        popup.appendChild(makeRow(GRAYSCALE, 8));
        COLOR_PALETTE.forEach((r) => popup!.appendChild(makeRow(r, 4)));
        refreshBoxes();

        // custom colour
        const customRow = document.createElement('div');
        customRow.style.cssText = 'margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-color); display: flex; align-items: center; gap: 8px;';
        const customWrap = document.createElement('div');
        customWrap.style.cssText = 'position: relative; width: 28px; height: 28px;';
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.textContent = '+';
        addBtn.title = t('Custom color');
        addBtn.style.cssText = `width: 28px; height: 28px; border: 1px dashed var(--text-secondary); border-radius: 4px; background: transparent;
            color: var(--text-secondary); font-size: 18px; line-height: 1; cursor: pointer; padding: 0;`;
        const customInput = document.createElement('input');
        customInput.type = 'color';
        customInput.style.cssText = 'position: absolute; left: 0; top: 0; width: 28px; height: 28px; opacity: 0; cursor: pointer;';
        const syncCustom = () => { customInput.value = formatColor({ ...current, a: 1 }); };
        syncCustom();
        customInput.oninput = () => pick(customInput.value);
        customWrap.appendChild(addBtn);
        customWrap.appendChild(customInput);
        customRow.appendChild(customWrap);
        const customLabel = document.createElement('span');
        customLabel.textContent = t('Custom color');
        customLabel.style.cssText = 'color: var(--text-secondary);';
        customRow.appendChild(customLabel);
        popup.appendChild(customRow);

        // opacity
        const opRow = document.createElement('div');
        opRow.style.cssText = 'margin-top: 10px; display: flex; align-items: center; gap: 10px;';
        const opLabel = document.createElement('span');
        opLabel.textContent = t('Opacity');
        opLabel.style.cssText = 'color: var(--text-secondary); min-width: 52px;';
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0'; slider.max = '100'; slider.step = '1';
        slider.value = String(Math.round(current.a * 100));
        slider.style.cssText = 'flex: 1; accent-color: #2962ff; min-width: 0;';
        const opVal = document.createElement('span');
        opVal.style.cssText = 'min-width: 40px; text-align: right;';
        opVal.textContent = `${slider.value}%`;
        slider.oninput = () => {
            current = { ...current, a: Number(slider.value) / 100 };
            opVal.textContent = `${slider.value}%`;
            emit();
        };
        opRow.appendChild(opLabel);
        opRow.appendChild(slider);
        opRow.appendChild(opVal);
        popup.appendChild(opRow);

        copyThemeVars(popup, wrapper, ['--modal-bg', '--text-primary', '--text-secondary', '--border-color', '--hover-bg', '--shadow', '--input-bg']);
        registerOpenPopover(hidePopup);
        getPopoverHost().appendChild(popup);
        position(popup);
        window.addEventListener('resize', hidePopup);
        window.addEventListener('scroll', handleScroll, true);
        observer = new MutationObserver(() => { if (!wrapper.isConnected) hidePopup(); });
        observer.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('mousedown', handleOutside, true);
        document.addEventListener('keydown', handleKeydown, true);
        document.addEventListener('fullscreenchange', hidePopup);
    };

    wrapper.appendChild(swatch);
    return wrapper;
}
