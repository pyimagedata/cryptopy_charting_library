/**
 * Bar replay UI (TradingView-style): bar selection mode (vertical line + scissors badge + dimmed right
 * side) and the floating, draggable control bar. DOM only; all behaviour lives in ReplayController.
 * One instance per ChartWidget. In multi-chart layouts only the active chart's UI is enabled
 * (`setEnabled`), the other charts just follow the cursor.
 */

import { t } from '../../helpers/translations';
import type { BarData } from '../../model/data';
import { REPLAY_NOTICE_INTRABAR_UNAVAILABLE, REPLAY_NOTICE_NO_DATA_AT_CURSOR } from '../../replay/replay-controller';
import type { ReplayController, ReplayState } from '../../replay/replay-controller';
import { REPLAY_SPEEDS, approxMs, detectTimeUnit, parseTf } from '../../replay/replay-core';
import { legendColors } from '../indicator_legend/legend-constants';
import { REPLAY_ICONS } from './replay-icons';

export interface ReplayUIDeps {
    /** Chart widget root (position: relative). The control bar and menus live here. */
    root: HTMLElement;
    controller: ReplayController;
    /** Main pane element (selection overlay lives inside, coordinates are pane-local). */
    getPaneElement(): HTMLElement | null;
    /** Currently displayed primary-series bars. */
    getBars(): readonly BarData[];
    coordinateToIndex(x: number): number;
    indexToCoordinate(index: number): number;
    getTimeframe(): string;
    /** IANA zone of the time axis ('' = browser local). */
    getTimezone(): string;
    getTheme(): 'dark' | 'light';
}

type Theme = 'dark' | 'light';

const ACCENT = '#2962FF';
const BAR_HEIGHT = 38;
/** Update-interval candidates (value passed to controller.setStepInterval, label shown). */
const STEP_INTERVALS: ReadonlyArray<{ value: string; label: string }> = [
    { value: '1m', label: '1m' },
    { value: '3m', label: '3m' },
    { value: '5m', label: '5m' },
    { value: '15m', label: '15m' },
    { value: '30m', label: '30m' },
    { value: '1h', label: '1h' },
    { value: '4h', label: '4h' },
    { value: 'D', label: '1D' },
];

function palette(theme: Theme) {
    const c = legendColors(theme);
    const dark = theme === 'dark';
    return {
        text: c.text,
        muted: c.muted,
        hover: c.hoverBg,
        bg: dark ? '#1E222D' : '#FFFFFF',
        border: dark ? '#2A2E39' : '#E0E3EB',
        shadow: dark ? '0 4px 16px rgba(0,0,0,0.55)' : '0 4px 16px rgba(19,23,34,0.18)',
        dim: dark ? 'rgba(10, 12, 20, 0.55)' : 'rgba(255, 255, 255, 0.62)',
        accent: ACCENT,
        disabled: dark ? '#4A4E5A' : '#B2B5BE',
    };
}

// ---------------------------------------------------------------------- time zone helpers

function partsIn(ms: number, tz: string): { y: number; mo: number; d: number; h: number; mi: number } {
    const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz || undefined,
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    const o: Record<string, number> = {};
    for (const p of fmt.formatToParts(new Date(ms))) {
        if (p.type !== 'literal') o[p.type] = parseInt(p.value, 10);
    }
    return { y: o.year, mo: o.month, d: o.day, h: o.hour % 24, mi: o.minute };
}

