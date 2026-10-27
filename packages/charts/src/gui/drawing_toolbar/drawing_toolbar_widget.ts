/**
 * Left Drawing Toolbar Widget - TradingView-style with grouped flyout menus
 */

import { Delegate } from '../../helpers/delegate';
import { t } from '../../helpers/translations';
import { DRAWING_ICONS } from './icons';

// SVG Icons for drawing tools
const KEEP_DRAWING_STORAGE_KEY = 'charts.keepDrawingMode';
const SNAP_INDICATORS_STORAGE_KEY = 'charts.snapToIndicators';
const MAGNET_MODE_STORAGE_KEY = 'charts.magnetMode';
/** Cursors and chart interaction tools: not drawing tools (selecting them must not unlock drawings) */
const NON_DRAWING_TOOLS = ['crosshair', 'arrowCursor', 'cursor', 'dotCursor', 'demoCursor', 'eraser', 'measure', 'zoomIn'];
/** Tools living in the cursor group (the group button shows the last chosen one) */
const CURSOR_GROUP_TOOLS = ['crosshair', 'arrowCursor', 'dotCursor', 'demoCursor', 'eraser'];



export type DrawingTool = string;

interface ToolItem {
    id: string;
    name: string;
    icon: string;
    shortcut?: string;
    favorite?: boolean;
}

interface ToolGroup {
    id: string;
    name: string;
    defaultIcon: string;
    display?: 'list' | 'grid';
    columns?: number;
    tools: ToolItem[];
}

const OBJECT_TREE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28"><g fill="none" stroke="currentColor"><rect x="5.5" y="6.5" width="5" height="4" rx="1"/><rect x="12.5" y="12.5" width="5" height="4" rx="1"/><rect x="12.5" y="18.5" width="5" height="4" rx="1"/><path d="M8 10.5v10h4.5M8 14.5h4.5"/><path d="M19.5 8.5H23M19.5 14.5H23M19.5 20.5H23" stroke-linecap="round"/></g></svg>`;

