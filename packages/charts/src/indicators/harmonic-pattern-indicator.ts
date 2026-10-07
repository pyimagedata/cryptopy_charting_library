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
import { RemoteCompute, RemoteContext, barIndexAtTime, drawAccessNotice } from './remote-compute';
import { t } from '../helpers/translations';

// Formasyon tespiti ve sinyal mantığı backend'de çalışır (bkz. remote-compute.ts);
// burada yalnızca çizilir.

interface RemoteHarmonic {
    patterns: Array<{
        kind: 'abcd' | 'gartley' | 'bat' | 'cypher';
        direction: 'bullish' | 'bearish';
        points: Array<{ time: number; price: number }>;
        ratios: { first: string; second: string } | null;
        signal_time: number | null;
    }>;
}

type HarmonicPattern = {
    kind: 'abcd' | 'gartley' | 'bat' | 'cypher';
    direction: 'bullish' | 'bearish';
    points: { index: number; time: number; price: number }[];
    ratios?: { first?: string; second?: string };
    /** D'den sonra donus yonunde kapanan ilk mum (giris sinyali); yoksa undefined. */
    signal?: { index: number };
};

export interface HarmonicPatternIndicatorOptions extends IndicatorOptions {
    period: number;
    bullishColor: string;
    bearishColor: string;
    showRatios: boolean;
    showABCD: boolean;
    showGartley: boolean;
    showBat: boolean;
    showCypher: boolean;
    /** D'den sonra donus yonundeki ilk mumda AL/SAT isareti. */
    showSignals: boolean;
    /** Guclu onay: sinyal mumu onceki mumun en yuksegini (dususte en dusugunu) kapanisla gecmeli. */
    strongSignal: boolean;
}

/** Formasyonun D noktasindaki ad etiketi (bkz. _drawLabels). */
const KIND_LABELS: Record<HarmonicPattern['kind'], string> = { abcd: 'ABCD', gartley: 'Gartley', bat: 'Bat', cypher: 'Cypher' };

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
    showBat: true,
    showCypher: true,
    showSignals: true,
    strongSignal: false,
};

export class HarmonicPatternIndicator extends OverlayIndicator {
    private _optionsEx: HarmonicPatternIndicatorOptions;
    private _patterns: HarmonicPattern[] = [];
    private _raw: RemoteHarmonic | null = null;
    private readonly _remote = new RemoteCompute<RemoteHarmonic>('harmonic-patterns', (raw) => {
        this._raw = raw;
        this._rebuild();
    });

