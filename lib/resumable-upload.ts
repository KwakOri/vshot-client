export interface ResumableUploadStartResponse {
  uploadId: string;
  chunkSize: number;
  expiresAt: string;
}

export interface ResumableUploadStatusResponse {
  nextOffset: number;
  receivedChunks: number[];
  completed: boolean;
}

interface UploadBlobWithResumeOptions<TCompleteResponse> {
  blob: Blob;
  startUrl: string;
  startBody: Record<string, unknown>;
  getChunkUrl: (uploadId: string) => string;
  getStatusUrl: (uploadId: string) => string;
  getCompleteUrl: (uploadId: string) => string;
  headers?: HeadersInit;
  maxChunkAttempts?: number;
  onProgress?: (progress: number) => void;
  completeBody?: Record<string, unknown>;
}

const DEFAULT_MAX_CHUNK_ATTEMPTS = 4;

export async function uploadBlobWithResume<TCompleteResponse>({
  blob,
  startUrl,
  startBody,
  getChunkUrl,
  getStatusUrl,
  getCompleteUrl,
  headers,
  maxChunkAttempts = DEFAULT_MAX_CHUNK_ATTEMPTS,
  onProgress,
  completeBody,
}: UploadBlobWithResumeOptions<TCompleteResponse>): Promise<TCompleteResponse> {
  const startResponse = await fetch(startUrl, {
    method: 'POST',
    headers: withJsonHeaders(headers),
    body: JSON.stringify({
      ...startBody,
      totalSize: blob.size,
      contentType: blob.type || 'application/octet-stream',
    }),
  });

  if (!startResponse.ok) {
    throw await createHttpError(startResponse, 'Failed to start resumable upload');
  }

  const { uploadId, chunkSize } = await startResponse.json() as ResumableUploadStartResponse;
  let offset = 0;
  let chunkIndex = 0;

  onProgress?.(0);

  while (offset < blob.size) {
    const chunk = blob.slice(offset, offset + chunkSize);
    let uploaded = false;
    let attempt = 0;

    while (!uploaded && attempt < maxChunkAttempts) {
      attempt += 1;

      try {
        const chunkHeaders = new Headers(headers);
        chunkHeaders.set('Content-Type', 'application/octet-stream');
        chunkHeaders.set('X-Upload-Offset', String(offset));
        chunkHeaders.set('X-Chunk-Index', String(chunkIndex));

        const chunkResponse = await fetch(getChunkUrl(uploadId), {
          method: 'PATCH',
          headers: chunkHeaders,
          body: chunk,
        });

        if (!chunkResponse.ok) {
          throw await createHttpError(chunkResponse, 'Failed to upload chunk');
        }

        const status = await chunkResponse.json() as ResumableUploadStatusResponse;
        offset = status.nextOffset;
        chunkIndex = Math.floor(offset / chunkSize);
        onProgress?.(Math.min(100, Math.round((offset / blob.size) * 100)));
        uploaded = true;
      } catch (error) {
        if (attempt >= maxChunkAttempts) {
          throw error;
        }

        const status = await fetch(getStatusUrl(uploadId), {
          headers,
        });

        if (!status.ok) {
          throw error;
        }

        const statusData = await status.json() as ResumableUploadStatusResponse;
        offset = statusData.nextOffset;
        chunkIndex = Math.floor(offset / chunkSize);
        await sleep(500 * attempt);
      }
    }
  }

  const completeResponse = await fetch(getCompleteUrl(uploadId), {
    method: 'POST',
    headers: withJsonHeaders(headers),
    body: JSON.stringify(completeBody || {}),
  });

  if (!completeResponse.ok) {
    throw await createHttpError(completeResponse, 'Failed to complete resumable upload');
  }

  onProgress?.(100);

  return completeResponse.json() as Promise<TCompleteResponse>;
}

function withJsonHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(headers);
  merged.set('Content-Type', 'application/json');
  return merged;
}

async function createHttpError(response: Response, fallbackMessage: string): Promise<Error> {
  const data = await response.json().catch(() => null);
  const details = data?.error || data?.details || response.statusText || fallbackMessage;
  return new Error(`${fallbackMessage}: ${details}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
