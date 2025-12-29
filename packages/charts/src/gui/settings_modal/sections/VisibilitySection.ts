/**
 * Visibility Section Component
 * Reusable section for visibility settings (visible, locked)
 */

import { Drawing } from '../../../drawings';
import {
    createCheckbox,
    createSection,
    createSettingsRow,
} from '../base/SettingsComponents';

/**
 * Creates a visibility settings section with visible and locked checkboxes
 */
export function createVisibilitySection(
    drawing: Drawing,
    onChanged: () => void
): HTMLElement {
    return createSection('Display', (content) => {
        // Visible
        const visibleRow = createSettingsRow('Visible',
            createCheckbox(drawing.visible, '', (checked) => {
                drawing.visible = checked;
                onChanged();
            })
        );
        content.appendChild(visibleRow);

        // Locked
        const lockedRow = createSettingsRow('Locked',
            createCheckbox(drawing.locked, '', (checked) => {
                drawing.locked = checked;
                onChanged();
            })
        );
        content.appendChild(lockedRow);
    });
}
