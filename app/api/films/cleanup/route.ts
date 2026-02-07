import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { deleteFromR2 } from '@/lib/r2';

export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find expired films
  const { data: expiredFilms } = await supabaseServer
    .from('films')
    .select('*, photo_file:files!photo_file_id(*), video_file:files!video_file_id(*)')
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString());

  let cleaned = 0;
  for (const film of expiredFilms || []) {
    // Delete R2 files
    if (film.photo_file?.object_key) await deleteFromR2(film.photo_file.object_key).catch(() => {});
    if (film.video_file?.object_key) await deleteFromR2(film.video_file.object_key).catch(() => {});

    // Update files status
    if (film.photo_file_id) {
      await supabaseServer.from('files').update({ status: 'deleted', deleted_at: new Date().toISOString() }).eq('id', film.photo_file_id);
    }
    if (film.video_file_id) {
      await supabaseServer.from('files').update({ status: 'deleted', deleted_at: new Date().toISOString() }).eq('id', film.video_file_id);
    }

    // Update film status
    await supabaseServer.from('films').update({ status: 'expired' }).eq('id', film.id);
    cleaned++;
  }

  return NextResponse.json({ success: true, cleaned });
}
