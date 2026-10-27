/** Izleme listesi renk temalari ve olculer (panel, arama ve diyaloglar ortak kullanir). */

export type WatchlistTheme = 'dark' | 'light';

export const WL_COLORS = {
    dark: {
        bg: '#131722', border: '#2a2e39', text: '#d1d4dc', muted: '#787b86', hover: '#1e222d', active: '#2a2e39', menu: '#1e222d',
        selected: 'rgba(41,98,255,0.28)', input: '#2a2e39', accent: '#2962ff',
        up: '#089981', down: '#f23645', flashUp: 'rgba(8,153,129,0.38)', flashDown: 'rgba(242,54,69,0.38)',
        scrollThumb: '#363a45', panel: '#171b26',
    },
    light: {
        bg: '#ffffff', border: '#e0e3eb', text: '#131722', muted: '#5d606b', hover: '#f0f3fa', active: '#e3effd', menu: '#ffffff',
        selected: 'rgba(41,98,255,0.16)', input: '#f0f3fa', accent: '#2962ff',
        up: '#089981', down: '#f23645', flashUp: 'rgba(8,153,129,0.28)', flashDown: 'rgba(242,54,69,0.28)',
        scrollThumb: '#c3c6d0', panel: '#f8f9fd',
    },
};

export type WlColors = (typeof WL_COLORS)['dark'];

/** Panel olculeri (px). */
export const WL_METRICS = {
    headerH: 44,
    colHeaderH: 28,
    rowH: 34,
    sectionH: 28,
    buttonSize: 28,
    padLeft: 18,
    padRight: 12,
    logoSize: 22,
    detailsHeaderH: 34,
    dividerH: 6,
    detailsMaxFraction: 0.6,
};

/** Fiyat degisim flasinin suresi (ms). */
export const WL_FLASH_MS = 600;
