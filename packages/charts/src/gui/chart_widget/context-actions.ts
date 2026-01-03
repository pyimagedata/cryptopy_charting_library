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
    width: number,
    height: number,
    paneWidget: PaneWidget | null,
    priceAxisWidget: PriceAxisWidget | null,
    timeAxisWidget: TimeAxisWidget | null
): void {
    const canvas = paneWidget?.canvas;
    if (!canvas) return;

    const combinedCanvas = document.createElement('canvas');
    combinedCanvas.width = width;
    combinedCanvas.height = height;
    const ctx = combinedCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = model.options.layout.backgroundColor;
    ctx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);

    ctx.drawImage(canvas, 0, 0);

    const priceCanvas = priceAxisWidget?.canvas;
    if (priceCanvas) {
        ctx.drawImage(priceCanvas, canvas.width, 0);
    }

    const timeCanvas = timeAxisWidget?.canvas;
    if (timeCanvas) {
        ctx.drawImage(timeCanvas, 0, canvas.height);
    }

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
