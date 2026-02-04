import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.warn('R2 environment variables are not fully configured');
}

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID || '',
    secretAccessKey: R2_SECRET_ACCESS_KEY || '',
  },
});

export const R2_CONFIG = {
  bucketName: R2_BUCKET_NAME || '',
  publicUrl: R2_PUBLIC_URL || '',
};

/**
 * Generate object key with UUID-based naming
 * Format: files/{yyyy}/{mm}/{uuid}
 */
export function generateObjectKey(fileId: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `files/${year}/${month}/${fileId}`;
}

/**
 * Upload file to R2
 */
export async function uploadToR2(
  objectKey: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: objectKey,
    Body: body,
    ContentType: contentType,
  });

  await r2Client.send(command);
}

/**
 * Delete file from R2
 */
export async function deleteFromR2(objectKey: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: objectKey,
  });

  await r2Client.send(command);
}

/**
 * Check if object exists in R2
 */
export async function objectExistsInR2(objectKey: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: objectKey,
    });
    await r2Client.send(command);
    return true;
  } catch {
    return false;
  }
}

/**
 * Options for generating signed URL
 */
export interface SignedUrlOptions {
  key: string;           // R2 object key (e.g., "files/2024/01/uuid")
  expiresIn?: number;    // URL expiration in seconds (default: 3600)
  filename?: string;     // Download filename (optional)
}

/**
 * Generate signed URL for private file access
 * @param objectKey - R2 object key
 * @param expiresIn - URL expiration in seconds (default: 1 hour)
 * @deprecated Use generateSignedUrl() instead for download support
 */
export async function getSignedFileUrl(objectKey: string, expiresIn = 3600): Promise<string> {
  return generateSignedUrl({ key: objectKey, expiresIn });
}

/**
 * Generate signed URL with download support
 * - Sets ResponseContentDisposition to force browser download
 * - Supports custom filename with proper encoding
 */
export async function generateSignedUrl(options: SignedUrlOptions): Promise<string> {
  const { key, expiresIn = 3600, filename } = options;

  const command = new GetObjectCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: key,
    ResponseContentDisposition: filename
      ? `attachment; filename="${encodeURIComponent(filename)}"`
      : 'attachment',
  });

  return getSignedUrl(r2Client, command, { expiresIn });
}

/**
 * Download file directly from R2 as Buffer
 * Use this when server needs to process file content
 */
export async function downloadFile(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: key,
  });

  const response = await r2Client.send(command);
  const stream = response.Body as NodeJS.ReadableStream;

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

/**
 * Get public URL for file (if custom subdomain is configured)
 */
export function getPublicFileUrl(objectKey: string): string {
  if (R2_CONFIG.publicUrl) {
    return `${R2_CONFIG.publicUrl}/${objectKey}`;
  }
  throw new Error('R2_PUBLIC_URL is not configured');
}
