/**
 * Indicator Search Modal - TradingView "Indicators, metrics & strategies" style dialog.
 * Search + category sidebar + favourites/recents; clicking a row adds the indicator and
 * keeps the dialog open. Pure logic lives in indicator_catalog.ts.
 */

import { Delegate } from '../../helpers/delegate';
import { t, getCurrentLanguage } from '../../helpers/translations';
import {
    CATEGORY_LABELS,
    CATEGORY_ORDER,
    CatalogItem,
    IndicatorCategoryId,
    IndicatorPrefs,
    SECTION_LABELS,
    groupBySection,
    itemsForCategory,
    searchIndicators,
} from './indicator_catalog';
import { getIndicatorAccess, isIndicatorAllowed, requiredPlanLabel } from './indicator_access';

export { IndicatorItem, AVAILABLE_INDICATORS } from './indicator_catalog';

type ModalTheme = 'dark' | 'light';

const UI = {
    width: 760,
    height: 620,
    narrowBreakpoint: 600,
    radius: 8,
    headerHeight: 52,
    searchHeight: 40,
    sidebarWidth: 210,
    rowHeight: 34,
    sectionHeaderHeight: 28,
    fontFamily: `-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif`,
    zIndex: 10000,
    favoriteColor: '#F7C948',
    addedColor: '#26A69A',
    accent: '#2962FF',
    addedFlashMs: 1400,
    colors: {
        dark: {
            backdrop: 'rgba(0, 0, 0, 0.55)',
            bg: '#1E222D',
            border: '#2A2E39',
            text: '#D1D4DC',
            muted: '#787B86',
            hover: '#2A2E39',
            highlight: '#2A2E39',
            input: '#131722',
            activeCat: '#2A2E39',
            shadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
        },
        light: {
            backdrop: 'rgba(19, 23, 34, 0.4)',
            bg: '#FFFFFF',
            border: '#E0E3EB',
            text: '#131722',
            muted: '#787B86',
            hover: '#F0F3FA',
            highlight: '#F0F3FA',
            input: '#FFFFFF',
            activeCat: '#E3EFFD',
            shadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
        },
    },
};

const STAR_SVG = (fill: string, stroke: string) =>
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z"/></svg>`;
const CHECK_SVG = (stroke: string) =>
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

const LOCK_SVG = (stroke: string) =>
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;

export class IndicatorSearchModal {
    private _element: HTMLElement | null = null;
    private _overlay: HTMLElement | null = null;
    private _searchInput: HTMLInputElement | null = null;
    private _resultsList: HTMLElement | null = null;
    private _sidebar: HTMLElement | null = null;
    private _body: HTMLElement | null = null;
    private _notice: HTMLElement | null = null;
    private _noticeTimer: ReturnType<typeof setTimeout> | null = null;
    private _activeCategory: IndicatorCategoryId = 'technical';
    private _theme: ModalTheme = 'dark';
    private _visible = false;
    private _prefs: IndicatorPrefs;

    /** Flat list of the rows currently rendered (keyboard navigation order). */
    private _rows: CatalogItem[] = [];
    private _rowEls: HTMLElement[] = [];
    private _highlight = -1;
    private readonly _addedCounts = new Map<string, number>();
    private readonly _flashTimers = new Map<string, ReturnType<typeof setTimeout>>();

    private readonly _indicatorSelected = new Delegate<string>();
    private readonly _closed = new Delegate<void>();

