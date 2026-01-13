# Orderbook Heatmap Algorithm: KDE & Stability Analysis

## 1. Overview
The Orderbook Heatmap visualizer uses a **1D Kernel Density Estimation (KDE)** algorithm layered with a **Liquidity Stability (Aging)** analysis. This approach solves the limitations of traditional bucket/histogram methods (e.g., blocky visuals, zoom artifacts) by representing liquidity as a continuous pressure field rather than discrete blocks.

## 2. Core Rendering Algorithm (1D KDE)

### Gaussian Splatting
Each limit order in the orderbook is treated not as a single point, but as a "Gaussian Kernel" (a bell curve) centered at its price.
- **Input:** Order Price ($P$), Order Volume ($V$).
- **Kernel:** $K(y) = e^{-0.5 \cdot (\frac{y - P}{\sigma})^2}$
- **Splatter:** For every pixel $y$ in the viewport, we accumulate the weighted volume:
  $$Density(y) = \sum_{orders} Volume_{order} \cdot K(y)$$

### Parameters
- **Bandwidth ($\sigma$):** Controls the smoothness. We use `4px`. Higher values merge orders into clearer "walls"; lower values show more noise.
- **Accumulation Buffer:** A `Float32Array` matching the canvas height is used to accumulate densities, ensuring $O(N)$ performance where $N$ is the number of orders.

---

## 3. Stability Analysis (Liquidity Aging)

To detect potential **Spoofing** (fake orders) vs. **Icebergs/Real Walls**, the renderer tracks the "Age" of every price level.

### Logic
1.  **Map Tracking:** A `Map<PriceKey, Timestamp>` tracks when a specific price level first appeared in the orderbook.
2.  **Age Calculation:**
    $$Age = CurrentTime - InitialTimestamp$$
3.  **Weighted Age:** During the KDE accumulation, we also accumulate a weighted age for each pixel:
    $$PixelAge(y) = \frac{\sum (Age_{order} \cdot Weight)}{\sum Weight}$$

---

## 4. Visual Language & Coloring Logic

The visual output combines **Density** (How big?) and **Stability** (How old?) to create a heatmap that mimics a professional trading terminal.

| Visual Style | Color Code | Condition | Meaning |
| :--- | :--- | :--- | :--- |
| **Neon Yellow / White** | `#ffff00` mixed with white | **High Density** + **Fresh** (<9s) | **SPOOF RISK / IMPULSE.** A massive order just appeared. It might be fake (spoof) or a reaction to news. Proceed with caution. |
| **Solid Purple** | `#d500f9` | **High Density** (>64%) + **Stable** (>21s) | **REAL WALL.** This liquidity has been sitting for a while (Stable). It is likely a genuine support/resistance level. |
| **Cyan / Red** | `#00d4aa` / `#ff6b6b` | Normal Density | **STANDARD LIQUIDITY.** Normal market depth. |

### Decision Thresholds
*   **Highlight Threshold:** `Density > 95%` of Global Max (Trigger for Yellow).
*   **Stable Wall Threshold:** `Density > 80%` of Visual Max AND `Stability > 70%` (Trigger for Purple).
*   **Freshness Threshold:** `Stability < 30%` (Trigger for Whitish/Neon mix).

---

## 5. Normalization & Zoom Consistency

To prevent the heatmap from flashing colors wildly when zooming in/out:
- **Global Max Density:** We track the maximum volume seen in the *entire* orderbook history (with a slow decay factor).
- **Benefit:** Scaling is consistent. A "Red" wall remains "Red" even if you zoom in on it, unless the relative liquidity changes globally.

---

## 6. Implementation Location

- **File:** `packages/charts/src/renderers/orderbook-heatmap-renderer.ts`
- **Class:** `OrderbookHeatmapRenderer`
