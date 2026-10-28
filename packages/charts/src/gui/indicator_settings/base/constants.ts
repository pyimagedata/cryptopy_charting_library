/**
 * Indicator settings dialog: every colour / size in one place (TradingView look).
 * The dialog root exposes the palette as CSS variables (`--tvs-*`), so components
 * only reference `var(--tvs-...)` and follow the chart theme without extra plumbing.
 * The `--modal-bg` / `--text-primary` ... aliases feed the shared popovers
 * (colour palette, line menu) which copy them from the dialog element.
 */

export type SettingsTheme = 'dark' | 'light';

export interface SettingsPalette {
    bg: string;
    border: string;
    text: string;
    muted: string;
    inputBg: string;
    inputBorder: string;
    hover: string;
    accent: string;
    accentHover: string;
    accentText: string;
    shadow: string;
    overlay: string;
    tabActive: string;
    checkboxBorder: string;
}

export const TV_PALETTES: Record<SettingsTheme, SettingsPalette> = {
    dark: {
        bg: '#1E222D',
        border: '#2A2E39',
        text: '#D1D4DC',
        muted: '#787B86',
        inputBg: '#2A2E39',
        inputBorder: '#363A45',
        hover: '#2A2E39',
        accent: '#2962FF',
        accentHover: '#1E53E5',
        accentText: '#FFFFFF',
        shadow: '0 2px 20px rgba(0, 0, 0, 0.55)',
        overlay: 'rgba(0, 0, 0, 0.45)',
        tabActive: '#D1D4DC',
        checkboxBorder: '#5D606B',
    },
    light: {
        bg: '#FFFFFF',
        border: '#E0E3EB',
        text: '#131722',
        muted: '#787B86',
        inputBg: '#FFFFFF',
        inputBorder: '#D1D4DC',
        hover: '#F0F3FA',
        accent: '#2962FF',
        accentHover: '#1E53E5',
        accentText: '#FFFFFF',
        shadow: '0 2px 20px rgba(19, 23, 34, 0.18)',
        overlay: 'rgba(19, 23, 34, 0.35)',
        tabActive: '#131722',
        checkboxBorder: '#B2B5BE',
    },
};

export const TV_SIZES = {
    dialogWidth: 460,
    dialogMaxWidthVw: 95,
    dialogMaxHeightVh: 80,
    radius: 8,
    controlRadius: 4,
    controlHeight: 32,
    checkbox: 18,
    headerPad: '16px 20px 0 20px',
    bodyPad: '16px 20px',
    footerPad: '12px 20px',
    rowGap: 12,
    zIndex: 10000,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
    fontSize: 14,
    smallFontSize: 12,
    titleFontSize: 18,
} as const;

/** CSS custom properties for a theme (set on the dialog element) */
export function themeCssVars(theme: SettingsTheme): Record<string, string> {
    const p = TV_PALETTES[theme];
    return {
        '--tvs-bg': p.bg,
        '--tvs-border': p.border,
        '--tvs-text': p.text,
        '--tvs-muted': p.muted,
        '--tvs-input-bg': p.inputBg,
        '--tvs-input-border': p.inputBorder,
        '--tvs-hover': p.hover,
        '--tvs-accent': p.accent,
        '--tvs-accent-hover': p.accentHover,
        '--tvs-accent-text': p.accentText,
        '--tvs-checkbox-border': p.checkboxBorder,
        // aliases used by shared popovers (settings_modal/components/popover.ts)
        '--modal-bg': p.bg,
        '--text-primary': p.text,
        '--text-secondary': p.muted,
        '--border-color': p.inputBorder,
        '--hover-bg': p.hover,
        '--shadow': p.shadow,
        '--input-bg': p.inputBg,
    };
}

/** Price sources offered when an indicator exposes a `source` option */
export const SOURCE_OPTIONS = [
    { value: 'close', label: 'close' },
    { value: 'open', label: 'open' },
    { value: 'high', label: 'high' },
    { value: 'low', label: 'low' },
    { value: 'hl2', label: 'hl2' },
    { value: 'hlc3', label: 'hlc3' },
    { value: 'ohlc4', label: 'ohlc4' },
];

/** Precision select: '' = default (adaptive), then 0..8 decimals */
export const PRECISION_OPTIONS = [
    { value: '', label: 'Default' },
    ...Array.from({ length: 9 }, (_, i) => ({ value: String(i), label: String(i) })),
];

/** Line widths offered by the width menu */
export const LINE_WIDTHS = [1, 2, 3, 4];
