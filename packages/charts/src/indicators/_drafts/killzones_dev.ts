interface KzOccurrence {
    zoneIdx: number;
    startIdx: number;
    endIdx: number;
    high: number;
    low: number;
    open: boolean;
    hiExtEnd: number;
    loExtEnd: number;
    hiSwept: boolean;
    loSwept: boolean;
    openPrice: number;
    closePrice: number;
    sumClose: number;
    numBars: number;
}

interface ZoneDef {
    code: string;
    name: string;
    showKey: string;
    colorKey: string;
    startKey: string;
    endKey: string;
}

const ZONE_DEFS: ZoneDef[] = [
    { code: 'AS',  name: 'Asian KZ',       showKey: 'showAsia',   colorKey: 'asiaColor',   startKey: 'asiaStartH',   endKey: 'asiaEndH' },
    { code: 'LDN', name: 'London KZ',      showKey: 'showLondon', colorKey: 'londonColor', startKey: 'londonStartH', endKey: 'londonEndH' },
    { code: 'NY',  name: 'New York KZ',    showKey: 'showNyAm',   colorKey: 'nyAmColor',   startKey: 'nyStartH',     endKey: 'nyEndH' },
    { code: 'LC',  name: 'London Close',   showKey: 'showLc',     colorKey: 'lcColor',     startKey: 'lcStartH',     endKey: 'lcEndH' },
];

const NUMERIC_KEYS = [
    'drawLastNDays', 'maxExtendBars', 'bgOpacity',
    'asiaStartH', 'asiaEndH', 'londonStartH', 'londonEndH',
    'nyStartH', 'nyEndH', 'lcStartH', 'lcEndH',
];

const defaultKzOptions: any = {
    name: 'ICT Killzones',
    timezone: 'America/New_York',
    drawLastNDays: 15,
    showBackgrounds: true,
    bgOpacity: 12,
    showZoneNames: true,
    showRanges: true,
    extendUntilSwept: true,
    maxExtendBars: 60,
    showOcLines: true,
    showAvgLine: true,
    showRangeInfo: true,
    showAvgInfo: true,
    showAsia: true,
    asiaColor: '#3b82f6',
    asiaStartH: 20,
    asiaEndH: 24,
    showLondon: true,
    londonColor: '#f59e0b',
    londonStartH: 2,
    londonEndH: 5,
    showNyAm: true,
    nyAmColor: '#22c55e',
    nyStartH: 7,
    nyEndH: 10,
    showLc: true,
    lcColor: '#a855f7',
    lcStartH: 10,
    lcEndH: 12,
};

class KillzonesIndicator extends OverlayIndicator {
    private _kz: any;
    private _occs: KzOccurrence[] = [];
    private _barZone: Uint8Array;
    private _minutes: number[];
    private _fmt: any;
    private _fmtTz: string;
    private _tickSize: number = 0.01;

