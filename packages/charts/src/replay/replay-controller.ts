import { BarData } from '../model/data';
import { Delegate } from '../helpers/delegate';
import {
    TfSpec,
    TimeUnit,
    aggregateBars,
    approxMs,
    barEnd,
    barIndexContaining,
    detectTimeUnit,
    mergeBarsByTime,
    parseTf,
    revealedCount,
    snapSpeed,
} from './replay-core';

/**
 * Bar replay engine (DOM-free). One controller per ChartWidget (`chartWidget.replay`).
 *
 * - The controller owns a full-data BUFFER while active. ChartWidget.setData() for the primary
 *   series is routed to `interceptData()` which stores the data as the buffer and displays only
 *   the revealed bars (so timeframe / symbol changes keep the replay date).
 * - CURSOR = exclusive end time (same unit as BarData.time). A bar is revealed iff
 *   `bar.time + tfDuration <= cursor`.
 * - Stepping is incremental (adapter.applyTail), never a full setData of the slice.
 * - Intrabar stepping (stepInterval lower than chart TF + host.fetchBars): the cursor advances by
 *   the step interval and a FORMING bar for the current chart-TF bucket is aggregated from the
 *   lower-TF bars closed by the cursor (time + step <= cursor).
 */

export interface ReplayState {
    active: boolean;
    selecting: boolean;
    playing: boolean;
    /** Exclusive end time, same unit as BarData.time. */
    cursor: number | null;
    speed: number;
    stepInterval: string | null;
    canStepForward: boolean;
    firstTime: number | null;
    lastTime: number | null;
    /** Last notice, e.g. 'intrabar-unavailable' (cleared by start/stop/setStepInterval). */
    notice: string | null;
}

export interface ReplayHost {
    /** Stop live feeds for this chart. */
    pauseRealtime(): void;
    /** Reload fresh data + reopen feeds (called by stop()). */
    resumeRealtime(): void | Promise<void>;
    /**
     * Lower-TF bars for intrabar stepping (optional). `from` inclusive / `to` exclusive, in the same
     * unit as BarData.time (ms for the EvoTrading host). Must return bars sorted by time ascending.
     */
    fetchBars?(symbol: string, exchange: string, interval: string, from: number, to: number): Promise<BarData[]>;
}

/** What the controller needs from the chart (implemented by ChartWidget; mocked in tests). */
export interface ReplayChartAdapter {
    /** Currently displayed primary-series data. */
    getBars(): readonly BarData[];
    getTimeframe(): string;
    getSymbol(): string;
    getExchange(): string;
    /** Replace the whole displayed primary series (keeps scroll). */
    setBars(bars: BarData[]): void;
    /** Cheap incremental update: cut the displayed series to `truncateTo` bars, then push `push`. */
    applyTail(truncateTo: number, push: BarData[]): void;
    /** Bring the last bar to the right edge. */
    scrollToRightEdge(): void;
}

export const REPLAY_NOTICE_INTRABAR_UNAVAILABLE = 'intrabar-unavailable';
/** The loaded data of the current symbol / timeframe starts after the replay cursor (nothing to show). */
export const REPLAY_NOTICE_NO_DATA_AT_CURSOR = 'no-data-at-cursor';

interface IntrabarCache {
    key: string;
    from: number;
    to: number;
    bars: BarData[];
}

export class ReplayController {
    /** Injectable for tests. */
    rng: () => number = Math.random;

    private readonly _adapter: ReplayChartAdapter;
    private readonly _stateChange = new Delegate<ReplayState>();
    private _host: ReplayHost | null = null;

    private _active = false;
    private _selecting = false;
    private _playing = false;
    private _speed = 1;
    private _stepInterval: string | null = null;
    private _notice: string | null = null;
    private _cursor: number | null = null;

    private _buffer: BarData[] = [];
    private _unit: TimeUnit = 1;
    private _spec: TfSpec | null = null;

