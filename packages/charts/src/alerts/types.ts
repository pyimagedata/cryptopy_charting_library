/**
 * Price alerts: shared contract between the library and the host page (camelCase, epoch ms).
 * The host implements AlertsBackend (REST + WebSocket); the library only knows `symbol`.
 */

export type AlertCondition = 'crossing' | 'crossing_up' | 'crossing_down' | 'greater_than' | 'less_than';
export type AlertStatus = 'active' | 'stopped' | 'triggered' | 'expired';
export type AlertSound = 'chime' | 'bell' | 'beep' | 'alarm';

export interface ChartAlert {
    id: string; symbol: string; condition: AlertCondition; price: number; name: string; message: string;
    status: AlertStatus; notifyApp: boolean; notifyToast: boolean; playSound: boolean; sound: AlertSound;
    notifyTelegram: boolean; expiresAt: number | null; color: string;
    createdAt: number; triggeredAt: number | null; triggeredPrice: number | null;
}

export type AlertDraft = Omit<ChartAlert, 'id' | 'status' | 'createdAt' | 'triggeredAt' | 'triggeredPrice'>;

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
    list(): Promise<{ alerts: ChartAlert[]; limit: number; telegramAvailable: boolean }>;
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
