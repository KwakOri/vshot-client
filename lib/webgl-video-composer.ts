/**
 * WebGL Video Composer - GPU-accelerated real-time video composition
 * Replaces FFmpeg.wasm for instant video merging
 * Supports dynamic canvas sizes from layout configuration (e.g., 1200x1600 for vertical layouts)
 */

import { FRAME_LAYOUT, RESOLUTION } from '@/constants/constants';
import { FrameLayout } from '@/types';
import { DEFAULT_LAYOUT } from '@/constants/frame-layouts';

export interface VideoSource {
  blob: Blob;
  startTime: number; // seconds
  endTime: number; // seconds
  photoNumber: number;
}

export interface WebGLComposeConfig {
  width: number; // Output width from layout.canvasWidth (e.g., 1200)
  height: number; // Output height from layout.canvasHeight (e.g., 1600)
  frameRate: number; // Output frame rate (e.g., 24)
  layout?: FrameLayout; // Custom frame layout
}

/**
 * WebGL-based video compositor with custom layout support
 */
export class WebGLVideoComposer {
  private webglCanvas: HTMLCanvasElement; // WebGL rendering canvas
  private compositeCanvas: HTMLCanvasElement; // Final composite canvas (for streaming)
  private gl: WebGLRenderingContext;
  private compositeCtx: CanvasRenderingContext2D;
  private program: WebGLProgram;
  private videoElements: HTMLVideoElement[] = [];
  private textures: WebGLTexture[] = [];
  private isRendering = false;
  private layout: FrameLayout;
  private scaledPositions: Array<{ x: number; y: number; width: number; height: number; zIndex?: number }>; // Scaled positions for video canvas
  private frameImage: HTMLImageElement | null = null; // Frame overlay image

  constructor(width: number, height: number, layout?: FrameLayout) {
    // WebGL canvas for video rendering
    this.webglCanvas = document.createElement('canvas');
    this.webglCanvas.width = width;
    this.webglCanvas.height = height;

    // Final composite canvas (WebGL + borders)
    this.compositeCanvas = document.createElement('canvas');
    this.compositeCanvas.width = width;
    this.compositeCanvas.height = height;

    const compositeCtx = this.compositeCanvas.getContext('2d');
    if (!compositeCtx) {
      throw new Error('Canvas 2D context not supported');
    }
    this.compositeCtx = compositeCtx;

    // Use provided layout or default
    this.layout = layout || DEFAULT_LAYOUT;

    // Scale positions from photo resolution (3000x4500) to video resolution (720x1080)
    const scaleX = width / this.layout.canvasWidth;
    const scaleY = height / this.layout.canvasHeight;

    this.scaledPositions = this.layout.positions.map(pos => ({
      x: Math.round(pos.x * scaleX),
      y: Math.round(pos.y * scaleY),
      width: Math.round(pos.width * scaleX),
      height: Math.round(pos.height * scaleY),
      zIndex: pos.zIndex,
    }));

    console.log('[WebGLVideoComposer] Scaling positions:');
    console.log(`  Original canvas: ${this.layout.canvasWidth}x${this.layout.canvasHeight}`);
    console.log(`  Video canvas: ${width}x${height}`);
    console.log(`  Scale factors: ${scaleX.toFixed(4)}x, ${scaleY.toFixed(4)}y`);
    console.log(`  Original positions:`, this.layout.positions);
    console.log(`  Scaled positions:`, this.scaledPositions);

    // Load frame overlay image if frameSrc is provided
    if (this.layout.frameSrc && this.layout.frameSrc !== '') {
      this.loadFrameImage(this.layout.frameSrc);
    }

    const gl = this.webglCanvas.getContext('webgl', {
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });

    if (!gl) {
      throw new Error('WebGL not supported');
    }

    this.gl = gl;

    this.program = this.createShaderProgram();
    this.setupGeometry();
  }

  /**
   * Create WebGL shader program
   */
  private createShaderProgram(): WebGLProgram {
    const gl = this.gl;

    // Vertex shader - simple quad
    const vertexShaderSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;

      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    // Fragment shader - texture sampling
    const fragmentShaderSource = `
      precision mediump float;
      uniform sampler2D u_texture;
      varying vec2 v_texCoord;

      void main() {
        gl_FragColor = texture2D(u_texture, v_texCoord);
      }
    `;

    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create program');

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      throw new Error('Failed to link program: ' + info);
    }