    // what is currently displayed: closed bars buffer[0.._closed) + optional forming bar (always rebuilt on a diff)
    private _closed = 0;
    private _shownOk = false;

    private _timer: ReturnType<typeof setInterval> | null = null;
    private _epoch = 0;
    private _busy = false;
    private _pending = 0;
    private _busyPromise: Promise<void> = Promise.resolve();
    private _formingRefreshing = false;
    /** true while the cursor is driven by another chart (multi-chart sync): no forming bar. */
    private _followed = false;

    private _ib: IntrabarCache | null = null;
    /** Bumped whenever interceptData resets the intrabar cache (symbol / TF change). */
    private _dataVer = 0;
    private _ibPrefetching = false;

    constructor(adapter: ReplayChartAdapter) {
        this._adapter = adapter;
    }

    // ------------------------------------------------------------------ public API

    get onStateChange(): Delegate<ReplayState> {
        return this._stateChange;
    }

    get state(): ReplayState {
        const bars: readonly BarData[] = this._active ? this._buffer : this._adapter.getBars();
        return {
            active: this._active,
            selecting: this._selecting,
            playing: this._playing,
            cursor: this._cursor,
            speed: this._speed,
            stepInterval: this._stepInterval,
            canStepForward: this._active && this._closed < this._buffer.length,
            firstTime: bars.length > 0 ? bars[0].time : null,
            lastTime: bars.length > 0 ? bars[bars.length - 1].time : null,
            notice: this._notice,
        };
    }

    get active(): boolean {
        return this._active;
    }

    /** Cursor in epoch ms (null when not active). */
    get cursorMs(): number | null {
        return this._active && this._cursor !== null ? this._cursor * this._unit : null;
    }

    /**
     * `end` for backend (remote) indicators: epoch ms exclusive, undefined when replay is not active.
     * Backend contract: only bars with open + tf <= end are used.
     */
    remoteEndMs(): number | undefined {
        const ms = this.cursorMs;
        return ms === null ? undefined : ms;
    }

    setHost(host: ReplayHost | null): void {
        this._host = host;
        this._emit();
    }

    /** true when the host can supply lower-timeframe bars (host.fetchBars). */
    get canIntrabar(): boolean {
        return !!this._host?.fetchBars;
    }

    startSelection(): void {
        if (this._selecting) return;
        if (this._playing) this._setPlaying(false);
        this._selecting = true;
        this._emit();
    }

    cancelSelection(): void {
        if (!this._selecting) return;
        this._selecting = false;
        this._emit();
    }

    /** Enter replay so that the last revealed bar is the bar containing `time`. */
    start(time: number): boolean {
        const wasActive = this._active;
        if (!wasActive) {
            const bars = this._adapter.getBars();
            if (bars.length === 0) return false;
            this._buffer = bars.slice();
        }
        this._unit = detectTimeUnit(this._buffer);
        const spec = parseTf(this._adapter.getTimeframe());
        if (!spec || this._buffer.length === 0) {
            if (!wasActive) this._buffer = [];
            return false;
        }
        this._spec = spec;
        const idx = barIndexContaining(this._buffer, time);
        if (idx < 0) return false;

        this._followed = false;
        this._epoch++;
        this._notice = null;
        this._selecting = false;
        this._setPlaying(false, false);
        this._cursor = barEnd(this._buffer[idx].time, spec, this._unit);
        if (!wasActive) {
            this._active = true;
            this._shownOk = false;
            this._ib = null;
            try {
                this._host?.pauseRealtime();
            } catch (e) {
                console.warn('ReplayHost.pauseRealtime failed', e);
            }
        }
        this._present(true);
        this._adapter.scrollToRightEdge();
        this._emit();
        return true;
    }

    startFirstAvailable(): boolean {
        const bars = this._active ? this._buffer : this._adapter.getBars();
        if (bars.length === 0) return false;
        return this.start(bars[0].time);
    }

