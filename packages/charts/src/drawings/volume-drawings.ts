/**
 * Hacim tabanli cizim araclari: Anchored VWAP, Fixed Range Volume Profile, Anchored Volume Profile.
 *
 * Ortak govde (VolumeToolBase): ayarlar `props` icinde tutulur ve SerializedDrawing.ext'e yazilir;
 * ana renk/kalinlik style.color / style.lineWidth'tir (attribute bar bunlari kullanir).
 * Hesaplar barlar uzerinden yapilir; barlari pane-widget / chart-widget setBarData ile verir,
 * sonuc (bar sayisi / son bar / ayar degismedikce) onbellekten gelir.
 * Hit-test geometrisi (css px) render sirasinda renderer tarafindan setHitGeometry ile yazilir.
 */

import {
    Drawing,
    DrawingPoint,
    DrawingStyle,
    DrawingState,
    DrawingType,
    DEFAULT_DRAWING_STYLE,
    generateDrawingId,
    SerializedDrawing,
} from './drawing';
import {
    DrawingSettingsProvider,
    DrawingSettingsConfig,
    AttributeBarItem,
    SettingsTab,
    createCoordinatesTab,
    createVisibilityTab,
    colorRow,
    lineWidthRow,
    checkboxRow,
    numberRow,
    selectRow,
    sliderRow,
    groupRow,
} from './drawing-settings-config';
import { DrawingAxisLabels, AxisLabelProvider } from './line-tool-common';
import {
    VolumeBar,
    BarDataConsumer,
    VwapSource,
    VWAP_SOURCES,
    AnchoredVwapResult,
    computeAnchoredVwap,
    nearestBarIndex,
    estimateTickSize,
    coerceSetting,
} from './volume-tools-common';
import { VolumeProfileResult, computeVolumeProfile, rowsForTicks } from '../indicators/volume-profile-math';

export type VolumeToolType = 'anchoredVwap' | 'fixedRangeVolumeProfile' | 'anchoredVolumeProfile';

export const VOLUME_TOOL_TYPES: ReadonlySet<string> = new Set<string>(['anchoredVwap', 'fixedRangeVolumeProfile', 'anchoredVolumeProfile']);

type Pt = { x: number; y: number };

function pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
type Rect = { x: number; y: number; w: number; h: number };

// ----------------------------------------------------------------------------
// Ortak govde
// ----------------------------------------------------------------------------

/** VolumeToolBase ayrica forecast araclari (Position Forecast, Bars Pattern, Ghost Feed) icin ortak govdedir. */
export abstract class VolumeToolBase implements Drawing, DrawingSettingsProvider, BarDataConsumer {
    readonly id: string;
    readonly type: DrawingType;

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;
    paneId?: string | null;
    intervalsVisibilities?: import('./intervals-visibility').IntervalsVisibilities;

    props: Record<string, any>;

    protected _bars: ReadonlyArray<VolumeBar> = [];
    protected _cacheKey = '';
    private _handles: Pt[] = [];
    private _hitRects: Rect[] = [];
    private _hitLines: Pt[][] = [];

    protected constructor(type: DrawingType, color: string, defaults: Record<string, any>) {
        this.id = generateDrawingId();
        this.type = type;
        this.style = { ...DEFAULT_DRAWING_STYLE, color, lineWidth: 1 };
        this.props = { ...defaults };
    }

    protected abstract get _defaults(): Record<string, any>;
    protected abstract get _limits(): Record<string, [number, number]>;
    abstract get requiredPoints(): number;
    abstract getSettingsConfig(): DrawingSettingsConfig;

    get bars(): ReadonlyArray<VolumeBar> { return this._bars; }

    setBarData(bars: ReadonlyArray<any>): void {
        this._bars = bars as ReadonlyArray<VolumeBar>;
    }

    /** Hesap onbellek anahtarinin bar kismi: bar sayisi, ilk/son bar zamani, son barin kapanis ve hacmi. */
    protected _barsKey(): string {
        const n = this._bars.length;
        if (n === 0) return '0';
        const first = this._bars[0];
        const last = this._bars[n - 1];
        return `${n}|${first.time}|${last.time}|${last.close ?? last.value}|${last.high}|${last.low}|${last.volume}`;
    }

