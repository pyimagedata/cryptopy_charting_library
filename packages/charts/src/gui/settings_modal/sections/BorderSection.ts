/**
 * Border Section Component
 * Reusable section for border/line settings (color, width, style)
 */

import { Drawing } from '../../../drawings';
import { createColorSelect } from '../components/ColorSelect';
import { createLineWidthSelect } from '../components/LineWidthSelect';
import { createLineStyleSelect, dashToLineStyle, lineStyleToDash, LineStyleValue } from '../components/LineStyleSelect';
import { createSection, createSettingsRow } from '../base/SettingsComponents';

/**
 * Creates a complete border settings section with color, width, and style controls
 */
export function createBorderSection(
    drawing: Drawing,
    onChanged: () => void
): HTMLElement {
    return createSection('Border', (content) => {
        // Color
        const colorRow = createSettingsRow('Color',
            createColorSelect(drawing.style.color, (color: string) => {
                drawing.style.color = color;
                onChanged();
            })
        );
        content.appendChild(colorRow);

        // Width
        const widthRow = createSettingsRow('Width',
            createLineWidthSelect(drawing.style.lineWidth, (width: number) => {
                drawing.style.lineWidth = width;
                onChanged();
            })
        );
        content.appendChild(widthRow);

        // Style
        const currentStyle = dashToLineStyle(drawing.style.lineDash);
        const styleRow = createSettingsRow('Style',
            createLineStyleSelect(currentStyle, (style: LineStyleValue) => {
                drawing.style.lineDash = lineStyleToDash(style);
                onChanged();
            })
        );
        content.appendChild(styleRow);
    });
}
