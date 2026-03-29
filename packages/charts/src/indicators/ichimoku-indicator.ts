import { OverlayIndicator, IndicatorOptions } from './indicator';
import { BarData } from '../model/data';
import {
    IndicatorSettingsConfig,
    createInputsTab,
    createStyleTab,
    createVisibilityTab,
    numberRow,
    colorRow,
    lineWidthRow,
} from '../gui/indicator_settings';

export interface IchimokuIndicatorOptions extends IndicatorOptions {
    conversionPeriods: number;
    basePeriods: number;
    laggingSpan2Periods: number;
    displacement: number;
    conversionColor: string;
    baseColor: string;
    laggingColor: string;
    leadingSpanAColor: string;
    leadingSpanBColor: string;
    cloudBullColor: string;
    cloudBearColor: string;
    cloudOpacity: number;
}

interface IchimokuState {
    index: number;
    conversionLine: number;
    baseLine: number;
    laggingSpan: number;
    leadLine1: number;
    leadLine2: number;
}

const defaultIchimokuOptions: Partial<IchimokuIndicatorOptions> = {
    name: 'Ichimoku Cloud',
    conversionPeriods: 9,
    basePeriods: 26,
    laggingSpan2Periods: 52,
    displacement: 26,
    color: '#2962FF',
    lineWidth: 1.5,
    conversionColor: '#2962FF',
    baseColor: '#B71C1C',
    laggingColor: '#43A047',
    leadingSpanAColor: '#A5D6A7',
    leadingSpanBColor: '#EF9A9A',
    cloudBullColor: '#43A047',
    cloudBearColor: '#F44336',
    cloudOpacity: 0.35,
};

export class IchimokuIndicator extends OverlayIndicator {
    private _ichimokuOptions: IchimokuIndicatorOptions;
    private _states: IchimokuState[] = [];

