// Shared canvas drawing for horizontal level lines with a right-side label
// (Previous Levels and ADR Levels indicators).

import { TimeScale } from '../model/time-scale';
import { PriceScale } from '../model/price-scale';
import { canvasSans } from '../helpers/fonts';

export type LevelLineStyle = 'solid' | 'dashed' | 'dotted';

export interface LevelLine {
    /** Short code, e.g. "PDH" */
    code: string;
    /** Formatted price shown after the code; '' = code only */
    priceText: string;
    price: number;
    color: string;
    style: LevelLineStyle;
    /** First bar index of the span */
    startIdx: number;
    /** Last bar index of the span; -1 = extend to the right edge of the pane */
    endIdx: number;
}

export const LEVEL_STYLE_OPTIONS = [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
];

export function normalizeLevelStyle(v: unknown): LevelLineStyle {
    return v === 'dashed' || v === 'dotted' ? v : 'solid';
}

interface PendingLabel {
    code: string;
    priceText: string;
    color: string;
    x1: number;
    x2: number;
    y: number;
}

// Reused between draw calls (allocation-light): entries are pooled and overwritten.
const pool: PendingLabel[] = [];
let poolLen = 0;

/**
 * Draws all lines. ctx is in bitmap pixels (hpr / vpr = pixel ratios), as passed to drawOverlay.
 * `rightEdge` is the pane width in bitmap pixels.
 * Labels are laid out together per draw call: labels that end at the same x and whose prices are
 * within half a label height are merged ("PDH / PWH 67250.5"); labels that would still overlap
 * vertically are nudged downwards.
 */
export function drawLevelLines(
    ctx: CanvasRenderingContext2D,
    timeScale: TimeScale,
    priceScale: PriceScale,
    hpr: number,
    vpr: number,
    rightEdge: number,
    lines: ReadonlyArray<LevelLine>,
    lineWidth: number,
    showLabels: boolean,
    visibleRange: { from: number; to: number },
    textBg: string,
): void {
    if (lines.length === 0) return;
    ctx.save();
    ctx.font = `${10 * hpr}px ${canvasSans()}`;
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = Math.max(1, lineWidth * hpr);
    poolLen = 0;
    for (const ln of lines) {
        if (!Number.isFinite(ln.price)) continue;
        if (ln.endIdx >= 0 && ln.endIdx < visibleRange.from - 1) continue;
        if (ln.startIdx > visibleRange.to + 1) continue;
        const y = Math.round((priceScale.priceToCoordinate(ln.price) as number) * vpr) + 0.5;
        if (!Number.isFinite(y)) continue;
        const x1 = Math.max(0, (timeScale.indexToCoordinate(ln.startIdx as any) as number) * hpr);
        const x2 = ln.endIdx < 0 ? rightEdge : Math.min(rightEdge, (timeScale.indexToCoordinate(ln.endIdx as any) as number) * hpr);
        if (!(x2 > x1)) continue;
        ctx.strokeStyle = ln.color;
        ctx.setLineDash(ln.style === 'dashed' ? [6 * hpr, 4 * hpr] : ln.style === 'dotted' ? [2 * hpr, 3 * hpr] : []);
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
        if (showLabels && ln.code) {
            let e = pool[poolLen];
            if (!e) { e = { code: '', priceText: '', color: '', x1: 0, x2: 0, y: 0 }; pool[poolLen] = e; }
            poolLen++;
            e.code = ln.code; e.priceText = ln.priceText; e.color = ln.color; e.x1 = x1; e.x2 = x2; e.y = y;
        }
    }
    if (poolLen > 0) drawLabels(ctx, hpr, textBg);
    ctx.restore();
}

function drawLabels(ctx: CanvasRenderingContext2D, hpr: number, textBg: string): void {
    const labels = pool.slice(0, poolLen);
    labels.sort((a, b) => (Math.round(a.x2) - Math.round(b.x2)) || (a.y - b.y));
    const H = 12 * hpr;
    ctx.setLineDash([]);
    ctx.textAlign = 'right';
    let i = 0;
    while (i < labels.length) {
        // one group = same right end x
        let j = i;
        while (j < labels.length && Math.round(labels[j].x2) === Math.round(labels[i].x2)) j++;
        let prevBottom = -Infinity;
        let k = i;
        while (k < j) {
            const first = labels[k];
            let text = first.code;
            let m = k + 1;
            // merge following labels within half a label height of the first one
            while (m < j && labels[m].y - first.y < H / 2) {
                if (labels[m].code !== first.code) text += ' / ' + labels[m].code;
                m++;
            }
            if (first.priceText) text += ' ' + first.priceText;
            const y = Math.max(first.y, prevBottom + H);
            prevBottom = y;
            const w = ctx.measureText(text).width;
            const tx = first.x2 - 4 * hpr;
            if (tx - w > first.x1) {
                ctx.fillStyle = textBg;
                ctx.fillRect(tx - w - 2 * hpr, y - H, w + 4 * hpr, H);
                ctx.fillStyle = first.color;
                ctx.fillText(text, tx, y - 1 * hpr);
            }
            k = m;
        }
        i = j;
    }
}
