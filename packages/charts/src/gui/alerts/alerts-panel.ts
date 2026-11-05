/**
 * Alerts manager panel (right sidebar, same geometry / theming as the watchlist panel).
 * Segmented tabs: active / triggered / stopped alerts (search, sort, per-row stop-restart / edit / delete) and the fired-alert log.
 * Data comes from the page-level alertsStore; the panel only needs the ACTIVE chart (via `getChart`) for price
 * formatting, the create / edit dialogs and symbol switching, so it works the same in single and multi-chart mode.
 */
import { Delegate } from '../../helpers/delegate';
import { t } from '../../helpers/translations';
import { alertsStore, AlertsStoreEvent } from '../../alerts/alerts-store';
import { alertErrorText, alertMatchesSymbol, alertTicker, conditionLabel, indicatorAlertSummary, exactPrice, isMovingCondition, movingSummary, triggerLabel, DEFAULT_ALERT_INTERVAL } from '../../alerts/alert-text';
import { AlertsError } from '../../alerts/types';
import type { AlertLogEntry, AlertStatus, ChartAlert } from '../../alerts/types';
import { ContextMenu, ContextMenuItem } from '../context_menu/context_menu';
import type { SymbolInfo } from '../symbol_search/symbol_model';
import { isFuturesExchange, sourceOf } from '../symbol_search/symbol_model';
import { symbolCatalog } from '../symbol_search/symbol_data';
import { WL_COLORS, WlColors } from '../watchlist/watchlist_theme';
import { applyRpTokens, ensureRpStyles, rpEmptyState, RP_MENU_SKIN, RP_SEARCH_SVG, RP_FONT as RP_FONT_SANS } from '../right_panel/rp_tokens';
import { showToast } from '../toast/toast';
import { AlertDialogChart, openAlertDialog } from './alert-dialog';
import {
    AlertListTab, AlertSortKey, LIST_TABS, SORT_KEYS, UnreadCounter,
    activeBySource, countByTab, filterAlerts, formatLogTime, mergeLog, normStatus, prependLog, relativeTime, sortAlerts, sortLabel, statusLabel, tabOfStatus,
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
const FONT = RP_FONT_SANS;

const BELL_PLUS_SVG = '<svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 15.2h2.4M2.9 13.4l1-1.1V8.1a4.6 4.6 0 0 1 6-4.4M14.9 8.1v4.2l1 1.1H5.9"/><path d="M13.6 2v4.4M11.4 4.2h4.4"/></svg>';
const CLOSE_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/></svg>';
const SORT_SVG = '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 5h12M5.5 9h7M8 13h2"/></svg>';
const TRASH_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5h11M7 5V3.5h4V5M5 5l.7 9h6.6L13 5M7.5 7.5v4.5M10.5 7.5v4.5"/></svg>';
const PAUSE_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="2.8" height="10" rx="0.6"/><rect x="9.2" y="3" width="2.8" height="10" rx="0.6"/></svg>';
const PLAY_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 3l8 5-8 5z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>';
const EDIT_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l.6-2.8 7.2-7.2 2.2 2.2-7.2 7.2L3 13zM9.6 4.2l2.2 2.2"/></svg>';
const BELL_SVG = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 14V9a5 5 0 0 1 10 0v5l1.5 1.5h-13zM8.5 17.5h3"/></svg>';
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
        .tv-alerts-panel { container-type: inline-size; container-name: alp; }
        .tv-alerts-panel .al-hdr { display: flex; align-items: center; justify-content: space-between; gap: 8px; height: 60px; padding: 0 10px 0 16px; flex-shrink: 0; box-sizing: border-box; border-bottom: 1px solid var(--rp-border); }
        .tv-alerts-panel .al-title { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; color: var(--rp-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tv-alerts-panel .al-sum { display: flex; align-items: center; gap: 12px; padding: 14px 16px 14px; flex-shrink: 0; box-sizing: border-box; }
        .tv-alerts-panel .al-sum-text { flex: 1 1 0; min-width: 0; font-size: 12px; line-height: 1.4; color: var(--rp-muted); overflow-wrap: anywhere; }
        .tv-alerts-panel .al-new { display: inline-flex; align-items: center; justify-content: center; gap: 7px; flex: none; height: 30px; padding: 0 12px; border: 0; border-radius: 8px; background: var(--rp-text); color: var(--rp-bg); font: inherit; font-size: 12.5px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: opacity .12s; }
        .tv-alerts-panel .al-new:hover { opacity: .88; }
        .tv-alerts-panel .al-new svg { flex: none; }
        .tv-alerts-panel .al-seg { display: flex; gap: 2px; height: 40px; padding: 3px; margin: 0 16px 12px; flex-shrink: 0; box-sizing: border-box; border: 1px solid var(--rp-border); border-radius: 12px; }
        .tv-alerts-panel .al-tab { flex: 1 1 auto; min-width: 0; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 0 6px; border: 1px solid transparent; border-radius: 9px; background: transparent; color: var(--rp-muted); font: inherit; font-size: 12.5px; font-weight: 500; white-space: nowrap; cursor: pointer; transition: background .12s, color .12s, border-color .12s; }
        .tv-alerts-panel .al-tab:hover:not([data-on="1"]) { color: var(--rp-text); }
        .tv-alerts-panel .al-tab[data-on="1"] { background: var(--rp-chip); border-color: var(--rp-border); color: var(--rp-text); }
        .tv-alerts-panel .al-tab-label { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        .tv-alerts-panel .al-tab-n { flex: none; font-size: 11px; font-weight: 400; color: var(--rp-muted); }
        .tv-alerts-panel .al-srow { display: flex; align-items: center; gap: 8px; padding: 0 16px 14px; flex-shrink: 0; box-sizing: border-box; }
        .tv-alerts-panel .al-srow .rp-search { flex: 1 1 auto; min-width: 0; margin: 0; }
        .tv-alerts-panel .al-srow .rp-search > input { height: 38px; border-radius: 10px; }
        .tv-alerts-panel .al-sort-btn { flex: none; width: 38px; height: 38px; border: 1px solid var(--rp-border); border-radius: 10px; }
        .tv-alerts-panel .al-logbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 16px 14px; flex-shrink: 0; box-sizing: border-box; font-size: 12px; color: var(--rp-muted); }
        .tv-alerts-panel .al-clear-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px solid var(--rp-border); border-radius: 10px; background: transparent; color: var(--rp-text); font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; transition: background .12s; }
        .tv-alerts-panel .al-clear-btn:hover { background: var(--rp-hover); }
        .tv-alerts-panel .al-list { border-top: 1px solid var(--rp-border); }
        .tv-alerts-panel .al-row, .tv-alerts-panel .al-log-row { position: relative; padding: 12px 16px; border-bottom: 1px solid var(--rp-border); cursor: pointer; box-sizing: border-box; }
        .tv-alerts-panel .al-row:hover, .tv-alerts-panel .al-log-row:hover { background: var(--rp-hover); }
        .tv-alerts-panel .al-confirm { display: flex; align-items: center; gap: 8px; margin: 0 16px 14px; padding: 8px 8px 8px 12px; border-radius: 12px; background: var(--rp-chip); font-size: 12px; flex-shrink: 0; box-sizing: border-box; }
        .tv-alerts-panel .al-confirm-text { flex: 1 1 auto; min-width: 0; }
        .tv-alerts-panel .al-line1 { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .tv-alerts-panel .al-ticker, .tv-alerts-panel .al-log-ticker { flex: 1 1 auto; min-width: 0; font-size: 13.5px; font-weight: 500; letter-spacing: -0.005em; color: var(--rp-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tv-alerts-panel .al-pill { flex: none; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; line-height: 16px; transition: opacity .12s; }
        .tv-alerts-panel .al-line2, .tv-alerts-panel .al-sub { margin-top: 2px; font-size: 12px; line-height: 1.4; color: var(--rp-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tv-alerts-panel .al-log-msg { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
        .tv-alerts-panel .al-actions { position: absolute; right: 0; top: 0; bottom: 0; display: flex; align-items: center; gap: 2px; padding: 0 12px 0 28px; background: linear-gradient(to right, transparent, var(--rp-hover) 22px); opacity: 0; pointer-events: none; transition: opacity .12s; }
        .tv-alerts-panel .al-row:hover .al-actions, .tv-alerts-panel .al-row:focus-within .al-actions { opacity: 1; pointer-events: auto; }
        .tv-alerts-panel .al-row:hover .al-pill, .tv-alerts-panel .al-row:focus-within .al-pill { opacity: 0; }
        .tv-alerts-panel .al-act { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--rp-muted); cursor: pointer; }
        .tv-alerts-panel .al-act:hover:not(:disabled) { background: var(--rp-chip); color: var(--rp-text); }
        .tv-alerts-panel .al-act-delete:hover:not(:disabled) { color: var(--rp-down); }
        .tv-alerts-panel .al-act:disabled { opacity: .4; cursor: default; }
        .tv-alerts-panel .al-empty-create { margin-top: 10px; }
        @container alp (max-width: 319px) {
            .tv-alerts-panel .al-new-label { display: none; }
            .tv-alerts-panel .al-new { padding: 0 11px; }
            .tv-alerts-panel .al-tab { font-size: 12px; padding: 0 4px; }
        }
        @container alp (max-width: 399px) {
            .tv-alerts-panel .al-tab { font-size: 12px; gap: 4px; padding: 0 4px; }
            .tv-alerts-panel .al-tab-n { font-size: 10.5px; }
        }
        @container alp (max-width: 279px) {
            .tv-alerts-panel .al-tab-n { display: none; }
            .tv-alerts-panel .al-sum { gap: 8px; padding-left: 12px; padding-right: 12px; }
            .tv-alerts-panel .al-seg, .tv-alerts-panel .al-srow, .tv-alerts-panel .al-logbar { margin-left: 12px; margin-right: 12px; padding-left: 0; padding-right: 0; }
            .tv-alerts-panel .al-confirm { margin-left: 12px; margin-right: 12px; }
            .tv-alerts-panel .al-row, .tv-alerts-panel .al-log-row { padding-left: 12px; padding-right: 12px; }
        }
        @media (prefers-reduced-motion: reduce) { .tv-alerts-panel * { transition: none !important; } }
    `;
    document.head.appendChild(st);
}

interface StatusColor { fg: string; bg: string }

function statusColor(status: AlertStatus, theme: 'dark' | 'light'): StatusColor {
    const dark = theme === 'dark';
    switch (normStatus(status)) {
        case 'active': return { fg: dark ? '#22ab94' : '#089981', bg: dark ? 'rgba(8,153,129,0.18)' : 'rgba(8,153,129,0.12)' };
        case 'triggered': return { fg: dark ? '#ff9800' : '#e07b00', bg: dark ? 'rgba(255,152,0,0.18)' : 'rgba(255,152,0,0.14)' };
        case 'expired': return { fg: dark ? '#c9606a' : '#b5424d', bg: dark ? 'rgba(242,54,69,0.14)' : 'rgba(242,54,69,0.09)' };
        default: return { fg: dark ? '#868993' : '#6a6d78', bg: dark ? 'rgba(134,137,147,0.18)' : 'rgba(106,109,120,0.12)' };
    }
}

type TabId = AlertListTab | 'log';

export class AlertsPanel {
    readonly visibilityChanged = new Delegate<boolean>();
    readonly widthChanged = new Delegate<number>();
    /** Fires the unread count of fired alerts (0 when the panel is opened). */
    readonly unreadChanged = new Delegate<number>();

    private readonly _parent: HTMLElement;
    private readonly _getChart: () => AlertsPanelChart | null;
    private readonly _el: HTMLElement;
    private _list: HTMLElement;
    private _tabEls = new Map<TabId, HTMLElement>();
    private _countEls = new Map<AlertListTab, HTMLElement>();
    private _sumText: HTMLElement | null = null;
    private _searchRow: HTMLElement | null = null;
    private _logBar: HTMLElement | null = null;
    private _confirmEl: HTMLElement | null = null;
    private _sortBtn: HTMLButtonElement | null = null;
    private _ctx: ContextMenu | null = null;

    private _width = DEFAULT_WIDTH;
    /** true once docked in the shared right panel container (it owns width, border and visibility). */
    private _embedded = false;
    private _visible = false;
    private _theme: 'dark' | 'light' = 'dark';
    private _tab: TabId = 'active';
    private _sort: AlertSortKey = 'created';
    private _query = '';
    private _loading = false;
    private _loadError = false;
    private _authError = false;
    private _log: AlertLogEntry[] | null = null;
    private _logLoading = false;
    private _logError = false;
    private _logAuthError = false;
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
        this._el.className = 'tv-alerts-panel rp-root';
        this._el.style.cssText = `
            position: absolute; top: ${top}px; right: 0; bottom: 0;
            width: ${this._width}px; display: none; flex-direction: column;
            z-index: 30; font-size: 12px; font-family: ${FONT}; box-sizing: border-box; user-select: none; outline: none;
        `;
        this._list = document.createElement('div');
        ensureStyles();
        ensureRpStyles();
        parent.appendChild(this._el);
        this._unsubStore = alertsStore.onChange((ev) => this._onStore(ev));
        this._render();
    }

    /** Docks the panel inside the shared right panel container (fills it; the container owns width / border / visibility). */
    embed(container: HTMLElement): void {
        this._embedded = true;
        this._el.style.cssText = `position:relative;flex:1;min-height:0;width:100%;display:flex;flex-direction:column;`
            + `font-size:12px;font-family:${FONT};box-sizing:border-box;user-select:none;outline:none;`;
        container.appendChild(this._el);
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
            if (!this._embedded) this._el.style.display = 'flex';
            if (this._unread.reset()) this.unreadChanged.fire(0);
            this._renderList();
            void this._refresh();
            if (this._tab === 'log') void this._loadLog();
            this._tick = setInterval(() => this._renderList(), TICK_MS);
        } else {
            if (!this._embedded) this._el.style.display = 'none';
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
        if (this._embedded) return;
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
        this._authError = false;
        this._renderList();
        this._selfRefresh = true;
        try {
            await alertsStore.refresh();
        } catch (e) {
            this._loadError = true;
            this._authError = e instanceof AlertsError && e.code === 'auth';
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
        this._logAuthError = false;
        this._liveDuringLoad = [];
        this._renderList();
        try {
            const fetched = await alertsStore.log();
            if (token !== this._logToken) return;
            this._log = mergeLog(fetched, this._liveDuringLoad);
        } catch (e) {
            if (token === this._logToken) {
                this._logError = true;
                this._logAuthError = e instanceof AlertsError && e.code === 'auth';
            }
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
            if (normStatus(a.status) === 'active') await alertsStore.stop(a.id);
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
        this._list.scrollTop = 0;
        this._renderList();
        if (tab === 'log') void this._loadLog();
    }

    // ---- menus ----

    private _openSortMenu(anchor: HTMLElement): void {
        const items: ContextMenuItem[] = [{ id: 'h-sort', label: t('Sort'), disabled: true }];
        for (const k of SORT_KEYS) {
            items.push({
                id: `s-${k}`, label: sortLabel(k), icon: k === this._sort ? CHECK_SVG : '',
                action: () => { this._sort = k; this._renderList(); },
            });
        }
        if (!this._ctx) this._ctx = new ContextMenu({ items, container: this._parent, theme: this._theme, skin: RP_MENU_SKIN });
        else this._ctx.setItems(items);
        this._ctx.hide();
        this._ctx.showAnchored(anchor.getBoundingClientRect());
    }

    // ---- drawing ----

    private get _c(): WlColors { return WL_COLORS[this._theme]; }

    private _tabLabel(id: TabId): string {
        switch (id) {
            case 'active': return t('Active');
            case 'triggered': return t('Fired');
            case 'stopped': return t('Paused');
            default: return t('Log');
        }
    }

    private _render(): void {
        const c = this._c;
        applyRpTokens(this._el, this._theme);
        this._el.style.background = c.bg;
        this._el.style.borderLeft = this._embedded ? 'none' : `1px solid ${c.border}`;
        this._el.style.color = c.text;
        this._el.style.setProperty('--al-scroll', c.scrollThumb);
        this._el.style.setProperty('--al-accent', c.accent);
        this._el.style.setProperty('--al-muted', c.muted);
        this._el.replaceChildren();
        this._tabEls.clear();
        this._countEls.clear();
        this._confirmEl = null;

        // Header: title + close
        const header = h('div', '', undefined, 'al-hdr');
        header.appendChild(h('div', '', t('Alerts'), 'al-title'));
        const actions = h('div', '', undefined, 'rp-acts');
        const closeBtn = document.createElement('button');
        closeBtn.className = 'rp-ib al-close-btn';
        closeBtn.innerHTML = CLOSE_SVG;
        closeBtn.title = t('Close');
        closeBtn.setAttribute('aria-label', t('Close'));
        closeBtn.addEventListener('click', () => this.setVisible(false));
        actions.appendChild(closeBtn);
        header.appendChild(actions);
        this._el.appendChild(header);

        // Summary + new alert
        const sum = h('div', '', undefined, 'al-sum');
        this._sumText = h('div', '', undefined, 'al-sum-text');
        const addBtn = document.createElement('button');
        addBtn.className = 'al-new al-add-btn';
        addBtn.title = t('Create alert');
        addBtn.setAttribute('aria-label', t('Create alert'));
        const addIc = h('span', 'display:flex;');
        addIc.innerHTML = BELL_PLUS_SVG;
        addBtn.append(addIc, h('span', '', t('New alert'), 'al-new-label'));
        addBtn.addEventListener('click', () => this._createAlert());
        sum.append(this._sumText, addBtn);
        this._el.appendChild(sum);

        // Segmented tabs
        const seg = h('div', '', undefined, 'al-seg');
        for (const id of [...LIST_TABS, 'log'] as TabId[]) {
            const tab = h('button', '', undefined, `al-tab al-tab-${id}`);
            tab.appendChild(h('span', '', this._tabLabel(id), 'al-tab-label'));
            if (id !== 'log') {
                const n = h('span', '', '0', 'rp-num al-tab-n');
                this._countEls.set(id, n);
                tab.appendChild(n);
            }
            tab.addEventListener('click', () => this._setTab(id));
            this._tabEls.set(id, tab);
            seg.appendChild(tab);
        }
        this._el.appendChild(seg);

        // Search + sort (alert tabs)
        const searchRow = h('div', '', undefined, 'al-srow al-search-wrap');
        const searchBox = h('div', '', undefined, 'rp-search');
        const searchIc = h('span', 'position:absolute;left:11px;display:flex;pointer-events:none;color:var(--rp-muted,#787b86);');
        searchIc.innerHTML = RP_SEARCH_SVG;
        const search = document.createElement('input');
        search.className = 'al-search';
        search.type = 'text';
        search.placeholder = t('Search alerts');
        search.value = this._query;
        search.addEventListener('input', () => { this._query = search.value; this._renderList(); });
        searchBox.append(searchIc, search);
        const sortBtn = document.createElement('button');
        sortBtn.className = 'rp-ib al-sort-btn al-filter-btn';
        sortBtn.innerHTML = SORT_SVG;
        sortBtn.title = t('Sort');
        sortBtn.setAttribute('aria-label', t('Sort'));
        sortBtn.addEventListener('click', () => this._openSortMenu(sortBtn));
        this._sortBtn = sortBtn;
        searchRow.append(searchBox, sortBtn);
        this._searchRow = searchRow;
        this._el.appendChild(searchRow);

        // Log bar (log tab): entry count + clear
        const logBar = h('div', '', undefined, 'al-logbar');
        logBar.appendChild(h('span', '', '', 'al-logbar-n'));
        const clearBtn = document.createElement('button');
        clearBtn.className = 'al-clear-btn';
        clearBtn.title = t('Clear log');
        clearBtn.setAttribute('aria-label', t('Clear log'));
        const trIc = h('span', 'display:flex;');
        trIc.innerHTML = TRASH_SVG.replace('width="18" height="18"', 'width="15" height="15"');
        clearBtn.append(trIc, h('span', '', t('Clear log')));
        clearBtn.addEventListener('click', () => { this._confirmClear = true; this._renderList(); });
        logBar.appendChild(clearBtn);
        this._logBar = logBar;
        this._el.appendChild(logBar);

        this._list = h('div', 'flex:1 1 auto;min-height:0;overflow-y:auto;', undefined, 'al-list');
        this._el.appendChild(this._list);

        this._updateTabs();
        this._renderList();
    }

    private _updateTabs(): void {
        for (const [id, el] of this._tabEls) el.dataset.on = id === this._tab ? '1' : '0';
    }

    private _priceText(symbol: string, price: number): string {
        const chart = this._getChart();
        return chart && alertMatchesSymbol(symbol, chart.alertSymbolId()) ? chart.formatAlertPrice(price) : exactPrice(price);
    }

    private _summaryText(): string {
        if (!alertsStore.hasBackend) return '';
        const k = activeBySource(alertsStore.alerts());
        const plan = alertsStore.limit > 0 ? ` ${t('(in your plan: {limit})').replace('{limit}', String(alertsStore.limit))}` : '';
        if (k.indicator > 0) {
            return t('{p} price, {d} drawing and {i} indicator alerts active')
                .replace('{p}', String(k.price)).replace('{d}', String(k.drawing)).replace('{i}', String(k.indicator)) + plan;
        }
        return t('{p} price alerts and {d} drawing alerts active')
            .replace('{p}', String(k.price)).replace('{d}', String(k.drawing)) + plan;
    }

    private _renderList(): void {
        if (this._destroyed) return;
        const c = this._c;
        const isLog = this._tab === 'log';
        const keepScroll = this._list.scrollTop;
        if (this._sumText) this._sumText.textContent = this._summaryText();
        const counts = countByTab(alertsStore.alerts());
        for (const [id, el] of this._countEls) el.textContent = String(counts[id]);
        if (this._searchRow) this._searchRow.style.display = isLog ? 'none' : 'flex';
        if (this._sortBtn) this._sortBtn.style.color = this._sort !== 'created' ? c.accent : '';
        if (this._logBar) {
            const n = this._log?.length ?? 0;
            const show = isLog && n > 0;
            this._logBar.style.display = show ? 'flex' : 'none';
            const nEl = this._logBar.querySelector('.al-logbar-n');
            if (nEl) nEl.textContent = show ? t('{n} entries').replace('{n}', String(n)) : '';
        }
        this._renderConfirm(isLog && this._confirmClear);
        this._list.replaceChildren();
        if (isLog) this._renderLog();
        else this._renderAlerts(c);
        this._list.scrollTop = keepScroll;
    }

    private _empty(text: string, extra?: HTMLElement, cls = 'al-empty', sub?: string): void {
        const box = rpEmptyState(BELL_SVG, text, sub, cls);
        if (extra) {
            extra.style.marginTop = '10px';
            box.appendChild(extra);
        }
        this._list.appendChild(box);
    }

    private _renderStateBlockers(): boolean {
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
            if (this._tab === 'log' ? this._logAuthError : this._authError) {
                this._empty(t('Sign in to view alerts'), undefined, 'al-empty al-empty-auth');
                return true;
            }
            const retry = h('button', '', t('Retry'), 'rp-pill al-retry');
            retry.addEventListener('click', () => { if (this._tab === 'log') void this._loadLog(); else void this._refresh(); });
            this._empty(t('Could not load alerts'), retry, 'al-empty al-error');
            return true;
        }
        return false;
    }

    private _renderAlerts(c: WlColors): void {
        if (this._renderStateBlockers()) return;
        const all = alertsStore.alerts();
        const tab = this._tab as AlertListTab;
        const inTab = all.filter((a) => tabOfStatus(a.status) === tab);
        if (inTab.length === 0) {
            if (all.length === 0) {
                const btn = h('button', '', t('Create alert'), 'al-new al-empty-create');
                btn.addEventListener('click', () => this._createAlert());
                this._empty(t('No alerts yet'), btn, 'al-empty al-empty-none');
            } else {
                const text = tab === 'active' ? t('No active alerts') : tab === 'triggered' ? t('No triggered alerts') : t('No stopped alerts');
                this._empty(text, undefined, 'al-empty al-empty-tab');
            }
            return;
        }
        const rows = sortAlerts(filterAlerts(inTab, 'all', this._query), this._sort);
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
        const el = h('div', '', undefined, 'al-row');
        if (isActive) el.appendChild(h('span', `position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:0 2px 2px 0;background:${c.accent};pointer-events:none;`, undefined, 'al-active-bar'));
        el.dataset.alertId = a.id;
        el.dataset.status = normStatus(a.status);

        let condText: string;
        if (a.source === 'drawing') {
            condText = `${conditionLabel(a.condition)} ${a.drawingLabel || t('Drawing')}`;
            if (alertsStore.drawingPresence(a) === false) condText += ` ${t('(drawing deleted)')}`;
        } else if (a.source === 'indicator' && a.left) {
            condText = indicatorAlertSummary(a);
        } else if (isMovingCondition(a.condition) && a.moveValue != null && a.moveBars != null) {
            condText = movingSummary(a.condition, a.moveValue, a.moveBars, a.interval ?? DEFAULT_ALERT_INTERVAL);
        } else {
            condText = `${conditionLabel(a.condition)} ${this._priceText(a.symbol, a.price)}`;
        }

        const line1 = h('div', '', undefined, 'al-line1');
        const ticker = alertTicker(a.symbol);
        line1.appendChild(h('span', '', `${ticker} ${condText}`, 'al-ticker'));
        const sc = statusColor(a.status, this._theme);
        line1.appendChild(h('span', `color:${sc.fg};background:${sc.bg};`, normStatus(a.status) === 'active' ? t('Live') : statusLabel(a.status), 'al-pill'));
        el.appendChild(line1);

        const parts = [a.symbol, condText, triggerLabel(a.trigger ?? 'once')];
        const st = normStatus(a.status);
        const stamp = st === 'triggered' && a.triggeredAt ? a.triggeredAt : a.createdAt;
        if (st === 'triggered' && a.triggeredAt) parts.push(relativeTime(a.triggeredAt, now));
        const line2 = h('div', '', parts.join(' · '), 'al-line2 al-cond');
        line2.title = new Date(stamp).toLocaleString();
        el.appendChild(line2);
        const sub = a.name || a.message;
        if (sub) el.appendChild(h('div', '', sub, 'al-sub'));

        const acts = h('div', '', undefined, 'al-actions');
        const mk = (svg: string, title: string, cls: string, fn: () => void): HTMLButtonElement => {
            const b = document.createElement('button');
            b.className = `al-act ${cls}`;
            b.innerHTML = svg;
            b.title = title;
            b.setAttribute('aria-label', title);
            // a request of this alert is in flight: no double clicks
            if (this._busy.has(a.id)) b.disabled = true;
            b.addEventListener('click', (e) => { e.stopPropagation(); if (!b.disabled) fn(); });
            return b;
        };
        const running = normStatus(a.status) === 'active';
        acts.append(
            mk(running ? PAUSE_SVG : PLAY_SVG, running ? t('Stop alert') : t('Restart alert'), running ? 'al-act-stop' : 'al-act-restart', () => void this._toggleStatus(a)),
            mk(EDIT_SVG, t('Edit alert'), 'al-act-edit', () => this._edit(a)),
            mk(TRASH_SVG.replace('width="18" height="18"', 'width="16" height="16"'), t('Delete alert'), 'al-act-delete', () => void this._delete(a)),
        );
        el.appendChild(acts);

        el.addEventListener('click', () => this._goTo(a.symbol));
        return el;
    }

    /** Clear-log confirmation lives under the log bar (outside the scrolling list) so it is always visible. */
    private _renderConfirm(show: boolean): void {
        this._confirmEl?.remove();
        this._confirmEl = null;
        if (!show || !this._logBar) return;
        const bar = h('div', '', undefined, 'al-confirm');
        bar.appendChild(h('span', '', t('Clear the log?'), 'al-confirm-text'));
        const cancel = h('button', '', t('Cancel'), 'rp-pill al-confirm-cancel');
        cancel.addEventListener('click', () => { this._confirmClear = false; this._renderList(); });
        const ok = h('button', '', t('Clear'), 'rp-pill rp-danger al-confirm-ok');
        ok.addEventListener('click', () => void this._clearLog());
        bar.append(cancel, ok);
        this._logBar.after(bar);
        this._confirmEl = bar;
    }

    private _renderLog(): void {
        if (this._renderStateBlockers()) return;
        const entries = this._log ?? [];
        if (entries.length === 0) {
            this._empty(t('No alerts have fired yet'), undefined, 'al-empty al-empty-log');
            return;
        }
        for (const e of entries) this._list.appendChild(this._logRow(e));
    }

    private _logRow(e: AlertLogEntry): HTMLElement {
        const el = h('div', '', undefined, 'al-log-row');
        el.dataset.entryId = e.id;
        const line1 = h('div', '', undefined, 'al-line1');
        line1.appendChild(h('span', '', `${alertTicker(e.symbol)} ${this._priceText(e.symbol, e.price)}`, 'al-log-ticker'));
        line1.appendChild(h('span', 'flex:none;font-size:12px;color:var(--rp-muted);white-space:nowrap;', formatLogTime(e.firedAt), 'rp-num al-log-time'));
        el.appendChild(line1);
        const msg = e.message || e.name;
        const full = [e.symbol, conditionLabel(e.condition), msg].filter(Boolean).join(' · ');
        const m = h('div', '', full, 'al-line2 al-log-msg');
        m.title = full;
        el.appendChild(m);
        el.addEventListener('click', () => this._goTo(e.symbol));
        return el;
    }
}
