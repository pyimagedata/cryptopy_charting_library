/**
 * Settings Components - Re-exports and Layout Helpers
 * 
 * Individual UI components are now in the components/ folder.
 * This file re-exports them for backward compatibility and provides layout helpers.
 */

// Re-export all individual components
export { createColorSelect as createColorSwatch } from '../components/ColorSelect';
export { createLineWidthSelect as createLineWidthSelector } from '../components/LineWidthSelect';
export {
    createLineStyleSelect as createLineStyleButtons,
    dashToLineStyle,
    lineStyleToDash,
    LineStyleValue
} from '../components/LineStyleSelect';
export { createSliderInput as createSlider } from '../components/SliderInput';
export { createNumberInput } from '../components/NumberInput';
export { createCheckbox } from '../components/Checkbox';
export { createSelect, SelectOption } from '../components/Select';

// ========================================
// Layout Helpers (Section & Row)
// ========================================

const styles = {
    section: `
        margin-bottom: 16px;
    `,
    sectionTitle: `
        font-size: 12px;
        font-weight: 600;
        color: var(--text-secondary);
        text-transform: uppercase;
        margin-bottom: 12px;
        letter-spacing: 0.5px;
    `,
    row: `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 0;
        border-bottom: 1px solid var(--border-color);
    `,
    label: `
        font-size: 13px;
        color: var(--text-primary);
    `,
};

/**
 * Creates a section with title and content
 */
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

    // Remove border from the last row for a cleaner look
    if (content.lastElementChild) {
        (content.lastElementChild as HTMLElement).style.borderBottom = 'none';
    }

    section.appendChild(content);

    return section;
}

/**
 * Creates a settings row with label and control
 */
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
