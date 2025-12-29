/**
 * Settings Modal - Reusable UI Components
 * Factory functions for creating common setting controls
 */

// ========================================
// Color Palette Constants
// ========================================

const GRAYSCALE = ['#ffffff', '#e0e0e0', '#bdbdbd', '#9e9e9e', '#757575', '#424242', '#212121', '#000000'];

const COLOR_PALETTE = [
    ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50'],
    ['#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#795548', '#607d8b', '#2962ff', '#00e676'],
    ['#ef5350', '#ec407a', '#ab47bc', '#7e57c2', '#5c6bc0', '#42a5f5', '#29b6f6', '#26c6da', '#26a69a', '#66bb6a'],
    ['#9ccc65', '#d4e157', '#ffee58', '#ffca28', '#ffa726', '#ff7043', '#8d6e63', '#78909c', '#1565c0', '#00c853'],
];

const LINE_WIDTHS = [1, 2, 3, 4, 5];

// ========================================
// Base Styles
// ========================================

const styles = {
    swatch: `
        width: 36px;
        height: 24px;
        border-radius: 4px;
        cursor: pointer;
        border: 1px solid #363a45;
    `,
    input: `
        width: 60px;
        padding: 6px 8px;
        background: #1e222d;
        border: 1px solid #363a45;
        border-radius: 4px;
        color: #d1d4dc;
        font-size: 13px;
    `,
    slider: `
        width: 100%;
        height: 4px;
        background: #2B2B43;
        border-radius: 2px;
        outline: none;
        -webkit-appearance: none;
    `,
    checkbox: `
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: #2962ff;
    `,
    button: `
        padding: 6px 12px;
        background: #2a2e39;
        border: none;
        border-radius: 4px;
        color: #787b86;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.1s;
    `,
    buttonActive: `
        background: #2962ff;
        color: #ffffff;
    `,
    row: `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 0;
        border-bottom: 1px solid #2B2B43;
    `,
    label: `
        font-size: 13px;
        color: #d1d4dc;
    `,
    section: `
        margin-bottom: 16px;
    `,
    sectionTitle: `
        font-size: 12px;
        font-weight: 600;
        color: #787b86;
        text-transform: uppercase;
        margin-bottom: 12px;
        letter-spacing: 0.5px;
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

// ========================================
// Color Swatch with Popup Picker
// ========================================

export function createColorSwatch(
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

// ========================================
// Number Input
// ========================================

export function createNumberInput(
    value: number,
    min: number,
    max: number,
    step: number = 1,
    onChange: (value: number) => void
): HTMLElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = value.toString();
    input.min = min.toString();
    input.max = max.toString();
    input.step = step.toString();
    input.style.cssText = styles.input;

    input.onchange = () => {
        let val = parseFloat(input.value);
        if (isNaN(val)) val = min;
        val = Math.max(min, Math.min(max, val));
        input.value = val.toString();
        onChange(val);
    };

    return input;
}

// ========================================
// Slider
// ========================================

export function createSlider(
    value: number,
    min: number,
    max: number,
    step: number = 1,
    suffix: string = '',
    onChange: (value: number) => void
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; align-items: center; gap: 12px; flex: 1;';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.value = value.toString();
    slider.min = min.toString();
    slider.max = max.toString();
    slider.step = step.toString();
    slider.style.cssText = styles.slider + 'flex: 1;';

    const valueLabel = document.createElement('span');
    valueLabel.textContent = `${value}${suffix}`;
    valueLabel.style.cssText = 'font-size: 12px; color: #787b86; min-width: 40px; text-align: right;';

    slider.oninput = () => {
        const val = parseFloat(slider.value);
        valueLabel.textContent = `${val}${suffix}`;
        onChange(val);
    };

    wrapper.appendChild(slider);
    wrapper.appendChild(valueLabel);
    return wrapper;
}

// ========================================
// Checkbox
// ========================================

export function createCheckbox(
    checked: boolean,
    label: string,
    onChange: (checked: boolean) => void
): HTMLElement {
    const wrapper = document.createElement('label');
    wrapper.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkbox.style.cssText = styles.checkbox;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    labelSpan.style.cssText = 'font-size: 13px; color: #d1d4dc;';

    checkbox.onchange = () => onChange(checkbox.checked);

    wrapper.appendChild(checkbox);
    wrapper.appendChild(labelSpan);
    return wrapper;
}

// ========================================
// Line Style Buttons (Solid/Dashed/Dotted)
// ========================================

export type LineStyleValue = 'solid' | 'dashed' | 'dotted';

export function createLineStyleButtons(
    currentStyle: LineStyleValue,
    onChange: (style: LineStyleValue) => void
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; gap: 4px;';

    const styleOptions: { value: LineStyleValue; label: string }[] = [
        { value: 'solid', label: '━━━' },
        { value: 'dashed', label: '┅┅┅' },
        { value: 'dotted', label: '┈┈┈' },
    ];

    styleOptions.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt.label;
        btn.style.cssText = styles.button;
        if (opt.value === currentStyle) {
            btn.style.cssText += styles.buttonActive;
        }

        btn.onclick = () => {
            wrapper.querySelectorAll('button').forEach(b => {
                (b as HTMLButtonElement).style.cssText = styles.button;
            });
            btn.style.cssText = styles.button + styles.buttonActive;
            onChange(opt.value);
        };

        wrapper.appendChild(btn);
    });

    return wrapper;
}

// ========================================
// Line Width Selector
// ========================================

export function createLineWidthSelector(
    currentWidth: number,
    onChange: (width: number) => void
): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; gap: 6px; align-items: center;';

    LINE_WIDTHS.forEach(width => {
        const btn = document.createElement('button');
        btn.style.cssText = `
            width: 28px; height: 28px;
            display: flex; align-items: center; justify-content: center;
            background: ${width === currentWidth ? '#2962ff' : '#2a2e39'};
            border: none;
            border-radius: 4px;
            cursor: pointer;
        `;

        // Draw line representation
        const line = document.createElement('div');
        line.style.cssText = `
            width: 16px;
            height: ${width}px;
            background: ${width === currentWidth ? '#ffffff' : '#d1d4dc'};
            border-radius: 1px;
        `;
        btn.appendChild(line);

        btn.onclick = () => {
            wrapper.querySelectorAll('button').forEach(b => {
                (b as HTMLButtonElement).style.background = '#2a2e39';
                const l = b.querySelector('div');
                if (l) l.style.background = '#d1d4dc';
            });
            btn.style.background = '#2962ff';
            line.style.background = '#ffffff';
            onChange(width);
        };

        wrapper.appendChild(btn);
    });

    return wrapper;
}

// ========================================
// Select Dropdown
// ========================================

export function createSelect(
    options: Array<{ value: string; label: string }>,
    currentValue: string,
    onChange: (value: string) => void
): HTMLElement {
    const select = document.createElement('select');
    select.style.cssText = `
        padding: 6px 10px;
        background: #1e222d;
        border: 1px solid #363a45;
        border-radius: 4px;
        color: #d1d4dc;
        font-size: 13px;
        cursor: pointer;
        min-width: 100px;
    `;

    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === currentValue) option.selected = true;
        select.appendChild(option);
    });

    select.onchange = () => onChange(select.value);
    return select;
}

// ========================================
// Section with Title
// ========================================

export function createSection(
    title: string,
    contentFn: (container: HTMLElement) => void
): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = styles.section;

    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    titleEl.style.cssText = styles.sectionTitle;
    section.appendChild(titleEl);

    const content = document.createElement('div');
    contentFn(content);
    section.appendChild(content);

    return section;
}

// ========================================
// Settings Row (Label + Control)
// ========================================

export function createSettingsRow(
    label: string,
    control: HTMLElement
): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = styles.row;

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = styles.label;

    row.appendChild(labelEl);
    row.appendChild(control);
    return row;
}
