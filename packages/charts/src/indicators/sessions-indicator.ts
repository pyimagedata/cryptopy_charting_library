/**
 * Sessions indicator: one translucent box per trading session (time window x high-low range)
 * with a name label and an optional dashed line at the session open.
 *
 * Two presets: "Market sessions" (each in its own IANA zone) and "Killzones" (New York time).
 * Computed entirely on the client from the loaded bars; intraday only (hidden at >= 4h bars).
 * A bar belongs to a session by its OPEN time; a window with equal start and end is empty (no session).
 */

import { OverlayIndicator, IndicatorOptions, IndicatorRange } from './indicator';
import { BarData } from '../model/data';
import { TimeScale } from '../model/time-scale';
import { PriceScale } from '../model/price-scale';
import { t } from '../helpers/translations';
import { canvasSans } from '../helpers/fonts';
import { IndicatorLegendInfo } from './legend-info';
import {
    IndicatorSettingsConfig, createInputsTab, createStyleTab, createVisibilityTab,
    checkboxRow, colorRow, numberRow, selectRow, sliderRow,
} from '../gui/indicator_settings';
import {
    SessionInstance, getZoneClock, parseHHMM, formatHHMM, updateSessionInstances,
    timeframeSeconds, barIntervalSeconds, colorWithAlpha, ScanGuard,
} from './time-periods';

export type SessionPreset = 'market' | 'killzones';

interface SessionDef {
    /** Option-key prefix */
    id: string;
    preset: SessionPreset;
    /** Display name (translation key) */
    name: string;
    zone: string;
    start: string;
    end: string;
    color: string;
}

const NY = 'America/New_York';

export const SESSION_DEFS: ReadonlyArray<SessionDef> = [
    { id: 'sydney', preset: 'market', name: 'Sydney', zone: 'Australia/Sydney', start: '07:00', end: '16:00', color: '#ab47bc' },
    { id: 'tokyo', preset: 'market', name: 'Tokyo', zone: 'Asia/Tokyo', start: '09:00', end: '18:00', color: '#ef5350' },
    { id: 'london', preset: 'market', name: 'London', zone: 'Europe/London', start: '08:00', end: '17:00', color: '#2962ff' },
    { id: 'newyork', preset: 'market', name: 'New York', zone: NY, start: '08:00', end: '17:00', color: '#26a69a' },
    { id: 'kzAsian', preset: 'killzones', name: 'Asian', zone: NY, start: '20:00', end: '00:00', color: '#ab47bc' },
    { id: 'kzLondonOpen', preset: 'killzones', name: 'London Open', zone: NY, start: '02:00', end: '05:00', color: '#2962ff' },
    { id: 'kzNewYorkOpen', preset: 'killzones', name: 'New York Open', zone: NY, start: '07:00', end: '10:00', color: '#26a69a' },
    { id: 'kzLondonClose', preset: 'killzones', name: 'London Close', zone: NY, start: '10:00', end: '12:00', color: '#ff9800' },
];

export interface SessionsOptions extends IndicatorOptions {
    preset: SessionPreset;
    /** Draw at most this many latest sessions per session type */
    maxSessions: number;
    showLabels: boolean;
    showOpenLine: boolean;
    boxOpacity: number;
    [key: string]: any;
}

function buildDefaults(): Partial<SessionsOptions> {
    const o: Record<string, any> = {
        name: 'Sessions',
        color: '#2962ff',
        lineWidth: 1,
        preset: 'market',
        maxSessions: 20,
        showLabels: true,
        showOpenLine: false,
        boxOpacity: 0.15,
    };
    for (const d of SESSION_DEFS) {
        o[`${d.id}Enabled`] = true;
        o[`${d.id}Color`] = d.color;
        o[`${d.id}Start`] = d.start;
        o[`${d.id}End`] = d.end;
    }
    return o as Partial<SessionsOptions>;
}

const defaultSessionsOptions = buildDefaults();

/** Sessions are only meaningful on bars shorter than this. */
const MAX_INTERVAL_SECONDS = 4 * 3600 - 1;

interface Track {
    def: SessionDef;
    sig: string;
    instances: SessionInstance[];
    scanned: number;
}

export class SessionsIndicator extends OverlayIndicator {
    private _tracks = new Map<string, Track>();
    private _tf = '';
    private _intervalSec = 0;
    /** Validity of the cached instances (shared by all tracks) */
    private readonly _guard = new ScanGuard();
    private _ctxKey = '';

