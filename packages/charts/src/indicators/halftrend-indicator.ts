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

interface HalfTrendState {
    time: number;
    index: number;
    ht: number;
    atrHigh: number;
    atrLow: number;
    trend: 0 | 1;
    buySignal: boolean;
    sellSignal: boolean;
    arrowUp: number | null;
    arrowDown: number | null;
}

export interface HalfTrendIndicatorOptions extends IndicatorOptions {
    amplitude: number;
    channelDeviation: number;
    showArrows: boolean;
    showChannels: boolean;
    showLabels: boolean;
    buyColor: string;
    sellColor: string;
}

const defaultHalfTrendOptions: Partial<HalfTrendIndicatorOptions> = {
    name: 'HalfTrend',
    style: IndicatorStyle.Line,
    color: '#2962ff',
    lineWidth: 2,
    amplitude: 2,
    channelDeviation: 2,
    showArrows: true,
    showChannels: true,
    showLabels: true,
    buyColor: '#2962ff',
    sellColor: '#ef5350',
};

export class HalfTrendIndicator extends OverlayIndicator {
    private _halfTrendOptions: HalfTrendIndicatorOptions;
    private _states: HalfTrendState[] = [];

    constructor(options: Partial<HalfTrendIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultHalfTrendOptions, ...options };
        super(mergedOptions);
        this._halfTrendOptions = { ...defaultHalfTrendOptions, ...this._options } as HalfTrendIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._halfTrendOptions };
    }

    updateOptions(newOptions: Partial<HalfTrendIndicatorOptions>): boolean {
        const normalized = { ...newOptions };
        if (normalized.amplitude !== undefined) normalized.amplitude = Number(normalized.amplitude);
        if (normalized.channelDeviation !== undefined) normalized.channelDeviation = Number(normalized.channelDeviation);

        const needsRecalc =
            (normalized.amplitude !== undefined && normalized.amplitude !== this._halfTrendOptions.amplitude) ||
            (normalized.channelDeviation !== undefined && normalized.channelDeviation !== this._halfTrendOptions.channelDeviation);

        Object.assign(this._halfTrendOptions, normalized);
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
                        numberRow('amplitude', 'Amplitude', 1, 100, 1),
                        numberRow('channelDeviation', 'Channel Deviation', 1, 20, 1),
                        checkboxRow('showArrows', 'Show Arrows', this._halfTrendOptions.showArrows),
                        checkboxRow('showChannels', 'Show Channels', this._halfTrendOptions.showChannels),
                        checkboxRow('showLabels', 'Show Buy/Sell Labels', this._halfTrendOptions.showLabels),
                    ],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('buyColor', 'Buy Color', this._halfTrendOptions.buyColor),
                        colorRow('sellColor', 'Sell Color', this._halfTrendOptions.sellColor),
                        lineWidthRow('lineWidth', 'Line Width'),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<HalfTrendIndicatorOptions>);
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

        const amplitude = Math.max(1, Math.floor(this._halfTrendOptions.amplitude));
        const channelDeviation = Math.max(1, this._halfTrendOptions.channelDeviation);
        const atr = this._calculateAtr(sourceData, 100);
        const upSeries: number[] = new Array(sourceData.length).fill(NaN);
        const downSeries: number[] = new Array(sourceData.length).fill(NaN);

        let trendState: 0 | 1 = 0;
        let nextTrendState: 0 | 1 = 0;
        let maxLowPrice = sourceData[0].low;
        let minHighPrice = sourceData[0].high;

        for (let i = 0; i < sourceData.length; i++) {
            const bar = sourceData[i];
            const prevBar = sourceData[Math.max(0, i - 1)];
            const prevTrend = i > 0 ? this._states[i - 1].trend : null;
            const prevUp = i > 0 ? upSeries[i - 1] : NaN;
            const prevDown = i > 0 ? downSeries[i - 1] : NaN;
            const atr2 = atr[i] / 2;
            const dev = channelDeviation * atr2;
            const highPrice = _windowHighest(sourceData, i, amplitude, (item) => item.high);
            const lowPrice = _windowLowest(sourceData, i, amplitude, (item) => item.low);
            const highMa = _windowSma(sourceData, i, amplitude, (item) => item.high);
            const lowMa = _windowSma(sourceData, i, amplitude, (item) => item.low);

            if (nextTrendState === 1) {
                maxLowPrice = Math.max(lowPrice, maxLowPrice);

                if (!Number.isNaN(highMa) && highMa < maxLowPrice && bar.close < prevBar.low) {
                    trendState = 1;
                    nextTrendState = 0;
                    minHighPrice = highPrice;
                }
            } else {
                minHighPrice = Math.min(highPrice, minHighPrice);

                if (!Number.isNaN(lowMa) && lowMa > minHighPrice && bar.close > prevBar.high) {
                    trendState = 0;
                    nextTrendState = 1;
                    maxLowPrice = lowPrice;
                }
            }

            let currentUp = prevUp;
            let currentDown = prevDown;
            let atrHigh = NaN;
            let atrLow = NaN;
            let arrowUp: number | null = null;
            let arrowDown: number | null = null;

            if (trendState === 0) {
                if (prevTrend !== null && prevTrend !== 0) {
                    currentUp = Number.isFinite(prevDown) ? prevDown : currentDown;
                    arrowUp = currentUp - atr2;
                } else {
                    currentUp = Number.isFinite(prevUp) ? Math.max(maxLowPrice, prevUp) : maxLowPrice;
                }

                atrHigh = currentUp + dev;
                atrLow = currentUp - dev;
            } else {
                if (prevTrend !== null && prevTrend !== 1) {
                    currentDown = Number.isFinite(prevUp) ? prevUp : currentUp;
                    arrowDown = currentDown + atr2;
                } else {
                    currentDown = Number.isFinite(prevDown) ? Math.min(minHighPrice, prevDown) : minHighPrice;
                }

                atrHigh = currentDown + dev;
                atrLow = currentDown - dev;
            }

            upSeries[i] = currentUp;
            downSeries[i] = currentDown;

            const ht = trendState === 0 ? currentUp : currentDown;
            const buySignal = arrowUp !== null && trendState === 0 && prevTrend === 1;
            const sellSignal = arrowDown !== null && trendState === 1 && prevTrend === 0;

            this._states.push({
                time: bar.time,
                index: i,
                ht,
                atrHigh,
                atrLow,
                trend: trendState,
                buySignal,
                sellSignal,
                arrowUp,
                arrowDown,
            });
        }

        this._data = this._states.map((state) => ({
            time: state.time,
            value: state.ht,
        }));
    }

    getRange(): IndicatorRange {
        if (this._states.length === 0) {
            return { min: 0, max: 100 };
        }

        let min = Infinity;
        let max = -Infinity;
        for (const state of this._states) {
            min = Math.min(min, state.ht, state.atrHigh, state.atrLow);
            max = Math.max(max, state.ht, state.atrHigh, state.atrLow);
        }

        return { min, max };
    }

    getDescription(index?: number): string {
        const state =
            index !== undefined && index >= 0 && index < this._states.length
                ? this._states[index]
                : this._states[this._states.length - 1];

        if (!state) {
            return `HalfTrend (${this._halfTrendOptions.amplitude}, ${this._halfTrendOptions.channelDeviation})`;
        }

        return `HalfTrend (${this._halfTrendOptions.amplitude}, ${this._halfTrendOptions.channelDeviation}): ${state.ht.toFixed(2)}`;
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

        const buyColor = this._halfTrendOptions.buyColor;
        const sellColor = this._halfTrendOptions.sellColor;
        const buyFillColor = _withAlpha(buyColor, 0.15);
        const sellFillColor = _withAlpha(sellColor, 0.15);

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (this._halfTrendOptions.showChannels) {
            this._fillRibbon(ctx, visibleStates, timeScale, priceScale, hpr, vpr, sellFillColor, 'atrHigh');
            this._fillRibbon(ctx, visibleStates, timeScale, priceScale, hpr, vpr, buyFillColor, 'atrLow');
            this._drawChannelDots(ctx, visibleStates, timeScale, priceScale, hpr, vpr, sellColor, 'atrHigh');
            this._drawChannelDots(ctx, visibleStates, timeScale, priceScale, hpr, vpr, buyColor, 'atrLow');
        }

        this._drawHalfTrendLine(ctx, visibleStates, timeScale, priceScale, hpr, vpr, buyColor, sellColor);

        if (this._halfTrendOptions.showArrows || this._halfTrendOptions.showLabels) {
            for (const state of visibleStates) {
                if (state.buySignal && state.arrowUp !== null) {
                    this._drawSignal(ctx, timeScale, priceScale, state.index, state.arrowUp, 'buy', buyColor, hpr, vpr);
                }
                if (state.sellSignal && state.arrowDown !== null) {
                    this._drawSignal(ctx, timeScale, priceScale, state.index, state.arrowDown, 'sell', sellColor, hpr, vpr);
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
            const y1 = priceScale.priceToCoordinate(start.ht);
            const x2 = timeScale.indexToCoordinate(end.index as any);
            const y2 = priceScale.priceToCoordinate(end.ht);

            if (_distanceToSegment(x, y, x1, y1, x2, y2) <= 8) {
                return true;
            }
        }

        return false;
    }

    private _calculateAtr(sourceData: BarData[], period: number): number[] {
        const values = new Array<number>(sourceData.length).fill(0);
        let atr = 0;

        for (let i = 0; i < sourceData.length; i++) {
            const bar = sourceData[i];
            const prevClose = i > 0 ? sourceData[i - 1].close : bar.close;
            const tr = Math.max(
                bar.high - bar.low,
                Math.abs(bar.high - prevClose),
                Math.abs(bar.low - prevClose)
            );

            atr = i === 0 ? tr : atr + (tr - atr) / period;
            values[i] = atr;
        }

        return values;
    }

    private _fillRibbon(
        ctx: CanvasRenderingContext2D,
        states: HalfTrendState[],
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number,
        fillColor: string,
        channelKey: 'atrHigh' | 'atrLow'
    ): void {
        if (states.length < 2) {
            return;
        }

        ctx.beginPath();
        states.forEach((state, index) => {
            const x = timeScale.indexToCoordinate(state.index as any) * hpr;
            const y = priceScale.priceToCoordinate(state.ht) * vpr;
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        for (let i = states.length - 1; i >= 0; i--) {
            const state = states[i];
            const x = timeScale.indexToCoordinate(state.index as any) * hpr;
            const y = priceScale.priceToCoordinate(state[channelKey]) * vpr;
            ctx.lineTo(x, y);
        }

        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
    }

    private _drawChannelDots(
        ctx: CanvasRenderingContext2D,
        states: HalfTrendState[],
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number,
        color: string,
        channelKey: 'atrHigh' | 'atrLow'
    ): void {
        ctx.fillStyle = color;
        const radius = Math.max(1.25, this._halfTrendOptions.lineWidth) * hpr;

        for (const state of states) {
            const x = timeScale.indexToCoordinate(state.index as any) * hpr;
            const y = priceScale.priceToCoordinate(state[channelKey]) * vpr;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    private _drawHalfTrendLine(
        ctx: CanvasRenderingContext2D,
        states: HalfTrendState[],
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number,
        buyColor: string,
        sellColor: string
    ): void {
        if (states.length < 2) {
            return;
        }

        let segmentStart = 0;
        while (segmentStart < states.length) {
            const trend = states[segmentStart].trend;
            let segmentEnd = segmentStart + 1;

            while (segmentEnd < states.length && states[segmentEnd].trend === trend) {
                segmentEnd++;
            }

            ctx.beginPath();
            ctx.strokeStyle = trend === 0 ? buyColor : sellColor;
            ctx.lineWidth = this._halfTrendOptions.lineWidth * hpr;

            for (let i = segmentStart; i < segmentEnd; i++) {
                const state = states[i];
                const x = timeScale.indexToCoordinate(state.index as any) * hpr;
                const y = priceScale.priceToCoordinate(state.ht) * vpr;

                if (i === segmentStart) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }

            ctx.stroke();
            segmentStart = segmentEnd;
        }
    }

    private _drawSignal(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        index: number,
        price: number,
        direction: 'buy' | 'sell',
        color: string,
        hpr: number,
        vpr: number
    ): void {
        const x = timeScale.indexToCoordinate(index as any) * hpr;
        const y = priceScale.priceToCoordinate(price) * vpr;
        const arrowSize = 5 * hpr;

        if (this._halfTrendOptions.showArrows) {
            ctx.beginPath();
            if (direction === 'buy') {
                ctx.moveTo(x, y - arrowSize);
                ctx.lineTo(x - arrowSize, y + arrowSize);
                ctx.lineTo(x + arrowSize, y + arrowSize);
            } else {
                ctx.moveTo(x, y + arrowSize);
                ctx.lineTo(x - arrowSize, y - arrowSize);
                ctx.lineTo(x + arrowSize, y - arrowSize);
            }
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
        }

        if (!this._halfTrendOptions.showLabels) {
            return;
        }

        const label = direction === 'buy' ? 'Buy' : 'Sell';
        ctx.font = `${11 * hpr}px Arial`;
        const paddingX = 6 * hpr;
        const textWidth = ctx.measureText(label).width;
        const boxWidth = textWidth + paddingX * 2;
        const boxHeight = 16 * vpr;
        const offsetY = direction === 'buy' ? -(18 * vpr) : 18 * vpr;
        const boxX = x - boxWidth / 2;
        const boxY = direction === 'buy' ? y + offsetY - boxHeight : y + offsetY;

        ctx.fillStyle = color;
        _roundRect(ctx, boxX, boxY, boxWidth, boxHeight, 4 * hpr);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, boxY + boxHeight / 2);
    }
}

function _windowHighest(data: readonly BarData[], endIndex: number, length: number, accessor: (bar: BarData) => number): number {
    const startIndex = Math.max(0, endIndex - length + 1);
    let highest = -Infinity;
    for (let i = startIndex; i <= endIndex; i++) {
        highest = Math.max(highest, accessor(data[i]));
    }
    return highest;
}

function _windowLowest(data: readonly BarData[], endIndex: number, length: number, accessor: (bar: BarData) => number): number {
    const startIndex = Math.max(0, endIndex - length + 1);
    let lowest = Infinity;
    for (let i = startIndex; i <= endIndex; i++) {
        lowest = Math.min(lowest, accessor(data[i]));
    }
    return lowest;
}

function _windowSma(data: readonly BarData[], endIndex: number, length: number, accessor: (bar: BarData) => number): number {
    if (endIndex < length - 1) {
        return NaN;
    }

    let total = 0;
    for (let i = endIndex - length + 1; i <= endIndex; i++) {
        total += accessor(data[i]);
    }
    return total / length;
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
