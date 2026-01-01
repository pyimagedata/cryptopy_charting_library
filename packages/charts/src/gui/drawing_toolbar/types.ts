/**
 * Drawing Toolbar Types
 * 
 * Type definitions for toolbar tools and groups.
 */

export type DrawingTool = string;

export interface ToolItem {
    id: string;
    name: string;
    icon: string;
    shortcut?: string;
    favorite?: boolean;
}

export interface ToolGroup {
    id: string;
    name: string;
    defaultIcon: string;
    display?: 'list' | 'grid';
    columns?: number;
    tools: ToolItem[];
}
