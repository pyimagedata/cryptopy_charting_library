/**
 * Alert lines on the main pane of ONE chart: a 1px horizontal line per active alert of the chart's symbol,
 * a pill (bell + condition) at the right end with hover edit / delete buttons, vertical drag to move the alert.
 * The price-axis label is drawn by PriceAxisWidget (labels returned from sync()).
 *
 * Hit-testing: capture-first listeners on the pane canvas (registered before the chart's own ones) claim
 * mousedown / dblclick only inside the +-HIT_PX band around a line, so drawings, panning and drawing creation
 * are untouched everywhere else. The pill is a DOM element above the canvas and handles its own events.
 */
import { t } from '../../helpers/translations';
import { startDragSession } from '../../helpers/drag-session';
import { alertsStore } from '../../alerts/alerts-store';
import { getAlertSettings, onAlertSettingsChange } from '../../alerts/alert-settings';
import { DEFAULT_ALERT_COLOR, alertTicker, conditionLabel, isAutoAlertMessage, isMovingCondition, snapAlertPrice } from '../../alerts/alert-text';
import { ChartAlert } from '../../alerts/types';
import { showToast } from '../toast/toast';

export const ALERT_HIT_PX = 4;
const DRAG_THRESHOLD_PX = 3;

export interface AlertLinesHost {
    paneElement(): HTMLElement | null;
    paneCanvas(): HTMLCanvasElement | null;
    symbol(): string;
    /** Main-pane local y of a price, null when unavailable. */
    priceToY(price: number): number | null;
    yToPrice(y: number): number | null;
    formatPrice(price: number): string;
    priceStep(): number | null;
    theme(): 'light' | 'dark';
    /** Visible height of the main pane. */
    paneHeight(): number;
    requestDraw(): void;
    /** True while a drawing / interaction tool owns the mouse. */
    blocked(): boolean;
    openEdit(alert: ChartAlert): void;
}

export interface AlertAxisLabel { price: number; text: string; color: string }

