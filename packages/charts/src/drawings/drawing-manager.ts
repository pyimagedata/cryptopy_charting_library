/**
 * Drawing Manager - Manages all drawings on the chart
 */

import { Drawing, DrawingType, SerializedDrawing } from './drawing';
import { TrendLineDrawing } from './trend-line-drawing';
import { HorizontalLineDrawing } from './horizontal-line-drawing';
import { VerticalLineDrawing } from './vertical-line-drawing';
import { FibRetracementDrawing } from './fibonacci-retracement-drawing';
import { RayDrawing } from './ray-drawing';
import { InfoLineDrawing } from './info-line-drawing';
import { ExtendedLineDrawing } from './extended-line-drawing';
import { TrendAngleDrawing } from './trend-angle-drawing';
import { HorizontalRayDrawing } from './horizontal-ray-drawing';
import { CrossLineDrawing } from './cross-line-drawing';
import { StickerDrawing } from './sticker-drawing';
import { ParallelChannelDrawing } from './parallel-channel-drawing';
import { RegressionTrendDrawing } from './regression-trend-drawing';
import { FibExtensionDrawing } from './fibonacci-extension-drawing';
import { FibChannelDrawing } from './fib-channel-drawing';
import { BrushDrawing } from './brush-drawing';
import { HighlighterDrawing } from './highlighter-drawing';
import { ArrowDrawing } from './arrow-drawing';
import { ArrowMarkerDrawing } from './arrow-marker-drawing';
import { ArrowIconDrawing } from './arrow-icon-drawing';
import { RectangleDrawing } from './rectangle-drawing';
import { RotatedRectangleDrawing } from './rotated-rectangle-drawing';
import { EllipseDrawing } from './ellipse-drawing';
import { TriangleDrawing } from './triangle-drawing';
import { ArcDrawing } from './arc-drawing';
import { PathDrawing } from './path-drawing';
import { CircleDrawing } from './circle-drawing';
import { PolylineDrawing } from './polyline-drawing';
import { CurveDrawing } from './curve-drawing';
import { XABCDPatternDrawing } from './xabcd-pattern-drawing';
import { ElliottImpulseDrawing } from './elliott-impulse-drawing';
import { ElliottCorrectionDrawing } from './elliott-correction-drawing';
import { ThreeDrivesDrawing } from './three-drives-drawing';
import { HeadShouldersDrawing } from './head-shoulders-drawing';
import { ABCDPatternDrawing } from './abcd-pattern-drawing';
import { TrianglePatternDrawing } from './triangle-pattern-drawing';
import { LongPositionDrawing } from './long-position-drawing';
import { ShortPositionDrawing } from './short-position-drawing';
import { PriceRangeDrawing } from './price-range-drawing';
import { DateRangeDrawing } from './date-range-drawing';
import { DatePriceRangeDrawing } from './date-price-range-drawing';
import { TextDrawing } from './text-drawing';
import { CalloutDrawing } from './callout-drawing';
import { PriceLabelDrawing } from './price-label-drawing';
import { FlagMarkedDrawing } from './flag-marked-drawing';
import { Delegate } from '../helpers/delegate';
import { TimeScale } from '../model/time-scale';
import { PriceScale } from '../model/price-scale';
import { coordinate, timePointIndex } from '../model/coordinate';

export type DrawingMode = 'none' | DrawingType;

/**
 * Manages drawing creation, storage, and interaction
 */
export class DrawingManager {
    private _drawings: Map<string, Drawing> = new Map();
    private _activeDrawing: Drawing | null = null;
    private _selectedDrawing: Drawing | null = null;
    private _mode: DrawingMode = 'none';
    private _stickerContent: string = '😀';

    // References to scales for coordinate conversion
    private _timeScale: TimeScale | null = null;
    private _priceScale: PriceScale | null = null;

    // Events
    private readonly _drawingsChanged = new Delegate<void>();
    private readonly _modeChanged = new Delegate<DrawingMode>();
    private readonly _selectionChanged = new Delegate<Drawing | null>();

    // Hovered drawing for "Add Text" tooltip
    private _hoveredForAddText: string | null = null;

    // Magnet mode: 'none' | 'weak' | 'strong'
    private _magnetMode: 'none' | 'weak' | 'strong' = 'none';
    private _magnetThreshold: number = 30; // pixel distance for weak magnet
    private _isLocked: boolean = false;

    constructor() { }

    // --- Getters ---

    get mode(): DrawingMode {
        return this._mode;
    }

    get drawings(): Drawing[] {
        return Array.from(this._drawings.values());
    }

    get activeDrawing(): Drawing | null {
        return this._activeDrawing;
    }

    get selectedDrawing(): Drawing | null {
        return this._selectedDrawing;
    }

    get drawingsChanged(): Delegate<void> {
        return this._drawingsChanged;
    }

    get stickerContent(): string {
        return this._stickerContent;
    }

    set stickerContent(value: string) {
        this._stickerContent = value;
    }

    get modeChanged(): Delegate<DrawingMode> {
        return this._modeChanged;
    }

    get selectionChanged(): Delegate<Drawing | null> {
        return this._selectionChanged;
    }

    get hoveredForAddText(): string | null {
        return this._hoveredForAddText;
    }

    set hoveredForAddText(id: string | null) {
        this._hoveredForAddText = id;
    }

    get magnetMode(): 'none' | 'weak' | 'strong' {
        return this._magnetMode;
    }

    set magnetMode(mode: 'none' | 'weak' | 'strong') {
        this._magnetMode = mode;
    }

