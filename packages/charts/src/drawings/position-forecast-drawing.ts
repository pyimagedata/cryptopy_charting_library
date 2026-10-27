/**
 * Pozisyon Tahmini (Position Forecast) araci: positionForecast (2 tik: P1 kaynak = su anki fiyat/zaman, P2 hedef).
 *
 * GORUNUM  P1 -> P2 mavi ok/cizgi + P2'de etiket kutusu (beyaz metin, kutu rengi duruma gore).
 * ETIKET   satir 1: [✓/✕] fiyat degisimi (isaretli, seri hassasiyeti) (yuzde %) tick sayisi
 *          satir 2: bar sayisi, sure (formatDurationMs).
 *          tick = resolvePipSize(sembol, hassasiyet) / 10 (pozisyon araclariyla ayni; 1 pip = 10 tick).
 * DURUM    Gercek barlardan hesaplanir (yuksek/dusuk kesisimi). Hedef P1'in ustundeyse bar.high >= P2.price, altindaysa
 *          bar.low <= P2.price "ulasildi" sayilir. Taranan barlar: P1.time < bar.time <= P2.time (P2'nin bari dahil).
 *            - ulasildiysa            -> success (yesil, ✓)
 *            - ulasilmadi ve son bar P2.time'i gectiyse (son.time > P2.time) -> failure (kirmizi, ✕)
 *            - aksi halde (P2 zamani henuz gecmedi / P2 <= P1 zaman / fiyat esit) -> pending (mavi)
 *          Bar yoksa pending.
 * AYARLAR  color (cizgi), lineWidth, textColor, backgroundColor, successColor, failureColor.
 */

import { SerializedDrawing } from './drawing';
import {
    DrawingSettingsConfig,
    AttributeBarItem,
    SettingsSection,
    createStyleTab,
    createCoordinatesTab,
    createVisibilityTab,
    colorRow,
    lineWidthRow,
} from './drawing-settings-config';
import { VolumeToolBase } from './volume-drawings';
import { VolumeBar } from './volume-tools-common';
import { resolvePipSize, formatDurationMs } from './line-tool-common';
import { fmt, fmtSigned } from './position-common';
import { t } from '../helpers/translations';

const BLUE = '#2962FF';
const WHITE = '#FFFFFF';
const GREEN = '#4CAF50';
const RED = '#F23645';

export type ForecastStatus = 'pending' | 'success' | 'failure';

export const FORECAST_DEFAULTS = {
    textColor: WHITE,
    backgroundColor: BLUE,
    successColor: GREEN,
    failureColor: RED,
};

/** Son iki barin zaman farki (ms); hesaplanamazsa 0. */
export function barIntervalMs(bars: ReadonlyArray<{ time: number }>): number {
    const n = bars.length;
    if (n < 2) return 0;
    const d = bars[n - 1].time - bars[n - 2].time;
    return d > 0 ? d : 0;
}

/** Zamani time'dan buyuk ilk barin indeksi (yoksa bars.length). */
function firstBarAfter(bars: ReadonlyArray<{ time: number }>, time: number): number {
    let lo = 0, hi = bars.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (bars[mid].time <= time) lo = mid + 1; else hi = mid;
    }
    return lo;
}

/** Hedefe ulasildi mi? (bkz. dosya basligi) */
export function evaluateForecast(
    bars: ReadonlyArray<VolumeBar>, p1: { time: number; price: number }, p2: { time: number; price: number }
): ForecastStatus {
    const n = bars.length;
    if (n === 0 || !(p2.time > p1.time) || p2.price === p1.price) return 'pending';
    const up = p2.price > p1.price;
    for (let i = firstBarAfter(bars, p1.time); i < n; i++) {
        const b = bars[i];
        if (b.time > p2.time) break;
        const close = Number(b.close ?? b.value);
        const hi = Number(b.high ?? close);
        const lo = Number(b.low ?? close);
        if (up ? hi >= p2.price : lo <= p2.price) return 'success';
    }
    return bars[n - 1].time > p2.time ? 'failure' : 'pending';
}

