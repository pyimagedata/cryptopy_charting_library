/**
 * Evo Script indicator ("evo-script"): renders the RunOutput of a user script that the host runs
 * through the runner registered with `setEvoScriptRunner`. Two flavours share one core:
 * overlay (main price pane) and panel (own pane); the manager swaps flavour when the script's
 * `meta.overlay` differs from the hint it was created with.
 */

import { OverlayIndicator, PanelIndicator, IndicatorOptions, IndicatorRange, IndicatorDataPoint } from './indicator';
import { BarData } from '../model/data';
import { TimeScale } from '../model/time-scale';
import { PriceScale } from '../model/price-scale';
import { IndicatorLegendInfo, LegendPlot, legendBarIndex, adaptivePrecision } from './legend-info';
import { createVisibilityTab, IndicatorSettingsConfig } from '../gui/indicator_settings';
import type { SettingRow } from '../drawings/drawing-settings-config';
import {
    EvoScriptCore, EvoScriptSettings, EvoScriptState, EvoInputDef,
} from './evo-script-core';
import type { AutoscaleExtra } from '../model/chart-model';
import {
    drawEvoOutput, evoVisibleRange, isPlotDrawn, isPlotInLegend, evoColorAt, evoLastValueLabels, evoScaleFormatter,
    formatEvoPlotValue, formatEvoNumber, candleOk, evoViews, EvoHit, EvoValueLabel,
} from './evo-script-render';
import type { EvoTable } from './evo-script-core';

const COMMON_TIMEFRAMES: Array<{ value: string; label: string }> = [
    { value: '', label: 'Chart' },
    { value: '1', label: '1m' }, { value: '3', label: '3m' }, { value: '5', label: '5m' }, { value: '15', label: '15m' },
    { value: '30', label: '30m' }, { value: '60', label: '1h' }, { value: '120', label: '2h' }, { value: '240', label: '4h' },
    { value: '1D', label: '1D' }, { value: '1W', label: '1W' }, { value: '1M', label: '1M' },
];

/** Media px the panel legend row covers at the top of an indicator pane */
const PANE_LEGEND_INSET = 30;

export interface EvoScriptIndicatorOptions extends IndicatorOptions {
    source: string;
    lang: 'pine' | 'evo' | 'auto';
    inputs: Record<string, unknown>;
    /** User given title ('' = the script's own title) */
    evoName: string;
    overlay: boolean;
    /** strategy() overrides of the Strategy Tester (persisted with the indicator) */
    strategyOverrides?: Record<string, unknown>;
}

const SOURCES = ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4', 'hlcc4', 'volume'];
const INPUT_PREFIX = 'in:';

