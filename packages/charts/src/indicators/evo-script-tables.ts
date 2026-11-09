/**
 * Evo Script tables (Pine `table.*`): an HTML overlay on top of a pane. The container ignores the
 * pointer; only the table itself takes pointer events (and shows cell tooltips).
 *
 * One container per pane element. Every call rebuilds from the tables the pane's Evo indicators
 * currently expose: when several tables use the same position the later one replaces the earlier
 * one (TradingView behaviour). The DOM is only rebuilt when a table object, the pane size, the
 * top inset or the theme colours changed.
 */

import type { EvoTable, EvoTableCell } from './evo-script-core';
import { canvasSans, canvasMono } from '../helpers/fonts';
import { HoverTip } from '../gui/hover-tip';

export interface EvoTableSource { id: string; tables: readonly EvoTable[] }
export interface EvoTableTheme { fg: string; bg: string }

/** Default text colour for a pane background: light text on dark panes, dark text on light panes */
export function evoTableTheme(bg: string): EvoTableTheme {
    let lum = 0;
    const c = (bg || '').trim();
    let m = /^#([0-9a-f]{6})/i.exec(c);
    if (m) { const v = parseInt(m[1], 16); lum = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255; }
    else if ((m = /^#([0-9a-f]{3})$/i.exec(c))) { const h = m[1]; lum = (0.299 * parseInt(h[0] + h[0], 16) + 0.587 * parseInt(h[1] + h[1], 16) + 0.114 * parseInt(h[2] + h[2], 16)) / 255; }
    else if ((m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(c))) lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
    return { fg: lum > 0.55 ? '#131722' : '#d1d4dc', bg };
}

interface Mount {
    el: HTMLDivElement;
    tip: HoverTip;
    sig: unknown[];
    key: string;
}

const mounts = new WeakMap<HTMLElement, Mount>();

const MARGIN = 6;

function textPx(size: string | number | undefined): number {
    if (typeof size === 'number') return Math.max(6, Math.min(72, size));
    switch (size) {
        case 'tiny': return 8;
        case 'small': return 10;
        case 'large': return 16;
        case 'huge': return 22;
        default: return 12; // normal / auto
    }
}

/** Extra css px (measured) to stay clear of other overlays living in the pane corners */
export interface EvoTableAvoid { topRight?: number; bottomLeft?: number }

function wrapperStyle(position: string, topInset: number, avoid?: EvoTableAvoid): string {
    const [v, h] = position.split('_');
    let css = 'position:absolute;';
    const tf: string[] = [];
    const corner = h === 'left' ? 'bl' : h === 'right' ? 'tr' : '';
    if (v === 'bottom') css += `bottom:${MARGIN + (corner === 'bl' ? Math.max(0, avoid?.bottomLeft ?? 0) : 0)}px;`;
    else if (v === 'middle') { css += 'top:50%;'; tf.push('translateY(-50%)'); }
    else css += `top:${Math.max(topInset, corner === 'tr' ? Math.max(0, avoid?.topRight ?? 0) : 0) + MARGIN}px;`;
    if (h === 'left') css += `left:${MARGIN}px;`;
    else if (h === 'center') { css += 'left:50%;'; tf.push('translateX(-50%)'); }
    else css += `right:${MARGIN}px;`;
    if (tf.length) css += `transform:${tf.join(' ')};`;
    return css + 'pointer-events:auto;';
}

function buildTable(t: EvoTable, paneW: number, paneH: number, theme: EvoTableTheme): HTMLTableElement {
    const table = document.createElement('table');
    const hasBorder = t.borderWidth > 0 && !!t.borderColor;
    table.style.cssText = `border-collapse:collapse;border-spacing:0;table-layout:auto;margin:0;` +
        (t.bgcolor ? `background:${t.bgcolor};` : '') +
        (t.frameWidth > 0 && t.frameColor ? `border:${t.frameWidth}px solid ${t.frameColor};` : '');

    // cell grid: anchor cell per position, spans, covered slots
    const anchors = new Map<number, EvoTableCell>();
    const covered = new Set<number>();
    const key = (c: number, r: number) => r * t.columns + c;
    for (const cell of t.cells) anchors.set(key(cell.col, cell.row), cell);
    for (const cell of t.cells) {
        if (!cell.merge) continue;
        for (let r = cell.row; r <= cell.merge.toRow; r++) {
            for (let c = cell.col; c <= cell.merge.toCol; c++) if (c !== cell.col || r !== cell.row) covered.add(key(c, r));
        }
    }
    // column widths / row heights come from the cells that span one column / row (percent of the pane, 0 = auto)
    const colW = new Array<number>(t.columns).fill(0);
    const rowH = new Array<number>(t.rows).fill(0);
    for (const cell of t.cells) {
        const spanC = cell.merge ? cell.merge.toCol - cell.col + 1 : 1;
        const spanR = cell.merge ? cell.merge.toRow - cell.row + 1 : 1;
        if (cell.width && cell.width > 0) {
            const px = (paneW * cell.width) / 100 / spanC;
            for (let c = cell.col; c < cell.col + spanC; c++) colW[c] = Math.max(colW[c], px);
        }
        if (cell.height && cell.height > 0) {
            const px = (paneH * cell.height) / 100 / spanR;
            for (let r = cell.row; r < cell.row + spanR; r++) rowH[r] = Math.max(rowH[r], px);
        }
    }
    if (colW.some((w) => w > 0)) {
        const cg = document.createElement('colgroup');
        for (let c = 0; c < t.columns; c++) {
            const col = document.createElement('col');
            if (colW[c] > 0) col.style.width = `${Math.round(colW[c])}px`;
            cg.appendChild(col);
        }
        table.appendChild(cg);
    }

    const tbody = document.createElement('tbody');
    for (let r = 0; r < t.rows; r++) {
        const tr = document.createElement('tr');
        if (rowH[r] > 0) tr.style.height = `${Math.round(rowH[r])}px`;
        for (let c = 0; c < t.columns; c++) {
            const k = key(c, r);
            if (covered.has(k)) continue;
            const cell = anchors.get(k);
            const td = document.createElement('td');
            const px = textPx(cell?.textSize);
            const mono = cell?.fontFamily === 'monospace';
            const wrap = cell?.textWrap === 'auto';
            let css = `padding:2px 6px;box-sizing:border-box;line-height:${Math.round(px * 1.35)}px;font-size:${px}px;` +
                `font-family:${mono ? canvasMono() : canvasSans()};color:${cell?.textColor ?? theme.fg};` +
                `text-align:${cell?.textHalign ?? 'center'};vertical-align:${cell?.textValign === 'top' ? 'top' : cell?.textValign === 'bottom' ? 'bottom' : 'middle'};` +
                `white-space:${wrap ? 'normal' : 'pre'};${wrap ? 'word-break:break-word;' : ''}`;
            const tf = cell?.textFormatting;
            if (tf) css += `${/bold/.test(tf) ? 'font-weight:bold;' : ''}${/italic/.test(tf) ? 'font-style:italic;' : ''}`;
            if (cell?.bgcolor) css += `background:${cell.bgcolor};`;
            if (hasBorder) css += `border:${t.borderWidth}px solid ${t.borderColor};`;
            td.style.cssText = css;
            if (cell) {
                td.textContent = cell.text;
                if (cell.merge) {
                    if (cell.merge.toCol > cell.col) td.colSpan = cell.merge.toCol - cell.col + 1;
                    if (cell.merge.toRow > cell.row) td.rowSpan = cell.merge.toRow - cell.row + 1;
                }
                if (cell.tooltip) td.dataset.tip = cell.tooltip;
            }
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
}

/** Remove the overlay of a pane (no Evo table left) */
export function clearEvoTables(host: HTMLElement | null): void {
    if (!host) return;
    const m = mounts.get(host);
    if (!m) return;
    m.tip.dispose();
    m.el.remove();
    mounts.delete(host);
}

/**
 * Show the tables of `sources` (in indicator order) over `host`.
 * @param topInset css px at the top of the pane covered by the legend; top_* tables start below it
 * @param avoid measured size of foreign overlays (rating card top right, logo bottom left)
 */
export function syncEvoTables(host: HTMLElement, sources: readonly EvoTableSource[], paneW: number, paneH: number, theme: EvoTableTheme, topInset = 0, avoid?: EvoTableAvoid): void {
    const byPos = new Map<string, EvoTable>();
    for (const s of sources) for (const t of s.tables) byPos.set(t.position, t);
    if (byPos.size === 0) { clearEvoTables(host); return; }
    const shown = [...byPos.values()];
    let m = mounts.get(host);
    const key = `${Math.round(paneW)}|${Math.round(paneH)}|${Math.round(topInset)}|${Math.round(avoid?.topRight ?? 0)}|${Math.round(avoid?.bottomLeft ?? 0)}|${theme.fg}|${theme.bg}`;
    if (m && m.key === key && m.sig.length === shown.length && shown.every((t, i) => m!.sig[i] === t)) return;
    if (!m) {
        const el = document.createElement('div');
        el.className = 'evo-tables';
        el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;overflow:hidden;z-index:6;';
        host.appendChild(el);
        const tip = new HoverTip(() => host);
        el.addEventListener('mousemove', (e) => {
            const td = (e.target as HTMLElement | null)?.closest?.('td[data-tip]') as HTMLElement | null;
            const r = host.getBoundingClientRect();
            tip.set(td ? td.dataset.tip ?? null : null, e.clientX - r.left, e.clientY - r.top);
        });
        el.addEventListener('mouseleave', () => tip.hide());
        m = { el, tip, sig: [], key: '' };
        mounts.set(host, m);
    } else if (m.el.parentElement !== host) {
        host.appendChild(m.el);
    }
    m.el.style.width = `${paneW}px`;
    m.el.style.height = `${paneH}px`;
    m.el.replaceChildren();
    for (const t of shown) {
        const wrap = document.createElement('div');
        wrap.style.cssText = wrapperStyle(t.position, topInset, avoid);
        wrap.appendChild(buildTable(t, paneW, paneH, theme));
        m.el.appendChild(wrap);
    }
    m.tip.hide();
    m.sig = shown;
    m.key = key;
}
