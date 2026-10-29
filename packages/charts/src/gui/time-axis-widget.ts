import { TimeScale } from '../model/time-scale';
import { TimeParts } from '../model/time-marks';
import { getCurrentLanguage } from '../helpers/translations';

/** Disposable interface for cleanup */
interface Disposable {
    dispose(): void;
}

/**
 * Time axis widget options
 */
export interface TimeAxisWidgetOptions {
    height: number;
    backgroundColor: string;
    textColor: string;
    fontSize: number;
    fontFamily: string;
    /**
     * IANA zone the axis labels are rendered in, e.g. 'America/New_York'.
     * Empty string keeps the browser's local zone (previous behaviour).
     * Bar timestamps are absolute epoch ms, so this only affects display.
     */
    timezone: string;
}

const defaultTimeAxisOptions: TimeAxisWidgetOptions = {
    height: 28,
    backgroundColor: '#16213e',  // Darker navy (original panel bg)
    textColor: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontFamily: '-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif',
    timezone: '',
};

/**
 * Time axis widget - renders time labels at bottom
 */
export class TimeAxisWidget implements Disposable {
    private readonly _timeScale: TimeScale;
    private readonly _options: TimeAxisWidgetOptions;
    private readonly _timestamps: number[];
    private _element: HTMLElement | null = null;
    private _canvas: HTMLCanvasElement | null = null;
    private _ctx: CanvasRenderingContext2D | null = null;
    private _width: number = 0;
    private _boldColor: string = '#d1d4dc';

    constructor(
        container: HTMLElement,
        timeScale: TimeScale,
        timestamps: number[],
        options: Partial<TimeAxisWidgetOptions> = {}
    ) {
        this._timeScale = timeScale;
        this._timestamps = timestamps;
        this._options = { ...defaultTimeAxisOptions, ...options };
        timeScale.timeMarks.setTimezone(this._options.timezone);
        timeScale.timeMarks.setTimestamps(timestamps);
        this._createElement(container);
        this._installMeasure();
    }

    get element(): HTMLElement | null {
        return this._element;
    }

    get canvas(): HTMLCanvasElement | null {
        return this._canvas;
    }

    get height(): number {
        return this._options.height;
    }

    setWidth(width: number): void {
        if (this._width === width) return;
        this._width = width;

        if (this._element) {
            this._element.style.width = `${width}px`;
        }
        if (this._canvas) {
            const dpr = window.devicePixelRatio || 1;
            this._canvas.style.width = `${width}px`;
            this._canvas.width = width * dpr;
        }
    }

    updateTimestamps(timestamps: number[]): void {
        (this as any)._timestamps = timestamps;
        this._timeScale.timeMarks.setTimestamps(timestamps);
    }

    /** Tick marks are laid out with the real canvas text metrics (label width + padding). */
    private _installMeasure(): void {
        const o = this._options;
        this._timeScale.timeMarks.setMeasure((text, bold) => {
            if (!this._ctx) return text.length * 7;
            this._ctx.font = `${bold ? 'bold ' : ''}${o.fontSize}px ${o.fontFamily}`;
            return this._ctx.measureText(text).width;
        }, `${o.fontSize}|${o.fontFamily}`);
    }

