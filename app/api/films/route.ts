import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { supabaseServer } from '@/lib/supabase-server';
import { getSignedFileUrl } from '@/lib/r2';
import type { FilmRecord } from '@/types/films';

/**
 * POST /api/films - Create a film record
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (!rawBody) {
      console.error('[Films API] Empty request body');
      return NextResponse.json(
        { success: false, error: 'Request body is empty' },
        { status: 400 }
      );
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('[Films API] JSON parse error. Raw body:', rawBody);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const { id: clientId, roomId, sessionId, photoFileId, videoFileId } = body;

    if (!roomId) {
      return NextResponse.json(
        { success: false, error: 'roomId is required' },
        { status: 400 }
      );
    }

    let film: any = null;
    let insertError: any = null;

    // 클라이언트 제공 ID 또는 nanoid(8) 생성, unique 위반 시 1회 재시도
    for (let attempt = 0; attempt < 2; attempt++) {
      const id = (attempt === 0 && clientId) ? clientId : nanoid(8);
      const { data, error } = await supabaseServer
        .from('films')
        .insert({
          id,
          room_id: roomId,
          session_id: sessionId || null,
          photo_file_id: photoFileId || null,
          video_file_id: videoFileId || null,
        })
        .select()
        .single();

      if (!error) {
        film = data;
        break;
      }

      // unique violation (23505) → retry with new nanoid
      if (error.code === '23505' && attempt === 0) {
        console.warn('[Films API] nanoid collision, retrying...');
        continue;
      }

      insertError = error;
      break;
    }

    if (insertError || !film) {
      console.error('[Films API] Insert error:', insertError);
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