    constructor(options: any = {}) {
        super({ ...defaultKzOptions, ...options });
        this._kz = { ...defaultKzOptions, ...(this as any)._options };
        this._occs = [];
        this._barZone = new Uint8Array(0);
        this._minutes = [];
        this._fmt = null;
        this._fmtTz = '';
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...(this as any)._options, ...this._kz };
    }

    updateOptions(newOptions: any): boolean {
        const normalized: any = { ...newOptions };
        for (const k of NUMERIC_KEYS) {
            if (normalized[k] !== undefined) normalized[k] = Number(normalized[k]);
        }
        Object.assign(this._kz, normalized);
        Object.assign((this as any)._options, normalized);
        return true;
    }

    setSettingValue(key: string, value: any): boolean {
        this.updateOptions({ [key]: value });
        if ((this as any)._sourceData.length > 0) {
            this.calculate((this as any)._sourceData);
        }
        (this as any)._dataChanged.fire();
        return true;
    }

    getSettingsConfig(): any {
        const tzRow = {
            type: 'select', key: 'timezone', label: 'Timezone',
            options: [
                { value: 'America/New_York', label: 'New York (EST/EDT)' },
                { value: 'UTC', label: 'UTC' },
                { value: 'Europe/London', label: 'London' },
                { value: 'Europe/Istanbul', label: 'Istanbul' },
                { value: 'Asia/Tokyo', label: 'Tokyo' },
            ],
        };
        const inputRows: any[] = [
            tzRow,
            { type: 'number', key: 'drawLastNDays', label: 'Draw Last N Days', min: 1, max: 120, step: 1 },
            { type: 'checkbox', key: 'showBackgrounds', label: 'Highlight Backgrounds' },
            { type: 'slider', key: 'bgOpacity', label: 'BG Opacity', min: 3, max: 50, step: 1, suffix: '%' },
            { type: 'checkbox', key: 'showZoneNames', label: 'Zone Name Labels' },
            { type: 'checkbox', key: 'showRanges', label: 'High/Low Levels' },
            { type: 'checkbox', key: 'extendUntilSwept', label: 'Extend Until Swept' },
            { type: 'number', key: 'maxExtendBars', label: 'Max Extend (bars)', min: 0, max: 1000, step: 1 },
            { type: 'checkbox', key: 'showOcLines', label: 'Open/Close Lines' },
            { type: 'checkbox', key: 'showAvgLine', label: 'Average Price Line' },
            { type: 'checkbox', key: 'showRangeInfo', label: 'Range in Label' },
            { type: 'checkbox', key: 'showAvgInfo', label: 'Average in Label' },
        ];
        const styleRows: any[] = [];
        for (const z of ZONE_DEFS) {
            styleRows.push(
                { type: 'checkbox', key: z.showKey, label: z.name },
                { type: 'color', key: z.colorKey, label: z.name + ' Color' },
                { type: 'number', key: z.startKey, label: z.name + ' Start (h)', min: 0, max: 24, step: 0.25 },
                { type: 'number', key: z.endKey, label: z.name + ' End (h)', min: 0, max: 24, step: 0.25 },
            );
        }
        return {
            name: this.name,
            tabs: [
                { id: 'inputs', label: 'Inputs', sections: [{ title: 'Killzones', rows: inputRows }] },
                { id: 'style', label: 'Style', sections: [{ title: 'Zones', rows: styleRows }] },
                { id: 'visibility', label: 'Visibility', sections: [{ title: '', rows: [{ type: 'checkbox', key: 'visible', label: 'Visible' }] }] },
            ],
        };
    }

    private _getFormatter(tz: string): any {
        if (!this._fmt || this._fmtTz !== tz) {
            try {
                this._fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
                this._fmtTz = tz;
            } catch (e) {
                this._fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
                this._fmtTz = 'UTC';
            }
        }
        return this._fmt;
    }

    private _computeMinutes(sourceData: any[]): void {
        const fmt = this._getFormatter(this._kz.timezone);
        this._minutes = new Array(sourceData.length);
        for (let i = 0; i < sourceData.length; i++) {
            const parts = fmt.formatToParts(new Date(sourceData[i].time));
            let h = 0, m = 0;
            for (const p of parts) {
                if (p.type === 'hour') h = parseInt(p.value, 10);
                else if (p.type === 'minute') m = parseInt(p.value, 10);
            }
            if (h === 24) h = 0;
            this._minutes[i] = h * 60 + m;
        }
    }

    private _activeDefs(): { def: ZoneDef; startMin: number; endMin: number }[] {
        const out: { def: ZoneDef; startMin: number; endMin: number }[] = [];
        for (const z of ZONE_DEFS) {
            if (!this._kz[z.showKey]) continue;
            let s = Math.round(Number(this._kz[z.startKey]) * 60);
            let e = Math.round(Number(this._kz[z.endKey]) * 60);
            s = Math.max(0, Math.min(1440, s));
            e = Math.max(0, Math.min(1440, e));
            if (s === e) continue;
            out.push({ def: z, startMin: s, endMin: e });
        }
        return out;
    }

    calculate(sourceData: any[]): void {
        (this as any)._sourceData = sourceData;
        this._occs = [];
        this._barZone = new Uint8Array(sourceData.length);
        (this as any)._data = sourceData.map((b: any) => ({ time: b.time, value: NaN }));
        if (!sourceData || sourceData.length === 0) return;

        this._computeMinutes(sourceData);
        let ts = Infinity;
        for (let i = 1; i < Math.min(sourceData.length, 200); i++) {
            const diff = Math.abs(sourceData[i].close - sourceData[i - 1].close);
            if (diff > 0 && diff < ts) ts = diff;
        }
        this._tickSize = ts === Infinity ? 0.01 : ts;
        const defs = this._activeDefs();
        const maxExt = Math.max(0, Math.floor(Number(this._kz.maxExtendBars)));
        const sweepMode = !!this._kz.extendUntilSwept;

        defs.forEach((zd, zi) => {
            let occ: KzOccurrence | null = null;
            for (let i = 0; i < sourceData.length; i++) {
                const mod = this._minutes[i];
                const inZ = zd.startMin < zd.endMin
                    ? (mod >= zd.startMin && mod < zd.endMin)
                    : (mod >= zd.startMin || mod < zd.endMin);
                if (inZ) {
                    if (!occ) {
                        occ = {
                            zoneIdx: zi, startIdx: i, endIdx: i,
                            high: sourceData[i].high, low: sourceData[i].low,
                            open: false, hiExtEnd: i, loExtEnd: i, hiSwept: false, loSwept: false,
                            openPrice: sourceData[i].open, closePrice: sourceData[i].close,
                            sumClose: sourceData[i].close, numBars: 1,
                        };
                        this._occs.push(occ);
                    } else {
                        occ.endIdx = i;
                        if (sourceData[i].high > occ.high) occ.high = sourceData[i].high;
                        if (sourceData[i].low < occ.low) occ.low = sourceData[i].low;
                        occ.closePrice = sourceData[i].close;
                        occ.sumClose += sourceData[i].close;
                        occ.numBars += 1;
                    }
                    if (!this._barZone[i]) this._barZone[i] = zi + 1;
                } else if (occ) {
                    occ.open = false;
                    this._resolveOcc(occ, sourceData, maxExt, sweepMode);
                    occ = null;
                }
            }
            if (occ) {
                occ.open = true;
                this._resolveOcc(occ, sourceData, maxExt, sweepMode);
            }
        });
    }

    private _resolveOcc(occ: KzOccurrence, sourceData: any[], maxExt: number, sweepMode: boolean): void {
        const lastIdx = sourceData.length - 1;
        const cap = Math.min(lastIdx, occ.endIdx + maxExt);
        let hiEnd = occ.endIdx, loEnd = occ.endIdx;
        occ.hiSwept = false; occ.loSwept = false;
        if (occ.open) {
            occ.hiExtEnd = lastIdx;
            occ.loExtEnd = lastIdx;
            return;
        }
        for (let j = occ.endIdx + 1; j <= cap; j++) {
            if (sweepMode && !occ.hiSwept) {
                hiEnd = j;
                if (sourceData[j].high > occ.high) occ.hiSwept = true;
            } else if (!sweepMode) {
                hiEnd = j;
            }
            if (sweepMode && !occ.loSwept) {
                loEnd = j;
                if (sourceData[j].low < occ.low) occ.loSwept = true;
            } else if (!sweepMode) {
                loEnd = j;
            }
        }
        occ.hiExtEnd = hiEnd;
        occ.loExtEnd = loEnd;
    }

    getRange(visibleRange?: any): any {
        const src = (this as any)._sourceData;
        if (!src || src.length === 0) return { min: 0, max: 100 };
        let min = Infinity, max = -Infinity;
        for (const b of src) {
            if (b.low < min) min = b.low;
            if (b.high > max) max = b.high;
        }
        return { min, max };
    }

    getDescription(index?: number): string {
        if (index !== undefined && index >= 0 && index < this._barZone.length) {
            const zi = this._barZone[index];
            if (zi > 0) return 'KZ: ' + ZONE_DEFS[zi - 1].name;
        }
        return 'No Killzone';
    }

    drawOverlay(ctx: any, timeScale: any, priceScale: any, hpr: number, vpr: number, visibleRange?: any): void {
        const src = (this as any)._sourceData;
        const len = src.length;
        if (!len) return;

        const canvasW = ctx.canvas.width;
        const defs = this._activeDefs();

        ctx.save();

        const wantBoxVisuals = this._kz.showBackgrounds || this._kz.showOcLines || this._kz.showAvgLine
            || this._kz.showRangeInfo || this._kz.showAvgInfo || this._kz.showZoneNames;
        if (wantBoxVisuals && defs.length > 0 && this._occs.length > 0) {
            const alpha = Math.max(0.01, Math.min(0.9, Number(this._kz.bgOpacity) / 100));
            for (const occ of this._occs) {
                const zd = defs[occ.zoneIdx];
                if (!zd) continue;
                const color = this._kz[zd.def.colorKey];
                const x1 = timeScale.indexToCoordinate(occ.startIdx) * hpr;
                const x2 = timeScale.indexToCoordinate(occ.endIdx) * hpr;
                const half = timeScale.barSpacing * hpr / 2;
                const left = x1 - half;
                const right = x2 + half;
                if (right < 0 || left > canvasW) continue;

                const yTopRaw = priceScale.priceToCoordinate(occ.high) * vpr;
                const yBotRaw = priceScale.priceToCoordinate(occ.low) * vpr;
                const topY = Math.min(yTopRaw, yBotRaw);
                const hgt = Math.max(1 * vpr, Math.abs(yBotRaw - yTopRaw));

                if (this._kz.showBackgrounds) {
                    ctx.fillStyle = this._hexToRgba(color, alpha);
                    ctx.fillRect(left, topY, right - left, hgt);
                    ctx.strokeStyle = this._hexToRgba(color, Math.min(0.85, alpha + 0.25));
                    ctx.lineWidth = Math.max(1, 1 * hpr);
                    ctx.strokeRect(left, topY, right - left, hgt);
                }

                if (this._kz.showOcLines && occ.numBars > 1) {
                    const yOpen = priceScale.priceToCoordinate(occ.openPrice) * vpr;
                    const yClose = priceScale.priceToCoordinate(occ.closePrice) * vpr;
                    ctx.fillStyle = this._hexToRgba(color, alpha);
                    ctx.beginPath();
                    ctx.moveTo(x1, yOpen);
                    ctx.lineTo(x2, yOpen);
                    ctx.lineTo(x2, yClose);
                    ctx.lineTo(x1, yClose);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = this._hexToRgba(color, 0.9);
                    ctx.lineWidth = Math.max(1, 1 * hpr);
                    ctx.setLineDash([5 * hpr, 4 * hpr]);
                    ctx.beginPath();
                    ctx.moveTo(x1, yOpen);
                    ctx.lineTo(x2, yOpen);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(x1, yClose);
                    ctx.lineTo(x2, yClose);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                if (this._kz.showAvgLine && occ.numBars > 1) {
                    const yAvg = priceScale.priceToCoordinate(occ.sumClose / occ.numBars) * vpr;
                    ctx.strokeStyle = this._hexToRgba(color, 0.95);
                    ctx.lineWidth = 2 * hpr;
                    ctx.setLineDash([2 * hpr, 3 * hpr]);
                    ctx.beginPath();
                    ctx.moveTo(x1, yAvg);
                    ctx.lineTo(x2, yAvg);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                this._drawSessionLabel(ctx, zd.def, occ, left, Math.max(yTopRaw, yBotRaw), color, hpr, vpr);
            }
        }

        if (this._kz.showRanges && this._occs.length > 0) {
            const cutoff = src[len - 1].time - Number(this._kz.drawLastNDays) * 86400000;
            for (const occ of this._occs) {
                if (src[occ.startIdx].time < cutoff) continue;
                const def = ZONE_DEFS[occ.zoneIdx];
                if (!this._kz[def.showKey]) continue;
                const color = this._kz[def.colorKey];
                this._drawLevel(ctx, timeScale, priceScale, hpr, vpr, occ.startIdx, occ.hiExtEnd, occ.high, color, def.code + ' H', canvasW);
                this._drawLevel(ctx, timeScale, priceScale, hpr, vpr, occ.startIdx, occ.loExtEnd, occ.low, color, def.code + ' L', canvasW);
            }
        }

        ctx.restore();
    }

    private _drawLevel(ctx: any, timeScale: any, priceScale: any, hpr: number, vpr: number, i1: number, i2: number, price: number, color: string, label: string, canvasW: number): void {
        const x1 = timeScale.indexToCoordinate(i1) * hpr;
        const x2 = timeScale.indexToCoordinate(i2) * hpr;
        if (x2 < 0 || x1 > canvasW) return;
        const y = priceScale.priceToCoordinate(price) * vpr;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, 1 * hpr);
        ctx.setLineDash([4 * hpr, 3 * hpr]);
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
        ctx.restore();
        if (x2 > 0 && x2 < canvasW - 60 * hpr) {
            ctx.save();
            ctx.font = 'bold ' + (9 * hpr) + 'px sans-serif';
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(x2 + 3 * hpr, y - 11 * vpr, tw + 6 * hpr, 13 * vpr);
            ctx.fillStyle = color;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x2 + 6 * hpr, y - 4 * vpr);
            ctx.restore();
        }
    }

    private _drawSessionLabel(ctx: any, def: ZoneDef, occ: any, xLeft: number, yBottom: number, color: string, hpr: number, vpr: number): void {
        const lines: string[] = [];
        if (this._kz.showRangeInfo) {
            const ticks = (occ.high - occ.low) / this._tickSize;
            lines.push('Range: ' + this._fmtNumber(ticks));
        }
        if (this._kz.showAvgInfo && occ.numBars > 1) {
            lines.push('Avg: ' + this._fmtNumber(occ.sumClose / occ.numBars));
        }
        if (this._kz.showZoneNames) {
            lines.push(def.name.toUpperCase());
        }
        if (lines.length === 0) return;
        ctx.save();
        ctx.font = 'bold ' + (10 * hpr) + 'px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = this._hexToRgba(color, 0.95);
        const lineH = 13 * vpr;
        const yStart = yBottom - 5 * vpr - (lines.length - 1) * lineH;
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], xLeft + 4 * hpr, yStart + i * lineH);
        }
        ctx.restore();
    }

    private _priceDecimals(): number {
        const t = Math.abs(Number(this._tickSize) || 0.01);
        let d = 0;
        while (d < 8) {
            const scaled = t * Math.pow(10, d);
            if (Math.abs(scaled - Math.round(scaled)) < 1e-6) break;
            d++;
        }
        return d;
    }

    private _fmtNumber(v: number): string {
        const d = this._priceDecimals();
        return Number(v.toFixed(d)).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    }

    private _hexToRgba(hex: string, alpha: number): string {
        if (typeof hex !== 'string') return 'rgba(120,120,120,' + alpha + ')';
        if (hex.startsWith('rgb')) return hex;
        const m = hex.replace('#', '');
        if (m.length !== 6) return 'rgba(120,120,120,' + alpha + ')';
        const r = parseInt(m.substring(0, 2), 16);
        const g = parseInt(m.substring(2, 4), 16);
        const b = parseInt(m.substring(4, 6), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }
}

globalThis.__draftIndicatorClass = KillzonesIndicator;
