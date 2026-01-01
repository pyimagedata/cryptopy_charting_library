/**
 * Indicator Settings Modal
 * 
 * Config-driven TradingView-style modal using modular components.
 */

import { Delegate } from '../../../helpers/delegate';
import {
    IndicatorSettingsConfig,
    IndicatorSettingsProvider,
    IndicatorSettings
} from '../base';
import { renderSection, SectionContext } from '../sections';

export class IndicatorSettingsModal {
    private _element: HTMLElement | null = null;
    private _overlay: HTMLElement | null = null;
    private _config: IndicatorSettingsConfig | null = null;
    private _provider: IndicatorSettingsProvider | null = null;
    private _activeTabId: string = 'inputs';
    private _collectedSettings: IndicatorSettings = {};

    private readonly _settingsChanged = new Delegate<IndicatorSettings>();
    private readonly _closed = new Delegate<void>();

    constructor(private _container: HTMLElement) {
        this._createElement();
    }

    get settingsChanged(): Delegate<IndicatorSettings> { return this._settingsChanged; }
    get closed(): Delegate<void> { return this._closed; }

    /**
     * Show modal for an indicator with settings provider
     */
    showForIndicator(provider: IndicatorSettingsProvider): void {
        this._provider = provider;
        this._config = provider.getSettingsConfig();
        this._activeTabId = this._config.tabs[0]?.id || 'inputs';

        // Collect current values from provider
        this._collectedSettings = {};
        this._config.tabs.forEach(tab => {
            tab.sections.forEach(section => {
                section.rows.forEach(row => {
                    if (row.key) {
                        this._collectedSettings[row.key] = provider.getSettingValue(row.key);
                    }
                });
            });
        });

        this._renderContent();
        if (this._overlay) this._overlay.style.display = 'flex';
    }

    hide(): void {
        if (this._overlay) {
            this._overlay.style.display = 'none';
            this._closed.fire();
        }
    }

    private _createElement(): void {
        this._overlay = document.createElement('div');
        this._overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.4);
            display: none; align-items: center; justify-content: center;
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        this._element = document.createElement('div');
        this._element.style.cssText = `
            background: white; border-radius: 8px;
            width: 420px; max-width: 95vw; max-height: 85vh;
            display: flex; flex-direction: column;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        `;

        this._overlay.appendChild(this._element);
        this._container.appendChild(this._overlay);

        this._overlay.addEventListener('click', (e) => {
            if (e.target === this._overlay) this.hide();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._overlay?.style.display === 'flex') this.hide();
        });
    }

    private _renderContent(): void {
        if (!this._element || !this._config) return;
        this._element.innerHTML = '';

        this._element.appendChild(this._createHeader());
        this._element.appendChild(this._createTabNav());
        this._element.appendChild(this._createContent());
        this._element.appendChild(this._createFooter());
    }

    private _createHeader(): HTMLElement {
        const header = document.createElement('div');
        header.style.cssText = `padding: 20px 24px 0; display: flex; align-items: center; justify-content: space-between;`;

        const title = document.createElement('div');
        title.textContent = this._config?.name || 'Settings';
        title.style.cssText = `font-size: 20px; font-weight: 600; color: #131722;`;
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#131722" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        closeBtn.style.cssText = `background: none; border: none; cursor: pointer; padding: 4px; display: flex; border-radius: 4px;`;
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);

        return header;
    }

    private _createTabNav(): HTMLElement {
        const tabNav = document.createElement('div');
        tabNav.style.cssText = `display: flex; padding: 16px 24px 0; border-bottom: 1px solid #e0e3eb;`;

        this._config?.tabs.forEach(tab => {
            const tabBtn = document.createElement('button');
            tabBtn.textContent = tab.label;
            const isActive = tab.id === this._activeTabId;
            tabBtn.style.cssText = `
                background: none; border: none; padding: 12px 0; margin-right: 24px;
                font-size: 14px; font-weight: 500; cursor: pointer; position: relative;
                color: ${isActive ? '#131722' : '#787b86'};
            `;

            if (isActive) {
                const underline = document.createElement('div');
                underline.style.cssText = `position: absolute; bottom: -1px; left: 0; right: 0; height: 2px; background: #131722;`;
                tabBtn.appendChild(underline);
            }

            tabBtn.addEventListener('click', () => {
                this._activeTabId = tab.id;
                this._renderContent();
            });

            tabNav.appendChild(tabBtn);
        });

        return tabNav;
    }

    private _createContent(): HTMLElement {
        const content = document.createElement('div');
        content.style.cssText = `padding: 20px 24px; overflow-y: auto; flex: 1; max-height: 400px;`;

        const activeTab = this._config?.tabs.find(t => t.id === this._activeTabId);
        if (!activeTab) return content;

        const context: SectionContext = {
            getValue: (key) => this._collectedSettings[key],
            setValue: (key, value) => { this._collectedSettings[key] = value; },
            rerender: () => this._renderContent()
        };

        activeTab.sections.forEach(section => {
            content.appendChild(renderSection(section, context));
        });

        return content;
    }

    private _createFooter(): HTMLElement {
        const footer = document.createElement('div');
        footer.style.cssText = `padding: 16px 24px; border-top: 1px solid #e0e3eb; display: flex; justify-content: flex-end; gap: 10px;`;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `background: white; border: 1px solid #e0e3eb; border-radius: 6px; padding: 10px 20px; color: #131722; font-size: 14px; font-weight: 500; cursor: pointer;`;
        cancelBtn.addEventListener('click', () => this.hide());
        footer.appendChild(cancelBtn);

        const okBtn = document.createElement('button');
        okBtn.textContent = 'Ok';
        okBtn.style.cssText = `background: #131722; border: none; border-radius: 6px; padding: 10px 24px; color: white; font-size: 14px; font-weight: 500; cursor: pointer;`;
        okBtn.addEventListener('click', () => {
            if (this._provider) {
                Object.entries(this._collectedSettings).forEach(([key, value]) => {
                    this._provider!.setSettingValue(key, value);
                });
            }
            this._settingsChanged.fire(this._collectedSettings);
            this.hide();
        });
        footer.appendChild(okBtn);

        return footer;
    }

    dispose(): void {
        this._settingsChanged.destroy();
        this._closed.destroy();
        if (this._overlay?.parentNode) this._overlay.parentNode.removeChild(this._overlay);
        this._overlay = null;
        this._element = null;
    }
}
