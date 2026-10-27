/**
 * Long / Short Position ortak mantigi (TradingView uyumlu).
 *
 * - PositionProps: stil + girdi + bilgi blogu ayarlari (varsayilanlar TradingView'dekiler)
 * - computePositionCalc: miktar / tutar / R:R hesabi (saf fonksiyon, test edilebilir)
 * - buildPositionBlocks: TP / merkez / SL bilgi bloklarinin metin satirlari
 * - PositionDrawingBase: Long ve Short'un ortak govdesi (long yukari hedef, short asagi hedef)
 *
 * HESAPLAMALAR (long gosterilir; short ayni formuller, yalnizca yon ve P&L isareti ters):
 *   riskAmount  = percentage modunda accountSize * risk / 100; money modunda risk
 *   stopDist    = |entry - stop|            targetDist = |target - entry|
 *   qty         = riskAmount / (stopDist * lotSize), qtyPrecision'a yuvarlanir.
 *                 HER ZAMAN ASAGI yuvarlanir (qty * stopDist * lot <= riskAmount; risk asilmaz).
 *                 'default': 4 anlamli basamaga asagi (>= 1000 ise tam sayi, en cok 8 ondalik).
 *                 Acik precision p: floor(raw * 10^p) / 10^p. Sonuc 0 ise merkezde "0 (min)" ipucu.
 *                 stopDist = 0 ise qty = 0 ve metinde "—" gosterilir.
 *   TP blogu    : Hedef mesafe, mesafe/entry*100 (%), mesafe/tick (tick), Tutar = qty * targetDist * lotSize
 *                 tpPL = +Tutar (kazanc)
 *   SL blogu    : ayni, stop ile; Tutar = fiili risk; slPL = -Tutar (kayip)
 *   Merkez blogu: Open P&L = (sonKapanis - entry) * qty * lotSize (short icin isaret ters),
 *                 Qty, Risk/Reward = targetDist / stopDist
 *   Open P&L son kapanis: giris zamanindan (sol kenar) sonra/o anda olan son barin kapanisi;
 *                 giris gelecekteyse (son bar giristen once) 0.
 *   tick        = resolvePipSize(symbol, precision) / 10 (pip = 10 tick), fiyat hassasiyetinde.
 *   leverage    = yalnizca saklanir (marj gosterilmez).
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
    SettingsSection,
    colorRow,
    lineWidthRow,
    checkboxRow,
    numberRow,
    selectRow,
    textRow,
    groupRow,
    createCoordinatesTab,
    createVisibilityTab,
} from './drawing-settings-config';
import { DrawingAxisLabels, AxisLabelProvider, resolvePipSize } from './line-tool-common';
import { parseColor, colorToHex } from './shape-common';
import { t } from '../helpers/translations';

// ----------------------------------------------------------------------------
// Ayarlar
// ----------------------------------------------------------------------------

export const INFO_BLOCK_KEYS = [
    'tpPriceOffset', 'tpPercentOffset', 'tpTickOffset', 'tpAmount', 'tpPL',
    'openClosePL', 'qty', 'riskRewardRatio',
    'slPriceOffset', 'slPercentOffset', 'slTickOffset', 'slAmount', 'slPL',
] as const;
export type InfoBlockKey = typeof INFO_BLOCK_KEYS[number];

export type RiskDisplayMode = 'percentage' | 'money';
export type QtyPrecision = 'default' | number;

export interface PositionProps {
    linecolor: string;
    linewidth: number;
    textcolor: string;
    fontsize: number;
    stopBackground: string;
    /** 0-100 (80 = %20 opak) */
    stopBackgroundTransparency: number;
    profitBackground: string;
    profitBackgroundTransparency: number;
    compact: boolean;
    riskDisplayMode: RiskDisplayMode;
    accountSize: number;
    lotSize: number;
    risk: number;
    leverage: number;
    qtyPrecision: QtyPrecision;
    currency: string;
    alwaysShowStats: boolean;
    showPriceLabels: boolean;
    infoBlocks: Record<InfoBlockKey, boolean>;
}

export const DEFAULT_INFO_BLOCKS: Readonly<Record<InfoBlockKey, boolean>> = {
    tpPriceOffset: true, tpPercentOffset: true, tpTickOffset: true, tpAmount: true, tpPL: false,
    openClosePL: true, qty: true, riskRewardRatio: true,
    slPriceOffset: true, slPercentOffset: true, slTickOffset: true, slAmount: true, slPL: false,
};

