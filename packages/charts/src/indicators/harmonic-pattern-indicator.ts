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
import { ABCDPattern, detectABCDPatterns, detectGartleyPatterns, GartleyPattern } from '../patterns';

type HarmonicPattern = {
    kind: 'abcd' | 'gartley';
    direction: 'bullish' | 'bearish';
    points: { index: number; time: number; price: number }[];
    ratios?: { first?: string; second?: string };
};

export interface HarmonicPatternIndicatorOptions extends IndicatorOptions {
    period: number;
    bullishColor: string;
    bearishColor: string;
    showRatios: boolean;
    showABCD: boolean;
    showGartley: boolean;
}

const defaults: Partial<HarmonicPatternIndicatorOptions> = {
    name: 'Harmonic Patterns',
    style: IndicatorStyle.Line,
    color: '#009688',
    lineWidth: 2,
    period: 15,
    bullishColor: '#22c55e',
    bearishColor: '#ef4444',
    showRatios: true,
    showABCD: true,
    showGartley: true,
};

export class HarmonicPatternIndicator extends OverlayIndicator {
    private _optionsEx: HarmonicPatternIndicatorOptions;
    private _patterns: HarmonicPattern[] = [];

    constructor(options: Partial<HarmonicPatternIndicatorOptions> = {}) {
        const merged = { ...defaults, ...options };
        super(merged);
        this._optionsEx = { ...defaults, ...this._options } as HarmonicPatternIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._optionsEx };
    }

    updateOptions(newOptions: Partial<HarmonicPatternIndicatorOptions>): boolean {
        const normalized = { ...newOptions };
        if (normalized.period !== undefined) normalized.period = Number(normalized.period);
        const needsRecalc =
            normalized.period !== undefined && normalized.period !== this._optionsEx.period ||
            normalized.showABCD !== undefined ||
            normalized.showGartley !== undefined;
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
                    checkboxRow('showABCD', 'Show ABCD', this._optionsEx.showABCD),
                    checkboxRow('showGartley', 'Show Gartley', this._optionsEx.showGartley),
                ] }]),
                createStyleTab([{ rows: [
                    colorRow('bullishColor', 'Bullish Color', this._optionsEx.bullishColor),
                    colorRow('bearishColor', 'Bearish Color', this._optionsEx.bearishColor),
                    lineWidthRow('lineWidth', 'Line Width'),
                    checkboxRow('showRatios', 'Show Ratios', this._optionsEx.showRatios),
                ] }]),
                createVisibilityTab(),
            ],
        };
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<HarmonicPatternIndicatorOptions>);
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._patterns = [];
        const periods = Array.from(new Set([
            this._optionsEx.period,
            Math.min(this._optionsEx.period + 5, 50),
            Math.min(this._optionsEx.period + 10, 50),
        ])).sort((a, b) => a - b);

        for (const period of periods) {
            if (this._optionsEx.showABCD) {
                const abcd = detectABCDPatterns(sourceData, { period });
                this._patterns.push(...abcd.map((pattern): HarmonicPattern => ({
                    kind: 'abcd',
                    direction: pattern.direction,
                    points: pattern.points,
                    ratios: { first: pattern.bcRatio.toFixed(3), second: pattern.cdRatio.toFixed(3) },
                })));
            }

            if (this._optionsEx.showGartley) {
                const gartleys = detectGartleyPatterns(sourceData, period);
                this._patterns.push(...gartleys.map((pattern): HarmonicPattern => ({
                    kind: 'gartley',
                    direction: pattern.direction,
                    points: pattern.points,
                })));
            }
        }

        this._patterns = this._dedupePatterns(this._patterns);
        this._data = this._patterns.flatMap((pattern) =>
            pattern.points.map((point) => ({ time: point.time, value: point.price }))
        );
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
        return `Harmonics (${this._optionsEx.period}) ${this._patterns.length}`;
    }

    drawOverlay(ctx: CanvasRenderingContext2D, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        if (this._patterns.length === 0) return;
        ctx.save();
        for (const pattern of this._patterns) {
            const color = pattern.direction === 'bullish' ? this._optionsEx.bullishColor : this._optionsEx.bearishColor;
            const points = pattern.points.map((point) => ({
                x: timeScale.indexToCoordinate(point.index as any) * hpr,
                y: priceScale.priceToCoordinate(point.price) * vpr,
            }));
            ctx.strokeStyle = color;
            ctx.lineWidth = this._optionsEx.lineWidth * hpr;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
            ctx.stroke();

            ctx.setLineDash([4 * hpr, 4 * hpr]);
            ctx.lineWidth = 1 * hpr;
            if (pattern.kind === 'abcd' && points.length >= 4) {
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                ctx.lineTo(points[2].x, points[2].y);
                ctx.moveTo(points[1].x, points[1].y);
                ctx.lineTo(points[3].x, points[3].y);
                ctx.stroke();
            } else if (pattern.kind === 'gartley' && points.length >= 5) {
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                ctx.lineTo(points[2].x, points[2].y);
                ctx.moveTo(points[1].x, points[1].y);
                ctx.lineTo(points[3].x, points[3].y);
                ctx.moveTo(points[2].x, points[2].y);
                ctx.lineTo(points[4].x, points[4].y);
                ctx.stroke();
            }
            ctx.setLineDash([]);

            this._drawLabels(ctx, points, pattern.kind === 'gartley' ? ['X', 'A', 'B', 'C', 'D'] : ['A', 'B', 'C', 'D'], color, hpr, vpr);
            if (this._optionsEx.showRatios && pattern.ratios && points.length >= 4) {
                this._drawRatioTag(ctx, (points[0].x + points[2].x) / 2, (points[0].y + points[2].y) / 2 - 14 * vpr, pattern.ratios.first || '', color, hpr, vpr);
                this._drawRatioTag(ctx, (points[1].x + points[3].x) / 2, (points[1].y + points[3].y) / 2 - 14 * vpr, pattern.ratios.second || '', color, hpr, vpr);
            }
        }
        ctx.restore();
    }

    hitTest(x: number, y: number, timeScale: any, priceScale: any): boolean {
        for (const pattern of this._patterns) {
            const points = pattern.points.map((point) => ({
                x: timeScale.indexToCoordinate(point.index as any),
                y: priceScale.priceToCoordinate(point.price),
            }));
            for (let i = 1; i < points.length; i++) {
                if (distanceToSegment(x, y, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y) <= 8) return true;
            }
        }
        return false;
    }

    private _drawLabels(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], labels: string[], color: string, hpr: number, vpr: number): void {
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
            ctx.fillText(labels[index] || '', point.x, point.y + 0.5 * vpr);
        });
    }

    private _drawRatioTag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, hpr: number, vpr: number): void {
        if (!text) return;
        const paddingX = 4 * hpr;
        const width = ctx.measureText(text).width + paddingX * 2;
        const height = 16 * vpr;
        ctx.fillStyle = color;
        ctx.fillRect(x - width / 2, y - height / 2, width, height);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, x, y);
    }

    private _dedupePatterns(patterns: HarmonicPattern[]): HarmonicPattern[] {
        const seen = new Set<string>();
        const deduped: HarmonicPattern[] = [];
        for (const pattern of patterns) {
            const key = `${pattern.kind}:${pattern.points.map((point) => point.index).join('-')}`;
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(pattern);
        }
        return deduped;
    }
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
