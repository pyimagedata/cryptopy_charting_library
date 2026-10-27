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
import { createFibLevelsEditor, createFibLevelTextEditor } from '../components';
import { createColorSwatch, createCheckbox, createSelect, createSlider } from '../base/SettingsComponents';
import { createLineButton, closeLineButtonMenu } from '../components/LineButton';

const TITLES: Record<string, string> = {
    fibRetracement: 'Fib Retracement',
    fibExtension: 'Trend-Based Fib Extension',
    fibChannel: 'Fib Channel',
};

/** Pencerenin dokundugu tum anahtarlar (Iptal icin anlik goruntu). */
const SNAPSHOT_KEYS = [
    'trendLineVisible', 'color', 'trendLineStyle', 'trendLineWidth', 'lineWidth', 'lineStyle',
    'extendLeft', 'extendRight', 'levels', 'fillBackground', 'backgroundOpacity', 'reversed',
    'showPrices', 'showLabels', 'coeffsAsPercents', 'labelHAlign', 'labelVAlign', 'labelFontSize', 'logScale', 'visible',
    'showText', 'horzTextAlign', 'vertTextAlign',
];

type LineStyle = 'solid' | 'dashed' | 'dotted';
type Provider = Drawing & DrawingSettingsProvider & { fib?: { capabilities?: { prices: boolean; logScale: boolean } } };

export class FibonacciSettingsModal extends GenericSettingsModal {
    private _snapshot: Record<string, any> | null = null;
    private _snapshotPoints: { time: number; price: number }[] = [];
    private _snapshotIntervals: Drawing['intervalsVisibilities'] = undefined;

    protected getTitle(): string {
        const type = this._currentDrawing?.type ?? '';
        return t(TITLES[type] ?? 'Drawing Settings');
    }

    protected getTabs() {
        const tabs = [{ id: 'style', label: t('Style') }];
        if (this._caps().levelText !== false) tabs.push({ id: 'text', label: t('Text') });
        tabs.push({ id: 'coordinates', label: t('Coordinates') }, { id: 'visibility', label: t('Visibility') });
        return tabs;
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
        this._snapshotIntervals = drawing.intervalsVisibilities ? { ...drawing.intervalsVisibilities } : undefined;
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
        drawing.intervalsVisibilities = this._snapshotIntervals ? { ...this._snapshotIntervals } : undefined;
    }

    hide(): void {
        this._closeMenu();
        super.hide();
    }

    protected renderTabContent(tabId: string, container: HTMLElement): void {
        if (tabId === 'style') this._renderFibStyle(container);
        else if (tabId === 'text') this._renderFibText(container);
        else super.renderTabContent(tabId, container);
    }

    // --- Stil sekmesi ---

    private _caps(): { prices: boolean; logScale: boolean; trendLine?: boolean; reverse?: boolean; levelText?: boolean } {
        return (this._currentDrawing as Provider | null)?.fib?.capabilities ?? { prices: true, logScale: true };
    }

    private _setter(): (k: string, v: any) => void {
        const d = this._currentDrawing as Provider;
        return (k, v) => {
            d.setSettingValue(k, v);
            this.notifySettingsChanged();
        };
    }

    /** Seviye listesini (visible/enabled farki dahil) duzenleyici bicimine cevirir. */
    private _editorLevels(): any[] {
        const d = this._currentDrawing as Provider;
        return ((d.getSettingValue('levels') || []) as any[]).map((l) => ({
            level: l.level, label: l.label, color: l.color, visible: l.visible ?? l.enabled ?? true, text: l.text,
        }));
    }

    private _storeLevels(updated: any[]): void {
        this._setter()('levels', updated.map((l: any) => ({
            level: l.level, label: l.label, color: l.color, enabled: l.visible, text: l.text,
        })));
    }

