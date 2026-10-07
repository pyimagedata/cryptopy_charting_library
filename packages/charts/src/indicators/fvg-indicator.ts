// ============================================================================
// Fair Value Gap (FVG) overlay indicator
// ============================================================================
// Tespit backend'de hesaplanır (bkz. remote-compute.ts); burada yalnızca çizilir.
// ============================================================================

import { OverlayIndicator } from './indicator';
import { BarData } from '../model/data';
import { RemoteCompute, RemoteContext, barIndexAtTime, drawAccessNotice } from './remote-compute';

export interface FVGIndicatorOptions {
  name: string;
  bullColor: string;
  bearColor: string;
  fillOpacity: number;
  borderOpacity: number;
  mitigation: 'Touch' | 'Fill';
  mitigationSrc: 'Wick' | 'Close';
  showMitigated: boolean;
  showMidline: boolean;
  showLabels: boolean;
  atrPeriod: number;
  minGapATR: number;
  minGapTicks: number;
  tickSize: number;
  autoTimeframe: boolean;
  dispCutoffMin: number;
  useDisplacement: boolean;
  dispLookback: number;
  dispMult: number;
  bodyRatio: number;
  useSweep: boolean;
  sweepPivotP: number;
  sweepLookback: number;
  highlightLondon: boolean;
  londonStartHour: number;
  londonEndHour: number;
  londonColor: string;
  showTargets: boolean;
  targetRR: number;
  targetColor: string;
  maxBoxes: number;
  lineWidth: number;
  visible: boolean;
}

const FVG_DEFAULTS: FVGIndicatorOptions = {
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
  atrPeriod: 50,
  minGapATR: 0.5,
  minGapTicks: 0,
  tickSize: 0,
  autoTimeframe: true,
  dispCutoffMin: 15,
  useDisplacement: true,
  dispLookback: 20,
  dispMult: 2.0,
  bodyRatio: 0.65,
  useSweep: false,
  sweepPivotP: 3,
  sweepLookback: 4,
  highlightLondon: true,
  londonStartHour: 7,   // UTC
  londonEndHour: 10,    // UTC
  londonColor: '#f0b90b',
  showTargets: true,
  targetRR: 2.0,
  targetColor: '#3b82f6',
  maxBoxes: 40,
  lineWidth: 1,
  visible: true,
};

// Sunucuya giden ayarlar (renk/çizgi ayarları yerelde kalır).
const ALGO_KEYS = [
  'mitigation', 'mitigationSrc', 'atrPeriod', 'minGapATR', 'minGapTicks', 'tickSize', 'autoTimeframe',
  'dispCutoffMin', 'useDisplacement', 'dispLookback', 'dispMult', 'bodyRatio', 'useSweep', 'sweepPivotP', 'sweepLookback',
  // Çizim filtreleri: yanıtı küçültmek için sunucuda da uygulanır.
  'showMitigated', 'maxBoxes',
] as const;

interface FvgGap {
  type: 'Bull' | 'Bear';
  startIndex: number;
  endIndex: number;
  top: number;
  bottom: number;
  mitigated: boolean;
  hour: number;
}

interface RemoteFvg {
  bar_min: number;
  eff_disp: boolean;
  gaps: Array<{
    type: 'Bull' | 'Bear';
    start_time: number;
    end_time: number | null; // null: henüz dokunulmadı (son muma kadar uzanır)
    top: number;
    bottom: number;
    mitigated: boolean;
    hour: number;
  }>;
}

