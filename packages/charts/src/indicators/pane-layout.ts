/**
 * Indicator sub-pane layout (pure logic, no DOM): order, separator drag,
 * maximize / collapse and the "hidden on this timeframe" decision.
 * Sizes and colours live in PANE_STYLE.
 */

export const MAIN_PANE_ID = 'main';

export const PANE_STYLE = {
    metrics: {
        /** Smallest height of an expanded sub-pane */
        minHeight: 50,
        /** Smallest height of the main pane while dragging separators */
        minMainHeight: 120,
        /** Collapsed pane: just the legend row (6px top + 24px row + 2px) */
        collapsedHeight: 32,
        /** Separator hit zone (the visible line is 1px in the middle) */
        separatorZone: 7,
        buttonSize: 24,
        iconSize: 18,
        /** Distance of the controls from the price scale */
        controlsRight: 6,
        controlsTop: 6,
        radius: 4,
    },
    dark: {
        separator: '#2A2E39',
        separatorHover: '#434651',
        zoneHover: 'rgba(120, 123, 134, 0.25)',
        controlsBg: 'rgba(26, 26, 46, 0.85)',
        icon: '#B2B5BE',
        iconHover: '#FFFFFF',
        buttonHover: '#2A2E39',
        disabled: 'rgba(120, 123, 134, 0.4)',
    },
    light: {
        separator: '#E0E3EB',
        separatorHover: '#B2B5BE',
        zoneHover: 'rgba(120, 123, 134, 0.18)',
        controlsBg: 'rgba(255, 255, 255, 0.85)',
        icon: '#6A6D78',
        iconHover: '#131722',
        buttonHover: '#F0F3FA',
        disabled: 'rgba(120, 123, 134, 0.4)',
    },
} as const;

let separatorColorOverride: string | null = null;

/** User-chosen separator color (chart settings > Canvas). null = theme default. */
export function setPaneSeparatorOverride(color: string | null): void {
    separatorColorOverride = color;
}

export function getPaneSeparatorOverride(): string | null {
    return separatorColorOverride;
}

export function paneColors(theme: 'dark' | 'light') {
    const base = theme === 'light' ? PANE_STYLE.light : PANE_STYLE.dark;
    return separatorColorOverride ? { ...base, separator: separatorColorOverride } : base;
}

export type PaneAction = 'up' | 'down' | 'maximize' | 'collapse' | 'delete';

/** Persisted part of the pane layout (order is the indicator order itself) */
export interface PaneLayoutPersist {
    heights: Record<string, number>;
    collapsed: string[];
    maximized: string | null;
}

export function canMovePane(order: readonly string[], id: string, dir: 'up' | 'down'): boolean {
    const i = order.indexOf(id);
    if (i < 0) return false;
    return dir === 'up' ? i > 0 : i < order.length - 1;
}

/** New order with `id` moved one step; same array contents when it cannot move */
export function movePane(order: readonly string[], id: string, dir: 'up' | 'down'): string[] {
    const out = [...order];
    if (!canMovePane(order, id, dir)) return out;
    const i = out.indexOf(id);
    const j = dir === 'up' ? i - 1 : i + 1;
    [out[i], out[j]] = [out[j], out[i]];
    return out;
}

export function toggleCollapsed(collapsed: readonly string[], id: string): string[] {
    return collapsed.includes(id) ? collapsed.filter((x) => x !== id) : [...collapsed, id];
}

export function toggleMaximized(maximized: string | null, id: string): string | null {
    return maximized === id ? null : id;
}

/** A pane disappears while every indicator in it is outside its interval settings */
export function isPaneHiddenByInterval(indicators: ReadonlyArray<{ hiddenByInterval: boolean }>): boolean {
    return indicators.length > 0 && indicators.every((i) => i.hiddenByInterval);
}

/**
 * Separator drag: `delta` > 0 moves the line down (upper grows, lower shrinks).
 * The sum is kept; both sides respect their minimum.
 */
export function dragSeparator(
    upper: number, lower: number, delta: number, minUpper: number, minLower: number,
): [number, number] {
    const sum = upper + lower;
    let u = upper + delta;
    u = Math.min(u, sum - minLower);
    u = Math.max(u, minUpper);
    return [u, sum - u];
}

export interface PaneLayoutInput {
    id: string;
    /** User height (restored when expanded / un-maximized) */
    height: number;
    collapsed: boolean;
    hiddenByInterval: boolean;
}

export interface PaneLayoutResult {
    mainHeight: number;
    mainHidden: boolean;
    panes: Record<string, { hidden: boolean; collapsed: boolean; displayHeight: number; contentHeight: number }>;
}

/** Heights of the main pane and every sub-pane for the available chart height */
export function resolvePaneLayout(
    available: number,
    panes: readonly PaneLayoutInput[],
    maximized: string | null,
    metrics: { minHeight: number; minMainHeight: number; collapsedHeight: number } = PANE_STYLE.metrics,
): PaneLayoutResult {
    const result: PaneLayoutResult = { mainHeight: 0, mainHidden: false, panes: {} };
    const alive = (id: string) => panes.some((p) => p.id === id && !p.hiddenByInterval);
    const max = maximized === MAIN_PANE_ID || (maximized !== null && alive(maximized)) ? maximized : null;

    if (max !== null) {
        for (const p of panes) {
            const isMax = p.id === max;
            result.panes[p.id] = {
                hidden: !isMax, collapsed: false,
                displayHeight: isMax ? Math.max(0, available) : 0,
                contentHeight: isMax ? Math.max(0, available) : p.height,
            };
        }
        result.mainHidden = max !== MAIN_PANE_ID;
        result.mainHeight = max === MAIN_PANE_ID ? Math.max(0, available) : 0;
        return result;
    }

    const heights: Record<string, number> = {};
    for (const p of panes) {
        if (p.hiddenByInterval) heights[p.id] = 0;
        else heights[p.id] = p.collapsed ? metrics.collapsedHeight : Math.max(metrics.minHeight, p.height);
    }
    let sum = panes.reduce((s, p) => s + heights[p.id], 0);
    // Keep room for the main pane: shrink expanded panes from the bottom up
    let deficit = sum + metrics.minMainHeight - available;
    for (let i = panes.length - 1; i >= 0 && deficit > 0; i--) {
        const p = panes[i];
        if (p.hiddenByInterval || p.collapsed) continue;
        const room = heights[p.id] - metrics.minHeight;
        const cut = Math.min(room, deficit);
        if (cut > 0) { heights[p.id] -= cut; deficit -= cut; }
    }
    sum = panes.reduce((s, p) => s + heights[p.id], 0);
    for (const p of panes) {
        result.panes[p.id] = {
            hidden: p.hiddenByInterval, collapsed: p.collapsed && !p.hiddenByInterval,
            displayHeight: heights[p.id],
            contentHeight: p.collapsed ? p.height : heights[p.id],
        };
    }
    result.mainHeight = Math.max(0, available - sum);
    return result;
}
