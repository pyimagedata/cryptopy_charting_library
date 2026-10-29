/**
 * Alerts manager panel (right sidebar, same geometry / theming as the watchlist panel).
 * Two tabs: the user's alerts (filter / sort / search, per-row stop-restart / edit / delete) and the fired-alert log.
 * Data comes from the page-level alertsStore; the panel only needs the ACTIVE chart (via `getChart`) for price
 * formatting, the create / edit dialogs and symbol switching, so it works the same in single and multi-chart mode.
 */
import { Delegate } from '../../helpers/delegate';
import { t } from '../../helpers/translations';
import { alertsStore, AlertsStoreEvent } from '../../alerts/alerts-store';
import { alertErrorText, alertMatchesSymbol, alertTicker, conditionLabel, exactPrice, isMovingCondition, movingSummary, triggerLabel, DEFAULT_ALERT_INTERVAL } from '../../alerts/alert-text';
import type { AlertLogEntry, AlertStatus, ChartAlert } from '../../alerts/types';
import { ContextMenu, ContextMenuItem } from '../context_menu/context_menu';
import type { SymbolInfo } from '../symbol_search/symbol_model';
import { isFuturesExchange, sourceOf } from '../symbol_search/symbol_model';
import { symbolCatalog } from '../symbol_search/symbol_data';
import { WL_COLORS, WlColors } from '../watchlist/watchlist_theme';
import { showToast } from '../toast/toast';
import { AlertDialogChart, openAlertDialog } from './alert-dialog';
import {
    AlertSortKey, AlertStatusFilter, SORT_KEYS, STATUS_FILTERS, UnreadCounter,
    filterAlerts, filterLabel, formatLogTime, mergeLog, prependLog, relativeTime, sortAlerts, sortLabel, statusLabel,
} from './alerts-panel-model';

/** The slice of ChartWidget the panel uses. */
export interface AlertsPanelChart extends AlertDialogChart {
    readonly symbol: string;
    alertSymbolId(): string;
    getLastPrice(): number | null;
    openAlertDialogAt(price?: number): void;
    setSymbol(symbol: string | SymbolInfo): void;
}

const CRYPTO_SOURCES = new Set(['BINANCE', 'BYBIT', 'OKX']);
const OPEN_STORAGE = 'chart.alerts.open';
const WL_WIDTH_STORAGE = 'chart.watchlist.width';
const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 240;
const TICK_MS = 30000;
const FONT = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";

const PLUS_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 3.5v11M3.5 9h11"/></svg>';
const CLOSE_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/></svg>';
const FILTER_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 5h12M5.5 9h7M8 13h2"/></svg>';
const TRASH_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5h11M7 5V3.5h4V5M5 5l.7 9h6.6L13 5M7.5 7.5v4.5M10.5 7.5v4.5"/></svg>';
const PAUSE_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="2.8" height="10" rx="0.6"/><rect x="9.2" y="3" width="2.8" height="10" rx="0.6"/></svg>';
const PLAY_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 3l8 5-8 5z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>';
const EDIT_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l.6-2.8 7.2-7.2 2.2 2.2-7.2 7.2L3 13zM9.6 4.2l2.2 2.2"/></svg>';
const CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 7.5l3.5 3.5L12 3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function readStorage(name: string): string | null {
    try { return localStorage.getItem(name); } catch { return null; }
}
function writeStorage(name: string, value: string): void {
    try { localStorage.setItem(name, value); } catch { /* preference only */ }
}

/** Small DOM helper: text always via textContent (host data is never parsed as HTML). */
function h(tag: string, css: string, text?: string, cls?: string): HTMLElement {
    const el = document.createElement(tag);
    if (css) el.style.cssText = css;
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
}

