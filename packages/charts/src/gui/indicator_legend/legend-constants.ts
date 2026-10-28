/**
 * Indicator legend: sizes and colours in one place.
 * Colours follow the chart theme (TradingView palette).
 */

export type LegendTheme = 'dark' | 'light';

export const LEGEND_STYLE = {
    metrics: {
        fontSize: 13,
        rowHeight: 24,
        buttonSize: 24,
        iconSize: 18,
        radius: 4,
        /** Horizontal padding inside a row */
        rowPadX: 4,
        /** Gap between title, values and buttons */
        gap: 6,
        /** Gap between rows */
        rowGap: 1,
        /** Gap between the main series line and the first indicator row */
        topOffset: 4,
        /** Title and values of a hidden indicator */
        dimmedOpacity: 0.5,
        /** Right edge of the legend area kept free for pane header controls */
        reservedRight: 140,
    },
    /** The overlay legend collapses into one line once there are more rows than this */
    collapseAfterRows: 3,
    dark: {
        text: '#D1D4DC',
        muted: '#787B86',
        hoverBg: '#2A2E39',
        /** Row background on hover: chart background, semi-transparent */
        rowBg: 'rgba(26, 26, 46, 0.85)',
    },
    light: {
        text: '#131722',
        muted: '#787B86',
        hoverBg: '#F0F3FA',
        rowBg: 'rgba(255, 255, 255, 0.85)',
    },
} as const;

export function legendColors(theme: LegendTheme) {
    return theme === 'light' ? LEGEND_STYLE.light : LEGEND_STYLE.dark;
}
