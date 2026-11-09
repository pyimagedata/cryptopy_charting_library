/**
 * "Soft layout" design tokens: the ONE place where region surfaces, gaps, radii, hover/selected greys, menu and dialog
 * looks are defined. They are exposed as CSS custom properties on <html> (dark values by default, light values under
 * `html[data-soft-theme="light"]`), so the library, the host page and the right/bottom panels can all use `var(--surface)` etc.
 * Canvas code cannot read CSS variables, so it uses the same values via `SOFT` (see helpers/themes.ts).
 *
 * The selected-state colour is a single token (`--btn-selected`): neutral grey by default, switch it to a soft blue
 * (e.g. rgba(41,98,255,.22)) here and every toolbar / timeframe / LIN-LOG / drawing-tool selection follows.
 */

export type SoftTheme = 'dark' | 'light';

export const SOFT: Record<SoftTheme, Record<string, string>> = {
    dark: {
        appBg: '#0d0d17',
        surface: '#1a1a2e',
        surfaceRaised: '#212139',
        text: '#d1d4dc',
        textMuted: '#8a8da0',
        sep: 'rgba(255, 255, 255, 0.06)',
        btnHover: 'rgba(255, 255, 255, 0.07)',
        btnSelected: 'rgba(255, 255, 255, 0.15)',
        btnSelectedFg: '#ffffff',
        menuBg: '#23233b',
        menuShadow: '0 2px 6px rgba(0, 0, 0, 0.45)',
        dialogBg: 'rgba(30, 30, 52, 0.96)',
        dialogBorder: '1px solid rgba(140, 140, 160, 0.12)',
        dialogShadow: '0 3px 12px rgba(0, 0, 0, 0.4)',
        overlay: 'rgba(0, 0, 0, 0.4)',
        grid: 'rgba(255, 255, 255, 0.16)',
        crosshair: '#8e8e98',
        legendScrim: 'rgba(26, 26, 46, 0.55)',
        activeOutline: 'rgba(41, 98, 255, 0.35)',
    },
    light: {
        appBg: '#e6e8ee',
        surface: '#ffffff',
        surfaceRaised: '#f4f5f8',
        text: '#131722',
        textMuted: '#6a6d78',
        sep: 'rgba(0, 0, 0, 0.06)',
        btnHover: 'rgba(0, 0, 0, 0.05)',
        btnSelected: 'rgba(0, 0, 0, 0.11)',
        btnSelectedFg: '#131722',
        menuBg: '#ffffff',
        menuShadow: '0 2px 6px rgba(0, 0, 0, 0.18)',
        dialogBg: 'rgba(255, 255, 255, 0.97)',
        dialogBorder: '1px solid rgba(0, 0, 0, 0.06)',
        dialogShadow: '0 3px 12px rgba(0, 0, 0, 0.14)',
        overlay: 'rgba(19, 23, 34, 0.28)',
        grid: 'rgba(0, 0, 0, 0.15)',
        crosshair: '#8e8e98',
        legendScrim: 'rgba(255, 255, 255, 0.6)',
        activeOutline: 'rgba(41, 98, 255, 0.35)',
    },
};

/** Theme-independent tokens (geometry). */
export const SOFT_GEOMETRY: Record<string, string> = {
    regionGap: '4px',
    regionRadius: '6px',
    btnRadius: '6px',
    menuRadius: '6px',
    menuPad: '6px',
    menuRowH: '32px',
    dialogRadius: '12px',
    dialogItemRadius: '8px',
    labelRadius: '2px',
    accent: '#2962ff',
};

const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const vars = (o: Record<string, string>): string => Object.keys(o).map((k) => `--${kebab(k)}:${o[k]};`).join('');

const STYLE_ID = 'soft-theme-style';

