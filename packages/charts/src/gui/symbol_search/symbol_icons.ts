/** Static SVG icons for the symbol search dialog (no user data goes through here). */

const PATHS: Record<string, string> = {
    search: '<circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M17 17l5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    close: '<path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    back: '<path d="M14.5 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    chevron: '<path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    globe: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><ellipse cx="12" cy="12" rx="3.5" ry="8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 12h16" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    check: '<path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
};

/** 24x24 viewBox icon rendered at `size` px */
export function createIcon(name: keyof typeof PATHS, size: number): HTMLElement {
    const span = document.createElement('span');
    span.className = 'ss-icon';
    span.style.width = `${size}px`;
    span.style.height = `${size}px`;
    span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name]}</svg>`;
    return span;
}
