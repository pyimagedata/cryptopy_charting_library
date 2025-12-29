/**
 * Color Select Component
 * Color swatch with popup palette picker
 */

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
        border: 1px solid #363a45;
    `,
    popup: `
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 8px;
        background: #1e222d;
        border-radius: 8px;
        padding: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        z-index: 10000;
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

    // Main swatch
    const swatch = document.createElement('div');
    swatch.style.cssText = styles.swatch;
    swatch.style.background = currentColor;

    const hidePopup = () => {
        if (popup) {
            popup.remove();
            popup = null;
        }
        document.removeEventListener('click', handleClickOutside);
    };

    const handleClickOutside = (e: MouseEvent) => {
        if (!wrapper.contains(e.target as Node)) {
            hidePopup();
        }
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
            border: 1px dashed #4a4e59;
            border-radius: 4px;
            background: transparent;
            color: #787b86;
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

        wrapper.appendChild(popup);
        setTimeout(() => document.addEventListener('click', handleClickOutside), 10);
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
    box.style.cssText = `
        width: 26px; height: 26px;
        background: ${color};
        border-radius: 4px;
        cursor: pointer;
        border: ${color === currentColor ? '2px solid #2962ff' : '1px solid #363a45'};
        transition: transform 0.1s;
    `;
    box.onmouseenter = () => box.style.transform = 'scale(1.1)';
    box.onmouseleave = () => box.style.transform = 'scale(1)';
    box.onclick = () => onClick(color);
    return box;
}
