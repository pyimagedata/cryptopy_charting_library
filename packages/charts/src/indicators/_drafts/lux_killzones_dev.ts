// Port of LuxAlgo's "ICT Killzones Toolkit" (CC BY-NC-SA 4.0).
// The distinguishing idea is that the killzone is a FILTER, not just a box: order
// blocks, market structure shifts and fair value gaps are only detected on bars
// that fall inside a killzone, and are cleared when a new killzone opens.
//
// Deliberate deviation from the original: LuxAlgo hardcodes the session zone to the
// fixed offset 'UTC-5', which does not track daylight saving, so every box drifts an
// hour for half the year. This uses America/New_York so Intl applies EST/EDT.

interface LuxBar { time: number; open: number; high: number; low: number; close: number; }

interface ZoneDef {
    code: string;
    name: string;
    showKey: string;
    colorKey: string;
    startKey: string;
    endKey: string;
}

const LUX_ZONES: ZoneDef[] = [
    { code: 'AS',   name: 'Asian',       showKey: 'showAsia',  colorKey: 'asiaColor',  startKey: 'asiaStart',  endKey: 'asiaEnd' },
    { code: 'LDN',  name: 'London',      showKey: 'showLdn',   colorKey: 'ldnColor',   startKey: 'ldnStart',   endKey: 'ldnEnd' },
    { code: 'NYAM', name: 'New York AM', showKey: 'showNyAm',  colorKey: 'nyAmColor',  startKey: 'nyAmStart',  endKey: 'nyAmEnd' },
    { code: 'NYPM', name: 'New York PM', showKey: 'showNyPm',  colorKey: 'nyPmColor',  startKey: 'nyPmStart',  endKey: 'nyPmEnd' },
];

const LUX_NUMERIC = [
    'maxTimeframeMin', 'swingLen', 'mssLen', 'fvgThreshold', 'sessionLimit',
    'asiaStart', 'asiaEnd', 'ldnStart', 'ldnEnd',
    'nyAmStart', 'nyAmEnd', 'nyPmStart', 'nyPmEnd',
];

const luxDefaults: any = {
    name: 'ICT Killzones Toolkit',
    timezone: 'America/New_York',
    // LuxAlgo's session defaults, in New York time
    showAsia: true,  asiaColor: '#e91e63',  asiaStart: 20,   asiaEnd: 24,
    showLdn: true,   ldnColor: '#00bcd4',   ldnStart: 2,     ldnEnd: 5,
    // 09:30 is the NYSE cash open. LuxAlgo writes 08:30 but pins its sessions to a
    // fixed 'UTC-5', so during EDT their box actually lands at 09:30 NY wall clock.
    // Reading the hours as wall clock (which is what their NY PM 13:30-16:00 implies,
    // ending exactly at the cash close) means 09:30 has to be written explicitly.
    // TFO's killzone indicator independently uses 0930-1100 for NY AM.
    showNyAm: true,  nyAmColor: '#ff5d00',  nyAmStart: 9.5,  nyAmEnd: 11,
    showNyPm: true,  nyPmColor: '#2157f3',  nyPmStart: 13.5, nyPmEnd: 16,

    maxTimeframeMin: 15,      // LuxAlgo's kzSH: hide everything above this timeframe
    sessionLimit: 8,          // how many recent killzones to keep drawn
    bgOpacity: 10,
    showBoundLines: true,     // top/bottom
    showMeanLine: false,
    extendLines: true,        // extend top/bottom until swept
    showLabels: true,

    showOB: true,
    showBB: false,
    swingLen: 5,
    mitigationSource: 'Closing Price',
    useBody: false,
    removeMitigated: true,
    bullOBColor: '#2157f3',
    bearOBColor: '#ff5d00',
    bullBBColor: '#ff1100',
    bearBBColor: '#0cb51a',

    showMSS: false,
    mssLen: 7,
    mssBullColor: '#089981',
    mssBearColor: '#f23645',

    showFVG: true,
    fvgThreshold: 1.2,
    removeMitigatedFvg: true,
    fvgBullColor: '#4caf50',
    fvgBearColor: '#f23645',
};

