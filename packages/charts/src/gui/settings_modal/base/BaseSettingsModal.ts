/**
 * Base Settings Modal
 * Abstract base class providing modal shell infrastructure
 * Subclasses implement content rendering
 */

import { Delegate } from '../../../helpers/delegate';
import { Drawing } from '../../../drawings';

/** Tab configuration */
export interface ModalTab {
    id: string;
    label: string;
    icon?: string;
}

/**
 * Abstract base class for drawing settings modals
 * Provides: modal container, header, tabs, footer, drag functionality
 * Subclasses implement: renderTabContent()
 */
export abstract class BaseSettingsModal {
    protected _element: HTMLElement | null = null;
    protected _overlay: HTMLElement | null = null;
    protected _currentDrawing: Drawing | null = null;
    protected _container: HTMLElement;
    protected _contentContainer: HTMLElement | null = null;
    protected _activeTabId: string = 'style';

    // Events
    readonly closed = new Delegate<void>();
    readonly settingsChanged = new Delegate<Drawing>();

    // Default tabs
    protected _tabs: ModalTab[] = [
        { id: 'style', label: 'Style' },
        { id: 'coordinates', label: 'Coordinates' },
        { id: 'visibility', label: 'Visibility' },
    ];

    constructor(container: HTMLElement) {
        this._container = container;
    }

    /** Get modal title based on drawing type */
    protected abstract getTitle(): string;

    /** Render content for a specific tab */
    protected abstract renderTabContent(tabId: string, container: HTMLElement): void;

    /** Initialize modal-specific state (optional override) */
    protected initializeForDrawing(_drawing: Drawing): void {
        // Override in subclasses if needed
    }

    /** Show the modal for a drawing */
    show(drawing: Drawing): void {
        this._currentDrawing = drawing;
        this.initializeForDrawing(drawing);
        this._createElement();
        this._activeTabId = 'style';
        this._renderActiveTab();
    }

    /** Hide and destroy the modal */
    hide(): void {
        if (this._overlay) {
            this._overlay.remove();
            this._overlay = null;
        }
        if (this._element) {
            this._element.remove();
            this._element = null;
        }
        this._currentDrawing = null;
        this._contentContainer = null;
        this.closed.fire();
    }

