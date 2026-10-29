/**
 * Drawing alerts: maps an alertable drawing to the wire geometry (lines in epoch ms / price) stored with the alert.
 * Pure functions (no DOM); the chart side only calls alertGeometryFor() when an alert is created or the drawing was edited.
 */
import { t } from '../helpers/translations';
import type { AlertGeometry, AlertGeometryLine } from './types';

/** Library tool names that can carry an alert. */
export const ALERTABLE_DRAWING_TYPES: readonly string[] = [
    'horizontalLine', 'horizontalRay', 'trendLine', 'ray', 'extendedLine', 'parallelChannel', 'rectangle',
];

/** Structural view of a drawing (the Drawing classes satisfy it). */
export interface AlertableDrawingLike {
    id: string;
    type: string;
    points: ReadonlyArray<{ time: number; price: number }>;
    state?: string;
    /** null / undefined = main pane; indicator-pane drawings are not alertable (their prices are not the chart prices). */
    paneId?: string | null;
    extendLeft?: boolean;
    extendRight?: boolean;
}

/** Horizontal tools have a single anchor; t2 is only a nominal second time (the price is flat). */
const HORIZONTAL_SPAN_MS = 60_000;

export function alertDrawingLabel(type: string): string {
    switch (type) {
        case 'horizontalLine': return t('Horizontal line');
        case 'horizontalRay': return t('Horizontal ray');
        case 'trendLine': return t('Trend line');
        case 'ray': return t('Ray');
        case 'extendedLine': return t('Extended line');
        case 'parallelChannel': return t('Parallel channel');
        case 'rectangle': return t('Rectangle');
        default: return type;
    }
}

function finitePoint(p: { time: number; price: number } | undefined): p is { time: number; price: number } {
    return !!p && Number.isFinite(p.time) && Number.isFinite(p.price);
}

/** Value of a line at time t (plain time); null when undefined (outside a non-extended end). */
export function geometryValueAt(line: AlertGeometryLine, t: number): number | null {
    if (!Number.isFinite(t)) return null;
    if (line.t1 === line.t2) {
        return t < line.t1 && !line.extendLeft ? null : line.p1;
    }
    if (t < line.t1 && !line.extendLeft) return null;
    if (t > line.t2 && !line.extendRight) return null;
    return line.p1 + (line.p2 - line.p1) * ((t - line.t1) / (line.t2 - line.t1));
}

/**
 * Line through the drawing points a and b, sorted so that t1 <= t2. The extend flags are SCREEN-sided (extendLeft = towards
 * earlier time, extendRight = towards later time), which is how the renderers apply them (drawTrendLine / drawParallelChannel
 * sort the points by x first), so the alert follows what the user sees. Times are rounded to whole ms (server truncates).
 */
function orderedLine(
    a: { time: number; price: number }, b: { time: number; price: number }, extendLeft: boolean, extendRight: boolean,
): AlertGeometryLine {
    const ta = Math.round(a.time), tb = Math.round(b.time);
    return ta <= tb
        ? { t1: ta, p1: a.price, t2: tb, p2: b.price, extendLeft, extendRight }
        : { t1: tb, p1: b.price, t2: ta, p2: a.price, extendLeft, extendRight };
}

/** Upper first (by value at the middle of the time span). */
function upperLower(l1: AlertGeometryLine, l2: AlertGeometryLine): { upper: AlertGeometryLine; lower: AlertGeometryLine } {
    const mid = (l1.t1 + l1.t2) / 2;
    const v1 = l1.p1 + (l1.p2 - l1.p1) * (l1.t2 === l1.t1 ? 0 : (mid - l1.t1) / (l1.t2 - l1.t1));
    const v2 = l2.p1 + (l2.p2 - l2.p1) * (l2.t2 === l2.t1 ? 0 : (mid - l2.t1) / (l2.t2 - l2.t1));
    return v1 >= v2 ? { upper: l1, lower: l2 } : { upper: l2, lower: l1 };
}