    gl.useProgram(program);
    return program;
  }

  /**
   * Compile a shader
   */
  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('Failed to compile shader: ' + info);
    }

    return shader;
  }

  /**
   * Setup quad geometry for rendering
   */
  private setupGeometry(): void {
    const gl = this.gl;

    // Quad vertices (2 triangles)
    const positions = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]);

    // Texture coordinates
    const texCoords = new Float32Array([
      0, 1,
      1, 1,
      0, 0,
      1, 0,
    ]);

    // Position buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Texture coordinate buffer
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

    const texCoordLocation = gl.getAttribLocation(this.program, 'a_texCoord');
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
  }

  /**
   * Create texture from video element
   */
  private createTexture(video: HTMLVideoElement): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to create texture');

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return texture;
  }

  /**
   * Update texture with current video frame
   */
  private updateTexture(texture: WebGLTexture, video: HTMLVideoElement): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
  }

  /**
   * Render a video in a specific grid cell
   */
  private renderVideoInCell(
    video: HTMLVideoElement,
    texture: WebGLTexture,
    cellX: number,
    cellY: number,
    cellWidth: number,
    cellHeight: number
  ): void {
    const gl = this.gl;

    // Update texture with current video frame
    this.updateTexture(texture, video);

    // Set viewport to cell position
    gl.viewport(cellX, cellY, cellWidth, cellHeight);

    // Draw quad
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Render videos according to custom layout with proper zIndex ordering
   * Using Canvas 2D for accurate frame positioning and sizing
   */
  private renderFrame(): void {
    if (!this.isRendering) return;

    const ctx = this.compositeCtx;

    // Clear canvas with background color
    ctx.fillStyle = FRAME_LAYOUT.backgroundColor;
    ctx.fillRect(0, 0, this.compositeCanvas.width, this.compositeCanvas.height);

    // Sort SCALED positions by zIndex (lower zIndex drawn first = background)
    const sortedPositions = [...this.scaledPositions].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    let drawnCount = 0;
    // Draw each video according to sorted scaled positions
    sortedPositions.forEach((slot, sortedIndex) => {
      const originalIndex = this.scaledPositions.indexOf(slot);
      const video = this.videoElements[originalIndex];

      if (!video) {
        console.warn(`[WebGLVideoComposer] No video at index ${originalIndex}`);
        return;
      }

      if (video.readyState >= video.HAVE_CURRENT_DATA) {
        // Draw video with cover-fit (maintain aspect ratio, crop to fill slot)
        const videoWidth = video.videoWidth || 720;
        const videoHeight = video.videoHeight || 1080;
        const videoAspect = videoWidth / videoHeight;
        const slotAspect = slot.width / slot.height;

        // Calculate source rectangle (which part of video to draw)
        let sx = 0, sy = 0, sWidth = videoWidth, sHeight = videoHeight;

        if (videoAspect > slotAspect) {
          // Video is wider than slot - crop sides
          sWidth = videoHeight * slotAspect;
          sx = (videoWidth - sWidth) / 2;
        } else {
          // Video is taller than slot - crop top/bottom
          sHeight = videoWidth / slotAspect;
          sy = (videoHeight - sHeight) / 2;
        }

        // Draw cropped video to fill slot completely
        ctx.drawImage(
          video,
          sx, sy, sWidth, sHeight,  // Source rectangle (cropped from video)
          slot.x, slot.y, slot.width, slot.height  // Destination rectangle (slot)
        );
        drawnCount++;
      } else {
        // Draw placeholder for not-ready videos
        ctx.fillStyle = '#333';
        ctx.fillRect(slot.x, slot.y, slot.width, slot.height);
        ctx.fillStyle = '#fff';
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          `Loading video ${originalIndex + 1}...`,
          slot.x + slot.width / 2,
          slot.y + slot.height / 2
        );
      }
    });

    // Log drawing status only occasionally to avoid console spam
    if (Math.random() < 0.01) {  // 1% of frames
      console.log(`[WebGLVideoComposer] Rendered frame: ${drawnCount}/${this.videoElements.length} videos drawn`);
    }

    // Draw frame overlay if available
    this.drawFrameOverlay();

    // Continue rendering
    requestAnimationFrame(() => this.renderFrame());
  }

  /**
   * Draw frame overlay on top (if frameSrc exists)
   */
  private drawFrameOverlay(): void {
    if (this.frameImage && this.frameImage.complete && this.frameImage.naturalWidth > 0) {
      const ctx = this.compositeCtx;
      // Draw frame overlay covering the entire canvas
      ctx.drawImage(this.frameImage, 0, 0, this.compositeCanvas.width, this.compositeCanvas.height);
    }
  }

  /**
   * Load frame overlay image
   */
  private loadFrameImage(src: string): void {
    this.frameImage = new Image();
    this.frameImage.crossOrigin = 'anonymous';
    this.frameImage.onload = () => {
      console.log('[WebGLVideoComposer] Frame overlay image loaded:', src);
    };
    this.frameImage.onerror = () => {
      console.error('[WebGLVideoComposer] Failed to load frame overlay image:', src);
      this.frameImage = null;
    };
    this.frameImage.src = src;
  }

  /**
   * Convert hex color to RGB values (0-1 range)
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) {
      return { r: 0, g: 0, b: 0 };
    }
    return {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255,
    };
  }

  /**
   * Load video sources and prepare for rendering
   */
  async loadVideos(sources: VideoSource[]): Promise<void> {
    if (sources.length !== this.layout.slotCount) {
      console.error(`[WebGLVideoComposer] Slot count mismatch!`);
      console.error(`[WebGLVideoComposer] Layout "${this.layout.label}" expects ${this.layout.slotCount} sources`);
      console.error(`[WebGLVideoComposer] But got ${sources.length} sources`);
      throw new Error(`Expected ${this.layout.slotCount} video sources for layout "${this.layout.label}", but got ${sources.length}`);
    }

    console.log(`[WebGLVideoComposer] Loading ${sources.length} video sources for layout "${this.layout.label}"...`);
    console.log(`[WebGLVideoComposer] Layout positions:`, this.layout.positions);

    // Create video elements
    this.videoElements = await Promise.all(
      sources.map(async (source) => {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(source.blob);
        video.muted = true;
        video.playsInline = true;

        // Wait for video to be ready
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => {
            console.log(`[WebGLVideoComposer] Video ${source.photoNumber} loaded:`, {
              duration: video.duration,
              width: video.videoWidth,
              height: video.videoHeight,
            });
            resolve();
          };
          video.onerror = () => reject(new Error(`Failed to load video ${source.photoNumber}`));
        });

        return video;
      })
    );

    // Create textures
    this.textures = this.videoElements.map(video => this.createTexture(video));

    console.log('[WebGLVideoComposer] All videos loaded successfully');
  }

  /**
   * Start rendering and return canvas stream
   */
  startRendering(frameRate: number = 24): MediaStream {
    console.log('[WebGLVideoComposer] Starting rendering at', frameRate, 'fps');
    console.log('[WebGLVideoComposer] Canvas size:', this.compositeCanvas.width, 'x', this.compositeCanvas.height);

    // Play all videos
    this.videoElements.forEach((video, index) => {
      console.log(`[WebGLVideoComposer] Playing video ${index + 1}/${this.videoElements.length}`);
      video.play()
        .then(() => console.log(`[WebGLVideoComposer] Video ${index + 1} playing`))
        .catch(err => console.error(`[WebGLVideoComposer] Failed to play video ${index + 1}:`, err));
    });

    // Start render loop
    this.isRendering = true;
    this.renderFrame();

    // Capture composite canvas stream (with borders)
    const stream = this.compositeCanvas.captureStream(frameRate);
    console.log('[WebGLVideoComposer] Composite canvas stream captured');

    return stream;
  }

  /**
   * Stop rendering
   */
  stopRendering(): void {
    console.log('[WebGLVideoComposer] Stopping rendering');
    this.isRendering = false;

    // Pause all videos
    this.videoElements.forEach(video => {
      video.pause();
      video.currentTime = 0;
    });
  }

  /**
   * Get maximum duration from all videos
   */
  getMaxDuration(): number {
    return Math.max(...this.videoElements.map(v => v.duration || 0));
  }

  /**
   * Check if all videos have ended
   */
  areAllVideosEnded(): boolean {
    return this.videoElements.every(v => v.ended);
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    console.log('[WebGLVideoComposer] Disposing resources');
    this.stopRendering();

    // Clean up textures
    this.textures.forEach(texture => this.gl.deleteTexture(texture));
    this.textures = [];

    // Clean up video elements
    this.videoElements.forEach(video => {
      URL.revokeObjectURL(video.src);
      video.remove();
    });
    this.videoElements = [];

    // Clean up WebGL
    this.gl.deleteProgram(this.program);
  }

  getCanvas(): HTMLCanvasElement {
    return this.compositeCanvas;
  }
}

