/**
 * Small hover tooltip that follows the pointer inside a pane (used for Evo Script label tooltips).
 * The host owns the element it is attached to; the tip never takes pointer events.
 */

import { canvasSans } from '../helpers/fonts';

export class HoverTip {
    private _el: HTMLDivElement | null = null;

    constructor(private readonly _parent: () => HTMLElement | null) { }

    /** Show `text` near (x, y) (pane-local css px) or hide the tip when text is null */
    set(text: string | null, x: number, y: number): void {
        if (!text) { this.hide(); return; }
        const parent = this._parent();
        if (!parent) return;
        if (!this._el) {
            const el = document.createElement('div');
            el.style.cssText = `position:absolute;z-index:60;pointer-events:none;max-width:260px;padding:6px 8px;border-radius:4px;
                background:#1e222d;color:#d1d4dc;border:1px solid #363a45;box-shadow:0 2px 8px rgba(0,0,0,.4);
                font:12px/1.35 ${canvasSans()};white-space:pre-wrap;word-break:break-word;`;
            this._el = el;
        }
        const el = this._el;
        if (el.parentElement !== parent) parent.appendChild(el);
        if (el.textContent !== text) el.textContent = text;
        el.style.display = 'block';
        const w = el.offsetWidth, h = el.offsetHeight;
        const left = Math.max(2, Math.min(x + 12, parent.clientWidth - w - 2));
        const top = y + 18 + h > parent.clientHeight ? Math.max(2, y - h - 10) : y + 18;
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
    }

    hide(): void {
        if (this._el) this._el.style.display = 'none';
    }

    dispose(): void {
        this._el?.remove();
        this._el = null;
    }
}
