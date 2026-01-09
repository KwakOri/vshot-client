/**
 * Frame Layout Presets
 * DB-ready structure for custom photo/video frame compositions
 *
 * Base canvas size: 1920x1080 (16:9)
 * All positions use FRAME_LAYOUT constants for consistency
 */

import { FrameLayout } from '@/types';
import { FRAME_LAYOUT } from './constants';

/**
 * Calculate positions with gap and padding
 * Helper function for consistent spacing
 */
function calculateGridPositions(
  canvasWidth: number = 1920,
  canvasHeight: number = 1080,
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
 * These can be synced with a database
 */
export const FRAME_LAYOUTS: FrameLayout[] = [
  // 1. Standard 2x2 Grid
  {
    id: '2x2-grid-standard',
    label: '2x2 균등 그리드',
    slotCount: 4,
    positions: calculateGridPositions(1920, 1080, 2, 2),
    thumbnailSrc: '/frames/2x2-grid.png',
    description: '4개의 동일한 크기 칸으로 구성된 기본 레이아웃',
    category: 'grid',
    isActive: true,
    sortOrder: 1,
    tags: ['grid', 'equal', 'standard'],
    createdAt: new Date().toISOString(),
  },

  // 2. Main with Thumbnails (Right)
  {
    id: 'main-thumbnails-right',
    label: '메인 + 우측 섬네일',
    slotCount: 4,
    positions: [
      // Main (large, left side)
      {
        x: FRAME_LAYOUT.padding,
        y: FRAME_LAYOUT.padding,
        width: 1200,
        height: 1000,
        zIndex: 0,
      },
      // Thumbnail 1 (top right)
      {
        x: 1200 + FRAME_LAYOUT.padding + FRAME_LAYOUT.gap,
        y: FRAME_LAYOUT.padding,
        width: 640,
        height: 310,
        zIndex: 1,
      },
      // Thumbnail 2 (middle right)
      {
        x: 1200 + FRAME_LAYOUT.padding + FRAME_LAYOUT.gap,
        y: FRAME_LAYOUT.padding + 310 + FRAME_LAYOUT.gap,
        width: 640,
        height: 310,
        zIndex: 2,
      },
      // Thumbnail 3 (bottom right)
      {
        x: 1200 + FRAME_LAYOUT.padding + FRAME_LAYOUT.gap,
        y: FRAME_LAYOUT.padding + 310 * 2 + FRAME_LAYOUT.gap * 2,
        width: 640,
        height: 310,
        zIndex: 3,
      },
    ],
    thumbnailSrc: '/frames/main-thumbnails-right.png',
    description: '큰 메인 이미지와 우측의 3개 섬네일',
    category: 'spotlight',
    isActive: true,
    sortOrder: 2,
    tags: ['main', 'spotlight', 'asymmetric'],
    createdAt: new Date().toISOString(),
  },

  // 3. Spotlight Top
  {
    id: 'spotlight-top',
    label: '상단 스포트라이트',
    slotCount: 4,
    positions: [
      // Spotlight (large, top)
      {
        x: FRAME_LAYOUT.padding,
        y: FRAME_LAYOUT.padding,
        width: 1840,
        height: 600,
        zIndex: 0,
      },
      // Thumbnail 1 (bottom left)
      {
        x: FRAME_LAYOUT.padding,
        y: 600 + FRAME_LAYOUT.padding + FRAME_LAYOUT.gap,
        width: 600,
        height: 400,
        zIndex: 1,
      },
      // Thumbnail 2 (bottom center)
      {
        x: FRAME_LAYOUT.padding + 600 + FRAME_LAYOUT.gap,
        y: 600 + FRAME_LAYOUT.padding + FRAME_LAYOUT.gap,
        width: 600,
        height: 400,
        zIndex: 2,
      },
      // Thumbnail 3 (bottom right)
      {
        x: FRAME_LAYOUT.padding + 1200 + FRAME_LAYOUT.gap * 2,
        y: 600 + FRAME_LAYOUT.padding + FRAME_LAYOUT.gap,
        width: 600,
        height: 400,
        zIndex: 3,
      },
    ],
    thumbnailSrc: '/frames/spotlight-top.png',
    description: '상단에 큰 이미지, 하단에 3개 섬네일',
    category: 'spotlight',
    isActive: true,
    sortOrder: 3,
    tags: ['spotlight', 'top', 'hero'],
    createdAt: new Date().toISOString(),
  },

  // 4. Side by Side (2 columns)
  {
    id: 'side-by-side-2col',
    label: '좌우 2단 분할',
    slotCount: 4,
    positions: calculateGridPositions(1920, 1080, 2, 2),
    thumbnailSrc: '/frames/side-by-side-2col.png',
    description: '좌우 2개 컬럼으로 나뉜 레이아웃',
    category: 'grid',
    isActive: true,
    sortOrder: 4,
    tags: ['columns', 'split', 'vertical'],
    createdAt: new Date().toISOString(),
  },

  // 5. Collage Style (Free positioning)
  {
    id: 'collage-free',
    label: '콜라주 스타일',
    slotCount: 4,
    positions: [
      // Top left (large)
      {
        x: FRAME_LAYOUT.padding,
        y: FRAME_LAYOUT.padding,
        width: 900,
        height: 500,
        zIndex: 1,
      },
      // Top right (medium)
      {
        x: 900 + FRAME_LAYOUT.padding + FRAME_LAYOUT.gap,
        y: FRAME_LAYOUT.padding,
        width: 940,
        height: 500,
        zIndex: 0,
      },
      // Bottom left (medium)
      {
        x: FRAME_LAYOUT.padding,
        y: 500 + FRAME_LAYOUT.padding + FRAME_LAYOUT.gap,
        width: 600,
        height: 520,
        zIndex: 2,
      },
      // Bottom right (large)
      {
        x: 600 + FRAME_LAYOUT.padding + FRAME_LAYOUT.gap,
        y: 500 + FRAME_LAYOUT.padding + FRAME_LAYOUT.gap,
        width: 1240,
        height: 520,
        zIndex: 3,
      },
    ],
    thumbnailSrc: '/frames/collage-free.png',
    description: '자유로운 크기와 배치의 콜라주 레이아웃',
    category: 'collage',
    isActive: true,
    sortOrder: 5,
    tags: ['collage', 'free', 'creative', 'asymmetric'],
    createdAt: new Date().toISOString(),
  },

  // 6. Picture in Picture
  {
    id: 'picture-in-picture',
    label: 'PIP (화면 속 화면)',
    slotCount: 4,
    positions: [
      // Background (full)
      {
        x: FRAME_LAYOUT.padding,
        y: FRAME_LAYOUT.padding,
        width: 1840,
        height: 1000,
        zIndex: 0,
      },
      // PIP 1 (top right)
      {
        x: 1920 - 400 - FRAME_LAYOUT.padding - 20,
        y: FRAME_LAYOUT.padding + 20,
        width: 400,
        height: 250,
        zIndex: 1,
      },
      // PIP 2 (middle right)
      {
        x: 1920 - 400 - FRAME_LAYOUT.padding - 20,
        y: FRAME_LAYOUT.padding + 250 + 40,
        width: 400,
        height: 250,
        zIndex: 2,
      },
      // PIP 3 (bottom right)
      {
        x: 1920 - 400 - FRAME_LAYOUT.padding - 20,
        y: FRAME_LAYOUT.padding + 500 + 60,
        width: 400,
        height: 250,
        zIndex: 3,
      },
    ],
    thumbnailSrc: '/frames/picture-in-picture.png',
    description: '전체 배경 위에 작은 화면들이 겹쳐진 레이아웃',
    category: 'overlay',
    isActive: true,
    sortOrder: 6,
    tags: ['pip', 'overlay', 'layered'],
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
export const DEFAULT_LAYOUT = FRAME_LAYOUTS[0]; // 2x2 grid
