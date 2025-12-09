import { useEffect, useRef } from 'react';

interface UseChromaKeyOptions {
  videoElement: HTMLVideoElement | null;
  canvasElement: HTMLCanvasElement | null;
  stream: MediaStream | null;
  enabled: boolean;
  sensitivity: number;
  smoothness: number;
  width?: number;
  height?: number;
}

/**
 * Shared hook for applying chroma key effect to video stream
 * Used by both host (local video) and guest (remote video)
 */
export function useChromaKey({
  videoElement,
  canvasElement,
  stream,
  enabled,
  sensitivity,
  smoothness,
  width = 1920,
  height = 1080
}: UseChromaKeyOptions) {
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const video = videoElement;
    const canvas = canvasElement;

    if (!stream || !video || !canvas) return;

    // Cancel any existing animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const draw = () => {
      if (!video || !canvas || !ctx) return;

      // Check if video has valid dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        animationFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      // Set canvas size to desired aspect ratio
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      // Clear canvas with transparent background
      ctx.clearRect(0, 0, width, height);

      // Draw video with object-cover behavior (maintain aspect ratio, crop to fit)
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      const videoAspect = videoWidth / videoHeight;
      const canvasAspect = width / height;

      let drawWidth: number;
      let drawHeight: number;
      let offsetX: number;
      let offsetY: number;

      if (videoAspect > canvasAspect) {
        // Video is wider than canvas - fit height, crop width
        drawHeight = height;
        drawWidth = height * videoAspect;
        offsetX = (width - drawWidth) / 2;
        offsetY = 0;
      } else {
        // Video is taller than canvas - fit width, crop height
        drawWidth = width;
        drawHeight = width / videoAspect;
        offsetX = 0;
        offsetY = (height - drawHeight) / 2;
      }

      ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);

      // Apply chroma key if enabled
      if (enabled) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        const threshold = sensitivity / 100;
        const smoothing = smoothness / 100;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          const greenStrength = g - Math.max(r, b);

          if (greenStrength > threshold * 255) {
            const alpha = Math.max(0, 1 - (greenStrength / (threshold * 255)) * (1 + smoothing));
            data[i + 3] = alpha * 255;
          }
        }

        ctx.putImageData(imageData, 0, 0);
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    // Start animation when video is ready
    const startAnimation = () => {
      if (video.readyState >= 2) {
        draw();
      }
    };

    if (video.readyState >= 2) {
      draw();
    } else {
      video.addEventListener('loadedmetadata', startAnimation);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      video.removeEventListener('loadedmetadata', startAnimation);
    };
  }, [stream, enabled, sensitivity, smoothness, videoElement, canvasElement, width, height]);

  return { animationFrameRef };
}
