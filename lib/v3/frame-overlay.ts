import { FrameLayout } from '@/types';

/**
 * Frame Overlay Utility for V3
 *
 * Draws frame preview on canvas during capture countdown
 * to help users align their shot with the final frame
 */

const frameImageCache = new Map<string, HTMLImageElement>();

/**
 * Preload frame image for faster rendering
 */
export async function preloadFrameImage(frameSrc: string): Promise<HTMLImageElement> {
  // Check cache
  if (frameImageCache.has(frameSrc)) {
    return frameImageCache.get(frameSrc)!;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      frameImageCache.set(frameSrc, img);
      resolve(img);
    };

    img.onerror = () => {
      reject(new Error(`Failed to load frame image: ${frameSrc}`));
    };

    img.src = frameSrc;
  });
}

/**
 * Draw frame overlay on canvas
 *
 * @param ctx Canvas rendering context
 * @param layout Frame layout configuration
 * @param opacity Overlay opacity (0-1), default 0.3
 */
export async function drawFrameOverlay(
  ctx: CanvasRenderingContext2D,
  layout: FrameLayout,
  opacity: number = 0.3
): Promise<void> {
  try {
    // Load frame image
    const frameImage = await preloadFrameImage(layout.frameSrc);

    // Save current context state
    ctx.save();

    // Set opacity
    ctx.globalAlpha = opacity;

    // Draw frame at canvas size
    const { width, height } = ctx.canvas;
    ctx.drawImage(frameImage, 0, 0, width, height);

    // Restore context state
    ctx.restore();
  } catch (error) {
    console.error('[FrameOverlay] Failed to draw frame overlay:', error);
    throw error;
  }
}

/**
 * Draw frame slot guides (optional - for debugging)
 *
 * Draws rectangles showing where photos will be placed
 */
export function drawFrameSlotGuides(
  ctx: CanvasRenderingContext2D,
  layout: FrameLayout,
  color: string = '#FC712B',
  lineWidth: number = 2
): void {
  ctx.save();

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([10, 5]); // Dashed line

  for (const slot of layout.positions) {
    ctx.strokeRect(slot.x, slot.y, slot.width, slot.height);
  }

  ctx.restore();
}

/**
 * Clear frame cache (call when switching frames)
 */
export function clearFrameCache(): void {
  frameImageCache.clear();
}

/**
 * Draw frame overlay with slot highlights
 *
 * Combines frame overlay + slot guides for better user guidance
 */
export async function drawFramePreview(
  ctx: CanvasRenderingContext2D,
  layout: FrameLayout,
  options: {
    frameOpacity?: number;
    showSlotGuides?: boolean;
    slotColor?: string;
    slotLineWidth?: number;
  } = {}
): Promise<void> {
  const {
    frameOpacity = 0.3,
    showSlotGuides = false,
    slotColor = '#FC712B',
    slotLineWidth = 2,
  } = options;

  // Draw frame overlay
  await drawFrameOverlay(ctx, layout, frameOpacity);

  // Optionally draw slot guides
  if (showSlotGuides) {
    drawFrameSlotGuides(ctx, layout, slotColor, slotLineWidth);
  }
}

/**
 * Animate frame overlay fade-in
 *
 * Smoothly fades in frame overlay over specified duration
 */
export async function animateFrameOverlayIn(
  ctx: CanvasRenderingContext2D,
  layout: FrameLayout,
  targetOpacity: number = 0.3,
  durationMs: number = 500
): Promise<void> {
  const startTime = Date.now();
  const frameImage = await preloadFrameImage(layout.frameSrc);

  return new Promise((resolve) => {
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const currentOpacity = progress * targetOpacity;

      // Draw frame with current opacity
      ctx.save();
      ctx.globalAlpha = currentOpacity;
      ctx.drawImage(frameImage, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        resolve();
      }
    };

    animate();
  });
}

/**
 * Animate frame overlay fade-out
 *
 * Smoothly fades out frame overlay over specified duration
 *
 * IMPORTANT: This function should be used on a SEPARATE overlay canvas,
 * not the main composite canvas. If used on composite canvas, it will
 * clear the video content.
 *
 * For composite canvas, use a separate overlay layer:
 * - Create a dedicated canvas for frame overlay
 * - Position it absolutely over the composite canvas
 * - Use CSS pointer-events: none
 */
export async function animateFrameOverlayOut(
  ctx: CanvasRenderingContext2D,
  layout: FrameLayout,
  startOpacity: number = 0.3,
  durationMs: number = 500,
  clearCanvas: boolean = true // Set to false if using on composite canvas
): Promise<void> {
  const startTime = Date.now();
  const frameImage = await preloadFrameImage(layout.frameSrc);

  return new Promise((resolve) => {
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const currentOpacity = startOpacity * (1 - progress);

      // Only clear if on dedicated overlay canvas
      if (clearCanvas) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }

      ctx.save();
      ctx.globalAlpha = currentOpacity;
      ctx.drawImage(frameImage, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        if (clearCanvas) {
          ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        }
        resolve();
      }
    };

    animate();
  });
}
