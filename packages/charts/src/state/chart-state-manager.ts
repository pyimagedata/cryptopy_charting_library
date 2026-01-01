/**
 * Chart State Manager - Manages saving/loading chart state per symbol
 * 
 * Persists drawings and indicators to localStorage for each symbol.
 */

import { DrawingManager } from '../drawings/drawing-manager';
import { SerializedDrawing } from '../drawings/drawing';
import { IndicatorManager, SerializedIndicator } from '../indicators/indicator-manager';

/** Chart state data structure */
export interface ChartState {
    symbol: string;
    drawings: SerializedDrawing[];
    indicators: SerializedIndicator[];
    savedAt: number;
    version: number;
}

/** Storage adapter interface for flexibility */
export interface StorageAdapter {
    save(key: string, data: string): void;
    load(key: string): string | null;
    delete(key: string): void;
    keys(): string[];
}

/** LocalStorage implementation */
class LocalStorageAdapter implements StorageAdapter {
    private _prefix: string;

    constructor(prefix: string = 'chart_') {
        this._prefix = prefix;
    }

    save(key: string, data: string): void {
        try {
            localStorage.setItem(this._prefix + key, data);
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
        }
    }

    load(key: string): string | null {
        try {
            return localStorage.getItem(this._prefix + key);
        } catch (e) {
            console.error('Failed to load from localStorage:', e);
            return null;
        }
    }

    delete(key: string): void {
        try {
            localStorage.removeItem(this._prefix + key);
        } catch (e) {
            console.error('Failed to delete from localStorage:', e);
        }
    }

    keys(): string[] {
        const keys: string[] = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this._prefix)) {
                    keys.push(key.substring(this._prefix.length));
                }
            }
        } catch (e) {
            console.error('Failed to list keys from localStorage:', e);
        }
        return keys;
    }
}

/** Current schema version */
const CURRENT_VERSION = 1;

/**
 * Chart State Manager
 * 
 * Manages saving and loading chart state (drawings, etc.) per symbol.
 */
export class ChartStateManager {
    private _drawingManager: DrawingManager;
    private _indicatorManager: IndicatorManager;
    private _storage: StorageAdapter;
    private _currentSymbol: string = '';
    private _autoSave: boolean = true;
    private _saveDebounceTimer: number | null = null;

    constructor(
        drawingManager: DrawingManager,
        indicatorManager: IndicatorManager,
        storage?: StorageAdapter
    ) {
        this._drawingManager = drawingManager;
        this._indicatorManager = indicatorManager;
        this._storage = storage || new LocalStorageAdapter();

        // Subscribe to drawing changes for auto-save
        this._drawingManager.drawingsChanged.subscribe(() => {
            if (this._autoSave && this._currentSymbol) {
                this._debouncedSave();
            }
        });

        // Subscribe to indicator changes for auto-save
        const saveHandler = () => {
            if (this._autoSave && this._currentSymbol) {
                this._debouncedSave();
            }
        };

        this._indicatorManager.onIndicatorAdded = saveHandler;
        this._indicatorManager.onIndicatorRemoved = saveHandler;
        // Note: We might want to subscribe to detailed changes (options/data) too, 
        // but for now add/remove is the main trigger. 
        // Ideally IndicatorManager should emit a generic 'stateChanged' event.
    }

    // =========================================================================
    // Public Methods
    // =========================================================================

    /** Set current symbol and load its state */
    setSymbol(symbol: string): void {
        // Save current symbol's state before switching
        if (this._currentSymbol && this._currentSymbol !== symbol) {
            this.saveState();
        }

        this._currentSymbol = symbol;
        this.loadState();
    }

    /** Get current symbol */
    get currentSymbol(): string {
        return this._currentSymbol;
    }

    /** Enable/disable auto-save */
    set autoSave(enabled: boolean) {
        this._autoSave = enabled;
    }

    get autoSave(): boolean {
        return this._autoSave;
    }

