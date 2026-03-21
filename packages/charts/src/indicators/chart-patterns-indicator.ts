import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import {
    IndicatorSettingsConfig,
    createInputsTab,
    createStyleTab,
    createVisibilityTab,
    numberRow,
    colorRow,
    lineWidthRow,
    checkboxRow,
} from '../gui/indicator_settings';
import { ChartPatternMatch, detectChartPatterns } from '../patterns';

export interface ChartPatternsIndicatorOptions extends IndicatorOptions {
    period: number;
    bullishColor: string;
    bearishColor: string;
    showPrediction: boolean;
    showHistory: boolean;
    showDoubleTop: boolean;
    showDoubleBottom: boolean;
    showBullPennant: boolean;
    showBearPennant: boolean;
}

const defaults: Partial<ChartPatternsIndicatorOptions> = {
    name: 'Chart Patterns',
    style: IndicatorStyle.Line,
    color: '#10b981',
    lineWidth: 2,
    period: 7,
    bullishColor: '#22c55e',
    bearishColor: '#ef4444',
    showPrediction: true,
    showHistory: false,
    showDoubleTop: true,
    showDoubleBottom: true,
    showBullPennant: true,
    showBearPennant: true,
};

export class ChartPatternsIndicator extends OverlayIndicator {
    private _optionsEx: ChartPatternsIndicatorOptions;
    private _patterns: ChartPatternMatch[] = [];