const TOOL_GROUPS: ToolGroup[] = [
    {
        id: 'cursor',
        name: 'Cursor',
        defaultIcon: DRAWING_ICONS.crosshair,
        tools: [
            { id: 'crosshair', name: 'Crosshair', icon: DRAWING_ICONS.crosshair },
            { id: 'arrowCursor', name: 'Cursor', icon: DRAWING_ICONS.arrowCursor },
            { id: 'dotCursor', name: 'Dot', icon: DRAWING_ICONS.dotCursor },
            { id: 'demoCursor', name: 'Demonstration', icon: DRAWING_ICONS.demoCursor },
            { id: 'eraser', name: 'Eraser', icon: DRAWING_ICONS.eraser },
        ]
    },
    {
        id: 'lines',
        name: 'Lines',
        defaultIcon: DRAWING_ICONS.trendLine,
        tools: [
            { id: 'trendLine', name: 'Trend Line', icon: DRAWING_ICONS.trendLine, shortcut: '⌥T', favorite: true },
            { id: 'ray', name: 'Ray', icon: DRAWING_ICONS.ray, favorite: true },
            { id: 'infoLine', name: 'Info Line', icon: DRAWING_ICONS.infoLine },
            { id: 'extendedLine', name: 'Extended Line', icon: DRAWING_ICONS.extendedLine },
            { id: 'trendAngle', name: 'Trend Angle', icon: DRAWING_ICONS.trendAngle },
            { id: 'horizontalLine', name: 'Horizontal Line', icon: DRAWING_ICONS.horizontalLine, shortcut: '⌥H', favorite: true },
            { id: 'horizontalRay', name: 'Horizontal Ray', icon: DRAWING_ICONS.horizontalRay, shortcut: '⌥J', favorite: true },
            { id: 'verticalLine', name: 'Vertical Line', icon: DRAWING_ICONS.verticalLine, shortcut: '⌥V' },
            { id: 'crossLine', name: 'Cross Line', icon: DRAWING_ICONS.crossLine, shortcut: '⌥C' },
        ]
    },
    {
        id: 'channels',
        name: 'Channels',
        defaultIcon: DRAWING_ICONS.parallelChannel,
        tools: [
            { id: 'parallelChannel', name: 'Parallel Channel', icon: DRAWING_ICONS.parallelChannel, favorite: true },
            { id: 'disjointChannel', name: 'Disjoint Channel', icon: DRAWING_ICONS.disjointChannel },
            { id: 'flatTopBottom', name: 'Flat Top/Bottom', icon: DRAWING_ICONS.flatTopBottom },
            { id: 'regressionTrend', name: 'Regression Trend', icon: DRAWING_ICONS.regressionTrend },
            { id: 'pitchfork', name: 'Pitchfork', icon: DRAWING_ICONS.pitchfork },
            { id: 'schiffPitchfork', name: 'Schiff Pitchfork', icon: DRAWING_ICONS.schiffPitchfork },
            { id: 'modifiedSchiffPitchfork', name: 'Modified Schiff Pitchfork', icon: DRAWING_ICONS.modifiedSchiffPitchfork },
            { id: 'insidePitchfork', name: 'Inside Pitchfork', icon: DRAWING_ICONS.insidePitchfork },
        ]
    },
    {
        id: 'fibonacci',
        name: 'Fibonacci',
        defaultIcon: DRAWING_ICONS.fibRetracement,
        tools: [
            { id: 'fibRetracement', name: 'Fib Retracement', icon: DRAWING_ICONS.fibRetracement, favorite: true },
            { id: 'fibExtension', name: 'Fib Extension', icon: DRAWING_ICONS.fibExtension },
            { id: 'fibChannel', name: 'Fib Channel', icon: DRAWING_ICONS.fibChannel },
            { id: 'pitchfan', name: 'Pitchfan', icon: DRAWING_ICONS.pitchfan },
            { id: 'fibTimeZone', name: 'Fib Time Zone', icon: DRAWING_ICONS.fibTimeZone },
            { id: 'trendBasedFibTime', name: 'Trend-Based Fib Time', icon: DRAWING_ICONS.trendBasedFibTime },
            { id: 'fibSpeedResistanceFan', name: 'Fib Speed Resistance Fan', icon: DRAWING_ICONS.fibSpeedResistanceFan },
            { id: 'fibSpeedResistanceArcs', name: 'Fib Speed Resistance Arcs', icon: DRAWING_ICONS.fibSpeedResistanceArcs },
            { id: 'fibCircles', name: 'Fib Circles', icon: DRAWING_ICONS.fibCircles },
            { id: 'fibSpiral', name: 'Fib Spiral', icon: DRAWING_ICONS.fibSpiral },
            { id: 'fibWedge', name: 'Fib Wedge', icon: DRAWING_ICONS.fibWedge },
            { id: 'gannBox', name: 'Gann Box', icon: DRAWING_ICONS.gannBox },
            { id: 'gannSquareFixed', name: 'Gann Square Fixed', icon: DRAWING_ICONS.gannSquareFixed },
            { id: 'gannSquare', name: 'Gann Square', icon: DRAWING_ICONS.gannSquare },
            { id: 'gannFan', name: 'Gann Fan', icon: DRAWING_ICONS.gannFan },
        ]
    },
    {
        id: 'shapes',
        name: 'Shapes',
        defaultIcon: DRAWING_ICONS.brush,
        tools: [
            { id: 'brush', name: 'Brush', icon: DRAWING_ICONS.brush, favorite: true },
            { id: 'highlighter', name: 'Highlighter', icon: DRAWING_ICONS.highlighter },
            { id: 'arrow', name: 'Arrow', icon: DRAWING_ICONS.arrow },
            { id: 'arrowMarker', name: 'Arrow Marker', icon: DRAWING_ICONS.arrowMarker },
            { id: 'arrowMarkedUp', name: 'Arrow Marked Up', icon: DRAWING_ICONS.arrowMarkedUp },
            { id: 'arrowMarkedDown', name: 'Arrow Marked Down', icon: DRAWING_ICONS.arrowMarkedDown },
            { id: 'arrowMarkedLeft', name: 'Arrow Marked Left', icon: DRAWING_ICONS.arrowMarkedLeft },
            { id: 'arrowMarkedRight', name: 'Arrow Marked Right', icon: DRAWING_ICONS.arrowMarkedRight },
            { id: 'rectangle', name: 'Rectangle', icon: DRAWING_ICONS.rectangle },
            { id: 'rotatedRectangle', name: 'Rotated Rectangle', icon: DRAWING_ICONS.rotatedRectangle },
            { id: 'ellipse', name: 'Ellipse', icon: DRAWING_ICONS.ellipse },
            { id: 'triangle', name: 'Triangle', icon: DRAWING_ICONS.triangle },
            { id: 'arc', name: 'Arc', icon: DRAWING_ICONS.arc },
            { id: 'path', name: 'Path', icon: DRAWING_ICONS.path },
            { id: 'circle', name: 'Circle', icon: DRAWING_ICONS.circle },
            { id: 'polyline', name: 'Polyline', icon: DRAWING_ICONS.polyline },
            { id: 'curve', name: 'Curve', icon: DRAWING_ICONS.curve },
            { id: 'doubleCurve', name: 'Double Curve', icon: DRAWING_ICONS.doubleCurve },
        ]
    },
    {
        id: 'patterns',
        name: 'Patterns',
        defaultIcon: DRAWING_ICONS.xabcd,
        tools: [
            { id: 'xabcd', name: 'XABCD Pattern', icon: DRAWING_ICONS.xabcd },
            { id: 'cypherPattern', name: 'Cypher Pattern', icon: DRAWING_ICONS.cypher },
            { id: 'elliotImpulse', name: 'Elliott Impulse Wave (12345)', icon: DRAWING_ICONS.elliotImpulse },
            { id: 'elliotCorrection', name: 'Elliot Correction Wave (ABC)', icon: DRAWING_ICONS.elliotCorrection },
            { id: 'elliotTriangle', name: 'Elliott Triangle Wave (ABCDE)', icon: DRAWING_ICONS.elliotTriangle },
            { id: 'elliotDoubleCombo', name: 'Elliott Double Combo Wave (WXY)', icon: DRAWING_ICONS.elliotDoubleCombo },
            { id: 'elliotTripleCombo', name: 'Elliott Triple Combo Wave (WXYXZ)', icon: DRAWING_ICONS.elliotTripleCombo },
            { id: 'cyclicLines', name: 'Cyclic Lines', icon: DRAWING_ICONS.cyclicLines },
            { id: 'timeCycles', name: 'Time Cycles', icon: DRAWING_ICONS.timeCycles },
            { id: 'sineLine', name: 'Sine Line', icon: DRAWING_ICONS.sineLine },
            { id: 'threeDrives', name: 'Three Drives Pattern', icon: DRAWING_ICONS.threeDrives },
            { id: 'headShoulders', name: 'Head & Shoulders', icon: DRAWING_ICONS.headShoulders },
            { id: 'abcd', name: 'ABCD Pattern', icon: DRAWING_ICONS.abcd },
            { id: 'trianglePattern', name: 'Triangle Pattern', icon: DRAWING_ICONS.trianglePattern },
        ]
    },
    {
        id: 'projection',
        name: 'Projection',
        defaultIcon: DRAWING_ICONS.longPosition,
        tools: [
            { id: 'longPosition', name: 'Long Position', icon: DRAWING_ICONS.longPosition },
            { id: 'shortPosition', name: 'Short Position', icon: DRAWING_ICONS.shortPosition },
            { id: 'priceRange', name: 'Price Range', icon: DRAWING_ICONS.priceRange },
            { id: 'dateRange', name: 'Date Range', icon: DRAWING_ICONS.dateRange },
            { id: 'datePriceRange', name: 'Date and Price Range', icon: DRAWING_ICONS.datePriceRange },
            { id: 'projection', name: 'Projection', icon: DRAWING_ICONS.projection },
            { id: 'positionForecast', name: 'Position Forecast', icon: DRAWING_ICONS.positionForecast },
            { id: 'barsPattern', name: 'Bars Pattern', icon: DRAWING_ICONS.barsPattern },
            { id: 'ghostFeed', name: 'Ghost Feed', icon: DRAWING_ICONS.ghostFeed },
            { id: 'anchoredVwap', name: 'Anchored VWAP', icon: DRAWING_ICONS.anchoredVwap },
            { id: 'fixedRangeVolumeProfile', name: 'Fixed Range Volume Profile', icon: DRAWING_ICONS.fixedRangeVolumeProfile },
            { id: 'anchoredVolumeProfile', name: 'Anchored Volume Profile', icon: DRAWING_ICONS.anchoredVolumeProfile },
        ]
    },
    {
        id: 'annotation',
        name: 'Text',
        defaultIcon: DRAWING_ICONS.text,
        tools: [
            { id: 'text', name: 'Text', icon: DRAWING_ICONS.text, favorite: true },
            { id: 'callout', name: 'Callout', icon: DRAWING_ICONS.callout },
            { id: 'priceLabel', name: 'Price Label', icon: DRAWING_ICONS.priceLabel },
            { id: 'flagMarked', name: 'Flag Marked', icon: DRAWING_ICONS.flagMarked },
            { id: 'note', name: 'Note', icon: DRAWING_ICONS.note },
            { id: 'priceNote', name: 'Price Note', icon: DRAWING_ICONS.priceNote },
            { id: 'pin', name: 'Pin', icon: DRAWING_ICONS.pin },
            { id: 'signpost', name: 'Signpost', icon: DRAWING_ICONS.signpost },
            { id: 'comment', name: 'Comment', icon: DRAWING_ICONS.comment },
            { id: 'table', name: 'Table', icon: DRAWING_ICONS.table },
        ]
    },
    {
        id: 'emotion',
        name: 'Emotion',
        defaultIcon: DRAWING_ICONS.sticker,
        tools: [
            // Faces - Happy
            { id: 'sticker-smile', name: 'Smile', icon: '😀' },
            { id: 'sticker-grin', name: 'Grin', icon: '😁' },
            { id: 'sticker-laugh', name: 'Laugh', icon: '😂' },
            { id: 'sticker-rofl', name: 'ROFL', icon: '🤣' },
            { id: 'sticker-joy', name: 'Joy', icon: '😊' },
            { id: 'sticker-wink', name: 'Wink', icon: '😉' },
            { id: 'sticker-heart-eyes', name: 'Heart Eyes', icon: '😍' },
            { id: 'sticker-star-eyes', name: 'Star Eyes', icon: '🤩' },
            { id: 'sticker-kiss', name: 'Kiss', icon: '😘' },
            { id: 'sticker-cool', name: 'Cool', icon: '😎' },
            { id: 'sticker-smirk', name: 'Smirk', icon: '😏' },
            { id: 'sticker-halo', name: 'Halo', icon: '😇' },
            // Faces - Thinking/Neutral
            { id: 'sticker-think', name: 'Think', icon: '🤔' },
            { id: 'sticker-raised-eyebrow', name: 'Raised Eyebrow', icon: '🤨' },
            { id: 'sticker-neutral', name: 'Neutral', icon: '😐' },
            { id: 'sticker-expressionless', name: 'Expressionless', icon: '😑' },
            { id: 'sticker-unamused', name: 'Unamused', icon: '😒' },
            { id: 'sticker-rolling-eyes', name: 'Rolling Eyes', icon: '🙄' },
            // Faces - Sad/Negative
            { id: 'sticker-cry', name: 'Cry', icon: '😭' },
            { id: 'sticker-sad', name: 'Sad', icon: '😢' },
            { id: 'sticker-worried', name: 'Worried', icon: '😟' },
            { id: 'sticker-shock', name: 'Shock', icon: '😱' },
            { id: 'sticker-angry', name: 'Angry', icon: '😠' },
            { id: 'sticker-rage', name: 'Rage', icon: '🤬' },
            { id: 'sticker-scared', name: 'Scared', icon: '😨' },
            { id: 'sticker-sweat', name: 'Sweat', icon: '😰' },
            { id: 'sticker-sick', name: 'Sick', icon: '🤢' },
            { id: 'sticker-dead', name: 'Dead', icon: '💀' },
            { id: 'sticker-clown', name: 'Clown', icon: '🤡' },
            { id: 'sticker-mind-blown', name: 'Mind Blown', icon: '🤯' },
            // Gestures
            { id: 'sticker-thumbs-up', name: 'Thumbs Up', icon: '👍' },
            { id: 'sticker-thumbs-down', name: 'Thumbs Down', icon: '👎' },
            { id: 'sticker-clap', name: 'Clap', icon: '👏' },
            { id: 'sticker-raised-hands', name: 'Raised Hands', icon: '🙌' },
            { id: 'sticker-pray', name: 'Pray', icon: '🙏' },
            { id: 'sticker-muscle', name: 'Muscle', icon: '💪' },
            { id: 'sticker-punch', name: 'Punch', icon: '👊' },
            { id: 'sticker-victory', name: 'Victory', icon: '✌️' },
            { id: 'sticker-ok', name: 'OK', icon: '👌' },
            { id: 'sticker-point-up', name: 'Point Up', icon: '☝️' },
            { id: 'sticker-point-right', name: 'Point Right', icon: '👉' },
            { id: 'sticker-point-down', name: 'Point Down', icon: '👇' },
            // Trading & Finance
            { id: 'sticker-rocket', name: 'Rocket', icon: '🚀' },
            { id: 'sticker-fire', name: 'Fire', icon: '🔥' },
            { id: 'sticker-diamond', name: 'Diamond', icon: '💎' },
            { id: 'sticker-money-bag', name: 'Money Bag', icon: '💰' },
            { id: 'sticker-dollar', name: 'Dollar', icon: '💵' },
            { id: 'sticker-chart-up', name: 'Chart Up', icon: '📈' },
            { id: 'sticker-chart-down', name: 'Chart Down', icon: '📉' },
            { id: 'sticker-target', name: 'Target', icon: '🎯' },
            { id: 'sticker-trophy', name: 'Trophy', icon: '🏆' },
            { id: 'sticker-medal', name: 'Medal', icon: '🥇' },
            { id: 'sticker-crown', name: 'Crown', icon: '👑' },
            { id: 'sticker-gem', name: 'Gem', icon: '💠' },
            // Animals & Nature
            { id: 'sticker-bull', name: 'Bull', icon: '🐂' },
            { id: 'sticker-bear', name: 'Bear', icon: '🐻' },
            { id: 'sticker-whale', name: 'Whale', icon: '🐋' },
            { id: 'sticker-shark', name: 'Shark', icon: '🦈' },
            { id: 'sticker-eagle', name: 'Eagle', icon: '🦅' },
            { id: 'sticker-lion', name: 'Lion', icon: '🦁' },
            { id: 'sticker-moon', name: 'Moon', icon: '🌕' },
            { id: 'sticker-sun', name: 'Sun', icon: '☀️' },
            { id: 'sticker-rainbow', name: 'Rainbow', icon: '🌈' },
            { id: 'sticker-lightning', name: 'Lightning', icon: '⚡' },
            // Symbols
            { id: 'sticker-star', name: 'Star', icon: '⭐' },
            { id: 'sticker-sparkles', name: 'Sparkles', icon: '✨' },
            { id: 'sticker-heart', name: 'Heart', icon: '❤️' },
            { id: 'sticker-broken-heart', name: 'Broken Heart', icon: '💔' },
            { id: 'sticker-100', name: '100', icon: '💯' },
            { id: 'sticker-check', name: 'Check', icon: '✅' },
            { id: 'sticker-cross', name: 'Cross', icon: '❌' },
            { id: 'sticker-warning', name: 'Warning', icon: '⚠️' },
            { id: 'sticker-stop', name: 'Stop', icon: '🛑' },
            { id: 'sticker-bell', name: 'Bell', icon: '🔔' },
            { id: 'sticker-eyes', name: 'Eyes', icon: '👀' },
            { id: 'sticker-brain', name: 'Brain', icon: '🧠' },
            // Celebration
            { id: 'sticker-celebrate', name: 'Celebrate', icon: '🥳' },
            { id: 'sticker-party', name: 'Party', icon: '🎉' },
            { id: 'sticker-confetti', name: 'Confetti', icon: '🎊' },
            { id: 'sticker-balloon', name: 'Balloon', icon: '🎈' },
            { id: 'sticker-champagne', name: 'Champagne', icon: '🍾' },
            { id: 'sticker-beer', name: 'Beer', icon: '🍺' },
        ],
        display: 'grid',
        columns: 8,
    },
    {
        id: 'magnet',
        name: 'Magnet',
        defaultIcon: DRAWING_ICONS.weakMagnet,
        tools: [
            { id: 'weakMagnet', name: 'Weak Magnet', icon: DRAWING_ICONS.weakMagnet },
            { id: 'strongMagnet', name: 'Strong Magnet', icon: DRAWING_ICONS.strongMagnet },
            { id: 'snapIndicators', name: 'Snap to Indicators', icon: DRAWING_ICONS.snapIndicators },
        ]
    },
    {
        id: 'measure',
        name: 'Measure',
        defaultIcon: DRAWING_ICONS.measureTool,
        tools: [
            { id: 'measure', name: 'Measure', icon: DRAWING_ICONS.measureTool },
        ]
    },
    {
        id: 'zoomIn',
        name: 'Zoom In',
        defaultIcon: DRAWING_ICONS.zoomIn,
        tools: [
            { id: 'zoomIn', name: 'Zoom In', icon: DRAWING_ICONS.zoomIn },
        ]
    },
];