    // ---- Nokta yonetimi ----

    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
        if (this.points.length >= this.requiredPoints) this.state = 'complete';
    }

    isComplete(): boolean {
        return this.points.length >= this.requiredPoints;
    }

    updateLastPoint(time: number, price: number): void {
        if (this.points.length === 0) return;
        if (this.requiredPoints === 2 && this.points.length === 1) {
            this.points.push({ time, price });
        } else {
            this.points[this.points.length - 1] = { time, price };
        }
    }

    // ---- Renderer'in yazdigi onbellek ----

    /** Surukleme tutamaclari (css px) */
    setHandles(points: Pt[]): void { this._handles = points; }
    getPixelPoints(): Pt[] { return this._handles; }
    /** Hit-test geometrisi (css px): dolu dikdortgenler ve cizgiler */
    setHitGeometry(rects: Rect[], lines: Pt[][]): void { this._hitRects = rects; this._hitLines = lines; }
    clearGeometry(): void { this._handles = []; this._hitRects = []; this._hitLines = []; }

    hitTest(x: number, y: number, threshold: number = 6): boolean {
        for (const r of this._hitRects) {
            if (x >= r.x - 1 && x <= r.x + r.w + 1 && y >= r.y - 1 && y <= r.y + r.h + 1) return true;
        }
        for (const line of this._hitLines) {
            for (let i = 1; i < line.length; i++) {
                if (pointToSegmentDistance(x, y, line[i - 1].x, line[i - 1].y, line[i].x, line[i].y) <= threshold) return true;
            }
        }
        return false;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const add = (px: number, py: number) => {
            minX = Math.min(minX, px); maxX = Math.max(maxX, px);
            minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        };
        for (const r of this._hitRects) { add(r.x, r.y); add(r.x + r.w, r.y + r.h); }
        for (const line of this._hitLines) for (const p of line) add(p.x, p.y);
        if (!Number.isFinite(minX)) return null;
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    // ---- Ayarlar ----

    protected _onSet(_key: string, _value: any): void { /* alt siniflar override eder */ }

    getSettingValue(key: string): any {
        switch (key) {
            case 'color': return this.style.color;
            case 'lineWidth': return this.style.lineWidth;
            case 'visible': return this.visible;
            default: return this.props[key];
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'color':
                this.style.color = String(value);
                this._onSet(key, this.style.color);
                return;
            case 'lineWidth': {
                const n = Number(value);
                if (Number.isFinite(n) && n > 0) this.style.lineWidth = Math.min(10, n);
                return;
            }
            case 'visible':
                this.visible = !!value;
                return;
        }
        if (!(key in this._defaults)) return;
        this.props[key] = coerceSetting(this._defaults[key], value, this._limits[key]);
        this._onSet(key, this.props[key]);
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Color' },
            { type: 'lineWidth', key: 'lineWidth', tooltip: 'Line width' },
        ];
    }

    protected _tabs(inputs: SettingsTab, style: SettingsTab): DrawingSettingsConfig {
        return { tabs: [inputs, style, createCoordinatesTab([]), createVisibilityTab()] };
    }

    // ---- Serilestirme ----

    toJSON(): SerializedDrawing {
        return {
            id: this.id,
            type: this.type,
            points: this.points.map((p) => ({ ...p })),
            style: { ...this.style },
            state: this.state === 'selected' ? 'complete' : this.state,
            visible: this.visible,
            locked: this.locked,
            ext: { ...this.props },
        };
    }

    protected _restore(data: SerializedDrawing): void {
        Object.defineProperty(this, 'id', { value: data.id, writable: false });
        this.points = (data.points ?? []).map((p) => ({ ...p }));
        this.style = { ...this.style, ...data.style };
        this.state = data.state as DrawingState;
        this.visible = data.visible;
        this.locked = data.locked;
        const ext = data.ext ?? {};
        for (const key of Object.keys(this._defaults)) {
            if (key in ext) this.props[key] = coerceSetting(this._defaults[key], ext[key], this._limits[key]);
        }
    }
}

// ----------------------------------------------------------------------------
// Anchored VWAP
// ----------------------------------------------------------------------------

const VWAP_DEFAULTS = {
    source: 'hlc3' as VwapSource,
    band1Enabled: false, band1Mult: 1, band1Color: '#4CAF50',
    band2Enabled: false, band2Mult: 2, band2Color: '#FF9800',
    band3Enabled: false, band3Mult: 3, band3Color: '#E91E63',
    bandLineWidth: 1,
    fillBands: false,
    fillTransparency: 90,
    showPriceLabel: true,
};

const VWAP_LIMITS: Record<string, [number, number]> = {
    band1Mult: [0.1, 20], band2Mult: [0.1, 20], band3Mult: [0.1, 20],
    bandLineWidth: [1, 10], fillTransparency: [0, 100],
};

export interface AnchoredVwapComputed {
    anchorIndex: number;
    result: AnchoredVwapResult;
}

export class AnchoredVwapDrawing extends VolumeToolBase implements AxisLabelProvider {
    private _computed: AnchoredVwapComputed | null = null;

    constructor() {
        super('anchoredVwap', '#1E88E5', VWAP_DEFAULTS);
    }

