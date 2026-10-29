/**
 * SVG Icons for Attribute Bar
 * 28x28 grid, currentColor, thin (1px class) strokes - same look as the drawing toolbar icons.
 */

const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round">';

export const ICONS = {
    drag: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="28" viewBox="0 0 20 28" fill="currentColor">
        <circle cx="7.5" cy="9.5" r="1.1"/><circle cx="12.5" cy="9.5" r="1.1"/>
        <circle cx="7.5" cy="14" r="1.1"/><circle cx="12.5" cy="14" r="1.1"/>
        <circle cx="7.5" cy="18.5" r="1.1"/><circle cx="12.5" cy="18.5" r="1.1"/>
    </svg>`,

    // Line colour: pencil
    pencil: `${SVG_OPEN}
        <path d="M7.5 20.5l.9-3.7L17.9 7.3a1.7 1.7 0 0 1 2.4 0l.4.4a1.7 1.7 0 0 1 0 2.4L11.2 19.6l-3.7.9z"/>
        <path d="M16.4 8.8l2.8 2.8"/>
    </svg>`,

    // Line width (generic list icon, not used on the bar itself)
    lineStyle: `${SVG_OPEN}
        <path d="M6 9h16M6 14h16M6 19h16"/>
    </svg>`,

    lineDash: `${SVG_OPEN}
        <path d="M5 14h4M12 14h4M19 14h4"/>
    </svg>`,

    lineSolid: `${SVG_OPEN}
        <path d="M5 14h18"/>
    </svg>`,

    lineDashed: `${SVG_OPEN}
        <path d="M5 14h4.5M12 14h4.5M19 14h4"/>
    </svg>`,

    lineDotted: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="currentColor">
        <circle cx="5.5" cy="14" r="1.1"/><circle cx="9.5" cy="14" r="1.1"/><circle cx="13.5" cy="14" r="1.1"/>
        <circle cx="17.5" cy="14" r="1.1"/><circle cx="21.5" cy="14" r="1.1"/>
    </svg>`,

    // Settings: cog
    settings: `${SVG_OPEN}
        <path d="M22.00 11.79L24.05 12.27L24.05 15.73L22.00 16.21L21.22 18.09L22.33 19.89L19.89 22.33L18.09 21.22L16.21 22.00L15.73 24.05L12.27 24.05L11.79 22.00L9.91 21.22L8.11 22.33L5.67 19.89L6.78 18.09L6.00 16.21L3.95 15.73L3.95 12.27L6.00 11.79L6.78 9.91L5.67 8.11L8.11 5.67L9.91 6.78L11.79 6.00L12.27 3.95L15.73 3.95L16.21 6.00L18.09 6.78L19.89 5.67L22.33 8.11L21.22 9.91Z"/>
        <circle cx="14" cy="14" r="3.4"/>
    </svg>`,

    lock: `${SVG_OPEN}
        <rect x="7.5" y="13" width="13" height="9" rx="1.5"/>
        <path d="M10.5 13V10a3.5 3.5 0 0 1 7 0v3"/>
        <path d="M14 16.5v2"/>
    </svg>`,

    // Alert bell (drawing alerts)
    bell: `${SVG_OPEN}
        <path d="M14 7a5 5 0 0 0-5 5c0 4-2 6-2 6h14s-2-2-2-6a5 5 0 0 0-5-5z"/>
        <path d="M12.3 21.5a1.9 1.9 0 0 0 3.4 0"/>
    </svg>`,

    lockOpen: `${SVG_OPEN}
        <rect x="7.5" y="13" width="13" height="9" rx="1.5"/>
        <path d="M10.5 13V9.5a3.5 3.5 0 0 1 6.8-1.2"/>
        <path d="M14 16.5v2"/>
    </svg>`,

    delete: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="currentColor">
        <path fill-rule="evenodd" d="M18 7h5v1h-2.01l-1.33 14.64a1.5 1.5 0 0 1-1.5 1.36H9.84a1.5 1.5 0 0 1-1.49-1.36L7.01 8H5V7h5V6c0-1.1.9-2 2-2h4a2 2 0 0 1 2 2v1Zm-6-2a1 1 0 0 0-1 1v1h6V6a1 1 0 0 0-1-1h-4ZM8.02 8l1.32 14.54a.5.5 0 0 0 .5.46h8.33a.5.5 0 0 0 .5-.46L19.99 8H8.02Z"/>
    </svg>`,

    clone: `${SVG_OPEN}
        <rect x="11" y="11" width="11" height="11" rx="1.5"/>
        <path d="M17 11V7.5A1.5 1.5 0 0 0 15.5 6h-8A1.5 1.5 0 0 0 6 7.5v8A1.5 1.5 0 0 0 7.5 17H11"/>
    </svg>`,

    // More: three horizontal dots
    more: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="currentColor">
        <circle cx="7.5" cy="14" r="1.6"/><circle cx="14" cy="14" r="1.6"/><circle cx="20.5" cy="14" r="1.6"/>
    </svg>`,

    // Template: layout glyph
    template: `${SVG_OPEN}
        <rect x="6.5" y="6.5" width="15" height="15" rx="1.5"/>
        <path d="M12.5 6.5v15M12.5 12.5h9"/>
    </svg>`,

    // Fill / background colour: paint bucket
    fillBucket: `${SVG_OPEN}
        <path d="M6.6 14.4L13 8l6.6 6.6-5.6 5.6a1.7 1.7 0 0 1-2.4 0l-5-5a1.7 1.7 0 0 1 0-2.4z"/>
        <path d="M13 8V5.8M6.8 15.2h12.6"/>
        <path d="M22.2 16.2s-1.9 2.2-1.9 3.4a1.9 1.9 0 0 0 3.8 0c0-1.2-1.9-3.4-1.9-3.4z" fill="currentColor"/>
    </svg>`,

    // Text colour: "A" glyph
    textColor: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="currentColor">
        <path fill-rule="evenodd" d="M14.6 6.5h-1.2L8 21h1.6l1.4-3.9h6l1.4 3.9H20L14.6 6.5zm-.6 2.6l2.3 6.6h-4.6L14 9.1z"/>
    </svg>`,

    chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5l3 3 3-3"/></svg>`,

    check: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.5l3 3 6-7"/></svg>`,
};
