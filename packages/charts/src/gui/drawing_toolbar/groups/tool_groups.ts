/**
 * Tool Group Definitions
 * 
 * Configures tool groups for the drawing toolbar.
 */

import { ToolGroup } from '../types';
import { DRAWING_ICONS } from '../icons';

export const TOOL_GROUPS: ToolGroup[] = [
    {
        id: 'cursor',
        name: 'Cursor',
        defaultIcon: DRAWING_ICONS.crosshair,
        tools: [
            { id: 'crosshair', name: 'Crosshair', icon: DRAWING_ICONS.crosshair },
            { id: 'arrowCursor', name: 'Cursor', icon: DRAWING_ICONS.arrowCursor },
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
            { id: 'doubleCurve', name: 'Double Curve', icon: DRAWING_ICONS.doubleCurve },
        ]
    },
    {
        id: 'projection',
        name: 'Projection',
        defaultIcon: DRAWING_ICONS.anchoredVwap,
        tools: [
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
        display: 'grid',
        columns: 8,
        tools: [
            // Trading & Finance
            { id: 'sticker-rocket', name: 'Rocket', icon: '🚀' },
            { id: 'sticker-fire', name: 'Fire', icon: '🔥' },
            { id: 'sticker-diamond', name: 'Diamond', icon: '💎' },
            { id: 'sticker-money-bag', name: 'Money Bag', icon: '💰' },
            { id: 'sticker-chart-up', name: 'Chart Up', icon: '📈' },
            { id: 'sticker-chart-down', name: 'Chart Down', icon: '📉' },
            { id: 'sticker-target', name: 'Target', icon: '🎯' },
            { id: 'sticker-trophy', name: 'Trophy', icon: '🏆' },
            // Animals
            { id: 'sticker-bull', name: 'Bull', icon: '🐂' },
            { id: 'sticker-bear', name: 'Bear', icon: '🐻' },
            { id: 'sticker-whale', name: 'Whale', icon: '🐋' },
            // Faces
            { id: 'sticker-smile', name: 'Smile', icon: '😀' },
            { id: 'sticker-think', name: 'Think', icon: '🤔' },
            { id: 'sticker-cry', name: 'Cry', icon: '😭' },
            { id: 'sticker-shock', name: 'Shock', icon: '😱' },
            { id: 'sticker-cool', name: 'Cool', icon: '😎' },
            // Gestures
            { id: 'sticker-thumbs-up', name: 'Thumbs Up', icon: '👍' },
            { id: 'sticker-thumbs-down', name: 'Thumbs Down', icon: '👎' },
            // Symbols
            { id: 'sticker-check', name: 'Check', icon: '✅' },
            { id: 'sticker-cross', name: 'Cross', icon: '❌' },
            { id: 'sticker-warning', name: 'Warning', icon: '⚠️' },
            { id: 'sticker-star', name: 'Star', icon: '⭐' },
            { id: 'sticker-100', name: '100', icon: '💯' },
            { id: 'sticker-eyes', name: 'Eyes', icon: '👀' },
        ]
    },
    {
        id: 'patterns',
        name: 'Patterns',
        defaultIcon: DRAWING_ICONS.xabcdPattern,
        tools: [
            { id: 'xabcdPattern', name: 'XABCD Pattern', icon: DRAWING_ICONS.xabcdPattern, favorite: true },
            { id: 'cypherPattern', name: 'Cypher Pattern', icon: DRAWING_ICONS.xabcdPattern },
            { id: 'elliotImpulse', name: 'Elliott Impulse Wave (12345)', icon: DRAWING_ICONS.elliottImpulse, favorite: true },
            { id: 'elliotCorrection', name: 'Elliott Correction Wave (ABC)', icon: DRAWING_ICONS.elliottCorrection },
            { id: 'elliotTriangle', name: 'Elliott Triangle Wave (ABCDE)', icon: DRAWING_ICONS.elliottTriangle },
            { id: 'elliotDoubleCombo', name: 'Elliott Double Combo Wave (WXY)', icon: DRAWING_ICONS.elliottDoubleCombo },
            { id: 'elliotTripleCombo', name: 'Elliott Triple Combo Wave (WXYXZ)', icon: DRAWING_ICONS.elliottTripleCombo },
            { id: 'cyclicLines', name: 'Cyclic Lines', icon: DRAWING_ICONS.cyclicLines },
            { id: 'timeCycles', name: 'Time Cycles', icon: DRAWING_ICONS.timeCycles },
            { id: 'sineLine', name: 'Sine Line', icon: DRAWING_ICONS.sineLine },
        ]
    },
    {
        id: 'magnet',
        name: 'Magnet',
        defaultIcon: DRAWING_ICONS.weakMagnet,
        tools: [
            { id: 'weakMagnet', name: 'Weak Magnet', icon: DRAWING_ICONS.weakMagnet },
            { id: 'strongMagnet', name: 'Strong Magnet', icon: DRAWING_ICONS.strongMagnet },
        ]
    },
];
