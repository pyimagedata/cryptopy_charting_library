/**
 * Vertical layout of price scale tags: tags whose boxes would overlap are pushed apart (TradingView
 * stacks close tags instead of drawing them on top of each other). Fixed tags (last price, drawing
 * labels) stay where they are; movable tags give way. Order along the axis is preserved.
 */

export interface AxisTagSlot {
    /** Wanted centre (px) */
    y: number;
    /** Box height (px) */
    h: number;
    /** Fixed tags are obstacles that never move */
    fixed?: boolean;
}

/** @returns the centres to draw the tags at (same order as `tags`) */
export function spreadAxisTags(tags: readonly AxisTagSlot[], minY: number, maxY: number): number[] {
    const ys = tags.map((t) => t.y);
    if (tags.length < 2) return ys;
    const order = tags.map((_, i) => i).sort((a, b) => ys[a] - ys[b] || a - b);
    const need = (i: number, j: number) => (tags[i].h + tags[j].h) / 2;
    for (let pass = 0; pass < 24; pass++) {
        let moved = false;
        for (let k = 1; k < order.length; k++) {
            const i = order[k - 1], j = order[k];
            const d = need(i, j) - (ys[j] - ys[i]);
            if (d <= 0.01) continue;
            moved = true;
            const fi = tags[i].fixed === true, fj = tags[j].fixed === true;
            if (fi && fj) continue;
            if (fi) ys[j] += d;
            else if (fj) ys[i] -= d;
            else { ys[i] -= d / 2; ys[j] += d / 2; }
        }
        // keep the movable ones inside the axis
        for (const i of order) {
            if (tags[i].fixed) continue;
            const lo = minY + tags[i].h / 2, hi = maxY - tags[i].h / 2;
            if (hi > lo) ys[i] = Math.max(lo, Math.min(hi, ys[i]));
        }
        if (!moved) break;
    }
    return ys;
}
