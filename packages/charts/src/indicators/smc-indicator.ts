import { OverlayIndicator, IndicatorOptions, IndicatorRange } from './indicator';
import { BarData } from '../model/data';
import { RemoteCompute, RemoteContext, barIndexAtTime, drawAccessNotice } from './remote-compute';

// ZigZag ve BOS/MSB hesabı backend'de çalışır (bkz. remote-compute.ts); burada yalnızca çizilir.
interface SMCPivot {
    price: number;
    index: number;
    time: number;
}

interface SMCStructureBreak {
    type: 'BOS' | 'MSB';
    dir: 'Bullish' | 'Bearish';
    level: number;
    start_bar: number;
    end_bar: number;
}

interface RemoteSMC {
    minor: Array<{ time: number; price: number }>; // kronolojik
    macro: Array<{ time: number; price: number }>;
    breaks: Array<{ type: 'BOS' | 'MSB'; dir: 'Bullish' | 'Bearish'; level: number; start_time: number; end_time: number }>;
}
import {
    IndicatorSettingsConfig,
    createInputsTab,
    createStyleTab,
    createVisibilityTab,
    checkboxRow,
    colorRow,
    lineWidthRow,
    numberRow,
    selectRow,
} from '../gui/indicator_settings';

export interface SMCIndicatorOptions extends IndicatorOptions {
    period: number;
    pivotSrc: 'Close' | 'High/Low';
    breakSrc: 'Close' | 'High/Low';
    macroSrc: 'Close' | 'High/Low';
    useTickFilter: boolean;
    tickMult: number;
    tickSize: number; // 0 for auto
    confirmCandles: number;
    showMinorZigZag: boolean;
    showMacroZigZag: boolean;
    showBOS: boolean;
    showMSB: boolean;
    minorColor: string;
    macroColor: string;
    bullishColor: string;
    bearishColor: string;
}

const defaultSMCOptions: Partial<SMCIndicatorOptions> = {
    name: 'Smart Money Concepts',
    period: 15,
    pivotSrc: 'High/Low',
    breakSrc: 'Close',
    macroSrc: 'Close',
    useTickFilter: true,
    tickMult: 3,
    tickSize: 0, // 0 means Auto
    confirmCandles: 3,
    showMinorZigZag: true,
    showMacroZigZag: true,
    showBOS: true,
    showMSB: true,
    minorColor: 'rgba(41, 98, 255, 0.4)',
    macroColor: '#212121',
    bullishColor: '#008080',
    bearishColor: '#ef4444',
    lineWidth: 2,
};

export class SMCIndicator extends OverlayIndicator {
    private _smcOptions: SMCIndicatorOptions;
    private _minorZigzag: SMCPivot[] = [];
    private _macroVals: number[] = [];
    private _macroBars: number[] = [];
    private _breaks: SMCStructureBreak[] = [];
    private _raw: RemoteSMC | null = null;
    private readonly _remote = new RemoteCompute<RemoteSMC>('smc', (raw) => {
        this._raw = raw;
        this._rebuild();
    });

