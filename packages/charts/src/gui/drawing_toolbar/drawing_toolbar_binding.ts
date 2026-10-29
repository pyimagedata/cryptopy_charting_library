/**
 * Drawing toolbar binding: the adapter between a DrawingToolbarWidget and the charts it drives.
 *
 * Used by a standalone ChartWidget (scope = that single chart) and by MultiChartLayout (one shared
 * toolbar, scope = every chart of the layout, the ACTIVE one receives the armed tool).
 *
 * Scope of the toolbar actions (TradingView behaviour):
 *  - drawing / eraser / measure / zoom tools, remove drawings, object tree: the active chart
 *  - cursor type, magnet (+ snap to indicators), stay in drawing mode, lock all, hide all: every chart
 */
import type { Delegate } from '../../helpers/delegate';
import type { DrawingManager, DrawingMode } from '../../drawings';
import { CURSOR_KINDS } from '../chart_widget/interaction-tools';
import type { InteractionTools } from '../chart_widget/interaction-tools';
import type { DrawingToolbarWidget } from './drawing_toolbar_widget';

/** What the binding needs from a chart (implemented by ChartWidget). */
export interface DrawingToolbarChart {
    readonly drawingManager: DrawingManager;
    readonly interactionTools: InteractionTools;
    readonly objectTreeVisible: boolean;
    readonly objectTreeVisibilityChanged: Delegate<boolean>;
    refreshDrawings(): void;
    toggleObjectTree(): void;
}

export interface DrawingToolbarScope {
    getActive(): DrawingToolbarChart | null;
    getAll(): DrawingToolbarChart[];
}

/** Toolbar tool id -> drawing mode (ids not listed here are cursors / interaction tools => 'none'). */
const TOOL_TO_MODE: Record<string, DrawingMode> = {
    'cursor': 'none',
    'crosshair': 'none',
    'trendLine': 'trendLine',
    'horizontalLine': 'horizontalLine',
    'verticalLine': 'verticalLine',
    'ray': 'ray',
    'extendedLine': 'extendedLine',
    'parallelChannel': 'parallelChannel',
    'regressionTrend': 'regressionTrend',
    'arrow': 'arrow',
    'arrowMarker': 'arrowMarker',
    'arrowMarkedUp': 'arrowMarkedUp',
    'arrowMarkedDown': 'arrowMarkedDown',
    'arrowMarkedLeft': 'arrowMarkedLeft',
    'arrowMarkedRight': 'arrowMarkedRight',
    'rectangle': 'rectangle',
    'rotatedRectangle': 'rotatedRectangle',
    'ellipse': 'ellipse',
    'triangle': 'triangle',
    'arc': 'arc',
    'path': 'path',
    'circle': 'circle',
    'polyline': 'polyline',
    'curve': 'curve',
    'doubleCurve': 'doubleCurve',
    'cyclicLines': 'cyclicLines',
    'timeCycles': 'timeCycles',
    'sineLine': 'sineLine',
    'xabcdPattern': 'xabcdPattern',
    'cypherPattern': 'cypherPattern',
    'fibRetracement': 'fibRetracement',
    'fibExtension': 'fibExtension',
    'fibChannel': 'fibChannel',
    'brush': 'brush',
    'highlighter': 'highlighter',
    'infoLine': 'infoLine',
    'trendAngle': 'trendAngle',
    'horizontalRay': 'horizontalRay',
    'crossLine': 'crossLine',
    'xabcd': 'xabcdPattern',
    'cypher': 'cypherPattern',
    'elliotImpulse': 'elliotImpulse',
    'elliotCorrection': 'elliotCorrection',
    'elliotTriangle': 'elliotTriangle',
    'elliotDoubleCombo': 'elliotDoubleCombo',
    'elliotTripleCombo': 'elliotTripleCombo',
    'threeDrives': 'threeDrives',
    'headShoulders': 'headShoulders',
    'abcd': 'abcd',
    'trianglePattern': 'trianglePattern',
    'longPosition': 'longPosition',
    'shortPosition': 'shortPosition',
    'priceRange': 'priceRange',
    'dateRange': 'dateRange',
    'datePriceRange': 'datePriceRange',
    'anchoredVwap': 'anchoredVwap',
    'fixedRangeVolumeProfile': 'fixedRangeVolumeProfile',
    'anchoredVolumeProfile': 'anchoredVolumeProfile',
    'pitchfork': 'pitchfork',
    'schiffPitchfork': 'schiffPitchfork',
    'modifiedSchiffPitchfork': 'modifiedSchiffPitchfork',
    'insidePitchfork': 'insidePitchfork',
    'pitchfan': 'pitchfan',
    'fibTimeZone': 'fibTimeZone',
    'trendBasedFibTime': 'trendBasedFibTime',
    'fibSpeedResistanceFan': 'fibSpeedResistanceFan',
    'fibSpeedResistanceArcs': 'fibSpeedResistanceArcs',
    'fibCircles': 'fibCircles',
    'fibSpiral': 'fibSpiral',
    'fibWedge': 'fibWedge',
    'gannBox': 'gannBox',
    'gannSquareFixed': 'gannSquareFixed',
    'gannSquare': 'gannSquare',
    'gannFan': 'gannFan',
    'disjointChannel': 'disjointChannel',
    'flatTopBottom': 'flatTopBottom',
    'projection': 'projection',
    'positionForecast': 'positionForecast',
    'barsPattern': 'barsPattern',
    'ghostFeed': 'ghostFeed',
    'text': 'text',
    'callout': 'callout',
    'priceLabel': 'priceLabel',
    'note': 'note',
    'priceNote': 'priceNote',
    'pin': 'pin',
    'signpost': 'signpost',
    'comment': 'comment',
    'table': 'table',
    'flagMarked': 'flagMarked',
    'sticker': 'sticker',
};

