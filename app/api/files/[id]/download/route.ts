import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { generateSignedUrl, downloadFile } from '@/lib/r2';
import type { FileRecord } from '@/types/files';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/files/[id]/download
 *
 * 파일 다운로드 API
 * - mode=redirect (default): Signed URL로 리다이렉트
 * - mode=stream: 서버에서 직접 스트리밍
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'redirect';

    console.log('[Download API] Request:', { id, mode });

    // 1. DB에서 파일 정보 조회
    const { data: file, error } = await supabaseServer
      .from('files')
      .select('*')
      .eq('id', id)
      .single<FileRecord>();

    if (error || !file) {
      console.error('[Download API] File not found:', id);
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    // 2. 상태 확인
    if (file.status !== 'uploaded') {
      console.error('[Download API] File not available:', file.status);
      return NextResponse.json(
        { success: false, error: 'File not available' },
        { status: 404 }
      );
    }

    console.log('[Download API] File found:', {
      id: file.id,
      filename: file.original_filename,
      objectKey: file.object_key,
    });

    // 3. 다운로드 모드에 따라 처리
    if (mode === 'stream') {
      // 서버에서 직접 파일 스트리밍
      console.log('[Download API] Streaming file from R2...');

      try {
        const buffer = await downloadFile(file.object_key);

        console.log('[Download API] File downloaded, size:', buffer.length);

        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            'Content-Type': file.content_type || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(file.original_filename)}"`,
            'Content-Length': buffer.length.toString(),
            'Cache-Control': 'private, max-age=3600',
          },
        });
      } catch (streamError) {
        console.error('[Download API] Stream error:', streamError);
        return NextResponse.json(
          { success: false, error: 'Failed to stream file' },
          { status: 500 }
        );
      }
    } else {
      // Signed URL 생성 후 리다이렉트 (기본)
      console.log('[Download API] Generating signed URL...');

      try {
        const signedUrl = await generateSignedUrl({
          key: file.object_key,
          expiresIn: 3600,
          filename: file.original_filename,
        });

        console.log('[Download API] Signed URL generated, redirecting...');

        // 리다이렉트
        return NextResponse.redirect(signedUrl, 302);
      } catch (signError) {
        console.error('[Download API] Signed URL error:', signError);
        return NextResponse.json(
          { success: false, error: 'Failed to generate download URL' },
          { status: 500 }
        );
      }
    }
  } catch (error) {
    console.error('[Download API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
