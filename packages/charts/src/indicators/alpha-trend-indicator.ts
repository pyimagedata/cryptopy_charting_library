import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
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

interface AlphaTrendState {
    time: number;
    index: number;
    alpha: number;
    alpha2: number;
    fillColor: string;
    buySignal: boolean;
    sellSignal: boolean;
    validBuySignal: boolean;
    validSellSignal: boolean;
    buyPrice: number | null;
    sellPrice: number | null;
}

export interface AlphaTrendIndicatorOptions extends IndicatorOptions {
    multiplier: number;
    commonPeriod: number;
    showSignals: boolean;
    noVolumeData: boolean;
    primaryColor: string;
    secondaryColor: string;
    bullishFillColor: string;
    bearishFillColor: string;
}

const defaultAlphaTrendOptions: Partial<AlphaTrendIndicatorOptions> = {
    name: 'AlphaTrend',
    style: IndicatorStyle.Line,
    color: '#0022FC',
    lineWidth: 3,
    multiplier: 1,
    commonPeriod: 14,
    showSignals: true,
    noVolumeData: false,
    primaryColor: '#0022FC',
    secondaryColor: '#FC0400',
    bullishFillColor: '#00E60F',
    bearishFillColor: '#80000B',
};

export class AlphaTrendIndicator extends OverlayIndicator {
    private _alphaTrendOptions: AlphaTrendIndicatorOptions;
    private _states: AlphaTrendState[] = [];

