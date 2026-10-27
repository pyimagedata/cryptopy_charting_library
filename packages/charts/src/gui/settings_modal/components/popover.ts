/**
 * Ortak acilir-pencere (popover) yardimcilari: renk paleti ve cizgi menusu icin.
 * Ayni anda tek popover acik kalir; tam ekranda popover tam ekran elemanina eklenir.
 */

let closeCurrent: (() => void) | null = null;

/** Popover'in eklenecegi kap: tam ekranda fullscreenElement (aksi halde top-layer'in arkasinda kalir), yoksa body. */
export function getPopoverHost(): HTMLElement {
    const fs = document.fullscreenElement;
    return fs instanceof HTMLElement ? fs : document.body;
}

/** Yeni popover acilirken cagrilir: acik olan baska popover'i kapatir, yenisini kaydeder. */
export function registerOpenPopover(close: () => void): void {
    const prev = closeCurrent;
    closeCurrent = null;
    prev?.();
    closeCurrent = close;
}

/** Popover kapandiginda kaydi temizler (baska bir popover kayitliysa dokunmaz). */
export function unregisterOpenPopover(close: () => void): void {
    if (closeCurrent === close) closeCurrent = null;
}

/** Acik popover varsa kapatir. */
export function closeOpenPopover(): void {
    const c = closeCurrent;
    closeCurrent = null;
    c?.();
}

const THEME_DEFAULTS: Record<string, string> = {
    '--modal-bg': '#1e222d',
    '--text-primary': '#d1d4dc',
    '--text-secondary': '#787b86',
    '--border-color': '#363a45',
    '--hover-bg': '#2a2e39',
    '--shadow': '0 8px 32px rgba(0, 0, 0, 0.4)',
    '--input-bg': '#131722',
};

/**
 * Tema degiskenlerini (--modal-bg vb.) kaynak elemandan popover'a kopyalar. Kaynakta tanimsizsa
 * :root degerine, o da yoksa varsayilana duser; popover asla seffaf kalmaz.
 */
export function copyThemeVars(target: HTMLElement, source: HTMLElement, vars: string[]): void {
    const cs = getComputedStyle(source);
    const rootCs = getComputedStyle(document.documentElement);
    for (const v of vars) {
        const val = cs.getPropertyValue(v).trim() || rootCs.getPropertyValue(v).trim() || THEME_DEFAULTS[v];
        if (val) target.style.setProperty(v, val);
    }
}