function newId(): string {
    return `EvoScript_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function buildCore(options: Partial<EvoScriptIndicatorOptions> & { name?: string }, core?: EvoScriptCore): { id: string; core: EvoScriptCore } {
    if (core) return { id: core.id, core };
    const id = options.id || newId();
    // `evoName` is the user's title; on first creation (host API) `name` carries it
    const name = options.evoName !== undefined ? options.evoName : (options.name ?? '');
    return {
        id,
        core: new EvoScriptCore(id, {
            source: options.source, lang: options.lang, inputs: options.inputs, name, overlay: options.overlay === true,
            strategyOverrides: options.strategyOverrides,
        }),
    };
}

/** Behaviour shared by both flavours. `host` is the indicator instance. */
class EvoImpl {
    constructor(private readonly host: any, readonly core: EvoScriptCore) {
        core.onChange = () => this.onCoreChange();
        core.onSettings = () => this.syncOptions();
        this.syncOptions(false);
    }

    private get opts(): any { return this.host._options; }

    displayName(): string {
        const s = this.core.settings;
        const m = this.core.output?.meta;
        return s.name || m?.shortTitle || m?.title || this.core.lastTitle || 'Evo Script';
    }

    syncOptions(fire = true): void {
        const s = this.core.settings;
        Object.assign(this.opts, {
            source: s.source, lang: s.lang, inputs: { ...s.inputs }, evoName: s.name, overlay: s.overlay,
            strategyOverrides: { ...(s.strategyOverrides ?? {}) },
            name: this.displayName(),
        });
        if (fire) this.host._dataChanged.fire();
    }

    onCoreChange(): void {
        this.rebuildData();
        this.opts.name = this.displayName();
        this.host._dataChanged.fire();
    }

    calculate(bars: BarData[]): void {
        this.host._sourceData = bars;
        this.core.onData(bars);
        this.rebuildData();
    }

    rebuildData(): void {
        const bars: readonly BarData[] = this.host._sourceData;
        const out = this.core.output;
        const first = out?.plots.find(isPlotDrawn);
        const data: IndicatorDataPoint[] = new Array(bars.length);
        for (let i = 0; i < bars.length; i++) {
            const si = first ? i - first.offset : -1;
            data[i] = { time: bars[i].time, value: first && si >= 0 && si < first.values.length ? first.values[si] : NaN };
        }
        this.host._data = data;
    }

    range(vr?: { from: number; to: number } | null, own = false): IndicatorRange {
        const raw = this.core.output;
        if (!raw) return { min: 0, max: 100 };
        const out = own ? evoViews(raw).own : raw; // own pane: force_overlay items and strategy markers do not count
        const from = vr ? vr.from : 0;
        const to = vr ? vr.to : this.core.runLen;
        const r = evoVisibleRange(out, from, to);
        if (!r || r.min === Infinity) return { min: 0, max: 100 };
        if (r.min === r.max) return { min: r.min - 1, max: r.max + 1 };
        return { min: r.min, max: r.max };
    }

    /** Main price scale autoscale contribution (overlay): plots, hlines and room for markers above / below bars */
    autoscaleExtra(from: number, to: number): AutoscaleExtra | null {
        const out = this.core.output;
        if (!out) return null;
        const r = evoVisibleRange(out, from, to, (this.host._sourceData as readonly unknown[]).length);
        return r ? { min: r.min, max: r.max, padTopPx: r.padTopPx, padBottomPx: r.padBottomPx } : null;
    }

    /** Panel flavour: autoscale contribution of the main-pane content (force_overlay items, strategy markers) */
    forcedAutoscaleExtra(from: number, to: number): AutoscaleExtra | null {
        const out = this.core.output;
        const f = out ? evoViews(out).forced : null;
        if (!f || !this.host.shown) return null;
        const r = evoVisibleRange(f, from, to, (this.host._sourceData as readonly unknown[]).length);
        return r && r.min !== Infinity ? { min: r.min, max: r.max, padTopPx: r.padTopPx, padBottomPx: r.padBottomPx } : null;
    }

    /** Panel flavour: draws the main-pane content onto the main pane's canvas */
    drawForced(ctx: CanvasRenderingContext2D, ts: TimeScale, ps: PriceScale, hpr: number, vpr: number, width: number, height: number, topInset: number): void {
        const out = this.core.output;
        const f = out ? evoViews(out).forced : null;
        if (!out || !f || !this.host.shown) return;
        try {
            drawEvoOutput({ ctx, timeScale: ts, priceScale: ps, hpr, vpr, width, height, bars: this.host._sourceData, out: f, runLen: this.core.runLen, pane: false, topInset, dark: this.host.theme !== 'light' });
        } catch (e) {
            console.warn('evo-script forced render failed', e);
        }
    }

    /** Last-value tags of every plot that shows on the price scale (own colour, own precision / format) */
    lastValueLabels(): EvoValueLabel[] {
        const out = this.core.output;
        return out ? evoLastValueLabels(out) : [];
    }

    scaleFormatter(): ((v: number) => string) | null {
        return evoScaleFormatter(this.core.output);
    }

    hits: EvoHit[] = [];

    /** Tables of the last run (nothing while hidden) */
    tables(): EvoTable[] {
        return this.host.shown ? (this.core.output?.tables ?? []) : [];
    }

    /** barcolor() override of the main series, or null (hidden / not set) */
    barColors(): { colors: Uint16Array; table: string[]; offset: number } | null {
        const out = this.core.output;
        if (!out || !out.barColors || !this.host.shown) return null;
        return { colors: out.barColors, table: out.colorTable, offset: out.barColorOffset };
    }

    /** Tooltip of the label under the pointer (media px of the pane), if any */
    tooltipAt(x: number, y: number): string | null {
        for (let k = this.hits.length - 1; k >= 0; k--) {
            const h = this.hits[k];
            if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.text;
        }
        return null;
    }

    legend(index?: number | null): IndicatorLegendInfo {
        const out = this.core.output;
        const params: string[] = [];
        if (out) {
            for (const def of out.inputs) {
                if (params.length >= 4) break;
                if (def.display === 'none' || def.display === 'data_window') continue; // not part of the status line
                if (def.type === 'bool' || def.type === 'boolean' || def.type === 'color' || def.type === 'time' || def.type === 'text_area') continue;
                const v = this.core.inputValue(def);
                if (v !== undefined && v !== null && v !== '') params.push(String(v));
            }
        }
        const plots: LegendPlot[] = [];
        if (out) {
            const len = this.core.runLen || (out.plots.length ? out.plots[0].values.length : 0);
            const i = legendBarIndex(len, index);
            const userPrec = typeof this.opts.precision === 'number' ? this.opts.precision : undefined;
            for (const p of out.plots) {
                if (!isPlotInLegend(p)) continue;
                const si = i - p.offset; // the value shown at bar i was computed at bar i - offset
                const v = si >= 0 && si < p.values.length ? p.values[si] : NaN;
                if (!Number.isFinite(v)) continue; // na values are hidden instead of listing "∅"
                const color = evoColorAt(out.colorTable, p.colors, si, p.color) ?? p.color;
                // same precision / format as the price scale labels (formatEvoPlotValue is the single source)
                plots.push({ color, value: v, text: formatEvoPlotValue(out, p, v, userPrec) });
            }
            // plotcandle / plotbar: open, high, low, close in the candle colour
            for (const c of out.candles) {
                if (!isPlotInLegend(c)) continue;
                const si = i - c.offset;
                if (si < 0 || si >= c.high.length || !candleOk(c, si)) continue;
                const color = evoColorAt(out.colorTable, c.colors, si, c.color ?? (c.close[si] >= c.open[si] ? '#26a69a' : '#ef5350')) ?? '#787b86';
                for (const arr of [c.open, c.high, c.low, c.close]) {
                    const v = arr[si];
                    const prec = userPrec ?? out.meta.precision ?? adaptivePrecision(v);
                    plots.push({ color, value: v, text: formatEvoNumber(v, prec, 'price') });
                }
            }
        }
        const info: IndicatorLegendInfo = {
            title: this.displayName(), params, plots, precision: out?.meta.precision,
        };
        if (this.core.status === 'error' && this.core.error) info.error = this.core.error.message;
        else if (this.core.busy && this.core.runCount > 0) info.busy = true;
        const alerts = this.core.lastBarAlerts;
        if (alerts.length > 0) info.alert = alerts.slice(0, 5).join('\n');
        return info;
    }

    description(): string {
        const e = this.core.error;
        return e ? `${this.displayName()}: ${e.message}` : this.displayName();
    }

    // --- settings dialog (dynamic from the last run's input definitions) ---

    settingsConfig(): IndicatorSettingsConfig {
        const defs = this.core.output?.inputs ?? [];
        const sections: Array<{ title?: string; raw?: boolean; rows: SettingRow[] }> = [
            { rows: [{ type: 'text', key: 'name', label: 'Name', placeholder: this.core.output?.meta.title ?? '' }] },
        ];
        const byGroup = new Map<string, EvoInputDef[]>();
        for (const def of defs) {
            const g = def.group || '';
            if (!byGroup.has(g)) byGroup.set(g, []);
            byGroup.get(g)!.push(def);
        }
        for (const [g, list] of byGroup) {
            // inputs sharing an inline id sit next to each other (at the place of the first one)
            const ordered: EvoInputDef[] = [];
            const placed = new Set<EvoInputDef>();
            for (const def of list) {
                if (placed.has(def)) continue;
                ordered.push(def);
                placed.add(def);
                if (def.inline) for (const o of list) if (!placed.has(o) && o.inline === def.inline) { ordered.push(o); placed.add(o); }
            }
            // script text is shown as written: group names are not upper-cased by the UI language, titles are not translated
            sections.push({ title: g || undefined, raw: true, rows: ordered.map((def) => this.rowFor(def)) });
        }
        return { name: this.displayName(), tabs: [{ id: 'inputs', label: 'Inputs', sections }, createVisibilityTab()] };
    }

    private rowFor(def: EvoInputDef): SettingRow {
        const key = INPUT_PREFIX + def.id;
        const label = def.title || def.id;
        const extra = { raw: true, inline: def.inline, tooltip: def.tooltip || undefined };
        const mk = (row: Record<string, unknown>): SettingRow => ({ ...row, ...extra }) as unknown as SettingRow;
        const t = def.type;
        if (t === 'bool' || t === 'boolean') return mk({ type: 'checkbox', key, label, defaultValue: !!def.default });
        if (t === 'color') return mk({ type: 'color', key, label, defaultValue: String(def.default ?? '#2962ff') });
        if (t === 'source') {
            return mk({ type: 'select', key, label, options: SOURCES.map((v) => ({ value: v, label: v })), defaultValue: String(def.default ?? 'close') });
        }
        if (t === 'timeframe') {
            const given = (def.options ?? []).map((o) => typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label ?? o.value });
            const options = given.length > 0 ? given.slice() : COMMON_TIMEFRAMES.slice();
            const cur = String(this.core.inputValue(def) ?? '');
            if (!options.some((o) => o.value === cur)) options.push({ value: cur, label: cur === '' ? 'Chart' : cur });
            if (!options.some((o) => o.value === '') && given.length === 0) options.unshift({ value: '', label: 'Chart' });
            return mk({ type: 'select', key, label, options, defaultValue: String(def.default ?? '') });
        }
        if (t === 'session') return mk({ type: 'session', key, label, defaultValue: String(def.default ?? '0930-1600') });
        if (t === 'time') return mk({ type: 'datetime', key, label, tz: this.core.timezone(), defaultValue: Number(def.default) });
        if (t === 'text_area') return mk({ type: 'textarea', key, label, defaultValue: String(def.default ?? '') });
        if (t === 'price') return mk({ type: 'number', key, label, min: def.min, max: def.max, step: def.step ?? 0.01, defaultValue: Number(def.default) });
        if (def.options && def.options.length > 0) {
            const options = def.options.map((o) => typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label ?? o.value });
            return mk({ type: 'select', key, label, options, defaultValue: String(def.default ?? options[0].value) });
        }
        if (t === 'int' || t === 'integer' || t === 'float' || t === 'number') {
            const isInt = t === 'int' || t === 'integer';
            return mk({ type: 'number', key, label, min: def.min, max: def.max, step: def.step ?? (isInt ? 1 : 0.1), defaultValue: Number(def.default) });
        }
        return mk({ type: 'text', key, label, defaultValue: String(def.default ?? '') });
    }

    getSetting(key: string): unknown {
        if (key === 'name') return this.core.settings.name;
        if (key.startsWith(INPUT_PREFIX)) {
            const id = key.slice(INPUT_PREFIX.length);
            const def = this.core.output?.inputs.find((d) => d.id === id);
            return def ? this.core.inputValue(def) : this.core.settings.inputs[id];
        }
        return undefined;
    }

    /** @returns true when the key was handled */
    setSetting(key: string, value: unknown): boolean {
        if (key === 'name') { this.core.setName(String(value ?? '')); return true; }
        if (key.startsWith(INPUT_PREFIX)) {
            const id = key.slice(INPUT_PREFIX.length);
            const def = this.core.output?.inputs.find((d) => d.id === id);
            let v: unknown = value;
            if (def && (def.type === 'int' || def.type === 'integer')) v = Math.round(Number(value));
            else if (def && (def.type === 'float' || def.type === 'number' || def.type === 'price' || def.type === 'time')) v = Number(value);
            else if (def && (def.type === 'bool' || def.type === 'boolean')) v = !!value;
            if (typeof v === 'number' && !Number.isFinite(v)) return true;
            this.core.setInput(id, v);
            return true;
        }
        return false;
    }

    draw(ctx: CanvasRenderingContext2D, ts: TimeScale, ps: PriceScale, hpr: number, vpr: number, width: number, height: number, pane = false, topInset = 0): void {
        const out = this.core.output;
        if (!out) return;
        try {
            const hits: EvoHit[] = [];
            drawEvoOutput({
                ctx, timeScale: ts, priceScale: ps, hpr, vpr, width, height,
                bars: this.host._sourceData, out: pane ? evoViews(out).own : out, runLen: this.core.runLen, pane, topInset, hits, dark: this.host.theme !== 'light',
            });
            this.hits = hits;
        } catch (e) {
            console.warn('evo-script render failed', e);
        }
    }

    state(): EvoScriptState {
        return this.core.state(this.displayName());
    }

    destroy(): void {
        // the core outlives the indicator only while the manager swaps flavours
        if (this.core.keepOnDestroy) return;
        this.core.onChange = null;
        this.core.onSettings = null;
        this.core.onPersist = null;
        this.core.onKindMismatch = null;
        this.core.destroy();
    }
}

const defaults = {
    name: 'Evo Script', color: '#2962ff', lineWidth: 2,
};

export class EvoScriptOverlayIndicator extends OverlayIndicator {
    readonly core: EvoScriptCore;
    private readonly _impl: EvoImpl;

    constructor(options: Partial<EvoScriptIndicatorOptions> = {}, core?: EvoScriptCore) {
        const b = buildCore(options, core);
        super({ ...defaults, ...options, id: b.id, name: options.name || defaults.name });
        this.core = b.core;
        this._impl = new EvoImpl(this, this.core);
    }

    setContext(ctx: { symbol: string; timeframe: string; exchange?: string; end?: number }): void { this.core.setContext(ctx); }
    calculate(sourceData: BarData[]): void { this._impl.calculate(sourceData); }
    recalculate(): void { this.core.rerun(); }
    getRange(): IndicatorRange { return this._impl.range(); }
    getDescription(): string { return this._impl.description(); }
    getLegendInfo(index?: number | null): IndicatorLegendInfo { return this._impl.legend(index); }
    getSettingsConfig(): IndicatorSettingsConfig { return this._impl.settingsConfig(); }
    getSettingValue(key: string): any { return this._impl.getSetting(key) ?? super.getSettingValue(key); }
    setSettingValue(key: string, value: any): boolean { return this._impl.setSetting(key, value) ? false : super.setSettingValue(key, value); }
    getEvoState(): EvoScriptState { return this._impl.state(); }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: TimeScale, priceScale: PriceScale, hpr: number, vpr: number, _vr?: unknown, scope?: any, topInset = 0): void {
        const w = scope?.mediaSize?.width ?? ctx.canvas.width / hpr;
        const h = scope?.mediaSize?.height ?? ctx.canvas.height / vpr;
        this._impl.draw(ctx, timeScale, priceScale, hpr, vpr, w, h, false, topInset);
    }

    /** Main price scale autoscale contribution (plots, hlines, room for markers) */
    getAutoscaleExtra(from: number, to: number): AutoscaleExtra | null { return this._impl.autoscaleExtra(from, to); }
    /** Price scale tags (one per plot that shows on the price scale) */
    getLastValueLabels(): EvoValueLabel[] { return this._impl.lastValueLabels(); }
    getLabelTooltipAt(x: number, y: number): string | null { return this._impl.tooltipAt(x, y); }
    getEvoTables(): EvoTable[] { return this._impl.tables(); }
    getBarColorOverride(): { colors: Uint16Array; table: string[]; offset: number } | null { return this._impl.barColors(); }

    destroy(): void { this._impl.destroy(); super.destroy(); }
}

export class EvoScriptPanelIndicator extends PanelIndicator {
    readonly core: EvoScriptCore;
    private readonly _impl: EvoImpl;

    constructor(options: Partial<EvoScriptIndicatorOptions> = {}, core?: EvoScriptCore) {
        const b = buildCore(options, core);
        super({ ...defaults, ...options, id: b.id, name: options.name || defaults.name });
        this.core = b.core;
        this._impl = new EvoImpl(this, this.core);
        this._paneHeight = 140;
    }

    setContext(ctx: { symbol: string; timeframe: string; exchange?: string; end?: number }): void { this.core.setContext(ctx); }
    calculate(sourceData: BarData[]): void { this._impl.calculate(sourceData); }
    recalculate(): void { this.core.rerun(); }
    getRange(vr?: { from: number; to: number } | null): IndicatorRange { return this._impl.range(vr, true); }
    /** Main pane: autoscale contribution / drawing of the force_overlay items and strategy markers */
    getForcedAutoscaleExtra(from: number, to: number): AutoscaleExtra | null { return this._impl.forcedAutoscaleExtra(from, to); }
    drawForced(ctx: CanvasRenderingContext2D, ts: TimeScale, ps: PriceScale, hpr: number, vpr: number, width: number, height: number, topInset = 0): void { this._impl.drawForced(ctx, ts, ps, hpr, vpr, width, height, topInset); }
    getDescription(): string { return this._impl.description(); }
    getLegendInfo(index?: number | null): IndicatorLegendInfo { return this._impl.legend(index); }
    getSettingsConfig(): IndicatorSettingsConfig { return this._impl.settingsConfig(); }
    getSettingValue(key: string): any { return this._impl.getSetting(key) ?? super.getSettingValue(key); }
    setSettingValue(key: string, value: any): boolean { return this._impl.setSetting(key, value) ? false : super.setSettingValue(key, value); }
    getEvoState(): EvoScriptState { return this._impl.state(); }
    /** hline price tags for the pane axis */
    getLastValueLabels(): EvoValueLabel[] { return this._impl.lastValueLabels(); }
    /** Label formatter of the pane's price scale (plot precision / format) */
    getScaleFormatter(): ((v: number) => string) | null { return this._impl.scaleFormatter(); }
    getLabelTooltipAt(x: number, y: number): string | null { return this._impl.tooltipAt(x, y); }
    getEvoTables(): EvoTable[] { return this._impl.tables(); }
    getBarColorOverride(): { colors: Uint16Array; table: string[]; offset: number } | null { return this._impl.barColors(); }
    getAxisLabels(): Array<{ price: number; color: string }> {
        const out = this.core.output;
        if (!out) return [];
        return out.hlines.filter((h) => isPlotDrawn(h) && Number.isFinite(h.price)).slice(0, 8).map((h) => ({ price: h.price, color: h.color.length === 9 ? h.color.slice(0, 7) : h.color }));
    }
    /** Colour of the last-value tag on the pane axis */
    getLineColors(): string[] {
        const out = this.core.output;
        const p = out?.plots.find(isPlotDrawn);
        return [p?.color ?? this._options.color];
    }

    /** Pane widget hook: replaces the default line drawing. ctx is already scaled to media pixels. */
    drawPane(ctx: CanvasRenderingContext2D, timeScale: TimeScale, priceScale: PriceScale, width: number, height: number): void {
        this._impl.draw(ctx, timeScale, priceScale, 1, 1, width, height, true, PANE_LEGEND_INSET);
    }

    destroy(): void { this._impl.destroy(); super.destroy(); }
}

export function isEvoScriptIndicator(x: unknown): x is EvoScriptOverlayIndicator | EvoScriptPanelIndicator {
    return x instanceof EvoScriptOverlayIndicator || x instanceof EvoScriptPanelIndicator;
}

export type { EvoScriptSettings };
