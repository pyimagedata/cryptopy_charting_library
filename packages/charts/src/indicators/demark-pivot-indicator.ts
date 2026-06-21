import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import { TimeScale } from '../model/time-scale';
import { PriceScale } from '../model/price-scale';
import {
    checkboxRow,
    createInputsTab,
} from '../gui/indicator_settings/base/helpers';
import { IndicatorSettingsConfig } from '../gui/indicator_settings/base/types';

export type PivotTimeframe = 'D' | 'W' | 'M';

export interface DeMarkPivotSummaryRow {
    timeframe: PivotTimeframe;
    label: string;
    values: {
        r3: number;
        r2: number;
        r1: number;
        pp: number;
        s1: number;
        s2: number;
        s3: number;
    };
}

interface PeriodBucket {
    key: string;
    open: number;
    high: number;
    low: number;
    close: number;
    startIndex: number;
    endIndex: number;
}

export interface DeMarkPivotIndicatorOptions extends IndicatorOptions {
    timeframe: PivotTimeframe;
    showDailyPivots: boolean;
    showWeeklyPivots: boolean;
    showMonthlyPivots: boolean;
    useClassicPrevOpen: boolean;
    showPivots: boolean;
    showClose: boolean;
    showObv: boolean;
    obvDivider: number;
    rColor: string;
    ppColor: string;
    sColor: string;
    closeColor: string;
    obvColor: string;
    obvRefColor: string;
}

const defaultOptions: Partial<DeMarkPivotIndicatorOptions> = {
    name: 'GainMetrics',
    timeframe: 'D',
    showDailyPivots: true,
    showWeeklyPivots: false,
    showMonthlyPivots: false,
    useClassicPrevOpen: false,
    showPivots: true,
    showClose: false,
    showObv: false,
    obvDivider: 250000000,
    color: '#f6c343',
    lineWidth: 1,
    style: IndicatorStyle.Line,
    rColor: '#ef5350',
    ppColor: '#f6c343',
    sColor: '#22c55e',
    closeColor: '#ffffff',
    obvColor: '#787b86',
    obvRefColor: '#d946ef',
};

const PIVOT_BASE_INDEX: Record<PivotTimeframe, number> = {
    D: 0,
    W: 7,
    M: 14,
};

const VALUE_INDEX = {
    close: 27,
    obv: 28,
    ro1: 29,
    ro2: 30,
    ro3: 31,
} as const;

const PIVOT_LEVELS = [
    { key: 'r3', offset: 0, alpha: 1 },
    { key: 'r2', offset: 1, alpha: 0.8 },
    { key: 'r1', offset: 2, alpha: 0.6 },
    { key: 'pp', offset: 3, alpha: 1, widthBoost: 1 },
    { key: 's1', offset: 4, alpha: 0.6 },
    { key: 's2', offset: 5, alpha: 0.8 },
    { key: 's3', offset: 6, alpha: 1 },
];

const DATA_VALUE_COUNT = 32;

export class DeMarkPivotIndicator extends OverlayIndicator {
    private _pivotOptions: DeMarkPivotIndicatorOptions;
    private _pivotSourceData: Partial<Record<PivotTimeframe, BarData[]>> = {};

    constructor(options: Partial<DeMarkPivotIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultOptions, ...options };
        const hasPivotCheckboxes = options.showDailyPivots !== undefined
            || options.showWeeklyPivots !== undefined
            || options.showMonthlyPivots !== undefined;

        if (!hasPivotCheckboxes) {
            const timeframe = (options.timeframe || mergedOptions.timeframe || 'D') as PivotTimeframe;
            mergedOptions.showDailyPivots = timeframe === 'D';
            mergedOptions.showWeeklyPivots = timeframe === 'W';
            mergedOptions.showMonthlyPivots = timeframe === 'M';
        }

