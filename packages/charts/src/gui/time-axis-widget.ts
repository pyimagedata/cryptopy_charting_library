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
}

const defaultTimeAxisOptions: TimeAxisWidgetOptions = {
    height: 28,
    backgroundColor: '#16213e',  // Darker navy (original panel bg)
    textColor: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontFamily: '-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif',
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

    dispose(): void {
        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
        this._element = null;
        this._canvas = null;
        this._ctx = null;
    }

    private _formatTime(timestamp: number, index: number): string {
        const date = new Date(timestamp);

        // Check if this is a new day (compare with previous bar)
        const prevTimestamp = index > 0 ? this._timestamps[index - 1] : null;
        const isDayChange = this._isDayChange(timestamp, prevTimestamp);
        const isMonthChange = this._isMonthChange(timestamp, prevTimestamp);
        const isYearChange = this._isYearChange(timestamp, prevTimestamp);

        // Format based on context
        if (isYearChange || index === 0) {
            // Show full date for year changes or first bar
            return this._formatFullDate(date);
        } else if (isMonthChange) {
            // Show month and day for month changes
            return this._formatMonthDay(date);
        } else if (isDayChange) {
            // Show day for day changes
            return this._formatDayOnly(date);
        } else {
            // Show time for same day
            return this._formatTimeOnly(date);
        }
    }

    private _isDayChange(current: number, previous: number | null): boolean {
        if (previous === null) return true;
        const currentDate = new Date(current);
        const prevDate = new Date(previous);
        return currentDate.getDate() !== prevDate.getDate() ||
            currentDate.getMonth() !== prevDate.getMonth() ||
            currentDate.getFullYear() !== prevDate.getFullYear();
    }

    private _isMonthChange(current: number, previous: number | null): boolean {
        if (previous === null) return true;
        const currentDate = new Date(current);
        const prevDate = new Date(previous);
        return currentDate.getMonth() !== prevDate.getMonth() ||
            currentDate.getFullYear() !== prevDate.getFullYear();
    }

    private _isYearChange(current: number, previous: number | null): boolean {
        if (previous === null) return true;
        const currentDate = new Date(current);
        const prevDate = new Date(previous);
        return currentDate.getFullYear() !== prevDate.getFullYear();
    }

    private _formatFullDate(date: Date): string {
        const day = date.getDate();
        const month = this._getMonthShort(date.getMonth());
        const year = date.getFullYear().toString().slice(-2);
        return `${day} ${month} '${year}`;
    }

    private _formatMonthDay(date: Date): string {
        const day = date.getDate();
        const month = this._getMonthShort(date.getMonth());
        return `${day} ${month}`;
    }

    private _formatDayOnly(date: Date): string {
        const day = date.getDate();
        const month = this._getMonthShort(date.getMonth());
        return `${day} ${month}`;
    }

    private _formatTimeOnly(date: Date): string {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    private _getMonthShort(month: number): string {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return months[month];
    }

    private _formatCrosshairTime(timestamp: number): string {
        const date = new Date(timestamp);
        const day = date.getDate();
        const month = this._getMonthShort(date.getMonth());
        const year = date.getFullYear();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${day} ${month} ${year}, ${hours}:${minutes}`;
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
