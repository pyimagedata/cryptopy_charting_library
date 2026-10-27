/**
 * Annotation Renderer
 * Renders Text, Callouts, and other annotation tools
 */

import { TextDrawing } from '../../../drawings/text-drawing';
import {
    CalloutDrawing, CALLOUT_RADIUS, CALLOUT_MARGIN, CALLOUT_MIN_WRAP_WIDTH,
    buildCalloutGeometry, calloutTextSize, calloutWrapHandleX,
} from '../../../drawings/callout-drawing';
import { PriceLabelDrawing } from '../../../drawings/price-label-drawing';
import { FlagMarkedDrawing } from '../../../drawings/flag-marked-drawing';
import { StickerDrawing } from '../../../drawings/sticker-drawing';
import { cssFont, wrapText, textBoxBackgroundCss, withAlpha } from '../../../drawings/text-common';
import { parseColor } from '../../../drawings/shape-common';

/** Metni ayarlara gore satirlara boler (kelime kaydirma aciksa wrapWidth px'e sigdirir); ctx.font ayarli olmali. */
function layoutLines(ctx: CanvasRenderingContext2D, text: string, wrap: boolean, wrapWidth: number, dpr: number): string[] {
    const measure = (s: string) => ctx.measureText(s).width;
    return wrap ? wrapText(text, wrapWidth * dpr, measure) : String(text ?? '').split('\n');
}

/** Kenarlik cizilebilir mi (saydam / cozulemeyen renk degil) */
function isDrawableColor(c: string): boolean {
    return !!c && c !== 'transparent' && parseColor(c) !== null;
}

/**
 * Draw a Text label
 */
export function drawText(
    ctx: CanvasRenderingContext2D,
    drawing: TextDrawing,
    pixelPoint: { x: number; y: number },
    dpr: number,
    isSelected: boolean
): void {
    const { text, style, box } = drawing;

    ctx.save();

    ctx.font = cssFont(box.fontSize * dpr, box.bold, box.italic);

    // Support multiline text (+ word wrap)
    const lines = layoutLines(ctx, text, box.wrap, box.wrapWidth, dpr);
    const lineHeight = box.fontSize * 1.2 * dpr;

    let maxLineWidth = 0;
    lines.forEach(line => {
        maxLineWidth = Math.max(maxLineWidth, ctx.measureText(line).width);
    });

    const textHeight = lines.length * lineHeight;
    const padding = 6 * dpr;

    const boxWidth = maxLineWidth + padding * 2;
    const boxHeight = textHeight + padding * 2;

    // Yeni duzen: nokta kutunun sol ustu; eski kayit: nokta kutunun ortasi
    const x = box.legacy ? pixelPoint.x - boxWidth / 2 : pixelPoint.x;
    const y = box.legacy ? pixelPoint.y - boxHeight / 2 : pixelPoint.y;

    // Cache bounds for hit testing (and inline editor placement)
    drawing.setCachedBounds({
        x: x / dpr,
        y: y / dpr,
        width: boxWidth / dpr,
        height: boxHeight / dpr
    });

    // Satir ici editor acikken kutuyu ve metni editor cizer
    if (drawing.editing) { ctx.restore(); return; }

    // 1. Draw Background and Border
    const drawBg = box.bgVisible && box.bgOpacity > 0;
    const drawBorder = box.borderVisible && isDrawableColor(box.borderColor) && box.borderWidth > 0;
    if (drawBg || drawBorder) {
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(x, y, boxWidth, boxHeight, 4 * dpr);
        } else {
            ctx.rect(x, y, boxWidth, boxHeight);
        }

        if (drawBg) {
            ctx.fillStyle = textBoxBackgroundCss(box);
            ctx.fill();
        }

        if (drawBorder) {
            ctx.strokeStyle = box.borderColor;
            ctx.lineWidth = box.borderWidth * dpr;
            ctx.stroke();
        }
    }

    // 2. Draw Text lines
    ctx.fillStyle = style.color;
    ctx.textBaseline = 'middle';
    const centered = box.legacy;
    ctx.textAlign = centered ? 'center' : 'left';
    const textX = centered ? x + boxWidth / 2 : x + padding;

    const startY = y + padding + lineHeight / 2;
    lines.forEach((line, i) => {
        ctx.fillText(line, textX, startY + i * lineHeight);
    });

    // 3. Draw selection
    if (isSelected) {
        drawSelectionBox(ctx, x, y, boxWidth, boxHeight, style.color, dpr);
        drawControlPoint(ctx, pixelPoint.x, pixelPoint.y, style.color, dpr);
    }

    ctx.restore();
}

