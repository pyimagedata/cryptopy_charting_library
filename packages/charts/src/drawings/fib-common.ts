/**
 * Fibonacci cizim araclarinin (duzeltme, trend bazli uzatma, kanal) ortak
 * ayarlari, seviye hesaplamasi ve etiket cizimi.
 *
 * Ayar kumesi TradingView'in Fib araclariyla ayni yetenekleri hedefler
 * (sola/saga ayri uzatma, yuzde gosterimi, log olcek, etiket konumu/boyutu,
 * trend cizgisi, dolguyu kapatma); uygulama tamamen bu kutuphaneye aittir.
 */

import {
    SettingsSection,
    checkboxRow,
    colorRow,
    lineStyleRow,
    lineWidthRow,
    selectRow,
    sliderRow,
} from './drawing-settings-config';
import { t } from '../helpers/translations';

export type FibLabelHAlign = 'left' | 'center' | 'right';
export type FibLabelVAlign = 'top' | 'middle' | 'bottom';
export type FibLineStyle = 'solid' | 'dashed' | 'dotted';

export interface FibLevelLike {
    level: number;
    label: string;
    color: string;
    enabled: boolean;
    /** Seviyenin kendi (istege bagli) metni; cizgi uzerine yazilir. */
    text?: string;
}

/** Standart Fibonacci seviye kumesi: yaygin olanlar acik, ileri uzatmalar kapali. */
export function defaultFibLevels(): FibLevelLike[] {
    // TradingView sirasi: once yaygin seviyeler, sonra kapali olanlar.
    const rows: [number, string, boolean][] = [
        [0, '#808080', true],
        [0.236, '#f23645', true],
        [0.382, '#ff9800', true],
        [0.5, '#4caf50', true],
        [0.618, '#089981', true],
        [0.786, '#00bcd4', true],
        [1, '#808080', true],
        [1.618, '#2962ff', true],
        [2.618, '#f23645', true],
        [3.618, '#9c27b0', true],
        [4.236, '#e91e63', true],
        [1.272, '#ff9800', false],
        [1.414, '#f23645', false],
        [2.272, '#ff9800', false],
        [2.414, '#4caf50', false],
        [2, '#089981', false],
        [3, '#00bcd4', false],
        [3.272, '#808080', false],
        [3.414, '#2962ff', false],
        [4, '#f23645', false],
        [4.272, '#9c27b0', false],
        [4.414, '#e91e63', false],
        [4.618, '#ff9800', false],
        [4.764, '#089981', false],
    ];
    return rows.map(([level, color, enabled]) => ({ level, label: String(level), color, enabled }));
}

/** Kaydedilmis seviyeleri (eski format dahil) okunabilir hale getirir. */
export function levelsFromJSON(data: Array<{ value: number; color: string; visible: boolean; text?: string }> | undefined): FibLevelLike[] | undefined {
    if (!data) return undefined;
    const loaded = data.map((l) => {
        const out: FibLevelLike = { level: l.value, label: String(l.value), color: l.color, enabled: l.visible };
        if (l.text) out.text = l.text;
        return out;
    });
    // Eski kayitlarda eksik olan TradingView varsayilan seviyeleri kapali olarak eklenir
    // (sabit 24 satirlik tablo bunlari gosterip acabilsin); kayitli sira/degerler degismez.
    for (const d of defaultFibLevels()) {
        if (!loaded.some((l) => Math.abs(l.level - d.level) < 1e-9)) loaded.push({ ...d, enabled: false });
    }
    return loaded;
}

export function levelsToJSON(levels: FibLevelLike[]): Array<{ value: number; color: string; visible: boolean; text?: string }> {
    return levels.map((l) => {
        const out: { value: number; color: string; visible: boolean; text?: string } = { value: l.level, color: l.color, visible: l.enabled };
        if (l.text) out.text = l.text;
        return out;
    });
}

/** Dolgu icin seviyeleri katsayiya gore artan siralar (kullanici sirayi bozmus olabilir). */
export function sortedByLevel<T extends { level: number }>(rows: T[]): T[] {
    return [...rows].sort((a, b) => a.level - b.level);
}

/**
 * `base` fiyatindan `target` yonunde `coeff` kadar: coeff=0 -> base, coeff=1 -> target.
 * Log olcekte (ve fiyatlar pozitifse) oran log fiyat uzerinden uygulanir.
 */
export function fibLevelPrice(base: number, target: number, coeff: number, useLog: boolean): number {
    if (useLog && base > 0 && target > 0) {
        return Math.exp(Math.log(base) + (Math.log(target) - Math.log(base)) * coeff);
    }
    return base + (target - base) * coeff;
}

