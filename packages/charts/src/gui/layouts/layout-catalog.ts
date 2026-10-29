/**
 * Multi-chart layout catalog (TradingView parity, 1..8 charts). DOM-free.
 *
 * Every layout is a SPLIT TREE built from TradingView's own split expressions: `0` = single leaf,
 * `['h', a, b, ...]` = children SIDE BY SIDE (left to right, separated by vertical splitter lines),
 * `['v', a, b, ...]` = children STACKED (top to bottom, separated by horizontal splitter lines); numbers are
 * chart indices, so the leaf order of the expression defines which chart sits where (e.g. '4' =
 * `['v', ['h', 0, 2], ['h', 1, 3]]`: chart 0 top-left, 1 bottom-left, 2 top-right, 3 bottom-right).
 *
 * Id naming (TradingView): `<n>h` n charts side by side, `<n>v` n charts stacked, `<n>s` one big chart on the
 * left + a stacked column on the right, `<n>s-l` the stack on the left, `a-b` a charts in the top row and b
 * in the bottom row, `a-b-l` / `a-b-r` side-by-side columns, `4/6/8` and `6c/8c` aligned grids.
 */

export type LayoutId =
    | 's'
    | '2h' | '2v'
    | '3h' | '3v' | '3s' | '3r' | '2-1' | '1-2'
    | '4' | '4h' | '4v' | '4s' | '4s-l' | '1-3' | '3-1' | '2-2-l' | '2-2-r' | '2-2'
    | '1-4' | '5h' | '5v' | '5s' | '5s-l' | '2-3' | '3-2' | '4-1' | '2-3-l' | '2-3-r'
    | '6' | '6h' | '6v' | '6c' | '2-4' | '4-2'
    | '4-3' | '7h' | '7s'
    | '8' | '8c' | '8h' | '8v';

/** Ids used by the previous grid implementation (and by the host's persisted state). */
export type LegacyLayoutId = '1x1' | '2x1' | '1x2' | '1x3' | '2x2' | 'single';

export type SplitDir = 'row' | 'col';

export interface LeafNode {
    leaf: true;
    /** Chart index shown in this cell (defaults to depth-first order). */
    index?: number;
}

export interface SplitNode {
    dir: SplitDir;
    children: LayoutNode[];
    /** Default relative sizes of the children (equal if omitted). */
    weights?: number[];
    /** Split nodes sharing the same `sync` id share their weights (grid columns / rows move together). */
    sync?: string;
}

export type LayoutNode = LeafNode | SplitNode;

/** 'h' = n charts side by side, 'v' = n charts stacked (TradingView naming). */
export type LayoutFamily = 'single' | 'h' | 'v' | 'stacked' | 'stacked-left' | 'grid' | 'grid-cols' | 'mixed';

export interface LayoutDef {
    id: LayoutId;
    /** English title (translate with `t(title)`). */
    title: string;
    count: number;
    tree: LayoutNode;
    family: LayoutFamily;
}

/** Per-layout splitter weights: key = `sync:<id>` for linked splits, else the node path ("r", "r.0", "r.1.0"). */
export type LayoutSizes = Record<string, number[]>;

// --- tree builders ---

type Expr = number | ['h' | 'v', ...any[]];

function def(
    id: LayoutId,
    title: string,
    expr: Expr,
    family: LayoutFamily,
    opts: { sync?: string; weights?: number[] } = {}
): LayoutDef {
    let count = 0;
    const build = (e: Expr, depth: number): LayoutNode => {
        if (typeof e === 'number') {
            count++;
            return { leaf: true, index: e };
        }
        const [dir, ...rest] = e;
        const node: SplitNode = { dir: dir === 'h' ? 'row' : 'col', children: rest.map((c: Expr) => build(c, depth + 1)) };
        if (depth === 0 && opts.weights) node.weights = opts.weights;
        // aligned grids: the row splits of every row share their column weights
        if (depth === 1 && opts.sync && dir === 'h') node.sync = opts.sync;
        return node;
    };
    const tree = build(expr, 0);
    return { id, title, count, tree, family };
}

const STACK_W = [2, 1];

