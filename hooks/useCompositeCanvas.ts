import { useEffect, useRef } from 'react';

interface UseCompositeCanvasOptions {
  compositeCanvas: HTMLCanvasElement | null;
  backgroundVideo: HTMLVideoElement | null;
  foregroundCanvas: HTMLCanvasElement | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  width?: number;
  height?: number;
  guestFlipHorizontal?: boolean;
  hostFlipHorizontal?: boolean;
  guestBlurAmount?: number; // Blur amount in pixels (0 = no blur)
  frameOverlayImage?: HTMLImageElement | null;
  frameOverlayEnabled?: boolean;
  frameOverlayOpacity?: number; // 0-1, default 0.3
}

/**
 * Shared hook for rendering composite view (Guest background + Host foreground)
 * Used by both host and guest pages
 */
export function useCompositeCanvas({
  compositeCanvas,
  backgroundVideo,
  foregroundCanvas,
  localStream,
  remoteStream,
  width = 1920,
  height = 1080,
  guestFlipHorizontal = false,
  hostFlipHorizontal = false,
  guestBlurAmount = 0,
  frameOverlayImage = null,
  frameOverlayEnabled = false,
  frameOverlayOpacity = 0.3,
}: UseCompositeCanvasOptions) {
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!localStream || !remoteStream || !backgroundVideo || !foregroundCanvas || !compositeCanvas) {
      return;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const ctx = compositeCanvas.getContext('2d');
    if (!ctx) return;

    const drawComposite = () => {
      if (!backgroundVideo || !foregroundCanvas || !compositeCanvas || !ctx) return;

      // Check if video has valid dimensions
      if (backgroundVideo.videoWidth === 0 || backgroundVideo.videoHeight === 0) {
        animationFrameRef.current = requestAnimationFrame(drawComposite);
        return;
      }

      // Set canvas size
      if (compositeCanvas.width !== width || compositeCanvas.height !== height) {
        compositeCanvas.width = width;
        compositeCanvas.height = height;
      }

      // Draw background (Guest video) with object-cover behavior
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, width, height);

      if (backgroundVideo.readyState >= 2) {
        // Calculate object-cover dimensions (maintain aspect ratio, crop to fit)
        const videoWidth = backgroundVideo.videoWidth;
        const videoHeight = backgroundVideo.videoHeight;
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

        ctx.save();

        // Apply blur filter if requested
        if (guestBlurAmount > 0) {
          ctx.filter = `blur(${guestBlurAmount}px)`;
        }

        if (guestFlipHorizontal) {
          ctx.scale(-1, 1); // Mirror Guest video
          ctx.drawImage(backgroundVideo, -offsetX - drawWidth, offsetY, drawWidth, drawHeight);
        } else {
          ctx.drawImage(backgroundVideo, offsetX, offsetY, drawWidth, drawHeight);
        }
        ctx.restore();
      }

      // Draw foreground (Host with chroma key)
      // Note: flip is already applied in useChromaKey canvas drawing, no additional flip needed here
      if (foregroundCanvas.width > 0 && foregroundCanvas.height > 0) {
        ctx.drawImage(foregroundCanvas, 0, 0, width, height);
      }

      // Draw frame overlay on top (single loop - prevents flickering)
      if (frameOverlayEnabled && frameOverlayImage && frameOverlayImage.complete && frameOverlayImage.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = frameOverlayOpacity;
        ctx.drawImage(frameOverlayImage, 0, 0, width, height);
        ctx.restore();
      }

      animationFrameRef.current = requestAnimationFrame(drawComposite);
    };

    const startComposite = () => {
      if (backgroundVideo.readyState >= 2) {
        drawComposite();
      }
    };

    if (backgroundVideo.readyState >= 2) {
      drawComposite();
    } else {
      backgroundVideo.addEventListener('loadedmetadata', startComposite);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      backgroundVideo.removeEventListener('loadedmetadata', startComposite);
    };
  }, [localStream, remoteStream, compositeCanvas, backgroundVideo, foregroundCanvas, width, height, guestFlipHorizontal, hostFlipHorizontal, guestBlurAmount, frameOverlayImage, frameOverlayEnabled, frameOverlayOpacity]);

  return { animationFrameRef };
}
