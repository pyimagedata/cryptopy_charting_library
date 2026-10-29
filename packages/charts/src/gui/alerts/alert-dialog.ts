/**
 * TradingView-style "Create alert" / "Edit alert" modal. Single instance per page.
 * Talks to the page-level alertsStore; the chart only supplies price formatting / tick size / theme.
 */
import { t } from '../../helpers/translations';
import { alertsStore } from '../../alerts/alerts-store';
import { playAlertSound } from '../../alerts/alert-sound';
import {
    ALERT_INTERVALS, ALERT_PLACEHOLDERS, ALERT_SOUND_NAMES, ALERT_TRIGGERS, DEFAULT_ALERT_COLOR, DEFAULT_ALERT_INTERVAL, DEFAULT_MOVE_BARS,
    alertErrorText, alertPriceSeed, alertTicker, conditionLabel, conditionsFor, exactPrice, intervalLabel, isAutoAlertMessage, isMovingCondition,
    isPercentCondition, mapChartInterval, movingAutoTails, parseAlertPrice, plainPrice, priceDecimals, serverDrawingMessage, serverMovingMessage, soundLabel, triggerLabel,
} from '../../alerts/alert-text';
import { AlertsError, AlertCondition, AlertDraft, AlertGeometry, AlertInterval, AlertSound, AlertTrigger, ChartAlert } from '../../alerts/types';
import { detectUiTheme, showToast, ToastTheme } from '../toast/toast';

/** What the dialog needs to know about the chart it was opened from (all optional behaviour). */
export interface AlertDialogChart {
    formatAlertPrice(price: number): string;
    /** Tick size of the symbol if the chart knows it. */
    alertPriceStep(): number | null;
    alertTheme(): ToastTheme;
    /** Right price scale mode (optional): drawing alerts interpolate linearly in price. */
    alertPriceScaleMode?(): 'normal' | 'logarithmic' | 'percentage';
    /** Current chart timeframe ("15m", "1h", ...), used as the default alert interval. */
    timeframe?: string;
}

export interface AlertDialogOptions {
    chart?: AlertDialogChart | null;
    symbol: string;
    price: number;
    /** When given the dialog edits this alert instead of creating a new one. */
    alert?: ChartAlert;
    /** Create a drawing alert (source = drawing): the geometry is stored with the alert. */
    drawing?: { id: string; type: string; label: string; geometry: AlertGeometry };
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

    // drawing alert info: from the edited alert, or from the drawing the dialog was opened for
    const isDrawing = editing ? editing.source === 'drawing' : !!opts.drawing;
    const drawingInfo = isDrawing
        ? (editing
            ? { id: editing.drawingId ?? '', type: editing.drawingType ?? '', label: editing.drawingLabel ?? '', geometry: editing.geometry ?? null }
            : { id: opts.drawing!.id, type: opts.drawing!.type, label: opts.drawing!.label, geometry: opts.drawing!.geometry as AlertGeometry | null })
        : null;
    const geometryType = drawingInfo?.geometry?.type ?? null;
    const source = isDrawing ? 'drawing' as const : 'price' as const;
    const allowed = conditionsFor(source, geometryType);
    const defaultCondition: AlertCondition = isDrawing && geometryType === 'channel' ? 'entering_channel' : 'crossing';
    const chartInterval = ((): AlertInterval => {
        try { return mapChartInterval(chart?.timeframe) ?? DEFAULT_ALERT_INTERVAL; } catch { return DEFAULT_ALERT_INTERVAL; }
    })();

