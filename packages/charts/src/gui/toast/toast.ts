/**
 * Shared toast manager: one stacked container at the bottom-right of the page.
 * Alert toasts stay until dismissed; ordinary toasts auto-hide. Max 5 visible (oldest dropped).
 */
import { t } from '../../helpers/translations';

export type ToastTheme = 'light' | 'dark';
export type ToastKind = 'info' | 'success' | 'error' | 'alert';

export interface ToastOptions {
    title: string;
    body?: string;
    /** Secondary line, e.g. the trigger price. */
    detail?: string;
    kind?: ToastKind;
    /** Epoch ms shown as HH:MM:SS; defaults to now. */
    time?: number;
    /** Stay until dismissed. Default: true for 'alert', false otherwise. */
    sticky?: boolean;
    /** Auto-hide delay for non-sticky toasts (default 4000 ms). */
    durationMs?: number;
}

export interface ToastHandle {
    id: number;
    dismiss(): void;
}

const MAX_VISIBLE = 5;
const DEFAULT_DURATION = 4000;

let forcedTheme: ToastTheme | null = null;
let container: HTMLDivElement | null = null;
let nextId = 1;
const live: { id: number; el: HTMLElement; timer: ReturnType<typeof setTimeout> | null }[] = [];

/** Pin the toast theme (null = auto-detect from the page). */
export function setToastTheme(theme: ToastTheme | null): void {
    forcedTheme = theme;
}

