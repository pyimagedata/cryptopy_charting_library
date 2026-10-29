/**
 * Trend Line Drawing Implementation
 */

import {
    Drawing,
    DrawingPoint,
    DrawingStyle,
    DrawingState,
    DrawingType,
    DEFAULT_DRAWING_STYLE,
    generateDrawingId,
    SerializedDrawing
} from './drawing';

import {
    DrawingSettingsProvider,
    DrawingSettingsConfig,
    AttributeBarItem,
    createStyleTab,
    createVisibilityTab
} from './drawing-settings-config';

import {
    LineToolProps,
    createLineProps,
    getLineProp,
    setLineProp,
    isLineProp,
    serializeLineProps,
    deserializeLineProps,
    buildLineStyleSections,
    lineAxisLabels,
    DEFAULT_LINE_TOOL_PROPS,
    AxisLabelProvider,
    DrawingAxisLabels
} from './line-tool-common';

export interface TrendLineOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    extendLeft?: boolean;
    extendRight?: boolean;
}

/**
 * Trend Line - A line connecting two points on the chart
 */
export class TrendLineDrawing implements Drawing, DrawingSettingsProvider, AxisLabelProvider {
    readonly id: string;
    readonly type: DrawingType = 'trendLine';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    // Extension options
    extendLeft: boolean = false;
    extendRight: boolean = false;

    /** Ortak cizgi ozellikleri: uc sekilleri, orta nokta, fiyat etiketleri, istatistikler */
    lineProps: LineToolProps = createLineProps(undefined, this.getDefaultLineProps());

    // Cached pixel coordinates (updated by renderer)
    private _pixelPoints: { x: number; y: number }[] = [];

