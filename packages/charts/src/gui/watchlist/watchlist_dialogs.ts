/** Izleme listesi icin kucuk modal diyaloglar: ad girisi ve onay. */

import { WL_COLORS, WatchlistTheme } from './watchlist_theme';
import { applyRpTokens, ensureRpStyles, RP_FONT } from '../right_panel/rp_tokens';

const openBackdrops = new Set<HTMLElement>();

/** Re-applies the --rp-* tokens to currently open dialogs so they follow live theme changes. */
export function rethemeOpenDialogs(theme: WatchlistTheme): void {
    for (const el of openBackdrops) {
        if (el.isConnected) applyRpTokens(el, theme);
        else openBackdrops.delete(el);
    }
}

function backdrop(host: HTMLElement, theme: WatchlistTheme): HTMLElement {
    ensureRpStyles();
    const el = document.createElement('div');
    el.className = 'wl-dialog-backdrop rp-root';
    el.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:flex-start;justify-content:center;padding-top:80px;z-index:70;';
    applyRpTokens(el, theme);
    host.appendChild(el);
    openBackdrops.add(el);
    return el;
}

function box(theme: WatchlistTheme, title: string): HTMLElement {
    const c = WL_COLORS[theme];
    const el = document.createElement('div');
    el.setAttribute('role', 'dialog');
    el.style.cssText = `width:300px;max-width:90%;background:${c.menu};color:${c.text};border:1px solid ${c.border};border-radius:12px;padding:18px;box-shadow:0 10px 30px rgba(0,0,0,0.35);font-family:${RP_FONT};font-size:13px;height:fit-content;`;
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'font-size:16px;font-weight:500;letter-spacing:-0.01em;margin-bottom:12px;';
    el.appendChild(h);
    return el;
}

function button(theme: WatchlistTheme, label: string, primary: boolean): HTMLButtonElement {
    const c = WL_COLORS[theme];
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `height:32px;padding:0 16px;border-radius:999px;cursor:pointer;font:inherit;font-size:12.5px;font-weight:${primary ? 500 : 450};border:1px solid ${primary ? c.accent : c.border};background:${primary ? c.accent : 'transparent'};color:${primary ? '#fff' : c.muted};`;
    return b;
}

/** Metin giris diyalogu; iptalde null doner. */
export function promptDialog(host: HTMLElement, theme: WatchlistTheme, title: string, value: string, okLabel = 'Tamam'): Promise<string | null> {
    return new Promise((resolve) => {
        const c = WL_COLORS[theme];
        const bd = backdrop(host, theme);
        const dlg = box(theme, title);
        const input = document.createElement('input');
        input.className = 'wl-dialog-input';
        input.value = value;
        input.style.cssText = `width:100%;box-sizing:border-box;height:36px;padding:0 12px;border-radius:12px;border:1px solid ${c.border};background:${c.bg};color:${c.text};font:inherit;font-size:13px;font-weight:400;outline:none;`;
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
            openBackdrops.delete(bd);
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
        const bd = backdrop(host, theme);
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
            openBackdrops.delete(bd);
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
