/**
 * Indicator Settings Modal
 *
 * TradingView-style dialog. Changes apply LIVE to the indicator while the dialog is
 * open; Cancel / Esc / X restore the snapshot taken on open, Ok keeps the changes.
 * Footer "Defaults" menu: reset to defaults / save current values as the default
 * for this indicator type (localStorage, applied to newly added indicators).
 */

import { Delegate } from '../../../helpers/delegate';
import {
    IndicatorSettingsConfig,
    IndicatorSettingsProvider,
    IndicatorSettingsOpenOptions,
    IndicatorSettings,
    SettingsTab,
    SettingsSection,
    SettingsProviderLike,
    SettingsValues,
    SettingsTheme,
    TV_SIZES,
    PRECISION_OPTIONS,
    themeCssVars,
    ensureSettingsStyles,
    snapshotSettings,
    applySettings,
    withCommonSettings,
    saveDefaults,
    loadDefaults,
    resolveResetValues,
    safeLocalStorage,
} from '../base';
import { renderSection, SectionContext } from './SectionRenderer';
import { createCheckbox, createNumberInput, createSelectInput } from '../components';
import {
    INTERVAL_UNITS, IntervalUnit, IntervalsPreset, IntervalsVisibilities, UNIT_BOUNDS,
    buildIntervalsPreset, normalizeIntervalsVisibilities, isDefaultIntervalsVisibilities, parseTimeframe,
} from '../../../drawings/intervals-visibility';
import { legendTitleFromName } from '../../../indicators/legend-info';
import { t, getCurrentLanguage } from '../../../helpers/translations';

const UNIT_LABELS: Record<IntervalUnit, string> = {
    seconds: 'Seconds', minutes: 'Minutes', hours: 'Hours', days: 'Days', weeks: 'Weeks', months: 'Months',
};

const PRESETS: [IntervalsPreset, string][] = [
    ['all', 'All intervals'],
    ['current', 'Current interval only'],
    ['above', 'Current interval and above'],
    ['below', 'Current interval and below'],
];

const CLOSE_SVG = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="m4.5 4.5 9 9M13.5 4.5l-9 9"/></svg>`;
const CHEVRON_SVG = `<svg width="10" height="10" viewBox="0 0 10 10" style="margin-left:6px" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 3.5 5 6.5 8 3.5"/></svg>`;

export class IndicatorSettingsModal {
    private _element: HTMLElement | null = null;
    private _overlay: HTMLElement | null = null;
    private _bodyEl: HTMLElement | null = null;
    private _config: IndicatorSettingsConfig | null = null;
    private _rawProvider: IndicatorSettingsProvider | null = null;
    private _provider: SettingsProviderLike | null = null;
    private _opts: IndicatorSettingsOpenOptions = {};
    private _activeTabId: string = 'inputs';
    private _collectedSettings: IndicatorSettings = {};
    private _original: SettingsValues = {};
    private _keys: string[] = [];
    private _dx = 0;
    private _dy = 0;
    private _theme: SettingsTheme = 'dark';
    private _open = false;
    private _dragCleanup: (() => void) | null = null;
    private _keyHandler: ((e: KeyboardEvent) => void) | null = null;
    private _menuCleanup: (() => void) | null = null;

    private readonly _settingsChanged = new Delegate<IndicatorSettings>();
    private readonly _liveChanged = new Delegate<void>();
    private readonly _closed = new Delegate<void>();

    constructor(private _container: HTMLElement) {
        ensureSettingsStyles();
        this._createElement();
    }

    /** Fired on Ok */
    get settingsChanged(): Delegate<IndicatorSettings> { return this._settingsChanged; }
    /** Fired after every live change / revert (redraw, legend refresh) */
    get liveChanged(): Delegate<void> { return this._liveChanged; }
    /** Fired when the dialog closes (Ok or Cancel) */
    get closed(): Delegate<void> { return this._closed; }
    get isOpen(): boolean { return this._open; }

    setTheme(theme: SettingsTheme): void {
        this._theme = theme === 'light' ? 'light' : 'dark';
        this._applyTheme();
    }

    private _applyTheme(): void {
        if (!this._overlay || !this._element) return;
        for (const [k, v] of Object.entries(themeCssVars(this._theme))) this._element.style.setProperty(k, v);
        this._element.style.background = 'var(--tvs-bg)';
        this._element.style.borderColor = 'var(--tvs-border)';
        this._element.style.boxShadow = 'var(--shadow)';
        this._overlay.style.background = this._theme === 'light' ? 'rgba(19, 23, 34, 0.25)' : 'rgba(0, 0, 0, 0.4)';
    }

