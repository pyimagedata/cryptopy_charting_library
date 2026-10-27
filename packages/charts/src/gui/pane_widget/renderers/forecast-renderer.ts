/**
 * Forecast Renderer
 * Position Forecast, Bars Pattern ve Ghost Feed araclari. Cizim css piksel uzayinda yapilir (ctx dpr ile olceklenir);
 * pixelPoints css px'tir. Hit-test geometrisi ve tutamaclar cizime yazilir.
 */

import { PositionForecastDrawing, forecastStats, forecastLines, barIntervalMs } from '../../../drawings/position-forecast-drawing';
import { BarsPatternDrawing } from '../../../drawings/bars-pattern-drawing';
import { GhostFeedDrawing } from '../../../drawings/ghost-feed-drawing';
import { estimatePricePrecision } from '../../../drawings/line-tool-common';
import { colorWithTransparency } from '../../../drawings/volume-tools-common';
import { drawControlPoint } from './utils';

type Pt = { x: number; y: number };
type TimeToPixel = (time: number) => number | null;
type PriceToPixel = (price: number) => number | null;

function drawHandles(ctx: CanvasRenderingContext2D, pts: Pt[], color: string): void {
    for (const h of pts) drawControlPoint(ctx, h.x, h.y, 5, '#ffffff', color, 2);
}

/** Bar araligi (css px): son iki barin ekran farki; hesaplanamazsa fallback. */
function barSpacingPx(bars: ReadonlyArray<{ time: number }>, timeToPixel: TimeToPixel, fallback = 6): number {
    const n = bars.length;
    if (n >= 2) {
        const a = timeToPixel(bars[n - 2].time), b = timeToPixel(bars[n - 1].time);
        if (a !== null && b !== null && Math.abs(b - a) > 1e-6) return Math.abs(b - a);
    }
    return fallback;
}

// ----------------------------------------------------------------------------
// Position Forecast
// ----------------------------------------------------------------------------

