import { CandlestickSeriesOptions } from '../model/candlestick-series';
import { HeikenAshiSeriesOptions } from '../series/heiken-ashi-series';
import { ThemeType } from '../helpers/themes';

export interface CandlestickAppearanceSettings extends Pick<
    CandlestickSeriesOptions,
    'upColor' | 'downColor' | 'wickUpColor' | 'wickDownColor' | 'borderUpColor' | 'borderDownColor' | 'wickVisible' | 'borderVisible'
> {}

export interface HeikenAshiAppearanceSettings extends Pick<
    HeikenAshiSeriesOptions,
    'upColor' | 'downColor' | 'wickVisible' | 'borderVisible'
> {}

type SettingsTabId = 'symbol' | 'status-line' | 'scales' | 'canvas' | 'trading' | 'alerts' | 'events';

type CandlestickApply = (next: CandlestickAppearanceSettings) => void;
type HeikenApply = (next: HeikenAshiAppearanceSettings) => void;

interface SidebarTab {
    id: SettingsTabId;
    label: string;
    icon: string;
}

const SIDEBAR_TABS: SidebarTab[] = [
    { id: 'symbol', label: 'Sembol', icon: '◫' },
    { id: 'status-line', label: 'Durum satırı', icon: '≣' },
    { id: 'scales', label: 'Ölçekler ve çizgiler', icon: '↕' },
    { id: 'canvas', label: 'Tuval', icon: '✎' },
    { id: 'trading', label: 'İşlem', icon: '≈' },
    { id: 'alerts', label: 'Uyarılar', icon: '◷' },
    { id: 'events', label: 'Etkinlikler', icon: '◫' },
];

export class ChartSettingsModal {
    private readonly _overlay: HTMLDivElement;
    private readonly _panel: HTMLDivElement;
    private readonly _sidebar: HTMLDivElement;
    private readonly _content: HTMLDivElement;
    private readonly _footer: HTMLDivElement;
    private readonly _title: HTMLDivElement;
    private readonly _tabButtons = new Map<SettingsTabId, HTMLButtonElement>();
    private readonly _templateSelect: HTMLSelectElement;
    private readonly _cancelButton: HTMLButtonElement;
    private readonly _okButton: HTMLButtonElement;
    private _theme: ThemeType = 'dark';
    private _activeTab: SettingsTabId = 'symbol';
    private _renderContent: (() => void) | null = null;
    private _pendingApply: (() => void) | null = null;