    /**
     * Show the dialog for an indicator (settings provider)
     */
    showForIndicator(provider: IndicatorSettingsProvider, opts: IndicatorSettingsOpenOptions = {}): void {
        this._rawProvider = provider;
        this._provider = withCommonSettings(provider);
        this._opts = opts;
        this._config = provider.getSettingsConfig();

        // Keys of every setting in the schema, plus the common ones
        const keys = new Set<string>();
        this._config.tabs.forEach(tab => tab.sections.forEach(section => section.rows.forEach(row => {
            const key = (row as any).key;
            if (key && key !== 'visible') keys.add(key);
        })));
        keys.add('intervalsVisibilities');
        if (provider.supportsPrecision?.()) keys.add('precision');
        this._keys = [...keys];

        this._original = snapshotSettings(this._provider, this._keys);
        this._collectedSettings = {};
        this._keys.forEach(k => { this._collectedSettings[k] = this._provider!.getSettingValue(k); });

        const tabs = this._visibleTabs();
        this._activeTabId = tabs[0]?.id || 'inputs';
        this._dx = 0;
        this._dy = 0;

        this._applyTheme();
        this._renderContent();
        // CSS uppercase follows the language: Turkish "dilimlerinde" -> "DİLİMLERİNDE"
        if (this._overlay) this._overlay.lang = getCurrentLanguage();
        if (this._overlay) this._overlay.style.display = 'flex';
        if (this._element) this._element.style.transform = '';
        this._open = true;
        this._installKeyHandler();
    }

    /** Cancel semantics: restore the snapshot taken on open, then close */
    cancel(): void {
        if (!this._open) return;
        if (this._provider) this._applyValues(this._original, true);
        this._close();
    }

    /** Ok semantics: keep the live changes */
    ok(): void {
        if (!this._open) return;
        this._settingsChanged.fire(this._collectedSettings);
        this._close();
    }

    /** Escape hatch for owners (e.g. indicator removed while the dialog is open) */
    hide(): void {
        if (this._open) this._close();
    }

    private _close(): void {
        this._open = false;
        this._removeKeyHandler();
        this._menuCleanup?.();
        if (this._overlay) this._overlay.style.display = 'none';
        this._closed.fire();
    }

    // --- live apply ---

    private _set(key: string, value: any): void {
        if (!this._provider) return;
        this._collectedSettings[key] = value;
        this._applyValues({ [key]: value }, false);
    }

    /** Write values to the indicator, recalculating when a change asked for it */
    private _applyValues(values: SettingsValues, replaceCollected: boolean): void {
        const provider = this._provider!;
        const raw = this._rawProvider!;
        const before = raw.data;
        let recalc = false;
        try {
            recalc = applySettings(provider, values);
        } catch (err) {
            console.warn('Indicator setting failed:', err);
        }
        // setSettingValue(...) returns true when e.g. a period changed; most indicators
        // do not recompute on their own, so do it here unless data was already rebuilt.
        if (recalc && raw.data === before) {
            try { raw.recalculate?.(); } catch (err) { console.warn('Indicator recalculation failed:', err); }
        }
        if (replaceCollected) {
            this._keys.forEach(k => { this._collectedSettings[k] = provider.getSettingValue(k); });
        }
        this._liveChanged.fire();
    }

    // --- DOM ---

