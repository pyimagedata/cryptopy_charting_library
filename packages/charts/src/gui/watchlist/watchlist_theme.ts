/** Izleme listesi renk temalari ve olculer (panel, arama ve diyaloglar ortak kullanir). */

import { RP_TOKENS } from '../right_panel/rp_tokens';

export type WatchlistTheme = 'dark' | 'light';

/** Colours reference the shared --rp-* tokens (set by RightPanelHost or the panel's own root) with per-theme fallbacks. */
function wlColors(theme: 'dark' | 'light'): {
    bg: string; border: string; text: string; muted: string; hover: string; active: string; menu: string; selected: string;
    input: string; accent: string; up: string; down: string; flashUp: string; flashDown: string; scrollThumb: string; panel: string;
} {
    const t = RP_TOKENS[theme];
    const r = (n: string): string => `var(--rp-${n},${t[n]})`;
    return {
        bg: r('bg'), border: r('border'), text: r('text'), muted: r('muted'), hover: r('hover'), active: r('hover'), menu: r('surface'),
        selected: r('chip'), input: r('surface'), accent: r('accent'), up: r('up'), down: r('down'),
        flashUp: theme === 'dark' ? 'rgba(8,153,129,0.38)' : 'rgba(8,153,129,0.28)',
        flashDown: theme === 'dark' ? 'rgba(242,54,69,0.38)' : 'rgba(242,54,69,0.28)',
        scrollThumb: r('border'), panel: r('surface'),
    };
}

export const WL_COLORS = { dark: wlColors('dark'), light: wlColors('light') };

export type WlColors = (typeof WL_COLORS)['dark'];

/** Panel olculeri (px). */
export const WL_METRICS = {
    headerH: 48,
    colHeaderH: 42,
    rowH: 52,
    sectionH: 42,
    buttonSize: 30,
    padLeft: 16,
    padRight: 12,
    logoSize: 32,
    detailsHeaderH: 40,
    dividerH: 14,
    detailsMaxFraction: 0.6,
};

/** Fiyat degisim flasinin suresi (ms). */
export const WL_FLASH_MS = 600;
