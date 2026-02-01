import type { FrameLayout, FrameSlot, FrameSlotRatio } from '@/types';

/**
 * Fixed Resolution Constants
 * All frames use 2:3 aspect ratio (vertical)
 */
export const RESOLUTION = {
  /**
   * Photo capture resolution (high quality)
   * Used for final photo frames
   * 웹캠 기반이므로 1600x2400으로 설정 (2:3 비율 유지)
   */
  PHOTO_WIDTH: 1600,
  PHOTO_HEIGHT: 2400,

  /**
   * Video composition resolution (MediaRecorder safe)
   * Used for video frames (maintains 2:3 ratio)
   */
  VIDEO_WIDTH: 720,
  VIDEO_HEIGHT: 1080,

  /**
   * Aspect ratio (width:height)
   */
  ASPECT_RATIO: 2 / 3,
} as const;

/**
 * Frame Layout Constants (ratio-based, 0-1)
 * Resolution-independent settings
 */
export const FRAME_LAYOUT_RATIO = {
  /**
   * Gap between individual photos/videos as ratio of canvas width
   */
  gap: 0.0125, // 1.25% of width (20px at 1600px = 0.0125)

  /**
   * Padding around the entire frame as ratio of canvas width
   */
  padding: 0.025, // 2.5% of width (40px at 1600px = 0.025)
} as const;

/**
 * Frame Layout Constants (pixel-based, for backwards compatibility)
 * Calculated from RESOLUTION and FRAME_LAYOUT_RATIO
 */
export const FRAME_LAYOUT = {
  /**
   * Gap between individual photos/videos in the grid (px)
   */
  gap: Math.round(FRAME_LAYOUT_RATIO.gap * RESOLUTION.PHOTO_WIDTH),

  /**
   * Padding around the entire frame (px)
   */
  padding: Math.round(FRAME_LAYOUT_RATIO.padding * RESOLUTION.PHOTO_WIDTH),

  /**
   * Border color for individual frames (CSS color)
   */
  borderColor: '#ffffff',

  /**
   * Border width for individual frames (px)
   */
  borderWidth: 4,

  /**
   * Background color for the frame (CSS color)
   */
  backgroundColor: '#1a1a2e',

  /**
   * Font settings for frame number indicators
   */
  font: {
    size: 24,
    family: 'sans-serif',
    weight: 'bold',
    color: '#ffffff',
    offsetX: 16,
    offsetY: 40,
  },
} as const;

/**
 * Convert ratio-based slot positions to pixel-based positions
 * @param slots - Array of ratio-based slot definitions (0-1)
 * @param width - Target canvas width in pixels
 * @param height - Target canvas height in pixels
 * @returns Array of pixel-based slot positions
 */
export function resolveSlotPositions(
  slots: FrameSlotRatio[],
  width: number,
  height: number
): FrameSlot[] {
  // Round to even numbers for video encoding compatibility (yuv420p)
  const toEven = (n: number) => {
    const r = Math.round(n);
    return r % 2 === 0 ? r : r - 1;
  };

  return slots.map((slot) => ({
    x: Math.round(slot.x * width),
    y: Math.round(slot.y * height),
    width: toEven(slot.width * width),
    height: toEven(slot.height * height),
    zIndex: slot.zIndex ?? 0,
  }));
}

/**
 * Calculate grid positions as ratios for N columns x M rows layout
 * @param cols - Number of columns
 * @param rows - Number of rows
 * @param padding - Padding as ratio (default from FRAME_LAYOUT_RATIO)
 * @param gap - Gap as ratio (default from FRAME_LAYOUT_RATIO)
 * @returns Array of ratio-based slot positions
 */
export function calculateGridRatios(
  cols: number = 2,
  rows: number = 2,
  padding: number = FRAME_LAYOUT_RATIO.padding,
  gap: number = FRAME_LAYOUT_RATIO.gap
): FrameSlotRatio[] {
  // Calculate cell size as ratio
  const availableWidth = 1 - (padding * 2) - (gap * (cols - 1));
  const availableHeight = 1 - (padding * 2) - (gap * (rows - 1));
  const cellWidth = availableWidth / cols;
  const cellHeight = availableHeight / rows;

  const positions: FrameSlotRatio[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      positions.push({
        x: padding + col * (cellWidth + gap),
        y: padding + row * (cellHeight + gap),
        width: cellWidth,
        height: cellHeight,
        zIndex: row * cols + col,
      });
    }
  }

  return positions;
}

/**
 * Single slot that fills the canvas with padding
 */
export function calculateSingleSlotRatio(
  padding: number = FRAME_LAYOUT_RATIO.padding
): FrameSlotRatio[] {
  return [{
    x: padding,
    y: padding,
    width: 1 - (padding * 2),
    height: 1 - (padding * 2),
    zIndex: 0,
  }];
}

/**
 * Scale a layout to video resolution (720×1080)
 * for use with video composition (WebGL/Canvas).
 */
export function scaleLayoutForVideo(layout: FrameLayout): FrameLayout {
  const scale = RESOLUTION.VIDEO_WIDTH / layout.canvasWidth;
  if (scale >= 1) return layout;

  const toEven = (n: number) => {
    const r = Math.round(n);
    return r % 2 === 0 ? r : r - 1;
  };

  return {
    ...layout,
    canvasWidth: RESOLUTION.VIDEO_WIDTH,
    canvasHeight: RESOLUTION.VIDEO_HEIGHT,
    positions: layout.positions.map((pos) => ({
      ...pos,
      x: Math.round(pos.x * scale),
      y: Math.round(pos.y * scale),
      width: toEven(pos.width * scale),
      height: toEven(pos.height * scale),
    })),
  };
}

/**
 * Calculate grid cell dimensions with gap and padding (legacy, pixel-based)
 * @deprecated Use calculateGridRatios + resolveSlotPositions instead
 */
export function calculateGridCellDimensions(
  totalWidth: number,
  totalHeight: number,
  gap: number = FRAME_LAYOUT.gap,
  padding: number = FRAME_LAYOUT.padding
) {
  const availableWidth = totalWidth - (padding * 2);
  const availableHeight = totalHeight - (padding * 2);

  const cellWidth = Math.floor((availableWidth - gap) / 2);
  const cellHeight = Math.floor((availableHeight - gap) / 2);

  return {
    cellWidth,
    cellHeight,
    positions: [
      { x: padding, y: padding },
      { x: padding + cellWidth + gap, y: padding },
      { x: padding, y: padding + cellHeight + gap },
      { x: padding + cellWidth + gap, y: padding + cellHeight + gap }
    ]
  };
}
