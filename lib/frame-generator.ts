import { ASPECT_RATIOS, type AspectRatio, type FrameLayout } from '@/types';
import { FRAME_LAYOUT, calculateGridCellDimensions } from '@/constants/constants';
import { DEFAULT_LAYOUT } from '@/constants/frame-layouts';

/**
 * Get recommended capture resolution for a frame layout
 * If layout has explicit recommendedCaptureWidth/Height, use those.
 * Otherwise, automatically calculate based on the largest slot with 1.5x safety margin.
 *
 * @param layout Frame layout configuration
 * @returns { width, height } Recommended capture resolution in pixels
 */
export function getRecommendedCaptureResolution(layout: FrameLayout): { width: number; height: number } {
  // Use explicit recommended resolution if available
  if (layout.recommendedCaptureWidth && layout.recommendedCaptureHeight) {
    return {
      width: layout.recommendedCaptureWidth,
      height: layout.recommendedCaptureHeight,
    };
  }

  // Auto-calculate: Find the largest slot
  const maxSlot = layout.positions.reduce((max, pos) => {
    const maxArea = max.width * max.height;
    const posArea = pos.width * pos.height;
    return posArea > maxArea ? pos : max;
  }, layout.positions[0]);

  // Apply 1.5x safety margin to ensure sufficient quality
  const safetyMargin = 1.5;

  return {
    width: Math.ceil(maxSlot.width * safetyMargin),
    height: Math.ceil(maxSlot.height * safetyMargin),
  };
}

/**
 * Render frame to canvas with custom layout
 * This is a core rendering function used by both download and preview features
 * @param canvas Canvas element to render to
 * @param layout Frame layout configuration
 * @param images Array of loaded images (must match layout.slotCount)
 */
export async function renderFrameToCanvas(
  canvas: HTMLCanvasElement,
  layout: FrameLayout,
  images: HTMLImageElement[]
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  if (images.length !== layout.slotCount) {
    throw new Error(`Expected ${layout.slotCount} images for layout "${layout.label}", but got ${images.length}`);
  }

  // Set canvas size from layout configuration
  canvas.width = layout.canvasWidth;
  canvas.height = layout.canvasHeight;

  // Fill background
  ctx.fillStyle = FRAME_LAYOUT.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Sort positions by zIndex (lower zIndex drawn first = background)
  const sortedPositions = [...layout.positions].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  // Draw images according to layout positions
  sortedPositions.forEach((slot) => {
    const originalIndex = layout.positions.indexOf(slot);
    const img = images[originalIndex];

    // Calculate aspect ratios for object-fit: cover behavior
    const imgAspect = img.width / img.height;
    const boxAspect = slot.width / slot.height;

    let drawWidth: number, drawHeight: number, drawX: number, drawY: number;

    if (imgAspect > boxAspect) {
      // Image is wider than box - fit to height and crop sides
      drawHeight = slot.height;
      drawWidth = slot.height * imgAspect;
      drawX = slot.x - (drawWidth - slot.width) / 2;
      drawY = slot.y;
    } else {
      // Image is taller than box - fit to width and crop top/bottom
      drawWidth = slot.width;
      drawHeight = slot.width / imgAspect;
      drawX = slot.x;
      drawY = slot.y - (drawHeight - slot.height) / 2;
    }

    // Save context and apply clipping to prevent overflow
    ctx.save();
    ctx.beginPath();
    ctx.rect(slot.x, slot.y, slot.width, slot.height);
    ctx.clip();

    // Draw image with cover behavior (clipped to slot area)
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

    // Restore context
    ctx.restore();
  });

  // Draw frame overlay on top (if frameSrc exists)
  if (layout.frameSrc && layout.frameSrc !== '') {
    console.log('[renderFrameToCanvas] Loading frame overlay:', layout.frameSrc);
    const frameImage = new Image();
    frameImage.crossOrigin = 'anonymous';

    return new Promise<void>((resolve, reject) => {
      frameImage.onload = () => {
        console.log('[renderFrameToCanvas] Frame overlay loaded successfully:', {
          src: layout.frameSrc,
          naturalWidth: frameImage.naturalWidth,
          naturalHeight: frameImage.naturalHeight,
        });
        // Draw frame overlay covering the entire canvas
        ctx.drawImage(frameImage, 0, 0, canvas.width, canvas.height);
        resolve();
      };
      frameImage.onerror = (e) => {
        console.error('[renderFrameToCanvas] Failed to load frame image:', layout.frameSrc, e);
        resolve(); // Continue even if frame fails to load
      };
      frameImage.src = layout.frameSrc;
    });
  }
}

/**
 * Render frame preview for testing/preview purposes
 * @param canvas Canvas element to render to
 * @param layout Frame layout configuration
 * @param sampleImageUrl Optional URL to sample image (defaults to /sample.png)
 */
export async function renderFramePreview(
  canvas: HTMLCanvasElement,
  layout: FrameLayout,
  sampleImageUrl: string = '/sample.png'
): Promise<void> {
  // Load sample images (all using the same sample image)
  const images = await Promise.all(
    Array(layout.slotCount).fill(sampleImageUrl).map((url) => loadImage(url))
  );

  // Use the core rendering function
  await renderFrameToCanvas(canvas, layout, images);
}

/**
 * Generate a photo frame with custom layout
 * @param photoUrls Array of photo URLs (must match layout.slotCount)
 * @param layout Frame layout configuration
 * @param downloadFilename Optional filename for download
 */
