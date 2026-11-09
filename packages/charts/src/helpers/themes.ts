/**
 * Theme definitions for dark and light modes
 */

import { SOFT } from '../gui/soft_theme';

export type ThemeType = 'dark' | 'light';

export interface ThemeColors {
    layout: {
        backgroundColor: string;
        textColor: string;
    };
    grid: {
        color: string;
    };
    crosshair: {
        lineColor: string;
        labelBackgroundColor: string;
    };
    toolbar: {
        backgroundColor: string;
        borderColor: string;
        textColor: string;
        hoverColor: string;
        activeColor: string;
    };
    priceAxis: {
        backgroundColor: string;
        textColor: string;
        lineColor: string;
    };
    timeAxis: {
        backgroundColor: string;
        textColor: string;
    };
    candle: {
        upColor: string;
        downColor: string;
        wickUpColor: string;
        wickDownColor: string;
    };
    branding: {
        textColor: string;
        shadowColor: string;
    };
}

export const THEMES: Record<ThemeType, ThemeColors> = {
    dark: {
        layout: {
            backgroundColor: SOFT.dark.surface,
            textColor: 'rgba(255, 255, 255, 0.7)',
        },
        grid: {
            color: SOFT.dark.grid,
        },
        crosshair: {
            lineColor: SOFT.dark.crosshair,
            labelBackgroundColor: '#2962ff',
        },
        toolbar: {
            backgroundColor: SOFT.dark.surface,
            borderColor: SOFT.dark.sep,
            textColor: '#d1d4dc',
            hoverColor: '#2a2e39',
            activeColor: '#2962ff',
        },
        priceAxis: {
            backgroundColor: SOFT.dark.surface,
            textColor: 'rgba(255, 255, 255, 0.7)',
            lineColor: 'transparent',
        },
        timeAxis: {
            backgroundColor: SOFT.dark.surface,
            textColor: 'rgba(255, 255, 255, 0.5)',
        },
        candle: {
            upColor: '#26a69a',
            downColor: '#ef5350',
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        },
        branding: {
            textColor: 'rgba(255, 255, 255, 0.9)',
            shadowColor: 'rgba(41, 98, 255, 0.8)',
        },
    },
    light: {
        layout: {
            backgroundColor: SOFT.light.surface,
            textColor: '#131722',
        },
        grid: {
            color: SOFT.light.grid,
        },
        crosshair: {
            lineColor: SOFT.light.crosshair,
            labelBackgroundColor: '#2962ff',
        },
        toolbar: {
            backgroundColor: SOFT.light.surface,
            borderColor: SOFT.light.sep,
            textColor: '#131722',
            hoverColor: '#e0e3eb',
            activeColor: '#2962ff',
        },
        priceAxis: {
            backgroundColor: SOFT.light.surface,
            textColor: '#131722',
            lineColor: 'transparent',
        },
        timeAxis: {
            backgroundColor: SOFT.light.surface,
            textColor: '#787b86',
        },
        candle: {
            upColor: '#26a69a',
            downColor: '#ef5350',
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        },
        branding: {
            textColor: 'rgba(0, 0, 0, 0.7)',
            shadowColor: 'rgba(41, 98, 255, 0.4)',
        },
    },
};

/**
 * Get theme colors by theme type
 */
export function getTheme(theme: ThemeType): ThemeColors {
    return THEMES[theme] || THEMES.dark;
}
