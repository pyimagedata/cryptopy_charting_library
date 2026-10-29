/**
 * TradingView-style "Create alert" / "Edit alert" modal. Single instance per page.
 * Talks to the page-level alertsStore; the chart only supplies price formatting / tick size / theme.
 */
import { t } from '../../helpers/translations';
import { alertsStore } from '../../alerts/alerts-store';
import { playAlertSound } from '../../alerts/alert-sound';
import {
    ALERT_CONDITIONS, ALERT_SOUND_NAMES, DEFAULT_ALERT_COLOR, alertErrorText, alertPriceSeed, alertTicker, conditionLabel, exactPrice, isAutoAlertMessage, parseAlertPrice, plainPrice, priceDecimals, soundLabel,
} from '../../alerts/alert-text';
import { AlertCondition, AlertDraft, AlertSound, ChartAlert } from '../../alerts/types';
import { detectUiTheme, showToast, ToastTheme } from '../toast/toast';

/** What the dialog needs to know about the chart it was opened from (all optional behaviour). */
export interface AlertDialogChart {
    formatAlertPrice(price: number): string;
    /** Tick size of the symbol if the chart knows it. */
    alertPriceStep(): number | null;
    alertTheme(): ToastTheme;
}

export interface AlertDialogOptions {
    chart?: AlertDialogChart | null;
    symbol: string;
    price: number;
    /** When given the dialog edits this alert instead of creating a new one. */
    alert?: ChartAlert;
}

export interface AlertDialogHandle {
    close(): void;
}

type TabId = 'settings' | 'message' | 'notifications';