export async function generatePhotoFrameWithLayout(
  photoUrls: string[],
  layout: FrameLayout,
  downloadFilename: string = 'photo-frame.png'
): Promise<void> {
  if (photoUrls.length !== layout.slotCount) {
    throw new Error(`Expected ${layout.slotCount} photos for layout "${layout.label}", but got ${photoUrls.length}`);
  }

  // Create canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Load all images
  const images = await Promise.all(
    photoUrls.map(url => loadImage(url))
  );

  // Use the core rendering function
  await renderFrameToCanvas(canvas, layout, images);

  // Convert to blob and download
  canvas.toBlob((blob) => {
    if (!blob) {
      throw new Error('Failed to generate image blob');
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadFilename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Cleanup
    URL.revokeObjectURL(url);
  }, 'image/png');
}

/**
 * Generate a 2x2 photo frame from 4 selected photos (legacy function, uses default layout)
 * @param photoUrls Array of 4 photo URLs
 * @param aspectRatio Aspect ratio for the photos (deprecated, layout determines size)
 * @param downloadFilename Optional filename for download
 */
export async function generatePhotoFrame(
  photoUrls: string[],
  aspectRatio: AspectRatio = '16:9',
  downloadFilename: string = 'photo-frame.png'
): Promise<void> {
  // Use the new layout-based function with default layout
  return generatePhotoFrameWithLayout(photoUrls, DEFAULT_LAYOUT, downloadFilename);
}

/**
 * Load an image from URL
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * Generate a 2x2 photo frame and return blob URL (without downloading)
 * @param photoUrls Array of 4 photo URLs
 * @param aspectRatio Aspect ratio for the photos
 * @returns Blob URL of the generated frame
 */
export async function generatePhotoFrameBlob(
  photoUrls: string[],
  aspectRatio: AspectRatio = '16:9'
): Promise<string> {
  if (photoUrls.length !== 4) {
    throw new Error('Exactly 4 photos are required to generate a frame');
  }

  // Create canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Get dimensions from aspect ratio (scale down for frame)
  const ratioSettings = ASPECT_RATIOS[aspectRatio];
  const scale = 0.5; // Scale down to half size for frame
  const photoWidth = ratioSettings.width * scale;  // Each photo width
  const photoHeight = ratioSettings.height * scale; // Each photo height

  canvas.width = (photoWidth * 2) + FRAME_LAYOUT.gap + (FRAME_LAYOUT.padding * 2);
  canvas.height = (photoHeight * 2) + FRAME_LAYOUT.gap + (FRAME_LAYOUT.padding * 2);

  // Fill background
  ctx.fillStyle = FRAME_LAYOUT.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Load all images
  const images = await Promise.all(
    photoUrls.map(url => loadImage(url))
  );

  // Calculate grid positions
  const { positions } = calculateGridCellDimensions(
    canvas.width,
    canvas.height,
    FRAME_LAYOUT.gap,
    FRAME_LAYOUT.padding
  );

  images.forEach((img, index) => {
    const pos = positions[index];

    // Calculate aspect ratios for object-fit: cover behavior
    const imgAspect = img.width / img.height;
    const boxAspect = photoWidth / photoHeight;

    let drawWidth: number, drawHeight: number, drawX: number, drawY: number;

    if (imgAspect > boxAspect) {
      // Image is wider than box - fit to height and crop sides
      drawHeight = photoHeight;
      drawWidth = photoHeight * imgAspect;
      drawX = pos.x - (drawWidth - photoWidth) / 2;
      drawY = pos.y;
    } else {
      // Image is taller than box - fit to width and crop top/bottom
      drawWidth = photoWidth;
      drawHeight = photoWidth / imgAspect;
      drawX = pos.x;
      drawY = pos.y - (drawHeight - photoHeight) / 2;
    }

    // Save context and apply clipping to prevent overflow
    ctx.save();
    ctx.beginPath();
    ctx.rect(pos.x, pos.y, photoWidth, photoHeight);
    ctx.clip();

    // Draw image with cover behavior (clipped to slot area)
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

    // Restore context
    ctx.restore();
  });

  // Convert to blob and return URL
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate image blob'));
        return;
      }

      const url = URL.createObjectURL(blob);
      resolve(url);
    }, 'image/png');
  });
}

/**
 * Generate a photo frame with custom layout and return blob URL (without downloading)
 * @param photoUrls Array of photo URLs (must match layout.slotCount)
 * @param layout Frame layout configuration
 * @returns Blob URL of the generated frame
 */
export async function generatePhotoFrameBlobWithLayout(
  photoUrls: string[],
  layout: FrameLayout
): Promise<string> {
  if (photoUrls.length !== layout.slotCount) {
    throw new Error(`Expected ${layout.slotCount} photos for layout "${layout.label}", but got ${photoUrls.length}`);
  }

  // Create canvas
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Load all images
  const images = await Promise.all(
    photoUrls.map(url => loadImage(url))
  );

  // Use the core rendering function
  await renderFrameToCanvas(canvas, layout, images);

  // Convert to blob and return URL
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate image blob'));
        return;
      }

      const url = URL.createObjectURL(blob);
      resolve(url);
    }, 'image/png');
  });
}

/**
 * Download a photo frame from blob URL
 * @param blobUrl Blob URL of the frame
 * @param roomId Room ID for filename
 */
export function downloadPhotoFrameFromBlob(blobUrl: string, roomId: string): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `vshot-frame-${roomId}-${timestamp}.png`;

  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generate frame with custom layout and download
 */
export async function downloadPhotoFrame(
  photos: string[],
  selectedIndices: number[],
  roomId: string,
  aspectRatio: AspectRatio = '16:9'
): Promise<void> {
  if (selectedIndices.length !== 4) {
    throw new Error('Please select exactly 4 photos');
  }

  // Get selected photo URLs in order
  const selectedPhotos = selectedIndices.map(index => photos[index]);

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `vshot-frame-${roomId}-${timestamp}.png`;

  await generatePhotoFrame(selectedPhotos, aspectRatio, filename);
}
