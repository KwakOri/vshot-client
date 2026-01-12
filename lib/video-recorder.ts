/**
 * VideoRecorder - Records canvas stream for each photo capture session
 * Used during photo capture to record 10-second clips simultaneously
 */
export class VideoRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private getCanvas: () => HTMLCanvasElement | null;
  private stream: MediaStream | null = null;
  private recordingTimeout: NodeJS.Timeout | null = null;
  private onVideoComplete: ((blob: Blob, photoNumber: number) => void) | null = null;
  private currentPhotoNumber: number = 0;

  constructor(canvasGetter: () => HTMLCanvasElement | null) {
    this.getCanvas = canvasGetter;
    console.log('[VideoRecorder] Constructor initialized with canvas getter');
  }

  /**
   * Start recording from canvas
   * @param photoNumber Current photo number (1-8)
   * @param duration Recording duration in milliseconds (default: 10000ms)
   * @param onComplete Callback when recording completes
   */
  async startRecording(
    photoNumber: number,
    duration: number = 10000,
    onComplete?: (blob: Blob, photoNumber: number) => void
  ): Promise<void> {
    const canvas = this.getCanvas();
    console.log('[VideoRecorder] startRecording called - photoNumber:', photoNumber);
    console.log('[VideoRecorder] canvas from getter:', canvas);
    console.log('[VideoRecorder] canvas width:', canvas?.width, 'height:', canvas?.height);

    if (!canvas) {
      console.error('[VideoRecorder] Canvas is null or undefined!');
      throw new Error('Canvas not available');
    }

    if (this.recorder?.state === 'recording') {
      console.warn('[VideoRecorder] Already recording, stopping previous session');
      this.stopRecording();
    }

    this.currentPhotoNumber = photoNumber;
    this.onVideoComplete = onComplete || null;
    this.chunks = [];

    // Wait for canvas to stabilize before starting recording
    await this.waitForCanvasStable(canvas);

    // Capture canvas stream at 24 FPS
    // Reuse existing stream if available to avoid interrupting real-time display
    if (!this.stream || this.stream.getTracks().length === 0 || this.stream.getTracks()[0].readyState === 'ended') {
      this.stream = canvas.captureStream(24);
      console.log('[VideoRecorder] Created new canvas stream');
    } else {
      console.log('[VideoRecorder] Reusing existing canvas stream for continuous display');
    }

    // Check for supported mime types
    const mimeType = this.getSupportedMimeType();

    try {
      this.recorder = new MediaRecorder(this.stream, {
        mimeType,
        videoBitsPerSecond: 1_000_000, // 1 Mbps
      });

      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.recorder.onstop = () => {
        this.handleRecordingStop();
      };

      this.recorder.onerror = (event) => {
        console.error('[VideoRecorder] Recording error:', event);
      };

      this.recorder.start();
      console.log(`[VideoRecorder] Started recording for photo #${photoNumber}`);
      console.log(`[VideoRecorder] - Duration: ${duration === 0 ? 'continuous (manual stop)' : duration + 'ms (' + (duration / 1000) + 's)'}`);
      console.log(`[VideoRecorder] - MimeType: ${mimeType}`);

      // Auto-stop after duration (if duration > 0)
      // If duration is 0, recording continues until manually stopped
      if (duration > 0) {
        this.recordingTimeout = setTimeout(() => {
          this.stopRecording();
        }, duration);
      } else {
        console.log('[VideoRecorder] Continuous recording mode - will record until manually stopped');
      }

    } catch (error) {
      console.error('[VideoRecorder] Failed to start recording:', error);
      throw error;
    }
  }

  /**
   * Wait for canvas to have stable content before recording
   * This prevents AVC1 codec errors from frame property changes
   */
  private async waitForCanvasStable(canvas: HTMLCanvasElement): Promise<void> {
    console.log('[VideoRecorder] Waiting for canvas to stabilize...');

    // Wait for at least 3 stable frames (50ms between checks)
    const maxAttempts = 20; // Max 1 second wait
    let stableFrames = 0;
    const requiredStableFrames = 3;

    for (let i = 0; i < maxAttempts; i++) {
      // Check if canvas has non-empty content
      const hasContent = this.canvasHasContent(canvas);

      if (hasContent) {
        stableFrames++;
        console.log(`[VideoRecorder] Canvas stable frame ${stableFrames}/${requiredStableFrames}`);

        if (stableFrames >= requiredStableFrames) {
          console.log('[VideoRecorder] ✅ Canvas stabilized and ready for recording');
          return;
        }
      } else {
        stableFrames = 0; // Reset if unstable frame detected
      }

      // Wait one frame (assuming 60fps = ~16ms, we wait 50ms to be safe)
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.warn('[VideoRecorder] Canvas stabilization timeout - proceeding anyway');
  }

  /**
   * Check if canvas has actual content (not empty/black)
   */
  private canvasHasContent(canvas: HTMLCanvasElement): boolean {
    try {
      // Check canvas dimensions
      if (canvas.width === 0 || canvas.height === 0) {
        return false;
      }

      // Sample a small area of the canvas to check if it has content
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return false;

      // Sample center 4x4 pixels
      const centerX = Math.floor(canvas.width / 2);
      const centerY = Math.floor(canvas.height / 2);
      const imageData = ctx.getImageData(centerX - 2, centerY - 2, 4, 4);

      // Check if any pixel has non-zero RGB values
      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];

        // If any RGB value is non-zero, canvas has content
        if (r > 0 || g > 0 || b > 0) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.warn('[VideoRecorder] Error checking canvas content:', error);
      return true; // Assume it has content if we can't check
    }
  }

  /**
   * Stop recording manually
   * NOTE: Does NOT stop stream tracks - canvas continues rendering for real-time display
   */
  stopRecording(): void {
    if (this.recordingTimeout) {
      clearTimeout(this.recordingTimeout);
      this.recordingTimeout = null;
    }

    if (this.recorder && this.recorder.state !== 'inactive') {
      console.log(`[VideoRecorder] Stopping recording for photo #${this.currentPhotoNumber}`);
      this.recorder.stop();
    }

    // ⚠️ Do NOT stop stream tracks here!
    // The canvas stream must continue for:
    // 1. Real-time display (WebRTC)
    // 2. Next recording segment
    // Stream will be stopped only in dispose()
    console.log('[VideoRecorder] Recording stopped, but stream continues for real-time display');
  }

  /**
   * Handle recording completion
   */
  private handleRecordingStop(): void {
    if (this.chunks.length === 0) {
      console.warn('[VideoRecorder] No data recorded');
      return;
    }

    const mimeType = this.recorder?.mimeType || 'video/webm';
    const blob = new Blob(this.chunks, { type: mimeType });

    console.log(`[VideoRecorder] Recording complete for photo #${this.currentPhotoNumber}:`, {
      size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
      type: blob.type
    });

    // Call completion callback
    if (this.onVideoComplete) {
      this.onVideoComplete(blob, this.currentPhotoNumber);
    }

    // Clear chunks
    this.chunks = [];
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.recorder?.state === 'recording';
  }

  /**
   * Get current recording state
   */
  getState(): RecordingState {
    if (!this.recorder) return 'inactive';
    return this.recorder.state as RecordingState;
  }

  /**
   * Get supported mime type for video recording
   * Priority: MP4 (H.264) with hardware acceleration on Mac M1/M2 (VideoToolbox)
   * Fallback: WebM (VP9/VP8) for maximum compatibility
   */
  private getSupportedMimeType(): string {
    const types = [
      // 1st Priority: AVC1 - Fixed Resolution (Best compatibility with Mac/Safari)
      'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',  // H.264 Baseline Profile + AAC (Chrome 126+)
      'video/mp4; codecs="avc1.424028, mp4a.40.2"',  // H.264 Constrained Baseline + AAC
      'video/mp4',                                    // MP4 fallback (browser picks best)

      // 2nd Priority: AVC3 - Variable Resolution (Fallback for dynamic canvas sizes)
      'video/mp4; codecs="avc3.42E01E, mp4a.40.2"',  // H.264 Variable Resolution + AAC (Chrome 133+)
      'video/mp4; codecs="avc3.640028, mp4a.40.2"',  // H.264 High Profile Variable + AAC

      // 3rd Priority: WebM (Software encoding fallback)
      'video/webm;codecs=vp9,opus',     // VP9 + Opus - best quality
      'video/webm;codecs=vp9',          // VP9 video only
      'video/webm;codecs=vp8,opus',     // VP8 + Opus - wide support
      'video/webm;codecs=vp8',          // VP8 video only
      'video/webm',                      // WebM fallback
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        // Log hardware acceleration info
        if (type.includes('mp4') || type.includes('avc')) {
          console.log('✅ [VideoRecorder] Using H.264 hardware encoder (VideoToolbox on Mac M1/M2):', type);
        } else {
          console.log('⚠️ [VideoRecorder] Using software encoder:', type);
        }
        return type;
      }
    }

    // Fallback to WebM (most browsers support this)
    console.warn('[VideoRecorder] No specific codec supported, using fallback: video/webm');
    return 'video/webm';
  }

  /**
   * Dispose recorder and free resources
   * This stops the stream tracks (only called on final cleanup)
   */
  dispose(): void {
    this.stopRecording();

    // Clean up stream tracks (only on final disposal)
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
      console.log('[VideoRecorder] Stream tracks stopped on disposal');
    }

    this.recorder = null;
    this.onVideoComplete = null;
  }
}

type RecordingState = 'inactive' | 'recording' | 'paused';

/**
 * Download video blob as file
 */
export function downloadVideo(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Create video preview element from blob
 */
export function createVideoPreview(blob: Blob): HTMLVideoElement {
  const video = document.createElement('video');
  video.src = URL.createObjectURL(blob);
  video.controls = true;
  video.style.width = '100%';
  video.style.maxWidth = '400px';
  return video;
}