    constructor(options: Partial<AlphaTrendIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultAlphaTrendOptions, ...options };
        super(mergedOptions);
        this._alphaTrendOptions = { ...defaultAlphaTrendOptions, ...this._options } as AlphaTrendIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._alphaTrendOptions };
    }

    updateOptions(newOptions: Partial<AlphaTrendIndicatorOptions>): boolean {
        const normalized = { ...newOptions };
        if (normalized.multiplier !== undefined) normalized.multiplier = Number(normalized.multiplier);
        if (normalized.commonPeriod !== undefined) normalized.commonPeriod = Number(normalized.commonPeriod);

        const needsRecalc =
            (normalized.multiplier !== undefined && normalized.multiplier !== this._alphaTrendOptions.multiplier) ||
            (normalized.commonPeriod !== undefined && normalized.commonPeriod !== this._alphaTrendOptions.commonPeriod) ||
            (normalized.noVolumeData !== undefined && normalized.noVolumeData !== this._alphaTrendOptions.noVolumeData);

        Object.assign(this._alphaTrendOptions, normalized);
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
                        numberRow('multiplier', 'Multiplier', 0.1, 10, 0.1),
                        numberRow('commonPeriod', 'Common Period', 1, 200, 1),
                        checkboxRow('showSignals', 'Show Signals?', this._alphaTrendOptions.showSignals),
                        checkboxRow('noVolumeData', 'Change calculation (no volume data)?', this._alphaTrendOptions.noVolumeData),
                    ],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('primaryColor', 'AlphaTrend Color', this._alphaTrendOptions.primaryColor),
                        colorRow('secondaryColor', 'AlphaTrend[2] Color', this._alphaTrendOptions.secondaryColor),
                        colorRow('bullishFillColor', 'Bullish Fill Color', this._alphaTrendOptions.bullishFillColor),
                        colorRow('bearishFillColor', 'Bearish Fill Color', this._alphaTrendOptions.bearishFillColor),
                        lineWidthRow('lineWidth', 'Line Width'),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<AlphaTrendIndicatorOptions>);
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._states = [];
        this._data = [];

        if (sourceData.length === 0) {
            return;
        }

        const period = Math.max(1, Math.floor(this._alphaTrendOptions.commonPeriod));
        const multiplier = this._alphaTrendOptions.multiplier;
        const trSeries = _calculateTrueRange(sourceData);
        const atrSeries = _calculateSmaSeries(trSeries, period);
        const closeSeries = sourceData.map((bar) => bar.close);
        const rsiSeries = _calculateRsi(closeSeries, period);
        const hasMissingVolume = sourceData.some((bar) => bar.volume === undefined);
        const useRsi = this._alphaTrendOptions.noVolumeData || hasMissingVolume;
        const mfiSeries = useRsi ? [] : _calculateMfi(sourceData, period);

        const buySignals: boolean[] = new Array(sourceData.length).fill(false);
        const sellSignals: boolean[] = new Array(sourceData.length).fill(false);
        const barsSinceBuy: number[] = new Array(sourceData.length).fill(NaN);
        const barsSinceSell: number[] = new Array(sourceData.length).fill(NaN);

        let alphaPrev = 0;

        for (let i = 0; i < sourceData.length; i++) {
            const bar = sourceData[i];
            const atr = atrSeries[i];
            const upT = Number.isFinite(atr) ? bar.low - atr * multiplier : NaN;
            const downT = Number.isFinite(atr) ? bar.high + atr * multiplier : NaN;
            const strength = useRsi ? rsiSeries[i] : mfiSeries[i];
            const isBullish = Number.isFinite(strength) && strength >= 50;

            let alpha = alphaPrev;
            if (isBullish) {
                alpha = upT < alphaPrev ? alphaPrev : upT;
            } else {
                alpha = downT > alphaPrev ? alphaPrev : downT;
            }

            const alpha2 = i >= 2 ? this._states[i - 2].alpha : NaN;
            const alpha3 = i >= 3 ? this._states[i - 3].alpha : NaN;
            const alpha1 = i >= 1 ? this._states[i - 1].alpha : NaN;

            const fillColor = Number.isFinite(alpha2) && alpha > alpha2
                ? this._alphaTrendOptions.bullishFillColor
                : Number.isFinite(alpha2) && alpha < alpha2
                    ? this._alphaTrendOptions.bearishFillColor
                    : Number.isFinite(alpha1) && Number.isFinite(alpha3) && alpha1 > alpha3
                        ? this._alphaTrendOptions.bullishFillColor
                        : this._alphaTrendOptions.bearishFillColor;

            const prevAlpha = i >= 1 ? this._states[i - 1].alpha : NaN;
            const prevAlpha2 = i >= 1 ? this._states[i - 1].alpha2 : NaN;
            const buySignal =
                Number.isFinite(alpha2) &&
                Number.isFinite(prevAlpha) &&
                Number.isFinite(prevAlpha2) &&
                alpha > alpha2 &&
                prevAlpha <= prevAlpha2;
            const sellSignal =
                Number.isFinite(alpha2) &&
                Number.isFinite(prevAlpha) &&
                Number.isFinite(prevAlpha2) &&
                alpha < alpha2 &&
                prevAlpha >= prevAlpha2;

            buySignals[i] = buySignal;
            sellSignals[i] = sellSignal;
            barsSinceBuy[i] = buySignal ? 0 : (i > 0 && Number.isFinite(barsSinceBuy[i - 1]) ? barsSinceBuy[i - 1] + 1 : NaN);
            barsSinceSell[i] = sellSignal ? 0 : (i > 0 && Number.isFinite(barsSinceSell[i - 1]) ? barsSinceSell[i - 1] + 1 : NaN);

            const o1 = i > 0 ? barsSinceBuy[i - 1] : NaN;
            const o2 = i > 0 ? barsSinceSell[i - 1] : NaN;
            const k1 = barsSinceBuy[i];
            const k2 = barsSinceSell[i];

            const validBuySignal = buySignal && o1 > k2;
            const validSellSignal = sellSignal && o2 > k1;

            this._states.push({
                time: bar.time,
                index: i,
                alpha,
                alpha2,
                fillColor,
                buySignal,
                sellSignal,
                validBuySignal,
                validSellSignal,
                buyPrice: validBuySignal && Number.isFinite(alpha2) ? alpha2 * 0.9999 : null,
                sellPrice: validSellSignal && Number.isFinite(alpha2) ? alpha2 * 1.0001 : null,
            });

            alphaPrev = alpha;
        }

        this._data = this._states.map((state) => ({
            time: state.time,
            value: state.alpha,
            values: Number.isFinite(state.alpha2) ? [state.alpha, state.alpha2] : [state.alpha],
        }));
    }

    getRange(): IndicatorRange {
        if (this._states.length === 0) {
            return { min: 0, max: 100 };
        }

        let min = Infinity;
        let max = -Infinity;

        for (const state of this._states) {
            min = Math.min(min, state.alpha);
            max = Math.max(max, state.alpha);
            if (Number.isFinite(state.alpha2)) {
                min = Math.min(min, state.alpha2);
                max = Math.max(max, state.alpha2);
            }
            if (state.buyPrice !== null) {
                min = Math.min(min, state.buyPrice);
                max = Math.max(max, state.buyPrice);
            }
            if (state.sellPrice !== null) {
                min = Math.min(min, state.sellPrice);
                max = Math.max(max, state.sellPrice);
            }
        }

        return { min, max };
    }

    getDescription(index?: number): string {
        const state =
            index !== undefined && index >= 0 && index < this._states.length
                ? this._states[index]
                : this._states[this._states.length - 1];

        if (!state) {
            return `AlphaTrend (${this._alphaTrendOptions.commonPeriod}, ${this._alphaTrendOptions.multiplier})`;
        }

        return `AlphaTrend (${this._alphaTrendOptions.commonPeriod}, ${this._alphaTrendOptions.multiplier}): ${state.alpha.toFixed(2)}`;
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

        const startIndex = visibleRange ? Math.max(0, Math.floor(visibleRange.from) - 1) : 0;
        const endIndex = visibleRange ? Math.min(this._states.length - 1, Math.ceil(visibleRange.to) + 1) : this._states.length - 1;
        const visibleStates = this._states.slice(startIndex, endIndex + 1);

        if (visibleStates.length === 0) {
            return;
        }

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        this._drawFill(ctx, visibleStates, timeScale, priceScale, hpr, vpr);
        this._drawLine(ctx, visibleStates, timeScale, priceScale, hpr, vpr, 'alpha', this._alphaTrendOptions.primaryColor);
        this._drawLine(ctx, visibleStates, timeScale, priceScale, hpr, vpr, 'alpha2', this._alphaTrendOptions.secondaryColor);

        if (this._alphaTrendOptions.showSignals) {
            for (const state of visibleStates) {
                if (state.validBuySignal && state.buyPrice !== null) {
                    this._drawLabel(ctx, timeScale, priceScale, state.index, state.buyPrice, 'BUY', this._alphaTrendOptions.primaryColor, 'up', hpr, vpr);
                }
                if (state.validSellSignal && state.sellPrice !== null) {
                    this._drawLabel(ctx, timeScale, priceScale, state.index, state.sellPrice, 'SELL', '#800000', 'down', hpr, vpr);
                }
            }
        }

        ctx.restore();
    }

    hitTest(x: number, y: number, timeScale: any, priceScale: any): boolean {
        if (this._states.length < 2) {
            return false;
        }

        for (let i = 1; i < this._states.length; i++) {
            const start = this._states[i - 1];
            const end = this._states[i];
            const x1 = timeScale.indexToCoordinate(start.index as any);
            const y1 = priceScale.priceToCoordinate(start.alpha);
            const x2 = timeScale.indexToCoordinate(end.index as any);
            const y2 = priceScale.priceToCoordinate(end.alpha);

            if (_distanceToSegment(x, y, x1, y1, x2, y2) <= 8) {
                return true;
            }
        }

        return false;
    }

    private _drawFill(
        ctx: CanvasRenderingContext2D,
        states: AlphaTrendState[],
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number
    ): void {
        for (let i = 1; i < states.length; i++) {
            const prev = states[i - 1];
            const curr = states[i];

            if (!Number.isFinite(prev.alpha2) || !Number.isFinite(curr.alpha2)) {
                continue;
            }

            const x1 = timeScale.indexToCoordinate(prev.index as any) * hpr;
            const x2 = timeScale.indexToCoordinate(curr.index as any) * hpr;
            const y1 = priceScale.priceToCoordinate(prev.alpha) * vpr;
            const y2 = priceScale.priceToCoordinate(curr.alpha) * vpr;
            const y3 = priceScale.priceToCoordinate(curr.alpha2) * vpr;
            const y4 = priceScale.priceToCoordinate(prev.alpha2) * vpr;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x2, y3);
            ctx.lineTo(x1, y4);
            ctx.closePath();
            ctx.fillStyle = _withAlpha(curr.fillColor, 0.25);
            ctx.fill();
        }
    }

    private _drawLine(
        ctx: CanvasRenderingContext2D,
        states: AlphaTrendState[],
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number,
        key: 'alpha' | 'alpha2',
        color: string
    ): void {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = this._alphaTrendOptions.lineWidth * hpr;

        let started = false;
        for (const state of states) {
            const value = state[key];
            if (!Number.isFinite(value)) {
                started = false;
                continue;
            }

            const x = timeScale.indexToCoordinate(state.index as any) * hpr;
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

    private _drawLabel(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        index: number,
        price: number,
        text: 'BUY' | 'SELL',
        color: string,
        direction: 'up' | 'down',
        hpr: number,
        vpr: number
    ): void {
        const x = timeScale.indexToCoordinate(index as any) * hpr;
        const y = priceScale.priceToCoordinate(price) * vpr;

        ctx.save();
        ctx.font = `${10 * hpr}px Arial`;
        const paddingX = 5 * hpr;
        const textWidth = ctx.measureText(text).width;
        const boxWidth = textWidth + paddingX * 2;
        const boxHeight = 15 * vpr;
        const boxX = x - boxWidth / 2;
        const boxY = direction === 'up' ? y - 18 * vpr : y + 4 * vpr;

        ctx.fillStyle = color;
        _roundRect(ctx, boxX, boxY, boxWidth, boxHeight, 4 * hpr);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, boxY + boxHeight / 2);
        ctx.restore();
    }
}