    startRandom(): boolean {
        const bars = this._active ? this._buffer : this._adapter.getBars();
        if (bars.length === 0) return false;
        const max = Math.max(0, bars.length - 2);
        const idx = Math.min(max, Math.floor(this.rng() * (max + 1)));
        return this.start(bars[idx].time);
    }

    play(): void {
        if (!this._active || this._playing) return;
        if (!(this._closed < this._buffer.length)) return;
        this._followed = false;
        this._setPlaying(true);
    }

    pause(): void {
        if (!this._playing) return;
        this._setPlaying(false);
    }

    togglePlay(): void {
        if (this._playing) this.pause();
        else this.play();
    }

    /**
     * Advance by `n` steps (chart timeframe, or the step interval when intrabar stepping).
     * Synchronous when no fetch is needed; the returned promise resolves when all steps are done.
     */
    stepForward(n = 1): Promise<void> {
        if (!this._active || !(n > 0)) return Promise.resolve();
        this._followed = false;
        this._pending += Math.floor(n);
        if (this._busy) return this._busyPromise;
        this._busyPromise = this._drain();
        return this._busyPromise;
    }

    setSpeed(x: number): void {
        const s = snapSpeed(x);
        if (s === this._speed) return;
        this._speed = s;
        if (this._playing) this._startTimer();
        this._emit();
    }

    /**
     * null = chart timeframe. A timeframe lower than the chart TF needs host.fetchBars, otherwise it is
     * rejected with notice 'intrabar-unavailable' (stepInterval stays null). Resolves true if accepted.
     */
    async setStepInterval(tf: string | null): Promise<boolean> {
        this._notice = null;
        if (tf === null || tf === '') {
            this._stepInterval = null;
            this._ib = null;
            if (this._active) this._present(false);
            this._emit();
            return true;
        }
        if (!parseTf(tf) || (parseTf(tf) as TfSpec).months > 0) {
            this._emit();
            return false;
        }
        const wantsIntrabar = this._spec !== null ? approxMs(parseTf(tf) as TfSpec) < approxMs(this._spec) : true;
        if (wantsIntrabar && !this._host?.fetchBars) {
            this._stepInterval = null;
            this._notice = REPLAY_NOTICE_INTRABAR_UNAVAILABLE;
            this._emit();
            return false;
        }
        this._stepInterval = tf;
        this._ib = null;
        if (this._active && this._cursor !== null && this._intrabar()) {
            // snap the cursor DOWN to the new step grid (never forward: no future data)
            const sd = this._stepDur();
            if (sd > 0) {
                const snapped = Math.floor(this._cursor / sd) * sd;
                if (snapped < this._cursor) this._cursor = snapped;
            }
        }
        const epoch = this._epoch;
        if (this._active && this._intrabar()) {
            // probe right away (first window stays cached for the first step): unsupported source -> immediate feedback
            const ok = await this._probeIntrabar();
            if (epoch !== this._epoch) return true;
            if (!ok) {
                this._stepInterval = null;
                this._ib = null;
                this._notice = REPLAY_NOTICE_INTRABAR_UNAVAILABLE;
                if (this._active) this._present(false);
                this._emit();
                return false;
            }
            await this._ensureForming();
            if (epoch !== this._epoch) return true;
        }
        if (this._active) this._present(false);
        this._emit();
        return true;
    }

    /** Fetch the first lower-TF window; false when the host returned nothing for it. */
    private async _probeIntrabar(): Promise<boolean> {
        if (this._cursor === null || !this._spec) return true;
        this._ibPrepare(this._bucketStart());
        const ib = this._ib;
        if (!ib) return true;
        await this._ibExtend();
        if (this._ib !== ib) return true; // cache reset meanwhile (symbol / TF change): not conclusive
        return ib.bars.length > 0;
    }

