import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import { RemoteCompute, RemoteContext, barIndexAtTime, drawAccessNotice } from './remote-compute';

// Trendline'lar backend'de hesaplanır (bkz. remote-compute.ts); burada yalnızca çizilir.
interface RemoteTrendlines {
    lines: Array<{
        kind: 'high' | 'low';
        historical: boolean;
        projects: boolean; // güncel muma kadar uzatılır
        slope: number; // mum başına fiyat değişimi
        from: { time: number; price: number };
        to: { time: number; price: number };
    }>;
}
import {
    IndicatorSettingsConfig,
    createInputsTab,
    createStyleTab,
    createVisibilityTab,
    numberRow,
    colorRow,
    checkboxRow,
    lineWidthRow,
} from '../gui/indicator_settings';

interface TrendlineProjectionPoint {
    index: number;
    time: number;
    price: number;
}

interface TrendlineCandidate {
    kind: 'high' | 'low';
    from: TrendlineProjectionPoint;
    to: TrendlineProjectionPoint;
    projection: TrendlineProjectionPoint;
    historical: boolean;
}

export interface ZigZagTrendlineIndicatorOptions extends IndicatorOptions {
    period: number;
    pivotCount: number;
    showHistory: boolean;
    highColor: string;
    lowColor: string;
}

const defaultTrendlineOptions: Partial<ZigZagTrendlineIndicatorOptions> = {
    name: 'Trendline',
    style: IndicatorStyle.Line,
    color: '#f59e0b',
    lineWidth: 2,
    period: 15,
    pivotCount: 2,
    showHistory: false,
    highColor: '#22c55e',
    lowColor: '#ef4444',
};

export class ZigZagTrendlineIndicator extends OverlayIndicator {
    private _trendlineOptions: ZigZagTrendlineIndicatorOptions;
    private _lines: TrendlineCandidate[] = [];
    private _raw: RemoteTrendlines | null = null;
    private readonly _remote = new RemoteCompute<RemoteTrendlines>('zigzag-trendline', (raw) => {
        this._raw = raw;
        this._rebuild();
    });