    render(): void {
        if (!this._ctx || !this._canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const width = this._width;
        const height = this._options.height;

        // Clear
        this._ctx.setTransform(1, 0, 0, 1, 0, 0);
        this._ctx.scale(dpr, dpr);
        this._ctx.fillStyle = this._options.backgroundColor;
        this._ctx.fillRect(0, 0, width, height);

        // Draw top border
        this._ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this._ctx.lineWidth = 1;
        this._ctx.beginPath();
        this._ctx.moveTo(0, 0.5);
        this._ctx.lineTo(width, 0.5);
        this._ctx.stroke();

        // Get visible range
        const visibleRange = this._timeScale.visibleRange();
        if (!visibleRange || this._timestamps.length === 0) return;

        this._timeScale.timeMarks.setLocale(getCurrentLanguage());
        const marks = this._timeScale.marks();

        this._ctx.textAlign = 'center';
        this._ctx.textBaseline = 'top';

        for (const mark of marks) {
            const x = mark.x;

            // Tick mark
            this._ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            this._ctx.beginPath();
            this._ctx.moveTo(x, 0);
            this._ctx.lineTo(x, 4);
            this._ctx.stroke();

            // Label: day and above are bold / brighter, like TradingView
            this._ctx.fillStyle = mark.bold ? this._boldColor : this._options.textColor;
            this._ctx.font = `${mark.bold ? 'bold ' : ''}${this._options.fontSize}px ${this._options.fontFamily}`;
            this._ctx.fillText(mark.label, x, 8);
        }

        // Cizimlerin zaman etiketleri (dikey cizgi vb.): imlec etiketinin ALTINDA kalsin diye once
        for (const label of this._drawingLabels) {
            if (label.x < 0 || label.x > width) continue;
            this._drawLabel(label.x, this._formatCrosshairTime(label.time), label.color);
        }

        // Draw crosshair label
        if (this._crosshairX !== null) {
            const index = this._timeScale.coordinateToIndex(this._crosshairX as any);
            if (index !== null && index >= 0 && index < this._timestamps.length) {
                const timestamp = this._timestamps[index as number];
                const label = this._formatCrosshairTime(timestamp);
                const x = this._timeScale.indexToCoordinate(index);
                this._drawLabel(x, label, '#2962ff');
            }
        }
    }

    private _crosshairX: number | null = null;
    private _drawingLabels: { time: number; x: number; color: string }[] = [];

    /** Cizimlerin zaman etiketleri: time (ms) metni, x (CSS px) konumu belirler; her cizimde yeniden verilir */
    setDrawingLabels(labels: { time: number; x: number; color: string }[]): void {
        this._drawingLabels = labels;
    }

    setCrosshair(x: number, visible: boolean): void {
        this._crosshairX = visible ? x : null;
    }

    private _drawLabel(x: number, text: string, color: string): void {
        if (!this._ctx) return;

        const padding = 8;
        this._ctx.font = `bold ${this._options.fontSize}px ${this._options.fontFamily}`;
        const textWidth = this._ctx.measureText(text).width;
        const boxWidth = textWidth + (padding * 2);
        const boxHeight = 20;

        let boxX = x - (boxWidth / 2);
        // Clamp to edges
        if (boxX < 0) boxX = 0;
        if (boxX + boxWidth > this._width) boxX = this._width - boxWidth;

        const boxY = 0;

        // Background
        this._ctx.fillStyle = color;
        this._ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

        // Text
        this._ctx.fillStyle = '#ffffff';
        this._ctx.textAlign = 'center';
        this._ctx.textBaseline = 'middle';
        this._ctx.fillText(text, boxX + (boxWidth / 2), boxY + (boxHeight / 2));
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
        this._boldColor = isDark ? '#d1d4dc' : '#131722';
        this.render();
    }

    dispose(): void {
        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
        this._element = null;
        this._canvas = null;
        this._ctx = null;
    }

    /**
     * Change the zone the axis labels are drawn in. Pass '' for browser local.
     * Bar data is absolute epoch ms, so nothing but the labels moves.
     */
    setTimezone(timezone: string): void {
        if (this._options.timezone === timezone) return;
        this._options.timezone = timezone;
        this._timeScale.timeMarks.setTimezone(timezone);
        this.render();
    }

    get timezone(): string {
        return this._options.timezone;
    }

    /** Calendar fields of an instant in the configured zone (shared with the tick mark engine). */
    private _parts(timestamp: number): TimeParts {
        return this._timeScale.timeMarks.clock.parts(timestamp);
    }

    private _getMonthShort(month: number): string {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return months[month];
    }

    private _formatCrosshairTime(timestamp: number): string {
        const p = this._parts(timestamp);
        const hours = p.hour.toString().padStart(2, '0');
        const minutes = p.minute.toString().padStart(2, '0');
        return `${p.day} ${this._getMonthShort(p.month)} ${p.year}, ${hours}:${minutes}`;
    }

    private _createElement(container: HTMLElement): void {
        this._element = document.createElement('div');
        this._element.style.cssText = `
            height: ${this._options.height}px;
            width: 100%;
            flex-shrink: 0;
            position: relative;
        `;

        this._canvas = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;
        this._canvas.height = this._options.height * dpr;
        this._canvas.style.cssText = `
            width: 100%;
            height: ${this._options.height}px;
            display: block;
        `;

        this._ctx = this._canvas.getContext('2d');
        this._element.appendChild(this._canvas);
        container.appendChild(this._element);
    }
}