/** Nesne agaci satir eylemleri icin ortak ikonlar (goz / kilit / sil) */
export const ROW_ACTION_ICONS = {
    visible: DRAWING_ICONS.visible,
    hidden: DRAWING_ICONS.hidden,
    lock: DRAWING_ICONS.lock,
    lockClosed: DRAWING_ICONS.lockClosed,
    trash: DRAWING_ICONS.trash,
};

/** Cizim turu -> {etiket, ikon} (nesne agaci): arac listesinden; yoksa null (cagiran tur kimligine duser). */
export function getDrawingToolMeta(type: string): { label: string; icon: string } | null {
    for (const group of TOOL_GROUPS) {
        const tool = group.tools.find((tl) => tl.id === type);
        if (tool) return { label: t(tool.name), icon: tool.icon };
    }
    return null;
}

/**
 * TradingView-style left drawing toolbar with flyout menus
 */
export class DrawingToolbarWidget {
    private _element: HTMLElement | null = null;
    private _activeTool: DrawingTool = 'crosshair';
    private _activeGroupTools: Map<string, string> = new Map();
    private _flyoutContainer: HTMLElement | null = null;
    private _activeFlyout: string | null = null;
    private _magnetMode: 'none' | 'weak' | 'strong' = 'none';
    private _isLocked: boolean = false;
    private _isVisibilityHidden: boolean = false;
    private _keepDrawing: boolean = false;
    private _snapToIndicators: boolean = false;
    private _currentTheme: 'dark' | 'light' = 'dark';

