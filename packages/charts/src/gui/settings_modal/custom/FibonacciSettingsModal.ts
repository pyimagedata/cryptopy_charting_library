/**
 * Fibonacci araclari (duzeltme, trend bazli uzatma, kanal) icin ayar penceresi.
 *
 * Stil sekmesi TradingView'in Fib penceresi duzeninde, kompakt satirlarla:
 * trend cizgisi (onay + renk + cizgi), seviye cizgileri, uzatma, seviye
 * tablosu + "tek renk", arka plan, ters cevir, etiketler, log olcek.
 * Koordinatlar/Gorunurluk sekmeleri ortak pencereden gelir. "Iptal" pencere
 * acildigindaki hale dondurur.
 */

import { Drawing } from '../../../drawings';
import { t } from '../../../helpers/translations';
import { GenericSettingsModal } from '../generic/GenericSettingsModal';
import { DrawingSettingsProvider } from '../base/SettingsTypes';
import { createFibLevelsEditor } from '../components';
import { createColorSwatch, createCheckbox, createSelect, createSlider } from '../base/SettingsComponents';

const TITLES: Record<string, string> = {
    fibRetracement: 'Fib Retracement',
    fibExtension: 'Trend-Based Fib Extension',
    fibChannel: 'Fib Channel',
};

/** Pencerenin dokundugu tum anahtarlar (Iptal icin anlik goruntu). */
const SNAPSHOT_KEYS = [
    'trendLineVisible', 'color', 'trendLineStyle', 'trendLineWidth', 'lineWidth', 'lineStyle', 'opacity',
    'extendLeft', 'extendRight', 'levels', 'fillBackground', 'backgroundOpacity', 'reversed',
    'showPrices', 'showLabels', 'coeffsAsPercents', 'labelHAlign', 'labelVAlign', 'labelFontSize', 'logScale', 'visible',
];

type LineStyle = 'solid' | 'dashed' | 'dotted';
type Provider = Drawing & DrawingSettingsProvider & { fib?: { capabilities?: { prices: boolean; logScale: boolean } } };

function dashAttr(style: LineStyle): string {
    if (style === 'dashed') return '5 3';
    if (style === 'dotted') return '1.5 2';
    return '';
}

function linePreviewSvg(width: number, style: LineStyle, length = 28): string {
    const dash = dashAttr(style);
    return `<svg width="${length}" height="12" viewBox="0 0 ${length} 12" aria-hidden="true"><line x1="1" y1="6" x2="${length - 1}" y2="6" stroke="currentColor" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''} stroke-linecap="butt"/></svg>`;
}

export class FibonacciSettingsModal extends GenericSettingsModal {
    private _snapshot: Record<string, any> | null = null;
    private _snapshotPoints: { time: number; price: number }[] = [];
    private _menu: HTMLElement | null = null;
    private _oneColorSaved: string[] | null = null;

    protected getTitle(): string {
        const type = this._currentDrawing?.type ?? '';
        return t(TITLES[type] ?? 'Drawing Settings');
    }

    protected hasCancel(): boolean {
        return true;
    }

    protected initializeForDrawing(drawing: Drawing): void {
        super.initializeForDrawing(drawing);
        const p = drawing as Provider;
        this._snapshot = {};
        for (const key of SNAPSHOT_KEYS) {
            const v = p.getSettingValue(key);
            this._snapshot[key] = key === 'levels' && Array.isArray(v) ? v.map((l: any) => ({ ...l })) : v;
        }
        this._snapshotPoints = drawing.points.map((pt) => ({ ...pt }));
        this._oneColorSaved = null;
    }

    protected onCancel(): void {
        const drawing = this._currentDrawing as Provider | null;
        if (!drawing || !this._snapshot) return;
        for (const key of SNAPSHOT_KEYS) {
            const v = this._snapshot[key];
            if (v === undefined) continue;
            drawing.setSettingValue(key, key === 'levels' ? v.map((l: any) => ({ ...l })) : v);
        }
        drawing.points = this._snapshotPoints.map((pt) => ({ ...pt }));
    }

    hide(): void {
        this._closeMenu();
        super.hide();
    }

    protected renderTabContent(tabId: string, container: HTMLElement): void {
        if (tabId !== 'style') {
            super.renderTabContent(tabId, container);
            return;
        }
        this._renderFibStyle(container);
    }

    // --- Stil sekmesi ---