    get magnetThreshold(): number {
        return this._magnetThreshold;
    }

    get isLocked(): boolean {
        return this._isLocked;
    }

    set isLocked(value: boolean) {
        this._isLocked = value;
        // If locked, clear selection
        if (value && this._selectedDrawing) {
            this._selectedDrawing.state = 'complete';
            this._selectedDrawing = null;
            this._selectionChanged.fire(null);
        }
    }

    // --- Public Methods ---

    /** Set scale references for coordinate conversion */
    setScales(timeScale: TimeScale, priceScale: PriceScale): void {
        this._timeScale = timeScale;
        this._priceScale = priceScale;
    }

    /** Set drawing mode */
    setMode(mode: DrawingMode): void {
        if (this._mode === mode) return;

        // Cancel any active drawing
        if (this._activeDrawing) {
            this._drawings.delete(this._activeDrawing.id);
            this._activeDrawing = null;
        }

        this._mode = mode;
        this._modeChanged.fire(mode);
    }

    /** Start a new drawing at the given coordinates */
    startDrawing(x: number, y: number, snappedPrice?: number): void {
        if (this._mode === 'none') return;
        if (!this._timeScale || !this._priceScale) return;

        // Convert pixel to logical coordinates
        const time = this._pixelToTime(x);
        // Use snapped price if provided, otherwise convert from pixel
        const price = snappedPrice !== undefined ? snappedPrice : this._pixelToPrice(y);

        if (time === null || price === null) return;

        // Create drawing based on mode
        let drawing: Drawing | null = null;

        switch (this._mode) {
            case 'trendLine':
                drawing = new TrendLineDrawing();
                break;
            case 'horizontalLine':
                drawing = new HorizontalLineDrawing();
                break;
            case 'verticalLine':
                drawing = new VerticalLineDrawing();
                break;
            case 'fibRetracement':
                drawing = new FibRetracementDrawing();
                break;
            case 'ray':
                drawing = new RayDrawing();
                break;
            case 'infoLine':
                drawing = new InfoLineDrawing();
                break;
            case 'extendedLine':
                drawing = new ExtendedLineDrawing();
                break;
            case 'trendAngle':
                drawing = new TrendAngleDrawing();
                break;
            case 'horizontalRay':
                drawing = new HorizontalRayDrawing();
                break;
            case 'crossLine':
                drawing = new CrossLineDrawing();
                break;
            case 'parallelChannel':
                drawing = new ParallelChannelDrawing();
                break;
            case 'regressionTrend':
                drawing = new RegressionTrendDrawing();
                break;
            case 'fibExtension':
                drawing = new FibExtensionDrawing();
                break;
            case 'fibChannel':
                drawing = new FibChannelDrawing();
                break;
            case 'brush':
                drawing = new BrushDrawing();
                break;
            case 'highlighter':
                drawing = new HighlighterDrawing();
                break;
            case 'arrow':
                drawing = new ArrowDrawing();
                break;
            case 'arrowMarker':
                drawing = new ArrowMarkerDrawing();
                break;
            case 'arrowMarkedUp':
                drawing = new ArrowIconDrawing({ type: 'arrowMarkedUp' });
                break;
            case 'arrowMarkedDown':
                drawing = new ArrowIconDrawing({ type: 'arrowMarkedDown' });
                break;
            case 'rectangle':
                drawing = new RectangleDrawing();
                break;
            case 'rotatedRectangle':
                drawing = new RotatedRectangleDrawing();
                break;
            case 'ellipse':
                drawing = new EllipseDrawing();
                break;
            case 'triangle':
                drawing = new TriangleDrawing();
                break;
            case 'arc':
                drawing = new ArcDrawing();
                break;
            case 'path':
                drawing = new PathDrawing();
                break;
            case 'circle':
                drawing = new CircleDrawing();
                break;
            case 'polyline':
                drawing = new PolylineDrawing();
                break;
            case 'curve':
                drawing = new CurveDrawing();
                break;
            case 'xabcdPattern':
                drawing = new XABCDPatternDrawing();
                break;
            case 'elliotImpulse':
                drawing = new ElliottImpulseDrawing();
                break;
            case 'elliotCorrection':
                drawing = new ElliottCorrectionDrawing();
                break;
            case 'threeDrives':
                drawing = new ThreeDrivesDrawing();
                break;
            case 'headShoulders':
                drawing = new HeadShouldersDrawing();
                break;
            case 'abcd':
                drawing = new ABCDPatternDrawing();
                break;
            case 'trianglePattern':
                drawing = new TrianglePatternDrawing();
                break;
            case 'longPosition': {
                // Calculate dynamic profit/stop percentages based on visible price range
                let profitPercent = 3;  // default
                let stopPercent = 1.5;  // default

                if (this._priceScale) {
                    const visibleRange = this._priceScale.priceRange;
                    if (visibleRange) {
                        const rangeSize = Math.abs(visibleRange.max - visibleRange.min);
                        const midPrice = (visibleRange.max + visibleRange.min) / 2;
                        // Target: ~30% of visible range, Stop: ~15% of visible range
                        profitPercent = (rangeSize * 0.30 / midPrice) * 100;
                        stopPercent = (rangeSize * 0.15 / midPrice) * 100;
                    }
                }

                drawing = new LongPositionDrawing({ profitPercent, stopPercent });
                break;
            }
            case 'shortPosition': {
                // Calculate dynamic profit/stop percentages based on visible price range
                let profitPercent = 3;  // default
                let stopPercent = 1.5;  // default

                if (this._priceScale) {
                    const visibleRange = this._priceScale.priceRange;
                    if (visibleRange) {
                        const rangeSize = Math.abs(visibleRange.max - visibleRange.min);
                        const midPrice = (visibleRange.max + visibleRange.min) / 2;
                        // Target: ~30% of visible range, Stop: ~15% of visible range
                        profitPercent = (rangeSize * 0.30 / midPrice) * 100;
                        stopPercent = (rangeSize * 0.15 / midPrice) * 100;
                    }
                }

                drawing = new ShortPositionDrawing({ profitPercent, stopPercent });
                break;
            }
            case 'priceRange':
                drawing = new PriceRangeDrawing();
                break;
            case 'dateRange':
                drawing = new DateRangeDrawing();
                break;
            case 'datePriceRange':
                drawing = new DatePriceRangeDrawing();
                break;
            case 'text':
                drawing = new TextDrawing();
                break;
            case 'callout':
                drawing = new CalloutDrawing();
                break;
            case 'priceLabel':
                drawing = new PriceLabelDrawing();
                break;
            case 'flagMarked':
                drawing = new FlagMarkedDrawing();
                break;
            case 'sticker':
                drawing = new StickerDrawing();
                (drawing as StickerDrawing).content = this._stickerContent;
                break;
            // Add more types here...
            default:
                console.warn(`Drawing type not implemented: ${this._mode}`);
                return;
        }

        if (drawing) {
            drawing.addPoint(time, price);
            this._drawings.set(drawing.id, drawing);

            // If drawing is complete after first point (single-point drawings), finish immediately
            // If drawing is complete after first point (single-point drawings), finish immediately
            if (drawing.isComplete?.()) {
                this.setMode('none');
                this._selectedDrawing = drawing;
                drawing.state = 'selected';
                this._selectionChanged.fire(drawing);
                this._activeDrawing = null;
            } else {
                this._activeDrawing = drawing;
            }

            this._drawingsChanged.fire();
        }
    }

