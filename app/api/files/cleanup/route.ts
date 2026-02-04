import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { deleteFromR2, objectExistsInR2 } from '@/lib/r2';
import type { FileRecord } from '@/types/files';

interface CleanupResponse {
  success: boolean;
  cleaned: number;
  errors: number;
  details?: string[];
}

/**
 * POST /api/files/cleanup
 *
 * Cleanup pending files that are older than the specified threshold.
 * This should be called periodically (e.g., via cron job) to clean up
 * failed uploads.
 *
 * Query params:
 * - maxAgeMinutes: Maximum age in minutes for pending files (default: 60)
 * - dryRun: If 'true', only report what would be cleaned (default: false)
 */
export async function POST(request: NextRequest): Promise<NextResponse<CleanupResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const maxAgeMinutes = parseInt(searchParams.get('maxAgeMinutes') || '60', 10);
    const dryRun = searchParams.get('dryRun') === 'true';

    // Calculate threshold timestamp
    const thresholdDate = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    const thresholdISO = thresholdDate.toISOString();

    // Find pending files older than threshold
    const { data: pendingFiles, error: fetchError } = await supabaseServer
      .from('files')
      .select('*')
      .eq('status', 'pending')
      .lt('created_at', thresholdISO)
      .returns<FileRecord[]>();

    if (fetchError) {
      console.error('Error fetching pending files:', fetchError);
      return NextResponse.json(
        { success: false, cleaned: 0, errors: 1, details: [fetchError.message] },
        { status: 500 }
      );
    }

    if (!pendingFiles || pendingFiles.length === 0) {
      return NextResponse.json({
        success: true,
        cleaned: 0,
        errors: 0,
        details: ['No pending files to clean up'],
      });
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        cleaned: 0,
        errors: 0,
        details: [
          `[DRY RUN] Would clean up ${pendingFiles.length} pending files:`,
          ...pendingFiles.map((f) => `  - ${f.id} (${f.original_filename})`),
        ],
      });
    }

    let cleaned = 0;
    let errors = 0;
    const details: string[] = [];

    for (const file of pendingFiles) {
      try {
        // Check if object exists in R2 (shouldn't, but clean up if it does)
        const exists = await objectExistsInR2(file.object_key);
        if (exists) {
          await deleteFromR2(file.object_key);
          details.push(`Deleted orphan R2 object: ${file.object_key}`);
        }

        // Delete DB record
        const { error: deleteError } = await supabaseServer
          .from('files')
          .delete()
          .eq('id', file.id);

        if (deleteError) {
          throw deleteError;
        }

        cleaned++;
        details.push(`Cleaned up pending file: ${file.id} (${file.original_filename})`);
      } catch (error) {
        errors++;
        details.push(`Failed to clean up ${file.id}: ${error}`);
      }
    }

    return NextResponse.json({
      success: errors === 0,
      cleaned,
      errors,
      details,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { success: false, cleaned: 0, errors: 1, details: [String(error)] },
      { status: 500 }
    );
  }
}