const BELL_SVG = (color: string) => `<svg width="12" height="12" viewBox="0 0 12 12" fill="${color}" stroke="none" style="flex:0 0 auto"><path d="M6 1.2a3.2 3.2 0 0 0-3.2 3.2c0 2.2-1.1 3.3-1.1 3.3h8.6s-1.1-1.1-1.1-3.3A3.2 3.2 0 0 0 6 1.2z"/><path d="M5 9.2a1 1 0 0 0 2 0z"/></svg>`;
const EDIT_SVG = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="M1.5 10.5l.5-2.5 6-6 2 2-6 6z"/><path d="M7 3l2 2"/></svg>`;

interface Row { alert: ChartAlert; line: HTMLDivElement; pill: HTMLDivElement; icon: HTMLSpanElement; label: HTMLSpanElement; btns: HTMLDivElement; y: number; price: number; iconColor: string }

export class AlertLinesController {
    private readonly _host: AlertLinesHost;
    private _layer: HTMLDivElement | null = null;
    private readonly _rows = new Map<string, Row>();
    private _hoverId: string | null = null;
    /** Live preview while dragging / waiting for the server. */
    private _preview: { id: string; price: number } | null = null;
    private _dragging = false;
    private _unsubs: Array<() => void> = [];
    private _canvas: HTMLCanvasElement | null = null;
    private _canvasCursorSet = false;
    private _disposed = false;
    private readonly _onCanvasDown = (e: MouseEvent) => this._canvasDown(e);
    private readonly _onCanvasMove = (e: MouseEvent) => this._canvasMove(e);
    private readonly _onCanvasLeave = (e: MouseEvent) => this._canvasLeave(e);
    private readonly _onCanvasDbl = (e: MouseEvent) => this._canvasDbl(e);

    constructor(host: AlertLinesHost) {
        this._host = host;
        const redraw = () => { if (!this._disposed) this._host.requestDraw(); };
        this._unsubs.push(alertsStore.onChange(redraw));
        this._unsubs.push(onAlertSettingsChange(redraw));
    }

    /** Registers the pane canvas listeners. Call BEFORE the chart adds its own mouse listeners. */
    attach(): void {
        const canvas = this._host.paneCanvas();
        const pane = this._host.paneElement();
        if (!canvas || !pane || this._layer) return;
        this._canvas = canvas;
        canvas.addEventListener('mousedown', this._onCanvasDown);
        canvas.addEventListener('mousemove', this._onCanvasMove);
        canvas.addEventListener('mouseleave', this._onCanvasLeave);
        canvas.addEventListener('dblclick', this._onCanvasDbl);
        const layer = document.createElement('div');
        layer.className = 'chart-alert-lines';
        layer.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;overflow:hidden;pointer-events:none;z-index:3;';
        pane.appendChild(layer);
        this._layer = layer;
    }

    dispose(): void {
        this._disposed = true;
        for (const u of this._unsubs) u();
        this._unsubs = [];
        this._abortDrag?.();
        const c = this._canvas;
        if (c) {
            c.removeEventListener('mousedown', this._onCanvasDown);
            c.removeEventListener('mousemove', this._onCanvasMove);
            c.removeEventListener('mouseleave', this._onCanvasLeave);
            c.removeEventListener('dblclick', this._onCanvasDbl);
        }
        this._layer?.remove();
        this._layer = null;
        this._rows.clear();
    }

    /** True while the user drags an alert (the chart should not show its "+" button etc.). */
    get dragging(): boolean { return this._dragging; }

    private _visibleAlerts(): ChartAlert[] {
        const symbol = this._host.symbol();
        // only plain price alerts have their own line (drawing alerts live on the drawing, moving ones have no level)
        return alertsStore.alertsForSymbol(symbol).filter((a) => a.status === 'active' && (a.source ?? 'price') === 'price' && !isMovingCondition(a.condition));
    }

    private _priceOf(a: ChartAlert): number {
        return this._preview && this._preview.id === a.id ? this._preview.price : a.price;
    }

    /** Called every chart draw: positions the DOM and returns the axis labels to draw. */
    sync(): AlertAxisLabel[] {
        const layer = this._layer;
        if (!layer || this._disposed) return [];
        const cfg = getAlertSettings();
        const height = this._host.paneHeight();
        const dark = this._host.theme() === 'dark';
        const axisLabels: AlertAxisLabel[] = [];
        const seen = new Set<string>();

        for (const a of this._visibleAlerts()) {
            const price = this._priceOf(a);
            const y = this._host.priceToY(price);
            if (y === null || !isFinite(y) || y < 0 || y > height) continue;
            const color = a.color || DEFAULT_ALERT_COLOR;
            if (cfg.axisLabels) axisLabels.push({ price, text: this._host.formatPrice(price), color });
            if (!cfg.lines) continue;
            seen.add(a.id);
            let row = this._rows.get(a.id);
            if (!row) { row = this._createRow(a); this._rows.set(a.id, row); layer.appendChild(row.line); layer.appendChild(row.pill); }
            row.alert = a;
            row.y = y;
            row.price = price;
            row.line.style.top = `${Math.floor(y)}px`;
            row.line.style.background = color;
            row.pill.style.top = `${Math.round(y) - 10}px`;
            row.pill.style.background = dark ? '#1e222d' : '#ffffff';
            row.pill.style.color = dark ? '#d1d4dc' : '#131722';
            row.pill.style.borderColor = color;
            if (row.iconColor !== color) { row.iconColor = color; row.icon.innerHTML = BELL_SVG(color); }
            row.label.textContent = conditionLabel(a.condition);
            row.btns.style.display = this._hoverId === a.id || this._dragging && this._preview?.id === a.id ? 'flex' : 'none';
            row.pill.title = `${alertTicker(a.symbol)} ${conditionLabel(a.condition)} ${this._host.formatPrice(price)}`;
        }
        for (const [id, row] of this._rows) {
            if (seen.has(id)) continue;
            row.line.remove();
            row.pill.remove();
            this._rows.delete(id);
            if (this._hoverId === id) this._hoverId = null;
        }
        return axisLabels;
    }

    // ---- DOM ----

    private _createRow(a: ChartAlert): Row {
        const line = document.createElement('div');
        line.className = 'chart-alert-line';
        line.dataset.alertId = a.id;
        line.style.cssText = 'position:absolute;left:0;right:0;height:1px;pointer-events:none;';

        const pill = document.createElement('div');
        pill.className = 'chart-alert-pill';
        pill.dataset.alertId = a.id;
        pill.style.cssText = 'position:absolute;right:6px;height:20px;box-sizing:border-box;display:flex;align-items:center;gap:5px;padding:0 6px;'
            + 'border:1px solid;border-radius:4px;font:11px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
            + 'white-space:nowrap;pointer-events:auto;cursor:ns-resize;user-select:none;';
        const icon = document.createElement('span');
        icon.style.cssText = 'display:inline-flex;align-items:center;';
        const label = document.createElement('span');
        const btns = document.createElement('div');
        btns.className = 'chart-alert-pill-btns';
        btns.style.cssText = 'display:none;align-items:center;gap:2px;margin-left:2px;';
        const mk = (cls: string, html: string, title: string, fn: () => void) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = cls;
            b.title = title;
            b.innerHTML = html;
            b.style.cssText = 'width:16px;height:16px;padding:0;border:none;border-radius:3px;background:transparent;color:inherit;font:14px/16px sans-serif;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;';
            b.addEventListener('mouseenter', () => { b.style.background = 'rgba(128,132,142,.3)'; });
            b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; });
            b.addEventListener('mousedown', (e) => e.stopPropagation());
            b.addEventListener('dblclick', (e) => e.stopPropagation());
            b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
            return b;
        };
        const row: Row = { alert: a, line, pill, icon, label, btns, y: 0, price: a.price, iconColor: '' };
        btns.appendChild(mk('chart-alert-edit', EDIT_SVG, t('Edit alert'), () => this._host.openEdit(row.alert)));
        btns.appendChild(mk('chart-alert-delete', '&times;', t('Delete alert'), () => this._delete(row.alert)));
        pill.appendChild(icon);
        pill.appendChild(label);
        pill.appendChild(btns);
        pill.addEventListener('mouseenter', () => { this._hoverId = a.id; this._host.requestDraw(); });
        pill.addEventListener('mouseleave', (e) => {
            if (this._hoverId === a.id && !this._dragging) { this._hoverId = null; this._host.requestDraw(); }
            void e;
        });
        pill.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            this._beginDrag(row.alert, e);
        });
        pill.addEventListener('dblclick', (e) => { e.stopPropagation(); this._host.openEdit(row.alert); });
        // the pill sits above the pane canvas: hand wheel events to the canvas so zoom / scroll keep working over it
        pill.addEventListener('wheel', (e) => {
            const canvas = this._canvas;
            if (!canvas) return;
            e.preventDefault();
            e.stopPropagation();
            canvas.dispatchEvent(new WheelEvent('wheel', {
                bubbles: true, cancelable: true, composed: true, view: e.view, clientX: e.clientX, clientY: e.clientY,
                screenX: e.screenX, screenY: e.screenY, deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode,
                ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
            }));
        }, { passive: false });
        return row;
    }

    private _delete(alert: ChartAlert): void {
        alertsStore.remove(alert.id).then(
            () => showToast({ title: t('Alert deleted'), kind: 'success' }),
            (err: unknown) => showToast({ title: errorText(err), kind: 'error' }),
        );
    }

    // ---- hit testing ----

    private _hit(e: MouseEvent): ChartAlert | null {
        const canvas = this._canvas;
        if (!canvas || !getAlertSettings().lines || this._rows.size === 0) return null;
        const rect = canvas.getBoundingClientRect();
        const y = e.clientY - rect.top;
        let best: Row | null = null;
        let bestD = ALERT_HIT_PX + 0.001;
        for (const r of this._rows.values()) {
            const d = Math.abs(r.y - y);
            if (d <= bestD) { best = r; bestD = d; }
        }
        return best ? best.alert : null;
    }

    private _setCursor(on: boolean): void {
        const c = this._canvas;
        if (!c || this._canvasCursorSet === on) return;
        this._canvasCursorSet = on;
        c.style.cursor = on ? 'ns-resize' : '';
    }

    private _canvasMove(e: MouseEvent): void {
        if (this._dragging) return;
        const hit = e.buttons === 0 && !this._host.blocked() ? this._hit(e) : null;
        this._setCursor(hit !== null);
        const id = hit ? hit.id : null;
        if (id !== this._hoverId) { this._hoverId = id; this._host.requestDraw(); }
    }

    private _canvasLeave(e: MouseEvent): void {
        const rel = e.relatedTarget as Node | null;
        if (rel && this._layer && this._layer.contains(rel)) return;
        if (this._dragging) return;
        this._setCursor(false);
        if (this._hoverId !== null) { this._hoverId = null; this._host.requestDraw(); }
    }

    private _canvasDown(e: MouseEvent): void {
        if (e.button !== 0 || this._host.blocked()) return;
        const hit = this._hit(e);
        if (!hit) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this._beginDrag(hit, e);
    }

    private _canvasDbl(e: MouseEvent): void {
        if (this._host.blocked()) return;
        const hit = this._hit(e);
        if (!hit) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this._host.openEdit(hit);
    }

    // ---- drag ----

    private _abortDrag: (() => void) | null = null;

    /** Pure helper: price for a pointer y (main-pane local), snapped to the tick grid. */
    dragPrice(localY: number): number | null {
        const p = this._host.yToPrice(localY);
        if (p === null || !isFinite(p)) return null;
        const snapped = snapAlertPrice(p, this._host.priceStep());
        return snapped > 0 ? snapped : null;
    }

    private _beginDrag(alert: ChartAlert, down: MouseEvent): void {
        const pane = this._host.paneElement();
        if (!pane) return;
        this._abortDrag?.();
        const startY = down.clientY;
        let moved = false;
        let cancelled = false;
        const original = alert.price;
        const prevBodyCursor = document.body.style.cursor;

        const onKey = (ev: KeyboardEvent) => {
            if (ev.key !== 'Escape') return;
            ev.preventDefault();
            ev.stopPropagation();
            cancelled = true;
            end();
        };
        document.addEventListener('keydown', onKey, true);

        const end = startDragSession(
            (ev) => {
                if (!moved && Math.abs(ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
                if (!moved) { moved = true; this._dragging = true; document.body.style.cursor = 'ns-resize'; }
                const rect = pane.getBoundingClientRect();
                const price = this.dragPrice(ev.clientY - rect.top);
                if (price === null) return;
                this._preview = { id: alert.id, price };
                this._host.requestDraw();
            },
            () => {
                document.removeEventListener('keydown', onKey, true);
                document.body.style.cursor = prevBodyCursor;
                this._abortDrag = null;
                const wasDragging = this._dragging;
                this._dragging = false;
                const pv = this._preview;
                if (!moved || cancelled || !pv || pv.id !== alert.id || pv.price === original) {
                    if (wasDragging || pv) { this._preview = null; this._host.requestDraw(); }
                    return;
                }
                // keep showing the new position while the request is pending
                // an untouched auto message ("BTCUSDT Crossing 65,000") would go stale with the new price: let the server rebuild it
                const patch: { price: number; message?: string } = { price: pv.price };
                if (isAutoAlertMessage(alert.message, alert.symbol, alert.condition, original, [this._host.formatPrice(original)])) patch.message = '';
                alertsStore.update(alert.id, patch).then(
                    () => { if (this._preview === pv) this._preview = null; this._host.requestDraw(); },
                    (err: unknown) => {
                        if (this._preview === pv) this._preview = null;
                        this._host.requestDraw();
                        showToast({ title: errorText(err), kind: 'error' });
                    },
                );
                this._host.requestDraw();
            },
        );
        this._abortDrag = () => { cancelled = true; end(); };
    }
}

function errorText(err: unknown): string {
    const m = err instanceof Error ? err.message : '';
    return m || t('Something went wrong. Please try again.');
}
