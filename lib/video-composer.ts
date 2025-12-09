/**
 * VideoComposer - Compose 4 videos into a 2x2 grid and convert to MP4
 * Uses ffmpeg.wasm for video processing in the browser
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type { VideoSegment } from './video-splitter';

export interface ComposeConfig {
  width: number; // Output width (e.g., 1920)
  height: number; // Output height (e.g., 1080)
  frameRate: number; // Output frame rate (e.g., 24)
}

/**
 * Compose 4 video segments into a 2x2 grid and convert to MP4
 * @param segments Array of 4 video segments to compose
 * @param config Composition configuration
 * @param onProgress Progress callback
 * @returns Composed video blob (MP4 format)
 */
export async function composeVideoGrid(
  segments: VideoSegment[],
  config: ComposeConfig = { width: 1920, height: 1080, frameRate: 24 },
  onProgress?: (message: string) => void
): Promise<Blob> {
  if (segments.length !== 4) {
    throw new Error('Exactly 4 video segments are required for 2x2 grid composition');
  }

  console.log('[VideoComposer] Starting composition with config:', config);
  console.log('[VideoComposer] Segments:', segments.map(s => `#${s.photoNumber}`));

  // Initialize FFmpeg
  const ffmpeg = new FFmpeg();

  // Load FFmpeg core - use direct CDN URLs
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

  try {
    onProgress?.('FFmpeg 로딩 중...');
    await ffmpeg.load({
      coreURL: `${baseURL}/ffmpeg-core.js`,
      wasmURL: `${baseURL}/ffmpeg-core.wasm`,
    });
    console.log('[VideoComposer] FFmpeg loaded successfully');
  } catch (error) {
    console.error('[VideoComposer] Failed to load FFmpeg:', error);
    throw new Error('FFmpeg 로딩에 실패했습니다.');
  }

  try {
    // Write input videos to FFmpeg virtual file system
    onProgress?.('영상 파일 준비 중...');
    const inputFiles: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const filename = `input${i}.webm`;
      await ffmpeg.writeFile(filename, await fetchFile(segments[i].blob));
      inputFiles.push(filename);
      console.log(`[VideoComposer] Written ${filename}`);
    }

    // Calculate grid dimensions (2x2)
    const cellWidth = Math.floor(config.width / 2);
    const cellHeight = Math.floor(config.height / 2);

    console.log('[VideoComposer] Grid cell size:', cellWidth, 'x', cellHeight);

    // Build FFmpeg filter complex for 2x2 grid layout
    // Layout:
    // [0] [1]
    // [2] [3]
    const filterComplex = [
      // Scale each input to cell size
      `[0:v]scale=${cellWidth}:${cellHeight}[v0]`,
      `[1:v]scale=${cellWidth}:${cellHeight}[v1]`,
      `[2:v]scale=${cellWidth}:${cellHeight}[v2]`,
      `[3:v]scale=${cellWidth}:${cellHeight}[v3]`,

      // Stack horizontally: top row and bottom row
      `[v0][v1]hstack=inputs=2[top]`,
      `[v2][v3]hstack=inputs=2[bottom]`,

      // Stack vertically: combine top and bottom
      `[top][bottom]vstack=inputs=2[out]`,
    ].join(';');

    console.log('[VideoComposer] Filter complex:', filterComplex);

    // Output filename
    const outputFileName = 'output.mp4';

    onProgress?.('영상 합성 중... (1-2분 소요될 수 있습니다)');

    // Run FFmpeg composition command
    // Note: Using re-encoding to ensure compatibility and proper grid layout
    await ffmpeg.exec([
      '-i', inputFiles[0],
      '-i', inputFiles[1],
      '-i', inputFiles[2],
      '-i', inputFiles[3],
      '-filter_complex', filterComplex,
      '-map', '[out]',
      '-c:v', 'libx264', // H.264 codec for MP4
      '-preset', 'fast', // Fast encoding preset
      '-crf', '23', // Quality (lower = better, 23 is good default)
      '-r', config.frameRate.toString(), // Frame rate
      '-pix_fmt', 'yuv420p', // Pixel format for compatibility
      '-movflags', '+faststart', // Enable streaming (moov atom at start)
      '-metadata', 'title=VShot Video Grid',
      '-metadata', 'encoder=FFmpeg.wasm',
      '-metadata', 'comment=Created with VShot',
      outputFileName,
    ]);

    console.log('[VideoComposer] Composition complete');

    onProgress?.('MP4 파일 생성 중...');

    // Read output file
    const data = await ffmpeg.readFile(outputFileName);
    const blob = new Blob([data as BlobPart], { type: 'video/mp4' });

    console.log('[VideoComposer] Output blob created:', {
      size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
      type: blob.type,
    });

    onProgress?.('완료!');

    return blob;

  } catch (error) {
    console.error('[VideoComposer] Composition failed:', error);
    throw new Error('영상 합성에 실패했습니다: ' + (error instanceof Error ? error.message : ''));
  }
}

/**
 * Compose 2 video segments side-by-side and convert to MP4
 * @param segments Array of 2 video segments to compose
 * @param config Composition configuration
 * @param onProgress Progress callback
 * @returns Composed video blob (MP4 format)
 */
