/**
 * Line width button (TradingView style): line preview that opens a width menu.
 * Indicators here only support width (no dash style), so only widths are offered.
 */

import { createLineButton } from '../../settings_modal/components/LineButton';
import { LINE_WIDTHS } from '../base/constants';

export function createLineWidthSelect(
    value: number,
    options: { min?: number; max?: number },
    onChange: (value: number) => void,
    _rerenderCallback?: () => void,
    host: HTMLElement | null = null
): HTMLElement {
    const min = options.min || 1;
    const max = Math.min(options.max || 4, 4);
    const widths = LINE_WIDTHS.filter((w) => w >= min && w <= max);
    const shown = Math.max(1, Math.min(4, Math.round(value || 1)));
    return createLineButton(shown, 'solid', (w) => onChange(w), () => { /* style unsupported */ }, host, widths.length ? widths : LINE_WIDTHS, []);
}
