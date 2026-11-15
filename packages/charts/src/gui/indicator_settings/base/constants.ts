import { FONT_SANS } from '../../../helpers/fonts';
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
    /** focus ring only (brand blue); `accent` is the neutral primary fill */
    focus: string;
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
        muted: '#9598A3',
        inputBg: '#1E222D',
        inputBorder: '#3A3E4A',
        hover: '#2A2E39',
        accent: '#E8EAEE',
        accentHover: '#FFFFFF',
        accentText: '#131722',
        focus: '#2962FF',
        shadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        overlay: 'rgba(0, 0, 0, 0.45)',
        tabActive: '#D1D4DC',
        checkboxBorder: '#5D606B',
    },
    light: {
        bg: '#FFFFFF',
        border: '#E0E3EB',
        text: '#131722',
        muted: '#6B6F7B',
        inputBg: '#FFFFFF',
        inputBorder: '#D7DAE0',
        hover: '#F3F4F7',
        accent: '#131722',
        accentHover: '#2A2E39',
        accentText: '#FFFFFF',
        focus: '#2962FF',
        shadow: '0 8px 32px rgba(19, 23, 34, 0.16)',
        overlay: 'rgba(19, 23, 34, 0.35)',
        tabActive: '#131722',
        checkboxBorder: '#B2B5BE',
    },
};

export const TV_SIZES = {
    dialogWidth: 480,
    dialogMaxWidthVw: 95,
    dialogMaxHeightVh: 80,
    radius: 12,
    controlRadius: 8,
    controlHeight: 36,
    /** width of the right-hand control column of a row */
    controlColumn: 200,
    checkbox: 18,
    headerPad: '18px 24px 0 24px',
    bodyPad: '20px 24px',
    footerPad: '14px 24px',
    rowGap: 16,
    zIndex: 10000,
    fontFamily: FONT_SANS,
    fontSize: 14,
    smallFontSize: 13,
    titleFontSize: 17,
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
        '--tvs-focus': p.focus,
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