    constructor(options: Partial<ChartPatternsIndicatorOptions> = {}) {
        const merged = { ...defaults, ...options };
        super(merged);
        this._optionsEx = { ...defaults, ...this._options } as ChartPatternsIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._optionsEx };
    }

    updateOptions(newOptions: Partial<ChartPatternsIndicatorOptions>): boolean {
        const normalized = { ...newOptions };
        if (normalized.period !== undefined) normalized.period = Number(normalized.period);
        const needsRecalc =
            normalized.period !== undefined && normalized.period !== this._optionsEx.period ||
            normalized.showPrediction !== undefined ||
            normalized.showHistory !== undefined ||
            normalized.showDoubleTop !== undefined ||
            normalized.showDoubleBottom !== undefined ||
            normalized.showBullPennant !== undefined ||
            normalized.showBearPennant !== undefined;
        Object.assign(this._optionsEx, normalized);
        Object.assign(this._options, normalized);
        this._dataChanged.fire();
        return !!needsRecalc;
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([{ rows: [
                    numberRow('period', 'ZigZag Period', 2, 50, 1),
                    checkboxRow('showPrediction', 'Tahmini Goster', this._optionsEx.showPrediction),
                    checkboxRow('showHistory', 'Gecmisi Goster', this._optionsEx.showHistory),
                    checkboxRow('showDoubleTop', 'Cifte Tepe', this._optionsEx.showDoubleTop),
                    checkboxRow('showDoubleBottom', 'Cifte Dip', this._optionsEx.showDoubleBottom),
                    checkboxRow('showBullPennant', 'Boga Flama', this._optionsEx.showBullPennant),
                    checkboxRow('showBearPennant', 'Ayi Flama', this._optionsEx.showBearPennant),
                ] }]),
                createStyleTab([{ rows: [
                    colorRow('bullishColor', 'Bullish Color', this._optionsEx.bullishColor),
                    colorRow('bearishColor', 'Bearish Color', this._optionsEx.bearishColor),
                    lineWidthRow('lineWidth', 'Line Width'),
                ] }]),
                createVisibilityTab(),
            ],
        };
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<ChartPatternsIndicatorOptions>);
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._patterns = detectChartPatterns(sourceData, {
            period: this._optionsEx.period,
            showPrediction: this._optionsEx.showPrediction,
            showHistory: this._optionsEx.showHistory,
            showDoubleTop: this._optionsEx.showDoubleTop,
            showDoubleBottom: this._optionsEx.showDoubleBottom,
            showBullPennant: this._optionsEx.showBullPennant,
            showBearPennant: this._optionsEx.showBearPennant,
        });

        this._data = this._patterns.flatMap((pattern) => [
            ...pattern.points.map((point) => ({ time: point.time, value: point.price })),
            { time: pattern.detectionTime, value: pattern.neckline },
        ]);
    }

    getRange(): IndicatorRange {
        if (this._sourceData.length === 0) return { min: 0, max: 100 };
        let min = Infinity;
        let max = -Infinity;
        for (const bar of this._sourceData) {
            min = Math.min(min, bar.low);
            max = Math.max(max, bar.high);
        }
        return { min, max };
    }

    getDescription(): string {
        return `Chart Patterns (${this._optionsEx.period}) ${this._patterns.length}`;
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        if (this._patterns.length === 0) return;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const pattern of this._patterns) {
            const color = pattern.direction === 'bullish' ? this._optionsEx.bullishColor : this._optionsEx.bearishColor;
            const points = pattern.points.map((point) => ({
                x: timeScale.indexToCoordinate(point.index as any) * hpr,
                y: priceScale.priceToCoordinate(point.price) * vpr,
            }));

            if (pattern.segments && pattern.segments.length > 0) {
                ctx.strokeStyle = color;
                for (const segment of pattern.segments) {
                    const fromX = timeScale.indexToCoordinate(segment.from.index as any) * hpr;
                    const fromY = priceScale.priceToCoordinate(segment.from.price) * vpr;
                    const toX = timeScale.indexToCoordinate(segment.to.index as any) * hpr;
                    const toY = priceScale.priceToCoordinate(segment.to.price) * vpr;
                    ctx.setLineDash(segment.dashed ? [5 * hpr, 4 * hpr] : []);
                    ctx.lineWidth = this._optionsEx.lineWidth * hpr;
                    ctx.beginPath();
                    ctx.moveTo(fromX, fromY);
                    ctx.lineTo(toX, toY);
                    ctx.stroke();
                }
                ctx.setLineDash([]);
                this._drawPatternLabel(
                    ctx,
                    pattern,
                    {
                        x: timeScale.indexToCoordinate((pattern.labelAnchor ?? pattern.points[1]).index as any) * hpr,
                        y: priceScale.priceToCoordinate((pattern.labelAnchor ?? pattern.points[1]).price) * vpr,
                    },
                    color,
                    hpr,
                    vpr
                );
                this._drawLevelLabel(
                    ctx,
                    {
                        x: timeScale.indexToCoordinate(pattern.detectionIndex as any) * hpr,
                        y: priceScale.priceToCoordinate(pattern.neckline) * vpr,
                    },
                    pattern.neckline,
                    color,
                    pattern.direction,
                    hpr,
                    vpr
                );
                continue;
            }

            const targetX = timeScale.indexToCoordinate(pattern.detectionIndex as any) * hpr;
            const necklineY = priceScale.priceToCoordinate(pattern.neckline) * vpr;

            ctx.strokeStyle = color;
            ctx.lineWidth = this._optionsEx.lineWidth * hpr;
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            ctx.lineTo(points[1].x, points[1].y);
            ctx.lineTo(points[2].x, points[2].y);
            ctx.lineTo(points[3].x, points[3].y);
            ctx.lineTo(targetX, necklineY);
            ctx.stroke();

            ctx.setLineDash([5 * hpr, 4 * hpr]);
            ctx.lineWidth = 1 * hpr;
            ctx.beginPath();
            ctx.moveTo(points[1].x, necklineY);
            ctx.lineTo(targetX, necklineY);
            ctx.stroke();
            ctx.setLineDash([]);

            this._drawPatternLabel(ctx, pattern, points[1], color, hpr, vpr);
            this._drawLevelLabel(
                ctx,
                { x: targetX, y: necklineY },
                pattern.neckline,
                color,
                pattern.direction,
                hpr,
                vpr
            );
        }

        ctx.restore();
    }

    hitTest(x: number, y: number, timeScale: any, priceScale: any): boolean {
        for (const pattern of this._patterns) {
            if (pattern.segments && pattern.segments.length > 0) {
                for (const segment of pattern.segments) {
                    const start = {
                        x: timeScale.indexToCoordinate(segment.from.index as any),
                        y: priceScale.priceToCoordinate(segment.from.price),
                    };
                    const end = {
                        x: timeScale.indexToCoordinate(segment.to.index as any),
                        y: priceScale.priceToCoordinate(segment.to.price),
                    };
                    if (distanceToSegment(x, y, start.x, start.y, end.x, end.y) <= 8) {
                        return true;
                    }
                }
                continue;
            }
            const points = pattern.points.map((point) => ({
                x: timeScale.indexToCoordinate(point.index as any),
                y: priceScale.priceToCoordinate(point.price),
            }));
            const targetX = timeScale.indexToCoordinate(pattern.detectionIndex as any);
            const necklineY = priceScale.priceToCoordinate(pattern.neckline);
            const segments = [
                [points[0], points[1]],
                [points[1], points[2]],
                [points[2], points[3]],
                [points[3], { x: targetX, y: necklineY }],
                [{ x: points[1].x, y: necklineY }, { x: targetX, y: necklineY }],
            ] as const;

            for (const [start, end] of segments) {
                if (distanceToSegment(x, y, start.x, start.y, end.x, end.y) <= 8) {
                    return true;
                }
            }
        }
        return false;
    }

    private _drawPatternLabel(
        ctx: CanvasRenderingContext2D,
        pattern: ChartPatternMatch,
        anchor: { x: number; y: number },
        color: string,
        hpr: number,
        vpr: number
    ): void {
        const text = pattern.labelText ?? (
            pattern.kind === 'double-top'
                ? 'Cifte Tepe'
                : pattern.kind === 'double-bottom'
                    ? 'Cifte Dip'
                    : pattern.kind === 'bull-pennant'
                        ? 'Boga Flama'
                        : 'Ayi Flama'
        );
        const paddingX = 6 * hpr;
        const width = ctx.measureText(text).width + paddingX * 2;
        const height = 16 * vpr;
        const offsetY = pattern.direction === 'bullish' ? 16 * vpr : -16 * vpr;
        const x = anchor.x + 10 * hpr;
        const y = anchor.y + offsetY;

        ctx.globalAlpha = 0.92;
        ctx.fillStyle = color;
        ctx.fillRect(x, y - height / 2, width, height);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.font = `${10 * Math.min(hpr, vpr)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + paddingX, y + 0.5 * vpr);
        ctx.textAlign = 'center';
    }

    private _drawLevelLabel(
        ctx: CanvasRenderingContext2D,
        point: { x: number; y: number },
        price: number,
        color: string,
        direction: 'bullish' | 'bearish',
        hpr: number,
        vpr: number
    ): void {
        const text = `Seviye ${formatPatternPrice(price)}`;
        ctx.font = `${10 * Math.min(hpr, vpr)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const paddingX = 6 * hpr;
        const width = ctx.measureText(text).width + paddingX * 2;
        const height = 16 * vpr;
        const x = point.x + 10 * hpr;
        const y = point.y + (direction === 'bullish' ? -14 * vpr : 14 * vpr);

        ctx.globalAlpha = 0.92;
        ctx.fillStyle = '#111827';
        ctx.fillRect(x, y - height / 2, width, height);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1 * hpr;
        ctx.strokeRect(x, y - height / 2, width, height);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + paddingX, y + 0.5 * vpr);
        ctx.textAlign = 'center';
    }
}

function formatPatternPrice(price: number): string {
    const abs = Math.abs(price);
    if (abs >= 1000) return price.toFixed(2);
    if (abs >= 1) return price.toFixed(2);
    if (abs >= 0.01) return price.toFixed(4);
    return price.toFixed(6);
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
}
