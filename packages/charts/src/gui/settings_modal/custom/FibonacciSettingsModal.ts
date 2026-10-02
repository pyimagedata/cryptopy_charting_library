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
import { createLineButton, closeLineButtonMenu } from '../components/LineButton';

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

export class FibonacciSettingsModal extends GenericSettingsModal {
    private _snapshot: Record<string, any> | null = null;
    private _snapshotPoints: { time: number; price: number }[] = [];
    private _oneColorSaved: string[] | null = null;

    protected getTitle(): string {
        const type = this._currentDrawing?.type ?? '';
        return t(TITLES[type] ?? 'Drawing Settings');
    }

    protected getModalWidth(): number {
        return 460;
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

    private _lineButton(width: number, style: LineStyle, onWidth: (w: number) => void, onStyle: (s: LineStyle) => void): HTMLElement {
        return createLineButton(width, style, onWidth, onStyle, this._element);
    }

    private _closeMenu(): void {
        closeLineButtonMenu();
    }
}
