/**
 * Acik sekil araclari (Path, Polyline, Brush, Highlighter, Curve) icin ortak:
 * TradingView varsayilanlari, stil olusturma, ayar satirlari, alfa'li renk.
 *
 * Dolgu modeli shape-common.ts ile aynidir (fillColor + fillOpacity + fillEnabled;
 * "Seffaflik" = (1 - etkin alfa) * 100). Uc sekilleri line-tool-common.ts lineProps (leftEnd/rightEnd).
 */

import { DrawingStyle } from './drawing';
import {
    SettingsSection,
    SettingRow,
    colorRow,
    lineWidthRow,
    lineStyleRow,
    checkboxRow,
    selectRow,
    AttributeBarItem,
} from './drawing-settings-config';
import { endOptions, LineToolProps, DEFAULT_LINE_TOOL_PROPS, isLineProp, getLineProp, setLineProp } from './line-tool-common';
import { parseColor, getShapeSetting, setShapeSetting } from './shape-common';

export const TV_BLUE = '#2962FF';
export const TV_CYAN = '#00BCD4';
export const TV_RED = '#F23645';

/** Path varsayilani: sag uc ok. */
export const PATH_LINE_PROPS: Readonly<LineToolProps> = { ...DEFAULT_LINE_TOOL_PROPS, rightEnd: 'arrow' };

export interface OpenStyleOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    fillColor?: string;
    fillOpacity?: number;
}

export interface OpenStyleDefaults {
    color: string;
    lineWidth: number;
    /** undefined: bu aracta dolgu yok */
    fill?: { color: string; opacity: number; enabled: boolean };
}

/** Yeni cizim icin baslangic stili (TradingView varsayilanlari; secenekler uzerine yazar). */
export function createOpenStyle(base: DrawingStyle, d: OpenStyleDefaults, o: OpenStyleOptions = {}): DrawingStyle {
    const style: DrawingStyle = {
        ...base,
        color: o.color || d.color,
        lineWidth: o.lineWidth || d.lineWidth,
        lineDash: o.lineDash || [],
    };
    if (d.fill) {
        style.fillColor = o.fillColor || d.fill.color;
        style.fillOpacity = o.fillOpacity ?? d.fill.opacity;
        style.fillEnabled = d.fill.enabled;
    } else {
        delete style.fillColor;
        delete style.fillOpacity;
        delete style.fillEnabled;
    }
    return style;
}

/** Rengin kendi alfasi x opacity ile rgba dizgisi; cozulemezse renk aynen doner. */
export function colorWithAlpha(color: string, opacity: number): string {
    const p = parseColor(color);
    if (!p) return color;
    return `rgba(${p.r}, ${p.g}, ${p.b}, ${Math.round(p.a * opacity * 10000) / 10000})`;
}

export function lineEndRows(): SettingRow[] {
    return [
        selectRow('leftEnd', 'Left end', endOptions()),
        selectRow('rightEnd', 'Right end', endOptions()),
    ];
}

export function backgroundSection(): SettingsSection {
    return {
        title: 'Background',
        rows: [
            checkboxRow('fillEnabled', 'Background', true),
            colorRow('fillColor', 'Color'),
            { type: 'slider', key: 'fillTransparency', label: 'Transparency', min: 0, max: 100, step: 1, unit: '%', suffix: '%' } as any,
        ],
    };
}

/** Cizgi bolumu: renk, kalinlik, (stil), (uc sekilleri). */
export function openLineSection(opts: { style?: boolean; ends?: boolean } = {}): SettingsSection {
    const rows: SettingRow[] = [colorRow('color', 'Color'), lineWidthRow('lineWidth')];
    if (opts.style !== false) rows.push(lineStyleRow('lineStyle'));
    if (opts.ends) rows.push(...lineEndRows());
    return { title: 'Line', rows };
}

export function openAttributeBarItems(o: { fill: boolean; style: boolean }): AttributeBarItem[] {
    const items: AttributeBarItem[] = [{ type: 'color', key: 'color', tooltip: 'Line Color' }];
    if (o.fill) items.push({ type: 'color', key: 'fillColor', tooltip: 'Background Color' });
    items.push({ type: 'lineWidth', key: 'lineWidth', tooltip: 'Line Width' });
    if (o.style) items.push({ type: 'lineStyle', key: 'lineStyle', tooltip: 'Line Style' });
    return items;
}

/** Stil (renk/kalinlik/cizgi stili/dolgu) ve uc sekli anahtarlarini okur. */
export function getOpenSetting(style: DrawingStyle, lineProps: LineToolProps | undefined, key: string): any {
    if (lineProps && (key === 'leftEnd' || key === 'rightEnd') && isLineProp(key)) return getLineProp(lineProps, key);
    return getShapeSetting(style, key);
}

/** Yazar; islenen anahtar icin true. */
export function setOpenSetting(style: DrawingStyle, lineProps: LineToolProps | undefined, key: string, value: any): boolean {
    if (lineProps && (key === 'leftEnd' || key === 'rightEnd')) return setLineProp(lineProps, key, value);
    return setShapeSetting(style, key, value);
}