    /** Exit replay: restores the full data and calls host.resumeRealtime(). */
    stop(): Promise<void> {
        if (!this._active) {
            if (this._selecting) this.cancelSelection();
            return Promise.resolve();
        }
        this._epoch++;
        this._clearTimer();
        this._playing = false;
        this._selecting = false;
        this._active = false;
        this._cursor = null;
        this._notice = null;
        this._pending = 0;
        this._followed = false;
        const bars = this._buffer;
        this._buffer = [];
        this._ib = null;
        this._closed = 0;
        this._shownOk = false;
        this._adapter.setBars(bars);
        this._emit();
        let result: void | Promise<void>;
        try {
            result = this._host?.resumeRealtime();
        } catch (e) {
            console.warn('ReplayHost.resumeRealtime failed', e);
            return Promise.resolve();
        }
        return Promise.resolve(result).catch((e) => console.warn('ReplayHost.resumeRealtime failed', e));
    }

    /**
     * Called by ChartWidget.setData for the primary series. While active the data becomes the full
     * buffer and only the revealed bars are shown (re-truncation by the cursor). Returns false when
     * not active (caller then applies the data normally).
     */
    interceptData(data: BarData[]): boolean {
        if (!this._active) return false;
        this._buffer = data.slice();
        if (this._buffer.length > 0) this._unit = detectTimeUnit(this._buffer);
        const spec = parseTf(this._adapter.getTimeframe());
        if (spec) this._spec = spec;
        // cursor beyond the end of the new data (should not happen): clamp to the last bar so no garbage is shown
        if (this._spec && this._cursor !== null && this._buffer.length > 0) {
            const lastEnd = barEnd(this._buffer[this._buffer.length - 1].time, this._spec, this._unit);
            if (this._cursor > lastEnd) this._cursor = lastEnd;
        }
        // other symbol / timeframe: lower-TF cache no longer valid (key check also guards it)
        if (this._ib && this._ib.key !== this._ibKey()) {
            this._ib = null;
            this._dataVer++;
        }
        this._present(true);
        if (this._intrabar() && !this._followed) void this._ensureForming();
        this._emit();
        return true;
    }

    /** Live tick/bar arriving while active: goes to the buffer, not the screen (unless it closes a revealed bar). */
    ingestLiveBar(bar: BarData): boolean {
        if (!this._active) return false;
        const last = this._buffer[this._buffer.length - 1];
        if (!last || bar.time > last.time) this._buffer.push({ ...bar });
        else if (bar.time === last.time) this._buffer[this._buffer.length - 1] = { ...bar };
        else return true;
        if (this._spec && this._cursor !== null && revealedCount(this._buffer, this._cursor, this._spec, this._unit) !== this._closed) {
            this._present(false);
            this._emit();
        }
        return true;
    }

    /**
     * Multi-chart sync (used by MultiChartLayout): another chart drives this one to `cursorMs`
     * (epoch ms). Enters replay if needed (host.pauseRealtime is called), shows this chart's own
     * closed bars for that cursor, no forming bar, no timer.
     */
    syncCursor(cursorMs: number): boolean {
        const wasActive = this._active;
        if (!wasActive) {
            const bars = this._adapter.getBars();
            if (bars.length === 0) return false;
            this._buffer = bars.slice();
        }
        const spec = parseTf(this._adapter.getTimeframe());
        if (!spec) {
            if (!wasActive) this._buffer = [];
            return false;
        }
        this._unit = detectTimeUnit(this._buffer);
        this._spec = spec;
        const cursor = cursorMs / this._unit;
        if (wasActive && this._cursor === cursor && this._followed) return true;
        this._followed = true;
        this._selecting = false;
        this._cursor = cursor;
        if (this._playing) this._setPlaying(false, false);
        if (!wasActive) {
            this._active = true;
            this._shownOk = false;
            this._ib = null;
            this._epoch++;
            try {
                this._host?.pauseRealtime();
            } catch (e) {
                console.warn('ReplayHost.pauseRealtime failed', e);
            }
            this._present(true);
            this._adapter.scrollToRightEdge();
        } else {
            this._present(false);
        }
        this._emit();
        return true;
    }