export const DEFAULT_POSITION_PROPS: Readonly<PositionProps> = {
    linecolor: '#808080',
    linewidth: 1,
    textcolor: '#FFFFFF',
    fontsize: 12,
    stopBackground: '#F23645',
    stopBackgroundTransparency: 80,
    profitBackground: '#089981',
    profitBackgroundTransparency: 80,
    compact: false,
    riskDisplayMode: 'percentage',
    accountSize: 1000,
    lotSize: 1,
    risk: 25,
    leverage: 10000,
    qtyPrecision: 'default',
    currency: 'NONE',
    alwaysShowStats: false,
    showPriceLabels: true,
    infoBlocks: { ...DEFAULT_INFO_BLOCKS },
};

export function createPositionProps(): PositionProps {
    return { ...DEFAULT_POSITION_PROPS, infoBlocks: { ...DEFAULT_INFO_BLOCKS } };
}

const clampNum = (v: any, min: number, max: number, fallback: number): number => {
    if (v === null || v === undefined || typeof v === 'boolean') return fallback;
    if (typeof v === 'string' && v.trim() === '') return fallback;
    const n = Number(v);
    return isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

/** Kaydedilmis (kismi/bozuk olabilir) degerleri varsayilanlarin uzerine guvenle uygular. */
export function deserializePositionProps(saved: Record<string, any> | undefined): PositionProps {
    const p = createPositionProps();
    if (!saved || typeof saved !== 'object') return p;
    for (const key of Object.keys(DEFAULT_POSITION_PROPS) as (keyof PositionProps)[]) {
        if (key === 'infoBlocks' || saved[key] === undefined) continue;
        applyPositionProp(p, key, saved[key]);
    }
    if (saved.infoBlocks && typeof saved.infoBlocks === 'object') {
        for (const k of INFO_BLOCK_KEYS) {
            if (typeof saved.infoBlocks[k] === 'boolean') p.infoBlocks[k] = saved.infoBlocks[k];
        }
    }
    return p;
}

export function serializePositionProps(p: PositionProps): Record<string, any> {
    return { ...p, infoBlocks: { ...p.infoBlocks } };
}

/** Tek bir ayari dogrulayarak yazar; taninirsa true. */
function applyPositionProp(p: PositionProps, key: string, value: any): boolean {
    switch (key) {
        case 'linecolor': case 'textcolor': case 'stopBackground': case 'profitBackground': {
            // Renk secici alfali deger verebilir; seffaflik ayri kaydirgac, yalnizca #rrggbb saklanir
            const hex = typeof value !== 'string' ? null : /^#[0-9a-f]{6}$/i.test(value) ? value : colorToHex(value);
            if (!hex) return true;
            (p as any)[key] = hex;
            return true;
        }
        case 'linewidth': p.linewidth = clampNum(value, 1, 10, 1); return true;
        case 'fontsize': p.fontsize = clampNum(value, 6, 72, 12); return true;
        case 'stopBackgroundTransparency': case 'profitBackgroundTransparency':
            (p as any)[key] = clampNum(value, 0, 100, 80); return true;
        case 'compact': case 'alwaysShowStats': case 'showPriceLabels':
            (p as any)[key] = !!value; return true;
        case 'riskDisplayMode': p.riskDisplayMode = value === 'money' ? 'money' : 'percentage'; return true;
        case 'accountSize': p.accountSize = clampNum(value, 0, 1e15, 1000); return true;
        case 'lotSize': p.lotSize = clampNum(value, 1e-9, 1e12, 1); return true;
        case 'risk': p.risk = clampNum(value, 0, 1e15, 25); return true;
        case 'leverage': p.leverage = clampNum(value, 1, 1e9, 10000); return true;
        case 'qtyPrecision': {
            if (value === 'default' || value === undefined || value === null || value === '') p.qtyPrecision = 'default';
            else p.qtyPrecision = Math.round(clampNum(value, 0, 8, 0));
            return true;
        }
        case 'currency': p.currency = String(value ?? '').trim().slice(0, 8) || 'NONE'; return true;
    }
    if ((INFO_BLOCK_KEYS as readonly string[]).includes(key)) {
        p.infoBlocks[key as InfoBlockKey] = !!value;
        return true;
    }
    return false;
}

// ----------------------------------------------------------------------------
// Hesaplama
// ----------------------------------------------------------------------------

export interface PositionCalcInput {
    isLong: boolean;
    entry: number;
    stop: number;
    target: number;
    accountSize: number;
    lotSize: number;
    risk: number;
    riskDisplayMode: RiskDisplayMode;
    qtyPrecision: QtyPrecision;
    /** Giris zamanindan sonra/o anda olan son barin kapanisi; yoksa/gelecekteyse null */
    lastClose: number | null;
    tickSize: number;
}

export interface PositionCalc {
    riskAmount: number;
    stopDist: number;
    targetDist: number;
    /** stopDist = 0 ise false (qty 0) */
    valid: boolean;
    qty: number;
    tpAmount: number;
    slAmount: number;
    openPL: number;
    /** valid degilse 0 */
    riskReward: number;
    targetPct: number;
    stopPct: number;
    targetTicks: number;
    stopTicks: number;
    /** Ham miktar > 0 ama qtyPrecision'a asagi yuvarlayinca 0 kaldi */
    belowMin: boolean;
}

const QTY_EPS = 1 + 1e-12; // float artefaktlarina karsi (0.29 / 0.01 gibi)

/** Miktari qtyPrecision'a ASAGI yuvarlar (bkz. dosya basi aciklamasi); riski asmaz. */
export function roundQty(raw: number, precision: QtyPrecision): number {
    if (!isFinite(raw) || raw <= 0) return 0;
    if (precision === 'default') {
        if (raw >= 1000) return Math.floor(raw * QTY_EPS);
        const e = Math.floor(Math.log10(raw));
        const dec = Math.min(8, Math.max(0, 3 - e));
        const step = Math.max(Math.pow(10, e - 3), 1e-8);
        // toFixed: k * step float artefaktini temizler (0.01234 gibi)
        return Number((Math.floor(raw / step * QTY_EPS) * step).toFixed(dec));
    }
    const f = Math.pow(10, precision);
    return Math.floor(raw * f * QTY_EPS) / f;
}

export function computePositionCalc(i: PositionCalcInput): PositionCalc {
    const riskAmount = i.riskDisplayMode === 'money' ? i.risk : i.accountSize * i.risk / 100;
    const stopDist = Math.abs(i.entry - i.stop);
    const targetDist = Math.abs(i.target - i.entry);
    const valid = stopDist > 0 && i.lotSize > 0;
    const raw = valid ? riskAmount / (stopDist * i.lotSize) : 0;
    const qty = valid ? roundQty(raw, i.qtyPrecision) : 0;
    const dir = i.isLong ? 1 : -1;
    const openPL = i.lastClose === null ? 0 : (i.lastClose - i.entry) * qty * i.lotSize * dir;
    const tick = i.tickSize > 0 ? i.tickSize : 0;
    return {
        riskAmount, stopDist, targetDist, valid, qty,
        tpAmount: qty * targetDist * i.lotSize,
        slAmount: qty * stopDist * i.lotSize,
        openPL,
        riskReward: valid ? targetDist / stopDist : 0,
        targetPct: i.entry !== 0 ? targetDist / i.entry * 100 : 0,
        stopPct: i.entry !== 0 ? stopDist / i.entry * 100 : 0,
        targetTicks: tick ? targetDist / tick : 0,
        stopTicks: tick ? stopDist / tick : 0,
        belowMin: valid && qty === 0 && raw > 0,
    };
}

/** Giris zamanindan sonra/o anda olan son barin kapanisi; veri yoksa ya da giris gelecekteyse null. */
export function pickLastClose(data: readonly any[], entryTime: number): number | null {
    if (!data || data.length === 0) return null;
    const last = data[data.length - 1];
    if (!last || !(Number(last.time) >= entryTime)) return null;
    const c = Number(last.close ?? last.value);
    return isFinite(c) ? c : null;
}

// ----------------------------------------------------------------------------
// Bilgi bloklari (metin)
// ----------------------------------------------------------------------------

export interface PositionFormat {
    /** Fiyat ondalik basamak sayisi */
    pricePrecision: number;
}

export interface PositionBlocks { tp: string[]; center: string[]; sl: string[]; }

const DASH = '—';

export function fmt(v: number, minDec: number, maxDec: number = minDec): string {
    return v.toLocaleString('en-US', { minimumFractionDigits: minDec, maximumFractionDigits: maxDec });
}

export function fmtSigned(v: number, dec: number): string {
    const s = fmt(Math.abs(v), dec);
    if (Number(Math.abs(v).toFixed(dec)) === 0) return s;
    return (v > 0 ? '+' : '-') + s;
}

export function formatQty(qty: number, precision: QtyPrecision): string {
    return precision === 'default' ? fmt(qty, 0, 12) : fmt(qty, precision);
}

/** TP / merkez / SL bloklarinin satirlari; bilgi bloklari ve compact moduna gore. */
export function buildPositionBlocks(p: PositionProps, c: PositionCalc, f: PositionFormat): PositionBlocks {
    const cur = p.currency && p.currency !== 'NONE' ? ` ${p.currency}` : '';
    const money = (v: number) => `${fmt(v, 2)}${cur}`;
    const sgnMoney = (v: number) => `${fmtSigned(v, 2)}${cur}`;
    const price = (v: number) => fmt(v, f.pricePrecision);
    const ib = p.infoBlocks;
    const compact = p.compact;

    const side = (
        label: string, dist: number, pct: number, ticks: number, amount: number, pl: number,
        showPrice: boolean, showPct: boolean, showTick: boolean, showAmount: boolean, showPL: boolean
    ): string[] => {
        const head: string[] = [];
        if (showPrice) head.push(compact ? price(dist) : `${t(label)}: ${price(dist)}`);
        if (showPct) head.push(`(${fmt(pct, 2)}%)`);
        if (showTick) head.push(compact ? fmt(ticks, 0) : `${fmt(ticks, 0)} ${t('ticks')}`);
        let line = head.join(' ');
        if (showAmount) {
            const a = compact ? money(amount) : `${t('Amount')}: ${money(amount)}`;
            line = line ? `${line}, ${a}` : a;
        }
        const out: string[] = [];
        if (line) out.push(line);
        // Compact: daha az satir -> P&L satiri gosterilmez
        if (showPL && !compact) out.push(`${t('P&L')}: ${sgnMoney(pl)}`);
        return out;
    };

    const tp = side('Target', c.targetDist, c.targetPct, c.targetTicks, c.tpAmount, c.tpAmount,
        ib.tpPriceOffset, ib.tpPercentOffset, ib.tpTickOffset, ib.tpAmount, ib.tpPL);
    const sl = side('Stop', c.stopDist, c.stopPct, c.stopTicks, c.slAmount, -c.slAmount,
        ib.slPriceOffset, ib.slPercentOffset, ib.slTickOffset, ib.slAmount, ib.slPL);

    const qtyText = c.valid ? formatQty(c.qty, p.qtyPrecision) + (c.belowMin ? ` ${t('(min)')}` : '') : DASH;
    const rrText = c.valid ? fmt(c.riskReward, 2) : DASH;
    const center: string[] = [];
    if (compact) {
        // Compact: tek satir, kisa etiketler
        const parts: string[] = [];
        if (ib.openClosePL) parts.push(`${t('P&L')} ${sgnMoney(c.openPL)}`);
        if (ib.qty) parts.push(`${t('Qty')} ${qtyText}`);
        if (ib.riskRewardRatio) parts.push(`${t('R/R')} ${rrText}`);
        if (parts.length) center.push(parts.join(' · '));
    } else {
        if (ib.openClosePL) center.push(`${t('Open P&L')}: ${sgnMoney(c.openPL)}`);
        if (ib.qty) center.push(`${t('Qty')}: ${qtyText}`);
        if (ib.riskRewardRatio) center.push(`${t('Risk/Reward Ratio')}: ${rrText}`);
    }
    return { tp, center, sl };
}

// ----------------------------------------------------------------------------
// Ayar modali yapilandirmasi
// ----------------------------------------------------------------------------

function infoRows(keys: [InfoBlockKey, string][]) {
    return keys.map(([k, label]) => checkboxRow(k, label, DEFAULT_INFO_BLOCKS[k]));
}

export function positionSettingsConfig(): DrawingSettingsConfig {
    const transp = (key: string) =>
        ({ type: 'slider', key, label: 'Transparency', min: 0, max: 100, step: 1, unit: '%', suffix: '%' } as any);
    const qtyOptions = [{ value: 'default', label: t('Default') },
        ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ value: String(n), label: String(n) }))];
    const inputs: SettingsSection[] = [{
        rows: [
            numberRow('accountSize', 'Account size', { min: 0, max: 1e15, step: 100, wide: true }),
            numberRow('lotSize', 'Lot size', { min: 0.000001, max: 1e12, step: 0.01 }),
            groupRow([
                numberRow('risk', 'Risk', { min: 0, max: 1e15, step: 0.5 }),
                selectRow('riskDisplayMode', 'Risk display mode', [
                    { value: 'percentage', label: t('Percentage') },
                    { value: 'money', label: t('Money') },
                ]),
            ], 'Risk'),
            numberRow('leverage', 'Leverage', { min: 1, max: 1e9, step: 1, wide: true }),
            selectRow('qtyPrecision', 'Qty precision', qtyOptions),
            textRow('currency', 'Currency', 'NONE'),
        ],
    }];
    const style: SettingsSection[] = [
        {
            title: 'Line',
            rows: [
                colorRow('linecolor', 'Line color'),
                lineWidthRow('linewidth', 'Line width'),
            ],
        },
        {
            title: 'Background',
            rows: [
                groupRow([colorRow('stopBackground', 'Stop color'), transp('stopBackgroundTransparency')], 'Stop'),
                groupRow([colorRow('profitBackground', 'Profit color'), transp('profitBackgroundTransparency')], 'Profit'),
            ],
        },
        {
            title: 'Text',
            rows: [
                colorRow('textcolor', 'Text color'),
                numberRow('fontsize', 'Font size', { min: 6, max: 72, step: 1 }),
                checkboxRow('compact', 'Compact', false),
                checkboxRow('alwaysShowStats', 'Always show stats', false),
                checkboxRow('showPriceLabels', 'Price labels', true),
            ],
        },
    ];
    const info: SettingsSection[] = [
        {
            title: 'Take profit',
            rows: infoRows([
                ['tpPriceOffset', 'Price offset'], ['tpPercentOffset', 'Percent offset'],
                ['tpTickOffset', 'Tick offset'], ['tpAmount', 'Amount'], ['tpPL', 'P&L'],
            ]),
        },
        {
            title: 'Center',
            rows: infoRows([
                ['openClosePL', 'Open P&L'], ['qty', 'Qty'], ['riskRewardRatio', 'Risk/Reward Ratio'],
            ]),
        },
        {
            title: 'Stop loss',
            rows: infoRows([
                ['slPriceOffset', 'Price offset'], ['slPercentOffset', 'Percent offset'],
                ['slTickOffset', 'Tick offset'], ['slAmount', 'Amount'], ['slPL', 'P&L'],
            ]),
        },
    ];
    return {
        initialTab: 'inputs',
        tabs: [
            { id: 'inputs', label: 'Inputs', sections: inputs },
            { id: 'style', label: 'Style', sections: style },
            { id: 'infoBlocks', label: 'Info blocks', sections: info },
            createCoordinatesTab([]),
            createVisibilityTab(),
        ],
    };
}

