import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseServer } from '@/lib/supabase-server';
import { uploadToR2, generateObjectKey, getPublicFileUrl, R2_CONFIG, deleteFromR2, getSignedFileUrl } from '@/lib/r2';
import type { FileInsert, FileUploadResponse, FileRecord } from '@/types/files';

/**
 * GET /api/files
 *
 * Returns list of uploaded files
 * Query params:
 * - status: Filter by status (default: 'uploaded')
 * - limit: Number of files to return (default: 50)
 * - offset: Offset for pagination (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'uploaded';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const { data: files, error, count } = await supabaseServer
      .from('files')
      .select('*', { count: 'exact' })
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('DB fetch error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch files' },
        { status: 500 }
      );
    }

    // Generate URLs for each file
    const filesWithUrls = await Promise.all(
      (files as FileRecord[]).map(async (file) => {
        let url: string;
        try {
          url = getPublicFileUrl(file.object_key);
        } catch {
          url = await getSignedFileUrl(file.object_key);
        }
        return {
          id: file.id,
          url,
          originalFilename: file.original_filename,
          contentType: file.content_type,
          size: file.size,
          createdAt: file.created_at,
          uploadedAt: file.uploaded_at,
        };
      })
    );

    return NextResponse.json({
      success: true,
      files: filesWithUrls,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching files:', error);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/files
 *
 * DB First Upload Flow:
 * 1. Generate file ID and object key
 * 2. Create DB record with status='pending'
 * 3. Upload to R2
 * 4. Update DB record to status='uploaded'
 * 5. On failure: rollback (delete DB record)
 */
export async function POST(request: NextRequest): Promise<NextResponse<FileUploadResponse>> {
  let fileId: string | null = null;
  let objectKey: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const ownerId = formData.get('ownerId') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 50MB limit' },
        { status: 400 }
      );
    }

    // Step 1: Generate file ID and object key
    fileId = uuidv4();
    objectKey = generateObjectKey(fileId);

    // Step 2: Create DB record with status='pending' (DB First)
    const fileRecord: FileInsert = {
      id: fileId,
      bucket: R2_CONFIG.bucketName,
      object_key: objectKey,
      original_filename: file.name,
      content_type: file.type || 'application/octet-stream',
      size: file.size,
      owner_id: ownerId,
      status: 'pending',
    };

    const { error: insertError } = await supabaseServer
      .from('files')
      .insert(fileRecord);

    if (insertError) {
      console.error('DB insert error:', insertError);
      return NextResponse.json(
        { success: false, error: 'Failed to create file record' },
        { status: 500 }
      );
    }

    // Step 3: Upload to R2
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    try {
      await uploadToR2(objectKey, buffer, file.type || 'application/octet-stream');
    } catch (uploadError) {
      // Rollback: Delete pending DB record
      console.error('R2 upload error:', uploadError);
      await supabaseServer.from('files').delete().eq('id', fileId);

      return NextResponse.json(
        { success: false, error: 'Failed to upload file to storage' },
        { status: 500 }
      );
    }

    // Step 4: Update DB record to status='uploaded'
    const { error: updateError } = await supabaseServer
      .from('files')
      .update({
        status: 'uploaded',
        uploaded_at: new Date().toISOString(),
      })
      .eq('id', fileId);

    if (updateError) {
      // Critical: File is in R2 but DB update failed
      // Attempt to delete from R2 to maintain consistency
      console.error('DB update error:', updateError);
      try {
        await deleteFromR2(objectKey);
      } catch {
        console.error('Failed to rollback R2 upload');
      }
      await supabaseServer.from('files').delete().eq('id', fileId);

      return NextResponse.json(
        { success: false, error: 'Failed to finalize upload' },
        { status: 500 }
      );
    }

    // Success
    const fileUrl = getPublicFileUrl(objectKey);

    return NextResponse.json({
      success: true,
      file: {
        id: fileId,
        url: fileUrl,
        originalFilename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      },
    });
  } catch (error) {
    console.error('Unexpected error:', error);

    // Rollback if possible
    if (fileId) {
      try {
        await supabaseServer.from('files').delete().eq('id', fileId);
        if (objectKey) {
          await deleteFromR2(objectKey);
        }
      } catch {
        console.error('Rollback failed');
      }
    }

    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