/** Trend bazli uzatma: C'den, A->B hareketinin `coeff` kati kadar. */
export function fibExtensionPrice(a: number, b: number, c: number, coeff: number, useLog: boolean): number {
    if (useLog && a > 0 && b > 0 && c > 0) {
        return Math.exp(Math.log(c) + (Math.log(b) - Math.log(a)) * coeff);
    }
    return c + (b - a) * coeff;
}

export function lineDashFor(style: FibLineStyle, dpr: number): number[] {
    if (style === 'dashed') return [6 * dpr, 4 * dpr];
    if (style === 'dotted') return [2 * dpr, 2 * dpr];
    return [];
}

function trimNumber(n: number, digits: number): string {
    return n.toFixed(digits).replace(/\.?0+$/, '');
}

export interface FibCommonCapabilities {
    /** Fiyat etiketi gosterilebiliyor mu (kanalda seviyeler egik oldugu icin yok). */
    prices: boolean;
    /** Log olcek secenegi anlamli mi (fiyat uzerinden hesaplanan araclar). */
    logScale: boolean;
    /** Trend cizgisi ayari var mi (kanalda yok; varsayilan true). */
    trendLine?: boolean;
    /** "Reverse" secenegi var mi (kanalda yok; varsayilan true). */
    reverse?: boolean;
    /** Seviye basina metin (varsayilan true). */
    levelText?: boolean;
}

/** Uc aracin paylastigi ayarlar; her cizim bir ornek tutar. */
export class FibCommonSettings {
    extendLeft = false;
    extendRight = false;
    showLabels = true;
    showPrices = true;
    coeffsAsPercents = false;
    fillBackground = true;
    labelHAlign: FibLabelHAlign = 'left';
    labelVAlign: FibLabelVAlign = 'middle';
    labelFontSize = 12;
    logScale = false;
    trendLineVisible = true;
    trendLineStyle: FibLineStyle = 'dashed';
    trendLineWidth = 1;
    showText = true;
    horzTextAlign: FibLabelHAlign = 'center';
    vertTextAlign: FibLabelVAlign = 'middle';

    constructor(private readonly _caps: FibCommonCapabilities = { prices: true, logScale: true }) {
        this.trendLineVisible = _caps.trendLine !== false;
    }

    get capabilities(): Readonly<FibCommonCapabilities> {
        return this._caps;
    }

    static readonly KEYS = [
        'extendLeft', 'extendRight', 'showLabels', 'showPrices', 'coeffsAsPercents', 'fillBackground',
        'labelHAlign', 'labelVAlign', 'labelFontSize', 'logScale', 'trendLineVisible', 'trendLineStyle', 'trendLineWidth',
        'showText', 'horzTextAlign', 'vertTextAlign',
    ] as const;

    has(key: string): boolean {
        return (FibCommonSettings.KEYS as readonly string[]).includes(key);
    }

    get(key: string): any {
        if (key === 'labelFontSize') return String(this.labelFontSize);
        return (this as any)[key];
    }

    /** Ortak bir anahtarsa uygular ve true doner. */
    set(key: string, value: any): boolean {
        if (!this.has(key)) return false;
        if (key === 'labelFontSize') {
            const n = Number(value);
            if (Number.isFinite(n) && n > 0) this.labelFontSize = n;
            return true;
        }
        (this as any)[key] = value;
        return true;
    }

    /** Stil sekmesi bolumleri; cizim kendi seviye tablosunu sona ekler. (levelText yalniz Text sekmesini etkiler, burada satir yok.) */
    sections(): SettingsSection[] {
        const labels = [
            checkboxRow('showLabels', 'Show Levels'),
            ...(this._caps.prices ? [checkboxRow('showPrices', 'Show Prices')] : []),
            checkboxRow('coeffsAsPercents', 'Levels as Percent'),
            selectRow('labelHAlign', 'Labels Horizontal', [
                { value: 'left', label: t('Left') },
                { value: 'center', label: t('Center') },
                { value: 'right', label: t('Right') },
            ]),
            selectRow('labelVAlign', 'Labels Vertical', [
                { value: 'top', label: t('Top') },
                { value: 'middle', label: t('Middle') },
                { value: 'bottom', label: t('Bottom') },
            ]),
            selectRow('labelFontSize', 'Font Size', ['10', '11', '12', '14', '16', '20'].map((v) => ({ value: v, label: v }))),
        ];
        const options = [
            checkboxRow('extendLeft', 'Extend Left'),
            checkboxRow('extendRight', 'Extend Right'),
            ...(this._caps.reverse !== false ? [checkboxRow('reversed', 'Reverse')] : []),
            ...(this._caps.logScale ? [checkboxRow('logScale', 'Fib levels based on log scale')] : []),
        ];
        return [
            {
                title: 'Levels Line',
                rows: [lineWidthRow('lineWidth'), lineStyleRow('lineStyle'), sliderRow('opacity', 'Line Opacity', 10, 100, '%')],
            },
            ...(this._caps.trendLine !== false
                ? [{
                    title: 'Trend Line',
                    rows: [
                        checkboxRow('trendLineVisible', 'Show Trend Line'),
                        colorRow('color', 'Trend Line Color'),
                        lineStyleRow('trendLineStyle', 'Trend Line Style'),
                    ],
                }]
                : []),
            { title: 'Labels', rows: labels },
            {
                title: 'Background',
                rows: [checkboxRow('fillBackground', 'Background'), sliderRow('backgroundOpacity', 'Background Opacity', 0, 50, '%')],
            },
            { title: 'Options', rows: options },
        ];
    }