export const LAYOUT_CATALOG: readonly LayoutDef[] = [
    def('s', '1 chart', 0, 'single'),

    def('2h', '2-up horizontal', ['h', 0, 1], 'h'),
    def('2v', '2-up vertical', ['v', 0, 1], 'v'),

    def('3h', '3-up horizontal', ['h', 0, 1, 2], 'h'),
    def('3v', '3-up vertical', ['v', 0, 1, 2], 'v'),
    def('3s', '3-up stacked', ['h', 0, ['v', 1, 2]], 'stacked', { weights: STACK_W }),
    def('3r', '3-up stacked left', ['h', ['v', 0, 1], 2], 'stacked-left', { weights: [1, 2] }),
    def('2-1', '2 at top and 1 at bottom', ['v', ['h', 0, 2], 1], 'mixed'),
    def('1-2', '1 at top and 2 at bottom', ['v', 0, ['h', 1, 2]], 'mixed'),

    def('4', '4-up', ['v', ['h', 0, 2], ['h', 1, 3]], 'grid', { sync: 'c' }),
    def('4h', '4-up horizontal', ['h', 0, 1, 2, 3], 'h'),
    def('4v', '4-up vertical', ['v', 0, 1, 2, 3], 'v'),
    def('4s', '4-up stacked', ['h', 0, ['v', 1, 2, 3]], 'stacked', { weights: STACK_W }),
    def('4s-l', '4-up stacked left', ['h', ['v', 1, 2, 3], 0], 'stacked-left', { weights: [1, 2] }),
    def('1-3', '1 at top and 3 at bottom', ['v', 0, ['h', 1, 2, 3]], 'mixed'),
    def('3-1', '3 at top and 1 at bottom', ['v', ['h', 0, 1, 2], 3], 'mixed'),
    def('2-2-l', '2 at left and 2 at right', ['h', 0, 1, ['v', 2, 3]], 'mixed'),
    def('2-2-r', '2 at left and 2 at right (linked)', ['h', ['v', 0, 1], 2, 3], 'mixed'),
    def('2-2', '2 at top and 2 at bottom', ['v', ['h', 0, 1], ['v', 2, 3]], 'mixed'),

    def('1-4', '1 at top and 4 at bottom', ['v', 0, ['h', 1, 2, 3, 4]], 'mixed'),
    def('5h', '5-up horizontal', ['h', 0, 1, 2, 3, 4], 'h'),
    def('5v', '5-up vertical', ['v', 0, 1, 2, 3, 4], 'v'),
    def('5s', '5-up stacked', ['h', 0, ['v', 1, 2, 3, 4]], 'stacked', { weights: STACK_W }),
    def('5s-l', '5-up stacked left', ['h', ['v', 1, 2, 3, 4], 0], 'stacked-left', { weights: [1, 2] }),
    def('2-3', '2 at top and 3 at bottom', ['v', ['h', 0, 1], ['h', 2, 3, 4]], 'mixed'),
    def('3-2', '3 at top and 2 at bottom', ['v', ['h', 0, 1, 2], ['h', 3, 4]], 'mixed'),
    def('4-1', '4 at top and 1 at bottom', ['v', ['h', 0, 1, 2, 3], 4], 'mixed'),
    def('2-3-l', '2 at left and 3 at right', ['h', 0, 1, ['v', 2, 3, 4]], 'mixed'),
    def('2-3-r', '3 at left and 2 at right', ['h', ['v', 0, 1, 2], 3, 4], 'mixed'),

    def('6', '6-up', ['v', ['h', 0, 2, 4], ['h', 1, 3, 5]], 'grid', { sync: 'c' }),
    def('6h', '6-up horizontal', ['h', 0, 1, 2, 3, 4, 5], 'h'),
    def('6v', '6-up vertical', ['v', 0, 1, 2, 3, 4, 5], 'v'),
    def('6c', '6-up in two columns', ['v', ['h', 0, 1], ['h', 2, 3], ['h', 4, 5]], 'grid-cols', { sync: 'c' }),
    def('2-4', '2 at top and 4 at bottom', ['v', ['h', 0, 1], ['h', 2, 3, 4, 5]], 'mixed'),
    def('4-2', '4 at top and 2 at bottom', ['v', ['h', 0, 1, 2, 3], ['h', 4, 5]], 'mixed'),

    def('4-3', '4 at top and 3 at bottom', ['v', ['h', 0, 1, 2, 3], ['h', 4, 5, 6]], 'mixed'),
    def('7h', '7-up horizontal', ['h', 0, 1, 2, 3, 4, 5, 6], 'h'),
    def('7s', '7-up stacked', ['h', 0, ['v', 1, 2, 3, 4, 5, 6]], 'stacked', { weights: STACK_W }),

    def('8', '8-up', ['v', ['h', 0, 2, 4, 6], ['h', 1, 3, 5, 7]], 'grid', { sync: 'c' }),
    def('8c', '8-up in two columns', ['v', ['h', 0, 1], ['h', 2, 3], ['h', 4, 5], ['h', 6, 7]], 'grid-cols', { sync: 'c' }),
    def('8h', '8-up horizontal', ['h', 0, 1, 2, 3, 4, 5, 6, 7], 'h'),
    def('8v', '8-up vertical', ['v', 0, 1, 2, 3, 4, 5, 6, 7], 'v'),
];

