/**
 * Indicator legend collapse state (pure logic, no DOM).
 * The expand/collapse choice is stored per chart in localStorage.
 */

import { LEGEND_STYLE } from './legend-constants';

export const LEGEND_COLLAPSE_KEY_PREFIX = 'chart.legend.collapsed.';

export interface LegendStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

function defaultStorage(): LegendStorage | null {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
        return null;
    }
}

export function legendCollapseKey(chartKey: string): string {
    return LEGEND_COLLAPSE_KEY_PREFIX + (chartKey || 'default');
}

export function readLegendCollapsed(chartKey: string, storage: LegendStorage | null = defaultStorage()): boolean {
    try {
        return storage?.getItem(legendCollapseKey(chartKey)) === '1';
    } catch {
        return false;
    }
}

export function writeLegendCollapsed(chartKey: string, collapsed: boolean, storage: LegendStorage | null = defaultStorage()): void {
    try {
        storage?.setItem(legendCollapseKey(chartKey), collapsed ? '1' : '0');
    } catch {
        // Storage unavailable: the choice still holds for this session.
    }
}

/** The collapse toggle only appears when there are many rows */
export function shouldShowCollapseToggle(rowCount: number): boolean {
    return rowCount > LEGEND_STYLE.collapseAfterRows;
}

/** Collapsed only counts while the toggle is shown (removing rows re-expands the list) */
export function isLegendCollapsed(rowCount: number, stored: boolean): boolean {
    return stored && shouldShowCollapseToggle(rowCount);
}

/** Text of the collapsed single line: "5 indicators" */
export function collapsedLegendLabel(rowCount: number, word: string): string {
    return `${rowCount} ${word}`;
}