interface KzSession {
    zoneIdx: number;
    startIdx: number;
    endIdx: number;
    high: number;
    low: number;
    openPrice: number;
    hiEnd: number;
    loEnd: number;
    open: boolean;
}

interface Block {
    top: number;
    btm: number;
    startIdx: number;
    endIdx: number;
    bull: boolean;
    breaker: boolean;
    breakIdx: number;
    alive: boolean;
}

interface Gap {
    top: number;
    btm: number;
    startIdx: number;
    endIdx: number;
    bull: boolean;
    alive: boolean;
}

interface Shift {
    price: number;
    fromIdx: number;
    toIdx: number;
    bull: boolean;
}

class LuxKillzonesIndicator extends OverlayIndicator {
    private _o: any;
    private _sessions: KzSession[] = [];
    private _blocks: Block[] = [];
    private _gaps: Gap[] = [];
    private _shifts: Shift[] = [];
    private _minutes: number[] = [];
    private _inKz: Uint8Array = new Uint8Array(0);
    private _fmt: any = null;
    private _fmtTz: string = '';
    private _barMinutes: number = 0;
    private _tfBlocked: boolean = false;

    constructor(options: any = {}) {
        super({ ...luxDefaults, ...options });
        this._o = { ...luxDefaults, ...(this as any)._options };
    }

    protected _getAllOptions(): Record<string, any> {
        return { ...(this as any)._options, ...this._o };
    }