    // Events
    private readonly _toolChanged = new Delegate<DrawingTool>();
    private readonly _magnetToggled = new Delegate<boolean>();
    private readonly _lockToggled = new Delegate<boolean>();
    private readonly _visibilityToggled = new Delegate<boolean>();
    private readonly _keepDrawingToggled = new Delegate<boolean>();
    private readonly _snapToIndicatorsToggled = new Delegate<boolean>();
    private readonly _deleteAllClicked = new Delegate<void>();
    private readonly _objectTreeToggled = new Delegate<void>();

    constructor(container: HTMLElement) {
        try {
            this._keepDrawing = localStorage.getItem(KEEP_DRAWING_STORAGE_KEY) === '1';
        } catch (e) {
            this._keepDrawing = false;
        }
        try {
            this._snapToIndicators = localStorage.getItem(SNAP_INDICATORS_STORAGE_KEY) === '1';
        } catch (e) {
            this._snapToIndicators = false;
        }
        try {
            const m = localStorage.getItem(MAGNET_MODE_STORAGE_KEY);
            this._magnetMode = m === 'weak' || m === 'strong' ? m : 'none';
        } catch (e) {
            this._magnetMode = 'none';
        }
        // Initialize default tools for each group
        this._getLocalizedGroups().forEach(group => {
            this._activeGroupTools.set(group.id, group.tools[0].id);
        });
        if (this._magnetMode === 'strong') this._activeGroupTools.set('magnet', 'strongMagnet');
        this._createElement(container);
        this._updateMagnetButtons();
    }

    private _getLocalizedGroups(): ToolGroup[] {
        return TOOL_GROUPS.map(group => ({
            ...group,
            name: t(group.name),
            tools: group.tools.map(tool => ({
                ...tool,
                name: t(tool.name)
            }))
        }));
    }

    // --- Public getters ---

    get element(): HTMLElement | null {
        return this._element;
    }

    get width(): number {
        return 48;
    }

    get activeTool(): DrawingTool {
        return this._activeTool;
    }

    get toolChanged(): Delegate<DrawingTool> {
        return this._toolChanged;
    }

    get magnetToggled(): Delegate<boolean> {
        return this._magnetToggled;
    }

    get lockToggled(): Delegate<boolean> {
        return this._lockToggled;
    }

    get visibilityToggled(): Delegate<boolean> {
        return this._visibilityToggled;
    }

