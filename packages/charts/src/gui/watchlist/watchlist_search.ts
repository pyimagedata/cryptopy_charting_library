/**
 * Sembol ekleme arama penceresi: host'un verdigi satirlar uzerinde kod / ad / borsa
 * filtresi, ok tuslari + Enter ile ekleme (pencere acik kalir), Esc ile kapanma.
 */

import { displaySymbol, displayExchange } from '../../helpers/display-aliases';
import { WL_COLORS, WatchlistTheme } from './watchlist_theme';
import { applyRpTokens, ensureRpStyles, rpEmptyState, RP_SEARCH_SVG, RP_FONT, RP_FONT_MONO } from '../right_panel/rp_tokens';
import type { WatchlistRow } from './watchlist_panel';

export interface SearchDeps {
    getRows(): WatchlistRow[];
    isAdded(row: WatchlistRow): boolean;
    onAdd(row: WatchlistRow): void;
    onClose(): void;
}

const MAX_RESULTS = 200;

export function filterRows(rows: WatchlistRow[], query: string): WatchlistRow[] {
    const q = query.trim().toLowerCase();
    if (!q) return rows.slice(0, MAX_RESULTS);
    const out: WatchlistRow[] = [];
    for (const r of rows) {
        const hay = [r.code, r.display_name, r.exchange, displaySymbol(r.code), displayExchange(r.exchange), r.asset_class].join(' ').toLowerCase();
        if (hay.includes(q)) out.push(r);
        if (out.length >= MAX_RESULTS) break;
    }
    return out;
}

export class WatchlistSearch {
    private readonly _backdrop: HTMLElement;
    private readonly _input: HTMLInputElement;
    private readonly _results: HTMLElement;
    private _filtered: WatchlistRow[] = [];
    private _index = 0;

    constructor(host: HTMLElement, private readonly _theme: WatchlistTheme, private readonly _deps: SearchDeps) {
        const c = WL_COLORS[_theme];
        const bd = document.createElement('div');
        ensureRpStyles();
        bd.className = 'wl-search-backdrop rp-root';
        bd.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:flex-start;justify-content:center;padding-top:70px;z-index:70;';
        applyRpTokens(bd, _theme);
        const dlg = document.createElement('div');
        dlg.className = 'wl-search';
        dlg.style.cssText = `width:520px;max-width:94%;max-height:70%;display:flex;flex-direction:column;background:${c.menu};color:${c.text};border:1px solid ${c.border};border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.35);font-family:${RP_FONT};font-size:13px;overflow:hidden;`;
        const head = document.createElement('div');
        head.style.cssText = `padding:16px 18px 10px;font-size:16px;font-weight:500;letter-spacing:-0.01em;`;
        head.textContent = 'Sembol ekle';
        const input = document.createElement('input');
        input.className = 'wl-search-input';
        input.placeholder = 'Sembol, ad veya borsa ara';
        const inputWrap = document.createElement('div');
        inputWrap.className = 'rp-search';
        inputWrap.style.margin = '0 14px 10px';
        const searchIc = document.createElement('span');
        searchIc.innerHTML = RP_SEARCH_SVG;
        searchIc.style.cssText = `position:absolute;left:11px;display:flex;color:${c.muted};pointer-events:none;`;
        input.style.cssText = `background:${c.bg};`;
        inputWrap.append(searchIc, input);
        const results = document.createElement('div');
        results.className = 'wl-search-results';
        results.style.cssText = 'flex:1;overflow-y:auto;min-height:60px;padding:0 8px 8px;';
        dlg.append(head, inputWrap, results);
        bd.appendChild(dlg);
        host.appendChild(bd);
        this._backdrop = bd;
        this._input = input;
        this._results = results;

        bd.addEventListener('mousedown', (e) => {
            if (e.target === bd) this.close();
        });
        input.addEventListener('input', () => {
            this._index = 0;
            this.refresh();
        });
        input.addEventListener('keydown', (e) => this._onKey(e));
        this.refresh();
        input.focus();
    }

    /** Sonuclari yeniden cizer (ekleme sonrasi "eklendi" isaretleri icin de cagrilir). */
    refresh(): void {
        const c = WL_COLORS[this._theme];
        this._filtered = filterRows(this._deps.getRows(), this._input.value);
        this._index = Math.min(this._index, Math.max(0, this._filtered.length - 1));
        this._results.replaceChildren();
        if (this._filtered.length === 0) {
            this._results.appendChild(rpEmptyState(RP_SEARCH_SVG, this._deps.getRows().length ? 'Sonuç bulunamadı' : 'Yükleniyor…'));
            return;
        }
        this._filtered.forEach((row, i) => {
            const added = this._deps.isAdded(row);
            const el = document.createElement('div');
            el.className = 'wl-search-row';
            el.dataset.code = row.code;
            el.style.cssText = `display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;cursor:pointer;background:${i === this._index ? c.hover : 'transparent'};`;
            const cell = (text: string, css: string): HTMLElement => {
                const span = document.createElement('span');
                span.textContent = text;
                span.style.cssText = css;
                return span;
            };
            el.append(
                cell(displaySymbol(row.code), 'font-size:14px;font-weight:500;letter-spacing:-0.005em;min-width:90px;'),
                cell(row.display_name ?? '', `flex:1;color:${c.muted};font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`),
                cell(row.asset_class ?? '', `color:${c.muted};font-family:${RP_FONT_MONO};font-size:11px;font-weight:400;`),
                cell(displayExchange(row.exchange), `color:${c.muted};font-family:${RP_FONT_MONO};font-size:11px;font-weight:400;min-width:64px;text-align:right;`),
                cell(added ? '✓' : '', `width:16px;color:${c.up};`),
            );
            if (added) el.style.opacity = '0.6';
            el.addEventListener('mousedown', (e) => e.preventDefault());
            el.addEventListener('click', () => {
                this._index = i;
                this._add(row);
                this._input.focus();
            });
            el.addEventListener('mouseenter', () => {
                this._index = i;
                this._paintSelection();
            });
            this._results.appendChild(el);
        });
    }

    private _paintSelection(): void {
        const c = WL_COLORS[this._theme];
        Array.from(this._results.children).forEach((ch, i) => {
            (ch as HTMLElement).style.background = i === this._index ? c.hover : 'transparent';
        });
        (this._results.children[this._index] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
    }

    private _add(row: WatchlistRow): void {
        if (this._deps.isAdded(row)) return;
        this._deps.onAdd(row);
        this.refresh();
    }

    private _onKey(e: KeyboardEvent): void {
        e.stopPropagation();
        if (e.key === 'Escape') {
            e.preventDefault();
            this.close();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            this._index = Math.min(this._filtered.length - 1, this._index + 1);
            this._paintSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this._index = Math.max(0, this._index - 1);
            this._paintSelection();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const row = this._filtered[this._index];
            if (row) this._add(row);
        }
    }

    /** Re-applies the --rp-* tokens so an open dialog follows live theme changes. */
    setTheme(theme: WatchlistTheme): void {
        applyRpTokens(this._backdrop, theme);
    }

    close(): void {
        if (!this._backdrop.isConnected) return;
        this._backdrop.remove();
        this._deps.onClose();
    }
}
