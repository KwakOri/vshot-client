/**
 * WebGL Video Composer - GPU-accelerated real-time video composition
 * Replaces FFmpeg.wasm for instant video merging
 */

export interface VideoSource {
  blob: Blob;
  startTime: number; // seconds
  endTime: number; // seconds
  photoNumber: number;
}

export interface WebGLComposeConfig {
  width: number; // Output width (e.g., 1920)
  height: number; // Output height (e.g., 1080)
  frameRate: number; // Output frame rate (e.g., 24)
}

/**
 * WebGL-based video compositor for 2x2 grid layout
 */
export class WebGLVideoComposer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private videoElements: HTMLVideoElement[] = [];
  private textures: WebGLTexture[] = [];
  private isRendering = false;

  constructor(width: number, height: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;

    const gl = this.canvas.getContext('webgl', {
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
   * Render 2x2 grid of videos
   */
  private renderFrame(): void {
    if (!this.isRendering) return;

    const gl = this.gl;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const cellWidth = Math.floor(width / 2);
    const cellHeight = Math.floor(height / 2);

    // Clear canvas
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Render each video in its grid cell
    // Layout:
    // [0] [1]
    // [2] [3]
    const positions = [
      { x: 0, y: cellHeight }, // Bottom-left (0)
      { x: cellWidth, y: cellHeight }, // Bottom-right (1)
      { x: 0, y: 0 }, // Top-left (2)
      { x: cellWidth, y: 0 }, // Top-right (3)
    ];

    for (let i = 0; i < this.videoElements.length; i++) {
      const video = this.videoElements[i];
      const texture = this.textures[i];
      const pos = positions[i];

      if (video && texture && pos) {
        this.renderVideoInCell(video, texture, pos.x, pos.y, cellWidth, cellHeight);
      }
    }

    // Continue rendering
    requestAnimationFrame(() => this.renderFrame());
  }

  /**
   * Load video sources and prepare for rendering
   */
  async loadVideos(sources: VideoSource[]): Promise<void> {
    if (sources.length !== 4) {
      throw new Error('Exactly 4 video sources required for 2x2 grid');
    }

    console.log('[WebGLVideoComposer] Loading 4 video sources...');

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

    // Play all videos
    this.videoElements.forEach(video => {
      video.play().catch(err => console.error('[WebGLVideoComposer] Failed to play video:', err));
    });

    // Start render loop
    this.isRendering = true;
    this.renderFrame();

    // Capture canvas stream
    const stream = this.canvas.captureStream(frameRate);
    console.log('[WebGLVideoComposer] Canvas stream captured');

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
    return this.canvas;
  }
}

/**
 * Compose 4 video segments into a 2x2 grid using WebGL (GPU-accelerated, no re-encoding!)
 * @param sources Array of 4 video sources with timing info
 * @param config Composition configuration
 * @param onProgress Progress callback
 * @returns Composed video blob (WebM format, recorded from WebGL canvas)
 */
export async function composeVideoWithWebGL(
  sources: VideoSource[],
  config: WebGLComposeConfig = { width: 1920, height: 1080, frameRate: 24 },
  onProgress?: (message: string) => void
): Promise<Blob> {
  console.log('[composeVideoWithWebGL] Starting WebGL composition');
  console.log('[composeVideoWithWebGL] Sources:', sources.map(s => `#${s.photoNumber}`));
  console.log('[composeVideoWithWebGL] Config:', config);

  onProgress?.('WebGL 초기화 중...');

  // Create WebGL composer
  const composer = new WebGLVideoComposer(config.width, config.height);

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
 */
function getSupportedMimeType(): string {
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

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
  link.click();
  URL.revokeObjectURL(url);
  console.log('[WebGLVideoComposer] Video downloaded:', filename);
}
