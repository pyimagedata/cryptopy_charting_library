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

interface SuperTrendState {
    time: number;
    index: number;
    trend: 1 | -1;
    up: number;
    dn: number;
    lineValue: number;
    ohlc4: number;
    buySignal: boolean;
    sellSignal: boolean;
}

export interface SuperTrendIndicatorOptions extends IndicatorOptions {
    period: number;
    multiplier: number;
    changeATR: boolean;
    showSignals: boolean;
    highlighting: boolean;
    upColor: string;
    downColor: string;
}

const defaultSuperTrendOptions: Partial<SuperTrendIndicatorOptions> = {
    name: 'SuperTrend',
    style: IndicatorStyle.Line,
    color: '#22c55e',
    lineWidth: 2,
    period: 10,
    multiplier: 3,
    changeATR: true,
    showSignals: true,
    highlighting: true,
    upColor: '#22c55e',
    downColor: '#ef4444',
};

export class SuperTrendIndicator extends OverlayIndicator {
    private _superTrendOptions: SuperTrendIndicatorOptions;
    private _states: SuperTrendState[] = [];

    constructor(options: Partial<SuperTrendIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultSuperTrendOptions, ...options };
        super(mergedOptions);
        this._superTrendOptions = { ...defaultSuperTrendOptions, ...this._options } as SuperTrendIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._superTrendOptions };
    }

    updateOptions(newOptions: Partial<SuperTrendIndicatorOptions>): boolean {
        const normalized = { ...newOptions };
        if (normalized.period !== undefined) normalized.period = Number(normalized.period);
        if (normalized.multiplier !== undefined) normalized.multiplier = Number(normalized.multiplier);

        const needsRecalc =
            (normalized.period !== undefined && normalized.period !== this._superTrendOptions.period) ||
            (normalized.multiplier !== undefined && normalized.multiplier !== this._superTrendOptions.multiplier) ||
            (normalized.changeATR !== undefined && normalized.changeATR !== this._superTrendOptions.changeATR);

        Object.assign(this._superTrendOptions, normalized);
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
                        numberRow('period', 'ATR Period', 1, 200, 1),
                        numberRow('multiplier', 'ATR Multiplier', 0.1, 20, 0.1),
                        checkboxRow('changeATR', 'Change ATR Calculation Method ?', this._superTrendOptions.changeATR),
                        checkboxRow('showSignals', 'Show Buy/Sell Signals', this._superTrendOptions.showSignals),
                        checkboxRow('highlighting', 'Highlighter On/Off', this._superTrendOptions.highlighting),
                    ],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('upColor', 'Up Trend Color', this._superTrendOptions.upColor),
                        colorRow('downColor', 'Down Trend Color', this._superTrendOptions.downColor),
                        lineWidthRow('lineWidth', 'Line Width'),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<SuperTrendIndicatorOptions>);
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

        const period = Math.max(1, Math.floor(this._superTrendOptions.period));
        const multiplier = this._superTrendOptions.multiplier;
        const tr = _calculateTrueRange(sourceData);
        const atrRma = _calculateRma(tr, period);
        const atrSma = _calculateSmaSeries(tr, period);

        let prevTrend: 1 | -1 = 1;

        for (let i = 0; i < sourceData.length; i++) {
            const bar = sourceData[i];
            const atr = this._superTrendOptions.changeATR ? atrRma[i] : atrSma[i];
            const src = (bar.high + bar.low) / 2;
            const rawUp = src - multiplier * atr;
            const rawDn = src + multiplier * atr;

            const prevState = i > 0 ? this._states[i - 1] : null;
            const prevClose = i > 0 ? sourceData[i - 1].close : bar.close;
            const up1 = prevState && Number.isFinite(prevState.up) ? prevState.up : rawUp;
            const dn1 = prevState && Number.isFinite(prevState.dn) ? prevState.dn : rawDn;

            const up = prevClose > up1 ? Math.max(rawUp, up1) : rawUp;
            const dn = prevClose < dn1 ? Math.min(rawDn, dn1) : rawDn;

            const trend: 1 | -1 =
                prevTrend === -1 && bar.close > dn1
                    ? 1
                    : prevTrend === 1 && bar.close < up1
                        ? -1
                        : prevTrend;

            const hasAtr = Number.isFinite(atr);
            const buySignal = hasAtr && trend === 1 && prevTrend === -1;
            const sellSignal = hasAtr && trend === -1 && prevTrend === 1;
            const lineValue = hasAtr ? (trend === 1 ? up : dn) : NaN;

            this._states.push({
                time: bar.time,
                index: i,
                trend,
                up,
                dn,
                lineValue,
                ohlc4: (bar.open + bar.high + bar.low + bar.close) / 4,
                buySignal,
                sellSignal,
            });

            prevTrend = trend;
        }

        this._data = this._states.map((state) => ({
            time: state.time,
            value: state.lineValue,
        }));
    }

    getRange(): IndicatorRange {
        if (this._states.length === 0) {
            return { min: 0, max: 100 };
        }

        let min = Infinity;
        let max = -Infinity;
        for (const state of this._states) {
            min = Math.min(min, state.up, state.dn, state.ohlc4);
            max = Math.max(max, state.up, state.dn, state.ohlc4);
        }
        return { min, max };
    }

    getDescription(index?: number): string {
        const state =
            index !== undefined && index >= 0 && index < this._states.length
                ? this._states[index]
                : this._states[this._states.length - 1];

        if (!state) {
            return `SuperTrend (${this._superTrendOptions.period}, ${this._superTrendOptions.multiplier})`;
        }

        return `SuperTrend (${this._superTrendOptions.period}, ${this._superTrendOptions.multiplier}): ${state.lineValue.toFixed(2)}`;
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

        if (this._superTrendOptions.highlighting) {
            this._fillTrendRibbon(ctx, visibleStates, timeScale, priceScale, hpr, vpr, 1, _withAlpha(this._superTrendOptions.upColor, 0.16));
            this._fillTrendRibbon(ctx, visibleStates, timeScale, priceScale, hpr, vpr, -1, _withAlpha(this._superTrendOptions.downColor, 0.16));
        }

        this._drawTrendSegments(ctx, visibleStates, timeScale, priceScale, hpr, vpr, 1, this._superTrendOptions.upColor);
        this._drawTrendSegments(ctx, visibleStates, timeScale, priceScale, hpr, vpr, -1, this._superTrendOptions.downColor);

        for (const state of visibleStates) {
            if (state.buySignal) {
                this._drawSignal(ctx, timeScale, priceScale, state.index, state.up, 'Buy', this._superTrendOptions.upColor, hpr, vpr);
            }
            if (state.sellSignal) {
                this._drawSignal(ctx, timeScale, priceScale, state.index, state.dn, 'Sell', this._superTrendOptions.downColor, hpr, vpr);
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

            if (start.trend !== end.trend) {
                continue;
            }

            if (!Number.isFinite(start.lineValue) || !Number.isFinite(end.lineValue)) {
                continue;
            }

            const x1 = timeScale.indexToCoordinate(start.index as any);
            const y1 = priceScale.priceToCoordinate(start.lineValue);
            const x2 = timeScale.indexToCoordinate(end.index as any);
            const y2 = priceScale.priceToCoordinate(end.lineValue);

            if (_distanceToSegment(x, y, x1, y1, x2, y2) <= 8) {
                return true;
            }
        }

        return false;
    }

    private _fillTrendRibbon(
        ctx: CanvasRenderingContext2D,
        states: SuperTrendState[],
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number,
        trend: 1 | -1,
        fillColor: string
    ): void {
        let start = 0;
        while (start < states.length) {
            while (start < states.length && states[start].trend !== trend) {
                start++;
            }

            if (start >= states.length) {
                break;
            }

            let end = start + 1;
            while (end < states.length && states[end].trend === trend) {
                end++;
            }

            const segment = states.slice(start, end);
            if (segment.length >= 2) {
                ctx.beginPath();
                let started = false;
                segment.forEach((state) => {
                    if (!Number.isFinite(state.lineValue)) {
                        return;
                    }
                    const x = timeScale.indexToCoordinate(state.index as any) * hpr;
                    const y = priceScale.priceToCoordinate(state.lineValue) * vpr;
                    if (!started) {
                        ctx.moveTo(x, y);
                        started = true;
                        return;
                    }
                    ctx.lineTo(x, y);
                });

                for (let i = segment.length - 1; i >= 0; i--) {
                    const state = segment[i];
                    if (!Number.isFinite(state.lineValue)) {
                        continue;
                    }
                    const x = timeScale.indexToCoordinate(state.index as any) * hpr;
                    const y = priceScale.priceToCoordinate(state.ohlc4) * vpr;
                    ctx.lineTo(x, y);
                }

                if (started) {
                    ctx.closePath();
                    ctx.fillStyle = fillColor;
                    ctx.fill();
                }
            }

            start = end;
        }
    }

    private _drawTrendSegments(
        ctx: CanvasRenderingContext2D,
        states: SuperTrendState[],
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number,
        trend: 1 | -1,
        color: string
    ): void {
        let start = 0;
        while (start < states.length) {
            while (start < states.length && states[start].trend !== trend) {
                start++;
            }

            if (start >= states.length) {
                break;
            }

            let end = start + 1;
            while (end < states.length && states[end].trend === trend) {
                end++;
            }

            const segment = states.slice(start, end);
            if (segment.length >= 1) {
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.lineWidth = this._superTrendOptions.lineWidth * hpr;
                let started = false;
                segment.forEach((state) => {
                    if (!Number.isFinite(state.lineValue)) {
                        return;
                    }
                    const x = timeScale.indexToCoordinate(state.index as any) * hpr;
                    const y = priceScale.priceToCoordinate(state.lineValue) * vpr;
                    if (!started) {
                        ctx.moveTo(x, y);
                        started = true;
                        return;
                    }
                    ctx.lineTo(x, y);
                });
                if (started) {
                    ctx.stroke();
                }
            }

            start = end;
        }
    }

    private _drawSignal(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        index: number,
        price: number,
        label: 'Buy' | 'Sell',
        color: string,
        hpr: number,
        vpr: number
    ): void {
        const x = timeScale.indexToCoordinate(index as any) * hpr;
        const y = priceScale.priceToCoordinate(price) * vpr;
        const radius = 3 * hpr;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        if (!this._superTrendOptions.showSignals) {
            return;
        }

        ctx.save();
        ctx.font = `${11 * hpr}px Arial`;
        const paddingX = 6 * hpr;
        const textWidth = ctx.measureText(label).width;
        const boxWidth = textWidth + paddingX * 2;
        const boxHeight = 16 * vpr;
        const isBuy = label === 'Buy';
        const offsetY = isBuy ? -(18 * vpr) : 10 * vpr;
        const boxX = x - boxWidth / 2;
        const boxY = y + offsetY;

        ctx.fillStyle = color;
        _roundRect(ctx, boxX, boxY, boxWidth, boxHeight, 4 * hpr);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, boxY + boxHeight / 2);
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

function _calculateRma(values: readonly number[], period: number): number[] {
    const result = new Array<number>(values.length).fill(NaN);
    if (values.length === 0) {
        return result;
    }

    let sum = 0;
    let prev = NaN;

    for (let i = 0; i < values.length; i++) {
        sum += values[i];
        if (i < period - 1) {
            continue;
        }

        if (i === period - 1) {
            prev = sum / period;
        } else {
            prev = ((prev * (period - 1)) + values[i]) / period;
        }

        result[i] = prev;
    }

    return result;
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
