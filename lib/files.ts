import { getApiHeadersMultipart } from '@/lib/api';
import type { FileUploadResponse } from '@/types/files';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Upload a file to R2 storage via Express server (bypasses Vercel cold start)
 */
export async function uploadFile(
  file: File,
  ownerId?: string
): Promise<FileUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (ownerId) {
    formData.append('ownerId', ownerId);
  }

  const response = await fetch(`${API_URL}/api/festa/upload`, {
    method: 'POST',
    headers: getApiHeadersMultipart(),
    body: formData,
  });

  return response.json();
}

/**
 * Upload a Blob as a file to R2 storage via Express server
 */
export async function uploadBlob(
  blob: Blob,
  filename: string,
  ownerId?: string
): Promise<FileUploadResponse> {
  const file = new File([blob], filename, { type: blob.type });
  return uploadFile(file, ownerId);
}