    /** Update active drawing preview */
    updateDrawing(x: number, y: number, snappedPrice?: number): void {
        if (!this._activeDrawing) return;
        if (!this._timeScale || !this._priceScale) return;

        const time = this._pixelToTime(x);
        const price = snappedPrice !== undefined ? snappedPrice : this._pixelToPrice(y);

        if (time === null || price === null) return;

        // Update the drawing's preview point (works for TrendLine, FibRetracement, etc.)
        if ('updateLastPoint' in this._activeDrawing) {
            (this._activeDrawing as { updateLastPoint: (t: number, p: number) => void }).updateLastPoint(time, price);
            this._drawingsChanged.fire();
        }
    }

    /** Finish the current drawing */
    finishDrawing(x: number, y: number, snappedPrice?: number): void {
        if (!this._activeDrawing) return;
        if (!this._timeScale || !this._priceScale) return;

        const time = this._pixelToTime(x);
        const price = snappedPrice !== undefined ? snappedPrice : this._pixelToPrice(y);

        if (time === null || price === null) return;

        // Handle two-point drawings
        if (this._activeDrawing.type === 'trendLine' ||
            this._activeDrawing.type === 'fibRetracement' ||
            this._activeDrawing.type === 'ray' ||
            this._activeDrawing.type === 'infoLine' ||
            this._activeDrawing.type === 'extendedLine' ||
            this._activeDrawing.type === 'trendAngle' ||
            this._activeDrawing.type === 'regressionTrend' ||
            this._activeDrawing.type === 'longPosition' ||
            this._activeDrawing.type === 'shortPosition' ||
            this._activeDrawing.type === 'priceRange' ||
            this._activeDrawing.type === 'dateRange' ||
            this._activeDrawing.type === 'datePriceRange' ||
            this._activeDrawing.type === 'callout') {

            const drawing = this._activeDrawing as any;
            if (drawing.points.length < 2) {
                drawing.addPoint(time, price);
            } else {
                if (typeof drawing.updateLastPoint === 'function') {
                    drawing.updateLastPoint(time, price);
                } else {
                    drawing.points[1] = { time, price };
                }
                drawing.state = 'complete';
            }
        }

        // Handle single-point drawings
        if (this._activeDrawing.type === 'text' ||
            this._activeDrawing.type === 'sticker' ||
            this._activeDrawing.type === 'arrowMarkedUp' ||
            this._activeDrawing.type === 'arrowMarkedDown' ||
            this._activeDrawing.type === 'priceLabel' ||
            this._activeDrawing.type === 'flagMarked') {

            const drawing = this._activeDrawing as any;
            if (drawing.points.length === 0) {
                drawing.addPoint(time, price);
            }
            drawing.state = 'complete';
        }

        // Handle curve drawing (2 clicks -> 3 points with auto middle control point)
        if (this._activeDrawing.type === 'curve') {
            const curveDrawing = this._activeDrawing as CurveDrawing;

            // Finalize the curve on second click
            if (curveDrawing.points.length >= 3) {
                curveDrawing.finalizeCurve(time, price);
                this._selectedDrawing = curveDrawing;
                curveDrawing.state = 'selected';
                this._selectionChanged.fire(curveDrawing);
                this._activeDrawing = null;
                this._mode = 'none';
                this._modeChanged.fire('none');
                this._drawingsChanged.fire();
                return;
            }
        }

        // Handle three-point drawings (ParallelChannel, FibExtension, FibChannel, RotatedRectangle, Ellipse)
        if (this._activeDrawing.type === 'parallelChannel' || this._activeDrawing.type === 'fibExtension' || this._activeDrawing.type === 'fibChannel' || this._activeDrawing.type === 'rotatedRectangle' || this._activeDrawing.type === 'ellipse' || this._activeDrawing.type === 'triangle' || this._activeDrawing.type === 'arc') {
            const drawing = this._activeDrawing as any; // Use any for flexibility with confirmPreviewPoint

            // First, finalize the preview point position
            const currentPointCount = drawing.points.length;

            // Confirm the current preview point (if any) becomes permanent
            if (typeof drawing.confirmPreviewPoint === 'function') {
                drawing.confirmPreviewPoint();
            }

            // Update the last point position to final click position
            if (currentPointCount > 0) {
                drawing.points[currentPointCount - 1] = { time, price };
            }

            // Check if we have all 3 points
            if (currentPointCount >= 3) {
                drawing.state = 'complete';
                // Fall through to finish the drawing
            } else {
                // Still need more points, keep drawing active
                this._drawingsChanged.fire();
                return;
            }
        }

        // Handle multi-point patterns (XABCD, Elliott, Three Drives, ABCD)
        if (this._activeDrawing.type === 'xabcdPattern' ||
            this._activeDrawing.type === 'elliotImpulse' ||
            this._activeDrawing.type === 'elliotCorrection' ||
            this._activeDrawing.type === 'threeDrives' ||
            this._activeDrawing.type === 'headShoulders' ||
            this._activeDrawing.type === 'abcd' ||
            this._activeDrawing.type === 'trianglePattern') {
            const patternDrawing = this._activeDrawing as XABCDPatternDrawing | ElliottImpulseDrawing | ElliottCorrectionDrawing | ThreeDrivesDrawing | HeadShouldersDrawing | ABCDPatternDrawing | TrianglePatternDrawing;

            // If there's a preview point, confirm it and update to click position
            if (patternDrawing.points.length > 0) {
                // Update the last point to exact click position
                const lastIdx = patternDrawing.points.length - 1;
                patternDrawing.points[lastIdx] = { time, price };

                // Confirm the preview (reset preview index)
                if (typeof patternDrawing.confirmPreviewPoint === 'function') {
                    patternDrawing.confirmPreviewPoint();
                }
            }

            // Check if drawing is complete (5 for XABCD, 6 for Elliott Impulse, 4 for Correction, 7 for Three Drives)
            let requiredPoints = 5;
            if (this._activeDrawing.type === 'elliotImpulse') requiredPoints = 6;
            else if (this._activeDrawing.type === 'elliotCorrection') requiredPoints = 4;
            else if (this._activeDrawing.type === 'threeDrives') requiredPoints = 7;
            else if (this._activeDrawing.type === 'headShoulders') requiredPoints = 7;
            else if (this._activeDrawing.type === 'abcd') requiredPoints = 4;
            else if (this._activeDrawing.type === 'trianglePattern') requiredPoints = 4;
            if (patternDrawing.points.length >= requiredPoints) {
                patternDrawing.state = 'complete';
                this._selectedDrawing = patternDrawing;
                patternDrawing.state = 'selected';
                this._selectionChanged.fire(patternDrawing);
                this._activeDrawing = null;
                this._mode = 'none';
                this._modeChanged.fire('none');
                this._drawingsChanged.fire();
                return;
            }

            // Still need more points - trigger preview for next point
            this._drawingsChanged.fire();
            return;
        }

        // Handle path drawing (multi-point polyline - click adds points, ESC finishes)
        if (this._activeDrawing.type === 'path') {
            const pathDrawing = this._activeDrawing as any;

            // Confirm current preview point
            if (typeof pathDrawing.confirmPreviewPoint === 'function') {
                pathDrawing.confirmPreviewPoint();
            }

            // Path keeps adding points - never auto-completes
            // User must press ESC to finish
            this._drawingsChanged.fire();
            return;
        }

        // Handle polyline drawing (click adds points, click on start closes, ESC finishes open)
        if (this._activeDrawing.type === 'polyline') {
            const polylineDrawing = this._activeDrawing as PolylineDrawing;

            // Check if clicking near start point to close the shape
            if (polylineDrawing.points.length >= 3 && polylineDrawing.isNearStartPoint(x, y)) {
                polylineDrawing.closeShape();
                this._selectedDrawing = polylineDrawing;
                polylineDrawing.state = 'selected';
                this._selectionChanged.fire(polylineDrawing);
                this._activeDrawing = null;
                this._mode = 'none';
                this._modeChanged.fire('none');
                this._drawingsChanged.fire();
                return;
            }

            // Confirm current preview point
            if (typeof polylineDrawing.confirmPreviewPoint === 'function') {
                polylineDrawing.confirmPreviewPoint();
            }

            // Polyline keeps adding points - never auto-completes
            // User must press ESC to finish or click on start to close
            this._drawingsChanged.fire();
            return;
        }

        // Handle brush and highlighter drawing (finish stroke on mouse up)
        if (this._activeDrawing.type === 'brush' || this._activeDrawing.type === 'highlighter') {
            const pathDrawing = this._activeDrawing as (BrushDrawing | HighlighterDrawing);
            pathDrawing.finishStroke();
            // Keep drawing mode active - don't return to cursor mode
            // User can continue drawing more strokes
            this._activeDrawing = null;
            this._drawingsChanged.fire();
            return; // Don't change mode
        }

        const finishedDrawing = this._activeDrawing;
        this._activeDrawing = null;
        this.setMode('none');  // Return to cursor mode after drawing

        if (finishedDrawing) {
            this._selectedDrawing = finishedDrawing;
            finishedDrawing.state = 'selected';
            this._selectionChanged.fire(finishedDrawing);
        }

        this._drawingsChanged.fire();
    }

