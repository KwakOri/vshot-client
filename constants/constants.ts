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
