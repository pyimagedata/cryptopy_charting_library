import { BitmapCoordinatesScope } from './watermark-renderer';

/**
 * Permanent branding renderer for the "cryptopy" logo.
 * This is hardcoded and intentionally separate from user-configurable watermarks.
 */
export class BrandingRenderer {
    /**
     * Draw the branding logo on the canvas
     * @param scope Rendering scope
     */
    draw(scope: BitmapCoordinatesScope): void {
        const { context: ctx, mediaSize, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope;
        const { height } = mediaSize;

        ctx.save();

        // Logo text
        const text = 'cryptopy';

        // Use a premium font stack
        const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
        const fontSize = 24 * vpr;

        ctx.font = `bold ${fontSize}px ${fontFamily}`;

        // Measure text for proper positioning if needed, but we'll use fixed padding
        const padding = 24;
        const x = padding * hpr;
        const y = (height - padding) * vpr;

        // Draw subtle shadow/glow for better visibility on any background
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 4 * vpr;
        ctx.shadowOffsetX = 1 * hpr;
        ctx.shadowOffsetY = 1 * vpr;

        // Semi-transparent white for a "ghosted" premium watermark look
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'left';

        // Draw the logo
        ctx.fillText(text, x, y);

        ctx.restore();
    }
}
