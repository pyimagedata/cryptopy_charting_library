/**
 * Indicator legend icons: thin currentColor outlines, 18x18 (same style as the
 * drawing toolbar icons).
 */

/** Thin cog: same outline as the attribute bar settings icon (28 grid, scaled to 18) */
const COG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M22.00 11.79L24.05 12.27L24.05 15.73L22.00 16.21L21.22 18.09L22.33 19.89L19.89 22.33L18.09 21.22L16.21 22.00L15.73 24.05L12.27 24.05L11.79 22.00L9.91 21.22L8.11 22.33L5.67 19.89L6.78 18.09L6.00 16.21L3.95 15.73L3.95 12.27L6.00 11.79L6.78 9.91L5.67 8.11L8.11 5.67L9.91 6.78L11.79 6.00L12.27 3.95L15.73 3.95L16.21 6.00L18.09 6.78L19.89 5.67L22.33 8.11L21.22 9.91Z"/><circle cx="14" cy="14" r="3.4"/></svg>`;

const svg = (body: string, size = 18) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const LEGEND_ICONS = {
    eye: svg('<path d="M1.5 9s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5Z"/><circle cx="9" cy="9" r="2.3"/>'),
    eyeOff: svg('<path d="M1.5 9s2.7-5 7.5-5c1.1 0 2.1.3 3 .7M16.5 9s-2.7 5-7.5 5c-1.1 0-2.1-.3-3-.7"/><path d="M7.6 7.6a2.3 2.3 0 0 0 2.8 2.8"/><path d="M3 15 15 3"/>'),
    settings: COG,
    remove: svg('<path d="m5 5 8 8M13 5l-8 8"/>'),
    more: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18" fill="currentColor"><circle cx="4" cy="9" r="1.3"/><circle cx="9" cy="9" r="1.3"/><circle cx="14" cy="9" r="1.3"/></svg>`,
    chevronDown: svg('<path d="m5 7.5 4 4 4-4"/>'),
    chevronUp: svg('<path d="m5 10.5 4-4 4 4"/>'),
    clone: svg('<rect x="6" y="6" width="9" height="9" rx="1"/><path d="M3 12V4a1 1 0 0 1 1-1h8"/>'),
} as const;
