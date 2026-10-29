/**
 * Drawing Manager - Manages all drawings on the chart
 */

import { Drawing, DrawingType, SerializedDrawing, generateDrawingId } from './drawing';
import {
    IntervalsPreset, IntervalsVisibilities, ParsedTimeframe, buildIntervalsPreset,
    ensureIntervalsVisibilities, isDefaultIntervalsVisibilities, isVisibleOnTimeframe,
    normalizeIntervalsVisibilities, parseTimeframe,
} from './intervals-visibility';
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
import { CypherPatternDrawing } from './cypher-pattern-drawing';
import { ElliottImpulseDrawing } from './elliott-impulse-drawing';
import { ElliottCorrectionDrawing } from './elliott-correction-drawing';
import { ElliottTriangleDrawing } from './elliott-triangle-drawing';
import { ElliottDoubleComboDrawing } from './elliott-double-combo-drawing';
import { ElliottTripleComboDrawing } from './elliott-triple-combo-drawing';
import { ElliottWaveDrawing } from './elliott-common';
import { ThreeDrivesDrawing } from './three-drives-drawing';
import { HeadShouldersDrawing } from './head-shoulders-drawing';
import { ABCDPatternDrawing } from './abcd-pattern-drawing';
import { TrianglePatternDrawing } from './triangle-pattern-drawing';
import { LongPositionDrawing } from './long-position-drawing';
import { PositionDrawingBase } from './position-common';
import { ShortPositionDrawing } from './short-position-drawing';
import { PriceRangeDrawing } from './price-range-drawing';
import { DateRangeDrawing } from './date-range-drawing';
import { DatePriceRangeDrawing } from './date-price-range-drawing';
import { TextDrawing } from './text-drawing';
import { CalloutDrawing, calloutWrapWidthFromHandle } from './callout-drawing';
import { createNoteTool, NoteToolBase, NoteToolType } from './note-drawings';
import { INLINE_TEXT_TYPES, SINGLE_CLICK_TEXT_TYPES, TWO_CLICK_TEXT_TYPES } from './text-common';
import { PriceLabelDrawing } from './price-label-drawing';
import { AnchoredVwapDrawing, VolumeProfileDrawing, VolumeToolBase } from './volume-drawings';
import { snapTimeToBars } from './volume-tools-common';
import { PitchToolBase, PitchToolType, PITCH_TOOL_TYPES } from './pitchfork-drawing';
import { FibTimeToolBase, FibTimeToolType } from './fib-time-drawing';
import { FibCircleToolBase, FibCircleToolType } from './fib-circle-drawing';
import { GannToolBase, GannToolType } from './gann-drawing';
import { ChannelLinesTool, ChannelLinesType } from './channel-lines-drawing';
import { ProjectionDrawing } from './projection-drawing';
import { PositionForecastDrawing } from './position-forecast-drawing';
import { CycleToolBase, CycleToolType } from './cycle-drawing';
import { DoubleCurveDrawing } from './double-curve-drawing';
import { BarsPatternDrawing } from './bars-pattern-drawing';
import { GhostFeedDrawing } from './ghost-feed-drawing';
import { FlagMarkedDrawing } from './flag-marked-drawing';
import { Delegate } from '../helpers/delegate';
import { TimeScale } from '../model/time-scale';
import { PriceScale } from '../model/price-scale';
import { coordinate, timePointIndex } from '../model/coordinate';
import { snapToAngleStep, supportsShiftConstraint, hasAnyStats } from './line-tool-common';

export type DrawingMode = 'none' | DrawingType;

/** Gecmis (undo/redo) azami kayit sayisi */
const MAX_HISTORY = 100;

/** Tek tikla tamamlanan cizim turleri (isComplete() tanimlamayanlar dahil) */
const SINGLE_POINT_TYPES: ReadonlySet<string> = new Set([
    'horizontalLine', 'horizontalRay', 'verticalLine', 'crossLine',
    'priceLabel', 'flagMarked', 'text', 'sticker', 'arrowMarkedUp', 'arrowMarkedDown', 'arrowMarkedLeft', 'arrowMarkedRight',
    'anchoredVwap', 'anchoredVolumeProfile',
    'note', 'pin', 'signpost', 'table',
]);

/** Kopyala/yapistir panosu - sayfadaki tum grafikler arasinda paylasilir */
let _drawingClipboard: SerializedDrawing | null = null;

/**
 * Manages drawing creation, storage, and interaction
 */
export class DrawingManager {
    private _drawings: Map<string, Drawing> = new Map();
    private _activeDrawing: Drawing | null = null;
    private _selectedDrawing: Drawing | null = null;
    private _mode: DrawingMode = 'none';
    private _snapToIndicators: boolean = false;
    private _indicatorPriceProvider: ((time: number) => number[]) | null = null;
    private _stickerContent: string = '😀';

    // References to scales for coordinate conversion
    private _timeScale: TimeScale | null = null;
    private _priceScale: PriceScale | null = null;
    private _activePaneId: string | null = null;

    // Events
    private readonly _drawingsChanged = new Delegate<void>();
    private readonly _modeChanged = new Delegate<DrawingMode>();
    private readonly _selectionChanged = new Delegate<Drawing | null>();

    // Hovered drawing for "Add Text" tooltip
    private _hoveredForAddText: string | null = null;
    /** Imlecin uzerinde durdugu cizim (istatistik kutusu hover'da gorunsun diye) */
    private _hoveredDrawingId: string | null = null;

    // Magnet mode: 'none' | 'weak' | 'strong'
    private _magnetMode: 'none' | 'weak' | 'strong' = 'none';
    private _magnetThreshold: number = 30; // pixel distance for weak magnet
    private _isLocked: boolean = false;
    private _keepDrawing: boolean = false;
    // Toolbar "Hide Drawings": gorunum durumu (cizimlerin kendi visible bayragina dokunmaz, gecmise girmez)
    private _drawingsHidden: boolean = false;
    private _paneExists: ((paneId: string) => boolean) | null = null;
    // Grafigin mevcut zaman dilimi ("zaman dilimlerinde gorunurluk" filtresi icin); gecmise girmez
    private _timeframe: string = '';
    private _parsedTimeframe: ParsedTimeframe | null = null;
    private readonly _historyRestored = new Delegate<void>();
    private readonly _textEditRequested = new Delegate<{ drawing: Drawing; isNew: boolean }>();
    /** Satir ici metin editoru acik olan yeni cizim (gecmise henuz yazilmadi) */
    private _pendingTextId: string | null = null;
    private _stalePendingId: string | null = null;

    // Undo/redo gecmisi: serialize() anlik goruntuleri (secim durumu normalize edilir)
    private _history: string[] = [];
    private _historyIndex: number = -1;
    private _lastCoalesceKey: string | null = null;
    private _lastCommitTime: number = 0;

    constructor() {
        this.resetHistory();
    }

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

    get hoveredDrawingId(): string | null {
        return this._hoveredDrawingId;
    }

    /**
     * Hover'a bagli istatistik kutusu olan cizim mi (Trend Line ailesi, en az bir istatistik acik,
     * "always show" kapali)? Hover tespiti yalnizca bu cizimler icin yapilir.
     */
    private static _isHoverStatsDrawing(d: Drawing): boolean {
        if (d instanceof PositionDrawingBase) return !d.props.alwaysShowStats;
        if (!(d instanceof TrendLineDrawing)) return false;
        return hasAnyStats(d.lineProps) && !d.lineProps.alwaysShowStats;
    }

