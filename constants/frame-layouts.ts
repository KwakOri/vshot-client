/**
 * Frame Layout Presets - 인생네컷 스타일 (세로형)
 * DB-ready structure for custom photo/video frame compositions
 *
 * Base canvas size: 1200x1600 (3:4 세로 비율)
 * All positions use FRAME_LAYOUT constants for consistency
 */

import { FrameLayout } from '@/types';
import { FRAME_LAYOUT } from './constants';

/**
 * Calculate positions with gap and padding
 * Helper function for consistent spacing
 */
function calculateGridPositions(
  canvasWidth: number = 1200,
  canvasHeight: number = 1600,
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
 * Predefined frame layouts (인생네컷 스타일)
 * These can be synced with a database
 */
export const FRAME_LAYOUTS: FrameLayout[] = [
  // 1. Classic Life 4-Cut (2x2 Grid)
  {
    id: '2x2-grid-standard',
    label: '인생네컷 (2x2)',
    slotCount: 4,
    positions: calculateGridPositions(1200, 1600, 2, 2),
    canvasWidth: 1200,
    canvasHeight: 1600,
    thumbnailSrc: '/frames/2x2-grid.png',
    frameSrc: '', // No frame overlay
    description: '2x2 배열의 클래식 인생네컷 스타일',
    category: 'grid',
    isActive: true,
    sortOrder: 1,
    tags: ['grid', 'equal', 'standard', 'life4cut'],
    createdAt: new Date().toISOString(),
  },

  // 2. Vertical 4-Cut (1x4 Strip)
  {
    id: '1x4-vertical-strip',
    label: '세로 4단 (1x4)',
    slotCount: 4,
    positions: calculateGridPositions(1200, 1600, 1, 4),
    canvasWidth: 1200,
    canvasHeight: 1600,
    thumbnailSrc: '/frames/1x4-strip.png',
    frameSrc: '', // No frame overlay
    description: '세로로 4개가 나열된 스트립 레이아웃',
    category: 'grid',
    isActive: true,
    sortOrder: 2,
    tags: ['vertical', 'strip', 'sequential', 'life4cut'],
    createdAt: new Date().toISOString(),
  },

  // 3. Polaroid Single (Vertical)
  {
    id: 'polaroid-single',
    label: '폴라로이드 (단일)',
    slotCount: 1,
    positions: [
      {
        x: 100, // Centered with margin
        y: 200, // Top margin for polaroid effect
        width: 1000,
        height: 1200,
        zIndex: 0,
      },
    ],
    canvasWidth: 1200,
    canvasHeight: 1600,
    thumbnailSrc: '/frames/polaroid-single.png',
    frameSrc: '', // No frame overlay
    description: '단일 사진을 위한 세로형 폴라로이드 스타일',
    category: 'single',
    isActive: true,
    sortOrder: 3,
    tags: ['polaroid', 'single', 'classic', 'vintage'],
    createdAt: new Date().toISOString(),
  },

  // 4. Main + 3 Thumbnails (Top Main)
  {
    id: 'main-top-thumbnails',
    label: '메인 + 하단 3컷',
    slotCount: 4,
    positions: [
      // Main (large, top)
      {
        x: FRAME_LAYOUT.padding,
        y: FRAME_LAYOUT.padding,
        width: 1120,
        height: 840,
        zIndex: 0,
      },
      // Thumbnail 1 (bottom left)
      {
        x: FRAME_LAYOUT.padding,
        y: 840 + FRAME_LAYOUT.padding + FRAME_LAYOUT.gap,
        width: 360,
        height: 360,
        zIndex: 1,
      },
      // Thumbnail 2 (bottom center)
      {
        x: FRAME_LAYOUT.padding + 360 + FRAME_LAYOUT.gap,
        y: 840 + FRAME_LAYOUT.padding + FRAME_LAYOUT.gap,
        width: 360,
        height: 360,
        zIndex: 2,
      },
      // Thumbnail 3 (bottom right)
      {
        x: FRAME_LAYOUT.padding + 720 + FRAME_LAYOUT.gap * 2,
        y: 840 + FRAME_LAYOUT.padding + FRAME_LAYOUT.gap,
        width: 360,
        height: 360,
        zIndex: 3,
      },
    ],
    canvasWidth: 1200,
    canvasHeight: 1600,
    thumbnailSrc: '/frames/main-top-thumbnails.png',
    frameSrc: '', // No frame overlay
    description: '상단에 큰 메인 사진, 하단에 3개 섬네일',
    category: 'spotlight',
    isActive: true,
    sortOrder: 4,
    tags: ['main', 'spotlight', 'asymmetric'],
    createdAt: new Date().toISOString(),
  },

  // 5. Collage Style (Free positioning - Vertical)
  {
    id: 'collage-vertical',
    label: '세로 콜라주',
    slotCount: 4,
    positions: [
      // Top (wide)
      {
        x: FRAME_LAYOUT.padding,
        y: FRAME_LAYOUT.padding,
        width: 1120,
        height: 500,
        zIndex: 0,
      },
      // Middle left (tall)
      {
        x: FRAME_LAYOUT.padding,
        y: 500 + FRAME_LAYOUT.padding + FRAME_LAYOUT.gap,
        width: 550,
        height: 700,
        zIndex: 1,
      },
      // Middle right (tall)
      {
        x: 550 + FRAME_LAYOUT.padding + FRAME_LAYOUT.gap,
        y: 500 + FRAME_LAYOUT.padding + FRAME_LAYOUT.gap,
        width: 550,
        height: 700,
        zIndex: 2,
      },
      // Bottom (wide)
      {
        x: FRAME_LAYOUT.padding,
        y: 1200 + FRAME_LAYOUT.padding + FRAME_LAYOUT.gap * 2,
        width: 1120,
        height: 300,
        zIndex: 3,
      },
    ],
    canvasWidth: 1200,
    canvasHeight: 1600,
    thumbnailSrc: '/frames/collage-vertical.png',
    frameSrc: '', // No frame overlay
    description: '세로형 자유 배치 콜라주',
    category: 'collage',
    isActive: true,
    sortOrder: 5,
    tags: ['collage', 'free', 'creative', 'vertical'],
    createdAt: new Date().toISOString(),
  },

  // 6. Picture in Picture (Vertical)
  {
    id: 'picture-in-picture-vertical',
    label: 'PIP (세로형)',
    slotCount: 4,
    positions: [
      // Background (full)
      {
        x: FRAME_LAYOUT.padding,
        y: FRAME_LAYOUT.padding,
        width: 1120,
        height: 1520,
        zIndex: 0,
      },
      // PIP 1 (top right)
      {
        x: 1200 - 300 - FRAME_LAYOUT.padding - 20,
        y: FRAME_LAYOUT.padding + 20,
        width: 300,
        height: 400,
        zIndex: 1,
      },
      // PIP 2 (middle right)
      {
        x: 1200 - 300 - FRAME_LAYOUT.padding - 20,
        y: FRAME_LAYOUT.padding + 440,
        width: 300,
        height: 400,
        zIndex: 2,
      },
      // PIP 3 (bottom right)
      {
        x: 1200 - 300 - FRAME_LAYOUT.padding - 20,
        y: FRAME_LAYOUT.padding + 860,
        width: 300,
        height: 400,
        zIndex: 3,
      },
    ],
    canvasWidth: 1200,
    canvasHeight: 1600,
    thumbnailSrc: '/frames/picture-in-picture-vertical.png',
    frameSrc: '', // No frame overlay
    description: '세로형 화면 속 화면 레이아웃',
    category: 'overlay',
    isActive: true,
    sortOrder: 6,
    tags: ['pip', 'overlay', 'layered', 'vertical'],
    createdAt: new Date().toISOString(),
  },

  // 7. Quokka Frame (Custom Event Frame)
  {
    id: 'quokka-frame',
    label: '쿼카 프레임',
    slotCount: 4,
    positions: [
      // Slot 1 (top left)
      {
        x: 153,
        y: 973,
        width: 1155,
        height: 1375,
        zIndex: 0,
      },
      // Slot 2 (bottom left)
      {
        x: 153,
        y: 2420,
        width: 1155,
        height: 1375,
        zIndex: 1,
      },
      // Slot 3 (top right)
      {
        x: 1446,
        y: 287,
        width: 1155,
        height: 1375,
        zIndex: 2,
      },
      // Slot 4 (bottom right)
      {
        x: 1446,
        y: 1734,
        width: 1155,
        height: 1375,
        zIndex: 3,
      },
    ],
    canvasWidth: 2731,
    canvasHeight: 4096,
    thumbnailSrc: '/sample-frame.png',
    frameSrc: '/sample-frame.png', // Quokka frame overlay
    description: '쿼카 테마 커스텀 이벤트 프레임',
    category: 'event',
    isActive: true,
    sortOrder: 7,
    tags: ['quokka', 'event', 'custom', 'themed'],
    createdAt: new Date().toISOString(),
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