/** Light/dark of the page: explicit override, else the toolbar's data-theme, else any data-theme, else OS preference. */
export function detectUiTheme(): ToastTheme {
    if (forcedTheme) return forcedTheme;
    if (typeof document === 'undefined') return 'dark';
    const el = document.querySelector('.chart-toolbar[data-theme]') ?? document.querySelector('[data-theme]');
    const v = el?.getAttribute('data-theme');
    if (v === 'light' || v === 'dark') return v;
    try {
        return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch {
        return 'dark';
    }
}

const PALETTE = {
    dark: { bg: '#1e222d', border: '#363a45', text: '#d1d4dc', sub: '#868993', hover: '#2a2e39', shadow: '0 6px 24px rgba(0,0,0,.55)' },
    light: { bg: '#ffffff', border: '#e0e3eb', text: '#131722', sub: '#6a6d78', hover: '#f0f3fa', shadow: '0 6px 24px rgba(0,0,0,.18)' },
};
const KIND_COLOR: Record<ToastKind, string> = { info: '#2962ff', success: '#089981', error: '#f23645', alert: '#ff9800' };
const FONT = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";

const ICONS: Record<ToastKind, string> = {
    alert: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M9 2.5a4.5 4.5 0 0 0-4.5 4.5c0 3-1.5 4.5-1.5 4.5h12s-1.5-1.5-1.5-4.5A4.5 4.5 0 0 0 9 2.5z"/><path d="M7.6 14a1.5 1.5 0 0 0 2.8 0"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="9" cy="9" r="6.5"/><path d="M9 8v4M9 5.9v.1"/></svg>',
    success: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="6.5"/><path d="M6 9.2l2.2 2.2L12 7.6"/></svg>',
    error: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="9" cy="9" r="6.5"/><path d="M9 5.5v4M9 12v.1"/></svg>',
};

// z-index 110: above chart panels (30-100) but below modals (chart settings 120, dialogs 9998+).
function ensureContainer(): HTMLDivElement {
    if (container && container.isConnected) return container;
    container = document.createElement('div');
    container.className = 'chart-toast-container';
    container.style.cssText = `
        position: fixed; right: 16px; bottom: 16px; z-index: 110;
        display: flex; flex-direction: column; gap: 8px; align-items: flex-end;
        pointer-events: none; font-family: ${FONT};
    `;
    document.body.appendChild(container);
    return container;
}

function two(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}
function clock(ms: number): string {
    const d = new Date(ms);
    return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

function remove(id: number): void {
    const i = live.findIndex((l) => l.id === id);
    if (i < 0) return;
    const [item] = live.splice(i, 1);
    if (item.timer) clearTimeout(item.timer);
    item.el.remove();
}

export function showToast(opts: ToastOptions): ToastHandle {
    if (typeof document === 'undefined' || !document.body) return { id: 0, dismiss: () => { /* no DOM */ } };
    const kind: ToastKind = opts.kind ?? 'info';
    const sticky = opts.sticky ?? kind === 'alert';
    const p = PALETTE[detectUiTheme()];
    const accent = KIND_COLOR[kind];
    const id = nextId++;

    const card = document.createElement('div');
    card.className = 'chart-toast';
    card.dataset.kind = kind;
    card.setAttribute('role', kind === 'alert' ? 'alert' : 'status');
    card.style.cssText = `
        pointer-events: auto; box-sizing: border-box; width: 340px; max-width: calc(100vw - 32px);
        display: flex; gap: 10px; padding: 12px 12px 12px 14px;
        background: ${p.bg}; color: ${p.text}; border: 1px solid ${p.border}; border-left: 3px solid ${accent};
        border-radius: 6px; box-shadow: ${p.shadow}; font-size: 13px; line-height: 1.35;
    `;

    const icon = document.createElement('div');
    icon.style.cssText = `flex: 0 0 auto; color: ${accent}; display: flex; margin-top: 1px;`;
    icon.innerHTML = ICONS[kind];
    card.appendChild(icon);

    const main = document.createElement('div');
    main.style.cssText = 'flex: 1 1 auto; min-width: 0;';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight: 600; font-size: 14px; word-break: break-word;';
    title.textContent = opts.title;
    main.appendChild(title);
    if (opts.body) {
        const body = document.createElement('div');
        body.style.cssText = `margin-top: 2px; color: ${p.text}; word-break: break-word;`;
        body.textContent = opts.body;
        main.appendChild(body);
    }
    if (opts.detail) {
        const detail = document.createElement('div');
        detail.style.cssText = `margin-top: 2px; color: ${p.sub};`;
        detail.textContent = opts.detail;
        main.appendChild(detail);
    }
    const foot = document.createElement('div');
    foot.style.cssText = `display: flex; align-items: center; justify-content: space-between; margin-top: 6px; gap: 8px; color: ${p.sub}; font-size: 12px;`;
    const time = document.createElement('span');
    time.textContent = clock(opts.time ?? Date.now());
    foot.appendChild(time);
    if (sticky) {
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.textContent = t('OK');
        ok.style.cssText = `border: 1px solid ${p.border}; background: transparent; color: ${p.text}; border-radius: 4px; padding: 2px 12px; font: inherit; cursor: pointer;`;
        ok.addEventListener('mouseenter', () => { ok.style.background = p.hover; });
        ok.addEventListener('mouseleave', () => { ok.style.background = 'transparent'; });
        ok.addEventListener('click', () => remove(id));
        foot.appendChild(ok);
    }
    main.appendChild(foot);
    card.appendChild(main);

    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', t('Close'));
    close.textContent = '×';
    close.style.cssText = `flex: 0 0 auto; align-self: flex-start; width: 22px; height: 22px; border: none; border-radius: 4px; background: transparent; color: ${p.sub}; font-size: 18px; line-height: 20px; cursor: pointer; padding: 0;`;
    close.addEventListener('mouseenter', () => { close.style.background = p.hover; });
    close.addEventListener('mouseleave', () => { close.style.background = 'transparent'; });
    close.addEventListener('click', () => remove(id));
    card.appendChild(close);

    ensureContainer().appendChild(card);
    const item: { id: number; el: HTMLElement; timer: ReturnType<typeof setTimeout> | null } = { id, el: card, timer: null };
    live.push(item);
    if (!sticky) item.timer = setTimeout(() => remove(id), opts.durationMs ?? DEFAULT_DURATION);
    while (live.length > MAX_VISIBLE) remove(live[0].id);

    return { id, dismiss: () => remove(id) };
}

export function dismissAllToasts(): void {
    for (const l of [...live]) remove(l.id);
}