    private _renderFibStyle(container: HTMLElement): void {
        const d = this._currentDrawing as Provider | null;
        if (!d) return;
        const caps = this._caps();
        const get = (k: string) => d.getSettingValue(k);
        const set = this._setter();

        container.style.padding = '8px 20px 12px';

        // Trend cizgisi: onay + renk + cizgi (kalinlik/stil)
        if (caps.trendLine !== false || get('trendLineVisible')) {
            container.appendChild(this._row(
                this._check(!!get('trendLineVisible'), t('Trend Line'), (v) => set('trendLineVisible', v)),
                [
                    createColorSwatch(get('color') || '#808080', (c) => set('color', c)),
                    this._lineButton(Number(get('trendLineWidth') || 1), (get('trendLineStyle') || 'dashed') as LineStyle,
                        (w) => set('trendLineWidth', w), (s) => set('trendLineStyle', s)),
                ],
            ));
        }

        // Seviye cizgileri: kalinlik + stil
        container.appendChild(this._row(
            this._label(t('Levels Line')),
            [this._lineButton(Number(get('lineWidth') || 1), (get('lineStyle') || 'solid') as LineStyle,
                (w) => set('lineWidth', w), (s) => set('lineStyle', s))],
        ));

        // Seviye tablosu: 24 seviye, 2 sutun (gorunur + katsayi + renk)
        const levelsWrap = document.createElement('div');
        levelsWrap.style.cssText = 'padding: 8px 0 4px; border-top: 1px solid var(--border-color); margin-top: 6px;';
        levelsWrap.appendChild(createFibLevelsEditor(this._editorLevels(), (u) => this._storeLevels(u), { fixed: true }));
        container.appendChild(levelsWrap);

        // Uzatma: sol / sag
        container.appendChild(this._row(
            this._check(!!get('extendLeft'), t('Extend lines left'), (v) => set('extendLeft', v)), [],
        ));
        container.appendChild(this._row(
            this._check(!!get('extendRight'), t('Extend lines right'), (v) => set('extendRight', v)), [],
        ));

        // Ters cevir
        if (caps.reverse !== false) {
            container.appendChild(this._row(this._check(!!get('reversed'), t('Reverse'), (v) => set('reversed', v)), []));
        }

        // Etiketler: fiyatlar, seviyeler, yuzde
        if (caps.prices) {
            container.appendChild(this._row(this._check(!!get('showPrices'), t('Prices'), (v) => set('showPrices', v)), []));
        }
        container.appendChild(this._row(this._check(!!get('showLabels'), t('Levels'), (v) => set('showLabels', v)), []));
        container.appendChild(this._row(
            this._check(!!get('coeffsAsPercents'), t('Levels as percents'), (v) => set('coeffsAsPercents', v)), [],
        ));

        // Etiket konumu + yazi boyutu
        container.appendChild(this._row(
            this._label(t('Labels')),
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

        // Arka plan: onay + seffaflik (0-100; saklanan deger opaklik)
        container.appendChild(this._row(
            this._check(!!get('fillBackground'), t('Background'), (v) => set('fillBackground', v)),
            [createSlider(100 - Number(get('backgroundOpacity') ?? 20), 0, 100, 1, '%',
                (v) => set('backgroundOpacity', 100 - v))],
        ));

        if (caps.logScale) {
            container.appendChild(this._row(
                this._check(!!get('logScale'), t('Fib levels based on log scale'), (v) => set('logScale', v)), [],
            ));
        }
    }

    // --- Metin sekmesi: seviye basina metin ---

    private _renderFibText(container: HTMLElement): void {
        const d = this._currentDrawing as Provider | null;
        if (!d) return;
        const get = (k: string) => d.getSettingValue(k);
        const set = this._setter();
        container.style.padding = '8px 20px 12px';
        container.appendChild(this._row(this._check(!!get('showText'), t('Show text'), (v) => set('showText', v)), []));
        container.appendChild(this._row(
            this._label(t('Text alignment')),
            [
                this._select([
                    { value: 'left', label: t('Left') }, { value: 'center', label: t('Center') }, { value: 'right', label: t('Right') },
                ], get('horzTextAlign') || 'center', (v) => set('horzTextAlign', v)),
                this._select([
                    { value: 'top', label: t('Top') }, { value: 'middle', label: t('Middle') }, { value: 'bottom', label: t('Bottom') },
                ], get('vertTextAlign') || 'middle', (v) => set('vertTextAlign', v)),
            ],
        ));
        const wrap = document.createElement('div');
        wrap.style.cssText = 'padding: 8px 0 4px; border-top: 1px solid var(--border-color); margin-top: 6px;';
        wrap.appendChild(createFibLevelTextEditor(this._editorLevels(), (u) => this._storeLevels(u)));
        container.appendChild(wrap);
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