function ensureStyles(): void {
    if (document.getElementById('al-styles')) return;
    const st = document.createElement('style');
    st.id = 'al-styles';
    st.textContent = `
        .tv-alerts-panel * { scrollbar-width: thin; scrollbar-color: var(--al-scroll) transparent; }
        .tv-alerts-panel ::-webkit-scrollbar { width: 6px; height: 6px; }
        .tv-alerts-panel ::-webkit-scrollbar-thumb { background: var(--al-scroll); border-radius: 3px; }
        .tv-alerts-panel ::-webkit-scrollbar-track { background: transparent; }
        .tv-alerts-panel .al-search:focus { border-color: var(--al-accent) !important; }
        .tv-alerts-panel .al-search::placeholder { color: var(--al-muted); }
    `;
    document.head.appendChild(st);
}

interface StatusColor { fg: string; bg: string }

function statusColor(status: AlertStatus, theme: 'dark' | 'light'): StatusColor {
    const dark = theme === 'dark';
    switch (status) {
        case 'active': return { fg: dark ? '#22ab94' : '#089981', bg: dark ? 'rgba(8,153,129,0.18)' : 'rgba(8,153,129,0.12)' };
        case 'triggered': return { fg: dark ? '#ff9800' : '#e07b00', bg: dark ? 'rgba(255,152,0,0.18)' : 'rgba(255,152,0,0.14)' };
        case 'expired': return { fg: dark ? '#c9606a' : '#b5424d', bg: dark ? 'rgba(242,54,69,0.14)' : 'rgba(242,54,69,0.09)' };
        default: return { fg: dark ? '#868993' : '#6a6d78', bg: dark ? 'rgba(134,137,147,0.18)' : 'rgba(106,109,120,0.12)' };
    }
}

type TabId = 'alerts' | 'log';

export class AlertsPanel {
    readonly visibilityChanged = new Delegate<boolean>();
    readonly widthChanged = new Delegate<number>();
    /** Fires the unread count of fired alerts (0 when the panel is opened). */
    readonly unreadChanged = new Delegate<number>();

    private readonly _parent: HTMLElement;
    private readonly _getChart: () => AlertsPanelChart | null;
    private readonly _el: HTMLElement;
    private _list: HTMLElement;
    private _footer: HTMLElement;
    private _clearBtn: HTMLButtonElement | null = null;
    private _filterBtn: HTMLButtonElement | null = null;
    private _tabEls = new Map<TabId, HTMLElement>();
    private _searchWrap: HTMLElement | null = null;
    private _ctx: ContextMenu | null = null;

    private _width = DEFAULT_WIDTH;
    private _visible = false;
    private _theme: 'dark' | 'light' = 'dark';
    private _tab: TabId = 'alerts';
    private _filter: AlertStatusFilter = 'all';
    private _sort: AlertSortKey = 'created';
    private _query = '';
    private _loading = false;
    private _loadError = false;
    private _log: AlertLogEntry[] | null = null;
    private _logLoading = false;
    private _logError = false;
    private _liveDuringLoad: AlertLogEntry[] = [];
    private _logToken = 0;
    private _confirmClear = false;
    private readonly _busy = new Set<string>();
    private readonly _unread = new UnreadCounter();
    private _unsubStore: (() => void) | null = null;
    private _tick: ReturnType<typeof setInterval> | null = null;
    private _renderQueued = false;
    private _selfRefresh = false;
    private _destroyed = false;

    constructor(parent: HTMLElement, top: number, getChart: () => AlertsPanelChart | null) {
        this._parent = parent;
        this._getChart = getChart;
        this._el = document.createElement('div');
        this._el.className = 'tv-alerts-panel';
        this._el.style.cssText = `
            position: absolute; top: ${top}px; right: 0; bottom: 0;
            width: ${this._width}px; display: none; flex-direction: column;
            z-index: 30; font-size: 12px; font-family: ${FONT}; box-sizing: border-box; user-select: none; outline: none;
        `;
        this._list = document.createElement('div');
        this._footer = document.createElement('div');
        ensureStyles();
        parent.appendChild(this._el);
        this._unsubStore = alertsStore.onChange((ev) => this._onStore(ev));
        this._render();
    }

    get visible(): boolean { return this._visible; }
    get width(): number { return this._width; }
    get unreadCount(): number { return this._unread.count; }

