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

import { VolumeProfileBin, computeVolumeProfile } from './volume-profile-math';

interface VolumeProfileState {
    startIndex: number;
    endIndex: number;
    lowest: number;
    highest: number;
    bins: VolumeProfileBin[];
    maxVolume: number;
    totalVolume: number;
    pocIndex: number;
    pocPrice: number;
    vahPrice: number;
    valPrice: number;
}

export interface FixedRangeVolumeProfileIndicatorOptions extends IndicatorOptions {
    rangeBars: number;
    rows: number;
    valueAreaPercent: number;
    profileWidthPercent: number;
    showPOC: boolean;
    showValueArea: boolean;
    profileColor: string;
    valueAreaColor: string;
    pocColor: string;
    valueAreaLineColor: string;
}

const defaultOptions: Partial<FixedRangeVolumeProfileIndicatorOptions> = {
    name: 'Fixed Range Volume Profile',
    style: IndicatorStyle.Line,
    color: '#3b82f6',
    lineWidth: 2,
    rangeBars: 200,
    rows: 32,
    valueAreaPercent: 70,
    profileWidthPercent: 35,
    showPOC: true,
    showValueArea: true,
    profileColor: '#3b82f6',
    valueAreaColor: '#10b981',
    pocColor: '#ef4444',
    valueAreaLineColor: '#f59e0b',
};

export class FixedRangeVolumeProfileIndicator extends OverlayIndicator {
    private _optionsEx: FixedRangeVolumeProfileIndicatorOptions;
    private _profile: VolumeProfileState | null = null;

    constructor(options: Partial<FixedRangeVolumeProfileIndicatorOptions> = {}) {
        const merged = { ...defaultOptions, ...options };
        super(merged);
        this._optionsEx = { ...defaultOptions, ...this._options } as FixedRangeVolumeProfileIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._optionsEx };
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    rows: [
                        numberRow('rangeBars', 'Range Bars', 20, 2000, 1),
                        numberRow('rows', 'Rows', 8, 120, 1),
                        numberRow('valueAreaPercent', 'Value Area %', 50, 99, 1),
                        numberRow('profileWidthPercent', 'Profile Width %', 10, 80, 1),
                        checkboxRow('showPOC', 'Show POC', this._optionsEx.showPOC),
                        checkboxRow('showValueArea', 'Show Value Area', this._optionsEx.showValueArea),
                    ],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('profileColor', 'Profile Color', this._optionsEx.profileColor),
                        colorRow('valueAreaColor', 'Value Area Color', this._optionsEx.valueAreaColor),
                        colorRow('pocColor', 'POC Color', this._optionsEx.pocColor),
                        colorRow('valueAreaLineColor', 'VAH / VAL Color', this._optionsEx.valueAreaLineColor),
                        lineWidthRow('lineWidth', 'Line Width'),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    setSettingValue(key: string, value: any): boolean {
        const numericKeys = new Set(['rangeBars', 'rows', 'valueAreaPercent', 'profileWidthPercent', 'lineWidth']);
        const normalizedValue = numericKeys.has(key) ? Number(value) : value;
        const needsRecalc = ['rangeBars', 'rows', 'valueAreaPercent', 'profileWidthPercent'].includes(key);

        Object.assign(this._optionsEx, { [key]: normalizedValue });
        Object.assign(this._options, { [key]: normalizedValue });

        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }

        this._dataChanged.fire();
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        this._data = [];
        this._profile = null;

        if (sourceData.length < 5) {
            return;
        }

        const endIndex = sourceData.length - 1;
        const rangeBars = Math.max(20, Math.floor(this._optionsEx.rangeBars));
        const startIndex = Math.max(0, endIndex - rangeBars + 1);
        const rows = Math.max(8, Math.floor(this._optionsEx.rows));
        const result = computeVolumeProfile(sourceData, startIndex, endIndex, rows, this._optionsEx.valueAreaPercent / 100);
        if (!result) {
            return;
        }

        const { lowest, highest, bins, maxVolume, totalVolume, pocIndex, vahIndex, valIndex } = result;
        this._profile = {
            startIndex,
            endIndex,
            lowest,
            highest,
            bins,
            maxVolume,
            totalVolume,
            pocIndex,
            pocPrice: average(bins[pocIndex].low, bins[pocIndex].high),
            vahPrice: average(bins[vahIndex].low, bins[vahIndex].high),
            valPrice: average(bins[valIndex].low, bins[valIndex].high),
        };

        this._data = [
            { time: sourceData[startIndex].time, value: lowest },
            { time: sourceData[endIndex].time, value: highest },
        ];
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
        if (!this._profile) {
            return `FRVP (${this._optionsEx.rangeBars})`;
        }

