/**
 * Inline text editor overlay for Text / Callout / Note / Price Note / Signpost / Comment / Table drawings.
 *
 * A transparent <textarea> is positioned over the chart canvas at the drawing's
 * text box. Enter inserts a newline; Escape or a mousedown outside commits the text
 * through DrawingManager.commitTextEdit().
 */

import type { DrawingManager } from '../drawings/drawing-manager';
import type { Drawing } from '../drawings/drawing';
import { FONT_FAMILY, textBoxBackgroundCss, EditorSpec } from '../drawings/text-common';

const LINE_HEIGHT = 1.2;

export class TextEditorOverlay {
    private _textarea: HTMLTextAreaElement | null = null;
    private _drawing: any = null;
    private _spec: EditorSpec | null = null;
    private _raf = 0;
    private _unsubscribe: (() => void)[] = [];
    private _measureCtx: CanvasRenderingContext2D | null = null;

    constructor(
        private readonly _host: HTMLElement,
        private readonly _getCanvas: (drawing: Drawing) => HTMLCanvasElement | null,
        private readonly _manager: DrawingManager,
        private readonly _requestDraw: () => void
    ) {}

    get isOpen(): boolean {
        return this._textarea !== null;
    }

    /** Opens the editor for a Text/Callout drawing (any open editor is committed first) */
    open(drawing: Drawing, isNew: boolean): void {
        this.close(true);
        const d = drawing as any;
        if (!d.box && typeof d.getEditorSpec !== 'function') {
            this._manager.clearPendingText(drawing.id);
            return;
        }
        this._drawing = d;
        this._spec = this._specFor(d);
        d.editing = true;

        const ta = document.createElement('textarea');
        ta.className = 'chart-text-editor';
        ta.value = isNew ? '' : String(d.text ?? '');
        ta.spellcheck = false;
        ta.setAttribute('wrap', this._spec.wrap ? 'soft' : 'off');
        this._applyStyle(ta);
        const syncLive = (): void => { if ('editText' in d) d.editText = ta.value; };
        syncLive();
        ta.addEventListener('input', () => { syncLive(); this._layout(); this._requestDraw(); });
        ta.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
                e.preventDefault();
                this.close(true);
            }
        });
        ta.addEventListener('keyup', (e) => e.stopPropagation());
        for (const ev of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel']) {
            ta.addEventListener(ev, (e) => e.stopPropagation());
        }
        this._host.appendChild(ta);
        this._textarea = ta;

        const onOutside = (e: Event): void => {
            if (e.target !== ta) this.close(true);
        };
        // pointerdown dokunmatik ekranda da tetiklenir; mousedown eski tarayicilar icin yedek
        document.addEventListener('pointerdown', onOutside, true);
        document.addEventListener('mousedown', onOutside, true);
        this._unsubscribe.push(() => {
            document.removeEventListener('pointerdown', onOutside, true);
            document.removeEventListener('mousedown', onOutside, true);
        });

        // Drawing deleted / undone while editing: drop the editor without committing
        const onChanged = (): void => {
            if (this._drawing && !this._manager.drawings.includes(this._drawing)) this.close(false);
        };
        this._manager.drawingsChanged.subscribe(onChanged);
        this._manager.historyRestored.subscribe(onChanged);
        this._unsubscribe.push(() => {
            this._manager.drawingsChanged.unsubscribe(onChanged);
            this._manager.historyRestored.unsubscribe(onChanged);
        });

        this._layout();
        this._requestDraw();
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        const loop = (): void => {
            if (!this._textarea) return;
            this._layout();
            this._raf = requestAnimationFrame(loop);
        };
        this._raf = requestAnimationFrame(loop);
    }

    /** Closes the editor; commit=true applies the text via the drawing manager */
    close(commit: boolean): void {
        const ta = this._textarea;
        const d = this._drawing;
        if (!ta || !d) return;
        this._textarea = null;
        this._drawing = null;
        this._spec = null;
        cancelAnimationFrame(this._raf);
        for (const fn of this._unsubscribe) fn();
        this._unsubscribe = [];
        const text = ta.value;
        ta.remove();
        d.editing = false;
        if ('editText' in d) d.editText = null;
        if (commit) this._manager.commitTextEdit(d, text);
        if (d.type === 'table') d.editingCell = null;
        this._requestDraw();
    }

    dispose(): void {
        this.close(false);
    }

    /** Editor yerlesimi: cizim kendi spec'ini verir, yoksa Text/Callout'un eski box tabanli duzeni */
    private _specFor(d: any): EditorSpec {
        if (typeof d.getEditorSpec === 'function') return d.getEditorSpec();
        const box = d.box;
        const callout = d.type === 'callout';
        const centered = callout || box.legacy;
        return {
            fontSize: box.fontSize, bold: box.bold, italic: box.italic, wrap: box.wrap, wrapWidth: box.wrapWidth,
            padH: callout ? 16 : 6, padV: callout ? 12 : 6, radius: callout ? 8 : 4, minW: callout ? 50 : 40,
            center: centered, align: centered ? 'center' : 'left',
            bg: box.bgVisible ? textBoxBackgroundCss(box) : 'transparent',
            color: d.style.color,
            border: box.borderVisible && box.borderWidth > 0 ? { width: box.borderWidth, color: box.borderColor } : undefined,
        };
    }

    private _applyStyle(ta: HTMLTextAreaElement): void {
        const spec = this._spec!;
        const s = ta.style;
        s.position = 'fixed';
        s.zIndex = '1000';
        s.margin = '0';
        s.resize = 'none';
        s.overflow = 'hidden';
        s.boxSizing = 'content-box';
        s.border = 'none';
        s.outline = '1px dashed rgba(41, 98, 255, 0.7)';
        s.background = spec.bg;
        if (spec.border) {
            s.boxShadow = `inset 0 0 0 ${spec.border.width}px ${spec.border.color}`;
        }
        s.borderRadius = `${spec.radius}px`;
        s.color = spec.color;
        s.font = `${spec.italic ? 'italic ' : ''}${spec.bold ? 'bold ' : ''}${spec.fontSize}px ${FONT_FAMILY}`;
        s.lineHeight = `${spec.fontSize * (spec.lineHeightRatio ?? LINE_HEIGHT)}px`;
        s.textAlign = spec.align;
        s.whiteSpace = spec.wrap ? 'pre-wrap' : 'pre';
        const padL = spec.padL ?? spec.padH;
        s.padding = `${spec.padV}px ${spec.padH}px ${spec.padV}px ${padL}px`;
        s.caretColor = spec.color;
    }

    private _measure(font: string, text: string): number {
        if (!this._measureCtx) this._measureCtx = document.createElement('canvas').getContext('2d');
        const ctx = this._measureCtx;
        if (!ctx) return text.length * 8;
        ctx.font = font;
        let max = 0;
        for (const line of text.split('\n')) max = Math.max(max, ctx.measureText(line).width);
        return max;
    }

    /** Sizes (auto-grow) and positions the textarea at the drawing's text box */
    private _layout(): void {
        const ta = this._textarea;
        const d = this._drawing;
        const spec = this._spec;
        const canvas = d ? this._getCanvas(d) : null;
        if (!ta || !d || !canvas || !spec) return;
        const bounds = (typeof d.getEditorBounds === 'function' ? d.getEditorBounds() : d.getBounds?.()) as
            { x: number; y: number; width: number; height: number } | null;
        if (!bounds) {
            ta.style.visibility = 'hidden';
            return;
        }
        ta.style.visibility = 'visible';

        const padL = spec.padL ?? spec.padH;
        const padW = padL + spec.padH;
        const padV = spec.padV;
        const lh = spec.fontSize * (spec.lineHeightRatio ?? LINE_HEIGHT);
        const lines = Math.max(1, ta.value.split('\n').length);

        let contentW: number;
        let contentH: number;
        if (spec.fixed) {
            contentW = Math.max(10, bounds.width - padW);
            contentH = Math.max(lh, bounds.height - padV * 2);
        } else {
            const textW = this._measure(ta.style.font, ta.value) + (spec.extraW ?? 4);
            // Kelime kaydirmada cizilen kutu genisligi: en genis sarili satir (wrapWidth ile sinirli)
            contentW = spec.wrap
                ? (spec.wrapFixed ? spec.wrapWidth : Math.min(spec.wrapWidth, Math.max(textW, spec.minW)))
                : Math.max(textW, spec.minW);
            contentH = lines * lh;
        }
        ta.style.width = `${Math.ceil(contentW)}px`;
        if (!spec.fixed && spec.wrap) {
            ta.style.height = '0px';
            contentH = Math.max(lh, ta.scrollHeight - padV * 2);
        }
        ta.style.height = `${Math.ceil(contentH)}px`;

        const rect = canvas.getBoundingClientRect();
        const totalW = contentW + padW;
        const totalH = contentH + padV * 2;
        let left: number;
        let top: number;
        if (spec.center) {
            left = rect.left + bounds.x + bounds.width / 2 - totalW / 2;
            top = rect.top + bounds.y + bounds.height / 2 - totalH / 2;
        } else {
            left = rect.left + bounds.x;
            top = rect.top + bounds.y + (spec.anchorBottom ? bounds.height - totalH : 0);
        }
        ta.style.left = `${Math.round(left)}px`;
        ta.style.top = `${Math.round(top)}px`;
    }
}
