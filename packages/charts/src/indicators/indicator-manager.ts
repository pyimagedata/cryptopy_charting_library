/**
 * Indicator Manager
 * 
 * Central manager for all indicators in the chart.
 * Handles adding/removing indicators, updating data, and managing panes.
 */

import { Indicator, OverlayIndicator, PanelIndicator, IndicatorType } from './indicator';
import { BarData } from '../model/data';
import { RSIIndicator } from './rsi-indicator';
import { EMAIndicator } from './ema-indicator';
import { SMAIndicator } from './sma-indicator';
import { BBIndicator } from './bb-indicator';
import { MACDIndicator } from './macd-indicator';
import { StochIndicator } from './stoch-indicator';

/**
 * Indicator manager events
 */
export interface IndicatorManagerEvents {
    indicatorAdded: (indicator: Indicator) => void;
    indicatorRemoved: (indicator: Indicator) => void;
    paneAdded: (indicator: PanelIndicator) => void;
    paneRemoved: (indicator: PanelIndicator) => void;
}

/**
 * Serialized indicator data for persistence
 */
export interface SerializedIndicator {
    id: string;
    type: IndicatorType; // 'overlay' or 'panel'
    typeId: string;      // Specific type: 'RSI', 'EMA', etc.
    name: string;
    options: Record<string, any>;
    isOverlay: boolean;
}

/**
 * Indicator Manager
 */
export class IndicatorManager {
    private _overlayIndicators: OverlayIndicator[] = [];
    private _panelIndicators: PanelIndicator[] = [];
    private _sourceData: BarData[] = [];

    // Event callbacks
    private _onIndicatorAdded: ((indicator: Indicator) => void) | null = null;
    private _onIndicatorRemoved: ((indicator: Indicator) => void) | null = null;
    private _onPaneAdded: ((indicator: PanelIndicator) => void) | null = null;
    private _onPaneRemoved: ((indicator: PanelIndicator) => void) | null = null;

    constructor() { }

    // --- Getters ---

    get overlayIndicators(): readonly OverlayIndicator[] {
        return this._overlayIndicators;
    }

    get panelIndicators(): readonly PanelIndicator[] {
        return this._panelIndicators;
    }

    get allIndicators(): readonly Indicator[] {
        return [...this._overlayIndicators, ...this._panelIndicators];
    }

    // --- Event setters ---

    set onIndicatorAdded(callback: (indicator: Indicator) => void) {
        this._onIndicatorAdded = callback;
    }

    set onIndicatorRemoved(callback: (indicator: Indicator) => void) {
        this._onIndicatorRemoved = callback;
    }

    set onPaneAdded(callback: (indicator: PanelIndicator) => void) {
        this._onPaneAdded = callback;
    }

    set onPaneRemoved(callback: (indicator: PanelIndicator) => void) {
        this._onPaneRemoved = callback;
    }

    // --- Indicator management ---

    /**
     * Add an overlay indicator (drawn on main chart)
     */
    addOverlayIndicator(indicator: OverlayIndicator): void {
        this._overlayIndicators.push(indicator);

        // Calculate with current data
        if (this._sourceData.length > 0) {
            indicator.setData(this._sourceData);
        }

        this._onIndicatorAdded?.(indicator);
    }

    /**
     * Add a panel indicator (drawn in separate pane)
     */
    addPanelIndicator(indicator: PanelIndicator): void {
        this._panelIndicators.push(indicator);

        // Calculate with current data
        if (this._sourceData.length > 0) {
            indicator.setData(this._sourceData);
        }

        this._onIndicatorAdded?.(indicator);
        this._onPaneAdded?.(indicator);
    }

    /**
     * Remove an indicator by ID
     */
    removeIndicator(id: string): void {
        // Check overlay indicators
        const overlayIndex = this._overlayIndicators.findIndex(i => i.id === id);
        if (overlayIndex >= 0) {
            const indicator = this._overlayIndicators[overlayIndex];
            this._overlayIndicators.splice(overlayIndex, 1);
            indicator.destroy();
            this._onIndicatorRemoved?.(indicator);
            return;
        }

        // Check panel indicators
        const panelIndex = this._panelIndicators.findIndex(i => i.id === id);
        if (panelIndex >= 0) {
            const indicator = this._panelIndicators[panelIndex];
            this._panelIndicators.splice(panelIndex, 1);
            indicator.destroy();
            this._onIndicatorRemoved?.(indicator);
            this._onPaneRemoved?.(indicator);
        }
    }