    private readonly _onKeyDown = (e: KeyboardEvent): void => {
        if (!this._visible) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.hide();
        }
    };
    private readonly _onResize = (): void => this._applyLayout();

    constructor(private _container: HTMLElement) {
        let storage: Storage | null = null;
        try { storage = window.localStorage; } catch (e) { storage = null; }
        this._prefs = new IndicatorPrefs(storage);
        this._createElement();
    }

    get indicatorSelected(): Delegate<string> {
        return this._indicatorSelected;
    }

    get closed(): Delegate<void> {
        return this._closed;
    }

    setTheme(theme: ModalTheme): void {
        if (theme === this._theme) return;
        this._theme = theme;
        const query = this._searchInput?.value ?? '';
        this._destroyElement();
        this._createElement();
        if (this._searchInput) this._searchInput.value = query;
        if (this._visible && this._overlay) {
            this._overlay.style.display = 'flex';
            this._applyLayout();
            this._refresh();
            this._searchInput?.focus();
        }
    }

    show(): void {
        if (!this._overlay || !this._element) return;
        // CSS uppercase follows the language (Turkish dotted/dotless i)
        this._overlay.lang = getCurrentLanguage();
        this._overlay.style.display = 'flex';
        this._visible = true;
        document.addEventListener('keydown', this._onKeyDown, true);
        window.addEventListener('resize', this._onResize);
        if (this._searchInput) this._searchInput.value = '';
        this._applyLayout();
        this._refresh();
        this._searchInput?.focus();
    }

    hide(): void {
        if (!this._overlay) return;
        this._hideNotice();
        this._overlay.style.display = 'none';
        this._visible = false;
        document.removeEventListener('keydown', this._onKeyDown, true);
        window.removeEventListener('resize', this._onResize);
        this._closed.fire();
    }

    private get _c() {
        return UI.colors[this._theme];
    }

    private _createElement(): void {
        const c = this._c;

        this._overlay = document.createElement('div');
        this._overlay.className = 'tv-indicator-dialog-overlay';
        this._overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: ${c.backdrop};
            display: none;
            align-items: center;
            justify-content: center;
            z-index: ${UI.zIndex};
            font-family: ${UI.fontFamily};
        `;

        this._element = document.createElement('div');
        this._element.className = 'tv-indicator-dialog';
        this._element.setAttribute('role', 'dialog');
        this._element.setAttribute('aria-label', t('Indicators'));
        this._element.style.cssText = `
            background: ${c.bg};
            color: ${c.text};
            border: 1px solid ${c.border};
            border-radius: ${UI.radius}px;
            display: flex;
            flex-direction: column;
            box-shadow: ${c.shadow};
            overflow: hidden;
            box-sizing: border-box;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            height: ${UI.headerHeight}px;
            flex-shrink: 0;
            padding: 0 12px 0 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        `;
        const title = document.createElement('div');
        title.textContent = t('Indicators');
        title.style.cssText = `font-size: 20px; font-weight: 600; color: ${c.text};`;
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.setAttribute('aria-label', t('Close'));
        closeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c.muted}" stroke-width="1.8" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        closeBtn.style.cssText = `
            background: none; border: none; cursor: pointer; padding: 6px;
            border-radius: 6px; display: flex; transition: background 0.15s;
        `;
        closeBtn.onmousedown = (e) => e.preventDefault();
        closeBtn.onmouseenter = () => closeBtn.style.background = c.hover;
        closeBtn.onmouseleave = () => closeBtn.style.background = 'none';
        closeBtn.onclick = () => this.hide();
        header.appendChild(closeBtn);
        this._element.appendChild(header);

        // Search
        const searchContainer = document.createElement('div');
        searchContainer.style.cssText = `
            flex-shrink: 0;
            padding: 0 20px 12px;
            position: relative;
            border-bottom: 1px solid ${c.border};
        `;
        const searchIcon = document.createElement('span');
        searchIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c.muted}" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>`;
        searchIcon.style.cssText = `
            position: absolute; left: 32px; top: ${UI.searchHeight / 2}px;
            transform: translateY(-50%); display: flex; pointer-events: none;
        `;
        searchContainer.appendChild(searchIcon);

        const input = document.createElement('input');
        this._searchInput = input;
        input.type = 'text';
        input.placeholder = t('Search');
        input.setAttribute('autocomplete', 'off');
        input.spellcheck = false;
        input.style.cssText = `
            width: 100%; box-sizing: border-box;
            height: ${UI.searchHeight}px;
            background: ${c.input};
            border: 1px solid ${c.border};
            border-radius: 6px;
            padding: 0 12px 0 38px;
            font-size: 15px; font-family: inherit;
            color: ${c.text};
            outline: none;
            transition: border-color 0.15s;
        `;
        input.onfocus = () => { input.style.borderColor = UI.accent; };
        input.onblur = () => { input.style.borderColor = c.border; };
        input.oninput = () => { this._highlight = -1; this._refresh(); };
        input.onkeydown = (e) => this._onInputKey(e);
        searchContainer.appendChild(input);
        this._element.appendChild(searchContainer);

        // Inline notice (locked indicator clicked); hidden until needed
        this._notice = document.createElement('div');
        this._notice.className = 'tv-indicator-notice';
        this._notice.setAttribute('role', 'alert');
        this._notice.style.cssText = `
            display: none; flex-shrink: 0; align-items: center; gap: 8px;
            padding: 8px 20px; font-size: 13px; color: ${c.text};
            background: ${this._theme === 'dark' ? 'rgba(247, 201, 72, 0.12)' : 'rgba(247, 201, 72, 0.22)'};
            border-bottom: 1px solid ${c.border};
        `;
        this._element.appendChild(this._notice);

        // Body: sidebar + list
        this._body = document.createElement('div');
        this._body.style.cssText = `display: flex; flex: 1; min-height: 0;`;

        this._sidebar = document.createElement('div');
        this._body.appendChild(this._sidebar);

        this._resultsList = document.createElement('div');
        this._resultsList.style.cssText = `flex: 1; min-width: 0; overflow-y: auto; padding: 6px 0;`;
        this._body.appendChild(this._resultsList);

        this._element.appendChild(this._body);
        this._overlay.appendChild(this._element);
        this._container.appendChild(this._overlay);

        this._overlay.onmousedown = (e) => {
            if (e.target === this._overlay) this.hide();
        };

        this._applyLayout();
        this._renderSidebar();
    }

    private _destroyElement(): void {
        if (this._overlay?.parentNode) this._overlay.parentNode.removeChild(this._overlay);
        this._overlay = null;
        this._element = null;
        this._searchInput = null;
        this._resultsList = null;
        this._sidebar = null;
        this._body = null;
        this._notice = null;
        this._rowEls = [];
    }

    /** Access changed (setIndicatorAccess): repaint lock state of the visible rows. */
    refreshAccess(): void {
        if (!this._visible) return;
        const top = this._resultsList?.scrollTop ?? 0;
        this._refresh();
        if (this._resultsList) this._resultsList.scrollTop = top;
    }

    private _isLocked(ind: CatalogItem): boolean {
        return !isIndicatorAllowed(getIndicatorAccess(), ind.id);
    }

    private _showLockedNotice(ind: CatalogItem): void {
        if (!this._notice) return;
        const plan = requiredPlanLabel(getIndicatorAccess(), ind.id);
        const text = plan === 'Admin'
            ? t('This indicator is available to administrators only.')
            : t('This indicator requires a {plan} membership.').replace('{plan}', plan);
        this._notice.innerHTML = `${LOCK_SVG(UI.favoriteColor)}<span></span>`;
        (this._notice.lastChild as HTMLElement).textContent = text;
        this._notice.style.display = 'flex';
        if (this._noticeTimer) clearTimeout(this._noticeTimer);
        this._noticeTimer = setTimeout(() => this._hideNotice(), 5000);
    }

    private _hideNotice(): void {
        if (this._noticeTimer) clearTimeout(this._noticeTimer);
        this._noticeTimer = null;
        if (this._notice) this._notice.style.display = 'none';
    }

    private _isNarrow(): boolean {
        return window.innerWidth < UI.narrowBreakpoint;
    }

    private _applyLayout(): void {
        if (!this._element || !this._sidebar || !this._body || !this._overlay) return;
        const c = this._c;
        const narrow = this._isNarrow();
        if (narrow) {
            this._overlay.style.alignItems = 'stretch';
            this._element.style.cssText += `width: 100vw; height: 100vh; max-width: none; max-height: none; border-radius: 0; border: none;`;
            this._body.style.flexDirection = 'column';
            this._sidebar.style.cssText = `
                flex-shrink: 0; display: flex; flex-direction: row; gap: 4px; overflow-x: auto;
                padding: 8px 12px; border-bottom: 1px solid ${c.border}; box-sizing: border-box;
            `;
        } else {
            this._overlay.style.alignItems = 'center';
            this._element.style.cssText += `
                width: ${UI.width}px; height: ${UI.height}px; max-width: 96vw; max-height: 94vh;
                border-radius: ${UI.radius}px; border: 1px solid ${c.border};
            `;
            this._body.style.flexDirection = 'row';
            this._sidebar.style.cssText = `
                width: ${UI.sidebarWidth}px; flex-shrink: 0; overflow-y: auto;
                padding: 8px; border-right: 1px solid ${c.border}; box-sizing: border-box;
            `;
        }
        this._renderSidebar();
    }

    private _renderSidebar(): void {
        if (!this._sidebar) return;
        const c = this._c;
        const narrow = this._isNarrow();
        const searching = !!this._searchInput?.value.trim();
        this._sidebar.innerHTML = '';
        for (const id of CATEGORY_ORDER) {
            const active = !searching && id === this._activeCategory;
            const btn = document.createElement('button');
            btn.dataset.category = id;
            btn.textContent = t(CATEGORY_LABELS[id]);
            btn.style.cssText = `
                display: block; ${narrow ? 'white-space: nowrap; flex-shrink: 0;' : 'width: 100%;'}
                text-align: left; border: none; border-radius: 6px;
                padding: 0 12px; height: 34px; line-height: 34px;
                font-family: inherit; font-size: 14px; cursor: pointer;
                font-weight: ${active ? 600 : 400};
                color: ${active ? c.text : searching ? c.muted : c.text};
                background: ${active ? c.activeCat : 'transparent'};
                opacity: ${searching ? 0.55 : 1};
                transition: background 0.1s;
            `;
            btn.onmousedown = (e) => e.preventDefault();
            btn.onmouseenter = () => { if (!active) btn.style.background = c.hover; };
            btn.onmouseleave = () => { if (!active) btn.style.background = 'transparent'; };
            btn.onclick = () => {
                this._activeCategory = id;
                if (this._searchInput) this._searchInput.value = '';
                this._highlight = -1;
                this._refresh();
                this._searchInput?.focus();
            };
            this._sidebar.appendChild(btn);
        }
    }

    private _refresh(): void {
        this._renderSidebar();
        const query = this._searchInput?.value.trim() ?? '';
        if (query) {
            this._renderResults(searchIndicators(query), true);
        } else {
            this._renderResults(itemsForCategory(this._activeCategory, this._prefs), false);
        }
    }

    private _onInputKey(e: KeyboardEvent): void {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (this._rows.length === 0) return;
            const dir = e.key === 'ArrowDown' ? 1 : -1;
            const next = this._highlight < 0
                ? (dir > 0 ? 0 : this._rows.length - 1)
                : (this._highlight + dir + this._rows.length) % this._rows.length;
            this._setHighlight(next, true);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const idx = this._highlight >= 0 ? this._highlight : (this._searchInput?.value.trim() ? 0 : -1);
            if (idx >= 0 && this._rows[idx]) this._addIndicator(this._rows[idx]);
        }
    }

    private _setHighlight(idx: number, scroll: boolean): void {
        const c = this._c;
        if (this._highlight >= 0 && this._rowEls[this._highlight]) {
            this._rowEls[this._highlight].style.background = 'transparent';
        }
        this._highlight = idx;
        const el = this._rowEls[idx];
        if (el) {
            el.style.background = c.highlight;
            if (scroll) el.scrollIntoView({ block: 'nearest' });
        }
    }

    private _addIndicator(ind: CatalogItem): void {
        if (this._isLocked(ind)) {
            this._showLockedNotice(ind);
            return;
        }
        this._hideNotice();
        this._indicatorSelected.fire(ind.id);
        this._prefs.addRecent(ind.id);
        this._addedCounts.set(ind.id, (this._addedCounts.get(ind.id) ?? 0) + 1);
        this._flashAdded(ind.id);
        // Recents order changed; keep the visible list in sync without losing scroll position.
        if (this._activeCategory === 'recent' && !this._searchInput?.value.trim() && this._resultsList) {
            const top = this._resultsList.scrollTop;
            const hl = this._rows[this._highlight]?.id;
            this._refresh();
            this._resultsList.scrollTop = top;
            const idx = this._rows.findIndex(r => r.id === hl);
            if (idx >= 0) this._setHighlight(idx, false);
        }
    }

    private _flashAdded(id: string): void {
        const idx = this._rows.findIndex(r => r.id === id);
        const el = idx >= 0 ? this._rowEls[idx] : null;
        const badge = el?.querySelector('.tv-ind-added') as HTMLElement | null;
        if (!badge) return;
        const n = this._addedCounts.get(id) ?? 1;
        badge.innerHTML = `${CHECK_SVG(UI.addedColor)}<span style="margin-left:4px">${n > 1 ? '×' + n : t('Added')}</span>`;
        badge.style.opacity = '1';
        const prev = this._flashTimers.get(id);
        if (prev) clearTimeout(prev);
        this._flashTimers.set(id, setTimeout(() => {
            // Leave the small counter once flashed more than once, fade otherwise.
            if (n > 1) badge.innerHTML = `${CHECK_SVG(UI.addedColor)}<span style="margin-left:4px">×${n}</span>`;
            else badge.style.opacity = '0';
            this._flashTimers.delete(id);
        }, UI.addedFlashMs));
    }

    private _toggleFavorite(ind: CatalogItem, starEl: HTMLElement, rowEl: HTMLElement): void {
        const fav = this._prefs.toggleFavorite(ind.id);
        if (this._activeCategory === 'favorites' && !this._searchInput?.value.trim()) {
            // Item leaves the list: re-render, keep scroll.
            const top = this._resultsList?.scrollTop ?? 0;
            this._refresh();
            if (this._resultsList) this._resultsList.scrollTop = top;
            return;
        }
        this._paintStar(starEl, fav, rowEl.matches(':hover'));
    }

    private _paintStar(starEl: HTMLElement, fav: boolean, hovered: boolean): void {
        const c = this._c;
        starEl.innerHTML = STAR_SVG(fav ? UI.favoriteColor : 'none', fav ? UI.favoriteColor : c.muted);
        starEl.style.opacity = fav || hovered ? '1' : '0';
        starEl.title = fav ? t('Remove from favorites') : t('Add to favorites');
    }

    private _emptyMessage(searching: boolean): string {
        if (searching) return t('No indicators found');
        if (this._activeCategory === 'favorites') return t('No favorites yet. Click the star next to an indicator to add it.');
        if (this._activeCategory === 'recent') return t('No recently used indicators yet.');
        return t('No indicators found');
    }

    private _renderResults(indicators: CatalogItem[], searching: boolean): void {
        if (!this._resultsList) return;
        const c = this._c;
        this._resultsList.innerHTML = '';
        this._rows = [];
        this._rowEls = [];
        this._highlight = -1;

        if (indicators.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = this._emptyMessage(searching);
            empty.style.cssText = `padding: 60px 24px; text-align: center; color: ${c.muted}; font-size: 14px; line-height: 1.5;`;
            this._resultsList.appendChild(empty);
            return;
        }

        const addRow = (ind: CatalogItem) => {
            const idx = this._rows.length;
            const row = document.createElement('div');
            row.className = 'tv-indicator-row';
            row.dataset.id = ind.id;
            row.title = ind.description;
            row.style.cssText = `
                height: ${UI.rowHeight}px; padding: 0 16px 0 20px; box-sizing: border-box;
                cursor: pointer; display: flex; align-items: center; gap: 8px;
                font-size: 14px; background: transparent;
            `;

            const locked = this._isLocked(ind);
            if (locked) row.dataset.locked = 'true';

            const name = document.createElement('span');
            name.textContent = ind.name;
            name.style.cssText = `color: ${locked ? c.muted : c.text}; opacity: ${locked ? 0.6 : 1}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex-shrink: 1;`;
            row.appendChild(name);

            const short = document.createElement('span');
            short.textContent = ind.shortName;
            short.style.cssText = `color: ${c.muted}; font-size: 12px; white-space: nowrap; flex-shrink: 0;`;
            row.appendChild(short);

            const spacer = document.createElement('span');
            spacer.style.cssText = 'flex: 1;';
            row.appendChild(spacer);

            if (ind.remote) {
                const tag = document.createElement('span');
                tag.textContent = 'Premium';
                tag.style.cssText = `color: ${c.muted}; font-size: 11px; border: 1px solid ${c.border}; border-radius: 3px; padding: 0 5px; line-height: 16px; flex-shrink: 0;`;
                row.appendChild(tag);
            }

            if (locked) {
                const plan = requiredPlanLabel(getIndicatorAccess(), ind.id);
                const lock = document.createElement('span');
                lock.className = 'tv-ind-lock';
                lock.style.cssText = `display: flex; align-items: center; gap: 5px; flex-shrink: 0; color: ${UI.favoriteColor};`;
                lock.innerHTML = LOCK_SVG(UI.favoriteColor);
                const badge = document.createElement('span');
                badge.textContent = plan;
                badge.style.cssText = `font-size: 10px; font-weight: 700; letter-spacing: 0.04em; border: 1px solid ${UI.favoriteColor}; border-radius: 3px; padding: 0 5px; line-height: 15px; color: ${UI.favoriteColor};`;
                lock.appendChild(badge);
                row.appendChild(lock);
            }

            const added = document.createElement('span');
            added.className = 'tv-ind-added';
            added.style.cssText = `display: flex; align-items: center; font-size: 12px; color: ${UI.addedColor}; flex-shrink: 0; opacity: 0; transition: opacity 0.2s; min-width: 0;`;
            const count = this._addedCounts.get(ind.id) ?? 0;
            if (count > 1) {
                added.innerHTML = `${CHECK_SVG(UI.addedColor)}<span style="margin-left:4px">×${count}</span>`;
                added.style.opacity = '1';
            }
            row.appendChild(added);

            const star = document.createElement('span');
            star.style.cssText = `display: flex; padding: 2px; border-radius: 4px; flex-shrink: 0; transition: opacity 0.1s;`;
            this._paintStar(star, this._prefs.isFavorite(ind.id), false);
            star.onclick = (e) => {
                e.stopPropagation();
                this._toggleFavorite(ind, star, row);
            };
            star.onmousedown = (e) => e.preventDefault();
            row.appendChild(star);

            row.onmouseenter = () => {
                this._setHighlight(idx, false);
                this._paintStar(star, this._prefs.isFavorite(ind.id), true);
            };
            row.onmouseleave = () => {
                this._paintStar(star, this._prefs.isFavorite(ind.id), false);
            };
            row.onmousedown = (e) => e.preventDefault();
            row.onclick = () => this._addIndicator(ind);

            this._rows.push(ind);
            this._rowEls.push(row);
            this._resultsList!.appendChild(row);
        };

        if (searching) {
            for (const g of groupBySection(indicators)) {
                // Keep relevance order inside each section header (rows are already sorted).
                this._resultsList.appendChild(this._sectionHeader(t(SECTION_LABELS[g.section])));
                g.items.forEach(addRow);
            }
        } else {
            indicators.forEach(addRow);
        }
    }

    private _sectionHeader(text: string): HTMLElement {
        const h = document.createElement('div');
        h.textContent = text;
        h.style.cssText = `
            height: ${UI.sectionHeaderHeight}px; line-height: ${UI.sectionHeaderHeight}px;
            padding: 0 20px; margin-top: 4px; box-sizing: border-box;
            font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
            text-transform: uppercase; color: ${this._c.muted};
        `;
        return h;
    }

    dispose(): void {
        document.removeEventListener('keydown', this._onKeyDown, true);
        window.removeEventListener('resize', this._onResize);
        this._flashTimers.forEach(tm => clearTimeout(tm));
        this._flashTimers.clear();
        if (this._noticeTimer) clearTimeout(this._noticeTimer);
        this._indicatorSelected.destroy();
        this._closed.destroy();
        this._destroyElement();
    }
}
