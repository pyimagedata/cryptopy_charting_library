/**
 * Points Section Component
 * Reusable section for displaying drawing point coordinates
 */

import { Drawing, DrawingPoint } from '../../../drawings';
import { createSection } from '../base/SettingsComponents';

/**
 * Creates a points section showing coordinates of drawing points
 */
export function createPointsSection(
    drawing: Drawing
): HTMLElement {
    return createSection('Points', (content) => {
        drawing.points.forEach((point: DrawingPoint, index: number) => {
            const pointRow = document.createElement('div');
            pointRow.style.cssText = `
                padding: 12px 0;
                border-bottom: 1px solid #2B2B43;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;

            const label = document.createElement('span');
            label.textContent = `Point ${index + 1}`;
            label.style.cssText = 'font-size: 13px; color: #787b86;';

            const values = document.createElement('span');
            const date = new Date(point.time);
            values.textContent = `${date.toLocaleDateString()} | ${point.price.toFixed(2)}`;
            values.style.cssText = 'font-size: 13px; color: #d1d4dc;';

            pointRow.appendChild(label);
            pointRow.appendChild(values);
            content.appendChild(pointRow);
        });
    });
}