    constructor(options: Partial<IchimokuIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultIchimokuOptions, ...options };
        super(mergedOptions);
        this._ichimokuOptions = { ...defaultIchimokuOptions, ...this._options } as IchimokuIndicatorOptions;
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    rows: [
                        numberRow('conversionPeriods', 'Conversion Line', 1, 200, 1),
                        numberRow('basePeriods', 'Base Line', 1, 200, 1),
                        numberRow('laggingSpan2Periods', 'Leading Span B', 1, 300, 1),
                        numberRow('displacement', 'Displacement', 1, 200, 1),
                    ],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('conversionColor', 'Conversion Color'),
                        colorRow('baseColor', 'Base Color'),
                        colorRow('laggingColor', 'Lagging Color'),
                        colorRow('leadingSpanAColor', 'Leading A Color'),
                        colorRow('leadingSpanBColor', 'Leading B Color'),
                        colorRow('cloudBullColor', 'Bull Cloud'),
                        colorRow('cloudBearColor', 'Bear Cloud'),
                        numberRow('cloudOpacity', 'Cloud Opacity', 0, 1, 0.05),
                        lineWidthRow('lineWidth'),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._ichimokuOptions };
    }

    setSettingValue(key: string, value: any): boolean {
        const numericKeys = new Set([
            'conversionPeriods',
            'basePeriods',
            'laggingSpan2Periods',
            'displacement',
            'cloudOpacity',
            'lineWidth',
        ]);
        const normalizedValue = numericKeys.has(key) ? Number(value) : value;
        const needsRecalc = ['conversionPeriods', 'basePeriods', 'laggingSpan2Periods', 'displacement'].includes(key);
        Object.assign(this._ichimokuOptions, { [key]: normalizedValue });
        Object.assign(this._options, { [key]: normalizedValue });
        this._dataChanged.fire();
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._data = [];
        this._states = [];

        const { conversionPeriods, basePeriods, laggingSpan2Periods } = this._ichimokuOptions;
        const required = Math.max(conversionPeriods, basePeriods, laggingSpan2Periods);
        if (sourceData.length < required) {
            return;
        }

        for (let i = 0; i < sourceData.length; i++) {
            const conversionLine = donchian(sourceData, i, conversionPeriods);
            const baseLine = donchian(sourceData, i, basePeriods);
            const leadLine1 = isNaN(conversionLine) || isNaN(baseLine) ? NaN : (conversionLine + baseLine) / 2;
            const leadLine2 = donchian(sourceData, i, laggingSpan2Periods);
            const laggingSpan = sourceData[i].close;

            this._states.push({
                index: i,
                conversionLine,
                baseLine,
                laggingSpan,
                leadLine1,
                leadLine2,
            });

            this._data.push({
                time: sourceData[i].time,
                value: conversionLine,
                values: [conversionLine, baseLine, laggingSpan, leadLine1, leadLine2],
            });
        }
    }

    getDescription(index?: number): string {
        const dataIndex = index !== undefined && index >= 0 && index < this._states.length
            ? index
            : this._states.length - 1;
        const state = this._states[dataIndex];
        if (!state) {
            return 'Ichimoku: -';
        }

        const conv = isNaN(state.conversionLine) ? '-' : state.conversionLine.toFixed(2);
        const base = isNaN(state.baseLine) ? '-' : state.baseLine.toFixed(2);
        const a = isNaN(state.leadLine1) ? '-' : state.leadLine1.toFixed(2);
        const b = isNaN(state.leadLine2) ? '-' : state.leadLine2.toFixed(2);

        return `Ichimoku: ${conv} ${base} ${a} ${b}`;
    }

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number,
        visibleRange?: { from: number; to: number }
    ): void {
        if (this._states.length === 0) {
            return;
        }

        const startIndex = visibleRange ? Math.max(0, Math.floor(visibleRange.from) - this._ichimokuOptions.displacement - 2) : 0;
        const endIndex = visibleRange ? Math.min(this._states.length - 1, Math.ceil(visibleRange.to) + this._ichimokuOptions.displacement + 2) : this._states.length - 1;
        const states = this._states.slice(startIndex, endIndex + 1);
        if (states.length === 0) {
            return;
        }

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        this._drawCloud(ctx, states, timeScale, priceScale, hpr, vpr);
        this._drawShiftedLine(ctx, states, timeScale, priceScale, hpr, vpr, (state) => state.conversionLine, 0, this._ichimokuOptions.conversionColor);
        this._drawShiftedLine(ctx, states, timeScale, priceScale, hpr, vpr, (state) => state.baseLine, 0, this._ichimokuOptions.baseColor);
        this._drawShiftedLine(ctx, states, timeScale, priceScale, hpr, vpr, (state) => state.laggingSpan, -this._ichimokuOptions.displacement + 1, this._ichimokuOptions.laggingColor);
        this._drawShiftedLine(ctx, states, timeScale, priceScale, hpr, vpr, (state) => state.leadLine1, this._ichimokuOptions.displacement - 1, this._ichimokuOptions.leadingSpanAColor);
        this._drawShiftedLine(ctx, states, timeScale, priceScale, hpr, vpr, (state) => state.leadLine2, this._ichimokuOptions.displacement - 1, this._ichimokuOptions.leadingSpanBColor);

        ctx.restore();
    }

    private _drawShiftedLine(
        ctx: CanvasRenderingContext2D,
        states: IchimokuState[],
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number,
        accessor: (state: IchimokuState) => number,
        shift: number,
        color: string
    ): void {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = this._ichimokuOptions.lineWidth * hpr;

        let started = false;
        for (const state of states) {
            const value = accessor(state);
            if (!Number.isFinite(value)) {
                started = false;
                continue;
            }

            const x = timeScale.indexToCoordinate((state.index + shift) as any) * hpr;
            const y = priceScale.priceToCoordinate(value) * vpr;

            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();
    }

    private _drawCloud(
        ctx: CanvasRenderingContext2D,
        states: IchimokuState[],
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number
    ): void {
        const shift = this._ichimokuOptions.displacement - 1;
        for (let i = 1; i < states.length; i++) {
            const prev = states[i - 1];
            const curr = states[i];

            if (![prev.leadLine1, prev.leadLine2, curr.leadLine1, curr.leadLine2].every(Number.isFinite)) {
                continue;
            }

            const x1 = timeScale.indexToCoordinate((prev.index + shift) as any) * hpr;
            const x2 = timeScale.indexToCoordinate((curr.index + shift) as any) * hpr;
            const prevA = priceScale.priceToCoordinate(prev.leadLine1) * vpr;
            const prevB = priceScale.priceToCoordinate(prev.leadLine2) * vpr;
            const currA = priceScale.priceToCoordinate(curr.leadLine1) * vpr;
            const currB = priceScale.priceToCoordinate(curr.leadLine2) * vpr;

            ctx.beginPath();
            ctx.moveTo(x1, prevA);
            ctx.lineTo(x2, currA);
            ctx.lineTo(x2, currB);
            ctx.lineTo(x1, prevB);
            ctx.closePath();
            ctx.fillStyle = prev.leadLine1 > prev.leadLine2
                ? withAlpha(this._ichimokuOptions.cloudBullColor, this._ichimokuOptions.cloudOpacity)
                : withAlpha(this._ichimokuOptions.cloudBearColor, this._ichimokuOptions.cloudOpacity);
            ctx.fill();
        }
    }
}

function donchian(sourceData: BarData[], index: number, length: number): number {
    if (index < length - 1) {
        return NaN;
    }

    let lowest = Infinity;
    let highest = -Infinity;

    for (let i = index - length + 1; i <= index; i++) {
        lowest = Math.min(lowest, sourceData[i].low);
        highest = Math.max(highest, sourceData[i].high);
    }

    return (lowest + highest) / 2;
}

function withAlpha(color: string, alpha: number): string {
    const normalizedAlpha = Math.max(0, Math.min(1, alpha));

    if (color.startsWith('#')) {
        const hex = color.slice(1);
        const value = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
        if (value.length === 6) {
            const r = parseInt(value.slice(0, 2), 16);
            const g = parseInt(value.slice(2, 4), 16);
            const b = parseInt(value.slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
        }
    }

    if (color.startsWith('rgb(')) {
        return color.replace('rgb(', 'rgba(').replace(')', `, ${normalizedAlpha})`);
    }

    return color;
}
