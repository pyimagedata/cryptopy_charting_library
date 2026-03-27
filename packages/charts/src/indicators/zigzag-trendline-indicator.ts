import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import { calculateZigZagPoints, ZigZagPoint } from '../patterns';
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
    pivots: ZigZagPoint[];
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
    private _zigzagPoints: ZigZagPoint[] = [];

    constructor(options: Partial<ZigZagTrendlineIndicatorOptions> = {}) {
        const normalizedOptions = _normalizeLegacyTrendlineColors(options);
        const merged = { ...defaultTrendlineOptions, ...normalizedOptions };
        super(merged);
        this._trendlineOptions = { ...defaultTrendlineOptions, ...this._options } as ZigZagTrendlineIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._trendlineOptions };
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
        this._data = [];
        this._lines = [];
        this._zigzagPoints = [];

        if (sourceData.length === 0) {
            return;
        }

        const pivotCount = Math.max(2, Math.floor(this._trendlineOptions.pivotCount));
        this._zigzagPoints = [...calculateZigZagPoints(sourceData, { period: this._trendlineOptions.period })].reverse();
        const confirmedPoints = this._zigzagPoints.length > 1
            ? this._zigzagPoints.slice(0, -1)
            : [];

        const highs = confirmedPoints.filter((point) => point.kind === 'high');
        const lows = confirmedPoints.filter((point) => point.kind === 'low');
        const currentBar = sourceData[sourceData.length - 1];
        const currentIndex = sourceData.length - 1;

        this._lines.push(...this._buildLinesForKind(highs, 'high', pivotCount, currentIndex, currentBar.time));
        this._lines.push(...this._buildLinesForKind(lows, 'low', pivotCount, currentIndex, currentBar.time));

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

    private _buildLinesForKind(
        pivots: ZigZagPoint[],
        kind: 'high' | 'low',
        pivotCount: number,
        currentIndex: number,
        currentTime: number
    ): TrendlineCandidate[] {
        if (pivots.length < pivotCount) {
            return [];
        }

        const lines: TrendlineCandidate[] = [];

        if (this._trendlineOptions.showHistory) {
            const seen = new Set<string>();
            for (let endIndex = pivotCount - 1; endIndex < pivots.length - 1; endIndex++) {
                const line = this._createLine(pivots.slice(0, endIndex + 1), kind, pivotCount, false);
                if (line) {
                    const key = `${line.kind}:${line.from.index}:${line.to.index}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        lines.push({ ...line, historical: true });
                    }
                }
            }
        }

        const latestLine = this._createLine(pivots, kind, pivotCount, true, currentIndex, currentTime);
        if (latestLine) {
            lines.push(latestLine);
        }

        return lines;
    }

    private _createLine(
        pivots: ZigZagPoint[],
        kind: 'high' | 'low',
        pivotCount: number,
        extendToCurrent: boolean,
        currentIndex?: number,
        currentTime?: number
    ): TrendlineCandidate | null {
        if (pivots.length < Math.max(2, pivotCount)) {
            return null;
        }

        const latestPivot = pivots[pivots.length - 1];
        let bestCandidate: { from: ZigZagPoint; to: ZigZagPoint; line: TrendlineModel; touches: number; span: number } | null = null;

        for (let startIndex = 0; startIndex <= pivots.length - 2; startIndex++) {
            const from = pivots[startIndex];
            const to = latestPivot;
            if (from.index === to.index) {
                continue;
            }

            const line = _buildTrendlineModel(from, to);
            if (!line) {
                continue;
            }

            if (kind === 'high' && line.slope >= 0) {
                continue;
            }

            if (kind === 'low' && line.slope <= 0) {
                continue;
            }

            const tolerance = this._calculatePivotTolerance(from.index, to.index);
            const evaluation = this._evaluateCandidate(pivots.slice(startIndex), kind, line, from.index, to.index, tolerance);
            if (!evaluation.valid || evaluation.touches < pivotCount) {
                continue;
            }

            const span = to.index - from.index;
            if (
                !bestCandidate ||
                evaluation.touches > bestCandidate.touches ||
                (evaluation.touches === bestCandidate.touches && span > bestCandidate.span)
            ) {
                bestCandidate = { from, to, line, touches: evaluation.touches, span };
            }
        }

        if (!bestCandidate) {
            return null;
        }

        const projectionIndex = extendToCurrent && currentIndex !== undefined
            ? Math.max(currentIndex, bestCandidate.to.index)
            : bestCandidate.to.index;
        const projectionTime = extendToCurrent && currentTime !== undefined && projectionIndex > bestCandidate.to.index
            ? currentTime
            : bestCandidate.to.time;

        return {
            kind,
            pivots,
            from: bestCandidate.from,
            to: bestCandidate.to,
            projection: {
                index: projectionIndex,
                time: projectionTime,
                price: _lineAtIndex(bestCandidate.line, projectionIndex),
            },
            historical: false,
        };
    }

    private _calculatePivotTolerance(startIndex: number, endIndex: number): number {
        if (this._sourceData.length === 0) {
            return 0;
        }

        const from = Math.max(0, Math.min(startIndex, endIndex));
        const to = Math.min(this._sourceData.length - 1, Math.max(startIndex, endIndex));
        let rangeSum = 0;
        let count = 0;

        for (let i = from; i <= to; i++) {
            const bar = this._sourceData[i];
            const prevClose = i > 0 ? this._sourceData[i - 1].close : bar.close;
            const trueRange = Math.max(
                bar.high - bar.low,
                Math.abs(bar.high - prevClose),
                Math.abs(bar.low - prevClose)
            );
            rangeSum += trueRange;
            count++;
        }

        if (count === 0) {
            return 0;
        }

        return (rangeSum / count) * 0.45;
    }

    private _evaluateCandidate(
        pivots: ZigZagPoint[],
        kind: 'high' | 'low',
        line: TrendlineModel,
        startIndex: number,
        endIndex: number,
        tolerance: number
    ): { valid: boolean; touches: number } {
        let touches = 0;

        for (const pivot of pivots) {
            if (pivot.index < startIndex || pivot.index > endIndex) {
                continue;
            }

            const expected = _lineAtIndex(line, pivot.index);
            const distance = kind === 'high'
                ? expected - pivot.price
                : pivot.price - expected;

            if (distance < -tolerance) {
                return { valid: false, touches: 0 };
            }

            if (Math.abs(distance) <= tolerance) {
                touches++;
            }
        }

        if (this._countBodyIntersections(startIndex, endIndex, line, tolerance) > 1) {
            return { valid: false, touches: 0 };
        }

        return { valid: true, touches };
    }

    private _countBodyIntersections(
        startIndex: number,
        endIndex: number,
        line: TrendlineModel,
        tolerance: number
    ): number {
        let intersections = 0;

        for (let index = startIndex; index <= endIndex; index++) {
            const bar = this._sourceData[index];
            if (!bar) {
                continue;
            }

            const bodyTop = Math.max(bar.open, bar.close);
            const bodyBottom = Math.min(bar.open, bar.close);
            const linePrice = _lineAtIndex(line, index);

            if (bodyBottom < linePrice - tolerance && bodyTop > linePrice + tolerance) {
                intersections++;
            }
        }

        return intersections;
    }
}

interface TrendlineModel {
    slope: number;
    intercept: number;
}

function _buildTrendlineModel(
    from: ZigZagPoint,
    to: ZigZagPoint
): TrendlineModel | null {
    if (from.index === to.index) {
        return null;
    }

    const slope = (to.price - from.price) / (to.index - from.index);
    const intercept = from.price - slope * from.index;
    return { slope, intercept };
}

function _lineAtIndex(line: TrendlineModel, targetIndex: number): number {
    return line.intercept + line.slope * targetIndex;
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