    constructor(container: HTMLElement) {
        this._overlay = document.createElement('div');
        this._overlay.style.cssText = `
            position: absolute;
            inset: 0;
            z-index: 120;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(15, 23, 42, 0.22);
            backdrop-filter: blur(8px);
        `;

        this._panel = document.createElement('div');
        this._panel.style.cssText = `
            width: min(900px, calc(100% - 32px));
            min-height: min(640px, calc(100% - 32px));
            display: grid;
            grid-template-columns: 236px 1fr;
            grid-template-rows: 88px 1fr 64px;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 22px 60px rgba(15, 23, 42, 0.22);
            border: 1px solid rgba(15, 23, 42, 0.08);
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            grid-column: 1 / -1;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 28px;
            border-bottom: 1px solid rgba(15, 23, 42, 0.08);
        `;

        this._title = document.createElement('div');
        this._title.textContent = 'Ayarlar';
        this._title.style.cssText = `
            font-size: 22px;
            font-weight: 650;
            line-height: 1.1;
            letter-spacing: -0.02em;
        `;

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = '×';
        closeButton.style.cssText = `
            width: 38px;
            height: 38px;
            border: none;
            border-radius: 10px;
            background: transparent;
            color: inherit;
            font-size: 28px;
            line-height: 1;
            cursor: pointer;
        `;
        closeButton.addEventListener('click', () => this.hide());

        header.appendChild(this._title);
        header.appendChild(closeButton);

        this._sidebar = document.createElement('div');
        this._sidebar.style.cssText = `
            border-right: 1px solid rgba(15, 23, 42, 0.08);
            padding: 10px 0;
            display: flex;
            flex-direction: column;
            gap: 2px;
        `;

        for (const tab of SIDEBAR_TABS) {
            const button = document.createElement('button');
            button.type = 'button';
            button.style.cssText = `
                display: flex;
                align-items: center;
                gap: 14px;
                height: 54px;
                padding: 0 20px;
                border: none;
                background: transparent;
                color: inherit;
                text-align: left;
                border-radius: 0;
                cursor: pointer;
            `;

            const icon = document.createElement('span');
            icon.textContent = tab.icon;
            icon.style.cssText = `
                width: 20px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 17px;
                opacity: 0.9;
            `;

            const label = document.createElement('span');
            label.textContent = tab.label;
            label.style.cssText = `
                font-size: 15px;
                font-weight: 500;
                line-height: 1.2;
            `;

            button.appendChild(icon);
            button.appendChild(label);
            button.addEventListener('click', () => {
                this._activeTab = tab.id;
                this._updateSidebarState();
                this._renderContent?.();
            });

            this._sidebar.appendChild(button);
            this._tabButtons.set(tab.id, button);
        }

        this._content = document.createElement('div');
        this._content.style.cssText = `
            padding: 28px 32px;
            overflow: auto;
        `;

        this._footer = document.createElement('div');
        this._footer.style.cssText = `
            grid-column: 1 / -1;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 0 24px;
            border-top: 1px solid rgba(15, 23, 42, 0.08);
        `;

        this._templateSelect = document.createElement('select');
        this._templateSelect.style.cssText = this._selectStyle();
        this._templateSelect.innerHTML = `
            <option>Şablon</option>
        `;

        const footerActions = document.createElement('div');
        footerActions.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
        `;

        this._cancelButton = document.createElement('button');
        this._cancelButton.type = 'button';
        this._cancelButton.textContent = 'İptal';
        this._cancelButton.style.cssText = this._actionButtonStyle(false);
        this._cancelButton.addEventListener('click', () => this.hide());

        this._okButton = document.createElement('button');
        this._okButton.type = 'button';
        this._okButton.textContent = 'Tamam';
        this._okButton.style.cssText = this._actionButtonStyle(true);
        this._okButton.addEventListener('click', () => {
            this._pendingApply?.();
            this.hide();
        });

        footerActions.appendChild(this._cancelButton);
        footerActions.appendChild(this._okButton);
        this._footer.appendChild(this._templateSelect);
        this._footer.appendChild(footerActions);

        this._panel.appendChild(header);
        this._panel.appendChild(this._sidebar);
        this._panel.appendChild(this._content);
        this._panel.appendChild(this._footer);
        this._overlay.appendChild(this._panel);
        container.appendChild(this._overlay);

        this._overlay.addEventListener('click', (event) => {
            if (event.target === this._overlay) {
                this.hide();
            }
        });

        this.setTheme('dark');
        this._updateSidebarState();
    }

    setTheme(theme: ThemeType): void {
        this._theme = theme;
        const isDark = theme === 'dark';

        this._panel.style.background = isDark ? '#111827' : '#ffffff';
        this._panel.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)';
        this._panel.style.color = isDark ? '#f3f4f6' : '#111827';
        this._sidebar.style.borderRightColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)';
        this._footer.style.borderTopColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)';
        (this._panel.firstElementChild as HTMLElement).style.borderBottomColor = isDark
            ? 'rgba(255, 255, 255, 0.08)'
            : 'rgba(15, 23, 42, 0.08)';
        this._templateSelect.style.cssText = this._selectStyle();
        this._cancelButton.style.cssText = this._actionButtonStyle(false);
        this._okButton.style.cssText = this._actionButtonStyle(true);
        this._updateSidebarState();
    }

    showCandlestick(
        settings: CandlestickAppearanceSettings,
        onApply: CandlestickApply
    ): void {
        const draft: CandlestickAppearanceSettings = { ...settings };
        this._activeTab = 'symbol';
        this._pendingApply = () => onApply({ ...draft });
        this._renderContent = () => {
            if (this._activeTab !== 'symbol') {
                this._renderPlaceholder();
                return;
            }

            this._content.innerHTML = '';
            this._content.appendChild(this._createSectionTitle('MUMLAR'));
            this._content.appendChild(this._createBodyRow('Gövde', true, draft.upColor, draft.downColor, (up, down) => {
                draft.upColor = up;
                draft.downColor = down;
            }));
            this._content.appendChild(this._createBodyRow('Kenarlık', draft.borderVisible, draft.borderUpColor, draft.borderDownColor, (up, down) => {
                draft.borderUpColor = up;
                draft.borderDownColor = down;
            }, (visible) => {
                draft.borderVisible = visible;
            }));
            this._content.appendChild(this._createBodyRow('Fitil', draft.wickVisible, draft.wickUpColor, draft.wickDownColor, (up, down) => {
                draft.wickUpColor = up;
                draft.wickDownColor = down;
            }, (visible) => {
                draft.wickVisible = visible;
            }));
            this._content.appendChild(this._createSectionTitle('VERİ'));
            this._content.appendChild(this._createSelectRow('Hassasiyet', ['Varsayılan'], 'Varsayılan'));
            this._content.appendChild(this._createSelectRow('Saat dilimi', ['(UTC+3) İstanbul'], '(UTC+3) İstanbul'));
        };

        this._updateSidebarState();
        this._renderContent();
        this.show();
    }

    showHeikenAshi(
        settings: HeikenAshiAppearanceSettings,
        onApply: HeikenApply
    ): void {
        const draft: HeikenAshiAppearanceSettings = { ...settings };
        this._activeTab = 'symbol';
        this._pendingApply = () => onApply({ ...draft });
        this._renderContent = () => {
            if (this._activeTab !== 'symbol') {
                this._renderPlaceholder();
                return;
            }

            this._content.innerHTML = '';
            this._content.appendChild(this._createSectionTitle('HEIKEN ASHI'));
            this._content.appendChild(this._createBodyRow('Gövde', true, draft.upColor, draft.downColor, (up, down) => {
                draft.upColor = up;
                draft.downColor = down;
            }));
            this._content.appendChild(this._createBodyRow('Kenarlık', draft.borderVisible, draft.upColor, draft.downColor, (up, down) => {
                draft.upColor = up;
                draft.downColor = down;
            }, (visible) => {
                draft.borderVisible = visible;
            }));
            this._content.appendChild(this._createBodyRow('Fitil', draft.wickVisible, draft.upColor, draft.downColor, (up, down) => {
                draft.upColor = up;
                draft.downColor = down;
            }, (visible) => {
                draft.wickVisible = visible;
            }));
            this._content.appendChild(this._createSectionTitle('VERİ'));
            this._content.appendChild(this._createSelectRow('Hassasiyet', ['Varsayılan'], 'Varsayılan'));
            this._content.appendChild(this._createSelectRow('Saat dilimi', ['(UTC+3) İstanbul'], '(UTC+3) İstanbul'));
        };

        this._updateSidebarState();
        this._renderContent();
        this.show();
    }

    showUnsupported(message: string): void {
        this._activeTab = 'symbol';
        this._pendingApply = null;
        this._renderContent = () => {
            this._content.innerHTML = '';
            const empty = document.createElement('div');
            empty.textContent = message;
            empty.style.cssText = `
                font-size: 15px;
                line-height: 1.6;
                opacity: 0.78;
                max-width: 480px;
            `;
            this._content.appendChild(empty);
        };
        this._updateSidebarState();
        this._renderContent();
        this.show();
    }

    show(): void {
        this._overlay.style.display = 'flex';
    }

    hide(): void {
        this._overlay.style.display = 'none';
    }

    dispose(): void {
        this._overlay.remove();
    }

    private _renderPlaceholder(): void {
        this._content.innerHTML = '';
        const title = document.createElement('div');
        title.textContent = this._activeTab === 'symbol' ? 'SEMBOL' : 'YAKINDA';
        title.style.cssText = `
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.06em;
            opacity: 0.44;
            margin-bottom: 18px;
        `;

        const text = document.createElement('div');
        text.textContent = 'Bu bolum henuz bagli degil. Ilk asamada mum gorunumu ayarlari aktif.';
        text.style.cssText = `
            font-size: 15px;
            line-height: 1.7;
            max-width: 480px;
            opacity: 0.82;
        `;

        this._content.appendChild(title);
        this._content.appendChild(text);
    }

    private _updateSidebarState(): void {
        const isDark = this._theme === 'dark';
        for (const [id, button] of this._tabButtons.entries()) {
            const active = id === this._activeTab;
            button.style.background = active
                ? (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.05)')
                : 'transparent';
            button.style.color = isDark ? '#f3f4f6' : '#111827';
        }
    }

    private _createSectionTitle(text: string): HTMLElement {
        const title = document.createElement('div');
        title.textContent = text;
        title.style.cssText = `
            margin-bottom: 14px;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.06em;
            opacity: 0.44;
        `;
        return title;
    }

    private _createBodyRow(
        labelText: string,
        checked: boolean,
        upColor: string,
        downColor: string,
        onColorChange: (up: string, down: string) => void,
        onVisibilityChange?: (visible: boolean) => void
    ): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = `
            display: grid;
            grid-template-columns: 150px 56px 56px;
            align-items: center;
            gap: 10px;
            margin-bottom: 14px;
        `;

        const left = document.createElement('div');
        left.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
        `;

        const checkbox = document.createElement('button');
        checkbox.type = 'button';
        checkbox.style.cssText = `
            width: 26px;
            height: 26px;
            border-radius: 7px;
            border: 1px solid rgba(15, 23, 42, 0.14);
            background: ${checked ? '#3b3f46' : 'transparent'};
            color: ${checked ? '#ffffff' : 'transparent'};
            font-size: 16px;
            line-height: 1;
            cursor: ${onVisibilityChange ? 'pointer' : 'default'};
        `;
        checkbox.textContent = '✓';
        if (onVisibilityChange) {
            checkbox.addEventListener('click', () => {
                checked = !checked;
                checkbox.style.background = checked ? '#3b3f46' : 'transparent';
                checkbox.style.color = checked ? '#ffffff' : 'transparent';
                onVisibilityChange(checked);
            });
        }

        const label = document.createElement('div');
        label.textContent = labelText;
        label.style.cssText = `
            font-size: 16px;
            line-height: 1.2;
        `;

        left.appendChild(checkbox);
        left.appendChild(label);
        row.appendChild(left);
        row.appendChild(this._createColorChip(upColor, (next) => {
            upColor = next;
            onColorChange(upColor, downColor);
        }));
        row.appendChild(this._createColorChip(downColor, (next) => {
            downColor = next;
            onColorChange(upColor, downColor);
        }));
        return row;
    }

