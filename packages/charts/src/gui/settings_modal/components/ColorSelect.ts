/**
 * Color Select Component
 * Color swatch with popup palette picker
 */

import { getPopoverHost, registerOpenPopover, unregisterOpenPopover, copyThemeVars } from './popover';

// Color palette constants
const GRAYSCALE = ['#ffffff', '#e0e0e0', '#bdbdbd', '#9e9e9e', '#757575', '#424242', '#212121', '#000000'];

const COLOR_PALETTE = [
    ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50'],
    ['#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#795548', '#607d8b', '#2962ff', '#00e676'],
    ['#ef5350', '#ec407a', '#ab47bc', '#7e57c2', '#5c6bc0', '#42a5f5', '#29b6f6', '#26c6da', '#26a69a', '#66bb6a'],
    ['#9ccc65', '#d4e157', '#ffee58', '#ffca28', '#ffa726', '#ff7043', '#8d6e63', '#78909c', '#1565c0', '#00c853'],
];

const styles = {
    swatch: `
        width: 36px;
        height: 24px;
        border-radius: 4px;
        cursor: pointer;
        border: 1px solid var(--border-color);
    `,
    popup: `
        position: fixed;
        top: 0;
        left: 0;
        visibility: hidden;
        background: var(--modal-bg);
        border-radius: 8px;
        padding: 12px;
        box-shadow: var(--shadow);
        z-index: 10001;
        min-width: 280px;
    `,
};

/**
 * Creates a color swatch with popup palette picker
 */