export function drawPositionForecast(
    ctx: CanvasRenderingContext2D,
    drawing: PositionForecastDrawing,
    pts: Pt[],
    paneWidth: number,
    _paneHeight: number,
    dpr: number,
    showHandles: boolean,
    symbol: string
): void {
    drawing.setHandles(pts);
    drawing.setHitGeometry([], []);
    if (pts.length < 2) return;
    const [a, b] = pts;
    const color = drawing.style.color;
    const lw = drawing.style.lineWidth;
    const bars = drawing.bars;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Cizgi + ok ucu
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const head = 8 + lw;
    if (Math.hypot(b.x - a.x, b.y - a.y) > head) {
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - head * Math.cos(ang - 0.4), b.y - head * Math.sin(ang - 0.4));
        ctx.lineTo(b.x - head * Math.cos(ang + 0.4), b.y - head * Math.sin(ang + 0.4));
        ctx.closePath();
        ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(a.x, a.y, 3 + lw / 2, 0, Math.PI * 2);
    ctx.fill();

    // Etiket kutusu (P2'de; hedef yukariysa ustte, asagiysa altta)
    const p1 = drawing.points[0], p2 = drawing.points[1];
    const precision = estimatePricePrecision(bars.slice(-100).map((d: any) => Number(d.close ?? d.value)), 2);
    const status = drawing.getStatus();
    const stats = forecastStats(p1, p2, { precision, symbol, barIntervalMs: barIntervalMs(bars) });
    const lines = forecastLines(stats, precision, status);
    const fontPx = 12;
    ctx.font = `${fontPx}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const padX = 8, padY = 5, lineH = fontPx * 1.4;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
    const h = lines.length * lineH + padY * 2 - (lineH - fontPx);
    const cx = Math.max(w / 2 + 2, Math.min(paneWidth - w / 2 - 2, b.x));
    const top = b.y <= a.y ? b.y - 8 - h : b.y + 8;
    ctx.fillStyle = drawing.statusColor();
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, top, w, h, 4);
    ctx.fill();
    ctx.fillStyle = drawing.props.textColor;
    lines.forEach((l, i) => ctx.fillText(l, cx, top + padY + fontPx / 2 + i * lineH));

    drawing.setHitGeometry([{ x: cx - w / 2, y: top, w, h }], [[a, b]]);
    if (showHandles) drawHandles(ctx, pts, color);
    ctx.restore();
}

// ----------------------------------------------------------------------------
// Bars Pattern
// ----------------------------------------------------------------------------

export function drawBarsPattern(
    ctx: CanvasRenderingContext2D,
    drawing: BarsPatternDrawing,
    pts: Pt[],
    timeToPixel: TimeToPixel,
    priceToPixel: PriceToPixel,
    paneWidth: number,
    paneHeight: number,
    dpr: number,
    showHandles: boolean
): void {
    drawing.setHandles(pts);
    drawing.setHitGeometry([], []);
    const comp = drawing.getComputed();
    const color = drawing.style.color;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.beginPath();
    ctx.rect(0, 0, paneWidth, paneHeight);
    ctx.clip();

    // Kaynak aralik vurgusu (secili / olusturma sirasinda)
    if (showHandles && pts.length >= 2) {
        const x0 = Math.min(pts[0].x, pts[1].x), x1 = Math.max(pts[0].x, pts[1].x);
        ctx.fillStyle = colorWithTransparency(color, 92);
        ctx.fillRect(x0, 0, x1 - x0, paneHeight);
        ctx.strokeStyle = colorWithTransparency(color, 50);
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, 0); ctx.lineTo(x0, paneHeight);
        ctx.moveTo(x1, 0); ctx.lineTo(x1, paneHeight);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    if (comp?.pattern && pts.length >= 3) {
        const pattern = comp.pattern;
        const spacing = barSpacingPx(drawing.bars, timeToPixel);
        const x0 = pts[2].x;
        const mode = drawing.props.mode as string;
        const stroke = colorWithTransparency(color, drawing.props.transparency);
        const lw = Math.max(1, drawing.style.lineWidth);
        const bw = Math.max(1, Math.min(spacing * 0.7, 40));
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const ys: { o: number; h: number; l: number; c: number; x: number }[] = [];
        for (let k = 0; k < pattern.length; k++) {
            const bar = pattern[k];
            const o = priceToPixel(bar.open), h = priceToPixel(bar.high), l = priceToPixel(bar.low), c = priceToPixel(bar.close);
            if (o === null || h === null || l === null || c === null) continue;
            const x = x0 + k * spacing;
            ys.push({ o, h, l, c, x });
            minX = Math.min(minX, x - bw / 2); maxX = Math.max(maxX, x + bw / 2);
            minY = Math.min(minY, h, l); maxY = Math.max(maxY, h, l);
        }
        ctx.strokeStyle = stroke;
        ctx.fillStyle = stroke;
        ctx.lineWidth = lw;
        ctx.lineJoin = 'round';
        if (mode === 'line') {
            ctx.beginPath();
            ys.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.c) : ctx.lineTo(p.x, p.c)));
            ctx.stroke();
        } else {
            for (const p of ys) {
                if (mode === 'hlBars') {
                    ctx.fillRect(p.x - bw / 2, Math.min(p.h, p.l), bw, Math.max(1, Math.abs(p.l - p.h)));
                } else if (mode === 'openClose') {
                    const top = Math.min(p.o, p.c), hgt = Math.max(1, Math.abs(p.c - p.o));
                    if (p.c <= p.o) ctx.fillRect(p.x - bw / 2, top, bw, hgt); // yukari mum (ekranda close daha ustte): dolu
                    else ctx.strokeRect(p.x - bw / 2, top, bw, hgt);          // asagi mum: bos
                } else { // ohlc
                    const tick = Math.max(2, bw / 2);
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.h); ctx.lineTo(p.x, p.l);
                    ctx.moveTo(p.x - tick, p.o); ctx.lineTo(p.x, p.o);
                    ctx.moveTo(p.x, p.c); ctx.lineTo(p.x + tick, p.c);
                    ctx.stroke();
                }
            }
        }
        if (Number.isFinite(minX)) {
            if (mode === 'ohlc') { minX -= bw / 2; maxX += bw / 2; }
            if (mode === 'line') { minX = Math.min(...ys.map((p) => p.x)); maxX = Math.max(...ys.map((p) => p.x)); minY = Math.min(...ys.map((p) => p.c)); maxY = Math.max(...ys.map((p) => p.c)); }
            const pad = 3;
            drawing.setHitGeometry([{ x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }], []);
            if (showHandles) {
                ctx.strokeStyle = colorWithTransparency(color, 50);
                ctx.setLineDash([4, 3]);
                ctx.lineWidth = 1;
                ctx.strokeRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2);
                ctx.setLineDash([]);
            }
        }
    }

    if (showHandles) drawHandles(ctx, pts, color);
    ctx.restore();
}

// ----------------------------------------------------------------------------
// Ghost Feed
// ----------------------------------------------------------------------------

export function drawGhostFeed(
    ctx: CanvasRenderingContext2D,
    drawing: GhostFeedDrawing,
    pts: Pt[],
    priceToPixel: PriceToPixel,
    paneWidth: number,
    paneHeight: number,
    dpr: number,
    showHandles: boolean
): void {
    drawing.setHandles(pts);
    drawing.setHitGeometry([], []);
    if (pts.length < 2) return;
    const p = drawing.props;
    const candles = drawing.getCandles();
    const n = Math.max(1, Math.round(p.candlesPerSegment));

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.beginPath();
    ctx.rect(0, 0, paneWidth, paneHeight);
    ctx.clip();

    const fillUp = colorWithTransparency(p.upColor, p.transparency);
    const fillDown = colorWithTransparency(p.downColor, p.transparency);
    const rects = new Map<number, { x0: number; x1: number; y0: number; y1: number }>();
    const bw = (seg: number) => Math.max(1, Math.min(Math.abs(pts[seg + 1].x - pts[seg].x) / n * 0.7, 30));
    ctx.lineWidth = 1;
    for (const c of candles) {
        const a = pts[c.segment], b = pts[c.segment + 1];
        if (!a || !b) continue;
        const x = a.x + (b.x - a.x) * c.f;
        const yO = priceToPixel(c.open), yC = priceToPixel(c.close), yH = priceToPixel(c.high), yL = priceToPixel(c.low);
        if (yO === null || yC === null || yH === null || yL === null) continue;
        const w = bw(c.segment);
        const up = c.close >= c.open;
        if (p.drawWick) {
            ctx.strokeStyle = p.wickColor;
            ctx.beginPath();
            ctx.moveTo(x, yH); ctx.lineTo(x, yL);
            ctx.stroke();
        }
        const top = Math.min(yO, yC), hgt = Math.max(1, Math.abs(yC - yO));
        ctx.fillStyle = up ? fillUp : fillDown;
        ctx.fillRect(x - w / 2, top, w, hgt);
        if (p.drawBorder && w >= 3) {
            ctx.strokeStyle = up ? p.borderUpColor : p.borderDownColor;
            ctx.lineWidth = Math.max(1, drawing.style.lineWidth);
            ctx.strokeRect(x - w / 2, top, w, hgt);
            ctx.lineWidth = 1;
        }
        const r = rects.get(c.segment) ?? { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
        r.x0 = Math.min(r.x0, x - w / 2); r.x1 = Math.max(r.x1, x + w / 2);
        r.y0 = Math.min(r.y0, yH, yL); r.y1 = Math.max(r.y1, yH, yL);
        rects.set(c.segment, r);
    }
    drawing.setHitGeometry([...rects.values()].map((r) => ({ x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 })), []);

    // Rehber cizgi (secili / olusturma sirasinda)
    if (showHandles) {
        ctx.strokeStyle = colorWithTransparency(drawing.style.color, 40);
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        pts.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
        ctx.stroke();
        ctx.setLineDash([]);
        drawHandles(ctx, pts, drawing.style.color);
    }
    ctx.restore();
}
