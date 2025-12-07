/**
 * Generate a 2x2 photo frame from 4 selected photos
 * @param photoUrls Array of 4 photo URLs
 * @param downloadFilename Optional filename for download
 */
export async function generatePhotoFrame(
  photoUrls: string[],
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

  // Define frame dimensions (2x2 grid)
  const photoWidth = 960;  // Each photo width
  const photoHeight = 720; // Each photo height (4:3 aspect ratio)
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
    ctx.drawImage(img, pos.x, pos.y, photoWidth, photoHeight);

    // Add border
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
    link.click();

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
 * Generate frame with custom layout and download
 */
export async function downloadPhotoFrame(
  photos: string[],
  selectedIndices: number[],
  roomId: string
): Promise<void> {
  if (selectedIndices.length !== 4) {
    throw new Error('Please select exactly 4 photos');
  }

  // Get selected photo URLs in order
  const selectedPhotos = selectedIndices.map(index => photos[index]);

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `vshot-frame-${roomId}-${timestamp}.png`;

  await generatePhotoFrame(selectedPhotos, filename);
}