    constructor(options: TrendLineOptions = {}) {
        this.id = generateDrawingId();
        this.style = {
            ...DEFAULT_DRAWING_STYLE,
            color: options.color || '#2962ff',
            lineWidth: options.lineWidth || 2,
            lineDash: options.lineDash || [],
            // TradingView varsayilani: metin cizginin altinda (eski kayitlar fromJSON'da 'middle' kalir)
            textVAlign: 'bottom',
        };
        this.extendLeft = options.extendLeft || false;
        this.extendRight = options.extendRight || false;
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    /** Ayar bolumu basligi (ray / extendedLine alt siniflari degistirir) */
    protected getToolTitle(): string {
        return 'Trend Line';
    }

    /** Bu aracin varsayilan cizgi ozellikleri (Info Line / Arrow alt siniflari degistirir) */
    protected getDefaultLineProps(): Readonly<LineToolProps> {
        return DEFAULT_LINE_TOOL_PROPS;
    }

    /** Fiyat ekseni etiketleri (showPriceLabels); zaman etiketi yok */
    getAxisLabels(): DrawingAxisLabels {
        return { prices: lineAxisLabels(this.lineProps, this.points, this.style.color), times: [] };
    }

    /** Extend bolumu gosterilsin mi (ray / extendedLine'da sabit oldugu icin gizli) */
    protected allowExtendSettings(): boolean {
        return true;
    }

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab(buildLineStyleSections(this.getToolTitle(), this.allowExtendSettings())),
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
            case 'lineStyle':
                if (!this.style.lineDash || this.style.lineDash.length === 0) return 'solid';
                if (this.style.lineDash[0] === 6) return 'dashed';
                return 'dotted';
            case 'extendLeft': return this.extendLeft;
            case 'extendRight': return this.extendRight;
            case 'visible': return this.visible;
            default: return getLineProp(this.lineProps, key);
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
            case 'lineStyle':
                if (value === 'solid') this.style.lineDash = [];
                else if (value === 'dashed') this.style.lineDash = [6, 4];
                else if (value === 'dotted') this.style.lineDash = [2, 2];
                break;
            case 'extendLeft':
                this.extendLeft = value;
                break;
            case 'extendRight':
                this.extendRight = value;
                break;
            case 'visible':
                this.visible = value;
                break;
            default:
                if (isLineProp(key)) setLineProp(this.lineProps, key, value);
                break;
        }
    }

    /** Add a point to the drawing */
    addPoint(time: number, price: number): void {
        this.points.push({ time, price });

        // Trend line has exactly 2 points
        if (this.points.length >= 2) {
            this.state = 'complete';
        }
    }

    /** Update the last point (during drawing preview) */
    updateLastPoint(time: number, price: number): void {
        if (this.points.length > 0) {
            if (this.points.length === 1) {
                // Add second point as preview
                this.points.push({ time, price });
            } else {
                // Update existing second point
                this.points[1] = { time, price };
            }
        }
    }

    /** Set cached pixel coordinates (called by renderer) */
    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = points;
    }

    /** Get pixel coordinates */
    getPixelPoints(): { x: number; y: number }[] {
        return this._pixelPoints;
    }

    /**
     * Screen-sided extension flags used for drawing and hit testing (Extend left / right are screen sides).
     * Ray overrides this: it extends from p1 through p2 in the p1 -> p2 direction.
     */
    getScreenExtensions(_p1x: number, _p2x: number): { left: boolean; right: boolean } {
        return { left: this.extendLeft, right: this.extendRight };
    }

    /** Check if a pixel coordinate is near this line */
    hitTest(x: number, y: number, threshold: number = 5): boolean {
        if (this._pixelPoints.length < 2) return false;

        const p1 = this._pixelPoints[0];
        const p2 = this._pixelPoints[1];

        // Extensions apply to the screen-left / screen-right end (same rule as drawTrendLine)
        const ext = this.getScreenExtensions(p1.x, p2.x);
        const p1IsLeft = p1.x < p2.x;
        const extendP1 = p2.x !== p1.x && (p1IsLeft ? ext.left : ext.right);
        const extendP2 = p2.x !== p1.x && (p1IsLeft ? ext.right : ext.left);

        // Calculate distance from point to line segment (or half-line / line when extended)
        const distance = this._pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y, extendP1, extendP2);
        return distance <= threshold;
    }

    /** Get bounding box */
    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length < 2) return null;

        const xs = this._pixelPoints.map(p => p.x);
        const ys = this._pixelPoints.map(p => p.y);

        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    /** Calculate distance from point to line segment */
    private _pointToLineDistance(
        px: number, py: number,
        x1: number, y1: number,
        x2: number, y2: number,
        extendP1: boolean = false,
        extendP2: boolean = false
    ): number {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;

        let param = -1;
        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx: number, yy: number;

        if (param < 0 && !extendP1) {
            xx = x1;
            yy = y1;
        } else if (param > 1 && !extendP2) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;

        return Math.sqrt(dx * dx + dy * dy);
    }

    // =========================================================================
    // Serialization
    // =========================================================================

    /** Serialize drawing to JSON for persistence */
    toJSON(): SerializedDrawing {
        return {
            id: this.id,
            type: this.type,
            points: [...this.points],
            style: { ...this.style },
            state: this.state === 'selected' ? 'complete' : this.state,
            visible: this.visible,
            locked: this.locked,
            extendLeft: this.extendLeft,
            extendRight: this.extendRight,
            lineProps: serializeLineProps(this.lineProps),
            // Text properties
            text: this.style.text,
            textColor: this.style.textColor,
            fontSize: this.style.fontSize,
            fontWeight: this.style.fontWeight,
            fontStyle: this.style.fontStyle,
            textHAlign: this.style.textHAlign,
            textVAlign: this.style.textVAlign,
        };
    }

    /**
     * Kayitli veriyi (id, noktalar, durum, metin, lineProps) cizime uygular.
     * Eksik alanlar varsayilana duser; eski kayitlar degismeden yuklenir.
     */
    protected static applySerialized<T extends TrendLineDrawing>(drawing: T, data: SerializedDrawing): T {
        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });

        drawing.points = [...data.points];
        drawing.state = data.state;
        drawing.visible = data.visible;
        drawing.locked = data.locked;
        drawing.lineProps = deserializeLineProps(data.lineProps, drawing.getDefaultLineProps());

        // Restore text properties
        if (data.text) drawing.style.text = data.text;
        if (data.textColor) drawing.style.textColor = data.textColor;
        if (data.fontSize) drawing.style.fontSize = data.fontSize;
        if (data.fontWeight) drawing.style.fontWeight = data.fontWeight;
        if (data.fontStyle) drawing.style.fontStyle = data.fontStyle;
        if (data.textHAlign) drawing.style.textHAlign = data.textHAlign;
        // Alani olmayan eski kayitlar eski varsayilani (middle) korur
        drawing.style.textVAlign = data.textVAlign || 'middle';

        return drawing;
    }

    /** Create TrendLineDrawing from serialized data */
    static fromJSON(data: SerializedDrawing): TrendLineDrawing {
        const drawing = new TrendLineDrawing({
            color: data.style.color,
            lineWidth: data.style.lineWidth,
            lineDash: data.style.lineDash,
            extendLeft: data.extendLeft,
            extendRight: data.extendRight,
        });
        return TrendLineDrawing.applySerialized(drawing, data);
    }
}