/**
 * Compose video segments using WebGL with custom layout (GPU-accelerated, no re-encoding!)
 * @param sources Array of video sources matching layout slot count
 * @param config Composition configuration (width/height from layout, includes optional layout)
 * @param onProgress Progress callback
 * @returns Composed video blob (WebM format, recorded from WebGL canvas)
 */
export async function composeVideoWithWebGL(
  sources: VideoSource[],
  config: WebGLComposeConfig = { width: 1200, height: 1600, frameRate: 24 },
  onProgress?: (message: string) => void
): Promise<Blob> {
  const layout = config.layout || DEFAULT_LAYOUT;

  console.log('[composeVideoWithWebGL] Starting WebGL composition');
  console.log('[composeVideoWithWebGL] Sources:', sources.map(s => `#${s.photoNumber}`));
  console.log('[composeVideoWithWebGL] Layout:', layout.label);
  console.log('[composeVideoWithWebGL] Config:', config);

  // Use fixed 2:3 vertical resolution (720x1080) for all video compositions
  // This provides good quality while ensuring MediaRecorder compatibility
  const videoWidth = RESOLUTION.VIDEO_WIDTH;
  const videoHeight = RESOLUTION.VIDEO_HEIGHT;

  console.log(`[composeVideoWithWebGL] Using fixed video resolution: ${videoWidth}x${videoHeight} (photos remain at ${RESOLUTION.PHOTO_WIDTH}x${RESOLUTION.PHOTO_HEIGHT})`);

  onProgress?.('WebGL 초기화 중...');

  // Create WebGL composer with fixed video resolution
  const composer = new WebGLVideoComposer(videoWidth, videoHeight, layout);

  try {
    // Load video sources
    onProgress?.('영상 로딩 중...');
    await composer.loadVideos(sources);

    // Start rendering and capture stream
    onProgress?.('GPU 합성 시작...');
    const stream = composer.startRendering(config.frameRate);

    // Record the composed stream
    onProgress?.('녹화 중... (실시간 GPU 합성)');
    const blob = await recordStream(
      stream,
      composer.getMaxDuration(),
      (progress) => {
        onProgress?.(
          `녹화 중... ${progress.toFixed(0)}% (WebGL - 재인코딩 없음!)`
        );
      },
      composer
    );

    onProgress?.('완료!');
    console.log('[composeVideoWithWebGL] Composition complete:', {
      size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
    });

    return blob;
  } finally {
    composer.dispose();
  }
}