function _calculateTrueRange(sourceData: readonly BarData[]): number[] {
    const values = new Array<number>(sourceData.length).fill(0);
    for (let i = 0; i < sourceData.length; i++) {
        const bar = sourceData[i];
        const prevClose = i > 0 ? sourceData[i - 1].close : bar.close;
        values[i] = Math.max(
            bar.high - bar.low,
            Math.abs(bar.high - prevClose),
            Math.abs(bar.low - prevClose)
        );
    }
    return values;
}

function _calculateSmaSeries(values: readonly number[], period: number): number[] {
    const result = new Array<number>(values.length).fill(NaN);
    let sum = 0;

    for (let i = 0; i < values.length; i++) {
        sum += values[i];
        if (i >= period) {
            sum -= values[i - period];
        }
        if (i >= period - 1) {
            result[i] = sum / period;
        }
    }

    return result;
}

function _calculateRsi(values: readonly number[], period: number): number[] {
    const result = new Array<number>(values.length).fill(NaN);
    if (values.length <= period) {
        return result;
    }

    let gainSum = 0;
    let lossSum = 0;

    for (let i = 1; i <= period; i++) {
        const change = values[i] - values[i - 1];
        gainSum += Math.max(change, 0);
        lossSum += Math.max(-change, 0);
    }

    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;
    result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

    for (let i = period + 1; i < values.length; i++) {
        const change = values[i] - values[i - 1];
        avgGain = ((avgGain * (period - 1)) + Math.max(change, 0)) / period;
        avgLoss = ((avgLoss * (period - 1)) + Math.max(-change, 0)) / period;
        result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }

    return result;
}

