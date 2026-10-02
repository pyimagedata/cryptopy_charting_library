/**
 * Cizgi dugmesi (TradingView tarzi): cizgi onizlemesi gosterir, tiklayinca
 * kalinlik (1-4 px) ve stil (duz/kesikli/noktali) menusu acar. Ayar
 * pencerelerinde renk kutusunun yaninda tek satirda kullanilir.
 */

import { t } from '../../../helpers/translations';

export type LineButtonStyle = 'solid' | 'dashed' | 'dotted';

function dashAttr(style: LineButtonStyle): string {
    if (style === 'dashed') return '5 3';
    if (style === 'dotted') return '1.5 2';
    return '';
}

export function linePreviewSvg(width: number, style: LineButtonStyle, length = 28): string {
    const dash = dashAttr(style);
    return `<svg width="${length}" height="12" viewBox="0 0 ${length} 12" aria-hidden="true"><line x1="1" y1="6" x2="${length - 1}" y2="6" stroke="currentColor" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''} stroke-linecap="butt"/></svg>`;
}

let openMenu: HTMLElement | null = null;

export function closeLineButtonMenu(): void {
    openMenu?.remove();
    openMenu = null;
}

/**
 * @param host  Tema degiskenlerini (--modal-bg vb.) tasiyan pencere elemani; menu
 *              body'ye eklenir (pencere transform ile ortalandigi icin icindeki
 *              position:fixed eleman yanlis yere kayardi) ve degiskenler kopyalanir.
 * @param widths Kalinlik secenekleri; bos dizi verilirse sadece stil menusu cikar.
 */
export function createLineButton(
    width: number,
    style: LineButtonStyle,
    onWidth: (w: number) => void,
    onStyle: (s: LineButtonStyle) => void,
    host: HTMLElement | null,
    widths: number[] = [1, 2, 3, 4],
): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = t('Line Style');
    btn.style.cssText = `display:flex;align-items:center;gap:6px;height:28px;padding:0 8px;border:1px solid var(--border-color);
        border-radius:4px;background:var(--input-bg);color:var(--text-primary);cursor:pointer;`;
    const paint = () => {
        btn.innerHTML = `${linePreviewSvg(width, style)}<svg width="8" height="8" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
    };
    paint();
    btn.onclick = (e) => {
        e.stopPropagation();
        const wasMine = openMenu !== null && openMenu.dataset.ownerId === btn.dataset.ownerId && !!btn.dataset.ownerId;
        closeLineButtonMenu();
        if (wasMine) return;
        btn.dataset.ownerId = String(Math.random());
        const menu = document.createElement('div');
        menu.dataset.owner = btn.dataset.ownerId;
        menu.dataset.ownerId = btn.dataset.ownerId;
        const r = btn.getBoundingClientRect();
        menu.style.cssText = `position:fixed;top:${r.bottom + 4}px;left:${Math.max(8, r.right - 120)}px;z-index:10001;background:var(--modal-bg);
            border:1px solid var(--border-color);border-radius:6px;box-shadow:var(--shadow);padding:6px;display:flex;flex-direction:column;gap:2px;min-width:110px;`;
        if (host) {
            const cs = getComputedStyle(host);
            for (const v of ['--modal-bg', '--text-primary', '--border-color', '--hover-bg', '--shadow', '--input-bg']) {
                menu.style.setProperty(v, cs.getPropertyValue(v));
            }
        }
        const item = (html: string, active: boolean, onClick: () => void) => {
            const it = document.createElement('button');
            it.type = 'button';
            it.innerHTML = html;
            it.style.cssText = `display:flex;align-items:center;gap:8px;padding:6px 10px;border:none;border-radius:4px;cursor:pointer;
                color:var(--text-primary);font-size:12px;background:${active ? 'rgba(41,98,255,0.18)' : 'transparent'};`;
            it.onmouseenter = () => { if (!active) it.style.background = 'var(--hover-bg)'; };
            it.onmouseleave = () => { if (!active) it.style.background = 'transparent'; };
            it.onclick = (ev) => { ev.stopPropagation(); onClick(); };
            menu.appendChild(it);
        };
        widths.forEach((w) => item(`${linePreviewSvg(w, 'solid', 40)}<span>${w}px</span>`, w === width, () => {
            width = w; onWidth(w); paint(); closeLineButtonMenu();
        }));
        if (widths.length) {
            const sep = document.createElement('div');
            sep.style.cssText = 'height:1px;background:var(--border-color);margin:4px 0;';
            menu.appendChild(sep);
        }
        (['solid', 'dashed', 'dotted'] as LineButtonStyle[]).forEach((s) => item(linePreviewSvg(2, s, 40), s === style, () => {
            style = s; onStyle(s); paint(); closeLineButtonMenu();
        }));
        document.body.appendChild(menu);
        openMenu = menu;
        const off = (ev: MouseEvent) => {
            if (!menu.contains(ev.target as Node) && !btn.contains(ev.target as Node)) {
                closeLineButtonMenu();
                document.removeEventListener('mousedown', off, true);
            }
        };
        document.addEventListener('mousedown', off, true);
    };
    return btn;
}
