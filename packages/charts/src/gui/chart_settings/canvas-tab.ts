/**
 * Chart settings dialog, "Canvas" tab (TradingView: Settings > Canvas).
 * Builds the rows and talks to the chart through CanvasChartApi. Every
 * change is applied live; the modal snapshots the state first and reverts
 * it on cancel (see snapshotCanvas / restoreCanvas).
 */

import { t } from '../../helpers/translations';
import { createColorInput } from '../indicator_settings/components/ColorInput';
import { ensureSettingsStyles } from '../indicator_settings/base/styles';

type LineStyle = 'solid' | 'dashed' | 'dotted';
export type GridLinesMode = 'both' | 'vert' | 'horz' | 'none';

interface GridLineOptions { visible: boolean; color: string; style: LineStyle }
export interface GridOptionsState { vertLines: GridLineOptions; horzLines: GridLineOptions }
export interface BackgroundState { type: 'solid' | 'gradient'; color: string; gradientColor: string }
export interface CrosshairStyleState { color: string; style: LineStyle; width: number }
export interface WatermarkState { visible: boolean; color: string }

/** Chart methods used by this tab. Grid ones exist; the rest are optional (row hides when missing). */
export interface CanvasChartApi {
    getGridOptions?(): GridOptionsState;
    setGridOptions?(partial: Partial<{ vertLines: Partial<GridLineOptions>; horzLines: Partial<GridLineOptions> }>): void;
    getGridLinesMode?(): GridLinesMode;
    setGridLinesMode?(mode: GridLinesMode): void;
    getBackgroundOptions?(): BackgroundState;
    setBackgroundOptions?(partial: Partial<BackgroundState>): void;
    getPaneSeparatorColor?(): string;
    setPaneSeparatorColor?(color: string): void;
    getCrosshairStyle?(): CrosshairStyleState;
    setCrosshairStyle?(partial: Partial<CrosshairStyleState>): void;
    getWatermarkOptions?(): WatermarkState;
    setWatermarkOptions?(partial: Partial<WatermarkState>): void;
}

export interface CanvasSnapshot {
    grid?: GridOptionsState;
    gridMode?: GridLinesMode;
    background?: BackgroundState;
    paneSeparator?: string;
    crosshair?: CrosshairStyleState;
    watermark?: WatermarkState;
}

const has = (chart: CanvasChartApi, m: keyof CanvasChartApi): boolean => typeof chart[m] === 'function';
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function snapshotCanvas(chart: CanvasChartApi): CanvasSnapshot {
    const s: CanvasSnapshot = {};
    if (has(chart, 'getGridOptions')) s.grid = clone(chart.getGridOptions!());
    if (has(chart, 'getGridLinesMode')) s.gridMode = chart.getGridLinesMode!();
    if (has(chart, 'getBackgroundOptions')) s.background = clone(chart.getBackgroundOptions!());
    if (has(chart, 'getPaneSeparatorColor')) s.paneSeparator = chart.getPaneSeparatorColor!();
    if (has(chart, 'getCrosshairStyle')) s.crosshair = clone(chart.getCrosshairStyle!());
    if (has(chart, 'getWatermarkOptions')) s.watermark = clone(chart.getWatermarkOptions!());
    return s;
}

export function restoreCanvas(chart: CanvasChartApi, s: CanvasSnapshot): void {
    if (s.grid && has(chart, 'setGridOptions')) chart.setGridOptions!(clone(s.grid));
    if (s.gridMode && has(chart, 'setGridLinesMode')) chart.setGridLinesMode!(s.gridMode);
    if (s.background && has(chart, 'setBackgroundOptions')) chart.setBackgroundOptions!(clone(s.background));
    if (s.paneSeparator !== undefined && has(chart, 'setPaneSeparatorColor')) chart.setPaneSeparatorColor!(s.paneSeparator);
    if (s.crosshair && has(chart, 'setCrosshairStyle')) chart.setCrosshairStyle!(clone(s.crosshair));
    if (s.watermark && has(chart, 'setWatermarkOptions')) chart.setWatermarkOptions!(clone(s.watermark));
}

export interface CanvasTabContext {
    chart: CanvasChartApi;
    /** select element css (shares the dialog look) */
    selectStyle: string;
    isDark: boolean;
    /** Rebuild the tab (swatch count depends on the selects) */
    rerender: () => void;
    sectionTitle: (text: string) => HTMLElement;
}

function makeRow(labelText: string): { row: HTMLElement; control: HTMLElement; label: HTMLElement } {
    const row = document.createElement('div');
    row.style.cssText = `
        display: grid;
        grid-template-columns: 150px minmax(0, 260px);
        align-items: center;
        gap: 18px;
        margin-bottom: 14px;
        min-height: 40px;
    `;
    const label = document.createElement('div');
    label.textContent = labelText;
    label.style.cssText = 'font-size: 16px; line-height: 1.2;';
    const control = document.createElement('div');
    control.style.cssText = 'display: flex; align-items: center; gap: 8px; min-width: 0;';
    row.appendChild(label);
    row.appendChild(control);
    return { row, control, label };
}

function makeSelect(
    ctx: CanvasTabContext,
    options: Array<[string, string]>,
    value: string,
    onChange: (v: string) => void,
    width?: number
): HTMLSelectElement {
    const select = document.createElement('select');
    select.style.cssText = ctx.selectStyle + `min-width: 0; flex: ${width ? `0 0 ${width}px` : '1 1 auto'};`;
    for (const [val, text] of options) {
        const o = document.createElement('option');
        o.value = val;
        o.textContent = text;
        select.appendChild(o);
    }
    select.value = value;
    select.addEventListener('change', () => onChange(select.value));
    return select;
}