    /** Create the modal DOM structure */
    private _createElement(): void {
        // Overlay
        this._overlay = document.createElement('div');
        this._overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9998;
        `;
        this._overlay.onclick = () => this.hide();

        // Modal
        this._element = document.createElement('div');
        this._element.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 380px;
            max-height: 80vh;
            background: #1e222d;
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            z-index: 9999;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        // Prevent closing when clicking inside modal
        this._element.onclick = (e) => e.stopPropagation();

        this._createHeader();
        this._createTabs();
        this._createContent();
        this._createFooter();

        this._container.appendChild(this._overlay);
        this._container.appendChild(this._element);
    }

    /** Create draggable header */
    private _createHeader(): void {
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px;
            border-bottom: 1px solid #2B2B43;
            cursor: move;
            user-select: none;
        `;

        // Drag functionality
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;

        header.addEventListener('mousedown', (e) => {
            if (e.target === header || (e.target as HTMLElement).tagName === 'H3') {
                isDragging = true;
                if (this._element) {
                    const rect = this._element.getBoundingClientRect();
                    offsetX = e.clientX - rect.left;
                    offsetY = e.clientY - rect.top;
                    this._element.style.transform = 'none';
                    this._element.style.left = `${rect.left}px`;
                    this._element.style.top = `${rect.top}px`;
                }
            }
        });

        const onMouseMove = (e: MouseEvent) => {
            if (isDragging && this._element) {
                this._element.style.left = `${e.clientX - offsetX}px`;
                this._element.style.top = `${e.clientY - offsetY}px`;
            }
        };

        const onMouseUp = () => {
            isDragging = false;
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        // Title
        const title = document.createElement('h3');
        title.textContent = this.getTitle();
        title.style.cssText = `
            margin: 0;
            font-size: 16px;
            font-weight: 500;
            color: #d1d4dc;
        `;

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            background: transparent;
            border: none;
            color: #787b86;
            font-size: 18px;
            cursor: pointer;
            padding: 4px;
            line-height: 1;
        `;
        closeBtn.onclick = () => this.hide();
        closeBtn.onmouseenter = () => closeBtn.style.color = '#d1d4dc';
        closeBtn.onmouseleave = () => closeBtn.style.color = '#787b86';

        header.appendChild(title);
        header.appendChild(closeBtn);
        this._element!.appendChild(header);
    }

    /** Create tab bar */
    private _createTabs(): void {
        const tabBar = document.createElement('div');
        tabBar.style.cssText = `
            display: flex;
            border-bottom: 1px solid #2B2B43;
            padding: 0 12px;
        `;

        this._tabs.forEach(tab => {
            const tabBtn = document.createElement('button');
            tabBtn.textContent = tab.label;
            tabBtn.dataset.tabId = tab.id;
            tabBtn.style.cssText = `
                padding: 12px 16px;
                background: transparent;
                border: none;
                border-bottom: 2px solid ${tab.id === this._activeTabId ? '#2962ff' : 'transparent'};
                color: ${tab.id === this._activeTabId ? '#d1d4dc' : '#787b86'};
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s;
            `;

            tabBtn.onclick = () => {
                this._activeTabId = tab.id;
                // Update tab styles
                tabBar.querySelectorAll('button').forEach(btn => {
                    const isActive = btn.dataset.tabId === tab.id;
                    (btn as HTMLButtonElement).style.borderBottomColor = isActive ? '#2962ff' : 'transparent';
                    (btn as HTMLButtonElement).style.color = isActive ? '#d1d4dc' : '#787b86';
                });
                this._renderActiveTab();
            };

            tabBar.appendChild(tabBtn);
        });

        this._element!.appendChild(tabBar);
    }

    /** Create content container */
    private _createContent(): void {
        this._contentContainer = document.createElement('div');
        this._contentContainer.style.cssText = `
            padding: 16px 20px;
            overflow-y: auto;
            flex: 1;
            max-height: 400px;
        `;
        this._element!.appendChild(this._contentContainer);
    }

    /** Create footer with buttons */
    private _createFooter(): void {
        const footer = document.createElement('div');
        footer.style.cssText = `
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding: 12px 20px;
            border-top: 1px solid #2B2B43;
        `;

        // Template button
        const templateBtn = document.createElement('button');
        templateBtn.textContent = 'Template...';
        templateBtn.style.cssText = `
            padding: 8px 16px;
            background: #2a2e39;
            border: none;
            border-radius: 4px;
            color: #787b86;
            font-size: 13px;
            cursor: pointer;
        `;
        templateBtn.onmouseenter = () => templateBtn.style.background = '#363a45';
        templateBtn.onmouseleave = () => templateBtn.style.background = '#2a2e39';

        // OK button
        const okBtn = document.createElement('button');
        okBtn.textContent = 'Ok';
        okBtn.style.cssText = `
            padding: 8px 24px;
            background: #2962ff;
            border: none;
            border-radius: 4px;
            color: #ffffff;
            font-size: 13px;
            cursor: pointer;
        `;
        okBtn.onmouseenter = () => okBtn.style.background = '#1e53e4';
        okBtn.onmouseleave = () => okBtn.style.background = '#2962ff';
        okBtn.onclick = () => this.hide();

        footer.appendChild(templateBtn);
        footer.appendChild(okBtn);
        this._element!.appendChild(footer);
    }

    /** Render the currently active tab content */
    private _renderActiveTab(): void {
        if (!this._contentContainer) return;
        this._contentContainer.innerHTML = '';
        this.renderTabContent(this._activeTabId, this._contentContainer);
    }

    /** Notify that settings have changed */
    protected notifySettingsChanged(): void {
        if (this._currentDrawing) {
            this.settingsChanged.fire(this._currentDrawing);
        }
    }

    /** Dispose and cleanup */
    dispose(): void {
        this.hide();
        this.closed.destroy();
        this.settingsChanged.destroy();
    }
}