    get keepDrawingToggled(): Delegate<boolean> {
        return this._keepDrawingToggled;
    }

    get keepDrawing(): boolean {
        return this._keepDrawing;
    }

    get snapToIndicatorsToggled(): Delegate<boolean> {
        return this._snapToIndicatorsToggled;
    }

    /** Magnet "Snap to indicators" preference (persisted) */
    get snapToIndicators(): boolean {
        return this._snapToIndicators;
    }

    private _toggleSnapToIndicators(): void {
        this._snapToIndicators = !this._snapToIndicators;
        try {
            localStorage.setItem(SNAP_INDICATORS_STORAGE_KEY, this._snapToIndicators ? '1' : '0');
        } catch (e) {
            // storage unavailable - preference stays in memory only
        }
        this._snapToIndicatorsToggled.fire(this._snapToIndicators);
    }

    get objectTreeToggled(): Delegate<void> {
        return this._objectTreeToggled;
    }

    get deleteAllClicked(): Delegate<void> {
        return this._deleteAllClicked;
    }

    // --- Public methods ---

    setActiveTool(tool: DrawingTool): void {
        if (tool === 'snapIndicators') {
            // Magnet setting, not a tool: toggles without changing the active tool
            this._toggleSnapToIndicators();
            return;
        }
        if (tool === 'weakMagnet' || tool === 'strongMagnet') {
            // Magnet setting, not a tool: toggles the mode, active tool / drawing mode stay untouched
            const mode = tool === 'weakMagnet' ? 'weak' : 'strong';
            this.magnetMode = this._magnetMode === mode ? 'none' : mode;
            this._magnetToggled.fire(this._magnetMode !== 'none');
            return;
        }
        if (this._activeTool === tool) return;
        this._activeTool = tool;

        // Cursor group button shows the last chosen cursor / eraser (also when set programmatically)
        if (CURSOR_GROUP_TOOLS.includes(tool) && this._activeGroupTools.get('cursor') !== tool) {
            this._activeGroupTools.set('cursor', tool);
            const icon = this.getToolIcon(tool);
            if (icon) this._updateGroupButtonIcon('cursor', icon);
        }

        // If a drawing tool is selected (not cursor / interaction tools), auto-unlock
        const isDrawingTool = !NON_DRAWING_TOOLS.includes(tool);

        if (isDrawingTool) {
            let changed = false;
            if (this._isLocked) {
                this._isLocked = false;
                this._lockToggled.fire(false);
                changed = true;
            }
            if (this._isVisibilityHidden) {
                this._isVisibilityHidden = false;
                this._visibilityToggled.fire(false);
                changed = true;
            }
            if (changed) {
                this._updateUtilityButtons();
            }
        }

        this._updateToolButtons();
        this._toolChanged.fire(tool);
    }

    getToolIcon(toolId: string): string | null {
        for (const group of TOOL_GROUPS) {
            const tool = group.tools.find(t => t.id === toolId);
            if (tool) return tool.icon;
        }
        return null;
    }

    get magnetMode(): 'none' | 'weak' | 'strong' {
        return this._magnetMode;
    }

    set magnetMode(mode: 'none' | 'weak' | 'strong') {
        this._magnetMode = mode;
        try {
            localStorage.setItem(MAGNET_MODE_STORAGE_KEY, mode);
        } catch (e) {
            // storage unavailable - preference stays in memory only
        }
        this._updateMagnetButtons();
    }

    private _updateMagnetButtons(): void {
        // Update magnet group button appearance
        const magnetBtn = this._element?.querySelector('button[data-group-id="magnet"]') as HTMLButtonElement;
        if (magnetBtn) {
            const isActive = this._magnetMode !== 'none';
            magnetBtn.style.background = isActive ? '#2962ff' : 'transparent';
            magnetBtn.style.color = isActive ? '#fff' : '#787b86';
            magnetBtn.dataset.active = isActive.toString();
        }
    }

    get isLocked(): boolean {
        return this._isLocked;
    }

    set isLocked(value: boolean) {
        this._isLocked = value;
        this._updateUtilityButtons();
    }

    get isVisibilityHidden(): boolean {
        return this._isVisibilityHidden;
    }

    set isVisibilityHidden(value: boolean) {
        this._isVisibilityHidden = value;
        this._updateUtilityButtons();
    }

    /** Nesne agaci paneli acik/kapali: toolbar dugmesinin vurgusu */
    setObjectTreeActive(active: boolean): void {
        const btn = this._element?.querySelector('button[data-id="objectTree"]') as HTMLButtonElement | null;
        if (!btn) return;
        btn.dataset.active = active.toString();
        btn.style.background = active ? '#2962ff' : 'transparent';
        btn.style.color = active ? '#fff' : '#787b86';
    }

    private _updateUtilityButtons(): void {
        const lockBtn = this._element?.querySelector('button[data-id="lock"]') as HTMLButtonElement;
        if (lockBtn) {
            lockBtn.style.background = this._isLocked ? '#ef5350' : 'transparent';
            lockBtn.style.color = this._isLocked ? '#fff' : '#787b86';
            lockBtn.innerHTML = this._isLocked ? DRAWING_ICONS.lockClosed : DRAWING_ICONS.lock;
        }

        const visibilityBtn = this._element?.querySelector('button[data-id="visibility"]') as HTMLButtonElement;
        if (visibilityBtn) {
            visibilityBtn.style.background = this._isVisibilityHidden ? '#ef5350' : 'transparent';
            visibilityBtn.style.color = this._isVisibilityHidden ? '#fff' : '#787b86';
            visibilityBtn.innerHTML = this._isVisibilityHidden ? DRAWING_ICONS.hidden : DRAWING_ICONS.visible;
        }

        const keepBtn = this._element?.querySelector('button[data-id="keepDrawing"]') as HTMLButtonElement;
        if (keepBtn) {
            keepBtn.dataset.active = this._keepDrawing.toString();
            keepBtn.style.background = this._keepDrawing ? '#2962ff' : 'transparent';
            keepBtn.style.color = this._keepDrawing ? '#fff' : '#787b86';
        }
    }

    // --- Private methods ---

