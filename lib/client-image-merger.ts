/**
 * Client-side Image Merger
 * Canvas-based photo composition that runs on the Host client
 * Replaces server-side Sharp-based ImageMerger for real-time photo merging
 */

import { RESOLUTION } from '@/constants/constants';

export interface ClientMergeOptions {
  outputWidth?: number;
  outputHeight?: number;
  blurGuest?: boolean;  // Guest 이미지에 블러 적용 (Host 미리보기용)
  blurAmount?: number;  // 블러 강도 (px, 기본값: 20)
}

/**
 * Merge guest and host images on canvas (client-side)
 * Guest image is used as background (object-fit: cover)
 * Host image is used as foreground with alpha (object-fit: contain)
 *
 * @param guestImageData - Base64 PNG data from Guest (background/real person)
 * @param hostImageData - Base64 PNG data from Host (foreground/VTuber with alpha)
 * @param options - Optional output dimensions and blur settings
 * @returns Base64 PNG of merged image
 */
export async function mergeImagesOnCanvas(
  guestImageData: string,
  hostImageData: string,
  options: ClientMergeOptions = {}
): Promise<string> {
  const outputWidth = options.outputWidth || RESOLUTION.PHOTO_WIDTH;
  const outputHeight = options.outputHeight || RESOLUTION.PHOTO_HEIGHT;
  const blurGuest = options.blurGuest || false;
  const blurAmount = options.blurAmount || 20;

  // Create canvas for composition
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Load both images
  const [guestImage, hostImage] = await Promise.all([
    loadImage(guestImageData),
    loadImage(hostImageData),
  ]);

  // Draw guest image as background (cover mode - fill entire canvas)
  // Apply blur if requested (for Host preview to protect Guest privacy)
  if (blurGuest) {
    ctx.filter = `blur(${blurAmount}px)`;
  }
  drawImageCover(ctx, guestImage, 0, 0, outputWidth, outputHeight);

  // Reset filter before drawing host image
  if (blurGuest) {
    ctx.filter = 'none';
  }

  // Draw host image as foreground (contain mode - preserve alpha)
  drawImageContain(ctx, hostImage, 0, 0, outputWidth, outputHeight);

  // Return as base64 PNG
  return canvas.toDataURL('image/png');
}

/**
 * Load an image from base64 data
 */
function loadImage(base64Data: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = base64Data;
  });
}

/**
 * Draw image with cover mode (fill container, crop if needed)
 */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const imgAspect = img.width / img.height;
  const containerAspect = width / height;

  let sx = 0,
    sy = 0,
    sWidth = img.width,
    sHeight = img.height;

  if (imgAspect > containerAspect) {
    // Image is wider than container - crop sides
    sWidth = img.height * containerAspect;
    sx = (img.width - sWidth) / 2;
  } else {
    // Image is taller than container - crop top/bottom
    sHeight = img.width / containerAspect;
    sy = (img.height - sHeight) / 2;
  }

  ctx.drawImage(img, sx, sy, sWidth, sHeight, x, y, width, height);
}

/**
 * Draw image with contain mode (fit inside container, preserve aspect ratio)
 */
function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const imgAspect = img.width / img.height;
  const containerAspect = width / height;

  let drawWidth = width;
  let drawHeight = height;
  let drawX = x;
  let drawY = y;

  if (imgAspect > containerAspect) {
    // Image is wider - fit to width
    drawHeight = width / imgAspect;
    drawY = y + (height - drawHeight) / 2;
  } else {
    // Image is taller - fit to height
    drawWidth = height * imgAspect;
    drawX = x + (width - drawWidth) / 2;
  }

  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
}

/**
 * Batch merge multiple photo pairs
 * Used when all photos from a session need to be merged at once
 *
 * @param guestPhotos - Map of photoNumber -> Base64 PNG
 * @param hostPhotos - Map of photoNumber -> Base64 PNG
 * @param options - Optional output dimensions
 * @returns Array of merged photos with photoNumber
 */
export async function batchMergeImages(
  guestPhotos: Map<number, string>,
  hostPhotos: Map<number, string>,
  options: ClientMergeOptions = {}
): Promise<Array<{ photoNumber: number; imageData: string }>> {
  const results: Array<{ photoNumber: number; imageData: string }> = [];

  // Get all photo numbers that exist in both maps
  const photoNumbers = Array.from(guestPhotos.keys()).filter((num) =>
    hostPhotos.has(num)
  );

  // Merge each pair
  for (const photoNumber of photoNumbers.sort((a, b) => a - b)) {
    const guestData = guestPhotos.get(photoNumber)!;
    const hostData = hostPhotos.get(photoNumber)!;

    try {
      const mergedData = await mergeImagesOnCanvas(guestData, hostData, options);
      results.push({ photoNumber, imageData: mergedData });
      console.log(`[ClientImageMerger] Merged photo ${photoNumber}`);
    } catch (error) {
      console.error(`[ClientImageMerger] Failed to merge photo ${photoNumber}:`, error);
      throw error;
    }
  }

  return results;
}
