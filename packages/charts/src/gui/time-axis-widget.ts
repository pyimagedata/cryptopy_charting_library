import { TimeScale } from '../model/time-scale';

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

/** Calendar fields of an instant, resolved in some zone. Month is 0-based. */
interface TimeParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
}

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
    private _fmt: Intl.DateTimeFormat | null = null;
    private _fmtTz: string | null = null;

    constructor(
        container: HTMLElement,
        timeScale: TimeScale,
        timestamps: number[],
        options: Partial<TimeAxisWidgetOptions> = {}
    ) {
        this._timeScale = timeScale;
        this._timestamps = timestamps;
        this._options = { ...defaultTimeAxisOptions, ...options };
        this._createElement(container);
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

        // Calculate label spacing
        const barSpacing = this._timeScale.barSpacing;
        const minLabelSpacing = 80; // Minimum pixels between labels
        const labelInterval = Math.ceil(minLabelSpacing / barSpacing);

        this._ctx.fillStyle = this._options.textColor;
        this._ctx.font = `${this._options.fontSize}px ${this._options.fontFamily}`;
        this._ctx.textAlign = 'center';
        this._ctx.textBaseline = 'top';

        for (let i = visibleRange.from as number; i <= (visibleRange.to as number); i += labelInterval) {
            if (i < 0 || i >= this._timestamps.length) continue;

            const x = this._timeScale.indexToCoordinate(i as any);
            if (x < 0 || x > width) continue;

            const timestamp = this._timestamps[i];
            const label = this._formatTime(timestamp, i);

            // Tick mark
            this._ctx.beginPath();
            this._ctx.moveTo(x, 0);
            this._ctx.lineTo(x, 4);
            this._ctx.stroke();

            // Label
            this._ctx.fillText(label, x, 8);
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
    }

    /**
     * Change the zone the axis labels are drawn in. Pass '' for browser local.
     * Bar data is absolute epoch ms, so nothing but the labels moves.
     */
    setTimezone(timezone: string): void {
        if (this._options.timezone === timezone) return;
        this._options.timezone = timezone;
        this._fmt = null;
        this._fmtTz = null;
        this.render();
    }

    get timezone(): string {
        return this._options.timezone;
    }

    /**
     * Calendar fields of an instant in the configured zone. With no timezone set
     * this uses the plain local getters, so the default path stays allocation-light
     * and behaves exactly as before.
     */
    private _parts(timestamp: number): TimeParts {
        const tz = this._options.timezone;
        const date = new Date(timestamp);
        if (!tz) {
            return {
                year: date.getFullYear(),
                month: date.getMonth(),
                day: date.getDate(),
                hour: date.getHours(),
                minute: date.getMinutes(),
            };
        }
        if (!this._fmt || this._fmtTz !== tz) {
            try {
                this._fmt = new Intl.DateTimeFormat('en-GB', {
                    timeZone: tz, hour12: false,
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                });
                this._fmtTz = tz;
            } catch (e) {
                // Unknown zone: fall back to local rather than throwing on every frame
                this._options.timezone = '';
                this._fmt = null;
                this._fmtTz = null;
                return this._parts(timestamp);
            }
        }
        const out: TimeParts = { year: 0, month: 0, day: 1, hour: 0, minute: 0 };
        for (const p of this._fmt.formatToParts(date)) {
            switch (p.type) {
                case 'year': out.year = parseInt(p.value, 10); break;
                case 'month': out.month = parseInt(p.value, 10) - 1; break;
                case 'day': out.day = parseInt(p.value, 10); break;
                case 'hour': out.hour = parseInt(p.value, 10) % 24; break;
                case 'minute': out.minute = parseInt(p.value, 10); break;
            }
        }
        return out;
    }

    private _formatTime(timestamp: number, index: number): string {
        const cur = this._parts(timestamp);

        // Compare against the previous bar to decide how much date context to show.
        // Resolved in the same zone as the label, so the day divider lands on the
        // configured zone's midnight rather than the browser's.
        const prevTimestamp = index > 0 ? this._timestamps[index - 1] : null;
        const prev = prevTimestamp === null ? null : this._parts(prevTimestamp);

        const isYearChange = prev === null || cur.year !== prev.year;
        const isMonthChange = prev === null || isYearChange || cur.month !== prev.month;
        const isDayChange = prev === null || isMonthChange || cur.day !== prev.day;

        if (isYearChange || index === 0) {
            return this._formatFullDate(cur);
        } else if (isMonthChange) {
            return this._formatMonthDay(cur);
        } else if (isDayChange) {
            return this._formatDayOnly(cur);
        } else {
            return this._formatTimeOnly(cur);
        }
    }

    private _formatFullDate(p: TimeParts): string {
        return `${p.day} ${this._getMonthShort(p.month)} '${p.year.toString().slice(-2)}`;
    }

    private _formatMonthDay(p: TimeParts): string {
        return `${p.day} ${this._getMonthShort(p.month)}`;
    }

    private _formatDayOnly(p: TimeParts): string {
        return `${p.day} ${this._getMonthShort(p.month)}`;
    }

    private _formatTimeOnly(p: TimeParts): string {
        const hours = p.hour.toString().padStart(2, '0');
        const minutes = p.minute.toString().padStart(2, '0');
        return `${hours}:${minutes}`;
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
