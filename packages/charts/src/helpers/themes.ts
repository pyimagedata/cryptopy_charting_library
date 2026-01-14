/**
 * Theme definitions for dark and light modes
 */

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
            backgroundColor: '#1a1a2e',
            textColor: 'rgba(255, 255, 255, 0.7)',
        },
        grid: {
            color: 'rgba(255, 255, 255, 0.06)',
        },
        crosshair: {
            lineColor: 'rgba(255, 255, 255, 0.3)',
            labelBackgroundColor: '#2962ff',
        },
        toolbar: {
            backgroundColor: '#131722',
            borderColor: '#2a2e39',
            textColor: '#d1d4dc',
            hoverColor: '#2a2e39',
            activeColor: '#2962ff',
        },
        priceAxis: {
            backgroundColor: '#16213e',
            textColor: 'rgba(255, 255, 255, 0.7)',
            lineColor: 'rgba(255, 255, 255, 0.1)',
        },
        timeAxis: {
            backgroundColor: '#16213e',
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
            backgroundColor: '#ffffff',
            textColor: '#131722',
        },
        grid: {
            color: 'rgba(0, 0, 0, 0.06)',
        },
        crosshair: {
            lineColor: 'rgba(0, 0, 0, 0.3)',
            labelBackgroundColor: '#2962ff',
        },
        toolbar: {
            backgroundColor: '#f8f9fa',
            borderColor: '#e0e3eb',
            textColor: '#131722',
            hoverColor: '#e0e3eb',
            activeColor: '#2962ff',
        },
        priceAxis: {
            backgroundColor: '#f8f9fa',
            textColor: '#131722',
            lineColor: 'rgba(0, 0, 0, 0.1)',
        },
        timeAxis: {
            backgroundColor: '#f8f9fa',
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