    constructor(options: Partial<SessionsOptions> = {}) {
        super({ ...defaultSessionsOptions, ...options });
    }

    private get _o(): SessionsOptions {
        return this._options as SessionsOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._options };
    }

    /** Chart context pushed by the widget (symbol/exchange are irrelevant here). */
    setContext(ctx: { symbol: string; timeframe: string; exchange?: string; end?: number }): void {
        const key = `${ctx.symbol}|${ctx.exchange ?? ''}`;
        const keyChanged = key !== this._ctxKey;
        if (keyChanged) {
            this._ctxKey = key;
            this._resetCache();
        }
        if (ctx.timeframe !== this._tf || keyChanged) {
            this._tf = ctx.timeframe;
            this._rebuild();
            this._dataChanged.fire();
        }
    }

    // --- settings ---

    getSettingsConfig(): IndicatorSettingsConfig {
        const inputSections: any[] = [{
            rows: [
                selectRow('preset', t('Preset'), [
                    { value: 'market', label: t('Market sessions') },
                    { value: 'killzones', label: t('Killzones') },
                ], 'market'),
                numberRow('maxSessions', t('Sessions to draw'), 1, 200, 1),
            ],
        }];
        const styleRows: any[] = [
            checkboxRow('showLabels', t('Show labels'), true),
            checkboxRow('showOpenLine', t('Show open line'), false),
            sliderRow('boxOpacity', t('Box opacity'), 0.02, 0.6, 0.01),
        ];
        for (const d of SESSION_DEFS) {
            const title = (d.preset === 'market' ? t('Market sessions') : t('Killzones')) + ': ' + t(d.name);
            inputSections.push({
                title,
                raw: true,
                rows: [
                    checkboxRow(`${d.id}Enabled`, t('Enabled'), true),
                    { type: 'text', key: `${d.id}Start`, label: t('Start (HH:MM)'), placeholder: d.start },
                    { type: 'text', key: `${d.id}End`, label: t('End (HH:MM)'), placeholder: d.end },
                ],
            });
            styleRows.push(colorRow(`${d.id}Color`, title, d.color));
        }
        return {
            name: this.name,
            tabs: [
                createInputsTab(inputSections),
                createStyleTab([{ rows: styleRows }]),
                createVisibilityTab(),
            ],
        };
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this._options.visible;
        return (this._options as any)[key];
    }

    setSettingValue(key: string, value: any): boolean {
        if (key.endsWith('Start') || key.endsWith('End')) {
            const mins = parseHHMM(value);
            if (mins === null) return false; // ignore half-typed text
            value = formatHHMM(mins); // "24:00" is stored as "00:00" (same window)
        } else if (key === 'maxSessions') {
            const n = Math.round(Number(value));
            value = Number.isFinite(n) ? Math.max(1, Math.min(200, n)) : 20;
        } else if (key === 'boxOpacity') {
            const n = Number(value);
            value = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.15;
        } else if (key === 'preset') {
            value = value === 'killzones' ? 'killzones' : 'market';
        }
        (this._options as any)[key] = value;
        this._rebuild();
        this._dataChanged.fire();
        return false;
    }

    // --- calculation ---

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._rebuild();
    }

    private _activeDefs(): SessionDef[] {
        return SESSION_DEFS.filter(d => d.preset === this._o.preset && this._o[`${d.id}Enabled`] !== false);
    }

    /** Interval hides the indicator from 4h up. */
    private get _intradayOk(): boolean {
        return this._intervalSec > 0 && this._intervalSec <= MAX_INTERVAL_SECONDS;
    }

    private _resetCache(): void {
        this._tracks.clear();
        this._guard.reset();
    }

    private _rebuild(): void {
        const bars = this._sourceData;
        this._data = bars.map(b => ({ time: b.time, value: NaN }));
        const tfSec = timeframeSeconds(this._tf);
        this._intervalSec = tfSec ?? barIntervalSeconds(bars);
        if (bars.length === 0 || !this._intradayOk) {
            this._resetCache();
            return;
        }
        // Cached instances are only valid for an append-only continuation of the same series.
        if (!this._guard.isValid(bars, this._intervalSec)) this._tracks.clear();
        for (const def of this._activeDefs()) {
            const s = parseHHMM(this._o[`${def.id}Start`]);
            const e = parseHHMM(this._o[`${def.id}End`]);
            if (s === null || e === null) continue;
            const sig = `${def.zone}|${s}|${e}`;
            let tr = this._tracks.get(def.id);
            if (!tr || tr.sig !== sig) {
                tr = { def, sig, instances: [], scanned: 0 };
                this._tracks.set(def.id, tr);
            }
            tr.scanned = updateSessionInstances(bars, getZoneClock(def.zone), s, e, tr.instances, tr.scanned);
        }
        this._guard.commit(bars, this._intervalSec);
    }

    // --- drawing ---

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: TimeScale,
        priceScale: PriceScale,
        hpr: number,
        vpr: number,
        visibleRange: { from: number; to: number },
    ): void {
        if (this._sourceData.length === 0 || !this._intradayOk) return;
        const o = this._o;
        const spacing = timeScale.barSpacing;
        const from = visibleRange.from - 1;
        const to = visibleRange.to + 1;
        ctx.save();
        ctx.font = `bold ${10 * hpr}px ${canvasSans()}`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        for (const def of this._activeDefs()) {
            const tr = this._tracks.get(def.id);
            if (!tr) continue;
            const color = String(o[`${def.id}Color`] ?? def.color);
            const fill = colorWithAlpha(color, o.boxOpacity);
            const border = colorWithAlpha(color, Math.min(1, o.boxOpacity * 3 + 0.2));
            const solid = colorWithAlpha(color, 1);
            const inst = tr.instances;
            const startAt = Math.max(0, inst.length - Math.max(1, o.maxSessions));
            for (let k = startAt; k < inst.length; k++) {
                const s = inst[k];
                if (s.last < from || s.first > to) continue;
                const x1 = ((timeScale.indexToCoordinate(s.first as any) as number) - spacing / 2) * hpr;
                const x2 = ((timeScale.indexToCoordinate(s.last as any) as number) + spacing / 2) * hpr;
                const yHi = (priceScale.priceToCoordinate(s.high) as number) * vpr;
                const yLo = (priceScale.priceToCoordinate(s.low) as number) * vpr;
                if (!Number.isFinite(x1) || !Number.isFinite(yHi) || !Number.isFinite(yLo)) continue;
                const w = Math.max(1, x2 - x1);
                const h = Math.max(1, yLo - yHi);
                ctx.fillStyle = fill;
                ctx.fillRect(x1, yHi, w, h);
                ctx.strokeStyle = border;
                ctx.lineWidth = Math.max(1, o.lineWidth * hpr);
                ctx.setLineDash([]);
                ctx.strokeRect(x1, yHi, w, h);
                if (o.showOpenLine) {
                    const yo = Math.round((priceScale.priceToCoordinate(s.open) as number) * vpr) + 0.5;
                    ctx.strokeStyle = solid;
                    ctx.setLineDash([4 * hpr, 3 * hpr]);
                    ctx.beginPath();
                    ctx.moveTo(x1, yo);
                    ctx.lineTo(x1 + w, yo);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
                if (o.showLabels) {
                    const label = t(def.name);
                    if (ctx.measureText(label).width + 6 * hpr < w) {
                        ctx.fillStyle = solid;
                        ctx.fillText(label, x1 + 3 * hpr, yHi + 3 * vpr);
                    }
                }
            }
        }
        ctx.restore();
    }

    getRange(visibleRange?: { from: number; to: number } | null): IndicatorRange {
        const bars = this._sourceData;
        if (bars.length === 0) return { min: 0, max: 100 };
        const a = visibleRange ? Math.max(0, Math.floor(visibleRange.from)) : 0;
        const b = visibleRange ? Math.min(bars.length - 1, Math.ceil(visibleRange.to)) : bars.length - 1;
        let min = Infinity, max = -Infinity;
        for (let i = a; i <= b; i++) {
            if (bars[i].low < min) min = bars[i].low;
            if (bars[i].high > max) max = bars[i].high;
        }
        return min === Infinity ? { min: 0, max: 100 } : { min, max };
    }

    private _presetLabel(): string {
        return this._o.preset === 'killzones' ? t('Killzones') : t('Market sessions');
    }

    getLegendInfo(_index?: number | null): IndicatorLegendInfo {
        return { title: t('Sessions'), params: [this._presetLabel()], plots: [] };
    }

    getDescription(_index?: number): string {
        return `${t('Sessions')} (${this._presetLabel()})`;
    }
}
