/**
 * Chart Widget Context Menu Actions
 * Handlers for context menu (right-click) operations
 */

import { ChartModel } from '../../model/chart-model';
import { PaneWidget } from '../pane-widget';
import { PriceAxisWidget } from '../price-axis-widget';
import { TimeAxisWidget } from '../time-axis-widget';

/**
 * Handle settings context menu action
 */
export function handleContextSettings(): void {
    console.log('📋 Settings clicked - Modal will be implemented');
    alert('Settings feature coming soon!');
}

/**
 * Handle copy price context menu action
 */
export function handleContextCopyPrice(model: ChartModel): void {
    const priceScale = model.rightPriceScale;
    const priceRange = priceScale.priceRange;
    if (!priceRange) return;

    const crosshair = model.crosshairPosition;
    let price = 0;
    if (crosshair && crosshair.visible) {
        price = priceScale.coordinateToPrice(crosshair.y as any);
    } else {
        price = (priceRange.min + priceRange.max) / 2;
    }

    const formattedPrice = price.toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2
    });

    navigator.clipboard.writeText(formattedPrice).then(() => {
        console.log(`📋 Copied price: ${formattedPrice}`);
    }).catch(err => {
        console.warn('Copy failed:', err);
    });
}

/**
 * Handle screenshot context menu action
 */
export function handleContextScreenshot(
    model: ChartModel,
    paneWidget: PaneWidget | null,
    priceAxisWidget: PriceAxisWidget | null,
    timeAxisWidget: TimeAxisWidget | null,
    indicatorPanes?: { canvas: HTMLCanvasElement | null; height: number }[]
): void {
    const mainCanvas = paneWidget?.canvas;
    if (!mainCanvas) return;

    const priceCanvas = priceAxisWidget?.canvas;
    const timeCanvas = timeAxisWidget?.canvas;

    // Get DPR for proper scaling
    const dpr = window.devicePixelRatio || 1;

    // Calculate actual display dimensions (CSS pixels)
    const mainWidth = mainCanvas.width / dpr;
    const mainHeight = mainCanvas.height / dpr;
    const priceWidth = priceCanvas ? priceCanvas.width / dpr : 0;
    const timeWidth = timeCanvas ? timeCanvas.width / dpr : 0;
    const timeHeight = timeCanvas ? timeCanvas.height / dpr : 0;

    // Calculate total indicator panes height
    let indicatorPanesHeight = 0;
    if (indicatorPanes) {
        for (const pane of indicatorPanes) {
            if (pane.canvas) {
                indicatorPanesHeight += pane.canvas.height / dpr;
            }
        }
    }

    // Total screenshot dimensions (CSS pixels)
    const totalWidth = mainWidth + priceWidth;
    const totalHeight = mainHeight + indicatorPanesHeight + timeHeight;

    // Create combined canvas at 1x scale (for clean output)
    const combinedCanvas = document.createElement('canvas');
    combinedCanvas.width = totalWidth;
    combinedCanvas.height = totalHeight;
    const ctx = combinedCanvas.getContext('2d');
    if (!ctx) return;

    // Fill background
    ctx.fillStyle = model.options.layout.backgroundColor;
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    // Draw main chart (scale down from DPR canvas to 1x)
    ctx.drawImage(
        mainCanvas,
        0, 0, mainCanvas.width, mainCanvas.height,  // source (full DPR canvas)
        0, 0, mainWidth, mainHeight                  // destination (1x scale)
    );

    // Draw price axis (next to main chart)
    if (priceCanvas) {
        ctx.drawImage(
            priceCanvas,
            0, 0, priceCanvas.width, priceCanvas.height,
            mainWidth, 0, priceWidth, mainHeight
        );
    }

    // Draw indicator panes (below main chart)
    let currentY = mainHeight;
    if (indicatorPanes) {
        for (const pane of indicatorPanes) {
            if (pane.canvas) {
                const paneHeight = pane.canvas.height / dpr;
                const paneWidth = pane.canvas.width / dpr;

                // Draw indicator pane
                ctx.drawImage(
                    pane.canvas,
                    0, 0, pane.canvas.width, pane.canvas.height,
                    0, currentY, paneWidth, paneHeight
                );

                currentY += paneHeight;
            }
        }
    }

    // Draw time axis (at the bottom)
    if (timeCanvas) {
        ctx.drawImage(
            timeCanvas,
            0, 0, timeCanvas.width, timeCanvas.height,
            0, currentY, timeWidth, timeHeight
        );
    }

    // Download
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `chart-screenshot-${timestamp}.png`;
    link.href = combinedCanvas.toDataURL('image/png');
    link.click();
}

/**
 * Handle fullscreen context menu action
 */
export function handleContextFullscreen(element: HTMLElement | null): void {
    if (!element) return;

    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        element.requestFullscreen().catch(err => {
            console.warn('Fullscreen failed:', err);
        });
    }
}

/**
 * Handle reset chart context menu action
 */
export function handleContextResetChart(model: ChartModel): void {
    model.timeScale.setBarSpacing(8);
    model.timeScale.setRightOffset(10);
    model.timeScale.scrollToPosition(0, false);
    model.rightPriceScale.setAutoScale(true);
    model.rightPriceScale.setPriceRange(null);
    model.fullUpdate();
}