    constructor(options: Partial<HarmonicPatternIndicatorOptions> = {}) {
        const merged = { ...defaults, ...options };
        super(merged);
        this._optionsEx = { ...defaults, ...this._options } as HarmonicPatternIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._optionsEx };
    }

    setContext(ctx: RemoteContext): void {
        this._remote.setContext(ctx);
    }

    updateOptions(newOptions: Partial<HarmonicPatternIndicatorOptions>): boolean {
        const normalized = { ...newOptions };
        if (normalized.period !== undefined) normalized.period = Number(normalized.period);
        const needsRecalc =
            normalized.period !== undefined && normalized.period !== this._optionsEx.period ||
            normalized.showABCD !== undefined ||
            normalized.showGartley !== undefined ||
            normalized.showBat !== undefined ||
            normalized.showCypher !== undefined ||
            normalized.showSignals !== undefined ||
            normalized.strongSignal !== undefined;
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
                    checkboxRow('showBat', 'Show Bat', this._optionsEx.showBat),
                    checkboxRow('showCypher', 'Show Cypher', this._optionsEx.showCypher),
                    checkboxRow('showSignals', 'Show Signals', this._optionsEx.showSignals),
                    checkboxRow('strongSignal', 'Strong Confirmation (close beyond previous bar)', this._optionsEx.strongSignal),
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
        const o = this._optionsEx;
        this._remote.request(
            {
                period: o.period,
                showABCD: o.showABCD,
                showGartley: o.showGartley,
                showBat: o.showBat,
                showCypher: o.showCypher,
                showSignals: o.showSignals,
                strongSignal: o.strongSignal,
            },
            () => this._dataChanged.fire()
        );
        this._rebuild();
    }

    /** Ham (zaman damgalı) formasyonları mevcut mum dizisinin index'lerine çevirir. */
    private _rebuild(): void {
        this._patterns = [];
        const bars = this._sourceData;
        if (this._raw && bars.length > 0) {
            for (const r of this._raw.patterns) {
                const points = r.points.map((p) => ({ index: barIndexAtTime(bars, p.time), time: p.time, price: p.price }));
                if (points.some((p) => p.index < 0)) continue;
                const pattern: HarmonicPattern = {
                    kind: r.kind,
                    direction: r.direction,
                    points,
                    ratios: r.ratios ?? undefined,
                };
                if (r.signal_time !== null) {
                    const index = barIndexAtTime(bars, r.signal_time);
                    if (index >= 0) pattern.signal = { index };
                }
                this._patterns.push(pattern);
            }
        }
        this._data = this._patterns.flatMap((pattern) =>
            pattern.points.map((point) => ({ time: point.time, value: point.price }))
        );
    }

    destroy(): void {
        this._remote.destroy();
        super.destroy();
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
        if (this._remote.denied !== null) {
            drawAccessNotice(ctx, hpr, vpr, this._remote, this._optionsEx.name);
            return;
        }
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
            } else if ((pattern.kind === 'gartley' || pattern.kind === 'bat' || pattern.kind === 'cypher') && points.length >= 5) {
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

            this._drawLabels(
                ctx,
                points,
                pattern.kind === 'gartley'
                    ? ['X', 'A', 'B', 'C', 'Gartley']
                    : pattern.kind === 'bat'
                        ? ['X', 'A', 'B', 'C', 'Bat']
                        : pattern.kind === 'cypher'
                            ? ['X', 'A', 'B', 'C', 'Cypher']
                        : ['A', 'B', 'C', 'ABCD'],
                color,
                pattern.direction,
                hpr,
                vpr
            );
            if (this._optionsEx.showSignals && pattern.signal) {
                this._drawSignal(ctx, pattern, color, timeScale, priceScale, hpr, vpr);
            }
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

    private _drawLabels(
        ctx: CanvasRenderingContext2D,
        points: { x: number; y: number }[],
        labels: string[],
        color: string,
        direction: 'bullish' | 'bearish',
        hpr: number,
        vpr: number
    ): void {
        ctx.font = `${11 * Math.min(hpr, vpr)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        points.forEach((point, index) => {
            const label = labels[index] || '';
            if (index === points.length - 1 && label.length > 1) {
                const paddingX = 6 * hpr;
                const textWidth = ctx.measureText(label).width;
                const boxWidth = textWidth + paddingX * 2;
                const boxHeight = 16 * vpr;
                const offsetX = 12 * hpr;
                const offsetY = direction === 'bullish' ? 18 * vpr : -18 * vpr;
                const boxX = point.x + offsetX;
                const boxY = point.y + offsetY - boxHeight / 2;
                ctx.strokeStyle = color;
                ctx.lineWidth = 1 * hpr;
                ctx.beginPath();
                ctx.moveTo(point.x, point.y);
                ctx.lineTo(boxX, point.y + offsetY);
                ctx.stroke();
                ctx.globalAlpha = 0.92;
                ctx.fillStyle = color;
                ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'left';
                ctx.fillText(label, boxX + paddingX, point.y + offsetY + 0.5 * vpr);
                ctx.textAlign = 'center';
                return;
            }

            const radius = 10 * hpr;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, point.x, point.y + 0.5 * vpr);
        });
    }

    /** Sinyal mumunun altinda (AL) ya da ustunde (SAT) ok + etiket. */
    private _drawSignal(
        ctx: CanvasRenderingContext2D,
        pattern: HarmonicPattern,
        color: string,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number
    ): void {
        const bar = this._sourceData[pattern.signal!.index];
        if (!bar) return;
        const bullish = pattern.direction === 'bullish';
        const x = timeScale.indexToCoordinate(pattern.signal!.index as any) * hpr;
        let anchorY = priceScale.priceToCoordinate(bullish ? bar.low : bar.high) * vpr;
        const dir = bullish ? 1 : -1; // asagi dogru +1 (AL mumun altinda)

        // Sinyal D'ye yakinsa formasyon adi etiketinin (D'nin sag-altinda/ustunde,
        // bkz. _drawLabels) ustune binmesin: ok etiketin otesine itilir.
        const d = pattern.points[pattern.points.length - 1];
        const dx = timeScale.indexToCoordinate(d.index as any) * hpr;
        const dy = priceScale.priceToCoordinate(d.price) * vpr;
        ctx.font = `${11 * Math.min(hpr, vpr)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const nameWidth = ctx.measureText(KIND_LABELS[pattern.kind]).width + 12 * hpr;
        const labelLeft = dx;
        const labelRight = dx + 12 * hpr + nameWidth;
        if (x >= labelLeft - 8 * hpr && x <= labelRight + 8 * hpr) {
            const labelEdge = dy + dir * (18 * vpr + 8 * vpr);
            anchorY = bullish ? Math.max(anchorY, labelEdge) : Math.min(anchorY, labelEdge);
        }
        const gap = 6 * vpr;
        const arrow = 9 * vpr;
        const half = 6 * hpr;
        const tipY = anchorY + dir * gap;
        const baseY = tipY + dir * arrow;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, tipY);
        ctx.lineTo(x - half, baseY);
        ctx.lineTo(x + half, baseY);
        ctx.closePath();
        ctx.fill();

        const text = t(bullish ? 'Buy' : 'Sell').toUpperCase();
        ctx.font = `bold ${10 * Math.min(hpr, vpr)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const padX = 4 * hpr;
        const boxH = 15 * vpr;
        const boxW = ctx.measureText(text).width + padX * 2;
        const boxTop = bullish ? baseY + 2 * vpr : baseY - 2 * vpr - boxH;
        ctx.fillRect(x - boxW / 2, boxTop, boxW, boxH);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, boxTop + boxH / 2 + 0.5 * vpr);
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
