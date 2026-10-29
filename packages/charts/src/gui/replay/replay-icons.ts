/**
 * Bar replay icons: inline SVG, currentColor outlines, 1.5px stroke (same style as the toolbar icons).
 */

const svg = (body: string, size = 18) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const REPLAY_ICONS = {
    /** Top toolbar button: rewind glyph */
    replay: svg('<path d="M8.5 4.5 3 9l5.5 4.5v-9Z"/><path d="M15 4.5 9.5 9l5.5 4.5v-9Z"/>'),
    scissors: svg('<circle cx="5" cy="13.2" r="2.1"/><circle cx="13" cy="13.2" r="2.1"/><path d="M6.4 11.5 13.6 3M11.6 11.5 4.4 3"/>'),
    play: svg('<path d="M5.5 3.5v11l9-5.5-9-5.5Z"/>'),
    pause: svg('<path d="M6 3.5v11M12 3.5v11" stroke-width="2"/>'),
    stepForward: svg('<path d="M4.5 3.5v11l8-5.5-8-5.5Z"/><path d="M14.5 3.5v11"/>'),
    jumpRealtime: svg('<path d="M2.5 4v10l6-5-6-5Z"/><path d="M9 4v10l6-5-6-5Z"/><path d="M16 3.5v11"/>'),
    close: svg('<path d="m5 5 8 8M13 5l-8 8"/>'),
    chevronDown: svg('<path d="m5 7.5 4 4 4-4"/>', 12),
    check: svg('<path d="m4 9.5 3.5 3.5L14 5.5"/>', 14),
    grip: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 18" width="10" height="18" fill="currentColor" aria-hidden="true"><circle cx="3" cy="4" r="1.1"/><circle cx="7" cy="4" r="1.1"/><circle cx="3" cy="9" r="1.1"/><circle cx="7" cy="9" r="1.1"/><circle cx="3" cy="14" r="1.1"/><circle cx="7" cy="14" r="1.1"/></svg>`,
    calendar: svg('<rect x="2.5" y="3.5" width="13" height="12" rx="1.5"/><path d="M2.5 7.5h13M6 2v3M12 2v3"/>'),
    shuffle: svg('<path d="M2.5 5h2.5c3 0 4 8 7 8h3M2.5 13H5c1 0 1.8-.9 2.5-2M12 5h3M15.5 5 13.5 3M15.5 5l-2 2M15.5 13l-2-2M15.5 13l-2 2"/>'),
    first: svg('<path d="M3.5 3.5v11"/><path d="M14.5 3.5v11l-8-5.5 8-5.5Z"/>'),
} as const;