// ----------------------------------------------------------------------------
// Ortak cizim govdesi
// ----------------------------------------------------------------------------

/** calc() icin tick baglami: sembol + fiyat hassasiyeti (tick = pip / 10) */
export interface PositionTickContext { symbol?: string; precision: number; }

export interface PositionOptions {
    profitPercent?: number;  // varsayilan 3
    stopPercent?: number;    // varsayilan 1.5
}

export abstract class PositionDrawingBase implements Drawing, DrawingSettingsProvider, AxisLabelProvider {
    readonly id: string;
    abstract readonly type: DrawingType;

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;
    paneId?: string | null;

    props: PositionProps = createPositionProps();
    profitPercent: number = 3;
    stopPercent: number = 1.5;

    protected _pixelPoints: { x: number; y: number }[] = [];
    protected _cachedTargetY: number = 0;
    protected _cachedStopY: number = 0;

    constructor(readonly isLong: boolean, options: PositionOptions = {}) {
        this.id = generateDrawingId();
        this.style = { ...DEFAULT_DRAWING_STYLE };
        this._syncStyle();
        if (options.profitPercent) this.profitPercent = options.profitPercent;
        if (options.stopPercent) this.stopPercent = options.stopPercent;
    }

    /** Ortak stil alanlarini props ile esle (nitelik cubugu / klonlama gibi style okuyanlar icin). */
    protected _syncStyle(): void {
        this.style.color = this.props.linecolor;
        this.style.lineWidth = this.props.linewidth;
        this.style.textColor = this.props.textcolor;
        this.style.fontSize = this.props.fontsize;
    }