    protected get _defaults() { return VWAP_DEFAULTS; }
    protected get _limits() { return VWAP_LIMITS; }
    get requiredPoints(): number { return 1; }

    /** Capa barindan son bara VWAP; capa bulunamazsa ya da hacim 0 ise null. */
    getComputed(): AnchoredVwapComputed | null {
        if (this.points.length < 1) return null;
        const key = `${this._barsKey()}|${this.points[0].time}|${this.props.source}`;
        if (key === this._cacheKey) return this._computed;
        this._cacheKey = key;
        this._computed = null;
        // Capa son bardan sonraysa (gelecek) null -> cizim yok (TradingView gibi); ilk bardan oncesi bar 0'a yapisir.
        const idx = nearestBarIndex(this._bars, this.points[0].time);
        if (idx !== null) {
            const result = computeAnchoredVwap(this._bars, idx, this.props.source as VwapSource);
            if (result) this._computed = { anchorIndex: idx, result };
        }
        return this._computed;
    }

    /** Etkin bantlar: [carpan, renk] */
    enabledBands(): { mult: number; color: string }[] {
        const out: { mult: number; color: string }[] = [];
        for (const n of [1, 2, 3]) {
            if (this.props[`band${n}Enabled`]) out.push({ mult: this.props[`band${n}Mult`], color: this.props[`band${n}Color`] });
        }
        return out;
    }

    getAxisLabels(): DrawingAxisLabels {
        const c = this.props.showPriceLabel ? this.getComputed() : null;
        if (!c) return { prices: [], times: [] };
        const v = c.result.vwap[c.result.vwap.length - 1];
        return Number.isFinite(v) ? { prices: [{ price: v, color: this.style.color }], times: [] } : { prices: [], times: [] };
    }

    getSettingsConfig(): DrawingSettingsConfig {
        const bandInput = (n: number) => groupRow([
            checkboxRow(`band${n}Enabled`, ''),
            numberRow(`band${n}Mult`, '', { min: 0.1, max: 20, step: 0.1 }),
        ], `Bands multiplier #${n}`);
        return this._tabs(
            {
                id: 'inputs', label: 'Inputs',
                sections: [
                    { rows: [selectRow('source', 'Source', VWAP_SOURCES)] },
                    { title: 'Bands (standard deviation)', rows: [bandInput(1), bandInput(2), bandInput(3)] },
                ],
            },
            {
                id: 'style', label: 'Style',
                sections: [
                    { title: 'VWAP', rows: [colorRow('color', 'Color'), lineWidthRow('lineWidth', 'Line width'), checkboxRow('showPriceLabel', 'Price label')] },
                    {
                        title: 'Bands',
                        rows: [
                            colorRow('band1Color', 'Band #1 color'),
                            colorRow('band2Color', 'Band #2 color'),
                            colorRow('band3Color', 'Band #3 color'),
                            sliderRow('bandLineWidth', 'Band line width', 1, 5, 'px'),
                            checkboxRow('fillBands', 'Background'),
                            sliderRow('fillTransparency', 'Background transparency', 0, 100, '%'),
                        ],
                    },
                ],
            }
        );
    }

    static fromJSON(data: SerializedDrawing): AnchoredVwapDrawing {
        const d = new AnchoredVwapDrawing();
        d._restore(data);
        return d;
    }
}

// ----------------------------------------------------------------------------
// Fixed Range / Anchored Volume Profile
// ----------------------------------------------------------------------------

const PROFILE_DEFAULTS = {
    rowsLayout: 'rows' as 'rows' | 'ticks',
    rows: 24,
    ticksPerRow: 1,
    valueAreaPercent: 70,
    upColor: '#1E88E5', upTransparency: 30,
    downColor: '#FB8C00', downTransparency: 30,
    vaUpColor: '#1E88E5', vaUpTransparency: 0,
    vaDownColor: '#FB8C00', vaDownTransparency: 0,
    showPoc: true, pocColor: '#FF0000',
    showVaLines: false, vaLineColor: '#2962FF',
    placement: 'left' as 'left' | 'right',
    widthPercent: 30,
    showTotals: false,
};

const PROFILE_LIMITS: Record<string, [number, number]> = {
    rows: [1, 1000], ticksPerRow: [1, 100000], valueAreaPercent: [1, 100],
    upTransparency: [0, 100], downTransparency: [0, 100], vaUpTransparency: [0, 100], vaDownTransparency: [0, 100],
    widthPercent: [1, 100],
};

export interface VolumeProfileComputed {
    startIndex: number;
    endIndex: number;
    profile: VolumeProfileResult;
}

export class VolumeProfileDrawing extends VolumeToolBase {
    private _computed: VolumeProfileComputed | null = null;

