/**
 * Context Menu - TradingView-style right-click menu
 */

export interface ContextMenuItem {
    id: string;
    label: string;
    icon?: string;  // SVG path or empty
    shortcut?: string;  // Keyboard shortcut like "⌥ R"
    action?: () => void;
    separator?: boolean;
    submenu?: boolean;
    disabled?: boolean;
}

export interface ContextMenuOptions {
    items: ContextMenuItem[];
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
    private _currentPrice: number = 0;

    constructor(options: ContextMenuOptions) {
        this._items = options.items;
        this._onClickOutside = this._handleClickOutside.bind(this);
        this._onKeyDown = this._handleKeyDown.bind(this);
        this._createElement();
    }

    private _createElement(): void {
        this._element = document.createElement('div');
        this._element.className = 'chart-context-menu';
        this._element.style.cssText = `
            position: fixed;
            background: #ffffff;
            border: 1px solid #e0e3eb;
            border-radius: 6px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
            min-width: 240px;
            z-index: 10000;
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif;
            font-size: 13px;
            padding: 6px 0;
            user-select: none;
            color: #131722;
        `;

        this._renderItems();
        document.body.appendChild(this._element);
    }

    private _renderItems(): void {
        if (!this._element) return;
        this._element.innerHTML = '';

        this._items.forEach((item) => {
            if (item.separator) {
                const separator = document.createElement('div');
                separator.style.cssText = `
                    height: 1px;
                    background: #e0e3eb;
                    margin: 6px 0;
                `;
                this._element!.appendChild(separator);
                return;
            }

            const menuItem = document.createElement('div');
            menuItem.className = 'chart-context-menu-item';
            menuItem.dataset.id = item.id;
            menuItem.style.cssText = `
                padding: 8px 12px;
                cursor: ${item.disabled ? 'default' : 'pointer'};
                display: flex;
                align-items: center;
                gap: 10px;
                color: ${item.disabled ? '#b2b5be' : '#131722'};
                transition: background 0.1s;
                opacity: ${item.disabled ? '0.5' : '1'};
            `;

            // Icon
            const iconSpan = document.createElement('span');
            iconSpan.style.cssText = `
                width: 20px;
                height: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #787b86;
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
                    color: #787b86;
                    font-size: 12px;
                `;
                shortcutSpan.textContent = item.shortcut;
                menuItem.appendChild(shortcutSpan);
            } else if (item.submenu) {
                const arrowSpan = document.createElement('span');
                arrowSpan.style.cssText = `color: #787b86;`;
                arrowSpan.innerHTML = ICONS.chevron;
                menuItem.appendChild(arrowSpan);
            }

            if (!item.disabled) {
                menuItem.addEventListener('mouseenter', () => {
                    menuItem.style.background = '#f0f3fa';
                });

                menuItem.addEventListener('mouseleave', () => {
                    menuItem.style.background = 'transparent';
                });

                menuItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (item.action) {
                        item.action();
                    }
                    this.hide();
                });
            }

            this._element!.appendChild(menuItem);
        });
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
        setTimeout(() => {
            document.addEventListener('click', this._onClickOutside);
            document.addEventListener('keydown', this._onKeyDown);
        }, 0);
    }

    hide(): void {
        if (!this._element) return;

        this._element.style.display = 'none';
        this._visible = false;

        document.removeEventListener('click', this._onClickOutside);
        document.removeEventListener('keydown', this._onKeyDown);
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