        mergedOptions.name = getIndicatorName();
        super(mergedOptions);
        this._pivotOptions = { ...defaultOptions, ...this._options } as DeMarkPivotIndicatorOptions;
        this._syncName();
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([
                    {
                        rows: [
                            checkboxRow('showDailyPivots', 'Günlük', this._pivotOptions.showDailyPivots),
                            checkboxRow('showWeeklyPivots', 'Haftalık', this._pivotOptions.showWeeklyPivots),
                            checkboxRow('showMonthlyPivots', 'Aylık', this._pivotOptions.showMonthlyPivots),
                        ],
                    },
                ]),
            ],
        };
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._pivotOptions };
    }

    get pivotTimeframe(): PivotTimeframe {
        return this.pivotTimeframes[0] ?? this._pivotOptions.timeframe;
    }

    get pivotTimeframes(): PivotTimeframe[] {
        const timeframes: PivotTimeframe[] = [];
        if (this._pivotOptions.showDailyPivots) {
            timeframes.push('D');
        }
        if (this._pivotOptions.showWeeklyPivots) {
            timeframes.push('W');
        }
        if (this._pivotOptions.showMonthlyPivots) {
            timeframes.push('M');
        }
        return timeframes;
    }

    setPivotSourceData(timeframe: PivotTimeframe, data: BarData[]): void {
        this._pivotSourceData[timeframe] = data;

        if (this.pivotTimeframes.includes(timeframe) && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
            this._dataChanged.fire();
        }
    }

    clearPivotSourceData(): void {
        this._pivotSourceData = {};
    }

    setSettingValue(key: string, value: any): boolean {
        const oldValue = (this._pivotOptions as any)[key];
        if (oldValue === value) {
            return false;
        }

        (this._pivotOptions as any)[key] = value;
        (this._options as any)[key] = value;
        if (key === 'timeframe') {
            this._pivotOptions.showDailyPivots = value === 'D';
            this._pivotOptions.showWeeklyPivots = value === 'W';
            this._pivotOptions.showMonthlyPivots = value === 'M';
            (this._options as any).showDailyPivots = this._pivotOptions.showDailyPivots;
            (this._options as any).showWeeklyPivots = this._pivotOptions.showWeeklyPivots;
            (this._options as any).showMonthlyPivots = this._pivotOptions.showMonthlyPivots;
        }
        this._syncName();

        const needsRecalc = key === 'timeframe'
            || key === 'showDailyPivots'
            || key === 'showWeeklyPivots'
            || key === 'showMonthlyPivots'
            || key === 'useClassicPrevOpen'
            || key === 'obvDivider';
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }

        this._dataChanged.fire();
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._data = sourceData.map((bar) => ({
            time: bar.time,
            value: NaN,
            values: new Array(DATA_VALUE_COUNT).fill(NaN),
        }));

        if (sourceData.length === 0) {
            return;
        }

        for (const timeframe of this.pivotTimeframes) {
            const pivotSource = this._pivotSourceData[timeframe];
            if (pivotSource && pivotSource.length > 1) {
                this._applyPivotLevelsFromSource(sourceData, pivotSource, timeframe);
            } else {
                this._applyPivotLevelsFromSourceBuckets(sourceData, timeframe);
            }
        }

        this._applyClose(sourceData);
        this._applyObv(sourceData);
    }

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: TimeScale,
        priceScale: PriceScale,
        hpr: number,
        vpr: number,
        visibleRange: { from: number; to: number }
    ): void {
        const startIndex = Math.max(0, Math.floor(visibleRange.from));
        const endIndex = Math.min(this._data.length - 1, Math.ceil(visibleRange.to));

        if (this._pivotOptions.showPivots) {
            for (const timeframe of this.pivotTimeframes) {
                const latestStartIndex = this._getLatestPeriodStartIndex(timeframe);
                const drawStartIndex = Math.max(startIndex, latestStartIndex);
                if (drawStartIndex <= endIndex) {
                    this._drawPivotLevels(ctx, timeScale, priceScale, timeframe, drawStartIndex, endIndex, hpr, vpr);
                }
            }
        }

        if (this._pivotOptions.showClose) {
            this._drawValueLine(ctx, timeScale, priceScale, VALUE_INDEX.close, this._pivotOptions.closeColor, startIndex, endIndex, hpr, vpr);
        }

        if (this._pivotOptions.showObv) {
            this._drawValueLine(ctx, timeScale, priceScale, VALUE_INDEX.obv, this._pivotOptions.obvColor, startIndex, endIndex, hpr, vpr);
            this._drawValueLine(ctx, timeScale, priceScale, VALUE_INDEX.ro1, this._pivotOptions.obvRefColor, startIndex, endIndex, hpr, vpr);
            this._drawValueLine(ctx, timeScale, priceScale, VALUE_INDEX.ro2, applyAlpha(this._pivotOptions.obvRefColor, 0.7), startIndex, endIndex, hpr, vpr);
            this._drawValueLine(ctx, timeScale, priceScale, VALUE_INDEX.ro3, applyAlpha(this._pivotOptions.obvRefColor, 0.45), startIndex, endIndex, hpr, vpr);
        }
    }

    getRange(): IndicatorRange {
        const visibleIndices = this._pivotOptions.showPivots
            ? this.pivotTimeframes.flatMap((timeframe) => PIVOT_LEVELS.map((level) => this._pivotValueIndex(timeframe, level.offset)))
            : [];

        let min = Infinity;
        let max = -Infinity;
        for (const point of this._data) {
            const values = point.values || [];
            for (const index of visibleIndices) {
                const value = values[index];
                if (Number.isFinite(value)) {
                    min = Math.min(min, value);
                    max = Math.max(max, value);
                }
            }
        }

        return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : { min: 0, max: 100 };
    }

    getDescription(index?: number): string {
        const dataIndex = index !== undefined && index >= 0 && index < this._data.length
            ? index
            : this._data.length - 1;
        const timeframe = this.pivotTimeframes[0];
        const value = timeframe ? this._data[dataIndex]?.values?.[this._pivotValueIndex(timeframe, 3)] ?? NaN : NaN;
        const labels = this.pivotTimeframes.map(getTimeframeLabel).join('/');
        return `GainMetrics ${labels || 'Kapalı'} ${Number.isFinite(value) ? value.toFixed(2) : '-'}`;
    }

    getPivotSummaryRows(): DeMarkPivotSummaryRow[] {
        const rows: DeMarkPivotSummaryRow[] = [];

        for (const timeframe of this.pivotTimeframes) {
            const dataIndex = this._findLatestPivotIndex(timeframe);
            if (dataIndex === -1) {
                continue;
            }

            const values = this._data[dataIndex].values!;
            rows.push({
                timeframe,
                label: getTimeframeLabel(timeframe),
                values: {
                    r3: values[this._pivotValueIndex(timeframe, 0)],
                    r2: values[this._pivotValueIndex(timeframe, 1)],
                    r1: values[this._pivotValueIndex(timeframe, 2)],
                    pp: values[this._pivotValueIndex(timeframe, 3)],
                    s1: values[this._pivotValueIndex(timeframe, 4)],
                    s2: values[this._pivotValueIndex(timeframe, 5)],
                    s3: values[this._pivotValueIndex(timeframe, 6)],
                },
            });
        }

        return rows;
    }

    private _syncName(): void {
        this._pivotOptions.name = getIndicatorName();
        this._options.name = this._pivotOptions.name;
    }

    private _pivotValueIndex(timeframe: PivotTimeframe, offset: number): number {
        return PIVOT_BASE_INDEX[timeframe] + offset;
    }

    private _findLatestPivotIndex(timeframe: PivotTimeframe): number {
        const ppIndex = this._pivotValueIndex(timeframe, 3);

        for (let i = this._data.length - 1; i >= 0; i--) {
            const value = this._data[i]?.values?.[ppIndex];
            if (typeof value === 'number' && Number.isFinite(value)) {
                return i;
            }
        }

        return -1;
    }

    private _getLatestPeriodStartIndex(timeframe: PivotTimeframe): number {
        if (this._data.length === 0) {
            return 0;
        }
        const lastIndex = this._data.length - 1;
        const lastTime = this._data[lastIndex].time;
        const lastKey = getPeriodKey(lastTime, timeframe);

        for (let i = lastIndex - 1; i >= 0; i--) {
            if (getPeriodKey(this._data[i].time, timeframe) !== lastKey) {
                return i + 1;
            }
        }
        return 0;
    }

    private _buildPeriodBuckets(sourceData: BarData[], timeframe: PivotTimeframe): PeriodBucket[] {
        const buckets: PeriodBucket[] = [];

        sourceData.forEach((bar, index) => {
            const key = getPeriodKey(bar.time, timeframe);
            let bucket = buckets[buckets.length - 1];
            if (!bucket || bucket.key !== key) {
                bucket = {
                    key,
                    open: bar.open,
                    high: bar.high,
                    low: bar.low,
                    close: bar.close,
                    startIndex: index,
                    endIndex: index,
                };
                buckets.push(bucket);
                return;
            }

            bucket.high = Math.max(bucket.high, bar.high);
            bucket.low = Math.min(bucket.low, bar.low);
            bucket.close = bar.close;
            bucket.endIndex = index;
        });

        return buckets;
    }

    private _applyPivotLevelsFromSource(sourceData: BarData[], pivotData: BarData[], timeframe: PivotTimeframe): void {
        const levelsByPeriod = new Map<string, Record<string, number>>();

        for (let i = 1; i < pivotData.length; i++) {
            const prev = pivotData[i - 1];
            const current = pivotData[i];
            const currentBucket: PeriodBucket = {
                key: getPeriodKey(current.time, timeframe),
                open: current.open,
                high: current.high,
                low: current.low,
                close: current.close,
                startIndex: 0,
                endIndex: 0,
            };
            const prevBucket: PeriodBucket = {
                key: getPeriodKey(prev.time, timeframe),
                open: prev.open,
                high: prev.high,
                low: prev.low,
                close: prev.close,
                startIndex: 0,
                endIndex: 0,
            };
            levelsByPeriod.set(currentBucket.key, this._calculatePivotLevels(prevBucket, currentBucket));
        }

        for (let i = 0; i < sourceData.length; i++) {
            const levels = levelsByPeriod.get(getPeriodKey(sourceData[i].time, timeframe));
            if (levels) {
                this._setPivotValues(i, levels, timeframe);
            }
        }
    }

    private _applyPivotLevelsFromSourceBuckets(sourceData: BarData[], timeframe: PivotTimeframe): void {
        const buckets = this._buildPeriodBuckets(sourceData, timeframe);
        for (let i = 1; i < buckets.length; i++) {
            const prev = buckets[i - 1];
            const current = buckets[i];
            const levels = this._calculatePivotLevels(prev, current);

            for (let index = current.startIndex; index <= current.endIndex; index++) {
                this._setPivotValues(index, levels, timeframe);
            }
        }
    }

    private _setPivotValues(index: number, levels: Record<string, number>, timeframe: PivotTimeframe): void {
        const values = this._data[index].values!;
        values[this._pivotValueIndex(timeframe, 0)] = levels.r3;
        values[this._pivotValueIndex(timeframe, 1)] = levels.r2;
        values[this._pivotValueIndex(timeframe, 2)] = levels.r1;
        values[this._pivotValueIndex(timeframe, 3)] = levels.pp;
        values[this._pivotValueIndex(timeframe, 4)] = levels.s1;
        values[this._pivotValueIndex(timeframe, 5)] = levels.s2;
        values[this._pivotValueIndex(timeframe, 6)] = levels.s3;
        this._data[index].value = levels.pp;
    }

    private _calculatePivotLevels(prev: PeriodBucket, current: PeriodBucket): Record<string, number> {
        const pivotOpen = this._pivotOptions.useClassicPrevOpen ? prev.open : current.open;
        const x = prev.close < pivotOpen
            ? prev.low + prev.low + prev.high + prev.close
            : prev.close > pivotOpen
                ? prev.high + prev.high + prev.low + prev.close
                : prev.close + prev.close + prev.high + prev.low;
        const pp = x / 4;
        const range = prev.high - prev.low;
        const r1 = 2 * pp - prev.low;
        const s1 = 2 * pp - prev.high;

        return {
            pp,
            r1,
            s1,
            r2: pp + range,
            s2: pp - range,
            r3: r1 + range,
            s3: s1 - range,
        };
    }

    private _applyClose(sourceData: BarData[]): void {
        for (let i = 0; i < sourceData.length; i++) {
            this._data[i].values![VALUE_INDEX.close] = sourceData[i].close;
        }
    }

    private _applyObv(sourceData: BarData[]): void {
        let obv = 0;
        const obvValues: number[] = [];

        for (let i = 0; i < sourceData.length; i++) {
            if (i > 0) {
                const volume = sourceData[i].volume ?? 0;
                if (sourceData[i].close > sourceData[i - 1].close) {
                    obv += volume;
                } else if (sourceData[i].close < sourceData[i - 1].close) {
                    obv -= volume;
                }
            }

            const scaled = obv / this._pivotOptions.obvDivider;
            obvValues.push(scaled);
            this._data[i].values![VALUE_INDEX.obv] = scaled;
            this._data[i].values![VALUE_INDEX.ro1] = highest(obvValues, i - 1, 50);
            this._data[i].values![VALUE_INDEX.ro2] = highest(obvValues, i - 1, 25);
            this._data[i].values![VALUE_INDEX.ro3] = highest(obvValues, i - 1, 10);
        }
    }

    private _drawPivotLevels(
        ctx: CanvasRenderingContext2D,
        timeScale: TimeScale,
        priceScale: PriceScale,
        timeframe: PivotTimeframe,
        startIndex: number,
        endIndex: number,
        hpr: number,
        vpr: number
    ): void {
        for (const level of PIVOT_LEVELS) {
            const valueIndex = this._pivotValueIndex(timeframe, level.offset);
            const color = level.offset <= 2
                ? applyAlpha(this._pivotOptions.rColor, level.alpha)
                : level.offset >= 4
                    ? applyAlpha(this._pivotOptions.sColor, level.alpha)
                    : this._pivotOptions.ppColor;
            this._drawStepLine(ctx, timeScale, priceScale, valueIndex, color, startIndex, endIndex, hpr, vpr, level.widthBoost ?? 0);
        }
    }

    private _drawStepLine(
        ctx: CanvasRenderingContext2D,
        timeScale: TimeScale,
        priceScale: PriceScale,
        valueIndex: number,
        color: string,
        startIndex: number,
        endIndex: number,
        hpr: number,
        vpr: number,
        widthBoost: number = 0
    ): void {
        ctx.strokeStyle = color;
        ctx.lineWidth = (this._pivotOptions.lineWidth + widthBoost) * hpr;
        ctx.lineCap = 'butt';
        ctx.setLineDash([]);

        ctx.beginPath();
        let hasSegment = false;
        let segmentStartIndex: number | null = null;
        let segmentEndIndex: number | null = null;
        let segmentValue: number | null = null;

        const flushSegment = () => {
            if (segmentStartIndex === null || segmentEndIndex === null || segmentValue === null) {
                return;
            }

            const startCoordinate = timeScale.indexToCoordinate(segmentStartIndex as any);
            const endCoordinate = timeScale.indexToCoordinate(segmentEndIndex as any);
            const priceCoordinate = priceScale.priceToCoordinate(segmentValue);
            if (priceCoordinate === undefined) {
                return;
            }

            const halfBar = timeScale.barSpacing / 2;
            const x1 = (startCoordinate - halfBar) * hpr;
            const x2 = (endCoordinate + halfBar) * hpr;
            const y = priceCoordinate * vpr;

            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
            hasSegment = true;
        };

        for (let i = startIndex; i <= endIndex; i++) {
            const value = this._data[i]?.values?.[valueIndex];
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                flushSegment();
                segmentStartIndex = null;
                segmentEndIndex = null;
                segmentValue = null;
                continue;
            }

            if (segmentValue !== null && Math.abs(segmentValue - value) > 1e-10) {
                flushSegment();
                segmentStartIndex = i;
                segmentEndIndex = i;
                segmentValue = value;
                continue;
            }

            if (segmentStartIndex === null) {
                segmentStartIndex = i;
                segmentValue = value;
            }
            segmentEndIndex = i;
        }

        flushSegment();

        if (hasSegment) {
            ctx.stroke();
        }
    }

    private _drawValueLine(
        ctx: CanvasRenderingContext2D,
        timeScale: TimeScale,
        priceScale: PriceScale,
        valueIndex: number,
        color: string,
        startIndex: number,
        endIndex: number,
        hpr: number,
        vpr: number,
        widthBoost: number = 0
    ): void {
        ctx.strokeStyle = color;
        ctx.lineWidth = (this._pivotOptions.lineWidth + widthBoost) * hpr;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);

        ctx.beginPath();
        let started = false;

        for (let i = startIndex; i <= endIndex; i++) {
            const value = this._data[i]?.values?.[valueIndex];
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                started = false;
                continue;
            }

            const x = timeScale.indexToCoordinate(i as any) * hpr;
            const coordinate = priceScale.priceToCoordinate(value);
            if (coordinate === undefined) {
                started = false;
                continue;
            }
            const y = coordinate * vpr;

            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();
    }
}