    updateOptions(newOptions: any): boolean {
        const n: any = { ...newOptions };
        for (const k of LUX_NUMERIC) {
            if (n[k] !== undefined) n[k] = Number(n[k]);
        }
        Object.assign(this._o, n);
        Object.assign((this as any)._options, n);
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
        const zoneRows: any[] = [];
        for (const z of LUX_ZONES) {
            zoneRows.push(
                { type: 'checkbox', key: z.showKey, label: z.name },
                { type: 'color', key: z.colorKey, label: z.name + ' Color' },
                { type: 'number', key: z.startKey, label: z.name + ' Start (h)', min: 0, max: 24, step: 0.25 },
                { type: 'number', key: z.endKey, label: z.name + ' End (h)', min: 0, max: 24, step: 0.25 },
            );
        }
        return {
            name: this.name,
            tabs: [
                {
                    id: 'inputs', label: 'Inputs', sections: [
                        {
                            title: 'Killzones', rows: [
                                {
                                    type: 'select', key: 'timezone', label: 'Session Clock',
                                    options: [
                                        { value: 'America/New_York', label: 'New York (EST/EDT) — recommended' },
                                        { value: 'UTC', label: 'UTC' },
                                        { value: 'Europe/London', label: 'London' },
                                        { value: 'Europe/Istanbul', label: 'Istanbul (no DST)' },
                                        { value: 'Asia/Tokyo', label: 'Tokyo' },
                                    ],
                                },
                                { type: 'number', key: 'maxTimeframeMin', label: 'Hide Above Timeframe (min)', min: 1, max: 240, step: 1 },
                                { type: 'number', key: 'sessionLimit', label: 'Sessions Kept', min: 1, max: 60, step: 1 },
                                { type: 'slider', key: 'bgOpacity', label: 'BG Opacity', min: 3, max: 50, step: 1, suffix: '%' },
                                { type: 'checkbox', key: 'showBoundLines', label: 'Top / Bottom Lines' },
                                { type: 'checkbox', key: 'showMeanLine', label: 'Mean Line' },
                                { type: 'checkbox', key: 'extendLines', label: 'Extend Until Swept' },
                                { type: 'checkbox', key: 'showLabels', label: 'Killzone Labels' },
                            ],
                        },
                        {
                            title: 'Order Blocks & Breaker Blocks', rows: [
                                { type: 'checkbox', key: 'showOB', label: 'Order Blocks' },
                                { type: 'checkbox', key: 'showBB', label: 'Breaker Blocks' },
                                { type: 'number', key: 'swingLen', label: 'Swing Detection Length', min: 3, max: 50, step: 1 },
                                {
                                    type: 'select', key: 'mitigationSource', label: 'Mitigation Price',
                                    options: [
                                        { value: 'Closing Price', label: 'Closing Price' },
                                        { value: 'Wick', label: 'Wick' },
                                    ],
                                },
                                { type: 'checkbox', key: 'useBody', label: 'Use Candle Body in Detection' },
                                { type: 'checkbox', key: 'removeMitigated', label: 'Remove Mitigated' },
                                { type: 'color', key: 'bullOBColor', label: 'OB Bullish' },
                                { type: 'color', key: 'bearOBColor', label: 'OB Bearish' },
                                { type: 'color', key: 'bullBBColor', label: 'BB Bullish' },
                                { type: 'color', key: 'bearBBColor', label: 'BB Bearish' },
                            ],
                        },
                        {
                            title: 'Market Structure Shifts', rows: [
                                { type: 'checkbox', key: 'showMSS', label: 'Market Structure Shifts' },
                                { type: 'number', key: 'mssLen', label: 'Detection Length', min: 1, max: 50, step: 1 },
                                { type: 'color', key: 'mssBullColor', label: 'MSS Bullish' },
                                { type: 'color', key: 'mssBearColor', label: 'MSS Bearish' },
                            ],
                        },
                        {
                            title: 'Fair Value Gaps', rows: [
                                { type: 'checkbox', key: 'showFVG', label: 'Fair Value Gaps' },
                                { type: 'number', key: 'fvgThreshold', label: 'Width Filter (x ATR)', min: 0, max: 10, step: 0.1 },
                                { type: 'checkbox', key: 'removeMitigatedFvg', label: 'Remove Mitigated' },
                                { type: 'color', key: 'fvgBullColor', label: 'Bullish Imbalance' },
                                { type: 'color', key: 'fvgBearColor', label: 'Bearish Imbalance' },
                            ],
                        },
                    ],
                },
                { id: 'style', label: 'Style', sections: [{ title: 'Zones', rows: zoneRows }] },
                { id: 'visibility', label: 'Visibility', sections: [{ title: '', rows: [{ type: 'checkbox', key: 'visible', label: 'Visible' }] }] },
            ],
        };
    }