    /**
     * Get indicator by ID
     */
    getIndicator(id: string): Indicator | null {
        const overlay = this._overlayIndicators.find(i => i.id === id);
        if (overlay) return overlay;

        const panel = this._panelIndicators.find(i => i.id === id);
        if (panel) return panel;

        return null;
    }

    /**
     * Check if indicator exists
     */
    hasIndicator(id: string): boolean {
        return this.getIndicator(id) !== null;
    }

    // --- Data management ---

    /**
     * Update source data for all indicators
     */
    setData(data: BarData[]): void {
        this._sourceData = data;

        // Recalculate all indicators
        for (const indicator of this._overlayIndicators) {
            indicator.setData(data);
        }

        for (const indicator of this._panelIndicators) {
            indicator.setData(data);
        }
    }

    /**
     * Get source data
     */
    get sourceData(): readonly BarData[] {
        return this._sourceData;
    }

    /**
     * Recalculate a specific indicator with current data
     */
    recalculateIndicator(id: string): void {
        const indicator = this.getIndicator(id);
        if (indicator && this._sourceData.length > 0) {
            indicator.setData(this._sourceData);
        }
    }

    // =========================================================================
    // Serialization - Persistence
    // =========================================================================

    /**
     * Serialize all indicators to JSON
     */
    serialize(): SerializedIndicator[] {
        const serialized: SerializedIndicator[] = [];

        for (const indicator of this.allIndicators) {
            let typeId = 'Unknown';
            if (indicator instanceof RSIIndicator) typeId = 'RSI';
            else if (indicator instanceof EMAIndicator) typeId = 'EMA';
            else if (indicator instanceof SMAIndicator) typeId = 'SMA';
            else if (indicator instanceof BBIndicator) typeId = 'BollingerBands';
            else if (indicator instanceof MACDIndicator) typeId = 'MACD';
            else if (indicator instanceof StochIndicator) typeId = 'Stochastic';

            serialized.push({
                id: indicator.id,
                type: indicator.type,
                typeId: typeId,
                name: indicator.name,
                options: { ...indicator.options },
                isOverlay: indicator.type === 'overlay' // or simple check
            });
        }

        return serialized;
    }

    /**
     * Deserialize indicators from JSON
     */
    deserialize(data: SerializedIndicator[]): void {
        // Clear existing indicators
        this.clear();

        for (const item of data) {
            this._createIndicatorFromSerialized(item);
        }
    }

    /**
     * Create indicator from serialized data
     */
    private _createIndicatorFromSerialized(item: SerializedIndicator): void {
        let indicator: Indicator | null = null;

        // Use typeId to instantiate correct class
        // Fallback to type logic if typeId is missing (backward compatibility if needed)
        const typeId = item.typeId;

        switch (typeId) {
            case 'RSI':
                indicator = new RSIIndicator(item.options as any);
                break;
            case 'EMA':
                indicator = new EMAIndicator(item.options as any);
                break;
            case 'SMA':
                indicator = new SMAIndicator(item.options as any);
                break;
            case 'BollingerBands':
                indicator = new BBIndicator(item.options as any);
                break;
            case 'MACD':
                indicator = new MACDIndicator(item.options as any);
                break;
            case 'Stochastic':
                indicator = new StochIndicator(item.options as any);
                break;
            default:
                console.warn(`Unknown indicator typeId: ${typeId}`);
                return;
        }

        if (!indicator) return;

        // Restore ID
        Object.defineProperty(indicator, 'id', { value: item.id, writable: false });

        // Add to appropriate collection based on indicator's inherent type
        if (indicator.type === 'overlay') {
            if (indicator instanceof OverlayIndicator) {
                this.addOverlayIndicator(indicator);
            }
        } else {
            if (indicator instanceof PanelIndicator) {
                this.addPanelIndicator(indicator);
            }
        }
    }

    // --- Cleanup ---

    /**
     * Remove all indicators
     */
    clear(): void {
        // Remove overlay indicators
        for (const indicator of this._overlayIndicators) {
            indicator.destroy();
            this._onIndicatorRemoved?.(indicator);
        }
        this._overlayIndicators = [];

        // Remove panel indicators
        for (const indicator of this._panelIndicators) {
            indicator.destroy();
            this._onIndicatorRemoved?.(indicator);
            this._onPaneRemoved?.(indicator);
        }
        this._panelIndicators = [];
    }

    /**
     * Destroy manager
     */
    destroy(): void {
        this.clear();
        this._sourceData = [];
        this._onIndicatorAdded = null;
        this._onIndicatorRemoved = null;
        this._onPaneAdded = null;
        this._onPaneRemoved = null;
    }
}
