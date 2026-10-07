import { OverlayIndicator, IndicatorOptions, IndicatorRange, IndicatorStyle } from './indicator';
import { BarData } from '../model/data';
import { RemoteCompute, RemoteContext, accessNoticeText, drawAccessNotice } from './remote-compute';

// TDOJI-SR: seviyeler (önceki haftalık kapanışa göre) backend'de hesaplanır (bkz.
// remote-compute.ts). Burada yalnızca çizilir; etiket metni ve fiyat biçimlendirme yereldir.

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

interface RemoteTdojiSR {
    reference: number | null;
    resistances: number[];
    supports: number[];
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

export class TdojiSRIndicator extends OverlayIndicator {
    private _srOptions: TdojiSRIndicatorOptions;
    private _levels: SRLevel[] = [];
    private _referencePrice: number | null = null;
    private _lastBarIndex = 0;
    private _raw: RemoteTdojiSR | null = null;
    private readonly _remote = new RemoteCompute<RemoteTdojiSR>('tdoji-sr', (raw) => {
        this._raw = raw;
        this._rebuild();
    });

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

    setContext(ctx: RemoteContext): void {
        this._remote.setContext(ctx);
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
        this._remote.request({ levelsCount: this._srOptions.levelsCount }, () => this._dataChanged.fire());
        this._rebuild();
    }

    /** Sunucudan gelen seviyelerden yerel etiketli çizim listesini kurar. */
    private _rebuild(): void {
        const sourceData = this._sourceData;
        this._data = [];
        this._levels = [];
        this._referencePrice = null;
        if (sourceData.length === 0 || !this._raw) return;

        this._lastBarIndex = sourceData.length - 1;
        this._referencePrice = this._raw.reference;
        if (this._referencePrice === null || !isFinite(this._referencePrice)) {
            this._referencePrice = null;
            return;
        }

        this._data.push({ time: sourceData[this._lastBarIndex].time, value: this._referencePrice });

        if (this._srOptions.showReferenceLine) {
            this._levels.push({
                kind: 'reference',
                index: 0,
                price: this._referencePrice,
                text: `● PrevClose  ${this._formatPrice(this._referencePrice)}`,
            });
        }

        const count = Math.min(this._srOptions.levelsCount, 10, this._raw.resistances.length, this._raw.supports.length);
        for (let i = 0; i < count; i++) {
            const resistance = this._raw.resistances[i];
            const support = this._raw.supports[i];

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

    destroy(): void {
        this._remote.destroy();
        super.destroy();
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
        const denied = accessNoticeText(this._remote, 'TDOJI-SR');
        if (denied !== null) return denied;
        return this._referencePrice === null ? 'TDOJI-SR' : `TDOJI-SR PrevClose: ${this._formatPrice(this._referencePrice)}`;
    }

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number
    ): void {
        if (this._remote.denied !== null) {
            drawAccessNotice(ctx, hpr, vpr, this._remote, this._srOptions.name);
            return;
        }
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