    private _renderFibStyle(container: HTMLElement): void {
        const d = this._currentDrawing as Provider | null;
        if (!d) return;
        const caps = d.fib?.capabilities ?? { prices: true, logScale: true };
        const get = (k: string) => d.getSettingValue(k);
        const set = (k: string, v: any) => {
            d.setSettingValue(k, v);
            this.notifySettingsChanged();
        };
        const rerender = () => {
            container.innerHTML = '';
            this._renderFibStyle(container);
        };

        container.style.padding = '8px 20px 12px';

        // Trend cizgisi: onay + renk + cizgi (kalinlik/stil)
        container.appendChild(this._row(
            this._check(!!get('trendLineVisible'), t('Trend Line'), (v) => set('trendLineVisible', v)),
            [
                createColorSwatch(get('color') || '#2962ff', (c) => set('color', c)),
                this._lineButton(Number(get('trendLineWidth') || 1), (get('trendLineStyle') || 'dashed') as LineStyle,
                    (w) => set('trendLineWidth', w), (s) => set('trendLineStyle', s)),
            ],
        ));

        // Seviye cizgileri: cizgi + saydamlik
        container.appendChild(this._row(
            this._label(t('Levels Line')),
            [this._lineButton(Number(get('lineWidth') || 1), (get('lineStyle') || 'solid') as LineStyle,
                (w) => set('lineWidth', w), (s) => set('lineStyle', s))],
        ));
        container.appendChild(this._row(
            this._label(t('Line Opacity')),
            [createSlider(Number(get('opacity') ?? 100), 10, 100, 1, '%', (v) => set('opacity', v))],
        ));

        // Uzatma: sol / sag
        container.appendChild(this._row(
            this._label(t('Extend')),
            [
                this._check(!!get('extendLeft'), t('Left'), (v) => set('extendLeft', v)),
                this._check(!!get('extendRight'), t('Right'), (v) => set('extendRight', v)),
            ],
        ));

        // Seviye tablosu
        const levels = (get('levels') || []) as any[];
        const editor = createFibLevelsEditor(
            levels.map((l) => ({ level: l.level, label: l.label, color: l.color, visible: l.visible ?? l.enabled ?? true })),
            (updated) => set('levels', updated.map((l: any) => ({ level: l.level, label: l.label, color: l.color, enabled: l.visible }))),
        );
        const levelsWrap = document.createElement('div');
        levelsWrap.style.cssText = 'padding: 8px 0 4px; border-top: 1px solid var(--border-color); margin-top: 6px;';
        levelsWrap.appendChild(editor);
        container.appendChild(levelsWrap);

        // Tek renk kullan: isaretlenince tum seviyeler secilen renge boyanir; kaldirilinca eski renkler geri gelir.
        const oneColor = this._oneColorSaved !== null;
        const firstColor = levels[0]?.color || '#2962ff';
        let chosen = oneColor ? firstColor : '#2962ff';
        const applyOne = (color: string) => {
            const cur = (get('levels') || []) as any[];
            set('levels', cur.map((l) => ({ ...l, color })));
        };
        container.appendChild(this._row(
            this._check(oneColor, t('Use one color'), (v) => {
                const cur = (get('levels') || []) as any[];
                if (v) {
                    this._oneColorSaved = cur.map((l) => l.color);
                    applyOne(chosen);
                } else if (this._oneColorSaved) {
                    const saved = this._oneColorSaved;
                    set('levels', cur.map((l, i) => ({ ...l, color: saved[i] ?? l.color })));
                    this._oneColorSaved = null;
                }
                rerender();
            }),
            [createColorSwatch(chosen, (c) => {
                chosen = c;
                if (this._oneColorSaved !== null) {
                    applyOne(c);
                    rerender();
                }
            })],
        ));

        // Arka plan
        container.appendChild(this._row(
            this._check(!!get('fillBackground'), t('Background'), (v) => set('fillBackground', v)),
            [createSlider(Number(get('backgroundOpacity') ?? 20), 0, 50, 1, '%', (v) => set('backgroundOpacity', v))],
        ));

        // Ters cevir
        container.appendChild(this._row(this._check(!!get('reversed'), t('Reverse'), (v) => set('reversed', v)), []));

        // Etiketler: fiyatlar, seviyeler (deger / yuzde)
        const labelControls: HTMLElement[] = [];
        if (caps.prices) labelControls.push(this._check(!!get('showPrices'), t('Prices'), (v) => set('showPrices', v)));
        labelControls.push(this._check(!!get('showLabels'), t('Levels'), (v) => set('showLabels', v)));
        labelControls.push(this._select(
            [{ value: 'values', label: t('Values') }, { value: 'percents', label: t('Percents') }],
            get('coeffsAsPercents') ? 'percents' : 'values',
            (v) => set('coeffsAsPercents', v === 'percents'),
        ));
        container.appendChild(this._row(this._label(t('Labels')), labelControls));

        // Etiket konumu + yazi boyutu
        container.appendChild(this._row(
            this._label(t('Label Position')),
            [
                this._select([
                    { value: 'left', label: t('Left') }, { value: 'center', label: t('Center') }, { value: 'right', label: t('Right') },
                ], get('labelHAlign') || 'left', (v) => set('labelHAlign', v)),
                this._select([
                    { value: 'top', label: t('Top') }, { value: 'middle', label: t('Middle') }, { value: 'bottom', label: t('Bottom') },
                ], get('labelVAlign') || 'middle', (v) => set('labelVAlign', v)),
            ],
        ));
        container.appendChild(this._row(
            this._label(t('Font Size')),
            [this._select(['10', '11', '12', '14', '16', '20'].map((v) => ({ value: v, label: v })), String(get('labelFontSize') || '12'),
                (v) => set('labelFontSize', v))],
        ));

        if (caps.logScale) {
            container.appendChild(this._row(
                this._check(!!get('logScale'), t('Fib levels based on log scale'), (v) => set('logScale', v)), [],
            ));
        }
    }