export function createColorSelect(
    initialColor: string,
    onChange: (color: string) => void
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: relative;';

    let currentColor = initialColor;
    let popup: HTMLElement | null = null;
    let observer: MutationObserver | null = null;

    // Main swatch
    const swatch = document.createElement('div');
    swatch.style.cssText = styles.swatch;
    swatch.style.background = currentColor;

    const hidePopup = () => {
        if (popup) {
            popup.remove();
            popup = null;
        }
        document.removeEventListener('mousedown', handleOutside, true);
        document.removeEventListener('keydown', handleKeydown, true);
        document.removeEventListener('fullscreenchange', hidePopup);
        unregisterOpenPopover(hidePopup);
        window.removeEventListener('resize', hidePopup);
        window.removeEventListener('scroll', handleScroll, true);
        observer?.disconnect();
        observer = null;
    };

    // Yakalama (capture) fazinda dinlenir: pencere tiklamalari stopPropagation ile yuttugu icin
    // kabarcik fazindaki 'click' icerideki tiklamalarda hic tetiklenmezdi.
    const handleOutside = (e: MouseEvent) => {
        const target = e.target as Node;
        if (!wrapper.contains(target) && !(popup && popup.contains(target))) {
            hidePopup();
        }
    };

    // Ilk Esc yalniz popup'i kapatir (pencere / grafik ayni Esc'i gormez)
    const handleKeydown = (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        e.preventDefault();
        hidePopup();
    };

    // Kaydirma popup icinde olursa kapatma (yalniz disaridaki kaydirmalar)
    const handleScroll = (e: Event) => {
        if (popup && e.target instanceof Node && popup.contains(e.target)) return;
        hidePopup();
    };

    // Popup, dialogun kirpan (overflow) kabinin disinda: body'ye (tam ekranda fullscreenElement'e) eklenir ve konumu viewport'a gore hesaplanir:
    // asagida yer yoksa yukari acilir, yatayda ekrana sigdirilir.
    const positionPopup = (el: HTMLElement) => {
        const r = swatch.getBoundingClientRect();
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const gap = 8;
        let top = r.bottom + gap;
        if (top + h > vh - gap) {
            const above = r.top - gap - h;
            top = above >= gap ? above : Math.max(gap, vh - gap - h);
        }
        const left = Math.max(gap, Math.min(r.right - w, vw - w - gap));
        el.style.top = `${top}px`;
        el.style.left = `${left}px`;
        el.style.visibility = 'visible';
    };

    // Click to show palette
    swatch.onclick = (e) => {
        e.stopPropagation();

        if (popup) {
            hidePopup();
            return;
        }

        popup = document.createElement('div');
        popup.style.cssText = styles.popup;

        // Grayscale row
        const grayRow = document.createElement('div');
        grayRow.style.cssText = 'display: flex; gap: 4px; margin-bottom: 8px;';
        GRAYSCALE.forEach(color => {
            const box = createColorBox(color, currentColor, (c) => {
                currentColor = c;
                swatch.style.background = c;
                onChange(c);
                hidePopup();
            });
            grayRow.appendChild(box);
        });
        popup.appendChild(grayRow);

        // Color palette
        COLOR_PALETTE.forEach(row => {
            const rowDiv = document.createElement('div');
            rowDiv.style.cssText = 'display: flex; gap: 4px; margin-bottom: 4px;';
            row.forEach(color => {
                const box = createColorBox(color, currentColor, (c) => {
                    currentColor = c;
                    swatch.style.background = c;
                    onChange(c);
                    hidePopup();
                });
                rowDiv.appendChild(box);
            });
            popup!.appendChild(rowDiv);
        });

        // Custom color button
        const customRow = document.createElement('div');
        customRow.style.cssText = 'margin-top: 12px; display: flex; gap: 8px; align-items: center;';

        const addBtn = document.createElement('button');
        addBtn.innerHTML = '+';
        addBtn.style.cssText = `
            width: 32px; height: 32px;
            border: 1px dashed var(--text-secondary);
            border-radius: 4px;
            background: transparent;
            color: var(--text-secondary);
            font-size: 18px;
            cursor: pointer;
        `;

        const customInput = document.createElement('input');
        customInput.type = 'color';
        customInput.value = currentColor;
        customInput.style.cssText = 'position: absolute; opacity: 0; width: 32px; height: 32px; cursor: pointer;';
        customInput.onchange = () => {
            currentColor = customInput.value;
            swatch.style.background = customInput.value;
            onChange(customInput.value);
            hidePopup();
        };

        addBtn.onclick = () => customInput.click();

        const addWrapper = document.createElement('div');
        addWrapper.style.cssText = 'position: relative;';
        addWrapper.appendChild(addBtn);
        addWrapper.appendChild(customInput);
        customRow.appendChild(addWrapper);
        popup.appendChild(customRow);

        // Tema degiskenleri (--modal-bg vb.) pencere elemanindan kopyalanir (popup body'de);
        // tanimsizsa :root / varsayilan kullanilir (popup seffaf kalmaz)
        copyThemeVars(popup, wrapper, ['--modal-bg', '--text-primary', '--text-secondary', '--border-color', '--hover-bg', '--shadow', '--input-bg']);
        // Baska bir popover (renk / cizgi) aciksa kapatilir
        registerOpenPopover(hidePopup);
        getPopoverHost().appendChild(popup);
        positionPopup(popup);
        window.addEventListener('resize', hidePopup);
        window.addEventListener('scroll', handleScroll, true);
        // Pencere (swatch) DOM'dan kalkarsa popup da kapanir
        observer = new MutationObserver(() => { if (!wrapper.isConnected) hidePopup(); });
        observer.observe(document.body, { childList: true, subtree: true });
        // Popup'i acan tiklama zaten tamamlandi (mousedown onceden oldu); dinleyici hemen eklenir
        document.addEventListener('mousedown', handleOutside, true);
        document.addEventListener('keydown', handleKeydown, true);
        // Tam ekrana girip cikinca popup yanlis kapta kalir: kapat
        document.addEventListener('fullscreenchange', hidePopup);
    };

    wrapper.appendChild(swatch);
    return wrapper;
}

/** Helper to create individual color box */
function createColorBox(
    color: string,
    currentColor: string,
    onClick: (color: string) => void
): HTMLElement {
    const box = document.createElement('div');
    const isSelected = color === currentColor;
    box.style.cssText = `
        width: 26px; height: 26px;
        background: ${color};
        border-radius: 4px;
        cursor: pointer;
        border: ${isSelected ? '2px solid #2962ff' : '1px solid var(--border-color)'};
        transition: transform 0.1s;
    `;
    box.onmouseenter = () => box.style.transform = 'scale(1.1)';
    box.onmouseleave = () => box.style.transform = 'scale(1)';
    box.onclick = () => onClick(color);
    return box;
}
