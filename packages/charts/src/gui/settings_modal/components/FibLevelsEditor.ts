/**
 * Fibonacci Levels Editor Component
 * Table-based editor for managing Fibonacci levels (visibility, color, label)
 */

import { createColorSelect } from './ColorSelect';
import { createCheckbox } from './Checkbox';
import { createTextInput } from './TextInput';

export interface FibLevel {
    level: number;
    label: string;
    color: string;
    visible: boolean;
}

const styles = {
    container: `
        background: #1e222d;
        border-radius: 6px;
        overflow: hidden;
    `,
    header: `
        display: grid;
        grid-template-columns: 40px 80px 1fr 50px;
        padding: 10px 12px;
        background: #2a2e39;
        font-size: 11px;
        font-weight: 600;
        color: #787b86;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    `,
    row: `
        display: grid;
        grid-template-columns: 40px 80px 1fr 50px;
        padding: 8px 12px;
        align-items: center;
        border-bottom: 1px solid #2B2B43;
    `,
    levelLabel: `
        font-size: 13px;
        color: #d1d4dc;
        font-weight: 500;
    `,
};

/**
 * Creates a Fibonacci levels editor table
 */
export function createFibLevelsEditor(
    levels: FibLevel[],
    onChange: (levels: FibLevel[]) => void
): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = styles.container;

    // Header
    const header = document.createElement('div');
    header.style.cssText = styles.header;
    header.innerHTML = `
        <span></span>
        <span>Level</span>
        <span>Color</span>
        <span>Visible</span>
    `;
    container.appendChild(header);

    // Level rows
    const levelsCopy = [...levels];

    levelsCopy.forEach((level, index) => {
        const row = document.createElement('div');
        row.style.cssText = styles.row;

        // Level percentage
        const levelLabel = document.createElement('span');
        levelLabel.textContent = `${(level.level * 100).toFixed(1)}%`;
        levelLabel.style.cssText = styles.levelLabel;

        // Label input
        const labelInput = createTextInput(
            level.label,
            { width: '60px', placeholder: 'Label' },
            (value) => {
                levelsCopy[index].label = value;
                onChange(levelsCopy);
            }
        );

        // Color picker
        const colorPicker = createColorSelect(level.color, (color) => {
            levelsCopy[index].color = color;
            onChange(levelsCopy);
        });

        // Visible checkbox
        const visibleCheckbox = createCheckbox(level.visible, '', (checked) => {
            levelsCopy[index].visible = checked;
            onChange(levelsCopy);
        });

        row.appendChild(levelLabel);
        row.appendChild(labelInput);
        row.appendChild(colorPicker);
        row.appendChild(visibleCheckbox);

        container.appendChild(row);
    });

    return container;
}

/**
 * Creates a compact Fibonacci levels list (for attribute bar)
 */
export function createFibLevelsCompact(
    levels: FibLevel[],
    onToggle: (index: number, visible: boolean) => void
): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px;';

    levels.forEach((level, index) => {
        const chip = document.createElement('button');
        chip.textContent = `${(level.level * 100).toFixed(1)}%`;
        chip.style.cssText = `
            padding: 4px 8px;
            font-size: 11px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.1s;
            border: 1px solid ${level.visible ? level.color : '#363a45'};
            background: ${level.visible ? level.color + '20' : 'transparent'};
            color: ${level.visible ? level.color : '#787b86'};
        `;

        chip.onclick = () => {
            const newVisible = !level.visible;
            level.visible = newVisible;
            chip.style.borderColor = newVisible ? level.color : '#363a45';
            chip.style.background = newVisible ? level.color + '20' : 'transparent';
            chip.style.color = newVisible ? level.color : '#787b86';
            onToggle(index, newVisible);
        };

        container.appendChild(chip);
    });

    return container;
}
