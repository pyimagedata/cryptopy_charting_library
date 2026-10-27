/**
 * Context Menu - TradingView-style right-click menu
 */

import { ATTR_BAR_STYLE, barColors, BarTheme } from '../attribute_bar/components/style';

export interface ContextMenuItem {
    id: string;
    label: string;
    icon?: string;  // SVG path or empty
    shortcut?: string;  // Keyboard shortcut like "⌥ R"
    action?: () => void;
    separator?: boolean;
    submenu?: boolean;
    /** Alt menu ogeleri (submenu: true ile birlikte; fare uzerine gelince yan acilir) */
    children?: ContextMenuItem[];
    disabled?: boolean;
}

export interface ContextMenuOptions {
    items: ContextMenuItem[];
    container?: HTMLElement;  // Optional container (default: document.body)
    theme?: BarTheme;  // default 'light'; ChartWidget sets it from the chart theme
}

// SVG Icons (TradingView style - outline)
const ICONS = {
    reset: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M3 9a6 6 0 1 1 1.5 4" stroke-linecap="round"/>
        <path d="M3 5v4h4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    copy: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="6" y="6" width="9" height="9" rx="1"/>
        <path d="M3 12V4a1 1 0 0 1 1-1h8"/>
    </svg>`,
    screenshot: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="2" y="4" width="14" height="10" rx="1"/>
        <circle cx="9" cy="9" r="2.5"/>
        <circle cx="13" cy="6" r="0.5" fill="currentColor"/>
    </svg>`,
    fullscreen: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M3 7V4a1 1 0 0 1 1-1h3M11 3h3a1 1 0 0 1 1 1v3M15 11v3a1 1 0 0 1-1 1h-3M7 15H4a1 1 0 0 1-1-1v-3"/>
    </svg>`,
    settings: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="9" cy="9" r="2"/>
        <path d="M9 2v2M9 14v2M2 9h2M14 9h2M4.2 4.2l1.4 1.4M12.4 12.4l1.4 1.4M4.2 13.8l1.4-1.4M12.4 5.6l1.4-1.4"/>
    </svg>`,
    chevron: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M4 2l4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
};

/**
 * TradingView-style context menu
 */
export class ContextMenu {
    private _element: HTMLElement | null = null;
    private _items: ContextMenuItem[] = [];
    private _visible: boolean = false;
    private _onClickOutside: (e: MouseEvent) => void;
    private _onKeyDown: (e: KeyboardEvent) => void;
    private _onScroll: () => void;
    private _listenerTimer: ReturnType<typeof setTimeout> | null = null;
    private _currentPrice: number = 0;

    private _container: HTMLElement;
    private _theme: BarTheme = 'light';

    constructor(options: ContextMenuOptions) {
        this._items = options.items;
        this._theme = options.theme === 'dark' ? 'dark' : 'light';
        this._container = options.container || document.body;
        this._onClickOutside = this._handleClickOutside.bind(this);
        this._onKeyDown = this._handleKeyDown.bind(this);
        this._onScroll = () => this.hide();
        this._createElement();
    }

    private _createElement(): void {
        this._element = document.createElement('div');
        this._element.className = 'chart-context-menu';
        this._applyElementStyle();
        this._renderItems();
        this._container.appendChild(this._element);
    }

    private _applyElementStyle(): void {
        if (!this._element) return;
        const m = ATTR_BAR_STYLE.metrics;
        const c = barColors(this._theme);
        const display = this._element.style.display || 'none';
        const left = this._element.style.left;
        const top = this._element.style.top;
        this._element.style.cssText = `
            position: fixed;
            background: ${c.popupBg};
            border: 1px solid ${c.popupBorder};
            border-radius: ${m.popupRadius}px;
            box-shadow: ${c.popupShadow};
            min-width: 240px;
            z-index: 10000;
            display: ${display};
            font-family: ${m.fontFamily};
            font-size: ${m.popupFontSize}px;
            padding: ${m.popupVPad}px 0;
            user-select: none;
            color: ${c.popupText};
        `;
        if (left) this._element.style.left = left;
        if (top) this._element.style.top = top;
    }

    /** Dark / light look (follows the chart theme) */
    setTheme(theme: BarTheme): void {
        if (this._theme === theme) return;
        this._theme = theme;
        this._applyElementStyle();
        this._renderItems();
    }