    private _createElement(container: HTMLElement): void {
        this._element = document.createElement('div');
        this._element.className = 'drawing-toolbar';
        this._element.style.cssText = `
            position: absolute;
            left: 0;
            top: 38px;
            bottom: 30px;
            width: 48px;
            background: #131722;
            border-right: 1px solid #2B2B43;
            display: flex;
            flex-direction: column;
            padding: 4px;
            font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif;
            user-select: none;
            z-index: 100;
            overflow-y: auto;
            overflow-x: hidden;
            scrollbar-width: thin;
        `;

        // Add styles
        const style = document.createElement('style');
        style.id = 'drawing-toolbar-style';
        style.textContent = `
            .drawing-toolbar::-webkit-scrollbar { width: 4px; }
            .drawing-toolbar::-webkit-scrollbar-track { background: transparent; }
            .drawing-toolbar::-webkit-scrollbar-thumb { background: #2a2e39; border-radius: 2px; }
            .drawing-flyout {
                position: absolute;
                left: 48px;
                background: #1e222d;
                border: 1px solid #2B2B43;
                border-radius: 4px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                min-width: 200px;
                max-height: calc(100vh - 100px);
                overflow-y: auto;
                padding: 4px 0;
                z-index: 1000;
            }
            .drawing-flyout::-webkit-scrollbar { width: 6px; }
            .drawing-flyout::-webkit-scrollbar-track { background: transparent; }
            .drawing-flyout::-webkit-scrollbar-thumb { background: #2a2e39; border-radius: 3px; }
            .drawing-flyout-header {
                padding: 8px 12px;
                color: #787b86;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .drawing-flyout-item {
                display: flex;
                align-items: center;
                padding: 8px 12px;
                color: #d1d4dc;
                font-size: 13px;
                cursor: pointer;
                transition: background 0.1s;
            }
            .drawing-flyout-item:hover {
                background: #2a2e39;
            }
            .drawing-flyout-item.active {
                background: #2962ff;
                color: #fff;
            }
            .drawing-flyout-item-icon {
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-right: 10px;
            }
            .drawing-flyout-item-name {
                flex: 1;
            }
            .drawing-flyout-item-shortcut {
                color: #787b86;
                font-size: 11px;
                margin-left: 12px;
            }
            .drawing-flyout-item-favorite {
                color: #f0b90b;
                margin-left: 8px;
            }
            .drawing-flyout-grid {
                display: grid;
                gap: 2px;
                padding: 4px;
            }
            .drawing-flyout-grid-item {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                color: #d1d4dc;
                font-size: 20px;
                cursor: pointer;
                transition: background 0.1s;
                border-radius: 4px;
            }
            .drawing-flyout-grid-item:hover {
                background: #2a2e39;
            }
            .drawing-flyout-grid-item.active {
                background: #2962ff;
                color: #fff;
            }
        `;
        document.head.appendChild(style);

        // Create flyout container (outside toolbar for proper positioning)
        this._flyoutContainer = document.createElement('div');
        this._flyoutContainer.style.cssText = `
            position: absolute;
            left: 0;
            top: 0;
            z-index: 1000;
            pointer-events: none;
        `;
        container.appendChild(this._flyoutContainer);

        // Create group buttons
        this._getLocalizedGroups().forEach(group => {
            this._createGroupButton(group);
        });

        // Utility buttons at the end of the list
        this._createUtilityButton(DRAWING_ICONS.lock, 'Lock Drawings', () => {
            this._isLocked = !this._isLocked;
            this._updateUtilityButtons();
            this._lockToggled.fire(this._isLocked);
        }, false, 'lock');

        this._createUtilityButton(DRAWING_ICONS.visible, 'Hide Drawings', () => {
            this._isVisibilityHidden = !this._isVisibilityHidden;
            this._updateUtilityButtons();
            this._visibilityToggled.fire(this._isVisibilityHidden);
        }, false, 'visibility');

        this._createUtilityButton(DRAWING_ICONS.keepDrawing, t('Keep Drawing Mode'), () => {
            this._keepDrawing = !this._keepDrawing;
            try {
                localStorage.setItem(KEEP_DRAWING_STORAGE_KEY, this._keepDrawing ? '1' : '0');
            } catch (e) {
                // storage unavailable - preference stays in memory only
            }
            this._updateUtilityButtons();
            this._keepDrawingToggled.fire(this._keepDrawing);
        }, false, 'keepDrawing');
        this._updateUtilityButtons();

        this._createUtilityButton(OBJECT_TREE_ICON, t('Object tree'), () => this._objectTreeToggled.fire(), false, 'objectTree');

        this._createUtilityButton(DRAWING_ICONS.trash, 'Delete All', () => this._deleteAllClicked.fire(), true, 'trash');

        container.appendChild(this._element);

        // Close flyout on click outside
        document.addEventListener('click', (e) => {
            if (this._activeFlyout && !this._element?.contains(e.target as Node) &&
                !this._flyoutContainer?.contains(e.target as Node)) {
                this._closeFlyout();
            }
        });
    }

