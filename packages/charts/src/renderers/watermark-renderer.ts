import { WatermarkOptions } from '../model/chart-model';

export interface BitmapCoordinatesScope {
    readonly context: CanvasRenderingContext2D;
    readonly mediaSize: { width: number; height: number };
    readonly bitmapSize: { width: number; height: number };
    readonly horizontalPixelRatio: number;
    readonly verticalPixelRatio: number;
}

/**
 * Watermark renderer
 */
export class WatermarkRenderer {
    private _options: WatermarkOptions;

    constructor(options: WatermarkOptions) {
        this._options = options;
    }

    updateOptions(options: WatermarkOptions): void {
        this._options = options;
    }

    draw(scope: BitmapCoordinatesScope): void {
        if (!this._options.visible || !this._options.text) return;

        const { context: ctx, mediaSize } = scope;
        const { width, height } = mediaSize;

        ctx.save();

        const fontSize = this._options.fontSize;
        ctx.font = `${fontSize}px ${this._options.fontFamily}`;
        ctx.fillStyle = this._options.color;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        // Calculate position based on alignment
        let x = width / 2;
        let y = height / 2;

        if (this._options.align === 'left') {
            x = 20;
            ctx.textAlign = 'left';
        } else if (this._options.align === 'right') {
            x = width - 20;
            ctx.textAlign = 'right';
        }

        if (this._options.vertAlign === 'top') {
            y = 20 + fontSize / 2;
        } else if (this._options.vertAlign === 'bottom') {
            y = height - 20 - fontSize / 2;
        }

        ctx.fillText(this._options.text, x, y);

        ctx.restore();
    }
}
