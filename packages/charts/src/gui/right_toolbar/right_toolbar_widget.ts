/**
 * Right widget bar: a narrow vertical column of icon buttons on the far right of the chart layout.
 * Each item opens / closes a docked side panel (the owner decides what a click does); the bar only
 * renders items, the active highlight and numeric badges. Hosts may register extra items via `addItem`.
 */
import { Delegate } from '../../helpers/delegate';
import { FONT_SANS } from '../../helpers/fonts';

export const RIGHT_TOOLBAR_WIDTH = 45;

export interface RightToolbarItem {
    id: string;
    /** Inline SVG markup (24px, `currentColor` stroke style). */
    icon: string;
    title: string;
    group?: 'top' | 'bottom';
    onClick: (id: string) => void;
    /** Initial badge count (0 / undefined hides it). A `setBadge` made before `addItem` wins over this. */
    badge?: number;
}

export interface RightToolbarMenuItem {
    label: string;
    /** Optional inline SVG markup (`currentColor`). */
    icon?: string;
    onClick: () => void;
}

interface ItemView {
    item: RightToolbarItem;
    button: HTMLButtonElement;
    badge: HTMLSpanElement;
    count: number;
}

const svg = (body: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="square" stroke-linejoin="miter">${body}</svg>`;

/** Own outline icons (simple geometry, `currentColor`). */
export const RIGHT_TOOLBAR_ICONS = {
    watchlist: svg('<path d="M12.5 8.5h9M12.5 13.5h9M12.5 18.5h9"/><circle cx="8" cy="8.5" r="1"/><circle cx="8" cy="13.5" r="1"/><circle cx="8" cy="18.5" r="1"/>'),
    alerts: svg('<circle cx="14" cy="15" r="7.5"/><path d="M14 10.5V15h3.5"/><path d="M6.5 9.5l3-3M21.5 9.5l-3-3"/><path d="M8.5 21.5l-2 2M19.5 21.5l2 2"/>'),
    objectTree: svg('<path d="M14 6.5l8 4.5-8 4.5-8-4.5z" stroke-linejoin="round"/><path d="M6 14.5l8 4.5 8-4.5M6 18l8 4.5 8-4.5" stroke-linejoin="round"/>'),
    apps: svg('<rect x="6.5" y="6.5" width="6" height="6" rx="1"/><rect x="15.5" y="6.5" width="6" height="6" rx="1"/><rect x="6.5" y="15.5" width="6" height="6" rx="1"/><rect x="15.5" y="15.5" width="6" height="6" rx="1"/>'),
    help: svg('<circle cx="14" cy="14" r="8.5"/><path d="M11.5 11.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8" stroke-linecap="butt"/><path d="M14 18v1.5"/>'),
    ai: svg('<path d="M11.5 7Q12.5 13 18 14Q12.5 15 11.5 21Q10.5 15 5 14Q10.5 13 11.5 7z" stroke-linejoin="round"/><path d="M21 4.5Q21.5 7.5 24 8Q21.5 8.5 21 11.5Q20.5 8.5 18 8Q20.5 7.5 21 4.5z" stroke-linejoin="round"/>'),
};

export class RightToolbarWidget {
    private readonly _el: HTMLElement;
    private readonly _top: HTMLElement;
    private readonly _bottom: HTMLElement;
    private readonly _separator: HTMLElement;
    private readonly _items = new Map<string, ItemView>();
    private _activeId: string | null = null;
    private _theme: 'dark' | 'light' = 'dark';
    private _hoverId: string | null = null;
    /** Badge counts by id, kept across `addItem` / `removeItem` (a badge set before the item exists is not lost). */
    private readonly _counts = new Map<string, number>();
    private _menu: { el: HTMLElement; anchorId: string; cleanup: () => void } | null = null;
    private readonly _itemClicked = new Delegate<string>();

    constructor(parent: HTMLElement) {
        this._el = document.createElement('div');
        this._el.className = 'tv-right-toolbar';
        this._el.style.cssText = `
            flex: 0 0 ${RIGHT_TOOLBAR_WIDTH}px; width: ${RIGHT_TOOLBAR_WIDTH}px; box-sizing: border-box;
            display: flex; flex-direction: column; align-items: center; justify-content: space-between;
            padding: 4px 0; overflow: hidden; user-select: none;
        `;
        this._top = document.createElement('div');
        this._top.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;flex:0 1 auto;min-height:0;overflow-x:hidden;overflow-y:auto;scrollbar-width:none;';
        this._bottom = document.createElement('div');
        this._bottom.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;flex:0 0 auto;';
        this._separator = document.createElement('div');
        this._separator.style.cssText = 'width:28px;height:1px;margin:4px 0;display:none;';
        this._bottom.appendChild(this._separator);
        this._el.appendChild(this._top);
        this._el.appendChild(this._bottom);
        parent.appendChild(this._el);
        this.setTheme('dark');
    }

    get element(): HTMLElement { return this._el; }
    get itemClicked(): Delegate<string> { return this._itemClicked; }
    get activeId(): string | null { return this._activeId; }

    /** Adds (or replaces) an item. */
    addItem(item: RightToolbarItem): void {
        this.removeItem(item.id);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tv-right-toolbar-item';
        button.dataset.id = item.id;
        button.title = item.title;
        button.setAttribute('aria-label', item.title);
        button.style.cssText = `
            position: relative; display: flex; align-items: center; justify-content: center;
            width: 44px; height: 44px; padding: 0; border: none; border-radius: 6px; cursor: pointer;
            background: transparent; transition: background 0.15s, color 0.15s; flex-shrink: 0;
        `;
        button.innerHTML = item.icon;
        const badge = document.createElement('span');
        badge.className = 'tv-right-toolbar-badge';
        badge.style.cssText = `
            position: absolute; top: 3px; right: 3px; min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box;
            border-radius: 8px; background: #f23645; color: #fff; font-size: 10px; font-weight: 700; line-height: 16px;
            align-items: center; justify-content: center; display: none; pointer-events: none;
        `;
        button.appendChild(badge);
        button.addEventListener('mouseenter', () => { this._hoverId = item.id; this._style(item.id); });
        button.addEventListener('mouseleave', () => { this._hoverId = null; this._style(item.id); });
        button.addEventListener('click', () => {
            item.onClick(item.id);
            this._itemClicked.fire(item.id);
        });
        const view: ItemView = { item, button, badge, count: 0 };
        this._items.set(item.id, view);
        (item.group === 'bottom' ? this._bottom : this._top).appendChild(button);
        this._updateSeparator();
        this.setBadge(item.id, this._counts.get(item.id) ?? item.badge ?? 0);
        this._style(item.id);
    }

    removeItem(id: string): void {
        const view = this._items.get(id);
        if (!view) return;
        view.button.remove();
        this._items.delete(id);
        // The active id is kept on purpose: re-adding the item restores its highlight (the owner clears it via setActive).
        if (this._menu?.anchorId === id) this.closeMenu();
        this._updateSeparator();
    }

    setItemTitle(id: string, title: string): void {
        const view = this._items.get(id);
        if (!view) return;
        view.item.title = title;
        view.button.title = title;
        view.button.setAttribute('aria-label', title);
    }

    hasItem(id: string): boolean { return this._items.has(id); }

    /** Highlights one item (null clears the highlight). */
    setActive(id: string | null): void {
        const prev = this._activeId;
        this._activeId = id;
        if (prev) this._style(prev);
        if (id) this._style(id);
    }

    /** Numeric badge on an item: 0 hides it, above 99 shows "99+". */
    setBadge(id: string, count: number): void {
        const n = Math.max(0, Math.floor(count) || 0);
        this._counts.set(id, n);
        const view = this._items.get(id);
        if (!view) return;
        view.count = n;
        view.badge.textContent = n > 99 ? '99+' : String(n);
        view.badge.style.display = n > 0 ? 'flex' : 'none';
    }

    setTheme(theme: 'dark' | 'light'): void {
        this._theme = theme;
        const dark = theme === 'dark';
        this._el.dataset.theme = theme;
        this._el.style.background = 'var(--surface)';
        this._el.style.borderLeft = '0';
        this._separator.style.background = 'var(--sep)';
        for (const id of this._items.keys()) this._style(id);
    }

    /**
     * Small popover anchored to the left of an item (theme aware, closes on outside click / Esc / item pick).
     * Calling it again for the same open anchor closes it (so the anchor button toggles the menu).
     */
    showMenu(anchorId: string, items: RightToolbarMenuItem[]): void {
        const anchor = this._items.get(anchorId)?.button;
        const wasOpen = this._menu?.anchorId === anchorId;
        this.closeMenu();
        if (!anchor || wasOpen || items.length === 0) return;
        const dark = this._theme === 'dark';
        const el = document.createElement('div');
        el.className = 'tv-right-toolbar-menu soft-menu';
        el.setAttribute('role', 'menu');
        el.style.cssText = `
            position: fixed; z-index: 10000; min-width: 180px; padding: 4px 0; box-sizing: border-box; border-radius: 6px;
            font: 13px ${FONT_SANS}; visibility: hidden;
            background: ${dark ? '#1e222d' : '#ffffff'}; color: ${dark ? '#d1d4dc' : '#131722'};
            border: 1px solid ${dark ? '#363a45' : '#e0e3eb'};
            box-shadow: ${dark ? '0 8px 24px rgba(0,0,0,0.45)' : '0 8px 24px rgba(19,23,34,0.18)'};
        `;
        const buttons: HTMLButtonElement[] = [];
        for (const item of items) {
            const b = document.createElement('button');
            b.type = 'button';
            b.setAttribute('role', 'menuitem');
            b.className = 'soft-menu-row';
            b.style.cssText = `
                display: flex; align-items: center; gap: 10px; width: 100%; padding: 0 10px; border: none; cursor: pointer;
                background: transparent; color: inherit; font: inherit; text-align: left; white-space: nowrap;
            `;
            if (item.icon) {
                const ic = document.createElement('span');
                ic.style.cssText = 'display:flex;width:20px;height:20px;flex:0 0 20px;';
                ic.innerHTML = item.icon.replace(/width="28" height="28"/, 'width="22" height="22"');
                b.appendChild(ic);
            }
            const label = document.createElement('span');
            label.textContent = item.label;
            b.appendChild(label);
            const hover = dark ? '#2a2e39' : '#f0f3fa';
            b.addEventListener('mouseenter', () => { b.style.background = hover; });
            b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; });
            b.addEventListener('focus', () => { b.style.background = hover; });
            b.addEventListener('blur', () => { b.style.background = 'transparent'; });
            b.addEventListener('click', () => {
                this.closeMenu();
                item.onClick();
            });
            el.appendChild(b);
            buttons.push(b);
        }
        document.body.appendChild(el);
        const rect = anchor.getBoundingClientRect();
        const h = el.offsetHeight;
        const top = Math.min(Math.max(8, rect.bottom - h), Math.max(8, window.innerHeight - h - 8));
        el.style.top = `${Math.round(top)}px`;
        el.style.right = `${Math.round(window.innerWidth - rect.left + 6)}px`;
        el.style.visibility = 'visible';
        anchor.setAttribute('aria-expanded', 'true');

        const onPointerDown = (e: Event): void => {
            const target = e.target as Node | null;
            if (target && (el.contains(target) || anchor.contains(target))) return;
            this.closeMenu();
        };
        const onKeyDown = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.closeMenu();
                anchor.focus();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
                const step = e.key === 'ArrowDown' ? 1 : -1;
                buttons[(i + step + buttons.length) % buttons.length].focus();
            }
        };
        const onBlur = (): void => this.closeMenu();
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('blur', onBlur);
        this._menu = {
            el,
            anchorId,
            cleanup: () => {
                document.removeEventListener('pointerdown', onPointerDown, true);
                document.removeEventListener('keydown', onKeyDown, true);
                window.removeEventListener('blur', onBlur);
                anchor.removeAttribute('aria-expanded');
            },
        };
        buttons[0]?.focus();
    }

    closeMenu(): void {
        const menu = this._menu;
        if (!menu) return;
        this._menu = null;
        menu.cleanup();
        menu.el.remove();
    }

    dispose(): void {
        this.closeMenu();
        this._itemClicked.destroy();
        this._items.clear();
        this._el.remove();
    }

    private _updateSeparator(): void {
        const hasBottom = Array.from(this._items.values()).some((v) => v.item.group === 'bottom');
        this._separator.style.display = hasBottom ? 'block' : 'none';
    }

    private _style(id: string): void {
        const view = this._items.get(id);
        if (!view) return;
        const dark = this._theme === 'dark';
        const active = this._activeId === id;
        view.button.dataset.active = active ? 'true' : 'false';
        view.button.setAttribute('aria-pressed', active ? 'true' : 'false');
        view.button.style.background = active
            ? 'rgba(41, 98, 255, 0.18)'
            : this._hoverId === id ? (dark ? '#2a2e39' : '#e0e3eb') : 'transparent';
        view.button.style.color = active ? '#2962ff' : dark ? '#d1d4dc' : '#131722';
    }
}