    /**
     * Ana paneldeki cizimler uzerinde hover tespiti; yalnizca hover'a bagli cizimleri dikkate alir
     * ve hover id'si degisip bu cizimlerden biri etkilendiyse (yeniden cizim gerekir) true doner.
     */
    updateHoveredDrawing(x: number, y: number, paneId: string | null = null): boolean {
        const prevId = this._hoveredDrawingId;
        let id: string | null = null;
        if (!this._drawingsHidden && this._mode === 'none') {
            // Sondan basa: ustteki cizim once; liste kopyalanmaz
            let found: Drawing | null = null;
            for (const d of this._drawings.values()) {
                if (!d.visible || (d.paneId ?? null) !== paneId || !this.isVisibleOnCurrentTimeframe(d)) continue;
                if (!DrawingManager._isHoverStatsDrawing(d)) continue;
                // En son eklenen (en ustteki) eslesme kazanir
                if (d.hitTest(x, y, 6)) found = d;
            }
            if (found) id = found.id;
        }
        if (id === prevId) return false;
        this._hoveredDrawingId = id;
        const prev = prevId !== null ? this._drawings.get(prevId) : undefined;
        const next = id !== null ? this._drawings.get(id) : undefined;
        return (!!prev && DrawingManager._isHoverStatsDrawing(prev)) ||
            (!!next && DrawingManager._isHoverStatsDrawing(next));
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

    /** "Snap to indicators": magnet candidates also include overlay indicator values at the bar */
    get snapToIndicators(): boolean {
        return this._snapToIndicators;
    }

    set snapToIndicators(value: boolean) {
        this._snapToIndicators = value;
    }

    /** Supplies the overlay indicator price values (finite numbers) at the given bar time */
    setIndicatorPriceProvider(fn: ((time: number) => number[]) | null): void {
        this._indicatorPriceProvider = fn;
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

    /** Tum cizimler gizli mi (grafik duzeyinde gorunum bayragi; cizim/hit-test atlanir) */
    get drawingsHidden(): boolean {
        return this._drawingsHidden;
    }

    set drawingsHidden(value: boolean) {
        if (this._drawingsHidden === value) return;
        this._drawingsHidden = value;
        // Gizliyken secili cizim kalmasin
        if (value && this._selectedDrawing) {
            this._selectedDrawing.state = 'complete';
            this._selectedDrawing = null;
            this._selectionChanged.fire(null);
        }
        this._drawingsChanged.fire();
    }

    /** Gecmis (undo/redo) uygulandiktan sonra tetiklenir (acik modal/attribute bar kapatilir) */
    get historyRestored(): Delegate<void> {
        return this._historyRestored;
    }

    /** Panonun kaynak paneli bu grafikte var mi? (yoksa yapistirma yapilmaz) */
    setPaneExistsResolver(fn: ((paneId: string) => boolean) | null): void {
        this._paneExists = fn;
    }

    /** Cizim bitince ayni arac aktif kalir (Keep Drawing Mode) */
    get keepDrawing(): boolean {
        return this._keepDrawing;
    }

    set keepDrawing(value: boolean) {
        this._keepDrawing = value;
    }

    // --- Public Methods ---

    /** Set scale references for coordinate conversion */
    setScales(timeScale: TimeScale, priceScale: PriceScale): void {
        this._timeScale = timeScale;
        this._priceScale = priceScale;
    }

    setActivePaneId(paneId: string | null): void {
        this._activePaneId = paneId;
    }

    get activePaneId(): string | null {
        return this._activePaneId;
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

    /** Cizim bitince imlec moduna doner; Keep Drawing Mode aciksa arac aktif kalir */
    private _endToolAfterFinish(): void {
        if (this._keepDrawing) return;
        this._mode = 'none';
        this._modeChanged.fire('none');
    }

    /** Keep Drawing Mode: yeni cizim baslarken onceki cizimin secimini kaldirir */
    private _clearSelectionForNewDrawing(): void {
        if (!this._keepDrawing || !this._selectedDrawing) return;
        this._selectedDrawing.state = 'complete';
        this._selectedDrawing = null;
        this._selectionChanged.fire(null);
    }

    /** Start a new drawing at the given coordinates */
    startDrawing(x: number, y: number, snappedPrice?: number): void {
        const countBefore = this._drawings.size;
        this._startDrawingInner(x, y, snappedPrice);
        const created = this._drawings.size > countBefore ? [...this._drawings.values()].pop() ?? null : null;
        // Text: gecmise metin girildikten sonra yazilir (bos metin cizimi kaldirir, gecmis kaydi olmaz)
        if (created && SINGLE_CLICK_TEXT_TYPES.has(created.type) && this._requestNewTextEdit(created)) return;
        // Tek noktali cizimler hemen tamamlanir; yarim kalanlar serialize()'da yoktur (dedupe)
        this.commitHistory();
    }

    /** Satir ici metin editoru istenir (yeni cizim / var olan cizimi cift tiklama) */
    get textEditRequested(): Delegate<{ drawing: Drawing; isNew: boolean }> {
        return this._textEditRequested;
    }

    /** Yeni Text/Callout/Note/... icin editor ister; dinleyici yoksa false (cizim hemen gecmise yazilir) */
    private _requestNewTextEdit(drawing: Drawing): boolean {
        if (!this._textEditRequested.hasListeners()) return false;
        // Onceki bekleyen yeni metin: editor acilirken commit edilir (isNew sayilir); edilmediyse kaldirilir
        const prevId = this._pendingTextId && this._pendingTextId !== drawing.id ? this._pendingTextId : null;
        this._stalePendingId = prevId;
        this._pendingTextId = drawing.id;
        this._textEditRequested.fire({ drawing, isNew: true });
        if (this._stalePendingId) {
            const prev = this._drawings.get(this._stalePendingId);
            this._stalePendingId = null;
            if (prev) {
                this._drawings.delete(prev.id);
                if (this._selectedDrawing === prev) {
                    this._selectedDrawing = null;
                    this._selectionChanged.fire(null);
                }
                this._drawingsChanged.fire();
            }
        }
        return true;
    }

    /** Var olan Text/Callout/Note/...'u satir ici duzenlemek icin editor ister (Table: once beginCellEdit) */
    requestTextEdit(drawing: Drawing): void {
        if (!INLINE_TEXT_TYPES.has(drawing.type)) return;
        this._textEditRequested.fire({ drawing, isNew: false });
    }

    /**
     * Satir ici editorde metin kaydedilince: bos metin cizimi kaldirir (yeni cizimse gecmis kaydi olmadan),
     * aksi halde metni uygular ve gecmise tek kayit ekler.
     */
    commitTextEdit(drawing: Drawing, text: string): void {
        const isNew = this._pendingTextId === drawing.id || this._stalePendingId === drawing.id;
        if (this._pendingTextId === drawing.id) this._pendingTextId = null;
        if (this._stalePendingId === drawing.id) this._stalePendingId = null;
        if (!this._drawings.has(drawing.id)) return;
        // Table hucresi: bos metin hucreyi temizler, cizimi silmez
        if (text.trim() === '' && !(drawing as any).allowEmptyText) {
            this._drawings.delete(drawing.id);
            if (this._selectedDrawing === drawing) {
                this._selectedDrawing = null;
                this._selectionChanged.fire(null);
            }
            this._drawingsChanged.fire();
            if (!isNew) this.commitHistory();
            return;
        }
        (drawing as any).setSettingValue('text', text);
        this._drawingsChanged.fire();
        this.commitHistory();
    }

    private _startDrawingInner(x: number, y: number, snappedPrice?: number): void {
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
            case 'arrowMarkedLeft':
                drawing = new ArrowIconDrawing({ type: 'arrowMarkedLeft' });
                break;
            case 'arrowMarkedRight':
                drawing = new ArrowIconDrawing({ type: 'arrowMarkedRight' });
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
            case 'doubleCurve':
                drawing = new DoubleCurveDrawing();
                break;
            case 'cyclicLines':
            case 'timeCycles':
            case 'sineLine':
                drawing = new CycleToolBase(this._mode as CycleToolType);
                break;
            case 'xabcdPattern':
                drawing = new XABCDPatternDrawing();
                break;
            case 'cypherPattern':
                drawing = new CypherPatternDrawing();
                break;
            case 'elliotImpulse':
                drawing = new ElliottImpulseDrawing();
                break;
            case 'elliotCorrection':
                drawing = new ElliottCorrectionDrawing();
                break;
            case 'elliotTriangle':
                drawing = new ElliottTriangleDrawing();
                break;
            case 'elliotDoubleCombo':
                drawing = new ElliottDoubleComboDrawing();
                break;
            case 'elliotTripleCombo':
                drawing = new ElliottTripleComboDrawing();
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
            case 'note':
            case 'priceNote':
            case 'pin':
            case 'signpost':
            case 'comment':
            case 'table':
                drawing = createNoteTool(this._mode as NoteToolType);
                break;
            case 'flagMarked':
                drawing = new FlagMarkedDrawing();
                break;
            case 'anchoredVwap':
                drawing = new AnchoredVwapDrawing();
                break;
            case 'fixedRangeVolumeProfile':
            case 'anchoredVolumeProfile':
                drawing = new VolumeProfileDrawing(this._mode);
                break;
            case 'pitchfork':
            case 'schiffPitchfork':
            case 'modifiedSchiffPitchfork':
            case 'insidePitchfork':
            case 'pitchfan':
                drawing = new PitchToolBase(this._mode as PitchToolType);
                break;
            case 'fibTimeZone':
            case 'trendBasedFibTime':
            case 'fibSpeedResistanceFan':
                drawing = new FibTimeToolBase(this._mode as FibTimeToolType);
                break;
            case 'fibSpeedResistanceArcs':
            case 'fibCircles':
            case 'fibSpiral':
            case 'fibWedge':
                drawing = new FibCircleToolBase(this._mode as FibCircleToolType);
                break;
            case 'gannBox':
            case 'gannSquareFixed':
            case 'gannSquare':
            case 'gannFan':
                drawing = new GannToolBase(this._mode as GannToolType);
                break;
            case 'disjointChannel':
            case 'flatTopBottom':
                drawing = new ChannelLinesTool(this._mode as ChannelLinesType);
                break;
            case 'projection':
                drawing = new ProjectionDrawing();
                break;
            case 'positionForecast':
                drawing = new PositionForecastDrawing();
                break;
            case 'barsPattern':
                drawing = new BarsPatternDrawing();
                break;
            case 'ghostFeed':
                drawing = new GhostFeedDrawing();
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
            // Gizliyken yeni cizim baslarsa gorunmez kalmasin: gizlemeyi kapat (toolbar butonu chart-widget'ta senkronlanir)
            if (this._drawingsHidden) this.drawingsHidden = false;
            this._clearSelectionForNewDrawing();
            drawing.paneId = this._activePaneId;
            drawing.addPoint(time, price);
            this._drawings.set(drawing.id, drawing);

            // If drawing is complete after first point (single-point drawings), finish immediately
            if (drawing.isComplete?.() || SINGLE_POINT_TYPES.has(drawing.type)) {
                this._endToolAfterFinish();
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
    updateDrawing(x: number, y: number, snappedPrice?: number, constrainAngle: boolean = false): void {
        if (!this._activeDrawing) return;
        if (!this._timeScale || !this._priceScale) return;

        let snapTime: number | null = null;
        // Shift kilidi: kanal araclarinda yalnizca ikinci noktayi yerlestirirken (ucuncu nokta serbest)
        if (constrainAngle && this._shiftTargetsLineA(this._activeDrawing)) {
            const c = this._constrainToAngleStep(this._activeDrawing, 0, x, y);
            if (c) { x = c.x; y = c.y; snappedPrice = c.price; snapTime = c.time; }
        }

        const time = snapTime ?? this._pixelToTime(x);
        const price = snappedPrice !== undefined ? snappedPrice : this._pixelToPrice(y);

        if (time === null || price === null) return;

        // Update the drawing's preview point (works for TrendLine, FibRetracement, etc.)
        if ('updateLastPoint' in this._activeDrawing) {
            (this._activeDrawing as { updateLastPoint: (t: number, p: number) => void }).updateLastPoint(time, price);
            this._drawingsChanged.fire();
        }
    }

    /** Finish the current drawing */
    finishDrawing(x: number, y: number, snappedPrice?: number, constrainAngle: boolean = false): void {
        let snapTime: number | null = null;
        if (constrainAngle && this._activeDrawing && this._shiftTargetsLineA(this._activeDrawing)) {
            const c = this._constrainToAngleStep(this._activeDrawing, 0, x, y);
            if (c) { x = c.x; y = c.y; snappedPrice = c.price; snapTime = c.time; }
        }
        const active = this._activeDrawing;
        this._finishDrawingInner(x, y, snappedPrice, snapTime);
        // Callout: kutu yerlestirilince metin editoru acilir; gecmis kaydi metin girilince yazilir
        if (active && TWO_CLICK_TEXT_TYPES.has(active.type) && this._activeDrawing === null && this._drawings.has(active.id)
            && this._requestNewTextEdit(active)) return;
        this.commitHistory();
    }

    private _finishDrawingInner(x: number, y: number, snappedPrice?: number, snapTime: number | null = null): void {
        if (!this._activeDrawing) return;
        if (!this._timeScale || !this._priceScale) return;

        const time = snapTime ?? this._pixelToTime(x);
        const price = snappedPrice !== undefined ? snappedPrice : this._pixelToPrice(y);

        if (time === null || price === null) return;

        // Handle two-point drawings
        if (this._activeDrawing.type === 'trendLine' ||
            this._activeDrawing.type === 'fibRetracement' ||
            this._activeDrawing.type === 'ray' ||
            this._activeDrawing.type === 'arrow' ||
            this._activeDrawing.type === 'infoLine' ||
            this._activeDrawing.type === 'extendedLine' ||
            this._activeDrawing.type === 'trendAngle' ||
            this._activeDrawing.type === 'regressionTrend' ||
            this._activeDrawing.type === 'longPosition' ||
            this._activeDrawing.type === 'shortPosition' ||
            this._activeDrawing.type === 'priceRange' ||
            this._activeDrawing.type === 'dateRange' ||
            this._activeDrawing.type === 'datePriceRange' ||
            this._activeDrawing.type === 'fibTimeZone' ||
            this._activeDrawing.type === 'fibSpeedResistanceFan' ||
            this._activeDrawing.type === 'fibSpeedResistanceArcs' ||
            this._activeDrawing.type === 'fibCircles' ||
            this._activeDrawing.type === 'fibSpiral' ||
            this._activeDrawing.type === 'gannBox' ||
            this._activeDrawing.type === 'gannSquareFixed' ||
            this._activeDrawing.type === 'gannSquare' ||
            this._activeDrawing.type === 'gannFan' ||
            this._activeDrawing.type === 'fixedRangeVolumeProfile' ||
            this._activeDrawing.type === 'positionForecast' ||
            this._activeDrawing.type === 'cyclicLines' ||
            this._activeDrawing.type === 'timeCycles' ||
            this._activeDrawing.type === 'sineLine' ||
            this._activeDrawing.type === 'callout' ||
            this._activeDrawing.type === 'priceNote' ||
            this._activeDrawing.type === 'comment') {

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
            this._activeDrawing.type === 'arrowMarkedLeft' ||
            this._activeDrawing.type === 'arrowMarkedRight' ||
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
                this._endToolAfterFinish();
                this._drawingsChanged.fire();
                return;
            }
        }

        // Handle three-point drawings (ParallelChannel, FibExtension, FibChannel, Pitchforks, TrendBasedFibTime, RotatedRectangle, Ellipse, DisjointChannel, FlatTopBottom, Projection)
        if (this._activeDrawing.type === 'parallelChannel' || this._activeDrawing.type === 'fibExtension' || this._activeDrawing.type === 'fibChannel' || PITCH_TOOL_TYPES.has(this._activeDrawing.type) || this._activeDrawing.type === 'trendBasedFibTime' || this._activeDrawing.type === 'fibWedge' || this._activeDrawing.type === 'rotatedRectangle' || this._activeDrawing.type === 'ellipse' || this._activeDrawing.type === 'triangle' || this._activeDrawing.type === 'arc' || this._activeDrawing.type === 'doubleCurve' || this._activeDrawing.type === 'disjointChannel' || this._activeDrawing.type === 'flatTopBottom' || this._activeDrawing.type === 'projection' || this._activeDrawing.type === 'barsPattern') {
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
            this._activeDrawing.type === 'cypherPattern' ||
            this._activeDrawing.type === 'elliotImpulse' ||
            this._activeDrawing.type === 'elliotCorrection' ||
            this._activeDrawing.type === 'elliotTriangle' ||
            this._activeDrawing.type === 'elliotDoubleCombo' ||
            this._activeDrawing.type === 'elliotTripleCombo' ||
            this._activeDrawing.type === 'threeDrives' ||
            this._activeDrawing.type === 'headShoulders' ||
            this._activeDrawing.type === 'abcd' ||
            this._activeDrawing.type === 'trianglePattern') {
            const patternDrawing = this._activeDrawing as XABCDPatternDrawing | ElliottWaveDrawing | ThreeDrivesDrawing | HeadShouldersDrawing | ABCDPatternDrawing | TrianglePatternDrawing;

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
            if (this._activeDrawing instanceof ElliottWaveDrawing) requiredPoints = this._activeDrawing.requiredPoints;
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
                this._endToolAfterFinish();
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

        // Handle ghost feed drawing (polyline benzeri: tik nokta ekler, cift tik / Enter / Esc bitirir)
        if (this._activeDrawing.type === 'ghostFeed') {
            (this._activeDrawing as GhostFeedDrawing).confirmPreviewPoint();
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
                this._endToolAfterFinish();
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
        this._endToolAfterFinish();  // Return to cursor mode after drawing (unless Keep Drawing Mode)

        if (finishedDrawing) {
            this._selectedDrawing = finishedDrawing;
            finishedDrawing.state = 'selected';
            this._selectionChanged.fire(finishedDrawing);
        }

        this._drawingsChanged.fire();
    }

    /** Select a drawing at the given coordinates */
    selectDrawingAt(x: number, y: number, paneId: string | null = null): Drawing | null {
        const prev = this._selectedDrawing;
        const hit = this._selectDrawingAtInner(x, y, paneId);
        if (prev && prev !== hit) this._removeIfEmptyCallout(prev);
        return hit;
    }

    /** Secimi kaldirir (Esc); metni bos Callout silinir */
    deselect(): void {
        const prev = this._selectedDrawing;
        if (!prev) return;
        prev.state = 'complete';
        this._selectedDrawing = null;
        this._selectionChanged.fire(null);
        this._drawingsChanged.fire();
        this._removeIfEmptyCallout(prev);
    }

    /** TV shouldBeRemovedOnDeselect: secim kalkinca metni bos Callout silinir (editor aciksa / yeni cizim bekliyorsa dokunulmaz) */
    private _removeIfEmptyCallout(d: Drawing): void {
        if (!(d instanceof CalloutDrawing) || d.editing || this._pendingTextId === d.id) return;
        if (d.points.length < 2 || d.text.trim() !== '' || !this._drawings.has(d.id)) return;
        this._drawings.delete(d.id);
        this._drawingsChanged.fire();
        this.commitHistory();
    }

    private _selectDrawingAtInner(x: number, y: number, paneId: string | null): Drawing | null {
        const drawings = Array.from(this._drawings.values());

        for (let i = drawings.length - 1; i >= 0; i--) {
            const drawing = drawings[i];

            if (this._drawingsHidden || !drawing.visible || (drawing.paneId ?? null) !== paneId
                || !this.isVisibleOnCurrentTimeframe(drawing)) {
                continue;
            }

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

    /**
     * Eraser tool: deletes the top-most unlocked drawing under (x, y) in the given pane.
     * Same hit-test rules as selection; locked drawings are skipped. One history entry per erase.
     * Returns true when a drawing was deleted.
     */
    eraseDrawingAt(x: number, y: number, paneId: string | null = null): boolean {
        if (this._drawingsHidden || this._isLocked) return false;
        const drawings = Array.from(this._drawings.values());
        for (let i = drawings.length - 1; i >= 0; i--) {
            const drawing = drawings[i];
            if (!drawing.visible || drawing.locked || (drawing.paneId ?? null) !== paneId
                || !this.isVisibleOnCurrentTimeframe(drawing)) {
                continue;
            }
            if (drawing === this._activeDrawing && drawing.state === 'creating') continue;

            if (drawing.type === 'longPosition' || drawing.type === 'shortPosition' || drawing.type === 'priceRange' || drawing.type === 'dateRange' || drawing.type === 'datePriceRange') {
                if (drawing.points.length >= 2) {
                    const x1 = this.timeToPixel(drawing.points[0].time);
                    const y1 = this.priceToPixel(drawing.points[0].price);
                    const x2 = this.timeToPixel(drawing.points[1].time);
                    const y2 = this.priceToPixel(drawing.points[1].price);
                    if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
                        (drawing as any).setPixelPoints([{ x: x1, y: y1 }, { x: x2, y: y2 }]);
                    }
                }
            }

            if (drawing.hitTest(x, y, 8)) {
                this.deleteDrawing(drawing.id);
                return true;
            }
        }
        return false;
    }

    /** Delete a drawing */
    deleteDrawing(id: string): void {
        const drawing = this._drawings.get(id);
        if (drawing) {
            this._drawings.delete(id);
            this.clearPendingText(id);
            if (this._selectedDrawing === drawing) {
                this._selectedDrawing = null;
                this._selectionChanged.fire(null);
            }
            this._drawingsChanged.fire();
            this.commitHistory();
        }
    }

    /** Drops the pending new-text marker when it refers to the given drawing id */
    clearPendingText(id: string): void {
        if (this._pendingTextId === id) this._pendingTextId = null;
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
        this.commitHistory();
    }

    /** Cift tiklamanin iki mousedown'i ayni yere nokta koyar: sondaki yinelenen noktayi (<= px) sil */
    private _dropTrailingDuplicate(points: { time: number; price: number }[], px: number = 3): void {
        if (points.length < 3) return;
        const a = points[points.length - 1];
        const b = points[points.length - 2];
        const ax = this.timeToPixel(a.time), ay = this.priceToPixel(a.price);
        const bx = this.timeToPixel(b.time), by = this.priceToPixel(b.price);
        if (ax === null || ay === null || bx === null || by === null) return;
        if (Math.hypot(ax - bx, ay - by) <= px) points.pop();
    }

    /** Finish path drawing (ESC / Enter / double-click; dropDuplicate: double-click) */
    finishPathDrawing(dropDuplicate: boolean = false): void {
        if (!this._activeDrawing || this._activeDrawing.type !== 'path') return;

        const pathDrawing = this._activeDrawing as any;
        if (typeof pathDrawing.finishPath === 'function') {
            pathDrawing.finishPath();
        }
        if (dropDuplicate) this._dropTrailingDuplicate(pathDrawing.points);

        // Keep the drawing if it has at least 2 points
        if (pathDrawing.points.length >= 2) {
            pathDrawing.state = 'complete';
        } else {
            // Not enough points - remove the drawing
            this._drawings.delete(this._activeDrawing.id);
        }

        this._activeDrawing = null;
        this._endToolAfterFinish();
        this._drawingsChanged.fire();
        this.commitHistory();
    }

    /** Finish polyline drawing (ESC / Enter / double-click; dropDuplicate: double-click) */
    finishPolylineDrawing(dropDuplicate: boolean = false): void {
        if (!this._activeDrawing || this._activeDrawing.type !== 'polyline') return;

        const polylineDrawing = this._activeDrawing as PolylineDrawing;
        if (typeof polylineDrawing.finishPolyline === 'function') {
            polylineDrawing.finishPolyline();
        }
        if (dropDuplicate) this._dropTrailingDuplicate(polylineDrawing.points);

        // Keep the drawing if it has at least 2 points
        if (polylineDrawing.points.length >= 2) {
            polylineDrawing.state = 'complete';
        } else {
            // Not enough points - remove the drawing
            this._drawings.delete(this._activeDrawing.id);
        }

        const finishedDrawing = this._activeDrawing;
        this._activeDrawing = null;
        this._endToolAfterFinish();

        if (finishedDrawing && finishedDrawing.state === 'complete') {
            this._selectedDrawing = finishedDrawing;
            finishedDrawing.state = 'selected';
            this._selectionChanged.fire(finishedDrawing);
        }

        this._drawingsChanged.fire();
        this.commitHistory();
    }

    /** Finish ghost feed drawing (ESC / Enter / double-click; dropDuplicate: double-click) */
    finishGhostFeedDrawing(dropDuplicate: boolean = false): void {
        if (!this._activeDrawing || this._activeDrawing.type !== 'ghostFeed') return;

        const ghost = this._activeDrawing as GhostFeedDrawing;
        ghost.finishGhostFeed();
        if (dropDuplicate) this._dropTrailingDuplicate(ghost.points);

        if (ghost.points.length >= 2) {
            ghost.state = 'complete';
        } else {
            this._drawings.delete(ghost.id);
        }

        this._activeDrawing = null;
        this._endToolAfterFinish();

        if (ghost.state === 'complete') {
            this._selectedDrawing = ghost;
            ghost.state = 'selected';
            this._selectionChanged.fire(ghost);
        }

        this._drawingsChanged.fire();
        this.commitHistory();
    }

    /** Move the selected drawing by a pixel delta */
    moveDrawing(deltaX: number, deltaY: number): void {
        if (!this._selectedDrawing || this._selectedDrawing.locked) return;
        if (!this._timeScale || !this._priceScale) return;

        // Convert pixel delta directly to logical delta
        // For time: use bar spacing to convert pixels to time units
        const barSpacing = this._timeScale.barSpacing;
        if (barSpacing <= 0) return;

        // Calculate time delta: pixels / barSpacing = bars, then convert bars to time
        // We need the average time interval between bars
        if (this._timestamps.length >= 2) {
            const lastIdx = this._timestamps.length - 1;
            const avgInterval = (this._timestamps[lastIdx] - this._timestamps[0]) / lastIdx;

            // Bars moved = pixels / barSpacing
            // Time moved = bars * interval
            const barsDelta = deltaX / barSpacing;
            const timeDelta = barsDelta * avgInterval;

            // For price: convert two Y coordinates to get accurate price delta
            // Use price scale's coordinate conversion for accuracy
            const refY = 100; // Reference Y coordinate
            const price1 = this._priceScale.coordinateToPrice(coordinate(refY));
            const price2 = this._priceScale.coordinateToPrice(coordinate(refY + deltaY));

            if (price1 !== null && price2 !== null) {
                const priceDelta = price2 - price1;

                // Callout govdesi: yalniz kutu (nokta 2) tasinir, kuyruk ucu sabit kalir
                const movePts = this._selectedDrawing instanceof CalloutDrawing && this._selectedDrawing.points.length >= 2
                    ? [this._selectedDrawing.points[1]] : this._selectedDrawing.points;
                // Apply delta to all points
                for (const point of movePts) {
                    point.time += timeDelta;
                    point.price += priceDelta;
                }

                this._drawingsChanged.fire();
            }
        }
    }



    private _timestamps: number[] = [];

    /** Update timestamps for coordinate conversion */
    setTimestamps(timestamps: number[]): void {
        this._timestamps = timestamps;
    }

    /** Move a specific control point of the selected drawing to new pixel position */
    moveControlPoint(pointIndex: number, x: number, y: number, snappedPrice?: number, constrainAngle: boolean = false): void {
        if (!this._selectedDrawing || this._selectedDrawing.locked) return;

        // Callout: 0 = sabit (kuyruk ucu; kutu yerinde kalir), 1 = kelime kaydirma tutamaci (yalniz yatay boyutlandirma)
        if (this._selectedDrawing instanceof CalloutDrawing) {
            const co = this._selectedDrawing;
            if (pointIndex === 1) {
                const cx = co.getPixelPoints()[1]?.x;
                if (cx === undefined || !co.box.wrap) return;
                co.box.wrapWidth = Math.min(2000, calloutWrapWidthFromHandle(x, cx));
                this._drawingsChanged.fire();
                return;
            }
            constrainAngle = false;
        }

        let snapTime: number | null = null;
        const channelLines = this._selectedDrawing.type === 'disjointChannel' || this._selectedDrawing.type === 'flatTopBottom';
        if (constrainAngle && (this._selectedDrawing.points.length === 2 || (channelLines && this._selectedDrawing.points.length === 3)) && (pointIndex === 0 || pointIndex === 1)) {
            // Diger uc sabit kalir
            const c = this._constrainToAngleStep(this._selectedDrawing, 1 - pointIndex, x, y);
            if (c) { x = c.x; y = c.y; snappedPrice = c.price; snapTime = c.time; }
        }

        if (this._selectedDrawing.type === 'longPosition') {
            const posDrawing = this._selectedDrawing as LongPositionDrawing;
            const time = snapTime ?? this._pixelToTime(x);
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
            const time = snapTime ?? this._pixelToTime(x);
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

        // Special handling for parallel channel to preserve width when moving endpoints
        if (this._selectedDrawing.type === 'parallelChannel') {
            const channel = this._selectedDrawing as ParallelChannelDrawing;

            if (pointIndex < 0 || pointIndex >= channel.points.length) return;

            const time = snapTime ?? this._pixelToTime(x);
            const price = snappedPrice !== undefined ? snappedPrice : this._pixelToPrice(y);
            if (time === null || price === null) return;

            if ((pointIndex === 0 || pointIndex === 1) && channel.points.length >= 3) {
                // Moving an endpoint - preserve the channel width
                const currentOffset = channel.getChannelOffset();

                // Update the endpoint
                channel.points[pointIndex] = { time, price };

                // Recalculate point 2 to maintain the same offset
                const p0 = channel.points[0];
                const p1 = channel.points[1];

                // Use midpoint of base line as reference for point 2
                const midTime = (p0.time + p1.time) / 2;
                const timeDiff = p1.time - p0.time;

                let midPrice: number;
                if (Math.abs(timeDiff) < 0.0001) {
                    // Vertical line - use average price
                    midPrice = (p0.price + p1.price) / 2;
                } else {
                    const baseSlope = (p1.price - p0.price) / timeDiff;
                    midPrice = p0.price + baseSlope * (midTime - p0.time);
                }

                // Adjust point 2 to maintain the same offset
                channel.points[2] = {
                    time: midTime,
                    price: midPrice + currentOffset
                };
            } else {
                // Point 2 - allow direct manipulation (this changes width)
                channel.points[pointIndex] = { time, price };
            }

            this._drawingsChanged.fire();
            return;
        }

        if (pointIndex < 0 || pointIndex >= this._selectedDrawing.points.length) return;

        // Convert pixel to logical coordinates
        const time = snapTime ?? this._pixelToTime(x);
        const price = snappedPrice !== undefined ? snappedPrice : this._pixelToPrice(y);
        if (time === null || price === null) return;

        // Update the specific point (hacim araclari: capa bara yapisir)
        const snapped = this._selectedDrawing instanceof VolumeToolBase ? snapTimeToBars(this._selectedDrawing.bars, time) : time;
        this._selectedDrawing.points[pointIndex] = { time: snapped, price };


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

    /** Olusturma sirasinda Shift kilidi bu noktaya uygulanir mi? Kanal araclarinda yalnizca P2'ye (birinci cizgi), digerlerinde her zaman. */
    private _shiftTargetsLineA(drawing: Drawing): boolean {
        return drawing instanceof ChannelLinesTool ? drawing.confirmedPointCount === 1 : true;
    }

    /**
     * Shift: cizgi araclarinda (x, y) noktasini capa noktasina (anchorIndex) gore en yakin 45 derece
     * adimina kilitler (ekran uzayi). Arac desteklemiyorsa ya da capa yoksa null.
     */
    private _constrainToAngleStep(drawing: Drawing, anchorIndex: number, x: number, y: number): { x: number; y: number; time: number | null; price: number | undefined } | null {
        if (!supportsShiftConstraint(drawing.type)) return null;
        const anchor = drawing.points[anchorIndex];
        if (!anchor) return null;
        const ax = this.timeToPixel(anchor.time);
        const ay = this.priceToPixel(anchor.price);
        if (ax === null || ay === null) return null;
        const c = snapToAngleStep(ax, ay, x, y);
        // Yatay/dikey kilitte capanin tam zaman/fiyati yeniden kullanilir (piksel->deger donusumundeki kayma olmasin).
        // Zaman: kilitli noktada capa zamani ya da (son bar civarinda kenetlenmeden) ekstrapole zaman.
        const time = Math.abs(c.x - ax) < 1e-6 ? anchor.time : this._pixelToTime(c.x, true);
        const price = Math.abs(c.y - ay) < 1e-6 ? anchor.price : undefined;
        return { x: c.x, y: c.y, time, price };
    }

    /** Convert pixel X to time (timestamp) */
    private _pixelToTime(x: number, extrapolate: boolean = false): number | null {
        if (!this._timeScale || this._timestamps.length === 0) return null;

        // Get float bar index from X coordinate (for smooth dragging)
        const floatIndex = this._timeScale.coordinateToFloatIndex(coordinate(x));

        // Tam bar uzerinde (float hatasi icinde) birebir zaman damgasi: interpolasyon kaymasi olmasin (magnet)
        const nearest = Math.round(floatIndex);
        if (nearest >= 0 && nearest < this._timestamps.length && Math.abs(floatIndex - nearest) < 1e-6) {
            return this._timestamps[nearest];
        }

        // Check if within range (with some margin)
        if (floatIndex >= 0 && floatIndex < this._timestamps.length - 1) {
            // Interpolate between two timestamps for smooth positioning
            const idx1 = Math.floor(floatIndex);
            const idx2 = idx1 + 1;
            const t1 = this._timestamps[idx1];
            const t2 = this._timestamps[idx2];
            const fraction = floatIndex - idx1;
            return t1 + fraction * (t2 - t1);
        } else if (!extrapolate && floatIndex >= this._timestamps.length - 1 && floatIndex < this._timestamps.length) {
            // At or near last bar - use last timestamp (extrapolate=true: Shift kilidi, bar kaymasin diye alttaki ekstrapolasyon kullanilir)
            return this._timestamps[this._timestamps.length - 1];
        } else if (floatIndex >= 0 && floatIndex < 1) {
            // Near first bar - interpolate from first bar
            const t0 = this._timestamps[0];
            if (this._timestamps.length >= 2) {
                const t1 = this._timestamps[1];
                const interval = t1 - t0;
                return t0 + floatIndex * interval;
            }
            return t0;
        }

        // Extrapolate if outside range
        if (this._timestamps.length >= 2) {
            const lastIndex = this._timestamps.length - 1;
            const interval = this._estimateInterval();
            if (floatIndex < 0) {
                return this._timestamps[0] + (floatIndex * interval);
            } else {
                return this._timestamps[lastIndex] + ((floatIndex - lastIndex) * interval);
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
                const interval = this._estimateInterval();
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
                const interval = this._estimateInterval();
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

    /** Tek cizimin kalici verisi: toJSON + pane + (varsayilandan farkliysa) intervalsVisibilities */
    private static _drawingToJSON(drawing: Drawing): SerializedDrawing {
        const json: SerializedDrawing = { ...drawing.toJSON(), paneId: drawing.paneId ?? null };
        const iv = drawing.intervalsVisibilities;
        if (iv && !isDefaultIntervalsVisibilities(iv)) json.intervalsVisibilities = { ...iv };
        else delete json.intervalsVisibilities;
        return json;
    }

    /** Serialize all drawings to JSON for persistence */
    serialize(): SerializedDrawing[] {
        const serialized: SerializedDrawing[] = [];

        for (const drawing of this._drawings.values()) {
            // Only save complete drawings (not in-progress ones)
            if (drawing.state === 'creating') continue;
            // Metin girisi bekleyen yeni Text: editor kapanmadan kalici veriye yazilmaz
            if (this._pendingTextId === drawing.id) continue;
            // Zaman dilimine gore gizli cizimler de kaydedilir (filtre yalnizca gosterim/etkilesim icin)
            serialized.push(DrawingManager._drawingToJSON(drawing));
        }

        return serialized;
    }

    /** Deserialize drawings from JSON and add them to the chart */
    deserialize(data: SerializedDrawing[]): void {
        // Disaridan (state manager: sembol degisimi / yukleme) gelen yukleme: gecmis sifirlanir
        this._restore(data);
        this.resetHistory();
    }

    /** Verilen listeden tum cizimleri yeniden kurar (gecmise dokunmaz) */
    private _restore(data: SerializedDrawing[]): void {
        // Clear all existing drawings first
        this._drawings.clear();
        this._activeDrawing = null;
        this._selectedDrawing = null;

        for (const item of data) {
            const drawing = this._createFromSerialized(item);
            if (drawing) {
                this._drawings.set(drawing.id, drawing);
            }
        }

        if (this._hoveredForAddText !== null && !this._drawings.has(this._hoveredForAddText)) {
            this._hoveredForAddText = null;
        }
        if (this._pendingTextId !== null && !this._drawings.has(this._pendingTextId)) {
            this._pendingTextId = null;
        }

        this._drawingsChanged.fire();
    }

    /** Tek bir serilestirilmis veriden cizim nesnesi uretir (id korunur) */
    private _createFromSerialized(item: SerializedDrawing): Drawing | null {
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
            case 'arrowMarkedLeft':
            case 'arrowMarkedRight':
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
            case 'doubleCurve':
                drawing = DoubleCurveDrawing.fromJSON(item);
                break;
            case 'cyclicLines':
            case 'timeCycles':
            case 'sineLine':
                drawing = CycleToolBase.fromJSON(item);
                break;
            case 'xabcdPattern':
                drawing = XABCDPatternDrawing.fromJSON(item);
                break;
            case 'cypherPattern':
                drawing = CypherPatternDrawing.fromJSON(item);
                break;
            case 'elliotImpulse':
                drawing = ElliottImpulseDrawing.fromJSON(item);
                break;
            case 'elliotCorrection':
                drawing = ElliottCorrectionDrawing.fromJSON(item);
                break;
            case 'elliotTriangle':
                drawing = ElliottTriangleDrawing.fromJSON(item);
                break;
            case 'elliotDoubleCombo':
                drawing = ElliottDoubleComboDrawing.fromJSON(item);
                break;
            case 'elliotTripleCombo':
                drawing = ElliottTripleComboDrawing.fromJSON(item);
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
            case 'note':
            case 'priceNote':
            case 'pin':
            case 'signpost':
            case 'comment':
            case 'table':
                drawing = NoteToolBase.fromJSON(item);
                break;
            case 'flagMarked':
                drawing = FlagMarkedDrawing.fromJSON(item);
                break;
            case 'pitchfork':
            case 'schiffPitchfork':
            case 'modifiedSchiffPitchfork':
            case 'insidePitchfork':
            case 'pitchfan':
                drawing = PitchToolBase.fromJSON(item);
                break;
            case 'fibTimeZone':
            case 'trendBasedFibTime':
            case 'fibSpeedResistanceFan':
                drawing = FibTimeToolBase.fromJSON(item);
                break;
            case 'fibSpeedResistanceArcs':
            case 'fibCircles':
            case 'fibSpiral':
            case 'fibWedge':
                drawing = FibCircleToolBase.fromJSON(item);
                break;
            case 'gannBox':
            case 'gannSquareFixed':
            case 'gannSquare':
            case 'gannFan':
                drawing = GannToolBase.fromJSON(item);
                break;
            case 'disjointChannel':
            case 'flatTopBottom':
                drawing = ChannelLinesTool.fromJSON(item);
                break;
            case 'projection':
                drawing = ProjectionDrawing.fromJSON(item);
                break;
            case 'positionForecast':
                drawing = PositionForecastDrawing.fromJSON(item);
                break;
            case 'barsPattern':
                drawing = BarsPatternDrawing.fromJSON(item);
                break;
            case 'ghostFeed':
                drawing = GhostFeedDrawing.fromJSON(item);
                break;
            case 'anchoredVwap':
                drawing = AnchoredVwapDrawing.fromJSON(item);
                break;
            case 'fixedRangeVolumeProfile':
            case 'anchoredVolumeProfile':
                drawing = VolumeProfileDrawing.fromJSON(item);
                break;
            // Add more types as needed...
            default:
                console.warn(`Unknown drawing type: ${item.type}`);
                return null;
        }

        if (drawing) {
            drawing.paneId = item.paneId ?? null;
            // Eski kayitlarda alan yok -> varsayilan (hepsi gorunur); varsayilansa alan hic atanmaz
            if (item.intervalsVisibilities) {
                const iv = normalizeIntervalsVisibilities(item.intervalsVisibilities);
                if (!isDefaultIntervalsVisibilities(iv)) drawing.intervalsVisibilities = iv;
            }
        }
        return drawing;
    }

    // =========================================================================
    // History (Undo / Redo)
    // =========================================================================

    get canUndo(): boolean {
        return this._historyIndex > 0;
    }

    get canRedo(): boolean {
        return this._historyIndex < this._history.length - 1;
    }

    /** Mevcut cizim durumunun karsilastirilabilir anlik goruntusu (secim durumu yok sayilir) */
    private _snapshot(): string {
        return JSON.stringify(this.serialize().map(d => ({
            ...d,
            state: 'complete' as const,
        })));
    }

    /** Gecmisi mevcut durumla sifirlar (sembol degisimi / disaridan yukleme) */
    resetHistory(): void {
        this._history = [this._snapshot()];
        this._historyIndex = 0;
        this._lastCoalesceKey = null;
    }

    /**
     * Tamamlanmis bir kullanici islemi sonrasi gecmise tek kayit ekler.
     * Durum degismediyse kayit eklenmez. coalesceKey verilirse ayni anahtarla
     * kisa sure icinde gelen cagrilar (ayar modalinde surukleme vb.) tek kayitta birlesir.
     */
    commitHistory(coalesceKey?: string): void {
        const snap = this._snapshot();
        if (snap === this._history[this._historyIndex]) return;

        const now = Date.now();
        if (coalesceKey && coalesceKey === this._lastCoalesceKey
            && now - this._lastCommitTime < 1000 && this._historyIndex > 0
            && this._historyIndex === this._history.length - 1) {
            this._history[this._historyIndex] = snap;
            // Birlesen kayit bir onceki ile ayniysa (ayar geri alindi) basi at
            if (this._historyIndex > 0 && snap === this._history[this._historyIndex - 1]) {
                this._history.pop();
                this._historyIndex--;
                // Bir sonraki degisiklik bu (gercek) onceki kaydin uzerine birlesmesin
                this._lastCoalesceKey = null;
                return;
            }
        } else {
            this._history.length = this._historyIndex + 1; // redo dalini at
            this._history.push(snap);
            if (this._history.length > MAX_HISTORY) {
                this._history.shift();
            }
            this._historyIndex = this._history.length - 1;
        }
        this._lastCoalesceKey = coalesceKey ?? null;
        this._lastCommitTime = now;
    }

    /**
     * Ayar modali / attribute bar degisikligi: cizim nesnesi yerinde degistirildigi icin
     * once drawingsChanged tetiklenir (otomatik kayit + yeniden cizim), sonra coalesce'li tek gecmis kaydi eklenir.
     */
    commitSettingsChange(drawingId: string): void {
        this._drawingsChanged.fire();
        this.commitHistory(`settings:${drawingId}`);
    }

    /** Olusturulmakta olan (yarim) cizimi iptal eder; iptal edilecek bir sey yoksa false */
    cancelActiveDrawing(): boolean {
        const active = this._activeDrawing;
        if (!active || active.state !== 'creating') return false;
        this._drawings.delete(active.id);
        this._activeDrawing = null;
        this._drawingsChanged.fire();
        return true;
    }

    undo(): boolean {
        // Cizim surerken Ctrl+Z once yarim cizimi iptal eder (Escape gibi); gecmise dokunmaz
        if (this.cancelActiveDrawing()) return true;
        if (!this.canUndo) return false;
        this._historyIndex--;
        this._applyHistory();
        return true;
    }

    redo(): boolean {
        if (!this.canRedo) return false;
        this._historyIndex++;
        this._applyHistory();
        return true;
    }

    private _applyHistory(): void {
        const hadSelection = this._selectedDrawing !== null;
        this._lastCoalesceKey = null;
        this._restore(JSON.parse(this._history[this._historyIndex]) as SerializedDrawing[]);
        if (hadSelection) {
            this._selectionChanged.fire(null);
        }
        this._historyRestored.fire();
    }

    // =========================================================================
    // Clone / Copy / Paste
    // =========================================================================

    /** Verilen cizimin kopyasini yeni id ile uretir (yonetime eklemez) */
    private _duplicate(source: Drawing, timeOffset: number = 0): Drawing | null {
        const json = JSON.parse(JSON.stringify(DrawingManager._drawingToJSON(source))) as SerializedDrawing;
        json.id = generateDrawingId();
        json.state = 'complete';
        if (timeOffset !== 0) {
            for (const pt of json.points) pt.time += timeOffset;
        }
        return this._createFromSerialized(json);
    }

    private _selectNew(drawing: Drawing): void {
        if (this._selectedDrawing) {
            this._selectedDrawing.state = 'complete';
        }
        this._drawings.set(drawing.id, drawing);
        this._selectedDrawing = drawing;
        drawing.state = 'selected';
        this._selectionChanged.fire(drawing);
        this._drawingsChanged.fire();
    }

    /**
     * Cizimi ayni konumda kopyalar ve kopyayi secer (Ctrl/Cmd+surukle klonlamasi).
     * Gecmis kaydi cagiran tarafindan (surukleme bitince) eklenir.
     */
    cloneDrawing(id: string): Drawing | null {
        const source = this._drawings.get(id);
        if (!source || source.locked) return null;
        const copy = this._duplicate(source);
        if (!copy) return null;
        this._selectNew(copy);
        return copy;
    }

    /** Secili cizimi panoya kopyalar */
    copySelected(): boolean {
        const sel = this._selectedDrawing;
        if (!sel) return false;
        _drawingClipboard = JSON.parse(JSON.stringify(DrawingManager._drawingToJSON(sel))) as SerializedDrawing;
        return true;
    }

    get hasClipboard(): boolean {
        if (!_drawingClipboard) return false;
        // Kaynak pane bu grafikte yoksa yapistirma yapilamaz (pasteFromClipboard ile ayni kontrol)
        const srcPane = _drawingClipboard.paneId ?? null;
        if (srcPane !== null && this._paneExists && !this._paneExists(srcPane)) return false;
        return true;
    }

    /** Panodaki cizimi yeni id ile, ~5 bar saga kaydirarak yapistirir ve secer */
    pasteFromClipboard(): Drawing | null {
        if (!_drawingClipboard) return null;
        const item = JSON.parse(JSON.stringify(_drawingClipboard)) as SerializedDrawing;
        item.id = generateDrawingId();
        item.state = 'complete';
        // Kaynak panele yapistir; o pane bu grafikte yoksa (ana pane degilse) yapistirma
        const srcPane = item.paneId ?? null;
        if (srcPane !== null && this._paneExists && !this._paneExists(srcPane)) return null;
        item.paneId = srcPane;
        if (this._timestamps.length >= 2) {
            const offset = this._estimateInterval() * 5;
            for (const pt of item.points) pt.time += offset;
        }
        const drawing = this._createFromSerialized(item);
        if (!drawing) return null;
        this._selectNew(drawing);
        this.commitHistory();
        return drawing;
    }

    /** Cizimin kopyasini ~5 bar saga kaydirarak ekler ve secer (baglam menusu Clone; kilitli cizimde de calisir) */
    duplicateDrawing(id: string): Drawing | null {
        const source = this._drawings.get(id);
        if (!source) return null;
        const offset = this._timestamps.length >= 2 ? this._estimateInterval() * 5 : 0;
        const copy = this._duplicate(source, offset);
        if (!copy) return null;
        this._selectNew(copy);
        this.commitHistory();
        return copy;
    }

    /** Programmatically adds a horizontal line at `price` on the main pane (selects it, one history step). */
    addHorizontalLineAt(price: number): Drawing | null {
        if (!isFinite(price)) return null;
        const drawing: Drawing = new HorizontalLineDrawing();
        const time = this._timestamps.length > 0 ? this._timestamps[this._timestamps.length - 1] : Date.now();
        drawing.points = [{ time, price }];
        drawing.paneId = null;
        this._selectNew(drawing);
        drawing.state = 'selected';
        this.commitHistory();
        return drawing;
    }

    /** Cizimi en uste (en son cizilen) tasir */
    bringToFront(id: string): void {
        const drawing = this._drawings.get(id);
        if (!drawing) return;
        this._drawings.delete(id);
        this._drawings.set(id, drawing);
        this._drawingsChanged.fire();
        this.commitHistory();
    }

    /** Cizimi en alta (ilk cizilen) tasir */
    sendToBack(id: string): void {
        const drawing = this._drawings.get(id);
        if (!drawing) return;
        const rest = Array.from(this._drawings.entries()).filter(([key]) => key !== id);
        this._drawings.clear();
        this._drawings.set(id, drawing);
        for (const [key, value] of rest) this._drawings.set(key, value);
        this._drawingsChanged.fire();
        this.commitHistory();
    }

    /**
     * Cizimi cizim sirasinda verilen konuma tasir (index: sonuc listesindeki 0-tabanli konum, 0 = en alt).
     * Sira degisirse tek gecmis kaydi eklenir; serialize() sirayi korur.
     */
    moveDrawingTo(id: string, index: number): void {
        const drawing = this._drawings.get(id);
        if (!drawing) return;
        const entries = Array.from(this._drawings.entries()).filter(([key]) => key !== id);
        const at = Math.max(0, Math.min(entries.length, Math.floor(index)));
        const before = Array.from(this._drawings.keys()).indexOf(id);
        if (before === at) return;
        entries.splice(at, 0, [id, drawing]);
        this._drawings.clear();
        for (const [key, value] of entries) this._drawings.set(key, value);
        this._drawingsChanged.fire();
        this.commitHistory();
    }

    /**
     * Cizimi kimlikle secer (nesne agaci satir tiklamasi). Gizli / mevcut zaman diliminde gorunmeyen
     * ya da yarim cizimler secilemez; basarili ise true.
     */
    selectDrawingById(id: string): boolean {
        const drawing = this._drawings.get(id);
        if (!drawing || this._drawingsHidden || !drawing.visible || drawing.state === 'creating'
            || !this.isVisibleOnCurrentTimeframe(drawing)) return false;
        if (this._selectedDrawing === drawing) return true;
        if (this._selectedDrawing) this._selectedDrawing.state = 'complete';
        this._selectedDrawing = drawing;
        drawing.state = 'selected';
        this._selectionChanged.fire(drawing);
        this._drawingsChanged.fire();
        return true;
    }

    /** Cizimi kilitler / kilidini acar */
    setDrawingLocked(id: string, locked: boolean): void {
        const drawing = this._drawings.get(id);
        if (!drawing) return;
        drawing.locked = locked;
        this._drawingsChanged.fire();
        this.commitHistory();
    }

    /** Cizimi gizler / gosterir (gizlenen cizimin secimi kalkar) */
    setDrawingVisible(id: string, visible: boolean): void {
        const drawing = this._drawings.get(id);
        if (!drawing) return;
        drawing.visible = visible;
        if (!visible && this._selectedDrawing === drawing) {
            drawing.state = 'complete';
            this._selectedDrawing = null;
            this._selectionChanged.fire(null);
        }
        this._drawingsChanged.fire();
        this.commitHistory();
    }

    /** Cizim bazinda gizlenmis (visible=false) cizim sayisi */
    get hiddenDrawingCount(): number {
        let n = 0;
        for (const d of this._drawings.values()) if (!d.visible) n++;
        return n;
    }

    /** Cizim bazinda gizlenmis tum cizimleri gosterir (tek gecmis kaydi) */
    showHiddenDrawings(): void {
        let changed = false;
        for (const d of this._drawings.values()) {
            if (!d.visible) { d.visible = true; changed = true; }
        }
        if (!changed) return;
        this._drawingsChanged.fire();
        this.commitHistory();
    }

    /** Check if there are any drawings */
    hasDrawings(): boolean {
        return this._drawings.size > 0;
    }

    getDrawingsForPane(paneId: string | null): Drawing[] {
        if (this._drawingsHidden) return [];
        return this.drawings.filter((drawing) =>
            (drawing.paneId ?? null) === paneId && this.isVisibleOnCurrentTimeframe(drawing));
    }

    // --- Zaman dilimlerinde gorunurluk ---

    /** Grafigin mevcut zaman dilimi (chart-widget acilista ve zaman dilimi degisince cagirir) */
    get timeframe(): string {
        return this._timeframe;
    }

    setTimeframe(timeframe: string): void {
        if (this._timeframe === timeframe) return;
        this._timeframe = timeframe;
        this._parsedTimeframe = parseTimeframe(timeframe);
        // Yeni zaman diliminde gizlenen secili cizimin secimi kalkar
        const sel = this._selectedDrawing;
        if (sel && !this.isVisibleOnCurrentTimeframe(sel)) {
            sel.state = 'complete';
            this._selectedDrawing = null;
            this._selectionChanged.fire(null);
        }
        if (this._hoveredDrawingId !== null) {
            const hd = this._drawings.get(this._hoveredDrawingId);
            if (!hd || !this.isVisibleOnCurrentTimeframe(hd)) this._hoveredDrawingId = null;
        }
    }

    /** Cizim mevcut zaman diliminde gorunur mu (yalnizca intervalsVisibilities; visible/global gizleme ayri) */
    isVisibleOnCurrentTimeframe(drawing: Drawing): boolean {
        return isVisibleOnTimeframe(drawing.intervalsVisibilities, this._parsedTimeframe);
    }

    /** Cizim/hit-test icin: global gizleme kapali ve mevcut zaman diliminde gorunur cizimler (kopya liste) */
    get displayableDrawings(): Drawing[] {
        if (this._drawingsHidden) return [];
        return this.drawings.filter((d) => this.isVisibleOnCurrentTimeframe(d));
    }

    /** Hazir gorunurluk ayarini (mevcut zaman dilimine gore) cizime uygular; tek gecmis kaydi */
    applyIntervalsPreset(id: string, preset: IntervalsPreset): void {
        const drawing = this._drawings.get(id);
        if (!drawing) return;
        const iv = buildIntervalsPreset(preset, this._parsedTimeframe);
        if (isDefaultIntervalsVisibilities(iv)) delete drawing.intervalsVisibilities;
        else drawing.intervalsVisibilities = iv;
        if (this._selectedDrawing === drawing && !this.isVisibleOnCurrentTimeframe(drawing)) {
            drawing.state = 'complete';
            this._selectedDrawing = null;
            this._selectionChanged.fire(null);
        }
        this._drawingsChanged.fire();
        this.commitHistory();
    }

    /** Cizimin gorunurluk ayarini (yoksa varsayilan) dondurur; kopya degil, UI dogrudan degistirir */
    getIntervalsVisibilities(drawing: Drawing): IntervalsVisibilities {
        return ensureIntervalsVisibilities(drawing);
    }

    /**
     * Apply magnet snap: snaps to the bar under the cursor (x) and to its nearest OHLC / indicator value (y).
     * Bar snapping only where a bar exists (within half a bar spacing); blank future/past space stays free.
     * `modeOverride` (e.g. Ctrl toggle) replaces magnetMode for this call only. Never snaps on indicator panes.
     */
    applyMagnet(x: number, y: number, barData: { time: number; open: number; high: number; low: number; close: number }[], modeOverride?: 'none' | 'weak' | 'strong'): { x: number; y: number; snapped: boolean; snappedPrice?: number; snappedX?: number } {
        const mode = modeOverride ?? this._magnetMode;
        if (mode === 'none' || !this._timeScale || !this._priceScale || this._activePaneId !== null) {
            return { x, y, snapped: false };
        }

        const n = barData.length;
        if (n === 0) {
            return { x, y, snapped: false };
        }

        // Bar under the cursor: time scale index -> timestamp -> binary search in bar data
        const floatIndex = this._timeScale.coordinateToFloatIndex(coordinate(x));
        if (!isFinite(floatIndex)) {
            return { x, y, snapped: false };
        }
        const idx = Math.round(floatIndex);
        if (idx < 0 || idx > this._timestamps.length - 1) {
            return { x, y, snapped: false };
        }
        const barTime = this._timestamps[idx];
        let lo = 0, hi = n - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (barData[mid].time < barTime) lo = mid + 1; else hi = mid;
        }
        if (barData[lo].time !== barTime) {
            return { x, y, snapped: false };
        }
        const closestBar = barData[lo];
        const snappedX = this._timeScale.indexToCoordinate(timePointIndex(idx)) as number;
        const spacing = this._timeScale.barSpacing;
        if (spacing > 0 && Math.abs(x - snappedX) > spacing / 2 + 0.5) {
            return { x, y, snapped: false };
        }

        // Get OHLC values as pixel y coordinates
        const ohlcPrices = [closestBar.open, closestBar.high, closestBar.low, closestBar.close];
        const ohlcPixels: { price: number; pixelY: number }[] = [];

        for (const price of ohlcPrices) {
            const pixelY = this.priceToPixel(price);
            if (pixelY !== null) {
                ohlcPixels.push({ price, pixelY });
            }
        }

        // Snap to indicators: overlay indicator values at this bar are extra price candidates
        if (this._snapToIndicators && this._indicatorPriceProvider) {
            for (const price of this._indicatorPriceProvider(closestBar.time)) {
                if (!isFinite(price)) continue;
                const pixelY = this.priceToPixel(price);
                if (pixelY !== null) {
                    ohlcPixels.push({ price, pixelY });
                }
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
            return { x: snappedX, y, snapped: false, snappedX };
        }

        // Weak magnet: only snap if within threshold
        // Strong magnet: always snap
        const threshold = mode === 'weak' ? this._magnetThreshold : Infinity;

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
        this._modeChanged.destroy();
        this._selectionChanged.destroy();
    }

    /**
     * Estimate the time interval (bar spacing) more robustly
     * by looking at recent bars and finding the minimal positive difference.
     * This avoids using large gaps (weekend/holidays) as the interval which causes drawing instability.
     */
    private _estimateInterval(): number {
        if (this._timestamps.length < 2) return 60 * 1000; // Default 1 min fallback

        // Look at last 50 bars to find minimal interval
        let minDiff = Infinity;
        const lookback = Math.min(this._timestamps.length - 1, 50);
        let found = false;

        for (let i = 0; i < lookback; i++) {
            const idx = this._timestamps.length - 1 - i;
            const diff = this._timestamps[idx] - this._timestamps[idx - 1];
            if (diff > 0 && diff < minDiff) {
                minDiff = diff;
                found = true;
            }
        }

        // If no valid diff found or it's still infinity, fallback to last diff
        if (!found || minDiff === Infinity) {
            const lastIdx = this._timestamps.length - 1;
            return this._timestamps[lastIdx] - this._timestamps[lastIdx - 1];
        }

        return minDiff;
    }
}
