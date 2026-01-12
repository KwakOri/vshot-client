import { useState, useCallback } from 'react';
import { type AspectRatio, type FrameLayout } from '@/types';
import { getApiHeaders } from '@/lib/api';
import { RESOLUTION } from '@/constants/constants';

interface UsePhotoCaptureOptions {
  roomId: string | null;
  userId: string;
  selectedLayout?: FrameLayout; // Optional, kept for future use
  onFlash?: () => void;
}

interface CapturePhotoParams {
  photoNumber: number;
  canvasOrVideo: HTMLCanvasElement | HTMLVideoElement;
  isCanvas?: boolean;
}

/**
 * Shared hook for photo capture and upload functionality
 * Used by both host and guest pages
 */
export function usePhotoCapture({ roomId, userId, selectedLayout, onFlash }: UsePhotoCaptureOptions) {
  const [photoCount, setPhotoCount] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const captureAndUpload = useCallback(async ({
    photoNumber,
    canvasOrVideo,
    isCanvas = true
  }: CapturePhotoParams) => {
    if (!roomId) {
      console.error('[PhotoCapture] No roomId available');
      return;
    }

    // Trigger flash effect
    onFlash?.();

    try {
      let photoData: string;

      // Use fixed 2:3 vertical resolution (3000x4500) for all photo captures
      const targetWidth = RESOLUTION.PHOTO_WIDTH;
      const targetHeight = RESOLUTION.PHOTO_HEIGHT;
      console.log(`[PhotoCapture] Using fixed resolution: ${targetWidth}x${targetHeight}`);

      if (isCanvas && canvasOrVideo instanceof HTMLCanvasElement) {
        // Capture from canvas - canvas should already be at correct aspect ratio
        // But we'll resize to target dimensions to ensure consistency
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = targetWidth;
        tempCanvas.height = targetHeight;
        const tempCtx = tempCanvas.getContext('2d');

        if (tempCtx) {
          // Use cover mode to fill the entire target area
          const sourceAspect = canvasOrVideo.width / canvasOrVideo.height;
          const targetAspect = targetWidth / targetHeight;

          let sx = 0, sy = 0, sWidth = canvasOrVideo.width, sHeight = canvasOrVideo.height;

          if (sourceAspect > targetAspect) {
            // Source is wider - crop sides
            sWidth = canvasOrVideo.height * targetAspect;
            sx = (canvasOrVideo.width - sWidth) / 2;
          } else {
            // Source is taller - crop top/bottom
            sHeight = canvasOrVideo.width / targetAspect;
            sy = (canvasOrVideo.height - sHeight) / 2;
          }

          tempCtx.drawImage(
            canvasOrVideo,
            sx, sy, sWidth, sHeight,
            0, 0, targetWidth, targetHeight
          );

          photoData = tempCanvas.toDataURL('image/png');
        } else {
          throw new Error('Could not get canvas context');
        }
      } else if (canvasOrVideo instanceof HTMLVideoElement) {
        // Capture from video with aspect ratio correction
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          const videoWidth = canvasOrVideo.videoWidth || 1920;
          const videoHeight = canvasOrVideo.videoHeight || 1080;
          const videoAspect = videoWidth / videoHeight;
          const targetAspect = targetWidth / targetHeight;

          // Use cover mode: crop video to fit target aspect ratio
          let sx = 0, sy = 0, sWidth = videoWidth, sHeight = videoHeight;

          if (videoAspect > targetAspect) {
            // Video is wider than target - crop sides
            sWidth = videoHeight * targetAspect;
            sx = (videoWidth - sWidth) / 2;
          } else {
            // Video is taller than target - crop top/bottom
            sHeight = videoWidth / targetAspect;
            sy = (videoHeight - sHeight) / 2;
          }

          ctx.drawImage(
            canvasOrVideo,
            sx, sy, sWidth, sHeight,
            0, 0, targetWidth, targetHeight
          );

          photoData = canvas.toDataURL('image/png');
        } else {
          throw new Error('Could not get canvas context');
        }
      } else {
        throw new Error('Invalid canvas or video element');
      }

      console.log(`[PhotoCapture] Captured photo ${photoNumber} at ${targetWidth}x${targetHeight}, uploading to server...`);

      // Upload to server
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/api/photo/upload`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          roomId,
          userId,
          photoNumber,
          imageData: photoData,
        })
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();
      console.log(`[PhotoCapture] Photo ${photoNumber} uploaded successfully:`, result.url);

      setPhotoCount(photoNumber);

      return result.url;
    } catch (error) {
      console.error(`[PhotoCapture] Failed to upload photo ${photoNumber}:`, error);
      throw error;
    }
  }, [roomId, userId, selectedLayout, onFlash]);

  const resetCapture = useCallback(() => {
    setPhotoCount(0);
    setPhotos([]);
    setIsProcessing(false);
  }, []);

  const setMergedPhotos = useCallback((mergedPhotos: string[]) => {
    setPhotos(mergedPhotos);
    setIsProcessing(false);
  }, []);

  const startProcessing = useCallback(() => {
    setIsProcessing(true);
  }, []);

  return {
    photoCount,
    photos,
    isProcessing,
    captureAndUpload,
    resetCapture,
    setMergedPhotos,
    startProcessing
  };
}