    constructor(options: Partial<SMCIndicatorOptions> = {}) {
        const merged = { ...defaultSMCOptions, ...options };
        super(merged);
        this._smcOptions = { ...defaultSMCOptions, ...this._options } as SMCIndicatorOptions;
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...this._smcOptions };
    }

    setContext(ctx: RemoteContext): void {
        this._remote.setContext(ctx);
    }

    updateOptions(newOptions: Partial<SMCIndicatorOptions>): boolean {
        const normalized = { ...newOptions };
        if (normalized.period !== undefined) normalized.period = Number(normalized.period);
        if (normalized.tickMult !== undefined) normalized.tickMult = Number(normalized.tickMult);
        if (normalized.tickSize !== undefined) normalized.tickSize = Number(normalized.tickSize);
        if (normalized.confirmCandles !== undefined) normalized.confirmCandles = Number(normalized.confirmCandles);

        const needsRecalc =
            normalized.period !== undefined ||
            normalized.pivotSrc !== undefined ||
            normalized.breakSrc !== undefined ||
            normalized.macroSrc !== undefined ||
            normalized.useTickFilter !== undefined ||
            normalized.tickMult !== undefined ||
            normalized.tickSize !== undefined ||
            normalized.confirmCandles !== undefined;

        Object.assign(this._smcOptions, normalized);
        Object.assign(this._options, normalized);
        this._dataChanged.fire();
        return !!needsRecalc;
    }

    getSettingsConfig(): IndicatorSettingsConfig {
        return {
            name: this.name,
            tabs: [
                createInputsTab([{
                    rows: [
                        numberRow('period', 'ZigZag Swing Period', 2, 100, 1),
                        selectRow('pivotSrc', 'ZigZag Source', [
                            { value: 'High/Low', label: 'High/Low' },
                            { value: 'Close', label: 'Close' }
                        ], this._smcOptions.pivotSrc),
                        selectRow('breakSrc', 'BOS/MSB Verification Source', [
                            { value: 'Close', label: 'Close' },
                            { value: 'High/Low', label: 'High/Low' }
                        ], this._smcOptions.breakSrc),
                        selectRow('macroSrc', 'Macro ZigZag Verification Source', [
                            { value: 'Close', label: 'Close' },
                            { value: 'High/Low', label: 'High/Low' }
                        ], this._smcOptions.macroSrc),
                        checkboxRow('useTickFilter', 'Enable Tick Filter', this._smcOptions.useTickFilter),
                        numberRow('tickMult', 'Tick Multiplier', 0.1, 50, 0.1),
                        numberRow('tickSize', 'Tick Size (0 = Auto)', 0, 1000, 0.000001),
                        numberRow('confirmCandles', 'Consecutive Confirm Candles', 1, 10, 1),
                        checkboxRow('showMinorZigZag', 'Show Minor ZigZag', this._smcOptions.showMinorZigZag),
                        checkboxRow('showMacroZigZag', 'Show Macro ZigZag', this._smcOptions.showMacroZigZag),
                        checkboxRow('showBOS', 'Show BOS Levels', this._smcOptions.showBOS),
                        checkboxRow('showMSB', 'Show MSB Levels', this._smcOptions.showMSB),
                    ],
                }]),
                createStyleTab([{
                    rows: [
                        colorRow('minorColor', 'Minor ZigZag Color', this._smcOptions.minorColor),
                        colorRow('macroColor', 'Macro ZigZag Color', this._smcOptions.macroColor),
                        colorRow('bullishColor', 'Bullish Level Color', this._smcOptions.bullishColor),
                        colorRow('bearishColor', 'Bearish Level Color', this._smcOptions.bearishColor),
                        lineWidthRow('lineWidth', 'Macro Line Width'),
                    ],
                }]),
                createVisibilityTab(),
            ],
        };
    }

    setSettingValue(key: string, value: any): boolean {
        const needsRecalc = this.updateOptions({ [key]: value } as Partial<SMCIndicatorOptions>);
        if (needsRecalc && this._sourceData.length > 0) {
            this.calculate(this._sourceData);
        }
        return needsRecalc;
    }

    calculate(sourceData: BarData[]): void {
        this._sourceData = sourceData;
        const o = this._smcOptions;
        this._remote.request(
            {
                period: o.period,
                pivotSrc: o.pivotSrc,
                breakSrc: o.breakSrc,
                macroSrc: o.macroSrc,
                useTickFilter: o.useTickFilter,
                tickMult: o.tickMult,
                tickSize: o.tickSize,
                confirmCandles: o.confirmCandles,
            },
            () => this._dataChanged.fire()
        );
        this._rebuild();
    }

    /** Ham (zaman damgalı) sonucu mevcut mum dizisinin index'lerine çevirir. */
    private _rebuild(): void {
        this._minorZigzag = [];
        this._macroVals = [];
        this._macroBars = [];
        this._breaks = [];
        this._data = [];
        const bars = this._sourceData;
        if (!this._raw || bars.length === 0) return;

        // Minör ZigZag çizimde yeniden eskiye doğru tutulur (en yeni önce).
        for (const p of this._raw.minor) {
            const index = barIndexAtTime(bars, p.time);
            if (index >= 0) this._minorZigzag.unshift({ price: p.price, index, time: p.time });
        }
        for (const p of this._raw.macro) {
            const index = barIndexAtTime(bars, p.time);
            if (index < 0) continue;
            this._macroBars.push(index);
            this._macroVals.push(p.price);
        }
        for (const b of this._raw.breaks) {
            const start = barIndexAtTime(bars, b.start_time);
            const end = barIndexAtTime(bars, b.end_time);
            if (start < 0 || end < 0) continue;
            this._breaks.push({ type: b.type, dir: b.dir, level: b.level, start_bar: start, end_bar: end });
        }

        // Varsayılan seri eşlemesi için makro ZigZag noktaları
        this._data = this._macroBars.map((barIdx, i) => ({
            time: bars[barIdx].time,
            value: this._macroVals[i],
        }));
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
        return `SMC (${this._smcOptions.period})`;
    }

    drawOverlay(
        ctx: CanvasRenderingContext2D,
        timeScale: any,
        priceScale: any,
        hpr: number,
        vpr: number
    ): void {
        if (this._remote.denied !== null) {
            drawAccessNotice(ctx, hpr, vpr, this._remote, this._smcOptions.name);
            return;
        }
        if (this._sourceData.length === 0) return;

        // 1. Draw Minor ZigZag
        if (this._smcOptions.showMinorZigZag && this._minorZigzag.length >= 2) {
            ctx.save();
            ctx.strokeStyle = this._smcOptions.minorColor;
            ctx.lineWidth = 1 * hpr;
            ctx.setLineDash([4 * hpr, 4 * hpr]);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();

            let started = false;
            // Draw in chronological order (reverse of newest-first array)
            for (let i = this._minorZigzag.length - 1; i >= 0; i--) {
                const point = this._minorZigzag[i];
                const x = timeScale.indexToCoordinate(point.index) * hpr;
                const y = priceScale.priceToCoordinate(point.price) * vpr;
                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            ctx.restore();
        }

        // 2. Draw Macro ZigZag
        if (this._smcOptions.showMacroZigZag && this._macroVals.length >= 2) {
            ctx.save();
            ctx.strokeStyle = this._smcOptions.macroColor;
            ctx.lineWidth = this._smcOptions.lineWidth * hpr;
            ctx.setLineDash([]);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();

            let started = false;
            for (let i = 0; i < this._macroVals.length; i++) {
                const barIdx = this._macroBars[i];
                const price = this._macroVals[i];
                const x = timeScale.indexToCoordinate(barIdx) * hpr;
                const y = priceScale.priceToCoordinate(price) * vpr;
                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            ctx.restore();
        }

        // 3. Draw BOS & MSB Levels and Markers
        for (const b of this._breaks) {
            const isBOS = b.type === 'BOS';
            const isMSB = b.type === 'MSB';

            if (isBOS && !this._smcOptions.showBOS) continue;
            if (isMSB && !this._smcOptions.showMSB) continue;

            const startX = timeScale.indexToCoordinate(b.start_bar) * hpr;
            const endX = timeScale.indexToCoordinate(b.end_bar) * hpr;
            const y = priceScale.priceToCoordinate(b.level) * vpr;

            const color = b.dir === 'Bullish' ? this._smcOptions.bullishColor : this._smcOptions.bearishColor;

            // Draw horizontal dotted line
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1 * hpr;
            ctx.setLineDash([2 * hpr, 2 * hpr]);
            ctx.beginPath();
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
            ctx.stroke();
            ctx.restore();

            // Draw marker & label
            const labelX = endX;
            const bar = this._sourceData[b.end_bar];
            if (!bar) continue;

            const labelText = `${b.type} (${b.dir === 'Bullish' ? 'BULL' : 'BEAR'})`;

            ctx.save();
            ctx.font = `bold ${10 * hpr}px sans-serif`;
            const textMetrics = ctx.measureText(labelText);
            const textWidth = textMetrics.width;
            const textHeight = 12 * vpr;

            if (b.dir === 'Bullish') {
                const peakY = priceScale.priceToCoordinate(bar.high) * vpr;
                const arrowY = peakY - 8 * vpr;

                // Triangle
                ctx.fillStyle = color;
                drawTriangle(ctx, labelX, arrowY, 5 * hpr, 'up');

                // Label background and text
                const textY = arrowY - 14 * vpr;
                roundRect(ctx, labelX - textWidth / 2 - 4 * hpr, textY - 2 * vpr, textWidth + 8 * hpr, textHeight + 4 * vpr, 3 * hpr);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelText, labelX, textY + textHeight / 2);
            } else {
                const valleyY = priceScale.priceToCoordinate(bar.low) * vpr;
                const arrowY = valleyY + 8 * vpr;

                // Triangle
                ctx.fillStyle = color;
                drawTriangle(ctx, labelX, arrowY, 5 * hpr, 'down');

                // Label background and text
                const textY = arrowY + 8 * vpr;
                roundRect(ctx, labelX - textWidth / 2 - 4 * hpr, textY - 2 * vpr, textWidth + 8 * hpr, textHeight + 4 * vpr, 3 * hpr);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelText, labelX, textY + textHeight / 2);
            }
            ctx.restore();
        }
    }

    hitTest(x: number, y: number, timeScale: any, priceScale: any): boolean {
        if (this._macroVals.length < 2) {
            return false;
        }

        const threshold = 8;
        for (let i = 1; i < this._macroVals.length; i++) {
            const startBar = this._macroBars[i - 1];
            const startPrice = this._macroVals[i - 1];
            const endBar = this._macroBars[i];
            const endPrice = this._macroVals[i];

            const x1 = timeScale.indexToCoordinate(startBar);
            const y1 = priceScale.priceToCoordinate(startPrice);
            const x2 = timeScale.indexToCoordinate(endBar);
            const y2 = priceScale.priceToCoordinate(endPrice);

            if (distanceToSegment(x, y, x1, y1, x2, y2) <= threshold) {
                return true;
            }
        }

        return false;
    }
}

function drawTriangle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    direction: 'up' | 'down'
): void {
    ctx.beginPath();
    if (direction === 'up') {
        ctx.moveTo(x, y);
        ctx.lineTo(x - size, y + size * 1.5);
        ctx.lineTo(x + size, y + size * 1.5);
    } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x - size, y - size * 1.5);
        ctx.lineTo(x + size, y - size * 1.5);
    }
    ctx.closePath();
    ctx.fill();
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function distanceToSegment(
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