    /**
     * Keyboard shortcuts (called from the chart's keydown handler). Returns true when handled.
     * Esc = cancel selection; Shift+ArrowDown = play/pause and Shift+ArrowRight = step (only while active).
     */
    handleKey(e: { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; preventDefault?: () => void }): boolean {
        if (e.key === 'Escape' && this._selecting) {
            e.preventDefault?.();
            this.cancelSelection();
            return true;
        }
        if (!this._active || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return false;
        if (e.key === 'ArrowDown') {
            e.preventDefault?.();
            this.togglePlay();
            return true;
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault?.();
            void this.stepForward(1);
            return true;
        }
        return false;
    }

    dispose(): void {
        this._epoch++;
        this._clearTimer();
        this._stateChange.destroy();
    }

    // ------------------------------------------------------------------ stepping

    private _drain(): Promise<void> {
        this._busy = true;
        const run = async (): Promise<void> => {
            try {
                while (this._pending > 0 && this._active) {
                    this._pending--;
                    if (!(this._closed < this._buffer.length)) {
                        this._pending = 0;
                        break;
                    }
                    const r = this._stepOnce();
                    if (r) await r;
                }
            } finally {
                this._busy = false;
                this._pending = 0;
            }
            if (this._playing && !(this._closed < this._buffer.length)) this._setPlaying(false);
            else this._emit();
        };
        return run();
    }

    private _stepOnce(): void | Promise<void> {
        if (!this._intrabar()) {
            this._stepChartTf();
            return;
        }
        const c2 = this._locateNext();
        if (c2 !== null) {
            this._moveCursor(c2);
            this._maybePrefetch();
            return;
        }
        return this._stepIntrabarSlow();
    }

    private _stepChartTf(): void {
        if (!this._spec || this._cursor === null) return;
        const k = revealedCount(this._buffer, this._cursor, this._spec, this._unit);
        if (k >= this._buffer.length) return;
        this._moveCursor(barEnd(this._buffer[k].time, this._spec, this._unit));
    }

    private _moveCursor(c: number): void {
        this._cursor = c;
        this._present(false);
        this._emit();
    }

    private async _stepIntrabarSlow(retry = true): Promise<void> {
        const epoch = this._epoch;
        const ver = this._dataVer;
        const spec = this._spec;
        if (!spec || this._cursor === null || !this._host?.fetchBars) {
            this._stepChartTf();
            return;
        }
        const bucketStart = this._bucketStart();
        this._ibPrepare(bucketStart);
        const lastEnd = barEnd(this._buffer[this._buffer.length - 1].time, spec, this._unit);
        for (let i = 0; i < 3; i++) {
            if (this._ib && this._ib.to >= lastEnd && this._ib.bars.length > 0) break; // lower data exhausted
            await this._ibExtend();
            if (epoch !== this._epoch || !this._active) return;
            const c2 = this._locateNext();
            if (c2 !== null) {
                this._moveCursor(c2);
                return;
            }
        }
        if (retry && ver !== this._dataVer) {
            // interceptData reset the cache mid-fetch (symbol / TF change): not "unavailable", retry once
            this._ib = null;
            return this._stepIntrabarSlow(false);
        }
        if (!this._ib || this._ib.bars.length === 0) {
            // host has no lower-TF bars for this range: fall back to chart timeframe
            this._stepInterval = null;
            this._ib = null;
            this._notice = REPLAY_NOTICE_INTRABAR_UNAVAILABLE;
        }
        this._stepChartTf();
    }

    /** Next cursor from cached lower-TF bars: end of the first lower bar closing after the cursor. */
    private _locateNext(): number | null {
        const ib = this._ib;
        if (!ib || ib.key !== this._ibKey() || this._cursor === null) return null;
        const sd = this._stepDur();
        if (sd <= 0) return null;
        const bars = ib.bars;
        let lo = 0;
        let hi = bars.length;
        const limit = this._cursor - sd;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (bars[mid].time <= limit) lo = mid + 1;
            else hi = mid;
        }
        if (lo >= bars.length) return null;
        // the window must be contiguous up to that bar: cache must start at/before the bucket
        if (ib.from > this._bucketStart()) return null;
        return bars[lo].time + sd;
    }

