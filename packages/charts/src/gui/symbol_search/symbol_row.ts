/** Result row + logo rendering (DOM APIs / textContent only - no innerHTML with symbol data). */

import { t } from '../../helpers/translations';
import { highlightRanges, IndexedSymbol, SymbolType, sourceDescription, sourceLabel } from './symbol_model';
import { exchangeLogoUrl } from './symbol_data';

/** Round logo with graceful fallback: failed / missing images become a letter placeholder. */
export function createLogo(url: string | null, letter: string, size: number): HTMLElement {
    const el = document.createElement('span');
    el.className = 'ss-logo';
    el.lang = 'en'; // Latin kodlar: tr buyuk harf kurali (i -> İ) uygulanmasin
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.fontSize = `${Math.round(size * 0.45)}px`;
    const placeholder = () => {
        el.textContent = (letter || '?').charAt(0);
    };
    if (!url) {
        placeholder();
        return el;
    }
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => {
        img.remove();
        placeholder();
    });
    img.src = url;
    el.appendChild(img);
    return el;
}

/** Appends `text` to `parent`, wrapping the matched part of `query` in a highlight span. */
export function appendHighlighted(parent: HTMLElement, text: string, query: string): void {
    const ranges = highlightRanges(text, query);
    if (ranges.length === 0) {
        parent.textContent = text;
        return;
    }
    let pos = 0;
    for (const [start, end] of ranges) {
        if (start > pos) parent.appendChild(document.createTextNode(text.slice(pos, start)));
        const span = document.createElement('span');
        span.className = 'ss-hl';
        span.textContent = text.slice(start, end);
        parent.appendChild(span);
        pos = end;
    }
    if (pos < text.length) parent.appendChild(document.createTextNode(text.slice(pos)));
}

/** Type badge text ("spot crypto", "swap crypto", "futures", "forex", "cfd"), or null when none applies. */
export function badgeText(item: IndexedSymbol): string | null {
    switch (item.category) {
        case 'crypto':
            return `${item.market === 'swap' ? t('Swap') : item.market === 'futures' ? t('Futures') : t('Spot')} ${t('Crypto')}`;
        case 'futures': return t('Futures');
        case 'forex': return t('Forex');
        case 'cfd': return t('CFD');
        default: return null;
    }
}

export interface RowOptions {
    /** Text part of the query (for highlight) */
    query: string;
    /** Selected tab: badge is hidden on Futures / Forex tabs */
    tab: SymbolType;
    active: boolean;
}

export function createRow(item: IndexedSymbol, opts: RowOptions): HTMLElement {
    const row = document.createElement('div');
    row.className = 'ss-row';
    row.setAttribute('role', 'option');
    row.dataset.id = item.id;
    if (opts.active) row.dataset.active = 'true';

    // Symbol logo (no coin-logo CDN in this library: letter placeholder)
    const base = (item.info.description || item.ticker).split(/[\s/]/)[0] || item.ticker;
    row.appendChild(createLogo(null, base, 32));

    const main = document.createElement('div');
    main.className = 'ss-row-main';

    const ticker = document.createElement('div');
    ticker.className = 'ss-ticker';
    ticker.lang = 'en';
    appendHighlighted(ticker, item.ticker, opts.query);
    main.appendChild(ticker);

    const desc = document.createElement('div');
    desc.className = 'ss-desc';
    const descText = document.createElement('span');
    descText.className = 'ss-desc-text';
    descText.textContent = item.description;
    desc.appendChild(descText);
    const badge = opts.tab === 'futures' || opts.tab === 'forex' ? null : badgeText(item);
    if (badge) {
        const b = document.createElement('span');
        b.className = 'ss-badge';
        b.textContent = badge;
        desc.appendChild(b);
    }
    main.appendChild(desc);
    row.appendChild(main);

    const right = document.createElement('div');
    right.className = 'ss-row-right';
    const label = sourceLabel(item.source);
    right.title = sourceDescription(item.source);
    const exName = document.createElement('span');
    exName.className = 'ss-exchange';
    exName.lang = 'en';
    exName.textContent = label;
    right.appendChild(exName);
    right.appendChild(createLogo(exchangeLogoUrl(item.info.exchange), label, 24));
    row.appendChild(right);

    return row;
}
