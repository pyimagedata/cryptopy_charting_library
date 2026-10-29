/**
 * Drawing side of drawing alerts, ONE controller per chart:
 *  - bell badge near the first anchor of drawings that have an active drawing alert (DOM overlay, non-interactive),
 *  - follows edits: when a user edit finishes (DrawingManager.historyCommitted / historyRestored) the geometry of the
 *    linked active alerts is re-sent (debounced, never during a drag),
 *  - drawing presence for the alerts panel ("(çizim silindi)"): resolved across every open chart.
 * Deleting a drawing never touches its alerts.
 */
import { t } from '../../helpers/translations';
import { alertsStore } from '../../alerts/alerts-store';
import { alertMatchesSymbol, alertErrorText, DEFAULT_ALERT_COLOR } from '../../alerts/alert-text';
import { alertGeometryFor, isAlertableDrawing, sameGeometry } from '../../alerts/drawing-geometry';
import type { AlertGeometry, ChartAlert } from '../../alerts/types';
import type { DrawingManager } from '../../drawings/drawing-manager';
import { showToast } from '../toast/toast';

export interface DrawingAlertsHost {
    paneElement(): HTMLElement | null;
    drawingManager(): DrawingManager;
    /** "EXCHANGE:CODE" of the chart's symbol. */
    symbol(): string;
    /** Main-pane local coordinates, null when unavailable. */
    timeToX(time: number): number | null;
    priceToY(price: number): number | null;
    theme(): 'light' | 'dark';
    /** A drawing drag (move / control point) is in progress: the geometry is not final. */
    isDragging?(): boolean;
}

const FOLLOW_DEBOUNCE_MS = 500;
const BADGE_SIZE = 18;

const BELL_SVG = `<svg width="12" height="12" viewBox="0 0 12 12" fill="#fff" stroke="none"><path d="M6 1.2a3.2 3.2 0 0 0-3.2 3.2c0 2.2-1.1 3.3-1.1 3.3h8.6s-1.1-1.1-1.1-3.3A3.2 3.2 0 0 0 6 1.2z"/><path d="M5 9.2a1 1 0 0 0 2 0z"/></svg>`;

const controllers = new Set<DrawingAlertsController>();

/** true = the drawing is on an open chart of the alert's symbol, false = that chart is open but the drawing is gone, null = unknown. */
function resolvePresence(alert: ChartAlert): boolean | null {
    if (alert.source !== 'drawing' || !alert.drawingId) return null;
    let known = false;
    for (const c of controllers) {
        if (!alertMatchesSymbol(alert.symbol, c.symbol())) continue;
        if (!c.drawingsReady()) continue; // drawings not restored yet: unknown, not "deleted"
        known = true;
        if (c.hasDrawing(alert.drawingId)) return true;
    }
    return known ? false : null;
}

/** Current geometry of an alert's drawing when it is on an open chart of the alert's symbol (restart refreshes it), else null. */
function resolveGeometry(alert: ChartAlert): AlertGeometry | null {
    if (alert.source !== 'drawing' || !alert.drawingId) return null;
    for (const c of controllers) {
        if (!alertMatchesSymbol(alert.symbol, c.symbol()) || !c.drawingsReady()) continue;
        const g = c.currentGeometry(alert.drawingId);
        if (g) return g;
    }
    return null;
}

function isActiveDrawingAlert(a: ChartAlert): boolean {
    return a.status === 'active' && a.source === 'drawing' && !!a.drawingId;
}

export class DrawingAlertsController {
    private readonly _host: DrawingAlertsHost;
    private _layer: HTMLDivElement | null = null;
    private readonly _badges = new Map<string, HTMLDivElement>();
    private _unsubs: Array<() => void> = [];
    private _timer: ReturnType<typeof setTimeout> | null = null;
    private _presenceKey = '';
    private _presenceTimer: ReturnType<typeof setTimeout> | null = null;
    private _disposed = false;

    constructor(host: DrawingAlertsHost) {
        this._host = host;
    }

    symbol(): string { return this._host.symbol(); }

    drawingsReady(): boolean { return this._host.drawingManager().drawingsLoaded; }

    /** Current wire geometry of the drawing `id` when it is on this chart and alertable, else null. */
    currentGeometry(id: string): AlertGeometry | null {
        const d = this._host.drawingManager().drawings.find((x) => x.id === id);
        return d ? alertGeometryFor(d) : null;
    }

    hasDrawing(id: string): boolean {
        return this._host.drawingManager().drawings.some((d) => d.id === id);
    }

    attach(): void {
        const pane = this._host.paneElement();
        if (!pane || this._layer) return;
        const layer = document.createElement('div');
        layer.className = 'chart-drawing-alert-badges';
        layer.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;overflow:hidden;pointer-events:none;z-index:3;';
        pane.appendChild(layer);
        this._layer = layer;
        const dm = this._host.drawingManager();
        const onEditEnd = () => this._scheduleFollow();
        this._unsubs.push(alertsStore.onChange(() => this._host.paneElement() && this.sync()));
        dm.historyCommitted.subscribe(onEditEnd);
        dm.historyRestored.subscribe(onEditEnd);
        this._unsubs.push(() => {
            dm.historyCommitted.unsubscribe(onEditEnd);
            dm.historyRestored.unsubscribe(onEditEnd);
        });
        controllers.add(this);
        alertsStore.setDrawingPresenceResolver(resolvePresence);
        alertsStore.setDrawingGeometryResolver(resolveGeometry);
    }