    // ------------------------------------------------------------------ presentation

    private _present(full: boolean): void {
        if (this._cursor === null || !this._spec) return;
        const target = revealedCount(this._buffer, this._cursor, this._spec, this._unit);
        const forming = this._computeForming(target);
        // nothing revealed (data starts after the cursor): flag it so the UI can explain the blank chart
        if (target === 0 && !forming && this._buffer.length > 0) this._notice = REPLAY_NOTICE_NO_DATA_AT_CURSOR;
        else if (this._notice === REPLAY_NOTICE_NO_DATA_AT_CURSOR) this._notice = null;
        if (full || !this._shownOk) {
            const bars = this._buffer.slice(0, target);
            if (forming) bars.push(forming);
            this._adapter.setBars(bars);
        } else {
            const n1 = this._closed;
            let truncateTo: number;
            const push: BarData[] = [];
            if (n1 === target) {
                truncateTo = n1;
                if (forming) push.push(forming);
            } else {
                truncateTo = Math.min(n1, target);
                for (let i = truncateTo; i < target; i++) push.push({ ...this._buffer[i] });
                if (forming) push.push(forming);
            }
            this._adapter.applyTail(truncateTo, push);
        }
        this._closed = target;
        this._shownOk = true;
        this._ibTrim();
    }