    constructor(options: Partial<ZigZagTrendlineIndicatorOptions> = {}) {
        const normalizedOptions = _normalizeLegacyTrendlineColors(options);
        const merged = { ...defaultTrendlineOptions, ...normalizedOptions };
        super(merged);
        this._trendlineOptions = { ...defaultTrendlineOptions, ...this._options } as ZigZagTrendlineIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._trendlineOptions };
    }

    setContext(ctx: RemoteContext): void {
        this._remote.setContext(ctx);
    }

    updateOptions(newOptions: Partial<ZigZagTrendlineIndicatorOptions>): boolean {
        const normalized = { ...newOptions };
        if (normalized.period !== undefined) normalized.period = Number(normalized.period);
        if (normalized.pivotCount !== undefined) normalized.pivotCount = Number(normalized.pivotCount);

        const needsRecalc =
            (normalized.period !== undefined && normalized.period !== this._trendlineOptions.period) ||
            (normalized.pivotCount !== undefined && normalized.pivotCount !== this._trendlineOptions.pivotCount) ||
            (normalized.showHistory !== undefined && normalized.showHistory !== this._trendlineOptions.showHistory);

        Object.assign(this._trendlineOptions, normalized);
        Object.assign(this._options, normalized);
        this._dataChanged.fire();
        return needsRecalc;
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    rows: [
                        numberRow('period', 'ZigZag Period', 2, 100, 1),
                        numberRow('pivotCount', 'Pivot Count', 2, 10, 1),
                        checkboxRow('showHistory', 'Gecmisi Goster', this._trendlineOptions.showHistory),
                    ],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('highColor', 'High Trendline Color', this._trendlineOptions.highColor),
                        colorRow('lowColor', 'Low Trendline Color', this._trendlineOptions.lowColor),
                        lineWidthRow('lineWidth', 'Line Width'),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<ZigZagTrendlineIndicatorOptions>);
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        const o = this._trendlineOptions;
        this._remote.request(
            { period: o.period, pivotCount: o.pivotCount, showHistory: o.showHistory },
            () => this._dataChanged.fire()
        );
        this._rebuild();
    }

    /** Ham (zaman damgalı) çizgileri mevcut mum dizisinin index'lerine çevirir; projeksiyonu kendi son mumuna uzatır. */
    private _rebuild(): void {
        this._data = [];
        this._lines = [];
        const bars = this._sourceData;
        if (!this._raw || bars.length === 0) return;

        const lastIndex = bars.length - 1;
        for (const r of this._raw.lines) {
            const fromIndex = barIndexAtTime(bars, r.from.time);
            const toIndex = barIndexAtTime(bars, r.to.time);
            if (fromIndex < 0 || toIndex < 0) continue;

            const from = { index: fromIndex, time: r.from.time, price: r.from.price };
            const to = { index: toIndex, time: r.to.time, price: r.to.price };
            // Projeksiyon: çizgi güncel muma kadar uzatılır (fiyat = to + eğim * mum farkı).
            const projectionIndex = r.projects ? Math.max(lastIndex, toIndex) : toIndex;
            const projection = projectionIndex > toIndex
                ? { index: projectionIndex, time: bars[lastIndex].time, price: r.to.price + r.slope * (projectionIndex - toIndex) }
                : { index: toIndex, time: r.to.time, price: r.to.price };
            this._lines.push({ kind: r.kind, from, to, projection, historical: r.historical });
        }

        this._data = this._lines.flatMap((line) => {
            const values = [
                { time: line.from.time, value: line.from.price },
                { time: line.to.time, value: line.to.price },
            ];

            if (line.projection.index > line.to.index) {
                values.push({ time: line.projection.time, value: line.projection.price });
            }

            return values;
        });
    }

    destroy(): void {
        this._remote.destroy();
        super.destroy();
    }

    getRange(): IndicatorRange {
        if (this._sourceData.length === 0) {
            return { min: 0, max: 100 };
        }

        let min = Infinity;
        let max = -Infinity;
        for (const bar of this._sourceData) {
            min = Math.min(min, bar.low);
            max = Math.max(max, bar.high);
        }

        for (const line of this._lines) {
            min = Math.min(min, line.from.price, line.to.price, line.projection.price);
            max = Math.max(max, line.from.price, line.to.price, line.projection.price);
        }

        return { min, max };
    }

    getDescription(): string {
        return `Trendline (${this._trendlineOptions.period}, ${this._trendlineOptions.pivotCount}) ${this._lines.length}`;
    }

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number
    ): void {
        if (this._remote.denied !== null) {
            drawAccessNotice(ctx, hpr, vpr, this._remote, this._trendlineOptions.name);
            return;
        }
        if (this._lines.length === 0) {
            return;
        }

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const line of this._lines) {
            const color = line.kind === 'high' ? this._trendlineOptions.highColor : this._trendlineOptions.lowColor;
            const fromX = timeScale.indexToCoordinate(line.from.index as any) * hpr;
            const fromY = priceScale.priceToCoordinate(line.from.price) * vpr;
            const toX = timeScale.indexToCoordinate(line.to.index as any) * hpr;
            const toY = priceScale.priceToCoordinate(line.to.price) * vpr;

            ctx.strokeStyle = line.historical ? _withAlpha(color, 0.45) : color;
            ctx.lineWidth = this._trendlineOptions.lineWidth * hpr;
            ctx.setLineDash(line.historical ? [6 * hpr, 4 * hpr] : []);
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.stroke();

            if (!line.historical && line.projection.index > line.to.index) {
                const px = timeScale.indexToCoordinate(line.projection.index as any) * hpr;
                const py = priceScale.priceToCoordinate(line.projection.price) * vpr;
                ctx.setLineDash([6 * hpr, 4 * hpr]);
                ctx.beginPath();
                ctx.moveTo(toX, toY);
                ctx.lineTo(px, py);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    hitTest(x: number, y: number, timeScale: any, priceScale: any): boolean {
        for (const line of this._lines) {
            const start = {
                x: timeScale.indexToCoordinate(line.from.index as any),
                y: priceScale.priceToCoordinate(line.from.price),
            };
            const end = {
                x: timeScale.indexToCoordinate(line.to.index as any),
                y: priceScale.priceToCoordinate(line.to.price),
            };

            if (_distanceToSegment(x, y, start.x, start.y, end.x, end.y) <= 8) {
                return true;
            }

            if (!line.historical && line.projection.index > line.to.index) {
                const projected = {
                    x: timeScale.indexToCoordinate(line.projection.index as any),
                    y: priceScale.priceToCoordinate(line.projection.price),
                };
                if (_distanceToSegment(x, y, end.x, end.y, projected.x, projected.y) <= 8) {
                    return true;
                }
            }
        }

        return false;
    }
}

function _withAlpha(color: string, alpha: number): string {
    if (color.startsWith('#')) {
        const hex = color.slice(1);
        const normalized = hex.length === 3
            ? hex.split('').map((char) => char + char).join('')
            : hex;
        const r = parseInt(normalized.slice(0, 2), 16);
        const g = parseInt(normalized.slice(2, 4), 16);
        const b = parseInt(normalized.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    const match = color.match(/rgba?\(([^)]+)\)/);
    if (!match) {
        return color;
    }

    const parts = match[1].split(',').map((part) => part.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
}

function _normalizeLegacyTrendlineColors(
    options: Partial<ZigZagTrendlineIndicatorOptions>
): Partial<ZigZagTrendlineIndicatorOptions> {
    if (options.highColor === '#ef4444' && options.lowColor === '#22c55e') {
        return {
            ...options,
            highColor: '#22c55e',
            lowColor: '#ef4444',
        };
    }

    return options;
}

function _distanceToSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
): number {
    const dx = x2 - x1;
    const dy = y2 - y1;

    if (dx === 0 && dy === 0) {
        return Math.hypot(px - x1, py - y1);
    }

    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
}
