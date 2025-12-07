// Canvas 2D-based Chroma Key processing
// Based on temis-vshot-origin implementation

export interface ChromaKeySettings {
  enabled: boolean;
  color: string; // hex color (e.g., "#00ff00")
  similarity: number; // 0-1 (threshold for color matching)
  smoothness: number; // 0-1 (edge feathering)
}

export class CanvasChromaKey {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private currentSettings: ChromaKeySettings | null = null;
  private currentVideo: HTMLVideoElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!this.ctx) {
      console.error('[CanvasChromaKey] Failed to get 2D context');
    } else {
      console.log('[CanvasChromaKey] Initialized successfully');
    }
  }

  /**
   * Parse hex color string to RGB values (0-255)
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return { r, g, b };
  }

  /**
   * Apply chroma key effect to current canvas content
   */
  private applyChromaKeyEffect(settings: ChromaKeySettings): void {
    if (!this.ctx || !settings.enabled) return;

    const imageData = this.ctx.getImageData(
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );
    const data = imageData.data;

    // Parse key color
    const keyColor = this.hexToRgb(settings.color);

    // Calculate thresholds
    // similarity: 0-1 maps to color distance threshold
    // Using simple RGB distance (similar to reference implementation)
    const threshold = settings.similarity * 200; // 0-200 range for RGB distance
    const smoothness = settings.smoothness * 50; // 0-50 range for edge feathering

    // Process each pixel
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Calculate color distance (Manhattan distance for performance)
      const distance =
        Math.abs(r - keyColor.r) +
        Math.abs(g - keyColor.g) +
        Math.abs(b - keyColor.b);

      if (distance < threshold) {
        if (distance < threshold - smoothness) {
          // Fully transparent
          data[i + 3] = 0;
        } else {
          // Feathered edge (gradual transparency)
          const alpha =
            ((distance - (threshold - smoothness)) / smoothness) * 255;
          data[i + 3] = Math.max(0, Math.min(255, alpha));
        }
      }
    }

    this.ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Process a single frame from video element
   */
  private processFrame(
    video: HTMLVideoElement,
    settings: ChromaKeySettings
  ): void {
    // Check if video has valid dimensions instead of readyState
    // This is more reliable for MediaStream sources
    if (!this.ctx || !video || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    // Resize canvas to match video dimensions if needed
    if (
      this.canvas.width !== video.videoWidth ||
      this.canvas.height !== video.videoHeight
    ) {
      this.canvas.width = video.videoWidth;
      this.canvas.height = video.videoHeight;
      console.log(
        `[CanvasChromaKey] Canvas resized to ${this.canvas.width}x${this.canvas.height}`
      );
    }

    // Draw video frame to canvas
    this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);

    // Apply chroma key effect
    if (settings.enabled) {
      this.applyChromaKeyEffect(settings);
    }
  }

  /**
   * Update chromakey settings in real-time
   */
  updateSettings(settings: ChromaKeySettings): void {
    this.currentSettings = settings;
  }

  /**
   * Start real-time processing of video stream
   */
  startProcessing(
    video: HTMLVideoElement,
    settings: ChromaKeySettings
  ): void {
    if (!this.ctx) {
      console.error('[CanvasChromaKey] Canvas context not available');
      return;
    }

    // Store current video and settings
    this.currentVideo = video;
    this.currentSettings = settings;

    // Stop any existing processing
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    console.log('[CanvasChromaKey] Starting processing with settings:', settings);

    const render = () => {
      // Use current settings and video (may be updated)
      if (this.currentVideo && this.currentSettings) {
        this.processFrame(this.currentVideo, this.currentSettings);
      }
      this.animationFrameId = requestAnimationFrame(render);
    };

    render();
  }

  /**
   * Stop processing
   */
  stopProcessing(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
      console.log('[CanvasChromaKey] Stopped processing');
    }
  }

  /**
   * Clear canvas
   */
  clear(): void {
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * Capture current canvas as image data URL
   */
  capture(format: 'png' | 'jpeg' = 'png', quality: number = 0.95): string {
    if (format === 'jpeg') {
      return this.canvas.toDataURL('image/jpeg', quality);
    }
    return this.canvas.toDataURL('image/png');
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopProcessing();
    this.clear();
    this.ctx = null;
    console.log('[CanvasChromaKey] Disposed');
  }
}

/**
 * Utility function to apply chroma key to a static image or video frame
 */
export function applyChromaKeyToCanvas(
  sourceCanvas: HTMLCanvasElement,
  settings: ChromaKeySettings
): HTMLCanvasElement {
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = sourceCanvas.width;
  outputCanvas.height = sourceCanvas.height;

  const ctx = outputCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    console.error('[applyChromaKeyToCanvas] Failed to get canvas context');
    return sourceCanvas;
  }

  // Copy source to output
  ctx.drawImage(sourceCanvas, 0, 0);

  if (!settings.enabled) {
    return outputCanvas;
  }

  // Apply chroma key
  const imageData = ctx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
  const data = imageData.data;

  // Parse key color
  const hex = settings.color.replace('#', '');
  const keyR = parseInt(hex.substring(0, 2), 16);
  const keyG = parseInt(hex.substring(2, 4), 16);
  const keyB = parseInt(hex.substring(4, 6), 16);

  const threshold = settings.similarity * 200;
  const smoothness = settings.smoothness * 50;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const distance = Math.abs(r - keyR) + Math.abs(g - keyG) + Math.abs(b - keyB);

    if (distance < threshold) {
      if (distance < threshold - smoothness) {
        data[i + 3] = 0;
      } else {
        const alpha = ((distance - (threshold - smoothness)) / smoothness) * 255;
        data[i + 3] = Math.max(0, Math.min(255, alpha));
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return outputCanvas;
}
