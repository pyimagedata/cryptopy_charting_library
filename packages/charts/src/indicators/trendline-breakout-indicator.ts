import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import {
    IndicatorSettingsConfig,
    createInputsTab,
    createStyleTab,
    createVisibilityTab,
    checkboxRow,
    colorRow,
    lineWidthRow,
    numberRow,
} from '../gui/indicator_settings';
import { TrendlineBreakoutMatch, detectTrendlineBreakouts } from '../patterns';

export interface TrendlineBreakoutIndicatorOptions extends IndicatorOptions {
    period: number;
    useLength8: boolean;
    useLength10: boolean;
    useLength15: boolean;
    useLength30: boolean;
    volumeSpikeMultiplier: number;
    showHistory: boolean;
    showBullBreakout: boolean;
    showBearBreakdown: boolean;
    bullishColor: string;
    bearishColor: string;
}

const defaults: Partial<TrendlineBreakoutIndicatorOptions> = {
    name: 'Trendline Breakout',
    style: IndicatorStyle.Line,
    color: '#22c55e',
    lineWidth: 2,
    period: 20,
    useLength8: true,
    useLength10: true,
    useLength15: true,
    useLength30: true,
    volumeSpikeMultiplier: 1,
    showHistory: false,
    showBullBreakout: true,
    showBearBreakdown: true,
    bullishColor: '#22c55e',
    bearishColor: '#ef4444',
};

export class TrendlineBreakoutIndicator extends OverlayIndicator {
    private _optionsEx: TrendlineBreakoutIndicatorOptions;
    private _matches: TrendlineBreakoutMatch[] = [];

    constructor(options: Partial<TrendlineBreakoutIndicatorOptions> = {}) {
        const merged = { ...defaults, ...options };
        super(merged);
        this._optionsEx = { ...defaults, ...this._options } as TrendlineBreakoutIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._optionsEx };
    }

    updateOptions(newOptions: Partial<TrendlineBreakoutIndicatorOptions>): boolean {
        const normalized = { ...newOptions };
        if (normalized.period !== undefined) normalized.period = Number(normalized.period);
        if (normalized.volumeSpikeMultiplier !== undefined) normalized.volumeSpikeMultiplier = Number(normalized.volumeSpikeMultiplier);

        const needsRecalc =
            normalized.period !== undefined ||
            normalized.useLength8 !== undefined ||
            normalized.useLength10 !== undefined ||
            normalized.useLength15 !== undefined ||
            normalized.useLength30 !== undefined ||
            normalized.volumeSpikeMultiplier !== undefined ||
            normalized.showHistory !== undefined ||
            normalized.showBullBreakout !== undefined ||
            normalized.showBearBreakdown !== undefined;

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
                    numberRow('period', 'Custom Period', 2, 50, 1),
                    checkboxRow('useLength8', 'Length 8', this._optionsEx.useLength8),
                    checkboxRow('useLength10', 'Length 10', this._optionsEx.useLength10),
                    checkboxRow('useLength15', 'Length 15', this._optionsEx.useLength15),
                    checkboxRow('useLength30', 'Length 30', this._optionsEx.useLength30),
                    numberRow('volumeSpikeMultiplier', 'Volume Spike', 0.1, 10, 0.1),
                    checkboxRow('showHistory', 'Gecmisi Goster', this._optionsEx.showHistory),
                    checkboxRow('showBullBreakout', 'Bull Trendline Breakout', this._optionsEx.showBullBreakout),
                    checkboxRow('showBearBreakdown', 'Bear Trendline Breakdown', this._optionsEx.showBearBreakdown),
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
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<TrendlineBreakoutIndicatorOptions>);
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._matches = detectTrendlineBreakouts(sourceData, {
            period: this._optionsEx.period,
            useLength8: this._optionsEx.useLength8,
            useLength10: this._optionsEx.useLength10,
            useLength15: this._optionsEx.useLength15,
            useLength30: this._optionsEx.useLength30,
            volumeSpikeMultiplier: this._optionsEx.volumeSpikeMultiplier,
            showHistory: this._optionsEx.showHistory,
            showBullBreakout: this._optionsEx.showBullBreakout,
            showBearBreakdown: this._optionsEx.showBearBreakdown,
        });

        this._data = this._matches.flatMap((match) => {
            const segment = match.segments[0];
            return [
                { time: segment.from.time, value: segment.from.price },
                { time: segment.to.time, value: segment.to.price },
            ];
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

        return { min, max };
    }

    getDescription(): string {
        return `Trendline Breakout (${this._matches.length})`;
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        if (this._matches.length === 0) {
            return;
        }

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const match of this._matches) {
            const color = match.direction === 'bullish' ? this._optionsEx.bullishColor : this._optionsEx.bearishColor;
            const segment = match.segments[0];
            const fromX = timeScale.indexToCoordinate(segment.from.index as any) * hpr;
            const fromY = priceScale.priceToCoordinate(segment.from.price) * vpr;
            const toX = timeScale.indexToCoordinate(segment.to.index as any) * hpr;
            const toY = priceScale.priceToCoordinate(segment.to.price) * vpr;

            ctx.strokeStyle = color;
            ctx.lineWidth = this._optionsEx.lineWidth * hpr;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.stroke();

            drawBreakoutLabel(
                ctx,
                match,
                {
                    x: timeScale.indexToCoordinate(match.labelAnchor.index as any) * hpr,
                    y: priceScale.priceToCoordinate(match.labelAnchor.price) * vpr,
                },
                color,
                hpr,
                vpr
            );
        }

        ctx.restore();
    }

    hitTest(x: number, y: number, timeScale: any, priceScale: any): boolean {
        for (const match of this._matches) {
            const segment = match.segments[0];
            const x1 = timeScale.indexToCoordinate(segment.from.index as any);
            const y1 = priceScale.priceToCoordinate(segment.from.price);
            const x2 = timeScale.indexToCoordinate(segment.to.index as any);
            const y2 = priceScale.priceToCoordinate(segment.to.price);

            if (distanceToSegment(x, y, x1, y1, x2, y2) <= 8) {
                return true;
            }
        }

        return false;
    }
}

function drawBreakoutLabel(
    ctx: CanvasRenderingContext2D,
    match: TrendlineBreakoutMatch,
    point: { x: number; y: number },
    color: string,
    hpr: number,
    vpr: number
): void {
    const paddingX = 8 * hpr;
    const paddingY = 4 * vpr;
    const radius = 6 * hpr;

    ctx.font = `${12 * hpr}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    const text = match.labelText;
    const metrics = ctx.measureText(text);
    const width = metrics.width + paddingX * 2;
    const height = 22 * vpr;
    const x = point.x - width / 2;
    const y = match.direction === 'bullish' ? point.y - height - 10 * vpr : point.y + 10 * vpr;

    ctx.fillStyle = color;
    roundRect(ctx, x, y, width, height, radius);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + width / 2, y + height / 2 + 0.5 * vpr);
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function distanceToSegment(
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