    // --- Kompakt satir yardimcilari ---

    private _row(left: HTMLElement, controls: HTMLElement[]): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:36px;';
        row.appendChild(left);
        if (controls.length) {
            const right = document.createElement('div');
            right.style.cssText = 'display:flex;align-items:center;gap:10px;flex-shrink:0;';
            controls.forEach((c) => right.appendChild(c));
            row.appendChild(right);
        }
        return row;
    }

    private _label(text: string): HTMLElement {
        const el = document.createElement('span');
        el.textContent = text;
        el.style.cssText = 'font-size:13px;color:var(--text-primary);';
        return el;
    }

    private _check(checked: boolean, label: string, onChange: (v: boolean) => void): HTMLElement {
        const el = createCheckbox(checked, label, onChange);
        el.style.fontSize = '13px';
        el.style.color = 'var(--text-primary)';
        return el;
    }

    private _select(options: { value: string; label: string }[], value: string, onChange: (v: string) => void): HTMLElement {
        const el = createSelect(options, value, onChange);
        el.style.minWidth = '0';
        el.style.width = 'auto';
        el.style.padding = '5px 8px';
        el.style.fontSize = '13px';
        return el;
    }

    /** Cizgi onizlemeli dugme; tiklayinca kalinlik + stil menusu acar. */
    private _lineButton(width: number, style: LineStyle, onWidth: (w: number) => void, onStyle: (s: LineStyle) => void): HTMLElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = t('Line Style');
        btn.style.cssText = `display:flex;align-items:center;gap:6px;height:28px;padding:0 8px;border:1px solid var(--border-color);
            border-radius:4px;background:var(--input-bg);color:var(--text-primary);cursor:pointer;`;
        const paint = () => {
            btn.innerHTML = `${linePreviewSvg(width, style)}<svg width="8" height="8" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
        };
        paint();
        btn.onclick = (e) => {
            e.stopPropagation();
            if (this._menu && this._menu.dataset.owner === btn.dataset.ownerId) {
                this._closeMenu();
                return;
            }
            this._closeMenu();
            btn.dataset.ownerId = String(Math.random());
            const menu = document.createElement('div');
            menu.dataset.owner = btn.dataset.ownerId;
            const r = btn.getBoundingClientRect();
            menu.style.cssText = `position:fixed;top:${r.bottom + 4}px;left:${r.left}px;z-index:10001;background:var(--modal-bg);
                border:1px solid var(--border-color);border-radius:6px;box-shadow:var(--shadow);padding:6px;display:flex;flex-direction:column;gap:2px;`;
            const item = (html: string, active: boolean, onClick: () => void) => {
                const it = document.createElement('button');
                it.type = 'button';
                it.innerHTML = html;
                it.style.cssText = `display:flex;align-items:center;gap:8px;padding:6px 10px;border:none;border-radius:4px;cursor:pointer;
                    color:var(--text-primary);font-size:12px;background:${active ? 'rgba(41,98,255,0.18)' : 'transparent'};`;
                it.onmouseenter = () => { if (!active) it.style.background = 'var(--hover-bg)'; };
                it.onmouseleave = () => { if (!active) it.style.background = 'transparent'; };
                it.onclick = (ev) => { ev.stopPropagation(); onClick(); };
                menu.appendChild(it);
            };
            [1, 2, 3, 4].forEach((w) => item(`${linePreviewSvg(w, 'solid', 40)}<span>${w}px</span>`, w === width, () => {
                width = w; onWidth(w); paint(); this._closeMenu();
            }));
            const sep = document.createElement('div');
            sep.style.cssText = 'height:1px;background:var(--border-color);margin:4px 0;';
            menu.appendChild(sep);
            (['solid', 'dashed', 'dotted'] as LineStyle[]).forEach((s) => item(linePreviewSvg(2, s, 40), s === style, () => {
                style = s; onStyle(s); paint(); this._closeMenu();
            }));
            // body'ye eklenir: pencere transform ile ortalandigi icin icindeki
            // position:fixed eleman yanlis yere kayardi. Tema degiskenleri kopyalanir.
            if (this._element) {
                const cs = getComputedStyle(this._element);
                for (const v of ['--modal-bg', '--text-primary', '--border-color', '--hover-bg', '--shadow', '--input-bg']) {
                    menu.style.setProperty(v, cs.getPropertyValue(v));
                }
            }
            document.body.appendChild(menu);
            this._menu = menu;
            const off = (ev: MouseEvent) => {
                if (!menu.contains(ev.target as Node) && ev.target !== btn) {
                    this._closeMenu();
                    document.removeEventListener('mousedown', off, true);
                }
            };
            document.addEventListener('mousedown', off, true);
        };
        return btn;
    }

    private _closeMenu(): void {
        this._menu?.remove();
        this._menu = null;
    }
}
