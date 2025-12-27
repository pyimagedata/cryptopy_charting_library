import { PriceScale } from '../model/price-scale';
import { coordinate } from '../model/coordinate';

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
}

const defaultPriceAxisOptions: PriceAxisWidgetOptions = {
    width: 80,
    backgroundColor: '#16213e',  // Darker navy (original panel bg)
    textColor: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

/**
 * Price axis widget - renders price scale labels
 */
export class PriceAxisWidget implements Disposable {
    private readonly _priceScale: PriceScale;
    private readonly _options: PriceAxisWidgetOptions;
    private _element: HTMLElement | null = null;
    private _canvas: HTMLCanvasElement | null = null;
    private _ctx: CanvasRenderingContext2D | null = null;
    private _height: number = 0;

    constructor(
        container: HTMLElement,
        priceScale: PriceScale,
        options: Partial<PriceAxisWidgetOptions> = {}
    ) {
        this._priceScale = priceScale;
        this._options = { ...defaultPriceAxisOptions, ...options };
        this._createElement(container);
    }

    get element(): HTMLElement | null {
        return this._element;
    }

    get canvas(): HTMLCanvasElement | null {
        return this._canvas;
    }

    get width(): number {
        return this._options.width;
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
        const width = this._options.width;
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
            this._ctx.fillText(mark.label, width - 8, y);

            // Small tick mark
            this._ctx.beginPath();
            this._ctx.moveTo(0, y);
            this._ctx.lineTo(4, y);
            this._ctx.stroke();
        }

        // Draw last value label
        if (this._lastValue) {
            const y = this._priceScale.priceToCoordinate(this._lastValue.price);
            this._drawLabel(y, this._lastValue.text, this._lastValue.color, true);
        }

        if (this._crosshairY !== null) {
            const price = this._priceScale.coordinateToPrice(coordinate(this._crosshairY));
            // Simple formatter, ideally passed from options or scale
            const text = price.toFixed(2);
            this._drawLabel(this._crosshairY, text, '#2962ff', false);
        }
    }

    private _drawLabel(y: number, text: string, color: string, isLastValue: boolean): void {
        if (!this._ctx || !this._element) return;
        const width = this._options.width;
        const height = this._height;

        // Allow slightly out of bounds
        if (y < -20 || y > height + 20) return;

        const padding = 8;
        this._ctx.font = `bold ${this._options.fontSize}px ${this._options.fontFamily}`;
        const textWidth = this._ctx.measureText(text).width;
        const boxHeight = 20;
        const boxWidth = textWidth + (padding * 2);
        const boxY = y - (boxHeight / 2);
        const boxX = width - boxWidth;

        // Background
        this._ctx.fillStyle = color;
        this._ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

        // Text
        this._ctx.fillStyle = '#ffffff';
        this._ctx.textAlign = 'center';
        this._ctx.fillText(text, boxX + (boxWidth / 2), y);

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

    private _lastValue: { price: number; text: string; color: string } | null = null;
    private _crosshairY: number | null = null;

    setLastValue(price: number, text: string, color: string): void {
        this._lastValue = { price, text, color };
    }

    setCrosshair(y: number, visible: boolean): void {
        this._crosshairY = visible ? y : null;
    }

    dispose(): void {
        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
        this._element = null;
        this._canvas = null;
        this._ctx = null;
    }

    private _createElement(container: HTMLElement): void {
        this._element = document.createElement('div');
        this._element.style.cssText = `
            width: ${this._options.width}px;
            height: 100%;
            flex-shrink: 0;
            position: relative;
        `;

        this._canvas = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;
        this._canvas.width = this._options.width * dpr;
        this._canvas.style.cssText = `
            width: ${this._options.width}px;
            height: 100%;
            display: block;
            cursor: ns-resize;
        `;

        this._ctx = this._canvas.getContext('2d');

        const onMouseMove = (e: MouseEvent) => {
            this._priceScale.scaleTo(e.clientY);
        };

        const onMouseUp = () => {
            this._priceScale.endScale();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        this._canvas.addEventListener('mousedown', (e: MouseEvent) => {
            this._priceScale.startScale(e.clientY);
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });

        this._element.appendChild(this._canvas);
        container.appendChild(this._element);
    }
}
