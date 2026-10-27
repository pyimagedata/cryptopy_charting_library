/** Izleme listesi icin kucuk modal diyaloglar: ad girisi ve onay. */

import { WL_COLORS, WatchlistTheme } from './watchlist_theme';

function backdrop(host: HTMLElement): HTMLElement {
    const el = document.createElement('div');
    el.className = 'wl-dialog-backdrop';
    el.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:flex-start;justify-content:center;padding-top:80px;z-index:70;';
    host.appendChild(el);
    return el;
}

function box(theme: WatchlistTheme, title: string): HTMLElement {
    const c = WL_COLORS[theme];
    const el = document.createElement('div');
    el.style.cssText = `width:300px;max-width:90%;background:${c.menu};color:${c.text};border:1px solid ${c.border};border-radius:8px;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,0.45);font-size:13px;height:fit-content;`;
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'font-size:15px;font-weight:600;margin-bottom:12px;';
    el.appendChild(h);
    return el;
}

function button(theme: WatchlistTheme, label: string, primary: boolean): HTMLButtonElement {
    const c = WL_COLORS[theme];
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;border:1px solid ${primary ? c.accent : c.border};background:${primary ? c.accent : 'transparent'};color:${primary ? '#fff' : c.text};`;
    return b;
}

/** Metin giris diyalogu; iptalde null doner. */
export function promptDialog(host: HTMLElement, theme: WatchlistTheme, title: string, value: string, okLabel = 'Tamam'): Promise<string | null> {
    return new Promise((resolve) => {
        const c = WL_COLORS[theme];
        const bd = backdrop(host);
        const dlg = box(theme, title);
        const input = document.createElement('input');
        input.className = 'wl-dialog-input';
        input.value = value;
        input.style.cssText = `width:100%;box-sizing:border-box;padding:7px 10px;border-radius:4px;border:1px solid ${c.border};background:${c.input};color:${c.text};font-size:13px;outline:none;`;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px;';
        const cancel = button(theme, 'İptal', false);
        const ok = button(theme, okLabel, true);
        ok.className = 'wl-dialog-ok';
        row.append(cancel, ok);
        dlg.append(input, row);
        bd.appendChild(dlg);
        const done = (v: string | null) => {
            bd.remove();
            resolve(v);
        };
        ok.addEventListener('click', () => done(input.value));
        cancel.addEventListener('click', () => done(null));
        bd.addEventListener('mousedown', (e) => {
            if (e.target === bd) done(null);
        });
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') done(input.value);
            else if (e.key === 'Escape') done(null);
        });
        input.focus();
        input.select();
    });
}

/** Onay diyalogu; onaylanirsa true. */
export function confirmDialog(host: HTMLElement, theme: WatchlistTheme, title: string, message: string, okLabel = 'Sil'): Promise<boolean> {
    return new Promise((resolve) => {
        const c = WL_COLORS[theme];
        const bd = backdrop(host);
        const dlg = box(theme, title);
        const msg = document.createElement('div');
        msg.textContent = message;
        msg.style.cssText = `color:${c.muted};line-height:1.4;`;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px;';
        const cancel = button(theme, 'İptal', false);
        const ok = button(theme, okLabel, true);
        ok.className = 'wl-dialog-ok';
        row.append(cancel, ok);
        dlg.append(msg, row);
        bd.appendChild(dlg);
        const done = (v: boolean) => {
            bd.remove();
            resolve(v);
        };
        ok.addEventListener('click', () => done(true));
        cancel.addEventListener('click', () => done(false));
        bd.addEventListener('mousedown', (e) => {
            if (e.target === bd) done(false);
        });
        bd.tabIndex = -1;
        bd.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') done(false);
            else if (e.key === 'Enter') done(true);
        });
        ok.focus();
    });
}
