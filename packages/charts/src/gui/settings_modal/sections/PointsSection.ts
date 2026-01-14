/**
 * Points Section Component
 * Reusable section for displaying drawing point coordinates
 */

import { Drawing, DrawingPoint } from '../../../drawings';
import { createSection } from '../base/SettingsComponents';
import { t } from '../../../helpers/translations';

/**
 * Creates a points section showing coordinates of drawing points
 */
export function createPointsSection(
    drawing: Drawing
): HTMLElement {
    return createSection(t('Points'), (content) => {
        drawing.points.forEach((point: DrawingPoint, index: number) => {
            const pointRow = document.createElement('div');
            pointRow.style.cssText = `
                padding: 12px 0;
                border-bottom: 1px solid var(--border-color);
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;

            const label = document.createElement('span');
            label.textContent = `${t('Point')} ${index + 1}`;
            label.style.cssText = 'font-size: 13px; color: var(--text-secondary);';

            const values = document.createElement('span');
            const date = new Date(point.time);
            values.textContent = `${date.toLocaleDateString()} | ${point.price.toFixed(2)}`;
            values.style.cssText = 'font-size: 13px; color: var(--text-primary);';

            pointRow.appendChild(label);
            pointRow.appendChild(values);
            content.appendChild(pointRow);
        });
    });
}
