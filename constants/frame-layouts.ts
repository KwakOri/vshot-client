/**
 * Frame Layout Presets - 2:3 Vertical Ratio (3000x4500)
 * All frames use consistent 2:3 aspect ratio for photos
 * Simplified to 4-cut and 1-cut layouts only
 */

import { FrameLayout } from '@/types';
import { FRAME_LAYOUT, RESOLUTION } from './constants';

/**
 * Calculate positions with gap and padding for 2:3 ratio canvas
 * Helper function for consistent spacing
 */
function calculateGridPositions(
  canvasWidth: number = RESOLUTION.PHOTO_WIDTH,
  canvasHeight: number = RESOLUTION.PHOTO_HEIGHT,
  cols: number = 2,
  rows: number = 2
) {
  const { gap, padding } = FRAME_LAYOUT;

  const availableWidth = canvasWidth - (padding * 2) - (gap * (cols - 1));
  const availableHeight = canvasHeight - (padding * 2) - (gap * (rows - 1));

  const cellWidth = Math.floor(availableWidth / cols);
  const cellHeight = Math.floor(availableHeight / rows);

  const positions = [];
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
 * Predefined frame layouts
 * Only 4-cut and 1-cut (additional layouts can be added later)
 */
export const FRAME_LAYOUTS: FrameLayout[] = [
  // 1. Classic Life 4-Cut (2x2 Grid)
  {
    id: '4cut-grid',
    label: '인생네컷 (2x2)',
    slotCount: 4,
    positions: calculateGridPositions(RESOLUTION.PHOTO_WIDTH, RESOLUTION.PHOTO_HEIGHT, 2, 2),
    canvasWidth: RESOLUTION.PHOTO_WIDTH,
    canvasHeight: RESOLUTION.PHOTO_HEIGHT,
    thumbnailSrc: '/frames/4cut-grid.png',
    frameSrc: '', // No frame overlay
    description: '2x2 배열의 클래식 인생네컷 스타일',
    category: 'grid',
    isActive: true,
    sortOrder: 1,
    tags: ['grid', 'equal', 'standard', 'life4cut'],
    createdAt: new Date().toISOString(),
    recommendedCaptureWidth: RESOLUTION.PHOTO_WIDTH,
    recommendedCaptureHeight: RESOLUTION.PHOTO_HEIGHT,
  },

  // 2. Polaroid Single
  {
    id: '1cut-polaroid',
    label: '폴라로이드 (단일)',
    slotCount: 1,
    positions: [
      {
        x: FRAME_LAYOUT.padding,
        y: FRAME_LAYOUT.padding,
        width: RESOLUTION.PHOTO_WIDTH - (FRAME_LAYOUT.padding * 2),
        height: RESOLUTION.PHOTO_HEIGHT - (FRAME_LAYOUT.padding * 2),
        zIndex: 0,
      },
    ],
    canvasWidth: RESOLUTION.PHOTO_WIDTH,
    canvasHeight: RESOLUTION.PHOTO_HEIGHT,
    thumbnailSrc: '/frames/1cut-polaroid.png',
    frameSrc: '', // No frame overlay
    description: '단일 사진을 위한 세로형 폴라로이드 스타일',
    category: 'single',
    isActive: true,
    sortOrder: 2,
    tags: ['polaroid', 'single', 'classic'],
    createdAt: new Date().toISOString(),
    recommendedCaptureWidth: RESOLUTION.PHOTO_WIDTH,
    recommendedCaptureHeight: RESOLUTION.PHOTO_HEIGHT,
  },

  // 3. Quoka Frame
  {
    id: '4cut-quoka',
    label: '쿼카 4컷',
    slotCount: 4,
    positions: [
      {
        x: 153,
        y: 1068,
        width: 1280,
        height: 1520,
        zIndex: 0,
      },
      {
        x: 153,
        y: 2673,
        width: 1280,
        height: 1520,
        zIndex: 1,
      },
      {
        x: 1587,
        y: 307,
        width: 1280,
        height: 1520,
        zIndex: 2,
      },
      {
        x: 1587,
        y: 1912,
        width: 1280,
        height: 1520,
        zIndex: 3,
      },
    ],
    canvasWidth: 3000,
    canvasHeight: 4500,
    thumbnailSrc: '/frames/quoka.png',
    frameSrc: '/frames/quoka.png',
    description: '쿼카 테마의 4컷 프레임',
    category: 'themed',
    isActive: true,
    sortOrder: 3,
    tags: ['quoka', 'themed', '4cut', 'custom'],
    createdAt: new Date().toISOString(),
    recommendedCaptureWidth: 1280,
    recommendedCaptureHeight: 1520,
  },
];

/**
 * Get layout by ID
 */
export function getLayoutById(id: string): FrameLayout | undefined {
  return FRAME_LAYOUTS.find(layout => layout.id === id);
}

/**
 * Get layouts by category
 */
export function getLayoutsByCategory(category: string): FrameLayout[] {
  return FRAME_LAYOUTS.filter(layout => layout.category === category && layout.isActive);
}

/**
 * Get all active layouts sorted by sortOrder
 */
export function getActiveLayouts(): FrameLayout[] {
  return FRAME_LAYOUTS
    .filter(layout => layout.isActive)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

/**
 * Search layouts by tag
 */
export function searchLayoutsByTag(tag: string): FrameLayout[] {
  return FRAME_LAYOUTS.filter(layout =>
    layout.isActive && layout.tags?.includes(tag.toLowerCase())
  );
}

/**
 * Default layout (fallback)
 */
export const DEFAULT_LAYOUT = FRAME_LAYOUTS[0]; // 2x2 grid (인생네컷)