/** Wire geometry of a drawing, null when the drawing is not alertable (type, incomplete, degenerate). */
export function alertGeometryFor(drawing: AlertableDrawingLike | null | undefined): AlertGeometry | null {
    if (!drawing || !ALERTABLE_DRAWING_TYPES.includes(drawing.type) || drawing.state === 'creating') return null;
    if (drawing.paneId !== null && drawing.paneId !== undefined) return null;
    const pts = drawing.points;
    if (!pts) return null;
    const left = !!drawing.extendLeft;
    const right = !!drawing.extendRight;
    switch (drawing.type) {
        case 'horizontalLine': {
            const p = pts[0];
            if (!finitePoint(p)) return null;
            const t1 = Math.round(p.time);
            return { type: 'line', line: { t1, p1: p.price, t2: t1 + HORIZONTAL_SPAN_MS, p2: p.price, extendLeft: true, extendRight: true } };
        }
        case 'horizontalRay': {
            const p = pts[0];
            if (!finitePoint(p)) return null;
            const t1 = Math.round(p.time);
            return { type: 'line', line: { t1, p1: p.price, t2: t1 + HORIZONTAL_SPAN_MS, p2: p.price, extendLeft: false, extendRight: true } };
        }
        case 'trendLine':
        case 'ray':
        case 'extendedLine': {
            const [a, b] = pts;
            if (!finitePoint(a) || !finitePoint(b) || Math.round(a.time) === Math.round(b.time)) return null;
            // extendedLine is both ways; a ray runs from p1 through p2 (screen side = direction of p2 from p1);
            // trendLine uses its own (screen-sided) flags
            const extL = drawing.type === 'extendedLine' ? true : drawing.type === 'ray' ? b.time < a.time : left;
            const extR = drawing.type === 'extendedLine' ? true : drawing.type === 'ray' ? b.time > a.time : right;
            return { type: 'line', line: orderedLine(a, b, extL, extR) };
        }
        case 'parallelChannel': {
            const [a, b, c] = pts;
            if (!finitePoint(a) || !finitePoint(b) || !finitePoint(c) || Math.round(a.time) === Math.round(b.time)) return null;
            // Same math as the renderer: the second line is the base line shifted vertically so that it passes through point 3
            const slope = (b.price - a.price) / (b.time - a.time);
            const offset = c.price - (a.price + slope * (c.time - a.time));
            const base = orderedLine(a, b, left, right);
            const par: AlertGeometryLine = { ...base, p1: base.p1 + offset, p2: base.p2 + offset };
            const { upper, lower } = upperLower(base, par);
            return { type: 'channel', upper, lower };
        }
        case 'rectangle': {
            const [a, b] = pts;
            if (!finitePoint(a) || !finitePoint(b) || Math.round(a.time) === Math.round(b.time)) return null;
            const t1 = Math.round(Math.min(a.time, b.time)), t2 = Math.round(Math.max(a.time, b.time));
            if (t1 === t2) return null;
            const top = Math.max(a.price, b.price), bottom = Math.min(a.price, b.price);
            return {
                type: 'channel',
                upper: { t1, p1: top, t2, p2: top, extendLeft: left, extendRight: right },
                lower: { t1, p1: bottom, t2, p2: bottom, extendLeft: left, extendRight: right },
            };
        }
        default:
            return null;
    }
}

export function isAlertableDrawing(drawing: AlertableDrawingLike | null | undefined): boolean {
    return alertGeometryFor(drawing) !== null;
}

/**
 * Price seeding the dialog: the line's value at the last bar time (middle of the two lines for a channel / rectangle),
 * falling back to the level where the line is not defined at that time.
 */
export function geometrySeedPrice(geometry: AlertGeometry, lastBarTime: number | null): number {
    const at = (l: AlertGeometryLine): number => {
        const v = lastBarTime !== null ? geometryValueAt(l, lastBarTime) : null;
        return v !== null ? v : l.p2;
    };
    return geometry.type === 'line' ? at(geometry.line) : (at(geometry.upper) + at(geometry.lower)) / 2;
}

/** Cheap structural equality (prices compared with a tiny relative tolerance). */
export function sameGeometry(a: AlertGeometry | null | undefined, b: AlertGeometry | null | undefined): boolean {
    if (!a || !b) return a === b || (!a && !b);
    if (a.type !== b.type) return false;
    const eqLine = (x: AlertGeometryLine, y: AlertGeometryLine): boolean => {
        const near = (m: number, n: number) => Math.abs(m - n) <= 1e-9 * Math.max(1, Math.abs(m), Math.abs(n));
        return Math.abs(x.t1 - y.t1) <= 1 && Math.abs(x.t2 - y.t2) <= 1 && near(x.p1, y.p1) && near(x.p2, y.p2)
            && !!x.extendLeft === !!y.extendLeft && !!x.extendRight === !!y.extendRight;
    };
    if (a.type === 'line' && b.type === 'line') return eqLine(a.line, b.line);
    if (a.type === 'channel' && b.type === 'channel') return eqLine(a.upper, b.upper) && eqLine(a.lower, b.lower);
    return false;
}
