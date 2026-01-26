import type { FrameLayout } from '@/types';

/**
 * Fixed Resolution Constants
 * All frames use 2:3 aspect ratio (vertical)
 */
export const RESOLUTION = {
  /**
   * Photo capture resolution (high quality)
   * Used for final photo frames
   */
  PHOTO_WIDTH: 3000,
  PHOTO_HEIGHT: 4500,

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
 * Frame Layout Constants
 * Shared between photo frame generation and video composition
 * for consistent design across all outputs
 */

export const FRAME_LAYOUT = {
  /**
   * Gap between individual photos/videos in the grid (px)
   */
  gap: 20,

  /**
   * Padding around the entire frame (px)
   */
  padding: 40,

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
 * Scale a photo-resolution layout (3000×4500) to video resolution (720×1080)
 * for use with video composition (WebGL/Canvas).
 */
export function scaleLayoutForVideo(layout: FrameLayout): FrameLayout {
  const scale = RESOLUTION.VIDEO_WIDTH / layout.canvasWidth;
  if (scale >= 1) return layout;
  return {
    ...layout,
    canvasWidth: RESOLUTION.VIDEO_WIDTH,
    canvasHeight: RESOLUTION.VIDEO_HEIGHT,
    positions: layout.positions.map((pos) => ({
      ...pos,
      x: Math.round(pos.x * scale),
      y: Math.round(pos.y * scale),
      width: Math.round(pos.width * scale),
      height: Math.round(pos.height * scale),
    })),
  };
}

/**
 * Calculate grid cell dimensions with gap and padding
 */
export function calculateGridCellDimensions(
  totalWidth: number,
  totalHeight: number,
  gap: number = FRAME_LAYOUT.gap,
  padding: number = FRAME_LAYOUT.padding
) {
  // Calculate available space after removing padding
  const availableWidth = totalWidth - (padding * 2);
  const availableHeight = totalHeight - (padding * 2);

  // Calculate cell size (2x2 grid with gap between cells)
  const cellWidth = Math.floor((availableWidth - gap) / 2);
  const cellHeight = Math.floor((availableHeight - gap) / 2);

  return {
    cellWidth,
    cellHeight,
    // Grid positions for 2x2 layout
    positions: [
      { x: padding, y: padding },                           // Top-left
      { x: padding + cellWidth + gap, y: padding },         // Top-right
      { x: padding, y: padding + cellHeight + gap },        // Bottom-left
      { x: padding + cellWidth + gap, y: padding + cellHeight + gap } // Bottom-right
    ]
  };
}