const PALETTE = {
    dark: {
        bg: '#1e222d', border: '#363a45', text: '#d1d4dc', sub: '#868993', inputBg: '#131722', inputBorder: '#434651',
        hover: '#2a2e39', accent: '#2962ff', accentText: '#ffffff', danger: '#f23645', dangerBg: 'rgba(242,54,69,.14)',
        backdrop: 'rgba(0,0,0,.6)', shadow: '0 12px 40px rgba(0,0,0,.6)', disabled: '#50535e', scheme: 'dark',
    },
    light: {
        bg: '#ffffff', border: '#e0e3eb', text: '#131722', sub: '#6a6d78', inputBg: '#ffffff', inputBorder: '#c3c6d0',
        hover: '#f0f3fa', accent: '#2962ff', accentText: '#ffffff', danger: '#f23645', dangerBg: 'rgba(242,54,69,.08)',
        backdrop: 'rgba(19,23,34,.45)', shadow: '0 12px 40px rgba(0,0,0,.25)', disabled: '#b2b5be', scheme: 'light',
    },
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";

let current: { close(): void } | null = null;

export function closeAlertDialog(): void {
    current?.close();
}

function pad(n: number): string { return n < 10 ? `0${n}` : String(n); }
/** Epoch ms -> value for <input type="datetime-local"> in local time. */
function toLocalInput(ms: number): string {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function openAlertDialog(opts: AlertDialogOptions): AlertDialogHandle {
    closeAlertDialog();

    const editing = opts.alert ?? null;
    const symbol = editing ? editing.symbol : opts.symbol;
    const ticker = alertTicker(symbol);
    const chart = opts.chart ?? null;
    const theme: ToastTheme = (chart?.alertTheme?.() ?? detectUiTheme());
    const p = PALETTE[theme];

    const fmt = (price: number): string => {
        try { return chart ? chart.formatAlertPrice(price) : plainPrice(price); } catch { return plainPrice(price); }
    };
    const step = (() => { try { return chart?.alertPriceStep() ?? null; } catch { return null; } })();
    // the input holds the full-precision value (never the axis format, which rounds); fmt() is display-only
    const initialPriceText = alertPriceSeed(editing ? editing.price : opts.price, step, !editing);

    // ---- state ----
    const st = {
        tab: 'settings' as TabId,
        busy: false,
        condition: (editing?.condition ?? 'crossing') as AlertCondition,
        messageEdited: false,
    };
    const autoMessage = (): string => {
        const n = parseAlertPrice(priceInput.value);
        const price = isFinite(n) && priceInput.value.trim() !== '' ? exactPrice(n) : '';
        return `${ticker} ${conditionLabel(st.condition)}${price ? ' ' + price : ''}`;
    };

    // ---- element helpers ----
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css = '', text?: string): HTMLElementTagNameMap[K] => {
        const e = document.createElement(tag);
        if (css) e.style.cssText = css;
        if (text !== undefined) e.textContent = text;
        return e;
    };
    const inputCss = `box-sizing: border-box; width: 100%; height: 36px; padding: 0 10px; font: 14px ${FONT}; color: ${p.text};
        background: ${p.inputBg}; border: 1px solid ${p.inputBorder}; border-radius: 4px; outline: none; color-scheme: ${p.scheme};`;
    const focusRing = (e: HTMLElement) => {
        e.addEventListener('focus', () => { e.style.borderColor = p.accent; });
        e.addEventListener('blur', () => { e.style.borderColor = p.inputBorder; });
    };
    const row = (label: string, control: HTMLElement, hint?: string): HTMLElement => {
        const r = el('div', 'display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px;');
        r.appendChild(el('div', `flex: 0 0 120px; padding-top: 9px; font-size: 14px; color: ${p.sub};`, label));
        const c = el('div', 'flex: 1 1 auto; min-width: 0;');
        c.appendChild(control);
        if (hint) c.appendChild(el('div', `margin-top: 4px; font-size: 12px; color: ${p.sub};`, hint));
        r.appendChild(c);
        return r;
    };
    const checkbox = (label: string, checked: boolean): { wrap: HTMLLabelElement; box: HTMLInputElement } => {
        const wrap = el('label', `display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: ${p.text}; cursor: pointer; user-select: none;`);
        const box = el('input');
        box.type = 'checkbox';
        box.checked = checked;
        box.style.cssText = `width: 16px; height: 16px; margin: 0; accent-color: ${p.accent}; cursor: pointer;`;
        wrap.appendChild(box);
        wrap.appendChild(el('span', '', label));
        return { wrap, box };
    };

    // ---- overlay / panel ----
    const overlay = el('div', `position: fixed; inset: 0; z-index: 99000; display: flex; align-items: center; justify-content: center; background: ${p.backdrop}; font-family: ${FONT};`);
    overlay.className = 'chart-alert-dialog-overlay';
    overlay.dataset.theme = theme;
    const panel = el('div', `box-sizing: border-box; width: 480px; max-width: calc(100vw - 24px); max-height: calc(100vh - 24px); display: flex; flex-direction: column;
        background: ${p.bg}; color: ${p.text}; border: 1px solid ${p.border}; border-radius: 8px; box-shadow: ${p.shadow};`);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.className = 'chart-alert-dialog';
    overlay.appendChild(panel);

    // header
    const header = el('div', `display: flex; align-items: center; justify-content: space-between; padding: 14px 12px 4px 20px;`);
    const titleText = (editing ? t('Edit alert on {symbol}') : t('Create alert on {symbol}')).replace('{symbol}', ticker);
    header.appendChild(el('div', 'font-size: 18px; font-weight: 600;', titleText));
    const closeBtn = el('button', `width: 32px; height: 32px; border: none; border-radius: 4px; background: transparent; color: ${p.sub}; font-size: 22px; line-height: 1; cursor: pointer;`, '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', t('Close'));
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.background = p.hover; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.background = 'transparent'; });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // tabs
    const tabsBar = el('div', `display: flex; gap: 4px; padding: 0 20px; border-bottom: 1px solid ${p.border};`);
    const tabDefs: { id: TabId; label: string }[] = [
        { id: 'settings', label: t('Settings') },
        { id: 'message', label: t('Message') },
        { id: 'notifications', label: t('Notifications') },
    ];
    const tabBtns = new Map<TabId, HTMLButtonElement>();
    const panes = new Map<TabId, HTMLElement>();
    for (const d of tabDefs) {
        const b = el('button', 'border: none; background: transparent; padding: 10px 12px; font: 14px ' + FONT + '; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px;', d.label);
        b.type = 'button';
        b.dataset.tab = d.id;
        b.addEventListener('click', () => selectTab(d.id));
        tabsBar.appendChild(b);
        tabBtns.set(d.id, b);
    }
    panel.appendChild(tabsBar);

    // banner (any tab)
    const banner = el('div', `display: none; margin: 12px 20px 0; padding: 8px 12px; border-radius: 4px; font-size: 13px; color: ${p.danger}; background: ${p.dangerBg}; border: 1px solid ${p.danger};`);
    banner.className = 'chart-alert-dialog-banner';
    banner.setAttribute('role', 'alert');
    panel.appendChild(banner);

    const body = el('div', 'padding: 18px 20px 6px; overflow-y: auto; min-height: 330px;');
    panel.appendChild(body);

    // ---- Settings pane ----
    const settings = el('div');
    panes.set('settings', settings);

    const symbolBox = el('div', `height: 36px; display: flex; align-items: center; font-size: 14px; font-weight: 600;`, ticker);
    symbolBox.className = 'chart-alert-symbol';
    settings.appendChild(row(t('Symbol'), symbolBox));

    const condSelect = el('select', inputCss + 'cursor: pointer;');
    condSelect.className = 'chart-alert-condition';
    for (const c of ALERT_CONDITIONS) {
        const o = el('option', '', conditionLabel(c));
        o.value = c;
        condSelect.appendChild(o);
    }
    condSelect.value = st.condition;
    focusRing(condSelect);
    settings.appendChild(row(t('Condition'), condSelect));

    const priceWrap = el('div', 'display: flex; align-items: center; gap: 8px;');
    priceWrap.appendChild(el('div', `flex: 0 0 auto; font-size: 14px; color: ${p.text};`, t('Price')));
    const priceInput = el('input', inputCss);
    priceInput.className = 'chart-alert-price';
    priceInput.type = 'text';
    priceInput.inputMode = 'decimal';
    priceInput.autocomplete = 'off';
    priceInput.spellcheck = false;
    priceInput.style.paddingRight = '26px';
    priceInput.value = initialPriceText;
    focusRing(priceInput);
    // typed price may use "," or "."; stepping keeps a dot, no grouping (same text as the price axis)
    const stepPrice = (dir: 1 | -1): void => {
        const cur = parseAlertPrice(priceInput.value);
        const inc = step && step > 0 ? step : 1;
        const dec = Math.max(priceDecimals(inc), priceDecimals(cur));
        const next = Number(((isFinite(cur) ? cur : 0) + dir * inc).toFixed(dec));
        if (next <= 0) return;
        priceInput.value = next.toFixed(dec);
        priceErr.style.display = 'none';
        syncAuto();
    };
    const spin = el('div', 'position: absolute; right: 2px; top: 3px; bottom: 3px; width: 20px; display: flex; flex-direction: column;');
    for (const dir of [1, -1] as const) {
        const b = el('button', `flex: 1 1 0; min-height: 0; padding: 0; border: none; background: transparent; color: ${p.sub}; font-size: 8px; line-height: 1; cursor: pointer;`, dir === 1 ? '\u25B2' : '\u25BC');
        b.type = 'button';
        b.tabIndex = -1;
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => stepPrice(dir));
        spin.appendChild(b);
    }
    const priceBox = el('div', 'position: relative; flex: 1 1 auto; min-width: 0;');
    priceBox.appendChild(priceInput);
    priceBox.appendChild(spin);
    priceWrap.appendChild(priceBox);
    const priceErr = el('div', `display: none; margin-top: 4px; font-size: 12px; color: ${p.danger};`, t('Enter a price greater than 0'));
    const priceCell = el('div');
    priceCell.appendChild(priceWrap);
    priceCell.appendChild(priceErr);
    settings.appendChild(row(t('Value'), priceCell));

    const triggerBox = el('div', `height: 36px; display: flex; align-items: center; font-size: 14px; color: ${p.disabled};`);
    const trig = checkbox(t('Only once'), true);
    trig.box.disabled = true;
    trig.wrap.style.cursor = 'default';
    trig.wrap.style.color = p.disabled;
    triggerBox.appendChild(trig.wrap);
    settings.appendChild(row(t('Trigger'), triggerBox));

    const expWrap = el('div');
    const forever = checkbox(t('Open-ended'), editing ? editing.expiresAt === null : true);
    forever.wrap.style.height = '36px';
    const expInput = el('input', inputCss + 'margin-top: 2px;');
    expInput.className = 'chart-alert-expiry';
    expInput.type = 'datetime-local';
    expInput.value = editing?.expiresAt ? toLocalInput(editing.expiresAt) : '';
    focusRing(expInput);
    const expErr = el('div', `display: none; margin-top: 4px; font-size: 12px; color: ${p.danger};`, t('Pick an expiry time in the future'));
    expWrap.appendChild(forever.wrap);
    expWrap.appendChild(expInput);
    expWrap.appendChild(expErr);
    settings.appendChild(row(t('Expiration'), expWrap));
    const syncExpiry = () => {
        expInput.style.display = forever.box.checked ? 'none' : 'block';
        expErr.style.display = 'none';
    };
    forever.box.addEventListener('change', () => {
        if (!forever.box.checked && !expInput.value) expInput.value = toLocalInput(Date.now() + 24 * 3600 * 1000);
        syncExpiry();
    });
    syncExpiry();

    // ---- Message pane ----
    const msgPane = el('div');
    panes.set('message', msgPane);
    const nameInput = el('input', inputCss);
    nameInput.className = 'chart-alert-name';
    nameInput.type = 'text';
    nameInput.maxLength = 120;
    nameInput.value = editing?.name ?? '';
    nameInput.placeholder = `${ticker} ${conditionLabel(st.condition)}`;
    focusRing(nameInput);
    msgPane.appendChild(row(t('Alert name'), nameInput, t('Optional')));
    const msgArea = el('textarea', inputCss + 'height: 110px; padding: 8px 10px; resize: vertical; line-height: 1.4;');
    msgArea.className = 'chart-alert-message';
    msgArea.maxLength = 500;
    focusRing(msgArea);
    msgPane.appendChild(row(t('Message'), msgArea));

    // ---- Notifications pane ----
    const notePane = el('div');
    panes.set('notifications', notePane);
    const noteList = el('div', 'display: flex; flex-direction: column; gap: 14px;');
    const nToast = checkbox(t('Show pop-up'), editing ? editing.notifyToast : true);
    const nSound = checkbox(t('Play sound'), editing ? editing.playSound : true);
    nToast.box.className = 'chart-alert-notify-toast';
    nSound.box.className = 'chart-alert-play-sound';
    const soundRow = el('div', 'display: flex; align-items: center; gap: 8px; margin-top: 8px; margin-left: 24px;');
    const soundSelect = el('select', inputCss + 'width: 160px; cursor: pointer;');
    soundSelect.className = 'chart-alert-sound';
    for (const s of ALERT_SOUND_NAMES) {
        const o = el('option', '', soundLabel(s));
        o.value = s;
        soundSelect.appendChild(o);
    }
    soundSelect.value = editing?.sound ?? 'chime';
    focusRing(soundSelect);
    const preview = el('button', `width: 36px; height: 36px; border: 1px solid ${p.inputBorder}; border-radius: 4px; background: transparent; color: ${p.text}; cursor: pointer; font-size: 12px;`, '▶');
    preview.type = 'button';
    preview.title = t('Preview sound');
    preview.addEventListener('click', () => playAlertSound(soundSelect.value as AlertSound));
    soundRow.appendChild(soundSelect);
    soundRow.appendChild(preview);
    const soundBlock = el('div');
    soundBlock.appendChild(nSound.wrap);
    soundBlock.appendChild(soundRow);
    const syncSound = () => {
        const on = nSound.box.checked;
        soundSelect.disabled = !on;
        preview.disabled = !on;
        soundRow.style.opacity = on ? '1' : '0.5';
    };
    nSound.box.addEventListener('change', syncSound);
    syncSound();

    const tgAvailable = alertsStore.telegramAvailable;
    const nTg = checkbox('Telegram', tgAvailable && editing ? editing.notifyTelegram : false);
    nTg.box.className = 'chart-alert-notify-telegram';
    const tgBlock = el('div');
    tgBlock.appendChild(nTg.wrap);
    if (!tgAvailable) {
        nTg.box.disabled = true;
        nTg.wrap.style.cursor = 'default';
        nTg.wrap.style.color = p.disabled;
        tgBlock.appendChild(el('div', `margin: 4px 0 0 24px; font-size: 12px; color: ${p.sub};`, t('Link your Telegram account from your profile')));
    }
    noteList.appendChild(nToast.wrap);
    noteList.appendChild(soundBlock);
    noteList.appendChild(tgBlock);
    notePane.appendChild(noteList);

    for (const pane of panes.values()) body.appendChild(pane);

    // ---- footer ----
    const footer = el('div', `display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px 18px; border-top: 1px solid ${p.border}; margin-top: 8px;`);
    const cancelBtn = el('button', `height: 36px; padding: 0 18px; border: 1px solid ${p.inputBorder}; border-radius: 4px; background: transparent; color: ${p.text}; font: 14px ${FONT}; cursor: pointer;`, t('Cancel'));
    cancelBtn.type = 'button';
    cancelBtn.className = 'chart-alert-cancel';
    const okBtn = el('button', `height: 36px; padding: 0 22px; border: none; border-radius: 4px; background: ${p.accent}; color: ${p.accentText}; font: 600 14px ${FONT}; cursor: pointer;`, editing ? t('Save') : t('Create'));
    okBtn.type = 'button';
    okBtn.className = 'chart-alert-submit';
    footer.appendChild(cancelBtn);
    footer.appendChild(okBtn);
    panel.appendChild(footer);

    // ---- behaviour ----
    function selectTab(id: TabId): void {
        st.tab = id;
        for (const [k, b] of tabBtns) {
            const on = k === id;
            b.style.color = on ? p.text : p.sub;
            b.style.fontWeight = on ? '600' : '400';
            b.style.borderBottomColor = on ? p.accent : 'transparent';
        }
        for (const [k, pane] of panes) pane.style.display = k === id ? 'block' : 'none';
    }

    function syncAuto(): void {
        nameInput.placeholder = `${ticker} ${conditionLabel(st.condition)}`;
        if (!st.messageEdited) msgArea.value = autoMessage();
    }
    // an existing alert whose message is still an auto text keeps tracking the price / condition
    st.messageEdited = !!editing && !!editing.message
        && !isAutoAlertMessage(editing.message, editing.symbol, editing.condition, editing.price, [fmt(editing.price)]);
    msgArea.value = st.messageEdited && editing ? editing.message : autoMessage();
    msgArea.addEventListener('input', () => { st.messageEdited = true; });
    condSelect.addEventListener('change', () => { st.condition = condSelect.value as AlertCondition; syncAuto(); });
    priceInput.addEventListener('input', () => { priceErr.style.display = 'none'; syncAuto(); });

    const setBusy = (b: boolean) => {
        st.busy = b;
        okBtn.disabled = b;
        cancelBtn.disabled = b;
        okBtn.style.opacity = b ? '0.6' : '1';
        okBtn.style.cursor = b ? 'default' : 'pointer';
    };
    const showBanner = (text: string) => { banner.textContent = text; banner.style.display = 'block'; };
    const hideBanner = () => { banner.style.display = 'none'; banner.textContent = ''; };

    const errorText = (e: unknown): string | null => alertErrorText(e, alertsStore.hasBackend);

    const validate = (): AlertDraft | null => {
        const price = parseAlertPrice(priceInput.value);
        let ok = true;
        if (priceInput.value.trim() === '' || !isFinite(price) || price <= 0) {
            priceErr.style.display = 'block';
            selectTab('settings');
            priceInput.focus();
            ok = false;
        }
        let expiresAt: number | null = null;
        if (!forever.box.checked) {
            const ms = new Date(expInput.value).getTime();
            if (!expInput.value || !isFinite(ms) || ms <= Date.now()) {
                expErr.style.display = 'block';
                if (ok) selectTab('settings');
                ok = false;
            } else {
                expiresAt = ms;
            }
        }
        if (!ok) return null;
        return {
            symbol,
            condition: st.condition,
            price,
            name: nameInput.value.trim(),
            // untouched auto text -> '' so the server rebuilds the default for the saved price / condition
            message: !st.messageEdited || isAutoAlertMessage(msgArea.value, symbol, st.condition, price, [fmt(price)]) ? '' : msgArea.value.trim(),
            notifyApp: true,
            notifyToast: nToast.box.checked,
            playSound: nSound.box.checked,
            sound: soundSelect.value as AlertSound,
            notifyTelegram: tgAvailable && nTg.box.checked,
            expiresAt,
            color: editing?.color ?? DEFAULT_ALERT_COLOR,
        };
    };

    const submit = async (): Promise<void> => {
        if (st.busy) return;
        hideBanner();
        const draft = validate();
        if (!draft) return;
        setBusy(true);
        try {
            if (editing) {
                const { symbol: _s, ...patch } = draft;
                await alertsStore.update(editing.id, patch);
            } else {
                await alertsStore.create(draft);
            }
            close();
            showToast({ title: editing ? t('Alert saved') : t('Alert created'), kind: 'success' });
        } catch (e) {
            setBusy(false);
            const text = errorText(e);
            if (text) showBanner(text);
        }
    };

    const onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (!st.busy) close();
        }
    };
    priceInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); void submit(); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); stepPrice(e.key === 'ArrowUp' ? 1 : -1); }
    });

    let closed = false;
    function close(): void {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKeyDown, true);
        overlay.remove();
        if (current === handle) current = null;
    }
    const handle = { close };

    closeBtn.addEventListener('click', () => { if (!st.busy) close(); });
    cancelBtn.addEventListener('click', () => close());
    okBtn.addEventListener('click', () => { void submit(); });
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && !st.busy) close(); });
    document.addEventListener('keydown', onKeyDown, true);

    selectTab('settings');
    document.body.appendChild(overlay);
    current = handle;
    setTimeout(() => { if (!closed) { priceInput.focus(); priceInput.select(); } }, 0);
    return handle;
}