    /** Manually save current state */
    saveState(): void {
        if (!this._currentSymbol) return;

        // Save drawings per-symbol
        const drawingState = {
            symbol: this._currentSymbol,
            drawings: this._drawingManager.serialize(),
            savedAt: Date.now(),
            version: CURRENT_VERSION,
        };
        this._storage.save(this._currentSymbol, JSON.stringify(drawingState));

        // Save indicators globally (layout-based)
        this._saveIndicatorsGlobal();

        console.log(`Chart state saved for ${this._currentSymbol}:`,
            drawingState.drawings.length, 'drawings');
    }

    /** Save indicators globally (not per-symbol) */
    private _saveIndicatorsGlobal(): void {
        const indicatorState = {
            indicators: this._indicatorManager.serialize(),
            savedAt: Date.now(),
            version: CURRENT_VERSION,
        };
        this._storage.save('_layout_indicators', JSON.stringify(indicatorState));
        console.log(`Indicators saved globally:`, indicatorState.indicators.length, 'indicators');
    }

    /** Manually load state for current symbol */
    loadState(): void {
        if (!this._currentSymbol) return;

        // Load drawings per-symbol
        const drawingJson = this._storage.load(this._currentSymbol);
        if (drawingJson) {
            try {
                const state = JSON.parse(drawingJson);
                this._drawingManager.deserialize(state.drawings || []);
                console.log(`Drawings loaded for ${this._currentSymbol}:`, state.drawings?.length || 0);
            } catch (e) {
                console.error('Failed to parse saved drawings:', e);
                this._drawingManager.deserialize([]);
            }
        } else {
            this._drawingManager.deserialize([]);
        }

        // Load indicators globally (only once, not on every symbol change)
        // Skip if indicators already loaded
        if (this._indicatorManager.allIndicators.length === 0) {
            this._loadIndicatorsGlobal();
        }
    }

    /** Load indicators from global storage */
    private _loadIndicatorsGlobal(): void {
        const indicatorJson = this._storage.load('_layout_indicators');
        if (!indicatorJson) {
            console.log('No saved indicators');
            return;
        }

        try {
            const state = JSON.parse(indicatorJson);
            this._indicatorManager.deserialize(state.indicators || []);
            console.log(`Indicators loaded globally:`, state.indicators?.length || 0);
        } catch (e) {
            console.error('Failed to parse saved indicators:', e);
        }
    }

    /** Delete saved state for a symbol */
    deleteState(symbol?: string): void {
        const targetSymbol = symbol || this._currentSymbol;
        if (targetSymbol) {
            this._storage.delete(targetSymbol);
            console.log(`Chart state deleted for ${targetSymbol}`);
        }
    }

    /** Get list of symbols with saved states */
    getSavedSymbols(): string[] {
        return this._storage.keys();
    }

    /** Check if a symbol has saved state */
    hasState(symbol?: string): boolean {
        const targetSymbol = symbol || this._currentSymbol;
        return targetSymbol ? this._storage.load(targetSymbol) !== null : false;
    }

    /** Export state for backup */
    exportState(symbol?: string): string | null {
        const targetSymbol = symbol || this._currentSymbol;
        if (!targetSymbol) return null;
        return this._storage.load(targetSymbol);
    }

    /** Import state from backup */
    importState(json: string, symbol?: string): boolean {
        const targetSymbol = symbol || this._currentSymbol;
        if (!targetSymbol) return false;

        try {
            // Validate JSON structure
            const state: ChartState = JSON.parse(json);
            if (!state.drawings || !Array.isArray(state.drawings)) {
                throw new Error('Invalid state format');
            }

            this._storage.save(targetSymbol, json);

            // If importing for current symbol, reload
            if (targetSymbol === this._currentSymbol) {
                this.loadState();
            }

            return true;
        } catch (e) {
            console.error('Failed to import state:', e);
            return false;
        }
    }

    // =========================================================================
    // Private Methods
    // =========================================================================

    /** Debounced save to prevent excessive writes */
    private _debouncedSave(): void {
        if (this._saveDebounceTimer !== null) {
            clearTimeout(this._saveDebounceTimer);
        }

        this._saveDebounceTimer = window.setTimeout(() => {
            this.saveState();
            this._saveDebounceTimer = null;
        }, 500); // 500ms debounce
    }

    /** Cleanup */
    destroy(): void {
        if (this._saveDebounceTimer !== null) {
            clearTimeout(this._saveDebounceTimer);
        }
    }
}
