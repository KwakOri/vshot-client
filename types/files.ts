/**
 * File status enum
 * - pending: DB record created, R2 upload not yet complete
 * - uploaded: R2 upload successful
 * - deleted: File marked as deleted
 */
export type FileStatus = 'pending' | 'uploaded' | 'deleted';

/**
 * Database file record
 */
export interface FileRecord {
  id: string;
  bucket: string;
  object_key: string;
  original_filename: string;
  content_type: string;
  size: number;
  owner_id: string | null;
  status: FileStatus;
  created_at: string;
  uploaded_at: string | null;
  deleted_at: string | null;
}

/**
 * File upload request body
 */
export interface FileUploadRequest {
  file: File;
  ownerId?: string;
}

/**
 * File upload response
 */
export interface FileUploadResponse {
  success: boolean;
  file?: {
    id: string;
    url: string;
    originalFilename: string;
    contentType: string;
    size: number;
  };
  error?: string;
}

/**
 * File info response
 */
export interface FileInfoResponse {
  success: boolean;
  file?: {
    id: string;
    url: string;
    originalFilename: string;
    contentType: string;
    size: number;
    createdAt: string;
    uploadedAt: string | null;
  };
  error?: string;
}

/**
 * File delete response
 */
export interface FileDeleteResponse {
  success: boolean;
  error?: string;
}

/**
 * Insert payload for files table
 */
export interface FileInsert {
  id: string;
  bucket: string;
  object_key: string;
  original_filename: string;
  content_type: string;
  size: number;
  owner_id: string | null;
  status: FileStatus;
}

/**
 * Update payload for files table
 */
export interface FileUpdate {
  status?: FileStatus;
  uploaded_at?: string;
  deleted_at?: string;
}