    /** Memory: drop lower-TF bars older than the current chart-TF bucket (they are never needed again). */
    private _ibTrim(): void {
        const ib = this._ib;
        if (!ib || ib.bars.length === 0 || this._cursor === null || !this._spec) return;
        const bs = this._bucketStart();
        if (bs <= ib.from || bs > ib.to) return;
        let lo = 0;
        let hi = ib.bars.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (ib.bars[mid].time < bs) lo = mid + 1;
            else hi = mid;
        }
        if (lo > 0) ib.bars = ib.bars.slice(lo);
        ib.from = bs;
    }

    private _computeForming(target: number): BarData | null {
        if (this._followed || !this._intrabar() || this._cursor === null) return null;
        if (target >= this._buffer.length) return null;
        const bucket = this._buffer[target];
        if (bucket.time >= this._cursor) return null;
        if (!this._ibCovers(bucket.time, this._cursor)) return null;
        return aggregateBars(this._ib!.bars, bucket.time, this._cursor, bucket.time, this._stepDur());
    }

    /** Fetch lower-TF bars covering the current forming bucket (if missing) and re-present. */
    private async _ensureForming(): Promise<void> {
        if (this._formingRefreshing || !this._active || this._cursor === null || !this._spec) return;
        if (!this._host?.fetchBars) return;
        const epoch = this._epoch;
        this._formingRefreshing = true;
        try {
            const bucketStart = this._bucketStart();
            if (!this._ibCovers(bucketStart, this._cursor)) {
                this._ibPrepare(bucketStart);
                const sd = this._stepDur();
                // cover [bucketStart, cursor) at least
                let guard = 0;
                while (this._ib && this._ib.to < this._cursor + sd && guard++ < 3) {
                    const before = this._ib.to;
                    await this._ibExtend();
                    if (epoch !== this._epoch || !this._active) return;
                    if (this._ib.to <= before) break;
                }
            }
            if (epoch === this._epoch && this._active) {
                this._present(false);
                this._emit();
            }
        } finally {
            this._formingRefreshing = false;
        }
    }

    // ------------------------------------------------------------------ intrabar cache

    private _intrabar(): boolean {
        if (this._followed || !this._stepInterval || !this._spec || !this._host?.fetchBars) return false;
        const s = parseTf(this._stepInterval);
        if (!s || s.months > 0) return false;
        return approxMs(s) < approxMs(this._spec);
    }

    private _stepDur(): number {
        const s = parseTf(this._stepInterval);
        return s ? s.ms / this._unit : 0;
    }

    private _ibKey(): string {
        return `${this._adapter.getSymbol()}|${this._adapter.getExchange()}|${this._stepInterval}`;
    }

    /** Start time of the chart-TF bucket the cursor is inside (or the cursor itself when on a boundary). */
    private _bucketStart(): number {
        if (this._cursor === null || !this._spec) return 0;
        const k = revealedCount(this._buffer, this._cursor, this._spec, this._unit);
        if (k < this._buffer.length && this._buffer[k].time < this._cursor) return this._buffer[k].time;
        return this._cursor;
    }

    private _ibCovers(from: number, to: number): boolean {
        const ib = this._ib;
        return !!ib && ib.key === this._ibKey() && ib.from <= from && ib.to >= to;
    }

    private _ibPrepare(bucketStart: number): void {
        const key = this._ibKey();
        if (!this._ib || this._ib.key !== key || this._ib.from > bucketStart || this._ib.to < bucketStart) {
            this._ib = { key, from: bucketStart, to: bucketStart, bars: [] };
        }
    }

    private _windowDur(): number {
        const sd = this._stepDur();
        const chart = this._spec ? (this._spec.months > 0 ? this._spec.months * 28 * 86_400_000 : this._spec.ms) / this._unit : sd * 500;
        return Math.min(Math.max(chart * 2, sd * 500), sd * 5000);
    }

    /** Fetch [ib.to, ib.to + window) and merge it into the cache. */
    private async _ibExtend(): Promise<void> {
        const ib = this._ib;
        const host = this._host;
        if (!ib || !host?.fetchBars || !this._stepInterval) return;
        const key = ib.key;
        const from = ib.to;
        const to = from + this._windowDur();
        let bars: BarData[] = [];
        try {
            bars = (await host.fetchBars(this._adapter.getSymbol(), this._adapter.getExchange(), this._stepInterval, from, to)) ?? [];
        } catch (e) {
            console.warn('ReplayHost.fetchBars failed', e);
        }
        if (this._ib !== ib || ib.key !== key) return; // cache was reset meanwhile
        ib.bars = mergeBarsByTime(ib.bars, bars);
        ib.to = to;
    }

    /** Prefetch the next window in the background when the cursor gets close to the cache end. */
    private _maybePrefetch(): void {
        const ib = this._ib;
        if (!ib || this._ibPrefetching || this._cursor === null || !this._spec) return;
        const sd = this._stepDur();
        if (this._cursor + sd * 50 < ib.to) return;
        const lastEnd = barEnd(this._buffer[this._buffer.length - 1].time, this._spec, this._unit);
        if (ib.to >= lastEnd) return;
        this._ibPrefetching = true;
        void this._ibExtend().finally(() => {
            this._ibPrefetching = false;
        });
    }

    // ------------------------------------------------------------------ timer / state

    private _setPlaying(on: boolean, emit = true): void {
        this._playing = on;
        if (on) this._startTimer();
        else this._clearTimer();
        if (emit) this._emit();
    }

    private _startTimer(): void {
        this._clearTimer();
        this._timer = setInterval(() => {
            if (!this._active || !this._playing) return;
            if (this._busy) return; // previous step still fetching: skip this tick
            void this.stepForward(1);
        }, Math.max(10, Math.round(1000 / this._speed)));
    }

    private _clearTimer(): void {
        if (this._timer !== null) {
            clearInterval(this._timer);
            this._timer = null;
        }
    }

    private _emit(): void {
        this._stateChange.fire(this.state);
    }
}
