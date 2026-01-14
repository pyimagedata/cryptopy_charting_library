/**
 * Visibility Section Component
 * Reusable section for visibility settings (visible, locked)
 */

import { Drawing } from '../../../drawings';
import { createCheckbox } from '../components/Checkbox';
import { createSection, createSettingsRow } from '../base/SettingsComponents';
import { t } from '../../../helpers/translations';

/**
 * Creates a visibility settings section with visible and locked checkboxes
 */
export function createVisibilitySection(
    drawing: Drawing,
    onChanged: () => void
): HTMLElement {
    return createSection(t('Display'), (content) => {
        // Visible
        const visibleRow = createSettingsRow(t('Visible'),
            createCheckbox(drawing.visible, '', (checked: boolean) => {
                drawing.visible = checked;
                onChanged();
            })
        );
        content.appendChild(visibleRow);

        // Locked
        const lockedRow = createSettingsRow(t('Locked'),
            createCheckbox(drawing.locked, '', (checked: boolean) => {
                drawing.locked = checked;
                onChanged();
            })
        );
        content.appendChild(lockedRow);
    });
}
