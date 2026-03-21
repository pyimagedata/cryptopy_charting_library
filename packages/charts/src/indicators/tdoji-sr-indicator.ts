import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';

export interface TdojiSRIndicatorOptions extends IndicatorOptions {
    levelsCount: number;
    extendBars: number;
    showResistances: boolean;
    showSupports: boolean;
    showLabels: boolean;
    showNotes: boolean;
    showReferenceLine: boolean;
    labelSide: 'right' | 'left';
    lineStyle: 'solid' | 'dashed' | 'dotted';
    resistanceColor: string;
    supportColor: string;
    referenceColor: string;
}

type LevelKind = 'resistance' | 'support' | 'reference';

interface SRLevel {
    kind: LevelKind;
    index: number;
    price: number;
    text: string;
}

const defaultTdojiSROptions: Partial<TdojiSRIndicatorOptions> = {
    name: 'TDOJI-SR',
    style: IndicatorStyle.Line,
    color: '#14b8a6',
    lineWidth: 1,
    levelsCount: 10,
    extendBars: 30,
    showResistances: true,
    showSupports: true,
    showLabels: true,
    showNotes: true,
    showReferenceLine: true,
    labelSide: 'right',
    lineStyle: 'dotted',
    resistanceColor: '#14b8a6',
    supportColor: '#ef4444',
    referenceColor: 'rgba(156, 163, 175, 0.8)',
};

const STEP_BANDS: number[][] = [
    [1, 2, 3, 4, 5, 6, 7, 8, 11, 13],
    [1, 2, 3, 4, 5, 6, 7, 10, 12, 18],
    [1, 2, 3, 4, 5, 6, 7, 10, 19, 25],
    [4, 6, 9, 13, 15, 17, 23, 32, 39, 52],
    [4, 6, 8, 18, 22, 25, 36, 48, 63, 80],
    [6, 8, 10, 18, 21, 31, 45, 56, 76, 98],
    [16, 23, 30, 35, 41, 47, 60, 70, 80, 100],
    [25, 40, 50, 60, 75, 90, 105, 125, 165, 235],
    [35, 50, 70, 95, 120, 175, 210, 255, 330, 450],
    [35, 45, 85, 115, 135, 215, 315, 420, 500, 655],
    [60, 95, 150, 250, 300, 400, 500, 700, 850, 1000],
    [60, 80, 190, 310, 525, 600, 700, 800, 1450, 1900],
    [50, 100, 200, 450, 700, 900, 1250, 1700, 2500, 4500],
];

export class TdojiSRIndicator extends OverlayIndicator {
    private _srOptions: TdojiSRIndicatorOptions;
    private _levels: SRLevel[] = [];
    private _referencePrice: number | null = null;
    private _lastBarIndex = 0;

    constructor(options: Partial<TdojiSRIndicatorOptions> = {}) {
        const mergedOptions = { ...defaultTdojiSROptions, ...options };
        super(mergedOptions);
        this._srOptions = { ...defaultTdojiSROptions, ...this._options } as TdojiSRIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return {
            ...this._srOptions,
        };
    }

    setSettingValue(key: string, value: any): boolean {
        const oldValue = (this._srOptions as any)[key];
        if (oldValue === value) return false;

        (this._srOptions as any)[key] = value;
        (this._options as any)[key] = value;

        const needsRecalc = [
            'levelsCount',
            'extendBars',
            'showResistances',
            'showSupports',
            'showLabels',
            'showNotes',
            'showReferenceLine',
        ].includes(key);

        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }

        this._dataChanged.fire();
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._data = [];
        this._levels = [];
        this._referencePrice = null;

        if (sourceData.length === 0) {
            return;
        }

        this._lastBarIndex = sourceData.length - 1;
        this._referencePrice = this._findPreviousTimeframeClose(sourceData, 'W');

        if (this._referencePrice === null || !isFinite(this._referencePrice)) {
            return;
        }

        this._data.push({
            time: sourceData[this._lastBarIndex].time,
            value: this._referencePrice,
        });

        const [srcInt, mult] = this._toScaledInt(this._referencePrice);
        const bandIndex = this._getBandIndex(srcInt);