    private _createGroupButton(group: ToolGroup): void {
        const btn = document.createElement('button');
        const activeTool = this._activeGroupTools.get(group.id) || group.tools[0].id;
        const activeToolConfig = group.tools.find(t => t.id === activeTool);
        const isActive = this._activeTool === activeTool;
        const isGridGroup = group.display === 'grid';

        btn.innerHTML = (isGridGroup) ? group.defaultIcon : (activeToolConfig?.icon || group.defaultIcon);
        btn.title = group.name;
        btn.dataset.groupId = group.id;
        btn.dataset.active = isActive.toString();

        btn.style.cssText = `
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 36px;
            background: ${isActive ? '#2962ff' : 'transparent'};
            border: none;
            border-radius: 4px;
            color: ${isActive ? '#fff' : '#787b86'};
            cursor: pointer;
            transition: all 0.15s ease;
            margin-bottom: 8px;
        `;

        // Right-pointing chevron indicator for dropdown (only visible on hover)
        if (group.tools.length > 1) {
            const indicator = document.createElement('div');
            indicator.className = 'dropdown-indicator';
            indicator.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M3 2L5 4L3 6" stroke="${isActive ? '#fff' : '#787b86'}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`;
            indicator.style.cssText = `
                position: absolute;
                right: 2px;
                top: 50%;
                transform: translateY(-50%);
                width: 8px;
                height: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.15s ease;
            `;
            btn.appendChild(indicator);
        }

        btn.addEventListener('mouseenter', () => {
            if (btn.dataset.active !== 'true') {
                const isDark = this._currentTheme === 'dark';
                btn.style.background = isDark ? '#2a2e39' : '#e0e3eb';
                btn.style.color = isDark ? '#d1d4dc' : '#131722';
            }
            // Show chevron indicator on hover
            const indicator = btn.querySelector('.dropdown-indicator') as HTMLElement;
            if (indicator) {
                indicator.style.opacity = '1';
            }
            // Show flyout
            if (group.tools.length > 1) {
                this._showFlyout(group, btn);
            }
        });

        btn.addEventListener('mouseleave', () => {
            if (btn.dataset.active !== 'true') {
                const isDark = this._currentTheme === 'dark';
                btn.style.background = 'transparent';
                btn.style.color = isDark ? '#787b86' : '#131722';
            }
            // Hide chevron indicator when not hovering
            const indicator = btn.querySelector('.dropdown-indicator') as HTMLElement;
            if (indicator) {
                indicator.style.opacity = '0';
            }
        });

        btn.addEventListener('click', () => {
            const tool = this._activeGroupTools.get(group.id) || group.tools[0].id;
            this.setActiveTool(tool);
            this._closeFlyout();
        });

        this._element!.appendChild(btn);
    }

    private _showFlyout(group: ToolGroup, anchorBtn: HTMLElement): void {
        if (this._activeFlyout === group.id) return;
        this._closeFlyout();

        this._activeFlyout = group.id;

        const flyout = document.createElement('div');
        flyout.className = 'drawing-flyout';
        flyout.style.pointerEvents = 'auto';

        // Position flyout
        flyout.style.left = '48px';

        // Groups with many items (shapes, emotion) start from first button position for full visibility
        if (group.id === 'shapes' || group.id === 'emotion') {
            flyout.style.top = '38px';  // Aligned with first toolbar button
            flyout.style.maxHeight = 'calc(100vh - 100px)';
            flyout.style.overflowY = 'auto';
        } else {
            // Other groups align with their button
            const rect = anchorBtn.getBoundingClientRect();
            const containerRect = this._element!.parentElement!.getBoundingClientRect();
            flyout.style.top = `${rect.top - containerRect.top}px`;
        }

        this._flyoutContainer!.appendChild(flyout);

        // Header
        const header = document.createElement('div');
        header.className = 'drawing-flyout-header';
        header.textContent = group.name.toUpperCase();
        flyout.appendChild(header);

        // Tool items
        if (group.display === 'grid') {
            const grid = document.createElement('div');
            grid.className = 'drawing-flyout-grid';
            grid.style.gridTemplateColumns = `repeat(${group.columns || 6}, 1fr)`;

            group.tools.forEach(tool => {
                const item = document.createElement('div');
                item.className = 'drawing-flyout-grid-item';
                if (tool.id === this._activeTool) {
                    item.classList.add('active');
                }
                item.innerHTML = tool.icon;
                item.title = tool.name;

                item.addEventListener('click', () => {
                    this._activeGroupTools.set(group.id, tool.id);
                    this.setActiveTool(tool.id);
                    // Do NOT update button icon for grid groups (e.g. Emotions)
                    if (group.display !== 'grid') {
                        this._updateGroupButtonIcon(group.id, tool.icon);
                    }
                    this._closeFlyout();
                });

                grid.appendChild(item);
            });
            flyout.appendChild(grid);
        } else {
            group.tools.forEach(tool => {
                const item = document.createElement('div');
                item.className = 'drawing-flyout-item';
                const isSnapItem = tool.id === 'snapIndicators';
                const isMagnetItem = tool.id === 'weakMagnet' || tool.id === 'strongMagnet';
                const magnetOn = tool.id === 'weakMagnet' ? this._magnetMode === 'weak' : this._magnetMode === 'strong';
                if (isSnapItem ? this._snapToIndicators : isMagnetItem ? magnetOn : tool.id === this._activeTool) {
                    item.classList.add('active');
                }

                const icon = document.createElement('div');
                icon.className = 'drawing-flyout-item-icon';
                icon.innerHTML = tool.icon;
                item.appendChild(icon);

                const name = document.createElement('span');
                name.className = 'drawing-flyout-item-name';
                name.textContent = tool.name;
                item.appendChild(name);

                if (tool.shortcut) {
                    const shortcut = document.createElement('span');
                    shortcut.className = 'drawing-flyout-item-shortcut';
                    shortcut.textContent = tool.shortcut;
                    item.appendChild(shortcut);
                }

                if (tool.favorite) {
                    const fav = document.createElement('span');
                    fav.className = 'drawing-flyout-item-favorite';
                    fav.innerHTML = DRAWING_ICONS.favorite;
                    item.appendChild(fav);
                }

                item.addEventListener('click', () => {
                    if (isSnapItem) {
                        // On/off toggle: does not become the magnet button's default tool
                        this.setActiveTool(tool.id);
                        this._closeFlyout();
                        return;
                    }
                    this._activeGroupTools.set(group.id, tool.id);
                    this.setActiveTool(tool.id);
                    this._updateGroupButtonIcon(group.id, tool.icon);
                    this._closeFlyout();
                });

                flyout.appendChild(item);
            });
        }

        // Keep flyout open when hovering over it
        flyout.addEventListener('mouseenter', () => {
            // Flyout stays open
        });

        flyout.addEventListener('mouseleave', () => {
            this._closeFlyout();
        });

        // Flyout is already in DOM from measurement step above
    }

    private _closeFlyout(): void {
        if (this._flyoutContainer) {
            this._flyoutContainer.innerHTML = '';
        }
        this._activeFlyout = null;
    }

    closeFlyout(): void {
        this._closeFlyout();
    }

    private _updateGroupButtonIcon(groupId: string, icon: string): void {
        const btn = this._element?.querySelector(`button[data-group-id="${groupId}"]`) as HTMLButtonElement;
        if (btn) {
            // Preserve the triangle indicator
            const indicator = btn.querySelector('div');
            btn.innerHTML = icon;
            if (indicator) {
                btn.appendChild(indicator);
            }
        }
    }

    private _createUtilityButton(icon: string, title: string, onClick: () => void, isDanger: boolean = false, id?: string): void {
        const btn = document.createElement('button');
        if (id) btn.dataset.id = id;
        btn.innerHTML = icon;
        btn.title = title;

        btn.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 32px;
            background: transparent;
            border: none;
            border-radius: 4px;
            color: ${isDanger ? '#ef5350' : '#787b86'};
            cursor: pointer;
            transition: all 0.15s ease;
            margin-bottom: 8px;
        `;

        btn.addEventListener('mouseenter', () => {
            if (btn.dataset.active === 'true') return;
            const isDark = this._currentTheme === 'dark';
            btn.style.background = isDanger
                ? 'rgba(239, 83, 80, 0.1)'
                : (isDark ? '#2a2e39' : '#e0e3eb');
            btn.style.color = isDanger
                ? '#ef5350'
                : (isDark ? '#d1d4dc' : '#131722');
        });

        btn.addEventListener('mouseleave', () => {
            if (btn.dataset.active === 'true') return;
            const isDark = this._currentTheme === 'dark';
            btn.style.background = 'transparent';
            btn.style.color = isDanger
                ? '#ef5350'
                : (isDark ? '#787b86' : '#131722');
        });

        btn.addEventListener('click', onClick);
        this._element!.appendChild(btn);
    }

    private _updateToolButtons(): void {
        const buttons = this._element?.querySelectorAll('button[data-group-id]');
        buttons?.forEach(btn => {
            const htmlBtn = btn as HTMLButtonElement;
            const groupId = htmlBtn.dataset.groupId!;
            const group = TOOL_GROUPS.find(g => g.id === groupId);
            if (!group) return;

            // Skip magnet group - it has its own state management
            if (groupId === 'magnet') {
                // Keep magnet button state based on _magnetMode
                const isMagnetActive = this._magnetMode !== 'none';
                htmlBtn.dataset.active = isMagnetActive.toString();
                htmlBtn.style.background = isMagnetActive ? '#2962ff' : 'transparent';
                htmlBtn.style.color = isMagnetActive ? '#fff' : '#787b86';
                return;
            }

            const groupActiveTool = this._activeGroupTools.get(groupId);
            const isActive = group.tools.some(t => t.id === this._activeTool) && groupActiveTool === this._activeTool;

            htmlBtn.dataset.active = isActive.toString();
            htmlBtn.style.background = isActive ? '#2962ff' : 'transparent';
            htmlBtn.style.color = isActive ? '#fff' : '#787b86';

            // Update indicator SVG color
            const indicator = htmlBtn.querySelector('.dropdown-indicator svg path') as SVGPathElement;
            if (indicator) {
                indicator.setAttribute('stroke', isActive ? '#fff' : '#787b86');
            }
        });
    }

    // --- Cleanup ---

    /**
     * Set toolbar theme
     */
    setTheme(theme: 'dark' | 'light'): void {
        this._currentTheme = theme;
        if (!this._element) return;

        const isDark = theme === 'dark';
        this._element.style.background = isDark ? '#1a1a2e' : '#f8f9fa';
        this._element.style.borderRightColor = isDark ? '#2a2e39' : '#e0e3eb';

        // Update all buttons
        const buttons = this._element.querySelectorAll('button:not([data-active="true"])');
        buttons.forEach(btn => {
            (btn as HTMLElement).style.color = isDark ? '#787b86' : '#131722';
        });

        // Update dynamic styles
        const style = document.getElementById('drawing-toolbar-style');
        if (style) {
            style.textContent = `
            .drawing-toolbar::-webkit-scrollbar { width: 4px; }
            .drawing-toolbar::-webkit-scrollbar-track { background: transparent; }
            .drawing-toolbar::-webkit-scrollbar-thumb { background: ${isDark ? '#2a2e39' : '#e0e3eb'}; border-radius: 2px; }
            .drawing-flyout {
                position: absolute;
                left: 48px;
                background: ${isDark ? '#1e222d' : '#ffffff'};
                border: 1px solid ${isDark ? '#2B2B43' : '#e0e3eb'};
                border-radius: 4px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                min-width: 200px;
                max-height: calc(100vh - 100px);
                overflow-y: auto;
                padding: 4px 0;
                z-index: 1000;
            }
            .drawing-flyout::-webkit-scrollbar { width: 6px; }
            .drawing-flyout::-webkit-scrollbar-track { background: transparent; }
            .drawing-flyout::-webkit-scrollbar-thumb { background: ${isDark ? '#2a2e39' : '#e0e3eb'}; border-radius: 3px; }
            .drawing-flyout-header {
                padding: 8px 12px;
                color: ${isDark ? '#787b86' : '#5d606b'};
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .drawing-flyout-item {
                display: flex;
                align-items: center;
                padding: 8px 12px;
                color: ${isDark ? '#d1d4dc' : '#131722'};
                font-size: 13px;
                cursor: pointer;
                transition: background 0.1s;
            }
            .drawing-flyout-item:hover {
                background: ${isDark ? '#2a2e39' : '#f0f3fa'};
            }
            .drawing-flyout-item.active {
                background: #2962ff;
                color: #fff;
            }
            .drawing-flyout-item-icon {
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-right: 10px;
                color: ${isDark ? '#d1d4dc' : '#131722'};
            }
            .drawing-flyout-item-name {
                flex: 1;
            }
            .drawing-flyout-item-shortcut {
                color: ${isDark ? '#787b86' : '#9db2bd'};
                font-size: 11px;
                margin-left: 12px;
            }
            .drawing-flyout-item-favorite {
                color: #f0b90b;
                margin-left: 8px;
                opacity: 0;
                transition: opacity 0.2s;
            }
            .drawing-flyout-item:hover .drawing-flyout-item-favorite,
            .drawing-flyout-item-favorite.active {
                opacity: 1;
            }
            .drawing-flyout-grid {
                display: grid;
                gap: 2px;
                padding: 4px;
            }
            .drawing-flyout-grid-item {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                border-radius: 4px;
                cursor: pointer;
                color: ${isDark ? '#d1d4dc' : '#131722'};
                transition: background 0.1s;
            }
            .drawing-flyout-grid-item:hover {
                background: ${isDark ? '#2a2e39' : '#f0f3fa'};
            }
            .drawing-flyout-grid-item.active {
                background: #2962ff;
                color: #fff;
            }
        `;
        }
    }

    dispose(): void {
        this._toolChanged.destroy();
        this._magnetToggled.destroy();
        this._lockToggled.destroy();
        this._keepDrawingToggled.destroy();
        this._snapToIndicatorsToggled.destroy();
        this._visibilityToggled.destroy();
        this._deleteAllClicked.destroy();
        this._objectTreeToggled.destroy();

        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
        if (this._flyoutContainer && this._flyoutContainer.parentNode) {
            this._flyoutContainer.parentNode.removeChild(this._flyoutContainer);
        }
        this._element = null;
        this._flyoutContainer = null;
    }
}