function fvgHexToRgba(hex: string, alpha: number): string {
  let h = String(hex).replace('#', '').trim();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, Number(alpha)))})`;
}
function fvgTFLabel(min: number): string {
  const m = Math.round(min);
  if (m >= 1440) return (m % 1440 === 0 ? String(m / 1440) : (m / 1440).toFixed(1)) + 'd';
  if (m >= 60) return (m % 60 === 0 ? String(m / 60) : (m / 60).toFixed(1)) + 'h';
  return m + 'm';
}

export class FVGIndicator extends OverlayIndicator {
  private _opt: FVGIndicatorOptions;
  private _gaps: FvgGap[] = [];
  private _barMin = 0;
  private _effDisp: boolean;
  private _raw: RemoteFvg | null = null;
  private readonly _remote = new RemoteCompute<RemoteFvg>('fvg', (raw) => {
    this._raw = raw;
    this._rebuild();
  });

  constructor(options: Partial<FVGIndicatorOptions> = {}) {
    const merged = { ...FVG_DEFAULTS, ...options, name: options.name || FVG_DEFAULTS.name };
    super(merged);
    this._opt = { ...FVG_DEFAULTS, ...this._options } as FVGIndicatorOptions;
    this._effDisp = this._opt.useDisplacement;
  }
  protected _getAllOptions(): Record<string, any> { return { ...this._opt }; }
  setContext(ctx: RemoteContext): void { this._remote.setContext(ctx); }
  updateOptions(newOptions: Record<string, any>): boolean {
    const n: Record<string, any> = { ...newOptions };
    (['fillOpacity','borderOpacity','atrPeriod','minGapATR','minGapTicks','tickSize','dispCutoffMin','dispLookback','dispMult','bodyRatio','sweepPivotP','sweepLookback','londonStartHour','londonEndHour','targetRR','maxBoxes','lineWidth'] as const).forEach((k) => { if (n[k] !== undefined) n[k] = Number(n[k]); });
    Object.assign(this._opt, n); Object.assign(this._options, n);
    if (this._dataChanged && this._dataChanged.fire) this._dataChanged.fire();
    return true;
  }
  setSettingValue(key: string, value: any): boolean {
    this.updateOptions({ [key]: value });
    if (this._sourceData && this._sourceData.length > 0) this.calculate(this._sourceData);
    return true;
  }
  calculate(sourceData: BarData[]): void {
    this._sourceData = sourceData;
    const params: Record<string, unknown> = {};
    for (const key of ALGO_KEYS) params[key] = this._opt[key];
    this._remote.request(params, () => this._dataChanged.fire());
    this._rebuild();
  }
  /** Ham (zaman damgalı) sonucu mevcut mum dizisinin index'lerine çevirir. */
  private _rebuild(): void {
    const data = this._sourceData;
    this._gaps = [];
    this._data = data.map((b) => ({ time: b.time, value: NaN }));
    if (!this._raw || data.length === 0) return;

    this._barMin = this._raw.bar_min;
    this._effDisp = this._raw.eff_disp;
    const last = data.length - 1;
    for (const g of this._raw.gaps) {
      const startIndex = barIndexAtTime(data, g.start_time);
      const endIndex = g.end_time === null ? last : barIndexAtTime(data, g.end_time);
      if (startIndex < 0 || endIndex < 0) continue;
      this._gaps.push({ type: g.type, startIndex, endIndex, top: g.top, bottom: g.bottom, mitigated: g.mitigated, hour: g.hour });
    }
  }
  destroy(): void {
    this._remote.destroy();
    super.destroy();
  }
  getRange(): { min: number; max: number } {
    if (!this._sourceData || this._sourceData.length === 0) return { min: 0, max: 100 };
    let min = Infinity, max = -Infinity;
    for (const bar of this._sourceData) { if (bar.low < min) min = bar.low; if (bar.high > max) max = bar.high; }
    return { min, max };
  }
  getDescription(): string {
    const open = this._gaps.filter((g) => !g.mitigated).length;
    const tf = this._opt.autoTimeframe ? `auto ${fvgTFLabel(this._barMin)}, disp ${this._effDisp ? 'ON' : 'OFF'}` : `disp ${this._effDisp ? 'ON' : 'OFF'}`;
    const sweep = this._opt.useSweep ? ', sweep ON' : '';
    return `FVG [${tf}${sweep}] (${this._gaps.length} total, ${open} open)`;
  }
  drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
    if (this._remote.denied !== null) {
            drawAccessNotice(ctx, hpr, vpr, this._remote, this._opt.name);
            return;
        }
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

      // 1:2 hedef çizgisi (henüz dokunulmamış bölgeler): giriş = yakın kenar, stop = uzak kenar
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