    toJSON(): Record<string, any> {
        const out: Record<string, any> = {};
        for (const k of FibCommonSettings.KEYS) out[k] = (this as any)[k];
        return out;
    }

    applyJSON(data: Record<string, any> | undefined): void {
        if (!data) return;
        for (const k of FibCommonSettings.KEYS) {
            if (data[k] !== undefined) (this as any)[k] = data[k];
        }
    }

    formatLevel(level: number): string {
        return this.coeffsAsPercents ? `${trimNumber(level * 100, 1)}%` : String(level);
    }

    /** Etiket metni: seviye ve (destekleniyorsa) fiyat. Bos donerse etiket cizilmez. */
    labelText(level: number, price: number | null, formatPrice: (p: number) => string = (p) => p.toFixed(2)): string {
        const parts: string[] = [];
        if (this.showLabels) parts.push(this.formatLevel(level));
        if (this._caps.prices && this.showPrices && price !== null) {
            parts.push(this.showLabels ? `(${formatPrice(price)})` : formatPrice(price));
        }
        return parts.join(' ');
    }

    /**
     * Yatay (ya da egik) bir seviye cizgisinin uzerine etiketi yerlestirir.
     * (x1,y1)-(x2,y2): cizginin gorunen ucu; koordinatlar DPR olcekli.
     */
    drawLabel(
        ctx: CanvasRenderingContext2D,
        text: string,
        color: string,
        x1: number, y1: number, x2: number, y2: number,
        dpr: number,
    ): void {
        if (!text) return;
        const pad = 4 * dpr;
        ctx.font = `${this.labelFontSize * dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = color;
        let x: number;
        let y: number;
        // TradingView ile ayni yerlesim: "sol" etiketi cizginin SOL ucunun disina
        // (metin saga yasli), "sag" etiketi SAG ucunun disina yazar. Cizgi o
        // yone ekran kenarina kadar uzatilmissa etiket icerde kalir.
        if (this.labelHAlign === 'right') {
            const outside = !this.extendRight;
            ctx.textAlign = outside ? 'left' : 'right';
            x = outside ? x2 + pad : x2 - pad;
            y = y2;
        } else if (this.labelHAlign === 'center') {
            ctx.textAlign = 'center';
            x = (x1 + x2) / 2;
            y = (y1 + y2) / 2;
        } else {
            const outside = !this.extendLeft;
            ctx.textAlign = outside ? 'right' : 'left';
            x = outside ? x1 - pad : x1 + pad;
            y = y1;
        }
        if (this.labelVAlign === 'bottom') {
            ctx.textBaseline = 'top';
            y += 2 * dpr;
        } else if (this.labelVAlign === 'middle') {
            ctx.textBaseline = 'middle';
        } else {
            ctx.textBaseline = 'bottom';
            y -= 2 * dpr;
        }
        ctx.fillText(text, x, y);
    }

    /**
     * Seviyenin kendi metnini cizgi uzerine yazar (cizgi egikse yazi konumundaki
     * yukseklige gore). Koordinatlar DPR olcekli.
     */
    drawLevelText(
        ctx: CanvasRenderingContext2D,
        text: string | undefined,
        color: string,
        x1: number, y1: number, x2: number, y2: number,
        dpr: number,
    ): void {
        if (!this.showText || !text) return;
        const pad = 4 * dpr;
        ctx.font = `${this.labelFontSize * dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = color;
        let x: number;
        if (this.horzTextAlign === 'left') {
            ctx.textAlign = 'left';
            x = Math.min(x1, x2) + pad;
        } else if (this.horzTextAlign === 'right') {
            ctx.textAlign = 'right';
            x = Math.max(x1, x2) - pad;
        } else {
            ctx.textAlign = 'center';
            x = (x1 + x2) / 2;
        }
        let y = x2 !== x1 ? y1 + ((y2 - y1) * (x - x1)) / (x2 - x1) : y1;
        if (this.vertTextAlign === 'top') {
            ctx.textBaseline = 'bottom';
            y -= 2 * dpr;
        } else if (this.vertTextAlign === 'bottom') {
            ctx.textBaseline = 'top';
            y += 2 * dpr;
        } else {
            ctx.textBaseline = 'middle';
        }
        ctx.fillText(text, x, y);
    }
}