    // ---- state ----
    const st = {
        tab: 'settings' as TabId,
        busy: false,
        condition: (editing?.condition ?? defaultCondition) as AlertCondition,
        messageEdited: false,
    };
    const autoMessage = (): string => {
        const head = `${ticker} ${conditionLabel(st.condition)}`;
        // drawing / moving previews equal the server default message (what is stored when the text is left untouched)
        if (drawingInfo) return drawingInfo.label ? serverDrawingMessage(symbol, st.condition, drawingInfo.label) : head;
        if (isMovingCondition(st.condition)) {
            const v = parseAlertPrice(moveInput.value);
            return isFinite(v) && v > 0 ? serverMovingMessage(symbol, st.condition, v) : head;
        }
        const n = parseAlertPrice(priceInput.value);
        const price = isFinite(n) && priceInput.value.trim() !== '' ? exactPrice(n) : '';
        return `${head}${price ? ' ' + price : ''}`;
    };
    /** Extra auto-text tails for isAutoAlertMessage (drawing label / moving tail). */
    const autoExtras = (cond: AlertCondition): string[] => {
        if (drawingInfo) return drawingInfo.label ? [drawingInfo.label] : [];
        if (isMovingCondition(cond)) {
            const v = parseAlertPrice(moveInput.value);
            const bars = parseInt(barsInput.value, 10);
            return isFinite(v) && isFinite(bars) ? movingAutoTails(cond, v, bars) : [];
        }
        return [];
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

    const condSelect = el('select', inputCss + 'cursor: pointer; flex: 1 1 auto; min-width: 0; width: auto;');
    condSelect.className = 'chart-alert-condition';
    for (const c of allowed) {
        const o = el('option', '', conditionLabel(c));
        o.value = c;
        condSelect.appendChild(o);
    }
    if (allowed.indexOf(st.condition) < 0) st.condition = allowed[0];
    condSelect.value = st.condition;
    focusRing(condSelect);
    const condWrap = el('div', 'display: flex; align-items: center; gap: 8px;');
    condWrap.appendChild(el('div', `flex: 0 0 auto; font-size: 14px; font-weight: 600; color: ${p.text};`, ticker));
    condWrap.appendChild(condSelect);
    settings.appendChild(row(t('Condition'), condWrap));

    // value area: price input | drawing chip | moving value + bars
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

    // drawing chip (read-only)
    const drawingChip = el('div', `height: 36px; display: flex; align-items: center;`);
    const chipText = el('span', `display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 13px; font-size: 13px; font-weight: 600; color: ${p.text}; background: ${p.hover}; border: 1px solid ${p.inputBorder};`, drawingInfo?.label || t('Drawing'));
    chipText.className = 'chart-alert-drawing-chip';
    drawingChip.appendChild(chipText);

    // moving condition: value + unit + "within N bars"
    const moveCell = el('div');
    const moveRow = el('div', 'display: flex; align-items: center; gap: 8px;');
    const moveInput = el('input', inputCss + 'flex: 1 1 0; min-width: 0; width: auto;');
    moveInput.className = 'chart-alert-move-value';
    moveInput.type = 'text';
    moveInput.inputMode = 'decimal';
    moveInput.autocomplete = 'off';
    moveInput.spellcheck = false;
    moveInput.value = editing?.moveValue != null ? plainPrice(editing.moveValue) : '';
    focusRing(moveInput);
    const moveUnit = el('div', `flex: 0 0 auto; min-width: 14px; font-size: 14px; color: ${p.text};`);
    moveUnit.className = 'chart-alert-move-unit';
    const barsInput = el('input', inputCss + 'flex: 0 0 64px; width: 64px;');
    barsInput.className = 'chart-alert-move-bars';
    barsInput.type = 'number';
    barsInput.min = '1';
    barsInput.max = '500';
    barsInput.step = '1';
    barsInput.value = String(editing?.moveBars ?? DEFAULT_MOVE_BARS);
    focusRing(barsInput);
    moveRow.appendChild(moveInput);
    moveRow.appendChild(moveUnit);
    moveRow.appendChild(el('div', `flex: 0 0 auto; font-size: 14px; color: ${p.sub};`, t('within bars')));
    moveRow.appendChild(barsInput);
    const moveErr = el('div', `display: none; margin-top: 4px; font-size: 12px; color: ${p.danger};`);
    moveCell.appendChild(moveRow);
    moveCell.appendChild(moveErr);

    const valueHost = el('div');
    valueHost.appendChild(priceCell);
    valueHost.appendChild(drawingChip);
    valueHost.appendChild(moveCell);
    settings.appendChild(row(t('Value'), valueHost));
    if (isDrawing) {
        let scaleMode: string = 'normal';
        try { scaleMode = chart?.alertPriceScaleMode?.() ?? 'normal'; } catch { /* ignore */ }
        if (scaleMode !== 'normal') {
            const note = el('div', `margin-top: 8px; font-size: 12px; line-height: 1.4; color: ${p.sub};`,
                t('Note: on a log scale the alert uses a linear price interpolation and may differ from the drawing.'));
            note.className = 'chart-alert-scale-note';
            settings.appendChild(note);
        }
    }

    // interval (moving conditions / recurring triggers)
    const intervalSelect = el('select', inputCss + 'cursor: pointer;');
    intervalSelect.className = 'chart-alert-interval';
    for (const i of ALERT_INTERVALS) {
        const o = el('option', '', intervalLabel(i));
        o.value = i;
        intervalSelect.appendChild(o);
    }
    intervalSelect.value = editing?.interval ?? chartInterval;
    focusRing(intervalSelect);
    const intervalRow = row(t('Alert interval'), intervalSelect);
    intervalRow.classList.add('chart-alert-interval-row');
    settings.appendChild(intervalRow);

    const triggerSelect = el('select', inputCss + 'cursor: pointer;');
    triggerSelect.className = 'chart-alert-trigger';
    for (const tr of ALERT_TRIGGERS) {
        const o = el('option', '', triggerLabel(tr));
        o.value = tr;
        triggerSelect.appendChild(o);
    }
    triggerSelect.value = editing?.trigger ?? 'once';
    focusRing(triggerSelect);
    settings.appendChild(row(t('Trigger'), triggerSelect));

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
    const phWrap = el('div', 'display: flex; flex-wrap: wrap; gap: 6px;');
    phWrap.className = 'chart-alert-placeholders';
    for (const ph of ALERT_PLACEHOLDERS) {
        const token = `{{${ph}}}`;
        const chip = el('button', `height: 22px; padding: 0 8px; border: 1px solid ${p.inputBorder}; border-radius: 11px; background: transparent; color: ${p.text}; font: 12px ${FONT}; cursor: pointer;`, token);
        chip.type = 'button';
        chip.dataset.placeholder = token;
        chip.addEventListener('mousedown', (e) => e.preventDefault());
        chip.addEventListener('mouseenter', () => { chip.style.background = p.hover; });
        chip.addEventListener('mouseleave', () => { chip.style.background = 'transparent'; });
        chip.addEventListener('click', () => {
            const a = msgArea.selectionStart ?? msgArea.value.length;
            const b2 = msgArea.selectionEnd ?? a;
            const next = msgArea.value.slice(0, a) + token + msgArea.value.slice(b2);
            if (next.length > msgArea.maxLength) return;
            msgArea.value = next;
            msgArea.focus();
            msgArea.setSelectionRange(a + token.length, a + token.length);
            st.messageEdited = true;
        });
        phWrap.appendChild(chip);
    }
    msgPane.appendChild(row(t('Placeholders (click to insert)'), phWrap));

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

    const whAvailable = alertsStore.webhookAvailable;
    const nHook = checkbox(t('Webhook URL'), whAvailable && !!editing?.webhookUrl);
    nHook.box.className = 'chart-alert-notify-webhook';
    const hookInput = el('input', inputCss + 'margin-top: 8px;');
    hookInput.className = 'chart-alert-webhook-url';
    hookInput.type = 'text';
    hookInput.maxLength = 500;
    hookInput.placeholder = 'https://';
    hookInput.spellcheck = false;
    hookInput.autocomplete = 'off';
    hookInput.value = whAvailable ? editing?.webhookUrl ?? '' : '';
    focusRing(hookInput);
    const hookErr = el('div', `display: none; margin-top: 4px; font-size: 12px; color: ${p.danger};`);
    hookErr.className = 'chart-alert-webhook-error';
    const hookBlock = el('div');
    hookBlock.appendChild(nHook.wrap);
    hookBlock.appendChild(hookInput);
    hookBlock.appendChild(hookErr);
    const syncHook = () => {
        const on = whAvailable && nHook.box.checked;
        hookInput.style.display = whAvailable ? 'block' : 'none';
        hookInput.disabled = !on;
        hookInput.style.opacity = on ? '1' : '0.5';
        hookErr.style.display = 'none';
    };
    if (!whAvailable) {
        nHook.box.disabled = true;
        nHook.wrap.style.cursor = 'default';
        nHook.wrap.style.color = p.disabled;
        hookBlock.appendChild(el('div', `margin: 4px 0 0 24px; font-size: 12px; color: ${p.sub};`, t('Webhook is available on the PRO plan')));
    }
    nHook.box.addEventListener('change', () => { syncHook(); if (nHook.box.checked) hookInput.focus(); });
    syncHook();
    noteList.appendChild(hookBlock);
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

    function syncVisibility(): void {
        const moving = isMovingCondition(st.condition);
        priceCell.style.display = !isDrawing && !moving ? 'block' : 'none';
        drawingChip.style.display = isDrawing ? 'flex' : 'none';
        moveCell.style.display = !isDrawing && moving ? 'block' : 'none';
        moveUnit.textContent = isPercentCondition(st.condition) ? '%' : t('Price');
        intervalRow.style.display = moving || triggerSelect.value !== 'once' ? 'flex' : 'none';
    }

    function syncAuto(): void {
        syncVisibility();
        nameInput.placeholder = `${ticker} ${conditionLabel(st.condition)}`;
        if (!st.messageEdited) msgArea.value = autoMessage();
    }
    // an existing alert whose message is still an auto text keeps tracking the price / condition
    st.messageEdited = !!editing && !!editing.message
        && !isAutoAlertMessage(editing.message, editing.symbol, editing.condition, editing.price, [fmt(editing.price), ...autoExtras(editing.condition)]);
    msgArea.value = st.messageEdited && editing ? editing.message : autoMessage();
    msgArea.addEventListener('input', () => { st.messageEdited = true; });
    condSelect.addEventListener('change', () => { st.condition = condSelect.value as AlertCondition; syncAuto(); });
    priceInput.addEventListener('input', () => { priceErr.style.display = 'none'; syncAuto(); });
    moveInput.addEventListener('input', () => { moveErr.style.display = 'none'; syncAuto(); });
    barsInput.addEventListener('input', () => { moveErr.style.display = 'none'; syncAuto(); });
    triggerSelect.addEventListener('change', () => syncVisibility());
    syncVisibility();

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

    const validHookUrl = (v: string): boolean => {
        if (v.length > 500) return false;
        try {
            const u = new URL(v);
            return u.protocol === 'https:' && !u.username && !u.password && !!u.hostname;
        } catch { return false; }
    };

    const validate = (): AlertDraft | null => {
        const moving = !isDrawing && isMovingCondition(st.condition);
        let price = parseAlertPrice(priceInput.value);
        let ok = true;
        const failSettings = (focus?: HTMLElement) => { if (ok) { selectTab('settings'); focus?.focus(); } ok = false; };
        let moveValue: number | null = null;
        let moveBars: number | null = null;
        if (isDrawing) {
            // the price of a drawing alert is only informational: the value at creation (or the stored one)
            price = editing ? editing.price : opts.price;
        } else if (moving) {
            price = editing ? editing.price : opts.price;
            if (!isFinite(price) || price <= 0) price = parseAlertPrice(priceInput.value);
            if (!isFinite(price) || price <= 0) price = 1;
            const v = parseAlertPrice(moveInput.value);
            const bars = Number(barsInput.value);
            if (!isFinite(v) || v <= 0) {
                moveErr.textContent = t('Enter a value greater than 0');
                moveErr.style.display = 'block';
                failSettings(moveInput);
            } else if (barsInput.value.trim() === '' || !Number.isInteger(bars) || bars < 1 || bars > 500) {
                moveErr.textContent = t('Enter bars between 1 and 500');
                moveErr.style.display = 'block';
                failSettings(barsInput);
            } else {
                moveValue = v;
                moveBars = bars;
            }
        } else if (priceInput.value.trim() === '' || !isFinite(price) || price <= 0) {
            priceErr.style.display = 'block';
            failSettings(priceInput);
        }
        let expiresAt: number | null = null;
        if (!forever.box.checked) {
            const ms = new Date(expInput.value).getTime();
            if (!expInput.value || !isFinite(ms) || ms <= Date.now()) {
                expErr.style.display = 'block';
                failSettings();
            } else {
                expiresAt = ms;
            }
        }
        let webhookUrl: string | null | undefined;
        if (whAvailable) {
            if (nHook.box.checked) {
                const v = hookInput.value.trim();
                if (!validHookUrl(v)) {
                    hookErr.textContent = t('Enter a valid https:// URL');
                    hookErr.style.display = 'block';
                    if (ok) { selectTab('notifications'); hookInput.focus(); }
                    ok = false;
                } else {
                    webhookUrl = v;
                }
            } else {
                webhookUrl = null;
            }
        }
        if (!ok) return null;
        const cond = st.condition;
        const trigger = triggerSelect.value as AlertTrigger;
        const draft: AlertDraft = {
            symbol,
            condition: cond,
            // a drawing alert's price is informational: null (omitted on the wire) when there is no usable seed price
            price: isDrawing && !(isFinite(price) && price > 0) ? null : price,
            name: nameInput.value.trim(),
            // untouched auto text -> '' so the server rebuilds the default for the saved price / condition
            message: !st.messageEdited || isAutoAlertMessage(msgArea.value, symbol, cond, price, [fmt(price), ...autoExtras(cond)]) ? '' : msgArea.value.trim(),
            notifyApp: true,
            notifyToast: nToast.box.checked,
            playSound: nSound.box.checked,
            sound: soundSelect.value as AlertSound,
            notifyTelegram: tgAvailable && nTg.box.checked,
            expiresAt,
            color: editing?.color ?? DEFAULT_ALERT_COLOR,
            interval: intervalSelect.value as AlertInterval,
            trigger,
            source,
            drawingId: drawingInfo ? drawingInfo.id : null,
            drawingType: drawingInfo ? drawingInfo.type : null,
            drawingLabel: drawingInfo ? drawingInfo.label : null,
            geometry: drawingInfo ? drawingInfo.geometry : null,
            moveValue,
            moveBars,
        };
        if (webhookUrl !== undefined) draft.webhookUrl = webhookUrl;
        return draft;
    };

    const submit = async (): Promise<void> => {
        if (st.busy) return;
        hideBanner();
        const draft = validate();
        if (!draft) return;
        setBusy(true);
        try {
            if (editing) {
                // an edit never rewrites the drawing binding / geometry (the drawing side keeps them in sync)
                const { symbol: _s, source: _so, drawingId: _d, drawingType: _dt, drawingLabel: _dl, geometry: _g, ...patch } = draft;
                // nor the informational price of a drawing alert
                if (isDrawing) delete (patch as { price?: number | null }).price;
                await alertsStore.update(editing.id, patch);
            } else {
                await alertsStore.create(draft);
            }
            close();
            showToast({ title: editing ? t('Alert saved') : t('Alert created'), kind: 'success' });
        } catch (e) {
            setBusy(false);
            const text = errorText(e);
            if (e instanceof AlertsError && e.field === 'webhook_url' && text) {
                hookErr.textContent = text;
                hookErr.style.display = 'block';
                selectTab('notifications');
            } else if (text) {
                showBanner(text);
            }
        }
    };

    const onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (!st.busy) close();
        }
    };
    for (const inp of [moveInput, barsInput, hookInput]) {
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } });
    }
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
    setTimeout(() => {
        if (closed) return;
        const f = isDrawing ? condSelect : isMovingCondition(st.condition) ? moveInput : priceInput;
        f.focus();
        if (f instanceof HTMLInputElement) f.select();
    }, 0);
    return handle;
}