function pad(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

function safePartsIn(ms: number, tz: string) {
    try {
        return partsIn(ms, tz);
    } catch {
        return partsIn(ms, '');
    }
}

function formatDateTime(ms: number, tz: string): string {
    const p = safePartsIn(ms, tz);
    return `${p.y}-${pad(p.mo)}-${pad(p.d)} ${pad(p.h)}:${pad(p.mi)}`;
}

/** Epoch ms of the wall-clock time `y-mo-d h:mi` in zone `tz`. */
function zonedToEpoch(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
    if (!tz) return new Date(y, mo - 1, d, h, mi).getTime();
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    const offsetAt = (ms: number): number => {
        const p = safePartsIn(ms, tz);
        return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - ms;
    };
    const first = guess - offsetAt(guess);
    return guess - offsetAt(first);
}

// ---------------------------------------------------------------------- UI

export class ReplayUI {
    private readonly _d: ReplayUIDeps;
    private _theme: Theme;
    private _state: ReplayState;
    private _enabled = true;
    private _disposed = false;

    // selection overlay (inside the pane element)
    private _selOverlay: HTMLElement | null = null;
    private _selDim: HTMLElement | null = null;
    private _selLine: HTMLElement | null = null;
    private _selTip: HTMLElement | null = null;

    // control bar (inside root)
    private _bar: HTMLElement | null = null;
    private _barBtns: Record<string, HTMLButtonElement> = {};
    private _timeEl: HTMLElement | null = null;
    private _toastEl: HTMLElement | null = null;
    private _toastTimer: ReturnType<typeof setTimeout> | null = null;
    private _userPos: { left: number; top: number } | null = null;
    private _lastNotice: string | null = null;
    /** Centred "no data at the replay date" card (inside the pane element). */
    private _noDataEl: HTMLElement | null = null;

    private _menu: HTMLElement | null = null;
    private _menuOwner: HTMLElement | null = null;
    private _resizeObs: ResizeObserver | null = null;
    private _dragCleanup: (() => void) | null = null;

    private readonly _stateListener = (s: ReplayState) => this._onState(s);

    constructor(deps: ReplayUIDeps) {
        this._d = deps;
        this._theme = deps.getTheme();
        this._state = deps.controller.state;
        deps.controller.onStateChange.subscribe(this._stateListener);
        // capture phase on the chart root: observe moves, swallow pane clicks while selecting
        const r = deps.root;
        r.addEventListener('mousemove', this._onMouseMove, true);
        r.addEventListener('mouseleave', this._onMouseLeave, true);
        for (const type of ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'dblclick', 'contextmenu']) {
            r.addEventListener(type, this._onBlock, true);
        }
        r.addEventListener('click', this._onClick, true);
        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObs = new ResizeObserver(() => this._place());
            this._resizeObs.observe(r);
        }
        this._onState(this._state);
    }

    // ------------------------------------------------------------------ public

    setTheme(theme: Theme): void {
        if (this._theme === theme) return;
        this._theme = theme;
        this._closeMenu();
        if (this._bar) {
            this._bar.remove();
            this._bar = null;
            this._barBtns = {};
        }
        this._removeSelection();
        this._onState(this._d.controller.state);
    }

    /** Multi-chart: only the active chart shows the control bar / selection. */
    setEnabled(enabled: boolean): void {
        if (this._enabled === enabled) return;
        this._enabled = enabled;
        this._onState(this._d.controller.state);
    }

    refresh(): void {
        this._onState(this._d.controller.state);
    }

    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        const r = this._d.root;
        this._d.controller.onStateChange.unsubscribe(this._stateListener);
        r.removeEventListener('mousemove', this._onMouseMove, true);
        r.removeEventListener('mouseleave', this._onMouseLeave, true);
        for (const type of ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'dblclick', 'contextmenu']) {
            r.removeEventListener(type, this._onBlock, true);
        }
        r.removeEventListener('click', this._onClick, true);
        this._resizeObs?.disconnect();
        this._resizeObs = null;
        this._dragCleanup?.();
        this._closeMenu();
        this._removeSelection();
        this._removeNoData();
        if (this._toastTimer !== null) clearTimeout(this._toastTimer);
        this._bar?.remove();
        this._bar = null;
        this._barBtns = {};
    }

    // ------------------------------------------------------------------ state

    private _onState(s: ReplayState): void {
        if (this._disposed) return;
        this._state = s;
        const show = this._enabled && (s.active || s.selecting);
        if (!show) {
            this._closeMenu();
            this._removeSelection();
            this._removeNoData();
            if (this._bar) this._bar.style.display = 'none';
            this._lastNotice = s.notice;
            return;
        }
        if (s.selecting) this._ensureSelection();
        else this._removeSelection();
        this._ensureBar();
        this._renderBar();
        this._place();
        if (s.active && s.notice === REPLAY_NOTICE_NO_DATA_AT_CURSOR) this._ensureNoData();
        else this._removeNoData();
        if (s.notice === REPLAY_NOTICE_INTRABAR_UNAVAILABLE && this._lastNotice !== s.notice) {
            this._toast(t('No lower timeframe data for this date'));
        }
        this._lastNotice = s.notice;
    }

    // ------------------------------------------------------------------ selection mode

    private _ensureSelection(): void {
        const pane = this._d.getPaneElement();
        if (!pane) return;
        if (this._selOverlay && this._selOverlay.parentElement === pane) return;
        this._removeSelection();
        const p = palette(this._theme);
        const overlay = document.createElement('div');
        overlay.className = 'tv-replay-selection';
        overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:30;display:none;overflow:hidden;';
        const dim = document.createElement('div');
        dim.style.cssText = `position:absolute;top:0;bottom:0;right:0;left:0;background:${p.dim};`;
        const line = document.createElement('div');
        line.style.cssText = `position:absolute;top:0;bottom:0;width:0;border-left:1px dashed ${p.text};opacity:0.9;`;
        const badge = document.createElement('div');
        badge.style.cssText = `position:absolute;top:8px;left:-12px;width:24px;height:24px;border-radius:50%;background:${p.accent};color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.4);`;
        badge.innerHTML = REPLAY_ICONS.scissors.replace('width="18" height="18"', 'width="16" height="16"');
        line.appendChild(badge);
        const tip = document.createElement('div');
        tip.style.cssText = `position:absolute;padding:4px 8px;border-radius:4px;background:${p.bg};color:${p.text};border:1px solid ${p.border};font:12px -apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif;white-space:nowrap;box-shadow:${p.shadow};`;
        tip.textContent = t('Select bar');
        overlay.append(dim, line, tip);
        pane.appendChild(overlay);
        this._selOverlay = overlay;
        this._selDim = dim;
        this._selLine = line;
        this._selTip = tip;
    }

    private _removeSelection(): void {
        this._selOverlay?.remove();
        this._selOverlay = null;
        this._selDim = null;
        this._selLine = null;
        this._selTip = null;
    }

    private _ensureNoData(): void {
        const pane = this._d.getPaneElement();
        if (!pane) return;
        if (this._noDataEl && this._noDataEl.parentElement === pane) return;
        this._removeNoData();
        const p = palette(this._theme);
        const c = this._d.controller;
        const wrap = document.createElement('div');
        wrap.className = 'tv-replay-nodata';
        wrap.style.cssText = 'position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;pointer-events:none;';
        const card = document.createElement('div');
        card.style.cssText = `pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:12px;padding:18px 24px;border-radius:10px;background:${p.bg};border:1px solid ${p.border};box-shadow:${p.shadow};color:${p.text};font:13px -apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif;text-align:center;max-width:80%;`;
        for (const type of ['mousedown', 'pointerdown', 'wheel', 'contextmenu', 'dblclick']) {
            card.addEventListener(type, (e) => e.stopPropagation());
        }
        const msg = document.createElement('div');
        msg.textContent = t('No data for the replay date on this timeframe');
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;';
        const mk = (label: string, primary: boolean, action: () => void) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.style.cssText = `height:30px;padding:0 12px;border-radius:6px;cursor:pointer;font:600 13px -apple-system,BlinkMacSystemFont,Roboto,sans-serif;${primary ? `border:none;background:${p.accent};color:#fff;` : `border:1px solid ${p.border};background:transparent;color:${p.text};`}`;
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                action();
            });
            return b;
        };
        const first = mk(t('Go to first available date'), true, () => void c.startFirstAvailable());
        first.dataset.replay = 'nodata-first';
        const exit = mk(t('Exit replay'), false, () => void c.stop());
        exit.dataset.replay = 'nodata-exit';
        row.append(first, exit);
        card.append(msg, row);
        wrap.appendChild(card);
        pane.appendChild(wrap);
        this._noDataEl = wrap;
    }

    private _removeNoData(): void {
        this._noDataEl?.remove();
        this._noDataEl = null;
    }

    /** Bar index under a pane-local x (clamped to the displayed bars), or -1. */
    private _indexAtX(x: number): number {
        const bars = this._d.getBars();
        if (bars.length === 0) return -1;
        const idx = Math.round(this._d.coordinateToIndex(x));
        return Math.max(0, Math.min(bars.length - 1, idx));
    }

    private _insidePane(e: MouseEvent): { x: number; y: number } | null {
        const pane = this._d.getPaneElement();
        if (!pane) return null;
        const r = pane.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    private readonly _onMouseMove = (e: MouseEvent): void => {
        if (!this._state.selecting || !this._enabled || !this._selOverlay) return;
        const pt = this._insidePane(e);
        const pane = this._d.getPaneElement();
        const idx = pt ? this._indexAtX(pt.x) : -1;
        if (!pt || !pane || idx < 0) {
            this._selOverlay.style.display = 'none';
            return;
        }
        const cx = Math.round(this._d.indexToCoordinate(idx));
        this._selOverlay.style.display = 'block';
        this._selLine!.style.left = `${cx}px`;
        this._selDim!.style.left = `${cx}px`;
        const tip = this._selTip!;
        const w = pane.clientWidth;
        const tipW = tip.offsetWidth || 70;
        const left = pt.x + 16 + tipW > w ? pt.x - 16 - tipW : pt.x + 16;
        tip.style.left = `${Math.max(2, left)}px`;
        tip.style.top = `${Math.max(2, pt.y + 18)}px`;
    };

    private readonly _onMouseLeave = (e: MouseEvent): void => {
        if (e.target !== this._d.root) return;
        if (this._selOverlay) this._selOverlay.style.display = 'none';
    };

    private _targetInPane(e: Event): boolean {
        const pane = this._d.getPaneElement();
        return !!pane && e.target instanceof Node && pane.contains(e.target);
    }

    /** While selecting, pointer interactions on the pane do not reach the chart (crosshair/drawing tools). */
    private readonly _onBlock = (e: Event): void => {
        if (!this._state.selecting || !this._enabled || !this._targetInPane(e)) return;
        e.stopPropagation();
        if (e.type === 'contextmenu') e.preventDefault();
    };

    private readonly _onClick = (e: MouseEvent): void => {
        if (!this._state.selecting || !this._enabled || !this._targetInPane(e)) return;
        e.stopPropagation();
        e.preventDefault();
        const pt = this._insidePane(e);
        if (!pt) return;
        const idx = this._indexAtX(pt.x);
        const bar = idx >= 0 ? this._d.getBars()[idx] : undefined;
        if (bar) this._d.controller.start(bar.time);
    };

    // ------------------------------------------------------------------ control bar

    private _btnStyle(p: ReturnType<typeof palette>): string {
        return `display:flex;align-items:center;gap:6px;height:28px;padding:0 8px;border:none;border-radius:6px;background:transparent;color:${p.text};font:13px -apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif;cursor:pointer;white-space:nowrap;`;
    }

    private _mkBtn(key: string, html: string, title: string, onClick: (btn: HTMLButtonElement) => void): HTMLButtonElement {
        const p = palette(this._theme);
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.replay = key;
        b.style.cssText = this._btnStyle(p);
        b.innerHTML = html;
        b.title = title;
        b.addEventListener('mouseenter', () => {
            if (!b.disabled) b.style.background = p.hover;
        });
        b.addEventListener('mouseleave', () => {
            b.style.background = 'transparent';
        });
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!b.disabled) onClick(b);
        });
        this._barBtns[key] = b;
        return b;
    }

    private _sep(): HTMLElement {
        const p = palette(this._theme);
        const s = document.createElement('div');
        s.style.cssText = `width:1px;height:20px;background:${p.border};margin:0 4px;flex-shrink:0;`;
        return s;
    }

    private _ensureBar(): void {
        if (this._bar) {
            if (this._bar.parentElement !== this._d.root) this._d.root.appendChild(this._bar);
            this._bar.style.display = 'flex';
            return;
        }
        const p = palette(this._theme);
        const c = this._d.controller;
        const bar = document.createElement('div');
        bar.className = 'tv-replay-bar';
        bar.style.cssText = `position:absolute;z-index:60;display:flex;align-items:center;gap:2px;height:${BAR_HEIGHT}px;padding:0 6px 0 2px;box-sizing:border-box;border-radius:10px;background:${p.bg};border:1px solid ${p.border};box-shadow:${p.shadow};color:${p.text};user-select:none;`;
        bar.addEventListener('mousedown', (e) => e.stopPropagation());
        bar.addEventListener('pointerdown', (e) => e.stopPropagation());
        bar.addEventListener('wheel', (e) => e.stopPropagation());
        bar.addEventListener('contextmenu', (e) => e.stopPropagation());

        const grip = document.createElement('div');
        grip.style.cssText = `display:flex;align-items:center;justify-content:center;width:18px;height:28px;cursor:grab;color:${p.muted};touch-action:none;`;
        grip.innerHTML = REPLAY_ICONS.grip;
        grip.title = t('Drag to move');
        grip.addEventListener('pointerdown', (e) => this._startDrag(e, grip));

        const selectBtn = this._mkBtn('select', `${REPLAY_ICONS.scissors}<span data-l="select"></span>${REPLAY_ICONS.chevronDown}`, '', (b) => this._openSelectMenu(b));
        const play = this._mkBtn('play', REPLAY_ICONS.play, '', () => c.togglePlay());
        const step = this._mkBtn('step', REPLAY_ICONS.stepForward, '', () => void c.stepForward(1));
        const speed = this._mkBtn('speed', `<span data-l="speed"></span>${REPLAY_ICONS.chevronDown}`, '', (b) => this._openSpeedMenu(b));
        const interval = this._mkBtn('interval', `<span data-l="interval"></span>${REPLAY_ICONS.chevronDown}`, '', (b) => this._openIntervalMenu(b));
        const jump = this._mkBtn('jump', REPLAY_ICONS.jumpRealtime, '', () => void c.stop());
        const close = this._mkBtn('close', REPLAY_ICONS.close, '', () => void c.stop());
        for (const b of [play, step, jump, close]) b.style.padding = '0 6px';

        const time = document.createElement('div');
        time.style.cssText = `padding:0 8px;font:12px -apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif;font-variant-numeric:tabular-nums;color:${p.muted};white-space:nowrap;min-width:104px;text-align:center;`;
        this._timeEl = time;

        const toast = document.createElement('div');
        toast.style.cssText = `position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%);padding:6px 10px;border-radius:6px;background:${p.bg};color:${p.text};border:1px solid ${p.border};box-shadow:${p.shadow};font:12px -apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif;white-space:nowrap;display:none;pointer-events:none;`;
        this._toastEl = toast;

        bar.append(grip, selectBtn, this._sep(), play, step, this._sep(), speed, interval, this._sep(), time, this._sep(), jump, close, toast);
        this._d.root.appendChild(bar);
        this._bar = bar;
    }

    private _setLabel(btn: HTMLButtonElement, key: string, text: string): void {
        const el = btn.querySelector(`[data-l="${key}"]`);
        if (el && el.textContent !== text) el.textContent = text;
    }

    private _setEnabled(btn: HTMLButtonElement, enabled: boolean): void {
        const p = palette(this._theme);
        btn.disabled = !enabled;
        btn.style.opacity = enabled ? '1' : '0.4';
        btn.style.cursor = enabled ? 'pointer' : 'default';
        btn.style.color = enabled ? p.text : p.disabled;
        if (!enabled) btn.style.background = 'transparent';
    }

    private _renderBar(): void {
        const s = this._state;
        const b = this._barBtns;
        if (!this._bar || !b.select) return;
        this._setLabel(b.select, 'select', t('Select bar'));
        b.select.title = t('Select bar');
        b.select.style.color = s.selecting ? ACCENT : palette(this._theme).text;

        const playing = s.playing;
        b.play.innerHTML = playing ? REPLAY_ICONS.pause : REPLAY_ICONS.play;
        b.play.title = `${playing ? t('Pause') : t('Play')} (Shift + ↓)`;
        this._setEnabled(b.play, s.active && s.canStepForward);

        b.step.title = `${t('Step forward')} (Shift + →)`;
        this._setEnabled(b.step, s.active && s.canStepForward);

        this._setLabel(b.speed, 'speed', `${s.speed}x`);
        b.speed.title = t('Replay speed');

        const hasHost = this._d.controller.canIntrabar;
        const intLabel = s.stepInterval ? this._intervalLabel(s.stepInterval) : t('Chart timeframe');
        this._setLabel(b.interval, 'interval', intLabel);
        b.interval.title = hasHost ? t('Update interval') : t('Lower timeframe data is not available');
        this._setEnabled(b.interval, hasHost);

        b.jump.title = t('Jump to real-time');
        b.close.title = t('Close replay');

        if (this._timeEl) {
            const bars = this._d.getBars();
            const last = bars.length > 0 ? bars[bars.length - 1] : null;
            if (s.active && s.notice === REPLAY_NOTICE_NO_DATA_AT_CURSOR && s.cursor !== null) {
                // nothing revealed: show the cursor date (bars are in the same unit as the cursor)
                const unit = s.firstTime !== null ? detectTimeUnit([{ time: s.firstTime }]) : detectTimeUnit(bars);
                this._timeEl.textContent = formatDateTime(s.cursor * unit, this._d.getTimezone());
                this._timeEl.title = t('Replay date');
            } else if (s.active && last) {
                const unit = detectTimeUnit(bars);
                this._timeEl.textContent = formatDateTime(last.time * unit, this._d.getTimezone());
                this._timeEl.title = t('Replay date');
            } else {
                this._timeEl.textContent = s.selecting ? t('Select bar') : '';
            }
        }
    }

    private _intervalLabel(value: string): string {
        return STEP_INTERVALS.find((i) => i.value === value)?.label ?? value;
    }

    private _toast(text: string): void {
        const el = this._toastEl;
        if (!el) return;
        el.textContent = text;
        el.style.display = 'block';
        if (this._toastTimer !== null) clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            if (this._toastEl) this._toastEl.style.display = 'none';
            this._toastTimer = null;
        }, 3500);
    }

    /** Default: bottom-centre of the main pane. After a drag: user position, kept inside the root. */
    private _place(): void {
        const bar = this._bar;
        const pane = this._d.getPaneElement();
        if (!bar || bar.style.display === 'none' || !pane) return;
        const rr = this._d.root.getBoundingClientRect();
        const pr = pane.getBoundingClientRect();
        const w = bar.offsetWidth;
        const h = bar.offsetHeight || BAR_HEIGHT;
        let left: number;
        let top: number;
        if (this._userPos) {
            left = this._userPos.left;
            top = this._userPos.top;
        } else {
            left = pr.left - rr.left + pr.width / 2 - w / 2;
            top = pr.bottom - rr.top - h - 16;
        }
        left = Math.max(0, Math.min(Math.max(0, rr.width - w), left));
        top = Math.max(0, Math.min(Math.max(0, rr.height - h), top));
        bar.style.left = `${Math.round(left)}px`;
        bar.style.top = `${Math.round(top)}px`;
    }

    private _startDrag(e: PointerEvent, grip: HTMLElement): void {
        if (!this._bar) return;
        e.preventDefault();
        e.stopPropagation();
        this._closeMenu();
        const bar = this._bar;
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = bar.offsetLeft;
        const startTop = bar.offsetTop;
        grip.style.cursor = 'grabbing';
        const onMove = (ev: PointerEvent) => {
            this._userPos = { left: startLeft + ev.clientX - startX, top: startTop + ev.clientY - startY };
            this._place();
        };
        const cleanup = () => {
            document.removeEventListener('pointermove', onMove, true);
            document.removeEventListener('pointerup', cleanup, true);
            document.removeEventListener('pointercancel', cleanup, true);
            grip.style.cursor = 'grab';
            this._dragCleanup = null;
        };
        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', cleanup, true);
        document.addEventListener('pointercancel', cleanup, true);
        this._dragCleanup = cleanup;
    }

    // ------------------------------------------------------------------ menus

    private _openMenuAt(anchor: HTMLElement, build: (menu: HTMLElement) => void, minWidth = 160): void {
        if (this._menu && this._menuOwner === anchor) {
            this._closeMenu();
            return;
        }
        this._closeMenu();
        const p = palette(this._theme);
        const root = this._d.root;
        const menu = document.createElement('div');
        menu.className = 'tv-replay-menu';
        menu.style.cssText = `position:absolute;z-index:70;min-width:${minWidth}px;padding:4px 0;border-radius:8px;background:${p.bg};border:1px solid ${p.border};box-shadow:${p.shadow};color:${p.text};font:13px -apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif;user-select:none;visibility:hidden;`;
        menu.addEventListener('mousedown', (e) => e.stopPropagation());
        menu.addEventListener('pointerdown', (e) => e.stopPropagation());
        menu.addEventListener('wheel', (e) => e.stopPropagation());
        build(menu);
        root.appendChild(menu);
        const rr = root.getBoundingClientRect();
        const ar = anchor.getBoundingClientRect();
        let left = ar.left - rr.left;
        left = Math.max(4, Math.min(rr.width - menu.offsetWidth - 4, left));
        let bottom = rr.bottom - ar.top + 6;
        // not enough room above: open below
        if (ar.top - rr.top < menu.offsetHeight + 10) {
            menu.style.top = `${ar.bottom - rr.top + 6}px`;
        } else {
            menu.style.bottom = `${bottom}px`;
        }
        menu.style.left = `${left}px`;
        menu.style.visibility = 'visible';
        this._menu = menu;
        this._menuOwner = anchor;
        document.addEventListener('mousedown', this._onDocDown, true);
        document.addEventListener('keydown', this._onDocKey, true);
    }

    private readonly _onDocDown = (e: MouseEvent): void => {
        const target = e.target as Node | null;
        if (!target) return;
        if (this._menu?.contains(target) || this._menuOwner?.contains(target)) return;
        this._closeMenu();
    };

    private readonly _onDocKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            this._closeMenu();
        }
    };

    private _closeMenu(): void {
        if (!this._menu) return;
        this._menu.remove();
        this._menu = null;
        this._menuOwner = null;
        document.removeEventListener('mousedown', this._onDocDown, true);
        document.removeEventListener('keydown', this._onDocKey, true);
    }

    private _menuItem(menu: HTMLElement, opts: { icon?: string; label: string; checked?: boolean; disabled?: boolean; title?: string; onClick: () => void }): void {
        const p = palette(this._theme);
        const item = document.createElement('div');
        item.setAttribute('role', 'menuitem');
        item.style.cssText = `display:flex;align-items:center;gap:10px;padding:7px 14px 7px 12px;cursor:${opts.disabled ? 'default' : 'pointer'};white-space:nowrap;${opts.disabled ? `color:${p.disabled};` : ''}`;
        const icon = document.createElement('span');
        icon.style.cssText = 'display:flex;width:18px;justify-content:center;flex-shrink:0;';
        icon.innerHTML = opts.icon ?? (opts.checked ? REPLAY_ICONS.check : '');
        const label = document.createElement('span');
        label.style.flex = '1';
        label.textContent = opts.label;
        item.append(icon, label);
        if (opts.title) item.title = opts.title;
        if (!opts.disabled) {
            item.addEventListener('mouseenter', () => (item.style.background = p.hover));
            item.addEventListener('mouseleave', () => (item.style.background = 'transparent'));
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this._closeMenu();
                opts.onClick();
            });
        }
        menu.appendChild(item);
    }

    private _openSelectMenu(anchor: HTMLElement): void {
        const c = this._d.controller;
        this._openMenuAt(anchor, (menu) => {
            this._menuItem(menu, { icon: REPLAY_ICONS.scissors, label: t('Select bar'), onClick: () => c.startSelection() });
            this._menuItem(menu, { icon: REPLAY_ICONS.calendar, label: t('Select date...'), onClick: () => this._openDatePicker(anchor) });
            this._menuItem(menu, { icon: REPLAY_ICONS.first, label: t('First available date'), onClick: () => void c.startFirstAvailable() });
            this._menuItem(menu, { icon: REPLAY_ICONS.shuffle, label: t('Random bar'), onClick: () => void c.startRandom() });
        }, 210);
    }

    private _openSpeedMenu(anchor: HTMLElement): void {
        const c = this._d.controller;
        this._openMenuAt(anchor, (menu) => {
            for (const sp of [...REPLAY_SPEEDS].reverse()) {
                this._menuItem(menu, { label: `${sp}x`, checked: sp === this._state.speed, onClick: () => c.setSpeed(sp) });
            }
        }, 110);
    }

    private _openIntervalMenu(anchor: HTMLElement): void {
        const c = this._d.controller;
        const chartSpec = parseTf(this._d.getTimeframe());
        this._openMenuAt(anchor, (menu) => {
            this._menuItem(menu, { label: t('Chart timeframe'), checked: !this._state.stepInterval, onClick: () => void c.setStepInterval(null) });
            for (const it of STEP_INTERVALS) {
                const spec = parseTf(it.value);
                if (!spec || !chartSpec || approxMs(spec) >= approxMs(chartSpec)) continue;
                this._menuItem(menu, { label: it.label, checked: this._state.stepInterval === it.value, onClick: () => void c.setStepInterval(it.value) });
            }
        }, 170);
    }

    // ------------------------------------------------------------------ date picker

    private _openDatePicker(anchor: HTMLElement): void {
        const c = this._d.controller;
        const s = c.state;
        if (s.firstTime === null || s.lastTime === null) return;
        const unit = detectTimeUnit([{ time: s.firstTime }]);
        const minMs = s.firstTime * unit;
        const maxMs = s.lastTime * unit;
        const tz = this._d.getTimezone();
        const p = palette(this._theme);
        const dark = this._theme === 'dark';

        this._openMenuAt(anchor, (menu) => {
            menu.style.padding = '12px';
            menu.style.display = 'flex';
            menu.style.flexDirection = 'column';
            menu.style.gap = '8px';
            const lastBars = this._d.getBars();
            const refMs = (lastBars.length > 0 ? lastBars[lastBars.length - 1].time : s.lastTime!) * unit;
            const ref = safePartsIn(Math.min(maxMs, Math.max(minMs, refMs)), tz);
            const minP = safePartsIn(minMs, tz);
            const maxP = safePartsIn(maxMs, tz);
            const ds = (q: { y: number; mo: number; d: number }) => `${q.y}-${pad(q.mo)}-${pad(q.d)}`;

            const title = document.createElement('div');
            title.style.cssText = 'font-weight:600;';
            title.textContent = t('Select date');
            const inputCss = `height:28px;padding:0 6px;border-radius:6px;border:1px solid ${p.border};background:${dark ? '#131722' : '#F8F9FA'};color:${p.text};font:13px -apple-system,BlinkMacSystemFont,Roboto,sans-serif;color-scheme:${dark ? 'dark' : 'light'};`;
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:6px;';
            const dateIn = document.createElement('input');
            dateIn.type = 'date';
            dateIn.value = ds(ref);
            dateIn.min = ds(minP);
            dateIn.max = ds(maxP);
            dateIn.style.cssText = inputCss;
            const timeIn = document.createElement('input');
            timeIn.type = 'time';
            timeIn.value = `${pad(ref.h)}:${pad(ref.mi)}`;
            timeIn.style.cssText = inputCss;
            row.append(dateIn, timeIn);

            const range = document.createElement('div');
            range.style.cssText = `font-size:11px;color:${p.muted};`;
            range.textContent = `${t('Available range')}: ${formatDateTime(minMs, tz)} – ${formatDateTime(maxMs, tz)}`;
            const hint = document.createElement('div');
            hint.style.cssText = 'font-size:11px;color:#F7A600;min-height:14px;';

            const parse = (): number | null => {
                const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIn.value);
                if (!dm) return null;
                const tm = /^(\d{2}):(\d{2})/.exec(timeIn.value || '00:00');
                const h = tm ? parseInt(tm[1], 10) : 0;
                const mi = tm ? parseInt(tm[2], 10) : 0;
                return zonedToEpoch(parseInt(dm[1], 10), parseInt(dm[2], 10), parseInt(dm[3], 10), h, mi, tz);
            };
            const updateHint = () => {
                const ms = parse();
                hint.textContent = ms !== null && (ms < minMs || ms > maxMs) ? t('Date is outside the loaded data, it will be clamped.') : '';
            };
            dateIn.addEventListener('input', updateHint);
            timeIn.addEventListener('input', updateHint);
            updateHint();

            const go = document.createElement('button');
            go.type = 'button';
            go.textContent = t('Go');
            go.style.cssText = `height:30px;border:none;border-radius:6px;background:${p.accent};color:#fff;font:600 13px -apple-system,BlinkMacSystemFont,Roboto,sans-serif;cursor:pointer;`;
            go.addEventListener('click', (e) => {
                e.stopPropagation();
                const ms = parse();
                if (ms === null) return;
                const clamped = Math.max(minMs, Math.min(maxMs, ms));
                this._closeMenu();
                const ok = c.start(clamped / unit);
                // the picker closes right away, so the clamp is reported as a transient toast on the control bar
                if (ok && clamped !== ms) {
                    this._toast(t(ms < minMs ? 'Selected date is outside the loaded data; went to the first available bar' : 'Selected date is outside the loaded data; went to the last available bar'));
                }
            });
            menu.append(title, row, range, hint, go);
        }, 250);
    }
}
