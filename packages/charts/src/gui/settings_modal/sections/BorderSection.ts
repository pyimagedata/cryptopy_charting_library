/**
 * Border Section Component
 * Reusable section for border/line settings (color, width, style)
 */

import { Drawing } from '../../../drawings';
import {
    createColorSwatch,
    createLineWidthSelector,
    createLineStyleButtons,
    createSection,
    createSettingsRow,
    LineStyleValue,
} from '../base/SettingsComponents';

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
            createColorSwatch(drawing.style.color, (color) => {
                drawing.style.color = color;
                onChanged();
            })
        );
        content.appendChild(colorRow);

        // Width
        const widthRow = createSettingsRow('Width',
            createLineWidthSelector(drawing.style.lineWidth, (width) => {
                drawing.style.lineWidth = width;
                onChanged();
            })
        );
        content.appendChild(widthRow);

        // Style
        const currentStyle = getLineStyleFromDash(drawing.style.lineDash);
        const styleRow = createSettingsRow('Style',
            createLineStyleButtons(currentStyle, (style) => {
                drawing.style.lineDash = getDashFromLineStyle(style);
                onChanged();
            })
        );
        content.appendChild(styleRow);
    });
}

/** Convert lineDash array to style name */
function getLineStyleFromDash(lineDash?: number[]): LineStyleValue {
    if (!lineDash || lineDash.length === 0) return 'solid';
    if (lineDash[0] === 6) return 'dashed';
    return 'dotted';
}

/** Convert style name to lineDash array */
function getDashFromLineStyle(style: LineStyleValue): number[] {
    switch (style) {
        case 'dashed': return [6, 4];
        case 'dotted': return [2, 2];
        default: return [];
    }
}
