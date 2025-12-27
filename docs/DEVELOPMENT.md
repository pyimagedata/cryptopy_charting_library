# Charting Library - Technical Documentation

**Last Updated:** 2025-12-27  
**Bundle Size:** 408.3kb  
**Status:** Phase 7 Complete

---

# 📚 Table of Contents

## Part A: Overview
- [A1. Introduction](#a1-introduction)
- [A2. Project Structure](#a2-project-structure)
- [A3. Architecture Summary](#a3-architecture-summary)

## Part B: Canvas Package (`packages/canvas`)
- [B1. Overview](#b1-canvas-package-overview)
- [B2. Canvas Binding System](#b2-canvas-binding-system)
- [B3. Rendering Target](#b3-rendering-target)
- [B4. Device Pixel Ratio Monitoring](#b4-device-pixel-ratio-monitoring)

## Part C: Charts Package (`packages/charts`)
- [C1. Overview](#c1-charts-package-overview)
- [C2. ChartWidget (Root Controller)](#c2-chartwidget-root-controller)
- [C3. ChartModel (Data Logic)](#c3-chartmodel-data-logic)
- [C4. PaneWidget (Rendering)](#c4-panewidget-rendering)
- [C5. Indicator System](#c5-indicator-system)

## Part D: Drawing System
- [D1. Overview](#d1-drawing-system-overview)
- [D2. DrawingManager](#d2-drawingmanager)
- [D3. Serialization (Factory Pattern)](#d3-serialization-factory-pattern)
- [D4. Coordinate Stability (Binary Search)](#d4-coordinate-stability-binary-search)

## Part E: State & Persistence
- [E1. ChartStateManager](#e1-chartstatemanager)
- [E2. Storage Adapter Pattern](#e2-storage-adapter-pattern)
- [E3. Performance (Debouncing)](#e3-performance-debouncing)

## Part F: Developer Guide
- [F1. Adding a New Drawing Tool](#f1-adding-a-new-drawing-tool)
- [F2. Adding a New Indicator](#f2-adding-a-new-indicator)

## Part G: Development History
- [G1. Phase 1-4: Foundation](#g1-phase-1-4-foundation)
- [G2. Phase 5-7: Enhancements](#g2-phase-5-7-enhancements)
- [G3. Future Roadmap](#g3-future-roadmap)

---

# Part A: Overview

## A1. Introduction

This is a custom, high-performance financial charting library built with **TypeScript** and **HTML5 Canvas**.

### Key Features
| Feature | Description |
|---------|-------------|
| Drawing Tools | Trend Lines, Horizontal/Vertical Lines, Fibonacci |
| Persistence | Auto-save to localStorage per symbol |
| High Performance | 60 FPS rendering, Retina support |
| Indicators | RSI, SMA, EMA, MACD, Bollinger Bands |

---

## A2. Project Structure

```
charting_library/
├── packages/
│   ├── canvas/                 # Low-level pixel rendering engine
│   │   ├── canvas-binding.ts   # Canvas size management
│   │   ├── rendering-target.ts # Coordinate systems
│   │   └── device-pixel-ratio.ts # DPR monitoring
│   │
│   └── charts/                 # Main library
│       └── src/
│           ├── gui/            # UI Components
│           ├── model/          # Data logic
│           ├── drawings/       # Drawing tools
│           ├── indicators/     # Technical indicators
│           ├── renderers/      # Canvas renderers
│           └── state/          # Persistence
│
├── src/                        # Legacy JavaScript source
├── styles/                     # CSS styles
└── docs/                       # Documentation (this file)
```

---

## A3. Architecture Summary

The library follows **MVC (Model-View-Controller)** pattern:

| Layer | Responsibility | Key Files |
|-------|----------------|-----------|
| **Model** | Data, Logic, Math | `chart-model.ts`, `drawing.ts` |
| **View** | DOM, Canvas, UI | `pane-widget.ts`, `toolbar-widget.ts` |
| **Controller** | Orchestration | `drawing-manager.ts`, `chart-state-manager.ts` |

### Data Flow
```
User Click → ChartWidget → DrawingManager → Drawing Model
                                    ↓
                            ChartStateManager → localStorage
                                    ↓
                            PaneWidget.render() → Canvas
```

---

# Part B: Canvas Package (`packages/canvas`)

## B1. Canvas Package Overview

**Purpose:** Pixel-perfect rendering on all displays (Standard, Retina, 4K).

**Problem Solved:** Without this, a "1px line" on Retina looks blurry because 1 CSS pixel = 2 physical pixels.

**Files:**
| File | Role |
|------|------|
| `canvas-binding.ts` | Manages canvas memory allocation |
| `rendering-target.ts` | Provides coordinate systems |
| `device-pixel-ratio.ts` | Monitors resolution changes |

---

## B2. Canvas Binding System

**File:** `canvas-binding.ts`

### Core Concept
HTML5 Canvas has two sizes:
- **Client Size (CSS):** Visual size on screen
- **Bitmap Size (Physical):** Actual pixel buffer

### Implementation
```typescript
// Using ResizeObserver with device-pixel-content-box
this._resizeObserver.observe(canvas, {
    box: 'device-pixel-content-box'  // Get exact physical pixels
});
```

### Fallback Strategy
If browser doesn't support `device-pixel-content-box`:
```typescript
const ratio = window.devicePixelRatio || 1;
canvas.width = rect.width * ratio;
canvas.height = rect.height * ratio;
```

---

## B3. Rendering Target

**File:** `rendering-target.ts`

Two coordinate modes available:

### Mode A: Media Space (CSS Pixels)
```typescript
target.useMediaCoordinateSpace(({ context }) => {
    context.fillRect(0, 0, 100, 100);  // Auto-scaled for DPR
});
```
**Use for:** UI elements, shapes

### Mode B: Bitmap Space (Physical Pixels)
```typescript
target.useBitmapCoordinateSpace(({ context }) => {
    ctx.moveTo(100.5, 0);  // Exact pixel targeting
});
```
**Use for:** Grid lines, 1px hairlines

---

## B4. Device Pixel Ratio Monitoring

**File:** `device-pixel-ratio.ts`

### Problem
User drags browser from Retina to Standard monitor → DPR changes from 2.0 to 1.0

### Solution
```typescript
matchMedia(`(resolution: ${dpr}dppx)`).addEventListener('change', () => {
    // Re-allocate canvas and re-render
});
```

---

# Part C: Charts Package (`packages/charts`)

## C1. Charts Package Overview

**Purpose:** Main business logic and user interface.

**Structure:**
| Folder | Purpose |
|--------|---------|
| `gui/` | UI Components (Chart, Toolbar, Modals) |
| `model/` | Data structures (Series, TimeScale, PriceScale) |
| `drawings/` | Drawing tool implementations |
| `indicators/` | Technical indicator calculations |
| `renderers/` | Canvas drawing routines |
| `state/` | Persistence management |

---

## C2. ChartWidget (Root Controller)

**File:** `gui/chart-widget.ts`

### Role
- **Entry Point:** Creates all other components
- **Event Hub:** Broadcasts `symbolChanged`, `timeframeChanged`
- **Glue Code:** Connects DrawingManager, StateManager, PaneWidget

### Key Properties
```typescript
private _drawingManager: DrawingManager;
private _chartStateManager: ChartStateManager;
private _paneWidget: PaneWidget;
private _indicatorManager: IndicatorManager;
```

---

## C3. ChartModel (Data Logic)

**File:** `model/chart-model.ts`

### Role
Pure logic layer (no DOM knowledge).

### State Container
```typescript
_serieses: Series[];          // Candle/Line data
_options: ChartModelOptions;  // Colors, styles
_crosshairPosition: { x, y }; // Cursor location
```

### Invalidation System
| Reason | Trigger | Action |
|--------|---------|--------|
| `Cursor` | Mouse move | Light update |
| `Data` | New data | Re-calculate ranges |
| `Layout` | Resize | Full re-render |

---

## C4. PaneWidget (Rendering)

**File:** `gui/pane-widget.ts`

### Render Loop (~60 FPS)

```
1. Clear Canvas
2. Draw Background
3. Draw Grid
4. Draw Series (Candles/Lines)
5. Draw Overlay Indicators (EMA/SMA)
6. Draw User Drawings
7. Draw Crosshair
```

### Layer Order
| Z-Index | Layer |
|---------|-------|
| 0 | Background |
| 1 | Grid |
| 2 | Watermark |
| 3 | Series Data |
| 4 | Indicators |
| 5 | Drawings |
| 6 | Crosshair |

---

## C5. Indicator System

**Location:** `indicators/`

### Architecture
```
IndicatorManager → Creates → Indicator → Calculates → Values[]
                                                         ↓
                      OverlayIndicatorRenderer ← Renders
```

### Abstraction Benefit
Renderer doesn't know "RSI" vs "SMA". It just draws `Array<{x, y}>`.

---

# Part D: Drawing System

## D1. Drawing System Overview

**Location:** `drawings/`

### Drawing Types
| Type | Points | Class |
|------|--------|-------|
| Trend Line | 2 | `TrendLineDrawing` |
| Horizontal Line | 1 | `HorizontalLineDrawing` |
| Vertical Line | 1 | `VerticalLineDrawing` |
| Fibonacci | 2 | `FibRetracementDrawing` |

---

## D2. DrawingManager

**File:** `drawings/drawing-manager.ts`

### Responsibilities
- Create/Delete drawings
- Selection management
- Coordinate conversion (Pixel ↔ Price/Time)
- Serialization for persistence

---

## D3. Serialization (Factory Pattern)

### Problem
We store JSON but need class instances with methods.

### Solution
```typescript
// Deserialization uses Factory Pattern
switch (item.type) {
    case 'trendLine':
        drawing = TrendLineDrawing.fromJSON(item);
        break;
    case 'horizontalLine':
        drawing = HorizontalLineDrawing.fromJSON(item);
        break;
}
```

---

## D4. Coordinate Stability (Binary Search)

### Problem
Bar #100 shifts when new data arrives → Drawing moves.

### Solution
Store **Unix Timestamp** instead of bar index.

### Algorithm
```typescript
_timestampToIndex(time: number): number {
    // Binary Search O(log n)
    let low = 0, high = data.length - 1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (data[mid].time < time) low = mid + 1;
        else high = mid - 1;
    }
    return low;
}
```

---

# Part E: State & Persistence

## E1. ChartStateManager

**File:** `state/chart-state-manager.ts`

### Schema
```typescript
interface ChartState {
    symbol: string;
    drawings: SerializedDrawing[];
    indicators: SerializedIndicator[];
    savedAt: number;
}
```

---

## E2. Storage Adapter Pattern

### Interface
```typescript
interface StorageAdapter {
    save(key: string, data: string): void;
    load(key: string): string | null;
}
```

### Benefit
Swap `LocalStorageAdapter` for `CloudStorageAdapter` without changing chart code.

---

## E3. Performance (Debouncing)

### Problem
Dragging fires 100+ events/second.

### Solution
```typescript
clearTimeout(this._saveTimer);
this._saveTimer = setTimeout(() => this._doSave(), 1000);
```
Only save after 1 second of inactivity.

---

# Part F: Developer Guide

## F1. Adding a New Drawing Tool

**Example:** Adding "Triangle"

| Step | Action | File |
|------|--------|------|
| 1 | Create class | `drawings/triangle-drawing.ts` |
| 2 | Implement `Drawing` interface | - |
| 3 | Add to factory switch | `drawing-manager.ts` |
| 4 | Add toolbar icon | `drawing-toolbar-widget.ts` |
| 5 | Test persistence | Refresh page |

---

## F2. Adding a New Indicator

**Example:** Adding "Bollinger Bands"

| Step | Action | File |
|------|--------|------|
| 1 | Create indicator class | `indicators/bb-indicator.ts` |
| 2 | Implement `calculate(data)` | - |
| 3 | Register in manager | `indicator-manager.ts` |
| 4 | Add to search modal | `indicator-search-modal.ts` |

---

# Part G: Development History

## G1. Phase 1: Serialization Infrastructure

**Goal:** Enable drawings to be converted to/from JSON for storage.

| # | Task | File Modified | Details |
|---|------|---------------|---------|
| 1.1 | **Create SerializedDrawing Interface** | `drawings/drawing.ts` | Defined interface with `id`, `type`, `points`, `style`, `state`, `visible`, `locked` properties. Added optional type-specific properties (`extendLeft`, `levels`, etc.). |
| 1.2 | **Add toJSON() Methods** | `trend-line-drawing.ts`, `fibonacci-retracement-drawing.ts` | Each drawing class exports its state as a plain JSON object. |
| 1.3 | **Add fromJSON() Factory Methods** | `trend-line-drawing.ts`, `fibonacci-retracement-drawing.ts` | Static methods that reconstruct class instances from JSON data. |
| 1.4 | **Implement Manager serialize()** | `drawing-manager.ts` | Iterates all drawings, calls `toJSON()`, returns array. |
| 1.5 | **Implement Manager deserialize()** | `drawing-manager.ts` | Clears existing drawings, uses switch/case factory to reconstruct from JSON. |

**Code Example:**
```typescript
// drawing.ts
interface SerializedDrawing {
    id: string;
    type: DrawingType;
    points: DrawingPoint[];
    style: DrawingStyle;
    state: DrawingState;
    visible: boolean;
    locked: boolean;
}

// trend-line-drawing.ts
toJSON(): SerializedDrawing {
    return {
        id: this.id,
        type: this.type,
        points: [...this.points],
        style: { ...this.style },
        state: this.state,
        visible: this.visible,
        locked: this.locked,
        extendLeft: this.extendLeft,
        extendRight: this.extendRight
    };
}

static fromJSON(data: SerializedDrawing): TrendLineDrawing {
    const drawing = new TrendLineDrawing();
    Object.assign(drawing, data);
    return drawing;
}
```

---

## G2. Phase 2: Storage System

**Goal:** Persist chart state to browser's LocalStorage.

| # | Task | File Modified | Details |
|---|------|---------------|---------|
| 2.1 | **Create StorageAdapter Interface** | `state/chart-state-manager.ts` | Abstraction layer with `save()`, `load()`, `delete()`, `keys()` methods. |
| 2.2 | **Implement LocalStorageAdapter** | `state/chart-state-manager.ts` | Wraps `localStorage` with try/catch for quota errors. Uses `chart_` prefix for keys. |
| 2.3 | **Define ChartState Interface** | `state/chart-state-manager.ts` | Schema: `{ symbol, drawings[], indicators[], savedAt, version }`. |
| 2.4 | **Create ChartStateManager Class** | `state/chart-state-manager.ts` | Orchestrates save/load operations. Takes `DrawingManager` and `IndicatorManager` references. |

**Code Example:**
```typescript
// Storage Adapter Pattern
interface StorageAdapter {
    save(key: string, data: string): void;
    load(key: string): string | null;
    delete(key: string): void;
    keys(): string[];
}

class LocalStorageAdapter implements StorageAdapter {
    private _prefix = 'chart_';
    
    save(key: string, data: string): void {
        try {
            localStorage.setItem(this._prefix + key, data);
        } catch (e) {
            console.error('Storage quota exceeded');
        }
    }
}
```

---

## G3. Phase 3: Integration & Auto-Save

**Goal:** Make persistence seamless for the user.

| # | Task | File Modified | Details |
|---|------|---------------|---------|
| 3.1 | **Instantiate ChartStateManager** | `gui/chart-widget.ts` | Created instance in constructor, passed DrawingManager and IndicatorManager. |
| 3.2 | **Hook symbolChanged Event** | `gui/chart-widget.ts` | When symbol changes: save current state, load new symbol's state. |
| 3.3 | **Hook drawingsChanged Event** | `gui/chart-widget.ts` | Subscribe to `drawingManager.drawingsChanged` -> trigger save. |
| 3.4 | **Implement Debouncing** | `state/chart-state-manager.ts` | Added 1-second delay before writing to prevent performance issues during dragging. |

**Code Example:**
```typescript
// chart-widget.ts
constructor() {
    // ...
    this._chartStateManager = new ChartStateManager(
        this._drawingManager,
        this._indicatorManager
    );
    
    // Auto-save on drawing changes
    this._drawingManager.drawingsChanged.subscribe(() => {
        this._chartStateManager.saveState(this._currentSymbol);
    });
}

// chart-state-manager.ts - Debouncing
saveState(symbol: string): void {
    clearTimeout(this._saveDebounceTimer);
    this._saveDebounceTimer = setTimeout(() => this._doSave(symbol), 1000);
}
```

---

## G4. Phase 4: Indicator Persistence

**Goal:** Save technical indicators (RSI, MACD, etc.) alongside drawings.

| # | Task | File Modified | Details |
|---|------|---------------|---------|
| 4.1 | **Create SerializedIndicator Interface** | `indicators/indicator-manager.ts` | Defined `{ type, params, paneId }` structure. |
| 4.2 | **Add serialize() to IndicatorManager** | `indicators/indicator-manager.ts` | Iterates all indicators, exports configuration. |
| 4.3 | **Add deserialize() to IndicatorManager** | `indicators/indicator-manager.ts` | Reconstructs indicators from saved config. |
| 4.4 | **Update ChartState Schema** | `state/chart-state-manager.ts` | Added `indicators: SerializedIndicator[]` to state interface. |

**Code Example:**
```typescript
// indicator-manager.ts
interface SerializedIndicator {
    type: string;       // 'RSI', 'SMA', 'EMA', etc.
    params: object;     // { period: 14, color: '#fff' }
    paneId: string;     // Which pane it belongs to
}

serialize(): SerializedIndicator[] {
    return this._indicators.map(ind => ({
        type: ind.type,
        params: ind.getParams(),
        paneId: ind.paneId
    }));
}
```

---

## G5. Phase 5: Drawing Positioning Stability

**Goal:** Fix issue where drawings shifted when new data bars arrived.

| # | Task | File Modified | Details |
|---|------|---------------|---------|
| 5.1 | **Identify Root Cause** | - | Drawings stored "bar index" (e.g., Bar #100). When new bar arrives, indices shift left. |
| 5.2 | **Switch to Timestamp Storage** | `drawings/drawing.ts` | Changed `DrawingPoint` to store Unix timestamp instead of bar index. |
| 5.3 | **Implement Binary Search** | `drawings/drawing-manager.ts` | Added `_timestampToIndex(time)` method with O(log n) complexity. |
| 5.4 | **Sync Timestamps** | `gui/chart-widget.ts` | Pass timestamp array from data to DrawingManager on each update. |

**Code Example:**
```typescript
// drawing-manager.ts
private _timestampToIndex(time: number): number {
    const data = this._timestamps;
    let low = 0, high = data.length - 1;
    
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (data[mid] < time) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return low;
}
```

---

## G6. Phase 6: Quick-Line Tools (Horizontal/Vertical)

**Goal:** Add single-click line tools common in trading apps.

| # | Task | File Modified | Details |
|---|------|---------------|---------|
| 6.1 | **Create HorizontalLineDrawing Class** | `drawings/horizontal-line-drawing.ts` | Single-point drawing. Captures Y (price), renders from x=0 to x=width. |
| 6.2 | **Create VerticalLineDrawing Class** | `drawings/vertical-line-drawing.ts` | Single-point drawing. Captures X (time), renders from y=0 to y=height. |
| 6.3 | **Add to DrawingType Union** | `drawings/drawing.ts` | Added `'horizontalLine' \| 'verticalLine'` to type definition. |
| 6.4 | **Add to startDrawing() Switch** | `drawings/drawing-manager.ts` | Handle single-click completion (1 point = complete). |
| 6.5 | **Implement Settings Config** | `horizontal-line-drawing.ts`, `vertical-line-drawing.ts` | `getSettingsConfig()` returns color, width, style options. |
| 6.6 | **Add Toolbar Icons** | `gui/drawing-toolbar-widget.ts` | Added SVG icons for both tools. |

**Code Example:**
```typescript
// horizontal-line-drawing.ts
addPoint(time: number, price: number): void {
    this.points.push({ time, price });
    this.state = 'complete';  // Single click = done
}

render(ctx: CanvasRenderingContext2D, ..., canvasWidth: number): void {
    const y = priceToPixel(this.points[0].price);
    if (y === null) return;
    
    ctx.beginPath();
    ctx.strokeStyle = this.style.color;
    ctx.lineWidth = this.style.lineWidth;
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth, y);  // Full width
    ctx.stroke();
}
```

---

## G2. Phase 5-7: Enhancements

| Phase | Goal | Key Deliverable |
|-------|------|-----------------|
| 5 | Stability | Timestamp-based coordinates |
| 6 | Quick Lines | HorizontalLine, VerticalLine |
| 7 | Polish | See detailed breakdown below |

### Phase 7: Line Drawing Enhancements (2025-12-27)

**Completed Tasks:**

| # | Task | File Modified | Details |
|---|------|---------------|---------|
| 7.1 | **DPR Scaling Fix** | `horizontal-line-drawing.ts`, `vertical-line-drawing.ts`, `pane-widget.ts` | Added `dpr` parameter to `render()` methods. Multiplied coordinates, lineWidth, and fontSize by DPR for Retina sharpness. |
| 7.2 | **Storage Persistence Fix** | `drawing-manager.ts` | Added `case 'horizontalLine'` and `case 'verticalLine'` to `deserialize()` switch statement. Without this, lines were lost on page refresh. |
| 7.3 | **Toolbar Icons Update** | `drawing-toolbar-widget.ts` | Replaced generic icons with TradingView-style SVGs (28x28 viewbox). Updated: TrendLine, Ray, InfoLine, ExtendedLine, TrendAngle, HorizontalLine, VerticalLine, CrossLine, HorizontalRay. |
| 7.4 | **Settings Modal Color Picker** | `drawing-settings-modal.ts` | Extended `_createStyleTab()` to include `horizontalLine` and `verticalLine` in the TrendLine-style color picker condition. |
| 7.5 | **Remove Irrelevant Options** | `drawing-settings-modal.ts` | Wrapped "Extend Left/Right" checkboxes with `if (type === 'trendLine')` condition. These options don't apply to infinite lines. |

**Code Changes Summary:**

```typescript
// drawing-manager.ts - deserialize() - ADDED:
case 'horizontalLine':
    drawing = HorizontalLineDrawing.fromJSON(item);
    break;
case 'verticalLine':
    drawing = VerticalLineDrawing.fromJSON(item);
    break;

// horizontal-line-drawing.ts - render() - MODIFIED:
render(ctx, timeToPixel, priceToPixel, canvasWidth, dpr = 1) {
    const yScaled = y * dpr;
    ctx.lineWidth = this.style.lineWidth * dpr;
    ctx.font = `${11 * dpr}px Arial`;
}

// drawing-settings-modal.ts - _createStyleTab() - MODIFIED:
if (type === 'trendLine' || type === 'horizontalLine' || type === 'verticalLine') {
    this._createTrendLineStyleTab(container);
}
---

## G8. Phase 8: Ray Drawing Tool (2025-12-27)

**Goal:** Add Ray drawing that extends infinitely from anchor point in one direction.

| # | Task | File Modified | Details |
|---|------|---------------|---------|
| 8.1 | **Create RayDrawing Class** | `drawings/ray-drawing.ts` | Extends `TrendLineDrawing`. Forces `extendRight = true` in constructor. Hides Extend options in settings. |
| 8.2 | **Add to Manager startDrawing()** | `drawings/drawing-manager.ts` | Added `case 'ray': drawing = new RayDrawing()` to switch. |
| 8.3 | **Add to Manager deserialize()** | `drawings/drawing-manager.ts` | Added `case 'ray': drawing = RayDrawing.fromJSON(item)` for persistence. |
| 8.4 | **Fix finishDrawing() Logic** | `drawings/drawing-manager.ts` | Added `'ray'` to two-point drawing check: `type === 'trendLine' \|\| type === 'fibRetracement' \|\| type === 'ray'`. |
| 8.5 | **Add Render Support** | `gui/pane-widget.ts` | Added `drawing.type === 'ray'` to render conditions. Updated `_drawTrendLine()` to accept `extendLeft/Right` parameters. |
| 8.6 | **Implement Line Extension** | `gui/pane-widget.ts` | Added slope-based line extension calculation to `_drawTrendLine()` for infinite ray rendering. |
| 8.7 | **Export from Index** | `drawings/index.ts` | Added `export * from './ray-drawing'`. |

**Code Changes Summary:**

```typescript
// ray-drawing.ts - KEY PARTS:
export class RayDrawing extends TrendLineDrawing {
    readonly type: DrawingType = 'ray';
    
    constructor(options: RayOptions = {}) {
        super({ ...options, extendLeft: false, extendRight: true });
    }
    
    // Override: Block extend changes
    setSettingValue(key: string, value: any): void {
        if (key === 'extendLeft' || key === 'extendRight') return;
        super.setSettingValue(key, value);
    }
}

// pane-widget.ts - _drawTrendLine() EXTENSION LOGIC:
if (extendRight && dx !== 0 && canvasWidth > 0) {
    const slope = dy / dx;
    endX = canvasWidth;
    endY = p2.y + slope * (canvasWidth - p2.x);
}
```

**Files Created:**
- `packages/charts/src/drawings/ray-drawing.ts`

**Files Modified:**
- `packages/charts/src/drawings/index.ts`
- `packages/charts/src/drawings/drawing-manager.ts`
- `packages/charts/src/gui/pane-widget.ts`

---

## G9. Phase 9: Info Line Drawing Tool (2025-12-27)

**Goal:** Add Info Line measurement tool that displays price change, bar count, time duration, and angle.

| # | Task | File Modified | Details |
|---|------|---------------|---------|
| 9.1 | **Create InfoLineDrawing Class** | `drawings/info-line-drawing.ts` | Extends `TrendLineDrawing`. Calculates price change %, bar count, time duration, and angle. |
| 9.2 | **Add DrawingType** | `drawings/drawing.ts` | Added `'infoLine'` to DrawingType union. |
| 9.3 | **Register in DrawingManager** | `drawings/drawing-manager.ts` | Added 3 switch cases: `startDrawing()`, `finishDrawing()`, `deserialize()`. |
| 9.4 | **Add Render Support** | `gui/pane-widget.ts` | Added `_drawInfoLine()` method with TradingView-style tooltip rendering. Calculates bar interval from chart data. |
| 9.5 | **Add to Toolbar Mapping** | `gui/chart-widget.ts` | Added `'infoLine': 'infoLine'` to `toolToMode` mapping. |
| 9.6 | **Settings Modal Title** | `gui/drawing-settings-modal.ts` | Added `case 'infoLine': return 'Info Line'` to `_getDrawingTitle()`. |
| 9.7 | **Color Picker Support** | `gui/drawing-settings-modal.ts` | Added `'ray'` and `'infoLine'` to `_createStyleTab()` condition for consistent color picker UI. |
| 9.8 | **Crosshair During Edit** | `gui/chart-widget.ts` | Added `setCrosshairPosition()` call inside `_isDraggingDrawing` block for precision positioning when editing. |
| 9.9 | **Export** | `drawings/index.ts` | Added `export * from './info-line-drawing'`. |

**Tooltip Display (TradingView Style):**

```
↕ +800.20 (0.90%)   ← Fiyat değişimi (yeşil/kırmızı)
↔ 46 bar, 1g 21sa   ← Bar sayısı ve zaman
∠ 18.36°            ← Açı
```

**Key Calculations:**

```typescript
// Bar count with endpoint inclusion (+1)
this._measurements.barCount = Math.round(timeDiffMs / barIntervalMs) + 1;

// Bar interval from chart data (not hardcoded)
const t1 = data[data.length - 2].time;
const t2 = data[data.length - 1].time;
barIntervalMs = Math.abs(t2 - t1);

// Turkish time format
if (days > 0) parts.push(`${days}g`);
if (hours > 0) parts.push(`${hours}sa`);
if (minutes > 0 && days === 0) parts.push(`${minutes}dk`);
```

**Files Created:**
- `packages/charts/src/drawings/info-line-drawing.ts`

**Files Modified:**
- `packages/charts/src/drawings/drawing.ts` - Added 'infoLine' to DrawingType
- `packages/charts/src/drawings/index.ts` - Added export
- `packages/charts/src/drawings/drawing-manager.ts` - 3 switch cases + finishDrawing condition
- `packages/charts/src/gui/pane-widget.ts` - Render method with tooltip
- `packages/charts/src/gui/chart-widget.ts` - toolToMode mapping + crosshair during edit
- `packages/charts/src/gui/drawing-settings-modal.ts` - Title + color picker support

---

## G10. Phase 10: Extended Line Drawing Tool (2025-12-27)

**Goal:** Add Extended Line that extends infinitely in BOTH directions (unlike Ray which only extends right).

| # | Task | File Modified | Details |
|---|------|---------------|---------|
| 10.1 | **Create ExtendedLineDrawing Class** | `drawings/extended-line-drawing.ts` | Extends `TrendLineDrawing` with `extendLeft=true`, `extendRight=true`. Hides Extend settings. |
| 10.2 | **Add DrawingType** | `drawings/drawing.ts` | `'extendedLine'` already existed in DrawingType union. |
| 10.3 | **Register in DrawingManager** | `drawings/drawing-manager.ts` | Added 3 switch cases: `startDrawing()`, `finishDrawing()`, `deserialize()`. |
| 10.4 | **Add Render Support** | `gui/pane-widget.ts` | Added `'extendedLine'` to TrendLine render condition (reuses `_drawTrendLine`). |
| 10.5 | **Toolbar Mapping** | `gui/chart-widget.ts` | Already existed in `toolToMode` mapping. |
| 10.6 | **Settings Modal Title** | `gui/drawing-settings-modal.ts` | Already existed in `_getDrawingTitle()`. |
| 10.7 | **Color Picker Support** | `gui/drawing-settings-modal.ts` | Added `'extendedLine'` to `_createStyleTab()` condition. |
| 10.8 | **Export** | `drawings/index.ts` | Added `export * from './extended-line-drawing'`. |

**Key Differences from Ray:**

| Property | Ray | Extended Line |
|----------|-----|---------------|
| `extendLeft` | false | **true** |
| `extendRight` | true | **true** |
| Direction | One way (right) | Both ways |

**Files Created:**
- `packages/charts/src/drawings/extended-line-drawing.ts`

**Files Modified:**
- `packages/charts/src/drawings/index.ts` - Added export
- `packages/charts/src/drawings/drawing-manager.ts` - 3 switch cases + finishDrawing condition
- `packages/charts/src/gui/pane-widget.ts` - Added to render condition
- `packages/charts/src/gui/drawing-settings-modal.ts` - Added to color picker condition

---

## G11. Phase 11: Trend Angle Drawing Tool (2025-12-27)

**Goal:** Add Trend Angle tool - a TrendLine that displays the angle measurement between two points.

| # | Task | File Modified | Details |
|---|------|---------------|---------|
| 11.1 | **Create TrendAngleDrawing Class** | `drawings/trend-angle-drawing.ts` | Extends `TrendLineDrawing`. Calculates angle via `calculateAngle()` and provides `getAngle()`. |
| 11.2 | **Add DrawingType** | `drawings/drawing.ts` | Added `'trendAngle'` to DrawingType union. |
| 11.3 | **Register in DrawingManager** | `drawings/drawing-manager.ts` | Added 3 switch cases: `startDrawing()`, `finishDrawing()`, `deserialize()`. |
| 11.4 | **Add Render Support** | `gui/pane-widget.ts` | Added `'trendAngle'` to TrendLine render condition (reuses `_drawTrendLine`). |
| 11.5 | **Toolbar Mapping** | `gui/chart-widget.ts` | Added `'trendAngle': 'trendAngle'` to `toolToMode` mapping. |
| 11.6 | **Settings Modal Title** | `gui/drawing-settings-modal.ts` | Added `case 'trendAngle': return 'Trend Angle'` to `_getDrawingTitle()`. |
| 11.7 | **Color Picker Support** | `gui/drawing-settings-modal.ts` | Added `'trendAngle'` to `_createStyleTab()` condition. |
| 11.8 | **Export** | `drawings/index.ts` | Added `export * from './trend-angle-drawing'`. |

**Angle Calculation:**

```typescript
// Angle from horizontal (0° = right, positive = up, negative = down)
calculateAngle(p1, p2): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    // Negate dy because canvas Y is inverted
    this._angle = Math.atan2(-dy, dx) * (180 / Math.PI);
    return this._angle;
}
```

**Files Created:**
- `packages/charts/src/drawings/trend-angle-drawing.ts`

**Files Modified:**
- `packages/charts/src/drawings/drawing.ts` - Added 'trendAngle' to DrawingType
- `packages/charts/src/drawings/index.ts` - Added export
- `packages/charts/src/drawings/drawing-manager.ts` - 3 switch cases + finishDrawing condition
- `packages/charts/src/gui/pane-widget.ts` - Added to render condition
- `packages/charts/src/gui/chart-widget.ts` - Added to toolToMode mapping
- `packages/charts/src/gui/drawing-settings-modal.ts` - Title + color picker support

---

## G12. Phase 12: Horizontal Ray & Keyboard Shortcuts (2025-12-27)

**Goal:** Add Horizontal Ray drawing tool and keyboard shortcuts for drawing management.

### 12.1 Horizontal Ray Drawing Tool

| # | Task | File Modified | Details |
|---|------|---------------|---------|
| 12.1.1 | **Create HorizontalRayDrawing Class** | `drawings/horizontal-ray-drawing.ts` | Single-point completion, extends to right edge. |
| 12.1.2 | **Add DrawingType** | `drawings/drawing.ts` | Added `'horizontalRay'` to DrawingType union. |
| 12.1.3 | **Register in DrawingManager** | `drawings/drawing-manager.ts` | Import + 2 switch cases: `startDrawing()`, `deserialize()`. |
| 12.1.4 | **Add Render Support** | `gui/pane-widget.ts` | Added render condition + `_drawHorizontalRay()` method. |
| 12.1.5 | **Toolbar Mapping** | `gui/chart-widget.ts` | Added `'horizontalRay': 'horizontalRay'` to `toolToMode`. |
| 12.1.6 | **Settings Modal** | `gui/drawing-settings-modal.ts` | Title + color picker support. |
| 12.1.7 | **Export** | `drawings/index.ts` | Added export. |

### 12.2 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Delete** / **Backspace** | Delete selected drawing |
| **Escape** | Deselect current drawing |

**Implementation:** `chart-widget.ts` - `_onKeyDown()` method (lines 1072-1095)

**Files Created:**
- `packages/charts/src/drawings/horizontal-ray-drawing.ts`

**Files Modified:**
- `packages/charts/src/drawings/drawing.ts` - Added 'horizontalRay'
- `packages/charts/src/drawings/index.ts` - Added export
- `packages/charts/src/drawings/drawing-manager.ts` - Import + 2 switch cases
- `packages/charts/src/gui/pane-widget.ts` - Render + _drawHorizontalRay method
- `packages/charts/src/gui/chart-widget.ts` - toolToMode + _onKeyDown for keyboard shortcuts
- `packages/charts/src/gui/drawing-settings-modal.ts` - Title + color picker

---

## G13. Future Roadmap

| Phase | Planned Features |
|-------|------------------|
| 13 | Parallel Channel, Rectangle, Ellipse |
| 14 | Magnet Mode, Snap to OHLC |
| 15 | Object Tree, Layer management |

---

**End of Documentation**
