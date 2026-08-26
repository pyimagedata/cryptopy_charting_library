interface KzOccurrence {
    zoneIdx: number;          // index into ZONE_DEFS (NOT into the filtered active list)
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

interface ActiveDef {
    def: ZoneDef;
    defIndex: number;
    startMin: number;
    endMin: number;
}

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** A pivot label queued for placement once every level line has been drawn. */
interface LevelLabel {
    x: number;      // left edge of the text box
    y: number;      // vertical centre, at the level's price
    text: string;
    color: string;
}

/** A box caption, measured and positioned up front but painted last. */
interface Caption {
    rect: Rect;
    lines: string[];
    color: string;
    x: number;
    yStart: number;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const ZONE_DEFS: ZoneDef[] = [
    { code: 'AS',  name: 'Asian KZ',      showKey: 'showAsia',   colorKey: 'asiaColor',   startKey: 'asiaStartH',   endKey: 'asiaEndH' },
    { code: 'LDN', name: 'London KZ',     showKey: 'showLondon', colorKey: 'londonColor', startKey: 'londonStartH', endKey: 'londonEndH' },
    { code: 'NY',  name: 'New York KZ',   showKey: 'showNyAm',   colorKey: 'nyAmColor',   startKey: 'nyStartH',     endKey: 'nyEndH' },
    { code: 'LC',  name: 'London Close',  showKey: 'showLc',     colorKey: 'lcColor',     startKey: 'lcStartH',     endKey: 'lcEndH' },
    { code: 'SB',  name: 'Silver Bullet', showKey: 'showSb',     colorKey: 'sbColor',     startKey: 'sbStartH',     endKey: 'sbEndH' },
];

const NUMERIC_KEYS = [
    'drawLastNDays', 'maxExtendBars', 'bgOpacity', 'tickSize',
    'asiaStartH', 'asiaEndH', 'londonStartH', 'londonEndH',
    'nyStartH', 'nyEndH', 'lcStartH', 'lcEndH', 'sbStartH', 'sbEndH',
];

const defaultKzOptions: any = {
    name: 'ICT Killzones',
    // Keep this on New York: the zone hours below are Eastern Time, and America/New_York
    // makes Intl apply the EST/EDT shift automatically. Selecting a fixed-offset zone
    // (e.g. Istanbul, which has no DST) shifts every box by an hour for half the year.
    timezone: 'America/New_York',
    drawLastNDays: 15,
    showBackgrounds: true,
    bgOpacity: 12,
    showZoneNames: true,
    showRanges: true,
    extendUntilSwept: true,
    maxExtendBars: 0,        // 0 = run to the right edge until actually swept
    tickSize: 0,             // 0 = derive from the feed's price decimals
    rangeUnit: 'both',
    showOcLines: true,
    showAvgLine: true,
    showRangeInfo: true,
    showAvgInfo: true,
    // --- Standard ICT killzone hours, New York time ---
    // 19:00-22:00 / 02:00-05:00 / 07:00-10:00 / 10:00-12:00
    showAsia: true,
    asiaColor: '#3b82f6',
    asiaStartH: 19,
    asiaEndH: 22,
    showLondon: true,
    londonColor: '#f59e0b',
    londonStartH: 2,
    londonEndH: 5,
    showNyAm: true,
    nyAmColor: '#22c55e',
    nyStartH: 7,             // contains the 08:20 COMEX open and 08:30 US data
    nyEndH: 10,
    showLc: true,
    lcColor: '#a855f7',
    lcStartH: 10,            // 10:00 ET = 15:00 London = the PM gold fix
    lcEndH: 12,
    showSb: false,           // optional Silver Bullet window, off by default
    sbColor: '#e11d48',
    sbStartH: 10,
    sbEndH: 11,
};

function kzDecimalsOf(v: number): number {
    if (!isFinite(v)) return -1;
    const s = String(v);
    if (s.indexOf('e') >= 0 || s.indexOf('E') >= 0) return -1;
    const dot = s.indexOf('.');
    if (dot < 0) return 0;
    const d = s.length - dot - 1;
    return d > 8 ? -1 : d;      // float noise, ignore this sample
}

class KillzonesIndicator extends OverlayIndicator {
    private _kz: any;
    private _occs: KzOccurrence[] = [];
    private _barZone: Uint16Array;
    private _minutes: number[];
    private _fmt: any;
    private _fmtTz: string;
    private _tickSize: number = 0.01;

    constructor(options: any = {}) {
        super({ ...defaultKzOptions, ...options });
        this._kz = { ...defaultKzOptions, ...(this as any)._options };
        this._occs = [];
        this._barZone = new Uint16Array(0);
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
                { value: 'America/New_York', label: 'New York (EST/EDT) — recommended' },
                { value: 'UTC', label: 'UTC' },
                { value: 'Europe/London', label: 'London' },
                { value: 'Europe/Istanbul', label: 'Istanbul (no DST — shifts in winter)' },
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
            { type: 'number', key: 'maxExtendBars', label: 'Max Extend (bars, 0 = unlimited)', min: 0, max: 5000, step: 1 },
            { type: 'number', key: 'tickSize', label: 'Tick Size (0 = Auto)', min: 0, max: 1000, step: 0.000001 },
            {
                type: 'select', key: 'rangeUnit', label: 'Range Shown As',
                options: [
                    { value: 'both', label: 'Ticks + Price' },
                    { value: 'ticks', label: 'Ticks (TradingView style)' },
                    { value: 'price', label: 'Price' },
                ],
            },
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

    /**
     * Tick size = the instrument's quoted increment, i.e. 10^-(price decimals).
     * Deriving it from the number of decimals the feed publishes matches what
     * Pine's syminfo.mintick reports (XAUUSD 3dp -> 0.001, EURUSD 5dp -> 0.00001).
     * The old "smallest observed close-to-close change" guess could never recover
     * this: gold ticks in 0.001 but the feed quantises to 0.005, so the guess
     * landed on whatever the quietest stretch of the oldest bars happened to be.
     */
    private _resolveTickSize(sourceData: any[]): number {
        const manual = Number(this._kz.tickSize);
        if (isFinite(manual) && manual > 0) return manual;
        let maxDec = 0;
        const step = Math.max(1, Math.floor(sourceData.length / 600));
        for (let i = 0; i < sourceData.length; i += step) {
            const b = sourceData[i];
            const d = Math.max(kzDecimalsOf(b.close), kzDecimalsOf(b.high), kzDecimalsOf(b.low));
            if (d > maxDec) maxDec = d;
            if (maxDec >= 8) break;
        }
        return Math.pow(10, -maxDec);
    }

    private _activeDefs(): ActiveDef[] {
        const out: ActiveDef[] = [];
        for (let k = 0; k < ZONE_DEFS.length; k++) {
            const z = ZONE_DEFS[k];
            if (!this._kz[z.showKey]) continue;
            let s = Math.round(Number(this._kz[z.startKey]) * 60);
            let e = Math.round(Number(this._kz[z.endKey]) * 60);
            s = Math.max(0, Math.min(1440, s));
            e = Math.max(0, Math.min(1440, e));
            if (s === e) continue;
            out.push({ def: z, defIndex: k, startMin: s, endMin: e });
        }
        return out;
    }

    calculate(sourceData: any[]): void {
        (this as any)._sourceData = sourceData;
        this._occs = [];
        this._barZone = new Uint16Array(sourceData.length);
        (this as any)._data = sourceData.map((b: any) => ({ time: b.time, value: NaN }));
        if (!sourceData || sourceData.length === 0) return;

        this._computeMinutes(sourceData);
        this._tickSize = this._resolveTickSize(sourceData);

        const defs = this._activeDefs();
        const rawExt = Math.max(0, Math.floor(Number(this._kz.maxExtendBars)));
        const maxExt = rawExt === 0 ? sourceData.length : rawExt;
        const sweepMode = !!this._kz.extendUntilSwept;

        for (const zd of defs) {
            let occ: KzOccurrence | null = null;
            for (let i = 0; i < sourceData.length; i++) {
                const mod = this._minutes[i];
                const inZ = zd.startMin < zd.endMin
                    ? (mod >= zd.startMin && mod < zd.endMin)
                    : (mod >= zd.startMin || mod < zd.endMin);
                if (inZ) {
                    if (!occ) {
                        occ = {
                            zoneIdx: zd.defIndex, startIdx: i, endIdx: i,
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
                    // bitmask, so overlapping zones (e.g. Silver Bullet inside London Close)
                    // are all reported instead of only the first one that claimed the bar
                    this._barZone[i] |= (1 << zd.defIndex);
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
        }
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
            const mask = this._barZone[index];
            if (mask > 0) {
                const names: string[] = [];
                for (let k = 0; k < ZONE_DEFS.length; k++) {
                    if (mask & (1 << k)) names.push(ZONE_DEFS[k].name);
                }
                if (names.length > 0) return 'KZ: ' + names.join(' + ');
            }
        }
        return 'No Killzone';
    }

    private _cutoffTime(src: any[]): number {
        return src[src.length - 1].time - Number(this._kz.drawLastNDays) * 86400000;
    }

    /**
     * Label styling is deliberately theme-independent: a dark plate with white text
     * reads on both light and dark charts, and stays legible over candles of any
     * colour. Tinting the text per zone was the earlier approach but it lost
     * contrast badly on a light background - the zone is already named in the text.
     */
    private _plate(alpha: number = 0.6): string {
        return 'rgba(0,0,0,' + alpha.toFixed(2) + ')';
    }

    private _labelText(): string {
        return '#ffffff';
    }

    drawOverlay(ctx: any, timeScale: any, priceScale: any, hpr: number, vpr: number, visibleRange?: any): void {
        const src = (this as any)._sourceData;
        const len = src ? src.length : 0;
        if (!len || this._occs.length === 0) return;

        const canvasW = ctx.canvas.width;
        const cutoff = this._cutoffTime(src);
        // Box captions claim their space first so pivot labels can avoid them, but
        // they are painted last so no level line gets drawn across their text.
        const reserved: Rect[] = [];
        const captions: Caption[] = [];

        ctx.save();

        const wantBoxVisuals = this._kz.showBackgrounds || this._kz.showOcLines || this._kz.showAvgLine
            || this._kz.showRangeInfo || this._kz.showAvgInfo || this._kz.showZoneNames;
        if (wantBoxVisuals) {
            const alpha = Math.max(0.01, Math.min(0.9, Number(this._kz.bgOpacity) / 100));
            for (const occ of this._occs) {
                // zoneIdx indexes ZONE_DEFS directly, so the colour/label/visibility of a
                // box can no longer drift onto a different zone when one is hidden.
                const def = ZONE_DEFS[occ.zoneIdx];
                if (!def || !this._kz[def.showKey]) continue;
                if (src[occ.startIdx].time < cutoff) continue;   // N-day filter now applies to boxes too

                const color = this._kz[def.colorKey];
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

                const caption = this._layoutCaption(ctx, def, occ, left, Math.max(yTopRaw, yBotRaw), color, hpr, vpr, reserved);
                if (caption) {
                    captions.push(caption);
                    reserved.push(caption.rect);
                }
            }
        }

        if (this._kz.showRanges) {
            // Lines first, labels collected. Placement has to see every candidate
            // before it can decide what collides with what.
            const pending: LevelLabel[] = [];
            for (const occ of this._occs) {
                if (src[occ.startIdx].time < cutoff) continue;
                const def = ZONE_DEFS[occ.zoneIdx];
                if (!def || !this._kz[def.showKey]) continue;
                const color = this._kz[def.colorKey];
                this._drawLevel(ctx, timeScale, priceScale, hpr, vpr, occ.startIdx, occ.hiExtEnd, occ.high, color, def.code + ' H', canvasW, pending);
                this._drawLevel(ctx, timeScale, priceScale, hpr, vpr, occ.startIdx, occ.loExtEnd, occ.low, color, def.code + ' L', canvasW, pending);
            }
            this._paintCaptions(ctx, captions, hpr, vpr);
            this._placeLevelLabels(ctx, pending, reserved, hpr, vpr, canvasW);
        } else {
            this._paintCaptions(ctx, captions, hpr, vpr);
        }

        ctx.restore();
    }

    private _drawLevel(ctx: any, timeScale: any, priceScale: any, hpr: number, vpr: number, i1: number, i2: number, price: number, color: string, label: string, canvasW: number, pending: LevelLabel[]): void {
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
            pending.push({ x: x2 + 3 * hpr, y, text: label, color });
        }
    }

    /**
     * Place the pivot labels, following the de-overlap approach in TFO's
     * "ICT Killzones & Pivots": labels landing on the same spot are merged into one
     * confluence label joined by " / " rather than being drawn on top of each other,
     * and a `consumed` flag stops a label being absorbed twice.
     *
     * Two deviations from the Pine original, both forced by the medium:
     *  - TFO merges on exact price equality (round_to_mintick). Here the labels are
     *    painted, not placed, so proximity is measured in pixels - two levels a few
     *    cents apart still collide visually and must merge.
     *  - TFO has to restore every label's own text each pass before re-merging,
     *    because Pine label objects persist. This canvas is rebuilt from scratch
     *    every frame, so labels re-separate on their own once the prices diverge.
     */
    private _placeLevelLabels(ctx: any, pending: LevelLabel[], reserved: Rect[], hpr: number, vpr: number, canvasW: number): void {
        if (pending.length === 0) return;

        const rowH = 13 * vpr;
        const padX = 6 * hpr;
        ctx.save();
        ctx.font = 'bold ' + (9 * hpr) + 'px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const rectFor = (l: LevelLabel, text: string): Rect => ({
            x: l.x,
            y: l.y - rowH,
            w: ctx.measureText(text).width + padX,
            h: rowH,
        });

        const consumed: boolean[] = new Array(pending.length).fill(false);
        const placed: Rect[] = [];

        for (let i = 0; i < pending.length; i++) {
            if (consumed[i]) continue;
            const anchor = pending[i];
            let text = anchor.text;
            let rect = rectFor(anchor, text);

            // Absorb every later label this one covers. Re-measuring as the text grows
            // lets a widened label keep pulling in neighbours it now reaches.
            for (let j = i + 1; j < pending.length; j++) {
                if (consumed[j]) continue;
                if (!rectsOverlap(rect, rectFor(pending[j], pending[j].text))) continue;
                consumed[j] = true;
                text += ' / ' + pending[j].text;
                rect = rectFor(anchor, text);
            }

            // Merging handles same-price pileups; a merged label can still land on a
            // box caption, so nudge it clear. Bounded so it can never spin.
            let tries = 0;
            while (tries < 12 && [...reserved, ...placed].some((r) => rectsOverlap(rect, r))) {
                rect = { ...rect, y: rect.y - rowH };
                tries++;
            }
            if (rect.x + rect.w > canvasW) continue;   // would run off the right edge

            ctx.fillStyle = this._plate();
            ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
            // Thin colour bar keeps the zone identifiable now the text is white
            ctx.fillStyle = anchor.color;
            ctx.fillRect(rect.x, rect.y, Math.max(2, 2 * hpr), rect.h);
            ctx.fillStyle = this._labelText();
            ctx.fillText(text, rect.x + 5 * hpr, rect.y + rect.h / 2);
            placed.push(rect);
        }

        ctx.restore();
    }

    private _rangeText(occ: KzOccurrence): string {
        const priceRange = occ.high - occ.low;
        const ticks = Math.round(priceRange / this._tickSize);
        const tickStr = ticks.toLocaleString('en-US');
        const priceStr = this._fmtNumber(priceRange);
        const unit = this._kz.rangeUnit;
        if (unit === 'ticks') return 'Range: ' + tickStr;
        if (unit === 'price') return 'Range: ' + priceStr;
        return 'Range: ' + tickStr + ' (' + priceStr + ')';
    }

    /**
     * Draws the box caption and returns the space it occupies, so pivot labels
     * (and later captions) can place themselves around it. Captions sit on top of
     * candles, box fills and level lines, so they carry their own backing plate -
     * without it the dashed lines run straight through the digits.
     */
    private _layoutCaption(ctx: any, def: ZoneDef, occ: any, xLeft: number, yBottom: number, color: string, hpr: number, vpr: number, reserved: Rect[]): Caption | null {
        const lines: string[] = [];
        if (this._kz.showRangeInfo) {
            lines.push(this._rangeText(occ));
        }
        if (this._kz.showAvgInfo && occ.numBars > 1) {
            lines.push('Avg: ' + this._fmtNumber(occ.sumClose / occ.numBars));
        }
        if (this._kz.showZoneNames) {
            lines.push(def.name.toUpperCase());
        }
        if (lines.length === 0) return null;

        ctx.save();
        ctx.font = 'bold ' + (10 * hpr) + 'px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        const lineH = 13 * vpr;
        const padX = 4 * hpr;
        let widest = 0;
        for (const line of lines) {
            const w = ctx.measureText(line).width;
            if (w > widest) widest = w;
        }

        const x = xLeft + padX;
        let yStart = yBottom - 5 * vpr - (lines.length - 1) * lineH;
        let rect: Rect = { x, y: yStart - lineH, w: widest + padX * 2, h: lines.length * lineH + 4 * vpr };

        // Adjacent sessions put their captions in the same place; step clear of any
        // caption already drawn rather than stacking text on text.
        let tries = 0;
        while (tries < 10 && reserved.some((r) => rectsOverlap(rect, r))) {
            yStart -= rect.h;
            rect = { ...rect, y: rect.y - rect.h };
            tries++;
        }

        ctx.restore();
        return { rect, lines, color, x, yStart };
    }

    /**
     * Captions are painted after the level lines, so a dashed pivot line can never
     * be drawn across the digits. Their positions were fixed earlier, during the box
     * pass, because the pivot labels need to know what space is already taken.
     */
    private _paintCaptions(ctx: any, captions: Caption[], hpr: number, vpr: number): void {
        if (captions.length === 0) return;
        const lineH = 13 * vpr;
        const padX = 4 * hpr;
        ctx.save();
        ctx.font = 'bold ' + (10 * hpr) + 'px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        for (const c of captions) {
            ctx.fillStyle = this._plate();
            ctx.fillRect(c.rect.x - padX, c.rect.y, c.rect.w, c.rect.h);
            // Thin colour bar keeps the zone identifiable now the text is white
            ctx.fillStyle = this._hexToRgba(c.color, 0.95);
            ctx.fillRect(c.rect.x - padX, c.rect.y, Math.max(2, 2 * hpr), c.rect.h);
            ctx.fillStyle = this._labelText();
            for (let i = 0; i < c.lines.length; i++) {
                ctx.fillText(c.lines[i], c.x, c.yStart + i * lineH);
            }
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