    /** Select a drawing at the given coordinates */
    selectDrawingAt(x: number, y: number): Drawing | null {
        for (const drawing of this._drawings.values()) {
            // Don't select the drawing we're currently creating
            if (drawing === this._activeDrawing && drawing.state === 'creating') {
                continue;
            }

            // Update pixel points for accurate hit testing of position and range drawings
            if (drawing.type === 'longPosition' || drawing.type === 'shortPosition' || drawing.type === 'priceRange' || drawing.type === 'dateRange' || drawing.type === 'datePriceRange') {
                if (drawing.points.length >= 2) {
                    const p1 = drawing.points[0];
                    const p2 = drawing.points[1];
                    const x1 = this.timeToPixel(p1.time);
                    const y1 = this.priceToPixel(p1.price);
                    const x2 = this.timeToPixel(p2.time);
                    const y2 = this.priceToPixel(p2.price);
                    if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
                        (drawing as any).setPixelPoints([{ x: x1, y: y1 }, { x: x2, y: y2 }]);
                    }
                }
            }

            if (drawing.hitTest(x, y, 8)) {
                this._selectedDrawing = drawing;
                drawing.state = 'selected';
                this._selectionChanged.fire(drawing);
                this._drawingsChanged.fire();
                return drawing;
            }
        }

