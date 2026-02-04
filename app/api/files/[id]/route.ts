import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { deleteFromR2, generateSignedUrl, getPublicFileUrl, objectExistsInR2 } from '@/lib/r2';
import type { FileInfoResponse, FileDeleteResponse, FileRecord } from '@/types/files';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/files/[id]
 *
 * Returns file info and access URL
 * Only returns files with status='uploaded'
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<FileInfoResponse>> {
  try {
    const { id } = await params;

    // Fetch file record from DB
    const { data: file, error } = await supabaseServer
      .from('files')
      .select('*')
      .eq('id', id)
      .single<FileRecord>();

    if (error || !file) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    // Only return files with status='uploaded'
    if (file.status !== 'uploaded') {
      return NextResponse.json(
        { success: false, error: 'File not available' },
        { status: 404 }
      );
    }

    // Generate file URL with download support
    let fileUrl: string;
    try {
      // Try public URL first (if custom subdomain is configured)
      fileUrl = getPublicFileUrl(file.object_key);
      console.log('[API/files] Using public URL:', fileUrl);
    } catch {
      // Fall back to signed URL with download filename
      console.log('[API/files] Public URL not available, generating signed URL...');
      fileUrl = await generateSignedUrl({
        key: file.object_key,
        expiresIn: 3600,
        filename: file.original_filename,
      });
      console.log('[API/files] Generated signed URL for:', file.original_filename);
    }

    return NextResponse.json({
      success: true,
      file: {
        id: file.id,
        url: fileUrl,
        originalFilename: file.original_filename,
        contentType: file.content_type,
        size: file.size,
        createdAt: file.created_at,
        uploadedAt: file.uploaded_at,
      },
    });
  } catch (error) {
    console.error('Error fetching file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch file' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/files/[id]
 *
 * Delete Flow (DB → R2 order):
 * 1. Fetch file record from DB
 * 2. Delete object from R2
 * 3. Update DB record to status='deleted'
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<FileDeleteResponse>> {
  try {
    const { id } = await params;

    // Step 1: Fetch file record from DB
    const { data: file, error: fetchError } = await supabaseServer
      .from('files')
      .select('*')
      .eq('id', id)
      .single<FileRecord>();

    if (fetchError || !file) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    // Check if already deleted
    if (file.status === 'deleted') {
      return NextResponse.json(
        { success: false, error: 'File already deleted' },
        { status: 400 }
      );
    }

    // Step 2: Delete from R2 (if exists)
    if (file.status === 'uploaded') {
      const exists = await objectExistsInR2(file.object_key);
      if (exists) {
        try {
          await deleteFromR2(file.object_key);
        } catch (r2Error) {
          console.error('R2 delete error:', r2Error);
          return NextResponse.json(
            { success: false, error: 'Failed to delete file from storage' },
            { status: 500 }
          );
        }
      }
    }

    // Step 3: Update DB record to status='deleted'
    const { error: updateError } = await supabaseServer
      .from('files')
      .update({
        status: 'deleted',
        deleted_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      console.error('DB update error:', updateError);
      // R2 object is already deleted, but DB update failed
      // This is a critical inconsistency that should be logged/monitored
      return NextResponse.json(
        { success: false, error: 'Failed to update file record' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete file' },
      { status: 500 }
    );
  }
}
