/**
 * Indicator Color Input
 * Palette-based color swatch similar to drawing settings.
 */

const GRAYSCALE = ['#ffffff', '#e0e0e0', '#bdbdbd', '#9e9e9e', '#757575', '#424242', '#212121', '#000000'];

const COLOR_PALETTE = [
    ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50'],
    ['#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#795548', '#607d8b', '#2962ff', '#00e676'],
    ['#ef5350', '#ec407a', '#ab47bc', '#7e57c2', '#5c6bc0', '#42a5f5', '#29b6f6', '#26c6da', '#26a69a', '#66bb6a'],
    ['#9ccc65', '#d4e157', '#ffee58', '#ffca28', '#ffa726', '#ff7043', '#8d6e63', '#78909c', '#1565c0', '#00c853'],
];

export function createColorInput(
    value: string,
    onChange: (value: string) => void
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: relative;';

    let currentColor = value || '#2962ff';
    let popup: HTMLElement | null = null;

    const swatch = document.createElement('div');
    swatch.style.cssText = `
        width: 36px;
        height: 24px;
        border-radius: 4px;
        cursor: pointer;
        border: 1px solid #d1d4dc;
        background: ${currentColor};
    `;

    const hidePopup = () => {
        if (popup) {
            popup.remove();
            popup = null;
        }
        document.removeEventListener('click', handleOutsideClick);
    };

    const handleOutsideClick = (e: MouseEvent) => {
        if (!wrapper.contains(e.target as Node)) {
            hidePopup();
        }
    };

    swatch.onclick = (e) => {
        e.stopPropagation();

        if (popup) {
            hidePopup();
            return;
        }

        popup = document.createElement('div');
        popup.style.cssText = `
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 8px;
            background: white;
            border: 1px solid #e0e3eb;
            border-radius: 8px;
            padding: 12px;
            box-shadow: 0 8px 24px rgba(19, 23, 34, 0.16);
            z-index: 10001;
            min-width: 280px;
        `;

        const grayRow = document.createElement('div');
        grayRow.style.cssText = 'display: flex; gap: 4px; margin-bottom: 8px;';
        GRAYSCALE.forEach((color) => grayRow.appendChild(createColorBox(color, currentColor, applyColor)));
        popup.appendChild(grayRow);

        COLOR_PALETTE.forEach((row) => {
            const rowDiv = document.createElement('div');
            rowDiv.style.cssText = 'display: flex; gap: 4px; margin-bottom: 4px;';
            row.forEach((color) => rowDiv.appendChild(createColorBox(color, currentColor, applyColor)));
            popup!.appendChild(rowDiv);
        });

        const customRow = document.createElement('div');
        customRow.style.cssText = 'margin-top: 12px; display: flex; justify-content: flex-end;';

        const customInput = document.createElement('input');
        customInput.type = 'color';
        customInput.value = currentColor.substring(0, 7);
        customInput.style.cssText = `
            width: 32px;
            height: 32px;
            border: 1px solid #d1d4dc;
            border-radius: 6px;
            padding: 0;
            cursor: pointer;
            background: white;
        `;
        customInput.oninput = () => applyColor(customInput.value);

        customRow.appendChild(customInput);
        popup.appendChild(customRow);

        wrapper.appendChild(popup);
        setTimeout(() => document.addEventListener('click', handleOutsideClick), 10);
    };

    wrapper.appendChild(swatch);
    return wrapper;

    function applyColor(nextColor: string): void {
        currentColor = nextColor;
        swatch.style.background = nextColor;
        onChange(nextColor);
        hidePopup();
    }
}

function createColorBox(
    color: string,
    currentColor: string,
    onClick: (color: string) => void
): HTMLElement {
    const box = document.createElement('div');
    const isSelected = color.toLowerCase() === currentColor.toLowerCase();
    box.style.cssText = `
        width: 26px;
        height: 26px;
        background: ${color};
        border-radius: 4px;
        cursor: pointer;
        border: ${isSelected ? '2px solid #2962ff' : '1px solid #d1d4dc'};
        transition: transform 0.1s ease;
        box-sizing: border-box;
    `;
    box.onmouseenter = () => box.style.transform = 'scale(1.08)';
    box.onmouseleave = () => box.style.transform = 'scale(1)';
    box.onclick = () => onClick(color);
    return box;
}
