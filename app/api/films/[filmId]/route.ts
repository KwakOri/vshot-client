import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { getSignedFileUrl } from '@/lib/r2';

/**
 * GET /api/films/[filmId] - Get single film with signed URLs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filmId: string }> }
) {
  try {
    const { filmId } = await params;

    const { data: film, error } = await supabaseServer
      .from('films')
      .select('*, photo_file:files!photo_file_id(id, object_key, original_filename, content_type), video_file:files!video_file_id(id, object_key, original_filename, content_type)')
      .eq('id', filmId)
      .single();

    if (error || !film) {
      return NextResponse.json(
        { success: false, error: 'Film not found' },
        { status: 404 }
      );
    }

    let photoUrl: string | null = null;
    let videoUrl: string | null = null;

    if (film.photo_file?.object_key) {
      try {
        photoUrl = await getSignedFileUrl(film.photo_file.object_key, 3600);
      } catch (e) {
        console.error('[Films API] Photo URL error:', e);
      }
    }

    if (film.video_file?.object_key) {
      try {
        videoUrl = await getSignedFileUrl(film.video_file.object_key, 3600);
      } catch (e) {
        console.error('[Films API] Video URL error:', e);
      }
    }

    return NextResponse.json({
      success: true,
      film: {
        id: film.id,
        roomId: film.room_id,
        sessionId: film.session_id,
        photoUrl,
        videoUrl,
        qrCodeUrl: film.qr_code_url,
        createdAt: film.created_at,
        expiresAt: film.expires_at,
        status: film.status,
      },
    });
  } catch (error) {
    console.error('[Films API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/films/[filmId] - Soft delete a film
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ filmId: string }> }
) {
  try {
    const { filmId } = await params;

    const { error } = await supabaseServer
      .from('films')
      .update({ status: 'deleted' })
      .eq('id', filmId);

    if (error) {
      console.error('[Films API] Delete error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to delete film' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Films API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