function _calculateMfi(sourceData: readonly BarData[], period: number): number[] {
    const typicalPrices = sourceData.map((bar) => (bar.high + bar.low + bar.close) / 3);
    const positiveFlow = new Array<number>(sourceData.length).fill(0);
    const negativeFlow = new Array<number>(sourceData.length).fill(0);
    const result = new Array<number>(sourceData.length).fill(NaN);

    for (let i = 1; i < sourceData.length; i++) {
        const volume = sourceData[i].volume ?? 0;
        const moneyFlow = typicalPrices[i] * volume;
        if (typicalPrices[i] > typicalPrices[i - 1]) {
            positiveFlow[i] = moneyFlow;
        } else if (typicalPrices[i] < typicalPrices[i - 1]) {
            negativeFlow[i] = moneyFlow;
        }
    }

    let posSum = 0;
    let negSum = 0;
    for (let i = 1; i < sourceData.length; i++) {
        posSum += positiveFlow[i];
        negSum += negativeFlow[i];

        if (i > period) {
            posSum -= positiveFlow[i - period];
            negSum -= negativeFlow[i - period];
        }

        if (i >= period) {
            if (negSum === 0 && posSum === 0) {
                result[i] = 50;
            } else if (negSum === 0) {
                result[i] = 100;
            } else {
                const moneyRatio = posSum / negSum;
                result[i] = 100 - 100 / (1 + moneyRatio);
            }
        }
    }

    return result;
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

function _roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
): void {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
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
