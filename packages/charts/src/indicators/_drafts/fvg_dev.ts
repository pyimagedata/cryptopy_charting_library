// ============================================================================
// Fair Value Gap (FVG) overlay indicator — timeframe-adaptive, data-validated
// ============================================================================
//
// Detects 3-candle imbalances and draws them as zones (boxes):
//   Bullish FVG at bar i:  low[i] > high[i-2]   -> zone [high[i-2] .. low[i]]
//   Bearish FVG at bar i:  high[i] < low[i-2]   -> zone [high[i]   .. low[i-2]]
//
// ---------------------------------------------------------------------------
// WHY THESE FILTERS  (1R backtests on XAUUSD, ~5,000-7,500 bars per timeframe)
// ---------------------------------------------------------------------------
// Trading EVERY FVG loses on every timeframe: ~38-43% win, ~-0.20R. So we filter.
//
//   1) CORE  gap/ATR >= 0.5   -> UNIVERSAL. ~59-65% win on 1m,5m,15m,1h,4h,1d.
//      ATR PERIOD = 50 (spike-resistant): a short ATR(14) spikes in fast moves and
//      wrongly suppresses valid impulse gaps (a 30pt gap read 0.42 on ATR14, 0.70 on ATR50).
//   2) DISPLACEMENT (mid range >= 2.0*avgRange AND body/range >= 0.65)
//      -> helps only on 15m+. HURTS on 1m/5m (noise). autoTimeframe: <15min OFF, >=15min ON.
//
//   BEST STRUCTURE (from the whole study): trade the drawn zone DIRECTLY (confirmation
//   models CISD/engulfing/pin/IFVG did NOT beat direct entry at large sample), aim 1:2 R:R
//   (core FVG + direct + 1:2 = 50% win, +0.50R, n=80), prefer 1h/4h, favor London-session
//   zones (~71% vs NY ~59%). Killzone/sweep/bias are CONTEXT to read by eye, not hard filters.
//
//   VISUAL AIDS (added): London-session zones highlighted (gold border); open zones get a
//   dashed 1:2 target line (entry = near edge, stop = far edge = the box itself).
//
//   NOT included (tested, rejected): BOS (overlaps displacement), Premium/Discount & EMA-trend
//   (~0 effect), confirmation entry models (small-sample mirage), killzone as a hard filter (+2pp only).
// ============================================================================

const FVG_DEFAULTS = {
  name: 'Fair Value Gap',
  bullColor: '#26a69a',
  bearColor: '#ef5350',
  fillOpacity: 0.16,
  borderOpacity: 0.6,
  mitigation: 'Touch',
  mitigationSrc: 'Wick',
  showMitigated: true,
  showMidline: false,
  showLabels: false,
  // core size filter (universal) — ATR50 baseline is spike-resistant (see header)
  atrPeriod: 50,
  minGapATR: 0.5,
  minGapTicks: 0,
  tickSize: 0,
  // timeframe adaptivity
  autoTimeframe: true,
  dispCutoffMin: 15,
  // displacement filter
  useDisplacement: true,
  dispLookback: 20,
  dispMult: 2.0,
  bodyRatio: 0.65,
  // liquidity sweep filter (optional; best on 1h/4h)
  useSweep: false,
  sweepPivotP: 3,
  sweepLookback: 4,
  // London-session highlight (gold border for zones formed in London KZ)
  highlightLondon: true,
  londonStartHour: 7,   // UTC (~02:00 NY) — London killzone, gold's prime session
  londonEndHour: 10,    // UTC
  londonColor: '#f0b90b',
  // 1:2 target line on open (unmitigated) zones
  showTargets: true,
  targetRR: 2.0,
  targetColor: '#3b82f6',
  // draw
  maxBoxes: 40,
  lineWidth: 1,
};