/**
 * Record a media stream to blob
 */
function recordStream(
  stream: MediaStream,
  duration: number,
  onProgress?: (progress: number) => void,
  composer?: WebGLVideoComposer
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const chunks: BlobPart[] = [];

    // Get supported mime type
    const mimeType = getSupportedMimeType();

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2_500_000, // 2.5 Mbps - good quality
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };

    recorder.onerror = (event) => {
      console.error('[recordStream] Recording error:', event);
      reject(new Error('Recording failed'));
    };

    // Start recording
    recorder.start();
    console.log('[recordStream] Recording started for', duration, 'seconds');

    // Track progress
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = Math.min((elapsed / duration) * 100, 100);
      onProgress?.(progress);

      // Check if all videos ended
      if (composer && composer.areAllVideosEnded()) {
        console.log('[recordStream] All videos ended, stopping recording');
        clearInterval(progressInterval);
        recorder.stop();
      }
    }, 100);

    // Auto-stop after duration + buffer
    setTimeout(() => {
      clearInterval(progressInterval);
      if (recorder.state !== 'inactive') {
        console.log('[recordStream] Duration reached, stopping recording');
        recorder.stop();
      }
    }, (duration + 0.5) * 1000); // Add 0.5s buffer
  });
}

/**
 * Get supported mime type for video recording
 * Priority: MP4 (H.264) with hardware acceleration on Mac M1/M2 (VideoToolbox)
 * Fallback: WebM (VP9/VP8) for maximum compatibility
 */
function getSupportedMimeType(): string {
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
        console.log('✅ [WebGLVideoComposer] Using H.264 hardware encoder (VideoToolbox on Mac M1/M2):', type);
      } else {
        console.log('⚠️ [WebGLVideoComposer] Using software encoder:', type);
      }
      return type;
    }
  }

  // Fallback to WebM (most browsers support this)
  console.warn('[WebGLVideoComposer] No specific codec supported, using fallback: video/webm');
  return 'video/webm';
}

/**
 * Download composed video
 */
export function downloadWebGLComposedVideo(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  console.log('[WebGLVideoComposer] Video downloaded:', filename, `(${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
}

/**
 * Check browser codec support and log details
 */
export function checkCodecSupport(): void {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📹 MediaRecorder Codec Support Check');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const codecs = [
    { name: 'AVC3 Variable Baseline (MP4)', type: 'video/mp4; codecs="avc3.42E01E, mp4a.40.2"' },
    { name: 'AVC3 Variable High (MP4)', type: 'video/mp4; codecs="avc3.640028, mp4a.40.2"' },
    { name: 'AVC1 Fixed Baseline (MP4)', type: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"' },
    { name: 'AVC1 Fixed Main (MP4)', type: 'video/mp4; codecs="avc1.4D401E, mp4a.40.2"' },
    { name: 'AVC1 Fixed High (MP4)', type: 'video/mp4; codecs="avc1.64001E, mp4a.40.2"' },
    { name: 'VP9 (WebM)', type: 'video/webm;codecs=vp9' },
    { name: 'VP8 (WebM)', type: 'video/webm;codecs=vp8' },
  ];

  codecs.forEach(({ name, type }) => {
    const supported = MediaRecorder.isTypeSupported(type);
    const icon = supported ? '✅' : '❌';
    console.log(`${icon} ${name}: ${type}`);
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}
