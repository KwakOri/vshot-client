import { useEffect, useRef } from 'react';

interface UseCompositeCanvasOptions {
  compositeCanvas: HTMLCanvasElement | null;
  backgroundVideo: HTMLVideoElement | null;
  foregroundCanvas: HTMLCanvasElement | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  width?: number;
  height?: number;
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
  height = 1080
}: UseCompositeCanvasOptions) {
  const animationFrameRef = useRef<number>();

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

      // Draw background (Guest video)
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, width, height);

      if (backgroundVideo.readyState >= 2) {
        ctx.save();
        ctx.scale(-1, 1); // Mirror
        ctx.drawImage(backgroundVideo, -width, 0, width, height);
        ctx.restore();
      }

      // Draw foreground (Host with chroma key)
      if (foregroundCanvas.width > 0 && foregroundCanvas.height > 0) {
        ctx.drawImage(foregroundCanvas, 0, 0, width, height);
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
  }, [localStream, remoteStream, compositeCanvas, backgroundVideo, foregroundCanvas, width, height]);

  return { animationFrameRef };
}