export class DrawingToolbarBinding {
    private readonly _chartSubs: Array<{ delegate: Delegate<any>; fn: (arg: any) => void }> = [];
    private readonly _toolbarSubs: Array<{ delegate: Delegate<any>; fn: (arg: any) => void }> = [];
    private readonly _attached = new Set<DrawingToolbarChart>();

    constructor(private readonly _toolbar: DrawingToolbarWidget, private readonly _scope: DrawingToolbarScope) {
        const tb = _toolbar;
        // First the tool itself; weak/strong magnet never change the active tool (they do not fire toolChanged)
        this._onToolbar(tb.toolChanged, (tool) => this._onToolChanged(tool));
        this._onToolbar(tb.keepDrawingToggled, (keep) => this._forAll((c) => { c.drawingManager.keepDrawing = keep; }));
        this._onToolbar(tb.snapToIndicatorsToggled, (on) => this._forAll((c) => { c.drawingManager.snapToIndicators = on; }));
        this._onToolbar(tb.magnetToggled, () => this._forAll((c) => { c.drawingManager.magnetMode = tb.magnetMode; }));
        this._onToolbar(tb.lockToggled, (locked) => this._forAll((c) => {
            c.drawingManager.isLocked = locked;
            c.refreshDrawings();
        }));
        this._onToolbar(tb.visibilityToggled, (hidden) => this._forAll((c) => {
            // view flag: the drawings' own visible state and history are untouched
            c.drawingManager.drawingsHidden = hidden;
            c.refreshDrawings();
        }));
        this._onToolbar(tb.deleteAllClicked, () => this._scope.getActive()?.drawingManager.deleteAll());
        this._onToolbar(tb.objectTreeToggled, () => this._scope.getActive()?.toggleObjectTree());
        for (const chart of this._scope.getAll()) this.attachChart(chart);
    }

    /** Applies the toolbar's global state to a chart and follows its mode / visibility / object tree changes. */
    attachChart(chart: DrawingToolbarChart): void {
        if (this._attached.has(chart)) return;
        this._attached.add(chart);
        const tb = this._toolbar;
        const dm = chart.drawingManager;
        dm.keepDrawing = tb.keepDrawing;
        dm.snapToIndicators = tb.snapToIndicators;
        dm.magnetMode = tb.magnetMode;
        dm.isLocked = tb.isLocked;
        dm.drawingsHidden = tb.isVisibilityHidden;

        this._onChart(dm.modeChanged, (mode) => {
            // Back to the last chosen cursor (crosshair / arrow / dot / demonstration);
            // an active Eraser / Measure / Zoom In stays selected
            if (chart === this._scope.getActive() && mode === 'none' && chart.interactionTools.mode === 'none') {
                tb.setActiveTool(chart.interactionTools.lastCursor);
            }
        });
        this._onChart(dm.drawingsChanged, () => {
            // Hiding can be switched off by the manager (a drawing starts): sync the toolbar button, layout-wide
            if (chart !== this._scope.getActive() || tb.isVisibilityHidden === dm.drawingsHidden) return;
            tb.isVisibilityHidden = dm.drawingsHidden;
            this._forAll((c) => {
                if (c === chart) return;
                c.drawingManager.drawingsHidden = dm.drawingsHidden;
                c.refreshDrawings();
            });
        });
        this._onChart(chart.objectTreeVisibilityChanged, (visible) => {
            if (chart === this._scope.getActive()) tb.setObjectTreeActive(visible);
        });
        if (chart === this._scope.getActive()) tb.setObjectTreeActive(chart.objectTreeVisible);
    }

