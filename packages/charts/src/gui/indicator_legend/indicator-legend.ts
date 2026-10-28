/**
 * Indicator legend (the rows at the top-left of a pane): title + muted parameters,
 * coloured plot values and hover buttons (eye, settings, remove, more).
 * One list is used for the main pane (many rows, collapsible) and one per
 * indicator sub-pane (a single row).
 */

import type { Indicator, IndicatorLegendInfo } from '../../indicators/indicator';
import { legendPlotText } from '../../indicators/legend-info';
import { t } from '../../helpers/translations';
import { LEGEND_STYLE, LegendTheme, legendColors } from './legend-constants';
import { LEGEND_ICONS } from './legend-icons';
import {
    collapsedLegendLabel,
    isLegendCollapsed,
    readLegendCollapsed,
    shouldShowCollapseToggle,
    writeLegendCollapsed,
} from './legend-state';

export type LegendAction = 'toggle' | 'settings' | 'remove' | 'more';

export interface LegendPoint {
    /** Viewport coordinates of the click / right-click */
    x: number;
    y: number;
    /** Button rect when opened from the "more" button */
    rect?: DOMRect;
}

export type LegendActionHandler = (action: LegendAction, indicator: Indicator, point: LegendPoint) => void;

export interface IndicatorLegendListOptions {
    /** Show the collapse toggle when there are many rows (main pane) */
    collapsible: boolean;
    /** Key the collapse state is stored under (one per chart) */
    chartKey: string;
}

const STYLE_ID = 'tv-indicator-legend-style';

function ensureStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const m = LEGEND_STYLE.metrics;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .tvl-list { display: flex; flex-direction: column; align-items: flex-start; gap: ${m.rowGap}px; font-size: ${m.fontSize}px; line-height: ${m.rowHeight}px; pointer-events: none; color: var(--tvl-text); }
        .tvl-row { display: flex; align-items: center; gap: ${m.gap}px; height: ${m.rowHeight}px; padding: 0 ${m.rowPadX}px; margin-left: -${m.rowPadX}px; border-radius: ${m.radius}px; width: max-content; max-width: 100%; box-sizing: border-box; white-space: nowrap; cursor: default; pointer-events: auto; user-select: none; }
        .tvl-row:hover, .tvl-row.tvl-menu-open { background: var(--tvl-rowbg); }
        .tvl-title { display: inline-flex; align-items: baseline; gap: 4px; }
        .tvl-name { color: var(--tvl-text); }
        .tvl-params { color: var(--tvl-muted); }
        .tvl-values { display: inline-flex; align-items: center; gap: ${m.gap}px; }
        .tvl-hidden .tvl-title { opacity: ${m.dimmedOpacity}; }
        .tvl-hidden .tvl-values { display: none; }
        .tvl-btns { display: none; align-items: center; margin-right: -2px; }
        .tvl-row:hover .tvl-btns, .tvl-row.tvl-menu-open .tvl-btns { display: inline-flex; }
        .tvl-btn { width: ${m.buttonSize}px; height: ${m.buttonSize}px; padding: 0; border: 0; border-radius: ${m.radius}px; background: none; color: var(--tvl-muted); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .tvl-btn:hover { background: var(--tvl-hover); color: var(--tvl-text); }
        .tvl-toggle { color: var(--tvl-muted); }
        .tvl-toggle .tvl-btn { margin-left: -${m.rowPadX}px; }
    `;
    document.head.appendChild(style);
}

interface RowRef {
    indicator: Indicator;
    valueEls: HTMLElement[];
    lastText: string[];
    lastColor: string[];
}

export class IndicatorLegendList {
    readonly element: HTMLElement;
    private readonly _options: IndicatorLegendListOptions;
    private readonly _handler: LegendActionHandler;
    private _collapsedStored: boolean;
    private _theme: LegendTheme = 'dark';
    private _signature = '';
    private _rows: RowRef[] = [];
    private _lastIndicators: readonly Indicator[] = [];
    private _lastBarIndex: number | null = null;

    constructor(handler: LegendActionHandler, options: IndicatorLegendListOptions) {
        ensureStyles();
        this._handler = handler;
        this._options = options;
        this._collapsedStored = options.collapsible ? readLegendCollapsed(options.chartKey) : false;
        this.element = document.createElement('div');
        this.element.className = 'tvl-list';
    }

    /** Switch the chart key (per-chart storage) and reload the stored state */
    setChartKey(key: string): void {
        if (key === this._options.chartKey) return;
        this._options.chartKey = key;
        this._collapsedStored = this._options.collapsible ? readLegendCollapsed(key) : false;
        this._signature = '';
        this.update(this._lastIndicators, this._lastBarIndex, this._theme);
    }

    get collapsed(): boolean {
        return this._collapsedStored;
    }

    setCollapsed(collapsed: boolean): void {
        this._collapsedStored = collapsed;
        writeLegendCollapsed(this._options.chartKey, collapsed);
        this.update(this._lastIndicators, this._lastBarIndex, this._theme);
    }

    update(indicators: readonly Indicator[], barIndex: number | null, theme: LegendTheme): void {
        this._lastIndicators = indicators;
        this._lastBarIndex = barIndex;
        this._theme = theme;

        const infos = indicators.map((ind) => IndicatorLegendList._info(ind, barIndex));
        const toggleShown = this._options.collapsible && shouldShowCollapseToggle(indicators.length);
        const collapsed = this._options.collapsible && isLegendCollapsed(indicators.length, this._collapsedStored);

        const signature = [
            theme, collapsed ? 'c' : 'e', toggleShown ? 't' : '-',
            ...indicators.map((ind, i) => `${ind.id}|${ind.visible ? 1 : 0}|${ind.hiddenByInterval ? 1 : 0}|${infos[i].title}|${infos[i].params.join(' ')}|${infos[i].plots.length}`),
        ].join('\n');

        if (signature !== this._signature) {
            this._signature = signature;
            this._rebuild(indicators, infos, toggleShown, collapsed);
        }

        // Values follow the crosshair bar
        for (let i = 0; i < this._rows.length; i++) {
            const row = this._rows[i];
            const info = infos[i];
            if (!info) continue;
            for (let j = 0; j < row.valueEls.length; j++) {
                const plot = info.plots[j];
                if (!plot) continue;
                const text = legendPlotText(plot, indicators[i].options.precision ?? info.precision);
                if (row.lastText[j] !== text) {
                    row.valueEls[j].textContent = text;
                    row.lastText[j] = text;
                }
                if (row.lastColor[j] !== plot.color) {
                    row.valueEls[j].style.color = plot.color;
                    row.lastColor[j] = plot.color;
                }
            }
        }
    }

    private static _info(ind: Indicator, barIndex: number | null): IndicatorLegendInfo {
        try {
            return ind.getLegendInfo(barIndex);
        } catch {
            return { title: ind.name || 'Indicator', params: [], plots: [] };
        }
    }

    private _rebuild(indicators: readonly Indicator[], infos: IndicatorLegendInfo[], toggleShown: boolean, collapsed: boolean): void {
        const c = legendColors(this._theme);
        const el = this.element;
        el.style.setProperty('--tvl-text', c.text);
        el.style.setProperty('--tvl-muted', c.muted);
        el.style.setProperty('--tvl-hover', c.hoverBg);
        el.style.setProperty('--tvl-rowbg', c.rowBg);
        el.innerHTML = '';
        this._rows = [];

        if (toggleShown) el.appendChild(this._buildToggle(indicators.length, collapsed));
        if (collapsed) return;

        indicators.forEach((ind, i) => this._rows.push(this._buildRow(ind, infos[i])));
    }

    private _buildToggle(count: number, collapsed: boolean): HTMLElement {
        const row = document.createElement('div');
        row.className = 'tvl-row tvl-toggle';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tvl-btn';
        btn.innerHTML = collapsed ? LEGEND_ICONS.chevronDown : LEGEND_ICONS.chevronUp;
        const label = collapsed ? t('Show indicators') : t('Hide indicators');
        btn.title = label;
        btn.setAttribute('aria-label', label);
        row.appendChild(btn);
        if (collapsed) {
            const text = document.createElement('span');
            text.textContent = collapsedLegendLabel(count, t('indicators'));
            row.appendChild(text);
        }
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            this.setCollapsed(!collapsed);
        });
        return row;
    }

    private _buildRow(ind: Indicator, info: IndicatorLegendInfo): RowRef {
        const row = document.createElement('div');
        const hiddenByInterval = ind.hiddenByInterval;
        row.className = 'tvl-row' + (ind.visible && !hiddenByInterval ? '' : ' tvl-hidden');
        row.dataset.indId = ind.id;

        const title = document.createElement('span');
        title.className = 'tvl-title';
        if (hiddenByInterval) title.title = t('Hidden on this timeframe');
        const name = document.createElement('span');
        name.className = 'tvl-name';
        name.textContent = info.title;
        title.appendChild(name);
        if (info.params.length > 0) {
            const params = document.createElement('span');
            params.className = 'tvl-params';
            params.textContent = info.params.join(' ');
            title.appendChild(params);
        }
        row.appendChild(title);

        const values = document.createElement('span');
        values.className = 'tvl-values';
        const valueEls: HTMLElement[] = [];
        for (let j = 0; j < info.plots.length; j++) {
            const v = document.createElement('span');
            v.className = 'tvl-value';
            valueEls.push(v);
            values.appendChild(v);
        }
        row.appendChild(values);

        const btns = document.createElement('span');
        btns.className = 'tvl-btns';
        const mk = (action: LegendAction, icon: string, label: string) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tvl-btn';
            b.dataset.action = action;
            b.innerHTML = icon;
            b.title = label;
            b.setAttribute('aria-label', label);
            b.addEventListener('mousedown', (e) => e.stopPropagation());
            b.addEventListener('dblclick', (e) => e.stopPropagation());
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                const rect = b.getBoundingClientRect();
                this._handler(action, ind, { x: rect.left, y: rect.bottom, rect });
            });
            btns.appendChild(b);
        };
        mk('toggle', ind.visible ? LEGEND_ICONS.eye : LEGEND_ICONS.eyeOff, ind.visible ? t('Hide') : t('Show'));
        mk('settings', LEGEND_ICONS.settings, t('Settings'));
        mk('remove', LEGEND_ICONS.remove, t('Remove'));
        mk('more', LEGEND_ICONS.more, t('More'));
        row.appendChild(btns);

        row.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this._handler('settings', ind, { x: e.clientX, y: e.clientY });
        });
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._handler('more', ind, { x: e.clientX, y: e.clientY });
        });
        // Do not let presses on the legend start a chart pan / drawing
        row.addEventListener('mousedown', (e) => e.stopPropagation());

        this.element.appendChild(row);
        return { indicator: ind, valueEls, lastText: [], lastColor: [] };
    }
}