/**
 * Draw a Callout (TradingView geometri: bkz. buildCalloutGeometry)
 */
export function drawCallout(
    ctx: CanvasRenderingContext2D,
    drawing: CalloutDrawing,
    pixelPoints: { x: number; y: number }[],
    dpr: number,
    isSelected: boolean
): void {
    if (pixelPoints.length < 1) return;

    // First point: anchor (where pointer tip goes)
    // Second point: box center
    const anchor = pixelPoints[0];
    const boxCenter = pixelPoints.length > 1
        ? pixelPoints[1]
        : { x: anchor.x + 80 * dpr, y: anchor.y - 60 * dpr };

    const { style, box } = drawing;
    // Editor acikken kutu, textarea'daki canli metne gore boyutlanir
    const text = drawing.editing && drawing.editText !== null ? drawing.editText : drawing.text;
    const { fontSize, borderColor, borderWidth } = box;

    ctx.save();

    ctx.font = cssFont(fontSize * dpr, box.bold, box.italic);

    // Satirlar (+ kelime kaydirma); satir yuksekligi = yazi boyutu
    const wrapWidth = Math.max(CALLOUT_MIN_WRAP_WIDTH, box.wrapWidth);
    const lines = layoutLines(ctx, text, box.wrap, wrapWidth, dpr);
    let maxLineWidth = 0;
    lines.forEach(line => { maxLineWidth = Math.max(maxLineWidth, ctx.measureText(line).width); });
    const size = calloutTextSize(maxLineWidth, lines.length, fontSize, box.wrap, wrapWidth, dpr);
    const geo = buildCalloutGeometry(anchor, boxCenter, size.textWidth, size.textHeight, dpr);

    // Cache bounds (css px)
    drawing.setCachedBounds({
        x: geo.left / dpr,
        y: geo.top / dpr,
        width: geo.width / dpr,
        height: geo.height / dpr
    });
    const handles = [{ x: anchor.x / dpr, y: anchor.y / dpr }];
    if (box.wrap) handles.push({ x: calloutWrapHandleX(boxCenter.x, wrapWidth, dpr) / dpr, y: boxCenter.y / dpr });
    drawing.setHandlePoints(handles);

    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const c of geo.cmds) {
        const px = (v: number) => geo.left + v;
        const py = (v: number) => geo.top + v;
        if (c.op === 'M') ctx.moveTo(px(c.x), py(c.y));
        else if (c.op === 'L') ctx.lineTo(px(c.x), py(c.y));
        else ctx.arcTo(px(c.x1), py(c.y1), px(c.x2), py(c.y2), c.r);
    }
    ctx.closePath();

    // TV: once kenarlik, sonra dolgu
    if (box.borderVisible && isDrawableColor(borderColor) && borderWidth > 0) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth * dpr;
        ctx.stroke();
    }
    if (box.bgVisible && box.bgOpacity > 0) {
        ctx.fillStyle = textBoxBackgroundCss(box);
        ctx.fill();
    }

    // Metin: sol ust ic bosluk (radius + margin), satir yuksekligi = yazi boyutu
    // (editor acikken metni textarea gosterir)
    const inset = (CALLOUT_RADIUS + CALLOUT_MARGIN) * dpr;
    const centered = box.legacy;
    ctx.fillStyle = style.color;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = centered ? 'center' : 'left';
    const textX = centered ? geo.left + geo.width / 2 : geo.left + inset;
    let textY = geo.top + inset + fontSize * dpr;
    for (const line of lines) {
        if (!drawing.editing) ctx.fillText(line, textX, textY);
        textY += fontSize * dpr;
    }

    // Selection: sabit tutamaci (+ kelime kaydirma aciksa sag kenar tutamaci)
    if (isSelected) {
        const cpColor = isDrawableColor(borderColor) ? borderColor : style.color;
        drawControlPoint(ctx, anchor.x, anchor.y, cpColor, dpr);
        if (box.wrap && pixelPoints.length > 1) {
            drawControlPoint(ctx, handles[1].x * dpr, handles[1].y * dpr, cpColor, dpr);
        }
    }

    ctx.restore();
}

/**
 * Draw a Price Label
 */
