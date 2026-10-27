/**
 * Pitchfork / Pitchfan seviye tablosu: her satirda gorunurluk onay kutusu, katsayi girisi,
 * renk kutusu ve cizgi dugmesi (kalinlik + stil). FibLevelsEditor ile ayni kalip; sabit satir sayisi.
 */

import { createColorSelect } from './ColorSelect';
import { createCheckbox } from './Checkbox';
import { createLineButton, LineButtonStyle } from './LineButton';
import { parseStrictNumber } from '../../../helpers/strict-number';

export interface PitchLevelEdit {
    level: number;
    visible: boolean;
    color: string;
    lineWidth: number;
    lineStyle: LineButtonStyle;
}

const INPUT_CSS = `
    flex: 0 0 64px;
    width: 64px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--input-bg);
    color: var(--text-primary);
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
`;

function fmt(value: number): string {
    return String(Number(value.toFixed(3)));
}

export interface PitchLevelsEditorOptions {
    /** 0 katsayisi gecerli mi (varsayilan: hayir, katsayi > 0 olmali) */
    allowZero?: boolean;
    /** En buyuk katsayi (varsayilan 100) */
    max?: number;
    /** Satirda cizgi (kalinlik/stil) dugmesi gosterilsin mi (varsayilan: evet) */
    lines?: boolean;
}

export function createPitchLevelsEditor(
    levels: PitchLevelEdit[],
    onChange: (levels: PitchLevelEdit[]) => void,
    host: HTMLElement | null,
    options: PitchLevelsEditorOptions = {}
): HTMLElement {
    const max = options.max ?? 100;
    const valid = (v: number) => Number.isFinite(v) && (options.allowZero ? v >= 0 : v > 0) && v <= max;
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    const state = levels.map((l) => ({ ...l }));

    const notify = () => onChange(state.map((l) => ({ ...l })));

    const render = () => {
        container.innerHTML = '';
        state.forEach((level, index) => {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: center; gap: 10px;';
            row.dataset.pitchLevel = String(index);

            row.appendChild(createCheckbox(level.visible, '', (checked) => {
                state[index].visible = checked;
                notify();
            }));

            const input = document.createElement('input');
            input.type = 'text';
            input.inputMode = 'decimal';
            input.value = fmt(level.level);
            input.style.cssText = INPUT_CSS;
            input.onfocus = () => { input.style.borderColor = '#2962ff'; };
            input.onblur = () => {
                input.style.borderColor = 'var(--border-color)';
                const parsed = parseStrictNumber(input.value);
                if (valid(parsed)) {
                    state[index].level = parsed;
                    input.value = fmt(parsed);
                    notify();
                } else {
                    input.value = fmt(state[index].level);
                }
            };
            row.appendChild(input);

            row.appendChild(createColorSelect(level.color, (color) => {
                state[index].color = color;
                notify();
                render();
            }));

            if (options.lines !== false) {
                row.appendChild(createLineButton(
                    level.lineWidth,
                    level.lineStyle,
                    (w) => { state[index].lineWidth = w; notify(); render(); },
                    (s) => { state[index].lineStyle = s; notify(); render(); },
                    host,
                ));
            }

            container.appendChild(row);
        });
    };

    render();
    return container;
}
