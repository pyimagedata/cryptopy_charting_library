import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import { RemoteCompute, RemoteContext, barIndexAtTime, drawAccessNotice } from './remote-compute';
import {
    IndicatorSettingsConfig,
    createInputsTab,
    createStyleTab,
    createVisibilityTab,
    numberRow,
    colorRow,
    lineWidthRow,
} from '../gui/indicator_settings';

// ZigZag noktaları backend'de hesaplanır (bkz. remote-compute.ts); burada yalnızca çizilir.
interface ZigZagPoint {
    index: number;
    time: number;
    price: number;
    kind: 'high' | 'low';
}

interface RemoteZigZag {
    points: Array<{ time: number; price: number; kind: 'high' | 'low' }>;
}

export interface ZigZagIndicatorOptions extends IndicatorOptions {
    period: number;
}

const defaultZigZagIndicatorOptions: Partial<ZigZagIndicatorOptions> = {
    name: 'ZigZag',
    style: IndicatorStyle.Line,
    color: '#f59e0b',
    lineWidth: 2,
    period: 15,
};

export class ZigZagIndicator extends OverlayIndicator {
    private _zigZagOptions: ZigZagIndicatorOptions;
    private _points: ZigZagPoint[] = [];
    private _raw: RemoteZigZag | null = null;
    private readonly _remote = new RemoteCompute<RemoteZigZag>('zigzag', (raw) => {
        this._raw = raw;
        this._rebuild();
    });

    constructor(options: Partial<ZigZagIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultZigZagIndicatorOptions, ...options };
        super(mergedOptions);
        this._zigZagOptions = { ...defaultZigZagIndicatorOptions, ...this._options } as ZigZagIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._zigZagOptions };
    }

    setContext(ctx: RemoteContext): void {
        this._remote.setContext(ctx);
    }

    updateOptions(newOptions: Partial<ZigZagIndicatorOptions>): boolean {
        const needsRecalc =
            newOptions.period !== undefined && newOptions.period !== this._zigZagOptions.period;

        Object.assign(this._zigZagOptions, newOptions);
        Object.assign(this._options, newOptions);

        this._dataChanged.fire();
        return needsRecalc;
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    rows: [
                        numberRow('period', 'ZigZag Period', 2, 50, 1),
                    ],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('color', 'Line Color', this._zigZagOptions.color),
                        lineWidthRow('lineWidth', 'Line Width'),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<ZigZagIndicatorOptions>);
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }

        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._remote.request({ period: this._zigZagOptions.period }, () => this._dataChanged.fire());
        this._rebuild();
    }

    /** Ham (zaman damgalı) noktaları mevcut mum dizisinin index'lerine çevirir. */
    private _rebuild(): void {
        this._points = [];
        const bars = this._sourceData;
        if (this._raw && bars.length > 0) {
            for (const p of this._raw.points) {
                const index = barIndexAtTime(bars, p.time);
                if (index >= 0) this._points.push({ index, time: p.time, price: p.price, kind: p.kind });
            }
        }
        this._data = this._points.map((point) => ({
            time: point.time,
            value: point.price,
        }));
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
        return { min, max };
    }

    getDescription(): string {
        const count = this._points.length;
        return `ZigZag (${this._zigZagOptions.period})${count > 0 ? ` ${count}` : ''}`;
    }

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number
    ): void {
        if (this._remote.denied !== null) {
            drawAccessNotice(ctx, hpr, vpr, this._remote, this._zigZagOptions.name);
            return;
        }
        if (this._points.length < 2) {
            return;
        }

        ctx.save();
        ctx.strokeStyle = this._zigZagOptions.color;
        ctx.lineWidth = this._zigZagOptions.lineWidth * hpr;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        let started = false;
        for (const point of this._points) {
            const x = timeScale.indexToCoordinate(point.index as any) * hpr;
            const y = priceScale.priceToCoordinate(point.price) * vpr;
            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();
        ctx.restore();
    }

    hitTest(x: number, y: number, timeScale: any, priceScale: any): boolean {
        if (this._points.length < 2) {
            return false;
        }

        const threshold = 8;
        for (let i = 1; i < this._points.length; i++) {
            const start = this._points[i - 1];
            const end = this._points[i];
            const x1 = timeScale.indexToCoordinate(start.index as any);
            const y1 = priceScale.priceToCoordinate(start.price);
            const x2 = timeScale.indexToCoordinate(end.index as any);
            const y2 = priceScale.priceToCoordinate(end.price);

            if (_distanceToSegment(x, y, x1, y1, x2, y2) <= threshold) {
                return true;
            }
        }

        return false;
    }
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
