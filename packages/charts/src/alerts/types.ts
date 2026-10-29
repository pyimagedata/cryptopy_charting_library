/**
 * Price alerts: shared contract between the library and the host page (camelCase, epoch ms).
 * The host implements AlertsBackend (REST + WebSocket); the library only knows `symbol`.
 */

export type AlertCondition =
    | 'crossing' | 'crossing_up' | 'crossing_down' | 'greater_than' | 'less_than'
    | 'entering_channel' | 'exiting_channel' | 'inside_channel' | 'outside_channel'
    | 'moving_up' | 'moving_down' | 'moving_up_percent' | 'moving_down_percent';
export type AlertTrigger = 'once' | 'once_per_bar' | 'once_per_bar_close' | 'once_per_minute';
export type AlertInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';
export type AlertSource = 'price' | 'drawing';

/** Line of a drawing alert: times epoch ms, prices numbers. */
export interface AlertGeometryLine { t1: number; p1: number; t2: number; p2: number; extendLeft: boolean; extendRight: boolean }
export type AlertGeometry =
    | { type: 'line'; line: AlertGeometryLine }
    | { type: 'channel'; upper: AlertGeometryLine; lower: AlertGeometryLine };
export type AlertStatus = 'active' | 'stopped' | 'triggered' | 'expired';
export type AlertSound = 'chime' | 'bell' | 'beep' | 'alarm';

export interface ChartAlert {
    id: string; symbol: string; condition: AlertCondition; price: number; name: string; message: string;
    status: AlertStatus; notifyApp: boolean; notifyToast: boolean; playSound: boolean; sound: AlertSound;
    notifyTelegram: boolean; expiresAt: number | null; color: string;
    createdAt: number; triggeredAt: number | null; triggeredPrice: number | null;
    /** Phase 2 (absent on legacy alerts: source = price, trigger = once). */
    interval?: AlertInterval; trigger?: AlertTrigger; source?: AlertSource;
    drawingId?: string | null; drawingType?: string | null; drawingLabel?: string | null;
    geometry?: AlertGeometry | null; moveValue?: number | null; moveBars?: number | null; webhookUrl?: string | null;
}

/** `price` is null for a drawing alert without a usable seed price (the server then stores its informational default). */
export type AlertDraft = Omit<ChartAlert, 'id' | 'status' | 'createdAt' | 'triggeredAt' | 'triggeredPrice' | 'price'> & { price: number | null };

export interface AlertLogEntry {
    id: string; alertId: string | null; symbol: string; name: string; message: string;
    price: number; condition: AlertCondition; firedAt: number;
}

export type AlertsEvent =
    | { type: 'fired'; alert: ChartAlert; entry: AlertLogEntry }
    | { type: 'changed'; alert: ChartAlert }
    | { type: 'removed'; id: string };

/** Implemented by the HOST page. */
export interface AlertsBackend {
    list(): Promise<{ alerts: ChartAlert[]; limit: number; telegramAvailable: boolean; webhookAvailable?: boolean }>;
    create(draft: AlertDraft): Promise<ChartAlert>;
    update(id: string, patch: Partial<AlertDraft> & { status?: 'active' | 'stopped' }): Promise<ChartAlert>;
    remove(id: string): Promise<void>;
    log(): Promise<AlertLogEntry[]>;
    clearLog(): Promise<void>;
    subscribe(listener: (ev: AlertsEvent) => void): () => void;
}

export type AlertsErrorCode = 'limit_reached' | 'feed_capacity' | 'invalid' | 'network' | 'auth';

export class AlertsError extends Error {
    code: AlertsErrorCode;
    limit?: number;
    field?: string;
    constructor(code: AlertsErrorCode, message?: string, extra?: { limit?: number; field?: string }) {
        super(message ?? code);
        this.name = 'AlertsError';
        this.code = code;
        if (extra?.limit !== undefined) this.limit = extra.limit;
        if (extra?.field !== undefined) this.field = extra.field;
        Object.setPrototypeOf(this, AlertsError.prototype);
    }
}