        // No drawing found, clear selection
        if (this._selectedDrawing) {
            this._selectedDrawing.state = 'complete';
            this._selectedDrawing = null;
            this._selectionChanged.fire(null);
            this._drawingsChanged.fire();
        }

        return null;
    }

    /** Delete a drawing */
    deleteDrawing(id: string): void {
        const drawing = this._drawings.get(id);
        if (drawing) {
            this._drawings.delete(id);
            if (this._selectedDrawing === drawing) {
                this._selectedDrawing = null;
                this._selectionChanged.fire(null);
            }
            this._drawingsChanged.fire();
        }
    }

    /** Delete selected drawing */
    deleteSelected(): void {
        if (this._selectedDrawing) {
            this.deleteDrawing(this._selectedDrawing.id);
        }
    }

    /** Delete all drawings */
    deleteAll(): void {
        this._drawings.clear();
        this._activeDrawing = null;
        this._selectedDrawing = null;
        this._selectionChanged.fire(null);
        this._drawingsChanged.fire();
    }

    /** Finish path drawing (called when ESC is pressed during path creation) */
    finishPathDrawing(): void {
        if (!this._activeDrawing || this._activeDrawing.type !== 'path') return;

        const pathDrawing = this._activeDrawing as any;
        if (typeof pathDrawing.finishPath === 'function') {
            pathDrawing.finishPath();
        }

        // Keep the drawing if it has at least 2 points
        if (pathDrawing.points.length >= 2) {
            pathDrawing.state = 'complete';
        } else {
            // Not enough points - remove the drawing
            this._drawings.delete(this._activeDrawing.id);
        }

        this._activeDrawing = null;
        this._mode = 'none';
        this._modeChanged.fire('none');
        this._drawingsChanged.fire();
    }

    /** Finish polyline drawing (called when ESC is pressed during polyline creation) */
    finishPolylineDrawing(): void {
        if (!this._activeDrawing || this._activeDrawing.type !== 'polyline') return;

        const polylineDrawing = this._activeDrawing as PolylineDrawing;
        if (typeof polylineDrawing.finishPolyline === 'function') {
            polylineDrawing.finishPolyline();
        }

        // Keep the drawing if it has at least 2 points
        if (polylineDrawing.points.length >= 2) {
            polylineDrawing.state = 'complete';
        } else {
            // Not enough points - remove the drawing
            this._drawings.delete(this._activeDrawing.id);
        }

        const finishedDrawing = this._activeDrawing;
        this._activeDrawing = null;
        this._mode = 'none';
        this._modeChanged.fire('none');

        if (finishedDrawing && finishedDrawing.state === 'complete') {
            this._selectedDrawing = finishedDrawing;
            finishedDrawing.state = 'selected';
            this._selectionChanged.fire(finishedDrawing);
        }

        this._drawingsChanged.fire();
    }

    /** Move the selected drawing by a pixel delta */
    moveDrawing(deltaX: number, deltaY: number): void {
        if (!this._selectedDrawing) return;
        if (!this._timeScale || !this._priceScale) return;

        // Convert pixel deltas to logical deltas
        // Get current first point's pixel position
        const firstPoint = this._selectedDrawing.points[0];
        if (!firstPoint) return;

        const currentX = this.timeToPixel(firstPoint.time);
        const currentY = this.priceToPixel(firstPoint.price);
        if (currentX === null || currentY === null) return;

        // Calculate new positions
        const newX = currentX + deltaX;
        const newY = currentY + deltaY;

        // Convert back to logical coordinates
        const newTime = this._pixelToTime(newX);
        const newPrice = this._pixelToPrice(newY);
        if (newTime === null || newPrice === null) return;

        // Calculate the delta in logical coordinates
        const timeDelta = newTime - firstPoint.time;
        const priceDelta = newPrice - firstPoint.price;

        // Apply delta to all points
        for (const point of this._selectedDrawing.points) {
            point.time += timeDelta;
            point.price += priceDelta;
        }

        this._drawingsChanged.fire();
    }

    private _timestamps: number[] = [];

    /** Update timestamps for coordinate conversion */
    setTimestamps(timestamps: number[]): void {
        this._timestamps = timestamps;
    }

    /** Move a specific control point of the selected drawing to new pixel position */
    moveControlPoint(pointIndex: number, x: number, y: number, snappedPrice?: number): void {
        if (!this._selectedDrawing) return;

        if (this._selectedDrawing.type === 'longPosition') {
            const posDrawing = this._selectedDrawing as LongPositionDrawing;
            const time = this._pixelToTime(x);
            const price = snappedPrice !== undefined ? snappedPrice : this._pixelToPrice(y);
            if (time === null || price === null) return;

            const entryPrice = posDrawing.getEntryPrice();

            if (pointIndex === 0) {
                // Left point - move entry time (left edge)
                posDrawing.points[0] = { time, price: entryPrice };
            } else if (pointIndex === 1) {
                // Right point - move right edge time
                posDrawing.points[1] = { time, price: entryPrice };
            } else if (pointIndex === 2) {
                // Target point - update profit percentage
                if (price > entryPrice) {
                    const newProfitPercent = ((price - entryPrice) / entryPrice) * 100;
                    posDrawing.profitPercent = newProfitPercent;
                }
            } else if (pointIndex === 3) {
                // Stop point - update stop percentage
                if (price < entryPrice) {
                    const newStopPercent = ((entryPrice - price) / entryPrice) * 100;
                    posDrawing.stopPercent = newStopPercent;
                }
            }

            this._drawingsChanged.fire();
            return;
        }

        if (this._selectedDrawing.type === 'shortPosition') {
            const posDrawing = this._selectedDrawing as ShortPositionDrawing;
            const time = this._pixelToTime(x);
            const price = snappedPrice !== undefined ? snappedPrice : this._pixelToPrice(y);
            if (time === null || price === null) return;

            const entryPrice = posDrawing.getEntryPrice();

            if (pointIndex === 0) {
                // Left point - move entry time (left edge)
                posDrawing.points[0] = { time, price: entryPrice };
            } else if (pointIndex === 1) {
                // Right point - move right edge time
                posDrawing.points[1] = { time, price: entryPrice };
            } else if (pointIndex === 2) {
                // Target point - update profit percentage (down for short)
                if (price < entryPrice) {
                    const newProfitPercent = ((entryPrice - price) / entryPrice) * 100;
                    posDrawing.profitPercent = newProfitPercent;
                }
            } else if (pointIndex === 3) {
                // Stop point - update stop percentage (up for short)
                if (price > entryPrice) {
                    const newStopPercent = ((price - entryPrice) / entryPrice) * 100;
                    posDrawing.stopPercent = newStopPercent;
                }
            }

            this._drawingsChanged.fire();
            return;
        }

        if (pointIndex < 0 || pointIndex >= this._selectedDrawing.points.length) return;

        // Convert pixel to logical coordinates
        const time = this._pixelToTime(x);
        const price = snappedPrice !== undefined ? snappedPrice : this._pixelToPrice(y);
        if (time === null || price === null) return;

        // Update the specific point
        this._selectedDrawing.points[pointIndex] = { time, price };

        // Check if polyline should close: last point moved near start point
        if (this._selectedDrawing.type === 'polyline') {
            const polyline = this._selectedDrawing as PolylineDrawing;
            const lastPointIndex = polyline.points.length - 1;

            // If we're moving the last point and it's near the start
            if (pointIndex === lastPointIndex && !polyline.isClosed && polyline.points.length >= 3) {
                if (polyline.isNearStartPoint(x, y)) {
                    // Snap last point to start point and close the shape
                    polyline.points[lastPointIndex] = { ...polyline.points[0] };
                    polyline.isClosed = true;
                }
            }
        }

        // Scale curve middle point proportionally when endpoints move
        if (this._selectedDrawing.type === 'curve' && this._selectedDrawing.points.length >= 3) {
            const curve = this._selectedDrawing as CurveDrawing;

            // Only scale when moving endpoints (0 or 2), not middle point (1)
            if (pointIndex === 0 || pointIndex === 2) {
                const p0 = curve.points[0];
                const p2 = curve.points[2];

                // Calculate new midpoint on line between endpoints
                const newLineMidTime = (p0.time + p2.time) / 2;
                const newLineMidPrice = (p0.price + p2.price) / 2;

                // Get the relative offset of middle point from line midpoint
                // Scale based on new distance between endpoints
                const newDistance = Math.abs(p2.price - p0.price);
                const offsetRatio = 0.15; // Same ratio used in creation
                const priceOffset = newDistance * offsetRatio || (Math.max(p0.price, p2.price) * 0.01);

                // Keep middle point at proportional position
                curve.points[1] = {
                    time: newLineMidTime,
                    price: newLineMidPrice - priceOffset
                };
            }
        }

        this._drawingsChanged.fire();
    }

    /** Convert pixel X to time (timestamp) */
    private _pixelToTime(x: number): number | null {
        if (!this._timeScale || this._timestamps.length === 0) return null;

        // Get bar index from X coordinate
        const barIndex = this._timeScale.coordinateToIndex(coordinate(x));
        if (barIndex === null) return null;

        // Convert index to timestamp
        const index = Math.round(barIndex as number);
        if (index >= 0 && index < this._timestamps.length) {
            return this._timestamps[index];
        }

        // Extrapolate if outside range (basic linear extrapolation assuming constant interval)
        if (this._timestamps.length >= 2) {
            const lastIndex = this._timestamps.length - 1;
            const interval = this._timestamps[lastIndex] - this._timestamps[lastIndex - 1];
            if (index < 0) {
                return this._timestamps[0] + (index * interval);
            } else {
                return this._timestamps[lastIndex] + ((index - lastIndex) * interval);
            }
        }

        return null;
    }

    /** Convert pixel Y to price */
    private _pixelToPrice(y: number): number | null {
        if (!this._priceScale) return null;
        return this._priceScale.coordinateToPrice(coordinate(y));
    }

    /** Convert time (timestamp) to pixel X */
    timeToPixel(time: number): number | null {
        if (!this._timeScale || this._timestamps.length === 0) return null;

        // Find index for timestamp
        const index = this._timestampToIndex(time);
        if (index === null) return null;

        return this._timeScale.indexToCoordinate(timePointIndex(index));
    }

    /** Convert price to pixel Y */
    priceToPixel(price: number): number | null {
        if (!this._priceScale) return null;
        return this._priceScale.priceToCoordinate(price);
    }

    /** Binary search to find index for timestamp */
    private _timestampToIndex(time: number): number | null {
        if (this._timestamps.length === 0) return null;

        // Check bounds
        if (time < this._timestamps[0]) {
            // Extrapolate backwards
            if (this._timestamps.length >= 2) {
                const interval = this._timestamps[1] - this._timestamps[0];
                const diff = this._timestamps[0] - time;
                const indexDiff = diff / interval;
                return -indexDiff;
            }
            return 0; // Fallback
        }

        const lastIndex = this._timestamps.length - 1;
        if (time > this._timestamps[lastIndex]) {
            // Extrapolate forwards
            if (this._timestamps.length >= 2) {
                const interval = this._timestamps[lastIndex] - this._timestamps[lastIndex - 1];
                const diff = time - this._timestamps[lastIndex];
                const indexDiff = diff / interval;
                return lastIndex + indexDiff;
            }
            return lastIndex;
        }

        // Binary search
        let left = 0;
        let right = this._timestamps.length - 1;
        let closestIndex = 0;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            if (this._timestamps[mid] === time) {
                return mid;
            }

            if (this._timestamps[mid] < time) {
                closestIndex = mid; // Candidate for lower bound
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        // Interpolate between closestIndex and closestIndex + 1 to get fractional index
        // accurate positioning requires fractional index
        const idx1 = closestIndex;
        const idx2 = idx1 + 1;

        if (idx2 < this._timestamps.length) {
            const t1 = this._timestamps[idx1];
            const t2 = this._timestamps[idx2];
            const load = (time - t1) / (t2 - t1);
            return idx1 + load;
        }

        return idx1;
    }

    // =========================================================================
    // Serialization - Chart State Persistence
    // =========================================================================

    /** Serialize all drawings to JSON for persistence */
    serialize(): SerializedDrawing[] {
        const serialized: SerializedDrawing[] = [];

        for (const drawing of this._drawings.values()) {
            // Only save complete drawings (not in-progress ones)
            if (drawing.state === 'creating') continue;
            serialized.push(drawing.toJSON());
        }

        return serialized;
    }

    /** Deserialize drawings from JSON and add them to the chart */
    deserialize(data: SerializedDrawing[]): void {
        // Clear all existing drawings first
        this._drawings.clear();
        this._activeDrawing = null;
        this._selectedDrawing = null;

        for (const item of data) {
            let drawing: Drawing | null = null;

            switch (item.type) {
                case 'trendLine':
                    drawing = TrendLineDrawing.fromJSON(item);
                    break;
                case 'horizontalLine':
                    drawing = HorizontalLineDrawing.fromJSON(item);
                    break;
                case 'verticalLine':
                    drawing = VerticalLineDrawing.fromJSON(item);
                    break;
                case 'fibRetracement':
                    drawing = FibRetracementDrawing.fromJSON(item);
                    break;
                case 'ray':
                    drawing = RayDrawing.fromJSON(item);
                    break;
                case 'infoLine':
                    drawing = InfoLineDrawing.fromJSON(item);
                    break;
                case 'extendedLine':
                    drawing = ExtendedLineDrawing.fromJSON(item);
                    break;
                case 'trendAngle':
                    drawing = TrendAngleDrawing.fromJSON(item);
                    break;
                case 'horizontalRay':
                    drawing = HorizontalRayDrawing.fromJSON(item);
                    break;
                case 'crossLine':
                    drawing = CrossLineDrawing.fromJSON(item);
                    break;
                case 'sticker':
                    drawing = StickerDrawing.fromJSON(item as any);
                    break;
                case 'parallelChannel':
                    drawing = ParallelChannelDrawing.fromJSON(item);
                    break;
                case 'regressionTrend':
                    drawing = RegressionTrendDrawing.fromJSON(item);
                    break;
                case 'fibExtension':
                    drawing = FibExtensionDrawing.fromJSON(item);
                    break;
                case 'fibChannel':
                    drawing = FibChannelDrawing.fromJSON(item);
                    break;
                case 'brush':
                    drawing = BrushDrawing.fromJSON(item);
                    break;
                case 'highlighter':
                    drawing = HighlighterDrawing.fromJSON(item);
                    break;
                case 'arrow':
                    drawing = ArrowDrawing.fromJSON(item);
                    break;
                case 'arrowMarker':
                    drawing = ArrowMarkerDrawing.fromJSON(item);
                    break;
                case 'arrowMarkedUp':
                case 'arrowMarkedDown':
                    drawing = ArrowIconDrawing.fromJSON(item);
                    break;
                case 'rectangle':
                    drawing = RectangleDrawing.fromJSON(item);
                    break;
                case 'rotatedRectangle':
                    drawing = RotatedRectangleDrawing.fromJSON(item);
                    break;
                case 'ellipse':
                    drawing = EllipseDrawing.fromJSON(item);
                    break;
                case 'triangle':
                    drawing = TriangleDrawing.fromJSON(item);
                    break;
                case 'arc':
                    drawing = ArcDrawing.fromJSON(item);
                    break;
                case 'path':
                    drawing = PathDrawing.fromJSON(item);
                    break;
                case 'circle':
                    drawing = CircleDrawing.fromJSON(item);
                    break;
                case 'polyline':
                    drawing = PolylineDrawing.fromJSON(item);
                    break;
                case 'curve':
                    drawing = CurveDrawing.fromJSON(item);
                    break;
                case 'xabcdPattern':
                    drawing = XABCDPatternDrawing.fromJSON(item);
                    break;
                case 'elliotImpulse':
                    drawing = ElliottImpulseDrawing.fromJSON(item);
                    break;
                case 'elliotCorrection':
                    drawing = ElliottCorrectionDrawing.fromJSON(item);
                    break;
                case 'threeDrives':
                    drawing = ThreeDrivesDrawing.fromJSON(item);
                    break;
                case 'headShoulders':
                    drawing = HeadShouldersDrawing.fromJSON(item);
                    break;
                case 'abcd':
                    drawing = ABCDPatternDrawing.fromJSON(item);
                    break;
                case 'trianglePattern':
                    drawing = TrianglePatternDrawing.fromJSON(item);
                    break;
                case 'longPosition':
                    drawing = LongPositionDrawing.fromJSON(item);
                    break;
                case 'shortPosition':
                    drawing = ShortPositionDrawing.fromJSON(item);
                    break;
                case 'priceRange':
                    drawing = PriceRangeDrawing.fromJSON(item);
                    break;
                case 'dateRange':
                    drawing = DateRangeDrawing.fromJSON(item);
                    break;
                case 'datePriceRange':
                    drawing = DatePriceRangeDrawing.fromJSON(item);
                    break;
                case 'text':
                    drawing = TextDrawing.fromJSON(item);
                    break;
                case 'callout':
                    drawing = CalloutDrawing.fromJSON(item);
                    break;
                case 'priceLabel':
                    drawing = PriceLabelDrawing.fromJSON(item);
                    break;
                case 'flagMarked':
                    drawing = FlagMarkedDrawing.fromJSON(item);
                    break;
                // Add more types as needed...
                default:
                    console.warn(`Unknown drawing type: ${item.type}`);
                    continue;
            }

            if (drawing) {
                this._drawings.set(drawing.id, drawing);
            }
        }

        this._drawingsChanged.fire();
    }

    /** Check if there are any drawings */
    hasDrawings(): boolean {
        return this._drawings.size > 0;
    }

    /**
     * Apply magnet snap to coordinate - snaps to nearest OHLC value within threshold
     * Returns adjusted y coordinate (pixel), or original y if no snap
     */
    applyMagnet(x: number, y: number, barData: { time: number; open: number; high: number; low: number; close: number }[]): { x: number; y: number; snapped: boolean; snappedPrice?: number; snappedX?: number } {
        if (this._magnetMode === 'none' || !this._timeScale || !this._priceScale) {
            return { x, y, snapped: false };
        }

        if (barData.length === 0) {
            return { x, y, snapped: false };
        }

        // Find the bar at this x position
        const time = this._pixelToTime(x);
        if (time === null) {
            return { x, y, snapped: false };
        }

        // Find closest bar by time
        let closestBar = null;
        let minTimeDiff = Infinity;
        for (const bar of barData) {
            const diff = Math.abs(bar.time - time);
            if (diff < minTimeDiff) {
                minTimeDiff = diff;
                closestBar = bar;
            }
        }

        if (!closestBar) {
            return { x, y, snapped: false };
        }

        // Get bar center X
        const snappedX = this.timeToPixel(closestBar.time) ?? x;

        // Get OHLC values as pixel y coordinates
        const ohlcPrices = [closestBar.open, closestBar.high, closestBar.low, closestBar.close];
        const ohlcPixels: { price: number; pixelY: number }[] = [];

        for (const price of ohlcPrices) {
            const pixelY = this.priceToPixel(price);
            if (pixelY !== null) {
                ohlcPixels.push({ price, pixelY });
            }
        }

        // Find the closest OHLC value
        let closestOhlc = null;
        let minDist = Infinity;

        for (const ohlc of ohlcPixels) {
            const dist = Math.abs(y - ohlc.pixelY);
            if (dist < minDist) {
                minDist = dist;
                closestOhlc = ohlc;
            }
        }

        if (!closestOhlc) {
            return { x: snappedX, y, snapped: false };
        }

        // Weak magnet: only snap if within threshold
        // Strong magnet: always snap
        const threshold = this._magnetMode === 'weak' ? this._magnetThreshold : Infinity;

        if (minDist <= threshold) {
            return { x: snappedX, y: closestOhlc.pixelY, snapped: true, snappedPrice: closestOhlc.price, snappedX };
        }

        return { x: snappedX, y, snapped: false, snappedX };
    }

    // --- Cleanup ---

    destroy(): void {
        this._drawings.clear();
        this._activeDrawing = null;
        this._selectedDrawing = null;
        this._drawingsChanged.destroy();
        this._modeChanged.destroy();
        this._selectionChanged.destroy();
    }
}