export const LAYOUT_IDS: readonly LayoutId[] = LAYOUT_CATALOG.map((d) => d.id);
export const MAX_LAYOUT_CHARTS = 8;
export const DEFAULT_LAYOUT_ID: LayoutId = 's';

/**
 * Persisted / legacy ids by their old visual meaning: '2x1' = 1 column x 2 rows (stacked) -> '2v'; '1x2' = 2
 * columns (side by side) -> '2h'; '1x3' = 3 columns side by side -> '3h'; '2x2' -> '4'. (TradingView naming:
 * `h` = side by side, `v` = stacked.)
 */
export const LEGACY_LAYOUT_ALIASES: Readonly<Record<LegacyLayoutId, LayoutId>> = {
    '1x1': 's',
    single: 's',
    '2x1': '2v',
    '1x2': '2h',
    '1x3': '3h',
    '2x2': '4',
};

const BY_ID = new Map<string, LayoutDef>(LAYOUT_CATALOG.map((d) => [d.id, d]));

/** Maps any known/legacy id to a catalog id, or null when unknown. */
export function resolveLayoutId(id: string | null | undefined): LayoutId | null {
    if (!id) return null;
    if (BY_ID.has(id)) return id as LayoutId;
    const alias = (LEGACY_LAYOUT_ALIASES as Record<string, LayoutId>)[id];
    return alias ?? null;
}

export function getLayoutDef(id: string): LayoutDef {
    const resolved = resolveLayoutId(id) ?? DEFAULT_LAYOUT_ID;
    return BY_ID.get(resolved)!;
}

/** Layouts grouped by chart count: index 0 -> count 1 ... index 7 -> count 8. */
export function layoutsByCount(): LayoutDef[][] {
    const groups: LayoutDef[][] = Array.from({ length: MAX_LAYOUT_CHARTS }, () => []);
    for (const d of LAYOUT_CATALOG) groups[d.count - 1].push(d);
    return groups;
}

// --- geometry ---

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface SplitterInfo {
    /** Key into LayoutSizes. */
    key: string;
    /** Direction of the PARENT split: 'row' -> vertical line (resize horizontally), 'col' -> horizontal line. */
    dir: SplitDir;
    /** Splitter between child `index` and `index + 1`. */
    index: number;
    /** Gap rectangle between the two children (the visible/hit line is centered in it). */
    gap: Rect;
    /** Start (x for row, y for col) of the parent's content area. */
    origin: number;
    /** Pixel sizes of all children of the parent, and their current weights. */
    childPx: number[];
    weights: number[];
    gapPx: number;
    /** Minimum px sizes (along the split axis) of children `index` and `index + 1`. */
    minFirst: number;
    minSecond: number;
}

export interface LayoutGeometry {
    /** One rect per chart (leaf order). */
    cells: Rect[];
    splitters: SplitterInfo[];
}

export const DEFAULT_MIN_CELL_PX = 120;

function validWeights(w: number[] | undefined, n: number): w is number[] {
    return Array.isArray(w) && w.length === n && w.every((v) => Number.isFinite(v) && v > 0);
}

function nodeKey(node: SplitNode, path: string): string {
    return node.sync ? `sync:${node.sync}` : path;
}

export function resolveWeights(node: SplitNode, path: string, sizes: LayoutSizes | undefined): number[] {
    const n = node.children.length;
    const stored = sizes?.[nodeKey(node, path)];
    if (validWeights(stored, n)) return stored.slice();
    if (validWeights(node.weights, n)) return node.weights.slice();
    return new Array(n).fill(1);
}