    /** Carries the unread count over when the owner rebuilds the panel (set before the first event). */
    restoreUnread(n: number): void { this._unread.set(n); }

    /** Open when the previous session left it open. */
    static wasOpen(): boolean { return readStorage(OPEN_STORAGE) === '1'; }

    setTop(top: number): void { this._el.style.top = `${top}px`; }

    setTheme(theme: 'dark' | 'light'): void {
        this._theme = theme;
        this._ctx?.setTheme(theme);
        this._render();
    }

    /** The active chart (or its symbol / price format) changed: refresh the highlighted row and price texts. */
    notifyActiveChartChanged(): void {
        if (this._visible) this._scheduleRender();
    }

    toggle(): void { this.setVisible(!this._visible); }

    /** persist:false keeps the stored preference (used when another sidebar panel temporarily takes the slot). */
    setVisible(visible: boolean, opts: { persist?: boolean } = {}): void {
        if (visible === this._visible) return;
        this._visible = visible;
        if (opts.persist !== false) writeStorage(OPEN_STORAGE, visible ? '1' : '0');
        if (visible) {
            this._applyStoredWidth();
            this._el.style.display = 'flex';
            if (this._unread.reset()) this.unreadChanged.fire(0);
            this._renderList();
            void this._refresh();
            if (this._tab === 'log') void this._loadLog();
            this._tick = setInterval(() => this._renderList(), TICK_MS);
        } else {
            this._el.style.display = 'none';
            if (this._tick) clearInterval(this._tick);
            this._tick = null;
            this._ctx?.hide();
            this._confirmClear = false;
        }
        this.visibilityChanged.fire(visible);
    }

    destroy(): void {
        this._destroyed = true;
        this._unsubStore?.();
        this._unsubStore = null;
        if (this._tick) clearInterval(this._tick);
        this._tick = null;
        this._ctx?.dispose();
        this._ctx = null;
        this._el.remove();
        this.visibilityChanged.unsubscribeAll();
        this.widthChanged.unsubscribeAll();
        this.unreadChanged.unsubscribeAll();
    }

    /** Same width as the watchlist panel (its stored width), so switching panels does not jump. */
    private _applyStoredWidth(): void {
        const stored = Number(readStorage(WL_WIDTH_STORAGE));
        let w = Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_WIDTH;
        const max = Math.max(MIN_WIDTH, (this._parent.clientWidth || 1200) - 320);
        w = Math.round(Math.min(Math.max(w, MIN_WIDTH), Math.min(max, 640)));
        if (w === this._width) return;
        this._width = w;
        this._el.style.width = `${w}px`;
        this.widthChanged.fire(w);
    }

    // ---- data ----

    private _onStore(ev: AlertsStoreEvent): void {
        if (this._destroyed) return;
        if (ev.type === 'fired') {
            if (this._unread.onFired(this._visible)) this.unreadChanged.fire(this._unread.count);
            if (this._log) this._log = prependLog(this._log, ev.entry);
            else if (this._logLoading) this._liveDuringLoad.push(ev.entry);
        }
        if (ev.type === 'reset') {
            if (!alertsStore.hasBackend) this._log = null;
            // the list was reloaded elsewhere (e.g. after a socket reconnect): events may have been missed, reload the log too
            else if (this._visible && this._tab === 'log' && !this._selfRefresh) void this._loadLog();
        }
        if (this._visible) this._scheduleRender();
    }

    private _scheduleRender(): void {
        if (this._renderQueued) return;
        this._renderQueued = true;
        setTimeout(() => {
            this._renderQueued = false;
            if (!this._destroyed && this._visible) this._renderList();
        }, 0);
    }

    private async _refresh(): Promise<void> {
        if (!alertsStore.hasBackend) return;
        this._loading = true;
        this._loadError = false;
        this._renderList();
        this._selfRefresh = true;
        try {
            await alertsStore.refresh();
        } catch {
            this._loadError = true;
        } finally {
            this._selfRefresh = false;
            this._loading = false;
            if (!this._destroyed) this._renderList();
        }
    }

