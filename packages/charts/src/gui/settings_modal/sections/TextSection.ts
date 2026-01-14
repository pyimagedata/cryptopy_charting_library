/**
 * Text Section Component
 * Text settings section for drawings (color, size, style, content, alignment)
 */

import { Drawing } from '../../../drawings';
import { createColorSelect } from '../components/ColorSelect';
import { createSelect } from '../components/Select';
import { createSection, createSettingsRow } from '../base/SettingsComponents';
import { t } from '../../../helpers/translations';

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

const H_ALIGN_OPTIONS = [
    { value: 'left', label: 'Sol' },
    { value: 'center', label: 'Orta' },
    { value: 'right', label: 'Sağ' },
];

const V_ALIGN_OPTIONS = [
    { value: 'top', label: 'Üst' },
    { value: 'middle', label: 'Orta' },
    { value: 'bottom', label: 'Alt' },
];

/**
 * Creates a complete text settings section
 */
export function createTextSection(
    drawing: Drawing,
    onChanged: () => void
): HTMLElement {
    return createSection(t('Text'), (content) => {
        // Text Color
        const colorRow = createSettingsRow(t('Color'),
            createColorSelect(drawing.style.textColor || drawing.style.color, (color: string) => {
                drawing.style.textColor = color;
                onChanged();
            })
        );
        content.appendChild(colorRow);

        // Font Size dropdown
        const fontSizeSelect = createSelect(
            FONT_SIZES.map(s => ({ value: String(s), label: `${s}px` })),
            String(drawing.style.fontSize || 14),
            (value: string) => {
                drawing.style.fontSize = parseInt(value);
                onChanged();
            }
        );
        const sizeRow = createSettingsRow(t('Size'), fontSizeSelect);
        content.appendChild(sizeRow);

        // Bold/Italic toggle buttons
        const styleRow = document.createElement('div');
        styleRow.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid var(--border-color);
        `;

        const styleLabel = document.createElement('span');
        styleLabel.textContent = t('Style');
        styleLabel.style.cssText = 'font-size: 13px; color: var(--text-primary);';
        styleRow.appendChild(styleLabel);

        const toggleWrapper = document.createElement('div');
        toggleWrapper.style.cssText = 'display: flex; gap: 4px;';

        // Bold button
        const boldBtn = document.createElement('button');
        boldBtn.innerHTML = '<b>B</b>';
        boldBtn.title = t('Bold');
        const isBold = drawing.style.fontWeight === 'bold';
        boldBtn.style.cssText = `
            width: 28px; height: 28px;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            background: ${isBold ? '#2962ff' : 'var(--input-bg)'};
            color: ${isBold ? '#fff' : 'var(--text-secondary)'};
        `;
        boldBtn.onclick = () => {
            const newBold = drawing.style.fontWeight !== 'bold';
            drawing.style.fontWeight = newBold ? 'bold' : 'normal';
            boldBtn.style.background = newBold ? '#2962ff' : 'var(--input-bg)';
            boldBtn.style.color = newBold ? '#fff' : 'var(--text-secondary)';
            onChanged();
        };
        toggleWrapper.appendChild(boldBtn);

        // Italic button
        const italicBtn = document.createElement('button');
        italicBtn.innerHTML = '<i>I</i>';
        italicBtn.title = t('Italic');
        const isItalic = drawing.style.fontStyle === 'italic';
        italicBtn.style.cssText = `
            width: 28px; height: 28px;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            font-style: italic;
            cursor: pointer;
            font-style: italic;
            cursor: pointer;
            background: ${isItalic ? '#2962ff' : 'var(--input-bg)'};
            color: ${isItalic ? '#fff' : 'var(--text-secondary)'};
        `;
        italicBtn.onclick = () => {
            const newItalic = drawing.style.fontStyle !== 'italic';
            drawing.style.fontStyle = newItalic ? 'italic' : 'normal';
            italicBtn.style.background = newItalic ? '#2962ff' : 'var(--input-bg)';
            italicBtn.style.color = newItalic ? '#fff' : 'var(--text-secondary)';
            onChanged();
        };
        toggleWrapper.appendChild(italicBtn);

        styleRow.appendChild(toggleWrapper);
        content.appendChild(styleRow);

        // Text content (textarea)
        const textArea = document.createElement('textarea');
        textArea.value = drawing.style.text || '';
        textArea.placeholder = t('Enter text...');
        textArea.style.cssText = `
            width: 100%;
            min-height: 80px;
            padding: 10px;
            margin: 12px 0;
            margin: 12px 0;
            background: var(--input-bg);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            color: var(--text-primary);
            font-size: 13px;
            resize: vertical;
            outline: none;
        `;
        textArea.addEventListener('focus', () => {
            textArea.style.borderColor = '#2962ff';
        });
        textArea.addEventListener('blur', () => {
            textArea.style.borderColor = 'var(--border-color)';
        });
        textArea.addEventListener('input', () => {
            drawing.style.text = textArea.value;
            onChanged();
        });
        content.appendChild(textArea);

        // Alignment row
        const alignRow = document.createElement('div');
        alignRow.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid var(--border-color);
        `;

        const alignLabel = document.createElement('span');
        alignLabel.textContent = t('Alignment');
        alignLabel.style.cssText = 'font-size: 13px; color: var(--text-primary);';
        alignRow.appendChild(alignLabel);

        const alignSelects = document.createElement('div');
        alignSelects.style.cssText = 'display: flex; gap: 8px;';

        // Horizontal alignment
        const hAlignSelect = createSelect(
            H_ALIGN_OPTIONS,
            drawing.style.textHAlign || 'center',
            (value: string) => {
                drawing.style.textHAlign = value as 'left' | 'center' | 'right';
                onChanged();
            }
        );
        alignSelects.appendChild(hAlignSelect);

        // Vertical alignment
        const vAlignSelect = createSelect(
            V_ALIGN_OPTIONS,
            drawing.style.textVAlign || 'middle',
            (value: string) => {
                drawing.style.textVAlign = value as 'top' | 'middle' | 'bottom';
                onChanged();
            }
        );
        alignSelects.appendChild(vAlignSelect);

        alignRow.appendChild(alignSelects);
        content.appendChild(alignRow);
    });
}