function getIndicatorName(): string {
    return 'GainMetrics';
}

function getTimeframeLabel(timeframe: PivotTimeframe): string {
    return timeframe === 'D' ? 'Günlük' : timeframe === 'W' ? 'Haftalık' : 'Aylık';
}

function getPeriodKey(time: number, timeframe: PivotTimeframe): string {
    const date = new Date(toUnixMilliseconds(time));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;

    if (timeframe === 'M') {
        return `${year}-${month}`;
    }

    if (timeframe === 'W') {
        const week = getUtcIsoWeek(date);
        return `${week.year}-W${week.week}`;
    }

    return `${year}-${month}-${date.getUTCDate()}`;
}

function toUnixMilliseconds(time: number): number {
    return Math.abs(time) > 100000000000 ? time : time * 1000;
}

function getUtcIsoWeek(date: Date): { year: number; week: number } {
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNumber = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return { year: target.getUTCFullYear(), week };
}

function highest(values: number[], endIndex: number, length: number): number {
    if (endIndex < 0) {
        return NaN;
    }

    let max = -Infinity;
    const start = Math.max(0, endIndex - length + 1);
    for (let i = start; i <= endIndex; i++) {
        if (Number.isFinite(values[i])) {
            max = Math.max(max, values[i]);
        }
    }

    return Number.isFinite(max) ? max : NaN;
}

function applyAlpha(color: string, alpha: number): string {
    if (!color.startsWith('#')) {
        return color;
    }

    const hex = color.slice(1);
    const normalized = hex.length === 3
        ? hex.split('').map((ch) => ch + ch).join('')
        : hex;
    const value = parseInt(normalized, 16);
    if (Number.isNaN(value)) {
        return color;
    }

    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
