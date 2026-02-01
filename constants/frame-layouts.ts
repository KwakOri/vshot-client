/**
 * Frame Layout Presets - Ratio-based (0-1)
 * Resolution-independent layout definitions
 * All frames use consistent 2:3 aspect ratio for photos
 */

import { FrameLayout, FrameSlotRatio } from '@/types';
import {
  FRAME_LAYOUT,
  FRAME_LAYOUT_RATIO,
  RESOLUTION,
  calculateGridRatios,
  calculateSingleSlotRatio,
  resolveSlotPositions
} from './constants';

/**
 * Ratio-based layout definitions
 * These are resolution-independent and get resolved to pixels when used
 */
export interface FrameLayoutDefinition {
  id: string;
  label: string;
  slotCount: number;
  positionRatios: FrameSlotRatio[];  // Ratio-based positions (0-1)
  thumbnailSrc: string;
  frameSrc: string;
  description: string;
  category: string;
  isActive: boolean;
  sortOrder: number;
  tags: string[];
}

/**
 * Predefined layout definitions (ratio-based)
 */
export const LAYOUT_DEFINITIONS: FrameLayoutDefinition[] = [
  // 1. Classic Life 4-Cut (2x2 Grid)
  {
    id: '4cut-grid',
    label: '인생네컷 (2x2)',
    slotCount: 4,
    positionRatios: calculateGridRatios(2, 2),
    thumbnailSrc: '/frames/4cut-grid.png',
    frameSrc: '',
    description: '2x2 배열의 클래식 인생네컷 스타일',
    category: 'grid',
    isActive: true,
    sortOrder: 1,
    tags: ['grid', 'equal', 'standard', 'life4cut'],
  },

  // 2. Polaroid Single
  {
    id: '1cut-polaroid',
    label: '폴라로이드 (단일)',
    slotCount: 1,
    positionRatios: calculateSingleSlotRatio(),
    thumbnailSrc: '/frames/1cut-polaroid.png',
    frameSrc: '',
    description: '단일 사진을 위한 세로형 폴라로이드 스타일',
    category: 'single',
    isActive: true,
    sortOrder: 2,
    tags: ['polaroid', 'single', 'classic'],
  },

  // 3. Quoka Frame (custom positions for specific frame overlay)
  // This uses fixed pixel positions relative to a 3000x4500 frame image
  {
    id: '4cut-quoka',
    label: '쿼카 4컷',
    slotCount: 4,
    // Quoka frame positions as ratios (original: 3000x4500)
    positionRatios: [
      { x: 153 / 3000, y: 1068 / 4500, width: 1280 / 3000, height: 1520 / 4500, zIndex: 0 },
      { x: 153 / 3000, y: 2673 / 4500, width: 1280 / 3000, height: 1520 / 4500, zIndex: 1 },
      { x: 1587 / 3000, y: 307 / 4500, width: 1280 / 3000, height: 1520 / 4500, zIndex: 2 },
      { x: 1587 / 3000, y: 1912 / 4500, width: 1280 / 3000, height: 1520 / 4500, zIndex: 3 },
    ],
    thumbnailSrc: '/frames/quoka.png',
    frameSrc: '/frames/quoka.png',
    description: '쿼카 테마의 4컷 프레임',
    category: 'themed',
    isActive: true,
    sortOrder: 3,
    tags: ['quoka', 'themed', '4cut', 'custom'],
  },
];

/**
 * Resolve a layout definition to pixel-based FrameLayout
 * @param definition - Ratio-based layout definition
 * @param width - Target canvas width (default: PHOTO_WIDTH)
 * @param height - Target canvas height (default: PHOTO_HEIGHT)
 */
export function resolveLayout(
  definition: FrameLayoutDefinition,
  width: number = RESOLUTION.PHOTO_WIDTH,
  height: number = RESOLUTION.PHOTO_HEIGHT
): FrameLayout {
  return {
    id: definition.id,
    label: definition.label,
    slotCount: definition.slotCount,
    positions: resolveSlotPositions(definition.positionRatios, width, height),
    canvasWidth: width,
    canvasHeight: height,
    thumbnailSrc: definition.thumbnailSrc,
    frameSrc: definition.frameSrc,
    description: definition.description,
    category: definition.category,
    isActive: definition.isActive,
    sortOrder: definition.sortOrder,
    tags: definition.tags,
    createdAt: new Date().toISOString(),
    recommendedCaptureWidth: width,
    recommendedCaptureHeight: height,
  };
}

/**
 * Get all layouts resolved to photo resolution
 * This is the primary export for backwards compatibility
 */
export const FRAME_LAYOUTS: FrameLayout[] = LAYOUT_DEFINITIONS.map(def =>
  resolveLayout(def, RESOLUTION.PHOTO_WIDTH, RESOLUTION.PHOTO_HEIGHT)
);

/**
 * Get layout by ID (resolved to photo resolution)
 */
export function getLayoutById(id: string): FrameLayout | undefined {
  const definition = LAYOUT_DEFINITIONS.find(def => def.id === id);
  if (!definition) return undefined;
  return resolveLayout(definition);
}

/**
 * Get layout by ID resolved to specific resolution
 */
export function getLayoutByIdForResolution(
  id: string,
  width: number,
  height: number
): FrameLayout | undefined {
  const definition = LAYOUT_DEFINITIONS.find(def => def.id === id);
  if (!definition) return undefined;
  return resolveLayout(definition, width, height);
}

/**
 * Get layouts by category
 */
export function getLayoutsByCategory(category: string): FrameLayout[] {
  return LAYOUT_DEFINITIONS
    .filter(def => def.category === category && def.isActive)
    .map(def => resolveLayout(def));
}

/**
 * Get all active layouts sorted by sortOrder
 */
export function getActiveLayouts(): FrameLayout[] {
  return LAYOUT_DEFINITIONS
    .filter(def => def.isActive)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map(def => resolveLayout(def));
}

/**
 * Search layouts by tag
 */
export function searchLayoutsByTag(tag: string): FrameLayout[] {
  return LAYOUT_DEFINITIONS
    .filter(def => def.isActive && def.tags?.includes(tag.toLowerCase()))
    .map(def => resolveLayout(def));
}

/**
 * Default layout (fallback)
 */
export const DEFAULT_LAYOUT = FRAME_LAYOUTS[0]; // 2x2 grid (인생네컷)