    /**
     * Move context menu to a different container (for fullscreen support)
     */
    setContainer(container: HTMLElement): void {
        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
        this._container = container;
        if (this._element) {
            this._container.appendChild(this._element);
        }
    }

    private _renderItems(): void {
        if (!this._element) return;
        this._element.innerHTML = '';
        const m = ATTR_BAR_STYLE.metrics;
        const colors = barColors(this._theme);

        this._items.forEach((item) => {
            if (item.separator) {
                const separator = document.createElement('div');
                separator.style.cssText = `
                    height: 1px;
                    background: ${colors.popupSeparator};
                    margin: ${ATTR_BAR_STYLE.metrics.popupSeparatorMargin}px 0;
                `;
                this._element!.appendChild(separator);
                return;
            }

            const menuItem = document.createElement('div');
            menuItem.className = 'chart-context-menu-item';
            menuItem.dataset.id = item.id;
            menuItem.style.cssText = `
                box-sizing: border-box;
                height: ${m.popupItemHeight}px;
                padding: 0 ${m.popupPadX}px;
                cursor: ${item.disabled ? 'default' : 'pointer'};
                display: flex;
                align-items: center;
                gap: 10px;
                color: ${item.disabled ? colors.popupDisabledText : colors.popupText};
                transition: background 0.1s;
                white-space: nowrap;
            `;

            // Icon
            const iconSpan = document.createElement('span');
            iconSpan.style.cssText = `
                width: 20px;
                height: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: ${colors.popupHint};
            `;
            iconSpan.innerHTML = item.icon || '';
            menuItem.appendChild(iconSpan);

            // Label
            const labelSpan = document.createElement('span');
            labelSpan.style.cssText = `flex: 1;`;
            labelSpan.textContent = item.label;
            menuItem.appendChild(labelSpan);

            // Shortcut or submenu arrow
            if (item.shortcut) {
                const shortcutSpan = document.createElement('span');
                shortcutSpan.style.cssText = `
                    color: ${colors.popupHint};
                    font-size: ${m.popupHintFontSize}px;
                    margin-left: 16px;
                `;
                shortcutSpan.textContent = item.shortcut;
                menuItem.appendChild(shortcutSpan);
            } else if (item.submenu) {
                const arrowSpan = document.createElement('span');
                arrowSpan.style.cssText = `color: ${colors.popupHint}; display: flex;`;
                arrowSpan.innerHTML = ICONS.chevron;
                menuItem.appendChild(arrowSpan);
            }

            if (item.children && item.children.length > 0 && !item.disabled) {
                this._attachFlyout(menuItem, item.children);
            }

            if (!item.disabled) {
                menuItem.addEventListener('mouseenter', () => {
                    menuItem.style.background = colors.popupHoverBg;
                });

                menuItem.addEventListener('mouseleave', () => {
                    menuItem.style.background = 'transparent';
                });

                menuItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Alt menusu olan ogede tiklama menuyu kapatmaz (yan menu acik kalir)
                    if (item.children && item.children.length > 0) return;
                    if (item.action) {
                        item.action();
                    }
                    this.hide();
                });
            }

            this._element!.appendChild(menuItem);
        });
    }

    /** Hover'da yana acilan alt menu (sagda yer yoksa sola acilir) */
    private _attachFlyout(parent: HTMLElement, children: ContextMenuItem[]): void {
        parent.style.position = 'relative';
        const m = ATTR_BAR_STYLE.metrics;
        const colors = barColors(this._theme);
        const fly = document.createElement('div');
        fly.className = 'chart-context-submenu';
        fly.style.cssText = `
            position: absolute;
            top: -5px;
            left: 100%;
            background: ${colors.popupBg};
            border: 1px solid ${colors.popupBorder};
            border-radius: ${m.popupRadius}px;
            box-shadow: ${colors.popupShadow};
            min-width: 220px;
            padding: ${m.popupVPad}px 0;
            display: none;
            white-space: nowrap;
        `;
        for (const child of children) {
            const row = document.createElement('div');
            row.dataset.id = child.id;
            row.style.cssText = `box-sizing: border-box; height: ${m.popupItemHeight}px; display: flex; align-items: center; padding: 0 ${m.popupPadX}px; cursor: ${child.disabled ? 'default' : 'pointer'}; color: ${child.disabled ? colors.popupDisabledText : colors.popupText};`;
            row.textContent = child.label;
            if (!child.disabled) {
                row.addEventListener('mouseenter', () => { row.style.background = colors.popupHoverBg; });
                row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
                row.addEventListener('click', (e) => {
                    e.stopPropagation();
                    child.action?.();
                    this.hide();
                });
            }
            fly.appendChild(row);
        }
        parent.appendChild(fly);
        parent.addEventListener('mouseenter', () => {
            fly.style.display = 'block';
            fly.style.left = '100%';
            fly.style.right = 'auto';
            const r = fly.getBoundingClientRect();
            if (r.right > window.innerWidth) {
                fly.style.left = 'auto';
                fly.style.right = '100%';
            }
            // Alt kenardan tasarsa yukari kaydir
            fly.style.top = `${-m.popupVPad - 1}px`;
            const b = fly.getBoundingClientRect();
            if (b.bottom > window.innerHeight) {
                fly.style.top = `${-m.popupVPad - 1 - Math.min(b.bottom - window.innerHeight + 4, Math.max(0, b.top))}px`;
            }
        });
        parent.addEventListener('mouseleave', () => { fly.style.display = 'none'; });
    }

    /** Replace the item list (used for context-dependent menus, e.g. drawing menu) */
    setItems(items: ContextMenuItem[]): void {
        this._items = items;
        this._renderItems();
    }

    setCurrentPrice(price: number): void {
        this._currentPrice = price;
        // Update copy price label dynamically
        const copyItem = this._items.find(i => i.id === 'copy-price');
        if (copyItem) {
            copyItem.label = `Copy price ${price.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
            this._renderItems();
        }
    }

    show(x: number, y: number): void {
        if (!this._element) return;

        // Position the menu
        this._element.style.left = `${x}px`;
        this._element.style.top = `${y}px`;
        this._element.style.display = 'block';

        // Adjust if menu goes off-screen
        const rect = this._element.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (rect.right > viewportWidth) {
            this._element.style.left = `${x - rect.width}px`;
        }

        if (rect.bottom > viewportHeight) {
            this._element.style.top = `${y - rect.height}px`;
        }

        this._visible = true;

        // Add listeners to close menu
        if (this._listenerTimer !== null) clearTimeout(this._listenerTimer);
        this._listenerTimer = setTimeout(() => {
            this._listenerTimer = null;
            document.addEventListener('click', this._onClickOutside);
            document.addEventListener('keydown', this._onKeyDown);
            window.addEventListener('wheel', this._onScroll, { passive: true, capture: true });
            window.addEventListener('scroll', this._onScroll, true);
        }, 0);
    }

    /** Opens the menu below an anchor rect (flips above / aligns right edge when it would overflow the viewport) */
    showAnchored(anchor: DOMRect, gap: number = 4): void {
        if (!this._element) return;
        this.show(anchor.left, anchor.bottom + gap);
        const el = this._element;
        const r = el.getBoundingClientRect();
        let left = anchor.left;
        let top = anchor.bottom + gap;
        if (left + r.width > window.innerWidth) left = anchor.right - r.width;
        if (top + r.height > window.innerHeight) top = anchor.top - gap - r.height;
        el.style.left = `${Math.max(0, left)}px`;
        el.style.top = `${Math.max(0, top)}px`;
    }

    hide(): void {
        if (!this._element) return;

        this._element.style.display = 'none';
        this._visible = false;

        if (this._listenerTimer !== null) {
            clearTimeout(this._listenerTimer);
            this._listenerTimer = null;
        }
        document.removeEventListener('click', this._onClickOutside);
        document.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('wheel', this._onScroll, true);
        window.removeEventListener('scroll', this._onScroll, true);
    }

    isVisible(): boolean {
        return this._visible;
    }

    private _handleClickOutside(e: MouseEvent): void {
        if (this._element && !this._element.contains(e.target as Node)) {
            this.hide();
        }
    }

    private _handleKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            this.hide();
        }
    }

    dispose(): void {
        this.hide();
        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
        this._element = null;
    }
}

// Export icons for use in ChartWidget
export { ICONS };
