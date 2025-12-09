/**
 * VideoSplitter - Split continuous video into segments based on timing
 * Uses ffmpeg.wasm to process video in the browser
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

export interface VideoSegment {
  photoNumber: number;
  blob: Blob;
  url: string;
  startTime: number;
  endTime: number;
}

export interface SplitConfig {
  recordingDuration: number; // seconds per photo
  captureInterval: number; // seconds between photos
  totalPhotos: number; // typically 8
}

export interface CaptureTimestamp {
  photoNumber: number;
  start: number; // seconds from recording start
  end: number; // seconds from recording start
}

/**
 * Calculate time segments for each photo (legacy method using config)
 */
export function calculateSegments(config: SplitConfig): Array<{ start: number; end: number; photoNumber: number }> {
  const segments = [];

  for (let i = 0; i < config.totalPhotos; i++) {
    const start = i * (config.recordingDuration + config.captureInterval);
    const end = start + config.recordingDuration;

    segments.push({
      photoNumber: i + 1,
      start,
      end,
    });
  }

  return segments;
}

/**
 * Split video blob into multiple segments using ffmpeg.wasm
 * @param videoBlob - The video blob to split
 * @param configOrTimestamps - Either a SplitConfig (legacy) or array of actual timestamps
 * @param onProgress - Progress callback
 */
export async function splitVideo(
  videoBlob: Blob,
  configOrTimestamps: SplitConfig | CaptureTimestamp[],
  onProgress?: (progress: number, current: number, total: number) => void
): Promise<VideoSegment[]> {
  // Determine if using timestamps or config
  const isTimestampArray = Array.isArray(configOrTimestamps);

  if (isTimestampArray) {
    console.log('[VideoSplitter] Starting video split with ACTUAL TIMESTAMPS:', configOrTimestamps);
  } else {
    console.log('[VideoSplitter] Starting video split with CALCULATED CONFIG:', configOrTimestamps);
  }

  // Initialize FFmpeg
  const ffmpeg = new FFmpeg();

  // Load FFmpeg core - use direct CDN URLs
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

  try {
    await ffmpeg.load({
      coreURL: `${baseURL}/ffmpeg-core.js`,
      wasmURL: `${baseURL}/ffmpeg-core.wasm`,
    });
    console.log('[VideoSplitter] FFmpeg loaded successfully');
  } catch (error) {
    console.error('[VideoSplitter] Failed to load FFmpeg:', error);
    throw new Error('FFmpeg 로딩에 실패했습니다.');
  }

  // Calculate segments based on input type
  const segments = isTimestampArray
    ? configOrTimestamps.map(ts => ({
        photoNumber: ts.photoNumber,
        start: ts.start,
        end: ts.end,
      }))
    : calculateSegments(configOrTimestamps);

  console.log('[VideoSplitter] Segments to process:', segments);

  // Write input video to FFmpeg virtual file system
  const inputFileName = 'input.webm';
  await ffmpeg.writeFile(inputFileName, await fetchFile(videoBlob));
  console.log('[VideoSplitter] Input video written to FFmpeg');

  // Process each segment
  const results: VideoSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const outputFileName = `output_${segment.photoNumber}.webm`;

    console.log(`[VideoSplitter] Processing segment ${segment.photoNumber}/${segments.length}:`, {
      start: segment.start,
      end: segment.end,
      duration: segment.end - segment.start,
    });

    try {
      // Run FFmpeg command to extract segment with precise timing
      // Use -ss before -i for fast seeking, then re-encode with lighter codec
      const duration = segment.end - segment.start;

      console.log(`[VideoSplitter] Extracting segment from ${segment.start}s for ${duration}s`);

      await ffmpeg.exec([
        '-ss', segment.start.toString(), // Seek before input (fast)
        '-i', inputFileName,
        '-t', duration.toString(),
        '-c:v', 'libx264', // Use H.264 (lighter than VP9)
        '-preset', 'ultrafast', // Fastest encoding preset
        '-crf', '28', // Quality setting (lower = better quality)
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outputFileName.replace('.webm', '.mp4'), // Output as MP4
      ]);

      // Read output file (now MP4)
      const actualOutputFile = outputFileName.replace('.webm', '.mp4');
      const data = await ffmpeg.readFile(actualOutputFile);
      const blob = new Blob([data as BlobPart], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      results.push({
        photoNumber: segment.photoNumber,
        blob,
        url,
        startTime: segment.start,
        endTime: segment.end,
      });

      console.log(`[VideoSplitter] Segment ${segment.photoNumber} complete:`, {
        size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
      });

      // Report progress
      if (onProgress) {
        onProgress((i + 1) / segments.length * 100, i + 1, segments.length);
      }
    } catch (error) {
      console.error(`[VideoSplitter] Failed to process segment ${segment.photoNumber}:`, error);
      throw new Error(`영상 구간 ${segment.photoNumber} 처리 중 오류가 발생했습니다.`);
    }
  }

  console.log('[VideoSplitter] All segments processed successfully');
  return results;
}

/**
 * Download multiple video segments
 */
export function downloadSegments(segments: VideoSegment[], roomId: string): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

  segments.forEach((segment) => {
    const link = document.createElement('a');
    link.href = segment.url;
    link.download = `vshot-video-${roomId}-${segment.photoNumber}-${timestamp}.webm`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

/**
 * Cleanup segment URLs to free memory
 */
export function cleanupSegments(segments: VideoSegment[]): void {
  segments.forEach(segment => {
    URL.revokeObjectURL(segment.url);
  });
}
