import { useEffect, useRef } from 'react';

interface UseChromaKeyOptions {
  videoElement: HTMLVideoElement | null;
  canvasElement: HTMLCanvasElement | null;
  stream: MediaStream | null;
  enabled: boolean;
  sensitivity: number;
  smoothness: number;
  keyColor?: string; // hex color (e.g., "#00ff00")
  width?: number;
  height?: number;
  /**
   * WebRTC 압축으로 인한 색상 손실 보정값.
   * Guest에서 리모트 비디오 처리 시 true로 설정하면
   * 민감도에 보정값을 추가하여 동일한 크로마키 결과를 얻음.
   */
  isRemoteStream?: boolean;
  /**
   * 좌우 반전 여부.
   * true로 설정하면 캔버스에 비디오를 그릴 때 좌우 반전 적용.
   * 사진 캡처 시에도 반전이 적용됨.
   */
  flipHorizontal?: boolean;
}

/**
 * Parse hex color string to RGB values (0-255)
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return { r, g, b };
}

/**
 * Shared hook for applying chroma key effect to video stream
 * Used by both host (local video) and guest (remote video)
 */
// WebRTC 압축으로 인한 색상 손실 보정값 (픽셀 거리)
const REMOTE_STREAM_COMPENSATION = 15;

export function useChromaKey({
  videoElement,
  canvasElement,
  stream,
  enabled,
  sensitivity,
  smoothness,
  keyColor = '#00ff00',
  width = 1920,
  height = 1080,
  isRemoteStream = false,
  flipHorizontal = false,
}: UseChromaKeyOptions) {
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const video = videoElement;
    const canvas = canvasElement;

    if (!stream || !video || !canvas) {
      console.log('[useChromaKey] Missing dependencies:', {
        hasStream: !!stream,
        hasVideo: !!video,
        hasCanvas: !!canvas,
        targetSize: `${width}x${height}`,
        chromaKeyEnabled: enabled,
      });
      return;
    }

    // Cancel any existing animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    console.log('[useChromaKey] Starting canvas rendering:', {
      targetSize: `${width}x${height}`,
      chromaKeyEnabled: enabled,
      keyColor,
      sensitivity,
      smoothness,
      isRemoteStream,
      effectiveThreshold: isRemoteStream ? sensitivity * 2 + REMOTE_STREAM_COMPENSATION : sensitivity * 2,
      videoReadyState: video.readyState,
    });

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

      // Apply horizontal flip if enabled
      if (flipHorizontal) {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -offsetX - drawWidth, offsetY, drawWidth, drawHeight);
        ctx.restore();
      } else {
        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
      }

      // Log occasionally to verify rendering (every ~2 seconds at 30fps)
      if (Math.random() < 0.01) {
        console.log('[useChromaKey] Rendering frame:', {
          canvasSize: `${canvas.width}x${canvas.height}`,
          videoSize: `${videoWidth}x${videoHeight}`,
          drawSize: `${drawWidth.toFixed(0)}x${drawHeight.toFixed(0)}`,
          offset: `${offsetX.toFixed(0)}, ${offsetY.toFixed(0)}`,
          chromaKeyEnabled: enabled,
        });
      }

      // Apply chroma key if enabled
      if (enabled) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Parse key color
        const keyColorRgb = hexToRgb(keyColor);

        // Calculate thresholds based on sensitivity/smoothness (0-100 range)
        // Remote streams need compensation for WebRTC compression color loss
        const baseThreshold = sensitivity * 2; // 0-200 range for RGB distance
        const threshold = isRemoteStream
          ? baseThreshold + REMOTE_STREAM_COMPENSATION
          : baseThreshold;
        const smoothing = smoothness * 0.5; // 0-50 range for edge feathering

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // Calculate color distance (Manhattan distance)
          const distance =
            Math.abs(r - keyColorRgb.r) +
            Math.abs(g - keyColorRgb.g) +
            Math.abs(b - keyColorRgb.b);

          if (distance < threshold) {
            if (distance < threshold - smoothing) {
              // Fully transparent
              data[i + 3] = 0;
            } else {
              // Feathered edge (gradual transparency)
              const alpha = ((distance - (threshold - smoothing)) / smoothing) * 255;
              data[i + 3] = Math.max(0, Math.min(255, alpha));
            }
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
  }, [stream, enabled, sensitivity, smoothness, keyColor, videoElement, canvasElement, width, height, isRemoteStream, flipHorizontal]);

  return { animationFrameRef };
}