/** Global overrides that need no JS: they restyle the existing (inline-styled) widgets from the tokens. */
function css(): string {
    return `
:root{${vars(SOFT_GEOMETRY)}${vars(SOFT.dark)}}
html[data-soft-theme="light"]{${vars(SOFT.light)}}

/* --- regions: surfaces separated by gaps of the app background, no hard lines --- */
.tv-multi-chart-layout-shell{background:var(--app-bg) !important;padding-bottom:var(--region-gap);box-sizing:border-box}
.tv-multi-chart-layout-row{gap:var(--region-gap)}
.tv-multi-chart-layout-grid{background:transparent !important}
.chart-toolbar{background:var(--surface) !important;border-bottom:0 !important;margin-bottom:var(--region-gap);height:40px !important;flex:none;color:var(--text)}
.drawing-toolbar{background:var(--surface) !important;border:0 !important;border-radius:0 var(--region-radius) var(--region-radius) 0;margin-right:var(--region-gap);width:52px !important;flex:0 0 52px !important;box-sizing:border-box;padding:4px !important}
.drawing-toolbar>button{width:44px !important;height:36px !important;margin-bottom:2px !important}
.drawing-toolbar>button>svg{width:28px;height:28px}
.drawing-flyout{left:calc(52px + var(--region-gap)) !important;background:var(--menu-bg) !important;border:0 !important;border-radius:var(--menu-radius) !important;box-shadow:var(--menu-shadow) !important;padding:var(--menu-pad) !important}
.drawing-flyout-item{min-height:var(--menu-row-h);border-radius:var(--btn-radius);box-sizing:border-box}
.drawing-flyout-item:hover,.drawing-flyout-grid-item:hover{background:var(--btn-hover) !important}
.drawing-flyout-item.active,.drawing-flyout-grid-item.active{background:var(--btn-selected) !important;color:var(--btn-selected-fg) !important}
.drawing-flyout-grid-item{border-radius:var(--btn-radius) !important}
.tv-right-toolbar{background:var(--surface) !important;border:0 !important;border-radius:var(--region-radius) 0 0 var(--region-radius)}
.tv-right-panel-container{background:var(--surface) !important;border-radius:var(--region-radius);overflow:visible}
.tv-right-panel-container>.tv-right-panel-view{border-radius:var(--region-radius);overflow:hidden}
.tv-multi-chart-slot{background:var(--surface) !important;border-radius:var(--region-radius) !important}
.tv-chart-container{background-color:var(--surface)}

/* --- buttons: neutral pills, selected colour in one token --- */
.chart-toolbar button,.drawing-toolbar button,.tv-right-toolbar button{border-radius:var(--btn-radius) !important}
.chart-toolbar button:hover:not([data-active="true"]):not([style*="41, 98, 255"]),
.drawing-toolbar button:hover:not([style*="41, 98, 255"]),
.tv-right-toolbar button:hover{background:var(--btn-hover) !important}
.chart-toolbar button[data-active="true"],.chart-toolbar button[style*="41, 98, 255"],
.drawing-toolbar button[data-active="true"],.drawing-toolbar button[style*="41, 98, 255"],
.tv-right-toolbar button[data-active="true"]{background:var(--btn-selected) !important;color:var(--btn-selected-fg) !important}
.chart-toolbar button{min-height:32px}
.chart-toolbar .toolbar-symbol,.chart-toolbar .toolbar-chart-type-trigger{border-radius:var(--btn-radius) !important}
.chart-toolbar .toolbar-tz-select,.chart-toolbar .toolbar-lang-select{border:0 !important;background:var(--btn-hover) !important;border-radius:var(--btn-radius) !important;height:30px !important}
.chart-toolbar .toolbar-settings-button,.chart-toolbar .toolbar-brand-button{border:0 !important;background:transparent !important;border-radius:var(--btn-radius) !important}
.chart-toolbar .toolbar-settings-button:hover,.chart-toolbar .toolbar-brand-button:hover,.chart-toolbar .toolbar-brand-button[aria-expanded="true"]{background:var(--btn-hover) !important}
.chart-toolbar .toolbar-custom-timeframe-button:hover{background:var(--btn-hover) !important}
.chart-toolbar[data-theme="light"] .toolbar-custom-timeframe-button:hover{background:var(--btn-hover) !important}

/* --- menus: no border, tight shadow, 6px padding, 32px rows, 6px pills --- */
.soft-menu{background:var(--menu-bg) !important;border:0 !important;border-radius:var(--menu-radius) !important;box-shadow:var(--menu-shadow) !important;padding:var(--menu-pad) !important;box-sizing:border-box}
.soft-menu [data-menu-item],.soft-menu .soft-menu-row{min-height:var(--menu-row-h);border-radius:var(--btn-radius) !important;box-sizing:border-box}
.soft-menu [data-menu-item]:hover,.soft-menu .soft-menu-row:hover,.soft-menu [data-menu-item]:focus-visible{background:var(--btn-hover) !important}
.soft-menu [data-menu-item][data-soft-on="1"]{background:var(--btn-selected) !important;color:var(--btn-selected-fg) !important}
.soft-menu hr,.soft-menu .soft-menu-sep{background:var(--sep) !important;border:0 !important}

/* --- legend scrim: readable over candles --- */
.tvl-row:not(:hover):not(.tvl-menu-open){background:var(--legend-scrim) !important}

/* --- dialogs --- */
.soft-dialog{border-radius:var(--dialog-radius) !important;border:var(--dialog-border) !important;box-shadow:var(--dialog-shadow) !important}
.tv-indicator-row{border-radius:var(--dialog-item-radius);margin:0 8px}
.tv-indicator-dialog{background:var(--dialog-bg) !important;backdrop-filter:blur(6px)}
.soft-overlay{background:var(--overlay) !important}
`;
}

/** Injects the stylesheet once and mirrors the theme onto <html data-soft-theme>. Safe to call repeatedly. */
export function ensureSoftTheme(theme?: SoftTheme): void {
    if (typeof document === 'undefined') return;
    if (!document.getElementById(STYLE_ID)) {
        const st = document.createElement('style');
        st.id = STYLE_ID;
        st.textContent = css();
        // first in <head>: host-page rules of equal specificity can still override, and ours use !important where inline styles exist
        document.head.insertBefore(st, document.head.firstChild);
    }
    if (!theme) {
        let saved: string | null = null;
        try { saved = localStorage.getItem('tv-chart-theme'); } catch { /* storage unavailable */ }
        theme = saved === 'light' ? 'light' : 'dark';
    }
    document.documentElement.dataset.softTheme = theme;
}

ensureSoftTheme();