export async function composeTwoVideos(
  segments: VideoSegment[],
  config: ComposeConfig = { width: 1920, height: 1080, frameRate: 24 },
  onProgress?: (message: string) => void
): Promise<Blob> {
  if (segments.length !== 2) {
    throw new Error('Exactly 2 video segments are required for side-by-side composition');
  }

  console.log('[VideoComposer] Starting side-by-side composition with config:', config);
  console.log('[VideoComposer] Segments:', segments.map(s => `#${s.photoNumber}`));

  // Initialize FFmpeg
  const ffmpeg = new FFmpeg();

  // Load FFmpeg core - use direct CDN URLs
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

  try {
    onProgress?.('FFmpeg 로딩 중...');
    await ffmpeg.load({
      coreURL: `${baseURL}/ffmpeg-core.js`,
      wasmURL: `${baseURL}/ffmpeg-core.wasm`,
    });
    console.log('[VideoComposer] FFmpeg loaded successfully');
  } catch (error) {
    console.error('[VideoComposer] Failed to load FFmpeg:', error);
    throw new Error('FFmpeg 로딩에 실패했습니다.');
  }

  try {
    // Write input videos to FFmpeg virtual file system
    onProgress?.('영상 파일 준비 중...');
    const inputFiles: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      const filename = `input${i}.webm`;
      await ffmpeg.writeFile(filename, await fetchFile(segments[i].blob));
      inputFiles.push(filename);
      console.log(`[VideoComposer] Written ${filename}`);
    }

    // Calculate dimensions for side-by-side (each video takes half width)
    const cellWidth = Math.floor(config.width / 2);
    const cellHeight = config.height;

    console.log('[VideoComposer] Cell size:', cellWidth, 'x', cellHeight);

    // Build FFmpeg filter complex for side-by-side layout
    // Layout: [0] [1]
    const filterComplex = [
      // Scale each input to cell size
      `[0:v]scale=${cellWidth}:${cellHeight}[v0]`,
      `[1:v]scale=${cellWidth}:${cellHeight}[v1]`,

      // Stack horizontally
      `[v0][v1]hstack=inputs=2[out]`,
    ].join(';');

    console.log('[VideoComposer] Filter complex:', filterComplex);

    // Output filename
    const outputFileName = 'output.mp4';

    onProgress?.('영상 합성 중...');

    // Run FFmpeg composition command
    await ffmpeg.exec([
      '-i', inputFiles[0],
      '-i', inputFiles[1],
      '-filter_complex', filterComplex,
      '-map', '[out]',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-r', config.frameRate.toString(),
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', // Enable streaming
      '-metadata', 'title=VShot Video Side-by-Side',
      '-metadata', 'encoder=FFmpeg.wasm',
      '-metadata', 'comment=Created with VShot',
      outputFileName,
    ]);

    console.log('[VideoComposer] Composition complete');

    onProgress?.('MP4 파일 생성 중...');

    // Read output file
    const data = await ffmpeg.readFile(outputFileName);
    const blob = new Blob([data as BlobPart], { type: 'video/mp4' });

    console.log('[VideoComposer] Output blob created:', {
      size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
      type: blob.type,
    });

    onProgress?.('완료!');

    return blob;

  } catch (error) {
    console.error('[VideoComposer] Composition failed:', error);
    throw new Error('영상 합성에 실패했습니다: ' + (error instanceof Error ? error.message : ''));
  }
}

/**
 * Download composed video
 */
export function downloadComposedVideo(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  console.log('[VideoComposer] Video downloaded:', filename);
}

/**
 * Convert WebM to MP4 (single video)
 */
export async function convertToMP4(
  webmBlob: Blob,
  onProgress?: (message: string) => void
): Promise<Blob> {
  console.log('[VideoComposer] Converting WebM to MP4...');

  const ffmpeg = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

  try {
    onProgress?.('FFmpeg 로딩 중...');
    await ffmpeg.load({
      coreURL: `${baseURL}/ffmpeg-core.js`,
      wasmURL: `${baseURL}/ffmpeg-core.wasm`,
    });
  } catch (error) {
    throw new Error('FFmpeg 로딩에 실패했습니다.');
  }

  try {
    const inputFile = 'input.webm';
    const outputFile = 'output.mp4';

    onProgress?.('변환 중...');

    await ffmpeg.writeFile(inputFile, await fetchFile(webmBlob));

    await ffmpeg.exec([
      '-i', inputFile,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-metadata', 'title=VShot Video',
      '-metadata', 'encoder=FFmpeg.wasm',
      '-metadata', 'comment=Created with VShot',
      outputFile,
    ]);

    const data = await ffmpeg.readFile(outputFile);
    const blob = new Blob([data as BlobPart], { type: 'video/mp4' });

    onProgress?.('완료!');
    console.log('[VideoComposer] Conversion complete:', blob.size, 'bytes');

    return blob;

  } catch (error) {
    console.error('[VideoComposer] Conversion failed:', error);
    throw new Error('MP4 변환에 실패했습니다.');
  }
}
