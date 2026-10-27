import {
    Drawing,
    DrawingType,
    DrawingPoint,
    DrawingStyle,
    DrawingState,
    SerializedDrawing,
    generateDrawingId,
    DEFAULT_DRAWING_STYLE
} from './drawing';
import {
    DrawingSettingsConfig,
    AttributeBarItem,
    createStyleTab,
    createVisibilityTab,
    colorRow,
    lineWidthRow,
    lineStyleRow,
    checkboxRow
} from './drawing-settings-config';
import {
    AxisLabelProvider,
    DrawingAxisLabels,
    lineStyleFromDash,
    dashFromLineStyle
} from './line-tool-common';

export class CrossLineDrawing implements Drawing, AxisLabelProvider {
    readonly id: string;
    readonly type: DrawingType = 'crossLine';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    /** Eksen etiketleri: fiyat ekseninde yatay cizginin, zaman ekseninde dikey cizginin etiketi */
    showPrice: boolean = true;
    showTime: boolean = true;

    // Cached pixel coordinates (updated by renderer)
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: { color?: string } = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#2962ff',
        };
    }

    /** Set cached pixel coordinates (called by renderer) */
    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = points;
    }

    addPoint(time: number, price: number): void {
        if (this.points.length < 1) {
            this.points.push({ time, price });
            // Cross Line is complete after 1 point
            this.state = 'complete';
        }
    }

    updateLastPoint(time: number, price: number): void {
        if (this.points.length > 0) {
            this.points[this.points.length - 1] = { time, price };
        }
    }

    isComplete(): boolean {
        return this.state === 'complete' && this.points.length >= 1;
    }

    hitTest(x: number, y: number, threshold: number = 5): boolean {
        if (this._pixelPoints.length < 1) return false;

        const p = this._pixelPoints[0];

        // Hit if close to vertical line (x distance) OR horizontal line (y distance)
        const hitVertical = Math.abs(x - p.x) <= threshold;
        const hitHorizontal = Math.abs(y - p.y) <= threshold;

        return hitVertical || hitHorizontal;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        // Bounds are infinite (cross extends to all edges)
        return null;
    }

    /** Fiyat ekseninde ve zaman ekseninde cizgi renginde etiketler */
    getAxisLabels(): DrawingAxisLabels {
        const p = this.points[0];
        if (!p) return { prices: [], times: [] };
        return {
            prices: this.showPrice ? [{ price: p.price, color: this.style.color }] : [],
            times: this.showTime ? [{ time: p.time, color: this.style.color }] : [],
        };
    }

    toJSON(): SerializedDrawing {
        return {
            id: this.id,
            type: this.type,
            points: this.points.map(pt => ({ ...pt })),
            style: { ...this.style, lineDash: this.style.lineDash ? [...this.style.lineDash] : this.style.lineDash },
            state: this.state,
            visible: this.visible,
            locked: this.locked,
            showPrices: this.showPrice,
            showLabels: this.showTime,
        };
    }

    static fromJSON(data: SerializedDrawing): CrossLineDrawing {
        const drawing = new CrossLineDrawing();
        (drawing as any).id = data.id;
        drawing.points = data.points.map(pt => ({ ...pt }));
        drawing.style = { ...data.style, lineDash: data.style.lineDash ? [...data.style.lineDash] : data.style.lineDash };
        drawing.state = data.state;
        drawing.visible = data.visible ?? true;
        drawing.locked = data.locked ?? false;
        // Eski kayitlarda alan yok: TradingView varsayilani (ikisi de acik)
        drawing.showPrice = data.showPrices !== false;
        drawing.showTime = data.showLabels !== false;
        return drawing;
    }

    // Settings Provider Implementation
    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab([
                    {
                        title: 'Cross Line',
                        rows: [
                            colorRow('color', 'Line Color'),
                            lineWidthRow('lineWidth'),
                            lineStyleRow('lineStyle'),
                        ]
                    },
                    {
                        title: 'Labels',
                        rows: [
                            checkboxRow('showPrice', 'Price label'),
                            checkboxRow('showTime', 'Time label'),
                        ]
                    }
                ]),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return [
            { type: 'color', key: 'color', tooltip: 'Line Color' },
            { type: 'lineWidth', key: 'lineWidth', tooltip: 'Line Width' },
            { type: 'lineStyle', key: 'lineStyle', tooltip: 'Line Style' },
        ];
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'color': return this.style.color;
            case 'lineWidth': return this.style.lineWidth;
            case 'lineStyle': return lineStyleFromDash(this.style.lineDash);
            case 'showPrice': return this.showPrice;
            case 'showTime': return this.showTime;
            case 'visible': return this.visible;
            default: return undefined;
        }
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'color':
                this.style.color = value;
                break;
            case 'lineWidth':
                this.style.lineWidth = value;
                break;
            case 'lineStyle': {
                const dash = dashFromLineStyle(value);
                if (dash) this.style.lineDash = dash;
                break;
            }
            case 'showPrice':
                this.showPrice = !!value;
                break;
            case 'showTime':
                this.showTime = !!value;
                break;
            case 'visible':
                this.visible = !!value;
                break;
        }
    }
}