/** Smallest size of a subtree along an axis so that every chart keeps at least `minPx`. */
export function minNodeSize(node: LayoutNode, axis: SplitDir, minPx: number, gapPx: number): number {
    if ('leaf' in node) return minPx;
    const sizes = node.children.map((c) => minNodeSize(c, axis, minPx, gapPx));
    if (node.dir === axis) return sizes.reduce((a, b) => a + b, 0) + gapPx * (node.children.length - 1);
    return Math.max(...sizes);
}

export function computeGeometry(
    tree: LayoutNode,
    width: number,
    height: number,
    gapPx: number,
    sizes?: LayoutSizes,
    minCellPx: number = DEFAULT_MIN_CELL_PX
): LayoutGeometry {
    const cells: Rect[] = [];
    const splitters: SplitterInfo[] = [];
    let leafCounter = 0;

    const visit = (node: LayoutNode, rect: Rect, path: string): void => {
        if ('leaf' in node) {
            cells[node.index ?? leafCounter] = rect;
            leafCounter++;
            return;
        }
        const n = node.children.length;
        const weights = resolveWeights(node, path, sizes);
        const horizontal = node.dir === 'row';
        const total = horizontal ? rect.w : rect.h;
        const available = Math.max(0, total - gapPx * (n - 1));
        const sum = weights.reduce((a, b) => a + b, 0);
        const childPx = weights.map((w) => (available * w) / sum);
        const origin = horizontal ? rect.x : rect.y;
        const axis: SplitDir = node.dir;

        let pos = origin;
        for (let i = 0; i < n; i++) {
            const size = childPx[i];
            const childRect: Rect = horizontal
                ? { x: pos, y: rect.y, w: size, h: rect.h }
                : { x: rect.x, y: pos, w: rect.w, h: size };
            visit(node.children[i], childRect, `${path}.${i}`);
            if (i < n - 1) {
                splitters.push({
                    key: nodeKey(node, path),
                    dir: node.dir,
                    index: i,
                    gap: horizontal
                        ? { x: pos + size, y: rect.y, w: gapPx, h: rect.h }
                        : { x: rect.x, y: pos + size, w: rect.w, h: gapPx },
                    origin,
                    childPx,
                    weights,
                    gapPx,
                    minFirst: minNodeSize(node.children[i], axis, minCellPx, gapPx),
                    minSecond: minNodeSize(node.children[i + 1], axis, minCellPx, gapPx),
                });
            }
            pos += size + gapPx;
        }
    };

    visit(tree, { x: 0, y: 0, w: width, h: height }, 'r');
    return { cells, splitters };
}

/**
 * New weights after dragging `splitter` so that the line sits at `pointerPos` (same coordinate system as the
 * geometry: px along the split axis from the layout's origin). The pair's total weight is preserved and each
 * side keeps at least its minimum size.
 */
export function applyDrag(splitter: SplitterInfo, pointerPos: number): number[] {
    const { index: i, childPx, weights, gapPx, origin } = splitter;
    let before = 0;
    for (let k = 0; k < i; k++) before += childPx[k] + gapPx;
    const pairPx = childPx[i] + childPx[i + 1];
    let minA = splitter.minFirst;
    let minB = splitter.minSecond;
    if (minA + minB > pairPx) {
        minA = pairPx / 2;
        minB = pairPx / 2;
    }
    const wanted = pointerPos - origin - before - gapPx / 2;
    const first = Math.min(Math.max(wanted, minA), pairPx - minB);
    const pairWeight = weights[i] + weights[i + 1];
    const out = weights.slice();
    out[i] = (pairWeight * first) / pairPx;
    out[i + 1] = pairWeight - out[i];
    return out;
}

/** Equal weights for all siblings of this splitter (double-click on a splitter). */
export function equalWeights(splitter: SplitterInfo): number[] {
    return new Array(splitter.weights.length).fill(1);
}

/**
 * Old `{columns, rows}` ratio shape (previous grid implementation) derived from the sizes of a layout:
 * columns = weights of the first row-split found (BFS), rows = weights of the first column-split.
 */