    constructor(type: 'fixedRangeVolumeProfile' | 'anchoredVolumeProfile' = 'fixedRangeVolumeProfile') {
        super(type, PROFILE_DEFAULTS.upColor, PROFILE_DEFAULTS);
    }

    protected get _defaults() { return PROFILE_DEFAULTS; }
    protected get _limits() { return PROFILE_LIMITS; }
    get requiredPoints(): number { return this.type === 'fixedRangeVolumeProfile' ? 2 : 1; }

    /** Ana renk = yukari hacim rengi */
    protected _onSet(key: string, value: any): void {
        if (key === 'color') this.props.upColor = value;
        else if (key === 'upColor') this.style.color = value;
    }

    private _barIndex(time: number): number | null {
        // Gelecekteki capa -> null (cizim yok); ilk bardan onceki capa bar 0'a yapisir.
        return nearestBarIndex(this._bars, time);
    }

    /** Bar araligi ve profil; aralik/hacim gecersizse null. */
    getComputed(): VolumeProfileComputed | null {
        if (this.points.length < 1) return null;
        const p = this.props;
        const key = [this._barsKey(), this.points.map((pt) => pt.time).join(','), p.rowsLayout, p.rows, p.ticksPerRow, p.valueAreaPercent].join('|');
        if (key === this._cacheKey) return this._computed;
        this._cacheKey = key;
        this._computed = null;

        const n = this._bars.length;
        let a = this._barIndex(this.points[0].time);
        let b = this.type === 'anchoredVolumeProfile' ? n - 1 : (this.points.length >= 2 ? this._barIndex(this.points[1].time) : a);
        if (a === null || b === null) return null;
        if (a > b) [a, b] = [b, a];

        const tick = p.rowsLayout === 'ticks' ? estimateTickSize(this._bars) : 0;
        const rows = p.rowsLayout === 'ticks'
            ? (lo: number, hi: number) => rowsForTicks(lo, hi, tick, p.ticksPerRow)
            : p.rows;
        const profile = computeVolumeProfile(this._bars as any, a, b, rows, p.valueAreaPercent / 100);
        if (profile && profile.totalVolume > 0) this._computed = { startIndex: a, endIndex: b, profile };
        return this._computed;
    }

    getSettingsConfig(): DrawingSettingsConfig {
        const hue = (colorKey: string, trKey: string, label: string) => [
            colorRow(colorKey, `${label} color`),
            sliderRow(trKey, `${label} transparency`, 0, 100, '%'),
        ];
        return this._tabs(
            {
                id: 'inputs', label: 'Inputs',
                sections: [{
                    rows: [
                        selectRow('rowsLayout', 'Rows layout', [
                            { value: 'rows', label: 'Number of rows' },
                            { value: 'ticks', label: 'Ticks per row' },
                        ]),
                        numberRow('rows', 'Number of rows', { min: 1, max: 1000, step: 1 }),
                        numberRow('ticksPerRow', 'Ticks per row', { min: 1, max: 100000, step: 1 }),
                        numberRow('valueAreaPercent', 'Value area volume (%)', { min: 1, max: 100, step: 1 }),
                    ],
                }],
            },
            {
                id: 'style', label: 'Style',
                sections: [
                    {
                        title: 'Volume',
                        rows: [
                            ...hue('upColor', 'upTransparency', 'Up volume'),
                            ...hue('downColor', 'downTransparency', 'Down volume'),
                            ...hue('vaUpColor', 'vaUpTransparency', 'Value area up'),
                            ...hue('vaDownColor', 'vaDownTransparency', 'Value area down'),
                        ],
                    },
                    {
                        title: 'Lines',
                        rows: [
                            checkboxRow('showPoc', 'POC'),
                            colorRow('pocColor', 'POC color'),
                            checkboxRow('showVaLines', 'Value area high / low'),
                            colorRow('vaLineColor', 'Value area line color'),
                            lineWidthRow('lineWidth', 'Line width'),
                        ],
                    },
                    {
                        title: 'Placement',
                        rows: [
                            selectRow('placement', 'Placement', [
                                { value: 'left', label: 'Left' },
                                { value: 'right', label: 'Right' },
                            ]),
                            sliderRow('widthPercent', 'Width (% of range)', 1, 100, '%'),
                            checkboxRow('showTotals', 'Totals'),
                        ],
                    },
                ],
            }
        );
    }

    static fromJSON(data: SerializedDrawing): VolumeProfileDrawing {
        const d = new VolumeProfileDrawing(data.type === 'anchoredVolumeProfile' ? 'anchoredVolumeProfile' : 'fixedRangeVolumeProfile');
        d._restore(data);
        // upColor ile style.color senkron kalsin
        d.style.color = d.props.upColor;
        return d;
    }
}