    private _computeMinutes(data: LuxBar[]): void {
        const tz = this._o.timezone || 'America/New_York';
        if (!this._fmt || this._fmtTz !== tz) {
            try {
                this._fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
                this._fmtTz = tz;
            } catch (e) {
                this._fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
                this._fmtTz = 'UTC';
            }
        }
        this._minutes = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
            let h = 0, m = 0;
            for (const p of this._fmt.formatToParts(new Date(data[i].time))) {
                if (p.type === 'hour') h = parseInt(p.value, 10);
                else if (p.type === 'minute') m = parseInt(p.value, 10);
            }
            if (h === 24) h = 0;
            this._minutes[i] = h * 60 + m;
        }
    }

    /**
     * LuxAlgo gates on `timeframe.multiplier <= kzSH`. Pine knows the chart timeframe
     * directly; here it has to come from the data, so take the most common gap
     * between consecutive bars rather than the first, which can straddle a weekend.
     */
    private _inferBarMinutes(data: LuxBar[]): number {
        if (data.length < 3) return 0;
        const counts: Record<number, number> = {};
        const sample = Math.min(data.length - 1, 300);
        for (let i = data.length - sample; i < data.length; i++) {
            const d = Math.round((data[i].time - data[i - 1].time) / 60000);
            if (d > 0) counts[d] = (counts[d] || 0) + 1;
        }
        let best = 0, bestN = 0;
        for (const k in counts) {
            if (counts[k] > bestN) { bestN = counts[k]; best = Number(k); }
        }
        return best;
    }

    private _activeZones(): { def: ZoneDef; idx: number; s: number; e: number }[] {
        const out: { def: ZoneDef; idx: number; s: number; e: number }[] = [];
        for (let k = 0; k < LUX_ZONES.length; k++) {
            const z = LUX_ZONES[k];
            if (!this._o[z.showKey]) continue;
            const s = Math.max(0, Math.min(1440, Math.round(Number(this._o[z.startKey]) * 60)));
            const e = Math.max(0, Math.min(1440, Math.round(Number(this._o[z.endKey]) * 60)));
            if (s === e) continue;
            out.push({ def: z, idx: k, s, e });
        }
        return out;
    }

    private _atr(data: LuxBar[], period: number): number[] {
        const out = new Array(data.length).fill(NaN);
        let sum = 0;
        const trs: number[] = new Array(data.length).fill(0);
        for (let i = 0; i < data.length; i++) {
            const prevClose = i > 0 ? data[i - 1].close : data[i].open;
            trs[i] = Math.max(
                data[i].high - data[i].low,
                Math.abs(data[i].high - prevClose),
                Math.abs(data[i].low - prevClose),
            );
            sum += trs[i];
            if (i >= period) sum -= trs[i - period];
            if (i >= period - 1) out[i] = sum / period;
        }
        return out;
    }

    calculate(sourceData: LuxBar[]): void {
        (this as any)._sourceData = sourceData;
        (this as any)._data = sourceData.map((b) => ({ time: b.time, value: NaN }));
        this._sessions = [];
        this._blocks = [];
        this._gaps = [];
        this._shifts = [];
        this._inKz = new Uint8Array(sourceData.length);
        if (!sourceData || sourceData.length === 0) return;

        this._barMinutes = this._inferBarMinutes(sourceData);
        this._tfBlocked = this._barMinutes > Number(this._o.maxTimeframeMin);
        if (this._tfBlocked) return;   // LuxAlgo draws nothing above the timeframe cap

        this._computeMinutes(sourceData);
        const zones = this._activeZones();
        const n = sourceData.length;

        // --- Killzone sessions -------------------------------------------------
        for (const z of zones) {
            let cur: KzSession | null = null;
            for (let i = 0; i < n; i++) {
                const mod = this._minutes[i];
                const inside = z.s < z.e ? (mod >= z.s && mod < z.e) : (mod >= z.s || mod < z.e);
                if (inside) {
                    this._inKz[i] = 1;
                    if (!cur) {
                        cur = {
                            zoneIdx: z.idx, startIdx: i, endIdx: i,
                            high: sourceData[i].high, low: sourceData[i].low,
                            openPrice: sourceData[i].open,
                            hiEnd: i, loEnd: i, open: false,
                        };
                        this._sessions.push(cur);
                    } else {
                        cur.endIdx = i;
                        if (sourceData[i].high > cur.high) cur.high = sourceData[i].high;
                        if (sourceData[i].low < cur.low) cur.low = sourceData[i].low;
                    }
                } else if (cur) {
                    cur = null;
                }
            }
        }
        for (const s of this._sessions) {
            s.open = s.endIdx === n - 1;
            this._resolveExtend(s, sourceData);
        }
        // Keep only the most recent N sessions per zone, as LuxAlgo's max_days does
        const limit = Math.max(1, Math.floor(Number(this._o.sessionLimit)));
        const perZone: Record<number, number> = {};
        const kept: KzSession[] = [];
        for (let i = this._sessions.length - 1; i >= 0; i--) {
            const s = this._sessions[i];
            perZone[s.zoneIdx] = (perZone[s.zoneIdx] || 0) + 1;
            if (perZone[s.zoneIdx] <= limit) kept.unshift(s);
        }
        this._sessions = kept;

        // --- Everything below is killzone-gated, which is LuxAlgo's whole point ---
        if (this._o.showOB || this._o.showBB) this._detectBlocks(sourceData);
        if (this._o.showMSS) this._detectShifts(sourceData);
        if (this._o.showFVG) this._detectGaps(sourceData);
    }

    /** Each bound runs past the session until price trades through it. */
    private _resolveExtend(s: KzSession, data: LuxBar[]): void {
        const last = data.length - 1;
        s.hiEnd = s.endIdx;
        s.loEnd = s.endIdx;
        if (!this._o.extendLines) return;
        for (let j = s.endIdx + 1; j <= last; j++) {
            s.hiEnd = j;
            if (data[j].high > s.high) break;
        }
        for (let j = s.endIdx + 1; j <= last; j++) {
            s.loEnd = j;
            if (data[j].low < s.low) break;
        }
    }

    /**
     * LuxAlgo's swing tracker: `os` flips when a bar `len` back exceeds the running
     * highest/lowest, and the swing is recorded at that offset bar.
     */
    private _detectBlocks(data: LuxBar[]): void {
        const len = Math.max(3, Math.floor(Number(this._o.swingLen)));
        const useBody = !!this._o.useBody;
        const byClose = this._o.mitigationSource === 'Closing Price';
        const n = data.length;
        const maxArr = new Array(n);
        const minArr = new Array(n);
        for (let i = 0; i < n; i++) {
            maxArr[i] = useBody ? Math.max(data[i].close, data[i].open) : data[i].high;
            minArr[i] = useBody ? Math.min(data[i].close, data[i].open) : data[i].low;
        }

        let os = 0;
        let topY = NaN, topI = -1, topUsed = false;
        let btmY = NaN, btmI = -1, btmUsed = false;

        for (let i = len; i < n; i++) {
            let upper = -Infinity, lower = Infinity;
            for (let k = i - len + 1; k <= i; k++) {
                if (data[k].high > upper) upper = data[k].high;
                if (data[k].low < lower) lower = data[k].low;
            }
            const prevOs = os;
            if (data[i - len].high > upper) os = 0;
            else if (data[i - len].low < lower) os = 1;

            if (os === 0 && prevOs !== 0) { topY = data[i - len].high; topI = i - len; topUsed = false; }
            if (os === 1 && prevOs !== 1) { btmY = data[i - len].low; btmI = i - len; btmUsed = false; }

            if (!this._inKz[i]) continue;

            // Bullish OB: price closes above the swing high while inside a killzone
            if (!topUsed && topI >= 0 && i > 0 && data[i - 1].close > topY) {
                topUsed = true;
                let minima = minArr[i - 1], maxima = maxArr[i - 1], at = i - 1;
                for (let k = i - 1; k > topI; k--) {
                    if (minArr[k] < minima) { minima = minArr[k]; maxima = maxArr[k]; at = k; }
                }
                this._blocks.push({ top: maxima, btm: minima, startIdx: at, endIdx: n - 1, bull: true, breaker: false, breakIdx: -1, alive: true });
            }
            // Bearish OB
            if (!btmUsed && btmI >= 0 && i > 0 && data[i - 1].close < btmY) {
                btmUsed = true;
                let maxima = maxArr[i - 1], minima = minArr[i - 1], at = i - 1;
                for (let k = i - 1; k > btmI; k--) {
                    if (maxArr[k] > maxima) { maxima = maxArr[k]; minima = minArr[k]; at = k; }
                }
                this._blocks.push({ top: maxima, btm: minima, startIdx: at, endIdx: n - 1, bull: false, breaker: false, breakIdx: -1, alive: true });
            }
        }

        // Mitigation -> breaker conversion
        for (const b of this._blocks) {
            for (let j = b.startIdx + 1; j < n; j++) {
                const probe = byClose ? data[j].close : (b.bull ? data[j].low : data[j].high);
                if (b.bull && Math.min(probe, data[j].open) < b.btm) {
                    b.breaker = true; b.breakIdx = j; break;
                }
                if (!b.bull && Math.max(probe, data[j].open) > b.top) {
                    b.breaker = true; b.breakIdx = j; break;
                }
            }
            if (b.breaker) {
                b.endIdx = b.breakIdx;
                // A breaker dies once price closes back through the far side
                for (let j = b.breakIdx + 1; j < n; j++) {
                    if (b.bull && data[j].high > b.top) { b.alive = false; break; }
                    if (!b.bull && data[j].low < b.btm) { b.alive = false; break; }
                }
            }
        }
        if (this._o.removeMitigated) {
            this._blocks = this._blocks.filter((b) => b.alive);
        }
    }

    private _detectShifts(data: LuxBar[]): void {
        const len = Math.max(1, Math.floor(Number(this._o.mssLen)));
        const n = data.length;
        let ph = NaN, phI = -1, phUsed = true;
        let pl = NaN, plI = -1, plUsed = true;
        let shift = 0;

        for (let i = len; i < n - len; i++) {
            let isHigh = true, isLow = true;
            for (let k = i - len; k <= i + len; k++) {
                if (k === i) continue;
                if (data[k].high >= data[i].high) isHigh = false;
                if (data[k].low <= data[i].low) isLow = false;
            }
            const at = i + len;   // the pivot is only confirmed len bars later
            if (isHigh) { ph = data[i].high; phI = i; phUsed = false; }
            if (isLow) { pl = data[i].low; plI = i; plUsed = false; }

            if (!this._inKz[at]) { shift = 0; continue; }
            if (at < 1) continue;

            if (!phUsed && !isNaN(ph) && data[at - 1].close > ph && (shift === -1 || shift === 0)) {
                phUsed = true;
                this._shifts.push({ price: ph, fromIdx: phI, toIdx: at - 1, bull: true });
                shift = 1;
            }
            if (!plUsed && !isNaN(pl) && data[at - 1].close < pl && (shift === 1 || shift === 0)) {
                plUsed = true;
                this._shifts.push({ price: pl, fromIdx: plI, toIdx: at - 1, bull: false });
                shift = -1;
            }
        }
    }

    private _detectGaps(data: LuxBar[]): void {
        const n = data.length;
        const atr = this._atr(data, 144);
        const mult = Number(this._o.fvgThreshold);
        for (let i = 2; i < n; i++) {
            if (!this._inKz[i]) continue;
            const th = isNaN(atr[i]) ? 0 : atr[i] * mult;
            const bullGapNow = data[i].low > data[i - 1].high;
            const bullGapPrev = i >= 1 && data[i - 1].low > data[i - 2].high;
            const bearGapNow = data[i].high < data[i - 1].low;
            const bearGapPrev = i >= 1 && data[i - 1].high < data[i - 2].low;

            if ((data[i].low - data[i - 2].high) > th && data[i].low > data[i - 2].high
                && data[i - 1].close > data[i - 2].high && !(bullGapNow || bullGapPrev)) {
                this._gaps.push({ top: data[i].low, btm: data[i - 2].high, startIdx: i - 1, endIdx: n - 1, bull: true, alive: true });
            }
            if ((data[i - 2].low - data[i].high) > th && data[i].high < data[i - 2].low
                && data[i - 1].close < data[i - 2].low && !(bearGapNow || bearGapPrev)) {
                this._gaps.push({ top: data[i - 2].low, btm: data[i].high, startIdx: i - 1, endIdx: n - 1, bull: false, alive: true });
            }
        }
        for (const g of this._gaps) {
            for (let j = g.startIdx + 2; j < n; j++) {
                if (g.bull && data[j].low < g.btm) { g.endIdx = j; g.alive = false; break; }
                if (!g.bull && data[j].high > g.top) { g.endIdx = j; g.alive = false; break; }
            }
        }
        if (this._o.removeMitigatedFvg) {
            this._gaps = this._gaps.filter((g) => g.alive);
        }
    }

    getRange(): any {
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
        if (this._tfBlocked) {
            return 'Hidden above ' + this._o.maxTimeframeMin + 'm (chart is ' + this._barMinutes + 'm)';
        }
        if (index !== undefined && index >= 0 && index < this._inKz.length && this._inKz[index]) {
            for (const s of this._sessions) {
                if (index >= s.startIdx && index <= s.endIdx) return 'KZ: ' + LUX_ZONES[s.zoneIdx].name;
            }
            return 'KZ';
        }
        return 'Outside killzone';
    }

    drawOverlay(ctx: any, timeScale: any, priceScale: any, hpr: number, vpr: number): void {
        const src = (this as any)._sourceData;
        if (!src || src.length === 0) return;

        const canvasW = ctx.canvas.width;
        const X = (i: number) => timeScale.indexToCoordinate(i) * hpr;
        const Y = (p: number) => priceScale.priceToCoordinate(p) * vpr;

        if (this._tfBlocked) {
            ctx.save();
            ctx.font = 'bold ' + (12 * hpr) + 'px sans-serif';
            ctx.fillStyle = this._muted();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(
                'ICT Killzones hidden — chart is ' + this._barMinutes + 'm, limit is ' + this._o.maxTimeframeMin + 'm',
                12 * hpr, 12 * vpr,
            );
            ctx.restore();
            return;
        }

        ctx.save();
        const alpha = Math.max(0.02, Math.min(0.6, Number(this._o.bgOpacity) / 100));

        // --- Killzone boxes ---------------------------------------------------
        for (const s of this._sessions) {
            const def = LUX_ZONES[s.zoneIdx];
            if (!def || !this._o[def.showKey]) continue;
            const color = this._o[def.colorKey];
            const half = timeScale.barSpacing * hpr / 2;
            const left = X(s.startIdx) - half;
            const right = X(s.endIdx) + half;
            if (right < 0 || left > canvasW) continue;

            const yTop = Y(s.high);
            const yBtm = Y(s.low);
            ctx.fillStyle = this._rgba(color, alpha);
            ctx.fillRect(left, Math.min(yTop, yBtm), right - left, Math.abs(yBtm - yTop));

            if (this._o.showBoundLines) {
                this._line(ctx, X(s.startIdx), yTop, X(s.hiEnd), yTop, color, hpr, []);
                this._line(ctx, X(s.startIdx), yBtm, X(s.loEnd), yBtm, color, hpr, []);
            }
            if (this._o.showMeanLine) {
                const yMid = Y((s.high + s.low) / 2);
                this._line(ctx, X(s.startIdx), yMid, X(s.endIdx), yMid, color, hpr, [2 * hpr, 3 * hpr]);
            }
            if (this._o.showLabels) {
                ctx.font = 'bold ' + (11 * hpr) + 'px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                const cx = (left + right) / 2;
                const text = def.name;
                const tw = ctx.measureText(text).width;
                const plateX = cx - tw / 2 - 4 * hpr;
                const plateY = Math.min(yTop, yBtm) - 16 * vpr;
                ctx.fillStyle = this._plate();
                ctx.fillRect(plateX, plateY, tw + 8 * hpr, 15 * vpr);
                // Thin colour bar keeps the zone identifiable now the text is white
                ctx.fillStyle = this._rgba(color, 1);
                ctx.fillRect(plateX, plateY, Math.max(2, 2 * hpr), 15 * vpr);
                ctx.fillStyle = this._labelText();
                ctx.fillText(text, cx, Math.min(yTop, yBtm) - 4 * vpr);
            }
        }

        // --- Fair value gaps --------------------------------------------------
        if (this._o.showFVG) {
            for (const g of this._gaps) {
                const left = X(g.startIdx);
                const right = X(g.endIdx);
                if (right < 0 || left > canvasW) continue;
                const c = g.bull ? this._o.fvgBullColor : this._o.fvgBearColor;
                const yT = Y(g.top);
                const yB = Y(g.btm);
                ctx.fillStyle = this._rgba(c, 0.22);
                ctx.fillRect(left, Math.min(yT, yB), Math.max(2, right - left), Math.abs(yB - yT));
            }
        }

        // --- Order blocks / breaker blocks ------------------------------------
        if (this._o.showOB || this._o.showBB) {
            for (const b of this._blocks) {
                const isBreaker = b.breaker;
                if (isBreaker && !this._o.showBB) continue;
                if (!isBreaker && !this._o.showOB) continue;
                const left = X(b.startIdx);
                const right = X(b.endIdx);
                if (right < 0 || left > canvasW) continue;
                const c = isBreaker
                    ? (b.bull ? this._o.bullBBColor : this._o.bearBBColor)
                    : (b.bull ? this._o.bullOBColor : this._o.bearOBColor);
                const yT = Y(b.top);
                const yB = Y(b.btm);
                ctx.fillStyle = this._rgba(c, 0.2);
                ctx.fillRect(left, Math.min(yT, yB), Math.max(2, right - left), Math.abs(yB - yT));
                ctx.strokeStyle = this._rgba(c, 0.7);
                ctx.lineWidth = Math.max(1, hpr);
                ctx.strokeRect(left, Math.min(yT, yB), Math.max(2, right - left), Math.abs(yB - yT));
            }
        }

        // --- Market structure shifts ------------------------------------------
        if (this._o.showMSS) {
            ctx.font = 'bold ' + (9 * hpr) + 'px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            for (const sh of this._shifts) {
                const x1 = X(sh.fromIdx);
                const x2 = X(sh.toIdx);
                if (x2 < 0 || x1 > canvasW) continue;
                const y = Y(sh.price);
                const c = sh.bull ? this._o.mssBullColor : this._o.mssBearColor;
                this._line(ctx, x1, y, x2, y, c, hpr, []);
                ctx.fillStyle = this._rgba(c, 1);
                ctx.fillText('CHoCH', x1 + 3 * hpr, y - 2 * vpr);
            }
        }

        ctx.restore();
    }

    /**
     * Backing plate for on-canvas text. The chart theme arrives via the base class;
     * default to dark if an older engine build has not pushed one.
     */
    private _plate(alpha: number = 0.6): string {
        return 'rgba(0,0,0,' + alpha.toFixed(2) + ')';
    }

    private _labelText(): string {
        return '#ffffff';
    }

    /** Muted foreground that stays readable against either chart background. */
    private _muted(): string {
        return (this as any).theme !== 'light' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.5)';
    }

    private _line(ctx: any, x1: number, y1: number, x2: number, y2: number, color: string, hpr: number, dash: number[]): void {
        ctx.save();
        ctx.strokeStyle = this._rgba(color, 0.95);
        ctx.lineWidth = Math.max(1, hpr);
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
    }

    private _rgba(hex: string, alpha: number): string {
        if (typeof hex !== 'string') return 'rgba(120,120,120,' + alpha + ')';
        if (hex.startsWith('rgb')) return hex;
        const m = hex.replace('#', '');
        if (m.length !== 6) return 'rgba(120,120,120,' + alpha + ')';
        return 'rgba(' + parseInt(m.substring(0, 2), 16) + ','
            + parseInt(m.substring(2, 4), 16) + ','
            + parseInt(m.substring(4, 6), 16) + ',' + alpha + ')';
    }
}

globalThis.__draftIndicatorClass = LuxKillzonesIndicator;