export function legacyRatiosOf(tree: LayoutNode, sizes: LayoutSizes | undefined): { columns: number[]; rows: number[] } {
    let columns: number[] | null = null;
    let rowsOut: number[] | null = null;
    const queue: Array<{ node: LayoutNode; path: string }> = [{ node: tree, path: 'r' }];
    while (queue.length) {
        const { node, path } = queue.shift()!;
        if ('leaf' in node) continue;
        const w = resolveWeights(node, path, sizes);
        if (node.dir === 'row' && !columns) columns = w;
        if (node.dir === 'col' && !rowsOut) rowsOut = w;
        node.children.forEach((c, i) => queue.push({ node: c, path: `${path}.${i}` }));
    }
    return { columns: columns ?? [1], rows: rowsOut ?? [1] };
}

/** Applies old-style `{columns, rows}` ratios onto a layout's sizes (best effort, first matching split). */
export function sizesFromLegacyRatios(
    tree: LayoutNode,
    ratios: { columns?: number[]; rows?: number[] }
): LayoutSizes {
    const out: LayoutSizes = {};
    let colsDone = false;
    let rowsDone = false;
    const queue: Array<{ node: LayoutNode; path: string }> = [{ node: tree, path: 'r' }];
    while (queue.length) {
        const { node, path } = queue.shift()!;
        if ('leaf' in node) continue;
        const n = node.children.length;
        if (node.dir === 'row' && !colsDone && validWeights(ratios.columns, n)) {
            out[nodeKey(node, path)] = ratios.columns.slice();
            if (!node.sync) colsDone = true;
        }
        if (node.dir === 'col' && !rowsDone && validWeights(ratios.rows, n)) {
            out[nodeKey(node, path)] = ratios.rows.slice();
            if (!node.sync) rowsDone = true;
        }
        node.children.forEach((c, i) => queue.push({ node: c, path: `${path}.${i}` }));
    }
    return out;
}

export function isValidSizes(sizes: unknown): sizes is LayoutSizes {
    if (!sizes || typeof sizes !== 'object') return false;
    return Object.values(sizes as Record<string, unknown>).every(
        (v) => Array.isArray(v) && v.length >= 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0)
    );
}

// --- plan limits ---

/** Lowest plan (smallest limit that is >= count; ties -> first listed). null when none qualifies / no limits. */
export function requiredPlanFor(count: number, planLimits?: Record<string, number> | null): string | null {
    if (!planLimits) return null;
    let best: string | null = null;
    let bestLimit = Infinity;
    for (const [plan, limit] of Object.entries(planLimits)) {
        if (typeof limit === 'number' && limit >= count && limit < bestLimit) {
            best = plan;
            bestLimit = limit;
        }
    }
    return best;
}

export function isLayoutLocked(id: string, maxCharts: number | null): boolean {
    if (maxCharts === null || maxCharts === undefined) return false;
    return getLayoutDef(id).count > maxCharts;
}

/**
 * Layout to use when `current` exceeds the allowed chart count: the largest allowed layout of the same
 * structure family (ties -> catalog order), else the single chart.
 */
export function pickFallbackLayout(current: string, maxCharts: number | null): LayoutId {
    const cur = getLayoutDef(current);
    if (maxCharts === null || maxCharts === undefined || cur.count <= maxCharts) return cur.id;
    let best: LayoutDef | null = null;
    for (const d of LAYOUT_CATALOG) {
        if (d.family !== cur.family || d.count > maxCharts || d.count < 2) continue;
        if (!best || d.count > best.count) best = d;
    }
    return best ? best.id : DEFAULT_LAYOUT_ID;
}

// --- thumbnails ---

/** Inline SVG (viewBox w x h) of a layout drawn from its split tree; uses `currentColor`. */
export function layoutThumbnailSvg(id: string, w: number = 28, h: number = 20, opts: { gap?: number; radius?: number } = {}): string {
    const gap = opts.gap ?? 1.5;
    const radius = opts.radius ?? 1.5;
    const { cells } = computeGeometry(getLayoutDef(id).tree, w, h, gap);
    const rects = cells
        .map((c) => `<rect x="${round(c.x)}" y="${round(c.y)}" width="${round(c.w)}" height="${round(c.h)}" rx="${radius}" ry="${radius}"/>`)
        .join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="currentColor" aria-hidden="true">${rects}</svg>`;
}

function round(v: number): number {
    return Math.round(v * 100) / 100;
}
