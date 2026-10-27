/**
 * Rectangle Drawing Implementation
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
    createVisibilityTab,
    colorRow,
    lineWidthRow,
    lineStyleRow,
    checkboxRow,
} from './drawing-settings-config';

import {
    createShapeStyle,
    restoreShapeStyle,
    getShapeSetting,
    setShapeSetting,
    shapeStyleSections,
    shapeAttributeBarItems,
    SHAPE_DEFAULTS,
} from './shape-common';

export interface RectangleOptions {
    color?: string;
    lineWidth?: number;
    lineDash?: number[];
    fillColor?: string;
    fillOpacity?: number;
}

/**
 * Rectangle - A 2-point shape defined by opposite corners
 */
export class RectangleDrawing implements Drawing, DrawingSettingsProvider {
    readonly id: string;
    readonly type: DrawingType = 'rectangle';

    points: DrawingPoint[] = [];
    style: DrawingStyle;
    state: DrawingState = 'creating';
    visible: boolean = true;
    locked: boolean = false;

    /** Kutuyu yatayda pencere kenarina uzat */
    extendLeft: boolean = false;
    extendRight: boolean = false;
    /** Yatay orta cizgi */
    middleLine = { show: false, color: SHAPE_DEFAULTS.rectangle.color, width: 1, style: 'dashed' };

    // Rectangle specific options
    constructor(options: RectangleOptions = {}) {
        this.id = generateDrawingId();
        this.style = createShapeStyle('rectangle', DEFAULT_DRAWING_STYLE, options);
    }

    // =========================================================================
    // DrawingSettingsProvider Implementation
    // =========================================================================

    getSettingsConfig(): DrawingSettingsConfig {
        return {
            tabs: [
                createStyleTab(shapeStyleSections([
                    {
                        title: 'Extend',
                        rows: [
                            checkboxRow('extendLeft', 'Extend left', false),
                            checkboxRow('extendRight', 'Extend right', false),
                        ]
                    },
                    {
                        title: 'Middle line',
                        rows: [
                            checkboxRow('middleShow', 'Show', false),
                            colorRow('middleColor', 'Color'),
                            lineWidthRow('middleWidth'),
                            lineStyleRow('middleStyle'),
                        ]
                    },
                ])),
                createVisibilityTab()
            ]
        };
    }

    getAttributeBarItems(): AttributeBarItem[] {
        return shapeAttributeBarItems();
    }

    getSettingValue(key: string): any {
        switch (key) {
            case 'visible': return this.visible;
            case 'extendLeft': return this.extendLeft;
            case 'extendRight': return this.extendRight;
            case 'middleShow': return this.middleLine.show;
            case 'middleColor': return this.middleLine.color;
            case 'middleWidth': return this.middleLine.width;
            case 'middleStyle': return this.middleLine.style;
        }
        return getShapeSetting(this.style, key);
    }

    setSettingValue(key: string, value: any): void {
        switch (key) {
            case 'visible': this.visible = value; return;
            case 'extendLeft': this.extendLeft = !!value; return;
            case 'extendRight': this.extendRight = !!value; return;
            case 'middleShow': this.middleLine.show = !!value; return;
            case 'middleColor': this.middleLine.color = value; return;
            case 'middleWidth': this.middleLine.width = value; return;
            case 'middleStyle': this.middleLine.style = value; return;
        }
        setShapeSetting(this.style, key, value);
    }

    /** Add a point to the drawing */
    addPoint(time: number, price: number): void {
        this.points.push({ time, price });

        if (this.points.length >= 2) {
            this.state = 'complete';
        }
    }

    /** Check if drawing is complete */
    isComplete(): boolean {
        return this.points.length >= 2;
    }

    /** Update the last point (during preview) */
    updateLastPoint(time: number, price: number): void {
        if (this.points.length > 0) {
            if (this.points.length === 1) {
                this.points.push({ time, price });
            } else {
                this.points[1] = { time, price };
            }
        }
    }

    // Cached pixel coordinates
    private _pixelPoints: { x: number; y: number }[] = [];

    /** Set cached pixel coordinates */
    setPixelPoints(points: { x: number; y: number }[]): void {
        this._pixelPoints = points;
    }

    /** Get pixel coordinates */
    getPixelPoints(): { x: number; y: number }[] {
        return this._pixelPoints;
    }

    /** Hit test on the rectangle border or body */
    hitTest(x: number, y: number, threshold: number = 5): boolean {
        if (this._pixelPoints.length < 2) return false;

        const p1 = this._pixelPoints[0];
        const p2 = this._pixelPoints[1];

        const minX = this.extendLeft ? -Infinity : Math.min(p1.x, p2.x);
        const maxX = this.extendRight ? Infinity : Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);

        // Check bounds first
        if (x < minX - threshold || x > maxX + threshold || y < minY - threshold || y > maxY + threshold) {
            return false;
        }

        // Check edges for border hit
        const onLeft = Math.abs(x - minX) <= threshold;
        const onRight = Math.abs(x - maxX) <= threshold;
        const onTop = Math.abs(y - minY) <= threshold;
        const onBottom = Math.abs(y - maxY) <= threshold;

        if ((onLeft || onRight) && y >= minY - threshold && y <= maxY + threshold) return true;
        if ((onTop || onBottom) && x >= minX - threshold && x <= maxX + threshold) return true;

        // Check internal fill if needed (usually hit test is mostly for selection, so fill works)
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) return true;

        return false;
    }

    getBounds(): { x: number; y: number; width: number; height: number } | null {
        if (this._pixelPoints.length < 2) return null;

        const p1 = this._pixelPoints[0];
        const p2 = this._pixelPoints[1];

        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    // =========================================================================
    // Serialization
    // =========================================================================

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
            middleLine: { ...this.middleLine },
        };
    }

    static fromJSON(data: SerializedDrawing): RectangleDrawing {
        const drawing = new RectangleDrawing();
        restoreShapeStyle(drawing.style, data.style);

        Object.defineProperty(drawing, 'id', { value: data.id, writable: false });
        drawing.points = [...data.points];
        drawing.state = data.state as DrawingState;
        drawing.visible = data.visible;
        drawing.locked = data.locked;
        drawing.extendLeft = !!data.extendLeft;
        drawing.extendRight = !!data.extendRight;
        if (data.middleLine) drawing.middleLine = { ...drawing.middleLine, ...data.middleLine };

        return drawing;
    }
}