    private async _loadLog(): Promise<void> {
        if (!alertsStore.hasBackend) return;
        const token = ++this._logToken;
        this._logLoading = true;
        this._logError = false;
        this._liveDuringLoad = [];
        this._renderList();
        try {
            const fetched = await alertsStore.log();
            if (token !== this._logToken) return;
            this._log = mergeLog(fetched, this._liveDuringLoad);
        } catch {
            if (token === this._logToken) this._logError = true;
        } finally {
            if (token === this._logToken) {
                this._logLoading = false;
                this._liveDuringLoad = [];
                if (!this._destroyed) this._renderList();
            }
        }
    }

    // ---- actions ----

    private _createAlert(): void {
        this._getChart()?.openAlertDialogAt();
    }

    private _failToast(e: unknown): void {
        const text = alertErrorText(e, alertsStore.hasBackend);
        if (text) showToast({ title: text, kind: 'error' });
    }

    private async _toggleStatus(a: ChartAlert): Promise<void> {
        if (this._busy.has(a.id)) return;
        this._busy.add(a.id);
        try {
            if (a.status === 'active') await alertsStore.stop(a.id);
            else await alertsStore.restart(a.id);
        } catch (e) {
            this._failToast(e);
        } finally {
            this._busy.delete(a.id);
            this._scheduleRender();
        }
    }

    private _edit(a: ChartAlert): void {
        // the chart's tick size / format belong to its own symbol only
        const chart = this._getChart();
        openAlertDialog({ chart: chart && alertMatchesSymbol(a.symbol, chart.alertSymbolId()) ? chart : null, symbol: a.symbol, price: a.price, alert: a });
    }

    private async _delete(a: ChartAlert): Promise<void> {
        if (this._busy.has(a.id)) return;
        this._busy.add(a.id);
        try {
            await alertsStore.remove(a.id);
            showToast({ title: t('Alert deleted'), kind: 'success' });
        } catch (e) {
            this._failToast(e);
        } finally {
            this._busy.delete(a.id);
            this._scheduleRender();
        }
    }

    /** Row click: bring the ACTIVE chart to the alert's symbol. */
    private _goTo(symbol: string): void {
        const chart = this._getChart();
        if (!chart || alertMatchesSymbol(symbol, chart.alertSymbolId())) return;
        const i = symbol.indexOf(':');
        if (i <= 0) {
            chart.setSymbol(symbol);
            return;
        }
        const exchange = symbol.slice(0, i).toUpperCase();
        const code = symbol.slice(i + 1);
        // Same SymbolInfo the symbol search / watchlist would hand over: prefer the catalog entry, else infer the type.
        const known = symbolCatalog.symbols.find((s) => s.symbol === code && (s.exchange || '').toUpperCase() === exchange);
        if (known) {
            chart.setSymbol(known);
            return;
        }
        const type: SymbolInfo['type'] = CRYPTO_SOURCES.has(sourceOf(exchange)) ? 'crypto' : isFuturesExchange(exchange) ? 'futures' : 'forex';
        chart.setSymbol({ symbol: code, full_name: symbol, description: code, exchange, type });
    }

    private async _clearLog(): Promise<void> {
        this._confirmClear = false;
        try {
            await alertsStore.clearLog();
            this._log = [];
        } catch (e) {
            this._failToast(e);
        }
        this._renderList();
    }

    private _setTab(tab: TabId): void {
        if (tab === this._tab) return;
        this._tab = tab;
        this._confirmClear = false;
        this._updateTabs();
        this._renderList();
        if (tab === 'log') void this._loadLog();
    }

    // ---- menus ----

