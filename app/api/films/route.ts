import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { getSignedFileUrl } from '@/lib/r2';
import type { FilmRecord } from '@/types/films';

/**
 * POST /api/films - Create a film record
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { roomId, sessionId, photoFileId, videoFileId } = body;

    if (!roomId) {
      return NextResponse.json(
        { success: false, error: 'roomId is required' },
        { status: 400 }
      );
    }

    const { data: film, error } = await supabaseServer
      .from('films')
      .insert({
        room_id: roomId,
        session_id: sessionId || null,
        photo_file_id: photoFileId || null,
        video_file_id: videoFileId || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[Films API] Insert error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to create film record' },
        { status: 500 }
      );
    }

    // Set QR code URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const qrCodeUrl = `${appUrl}/download/${film.id}`;

    await supabaseServer
      .from('films')
      .update({ qr_code_url: qrCodeUrl })
      .eq('id', film.id);

    return NextResponse.json({
      success: true,
      film: {
        id: film.id,
        roomId: film.room_id,
        sessionId: film.session_id,
        photoUrl: null,
        videoUrl: null,
        qrCodeUrl,
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
 * GET /api/films - List films
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'active';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const { data: films, error, count } = await supabaseServer
      .from('films')
      .select('*, photo_file:files!photo_file_id(id, object_key, original_filename, content_type), video_file:files!video_file_id(id, object_key, original_filename, content_type)', { count: 'exact' })
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Films API] Fetch error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch films' },
        { status: 500 }
      );
    }

    const filmsWithUrls = await Promise.all(
      (films || []).map(async (film: any) => {
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

        return {
          id: film.id,
          roomId: film.room_id,
          sessionId: film.session_id,
          photoUrl,
          videoUrl,
          qrCodeUrl: film.qr_code_url,
          createdAt: film.created_at,
          expiresAt: film.expires_at,
          status: film.status,
        };
      })
    );

    return NextResponse.json({
      success: true,
      films: filmsWithUrls,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[Films API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
