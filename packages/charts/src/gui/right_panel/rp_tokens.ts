/**
 * Shared design tokens + base stylesheet of the right panel area (soft, modern look).
 * RightPanelHost sets the tokens on its container; panels also set them on their own root so they render the same
 * when used standalone (outside the host) and in overlays appended elsewhere (dialogs, search).
 */

export type RpTheme = 'dark' | 'light';

export const RP_TOKENS: Record<RpTheme, Record<string, string>> = {
    dark: {
        bg: '#1a1a2e', surface: '#212139', border: 'rgba(255,255,255,.08)', text: '#e6e8ee', muted: '#787b86', hover: 'rgba(255,255,255,.07)',
        chip: 'rgba(255,255,255,.1)', accent: '#2962ff', glow: 'rgba(120,140,200,.08)', up: '#089981', down: '#f23645',
    },
    light: {
        bg: '#ffffff', surface: '#f4f5f8', border: 'rgba(0,0,0,.09)', text: '#131722', muted: '#6a6d78', hover: 'rgba(0,0,0,.05)',
        chip: 'rgba(0,0,0,.07)', accent: '#2962ff', glow: 'rgba(41,98,255,.05)', up: '#089981', down: '#f23645',
    },
};

/** Sets the --rp-* custom properties (+ data-theme) on an element. */
export function applyRpTokens(el: HTMLElement, theme: RpTheme): void {
    const tk = RP_TOKENS[theme === 'light' ? 'light' : 'dark'];
    for (const k of Object.keys(tk)) el.style.setProperty(`--rp-${k}`, tk[k]);
    el.style.setProperty('--rp-r-lg', '12px');
    el.style.setProperty('--rp-r-md', '10px');
    el.style.setProperty('--rp-r-sm', '8px');
    el.dataset.theme = theme === 'light' ? 'light' : 'dark';
}

/** Token reference with a dark fallback, e.g. `v('muted')` -> `var(--rp-muted,#787b86)`. */
export function v(name: string): string {
    return `var(--rp-${name},${RP_TOKENS.dark[name]})`;
}

/** Soft look for ContextMenu (menus are appended outside the panel root, so concrete colours). */
export const RP_MENU_SKIN = {
    bg: { dark: '#23233b', light: '#ffffff' },
    border: { dark: 'transparent', light: 'transparent' },
    radius: 6,
    shadow: { dark: '0 2px 6px rgba(0,0,0,.45)', light: '0 2px 6px rgba(0,0,0,.18)' },
};

/** Font stacks: host page defines --rp-font-sans / --rp-font-mono (e.g. via @font-face); system fallbacks otherwise. */
export const RP_FONT = "var(--rp-font-sans, -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif)";
export const RP_FONT_MONO = "var(--rp-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)";

export const RP_CLOSE_SVG = '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/></svg>';

export const RP_SEARCH_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>';

/** Empty-state block: 44px chip circle with a muted icon, title and subtitle (textContent only). */
export function rpEmptyState(svg: string, title: string, subtitle?: string, cls = ''): HTMLElement {
    const box = document.createElement('div');
    box.className = `rp-empty ${cls}`.trim();
    const ic = document.createElement('div');
    ic.className = 'rp-empty-ic';
    ic.innerHTML = svg; // constant icon markup only
    const tt = document.createElement('div');
    tt.className = 'rp-empty-t';
    tt.textContent = title;
    box.append(ic, tt);
    if (subtitle) {
        const s = document.createElement('div');
        s.className = 'rp-empty-s';
        s.textContent = subtitle;
        box.appendChild(s);
    }
    return box;
}

const STYLE_ID = 'rp-base-style';
export function ensureRpStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    const d = RP_TOKENS.dark;
    st.textContent = `
.rp-root{color:var(--rp-text,${d.text});font-family:${RP_FONT}}
.rp-root *{scrollbar-width:thin;scrollbar-color:var(--rp-border,${d.border}) transparent}
.rp-root ::-webkit-scrollbar{width:6px;height:6px}
.rp-root ::-webkit-scrollbar-thumb{background:var(--rp-border,${d.border});border-radius:3px}
.rp-root ::-webkit-scrollbar-thumb:hover{background:var(--rp-muted,${d.muted})}
.rp-root ::-webkit-scrollbar-track{background:transparent}
.rp-root button:focus-visible,.rp-root [tabindex]:focus-visible{outline:2px solid var(--rp-accent,${d.accent});outline-offset:1px}
.rp-hdr{display:flex;align-items:center;justify-content:space-between;height:48px;padding:0 10px 0 16px;flex-shrink:0;gap:4px;box-sizing:border-box}
.rp-title{font-size:16px;font-weight:500;letter-spacing:-.01em;color:var(--rp-text,${d.text});white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rp-acts{display:flex;gap:2px;flex-shrink:0;align-items:center}
.rp-ib{position:relative;width:30px;height:30px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--rp-muted,${d.muted});display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .12s,color .12s;font:inherit}
.rp-ib:hover:not(:disabled){background:var(--rp-hover,${d.hover});color:var(--rp-text,${d.text})}
.rp-ib:disabled{opacity:.4;cursor:default}
.rp-search{position:relative;display:flex;align-items:center;margin:0 12px 8px;flex-shrink:0}
.rp-search>svg{position:absolute;left:11px;color:var(--rp-muted,${d.muted});pointer-events:none}
.rp-search>input{width:100%;box-sizing:border-box;height:36px;padding:0 12px 0 34px;border-radius:var(--rp-r-md,12px);border:1px solid var(--rp-border,${d.border});background:var(--rp-surface,${d.surface});color:var(--rp-text,${d.text});font:inherit;font-size:13px;font-weight:400;outline:0;user-select:text;transition:border-color .12s}
.rp-search>input:focus{border-color:var(--rp-muted,${d.muted})}
.rp-search>input::placeholder{color:var(--rp-muted,${d.muted});opacity:.85}
.rp-pill{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;padding:0 12px;border-radius:999px;border:1px solid var(--rp-border,${d.border});background:transparent;color:var(--rp-muted,${d.muted});font:inherit;font-size:12.5px;font-weight:450;cursor:pointer;white-space:nowrap;transition:background .12s,color .12s}
.rp-pill:hover:not(:disabled){background:var(--rp-hover,${d.hover});color:var(--rp-text,${d.text})}
.rp-pill[data-on="1"]{background:var(--rp-chip,${d.chip});color:var(--rp-text,${d.text})}
.rp-pill:disabled{opacity:.4;cursor:default}
.rp-pill.rp-danger,.rp-pill.rp-danger:hover:not(:disabled){color:var(--rp-down,${d.down})}
.rp-label{padding:10px 16px 4px;font-family:${RP_FONT_MONO};font-size:10.5px;font-weight:400;text-transform:uppercase;letter-spacing:.06em;color:var(--rp-muted,${d.muted})}
.rp-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;padding:36px 24px;color:var(--rp-muted,${d.muted})}
.rp-empty-ic{width:44px;height:44px;border-radius:50%;background:var(--rp-chip,${d.chip});color:var(--rp-muted,${d.muted});display:flex;align-items:center;justify-content:center;margin-bottom:6px}
.rp-empty-t{font-size:15px;font-weight:500;color:var(--rp-text,${d.text})}
.rp-empty-s{font-size:12.5px;font-weight:400;color:var(--rp-muted,${d.muted});line-height:1.45}
.rp-num{font-family:${RP_FONT_MONO};font-variant-numeric:tabular-nums}
@media (prefers-reduced-motion:reduce){.rp-root *{transition:none !important;animation:none !important}}
`;
    document.head.appendChild(st);
}
