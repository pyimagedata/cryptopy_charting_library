import { startDragSession } from '../helpers/drag-session';
import { PriceMark } from '../model/price-scale';
import { Coordinate, BarPrice, coordinate } from '../model/coordinate';

/** Eksenin kullandigi olcek yuzeyi: PriceScale ya da OffsetPriceScale. */
export interface PriceAxisScale {
    marks(): PriceMark[];
    priceToCoordinate(price: number): Coordinate;
    coordinateToPrice(y: Coordinate): BarPrice;
    formatPrice(price: number): string;
    startScale(y: number): void;
    scaleTo(y: number): void;
    endScale(): void;
}

/** Disposable interface for cleanup */
interface Disposable {
    dispose(): void;
}

/**
 * Price axis widget options
 */
export interface PriceAxisWidgetOptions {
    width: number;
    backgroundColor: string;
    textColor: string;
    fontSize: number;
    fontFamily: string;
    /** Eksenin ustune yazilan kisa ad (ikinci eksende karsi sembol). */
    title?: string;
    /** Baslik rengi. */
    accentColor?: string;
}

/** Extra label width for the alert bell glyph. */
const ALERT_GLYPH_W = 14;

const defaultPriceAxisOptions: PriceAxisWidgetOptions = {
    width: 52,
    backgroundColor: '#16213e',  // Darker navy (original panel bg)
    textColor: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

/**
 * Price axis widget - renders price scale labels
 */
export class PriceAxisWidget implements Disposable {
    private _priceScale: PriceAxisScale;
    private readonly _options: PriceAxisWidgetOptions;
    private _element: HTMLElement | null = null;
    private _canvas: HTMLCanvasElement | null = null;
    private _ctx: CanvasRenderingContext2D | null = null;
    private _height: number = 0;
    private _width: number;

    constructor(
        container: HTMLElement,
        priceScale: PriceAxisScale,
        options: Partial<PriceAxisWidgetOptions> = {}
    ) {
        this._priceScale = priceScale;
        this._options = { ...defaultPriceAxisOptions, ...options };
        this._width = this._options.width;
        this._createElement(container);
    }

    get element(): HTMLElement | null {
        return this._element;
    }

    get canvas(): HTMLCanvasElement | null {
        return this._canvas;
    }

    /** Su anki zemin/yazi renkleri (ikinci eksen ana eksenle ayni gorunsun diye). */
    get colors(): { backgroundColor: string; textColor: string } {
        return { backgroundColor: this._options.backgroundColor, textColor: this._options.textColor };
    }

    get width(): number {
        return this._width;
    }

    updateWidth(): boolean {
        const width = this._calculateRequiredWidth();
        if (width === this._width) {
            return false;
        }

        this._width = width;
        if (this._element) {
            this._element.style.width = `${width}px`;
        }
        if (this._canvas) {
            const dpr = window.devicePixelRatio || 1;
            this._canvas.style.width = `${width}px`;
            this._canvas.width = width * dpr;
        }

        return true;
    }

    setHeight(height: number): void {
        if (this._height === height) return;
        this._height = height;

        if (this._element) {
            this._element.style.height = `${height}px`;
        }
        if (this._canvas) {
            const dpr = window.devicePixelRatio || 1;
            this._canvas.style.height = `${height}px`;
            this._canvas.height = height * dpr;
        }
    }

    render(): void {
        if (!this._ctx || !this._canvas) return;

        const dpr = window.devicePixelRatio || 1;
        this.updateWidth();
        const width = this._width;
        const height = this._height;

        // Clear
        this._ctx.setTransform(1, 0, 0, 1, 0, 0);
        this._ctx.scale(dpr, dpr);
        this._ctx.fillStyle = this._options.backgroundColor;
        this._ctx.fillRect(0, 0, width, height);

        // Draw border
        this._ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this._ctx.lineWidth = 1;
        this._ctx.beginPath();
        this._ctx.moveTo(0.5, 0);
        this._ctx.lineTo(0.5, height);
        this._ctx.stroke();

        // Draw price labels
        const marks = this._priceScale.marks();
        this._ctx.fillStyle = this._options.textColor;
        this._ctx.font = `${this._options.fontSize}px ${this._options.fontFamily}`;
        this._ctx.textAlign = 'right';
        this._ctx.textBaseline = 'middle';

        // Draw marks
        for (const mark of marks) {
            const y = mark.coord;
            if (y < 10 || y > height - 10) continue;

            this._ctx.fillStyle = this._options.textColor; // Reset fill style
            if (this._options.title && y < 26) continue;
            this._ctx.fillText(mark.label, width - 8, y);

            // Small tick mark
            this._ctx.beginPath();
            this._ctx.moveTo(0, y);
            this._ctx.lineTo(4, y);
            this._ctx.stroke();
        }

        // Cizim fiyat etiketleri (ornegin trend cizgisi uclari): son fiyat rozetinin ALTINDA kalsin diye once
        // Cizim fiyat etiketleri (ornegin trend cizgisi uclari)
        for (const label of this._drawingLabels) {
            const y = this._priceScale.priceToCoordinate(label.price);
            // TradingView gibi: gorunur olcegin disindaki cizim etiketleri gizlenir (±20 tolerans sadece crosshair/son fiyat)
            if (y < 0 || y > this._height) continue;
            this._drawLabel(y, label.text, label.color, false);
        }

        // Alarm etiketleri (zil + fiyat): son fiyatin altinda, imlecin ustunde
        for (const label of this._alertLabels) {
            const y = this._priceScale.priceToCoordinate(label.price);
            if (y < 0 || y > this._height) continue;
            this._drawLabel(y, label.text, label.color, false, true);
        }

        // Draw last value label
        if (this._lastValue) {
            const y = this._priceScale.priceToCoordinate(this._lastValue.price);
            this._drawLabel(y, this._lastValue.text, this._lastValue.color, true);
        }

        if (this._crosshairY !== null) {
            const text = this._crosshairText
                ?? this._priceScale.formatPrice(this._priceScale.coordinateToPrice(coordinate(this._crosshairY)));
            this._drawLabel(this._crosshairY, text, this._options.accentColor ?? '#2962ff', false);
            this._ctx.font = `bold ${this._options.fontSize}px ${this._options.fontFamily}`;
            this._crosshairBoxWidth = Math.ceil(this._ctx.measureText(text).width + 4);
        }
        this._positionAddButton();

        if (this._options.title) {
            this._drawTitle(this._options.title);
        }
    }

    private _drawTitle(title: string): void {
        if (!this._ctx) return;
        const ctx = this._ctx;
        ctx.font = `bold ${this._options.fontSize - 1}px ${this._options.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this._options.backgroundColor;
        ctx.fillRect(1, 0, this._width - 1, 18);
        ctx.fillStyle = this._options.accentColor ?? this._options.textColor;
        ctx.fillText(title, this._width / 2, 9, this._width - 4);
    }

    private _calculateRequiredWidth(): number {
        if (!this._ctx) {
            return this._width;
        }

        let maxTextWidth = 0;

        this._ctx.font = `${this._options.fontSize}px ${this._options.fontFamily}`;
        for (const mark of this._priceScale.marks()) {
            maxTextWidth = Math.max(maxTextWidth, this._ctx.measureText(mark.label).width);
        }

        if (this._lastValue) {
            this._ctx.font = `bold ${this._options.fontSize}px ${this._options.fontFamily}`;
            maxTextWidth = Math.max(maxTextWidth, this._ctx.measureText(this._lastValue.text).width);
        }



        if (this._drawingLabels.length) {
            this._ctx.font = `bold ${this._options.fontSize}px ${this._options.fontFamily}`;
            for (const label of this._drawingLabels) {
                const ly = this._priceScale.priceToCoordinate(label.price);
                if (ly < 0 || ly > this._height) continue;
                maxTextWidth = Math.max(maxTextWidth, this._ctx.measureText(label.text).width);
            }
        }

        if (this._alertLabels.length) {
            this._ctx.font = `bold ${this._options.fontSize}px ${this._options.fontFamily}`;
            for (const label of this._alertLabels) {
                maxTextWidth = Math.max(maxTextWidth, this._ctx.measureText(label.text).width + ALERT_GLYPH_W);
            }
        }

        return Math.ceil(Math.max(44, maxTextWidth + 12));
    }

    private _drawLabel(y: number, text: string, color: string, isLastValue: boolean, glyph = false): void {
        if (!this._ctx || !this._element) return;
        const width = this._width;
        const height = this._height;

        // Allow slightly out of bounds
        if (y < -20 || y > height + 20) return;

        const horizontalPadding = 2;
        this._ctx.font = `bold ${this._options.fontSize}px ${this._options.fontFamily}`;
        const textWidth = this._ctx.measureText(text).width;

        // Calculate box dimensions - taller if countdown is shown
        const hasCountdown = isLastValue && this._countdown;
        const boxHeight = hasCountdown ? 34 : 20;
        const glyphW = glyph ? ALERT_GLYPH_W : 0;
        const boxWidth = Math.ceil(textWidth + (horizontalPadding * 2) + glyphW);
        const boxY = y - (boxHeight / 2);
        const boxX = width - boxWidth;

        // Background
        this._ctx.fillStyle = color;
        this._ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

        // Price text
        this._ctx.fillStyle = '#ffffff';
        this._ctx.textAlign = 'center';
        const priceY = hasCountdown ? boxY + 11 : y;
        this._ctx.fillText(text, boxX + glyphW + ((boxWidth - glyphW) / 2), priceY);
        if (glyph) {
            // small bell glyph (12x12 box) left of the price
            this._ctx.save();
            this._ctx.translate(boxX + 3, y - 6);
            this._ctx.fill(new Path2D('M6 1.2a3.2 3.2 0 0 0-3.2 3.2c0 2.2-1.1 3.3-1.1 3.3h8.6s-1.1-1.1-1.1-3.3A3.2 3.2 0 0 0 6 1.2z M5 9.2a1 1 0 0 0 2 0z'));
            this._ctx.restore();
        }

        // Countdown text (below price)
        if (hasCountdown && this._countdown) {
            this._ctx.font = `${this._options.fontSize - 1}px ${this._options.fontFamily}`;
            this._ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this._ctx.fillText(this._countdown, boxX + (boxWidth / 2), boxY + 25);
        }

        // Connector line (only for last value)
        if (isLastValue) {
            this._ctx.beginPath();
            this._ctx.strokeStyle = color;
            this._ctx.lineWidth = 1;
            this._ctx.setLineDash([2, 2]);
            this._ctx.moveTo(0, y);
            this._ctx.lineTo(boxX, y);
            this._ctx.stroke();
            this._ctx.setLineDash([]);
        }
    }

    private _alertLabels: { price: number; text: string; color: string }[] = [];

    /** Alarm fiyat etiketleri (bell + price, alert colour); every draw. */
    setAlertLabels(labels: { price: number; text: string; color: string }[]): void {
        this._alertLabels = labels;
    }

    private _lastValue: { price: number; text: string; color: string } | null = null;
    private _drawingLabels: { price: number; text: string; color: string }[] = [];

    /** Cizimlerin fiyat etiketleri (her cizimde yeniden verilir) */
    setDrawingLabels(labels: { price: number; text: string; color: string }[]): void {
        this._drawingLabels = labels;
    }
    private _crosshairY: number | null = null;
    private _crosshairBoxWidth = 0;
    private _addBtn: HTMLButtonElement | null = null;
    private _addEnabled = false;
    private _addHover = false;
    /** Click handler of the round "+" button next to the crosshair label (viewport coords of the button). */
    onAddButtonClick: ((clientX: number, clientY: number) => void) | null = null;
    /** Pointer over the axis canvas (or its "+" button): local y, or null when it left. */
    onHover: ((y: number | null) => void) | null = null;
    private _crosshairText: string | null = null;
    private _countdown: string | null = null;

    setLastValue(price: number, text: string, color: string): void {
        this._lastValue = { price, text, color };
    }

    /**
     * Set countdown text to show below price label
     * @param countdown Format: "mm:ss" or "hh:mm:ss" or null to hide
     */
    setCountdown(countdown: string | null): void {
        this._countdown = countdown;
    }

    /** `text` verilirse imlec etiketinde olcekten hesaplanan fiyat yerine o yazilir. */
    setCrosshair(y: number, visible: boolean, text: string | null = null): void {
        this._crosshairY = visible ? y : null;
        this._crosshairText = text;
    }

    /**
     * Shows / hides the round "+" button just left of the crosshair price label (TradingView style).
     * While the pointer is on the button itself it stays where it is so it can be clicked.
     */
    setAddButtonEnabled(enabled: boolean, title?: string): void {
        this._addEnabled = enabled;
        if (title !== undefined && this._addBtn) this._addBtn.title = title;
        this._positionAddButton();
    }

    private _ensureAddButton(): HTMLButtonElement | null {
        if (this._addBtn) return this._addBtn;
        if (!this._element) return null;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chart-price-axis-add';
        btn.style.cssText = `
            position: absolute; display: none; width: 18px; height: 18px; padding: 0; margin: 0;
            border-radius: 50%; border: 1px solid ${this._options.accentColor ?? '#2962ff'};
            background: ${this._options.backgroundColor}; color: ${this._options.accentColor ?? '#2962ff'};
            font: 600 14px/16px ${this._options.fontFamily}; text-align: center; cursor: pointer; z-index: 3;
        `;
        btn.textContent = '+';
        btn.addEventListener('mouseenter', () => { this._addHover = true; });
        btn.addEventListener('mouseleave', (e) => {
            this._addHover = false;
            this._positionAddButton();
            // leaving the button to anywhere but the axis canvas ends the axis hover
            if (e.relatedTarget !== this._canvas) this.onHover?.(null);
        });
        btn.addEventListener('mousedown', (e) => e.stopPropagation());
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const r = btn.getBoundingClientRect();
            this.onAddButtonClick?.(r.left, r.bottom + 4);
        });
        this._element.appendChild(btn);
        this._addBtn = btn;
        return btn;
    }

    private _positionAddButton(): void {
        if (!this._addEnabled && !this._addHover) {
            if (this._addBtn) this._addBtn.style.display = 'none';
            return;
        }
        const btn = this._ensureAddButton();
        if (!btn) return;
        if (this._crosshairY === null) {
            // pointer moved from the chart onto the button: keep it where it was
            if (!this._addHover) btn.style.display = 'none';
            return;
        }
        btn.style.background = this._options.backgroundColor;
        btn.style.left = `${this._width - this._crosshairBoxWidth - 22}px`;
        btn.style.top = `${this._crosshairY - 9}px`;
        btn.style.display = 'block';
    }

    /** Eksenin ustundeki kisa ad; null verilirse baslik ve vurgu rengi kalkar. */
    setTitle(title: string | null, accentColor?: string): void {
        this._options.title = title ?? undefined;
        this._options.accentColor = title ? accentColor : undefined;
    }

    /** Eksenin gosterdigi olcek (or. spot modunda fark kadar kaydirilmis olcek). */
    setScale(scale: PriceAxisScale): void {
        this._priceScale = scale;
    }

    /** Eksenin su an gosterdigi seviyeler: izgara cizgileri bunlarla hizalanir. */
    marks(): PriceMark[] {
        return this._priceScale.marks();
    }

    setBackgroundColor(color: string): void {
        this._options.backgroundColor = color;
    }

    /**
     * Set theme colors
     */
    setTheme(theme: 'dark' | 'light'): void {
        const isDark = theme === 'dark';
        this._options.backgroundColor = isDark ? '#16213e' : '#f8f9fa';
        this._options.textColor = isDark ? 'rgba(255, 255, 255, 0.5)' : '#787b86';
        this.render();
    }

    dispose(): void {
        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
        this._element = null;
        this._canvas = null;
        this._ctx = null;
        this._addBtn = null;
        this.onAddButtonClick = null;
        this.onHover = null;
    }

    private _createElement(container: HTMLElement): void {
        this._element = document.createElement('div');
        this._element.style.cssText = `
            width: ${this._width}px;
            height: 100%;
            flex-shrink: 0;
            position: relative;
        `;

        this._canvas = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;
        this._canvas.width = this._width * dpr;
        this._canvas.style.cssText = `
            width: ${this._width}px;
            height: 100%;
            display: block;
            cursor: ns-resize;
            touch-action: none;
        `;

        this._ctx = this._canvas.getContext('2d');

        let endScaleSession: (() => void) | null = null;
        this._canvas.addEventListener('mousedown', (e: MouseEvent) => {
            if (e.button !== 0) return;
            endScaleSession?.();
            this._priceScale.startScale(e.clientY);
            endScaleSession = startDragSession(
                (ev) => this._priceScale.scaleTo(ev.clientY),
                () => {
                    this._priceScale.endScale();
                    endScaleSession = null;
                },
            );
            e.preventDefault();
        });

        this._canvas.addEventListener('mousemove', (e: MouseEvent) => {
            if (endScaleSession) return;
            this.onHover?.(e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top);
        });
        this._canvas.addEventListener('mouseleave', (e: MouseEvent) => {
            if (e.relatedTarget === this._addBtn) return;
            this.onHover?.(null);
        });

        this._element.appendChild(this._canvas);
        container.appendChild(this._element);
    }
}