export function drawPriceLabel(
    ctx: CanvasRenderingContext2D,
    drawing: PriceLabelDrawing,
    pixelPoint: { x: number; y: number },
    price: number,
    dpr: number,
    isSelected: boolean,
    precision: number = 2
): void {
    const { fontSize, style, backgroundColor, backgroundOpacity, borderColor, bold } = drawing;

    ctx.save();

    const text = price.toFixed(Math.max(0, Math.min(10, precision)));
    ctx.font = cssFont(fontSize * dpr, bold, false);

    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize * dpr;
    const paddingX = 12 * dpr;
    const paddingY = 8 * dpr;

    const boxWidth = textWidth + paddingX * 2;
    const boxHeight = textHeight + paddingY * 2;
    const radius = 6 * dpr;

    // Box position - offset from anchor point (anchor is at bottom-left)
    const x = pixelPoint.x + 8 * dpr;
    const y = pixelPoint.y - boxHeight - 8 * dpr;

    drawing.setCachedBounds({
        x: x / dpr,
        y: y / dpr,
        width: boxWidth / dpr,
        height: boxHeight / dpr
    });

    // Tek yol: yuvarlak kutu + sol alt kosede imlece uzanan isaretci (ust uste binen dolgu koyulasmaz)
    const pointerOffset = 10 * dpr;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + boxWidth - radius, y);
    ctx.quadraticCurveTo(x + boxWidth, y, x + boxWidth, y + radius);
    ctx.lineTo(x + boxWidth, y + boxHeight - radius);
    ctx.quadraticCurveTo(x + boxWidth, y + boxHeight, x + boxWidth - radius, y + boxHeight);
    ctx.lineTo(x + pointerOffset, y + boxHeight);
    ctx.lineTo(pixelPoint.x, pixelPoint.y);
    ctx.lineTo(x, y + boxHeight - pointerOffset);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    if (backgroundOpacity > 0) {
        ctx.fillStyle = withAlpha(backgroundColor, backgroundOpacity);
        ctx.fill();
    }
    if (isDrawableColor(borderColor)) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1 * dpr;
        ctx.lineJoin = 'round';
        ctx.stroke();
    }

    // Text
    ctx.fillStyle = style.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + boxWidth / 2, y + boxHeight / 2);

    // Control point when selected
    if (isSelected) {
        drawControlPoint(ctx, pixelPoint.x, pixelPoint.y, backgroundColor, dpr);
    }

    ctx.restore();
}

/**
 * Draw a Flag Marker
 */
export function drawFlagMarked(
    ctx: CanvasRenderingContext2D,
    drawing: FlagMarkedDrawing,
    pixelPoint: { x: number; y: number },
    dpr: number,
    isSelected: boolean
): void {
    const { text, style } = drawing;

    ctx.save();

    const size = 24 * dpr;
    const x = pixelPoint.x;
    const y = pixelPoint.y - size;

    drawing.setCachedBounds({
        x: x / dpr,
        y: y / dpr,
        width: size / dpr,
        height: size / dpr
    });

    // Draw Flag Pole
    ctx.strokeStyle = '#787b86';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, pixelPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    // Draw Flag
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + size * 0.8, y + size * 0.3);
    ctx.lineTo(x, y + size * 0.6);
    ctx.closePath();
    ctx.fill();

    if (text) {
        ctx.font = `${10 * dpr}px sans-serif`;
        ctx.fillStyle = '#787b86';
        ctx.textAlign = 'left';
        ctx.fillText(text, x + 4 * dpr, pixelPoint.y + 12 * dpr);
    }

    if (isSelected) {
        drawControlPoint(ctx, pixelPoint.x, pixelPoint.y, style.color, dpr);
    }

    ctx.restore();
}

/**
 * Draw a Sticker (Emoji/Icon)
 */
export function drawSticker(
    ctx: CanvasRenderingContext2D,
    drawing: StickerDrawing,
    pixelPoint: { x: number; y: number },
    dpr: number,
    isSelected: boolean
): void {
    const { content, fontSize } = drawing;

    ctx.save();

    const fontScalar = fontSize * dpr;
    ctx.font = `${fontScalar}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Measure text for selection box and hit testing
    const metrics = ctx.measureText(content);
    const width = metrics.width;
    const height = fontScalar; // Approximate height

    drawing.setCachedBounds({
        x: (pixelPoint.x - width / 2) / dpr,
        y: (pixelPoint.y - height / 2) / dpr,
        width: width / dpr,
        height: height / dpr
    });

    // Draw the sticker
    ctx.fillText(content, pixelPoint.x, pixelPoint.y);

    if (isSelected) {
        // Just draw a small circle at the anchor if selected
        drawControlPoint(ctx, pixelPoint.x, pixelPoint.y, '#2962ff', dpr);
    }

    ctx.restore();
}

// Helpers
function drawSelectionBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, dpr: number) {
    ctx.strokeStyle = color;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(x - 2 * dpr, y - 2 * dpr, w + 4 * dpr, h + 4 * dpr);
    ctx.setLineDash([]);
}

function drawControlPoint(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, dpr: number) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 2 * dpr, 0, Math.PI * 2);
    ctx.fill();
}
