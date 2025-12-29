/**
 * Line Width Button Component
 * Cycles through line widths on click
 */

import { Drawing } from '../../../drawings';
import { ICONS } from './Icons';

const LINE_WIDTHS = [1, 2, 3, 4];

/**
 * Creates a line width button that cycles through widths
 */
export function createLineWidthButton(
    drawing: Drawing,
    onChange: (width: number) => void
): HTMLElement {
    const btn = document.createElement('button');
    btn.innerHTML = ICONS.lineStyle;
    btn.title = 'Line width';
    btn.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        background: transparent;
        border: none;
        color: #787b86;
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.1s ease;
    `;

    btn.addEventListener('mouseenter', () => {
        btn.style.background = '#2a2e39';
        btn.style.color = '#d1d4dc';
    });

    btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
        btn.style.color = '#787b86';
    });

    // Find current width index
    let currentWidthIdx = LINE_WIDTHS.indexOf(drawing.style.lineWidth);
    if (currentWidthIdx === -1) currentWidthIdx = 0;

    btn.addEventListener('click', () => {
        currentWidthIdx = (currentWidthIdx + 1) % LINE_WIDTHS.length;
        const width = LINE_WIDTHS[currentWidthIdx];
        drawing.style.lineWidth = width;
        onChange(width);

        // Visual feedback - update icon line thickness
        const lines = btn.querySelectorAll('line');
        lines.forEach(line => {
            line.setAttribute('stroke-width', String(width));
        });
    });

    return btn;
}