function fvgHexToRgba(hex, alpha) {
  let h = String(hex).replace('#', '').trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, Number(alpha)))})`;
}
function fvgEstimateTick(data) {
  let m = Infinity;
  for (let i = 1; i < Math.min(data.length, 200); i++) {
    const d = Math.abs(data[i].close - data[i - 1].close);
    if (d > 0 && d < m) m = d;
  }
  return m === Infinity ? 0.01 : m;
}
function fvgComputeATR(data, period) {
  const n = data.length, tr = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const h = data[i].high, l = data[i].low;
    tr[i] = i === 0 ? h - l : Math.max(h - l, Math.abs(h - data[i - 1].close), Math.abs(l - data[i - 1].close));
  }
  const atr = new Array(n).fill(NaN); let s = 0;
  for (let i = 0; i < n; i++) { s += tr[i]; if (i >= period) s -= tr[i - period]; atr[i] = s / Math.min(i + 1, period); }
  return atr;
}
function fvgComputeAvgRange(data, period) {
  const n = data.length, rng = new Array(n);
  for (let i = 0; i < n; i++) rng[i] = data[i].high - data[i].low;
  const avg = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - period); j < i; j++) { s += rng[j]; c++; }
    avg[i] = c > 0 ? s / c : rng[i];
  }
  return avg;
}
function fvgDetectBarMinutes(data) {
  const n = data.length; if (n < 3) return 0;
  const d = [];
  for (let i = 1; i < n; i++) { const dt = (data[i].time - data[i - 1].time) / 60000; if (dt > 0) d.push(dt); }
  if (!d.length) return 0;
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}
function fvgTFLabel(min) {
  const m = Math.round(min);
  if (m >= 1440) return (m % 1440 === 0 ? (m / 1440) : (m / 1440).toFixed(1)) + 'd';
  if (m >= 60) return (m % 60 === 0 ? (m / 60) : (m / 60).toFixed(1)) + 'h';
  return m + 'm';
}
// running last CONFIRMED swing high/low available at each bar (fractal, half-width P)
function fvgSwings(data, P) {
  const n = data.length;
  const H = data.map(b => b.high), L = data.map(b => b.low);
  const lastSH = new Array(n).fill(NaN), lastSL = new Array(n).fill(NaN);
  const isSH = new Array(n).fill(false), isSL = new Array(n).fill(false);
  for (let k = P; k < n - P; k++) {
    let hi = true, lo = true;
    for (let m = k - P; m <= k + P; m++) {
      if (m === k) continue;
      if (H[m] >= H[k]) hi = false;
      if (L[m] <= L[k]) lo = false;
    }
    isSH[k] = hi; isSL[k] = lo;
  }
  let cH = NaN, cL = NaN;
  for (let i = 0; i < n; i++) {
    const kc = i - P;
    if (kc >= 0 && isSH[kc]) cH = H[kc];
    if (kc >= 0 && isSL[kc]) cL = L[kc];
    lastSH[i] = cH; lastSL[i] = cL;
  }
  return { lastSH, lastSL };
}

class FVGIndicator extends OverlayIndicator {
  constructor(options = {}) {
    const merged = { ...FVG_DEFAULTS, ...options, name: options.name || FVG_DEFAULTS.name };
    super(merged);
    this._opt = { ...FVG_DEFAULTS, ...this._options };
    this._gaps = [];
    this._barMin = 0;
    this._effDisp = this._opt.useDisplacement;
  }
  _getAllOptions() { return { ...this._opt }; }
  updateOptions(newOptions) {
    const n = { ...newOptions };
    ['fillOpacity','borderOpacity','atrPeriod','minGapATR','minGapTicks','tickSize','dispCutoffMin','dispLookback','dispMult','bodyRatio','sweepPivotP','sweepLookback','londonStartHour','londonEndHour','targetRR','maxBoxes','lineWidth'].forEach((k) => { if (n[k] !== undefined) n[k] = Number(n[k]); });
    Object.assign(this._opt, n); Object.assign(this._options, n);
    if (this._dataChanged && this._dataChanged.fire) this._dataChanged.fire();
    return true;
  }
  setSettingValue(key, value) {
    this.updateOptions({ [key]: value });
    if (this._sourceData && this._sourceData.length > 0) this.calculate(this._sourceData);
    return true;
  }
  calculate(sourceData) {
    this._sourceData = sourceData; this._gaps = [];
    const n = sourceData.length;
    this._data = sourceData.map((b) => ({ time: b.time, value: NaN }));
    if (n < 3) return;

    this._barMin = fvgDetectBarMinutes(sourceData);
    if (this._opt.autoTimeframe) this._effDisp = this._barMin > 0 && this._barMin >= this._opt.dispCutoffMin;
    else this._effDisp = !!this._opt.useDisplacement;

    let tick = this._opt.tickSize; if (!tick || tick <= 0) tick = fvgEstimateTick(sourceData);
    const tickFloor = Math.max(0, this._opt.minGapTicks) * tick;
    const atr = fvgComputeATR(sourceData, Math.max(1, Math.round(this._opt.atrPeriod)));
    const avgRange = fvgComputeAvgRange(sourceData, Math.max(1, Math.round(this._opt.dispLookback)));
    const H = sourceData.map(b => b.high), L = sourceData.map(b => b.low), C = sourceData.map(b => b.close);

    let sw = null;
    if (this._opt.useSweep) sw = fvgSwings(sourceData, Math.max(1, Math.round(this._opt.sweepPivotP)));
    const swLB = Math.max(1, Math.round(this._opt.sweepLookback));

    for (let i = 2; i < n; i++) {
      const c0 = sourceData[i - 2], c2 = sourceData[i];
      const atrFloor = (this._opt.minGapATR > 0 && isFinite(atr[i])) ? this._opt.minGapATR * atr[i] : 0;
      const minGap = Math.max(tickFloor, atrFloor);
      let type = null, top = 0, bottom = 0;
      if (c2.low > c0.high) { type = 'Bull'; bottom = c0.high; top = c2.low; }
      else if (c2.high < c0.low) { type = 'Bear'; bottom = c2.high; top = c0.low; }
      if (!type) continue;
      if (top - bottom < minGap) continue;

      if (this._effDisp) {
        const mid = sourceData[i - 1];
        const range = mid.high - mid.low; if (range <= 0) continue;
        const body = Math.abs(mid.close - mid.open);
        const avg = isFinite(avgRange[i - 1]) && avgRange[i - 1] > 0 ? avgRange[i - 1] : range;
        if (!(range >= this._opt.dispMult * avg && (body / range) >= this._opt.bodyRatio)) continue;
      }

      if (this._opt.useSweep && sw) {
        let ok = false;
        const lo0 = Math.max(0, i - swLB);
        if (type === 'Bull') {
          const ref = sw.lastSL[i - 2];
          if (isFinite(ref)) {
            let mn = Infinity; for (let j = lo0; j < i; j++) if (L[j] < mn) mn = L[j];
            ok = mn < ref && C[i] > ref;
          }
        } else {
          const ref = sw.lastSH[i - 2];
          if (isFinite(ref)) {
            let mx = -Infinity; for (let j = lo0; j < i; j++) if (H[j] > mx) mx = H[j];
            ok = mx > ref && C[i] < ref;
          }
        }
        if (!ok) continue;
      }

      this._gaps.push(this._buildGap(type, i, top, bottom, sourceData));
    }
  }
  _buildGap(type, formIdx, top, bottom, data) {
    const n = data.length, startIndex = formIdx - 1;
    const useClose = this._opt.mitigationSrc === 'Close', full = this._opt.mitigation === 'Fill';
    const hour = Math.floor((data[formIdx].time / 3600000) % 24); // UTC hour of formation
    let endIndex = n - 1, mitigated = false;
    for (let j = formIdx + 1; j < n; j++) {
      const bar = data[j]; let hit = false;
      if (type === 'Bull') { const p = useClose ? bar.close : bar.low; hit = full ? p <= bottom : p <= top; }
      else { const p = useClose ? bar.close : bar.high; hit = full ? p >= top : p >= bottom; }
      if (hit) { endIndex = j; mitigated = true; break; }
    }
    return { type, startIndex, endIndex, top, bottom, mitigated, hour };
  }
  getRange() {
    if (!this._sourceData || this._sourceData.length === 0) return { min: 0, max: 100 };
    let min = Infinity, max = -Infinity;
    for (const bar of this._sourceData) { if (bar.low < min) min = bar.low; if (bar.high > max) max = bar.high; }
    return { min, max };
  }
  getDescription() {
    const open = this._gaps.filter((g) => !g.mitigated).length;
    const tf = this._opt.autoTimeframe ? `auto ${fvgTFLabel(this._barMin)}, disp ${this._effDisp ? 'ON' : 'OFF'}` : `disp ${this._effDisp ? 'ON' : 'OFF'}`;
    const sweep = this._opt.useSweep ? ', sweep ON' : '';
    return `FVG [${tf}${sweep}] (${this._gaps.length} total, ${open} open)`;
  }
  drawOverlay(ctx, timeScale, priceScale, hpr, vpr) {
    if (!this._sourceData || this._sourceData.length === 0 || this._gaps.length === 0) return;
    let gaps = this._gaps;
    if (!this._opt.showMitigated) gaps = gaps.filter((g) => !g.mitigated);
    if (this._opt.maxBoxes > 0 && gaps.length > this._opt.maxBoxes) gaps = gaps.slice(gaps.length - this._opt.maxBoxes);
    const lonA = this._opt.londonStartHour, lonB = this._opt.londonEndHour;
    for (const g of gaps) {
      const isBull = g.type === 'Bull';
      const base = isBull ? this._opt.bullColor : this._opt.bearColor;
      const fill = fvgHexToRgba(base, g.mitigated ? this._opt.fillOpacity * 0.5 : this._opt.fillOpacity);
      const isLondon = this._opt.highlightLondon && g.hour >= lonA && g.hour < lonB;
      const border = isLondon
        ? fvgHexToRgba(this._opt.londonColor, Math.max(this._opt.borderOpacity, 0.85))
        : fvgHexToRgba(base, this._opt.borderOpacity);
      const bw = (isLondon ? this._opt.lineWidth * 2 : this._opt.lineWidth) * hpr;

      const x1 = timeScale.indexToCoordinate(g.startIndex) * hpr;
      const x2 = timeScale.indexToCoordinate(g.endIndex) * hpr;
      const yTop = priceScale.priceToCoordinate(g.top) * vpr;
      const yBot = priceScale.priceToCoordinate(g.bottom) * vpr;
      const left = Math.min(x1, x2), width = Math.max(1, Math.abs(x2 - x1));
      const topY = Math.min(yTop, yBot), height = Math.max(1, Math.abs(yBot - yTop));

      ctx.save();
      ctx.fillStyle = fill; ctx.fillRect(left, topY, width, height);
      ctx.strokeStyle = border; ctx.lineWidth = bw; ctx.setLineDash([]);
      ctx.strokeRect(left, topY, width, height);

      if (this._opt.showMidline) {
        const mid = priceScale.priceToCoordinate((g.top + g.bottom) / 2) * vpr;
        ctx.beginPath(); ctx.setLineDash([3 * hpr, 3 * hpr]); ctx.moveTo(left, mid); ctx.lineTo(left + width, mid); ctx.stroke(); ctx.setLineDash([]);
      }

      // 1:2 target line for OPEN (unmitigated) zones: entry = near edge, stop = far edge (box)
      if (this._opt.showTargets && !g.mitigated && this._opt.targetRR > 0) {
        const risk = g.top - g.bottom;
        const entry = isBull ? g.top : g.bottom;
        const targetPrice = isBull ? entry + this._opt.targetRR * risk : entry - this._opt.targetRR * risk;
        const ty = priceScale.priceToCoordinate(targetPrice) * vpr;
        ctx.strokeStyle = fvgHexToRgba(this._opt.targetColor, 0.9);
        ctx.lineWidth = this._opt.lineWidth * hpr;
        ctx.setLineDash([5 * hpr, 4 * hpr]);
        ctx.beginPath(); ctx.moveTo(left, ty); ctx.lineTo(left + width, ty); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = fvgHexToRgba(this._opt.targetColor, 1);
        ctx.font = `bold ${9 * hpr}px sans-serif`;
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(`TP 1:${this._opt.targetRR}`, left + width - 3 * hpr, ty - 2 * hpr);
      }

      if (this._opt.showLabels) {
        ctx.fillStyle = border; ctx.font = `bold ${9 * hpr}px sans-serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText((isBull ? 'FVG +' : 'FVG -') + (isLondon ? ' (LDN)' : ''), left + 3 * hpr, topY + height / 2);
      }
      ctx.restore();
    }
  }
}

globalThis.__draftIndicatorClass = FVGIndicator;
