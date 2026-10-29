/** Sources screen: grouped 2-column grid of exchanges with its own search + keyboard navigation. */

import { t } from '../../helpers/translations';
import { SourceInfo } from './symbol_model';
import { exchangeLogoUrl } from './symbol_data';
import { createIcon } from './symbol_icons';
import { appendHighlighted, createLogo } from './symbol_row';

export interface SourcesScreenOptions {
    sources: SourceInfo[];
    /** Currently selected source id, or null for "All sources" */
    selected: string | null;
    onSelect: (sourceId: string | null) => void;
}

interface Tile {
    el: HTMLButtonElement;
    col: number;
    group: number;
}

export class SourcesScreen {
    readonly element: HTMLElement;
    private readonly _input: HTMLInputElement;
    private readonly _body: HTMLElement;
    private _tiles: Tile[] = [];

    constructor(private readonly _opts: SourcesScreenOptions) {
        this.element = document.createElement('div');
        this.element.className = 'ss-screen';

        const row = document.createElement('div');
        row.className = 'ss-input-row';
        const box = document.createElement('div');
        box.className = 'ss-input-box';
        box.appendChild(createIcon('search', 28));
        this._input = document.createElement('input');
        this._input.type = 'text';
        this._input.className = 'ss-input ss-plain';
        this._input.setAttribute('role', 'searchbox');
        this._input.autocomplete = 'off';
        this._input.spellcheck = false;
        this._input.placeholder = t('Search');
        this._input.addEventListener('input', () => this._render());
        this._input.addEventListener('keydown', (e) => this._onInputKey(e));
        box.appendChild(this._input);
        row.appendChild(box);
        this.element.appendChild(row);

        this._body = document.createElement('div');
        this._body.className = 'ss-src-body';
        this._body.addEventListener('keydown', (e) => this._onTileKey(e));
        this.element.appendChild(this._body);

        this._render();
    }

    focus(): void {
        this._input.focus();
    }

    private _render(): void {
        const q = this._input.value.trim().toLowerCase();
        this._body.textContent = '';
        this._tiles = [];

        const groups: Array<{ title: string | null; items: Array<SourceInfo | null> }> = [];
        const allLabel = t('All sources');
        if (!q || allLabel.toLowerCase().includes(q)) groups.push({ title: null, items: [null] });
        const match = (s: SourceInfo) => !q || s.label.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
        const crypto = this._opts.sources.filter(s => s.group === 'crypto' && match(s));
        const forex = this._opts.sources.filter(s => s.group === 'forex' && match(s));
        if (crypto.length) groups.push({ title: t('Cryptocurrency'), items: crypto });
        if (forex.length) groups.push({ title: t('Forex & CFD'), items: forex });

        if (groups.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'ss-empty';
            empty.textContent = t('No exchanges match your criteria');
            this._body.appendChild(empty);
            return;
        }

        groups.forEach((g, gi) => {
            if (g.title) {
                const h = document.createElement('div');
                h.className = 'ss-src-group';
                h.textContent = g.title;
                this._body.appendChild(h);
            }
            const grid = document.createElement('div');
            grid.className = 'ss-src-grid';
            if (!g.title) grid.style.paddingTop = '8px';
            g.items.forEach((src, i) => {
                const tile = this._createTile(src, q);
                grid.appendChild(tile);
                this._tiles.push({ el: tile, col: i % 2, group: gi });
            });
            this._body.appendChild(grid);
        });
    }

    private _createTile(src: SourceInfo | null, query: string): HTMLButtonElement {
        const id = src ? src.id : null;
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'ss-src-tile';
        const selected = this._opts.selected === id;
        if (selected) tile.classList.add('is-selected');
        tile.setAttribute('aria-pressed', selected ? 'true' : 'false');

        if (src) {
            tile.appendChild(createLogo(exchangeLogoUrl(src.exchanges[0]), src.label, 24));
        } else {
            const globe = createIcon('globe', 24);
            globe.classList.add('ss-globe');
            tile.appendChild(globe);
        }

        const text = document.createElement('span');
        text.className = 'ss-src-text';
        const name = document.createElement('span');
        name.className = 'ss-src-name';
        if (src) appendHighlighted(name, src.label, query);
        else name.textContent = t('All sources');
        text.appendChild(name);
        if (src && src.description !== src.label) {
            const desc = document.createElement('span');
            desc.className = 'ss-src-desc';
            desc.textContent = src.description;
            text.appendChild(desc);
        }
        tile.appendChild(text);

        tile.addEventListener('click', () => this._opts.onSelect(id));
        return tile;
    }

    private _onInputKey(e: KeyboardEvent): void {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const target = this._tiles.find(x => x.el.classList.contains('is-selected')) ?? this._tiles[0];
            target?.el.focus();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            this._tiles[0]?.el.click();
        }
    }

    private _onTileKey(e: KeyboardEvent): void {
        const idx = this._tiles.findIndex(x => x.el === document.activeElement);
        if (idx < 0) return;
        const cur = this._tiles[idx];
        const focus = (i: number) => this._tiles[i]?.el.focus();
        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowUp': {
                e.preventDefault();
                const same = this._tiles.map((x, i) => ({ x, i })).filter(o => o.x.col === cur.col);
                const pos = same.findIndex(o => o.i === idx);
                const step = e.key === 'ArrowDown' ? 1 : -1;
                focus(same[(pos + step + same.length) % same.length].i);
                break;
            }
            case 'ArrowRight': {
                e.preventDefault();
                const next = this._tiles[idx + 1];
                if (cur.col === 0 && next && next.group === cur.group) focus(idx + 1);
                break;
            }
            case 'ArrowLeft':
                e.preventDefault();
                if (cur.col === 1) focus(idx - 1);
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                cur.el.click();
                break;
        }
    }
}