    private _createColorChip(value: string, onChange: (next: string) => void): HTMLElement {
        const wrap = document.createElement('label');
        wrap.style.cssText = `
            position: relative;
            width: 56px;
            height: 48px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 10px;
            border: 1px solid rgba(15, 23, 42, 0.14);
            background: #ffffff;
            cursor: pointer;
            box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.04);
        `;

        const swatch = document.createElement('span');
        swatch.style.cssText = `
            width: 32px;
            height: 32px;
            border-radius: 7px;
            background: ${value};
            display: block;
        `;

        const input = document.createElement('input');
        input.type = 'color';
        input.value = value;
        input.style.cssText = `
            position: absolute;
            inset: 0;
            opacity: 0;
            cursor: pointer;
        `;
        input.addEventListener('input', () => {
            swatch.style.background = input.value;
            onChange(input.value);
        });

        wrap.appendChild(swatch);
        wrap.appendChild(input);
        return wrap;
    }

    private _createSelectRow(labelText: string, options: string[], value: string): HTMLElement {
        const row = document.createElement('div');
        row.style.cssText = `
            display: grid;
            grid-template-columns: 150px minmax(0, 260px);
            align-items: center;
            gap: 18px;
            margin-top: 12px;
        `;

        const label = document.createElement('div');
        label.textContent = labelText;
        label.style.cssText = `
            font-size: 16px;
            line-height: 1.2;
        `;

        const select = document.createElement('select');
        select.style.cssText = this._selectStyle();
        for (const optionText of options) {
            const option = document.createElement('option');
            option.textContent = optionText;
            option.value = optionText;
            select.appendChild(option);
        }
        select.value = value;

        row.appendChild(label);
        row.appendChild(select);
        return row;
    }

    private _selectStyle(): string {
        const isDark = this._theme === 'dark';
        return `
            min-width: 180px;
            height: 40px;
            padding: 0 14px;
            border-radius: 10px;
            border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.16)'};
            background: ${isDark ? '#111827' : '#ffffff'};
            color: ${isDark ? '#f3f4f6' : '#111827'};
            font-size: 14px;
            outline: none;
        `;
    }

    private _actionButtonStyle(primary: boolean): string {
        const isDark = this._theme === 'dark';
        return `
            min-width: 106px;
            height: 42px;
            padding: 0 18px;
            border-radius: 12px;
            border: ${primary ? 'none' : `1px solid ${isDark ? 'rgba(255, 255, 255, 0.16)' : '#111827'}`};
            background: ${primary ? '#111111' : 'transparent'};
            color: ${primary ? '#ffffff' : (isDark ? '#f3f4f6' : '#111827')};
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
        `;
    }
}