    private _createElement(): void {
        this._overlay = document.createElement('div');
        this._overlay.className = 'tvs-root';
        this._overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            display: none; align-items: center; justify-content: center;
            z-index: ${TV_SIZES.zIndex};
        `;

        this._element = document.createElement('div');
        this._element.className = 'tvs-dialog';
        this._element.style.cssText = `
            border: 1px solid; border-radius: ${TV_SIZES.radius}px;
            width: ${TV_SIZES.dialogWidth}px; max-width: ${TV_SIZES.dialogMaxWidthVw}vw; max-height: ${TV_SIZES.dialogMaxHeightVh}vh;
            display: flex; flex-direction: column;
        `;

        this._overlay.appendChild(this._element);
        this._container.appendChild(this._overlay);
        this._applyTheme();

        // Keep clicks/keys inside the dialog from reaching the chart
        this._element.addEventListener('mousedown', (e) => e.stopPropagation());
        this._element.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    }

    // Bubble phase on purpose: an open colour / line popover handles Esc in the capture
    // phase and stops it, so the first Esc only closes the popover.
    private _installKeyHandler(): void {
        this._removeKeyHandler();
        this._keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && this._open) {
                e.stopPropagation();
                e.preventDefault();
                // An open "Defaults" menu closes first, like the other popovers
                if (this._menuCleanup) { this._menuCleanup(); return; }
                this.cancel();
            }
        };
        document.addEventListener('keydown', this._keyHandler);
    }

    private _removeKeyHandler(): void {
        if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
        this._keyHandler = null;
    }

    private _visibleTabs(): SettingsTab[] {
        if (!this._config) return [];
        const hasRows = (sections: SettingsSection[]) => sections.some(s => s.rows.length > 0);
        const tabs: SettingsTab[] = [];
        const inputs = this._config.tabs.find(x => x.id === 'inputs');
        if (inputs && hasRows(inputs.sections)) tabs.push(inputs);
        const style = this._config.tabs.find(x => x.id === 'style');
        const precision = !!this._rawProvider?.supportsPrecision?.();
        if ((style && hasRows(style.sections)) || precision) tabs.push(style ?? { id: 'style', label: 'Style', sections: [] });
        // Any extra schema tabs (other ids) keep their place; the legacy 'visibility' tab is replaced
        this._config.tabs.forEach(x => {
            if (!['inputs', 'style', 'visibility'].includes(x.id) && hasRows(x.sections)) tabs.push(x);
        });
        if (this._rawProvider?.setCommonSetting) {
            tabs.push({ id: 'visibility', label: 'Visibility', sections: [] });
        }
        return tabs;
    }

    private _renderContent(): void {
        if (!this._element || !this._config) return;
        const scroll = this._bodyEl?.scrollTop ?? 0;
        this._element.innerHTML = '';

        this._element.appendChild(this._createHeader());
        this._element.appendChild(this._createTabNav());
        this._bodyEl = this._createContent();
        this._element.appendChild(this._bodyEl);
        this._element.appendChild(this._createFooter());
        this._bodyEl.scrollTop = scroll;
    }

    private _title(): string {
        const info = this._rawProvider?.getLegendInfo?.();
        return info?.title || legendTitleFromName(this._config?.name || '') || t('Settings');
    }

    private _createHeader(): HTMLElement {
        const header = document.createElement('div');
        header.className = 'tvs-header';
        header.style.cssText = `padding: ${TV_SIZES.headerPad}; padding-bottom: 12px; display: flex; align-items: center; justify-content: space-between; cursor: move; user-select: none;`;

        const title = document.createElement('div');
        title.className = 'tvs-title';
        title.textContent = this._title();
        title.style.cssText = `font-size: ${TV_SIZES.titleFontSize}px; font-weight: 600; color: var(--tvs-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`;
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'tvs-btn-icon tvs-close';
        closeBtn.title = t('Close');
        closeBtn.innerHTML = CLOSE_SVG;
        closeBtn.addEventListener('click', () => this.cancel());
        header.appendChild(closeBtn);

        this._setupDragging(header);
        return header;
    }

    private _createTabNav(): HTMLElement {
        const tabNav = document.createElement('div');
        tabNav.className = 'tvs-tabs';
        tabNav.style.cssText = `display: flex; padding: 0 20px; border-bottom: 1px solid var(--tvs-border); flex: 0 0 auto;`;

        this._visibleTabs().forEach(tab => {
            const tabBtn = document.createElement('button');
            tabBtn.type = 'button';
            tabBtn.dataset.tab = tab.id;
            tabBtn.className = 'tvs-tab' + (tab.id === this._activeTabId ? ' tvs-active' : '');
            tabBtn.textContent = t(tab.label);
            tabBtn.addEventListener('click', () => {
                this._activeTabId = tab.id;
                if (this._bodyEl) this._bodyEl.scrollTop = 0;
                this._renderContent();
            });
            tabNav.appendChild(tabBtn);
        });
        return tabNav;
    }

    private _createContent(): HTMLElement {
        const content = document.createElement('div');
        content.className = 'tvs-body';
        content.style.cssText = `padding: ${TV_SIZES.bodyPad}; overflow-y: auto; overflow-x: hidden; flex: 1 1 auto; min-height: 120px;`;

        const tabs = this._visibleTabs();
        const activeTab = tabs.find(x => x.id === this._activeTabId) || tabs[0];
        if (!activeTab) return content;

        if (activeTab.id === 'visibility') {
            this._renderVisibility(content);
            return content;
        }

        const context: SectionContext = {
            getValue: (key) => this._collectedSettings[key],
            setValue: (key, value) => this._set(key, value),
            rerender: () => this._renderContent(),
            host: this._element,
            mode: activeTab.id === 'style' ? 'style' : 'inputs',
        };

        activeTab.sections.forEach(section => {
            content.appendChild(renderSection(section, context));
        });

        if (activeTab.id === 'style' && this._rawProvider?.supportsPrecision?.()) {
            const row = document.createElement('div');
            row.className = 'tvs-row';
            const label = document.createElement('label');
            label.className = 'tvs-label';
            label.textContent = t('Precision');
            row.appendChild(label);
            const cur = this._collectedSettings['precision'];
            row.appendChild(createSelectInput(
                typeof cur === 'number' ? String(cur) : '',
                PRECISION_OPTIONS,
                (v) => this._set('precision', v === '' ? undefined : Number(v))
            ));
            content.appendChild(row);
        }

        return content;
    }

    /** Visibility tab: show the indicator only on chosen intervals (same model as drawings) */
    private _renderVisibility(content: HTMLElement): void {
        const tfGetter = this._opts.getTimeframe;
        let iv: IntervalsVisibilities = normalizeIntervalsVisibilities(this._collectedSettings['intervalsVisibilities']);
        const commit = () => {
            this._set('intervalsVisibilities', isDefaultIntervalsVisibilities(iv) ? undefined : { ...iv });
        };

        const group = document.createElement('div');
        group.className = 'tvs-group';
        group.textContent = t('Visibility on intervals');
        content.appendChild(group);

        const parsed = parseTimeframe(tfGetter ? tfGetter() : '');
        if (parsed) {
            const row = document.createElement('div');
            row.className = 'tvs-row';
            const label = document.createElement('label');
            label.className = 'tvs-label';
            label.textContent = t('Presets');
            row.appendChild(label);
            row.appendChild(createSelectInput('', [{ value: '', label: '—' }, ...PRESETS.map(([value, label]) => ({ value, label }))], (v) => {
                if (!v) return;
                iv = normalizeIntervalsVisibilities(buildIntervalsPreset(v as IntervalsPreset, parsed));
                commit();
                this._renderContent();
            }));
            content.appendChild(row);
        }

        for (const u of INTERVAL_UNITS) {
            const { min, max } = UNIT_BOUNDS[u];
            const fromKey = `${u}From` as const;
            const toKey = `${u}To` as const;
            const row = document.createElement('div');
            row.className = 'tvs-iv-row';
            row.dataset.unit = u;
            row.appendChild(createCheckbox(t(UNIT_LABELS[u]), iv[u], (c) => { iv[u] = c; commit(); }));

            const mk = (key: typeof fromKey | typeof toKey) => createNumberInput(iv[key], { min, max, step: 1 }, (v) => {
                iv[key] = Math.round(v);
                if (iv[fromKey] > iv[toKey]) {
                    if (key === fromKey) iv[toKey] = iv[fromKey]; else iv[fromKey] = iv[toKey];
                }
                commit();
                this._renderContent();
            });
            row.appendChild(mk(fromKey));
            const sep = document.createElement('span');
            sep.className = 'tvs-iv-sep';
            sep.textContent = '—';
            row.appendChild(sep);
            row.appendChild(mk(toKey));
            content.appendChild(row);
        }
    }

    private _createFooter(): HTMLElement {
        const footer = document.createElement('div');
        footer.className = 'tvs-footer';
        footer.style.cssText = `padding: ${TV_SIZES.footerPad}; border-top: 1px solid var(--tvs-border); display: flex; align-items: center; justify-content: space-between; gap: 10px; flex: 0 0 auto;`;

        // Defaults dropdown (left)
        const left = document.createElement('div');
        left.style.cssText = 'position: relative;';
        const defBtn = document.createElement('button');
        defBtn.type = 'button';
        defBtn.className = 'tvs-footbtn tvs-defaults';
        defBtn.innerHTML = `<span>${t('Defaults')}</span>${CHEVRON_SVG}`;
        left.appendChild(defBtn);

        defBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const existing = left.querySelector('.tvs-menu');
            if (existing) { this._menuCleanup?.(); return; }
            const menu = document.createElement('div');
            menu.className = 'tvs-menu';
            const reset = document.createElement('button');
            reset.type = 'button';
            reset.dataset.action = 'reset';
            reset.textContent = t('Reset settings');
            reset.addEventListener('click', () => { this._menuCleanup?.(); this.resetToDefaults(); });
            const save = document.createElement('button');
            save.type = 'button';
            save.dataset.action = 'save';
            save.textContent = t('Save as default');
            save.addEventListener('click', () => { this._menuCleanup?.(); this.saveAsDefault(); });
            menu.appendChild(reset);
            menu.appendChild(save);
            left.appendChild(menu);
            const off = (ev: MouseEvent) => { if (!menu.contains(ev.target as Node)) this._menuCleanup?.(); };
            document.addEventListener('mousedown', off, true);
            this._menuCleanup = () => {
                document.removeEventListener('mousedown', off, true);
                menu.remove();
                this._menuCleanup = null;
            };
        });
        footer.appendChild(left);

        const right = document.createElement('div');
        right.style.cssText = 'display: flex; gap: 8px;';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'tvs-footbtn tvs-cancel';
        cancelBtn.textContent = t('Cancel');
        cancelBtn.addEventListener('click', () => this.cancel());
        right.appendChild(cancelBtn);

        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = 'tvs-footbtn tvs-primary tvs-ok';
        okBtn.textContent = t('Ok');
        okBtn.addEventListener('click', () => this.ok());
        right.appendChild(okBtn);
        footer.appendChild(right);

        return footer;
    }

    // --- Defaults ---

    /** Persist the current values as the default for this indicator type */
    saveAsDefault(): boolean {
        if (!this._opts.typeId) return false;
        return saveDefaults(safeLocalStorage(), this._opts.typeId, this._collectedSettings);
    }

    /** Reset to the saved default of this type, or the built-in values when none saved */
    resetToDefaults(): void {
        if (!this._provider || !this._rawProvider) return;
        const factory = this._factoryValues();
        const saved = this._opts.typeId ? loadDefaults(safeLocalStorage(), this._opts.typeId) : null;
        const values = resolveResetValues(factory, saved);
        // Common settings go back to "unset" (default precision, all intervals) unless saved
        if (!('precision' in values)) values['precision'] = undefined as any;
        values['intervalsVisibilities'] = undefined as any;
        this._applyValues(values, true);
        this._renderContent();
    }

    /** Values of a freshly constructed indicator of the same class (built-in defaults) */
    private _factoryValues(): SettingsValues {
        const out: SettingsValues = {};
        const raw = this._rawProvider as any;
        try {
            const fresh = new raw.constructor();
            const view = withCommonSettings(fresh);
            this._keys.forEach(k => {
                const v = view.getSettingValue(k);
                if (v !== undefined) out[k] = v;
            });
            fresh.destroy?.();
        } catch {
            // Constructor needs arguments: fall back to the values the dialog opened with
            Object.entries(this._original).forEach(([k, v]) => { if (v !== undefined) out[k] = v; });
        }
        return out;
    }

    dispose(): void {
        this._dragCleanup?.();
        this._removeKeyHandler();
        this._menuCleanup?.();
        this._settingsChanged.destroy();
        this._liveChanged.destroy();
        this._closed.destroy();
        if (this._overlay?.parentNode) this._overlay.parentNode.removeChild(this._overlay);
        this._overlay = null;
        this._element = null;
    }

    // --- Dragging (header) ---

    private _setupDragging(handle: HTMLElement): void {
        this._dragCleanup?.();

        let startX = 0;
        let startY = 0;
        let originDx = 0;
        let originDy = 0;
        let baseLeft = 0;
        let baseTop = 0;
        let dragging = false;

        const onMouseMove = (e: MouseEvent) => {
            if (!dragging || !this._element) return;
            const w = this._element.offsetWidth;
            const h = this._element.offsetHeight;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let dx = originDx + (e.clientX - startX);
            let dy = originDy + (e.clientY - startY);
            dx = Math.max(-baseLeft, Math.min(dx, vw - w - baseLeft));
            dy = Math.max(-baseTop, Math.min(dy, vh - h - baseTop));
            this._dx = dx;
            this._dy = dy;
            this._element.style.transform = `translate(${dx}px, ${dy}px)`;
        };

        const onMouseUp = () => {
            dragging = false;
            document.body.style.userSelect = '';
        };

        const onMouseDown = (e: MouseEvent) => {
            if ((e.target as HTMLElement).closest('button') || !this._element) return;
            const rect = this._element.getBoundingClientRect();
            originDx = this._dx;
            originDy = this._dy;
            baseLeft = rect.left - this._dx;
            baseTop = rect.top - this._dy;
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            document.body.style.userSelect = 'none';
            e.preventDefault();
        };

        handle.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        this._dragCleanup = () => {
            handle.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }
}
