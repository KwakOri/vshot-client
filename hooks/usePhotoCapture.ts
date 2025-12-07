import { useState, useCallback } from 'react';

interface UsePhotoCaptureOptions {
  roomId: string | null;
  userId: string;
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
export function usePhotoCapture({ roomId, userId, onFlash }: UsePhotoCaptureOptions) {
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

      if (isCanvas && canvasOrVideo instanceof HTMLCanvasElement) {
        // Capture from canvas
        photoData = canvasOrVideo.toDataURL('image/png');
      } else if (canvasOrVideo instanceof HTMLVideoElement) {
        // Capture from video
        const canvas = document.createElement('canvas');
        canvas.width = canvasOrVideo.videoWidth || 1920;
        canvas.height = canvasOrVideo.videoHeight || 1080;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.drawImage(canvasOrVideo, 0, 0, canvas.width, canvas.height);
          photoData = canvas.toDataURL('image/png');
        } else {
          throw new Error('Could not get canvas context');
        }
      } else {
        throw new Error('Invalid canvas or video element');
      }

      console.log(`[PhotoCapture] Captured photo ${photoNumber}, uploading to server...`);

      // Upload to server
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/api/photo/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId,
          userId,
          photoNumber,
          imageData: photoData
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
  }, [roomId, userId, onFlash]);

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
