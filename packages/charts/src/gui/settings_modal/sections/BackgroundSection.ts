/**
 * Background Section Component
 * Reusable section for fill/background settings (color, opacity)
 */

import { Drawing } from '../../../drawings';
import {
    createColorSwatch,
    createSlider,
    createSection,
    createSettingsRow,
} from '../base/SettingsComponents';

/**
 * Creates a complete background settings section with fill color and opacity controls
 */
export function createBackgroundSection(
    drawing: Drawing,
    onChanged: () => void
): HTMLElement | null {
    // Only create if drawing has fillColor
    if (!('fillColor' in drawing.style) || !drawing.style.fillColor) {
        return null;
    }

    return createSection('Background', (content) => {
        // Fill Color
        const colorRow = createSettingsRow('Color',
            createColorSwatch(drawing.style.fillColor || '#2962ff', (color) => {
                drawing.style.fillColor = color;
                onChanged();
            })
        );
        content.appendChild(colorRow);

        // Opacity
        if ('fillOpacity' in drawing.style) {
            const opacityRow = createSettingsRow('Opacity',
                createSlider(
                    Math.round((drawing.style.fillOpacity ?? 0.2) * 100),
                    0, 100, 1, '%',
                    (value) => {
                        drawing.style.fillOpacity = value / 100;
                        onChanged();
                    }
                )
            );
            content.appendChild(opacityRow);
        }
    });
}