function makeSwatch(value: string, title: string | null, onChange: (v: string) => void): HTMLElement {
    const el = createColorInput(value, onChange);
    el.style.flex = '0 0 auto';
    if (title) (el.firstElementChild as HTMLElement | null)?.setAttribute('title', title);
    return el;
}

function makeCheckbox(checked: boolean, onChange: (v: boolean) => void): HTMLElement {
    const box = document.createElement('button');
    box.type = 'button';
    box.setAttribute('role', 'checkbox');
    const paint = () => {
        box.style.background = checked ? '#3b3f46' : 'transparent';
        box.style.color = checked ? '#ffffff' : 'transparent';
        box.setAttribute('aria-checked', String(checked));
    };
    box.style.cssText = `
        width: 26px; height: 26px; flex: 0 0 auto; border-radius: 7px;
        border: 1px solid rgba(128, 132, 142, 0.5); font-size: 16px; line-height: 1; cursor: pointer; padding: 0;
    `;
    box.textContent = '✓';
    paint();
    box.addEventListener('click', () => {
        checked = !checked;
        paint();
        onChange(checked);
    });
    return box;
}

export function buildCanvasTab(ctx: CanvasTabContext): HTMLElement {
    ensureSettingsStyles();
    const { chart } = ctx;
    const root = document.createElement('div');
    root.appendChild(ctx.sectionTitle(t('CHART BASIC STYLES')));

    // Background
    if (has(chart, 'getBackgroundOptions') && has(chart, 'setBackgroundOptions')) {
        const bg = clone(chart.getBackgroundOptions!());
        const { row, control } = makeRow(t('Canvas background'));
        control.appendChild(makeSelect(ctx, [['solid', t('Solid')], ['gradient', t('Gradient')]], bg.type, (v) => {
            chart.setBackgroundOptions!({ type: v as BackgroundState['type'] });
            ctx.rerender();
        }));
        control.appendChild(makeSwatch(bg.color, bg.type === 'gradient' ? t('Top color') : null, (c) => chart.setBackgroundOptions!({ color: c })));
        if (bg.type === 'gradient') {
            control.appendChild(makeSwatch(bg.gradientColor, t('Bottom color'), (c) => chart.setBackgroundOptions!({ gradientColor: c })));
        }
        root.appendChild(row);
    }

    // Grid lines
    if (has(chart, 'getGridOptions') && has(chart, 'setGridOptions') && has(chart, 'getGridLinesMode') && has(chart, 'setGridLinesMode')) {
        const grid = chart.getGridOptions!();
        const mode = chart.getGridLinesMode!();
        const { row, control } = makeRow(t('Grid lines'));
        control.appendChild(makeSelect(ctx, [
            ['both', t('Vert and horz')],
            ['vert', t('Vert only')],
            ['horz', t('Horz only')],
            ['none', t('None')],
        ], mode, (v) => {
            chart.setGridLinesMode!(v as GridLinesMode);
            ctx.rerender();
        }));
        const vert = () => makeSwatch(grid.vertLines.color, t('Vertical grid lines color'),
            (c) => chart.setGridOptions!({ vertLines: { ...chart.getGridOptions!().vertLines, color: c } }));
        const horz = () => makeSwatch(grid.horzLines.color, t('Horizontal grid lines color'),
            (c) => chart.setGridOptions!({ horzLines: { ...chart.getGridOptions!().horzLines, color: c } }));
        if (mode === 'both') { control.appendChild(vert()); control.appendChild(horz()); }
        else if (mode === 'vert') control.appendChild(vert());
        else if (mode === 'horz') control.appendChild(horz());
        root.appendChild(row);
    }

    // Pane separators
    if (has(chart, 'getPaneSeparatorColor') && has(chart, 'setPaneSeparatorColor')) {
        const { row, control } = makeRow(t('Pane separators'));
        control.appendChild(makeSwatch(chart.getPaneSeparatorColor!(), null, (c) => chart.setPaneSeparatorColor!(c)));
        root.appendChild(row);
    }

    // Crosshair
    if (has(chart, 'getCrosshairStyle') && has(chart, 'setCrosshairStyle')) {
        const ch = clone(chart.getCrosshairStyle!());
        const { row, control } = makeRow(t('Crosshair cursor'));
        control.appendChild(makeSwatch(ch.color, null, (c) => chart.setCrosshairStyle!({ color: c })));
        control.appendChild(makeSelect(ctx, [['solid', t('Solid')], ['dashed', t('Dashed')], ['dotted', t('Dotted')]], ch.style,
            (v) => chart.setCrosshairStyle!({ style: v as LineStyle }), 112));
        control.appendChild(makeSelect(ctx, [1, 2, 3, 4].map((n) => [String(n), `${n}px`] as [string, string]), String(ch.width),
            (v) => chart.setCrosshairStyle!({ width: Number(v) }), 76));
        root.appendChild(row);
    }

    // Watermark
    if (has(chart, 'getWatermarkOptions') && has(chart, 'setWatermarkOptions')) {
        const wm = clone(chart.getWatermarkOptions!());
        const { row, control, label } = makeRow('');
        label.style.cssText = 'display: flex; align-items: center; gap: 12px; font-size: 16px; line-height: 1.2;';
        label.appendChild(makeCheckbox(wm.visible, (v) => chart.setWatermarkOptions!({ visible: v })));
        const text = document.createElement('span');
        text.textContent = t('Watermark');
        label.appendChild(text);
        control.appendChild(makeSwatch(wm.color, null, (c) => chart.setWatermarkOptions!({ color: c })));
        root.appendChild(row);
    }

    return root;
}
