import { getApiHeadersMultipart } from '@/lib/api';
import type { FileUploadResponse, FileInfoResponse, FileDeleteResponse } from '@/types/files';

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

/**
 * Upload a Base64 encoded image to R2 storage via API
 *
 * @param base64Data - Base64 encoded data (with or without data URI prefix)
 * @param filename - Filename for the image
 * @param ownerId - Optional owner ID
 * @returns Upload response with file info
 */
export async function uploadBase64Image(
  base64Data: string,
  filename: string,
  ownerId?: string
): Promise<FileUploadResponse> {
  // Remove data URI prefix if present
  const base64Content = base64Data.includes(',')
    ? base64Data.split(',')[1]
    : base64Data;

  // Detect content type from data URI
  let contentType = 'image/png';
  if (base64Data.startsWith('data:')) {
    const match = base64Data.match(/data:([^;]+);/);
    if (match) {
      contentType = match[1];
    }
  }

  // Convert base64 to Blob
  const binaryString = atob(base64Content);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: contentType });

  return uploadBlob(blob, filename, ownerId);
}

/**
 * Get file info by ID
 *
 * @param fileId - File ID
 * @returns File info response
 */
export async function getFileInfo(fileId: string): Promise<FileInfoResponse> {
  const response = await fetch(`/api/files/${fileId}`);
  return response.json();
}

/**
 * Delete a file by ID
 *
 * @param fileId - File ID
 * @returns Delete response
 */
export async function deleteFile(fileId: string): Promise<FileDeleteResponse> {
  const response = await fetch(`/api/files/${fileId}`, {
    method: 'DELETE',
  });
  return response.json();
}