    // ---- DrawingSettingsProvider ----

    getSettingsConfig(): DrawingSettingsConfig {
        return positionSettingsConfig();
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'profitBackground', tooltip: 'Profit color' },
            { type: 'color', key: 'stopBackground', tooltip: 'Stop color' },
            { type: 'color', key: 'linecolor', tooltip: 'Line color' },
            { type: 'lineWidth', key: 'linewidth', tooltip: 'Line width' },
        ];
    }

    getSettingValue(key: string): any {
        if (key === 'visible') return this.visible;
        if (key === 'qtyPrecision') return String(this.props.qtyPrecision);
        if (key === 'currency') return this.props.currency === 'NONE' ? '' : this.props.currency;
        if ((INFO_BLOCK_KEYS as readonly string[]).includes(key)) return this.props.infoBlocks[key as InfoBlockKey];
        if (key in this.props) return (this.props as any)[key];
        return undefined;
    }

    setSettingValue(key: string, value: any): void {
        if (key === 'visible') { this.visible = !!value; return; }
        if (applyPositionProp(this.props, key, value)) this._syncStyle();
    }

    // ---- Drawing ----

    addPoint(time: number, price: number): void {
        this.points.push({ time, price });
        if (this.points.length >= 2) this.state = 'complete';
    }

    isComplete(): boolean {
        return this.points.length >= 2;
    }

    updateLastPoint(time: number, _price: number): void {
        if (this.points.length === 0) return;
        // Giris cizgisi yatay: ikinci nokta ilkinin fiyatini kullanir
        this.points[1] = { time, price: this.points[0].price };
    }

    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = [...points];
    }

    /** Hedef ve stop Y konumlarini onbellekler (renderer; isabet testi icin) */
    setCachedZoneY(targetY: number, stopY: number): void {
        this._cachedTargetY = targetY;
        this._cachedStopY = stopY;
    }

    /** 4 kontrol noktasi: [Sol, Sag, Hedef, Stop] */
    getPixelPoints(): { x: number; y: number }[] {
        if (this._pixelPoints.length < 2) return this._pixelPoints;
        const p1 = this._pixelPoints[0];
        const p2 = this._pixelPoints[1];
        const centerX = (p1.x + p2.x) / 2;
        return [
            p1, p2,
            { x: centerX, y: this._cachedTargetY },
            { x: centerX, y: this._cachedStopY },
        ];
    }

    getEntryPrice(): number {
        return this.points.length > 0 ? this.points[0].price : 0;
    }

    /** Long: hedef yukari, stop asagi; Short: tersi */
    getTargetPrice(): number {
        return this.getEntryPrice() * (1 + (this.isLong ? 1 : -1) * this.profitPercent / 100);
    }

    getStopPrice(): number {
        return this.getEntryPrice() * (1 - (this.isLong ? 1 : -1) * this.stopPercent / 100);
    }

    /** Giris zamani: sol kenar */
    getEntryTime(): number {
        if (this.points.length === 0) return 0;
        return this.points.length > 1 ? Math.min(this.points[0].time, this.points[1].time) : this.points[0].time;
    }

    private _lastTickCtx: PositionTickContext | null = null;

    /** tick = resolvePipSize(symbol, precision) / 10 (renderer ile ayni kural) */
    private _tickFromCtx(ctx: PositionTickContext | null): number {
        return ctx ? resolvePipSize(ctx.symbol ?? '', ctx.precision) / 10 : 0;
    }

    /** Hesap girdisi + sonuclar (renderer ve testler ortak kullanir) */
    calc(lastClose: number | null, tick: number | PositionTickContext): PositionCalc {
        let tickSize: number;
        if (typeof tick === 'number') {
            tickSize = tick > 0 ? tick : this._tickFromCtx(this._lastTickCtx);
        } else {
            this._lastTickCtx = tick;
            tickSize = this._tickFromCtx(tick);
        }
        return computePositionCalc({
            isLong: this.isLong,
            entry: this.getEntryPrice(), stop: this.getStopPrice(), target: this.getTargetPrice(),
            accountSize: this.props.accountSize, lotSize: this.props.lotSize,
            risk: this.props.risk, riskDisplayMode: this.props.riskDisplayMode,
            qtyPrecision: this.props.qtyPrecision, lastClose, tickSize,
        });
    }

    /** Fiyat ekseni etiketleri: giris (cizgi rengi), stop, hedef */
    getAxisLabels(): DrawingAxisLabels {
        if (!this.props.showPriceLabels || this.points.length < 1) return { prices: [], times: [] };
        return {
            prices: [
                { price: this.getEntryPrice(), color: this.props.linecolor },
                { price: this.getStopPrice(), color: this.props.stopBackground },
                { price: this.getTargetPrice(), color: this.props.profitBackground },
            ],
            times: [],
        };
    }

    hitTest(x: number, y: number, threshold: number = 8): boolean {
        if (this._pixelPoints.length < 2) return false;
        const p1 = this._pixelPoints[0];
        const p2 = this._pixelPoints[1];
        const left = Math.min(p1.x, p2.x);
        const right = Math.max(p1.x, p2.x);
        if (x < left - threshold || x > right + threshold) return false;

        const entryY = p1.y;
        const ys = [entryY];
        if (this._cachedTargetY !== 0) ys.push(this._cachedTargetY);
        if (this._cachedStopY !== 0) ys.push(this._cachedStopY);
        let minY = Math.min(...ys);
        let maxY = Math.max(...ys);
        if (ys.length === 1) { minY = entryY - 150; maxY = entryY + 150; }
        return !(y < minY - threshold || y > maxY + threshold);
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length < 2) return null;
        const p1 = this._pixelPoints[0];
        const p2 = this._pixelPoints[1];
        const left = Math.min(p1.x, p2.x);
        const right = Math.max(p1.x, p2.x);
        return { x: left, y: p1.y - 100, width: right - left, height: 200 };
    }

    // ---- Serilestirme ----

    toJSON(): SerializedDrawing {
        const rgba = (hex: string, transp: number) => {
            const c = parseColor(hex);
            return c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.round((1 - transp / 100) * 100) / 100})` : hex;
        };
        return {
            id: this.id,
            type: this.type,
            points: [...this.points],
            style: { ...this.style },
            state: this.state === 'selected' ? 'complete' : this.state,
            visible: this.visible,
            locked: this.locked,
            ...(this.paneId !== undefined ? { paneId: this.paneId } : {}),
            profitPercent: this.profitPercent,
            stopPercent: this.stopPercent,
            // Eski alanlar (geriye donuk okuyucular icin)
            profitColor: rgba(this.props.profitBackground, this.props.profitBackgroundTransparency),
            lossColor: rgba(this.props.stopBackground, this.props.stopBackgroundTransparency),
            entryColor: this.props.linecolor,
            position: serializePositionProps(this.props),
        };
    }

    /** JSON'dan geri yukleme (eski kayitlar gorunumunu korur, yeni alanlar varsayilan). */
    protected _applyJSON(data: SerializedDrawing): void {
        Object.defineProperty(this, 'id', { value: data.id, writable: false });
        this.points = [...data.points];
        this.state = data.state as DrawingState;
        this.visible = data.visible;
        this.locked = data.locked;
        if (data.paneId !== undefined) this.paneId = data.paneId;
        const pos = (v: any, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);
        this.profitPercent = pos(data.profitPercent, 3);
        this.stopPercent = pos(data.stopPercent, 1.5);

        if (data.position) {
            this.props = deserializePositionProps(data.position);
        } else {
            // Eski kayit: renkleri ve cizgi stilini koru
            const p = createPositionProps();
            const line = data.entryColor ?? data.style?.color;
            if (line) applyPositionProp(p, 'linecolor', line);
            if (data.style?.lineWidth) applyPositionProp(p, 'linewidth', data.style.lineWidth);
            const legacy = (css: string | undefined, colorKey: string, transpKey: string) => {
                const c = parseColor(css);
                if (!c) return;
                applyPositionProp(p, colorKey, css);
                applyPositionProp(p, transpKey, Math.round((1 - c.a) * 100));
            };
            legacy(data.profitColor, 'profitBackground', 'profitBackgroundTransparency');
            legacy(data.lossColor, 'stopBackground', 'stopBackgroundTransparency');
            this.props = p;
        }
        this.style = { ...DEFAULT_DRAWING_STYLE, ...(data.style ?? {}) };
        this._syncStyle();
    }
}
