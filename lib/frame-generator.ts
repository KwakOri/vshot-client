import { ASPECT_RATIOS, type AspectRatio } from '@/types';

/**
 * Generate a 2x2 photo frame from 4 selected photos
 * @param photoUrls Array of 4 photo URLs
 * @param aspectRatio Aspect ratio for the photos
 * @param downloadFilename Optional filename for download
 */
export async function generatePhotoFrame(
  photoUrls: string[],
  aspectRatio: AspectRatio = '16:9',
  downloadFilename: string = 'photo-frame.png'
): Promise<void> {
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
  const gap = 20;          // Gap between photos
  const padding = 40;      // Padding around the frame

  canvas.width = (photoWidth * 2) + gap + (padding * 2);
  canvas.height = (photoHeight * 2) + gap + (padding * 2);

  // Fill background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Load all images
  const images = await Promise.all(
    photoUrls.map(url => loadImage(url))
  );

  // Draw images in 2x2 grid
  const positions = [
    { x: padding, y: padding },                                    // Top-left
    { x: padding + photoWidth + gap, y: padding },                 // Top-right
    { x: padding, y: padding + photoHeight + gap },                // Bottom-left
    { x: padding + photoWidth + gap, y: padding + photoHeight + gap } // Bottom-right
  ];

  images.forEach((img, index) => {
    const pos = positions[index];

    // Calculate aspect ratios for object-fit: cover behavior
    // This ensures the image fills the entire box, cropping if necessary
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

    // Draw image with cover behavior (fills entire box)
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

    // Add border around the box area
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(pos.x, pos.y, photoWidth, photoHeight);
  });

  // Add frame number indicators
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  positions.forEach((pos, index) => {
    const number = index + 1;
    ctx.fillText(`${number}`, pos.x + 16, pos.y + 40);
  });

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
 * Load an image from URL
 */
function loadImage(url: string): Promise<HTMLImageElement> {
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
  const gap = 20;          // Gap between photos
  const padding = 40;      // Padding around the frame

  canvas.width = (photoWidth * 2) + gap + (padding * 2);
  canvas.height = (photoHeight * 2) + gap + (padding * 2);

  // Fill background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Load all images
  const images = await Promise.all(
    photoUrls.map(url => loadImage(url))
  );

  // Draw images in 2x2 grid
  const positions = [
    { x: padding, y: padding },                                    // Top-left
    { x: padding + photoWidth + gap, y: padding },                 // Top-right
    { x: padding, y: padding + photoHeight + gap },                // Bottom-left
    { x: padding + photoWidth + gap, y: padding + photoHeight + gap } // Bottom-right
  ];

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

    // Draw image with cover behavior
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

    // Add border around the box area
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(pos.x, pos.y, photoWidth, photoHeight);
  });

  // Add frame number indicators
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  positions.forEach((pos, index) => {
    const number = index + 1;
    ctx.fillText(`${number}`, pos.x + 16, pos.y + 40);
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