    /**
     * The active chart changed: the armed tool moves to the new chart (the previous one drops back to the
     * cursor, cancelling an unfinished drawing) and the toolbar mirrors the new chart's state.
     */
    onActiveChartChanged(prev: DrawingToolbarChart | null, next: DrawingToolbarChart | null): void {
        if (prev === next) return;
        const tb = this._toolbar;
        if (prev && this._attached.has(prev) && this._isArmed(prev)) {
            this._applyTool(prev, prev.interactionTools.lastCursor);
        }
        if (!next) return;
        const tool = tb.activeTool;
        if (tool !== 'cursor' && !CURSOR_KINDS.includes(tool)) this._applyTool(next, tool);
        tb.isLocked = next.drawingManager.isLocked;
        tb.isVisibilityHidden = next.drawingManager.drawingsHidden;
        tb.setObjectTreeActive(next.objectTreeVisible);
    }

    /** Cancels the armed tool everywhere (e.g. the active chart is about to be removed). */
    cancelArmedTool(): void {
        const tool = this._toolbar.activeTool;
        if (tool === 'cursor' || CURSOR_KINDS.includes(tool)) return;
        const active = this._scope.getActive();
        // toolChanged resets every chart to the cursor
        this._toolbar.setActiveTool((active?.interactionTools.lastCursor ?? 'crosshair') as any);
    }

    detach(): void {
        for (const s of this._chartSubs) s.delegate.unsubscribe(s.fn);
        for (const s of this._toolbarSubs) s.delegate.unsubscribe(s.fn);
        this._chartSubs.length = 0;
        this._toolbarSubs.length = 0;
        this._attached.clear();
    }

    // --- internals ---

    private _onToolbar<T>(delegate: Delegate<T>, fn: (arg: T) => void): void {
        delegate.subscribe(fn);
        this._toolbarSubs.push({ delegate, fn });
    }

    private _onChart<T>(delegate: Delegate<T>, fn: (arg: T) => void): void {
        delegate.subscribe(fn);
        this._chartSubs.push({ delegate, fn });
    }

    private _forAll(fn: (chart: DrawingToolbarChart) => void): void {
        for (const chart of this._scope.getAll()) fn(chart);
    }

    private _isArmed(chart: DrawingToolbarChart): boolean {
        return chart.drawingManager.mode !== 'none' || chart.interactionTools.mode !== 'none';
    }

    private _onToolChanged(tool: string): void {
        const active = this._scope.getActive();
        const isCursor = CURSOR_KINDS.includes(tool);
        for (const chart of this._scope.getAll()) {
            if (chart === active || isCursor) {
                this._applyTool(chart, tool);
            } else if (this._isArmed(chart)) {
                this._applyTool(chart, chart.interactionTools.lastCursor);
            }
        }
    }

    private _applyTool(chart: DrawingToolbarChart, tool: string): void {
        const dm = chart.drawingManager;
        const it = chart.interactionTools;
        // Interaction tools / cursors first: the drawing-mode reset below must not override an Eraser / Measure / Zoom In
        if (it.setTool(tool)) {
            it.syncHost(dm.mode !== 'none');
            chart.refreshDrawings();
        }
        let mode: DrawingMode | undefined = TOOL_TO_MODE[tool];
        if (!mode && tool.startsWith('sticker-')) {
            mode = 'sticker';
            const emoji = this._toolbar.getToolIcon(tool);
            if (emoji) dm.stickerContent = emoji;
        }
        dm.setMode(mode || 'none');
    }
}
