// Backtest engine helper library ("bt") injected into every backtest draft by
// compileDraftBacktest (see draft-backtests.js). Lets an LLM-authored script
// write only strategy logic while data access, indicators, fills, costs and
// statistics live here, tested once.
//
// IMPORTANT: createBt must stay ONE fully self-contained function (no
// references to anything outside its own body, no imports) because the
// compiler injects it into the browser via Function.prototype.toString().
// Tests import and call it directly in Node.
//
// ---------------------------------------------------------------------------
// Execution semantics (the contract the tests pin down)
// ---------------------------------------------------------------------------
// * onBar(ctx, i) runs once per bar, after bar i has CLOSED. The strategy may
//   look at bars 0..i only (the engine cannot enforce that for arrays the
//   script indexes itself; indicators here are causal: value[i] depends only
//   on inputs 0..i).
// * Orders placed in onBar(i) fill at open[i+1] (fill:'nextOpen', default) or
//   at close[i] (fill:'close', optimistic). Last order placed in a bar wins.
// * Each bar, in this order: (1) pending order fills at the open, (2) SL/TP of
//   the open position are checked against that bar's O/H/L (including the bar
//   the position was just opened on), (3) onBar runs, (4) equity is marked at
//   the close. setStop/setTarget changes made in onBar(i) act from bar i+1.
// * Long SL fills at min(open, sl) (gap through the stop fills at the open),
//   long TP at max(open, tp); shorts mirrored. If a bar could hit both SL and
//   TP and neither was gapped, `sameBar` decides (default 'sl' = pessimistic).
// * Price basis (run option priceBasis, default data.meta.priceBasis, else
//   'mid'): 'mid' = data are mid prices, ask = px + spread/2, bid = px -
//   spread/2. 'bid' = data are bid prices (typical MT4/MT5 export), ask = px +
//   spread. Longs enter at ask and exit at bid; shorts enter at bid and exit at
//   ask. Long SL/TP trigger on the bid, short SL/TP on the ask (so with 'mid'
//   data the triggers are padded by half the spread).
// * Slippage (price units) is added against you on market fills and stop exits,
//   not on take-profit (limit) exits. Commission is charged per lot per side.
// * riskPct sizing (riskIncludesCosts, default true): lots are sized so a
//   stop-out AT the stop price loses riskPct of balance INCLUDING entry
//   spread/slippage, stop slippage and both commissions. Gaps through the stop
//   can lose more. R-multiples use that same all-in stop loss as 1R.
// * Reversal (buy while short / sell while long) closes, then opens, both at
//   the same fill price. Open position at the end of data closes at the last
//   close with reason 'eod'. Orders placed on the final bar are dropped.
// * A bar counts as "held" if the position was open at any point during it
//   (entry at open: held; exit at open: not held; intrabar SL/TP: held; entry
//   at close: not held). trade.bars, ctx.position.barsHeld, exposure use this.
// * Equity <= 0 closes the position (reason 'wipeout'), floors equity at 0 and
//   halts trading.
export function createBt(g) {
    'use strict';
    const VERSION = '1.0.0';
    const MS_MIN = 60000, MS_H = 3600000, MS_D = 86400000, MS_W = 7 * MS_D;
    const TF_MS = { '1m': MS_MIN, '5m': 5 * MS_MIN, '15m': 15 * MS_MIN, '30m': 30 * MS_MIN, '1h': MS_H, '4h': 4 * MS_H, '1d': MS_D, '1w': MS_W };

    const nanArr = (n) => new Float64Array(n).fill(NaN);
    const isNum = (v) => typeof v === 'number';
    const fmtT = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
    const rnd = (x, d) => (x === null || x === undefined || !Number.isFinite(x) ? null : +x.toFixed(d));

    // ------------------------------------------------------------------ data
    function data() {
        const D = g.__backtestData;
        if (!D || !D.t) throw new Error('bt.data(): no dataset loaded. Pass dataset (+ timeframe/from/to) to load_draft_backtest, or use await bt.chartData().');
        return { t: D.t, o: D.o, h: D.h, l: D.l, c: D.c, v: D.v, meta: D.meta, length: D.t.length };
    }

    async function chartData(opts) {
        const maxBars = (opts && opts.maxBars) || 200000;
        const call = (lookback) => g.window.__agentBridge.handleCommand({ tool: 'get_chart_context', args: { lookback } });
        const probe = await call(1);
        const total = Math.min(probe.totalBars || 1, maxBars);
        const ctx = total > 1 ? await call(total) : probe;
        const bars = ctx.bars || [];
        const n = bars.length;
        const out = { t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n), v: new Float64Array(n) };
        const idx = new Int32Array(n);
        for (let i = 0; i < n; i++) {
            const b = bars[i];
            // chart bar time may be seconds or milliseconds
            out.t[i] = b.time < 1e11 ? b.time * 1000 : b.time;
            out.o[i] = b.open; out.h[i] = b.high; out.l[i] = b.low; out.c[i] = b.close; out.v[i] = b.volume == null ? 0 : b.volume;
            idx[i] = b.barIndex == null ? i : b.barIndex;
        }
        out.meta = { symbol: ctx.symbol, timeframe: ctx.timeframe, count: n, source: 'chart', firstT: n ? out.t[0] : null, lastT: n ? out.t[n - 1] : null };
        out.length = n;
        out.barIndex = idx; // chart bar index per row (for drawing)
        return out;
    }

    function lowerBound(arr, x, lo, hi) {
        lo = lo || 0; hi = hi == null ? arr.length : hi;
        while (lo < hi) { const m = (lo + hi) >>> 1; if (arr[m] < x) lo = m + 1; else hi = m; }
        return lo;
    }

    // Time-window view of a dataset. warmupBars extra bars are included before
    // `fromMs` and exposed as data.startIndex; bt.run() starts trading there.
    function slice(d, fromMs, toMs, warmupBars) {
        if (fromMs != null && toMs != null && toMs < fromMs) throw new Error('bt.slice: toMs (' + fmtT(toMs) + ') is before fromMs (' + fmtT(fromMs) + ').');
        const a = fromMs == null ? 0 : lowerBound(d.t, fromMs);
        const b = toMs == null ? d.t.length : lowerBound(d.t, toMs);
        const w = Math.max(0, a - (warmupBars || 0));
        const cut = (x) => (x.subarray ? x.subarray(w, b) : x.slice(w, b));
        const out = { t: cut(d.t), o: cut(d.o), h: cut(d.h), l: cut(d.l), c: cut(d.c), v: cut(d.v) };
        out.length = b - w;
        out.startIndex = a - w;
        out.meta = Object.assign({}, d.meta, { count: out.length, firstT: out.length ? out.t[0] : null, lastT: out.length ? out.t[out.length - 1] : null });
        return out;
    }

    // ------------------------------------------------------------ indicators
    // Apply fn(from, to) to every maximal run of non-NaN values of x.
    function runs(x, fn) {
        const n = x.length;
        let i = 0;
        while (i < n) {
            while (i < n && Number.isNaN(x[i])) i++;
            if (i >= n) break;
            const s = i;
            while (i < n && !Number.isNaN(x[i])) i++;
            fn(s, i);
        }
    }

    function sma(x, n) {
        const o = nanArr(x.length);
        runs(x, (s, e) => {
            let sum = 0;
            for (let i = s; i < e; i++) {
                sum += x[i];
                if (i - s >= n) sum -= x[i - n];
                if (i - s >= n - 1) o[i] = sum / n;
            }
        });
        return o;
    }

    function recursive(x, n, alpha) {
        const o = nanArr(x.length);
        runs(x, (s, e) => {
            if (e - s < n) return;
            let sum = 0;
            for (let i = s; i < s + n; i++) sum += x[i];
            let prev = sum / n;
            o[s + n - 1] = prev;
            for (let i = s + n; i < e; i++) { prev = alpha * x[i] + (1 - alpha) * prev; o[i] = prev; }
        });
        return o;
    }
    const ema = (x, n) => recursive(x, n, 2 / (n + 1));
    const rma = (x, n) => recursive(x, n, 1 / n);

    function wma(x, n) {
        const o = nanArr(x.length);
        const den = n * (n + 1) / 2;
        runs(x, (s, e) => {
            let S = 0, W = 0;
            for (let i = s; i < e; i++) {
                const k = i - s;
                if (k < n) { S += x[i]; W += x[i] * (k + 1); if (k === n - 1) o[i] = W / den; }
                else { W = W + n * x[i] - S; S = S + x[i] - x[i - n]; o[i] = W / den; }
            }
        });
        return o;
    }

    function stdev(x, n) {
        const o = nanArr(x.length);
        runs(x, (s, e) => {
            const ref = x[s]; // shift for numeric stability
            let S = 0, Q = 0;
            for (let i = s; i < e; i++) {
                const a = x[i] - ref;
                S += a; Q += a * a;
                if (i - s >= n) { const b = x[i - n] - ref; S -= b; Q -= b * b; }
                if (i - s >= n - 1) { const v = Q / n - (S / n) * (S / n); o[i] = Math.sqrt(v > 0 ? v : 0); }
            }
        });
        return o;
    }

    function extreme(x, n, isMax) {
        const o = nanArr(x.length);
        runs(x, (s, e) => {
            const dq = new Int32Array(e - s); let head = 0, tail = 0;
            for (let i = s; i < e; i++) {
                while (tail > head && (isMax ? x[dq[tail - 1]] <= x[i] : x[dq[tail - 1]] >= x[i])) tail--;
                dq[tail++] = i;
                if (dq[head] <= i - n) head++;
                if (i - s >= n - 1) o[i] = x[dq[head]];
            }
        });
        return o;
    }
    const highest = (x, n) => extreme(x, n, true);
    const lowest = (x, n) => extreme(x, n, false);

    function donchian(h, l, n) {
        const upper = highest(h, n), lower = lowest(l, n);
        const mid = new Float64Array(upper.length);
        for (let i = 0; i < mid.length; i++) mid[i] = (upper[i] + lower[i]) / 2;
        return { upper, lower, mid };
    }

    function bollinger(x, n, mult) {
        const mid = sma(x, n), sd = stdev(x, n);
        const upper = new Float64Array(x.length), lower = new Float64Array(x.length);
        const m = mult == null ? 2 : mult;
        for (let i = 0; i < x.length; i++) { upper[i] = mid[i] + m * sd[i]; lower[i] = mid[i] - m * sd[i]; }
        return { mid, upper, lower };
    }

    function tr(d) {
        const n = d.h.length, o = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            const hl = d.h[i] - d.l[i];
            o[i] = i === 0 ? hl : Math.max(hl, Math.abs(d.h[i] - d.c[i - 1]), Math.abs(d.l[i] - d.c[i - 1]));
        }
        return o;
    }
    const atr = (d, n) => rma(tr(d), n == null ? 14 : n);

    function change(x, k) {
        k = k || 1;
        const o = nanArr(x.length);
        for (let i = k; i < x.length; i++) o[i] = x[i] - x[i - k];
        return o;
    }
    function roc(x, k) {
        k = k || 1;
        const o = nanArr(x.length);
        for (let i = k; i < x.length; i++) o[i] = (x[i] / x[i - k] - 1) * 100;
        return o;
    }
    // shift(x, k): value from k bars ago (k >= 0), NaN-padded. Handy for "previous bar's channel".
    function shift(x, k) {
        const o = nanArr(x.length);
        for (let i = k; i < x.length; i++) o[i] = x[i - k];
        return o;
    }

    function rsi(x, n) {
        n = n == null ? 14 : n;
        const len = x.length;
        const gain = nanArr(len), loss = nanArr(len);
        for (let i = 1; i < len; i++) { const c = x[i] - x[i - 1]; gain[i] = c > 0 ? c : 0; loss[i] = c < 0 ? -c : 0; }
        const ag = rma(gain, n), al = rma(loss, n), o = nanArr(len);
        for (let i = 0; i < len; i++) {
            if (Number.isNaN(ag[i]) || Number.isNaN(al[i])) continue;
            o[i] = al[i] === 0 ? (ag[i] === 0 ? 50 : 100) : 100 - 100 / (1 + ag[i] / al[i]);
        }
        return o;
    }

    function macd(x, fast, slow, sig) {
        const f = ema(x, fast || 12), s = ema(x, slow || 26);
        const line = new Float64Array(x.length);
        for (let i = 0; i < x.length; i++) line[i] = f[i] - s[i];
        const signal = ema(line, sig || 9);
        const hist = new Float64Array(x.length);
        for (let i = 0; i < x.length; i++) hist[i] = line[i] - signal[i];
        return { macd: line, signal, hist };
    }

    // 1 where a crosses above b between bar i-1 and i (a[i] > b[i] && a[i-1] <= b[i-1]). a, b: series or number.
    function cross(a, b, up) {
        const n = Math.max(a.length || 0, b.length || 0);
        const o = new Uint8Array(n);
        const A = (i) => (isNum(a) ? a : a[i]);
        const B = (i) => (isNum(b) ? b : b[i]);
        for (let i = 1; i < n; i++) {
            const a0 = A(i - 1), a1 = A(i), b0 = B(i - 1), b1 = B(i);
            o[i] = up ? (a1 > b1 && a0 <= b0 ? 1 : 0) : (a1 < b1 && a0 >= b0 ? 1 : 0);
        }
        return o;
    }
    const crossover = (a, b) => cross(a, b, true);
    const crossunder = (a, b) => cross(a, b, false);

    // ---- New York trading day (starts 17:00 New York), self-contained DST ----
    const dstCache = {};
    function sundayOnOrAfter(y, m0, d) {
        const dt = new Date(Date.UTC(y, m0, d));
        return Date.UTC(y, m0, d + ((7 - dt.getUTCDay()) % 7));
    }
    function nyOff(utc) {
        const y = new Date(utc).getUTCFullYear();
        let w = dstCache[y];
        if (!w) {
            w = y >= 2007
                ? [sundayOnOrAfter(y, 2, 8) + 7 * MS_H, sundayOnOrAfter(y, 10, 1) + 6 * MS_H]
                : [sundayOnOrAfter(y, 3, 1) + 7 * MS_H, sundayOnOrAfter(y, 9, 25) + 6 * MS_H];
            dstCache[y] = w;
        }
        return utc >= w[0] && utc < w[1] ? -4 * MS_H : -5 * MS_H;
    }
    function nyDayKey(t) { return Math.floor((t + nyOff(t) + 7 * MS_H) / MS_D); }

    function vwap(d, opts) {
        const reset = (opts && opts.reset) || '1d';
        const n = d.t.length, o = new Float64Array(n);
        let key = NaN, pv = 0, vv = 0, tp0 = 0, cnt = 0;
        for (let i = 0; i < n; i++) {
            const k = reset === '1d_ny' ? nyDayKey(d.t[i]) : Math.floor(d.t[i] / MS_D);
            if (k !== key) { key = k; pv = 0; vv = 0; tp0 = 0; cnt = 0; }
            const tp = (d.h[i] + d.l[i] + d.c[i]) / 3;
            const vol = d.v[i] > 0 ? d.v[i] : 0;
            pv += tp * vol; vv += vol; tp0 += tp; cnt++;
            o[i] = vv > 0 ? pv / vv : tp0 / cnt; // no volume: plain typical-price mean
        }
        return o;
    }

    // -------------------------------------------------------------- resample
    function bucketOf(t, tf) {
        if (tf === '1d_ny') {
            const day = nyDayKey(t);
            const wallStart = day * MS_D - 7 * MS_H;
            const wallEnd = (day + 1) * MS_D - 7 * MS_H;
            return { start: wallStart - nyOff(wallStart + 5 * MS_H), end: wallEnd - nyOff(wallEnd + 5 * MS_H) };
        }
        if (tf === '1w') { // UTC Monday 00:00
            const start = Math.floor((t - 4 * MS_D) / MS_W) * MS_W + 4 * MS_D;
            return { start, end: start + MS_W };
        }
        const ms = TF_MS[tf];
        const start = Math.floor(t / ms) * ms;
        return { start, end: start + ms };
    }

    function baseMsOf(d, explicit) {
        if (explicit) return explicit;
        const tf = d.meta && d.meta.timeframe;
        if (TF_MS[tf] && tf !== '1w') return TF_MS[tf];
        let best = Infinity;
        for (let i = 1; i < Math.min(d.t.length, 5000); i++) { const df = d.t[i] - d.t[i - 1]; if (df > 0 && df < best) best = df; }
        if (!Number.isFinite(best)) throw new Error('bt.resample: cannot infer base bar duration; pass {baseMs}.');
        return best;
    }

    // Higher-timeframe bars from base bars. htf.align(series) maps an HTF
    // series back onto the base bars with NO look-ahead: at base bar i the
    // value of HTF bar k is visible only once HTF bar k has fully closed (i.e.
    // base bar i closes at/after the HTF bar's end, or a later HTF bucket has
    // started). Until then the previous CLOSED HTF bar's value is shown.
    function resample(d, tf, opts) {
        if (tf !== '1d_ny' && !TF_MS[tf]) throw new Error('bt.resample: unsupported timeframe "' + tf + '" (use 1m,5m,15m,30m,1h,4h,1d,1d_ny,1w).');
        const baseMs = baseMsOf(d, opts && opts.baseMs);
        if (tf !== '1d_ny' && TF_MS[tf] < baseMs) throw new Error('bt.resample: target timeframe is smaller than the base timeframe.');
        const n = d.t.length;
        const hb = [], bucketOfBase = new Int32Array(n), visible = new Int32Array(n);
        let cur = null, curEnd = -1;
        for (let i = 0; i < n; i++) {
            const t = d.t[i];
            if (cur === null || t >= curEnd || t < cur.t) {
                const b = bucketOf(t, tf);
                cur = { t: b.start, end: b.end, o: d.o[i], h: d.h[i], l: d.l[i], c: d.c[i], v: d.v[i] || 0 };
                curEnd = b.end;
                hb.push(cur);
            } else {
                if (d.h[i] > cur.h) cur.h = d.h[i];
                if (d.l[i] < cur.l) cur.l = d.l[i];
                cur.c = d.c[i]; cur.v += d.v[i] || 0;
            }
            const k = hb.length - 1;
            bucketOfBase[i] = k;
            visible[i] = t + baseMs >= curEnd ? k : k - 1;
        }
        const m = hb.length;
        const out = { t: new Float64Array(m), o: new Float64Array(m), h: new Float64Array(m), l: new Float64Array(m), c: new Float64Array(m), v: new Float64Array(m) };
        for (let k = 0; k < m; k++) { out.t[k] = hb[k].t; out.o[k] = hb[k].o; out.h[k] = hb[k].h; out.l[k] = hb[k].l; out.c[k] = hb[k].c; out.v[k] = hb[k].v; }
        out.length = m;
        out.tf = tf;
        out.meta = Object.assign({}, d.meta, { timeframe: tf, count: m });
        out.visibleIndex = visible; // HTF bar index visible at each base bar (-1 = none yet)
        out.align = function (series) {
            const o = nanArr(n);
            for (let i = 0; i < n; i++) { const k = visible[i]; if (k >= 0) o[i] = series[k]; }
            return o;
        };
        return out;
    }

    // ------------------------------------------------------------------- run
    function run(cfg) {
        const d = cfg.data;
        if (!d || !d.t) throw new Error('bt.run: cfg.data is required (bt.data() / bt.chartData() / bt.slice()).');
        if (typeof cfg.onBar !== 'function') throw new Error('bt.run: cfg.onBar(ctx, i) is required.');
        const n = d.t.length;
        const { t, o, h, l, c } = d;
        const costs = Object.assign({ spread: 0, commissionPerLot: 0, slippage: 0 }, cfg.costs);
        const sizing = Object.assign({ mode: 'fixed', lots: 1, riskPct: 1, pct: 100 }, cfg.sizing);
        if (['fixed', 'riskPct', 'notionalPct'].indexOf(sizing.mode) < 0) throw new Error('bt.run: sizing.mode must be fixed|riskPct|notionalPct.');
        const capital = cfg.capital == null ? 10000 : cfg.capital;
        const sym = (d.meta && d.meta.symbol) || '';
        const cs = cfg.contractSize == null ? (/^XAU/i.test(sym) ? 100 : 1) : cfg.contractSize;
        const lotStep = cfg.lotStep == null ? 0.01 : cfg.lotStep;
        const maxLots = cfg.maxLots == null ? 100 : cfg.maxLots;
        const allowShort = cfg.allowShort !== false;
        const pyramiding = !!cfg.pyramiding;
        const fillMode = cfg.fill === 'close' ? 'close' : 'nextOpen';
        const sameBar = cfg.sameBar === 'tp' ? 'tp' : 'sl';
        const sessionFilter = cfg.sessionFilter;
        const out = cfg.output || {};
        const maxTrades = out.maxTrades == null ? 300 : out.maxTrades;
        const riskIncludesCosts = cfg.riskIncludesCosts !== false;
        const basis = cfg.priceBasis || (d.meta && d.meta.priceBasis) || 'mid';
        if (basis !== 'mid' && basis !== 'bid') throw new Error('bt.run: priceBasis must be "mid" or "bid".');
        const maxLevWarn = cfg.maxLeverageWarn == null ? 30 : cfg.maxLeverageWarn;
        const slip = costs.slippage, comm = costs.commissionPerLot;
        // ask = raw + askOff, bid = raw + bidOff. 'mid' data: half spread each way; 'bid' data (typical MT export): ask = bid + spread.
        const askOff = basis === 'bid' ? costs.spread : costs.spread / 2;
        const bidOff = basis === 'bid' ? 0 : -costs.spread / 2;
        const start = Math.min(n, cfg.startIndex != null ? cfg.startIndex : (d.startIndex || 0));

        let balance = capital, pos = null, pending = null, halted = false, wiped = false;
        const trades = [];
        const rej = { stopWrongSide: 0, targetWrongSide: 0, noStopForRisk: 0, tooSmall: 0, session: 0, pyramiding: 0, shortDisabled: 0, halted: 0, droppedOnLastBar: 0 };
        const tot = { spread: 0, slippage: 0, commission: 0 };
        const lev = { over: 0, max: 0 };
        const eq = nanArr(n);
        let curI = start;

        const openPnl = (px) => (pos ? pos.dir * (px - pos.entry) * pos.lots * cs : 0);
        // market price a position of side `dir` EXITS at (pre-slippage): long sells at bid, short buys at ask
        const exitMkt = (dir, raw) => (dir > 0 ? raw + bidOff : raw + askOff);

        const ctx = {
            params: cfg.params || {}, state: {}, data: d, i: start, time: n ? t[Math.min(start, n - 1)] : 0, equity: capital, balance: capital,
            buy(opts) { pending = Object.assign({ type: 'entry', dir: 1 }, opts); },
            sell(opts) { pending = Object.assign({ type: 'entry', dir: -1 }, opts); },
            close(tag) { pending = { type: 'close', tag }; },
            cancel() { pending = null; },
            setStop(p) { if (pos) pos.sl = p == null ? null : p; },
            setTarget(p) { if (pos) pos.tp = p == null ? null : p; },
        };
        Object.defineProperty(ctx, 'position', {
            enumerable: true,
            get() {
                if (!pos) return null;
                return { side: pos.dir > 0 ? 'long' : 'short', lots: pos.lots, entry: pos.entry, sl: pos.sl, tp: pos.tp, barsHeld: pos.bars, openPnl: openPnl(c[curI]), tag: pos.tag };
            },
        });

        // px: bid (long exit) / ask (short exit) price BEFORE slippage; limit exits (take-profit) pay no slippage
        function closePos(px, idx, reason, limit) {
            const exitPx = pos.dir > 0 ? px - (limit ? 0 : slip) : px + (limit ? 0 : slip);
            const gross = pos.dir * (exitPx - pos.entry) * pos.lots * cs;
            const commExit = comm * pos.lots;
            balance += gross - commExit;
            const cSpread = pos.cSpread + (pos.dir > 0 ? -bidOff : askOff) * pos.lots * cs;
            const cSlip = pos.cSlip + (limit ? 0 : slip) * pos.lots * cs;
            const cComm = pos.cComm + commExit;
            tot.spread += cSpread; tot.slippage += cSlip; tot.commission += cComm;
            const pnl = gross - cComm;
            trades.push({
                side: pos.dir > 0 ? 'long' : 'short', entryIdx: pos.entryIdx, exitIdx: idx, entryT: pos.entryT, exitT: t[idx],
                entry: pos.entry, exit: exitPx, lots: pos.lots, pnl, r: pos.riskUsd > 0 ? pnl / pos.riskUsd : null,
                bars: pos.bars, reason, tag: pos.tag, costs: cSpread + cSlip + cComm,
            });
            pos = null;
            if (balance <= 0) { balance = 0; halted = true; wiped = true; } // account cannot go negative
        }

        function processOrder(od, idx, raw) {
            if (od.type === 'close') { if (pos) closePos(exitMkt(pos.dir, raw), idx, 'signal', false); return; }
            const dir = od.dir;
            if (pos) {
                if (pos.dir === dir && !pyramiding) { rej.pyramiding++; return; }
                if (pos.dir !== dir) closePos(exitMkt(pos.dir, raw), idx, 'signal', false);
            }
            if (halted) { rej.halted++; return; }
            if (dir < 0 && !allowShort) { rej.shortDisabled++; return; }
            if (sessionFilter && !sessionFilter(t[idx])) { rej.session++; return; }
            const eff = dir > 0 ? raw + askOff + slip : raw + bidOff - slip;
            const exitRef = exitMkt(dir, raw); // where the position could be closed right now
            const sl = od.sl != null ? od.sl : (od.slDist != null ? raw - dir * od.slDist : null);
            let tp = od.tp != null ? od.tp : (od.tpDist != null ? raw + dir * od.tpDist : null);
            if (tp == null && od.tpR != null && sl != null) tp = raw + dir * od.tpR * Math.abs(raw - sl);
            if (sl != null && dir * (exitRef - sl) <= 0) { rej.stopWrongSide++; return; }
            if (tp != null && dir * (tp - exitRef) <= 0) { rej.targetWrongSide++; return; }
            // loss per lot if stopped out at sl: entry costs + stop slippage + both commissions
            const stopLossPerLot = sl != null ? (dir * (eff - sl) + slip) * cs + 2 * comm : 0;
            let lots;
            if (od.lots != null) lots = od.lots;
            else if (sizing.mode === 'fixed') lots = sizing.lots;
            else if (sizing.mode === 'notionalPct') lots = (balance * sizing.pct / 100) / (raw * cs);
            else {
                if (sl == null) { rej.noStopForRisk++; return; }
                const perLot = riskIncludesCosts ? stopLossPerLot : Math.abs(eff - sl) * cs;
                lots = (balance * sizing.riskPct / 100) / perLot;
            }
            if (lotStep > 0) lots = Math.floor(lots / lotStep + 1e-9) * lotStep;
            if (maxLots) lots = Math.min(lots, maxLots);
            if (!(lots > 0) || (lotStep > 0 && lots < lotStep - 1e-12)) { rej.tooSmall++; return; }
            const riskUsd = lots * stopLossPerLot;
            const eqNow = balance + (pos ? openPnl(raw) : 0);
            const lv = eqNow > 0 ? ((pos ? pos.lots : 0) + lots) * raw * cs / eqNow : Infinity;
            if (lv > lev.max) lev.max = lv;
            if (lv > maxLevWarn) lev.over++;
            const cm = comm * lots;
            balance -= cm;
            const spreadPerLot = (dir > 0 ? askOff : -bidOff) * cs;
            if (pos) { // pyramiding: average into the existing position
                const L = pos.lots + lots;
                pos.entry = (pos.entry * pos.lots + eff * lots) / L;
                pos.lots = L;
                if (sl != null) pos.sl = sl;
                if (tp != null) pos.tp = tp;
                pos.riskUsd += riskUsd;
                pos.cSpread += spreadPerLot * lots; pos.cSlip += slip * lots * cs; pos.cComm += cm;
            } else {
                pos = { dir, lots, entry: eff, sl, tp, entryIdx: idx, entryT: t[idx], riskUsd, tag: od.tag, bars: 0, cSpread: spreadPerLot * lots, cSlip: slip * lots * cs, cComm: cm };
            }
        }

        // SL/TP trigger on the side the position closes at: long on bid, short on ask.
        function checkExits(i) {
            if (!pos) return;
            const dir = pos.dir, sl = pos.sl, tp = pos.tp;
            const off = dir > 0 ? bidOff : askOff;
            const ox = o[i] + off;
            const slHit = sl != null && (dir > 0 ? (ox <= sl || l[i] + off <= sl) : (ox >= sl || h[i] + off >= sl));
            const tpHit = tp != null && (dir > 0 ? (ox >= tp || h[i] + off >= tp) : (ox <= tp || l[i] + off <= tp));
            if (!slHit && !tpHit) return;
            let useSl = slHit;
            if (slHit && tpHit) {
                const slGap = dir > 0 ? ox <= sl : ox >= sl;
                const tpGap = dir > 0 ? ox >= tp : ox <= tp;
                useSl = slGap ? true : (tpGap ? false : sameBar === 'sl');
            }
            if (useSl) closePos(dir > 0 ? Math.min(ox, sl) : Math.max(ox, sl), i, 'sl', false);
            else closePos(dir > 0 ? Math.max(ox, tp) : Math.min(ox, tp), i, 'tp', true);
        }

        if (typeof cfg.init === 'function') cfg.init(ctx);

        for (let i = start; i < n; i++) {
            curI = i;
            if (pending && fillMode === 'nextOpen') { const od = pending; pending = null; processOrder(od, i, o[i]); }
            // a bar counts as held if the position was open at any point during it
            // (entry at open: held; exit at open: not held; intrabar SL/TP exit: held; entry at close: not held)
            if (pos) pos.bars++;
            checkExits(i);
            ctx.i = i; ctx.time = t[i]; ctx.balance = balance; ctx.equity = balance + openPnl(c[i]);
            cfg.onBar(ctx, i);
            if (i === n - 1 && pending) { if (pending.type === 'entry') rej.droppedOnLastBar++; pending = null; } // nothing left to fill it
            if (pending && fillMode === 'close') { const od = pending; pending = null; processOrder(od, i, c[i]); }
            eq[i] = balance + openPnl(c[i]);
            if (eq[i] <= 0 && !halted) {
                halted = true; wiped = true;
                if (pos) closePos(exitMkt(pos.dir, c[i]), i, 'wipeout', false);
                balance = 0; pending = null;
            }
            if (halted) eq[i] = balance + openPnl(c[i]);
            ctx.balance = balance;
            ctx.equity = eq[i];
        }
        if (pos && n > start) { closePos(exitMkt(pos.dir, c[n - 1]), n - 1, 'eod', false); eq[n - 1] = balance; }
        return buildResult({ cfg, d, start, capital, cs, eq, trades, tot, rej, halted, wiped, lev, maxLevWarn, basis, riskIncludesCosts, costs, sizing, balance, maxTrades, out });
    }

    // ------------------------------------------------------------ statistics
    function buildResult(S) {
        const { d, start, capital, eq, trades, tot, rej, halted, wiped, lev, out } = S;
        const ppy = S.cfg.periodsPerYear || 252;
        const t = d.t, n = d.t.length;
        const warnings = [];
        const cnt = trades.length;
        let gw = 0, gl = 0, wins = 0, sumR = 0, nR = 0, barsIn = 0, sumBars = 0, maxWin = 0;
        const side = { long: { trades: 0, wins: 0, net: 0, gw: 0, gl: 0 }, short: { trades: 0, wins: 0, net: 0, gw: 0, gl: 0 } };
        for (const tr_ of trades) {
            if (tr_.pnl > 0) { gw += tr_.pnl; wins++; if (tr_.pnl > maxWin) maxWin = tr_.pnl; } else gl += -tr_.pnl;
            if (tr_.r != null) { sumR += tr_.r; nR++; }
            barsIn += tr_.bars; sumBars += tr_.bars;
            const sd = side[tr_.side];
            sd.trades++; sd.net += tr_.pnl; if (tr_.pnl > 0) { sd.wins++; sd.gw += tr_.pnl; } else sd.gl += -tr_.pnl;
        }
        const PF_CAP = 999; // profit factor with no losing trades is reported as 999 (JSON cannot carry Infinity)
        const pf = (a, b) => (b > 0 ? Math.min(a / b, PF_CAP) : (a > 0 ? PF_CAP : 0));
        const finalEq = n > start ? eq[n - 1] : capital;
        const net = finalEq - capital;
        const spanMs = n > start ? t[n - 1] - t[start] : 0;
        const years = spanMs / (365.25 * MS_D);
        const cagr = years > 0.05 ? (finalEq > 0 ? (Math.pow(finalEq / capital, 1 / years) - 1) * 100 : -100) : null;

        // drawdown + per-year + daily returns in one pass
        let peak = capital, maxDD = 0, maxDDPct = 0, peakT = n > start ? t[start] : 0, maxDDDurMs = 0;
        const yearsMap = new Map();
        const monthEnd = new Map();
        const daily = [];
        let prevDayKey = null, lastEqOfDay = capital, prevDayEq = capital;
        let prevYear = null, prevEq = capital;
        for (let i = start; i < n; i++) {
            const e = eq[i];
            if (e > peak) { if (t[i] - peakT > maxDDDurMs) maxDDDurMs = t[i] - peakT; peak = e; peakT = t[i]; }
            const dd = peak - e;
            if (dd > maxDD) maxDD = dd;
            if (peak > 0 && dd / peak > maxDDPct) maxDDPct = dd / peak;
            const dt = new Date(t[i]);
            const y = dt.getUTCFullYear();
            let ys = yearsMap.get(y);
            if (!ys) { ys = { year: y, startEq: prevYear == null ? capital : prevEq, endEq: e, peak: prevYear == null ? capital : prevEq, maxDD: 0 }; yearsMap.set(y, ys); }
            prevYear = y;
            ys.endEq = e;
            if (e > ys.peak) ys.peak = e;
            if (ys.peak > 0 && (ys.peak - e) / ys.peak > ys.maxDD) ys.maxDD = (ys.peak - e) / ys.peak;
            prevEq = e;
            monthEnd.set(y * 12 + dt.getUTCMonth(), e);
            const dk = Math.floor(t[i] / MS_D);
            if (prevDayKey !== null && dk !== prevDayKey) { daily.push(lastEqOfDay / prevDayEq - 1); prevDayEq = lastEqOfDay; }
            prevDayKey = dk; lastEqOfDay = e;
        }
        if (n > start) { daily.push(lastEqOfDay / prevDayEq - 1); }
        if (n > start && t[n - 1] - peakT > maxDDDurMs) maxDDDurMs = t[n - 1] - peakT;
        let sharpe = null, sortino = null;
        if (daily.length > 2) {
            const m = daily.reduce((a, b) => a + b, 0) / daily.length;
            const v = daily.reduce((a, b) => a + (b - m) * (b - m), 0) / (daily.length - 1);
            const sdv = Math.sqrt(v);
            sharpe = sdv > 0 ? m / sdv * Math.sqrt(ppy) : null;
            const dv = Math.sqrt(daily.reduce((a, b) => a + (b < 0 ? b * b : 0), 0) / daily.length);
            sortino = dv > 0 ? m / dv * Math.sqrt(ppy) : null;
        }
        const tradesByYear = new Map();
        for (const tr_ of trades) {
            const y = new Date(tr_.exitT).getUTCFullYear();
            let o_ = tradesByYear.get(y); if (!o_) { o_ = { trades: 0, wins: 0 }; tradesByYear.set(y, o_); }
            o_.trades++; if (tr_.pnl > 0) o_.wins++;
        }
        const byYear = [...yearsMap.values()].sort((a, b) => a.year - b.year).map((ys) => {
            const ty = tradesByYear.get(ys.year) || { trades: 0, wins: 0 };
            return { year: ys.year, net: rnd(ys.endEq - ys.startEq, 2), pct: rnd((ys.endEq / ys.startEq - 1) * 100, 2), trades: ty.trades, winRate: ty.trades ? rnd(ty.wins / ty.trades * 100, 1) : null, maxDDPct: rnd(ys.maxDD * 100, 2) };
        });
        let monthly;
        if (out.monthly) {
            monthly = {};
            let prev = capital;
            const keys = [...monthEnd.keys()].sort((a, b) => a - b);
            for (const k of keys) {
                const y = Math.floor(k / 12), m = k % 12;
                if (!monthly[y]) monthly[y] = new Array(12).fill(null);
                const e = monthEnd.get(k);
                monthly[y][m] = rnd((e / prev - 1) * 100, 2);
                prev = e;
            }
        }

        const sd = (s) => ({ trades: s.trades, winRate: s.trades ? rnd(s.wins / s.trades * 100, 1) : null, net: rnd(s.net, 2), profitFactor: rnd(pf(s.gw, s.gl), 3) });
        const costsPaid = { spread: rnd(tot.spread, 2), slippage: rnd(tot.slippage, 2), commission: rnd(tot.commission, 2), total: rnd(tot.spread + tot.slippage + tot.commission, 2) };
        const summary = {
            netProfit: rnd(net, 2), netPct: rnd(net / capital * 100, 2), cagr: rnd(cagr, 2), trades: cnt,
            winRate: cnt ? rnd(wins / cnt * 100, 1) : null, profitFactor: rnd(pf(gw, gl), 3),
            avgTrade: cnt ? rnd((gw - gl) / cnt, 2) : null, avgWin: wins ? rnd(gw / wins, 2) : null, avgLoss: cnt - wins ? rnd(-gl / (cnt - wins), 2) : null,
            expectancyR: nR ? rnd(sumR / nR, 3) : null,
            maxDrawdown: rnd(maxDD, 2), maxDrawdownPct: rnd(maxDDPct * 100, 2), maxDDDurationDays: rnd(maxDDDurMs / MS_D, 1),
            sharpe: rnd(sharpe, 3), sortino: rnd(sortino, 3),
            exposurePct: n > start ? rnd(barsIn / (n - start) * 100, 1) : 0, avgBarsHeld: cnt ? rnd(sumBars / cnt, 1) : null,
            long: sd(side.long), short: sd(side.short), costsPaid, finalEquity: rnd(finalEq, 2),
        };

        const sc = S.cfg.costs || {};
        if (!sc.spread && !sc.commissionPerLot && !sc.slippage) warnings.push('No trading costs configured (costs.spread/commissionPerLot/slippage are all 0): results are optimistic.');
        if (cnt < 30) warnings.push('Only ' + cnt + ' trades: statistics are not significant (aim for 100+).');
        if (gw > 0 && maxWin / gw > 0.3 && cnt >= 5) warnings.push('Largest single win is ' + rnd(maxWin / gw * 100, 0) + '% of gross profit: result depends on one trade.');
        if (gw > 0 && costsPaid.total > 0.5 * gw) warnings.push('Costs consume ' + rnd(costsPaid.total / gw * 100, 0) + '% of gross profit.');
        if (nR === 0 && cnt) warnings.push('No trade had a stop-loss: R-multiples/expectancyR unavailable and risk is unbounded.');
        if (wiped) warnings.push("Account wiped out (equity <= 0): position closed with reason 'wipeout', equity floored at 0, trading halted.");
        if (lev.over) warnings.push(lev.over + ' entries exceeded ' + S.maxLevWarn + 'x leverage (notional / equity); max ' + rnd(lev.max, 1) + 'x.');
        if (trades.some((x) => x.reason === 'eod')) warnings.push("A position was still open at the end of data and was closed at the last close (reason 'eod').");
        if (rej.droppedOnLastBar) warnings.push(rej.droppedOnLastBar + ' entry order(s) placed on the final bar were dropped (nothing left to fill them).');
        delete rej.droppedOnLastBar;
        const rejTxt = Object.keys(rej).filter((k) => rej[k] > 0).map((k) => k + '=' + rej[k]);
        if (rejTxt.length) warnings.push('Ignored/rejected orders: ' + rejTxt.join(', ') + '.');
        if (n === 0 || n - start < 2) warnings.push('Too little data.');

        // trades output (compact); full list stays available (non-enumerable) for sweep/plotTrades
        const fmtTrade = (x) => ({
            side: x.side, entryT: fmtT(x.entryT), exitT: fmtT(x.exitT), entry: rnd(x.entry, 5), exit: rnd(x.exit, 5), lots: rnd(x.lots, 2),
            pnl: rnd(x.pnl, 2), r: rnd(x.r, 2), bars: x.bars, reason: x.reason, tag: x.tag,
        });
        let shown;
        if (cnt <= S.maxTrades) shown = trades.map(fmtTrade);
        else {
            const half = Math.floor(S.maxTrades / 2);
            shown = trades.slice(0, half).concat(trades.slice(cnt - (S.maxTrades - half))).map(fmtTrade);
        }
        // equity curve downsample (<= 500 points)
        const ep = [];
        const m = n - start;
        if (m > 0) {
            const step = Math.max(1, Math.ceil(m / 499));
            for (let i = start; i < n; i += step) ep.push([fmtT(t[i]), rnd(eq[i], 2)]);
            if ((m - 1) % step !== 0) ep.push([fmtT(t[n - 1]), rnd(eq[n - 1], 2)]);
        }

        const res = {
            version: VERSION,
            config: {
                symbol: d.meta && d.meta.symbol, timeframe: d.meta && d.meta.timeframe, bars: n - start, from: n > start ? fmtT(t[start]) : null, to: n > start ? fmtT(t[n - 1]) : null,
                capital, contractSize: S.cs, priceBasis: S.basis, riskIncludesCosts: S.riskIncludesCosts, periodsPerYear: ppy, costs: S.costs, sizing: S.sizing, fill: S.cfg.fill === 'close' ? 'close' : 'nextOpen', sameBar: S.cfg.sameBar === 'tp' ? 'tp' : 'sl', params: S.cfg.params || {},
            },
            summary, byYear,
            trades: shown, tradesTotal: cnt, tradesShown: shown.length,
            equity: ep, warnings,
        };
        if (monthly) res.monthly = monthly;
        Object.defineProperty(res, 'allTrades', { value: trades, enumerable: false });
        Object.defineProperty(res, 'equitySeries', { value: eq, enumerable: false });
        return res;
    }

    // ----------------------------------------------------- sweep / walk-forward
    const LOWER_BETTER = { maxDrawdown: 1, maxDrawdownPct: 1, maxDDDurationDays: 1 };
    function metricOf(res, metric) {
        let v = res.summary[metric];
        if (v === undefined) v = res.summary.costsPaid && res.summary.costsPaid[metric];
        return typeof v !== 'number' || !Number.isFinite(v) ? NaN : v;
    }
    function combos(grid, maxCombos) {
        const keys = Object.keys(grid);
        let total = 1;
        for (const k of keys) { if (!Array.isArray(grid[k]) || !grid[k].length) throw new Error('bt.sweep: grid["' + k + '"] must be a non-empty array.'); total *= grid[k].length; }
        if (total > maxCombos) throw new Error('bt.sweep: ' + total + ' combinations exceeds maxCombos=' + maxCombos + '. Shrink the grid (and beware of overfitting).');
        const outp = [];
        const rec = (idx, cur) => {
            if (idx === keys.length) { outp.push(Object.assign({}, cur)); return; }
            for (const v of grid[keys[idx]]) { cur[keys[idx]] = v; rec(idx + 1, cur); }
        };
        rec(0, {});
        return outp;
    }

    // fn(params) must return a bt.run() result. Returns rows sorted best-first.
    async function sweep(grid, fn, opts) {
        const o_ = Object.assign({ metric: 'profitFactor', maxCombos: 500, minTrades: 10, top: 20 }, opts);
        const list = combos(grid, o_.maxCombos);
        const rows = [];
        let few = 0;
        for (const p of list) {
            const r = await fn(p);
            const s = r.summary;
            if (s.trades < o_.minTrades) { few++; continue; }
            rows.push({ params: p, [o_.metric]: metricOf(r, o_.metric), trades: s.trades, netPct: s.netPct, profitFactor: s.profitFactor, maxDrawdownPct: s.maxDrawdownPct, sharpe: s.sharpe });
        }
        rows.sort((a, b) => {
            const x = a[o_.metric], y = b[o_.metric];
            if (Number.isNaN(x) && Number.isNaN(y)) return 0;
            if (Number.isNaN(x)) return 1;
            if (Number.isNaN(y)) return -1;
            if (x === y) return 0;
            return LOWER_BETTER[o_.metric] ? (x < y ? -1 : 1) : (x > y ? -1 : 1);
        });
        return { metric: o_.metric, combos: list.length, skippedFewTrades: few, rows: rows.slice(0, o_.top), note: 'In-sample ranking: expect the best row to overstate real performance (use walkForward / out-of-sample).' };
    }

    function addDur(ms, spec, sign) {
        const m = /^(\d+)\s*(y|m|w|d)$/.exec(String(spec));
        if (!m) throw new Error('Duration must look like "3y", "6m", "8w", "90d": ' + spec);
        const k = +m[1] * sign;
        const dt = new Date(ms);
        if (m[2] === 'y') dt.setUTCFullYear(dt.getUTCFullYear() + k);
        else if (m[2] === 'm') dt.setUTCMonth(dt.getUTCMonth() + k);
        else return ms + k * (m[2] === 'w' ? MS_W : MS_D);
        return dt.getTime();
    }

    // Rolling walk-forward: optimise on `train`, evaluate the winner on the next `test` window, roll by `test`.
    // cfg.run(params, sliceData) must return a bt.run() result using sliceData (keep data.startIndex: bt.run does).
    async function walkForward(cfg) {
        const d = cfg.data;
        const metric = cfg.metric || 'profitFactor';
        const minTrades = cfg.minTrades == null ? 10 : cfg.minTrades;
        const warm = cfg.warmupBars == null ? 500 : cfg.warmupBars;
        const t0 = d.t[0], tEnd = d.t[d.t.length - 1];
        const folds = [];
        for (let k = 0; ; k++) {
            const trainFrom = addDur(t0, cfg.test, k); // anchored: no month-end drift from repeated addition
            const trainTo = addDur(trainFrom, cfg.train, 1);
            const testTo = addDur(trainTo, cfg.test, 1);
            if (testTo > tEnd + MS_D) break;
            const tr_ = slice(d, trainFrom, trainTo);
            const sw = await sweep(cfg.grid, (p) => cfg.run(p, tr_), { metric, maxCombos: cfg.maxCombos || 300, minTrades, top: 1 });
            const best = sw.rows[0];
            if (!best) { folds.push({ train: fmtT(trainFrom).slice(0, 10) + '..' + fmtT(trainTo).slice(0, 10), skipped: 'no parameter set reached ' + minTrades + ' trades in training' }); }
            else {
                const te = slice(d, trainTo, testTo, warm);
                const res = await cfg.run(best.params, te);
                folds.push({
                    train: fmtT(trainFrom).slice(0, 10) + '..' + fmtT(trainTo).slice(0, 10), test: fmtT(trainTo).slice(0, 10) + '..' + fmtT(testTo).slice(0, 10),
                    params: best.params, trainMetric: best[metric], testMetric: metricOf(res, metric), testNetPct: res.summary.netPct, testTrades: res.summary.trades, testMaxDDPct: res.summary.maxDrawdownPct,
                });
            }
        }
        const done = folds.filter((f) => f.test);
        let comp = 1, tm = 0, tmN = 0, prof = 0, tt = 0;
        for (const f of done) { comp *= 1 + f.testNetPct / 100; if (f.testNetPct > 0) prof++; tt += f.testTrades; if (Number.isFinite(f.testMetric)) { tm += f.testMetric; tmN++; } }
        const warnings = [];
        if (!done.length) warnings.push('No complete folds: data span shorter than train + test.');
        return {
            metric, train: cfg.train, test: cfg.test, folds,
            oos: { folds: done.length, profitableFolds: prof, compoundedNetPct: rnd((comp - 1) * 100, 2), avgTestMetric: tmN ? rnd(tm / tmN, 3) : null, totalTestTrades: tt },
            warnings,
        };
    }

    // ------------------------------------------------------------ chart drawing
    // Draws one trendline per trade (entry -> exit; green win / red loss) on the CHART.
    // Only meaningful when the chart shows the same symbol and covers the trade dates;
    // trades outside the loaded chart range are skipped. Uses draw_trendline.
    async function plotTrades(result, opts) {
        const max = (opts && opts.max) || 200;
        const cd = await chartData({ maxBars: (opts && opts.maxBars) || 200000 });
        const all = result.allTrades || [];
        const list = all.slice(Math.max(0, all.length - max));
        const bar = (tm) => {
            const k = lowerBound(cd.t, tm + 1) - 1; // last chart bar with time <= tm
            return k >= 0 && tm <= cd.t[cd.length - 1] + (cd.length > 1 ? cd.t[cd.length - 1] - cd.t[cd.length - 2] : 0) ? cd.barIndex[k] : -1;
        };
        let drawn = 0, skipped = 0;
        for (const x of list) {
            const a = bar(x.entryT), b = bar(x.exitT);
            if (a < 0 || b < 0) { skipped++; continue; }
            await g.window.__agentBridge.handleCommand({
                tool: 'draw_trendline',
                args: { startBarIndex: a, startPrice: x.entry, endBarIndex: b, endPrice: x.exit, color: x.pnl > 0 ? '#26a69a' : '#ef5350', label: (x.r != null ? (x.r >= 0 ? '+' : '') + x.r.toFixed(1) + 'R' : (x.pnl >= 0 ? '+' : '') + x.pnl.toFixed(0)) },
            });
            drawn++;
        }
        return { drawn, skipped, requested: list.length };
    }

    return {
        version: VERSION, data, chartData, slice, run, sweep, walkForward, plotTrades, resample,
        sma, ema, rma, wilder: rma, wma, tr, atr, rsi, stdev, bollinger, highest, lowest, donchian, macd,
        crossover, crossunder, change, roc, shift, vwap, fmtTime: fmtT,
    };
}