export interface ForecastStats {
    priceChange: number;
    percent: number;
    ticks: number;
    pips: number;
    bars: number;
    durationMs: number;
}

export function forecastStats(
    p1: { time: number; price: number }, p2: { time: number; price: number },
    o: { precision: number; symbol?: string; barIntervalMs: number }
): ForecastStats {
    const diff = p2.price - p1.price;
    const pip = resolvePipSize(o.symbol ?? '', o.precision);
    const tick = pip / 10;
    const dur = p2.time - p1.time;
    return {
        priceChange: diff,
        percent: p1.price !== 0 ? (diff / Math.abs(p1.price)) * 100 : 0,
        ticks: tick > 0 ? diff / tick : 0,
        pips: pip > 0 ? diff / pip : 0,
        bars: o.barIntervalMs > 0 ? Math.round(Math.abs(dur) / o.barIntervalMs) : 0,
        durationMs: dur,
    };
}

/** Etiket satirlari; durum ✓/✕ ilk satirin basina eklenir. */
export function forecastLines(s: ForecastStats, precision: number, status: ForecastStatus): string[] {
    const glyph = status === 'success' ? '✓ ' : status === 'failure' ? '✕ ' : '';
    const line1 = `${glyph}${fmtSigned(s.priceChange, precision)} (${fmtSigned(s.percent, 2)}%) ${fmtSigned(s.ticks, 0)} ${t('ticks')}`;
    const line2 = `${fmt(s.bars, 0)} ${t('bars')}, ${formatDurationMs(s.durationMs)}`;
    return [line1, line2];
}

export class PositionForecastDrawing extends VolumeToolBase {
    private _status: ForecastStatus = 'pending';
    private _statusKey = '';

    constructor() {
        super('positionForecast', BLUE, FORECAST_DEFAULTS);
        this.style.lineWidth = 2;
        this.style.textColor = WHITE;
    }

    protected get _defaults() { return FORECAST_DEFAULTS; }
    protected get _limits() { return {}; }
    get requiredPoints(): number { return 2; }

    /** Gercek barlara gore durum (bar sayisi/son bar/noktalar degismedikce onbellekten). */
    getStatus(): ForecastStatus {
        if (this.points.length < 2) return 'pending';
        const key = `${this._barsKey()}|${this.points[0].time}|${this.points[0].price}|${this.points[1].time}|${this.points[1].price}`;
        if (key !== this._statusKey) {
            this._statusKey = key;
            this._status = evaluateForecast(this._bars, this.points[0], this.points[1]);
        }
        return this._status;
    }

    statusColor(): string {
        const s = this.getStatus();
        return s === 'success' ? this.props.successColor : s === 'failure' ? this.props.failureColor : this.props.backgroundColor;
    }

    getSettingsConfig(): DrawingSettingsConfig {
        const sections: SettingsSection[] = [
            { title: 'Line', rows: [colorRow('color', 'Line color'), lineWidthRow('lineWidth', 'Line width')] },
            { title: 'Label', rows: [colorRow('textColor', 'Text color'), colorRow('backgroundColor', 'Background color')] },
            { title: 'Result', rows: [colorRow('successColor', 'Success color'), colorRow('failureColor', 'Failure color')] },
        ];
        return { tabs: [createStyleTab(sections), createCoordinatesTab([]), createVisibilityTab()] };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Line Color' },
            { type: 'color', key: 'backgroundColor', tooltip: 'Background Color' },
            { type: 'lineWidth', key: 'lineWidth', tooltip: 'Line Width' },
        ];
    }

    static fromJSON(data: SerializedDrawing): PositionForecastDrawing {
        const d = new PositionForecastDrawing();
        d._restore(data);
        return d;
    }
}