    dispose(): void {
        this._disposed = true;
        controllers.delete(this);
        for (const u of this._unsubs) u();
        this._unsubs = [];
        if (this._timer) clearTimeout(this._timer);
        if (this._presenceTimer) clearTimeout(this._presenceTimer);
        this._timer = null;
        this._presenceTimer = null;
        this._layer?.remove();
        this._layer = null;
        this._badges.clear();
        // charts that remain re-resolve presence (this chart's drawings are no longer known)
        if (controllers.size > 0) alertsStore.notifyPresenceChanged();
    }

    // ---- badges (called on every draw + store change) ----

    sync(): void {
        const layer = this._layer;
        if (!layer || this._disposed) return;
        const dm = this._host.drawingManager();
        const linked = alertsStore.alertsForSymbol(this._host.symbol()).filter(isActiveDrawingAlert);
        this._updatePresence(linked);
        const seen = new Set<string>();
        if (linked.length > 0 && !dm.drawingsHidden) {
            const colorById = new Map<string, string>();
            for (const a of linked) if (!colorById.has(a.drawingId!)) colorById.set(a.drawingId!, a.color || DEFAULT_ALERT_COLOR);
            const w = layer.clientWidth || 0;
            const h = layer.clientHeight || 0;
            for (const d of dm.getDrawingsForPane(null)) {
                const color = colorById.get(d.id);
                if (color === undefined || !d.visible || !dm.isVisibleOnCurrentTimeframe(d) || !isAlertableDrawing(d)) continue;
                const p = d.points[0];
                const x = this._host.timeToX(p.time);
                const y = this._host.priceToY(p.price);
                if (x === null || y === null || !isFinite(x) || !isFinite(y)) continue;
                // anchor-relative: just above-right of the first point; clamp horizontally (horizontal lines may anchor off screen)
                let left = x + 6;
                let top = y - BADGE_SIZE - 6;
                if (w > 0) left = Math.max(4, Math.min(w - BADGE_SIZE - 4, left));
                if (top < 2) top = y + 6;
                if (y < -BADGE_SIZE || (h > 0 && y > h + BADGE_SIZE)) continue;
                seen.add(d.id);
                let badge = this._badges.get(d.id);
                if (!badge) {
                    badge = this._createBadge(d.id);
                    this._badges.set(d.id, badge);
                    layer.appendChild(badge);
                }
                badge.style.left = `${Math.round(left)}px`;
                badge.style.top = `${Math.round(top)}px`;
                badge.style.background = color;
                badge.style.borderColor = this._host.theme() === 'dark' ? '#1e222d' : '#ffffff';
            }
        }
        for (const [id, el] of this._badges) {
            if (seen.has(id)) continue;
            el.remove();
            this._badges.delete(id);
        }
    }

    private _createBadge(drawingId: string): HTMLDivElement {
        const el = document.createElement('div');
        el.className = 'chart-drawing-alert-badge';
        el.dataset.drawingId = drawingId;
        el.title = t('Alert for this drawing');
        el.style.cssText = `position:absolute;width:${BADGE_SIZE}px;height:${BADGE_SIZE}px;box-sizing:border-box;border-radius:50%;`
            + 'border:1.5px solid;display:flex;align-items:center;justify-content:center;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.35);';
        el.innerHTML = BELL_SVG;
        return el;
    }

    /** Tells the panel when the set of present drawings of this chart's alerts changed (delete / undo / symbol switch). */
    private _updatePresence(linked: ChartAlert[]): void {
        let key = '';
        if (linked.length > 0) {
            const ids = new Set(this._host.drawingManager().drawings.map((d) => d.id));
            key = `${this._host.drawingManager().drawingsLoaded ? 1 : 0}|` + linked.map((a) => `${a.id}:${ids.has(a.drawingId!) ? 1 : 0}`).join(',');
        }
        if (key === this._presenceKey) return;
        this._presenceKey = key;
        if (this._presenceTimer) clearTimeout(this._presenceTimer);
        this._presenceTimer = setTimeout(() => {
            this._presenceTimer = null;
            if (!this._disposed) alertsStore.notifyPresenceChanged();
        }, 0);
    }

    // ---- follow edits ----

    private _scheduleFollow(): void {
        if (this._disposed) return;
        if (this._timer) clearTimeout(this._timer);
        this._timer = setTimeout(() => { this._timer = null; this._follow(); }, FOLLOW_DEBOUNCE_MS);
    }

    private _follow(): void {
        if (this._disposed) return;
        // a debounce that elapsed mid-drag: wait for the drag to end (its mouse-up commit re-schedules anyway)
        if (this._host.isDragging?.()) { this._scheduleFollow(); return; }
        const dm = this._host.drawingManager();
        const drawings = dm.drawings;
        for (const alert of alertsStore.alertsForSymbol(this._host.symbol()).filter(isActiveDrawingAlert)) {
            const d = drawings.find((x) => x.id === alert.drawingId);
            if (!d) continue; // deleted drawing: the alert keeps its stored geometry
            const geometry = alertGeometryFor(d);
            if (!geometry || sameGeometry(alert.geometry, geometry)) continue;
            // the default message of a drawing alert names the drawing label (not a price): nothing to rewrite
            alertsStore.update(alert.id, { geometry }).catch((e) => {
                const text = alertErrorText(e, alertsStore.hasBackend) ?? (e instanceof Error ? e.message : String(e));
                if (text) showToast({ title: t('Alert'), body: text, kind: 'error' });
            });
        }
    }
}