        return `FRVP ${formatVolume(this._profile.totalVolume)} POC ${this._profile.pocPrice.toFixed(2)}`;
    }

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number
    ): void {
        if (!this._profile || this._profile.maxVolume <= 0) {
            return;
        }

        ctx.save();

        const profileWidthBars = Math.max(
            4,
            ((this._profile.endIndex - this._profile.startIndex + 1) * this._optionsEx.profileWidthPercent) / 100
        );
        const rightX = timeScale.indexToCoordinate(this._profile.endIndex as any) * hpr;

        for (let i = 0; i < this._profile.bins.length; i++) {
            const bin = this._profile.bins[i];
            const ratio = bin.volume / this._profile.maxVolume;
            const widthBars = profileWidthBars * ratio;
            const leftX = timeScale.indexToCoordinate((this._profile.endIndex - widthBars) as any) * hpr;
            const yTop = priceScale.priceToCoordinate(bin.high) * vpr;
            const yBottom = priceScale.priceToCoordinate(bin.low) * vpr;
            const top = Math.min(yTop, yBottom);
            const height = Math.max(1, Math.abs(yBottom - yTop));
            const inValueArea = i >= Math.min(this._profile.pocIndex, findBinIndex(this._profile.bins, this._profile.valPrice))
                && i <= Math.max(this._profile.pocIndex, findBinIndex(this._profile.bins, this._profile.vahPrice));
            const fillColor = inValueArea && this._optionsEx.showValueArea
                ? this._optionsEx.valueAreaColor
                : this._optionsEx.profileColor;

            ctx.fillStyle = withAlpha(fillColor, 0.18 + ratio * 0.5);
            ctx.fillRect(Math.min(leftX, rightX), top, Math.max(1, Math.abs(rightX - leftX)), height);
        }

        if (this._optionsEx.showPOC) {
            drawHorizontalLevel(
                ctx,
                timeScale,
                priceScale,
                this._profile.startIndex,
                this._profile.endIndex,
                this._profile.pocPrice,
                this._optionsEx.pocColor,
                this._optionsEx.lineWidth,
                [],
                hpr,
                vpr
            );
        }

        if (this._optionsEx.showValueArea) {
            drawHorizontalLevel(
                ctx,
                timeScale,
                priceScale,
                this._profile.startIndex,
                this._profile.endIndex,
                this._profile.vahPrice,
                this._optionsEx.valueAreaLineColor,
                1,
                [5 * hpr, 4 * hpr],
                hpr,
                vpr
            );
            drawHorizontalLevel(
                ctx,
                timeScale,
                priceScale,
                this._profile.startIndex,
                this._profile.endIndex,
                this._profile.valPrice,
                this._optionsEx.valueAreaLineColor,
                1,
                [5 * hpr, 4 * hpr],
                hpr,
                vpr
            );
        }

        ctx.restore();
    }

    hitTest(x: number, y: number, timeScale: any, priceScale: any): boolean {
        if (!this._profile) {
            return false;
        }

        const left = timeScale.indexToCoordinate(this._profile.startIndex as any);
        const right = timeScale.indexToCoordinate(this._profile.endIndex as any);
        const top = priceScale.priceToCoordinate(this._profile.highest);
        const bottom = priceScale.priceToCoordinate(this._profile.lowest);

        return x >= Math.min(left, right) && x <= Math.max(left, right) && y >= Math.min(top, bottom) && y <= Math.max(top, bottom);
    }
}

function drawHorizontalLevel(
    ctx: CanvasRenderingContext2D,
    timeScale: any,
    priceScale: any,
    startIndex: number,
    endIndex: number,
    price: number,
    color: string,
    width: number,
    dash: number[],
    hpr: number,
    vpr: number
): void {
    const x1 = timeScale.indexToCoordinate(startIndex as any) * hpr;
    const x2 = timeScale.indexToCoordinate(endIndex as any) * hpr;
    const y = priceScale.priceToCoordinate(price) * vpr;

    ctx.strokeStyle = color;
    ctx.lineWidth = width * hpr;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.setLineDash([]);
}

function average(a: number, b: number): number {
    return (a + b) / 2;
}

function withAlpha(color: string, alpha: number): string {
    const hex = color.replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
        return color;
    }

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function formatVolume(value: number): string {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
    return value.toFixed(0);
}

function findBinIndex(bins: VolumeProfileBin[], price: number): number {
    for (let i = 0; i < bins.length; i++) {
        if (price >= bins[i].low && price <= bins[i].high) {
            return i;
        }
    }
    return 0;
}