        if (this._srOptions.showReferenceLine) {
            this._levels.push({
                kind: 'reference',
                index: 0,
                price: this._referencePrice,
                text: `● PrevClose  ${this._formatPrice(this._referencePrice)}`,
            });
        }

        const count = Math.min(this._srOptions.levelsCount, 10);
        for (let i = 0; i < count; i++) {
            const step = srcInt >= 55000 ? i + 1 : STEP_BANDS[bandIndex][i];

            const resistance = (srcInt + step) / mult;
            const support = (srcInt - step) / mult;

            if (this._srOptions.showResistances) {
                this._levels.push({
                    kind: 'resistance',
                    index: i,
                    price: resistance,
                    text: this._buildLabelText('R', i, resistance, true),
                });
            }

            if (this._srOptions.showSupports) {
                this._levels.push({
                    kind: 'support',
                    index: i,
                    price: support,
                    text: this._buildLabelText('S', i, support, false),
                });
            }
        }
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
        return this._referencePrice === null ? 'TDOJI-SR' : `TDOJI-SR PrevClose: ${this._formatPrice(this._referencePrice)}`;
    }

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number
    ): void {
        if (this._levels.length === 0 || this._sourceData.length === 0) {
            return;
        }

        const x1 = timeScale.indexToCoordinate(this._lastBarIndex) * hpr;
        const x2 = timeScale.indexToCoordinate(this._lastBarIndex + this._srOptions.extendBars) * hpr;
        const labelX = this._srOptions.labelSide === 'right' ? x2 : x1;
        const labelLayouts = this._srOptions.showLabels
            ? this._computeLabelLayouts(ctx, priceScale, hpr, vpr)
            : [];

        ctx.save();
        ctx.setLineDash(this._getLineDash(this._srOptions.lineStyle, hpr));

        for (let idx = 0; idx < this._levels.length; idx++) {
            const level = this._levels[idx];
            const y = priceScale.priceToCoordinate(level.price) * vpr;
            const color = this._getLevelColor(level.kind);

            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = this._srOptions.lineWidth * hpr;
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
            ctx.stroke();

            if (this._srOptions.showLabels) {
                const layout = labelLayouts[idx];
                this._drawLabel(
                    ctx,
                    labelX,
                    layout?.anchorY ?? y,
                    level.text,
                    color,
                    this._srOptions.labelSide,
                    hpr,
                    vpr
                );
            }
        }

        ctx.restore();
    }

    private _drawLabel(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        text: string,
        color: string,
        side: 'right' | 'left',
        hpr: number,
        vpr: number
    ): void {
        const paddingX = 6 * hpr;
        const paddingY = 4 * vpr;
        const fontSize = 11 * Math.min(hpr, vpr);
        const lineHeight = fontSize + 3 * vpr;
        const lines = text.split('\n');

        ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const width = Math.max(...lines.map((line) => ctx.measureText(line).width)) + paddingX * 2;
        const height = lines.length * lineHeight + paddingY * 2;
        const preferredX = side === 'right' ? x + 6 * hpr : x - width - 6 * hpr;
        const boxX = Math.max(4 * hpr, Math.min(preferredX, ctx.canvas.width - width - 4 * hpr));
        const boxY = Math.max(2 * vpr, Math.min(y - height / 2, ctx.canvas.height - height - 2 * vpr));

        ctx.fillStyle = this._withAlpha(color, 0.32);
        ctx.fillRect(boxX, boxY, width, height);

        ctx.strokeStyle = this._withAlpha(color, 0.9);
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(boxX, boxY, width, height);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        lines.forEach((line, index) => {
            ctx.fillText(line, boxX + paddingX, boxY + paddingY + index * lineHeight);
        });
    }

    private _computeLabelLayouts(
        ctx: CanvasRenderingContext2D,
        priceScale: any,
        hpr: number,
        vpr: number
    ): Array<{ anchorY: number }> {
        const fontSize = 11 * Math.min(hpr, vpr);
        const lineHeight = fontSize + 3 * vpr;
        const paddingY = 4 * vpr;
        const minGap = 6 * vpr;
        const canvasHeight = ctx.canvas.height;
        const maxShift = 28 * vpr;

        const sorted = this._levels.map((level, index) => {
            const targetY = priceScale.priceToCoordinate(level.price) * vpr;
            const lineCount = level.text.split('\n').length;
            const height = lineCount * lineHeight + paddingY * 2;
            return { index, targetY, height };
        }).sort((a, b) => a.targetY - b.targetY);

        const placements = new Array<{ anchorY: number }>(this._levels.length);
        let previousBottom = -Infinity;

        for (const item of sorted) {
            const halfHeight = item.height / 2;
            let centerY = Math.max(halfHeight, Math.min(item.targetY, canvasHeight - halfHeight));

            const minCenterY = Math.max(halfHeight, item.targetY - maxShift);
            const maxCenterY = Math.min(canvasHeight - halfHeight, item.targetY + maxShift);
            const desiredMinCenter = previousBottom + minGap + halfHeight;

            if (desiredMinCenter > centerY) {
                centerY = Math.min(Math.max(desiredMinCenter, minCenterY), maxCenterY);
            }

            centerY = Math.max(minCenterY, Math.min(centerY, maxCenterY));
            placements[item.index] = { anchorY: centerY };
            previousBottom = centerY + halfHeight;
        }

        for (let i = sorted.length - 2; i >= 0; i--) {
            const current = placements[sorted[i].index];
            const next = placements[sorted[i + 1].index];
            const currentHalf = sorted[i].height / 2;
            const nextHalf = sorted[i + 1].height / 2;
            const allowedBottom = next.anchorY - nextHalf - minGap;
            const minCenterY = Math.max(currentHalf, sorted[i].targetY - maxShift);

            if (current.anchorY + currentHalf > allowedBottom) {
                current.anchorY = Math.max(minCenterY, allowedBottom - currentHalf);
            }
        }

        return placements;
    }

    private _findPreviousTimeframeClose(sourceData: BarData[], timeframe: string): number | null {
        const targetBucket = this._targetCompletedBucketStart(timeframe);

        if (targetBucket === null) {
            return null;
        }

        let previousClose: number | null = null;
        for (let i = 0; i < sourceData.length; i++) {
            const bar = sourceData[i];
            if (this._bucketStart(bar.time, timeframe) === targetBucket) {
                previousClose = bar.close;
            }
        }

        return previousClose;
    }

    private _targetCompletedBucketStart(timeframe: string): number | null {
        const tf = timeframe.toUpperCase();
        const now = Date.now();
        const date = new Date(now);

        if (tf === 'W') {
            const currentWeekStart = this._weekStartUtc(now);
            const day = date.getUTCDay();

            // Weekend: use the week that just closed.
            if (day === 6 || day === 0) {
                return currentWeekStart;
            }

            // Weekday: use the previous completed weekly candle.
            return currentWeekStart - 7 * 24 * 60 * 60 * 1000;
        }

        if (tf === 'D') {
            return this._dayStartUtc(now) - 24 * 60 * 60 * 1000;
        }

        if (tf === 'M') {
            return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1);
        }

        const currentBucket = this._bucketStart(now, timeframe);
        const previousBucket = this._previousBucketStart(currentBucket, timeframe);
        return previousBucket;
    }

    private _previousBucketStart(bucketStart: number, timeframe: string): number | null {
        const tf = timeframe.toUpperCase();
        const match = tf.match(/^(\d+)([MHDW])$/);
        if (!match) {
            return null;
        }

        const value = parseInt(match[1], 10);
        const unit = match[2];

        if (unit === 'M') {
            return bucketStart - value * 60 * 1000;
        }

        if (unit === 'H') {
            return bucketStart - value * 60 * 60 * 1000;
        }

        if (unit === 'D') {
            return bucketStart - value * 24 * 60 * 60 * 1000;
        }

        if (unit === 'W') {
            return bucketStart - value * 7 * 24 * 60 * 60 * 1000;
        }

        return null;
    }

    private _dayStartUtc(time: number): number {
        const date = new Date(time);
        return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    }

    private _weekStartUtc(time: number): number {
        const date = new Date(time);
        const day = date.getUTCDay();
        const diff = day === 0 ? -6 : 1 - day;
        return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + diff);
    }

    private _bucketStart(time: number, timeframe: string): number {
        const date = new Date(time);
        const tf = timeframe.toUpperCase();

        if (tf === 'D') {
            return this._dayStartUtc(time);
        }

        if (tf === 'W') {
            return this._weekStartUtc(time);
        }

        if (tf === 'M') {
            return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
        }

        const match = tf.match(/^(\d+)([MHDW])$/);
        if (!match) {
            return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
        }

        const value = parseInt(match[1], 10);
        const unit = match[2];

        if (unit === 'M') {
            const ms = value * 60 * 1000;
            return Math.floor(time / ms) * ms;
        }

        if (unit === 'H') {
            const ms = value * 60 * 60 * 1000;
            return Math.floor(time / ms) * ms;
        }

        if (unit === 'D') {
            const ms = value * 24 * 60 * 60 * 1000;
            return Math.floor(time / ms) * ms;
        }

        if (unit === 'W') {
            const ms = value * 7 * 24 * 60 * 60 * 1000;
            return Math.floor(time / ms) * ms;
        }

        return time;
    }

    private _toScaledInt(price: number): [number, number] {
        let multiplier = 1;
        if (price > 0) {
            while (Math.round(price * multiplier) < 1000) {
                multiplier *= 10;
            }
        }
        return [Math.round(price * multiplier), multiplier];
    }

    private _getBandIndex(price: number): number {
        if (price < 75) return 0;
        if (price < 150) return 1;
        if (price < 250) return 2;
        if (price < 450) return 3;
        if (price < 750) return 4;
        if (price < 1250) return 5;
        if (price < 2100) return 6;
        if (price < 3500) return 7;
        if (price < 6100) return 8;
        if (price < 10500) return 9;
        if (price < 18000) return 10;
        if (price < 31500) return 11;
        if (price < 55000) return 12;
        return 12;
    }

    private _buildLabelText(prefix: string, index: number, price: number, isResistance: boolean): string {
        let text = `${prefix}${index + 1}  ${this._formatPrice(price)}`;
        if (this._srOptions.showNotes) {
            const note = isResistance ? this._noteResistance(index) : this._noteSupport(index);
            if (note) {
                text += `\n${note}`;
            }
        }
        return text;
    }

    private _noteResistance(index: number): string {
        if (index === 2) return 'GÜÇLÜ TARAFA GEÇİŞ';
        if (index === 3) return 'ALIŞLAR GÜÇLENEBİLİR';
        if (index === 6) return 'GÜÇLÜ DEVAM';
        if (index === 8 || index === 9) return 'GÜN İÇİ KAR SATIŞI OLASI';
        return '';
    }

    private _noteSupport(index: number): string {
        if (index === 2) return 'ZAYIF TARAFA GEÇİŞ';
        if (index === 3) return 'SATIŞLAR ARTABİLİR';
        if (index === 6) return 'ZAYIF UZAK DUR';
        if (index === 8 || index === 9) return 'GÜN İÇİ TEPKİ OLASILIĞI';
        return '';
    }

    private _getLineDash(style: 'solid' | 'dashed' | 'dotted', hpr: number): number[] {
        if (style === 'dashed') return [6 * hpr, 4 * hpr];
        if (style === 'dotted') return [2 * hpr, 4 * hpr];
        return [];
    }

    private _getLevelColor(kind: LevelKind): string {
        if (kind === 'reference') return this._srOptions.referenceColor;
        if (kind === 'support') return this._srOptions.supportColor;
        return this._srOptions.resistanceColor;
    }

    private _formatPrice(price: number): string {
        return price.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 8,
        });
    }

    private _withAlpha(color: string, alpha: number): string {
        if (color.startsWith('rgba')) {
            return color.replace(/rgba\(([^)]+),\s*[^,]+\)$/,'rgba($1, ' + alpha + ')');
        }
        if (color.startsWith('rgb(')) {
            const inner = color.slice(4, -1);
            return `rgba(${inner}, ${alpha})`;
        }
        if (color.startsWith('#')) {
            const hex = color.length === 4
                ? color.slice(1).split('').map((c) => c + c).join('')
                : color.slice(1, 7);
            const int = parseInt(hex, 16);
            const r = (int >> 16) & 255;
            const g = (int >> 8) & 255;
            const b = int & 255;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return color;
    }
}