    private _openFilterMenu(anchor: HTMLElement): void {
        const items: ContextMenuItem[] = [{ id: 'h-filter', label: t('Filter'), disabled: true }];
        for (const f of STATUS_FILTERS) {
            items.push({
                id: `f-${f}`, label: filterLabel(f), icon: f === this._filter ? CHECK_SVG : '',
                action: () => { this._filter = f; this._renderList(); },
            });
        }
        items.push({ id: 's1', label: '', separator: true });
        items.push({ id: 'h-sort', label: t('Sort'), disabled: true });
        for (const k of SORT_KEYS) {
            items.push({
                id: `s-${k}`, label: sortLabel(k), icon: k === this._sort ? CHECK_SVG : '',
                action: () => { this._sort = k; this._renderList(); },
            });
        }
        if (!this._ctx) this._ctx = new ContextMenu({ items, container: this._parent, theme: this._theme });
        else this._ctx.setItems(items);
        this._ctx.hide();
        this._ctx.showAnchored(anchor.getBoundingClientRect());
    }

    // ---- drawing ----

    private get _c(): WlColors { return WL_COLORS[this._theme]; }

    private _render(): void {
        const c = this._c;
        this._el.style.background = c.bg;
        this._el.style.borderLeft = `1px solid ${c.border}`;
        this._el.style.color = c.text;
        this._el.style.setProperty('--al-scroll', c.scrollThumb);
        this._el.style.setProperty('--al-accent', c.accent);
        this._el.style.setProperty('--al-muted', c.muted);
        this._el.replaceChildren();
        this._tabEls.clear();

        const header = h('div', `display:flex;align-items:center;justify-content:space-between;height:44px;padding:0 8px 0 14px;border-bottom:1px solid ${c.border};flex-shrink:0;gap:4px;`);
        header.appendChild(h('div', 'font-size:14px;font-weight:600;', t('Alerts'), 'al-title'));
        const actions = h('div', 'display:flex;gap:2px;flex-shrink:0;');
        const mkBtn = (svg: string, title: string, cls: string): HTMLButtonElement => {
            const b = document.createElement('button');
            b.className = cls;
            b.innerHTML = svg;
            b.title = title;
            b.setAttribute('aria-label', title);
            b.style.cssText = `position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;background:transparent;color:${c.muted};border-radius:4px;cursor:pointer;`;
            b.addEventListener('mouseenter', () => { b.style.background = c.hover; b.style.color = c.text; });
            b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; b.style.color = c.muted; });
            return b;
        };
        const addBtn = mkBtn(PLUS_SVG, t('Create alert'), 'al-add-btn');
        addBtn.addEventListener('click', () => this._createAlert());
        const filterBtn = mkBtn(FILTER_SVG, t('Filter and sort'), 'al-filter-btn');
        filterBtn.addEventListener('click', () => this._openFilterMenu(filterBtn));
        this._filterBtn = filterBtn;
        const clearBtn = mkBtn(TRASH_SVG, t('Clear log'), 'al-clear-btn');
        clearBtn.addEventListener('click', () => { this._confirmClear = true; this._renderList(); });
        this._clearBtn = clearBtn;
        const closeBtn = mkBtn(CLOSE_SVG, t('Close'), 'al-close-btn');
        closeBtn.addEventListener('click', () => this.setVisible(false));
        actions.append(addBtn, filterBtn, clearBtn, closeBtn);
        header.appendChild(actions);
        this._el.appendChild(header);

        const tabs = h('div', `display:flex;flex-shrink:0;border-bottom:1px solid ${c.border};padding:0 8px;gap:4px;`);
        for (const [id, label] of [['alerts', t('Alerts')], ['log', t('Log')]] as [TabId, string][]) {
            const tab = h('button', 'padding:0 10px;height:34px;border:none;background:transparent;font:inherit;font-size:13px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;', label, `al-tab al-tab-${id}`);
            tab.addEventListener('click', () => this._setTab(id));
            this._tabEls.set(id, tab);
            tabs.appendChild(tab);
        }
        this._el.appendChild(tabs);

        const searchWrap = h('div', `padding:8px 12px;flex-shrink:0;border-bottom:1px solid ${c.border};`);
        const search = document.createElement('input');
        search.className = 'al-search';
        search.type = 'text';
        search.placeholder = t('Search');
        search.value = this._query;
        search.style.cssText = `width:100%;box-sizing:border-box;height:28px;padding:0 10px;border-radius:4px;border:1px solid ${c.border};background:${c.input};color:${c.text};font:inherit;font-size:13px;outline:none;user-select:text;`;
        search.addEventListener('input', () => { this._query = search.value; this._renderList(); });
        searchWrap.appendChild(search);
        this._searchWrap = searchWrap;
        this._el.appendChild(searchWrap);

        this._list = h('div', 'flex:1 1 auto;min-height:0;overflow-y:auto;', undefined, 'al-list');
        this._el.appendChild(this._list);
        this._footer = h('div', `flex-shrink:0;padding:8px 14px;border-top:1px solid ${c.border};color:${c.muted};font-size:12px;`, undefined, 'al-footer');
        this._el.appendChild(this._footer);

        this._updateTabs();
        this._renderList();
    }

    private _updateTabs(): void {
        const c = this._c;
        for (const [id, el] of this._tabEls) {
            const on = id === this._tab;
            el.style.color = on ? c.text : c.muted;
            el.style.borderBottomColor = on ? c.accent : 'transparent';
        }
    }

    private _priceText(symbol: string, price: number): string {
        const chart = this._getChart();
        return chart && alertMatchesSymbol(symbol, chart.alertSymbolId()) ? chart.formatAlertPrice(price) : exactPrice(price);
    }

    private _renderList(): void {
        if (this._destroyed) return;
        const c = this._c;
        const isLog = this._tab === 'log';
        if (this._searchWrap) this._searchWrap.style.display = isLog ? 'none' : 'block';
        if (this._clearBtn) this._clearBtn.style.display = isLog && this._log && this._log.length > 0 ? 'flex' : 'none';
        if (this._filterBtn) {
            this._filterBtn.style.display = isLog ? 'none' : 'flex';
            const marked = this._filter !== 'all' || this._sort !== 'created';
            this._filterBtn.style.color = marked ? c.accent : c.muted;
        }
        this._list.replaceChildren();
        if (isLog) this._renderLog(c);
        else this._renderAlerts(c);
        this._renderFooter();
    }

    private _renderFooter(): void {
        const show = this._tab === 'alerts' && alertsStore.hasBackend;
        this._footer.style.display = show ? 'block' : 'none';
        if (!show) return;
        this._footer.textContent = t('{n} / {limit} active alerts')
            .replace('{n}', String(alertsStore.activeCount()))
            .replace('{limit}', String(alertsStore.limit));
    }

    private _empty(text: string, extra?: HTMLElement, cls = 'al-empty'): void {
        const c = this._c;
        const box = h('div', `display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px 24px;text-align:center;color:${c.muted};font-size:13px;`, undefined, cls);
        box.appendChild(h('div', '', text));
        if (extra) box.appendChild(extra);
        this._list.appendChild(box);
    }

    private _renderStateBlockers(): boolean {
        const c = this._c;
        if (!alertsStore.hasBackend) {
            this._empty(t('Sign in to view alerts'), undefined, 'al-empty al-empty-auth');
            return true;
        }
        const loading = this._tab === 'log' ? this._logLoading && !this._log : this._loading && alertsStore.alerts().length === 0;
        if (loading) {
            this._empty(t('Loading...'), undefined, 'al-empty al-loading');
            return true;
        }
        const failed = this._tab === 'log' ? this._logError && !this._log : this._loadError && alertsStore.alerts().length === 0;
        if (failed) {
            const retry = h('button', `padding:6px 14px;border-radius:4px;border:1px solid ${c.border};background:transparent;color:${c.text};font:inherit;font-size:13px;cursor:pointer;`, t('Retry'), 'al-retry');
            retry.addEventListener('click', () => { if (this._tab === 'log') void this._loadLog(); else void this._refresh(); });
            this._empty(t('Could not load alerts'), retry, 'al-empty al-error');
            return true;
        }
        return false;
    }

    private _renderAlerts(c: WlColors): void {
        if (this._renderStateBlockers()) return;
        const all = alertsStore.alerts();
        if (all.length === 0) {
            const btn = h('button', `padding:7px 16px;border-radius:4px;border:none;background:${c.accent};color:#fff;font:inherit;font-size:13px;font-weight:600;cursor:pointer;`, t('Create alert'), 'al-empty-create');
            btn.addEventListener('click', () => this._createAlert());
            this._empty(t('No alerts yet'), btn, 'al-empty al-empty-none');
            return;
        }
        const rows = sortAlerts(filterAlerts(all, this._filter, this._query), this._sort);
        if (rows.length === 0) {
            this._empty(t('No alerts match the filter'), undefined, 'al-empty al-empty-filter');
            return;
        }
        const activeSymbol = this._getChart()?.alertSymbolId() ?? '';
        const now = Date.now();
        for (const a of rows) this._list.appendChild(this._alertRow(a, c, activeSymbol, now));
    }

    private _alertRow(a: ChartAlert, c: WlColors, activeSymbol: string, now: number): HTMLElement {
        const isActive = alertMatchesSymbol(a.symbol, activeSymbol);
        const baseBg = 'transparent';
        const el = h('div', `position:relative;padding:8px 14px;border-bottom:1px solid ${c.border};cursor:pointer;background:${baseBg};${isActive ? `box-shadow:inset 2px 0 0 ${c.accent};` : ''}`, undefined, 'al-row');
        el.dataset.alertId = a.id;
        el.dataset.status = a.status;

        const line1 = h('div', 'display:flex;align-items:center;gap:8px;min-width:0;');
        line1.appendChild(h('span', 'font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', alertTicker(a.symbol), 'al-ticker'));
        const sc = statusColor(a.status, this._theme);
        line1.appendChild(h('span', `flex-shrink:0;padding:1px 7px;border-radius:9px;font-size:10px;font-weight:600;line-height:14px;color:${sc.fg};background:${sc.bg};`, statusLabel(a.status), 'al-pill'));
        const stamp = a.status === 'triggered' && a.triggeredAt ? a.triggeredAt : a.createdAt;
        const time = h('span', `margin-left:auto;flex-shrink:0;font-size:11px;color:${c.muted};white-space:nowrap;`, relativeTime(stamp, now), 'al-time');
        time.title = new Date(stamp).toLocaleString();
        line1.appendChild(time);
        el.appendChild(line1);

        let condText: string;
        if (a.source === 'drawing') {
            condText = `${conditionLabel(a.condition)} ${a.drawingLabel || t('Drawing')}`;
            if (alertsStore.drawingPresence(a) === false) condText += ` ${t('(drawing deleted)')}`;
        } else if (isMovingCondition(a.condition) && a.moveValue != null && a.moveBars != null) {
            condText = movingSummary(a.condition, a.moveValue, a.moveBars, a.interval ?? DEFAULT_ALERT_INTERVAL);
        } else {
            condText = `${conditionLabel(a.condition)} ${this._priceText(a.symbol, a.price)}`;
        }
        const condEl = h('div', `margin-top:2px;display:flex;align-items:center;gap:4px;font-size:12px;color:${c.text};font-variant-numeric:tabular-nums;`, undefined, 'al-cond');
        condEl.appendChild(h('span', 'min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', condText, 'al-cond-text'));
        if (a.trigger && a.trigger !== 'once') {
            const rec = h('span', `flex-shrink:0;font-size:12px;line-height:1;color:${c.muted};`, '\u21BB', 'al-recurring');
            rec.title = triggerLabel(a.trigger);
            condEl.appendChild(rec);
        }
        el.appendChild(condEl);
        const sub = a.name || a.message;
        if (sub) el.appendChild(h('div', `margin-top:1px;font-size:11px;color:${c.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`, sub, 'al-sub'));

        const acts = h('div', `position:absolute;right:8px;top:6px;display:none;gap:2px;padding:2px;border-radius:5px;background:${c.hover};box-shadow:0 0 0 1px ${c.border};`, undefined, 'al-actions');
        const mk = (svg: string, title: string, cls: string, fn: () => void): HTMLButtonElement => {
            const b = document.createElement('button');
            b.className = cls;
            b.innerHTML = svg;
            b.title = title;
            b.setAttribute('aria-label', title);
            b.style.cssText = `display:flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:none;background:transparent;color:${c.muted};border-radius:4px;cursor:pointer;`;
            b.addEventListener('mouseenter', () => { b.style.background = c.active; b.style.color = c.text; });
            b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; b.style.color = c.muted; });
            b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
            return b;
        };
        const running = a.status === 'active';
        acts.append(
            mk(running ? PAUSE_SVG : PLAY_SVG, running ? t('Stop alert') : t('Restart alert'), running ? 'al-act-stop' : 'al-act-restart', () => void this._toggleStatus(a)),
            mk(EDIT_SVG, t('Edit alert'), 'al-act-edit', () => this._edit(a)),
            mk(TRASH_SVG.replace('width="18" height="18"', 'width="16" height="16"'), t('Delete alert'), 'al-act-delete', () => void this._delete(a)),
        );
        el.appendChild(acts);

        el.addEventListener('mouseenter', () => { el.style.background = c.hover; time.style.visibility = 'hidden'; acts.style.display = 'flex'; });
        el.addEventListener('mouseleave', () => { el.style.background = baseBg; time.style.visibility = 'visible'; acts.style.display = 'none'; });
        el.addEventListener('click', () => this._goTo(a.symbol));
        return el;
    }

    private _renderLog(c: WlColors): void {
        if (this._confirmClear) {
            const bar = h('div', `display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid ${c.border};background:${c.hover};font-size:12px;`, undefined, 'al-confirm');
            bar.appendChild(h('span', 'flex:1 1 auto;', t('Clear the log?')));
            const cancel = h('button', `padding:4px 10px;border-radius:4px;border:1px solid ${c.border};background:transparent;color:${c.text};font:inherit;font-size:12px;cursor:pointer;`, t('Cancel'), 'al-confirm-cancel');
            cancel.addEventListener('click', () => { this._confirmClear = false; this._renderList(); });
            const ok = h('button', 'padding:4px 10px;border-radius:4px;border:1px solid #f23645;background:#f23645;color:#fff;font:inherit;font-size:12px;cursor:pointer;', t('Clear'), 'al-confirm-ok');
            ok.addEventListener('click', () => void this._clearLog());
            bar.append(cancel, ok);
            this._list.appendChild(bar);
        }
        if (this._renderStateBlockers()) return;
        const entries = this._log ?? [];
        if (entries.length === 0) {
            this._empty(t('No alerts have fired yet'), undefined, 'al-empty al-empty-log');
            return;
        }
        for (const e of entries) this._list.appendChild(this._logRow(e, c));
    }

    private _logRow(e: AlertLogEntry, c: WlColors): HTMLElement {
        const el = h('div', `padding:8px 14px;border-bottom:1px solid ${c.border};cursor:pointer;`, undefined, 'al-log-row');
        el.dataset.entryId = e.id;
        const line1 = h('div', 'display:flex;align-items:baseline;gap:8px;min-width:0;');
        line1.appendChild(h('span', 'font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', alertTicker(e.symbol), 'al-log-ticker'));
        line1.appendChild(h('span', `margin-left:auto;flex-shrink:0;font-size:11px;color:${c.muted};font-variant-numeric:tabular-nums;white-space:nowrap;`, formatLogTime(e.firedAt), 'al-log-time'));
        el.appendChild(line1);
        const msg = e.message || e.name;
        if (msg) el.appendChild(h('div', `margin-top:2px;font-size:12px;color:${c.text};overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word;`, msg, 'al-log-msg'));
        el.appendChild(h('div', `margin-top:2px;font-size:11px;color:${c.muted};font-variant-numeric:tabular-nums;`, `${t('Price')} ${this._priceText(e.symbol, e.price)}`, 'al-log-price'));
        el.addEventListener('mouseenter', () => { el.style.background = c.hover; });
        el.addEventListener('mouseleave', () => { el.style.background = 'transparent'; });
        el.addEventListener('click', () => this._goTo(e.symbol));
        return el;
    }
}
