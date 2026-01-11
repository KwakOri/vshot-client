/**
 * API Utilities
 *
 * Provides helper functions for making authenticated API requests
 */

/**
 * Get API authentication headers
 * @returns Headers object with X-API-Key if configured
 */
export function getApiHeaders(): HeadersInit {
  const apiKey = process.env.NEXT_PUBLIC_API_KEY;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  } else {
    console.warn('[API] NEXT_PUBLIC_API_KEY not configured - requests may fail');
  }

  return headers;
}

/**
 * Get API authentication headers for multipart/form-data requests
 * @returns Headers object with X-API-Key (no Content-Type for FormData)
 */
export function getApiHeadersMultipart(): HeadersInit {
  const apiKey = process.env.NEXT_PUBLIC_API_KEY;

  const headers: HeadersInit = {};

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  } else {
    console.warn('[API] NEXT_PUBLIC_API_KEY not configured - requests may fail');
  }

  return headers;
}

/**
 * Convert WebM video to MP4 on server
 * @param webmBlob WebM video blob
 * @param onProgress Optional progress callback
 * @returns MP4 blob
 */
export async function convertWebMToMP4(
  webmBlob: Blob,
  onProgress?: (message: string) => void
): Promise<Blob> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  onProgress?.('서버로 WebM 업로드 중...');

  // Upload WebM to server for conversion
  const formData = new FormData();
  formData.append('video', webmBlob, 'video.webm');

  const response = await fetch(`${API_URL}/api/video/convert`, {
    method: 'POST',
    headers: getApiHeadersMultipart(),
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`변환 실패: ${error.error || response.statusText}`);
  }

  const result = await response.json();
  console.log('[API] Conversion result:', result);

  onProgress?.('MP4 다운로드 중...');

  // Download converted MP4
  const mp4Response = await fetch(`${API_URL}${result.mp4Url}`, {
    headers: getApiHeadersMultipart(),
  });

  if (!mp4Response.ok) {
    throw new Error('MP4 다운로드 실패');
  }

  const mp4Blob = await mp4Response.blob();
  console.log('[API] MP4 downloaded:', {
    size: `${(mp4Blob.size / 1024 / 1024).toFixed(2)} MB`,
    compressionRatio: result.compressionRatio,
  });

  onProgress?.('변환 완료!');

  return mp4Blob;
}
