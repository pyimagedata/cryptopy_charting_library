import { createColorSelect } from './ColorSelect';
import { createCheckbox } from './Checkbox';

export interface FibLevel {
    level: number;
    label: string;
    color: string;
    visible: boolean;
}

const styles = {
    container: `
        display: flex;
        flex-direction: column;
        gap: 12px;
    `,
    toolbar: `
        display: flex;
        justify-content: flex-end;
    `,
    addButton: `
        height: 32px;
        padding: 0 11px;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        background: var(--input-bg);
        color: var(--text-primary);
        font-size: 12px;
        cursor: pointer;
    `,
    grid: `
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px 14px;
    `,
    row: `
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    `,
    input: `
        flex: 1 1 0;
        min-width: 72px;
        height: 36px;
        padding: 0 10px;
        border: 1px solid var(--border-color);
        border-radius: 10px;
        background: var(--input-bg);
        color: var(--text-primary);
        font-size: 13px;
        outline: none;
        box-sizing: border-box;
    `,
    removeButton: `
        width: 24px;
        height: 24px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--text-secondary);
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
        flex-shrink: 0;
    `,
};

export function createFibLevelsEditor(
    levels: FibLevel[],
    onChange: (levels: FibLevel[]) => void
): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = styles.container;

    const state = levels.map((level) => ({ ...level }));

    const render = () => {
        container.innerHTML = '';

        const toolbar = document.createElement('div');
        toolbar.style.cssText = styles.toolbar;

        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.textContent = '+ Level';
        addButton.style.cssText = styles.addButton;
        addButton.onclick = () => {
            state.push({
                level: 0,
                label: '0',
                color: '#787b86',
                visible: true,
            });
            onChange([...state]);
            render();
        };
        toolbar.appendChild(addButton);
        container.appendChild(toolbar);

        const grid = document.createElement('div');
        grid.style.cssText = styles.grid;

        state.forEach((level, index) => {
            grid.appendChild(createLevelRow(level, index, state, () => {
                onChange([...state]);
                render();
            }));
        });

        container.appendChild(grid);
    };

    render();
    return container;
}

function createLevelRow(
    level: FibLevel,
    index: number,
    levels: FibLevel[],
    notify: () => void
): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = styles.row;

    const checkbox = createCheckbox(level.visible, '', (checked) => {
        levels[index].visible = checked;
        notify();
    });
    row.appendChild(checkbox);

    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.value = normalizeDisplayValue(level.level);
    input.style.cssText = styles.input;
    input.onfocus = () => {
        input.style.borderColor = '#2962ff';
    };
    input.onblur = () => {
        input.style.borderColor = 'var(--border-color)';
        const parsed = parseFloat(input.value.replace(',', '.'));
        if (!Number.isNaN(parsed)) {
            levels[index].level = parsed;
            levels[index].label = normalizeDisplayValue(parsed);
            input.value = normalizeDisplayValue(parsed);
            notify();
        } else {
            input.value = normalizeDisplayValue(levels[index].level);
        }
    };
    row.appendChild(input);

    const color = createColorSelect(level.color, (nextColor) => {
        levels[index].color = nextColor;
        notify();
    });
    row.appendChild(color);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = 'Remove level';
    remove.style.cssText = styles.removeButton;
    remove.onclick = () => {
        levels.splice(index, 1);
        notify();
    };
    row.appendChild(remove);

    return row;
}

function normalizeDisplayValue(value: number): string {
    const rounded = Number(value.toFixed(3));
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function createFibLevelsCompact(
    levels: FibLevel[],
    onToggle: (index: number, visible: boolean) => void
): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px;';

    levels.forEach((level, index) => {
        const chip = document.createElement('button');
        chip.textContent = normalizeDisplayValue(level.level);
        chip.style.cssText = `
            padding: 4px 8px;
            font-size: 11px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.1s;
            border: 1px solid ${level.visible ? level.color : 'var(--border-color)'};
            background: ${level.visible ? level.color + '20' : 'transparent'};
            color: ${level.visible ? level.color : 'var(--text-secondary)'};
        `;

        chip.onclick = () => {
            const newVisible = !level.visible;
            level.visible = newVisible;
            chip.style.borderColor = newVisible ? level.color : 'var(--border-color)';
            chip.style.background = newVisible ? level.color + '20' : 'transparent';
            chip.style.color = newVisible ? level.color : 'var(--text-secondary)';
            onToggle(index, newVisible);
        };

        container.appendChild(chip);
    });

    return container;
}
