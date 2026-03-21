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
import { ABCDPattern, detectABCDPatterns } from '../patterns';

export interface ABCDPatternIndicatorOptions extends IndicatorOptions {
    period: number;
    bullishColor: string;
    bearishColor: string;
    showRatios: boolean;
}

const defaultABCDPatternIndicatorOptions: Partial<ABCDPatternIndicatorOptions> = {
    name: 'ABCD Pattern',
    style: IndicatorStyle.Line,
    color: '#009688',
    lineWidth: 2,
    period: 15,
    bullishColor: '#22c55e',
    bearishColor: '#ef4444',
    showRatios: true,
};

export class ABCDPatternIndicator extends OverlayIndicator {
    private _abcdOptions: ABCDPatternIndicatorOptions;
    private _patterns: ABCDPattern[] = [];

    constructor(options: Partial<ABCDPatternIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultABCDPatternIndicatorOptions, ...options };
        super(mergedOptions);
        this._abcdOptions = { ...defaultABCDPatternIndicatorOptions, ...this._options } as ABCDPatternIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._abcdOptions };
    }

    updateOptions(newOptions: Partial<ABCDPatternIndicatorOptions>): boolean {
        const normalizedOptions = { ...newOptions };
        if (normalizedOptions.period !== undefined) {
            normalizedOptions.period = Number(normalizedOptions.period);
        }

        const needsRecalc = normalizedOptions.period !== undefined && normalizedOptions.period !== this._abcdOptions.period;
        Object.assign(this._abcdOptions, normalizedOptions);
        Object.assign(this._options, normalizedOptions);
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
                        colorRow('bullishColor', 'Bullish Color', this._abcdOptions.bullishColor),
                        colorRow('bearishColor', 'Bearish Color', this._abcdOptions.bearishColor),
                        lineWidthRow('lineWidth', 'Line Width'),
                        checkboxRow('showRatios', 'Show Ratios', this._abcdOptions.showRatios),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<ABCDPatternIndicatorOptions>);
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._patterns = detectABCDPatterns(sourceData, {
            period: this._abcdOptions.period,
            _sourceData: sourceData as any,
        });

        this._data = this._patterns.flatMap((pattern) =>
            pattern.points.map((point) => ({ time: point.time, value: point.price }))
        );
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
        if (this._patterns.length === 0) {
            return `ABCD (${this._abcdOptions.period})`;
        }
        const latest = this._patterns[this._patterns.length - 1];
        return `ABCD x${this._patterns.length} ${latest.direction === 'bullish' ? 'Bullish' : 'Bearish'} ${latest.bcRatio.toFixed(3)} / ${latest.cdRatio.toFixed(3)}`;
    }

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number
    ): void {
        if (this._patterns.length === 0) {
            return;
        }

        ctx.save();
        for (const pattern of this._patterns) {
            const color = pattern.direction === 'bullish'
                ? this._abcdOptions.bullishColor
                : this._abcdOptions.bearishColor;
            const points = pattern.points.map((point) => ({
                x: timeScale.indexToCoordinate(point.index as any) * hpr,
                y: priceScale.priceToCoordinate(point.price) * vpr,
            }));

            ctx.strokeStyle = color;
            ctx.lineWidth = this._abcdOptions.lineWidth * hpr;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();

            ctx.setLineDash([4 * hpr, 4 * hpr]);
            ctx.lineWidth = 1 * hpr;
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            ctx.lineTo(points[2].x, points[2].y);
            ctx.moveTo(points[1].x, points[1].y);
            ctx.lineTo(points[3].x, points[3].y);
            ctx.stroke();
            ctx.setLineDash([]);

            this._drawLabels(ctx, points, color, hpr, vpr);
            if (this._abcdOptions.showRatios) {
                this._drawRatios(ctx, points, pattern, color, hpr, vpr);
            }
        }
        ctx.restore();
    }

    hitTest(x: number, y: number, timeScale: any, priceScale: any): boolean {
        if (this._patterns.length === 0) {
            return false;
        }

        for (const pattern of this._patterns) {
            const points = pattern.points.map((point) => ({
                x: timeScale.indexToCoordinate(point.index as any),
                y: priceScale.priceToCoordinate(point.price),
            }));

            for (let i = 1; i < points.length; i++) {
                if (_distanceToSegment(x, y, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y) <= 8) {
                    return true;
                }
            }
        }

        return false;
    }

    private _drawLabels(
        ctx: CanvasRenderingContext2D,
        points: { x: number; y: number }[],
        color: string,
        hpr: number,
        vpr: number
    ): void {
        const labels = ['A', 'B', 'C', 'D'];
        ctx.font = `${11 * Math.min(hpr, vpr)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        points.forEach((point, index) => {
            const radius = 10 * hpr;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillText(labels[index], point.x, point.y + 0.5 * vpr);
        });
    }

    private _drawRatios(
        ctx: CanvasRenderingContext2D,
        points: { x: number; y: number }[],
        pattern: ABCDPattern,
        color: string,
        hpr: number,
        vpr: number
    ): void {
        ctx.font = `bold ${10 * Math.min(hpr, vpr)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        this._drawRatioTag(
            ctx,
            (points[0].x + points[2].x) / 2,
            (points[0].y + points[2].y) / 2 - 14 * vpr,
            pattern.bcRatio.toFixed(3),
            color,
            hpr,
            vpr
        );

        this._drawRatioTag(
            ctx,
            (points[1].x + points[3].x) / 2,
            (points[1].y + points[3].y) / 2 - 14 * vpr,
            pattern.cdRatio.toFixed(3),
            color,
            hpr,
            vpr
        );
    }

    private _drawRatioTag(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        text: string,
        color: string,
        hpr: number,
        vpr: number
    ): void {
        const paddingX = 4 * hpr;
        const paddingY = 3 * vpr;
        const width = ctx.measureText(text).width + paddingX * 2;
        const height = 16 * vpr;

        ctx.fillStyle = color;
        ctx.fillRect(x - width / 2, y - height / 2, width, height);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, x, y);
    }
}

function _distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
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
